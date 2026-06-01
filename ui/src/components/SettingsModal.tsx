import { X, Building } from "lucide-react";
import type { ContractorUserSettings } from "../types";

interface Props {
  open: boolean;
  settings: ContractorUserSettings;
  onSettingsChange: (s: ContractorUserSettings) => void;
  onClose: () => void;
  onSave: () => void;
}

export default function SettingsModal({ open, settings, onSettingsChange, onClose, onSave }: Props) {
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
      <div className="glass-panel border-white/10 max-w-lg w-full rounded-2xl p-6 sm:p-8 space-y-6 shadow-2xl relative select-none">

        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-starlight/50 hover:text-rose-400 transition-colors cursor-pointer focus:outline-none"
        >
          <X className="w-5 h-5" />
        </button>

        <div>
          <h2 className="text-lg font-black text-[#ffffff] flex items-center gap-2 uppercase tracking-wide">
            <Building className="w-5 h-5 text-cool-blue" />
            Contractor Profile Setup
          </h2>
          <p className="text-xs text-starlight/70 mt-1">
            Configure default values, license registries, and profit multipliers.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4 font-mono text-[10px]">
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

        <div className="flex justify-end gap-3 pt-4 border-t border-white/10">
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

      </div>
    </div>
  );
}
