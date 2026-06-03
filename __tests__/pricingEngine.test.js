'use strict';

const { createPricingEngine } = require('../src/lib/pricingEngine');

beforeAll(() => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
});
afterAll(() => jest.restoreAllMocks());

// ─── Mock helpers ─────────────────────────────────────────────────────────────

/**
 * Builds a chainable Firestore mock.
 * Each call to get() consumes the next snapshot from `snapshots` in order.
 * After the list is exhausted, subsequent calls return a default miss snapshot.
 */
function makeDb(...snapshots) {
    const miss = { exists: false, data: () => ({}) };
    const getImpl = jest.fn();
    for (const snap of snapshots) {
        getImpl.mockResolvedValueOnce(snap);
    }
    getImpl.mockResolvedValue(miss); // fallback for any extra calls

    const ref = { get: getImpl };
    ref.collection = jest.fn().mockReturnValue(ref);
    ref.doc        = jest.fn().mockReturnValue(ref);
    return ref;
}

/** Snapshot helpers */
const miss = { exists: false, data: () => ({}) };
const hit  = (data) => ({ exists: true, data: () => data });

/**
 * Builds a Gemini AI mock that returns the given JSON string as response text.
 */
function makeAi(responseText = '{ "rate": 75.00 }') {
    return {
        models: {
            generateContent: jest.fn().mockResolvedValue({ text: responseText }),
        },
    };
}

const PHONE = '+15551234567';
const ZIP   = '54601';

// ─── assignUnitPrice ──────────────────────────────────────────────────────────

describe('assignUnitPrice', () => {
    test('Priority 1 — uses explicit_user_price and makes no DB call', async () => {
        const db = makeDb();
        const { assignUnitPrice } = createPricingEngine({ db, ai: makeAi() });

        const item = { name: 'OSB', quantity: 10, unit: 'sheet', explicit_user_price: 15.00, estimated_unit_cost: 12.00 };
        const result = await assignUnitPrice(item, ZIP, PHONE);

        expect(result.unit_price).toBe(15);
        expect(result.price_source).toBe('override');
        expect(result.total).toBe(150);
        expect(db.get).not.toHaveBeenCalled();
    });

    test('Priority 1 — explicit_user_price of 0 is a valid price (free material)', async () => {
        const db = makeDb();
        const { assignUnitPrice } = createPricingEngine({ db, ai: makeAi() });

        const item = { name: 'Scrap Lumber', quantity: 5, unit: 'ea', explicit_user_price: 0, estimated_unit_cost: 5.00 };
        const result = await assignUnitPrice(item, ZIP, PHONE);

        expect(result.unit_price).toBe(0);
        expect(result.price_source).toBe('override');
        expect(result.total).toBe(0);
    });

    test('Priority 1 — string price "15.50" is coerced to a number', async () => {
        const db = makeDb();
        const { assignUnitPrice } = createPricingEngine({ db, ai: makeAi() });

        const item = { name: 'Lumber', quantity: 4, unit: 'ea', explicit_user_price: '15.50', estimated_unit_cost: 10 };
        const result = await assignUnitPrice(item, ZIP, PHONE);

        expect(result.unit_price).toBe(15.5);
        expect(result.price_source).toBe('override');
        expect(result.total).toBe(62);
    });

    test('Priority 1 — non-numeric "abc" explicit_user_price falls through to Priority 2', async () => {
        const db = makeDb(hit({ price: 9.99 }));
        const { assignUnitPrice } = createPricingEngine({ db, ai: makeAi() });

        const item = { name: 'Lumber', quantity: 2, unit: 'ea', explicit_user_price: 'abc', estimated_unit_cost: 5.00 };
        const result = await assignUnitPrice(item, ZIP, PHONE);

        expect(result.price_source).toBe('database');
        expect(result.unit_price).toBe(9.99);
    });

    test('Priority 2 — DB hit returns the stored price', async () => {
        const db = makeDb(hit({ price: 25.50 }));
        const { assignUnitPrice } = createPricingEngine({ db, ai: makeAi() });

        const item = { name: 'Drywall', quantity: 20, unit: 'sheet', explicit_user_price: null, estimated_unit_cost: 18.00 };
        const result = await assignUnitPrice(item, ZIP, PHONE);

        expect(result.unit_price).toBe(25.5);
        expect(result.price_source).toBe('database');
        expect(result.total).toBe(510);
    });

    test('Priority 3 — DB miss falls back to estimated_unit_cost', async () => {
        const db = makeDb(miss);
        const { assignUnitPrice } = createPricingEngine({ db, ai: makeAi() });

        const item = { name: 'Shingles', quantity: 10, unit: 'sq', trade: 'roofing', explicit_user_price: null, estimated_unit_cost: 120.00 };
        const result = await assignUnitPrice(item, ZIP, PHONE);

        expect(result.unit_price).toBe(120);
        expect(result.price_source).toBe('ai');
        expect(result.total).toBe(1200);
    });

    test('Priority 3 — missing estimated_unit_cost defaults to $0', async () => {
        const db = makeDb(miss);
        const { assignUnitPrice } = createPricingEngine({ db, ai: makeAi() });

        const item = { name: 'Unknown Material', quantity: 5, unit: 'ea', explicit_user_price: null, estimated_unit_cost: undefined };
        const result = await assignUnitPrice(item, ZIP, PHONE);

        expect(result.unit_price).toBe(0);
        expect(result.total).toBe(0);
    });

    test('Priority 2.5 — labor-general trade uses default_labor_rate from settings', async () => {
        // First get() is price_book miss; second get() is settings config hit
        const db = makeDb(miss, hit({ default_labor_rate: 65 }));
        const { assignUnitPrice } = createPricingEngine({ db, ai: makeAi() });

        const item = { name: 'General Labor', quantity: 8, unit: 'hr', trade: 'labor-general', explicit_user_price: null, estimated_unit_cost: 0 };
        const result = await assignUnitPrice(item, ZIP, PHONE);

        expect(result.unit_price).toBe(65);
        expect(result.price_source).toBe('database');
        expect(result.total).toBe(520);
    });

    test('Priority 2.5 — falls back to $55/hr default when settings doc is missing', async () => {
        const db = makeDb(miss, miss); // price_book miss, then config miss
        const { assignUnitPrice } = createPricingEngine({ db, ai: makeAi() });

        const item = { name: 'Labor', quantity: 4, unit: 'hr', trade: 'labor-general', explicit_user_price: null, estimated_unit_cost: 0 };
        const result = await assignUnitPrice(item, ZIP, PHONE);

        expect(result.unit_price).toBe(55);
    });

    test('Firestore error on price_book lookup falls through to Priority 3', async () => {
        const errRef = { get: jest.fn().mockRejectedValue(new Error('Firestore offline')) };
        errRef.collection = jest.fn().mockReturnValue(errRef);
        errRef.doc        = jest.fn().mockReturnValue(errRef);
        const { assignUnitPrice } = createPricingEngine({ db: errRef, ai: makeAi() });

        const item = { name: 'Lumber', quantity: 2, unit: 'ea', trade: 'framing', explicit_user_price: null, estimated_unit_cost: 5.00 };
        const result = await assignUnitPrice(item, ZIP, PHONE);

        expect(result.unit_price).toBe(5);
        expect(result.price_source).toBe('ai');
    });

    test('total is rounded to exactly 2 decimal places', async () => {
        const db = makeDb(hit({ price: 3.333 }));
        const { assignUnitPrice } = createPricingEngine({ db, ai: makeAi() });

        // 3 × 3.333 = 9.999 → rounds to 10.00
        const item = { name: 'Screws', quantity: 3, unit: 'box', explicit_user_price: null, estimated_unit_cost: 0 };
        const result = await assignUnitPrice(item, ZIP, PHONE);

        expect(result.total).toBe(10);
    });

    test('quantity 0 always produces total 0 regardless of unit_price', async () => {
        const db = makeDb(hit({ price: 99 }));
        const { assignUnitPrice } = createPricingEngine({ db, ai: makeAi() });

        const item = { name: 'Beam', quantity: 0, unit: 'ea', explicit_user_price: null, estimated_unit_cost: 0 };
        const result = await assignUnitPrice(item, ZIP, PHONE);

        expect(result.total).toBe(0);
    });
});

// ─── assignLaborRate ──────────────────────────────────────────────────────────

describe('assignLaborRate', () => {
    test('Priority 1 — explicit_user_price is used and DB + AI are never called', async () => {
        const db  = makeDb();
        const ai  = makeAi();
        const { assignLaborRate } = createPricingEngine({ db, ai });

        const result = await assignLaborRate({ role: 'Framer', hours: 8, explicit_user_price: 80 }, PHONE);

        expect(result.rate).toBe(80);
        expect(result.total).toBe(640);
        expect(db.get).not.toHaveBeenCalled();
        expect(ai.models.generateContent).not.toHaveBeenCalled();
    });

    test('Priority 1 — explicit_user_price of 0 is valid (volunteer / owner-labor)', async () => {
        const { assignLaborRate } = createPricingEngine({ db: makeDb(), ai: makeAi() });

        const result = await assignLaborRate({ role: 'Helper', hours: 4, explicit_user_price: 0 }, PHONE);

        expect(result.rate).toBe(0);
        expect(result.total).toBe(0);
    });

    test('Priority 2 — uses default_labor_rate from Firestore settings; AI is not called', async () => {
        const db = makeDb(hit({ default_labor_rate: 70 }));
        const ai = makeAi();
        const { assignLaborRate } = createPricingEngine({ db, ai });

        const result = await assignLaborRate({ role: 'Carpenter', hours: 6, explicit_user_price: null }, PHONE);

        expect(result.rate).toBe(70);
        expect(result.total).toBe(420);
        expect(ai.models.generateContent).not.toHaveBeenCalled();
    });

    test('Priority 3 — falls to AI when settings doc does not exist', async () => {
        const db = makeDb(miss);
        const ai = makeAi('{ "rate": 75 }');
        const { assignLaborRate } = createPricingEngine({ db, ai });

        const result = await assignLaborRate({ role: 'Electrician', hours: 5, explicit_user_price: null }, PHONE);

        expect(result.rate).toBe(75);
        expect(result.total).toBe(375);
        expect(ai.models.generateContent).toHaveBeenCalledTimes(1);
    });

    test('Priority 3 — AI call failure returns rate:0, total:0', async () => {
        const db = makeDb(miss);
        const ai = { models: { generateContent: jest.fn().mockRejectedValue(new Error('API down')) } };
        const { assignLaborRate } = createPricingEngine({ db, ai });

        const result = await assignLaborRate({ role: 'Plumber', hours: 3, explicit_user_price: null }, PHONE);

        expect(result.rate).toBe(0);
        expect(result.total).toBe(0);
    });

    test('null userPhone skips DB entirely and falls to AI', async () => {
        const db = makeDb();
        const ai = makeAi('{ "rate": 60 }');
        const { assignLaborRate } = createPricingEngine({ db, ai });

        const result = await assignLaborRate({ role: 'Painter', hours: 4, explicit_user_price: null }, null);

        expect(result.rate).toBe(60);
        expect(db.get).not.toHaveBeenCalled();
    });

    test('total is rounded to 2 decimal places', async () => {
        const db = makeDb(hit({ default_labor_rate: 55 }));
        const { assignLaborRate } = createPricingEngine({ db, ai: makeAi() });

        // 7.5 × 55 = 412.50 (exact)
        const result = await assignLaborRate({ role: 'General Laborer', hours: 7.5, explicit_user_price: null }, PHONE);

        expect(result.total).toBe(412.5);
    });

    test('AI response wrapped in ```json fences is parsed correctly', async () => {
        const db = makeDb(miss);
        const ai = makeAi('```json\n{ "rate": 85 }\n```');
        const { assignLaborRate } = createPricingEngine({ db, ai });

        const result = await assignLaborRate({ role: 'HVAC Tech', hours: 2, explicit_user_price: null }, PHONE);

        expect(result.rate).toBe(85);
        expect(result.total).toBe(170);
    });

    test('preserves all original fields on the returned object (spread)', async () => {
        const db = makeDb(hit({ default_labor_rate: 60 }));
        const { assignLaborRate } = createPricingEngine({ db, ai: makeAi() });

        const laborItem = { role: 'Mason', hours: 10, explicit_user_price: null, trade: 'masonry', notes: 'interior block' };
        const result = await assignLaborRate(laborItem, PHONE);

        expect(result.trade).toBe('masonry');
        expect(result.notes).toBe('interior block');
    });
});
