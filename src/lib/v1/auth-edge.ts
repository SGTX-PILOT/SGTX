// CERT-32 P0 FIX (F-05): Shared edge-compatible JWT verification.
//
// `verifyTokenEdge` was previously defined inline in src/middleware.ts and
// not exported. Route handlers that need to re-verify the JWT (defense-
// in-depth) had no way to do so. This module extracts the function so it
// can be imported by any route handler.
//
// Importing `db` (which depends on Prisma) is fine in route handlers but
// NOT in middleware (which runs on the edge runtime). This module therefore
// imports ONLY `crypto` and `process` — no Prisma, no DB.

async function getHmacKey(secret: string): Promise<CryptoKey> {
  const enc = new TextEncoder();
  return crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
}

export async function verifyTokenEdge(token: string): Promise<any | null> {
  try {
    const [header, payload, signature] = token.split(".");
    if (!header || !payload || !signature) return null;
    const body = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
    // Use refresh secret for refresh tokens, session secret otherwise
    const secret =
      body.type === "refresh"
        ? process.env.SGTX_REFRESH_SECRET || "sgtx-dev-refresh-secret-2026-DO-NOT-USE-IN-PROD"
        : process.env.SGTX_SESSION_SECRET || "sgtx-dev-secret-key-2026-DO-NOT-USE-IN-PROD";
    const key = await getHmacKey(secret);
    const enc = new TextEncoder();
    const data = enc.encode(header + "." + payload);
    // Decode base64url signature to ArrayBuffer
    const sigBuf = Uint8Array.from(
      atob(signature.replace(/-/g, "+").replace(/_/g, "/")),
      (c) => c.charCodeAt(0),
    );
    const valid = await crypto.subtle.verify("HMAC", key, sigBuf, data);
    if (!valid) return null;
    if (body.exp && Date.now() > body.exp * 1000) return null;
    return body;
  } catch {
    return null;
  }
}
