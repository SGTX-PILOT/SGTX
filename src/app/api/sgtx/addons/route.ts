import { NextResponse } from "next/server";
import { listAddons } from "@/lib/sgtx/addons";

// GET /api/sgtx/addons
// Lists all 7 Part 11 addons with their activation status + config
// (Part 11.8 — Admin Portal → AddOns tab).
//
// Response shape:
//   {
//     "ok": true,
//     "addons": [
//       {
//         "addonId": "gnn",
//         "name": "GNN Risk Engine & Institutional Trade Graph",
//         "description": "...",
//         "category": "INTELLIGENCE",
//         "authorityLevel": "A2",
//         "multisigRequired": true,
//         "blueprintRef": "Part 11.1",
//         "isActive": false,
//         "multisigApproved": false,
//         "config": { ... },
//         "activatedAt": null,
//         "deactivatedAt": null,
//         "activatedByGtid": null
//       },
//       ...
//     ]
//   }
export async function GET() {
  const result = await listAddons();
  return NextResponse.json(result);
}
