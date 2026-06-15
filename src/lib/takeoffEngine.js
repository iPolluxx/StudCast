'use strict';

const defaults = require('./takeoffConstants');

// ══════════════════════════════════════════════════════════════════════
//  STAGE 1.5 — THE TAKEOFF ENGINE (deterministic, fully offline)
//
//  Sits between the Estimator (LLM, extracts dimensions) and the Pricer.
//  Expands each typed `assembly` into concrete material + labor line items
//  whose QUANTITIES come from engineering formulas, not LLM judgment. Loose
//  `materials`/`labor` pass through untouched (the "formula where possible,
//  LLM elsewhere" contract). It issues ZERO LLM/DB calls — pure arithmetic.
//
//  Idempotency: each expanded line carries an `assemblyId` of the form
//  `asm:<type>:<index>`. v1 keys on TYPE + position, so re-extracting "the
//  wall" REPLACES its prior lines in persistLedger regardless of the new
//  dimensions (that's how "make that wall 14 ft" recomputes instead of
//  doubling). Multiple same-type assemblies in one estimate (e.g. a garage's
//  four walls) is the garage-box case deferred to v2, where the id will gain
//  a stable per-assembly discriminator.
//
//  Error contract: a safety net, never a gate. A bad-param or low-confidence
//  assembly falls back to the LLM's `fallback_quantities`; a thrown formula is
//  caught and also falls back. The pipeline never 500s because Takeoff hiccuped.
// ══════════════════════════════════════════════════════════════════════

const num   = (v) => (typeof v === 'number' ? v : parseFloat(v));
const valid = (v) => Number.isFinite(v) && v > 0;
const CONFIDENCE_FLOOR = 0.6;

function createTakeoffEngine({ tables = null, constants = defaults } = {}) {
    const c     = constants.conventions;
    const costs = constants.defaultCosts;
    const trades = constants.defaultTrade;

    // Build a priced-ready material line. estimated_unit_cost prefers the LLM's
    // per-part hint (§5a), falling back to a conservative default so the Pricer
    // waterfall never yields $0.
    function matLine(assembly, assemblyId, { name, quantity, unit, trade, costKey, provenance }) {
        const hint = assembly.estimated_unit_costs && assembly.estimated_unit_costs[name];
        return {
            name, quantity, unit, trade,
            estimated_unit_cost: Number.isFinite(num(hint)) ? num(hint) : (costs[costKey] ?? 0),
            explicit_user_price: null,
            quantity_source: 'formula',
            assemblyId,
            provenance,
        };
    }

    function laborLine(assemblyId, { role, hours, provenance }) {
        return { role, hours, explicit_user_price: null, quantity_source: 'formula', assemblyId, provenance };
    }

    // ── Formula expanders (return { materials, labor } or null to force fallback) ──

    function expandWallFrame(a, assemblyId) {
        const p = a.params || {};
        const length = num(p.length_ft), height = num(p.height_ft);
        if (!valid(length) || !valid(height)) return null;

        const spacing = (p.stud_spacing_in === 16 || p.stud_spacing_in === 24) ? p.stud_spacing_in : c.studSpacingIn;
        const openings = Array.isArray(p.openings) ? p.openings : [];
        const openingCount = openings.reduce((s, o) => s + (num(o.count) || 0), 0);
        const corners = Number.isFinite(num(p.corners)) ? num(p.corners) : c.defaultCorners;

        // IRC/UDC takeoff: field studs + 1 closing stud + 3 per corner/T-backing
        // + 4 per opening (2 king + 2 jack). Source: SPS 321.25, IAM Builders.
        const studs  = Math.ceil((length * 12) / spacing) + 1 + corners * c.studsPerCorner + openingCount * c.studsPerOpening;
        // 1 sole + double top plate = 3 runs, in 16 ft stock.
        const plates = Math.ceil((length * c.plateRuns) / c.plateStockFt);
        // RSMeans/NAHB productivity: wall area ÷ 56.25 sqft per framer-hour.
        const hours  = Math.round((length * height) / c.productivitySqftPerHr * 100) / 100;

        // Lumber size label (count is spacing-based, identical for 2x4/2x6); a
        // 2x6 garage wall must read "2x6", not the default "2x4".
        const studSize = /^2x(4|6|8)$/.test(String(p.stud_size)) ? String(p.stud_size) : c.defaultStudSize;
        const studName  = `${studSize}x${Math.ceil(height)}ft SPF Stud`;
        const plateName = `${studSize}x${c.plateStockFt}ft SPF Plate`;

        const materials = [
            matLine(a, assemblyId, {
                name: studName, quantity: studs, unit: 'pcs', trade: 'framing', costKey: 'stud',
                provenance: { formulaId: 'wall_frame.studs', inputs: { length, height, spacing, corners, studSize, openings },
                    constants: { studsPerCorner: c.studsPerCorner, studsPerOpening: c.studsPerOpening } },
            }),
            matLine(a, assemblyId, {
                name: plateName, quantity: plates, unit: 'pcs', trade: 'framing', costKey: 'plate',
                provenance: { formulaId: 'wall_frame.plates', inputs: { length },
                    constants: { plateRuns: c.plateRuns, plateStockFt: c.plateStockFt } },
            }),
        ];

        // Header span-lookup per opening (structural — cited size, never computed).
        if (tables && typeof tables.lookupSpan === 'function') {
            const application = p.wall_type === 'interior' ? 'interior_nonbearing' : 'exterior_bearing_wall';
            for (const o of openings) {
                const count = num(o.count) || 0;
                const span  = num(o.width_ft);
                if (count <= 0 || !valid(span)) continue;
                const hit = tables.lookupSpan({ memberType: 'dimensional_header', application, spanFt: span, loadCondition: 'roof+ceiling' });
                materials.push(matLine(a, assemblyId, {
                    name: hit.size ? `Header ${hit.size} (${span}ft opening)` : `Header for ${span}ft opening — confirm size with supplier`,
                    quantity: count, unit: 'ea', trade: 'framing', costKey: 'header',
                    provenance: { formulaId: 'wall_frame.header', inputs: { spanFt: span }, source: hit.source, verify: true },
                }));
                // structural disclaimer fields surfaced to the UI
                const last = materials[materials.length - 1];
                last.verify = true;
                last.source = hit.source;
                last.disclaimer = hit.disclaimer || hit.note;
            }
        }

        const labor = [laborLine(assemblyId, {
            role: 'Framing labor (hrs)', hours,
            provenance: { formulaId: 'wall_frame.labor', inputs: { length, height },
                constants: { productivitySqftPerHr: c.productivitySqftPerHr } },
        })];

        return { materials, labor };
    }

    function expandDrywall(a, assemblyId) {
        const p = a.params || {};
        const length = num(p.length_ft), height = num(p.height_ft);
        if (!valid(length) || !valid(height)) return null;
        const sides = (p.sides === 1 || p.sides === 2) ? p.sides : 2;
        const openingsArea = Math.max(0, num(p.openings_area_sqft) || 0);
        const net = Math.max(0, length * height * sides - openingsArea);

        const sheets = Math.ceil((net * (1 + c.drywallWaste)) / c.sheetSqFt);
        const buckets = Math.ceil((net / 100) * c.compoundGalPer100Sqft / c.compoundBucketGal);
        const tapeRolls = Math.ceil(net / c.tapeRollFt);
        // Fasteners are sold by the box — quantify in boxes, not loose count.
        const screwCount = sheets * c.screwsPerSheet;
        const screwBoxes = Math.ceil(screwCount / c.screwsPerBox);
        const inputs = { length, height, sides, openingsArea };

        return {
            materials: [
                matLine(a, assemblyId, {
                    name: '1/2" Drywall 4x8 Sheet', quantity: sheets, unit: 'pcs', trade: 'drywall', costKey: 'drywallSheet',
                    provenance: { formulaId: 'drywall.sheets', inputs, constants: { drywallWaste: c.drywallWaste, sheetSqFt: c.sheetSqFt } },
                }),
                matLine(a, assemblyId, {
                    name: 'Joint Compound (4.5 gal bucket)', quantity: buckets, unit: 'ea', trade: 'drywall', costKey: 'compound',
                    provenance: { formulaId: 'drywall.compound', inputs, constants: { compoundGalPer100Sqft: c.compoundGalPer100Sqft, compoundBucketGal: c.compoundBucketGal } },
                }),
                matLine(a, assemblyId, {
                    name: 'Drywall Joint Tape (500 ft roll)', quantity: tapeRolls, unit: 'ea', trade: 'drywall', costKey: 'tape',
                    provenance: { formulaId: 'drywall.tape', inputs, constants: { tapeRollFt: c.tapeRollFt } },
                }),
                matLine(a, assemblyId, {
                    name: `Drywall Screws (${c.screwsPerBox}/box)`, quantity: screwBoxes, unit: 'box', trade: 'drywall', costKey: 'screws',
                    provenance: { formulaId: 'drywall.screws', inputs: { sheets, screwCount }, constants: { screwsPerSheet: c.screwsPerSheet, screwsPerBox: c.screwsPerBox } },
                }),
            ],
            labor: [],
        };
    }

    function expandSheathing(a, assemblyId) {
        const p = a.params || {};
        const length = num(p.length_ft), height = num(p.height_ft);
        if (!valid(length) || !valid(height)) return null;
        const gross = length * height;
        const openingsArea = Math.max(0, num(p.openings_area_sqft) || 0);
        const net = Math.max(0, gross - openingsArea);

        const sheets = Math.ceil((net * (1 + c.sheathingWaste)) / c.sheetSqFt);
        const wrapRolls = Math.ceil((gross * (1 + c.sheathingWaste)) / c.houseWrapRollSqFt);
        // 8d nails are sold by the box — quantify in boxes, not loose count.
        const nailCount = sheets * c.panelFastenersPerSheet;
        const nailBoxes = Math.ceil(nailCount / c.nailsPerBox);
        const inputs = { length, height, openingsArea };

        return {
            materials: [
                matLine(a, assemblyId, {
                    name: '7/16" OSB Sheathing 4x8 Sheet', quantity: sheets, unit: 'pcs', trade: 'siding', costKey: 'sheathing',
                    provenance: { formulaId: 'exterior_sheathing.sheets', inputs, constants: { sheathingWaste: c.sheathingWaste, sheetSqFt: c.sheetSqFt } },
                }),
                matLine(a, assemblyId, {
                    name: 'House Wrap (9x100 roll)', quantity: wrapRolls, unit: 'ea', trade: 'siding', costKey: 'houseWrap',
                    provenance: { formulaId: 'exterior_sheathing.housewrap', inputs, constants: { houseWrapRollSqFt: c.houseWrapRollSqFt } },
                }),
                matLine(a, assemblyId, {
                    name: `8d Sheathing Nails (${c.nailsPerBox}/box)`, quantity: nailBoxes, unit: 'box', trade: 'siding', costKey: 'nails',
                    provenance: { formulaId: 'exterior_sheathing.fasteners', inputs: { sheets, nailCount }, constants: { panelFastenersPerSheet: c.panelFastenersPerSheet, nailsPerBox: c.nailsPerBox } },
                }),
            ],
            labor: [],
        };
    }

    const EXPANDERS = {
        wall_frame:         expandWallFrame,
        drywall:            expandDrywall,
        exterior_sheathing: expandSheathing,
    };

    // Degrade path: emit the LLM's fallback_quantities (tagged ai_fallback) so a
    // formula failure becomes today's behaviour, not silent data loss.
    function expandFallback(a, assemblyId, reason, warnings) {
        const fq = (a && a.fallback_quantities) || {};
        const names = Object.keys(fq);
        const trade = trades[a.type] || 'labor-general';
        if (names.length === 0) {
            warnings.push({ severity: 'info', itemId: assemblyId, message: `Takeoff could not compute ${a.type} (${reason}); review quantities.` });
            return {
                materials: [{
                    name: `${a.type.replace(/_/g, ' ')} — review quantities`, quantity: 0, unit: 'ea', trade,
                    estimated_unit_cost: 0, explicit_user_price: null,
                    quantity_source: 'unresolved', assemblyId, provenance: { reason },
                }],
                labor: [],
            };
        }
        warnings.push({ severity: 'info', itemId: assemblyId, message: `Takeoff used estimated quantities for ${a.type} (${reason}).` });
        return {
            materials: names.map((name) => ({
                name, quantity: num(fq[name]) || 0, unit: 'pcs', trade,
                estimated_unit_cost: (a.estimated_unit_costs && num(a.estimated_unit_costs[name])) || 0,
                explicit_user_price: null,
                quantity_source: 'ai_fallback', assemblyId, provenance: { reason },
            })),
            labor: [],
        };
    }

    const tagAi = (i) => (i && i.quantity_source ? i : { ...i, quantity_source: 'ai' });

    /**
     * @param {object} scope Estimator output: { assemblies?, materials?, labor?, ... }
     * @returns {object} scope with assemblies expanded into materials/labor + takeoffWarnings[]
     */
    function expandScope(scope) {
        const assemblies = Array.isArray(scope.assemblies) ? scope.assemblies : [];
        const outMaterials = [];
        const outLabor = [];
        const warnings = [];
        const typeIndex = {};

        for (const a of assemblies) {
            if (!a || !a.type) continue;
            typeIndex[a.type] = (typeIndex[a.type] ?? -1) + 1;
            const assemblyId = `asm:${a.type}:${typeIndex[a.type]}`;
            const lowConfidence = typeof a.confidence === 'number' && a.confidence < CONFIDENCE_FLOOR;

            let result = null;
            try {
                if (!lowConfidence && EXPANDERS[a.type]) result = EXPANDERS[a.type](a, assemblyId);
            } catch (err) {
                result = null;
                warnings.push({ severity: 'info', itemId: assemblyId, message: `Takeoff error on ${a.type}: ${err.message}` });
            }
            if (!result) result = expandFallback(a, assemblyId, lowConfidence ? 'low_confidence' : 'unresolved_params', warnings);

            outMaterials.push(...result.materials);
            outLabor.push(...result.labor);
        }

        // Loose items pass through, tagged 'ai'. Assemblies are consumed.
        const { assemblies: _consumed, ...rest } = scope;
        return {
            ...rest,
            materials: [...outMaterials, ...(Array.isArray(scope.materials) ? scope.materials.map(tagAi) : [])],
            labor:     [...outLabor,     ...(Array.isArray(scope.labor)     ? scope.labor.map(tagAi)     : [])],
            takeoffWarnings: warnings,
        };
    }

    return { expandScope };
}

module.exports = { createTakeoffEngine };
