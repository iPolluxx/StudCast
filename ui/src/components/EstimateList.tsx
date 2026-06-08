import { useState } from "react";
import { Plus, Trash2, Check, X, FileCheck } from "lucide-react";
import type { Estimate } from "../types";

interface Props {
  open: boolean;
  estimates: Estimate[];
  activeEstimateId: string;
  onSelect: (id: string) => void;
  onNewProject: () => void;
  onDelete: (id: string) => void;
}

export default function EstimateList({ open, estimates, activeEstimateId, onSelect, onNewProject, onDelete }: Props) {
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  if (!open) return null;

  return (
    <div
      role="menu"
      aria-label="Estimate workspaces"
      className="absolute top-8 left-0 w-72 glass-panel border-white/10 rounded-xl p-2 z-50 shadow-xl"
    >
      <div className="text-micro font-bold text-soft-violet uppercase tracking-widest p-2 border-b border-white/5">
        Estimates
      </div>
      <div className="space-y-1 mt-2">
        {estimates.map((est) => (
          <div key={est.id} role="menuitem" className="flex items-center gap-1">
            <button
              onClick={() => { setConfirmDeleteId(null); onSelect(est.id); }}
              className={`flex-1 text-left font-mono text-mini p-2 rounded-lg transition-all min-w-0 ${
                est.id === activeEstimateId
                  ? "bg-cool-blue/15 text-cool-blue font-bold border border-cool-blue/30"
                  : "text-starlight/70 hover:bg-white/5 hover:text-white"
              }`}
            >
              <span className="flex items-center gap-1.5 min-w-0">
                <span className="truncate">{est.project_name}</span>
                {est.status === 'invoiced' && (
                  <span className="shrink-0 flex items-center gap-0.5 text-cool-blue bg-cool-blue/15 border border-cool-blue/20 rounded px-1 py-0.5 text-[0.6rem] font-black uppercase tracking-wider leading-none">
                    <FileCheck className="w-2.5 h-2.5" />
                    Invoiced
                  </span>
                )}
              </span>
            </button>

            {confirmDeleteId === est.id ? (
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => { onDelete(est.id); setConfirmDeleteId(null); }}
                  aria-label={`Confirm delete ${est.project_name}`}
                  className="h-8 w-8 rounded-lg flex items-center justify-center bg-alert-rose/20 text-alert-rose hover:bg-alert-rose/30 transition-colors cursor-pointer"
                >
                  <Check className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setConfirmDeleteId(null)}
                  aria-label="Cancel delete"
                  className="h-8 w-8 rounded-lg flex items-center justify-center bg-white/5 text-starlight/70 hover:bg-white/10 transition-colors cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmDeleteId(est.id)}
                aria-label={`Delete ${est.project_name}`}
                className="h-8 w-8 flex items-center justify-center text-starlight/30 hover:text-alert-rose transition-colors cursor-pointer shrink-0 rounded-lg hover:bg-white/5"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        ))}

        <hr className="border-white/5 my-1" />

        <button
          onClick={onNewProject}
          role="menuitem"
          className="w-full text-left text-micro font-bold text-cool-blue hover:text-white flex items-center gap-1.5 p-2 rounded-lg hover:bg-cool-blue/10 transition-colors uppercase"
        >
          <Plus className="w-3.5 h-3.5" />
          Start New Estimate
        </button>
      </div>
    </div>
  );
}
