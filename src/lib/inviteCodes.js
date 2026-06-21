'use strict';

// Pure invite-code logic (no I/O) so it stays unit-testable offline.
// Codes live in a pool (Firestore `demo_codes`), each single-use: the admin
// generates them, a tester redeems one, and it's marked used.
const crypto = require('crypto');

// 8-char hex — single-use, easy to read/dictate (no ambiguous letters).
function generateInviteCode() {
    return crypto.randomBytes(6).toString('hex').slice(0, 8).toUpperCase();
}

// Pure redeem decision for a pooled code doc. `doc` is the demo_codes/{code}
// data, or null when the code doesn't exist. Redeemable iff it exists and has
// not already been used.
function canRedeem(doc) {
    return !!doc && doc.used !== true;
}

module.exports = { generateInviteCode, canRedeem };
