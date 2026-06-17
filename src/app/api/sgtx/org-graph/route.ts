import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// GET /api/sgtx/org-graph?tenant=GTID — internal tenant organization graph (Part 2.4)
export async function GET(req: NextRequest) {
  const tenant = req.nextUrl.searchParams.get("tenant");
  if (!tenant) return NextResponse.json({ error: "tenant required" }, { status: 400 });
  const [businessUnits, departments, costCenters, approvalGroups, approvalPolicies] = await Promise.all([
    db.tenantBusinessUnit.findMany({ where: { tenantGtid: tenant } }),
    db.tenantDepartment.findMany({ where: { tenantGtid: tenant } }),
    db.tenantCostCenter.findMany({ where: { tenantGtid: tenant } }),
    db.tenantApprovalGroup.findMany({ where: { tenantGtid: tenant } }),
    db.tenantApprovalPolicy.findMany({ where: { tenantGtid: tenant } }),
  ]);
  return NextResponse.json({ businessUnits, departments, costCenters, approvalGroups, approvalPolicies });
}

// POST /api/sgtx/org-graph — create org entity
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { type, tenantGtid, name, ...rest } = body;
  if (!type || !tenantGtid || !name) return NextResponse.json({ error: "type + tenantGtid + name required" }, { status: 400 });

  let record;
  switch (type) {
    case "businessUnit":
      record = await db.tenantBusinessUnit.create({ data: { tenantGtid, name, parentId: rest.parentId || null } });
      break;
    case "department":
      record = await db.tenantDepartment.create({ data: { tenantGtid, name, businessUnitId: rest.businessUnitId || null } });
      break;
    case "costCenter":
      record = await db.tenantCostCenter.create({ data: { tenantGtid, name, code: rest.code || name.slice(0, 4).toUpperCase(), departmentId: rest.departmentId || null } });
      break;
    case "approvalGroup":
      record = await db.tenantApprovalGroup.create({ data: { tenantGtid, name, memberEmails: JSON.stringify(rest.members || []) } });
      break;
    case "approvalPolicy":
      record = await db.tenantApprovalPolicy.create({ data: { tenantGtid, name, action: rest.action || "contract.sign", threshold: Number(rest.threshold) || 100000, requiredApprovals: Number(rest.requiredApprovals) || 2, approvalGroupIds: JSON.stringify(rest.groupIds || []) } });
      break;
    default:
      return NextResponse.json({ error: "invalid type" }, { status: 400 });
  }
  return NextResponse.json({ success: true, record });
}
