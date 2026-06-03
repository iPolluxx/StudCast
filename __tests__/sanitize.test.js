'use strict';

const {
    parseGeminiJSON,
    sanitizeItemId,
    normalizePhone,
    sanitizePhase1Intent,
} = require('../src/lib/sanitize');

// Suppress console noise from the lib during tests
beforeAll(() => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
});
afterAll(() => jest.restoreAllMocks());

// ─── parseGeminiJSON ──────────────────────────────────────────────────────────

describe('parseGeminiJSON', () => {
    test('parses clean JSON string', () => {
        expect(parseGeminiJSON('{"rate":75.00}')).toEqual({ rate: 75 });
    });

    test('strips ```json fences before parsing', () => {
        expect(parseGeminiJSON('```json\n{"rate":75}\n```')).toEqual({ rate: 75 });
    });

    test('strips plain ``` fences before parsing', () => {
        expect(parseGeminiJSON('```\n{"rate":75}\n```')).toEqual({ rate: 75 });
    });

    test('handles leading/trailing whitespace', () => {
        expect(parseGeminiJSON('   {"x":1}   ')).toEqual({ x: 1 });
    });

    test('throws SyntaxError on invalid JSON', () => {
        expect(() => parseGeminiJSON('not json at all')).toThrow(SyntaxError);
    });
});

// ─── sanitizeItemId ───────────────────────────────────────────────────────────

describe('sanitizeItemId', () => {
    test('lowercases the string', () => {
        expect(sanitizeItemId('OSB')).toBe('osb');
    });

    test('replaces spaces and special chars with underscores', () => {
        expect(sanitizeItemId('2x4x8 Framing Lumber')).toBe('2x4x8_framing_lumber');
    });

    test('returns empty string for null input', () => {
        expect(sanitizeItemId(null)).toBe('');
    });

    test('returns empty string for empty string input', () => {
        expect(sanitizeItemId('')).toBe('');
    });

    test('truncates names longer than 100 characters', () => {
        expect(sanitizeItemId('a'.repeat(150))).toHaveLength(100);
    });
});

// ─── normalizePhone ───────────────────────────────────────────────────────────

describe('normalizePhone', () => {
    test('accepts a bare 10-digit US number', () => {
        expect(normalizePhone('5551234567')).toBe('+15551234567');
    });

    test('accepts a formatted number with punctuation', () => {
        expect(normalizePhone('(555) 123-4567')).toBe('+15551234567');
    });

    test('passes through a valid E.164 number unchanged', () => {
        expect(normalizePhone('+15551234567')).toBe('+15551234567');
    });

    test('accepts 11-digit number starting with 1 (no plus sign)', () => {
        expect(normalizePhone('15551234567')).toBe('+15551234567');
    });

    test('throws when phoneStr is null', () => {
        expect(() => normalizePhone(null)).toThrow('Phone number is required.');
    });

    test('throws when phoneStr is undefined', () => {
        expect(() => normalizePhone(undefined)).toThrow('Phone number is required.');
    });

    test('throws on a 9-digit number (too short)', () => {
        expect(() => normalizePhone('555123456')).toThrow();
    });

    test('thrown error has status 400', () => {
        let err;
        try { normalizePhone(null); } catch (e) { err = e; }
        expect(err.status).toBe(400);
    });

    test('thrown error for bad format has status 400', () => {
        let err;
        try { normalizePhone('12345'); } catch (e) { err = e; }
        expect(err.status).toBe(400);
    });
});

// ─── sanitizePhase1Intent ─────────────────────────────────────────────────────

describe('sanitizePhase1Intent', () => {
    test('hard-pins schemaVersion to "1.0" regardless of input', () => {
        const result = sanitizePhase1Intent({ schemaVersion: '99.0', dimensions: {}, structural: {}, features: {} });
        expect(result.schemaVersion).toBe('1.0');
    });

    test('hard-pins projectType to "wall_frame" regardless of input', () => {
        const result = sanitizePhase1Intent({ projectType: 'hacked', dimensions: {}, structural: {}, features: {} });
        expect(result.projectType).toBe('wall_frame');
    });

    test('passes through a fully valid intent without changing values', () => {
        const raw = {
            dimensions:  { lengthFt: 24,   heightFt: 10 },
            structural:  { studSpacingInches: 24, treatedSolePlate: true, wallType: 'interior' },
            features:    { doorOpenings: 2, windowOpenings: 3, cornerCount: 6 },
        };
        const r = sanitizePhase1Intent(raw);
        expect(r.dimensions.lengthFt).toBe(24);
        expect(r.dimensions.heightFt).toBe(10);
        expect(r.structural.studSpacingInches).toBe(24);
        expect(r.structural.treatedSolePlate).toBe(true);
        expect(r.structural.wallType).toBe('interior');
        expect(r.features.doorOpenings).toBe(2);
        expect(r.features.windowOpenings).toBe(3);
        expect(r.features.cornerCount).toBe(6);
    });

    test('applies all defaults when input is empty {}', () => {
        const r = sanitizePhase1Intent({});
        expect(r.dimensions.lengthFt).toBe(20);
        expect(r.dimensions.heightFt).toBe(9);
        expect(r.structural.studSpacingInches).toBe(16);
        expect(r.structural.treatedSolePlate).toBe(false);
        expect(r.structural.wallType).toBe('exterior');
        expect(r.features.doorOpenings).toBe(0);
        expect(r.features.windowOpenings).toBe(0);
        expect(r.features.cornerCount).toBe(4);
    });

    test('snaps studSpacingInches 12 → 16 (only 16 or 24 allowed)', () => {
        const r = sanitizePhase1Intent({ dimensions: {}, structural: { studSpacingInches: 12 }, features: {} });
        expect(r.structural.studSpacingInches).toBe(16);
    });

    test('accepts studSpacingInches as the string "24" (coerces via Number)', () => {
        const r = sanitizePhase1Intent({ dimensions: {}, structural: { studSpacingInches: '24' }, features: {} });
        expect(r.structural.studSpacingInches).toBe(24);
    });

    test('defaults wallType to "exterior" for unrecognised values ("EXTERIOR" is case-sensitive)', () => {
        const r = sanitizePhase1Intent({ dimensions: {}, structural: { wallType: 'EXTERIOR' }, features: {} });
        expect(r.structural.wallType).toBe('exterior');
    });

    test('rejects string "true" for treatedSolePlate — must be a boolean', () => {
        const r = sanitizePhase1Intent({ dimensions: {}, structural: { treatedSolePlate: 'true' }, features: {} });
        expect(r.structural.treatedSolePlate).toBe(false);
    });

    test('defaults lengthFt to 20 when value is 0 (must be > 0)', () => {
        const r = sanitizePhase1Intent({ dimensions: { lengthFt: 0 }, structural: {}, features: {} });
        expect(r.dimensions.lengthFt).toBe(20);
    });

    test('defaults heightFt to 9 for a negative value', () => {
        const r = sanitizePhase1Intent({ dimensions: { heightFt: -5 }, structural: {}, features: {} });
        expect(r.dimensions.heightFt).toBe(9);
    });

    test('defaults lengthFt to 20 for non-numeric string', () => {
        const r = sanitizePhase1Intent({ dimensions: { lengthFt: 'abc' }, structural: {}, features: {} });
        expect(r.dimensions.lengthFt).toBe(20);
    });

    test('rounds dimensions to 1 decimal place', () => {
        const r = sanitizePhase1Intent({ dimensions: { lengthFt: 24.55 }, structural: {}, features: {} });
        expect(r.dimensions.lengthFt).toBe(24.6);
    });

    test('defaults doorOpenings to 0 for a negative integer', () => {
        const r = sanitizePhase1Intent({ dimensions: {}, structural: {}, features: { doorOpenings: -1 } });
        expect(r.features.doorOpenings).toBe(0);
    });

    test('defaults windowOpenings to 0 for a float (2.7 is not an integer)', () => {
        const r = sanitizePhase1Intent({ dimensions: {}, structural: {}, features: { windowOpenings: 2.7 } });
        expect(r.features.windowOpenings).toBe(0);
    });

    test('defaults cornerCount to 4 when not provided', () => {
        const r = sanitizePhase1Intent({ dimensions: {}, structural: {}, features: {} });
        expect(r.features.cornerCount).toBe(4);
    });

    test('accepts integer 0 for doorOpenings (zero doors is valid)', () => {
        const r = sanitizePhase1Intent({ dimensions: {}, structural: {}, features: { doorOpenings: 0 } });
        expect(r.features.doorOpenings).toBe(0);
    });
});
