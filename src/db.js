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

// ── Provenance-aware ledger merge ─────────────────────────────────────
// Reconciles a freshly priced batch into the existing ledger items with three
// distinct rules keyed on `quantity_source`:
//   • formula  — DETERMINISTIC, idempotent. A re-extraction of the same assembly
//                (matched by `assemblyId`) REPLACES its prior lines instead of
//                adding to them, so "make that wall 14 ft" recomputes cleanly
//                rather than doubling. A line the user manually edited (demoted
//                to `override`) is never purged and never recomputed.
//   • ai / (default) — today's behaviour: additive merge by name/role.
// Formula lines are keyed on assemblyId+key, AI lines on key, so a formula stud
// line and an AI stud line of the same name stay distinct rows.
//
// @param {object[]} current  existing ledger items of one kind (materials OR labor)
// @param {object[]} incoming freshly priced items of the same kind
// @param {{ type:'material'|'labor', keyField:'name'|'role', qtyField:'quantity'|'hours', rateField:'unit_price'|'rate' }} shape
function mergeLedgerItems(current, incoming, { type, keyField, qtyField, rateField }) {
    const sameKey = (a, b) => String(a[keyField] || '').toLowerCase() === String(b[keyField] || '').toLowerCase();
    const isFormula = (i) => i.quantity_source === 'formula';

    const incomingFormula = incoming.filter(isFormula);
    const incomingOther    = incoming.filter((i) => !isFormula(i));
    const reextractedIds   = new Set(incomingFormula.map((i) => i.assemblyId).filter(Boolean));

    // 1. Purge stale formula lines whose assembly is being recomputed this run.
    //    Manually-overridden lines survive (the user took control of that part).
    const result = current.filter((i) => !(isFormula(i) && reextractedIds.has(i.assemblyId)));

    // 2. Insert the fresh formula expansion — never additive. Skip a part the
    //    user has manually corrected for this same assembly (respect the edit).
    for (const item of incomingFormula) {
        const overridden = result.find((i) =>
            i.quantity_source === 'override' && i.assemblyId === item.assemblyId && sameKey(i, item));
        if (overridden) continue;
        result.push({ ...item, type });
    }

    // 3. AI / loose lines: additive name/role merge, against non-formula lines only.
    for (const item of incomingOther) {
        const existing = result.find((i) => !isFormula(i) && sameKey(i, item));
        if (existing) {
            existing[qtyField] = (existing[qtyField] || 0) + (item[qtyField] || 0);
            existing.total = Math.round((existing[qtyField] || 0) * (existing[rateField] || 0) * 100) / 100;
        } else {
            result.push({ ...item, type });
        }
    }
    return result;
}

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
