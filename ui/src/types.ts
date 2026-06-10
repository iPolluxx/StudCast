export interface MaterialItem {
  name: string;
  quantity: number;
  unit: string;
  trade: string;
  unit_price: number;
  total: number;
  price_source: string;
  type?: "material";
}

export interface LaborItem {
  role: string;
  hours: number;
  rate: number;
  total: number;
  type?: "labor";
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
  isOnboarded: boolean;
  active_subscription: boolean;
  subscription_status: string;
}
