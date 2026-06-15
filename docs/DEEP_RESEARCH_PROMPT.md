# Deep Research Prompt — Takeoff Formula & Span-Table Catalog

Run this in **Gemini Deep Research**. It returns a machine-usable catalog that
drops straight into the deterministic Takeoff engine. The output is split into
two buckets with very different trust levels:

- **`takeoff_formulas`** — pure quantity geometry (counting). Safe to auto-compute.
- **`span_tables`** — structural sizing. **Lookup only, never computed.** Every
  row must cite a published table; anything not in a table must be omitted, not
  guessed. A wrong structural value is a liability, not just an inaccuracy.

Paste everything below the line into Deep Research.

---

**Role:** You are a residential construction estimating and light-frame
engineering reference compiler (IRC scope, US wood-framed residential). Produce a
complete, citation-backed catalog. **Output strict JSON only — no prose, no
markdown.** Two top-level arrays: `takeoff_formulas` and `span_tables`.

**Scope — v1 only.** Cover exactly these assemblies; do not add others:
1. **Wall framing** — studs by on-center spacing including corner/T studs and
   per-opening (door/window) stud adders; sole + top plates; framing labor hours.
2. **Drywall** — sheets for given wall area and number of sides, plus joint
   compound (mud), tape, screws, and corner bead, with a waste factor.
3. **Exterior sheathing** — OSB/plywood sheets for wall area, house wrap, and
   fasteners, with a waste factor.
4. **Headers over openings** — span-table sizing for dimensional-lumber and LVL
   headers at typical residential and garage-door spans (this goes in
   `span_tables`, NOT `takeoff_formulas`).

**`takeoff_formulas[]` — each entry:**
```json
{
  "assembly": "wall_frame | drywall | exterior_sheathing",
  "item": "descriptive material name, e.g. '2x4 stud'",
  "inputs": ["length_ft", "height_ft", "stud_spacing_in", "openings"],
  "formula": "explicit arithmetic in the named inputs, e.g. 'ceil(length_ft*12/stud_spacing_in)+1+corner_studs+opening_studs'",
  "constants": { "corner_studs": { "value": 3, "meaning": "extra studs per wall for corners/T-intersections" } },
  "waste_factor": 0.05,
  "unit": "pcs | sheet | lb | roll | ea",
  "rounding": "ceil | round | none",
  "assumptions": ["both wall faces counted for drywall", "..."],
  "source": { "name": "IRC 2021 / NAHB Cost Estimating / manufacturer", "table_or_section": "R602.3", "url": "https://..." }
}
```
Rules: every `formula` must be reproducible arithmetic on the named `inputs`
(no prose math, no "approximately"). State every constant and its meaning. Cite a
real source for each entry.

**`span_tables[]` — each entry (structural; lookup only):**
```json
{
  "member_type": "dimensional_header | LVL_header",
  "application": "exterior_bearing_wall | interior_nonbearing | garage_door_opening",
  "rows": [
    { "max_span_ft": 8, "load_condition": "roof+ceiling", "size": "2-2x10", "plies": 2, "species_grade": "SPF #2", "notes": "" }
  ],
  "source": { "name": "IRC 2021", "table": "R602.7(1)", "edition": "2021", "url": "https://..." },
  "disclaimer": "Verify load case, snow/roof load, and local AHJ amendments."
}
```
Rules — **critical:**
- Cover typical residential AND garage-door spans (e.g. 4, 6, 8, 9, 16, 18 ft).
- **Cite the published table for every row.** IRC R602.7 / R802 tables, AWC, or a
  named LVL manufacturer load table (e.g. Weyerhaeuser/Trus Joist).
- **If a value is not in a published table, OMIT it.** Do not interpolate between
  rows, do not extrapolate beyond a table, do not invent a size. Prefer fewer,
  fully-cited rows over broad coverage.
- Flag any load/AHJ-dependent caveat in `notes` or the entry `disclaimer`.

**Final reminder:** `takeoff_formulas` = counting (safe). `span_tables` = engineering
(cite or omit). When unsure about a structural value, leave it out — the app will
tell the contractor to confirm the size with their supplier, which is correct.

---

## Importing the result

1. Save the `span_tables` array into `src/data/spanTables.json` under `members`
   (keep the `version` field, e.g. the research date).
2. The `takeoff_formulas` array feeds `src/lib/takeoffEngine.js` / `takeoffConstants.js`
   — reconcile each formula's constants with `conventions`, and add the consumable
   lines (mud, tape, screws, bead, wrap, fasteners) that v1's engine does not yet emit.
3. Run `npm test` — `takeoffTables.test.js` validates the JSON shape and the
   never-interpolate lookup; a malformed import fails loudly.
