'use strict';

/**
 * Strips Gemini markdown fences and parses the remaining text as JSON.
 */
function parseGeminiJSON(rawText) {
    const clean = rawText.replace(/```json/gi, '').replace(/```/g, '').trim();
    return JSON.parse(clean);
}

/**
 * Returns a Firestore-safe document ID from a material name.
 * Replaces all non-alphanumeric characters with underscores, lowercases, truncates to 100 chars.
 */
function sanitizeItemId(name) {
    return (name || '').replace(/[^a-zA-Z0-9]/g, '_').toLowerCase().substring(0, 100);
}

/**
 * Normalizes a US phone number to E.164 format (+1XXXXXXXXXX).
 *
 * Accepts:
 *   - 10-digit bare number: "5551234567" → "+15551234567"
 *   - Formatted:            "(555) 123-4567" → "+15551234567"
 *   - Already E.164:        "+15551234567" → "+15551234567"
 *   - 11-digit with 1:      "15551234567" → "+15551234567"
 *
 * Throws a 400-tagged Error for anything else.
 */
function normalizePhone(phoneStr) {
    if (!phoneStr) throw Object.assign(new Error('Phone number is required.'), { status: 400 });

    const raw = String(phoneStr).trim();
    const hasPlus    = raw.startsWith('+');
    const digitsOnly = raw.replace(/\D/g, '');

    let normalized;
    if (hasPlus && digitsOnly.length === 11 && digitsOnly.startsWith('1')) {
        normalized = '+' + digitsOnly;
    } else if (digitsOnly.length === 10) {
        normalized = '+1' + digitsOnly;
    } else if (digitsOnly.length === 11 && digitsOnly.startsWith('1')) {
        normalized = '+' + digitsOnly;
    } else {
        throw Object.assign(
            new Error(`Invalid phone number "${phoneStr}". Expected a 10-digit US number or E.164 format.`),
            { status: 400 }
        );
    }
    return normalized;
}

/**
 * Deterministic sanitizer for AI-produced Phase 1 wall-frame intent objects.
 *
 * Reconstructs the full intent from scratch, clamping every field to a known-safe
 * value and applying defaults when the AI produced garbage. The Three.js Builder
 * is guaranteed valid types regardless of what Gemini returned.
 *
 * Hard-pinned constants (never trust AI on these):
 *   schemaVersion: '1.0'
 *   projectType:   'wall_frame'
 *
 * Clamping rules:
 *   studSpacingInches — must be exactly 16 or 24; anything else snaps to 16
 *   wallType          — must be exactly 'interior' or 'exterior'; anything else → 'exterior'
 *   treatedSolePlate  — must be a boolean; non-boolean → false
 *   lengthFt/heightFt — must be a positive finite number; default 20/9
 *   doorOpenings/windowOpenings/cornerCount — non-negative integers; defaults 0/0/4
 */
function sanitizePhase1Intent(raw) {
    const dim = raw.dimensions || {};
    const str = raw.structural  || {};
    const fea = raw.features    || {};

    const rawSpacing  = Number(str.studSpacingInches);
    const studSpacing = rawSpacing === 24 ? 24 : 16;
    const wallType    = str.wallType === 'interior' ? 'interior' : 'exterior';

    return {
        schemaVersion: '1.0',
        projectType:   'wall_frame',
        dimensions: {
            lengthFt: Number.isFinite(Number(dim.lengthFt)) && Number(dim.lengthFt) > 0
                ? Math.round(Number(dim.lengthFt) * 10) / 10
                : 20,
            heightFt: Number.isFinite(Number(dim.heightFt)) && Number(dim.heightFt) > 0
                ? Math.round(Number(dim.heightFt) * 10) / 10
                : 9,
        },
        structural: {
            studSpacingInches: studSpacing,
            treatedSolePlate:  typeof str.treatedSolePlate === 'boolean'
                ? str.treatedSolePlate
                : false,
            wallType,
        },
        features: {
            doorOpenings:   Number.isInteger(Number(fea.doorOpenings))   && Number(fea.doorOpenings)   >= 0
                ? Math.floor(Number(fea.doorOpenings))
                : 0,
            windowOpenings: Number.isInteger(Number(fea.windowOpenings)) && Number(fea.windowOpenings) >= 0
                ? Math.floor(Number(fea.windowOpenings))
                : 0,
            cornerCount:    Number.isInteger(Number(fea.cornerCount))    && Number(fea.cornerCount)    >= 0
                ? Math.floor(Number(fea.cornerCount))
                : 4,
        },
    };
}

module.exports = { parseGeminiJSON, sanitizeItemId, normalizePhone, sanitizePhase1Intent };
