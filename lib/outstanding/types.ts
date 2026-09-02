import type { OutstandingCycle, InstallmentState } from "@/db/enums";

export interface ContractInput {
  id: string;
  clientName: string;
  cycle: OutstandingCycle;
  baseAmount: number;   // rupees
  gstRate: number;      // percent
  startDate: string;    // YYYY-MM-DD
  periods: number | null;
  endDate: string | null;
  status: "active" | "closed" | "written_off";
  // iter-2 optional cycle-specific fields
  retainerStart?: string | null;
  retainerEnd?: string | null;
  billDate?: number | null;
  emiCount?: number | null;
  frequency?: "10_days" | "15_days" | "30_days" | "weekly" | null;
  explicitInstallments?: { dueDate: string; amount: number }[] | null;
}

export interface InstallmentSpec {
  contractId: string;
  periodIndex: number;
  dueDate: string;      // YYYY-MM-DD
  amount: number;       // rupees, incl GST
}

export interface StoredInstallment {
  id: string;
  contractId: string | null;
  clientName: string;
  periodIndex: number | null;
  dueDate: string;
  amount: number;       // rupees
  // denormalized contract fields (populated by the query layer; optional here)
  entityName?: string | null;
  responsibleName?: string | null;
  productName?: string | null;
  cycle?: string;
  pdcReceived?: boolean;
  expectedModeName?: string | null;
}

export interface CollectionInput {
  id: string;
  clientName: string;
  contractId: string | null;
  amount: number;       // rupees
  collectedAt: string;  // YYYY-MM-DD
}

export interface DerivedInstallment extends StoredInstallment {
  paid: number;         // rupees allocated
  balance: number;      // rupees remaining
  state: InstallmentState;
  daysOverdue: number;  // 0 when not overdue
}
