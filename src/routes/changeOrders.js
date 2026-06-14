const express    = require('express');
const puppeteer  = require('puppeteer');
const nodemailer = require('nodemailer');
const crypto     = require('crypto');
const { FieldValue } = require('@google-cloud/firestore');

const { db, ai, coBucket, coImageUpload, assignUnitPrice } = require('../config');
const { requireAuth, requireSubscription } = require('../middleware/auth');
const { parseGeminiJSON } = require('../lib/sanitize');
const { escapeHtml } = require('../lib/htmlUtils');

const router = express.Router();

const CHANGE_ORDER_PROMPT =
    `You are an expert residential construction estimator based in central Wisconsin. ` +
    `A contractor is dictating a mid-project change to an existing contract. ` +
    `Extract ONLY the NEW items being added. Do NOT re-list any items from the original estimate. ` +
    `Focus strictly on what is being ADDED or CHANGED.\n\n` +
    `ADDED MATERIALS: Extract every new material item with quantity, unit, trade, and a conservative ` +
    `retail unit cost estimate (Home Depot / Menards shelf price for central Wisconsin). ` +
    `Use descriptive industry-standard material names (e.g. "3/4 inch ACX Plywood", "Type S Mortar Mix").\n\n` +
    `ADDED LABOR: Extract any additional labor roles and hours explicitly mentioned.\n\n` +
    `EXCLUSIONS: List any items or work the contractor explicitly states are NOT included.\n\n` +
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

// ── buildChangeOrderHtml ──────────────────────────────────────────────
function buildChangeOrderHtml({ co, parentEstimateId, companyName, companyAddress, contactEmail, licenseNumber, logoHtml, formattedDate }) {
    const materialsSubtotal = (co.added_materials || []).reduce((s, m) => s + (m.total || 0), 0);
    const laborSubtotal     = (co.added_labor     || []).reduce((s, l) => s + (l.total || 0), 0);
    const wiSalesTax        = Math.round(materialsSubtotal * 0.055 * 100) / 100;
    const changeTotal       = Math.round((materialsSubtotal + laborSubtotal + wiSalesTax) * 100) / 100;

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

// ── renderChangeOrderPdf ──────────────────────────────────────────────
async function renderChangeOrderPdf({ coDoc, parentEstimateId, profile, user }) {
    const companyName = profile.company_name || user.companyName || 'Lone Ranger Contracting';
    let logoHtml = '';
    if (profile.company_logo_url && (profile.company_logo_url.startsWith('https://') || profile.company_logo_url.startsWith('data:image/'))) {
        logoHtml = `<img src="${escapeHtml(profile.company_logo_url)}" style="max-height:50px;max-width:150px;object-fit:contain;" />`;
    } else {
        const initials = companyName.substring(0, 2).toUpperCase();
        logoHtml = `<div style="width:50px;height:50px;border-radius:50%;background:#521880;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:14pt;">${initials}</div>`;
    }
    const formattedDate = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    const htmlContent   = buildChangeOrderHtml({
        co: { ...coDoc }, parentEstimateId, companyName,
        companyAddress: profile.company_address || '',
        contactEmail:   profile.contact_email   || user.email || '',
        licenseNumber:  profile.license_number  || '',
        logoHtml, formattedDate,
    });

    let browser;
    try {
        browser = await puppeteer.launch({
            headless: true,
            executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/google-chrome',
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
        });
        const page = await browser.newPage();
        await page.setContent(htmlContent, { waitUntil: 'networkidle0' });
        const pdfBuffer = await page.pdf({ format: 'Letter', printBackground: true, margin: { top: '0.4in', bottom: '0.4in', left: '0.4in', right: '0.4in' } });
        await browser.close();
        browser = null;
        // Puppeteer v22+ returns Uint8Array — wrap in Buffer before base64 encoding
        return Buffer.from(pdfBuffer).toString('base64');
    } finally {
        if (browser) { try { await browser.close(); } catch (_) {} }
    }
}

// ── POST /api/change-orders/upload-image ─────────────────────────────
router.post('/change-orders/upload-image', coImageUpload.single('image'), requireAuth, requireSubscription, async (req, res) => {
    const userPhone = req.userPhone;
    if (!req.file) return res.status(400).json({ error: 'No image file provided' });
    try {
        const safeName  = req.file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
        const filename  = `${userPhone}/${Date.now()}_${safeName}`;
        const gcsFile   = coBucket.file(filename);
        await gcsFile.save(req.file.buffer, { metadata: { contentType: req.file.mimetype } });
        await gcsFile.makePublic();
        res.json({ imageUrl: `https://storage.googleapis.com/lone-ranger-change-orders/${filename}` });
    } catch (err) {
        console.error(`[${userPhone}] change-orders/upload-image error:`, err.message);
        res.status(500).json({ error: 'Image upload failed' });
    }
});

// ── POST /api/change-orders/generate ─────────────────────────────────
router.post('/change-orders/generate', requireAuth, requireSubscription, async (req, res) => {
    const userPhone = req.userPhone;
    const { parentEstimateId, text } = req.body;
    if (!parentEstimateId || !text || !text.trim()) {
        return res.status(400).json({ error: 'parentEstimateId and text are required.' });
    }

    try {
        const parentRef  = db.collection('users').doc(userPhone).collection('estimates').doc(parentEstimateId);
        const parentSnap = await parentRef.get();
        if (!parentSnap.exists) return res.status(404).json({ error: 'Parent estimate not found.' });

        const geminiResp = await ai.models.generateContent({
            model:    'gemini-3.5-flash',
            contents: { role: 'user', parts: [{ text: text + '\n\n' + CHANGE_ORDER_PROMPT }] },
        });
        const extracted = parseGeminiJSON(geminiResp.text);

        const user = req.authedUser;
        const pricedMaterials = await Promise.all(
            (extracted.added_materials || []).map(async (m) => {
                const priced  = await assignUnitPrice(m, user.zipCode, userPhone);
                priced.total  = Math.round((priced.unit_price || 0) * (m.quantity || 0) * 100) / 100;
                priced.type   = 'material';
                return priced;
            })
        );

        const configSnap      = await db.collection('users').doc(userPhone).collection('settings').doc('config').get();
        const defaultLaborRate = configSnap.exists ? (configSnap.data().default_labor_rate || 55) : 55;
        const pricedLabor      = (extracted.added_labor || []).map(l => {
            const rate  = Number(l.rate) > 0 ? Number(l.rate) : defaultLaborRate;
            const total = Math.round(rate * (l.hours || 0) * 100) / 100;
            return { ...l, rate, total, type: 'labor' };
        });

        const matsSubtotal  = pricedMaterials.reduce((s, m) => s + (m.total || 0), 0);
        const laborSubtotal = pricedLabor.reduce((s, l) => s + (l.total || 0), 0);
        const taxRate       = configSnap.exists ? ((configSnap.data().tax_rate || 5.5) / 100) : 0.055;
        const salesTax      = Math.round(matsSubtotal * taxRate * 100) / 100;
        const changeOrderTotal = Math.round((matsSubtotal + laborSubtotal + salesTax) * 100) / 100;

        const approvalToken  = crypto.randomBytes(16).toString('hex');
        const changeOrderId  = `CO-${crypto.randomBytes(8).toString('hex')}`;
        const coDoc = {
            id: changeOrderId, parentEstimateId,
            change_summary:     extracted.change_summary || '',
            added_materials:    pricedMaterials,
            added_labor:        pricedLabor,
            exclusions:         extracted.exclusions || [],
            materials_subtotal: Math.round(matsSubtotal * 100) / 100,
            labor_subtotal:     Math.round(laborSubtotal * 100) / 100,
            sales_tax:          salesTax,
            change_order_total: changeOrderTotal,
            approval_token:     approvalToken,
            status:             'pending',
            createdAt:          FieldValue.serverTimestamp(),
        };

        const coRef = db.collection('users').doc(userPhone)
            .collection('estimates').doc(parentEstimateId)
            .collection('change_orders').doc(changeOrderId);
        await coRef.set(coDoc, { merge: true });

        const profile = configSnap.exists ? configSnap.data() : {};
        try {
            const pdfBase64 = await renderChangeOrderPdf({ coDoc, parentEstimateId, profile, user });
            await coRef.set({ pdf_base64: pdfBase64 }, { merge: true });
        } catch (pdfErr) {
            console.error(`[${userPhone}] Change order PDF generation failed:`, pdfErr.message);
        }

        res.json({
            success: true, changeOrderId, parentEstimateId,
            change_order_total: changeOrderTotal,
            change_summary:     coDoc.change_summary,
            added_materials:    pricedMaterials,
            added_labor:        pricedLabor,
            exclusions:         coDoc.exclusions,
            status:             'pending',
        });
    } catch (err) {
        console.error(`[${userPhone}] change-orders/generate error:`, err.message);
        res.status(500).json({ error: err.message || 'Failed to generate change order.' });
    }
});

// ── PUT /api/change-orders/:id ────────────────────────────────────────
router.put('/change-orders/:id', requireAuth, requireSubscription, async (req, res) => {
    const userPhone     = req.userPhone;
    const changeOrderId = req.params.id;
    const { parentEstimateId, added_materials = [], added_labor = [] } = req.body;
    if (!parentEstimateId) return res.status(400).json({ error: 'parentEstimateId is required.' });

    try {
        const coRef  = db.collection('users').doc(userPhone)
            .collection('estimates').doc(parentEstimateId)
            .collection('change_orders').doc(changeOrderId);
        const coSnap = await coRef.get();
        if (!coSnap.exists) return res.status(404).json({ error: 'Change order not found.' });

        const materials = added_materials.map(m => ({
            ...m, type: 'material',
            total: Math.round((Number(m.unit_price) || 0) * (Number(m.quantity) || 0) * 100) / 100,
        }));
        const labor = added_labor.map(l => ({
            ...l, type: 'labor',
            total: Math.round((Number(l.rate) || 0) * (Number(l.hours) || 0) * 100) / 100,
        }));

        const matsSubtotal  = materials.reduce((s, m) => s + (m.total || 0), 0);
        const laborSubtotal = labor.reduce((s, l) => s + (l.total || 0), 0);

        const configSnap = await db.collection('users').doc(userPhone).collection('settings').doc('config').get();
        const coTaxRate  = configSnap.exists ? ((configSnap.data().tax_rate || 5.5) / 100) : 0.055;
        const salesTax   = Math.round(matsSubtotal * coTaxRate * 100) / 100;
        const changeOrderTotal = Math.round((matsSubtotal + laborSubtotal + salesTax) * 100) / 100;

        const coDoc = {
            ...coSnap.data(),
            added_materials:    materials,
            added_labor:        labor,
            materials_subtotal: Math.round(matsSubtotal * 100) / 100,
            labor_subtotal:     Math.round(laborSubtotal * 100) / 100,
            sales_tax:          salesTax,
            change_order_total: changeOrderTotal,
        };
        const profile = configSnap.exists ? configSnap.data() : {};
        try {
            coDoc.pdf_base64 = await renderChangeOrderPdf({ coDoc, parentEstimateId, profile, user: req.authedUser });
        } catch (pdfErr) {
            console.error(`[${userPhone}] CO update PDF regen failed:`, pdfErr.message);
        }

        await coRef.set(coDoc, { merge: true });
        res.json({
            success: true, changeOrderId, change_order_total: changeOrderTotal,
            materials_subtotal: coDoc.materials_subtotal,
            labor_subtotal:     coDoc.labor_subtotal,
            sales_tax:          salesTax,
        });
    } catch (err) {
        console.error(`[${userPhone}] change-orders update error:`, err.message);
        res.status(500).json({ error: err.message || 'Failed to update change order.' });
    }
});

// ── POST /api/change-orders/send ──────────────────────────────────────
router.post('/change-orders/send', requireAuth, requireSubscription, async (req, res) => {
    const userPhone = req.userPhone;
    const { changeOrderId, parentEstimateId, clientEmail, image_url: imageUrl } = req.body;

    if (!changeOrderId || !parentEstimateId || !clientEmail) {
        return res.status(400).json({ error: 'changeOrderId, parentEstimateId, and clientEmail are required.' });
    }
    const emailTo = String(clientEmail).trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(emailTo)) {
        return res.status(400).json({ error: 'clientEmail must be a valid email address.' });
    }

    try {
        const coRef  = db.collection('users').doc(userPhone)
            .collection('estimates').doc(parentEstimateId)
            .collection('change_orders').doc(changeOrderId);
        const coSnap = await coRef.get();
        if (!coSnap.exists) return res.status(404).json({ error: 'Change order not found.' });
        const co = coSnap.data();

        await db.collection('users').doc(userPhone).collection('estimates').doc(parentEstimateId)
            .set({ client_email: emailTo }, { merge: true });

        const appUrl = process.env.APP_URL || 'http://localhost:8080';
        await db.collection('approvals').doc(changeOrderId).set({ userPhone, parentEstimateId, changeOrderId });
        const approvalUrl = `${appUrl}/approve?t=${co.approval_token}&r=${encodeURIComponent(changeOrderId)}`;

        const user = req.authedUser;
        const settingsSnap  = await db.collection('users').doc(userPhone).collection('settings').doc('config').get();
        const settingsData  = settingsSnap.exists ? settingsSnap.data() : {};
        const companyName   = settingsData.company_name || user.companyName
            || (user.email ? user.email.split('@')[0] : null) || 'Your Contractor';
        const totalFormatted = `$${Number(co.change_order_total || 0).toFixed(2)}`;

        const imageHtml = imageUrl
            ? `<div style="margin-top: 24px; margin-bottom: 24px;">
  <p style="font-size: 14px; color: #374151; margin-bottom: 8px;"><strong>Reference Photo:</strong></p>
  <a href="${escapeHtml(String(imageUrl))}" target="_blank" style="display: block; text-decoration: none;">
    <img src="${escapeHtml(String(imageUrl))}" alt="Change Order Reference" width="600" style="display: block; max-width: 100%; height: auto; border-radius: 8px; border: 1px solid #d1d5db;" />
    <p style="text-align: center; color: #6b7280; font-size: 12px; margin-top: 8px; text-decoration: underline;">Click to view full size</p>
  </a>
</div>`
            : '';
        const imageText = imageUrl ? `\nJob-site photo: ${imageUrl}\n` : '';

        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
        });
        const mailResult = await transporter.sendMail({
            from:    `"${companyName}" <${process.env.EMAIL_USER}>`,
            to:      emailTo,
            subject: `Change Order for your project — ${totalFormatted} (action required)`,
            text:
                `Hello,\n\nA change order for your project has been issued by ${companyName} ` +
                `(additional amount: ${totalFormatted}).\n\nReview and approve it here:\n${approvalUrl}\n` +
                imageText + `\nThank you,\n${companyName}`,
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px;">
                    <h2 style="color: #1e2533;">${escapeHtml(companyName)}</h2>
                    <p>Hello,</p>
                    <p>A <strong>Change Order</strong> for your project has been issued (additional amount: <strong>${totalFormatted}</strong>).</p>
                    ${imageHtml}
                    <p style="margin: 22px 0;">
                        <a href="${approvalUrl}" style="background: #521880; color: #ffffff; padding: 12px 22px; border-radius: 8px; text-decoration: none; font-weight: bold;">
                            Review &amp; Approve
                        </a>
                    </p>
                    <p style="font-size: 12px; color: #888;">Or open this link: ${approvalUrl}</p>
                    <p>Thank you,<br/>${escapeHtml(companyName)}</p>
                </div>
            `,
        });

        await coRef.set({
            sent_at: new Date().toISOString(), sent_to: emailTo,
            email_message_id: mailResult.messageId || null,
            ...(imageUrl ? { image_url: imageUrl } : {}),
        }, { merge: true });

        res.json({ success: true, message_id: mailResult.messageId || null, sent_to: emailTo });
    } catch (err) {
        console.error(`[${userPhone}] change-orders/send error:`, err.message);
        res.status(500).json({ error: err.message || 'Failed to email change order.' });
    }
});

// ── GET /approve (public token-gated page) ────────────────────────────
router.get('/approve', async (req, res) => {
    const { r: lookupId, t: token } = req.query;
    if (!lookupId || !token) return res.status(400).send('<h2>Invalid approval link. Missing required parameters.</h2>');

    try {
        const lookupSnap = await db.collection('approvals').doc(lookupId).get();
        if (!lookupSnap.exists) return res.status(400).send('<h2>Invalid or expired approval link.</h2>');

        const { userPhone, parentEstimateId, changeOrderId } = lookupSnap.data();
        const coRef  = db.collection('users').doc(userPhone)
            .collection('estimates').doc(parentEstimateId)
            .collection('change_orders').doc(changeOrderId);
        const coSnap = await coRef.get();
        if (!coSnap.exists) return res.status(404).send('<h2>Change order not found.</h2>');

        const co = coSnap.data();
        if (!co.approval_token || co.approval_token !== token) {
            return res.status(403).send(`<!DOCTYPE html><html><body style="font-family:system-ui;text-align:center;padding:60px;background:#fff0f0;color:#b91c1c;">
                <h2>⛔ Forbidden</h2><p>This approval link is invalid or has expired.</p></body></html>`);
        }

        const settingsSnap   = await db.collection('users').doc(userPhone).collection('settings').doc('config').get();
        const approveSettings = settingsSnap.exists ? settingsSnap.data() : {};
        const contractorName  = approveSettings.company_name || 'Your Contractor';
        const isApproved      = co.status === 'approved';
        const totalFormatted  = `$${Number(co.change_order_total || 0).toFixed(2)}`;
        const pdfDataUrl      = co.pdf_base64 ? `data:application/pdf;base64,${co.pdf_base64}` : null;

        // Itemized line items — mirror the contractor's ledger instead of echoing raw dictation.
        const coMaterials = co.added_materials || [];
        const coLabor     = co.added_labor     || [];
        const materialLineRows = coMaterials.map(m => `
            <tr>
                <td style="padding:8px 6px;border-bottom:1px solid #ede9fe;">${escapeHtml(m.name || 'Material')}</td>
                <td style="padding:8px 6px;border-bottom:1px solid #ede9fe;text-align:right;white-space:nowrap;">${Number(m.quantity) || 0} ${escapeHtml(m.unit || 'ea')}</td>
                <td style="padding:8px 6px;border-bottom:1px solid #ede9fe;text-align:right;white-space:nowrap;">$${Number(m.total || 0).toFixed(2)}</td>
            </tr>`).join('');
        const laborLineRows = coLabor.map(l => `
            <tr>
                <td style="padding:8px 6px;border-bottom:1px solid #ede9fe;">${escapeHtml(l.role || 'Labor')}</td>
                <td style="padding:8px 6px;border-bottom:1px solid #ede9fe;text-align:right;white-space:nowrap;">${Number(l.hours) || 0} hr</td>
                <td style="padding:8px 6px;border-bottom:1px solid #ede9fe;text-align:right;white-space:nowrap;">$${Number(l.total || 0).toFixed(2)}</td>
            </tr>`).join('');
        const lineItemsHtml = (coMaterials.length > 0 || coLabor.length > 0)
            ? `<div class="items-box">
                 ${co.change_summary ? `<p class="items-intro">${escapeHtml(co.change_summary)}</p>` : ''}
                 <table class="items-table">
                   ${coMaterials.length > 0 ? `
                     <thead><tr><th colspan="3">Added Materials</th></tr></thead>
                     <tbody>${materialLineRows}</tbody>` : ''}
                   ${coLabor.length > 0 ? `
                     <thead><tr><th colspan="3">Added Labor</th></tr></thead>
                     <tbody>${laborLineRows}</tbody>` : ''}
                 </table>
               </div>`
            : (co.change_summary ? `<div class="summary-box">📋 ${escapeHtml(co.change_summary)}</div>` : '');

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
        .items-box { background: #faf7fd; border: 1px solid #e9d5ff; border-radius: 12px; padding: 14px 16px; margin-bottom: 20px; }
        .items-intro { font-size: 13px; line-height: 1.5; color: #4b2d7a; margin-bottom: 12px; }
        .items-table { width: 100%; border-collapse: collapse; font-size: 13px; color: #210936; }
        .items-table th { text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: 0.6px; color: #7c3aed; font-weight: 800; padding: 10px 6px 4px; border-bottom: 2px solid #ede9fe; }
        .items-table td:first-child { color: #4b2d7a; }
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
        .consent-block { margin-bottom: 16px; }
        .consent-label { display: flex; gap: 10px; align-items: flex-start; cursor: pointer; font-size: 13px; color: #4b2d7a; line-height: 1.5; }
        .consent-label input[type="checkbox"] { margin-top: 3px; width: 16px; height: 16px; flex-shrink: 0; accent-color: #521880; cursor: pointer; }
        .sig-block { margin-bottom: 16px; }
        .sig-label { display: block; font-size: 11px; text-transform: uppercase; letter-spacing: 0.8px; font-weight: 700; color: #9b59d0; margin-bottom: 6px; }
        .sig-input { width: 100%; padding: 10px 12px; border: 1.5px solid #e9d5ff; border-radius: 8px; font-family: Georgia, serif; font-size: 15px; color: #210936; outline: none; transition: border-color 0.2s; }
        .sig-input:focus { border-color: #7c3aed; }
        .sig-input::placeholder { color: #c4b5fd; font-style: italic; }
    </style>
</head>
<body>
<div class="card">
    <div class="badge">Change Order</div>
    <h1>Contract Amendment</h1>
    <p class="subtitle">${escapeHtml(contractorName)} &bull; Ref: ${escapeHtml(changeOrderId)}</p>
    <div class="amount-box">
        <div class="amount-label">Additional Amount Due</div>
        <div class="amount-value">${totalFormatted}</div>
    </div>
    ${lineItemsHtml}
    ${pdfDataUrl ? `<a href="${pdfDataUrl}" download="ChangeOrder_${escapeHtml(changeOrderId)}.pdf" class="pdf-btn">
        <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
        Download Full PDF
    </a>` : ''}
    ${isApproved
        ? `<div class="approved-banner"><h2>✅ Approved</h2><p>This change order was approved on ${co.approvedAt ? new Date(co.approvedAt).toLocaleDateString('en-US', {year:'numeric',month:'long',day:'numeric'}) : 'record'}.</p></div>`
        : `<div class="consent-block">
             <label class="consent-label">
               <input type="checkbox" id="consentCheck" onchange="updateApproveBtn()" />
               <span>I agree to the updated scope of work and the associated cost increase of <strong>${totalFormatted}</strong>. I understand this constitutes a legally binding electronic signature under the ESIGN Act, and I authorize the contractor to proceed with the outlined scope changes.</span>
             </label>
           </div>
           <div class="sig-block">
             <label for="sigInput" class="sig-label">Electronic Signature — Type Full Legal Name</label>
             <input type="text" id="sigInput" placeholder="Your full legal name" oninput="updateApproveBtn()" class="sig-input" autocomplete="name" />
           </div>
           <button class="approve-btn" id="approveBtn" disabled onclick="approveChangeOrder()">✓ Sign &amp; Approve</button>
           <div id="statusMsg"></div>`
    }
    <div class="ref">${escapeHtml(contractorName)} &bull; Secure approval link</div>
</div>
<script>
function updateApproveBtn() {
    const checked = document.getElementById('consentCheck').checked;
    const name    = document.getElementById('sigInput').value.trim();
    document.getElementById('approveBtn').disabled = !(checked && name.length >= 2);
}
async function approveChangeOrder() {
    const btn            = document.getElementById('approveBtn');
    const msg            = document.getElementById('statusMsg');
    const typedSignature = document.getElementById('sigInput').value.trim();
    if (!typedSignature) return;
    btn.disabled     = true;
    btn.textContent  = 'Processing…';
    msg.textContent  = '';
    try {
        const resp = await fetch('/api/change-orders/approve', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ r: ${JSON.stringify(changeOrderId)}, t: ${JSON.stringify(token)}, typed_signature: typedSignature })
        });
        const data = await resp.json();
        if (!resp.ok) throw new Error(data.error || 'Approval failed.');
        btn.textContent     = '✅ Signed & Approved!';
        btn.style.background = 'linear-gradient(135deg,#065f46,#059669)';
        msg.textContent      = 'Your signature has been recorded. The contractor has been notified.';
        msg.style.color      = '#059669';
    } catch (err) {
        btn.disabled    = false;
        btn.textContent = '✓ Sign & Approve';
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

// ── POST /api/change-orders/approve (public token-gated) ─────────────
router.post('/change-orders/approve', async (req, res) => {
    const { r: changeOrderId, t: token } = req.body;
    if (!changeOrderId || !token) return res.status(400).json({ error: 'Missing required parameters.' });

    try {
        const lookupSnap = await db.collection('approvals').doc(changeOrderId).get();
        if (!lookupSnap.exists) return res.status(404).json({ error: 'Change order not found.' });
        const { userPhone, parentEstimateId } = lookupSnap.data();

        const coRef  = db.collection('users').doc(userPhone)
            .collection('estimates').doc(parentEstimateId)
            .collection('change_orders').doc(changeOrderId);
        const coSnap = await coRef.get();
        if (!coSnap.exists) return res.status(404).json({ error: 'Change order not found.' });
        const co = coSnap.data();

        if (!co.approval_token || co.approval_token !== token) {
            return res.status(403).json({ error: 'Invalid or expired approval token.' });
        }
        if (co.status === 'approved') return res.json({ success: true, already_approved: true });

        const clientIp  = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.ip || 'unknown';
        const approvedAt = new Date().toISOString();

        const documentSnapshot = {
            change_order_id:    changeOrderId,
            change_order_total: co.change_order_total || 0,
            change_summary:     co.change_summary     || '',
            added_materials: (co.added_materials || []).map(m => ({ name: m.name, quantity: m.quantity, unit_price: m.unit_price, total: m.total })),
            added_labor:     (co.added_labor     || []).map(l => ({ role: l.role, hours: l.hours, rate: l.rate, total: l.total })),
        };
        const documentVersionHash = crypto.createHash('sha256')
            .update(JSON.stringify(documentSnapshot))
            .digest('hex');

        await coRef.set({
            status: 'approved', approvedAt,
            approval_record: { ip: clientIp, timestamp: approvedAt, document_version_hash: documentVersionHash },
        }, { merge: true });

        // Notify contractor
        try {
            const notifSnap      = await db.collection('users').doc(userPhone).collection('settings').doc('config').get();
            const notifSettings  = notifSnap.exists ? notifSnap.data() : {};
            const contractorEmail = notifSettings.contact_email || notifSettings.email || process.env.EMAIL_USER;
            const companyName     = notifSettings.company_name || 'Lone Ranger Estimator';
            const totalFormatted  = `$${Number(co.change_order_total || 0).toFixed(2)}`;
            const transporter     = nodemailer.createTransport({
                service: 'gmail',
                auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
            });
            await transporter.sendMail({
                from:    `"${companyName}" <${process.env.EMAIL_USER}>`,
                to:      contractorEmail,
                subject: `✅ Change Order Approved: ${changeOrderId}`,
                text:
                    `Your client has digitally signed and approved the Change Order for ${totalFormatted}.\n\n` +
                    `Audit Trail — Timestamp: ${approvedAt} | IP: ${clientIp}\n` +
                    `Document Hash (SHA-256): ${documentVersionHash}\n\n` +
                    `Change Order ID: ${changeOrderId}`,
                html: `
                    <div style="font-family: Arial, sans-serif; max-width: 600px;">
                        <h2 style="color: #065f46;">✅ Change Order Approved</h2>
                        <p>Your client has digitally signed and approved the Change Order for <strong>${totalFormatted}</strong>.</p>
                        <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 14px 16px; margin: 16px 0; font-size: 13px; color: #14532d; font-family: monospace;">
                            <strong>Audit Trail</strong><br/>
                            Timestamp: ${approvedAt}<br/>
                            IP Address: ${escapeHtml(clientIp)}<br/>
                            SHA-256: ${documentVersionHash}
                        </div>
                        <p style="font-size: 12px; color: #888;">Change Order ID: ${changeOrderId}</p>
                    </div>
                `,
            });
        } catch (notifErr) {
            console.warn(`[approve] contractor notification failed (non-fatal):`, notifErr.message);
        }

        console.log(`[approve] Change order ${changeOrderId} approved. IP: ${clientIp}`);
        res.json({ success: true });
    } catch (err) {
        console.error('[/api/change-orders/approve] error:', err.message);
        res.status(500).json({ error: 'Failed to record approval.' });
    }
});

module.exports = router;
