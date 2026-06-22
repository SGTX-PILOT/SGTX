// Part 8.4 — Terminal/Carrier Certificate Management API
//
// GET  /api/sgtx/release/certificates            → list all terminal/carrier client certs
// POST /api/sgtx/release/certificates            → issue a new cert (CSR submission)
//
// Query params for GET:
//   ?role=TERMINAL|CARRIER      (filter by role)
//   ?status=ACTIVE|REVOKED|EXPIRED|SUPERSEDED  (filter by status)
//   ?org=<substring>            (filter by org name substring)
//
// POST body (application/json):
//   { orgName, role: "TERMINAL"|"CARRIER", clientId, requestedBy?, validityDays?, csrPem? }

import { NextRequest, NextResponse } from "next/server";
import {
  issueCertificate,
  listCertificates,
  type ReleaseCertRole,
  type ReleaseCertStatus,
  type ListCertsFilter,
} from "@/lib/sgtx/release/cert-management";

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const role = sp.get("role") as ReleaseCertRole | null;
    const status = sp.get("status") as ReleaseCertStatus | null;
    const orgName = sp.get("org") || undefined;

    if (role && role !== "TERMINAL" && role !== "CARRIER") {
      return NextResponse.json(
        { error: "role must be TERMINAL or CARRIER" },
        { status: 400 },
      );
    }
    if (
      status &&
      !["ACTIVE", "REVOKED", "EXPIRED", "SUPERSEDED"].includes(status)
    ) {
      return NextResponse.json(
        { error: "status must be one of ACTIVE, REVOKED, EXPIRED, SUPERSEDED" },
        { status: 400 },
      );
    }

    const filter: ListCertsFilter = {
      role: role || undefined,
      status: status || undefined,
      orgName,
    };

    const certs = await listCertificates(filter);

    return NextResponse.json({
      total: certs.length,
      filter,
      certificates: certs,
      mode: "SIMULATION",
      caSubject: "CN=SGTX-CA,O=SGTX Platform Authority,C=EG",
      endpoints: {
        issue: "POST /api/sgtx/release/certificates",
        detail: "GET /api/sgtx/release/certificates/[clientId]",
        revoke: "DELETE /api/sgtx/release/certificates/[clientId]",
        rotate: "POST /api/sgtx/release/certificates/[clientId]/rotate",
        crl: "GET /api/sgtx/release/crl",
      },
    });
  } catch (e: any) {
    console.error("[certificates/route] GET error:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { orgName, role, clientId, requestedBy, validityDays, csrPem } = body as {
      orgName?: string;
      role?: ReleaseCertRole;
      clientId?: string;
      requestedBy?: string;
      validityDays?: number;
      csrPem?: string;
    };

    if (!orgName || !role || !clientId) {
      return NextResponse.json(
        { error: "orgName, role, and clientId are required" },
        { status: 400 },
      );
    }
    if (role !== "TERMINAL" && role !== "CARRIER") {
      return NextResponse.json(
        { error: `role must be TERMINAL or CARRIER (got ${role})` },
        { status: 400 },
      );
    }
    if (validityDays !== undefined && (typeof validityDays !== "number" || validityDays <= 0)) {
      return NextResponse.json(
        { error: "validityDays must be a positive number" },
        { status: 400 },
      );
    }

    const cert = await issueCertificate({
      orgName,
      role,
      clientId,
      requestedBy,
      validityDays,
      csrPem,
    });

    return NextResponse.json(
      {
        certificate: cert,
        issued: true,
        mode: "SIMULATION",
        message: `Certificate issued for ${clientId} (role=${role}, org=${orgName}). Valid until ${cert.validUntil}.`,
      },
      { status: 201 },
    );
  } catch (e: any) {
    console.error("[certificates/route] POST error:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
