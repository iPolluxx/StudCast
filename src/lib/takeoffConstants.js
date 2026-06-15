'use strict';

// ══════════════════════════════════════════════════════════════════════
//  TAKEOFF CONVENTION DEFAULTS
//  The formulas in takeoffEngine.js are indisputable arithmetic; these are
//  the defensible *conventions* that turn a formula into a specific number
//  (spacing, waste, opening framing). They ship fixed here in v1; a later
//  pass moves them to per-tenant settings/config so a contractor can frame
//  "their way". Changing a value here changes every computed quantity.
// ══════════════════════════════════════════════════════════════════════
// All values are citation-backed by docs/Residential Construction Estimating
// Tables.txt (IRC 2021 / Wisconsin UDC SPS 321, RSMeans/NAHB productivity).
const conventions = {
    studSpacingIn:        16,     // default on-center when the job doesn't say
    defaultStudSize:      '2x4',  // lumber size label when the job doesn't say (2x6 garages etc. override)
    studsPerCorner:        3,     // 3-stud backing per corner / T-intersection
    studsPerOpening:       4,     // 2 king + 2 jack per door OR window opening
    defaultCorners:        2,     // a described wall typically runs between 2 corners
                                  // (visible + editable; set 0 for a lone partition)
    plateRuns:             3,     // 1 sole + double top plate
    plateStockFt:         16,     // plate board length
    productivitySqftPerHr: 56.25, // framing crew rate (RSMeans/NAHB, ~450 sqft/day/framer)

    sheetSqFt:            32,      // 4x8 panel (drywall + sheathing)
    drywallWaste:         0.10,    // 10% drywall waste
    sheathingWaste:       0.10,    // 10% sheathing waste
    framingWaste:         0.05,    // advisory framing lumber waste (not applied to piece counts)

    // Drywall finishing (Level 4)
    compoundGalPer100Sqft: 3,     // 3 gal joint compound per 100 sqft
    compoundBucketGal:     4.5,   // standard bucket
    tapeRollFt:            500,    // 1 lf tape per sqft; 500 ft roll
    screwsPerSheet:        36,     // ~36 screws per 4x8 sheet at 16" OC
    screwsPerBox:        1000,     // fasteners are SOLD by the box, not each

    // Exterior weather barrier + fasteners
    houseWrapRollSqFt:    900,     // 9 ft x 100 ft roll
    panelFastenersPerSheet: 55,    // 6" edge / 12" field nailing
    nailsPerBox:         2500,     // 8d nails sold by the box, not each
};

// Conservative central-Wisconsin fallback unit costs, used ONLY when the LLM
// provides no matching estimated_unit_cost hint for a computed part. The Pricer
// still prefers explicit prices and the contractor's price_book over these.
const defaultCosts = {
    stud:             4.50,
    plate:            6.00,
    sheathing:       18.00,
    drywallSheet:    14.00,
    compound:        18.00,   // ~4.5 gal bucket
    tape:             6.00,    // 500 ft roll
    screws:          12.00,    // per box
    houseWrap:      160.00,    // 9x100 roll
    nails:           45.00,    // per box
    header:          45.00,
    framingLaborRate:  55,     // only used if no default_labor_rate is configured
};

// Default trade per assembly type — applied to fallback lines where the formula
// could not run and the part's trade is otherwise unknown.
const defaultTrade = {
    wall_frame:         'framing',
    drywall:            'drywall',
    exterior_sheathing: 'siding',
};

module.exports = { conventions, defaultCosts, defaultTrade };
