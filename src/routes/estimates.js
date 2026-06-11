const express = require('express');
const { FieldValue } = require('@google-cloud/firestore');

const { db } = require('../config');
const { loadLedger, authorizePhone } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { sanitizeItemId } = require('../lib/sanitize');

const router = express.Router();

// ── GET /api/pending-estimates ────────────────────────────────────────
router.get('/pending-estimates', requireAuth, async (req, res) => {
    const phone = req.userPhone;
    const auth  = await authorizePhone(phone);
    if (!auth.authorized) return res.status(401).json({ error: auth.reason });
    const ledger = await loadLedger(phone);
    res.json(ledger);
});

// ── GET /api/estimates ────────────────────────────────────────────────
router.get('/estimates', requireAuth, async (req, res) => {
    const userPhone = req.userPhone;
    try {
        const snap = await db.collection('users').doc(userPhone).collection('estimates').get();
        const list = [];
        snap.forEach(doc => {
            const data = doc.data();
            list.push({
                id:           doc.id,
                project_name: data.project_name || 'Untitled Project',
                updatedAt:    data.updatedAt ? (data.updatedAt.toDate ? data.updatedAt.toDate() : new Date(data.updatedAt)) : new Date(0),
                total_amount: data.total_amount || 0,
                item_count:   data.item_count   || 0,
            });
        });
        list.sort((a, b) => b.updatedAt - a.updatedAt);
        res.json(list);
    } catch (err) {
        console.error(`[${userPhone}] GET /api/estimates error:`, err.message);
        res.status(500).json({ error: 'Failed to retrieve projects list' });
    }
});

// ── GET /api/estimates/:id ────────────────────────────────────────────
router.get('/estimates/:id', requireAuth, async (req, res) => {
    const userPhone  = req.userPhone;
    const estimateId = req.params.id;
    try {
        const snap = await db.collection('users').doc(userPhone).collection('estimates').doc(estimateId).get();
        if (!snap.exists) return res.status(404).json({ error: 'Estimate not found' });
        res.json({ id: snap.id, ...snap.data() });
    } catch (err) {
        console.error(`[${userPhone}] GET /api/estimates/${estimateId} error:`, err.message);
        res.status(500).json({ error: 'Failed to retrieve project details' });
    }
});

// ── POST/PUT /api/estimates/:id/save ─────────────────────────────────
async function saveEstimateHandler(req, res) {
    const userPhone  = req.userPhone;
    const estimateId = req.params.id;
    const {
        project_name, items = [], total_amount, item_count,
        client_name, client_address, client_phone, scope_of_work, status, deposit_amount,
    } = req.body;

    try {
        const docRef = db.collection('users').doc(userPhone).collection('estimates').doc(estimateId);
        const updateObj = {
            project_name: project_name || 'Untitled Project',
            items,
            total_amount: Number(total_amount) || 0,
            item_count:   Number(item_count)   || 0,
            updatedAt:    FieldValue.serverTimestamp(),
        };
        if (client_name     !== undefined) updateObj.client_name     = client_name;
        if (client_address  !== undefined) updateObj.client_address  = client_address;
        if (client_phone    !== undefined) updateObj.client_phone    = client_phone;
        if (scope_of_work   !== undefined) updateObj.scope_of_work   = scope_of_work;
        if (status          !== undefined) updateObj.status          = status;
        if (deposit_amount  !== undefined) updateObj.deposit_amount  = Number(deposit_amount) || 0;

        await docRef.set(updateObj, { merge: true });

        // Self-teaching: learn edited material prices
        const materials = items.filter(i => i && i.name && i.unit_price != null && (i.type === 'material' || !i.role));
        if (materials.length > 0) {
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
}

router.post('/estimates/:id/save', requireAuth, saveEstimateHandler);
router.put('/estimates/:id/save',  requireAuth, saveEstimateHandler);

// ── DELETE /api/estimates/:id ─────────────────────────────────────────
router.delete('/estimates/:id', requireAuth, async (req, res) => {
    const userPhone  = req.userPhone;
    const estimateId = req.params.id;
    try {
        const docRef = db.collection('users').doc(userPhone).collection('estimates').doc(estimateId);
        const snap   = await docRef.get();
        if (!snap.exists) return res.status(404).json({ error: 'Estimate not found or unauthorized' });
        await docRef.delete();
        res.json({ success: true });
    } catch (err) {
        console.error(`[${userPhone}] DELETE /api/estimates/${estimateId} error:`, err.message);
        res.status(500).json({ error: 'Failed to delete project' });
    }
});

module.exports = router;
