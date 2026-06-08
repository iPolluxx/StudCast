import { useEffect, useRef } from "react";
import { X, Sparkles, RefreshCw } from "lucide-react";
import { trapTab } from "../focusTrap";

interface Props {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  loading: boolean;
  disabled: boolean;
  onClose: () => void;
}

export default function ChangeOrderInputModal({ value, onChange, onSubmit, loading, disabled, onClose }: Props) {
  const panelRef = useRef<HTMLDivElement>(null);

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
  }, [loading, onClose]);

  return (
    <div
      className="fixed inset-0 z-50 bg-void-black/85 backdrop-blur-md flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget && !loading) onClose(); }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Create change order"
        tabIndex={-1}
        className="glass-panel border-white/10 max-w-lg w-full rounded-2xl flex flex-col shadow-2xl outline-none animate-fade-in"
      >

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 shrink-0">
          <div>
            <h2 className="text-mini font-black text-starlight uppercase tracking-widest font-mono">
              Change Order
            </h2>
            <p className="text-mini text-starlight/60 font-mono mt-0.5">Describe what's changing</p>
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
        <div className="flex-1 px-6 py-5">
          <label htmlFor="co-input-text" className="block text-micro uppercase font-black text-starlight/60 font-mono tracking-widest mb-2">
            Change description
          </label>
          <textarea
            id="co-input-text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="e.g., Add 12 sheets of OSB and 4 hours of framing labor for the west wall extension..."
            rows={5}
            disabled={loading}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && !disabled && !loading) {
                e.preventDefault();
                onSubmit();
              }
            }}
            className="w-full bg-void-black border border-white/10 focus:border-soft-violet/60 focus:ring-1 focus:ring-soft-violet/10 rounded-xl px-3 py-2.5 text-mini font-mono text-starlight outline-none transition-colors resize-none disabled:opacity-50"
          />
          <p className="text-micro text-starlight/30 font-mono mt-1.5">
            ⌘↵ to generate
          </p>
        </div>

        {/* Footer */}
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
              onClick={onSubmit}
              disabled={disabled || loading}
              className="bg-gradient-to-r from-soft-violet to-cool-blue text-void-black font-black tracking-widest text-micro px-6 py-2 rounded-full transition-all cursor-pointer flex items-center gap-1.5 uppercase shadow-lg shadow-soft-violet/20 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {loading
                ? <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                : <Sparkles className="w-3.5 h-3.5" />}
              {loading ? 'Generating…' : 'Generate Change Order'}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
