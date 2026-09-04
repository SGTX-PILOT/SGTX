"use client";
import { SectionPlaceholder } from "@/components/cockpit/SectionPlaceholder";
export default function OperationsPage() {
  return (
    <SectionPlaceholder
      title="Operations"
      description="Shipments, milestones, customs declarations — your operational queue."
      roleNote="Traders see their own shipments; logistics providers see assigned jobs; customs brokers see declarations; shipping lines see bookings and B/Ls."
    />
  );
}
