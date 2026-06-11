import { useState, useEffect, useRef } from "react";
import { X, Send, RefreshCw, CheckCircle, AlertTriangle } from "lucide-react";
import { trapTab } from "../focusTrap";

interface Props {
  estimateId: string;
  estimateTotal: number;
  approvedCoTotal: number;
  clientName: string;
  contractorEmail: string;
  authToken: string;
  onClose: () => void;
  onSuccess: (r: { balance_due: number; invoice_number: string }) => void;
}

type PaymentTerms = 'due_on_receipt' | 'net_15' | 'net_30';

export default function InvoiceModal({
  estimateId,
  estimateTotal,
  approvedCoTotal,
  clientName,
  contractorEmail,
  authToken,
  onClose,
  onSuccess,
}: Props) {
  const [depositAmount, setDepositAmount] = useState(0);
  const [paymentTerms, setPaymentTerms] = useState<PaymentTerms>('due_on_receipt');
  const [paymentMethodNote, setPaymentMethodNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ balance_due: number; invoice_number: string } | null>(null);

  const panelRef = useRef<HTMLDivElement>(null);

  const previewBalance = Math.max(0, estimateTotal + approvedCoTotal - depositAmount);

  useEffect(() => {
    requestAnimationFrame(() => panelRef.current?.focus());
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !loading) { onClose(); return; }
      trapTab(e, panelRef.current);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, onClose]);

  const fmt = (n: number) =>
    n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const handleSubmit = async () => {
    setLoading(true);
    setError(null);
    try {
      const resp = await fetch(`/api/estimates/${estimateId}/generate-invoice`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          payment_terms: paymentTerms,
          payment_method_note: paymentMethodNote,
          deposit_amount: depositAmount,
        }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || `Failed (${resp.status})`);
      setResult({ balance_due: data.balance_due, invoice_number: data.invoice_number });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Invoice generation failed — please try again.');
    } finally {
      setLoading(false);
    }
  };

  const inputCls = "w-full bg-void-black border border-white/10 focus:border-cool-blue rounded-lg px-2 py-1.5 text-mini font-mono text-starlight outline-none transition-colors";
  const labelCls = "block text-micro uppercase font-black text-starlight/60 font-mono tracking-widest mb-1";

  return (
    <div
      className="fixed inset-0 z-50 bg-void-black/85 backdrop-blur-md flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget && !loading) onClose(); }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Generate final invoice"
        tabIndex={-1}
        className="glass-panel border-white/10 max-w-lg w-full rounded-2xl flex flex-col shadow-2xl outline-none animate-fade-in"
      >

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 shrink-0">
          <div>
            <h2 className="text-mini font-black text-starlight uppercase tracking-widest font-mono">
              Final Invoice
            </h2>
            <p className="text-mini text-starlight/60 font-mono mt-0.5">{clientName}</p>
          </div>
          <button
            onClick={onClose}
            disabled={loading}
            aria-label="Close"
            className="flex h-11 w-11 -mr-2.5 items-center justify-center text-starlight/60 hover:text-alert-rose transition-colors cursor-pointer disabled:opacity-40"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

          {result ? (
            /* Confirmation state */
            <div className="flex flex-col items-center gap-4 py-4 text-center">
              <CheckCircle className="w-10 h-10 text-live-emerald" />
              <div>
                <p role="status" className="text-base font-black text-live-emerald font-mono">
                  Invoice #{result.invoice_number} sent
                </p>
                <p className="text-xl font-semibold text-cool-blue font-mono mt-2">
                  Balance due: ${fmt(result.balance_due)}
                </p>
              </div>
              <button
                onClick={() => { onSuccess(result); onClose(); }}
                className="bg-gradient-to-r from-cool-blue to-soft-violet text-void-black font-black tracking-widest text-micro px-6 py-2 rounded-full transition-all cursor-pointer flex items-center gap-1.5 uppercase shadow-lg shadow-cool-blue/20"
              >
                Done
              </button>
            </div>
          ) : (
            <>
              {/* Delivery path — show exactly where the invoice goes */}
              {contractorEmail && (
                <div className="flex items-center gap-2 text-mini font-mono bg-void-black/60 border border-white/8 rounded-xl px-3 py-2">
                  <span className="text-starlight/70 shrink-0">Invoice sent to</span>
                  <span className="text-cool-blue font-black truncate">{contractorEmail}</span>
                </div>
              )}

              {/* Live balance breakdown */}
              <section className="border border-white/10 rounded-xl overflow-hidden">
                <div className="divide-y divide-white/5">
                  <div className="flex justify-between items-center px-4 py-2 text-mini font-mono">
                    <span className="text-starlight/60">Estimate total</span>
                    <span className="text-starlight">${fmt(estimateTotal)}</span>
                  </div>
                  <div className="flex justify-between items-center px-4 py-2 text-mini font-mono">
                    <span className="text-starlight/60">Approved changes</span>
                    <span className="text-starlight">${fmt(approvedCoTotal)}</span>
                  </div>
                  <div className="flex justify-between items-center px-4 py-2 text-mini font-mono">
                    <span className="text-starlight/60">Deposit paid</span>
                    <span className="text-starlight/60">−${fmt(depositAmount)}</span>
                  </div>
                  <div className="flex justify-between items-center px-4 py-3 bg-cool-blue/5">
                    <span className="text-micro font-black uppercase tracking-widest text-starlight/60">Balance due</span>
                    <span className="text-xl font-semibold text-cool-blue font-mono">${fmt(previewBalance)}</span>
                  </div>
                </div>
              </section>

              {/* Inputs */}
              <div className="space-y-4">
                <div>
                  <label htmlFor="inv-deposit" className={labelCls}>Deposit received</label>
                  <div className="relative">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-mini text-starlight/70 font-mono pointer-events-none select-none">
                      $
                    </span>
                    <input
                      id="inv-deposit"
                      type="number"
                      min={0}
                      step={0.01}
                      value={depositAmount}
                      onChange={e => setDepositAmount(parseFloat(e.target.value) || 0)}
                      className={`${inputCls} pl-6`}
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="inv-terms" className={labelCls}>Payment terms</label>
                  <select
                    id="inv-terms"
                    value={paymentTerms}
                    onChange={e => setPaymentTerms(e.target.value as PaymentTerms)}
                    style={{ colorScheme: 'dark' }}
                    className={`${inputCls} cursor-pointer`}
                  >
                    <option value="due_on_receipt">Due on receipt</option>
                    <option value="net_15">Net 15 days</option>
                    <option value="net_30">Net 30 days</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="inv-note" className={labelCls}>Payment instructions</label>
                  <input
                    id="inv-note"
                    type="text"
                    value={paymentMethodNote}
                    onChange={e => setPaymentMethodNote(e.target.value)}
                    placeholder="e.g. Check payable to Acme LLC · Zelle: 555-0100"
                    className={inputCls}
                  />
                </div>
              </div>

              {/* Inline error */}
              {error && (
                <div role="alert" className="flex items-center gap-2 text-mini text-alert-rose font-mono bg-alert-rose/5 border border-alert-rose/20 rounded-xl px-3 py-2">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  {error}
                </div>
              )}
            </>
          )}

        </div>

        {/* Footer — hidden after success */}
        {!result && (
          <div className="px-6 py-4 border-t border-white/10 shrink-0">
            <div className="flex items-center justify-end gap-3">
              <button
                onClick={onClose}
                disabled={loading}
                className="px-5 py-2 border border-white/10 text-starlight/70 hover:bg-white/5 rounded-full text-micro font-black transition-all cursor-pointer uppercase tracking-widest disabled:opacity-40"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={loading}
                className="bg-gradient-to-r from-cool-blue to-soft-violet text-void-black font-black tracking-widest text-micro px-6 py-2 rounded-full transition-all cursor-pointer flex items-center gap-1.5 uppercase shadow-lg shadow-cool-blue/20 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {loading
                  ? <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  : <Send className="w-3.5 h-3.5" />}
                {loading ? 'Generating…' : 'Generate & Send Invoice'}
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
