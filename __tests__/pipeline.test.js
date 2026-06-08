'use strict';

const { createPipeline } = require('../src/lib/pipeline');

beforeAll(() => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
});
afterAll(() => jest.restoreAllMocks());

// ─── Mocks ──────────────────────────────────────────────────────────────────

const miss = { exists: false, data: () => ({}) };
const hit  = (data) => ({ exists: true, data: () => data });

/**
 * Concurrency-safe, path-aware Firestore mock.
 *
 * Real Firestore returns a fresh ref per collection()/doc() call; the engine
 * prices materials and labor concurrently via Promise.all, so the mock must NOT
 * share mutable path state across chains. Each collection()/doc() returns a new
 * immutable node carrying its own accumulated path segments.
 *
 * @param {{ priceBook?: Record<string, number>, settings?: number|null }} opts
 *   priceBook — map of sanitized itemId → stored price (a price_book hit)
 *   settings  — default_labor_rate value, or null for a missing settings doc
 */
function makeDb({ priceBook = {}, settings = null } = {}) {
    const getSpy = jest.fn();

    function node(segments) {
        return {
            collection: (c) => node([...segments, c]),
            doc:        (d) => node([...segments, d]),
            get: () => {
                getSpy();
                const path = segments.join('/');
                if (path.includes('price_book')) {
                    const id = segments[segments.length - 1];
                    return Promise.resolve(
                        Object.prototype.hasOwnProperty.call(priceBook, id)
                            ? hit({ price: priceBook[id] })
                            : miss
                    );
                }
                if (path.includes('settings')) {
                    return Promise.resolve(settings != null ? hit({ default_labor_rate: settings }) : miss);
                }
                return Promise.resolve(miss);
            },
        };
    }

    const root = node([]);
    root._getSpy = getSpy;
    return root;
}

/**
 * Gemini mock that dispatches on prompt content so a single ai object can serve
 * all three stages. The Estimator, Reviewer, and the engine's labor fallback
 * each carry a distinctive phrase we can key off.
 */
function makeAi({ extraction, review, laborRate } = {}) {
    const generateContent = jest.fn((req) => {
        const text = JSON.stringify(req.contents);
        if (text.includes('final QA pass')) {
            return Promise.resolve({
                text: review ?? '{ "warnings": [] }',
                usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 20, totalTokenCount: 120 },
            });
        }
        if (text.includes('standard market hourly rate')) {
            return Promise.resolve({ text: laborRate ?? '{ "rate": 60 }' });
        }
        // default: Stage 1 extraction
        return Promise.resolve({
            text: extraction ?? '{ "projectName": "General", "materials": [], "labor": [] }',
            usageMetadata: { promptTokenCount: 200, candidatesTokenCount: 50, totalTokenCount: 250 },
        });
    });
    return { models: { generateContent } };
}

const PHONE = '+15551234567';
const ZIP   = '54601';

const SAMPLE_EXTRACTION = JSON.stringify({
    projectName: 'Deck Rebuild',
    scope_of_work: 'Rebuild a 12x16 pressure-treated deck.',
    materials: [
        { name: '2x6x16 Pressure Treated Lumber', quantity: 20, unit: 'ea', trade: 'deck', estimated_unit_cost: 18.00, explicit_user_price: null },
        { name: '30-Year Architectural Shingles', quantity: 5, unit: 'sq', trade: 'roofing', estimated_unit_cost: 120.00, explicit_user_price: null },
    ],
    labor: [
        { role: 'Carpenter', hours: 8, explicit_user_price: null },
    ],
});

// ─── End-to-end happy path ────────────────────────────────────────────────────

describe('pipeline — happy path', () => {
    test('flows Estimator → Pricer → Reviewer and returns a priced, reviewed ledger', async () => {
        const db = makeDb({ settings: 65 }); // contractor has a default labor rate configured
        const ai = makeAi({ extraction: SAMPLE_EXTRACTION });
        const { runPipeline } = createPipeline({ db, ai });

        const result = await runPipeline(
            { type: 'text', payload: 'rebuild the back deck, 20 boards and some shingles, 8 hours of carpentry' },
            { userPhone: PHONE, zipCode: ZIP }
        );

        // Stage 1 carried through
        expect(result.projectName).toBe('Deck Rebuild');
        expect(result.scope_of_work).toMatch(/deck/i);
        expect(result.source).toBe('text');

        // Stage 2 priced every line deterministically
        expect(result.materials).toHaveLength(2);
        expect(result.materials[0].unit_price).toBe(18);   // estimated_unit_cost fallback
        expect(result.materials[0].total).toBe(360);       // 20 × 18
        expect(result.materials[1].total).toBe(600);       // 5 × 120
        expect(result.labor[0].rate).toBe(65);             // default_labor_rate from settings
        expect(result.labor[0].total).toBe(520);           // 8 × 65
        expect(result.totals.grandTotal).toBe(1480);       // 360 + 600 + 520

        // Stage 3 produced a verdict
        expect(result.status).toBe('ok');
        expect(result.warnings).toEqual([]);

        // Token usage is aggregated across both LLM boundaries (Estimator + Reviewer)
        // so the caller can record real cost/token metrics. Pricer adds none here.
        expect(result.usage.promptTokenCount).toBe(300);     // 200 + 100
        expect(result.usage.candidatesTokenCount).toBe(70);  // 50 + 20
        expect(result.usage.totalTokenCount).toBe(370);      // 250 + 120
    });

    test('CRITICAL: Pricer spends ZERO AI tokens when a default labor rate exists', async () => {
        const db = makeDb({ settings: 65 });
        const ai = makeAi({ extraction: SAMPLE_EXTRACTION });
        const { runPipeline } = createPipeline({ db, ai });

        await runPipeline({ type: 'text', payload: 'x' }, { userPhone: PHONE, zipCode: ZIP });

        // Exactly two LLM calls total: Stage 1 (extraction) + Stage 3 (review).
        // Stage 2 must not touch the model — no labor-rate fallback fired.
        expect(ai.models.generateContent).toHaveBeenCalledTimes(2);
        const prompts = ai.models.generateContent.mock.calls.map((c) => JSON.stringify(c[0].contents));
        expect(prompts.some((p) => p.includes('standard market hourly rate'))).toBe(false);
    });

    test('Reviewer call is pinned to temperature 0 for reproducibility', async () => {
        const db = makeDb({ settings: 65 });
        const ai = makeAi({ extraction: SAMPLE_EXTRACTION });
        const { runPipeline } = createPipeline({ db, ai });

        await runPipeline({ type: 'text', payload: 'x' }, { userPhone: PHONE, zipCode: ZIP });

        const reviewCall = ai.models.generateContent.mock.calls
            .find((c) => JSON.stringify(c[0].contents).includes('final QA pass'));
        expect(reviewCall).toBeDefined();
        expect(reviewCall[0].config).toEqual({ temperature: 0 });
    });
});

// ─── Reviewer flagging ────────────────────────────────────────────────────────

describe('pipeline — reviewer flagging', () => {
    test('a flagged anomaly surfaces as a warning and sets status to "flagged"', async () => {
        const db = makeDb({ settings: 65 });
        const review = JSON.stringify({
            warnings: [{ itemId: '2x6x16 Pressure Treated Lumber', severity: 'critical', message: 'Unit price implausibly high.' }],
        });
        const ai = makeAi({ extraction: SAMPLE_EXTRACTION, review });
        const { runPipeline } = createPipeline({ db, ai });

        const result = await runPipeline({ type: 'text', payload: 'x' }, { userPhone: PHONE, zipCode: ZIP });

        expect(result.status).toBe('flagged');
        expect(result.warnings).toHaveLength(1);
        expect(result.warnings[0].severity).toBe('critical');
        // Non-destructive: the priced numbers are untouched by the review.
        expect(result.materials[0].total).toBe(360);
    });

    test('malformed reviewer severity is coerced to "warn"', async () => {
        const db = makeDb({ settings: 65 });
        const review = JSON.stringify({ warnings: [{ itemId: 'TOTAL', severity: 'bogus', message: 'odd' }] });
        const ai = makeAi({ extraction: SAMPLE_EXTRACTION, review });
        const { runPipeline } = createPipeline({ db, ai });

        const result = await runPipeline({ type: 'text', payload: 'x' }, { userPhone: PHONE, zipCode: ZIP });

        expect(result.warnings[0].severity).toBe('warn');
        expect(result.status).toBe('flagged');
    });

    test('reviewer API failure degrades gracefully — pipeline still returns a ledger', async () => {
        const db = makeDb({ settings: 65 });
        const generateContent = jest.fn((req) => {
            const text = JSON.stringify(req.contents);
            if (text.includes('final QA pass')) return Promise.reject(new Error('model overloaded'));
            return Promise.resolve({ text: SAMPLE_EXTRACTION });
        });
        const ai = { models: { generateContent } };
        const { runPipeline } = createPipeline({ db, ai });

        const result = await runPipeline({ type: 'text', payload: 'x' }, { userPhone: PHONE, zipCode: ZIP });

        // Ledger survives; a single info note records that validation was skipped.
        expect(result.materials).toHaveLength(2);
        expect(result.status).toBe('ok');
        expect(result.warnings[0].severity).toBe('info');
        expect(result.warnings[0].message).toMatch(/unavailable/i);
    });
});

// ─── Bad / edge-case data ─────────────────────────────────────────────────────

describe('pipeline — resilience', () => {
    test('empty extraction yields an empty, $0 ledger without throwing', async () => {
        const db = makeDb({ settings: 65 });
        const ai = makeAi({ extraction: '{ "projectName": "Empty Job", "materials": [], "labor": [] }' });
        const { runPipeline } = createPipeline({ db, ai });

        const result = await runPipeline({ type: 'text', payload: 'nothing actionable' }, { userPhone: PHONE, zipCode: ZIP });

        expect(result.materials).toEqual([]);
        expect(result.labor).toEqual([]);
        expect(result.totals.grandTotal).toBe(0);
        expect(result.status).toBe('ok');
    });

    test('extraction missing materials/labor arrays is tolerated (defaults to empty)', async () => {
        const db = makeDb({ settings: 65 });
        const ai = makeAi({ extraction: '{ "projectName": "Sparse" }' });
        const { runPipeline } = createPipeline({ db, ai });

        const result = await runPipeline({ type: 'text', payload: 'x' }, { userPhone: PHONE, zipCode: ZIP });

        expect(result.materials).toEqual([]);
        expect(result.labor).toEqual([]);
        expect(result.totals.grandTotal).toBe(0);
    });

    test('explicit_user_price overrides the waterfall and skips the DB', async () => {
        const db = makeDb({ settings: 65 });
        const extraction = JSON.stringify({
            projectName: 'Override Job',
            materials: [{ name: 'OSB Sheathing', quantity: 10, unit: 'sheet', trade: 'framing', estimated_unit_cost: 12, explicit_user_price: 15 }],
            labor: [],
        });
        const ai = makeAi({ extraction });
        const { runPipeline } = createPipeline({ db, ai });

        const result = await runPipeline({ type: 'text', payload: 'x' }, { userPhone: PHONE, zipCode: ZIP });

        expect(result.materials[0].unit_price).toBe(15);
        expect(result.materials[0].price_source).toBe('override');
        expect(result.materials[0].total).toBe(150);
    });

    test('price_book hit takes priority over the AI estimate', async () => {
        const db = makeDb({ priceBook: { '2x6x16_pressure_treated_lumber': 22.5 }, settings: 65 });
        const ai = makeAi({ extraction: SAMPLE_EXTRACTION });
        const { runPipeline } = createPipeline({ db, ai });

        const result = await runPipeline({ type: 'text', payload: 'x' }, { userPhone: PHONE, zipCode: ZIP });

        const lumber = result.materials.find((m) => m.name.includes('Pressure Treated'));
        expect(lumber.unit_price).toBe(22.5);
        expect(lumber.price_source).toBe('database');
        expect(lumber.total).toBe(450); // 20 × 22.5
    });
});
