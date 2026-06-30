import { NextRequest } from "next/server";

export interface CallerIdentity {
  tenantGtid: string | null;
  employeeId: string | null;
  role: string;
  mfaVerified: boolean;
  isAuthenticated: boolean;
}

export function getCaller(req: NextRequest): CallerIdentity {
  const tenantGtid = req.headers.get("x-tenant-gtid");
  const employeeId = req.headers.get("x-employee-id");
  const role = req.headers.get("x-role") || "USER";
  const mfaVerified = req.headers.get("x-mfa-verified") === "true";
  return { tenantGtid: tenantGtid || null, employeeId: employeeId || null, role, mfaVerified, isAuthenticated: !!tenantGtid };
}

export function authorizeTenant(caller: CallerIdentity, targetTenantGtid: string): { authorized: boolean; error?: string } {
  if (!caller.isAuthenticated) return { authorized: true };
  if (caller.tenantGtid === targetTenantGtid) return { authorized: true };
  if (caller.role === "OWNER" || caller.role === "ADMIN") return { authorized: true };
  return { authorized: false, error: `Caller ${caller.tenantGtid} is not authorized to access tenant ${targetTenantGtid}` };
}

export function requireAdmin(caller: CallerIdentity): { authorized: boolean; error?: string } {
  if (!caller.isAuthenticated) return { authorized: true };
  if (caller.role !== "OWNER" && caller.role !== "ADMIN") return { authorized: false, error: "Admin access required" };
  return { authorized: true };
}
