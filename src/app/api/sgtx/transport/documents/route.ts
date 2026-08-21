// @ts-nocheck
// §5 Transport Documents — list (GET) + create (POST)
// GET  /api/sgtx/transport/documents?ustn=X&graphId=Y&legId=Z&documentType=W&status=V&issuerGtid=U
// POST /api/sgtx/transport/documents  body: CreateDocInput
import { NextResponse } from "next/server";
import {
  listTransportDocuments,
  createTransportDocument,
} from "@/lib/sgtx/transport-documents";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const filters: any = {};
    const ustn = url.searchParams.get("ustn") || undefined;
    const graphId = url.searchParams.get("graphId") || undefined;
    const legId = url.searchParams.get("legId") || undefined;
    const documentType = url.searchParams.get("documentType") || undefined;
    const status = url.searchParams.get("status") || undefined;
    const issuerGtid = url.searchParams.get("issuerGtid") || undefined;
    if (ustn) filters.ustn = ustn;
    if (graphId) filters.graphId = graphId;
    if (legId) filters.legId = legId;
    if (documentType) filters.documentType = documentType;
    if (status) filters.status = status;
    if (issuerGtid) filters.issuerGtid = issuerGtid;
    const documents = await listTransportDocuments(filters);
    return NextResponse.json({ documents });
  } catch (err: any) {
    logger.error("[api/transport/documents] GET failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "invalid body" }, { status: 400 });
    }
    if (!body.documentType) {
      return NextResponse.json(
        { error: "documentType required" },
        { status: 400 },
      );
    }
    const document = await createTransportDocument(body);
    if (document && document.ok === false) {
      return NextResponse.json(
        { error: document.error || "createTransportDocument failed" },
        { status: 400 },
      );
    }
    return NextResponse.json({ document });
  } catch (err: any) {
    logger.error("[api/transport/documents] POST failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
