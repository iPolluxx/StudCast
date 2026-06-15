// Where a quantity came from. 'formula' = computed deterministically by the
// Takeoff engine (idempotent, replaced on re-extraction); 'override' = the user
// manually corrected it (protected from re-extraction); 'ai'/'ai_fallback' = LLM
// judgment; 'unresolved' = a known assembly the engine could not compute.
export type QuantitySource = "formula" | "ai" | "ai_fallback" | "override" | "unresolved";

export interface LineProvenance {
  formulaId?: string;
  inputs?: Record<string, unknown>;
  constants?: Record<string, unknown>;
  assumptions?: string[];
}

// Structural span-table provenance (headers/LVLs/trusses) — never a computed
// size; always a cited table lookup the contractor must verify against AHJ/load.
export interface StructuralSource {
  name?: string;
  table?: string;
  edition?: string;
  url?: string;
}

export interface MaterialItem {
  name: string;
  quantity: number;
  unit: string;
  trade: string;
  unit_price: number;
  total: number;
  price_source: string;
  type?: "material";
  // Provenance (Takeoff engine)
  quantity_source?: QuantitySource;
  assemblyId?: string;
  provenance?: LineProvenance;
  // Structural lookup (headers/LVLs)
  verify?: boolean;
  disclaimer?: string;
  source?: StructuralSource;
}

export interface LaborItem {
  role: string;
  hours: number;
  rate: number;
  total: number;
  type?: "labor";
  // Provenance (Takeoff engine)
  quantity_source?: QuantitySource;
  assemblyId?: string;
  provenance?: LineProvenance;
}

export interface Estimate {
  id: string;
  project_name: string;
  scope_of_work: string;
  items: (MaterialItem | LaborItem)[];
  total_amount: number;
  item_count: number;
  client_name: string;
  client_address: string;
  client_phone: string;
  client_email?: string;
  status?: string;
  updatedAt?: string;
}

export interface FramingIntent {
  schemaVersion: string;
  projectType: string;
  dimensions: {
    lengthFt: number;
    heightFt: number;
  };
  structural: {
    studSpacingInches: 16 | 24;
    treatedSolePlate: boolean;
    wallType: "interior" | "exterior";
  };
  features: {
    doorOpenings: number;
    windowOpenings: number;
    cornerCount: number;
  };
}

export interface ChangeOrder {
  id: string;
  parentEstimateId: string;
  change_summary: string;
  added_materials: MaterialItem[];
  added_labor: LaborItem[];
  exclusions: string[];
  change_order_total: number;
  status: string;
}

export interface EmployeeWage {
  name: string;        // employee name and/or position
  hourly_wage: number;
}

export interface ContractorUserSettings {
  company_name: string;
  company_address: string;
  company_logo_url: string;
  license_number: string;
  contact_email: string;
  default_labor_rate: number;
  employee_wages?: EmployeeWage[];
  global_markup_percent: number;
  tax_rate: number;
  visualizer_enabled: boolean;
  isOnboarded: boolean;
  active_subscription: boolean;
  subscription_status: string;
}
