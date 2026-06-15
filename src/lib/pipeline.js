'use strict';

const { createEstimator }     = require('./estimator');
const { createTakeoffEngine } = require('./takeoffEngine');
const { createPricer }        = require('./pricer');
const { createReviewer }      = require('./reviewer');

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
 * @typedef {{ projectName: string, scope_of_work: string, materials: object[], labor: object[], totals: object, warnings: object[], status: 'ok'|'flagged', source: string, usage: object }} PipelineResult
 */
/**
 * Sum Gemini `usageMetadata` objects from each LLM stage into a single rollup.
 * Tolerates missing/partial objects (a failed stage returns `{}`).
 * @param {...object} usages
 * @returns {{ promptTokenCount: number, candidatesTokenCount: number, totalTokenCount: number }}
 */
function sumUsage(...usages) {
    const acc = { promptTokenCount: 0, candidatesTokenCount: 0, totalTokenCount: 0 };
    for (const u of usages) {
        if (!u) continue;
        acc.promptTokenCount     += u.promptTokenCount     || 0;
        acc.candidatesTokenCount += u.candidatesTokenCount || 0;
        acc.totalTokenCount      += u.totalTokenCount      || (u.promptTokenCount || 0) + (u.candidatesTokenCount || 0);
    }
    return acc;
}

function createPipeline({ db, ai, takeoffTables = null }) {
    const estimator = createEstimator({ ai });
    const takeoff   = createTakeoffEngine({ tables: takeoffTables });
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

        // ── Stage 1.5: takeoff (deterministic) — expand assemblies into
        //    formula-counted line items; loose items pass through. ──────────
        const expanded = takeoff.expandScope(scope);

        // ── Stage 2: price (deterministic) ───────────────────────────────
        const priced = await pricer.priceScope(expanded, {
            userPhone: ctx.userPhone,
            zipCode:   ctx.zipCode,
        });

        // ── Stage 3: review ──────────────────────────────────────────────
        const reviewed = await reviewer.reviewLedger(priced, ctx);

        // Aggregate token usage across both LLM boundaries (Estimator + Reviewer)
        // so the caller can record real cost/token metrics. The Pricer is
        // deterministic and contributes none (its latent AI fallback only fires
        // without a default labor rate).
        const usage = sumUsage(scope.usage, reviewed.usage);

        // Takeoff warnings (fallbacks, unresolved assemblies) join the Reviewer's
        // QA warnings in a single rollup; any non-info warning flags the ledger.
        const takeoffWarnings = expanded.takeoffWarnings || [];
        const warnings = [...takeoffWarnings, ...reviewed.warnings];
        const status = warnings.some((w) => w.severity && w.severity !== 'info') ? 'flagged' : reviewed.status;

        return {
            projectName:   scope.projectName,
            scope_of_work: scope.scope_of_work,
            materials:     priced.materials,
            labor:         priced.labor,
            totals:        priced.totals,
            warnings,
            status,
            source:        scope.source,
            usage,
        };
    }

    return { runPipeline };
}

module.exports = { createPipeline };
