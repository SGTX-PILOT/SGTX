"use client";
import { SectionPlaceholder } from "@/components/cockpit/SectionPlaceholder";
export default function MoneyPage() {
  return (
    <SectionPlaceholder
      title="Money"
      description="Invoices, financing, settlement, FeeLock — your financial position."
      roleNote="Traders see invoices + settlements; banks/PFIs see financing opportunities + bids + collateral; government sees FX monitoring."
    />
  );
}
