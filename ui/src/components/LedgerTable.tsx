import { useState } from "react";
import { Plus, Trash2, CheckCircle, RefreshCw } from "lucide-react";
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
  onPublish: () => Promise<void>;
}

const fmt = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function LedgerTable({
  materials, labor, allItems,
  onCellEdit, onDeleteItem, onAddItem,
  materialsSubtotal, laborSubtotal, markupAmount, taxAmount, grandTotal,
  markupPercent, taxRate, onPublish,
}: Props) {
  const [publishing, setPublishing] = useState(false);
  return (
    <div className="flex flex-col p-3 sm:p-5 bg-void-black/35 gap-4">

      <div className="space-y-4">

        {/* ── Materials ── */}
        <div>
          <div className="flex justify-between items-center mb-2 border-b border-white/5 pb-1 select-none">
            <span className="text-[9px] font-black tracking-wider text-cool-blue uppercase font-mono">
              Extracted Material Line Items
            </span>
            <button
              onClick={() => onAddItem("material")}
              className="text-[9px] font-bold text-cool-blue hover:text-white flex items-center gap-1 uppercase font-mono cursor-pointer"
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
                    className="w-full bg-transparent text-sm font-bold text-starlight border-b border-white/10 focus:border-cool-blue/50 pb-1 outline-none"
                  />
                  <div className="grid grid-cols-3 gap-2 text-[11px] font-mono">
                    <label className="space-y-0.5">
                      <span className="block text-[9px] text-starlight/45 uppercase tracking-wider">Qty</span>
                      <input type="number" value={item.quantity}
                        onChange={(e) => onCellEdit(origIdx, "quantity", parseInt(e.target.value) || 0)}
                        className="w-full bg-void-black/60 border border-white/10 rounded px-2 py-1.5 text-starlight outline-none focus:border-cool-blue/40"
                      />
                    </label>
                    <label className="space-y-0.5">
                      <span className="block text-[9px] text-starlight/45 uppercase tracking-wider">Unit</span>
                      <input type="text" value={item.unit}
                        onChange={(e) => onCellEdit(origIdx, "unit", e.target.value)}
                        className="w-full bg-void-black/60 border border-white/10 rounded px-2 py-1.5 text-starlight uppercase outline-none focus:border-cool-blue/40"
                      />
                    </label>
                    <label className="space-y-0.5">
                      <span className="block text-[9px] text-starlight/45 uppercase tracking-wider">Unit $</span>
                      <input type="number" step="0.01" value={item.unit_price}
                        onChange={(e) => onCellEdit(origIdx, "unit_price", parseFloat(e.target.value) || 0)}
                        className="w-full bg-void-black/60 border border-white/10 rounded px-2 py-1.5 text-cool-blue text-right outline-none focus:border-cool-blue/40"
                      />
                    </label>
                  </div>
                  <div className="flex justify-between items-center pt-1 border-t border-white/5">
                    <span className={`text-[9px] font-extrabold px-2 py-0.5 rounded uppercase font-mono ${
                      item.price_source === "ai" ? "bg-soft-violet/20 text-soft-violet"
                      : item.price_source === "override" ? "bg-cool-blue/20 text-cool-blue"
                      : "bg-emerald-500/20 text-emerald-400"
                    }`}>
                      {item.price_source}
                    </span>
                    <div className="flex items-center gap-3">
                      <span className="font-mono font-extrabold text-base text-starlight">${fmt(item.total)}</span>
                      <button onClick={() => onDeleteItem(origIdx)} className="text-starlight/40 hover:text-rose-400 p-1.5">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Desktop table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left font-mono text-[11px] text-starlight border-collapse">
              <thead>
                <tr className="border-b border-white/5 text-starlight/45 text-[9px] uppercase tracking-widest bg-white/5 select-none">
                  <th className="py-2 px-3">Item Description</th>
                  <th className="py-2 px-3 w-20 text-center">Qty</th>
                  <th className="py-2 px-3 w-16 text-center">Unit</th>
                  <th className="py-2 px-3 w-28 text-right">Unit Price</th>
                  <th className="py-2 px-3 w-28 text-right">Amount</th>
                  <th className="py-2 px-3 w-12 text-center">Src</th>
                  <th className="py-2 px-3 w-12 text-center">Del</th>
                </tr>
              </thead>
              <tbody>
                {materials.map((item, idx) => {
                  const origIdx = allItems.findIndex(i => i === item);
                  return (
                    <tr key={idx} className="border-b border-white/5 hover:bg-white/5 transition-colors grid-glow-row">
                      <td className="py-1.5 px-3">
                        <input type="text" value={item.name}
                          onChange={(e) => onCellEdit(origIdx, "name", e.target.value)}
                          className="bg-transparent border-b border-transparent focus:border-cool-blue/40 w-full outline-none py-0.5" />
                      </td>
                      <td className="py-1.5 px-3 text-center">
                        <input type="number" value={item.quantity}
                          onChange={(e) => onCellEdit(origIdx, "quantity", parseInt(e.target.value) || 0)}
                          className="bg-transparent border-b border-transparent focus:border-cool-blue/40 text-center w-12 outline-none" />
                      </td>
                      <td className="py-1.5 px-3 text-center">
                        <input type="text" value={item.unit}
                          onChange={(e) => onCellEdit(origIdx, "unit", e.target.value)}
                          className="bg-transparent border-b border-transparent focus:border-cool-blue/40 text-center w-8 outline-none uppercase" />
                      </td>
                      <td className="py-1.5 px-3 text-right text-cool-blue font-semibold">
                        <div className="flex items-center justify-end gap-0.5">
                          <span className="opacity-40">$</span>
                          <input type="number" step="0.01" value={item.unit_price}
                            onChange={(e) => onCellEdit(origIdx, "unit_price", parseFloat(e.target.value) || 0)}
                            className="bg-transparent border-b border-transparent focus:border-cool-blue/40 text-right w-16 outline-none" />
                        </div>
                      </td>
                      <td className="py-1.5 px-3 text-right font-bold text-starlight">${fmt(item.total)}</td>
                      <td className="py-1.5 px-3 text-center">
                        <span className={`text-[8px] font-extrabold px-1 rounded uppercase font-mono ${
                          item.price_source === "ai"
                            ? "bg-soft-violet/20 text-soft-violet"
                            : item.price_source === "override"
                            ? "bg-cool-blue/20 text-cool-blue"
                            : "bg-emerald-500/20 text-emerald-400"
                        }`}>
                          {item.price_source}
                        </span>
                      </td>
                      <td className="py-1.5 px-3 text-center">
                        <button onClick={() => onDeleteItem(origIdx)}
                          className="text-starlight/40 hover:text-rose-400 transition-colors cursor-pointer">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── Labor ── */}
        <div>
          <div className="flex justify-between items-center mb-2 border-b border-white/5 pb-1 select-none">
            <span className="text-[9px] font-black tracking-wider text-soft-violet uppercase font-mono">
              Extracted Labor Allocation Sheets
            </span>
            <button
              onClick={() => onAddItem("labor")}
              className="text-[9px] font-bold text-soft-violet hover:text-white flex items-center gap-1 uppercase font-mono cursor-pointer"
            >
              <Plus className="w-3 h-3" /> Add Labor Row
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
                    className="w-full bg-transparent text-sm font-bold text-starlight border-b border-white/10 focus:border-cool-blue/50 pb-1 outline-none"
                  />
                  <div className="grid grid-cols-2 gap-2 text-[11px] font-mono">
                    <label className="space-y-0.5">
                      <span className="block text-[9px] text-starlight/45 uppercase tracking-wider">Hours</span>
                      <input type="number" value={item.hours}
                        onChange={(e) => onCellEdit(origIdx, "hours", parseInt(e.target.value) || 0)}
                        className="w-full bg-void-black/60 border border-white/10 rounded px-2 py-1.5 text-starlight outline-none focus:border-cool-blue/40"
                      />
                    </label>
                    <label className="space-y-0.5">
                      <span className="block text-[9px] text-starlight/45 uppercase tracking-wider">Rate $/hr</span>
                      <input type="number" step="0.01" value={item.rate}
                        onChange={(e) => onCellEdit(origIdx, "rate", parseFloat(e.target.value) || 0)}
                        className="w-full bg-void-black/60 border border-white/10 rounded px-2 py-1.5 text-cool-blue text-right outline-none focus:border-cool-blue/40"
                      />
                    </label>
                  </div>
                  <div className="flex justify-end items-center pt-1 border-t border-white/5 gap-3">
                    <span className="font-mono font-extrabold text-base text-starlight">${fmt(item.total)}</span>
                    <button onClick={() => onDeleteItem(origIdx)} className="text-starlight/40 hover:text-rose-400 p-1.5">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Desktop table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left font-mono text-[11px] text-starlight border-collapse">
              <thead>
                <tr className="border-b border-white/5 text-starlight/45 text-[9px] uppercase tracking-widest bg-white/5 select-none">
                  <th className="py-2 px-3">Role Designation</th>
                  <th className="py-2 px-3 w-24 text-center">Hours</th>
                  <th className="py-2 px-3 w-28 text-right">Rate / Hr</th>
                  <th className="py-2 px-3 w-28 text-right">Amount</th>
                  <th className="py-2 px-3 w-12 text-center">Del</th>
                </tr>
              </thead>
              <tbody>
                {labor.map((item, idx) => {
                  const origIdx = allItems.findIndex(i => i === item);
                  return (
                    <tr key={idx} className="border-b border-white/5 hover:bg-white/5 transition-colors grid-glow-row">
                      <td className="py-1.5 px-3">
                        <input type="text" value={item.role}
                          onChange={(e) => onCellEdit(origIdx, "role", e.target.value)}
                          className="bg-transparent border-b border-transparent focus:border-cool-blue/40 w-full outline-none py-0.5" />
                      </td>
                      <td className="py-1.5 px-3 text-center">
                        <input type="number" value={item.hours}
                          onChange={(e) => onCellEdit(origIdx, "hours", parseInt(e.target.value) || 0)}
                          className="bg-transparent border-b border-transparent focus:border-cool-blue/40 text-center w-12 outline-none" />
                      </td>
                      <td className="py-1.5 px-3 text-right text-cool-blue font-semibold">
                        <div className="flex items-center justify-end gap-0.5">
                          <span className="opacity-40">$</span>
                          <input type="number" step="0.01" value={item.rate}
                            onChange={(e) => onCellEdit(origIdx, "rate", parseFloat(e.target.value) || 0)}
                            className="bg-transparent border-b border-transparent focus:border-cool-blue/40 text-right w-16 outline-none" />
                        </div>
                      </td>
                      <td className="py-1.5 px-3 text-right font-bold text-starlight">${fmt(item.total)}</td>
                      <td className="py-1.5 px-3 text-center">
                        <button onClick={() => onDeleteItem(origIdx)}
                          className="text-starlight/40 hover:text-rose-400 transition-colors cursor-pointer">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

      </div>

      {/* ── Summary + Publish ── */}
      <div className="mt-4 pt-3 border-t border-white/10 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex flex-wrap gap-x-6 gap-y-1 font-mono text-[10px] text-starlight/70">
          <div>Subtotal: <span className="text-starlight font-bold">${fmt(materialsSubtotal + laborSubtotal)}</span></div>
          <div>Markup ({markupPercent}%): <span className="text-starlight font-bold">${fmt(markupAmount)}</span></div>
          <div>Tax ({taxRate}%): <span className="text-starlight font-bold">${fmt(taxAmount)}</span></div>
        </div>

        <div className="flex items-center gap-4 self-end sm:self-auto font-mono">
          <div className="text-right">
            <span className="text-[8px] text-starlight/45 font-bold uppercase block leading-none select-none">Grand Valuation</span>
            <span className="text-xl font-extrabold text-cool-blue">${fmt(grandTotal)}</span>
          </div>
          <button
            id="publish-btn"
            onClick={async () => {
              setPublishing(true);
              try { await onPublish(); } finally { setPublishing(false); }
            }}
            disabled={publishing}
            className="bg-gradient-to-r from-[#20346a] to-[#2e1d52] hover:from-cool-blue hover:to-soft-violet hover:text-void-black text-starlight border border-cool-blue/30 font-black tracking-widest text-[9px] px-5 py-3 rounded-full transition-all cursor-pointer flex items-center gap-1.5 shadow-lg shadow-cool-blue/5 uppercase disabled:opacity-50"
          >
            {publishing
              ? <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              : <CheckCircle className="w-3.5 h-3.5" />}
            {publishing ? 'Generating...' : 'Publish & Send PDF'}
          </button>
        </div>
      </div>

    </div>
  );
}
