import { useState, useEffect, useCallback } from "react";
import { RefreshCw, Trash2, ArrowDownToLine, Plus, Upload } from "lucide-react";

interface PriceBookEntry {
  itemId: string;
  name: string;
  savedPrice: number;
  marketKey: string | null;
  marketPrice: number | null;
  marketUnit: string | null;
  marketAgeH: number | null;
  marketStale: boolean | null;
}

interface MarketOnlyItem {
  key: string;
  name: string;
  unit: string;
  price: number | null;
  marketAgeH: number | null;
  stale: boolean;
}

interface PriceSheetData {
  priceBook: PriceBookEntry[];
  marketOnly: MarketOnlyItem[];
  market?: MarketOnlyItem[]; // full Menards reference list (all cached SKUs)
  lastSync: string | null;
}

interface Props {
  authToken: string | null;
}

function diffPct(saved: number, market: number): number {
  return Math.round(((saved - market) / market) * 100);
}

export default function PriceSheetPanel({ authToken }: Props) {
  const [data, setData] = useState<PriceSheetData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncingItem, setSyncingItem] = useState<string | null>(null);
  const [deletingItem, setDeletingItem] = useState<string | null>(null);
  const [savingItem, setSavingItem] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [flash, setFlash] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const authHeaders = { Authorization: `Bearer ${authToken}` };

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch("/api/price-sheet", { headers: authHeaders });
      if (!r.ok) throw new Error(await r.text());
      setData(await r.json());
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [authToken]);

  useEffect(() => { load(); }, [load]);

  function showFlash(msg: string) {
    setFlash(msg);
    setTimeout(() => setFlash(null), 2500);
  }

  async function syncAll() {
    setSyncing(true);
    try {
      const r = await fetch("/api/price-book/sync-from-menards", {
        method: "POST",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      showFlash(`Synced ${d.synced} price${d.synced !== 1 ? "s" : ""} from Menards`);
      await load();
    } catch (e: any) {
      showFlash("Sync failed: " + e.message);
    } finally {
      setSyncing(false);
    }
  }

  async function syncOne(entry: PriceBookEntry) {
    if (!entry.marketKey) return;
    setSyncingItem(entry.itemId);
    try {
      const r = await fetch("/api/price-book/sync-from-menards", {
        method: "POST",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: entry.itemId, marketKey: entry.marketKey }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      showFlash(`Updated to $${d.price.toFixed(2)}`);
      await load();
    } catch (e: any) {
      showFlash("Failed: " + e.message);
    } finally {
      setSyncingItem(null);
    }
  }

  async function deleteEntry(itemId: string) {
    setDeletingItem(itemId);
    try {
      const r = await fetch(`/api/price-book/${encodeURIComponent(itemId)}`, {
        method: "DELETE",
        headers: authHeaders,
      });
      if (!r.ok) throw new Error((await r.json()).error);
      showFlash("Removed — falls back to market/AI tier");
      await load();
    } catch (e: any) {
      showFlash("Delete failed: " + e.message);
    } finally {
      setDeletingItem(null);
    }
  }

  async function commitEdit(entry: PriceBookEntry) {
    const price = parseFloat(editValue);
    if (!Number.isFinite(price) || price < 0) { setEditingId(null); return; }
    try {
      const r = await fetch(`/api/price-book/${encodeURIComponent(entry.itemId)}`, {
        method: "PUT",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ price }),
      });
      if (!r.ok) throw new Error((await r.json()).error);
      await load();
    } catch (e: any) {
      showFlash("Save failed: " + e.message);
    } finally {
      setEditingId(null);
    }
  }

  async function uploadCsv(file: File) {
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const r = await fetch("/api/upload-csv", {
        method: "POST",
        headers: authHeaders,
        body: form,
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      showFlash(`${d.saved ?? "?"} prices imported from CSV`);
      await load();
    } catch (e) {
      showFlash("Upload failed: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setUploading(false);
    }
  }

  async function saveMarketItem(item: MarketOnlyItem) {
    if (item.price === null) return;
    setSavingItem(item.key);
    try {
      const r = await fetch("/api/price-book", {
        method: "POST",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ name: item.name, price: item.price }),
      });
      if (!r.ok) throw new Error((await r.json()).error);
      showFlash(`Saved ${item.name} to your price book`);
      await load();
    } catch (e: any) {
      showFlash("Failed: " + e.message);
    } finally {
      setSavingItem(null);
    }
  }

  const syncableCount = data?.priceBook.filter(e => e.marketKey && !e.marketStale && e.marketPrice !== null).length ?? 0;

  // Derived views for the three isolated tables
  const marketRows = data?.market ?? data?.marketOnly ?? [];
  const savedMarketKeys = new Set(
    (data?.priceBook ?? []).map(e => e.marketKey).filter((k): k is string => !!k)
  );
  const driftRows = (data?.priceBook ?? [])
    .filter(e => e.marketPrice !== null)
    .map(e => ({ entry: e, diff: diffPct(e.savedPrice, e.marketPrice!) }))
    .filter(({ diff }) => Math.abs(diff) >= 10);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-starlight/60">
        <RefreshCw className="w-4 h-4 animate-spin mr-2" />
        <span className="text-xs font-mono">Loading price sheet…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="py-8 text-center">
        <p className="text-xs text-alert-rose font-mono">{error}</p>
        <button onClick={load} className="mt-3 text-mini text-cool-blue underline cursor-pointer">Retry</button>
      </div>
    );
  }

  return (
    <div className="space-y-5">

      {/* Header bar */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <p className="text-mini text-starlight/60 font-mono">
            {data?.priceBook.length ?? 0} saved · {data?.marketOnly.length ?? 0} market-only
            {data?.lastSync && (
              <> · synced {new Date(data.lastSync).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <label className={`flex items-center gap-1.5 px-3 py-1.5 bg-soft-violet/10 border border-soft-violet/30 hover:border-soft-violet/60 text-soft-violet rounded-xl text-micro font-black uppercase tracking-widest transition-all cursor-pointer ${uploading ? "opacity-40 pointer-events-none" : ""}`}>
            <input
              type="file"
              accept=".csv"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) uploadCsv(file);
                e.target.value = "";
              }}
            />
            <Upload className={`w-3 h-3 ${uploading ? "animate-spin" : ""}`} />
            {uploading ? "Importing…" : "Import supplier CSV"}
          </label>
          <button
            onClick={syncAll}
            disabled={syncing || syncableCount === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-cool-blue/10 border border-cool-blue/30 hover:border-cool-blue/60 text-cool-blue rounded-xl text-micro font-black uppercase tracking-widest transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <ArrowDownToLine className={`w-3 h-3 ${syncing ? "animate-spin" : ""}`} />
            {syncing ? "Syncing…" : `Sync all from Menards (${syncableCount})`}
          </button>
        </div>
      </div>

      {flash && (
        <div className="text-mini font-mono text-live-emerald bg-live-emerald/10 border border-live-emerald/20 rounded-xl px-3 py-2">
          {flash}
        </div>
      )}

      {/* ── Table 1: Your uploaded CSV catalog (price_book), isolated ── */}
      {data && data.priceBook.length > 0 && (
        <section>
          <h3 className="text-micro font-black uppercase tracking-widest text-starlight/60 mb-2">
            Your Catalog (Price Book)
          </h3>
          <div className="border border-white/10 rounded-xl overflow-hidden">
            <table className="w-full text-mini font-mono">
              <thead>
                <tr className="border-b border-white/10 bg-white/3">
                  <th className="text-left px-3 py-2 text-micro font-black uppercase tracking-widest text-starlight/60">Item</th>
                  <th className="text-right px-3 py-2 text-micro font-black uppercase tracking-widest text-starlight/60">Your Price</th>
                  <th className="px-3 py-2 w-14"></th>
                </tr>
              </thead>
              <tbody>
                {data.priceBook.map((entry, i) => (
                  <tr
                    key={entry.itemId}
                    className={`border-t border-white/5 ${i % 2 === 0 ? "bg-white/2" : ""} hover:bg-white/5 transition-colors`}
                  >
                    <td className="px-3 py-2 text-starlight/80 max-w-[220px] truncate">{entry.name}</td>

                    {/* Editable price */}
                    <td className="px-3 py-2 text-right">
                      {editingId === entry.itemId ? (
                        <input
                          autoFocus
                          type="number"
                          step="0.01"
                          value={editValue}
                          onChange={e => setEditValue(e.target.value)}
                          onBlur={() => commitEdit(entry)}
                          onKeyDown={e => {
                            if (e.key === "Enter") commitEdit(entry);
                            if (e.key === "Escape") setEditingId(null);
                          }}
                          className="w-20 bg-void-black border border-cool-blue/50 rounded px-1 py-0.5 text-right text-cool-blue outline-none text-mini"
                        />
                      ) : (
                        <button
                          onClick={() => { setEditingId(entry.itemId); setEditValue(String(entry.savedPrice)); }}
                          aria-label={`Edit your price for ${entry.name}`}
                          className="text-starlight hover:text-cool-blue transition-colors cursor-pointer font-mono"
                        >
                          ${entry.savedPrice.toFixed(2)}
                        </button>
                      )}
                    </td>

                    <td className="px-3 py-2">
                      <div className="flex items-center justify-end">
                        <button
                          onClick={() => deleteEntry(entry.itemId)}
                          disabled={deletingItem === entry.itemId}
                          title="Remove from saved prices"
                          aria-label={`Remove ${entry.name} from saved prices`}
                          className="flex h-11 w-11 items-center justify-center rounded hover:bg-alert-rose/10 text-alert-rose/60 hover:text-alert-rose transition-all cursor-pointer disabled:opacity-40"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-micro text-starlight/60 font-mono mt-1.5 pl-1">
            Your uploaded/saved unit prices. Click any price to edit inline.
          </p>
        </section>
      )}

      {/* ── Table 2: Live Menards market reference (read-only catalog) ── */}
      {marketRows.length > 0 && (
        <section>
          <h3 className="text-micro font-black uppercase tracking-widest text-starlight/60 mb-2">
            Menards Market Reference
          </h3>
          <div className="border border-white/10 rounded-xl overflow-hidden">
            <table className="w-full text-mini font-mono">
              <thead>
                <tr className="border-b border-white/10 bg-white/3">
                  <th className="text-left px-3 py-2 text-micro font-black uppercase tracking-widest text-starlight/60">Item</th>
                  <th className="text-left px-3 py-2 text-micro font-black uppercase tracking-widest text-starlight/60 hidden sm:table-cell">Unit</th>
                  <th className="text-right px-3 py-2 text-micro font-black uppercase tracking-widest text-starlight/60">Market Price</th>
                  <th className="px-3 py-2 w-16"></th>
                </tr>
              </thead>
              <tbody>
                {marketRows.map((item, i) => (
                  <tr
                    key={item.key}
                    className={`border-t border-white/5 ${i % 2 === 0 ? "bg-white/2" : ""} hover:bg-white/5 transition-colors`}
                  >
                    <td className="px-3 py-2 text-starlight/80 max-w-[200px] truncate">{item.name}</td>
                    <td className="px-3 py-2 text-starlight/60 hidden sm:table-cell">{item.unit}</td>
                    <td className="px-3 py-2 text-right">
                      {item.price !== null ? (
                        <span className="text-live-emerald">
                          ${item.price.toFixed(2)}
                          {item.marketAgeH !== null && (
                            <span className="ml-1 text-micro text-starlight/60">{item.marketAgeH}h</span>
                          )}
                        </span>
                      ) : (
                        <span className="text-starlight/60">stale</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {savedMarketKeys.has(item.key) ? (
                        <span className="text-micro text-starlight/40 pr-2" title="Already in your price book">saved</span>
                      ) : item.price !== null && (
                        <button
                          onClick={() => saveMarketItem(item)}
                          disabled={savingItem === item.key}
                          title="Save to your price book"
                          aria-label={`Save ${item.name} to your price book`}
                          className="flex h-11 w-11 items-center justify-center rounded hover:bg-live-emerald/10 text-live-emerald/60 hover:text-live-emerald transition-all cursor-pointer disabled:opacity-40"
                        >
                          <Plus className={`w-3.5 h-3.5 ${savingItem === item.key ? "animate-spin" : ""}`} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-micro text-starlight/60 font-mono mt-1.5 pl-1">
            Live weekly-scraped Menards (Wausau, WI) reference pricing. Unmatched items fall back to this tier automatically.
          </p>
        </section>
      )}

      {/* ── Table 3: Drift alerts — saved vs market differs >10% ── */}
      {driftRows.length > 0 && (
        <section>
          <h3 className="text-micro font-black uppercase tracking-widest text-stale-amber mb-2">
            Drift Alerts — &gt;10% From Market
          </h3>
          <div className="border border-stale-amber/25 rounded-xl overflow-hidden">
            <table className="w-full text-mini font-mono">
              <thead>
                <tr className="border-b border-white/10 bg-stale-amber/5">
                  <th className="text-left px-3 py-2 text-micro font-black uppercase tracking-widest text-starlight/60">Item</th>
                  <th className="text-right px-3 py-2 text-micro font-black uppercase tracking-widest text-starlight/60">Yours</th>
                  <th className="text-right px-3 py-2 text-micro font-black uppercase tracking-widest text-starlight/60">Menards</th>
                  <th className="text-right px-3 py-2 text-micro font-black uppercase tracking-widest text-starlight/60">Diff</th>
                  <th className="px-3 py-2 w-14"></th>
                </tr>
              </thead>
              <tbody>
                {driftRows.map(({ entry, diff }, i) => (
                  <tr
                    key={entry.itemId}
                    className={`border-t border-white/5 ${i % 2 === 0 ? "bg-white/2" : ""} hover:bg-white/5 transition-colors`}
                  >
                    <td className="px-3 py-2 text-starlight/80 max-w-[180px] truncate">{entry.name}</td>
                    <td className="px-3 py-2 text-right text-starlight">${entry.savedPrice.toFixed(2)}</td>
                    <td className="px-3 py-2 text-right text-live-emerald">${entry.marketPrice!.toFixed(2)}</td>
                    <td className="px-3 py-2 text-right">
                      <span className="text-stale-amber font-black">{diff > 0 ? "+" : ""}{diff}%</span>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center justify-end">
                        <button
                          onClick={() => syncOne(entry)}
                          disabled={syncingItem === entry.itemId}
                          title="Use Menards price"
                          aria-label={`Use Menards price for ${entry.name}`}
                          className="flex h-11 w-11 items-center justify-center rounded hover:bg-cool-blue/10 text-cool-blue/60 hover:text-cool-blue transition-all cursor-pointer disabled:opacity-40"
                        >
                          <ArrowDownToLine className={`w-3.5 h-3.5 ${syncingItem === entry.itemId ? "animate-spin" : ""}`} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-micro text-starlight/60 font-mono mt-1.5 pl-1">
            Saved prices that have drifted more than 10% from the live market. Tap the arrow to adopt the Menards price.
          </p>
        </section>
      )}

      {data && data.priceBook.length === 0 && marketRows.length === 0 && (
        <div className="py-10 text-center text-starlight/60 text-xs font-mono">
          No pricing data yet. Import a supplier CSV, generate estimates to build your price book, or trigger a Menards sync.
        </div>
      )}
    </div>
  );
}
