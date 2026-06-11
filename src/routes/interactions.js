const express = require('express');

const { db, ai } = require('../config');
const { requireAuth } = require('../middleware/auth');
const { parseGeminiJSON, sanitizePhase1Intent } = require('../lib/sanitize');

const router = express.Router();

const VOICE_TO_JSON_SYSTEM_PROMPT =
    `You are a Construction Intent Translator for the Lone Ranger Estimator's 3D framing engine. ` +
    `Your ONLY job is to convert a contractor's spoken transcript into a precise JSON command packet. ` +
    `Output ONLY valid JSON — no markdown fences, no explanation, no commentary whatsoever.\n\n` +
    `You MUST return an object that conforms EXACTLY to this Phase 1 schema:\n` +
    `{\n` +
    `  "schemaVersion": "1.0",\n` +
    `  "projectType": "wall_frame",\n` +
    `  "dimensions": { "lengthFt": <number>, "heightFt": <number> },\n` +
    `  "structural": { "studSpacingInches": <16 or 24>, "treatedSolePlate": <boolean>, "wallType": <"interior" or "exterior"> },\n` +
    `  "features": { "doorOpenings": <non-negative integer>, "windowOpenings": <non-negative integer>, "cornerCount": <non-negative integer> }\n` +
    `}\n\n` +
    `Extraction rules:\n` +
    `- projectType: always "wall_frame" in Phase 1 — never change this value.\n` +
    `- lengthFt: the wall length in feet. Default 20 if not stated.\n` +
    `- heightFt: the wall height in feet. Default 9 if not stated.\n` +
    `- studSpacingInches: MUST be exactly 16 or 24. Default 16.\n` +
    `- treatedSolePlate: true if the user says "treated", "PT", "pressure treated", or implies a concrete/slab floor. Default false.\n` +
    `- wallType: "exterior" if the user implies an outer building envelope; "interior" for partition/dividing walls. Default "exterior".\n` +
    `- doorOpenings: count of door rough openings explicitly mentioned. Default 0.\n` +
    `- windowOpenings: count of window rough openings explicitly mentioned. Default 0.\n` +
    `- cornerCount: number of corners or turns. Default 4.\n` +
    `- NEVER add fields beyond the schema above.\n` +
    `- NEVER wrap output in markdown code fences (no \`\`\`json).`;

// ── POST /api/estimate/voice-to-json ──────────────────────────────────
router.post('/estimate/voice-to-json', requireAuth, async (req, res) => {
    const userPhone  = req.userPhone;
    const transcript = req.body.transcript;

    if (!transcript || !transcript.trim()) {
        return res.status(400).json({ error: 'transcript is required and must not be empty.' });
    }

    console.log(`[${userPhone}] voice-to-json: translating transcript (${transcript.length} chars)...`);

    try {
        const response = await ai.models.generateContent({
            model:    'gemini-3.5-flash',
            config:   { systemInstruction: VOICE_TO_JSON_SYSTEM_PROMPT },
            contents: [{ role: 'user', parts: [{ text: transcript.trim() }] }],
        });

        let rawIntent;
        try {
            rawIntent = parseGeminiJSON(response.text);
        } catch (parseErr) {
            console.error(`[${userPhone}] voice-to-json: Gemini returned unparseable JSON:`, response.text);
            return res.status(502).json({ error: 'AI returned malformed JSON. Please retry.' });
        }

        const intent = sanitizePhase1Intent(rawIntent);
        console.log(`[${userPhone}] voice-to-json: ${intent.projectType} | ${intent.dimensions.lengthFt}x${intent.dimensions.heightFt}ft | ${intent.structural.studSpacingInches}" OC | ${intent.structural.wallType}`);
        res.json({ success: true, intent });

    } catch (err) {
        console.error(`[${userPhone}] voice-to-json error:`, err.message);
        res.status(500).json({ error: err.message || 'Failed to translate transcript.' });
    }
});

// ── GET /api/interactions/stream (SSE) ────────────────────────────────
router.get('/interactions/stream', (req, res) => {
    res.writeHead(200, {
        'Content-Type':  'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection':    'keep-alive',
    });
    res.flushHeaders();

    const unsubscribe = db.collection('Ai_Interactions')
        .orderBy('timestamp', 'desc')
        .limit(50)
        .onSnapshot(snapshot => {
            const interactions = [];
            snapshot.forEach(doc => {
                const data    = doc.data();
                const dateStr = data.timestamp && typeof data.timestamp.toDate === 'function'
                    ? data.timestamp.toDate().toISOString()
                    : new Date().toISOString();
                interactions.push({
                    id: doc.id, date: dateStr, timestamp: data.timestamp,
                    source: data.source, inputType: data.inputType,
                    processingTimeMs: data.processingTimeMs, latencyMs: data.processingTimeMs,
                    durationSeconds: data.processingTimeMs ? Math.round(data.processingTimeMs / 1000) : 0,
                    cost: data.cost, status: data.status, callerId: data.callerId,
                    transcript: data.transcript, llmTokens: data.llmTokens, error: data.error,
                });
            });
            res.write(`data: ${JSON.stringify(interactions)}\n\n`);
        }, error => {
            console.error('[SSE] onSnapshot error:', error);
        });

    req.on('close', () => {
        unsubscribe();
        console.log('[SSE] Client disconnected, unsubscribed.');
    });
});

// ── GET /api/interactions ─────────────────────────────────────────────
router.get('/interactions', async (req, res) => {
    try {
        const snap = await db.collection('Ai_Interactions').orderBy('timestamp', 'desc').limit(50).get();
        const interactions = [];
        snap.forEach(doc => {
            const data    = doc.data();
            const dateStr = data.timestamp ? data.timestamp.toDate().toISOString() : new Date().toISOString();
            interactions.push({
                id: doc.id, date: dateStr, timestamp: data.timestamp,
                source: data.source, inputType: data.inputType,
                processingTimeMs: data.processingTimeMs, latencyMs: data.processingTimeMs,
                durationSeconds: data.processingTimeMs ? Math.round(data.processingTimeMs / 1000) : 0,
                cost: data.cost, status: data.status, callerId: data.callerId,
                transcript: data.transcript, llmTokens: data.llmTokens, error: data.error,
            });
        });
        res.json(interactions);
    } catch (err) {
        console.error('GET /api/interactions error:', err);
        res.status(500).json({ error: err.message || 'Failed to fetch interactions.' });
    }
});

// ── GET /api/metrics ──────────────────────────────────────────────────
router.get('/metrics', async (req, res) => {
    try {
        const allSnap = await db.collection('Ai_Interactions').get();
        let totalLatency = 0, successCount = 0, totalLlmCostUsd = 0;

        allSnap.forEach(doc => {
            const data = doc.data();
            if (data.status === 'Completed' && data.processingTimeMs) {
                totalLatency += data.processingTimeMs;
                successCount++;
            }
            if (data.cost) totalLlmCostUsd += data.cost;
        });

        const averageLatencyMs = successCount > 0 ? Math.round(totalLatency / successCount) : 0;
        const roundedCost      = Math.round(totalLlmCostUsd * 10000) / 10000;

        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const formatShortDate = (d) => `${months[d.getMonth()]} ${String(d.getDate()).padStart(2, '0')}`;

        const activityMap  = new Map();
        const activityList = [];
        for (let i = 6; i >= 0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            const dateStr = formatShortDate(d);
            activityMap.set(dateStr, 0);
            activityList.push(dateStr);
        }

        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        sevenDaysAgo.setHours(0, 0, 0, 0);

        allSnap.forEach(doc => {
            const data = doc.data();
            if (data.timestamp) {
                const dateObj = data.timestamp.toDate();
                if (dateObj >= sevenDaysAgo) {
                    const dateStr = formatShortDate(dateObj);
                    if (activityMap.has(dateStr)) activityMap.set(dateStr, activityMap.get(dateStr) + 1);
                }
            }
        });

        res.json({
            totalCalls:       allSnap.size,
            averageLatencyMs,
            totalLlmCostUsd:  roundedCost,
            activity:         activityList.map(date => ({ date, calls: activityMap.get(date) })),
        });
    } catch (err) {
        console.error('GET /api/metrics error:', err);
        res.status(500).json({ error: err.message || 'Failed to fetch metrics.' });
    }
});

module.exports = router;
