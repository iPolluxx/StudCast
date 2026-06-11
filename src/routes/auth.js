const express    = require('express');
const crypto     = require('crypto');
const nodemailer = require('nodemailer');

const { db, twilioClient }   = require('../config');
const { resolvePhoneByEmail } = require('../db');
const { requireAuth, requireGoogleAuth, checkOtpRateLimit } = require('../middleware/auth');

const router = express.Router();

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
                        <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;">
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

module.exports = router;
