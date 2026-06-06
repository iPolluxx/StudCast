'use strict';

/**
 * Curated Menards product URLs for common WI residential construction materials.
 * Target store: Wausau, WI (geo_location passed to Oxylabs).
 *
 * URLs verified via Google site:menards.com search — June 2026.
 * Items marked TODO need their URL verified on menards.com.
 * Stale items fall back gracefully to the AI pricing tier.
 */

module.exports = [

  // ── Framing Lumber ────────────────────────────────────────────────────
  { key: '2x4x8-stud',  name: '2x4x8 Stud',  unit: 'each', url: 'https://www.menards.com/main/building-materials/lumber-boards/studs/2-x-4-x-8-lumber/p-1444451086852.htm' },
  { key: '2x4x10',      name: '2x4x10',       unit: 'each', url: 'https://www.menards.com/main/building-materials/lumber-boards/dimensional-lumber/2-x-4-construction-framing-lumber/1021114/p-1444422740098-c-13125.htm' },
  { key: '2x4x12',      name: '2x4x12',       unit: 'each', url: 'https://www.menards.com/main/building-materials/lumber-boards/dimensional-lumber/2-x-4-construction-framing-lumber/1021127/p-1444422744154-c-13125.htm' },
  { key: '2x4x16',      name: '2x4x16',       unit: 'each', url: 'https://www.menards.com/main/building-materials/lumber-boards/dimensional-lumber/2-x-4-construction-framing-lumber/1021143/p-1444422747483-c-13125.htm' },
  { key: '2x6x8',       name: '2x6x8',        unit: 'each', url: 'https://www.menards.com/main/building-materials/lumber-boards/dimensional-lumber/2-x-6-construction-framing-lumber/1021758/p-1444422369989-c-13125.htm' },
  { key: '2x6x10',      name: '2x6x10',       unit: 'each', url: 'https://www.menards.com/main/building-materials/lumber-boards/dimensional-lumber/2-x-6-construction-framing-lumber/1021761/p-1444422472610-c-13125.htm' },
  { key: '2x6x12',      name: '2x6x12',       unit: 'each', url: 'https://www.menards.com/main/building-materials/lumber-boards/dimensional-lumber/2-x-6-construction-framing-lumber/1021774/p-1444422354800.htm' },
  { key: '2x6x16',      name: '2x6x16',       unit: 'each', url: 'https://www.menards.com/main/building-materials/lumber-boards/dimensional-lumber/2-x-6-construction-framing-lumber/1021790/p-1444422746041-c-13125.htm' },
  { key: '2x8x10',      name: '2x8x10',       unit: 'each', url: 'https://www.menards.com/main/building-materials/lumber-boards/dimensional-lumber/2-x-8-construction-framing-lumber/1021897/p-1444422478072-c-13125.htm' },
  { key: '2x8x12',      name: '2x8x12',       unit: 'each', url: 'https://www.menards.com/main/building-materials/lumber-boards/dimensional-lumber/2-x-8-construction-framing-lumber/1021907/p-1444422326844-c-13125.htm' },
  { key: '2x10x8',      name: '2x10x8',       unit: 'each', url: 'https://www.menards.com/main/building-materials/lumber-boards/dimensional-lumber/2-x-10-2-better-construction-framing-lumber/1022016/p-1444422197282-c-13125.htm' },
  { key: '2x10x12',     name: '2x10x12',      unit: 'each', url: 'https://www.menards.com/main/building-materials/lumber-boards/dimensional-lumber/2-x-10-2-better-construction-framing-lumber/1022029/p-1444422200816-c-13125.htm' }, // TODO verify
  { key: '2x10x16',     name: '2x10x16',      unit: 'each', url: 'https://www.menards.com/main/building-materials/lumber-boards/dimensional-lumber/2-x-10-2-better-construction-framing-lumber/1022048/p-1444422204350-c-13125.htm' }, // TODO verify
  { key: '2x12x8',      name: '2x12x8',       unit: 'each', url: 'https://www.menards.com/main/building-materials/lumber-boards/dimensional-lumber/2-x-12-2-better-construction-framing-lumber/1022142/p-1444422433806-c-13125.htm' },
  { key: '2x12x12',     name: '2x12x12',      unit: 'each', url: 'https://www.menards.com/main/building-materials/lumber-boards/dimensional-lumber/2-x-12-1-southern-yellow-pine-construction-framing-lumber/1022170/p-1444422470256-c-13125.htm' }, // TODO verify standard grade 12ft
  { key: '2x12x16',     name: '2x12x16',      unit: 'each', url: 'https://www.menards.com/main/building-materials/lumber-boards/dimensional-lumber/2-x-12-2-better-construction-framing-lumber/1022191/p-1444422437340-c-13125.htm' }, // TODO verify

  // ── Pressure Treated Lumber ───────────────────────────────────────────
  { key: 'pt-2x4x8',       name: 'PT 2x4x8',           unit: 'each', url: 'https://www.menards.com/main/building-materials/lumber-boards/dimensional-lumber/ac2-reg-2-x-4-2-prime-ground-contact-green-pressure-treated-lumber/1110818/p-1444422742084-c-13125.htm' },
  { key: 'pt-2x6x8',       name: 'PT 2x6x8',           unit: 'each', url: 'https://www.menards.com/main/building-materials/lumber-boards/dimensional-lumber/ac2-reg-2-x-6-2-prime-ground-contact-green-pressure-treated-lumber/1111008/p-1444422501756-c-13125.htm' }, // TODO: this was 4ft, verify 8ft URL
  { key: 'pt-4x4x8',       name: 'PT 4x4x8 Post',      unit: 'each', url: 'https://www.menards.com/main/building-materials/lumber-boards/timbers-logs/ac2-reg-4-x-4-2-ground-contact-green-pressure-treated-timber/1112201/p-1444422501073-c-13131.htm' }, // TODO: verify 8ft
  { key: 'pt-2x10x12',     name: 'PT 2x10x12',         unit: 'each', url: 'https://www.menards.com/main/building-materials/lumber-boards/dimensional-lumber/ac2-reg-2-x-10-2-prime-ground-contact-green-pressure-treated-lumber/1111642/p-1444422264185-c-13125.htm' },
  { key: 'pt-54x6-deck',   name: 'PT 5/4x6x16 Deck Board', unit: 'each', url: 'https://www.menards.com/main/building-materials/decking-deck-products/pressure-treated-decking/c-19070.htm' }, // TODO verify exact URL

  // ── Sheathing ─────────────────────────────────────────────────────────
  { key: '716-osb-4x8',    name: '7/16 OSB 4x8',        unit: 'sheet', url: 'https://www.menards.com/main/building-materials/panel-products/osb-sheathing/7-16-x-4-x-8-osb/1242728-2/p-1444422471192-c-13330.htm' },
  { key: '12-osb-4x8',     name: '1/2 OSB 4x8',         unit: 'sheet', url: 'https://www.menards.com/main/building-materials/panel-products/osb-sheathing/c-13330.htm' }, // TODO verify
  { key: '34-osb-4x8',     name: '3/4 OSB 4x8 Flooring', unit: 'sheet', url: 'https://www.menards.com/main/building-materials/panel-products/osb-sheathing/c-13330.htm' }, // TODO verify
  { key: '12-plywood-4x8', name: '1/2 Plywood 4x8',     unit: 'sheet', url: 'https://www.menards.com/main/building-materials/panel-products/plywood-sheathing/1-2-x-4-x-8-4-ply-plywood-rated-sheathing/1231098/p-1444431327404-c-13331.htm' },
  { key: '34-plywood-4x8', name: '3/4 Plywood 4x8',     unit: 'sheet', url: 'https://www.menards.com/main/building-materials/panel-products/plywood-sheathing/3-4-x-4-x-8-plywood-rated-sheathing/1231182/p-1444431334153-c-13331.htm' },

  // ── Drywall ───────────────────────────────────────────────────────────
  { key: '12-drywall-4x8',   name: '1/2 Drywall 4x8',        unit: 'sheet', url: 'https://www.menards.com/main/building-materials/drywall/drywall-sheets/1-2-x-4-x-8-lightweight-drywall/1311223/p-1444421962026-c-5656.htm' },
  { key: '12-drywall-4x12',  name: '1/2 Drywall 4x12',       unit: 'sheet', url: 'https://www.menards.com/main/building-materials/drywall/drywall-sheets/c-5656.htm' }, // TODO verify 4x12
  { key: '58-typex-4x8',     name: '5/8 Type X Drywall 4x8', unit: 'sheet', url: 'https://www.menards.com/main/building-materials/drywall/drywall-sheets/5-8-x-4-x-8-toughrock-reg-lightweight-fire-rated-drywall-board/1311309/p-1444431324278-c-5656.htm' },
  { key: '58-typex-4x12',    name: '5/8 Type X Drywall 4x12',unit: 'sheet', url: 'https://www.menards.com/main/building-materials/drywall/drywall-sheets/5-8-x-4-x-12-type-x-fire-rated-drywall/1311303/p-1444422119706-c-5656.htm' },

  // ── Roofing ───────────────────────────────────────────────────────────
  { key: 'arch-shingles',     name: 'Architectural Shingles Bundle', unit: 'bundle', url: 'https://www.menards.com/main/building-materials/roofing/roofing-shingles/owens-corning-reg-trudefinition-reg-duration-reg-architectural-roofing-shingles-32-8-sq-ft/du05/p-1444450503747-c-5814.htm' },
  { key: 'ice-water-shield',  name: 'Ice Water Shield Roll',         unit: 'roll',   url: 'https://www.menards.com/main/building-materials/roofing/roofing-underlayment/tarco-leak-barrier-3-x-65-granulated-ice-water-barrier-195-sq-ft/1511830/p-1444444738879-c-13250.htm' },
  { key: 'roofing-felt-15lb', name: 'Roofing Felt 15lb Roll',        unit: 'roll',   url: 'https://www.menards.com/main/building-materials/roofing/roofing-underlayment/c-13250.htm' }, // TODO verify
  { key: 'drip-edge-d-10ft',  name: 'Drip Edge D-Style 10ft',        unit: 'each',   url: 'https://www.menards.com/main/building-materials/roofing/roof-flashing/drip-edge/c-13247.htm' }, // TODO verify
  { key: 'drip-edge-f-10ft',  name: 'Drip Edge F-Style 10ft',        unit: 'each',   url: 'https://www.menards.com/main/building-materials/roofing/roof-flashing/drip-edge/c-13247.htm' }, // TODO verify
  { key: 'ridge-vent-lf',     name: 'Ridge Vent per LF',             unit: 'LF',     url: 'https://www.menards.com/main/building-materials/roofing/roof-vents/ridge-vents/c-13252.htm' }, // TODO verify
  { key: 'pipe-boot',         name: 'Pipe Boot Flashing',            unit: 'each',   url: 'https://www.menards.com/main/building-materials/roofing/roof-flashing/pipe-flashings-boots/c-13248.htm' }, // TODO verify

  // ── Aluminum — Coil, Fascia, Soffit, J-Channel ───────────────────────
  { key: 'j-channel-white-12ft', name: 'J-Channel White 12ft', unit: 'each',   url: 'https://www.menards.com/main/building-materials/soffit/sell-even-12-aluminum-j-channel/ut-wh/p-1444424195722-c-1488981946224.htm' },
  { key: 'alum-coil-white',      name: 'Aluminum Coil White',  unit: 'roll',   url: 'https://www.menards.com/main/building-materials/soffit/aluminum-coil/c-1488981947096.htm' }, // TODO verify
  { key: 'alum-soffit-vented',   name: 'Aluminum Soffit Vented',unit: 'sq ft', url: 'https://www.menards.com/main/building-materials/soffit/aluminum-soffit/c-1488981946613.htm' }, // TODO verify
  { key: 'alum-fascia',          name: 'Aluminum Fascia',      unit: 'LF',     url: 'https://www.menards.com/main/building-materials/soffit/aluminum-fascia/c-1488981946910.htm' }, // TODO verify

  // ── Insulation ────────────────────────────────────────────────────────
  { key: 'r13-batt-15in', name: 'R13 Batt 15in', unit: 'bag', url: 'https://www.menards.com/main/building-materials/insulation/insulation-rolls-batts/r-13-ecobatt-reg-unfaced-fiberglass-insulation-batt-15-x-93/510519/p-1444437009992-c-5780.htm' },
  { key: 'r19-batt-15in', name: 'R19 Batt 15in', unit: 'bag', url: 'https://www.menards.com/main/building-materials/insulation/insulation-rolls-batts/r-19-ecobatt-reg-unfaced-fiberglass-insulation-batt-15-x-93/510516/p-1444437006428-c-5780.htm' },
  { key: 'r21-batt-15in', name: 'R21 Batt 15in', unit: 'bag', url: 'https://www.menards.com/main/building-materials/insulation/insulation-rolls-batts/r-21-ecobatt-reg-unfaced-fiberglass-insulation-batt-15-x-105/506594/p-1444436999564-c-5780.htm' },
  { key: 'r38-batt',      name: 'R38 Batt Attic', unit: 'bag', url: 'https://www.menards.com/main/building-materials/insulation/insulation-rolls-batts/c-5780.htm' }, // TODO verify
  { key: 'r49-batt',      name: 'R49 Batt Attic', unit: 'bag', url: 'https://www.menards.com/main/building-materials/insulation/insulation-rolls-batts/c-5780.htm' }, // TODO verify
  { key: 'rigid-foam-2in', name: '2in Rigid Foam 4x8', unit: 'sheet', url: 'https://www.menards.com/main/building-materials/insulation/rigid-foam-board-insulation/c-5779.htm' }, // TODO verify
  { key: 'rigid-foam-1in', name: '1in Rigid Foam 4x8', unit: 'sheet', url: 'https://www.menards.com/main/building-materials/insulation/rigid-foam-board-insulation/c-5779.htm' }, // TODO verify
  { key: 'spray-foam-can', name: 'Spray Foam Can Great Stuff', unit: 'each', url: 'https://www.menards.com/main/building-materials/insulation/spray-foam-insulation/c-5781.htm' }, // TODO verify

  // ── Siding ────────────────────────────────────────────────────────────
  { key: 'vinyl-siding',     name: 'Vinyl Siding per Square',      unit: 'sq',    url: 'https://www.menards.com/main/building-materials/siding/vinyl-siding/c-1488981943756.htm' }, // TODO verify
  { key: 'lp-smartside-lap', name: 'LP SmartSide Lap Siding per Square', unit: 'sq', url: 'https://www.menards.com/main/building-materials/siding/engineered-wood-siding/c-1488981944165.htm' }, // TODO verify

  // ── MiTek Structural Connectors (Menards brand, not Simpson) ─────────
  { key: 'mitek-jl26',   name: 'MiTek JL26 Joist Hanger 2x6',   unit: 'each', url: 'https://www.menards.com/main/hardware/fasteners-connectors/construction-hardware/structural-hangers/mitek-reg-g90-steel-face-mount-joist-hanger/jl26/p-1444445492707-c-8843.htm' },
  { key: 'mitek-hus28',  name: 'MiTek HUS28 Joist Hanger 2x8',  unit: 'each', url: 'https://www.menards.com/main/hardware/fasteners-connectors/construction-hardware/structural-hangers/mitek-reg-g90-steel-slant-nail-double-face-mount-hanger/hus28-2/p-1444445479849-c-8843.htm' },
  { key: 'mitek-rt7a',   name: 'MiTek RT7A Hurricane Tie',       unit: 'each', url: 'https://www.menards.com/main/hardware/fasteners-connectors/construction-hardware/truss-rafter-tiedowns/mitek-reg-6-1-2-x-1-1-2-hurricane-seismic-anchor-tie/rt7a/p-1444445511509-c-8891.htm' },
  { key: 'mitek-post-base', name: 'MiTek Post Base 4x4',         unit: 'each', url: 'https://www.menards.com/main/hardware/fasteners-connectors/construction-hardware/column-post-bases-caps/c-8825.htm' }, // TODO verify exact SKU

  // ── Fasteners + Adhesive ──────────────────────────────────────────────
  { key: '16d-nails-5lb',   name: '16d Common Nails 5lb',         unit: 'box',  url: 'https://www.menards.com/main/hardware/nails-staples/bulk-nails/c-8649.htm' }, // TODO verify
  { key: '8d-nails-5lb',    name: '8d Common Nails 5lb',          unit: 'box',  url: 'https://www.menards.com/main/hardware/nails-staples/bulk-nails/c-8649.htm' }, // TODO verify
  { key: '3in-screws-5lb',  name: '3in Construction Screws 5lb',  unit: 'box',  url: 'https://www.menards.com/main/hardware/screws-bolts-nuts-washers/c-8658.htm' }, // TODO verify
  { key: 'liquid-nails',    name: 'Liquid Nails Construction Adhesive', unit: 'tube', url: 'https://www.menards.com/main/paint/caulk-adhesives-sealants/construction-adhesives/c-5721.htm' }, // TODO verify
  { key: 'subfloor-adhesive','name':'PL Premium Subfloor Adhesive', unit: 'tube', url: 'https://www.menards.com/main/paint/caulk-adhesives-sealants/construction-adhesives/c-5721.htm' }, // TODO verify

  // ── Concrete + Foundation ─────────────────────────────────────────────
  { key: '60lb-concrete', name: '60lb Concrete Mix', unit: 'bag', url: 'https://www.menards.com/main/building-materials/concrete-cement-masonry/bagged-concrete-cement-mortar/concrete-mix-60-lb/1891030/p-1444441405889-c-5648.htm' },
  { key: '80lb-concrete', name: '80lb Concrete Mix', unit: 'bag', url: 'https://www.menards.com/main/building-materials/concrete-cement-masonry/bagged-concrete-cement-mortar/c-5648.htm' }, // TODO: Menards may not carry 80lb, verify

  // ── Windows ───────────────────────────────────────────────────────────
  { key: 'window-dh-30x40', name: 'Window 30x40 Double Hung', unit: 'each', url: 'https://www.menards.com/main/doors-windows-millwork/windows/standard-sized-windows/double-hung-windows/jeld-wen-reg-good-series-vinyl-double-hung-window-with-nailing-flange/jw1792-00213/p-1454045279836-c-1482327569454.htm' },
  { key: 'window-dh-30x48', name: 'Window 30x48 Double Hung', unit: 'each', url: 'https://www.menards.com/main/doors-windows-millwork/windows/standard-sized-windows/double-hung-windows/jeld-wen-reg-builders-series-30w-x-48h-vinyl-double-hung-window-with-flange-grids/jwm1438-007995/p-1470102149210-c-1482327569454.htm' },
  { key: 'window-dh-36x48', name: 'Window 36x48 Double Hung', unit: 'each', url: 'https://www.menards.com/main/doors-windows-millwork/windows/standard-sized-windows/double-hung-windows/c-1482327569454.htm' }, // TODO verify
  { key: 'window-dh-48x48', name: 'Window 48x48 Double Hung', unit: 'each', url: 'https://www.menards.com/main/doors-windows-millwork/windows/standard-sized-windows/double-hung-windows/c-1482327569454.htm' }, // TODO verify

  // ── Doors ─────────────────────────────────────────────────────────────
  { key: 'door-steel-6panel-30', name: 'Steel Entry Door 3-0 6-Panel Prehung', unit: 'each', url: 'https://www.menards.com/main/doors-windows-millwork/exterior-doors/front-doors/mastercraft-reg-primed-steel-6-panel-prehung-exterior-door/4140330/p-1500273188388-c-9356.htm' },
  { key: 'door-interior-2panel-30', name: 'Interior Door 3-0 2-Panel Prehung', unit: 'each', url: 'https://www.menards.com/main/doors-windows-millwork/interior-doors/interior-prehung-doors/mastercraft-reg-primed-2-panel-prehung-interior-door/4110636/p-1642874308457623-c-3638.htm' },

  // ── Housewrap + Misc Exterior ─────────────────────────────────────────
  { key: 'housewrap-block-it', name: 'House Wrap Block-It 10x100', unit: 'roll', url: 'https://www.menards.com/main/building-materials/siding/house-wrap/kimberly-clark-block-it-reg-house-wrap/1612999/p-1444453630065.htm' },
  { key: 'flashing-tape-4in',  name: 'Flashing Tape 4in',          unit: 'roll', url: 'https://www.menards.com/main/building-materials/siding/house-wrap/flashing-tape/c-1488981944851.htm' }, // TODO verify
  { key: 'vapor-barrier-6mil', name: '6 Mil Vapor Barrier',        unit: 'roll', url: 'https://www.menards.com/main/building-materials/insulation/vapor-barriers/c-5783.htm' }, // TODO verify

];
