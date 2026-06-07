'use strict';

const SKUs = require('./menardsSKUs');
const { sanitizeItemId } = require('./sanitize');

const OXYLABS_ENDPOINT = 'https://realtime.oxylabs.io/v1/queries';

function getAuth() {
    const user = process.env.OXYLABS_USER;
    const pass = process.env.OXYLABS_PASS;
    if (!user || !pass) throw new Error('OXYLABS_USER / OXYLABS_PASS env vars not set');
    return Buffer.from(`${user}:${pass}`).toString('base64');
}

async function fetchMenardsPrice(url) {
    const res = await fetch(OXYLABS_ENDPOINT, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Basic ${getAuth()}`,
        },
        body: JSON.stringify({
            source: 'universal',
            url,
            render: 'html',
            geo_location: 'Wisconsin,United States',
        }),
    });

    if (!res.ok) {
        throw new Error(`Oxylabs HTTP ${res.status}`);
    }

    const data = await res.json();
    const html = data?.results?.[0]?.content;
    if (!html) return null;

    // Menards embeds price in JSON-LD structured data — most reliable extraction
    // Pattern: "price":3.54 inside a <script type="application/ld+json"> block
    const jsonLdMatch = html.match(/"price"\s*:\s*([\d.]+)/);
    if (jsonLdMatch) return parseFloat(jsonLdMatch[1]);

    // Fallback: first bare dollar amount in the page
    const dollarMatch = html.match(/\$\s*([\d,]+\.?\d{0,2})/);
    return dollarMatch ? parseFloat(dollarMatch[1].replace(/,/g, '')) : null;
}

async function scrapeMenardsPrices(db) {
    let scraped = 0, failed = 0;
    const now = new Date();

    for (const sku of SKUs) {
        const ref = db.collection('market_prices').doc('menards')
                      .collection('items').doc(sanitizeItemId(sku.key));
        try {
            const price = await fetchMenardsPrice(sku.url);
            if (price && price > 0) {
                await ref.set({
                    name:       sku.name,
                    price,
                    unit:       sku.unit,
                    scraped_at: now,
                    url:        sku.url,
                    stale:      false,
                });
                scraped++;
                console.log(`[menards] ✓ ${sku.name}: $${price}`);
            } else {
                await ref.set({ stale: true, last_attempted: now }, { merge: true });
                failed++;
                console.warn(`[menards] ✗ ${sku.name}: no price extracted`);
            }
        } catch (err) {
            await ref.set({ stale: true, last_attempted: now }, { merge: true });
            failed++;
            console.warn(`[menards] ✗ ${sku.name}: ${err.message}`);
        }
        // Polite delay — avoid hammering Oxylabs rate limits
        await new Promise(r => setTimeout(r, 600));
    }

    await db.collection('market_prices').doc('menards').set(
        { last_run: now, scraped, failed },
        { merge: true }
    );

    console.log(`[menards] sync complete — scraped: ${scraped}, failed: ${failed}`);
    return { scraped, failed };
}

/**
 * Fuzzy-match an extracted item name to a SKU key.
 * Strategy: normalize both strings, then check that every token in the SKU name
 * appears in the extracted name. Short-circuits on exact match.
 */
function findMarketKey(itemName) {
    if (!itemName) return null;
    const norm = s => s.toLowerCase().replace(/[^a-z0-9x"]/g, ' ').replace(/\s+/g, ' ').trim();
    const itemNorm = norm(itemName);

    for (const sku of SKUs) {
        const skuNorm = norm(sku.name);
        if (itemNorm === skuNorm) return sanitizeItemId(sku.key);
        const tokens = skuNorm.split(' ').filter(t => t.length > 1);
        if (tokens.length > 0 && tokens.every(t => itemNorm.includes(t))) {
            return sanitizeItemId(sku.key);
        }
    }
    return null;
}

module.exports = { scrapeMenardsPrices, findMarketKey };
