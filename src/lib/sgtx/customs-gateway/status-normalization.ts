// @ts-nocheck
export const NORMALIZED_STATES = ["DRAFT","READY_FOR_REVIEW","AUTHORIZED_FOR_SUBMISSION","SUBMITTED","ACKNOWLEDGED","ACCEPTED","UNDER_REVIEW","HOLD","INSPECTION_REQUIRED","DUTY_ASSESSED","PAYMENT_PENDING","PAYMENT_CONFIRMED","RELEASED","EXIT_CONFIRMED","TRANSIT_ACTIVE","TRANSIT_DISCHARGED","REJECTED","CANCELLED","EXPIRED","SYSTEM_UNAVAILABLE"];
export const STATUS_MAPPINGS: Record<string, Record<string, string>> = {
  "US-CBP-ACE": { "INT":"SUBMITTED","ACK":"ACKNOWLEDGED","REL":"RELEASED","REJ":"REJECTED","HOLD":"HOLD","INS":"INSPECTION_REQUIRED","CAN":"CANCELLED","PEND":"PAYMENT_PENDING" },
  "EG-NAFEZA": { "ACCEPTED":"ACCEPTED","REJECTED":"REJECTED","PENDING":"UNDER_REVIEW","RELEASED":"RELEASED","HOLD":"HOLD","CANCELLED":"CANCELLED" },
  "EU-ICS2": { "AE":"ACKNOWLEDGED","RE":"REJECTED","IP":"UNDER_REVIEW","RM":"RELEASED","HL":"HOLD" },
  "EU-NCTS": { "MRN_ASSIGNED":"ACKNOWLEDGED","RELEASED":"RELEASED","DISCHARGED":"TRANSIT_DISCHARGED","REJECTED":"REJECTED" },
};
export function normalizeStatus(externalStatus: string, system: string): string {
  const mapping = STATUS_MAPPINGS[system]; if (!mapping) return "UNDER_REVIEW";
  return mapping[externalStatus] || "UNDER_REVIEW";
}
export interface StatusRecord { normalizedStatus: string; externalStatus: string; externalStatusDescription: string; externalSystem: string; timestamp: Date; }
export function createStatusRecord(externalStatus: string, externalDescription: string, system: string): StatusRecord {
  return { normalizedStatus: normalizeStatus(externalStatus, system), externalStatus, externalStatusDescription: externalDescription, externalSystem: system, timestamp: new Date() };
}
