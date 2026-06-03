'use strict';

const { createEstimator } = require('./estimator');
const { createPricer }    = require('./pricer');
const { createReviewer }  = require('./reviewer');

/**
 * The deterministic 3-stage estimation pipeline — the V2 replacement for the
 * monolithic extract-and-merge call.
 *
 *   Stage 1  Estimator  (LLM)            → price-free scope
 *   Stage 2  Pricer     (deterministic)  → priced ledger
 *   Stage 3  Reviewer   (LLM, temp 0)    → priced ledger + warnings
 *
 * Non-determinism is quarantined to exactly two auditable LLM boundaries
 * (Stages 1 and 3); the cost-bearing math in the middle is pure.
 *
 * This orchestrator is a PURE in-memory transformation — it does NOT persist to
 * Firestore. The caller owns persistence, which keeps every stage unit-testable
 * with mocked deps and lets the server reuse its existing merge/save logic.
 *
 * @param {{ db: import('@google-cloud/firestore').Firestore, ai: import('@google/genai').GoogleGenAI }} deps
 * @returns {{ runPipeline: (input: object, ctx?: object) => Promise<PipelineResult> }}
 *
 * @typedef {{ projectName: string, scope_of_work: string, materials: object[], labor: object[], totals: object, warnings: object[], status: 'ok'|'flagged', source: string }} PipelineResult
 */
function createPipeline({ db, ai }) {
    const estimator = createEstimator({ ai });
    const pricer    = createPricer({ db, ai });
    const reviewer  = createReviewer({ ai });

    /**
     * @param {{ type?: 'text'|'voice'|'image', payload: string|object }} input
     * @param {{ userPhone?: string, zipCode?: string }} [ctx]
     * @returns {Promise<PipelineResult>}
     */
    async function runPipeline(input, ctx = {}) {
        // ── Stage 1: extract ─────────────────────────────────────────────
        const scope = await estimator.extractScope(input);

        // ── Stage 2: price (deterministic) ───────────────────────────────
        const priced = await pricer.priceScope(scope, {
            userPhone: ctx.userPhone,
            zipCode:   ctx.zipCode,
        });

        // ── Stage 3: review ──────────────────────────────────────────────
        const reviewed = await reviewer.reviewLedger(priced, ctx);

        return {
            projectName:   scope.projectName,
            scope_of_work: scope.scope_of_work,
            materials:     priced.materials,
            labor:         priced.labor,
            totals:        priced.totals,
            warnings:      reviewed.warnings,
            status:        reviewed.status,
            source:        scope.source,
        };
    }

    return { runPipeline };
}

module.exports = { createPipeline };
