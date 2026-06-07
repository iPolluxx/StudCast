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
  { key: '2x10x12',     name: '2x10x12',      unit: 'each', url: 'https://www.menards.com/main/building-materials/lumber-boards/dimensional-lumber/2-x-10-2-better-construction-framing-lumber/1022032/p-1444422415848-c-13125.htm' },
  { key: '2x10x16',     name: '2x10x16',      unit: 'each', url: 'https://www.menards.com/main/building-materials/lumber-boards/dimensional-lumber/2-x-10-2-better-construction-framing-lumber/1022058/p-1444422261597-c-13125.htm' },
  { key: '2x12x8',      name: '2x12x8',       unit: 'each', url: 'https://www.menards.com/main/building-materials/lumber-boards/dimensional-lumber/2-x-12-2-better-construction-framing-lumber/1022142/p-1444422433806-c-13125.htm' },
  { key: '2x12x12',     name: '2x12x12',      unit: 'each', url: 'https://www.menards.com/main/building-materials/lumber-boards/dimensional-lumber/2-x-12-2-better-construction-framing-lumber/1022168/p-1444422195501-c-13125.htm' },
  { key: '2x12x16',     name: '2x12x16',      unit: 'each', url: 'https://www.menards.com/main/building-materials/lumber-boards/dimensional-lumber/2-x-12-2-better-construction-framing-lumber/1022184/p-1444421966936-c-13125.htm' },

  // ── Pressure Treated Lumber ───────────────────────────────────────────
  { key: 'pt-2x4x8',       name: 'PT 2x4x8',           unit: 'each', url: 'https://www.menards.com/main/building-materials/lumber-boards/dimensional-lumber/ac2-reg-2-x-4-2-prime-ground-contact-green-pressure-treated-lumber/1110818/p-1444422742084-c-13125.htm' },
  { key: 'pt-2x6x8',       name: 'PT 2x6x8',           unit: 'each', url: 'https://www.menards.com/main/building-materials/lumber-boards/dimensional-lumber/ac2-reg-2-x-6-2-prime-ground-contact-green-pressure-treated-lumber/1111024/p-1444422259079-c-13125.htm' },
  { key: 'pt-4x4x8',       name: 'PT 4x4x8 Post',      unit: 'each', url: 'https://www.menards.com/main/building-materials/lumber-boards/timbers-logs/ac2-reg-4-x-4-2-ground-contact-green-pressure-treated-timber/1112214/p-1444422036847-c-13131.htm' },
  { key: 'pt-2x10x12',     name: 'PT 2x10x12',         unit: 'each', url: 'https://www.menards.com/main/building-materials/lumber-boards/dimensional-lumber/ac2-reg-2-x-10-2-prime-ground-contact-green-pressure-treated-lumber/1111642/p-1444422264185-c-13125.htm' },
  { key: 'pt-54x6-deck',   name: 'PT 5/4x6x16 Deck Board', unit: 'each', url: 'https://www.menards.com/main/building-materials/lumber-boards/treated-wood-products/treated-boards-decking-lumber-timbers/ac2-reg-5-4-x-6-above-ground-green-pressure-treated-thick-decking/1110669/p-1444422768455.htm' },

  // ── Sheathing ─────────────────────────────────────────────────────────
  { key: '716-osb-4x8',    name: '7/16 OSB 4x8',        unit: 'sheet', url: 'https://www.menards.com/main/building-materials/panel-products/osb-sheathing/7-16-x-4-x-8-osb/1242728-2/p-1444422471192-c-13330.htm' },
  { key: '12-osb-4x8',     name: '1/2 OSB 4x8',         unit: 'sheet', url: 'https://www.menards.com/main/building-materials/panel-products/osb-sheathing/1-2-x-4-x-8-osb/1242809-2/p-1444422395209-c-13330.htm' },
  { key: '34-osb-4x8',     name: '3/4 OSB T&G Subfloor 4x8', unit: 'sheet', url: 'https://www.menards.com/main/building-materials/panel-products/tongue-groove-subfloor-panels/3-4-x-4-x-8-sturd-i-floor-tongue-groove-osb-subfloor/1242867/p-1444422040311-c-13333.htm' },
  { key: '12-plywood-4x8', name: '1/2 Plywood 4x8',     unit: 'sheet', url: 'https://www.menards.com/main/building-materials/panel-products/plywood-sheathing/1-2-x-4-x-8-4-ply-plywood-rated-sheathing/1231098/p-1444431327404-c-13331.htm' },
  { key: '34-plywood-4x8', name: '3/4 Plywood 4x8',     unit: 'sheet', url: 'https://www.menards.com/main/building-materials/panel-products/plywood-sheathing/3-4-x-4-x-8-plywood-rated-sheathing/1231182/p-1444431334153-c-13331.htm' },

  // ── Drywall ───────────────────────────────────────────────────────────
  { key: '12-drywall-4x8',   name: '1/2 Drywall 4x8',        unit: 'sheet', url: 'https://www.menards.com/main/building-materials/drywall/drywall-sheets/1-2-x-4-x-8-lightweight-drywall/1311223/p-1444421962026-c-5656.htm' },
  { key: '12-drywall-4x12',  name: '1/2 Drywall 4x12',       unit: 'sheet', url: 'https://www.menards.com/main/building-materials/drywall/drywall-sheets/1-2-x-4-x-12-lightweight-drywall/1311248/p-1444422269728-c-5656.htm' },
  { key: '58-typex-4x8',     name: '5/8 Type X Drywall 4x8', unit: 'sheet', url: 'https://www.menards.com/main/building-materials/drywall/drywall-sheets/5-8-x-4-x-8-toughrock-reg-lightweight-fire-rated-drywall-board/1311309/p-1444431324278-c-5656.htm' },
  { key: '58-typex-4x12',    name: '5/8 Type X Drywall 4x12',unit: 'sheet', url: 'https://www.menards.com/main/building-materials/drywall/drywall-sheets/5-8-x-4-x-12-type-x-fire-rated-drywall/1311303/p-1444422119706-c-5656.htm' },

  // ── Roofing ───────────────────────────────────────────────────────────
  { key: 'arch-shingles',     name: 'Architectural Shingles Bundle', unit: 'bundle', url: 'https://www.menards.com/main/building-materials/roofing/roofing-shingles/owens-corning-reg-trudefinition-reg-duration-reg-architectural-roofing-shingles-32-8-sq-ft/du05/p-1444450503747-c-5814.htm' },
  { key: 'ice-water-shield',  name: 'Ice Water Shield Roll',         unit: 'roll',   url: 'https://www.menards.com/main/building-materials/roofing/roofing-underlayment/tarco-leak-barrier-3-x-65-granulated-ice-water-barrier-195-sq-ft/1511830/p-1444444738879-c-13250.htm' },
  { key: 'roofing-felt-15lb', name: 'Roofing Felt 15lb Roll',        unit: 'roll',   url: 'https://www.menards.com/main/building-materials/roofing/roofing-underlayment/15-felt-3-x-144-roofing-underlayment-432-sq-ft/1511789/p-1444430930268-c-13250.htm' },
  { key: 'drip-edge-d-10ft',  name: 'Drip Edge D-Style 10ft',        unit: 'each',   url: 'https://www.menards.com/main/building-materials/roofing/roof-edge-tools-accessories/2-5-8-x-1-1-8-x-10-style-d-steel-drip-edge/galvanized1571360/p-1444448598784-c-5817.htm' },
  { key: 'drip-edge-f-12ft',  name: 'Drip Edge Alum D-Style 12ft',   unit: 'each',   url: 'https://www.menards.com/main/building-materials/roofing/roof-edge-tools-accessories/2-5-8-x-1-11-16-x-12-style-d-aluminum-drip-edge/ade12-wh/p-1444424196953-c-5817.htm' },
  { key: 'ridge-vent-roll',   name: 'Ridge Vent Shingle-Over 20ft',  unit: 'roll',   url: 'https://www.menards.com/main/building-materials/roofing/roof-ventilation/owens-corning-reg-ventsure-reg-11-1-4-x-20-shingle-over-ridge-vent-with-coil-roofing-nails/1474949/p-1444450488871-c-13258.htm' },
  { key: 'pipe-boot',         name: 'Pipe Boot Flashing 3in',        unit: 'each',   url: 'https://www.menards.com/main/building-materials/roofing/roof-flashing/proboot-pipe-flashing/59008/p-1518593427772-c-5810.htm' },

  // ── Aluminum — Coil, Fascia, Soffit, J-Channel ───────────────────────
  { key: 'j-channel-white-12ft', name: 'J-Channel White 12ft',    unit: 'each',  url: 'https://www.menards.com/main/building-materials/soffit/sell-even-12-aluminum-j-channel/ut-wh/p-1444424195722-c-1488981946224.htm' },
  { key: 'alum-coil-white',      name: 'Aluminum Coil 24x50 White', unit: 'roll', url: 'https://www.menards.com/main/building-materials/roofing/roof-flashing/24-x-50-reversible-aluminum-trim-coil/m280white/p-1454046146571-c-5810.htm' },
  { key: 'alum-soffit-vented',   name: 'Aluminum Soffit Vented 16x12', unit: 'panel', url: 'https://www.menards.com/main/building-materials/soffit/16-x-12-aluminum-vented-soffit/4pvs16-wh/p-1444424174629-c-1488981946224.htm' },
  { key: 'alum-fascia',          name: 'Aluminum Fascia 8x12',     unit: 'panel', url: 'https://www.menards.com/main/building-materials/soffit/sell-even-8-x-12-aluminum-smooth-fascia/fh8-bl/p-1642874254410035-c-1488981946224.htm' },

  // ── Insulation ────────────────────────────────────────────────────────
  { key: 'r13-batt-15in', name: 'R13 Batt 15in', unit: 'bag', url: 'https://www.menards.com/main/building-materials/insulation/insulation-rolls-batts/r-13-ecobatt-reg-unfaced-fiberglass-insulation-batt-15-x-93/510519/p-1444437009992-c-5780.htm' },
  { key: 'r19-batt-15in', name: 'R19 Batt 15in', unit: 'bag', url: 'https://www.menards.com/main/building-materials/insulation/insulation-rolls-batts/r-19-ecobatt-reg-unfaced-fiberglass-insulation-batt-15-x-93/510516/p-1444437006428-c-5780.htm' },
  { key: 'r21-batt-15in', name: 'R21 Batt 15in', unit: 'bag', url: 'https://www.menards.com/main/building-materials/insulation/insulation-rolls-batts/r-21-ecobatt-reg-unfaced-fiberglass-insulation-batt-15-x-105/506594/p-1444436999564-c-5780.htm' },
  { key: 'r38-batt',      name: 'R38 Batt Attic 24in', unit: 'bag', url: 'https://www.menards.com/main/building-materials/insulation/insulation-rolls-batts/r-38-ecobatt-reg-unfaced-fiberglass-insulation-batt-24-x-48/5001657/p-1444437012084-c-5780.htm' },
  { key: 'r49-batt',      name: 'R49 Batt Attic 24in', unit: 'bag', url: 'https://www.menards.com/main/building-materials/insulation/insulation-rolls-batts/r-49-ecobatt-reg-unfaced-fiberglass-insulation-batt-24-x-48/5004347/p-1444437007682-c-5780.htm' },
  { key: 'rigid-foam-2in', name: '2in Rigid Foam 4x8 R8',  unit: 'sheet', url: 'https://www.menards.com/main/building-materials/insulation/foam-board-insulation/r-8-expanded-polystyrene-2-x-4-x-8-foam-board-insulation/1632118/p-1444435971902-c-5779.htm' },
  { key: 'rigid-foam-1in', name: '1in Rigid Foam 4x8 R4',  unit: 'sheet', url: 'https://www.menards.com/main/building-materials/insulation/foam-board-insulation/r-4-laminated-expanded-polystyrene-1-x-4-x-8-foam-board-insulation/1632100/p-1444435971965-c-5779.htm' },
  { key: 'spray-foam-can', name: 'Great Stuff Spray Foam 12oz', unit: 'each', url: 'https://www.menards.com/main/paint/caulks-sealants/spray-foam-rubberized-sealant/great-stuff-trade-gaps-cracks-expanding-spray-foam-12-oz/227112/p-1444435968839-c-7937.htm' },

  // ── Siding ────────────────────────────────────────────────────────────
  { key: 'vinyl-siding',     name: 'Cedar Creek Vinyl Siding Double 4in Panel', unit: 'panel', url: 'https://www.menards.com/main/building-materials/siding/vinyl-siding/cedar-creek-trade-double-4-x-126-vinyl-siding/vlc4001/p-1444437136993-c-5838.htm' },
  { key: 'lp-smartside-lap', name: 'LP SmartSide Lap Siding 8in x 16ft',       unit: 'piece', url: 'https://www.menards.com/main/building-materials/siding/engineered-wood-siding/lp-reg-smartside-reg-3-8-x-16-textured-engineered-wood-lap-siding/1422204/p-1444438211763-c-5827.htm' },

  // ── MiTek Structural Connectors (Menards brand, not Simpson) ─────────
  { key: 'mitek-jl26',     name: 'MiTek JL26 Joist Hanger 2x6', unit: 'each', url: 'https://www.menards.com/main/hardware/fasteners-connectors/construction-hardware/structural-hangers/mitek-reg-g90-steel-face-mount-joist-hanger/jl26/p-1444445492707-c-8843.htm' },
  { key: 'mitek-hus28',    name: 'MiTek HUS28 Joist Hanger 2x8', unit: 'each', url: 'https://www.menards.com/main/hardware/fasteners-connectors/construction-hardware/structural-hangers/mitek-reg-g90-steel-slant-nail-double-face-mount-hanger/hus28-2/p-1444445479849-c-8843.htm' },
  { key: 'mitek-rt7a',     name: 'MiTek RT7A Hurricane Tie',     unit: 'each', url: 'https://www.menards.com/main/hardware/fasteners-connectors/construction-hardware/truss-rafter-tiedowns/mitek-reg-6-1-2-x-1-1-2-hurricane-seismic-anchor-tie/rt7a/p-1444445511509-c-8891.htm' },
  { key: 'mitek-post-base', name: 'MiTek Post Base 4x4 HDG',     unit: 'each', url: 'https://www.menards.com/main/hardware/fasteners-connectors/construction-hardware/column-post-bases-caps/mitek-reg-4-x-4-hot-dipped-galvanized-post-base/epb4408-hdg/p-1444445469992-c-8825.htm' },

  // ── Fasteners + Adhesive ──────────────────────────────────────────────
  { key: '16d-nails-5lb',    name: '16d Common Nails 5lb',              unit: 'box',  url: 'https://www.menards.com/main/hardware/fasteners-connectors/nails/common-nails/grip-fast-reg-3-1-2-16d-bright-smooth-shank-common-nail-5-lb-box/2295088/p-1642874269878818-c-8759.htm' },
  { key: '8d-nails-5lb',     name: '8d Common Nails 5lb',               unit: 'box',  url: 'https://www.menards.com/main/hardware/fasteners-connectors/nails/common-nails/grip-fast-reg-2-1-2-8d-bright-smooth-shank-common-nail-5-lb-box/229-5062/p-1642874269878755-c-8759.htm' },
  { key: '3in-screws-5lb',   name: '3in Construction Screws 5lb',       unit: 'box',  url: 'https://www.menards.com/main/hardware/fasteners-connectors/screws/wood-screws/grip-fast-reg-8-x-3-phillips-drive-yellow-zinc-bugle-head-construction-screw-5-lb-box/2290313/p-3289655538558316-c-8940.htm' },
  { key: 'liquid-nails',     name: 'Liquid Nails Heavy Duty 10oz',      unit: 'tube', url: 'https://www.menards.com/main/paint/adhesives-glue-tape/adhesive/construction-adhesives/liquid-nails-reg-heavy-duty-construction-adhesive/ln903/p-1499754683507-c-7921.htm' },
  { key: 'subfloor-adhesive', name: 'PL Premium Subfloor Adhesive 10oz', unit: 'tube', url: 'https://www.menards.com/main/paint/adhesives-glue-tape/adhesive/construction-adhesives/loctite-reg-pl-premium-reg-3x-polyurethane-construction-adhesive/1390595/p-1444432302579-c-7921.htm' },

  // ── Concrete + Foundation ─────────────────────────────────────────────
  { key: '60lb-concrete', name: '60lb Concrete Mix', unit: 'bag', url: 'https://www.menards.com/main/building-materials/concrete-cement-masonry/bagged-concrete-cement-mortar/concrete-mix-60-lbs/1891030/p-1444441405889-c-5648.htm' },
  // Menards does not stock 80lb concrete mix bags — omitted

  // ── Windows ───────────────────────────────────────────────────────────
  { key: 'window-dh-30x40', name: 'Window 30x40 Double Hung', unit: 'each', url: 'https://www.menards.com/main/doors-windows-millwork/windows/standard-sized-windows/double-hung-windows/jeld-wen-reg-good-series-vinyl-double-hung-window-with-nailing-flange/jw1792-00213/p-1454045279836-c-1482327569454.htm' },
  { key: 'window-dh-30x48', name: 'Window 30x48 Double Hung', unit: 'each', url: 'https://www.menards.com/main/doors-windows-millwork/windows/standard-sized-windows/double-hung-windows/jeld-wen-reg-builders-series-30w-x-48h-vinyl-double-hung-window-with-flange-grids/jwm1438-007995/p-1470102149210-c-1482327569454.htm' },
  { key: 'window-dh-36x48', name: 'Window 36x48 Double Hung', unit: 'each', url: 'https://www.menards.com/main/doors-windows-millwork/windows/standard-sized-windows/double-hung-windows/performax-trade-white-vinyl-double-hung-windows-with-nailing-flange/4048740/p-1642874306206424-c-1482327569454.htm' },
  { key: 'window-dh-48x48', name: 'Window 48x48 Double Hung', unit: 'each', url: 'https://www.menards.com/main/doors-windows-millwork/windows/standard-sized-windows/double-hung-windows/performax-trade-white-vinyl-double-hung-windows-with-nailing-flange/4048765/p-1642874312335577-c-1482327569454.htm' },

  // ── Doors ─────────────────────────────────────────────────────────────
  { key: 'door-steel-6panel-30',    name: 'Steel Entry Door 3-0 6-Panel Prehung', unit: 'each', url: 'https://www.menards.com/main/doors-windows-millwork/exterior-doors/front-doors/mastercraft-reg-primed-steel-6-panel-prehung-exterior-door/4140330/p-1500273188388-c-9356.htm' },
  { key: 'door-interior-2panel-30', name: 'Interior Door 3-0 2-Panel Prehung',    unit: 'each', url: 'https://www.menards.com/main/doors-windows-millwork/interior-doors/interior-prehung-doors/mastercraft-reg-primed-2-panel-prehung-interior-door/4110636/p-1642874308457623-c-3638.htm' },

  // ── Housewrap + Misc Exterior ─────────────────────────────────────────
  { key: 'housewrap-block-it', name: 'House Wrap Block-It 10x100',   unit: 'roll', url: 'https://www.menards.com/main/building-materials/siding/house-wrap/kimberly-clark-block-it-reg-house-wrap/1612999/p-1444453630065.htm' },
  { key: 'flashing-tape-4in',  name: 'Flashing Tape Butyl 4in x33ft', unit: 'roll', url: 'https://www.menards.com/main/hardware/weather-stripping/tite-seal-reg-4-x-33-self-adhesive-ultra-butyl-window-flashing-tape/tsbultra433/p-1444426702393-c-3624.htm' },
  { key: 'vapor-barrier-6mil', name: '6 Mil Vapor Barrier 10x100',   unit: 'roll', url: 'https://www.menards.com/main/paint/painting-protection/plastic-sheeting/polar-plastics-100-6-mil-clear-poly-plastic-sheeting/5680275/p-1444451030057-c-8188.htm' },

];
