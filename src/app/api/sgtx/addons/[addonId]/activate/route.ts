import { NextRequest, NextResponse } from "next/server";
import { activateAddon } from "@/lib/sgtx/addons";

// POST /api/sgtx/addons/{addonId}/activate
// Body (optional): {
//   activatedByGtid?: string,
//   multisigApproved?: boolean,    // for multisig-required addons (gnn/federated/pqc)
//   multisigRequestId?: string     // alternatively, reference an APPROVED MultisigRequest row
// }
// Activates a Part 11 addon (Part 11.8 step 3-4). For addons with
// `multisigRequired=true`, the caller must supply either `multisigApproved=true`
// or a `multisigRequestId` referencing an APPROVED MultisigRequest row.
export async function POST(req: NextRequest, { params }: { params: Promise<{ addonId: string }> }) {
  const { addonId } = await params;
  if (!addonId) {
    return NextResponse.json({ error: "addonId is required (path parameter)" }, { status: 400 });
  }
  const body = await req.json().catch(() => ({}));
  const result = await activateAddon({
    addonId,
    activatedByGtid: typeof body?.activatedByGtid === "string" ? body.activatedByGtid : undefined,
    multisigApproved: body?.multisigApproved === true,
    multisigRequestId: typeof body?.multisigRequestId === "string" ? body.multisigRequestId : undefined,
  });
  if (!result.ok) {
    const status = result.error?.includes("multisig") ? 403 : 400;
    return NextResponse.json({ error: result.error }, { status });
  }
  return NextResponse.json(result);
}
