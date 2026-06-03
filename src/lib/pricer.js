'use strict';

const { createPricingEngine } = require('./pricingEngine');

const round2 = (n) => Math.round(n * 100) / 100;

/**
 * Stage 2 — The Pricer (deterministic execution layer).
 *
 * Ingests Stage 1's price-free scope and runs every line item through the
 * existing createPricingEngine waterfall (explicit price → Firestore price_book
 * → AI-estimated fallback already embedded in the scope by Stage 1).
 *
 * COST PROFILE: this module issues ZERO LLM calls of its own. Materials are
 * always resolved deterministically (the engine's Priority 3 reads the
 * estimated_unit_cost that Stage 1 baked in — no network). The ONLY latent AI
 * touch lives inside the engine's assignLaborRate Priority 3, which fires solely
 * when a labor item has neither an explicit rate nor a configured
 * default_labor_rate. With a default rate present, this stage is fully offline.
 *
 * @param {{ db: import('@google-cloud/firestore').Firestore, ai: import('@google/genai').GoogleGenAI }} deps
 * @returns {{ priceScope: (scope: object, ctx?: { userPhone?: string, zipCode?: string }) => Promise<PricedLedger> }}
 *
 * @typedef {{ projectName: string, scope_of_work: string, materials: object[], labor: object[], totals: { materialsTotal: number, laborTotal: number, grandTotal: number } }} PricedLedger
 */
function createPricer({ db, ai }) {
    const { assignUnitPrice, assignLaborRate } = createPricingEngine({ db, ai });

    /**
     * @param {object} scope - Stage 1 output: { projectName, scope_of_work, materials, labor }
     * @param {{ userPhone?: string, zipCode?: string }} [ctx]
     * @returns {Promise<PricedLedger>}
     */
    async function priceScope(scope, ctx = {}) {
        const { userPhone = null, zipCode = null } = ctx;
        const materials = Array.isArray(scope.materials) ? scope.materials : [];
        const labor     = Array.isArray(scope.labor) ? scope.labor : [];

        // assignUnitPrice mutates each material in place; assignLaborRate returns
        // a fresh object. Both are run concurrently per the existing engine contract.
        const [pricedMaterials, pricedLabor] = await Promise.all([
            Promise.all(materials.map((item) => assignUnitPrice(item, zipCode, userPhone))),
            Promise.all(labor.map((item) => assignLaborRate(item, userPhone))),
        ]);

        const materialsTotal = pricedMaterials.reduce((s, i) => s + (i.total || 0), 0);
        const laborTotal     = pricedLabor.reduce((s, i) => s + (i.total || 0), 0);

        return {
            projectName:   scope.projectName || 'General',
            scope_of_work: scope.scope_of_work || '',
            materials:     pricedMaterials,
            labor:         pricedLabor,
            totals: {
                materialsTotal: round2(materialsTotal),
                laborTotal:     round2(laborTotal),
                grandTotal:     round2(materialsTotal + laborTotal),
            },
        };
    }

    return { priceScope };
}

module.exports = { createPricer };
