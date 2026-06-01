import { Plus } from "lucide-react";
import type { Estimate } from "../types";

interface Props {
  open: boolean;
  estimates: Estimate[];
  activeEstimateId: string;
  onSelect: (id: string) => void;
  onNewProject: () => void;
}

export default function EstimateList({ open, estimates, activeEstimateId, onSelect, onNewProject }: Props) {
  if (!open) return null;

  return (
    <div className="absolute top-8 left-0 w-64 glass-panel border-white/10 rounded-xl p-2 z-50 shadow-xl">
      <div className="text-[9px] font-bold text-soft-violet uppercase tracking-widest p-2 border-b border-white/5">
        Switch Estimate Workspace
      </div>
      <div className="space-y-1 mt-2">
        {estimates.map((est) => (
          <button
            key={est.id}
            onClick={() => onSelect(est.id)}
            className={`w-full text-left font-mono text-[11px] p-2 rounded-lg transition-all ${
              est.id === activeEstimateId
                ? "bg-cool-blue/15 text-cool-blue font-bold border border-cool-blue/30"
                : "text-starlight/70 hover:bg-white/5 hover:text-white"
            }`}
          >
            🚀 {est.project_name}
          </button>
        ))}

        <hr className="border-white/5 my-1" />

        <button
          onClick={onNewProject}
          className="w-full text-left text-[10px] font-bold text-cool-blue hover:text-white flex items-center gap-1.5 p-2 rounded-lg hover:bg-cool-blue/10 transition-colors uppercase"
        >
          <Plus className="w-3.5 h-3.5" />
          Start New Estimate
        </button>
      </div>
    </div>
  );
}
