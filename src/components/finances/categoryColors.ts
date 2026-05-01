import type { FinanceCategory } from "@/hooks/useFinanceTransactions";

export interface CategoryColor {
  bg: string;
  text: string;
  border: string;
}

const NEUTRAL: CategoryColor = {
  bg: "rgba(148,163,184,0.15)",
  text: "#cbd5e1",
  border: "rgba(148,163,184,0.25)",
};

const PALETTE: Record<FinanceCategory, CategoryColor> = {
  // Income
  "SMMA":              { bg: "rgba(16,185,129,0.15)",  text: "#34d399", border: "rgba(16,185,129,0.30)" },
  "Bi-Weekly Fee":     { bg: "rgba(34,211,238,0.15)",  text: "#22d3ee", border: "rgba(34,211,238,0.30)" },
  "One-Time Project":  { bg: "rgba(132,204,22,0.15)",  text: "#84CC16", border: "rgba(132,204,22,0.30)" },
  "Other Income":      NEUTRAL,
  // Expense
  "Subscriptions":     { bg: "rgba(168,85,247,0.15)",  text: "#c084fc", border: "rgba(168,85,247,0.30)" },
  "Ad Spend":          { bg: "rgba(244,63,94,0.15)",   text: "#fb7185", border: "rgba(244,63,94,0.30)" },
  "Travel":            { bg: "rgba(59,130,246,0.15)",  text: "#60a5fa", border: "rgba(59,130,246,0.30)" },
  "Food & Meals":      { bg: "rgba(245,158,11,0.15)",  text: "#fbbf24", border: "rgba(245,158,11,0.30)" },
  "Contractors":       { bg: "rgba(236,72,153,0.15)",  text: "#f472b6", border: "rgba(236,72,153,0.30)" },
  "Software":          { bg: "rgba(168,85,247,0.15)",  text: "#c084fc", border: "rgba(168,85,247,0.30)" },
  "Payroll":           { bg: "rgba(20,184,166,0.15)",  text: "#2dd4bf", border: "rgba(20,184,166,0.30)" },
  "Other":             NEUTRAL,
};

export function categoryColor(cat: FinanceCategory | null | undefined): CategoryColor {
  if (!cat) return NEUTRAL;
  return PALETTE[cat] ?? NEUTRAL;
}

export const INCOME_CATEGORIES: FinanceCategory[] = ["SMMA", "Bi-Weekly Fee", "One-Time Project", "Other Income"];
export const EXPENSE_CATEGORIES: FinanceCategory[] = [
  "Subscriptions", "Ad Spend", "Travel", "Food & Meals",
  "Contractors", "Software", "Payroll", "Other",
];
