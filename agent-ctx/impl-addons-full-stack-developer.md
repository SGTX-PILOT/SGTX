# Task impl-addons — Part 11 Add-on Library Stubs

**Agent**: full-stack-developer
**Task ID**: impl-addons
**Scope**: Create TypeScript stubs for the 5 missing Part 11 add-ons (GNN, PQC, ZK, Causal, Federated) plus 5 API routes.

## What was created

### Library files (all under `src/lib/sgtx/addons/`)
| File | Exports |
|---|---|
| `gnn.ts` | `assessGnnRisk(tenantGtid, counterpartyGtid)`, `getTradeGraphScore(tenantGtid)` |
| `pqc.ts` | `signWithDilithium3(data)`, `verifyDilithium3(data, signature)`, `getPqcPublicKey()` |
| `zk.ts` | `generateReserveProof(reserveAmount, liabilities)`, `generatePriceProof(price)`, `verifyZkProof(proof)` |
| `causal.ts` | `runCausalAnalysis(entityType, entityRef, factors[])` — persists to `db.causalAttribution` and calls `callAI` |
| `federated.ts` | `getFederatedModelStatus()`, `submitLocalTrainingResults(modelName, metrics)` |
| `index.ts` | barrel re-export of all of the above |

### API routes (all under `src/app/api/sgtx/`)
| Method + Route | Calls |
|---|---|
| `GET /api/sgtx/gnn/risk?tenantGtid=...&counterpartyGtid=...` | `assessGnnRisk` |
| `GET /api/sgtx/pqc/public-key` | `getPqcPublicKey` |
| `POST /api/sgtx/zk/reserve-proof` (body `{reserveAmount, liabilities}`) | `generateReserveProof` |
| `GET /api/sgtx/federated/status` | `getFederatedModelStatus` |
| `POST /api/sgtx/causal/analyze` (body `{entityType, entityRef, factors[]}`) | `runCausalAnalysis` |

## Implementation notes

- **GNN**: loads both tenants from `db.tenant` and inspects `sanctionsCleared`. Sanctioned → proximity 1, score 95, REJECT. Otherwise proximity 4, score 20, ALLOW. `getTradeGraphScore` uses SavedContact + Trade counts and averages `healthScore` for `avgTrust`.
- **PQC**: simulated Dilithium3 signatures as `dilithium3:<sha256(data)>`. `verifyDilithium3` re-derives the hash. `getPqcPublicKey` returns a static keypair with `validUntil: 2035-12-31`.
- **ZK**: `generateReserveProof` computes `reserveRatio = reserve/liabilities`, `verified = ratio >= 1.1`, proof = `zk:<sha256(reserve|liabilities|ratio)>`. `generatePriceProof` returns a salted commitment + proof. `verifyZkProof` checks the `zk:` prefix and 64-char hex body.
- **Causal**: normalises factor weights to percentages, computes ±10% confidence intervals (clamped 0..100), calls `callAI({ agent: "general", ... })` for a 2-3 sentence plain-language summary, persists `{ disputeId, entityType, entityRef, rootCauses (JSON), aiSummary }` to `db.causalAttribution`.
- **Federated**: returns three static model cards (fraud_detection v3.2.1, margin_estimation v1.8.0, credit_scoring v2.4.5). `submitLocalTrainingResults` logs the contribution and returns `{ ok: true }`.

## Verification

- `npx eslint src/lib/sgtx/addons/ src/app/api/sgtx/{gnn,pqc,zk,federated,causal}/` → 0 errors, 0 warnings.
- `bun run lint` on whole project → only pre-existing error in `upload/buyer.jsx` (not in scope of this task).
