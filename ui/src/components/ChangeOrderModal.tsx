import { useState, useEffect, useRef } from "react";
import { X, Send, RefreshCw, AlertTriangle } from "lucide-react";
import type { ChangeOrder, MaterialItem, LaborItem } from "../types";
import { trapTab } from "../focusTrap";

interface ClientOption {
  label: string;
  email: string;
}

interface Props {
  open: boolean;
  changeOrder: ChangeOrder | null;
  clients: ClientOption[];
  authToken: string | null;
  activeEstimateId: string | null;
  taxRate?: number;
  onClose: () => void;
  onDispatched: (email: string) => void;
}

function normalizeEmail(raw: string): string | null {
  const v = raw.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v) ? v : null;
}

export default function ChangeOrderModal({ open, changeOrder, clients, authToken, activeEstimateId, taxRate = 0.055, onClose, onDispatched }: Props) {
  const [selectedEmail, setSelectedEmail] = useState('');
  const [manualEmail, setManualEmail] = useState('');
  const [localMaterials, setLocalMaterials] = useState<MaterialItem[]>([]);
  const [localLabor, setLocalLabor] = useState<LaborItem[]>([]);
  const [editingCell, setEditingCell] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [dirty, setDirty] = useState(false);
  const [dispatching, setDispatching] = useState(false);
  const [dispatchError, setDispatchError] = useState<string | null>(null);

  const panelRef = useRef<HTMLDivElement>(null);
  const editingRef = useRef<string | null>(null);
  editingRef.current = editingCell;

  useEffect(() => {
    if (changeOrder && open) {
      setLocalMaterials(changeOrder.added_materials ?? []);
      setLocalLabor(changeOrder.added_labor ?? []);
      setSelectedEmail('');
      setManualEmail('');
      setDirty(false);
      setDispatchError(null);
      // Move focus into the dialog for keyboard + screen-reader users
      requestAnimationFrame(() => panelRef.current?.focus());
    }
  }, [changeOrder, open]);

  // Esc closes the dialog (or cancels a mid-edit cell); Tab is trapped inside it
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (editingRef.current) { setEditingCell(null); return; }
        onClose();
        return;
      }
      trapTab(e, panelRef.current);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const effectiveEmail = selectedEmail || manualEmail;
  const validEmail = normalizeEmail(effectiveEmail);
  const hasItems = localMaterials.length > 0 || localLabor.length > 0;

  const matSubtotal = localMaterials.reduce((s, m) => s + (m.total ?? 0), 0);
  const labSubtotal = localLabor.reduce((s, l) => s + (l.total ?? 0), 0);
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
    if (!validEmail || !hasItems || !changeOrder || !authToken) return;
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

      // 2. Email the approval link to the client (review page + total)
      const resp = await fetch('/api/change-orders/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
        body: JSON.stringify({
          changeOrderId: changeOrder.id,
          parentEstimateId: activeEstimateId,
          clientEmail: validEmail,
        }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'Send failed');
      onDispatched(validEmail!);
    } catch (e: any) {
      setDispatchError(e.message);
    } finally {
      setDispatching(false);
    }
  };

  const cellBtn = "text-starlight hover:text-cool-blue transition-colors cursor-pointer font-mono text-mini";
  const thCls = "text-left px-2 sm:px-3 py-2 text-micro font-black uppercase tracking-widest text-starlight/60";
  const tdCls = "px-2 sm:px-3 py-2 text-mini font-mono";
  const inputCls = "w-20 sm:w-24 bg-void-black border border-cool-blue/50 rounded px-1.5 py-1 text-right text-cool-blue outline-none text-mini font-mono";
  const labelCls = "block text-micro uppercase font-black text-starlight/60 font-mono tracking-widest mb-1";

  if (!open || !changeOrder) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-void-black/85 backdrop-blur-md flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Change order review"
        tabIndex={-1}
        className="glass-panel border-white/10 max-w-5xl w-full rounded-2xl flex flex-col shadow-2xl max-h-[90vh] outline-none animate-fade-in"
      >

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 shrink-0">
          <div>
            <h2 className="text-mini font-black text-starlight uppercase tracking-widest">Change Order</h2>
            <p className="text-micro text-soft-violet font-mono mt-0.5">{changeOrder.id}</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="flex h-11 w-11 -mr-2.5 items-center justify-center text-starlight/60 hover:text-alert-rose transition-colors cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

          {/* Change summary */}
          {changeOrder.change_summary && (
            <p className="text-mini text-starlight/70 italic font-sans leading-relaxed bg-soft-violet/5 border border-soft-violet/15 rounded-xl px-3 py-2.5">
              "{changeOrder.change_summary}"
            </p>
          )}

          {/* Client picker */}
          <div className="space-y-2">
            <label htmlFor="co-client" className={labelCls}>Send to</label>
            {clients.length > 0 && (
              <select
                id="co-client"
                value={selectedEmail}
                onChange={e => { setSelectedEmail(e.target.value); setManualEmail(''); }}
                style={{ colorScheme: 'dark' }}
                className="w-full bg-void-black border border-white/10 focus:border-cool-blue rounded-xl px-3 py-2 text-mini font-mono text-starlight outline-none transition-colors cursor-pointer"
              >
                <option value="">Choose a client…</option>
                {clients.map(c => (
                  <option key={c.email} value={c.email}>{c.label}</option>
                ))}
              </select>
            )}
            {!selectedEmail && (
              <div>
                <input
                  id="co-email"
                  type="email"
                  aria-label="Client email address"
                  value={manualEmail}
                  onChange={e => setManualEmail(e.target.value)}
                  placeholder={clients.length > 0 ? 'Or type an email: client@example.com' : 'Client email: client@example.com'}
                  className="w-full bg-void-black border border-white/10 focus:border-cool-blue rounded-xl px-3 py-2 text-mini font-mono text-starlight outline-none transition-colors"
                />
                {manualEmail && !normalizeEmail(manualEmail) && (
                  <p className="text-micro text-alert-rose font-mono mt-1">Enter a valid email address</p>
                )}
              </div>
            )}
          </div>

          {/* Empty state — Gemini found nothing to add */}
          {!hasItems && (
            <div className="border border-white/10 rounded-xl px-4 py-6 text-center">
              <p className="text-mini text-starlight/60 font-mono">No materials or labor were found in this change.</p>
              <p className="text-micro text-starlight/60 font-mono mt-1">Close and describe the change with specific items and quantities.</p>
            </div>
          )}

          {/* Materials table */}
          {localMaterials.length > 0 && (
            <section>
              <h3 className="text-micro font-black uppercase tracking-widest text-starlight/60 mb-2">Materials added</h3>
              <div className="border border-white/10 rounded-xl overflow-x-auto">
                <table className="w-full min-w-[20rem]">
                  <thead>
                    <tr className="border-b border-white/10 bg-white/3">
                      <th className={thCls}>Item</th>
                      <th className={`${thCls} text-right`}>Qty</th>
                      <th className={`${thCls} text-right`}>Unit Price</th>
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
                              aria-label={`Quantity for ${m.name}`}
                              onChange={e => setEditValue(e.target.value)}
                              onBlur={() => commitMatEdit(i, 'quantity')}
                              onKeyDown={e => { if (e.key === 'Enter') commitMatEdit(i, 'quantity'); if (e.key === 'Escape') { e.stopPropagation(); setEditingCell(null); } }}
                              className={inputCls} />
                          ) : (
                            <button onClick={() => startEdit(`mat-qty-${i}`, m.quantity)} aria-label={`Edit quantity for ${m.name}`} className={cellBtn}>{m.quantity}</button>
                          )}
                        </td>
                        <td className={`${tdCls} text-right`}>
                          {editingCell === `mat-price-${i}` ? (
                            <input autoFocus type="number" step="0.01" value={editValue}
                              aria-label={`Unit price for ${m.name}`}
                              onChange={e => setEditValue(e.target.value)}
                              onBlur={() => commitMatEdit(i, 'unit_price')}
                              onKeyDown={e => { if (e.key === 'Enter') commitMatEdit(i, 'unit_price'); if (e.key === 'Escape') { e.stopPropagation(); setEditingCell(null); } }}
                              className={inputCls} />
                          ) : (
                            <button onClick={() => startEdit(`mat-price-${i}`, m.unit_price)} aria-label={`Edit unit price for ${m.name}`} className={cellBtn}>${m.unit_price.toFixed(2)}</button>
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
              <h3 className="text-micro font-black uppercase tracking-widest text-starlight/60 mb-2">Labor added</h3>
              <div className="border border-white/10 rounded-xl overflow-x-auto">
                <table className="w-full min-w-[20rem]">
                  <thead>
                    <tr className="border-b border-white/10 bg-white/3">
                      <th className={thCls}>Role</th>
                      <th className={`${thCls} text-right`}>Hours</th>
                      <th className={`${thCls} text-right`}>Rate/hr</th>
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
                              aria-label={`Hours for ${l.role}`}
                              onChange={e => setEditValue(e.target.value)}
                              onBlur={() => commitLabEdit(i, 'hours')}
                              onKeyDown={e => { if (e.key === 'Enter') commitLabEdit(i, 'hours'); if (e.key === 'Escape') { e.stopPropagation(); setEditingCell(null); } }}
                              className={inputCls} />
                          ) : (
                            <button onClick={() => startEdit(`lab-hrs-${i}`, l.hours)} aria-label={`Edit hours for ${l.role}`} className={cellBtn}>{l.hours}</button>
                          )}
                        </td>
                        <td className={`${tdCls} text-right`}>
                          {editingCell === `lab-rate-${i}` ? (
                            <input autoFocus type="number" step="1" value={editValue}
                              aria-label={`Rate for ${l.role}`}
                              onChange={e => setEditValue(e.target.value)}
                              onBlur={() => commitLabEdit(i, 'rate')}
                              onKeyDown={e => { if (e.key === 'Enter') commitLabEdit(i, 'rate'); if (e.key === 'Escape') { e.stopPropagation(); setEditingCell(null); } }}
                              className={inputCls} />
                          ) : (
                            <button onClick={() => startEdit(`lab-rate-${i}`, l.rate)} aria-label={`Edit rate for ${l.role}`} className={cellBtn}>${l.rate.toFixed(2)}</button>
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
              <h3 className="text-micro font-black uppercase tracking-widest text-starlight/60 mb-2">Not included</h3>
              <div className="bg-alert-rose/5 border border-alert-rose/15 rounded-xl px-4 py-3">
                <ul className="space-y-1">
                  {changeOrder.exclusions.map((ex, i) => (
                    <li key={i} className="text-mini text-starlight/70 font-mono">{ex}</li>
                  ))}
                </ul>
              </div>
            </section>
          )}

          {/* Totals */}
          {hasItems && (
            <section className="border border-white/10 rounded-xl overflow-hidden">
              <div className="divide-y divide-white/5">
                <div className="flex justify-between items-center px-4 py-2 text-mini font-mono text-starlight/60">
                  <span>Materials subtotal</span><span>${matSubtotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between items-center px-4 py-2 text-mini font-mono text-starlight/60">
                  <span>Labor subtotal</span><span>${labSubtotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between items-center px-4 py-2 text-mini font-mono text-starlight/60">
                  <span>Sales tax ({(taxRate * 100).toFixed(2).replace(/\.?0+$/, '')}%)</span><span>${taxAmt.toFixed(2)}</span>
                </div>
                <div className="flex justify-between items-center px-4 py-4 bg-cool-blue/5">
                  <span className="text-micro font-black uppercase tracking-widest text-starlight/60">Change order total</span>
                  <span className="text-xl font-black text-cool-blue font-mono">${coTotal.toFixed(2)}</span>
                </div>
              </div>
            </section>
          )}

        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-white/10 shrink-0 space-y-3">
          {dispatchError && (
            <div className="flex items-center gap-2 text-mini text-alert-rose font-mono bg-alert-rose/5 border border-alert-rose/20 rounded-xl px-3 py-2">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              {dispatchError}
            </div>
          )}
          {/* Blocking reason — visible and specific when CTA is locked */}
          {(!validEmail || !hasItems) && !dispatchError && (
            <div className="flex items-center gap-2 text-mini font-mono bg-void-black/60 border border-white/8 rounded-xl px-3 py-2 text-starlight/60">
              {!hasItems
                ? 'No items to send — close and describe the change with specific materials or labor.'
                : 'Enter a client email address above to enable sending.'}
            </div>
          )}

          <div className="flex items-center justify-between gap-3">
            <p className="text-micro text-starlight/60 font-mono">
              {validEmail && hasItems
                ? <>Will email a review link to <span className="text-cool-blue font-black">{validEmail}</span></>
                : null}
            </p>
            <div className="flex items-center gap-3 shrink-0">
              <button
                onClick={onClose}
                className="px-5 py-2 border border-white/10 text-starlight/70 hover:bg-white/5 rounded-full text-micro font-black transition-all cursor-pointer uppercase tracking-widest"
              >
                Cancel
              </button>
              <button
                onClick={handleDispatch}
                disabled={!validEmail || !hasItems || dispatching}
                className="bg-gradient-to-r from-cool-blue to-soft-violet text-void-black font-black tracking-widest text-micro px-6 py-2 rounded-full transition-all cursor-pointer flex items-center gap-1.5 uppercase shadow-lg shadow-cool-blue/20 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {dispatching
                  ? <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  : <Send className="w-3.5 h-3.5" />}
                {dispatching ? 'Sending…' : 'Email to client'}
              </button>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
