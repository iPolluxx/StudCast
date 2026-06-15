'use strict';

// §8 — Accuracy eval. Runs each fixture job through the FULL pipeline twice:
//   • assembly path  — Estimator emits assemblies → Takeoff computes quantities
//   • baseline path  — Estimator emits loose materials with LLM-guessed counts
// then scores each against hand-authored ground truth. The formula path must be
// EXACT (gated); the baseline is reported for the before/after delta. A stubbed
// Estimator response per case keeps this deterministic (no live Gemini in CI).

const fs = require('fs');
const path = require('path');
const { createPipeline } = require('../src/lib/pipeline');

beforeAll(() => jest.spyOn(console, 'log').mockImplementation(() => {}));
afterAll(() => jest.restoreAllMocks());

const CASES = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'takeoff-eval', 'cases.json'), 'utf8'));

function makeDb(rate = 60) {
    const node = (segs) => ({
        collection: (c) => node([...segs, c]),
        doc: (d) => node([...segs, d]),
        get: () => Promise.resolve(segs.join('/').includes('settings')
            ? { exists: true, data: () => ({ default_labor_rate: rate }) }
            : { exists: false, data: () => ({}) }),
    });
    return node([]);
}

// Estimator returns the provided extraction JSON; Reviewer returns no warnings.
function makeAi(extractionObj) {
    return { models: { generateContent: jest.fn((req) => {
        const text = JSON.stringify(req.contents);
        if (text.includes('final QA pass')) return Promise.resolve({ text: '{ "warnings": [] }', usageMetadata: {} });
        return Promise.resolve({ text: JSON.stringify(extractionObj), usageMetadata: {} });
    }) } };
}

// accuracy = 1 - Σ|computed - expected| / Σ expected, over the expected items.
function score(materials, expected) {
    let absErr = 0, total = 0;
    for (const [name, want] of Object.entries(expected)) {
        const got = materials.find((m) => m.name === name);
        absErr += Math.abs((got ? got.quantity : 0) - want);
        total += want;
    }
    return total === 0 ? 1 : 1 - absErr / total;
}

async function run(extraction, input) {
    const { runPipeline } = createPipeline({ db: makeDb(), ai: makeAi(extraction) });
    const r = await runPipeline({ type: 'text', payload: input }, { userPhone: '+15551234567', zipCode: '54601' });
    return r.materials;
}

describe('takeoff accuracy eval', () => {
    test('formula path is EXACT on every fixture (gated)', async () => {
        for (const c of CASES) {
            const mats = await run(c.assemblyExtraction, c.input);
            expect(score(mats, c.expected)).toBe(1); // deterministic = perfect
        }
    });

    test('formula path beats the all-LLM baseline (reported delta)', async () => {
        const rows = [];
        for (const c of CASES) {
            const formulaAcc  = score(await run(c.assemblyExtraction, c.input), c.expected);
            const baselineAcc = score(await run(c.baselineExtraction, c.input), c.expected);
            rows.push({ id: c.id, baseline: baselineAcc.toFixed(3), formula: formulaAcc.toFixed(3) });
            expect(formulaAcc).toBeGreaterThanOrEqual(baselineAcc);
        }
        const avg = (k) => (rows.reduce((s, r) => s + Number(r[k]), 0) / rows.length).toFixed(3);
        // eslint-disable-next-line no-console
        console.info(`\n  Takeoff accuracy — baseline(all-LLM) ${avg('baseline')} → formula ${avg('formula')}`);
    });
});
