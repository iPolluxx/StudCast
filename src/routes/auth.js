const express    = require('express');
const crypto     = require('crypto');
const nodemailer = require('nodemailer');
const bcrypt     = require('bcryptjs');
const jwt        = require('jsonwebtoken');

const { db, twilioClient }   = require('../config');
const { resolvePhoneByEmail } = require('../db');
const { requireAuth, requireGoogleAuth, checkOtpRateLimit } = require('../middleware/auth');

function issueJwt(email, opts = {}) {
    return jwt.sign({ email }, process.env.JWT_SECRET, { expiresIn: opts.expiresIn || '30d' });
}

async function sendOtp(formattedPhone, email, otp) {
    try {
        if (process.env.SMS_LIVE !== 'true') throw new Error('SMS_LIVE not enabled');
        await twilioClient.messages.create({
            body: `Your Lone Ranger Estimator verification code is: ${otp}. Reply STOP to opt out. Msg&Data rates may apply.`,
            [process.env.TWILIO_MESSAGING_SERVICE_SID ? 'messagingServiceSid' : 'from']: process.env.TWILIO_MESSAGING_SERVICE_SID || process.env.TWILIO_PHONE_NUMBER,
            to: formattedPhone,
        });
        return 'sms';
    } catch {
        try {
            const t = nodemailer.createTransport({ service: 'gmail', auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS } });
            await t.sendMail({
                from: `"Lone Ranger Estimator" <${process.env.EMAIL_USER}>`,
                to:   email,
                subject: 'Your verification code',
                text: `Your Lone Ranger Estimator verification code is: ${otp}\n\nThis code expires in 10 minutes.`,
                html: `<div style="font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:480px;margin:0 auto;padding:24px;"><h2 style="color:#521880;margin:0 0 8px;">Lone Ranger Estimator</h2><p style="color:#444;margin:0 0 24px;">Your verification code:</p><div style="font-size:40px;font-weight:700;letter-spacing:0.35em;color:#1a0729;background:#f3f0ff;padding:24px 16px;border-radius:12px;text-align:center;margin:0 0 24px;">${otp}</div><p style="color:#888;font-size:12px;margin:0;">Expires in 10 minutes. Didn't request this? Ignore this email.</p></div>`,
            });
            return 'email';
        } catch {
            console.warn('[DEV] OTP for ' + formattedPhone + ': ' + otp);
            return 'log';
        }
    }
}

const router = express.Router();

// ── Single-use invite codes → isolated demo workspaces ────────────────
// Code-only access (no Google/OTP/Stripe). The admin generates a POOL of
// one-time codes from the gateway dashboard; a tester redeems one, which (a)
// provisions a fresh ISOLATED demo tenant and (b) marks the code used. Pool
// lives in Firestore `demo_codes/{CODE}`. Admin endpoints are x-api-key gated
// (same pattern as /api/admin/sync-prices) so the local-only gateway can manage
// them while the public Cloud Run URL stays protected.
const { generateInviteCode, canRedeem } = require('../lib/inviteCodes');

function requireAdminKey(req, res, next) {
    const key = req.headers['x-api-key'];
    if (!key || key !== process.env.ADMIN_API_KEY) return res.status(403).json({ error: 'Forbidden' });
    next();
}

router.post('/auth/demo-login', async (req, res) => {
    const submitted = (req.body && typeof req.body.code === 'string') ? req.body.code.trim().toUpperCase() : '';
    if (!submitted) return res.status(403).json({ error: 'Invalid code.' });

    const rand  = crypto.randomBytes(5).toString('hex');
    const phone = 'demo_' + rand;                       // NOT E.164 — can't collide with a real tenant
    const email = 'demo-' + rand + '@studcast.app';

    // Atomically claim the code so two simultaneous redeems can't both win.
    let claimed;
    try {
        claimed = await db.runTransaction(async (tx) => {
            const ref  = db.collection('demo_codes').doc(submitted);
            const snap = await tx.get(ref);
            if (!canRedeem(snap.exists ? snap.data() : null)) return false;
            tx.set(ref, { used: true, used_at: Date.now(), tenant_email: email }, { merge: true });
            return true;
        });
    } catch (err) {
        console.error('[demo-login] txn', err.message);
        return res.status(500).json({ error: 'Demo login failed.' });
    }
    if (!claimed) return res.status(403).json({ error: 'Invalid or already-used code.' });

    try {
        await db.collection('users').doc(phone)
            .set({ email, status: 'active', companyName: 'Demo Workspace' }, { merge: true });
        await db.collection('users').doc(phone).collection('settings').doc('config')
            .set({ active_subscription: true, subscription_status: 'comp', contact_email: email }, { merge: true });
        return res.json({ token: issueJwt(email, { expiresIn: '7d' }), demo: true });
    } catch (err) {
        console.error('[demo-login] provision', err.message);
        return res.status(500).json({ error: 'Workspace provisioning failed.' });
    }
});

// ── POST /api/admin/demo-codes — generate N single-use codes ──────────
router.post('/admin/demo-codes', requireAdminKey, async (req, res) => {
    const count = Math.min(Math.max(parseInt(req.body && req.body.count, 10) || 1, 1), 50);
    try {
        const batch = db.batch();
        const codes = [];
        for (let i = 0; i < count; i++) {
            const code = generateInviteCode();
            batch.set(db.collection('demo_codes').doc(code), { code, used: false, created_at: Date.now() });
            codes.push(code);
        }
        await batch.commit();
        return res.json({ codes });
    } catch (err) {
        console.error('[demo-codes] generate', err.message);
        return res.status(500).json({ error: 'Generation failed.' });
    }
});

// ── GET /api/admin/demo-codes — list the pool (newest first) ──────────
router.get('/admin/demo-codes', requireAdminKey, async (req, res) => {
    try {
        const snap = await db.collection('demo_codes').orderBy('created_at', 'desc').limit(200).get();
        const codes = snap.docs.map((d) => {
            const x = d.data();
            return {
                code: x.code || d.id,
                used: !!x.used,
                created_at: x.created_at || null,
                used_at: x.used_at || null,
                tenant_email: x.tenant_email || null,
            };
        });
        return res.json({ codes });
    } catch (err) {
        console.error('[demo-codes] list', err.message);
        return res.status(500).json({ error: 'List failed.' });
    }
});

// ── POST /api/auth/register ───────────────────────────────────────────
router.post('/auth/register', requireGoogleAuth, async (req, res) => {
    const extractedEmail = req.googleEmail;
    const { phone, company_name } = req.body;
    if (!phone || !company_name) return res.status(400).json({ error: 'Phone and company_name are required.' });

    const digits = phone.replace(/\D/g, '');
    const formattedPhone = '+' + (digits.length === 10 ? '1' + digits : digits);

    const rateLimitResult = checkOtpRateLimit(formattedPhone, req.ip);
    if (!rateLimitResult.allowed) return res.status(429).json({ error: rateLimitResult.reason });

    try {
        const existingPhone = await resolvePhoneByEmail(extractedEmail);
        if (existingPhone) {
            const existingUserSnap = await db.collection('users').doc(existingPhone).get();
            if (existingUserSnap.exists) {
                const existingStatus = existingUserSnap.data().status;
                if (existingStatus === 'active') {
                    return res.status(409).json({ error: 'An account already exists for this email.' });
                }
                if (existingStatus === 'pending' && existingPhone !== formattedPhone) {
                    return res.status(409).json({ error: 'A pending account exists for this email with a different phone number.' });
                }
            }
        }

        const userRef = db.collection('users').doc(formattedPhone);
        const doc     = await userRef.get();
        if (doc.exists) {
            const docEmail = doc.data().email;
            if (docEmail && docEmail.toLowerCase() !== extractedEmail.toLowerCase()) {
                return res.status(409).json({ error: 'Phone number already registered to a different account.' });
            }
        }

        await userRef.set({ email: extractedEmail, createdAt: new Date().toISOString(), status: 'pending' }, { merge: true });
        await userRef.collection('settings').doc('config').set({ company_name, contact_email: extractedEmail }, { merge: true });

        const otp       = crypto.randomInt(100000, 1000000).toString();
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
        await db.collection('registrations').doc(formattedPhone).set({ otp, expiresAt });

        // Transport 1: SMS via Twilio (gated behind SMS_LIVE env flag)
        let otpChannel = 'sms';
        try {
            if (process.env.SMS_LIVE !== 'true') {
                throw new Error('SMS_LIVE is not enabled — routing OTP through email fallback until 10DLC campaign is approved.');
            }
            await twilioClient.messages.create({
                body: `Your Lone Ranger Estimator verification code is: ${otp}. Reply STOP to opt out. Msg&Data rates may apply.`,
                [process.env.TWILIO_MESSAGING_SERVICE_SID ? 'messagingServiceSid' : 'from']: process.env.TWILIO_MESSAGING_SERVICE_SID || process.env.TWILIO_PHONE_NUMBER,
                to: formattedPhone,
            });
        } catch (twilioErr) {
            // Transport 2: Email fallback
            try {
                const otpTransporter = nodemailer.createTransport({
                    service: 'gmail',
                    auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
                });
                await otpTransporter.sendMail({
                    from:    `"Lone Ranger Estimator" <${process.env.EMAIL_USER}>`,
                    to:      extractedEmail,
                    subject: 'Your verification code',
                    text:    `Your Lone Ranger Estimator verification code is: ${otp}\n\nThis code expires in 10 minutes.`,
                    html: `
                        <div style="font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:480px;margin:0 auto;padding:24px;">
                            <h2 style="color:#521880;margin:0 0 8px;">Lone Ranger Estimator</h2>
                            <p style="color:#444;margin:0 0 24px;">Your verification code:</p>
                            <div style="font-size:40px;font-weight:700;letter-spacing:0.35em;color:#1a0729;background:#f3f0ff;padding:24px 16px;border-radius:12px;text-align:center;margin:0 0 24px;">${otp}</div>
                            <p style="color:#888;font-size:12px;margin:0;">Expires in 10 minutes. Didn't request this? Ignore this email.</p>
                        </div>
                    `,
                });
                otpChannel = 'email';
            } catch (emailErr) {
                // Transport 3: Dev log fallback
                console.warn('[DEV] SMS + email both failed. OTP for ' + formattedPhone + ': ' + otp);
                otpChannel = 'log';
            }
        }

        return res.status(202).json({ success: true, message: 'OTP sent', channel: otpChannel });
    } catch (err) {
        console.error('Registration Error:', err);
        return res.status(500).json({ error: 'Internal server error during registration.' });
    }
});

// ── POST /api/auth/verify-otp ─────────────────────────────────────────
router.post('/auth/verify-otp', requireGoogleAuth, async (req, res) => {
    const { phone, otp } = req.body;
    if (!phone || !otp) return res.status(400).json({ error: 'Phone and OTP are required' });

    const digits         = phone.replace(/\D/g, '');
    const formattedPhone = '+' + (digits.length === 10 ? '1' + digits : digits);

    try {
        const regRef = db.collection('registrations').doc(formattedPhone);
        const regDoc = await regRef.get();
        if (!regDoc.exists) return res.status(400).json({ error: 'Invalid or expired verification code' });

        const data = regDoc.data();
        if (data.otp !== otp || new Date() > new Date(data.expiresAt)) {
            return res.status(400).json({ error: 'Invalid or expired verification code' });
        }

        const userRef = db.collection('users').doc(formattedPhone);
        const userDoc = await userRef.get();
        if (!userDoc.exists) return res.status(400).json({ error: 'User not found.' });

        const userData = userDoc.data();
        if (userData.status !== 'pending') return res.status(400).json({ error: 'User is not pending verification.' });
        if (userData.email.toLowerCase() !== req.googleEmail.toLowerCase()) {
            return res.status(403).json({ error: 'Verification email does not match account.' });
        }

        await userRef.set({ status: 'active' }, { merge: true });
        await regRef.delete();

        return res.status(200).json({ success: true, phone: formattedPhone });
    } catch (err) {
        console.error('Verify OTP Error:', err);
        return res.status(500).json({ error: 'Internal server error during verification.' });
    }
});

// ── GET /api/me ───────────────────────────────────────────────────────
router.get('/me', requireAuth, (req, res) => {
    res.json({ phone: req.userPhone });
});

// ── POST /api/auth/email-signup ───────────────────────────────────────
router.post('/auth/email-signup', async (req, res) => {
    const { email, password, phone, company_name } = req.body;
    if (!email || !password || !phone || !company_name) {
        return res.status(400).json({ error: 'email, password, phone, and company_name are required.' });
    }
    if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters.' });

    const digits         = phone.replace(/\D/g, '');
    const formattedPhone = '+' + (digits.length === 10 ? '1' + digits : digits);

    const rateLimitResult = checkOtpRateLimit(formattedPhone, req.ip);
    if (!rateLimitResult.allowed) return res.status(429).json({ error: rateLimitResult.reason });

    try {
        const existingPhone = await resolvePhoneByEmail(email);
        if (existingPhone) {
            const snap = await db.collection('users').doc(existingPhone).get();
            if (snap.exists && snap.data().status === 'active') {
                return res.status(409).json({ error: 'An account already exists for this email.' });
            }
        }
        const userRef = db.collection('users').doc(formattedPhone);
        const doc     = await userRef.get();
        if (doc.exists && doc.data().email?.toLowerCase() !== email.toLowerCase()) {
            return res.status(409).json({ error: 'Phone number already registered to a different account.' });
        }

        const hash = await bcrypt.hash(password, 10);
        await userRef.set({ email, password_hash: hash, createdAt: new Date().toISOString(), status: 'pending' }, { merge: true });
        await userRef.collection('settings').doc('config').set({ company_name, contact_email: email }, { merge: true });

        const otp       = crypto.randomInt(100000, 1000000).toString();
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
        await db.collection('registrations').doc(formattedPhone).set({ otp, expiresAt });

        const channel = await sendOtp(formattedPhone, email, otp);
        // Short-lived token authorizes the /auth/verify-otp step
        const token = issueJwt(email, { expiresIn: '15m' });
        return res.status(202).json({ success: true, channel, token });
    } catch (err) {
        console.error('Email Signup Error:', err);
        return res.status(500).json({ error: 'Internal server error during signup.' });
    }
});

// ── POST /api/auth/email-login ────────────────────────────────────────
router.post('/auth/email-login', async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'email and password are required.' });

    try {
        const phone = await resolvePhoneByEmail(email);
        if (!phone) return res.status(401).json({ error: 'Invalid email or password.' });

        const userDoc = await db.collection('users').doc(phone).get();
        if (!userDoc.exists) return res.status(401).json({ error: 'Invalid email or password.' });

        const userData = userDoc.data();
        if (!userData.password_hash) {
            return res.status(401).json({ error: 'This account uses Google Sign-In. Please use the Google button instead.' });
        }
        if (userData.status !== 'active') {
            return res.status(403).json({ error: 'Account not yet verified. Please complete phone verification.' });
        }

        const valid = await bcrypt.compare(password, userData.password_hash);
        if (!valid) return res.status(401).json({ error: 'Invalid email or password.' });

        return res.json({ success: true, token: issueJwt(email) });
    } catch (err) {
        console.error('Email Login Error:', err);
        return res.status(500).json({ error: 'Internal server error during login.' });
    }
});

module.exports = router;
