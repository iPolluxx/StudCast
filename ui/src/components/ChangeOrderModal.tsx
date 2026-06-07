import { useState, useEffect } from "react";
import { X, Send, RefreshCw, AlertTriangle } from "lucide-react";
import type { ChangeOrder, MaterialItem, LaborItem } from "../types";

interface ClientOption {
  label: string;
  phone: string;
}

interface Props {
  open: boolean;
  changeOrder: ChangeOrder | null;
  clients: ClientOption[];
  authToken: string | null;
  activeEstimateId: string | null;
  onClose: () => void;
  onDispatched: () => void;
}

function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10) return '+1' + digits;
  if (digits.length === 11 && digits[0] === '1') return '+' + digits;
  return null;
}

export default function ChangeOrderModal({ open, changeOrder, clients, authToken, activeEstimateId, onClose, onDispatched }: Props) {
  const [selectedPhone, setSelectedPhone] = useState('');
  const [manualPhone, setManualPhone] = useState('');
  const [localMaterials, setLocalMaterials] = useState<MaterialItem[]>([]);
  const [localLabor, setLocalLabor] = useState<LaborItem[]>([]);
  const [editingCell, setEditingCell] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [dirty, setDirty] = useState(false);
  const [dispatching, setDispatching] = useState(false);
  const [dispatchError, setDispatchError] = useState<string | null>(null);

  useEffect(() => {
    if (changeOrder && open) {
      setLocalMaterials(changeOrder.added_materials ?? []);
      setLocalLabor(changeOrder.added_labor ?? []);
      setSelectedPhone('');
      setManualPhone('');
      setDirty(false);
      setDispatchError(null);
    }
  }, [changeOrder, open]);

  const effectivePhone = selectedPhone || manualPhone;
  const validPhone = normalizePhone(effectivePhone);

  const matSubtotal = localMaterials.reduce((s, m) => s + (m.total ?? 0), 0);
  const labSubtotal = localLabor.reduce((s, l) => s + (l.total ?? 0), 0);
  const taxRate = 0.055; // WI 5.5% — applied to materials only, matching backend
  const taxAmt = matSubtotal * taxRate;
  const coTotal = matSubtotal + labSubtotal + taxAmt;

  function startEdit(key: string, val: number) {
    setEditingCell(key);
    setEditValue(String(val));
  }

  function commitMatEdit(idx: number, field: 'quantity' | 'unit_price') {
    const num = parseFloat(editValue);
    if (!Number.isFinite(num) || num < 0) { setEditingCell(null); return; }
    setLocalMaterials(prev => prev.map((m, i) => {
      if (i !== idx) return m;
      const updated = { ...m, [field]: num };
      updated.total = updated.quantity * updated.unit_price;
      return updated;
    }));
    setDirty(true);
    setEditingCell(null);
  }

  function commitLabEdit(idx: number, field: 'hours' | 'rate') {
    const num = parseFloat(editValue);
    if (!Number.isFinite(num) || num < 0) { setEditingCell(null); return; }
    setLocalLabor(prev => prev.map((l, i) => {
      if (i !== idx) return l;
      const updated = { ...l, [field]: num };
      updated.total = updated.hours * updated.rate;
      return updated;
    }));
    setDirty(true);
    setEditingCell(null);
  }

  const handleDispatch = async () => {
    if (!validPhone || !changeOrder || !authToken) return;
    setDispatching(true);
    setDispatchError(null);
    try {
      // 1. If the ledger was edited, persist it + regenerate the PDF the client
      //    will see. Skipped when untouched — the generate step already rendered it.
      if (dirty) {
        const upd = await fetch(`/api/change-orders/${encodeURIComponent(changeOrder.id)}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
          body: JSON.stringify({
            parentEstimateId: activeEstimateId,
            added_materials: localMaterials,
            added_labor: localLabor,
          }),
        });
        const updData = await upd.json();
        if (!upd.ok) throw new Error(updData.error || 'Failed to save edits');
      }

      // 2. Dispatch the SMS (sends the regenerated PDF + total)
      const resp = await fetch('/api/change-orders/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
        body: JSON.stringify({
          changeOrderId: changeOrder.id,
          parentEstimateId: activeEstimateId,
          clientPhone: validPhone,
        }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'Dispatch failed');
      onDispatched();
    } catch (e: any) {
      setDispatchError(e.message);
    } finally {
      setDispatching(false);
    }
  };

  const cellBtn = "text-starlight hover:text-cool-blue transition-colors cursor-pointer font-mono text-[10px]";
  const thCls = "text-left px-3 py-2 text-[9px] font-black uppercase tracking-widest text-starlight/40";
  const tdCls = "px-3 py-2 text-[10px] font-mono";
  const inputCls = "w-20 bg-void-black border border-cool-blue/50 rounded px-1 py-0.5 text-right text-cool-blue outline-none text-[10px] font-mono";
  const labelCls = "block text-[9px] uppercase font-black text-starlight/40 font-mono tracking-widest mb-1";

  if (!open || !changeOrder) return null;

  return (
    <div className="fixed inset-0 z-50 bg-void-black/85 backdrop-blur-md flex items-center justify-center p-4">
      <div className="glass-panel border-white/10 max-w-5xl w-full rounded-2xl flex flex-col shadow-2xl max-h-[90vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 shrink-0">
          <div>
            <h2 className="text-mini font-black text-starlight uppercase tracking-widest">Change Order</h2>
            <p className="text-[9px] text-soft-violet font-mono mt-0.5">{changeOrder.id}</p>
          </div>
          <button onClick={onClose} className="text-starlight/50 hover:text-alert-rose transition-colors cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

          {/* Change summary */}
          {changeOrder.change_summary && (
            <p className="text-mini text-starlight/70 italic font-sans leading-relaxed border-l-2 border-soft-violet/40 pl-3">
              "{changeOrder.change_summary}"
            </p>
          )}

          {/* Client picker */}
          <div className="space-y-2">
            <label className={labelCls}>Dispatch To — Client</label>
            {clients.length > 0 && (
              <select
                value={selectedPhone}
                onChange={e => { setSelectedPhone(e.target.value); setManualPhone(''); }}
                className="w-full bg-void-black border border-white/10 focus:border-cool-blue rounded-xl px-3 py-2 text-[10px] font-mono text-starlight outline-none transition-colors cursor-pointer"
              >
                <option value="">— Select a client —</option>
                {clients.map(c => (
                  <option key={c.phone} value={c.phone}>{c.label}</option>
                ))}
              </select>
            )}
            {!selectedPhone && (
              <div>
                <input
                  value={manualPhone}
                  onChange={e => setManualPhone(e.target.value)}
                  placeholder={clients.length > 0 ? 'Or enter phone manually: (715) 555-0100' : 'Client phone: (715) 555-0100'}
                  className="w-full bg-void-black border border-white/10 focus:border-cool-blue rounded-xl px-3 py-2 text-[10px] font-mono text-starlight outline-none transition-colors"
                />
                {manualPhone && !normalizePhone(manualPhone) && (
                  <p className="text-[9px] text-alert-rose font-mono mt-1">Enter a full 10-digit US number</p>
                )}
              </div>
            )}
          </div>

          {/* Materials table */}
          {localMaterials.length > 0 && (
            <section>
              <h3 className="text-[9px] font-black uppercase tracking-widest text-starlight/50 mb-2">Materials Added</h3>
              <div className="border border-white/10 rounded-xl overflow-hidden">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-white/10 bg-white/3">
                      <th className={thCls}>Item</th>
                      <th className={`${thCls} text-right`}>Qty</th>
                      <th className={`${thCls} text-right hidden sm:table-cell`}>Unit Price</th>
                      <th className={`${thCls} text-right`}>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {localMaterials.map((m, i) => (
                      <tr key={i} className={`border-t border-white/5 ${i % 2 === 0 ? 'bg-white/2' : ''}`}>
                        <td className={`${tdCls} text-starlight/80 max-w-[200px] truncate`}>{m.name}</td>
                        <td className={`${tdCls} text-right`}>
                          {editingCell === `mat-qty-${i}` ? (
                            <input autoFocus type="number" step="1" value={editValue}
                              onChange={e => setEditValue(e.target.value)}
                              onBlur={() => commitMatEdit(i, 'quantity')}
                              onKeyDown={e => { if (e.key === 'Enter') commitMatEdit(i, 'quantity'); if (e.key === 'Escape') setEditingCell(null); }}
                              className={inputCls} />
                          ) : (
                            <button onClick={() => startEdit(`mat-qty-${i}`, m.quantity)} className={cellBtn}>{m.quantity}</button>
                          )}
                        </td>
                        <td className={`${tdCls} text-right hidden sm:table-cell`}>
                          {editingCell === `mat-price-${i}` ? (
                            <input autoFocus type="number" step="0.01" value={editValue}
                              onChange={e => setEditValue(e.target.value)}
                              onBlur={() => commitMatEdit(i, 'unit_price')}
                              onKeyDown={e => { if (e.key === 'Enter') commitMatEdit(i, 'unit_price'); if (e.key === 'Escape') setEditingCell(null); }}
                              className={inputCls} />
                          ) : (
                            <button onClick={() => startEdit(`mat-price-${i}`, m.unit_price)} className={cellBtn}>${m.unit_price.toFixed(2)}</button>
                          )}
                        </td>
                        <td className={`${tdCls} text-right text-cool-blue font-black`}>${(m.total ?? 0).toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* Labor table */}
          {localLabor.length > 0 && (
            <section>
              <h3 className="text-[9px] font-black uppercase tracking-widest text-starlight/50 mb-2">Labor Added</h3>
              <div className="border border-white/10 rounded-xl overflow-hidden">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-white/10 bg-white/3">
                      <th className={thCls}>Role</th>
                      <th className={`${thCls} text-right`}>Hours</th>
                      <th className={`${thCls} text-right hidden sm:table-cell`}>Rate/hr</th>
                      <th className={`${thCls} text-right`}>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {localLabor.map((l, i) => (
                      <tr key={i} className={`border-t border-white/5 ${i % 2 === 0 ? 'bg-white/2' : ''}`}>
                        <td className={`${tdCls} text-starlight/80 max-w-[200px] truncate`}>{l.role}</td>
                        <td className={`${tdCls} text-right`}>
                          {editingCell === `lab-hrs-${i}` ? (
                            <input autoFocus type="number" step="0.5" value={editValue}
                              onChange={e => setEditValue(e.target.value)}
                              onBlur={() => commitLabEdit(i, 'hours')}
                              onKeyDown={e => { if (e.key === 'Enter') commitLabEdit(i, 'hours'); if (e.key === 'Escape') setEditingCell(null); }}
                              className={inputCls} />
                          ) : (
                            <button onClick={() => startEdit(`lab-hrs-${i}`, l.hours)} className={cellBtn}>{l.hours}</button>
                          )}
                        </td>
                        <td className={`${tdCls} text-right hidden sm:table-cell`}>
                          {editingCell === `lab-rate-${i}` ? (
                            <input autoFocus type="number" step="1" value={editValue}
                              onChange={e => setEditValue(e.target.value)}
                              onBlur={() => commitLabEdit(i, 'rate')}
                              onKeyDown={e => { if (e.key === 'Enter') commitLabEdit(i, 'rate'); if (e.key === 'Escape') setEditingCell(null); }}
                              className={inputCls} />
                          ) : (
                            <button onClick={() => startEdit(`lab-rate-${i}`, l.rate)} className={cellBtn}>${l.rate.toFixed(2)}</button>
                          )}
                        </td>
                        <td className={`${tdCls} text-right text-cool-blue font-black`}>${(l.total ?? 0).toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* Exclusions */}
          {changeOrder.exclusions && changeOrder.exclusions.length > 0 && (
            <section>
              <h3 className="text-[9px] font-black uppercase tracking-widest text-starlight/50 mb-2">Exclusions</h3>
              <div className="bg-alert-rose/5 border border-alert-rose/15 rounded-xl px-4 py-3">
                <ul className="space-y-1">
                  {changeOrder.exclusions.map((ex, i) => (
                    <li key={i} className="text-[10px] text-starlight/70 font-mono">{ex}</li>
                  ))}
                </ul>
              </div>
            </section>
          )}

          {/* Totals */}
          <section className="border border-white/10 rounded-xl overflow-hidden">
            <div className="divide-y divide-white/5">
              <div className="flex justify-between items-center px-4 py-2 text-[10px] font-mono text-starlight/60">
                <span>Materials subtotal</span><span>${matSubtotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between items-center px-4 py-2 text-[10px] font-mono text-starlight/60">
                <span>Labor subtotal</span><span>${labSubtotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between items-center px-4 py-2 text-[10px] font-mono text-starlight/60">
                <span>WI Sales Tax (5.5%)</span><span>${taxAmt.toFixed(2)}</span>
              </div>
              <div className="flex justify-between items-center px-4 py-3 text-mini font-black text-cool-blue bg-cool-blue/5">
                <span>Change Order Total</span><span>${coTotal.toFixed(2)}</span>
              </div>
            </div>
          </section>

        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-white/10 shrink-0 space-y-3">
          {dispatchError && (
            <div className="flex items-center gap-2 text-[10px] text-alert-rose font-mono bg-alert-rose/5 border border-alert-rose/20 rounded-xl px-3 py-2">
              <AlertTriangle className="w-3 h-3 shrink-0" />
              {dispatchError}
            </div>
          )}
          <div className="flex items-center justify-end gap-3">
            <button
              onClick={onClose}
              className="px-5 py-2 border border-white/10 text-starlight/70 hover:bg-white/5 rounded-full text-micro font-black transition-all cursor-pointer uppercase tracking-widest"
            >
              Cancel
            </button>
            <button
              onClick={handleDispatch}
              disabled={!validPhone || dispatching}
              className="bg-gradient-to-r from-cool-blue to-soft-violet text-void-black font-black tracking-widest text-micro px-6 py-2 rounded-full transition-all cursor-pointer flex items-center gap-1.5 uppercase shadow-lg shadow-cool-blue/20 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {dispatching
                ? <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                : <Send className="w-3.5 h-3.5" />}
              {dispatching ? 'Dispatching…' : 'Dispatch Authorization'}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
