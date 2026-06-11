const express = require('express');
const { MessagingResponse } = require('twilio').twiml;
const twilio = require('twilio');

const { twilioClient, pipeline } = require('../config');
const { authorizePhone, persistLedger, computeLlmCost, logInteraction } = require('../db');
const { normalizePhone } = require('../lib/sanitize');

const router = express.Router();

// ── POST /api/webhook — Twilio SMS inbound ────────────────────────────
router.post('/', async (req, res) => {
    const twilioSignature = req.headers['x-twilio-signature'];
    const url = `https://${req.get('host')}${req.originalUrl}`;
    if (!twilio.validateRequest(process.env.TWILIO_AUTH_TOKEN, twilioSignature, url, req.body)) {
        return res.status(403).send('Forbidden');
    }

    const text    = req.body.Body;
    const rawFrom = req.body.From;

    let from;
    try {
        from = normalizePhone(rawFrom);
    } catch (normErr) {
        console.warn(`Webhook: invalid phone format "${rawFrom}" — ${normErr.message}`);
        const twiml = new MessagingResponse();
        twiml.message('Could not process your number. Please contact admin.');
        return res.type('text/xml').send(twiml.toString());
    }

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

    const { user }  = auth;
    const startTime = Date.now();
    let status    = 'Failed';
    let errorMsg  = null;
    let llmTokens = 0;
    let cost      = 0;
    let transcript = `User: ${text}`;

    try {
        console.log(`[${from}] webhook: running pipeline (Estimator → Pricer → Reviewer)...`);
        const reviewed = await pipeline.runPipeline(
            { type: 'text', payload: text },
            { userPhone: from, zipCode: user.zipCode }
        );
        const result = await persistLedger({
            projectName:     reviewed.projectName,
            scope_of_work:   reviewed.scope_of_work,
            pricedMaterials: reviewed.materials,
            pricedLabor:     reviewed.labor,
        }, from, null);

        ({ llmTokens, cost } = computeLlmCost(reviewed.usage));
        status = 'Completed';
        const responseMsg = `Added ${result.itemCount} item(s) to "${result.projectName}". Ledger updated.`;
        transcript = `User: ${text}\nAI: ${responseMsg} (${reviewed.warnings.length} warning(s))`;

        const twiml = new MessagingResponse();
        twiml.message(responseMsg);
        res.type('text/xml').send(twiml.toString());

    } catch (err) {
        console.error('Webhook error:', err);
        errorMsg = err.message || 'Unknown error';
        const responseMsg = "Sorry, I didn't catch any materials in that message. Please try again.";
        transcript = `User: ${text}\nAI: ${responseMsg}\nError: ${errorMsg}`;

        const twiml = new MessagingResponse();
        twiml.message(responseMsg);
        res.type('text/xml').send(twiml.toString());
    } finally {
        const processingTimeMs = Date.now() - startTime;
        logInteraction({
            source: 'twilio-webhook', inputType: 'text',
            processingTimeMs, cost, status,
            callerId: from, transcript, llmTokens,
            error: errorMsg || undefined,
        }).catch(logErr => console.error('Failed to log Twilio webhook interaction:', logErr));
    }
});

module.exports = router;
