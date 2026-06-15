const { FieldValue } = require('@google-cloud/firestore');
const crypto = require('crypto');

const { db } = require('./config');
const { sanitizeItemId } = require('./lib/sanitize');

// ── Token/cost accounting ─────────────────────────────────────────────
function computeLlmCost(usage = {}) {
    const promptTokens = usage.promptTokenCount || 0;
    const outputTokens = usage.candidatesTokenCount || 0;
    return {
        llmTokens: usage.totalTokenCount || (promptTokens + outputTokens),
        cost:      (promptTokens * 1.50 + outputTokens * 9.00) / 1000000,
    };
}

async function logInteraction({ source, inputType, processingTimeMs, cost, status, callerId, transcript, llmTokens, error }) {
    try {
        const docRef = db.collection('Ai_Interactions').doc();
        const docData = {
            id: docRef.id,
            timestamp: FieldValue.serverTimestamp(),
            source,
            inputType,
            processingTimeMs,
            cost,
            status,
            callerId: callerId || 'anonymous',
            transcript: transcript || '',
            llmTokens: llmTokens || 0
        };
        if (status === 'Failed' && error) docData.error = error;
        await docRef.set(docData);
        console.log(`[metrics] Logged interaction ${docRef.id} successfully.`);
        return docRef.id;
    } catch (err) {
        console.error('[metrics] Failed to log interaction:', err.message);
    }
}

// ── User helpers ──────────────────────────────────────────────────────
async function loadUser(phone) {
    try {
        const snap = await db.collection('users').doc(phone).get();
        if (!snap.exists) return null;
        return snap.data();
    } catch (err) {
        console.error(`loadUser(${phone}): Firestore error:`, err.message);
        return null;
    }
}

async function saveUser(phone, data) {
    await db.collection('users').doc(phone).set(data, { merge: true });
}

async function resolvePhoneByEmail(email) {
    const activeMatches  = new Set();
    const pendingMatches = new Set();

    const usersSnap = await db.collection('users').where('email', '==', email).get();
    usersSnap.forEach(doc => {
        const status = doc.data().status;
        if (status === 'active') activeMatches.add(doc.id);
        else pendingMatches.add(doc.id);
    });

    const settingsSnap = await db.collectionGroup('settings').where('contact_email', '==', email).get();
    for (const doc of settingsSnap.docs) {
        const userDocRef = doc.ref.parent.parent;
        if (userDocRef) {
            const userSnap = await userDocRef.get();
            if (userSnap.exists) {
                const status = userSnap.data().status;
                if (status === 'active') activeMatches.add(userDocRef.id);
                else pendingMatches.add(userDocRef.id);
            }
        }
    }

    if (activeMatches.size > 1) {
        console.error(`[CRITICAL] Multiple ACTIVE tenants mapped to email: ${email}. IDs: ${Array.from(activeMatches).join(', ')}`);
        return null;
    }
    if (activeMatches.size === 1) {
        const phone = Array.from(activeMatches)[0];
        await db.collection('users').doc(phone).set({ email }, { merge: true });
        return phone;
    }
    if (pendingMatches.size > 0) return Array.from(pendingMatches)[0];
    return null;
}

// ── Ledger helpers ────────────────────────────────────────────────────
async function loadLedger(phone) {
    try {
        const snap = await db.collection('ledgers').doc(phone).get();
        if (!snap.exists) return {};
        return snap.data();
    } catch (err) {
        console.error(`loadLedger(${phone}): Firestore error:`, err.message);
        return {};
    }
}

async function saveLedger(phone, data) {
    await db.collection('ledgers').doc(phone).set(data);
}

// ── Auth guard ────────────────────────────────────────────────────────
async function authorizePhone(phone) {
    if (!phone) return { authorized: false, reason: 'No phone number provided.' };
    const user = await loadUser(phone);
    if (!user) return { authorized: false, reason: 'Unauthorized user. Please contact admin.' };
    if (user.status !== 'active') return { authorized: false, reason: 'Your account is inactive. Please contact admin.' };
    return { authorized: true, user };
}

// Provenance-aware ledger merge lives in src/lib/ledgerMerge.js as a pure
// function so it stays unit-testable offline (requiring this file pulls in
// Firestore/Stripe init, which crashes in CI without credentials).
const { mergeLedgerItems, detectDuplicateWarnings } = require('./lib/ledgerMerge');

// ── Shared persistence layer ──────────────────────────────────────────
async function persistLedger({ projectName = 'General', scope_of_work = '', pricedMaterials = [], pricedLabor = [] }, phone, estimateId = null) {
    console.log(`[${phone}] Persisting ${pricedMaterials.length} material(s) + ${pricedLabor.length} labor item(s) into "${projectName}" (estimateId: ${estimateId})`);

    let docRef;
    let existingData = null;

    if (estimateId) {
        docRef = db.collection('users').doc(phone).collection('estimates').doc(estimateId);
        const snap = await docRef.get();
        if (snap.exists) existingData = snap.data();
    }

    if (!existingData) {
        const snap = await db.collection('users').doc(phone).collection('estimates').get();
        let matchedDoc = null;
        snap.forEach(doc => {
            const data = doc.data();
            if ((data.project_name || '').toLowerCase() === projectName.toLowerCase()) {
                matchedDoc = doc;
            }
        });
        if (matchedDoc) {
            docRef       = matchedDoc.ref;
            existingData = matchedDoc.data();
            estimateId   = matchedDoc.id;
        } else {
            estimateId = estimateId || 'est_' + crypto.randomBytes(8).toString('hex') + Date.now().toString(36);
            docRef = db.collection('users').doc(phone).collection('estimates').doc(estimateId);
        }
    }

    let currentItems    = existingData ? (existingData.items || []) : [];
    const currentMaterials = currentItems.filter(i => i.type === 'material' || !i.role);
    const currentLabor     = currentItems.filter(i => i.type === 'labor'    || i.role);

    const mergedMaterials = mergeLedgerItems(currentMaterials, pricedMaterials, {
        type: 'material', keyField: 'name', qtyField: 'quantity', rateField: 'unit_price',
    });
    const mergedLabor = mergeLedgerItems(currentLabor, pricedLabor, {
        type: 'labor', keyField: 'role', qtyField: 'hours', rateField: 'rate',
    });

    const mergedItems       = [...mergedMaterials, ...mergedLabor];
    const totalAmount       = mergedItems.reduce((s, i) => s + (i.total || 0), 0);
    const itemCount         = mergedItems.length;
    const finalProjectName  = existingData ? (existingData.project_name || projectName) : projectName;

    // Deterministic duplicate flagging over the FINAL merged ledger (look-alikes
    // that survived normalized auto-combine). Joins the response warnings channel.
    const duplicateWarnings = detectDuplicateWarnings(mergedItems);

    await docRef.set({
        project_name:  finalProjectName,
        scope_of_work: scope_of_work || null,
        items:         mergedItems,
        total_amount:  Math.round(totalAmount * 100) / 100,
        item_count:    itemCount,
        updatedAt:     FieldValue.serverTimestamp()
    }, { merge: true });

    return {
        projectName: finalProjectName,
        estimateId,
        itemCount:   pricedMaterials.length + pricedLabor.length,
        scope_of_work: scope_of_work || null,
        warnings:    duplicateWarnings,
    };
}

// ── Seed initial user on cold start ───────────────────────────────────
(async () => {
    const SEED_PHONE = process.env.SEED_PHONE;
    const SEED_EMAIL = process.env.SEED_EMAIL;
    if (!SEED_PHONE || !SEED_EMAIL) return;
    const snap = await db.collection('users').doc(SEED_PHONE).get();
    if (!snap.exists) {
        console.log('📋 No user found in Firestore — seeding initial user...');
        await saveUser(SEED_PHONE, {
            companyName: 'Lone Ranger Contracting',
            email:       SEED_EMAIL,
            zipCode:     process.env.SEED_ZIP || '00000',
            status:      'active',
        });
        console.log(`✅  Seeded user ${SEED_PHONE} in Firestore.`);
    }
})().catch(err => console.error('Seed error:', err.message));

module.exports = {
    computeLlmCost, logInteraction,
    loadUser, saveUser, resolvePhoneByEmail,
    loadLedger, saveLedger,
    authorizePhone, persistLedger, mergeLedgerItems,
};
