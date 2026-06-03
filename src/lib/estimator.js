'use strict';

const { parseGeminiJSON } = require('./sanitize');

const MODEL = 'gemini-3.5-flash';

// ══════════════════════════════════════════════════════════════════════
//  STRICT TRADE ENUM — enforced via the extraction schema below.
//  Single source of truth: server.js imports this from here.
// ══════════════════════════════════════════════════════════════════════
const VALID_TRADES = [
    'concrete', 'flooring', 'roofing', 'tile', 'drywall', 'deck', 'fence',
    'paint', 'kitchen-remodel', 'bathroom-remodel', 'siding', 'insulation',
    'gravel', 'mulch', 'electrical', 'plumbing', 'labor-general', 'hvac',
    'windows', 'doors', 'countertops', 'cabinetry', 'gutters', 'demolition',
    'landscaping', 'foundation', 'garage', 'masonry', 'stucco', 'driveways',
    'waterproofing', 'framing', 'excavation',
];

// ══════════════════════════════════════════════════════════════════════
//  EXTRACTION SYSTEM PROMPT — pure extraction only, NO pricing logic.
//  Pricing is handled deterministically downstream by Stage 2 (the Pricer).
// ══════════════════════════════════════════════════════════════════════
const EXTRACTION_PROMPT =
    `You are an expert residential construction estimator based in central Wisconsin. ` +
    `Extract materials and labor from the contractor's job description below.\n` +
    `Always infer or extract a projectName from context (default: 'General').\n` +
    `Extract ONLY the new items mentioned. Do not pad or duplicate.\n\n` +
    `SCOPE_OF_WORK: Write a professional 2-3 sentence project scope summary suitable for a contractor estimate document. Base it strictly on the job description provided. Use formal language a homeowner or insurance adjuster would expect to read.\n\n` +
    `MATERIAL NAMES: Use highly descriptive, industry-standard terminology a contractor would use ` +
    `(e.g. "2x6x16 Pressure Treated Lumber", "30-Year Architectural Shingles", "5/8 inch Type X Drywall"). ` +
    `Include size, grade, or spec when mentioned or inferable.\n\n` +
    `TRADE FIELD: Each material MUST have a "trade" field set to exactly one of:\n` +
    `${VALID_TRADES.join(', ')}\n` +
    `Do NOT use the trade name as the material name.\n\n` +
    `ESTIMATED_UNIT_COST: For every material item, add a numeric "estimated_unit_cost" field. ` +
    `This is YOUR best conservative retail unit price estimate in USD for central Wisconsin — ` +
    `think Home Depot / Menards shelf price. Be specific and accurate. ` +
    `This is a fallback safety net; slightly conservative is better than zero.\n\n` +
    `EXPLICIT_USER_PRICE: If the user explicitly states a unit price for a material or labor item ` +
    `(e.g. "framing lumber at $1.25 a board foot", "OSB costing $15 each", "shingles for $120 a square"), ` +
    `extract that EXACT number into the "explicit_user_price" field — e.g. 1.25, 15.00, or 120.00. ` +
    `If NO price is dictated by the user, this field MUST be strictly null (not zero, not omitted — null).\n\n` +
    `Output ONLY valid JSON, no markdown:\n` +
    `{ "projectName": "String", ` +
    `"scope_of_work": "String", ` +
    `"materials": [{ "name": "descriptive name", "quantity": 0, "unit": "", "trade": "enum", "estimated_unit_cost": 0.00, "explicit_user_price": null }], ` +
    `"labor": [{ "role": "", "hours": 0, "explicit_user_price": null }] }`;

/**
 * Stage 1 — The Estimator (LLM boundary #1 of the deterministic pipeline).
 *
 * Sole responsibility: turn a raw input into a structured, PRICE-FREE scope of
 * work. It is deliberately input-source-agnostic — text, a voice transcript, or
 * (Sprint 3) a blueprint image all flow through the same extraction contract.
 * Stages 2 and 3 never learn which source produced the scope, which is what
 * makes the future Gemini-Vision pivot a ~20-line swap rather than a rewrite.
 *
 * @param {{ ai: import('@google/genai').GoogleGenAI }} deps
 * @returns {{ extractScope: (input: EstimatorInput) => Promise<ExtractedScope> }}
 *
 * @typedef {{ type?: 'text'|'voice'|'image', payload: string|object }} EstimatorInput
 * @typedef {{ projectName: string, scope_of_work: string, materials: object[], labor: object[], source: string, usage: object }} ExtractedScope
 */
function createEstimator({ ai }) {

    /**
     * @param {EstimatorInput} input
     * @returns {Promise<ExtractedScope>}
     */
    async function extractScope(input) {
        const { type = 'text', payload } = input || {};

        let contents;
        if (type === 'image') {
            // Sprint 3 hook: payload is a Gemini file/inline part (e.g. createPartFromUri
            // output or { inlineData: { mimeType, data } }). Same prompt, multimodal input.
            contents = { role: 'user', parts: [payload, { text: EXTRACTION_PROMPT }] };
        } else {
            // 'text' and 'voice' are handled identically — both arrive as a transcript.
            contents = { role: 'user', parts: [{ text: String(payload) + '\n\n' + EXTRACTION_PROMPT }] };
        }

        const response = await ai.models.generateContent({ model: MODEL, contents });
        const scope = parseGeminiJSON(response.text);

        return {
            projectName:   scope.projectName || 'General',
            scope_of_work: scope.scope_of_work || '',
            materials:     Array.isArray(scope.materials) ? scope.materials : [],
            labor:         Array.isArray(scope.labor) ? scope.labor : [],
            source:        type,
            usage:         response.usageMetadata || {},
        };
    }

    return { extractScope };
}

module.exports = { createEstimator, EXTRACTION_PROMPT, VALID_TRADES };
