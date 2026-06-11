require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const stripe        = require('stripe')(process.env.STRIPE_SECRET_KEY);
const multer        = require('multer');
const path          = require('path');
const fs            = require('fs');
const { GoogleGenAI } = require('@google/genai');
const { Firestore }   = require('@google-cloud/firestore');
const { Storage }     = require('@google-cloud/storage');
const { OAuth2Client } = require('google-auth-library');
const twilio          = require('twilio');

const { createPricingEngine } = require('./lib/pricingEngine');
const { createPipeline }      = require('./lib/pipeline');

const db         = new Firestore();
const ai         = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const authClient = new OAuth2Client(process.env.GOOGLE_OAUTH_CLIENT_ID);
const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

// ── Temp dirs ─────────────────────────────────────────────────────────
const TEMP_DIR    = path.join(__dirname, '..', 'temp');
const UPLOADS_DIR = path.join(TEMP_DIR, 'uploads');
const EXPORTS_DIR = path.join(TEMP_DIR, 'exports');

[TEMP_DIR, UPLOADS_DIR, EXPORTS_DIR].forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// ── Multer instances ──────────────────────────────────────────────────
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
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: audioFilter,
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
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: csvFilter,
});

const multerMemory = multer({
    storage: multer.memoryStorage(),
    limits:  { fileSize: 2 * 1024 * 1024 },
});

const coImageUpload = multer({
    storage: multer.memoryStorage(),
    limits:  { fileSize: 10 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
        if (!file.mimetype.startsWith('image/')) {
            return cb(new Error('Only image files are allowed'));
        }
        cb(null, true);
    },
});

// ── GCS bucket for change-order images ───────────────────────────────
const coStorage = new Storage();
const coBucket  = coStorage.bucket('lone-ranger-change-orders');

// ── Pricing engine + pipeline ─────────────────────────────────────────
const { assignUnitPrice, assignLaborRate } = createPricingEngine({ db, ai });
const pipeline = createPipeline({ db, ai });

module.exports = {
    db, ai, stripe, authClient, twilioClient,
    upload, csvUpload, multerMemory, coImageUpload, coBucket,
    pipeline, assignUnitPrice, assignLaborRate,
    TEMP_DIR, UPLOADS_DIR, EXPORTS_DIR,
};
