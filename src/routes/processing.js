const express = require('express');
const fs = require('fs');
const { createPartFromUri } = require('@google/genai');

const { ai, upload, pipeline } = require('../config');
const { persistLedger, computeLlmCost, logInteraction } = require('../db');
const { requireAuth, requireSubscription } = require('../middleware/auth');

const router = express.Router();

// ── POST /api/process-text ─────────────────────────────────────────────
router.post('/process-text', requireAuth, requireSubscription, async (req, res) => {
    const phone      = req.userPhone;
    const text       = req.body.text;
    const estimateId = req.body.estimateId || null;

    if (!text || !text.trim()) return res.status(400).json({ error: 'No text provided' });

    const user      = req.authedUser;
    const startTime = Date.now();
    let status    = 'Failed';
    let errorMsg  = null;
    let llmTokens = 0;
    let cost      = 0;
    let transcript = `User: ${text}`;

    try {
        console.log(`[${phone}] process-text: running pipeline (Estimator → Pricer → Reviewer)...`);
        const reviewed = await pipeline.runPipeline(
            { type: 'text', payload: text },
            { userPhone: phone, zipCode: user.zipCode }
        );
        const result = await persistLedger({
            projectName:     reviewed.projectName,
            scope_of_work:   reviewed.scope_of_work,
            pricedMaterials: reviewed.materials,
            pricedLabor:     reviewed.labor,
        }, phone, estimateId);

        ({ llmTokens, cost } = computeLlmCost(reviewed.usage));
        status     = 'Completed';
        transcript = `User: ${text}\nAI: "${result.projectName}" — review ${reviewed.status}, ${reviewed.warnings.length} warning(s).`;
        res.json({ success: true, ...result, warnings: reviewed.warnings, review_status: reviewed.status });
    } catch (err) {
        console.error('process-text error:', err);
        errorMsg   = err.message || 'Failed to process text';
        transcript = `User: ${text}\nAI: Error: ${errorMsg}`;
        res.status(500).json({ error: errorMsg });
    } finally {
        const processingTimeMs = Date.now() - startTime;
        logInteraction({
            source: 'web-ui-text', inputType: 'text',
            processingTimeMs, cost, status,
            callerId: phone, transcript, llmTokens,
            error: errorMsg || undefined,
        }).catch(logErr => console.error('Failed to log process-text interaction:', logErr));
    }
});

// ── POST /api/process (audio) ──────────────────────────────────────────
router.post('/process', upload.single('audio'), requireAuth, requireSubscription, async (req, res) => {
    const phone = req.userPhone;
    if (!req.file) return res.status(400).json({ error: 'No audio file provided' });

    const user         = req.authedUser;
    const audioFilePath = req.file.path;
    let   geminiFile   = null;

    const startTime = Date.now();
    let status    = 'Failed';
    let errorMsg  = null;
    let llmTokens = 0;
    let cost      = 0;
    let transcript = `User: (Audio Input)`;

    try {
        console.log(`[${phone}] process (audio): uploading to Gemini File API...`);
        geminiFile = await ai.files.upload({
            file:   audioFilePath,
            config: { mimeType: req.file.mimetype || 'audio/webm' },
        });
        console.log(`Uploaded as ${geminiFile.name}`);

        console.log(`[${phone}] process (audio): running pipeline (Estimator → Pricer → Reviewer)...`);
        const reviewed = await pipeline.runPipeline(
            { type: 'image', payload: createPartFromUri(geminiFile.uri, geminiFile.mimeType) },
            { userPhone: phone, zipCode: user.zipCode }
        );
        const estimateId = req.body.estimateId || null;
        const result = await persistLedger({
            projectName:     reviewed.projectName,
            scope_of_work:   reviewed.scope_of_work,
            pricedMaterials: reviewed.materials,
            pricedLabor:     reviewed.labor,
        }, phone, estimateId);

        ({ llmTokens, cost } = computeLlmCost(reviewed.usage));
        status = 'Completed';
        const responseMsg = `Successfully parsed estimate for "${result.projectName}" with ${result.itemCount} items.`;
        transcript = `User: (Audio Input - ${reviewed.scope_of_work || 'Estimating materials/labor'})\nAI: ${responseMsg} — review ${reviewed.status}, ${reviewed.warnings.length} warning(s).`;
        res.json({ success: true, ...result, warnings: reviewed.warnings, review_status: reviewed.status });

    } catch (err) {
        console.error('process (audio) error:', err);
        errorMsg   = err.message || 'Failed to process audio';
        transcript = `User: (Audio Input)\nAI: Error: ${errorMsg}`;
        res.status(500).json({ error: errorMsg });
    } finally {
        if (fs.existsSync(audioFilePath)) fs.unlinkSync(audioFilePath);
        if (geminiFile?.name) {
            try { await ai.files.delete({ name: geminiFile.name }); } catch (_) {}
        }
        const processingTimeMs = Date.now() - startTime;
        logInteraction({
            source: 'web-ui-voice', inputType: 'voice',
            processingTimeMs, cost, status,
            callerId: phone, transcript, llmTokens,
            error: errorMsg || undefined,
        }).catch(logErr => console.error('Failed to log process audio interaction:', logErr));
    }
});

module.exports = router;
