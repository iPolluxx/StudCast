import { useState, useEffect, useCallback } from "react";
import { RefreshCw, Trash2, ArrowDownToLine, Plus } from "lucide-react";

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
  lastSync: string | null;
}

interface Props {
  authToken: string | null;
}

function diffPct(saved: number, market: number): number {
  return Math.round(((saved - market) / market) * 100);
}

function AgeTag({ h }: { h: number | null }) {
  if (h === null) return null;
  return (
    <span className="text-[9px] font-black uppercase tracking-widest text-live-emerald border border-live-emerald/30 rounded px-1 py-0.5 whitespace-nowrap">
      {h}h ago
    </span>
  );
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

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-starlight/40">
        <RefreshCw className="w-4 h-4 animate-spin mr-2" />
        <span className="text-xs font-mono">Loading price sheet…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="py-8 text-center">
        <p className="text-xs text-alert-rose font-mono">{error}</p>
        <button onClick={load} className="mt-3 text-[10px] text-cool-blue underline cursor-pointer">Retry</button>
      </div>
    );
  }

  return (
    <div className="space-y-5">

      {/* Header bar */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <p className="text-[10px] text-starlight/50 font-mono">
            {data?.priceBook.length ?? 0} saved · {data?.marketOnly.length ?? 0} market-only
            {data?.lastSync && (
              <> · synced {new Date(data.lastSync).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</>
            )}
          </p>
        </div>
        <button
          onClick={syncAll}
          disabled={syncing || syncableCount === 0}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-cool-blue/10 border border-cool-blue/30 hover:border-cool-blue/60 text-cool-blue rounded-xl text-[9px] font-black uppercase tracking-widest transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <ArrowDownToLine className={`w-3 h-3 ${syncing ? "animate-bounce" : ""}`} />
          {syncing ? "Syncing…" : `Sync all from Menards (${syncableCount})`}
        </button>
      </div>

      {flash && (
        <div className="text-[10px] font-mono text-live-emerald bg-live-emerald/10 border border-live-emerald/20 rounded-xl px-3 py-2">
          {flash}
        </div>
      )}

      {/* ── Your saved prices ── */}
      {data && data.priceBook.length > 0 && (
        <section>
          <h3 className="text-[9px] font-black uppercase tracking-widest text-starlight/50 mb-2">
            Your Saved Prices
          </h3>
          <div className="border border-white/10 rounded-xl overflow-hidden">
            <table className="w-full text-[10px] font-mono">
              <thead>
                <tr className="border-b border-white/10 bg-white/3">
                  <th className="text-left px-3 py-2 text-[9px] font-black uppercase tracking-widest text-starlight/40">Item</th>
                  <th className="text-right px-3 py-2 text-[9px] font-black uppercase tracking-widest text-starlight/40">Your Price</th>
                  <th className="text-right px-3 py-2 text-[9px] font-black uppercase tracking-widest text-starlight/40 hidden sm:table-cell">Menards</th>
                  <th className="text-right px-3 py-2 text-[9px] font-black uppercase tracking-widest text-starlight/40 hidden sm:table-cell">Diff</th>
                  <th className="px-3 py-2 w-20"></th>
                </tr>
              </thead>
              <tbody>
                {data.priceBook.map((entry, i) => {
                  const diff = entry.marketPrice !== null ? diffPct(entry.savedPrice, entry.marketPrice) : null;
                  const stale = diff !== null && Math.abs(diff) >= 10;
                  return (
                    <tr
                      key={entry.itemId}
                      className={`border-t border-white/5 ${i % 2 === 0 ? "bg-white/2" : ""} hover:bg-white/5 transition-colors`}
                    >
                      <td className="px-3 py-2 text-starlight/80 max-w-[180px] truncate">{entry.name}</td>

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
                            className="w-20 bg-void-black border border-cool-blue/50 rounded px-1 py-0.5 text-right text-cool-blue outline-none text-[10px]"
                          />
                        ) : (
                          <button
                            onClick={() => { setEditingId(entry.itemId); setEditValue(String(entry.savedPrice)); }}
                            className="text-starlight hover:text-cool-blue transition-colors cursor-pointer font-mono"
                          >
                            ${entry.savedPrice.toFixed(2)}
                          </button>
                        )}
                      </td>

                      {/* Market price */}
                      <td className="px-3 py-2 text-right hidden sm:table-cell">
                        {entry.marketPrice !== null ? (
                          <span className="text-live-emerald">${entry.marketPrice.toFixed(2)}</span>
                        ) : entry.marketStale ? (
                          <span className="text-starlight/30">stale</span>
                        ) : (
                          <span className="text-starlight/30">—</span>
                        )}
                        {entry.marketAgeH !== null && entry.marketPrice !== null && (
                          <span className="ml-1 text-[8px] text-starlight/30">{entry.marketAgeH}h</span>
                        )}
                      </td>

                      {/* Diff */}
                      <td className="px-3 py-2 text-right hidden sm:table-cell">
                        {diff !== null ? (
                          <span className={stale ? "text-yellow-400 font-black" : "text-starlight/40"}>
                            {diff > 0 ? "+" : ""}{diff}%
                          </span>
                        ) : (
                          <span className="text-starlight/20">—</span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="px-3 py-2">
                        <div className="flex items-center justify-end gap-1.5">
                          {entry.marketKey && entry.marketPrice !== null && !entry.marketStale && (
                            <button
                              onClick={() => syncOne(entry)}
                              disabled={syncingItem === entry.itemId}
                              title="Use Menards price"
                              className="p-1 rounded hover:bg-cool-blue/10 text-cool-blue/50 hover:text-cool-blue transition-all cursor-pointer disabled:opacity-40"
                            >
                              <ArrowDownToLine className={`w-3 h-3 ${syncingItem === entry.itemId ? "animate-bounce" : ""}`} />
                            </button>
                          )}
                          <button
                            onClick={() => deleteEntry(entry.itemId)}
                            disabled={deletingItem === entry.itemId}
                            title="Remove from saved prices"
                            className="p-1 rounded hover:bg-alert-rose/10 text-alert-rose/40 hover:text-alert-rose transition-all cursor-pointer disabled:opacity-40"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="text-[9px] text-starlight/30 font-mono mt-1.5 pl-1">
            Click any price to edit inline. Amber diff = &gt;10% from Menards market.
          </p>
        </section>
      )}

      {/* ── Menards catalog — not yet saved ── */}
      {data && data.marketOnly.length > 0 && (
        <section>
          <h3 className="text-[9px] font-black uppercase tracking-widest text-starlight/50 mb-2">
            Menards Catalog — Not in Your Price Book
          </h3>
          <div className="border border-white/10 rounded-xl overflow-hidden">
            <table className="w-full text-[10px] font-mono">
              <thead>
                <tr className="border-b border-white/10 bg-white/3">
                  <th className="text-left px-3 py-2 text-[9px] font-black uppercase tracking-widest text-starlight/40">Item</th>
                  <th className="text-left px-3 py-2 text-[9px] font-black uppercase tracking-widest text-starlight/40 hidden sm:table-cell">Unit</th>
                  <th className="text-right px-3 py-2 text-[9px] font-black uppercase tracking-widest text-starlight/40">Market Price</th>
                  <th className="px-3 py-2 w-16"></th>
                </tr>
              </thead>
              <tbody>
                {data.marketOnly.map((item, i) => (
                  <tr
                    key={item.key}
                    className={`border-t border-white/5 ${i % 2 === 0 ? "bg-white/2" : ""} hover:bg-white/5 transition-colors`}
                  >
                    <td className="px-3 py-2 text-starlight/80 max-w-[200px] truncate">{item.name}</td>
                    <td className="px-3 py-2 text-starlight/40 hidden sm:table-cell">{item.unit}</td>
                    <td className="px-3 py-2 text-right">
                      {item.price !== null ? (
                        <span className="text-live-emerald">
                          ${item.price.toFixed(2)}
                          {item.marketAgeH !== null && (
                            <span className="ml-1 text-[8px] text-starlight/30">{item.marketAgeH}h</span>
                          )}
                        </span>
                      ) : (
                        <span className="text-starlight/30">stale</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {item.price !== null && (
                        <button
                          onClick={() => saveMarketItem(item)}
                          disabled={savingItem === item.key}
                          title="Save to your price book"
                          className="p-1 rounded hover:bg-live-emerald/10 text-live-emerald/50 hover:text-live-emerald transition-all cursor-pointer disabled:opacity-40"
                        >
                          <Plus className={`w-3 h-3 ${savingItem === item.key ? "animate-spin" : ""}`} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[9px] text-starlight/30 font-mono mt-1.5 pl-1">
            These use the Menards market price automatically. Save to your book to lock in a custom price.
          </p>
        </section>
      )}

      {data && data.priceBook.length === 0 && data.marketOnly.length === 0 && (
        <div className="py-10 text-center text-starlight/30 text-xs font-mono">
          No pricing data yet. Generate estimates to build your price book, or trigger a Menards sync.
        </div>
      )}
    </div>
  );
}
