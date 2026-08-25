// POST /api/sgtx/demurrage-dispute/create — Add-On 26 thin redirect to Add-On 9
// ===========================================================================
//
// STRUCT-FIX (consolidation): Add-On 26's /create route was byte-for-byte
// identical to Add-On 9's /api/sgtx/demurrage/dispute POST route — same body
// shape (ustn, demurrageTrackingId?, amountDisputed, reason, evidence?,
// governorDecisionId?), same VALID_REASONS set (FREE_TIME_MISSED,
// RATE_MISMATCH, WRONG_CONTAINER_TYPE, CARRIER_ERROR, PORT_CONGESTION,
// FORCE_MAJURE, DOCUMENTATION_ERROR, DOUBLE_CHARGE, OTHER), same Prisma
// write (db.demurrageDispute.create with status="PENDING"), same response
// ({ ok, disputeId, status: "PENDING" }).
//
// To eliminate the duplicate, we now RE-EXPORT the canonical POST handler
// from @/app/api/sgtx/demurrage/dispute/route. URL contract is preserved
// (api consumers hitting /api/sgtx/demurrage-dispute/create still work); the
// only observable difference is that the structured-log tag now reads
// "[demurrage/dispute]" instead of "[demurrage-dispute/create]" — same
// operation, same payload, more consistent logs.
//
// The list route (/api/sgtx/demurrage-dispute/list) is intentionally NOT
// consolidated: it reads from the DemurrageDispute table (filtering by ustn
// + optional status) whereas Add-On 9's /api/sgtx/demurrage/[ustn] GET
// reads from DemurrageTracking and attaches a live calculation. Different
// table, different shape, different purpose — not a duplicate.

export { POST } from "@/app/api/sgtx/demurrage/dispute/route";
