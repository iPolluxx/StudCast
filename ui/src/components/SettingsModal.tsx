import { useState, useEffect, useRef } from "react";
import { X, Building, ImagePlus, RefreshCw, BookOpen, AlertTriangle } from "lucide-react";
import type { ContractorUserSettings } from "../types";
import PriceSheetPanel from "./PriceSheetPanel";
import { trapTab } from "../focusTrap";

interface Props {
  open: boolean;
  settings: ContractorUserSettings;
  onSettingsChange: (s: ContractorUserSettings) => void;
  onClose: () => void;
  onSave: () => void;
  authToken: string | null;
  onLogoUploaded: (url: string) => void;
  onSubscriptionCanceled?: () => void;
}

export default function SettingsModal({ open, settings, onSettingsChange, onClose, onSave, authToken, onLogoUploaded, onSubscriptionCanceled }: Props) {
  const [logoUploading, setLogoUploading] = useState(false);
  const [logoError, setLogoError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"profile" | "prices">("profile");
  const [cancelConfirm, setCancelConfirm] = useState(false);
  const [canceling, setCanceling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [inviteCopied, setInviteCopied] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // Admin-only invite code. The endpoint 403s for non-admin users, so a null
  // result simply hides the widget — no role flag needed on the client.
  useEffect(() => {
    if (!open || !authToken) return;
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch('/api/auth/demo-code', { headers: { 'Authorization': `Bearer ${authToken}` } });
        const code = r.ok ? (await r.json()).code : null;
        if (!cancelled) setInviteCode(code || null);
      } catch { if (!cancelled) setInviteCode(null); }
    })();
    return () => { cancelled = true; };
  }, [open, authToken]);

  // Same dialog hygiene as the other modals: focus moves in on open, Escape
  // closes, and Tab is trapped inside the panel.
  useEffect(() => {
    if (!open) return;
    requestAnimationFrame(() => panelRef.current?.focus());
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return; }
      trapTab(e, panelRef.current);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const field = (label: string, key: keyof ContractorUserSettings, type = "text", step?: string) => (
    <div className="space-y-1">
      <label htmlFor={`settings-${key}`} className="uppercase font-bold text-starlight/60">{label}</label>
      <input
        id={`settings-${key}`}
        type={type}
        step={step}
        value={settings[key] as string | number}
        onChange={(e) => {
          const raw = e.target.value;
          const val = type === "number"
            ? (step ? parseFloat(raw) || 0 : parseInt(raw) || 0)
            : raw;
          onSettingsChange({ ...settings, [key]: val });
        }}
        className="w-full bg-void-black border border-white/10 rounded-xl px-3 py-2 text-starlight outline-none focus:border-cool-blue text-mini font-mono"
      />
    </div>
  );

  return (
    <div
      className="fixed inset-0 z-50 bg-void-black/80 backdrop-blur-md flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Contractor profile settings"
        tabIndex={-1}
        className={`glass-panel border-white/10 w-full rounded-2xl p-6 sm:p-8 shadow-2xl relative select-none flex flex-col outline-none transition-all duration-200 ${activeTab === "prices" ? "max-w-5xl max-h-[85vh]" : "max-w-lg"}`}
      >

        <button
          onClick={onClose}
          aria-label="Close settings"
          className="absolute top-3 right-3 flex h-11 w-11 items-center justify-center text-starlight/60 hover:text-alert-rose transition-colors cursor-pointer focus:outline-none"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header */}
        <div className="mb-5">
          <h2 className="text-lg font-black text-starlight flex items-center gap-2 uppercase tracking-wide">
            <Building className="w-5 h-5 text-cool-blue" />
            Contractor Profile Setup
          </h2>
          <p className="text-micro text-starlight/70 mt-1">
            Configure default values, license registries, and profit multipliers.
          </p>
        </div>

        {/* Tab switcher */}
        <div className="flex gap-1 mb-5 bg-white/5 rounded-xl p-1 w-fit">
          <button
            onClick={() => setActiveTab("profile")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-micro font-black uppercase tracking-widest transition-all cursor-pointer ${activeTab === "profile" ? "bg-cool-blue/20 text-cool-blue border border-cool-blue/30" : "text-starlight/70 hover:text-starlight"}`}
          >
            <Building className="w-3 h-3" />
            Profile
          </button>
          <button
            onClick={() => setActiveTab("prices")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-micro font-black uppercase tracking-widest transition-all cursor-pointer ${activeTab === "prices" ? "bg-cool-blue/20 text-cool-blue border border-cool-blue/30" : "text-starlight/70 hover:text-starlight"}`}
          >
            <BookOpen className="w-3 h-3" />
            Price Sheet
          </button>
        </div>

        {/* Profile tab */}
        {activeTab === "profile" && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 font-mono text-micro">

              {/* ── Logo upload ── */}
              <div className="sm:col-span-2 flex items-center gap-4 pb-2 border-b border-white/10">
                <div className="shrink-0">
                  {settings.company_logo_url ? (
                    <img
                      src={settings.company_logo_url}
                      alt="Company logo"
                      className="h-14 w-14 rounded-xl object-contain bg-white/5 border border-white/10 p-1"
                    />
                  ) : (
                    <div className="h-14 w-14 rounded-xl bg-gradient-to-br from-navy-deep to-navy-violet border border-white/10 flex items-center justify-center select-none">
                      <span className="text-base font-black text-starlight">
                        {(settings.company_name || 'CO').substring(0, 2).toUpperCase()}
                      </span>
                    </div>
                  )}
                </div>
                <div className="flex flex-col gap-1.5 min-w-0">
                  <label className="uppercase font-bold text-starlight/60 text-micro">Company Logo</label>
                  <label className={`inline-flex items-center gap-1.5 px-3 py-1.5 border border-cool-blue/30 hover:border-cool-blue/60 rounded-xl cursor-pointer transition-all hover:bg-cool-blue/5 text-cool-blue text-micro font-black uppercase tracking-widest ${logoUploading ? 'opacity-50 pointer-events-none' : ''}`}>
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/svg+xml"
                      className="hidden"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file || !authToken) return;
                        setLogoUploading(true);
                        setLogoError(null);
                        const form = new FormData();
                        form.append('logo', file);
                        try {
                          const r = await fetch('/api/settings/logo', {
                            method: 'POST',
                            headers: { 'Authorization': `Bearer ${authToken}` },
                            body: form,
                          });
                          const d = await r.json();
                          if (r.ok && d.company_logo_url) {
                            onLogoUploaded(d.company_logo_url);
                          } else {
                            setLogoError(d.error || 'Upload failed');
                          }
                        } catch {
                          setLogoError('Network error');
                        } finally {
                          setLogoUploading(false);
                          e.target.value = '';
                        }
                      }}
                    />
                    {logoUploading ? <RefreshCw className="w-3 h-3 animate-spin" /> : <ImagePlus className="w-3 h-3" />}
                    {logoUploading ? 'Uploading…' : 'Upload Logo'}
                  </label>
                  {logoError && <span role="alert" className="text-micro text-alert-rose font-mono">{logoError}</span>}
                  {settings.company_logo_url && !logoError && (
                    <span className="text-micro text-live-emerald font-mono">Logo saved</span>
                  )}
                </div>
              </div>

              {field("Company Name", "company_name")}
              {field("Bids Dispatch Email", "contact_email", "email")}
              <div className="sm:col-span-2">
                {field("Registered Shop Location", "company_address")}
              </div>
              {field("Dwelling Vendor Reg #", "license_number")}
              {field("Default Craft Labor ($/hr)", "default_labor_rate", "number")}
              {field("Global Mark-up Fee (%)", "global_markup_percent", "number")}
              {field("Regional Sales Tax (%)", "tax_rate", "number", "0.1")}
            </div>

            {/* Subscription management */}
            {settings.active_subscription && (
              <div className="pt-4 mt-4 border-t border-white/10">
                <p className="text-micro text-starlight/50 uppercase font-bold mb-2 tracking-widest">Subscription</p>
                {!cancelConfirm ? (
                  <button
                    onClick={() => { setCancelConfirm(true); setCancelError(null); }}
                    className="flex items-center gap-1.5 px-4 py-2 border border-alert-rose/30 text-alert-rose/80 hover:bg-alert-rose/10 hover:border-alert-rose/60 rounded-xl font-black uppercase font-mono text-micro tracking-wider transition-all cursor-pointer"
                  >
                    <AlertTriangle className="w-3 h-3" />
                    Cancel Subscription
                  </button>
                ) : (
                  <div className="flex flex-col gap-2">
                    <p className="text-micro text-alert-rose font-mono">
                      Your access continues until the end of the current billing period, then cancels. Are you sure?
                    </p>
                    {cancelError && <p className="text-micro text-alert-rose font-mono">{cancelError}</p>}
                    <div className="flex gap-2">
                      <button
                        onClick={() => { setCancelConfirm(false); setCancelError(null); }}
                        disabled={canceling}
                        className="px-4 py-1.5 border border-white/10 text-starlight/60 hover:bg-white/5 rounded-xl font-bold font-mono text-micro uppercase tracking-wider transition-all cursor-pointer disabled:opacity-50"
                      >
                        Keep Plan
                      </button>
                      <button
                        disabled={canceling}
                        onClick={async () => {
                          if (!authToken) return;
                          setCanceling(true);
                          setCancelError(null);
                          try {
                            const r = await fetch('/api/billing/cancel-subscription', {
                              method: 'POST',
                              headers: { 'Authorization': `Bearer ${authToken}` },
                            });
                            const d = await r.json();
                            if (r.ok && d.success) {
                              onSettingsChange({ ...settings, subscription_status: 'canceling' });
                              setCancelConfirm(false);
                              onSubscriptionCanceled?.();
                            } else {
                              setCancelError(d.error || 'Cancellation failed. Try again.');
                            }
                          } catch {
                            setCancelError('Network error. Try again.');
                          } finally {
                            setCanceling(false);
                          }
                        }}
                        className="flex items-center gap-1.5 px-4 py-1.5 bg-alert-rose/20 border border-alert-rose/40 text-alert-rose hover:bg-alert-rose/30 rounded-xl font-black font-mono text-micro uppercase tracking-wider transition-all cursor-pointer disabled:opacity-50"
                      >
                        {canceling ? <RefreshCw className="w-3 h-3 animate-spin" /> : <AlertTriangle className="w-3 h-3" />}
                        {canceling ? 'Canceling…' : 'Confirm Cancel'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Admin-only: current single-use invite code to hand out */}
            {inviteCode && (
              <div className="pt-4 mt-4 border-t border-white/10">
                <p className="text-micro text-starlight/50 uppercase font-bold mb-1 tracking-widest">Admin · Next Invite Code</p>
                <p className="text-micro text-starlight/40 mb-2">Single-use — rotates after each tester signs in.</p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 px-4 py-2 bg-white/5 border border-white/15 rounded-xl font-mono text-mini tracking-[0.3em] text-cool-blue">{inviteCode}</code>
                  <button
                    onClick={() => { navigator.clipboard.writeText(inviteCode); setInviteCopied(true); setTimeout(() => setInviteCopied(false), 1500); }}
                    className="px-4 py-2 bg-white/10 hover:bg-white/15 text-white font-bold rounded-xl text-micro uppercase tracking-widest cursor-pointer"
                  >
                    {inviteCopied ? 'Copied' : 'Copy'}
                  </button>
                </div>
              </div>
            )}

            <div className="flex justify-end gap-3 pt-4 mt-4 border-t border-white/10">
              <button
                onClick={onClose}
                className="px-5 py-2 border border-white/10 text-starlight/70 hover:bg-white/5 rounded-full font-bold transition-all cursor-pointer uppercase font-mono text-micro tracking-wider"
              >
                Cancel
              </button>
              <button
                onClick={onSave}
                className="px-6 py-2 bg-gradient-to-r from-cool-blue to-soft-violet text-void-black rounded-full font-black transition-all cursor-pointer uppercase font-mono text-micro tracking-wider"
              >
                Complete Update
              </button>
            </div>
          </>
        )}

        {/* Price Sheet tab */}
        {activeTab === "prices" && (
          <div className="overflow-y-auto flex-1 min-h-0 pr-1">
            <PriceSheetPanel authToken={authToken} />
          </div>
        )}

      </div>
    </div>
  );
}
