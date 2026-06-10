/**
 * Material catalog — turns a free-form ledger line ("2x4x10ft Standard Studs",
 * '7/16" OSB Sheathing panels') into a physically-dimensioned stack spec the
 * yard renderer can build. All linear dims are FEET (1 unit = 1 ft in-scene).
 */
import type { MaterialItem } from "../../types";

export type StackKind =
  | "lumber" | "sheet" | "bag" | "bucket" | "carton"
  | "roll" | "bundle" | "pipe" | "crate";

export interface StackSpec {
  kind: StackKind;
  label: string;          // short sprite label, e.g. '2x4x10 SPF'
  pieces: number;         // physical pieces to draw (after unit conversion)
  ledgerQty: number;      // raw ledger quantity (tooltip)
  unit: string;
  trade: string;
  name: string;           // full ledger name (tooltip)
  pieceWeightLbs: number;
  treated: boolean;
  widthFt: number;        // lumber/pipe cross-section width (or pipe diameter)
  thickFt: number;        // lumber cross-section thickness
  lengthFt: number;       // lumber/pipe piece length
  sheetWFt: number;       // sheet plan dims
  sheetLFt: number;
  sheetThickFt: number;
  surface: "spf" | "pt" | "osb" | "plywood" | "drywall" | "cement" | "none";
  tradeColor: number;
}

// Nominal → actual dressed dimension (inches). 2x4 is really 1.5" × 3.5".
const NOMINAL_IN: Record<number, number> = {
  1: 0.75, 2: 1.5, 3: 2.5, 4: 3.5, 5: 4.5, 6: 5.5, 8: 7.25, 10: 9.25, 12: 11.25,
};

// Densities, lb/ft³ — kiln-dried SPF ≈ 27, treated SYP carries water, OSB/ply
// resin boards, 1/2" gypsum ≈ 1.6 lb/ft².
const DENSITY = { spf: 27, pt: 40, osb: 38, plywood: 34, drywall: 38, cement: 72 };

export const TRADE_COLORS: Record<string, number> = {
  framing: 0xe3c193, drywall: 0xcbd5e1, concrete: 0x8d8d8d, roofing: 0x6b4226,
  electrical: 0xffd700, plumbing: 0x4a90d9, flooring: 0xb5854b, tile: 0x6baed6,
  paint: 0xf4a7b9, insulation: 0xffa040, hvac: 0x90e0ef, deck: 0xa0522d,
  fence: 0x8b6914, siding: 0x7fb3d3, masonry: 0x9c7a56, default: 0x7c3aed,
};

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** "7/16", "1/2" (optionally followed by a quote/`in`) → inches as decimal. */
function parseFractionInches(text: string): number | null {
  const m = text.match(/(\d{1,2})\s*\/\s*(\d{1,2})\s*(?:["”']|\s*in(?:ch)?)?/);
  if (!m) return null;
  const v = parseInt(m[1], 10) / parseInt(m[2], 10);
  return v > 0 && v <= 2 ? v : null;
}

/** Explicit "...ft" / "...'" length anywhere in the name, e.g. "16ft", "12'". */
function parseLengthFt(text: string): number | null {
  const m = text.match(/(\d{1,2})\s*(?:ft|f't|['’](?!\d))/i);
  if (!m) return null;
  const v = parseInt(m[1], 10);
  return v >= 4 && v <= 24 ? v : null;
}

function unitIsSquareFeet(unit: string) {
  return /sq\.?\s*(ft|feet)|sqft|\bsf\b/i.test(unit);
}

function base(item: MaterialItem): StackSpec {
  const trade = (item.trade || "default").toLowerCase();
  return {
    kind: "crate", label: trade.toUpperCase(), pieces: 1,
    ledgerQty: item.quantity || 1, unit: item.unit || "pcs", trade,
    name: item.name, pieceWeightLbs: 80, treated: false,
    widthFt: 0, thickFt: 0, lengthFt: 0,
    sheetWFt: 4, sheetLFt: 8, sheetThickFt: 0.5 / 12, surface: "none",
    tradeColor: TRADE_COLORS[trade] ?? TRADE_COLORS.default,
  };
}

/** Classify one ledger material line into a buildable stack spec. */
export function classifyMaterial(item: MaterialItem): StackSpec {
  const spec = base(item);
  const n = (item.name || "").toLowerCase();
  const qty = Math.max(1, Math.round(item.quantity || 1));
  spec.pieces = qty;

  // ── Sheet goods (checked before lumber: "4x8" here means feet, not nominal) ──
  const sheetMatch =
    /\bosb\b|plywood|sheathing|drywall|sheetrock|gypsum|wafer\s*board|cement\s*board|hardie|durock|underlayment|advantech|zip\s*system/.exec(n);
  if (sheetMatch) {
    spec.kind = "sheet";
    spec.surface =
      /drywall|sheetrock|gypsum/.test(n) ? "drywall" :
      /cement\s*board|hardie|durock/.test(n) ? "cement" :
      /plywood|underlayment/.test(n) ? "plywood" : "osb";
    const dims = n.match(/\b([34])\s*[x×]\s*(8|9|10|12)\b/);
    if (dims) { spec.sheetWFt = parseInt(dims[1], 10); spec.sheetLFt = parseInt(dims[2], 10); }
    const thickIn = parseFractionInches(n) ??
      ({ drywall: 0.5, cement: 0.5, plywood: 0.5, osb: 0.4375 } as const)[
        spec.surface as "drywall" | "cement" | "plywood" | "osb"];
    spec.sheetThickFt = thickIn / 12;
    if (unitIsSquareFeet(spec.unit)) {
      spec.pieces = Math.max(1, Math.ceil(qty / (spec.sheetWFt * spec.sheetLFt)));
    }
    spec.pieceWeightLbs = spec.sheetWFt * spec.sheetLFt * spec.sheetThickFt * DENSITY[spec.surface];
    const thickLabel = thickIn === 0.4375 ? '7/16"' : thickIn === 0.5 ? '1/2"' : thickIn === 0.625 ? '5/8"' : `${thickIn}"`;
    spec.label = `${thickLabel} ${spec.surface.toUpperCase()}`;
    return spec;
  }

  // ── Bagged goods (concrete mix, mortar, thinset…) ──
  if (/concrete\s*mix|quikrete|sakrete|mortar|thinset|grout|\bcement\b|stucco\s*mix|sand\s*mix|tube\s*sand/.test(n)
      || /bag/i.test(spec.unit)) {
    spec.kind = "bag";
    const lb = n.match(/\b(40|50|60|80|90)\s*-?\s*lb/);
    spec.pieceWeightLbs = lb ? parseInt(lb[1], 10) : 60;
    spec.label = `${spec.pieceWeightLbs} LB BAGS`;
    return spec;
  }

  // ── Buckets / pails (paint, mud, adhesive) ──
  if (/paint|primer|stain(?!less)|sealer|sealant|joint\s*compound|\bmud\b|adhesive|mastic|water-?proofing|coating/.test(n)) {
    spec.kind = "bucket";
    if (/gal/i.test(spec.unit)) spec.pieces = Math.max(1, Math.ceil(qty / 5));
    spec.pieces = clamp(spec.pieces, 1, 48);
    spec.pieceWeightLbs = 55;
    spec.label = "5-GAL PAILS";
    return spec;
  }

  // ── Fasteners & hardware → cartons ──
  if (/nail|screw|fastener|staple|hanger|hurricane|connector|strap(?!ping)|anchor|\bbolt\b|simpson|\btie\b/.test(n)) {
    spec.kind = "carton";
    spec.pieces = /\blbs?\b/i.test(spec.unit)
      ? Math.ceil(qty / 30)                       // 30 lb cartons
      : /box|carton|case/i.test(spec.unit) ? qty
      : Math.ceil(qty / 250);                     // loose pieces per carton
    spec.pieces = clamp(spec.pieces, 1, 45);
    spec.pieceWeightLbs = 30;
    spec.label = "FASTENERS";
    return spec;
  }

  // ── Shingles → bundles ──
  if (/shingle/.test(n)) {
    spec.kind = "bundle";
    if (/\bsq(uare)?s?\b/i.test(spec.unit)) spec.pieces = qty * 3; // 3 bundles / square
    spec.pieces = clamp(spec.pieces, 1, 126);
    spec.pieceWeightLbs = 75;
    spec.label = "SHINGLE BUNDLES";
    return spec;
  }

  // ── Insulation / wraps → rolls ──
  if (/insulation|\bbatt\b|fiberglass|mineral\s*wool|rockwool|house\s*wrap|tyvek|felt\s*paper|roll/.test(n)) {
    spec.kind = "roll";
    if (unitIsSquareFeet(spec.unit)) spec.pieces = Math.max(1, Math.ceil(qty / 40));
    spec.pieces = clamp(spec.pieces, 1, 24);
    spec.pieceWeightLbs = 35;
    spec.label = "INSULATION ROLLS";
    return spec;
  }

  // ── Pipe / conduit ──
  if (/\bpipe\b|conduit|\bpex\b|\bpvc\b|\babs\b|\bemt\b|downspout/.test(n)) {
    spec.kind = "pipe";
    const diaMatch = n.match(/\b([123])\s*(?:["”]|in(?:ch)?\b)/);
    const diaIn = parseFractionInches(n) ?? (diaMatch ? parseInt(diaMatch[1], 10) : 1.5);
    spec.widthFt = Math.max(diaIn, 1.25) / 12;    // visual floor so 1/2" PEX is visible
    spec.lengthFt = parseLengthFt(n) ?? 10;
    if (/\b(lf|lin|ft|feet)\b/i.test(spec.unit)) spec.pieces = Math.max(1, Math.ceil(qty / spec.lengthFt));
    spec.pieces = clamp(spec.pieces, 1, 200);
    spec.pieceWeightLbs = spec.lengthFt * 0.8;
    spec.label = "PIPE / CONDUIT";
    return spec;
  }

  // ── Dimensional lumber ──
  const nom = n.match(/\b(\d{1,2})\s*[x×]\s*(\d{1,2})(?:\s*[x×]\s*(\d{1,2}))?\b/);
  const lumberWords = /stud|lumber|plate|joist|rafter|beam|header|post|board|furring|blocking|truss|fascia|ledger|sill|skirt|decking|\bspf\b|\bsyp\b|cedar/.test(n);
  // A bare NxM only reads as lumber when the smaller nominal is a real
  // cross-section (≤4") — keeps "12x12 tile" / "24x24 pavers" out of the bunks.
  const nomIsLumber = !!nom &&
    Math.min(parseInt(nom[1], 10), parseInt(nom[2], 10)) <= 4 &&
    parseInt(nom[1], 10) in NOMINAL_IN && parseInt(nom[2], 10) in NOMINAL_IN;
  if (nomIsLumber || lumberWords || spec.trade === "framing" || spec.trade === "deck" || spec.trade === "fence") {
    spec.kind = "lumber";
    let a = 2, b = 4;
    if (nom) {
      a = parseInt(nom[1], 10); b = parseInt(nom[2], 10);
      if (!(a in NOMINAL_IN)) a = 2;
      if (!(b in NOMINAL_IN)) b = 4;
    }
    const thickIn = Math.min(NOMINAL_IN[a], NOMINAL_IN[b]);
    const widthIn = Math.max(NOMINAL_IN[a], NOMINAL_IN[b]);
    spec.thickFt = thickIn / 12;
    spec.widthFt = widthIn / 12;
    const third = nom?.[3] ? parseInt(nom[3], 10) : null;
    spec.lengthFt = (third && third >= 4 && third <= 24 ? third : null) ?? parseLengthFt(n) ?? 8;
    spec.treated = /treated|\bpt\b|\bsill\b|\bsole\b|ground\s*contact|\bac2\b|\bacq\b/.test(n);
    spec.surface = spec.treated ? "pt" : "spf";
    const density = spec.treated ? DENSITY.pt : DENSITY.spf;
    spec.pieceWeightLbs = spec.widthFt * spec.thickFt * spec.lengthFt * density;
    if (/\b(lf|lin\.?\s*ft|board\s*f)/i.test(spec.unit)) {
      spec.pieces = Math.max(1, Math.ceil(qty / spec.lengthFt));
    }
    spec.pieces = clamp(spec.pieces, 1, 4000);
    spec.label = `${Math.min(a, b)}x${Math.max(a, b)}x${spec.lengthFt} ${spec.treated ? "PT" : "SPF"}`;
    return spec;
  }

  // ── Fallback: trade-colored supply crate ──
  spec.pieces = 1;
  spec.pieceWeightLbs = 120;
  spec.label = `${spec.trade.toUpperCase()} SUPPLY`;
  return spec;
}

/** Deterministic PRNG so a given estimate always renders the identical yard. */
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
