'use strict';

// ── Provenance-aware ledger merge (pure — no I/O, no infra) ───────────
// Lives in src/lib so it is unit-testable fully offline (requiring src/db.js
// would transitively initialize Firestore/Stripe and crash in CI without creds).
//
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

module.exports = { mergeLedgerItems };
