'use strict';

// §5(b): provenance fields stamped by the Takeoff engine MUST survive the Pricer
// untouched, or the ledger loses its formula badge / assemblyId before persist.
// This guards against a future whitelist refactor of the pricing engine silently
// dropping unknown fields.

const { createPricer } = require('../src/lib/pricer');

beforeAll(() => jest.spyOn(console, 'log').mockImplementation(() => {}));
afterAll(() => jest.restoreAllMocks());

// Minimal Firestore mock: no price_book hits, a configured default labor rate so
// the Pricer stays fully offline (no AI fallback).
function makeDb(defaultLaborRate = 60) {
    function node(segments) {
        return {
            collection: (c) => node([...segments, c]),
            doc: (d) => node([...segments, d]),
            get: () => {
                const path = segments.join('/');
                if (path.includes('settings')) return Promise.resolve({ exists: true, data: () => ({ default_labor_rate: defaultLaborRate }) });
                return Promise.resolve({ exists: false, data: () => ({}) });
            },
        };
    }
    return node([]);
}

test('provenance (quantity_source, assemblyId, provenance) round-trips through priceScope', async () => {
    const { priceScope } = createPricer({ db: makeDb(), ai: null });

    const scope = {
        projectName: 'Wall',
        materials: [{
            name: '2x4x10 SPF Stud', quantity: 13, unit: 'pcs', trade: 'framing',
            estimated_unit_cost: 4.5, explicit_user_price: null,
            quantity_source: 'formula', assemblyId: 'wall:abc',
            provenance: { formulaId: 'wall_frame.studs', inputs: { length_ft: 12 } },
        }],
        labor: [{
            role: 'Framing hours', hours: 8, explicit_user_price: null,
            quantity_source: 'formula', assemblyId: 'wall:abc',
        }],
    };

    const priced = await priceScope(scope, { userPhone: '+15551234567' });

    const mat = priced.materials[0];
    expect(mat.quantity_source).toBe('formula');
    expect(mat.assemblyId).toBe('wall:abc');
    expect(mat.provenance.formulaId).toBe('wall_frame.studs');
    expect(mat.unit_price).toBe(4.5);          // estimated_unit_cost fallback worked
    expect(mat.total).toBe(58.5);              // 13 × 4.5

    const lab = priced.labor[0];
    expect(lab.quantity_source).toBe('formula');
    expect(lab.assemblyId).toBe('wall:abc');
    expect(lab.rate).toBe(60);                 // default_labor_rate
    expect(lab.total).toBe(480);               // 8 × 60
});
