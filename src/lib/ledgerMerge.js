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
// Normalize a name/role for "same item" comparison: lowercase, collapse every
// run of non-alphanumerics to a single space, trim. So "2x4 Stud", "2x4  stud,"
// and "2x4 STUD" all normalize to "2x4 stud", while distinguishing tokens
// (2x4x8 vs 2x4x10) are preserved.
const normKey = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

function mergeLedgerItems(current, incoming, { type, keyField, qtyField, rateField }) {
    const sameKey = (a, b) => normKey(a[keyField]) === normKey(b[keyField]);
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

// ── Deterministic duplicate flagging (pure) ───────────────────────────
// After normalized auto-combine, the look-alikes that REMAIN are fuzzy or
// cross-provenance: a manual "SPF Stud" next to a formula "2x6x10ft SPF Stud",
// or "2x4 Stud" vs "2x4 SPF Stud". These need human judgment, so we flag rather
// than silently merge. Heuristic: one material's token set is fully contained in
// another's (≥2 tokens, to avoid matching on a single shared word like "nails").
// Two formula lines are NEVER flagged — same name across different assemblyIds is
// an intentional per-section breakdown (e.g. studs from two walls), not a dup.
//
// @param {object[]} items the FINAL merged ledger (materials + labor)
// @returns {{ itemId:string, severity:'warn', message:string }[]}
function detectDuplicateWarnings(items) {
    const mats = (items || []).filter((i) => i && i.name && (i.type === 'material' || !i.role));
    const isFormula = (i) => i.quantity_source === 'formula';
    const tokensOf = (i) => new Set(normKey(i.name).split(' ').filter(Boolean));
    const subset = (a, b) => a.size >= 2 && [...a].every((t) => b.has(t)); // a ⊆ b

    const warnings = [];
    const seen = new Set();
    for (let i = 0; i < mats.length; i++) {
        for (let j = i + 1; j < mats.length; j++) {
            const A = mats[i], B = mats[j];
            if (isFormula(A) && isFormula(B)) continue; // intentional per-section lines
            const ta = tokensOf(A), tb = tokensOf(B);
            if (!(subset(ta, tb) || subset(tb, ta))) continue;
            const pair = [A.name, B.name].map(normKey).sort().join('||');
            if (seen.has(pair)) continue;
            seen.add(pair);
            warnings.push({ itemId: A.name, severity: 'warn', message: `Possible duplicate of "${B.name}" — combine?` });
        }
    }
    return warnings;
}

module.exports = { mergeLedgerItems, detectDuplicateWarnings, normKey };
