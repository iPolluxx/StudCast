'use strict';

const { mergeLedgerItems } = require('../src/lib/ledgerMerge');

const MAT = { type: 'material', keyField: 'name', qtyField: 'quantity', rateField: 'unit_price' };

const aiMat   = (name, quantity, unit_price = 5) => ({ name, quantity, unit_price, total: quantity * unit_price, quantity_source: 'ai' });
const formMat = (name, quantity, assemblyId, unit_price = 5) => ({ name, quantity, unit_price, total: quantity * unit_price, quantity_source: 'formula', assemblyId });

describe('mergeLedgerItems — AI lines (back-compat)', () => {
    test('same-named AI items add quantities (today’s behaviour)', () => {
        const out = mergeLedgerItems([aiMat('2x4 Stud', 10)], [aiMat('2x4 Stud', 5)], MAT);
        expect(out).toHaveLength(1);
        expect(out[0].quantity).toBe(15);
        expect(out[0].total).toBe(75);
    });

    test('a brand-new AI item is appended', () => {
        const out = mergeLedgerItems([aiMat('Nails', 2)], [aiMat('Caulk', 4)], MAT);
        expect(out.map((i) => i.name).sort()).toEqual(['Caulk', 'Nails']);
    });
});

describe('mergeLedgerItems — formula idempotency (§3)', () => {
    test('re-extracting the same assembly REPLACES, never doubles', () => {
        const current = [formMat('2x4x10 SPF Stud', 9, 'wall:abc')];
        const out = mergeLedgerItems(current, [formMat('2x4x10 SPF Stud', 11, 'wall:abc')], MAT);
        expect(out).toHaveLength(1);
        expect(out[0].quantity).toBe(11); // replaced, not 9+11=20
    });

    test('a formula line and an AI line of the same name stay distinct rows', () => {
        const current = [aiMat('2x4x10 SPF Stud', 4)];
        const out = mergeLedgerItems(current, [formMat('2x4x10 SPF Stud', 11, 'wall:abc')], MAT);
        expect(out).toHaveLength(2);
        expect(out.find((i) => i.quantity_source === 'ai').quantity).toBe(4);
        expect(out.find((i) => i.quantity_source === 'formula').quantity).toBe(11);
    });

    test('re-extracting assembly A does NOT purge assembly B’s formula lines', () => {
        const current = [formMat('Stud', 9, 'wall:A'), formMat('Sheet', 6, 'dry:B')];
        const out = mergeLedgerItems(current, [formMat('Stud', 11, 'wall:A')], MAT);
        expect(out).toHaveLength(2);
        expect(out.find((i) => i.assemblyId === 'dry:B').quantity).toBe(6); // untouched
        expect(out.find((i) => i.assemblyId === 'wall:A').quantity).toBe(11);
    });
});

describe('mergeLedgerItems — manual override survives (§3)', () => {
    test('an overridden line is neither purged nor recomputed on re-run', () => {
        const overridden = { ...formMat('Stud', 20, 'wall:A'), quantity_source: 'override' };
        const out = mergeLedgerItems([overridden], [formMat('Stud', 11, 'wall:A')], MAT);
        expect(out).toHaveLength(1);
        expect(out[0].quantity_source).toBe('override');
        expect(out[0].quantity).toBe(20); // user’s manual correction preserved
    });

    test('the fresh formula line is skipped when a part is overridden (no duplicate)', () => {
        const overridden = { ...formMat('Stud', 20, 'wall:A'), quantity_source: 'override' };
        const out = mergeLedgerItems([overridden, formMat('Plate', 3, 'wall:A')], [
            formMat('Stud', 11, 'wall:A'), formMat('Plate', 3, 'wall:A'),
        ], MAT);
        // Stud stays the overridden 20 (single row); Plate recomputes normally.
        expect(out.filter((i) => i.name === 'Stud')).toHaveLength(1);
        expect(out.find((i) => i.name === 'Stud').quantity).toBe(20);
        expect(out.find((i) => i.name === 'Plate').quantity).toBe(3);
    });
});

describe('mergeLedgerItems — labor parity', () => {
    const LAB = { type: 'labor', keyField: 'role', qtyField: 'hours', rateField: 'rate' };
    test('formula labor replaces by assemblyId; AI labor adds', () => {
        const current = [
            { role: 'Framing hours', hours: 8, rate: 55, total: 440, quantity_source: 'formula', assemblyId: 'wall:A' },
            { role: 'Cleanup', hours: 2, rate: 40, total: 80, quantity_source: 'ai' },
        ];
        const incoming = [
            { role: 'Framing hours', hours: 10, rate: 55, total: 550, quantity_source: 'formula', assemblyId: 'wall:A' },
            { role: 'Cleanup', hours: 1, rate: 40, total: 40, quantity_source: 'ai' },
        ];
        const out = mergeLedgerItems(current, incoming, LAB);
        expect(out.find((i) => i.role === 'Framing hours').hours).toBe(10); // replaced
        expect(out.find((i) => i.role === 'Cleanup').hours).toBe(3);        // 2 + 1 added
    });
});
