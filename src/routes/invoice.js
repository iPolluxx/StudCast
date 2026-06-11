const express    = require('express');
const puppeteer  = require('puppeteer');
const nodemailer = require('nodemailer');
const { FieldValue } = require('@google-cloud/firestore');

const { db }   = require('../config');
const { requireAuth, requireSubscription } = require('../middleware/auth');
const { calculateInvoice } = require('../lib/invoiceCalc');
const { escapeHtml } = require('../lib/htmlUtils');

const router = express.Router();

// ── renderInvoicePdf ──────────────────────────────────────────────────
async function renderInvoicePdf(invoiceData, estimateData, contractorSettings) {
    const {
        invoice_number, invoice_date, due_date, payment_terms, payment_method_note,
        balance_due, estimate_total, approved_co_total, deposit_amount,
        client_name, client_address, scope_of_work,
    } = invoiceData;
    const { project_name, items = [] } = estimateData;
    const companyName   = contractorSettings.company_name    || 'Lone Ranger Contracting';
    const licenseNumber = contractorSettings.license_number  || '';
    const companyAddress = contractorSettings.company_address || '';

    const materialItems = items.filter(i => i && (i.type === 'material' || (!i.type && !i.role)));
    const laborItems    = items.filter(i => i && (i.type === 'labor'    || (!i.type && i.role)));

    const materialsSubtotal = materialItems.reduce((s, i) => s + (Number(i.total) || 0), 0);
    const laborSubtotal     = laborItems.reduce((s, i)    => s + (Number(i.total) || 0), 0);

    const fmtDate     = (d) => new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    const fmtCurrency = (n) => `$${Number(n || 0).toFixed(2)}`;
    const paymentTermsLabel = payment_terms === 'net_15' ? 'Net 15' : payment_terms === 'net_30' ? 'Net 30' : 'Due on Receipt';

    const materialRowsHtml = materialItems.map(i => `
      <tr>
        <td>${escapeHtml(i.name || 'Material')}</td>
        <td class="amount">${Number(i.quantity) || 0} ${escapeHtml(i.unit || '')}</td>
        <td class="amount">${fmtCurrency(i.unit_price)}</td>
        <td class="amount">${fmtCurrency(i.total)}</td>
      </tr>`).join('');

    const laborRowsHtml = laborItems.map(i => `
      <tr>
        <td>${escapeHtml(i.role || 'Labor')}</td>
        <td class="amount">${Number(i.hours) || 0}</td>
        <td class="amount">${fmtCurrency(i.rate)}/hr</td>
        <td class="amount">${fmtCurrency(i.total)}</td>
      </tr>`).join('');

    const htmlContent = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  body { font-family: Arial, sans-serif; font-size: 10pt; color: #1e2533; margin: 0; padding: 20px; }
  h1 { font-size: 18pt; color: #521880; margin: 0 0 4px 0; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px; border-bottom: 2px solid #521880; padding-bottom: 12px; }
  .section { margin-bottom: 14px; }
  .label { font-size: 8pt; color: #888; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 2px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 12px; }
  th { background: #f3e8ff; padding: 8px 10px; text-align: left; font-size: 9pt; }
  td { padding: 7px 10px; border-bottom: 1px solid #e9d5ff; font-size: 9.5pt; }
  .amount { text-align: right; }
  .total-row td { font-weight: bold; background: #f3e8ff; }
  .balance-due { font-size: 20pt; font-weight: bold; color: #521880; margin: 14px 0 8px 0; }
  .footer { font-size: 8pt; color: #888; text-align: center; margin-top: 24px; border-top: 1px solid #e9d5ff; padding-top: 8px; }
</style>
</head>
<body>
<div class="header">
  <div>
    <h1>INVOICE</h1>
    <div style="font-weight:bold;">${escapeHtml(companyName)}</div>
    ${companyAddress ? `<div style="font-size:9pt;">${escapeHtml(companyAddress)}</div>` : ''}
    ${licenseNumber ? `<div style="color:#521880;font-size:8.5pt;">License: ${escapeHtml(licenseNumber)}</div>` : ''}
  </div>
  <div style="text-align:right;font-size:9.5pt;">
    <div><strong>Invoice #:</strong> ${escapeHtml(invoice_number)}</div>
    <div><strong>Invoice Date:</strong> ${fmtDate(invoice_date)}</div>
    <div><strong>Due Date:</strong> ${fmtDate(due_date)}</div>
    <div><strong>Terms:</strong> ${escapeHtml(paymentTermsLabel)}</div>
  </div>
</div>
<div style="display:flex;justify-content:space-between;margin-bottom:16px;">
  <div class="section">
    <div class="label">Bill To</div>
    <div style="font-weight:bold;">${escapeHtml(client_name || 'Client')}</div>
    ${client_address ? `<div style="font-size:9pt;">${escapeHtml(client_address)}</div>` : ''}
  </div>
  <div class="section" style="text-align:right;">
    <div class="label">Project</div>
    <div style="font-size:9.5pt;">${escapeHtml(project_name || '')}</div>
  </div>
</div>
${scope_of_work ? `<div class="section"><div class="label">Scope of Work</div><p style="font-size:9.5pt;font-style:italic;margin:2px 0;">${escapeHtml(scope_of_work)}</p></div>` : ''}
${materialItems.length > 0 ? `
<div class="label">Materials</div>
<table>
  <thead><tr><th>Description</th><th class="amount">Qty</th><th class="amount">Unit Price</th><th class="amount">Line Total</th></tr></thead>
  <tbody>
    ${materialRowsHtml}
    <tr class="total-row"><td colspan="3">Materials Subtotal</td><td class="amount">${fmtCurrency(materialsSubtotal)}</td></tr>
  </tbody>
</table>` : ''}
${laborItems.length > 0 ? `
<div class="label">Labor</div>
<table>
  <thead><tr><th>Role</th><th class="amount">Hours</th><th class="amount">Rate</th><th class="amount">Line Total</th></tr></thead>
  <tbody>
    ${laborRowsHtml}
    <tr class="total-row"><td colspan="3">Labor Subtotal</td><td class="amount">${fmtCurrency(laborSubtotal)}</td></tr>
  </tbody>
</table>` : ''}
<div class="label">Summary</div>
<table>
  <thead><tr><th>Description</th><th class="amount">Amount</th></tr></thead>
  <tbody>
    <tr><td>Materials Subtotal</td><td class="amount">${fmtCurrency(materialsSubtotal)}</td></tr>
    <tr><td>Labor Subtotal</td><td class="amount">${fmtCurrency(laborSubtotal)}</td></tr>
    ${approved_co_total > 0 ? `<tr><td>Approved Change Orders</td><td class="amount">${fmtCurrency(approved_co_total)}</td></tr>` : ''}
    <tr class="total-row"><td>Estimate Total</td><td class="amount">${fmtCurrency(estimate_total)}</td></tr>
    <tr><td>Deposit Paid</td><td class="amount">(${fmtCurrency(deposit_amount)})</td></tr>
  </tbody>
</table>
<div class="balance-due">Balance Due: ${fmtCurrency(balance_due)}</div>
${payment_method_note ? `<div class="section"><div class="label">Payment Instructions</div><p style="font-size:9.5pt;margin:2px 0;">${escapeHtml(payment_method_note)}</p></div>` : ''}
<div class="footer">&copy; ${new Date().getFullYear()} ${escapeHtml(companyName)}${licenseNumber ? ` &bull; License: ${escapeHtml(licenseNumber)}` : ''}</div>
</body>
</html>`;

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

// ── POST /api/estimates/:id/generate-invoice ──────────────────────────
router.post('/estimates/:id/generate-invoice', requireAuth, requireSubscription, async (req, res) => {
    const userPhone  = req.userPhone;
    const estimateId = req.params.id;
    const { payment_terms, payment_method_note } = req.body;

    try {
        const estimateRef  = db.collection('users').doc(userPhone).collection('estimates').doc(estimateId);
        const estimateSnap = await estimateRef.get();
        if (!estimateSnap.exists) return res.status(404).json({ error: 'Estimate not found.' });
        const estimateData = estimateSnap.data();
        const { total_amount, client_name, client_phone: clientPhone, client_address, scope_of_work, items = [] } = estimateData;
        const deposit_amount = estimateData.deposit_amount || 0;

        const configRef  = db.collection('users').doc(userPhone).collection('settings').doc('config');
        const configSnap = await configRef.get();
        const contractorSettings = configSnap.exists ? configSnap.data() : {};

        // Increment invoiceCount
        let invoice_number;
        try {
            const nextCount = await db.runTransaction(async (transaction) => {
                const doc   = await transaction.get(configRef);
                let count   = doc.exists ? (doc.data().invoiceCount || 0) : 0;
                count += 1;
                transaction.set(configRef, { invoiceCount: count }, { merge: true });
                return count;
            });
            invoice_number = `INV-${new Date().getFullYear()}-${String(nextCount).padStart(4, '0')}`;
        } catch (counterErr) {
            console.error(`[${userPhone}] Failed to increment invoiceCount:`, counterErr.message);
            invoice_number = `INV-${new Date().getFullYear()}-${Date.now().toString().slice(-4)}`;
        }

        // Sum approved change orders
        const coSnap = await db.collection('users').doc(userPhone)
            .collection('estimates').doc(estimateId)
            .collection('change_orders').where('status', '==', 'approved').get();
        const approved_co_total = coSnap.docs.reduce((sum, d) => sum + (d.data().change_order_total || 0), 0);

        const { balance_due } = calculateInvoice({ total_amount, approved_co_total, deposit_amount });

        const now = new Date();
        let due_date;
        if (payment_terms === 'net_15')     due_date = new Date(now.getTime() + 15 * 24 * 60 * 60 * 1000);
        else if (payment_terms === 'net_30') due_date = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
        else                                 due_date = now;

        const invoiceData = {
            invoice_number, invoice_date: now, due_date,
            payment_terms, payment_method_note,
            balance_due, estimate_total: total_amount,
            approved_co_total, deposit_amount,
            client_name, client_address, scope_of_work,
        };
        const pdfBase64 = await renderInvoicePdf(invoiceData, estimateData, contractorSettings);

        const invoiceRef = db.collection('users').doc(userPhone)
            .collection('estimates').doc(estimateId)
            .collection('invoice').doc('final');
        await invoiceRef.set({
            invoice_number, invoice_date: FieldValue.serverTimestamp(), due_date,
            payment_terms, payment_method_note, balance_due,
            estimate_total: total_amount, approved_co_total, deposit_amount,
            status: 'sent', sent_at: FieldValue.serverTimestamp(), pdf_base64: pdfBase64,
        }, { merge: true });

        await estimateRef.set({ status: 'invoiced' }, { merge: true });

        // Email PDF to contractor
        const user = req.authedUser;
        const contractorEmail = (contractorSettings.contact_email || user.email || '').trim();
        if (contractorEmail) {
            const transporter = nodemailer.createTransport({
                service: 'gmail',
                auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
            });
            await transporter.sendMail({
                from:    `"${user.companyName}" <${process.env.EMAIL_USER}>`,
                to:      contractorEmail,
                subject: `Invoice ${invoice_number}: ${estimateData.project_name || 'Project'}`,
                text:    `Hello,\n\nPlease find attached Invoice ${invoice_number}.\n\nBalance Due: $${balance_due.toFixed(2)}\n\nThank you,\n${user.companyName}`,
                html: `
                    <div style="font-family: Arial, sans-serif; max-width: 600px;">
                        <h2 style="color: #1e2533;">${user.companyName}</h2>
                        <p>Please find attached <strong>Invoice ${invoice_number}</strong> for project <strong>${estimateData.project_name || ''}</strong>.</p>
                        <p style="font-size: 20px; font-weight: bold; color: #521880;">Balance Due: $${balance_due.toFixed(2)}</p>
                        <p>Thank you,<br/>${user.companyName}</p>
                    </div>
                `,
                attachments: [{ filename: `Invoice_${invoice_number}.pdf`, content: Buffer.from(pdfBase64, 'base64') }],
            });
        }

        res.json({ success: true, balance_due, invoice_number });
    } catch (err) {
        console.error(`[${userPhone}] generate-invoice error:`, err.message);
        res.status(500).json({ error: err.message || 'Failed to generate invoice.' });
    }
});

module.exports = router;
