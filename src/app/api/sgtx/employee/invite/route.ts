import { NextRequest, NextResponse } from "next/server";
import { freshDb as db } from "@/lib/db-fresh";

// POST /api/sgtx/employee/invite — Invite a new employee to the company
// Body: { tenantGtid, fullName, email, role, allowRoleSwitching? }
// Creates an Employee record and sends an invitation email (simulated).
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { tenantGtid, fullName, email, role, allowRoleSwitching } = body;

    if (!tenantGtid || !fullName || !email || !role) {
      return NextResponse.json({ error: "tenantGtid, fullName, email, role required" }, { status: 400 });
    }

    const validRoles = ["OWNER", "ADMIN", "OPERATOR", "DRIVER", "INSPECTOR", "ANALYST", "OFFICER"];
    if (!validRoles.includes(role)) {
      return NextResponse.json({ error: `role must be one of: ${validRoles.join(", ")}` }, { status: 400 });
    }

    // Check tenant exists
    const tenant = await db.tenant.findUnique({ where: { gtid: tenantGtid } });
    if (!tenant) return NextResponse.json({ error: "Tenant not found" }, { status: 404 });

    // Check if email already exists for this tenant
    const existing = await db.employee.findFirst({ where: { tenantGtid, email } });
    if (existing) {
      return NextResponse.json({ error: "Employee with this email already exists" }, { status: 409 });
    }

    // Create employee
    const colors = ["#475569", "#7b3fa0", "#0f9d58", "#d4321a", "#c2410c", "#1a6fb0", "#ca8a04"];
    const avatarColor = colors[Math.floor(Math.random() * colors.length)];
    const employee = await db.employee.create({
      data: {
        tenantGtid,
        fullName,
        email,
        role,
        allowRoleSwitching: allowRoleSwitching === true,
        avatarColor,
      },
    });

    // Smart Inbox notification to the employee (if they have a tenant account)
    // In production: send invitation email with enrollment link
    await db.inboxItem.create({
      data: {
        tenantGtid,
        category: "COMPLIANCE",
        priority: 60,
        title: `New employee added: ${fullName}`,
        description: `${fullName} (${email}) has been added as ${role}. Role switching: ${allowRoleSwitching ? "enabled" : "disabled"}.`,
        ctaLabel: "View Team",
      },
    }).catch(() => null);

    return NextResponse.json({
      ok: true,
      employee,
      message: `Invitation sent to ${email}. Employee record created.`,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
