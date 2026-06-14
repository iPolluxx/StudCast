const express  = require('express');
const puppeteer = require('puppeteer');
const nodemailer = require('nodemailer');
const path = require('path');
const fs   = require('fs');

const { db } = require('../config');
const { loadLedger, saveLedger } = require('../db');
const { requireAuth, requireSubscription } = require('../middleware/auth');
const { sanitizeItemId } = require('../lib/sanitize');
const { escapeHtml } = require('../lib/htmlUtils');

const router = express.Router();

// ── HTML builder ──────────────────────────────────────────────────────
function buildEstimateHtml({
    profile, user, phone,
    materialsArray, laborArray,
    markedUpMaterials, laborSubtotal, wiSalesTax, grandTotal, taxRate,
    clientName, clientAddress, scopeOfWork,
    projectName, estimateNo, paymentTerms,
}) {
    const formattedDate = new Date().toLocaleDateString('en-US', {
        year: 'numeric', month: 'long', day: 'numeric',
    });
    const DEFAULT_PAYMENT_TERMS = '50% deposit required to schedule work, remaining 50% due immediately upon completion.';
    const displayPaymentTerms = (paymentTerms || '').trim() || DEFAULT_PAYMENT_TERMS;
    const displayClientName = (clientName || '').trim() || projectName;
    const displayClientAddressHtml = (clientAddress || '').trim()
        ? escapeHtml(clientAddress.trim())
        : '<span style="color:#6b7280; font-style:italic;">Address not provided</span>';
    const displayScopeOfWork = (scopeOfWork || '').trim() || 'This estimate is based on initial walkthroughs and may be subject to change upon final site inspection.';
    const companyNameToShow  = profile.company_name || user.companyName || 'Lone Ranger Contracting';

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

    return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Estimate ${estimateNo}</title>
    <style>
        body { font-family: 'Inter', system-ui, -apple-system, sans-serif; background: #ffffff; color: #210936; margin: 0; padding: 30px; font-size: 10.5pt; line-height: 1.4; }
        .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 3px solid #521880; padding-bottom: 15px; margin-bottom: 25px; }
        .company-name { font-size: 16pt; font-weight: 800; color: #210936; }
        .estimate-title { font-size: 18pt; font-weight: 800; color: #521880; margin: 0 0 5px 0; }
        .meta-item { font-size: 9pt; color: #9b59d0; margin: 2px 0; text-align: right; }
        .info-grid { display: flex; gap: 20px; margin-bottom: 30px; }
        .info-card { flex: 1; border: 1px solid #e9d5ff; border-radius: 8px; padding: 12px 15px; background: #faf7fd; }
        .info-title { font-size: 8.5pt; font-weight: 700; text-transform: uppercase; color: #521880; margin: 0 0 8px 0; border-bottom: 1px solid #e9d5ff; padding-bottom: 4px; }
        .info-text { font-size: 9.5pt; margin: 3px 0; color: #210936; }
        .section-title { font-size: 10.5pt; font-weight: 700; text-transform: uppercase; color: #210936; margin: 20px 0 10px 0; padding-bottom: 4px; border-bottom: 2px solid #521880; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
        th { background: #210936; color: #ffffff; font-size: 8.5pt; font-weight: 600; text-transform: uppercase; padding: 6px 10px; text-align: left; }
        .text-right { text-align: right; }
        .text-center { text-align: center; }
        .totals-table { width: 45%; margin-left: auto; margin-top: 15px; margin-bottom: 30px; }
        .totals-table td { padding: 6px 10px; font-size: 9.5pt; border-bottom: 1px solid #e9d5ff; }
        .totals-table tr.grand-total { background: #210936; color: #ffffff; font-weight: 700; }
        .totals-table tr.grand-total td { border-bottom: none; color: #e9d5ff; font-size: 11pt; }
        .terms-box { font-size: 8.5pt; color: #6b7280; border-top: 1px solid #e9d5ff; padding-top: 15px; margin-top: 40px; line-height: 1.5; }
        .signature-section { margin-top: 40px; display: flex; gap: 40px; }
        .signature-card { flex: 1; }
        .signature-line { border-top: 1px solid #1a0729; margin-top: 40px; padding-top: 5px; font-size: 8.5pt; text-align: center; color: #521880; font-weight: 600; }
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
        <thead><tr><th>Description</th><th class="text-right" style="width: 60px;">Qty</th><th style="width: 60px;">Unit</th><th class="text-right" style="width: 100px;">Unit Price</th><th class="text-right" style="width: 110px;">Total</th></tr></thead>
        <tbody>${materialsRows}</tbody>
    </table>
    <h2 class="section-title">Crew & Labor</h2>
    <table>
        <thead><tr><th>Role / Task</th><th class="text-right" style="width: 60px;">Hours</th><th style="width: 60px;">Unit</th><th class="text-right" style="width: 100px;">Rate/Hr</th><th class="text-right" style="width: 110px;">Total</th></tr></thead>
        <tbody>${laborRows}</tbody>
    </table>
    <table class="totals-table">
        <tbody>
            <tr><td>Materials Subtotal ${profile.global_markup_percent ? `(includes ${profile.global_markup_percent}% markup)` : ''}</td><td class="text-right">$${markedUpMaterials.toFixed(2)}</td></tr>
            <tr><td>Labor Subtotal</td><td class="text-right">$${laborSubtotal.toFixed(2)}</td></tr>
            <tr><td>Sales Tax (${taxRate.toFixed(1)}% on Materials)</td><td class="text-right">$${wiSalesTax.toFixed(2)}</td></tr>
            <tr class="grand-total"><td><strong>Grand Total</strong></td><td class="text-right"><strong>$${grandTotal.toFixed(2)}</strong></td></tr>
        </tbody>
    </table>
    <div class="terms-box">
        <strong>Payment Terms:</strong> ${escapeHtml(displayPaymentTerms)}
        <br><strong>Validity:</strong> This estimate is valid for 30 days from the date of issuance.
    </div>
    <div class="signature-section">
        <div class="signature-card"><div class="signature-line">Contractor Signature</div></div>
        <div class="signature-card"><div class="signature-line">Client Acceptance Signature</div></div>
    </div>
    <div style="margin-top: 40px; border-top: 1px solid #e9d5ff; padding-top: 10px; font-size: 8pt; color: #9b59d0; display: flex; justify-content: space-between;">
        <span>&copy; ${new Date().getFullYear()} ${escapeHtml(companyNameToShow)}</span>
        ${profile.license_number ? `<span>License: ${escapeHtml(profile.license_number)}</span>` : ''}
    </div>
</body>
</html>`;
}

// ── Shared: load profile from Firestore ───────────────────────────────
async function loadProfile(phone) {
    const defaults = {
        company_name: '', company_address: '', company_logo_url: '',
        license_number: '', contact_email: '',
        default_labor_rate: 55, global_markup_percent: 0, tax_rate: 5.5,
    };
    try {
        const snap = await db.collection('users').doc(phone).collection('settings').doc('config').get();
        if (snap.exists) return { ...defaults, ...snap.data() };
    } catch (err) {
        console.warn(`[${phone}] pdf: failed to load profile, using defaults.`, err.message);
    }
    return defaults;
}

// ── Shared: compute financials ────────────────────────────────────────
function computeFinancials(items, profile) {
    const materialsArray    = items.filter(i => i.type === 'material' || !i.role);
    const laborArray        = items.filter(i => i.type === 'labor'    || i.role);
    const materialsSubtotal = materialsArray.reduce((s, m) => s + (Number(m.total) || 0), 0);
    const laborSubtotal     = laborArray.reduce((s, l)     => s + (Number(l.total) || 0), 0);
    const markedUpMaterials = materialsSubtotal * (1 + (profile.global_markup_percent || 0) / 100);
    const taxRate           = profile.tax_rate != null ? Number(profile.tax_rate) : 5.5;
    const wiSalesTax        = Math.round(markedUpMaterials * (taxRate / 100) * 100) / 100;
    const grandTotal        = Math.round((markedUpMaterials + laborSubtotal + wiSalesTax) * 100) / 100;
    return { materialsArray, laborArray, markedUpMaterials, laborSubtotal, wiSalesTax, grandTotal, taxRate };
}

// ── POST /api/generate-pdf ─────────────────────────────────────────────
router.post('/generate-pdf', requireAuth, requireSubscription, async (req, res) => {
    const phone       = req.userPhone;
    const projectName = req.body.projectName;
    const clientProject = req.body.project;
    const paymentTerms  = req.body.payment_terms;

    if (!projectName) return res.status(400).json({ error: 'Missing projectName' });

    const user    = req.authedUser;
    const profile = await loadProfile(phone);

    const contractorEmail = (profile.contact_email || user.email || '').trim();
    if (!contractorEmail) {
        console.error(`[${phone}] generate-pdf: no email address on file.`);
        return res.status(400).json({ error: 'No email address on file for this user' });
    }

    let items = [], clientName = null, clientAddress = null, scopeOfWork = null;

    if (clientProject) {
        const mats = (clientProject.materials || []).map(m => ({ ...m, type: 'material' }));
        const lab  = (clientProject.labor     || []).map(l => ({ ...l, type: 'labor'    }));
        items         = [...mats, ...lab];
        clientName    = clientProject.client_name    || null;
        clientAddress = clientProject.client_address || null;
        scopeOfWork   = clientProject.scope_of_work  || null;
    } else {
        const estimateSnap = await db.collection('users').doc(phone).collection('estimates').doc(projectName).get();
        if (estimateSnap.exists) {
            const data    = estimateSnap.data();
            items         = data.items            || [];
            clientName    = data.client_name      || null;
            clientAddress = data.client_address   || null;
            scopeOfWork   = data.scope_of_work    || null;
        } else {
            const legacyLedger = await loadLedger(phone);
            const legacyProj   = legacyLedger[projectName];
            if (legacyProj) {
                const mats = (legacyProj.materials || []).map(m => ({ ...m, type: 'material' }));
                const lab  = (legacyProj.labor     || []).map(l => ({ ...l, type: 'labor'    }));
                items = [...mats, ...lab];
            }
        }
    }

    const { materialsArray, laborArray, markedUpMaterials, laborSubtotal, wiSalesTax, grandTotal, taxRate } = computeFinancials(items, profile);

    // Increment estimate counter
    let estimateNo = '';
    try {
        const counterRef = db.collection('users').doc(phone).collection('settings').doc('config');
        const nextCount  = await db.runTransaction(async (transaction) => {
            const doc   = await transaction.get(counterRef);
            let count   = doc.exists ? (doc.data().estimateCount || 0) : 0;
            count += 1;
            transaction.set(counterRef, { estimateCount: count }, { merge: true });
            return count;
        });
        estimateNo = `EST-${new Date().getFullYear()}-${String(nextCount).padStart(4, '0')}`;
    } catch (counterErr) {
        console.error(`[${phone}] Failed to increment estimate counter:`, counterErr.message);
        estimateNo = `EST-${new Date().getFullYear()}-${Date.now().toString().slice(-4)}`;
    }

    // Self-teaching price_book
    const materialsToLearn = materialsArray.filter(m => m.name && m.unit_price != null);
    if (materialsToLearn.length > 0) {
        await Promise.all(
            materialsToLearn.map(m =>
                db.collection('users').doc(phone)
                  .collection('price_book').doc(sanitizeItemId(m.name))
                  .set({ name: m.name, price: Number(m.unit_price) }, { merge: true })
                  .catch(err => console.warn(`[price_book] Write failed for "${m.name}":`, err.message))
            )
        );
    }

    const htmlContent = buildEstimateHtml({
        profile, user, phone,
        materialsArray, laborArray,
        markedUpMaterials, laborSubtotal, wiSalesTax, grandTotal, taxRate,
        clientName, clientAddress, scopeOfWork,
        projectName, estimateNo, paymentTerms,
    });

    const estimateIdClean = projectName.replace(/[^a-zA-Z0-9_-]/g, '_');
    const pdfFilename     = `Estimate_${estimateIdClean}_${Date.now()}.pdf`;
    const pdfPath         = path.join('/tmp', pdfFilename);
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
        fs.writeFileSync(pdfPath, pdfBuffer);
        await browser.close();
        browser = null;

        const companyName = profile.company_name || user.companyName || 'Lone Ranger Contracting';
        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
        });
        await transporter.sendMail({
            from:    `"${companyName}" <${process.env.EMAIL_USER}>`,
            to:      contractorEmail,
            subject: `Estimate ${estimateNo}: ${projectName}`,
            text:    `Hello,\n\nPlease find attached the final estimate for "${projectName}" (Estimate ${estimateNo}).\n\nGrand Total: $${grandTotal.toFixed(2)}\n\nThank you,\n${companyName}`,
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px;">
                    <h2 style="color: #1e2533;">${escapeHtml(companyName)}</h2>
                    <p>Please find attached the final estimate for <strong>"${escapeHtml(projectName)}"</strong>.</p>
                    <p>Estimate Number: <strong>${estimateNo}</strong></p>
                    <p style="font-size: 20px; font-weight: bold; color: #521880;">Grand Total: $${grandTotal.toFixed(2)}</p>
                    <p>Thank you,<br/>${escapeHtml(companyName)}</p>
                </div>
            `,
            attachments: [{ filename: `Estimate_${estimateNo}.pdf`, path: pdfPath }],
        });

        // Clean up legacy ledger entry if present
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
        if (browser) { try { await browser.close(); } catch (_) {} }
        if (pdfPath && fs.existsSync(pdfPath)) {
            try { fs.unlinkSync(pdfPath); } catch (_) {}
        }
    }
});

// ── POST /api/preview-pdf ─────────────────────────────────────────────
router.post('/preview-pdf', requireAuth, requireSubscription, async (req, res) => {
    const phone = req.userPhone;
    const { projectName, project: clientProject, payment_terms: paymentTerms } = req.body;
    if (!projectName) return res.status(400).json({ error: 'Missing projectName' });

    const user    = req.authedUser;
    const profile = await loadProfile(phone);

    let items = [], clientName = null, clientAddress = null, scopeOfWork = null;
    if (clientProject) {
        const mats = (clientProject.materials || []).map(m => ({ ...m, type: 'material' }));
        const lab  = (clientProject.labor     || []).map(l => ({ ...l, type: 'labor'    }));
        items         = [...mats, ...lab];
        clientName    = clientProject.client_name    || null;
        clientAddress = clientProject.client_address || null;
        scopeOfWork   = clientProject.scope_of_work  || null;
    }

    const { materialsArray, laborArray, markedUpMaterials, laborSubtotal, wiSalesTax, grandTotal, taxRate } = computeFinancials(items, profile);

    try {
        const html = buildEstimateHtml({
            profile, user, phone,
            materialsArray, laborArray,
            markedUpMaterials, laborSubtotal, wiSalesTax, grandTotal, taxRate,
            clientName, clientAddress, scopeOfWork,
            projectName, estimateNo: 'PREVIEW', paymentTerms,
        });
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.send(html);
    } catch (err) {
        console.error(`[${phone}] preview-pdf error:`, err.message);
        res.status(500).json({ error: 'Failed to generate preview' });
    }
});

module.exports = router;
