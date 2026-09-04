"use client";
import { SectionPlaceholder } from "@/components/cockpit/SectionPlaceholder";
export default function TrustPage() {
  return (
    <SectionPlaceholder
      title="Trust"
      description="GTID verification, sanctions screening, KYB tier, trust passport, certificates."
      roleNote="Every tenant sees their own trust passport; government + admins see cross-tenant trust data."
    />
  );
}
