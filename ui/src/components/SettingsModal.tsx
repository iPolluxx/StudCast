import { useState } from "react";
import { X, Building, ImagePlus, RefreshCw, BookOpen } from "lucide-react";
import type { ContractorUserSettings } from "../types";
import PriceSheetPanel from "./PriceSheetPanel";

interface Props {
  open: boolean;
  settings: ContractorUserSettings;
  onSettingsChange: (s: ContractorUserSettings) => void;
  onClose: () => void;
  onSave: () => void;
  authToken: string | null;
  onLogoUploaded: (url: string) => void;
}

export default function SettingsModal({ open, settings, onSettingsChange, onClose, onSave, authToken, onLogoUploaded }: Props) {
  const [logoUploading, setLogoUploading] = useState(false);
  const [logoError, setLogoError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"profile" | "prices">("profile");

  if (!open) return null;

  const field = (label: string, key: keyof ContractorUserSettings, type = "text", step?: string) => (
    <div className="space-y-1">
      <label className="uppercase font-bold text-starlight/60">{label}</label>
      <input
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
        className="w-full bg-void-black border border-white/10 rounded-xl px-3 py-2 text-starlight outline-none focus:border-cool-blue text-xs font-mono"
      />
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 bg-void-black/80 backdrop-blur-md flex items-center justify-center p-4">
      <div className={`glass-panel border-white/10 w-full rounded-2xl p-6 sm:p-8 shadow-2xl relative select-none flex flex-col transition-all duration-200 ${activeTab === "prices" ? "max-w-5xl max-h-[85vh]" : "max-w-lg"}`}>

        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-starlight/50 hover:text-rose-400 transition-colors cursor-pointer focus:outline-none"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header */}
        <div className="mb-5">
          <h2 className="text-lg font-black text-[#ffffff] flex items-center gap-2 uppercase tracking-wide">
            <Building className="w-5 h-5 text-cool-blue" />
            Contractor Profile Setup
          </h2>
          <p className="text-xs text-starlight/70 mt-1">
            Configure default values, license registries, and profit multipliers.
          </p>
        </div>

        {/* Tab switcher */}
        <div className="flex gap-1 mb-5 bg-white/5 rounded-xl p-1 w-fit">
          <button
            onClick={() => setActiveTab("profile")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all cursor-pointer ${activeTab === "profile" ? "bg-cool-blue/20 text-cool-blue border border-cool-blue/30" : "text-starlight/50 hover:text-starlight"}`}
          >
            <Building className="w-3 h-3" />
            Profile
          </button>
          <button
            onClick={() => setActiveTab("prices")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all cursor-pointer ${activeTab === "prices" ? "bg-cool-blue/20 text-cool-blue border border-cool-blue/30" : "text-starlight/50 hover:text-starlight"}`}
          >
            <BookOpen className="w-3 h-3" />
            Price Sheet
          </button>
        </div>

        {/* Profile tab */}
        {activeTab === "profile" && (
          <>
            <div className="grid grid-cols-2 gap-4 font-mono text-[10px]">

              {/* ── Logo upload ── */}
              <div className="col-span-2 flex items-center gap-4 pb-2 border-b border-white/10">
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
                  <label className="uppercase font-bold text-starlight/60 text-[10px]">Company Logo</label>
                  <label className={`inline-flex items-center gap-1.5 px-3 py-1.5 border border-cool-blue/30 hover:border-cool-blue/60 rounded-xl cursor-pointer transition-all hover:bg-cool-blue/5 text-cool-blue text-[10px] font-black uppercase tracking-widest ${logoUploading ? 'opacity-50 pointer-events-none' : ''}`}>
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
                  {logoError && <span className="text-[10px] text-alert-rose font-mono">{logoError}</span>}
                  {settings.company_logo_url && !logoError && (
                    <span className="text-[10px] text-live-emerald font-mono">Logo saved</span>
                  )}
                </div>
              </div>

              {field("Company Name", "company_name")}
              {field("Bids Dispatch Email", "contact_email", "email")}
              <div className="col-span-2">
                {field("Registered Shop Location", "company_address")}
              </div>
              {field("Dwelling Vendor Reg #", "license_number")}
              {field("Default Craft Labor ($/hr)", "default_labor_rate", "number")}
              {field("Global Mark-up Fee (%)", "global_markup_percent", "number")}
              {field("WI Regional Sales Tax (%)", "tax_rate", "number", "0.1")}
            </div>

            <div className="flex justify-end gap-3 pt-4 mt-4 border-t border-white/10">
              <button
                onClick={onClose}
                className="px-5 py-2 border border-white/10 text-starlight/70 hover:bg-white/5 rounded-full text-xs font-bold transition-all cursor-pointer uppercase font-mono text-[9px] tracking-wider"
              >
                Cancel
              </button>
              <button
                onClick={onSave}
                className="px-6 py-2 bg-gradient-to-r from-cool-blue to-soft-violet text-void-black rounded-full text-xs font-black transition-all cursor-pointer uppercase font-mono text-[9px] tracking-wider"
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
