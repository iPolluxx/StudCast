'use strict';

const { createTakeoffEngine } = require('../src/lib/takeoffEngine');

const wall = (params, extra = {}) => ({ type: 'wall_frame', confidence: 0.9, params, estimated_unit_costs: {}, fallback_quantities: {}, ...extra });
const findMat = (scope, re) => scope.materials.find((m) => re.test(m.name));

describe('takeoffEngine — wall_frame formulas (exact counts)', () => {
    const { expandScope } = createTakeoffEngine();

    test('12×10 @16" OC, 2 corners, no openings → 16 studs, 3 plates, 2.13 labor hrs', () => {
        const out = expandScope({ assemblies: [wall({ length_ft: 12, height_ft: 10, stud_spacing_in: 16, wall_type: 'exterior', openings: [] })], materials: [], labor: [] });
        // field = ceil(144/16)=9, +1 closing, +2*3 corners = 16
        expect(findMat(out, /Stud/).quantity).toBe(16);
        // plates = ceil(12*3/16) = ceil(2.25) = 3
        expect(findMat(out, /Plate/).quantity).toBe(3);
        // labor = (12*10)/56.25 = 2.133 → 2.13
        expect(out.labor[0].hours).toBe(2.13);
        expect(out.labor[0].role).toMatch(/framing/i);
    });

    test('framed wall includes framing nails by the box, no drywall/sheathing', () => {
        const out = expandScope({ assemblies: [wall({ length_ft: 12, height_ft: 10, stud_spacing_in: 16, wall_type: 'exterior', openings: [] })], materials: [], labor: [] });
        const nails = findMat(out, /Framing Nails/);
        expect(nails.unit).toBe('box');
        expect(nails.quantity).toBe(1);              // 16 studs * 20 = 320 → ceil(320/2000) = 1 box
        expect(nails.trade).toBe('framing');
        // a bare wall is framing only — engine never invents finishes
        expect(findMat(out, /Drywall/)).toBeUndefined();
        expect(findMat(out, /OSB|Sheathing/)).toBeUndefined();
    });

    test('one opening adds 4 studs (2 king + 2 jack)', () => {
        const out = expandScope({ assemblies: [wall({ length_ft: 12, height_ft: 10, stud_spacing_in: 16, wall_type: 'exterior', openings: [{ kind: 'door', width_ft: 3, height_ft: 6.67, count: 1 }] })], materials: [], labor: [] });
        expect(findMat(out, /Stud/).quantity).toBe(20);     // 16 + 4
    });

    test('explicit corners=0 (lone partition) drops the corner studs', () => {
        const out = expandScope({ assemblies: [wall({ length_ft: 12, height_ft: 10, stud_spacing_in: 16, corners: 0, wall_type: 'interior', openings: [] })], materials: [], labor: [] });
        expect(findMat(out, /Stud/).quantity).toBe(10);     // 9 + 1 + 0
    });

    test('stud_size labels studs and plates 2x6 (count unchanged)', () => {
        const out = expandScope({ assemblies: [wall({ length_ft: 12, height_ft: 10, stud_spacing_in: 16, stud_size: '2x6', wall_type: 'exterior', openings: [] })], materials: [], labor: [] });
        expect(findMat(out, /Stud/).name).toMatch(/^2x6x10ft SPF Stud$/);
        expect(findMat(out, /Plate/).name).toMatch(/^2x6x16ft SPF Plate$/);
        expect(findMat(out, /Stud/).quantity).toBe(16); // identical to 2x4 — spacing-based
    });

    test('invalid stud_size falls back to the 2x4 default', () => {
        const out = expandScope({ assemblies: [wall({ length_ft: 12, height_ft: 10, stud_size: 'plywood', openings: [] })], materials: [], labor: [] });
        expect(findMat(out, /Stud/).name).toMatch(/^2x4x/);
    });

    test('24" OC spacing yields fewer studs than 16"', () => {
        const out = expandScope({ assemblies: [wall({ length_ft: 12, height_ft: 10, stud_spacing_in: 24, wall_type: 'exterior', openings: [] })], materials: [], labor: [] });
        // ceil(144/24)=6, +1, +2*3 = 13
        expect(findMat(out, /Stud/).quantity).toBe(13);
    });

    test('stamps formula provenance + assemblyId + a $0-proof estimated_unit_cost', () => {
        const { expandScope: ex } = createTakeoffEngine();
        const out = ex({ assemblies: [wall({ length_ft: 12, height_ft: 10, openings: [] }, { estimated_unit_costs: { '2x4x10ft SPF Stud': 5.25 } })], materials: [], labor: [] });
        const stud = findMat(out, /Stud/);
        expect(stud.quantity_source).toBe('formula');
        expect(stud.assemblyId).toBe('asm:wall_frame:0');
        expect(stud.provenance.formulaId).toBe('wall_frame.studs');
        expect(stud.estimated_unit_cost).toBe(5.25);          // LLM hint used
        expect(stud.explicit_user_price).toBeNull();
        // plate has no hint → conservative default, never 0
        expect(findMat(out, /Plate/).estimated_unit_cost).toBe(6.0);
    });
});

describe('takeoffEngine — drywall & sheathing', () => {
    const { expandScope } = createTakeoffEngine();
    test('drywall 12×10 both sides → 9 sheets + finishing consumables', () => {
        const out = expandScope({ assemblies: [{ type: 'drywall', confidence: 0.9, params: { length_ft: 12, height_ft: 10, sides: 2 }, estimated_unit_costs: {}, fallback_quantities: {} }], materials: [], labor: [] });
        // net=240; ceil(240*1.10/32)=ceil(8.25)=9
        expect(findMat(out, /Drywall/).quantity).toBe(9);
        // compound: ceil((240/100)*3/4.5)=ceil(1.6)=2; tape: ceil(240/500)=1
        expect(findMat(out, /Compound/).quantity).toBe(2);
        expect(findMat(out, /Tape/).quantity).toBe(1);
        // screws: 9*36=324 count → ceil(324/1000)=1 box (not 324 loose screws priced as boxes)
        const screws = findMat(out, /Screws/);
        expect(screws.quantity).toBe(1);
        expect(screws.unit).toBe('box');
        expect(screws.name).toMatch(/box/);
    });
    test('exterior sheathing 12×10 → 5 sheets + wrap + nails by the box', () => {
        const out = expandScope({ assemblies: [{ type: 'exterior_sheathing', confidence: 0.9, params: { length_ft: 12, height_ft: 10 }, estimated_unit_costs: {}, fallback_quantities: {} }], materials: [], labor: [] });
        // net=120; ceil(120*1.10/32)=ceil(4.125)=5
        expect(findMat(out, /OSB/).quantity).toBe(5);
        expect(findMat(out, /House Wrap/).quantity).toBe(1); // ceil(120*1.10/900)=1
        // nails: 5*55=275 count → ceil(275/500)=1 box (NOT 275 nails priced as $/box)
        const nails = findMat(out, /Nails/);
        expect(nails.quantity).toBe(1);
        expect(nails.unit).toBe('box');
    });
    test('a garage-scale run needs MULTIPLE fastener boxes', () => {
        // 108 ft ≈ a 24x30 garage wall perimeter
        const out = expandScope({ assemblies: [{ type: 'exterior_sheathing', confidence: 0.9, params: { length_ft: 108, height_ft: 10 }, estimated_unit_costs: {}, fallback_quantities: {} }], materials: [], labor: [] });
        // net=1080; sheets=ceil(1080*1.10/32)=38; nails=38*55=2090 → ceil(2090/2000)=2 boxes
        expect(findMat(out, /OSB/).quantity).toBe(38);
        expect(findMat(out, /Nails/).quantity).toBe(2);
    });
    test('drywall deducts opening area before sizing', () => {
        const out = expandScope({ assemblies: [{ type: 'drywall', confidence: 0.9, params: { length_ft: 12, height_ft: 10, sides: 2, openings_area_sqft: 40 }, estimated_unit_costs: {}, fallback_quantities: {} }], materials: [], labor: [] });
        // net=240-40=200; ceil(200*1.10/32)=ceil(6.875)=7
        expect(findMat(out, /Drywall/).quantity).toBe(7);
    });
});

describe('takeoffEngine — error contract (safety net)', () => {
    const { expandScope } = createTakeoffEngine();

    test('low confidence falls back to LLM fallback_quantities (ai_fallback) + warning', () => {
        const out = expandScope({ assemblies: [wall({ length_ft: 12, height_ft: 10, openings: [] }, { confidence: 0.3, fallback_quantities: { '2x4 Stud': 14 } })], materials: [], labor: [] });
        const stud = findMat(out, /Stud/);
        expect(stud.quantity).toBe(14);
        expect(stud.quantity_source).toBe('ai_fallback');
        expect(out.takeoffWarnings.some((w) => /estimated quantities/i.test(w.message))).toBe(true);
    });

    test('garbage params with no fallback → unresolved line + warning, never throws', () => {
        const out = expandScope({ assemblies: [wall({ length_ft: 'tall', height_ft: null, openings: [] }, { fallback_quantities: {} })], materials: [], labor: [] });
        const line = out.materials[0];
        expect(line.quantity_source).toBe('unresolved');
        expect(line.quantity).toBe(0);
        expect(out.takeoffWarnings.some((w) => /review quantities/i.test(w.message))).toBe(true);
    });
});

describe('takeoffEngine — header span lookup (structural)', () => {
    const fakeTables = {
        lookupSpan: ({ spanFt }) => spanFt <= 8
            ? { size: '2-2x10', plies: 2, source: { name: 'TEST', table: 'R602.7' }, verify: true, disclaimer: 'Verify AHJ.' }
            : { size: null, verify: true, note: 'confirm size with supplier' },
    };
    const { expandScope } = createTakeoffEngine({ tables: fakeTables });

    test('a door opening emits a header line carrying the cited size + disclaimer', () => {
        const out = expandScope({ assemblies: [wall({ length_ft: 12, height_ft: 10, wall_type: 'exterior', openings: [{ kind: 'door', width_ft: 6, height_ft: 6.67, count: 1 }] })], materials: [], labor: [] });
        const header = findMat(out, /Header/);
        expect(header).toBeDefined();
        expect(header.name).toMatch(/2-2x10/);
        expect(header.verify).toBe(true);
        expect(header.source.name).toBe('TEST');
        expect(header.disclaimer).toMatch(/AHJ/);
    });

    test('an out-of-range span emits a confirm-with-supplier header, never a size', () => {
        const out = expandScope({ assemblies: [wall({ length_ft: 20, height_ft: 10, wall_type: 'exterior', openings: [{ kind: 'door', width_ft: 16, height_ft: 7, count: 1 }] })], materials: [], labor: [] });
        const header = findMat(out, /Header/);
        expect(header.name).toMatch(/confirm size with supplier/i);
        expect(header.verify).toBe(true);
    });

    test('no tables wired → no header line (graceful, today’s behaviour)', () => {
        const { expandScope: ex } = createTakeoffEngine(); // tables: null
        const out = ex({ assemblies: [wall({ length_ft: 12, height_ft: 10, openings: [{ kind: 'door', width_ft: 6, height_ft: 6.67, count: 1 }] })], materials: [], labor: [] });
        expect(findMat(out, /Header/)).toBeUndefined();
    });
});

describe('takeoffEngine — passthrough & idempotent id', () => {
    const { expandScope } = createTakeoffEngine();

    test('loose materials/labor pass through tagged ai; assemblies are consumed', () => {
        const out = expandScope({
            assemblies: [wall({ length_ft: 12, height_ft: 10, openings: [] })],
            materials: [{ name: 'Caulk', quantity: 4, unit: 'ea', trade: 'siding', estimated_unit_cost: 6, explicit_user_price: null }],
            labor: [{ role: 'Cleanup', hours: 2, explicit_user_price: null }],
        });
        expect(out.assemblies).toBeUndefined();
        const caulk = out.materials.find((m) => m.name === 'Caulk');
        expect(caulk.quantity_source).toBe('ai');
        expect(out.labor.find((l) => l.role === 'Cleanup').quantity_source).toBe('ai');
    });

    test('assemblyId is stable across a dimension change (drives REPLACE not double)', () => {
        const a = expandScope({ assemblies: [wall({ length_ft: 12, height_ft: 10, openings: [] })], materials: [], labor: [] });
        const b = expandScope({ assemblies: [wall({ length_ft: 14, height_ft: 10, openings: [] })], materials: [], labor: [] });
        expect(findMat(a, /Stud/).assemblyId).toBe('asm:wall_frame:0');
        expect(findMat(b, /Stud/).assemblyId).toBe('asm:wall_frame:0'); // same id → persistLedger replaces
        expect(findMat(a, /Stud/).quantity).not.toBe(findMat(b, /Stud/).quantity); // but recomputed
    });
});
