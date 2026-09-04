"use client";
import { SectionPlaceholder } from "@/components/cockpit/SectionPlaceholder";
export default function NetworkPage() {
  return (
    <SectionPlaceholder
      title="Network"
      description="Counterparties, saved contacts, trade corridors, shipping routes."
      roleNote="Your network of verified SGTX tenants. Add a contact by GTID to use them as a counterparty in a new trade."
    />
  );
}
