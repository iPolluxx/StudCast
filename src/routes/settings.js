const express = require('express');

const { db, multerMemory } = require('../config');
const { requireAuth }       = require('../middleware/auth');

const router = express.Router();

// ── GET /api/settings ─────────────────────────────────────────────────
router.get('/settings', requireAuth, async (req, res) => {
    const userPhone = req.userPhone;
    try {
        const configRef = db.collection('users').doc(userPhone).collection('settings').doc('config');
        const snap      = await configRef.get();
        const defaults  = {
            company_name:        '',
            company_address:     '',
            company_logo_url:    '',
            license_number:      '',
            contact_email:       '',
            default_labor_rate:  55,
            employee_wages:      [],
            global_markup_percent: 0,
            tax_rate:            5.5,
            estimateCount:       0,
            isOnboarded:         false,
            active_subscription: false,
            subscription_status: 'unsubscribed',
        };
        if (!snap.exists) {
            await configRef.set(defaults);
            return res.json(defaults);
        }
        const data = snap.data();
        res.json({
            company_name:          data.company_name          !== undefined ? data.company_name          : defaults.company_name,
            company_address:       data.company_address       !== undefined ? data.company_address       : defaults.company_address,
            company_logo_url:      data.company_logo_url      !== undefined ? data.company_logo_url      : defaults.company_logo_url,
            license_number:        data.license_number        !== undefined ? data.license_number        : defaults.license_number,
            contact_email:         data.contact_email         !== undefined ? data.contact_email         : defaults.contact_email,
            default_labor_rate:    data.default_labor_rate    !== undefined ? Number(data.default_labor_rate)    : defaults.default_labor_rate,
            employee_wages:        Array.isArray(data.employee_wages) ? data.employee_wages : [],
            global_markup_percent: data.global_markup_percent !== undefined ? Number(data.global_markup_percent) : defaults.global_markup_percent,
            tax_rate:              data.tax_rate              !== undefined ? Number(data.tax_rate)              : defaults.tax_rate,
            isOnboarded:           data.isOnboarded           !== undefined ? Boolean(data.isOnboarded)          : defaults.isOnboarded,
            active_subscription:   data.active_subscription   !== undefined ? Boolean(data.active_subscription)  : defaults.active_subscription,
            subscription_status:   data.subscription_status   !== undefined ? String(data.subscription_status)   : defaults.subscription_status,
        });
    } catch (err) {
        console.error(`[${userPhone}] GET /api/settings error:`, err.message);
        res.status(500).json({ error: 'Failed to retrieve settings' });
    }
});

// ── POST /api/settings ────────────────────────────────────────────────
router.post('/settings', requireAuth, async (req, res) => {
    const userPhone = req.userPhone;
    const {
        company_name, company_address, company_logo_url, license_number,
        contact_email, default_labor_rate, employee_wages,
        global_markup_percent, tax_rate, isOnboarded,
    } = req.body;

    try {
        const updateObj = {};
        if (company_name      !== undefined) updateObj.company_name      = String(company_name);
        if (company_address   !== undefined) updateObj.company_address   = String(company_address);
        if (company_logo_url  !== undefined) updateObj.company_logo_url  = String(company_logo_url);
        if (license_number    !== undefined) updateObj.license_number    = String(license_number);
        if (contact_email     !== undefined) updateObj.contact_email     = String(contact_email);
        if (isOnboarded       !== undefined) updateObj.isOnboarded       = Boolean(isOnboarded);

        if (default_labor_rate !== undefined) {
            const val = parseFloat(default_labor_rate);
            if (!Number.isFinite(val) || val < 0) return res.status(400).json({ error: 'Default labor rate must be a positive finite number' });
            updateObj.default_labor_rate = val;
        }
        if (global_markup_percent !== undefined) {
            const val = parseFloat(global_markup_percent);
            if (!Number.isFinite(val) || val < 0) return res.status(400).json({ error: 'Global markup percent must be a positive finite number' });
            updateObj.global_markup_percent = val;
        }
        if (tax_rate !== undefined) {
            const val = parseFloat(tax_rate);
            if (!Number.isFinite(val) || val < 0) return res.status(400).json({ error: 'Tax rate must be a positive finite number' });
            updateObj.tax_rate = val;
        }
        if (employee_wages !== undefined) {
            if (!Array.isArray(employee_wages)) return res.status(400).json({ error: 'employee_wages must be an array' });
            updateObj.employee_wages = employee_wages
                .filter(w => w && typeof w === 'object')
                .slice(0, 50)
                .map(w => {
                    const wage = parseFloat(w.hourly_wage);
                    return {
                        name:        String(w.name || '').slice(0, 80),
                        hourly_wage: Number.isFinite(wage) && wage >= 0 ? Math.round(wage * 100) / 100 : 0,
                    };
                });
        }

        const configRef = db.collection('users').doc(userPhone).collection('settings').doc('config');
        await configRef.set(updateObj, { merge: true });
        res.json({ success: true });
    } catch (err) {
        console.error(`[${userPhone}] POST /api/settings error:`, err.message);
        res.status(500).json({ error: 'Failed to save settings' });
    }
});

// ── POST /api/settings/logo ───────────────────────────────────────────
router.post('/settings/logo', multerMemory.single('logo'), requireAuth, async (req, res) => {
    const userPhone = req.userPhone;
    if (!req.file) return res.status(400).json({ error: 'No file provided' });
    try {
        let logoUrl = '';
        if (process.env.GCS_BUCKET_NAME) {
            try {
                const { Storage } = require('@google-cloud/storage');
                const storage = new Storage();
                const bucket  = storage.bucket(process.env.GCS_BUCKET_NAME);
                const file    = bucket.file(`users/${userPhone}/logo_${Date.now()}_${req.file.originalname}`);
                await file.save(req.file.buffer, { metadata: { contentType: req.file.mimetype } });
                logoUrl = `https://storage.googleapis.com/${process.env.GCS_BUCKET_NAME}/${file.name}`;
            } catch (gcsErr) {
                console.warn(`GCS upload failed, falling back to base64:`, gcsErr.message);
            }
        }
        if (!logoUrl) {
            logoUrl = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
        }
        const configRef = db.collection('users').doc(userPhone).collection('settings').doc('config');
        await configRef.set({ company_logo_url: logoUrl }, { merge: true });
        res.json({ success: true, company_logo_url: logoUrl });
    } catch (err) {
        console.error(`[${userPhone}] POST /api/settings/logo error:`, err.message);
        res.status(500).json({ error: 'Failed to upload logo' });
    }
});

module.exports = router;
