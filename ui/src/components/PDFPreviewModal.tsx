import { useState, useEffect, useRef } from "react";
import { X, Eye, Send, RefreshCw } from "lucide-react";
import type { MaterialItem, LaborItem } from "../types";

interface Props {
  open: boolean;
  authToken: string;
  estimateId: string;
  projectName: string;
  project: {
    materials: MaterialItem[];
    labor: LaborItem[];
    client_name?: string;
    client_address?: string;
    client_phone?: string;
    scope_of_work?: string;
  };
  onClose: () => void;
  onConfirmSend: (client: { name: string; phone: string; address: string }) => Promise<void>;
  onClientDetailsSaved: (name: string, phone: string, address: string) => void;
}

export default function PDFPreviewModal({ open, authToken, estimateId, projectName, project, onClose, onConfirmSend, onClientDetailsSaved }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const blobUrlRef = useRef<string | null>(null);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);

  const [localName, setLocalName] = useState('');
  const [localPhone, setLocalPhone] = useState('');
  const [localAddress, setLocalAddress] = useState('');

  useEffect(() => {
    if (open) {
      setLocalName(project.client_name ?? '');
      setLocalPhone(project.client_phone ?? '');
      setLocalAddress(project.client_address ?? '');
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setError(null);

    fetch('/api/preview-pdf', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`,
      },
      body: JSON.stringify({ projectName, project }),
    })
      .then(async (r) => {
        if (!r.ok) {
          const d = await r.json().catch(() => ({}));
          throw new Error(d.error || `Preview failed (${r.status})`);
        }
        return r.blob();
      })
      .then((blob) => {
        if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
        const url = URL.createObjectURL(blob);
        blobUrlRef.current = url;
        setBlobUrl(url);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, retryKey]);

  const handleClose = () => {
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = null;
    }
    setBlobUrl(null);
    setError(null);
    setSending(false);
    onClose();
  };

  const handleSend = async () => {
    setSending(true);
    setError(null);
    try {
      // Save client details to Firestore first so generate-pdf reads them fresh
      await fetch(`/api/estimates/${estimateId}/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
        body: JSON.stringify({ client_name: localName, client_address: localAddress, client_phone: localPhone }),
      });
      onClientDetailsSaved(localName, localPhone, localAddress);
      await onConfirmSend({ name: localName, phone: localPhone, address: localAddress });
      handleClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Send failed — please try again.');
    } finally {
      setSending(false);
    }
  };

  const inputCls = "w-full bg-void-black border border-white/10 focus:border-cool-blue rounded-lg px-2 py-1.5 text-[10px] font-mono text-starlight outline-none transition-colors";
  const labelCls = "block text-[9px] uppercase font-black text-starlight/40 font-mono tracking-widest mb-1";

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-void-black/85 backdrop-blur-md flex items-center justify-center p-4">
      <div className="glass-panel border-white/10 max-w-5xl w-full rounded-2xl flex flex-col shadow-2xl"
           style={{ height: '90vh' }}>

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 shrink-0">
          <div className="flex items-center gap-2">
            <Eye className="w-4 h-4 text-soft-violet" />
            <h2 className="text-mini font-black text-starlight uppercase tracking-widest">Preview Estimate</h2>
          </div>
          <button
            onClick={handleClose}
            disabled={sending}
            className="text-starlight/50 hover:text-alert-rose transition-colors cursor-pointer disabled:opacity-40"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* iframe area */}
        <div className="flex-1 relative overflow-hidden">
          {loading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
              <RefreshCw className="w-8 h-8 text-soft-violet animate-spin" />
              <span className="text-micro text-starlight/50 font-mono uppercase tracking-widest">Building preview…</span>
            </div>
          )}
          {error && !loading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-8">
              <p className="text-mini text-alert-rose font-mono text-center">{error}</p>
              <button
                onClick={() => setRetryKey(k => k + 1)}
                className="text-micro font-black uppercase tracking-widest px-4 py-2 rounded-full border border-alert-rose/50 text-alert-rose hover:bg-alert-rose/10 transition-colors cursor-pointer"
              >
                Retry
              </button>
            </div>
          )}
          {blobUrl && !loading && (
            <iframe
              src={blobUrl}
              className="w-full h-full border-0 bg-white rounded-b-none"
              sandbox="allow-same-origin"
              title="Estimate preview"
            />
          )}
        </div>

        {/* Footer */}
        <div className="px-6 pt-4 pb-5 border-t border-white/10 shrink-0 space-y-3">

          {/* Recipient strip */}
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_2fr] gap-2">
            <div>
              <label className={labelCls}>Client Name</label>
              <input
                value={localName}
                onChange={e => setLocalName(e.target.value)}
                placeholder="Jane Smith"
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Phone</label>
              <input
                value={localPhone}
                onChange={e => setLocalPhone(e.target.value)}
                placeholder="(715) 555-0100"
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Address</label>
              <input
                value={localAddress}
                onChange={e => setLocalAddress(e.target.value)}
                placeholder="123 Oak St, Wausau WI"
                className={inputCls}
              />
            </div>
          </div>

          {/* Button row */}
          <div className="flex items-center justify-between gap-4">
            <p className="text-micro text-starlight/40 font-mono leading-snug">
              Estimate number assigned on send · Logo and company info pulled from Settings
            </p>
            <div className="flex items-center gap-3 shrink-0">
              <button
                onClick={handleClose}
                disabled={sending}
                className="px-5 py-2 border border-white/10 text-starlight/70 hover:bg-white/5 rounded-full text-micro font-black transition-all cursor-pointer uppercase tracking-widest disabled:opacity-40"
              >
                Close
              </button>
              <button
                onClick={handleSend}
                disabled={sending || loading || !!error}
                className="bg-gradient-to-r from-cool-blue to-soft-violet text-void-black font-black tracking-widest text-micro px-6 py-2 rounded-full transition-all cursor-pointer flex items-center gap-1.5 uppercase shadow-lg shadow-cool-blue/20 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {sending
                  ? <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  : <Send className="w-3.5 h-3.5" />}
                {sending ? 'Sending…' : 'Send PDF'}
              </button>
            </div>
          </div>

        </div>

      </div>
    </div>
  );
}
