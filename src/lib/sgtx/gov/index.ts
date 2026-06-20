// SGTX Part 7 — Government integration client stubs (Nafeza, CargoX, ETA, CBE).
//
// Barrel re-export so callers can do:
//   import { submitDeclaration, getFxRate } from "@/lib/sgtx/gov";
//
// Each sub-module is a TypeScript STUB that simulates the real government /
// regulator API (mTLS / OAuth2 / signed XML / blockchain) and logs every
// OUTBOUND interaction to the `IntegrationConnectorLog` table for audit,
// idempotency and retry handling. No real network calls are made.

export * from "./nafeza";
export * from "./cargox";
export * from "./eta";
export * from "./cbe";
