// Bootstrap config first — loads .env and initializes all singletons
require('./config');
require('./db'); // runs seed IIFE on startup

const express = require('express');
const cors    = require('cors');
const path    = require('path');
const { google }   = require('googleapis');
const { OAuth2Client } = require('google-auth-library');
const fs = require('fs');

const { billingRouter, stripeWebhookHandler } = require('./routes/billing');
const processingRouter    = require('./routes/processing');
const pdfRouter           = require('./routes/pdf');
const priceBookRouter     = require('./routes/priceBook');
const estimatesRouter     = require('./routes/estimates');
const settingsRouter      = require('./routes/settings');
const authRouter          = require('./routes/auth');
const changeOrdersRouter  = require('./routes/changeOrders');
const invoiceRouter       = require('./routes/invoice');
const interactionsRouter  = require('./routes/interactions');
const webhookRouter       = require('./routes/webhook');

const app  = express();
const port = process.env.PORT || 8080;

app.use(cors({ origin: ['http://localhost:5173', 'http://localhost:5174'] }));

// ── Static file serving ───────────────────────────────────────────────
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
    },
}));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

const uiDistPath = path.join(__dirname, '..', 'ui', 'dist');
app.use('/dashboard', express.static(uiDistPath));
app.get('/dashboard',       (req, res) => res.sendFile(path.join(uiDistPath, 'index.html')));
app.get('/dashboard/*splat', (req, res) => res.sendFile(path.join(uiDistPath, 'index.html')));
app.get('/dashboard-legacy', (req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'dashboard.html')));

// ── Stripe webhook — must be mounted BEFORE express.json() ───────────
app.post('/api/webhooks/stripe', express.raw({ type: 'application/json' }), stripeWebhookHandler);

// ── Body parsers ──────────────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── Route modules ─────────────────────────────────────────────────────
app.use('/api/webhook',  webhookRouter);
app.use('/api',          processingRouter);
app.use('/api',          pdfRouter);
app.use('/api',          priceBookRouter);
app.use('/api',          estimatesRouter);
app.use('/api',          settingsRouter);
app.use('/api',          authRouter);
app.use('/api/billing',  billingRouter);
app.use('/api',          changeOrdersRouter);
app.use('/api',          invoiceRouter);
app.use('/api',          interactionsRouter);

// The /approve page is served by the changeOrders router at the top level
app.use('/', changeOrdersRouter);

// ── Google OAuth helper (legacy Google Docs integration) ──────────────
const CREDENTIALS_PATH = path.join(__dirname, 'config', 'Credentials.json');
const TOKEN_PATH       = path.join(__dirname, 'config', 'token.json');

function getOAuth2Client() {
    let credentials, token;
    if (process.env.GOOGLE_OAUTH_CREDENTIALS && process.env.GOOGLE_OAUTH_TOKEN) {
        credentials = JSON.parse(process.env.GOOGLE_OAUTH_CREDENTIALS);
        token       = JSON.parse(process.env.GOOGLE_OAUTH_TOKEN);
    } else {
        credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf-8'));
        token       = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf-8'));
    }
    const { installed } = credentials;
    const oAuth2Client  = new google.auth.OAuth2(
        installed.client_id, installed.client_secret, installed.redirect_uris[0]
    );
    oAuth2Client.setCredentials(token);
    return oAuth2Client;
}

app.listen(port, () => {
    console.log(`\n🗂  Multi-Tenant Voice Ledger server running on port ${port}\n`);
});
