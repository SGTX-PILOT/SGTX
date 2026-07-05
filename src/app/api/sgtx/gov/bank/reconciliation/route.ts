import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { generateReconciliationFile, ReconciliationFormat } from "@/lib/sgtx/gov";

// GET /api/sgtx/gov/bank/reconciliation — daily reconciliation file for banks (Part 7.5.4)
//
// Query params:
//   bank_bic  — required, the bank's BIC code (e.g. "CIBEEGCX")
//   date      — required, ISO date YYYY-MM-DD
//   format    — required, one of: MT940 | CAMT_053 | CSV
//
// Returns the file as text/plain (or XML for CAMT_053) with appropriate
// Content-Type + Content-Disposition headers so the bank can save it.
// The file content + SHA-256 hash are persisted to BankReconciliationFile
// for audit (retention 7 years per Part 7.9.3).

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const bankBic = (searchParams.get("bank_bic") || "").toUpperCase();
    const dateStr = searchParams.get("date") || "";
    const format = (searchParams.get("format") || "").toUpperCase() as ReconciliationFormat;

    // Validate required params
    const missing: string[] = [];
    if (!bankBic) missing.push("bank_bic");
    if (!dateStr) missing.push("date");
    if (!format) missing.push("format");
    if (missing.length > 0) {
      return NextResponse.json(
        { error: `Missing required query parameters: ${missing.join(", ")}` },
        { status: 400 }
      );
    }

    // Validate BIC format
    if (!/^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(bankBic)) {
      return NextResponse.json(
        { error: "bank_bic must be a valid BIC (8 or 11 chars, e.g. CIBEEGCX)" },
        { status: 400 }
      );
    }

    // Validate date
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) {
      return NextResponse.json(
        { error: "date must be a valid ISO date (YYYY-MM-DD)" },
        { status: 400 }
      );
    }

    // Validate format
    const validFormats: ReconciliationFormat[] = ["MT940", "CAMT_053", "CSV"];
    if (!validFormats.includes(format)) {
      return NextResponse.json(
        { error: `format must be one of: ${validFormats.join(", ")}` },
        { status: 400 }
      );
    }

    const result = await generateReconciliationFile(bankBic, date, format);

    // Determine Content-Type per format
    const contentType = format === "CAMT_053" ? "application/xml"
      : format === "CSV" ? "text/csv"
      : "text/plain";

    // Filename convention: SGTX_<BIC>_<DATE>_<FORMAT>.<ext>
    const ext = format === "CAMT_053" ? "xml" : format === "CSV" ? "csv" : "mt940";
    const filename = `SGTX_${bankBic}_${dateStr}_${format}.${ext}`;

    return new NextResponse(result.fileContent, {
      status: 200,
      headers: {
        "Content-Type": `${contentType}; charset=utf-8`,
        "Content-Disposition": `attachment; filename="${filename}"`,
        "X-File-Hash": result.fileHash,
        "X-Settlement-Count": String(result.settlementCount),
        "X-Total-Amount-USD": result.totalAmountUsd.toFixed(2),
        "X-File-Id": result.fileId,
      },
    });
  } catch (e: any) {
    logger.error("[gov/bank/reconciliation GET] error:", e);
    return NextResponse.json(
      { error: e?.message || "Failed to generate reconciliation file" },
      { status: 500 }
    );
  }
}
