require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const express = require('express');
const multer  = require('multer');
const csv     = require('csv-parser');
const { Readable } = require('stream');
const { GoogleGenAI, createPartFromUri } = require('@google/genai');
const { google } = require('googleapis');
const nodemailer = require('nodemailer');
const fs   = require('fs');
const path = require('path');
const { MessagingResponse } = require('twilio').twiml;
const { Firestore, FieldValue } = require('@google-cloud/firestore');
const puppeteer = require('puppeteer');
const { OAuth2Client } = require('google-auth-library');
const authClient = new OAuth2Client(process.env.GOOGLE_OAUTH_CLIENT_ID);
const crypto = require('crypto');

// ── Twilio Client (outbound SMS) ──────────────────────────────────────
const twilio = require('twilio');
const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);


const app = express();
const port = process.env.PORT || 8080;   // Cloud Run requires 8080

// ── Firestore client ──────────────────────────────────────────────────
const db = new Firestore();

// ── Local temp dirs (still needed for audio upload + PDF export) ──────
const TEMP_DIR    = path.join(__dirname, '..', 'temp');
const UPLOADS_DIR = path.join(TEMP_DIR, 'uploads');
const EXPORTS_DIR = path.join(TEMP_DIR, 'exports');

[TEMP_DIR, UPLOADS_DIR, EXPORTS_DIR].forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// ── Multer: audio uploads (unrestricted) + CSV uploads (5 MB, CSV only) ─
const audioFilter = (req, file, cb) => {
    const allowed = ['audio/webm', 'audio/mp4', 'audio/mpeg', 'audio/ogg', 'audio/wav', 'audio/x-m4a'];
    if (allowed.includes(file.mimetype)) {
        cb(null, true);
    } else {
        const err = new Error('Only standard audio files are accepted.');
        err.status = 400;
        cb(err, false);
    }
};
const upload = multer({ 
    dest: UPLOADS_DIR,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB cap
    fileFilter: audioFilter
});

const csvFilter = (req, file, cb) => {
    const allowed = ['text/csv', 'application/vnd.ms-excel'];
    if (allowed.includes(file.mimetype) || file.originalname.endsWith('.csv')) {
        cb(null, true);
    } else {
        const err = new Error('Only CSV files are accepted.');
        err.status = 400;
        cb(err, false);
    }
};
const csvUpload = multer({
    dest:   UPLOADS_DIR,
    limits: { fileSize: 5 * 1024 * 1024 },   // 5 MB hard cap
    fileFilter: csvFilter,
});

// ── Gemini SDK ────────────────────────────────────────────────────────
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// ── Google OAuth — serverless-first, file-based fallback ─────────────
//
//  On Cloud Run:  set GOOGLE_OAUTH_CREDENTIALS and GOOGLE_OAUTH_TOKEN
//                 as Secret Manager environment variables.
//  Locally:       leave those env vars unset and the legacy files are used.
//
const CREDENTIALS_PATH = path.join(__dirname, 'config', 'Credentials.json');
const TOKEN_PATH       = path.join(__dirname, 'config', 'token.json');
const TEMPLATE_DOC_ID  = '1xtQrbWh9GLnFLLqbv9rM6NEgWy1JOxqHJnaf_qmWu9A';

function getOAuth2Client() {
    let credentials, token;

    if (process.env.GOOGLE_OAUTH_CREDENTIALS && process.env.GOOGLE_OAUTH_TOKEN) {
        // Phase 2 — Cloud Run / serverless path (env vars from Secret Manager)
        credentials = JSON.parse(process.env.GOOGLE_OAUTH_CREDENTIALS);
        token       = JSON.parse(process.env.GOOGLE_OAUTH_TOKEN);
    } else {
        // Local development fallback — legacy config files
        credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf-8'));
        token       = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf-8'));
    }

    const { installed } = credentials;
    const oAuth2Client = new google.auth.OAuth2(
        installed.client_id,
        installed.client_secret,
        installed.redirect_uris[0]
    );
    oAuth2Client.setCredentials(token);
    return oAuth2Client;
}

// ── Express middleware ────────────────────────────────────────────────
// ── Static file serving — Unity WebGL MIME types + encoding headers ───
//
//  Unity WebGL exports three file types that require explicit MIME types:
//    .wasm / .wasm.gz / .wasm.br  → application/wasm
//    .data / .data.gz / .data.br  → application/octet-stream
//    .framework.js / .loader.js   → application/javascript (compressed variants need Content-Encoding)
//
//  Without these headers Chrome/Firefox will refuse to instantiate the WASM module.
app.use(express.static(path.join(__dirname, '..', 'public'), {
    setHeaders: (res, filePath) => {
        if (filePath.endsWith('.wasm.br')) {
            res.setHeader('Content-Type', 'application/wasm');
            res.setHeader('Content-Encoding', 'br');
        } else if (filePath.endsWith('.wasm.gz')) {
            res.setHeader('Content-Type', 'application/wasm');
            res.setHeader('Content-Encoding', 'gzip');
        } else if (filePath.endsWith('.wasm')) {
            res.setHeader('Content-Type', 'application/wasm');
        } else if (filePath.endsWith('.data.br')) {
            res.setHeader('Content-Type', 'application/octet-stream');
            res.setHeader('Content-Encoding', 'br');
        } else if (filePath.endsWith('.data.gz')) {
            res.setHeader('Content-Type', 'application/octet-stream');
            res.setHeader('Content-Encoding', 'gzip');
        } else if (filePath.endsWith('.data')) {
            res.setHeader('Content-Type', 'application/octet-stream');
        } else if (filePath.endsWith('.framework.js.br') || filePath.endsWith('.loader.js.br')) {
            res.setHeader('Content-Type', 'application/javascript');
            res.setHeader('Content-Encoding', 'br');
        } else if (filePath.endsWith('.framework.js.gz') || filePath.endsWith('.loader.js.gz')) {
            res.setHeader('Content-Type', 'application/javascript');
            res.setHeader('Content-Encoding', 'gzip');
        }
    }
}));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

app.get('/dashboard', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'dashboard.html'));
});

// Webhook user resolver
async function resolveUserPhoneFromEvent(event) {
    const obj = event.data.object;
    let userPhone = null;
    
    if (obj.metadata && obj.metadata.userPhone) {
        userPhone = obj.metadata.userPhone;
    } else if (obj.subscription_data && obj.subscription_data.metadata && obj.subscription_data.metadata.userPhone) {
        userPhone = obj.subscription_data.metadata.userPhone;
    } else if (obj.subscription_details && obj.subscription_details.metadata && obj.subscription_details.metadata.userPhone) {
        userPhone = obj.subscription_details.metadata.userPhone;
    }
    
    if (!userPhone) {
        const customerId = obj.customer || (event.type.startsWith('customer.subscription.') ? obj.id : null);
        if (customerId) {
            const snap = await db.collectionGroup('settings')
                .where('stripe_customer_id', '==', customerId)
                .limit(1)
                .get();
            if (!snap.empty) {
                const configDoc = snap.docs[0];
                const userDocRef = configDoc.ref.parent.parent;
                if (userDocRef) {
                    userPhone = userDocRef.id;
                }
            }
        }
    }
    return userPhone;
}

// POST route for Stripe webhook (uses raw body parser)
app.post('/api/webhooks/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
    const sig = req.headers['stripe-signature'];
    let event;

    try {
        event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
    } catch (err) {
        console.error(`Webhook signature verification failed: ${err.message}`);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    const obj = event.data.object;
    const customerId = obj.customer || (event.type.startsWith('customer.subscription.') ? obj.id : null);

    try {
        const userPhone = await resolveUserPhoneFromEvent(event);
        if (!userPhone) {
            console.warn(`[webhook] Could not resolve userPhone for customer ${customerId} from event ${event.type}`);
            return res.status(200).json({ received: true });
        }

        const configRef = db.collection('users').doc(userPhone).collection('settings').doc('config');
        let updateData = {};

        switch (event.type) {
            case 'customer.subscription.created':
                updateData = {
                    active_subscription: true,
                    subscription_status: 'active',
                    stripe_customer_id: customerId
                };
                break;
            case 'invoice.payment_succeeded':
                updateData = {
                    active_subscription: true,
                    subscription_status: 'active'
                };
                break;
            case 'customer.subscription.deleted':
                updateData = {
                    active_subscription: false,
                    subscription_status: 'canceled'
                };
                break;
            case 'invoice.payment_failed':
                updateData = {
                    active_subscription: false,
                    subscription_status: 'past_due'
                };
                break;
            default:
                console.log(`[webhook] Unhandled event type ${event.type}`);
        }

        if (Object.keys(updateData).length > 0) {
            await configRef.set(updateData, { merge: true });
            console.log(`[webhook] Successfully processed event ${event.type} for ${userPhone}`, updateData);
        }

        return res.status(200).json({ received: true });
    } catch (err) {
        console.error(`[webhook] Database error handling event ${event.type}:`, err.message);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ══════════════════════════════════════════════════════════════════════
//  UTILITY: Gemini JSON response sanitiser
// ══════════════════════════════════════════════════════════════════════

function parseGeminiJSON(rawText) {
    const clean = rawText.replace(/```json/gi, '').replace(/```/g, '').trim();
    return JSON.parse(clean);
}

// ══════════════════════════════════════════════════════════════════════
//  UTILITY: E.164 Phone Normalizer — The Gatekeeper
//
//  Rules (in order):
//   1. Strip all non-digit characters except a leading +.
//   2. If already +1XXXXXXXXXX (12 chars), keep as-is.
//   3. If exactly 10 digits (no country code), prepend +1.
//   4. Anything else → throw a 400-able error.
// ══════════════════════════════════════════════════════════════════════

function normalizePhone(phoneStr) {
    if (!phoneStr) throw Object.assign(new Error('Phone number is required.'), { status: 400 });

    const raw = String(phoneStr).trim();

    // Preserve a leading + then strip everything non-numeric
    const hasPlus  = raw.startsWith('+');
    const digitsOnly = raw.replace(/\D/g, '');

    let normalized;
    if (hasPlus && digitsOnly.length === 11 && digitsOnly.startsWith('1')) {
        // Already a valid +1XXXXXXXXXX
        normalized = '+' + digitsOnly;
    } else if (digitsOnly.length === 10) {
        // Bare 10-digit US number — prepend country code
        normalized = '+1' + digitsOnly;
    } else if (digitsOnly.length === 11 && digitsOnly.startsWith('1')) {
        // 11 digits starting with 1, no explicit + — treat as US
        normalized = '+' + digitsOnly;
    } else {
        throw Object.assign(
            new Error(`Invalid phone number "${phoneStr}". Expected a 10-digit US number or E.164 format.`),
            { status: 400 }
        );
    }
    return normalized;
}

// ══════════════════════════════════════════════════════════════════════
//  USER DATABASE ENGINE  (Phase 1 — Firestore)
//
//  Collection: "users"
//  Document ID: E.164 phone number  e.g. "+15551234567"
//  Schema: { companyName, email, zipCode, status }
// ══════════════════════════════════════════════════════════════════════

/**
 * Load a single user document by phone number.
 * Returns the user data object, or null if not found.
 */
async function loadUser(phone) {
    try {
        const snap = await db.collection('users').doc(phone).get();
        if (!snap.exists) return null;
        return snap.data();
    } catch (err) {
        console.error(`loadUser(${phone}): Firestore error:`, err.message);
        return null;
    }
}

/**
 * Save (upsert) a user document.
 */
async function saveUser(phone, data) {
    await db.collection('users').doc(phone).set(data, { merge: true });
}

/**
 * Resolves a canonical E.164 phone number given an email.
 * 
 * Behavior:
 * - Scans `users` (by `email`) and `settings` collection group (by `contact_email`).
 * - If multiple records match, prefers `status === 'active'` over `pending`.
 * - If >1 `active` match is found, logs a severe collision error and returns null (preventing arbitrary auth).
 */
async function resolvePhoneByEmail(email) {
    const activeMatches = new Set();
    const pendingMatches = new Set();

    // 1. Search top-level users collection
    const usersSnap = await db.collection('users').where('email', '==', email).get();
    usersSnap.forEach(doc => {
        const status = doc.data().status;
        if (status === 'active') activeMatches.add(doc.id);
        else pendingMatches.add(doc.id);
    });

    // 2. Search collection group 'settings'
    const settingsSnap = await db.collectionGroup('settings').where('contact_email', '==', email).get();
    for (const doc of settingsSnap.docs) {
        const userDocRef = doc.ref.parent.parent;
        if (userDocRef) {
            const userSnap = await userDocRef.get();
            if (userSnap.exists) {
                const status = userSnap.data().status;
                if (status === 'active') activeMatches.add(userDocRef.id);
                else pendingMatches.add(userDocRef.id);
            }
        }
    }

    if (activeMatches.size > 1) {
        console.error(`[CRITICAL] Multiple ACTIVE tenants mapped to email: ${email}. IDs: ${Array.from(activeMatches).join(', ')}`);
        return null; // Fail securely
    }

    if (activeMatches.size === 1) {
        const phone = Array.from(activeMatches)[0];
        await db.collection('users').doc(phone).set({ email }, { merge: true });
        return phone;
    }

    if (pendingMatches.size > 0) {
        return Array.from(pendingMatches)[0];
    }

    return null;
}

// ── Seed the initial user if the document doesn't exist yet ──────────
(async () => {
    const SEED_PHONE = process.env.SEED_PHONE;
    const SEED_EMAIL = process.env.SEED_EMAIL;
    if (!SEED_PHONE || !SEED_EMAIL) return; // skip seed if env vars not set
    const snap = await db.collection('users').doc(SEED_PHONE).get();
    if (!snap.exists) {
        console.log('📋 No user found in Firestore — seeding initial user...');
        await saveUser(SEED_PHONE, {
            companyName: 'Lone Ranger Contracting',
            email:       SEED_EMAIL,
            zipCode:     process.env.SEED_ZIP || '00000',
            status:      'active',
        });
        console.log(`✅  Seeded user ${SEED_PHONE} in Firestore.`);
    }
})().catch(err => console.error('Seed error:', err.message));

// ══════════════════════════════════════════════════════════════════════
//  LEDGER ENGINE  (Phase 1 — Firestore)
//
//  Collection: "ledgers"
//  Document ID: E.164 phone number
//  Schema: { [projectName]: { materials: [...], labor: [...] } }
// ══════════════════════════════════════════════════════════════════════

async function loadLedger(phone) {
    try {
        const snap = await db.collection('ledgers').doc(phone).get();
        if (!snap.exists) return {};
        return snap.data();
    } catch (err) {
        console.error(`loadLedger(${phone}): Firestore error:`, err.message);
        return {};
    }
}

async function saveLedger(phone, data) {
    await db.collection('ledgers').doc(phone).set(data);
}

// ══════════════════════════════════════════════════════════════════════
//  AUTH GUARD
//
//  Shared authorization helper for both the SMS webhook and REST endpoints.
//  Returns { authorized: true, user } or { authorized: false, reason }.
//  NOTE: Now async because loadUser() is async (Firestore).
// ══════════════════════════════════════════════════════════════════════

async function authorizePhone(phone) {
    if (!phone) {
        return { authorized: false, reason: 'No phone number provided.' };
    }
    const user = await loadUser(phone);
    if (!user) {
        return { authorized: false, reason: 'Unauthorized user. Please contact admin.' };
    }
    if (user.status !== 'active') {
        return { authorized: false, reason: 'Your account is inactive. Please contact admin.' };
    }
    return { authorized: true, user };
}

// ── Express middleware auth guard (for REST endpoints) ────────────────
//  Verifies Google OAuth ID token from Authorization header and resolves phone.
async function requireAuth(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Missing or invalid Authorization header.' });
    }
    
    const token = authHeader.split('Bearer ')[1];
    let payload;
    try {
        const ticket = await authClient.verifyIdToken({
            idToken: token,
            audience: process.env.GOOGLE_OAUTH_CLIENT_ID
        });
        payload = ticket.getPayload();
    } catch (err) {
        return res.status(401).json({ error: 'Invalid Google ID Token.' });
    }
    
    const email = payload.email;
    if (!email) {
        return res.status(400).json({ error: 'No email found in Google token.' });
    }
    
    const phone = await resolvePhoneByEmail(email);
    if (!phone) {
        return res.status(403).json({ error: 'Email not registered in the system.' });
    }
    
    const auth = await authorizePhone(phone);
    if (!auth.authorized) {
        return res.status(401).json({ error: auth.reason });
    }
    
    req.userPhone   = phone;
    req.authedPhone = phone;   
    req.authedUser  = auth.user;
    next();
}

// ── Express middleware subscription guard ────────────────────────────
//  Verifies that the authenticated user has an active subscription.
//  Executes sequentially AFTER requireAuth.
async function requireSubscription(req, res, next) {
    const userPhone = req.userPhone;
    try {
        const configSnap = await db.collection('users').doc(userPhone).collection('settings').doc('config').get();
        if (configSnap.exists) {
            const data = configSnap.data();
            if (data.active_subscription === true) {
                return next();
            }
        }
        return res.status(402).json({
            error: 'subscription_required',
            message: 'An active subscription is required.'
        });
    } catch (err) {
        console.error(`requireSubscription error for ${userPhone}:`, err.message);
        return res.status(500).json({ error: 'internal_error', message: 'Failed to verify subscription status.' });
    }
}

// ══════════════════════════════════════════════════════════════════════
//  PRICING ENGINE  (Phase 3 — Live fetch + TTL Firestore cache)
//
//  assignUnitPrice(item, userZipCode)
//    1. Check price_cache Firestore collection for a valid, non-expired entry.
//    2. On cache hit → return cached unit_price immediately.
//    3. On cache miss → fetch from estimationpro.ai live API.
//    4. Persist the result with a 24-hour expiresAt timestamp.
//    5. On API failure → fall back to Gemini AI estimate.
//    6. Default to unit_price: 0 if everything fails.
//
//  assignLaborRate(laborItem) — uses Gemini AI (unchanged).
//
//  STRICT TRADE ENUM (enforced via EXTRACTION_PROMPT schema):
//  concrete | flooring | roofing | tile | drywall | deck | fence |
//  paint | kitchen-remodel | bathroom-remodel | siding | insulation |
//  gravel | mulch | electrical | plumbing | labor-general | hvac |
//  windows | doors | countertops | cabinetry | gutters | demolition |
//  landscaping | foundation | garage | masonry | stucco | driveways |
//  waterproofing | framing | excavation
// ══════════════════════════════════════════════════════════════════════

// ── Shared sanitizer for price_book document IDs ──────────────────────
function sanitizeItemId(name) {
    return (name || '').replace(/[^a-zA-Z0-9]/g, '_').toLowerCase().substring(0, 100);
}

/**
 * Assigns a market unit_price to a material item.
 *
 * Lookup order:
 *   1. Firestore price_book (exact sanitized ID match)
 *   2. item.estimated_unit_cost  — the AI's conservative Wisconsin retail estimate
 *      (embedded in the item by EXTRACTION_PROMPT; used as fallback / until a
 *      human-approved price overwrites the price_book entry)
 *
 * The function mutates the item in place AND returns it for convenience.
 *
 * @param {{ name: string, quantity: number, unit: string, trade: string, estimated_unit_cost: number }} item
 * @returns {Promise<object>} The same item with unit_price and total attached.
 */
/**
 * Assigns a unit_price to a material item using a strict 3-priority waterfall.
 *
 * Priority 1 — Explicit user-dictated price (hallucination-safe):
 *   If item.explicit_user_price is a valid finite number (never null/undefined),
 *   use it immediately — skip all database reads entirely.
 *
 * Priority 2 — Per-user private price_book subcollection:
 *   Reads from users/{userPhone}/price_book/{sanitizedId}.
 *   Only the approving user's past estimates can seed this; other tenants
 *   cannot influence each other's pricing.
 *
 * Priority 3 — AI-estimated fallback:
 *   Falls back to item.estimated_unit_cost embedded by the extraction prompt.
 *
 * @param {object} item         — material item with name, quantity, estimated_unit_cost, explicit_user_price
 * @param {string} userZipCode  — user's zip code (reserved for future regional pricing)
 * @param {string} userPhone    — normalized E.164 phone; scopes the price_book subcollection
 */
async function assignUnitPrice(item, userZipCode, userPhone) {
    const itemId = sanitizeItemId(item.name);

    // ── Priority 1: Explicit user-dictated price ──────────────────────
    if (item.explicit_user_price !== null && item.explicit_user_price !== undefined
            && Number.isFinite(Number(item.explicit_user_price))) {
        item.unit_price  = Number(item.explicit_user_price);
        item.price_source = 'override';
        console.log(`[pricing] EXPLICIT "${item.name}" → $${item.unit_price} (user-dictated, skipping DB)`);
        item.total = Math.round((item.quantity || 0) * item.unit_price * 100) / 100;
        return item;
    }

    // ── Priority 2: Per-user private price_book subcollection ─────────
    try {
        const snap = await db
            .collection('users').doc(userPhone)
            .collection('price_book').doc(itemId)
            .get();
        if (snap.exists) {
            item.unit_price  = Number(snap.data().price) || 0;
            item.price_source = 'database';
            console.log(`[price_book] HIT  [${userPhone}] "${item.name}" → $${item.unit_price}`);
            item.total = Math.round((item.quantity || 0) * item.unit_price * 100) / 100;
            return item;
        }
        console.log(`[price_book] MISS [${userPhone}] "${item.name}" — falling back to next priority`);
    } catch (err) {
        console.error(`[price_book] Firestore error for "${item.name}":`, err.message);
    }

    // ── Priority 2.5: default_labor_rate configuration ─────────────────
    if (item.trade === 'labor-general' || item.type === 'labor') {
        let defaultLaborRate = 55;
        try {
            const configSnap = await db.collection('users').doc(userPhone).collection('settings').doc('config').get();
            if (configSnap.exists) {
                defaultLaborRate = Number(configSnap.data().default_labor_rate) || 55;
            }
        } catch (err) {
            console.error(`[pricing] Failed to load settings for default labor rate:`, err.message);
        }
        item.unit_price = defaultLaborRate;
        item.price_source = 'database';
        console.log(`[pricing] DEFAULT LABOR RATE HIT [${userPhone}] "${item.name}" → $${item.unit_price}/hr`);
        item.total = Math.round((item.quantity || 0) * item.unit_price * 100) / 100;
        return item;
    }

    // ── Priority 3: AI-estimated fallback ────────────────────────────
    item.unit_price  = Number(item.estimated_unit_cost) || 0;
    item.price_source = 'ai';
    console.log(`[price_book] AI   [${userPhone}] "${item.name}" → $${item.unit_price}`);
    item.total = Math.round((item.quantity || 0) * item.unit_price * 100) / 100;
    return item;
}

/**
 * Assigns a market hourly rate and calculated total to a labor item.
 * Uses Gemini AI estimation.
 *
 * NEXT SPRINT — replace the body of this function with the appropriate fetch() call.
 *
 * @param {{ role: string, hours: number }} laborItem
 * @returns {Promise<{ role, hours, rate, total }>}
 */
async function assignLaborRate(laborItem, userPhone) {
    if (laborItem.explicit_user_price !== null && laborItem.explicit_user_price !== undefined
            && Number.isFinite(Number(laborItem.explicit_user_price))) {
        const rate = Number(laborItem.explicit_user_price);
        console.log(`[pricing] EXPLICIT LABOR "${laborItem.role}" → $${rate}/hr (user-dictated, skipping AI)`);
        return {
            ...laborItem,
            rate,
            total: Math.round(laborItem.hours * rate * 100) / 100,
        };
    }

    // Try default labor rate from settings
    let defaultLaborRate = null;
    if (userPhone) {
        try {
            const configSnap = await db.collection('users').doc(userPhone).collection('settings').doc('config').get();
            if (configSnap.exists) {
                defaultLaborRate = Number(configSnap.data().default_labor_rate);
            }
        } catch (_) {}
    }

    if (defaultLaborRate !== null && defaultLaborRate !== undefined && !isNaN(defaultLaborRate)) {
        console.log(`[pricing] DEFAULT LABOR RATE HIT [${userPhone}] "${laborItem.role}" → $${defaultLaborRate}/hr`);
        return {
            ...laborItem,
            rate: defaultLaborRate,
            total: Math.round(laborItem.hours * defaultLaborRate * 100) / 100,
        };
    }

    const prompt =
        `You are a US construction cost estimator. What is the standard market hourly rate (USD) for a "${laborItem.role}"? ` +
        `Output ONLY valid JSON with no markdown: { "rate": 0.00 }`;
    try {
        const response = await ai.models.generateContent({
            model: 'gemini-3.5-flash',
            contents: { role: 'user', parts: [{ text: prompt }] },
        });
        const parsed = parseGeminiJSON(response.text);
        const rate   = Number(parsed.rate) || 0;
        return {
            ...laborItem,
            rate,
            total: Math.round(laborItem.hours * rate * 100) / 100,
        };
    } catch (err) {
        console.error(`assignLaborRate: failed for "${laborItem.role}", defaulting to $0:`, err.message);
        return { ...laborItem, rate: 0, total: 0 };
    }
}

// ══════════════════════════════════════════════════════════════════════
//  MERGE ENGINE
// ══════════════════════════════════════════════════════════════════════

/**
 * Prices extracted items, then merges them into the Firestore estimates collection
 * under the authenticated user's phone number document.
 *
 * @param {object} extracted  - { projectName, materials, labor }
 * @param {string} phone      - Authenticated user's E.164 phone number.
 * @param {string} zipCode    - User's zip code, passed to pricing engine.
 * @param {string} estimateId - Optional active estimate ID to merge into.
 */
async function mergeIntoLedger(extracted, phone, zipCode, estimateId = null) {
    const { projectName = 'General', scope_of_work = '', materials = [], labor = [] } = extracted;

    console.log(`[${phone}] Merging ${materials.length} material(s) + ${labor.length} labor item(s) into "${projectName}" (estimateId: ${estimateId})`);

    // Pass both zipCode (reserved) and normalized phone (subcollection scope) to pricing engine.
    const [pricedMaterials, pricedLabor] = await Promise.all([
        Promise.all(materials.map(item => assignUnitPrice(item, zipCode, phone))),
        Promise.all(labor.map(item => assignLaborRate(item, phone))),
    ]);

    let docRef;
    let existingData = null;

    if (estimateId) {
        docRef = db.collection('users').doc(phone).collection('estimates').doc(estimateId);
        const snap = await docRef.get();
        if (snap.exists) {
            existingData = snap.data();
        }
    }

    if (!existingData) {
        // Fallback: look up by case-insensitive name match to find estimate ID
        const snap = await db.collection('users').doc(phone).collection('estimates').get();
        let matchedDoc = null;
        snap.forEach(doc => {
            const data = doc.data();
            if ((data.project_name || '').toLowerCase() === projectName.toLowerCase()) {
                matchedDoc = doc;
            }
        });
        if (matchedDoc) {
            docRef = matchedDoc.ref;
            existingData = matchedDoc.data();
            estimateId = matchedDoc.id;
        } else {
            // Generate a new ID if no match is found
            estimateId = estimateId || 'est_' + crypto.randomBytes(8).toString('hex') + Date.now().toString(36);
            docRef = db.collection('users').doc(phone).collection('estimates').doc(estimateId);
        }
    }

    let currentItems = existingData ? (existingData.items || []) : [];

    // Separate materials and labor from current list to merge them
    const currentMaterials = currentItems.filter(i => i.type === 'material' || !i.role);
    const currentLabor     = currentItems.filter(i => i.type === 'labor' || i.role);

    // Merge materials — add quantity if item name already exists
    for (const newItem of pricedMaterials) {
        const existing = currentMaterials.find(
            m => m.name.toLowerCase() === newItem.name.toLowerCase()
        );
        if (existing) {
            existing.quantity += newItem.quantity;
            existing.total = Math.round(existing.quantity * existing.unit_price * 100) / 100;
            console.log(`  Updated material "${existing.name}": qty now ${existing.quantity}`);
        } else {
            currentMaterials.push({ ...newItem, type: 'material' });
            console.log(`  Added new material "${newItem.name}"`);
        }
    }

    // Merge labor — add hours if role already exists
    for (const newLabor of pricedLabor) {
        const existing = currentLabor.find(
            l => l.role.toLowerCase() === newLabor.role.toLowerCase()
        );
        if (existing) {
            existing.hours += newLabor.hours;
            existing.total = Math.round(existing.hours * existing.rate * 100) / 100;
            console.log(`  Updated labor "${existing.role}": hours now ${existing.hours}`);
        } else {
            currentLabor.push({ ...newLabor, type: 'labor' });
            console.log(`  Added new labor "${newLabor.role}"`);
        }
    }

    const mergedItems = [...currentMaterials, ...currentLabor];
    const totalAmount = mergedItems.reduce((s, i) => s + (i.total || 0), 0);
    const itemCount   = mergedItems.length;
    const finalProjectName = existingData ? (existingData.project_name || projectName) : projectName;

    await docRef.set({
        project_name: finalProjectName,
        scope_of_work: scope_of_work || null,
        items: mergedItems,
        total_amount: Math.round(totalAmount * 100) / 100,
        item_count: itemCount,
        updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });

    return {
        projectName: finalProjectName,
        estimateId,
        itemCount: pricedMaterials.length + pricedLabor.length,
        scope_of_work: scope_of_work || null,
    };
}

// ══════════════════════════════════════════════════════════════════════
//  EXTRACTION SYSTEM PROMPT  (Phase 3 — Strict Trade Enum enforced)
//
//  Pure extraction only — no pricing in this prompt.
//  Pricing is handled separately by the Pricing Engine above.
// ══════════════════════════════════════════════════════════════════════

const VALID_TRADES = [
    'concrete', 'flooring', 'roofing', 'tile', 'drywall', 'deck', 'fence',
    'paint', 'kitchen-remodel', 'bathroom-remodel', 'siding', 'insulation',
    'gravel', 'mulch', 'electrical', 'plumbing', 'labor-general', 'hvac',
    'windows', 'doors', 'countertops', 'cabinetry', 'gutters', 'demolition',
    'landscaping', 'foundation', 'garage', 'masonry', 'stucco', 'driveways',
    'waterproofing', 'framing', 'excavation',
];

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

// ══════════════════════════════════════════════════════════════════════
//  ENDPOINT: GET /api/pending-estimates
//  Returns the authenticated user's project ledger.
//  Requires ?phone=<E.164 encoded phone> query param.
// ══════════════════════════════════════════════════════════════════════

app.get('/api/pending-estimates', requireAuth, async (req, res) => {
    const phone = req.userPhone;
    const auth = await authorizePhone(phone);
    if (!auth.authorized) {
        return res.status(401).json({ error: auth.reason });
    }
    const ledger = await loadLedger(phone);
    res.json(ledger);
});

// ══════════════════════════════════════════════════════════════════════
//  ENDPOINT: POST /api/webhook
//  Twilio SMS Bridge. Accepts Twilio form-data, enforces auth,
//  and merges extracted items into the authenticated user's ledger.
// ══════════════════════════════════════════════════════════════════════

app.post('/api/webhook', async (req, res) => {
    const twilioSignature = req.headers['x-twilio-signature'];
    const url = `https://${req.get('host')}${req.originalUrl}`;
    if (!twilio.validateRequest(process.env.TWILIO_AUTH_TOKEN, twilioSignature, url, req.body)) {
        return res.status(403).send('Forbidden');
    }

    const text    = req.body.Body;
    const rawFrom = req.body.From;

    // Normalize the Twilio sender number before any DB lookup
    let from;
    try {
        from = normalizePhone(rawFrom);
    } catch (normErr) {
        console.warn(`Webhook: invalid phone format "${rawFrom}" — ${normErr.message}`);
        const twiml = new MessagingResponse();
        twiml.message('Could not process your number. Please contact admin.');
        return res.type('text/xml').send(twiml.toString());
    }

    // Authorization check
    const auth = await authorizePhone(from);
    if (!auth.authorized) {
        console.warn(`Webhook: rejected request from ${from} — ${auth.reason}`);
        const twiml = new MessagingResponse();
        twiml.message(auth.reason);
        return res.type('text/xml').send(twiml.toString());
    }

    if (!text || !text.trim()) {
        const twiml = new MessagingResponse();
        twiml.message('No text provided.');
        return res.type('text/xml').send(twiml.toString());
    }

    const { user } = auth;

    try {
        console.log(`Twilio Webhook: extracting items from text sent by ${from} (${user.companyName})...`);
        const response = await ai.models.generateContent({
            model: 'gemini-3.5-flash',
            contents: { role: 'user', parts: [{ text: text + '\n\n' + EXTRACTION_PROMPT }] },
        });
        const extracted = parseGeminiJSON(response.text);
        const result    = await mergeIntoLedger(extracted, from, user.zipCode);

        const twiml = new MessagingResponse();
        twiml.message(`Added ${result.itemCount} item(s) to "${result.projectName}". Ledger updated.`);
        res.type('text/xml').send(twiml.toString());

    } catch (err) {
        console.error('Webhook error:', err);
        const twiml = new MessagingResponse();
        twiml.message("Sorry, I didn't catch any materials in that message. Please try again.");
        res.type('text/xml').send(twiml.toString());
    }
});

// ══════════════════════════════════════════════════════════════════════
//  ENDPOINT: POST /api/process-text
//  Web UI text input → extraction → merge.
//  Requires { phone, text } in the JSON body.
// ══════════════════════════════════════════════════════════════════════

app.post('/api/process-text', requireAuth, requireSubscription, async (req, res) => {
    const phone = req.userPhone;
    const text = req.body.text;
    const estimateId = req.body.estimateId || null;

    if (!text || !text.trim()) {
        return res.status(400).json({ error: 'No text provided' });
    }

    const user = req.authedUser;

    try {
        console.log(`[${phone}] process-text: extracting items...`);
        const response = await ai.models.generateContent({
            model: 'gemini-3.5-flash',
            contents: { role: 'user', parts: [{ text: text + '\n\n' + EXTRACTION_PROMPT }] },
        });
        const extracted = parseGeminiJSON(response.text);
        const result    = await mergeIntoLedger(extracted, phone, user.zipCode, estimateId);
        res.json({ success: true, ...result });
    } catch (err) {
        console.error('process-text error:', err);
        res.status(500).json({ error: err.message || 'Failed to process text' });
    }
});

// ══════════════════════════════════════════════════════════════════════
//  ENDPOINT: POST /api/process
//  Audio upload → Gemini File API → extraction → merge.
//  Requires phone in the multipart form fields.
// ══════════════════════════════════════════════════════════════════════

app.post('/api/process', upload.single('audio'), requireAuth, requireSubscription, async (req, res) => {
    const phone = req.userPhone;
    if (!req.file) {
        return res.status(400).json({ error: 'No audio file provided' });
    }

    const user = req.authedUser;
    const audioFilePath = req.file.path;
    let geminiFile = null;

    try {
        console.log(`[${phone}] process (audio): uploading to Gemini File API...`);
        geminiFile = await ai.files.upload({
            file: audioFilePath,
            config: { mimeType: req.file.mimetype || 'audio/webm' },
        });
        console.log(`Uploaded as ${geminiFile.name}`);

        const response = await ai.models.generateContent({
            model: 'gemini-3.5-flash',
            contents: {
                role: 'user',
                parts: [
                    createPartFromUri(geminiFile.uri, geminiFile.mimeType),
                    { text: EXTRACTION_PROMPT },
                ],
            },
        });

        const extracted = parseGeminiJSON(response.text);
        const estimateId = req.body.estimateId || null;
        const result    = await mergeIntoLedger(extracted, phone, user.zipCode, estimateId);
        res.json({ success: true, ...result });

    } catch (err) {
        console.error('process (audio) error:', err);
        res.status(500).json({ error: err.message || 'Failed to process audio' });
    } finally {
        if (fs.existsSync(audioFilePath)) fs.unlinkSync(audioFilePath);
        if (geminiFile?.name) {
            try { await ai.files.delete({ name: geminiFile.name }); } catch (_) { /* swallow */ }
        }
    }
});

// ══════════════════════════════════════════════════════════════════════
//  ENDPOINT: POST /api/generate-pdf
//
//  Accepts { phone, projectName, project? }.
//  Security: requireAuth logic verifies phone.
//  Uses Puppeteer to generate high-fidelity print-styled PDFs from HTML.
// ══════════════════════════════════════════════════════════════════════

function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

app.post('/api/generate-pdf', requireAuth, requireSubscription, async (req, res) => {
    const phone = req.userPhone;
    const projectName   = req.body.projectName;
    const clientProject = req.body.project;

    if (!projectName) {
        return res.status(400).json({ error: 'Missing projectName' });
    }

    const user = req.authedUser;

    // Load dynamic user settings/profile config
    let profile = {
        company_name: '',
        company_address: '',
        company_logo_url: '',
        license_number: '',
        contact_email: '',
        default_labor_rate: 55,
        global_markup_percent: 0,
        tax_rate: 5.5
    };
    try {
        const configSnap = await db.collection('users').doc(phone).collection('settings').doc('config').get();
        if (configSnap.exists) {
            profile = { ...profile, ...configSnap.data() };
        }
    } catch (err) {
        console.warn(`[${phone}] generate-pdf: failed to load config profile settings. using defaults.`, err.message);
    }

    // Email MUST come from Firestore — never trust the client payload.
    const contractorEmail = (profile.contact_email || user.email || '').trim();
    if (!contractorEmail) {
        console.error(`[${phone}] generate-pdf: no email address on file in Firestore for this user.`);
        return res.status(400).json({ error: 'No email address on file for this user' });
    }

    // ── Phase 1: Fetch and Segment Project Data ──────────────────────
    let items = [];
    let clientName = null;
    let clientAddress = null;
    let scopeOfWork = null;

    if (clientProject) {
        // From client payload
        const mats = (clientProject.materials || []).map(m => ({ ...m, type: 'material' }));
        const lab = (clientProject.labor || []).map(l => ({ ...l, type: 'labor' }));
        items = [...mats, ...lab];
        clientName = clientProject.client_name || null;
        clientAddress = clientProject.client_address || null;
        scopeOfWork = clientProject.scope_of_work || null;
    } else {
        // Load from estimates subcollection (using projectName as the estimate ID)
        const estimateSnap = await db.collection('users').doc(phone).collection('estimates').doc(projectName).get();
        if (estimateSnap.exists) {
            const data = estimateSnap.data();
            items = data.items || [];
            clientName = data.client_name || null;
            clientAddress = data.client_address || null;
            scopeOfWork = data.scope_of_work || null;
        } else {
            // Check legacy ledger
            const legacyLedger = await loadLedger(phone);
            const legacyProj = legacyLedger[projectName];
            if (legacyProj) {
                const mats = (legacyProj.materials || []).map(m => ({ ...m, type: 'material' }));
                const lab = (legacyProj.labor || []).map(l => ({ ...l, type: 'labor' }));
                items = [...mats, ...lab];
            }
        }
    }

    const materialsArray = items.filter(i => i.type === 'material' || !i.role);
    const laborArray     = items.filter(i => i.type === 'labor' || i.role);

    // Financial calculations with Settings configuration overrides
    const materialsSubtotal = materialsArray.reduce((sum, item) => sum + (Number(item.total) || 0), 0);
    const laborSubtotal     = laborArray.reduce((sum, item) => sum + (Number(item.total) || 0), 0);
    
    // Apply global markup percentage to materials subtotal
    const markedUpMaterials = materialsSubtotal * (1 + (profile.global_markup_percent || 0) / 100);
    
    // Determine dynamic tax rate (fallback to 5.5%)
    const taxRate = profile.tax_rate !== undefined && profile.tax_rate !== null ? Number(profile.tax_rate) : 5.5;
    
    // Calculate sales tax on marked up materials
    const wiSalesTax = Math.round(markedUpMaterials * (taxRate / 100) * 100) / 100;
    
    // Grand total includes marked up materials, labor, and tax
    const grandTotal = Math.round((markedUpMaterials + laborSubtotal + wiSalesTax) * 100) / 100;

    // ── Phase 2: Sequential ID Counter Transaction ──────────────────
    let estimateNo = '';
    try {
        const counterRef = db.collection('users').doc(phone).collection('settings').doc('config');
        const nextCount = await db.runTransaction(async (transaction) => {
            const doc = await transaction.get(counterRef);
            let count = 0;
            if (doc.exists) {
                count = doc.data().estimateCount || 0;
            }
            count += 1;
            transaction.set(counterRef, { estimateCount: count }, { merge: true });
            return count;
        });
        const year = new Date().getFullYear();
        estimateNo = `EST-${year}-${String(nextCount).padStart(4, '0')}`;
    } catch (counterErr) {
        console.error(`[${phone}] Failed to increment estimate counter, using timestamp fallback:`, counterErr.message);
        estimateNo = `EST-${new Date().getFullYear()}-${Date.now().toString().slice(-4)}`;
    }

    // Self-teaching price_book updates for materials
    const materialsToLearn = materialsArray.filter(m => m.name && m.unit_price != null);
    if (materialsToLearn.length > 0) {
        console.log(`[price_book] Learning ${materialsToLearn.length} price(s) from PDF generation...`);
        await Promise.all(
            materialsToLearn.map(m =>
                db.collection('users').doc(phone)
                  .collection('price_book').doc(sanitizeItemId(m.name))
                  .set({ name: m.name, price: Number(m.unit_price) }, { merge: true })
                  .catch(err => console.warn(`[price_book] Write failed for "${m.name}":`, err.message))
            )
        );
    }

    // ── Phase 3 & 4: HTML compilation and print templates ───────────
    const formattedDate = new Date().toLocaleDateString('en-US', {
        year: 'numeric', month: 'long', day: 'numeric',
    });
    const displayClientName = (clientName || '').trim() || projectName;
    const displayClientAddressHtml = (clientAddress || '').trim()
        ? escapeHtml(clientAddress.trim())
        : '<span style="color:#6b7280; font-style:italic;">Address not provided</span>';
    const displayScopeOfWork = (scopeOfWork || '').trim() || 'This estimate is based on initial walkthroughs and may be subject to change upon final site inspection.';

    const companyNameToShow = profile.company_name || user.companyName || 'Lone Ranger Contracting';
    let displayLogoHtml = '';
    if (profile.company_logo_url && (profile.company_logo_url.startsWith('https://') || profile.company_logo_url.startsWith('data:image/'))) {
        displayLogoHtml = `<img src="${escapeHtml(profile.company_logo_url)}" style="max-height: 50px; max-width: 150px; object-fit: contain;" />`;
    } else {
        const initials = companyNameToShow.substring(0, 2).toUpperCase();
        displayLogoHtml = `
            <div style="width: 50px; height: 50px; border-radius: 50%; background: #521880; color: #ffffff; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 14pt; border: 2px solid #210936;">
                ${initials}
            </div>
        `;
    }

    const materialsRows = materialsArray.length > 0
        ? materialsArray.map(m => `
            <tr>
                <td style="padding: 8px 10px; border-bottom: 1px solid #e9d5ff; font-size: 9.5pt;">${escapeHtml(m.name)}</td>
                <td style="padding: 8px 10px; border-bottom: 1px solid #e9d5ff; font-size: 9.5pt;" class="text-right">${m.quantity || 0}</td>
                <td style="padding: 8px 10px; border-bottom: 1px solid #e9d5ff; font-size: 9.5pt;">${escapeHtml(m.unit || 'ea')}</td>
                <td style="padding: 8px 10px; border-bottom: 1px solid #e9d5ff; font-size: 9.5pt;" class="text-right">$${Number(m.unit_price || 0).toFixed(2)}</td>
                <td style="padding: 8px 10px; border-bottom: 1px solid #e9d5ff; font-size: 9.5pt;" class="text-right">$${Number(m.total || 0).toFixed(2)}</td>
            </tr>
        `).join('')
        : `<tr><td colspan="5" class="text-center italic" style="padding: 12px; border-bottom: 1px solid #e9d5ff; color:#6b7280; font-size: 9.5pt;">No materials listed</td></tr>`;

    const laborRows = laborArray.length > 0
        ? laborArray.map(l => `
            <tr>
                <td style="padding: 8px 10px; border-bottom: 1px solid #e9d5ff; font-size: 9.5pt;">${escapeHtml(l.role || l.name)}</td>
                <td style="padding: 8px 10px; border-bottom: 1px solid #e9d5ff; font-size: 9.5pt;" class="text-right">${l.hours || l.quantity || 0}</td>
                <td style="padding: 8px 10px; border-bottom: 1px solid #e9d5ff; font-size: 9.5pt;">hr</td>
                <td style="padding: 8px 10px; border-bottom: 1px solid #e9d5ff; font-size: 9.5pt;" class="text-right">$${Number(l.rate || l.unit_price || 0).toFixed(2)}</td>
                <td style="padding: 8px 10px; border-bottom: 1px solid #e9d5ff; font-size: 9.5pt;" class="text-right">$${Number(l.total || 0).toFixed(2)}</td>
            </tr>
        `).join('')
        : `<tr><td colspan="5" class="text-center italic" style="padding: 12px; border-bottom: 1px solid #e9d5ff; color:#6b7280; font-size: 9.5pt;">No labor listed</td></tr>`;

    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Estimate ${estimateNo}</title>
    <style>
        body {
            font-family: 'Inter', system-ui, -apple-system, sans-serif;
            background: #ffffff;
            color: #210936;
            margin: 0;
            padding: 30px;
            font-size: 10.5pt;
            line-height: 1.4;
        }
        .header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-bottom: 3px solid #521880;
            padding-bottom: 15px;
            margin-bottom: 25px;
        }
        .company-name {
            font-size: 16pt;
            font-weight: 800;
            color: #210936;
        }
        .estimate-title {
            font-size: 18pt;
            font-weight: 800;
            color: #521880;
            margin: 0 0 5px 0;
        }
        .meta-item {
            font-size: 9pt;
            color: #9b59d0;
            margin: 2px 0;
            text-align: right;
        }
        .info-grid {
            display: flex;
            gap: 20px;
            margin-bottom: 30px;
        }
        .info-card {
            flex: 1;
            border: 1px solid #e9d5ff;
            border-radius: 8px;
            padding: 12px 15px;
            background: #faf7fd;
        }
        .info-title {
            font-size: 8.5pt;
            font-weight: 700;
            text-transform: uppercase;
            color: #521880;
            margin: 0 0 8px 0;
            border-bottom: 1px solid #e9d5ff;
            padding-bottom: 4px;
        }
        .info-text {
            font-size: 9.5pt;
            margin: 3px 0;
            color: #210936;
        }
        .section-title {
            font-size: 10.5pt;
            font-weight: 700;
            text-transform: uppercase;
            color: #210936;
            margin: 20px 0 10px 0;
            padding-bottom: 4px;
            border-bottom: 2px solid #521880;
        }
        table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 20px;
        }
        th {
            background: #210936;
            color: #ffffff;
            font-size: 8.5pt;
            font-weight: 600;
            text-transform: uppercase;
            padding: 6px 10px;
            text-align: left;
        }
        .text-right { text-align: right; }
        .text-center { text-align: center; }
        .totals-table {
            width: 45%;
            margin-left: auto;
            margin-top: 15px;
            margin-bottom: 30px;
        }
        .totals-table td {
            padding: 6px 10px;
            font-size: 9.5pt;
            border-bottom: 1px solid #e9d5ff;
        }
        .totals-table tr.grand-total {
            background: #210936;
            color: #ffffff;
            font-weight: 700;
        }
        .totals-table tr.grand-total td {
            border-bottom: none;
            color: #e9d5ff;
            font-size: 11pt;
        }
        .terms-box {
            font-size: 8.5pt;
            color: #6b7280;
            border-top: 1px solid #e9d5ff;
            padding-top: 15px;
            margin-top: 40px;
            line-height: 1.5;
        }
        .signature-section {
            margin-top: 40px;
            display: flex;
            gap: 40px;
        }
        .signature-card {
            flex: 1;
        }
        .signature-line {
            border-top: 1px solid #1a0729;
            margin-top: 40px;
            padding-top: 5px;
            font-size: 8.5pt;
            text-align: center;
            color: #521880;
            font-weight: 600;
        }
    </style>
</head>
<body>

    <div class="header">
        <div style="display: flex; align-items: center; gap: 15px;">
            ${displayLogoHtml}
            <div class="company-name">${escapeHtml(companyNameToShow)}</div>
        </div>
        <div>
            <h1 class="estimate-title">Estimate</h1>
            <div class="meta-item"><strong>Number:</strong> ${escapeHtml(estimateNo)}</div>
            <div class="meta-item"><strong>Date:</strong> ${formattedDate}</div>
        </div>
    </div>

    <div class="info-grid">
        <div class="info-card">
            <h2 class="info-title">Prepared By</h2>
            <p class="info-text"><strong>${escapeHtml(companyNameToShow)}</strong></p>
            ${profile.company_address ? `<p class="info-text">${escapeHtml(profile.company_address)}</p>` : ''}
            <p class="info-text">Phone: ${escapeHtml(phone)}</p>
            <p class="info-text">Email: ${escapeHtml(profile.contact_email || user.email || '')}</p>
            ${profile.license_number ? `<p class="info-text" style="font-size: 8.3pt; color: #521880; margin-top: 5px;">License: ${escapeHtml(profile.license_number)}</p>` : ''}
        </div>
        <div class="info-card">
            <h2 class="info-title">Prepared For</h2>
            <p class="info-text"><strong>${escapeHtml(displayClientName)}</strong></p>
            <p class="info-text">${displayClientAddressHtml}</p>
        </div>
    </div>

    <div style="margin-bottom: 25px; border: 1px solid #e9d5ff; border-radius: 8px; padding: 12px 15px; background: #faf7fd;">
        <h3 style="font-size: 8.5pt; font-weight: 700; text-transform: uppercase; color: #521880; margin: 0 0 8px 0; border-bottom: 1px solid #e9d5ff; padding-bottom: 4px;">Scope of Work</h3>
        <p style="font-size: 9.5pt; margin: 0; color: #210936; line-height: 1.5; font-style: italic;">${escapeHtml(displayScopeOfWork)}</p>
    </div>

    <h2 class="section-title">Materials & Items</h2>
    <table>
        <thead>
            <tr>
                <th>Description</th>
                <th class="text-right" style="width: 60px;">Qty</th>
                <th style="width: 60px;">Unit</th>
                <th class="text-right" style="width: 100px;">Unit Price</th>
                <th class="text-right" style="width: 110px;">Total</th>
            </tr>
        </thead>
        <tbody>
            ${materialsRows}
        </tbody>
    </table>

    <h2 class="section-title">Crew & Labor</h2>
    <table>
        <thead>
            <tr>
                <th>Role / Task</th>
                <th class="text-right" style="width: 60px;">Hours</th>
                <th style="width: 60px;">Unit</th>
                <th class="text-right" style="width: 100px;">Rate/Hr</th>
                <th class="text-right" style="width: 110px;">Total</th>
            </tr>
        </thead>
        <tbody>
            ${laborRows}
        </tbody>
    </table>

    <table class="totals-table">
        <tbody>
            <tr>
                <td>Materials Subtotal ${profile.global_markup_percent ? `(includes ${profile.global_markup_percent}% markup)` : ''}</td>
                <td class="text-right">$${markedUpMaterials.toFixed(2)}</td>
            </tr>
            <tr>
                <td>Labor Subtotal</td>
                <td class="text-right">$${laborSubtotal.toFixed(2)}</td>
            </tr>
            <tr>
                <td>Sales Tax (${taxRate.toFixed(1)}% on Materials)</td>
                <td class="text-right">$${wiSalesTax.toFixed(2)}</td>
            </tr>
            <tr class="grand-total">
                <td><strong>Grand Total</strong></td>
                <td class="text-right"><strong>$${grandTotal.toFixed(2)}</strong></td>
            </tr>
        </tbody>
    </table>

    <div class="terms-box">
        <strong>Standard Payment Terms:</strong> 50% deposit required to schedule work, remaining 50% due immediately upon completion.
        <br>
        <strong>Validity:</strong> This estimate is valid for 30 days from the date of issuance.
    </div>

    <div class="signature-section">
        <div class="signature-card">
            <div class="signature-line">Contractor Signature</div>
        </div>
        <div class="signature-card">
            <div class="signature-line">Client Acceptance Signature</div>
        </div>
    </div>

    <div style="margin-top: 40px; border-top: 1px solid #e9d5ff; padding-top: 10px; font-size: 8pt; color: #9b59d0; display: flex; justify-content: space-between;">
        <span>&copy; ${new Date().getFullYear()} ${escapeHtml(companyNameToShow)}</span>
        ${profile.license_number ? `<span>License: ${escapeHtml(profile.license_number)}</span>` : ''}
    </div>

</body>
</html>
`;

    // ── Phase 5: Render PDF via Puppeteer to /tmp/ ────────────────────
    const estimateIdClean = projectName.replace(/[^a-zA-Z0-9_-]/g, '_');
    const pdfFilename = `Estimate_${estimateIdClean}_${Date.now()}.pdf`;
    const pdfPath = path.join('/tmp', pdfFilename);

    let browser;
    try {
        console.log(`[${phone}] Launching Puppeteer...`);
        browser = await puppeteer.launch({
          headless: true,
          executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium',
          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu'
          ]
        });
        const page = await browser.newPage();
        await page.setContent(htmlContent, { waitUntil: 'networkidle0' });
        const pdfBuffer = await page.pdf({
            format: 'Letter',
            printBackground: true,
            margin: { top: '0.4in', bottom: '0.4in', left: '0.4in', right: '0.4in' }
        });
        fs.writeFileSync(pdfPath, pdfBuffer);
        console.log(`[${phone}] PDF rendered and written to ${pdfPath}`);
        await browser.close();
        browser = null;

        // Email the PDF
        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
        });

        await transporter.sendMail({
            from:    `"${user.companyName}" <${process.env.EMAIL_USER}>`,
            to:      contractorEmail,
            subject: `Estimate ${estimateNo}: ${projectName}`,
            text:    `Hello,\n\nPlease find attached the final estimate for "${projectName}" (Estimate ${estimateNo}).\n\nGrand Total: $${grandTotal.toFixed(2)}\n\nThank you,\n${user.companyName}`,
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px;">
                    <h2 style="color: #1e2533;">${user.companyName}</h2>
                    <p>Hello,</p>
                    <p>Please find attached the final estimate for <strong>"${projectName}"</strong>.</p>
                    <p>Estimate Number: <strong>${estimateNo}</strong></p>
                    <p style="font-size: 20px; font-weight: bold; color: #521880;">Grand Total: $${grandTotal.toFixed(2)}</p>
                    <p>Thank you,<br/>${user.companyName}</p>
                </div>
            `,
            attachments: [{ filename: `Estimate_${estimateNo}.pdf`, path: pdfPath }],
        });
        console.log(`[${phone}] Email sent to ${contractorEmail}`);

        // Success cleanup: remove legacy project from user's ledger if exists
        try {
            const freshLedger = await loadLedger(phone);
            if (freshLedger[projectName]) {
                delete freshLedger[projectName];
                await saveLedger(phone, freshLedger);
            }
        } catch (_) {}

        res.json({ success: true, message: `Estimate emailed to ${contractorEmail}` });

    } catch (err) {
        console.error('generate-pdf error:', err);
        res.status(500).json({ error: err.message || 'Failed to generate and email PDF' });
    } finally {
        if (browser) {
            try { await browser.close(); } catch (_) {}
        }
        if (pdfPath && fs.existsSync(pdfPath)) {
            try { fs.unlinkSync(pdfPath); console.log(`Deleted temp PDF file: ${pdfPath}`); } catch (_) {}
        }
    }
});

// ══════════════════════════════════════════════════════════════════════
//  ENDPOINT: POST /api/upload-csv
//  Secured bulk price_book uploader. Accepts a CSV with name + price
//  columns (fuzzy header matching, case-insensitive). Strips currency
//  symbols before parsing. Batches writes in chunks of 499.
//
//  Security: requireAuth verifies ?phone= or body.phone against Firestore.
//  Multer: 5 MB limit, CSV MIME filter (400 on rejection).
// ══════════════════════════════════════════════════════════════════════

// Multer error handler for the CSV route (catches LIMIT_FILE_SIZE + csvFilter errors)
function handleCsvUploadError(err, req, res, next) {
    if (err) {
        const status = err.status || (err.code === 'LIMIT_FILE_SIZE' ? 413 : 400);
        const msg    = err.code === 'LIMIT_FILE_SIZE'
            ? 'File exceeds the 5 MB limit.'
            : (err.message || 'Invalid file upload.');
        return res.status(status).json({ error: msg });
    }
    next();
}

app.post(
    '/api/upload-csv',
    (req, res, next) => csvUpload.single('file')(req, res, (err) => handleCsvUploadError(err, req, res, next)),
    requireAuth,
    async (req, res) => {
        const userPhone = req.userPhone;   // normalized E.164 set by requireAuth

        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded.' });
        }

        // ── Parse CSV ────────────────────────────────────────────────
        const rows    = [];
        let   skipped = 0;
        const NAME_ALIASES  = new Set(['name', 'item', 'description']);
        const PRICE_ALIASES = new Set(['price', 'cost', 'unit_cost']);

        try {
            await new Promise((resolve, reject) => {
                fs.createReadStream(req.file.path)
                    .pipe(csv({ mapHeaders: ({ header }) => header.trim().toLowerCase() }))
                    .on('data', row => {
                        // Fuzzy column matching — case-insensitive header aliases
                        const nameKey  = Object.keys(row).find(k => NAME_ALIASES.has(k));
                        const priceKey = Object.keys(row).find(k => PRICE_ALIASES.has(k));

                        if (!nameKey || !priceKey) {
                            skipped++;
                            return; // no recognizable columns on this row
                        }

                        const name = (row[nameKey] || '').trim();
                        // Strictly strip ALL currency symbols, commas, whitespace before cast
                        const priceStr = (row[priceKey] || '').trim();
                        const price    = Number(priceStr.replace(/[^0-9.-]+/g, ''));

                        if (!name || Number.isNaN(price)) {
                            skipped++;
                            return; // blank name or unparseable price
                        }
                        rows.push({ name, price });
                    })
                    .on('end',   resolve)
                    .on('error', reject);
            });
        } finally {
            try { fs.unlinkSync(req.file.path); } catch (_) { /* swallow */ }
        }

        if (rows.length === 0) {
            return res.status(400).json({
                error: 'CSV parsed but no valid rows found. Ensure columns named name/item/description and price/cost/unit_cost exist.',
                skipped,
            });
        }

        // ── Batch-write to per-user price_book subcollection ─────────
        //  Path: users/{userPhone}/price_book/{sanitizedId}
        //  Duplicates overwrite naturally via { merge: true }.
        const CHUNK_SIZE = 499;
        let imported = 0;
        for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
            const chunk = rows.slice(i, i + CHUNK_SIZE);
            const batch = db.batch();
            for (const { name, price } of chunk) {
                const docRef = db
                    .collection('users').doc(userPhone)
                    .collection('price_book').doc(sanitizeItemId(name));
                batch.set(docRef, { name, price }, { merge: true });
            }
            await batch.commit();
            imported += chunk.length;
            console.log(`[upload-csv] [${userPhone}] Chunk ${Math.ceil(i / CHUNK_SIZE) + 1}: ${chunk.length} rows committed (imported so far: ${imported})`);
        }

        console.log(`[upload-csv] Complete — imported: ${imported}, skipped: ${skipped} — by ${userPhone}.`);
        res.json({ success: true, imported, skipped });
    }
);

// ══════════════════════════════════════════════════════════════════════
//  ESTIMATES STORAGE API
// ══════════════════════════════════════════════════════════════════════

// GET /api/estimates — list all estimates sorted by updatedAt desc
app.get('/api/estimates', requireAuth, async (req, res) => {
    const userPhone = req.userPhone;
    try {
        const snap = await db.collection('users').doc(userPhone).collection('estimates').get();
        const list = [];
        snap.forEach(doc => {
            const data = doc.data();
            list.push({
                id: doc.id,
                project_name: data.project_name || 'Untitled Project',
                updatedAt: data.updatedAt ? (data.updatedAt.toDate ? data.updatedAt.toDate() : new Date(data.updatedAt)) : new Date(0),
                total_amount: data.total_amount || 0,
                item_count: data.item_count || 0
            });
        });
        // Sort in memory to guarantee updatedAt descending, even if Firestore index is not ready
        list.sort((a, b) => b.updatedAt - a.updatedAt);
        res.json(list);
    } catch (err) {
        console.error(`[${userPhone}] GET /api/estimates error:`, err.message);
        res.status(500).json({ error: 'Failed to retrieve projects list' });
    }
});

// GET /api/estimates/:id — load details of a specific estimate
app.get('/api/estimates/:id', requireAuth, async (req, res) => {
    const userPhone = req.userPhone;
    const estimateId = req.params.id;
    try {
        const docRef = db.collection('users').doc(userPhone).collection('estimates').doc(estimateId);
        const snap = await docRef.get();
        if (!snap.exists) {
            return res.status(404).json({ error: 'Estimate not found' });
        }
        res.json({ id: snap.id, ...snap.data() });
    } catch (err) {
        console.error(`[${userPhone}] GET /api/estimates/${estimateId} error:`, err.message);
        res.status(500).json({ error: 'Failed to retrieve project details' });
    }
});

// POST/PUT /api/estimates/:id/save — save/update an estimate
const saveEstimateHandler = async (req, res) => {
    const userPhone = req.userPhone;
    const estimateId = req.params.id;
    const { project_name, items = [], total_amount, item_count, client_name, client_address, scope_of_work } = req.body;

    try {
        const docRef = db.collection('users').doc(userPhone).collection('estimates').doc(estimateId);
        const updateObj = {
            project_name: project_name || 'Untitled Project',
            items,
            total_amount: Number(total_amount) || 0,
            item_count: Number(item_count) || 0,
            updatedAt: FieldValue.serverTimestamp()
        };
        if (client_name !== undefined) {
            updateObj.client_name = client_name;
        }
        if (client_address !== undefined) {
            updateObj.client_address = client_address;
        }
        if (scope_of_work !== undefined) {
            updateObj.scope_of_work = scope_of_work;
        }
        await docRef.set(updateObj, { merge: true });

        // Self-teaching loop: learn edited material prices
        const materials = items.filter(i => i && i.name && i.unit_price != null && (i.type === 'material' || !i.role));
        if (materials.length > 0) {
            console.log(`[price_book] [${userPhone}] Learning ${materials.length} approved price(s) from save...`);
            await Promise.all(
                materials.map(m =>
                    db.collection('users').doc(userPhone)
                      .collection('price_book').doc(sanitizeItemId(m.name))
                      .set({ name: m.name, price: Number(m.unit_price) }, { merge: true })
                      .catch(err => console.warn(`[price_book] Write failed for "${m.name}":`, err.message))
                )
            );
        }

        res.json({ success: true });
    } catch (err) {
        console.error(`[${userPhone}] Save estimate ${estimateId} error:`, err.message);
        res.status(500).json({ error: 'Failed to save project' });
    }
};

app.post('/api/estimates/:id/save', requireAuth, saveEstimateHandler);
app.put('/api/estimates/:id/save', requireAuth, saveEstimateHandler);

// DELETE /api/estimates/:id — delete an estimate (verifies ownership by scoping to users/{phone})
app.delete('/api/estimates/:id', requireAuth, async (req, res) => {
    const userPhone = req.userPhone;
    const estimateId = req.params.id;
    try {
        const docRef = db.collection('users').doc(userPhone).collection('estimates').doc(estimateId);
        const snap = await docRef.get();
        if (!snap.exists) {
            return res.status(404).json({ error: 'Estimate not found or unauthorized' });
        }
        await docRef.delete();
        res.json({ success: true });
    } catch (err) {
        console.error(`[${userPhone}] DELETE /api/estimates/${estimateId} error:`, err.message);
        res.status(500).json({ error: 'Failed to delete project' });
    }
});

// ══════════════════════════════════════════════════════════════════════
//  SETTINGS & PROFILE ENDPOINTS
// ══════════════════════════════════════════════════════════════════════

// GET /api/settings — Load user business profile settings
app.get('/api/settings', requireAuth, async (req, res) => {
    const userPhone = req.userPhone;
    try {
        const configRef = db.collection('users').doc(userPhone).collection('settings').doc('config');
        const snap = await configRef.get();
        const defaultSettings = {
            company_name: '',
            company_address: '',
            company_logo_url: '',
            license_number: '',
            contact_email: '',
            default_labor_rate: 55,
            global_markup_percent: 0,
            tax_rate: 5.5,
            estimateCount: 0,
            isOnboarded: false,
            active_subscription: false,
            subscription_status: 'unsubscribed'
        };
        if (!snap.exists) {
            await configRef.set(defaultSettings);
            return res.json(defaultSettings);
        }
        const data = snap.data();
        res.json({
            company_name: data.company_name !== undefined ? data.company_name : defaultSettings.company_name,
            company_address: data.company_address !== undefined ? data.company_address : defaultSettings.company_address,
            company_logo_url: data.company_logo_url !== undefined ? data.company_logo_url : defaultSettings.company_logo_url,
            license_number: data.license_number !== undefined ? data.license_number : defaultSettings.license_number,
            contact_email: data.contact_email !== undefined ? data.contact_email : defaultSettings.contact_email,
            default_labor_rate: data.default_labor_rate !== undefined ? Number(data.default_labor_rate) : defaultSettings.default_labor_rate,
            global_markup_percent: data.global_markup_percent !== undefined ? Number(data.global_markup_percent) : defaultSettings.global_markup_percent,
            tax_rate: data.tax_rate !== undefined ? Number(data.tax_rate) : defaultSettings.tax_rate,
            isOnboarded: data.isOnboarded !== undefined ? Boolean(data.isOnboarded) : defaultSettings.isOnboarded,
            active_subscription: data.active_subscription !== undefined ? Boolean(data.active_subscription) : defaultSettings.active_subscription,
            subscription_status: data.subscription_status !== undefined ? String(data.subscription_status) : defaultSettings.subscription_status
        });
    } catch (err) {
        console.error(`[${userPhone}] GET /api/settings error:`, err.message);
        res.status(500).json({ error: 'Failed to retrieve settings' });
    }
});

// POST /api/settings — Save/update user business profile settings
app.post('/api/settings', requireAuth, async (req, res) => {
    const userPhone = req.userPhone;
    const {
        company_name,
        company_address,
        company_logo_url,
        license_number,
        contact_email,
        default_labor_rate,
        global_markup_percent,
        tax_rate,
        isOnboarded
    } = req.body;

    try {
        const updateObj = {};
        if (company_name !== undefined) updateObj.company_name = String(company_name);
        if (company_address !== undefined) updateObj.company_address = String(company_address);
        if (company_logo_url !== undefined) updateObj.company_logo_url = String(company_logo_url);
        if (license_number !== undefined) updateObj.license_number = String(license_number);
        if (contact_email !== undefined) updateObj.contact_email = String(contact_email);
        if (isOnboarded !== undefined) updateObj.isOnboarded = Boolean(isOnboarded);

        if (default_labor_rate !== undefined) {
            const val = parseFloat(default_labor_rate);
            if (!Number.isFinite(val) || val < 0) {
                return res.status(400).json({ error: 'Default labor rate must be a positive finite number' });
            }
            updateObj.default_labor_rate = val;
        }

        if (global_markup_percent !== undefined) {
            const val = parseFloat(global_markup_percent);
            if (!Number.isFinite(val) || val < 0) {
                return res.status(400).json({ error: 'Global markup percent must be a positive finite number' });
            }
            updateObj.global_markup_percent = val;
        }

        if (tax_rate !== undefined) {
            const val = parseFloat(tax_rate);
            if (!Number.isFinite(val) || val < 0) {
                return res.status(400).json({ error: 'Tax rate must be a positive finite number' });
            }
            updateObj.tax_rate = val;
        }

        const configRef = db.collection('users').doc(userPhone).collection('settings').doc('config');
        await configRef.set(updateObj, { merge: true });
        res.json({ success: true });
    } catch (err) {
        console.error(`[${userPhone}] POST /api/settings error:`, err.message);
        res.status(500).json({ error: 'Failed to save settings' });
    }
});

// Configure multer memory storage for settings logo upload
const multerMemory = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 2 * 1024 * 1024 } // 2MB limit
});

// POST /api/settings/logo — Upload business profile logo
app.post('/api/settings/logo', multerMemory.single('logo'), requireAuth, async (req, res) => {
    const userPhone = req.userPhone;
    if (!req.file) {
        return res.status(400).json({ error: 'No file provided' });
    }
    try {
        let logoUrl = '';
        if (process.env.GCS_BUCKET_NAME) {
            try {
                const { Storage } = require('@google-cloud/storage');
                const storage = new Storage();
                const bucket = storage.bucket(process.env.GCS_BUCKET_NAME);
                const file = bucket.file(`users/${userPhone}/logo_${Date.now()}_${req.file.originalname}`);
                await file.save(req.file.buffer, {
                    metadata: { contentType: req.file.mimetype }
                });
                logoUrl = `https://storage.googleapis.com/${process.env.GCS_BUCKET_NAME}/${file.name}`;
            } catch (gcsErr) {
                console.warn(`GCS upload failed, falling back to base64:`, gcsErr.message);
            }
        }

        if (!logoUrl) {
            const base64Str = req.file.buffer.toString('base64');
            logoUrl = `data:${req.file.mimetype};base64,${base64Str}`;
        }

        const configRef = db.collection('users').doc(userPhone).collection('settings').doc('config');
        await configRef.set({ company_logo_url: logoUrl }, { merge: true });

        res.json({ success: true, company_logo_url: logoUrl });
    } catch (err) {
        console.error(`[${userPhone}] POST /api/settings/logo error:`, err.message);
        res.status(500).json({ error: 'Failed to upload logo' });
    }
});

// ══════════════════════════════════════════════════════════════════════
//  ENDPOINT: POST /api/billing/create-checkout-session
//  Creates a Stripe Checkout Session for subscription, pre-filling the email.
// ══════════════════════════════════════════════════════════════════════
app.post('/api/billing/create-checkout-session', requireAuth, async (req, res) => {
    try {
        const userPhone = req.userPhone;
        // Fetch Settings doc for pre-filling email
        const configSnap = await db.collection('users').doc(userPhone).collection('settings').doc('config').get();
        let contactEmail = '';

        if (configSnap.exists) {
            const data = configSnap.data();
            if (data.contact_email && data.contact_email.trim()) {
                contactEmail = data.contact_email.trim();
            }
        }

        if (!contactEmail && req.authedUser && req.authedUser.email) {
            contactEmail = req.authedUser.email.trim();
        }

        const sessionConfig = {
            mode: 'subscription',
            payment_method_types: ['card'],
            line_items: [{ price: process.env.STRIPE_PRICE_ID, quantity: 1 }],
            success_url: `${process.env.APP_URL || 'http://localhost:8080'}/dashboard?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${process.env.APP_URL || 'http://localhost:8080'}/dashboard`,
            client_reference_id: userPhone,
            subscription_data: {
                metadata: {
                    userPhone: userPhone
                }
            }
        };

        if (contactEmail) {
            sessionConfig.customer_email = contactEmail;
        }

        const session = await stripe.checkout.sessions.create(sessionConfig);
        res.json({ url: session.url });
    } catch (err) {
        console.error('Checkout session creation failed:', err.message);
        res.status(500).json({ error: 'checkout_failed', message: err.message });
    }
});

// ══════════════════════════════════════════════════════════════════════
//  ENDPOINT: GET /api/me
//  Returns the authenticated user's normalized E.164 phone number.
//  Used by the frontend header badge to confirm the active session.
// ══════════════════════════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════════════
//  MIDDLEWARE: requireGoogleAuth
// ══════════════════════════════════════════════════════════════════════
async function requireGoogleAuth(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Missing or invalid Authorization header.' });
    }
    
    const token = authHeader.split('Bearer ')[1];
    try {
        const ticket = await authClient.verifyIdToken({
            idToken: token,
            audience: process.env.GOOGLE_OAUTH_CLIENT_ID
        });
        req.googlePayload = ticket.getPayload();
        req.googleEmail = req.googlePayload.email;
        if (!req.googleEmail) {
            return res.status(400).json({ error: 'No email found in Google token.' });
        }
        next();
    } catch (err) {
        return res.status(401).json({ error: 'Invalid Google ID Token.' });
    }
}

const otpPhoneLimits = new Map();
const otpIpLimits = new Map();

function checkOtpRateLimit(phone, ip) {
    const now = Date.now();
    const windowMs = 3600000; // 1 hour

    // Background cleanup
    if (Math.random() < 0.05) {
        for (const [k, v] of otpPhoneLimits) { if (now - v.firstAttempt > windowMs) otpPhoneLimits.delete(k); }
        for (const [k, v] of otpIpLimits) { if (now - v.firstAttempt > windowMs) otpIpLimits.delete(k); }
    }

    // Phone limit (max 3 per hour)
    let phoneEntry = otpPhoneLimits.get(phone);
    if (!phoneEntry || now - phoneEntry.firstAttempt > windowMs) {
        phoneEntry = { count: 0, firstAttempt: now };
    }
    if (phoneEntry.count >= 3) return { allowed: false, reason: 'Too many OTP requests for this phone number. Please try again later.' };

    // IP limit (max 5 per hour)
    let ipEntry = otpIpLimits.get(ip);
    if (!ipEntry || now - ipEntry.firstAttempt > windowMs) {
        ipEntry = { count: 0, firstAttempt: now };
    }
    if (ipEntry.count >= 5) return { allowed: false, reason: 'Too many OTP requests from this IP address. Please try again later.' };

    phoneEntry.count++;
    otpPhoneLimits.set(phone, phoneEntry);
    
    ipEntry.count++;
    otpIpLimits.set(ip, ipEntry);

    return { allowed: true };
}

// ══════════════════════════════════════════════════════════════════════
//  ENDPOINT: POST /api/auth/register
//  Handles self-registration for new users via Google OAuth token.
// ══════════════════════════════════════════════════════════════════════

app.post('/api/auth/register', requireGoogleAuth, async (req, res) => {
    const extractedEmail = req.googleEmail;

    const { phone, company_name } = req.body;
    if (!phone || !company_name) {
        return res.status(400).json({ error: 'Phone and company_name are required.' });
    }

    const digits = phone.replace(/\D/g, '');
    let formattedPhone = '+' + (digits.length === 10 ? '1' + digits : digits);

    const rateLimitResult = checkOtpRateLimit(formattedPhone, req.ip);
    if (!rateLimitResult.allowed) {
        return res.status(429).json({ error: rateLimitResult.reason });
    }

    try {
        // 1. Resolve phone by email to check for email uniqueness
        const existingPhone = await resolvePhoneByEmail(extractedEmail);
        
        if (existingPhone) {
            const existingUserSnap = await db.collection('users').doc(existingPhone).get();
            if (existingUserSnap.exists) {
                const existingStatus = existingUserSnap.data().status;
                if (existingStatus === 'active') {
                    return res.status(409).json({ error: 'An account already exists for this email.' });
                }
                
                if (existingStatus === 'pending') {
                    if (existingPhone !== formattedPhone) {
                        return res.status(409).json({ error: 'A pending account exists for this email with a different phone number.' });
                    }
                }
            }
        }

        // 2. Check if requested phone number is already taken by DIFFERENT email
        const userRef = db.collection('users').doc(formattedPhone);
        const doc = await userRef.get();
        if (doc.exists) {
            const docEmail = doc.data().email;
            if (docEmail && docEmail.toLowerCase() !== extractedEmail.toLowerCase()) {
                return res.status(409).json({ error: 'Phone number already registered to a different account.' });
            }
        }

        await userRef.set({
            email: extractedEmail,
            createdAt: new Date().toISOString(),
            status: 'pending'
        }, { merge: true });

        const configRef = userRef.collection('settings').doc('config');
        await configRef.set({
            company_name: company_name,
            contact_email: extractedEmail
        }, { merge: true });

        const otp = crypto.randomInt(100000, 1000000).toString();
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
        await db.collection('registrations').doc(formattedPhone).set({
            otp,
            expiresAt
        });

        try {
            await twilioClient.messages.create({
                body: `Your Lone Ranger Estimator verification code is: ${otp}. Reply STOP to opt out. Msg&Data rates may apply.`,
                [process.env.TWILIO_MESSAGING_SERVICE_SID ? 'messagingServiceSid' : 'from']: process.env.TWILIO_MESSAGING_SERVICE_SID || process.env.TWILIO_PHONE_NUMBER,
                to: formattedPhone,
            });
        } catch (twilioErr) {
            console.warn('[DEV MODE] Twilio blocked SMS. OTP for ' + formattedPhone + ' is: ' + otp);
        }

        return res.status(202).json({ success: true, message: 'OTP sent' });
    } catch (err) {
        console.error('Registration Error:', err);
        return res.status(500).json({ error: 'Internal server error during registration.' });
    }
});

app.post('/api/auth/verify-otp', requireGoogleAuth, async (req, res) => {
    const { phone, otp } = req.body;
    if (!phone || !otp) {
        return res.status(400).json({ error: 'Phone and OTP are required' });
    }

    const digits = phone.replace(/\D/g, '');
    let formattedPhone = '+' + (digits.length === 10 ? '1' + digits : digits);

    try {
        const regRef = db.collection('registrations').doc(formattedPhone);
        const regDoc = await regRef.get();

        if (!regDoc.exists) {
            return res.status(400).json({ error: 'Invalid or expired verification code' });
        }

        const data = regDoc.data();
        if (data.otp !== otp || new Date() > new Date(data.expiresAt)) {
            return res.status(400).json({ error: 'Invalid or expired verification code' });
        }

        const userRef = db.collection('users').doc(formattedPhone);
        const userDoc = await userRef.get();
        if (!userDoc.exists) {
            return res.status(400).json({ error: 'User not found.' });
        }
        
        const userData = userDoc.data();
        if (userData.status !== 'pending') {
            return res.status(400).json({ error: 'User is not pending verification.' });
        }
        
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

app.get('/api/me', requireAuth, (req, res) => {
    res.json({ phone: req.userPhone });
});

// ── Start ─────────────────────────────────────────────────────────────

// ══════════════════════════════════════════════════════════════════════
//  CHANGE ORDER ENGINE
//
//  CHANGE_ORDER_PROMPT  — specialized Gemini system instruction that
//    extracts only the *delta* items: added materials, added labor,
//    and explicit exclusions.  Never re-lists base-estimate items.
// ══════════════════════════════════════════════════════════════════════

const CHANGE_ORDER_PROMPT =
    `You are an expert residential construction estimator based in central Wisconsin. ` +
    `A contractor is dictating a mid-project change to an existing contract. ` +
    `Extract ONLY the NEW items being added. Do NOT re-list any items from the original estimate. ` +
    `Focus strictly on what is being ADDED or CHANGED.\n\n` +
    `ADDED MATERIALS: Extract every new material item with quantity, unit, trade, and a conservative ` +
    `retail unit cost estimate (Home Depot / Menards shelf price for central Wisconsin). ` +
    `Use descriptive industry-standard material names (e.g. "3/4 inch ACX Plywood", "Type S Mortar Mix").\n\n` +
    `ADDED LABOR: Extract any additional labor roles and hours explicitly mentioned.\n\n` +
    `EXCLUSIONS: List any items or work the contractor explicitly states are NOT included (e.g. "does not include painting").\n\n` +
    `TRADE FIELD: Each material MUST have a "trade" set to one of: ` +
    `concrete, flooring, roofing, tile, drywall, deck, fence, paint, kitchen-remodel, bathroom-remodel, ` +
    `siding, insulation, gravel, mulch, electrical, plumbing, labor-general, hvac, windows, doors, ` +
    `countertops, cabinetry, gutters, demolition, landscaping, foundation, garage, masonry, stucco, ` +
    `driveways, waterproofing, framing, excavation\n\n` +
    `Output ONLY valid JSON, no markdown:\n` +
    `{ "change_summary": "One sentence describing the overall change", ` +
    `"added_materials": [{ "name": "descriptive name", "quantity": 0, "unit": "", "trade": "enum", "estimated_unit_cost": 0.00 }], ` +
    `"added_labor": [{ "role": "", "hours": 0, "rate": 0 }], ` +
    `"exclusions": ["string"] }`;

// ══════════════════════════════════════════════════════════════════════
//  HELPER: Build Change Order PDF HTML (isolated, standalone template)
// ══════════════════════════════════════════════════════════════════════

function buildChangeOrderHtml({ co, parentEstimateId, companyName, companyAddress, contactEmail, licenseNumber, logoHtml, formattedDate }) {
    const materialsSubtotal = (co.added_materials || []).reduce((s, m) => s + (m.total || 0), 0);
    const laborSubtotal = (co.added_labor || []).reduce((s, l) => s + (l.total || 0), 0);
    const wiSalesTax = Math.round(materialsSubtotal * 0.055 * 100) / 100;
    const changeTotal = Math.round((materialsSubtotal + laborSubtotal + wiSalesTax) * 100) / 100;

    const materialRows = (co.added_materials || []).length > 0
        ? (co.added_materials || []).map(m => `
            <tr>
                <td style="padding:8px 10px;border-bottom:1px solid #e9d5ff;font-size:9.5pt;">${escapeHtml(m.name)}</td>
                <td style="padding:8px 10px;border-bottom:1px solid #e9d5ff;font-size:9.5pt;text-align:right;">${m.quantity || 0}</td>
                <td style="padding:8px 10px;border-bottom:1px solid #e9d5ff;font-size:9.5pt;">${escapeHtml(m.unit || 'ea')}</td>
                <td style="padding:8px 10px;border-bottom:1px solid #e9d5ff;font-size:9.5pt;text-align:right;">$${Number(m.unit_price || m.estimated_unit_cost || 0).toFixed(2)}</td>
                <td style="padding:8px 10px;border-bottom:1px solid #e9d5ff;font-size:9.5pt;text-align:right;">$${Number(m.total || 0).toFixed(2)}</td>
            </tr>`).join('')
        : `<tr><td colspan="5" style="padding:12px;text-align:center;color:#6b7280;font-style:italic;font-size:9.5pt;">No additional materials</td></tr>`;

    const laborRows = (co.added_labor || []).length > 0
        ? (co.added_labor || []).map(l => `
            <tr>
                <td style="padding:8px 10px;border-bottom:1px solid #e9d5ff;font-size:9.5pt;">${escapeHtml(l.role || '')}</td>
                <td style="padding:8px 10px;border-bottom:1px solid #e9d5ff;font-size:9.5pt;text-align:right;">${l.hours || 0}</td>
                <td style="padding:8px 10px;border-bottom:1px solid #e9d5ff;font-size:9.5pt;">hr</td>
                <td style="padding:8px 10px;border-bottom:1px solid #e9d5ff;font-size:9.5pt;text-align:right;">$${Number(l.rate || 0).toFixed(2)}</td>
                <td style="padding:8px 10px;border-bottom:1px solid #e9d5ff;font-size:9.5pt;text-align:right;">$${Number(l.total || 0).toFixed(2)}</td>
            </tr>`).join('')
        : `<tr><td colspan="5" style="padding:12px;text-align:center;color:#6b7280;font-style:italic;font-size:9.5pt;">No additional labor</td></tr>`;

    const exclusionRows = (co.exclusions || []).length > 0
        ? `<ul style="margin:0;padding-left:18px;">${(co.exclusions || []).map(e => `<li style="font-size:9.5pt;color:#b91c1c;margin:3px 0;">${escapeHtml(e)}</li>`).join('')}</ul>`
        : `<p style="font-size:9.5pt;color:#6b7280;font-style:italic;margin:0;">None specified</p>`;

    return `<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Change Order — ${escapeHtml(parentEstimateId)}</title>
    <style>
        body { font-family: 'Inter', system-ui, -apple-system, sans-serif; background:#fff; color:#210936; margin:0; padding:30px; font-size:10.5pt; line-height:1.4; }
        .co-banner { background: linear-gradient(135deg,#7c3aed,#521880); color:#fff; padding:16px 20px; border-radius:10px; margin-bottom:22px; display:flex; justify-content:space-between; align-items:center; }
        .co-banner h1 { margin:0; font-size:18pt; font-weight:900; letter-spacing:-0.5px; }
        .co-banner .ref { font-size:9pt; opacity:0.8; margin-top:4px; }
        .co-amount-badge { background:#fff; color:#521880; font-size:15pt; font-weight:900; padding:8px 18px; border-radius:8px; white-space:nowrap; }
        .header { display:flex; justify-content:space-between; align-items:center; border-bottom:3px solid #521880; padding-bottom:15px; margin-bottom:20px; }
        .company-name { font-size:14pt; font-weight:800; color:#210936; }
        .section-title { font-size:10.5pt; font-weight:700; text-transform:uppercase; color:#210936; margin:18px 0 8px 0; padding-bottom:4px; border-bottom:2px solid #521880; }
        table { width:100%; border-collapse:collapse; margin-bottom:15px; }
        th { background:#210936; color:#fff; font-size:8.5pt; font-weight:600; text-transform:uppercase; padding:6px 10px; text-align:left; }
        .totals-table { width:45%; margin-left:auto; margin-top:10px; margin-bottom:25px; }
        .totals-table td { padding:5px 10px; font-size:9.5pt; border-bottom:1px solid #e9d5ff; }
        .totals-table tr.grand { background:#521880; color:#fff; font-weight:700; }
        .totals-table tr.grand td { border-bottom:none; color:#e9d5ff; font-size:11pt; }
        .info-box { border:1px solid #e9d5ff; border-radius:8px; padding:12px 15px; background:#faf7fd; margin-bottom:16px; }
        .info-title { font-size:8.5pt; font-weight:700; text-transform:uppercase; color:#521880; margin:0 0 6px 0; border-bottom:1px solid #e9d5ff; padding-bottom:3px; }
        .terms-box { font-size:8.5pt; color:#6b7280; border-top:1px solid #e9d5ff; padding-top:12px; margin-top:30px; }
        .sig-section { margin-top:35px; display:flex; gap:40px; }
        .sig-line { border-top:1px solid #1a0729; margin-top:40px; padding-top:5px; font-size:8.5pt; text-align:center; color:#521880; font-weight:600; }
    </style>
</head>
<body>
    <div class="header">
        <div style="display:flex;align-items:center;gap:15px;">
            ${logoHtml}
            <div class="company-name">${escapeHtml(companyName)}</div>
        </div>
        <div style="text-align:right;">
            <div style="font-size:9pt;color:#9b59d0;margin:2px 0;"><strong>Date:</strong> ${formattedDate}</div>
            ${licenseNumber ? `<div style="font-size:9pt;color:#9b59d0;margin:2px 0;"><strong>License:</strong> ${escapeHtml(licenseNumber)}</div>` : ''}
        </div>
    </div>

    <div class="co-banner">
        <div>
            <h1>CHANGE ORDER ADDENDUM</h1>
            <div class="ref">Reference Estimate ID: ${escapeHtml(parentEstimateId)}</div>
            <div class="ref" style="margin-top:4px;font-size:8.5pt;opacity:0.7;">${escapeHtml(co.change_summary || '')}</div>
        </div>
        <div class="co-amount-badge">Additional: $${changeTotal.toFixed(2)}</div>
    </div>

    <div class="info-box">
        <div class="info-title">Prepared By</div>
        <p style="font-size:9.5pt;margin:3px 0;"><strong>${escapeHtml(companyName)}</strong></p>
        ${companyAddress ? `<p style="font-size:9.5pt;margin:3px 0;">${escapeHtml(companyAddress)}</p>` : ''}
        <p style="font-size:9.5pt;margin:3px 0;">Email: ${escapeHtml(contactEmail || '')}</p>
    </div>

    <h2 class="section-title">Additional Materials</h2>
    <table>
        <thead><tr><th>Description</th><th style="text-align:right;width:60px;">Qty</th><th style="width:60px;">Unit</th><th style="text-align:right;width:100px;">Unit Price</th><th style="text-align:right;width:110px;">Total</th></tr></thead>
        <tbody>${materialRows}</tbody>
    </table>

    <h2 class="section-title">Additional Labor</h2>
    <table>
        <thead><tr><th>Role / Task</th><th style="text-align:right;width:60px;">Hours</th><th style="width:60px;">Unit</th><th style="text-align:right;width:100px;">Rate/Hr</th><th style="text-align:right;width:110px;">Total</th></tr></thead>
        <tbody>${laborRows}</tbody>
    </table>

    <table class="totals-table">
        <tbody>
            <tr><td>Materials Subtotal</td><td style="text-align:right;">$${materialsSubtotal.toFixed(2)}</td></tr>
            <tr><td>Labor Subtotal</td><td style="text-align:right;">$${laborSubtotal.toFixed(2)}</td></tr>
            <tr><td>WI Sales Tax (5.5% on Materials)</td><td style="text-align:right;">$${wiSalesTax.toFixed(2)}</td></tr>
            <tr class="grand"><td><strong>Additional Total</strong></td><td style="text-align:right;"><strong>$${changeTotal.toFixed(2)}</strong></td></tr>
        </tbody>
    </table>

    <h2 class="section-title">Exclusions</h2>
    <div style="margin-bottom:20px;">${exclusionRows}</div>

    <div class="terms-box">
        <strong>Change Order Terms:</strong> This addendum modifies the original contract. Work described herein will not commence until this change order is signed by both parties or approved digitally.
        <br><strong>Payment:</strong> Additional amount due upon completion of change order scope of work.
    </div>

    <div class="sig-section">
        <div style="flex:1;"><div class="sig-line">Contractor Signature &amp; Date</div></div>
        <div style="flex:1;"><div class="sig-line">Client Acceptance Signature &amp; Date</div></div>
    </div>

    <div style="margin-top:35px;border-top:1px solid #e9d5ff;padding-top:10px;font-size:8pt;color:#9b59d0;display:flex;justify-content:space-between;">
        <span>&copy; ${new Date().getFullYear()} ${escapeHtml(companyName)}</span>
        <span>Change Order — Ref: ${escapeHtml(parentEstimateId)}</span>
    </div>
</body>
</html>`;
}

// ══════════════════════════════════════════════════════════════════════
//  ENDPOINT: POST /api/change-orders/generate
//  Requires: requireAuth, requireSubscription
//  Body: { parentEstimateId, text }
//  Saves to: users/{phone}/estimates/{parentEstimateId}/change_orders/{coId}
// ══════════════════════════════════════════════════════════════════════

app.post('/api/change-orders/generate', requireAuth, requireSubscription, async (req, res) => {
    const userPhone = req.userPhone;
    const { parentEstimateId, text } = req.body;

    if (!parentEstimateId || !text || !text.trim()) {
        return res.status(400).json({ error: 'parentEstimateId and text are required.' });
    }

    try {
        // ── 1. Verify parent estimate exists ──────────────────────────
        const parentRef = db.collection('users').doc(userPhone).collection('estimates').doc(parentEstimateId);
        const parentSnap = await parentRef.get();
        if (!parentSnap.exists) {
            return res.status(404).json({ error: 'Parent estimate not found.' });
        }

        // ── 2. Gemini extraction with Change Order prompt ─────────────
        console.log(`[${userPhone}] change-orders/generate: extracting change items...`);
        const geminiResp = await ai.models.generateContent({
            model: 'gemini-3.5-flash',
            contents: { role: 'user', parts: [{ text: text + '\n\n' + CHANGE_ORDER_PROMPT }] },
        });
        const extracted = parseGeminiJSON(geminiResp.text);

        // ── 3. Price added materials (price_book then AI fallback) ─────
        const user = req.authedUser;
        const pricedMaterials = await Promise.all(
            (extracted.added_materials || []).map(async (m) => {
                const priced = await assignUnitPrice(m, user.zipCode, userPhone);
                priced.total = Math.round((priced.unit_price || 0) * (m.quantity || 0) * 100) / 100;
                priced.type = 'material';
                return priced;
            })
        );

        // ── 4. Price added labor ───────────────────────────────────────
        const configSnap = await db.collection('users').doc(userPhone).collection('settings').doc('config').get();
        const defaultLaborRate = configSnap.exists ? (configSnap.data().default_labor_rate || 55) : 55;
        const pricedLabor = (extracted.added_labor || []).map(l => {
            const rate = Number(l.rate) > 0 ? Number(l.rate) : defaultLaborRate;
            const total = Math.round(rate * (l.hours || 0) * 100) / 100;
            return { ...l, rate, total, type: 'labor' };
        });

        // ── 5. Calculate change order total (materials + labor + 5.5% WI tax on materials) ──
        const matsSubtotal = pricedMaterials.reduce((s, m) => s + (m.total || 0), 0);
        const laborSubtotal = pricedLabor.reduce((s, l) => s + (l.total || 0), 0);
        const wiSalesTax = Math.round(matsSubtotal * 0.055 * 100) / 100;
        const changeOrderTotal = Math.round((matsSubtotal + laborSubtotal + wiSalesTax) * 100) / 100;

        // ── 6. Cryptographic approval token ───────────────────────────
        const approvalToken = crypto.randomBytes(16).toString('hex');

        // ── 7. Assemble change order document ─────────────────────────
        const changeOrderId = `CO-${crypto.randomBytes(8).toString('hex')}`;
        const coDoc = {
            id: changeOrderId,
            parentEstimateId,
            change_summary: extracted.change_summary || '',
            added_materials: pricedMaterials,
            added_labor: pricedLabor,
            exclusions: extracted.exclusions || [],
            materials_subtotal: Math.round(matsSubtotal * 100) / 100,
            labor_subtotal: Math.round(laborSubtotal * 100) / 100,
            wi_sales_tax: wiSalesTax,
            change_order_total: changeOrderTotal,
            approval_token: approvalToken,
            status: 'pending',
            createdAt: FieldValue.serverTimestamp(),
        };

        // ── 8. Persist to Firestore subcollection ─────────────────────
        const coRef = db.collection('users').doc(userPhone)
            .collection('estimates').doc(parentEstimateId)
            .collection('change_orders').doc(changeOrderId);
        await coRef.set(coDoc, { merge: true });

        // ── 9. Generate PDF via Puppeteer ─────────────────────────────
        const profile = configSnap.exists ? configSnap.data() : {};
        const companyName = profile.company_name || user.companyName || 'Lone Ranger Contracting';
        let logoHtml = '';
        if (profile.company_logo_url && (profile.company_logo_url.startsWith('https://') || profile.company_logo_url.startsWith('data:image/'))) {
            logoHtml = `<img src="${escapeHtml(profile.company_logo_url)}" style="max-height:50px;max-width:150px;object-fit:contain;" />`;
        } else {
            const initials = companyName.substring(0, 2).toUpperCase();
            logoHtml = `<div style="width:50px;height:50px;border-radius:50%;background:#521880;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:14pt;">${initials}</div>`;
        }
        const formattedDate = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

        const htmlContent = buildChangeOrderHtml({
            co: { ...coDoc },
            parentEstimateId,
            companyName,
            companyAddress: profile.company_address || '',
            contactEmail: profile.contact_email || user.email || '',
            licenseNumber: profile.license_number || '',
            logoHtml,
            formattedDate,
        });

        const pdfFilename = `ChangeOrder_${changeOrderId}_${Date.now()}.pdf`;
        const pdfPath = path.join('/tmp', pdfFilename);
        let browser;
        try {
            browser = await puppeteer.launch({
                headless: true,
                executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium',
                args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
            });
            const page = await browser.newPage();
            await page.setContent(htmlContent, { waitUntil: 'networkidle0' });
            const pdfBuffer = await page.pdf({ format: 'Letter', printBackground: true, margin: { top: '0.4in', bottom: '0.4in', left: '0.4in', right: '0.4in' } });
            fs.writeFileSync(pdfPath, pdfBuffer);
            await browser.close();
            browser = null;

            // Store PDF as base64 in Firestore for retrieval on approval page
            const pdfBase64 = pdfBuffer.toString('base64');
            await coRef.set({ pdf_base64: pdfBase64 }, { merge: true });
            console.log(`[${userPhone}] Change order PDF generated: ${changeOrderId}`);
        } finally {
            if (browser) { try { await browser.close(); } catch (_) {} }
            if (pdfPath && fs.existsSync(pdfPath)) { try { fs.unlinkSync(pdfPath); } catch (_) {} }
        }

        res.json({
            success: true,
            changeOrderId,
            parentEstimateId,
            change_order_total: changeOrderTotal,
            change_summary: coDoc.change_summary,
            added_materials: pricedMaterials,
            added_labor: pricedLabor,
            exclusions: coDoc.exclusions,
            status: 'pending',
        });

    } catch (err) {
        console.error(`[${userPhone}] change-orders/generate error:`, err.message);
        res.status(500).json({ error: err.message || 'Failed to generate change order.' });
    }
});

// ══════════════════════════════════════════════════════════════════════
//  ENDPOINT: POST /api/change-orders/send
//  Requires: requireAuth
//  Body: { changeOrderId, parentEstimateId, clientPhone }
//  Dispatches Twilio SMS and persists client_phone to parent estimate.
// ══════════════════════════════════════════════════════════════════════

app.post('/api/change-orders/send', requireAuth, requireSubscription, async (req, res) => {
    const userPhone = req.userPhone;
    const { changeOrderId, parentEstimateId, clientPhone } = req.body;

    if (!changeOrderId || !parentEstimateId || !clientPhone) {
        return res.status(400).json({ error: 'changeOrderId, parentEstimateId, and clientPhone are required.' });
    }

    try {
        // ── 1. Fetch change order to get approval token ───────────────
        const coRef = db.collection('users').doc(userPhone)
            .collection('estimates').doc(parentEstimateId)
            .collection('change_orders').doc(changeOrderId);
        const coSnap = await coRef.get();
        if (!coSnap.exists) {
            return res.status(404).json({ error: 'Change order not found.' });
        }
        const co = coSnap.data();

        // ── 2. Persist client_phone on parent estimate ─────────────────
        const parentRef = db.collection('users').doc(userPhone).collection('estimates').doc(parentEstimateId);
        await parentRef.set({ client_phone: clientPhone }, { merge: true });

        // ── 3. Build approval URL ──────────────────────────────────────
        const appUrl = process.env.APP_URL || 'http://localhost:8080';
        await db.collection('approvals').doc(changeOrderId).set({
            userPhone,
            parentEstimateId,
            changeOrderId
        });
        const approvalUrl = `${appUrl}/approve?t=${co.approval_token}&r=${encodeURIComponent(changeOrderId)}`;

        // ── 4. Send Twilio SMS ─────────────────────────────────────────
        const totalFormatted = `$${Number(co.change_order_total || 0).toFixed(2)}`;
        const messageBody = `Lone Ranger Estimator: A Change Order for your project has been issued (Additional: ${totalFormatted}). Review and approve here: ${approvalUrl}`;

        const smsResult = await twilioClient.messages.create({
            body: messageBody + " Reply STOP to opt out.",
            [process.env.TWILIO_MESSAGING_SERVICE_SID ? 'messagingServiceSid' : 'from']: process.env.TWILIO_MESSAGING_SERVICE_SID || process.env.TWILIO_PHONE_NUMBER,
            to: clientPhone,
        });

        // ── 5. Mark as sent in Firestore ──────────────────────────────
        await coRef.set({ sent_at: new Date().toISOString(), sent_to: clientPhone, twilio_sid: smsResult.sid }, { merge: true });

        console.log(`[${userPhone}] Change order ${changeOrderId} SMS sent to ${clientPhone}. SID: ${smsResult.sid}`);
        res.json({ success: true, sid: smsResult.sid, sent_to: clientPhone });

    } catch (err) {
        console.error(`[${userPhone}] change-orders/send error:`, err.message);
        res.status(500).json({ error: err.message || 'Failed to send change order SMS.' });
    }
});

// ══════════════════════════════════════════════════════════════════════
//  ENDPOINT: GET /approve  (PUBLIC — unauthenticated token-gated)
//  Query params: p (userPhone), e (parentEstimateId), c (changeOrderId), t (token)
//  Serves mobile-optimized approval page. POST writes approved status.
// ══════════════════════════════════════════════════════════════════════

app.get('/approve', async (req, res) => {
    const { r: lookupId, t: token } = req.query;

    if (!lookupId || !token) {
        return res.status(400).send('<h2>Invalid approval link. Missing required parameters.</h2>');
    }

    try {
        const lookupSnap = await db.collection('approvals').doc(lookupId).get();
        if (!lookupSnap.exists) {
            return res.status(400).send('<h2>Invalid or expired approval link.</h2>');
        }
        
        const { userPhone, parentEstimateId, changeOrderId } = lookupSnap.data();

        const coRef = db.collection('users').doc(userPhone)
            .collection('estimates').doc(parentEstimateId)
            .collection('change_orders').doc(changeOrderId);
        const coSnap = await coRef.get();

        if (!coSnap.exists) {
            return res.status(404).send('<h2>Change order not found.</h2>');
        }

        const co = coSnap.data();

        // ── Security Gate: cryptographic token verification ────────────
        if (!co.approval_token || co.approval_token !== token) {
            return res.status(403).send(`<!DOCTYPE html><html><body style="font-family:system-ui;text-align:center;padding:60px;background:#fff0f0;color:#b91c1c;">
                <h2>⛔ Forbidden</h2><p>This approval link is invalid or has expired.</p></body></html>`);
        }

        const isApproved = co.status === 'approved';
        const totalFormatted = `$${Number(co.change_order_total || 0).toFixed(2)}`;
        const pdfDataUrl = co.pdf_base64 ? `data:application/pdf;base64,${co.pdf_base64}` : null;

        const approvalPageHtml = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Change Order Approval — ${escapeHtml(changeOrderId)}</title>
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f5f3ff; color: #210936; min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 20px; }
        .card { background: #fff; border-radius: 20px; padding: 32px 28px; max-width: 480px; width: 100%; box-shadow: 0 20px 60px rgba(82,24,128,0.15); border: 1px solid #e9d5ff; }
        .badge { display: inline-block; background: linear-gradient(135deg,#7c3aed,#521880); color: #fff; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; padding: 4px 12px; border-radius: 20px; margin-bottom: 16px; }
        h1 { font-size: 22px; font-weight: 900; color: #210936; margin-bottom: 6px; }
        .subtitle { font-size: 13px; color: #9b59d0; margin-bottom: 24px; }
        .amount-box { background: linear-gradient(135deg,#521880,#7c3aed); color: #fff; border-radius: 14px; padding: 20px; text-align: center; margin-bottom: 24px; }
        .amount-label { font-size: 11px; text-transform: uppercase; letter-spacing: 1px; opacity: 0.8; margin-bottom: 4px; }
        .amount-value { font-size: 36px; font-weight: 900; }
        .summary-box { background: #faf7fd; border: 1px solid #e9d5ff; border-radius: 12px; padding: 14px 16px; margin-bottom: 20px; font-size: 13px; line-height: 1.6; color: #4b2d7a; }
        .pdf-btn { display: flex; align-items: center; justify-content: center; gap: 8px; width: 100%; padding: 13px; background: #f5f3ff; border: 1.5px solid #7c3aed; color: #521880; border-radius: 12px; font-weight: 700; font-size: 14px; text-decoration: none; margin-bottom: 16px; transition: background 0.2s; }
        .pdf-btn:hover { background: #ede9fe; }
        .approve-btn { width: 100%; padding: 16px; background: linear-gradient(135deg,#065f46,#059669); color: #fff; border: none; border-radius: 14px; font-size: 17px; font-weight: 900; cursor: pointer; transition: opacity 0.2s, transform 0.1s; letter-spacing: -0.3px; }
        .approve-btn:active { transform: scale(0.98); }
        .approve-btn:disabled { opacity: 0.6; cursor: not-allowed; }
        .approved-banner { background: #d1fae5; border: 2px solid #10b981; border-radius: 14px; padding: 20px; text-align: center; }
        .approved-banner h2 { color: #065f46; font-size: 20px; margin-bottom: 4px; }
        .approved-banner p { color: #047857; font-size: 13px; }
        .ref { font-size: 11px; color: #9b59d0; margin-top: 20px; text-align: center; }
        #statusMsg { margin-top: 12px; font-size: 13px; text-align: center; color: #521880; min-height: 20px; }
    </style>
</head>
<body>
<div class="card">
    <div class="badge">Change Order</div>
    <h1>Contract Amendment</h1>
    <p class="subtitle">Ref: ${escapeHtml(changeOrderId)} &mdash; Est. ${escapeHtml(parentEstimateId)}</p>

    <div class="amount-box">
        <div class="amount-label">Additional Amount Due</div>
        <div class="amount-value">${totalFormatted}</div>
    </div>

    ${co.change_summary ? `<div class="summary-box">📋 ${escapeHtml(co.change_summary)}</div>` : ''}

    ${pdfDataUrl ? `<a href="${pdfDataUrl}" download="ChangeOrder_${escapeHtml(changeOrderId)}.pdf" class="pdf-btn">
        <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
        Download Full PDF
    </a>` : ''}

    ${isApproved
        ? `<div class="approved-banner"><h2>✅ Approved</h2><p>This change order was approved on ${co.approvedAt ? new Date(co.approvedAt).toLocaleDateString('en-US', {year:'numeric',month:'long',day:'numeric'}) : 'record'}.</p></div>`
        : `<button class="approve-btn" id="approveBtn" onclick="approveChangeOrder()">✓ Approve Change Order</button>
           <div id="statusMsg"></div>`
    }

    <div class="ref">Lone Ranger Estimator &bull; Secure approval link</div>
</div>

<script>
async function approveChangeOrder() {
    const btn = document.getElementById('approveBtn');
    const msg = document.getElementById('statusMsg');
    btn.disabled = true;
    btn.textContent = 'Processing…';
    msg.textContent = '';
    try {
        const resp = await fetch('/api/change-orders/approve', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ r: ${JSON.stringify(changeOrderId)}, t: ${JSON.stringify(token)} })
        });
        const data = await resp.json();
        if (!resp.ok) throw new Error(data.error || 'Approval failed.');
        btn.textContent = '✅ Approved!';
        btn.style.background = 'linear-gradient(135deg,#065f46,#059669)';
        msg.textContent = 'Your approval has been recorded. The contractor has been notified.';
        msg.style.color = '#059669';
    } catch (err) {
        btn.disabled = false;
        btn.textContent = '✓ Approve Change Order';
        msg.textContent = 'Error: ' + err.message;
        msg.style.color = '#b91c1c';
    }
}
</script>
</body>
</html>`;

        res.send(approvalPageHtml);

    } catch (err) {
        console.error('[/approve] error:', err.message);
        res.status(500).send('<h2>Server error. Please try again.</h2>');
    }
});

// ══════════════════════════════════════════════════════════════════════
//  ENDPOINT: POST /api/change-orders/approve  (PUBLIC — token-gated)
//  Called by the approve page JS. Writes approved status to Firestore.
// ══════════════════════════════════════════════════════════════════════

app.post('/api/change-orders/approve', async (req, res) => {
    const { r: changeOrderId, t: token } = req.body;

    if (!changeOrderId || !token) {
        return res.status(400).json({ error: 'Missing required parameters.' });
    }

    try {
        const lookupSnap = await db.collection('approvals').doc(changeOrderId).get();
        if (!lookupSnap.exists) return res.status(404).json({ error: 'Change order not found.' });
        const { userPhone, parentEstimateId } = lookupSnap.data();

        const coRef = db.collection('users').doc(userPhone)
            .collection('estimates').doc(parentEstimateId)
            .collection('change_orders').doc(changeOrderId);
        const coSnap = await coRef.get();

        if (!coSnap.exists) return res.status(404).json({ error: 'Change order not found.' });
        const co = coSnap.data();

        if (!co.approval_token || co.approval_token !== token) {
            return res.status(403).json({ error: 'Invalid or expired approval token.' });
        }

        if (co.status === 'approved') {
            return res.json({ success: true, already_approved: true });
        }

        await coRef.set({ status: 'approved', approvedAt: new Date().toISOString() }, { merge: true });
        console.log(`[approve] Change order ${changeOrderId} approved by client.`);
        res.json({ success: true });

    } catch (err) {
        console.error('[/api/change-orders/approve] error:', err.message);
        res.status(500).json({ error: 'Failed to record approval.' });
    }
});

// ══════════════════════════════════════════════════════════════════════
//  SUPERVISOR/BUILDER ARCHITECTURE — Phase 1
//
//  This is the AI Supervisor layer. It ingests raw voice transcripts and
//  emits deterministic JSON command packets that the Unity WebGL Builder
//  consumes to render the 3D framing scene. The Supervisor never renders;
//  the Builder never infers — strict separation of concerns.
//
//  Schema v1.0  (wall_frame only — Phase 1 MVP)
// ══════════════════════════════════════════════════════════════════════

// ── Phase 1 Intent Sanitizer ──────────────────────────────────────────
//
//  Reconstructs the full Phase 1 object from scratch using deterministic
//  fallbacks. This is the hard guarantee the Unity C# Builder relies on —
//  Gemini may return null/undefined/wrong-type values despite prompt defaults.
//  Pattern mirrors assignUnitPrice(): AI provides the estimate, Express is
//  the final gate before the value leaves the server.
function sanitizePhase1Intent(raw) {
    const dim = raw.dimensions || {};
    const str = raw.structural  || {};
    const fea = raw.features    || {};

    // studSpacingInches must be exactly 16 or 24 — snap anything else to 16
    const rawSpacing  = Number(str.studSpacingInches);
    const studSpacing = rawSpacing === 24 ? 24 : 16;

    // wallType must be exactly "interior" or "exterior" — anything else defaults to "exterior"
    const wallType = str.wallType === 'interior' ? 'interior' : 'exterior';

    return {
        schemaVersion: '1.0',        // always hard-pin — never trust AI on versioning
        projectType:   'wall_frame', // Phase 1 only — always hard-pin
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
            doorOpenings:  Number.isInteger(Number(fea.doorOpenings))  && Number(fea.doorOpenings)  >= 0
                ? Math.floor(Number(fea.doorOpenings))
                : 0,
            windowOpenings: Number.isInteger(Number(fea.windowOpenings)) && Number(fea.windowOpenings) >= 0
                ? Math.floor(Number(fea.windowOpenings))
                : 0,
            cornerCount:   Number.isInteger(Number(fea.cornerCount))   && Number(fea.cornerCount)   >= 0
                ? Math.floor(Number(fea.cornerCount))
                : 4,
        },
    };
}

const VOICE_TO_JSON_SYSTEM_PROMPT =
    `You are a Construction Intent Translator for the Lone Ranger Estimator's 3D framing engine. ` +
    `Your ONLY job is to convert a contractor's spoken transcript into a precise JSON command packet. ` +
    `Output ONLY valid JSON — no markdown fences, no explanation, no commentary whatsoever.\n\n` +
    `You MUST return an object that conforms EXACTLY to this Phase 1 schema:\n` +
    `{\n` +
    `  "schemaVersion": "1.0",\n` +
    `  "projectType": "wall_frame",\n` +
    `  "dimensions": { "lengthFt": <number>, "heightFt": <number> },\n` +
    `  "structural": { "studSpacingInches": <16 or 24>, "treatedSolePlate": <boolean>, "wallType": <"interior" or "exterior"> },\n` +
    `  "features": { "doorOpenings": <non-negative integer>, "windowOpenings": <non-negative integer>, "cornerCount": <non-negative integer> }\n` +
    `}\n\n` +
    `Extraction rules:\n` +
    `- projectType: always "wall_frame" in Phase 1 — never change this value.\n` +
    `- lengthFt: the wall length in feet. Default 20 if not stated.\n` +
    `- heightFt: the wall height in feet. Default 9 if not stated.\n` +
    `- studSpacingInches: MUST be exactly 16 or 24. Default 16. Infer from "16 on center", "24 OC", etc.\n` +
    `- treatedSolePlate: true if the user says "treated", "PT", "pressure treated", or implies a concrete/slab floor. Default false.\n` +
    `- wallType: "exterior" if the user says "exterior", "outside wall", "load-bearing", or implies an outer building envelope. ` +
    `"interior" if the user says "interior", "partition", "inside wall", or implies a non-structural dividing wall. Default "exterior".\n` +
    `- doorOpenings: count of door rough openings explicitly mentioned. Default 0.\n` +
    `- windowOpenings: count of window rough openings explicitly mentioned. Default 0.\n` +
    `- cornerCount: number of corners or turns in the wall layout. Infer from "L-shaped", "U-shaped", room descriptions, or explicit corner counts. ` +
    `Default 4 (a standard rectangular room has 4 corners).\n` +
    `- NEVER add fields beyond the schema above.\n` +
    `- NEVER wrap output in markdown code fences (no \`\`\`json).`;

// ══════════════════════════════════════════════════════════════════════
//  ENDPOINT: POST /api/estimate/voice-to-json
//
//  Receives a voice transcript and returns a deterministic JSON payload
//  conforming to the Phase 1 wall_frame schema, ready for the Unity Builder.
//
//  Security: requireAuth — Google ID token in Authorization: Bearer <token>
//  Body:     { transcript: string }
//  Returns:  { success: true, intent: { schemaVersion, projectType, dimensions, structural, features } }
// ══════════════════════════════════════════════════════════════════════

app.post('/api/estimate/voice-to-json', requireAuth, async (req, res) => {
    const userPhone  = req.userPhone;
    const transcript = req.body.transcript;

    if (!transcript || !transcript.trim()) {
        return res.status(400).json({ error: 'transcript is required and must not be empty.' });
    }

    console.log(`[${userPhone}] voice-to-json: translating transcript (${transcript.length} chars)...`);

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-3.5-flash',
            config: {
                systemInstruction: VOICE_TO_JSON_SYSTEM_PROMPT,
            },
            contents: [{ role: 'user', parts: [{ text: transcript.trim() }] }],
        });

        const rawText = response.text;
        let rawIntent;
        try {
            rawIntent = parseGeminiJSON(rawText);
        } catch (parseErr) {
            console.error(`[${userPhone}] voice-to-json: Gemini returned unparseable JSON:`, rawText);
            return res.status(502).json({ error: 'AI returned malformed JSON. Please retry.' });
        }

        // Normalize: apply deterministic fallbacks for every field.
        // sanitizePhase1Intent() reconstructs the full object from scratch, so Unity
        // is guaranteed valid types and values regardless of what Gemini returned.
        const intent = sanitizePhase1Intent(rawIntent);

        console.log(`[${userPhone}] voice-to-json: intent resolved — ${intent.projectType} | ${intent.dimensions.lengthFt}x${intent.dimensions.heightFt}ft | ${intent.structural.studSpacingInches}" OC | ${intent.structural.wallType} | doors:${intent.features.doorOpenings} windows:${intent.features.windowOpenings} corners:${intent.features.cornerCount}`);
        res.json({ success: true, intent });

    } catch (err) {
        console.error(`[${userPhone}] voice-to-json error:`, err.message);
        res.status(500).json({ error: err.message || 'Failed to translate transcript.' });
    }
});

// ── Start ─────────────────────────────────────────────────────────────
app.listen(port, () => {
    console.log(`\n🗂  Multi-Tenant Voice Ledger server running on port ${port}\n`);
});
