'use strict';

const { createSpanLookup, validateTables, loadSpanTables } = require('../src/lib/takeoffTables');

// Fixture table — NOT real engineering data, only exercises lookup LOGIC.
const FIXTURE = {
    version: 'test',
    members: [{
        member_type: 'dimensional_header',
        application: 'exterior_bearing_wall',
        rows: [
            { max_span_ft: 6, load_condition: 'roof+ceiling', size: '2-2x8', plies: 2 },
            { max_span_ft: 8, load_condition: 'roof+ceiling', size: '2-2x10', plies: 2 },
            { max_span_ft: 12, load_condition: 'roof+ceiling', size: '2-2x12', plies: 2 },
        ],
        source: { name: 'TEST', table: 'X', url: 'https://example.test' },
        disclaimer: 'Verify load and AHJ.',
    }],
};

describe('span lookup — covering row selection', () => {
    const { lookupSpan } = createSpanLookup(FIXTURE);

    test('returns the smallest row that covers the span', () => {
        const r = lookupSpan({ memberType: 'dimensional_header', application: 'exterior_bearing_wall', spanFt: 7, loadCondition: 'roof+ceiling' });
        expect(r.size).toBe('2-2x10'); // 7 ft → smallest max_span_ft >= 7 is the 8 ft row
        expect(r.verify).toBe(true);
        expect(r.source.name).toBe('TEST');
        expect(r.disclaimer).toMatch(/AHJ/);
    });

    test('exact boundary span uses that row, not the next up', () => {
        expect(lookupSpan({ memberType: 'dimensional_header', spanFt: 6, loadCondition: 'roof+ceiling' }).size).toBe('2-2x8');
    });
});

describe('span lookup — never interpolate / never invent', () => {
    const { lookupSpan } = createSpanLookup(FIXTURE);

    test('span beyond the largest row → confirm-with-supplier, NEVER a size', () => {
        const r = lookupSpan({ memberType: 'dimensional_header', spanFt: 20, loadCondition: 'roof+ceiling' });
        expect(r.size).toBeNull();
        expect(r.verify).toBe(true);
        expect(r.note).toMatch(/exceeds published table/);
    });

    test('unknown member type → confirm-with-supplier', () => {
        expect(lookupSpan({ memberType: 'LVL_header', spanFt: 7 }).size).toBeNull();
    });

    test('non-numeric span → confirm-with-supplier', () => {
        expect(lookupSpan({ memberType: 'dimensional_header', spanFt: 'wide' }).size).toBeNull();
    });
});

describe('span lookup — empty table (default shipped state)', () => {
    test('empty members yields confirm-with-supplier for any span', () => {
        const { lookupSpan } = createSpanLookup({ version: 'seed-empty', members: [] });
        const r = lookupSpan({ memberType: 'dimensional_header', spanFt: 8 });
        expect(r.size).toBeNull();
        expect(r.note).toMatch(/no table loaded/);
    });

    test('the shipped src/data/spanTables.json loads and validates', () => {
        const lookup = loadSpanTables();
        expect(lookup).not.toBeNull();
    });
});

describe('span lookup — shipped IRC/UDC dimensional header data', () => {
    const { lookupSpan } = loadSpanTables();
    const q = (spanFt) => lookupSpan({ memberType: 'dimensional_header', application: 'exterior_bearing_wall', spanFt, loadCondition: 'roof+ceiling' });

    test('a 3 ft window → 2-2x6 (cited)', () => {
        const r = q(3);
        expect(r.size).toBe('2-2x6');
        expect(r.source.table).toMatch(/R602\.7/);
    });
    test('a 6 ft patio door → 2-2x10', () => {
        expect(q(6).size).toBe('2-2x10');
    });
    test('a 10 ft span → 3-2x12 (largest cited row)', () => {
        expect(q(10).size).toBe('3-2x12');
    });
    test('a 16 ft garage span exceeds the table → confirm with supplier, NEVER a guessed LVL', () => {
        const r = q(16);
        expect(r.size).toBeNull();
        expect(r.verify).toBe(true);
        expect(r.note).toMatch(/exceeds published table/);
    });
});

describe('span lookup — shape validation fails loudly', () => {
    test('rows without a source citation throw', () => {
        expect(() => validateTables({ members: [{ member_type: 'x', rows: [{ max_span_ft: 8, size: '2-2x10' }] }] }))
            .toThrow(/no "source" citation/);
    });
    test('a row missing size throws', () => {
        expect(() => validateTables({ members: [{ member_type: 'x', rows: [{ max_span_ft: 8 }], source: { name: 'T' } }] }))
            .toThrow(/missing "size"/);
    });
    test('non-array members throws', () => {
        expect(() => validateTables({ members: {} })).toThrow(/"members" must be an array/);
    });
});
