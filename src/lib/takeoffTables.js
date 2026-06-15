'use strict';

// ══════════════════════════════════════════════════════════════════════
//  STRUCTURAL SPAN-TABLE LOOKUP (data-driven, NEVER computed)
//
//  Headers / LVLs / trusses are NOT formula-able — their size depends on
//  published span tables (IRC, AWC, manufacturer load tables). This module
//  ONLY looks up a cited row; it never interpolates, extrapolates, or invents
//  a size. A span with no matching row returns a "confirm with supplier" note,
//  which the contractor sees as a disclaimer — that is the correct, liability-
//  safe behaviour, not a fabricated number.
//
//  Data lives in src/data/spanTables.json, populated from the Deep Research output
//  (docs/DEEP_RESEARCH_PROMPT.md). An empty members[] is valid.
// ══════════════════════════════════════════════════════════════════════

/**
 * Validate the loaded table shape so a malformed research import fails loudly
 * in CI rather than producing silent wrong lookups at runtime.
 * @param {object} tables
 * @throws if the shape is invalid
 */
function validateTables(tables) {
    if (!tables || typeof tables !== 'object') throw new Error('spanTables: root must be an object');
    if (!Array.isArray(tables.members)) throw new Error('spanTables: "members" must be an array');
    for (const m of tables.members) {
        if (!m.member_type) throw new Error('spanTables: a member is missing "member_type"');
        if (!Array.isArray(m.rows)) throw new Error(`spanTables: member "${m.member_type}" missing "rows" array`);
        if (m.rows.length && !m.source) throw new Error(`spanTables: member "${m.member_type}" has rows but no "source" citation`);
        for (const r of m.rows) {
            if (!Number.isFinite(Number(r.max_span_ft))) throw new Error(`spanTables: a "${m.member_type}" row has a non-numeric max_span_ft`);
            if (!r.size) throw new Error(`spanTables: a "${m.member_type}" row is missing "size"`);
        }
    }
    return tables;
}

/**
 * @param {object} tables parsed data/spanTables.json (or an injected fixture)
 * @returns {{ lookupSpan: Function }}
 */
function createSpanLookup(tables) {
    validateTables(tables);
    const members = tables.members || [];

    /**
     * Find the smallest table row that covers the span. Never interpolates;
     * an uncovered span returns a confirm-with-supplier object, never a size.
     *
     * @param {{ memberType: string, application?: string, spanFt: number, loadCondition?: string }} q
     * @returns {{ size: string|null, plies?: number, source?: object, verify: true, disclaimer?: string, note?: string }}
     */
    function lookupSpan({ memberType, application, spanFt, loadCondition }) {
        const span = Number(spanFt);
        const member = members.find((m) =>
            m.member_type === memberType && (!application || !m.application || m.application === application));

        const miss = (note) => ({ size: null, verify: true, note, source: member && member.source });

        if (!member || !member.rows.length) return miss('confirm size with supplier — no table loaded for this member');
        if (!Number.isFinite(span)) return miss('confirm size with supplier — span unknown');

        // Candidate rows that cover the span (and match the load case if given),
        // then pick the smallest covering span (the tightest valid row).
        const covering = member.rows
            .filter((r) => Number(r.max_span_ft) >= span && (!loadCondition || !r.load_condition || r.load_condition === loadCondition))
            .sort((a, b) => Number(a.max_span_ft) - Number(b.max_span_ft));

        if (!covering.length) return miss('confirm size with supplier — span exceeds published table');

        const row = covering[0];
        return {
            size: row.size,
            plies: row.plies,
            source: member.source,
            verify: true,
            disclaimer: member.disclaimer,
        };
    }

    return { lookupSpan };
}

/**
 * Convenience loader from the on-disk JSON. Returns null on read/parse error so
 * the pipeline degrades to no-header-lookup rather than crashing.
 * @param {string} [path]
 */
function loadSpanTables(path = require('path').join(__dirname, '..', 'data', 'spanTables.json')) {
    try {
        const raw = require('fs').readFileSync(path, 'utf8');
        return createSpanLookup(JSON.parse(raw));
    } catch (err) {
        console.error('takeoffTables: failed to load span tables —', err.message);
        return null;
    }
}

module.exports = { createSpanLookup, loadSpanTables, validateTables };
