const { db, authClient } = require('../config');
const { resolvePhoneByEmail, authorizePhone } = require('../db');
const jwt = require('jsonwebtoken');

function verifyLocalJwt(token) {
    try { return jwt.verify(token, process.env.JWT_SECRET); }
    catch { return null; }
}

// ── requireAuth ───────────────────────────────────────────────────────
async function requireAuth(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Missing or invalid Authorization header.' });
    }

    const token = authHeader.split('Bearer ')[1];
    let email;
    try {
        const ticket = await authClient.verifyIdToken({
            idToken:  token,
            audience: process.env.GOOGLE_OAUTH_CLIENT_ID,
        });
        email = ticket.getPayload().email;
    } catch {
        const payload = verifyLocalJwt(token);
        if (!payload?.email) return res.status(401).json({ error: 'Invalid token.' });
        email = payload.email;
    }

    if (!email) return res.status(400).json({ error: 'No email found in token.' });

    const phone = await resolvePhoneByEmail(email);
    if (!phone) return res.status(403).json({ error: 'Email not registered in the system.' });

    const auth = await authorizePhone(phone);
    if (!auth.authorized) return res.status(401).json({ error: auth.reason });

    req.userPhone   = phone;
    req.authedPhone = phone;
    req.authedUser  = auth.user;
    next();
}

// ── requireSubscription ───────────────────────────────────────────────
async function requireSubscription(req, res, next) {
    const userPhone = req.userPhone;
    try {
        const configSnap = await db.collection('users').doc(userPhone).collection('settings').doc('config').get();
        if (configSnap.exists && configSnap.data().active_subscription === true) {
            return next();
        }
        return res.status(402).json({
            error:   'subscription_required',
            message: 'An active subscription is required.',
        });
    } catch (err) {
        console.error(`requireSubscription error for ${userPhone}:`, err.message);
        return res.status(500).json({ error: 'internal_error', message: 'Failed to verify subscription status.' });
    }
}

// ── requireGoogleAuth ─────────────────────────────────────────────────
// Accepts Google ID tokens OR our own JWTs (email/password users).
async function requireGoogleAuth(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Missing or invalid Authorization header.' });
    }
    const token = authHeader.split('Bearer ')[1];
    let email;
    try {
        const ticket = await authClient.verifyIdToken({
            idToken:  token,
            audience: process.env.GOOGLE_OAUTH_CLIENT_ID,
        });
        const payload = ticket.getPayload();
        req.googlePayload = payload;
        email = payload.email;
    } catch {
        const payload = verifyLocalJwt(token);
        if (!payload?.email) return res.status(401).json({ error: 'Invalid token.' });
        email = payload.email;
    }
    if (!email) return res.status(400).json({ error: 'No email found in token.' });
    req.googleEmail = email;
    next();
}

// ── OTP rate limiting ─────────────────────────────────────────────────
const otpPhoneLimits = new Map();
const otpIpLimits    = new Map();

function checkOtpRateLimit(phone, ip) {
    const now       = Date.now();
    const windowMs  = 3600000; // 1 hour

    if (Math.random() < 0.05) {
        for (const [k, v] of otpPhoneLimits) { if (now - v.firstAttempt > windowMs) otpPhoneLimits.delete(k); }
        for (const [k, v] of otpIpLimits)    { if (now - v.firstAttempt > windowMs) otpIpLimits.delete(k); }
    }

    let phoneEntry = otpPhoneLimits.get(phone);
    if (!phoneEntry || now - phoneEntry.firstAttempt > windowMs) phoneEntry = { count: 0, firstAttempt: now };
    if (phoneEntry.count >= 3) return { allowed: false, reason: 'Too many OTP requests for this phone number. Please try again later.' };

    let ipEntry = otpIpLimits.get(ip);
    if (!ipEntry || now - ipEntry.firstAttempt > windowMs) ipEntry = { count: 0, firstAttempt: now };
    if (ipEntry.count >= 5) return { allowed: false, reason: 'Too many OTP requests from this IP address. Please try again later.' };

    phoneEntry.count++;
    otpPhoneLimits.set(phone, phoneEntry);
    ipEntry.count++;
    otpIpLimits.set(ip, ipEntry);

    return { allowed: true };
}

module.exports = { requireAuth, requireSubscription, requireGoogleAuth, checkOtpRateLimit };
