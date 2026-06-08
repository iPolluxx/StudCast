import { useState, useRef, useEffect } from "react";
import { Plus, Trash2, Check, X, CheckCircle, RefreshCw, Send } from "lucide-react";
import type { MaterialItem, LaborItem } from "../types";

interface Props {
  materials: MaterialItem[];
  labor: LaborItem[];
  allItems: (MaterialItem | LaborItem)[];
  onCellEdit: (index: number, field: string, value: string | number) => void;
  onDeleteItem: (index: number) => void;
  onAddItem: (type: "material" | "labor") => void;
  materialsSubtotal: number;
  laborSubtotal: number;
  markupAmount: number;
  taxAmount: number;
  grandTotal: number;
  markupPercent: number;
  taxRate: number;
  scopeOfWork: string;
  onScopeChange: (val: string) => void;
  onPublish: () => Promise<void>;
  onPreview?: () => void;
}

const fmt = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Sanitize numeric input: never NaN, never negative. Allows fractional values
// (1.5 hours, 2.5 sheets) — the old parseInt silently truncated them.
const clampNum = (v: string) => {
  const n = parseFloat(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

// Plain-language labels for where a price came from. The raw values
// (ai / override / database) are internal jargon; contractors see human words,
// with the full meaning on hover.
const SOURCE_META: Record<string, { label: string; title: string }> = {
  ai:       { label: "Est.",    title: "AI-estimated price" },
  override: { label: "Yours",  title: "Your manual price" },
  database: { label: "Saved",  title: "From your saved price book" },
  market:   { label: "Menards", title: "Live Menards price (Wausau, WI)" },
};

function sourceLabel(item: MaterialItem) {
  if (item.price_source === "market") {
    const age = (item as any).market_age_h;
    return age != null ? `Menards · ${age}h` : "Menards";
  }
  return SOURCE_META[item.price_source]?.label ?? item.price_source;
}

function sourceClass(priceSource: string) {
  if (priceSource === "ai")       return "bg-soft-violet/20 text-soft-violet";
  if (priceSource === "override") return "bg-cool-blue/20 text-cool-blue";
  if (priceSource === "market")   return "bg-live-emerald/20 text-live-emerald";
  return "bg-live-emerald/20 text-live-emerald"; // database
}

export default function LedgerTable({
  materials, labor, allItems,
  onCellEdit, onDeleteItem, onAddItem,
  materialsSubtotal, laborSubtotal, markupAmount, taxAmount, grandTotal,
  markupPercent, taxRate, scopeOfWork, onScopeChange, onPublish, onPreview,
}: Props) {
  const [publishing, setPublishing] = useState(false);
  const [confirmingPublish, setConfirmingPublish] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [confirmDeleteIdx, setConfirmDeleteIdx] = useState<number | null>(null);

  const isEmpty = materials.length === 0 && labor.length === 0;

  // ── Spreadsheet-style keyboard navigation for the desktop tables ──
  const rootRef = useRef<HTMLDivElement>(null);
  const pendingFocusRef = useRef<{ sec: "mat" | "lab"; col: string; row: number } | null>(null);

  const focusCell = (sec: "mat" | "lab", col: string, row: number) => {
    const el = rootRef.current?.querySelector<HTMLInputElement>(
      `input[data-sec="${sec}"][data-row="${row}"][data-col="${col}"]`,
    );
    if (el) { el.focus(); el.select(); }
  };

  // Enter advances down the column (and adds a row at the bottom); Up/Down move
  // between rows in the same column. Native Tab still walks every field; Left/Right
  // stay as text-caret movement, so single-cell editing is unaffected.
  const handleCellKey = (
    e: React.KeyboardEvent<HTMLInputElement>,
    sec: "mat" | "lab", row: number, col: string, count: number,
  ) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (row < count - 1) focusCell(sec, col, row + 1);
      else {
        onAddItem(sec === "mat" ? "material" : "labor");
        pendingFocusRef.current = { sec, col, row: count }; // new row lands at index === count
      }
    } else if (e.key === "ArrowDown") {
      e.preventDefault(); // also suppresses number-input increment, which would fight grid nav
      if (row < count - 1) focusCell(sec, col, row + 1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (row > 0) focusCell(sec, col, row - 1);
    }
  };

  // After an Enter-add inserts a new row, focus the matching cell once it renders.
  useEffect(() => {
    const pf = pendingFocusRef.current;
    if (pf) { pendingFocusRef.current = null; focusCell(pf.sec, pf.col, pf.row); }
  }, [materials.length, labor.length]);

  const doPublish = async () => {
    setPublishing(true);
    setPublishError(null);
    try {
      await onPublish();
      setConfirmingPublish(false);
    } catch (e) {
      setPublishError(e instanceof Error && e.message ? e.message : "Please try again.");
    } finally {
      setPublishing(false);
    }
  };

  // Delete cell with an inline two-step confirm — a mis-tap on a money document
  // shouldn't vaporize a priced line. Mobile targets are a full 44px.
  const renderDelete = (origIdx: number, variant: "mobile" | "desktop") => {
    const confirming = confirmDeleteIdx === origIdx;
    const box = "h-11 w-11";
    if (confirming) {
      return (
        <div className="flex items-center justify-center gap-1">
          <button
            onClick={() => { onDeleteItem(origIdx); setConfirmDeleteIdx(null); }}
            aria-label="Confirm delete"
            className={`${box} rounded-lg flex items-center justify-center bg-alert-rose/20 text-alert-rose hover:bg-alert-rose/30 transition-colors cursor-pointer`}
          >
            <Check className="w-4 h-4" />
          </button>
          <button
            onClick={() => setConfirmDeleteIdx(null)}
            aria-label="Cancel delete"
            className={`${box} rounded-lg flex items-center justify-center bg-white/5 text-starlight/70 hover:bg-white/10 transition-colors cursor-pointer`}
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      );
    }
    return (
      <button
        onClick={() => setConfirmDeleteIdx(origIdx)}
        aria-label="Delete row"
        className={`${box} rounded-lg flex items-center justify-center text-starlight/55 hover:text-alert-rose hover:bg-white/5 transition-colors cursor-pointer`}
      >
        <Trash2 className={variant === "mobile" ? "w-4 h-4" : "w-3.5 h-3.5"} />
      </button>
    );
  };

  return (
    <div ref={rootRef} className="flex flex-col p-3 sm:p-5 bg-void-black/35 gap-4">

      {/* ── Scope of Work ── */}
      <div className="space-y-1.5">
        <h3 className="text-micro font-black tracking-wider text-cool-blue uppercase font-mono">
          Scope of Work
        </h3>
        <textarea
          value={scopeOfWork}
          onChange={(e) => onScopeChange(e.target.value)}
          placeholder="Describe the project scope — this appears on the PDF estimate sent to your client..."
          rows={3}
          className="w-full bg-void-black/60 border border-white/10 rounded-xl px-3 py-2.5 text-mini text-starlight font-sans placeholder-starlight/80 outline-none focus:border-cool-blue/50 resize-none leading-relaxed"
        />
      </div>

      <div className="space-y-4">

        <p className="hidden md:block text-micro text-starlight/60 font-mono tracking-wide">
          Tip: press <kbd className="text-cool-blue">Enter</kbd> to jump down a row (or add one) · <kbd className="text-cool-blue">↑</kbd> <kbd className="text-cool-blue">↓</kbd> move between rows
        </p>

        {/* ── Materials ── */}
        <div>
          <div className="flex justify-between items-center mb-2 border-b border-white/5 pb-1 select-none">
            <h3 className="text-micro font-black tracking-wider text-cool-blue uppercase font-mono">
              Materials
            </h3>
            <button
              onClick={() => onAddItem("material")}
              className="text-micro font-bold text-cool-blue hover:text-white flex items-center gap-1 uppercase font-mono cursor-pointer"
            >
              <Plus className="w-3 h-3" /> Add Material
            </button>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden space-y-2">
            {materials.map((item, idx) => {
              const origIdx = allItems.findIndex(i => i === item);
              return (
                <div key={idx} className="rounded-xl border border-white/10 bg-void-black/40 p-3 space-y-2">
                  <input
                    type="text" value={item.name}
                    onChange={(e) => onCellEdit(origIdx, "name", e.target.value)}
                    className="w-full bg-transparent text-base font-bold text-starlight border-b border-white/10 focus:border-cool-blue/50 pb-1 outline-none"
                  />
                  <div className="grid grid-cols-3 gap-2 text-mini font-mono">
                    <label className="space-y-0.5">
                      <span className="block text-micro text-starlight/70 uppercase tracking-wider">Qty</span>
                      <input type="number" min={0} step="any" inputMode="decimal" value={item.quantity}
                        onChange={(e) => onCellEdit(origIdx, "quantity", clampNum(e.target.value))}
                        className="w-full bg-void-black/60 border border-white/10 rounded px-2 py-1.5 text-starlight outline-none focus:border-cool-blue/40"
                      />
                    </label>
                    <label className="space-y-0.5">
                      <span className="block text-micro text-starlight/70 uppercase tracking-wider">Unit</span>
                      <input type="text" value={item.unit}
                        onChange={(e) => onCellEdit(origIdx, "unit", e.target.value)}
                        className="w-full bg-void-black/60 border border-white/10 rounded px-2 py-1.5 text-starlight uppercase outline-none focus:border-cool-blue/40"
                      />
                    </label>
                    <label className="space-y-0.5">
                      <span className="block text-micro text-starlight/70 uppercase tracking-wider">Unit $</span>
                      <input type="number" min={0} step="any" inputMode="decimal" value={item.unit_price}
                        onChange={(e) => onCellEdit(origIdx, "unit_price", clampNum(e.target.value))}
                        className="w-full bg-void-black/60 border border-white/10 rounded px-2 py-1.5 text-cool-blue text-right outline-none focus:border-cool-blue/40"
                      />
                    </label>
                  </div>
                  <div className="flex justify-between items-center pt-1 border-t border-white/5">
                    <span
                      title={SOURCE_META[item.price_source]?.title}
                      className={`text-micro font-extrabold px-2 py-0.5 rounded uppercase font-mono ${sourceClass(item.price_source)}`}>
                      {sourceLabel(item)}
                    </span>
                    <div className="flex items-center gap-3">
                      <span className="font-mono font-extrabold text-base text-starlight">${fmt(item.total)}</span>
                      {renderDelete(origIdx, "mobile")}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Desktop table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left font-mono text-mini text-starlight border-collapse">
              <thead>
                <tr className="border-b border-white/5 text-starlight/70 text-micro uppercase tracking-widest bg-white/5 select-none">
                  <th scope="col" className="py-2 px-3">Item Description</th>
                  <th scope="col" className="py-2 px-3 w-20 text-center">Qty</th>
                  <th scope="col" className="py-2 px-3 w-16 text-center">Unit</th>
                  <th scope="col" className="py-2 px-3 w-28 text-right">Unit Price</th>
                  <th scope="col" className="py-2 px-3 w-28 text-right">Amount</th>
                  <th scope="col" className="py-2 px-3 w-16 text-center">Source</th>
                  <th scope="col" className="py-2 px-3 w-16 text-center">Delete</th>
                </tr>
              </thead>
              <tbody>
                {materials.map((item, idx) => {
                  const origIdx = allItems.findIndex(i => i === item);
                  return (
                    <tr key={idx} className="border-b border-white/5 hover:bg-white/5 transition-colors grid-glow-row">
                      <td className="py-1.5 px-3">
                        <input type="text" value={item.name} aria-label="Item description"
                          data-sec="mat" data-row={idx} data-col="name"
                          onKeyDown={(e) => handleCellKey(e, "mat", idx, "name", materials.length)}
                          onChange={(e) => onCellEdit(origIdx, "name", e.target.value)}
                          className="bg-transparent border-b border-white/10 focus:border-cool-blue/40 w-full outline-none py-0.5" />
                      </td>
                      <td className="py-1.5 px-3 text-center">
                        <input type="number" min={0} step="any" inputMode="decimal" value={item.quantity} aria-label="Quantity"
                          data-sec="mat" data-row={idx} data-col="quantity"
                          onKeyDown={(e) => handleCellKey(e, "mat", idx, "quantity", materials.length)}
                          onChange={(e) => onCellEdit(origIdx, "quantity", clampNum(e.target.value))}
                          className="bg-transparent border-b border-white/10 focus:border-cool-blue/40 text-center w-12 outline-none" />
                      </td>
                      <td className="py-1.5 px-3 text-center">
                        <input type="text" value={item.unit} aria-label="Unit"
                          data-sec="mat" data-row={idx} data-col="unit"
                          onKeyDown={(e) => handleCellKey(e, "mat", idx, "unit", materials.length)}
                          onChange={(e) => onCellEdit(origIdx, "unit", e.target.value)}
                          className="bg-transparent border-b border-white/10 focus:border-cool-blue/40 text-center w-8 outline-none uppercase" />
                      </td>
                      <td className="py-1.5 px-3 text-right text-cool-blue font-semibold">
                        <div className="flex items-center justify-end gap-0.5">
                          <span className="opacity-40">$</span>
                          <input type="number" min={0} step="any" inputMode="decimal" value={item.unit_price} aria-label="Unit price"
                            data-sec="mat" data-row={idx} data-col="unit_price"
                            onKeyDown={(e) => handleCellKey(e, "mat", idx, "unit_price", materials.length)}
                            onChange={(e) => onCellEdit(origIdx, "unit_price", clampNum(e.target.value))}
                            className="bg-transparent border-b border-white/10 focus:border-cool-blue/40 text-right w-16 outline-none" />
                        </div>
                      </td>
                      <td className="py-1.5 px-3 text-right font-bold text-starlight">${fmt(item.total)}</td>
                      <td className="py-1.5 px-3 text-center">
                        <span
                          title={SOURCE_META[item.price_source]?.title}
                          className={`text-micro font-extrabold px-1 rounded uppercase font-mono ${sourceClass(item.price_source)}`}>
                          {sourceLabel(item)}
                        </span>
                      </td>
                      <td className="py-1.5 px-3">
                        {renderDelete(origIdx, "desktop")}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {materials.length === 0 && (
            <p className="text-mini text-starlight/70 font-sans italic py-3 text-center">
              No materials yet — tap the orb to describe the job, or add a line.
            </p>
          )}
        </div>

        {/* ── Labor ── */}
        <div>
          <div className="flex justify-between items-center mb-2 border-b border-white/5 pb-1 select-none">
            <h3 className="text-micro font-black tracking-wider text-cool-blue uppercase font-mono">
              Labor
            </h3>
            <button
              onClick={() => onAddItem("labor")}
              className="text-micro font-bold text-cool-blue hover:text-white flex items-center gap-1 uppercase font-mono cursor-pointer"
            >
              <Plus className="w-3 h-3" /> Add Labor
            </button>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden space-y-2">
            {labor.map((item, idx) => {
              const origIdx = allItems.findIndex(i => i === item);
              return (
                <div key={idx} className="rounded-xl border border-white/10 bg-void-black/40 p-3 space-y-2">
                  <input
                    type="text" value={item.role}
                    onChange={(e) => onCellEdit(origIdx, "role", e.target.value)}
                    className="w-full bg-transparent text-base font-bold text-starlight border-b border-white/10 focus:border-cool-blue/50 pb-1 outline-none"
                  />
                  <div className="grid grid-cols-2 gap-2 text-mini font-mono">
                    <label className="space-y-0.5">
                      <span className="block text-micro text-starlight/70 uppercase tracking-wider">Hours</span>
                      <input type="number" min={0} step="any" inputMode="decimal" value={item.hours}
                        onChange={(e) => onCellEdit(origIdx, "hours", clampNum(e.target.value))}
                        className="w-full bg-void-black/60 border border-white/10 rounded px-2 py-1.5 text-starlight outline-none focus:border-cool-blue/40"
                      />
                    </label>
                    <label className="space-y-0.5">
                      <span className="block text-micro text-starlight/70 uppercase tracking-wider">Rate $/hr</span>
                      <input type="number" min={0} step="any" inputMode="decimal" value={item.rate}
                        onChange={(e) => onCellEdit(origIdx, "rate", clampNum(e.target.value))}
                        className="w-full bg-void-black/60 border border-white/10 rounded px-2 py-1.5 text-cool-blue text-right outline-none focus:border-cool-blue/40"
                      />
                    </label>
                  </div>
                  <div className="flex justify-end items-center pt-1 border-t border-white/5 gap-3">
                    <span className="font-mono font-extrabold text-base text-starlight">${fmt(item.total)}</span>
                    {renderDelete(origIdx, "mobile")}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Desktop table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left font-mono text-mini text-starlight border-collapse">
              <thead>
                <tr className="border-b border-white/5 text-starlight/70 text-micro uppercase tracking-widest bg-white/5 select-none">
                  <th scope="col" className="py-2 px-3">Role</th>
                  <th scope="col" className="py-2 px-3 w-24 text-center">Hours</th>
                  <th scope="col" className="py-2 px-3 w-28 text-right">Rate / Hr</th>
                  <th scope="col" className="py-2 px-3 w-28 text-right">Amount</th>
                  <th scope="col" className="py-2 px-3 w-16 text-center">Delete</th>
                </tr>
              </thead>
              <tbody>
                {labor.map((item, idx) => {
                  const origIdx = allItems.findIndex(i => i === item);
                  return (
                    <tr key={idx} className="border-b border-white/5 hover:bg-white/5 transition-colors grid-glow-row">
                      <td className="py-1.5 px-3">
                        <input type="text" value={item.role} aria-label="Role"
                          data-sec="lab" data-row={idx} data-col="role"
                          onKeyDown={(e) => handleCellKey(e, "lab", idx, "role", labor.length)}
                          onChange={(e) => onCellEdit(origIdx, "role", e.target.value)}
                          className="bg-transparent border-b border-white/10 focus:border-cool-blue/40 w-full outline-none py-0.5" />
                      </td>
                      <td className="py-1.5 px-3 text-center">
                        <input type="number" min={0} step="any" inputMode="decimal" value={item.hours} aria-label="Hours"
                          data-sec="lab" data-row={idx} data-col="hours"
                          onKeyDown={(e) => handleCellKey(e, "lab", idx, "hours", labor.length)}
                          onChange={(e) => onCellEdit(origIdx, "hours", clampNum(e.target.value))}
                          className="bg-transparent border-b border-white/10 focus:border-cool-blue/40 text-center w-12 outline-none" />
                      </td>
                      <td className="py-1.5 px-3 text-right text-cool-blue font-semibold">
                        <div className="flex items-center justify-end gap-0.5">
                          <span className="opacity-40">$</span>
                          <input type="number" min={0} step="any" inputMode="decimal" value={item.rate} aria-label="Rate per hour"
                            data-sec="lab" data-row={idx} data-col="rate"
                            onKeyDown={(e) => handleCellKey(e, "lab", idx, "rate", labor.length)}
                            onChange={(e) => onCellEdit(origIdx, "rate", clampNum(e.target.value))}
                            className="bg-transparent border-b border-white/10 focus:border-cool-blue/40 text-right w-16 outline-none" />
                        </div>
                      </td>
                      <td className="py-1.5 px-3 text-right font-bold text-starlight">${fmt(item.total)}</td>
                      <td className="py-1.5 px-3">
                        {renderDelete(origIdx, "desktop")}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {labor.length === 0 && (
            <p className="text-mini text-starlight/70 font-sans italic py-3 text-center">
              No labor yet — add a row, or include it when you describe the job.
            </p>
          )}
        </div>

      </div>

      {/* ── Summary + Publish ── */}
      <div className="mt-4 pt-3 border-t border-white/10 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex flex-wrap gap-x-6 gap-y-1 font-mono text-mini text-starlight/70">
          <div>Subtotal: <span className="text-starlight font-bold">${fmt(materialsSubtotal + laborSubtotal)}</span></div>
          <div>Markup ({markupPercent}%): <span className="text-starlight font-bold">${fmt(markupAmount)}</span></div>
          <div>Tax ({taxRate}%): <span className="text-starlight font-bold">${fmt(taxAmount)}</span></div>
        </div>

        <div className="flex items-center gap-4 self-end sm:self-auto font-mono">
          <div className="text-right">
            <span className="text-micro text-starlight/70 font-bold uppercase block leading-none select-none">Total</span>
            <span className="text-xl font-extrabold text-cool-blue">${fmt(grandTotal)}</span>
          </div>

          {confirmingPublish ? (
            <div className="flex flex-col items-end gap-2">
              <span className="text-mini text-starlight/70 font-sans text-right max-w-[15rem] leading-snug">
                Email the PDF estimate for{" "}
                <span className="text-cool-blue font-bold">${fmt(grandTotal)}</span>?{" "}
                {materials.length} material{materials.length === 1 ? "" : "s"}, {labor.length} labor {labor.length === 1 ? "row" : "rows"}.
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => { setConfirmingPublish(false); setPublishError(null); }}
                  disabled={publishing}
                  className="text-micro font-black uppercase tracking-widest px-4 py-3 rounded-full border border-white/10 text-starlight/70 hover:bg-white/5 transition-colors cursor-pointer disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={doPublish}
                  disabled={publishing}
                  className="bg-gradient-to-r from-cool-blue to-soft-violet text-void-black font-black tracking-widest text-micro px-5 py-3 rounded-full transition-all cursor-pointer flex items-center gap-1.5 uppercase disabled:opacity-50"
                >
                  {publishing
                    ? <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    : <Send className="w-3.5 h-3.5" />}
                  {publishing ? "Sending..." : "Send PDF"}
                </button>
              </div>
            </div>
          ) : (
            <button
              id="publish-btn"
              onClick={() => {
                setPublishError(null);
                if (onPreview) {
                  onPreview();
                } else {
                  setConfirmingPublish(true);
                }
              }}
              disabled={isEmpty}
              title={isEmpty ? "Add line items before sending" : undefined}
              className="bg-gradient-to-r from-navy-deep to-navy-violet hover:from-cool-blue hover:to-soft-violet hover:text-void-black text-starlight border border-cool-blue/30 font-black tracking-widest text-micro px-5 py-3 rounded-full transition-all cursor-pointer flex items-center gap-1.5 shadow-lg shadow-cool-blue/5 uppercase disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:from-navy-deep disabled:hover:to-navy-violet disabled:hover:text-starlight"
            >
              <CheckCircle className="w-3.5 h-3.5" />
              Preview &amp; Send
            </button>
          )}
        </div>
      </div>

      {/* Durable publish error — stays put until dismissed or retried, unlike the transient toast */}
      {publishError && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-alert-rose/40 bg-alert-rose/10 px-3.5 py-2.5">
          <span className="text-mini text-starlight/90 font-sans leading-snug">
            <span className="font-bold text-alert-rose">Couldn't send the PDF.</span> {publishError}
          </span>
          <button
            onClick={doPublish}
            disabled={publishing}
            className="shrink-0 text-micro font-black uppercase tracking-widest px-3.5 py-2 rounded-full border border-alert-rose/50 text-alert-rose hover:bg-alert-rose/20 transition-colors cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
          >
            {publishing ? <RefreshCw className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
            Retry
          </button>
        </div>
      )}

    </div>
  );
}
