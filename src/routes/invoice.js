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
        mat_subtotal = 0, markup_pct = 0, markup_amount = 0, marked_up_mat = 0,
        lab_subtotal = 0, sales_tax = 0, tax_rate_pct = 0,
    } = invoiceData;
    const { project_name, items = [] } = estimateData;
    const companyName    = contractorSettings.company_name    || 'Lone Ranger Contracting';
    const licenseNumber  = contractorSettings.license_number  || '';
    const companyAddress = contractorSettings.company_address || '';
    const companyEmail   = contractorSettings.contact_email   || '';

    let logoHtml = '';
    if (contractorSettings.company_logo_url && (contractorSettings.company_logo_url.startsWith('https://') || contractorSettings.company_logo_url.startsWith('data:image/'))) {
        logoHtml = `<img src="${escapeHtml(contractorSettings.company_logo_url)}" style="max-height:50px;max-width:150px;object-fit:contain;" />`;
    } else {
        const initials = companyName.substring(0, 2).toUpperCase();
        logoHtml = `<div style="width:50px;height:50px;border-radius:50%;background:#521880;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:14pt;border:2px solid #210936;">${initials}</div>`;
    }

    const materialItems = items.filter(i => i && (i.type === 'material' || (!i.type && !i.role)));
    const laborItems    = items.filter(i => i && (i.type === 'labor'    || (!i.type && i.role)));

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
<title>Invoice ${escapeHtml(invoice_number)}</title>
<style>
  body { font-family: 'Inter', system-ui, -apple-system, sans-serif; background: #ffffff; color: #210936; margin: 0; padding: 30px; font-size: 10.5pt; line-height: 1.4; }
  .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 3px solid #521880; padding-bottom: 15px; margin-bottom: 25px; }
  .company-name { font-size: 16pt; font-weight: 800; color: #210936; }
  .invoice-title { font-size: 18pt; font-weight: 800; color: #521880; margin: 0 0 5px 0; }
  .meta-item { font-size: 9pt; color: #9b59d0; margin: 2px 0; text-align: right; }
  .info-grid { display: flex; gap: 20px; margin-bottom: 25px; }
  .info-card { flex: 1; border: 1px solid #e9d5ff; border-radius: 8px; padding: 12px 15px; background: #faf7fd; }
  .info-title { font-size: 8.5pt; font-weight: 700; text-transform: uppercase; color: #521880; margin: 0 0 8px 0; border-bottom: 1px solid #e9d5ff; padding-bottom: 4px; }
  .info-text { font-size: 9.5pt; margin: 3px 0; color: #210936; }
  .section-title { font-size: 10.5pt; font-weight: 700; text-transform: uppercase; color: #210936; margin: 20px 0 10px 0; padding-bottom: 4px; border-bottom: 2px solid #521880; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 12px; }
  th { background: #210936; color: #ffffff; font-size: 8.5pt; font-weight: 600; text-transform: uppercase; padding: 6px 10px; text-align: left; }
  td { padding: 8px 10px; border-bottom: 1px solid #e9d5ff; font-size: 9.5pt; }
  .amount { text-align: right; }
  .subtotal-row td { font-weight: 700; background: #faf7fd; }
  .summary-table { width: 55%; margin-left: auto; margin-top: 10px; }
  .summary-table td { padding: 6px 10px; font-size: 9.5pt; border-bottom: 1px solid #e9d5ff; }
  .summary-table tr.estimate-total td { font-weight: 700; }
  .balance-box { margin-top: 18px; margin-left: auto; width: 55%; background: #210936; border-radius: 10px; padding: 16px 20px; display: flex; justify-content: space-between; align-items: center; }
  .balance-box .label { font-size: 9pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: #e9d5ff; }
  .balance-box .value { font-size: 20pt; font-weight: 900; color: #ffffff; }
  .terms-box { font-size: 8.5pt; color: #6b7280; border-top: 1px solid #e9d5ff; padding-top: 15px; margin-top: 35px; line-height: 1.5; }
  .pay-box { background: #faf7fd; border: 1px solid #e9d5ff; border-radius: 8px; padding: 12px 15px; margin-top: 18px; }
  .footer { font-size: 8pt; color: #9b59d0; text-align: center; margin-top: 35px; border-top: 1px solid #e9d5ff; padding-top: 10px; }
</style>
</head>
<body>
  <div class="header">
    <div style="display:flex; align-items:center; gap:15px;">
      ${logoHtml}
      <div class="company-name">${escapeHtml(companyName)}</div>
    </div>
    <div>
      <h1 class="invoice-title">Invoice</h1>
      <div class="meta-item"><strong>Number:</strong> ${escapeHtml(invoice_number)}</div>
      <div class="meta-item"><strong>Date:</strong> ${fmtDate(invoice_date)}</div>
      <div class="meta-item"><strong>Due:</strong> ${fmtDate(due_date)}</div>
      <div class="meta-item"><strong>Terms:</strong> ${escapeHtml(paymentTermsLabel)}</div>
    </div>
  </div>

  <div class="info-grid">
    <div class="info-card">
      <h2 class="info-title">Bill To</h2>
      <p class="info-text"><strong>${escapeHtml(client_name || 'Client')}</strong></p>
      ${client_address ? `<p class="info-text">${escapeHtml(client_address)}</p>` : ''}
    </div>
    <div class="info-card">
      <h2 class="info-title">From</h2>
      <p class="info-text"><strong>${escapeHtml(companyName)}</strong></p>
      ${companyAddress ? `<p class="info-text">${escapeHtml(companyAddress)}</p>` : ''}
      ${companyEmail ? `<p class="info-text">Email: ${escapeHtml(companyEmail)}</p>` : ''}
      ${licenseNumber ? `<p class="info-text" style="font-size:8.3pt;color:#521880;margin-top:5px;">License: ${escapeHtml(licenseNumber)}</p>` : ''}
    </div>
  </div>

  ${project_name ? `<div class="info-card" style="margin-bottom:20px;"><h2 class="info-title">Project</h2><p class="info-text">${escapeHtml(project_name)}</p>${scope_of_work ? `<p class="info-text" style="font-style:italic;color:#4b2d7a;">${escapeHtml(scope_of_work)}</p>` : ''}</div>` : ''}

  ${materialItems.length > 0 ? `
  <div class="section-title">Materials</div>
  <table>
    <thead><tr><th>Description</th><th class="amount">Qty</th><th class="amount">Unit Price</th><th class="amount">Line Total</th></tr></thead>
    <tbody>
      ${materialRowsHtml}
      <tr class="subtotal-row"><td colspan="3">Materials Subtotal</td><td class="amount">${fmtCurrency(materialsSubtotal)}</td></tr>
    </tbody>
  </table>` : ''}

  ${laborItems.length > 0 ? `
  <div class="section-title">Labor</div>
  <table>
    <thead><tr><th>Role</th><th class="amount">Hours</th><th class="amount">Rate</th><th class="amount">Line Total</th></tr></thead>
    <tbody>
      ${laborRowsHtml}
      <tr class="subtotal-row"><td colspan="3">Labor Subtotal</td><td class="amount">${fmtCurrency(laborSubtotal)}</td></tr>
    </tbody>
  </table>` : ''}

  <table class="summary-table">
    <tbody>
      <tr><td>Materials Subtotal${markup_pct > 0 ? ` (incl. ${markup_pct}% markup)` : ''}</td><td class="amount">${fmtCurrency(marked_up_mat > 0 ? marked_up_mat : mat_subtotal)}</td></tr>
      <tr><td>Labor Subtotal</td><td class="amount">${fmtCurrency(lab_subtotal)}</td></tr>
      ${sales_tax > 0 ? `<tr><td>Sales Tax (${Number(tax_rate_pct).toFixed(1)}%)</td><td class="amount">${fmtCurrency(sales_tax)}</td></tr>` : ''}
      ${approved_co_total > 0 ? `<tr><td>Approved Change Orders</td><td class="amount">${fmtCurrency(approved_co_total)}</td></tr>` : ''}
      <tr class="estimate-total"><td>Estimate Total</td><td class="amount">${fmtCurrency(estimate_total)}</td></tr>
      <tr><td>Deposit Paid</td><td class="amount">(${fmtCurrency(deposit_amount)})</td></tr>
    </tbody>
  </table>

  <div class="balance-box">
    <span class="label">Balance Due</span>
    <span class="value">${fmtCurrency(balance_due)}</span>
  </div>

  ${payment_method_note ? `<div class="pay-box"><div class="info-title" style="border:none;padding:0;margin-bottom:4px;">Payment Instructions</div><p class="info-text" style="margin:0;">${escapeHtml(payment_method_note)}</p></div>` : ''}

  <div class="terms-box">
    <strong>Payment Terms:</strong> ${escapeHtml(paymentTermsLabel)}. Please reference invoice number ${escapeHtml(invoice_number)} with your payment. Thank you for your business.
  </div>

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
    const { payment_terms, payment_method_note, deposit_amount: bodyDeposit } = req.body;

    try {
        const estimateRef  = db.collection('users').doc(userPhone).collection('estimates').doc(estimateId);
        const estimateSnap = await estimateRef.get();
        if (!estimateSnap.exists) return res.status(404).json({ error: 'Estimate not found.' });
        const estimateData = estimateSnap.data();
        const { client_name, client_phone: clientPhone, client_address, scope_of_work } = estimateData;
        const deposit_amount = bodyDeposit != null ? (Number(bodyDeposit) || 0) : (estimateData.deposit_amount || 0);

        const configRef  = db.collection('users').doc(userPhone).collection('settings').doc('config');
        const configSnap = await configRef.get();
        const contractorSettings = configSnap.exists ? configSnap.data() : {};

        // Compute financials with markup + tax — mirrors the estimate PDF's computeFinancials()
        const rawItems    = estimateData.items || [];
        const markupPct   = Number(contractorSettings.global_markup_percent) || 0;
        const taxRatePct  = contractorSettings.tax_rate != null ? Number(contractorSettings.tax_rate) : 5.5;
        const matRawItems = rawItems.filter(i => i && (i.type === 'material' || (!i.type && !i.role)));
        const labRawItems = rawItems.filter(i => i && (i.type === 'labor'    || (!i.type && i.role)));
        const matSubtotal = matRawItems.reduce((s, i) => s + (Number(i.total) || 0), 0);
        const labSubtotal = labRawItems.reduce((s, i) => s + (Number(i.total) || 0), 0);
        const markedUpMat = matSubtotal * (1 + markupPct / 100);
        const salesTax    = Math.round(markedUpMat * (taxRatePct / 100) * 100) / 100;
        const grandTotal  = Math.round((markedUpMat + labSubtotal + salesTax) * 100) / 100;

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

        const { balance_due } = calculateInvoice({ total_amount: grandTotal, approved_co_total, deposit_amount });

        const now = new Date();
        let due_date;
        if (payment_terms === 'net_15')     due_date = new Date(now.getTime() + 15 * 24 * 60 * 60 * 1000);
        else if (payment_terms === 'net_30') due_date = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
        else                                 due_date = now;

        const invoiceData = {
            invoice_number, invoice_date: now, due_date,
            payment_terms, payment_method_note,
            balance_due, estimate_total: grandTotal,
            approved_co_total, deposit_amount,
            client_name, client_address, scope_of_work,
            // Financial breakdown for the PDF summary table
            mat_subtotal:  Math.round(matSubtotal * 100) / 100,
            markup_pct:    markupPct,
            markup_amount: Math.round((markedUpMat - matSubtotal) * 100) / 100,
            marked_up_mat: Math.round(markedUpMat * 100) / 100,
            lab_subtotal:  Math.round(labSubtotal * 100) / 100,
            sales_tax:     salesTax,
            tax_rate_pct:  taxRatePct,
        };
        const pdfBase64 = await renderInvoicePdf(invoiceData, estimateData, contractorSettings);

        const invoiceRef = db.collection('users').doc(userPhone)
            .collection('estimates').doc(estimateId)
            .collection('invoice').doc('final');
        await invoiceRef.set({
            invoice_number, invoice_date: FieldValue.serverTimestamp(), due_date,
            payment_terms, payment_method_note, balance_due,
            estimate_total: grandTotal, approved_co_total, deposit_amount,
            status: 'sent', sent_at: FieldValue.serverTimestamp(), pdf_base64: pdfBase64,
        }, { merge: true });

        await estimateRef.set({ status: 'invoiced' }, { merge: true });

        // Email PDF to contractor
        const user = req.authedUser;
        const companyName = contractorSettings.company_name || user.companyName || 'Lone Ranger Contracting';
        const contractorEmail = (contractorSettings.contact_email || user.email || '').trim();
        if (contractorEmail) {
            const transporter = nodemailer.createTransport({
                service: 'gmail',
                auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
            });
            await transporter.sendMail({
                from:    `"${companyName}" <${process.env.EMAIL_USER}>`,
                to:      contractorEmail,
                subject: `Invoice ${invoice_number}: ${estimateData.project_name || 'Project'}`,
                text:    `Hello,\n\nPlease find attached Invoice ${invoice_number}.\n\nBalance Due: $${balance_due.toFixed(2)}\n\nThank you,\n${companyName}`,
                html: `
                    <div style="font-family: Arial, sans-serif; max-width: 600px;">
                        <h2 style="color: #1e2533;">${escapeHtml(companyName)}</h2>
                        <p>Please find attached <strong>Invoice ${escapeHtml(invoice_number)}</strong> for project <strong>${escapeHtml(estimateData.project_name || '')}</strong>.</p>
                        <p style="font-size: 20px; font-weight: bold; color: #521880;">Balance Due: $${balance_due.toFixed(2)}</p>
                        <p>Thank you,<br/>${escapeHtml(companyName)}</p>
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
