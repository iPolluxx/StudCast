'use strict';

// Pure invite-code logic (no I/O) so it stays unit-testable offline.
// A single "current" code is live at any time; redeeming it rotates it to a
// fresh one, making every code single-use.
const crypto = require('crypto');

// 8-char hex — single-use, easy to read/dictate (no ambiguous letters).
function generateInviteCode() {
    return crypto.randomBytes(6).toString('hex').slice(0, 8).toUpperCase();
}

// Decision for the redeem transaction. `stored` is the demo_access/current doc
// data (or null before the first redeem); `envFallback` is COMP_CODE, the
// bootstrap code that's live until the first redemption rotates it away.
// Returns { ok, next } — when ok, `next` is the doc data to write (new code +
// incremented counter); when not, `next` is left unchanged.
function rotateIfMatch(stored, submitted, envFallback) {
    const active = (stored && stored.code) ? stored.code : envFallback;
    if (!active || submitted !== active) return { ok: false, next: stored };
    return {
        ok: true,
        next: { code: generateInviteCode(), redeemed: ((stored && stored.redeemed) || 0) + 1 },
    };
}

module.exports = { generateInviteCode, rotateIfMatch };
