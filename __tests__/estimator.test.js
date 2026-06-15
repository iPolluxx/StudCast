'use strict';

const { createEstimator, ASSEMBLY_TYPES } = require('../src/lib/estimator');

beforeAll(() => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterAll(() => jest.restoreAllMocks());

/** Minimal Gemini mock that returns a fixed extraction payload. */
function makeAi(extractionJson) {
    return {
        models: {
            generateContent: jest.fn(() => Promise.resolve({
                text: extractionJson,
                usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1, totalTokenCount: 2 },
            })),
        },
    };
}

const WALL_ASSEMBLY = {
    type: 'wall_frame',
    confidence: 0.9,
    params: {
        length_ft: 12, height_ft: 10, stud_spacing_in: 16, wall_type: 'exterior',
        openings: [{ kind: 'door', width_ft: 3, height_ft: 6.67, count: 1 }],
    },
    estimated_unit_costs: { '2x4x10 SPF Stud': 4.5, '2x4x12 Plate': 6.0 },
    fallback_quantities: { '2x4x10 SPF Stud': 13 },
};

describe('estimator — assembly extraction', () => {
    test('parses a valid assembly through to scope.assemblies', async () => {
        const ai = makeAi(JSON.stringify({
            projectName: 'Garage Wall',
            scope_of_work: 'Frame one exterior wall.',
            assemblies: [WALL_ASSEMBLY],
            materials: [],
            labor: [],
        }));
        const { extractScope } = createEstimator({ ai });

        const scope = await extractScope({ type: 'text', payload: 'frame a 12x10 wall' });

        expect(scope.assemblies).toHaveLength(1);
        expect(scope.assemblies[0].type).toBe('wall_frame');
        expect(scope.assemblies[0].params.length_ft).toBe(12);
    });

    test('drops assemblies whose type is outside the closed enum (no inventing types)', async () => {
        const ai = makeAi(JSON.stringify({
            projectName: 'Mixed',
            assemblies: [
                WALL_ASSEMBLY,
                { type: 'roof_truss_system', confidence: 0.8, params: { span_ft: 28 } }, // not in v1 enum
                { type: null, params: {} },                                              // malformed
            ],
            materials: [],
            labor: [],
        }));
        const { extractScope } = createEstimator({ ai });

        const scope = await extractScope({ type: 'text', payload: 'x' });

        expect(scope.assemblies).toHaveLength(1);
        expect(scope.assemblies[0].type).toBe('wall_frame');
        expect(scope.assemblies.every((a) => ASSEMBLY_TYPES.includes(a.type))).toBe(true);
    });

    test('defaults assemblies to [] when the field is absent (back-compat)', async () => {
        const ai = makeAi(JSON.stringify({ projectName: 'Sparse', materials: [], labor: [] }));
        const { extractScope } = createEstimator({ ai });

        const scope = await extractScope({ type: 'text', payload: 'x' });

        expect(scope.assemblies).toEqual([]);
        expect(scope.materials).toEqual([]);
    });

    test('keeps loose materials alongside assemblies (mixed scope)', async () => {
        const ai = makeAi(JSON.stringify({
            projectName: 'Mixed',
            assemblies: [WALL_ASSEMBLY],
            materials: [{ name: 'Exterior Caulk Tube', quantity: 4, unit: 'ea', trade: 'siding', estimated_unit_cost: 6, explicit_user_price: null }],
            labor: [],
        }));
        const { extractScope } = createEstimator({ ai });

        const scope = await extractScope({ type: 'text', payload: 'x' });

        expect(scope.assemblies).toHaveLength(1);
        expect(scope.materials).toHaveLength(1);
        expect(scope.materials[0].name).toMatch(/caulk/i);
    });
});
