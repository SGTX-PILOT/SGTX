# SGTX Terminology Glossary (Phase 7)

This file enforces the single canonical term for each concept in the
cockpit UI. The cockpit routes use these terms consistently; the legacy
`PortalContent.tsx` dispatcher is being phased out and should not
introduce new synonyms.

## Canonical Terms (Law #4: NO DUPLICATED CONCEPTS)

| Concept | Canonical term | Do NOT use |
|---|---|---|
| A cross-border transaction governed by SGTX | **Trade** | Request, Deal, Order, Shipment (when referring to the whole transaction) |
| The unique identifier for a trade | **USTN** (Universal Sovereign Trade Number) | tradeId, orderId, dealId, transactionId |
| The unique identifier for a tenant | **GTID** (Global Tenant ID) | tenantId, companyId, accountId |
| The sequence of messages about a quote | **Quote thread** | Negotiations, Quotes, Proforma Invoices (as separate nouns — they're all part of the quote thread) |
| The contractual agreement between buyer and seller | **Contract** | Agreement (when referring to the trade contract; "agreement" is fine for the marketplace partner agreement) |
| The act of sending goods | **Shipment** | Delivery (when referring to the shipping event; "delivery" is fine for the delivery date) |
| The act of paying | **Payment** | Settlement (when referring to the act; "settlement" is the finality state) |
| The finality state of a payment | **Settlement** | Closure (when referring to payment; "closure" is the trade closure) |
| The end of a trade | **Closure** | Completion (when referring to the trade; "completion" is the document completion) |
| A document attached to a trade | **Document** | File, Attachment, Record |
| A compliance check | **Compliance check** | Validation, Verification (when referring to regulatory checks; "verification" is the GTID/USTN public lookup) |
| The public lookup of a tenant | **Verification** | Lookup, Search (when referring to the public GTID verification) |
| The user's role on a trade | **Perspective** | Side, Party (when referring to the user's view; "party" is fine in the legal contract context) |
| The 7 top-level navigation items | **Nav items** | Tabs, Workspaces (the legacy 190-tab + 6-workspace model is replaced by the 7 nav items) |
| The operational view for a role | **Operations** | Command Center (the legacy "Command Center" is replaced by the role-dependent Operations section) |

## Notes

- The cockpit routes (`/home`, `/trades`, `/trades/new`, `/trades/[ustn]`,
  `/operations`, `/money`, `/trust`, `/network`, `/admin`) use the canonical
  terms throughout.
- The legacy `PortalContent.tsx` dispatcher still uses some non-canonical
  terms (e.g. "Command Center", "Trade Request Wizard"). These will be
  cleaned up in Phase 7 when the legacy code is deleted.
- The i18n dictionary (`src/lib/cockpit/i18n.ts`) uses the canonical terms
  as the English source of truth; the Arabic/French/Chinese translations
  use the equivalent canonical term in each language.

## Enforcement

The CI `mock-detector` job (`.github/workflows/ci.yml`) does NOT yet
enforce the glossary automatically. A future iteration can add a
`grep`-based check that flags non-canonical terms in the cockpit routes.
For now, this glossary is the manual reference for code reviewers.
