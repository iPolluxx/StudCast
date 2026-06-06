'use strict';

const { sanitizeItemId, parseGeminiJSON } = require('./sanitize');
const { findMarketKey } = require('./menardsScraper');

/**
 * Factory that creates the pricing engine bound to specific db and ai instances.
 *
 * Using a factory (dependency injection) keeps both functions fully testable:
 * pass mock db/ai objects in tests; pass the live Firestore/Gemini clients in production.
 *
 * @param {{ db: FirestoreInstance, ai: GoogleGenAIInstance }} deps
 * @returns {{ assignUnitPrice, assignLaborRate }}
 */
function createPricingEngine({ db, ai }) {

    /**
     * Assigns a unit_price to a material item using a strict 3-priority waterfall.
     *
     * Priority 1 — Explicit user-dictated price (hallucination-safe):
     *   If item.explicit_user_price is a valid finite number, use it and skip all DB reads.
     *
     * Priority 2 — Per-user private price_book subcollection:
     *   Reads users/{userPhone}/price_book/{sanitizedId}.
     *
     * Priority 2.5 — Default labor rate for labor-typed items:
     *   If the item is trade:'labor-general' or type:'labor', reads the contractor's
     *   configured default_labor_rate from settings (falls back to $55/hr).
     *
     * Priority 3 — AI-estimated fallback:
     *   Falls back to item.estimated_unit_cost embedded by the extraction prompt.
     *
     * Mutates item in place AND returns it for convenience.
     */
    async function assignUnitPrice(item, userZipCode, userPhone) {
        const itemId = sanitizeItemId(item.name);

        // ── Priority 1: Explicit user-dictated price ──────────────────────
        if (item.explicit_user_price !== null && item.explicit_user_price !== undefined
                && Number.isFinite(Number(item.explicit_user_price))) {
            item.unit_price   = Number(item.explicit_user_price);
            item.price_source = 'override';
            item.total        = Math.round((item.quantity || 0) * item.unit_price * 100) / 100;
            return item;
        }

        // ── Priority 2: Per-user private price_book subcollection ─────────
        try {
            const snap = await db
                .collection('users').doc(userPhone)
                .collection('price_book').doc(itemId)
                .get();
            if (snap.exists) {
                item.unit_price   = Number(snap.data().price) || 0;
                item.price_source = 'database';
                item.total        = Math.round((item.quantity || 0) * item.unit_price * 100) / 100;
                return item;
            }
        } catch (err) {
            console.error(`[price_book] Firestore error for "${item.name}":`, err.message);
        }

        // ── Priority 2.5: Menards market price (shared global cache) ─────
        try {
            const marketKey = findMarketKey(item.name);
            if (marketKey) {
                const snap = await db.collection('market_prices').doc('menards')
                                     .collection('items').doc(marketKey).get();
                if (snap.exists && snap.data().price && !snap.data().stale) {
                    const d = snap.data();
                    item.unit_price    = Number(d.price);
                    item.price_source  = 'market';
                    item.market_source = 'menards';
                    item.market_age_h  = Math.round((Date.now() - d.scraped_at.toDate()) / 36e5);
                    item.total         = Math.round((item.quantity || 0) * item.unit_price * 100) / 100;
                    return item;
                }
            }
        } catch (err) {
            console.error(`[market_prices] lookup error for "${item.name}":`, err.message);
        }

        // ── Priority 4: Default labor rate for labor items ───────────────
        if (item.trade === 'labor-general' || item.type === 'labor') {
            let defaultLaborRate = 55;
            try {
                const configSnap = await db
                    .collection('users').doc(userPhone)
                    .collection('settings').doc('config')
                    .get();
                if (configSnap.exists) {
                    defaultLaborRate = Number(configSnap.data().default_labor_rate) || 55;
                }
            } catch (err) {
                console.error('[pricing] Failed to load settings for default labor rate:', err.message);
            }
            item.unit_price   = defaultLaborRate;
            item.price_source = 'database';
            item.total        = Math.round((item.quantity || 0) * item.unit_price * 100) / 100;
            return item;
        }

        // ── Priority 5: AI-estimated fallback ────────────────────────────
        item.unit_price   = Number(item.estimated_unit_cost) || 0;
        item.price_source = 'ai';
        item.total        = Math.round((item.quantity || 0) * item.unit_price * 100) / 100;
        return item;
    }

    /**
     * Assigns a market hourly rate and total to a labor item.
     *
     * Priority 1 — Explicit user-dictated rate (skips DB and AI).
     * Priority 2 — default_labor_rate from the contractor's Firestore settings.
     * Priority 3 — Gemini AI estimate (falls back to rate:0 on API failure).
     */
    async function assignLaborRate(laborItem, userPhone) {
        // ── Priority 1: Explicit user-dictated rate ───────────────────────
        if (laborItem.explicit_user_price !== null && laborItem.explicit_user_price !== undefined
                && Number.isFinite(Number(laborItem.explicit_user_price))) {
            const rate = Number(laborItem.explicit_user_price);
            return {
                ...laborItem,
                rate,
                total: Math.round(laborItem.hours * rate * 100) / 100,
            };
        }

        // ── Priority 2: Default labor rate from Firestore settings ────────
        let defaultLaborRate = null;
        if (userPhone) {
            try {
                const configSnap = await db
                    .collection('users').doc(userPhone)
                    .collection('settings').doc('config')
                    .get();
                if (configSnap.exists) {
                    defaultLaborRate = Number(configSnap.data().default_labor_rate);
                }
            } catch (_) {}
        }

        if (defaultLaborRate !== null && defaultLaborRate !== undefined && !isNaN(defaultLaborRate)) {
            return {
                ...laborItem,
                rate:  defaultLaborRate,
                total: Math.round(laborItem.hours * defaultLaborRate * 100) / 100,
            };
        }

        // ── Priority 3: Gemini AI estimate ────────────────────────────────
        const prompt =
            `You are a US construction cost estimator. What is the standard market hourly rate (USD) for a "${laborItem.role}"? ` +
            `Output ONLY valid JSON with no markdown: { "rate": 0.00 }`;
        try {
            const response = await ai.models.generateContent({
                model:    'gemini-3.5-flash',
                contents: { role: 'user', parts: [{ text: prompt }] },
            });
            const parsed = parseGeminiJSON(response.text);
            const rate   = Number(parsed.rate) || 0;
            return {
                ...laborItem,
                rate,
                total: Math.round(laborItem.hours * rate * 100) / 100,
            };
        } catch (err) {
            console.error(`assignLaborRate: failed for "${laborItem.role}", defaulting to $0:`, err.message);
            return { ...laborItem, rate: 0, total: 0 };
        }
    }

    return { assignUnitPrice, assignLaborRate };
}

module.exports = { createPricingEngine };
