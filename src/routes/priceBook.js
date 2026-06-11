const express = require('express');
const csv     = require('csv-parser');
const fs      = require('fs');

const { db, csvUpload } = require('../config');
const { requireAuth }   = require('../middleware/auth');
const { sanitizeItemId } = require('../lib/sanitize');

const router = express.Router();

// ── Multer error handler for CSV ──────────────────────────────────────
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

// ── POST /api/upload-csv ──────────────────────────────────────────────
router.post(
    '/upload-csv',
    (req, res, next) => csvUpload.single('file')(req, res, (err) => handleCsvUploadError(err, req, res, next)),
    requireAuth,
    async (req, res) => {
        const userPhone = req.userPhone;
        if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });

        const rows    = [];
        let   skipped = 0;
        const NAME_ALIASES  = new Set(['name', 'item', 'description']);
        const PRICE_ALIASES = new Set(['price', 'cost', 'unit_cost']);

        try {
            await new Promise((resolve, reject) => {
                fs.createReadStream(req.file.path)
                    .pipe(csv({ mapHeaders: ({ header }) => header.trim().toLowerCase() }))
                    .on('data', row => {
                        const nameKey  = Object.keys(row).find(k => NAME_ALIASES.has(k));
                        const priceKey = Object.keys(row).find(k => PRICE_ALIASES.has(k));
                        if (!nameKey || !priceKey) { skipped++; return; }

                        const name     = (row[nameKey] || '').trim();
                        const priceStr = (row[priceKey] || '').trim();
                        const price    = Number(priceStr.replace(/[^0-9.-]+/g, ''));

                        if (!name || Number.isNaN(price)) { skipped++; return; }
                        rows.push({ name, price });
                    })
                    .on('end',   resolve)
                    .on('error', reject);
            });
        } finally {
            try { fs.unlinkSync(req.file.path); } catch (_) {}
        }

        if (rows.length === 0) {
            return res.status(400).json({
                error: 'CSV parsed but no valid rows found. Ensure columns named name/item/description and price/cost/unit_cost exist.',
                skipped,
            });
        }

        const CHUNK_SIZE = 499;
        let imported = 0;
        for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
            const chunk = rows.slice(i, i + CHUNK_SIZE);
            const batch = db.batch();
            for (const { name, price } of chunk) {
                const docRef = db.collection('users').doc(userPhone).collection('price_book').doc(sanitizeItemId(name));
                batch.set(docRef, { name, price }, { merge: true });
            }
            await batch.commit();
            imported += chunk.length;
        }

        console.log(`[upload-csv] Complete — imported: ${imported}, skipped: ${skipped} — by ${userPhone}.`);
        res.json({ success: true, imported, skipped });
    }
);

// ── POST /api/admin/sync-prices ───────────────────────────────────────
router.post('/admin/sync-prices', async (req, res) => {
    const key = req.headers['x-api-key'];
    if (!key || key !== process.env.ADMIN_API_KEY) return res.status(403).json({ error: 'Forbidden' });
    try {
        const { scrapeMenardsPrices } = require('../lib/menardsScraper');
        const result = await scrapeMenardsPrices(db);
        res.json({ ok: true, ...result });
    } catch (e) {
        console.error('[sync-prices] error:', e.message);
        res.status(500).json({ error: e.message });
    }
});

// ── GET /api/price-sheet ──────────────────────────────────────────────
router.get('/price-sheet', requireAuth, async (req, res) => {
    const userPhone = req.userPhone;
    const { findMarketKey } = require('../lib/menardsScraper');
    const SKUs = require('../lib/menardsSKUs');

    try {
        const [pbSnap, marketSnap, metaDoc] = await Promise.all([
            db.collection('users').doc(userPhone).collection('price_book').get(),
            db.collection('market_prices').doc('menards').collection('items').get(),
            db.collection('market_prices').doc('menards').get(),
        ]);

        const marketMap  = {};
        marketSnap.forEach(doc => { marketMap[doc.id] = doc.data(); });
        const menardsMeta = metaDoc.exists ? metaDoc.data() : {};

        const usedMarketKeys = new Set();
        const priceBook = [];
        pbSnap.forEach(doc => {
            const d         = doc.data();
            const marketKey = findMarketKey(d.name);
            const market    = marketKey ? marketMap[marketKey] : null;
            if (marketKey) usedMarketKeys.add(marketKey);
            priceBook.push({
                itemId:      doc.id,
                name:        d.name,
                savedPrice:  d.price,
                marketKey:   marketKey || null,
                marketPrice: (market && !market.stale) ? market.price : null,
                marketUnit:  market ? market.unit : null,
                marketAgeH:  (market && market.scraped_at)
                    ? Math.round((Date.now() - market.scraped_at.toDate()) / 36e5)
                    : null,
                marketStale: market ? (market.stale || false) : null,
            });
        });

        const marketOnly = [];
        for (const sku of SKUs) {
            const key    = sanitizeItemId(sku.key);
            if (usedMarketKeys.has(key)) continue;
            const market = marketMap[key];
            if (!market) continue;
            marketOnly.push({
                key, name: sku.name, unit: sku.unit,
                price:      market.stale ? null : market.price,
                marketAgeH: market.scraped_at ? Math.round((Date.now() - market.scraped_at.toDate()) / 36e5) : null,
                stale:      market.stale || false,
            });
        }

        const market = [];
        for (const sku of SKUs) {
            const key = sanitizeItemId(sku.key);
            const m   = marketMap[key];
            if (!m) continue;
            market.push({
                key, name: sku.name, unit: sku.unit,
                price:      m.stale ? null : m.price,
                marketAgeH: m.scraped_at ? Math.round((Date.now() - m.scraped_at.toDate()) / 36e5) : null,
                stale:      m.stale || false,
            });
        }

        res.json({
            priceBook, marketOnly, market,
            lastSync: menardsMeta.last_run ? menardsMeta.last_run.toDate().toISOString() : null,
        });
    } catch (e) {
        console.error('[price-sheet] error:', e.message);
        res.status(500).json({ error: e.message });
    }
});

// ── PUT /api/price-book/:itemId ───────────────────────────────────────
router.put('/price-book/:itemId', requireAuth, async (req, res) => {
    const userPhone = req.userPhone;
    const { itemId } = req.params;
    const price = Number(req.body?.price);
    if (!Number.isFinite(price) || price < 0) return res.status(400).json({ error: 'price must be a non-negative number' });
    try {
        await db.collection('users').doc(userPhone).collection('price_book').doc(itemId).set({ price }, { merge: true });
        res.json({ ok: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ── DELETE /api/price-book/:itemId ────────────────────────────────────
router.delete('/price-book/:itemId', requireAuth, async (req, res) => {
    const userPhone = req.userPhone;
    const { itemId } = req.params;
    try {
        await db.collection('users').doc(userPhone).collection('price_book').doc(itemId).delete();
        res.json({ ok: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ── POST /api/price-book/sync-from-menards ────────────────────────────
router.post('/price-book/sync-from-menards', requireAuth, async (req, res) => {
    const userPhone = req.userPhone;
    const { findMarketKey } = require('../lib/menardsScraper');
    const { itemId, marketKey: singleKey } = req.body || {};

    try {
        if (itemId && singleKey) {
            const snap = await db.collection('market_prices').doc('menards').collection('items').doc(singleKey).get();
            if (!snap.exists || snap.data().stale) return res.status(404).json({ error: 'No live market price for this item' });
            const { price } = snap.data();
            await db.collection('users').doc(userPhone).collection('price_book').doc(itemId).set({ price }, { merge: true });
            return res.json({ ok: true, synced: 1, price });
        }

        const [pbSnap, marketSnap] = await Promise.all([
            db.collection('users').doc(userPhone).collection('price_book').get(),
            db.collection('market_prices').doc('menards').collection('items').get(),
        ]);
        const marketMap = {};
        marketSnap.forEach(doc => { marketMap[doc.id] = doc.data(); });

        const batch = db.batch();
        let synced = 0;
        pbSnap.forEach(doc => {
            const mKey   = findMarketKey(doc.data().name);
            if (!mKey) return;
            const market = marketMap[mKey];
            if (!market || market.stale) return;
            batch.set(doc.ref, { price: market.price }, { merge: true });
            synced++;
        });
        if (synced > 0) await batch.commit();
        res.json({ ok: true, synced });
    } catch (e) {
        console.error('[sync-from-menards] error:', e.message);
        res.status(500).json({ error: e.message });
    }
});

// ── POST /api/price-book ──────────────────────────────────────────────
router.post('/price-book', requireAuth, async (req, res) => {
    const userPhone = req.userPhone;
    const { name, price } = req.body || {};
    const p = Number(price);
    if (!name || !Number.isFinite(p) || p < 0) return res.status(400).json({ error: 'name and non-negative price required' });
    try {
        await db.collection('users').doc(userPhone).collection('price_book').doc(sanitizeItemId(name)).set({ name, price: p }, { merge: true });
        res.json({ ok: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

module.exports = router;
