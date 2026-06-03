'use strict';

const { parseGeminiJSON } = require('./sanitize');

const MODEL = 'gemini-3.5-flash';
const SEVERITIES = ['info', 'warn', 'critical'];

/**
 * Stage 3 — The Reviewer (validation layer, LLM boundary #2).
 *
 * A final, lightweight sanity pass over the fully priced ledger. It is strictly
 * NON-DESTRUCTIVE: it never edits the priced numbers, it only annotates. The
 * call is pinned to temperature 0 so the same ledger flags the same way on
 * repeat runs — as reproducible as an LLM judgment can be.
 *
 * It must never break the pipeline: any API/parse failure degrades to passing
 * the ledger through with a single informational note.
 *
 * @param {{ ai: import('@google/genai').GoogleGenAI }} deps
 * @returns {{ reviewLedger: (priced: object, ctx?: object) => Promise<ReviewResult> }}
 *
 * @typedef {{ itemId: string, severity: 'info'|'warn'|'critical', message: string }} Warning
 * @typedef {{ ledger: object, warnings: Warning[], status: 'ok'|'flagged' }} ReviewResult
 */
function createReviewer({ ai }) {

    /**
     * @param {object} priced - Stage 2 output: { materials, labor, totals, ... }
     * @returns {Promise<ReviewResult>}
     */
    async function reviewLedger(priced, _ctx = {}) {
        const materials = Array.isArray(priced.materials) ? priced.materials : [];
        const labor     = Array.isArray(priced.labor) ? priced.labor : [];

        // Flatten to a compact, id-bearing shape so the model can reference each
        // line by a stable id in its warnings. (itemId 'TOTAL' is reserved for
        // ledger-wide observations.)
        const lineItems = [
            ...materials.map((m) => ({ itemId: m.name, kind: 'material', quantity: m.quantity, unit_price: m.unit_price, total: m.total })),
            ...labor.map((l)     => ({ itemId: l.role, kind: 'labor', hours: l.hours, rate: l.rate, total: l.total })),
        ];

        const prompt =
            `You are a senior US construction estimator performing a final QA pass on a priced ledger.\n` +
            `Inspect the line items and the grand total. Flag ONLY genuine anomalies: unit prices implausibly ` +
            `high or low for the named item, quantity×price totals that do not add up, zero or missing prices on ` +
            `real materials, or labor rates outside a believable US market range. Do NOT invent problems — an ` +
            `unremarkable ledger MUST return an empty warnings array.\n\n` +
            `LEDGER: ${JSON.stringify({ items: lineItems, totals: priced.totals })}\n\n` +
            `Output ONLY valid JSON, no markdown:\n` +
            `{ "warnings": [ { "itemId": "must match a line item itemId, or 'TOTAL'", "severity": "info|warn|critical", "message": "short human explanation" } ] }`;

        let warnings = [];
        try {
            const response = await ai.models.generateContent({
                model:    MODEL,
                config:   { temperature: 0 },
                contents: { role: 'user', parts: [{ text: prompt }] },
            });
            const parsed = parseGeminiJSON(response.text);
            if (Array.isArray(parsed.warnings)) {
                warnings = parsed.warnings
                    .filter((w) => w && typeof w.message === 'string')
                    .map((w) => ({
                        itemId:   String(w.itemId || 'TOTAL'),
                        severity: SEVERITIES.includes(w.severity) ? w.severity : 'warn',
                        message:  w.message,
                    }));
            }
        } catch (err) {
            // The Reviewer is a safety net, not a gate — never let it sink the pipeline.
            console.error('[reviewer] validation call failed, passing ledger through:', err.message);
            warnings = [{ itemId: 'TOTAL', severity: 'info', message: 'Automated review unavailable; ledger was not validated.' }];
        }

        const flagged = warnings.some((w) => w.severity === 'warn' || w.severity === 'critical');

        return {
            ledger:   priced,                 // unchanged — non-destructive by contract
            warnings,
            status:   flagged ? 'flagged' : 'ok',
        };
    }

    return { reviewLedger };
}

module.exports = { createReviewer };
