#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
SGTX Platform Master Blueprint — Clean Master Edition v14.0
FULLY EXPANDED — Comprehensive institutional document (150+ pages)
"""
import os, sys
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_JUSTIFY
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, PageBreak, Table, TableStyle,
    KeepTogether, Frame, PageTemplate
)

# ═══ PALETTE ═══
PAGE_BG=colors.HexColor('#ffffff'); SECTION_BG=colors.HexColor('#f5f4f0')
CARD_BG=colors.HexColor('#eeedec'); TABLE_STRIPE=colors.HexColor('#f8f7f4')
HEADER_FILL=colors.HexColor('#3a3620'); COVER_BLOCK=colors.HexColor('#1a1810')
BORDER=colors.HexColor('#cfcbbf'); ACCENT=colors.HexColor('#96771b')
TEXT_PRIMARY=colors.HexColor('#1c1b19'); TEXT_MUTED=colors.HexColor('#6c6962')
SEM_SUCCESS=colors.HexColor('#4b855e'); SEM_WARNING=colors.HexColor('#9c7e42')
SEM_ERROR=colors.HexColor('#a64b43'); SEM_INFO=colors.HexColor('#517395')

# ═══ STYLES ═══
styles = getSampleStyleSheet()
sTitle=ParagraphStyle('T',parent=styles['Title'],fontName='Helvetica-Bold',fontSize=28,leading=34,textColor=ACCENT,alignment=TA_CENTER,spaceAfter=6*mm)
sSub=ParagraphStyle('S',parent=styles['Normal'],fontName='Helvetica',fontSize=14,leading=18,textColor=TEXT_MUTED,alignment=TA_CENTER,spaceAfter=4*mm)
sH1=ParagraphStyle('H1',parent=styles['Heading1'],fontName='Helvetica-Bold',fontSize=18,leading=22,textColor=HEADER_FILL,spaceBefore=10*mm,spaceAfter=5*mm)
sH2=ParagraphStyle('H2',parent=styles['Heading2'],fontName='Helvetica-Bold',fontSize=14,leading=18,textColor=ACCENT,spaceBefore=7*mm,spaceAfter=3*mm)
sH3=ParagraphStyle('H3',parent=styles['Heading3'],fontName='Helvetica-Bold',fontSize=11,leading=14,textColor=TEXT_PRIMARY,spaceBefore=5*mm,spaceAfter=2*mm)
sBody=ParagraphStyle('B',parent=styles['Normal'],fontName='Helvetica',fontSize=10,leading=14,textColor=TEXT_PRIMARY,alignment=TA_JUSTIFY,spaceAfter=3*mm)
sBodyM=ParagraphStyle('BM',parent=sBody,fontSize=9,textColor=TEXT_MUTED)
sTC=ParagraphStyle('TC',parent=styles['Normal'],fontName='Helvetica',fontSize=8,leading=11,textColor=TEXT_PRIMARY)
sTH=ParagraphStyle('TH',parent=styles['Normal'],fontName='Helvetica-Bold',fontSize=8,leading=11,textColor=colors.white)
sNote=ParagraphStyle('N',parent=sBody,fontSize=9,leading=12,textColor=TEXT_MUTED,leftIndent=5*mm,spaceAfter=2*mm,borderColor=BORDER,borderWidth=0.5,borderPadding=4,backColor=CARD_BG)
sBullet=ParagraphStyle('BU',parent=sBody,leftIndent=10*mm,bulletIndent=5*mm,spaceAfter=1*mm)

def mt(data,cw=None):
    avail=170*mm
    if not cw:
        n=len(data[0]); cw=[avail/n]*n
    w=[]
    for i,row in enumerate(data):
        wr=[]
        for c in row:
            if isinstance(c,str):
                wr.append(Paragraph(c,sTH if i==0 else sTC))
            else: wr.append(c)
        w.append(wr)
    t=Table(w,colWidths=cw,repeatRows=1)
    cmds=[('BACKGROUND',(0,0),(-1,0),HEADER_FILL),('TEXTCOLOR',(0,0),(-1,0),colors.white),
          ('FONTNAME',(0,0),(-1,0),'Helvetica-Bold'),('FONTSIZE',(0,0),(-1,0),8),
          ('FONTSIZE',(0,1),(-1,-1),8),('ALIGN',(0,0),(-1,0),'CENTER'),
          ('VALIGN',(0,0),(-1,-1),'TOP'),('GRID',(0,0),(-1,-1),0.5,BORDER),
          ('TOPPADDING',(0,0),(-1,-1),3),('BOTTOMPADDING',(0,0),(-1,-1),3),
          ('LEFTPADDING',(0,0),(-1,-1),3),('RIGHTPADDING',(0,0),(-1,-1),3)]
    for i in range(1,len(data)):
        if i%2==0: cmds.append(('BACKGROUND',(0,i),(-1,i),TABLE_STRIPE))
    t.setStyle(TableStyle(cmds)); return t

def H(text,level=0):
    s=[sH1,sH2,sH3][min(level,2)]
    return Paragraph(text,s)

def B(text): return Paragraph(text,sBody)
def N(text): return Paragraph(text,sNote)
def BU(text): return Paragraph(f"• {text}",sBullet)
def SP(h=3): return Spacer(1,h*mm)

# ═══ HEADER/FOOTER + COVER ═══
def hf(canvas,doc):
    canvas.saveState()
    canvas.setFont('Helvetica',8); canvas.setFillColor(TEXT_MUTED)
    canvas.drawString(20*mm,287*mm,"SGTX Platform Master Blueprint — v14.0 Clean Master Edition (Full)")
    canvas.drawRightString(190*mm,287*mm,"Classification: Internal Technical Master Specification")
    canvas.setStrokeColor(BORDER); canvas.setLineWidth(0.5); canvas.line(20*mm,285*mm,190*mm,285*mm)
    canvas.setFont('Helvetica',8); canvas.setFillColor(TEXT_MUTED)
    canvas.drawString(20*mm,12*mm,"SGTX — Sovereign Governed Trade Execution")
    canvas.drawRightString(190*mm,12*mm,f"Page {doc.page}")
    canvas.line(20*mm,14*mm,190*mm,14*mm); canvas.restoreState()

def cover(canvas,doc):
    canvas.saveState()
    canvas.setFillColor(COVER_BLOCK); canvas.rect(0,0,A4[0],A4[1],fill=1,stroke=0)
    canvas.setFillColor(ACCENT); canvas.rect(0,A4[1]-15*mm,A4[0],5*mm,fill=1,stroke=0)
    canvas.rect(0,10*mm,A4[0],3*mm,fill=1,stroke=0)
    canvas.setFillColor(ACCENT); canvas.setFont('Helvetica-Bold',32)
    canvas.drawCentredString(A4[0]/2,A4[1]-80*mm,"SGTX Platform")
    canvas.setFont('Helvetica-Bold',26)
    canvas.drawCentredString(A4[0]/2,A4[1]-95*mm,"Master Blueprint")
    canvas.setFillColor(colors.HexColor('#cfcbbf')); canvas.setFont('Helvetica',16)
    canvas.drawCentredString(A4[0]/2,A4[1]-115*mm,"Clean Master Edition v14.0 — FULLY EXPANDED")
    canvas.setFillColor(ACCENT); canvas.setFont('Helvetica-Oblique',12)
    canvas.drawCentredString(A4[0]/2,A4[1]-135*mm,"Sovereign Governed Trade Execution Infrastructure")
    canvas.setFillColor(colors.HexColor('#2a2618'))
    canvas.roundRect(30*mm,A4[1]-195*mm,150*mm,45*mm,3*mm,fill=1,stroke=0)
    canvas.setFillColor(ACCENT); canvas.setFont('Helvetica-Bold',10)
    canvas.drawCentredString(A4[0]/2,A4[1]-165*mm,"STATUS: AUDITED / INTEGRATED / CANONICAL / FULLY EXPANDED")
    canvas.setFillColor(colors.HexColor('#cfcbbf')); canvas.setFont('Helvetica',9)
    canvas.drawCentredString(A4[0]/2,A4[1]-178*mm,"Document Date: 2026-08-26")
    canvas.drawCentredString(A4[0]/2,A4[1]-188*mm,"Prepared by: Master Blueprint Integration Engine")
    canvas.drawCentredString(A4[0]/2,A4[1]-198*mm,"Classification: Internal Technical Master Specification")
    canvas.drawCentredString(A4[0]/2,A4[1]-208*mm,"Sources: v13.1 FINAL (47,216 lines) + v12.0 (76,122 lines) + Change-Set (7,582 lines)")
    canvas.setFillColor(colors.HexColor('#8c8982')); canvas.setFont('Helvetica',8)
    canvas.drawCentredString(A4[0]/2,20*mm,"Non-Custodial | Non-Marketplace | Governor-Governed | USTN-Centric | Jurisdiction-Aware")
    canvas.restoreState()

# ═══ BUILD STORY ═══
story=[]

# COVER
story.append(PageBreak())

# TOC
story.append(PageBreak())
story.append(H("Table of Contents",0))
toc_items=[
("PART I — FRONT MATTER",1),
("  Executive Summary — What Changed from v13.1 and Why",2),
("  How to Read This Document (Layer System)",2),
("",2),
("PART II — LAYER 0: CONSTITUTION",1),
("  0.1 Governor Principles (G1–G7)",2),
("  0.2 The 32-Point SGTX Transaction Constitution",2),
("  0.3 AI Authority Ladder (A0–A5)",2),
("  0.4 Design Philosophy Statements",2),
("  0.5 Amendment Process",2),
("  0.6 Constitutional Boundaries (What SGTX Is Not)",2),
("",2),
("PART III — LAYER 1: ARCHITECTURE",1),
("  1. Multi-Clock State Vector Model",2),
("  2. Event Spine (Immutable Event Log)",2),
("  3. Governor Pipeline",2),
("  4. Settlement Orchestration Control Plane",2),
("  5. 28-Add-On Catalogue (Full Details)",2),
("  6. Jurisdiction Capability Adapter Schema",2),
("  7. Regulatory Classification Gate",2),
("  8. Closure Policy",2),
("  9. AI Recommendation Gateway",2),
("  10. Transport Engine Architecture (5 Modes)",2),
("  11. Canonical Data Model",2),
("  12. Provider Relationship Model",2),
("  13. Master Global Trade Graph",2),
("",2),
("PART IV — LAYER 2: IMPLEMENTATION SPECIFICATIONS",1),
("  14. Canonical Event Type Catalogue",2),
("  15. API Contract Structure",2),
("  16. Observability Catalogue",2),
("  17. RTO/RPO Targets",2),
("  18. Security Architecture",2),
("  19. Global Standards Gateway",2),
("",2),
("PART V — PORTAL DOCUMENTATION (12 Portals)",1),
("  20.1 Buyer Portal — Full Workflow",2),
("  20.2 Seller Portal — Full Workflow",2),
("  20.3 LSP Portal — Full Workflow",2),
("  20.4 Shipping Line Portal — Full Workflow",2),
("  20.5 QC Portal — Full Workflow",2),
("  20.6 Customs Broker Portal — Full Workflow",2),
("  20.7 Financier-Bank Portal — Full Workflow",2),
("  20.8 Financier-Private Portal — Full Workflow",2),
("  20.9 Government Portal — Full Workflow (24 Tabs)",2),
("  20.10 Platform Admin Portal — Full Workflow",2),
("  20.11 Marketplace Partner Portal — Full Workflow",2),
("  20.12 Laboratory Portal — Full Workflow",2),
("",2),
("PART VI — TRADE LIFECYCLE",1),
("  21. The 36-Stage End-to-End Trade Workflow (Art 129)",2),
("  22. Trade Initiation Flow (Buyer→Seller)",2),
("  23. Quote & Negotiation Flow",2),
("  24. Contract Lock & USTN Minting",2),
("  25. Settlement & Closure Flow",2),
("",2),
("PART VII — APPENDICES",1),
("  A. Financial Control Framework (CFO)",2),
("  B. Regulatory & Legal",2),
("  C. Operating Model",2),
("  D. Implementation Priority Framework (P0–P4)",2),
("  E. Full Historical Audit Trail (A-01 through A-24)",2),
("  F. Source Manifest & SHA-256 Hashes",2),
("  G. Change Log v13.1 → v14.0",2),
("  H. Dependency Graph of Major Components",2),
]
for title,level in toc_items:
    if not title:
        story.append(SP(2)); continue
    s=ParagraphStyle(f'toc{level}',fontName='Helvetica-Bold' if level==1 else 'Helvetica',
        fontSize=11 if level==1 else 9,leading=15 if level==1 else 12,
        textColor=TEXT_PRIMARY if level==1 else TEXT_MUTED,
        leftIndent=0 if level==1 else 8*mm,spaceBefore=2 if level==1 else 0)
    story.append(Paragraph(title,s))
story.append(PageBreak())

# ═══════════════════════════════════════════════════════════════════════════════
# EXECUTIVE SUMMARY
# ═══════════════════════════════════════════════════════════════════════════════
story.append(H("Executive Summary — What Changed from v13.1 and Why",0))
story.append(B(
    "This Clean Master Edition v14.0 is the fully expanded, institutionally-defensible master blueprint for the SGTX "
    "platform. It consolidates the v13.1 FINAL document (47,216 lines of source text), the v12.0 baseline (76,122 lines), "
    "and the complete change-set (7,582 lines) into a single, coherent, three-layer specification. Every principle, "
    "every architecture component, every portal workflow, and every implementation artefact is documented here with "
    "full traceability to its source."
))
story.append(B(
    "The v13.1 baseline is treated as the audited historical record. All changes in v14.0 are additive, clarifying, "
    "or restructuring. No material, principle, or capability has been silently deleted. The 24 audit findings from "
    "v13.1 Part A (A-01 through A-24) are enforced as governing language — settled conflicts are not re-opened."
))
story.append(B(
    "<b>Primary structural change:</b> The document is separated into three strict layers. Layer 0 (Constitution) "
    "contains immutable principles only — amendable via multisig + notice process. Layer 1 (Architecture) contains "
    "the current normative architecture — mutable through standard change-management. Layer 2 (Implementation "
    "Specifications) contains concrete, testable artefacts — canonical data models, event catalogues, API contracts, "
    "and observability requirements. Every normative statement is tagged with its layer: [L0], [L1], or [L2]."
))
story.append(B(
    "<b>Over-claim elimination:</b> All residual marketing language has been replaced with precise deployment-state "
    "vocabulary. 'Production-ready' is replaced with CORE_READY or PRODUCTION_CONNECTED. 'Complete' is replaced with "
    "'specified' or 'implemented'. 'Zero-cost' is replaced with 'institutional-cost scope clarified' (data sources "
    "are free; institutional costs — bank fees, broker fees, integration costs — are real). This vocabulary change "
    "is not cosmetic — it reflects the constitutional requirement that SGTX never over-claims its capabilities to "
    "banks, regulators, or institutional users."
))
story.append(B(
    "<b>Portal documentation:</b> This edition adds comprehensive portal-by-portal documentation (Part V) covering "
    "all 12 portals. Each portal's tabs, screens, workflows, and data access patterns are documented in full. "
    "This is the primary addition over v13.1 — the v13.1 document described portal architecture but did not "
    "document each portal's complete user-facing surface."
))
story.append(B(
    "<b>Trade lifecycle documentation:</b> The 36-stage end-to-end trade workflow (blueprint Article 129) is "
    "documented in full (Part VI), with each stage's inputs, outputs, authority class, and portal touch-points "
    "specified. This enables an engineering team to implement the complete lifecycle without ambiguity."
))
story.append(B(
    "<b>What v14.0 is NOT:</b> It is not a new architecture. It does not introduce new capabilities beyond what "
    "v13.1 specified. It is a clean, restructured, fully-expanded presentation of the same architecture, with all "
    "contradictions resolved, all over-claims eliminated, all principles clearly separated by mutability layer, "
    "and all portal workflows documented end-to-end."
))
story.append(PageBreak())

# How to Read
story.append(H("How to Read This Document (Layer System)",0))
story.append(B(
    "This document uses a three-layer tagging system. Every normative statement is prefixed with its layer:"
))
layers_table=[
    ["Layer","Tag","Mutability","Content","Amendment"],
    ["Layer 0","[L0]","Immutable","Constitutional principles (G1-G7, 32-point constitution, AI ladder, non-custody, non-marketplace)","Multisig 3-of-5 + 30-day notice"],
    ["Layer 1","[L1]","Mutable (standard change-mgmt)","Normative architecture (state vector, event spine, Governor, settlement, add-ons, transport engines)","Standard change-management process (Appendix C.3)"],
    ["Layer 2","[L2]","Mutable (engineering)","Implementation artefacts (data models, event catalogues, API contracts, observability)","Engineering change request + code review"],
]
story.append(mt(layers_table,cw=[18*mm,12*mm,30*mm,70*mm,40*mm]))
story.append(SP(5))
story.append(B(
    "<b>Precedence rule:</b> When a conflict exists between layers, the lower layer prevails. Layer 0 overrides "
    "Layer 1 overrides Layer 2. No implementation decision (L2) may violate an architectural principle (L1), and "
    "no architectural decision (L1) may violate a constitutional principle (L0)."
))
story.append(B(
    "<b>Deployment-state vocabulary:</b> Throughout this document, the following precise terms are used instead "
    "of imprecise marketing language:"
))
vocab_table=[
    ["Term","Meaning","Replaces"],
    ["CORE_READY","Implemented, tested, passes adversarial test suite","'production-ready', 'complete'"],
    ["ADAPTER_READY","Connector code exists but no live integration","'integrated'"],
    ["COUNTRY_CONFIGURED","Jurisdiction profile loaded but not connected","'supported'"],
    ["SANDBOX_CONNECTED","Sandbox integration active, production not yet","'connected'"],
    ["PRODUCTION_CONNECTED","Live production integration active with all 4 readiness dimensions","'live'"],
    ["LEGAL_AUTHORIZATION_REQUIRED","Technical ready, awaiting legal/regulatory approval","'pending'"],
    ["MANUAL_ONLY","Process requires manual operation, no API","'supported manually'"],
    ["PORTAL_ONLY","Process via government portal, no API integration","'web-based'"],
    ["INTEGRATION_REQUIRED","Integration not yet built, required for full operation","'missing'"],
]
story.append(mt(vocab_table,cw=[45*mm,75*mm,50*mm]))
story.append(PageBreak())

# ═══════════════════════════════════════════════════════════════════════════════
# LAYER 0 — CONSTITUTION
# ═══════════════════════════════════════════════════════════════════════════════
story.append(H("PART II — LAYER 0: CONSTITUTION",0))
story.append(B(
    "<b>[L0] This layer contains immutable principles only.</b> These principles are the non-negotiable foundation "
    "of the SGTX platform. They may be amended only via an explicit multisig + notice process (see §0.5). No "
    "implementation decision, business pressure, or operational convenience may override a Layer 0 principle. "
    "Every component, every integration, and every trade on the SGTX platform must comply with all Layer 0 "
    "principles at all times."
))
story.append(SP(5))

# G1-G7
story.append(H("0.1 Governor Principles (G1–G7)",1))
story.append(B("[L0] The Governor is the constitutional enforcement engine of SGTX. Seven principles govern its operation. These principles are immutable — they cannot be waived, overridden, or bypassed by any component, any user, or any configuration."))
g_table=[
    ["Principle","Statement","Enforcement Mechanism"],
    ["G1 — Execution Always Gated","Every irreversible action requires Governor approval before execution. No component may bypass the Governor pipeline.","Every API endpoint that performs a state mutation calls governorDecide() before executing. The Governor's verdict (ALLOW/CONDITIONAL/DENY) is recorded in the Loom."],
    ["G2 — OPA Enforced","Open Policy Agent (OPA) evaluates every decision against authored policies. Policy violations block execution.","OPA is called as a sidecar in the Governor pipeline. If OPA returns DENY, the Governor returns DENY regardless of other gates."],
    ["G3 — WasmEdge Constitutional","WasmEdge executes constitutional rules (non-custody, non-marketplace, 110% reserve, closure-is-earned) as deterministic WebAssembly modules.","WasmEdge modules are compiled from the Layer 0 principles. They cannot be overridden by configuration, policy, or human action."],
    ["G4 — Loom Audited","Every Governor decision is appended to the Loom (SHA-256 hash-chained audit log). The Loom is immutable and externally verifiable.","The Loom uses a SHA-256 hash chain where each entry's hash is computed over (previousHash + payload + timestamp). Any modification breaks all subsequent hashes."],
    ["G5 — Multisig for Irreversible","Irreversible actions (USTN closure, policy amendment, fund release) require multisig approval.","Standard: 2-of-3 for trade-level irreversible actions. Constitutional: 3-of-5 for platform-level changes. Signatories use QES (Qualified Electronic Signature)."],
    ["G6 — AI Advisory Only","The AI subsystem (A1–A3) may propose, explain, classify, and escalate, but NEVER has independent execution authority.","A4 automation is deterministic policy execution by Governor+OPA+WasmEdge, NOT AI autonomy. The AI subsystem cannot call any state-mutating API directly."],
    ["G7 — Bank-Authoritative Settlement","SGTX orchestrates settlement instructions but never becomes the settlement authority. Banks and regulated financial institutions confirm settlement finality.","The Bank Settlement Gateway sends instructions to banks but never confirms settlement. Settlement confirmation is an Event emitted by the bank integration, not by SGTX."],
]
story.append(mt(g_table,cw=[35*mm,75*mm,60*mm]))
story.append(SP(5))

# 32-Point Constitution
story.append(H("0.2 The 32-Point SGTX Transaction Constitution",1))
story.append(B("[L0] The following 32 points constitute the immutable constitution of the SGTX platform. Every trade, every component, and every integration must comply with all 32 points. Violation of any point is a constitutional breach that triggers a SEV-0 incident and automatic Governor block."))
constitution=[
    ("Non-custodial","SGTX never holds customer funds. FeeLock escrow is non-custodial; funds remain with the regulated bank/PSP until settlement is confirmed. The platform's architecture makes it structurally impossible for SGTX to receive, hold, or transfer customer funds at any point in the trade lifecycle."),
    ("Non-marketplace","SGTX does not match buyers with sellers. Trades occur between known, relationship-controlled counterparties. The platform provides no public listing, no public ranking, no public recommendation, and no autonomous provider selection. Counterparty relationships are explicitly established (approved, connected, saved GTID)."),
    ("Non-title-taking","SGTX never takes title to goods. Title transfer is governed by the contract Incoterm and applicable law. The platform records title transfer events but never becomes the title holder or intermediary in the title chain."),
    ("Non-carrier","SGTX is not a carrier. It orchestrates logistics execution through approved carriers, LSPs, and shipping lines. The platform does not own vehicles, vessels, aircraft, or rolling stock, and does not employ drivers, pilots, or crew."),
    ("Non-customs-authority","SGTX is not a customs authority. It interfaces with customs authorities (Nafeza, single-window systems) but never replaces them. The platform submits declarations on behalf of brokers but never issues customs clearance — clearance is an authoritative act by the customs authority."),
    ("Non-bank","SGTX is not a bank. It orchestrates payment instructions but never holds deposits, executes settlement, or issues credit. The platform does not have a banking licence and does not perform any regulated banking activity."),
    ("Non-deposit-taking","SGTX does not accept deposits. All funds flow through connected banks and regulated PSPs. The platform's FeeLock mechanism locks the platform fee amount but does not collect or hold the fee — collection happens at settlement by the bank."),
    ("Non-government","SGTX is not a government entity. It serves as infrastructure connecting commercial parties with government systems. The platform does not issue regulations, impose tariffs, or grant licences — it integrates with government systems that perform these functions."),
    ("AI-assisted","AI provides advisory (A1), constraining (A2), and escalation (A3) capabilities. A4 automation is deterministic policy execution by the Governor. The AI subsystem enhances human decision-making but never replaces it for authoritative acts."),
    ("Governor-governed","Every irreversible action passes through the Governor pipeline (G1–G7). No component may bypass the Governor. The Governor's decision is final — if it returns DENY, no other component may override it."),
    ("OPA-enforced","Open Policy Agent evaluates every decision against authored policies. Policies are versioned, reviewed, and deployed through the change-management process. Policy violations are blocking — there is no 'override' mechanism for OPA denials."),
    ("WasmEdge-enforced","Constitutional rules execute as deterministic WebAssembly modules. These modules are compiled from Layer 0 principles and cannot be overridden by configuration, policy, or human action. They are the cryptographic guarantee that the constitution is enforced."),
    ("Loom-audited","Every decision is appended to the SHA-256 hash-chained Loom audit log. The Loom is immutable (append-only), externally verifiable, and retained for the regulatory retention period (7 years for trade data). No entry is ever modified or deleted."),
    ("USTN-centric","The Universal Shipment Tracking Number (USTN) is the canonical namespace for every trade. All downstream records — shipments, customs declarations, payments, documents, inspections — reference the USTN. The USTN is minted at contract lock and remains the immutable reference for the trade's entire lifecycle."),
    ("Jurisdiction-aware","Every trade is evaluated against the applicable jurisdiction's regulatory profile, customs procedure, and legal framework. The jurisdiction profile determines which licences, permits, certificates, and government integrations are required. Trades that cross jurisdictions are evaluated against all applicable jurisdictions."),
    ("Relationship-controlled","Counterparty relationships are explicitly established (approved, connected, saved GTID). No random matching, no public rankings, no unsolicited recommendations. A provider can become available to a trader only because: (1) it is already approved/connected, (2) the trader saved its GTID, (3) the trader explicitly selected it, or (4) a government-mandated service relationship exists."),
    ("110% reserve rule","If reserve metadata is maintained, it must be at least 110% backed. The constitutional layer sets the threshold; ZK attestation (Add-On 7) provides cryptographic evidence that the threshold is met. The 110% rule is immutable — it cannot be lowered by configuration or policy."),
    ("Closure-is-earned","A USTN is closed only when all 7 closure conditions are met (delivery accepted, settlement complete, reconciliation complete, customs complete, post-clearance complete, disputes satisfied, evidence sealed). Closure cannot be forced, skipped, or overridden. The canClose predicate is a pure function that evaluates all 7 conditions."),
    ("Recovery ≠ erasure","Recovery actions (exception resolution, obligation failure cascade) restore state but never erase audit history. The Loom is immutable — corrections are made by appending new events that reference the original, never by modifying or deleting historical events. This ensures full audit trail integrity."),
    ("USTN as namespace, not override","The USTN is a universal reference namespace. It does not override external authoritative systems (government references, bank transaction IDs, customs declarations). The USTN is SGTX's internal canonical reference; external systems maintain their own identifiers, which are mapped to the USTN via the External Identifier Registry."),
    ("Bank-authoritative settlement","Banks and regulated financial institutions are authoritative for money movement and settlement confirmation. SGTX orchestrates instructions; it does not confirm settlement. Settlement confirmation is an Event emitted by the bank integration, not by SGTX. The Bank Settlement Gateway is non-custodial — it sends instructions but never holds funds."),
    ("Non-custody is architectural","Non-custody is an architectural property of SGTX, not a standalone legal classification. Actual functionality determines licensing in each jurisdiction. A jurisdiction may classify SGTX's orchestration role as requiring specific licences regardless of the non-custody architecture. The Regulatory Classification Gate (Part 7) maps functionality to licence class."),
    ("Reserve metadata ≠ custody","Reserve tables store attestations, ratios, commitments, and evidence metadata only. They do not record the reserves themselves and never give SGTX control over reserve assets. The tables record proof that reserves exist and are sufficient; they do not create customer-fund custody."),
    ("Stablecoin/DeFi conditional","Stablecoin/DeFi rails are conditional, jurisdiction-permitted financing capabilities, not canonical settlement authority. They are used only where legally permitted and always as a sub-rail beneath bank-authoritative settlement. No DeFi reference is deleted; each is conditioned on jurisdictional permission and subordination to bank-authoritative settlement."),
    ("GNN non-marketplace bounded","The Graph Neural Network (Add-On 1) provides trust analytics for parties already known to the tenant. It may score network trust and exposure, but it may not discover, recommend, rank, or introduce counterparties. The graph answers 'how much do I already trust a party I already know'; it never answers 'which party should I trade with'."),
    ("Direct API = first-party connector","'Direct API' denotes a currently adopted first-party connector (e.g., Nafeza, CargoX, ETA, CBE). The worldwide adapter fabric is the extensibility layer. The four Egypt connectors are the first concrete realisations of the adapter fabric; they are not a limitation on the global model."),
    ("RoRo is first-class","Roll-on/Roll-off cargo is a first-class transport mode, not a sub-mode of ocean container. It has its own entity types (RoRoShipment, RoRoUnit with VIN-level tracking, RoRoVoyage, RoRoYard, RoRoGateEvent, RoRoInspection, RoRoBillOfLading), its own 19-state unit state machine, its own 12-state vessel state machine, and its own terminal adapters."),
    ("Mode-specific government applicability","Government integrations (e.g., Egypt Nafeza) have mode-specific applicability. A single generic maritime workflow is insufficient. ROAD, AIR, OCEAN_CONTAINER, RORO, and RAIL each have distinct customs procedures, government messages, identifiers, ACI requirements, manifest formats, and declaration requirements."),
    ("External readiness is 4-dimensional","Every integration reports independently across four dimensions: TECHNICAL (API connected?), LEGAL (contracts signed?), OPERATIONAL (procedures tested?), COMMERCIAL (fees agreed?). 'Connected' requires all four dimensions to be satisfied. This prevents the false claim 'connected' when only the technical dimension is met."),
    ("Production-readiness vocabulary","Use CORE_READY, ADAPTER_READY, COUNTRY_CONFIGURED, SANDBOX_CONNECTED, PRODUCTION_CONNECTED, LEGAL_AUTHORIZATION_REQUIRED, MANUAL_ONLY, PORTAL_ONLY, INTEGRATION_REQUIRED. Never claim WORLDWIDE_INTEGRATED without evidence. The Production Readiness Center (Government Portal tab 24) honestly reports the current state using this vocabulary."),
    ("Manual fallback is governed","Manual fallback (API → EDI → SFTP → PORTAL → BROKER → MANUAL) is authenticated, attributable, timestamped, documented, hashed, and Loom-logged. Manual actions are never anonymous — the actor, the action, the timestamp, and the reason are recorded in the Loom for audit."),
    ("Evidence is sealed at closure","The final evidence package (26 categories per Art 101) is sealed at USTN closure. Post-closure observation (§22) may add evidence but cannot modify sealed evidence. The sealed evidence package is the immutable audit artefact that regulators, banks, and auditors use for post-trade inspection."),
]
for i,(title,desc) in enumerate(constitution,1):
    story.append(Paragraph(f"<b>[L0] Point {i}: {title}</b> — {desc}",sBody))
story.append(SP(5))
story.append(PageBreak())

# AI Authority Ladder
story.append(H("0.3 AI Authority Ladder (A0–A5)",1))
story.append(B("[L0] The AI subsystem operates on a strict authority ladder. A5 is FORBIDDEN — no component may implement A5 under any circumstances. The ladder is immutable and applies to every AI capability in the platform."))
ai_table=[
    ["Level","Name","What AI May Do","What AI May NOT Do","Boundary Statement"],
    ["A0","None","Nothing — pure deterministic rules","Any AI involvement","No AI subsystem is invoked; all decisions are rule-based."],
    ["A1","Advisory","Explain, translate, suggest, summarise, notify, generate draft instructions, provide context","Make decisions, block actions, force outcomes, override human judgment","AI output is advisory only. Humans may accept, modify, or reject AI suggestions freely. AI cannot block any action."],
    ["A2","Constraining","Classify, detect anomalies/discrepancies, predict delays, compare images, estimate ETA, optimise ULD/stowage, analyse route, identify risks","Make final decisions, enforce constraints autonomously, override human authority","AI proposes constraints; the Governor decides whether to enforce. AI identifies risks; humans resolve them."],
    ["A3","Escalation","Escalate to human review, flag for enhanced due diligence, trigger compliance review, request additional evidence","Resolve escalations autonomously, close escalations without human review","AI escalates; humans resolve. Every A3 escalation requires a human decision to close."],
    ["A4","Execution (within bounds)","Deterministic policy automation executed by Governor + OPA + WasmEdge under pre-authorised rules. Example: auto-approve a trade that passes all compliance gates.","AI acquires independent execution authority; AI makes decisions outside pre-authorised rules; AI overrides Governor/OPA/WasmEdge","A4 is policy execution, NOT AI autonomy. The AI subsystem proposes the action; the Governor + OPA + WasmEdge execute it deterministically. The AI never calls state-mutating APIs directly."],
    ["A5","FORBIDDEN","NOTHING","Autonomous AI decision-making without human authorization; AI that can execute trades, release funds, or modify state without human approval","CONSTITUTIONALLY PROHIBITED. No component may implement A5. Any attempt to implement A5 is a constitutional breach triggering SEV-0 incident and automatic platform shutdown."],
]
story.append(mt(ai_table,cw=[12*mm,15*mm,50*mm,40*mm,53*mm]))
story.append(SP(5))
story.append(B("[L0] <b>Key boundary:</b> The AI subsystem NEVER has independent execution authority. A4 is deterministic policy automation — the AI proposes, the Governor + OPA + WasmEdge execute under pre-authorised rules. The AI subsystem itself never acquires execution authority. This is the constitutional boundary that cannot be crossed."))
story.append(PageBreak())

# Design Philosophy
story.append(H("0.4 Design Philosophy Statements",1))
story.append(B("[L0] The following design philosophy statements are immutable. They guide every architectural decision and every implementation choice."))
philosophy=[
    ("Sovereignty First","SGTX respects the sovereignty of every jurisdiction it operates in. The platform does not override, bypass, or supersede any jurisdiction's laws, regulations, or authorities. Government systems are authoritative; SGTX is the orchestration layer that connects to them."),
    ("Non-Custody by Architecture","Non-custody is not a policy choice — it is an architectural property. The platform's code makes it structurally impossible to hold customer funds. This is enforced by WasmEdge constitutional modules that block any code path that would result in SGTX receiving, holding, or transferring customer funds."),
    ("Relationship-Controlled, Not Marketplace","SGTX facilitates trade between known parties. It does not create a public marketplace. There are no public listings, no public rankings, no public recommendations. Counterparty relationships are explicitly established and controlled by the trader."),
    ("AI Assists, Never Forces","AI enhances human decision-making but never replaces it for authoritative acts. The AI subsystem can advise, constrain, and escalate, but the final decision is always made by a human (for A1-A3) or by deterministic policy (for A4). AI never forces an outcome."),
    ("Closure is Earned","A trade is not closed until all 7 closure conditions are met. There is no 'force close' mechanism. This ensures that every closed trade is fully settled, fully reconciled, and fully evidenced — providing a clean audit trail for regulators and auditors."),
    ("Recovery Does Not Erase","When something goes wrong, the platform recovers state but never erases history. The Loom audit log is immutable. Corrections are made by appending new events, not by modifying or deleting old ones. This ensures full audit trail integrity even in the face of errors and exceptions."),
    ("Evidence is Sealed","At trade closure, the evidence package is sealed — it becomes immutable. Post-closure observation may add new evidence but cannot modify sealed evidence. This ensures that the audit trail at closure is a reliable snapshot of the trade's lifecycle."),
    ("Precise Vocabulary","The platform uses precise deployment-state vocabulary (CORE_READY, PRODUCTION_CONNECTED, etc.) instead of marketing language. This prevents over-claiming and ensures that banks, regulators, and institutional users have an accurate picture of the platform's capabilities."),
]
for title,desc in philosophy:
    story.append(Paragraph(f"<b>[L0] {title}</b> — {desc}",sBody))
story.append(SP(5))

# Amendment Process
story.append(H("0.5 Amendment Process",1))
story.append(B("[L0] Layer 0 principles may be amended only through the following process:"))
amendment_steps=[
    ("Step 1 — Proposal","A formal amendment proposal is submitted to the Platform Governance Authority. The proposal must include: the principle being amended, the new language, the rationale, and the impact assessment."),
    ("Step 2 — Notice Period","The proposal undergoes a mandatory 30-day notice period during which all affected parties (banks, regulators, traders, platform operators) may review and comment. The notice period ensures transparency and gives stakeholders time to assess impact."),
    ("Step 3 — Multisig Approval","The amendment requires 3-of-5 multisig approval from the constitutional signatories. Signatories are identified by GTID and must use Qualified Electronic Signatures (QES). The multisig ensures no single party can amend the constitution."),
    ("Step 4 — Loom Logging","The amendment is appended to the Loom with its full provenance: proposer, reviewers, signatories, timestamp, rationale, and the text of both the old and new versions. This ensures complete traceability."),
    ("Step 5 — Versioning","The previous version is NEVER deleted; it is marked as superseded with a forward reference to the new version. The full history of constitutional amendments is retained for the regulatory retention period (7 years)."),
]
for step,desc in amendment_steps:
    story.append(Paragraph(f"<b>{step}</b> — {desc}",sBody))
story.append(B("[L0] This process ensures full traceability — no constitutional change is ever silent. Every amendment is visible, reviewed, approved, and logged."))
story.append(PageBreak())

# Constitutional Boundaries
story.append(H("0.6 Constitutional Boundaries (What SGTX Is Not)",1))
story.append(B("[L0] The following boundary statements clarify what SGTX is NOT. These are constitutional prohibitions — no component, configuration, or business decision may cross these boundaries."))
boundaries=[
    ("SGTX is NOT a marketplace","There is no public listing of trades, no public ranking of providers, no public matching of buyers and sellers. Counterparty relationships are explicitly established and controlled by the trader."),
    ("SGTX is NOT a custodian","SGTX never holds customer funds. The FeeLock mechanism locks the fee amount but does not collect or hold the fee. All funds flow through connected banks and regulated PSPs."),
    ("SGTX is NOT a bank","SGTX does not accept deposits, issue credit, or execute settlement. It orchestrates payment instructions to banks; settlement confirmation is an Event from the bank, not from SGTX."),
    ("SGTX is NOT a customs authority","SGTX interfaces with customs authorities but never replaces them. Customs clearance is an authoritative act by the customs authority; SGTX only submits declarations on behalf of brokers."),
    ("SGTX is NOT a carrier","SGTX does not own transport assets (vehicles, vessels, aircraft). It orchestrates logistics execution through approved carriers, LSPs, and shipping lines."),
    ("SGTX is NOT a government","SGTX is not a government entity. It does not issue regulations, impose tariffs, or grant licences. It integrates with government systems that perform these functions."),
    ("SGTX is NOT an autonomous AI trader","AI assists but never forces. The AI subsystem cannot execute trades, release funds, or modify state without human authorization (A1-A3) or deterministic policy (A4). A5 (autonomous AI) is FORBIDDEN."),
    ("SGTX is NOT a title-taking intermediary","SGTX never takes title to goods. Title transfer is governed by the contract Incoterm and applicable law. SGTX records title transfer events but never becomes the title holder."),
]
for title,desc in boundaries:
    story.append(Paragraph(f"<b>[L0] {title}</b> — {desc}",sBody))
story.append(PageBreak())

# ═══════════════════════════════════════════════════════════════════════════════
# LAYER 1 — ARCHITECTURE
# ═══════════════════════════════════════════════════════════════════════════════
story.append(H("PART III — LAYER 1: ARCHITECTURE",0))
story.append(B("[L1] This layer contains the current normative architecture of SGTX. These specifications describe how the platform is structured and how components interact. They are mutable through the standard change-management process (see Appendix C), but must always comply with Layer 0."))
story.append(SP(5))

# Part 1 — Multi-Clock State Vector
story.append(H("1. Multi-Clock State Vector Model",1))
story.append(B("[L1] SGTX maintains a multi-clock state vector for every trade. Each domain has its own logical clock that advances independently, enabling the platform to reason about temporal consistency across heterogeneous processes that operate at different speeds and with different finality guarantees."))
story.append(B("The state vector is the platform's answer to a fundamental problem of global trade: different processes (commercial, logistics, customs, financial) operate on different timelines and with different finality models. A single 'trade status' field cannot capture this complexity. Instead, the state vector tracks 12 independent domain clocks, each with its own finality class, and computes a divergence index that indicates how far apart the clocks have drifted."))
story.append(B("The divergence index is a leading indicator of trade health. When all clocks are within 1 finality step of each other (NONE divergence), the trade is progressing normally. When clocks drift by 3+ steps (HIGH/CRITICAL divergence), the Governor intervenes — it may raise an exception, notify the relevant parties, or block further actions until the divergence is resolved."))
story.append(H("1.1 The 12 Domain Clocks",2))
domains=[
    ["#","Domain","Clock Tracks","Typical Finality Range","Governor Intervention"],
    ["1","Commercial","Trade initiation, quote, contract, order, PO/SO, proforma","F0→F4 (initiation to contract signed)","Intervenes if stuck at F1 >7 days"],
    ["2","Logistics","Transport booking, execution, tracking, delivery, milestone confirmation","F0→F5 (booking to delivery accepted)","Intervenes if shipment delayed >estimated transit +3 days"],
    ["3","Customs","Declaration, assessment, clearance, post-clearance audit","F0→F4 (declaration to cleared)","Intervenes if held at F2 (submitted) >48 hours"],
    ["4","Financial","Payment instructions, settlement legs, reconciliation","F0→F4 (instruction to settled)","Intervenes if settlement leg stuck at F2 >24 hours"],
    ["5","Documentation","Document generation, verification, legalization, authentication","F0→F4 (draft to legalized)","Intervenes if mandatory doc missing at contract lock"],
    ["6","Compliance","Sanctions screening, regulatory checks, KYB/AML","F0→F4 (screening to cleared)","Intervenes if sanctions POTENTIAL_MATCH — blocks all actions"],
    ["7","Insurance","Policy quote, issuance, certificate, claims","F0→F4 (quote to policy issued)","Intervenes if insurance required but not issued before loading"],
    ["8","Quality Control","Inspection scheduling, field inspection, reporting, certification","F0→F4 (scheduled to certified)","Intervenes if QC required but not completed before loading"],
    ["9","Dispute","Filing, mediation, arbitration, resolution","F0→F4 (filed to resolved)","Intervenes if dispute open at closure — blocks USTN closure"],
    ["10","Post-Trade","Returns, claims, warranty, drawback, post-clearance correction","F0→F4 (filed to resolved)","Intervenes if post-clearance open at closure — blocks unless severity ≤2"],
    ["11","Evidence","Evidence package assembly, hashing, sealing","F0→F5 (assembly to sealed)","Intervenes if evidence not sealed at closure — blocks USTN closure"],
    ["12","Governance","Governor decisions, OPA evaluations, Loom entries, multisig approvals","F0→F5 (proposal to sealed)","Self-monitoring — Governor tracks its own decision latency"],
]
story.append(mt(domains,cw=[6*mm,18*mm,45*mm,40*mm,55*mm]))
story.append(SP(3))
story.append(H("1.2 Finality Classes (F0–F5)",2))
story.append(B("[L1] Each domain clock advances through 6 finality classes. A class represents the degree of certainty that a domain's state is final and will not change."))
finality=[
    ["Class","Name","Meaning","Example (Commercial Domain)","Reversibility"],
    ["F0","None","No activity — the domain has not started","Trade not yet initiated","N/A (nothing to reverse)"],
    ["F1","Proposed","Intent has been expressed but no action taken","Buyer has expressed intent to trade (draft)","Easily reversible — withdraw intent"],
    ["F2","Asserted","An action has been taken, awaiting confirmation","Trade request submitted to seller (PENDING_SELLER_RESPONSE)","Reversible with cost — withdraw request, notify seller"],
    ["F3","Confirmed","Counterparty or authority has confirmed","Seller has submitted a quote (QUOTED)","Reversible with penalty — contract breach risk"],
    ["F4","Settled","Financial settlement complete / authoritative confirmation received","Contract signed and locked (CONTRACT_SIGNED)","Very difficult to reverse — requires multisig + legal process"],
    ["F5","Sealed","Immutable, evidence-sealed, post-closure observation active","USTN CLOSED — evidence package sealed","IRREVERSIBLE — recovery ≠ erasure; corrections via new events only"],
]
story.append(mt(finality,cw=[10*mm,15*mm,40*mm,55*mm,45*mm]))
story.append(SP(3))
story.append(H("1.3 Divergence Index",2))
story.append(B("[L1] The divergence index measures how far apart the 12 domain clocks have drifted. It is computed as the maximum finality-class difference between any two domains."))
div=[
    ["Index","Max Drift","Meaning","Governor Action","Trade Health"],
    ["NONE","≤1 step","All domains progressing in sync","No action needed","HEALTHY"],
    ["LOW","2 steps","Minor drift — one domain slightly ahead/behind","Log + monitor","HEALTHY (expected in normal trade)"],
    ["MEDIUM","3 steps","Moderate drift — one domain significantly behind","Notify relevant parties","ATTENTION (may indicate a problem)"],
    ["HIGH","4 steps","Significant drift — one domain severely behind","Raise exception (severity 2) + notify","WARNING (intervention likely needed)"],
    ["CRITICAL","5+ steps","Severe drift — multiple domains stuck/blocked","Raise exception (severity 3+) + block further actions","CRITICAL (immediate intervention required)"],
]
story.append(mt(div,cw=[15*mm,15*mm,40*mm,50*mm,40*mm]))
story.append(SP(3))
story.append(B("[L1] The divergence index is recomputed every time any domain clock advances. If the index reaches CRITICAL, the Governor blocks all new actions on the trade until the divergence is resolved. This prevents trades from continuing to execute when fundamental processes are stuck."))
story.append(B("[L1] <b>State integrity computation:</b> The platform computes a state integrity score (0-100) based on: divergence index (40% weight), number of open exceptions (30% weight), number of overdue Governor decisions (20% weight), and evidence completeness (10% weight). A score below 50 triggers a Governor review."))
story.append(PageBreak())

# Part 2 — Event Spine
story.append(H("2. Event Spine (Immutable Event Log)",1))
story.append(B("[L1] The Event Spine is the immutable, append-only, hash-chained log of every significant event in the platform. It is the single source of truth for what happened, when, and by whose authority. The Event Spine is never modified or deleted; corrections are made by appending new events that reference the original."))
story.append(B("The Event Spine is the platform's memory. Every trade action — from initial intent through final closure — is recorded as an event. Events are hash-chained: each event's hash is computed over the previous event's hash plus the current event's payload. This creates a tamper-evident chain where any modification to a historical event breaks all subsequent hashes, making tampering immediately detectable."))
story.append(H("2.1 Command ≠ Event Taxonomy",2))
story.append(B("[L1] The platform enforces a strict separation between Commands and Events. This separation is fundamental to the architecture — it ensures that intent is always distinguished from fact, and that the audit trail records what actually happened, not what was attempted."))
ce_table=[
    ["Aspect","Command","Event"],
    ["Nature","Intent to change state","Fact that has occurred"],
    ["Direction","Incoming (into Governor pipeline)","Outgoing (from Governor pipeline to Event Spine)"],
    ["Tense","Imperative ('SubmitQuote','LockContract','CloseUSTN')","Past tense ('QuoteSubmitted','ContractLocked','USTNClosed')"],
    ["Authority","Issued by a party (buyer, seller, system)","Emitted by the Governor after authorization"],
    ["Reversibility","Can be withdrawn before processing","IRREVERSIBLE — once appended, never modified or deleted"],
    ["Storage","Not stored (processed and discarded)","Stored permanently in Event Spine (7-year retention)"],
    ["Hash chain","Not part of hash chain","Each event's hash includes the previous event's hash"],
    ["Example API","POST /api/sgtx/quote/submit","GET /api/sgtx/events/[ustn] (retrieve event history)"],
]
story.append(mt(ce_table,cw=[25*mm,65*mm,70*mm]))
story.append(SP(3))
story.append(H("2.2 Event Authority Taxonomy",2))
story.append(B("[L1] Events are classified by their authority attribute — who may emit them and what level of trust they carry."))
auth_table=[
    ["Authority Class","Who May Emit","Trust Level","Example Events"],
    ["Observation","System (passive recording of external state)","Low — records what was observed, not what was confirmed","ContainerGateIn (terminal scanner), VesselDeparted (AIS feed)"],
    ["Assertion","A party (buyer, seller, broker, carrier)","Medium — active claim by a known party, not yet confirmed","TradeInitiated (buyer), QuoteSubmitted (seller), DeclarationFiled (broker)"],
    ["Confirmation","A trusted authority (customs, bank, government, Governor)","High — authoritative verification by a trusted source","CustomsCleared (customs authority), PaymentSettled (bank), ContractLocked (Governor)"],
    ["System","Platform (automated system events)","Medium — system-generated based on rules or schedules","ExceptionRaised (system), RecoveryExecuted (Governor), SnapshotCaptured (system)"],
]
story.append(mt(auth_table,cw=[20*mm,40*mm,20*mm,80*mm]))
story.append(SP(3))
story.append(H("2.3 SHA-256 Hash Chain",2))
story.append(B("[L1] Each event in the Event Spine is hash-chained to the previous event. The hash is computed as:"))
story.append(B("<b>eventHash = SHA-256(previousEventHash + eventType + ustn + timestamp + actorGtid + canonicalPayloadJSON)</b>"))
story.append(B("This creates a tamper-evident chain where:"))
story.append(BU("Any modification to a historical event changes its hash, which breaks the next event's hash, which breaks all subsequent hashes."))
story.append(BU("The chain can be verified by recomputing all hashes from the genesis event and comparing to stored hashes."))
story.append(BU("The chain is externally verifiable — any auditor with access to the Event Spine can verify integrity without trusting SGTX."))
story.append(BU("The hash chain is replicated to 3 storage nodes across 2 jurisdictions (per the RTO/RPO targets in Part 15)."))
story.append(SP(3))
story.append(H("2.4 Replay Mode (§86)",2))
story.append(B("[L1] The state vector for any USTN can be reconstructed by replaying all events from the Event Spine. This enables:"))
story.append(BU("<b>Audit:</b> Regulators and auditors can reconstruct the exact state of a trade at any point in time."))
story.append(BU("<b>Dispute resolution:</b> If parties disagree on what happened, the Event Spine provides an immutable record."))
story.append(BU("<b>Recovery:</b> If the state vector store is corrupted, it can be rebuilt by replaying events."))
story.append(BU("<b>Testing:</b> The adversarial test suite uses event replay to verify state consistency."))
story.append(B("Replay mode processes events in timestamp order, applying each event's effect to the state vector. The result is a fully reconstructed state vector that matches the live state (assuming no bugs in the replay logic)."))
story.append(PageBreak())

# Part 3 — Governor Pipeline
story.append(H("3. Governor Pipeline",1))
story.append(B("[L1] The Governor is the constitutional enforcement engine. Every irreversible action passes through the Governor pipeline, which evaluates the action against G1–G7 principles, OPA policies, and WasmEdge constitutional rules. The Governor is the gatekeeper — nothing bypasses it."))
story.append(B("The Governor pipeline is designed to be deterministic, auditable, and fast. It evaluates each action through a series of gates, each of which returns a verdict (ALLOW, CONDITIONAL, or DENY). The final verdict is the strictest of all gates (DENY > CONDITIONAL > ALLOW). This ensures that a single gate's denial cannot be overridden by other gates' approvals."))
story.append(H("3.1 Pipeline Stages",2))
story.append(B("[L1] The Governor pipeline processes each Command through the following stages:"))
pipeline=[
    ["Stage","Name","Description","Verdict Impact"],
    ["1","Command Received","A Command is submitted to the Governor via governorDecide().","—"],
    ["2","G1 — Execution Gated","Verify that the action requires Governor approval (all irreversible actions do). If not irreversible, bypass remaining gates.","ALLOW if reversible"],
    ["3","G2 — OPA Enforced","OPA evaluates the action against authored policies. Returns ALLOW/CONDITIONAL/DENY based on policy rules.","DENY if policy violation"],
    ["4","G3 — WasmEdge Constitutional","WasmEdge executes constitutional rules (non-custody, non-marketplace, 110% reserve, closure-is-earned). Returns ALLOW/DENY.","DENY if constitutional violation"],
    ["5","G5 — Multisig Check","If the action is irreversible (USTN closure, policy amendment, fund release), check multisig approval. 2-of-3 standard, 3-of-5 constitutional.","DENY if multisig not met"],
    ["6","G6 — AI Advisory Check","If the AI subsystem has issued a recommendation (A1-A3), verify it has been reviewed. AI cannot block; it can only advise.","CONDITIONAL if AI flagged for review"],
    ["7","Decision Merge","Merge all gate verdicts. Strictest wins: DENY > CONDITIONAL > ALLOW.","Final verdict"],
    ["8a","If ALLOW","Execute the action + append Event to Event Spine + append decision to Loom.","—"],
    ["8b","If CONDITIONAL","Execute the action with conditions recorded + append Event with conditions + append decision to Loom.","—"],
    ["8c","If DENY","Block the action + append denial to Loom + return reason to caller.","—"],
]
story.append(mt(pipeline,cw=[8*mm,25*mm,85*mm,42*mm]))
story.append(SP(3))
story.append(H("3.2 Decision Merge Semantics",2))
story.append(B("[L1] When multiple gates evaluate the same action, the strictest verdict wins. This is a critical safety property — it ensures that a single gate's denial cannot be overridden."))
merge_table=[
    ["Gate A Verdict","Gate B Verdict","Merged Verdict","Rationale"],
    ["ALLOW","ALLOW","ALLOW","All gates approve — action proceeds"],
    ["ALLOW","CONDITIONAL","CONDITIONAL","At least one gate has conditions — conditions are recorded"],
    ["ALLOW","DENY","DENY","One gate denies — action blocked"],
    ["CONDITIONAL","CONDITIONAL","CONDITIONAL","Both gates have conditions — all conditions recorded"],
    ["CONDITIONAL","DENY","DENY","One gate denies — action blocked"],
    ["DENY","DENY","DENY","All gates deny — action blocked"],
]
story.append(mt(merge_table,cw=[30*mm,30*mm,30*mm,70*mm]))
story.append(SP(3))
story.append(H("3.3 Governor Decision Lifecycle",2))
story.append(B("[L1] Each Governor decision has a lifecycle:"))
story.append(BU("<b>Proposed:</b> A Command is submitted to the Governor."))
story.append(BU("<b>Evaluating:</b> The Governor pipeline processes the Command through all gates."))
story.append(BU("<b>Decided:</b> The Governor returns a verdict (ALLOW/CONDITIONAL/DENY) with conditions and rationale."))
story.append(BU("<b>Executed:</b> If ALLOW/CONDITIONAL, the action is executed and an Event is appended to the Event Spine."))
story.append(BU("<b>Logged:</b> The decision (including verdict, conditions, rationale, and all gate evaluations) is appended to the Loom."))
story.append(BU("<b>Verifiable:</b> The Loom entry can be verified by any auditor — the hash chain proves the decision was not tampered with."))
story.append(B("[L1] The Governor's decision latency target is <500ms for standard decisions and <5s for decisions requiring multisig (multisig latency depends on signatory availability)."))
story.append(PageBreak())

# Part 4 — Settlement Orchestration
story.append(H("4. Settlement Orchestration Control Plane",1))
story.append(B("[L1] The Settlement Orchestration Control Plane manages multi-leg payment instructions. It orchestrates the flow of payment instructions to banks and PSPs, tracks settlement leg states, and enforces atomicity policies. The Control Plane is non-custodial — it sends instructions but never holds funds."))
story.append(B("A single trade may have multiple payment legs: goods payment to the seller, freight payment to the carrier, duty payment to customs, SGTX fee payment to the platform, QC inspection fee to the QC provider, lab test fee to the laboratory. Each leg is an independent payment instruction with its own state machine, its own bank integration, and its own settlement confirmation."))
story.append(H("4.1 Multi-Leg Payment Model",2))
story.append(B("[L1] The multi-leg model allows a trade to have N independent payment legs, each with its own:"))
story.append(BU("<b>Beneficiary:</b> The recipient (seller, carrier, customs authority, SGTX, QC provider, lab)"))
story.append(BU("<b>Amount:</b> The payment amount in the specified currency"))
story.append(BU("<b>Bank/PSP:</b> The financial institution processing the payment"))
story.append(BU("<b>State machine:</b> PENDING → SUBMITTED → ACCEPTED → SETTLED (or REJECTED / RETURNED / REVERSED)"))
story.append(BU("<b>Settlement confirmation:</b> An Event from the bank confirming settlement (not from SGTX)"))
leg_states=[
    ["State","Meaning","Trigger","Reversibility"],
    ["PENDING","Payment instruction created but not yet sent to bank","Leg created by Settlement Orchestration","Easily reversible (cancel instruction)"],
    ["SUBMITTED","Payment instruction sent to bank","Bank Settlement Gateway submits to bank API","Reversible with cost (recall request to bank)"],
    ["ACCEPTED","Bank has accepted the instruction for processing","Bank returns acceptance (API response or webhook)","Reversible with penalty (cancellation fee)"],
    ["SETTLED","Bank confirms settlement complete — funds transferred","Bank returns settlement confirmation (Event)","IRREVERSIBLE (funds have moved)"],
    ["REJECTED","Bank rejected the instruction","Bank returns rejection (compliance, AML, insufficient funds)","Reversible (fix issue + resubmit)"],
    ["RETURNED","Payment was returned by the beneficiary bank","Bank returns return notification","Reversible (investigate + resubmit)"],
    ["REVERSED","Payment was reversed after settlement (chargeback)","Bank returns reversal notification","IRREVERSIBLE (reversal is final)"],
]
story.append(mt(leg_states,cw=[18*mm,35*mm,55*mm,52*mm]))
story.append(SP(3))
story.append(H("4.2 Atomicity Policies",2))
story.append(B("[L1] The Settlement Orchestration Control Plane supports 5 atomicity policies that determine how multiple legs interact:"))
atomicity=[
    ["Policy","Meaning","Use Case","Failure Handling"],
    ["ALL_OR_NONE","All legs must settle, or all fail. If any leg fails, all successful legs are reversed.","Goods payment + SGTX fee (fee should only settle if goods payment settles)","If any leg REJECTED/RETURNED, reverse all SETTLED legs"],
    ["PARTIAL_ALLOWED","Legs may settle independently. No requirement for all to settle.","Independent service fees (QC fee, lab fee — separate from goods payment)","No rollback — each leg is independent"],
    ["SEQUENCED","Legs must settle in a specified order. Leg N+1 cannot settle until Leg N settles.","Goods payment → Freight payment (freight paid after goods confirmed)","Block Leg N+1 until Leg N SETTLED"],
    ["CONDITIONAL","Legs settle based on conditions (e.g., delivery accepted, customs cleared).","Duty payment (conditional on customs clearance) → SGTX fee (conditional on duty payment)","Block until condition met"],
    ["HUMAN_RELEASE","Legs require human release before settlement.","Large payments above threshold, disputed payments","Block until human releases via multisig"],
]
story.append(mt(atomicity,cw=[25*mm,45*mm,50*mm,40*mm]))
story.append(SP(3))
story.append(H("4.3 Bank Settlement Gateway (6-Stage Pipeline)",2))
story.append(B("[L1] The Bank Settlement Gateway processes each payment instruction through a 6-stage pipeline before submitting to the bank. This pipeline is simulated — real bank APIs are called by the connected bank's integration, not by SGTX directly."))
bsg=[
    ["Stage","Name","Description","Failure Handling"],
    ["1","Schema Validation","Validate the payment instruction against ISO 20022 or bank-specific format.","REJECT if schema invalid — return error to caller"],
    ["2","Signature Validation","Verify the QES (Qualified Electronic Signature) or bank API authentication.","REJECT if signature invalid — return auth error"],
    ["3","USTN Validation","Verify the trade exists, is not blocked, and the payment leg is valid for this USTN.","REJECT if USTN invalid or blocked — return validation error"],
    ["4","Beneficiary Consistency","Verify the beneficiary matches the trade contract (seller, carrier, customs, etc.).","REJECT if beneficiary mismatch — return consistency error"],
    ["5","Bank Policy Check","Check bank-specific policies (transaction limits, currency restrictions, cut-off times).","REJECT if policy violation — return policy error"],
    ["6","AML / Sanctions Screening","Screen the payment against AML rules and sanctions lists (UN, OFAC, EU).","REJECT if sanctions match — return compliance error + raise exception"],
]
story.append(mt(bsg,cw=[8*mm,25*mm,85*mm,42*mm]))
story.append(SP(3))
story.append(H("4.4 Non-Custody Boundary",2))
story.append(B("[L0-1, L1] <b>SGTX orchestrates settlement instructions but NEVER holds funds.</b> This is the architectural non-custody boundary, enforced by WasmEdge constitutional modules."))
story.append(B("The FeeLock mechanism works as follows:"))
story.append(BU("<b>At trade initiation:</b> The SGTX fee (1.5% of trade value) is calculated and 'locked' — the amount is recorded but NOT collected."))
story.append(BU("<b>At contract lock:</b> The fee amount is included in the settlement instruction sent to the bank."))
story.append(BU("<b>At settlement:</b> The bank settles the goods payment to the seller AND the SGTX fee to SGTX's bank account — simultaneously. SGTX receives the fee only after the bank confirms settlement."))
story.append(BU("<b>At no point:</b> Does SGTX hold the trade value, the seller's payment, or any customer funds. The bank is the custodian throughout."))
story.append(B("[L1] This architecture makes non-custody a structural property, not a policy choice. The code path for SGTX to receive funds simply does not exist — funds flow from buyer's bank to seller's bank (and SGTX's bank for the fee) via the bank's settlement system."))
story.append(PageBreak())

# Part 5 — 28 Add-On Catalogue (FULL DETAILS)
story.append(H("5. 28-Add-On Catalogue (Full Details)",1))
story.append(B("[L1] The SGTX platform includes 28 add-on modules. Each add-on extends the core platform with specific capabilities. This section documents each add-on in full: purpose, database schema, API endpoints, integration points, and implementation checklist."))
story.append(B("The status matrix uses the v14.0 deployment-state vocabulary: CORE_READY (implemented and tested), PRODUCTION_CONNECTED (live integration active), LEGAL_AUTHORIZATION_REQUIRED (technical ready, awaiting legal/regulatory approval)."))
story.append(SP(3))

addons_full=[
    ("Add-On 1: GNN Risk Engine & Institutional Trade Graph","Foundation","CORE_READY","Part 11.1",
     "Graph Neural Network for sanctions-proximity detection (UBO 2-hop) and trust-based trade-graph mapping. The GNN analyses the network of known counterparties to identify sanctions proximity and compute trust scores.",
     "GnnModel, TrustGraphNode, TrustGraphEdge, SanctionsProximityScore",
     "POST /api/sgtx/gnn/train, GET /api/sgtx/gnn/trust-score/{gtid}, GET /api/sgtx/gnn/sanctions-proximity/{gtid}",
     "Part 4.3 (Product Form Agent — trust display), Part 12A.2 (TCC — trust card), Part 10 (Dispute — trust evidence)",
     "[L0-25] Non-marketplace bounded: may score trust for known parties, NEVER discovers/recommends/ranks counterparties."),
    ("Add-On 2: Federated Learning Network","Foundation","CORE_READY","Part 11.2",
     "Train fraud/margin/credit models across sovereign nodes without raw data sharing. Each sovereign node trains local models on its own memory events; only encrypted model updates are shared.",
     "FederatedModel, FederatedNode, ModelUpdate, TrainingRound",
     "POST /api/sgtx/federated/train, GET /api/sgtx/federated/models, POST /api/sgtx/federated/contribute",
     "Part 19 (Trade Memory Layer — training data source), Part 12A.2 (TCC — model predictions)",
     "Differential privacy (epsilon=0.5) enforced. No raw trade data leaves the sovereign node."),
    ("Add-On 3: Causal Inference Engine","Foundation","CORE_READY","Part 11.3",
     "DoWhy + EconML root-cause attribution for disputes, milestone breaches, and quality failures. Identifies the causal factors behind trade exceptions (e.g., '68% of temperature excursions caused by carrier delay, not equipment failure').",
     "CausalAnalysis, CausalFactor, InterventionResult",
     "POST /api/sgtx/causal/analyse, GET /api/sgtx/causal/factors/{ustn}, GET /api/sgtx/causal/interventions",
     "Part 10 (Dispute — root cause evidence), Part 12A.2 (TCC — causal analysis card)",
     "A2 authority — proposes causal factors; humans decide whether to act on them."),
    ("Add-On 4: Self-Healing Infrastructure & Chaos Engineering","Foundation","CORE_READY","Part 11.4",
     "Automated chaos testing + self-healing. The platform injects controlled failures (network partition, DB timeout, API outage) and verifies that recovery mechanisms work. Self-healing automatically restarts failed components.",
     "ChaosTest, ChaosResult, SelfHealingAction, RecoveryLog",
     "POST /api/sgtx/chaos/run, GET /api/sgtx/chaos/results, GET /api/sgtx/chaos/health",
     "Part 12C.11 (Admin Portal — chaos test management), Part 18 (Observability)",
     "Chaos tests run in sandbox environment only — never in production without explicit approval."),
    ("Add-On 5: Automated Penetration Testing","Foundation","CORE_READY","Part 11.5",
     "Continuous automated penetration testing. The platform runs scheduled pentests against its own APIs, infrastructure, and integrations. Findings are tracked as ThreatFindings with severity + remediation SLA.",
     "PentestRun, ThreatFinding, RemediationAction",
     "POST /api/sgtx/pentest/run, GET /api/sgtx/pentest/findings, POST /api/sgtx/pentest/remediate",
     "Part 12C.11 (Admin Portal — threat findings), Part 18 (Observability)",
     "A3 authority — escalates findings to human security team; never auto-remediates severity 4+."),
    ("Add-On 6: Post-Quantum Cryptography (PQC)","Foundation","CORE_READY","Part 11.6",
     "Dilithium3 for archival records (quantum-resistant signatures). PQC is used for long-term evidence storage (7-year retention) to protect against future quantum attacks on classical cryptography.",
     "PqcKey, PqcSignature, ArchivalRecord",
     "POST /api/sgtx/pqc/sign, GET /api/sgtx/pqc/verify/{id}, POST /api/sgtx/pqc/rotate-keys",
     "Part 22 (Post-closure evidence sealing), Part 18 (Security architecture)",
     "PQC is additive — classical signatures remain for short-term verification; PQC for archival."),
    ("Add-On 7: Expanded ZK Proofs & Proof of Reserves","Foundation","CORE_READY","Part 11.7",
     "Zero-knowledge proofs for trust graph queries (client-side WASM via Plonky3) and proof-of-reserves attestation. ZK proofs allow SGTX to prove properties (reserve ratio ≥ 110%, trust score > threshold) without revealing the underlying data.",
     "ZkProof, ReserveAttestation, ReserveComposition",
     "POST /api/sgtx/zk/generate, GET /api/sgtx/zk/verify/{id}, GET /api/sgtx/zk/reserves",
     "Part 4.3 (Product Form Agent — trust query), Appendix A (Financial — reserve attestation)",
     "[L0-17, L0-23] Reserve tables store attestations only — not custody. ZK proves 110% without revealing amounts."),
    ("Add-On 8: Customs Bond & Guarantee Management","P0","CORE_READY","Part 11.8",
     "Manage customs bonds, bank guarantees, and comprehensive guarantees for transit. Tracks bond sufficiency, renewal dates, and claim history. Jurisdiction-aware (Egypt, EU, US, UAE, Saudi, UK).",
     "CustomsBond, BondSufficiencyCheck, BondClaim, JurisdictionBondRule",
     "POST /api/sgtx/bonds/create, GET /api/sgtx/bonds/sufficiency/{ustn}, POST /api/sgtx/bonds/claim",
     "Part 5.7 (Customs Declaration — bond requirement), Part 12C.10 (Gov Portal — bond oversight)",
     "Bond factor varies by jurisdiction (EG 1.0x, EU 0.3-1.0x, US 1.0x, AE 0.5x)."),
    ("Add-On 9: Demurrage & Detention Management","P0","CORE_READY","Part 11.9",
     "Auto-extracts carrier tariffs, tracks free time real-time per port/container/carrier, proactive 48h/24h/expiry alerts, jurisdiction-aware norms. A2 AI predicts congestion; A4 enforces settlement.",
     "DemurrageTracking, CarrierDemurrageTariff, PortFreeTime, DemurrageAlert",
     "GET /api/sgtx/demurrage/{ustn}, POST /api/sgtx/demurrage/calculate, GET /api/sgtx/demurrage/alerts",
     "Part 3B.3.5.3 (Mode C carrier quotes — tariff extraction), Part 6 (Payment — demurrage in settlement), Part 8 (Container Release), Part 12A.1 (Smart Inbox — alerts)",
     "Proactive alerts: 48h (priority 95), 24h (95), expiry (90), escalated (85)."),
    ("Add-On 10: Broker Liability & Insurance Management","P0","CORE_READY","Part 11.10",
     "Under Egyptian Customs Law 207/2020, brokers are personally liable for declaration accuracy. This module tracks broker liability insurance, declaration errors, and performance metrics. Mandatory insurance min EGP 500,000 (Egypt).",
     "BrokerLiabilityInsurance, BrokerDeclarationError, BrokerPerformanceMetric",
     "POST /api/sgtx/broker-liability/create, GET /api/sgtx/broker-liability/status, GET /api/sgtx/broker-liability/performance",
     "Part 9.5 (CBR Portal — insurance upload + error tracking), Part 2.2 (Onboarding), Part 5.7 (Customs Declaration — error logging)",
     "Penalties: 5-50% of duty value for declaration errors. Insurance must be renewed annually."),
    ("Add-On 11: Customs Valuation Intelligence","P1","CORE_READY","Part 11.11",
     "AI-driven duty estimation (A2 XGBoost) and market-value comparison. Real-time comparison declared vs. market average; proactive alerts when deviation >20%; valuation history stored for audit defence.",
     "CustomsValuation, ValuationDispute, MarketPriceData",
     "GET /api/sgtx/valuation/{ustn}, POST /api/sgtx/valuation/calculate, POST /api/sgtx/valuation/dispute, GET /api/sgtx/valuation/market-price",
     "Part 4.15 (Governor PreScreen — valuation gate G1U35), Part 4.3 (Product Form Agent — market data), Part 10 (Dispute — valuation category)",
     "Deviation >20% triggers ALERT; >50% triggers ENHANCED_DD. Market data from RIA (GRiRE)."),
    ("Add-On 12: Cold Chain Quality Management","P1","CORE_READY","Part 11.12",
     "EU RASFF-compliant continuous temperature monitoring (15-min intervals, 5-year retention), PTI certificate tracking, data logger calibration, A2 LSTM anomaly detection.",
     "ColdChainRequirement, PtiCertificate, ColdChainReading, ColdChainAnomaly, DataLoggerCalibration",
     "GET /api/sgtx/cold-chain/requirements, POST /api/sgtx/cold-chain/pti/register, GET /api/sgtx/cold-chain/status/{ustn}, POST /api/sgtx/cold-chain/reading, GET /api/sgtx/cold-chain/anomalies/{ustn}",
     "Part 4.3 (Product Form Agent), Part 4.5 (Documentation), Part 13.1.25 (IoT Sensor — enhanced anomaly detection)",
     "Temperature readings every 15 minutes. Anomaly severity: LOW (<2°C, <30min), MEDIUM (<2°C, >30min), HIGH (>2°C or >1h)."),
    ("Add-On 13: Inspection Agency Accreditation","P1","CORE_READY","Part 11.13",
     "Track ISO 17020 accreditation, scope of work, performance metrics for QC inspection agencies. A1 performance summaries; A2 trend analysis; A4 enforcement (block jobs for unaccredited agencies).",
     "InspectionAgencyAccreditation, InspectionAgencyPerformance, AccreditationBody",
     "GET /api/sgtx/inspection/accreditations, POST /api/sgtx/inspection/accredit, GET /api/sgtx/inspection/performance/{agencyGtid}",
     "Part 9.4 (QC Portal — accreditation check before job assignment), Part 2.2 (Onboarding), Part 12C.10 (Gov Portal — accreditation view)",
     "Accreditation must be valid (not expired). Expired accreditation blocks new job assignment."),
    ("Add-On 14: Currency Risk Management","P1","CORE_READY","Part 11.14",
     "Real-time FX rates from ECB (free XML daily feed), hedging recommendations, natural hedging opportunity matching. Advisory only — never forces hedging. A2 volatility prediction.",
     "CurrencyExposure, HedgingRecommendation, FxRate",
     "GET /api/sgtx/currency-risk/exposure/{ustn}, GET /api/sgtx/currency-risk/recommendations, GET /api/sgtx/currency-risk/history",
     "Part 4.9 (Commercial Settlement — currency selection), Part 5.6 (Invoice — multi-currency), Part 6 (Payment — FX in settlements), Part 12A.2 (TCC — currency risk card)",
     "ECB rates updated daily at 16:00 CET. Hedging recommendations advisory (A1) — trader decides."),
    ("Add-On 15: Government API Sandbox","P1","CORE_READY","Part 11.15",
     "Government APIs change without notice. This module provides a sandbox environment mirroring production, automated daily regression tests against live APIs, change detection alerts, and adaptive integration auto-update for minor changes.",
     "GovernmentApiSandbox, GovernmentApiTestResult, ApiChangeDetectionLog",
     "GET /api/sgtx/gov-sandbox/apis, POST /api/sgtx/gov-sandbox/test, GET /api/sgtx/gov-sandbox/results, POST /api/sgtx/gov-sandbox/sync",
     "Part 7 (Government Integration — sandbox for testing), Part 12C.10 (Gov Portal — sandbox status), Part 12C.11 (Admin Portal — sandbox management)",
     "10 APIs with sandbox: Nafeza (EG), CargoX (EG), ETA (EG), ICS2 (EU), TRACES (EU), Trade Single Window (UAE), FASAH (Saudi), ACE (USA), CDS (UK)."),
    ("Add-On 16: FTA Preference Management","P1","CORE_READY","Part 11.16",
     "Auto-detect FTA eligibility, calculate preference rates, manage certificates (EUR.1, COO, etc.). A2 FTA detection; A4 validation.",
     "FtaPreference, FtaPreferenceClaim, FtaPreferenceRule",
     "GET /api/sgtx/fta/preferences, GET /api/sgtx/fta/check, POST /api/sgtx/fta/claim, GET /api/sgtx/fta/certificate",
     "Part 4.3 (Product Form Agent), Part 4.5 (Documentation), Part 5.7 (Customs Declaration — FTA claim), Part 12A.2 (TCC — FTA savings display)",
     "9 FTAs supported: Egypt-EU (0% EUR.1), Egypt-UAE, Egypt-Saudi, Egypt-UK, AfCFTA, GAFTA, EU-Mercosur, USMCA, RCEP."),
    ("Add-On 17: Piracy & Security Risk Engine","P1","CORE_READY","Part 11.17",
     "Maritime security intelligence, corridor scoring, insurance premium adjustment for high-risk routes. Sources: IMB Piracy Reporting Centre, Maritime Security Council. Advisory only — never blocks trades. 4 risk levels with insurance impact.",
     "MaritimeSecurityIncident, CorridorSecurityScore, SecurityAdvisory",
     "GET /api/sgtx/security/corridor/{code}, GET /api/sgtx/security/incidents, GET /api/sgtx/security/advisories, GET /api/sgtx/security/insurance-impact",
     "Part 30 (Trade Corridors — security scoring), Part 4.8 (Insurance — premium adjustment), Part 12A.2 (TCC — security risk card)",
     "Risk levels: LOW (0%), MODERATE (+10%), HIGH (+30%), CRITICAL (+100%) insurance premium impact."),
    ("Add-On 18: Trade Compliance Calendar","P1","CORE_READY","Part 11.18",
     "Centralised calendar for regulatory deadlines, certificate expiries, tariff changes. Proactive reminders 30/14/7/1 days before. Auto-population by RIA (regulatory change detection).",
     "ComplianceCalendarEvent, ComplianceCalendarAlert, RegulatoryDeadline",
     "GET /api/sgtx/compliance-calendar/events, GET /api/sgtx/compliance-calendar/upcoming, POST /api/sgtx/compliance-calendar/event, POST /api/sgtx/compliance-calendar/complete",
     "Part 4.1 (RIA — deadline detection), Part 12A.1 (Smart Inbox — reminders), Part 12A.10 (Task Center), Part 12C.10 (Gov Portal — compliance dashboard)",
     "Event types: Tariff Change, Certificate Expiry, Licence Renewal, Regulatory Reporting, Sanctions Update, Trade Agreement Change, Bond Expiry. Reminders: 30, 14, 7, 1 days before."),
    ("Add-On 19: Cargo Insurance Integration","P2","CORE_READY","Part 11.19",
     "API integration with insurance providers — premium calculation, policy issuance, claim handling. A2 premium optimisation; A4 validation.",
     "InsuranceProvider, InsurancePolicy, InsuranceClaim",
     "GET /api/sgtx/cargo-insurance/premium, POST /api/sgtx/cargo-insurance/policy/issue, GET /api/sgtx/cargo-insurance/policy/{ustn}, POST /api/sgtx/cargo-insurance/claim/submit",
     "Part 4.8 (Insurance Requirements), Part 5.6 (Invoice — premium in invoice), Part 12A.2 (TCC — insurance card), Part 10 (Dispute — claim evidence)",
     "Providers: Allianz, Zurich, AIG (global, API ✅); Egyptian Insurance (Egypt); Saudi National (Saudi)."),
    ("Add-On 20: Trade Finance Documentation","P2","CORE_READY","Part 11.20",
     "Manage LC applications, confirmations, bills of exchange, assignment of proceeds. Workflow tracking with status/approvals/signatures. Integrates with financing module.",
     "TradeFinanceDocument, TradeFinanceCase",
     "POST /api/sgtx/trade-finance/document, GET /api/sgtx/trade-finance/documents/{ustn}, POST /api/sgtx/trade-finance/document/sign",
     "Part 4.9 (Commercial Settlement — LC selection), Part 3B.5 (Financing Module — LC confirmation), Part 6 (Payment Orchestrator — bill of exchange)",
     "Document types: LC Application, LC Confirmation, Bill of Exchange, Assignment of Proceeds, Standby LC."),
    ("Add-On 21: Back-to-Back LC Management","P2","CORE_READY","Part 11.21",
     "Manage chains of LCs (primary → secondary). Buyer uses credit line to issue LC to seller; seller uses it to issue second LC to supplier. Chain tracking; risk management; coordinated execution.",
     "BackToBackLc, LetterOfCredit, LcLifecycle",
     "POST /api/sgtx/back-to-back-lc/create, GET /api/sgtx/back-to-back-lc/{id}, GET /api/sgtx/back-to-back-lc/chain/{ustn}",
     "Part 20 (Trade Finance Docs — LC management), Part 3B.5 (Financing Module — financing chain), Part 12A.2 (TCC — LC chain card)",
     "Primary LC + Secondary LC linked. Risk: if primary LC is cancelled, secondary LC must be cancelled too."),
    ("Add-On 22: Force Majeure Handling","P2","CORE_READY","Part 11.22",
     "Handle force majeure events (natural disasters, war, pandemic) affecting trade execution. Event detection via RIA scraping official sources (WHO for pandemic); structured claim submission; contract renegotiation; jurisdiction-aware clauses.",
     "ForceMajeureEvent, ForceMajeureClaim, ForceMajeureExtension",
     "GET /api/sgtx/force-majeure/events, POST /api/sgtx/force-majeure/claim, GET /api/sgtx/force-majeure/claim/{id}, POST /api/sgtx/force-majeure/extension",
     "Part 4.1 (RIA — event detection), Part 3 (Contract — extension clauses), Part 10 (Dispute — force majeure evidence), Part 12A.1 (Smart Inbox — event alerts)",
     "Event types: Natural Disaster, War/Conflict, Pandemic (WHO alert), Port Strike, Sanctions. Claims require evidence (official notice, news report)."),
    ("Add-On 23: Shipper's Declaration & Export Documentation","P2","CORE_READY","Part 11.23",
     "Manage shipper's declarations, export accompanying documents (EAD), and export licence tracking. A2 document extraction; A4 validation.",
     "ShippersDeclaration, ExportAccompanyingDocument, ExportLicence",
     "POST /api/sgtx/shippers-declaration/create, GET /api/sgtx/shippers-declaration/{ustn}, POST /api/sgtx/shippers-declaration/ead, GET /api/sgtx/shippers-declaration/licence/status",
     "Part 5.7 (Customs Declaration — declaration data), Part 2.2 (Onboarding — licence upload), Part 12A.1 (Smart Inbox — licence expiry)",
     "Documents: Shipper's Declaration (all exports), EAD (EU exports), Export Licence (restricted goods), COO (FTA preference), EUR.1 (Egypt-EU FTA)."),
    ("Add-On 24: Port & Terminal Integration","P2","CORE_READY","Part 11.24",
     "Beyond container release API — deeper integration with port/terminal systems. EDI integration (gate-in/gate-out); pre-advice; terminal OS real-time status. A4 validation only.",
     "TerminalIntegration, GateEvent, TerminalEvent",
     "POST /api/sgtx/terminal/pre-advice, POST /api/sgtx/terminal/gate-in, POST /api/sgtx/terminal/gate-out, GET /api/sgtx/terminal/status/{container}",
     "Part 8 (Container Release — gate events trigger release), Part 3B.5.1 (Pre-advice — webhook), Part 13.1.5 (Ports — terminal mapping)",
     "Integration points: Gate-in (EDIFACT), Gate-out (EDIFACT), Vessel Schedule (API/EDI), Container Status (API/EDI), Pre-advice (API)."),
    ("Add-On 25: Payment Guarantee Confirmation (Optional)","P3","CORE_READY","Part 11.25",
     "OPTIONAL — payment guarantee verification is NOT mandatory. Traders can choose not to use it. Provides optional verification of payment guarantees (LCs, bank guarantees) through SWIFT MT700/URDG 758. Multiple methods: SWIFT, manual, third-party.",
     "PaymentGuaranteeConfirmation",
     "POST /api/sgtx/payment-guarantee/create, POST /api/sgtx/payment-guarantee/confirm, GET /api/sgtx/payment-guarantee/status",
     "Part 12A.2 (TCC — optional card), Part 20 (Trade Finance Docs — guarantee confirmation)",
     "Verification methods: SWIFT MT700 (LC), URDG 758 (bank guarantee), Manual Upload (PDF), Third-Party (independent verification)."),
    ("Add-On 26: Demurrage Dispute Resolution","P3","CORE_READY","Part 11.26",
     "Demurrage disputes are common — this module provides structured dispute resolution workflow integrated with Part 10 main dispute system. Structured workflow (initiate, evidence, mediate, resolve); automatic demurrage calculation audit trail as evidence package.",
     "DemurrageDispute",
     "POST /api/sgtx/demurrage-dispute/create, GET /api/sgtx/demurrage-dispute/list",
     "Part 10 (Dispute Management — dispute category), Part 9 (Demurrage — evidence package), Part 12A.2 (TCC — dispute card)",
     "Dispute reasons: FREE_TIME_MISSED, RATE_MISMATCH, WRONG_CONTAINER_TYPE, CARRIER_ERROR, PORT_CONGESTION, FORCE_MAJURE, DOCUMENTATION_ERROR, DOUBLE_CHARGE, OTHER."),
    ("Add-On 27: (RESERVED)","—","—","—",
     "This add-on is reserved for future enhancements. No schema, no endpoints, no checklist. Placeholder for future expansion.",
     "—","—","—",
     "Correctly reserved per blueprint — no stubs or half-baked implementations exist."),
    ("Add-On 28: GRiRE (Global Regulatory Intelligence & Requirements Engine)","Foundation","CORE_READY","Part 11.28",
     "AI-powered discovery and import of regulatory, customs, documentation, and logistics requirements for every country/territory worldwide. 4-layer pipeline: Scraper (Rust+Rig) → AI Parsing (A2 HF NLP) → Structured Store (PostgreSQL+Vector) → Output (dynamic forms, checklists, calculators).",
     "CountryRegulatoryProfile, HsTariffRate, CountryRequiredDocument, ColdChainRequirement, FtaPreferenceRule, RegulatoryChangeLog, GrireSource",
     "GET /api/sgtx/grire/country-profile, GET /api/sgtx/grire/tariff, GET /api/sgtx/grire/required-docs, GET /api/sgtx/grire/cold-chain, GET /api/sgtx/grire/fta-preference, GET /api/sgtx/grire/full-report, POST /api/sgtx/grire/discover",
     "Part 4.1 (RIA — GRiRE is the advanced AI-powered version), Part 4.3 (Product Form Agent), Part 4.5 (Documentation), Part 7 (Government Integration — API discovery), Part 13 (Data Model — jurisdiction-specific tables)",
     "Coverage: 195 countries, 150+ tariff schedules, 180+ document matrices, 160+ cold chain profiles, 200+ port demurrage norms, 350+ FTA rules. New country onboarded in <1 day with GRiRE."),
]

for name,priority,status,ref,purpose,schema,apis,integration,notes in addons_full:
    story.append(H(name,2))
    story.append(B(f"<b>Priority:</b> {priority} | <b>Status:</b> {status} | <b>Blueprint Ref:</b> {ref}"))
    story.append(B(f"<b>Purpose:</b> {purpose}"))
    story.append(B(f"<b>Database Schema:</b> {schema}"))
    story.append(B(f"<b>API Endpoints:</b> {apis}"))
    story.append(B(f"<b>Integration:</b> {integration}"))
    story.append(N(f"<b>Notes:</b> {notes}"))
    story.append(SP(2))

story.append(PageBreak())

# Continue with more sections...
# Part 6-13 (condensed for space but still detailed)
story.append(H("6. Jurisdiction Capability Adapter Schema",1))
story.append(B("[L1] SGTX supports a worldwide jurisdiction capability adapter fabric. Each jurisdiction (country, customs territory, economic union) has a profile that defines its regulatory requirements, customs procedures, payment rails, and government integrations."))
story.append(B("The jurisdiction model goes beyond simple 'country' — it supports 16 jurisdiction types: sovereign country, customs territory, customs union, economic union, autonomous territory, special administrative region, free zone, free port, bonded zone, special economic zone, airport customs jurisdiction, port customs jurisdiction, tax territory, export-control territory, special regime, and more."))
story.append(H("6.1 16 Connector States",2))
story.append(B("[L1] Every government integration progresses through 16 states, from initial discovery through production connection to deprecation:"))
conn_states=[
    ["State","Description"],
    ["NOT_DISCOVERED","No knowledge of the government system exists."],
    ["DISCOVERED","System identified but not yet documented."],
    ["DOCUMENTED","System documented (API specs, EDI formats, portal URLs)."],
    ["CONTACT_REQUIRED","Contact with the government authority needed."],
    ["CREDENTIALS_REQUIRED","API credentials / certificates needed."],
    ["SANDBOX_AVAILABLE","Sandbox environment available for testing."],
    ["SANDBOX_CONNECTED","Sandbox integration active and tested."],
    ["CERTIFICATION_REQUIRED","Government certification needed for production."],
    ["CERTIFICATION_PENDING","Certification application submitted, awaiting approval."],
    ["PRODUCTION_READY","Technical, legal, operational, commercial all ready."],
    ["PRODUCTION_CONNECTED","Live production integration active."],
    ["DEGRADED","Integration partially functional (some endpoints failing)."],
    ["OUTAGE","Integration completely non-functional."],
    ["PORTAL_ONLY","No API — process via government web portal manually."],
    ["MANUAL_ONLY","No electronic integration — process via physical visit / paper."],
    ["DEPRECATED","Integration retired — no longer supported."],
]
story.append(mt(conn_states,cw=[40*mm,120*mm]))
story.append(SP(3))
story.append(H("6.2 7 Authoritative Statuses",2))
story.append(B("[L1] Separately from connector states, the government's authoritative status for a trade action is tracked. SGTX never invents government approval — it only records what the government has actually said."))
auth_statuses=[
    ["Status","Meaning"],
    ["SGTX_READY","SGTX has prepared the submission but not yet sent it to the government."],
    ["SUBMITTED","SGTX has submitted to the government system."],
    ["GOVERNMENT_ACCEPTED","Government has accepted the submission (processing)."],
    ["GOVERNMENT_REJECTED","Government has rejected the submission (correction needed)."],
    ["GOVERNMENT_HOLD","Government has placed the submission on hold (review/inspection)."],
    ["GOVERNMENT_RELEASED","Government has released/cleared the submission."],
    ["MANUAL_AUTHORITY_CONFIRMED","A human has manually confirmed the authority's decision (fallback)."],
]
story.append(mt(auth_statuses,cw=[45*mm,115*mm]))
story.append(SP(3))
story.append(H("6.3 4-Dimension External Readiness",2))
story.append(B("[L1] Every integration reports readiness across 4 independent dimensions. 'Connected' requires ALL FOUR dimensions to be satisfied. This prevents the false claim 'connected' when only the technical dimension is met."))
readiness=[
    ["Dimension","Question","Evidence Required"],
    ["TECHNICAL","Is the API/EDI integration working?","API response logs, successful test transactions, uptime metrics"],
    ["LEGAL","Are contracts/agreements signed?","Signed legal agreement, data processing agreement, NDA"],
    ["OPERATIONAL","Are procedures tested and documented?","Runbook, trained operators, tested failure scenarios"],
    ["COMMERCIAL","Are fees and commercial terms agreed?","Signed commercial agreement, fee schedule, SLA"],
]
story.append(mt(readiness,cw=[25*mm,50*mm,85*mm]))
story.append(B("[L1] <b>Example:</b> If the TECHNICAL dimension is met (API works) but the LEGAL dimension is not (contract not signed), the integration status is 'SANDBOX_CONNECTED' — not 'PRODUCTION_CONNECTED'. The 4-dimension model ensures honest reporting."))
story.append(PageBreak())

# Part 7-10 (condensed)
story.append(H("7. Regulatory Classification Gate",1))
story.append(B("[L1] The Regulatory Classification Gate maps the platform's actual functionality to the applicable licence class in each jurisdiction. This is a dynamic, jurisdiction-aware classification — not a static label."))
story.append(B("[L0-22] <b>Non-custody is architectural, not legal classification.</b> SGTX's non-custody property is an architectural fact (the platform never holds customer funds). However, actual functionality determines licensing in each jurisdiction. A jurisdiction may classify SGTX's orchestration role as requiring specific licences regardless of the non-custody architecture."))
story.append(B("[L1] The classification matrix starts with Egypt (CBE Law 194/2020, Nafeza customs, ETA tax) and is extensible to other jurisdictions via the Jurisdiction Capability Adapter. The matrix maps each SGTX functionality to: (1) the applicable Egyptian law/regulation, (2) the required licence/registration, (3) the responsible authority, and (4) the current compliance status."))
story.append(SP(5))

story.append(H("8. Closure Policy",1))
story.append(B("[L1] A USTN is closed only when all 7 closure conditions are met. Closure is earned, not forced. The canClose predicate is a pure function that evaluates all 7 conditions and returns true only if all are satisfied."))
closure=[
    ["#","Condition","Description","Evidence Required"],
    ["1","Delivery Accepted","Final delivery confirmed by receiver — quantity, condition, quality verified.","Proof of Delivery (POD) signed by receiver, including condition assessment."],
    ["2","Settlement Complete","All payment legs settled (goods, freight, duty, SGTX fee, service fees).","Bank settlement confirmation Events for all legs."],
    ["3","Financial Reconciliation Complete","Bank/PSP reconciliation matches SGTX records — no material mismatch.","Reconciliation report showing all legs match within tolerance (<$1)."],
    ["4","Customs Complete","Import and export customs cleared, no open holds.","Customs clearance Events from customs authority."],
    ["5","Post-Clearance Complete","Post-clearance audit, correction, refund/drawback processed if applicable.","Post-clearance audit closure or 'no audit required' confirmation."],
    ["6","Disputes/Claims Satisfied","All filed disputes and claims resolved or time-barred.","Dispute resolution Events for all open disputes."],
    ["7","Evidence Sealed","26-category evidence package assembled, hashed, and sealed (immutable).","Evidence package hash + sealing Event from Governor."],
]
story.append(mt(closure,cw=[6*mm,35*mm,60*mm,64*mm]))
story.append(SP(3))
story.append(B("[L1] <b>canClose predicate:</b> canClose(ustn) = AND(conditions[1..7] all met). The Governor evaluates this predicate; it never auto-closes. If canClose returns true, a human (multisig 2-of-3) triggers the closure ceremony."))
story.append(B("[L1] <b>CLOSED_WITH_EXCEPTION:</b> In limited cases, a USTN may be closed with an open exception if the sole blocker is an EXCEPTION_OPEN state with severity ≤ 2 (low). Severity 3–5 exceptions block closure. The severity matrix ensures that minor administrative exceptions do not indefinitely block closure, while material exceptions do."))
story.append(B("[L1] <b>Post-closure event rules (§22):</b> After closure, a post-closure observation period is active (default 90 days, extendable). New evidence may be added (e.g., late-arriving customs confirmation) but sealed evidence cannot be modified. The Transaction Twin continues to observe and may trigger re-opening if a material exception (severity 3+) is discovered during the observation period."))
story.append(PageBreak())

story.append(H("9. AI Recommendation Gateway",1))
story.append(B("[L1] The AI Recommendation Gateway channels AI outputs through the Governor pipeline. AI never executes directly; it proposes, and the Governor decides. This is the constitutional boundary [L0-9, L0-21]."))
story.append(B("[L1] <b>Flow:</b> (1) AI subsystem (A1–A3) produces a recommendation. (2) Recommendation is submitted to the Governor as a Command. (3) Governor evaluates against G1–G7, OPA policies, WasmEdge rules. (4) If ALLOW, the recommended action is executed by the deterministic policy engine (A4). (5) If CONDITIONAL, conditions are recorded. (6) If DENY, the recommendation is blocked + reason logged. (7) The event is appended to the Loom."))
story.append(B("[L1] <b>Multi-model consensus:</b> The AI Brain uses 3 independent providers (Gemini, Groq, HuggingFace) for consensus-based recommendations. Each provider is queried in parallel; results are merged via weighted voting (Gemini 0.4, Groq 0.35, HuggingFace 0.25). A minimum of 2 providers must agree for A2/A3 recommendations. This prevents single-provider bias and improves recommendation quality."))
story.append(SP(5))

story.append(H("10. Transport Engine Architecture",1))
story.append(B("[L1] SGTX supports 5 transport modes as first-class engines, each with its own entity types, state machines, and terminal adapters. A Multimodal Orchestrator coordinates multi-leg journeys across modes. The USTN remains the canonical reference across all modes."))
story.append(H("10.1 Road Corridor Engine (Articles 43-46)",2))
story.append(B("[L1] The Road Corridor Engine handles international trucking across multiple countries. It supports Egypt, Jordan, Saudi, UAE, GCC, Iraq, Libya, and future jurisdictions. Key entities:"))
road_entities=[
    ["Entity","Purpose","Key Fields"],
    ["RoadCorridor","Top-level corridor (e.g., Egypt → Jordan → Saudi → UAE)","corridorCode, originCountry, destinationCountry, transitCountries, totalDistanceKm, estimatedTransitHours"],
    ["RoadLeg","A single leg within a corridor (e.g., Cairo → Aqaba border)","corridorId, sequence, originLocation, destinationLocation, borderCrossing, distanceKm, estimatedHours"],
    ["RoadShipment","A specific shipment moving through a corridor","ustn, corridorId, carrierGtid, vehicleId, driverId, status (PLANNED→IN_TRANSIT→AT_BORDER→CLEARED→DELIVERED)"],
    ["RoadVehicle","Registered truck/trailer","vehicleRegistration, vehicleType (TRUCK/TRAILER/TRACTOR), capacityKg, insuranceValidUntil, dgCapability, reeferCapability"],
    ["RoadDriver","Authorized driver","fullName, passportNumber, licenseNumber, licenseValidUntil, visaCountries, dgAuthorization"],
    ["RoadBorderCrossing","Border crossing event","shipmentId, borderName, country, crossingType (EXIT/ENTRY/TRANSIT), customsDeclarationRef, sealNumber"],
    ["RoadGpsTracking","GPS ping for a shipment","shipmentId, latitude, longitude, recordedAt, speed, heading"],
]
story.append(mt(road_entities,cw=[30*mm,50*mm,80*mm]))
story.append(SP(3))
story.append(H("10.2 Air Cargo Engine (Articles 47-52)",2))
story.append(B("[L1] The Air Cargo Engine handles air freight with IATA ONE Record compatibility. Key entities:"))
air_entities=[
    ["Entity","Purpose","Key Fields"],
    ["AirBooking","Top-level air booking","ustn, bookingReference, shipperGtid, consigneeGtid, originAirport, destinationAirport, flightDate, mawbNumber"],
    ["AirFlight","Flight record","flightNumber, airline, originAirport, destinationAirport, scheduledDeparture, scheduledArrival, aircraftType"],
    ["AirAirport","Airport reference","iataCode (e.g., CAI), icaoCode, name, city, country, timezone"],
    ["AirWaybill","MAWB / HAWB","bookingId, waybillType (MAWB/HAWB), waybillNumber, shipper, consignee"],
    ["AirPiece","Individual cargo piece","bookingId, pieceNumber, sscc, weightKg, lengthCm, widthCm, heightCm, volumeCbm"],
    ["AirUld","Unit Load Device (container)","bookingId, uldNumber, uldType (AKE/PAJ/PMC), tareWeightKg, maxPayloadKg, contents"],
    ["AirStatusEvent","Milestone status event (RCS/DEP/ARR/RCF/NFD/DLV)","bookingId, eventType, eventTime, airport, remarks"],
    ["AirChargeableWeight","Chargeable weight calculation","bookingId, actualWeightKg, volumetricWeightKg, chargeableWeightKg, ratePerKg, totalCharge"],
]
story.append(mt(air_entities,cw=[30*mm,50*mm,80*mm]))
story.append(SP(3))
story.append(B("[L1] <b>Air status event types:</b> RCS (Received for Shipment), DEP (Departed), ARR (Arrived), RCF (Received at Consignee Facility), NFD (Notified for Delivery), DLV (Delivered). These are the IATA standard milestone codes."))
story.append(B("[L1] <b>Chargeable weight:</b> The greater of actual weight and volumetric weight. Volumetric weight = (length × width × height in cm) / 6000 (IATA standard divisor)."))
story.append(SP(3))
story.append(H("10.3 Ocean Container Engine (Article 53)",2))
story.append(B("[L1] The Ocean Container Engine handles containerised sea freight. Key entities: Booking, Vessel, Voyage, Port, Container, VGM (Verified Gross Mass), B/L, e-B/L, Manifest, ACI, Terminal, Gate, Transshipment, Demurrage, Detention, Delivery. The engine integrates with Add-On 9 (Demurrage) for cost tracking and Add-On 24 (Port & Terminal) for gate events."))
story.append(SP(3))
story.append(H("10.4 RoRo & Rolling Cargo Engine (Articles 55-86)",2))
story.append(B("[L1] The RoRo Engine is the largest transport engine, covering 32 blueprint articles. It handles vehicles and rolling cargo with VIN-level tracking. Key entities:"))
roro_entities=[
    ["Entity","Purpose","Key Fields"],
    ["RoRoShipment","Top-level master object","ustn, shipmentReference, shipperGtid, consigneeGtid, originPort, destinationPort, totalUnits, totalWeightKg"],
    ["RoRoUnit","Individual rolling cargo unit (VIN-level)","shipmentId, vin, unitType (VEHICLE/TRUCK/TRACTOR/TRAILER/BUS/MOTORCYCLE/MACHINERY), make, model, year, weightKg, runningStatus"],
    ["RoRoVoyage","Vessel voyage","vesselName, vesselImo, voyageNumber, operatorGtid, originPort, destinationPort, etd, eta, bookingCutoff, gateCutoff"],
    ["RoRoBooking","Booking on a voyage","shipmentId, voyageId, bookingReference, unitsCount, totalWeightKg, preferredSailing, deliveryWindow"],
    ["RoRoYard","Yard position tracking","unitId, yardZone, block, row, slot, deck, position, status (EXPECTED→ARRIVED→GATE_IN→INSPECTED→PARKED→READY_FOR_LOADING→LOADED→DISCHARGED→AVAILABLE→RELEASED→GATE_OUT)"],
    ["RoRoGateEvent","Gate-in / gate-out event","shipmentId, unitId, eventType (GATE_IN/GATE_OUT), gateType (ORIGIN/DESTINATION), eventTime, vinScan, customsStatus"],
    ["RoRoInspection","Pre-load / post-discharge inspection","unitId, inspectionType (PRE_LOAD/POST_DISCHARGE/CLAIM), inspectorName, mileage, fuelLevel, preExistingDamage, newDamage"],
    ["RoRoBillOfLading","B/L for the shipment","shipmentId, blNumber, blType (MASTER/HOUSE), shipper, consignee, vesselName, voyageNumber, vinsList"],
]
story.append(mt(roro_entities,cw=[30*mm,50*mm,80*mm]))
story.append(SP(3))
story.append(B("[L1] <b>19-state unit state machine:</b> BOOKED → DOCUMENTS_PENDING → CUSTOMS_PENDING → READY_FOR_GATE → GATE_IN → INSPECTION_PENDING → INSPECTED → YARD → READY_FOR_LOAD → LOADED → AT_SEA → TRANSSHIPMENT → DISCHARGED → DESTINATION_YARD → CUSTOMS_HOLD → CUSTOMS_RELEASED → DELIVERY_ORDER → READY_FOR_GATE_OUT → GATE_OUT → DELIVERED → ACCEPTED."))
story.append(B("[L1] <b>12-state vessel state machine:</b> SCHEDULED → BOOKING_OPEN → CUTOFF_APPROACHING → CARGO_ACCEPTING → LOADING → DEPARTED → AT_SEA → TRANSSHIPMENT → ARRIVED → DISCHARGING → COMPLETED. Never mix with unit state."))
story.append(B("[L1] <b>Damage comparison:</b> AI (A2) marks POSSIBLE_DAMAGE; human marks CONFIRMED_DAMAGE. States: NO_CHANGE, POSSIBLE_DAMAGE, CONFIRMED_DAMAGE, DISPUTED_DAMAGE. AI never determines liability autonomously."))
story.append(SP(3))
story.append(H("10.5 Rail Engine (Article 54)",2))
story.append(B("[L1] The Rail Engine handles rail freight with CIM/SMGS consignment note support. Key entities: RailBooking, RailTrain, RailWagon, RailTerminal, RailConsignment, RailTransit, RailStatusEvent."))
story.append(B("[L1] <b>Consignment note types:</b> CIM (EU rail) and SMGS (former Soviet rail). The engine supports both formats and can convert between them for cross-border rail movements."))
story.append(SP(3))
story.append(H("10.6 Multimodal Orchestrator",2))
story.append(B("[L1] The Multimodal Orchestrator coordinates multi-leg journeys across transport modes. A single USTN may span: Truck → RoRo → Rail → Truck (e.g., Egypt → Damietta → Trieste → Rail → Rotterdam → Truck → Final Destination). The orchestrator manages the handoff between modes, ensuring that the USTN remains the canonical reference across all legs."))
story.append(B("[L1] <b>Transport hierarchy:</b> ROAD, AIR, OCEAN_CONTAINER, RORO, RAIL, FERRY, MULTIMODAL — all beneath one transport orchestrator and one USTN graph. Each specialist engine owns mode-specific rules; the orchestrator coordinates cross-mode handoffs."))
story.append(PageBreak())

# Part 11-13
story.append(H("11. Canonical Data Model",1))
story.append(B("[L1] The SGTX Canonical Data Model consists of the following primary stores. Each store has a specific purpose and a defined schema. The stores are designed to be independently queryable while maintaining cross-references via the USTN."))
cdm=[
    ["Store","Purpose","Key Fields","Retention"],
    ["State Vector Store","12-domain × F0-F5 finality tracking per USTN","ustn, domainClocks[12], finalityClass, divergenceIndex, healthScore","7 years"],
    ["Event Spine","Immutable hash-chained event log","eventId, previousEventHash, eventType, ustn, timestamp, actorGtid, payload, signature","7 years"],
    ["Obligation Graph","Directed dependency graph of trade obligations","obligationId, ustn, type, state, dependencies[], transitiveImpact","7 years"],
    ["Settlement Instructions/Legs","Multi-leg payment instruction tracking","instructionId, ustn, legs[], atomicityPolicy, state","7 years"],
    ["External Identifier Registry","17 identifier types (UCR, MAWB, HAWB, B/L, etc.)","identifierId, type, value, ustn, lifecycle, issuingAuthority","7 years"],
    ["Recovery Vault","Content-addressable (SHA-256) evidence storage","entryId, ustn, type, contentHash, reference, verified","7 years"],
    ["Transaction Twin","14-domain digital twin for post-closure observation","twinId, ustn, domains[14], postClosureActive, observationExpiry","7 years"],
    ["Financial Exposure","14-dimension exposure tracking per USTN","exposureId, ustn, dimensions[14], state, outstandingAmount","7 years"],
    ["Exception Events","Severity 1-5 exception tracking with SLA","exceptionId, ustn, category, severity, slaDeadline, resolutionAction","7 years"],
    ["Closure Policy","7-condition closure evaluation per USTN","policyId, ustn, conditions[7], blockers[], canClose, closureState","7 years"],
    ["Trade Stage Log","36-stage lifecycle tracking per USTN","id, ustn, stageCode, stageName, completedAt, completedBy","7 years"],
    ["Quote","Dedicated quote entity (replaces JSON-in-Trade.globalNotes)","id, ustn, quoteNumber, totalQuote, exwPrice, sgtxFee, lineItems, status","7 years"],
]
story.append(mt(cdm,cw=[35*mm,50*mm,65*mm,15*mm]))
story.append(PageBreak())

story.append(H("12. Provider Relationship Model",1))
story.append(B("[L1] The provider relationship model governs how traders connect to service providers (LSPs, carriers, brokers, QC, labs, insurers, financiers). The model is relationship-controlled, not marketplace."))
story.append(B("[L1] <b>Relationship types:</b> A provider can become available to a trader because: (1) it is already approved and connected (platform-level approval), (2) the trader has saved its GTID (trader-level save), (3) the trader explicitly selected it (per-trade selection), or (4) a government-mandated service relationship exists (e.g., mandatory port authority)."))
story.append(B("[L1] <b>Prohibited:</b> random provider matching, unsolicited provider recommendations, 'best provider' suggestions, public provider rankings, public provider marketplace, autonomous provider selection. These are all blocked by the non-marketplace principle [L0-2, L0-16, L0-25]."))
story.append(B("[L1] <b>Workflow:</b> Trader → Approved/Connected/Saved Provider → RFQ/Quote → Trader Review → Trader Explicit Selection → Service Agreement/Addendum → Execution. The trader always makes the final selection — the platform never auto-selects a provider."))
story.append(SP(5))

story.append(H("13. Master Global Trade Graph",1))
story.append(B("[L1] The entire SGTX platform is represented as a directed graph: GTID → TRADE → RFQ → QUOTATION → ORDER → CONTRACT → REGULATORY_SNAPSHOT → USTN → TRANSPORT_GRAPH → CUSTOMS_OPERATIONS → DOCUMENTS → GOVERNMENT_REFERENCES → PAYMENT/FINANCE → PHYSICAL_EXECUTION → DELIVERY → ACCEPTANCE → SETTLEMENT → RECONCILIATION → POST-CLEARANCE → CLAIMS/RETURNS → EVIDENCE → USTN_CLOSED."))
story.append(B("[L1] Every node in this graph references the USTN. The graph is traversable in both directions — from a USTN, you can find all related nodes; from any node, you can find the parent USTN. This enables comprehensive audit trails and cross-referencing."))
story.append(PageBreak())

# ═══════════════════════════════════════════════════════════════════════════════
# LAYER 2 — IMPLEMENTATION SPECS
# ═══════════════════════════════════════════════════════════════════════════════
story.append(H("PART IV — LAYER 2: IMPLEMENTATION SPECIFICATIONS",0))
story.append(B("[L2] This layer contains concrete, testable implementation artefacts. These specifications are designed to be directly implementable by an engineering team without ambiguity."))
story.append(SP(5))

story.append(H("14. Canonical Event Type Catalogue",1))
story.append(B("[L2] The following event types are canonical. Each event has required fields, an authority class (who may emit it), a clock impact (which domain clock it advances), and lineage rules (what it references)."))
events=[
    ["Event Type","Authority","Clock Impact","Required Fields","Lineage"],
    ["TradeInitiated","Assertion (Buyer)","Commercial F1","ustn, buyerGtid, sellerGtid, commodity, incoterm, tradeValueUsd","References: buyerGtid, sellerGtid"],
    ["QuoteSubmitted","Assertion (Seller)","Commercial F2","ustn, quoteId, totalQuote, exwPrice, sgtxFee, lineItems","References: ustn, sellerGtid"],
    ["QuoteAccepted","Assertion (Buyer)","Commercial F3","ustn, quoteId, acceptedAt","References: ustn, quoteId"],
    ["NegotiationStarted","Assertion (Party)","Commercial F2","ustn, round, proposalType, proposalDetails","References: ustn, quoteId"],
    ["PurchaseOrderCreated","Assertion (Buyer)","Commercial F3","ustn, poNumber, totalValue, lineItems","References: ustn, quoteId"],
    ["SalesOrderCreated","Assertion (Seller)","Commercial F3","ustn, soNumber, poId, totalValue","References: ustn, poId"],
    ["ProformaIssued","Assertion (Seller)","Commercial F3","ustn, proformaNumber, totalAmount, validUntil","References: ustn, soId"],
    ["ContractLocked","Confirmation (Governor)","Commercial F4, Governance F3","ustn, multisigId, conditions[]","References: ustn, all prior"],
    ["RegulatorySnapshotCaptured","Observation (System)","Compliance F3","ustn, snapshotHash, tariffRate, sanctionsStatus","References: ustn, jurisdiction"],
    ["ShipmentBooked","Assertion (Shipper)","Logistics F2","ustn, bookingRef, mode, origin, destination","References: ustn, contractId"],
    ["ContainerLoaded","Observation (Terminal)","Logistics F3","ustn, containerNumber, vesselName, voyageNumber","References: ustn, bookingRef"],
    ["VesselDeparted","Observation (Carrier)","Logistics F3","ustn, vesselName, voyageNumber, actualDeparture","References: ustn, bookingRef"],
    ["CustomsDeclarationSubmitted","Assertion (Broker)","Customs F2","ustn, declarationRef, declarationType","References: ustn, shipmentId"],
    ["CustomsCleared","Confirmation (Authority)","Customs F4","ustn, clearanceRef, clearedAt","References: ustn, declarationRef"],
    ["PaymentInstructionSubmitted","Assertion (Payer)","Financial F2","ustn, legId, amount, currency, beneficiary","References: ustn, bankRef"],
    ["PaymentSettled","Confirmation (Bank)","Financial F4","ustn, legId, bankRef, settledAt","References: ustn, legId"],
    ["InspectionCompleted","Assertion (QC/Lab)","QC F3","ustn, inspectionId, result, inspector","References: ustn, shipmentId"],
    ["DeliveryAccepted","Assertion (Receiver)","Logistics F5","ustn, podRef, acceptedAt, condition","References: ustn, shipmentId"],
    ["DisputeFiled","Assertion (Party)","Dispute F2","ustn, disputeId, reason, filedBy","References: ustn, evidence[]"],
    ["ExceptionRaised","Observation (System)","Governance F2","ustn, exceptionId, category, severity","References: ustn, trigger"],
    ["RecoveryExecuted","Confirmation (Governor)","Governance F3","ustn, exceptionId, recoveryPath, recoveredAt","References: ustn, exceptionId"],
    ["EvidenceSealed","Confirmation (Governor)","Evidence F5","ustn, evidenceHash, sealedAt, categories[26]","References: ustn, all"],
    ["USTNClosed","Confirmation (Governor)","All domains F5","ustn, closedAt, closedBy, conditionsMet[7]","References: ustn, all"],
    ["TradeStageCompleted","Observation (System)","Governance F3","ustn, stageCode, stageName, completedAt, completedBy","References: ustn, prior stage"],
]
story.append(mt(events,cw=[32*mm,22*mm,22*mm,50*mm,38*mm]))
story.append(SP(3))
story.append(B("[L2] <b>Required fields for ALL events:</b> eventId, eventType, ustn, timestamp, actorGtid, authorityClass, previousEventHash, payload (JSON), signature (QES or system). Events without these fields are rejected by the Event Spine."))
story.append(PageBreak())

story.append(H("15. API Contract Structure",1))
story.append(B("[L2] The SGTX API enforces Command/Event separation. Commands are POST/PUT requests that intent to change state. Events are GET requests that retrieve immutable records. No API endpoint both reads and writes state."))
story.append(B("[L2] <b>Standard response envelope:</b> All API responses use { ok: boolean, data: ..., error?: string, filter?: object }. List endpoints return { ok, <entity_plural>, count, filter }. This is the v14.0 standardized contract — all transport engines (Road, Air, RoRo, Rail) return this shape."))
story.append(B("[L2] <b>Idempotency:</b> All POST endpoints accept an Idempotency-Key header. If the same key is sent twice, the second request returns the first request's response without re-executing. This prevents duplicate trade creation on network retry."))
story.append(B("[L2] <b>Rate limiting:</b> API endpoints are rate-limited per tenant GTID. Standard limit: 100 requests/minute. AI-intensive endpoints: 20 requests/minute. Rate limit headers (X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset) are included in every response."))
story.append(SP(5))

story.append(H("16. Observability Catalogue",1))
story.append(B("[L2] SGTX maintains the following observability surfaces:"))
obs=[
    ["Surface","Metrics","Retention","Alerting"],
    ["Platform Health","Request rate, error rate, latency p50/p95/p99, uptime","30 days","SEV-0 if uptime <99.5%"],
    ["Trade Metrics","Trades initiated, USTN closure rate, avg trade value, avg time-to-close","7 years","SEV-1 if closure rate <80%"],
    ["Governor Metrics","Decisions/minute, DENY rate, CONDITIONAL rate, multisig latency","7 years","SEV-1 if DENY rate >10%"],
    ["Event Spine Metrics","Events/minute, hash chain verification, replay success rate","7 years","SEV-0 if hash chain breaks"],
    ["Settlement Metrics","Settlement leg states, bank API latency, reconciliation match rate","7 years","SEV-1 if reconciliation mismatch >$1"],
    ["Exception Metrics","Open exceptions by severity, SLA breach count, recovery success rate","7 years","SEV-1 if any severity 4+ exception open >24h"],
    ["AI Metrics","Recommendations/minute, acceptance rate, fallback rate, provider latency","30 days","SEV-2 if provider latency >15s"],
    ["Integration Metrics","Connector health (16 states), API success rate, sandbox vs production","90 days","SEV-1 if production connector DEGRADED"],
]
story.append(mt(obs,cw=[35*mm,65*mm,20*mm,40*mm]))
story.append(SP(3))
story.append(B("[L2] <b>Minimum failure-path test suite:</b> The platform maintains an adversarial test suite covering:"))
tests=[
    ["#","Test","Expected Result"],
    ["1","USTN closure with missing conditions","Must block — canClose returns false"],
    ["2","Non-custody violation attempt","Must block — WasmEdge detects fund-holding code path"],
    ["3","AI A5 autonomy attempt","Must block — AI cannot call state-mutating APIs directly"],
    ["4","Marketplace matching attempt","Must block — no public listing/ranking/recommendation endpoints"],
    ["5","Event spine tampering","Must detect — hash chain verification fails"],
    ["6","Governor bypass attempt","Must block — all state mutations call governorDecide()"],
    ["7","Settlement without bank confirmation","Must block — settlement requires bank Event, not SGTX confirmation"],
    ["8","Recovery that erases history","Must block — Loom is append-only, corrections via new events"],
    ["9","Closure with open severity 3+ exception","Must block — CLOSED_WITH_EXCEPTION only for severity ≤2"],
    ["10","Reserve ratio below 110%","Must block — WasmEdge constitutional rule"],
]
story.append(mt(tests,cw=[8*mm,75*mm,77*mm]))
story.append(PageBreak())

story.append(H("17. RTO/RPO Targets",1))
story.append(B("[L2] Recovery Time Objective and Recovery Point Objective targets:"))
rto=[
    ["Tier","RTO","RPO","Scope","Durability"],
    ["Critical","4 hours","0 (append-only)","Event Spine, State Vector, Governor decisions","3 copies, 2 jurisdictions, quorum 2-of-3"],
    ["Standard","24 hours","0 (append-only)","All trade data, settlement instructions, evidence","3 copies, 2 jurisdictions, quorum 2-of-3"],
    ["Extended","72 hours","< 1 hour","Add-on data, analytics, logs","2 copies, 1 jurisdiction, single-write"],
]
story.append(mt(rto,cw=[18*mm,18*mm,22*mm,55*mm,47*mm]))
story.append(SP(3))
story.append(B("[L2] <b>Durability definition:</b> '3 copies, 2 jurisdictions, quorum 2-of-3' means data is replicated to 3 storage nodes across at least 2 legal jurisdictions, and writes require acknowledgement from 2 of 3 nodes before acknowledgement. This ensures no single jurisdiction's legal action can make data unavailable."))
story.append(SP(5))

story.append(H("18. Security Architecture",1))
story.append(B("[L2] Security is enforced at multiple layers:"))
security=[
    ["Layer","Mechanism","Enforcement"],
    ["Network","mTLS between all services, network isolation, DDoS protection","Infrastructure-level — all inter-service traffic is mTLS"],
    ["Authentication","QES (Qualified Electronic Signature) for all authoritative acts","WasmEdge verifies QES before executing irreversible actions"],
    ["Authorization","OPA policies per endpoint + multisig for irreversible","Governor pipeline evaluates OPA + multisig before execution"],
    ["Data at rest","AES-256 encryption for all databases","Database-level — Turso/libsql encryption"],
    ["Data in transit","TLS 1.3 for all API calls","Infrastructure-level — no HTTP, only HTTPS"],
    ["Audit","Loom hash chain + 7-year retention","Immutable — append-only, externally verifiable"],
    ["PQC","Dilithium3 for archival records (Add-On 6)","Long-term protection against quantum attacks"],
    ["Secrets","HSM (Hardware Security Module) for key storage","Infrastructure-level — no keys in code or config files"],
]
story.append(mt(security,cw=[25*mm,60*mm,75*mm]))
story.append(SP(5))

story.append(H("19. Global Standards Gateway",1))
story.append(B("[L2] SGTX integrates with 20 global standards for interoperability:"))
standards=[
    ["Standard","Purpose","Direction"],
    ["WCO Data Model","Customs data interoperability","SGTX → WCO mapping (output)"],
    ["WCO Code Lists","Standardised code lists (HS, country, currency)","SGTX uses WCO codes (input)"],
    ["HS (Harmonized System)","Commodity classification","SGTX uses HS6+ (input/output)"],
    ["UN/CEFACT","Trade facilitation standards","SGTX → UN/CEFACT mapping"],
    ["UN/LOCODE","Port/airport location codes","SGTX uses UN/LOCODE (input)"],
    ["UN/EDIFACT","EDI message format","SGTX → EDIFACT (output for legacy systems)"],
    ["UBL","Universal Business Language","SGTX → UBL (output for electronic documents)"],
    ["e-CMR","Electronic Consignment Note (road)","SGTX → e-CMR (output)"],
    ["e-AWB","Electronic Air Waybill","SGTX → e-AWB (output)"],
    ["e-B/L","Electronic Bill of Lading","SGTX → e-B/L (output)"],
    ["Cargo-XML","IATA cargo XML standard","SGTX → Cargo-XML (output)"],
    ["ONE Record","IATA single digital shipment view","SGTX ↔ ONE Record (bidirectional)"],
    ["ISO 20022","Financial messaging standard","SGTX → ISO 20022 (output for bank integration)"],
    ["XAdES/CAdES/PAdES","Advanced electronic signatures","SGTX uses for QES"],
    ["GS1/EPCIS","Supply chain event tracking","SGTX → EPCIS (output)"],
    ["Verifiable Credentials","Decentralised identity","SGTX → VC (output for tenant credentials)"],
]
story.append(mt(standards,cw=[35*mm,65*mm,60*mm]))
story.append(PageBreak())

# ═══════════════════════════════════════════════════════════════════════════════
# PART V — PORTAL DOCUMENTATION
# ═══════════════════════════════════════════════════════════════════════════════
story.append(H("PART V — PORTAL DOCUMENTATION (12 Portals)",0))
story.append(B("[L2] This section documents all 12 SGTX portals in full. Each portal's tabs, screens, workflows, and data access patterns are documented. This is the comprehensive user-facing surface documentation that enables an engineering team to implement each portal without ambiguity."))
story.append(B("[L2] The SGTX platform has 178 total tab entries across 12 portals. Each tab is a distinct screen with a specific purpose. Every tab is wired to a dispatcher branch in PortalContent.tsx — 100% wiring coverage."))
story.append(SP(5))

# Portal 1 — Buyer
story.append(H("20.1 Buyer Portal — Full Workflow",1))
story.append(B("<b>Portal ID:</b> trader-buyer | <b>Tenant:</b> European Importer GmbH (SGTX-DE-TRD-001234-5B6C) | <b>Role:</b> Importer | <b>Tagline:</b> Import · Inbound · Settlement"))
story.append(B("<b>1-Click Actions:</b> 1-Click New Trade (→ new-trade tab) | 1-Click Pay Invoice (→ invoices tab)"))
story.append(B("<b>Tabs (33 total):</b>"))
buyer_tabs=[
    ["Group","Tab","Purpose","Screen"],
    ["Overview","Command Center","Executive summary + 1-Click Action Bar + Trade Lifecycle Visualizer + Smart Inbox","CommandCenter"],
    ["Trade","New Trade Request","11-step wizard: Parties → Commodity → Containers → Documentation → Transport → Insurance → Settlement → Criticality → Shipments → Compliance Gates → Governor & Submit","NewTradeRequestScreen"],
    ["Trade","Active Trades","List of trades in active execution (PENDING_SELLER_RESPONSE through IN_EXECUTION)","BuyerActiveTradesScreen"],
    ["Trade","Drafts","Trades awaiting seller response (editable/cancellable)","BuyerDraftsScreen"],
    ["Trade","History","Closed, settled, cancelled, rejected trades (read-only audit)","BuyerHistoryScreen"],
    ["Trade","Quote Review & Negotiation","Review seller quotes, accept/reject/counter","QuoteReviewScreen"],
    ["Trade","Negotiations","Active and historical negotiations (round, proposal type, status)","NegotiationsScreen"],
    ["Trade","Purchase Orders","Buyer-created POs (PO number, seller, value, status)","PurchaseOrdersScreen"],
    ["Trade","Proforma Invoices","Proforma invoices received from sellers","ProformaInvoicesScreen"],
    ["Trade","Contract Signing","Sign contract addenda, view contract status","ContractSigningScreen"],
    ["Trade","Shipments","Track inbound shipments (vessel, ETA, milestones)","ShipmentsVault"],
    ["Trade","Container Compliance","Per-container compliance status (VGM, seal, manifest)","ContainerComplianceScreen"],
    ["Trade","Milestone Tracking","Track delivery milestones (departure, transit, arrival)","MilestoneScreen"],
    ["Trade","Reefer Monitoring","Real-time reefer temperature + humidity + anomalies","ReeferTelemetryPanel"],
    ["Trade","Documents","Trade document repository (invoice, B/L, COO, certificates)","DocumentsScreen"],
    ["Trade","Distressed Cargo","Distressed cargo listings + liquidation options","DistressedScreen"],
    ["Trade","Routes Reference","Worldwide port routes reference (carrier, transit time, frequency)","RoutesReferenceScreen"],
    ["Trade","Demurrage","Demurrage tracking + alerts (Add-On 9)","DemurragePanel"],
    ["Trade","Cold Chain","Cold chain compliance + PTI + readings (Add-On 12)","ColdChainPanel"],
    ["Finance","Financing (Borrower)","Request trade financing from connected banks/PFIs","FinancingBorrowerScreen"],
    ["Finance","Invoices & Payments","View invoices, approve payment, track settlement","InvoicesScreen"],
    ["Finance","FX & Settlement","Multi-currency settlement + FX rates + reconciliation","SettlementScreen"],
    ["Governance","Disputes","File disputes, track dispute resolution","DisputesScreen"],
    ["Governance","Compliance","Sanctions screening, regulatory checks, KYB status","ComplianceScreen"],
    ["Governance","Audit Trail","Immutable event history for the tenant's trades","AuditScreen"],
    ["Governance","Network (Contacts)","Saved counterparty network (no public marketplace)","NetworkScreen"],
    ["Governance","Trust Passport","Tenant's trust portrait + KYB tier + trust score","PassportScreen"],
    ["Governance","Trade Readiness","Readiness score + missing items (advisory, non-blocking)","ReadinessScreen"],
    ["Governance","Tenant Lifecycle","Onboarding status + KYB verification + lifecycle state","LifecycleScreen"],
    ["Governance","Compliance Calendar","Regulatory deadlines + certificate expiries (Add-On 18)","ComplianceCalendarPanel"],
    ["Admin","Org Graph","Organisational graph (employees, roles, permissions)","OrgGraphScreen"],
    ["Admin","GTID Chat","Cross-tenant secure messaging","ChatScreen"],
    ["Admin","Company Admin","Company settings + employee management + bank details","CompanyAdminScreen"],
]
story.append(mt(buyer_tabs,cw=[18*mm,35*mm,70*mm,40*mm]))
story.append(SP(3))
story.append(B("<b>Buyer workflow (end-to-end):</b>"))
story.append(BU("<b>1. Initiate trade:</b> Click '1-Click New Trade' → 11-step wizard → submit → trade created with PENDING_SELLER_RESPONSE status + seller notified + government notified."))
story.append(BU("<b>2. Review quote:</b> Seller submits quote → buyer sees it in 'Quote Review' → accept/reject/counter. If counter, negotiation round created."))
story.append(BU("<b>3. Create PO:</b> After quote acceptance → create Purchase Order → seller creates matching Sales Order."))
story.append(BU("<b>4. Sign contract:</b> Review contract addenda → sign → Governor locks contract → USTN minted → regulatory snapshot captured."))
story.append(BU("<b>5. Track shipment:</b> Monitor shipment progress via 'Shipments' + 'Milestone Tracking' + 'Reefer Monitoring' (if cold chain)."))
story.append(BU("<b>6. Approve payment:</b> Click '1-Click Pay Invoice' → review invoice → approve → payment instruction sent to bank → settlement tracked."))
story.append(BU("<b>7. Accept delivery:</b> Receive goods → verify quantity/condition → accept delivery → POD signed."))
story.append(BU("<b>8. Close USTN:</b> Click '1-Click Close USTN' → 7-condition check → if all met, USTN closed + evidence sealed."))
story.append(PageBreak())

# Portal 2 — Seller
story.append(H("20.2 Seller Portal — Full Workflow",1))
story.append(B("<b>Portal ID:</b> trader-seller | <b>Tenant:</b> Strawberry Export Co. (SGTX-EG-TRD-002139-7F3A) | <b>Role:</b> Exporter | <b>Tagline:</b> Export · Outbound · Pricing"))
story.append(B("<b>1-Click Actions:</b> 1-Click Submit Quote (→ quote-builder tab) | 1-Click Request Payout (→ invoices tab)"))
story.append(B("<b>Tabs (31 total):</b>"))
seller_tabs=[
    ["Group","Tab","Purpose","Screen"],
    ["Overview","Command Center","Executive summary + Seller Control Tower + 1-Click Action Bar","CommandCenter"],
    ["Trade","Pending Requests","Inbound trade requests from buyers","SellerPendingRequestsScreen"],
    ["Trade","Quote & Packing","Build EXW quote + packing plan + commodity line items","QuoteBuilderScreen"],
    ["Trade","Negotiations","Active negotiations with buyers","NegotiationsScreen"],
    ["Trade","Sales Orders","Sales orders created from accepted POs","SalesOrdersScreen"],
    ["Trade","Proforma Invoices","Proforma invoices issued to buyers","ProformaInvoicesScreen"],
    ["Trade","Contract & Addenda","Sign contract + manage addenda","ContractSigningScreen"],
    ["Trade","Outbound Shipments","Track outbound shipments (loading, departure, transit)","ShipmentsVault"],
    ["Trade","Container Compliance","Per-container compliance (VGM, seal, packing list)","ContainerComplianceScreen"],
    ["Trade","Milestone Tracking","Confirm outbound milestones (loaded, departed, arrived)","MilestoneScreen"],
    ["Trade","Documents","Trade document generation + upload","DocumentsScreen"],
    ["Trade","Distressed Cargo","List distressed cargo for liquidation","DistressedScreen"],
    ["Trade","Routes Reference","Worldwide port routes reference","RoutesReferenceScreen"],
    ["Trade","Lot Management","Lot-level inventory management (for export grading)","LotManagementPanel"],
    ["Trade","Demurrage","Demurrage tracking for outbound containers","DemurragePanel"],
    ["Trade","Cold Chain","Cold chain compliance for perishable exports","ColdChainPanel"],
    ["Finance","Financing (Borrower)","Request export financing (pre-shipment, post-shipment)","FinancingBorrowerScreen"],
    ["Finance","Invoices & SGTX Fee","Issue invoices + track SGTX fee (1.5%)","InvoicesScreen"],
    ["Finance","FX & Settlement","Multi-currency settlement + FX hedging (Add-On 14)","SettlementScreen"],
    ["Governance","Disputes","Respond to disputes + provide evidence","DisputesScreen"],
    ["Governance","Compliance & KYB","KYB status + compliance screenings","ComplianceScreen"],
    ["Governance","Audit Trail","Immutable event history","AuditScreen"],
    ["Governance","Network (Contacts)","Saved counterparty network","NetworkScreen"],
    ["Governance","Trust Passport","Tenant trust portrait + export credentials","PassportScreen"],
    ["Governance","Trade Readiness","Readiness score for export operations","ReadinessScreen"],
    ["Governance","Tenant Lifecycle","Onboarding + export licence tracking","LifecycleScreen"],
    ["Admin","Org Graph","Organisational graph","OrgGraphScreen"],
    ["Admin","GTID Chat","Cross-tenant messaging","ChatScreen"],
    ["Admin","Company Admin","Company settings + export licence management","CompanyAdminScreen"],
]
story.append(mt(seller_tabs,cw=[18*mm,35*mm,70*mm,40*mm]))
story.append(SP(3))
story.append(B("<b>Seller workflow (end-to-end):</b>"))
story.append(BU("<b>1. Receive request:</b> Buyer submits trade request → seller sees it in 'Pending Requests' + Smart Inbox notification."))
story.append(BU("<b>2. Build quote:</b> Click '1-Click Submit Quote' → quote builder → set EXW price + packing plan + commodity lines → submit → buyer notified + government notified."))
story.append(BU("<b>3. Negotiate:</b> If buyer counters → negotiation round created → respond with counter-offer or accept."))
story.append(BU("<b>4. Create SO:</b> After PO received from buyer → create matching Sales Order."))
story.append(BU("<b>5. Issue proforma:</b> Issue Proforma Invoice to buyer → buyer accepts → contract preparation begins."))
story.append(BU("<b>6. Sign contract:</b> Review + sign contract addenda → Governor locks contract → USTN minted."))
story.append(BU("<b>7. Prepare shipment:</b> Pack goods → load container → confirm VGM + seal → submit loading confirmation."))
story.append(BU("<b>8. Track outbound:</b> Monitor shipment departure + transit + arrival at destination."))
story.append(BU("<b>9. Receive payment:</b> Bank settles payment → seller notified → invoice marked paid."))
story.append(PageBreak())

# Portal 3-12 (condensed but still detailed)
portals_remaining=[
    ("20.3 LSP Portal — Full Workflow","lsp","Delta Freight & Forwarding (SGTX-EG-LSP-000120-4C7D)","Trucking & Forwarding","Export · Pickup · Trucking · Milestones",
     "1-Click Dispatch (→ dispatch-planner) | 1-Click Log Milestone (→ milestones)",
     [
        ["Overview","Command Center","Executive summary + active jobs + fleet status"],
        ["Operations","Assignments","Active truck/driver assignments"],
        ["Operations","Milestone Confirmation","Confirm pickup/departure/arrival/delivery milestones"],
        ["Operations","Addenda","Manage transport addenda (CMR, waybills)"],
        ["Operations","Fleet","Vehicle fleet management + maintenance"],
        ["Operations","Dispatch Planner","Plan + dispatch trucks to pickup/delivery jobs"],
        ["Operations","Warehouse","Warehouse dashboard + inventory"],
        ["Operations","Performance","LSP performance metrics (on-time %, SLA)"],
        ["Operations","Road Corridor","Road corridor management (Add-On: Road Engine)"],
        ["Operations","Rail","Rail booking management (Add-On: Rail Engine)"],
        ["Trade","Worldwide Routes","Worldwide port route search + sync"],
        ["Finance","Invoices","Invoice management + payment tracking"],
        ["Governance","Compliance","Vehicle/driver compliance + insurance"],
        ["Governance","Audit Trail","Event history"],
        ["Admin","Company Admin","Company settings"],
     ],
     "Receive assignment → Dispatch truck → Confirm pickup → Track transit → Confirm border crossing → Confirm delivery → Log milestone → Issue invoice"),
    ("20.4 Shipping Line Portal — Full Workflow","ship","Maersk Levant (SGTX-EG-SHP-000031-9E8F)","Ocean Carrier","Vessels · Containers · B/L · Schedules",
     "1-Click Issue B/L (→ bl) | 1-Click Authorize Release (→ containers)",
     [
        ["Overview","Command Center","Executive summary + vessel schedule + container status"],
        ["Operations","Vessels","Vessel fleet management"],
        ["Operations","Containers","Container inventory + release management"],
        ["Operations","B/L (Bill of Lading)","Issue + manage B/L and e-B/L"],
        ["Operations","Schedules & AIS","Vessel schedules + AIS tracking"],
        ["Operations","Booking Requests","Inbound booking requests from shippers"],
        ["Operations","Contract Rates","Manage contracted freight rates"],
        ["Operations","Air Cargo","Air cargo booking management (Air Engine)"],
        ["Operations","RoRo Cargo","RoRo shipment + unit + voyage management (RoRo Engine)"],
        ["Operations","Performance","Carrier performance metrics"],
        ["Trade","Worldwide Routes","Worldwide port route management"],
        ["Finance","Invoices","Freight invoice management"],
        ["Governance","Compliance","Vessel compliance + flag state"],
        ["Governance","Audit Trail","Event history"],
     ],
     "Receive booking → Assign vessel/voyage → Issue B/L → Track vessel (AIS) → Confirm arrival → Authorize container release → Issue freight invoice"),
    ("20.5 QC Portal — Full Workflow","qc","Nile Quality (SGTX-EG-QC-000022-8A1C)","Pre-shipment Inspection","Inspection · Quality · Certification",
     "1-Click Start Inspection (→ schedule) | 1-Click Issue Report (→ reports)",
     [
        ["Overview","Command Center","Executive summary + inspection queue"],
        ["Operations","Inspection Schedule","Schedule inspections + assign inspectors"],
        ["Operations","Field Inspections","Conduct field inspections + log defects + upload photos"],
        ["Operations","QC Reports","Issue QC reports + certificates"],
        ["Operations","Re-Inspections","Manage re-inspection requests"],
        ["Operations","Performance","Inspector performance metrics"],
        ["Trade","Container Compliance","Per-container QC compliance"],
        ["Finance","Invoices","QC fee invoicing"],
        ["Governance","Compliance","Inspector accreditation (Add-On 13)"],
        ["Governance","Audit Trail","Event history"],
     ],
     "Receive inspection request → Schedule inspection → Assign inspector → Conduct field inspection → Log defects + photos → Issue QC report → Notify parties"),
    ("20.6 Customs Broker Portal — Full Workflow","cbr","Pyramid Customs (SGTX-EG-CBR-000009-5E7B)","Clearance & Certification","Declarations · Clearance · EUR.1",
     "1-Click File Declaration (→ declarations) | 1-Click Clear Shipment (→ clearance)",
     [
        ["Overview","Command Center","Executive summary + declaration queue"],
        ["Operations","Declarations (Nafeza)","File + track customs declarations via Nafeza"],
        ["Operations","Clearance Status","Track clearance status + holds + releases"],
        ["Operations","Physical Document Jobs","Manage physical document handling + delivery"],
        ["Operations","Certificates","Issue EUR.1 + COO + other certificates"],
        ["Operations","Performance","Broker performance metrics (Add-On 10)"],
        ["Trade","Trade Certificates","Manage trade certificates"],
        ["Finance","Invoices","Broker fee invoicing"],
        ["Governance","Compliance","Broker licence + liability insurance (Add-On 10)"],
        ["Governance","Audit Trail","Event history"],
     ],
     "Receive declaration request → File declaration via Nafeza → Track clearance status → Respond to holds/queries → Confirm clearance → Issue certificates → Invoice"),
    ("20.7 Financier-Bank Portal — Full Workflow","bank","Commercial International Bank (SGTX-EG-BNK-000007-1F8D)","Trade Finance","LC · Guarantees · Settlement",
     "1-Click Submit Bid (→ opportunities) | 1-Click Disburse (→ portfolio)",
     [
        ["Overview","Command Center","Executive summary + active financing + liquidation alerts"],
        ["Operations","Opportunities","View financing requests + submit bids"],
        ["Operations","Portfolio","Active financing portfolio + repayment tracking"],
        ["Operations","Letters of Credit","LC management (issuance, confirmation, amendment)"],
        ["Operations","Collateral","Collateral management + margin calls"],
        ["Operations","Borrowers","Borrower directory + credit assessment"],
        ["Operations","Proof of Reserves","Reserve attestation (Add-On 7)"],
        ["Finance","Repayments","Repayment schedule + collection tracking"],
        ["Governance","Compliance","AML + sanctions + regulatory reporting"],
        ["Governance","Audit Trail","Event history"],
     ],
     "Receive financing request → Assess credit + collateral → Submit bid → Trader accepts → Disburse funds → Track repayment → Settle"),
    ("20.8 Financier-Private Portal — Full Workflow","pfi","Sovereign Capital (SGTX-EG-PFI-000011-3C2E)","Private Capital","Trade Finance · Private Capital",
     "1-Click Submit Offer (→ opportunities) | 1-Click Release Funds (→ portfolio)",
     [
        ["Overview","Command Center","Executive summary + active offers"],
        ["Operations","Opportunities","View financing requests + submit offers"],
        ["Operations","Portfolio","Active investment portfolio"],
        ["Operations","Collateral","Collateral management"],
        ["Operations","Borrowers","Borrower directory"],
        ["Finance","Repayments","Repayment tracking"],
        ["Governance","Compliance","Compliance + risk assessment"],
        ["Governance","Audit Trail","Event history"],
     ],
     "Receive financing request → Assess risk → Submit offer → Trader accepts → Release funds → Track repayment → Settle"),
    ("20.9 Government Portal — Full Workflow (24 Tabs)","gov","Egyptian Customs Authority (SGTX-EG-GOV-000001-9A0B)","Customs · CBE · NFSA","Regulatory Oversight · Trade Visibility",
     "1-Click Assess Declaration (→ customs) | 1-Click Reconcile FX (→ fx)",
     [
        ["Overview","01. Command Center","Regulatory oversight dashboard"],
        ["Oversight","02. National Trade Flow","National trade flow visualization"],
        ["Customs","03. Customs Assessment","Assess customs declarations"],
        ["Monetary","04. FX & Settlement (CBE)","Cross-border FX monitoring + reconciliation"],
        ["Oversight","05. Food Safety (NFSA)","Food safety alerts + NFSA oversight"],
        ["Platform","06. Integrations Health","External integrations health monitor"],
        ["Governance","07. Governor Decision","View Governor decisions + audit trail"],
        ["Governance","08. OPA Policies","View OPA policy registry"],
        ["Governance","09. Loom Verification","Verify Loom hash chain integrity"],
        ["Governance","10. Jurisdiction Matrix","Jurisdiction capability matrix (10+ jurisdictions)"],
        ["Governance","11. QES Layer (Egypt Trust)","Qualified Electronic Signature oversight"],
        ["Governance","12. Device Trust & Auth","Device trust + authentication audit"],
        ["Governance","13. Court Evidence","Evidence packages for court proceedings"],
        ["Governance","14. Compliance Screening","Compliance screening overview"],
        ["Governance","15. Suspicious Activity Reports","SAR overview + FIU interface"],
        ["Governance","16. USTN Master Object","USTN registry + master object view"],
        ["Governance","17. Role Journey Maps","User role journey documentation"],
        ["Governance","18. Audit Trail","Platform-wide audit trail"],
        ["Governance","19. Integration Control Center","Phase 8 integration catalog + gap control"],
        ["Governance","20. Transport & Logistics","Transport & logistics oversight"],
        ["Governance","21. Financial Execution","Financial execution oversight"],
        ["Governance","22. Post-Trade Completion","Post-trade completion oversight"],
        ["Governance","23. Regulatory Change Center","Regulatory change management (Add-On 28 GRiRE)"],
        ["Governance","24. Production Readiness","Production readiness report (INTEGRATION_REQUIRED)"],
        ["Governance","GRiRE Engine","GRiRE country profile + tariff + docs lookup"],
        ["Governance","Force Majeure","Force majeure event monitoring"],
        ["Governance","Compliance Calendar","Regulatory deadline calendar"],
        ["Governance","Regulatory Snapshots","Immutable per-trade regulatory snapshots"],
     ],
     "Monitor trade flow → Assess declarations → Reconcile FX → Monitor food safety → Review Governor decisions → Verify Loom → Respond to SARs → Oversee production readiness"),
    ("20.10 Platform Admin Portal — Full Workflow","admin","Platform Admin (SGTX-ZZ-ADM-000001-A1B2)","Platform Governance Authority","Sovereign · Governance · Audit",
     "1-Click Run Audit (→ audit) | 1-Check Integrations (→ integrations)",
     [
        ["Overview","Command Center","Platform-wide command center"],
        ["Monitoring","Metrics & Health","Platform metrics + health dashboard"],
        ["Security","Incidents","Incident management (SEV-0 through SEV-4)"],
        ["Security","Threat Findings","Security threat findings (Add-On 5)"],
        ["Governance","Multisig Approvals","Multisig approval queue (2-of-3 / 3-of-5)"],
        ["Platform","Add-on Library","Add-on activation/deactivation"],
        ["Platform","Add-Ons Hub (9-28)","Unified add-on hub with 19 sub-tabs"],
        ["Platform","Competitor Benchmark","SGTX vs competitors comparison"],
        ["Platform","Integrations","Integration health + management"],
        ["Monitoring","SLA & Status","SLA monitoring + platform status"],
        ["Governance","Governor Audit","Governor decision audit"],
     ],
     "Monitor platform health → Manage incidents → Review multisig queue → Activate/deactivate add-ons → Check integrations → Run Governor audit"),
    ("20.11 Marketplace Partner Portal — Full Workflow","marketplace-partner","Marketplace Partner (SGTX-ZZ-MKT-000001-C3D4)","External Platform · API Integration","Leads · Webhooks · Revenue",
     "1-Click View Leads (→ leads) | 1-Click Generate Key (→ api-keys)",
     [
        ["Overview","Command Center","Partner command center"],
        ["Operations","Leads Management","View + manage inbound leads"],
        ["Operations","Webhooks","Webhook configuration + logs"],
        ["Finance","Revenue","Revenue sharing dashboard"],
        ["Platform","API Keys","API key generation + management"],
        ["Platform","Sandbox","Sandbox environment for testing"],
        ["Legal","Agreement","Revenue share agreement"],
        ["Admin","Company Admin","Company settings"],
     ],
     "Receive leads → Manage webhooks → Track revenue → Generate API keys → Test in sandbox"),
    ("20.12 Laboratory Portal — Full Workflow","lab","Cairo Analytical (SGTX-EG-LAB-000014-6F4D)","Food & Pesticide Testing","Sampling · Testing · Certification",
     "1-Click Start Sampling (→ queue) | 1-Click Release Report (→ reports)",
     [
        ["Overview","Command Center","Lab command center + test queue"],
        ["Operations","Test Requests","Inbound test requests"],
        ["Operations","Queue","Sampling queue management"],
        ["Operations","Reports & Results","Publish test reports + certificates"],
        ["Operations","Certificates","Issue lab certificates"],
        ["Operations","Performance","Lab performance metrics"],
        ["Finance","Invoices","Lab fee invoicing"],
        ["Governance","Compliance","Lab accreditation + calibration"],
        ["Governance","Audit Trail","Event history"],
     ],
     "Receive test request → Schedule sampling → Collect sample → Conduct tests → Publish report → Issue certificate → Invoice"),
]

for title,pid,tenant,role,tagline,actions,tabs,workflow in portals_remaining:
    story.append(H(title,1))
    story.append(B(f"<b>Portal ID:</b> {pid} | <b>Tenant:</b> {tenant} | <b>Role:</b> {role} | <b>Tagline:</b> {tagline}"))
    story.append(B(f"<b>1-Click Actions:</b> {actions}"))
    story.append(B(f"<b>Tabs ({len(tabs)} total):</b>"))
    # Add header row
    tab_data=[["Group","Tab","Purpose"]]+tabs
    story.append(mt(tab_data,cw=[20*mm,40*mm,100*mm]))
    story.append(SP(3))
    story.append(B(f"<b>Workflow:</b> {workflow}"))
    story.append(PageBreak())

# ═══════════════════════════════════════════════════════════════════════════════
# PART VI — TRADE LIFECYCLE
# ═══════════════════════════════════════════════════════════════════════════════
story.append(H("PART VI — TRADE LIFECYCLE",0))
story.append(SP(5))

story.append(H("21. The 36-Stage End-to-End Trade Workflow (Art 129)",1))
story.append(B("[L1] The SGTX trade lifecycle consists of 36 stages, from initial intent through final USTN closure. Each stage has defined inputs, outputs, authority class, and portal touch-points. This is the canonical trade lifecycle — every trade on the platform follows this sequence."))
lifecycle=[
    ["#","Stage","Authority","Portal","Status"],
    ["1","INTENT — Trade Intent","Assertion (Buyer)","Buyer","WORKING"],
    ["2","COUNTERPARTY — Known Counterparty","Assertion (Buyer)","Buyer","WORKING"],
    ["3","RFQ — Request for Quote","Assertion (Buyer)","Buyer","WORKING"],
    ["4","QUOTE — Quote Submitted","Assertion (Seller)","Seller","WORKING"],
    ["5","NEGOTIATION — Negotiation","Assertion (Party)","Buyer/Seller","WORKING"],
    ["6","PO/SO — Purchase/Sales Order","Assertion (Buyer→Seller)","Buyer/Seller","WORKING"],
    ["7","PROFORMA — Proforma Invoice","Assertion (Seller)","Seller","WORKING"],
    ["8","CONTRACT — Contract Locked","Confirmation (Governor)","Buyer/Seller","WORKING"],
    ["9","REG_SNAPSHOT — Regulatory Snapshot","Observation (System)","Gov","WORKING"],
    ["10","CLASSIFICATION — Product Classification","Assertion (System A2)","Buyer","WORKING"],
    ["11","ORIGIN — Origin Determination","Assertion (System)","Buyer","WORKING"],
    ["12","FTA — FTA Preference","Observation (System)","Buyer","WORKING"],
    ["13","LICENSE — License Check","Observation (System)","Buyer/Seller","WORKING"],
    ["14","PERMIT — Permit Check","Observation (System)","Buyer/Seller","WORKING"],
    ["15","CERTIFICATE — Certificate Check","Observation (System)","CBR","WORKING"],
    ["16","INSURANCE — Insurance Issued","Assertion (Insurer)","Buyer","WORKING"],
    ["17","PACKING — Packing Complete","Assertion (Seller)","Seller","WORKING"],
    ["18","TRANSPORT — Transport Configured","Assertion (Shipper)","Buyer/Seller","WORKING"],
    ["19","BOOKING — Booking Confirmed","Assertion (Carrier)","LSP/Ship","WORKING"],
    ["20","EXPORT_CUSTOMS — Export Customs","Assertion (Broker)","CBR","WORKING"],
    ["21","SECURITY — Security Screening","Observation (System)","Ship","WORKING"],
    ["22","EXECUTION — Physical Execution","Observation (System)","LSP/Ship","WORKING"],
    ["23","TRANSIT — In Transit","Observation (Carrier)","All","WORKING"],
    ["24","IMPORT_CUSTOMS — Import Customs","Assertion (Broker)","CBR","WORKING"],
    ["25","DUTY/TAX — Duty & Tax Paid","Confirmation (Bank)","Buyer","WORKING"],
    ["26","INSPECTION — Inspection Complete","Assertion (QC/Lab)","QC/Lab","WORKING"],
    ["27","RELEASE — Customs Release","Confirmation (Authority)","Gov","WORKING"],
    ["28","DELIVERY — Delivery Confirmed","Observation (Carrier)","Buyer","WORKING"],
    ["29","ACCEPTANCE — Delivery Accepted","Assertion (Receiver)","Buyer","WORKING"],
    ["30","SETTLEMENT — Settlement Complete","Confirmation (Bank)","Buyer/Seller","WORKING"],
    ["31","RECONCILIATION — Bank Reconciliation","Confirmation (Bank)","Bank","WORKING"],
    ["32","ACCOUNTING — Accounting Complete","Assertion (System)","Admin","WORKING"],
    ["33","CLAIMS — Claims/Warranty Window","Observation (System)","Buyer/Seller","WORKING"],
    ["34","POST_CLEARANCE — Post-Clearance","Observation (System)","Gov","WORKING"],
    ["35","EVIDENCE — Evidence Sealed","Confirmation (Governor)","Admin","WORKING"],
    ["36","USTN_CLOSED — USTN Closed","Confirmation (Governor)","All","WORKING"],
]
story.append(mt(lifecycle,cw=[6*mm,40*mm,30*mm,25*mm,25*mm]))
story.append(SP(3))
story.append(B("[L1] <b>Automated stage triggers:</b> The following stages are automatically triggered by the platform:"))
story.append(BU("<b>Stages 1-3 (INTENT, COUNTERPARTY, RFQ):</b> Automatically logged when buyer submits trade request."))
story.append(BU("<b>Stage 4 (QUOTE):</b> Automatically logged when seller submits quote."))
story.append(BU("<b>Stage 8 (CONTRACT):</b> Automatically logged when contract is locked + USTN minted."))
story.append(BU("<b>Stage 9 (REG_SNAPSHOT):</b> Automatically captured when contract is locked (regulatory snapshot with SHA-256 hash)."))
story.append(BU("<b>Stages 10-18:</b> Automatically evaluated during contract lock (classification, origin, FTA, license, permit, certificate, insurance, packing, transport)."))
story.append(BU("<b>Stage 35 (EVIDENCE):</b> Automatically assembled when all 7 closure conditions are met."))
story.append(BU("<b>Stage 36 (USTN_CLOSED):</b> Automatically set when evidence is sealed + multisig approval."))
story.append(PageBreak())

# Trade flows
story.append(H("22. Trade Initiation Flow (Buyer→Seller)",1))
story.append(B("[L1] The trade initiation flow describes what happens when a buyer submits a trade request:"))
story.append(BU("<b>Step 1:</b> Buyer clicks '1-Click New Trade' on the Buyer Command Center."))
story.append(BU("<b>Step 2:</b> 11-step wizard opens. Buyer fills: seller, incoterm, commodity, HS code, containers, documentation, transport, insurance, settlement, criticality, shipments."))
story.append(BU("<b>Step 3:</b> Governor pre-screens the trade (G1-G7 gates)."))
story.append(BU("<b>Step 4:</b> Compliance screening (sanctions, KYB) runs synchronously."))
story.append(BU("<b>Step 5:</b> Trade is created with status PENDING_SELLER_RESPONSE + temporary USTN (SGTX-PEND-...)."))
story.append(BU("<b>Step 6:</b> Seller receives Smart Inbox notification (priority 75, 'New trade request')."))
story.append(BU("<b>Step 7:</b> Buyer receives confirmation inbox item (priority 70, 'Trade request initiated')."))
story.append(BU("<b>Step 8:</b> Government receives REGULATORY_OVERSIGHT inbox item (priority 60, 'New trade initiated')."))
story.append(BU("<b>Step 9:</b> Brain event 'trade.created' published to 38+ downstream subscribers."))
story.append(BU("<b>Step 10:</b> Trade Stage Log records: INTENT, COUNTERPARTY, RFQ stages completed."))
story.append(BU("<b>Step 11:</b> Contacts auto-saved to both parties' networks (relationship-controlled, not marketplace)."))
story.append(SP(5))

story.append(H("23. Quote & Negotiation Flow",1))
story.append(B("[L1] The quote and negotiation flow describes what happens when a seller submits a quote:"))
story.append(BU("<b>Step 1:</b> Seller clicks '1-Click Submit Quote' on the Seller Command Center."))
story.append(BU("<b>Step 2:</b> Quote builder opens. Seller sets: EXW price, packing plan, commodity line items, SGTX fee (1.5%)."))
story.append(BU("<b>Step 3:</b> Governor evaluates the quote (transactional — all mutations in db.$transaction)."))
story.append(BU("<b>Step 4:</b> Trade status updated to QUOTED (atomically with inbox creation)."))
story.append(BU("<b>Step 5:</b> Buyer receives Smart Inbox notification (priority 75, 'Quote received')."))
story.append(BU("<b>Step 6:</b> Government receives REGULATORY_OVERSIGHT inbox item (priority 55, 'Quote submitted')."))
story.append(BU("<b>Step 7:</b> Brain event 'trade.quote.submitted' published."))
story.append(BU("<b>Step 8:</b> Trade Stage Log records: QUOTE stage completed."))
story.append(BU("<b>Step 9:</b> If buyer counters → negotiation round created → NEGOTIATION stage logged."))
story.append(BU("<b>Step 10:</b> If buyer accepts → PO/SO creation begins → PO/SO stage logged."))
story.append(SP(5))

story.append(H("24. Contract Lock & USTN Minting",1))
story.append(B("[L1] The contract lock flow is the most critical stage — it mints the USTN and captures the regulatory snapshot:"))
story.append(BU("<b>Step 1:</b> Both parties sign the contract + addenda."))
story.append(BU("<b>Step 2:</b> Governor verifies 4 lock conditions: (a) buyer signed, (b) seller signed, (c) fee locked, (d) release acknowledged."))
story.append(BU("<b>Step 3:</b> USTN is minted: SGTX-{BUYER6}-{SELLER6}-{YYYYMMDDHHMMSS}-{RAND8}."))
story.append(BU("<b>Step 4:</b> Trade status updated to CONTRACT_SIGNED, phase set to 3."))
story.append(BU("<b>Step 5:</b> All shipments updated with the minted USTN."))
story.append(BU("<b>Step 6:</b> Regulatory Snapshot captured: origin/destination/HS/tariff/sanctions/FTA/licenses/permits/certificates → SHA-256 hash computed → stored immutably."))
story.append(BU("<b>Step 7:</b> Trade Stage Log records: CONTRACT + REG_SNAPSHOT stages completed."))
story.append(BU("<b>Step 8:</b> Both parties notified (priority 75, 'Contract locked')."))
story.append(BU("<b>Step 9:</b> Timeline event created (phase 3 complete)."))
story.append(SP(5))

story.append(H("25. Settlement & Closure Flow",1))
story.append(B("[L1] The settlement and closure flow is the final stage of the trade lifecycle:"))
story.append(BU("<b>Step 1:</b> Delivery accepted by receiver (POD signed) → condition 1 met."))
story.append(BU("<b>Step 2:</b> All payment legs settled (bank confirms) → condition 2 met."))
story.append(BU("<b>Step 3:</b> Bank reconciliation matches SGTX records → condition 3 met."))
story.append(BU("<b>Step 4:</b> Customs complete (import + export cleared) → condition 4 met."))
story.append(BU("<b>Step 5:</b> Post-clearance complete (audit or 'no audit required') → condition 5 met."))
story.append(BU("<b>Step 6:</b> All disputes resolved or time-barred → condition 6 met."))
story.append(BU("<b>Step 7:</b> Evidence package assembled (26 categories) + SHA-256 hash + sealed → condition 7 met."))
story.append(BU("<b>Step 8:</b> canClose predicate returns true (all 7 conditions met)."))
story.append(BU("<b>Step 9:</b> Multisig approval (2-of-3) for USTN closure."))
story.append(BU("<b>Step 10:</b> USTN marked CLOSED → evidence sealed → post-closure observation begins (90 days)."))
story.append(BU("<b>Step 11:</b> Trade Stage Log records: EVIDENCE + USTN_CLOSED stages completed."))
story.append(BU("<b>Step 12:</b> All parties notified (priority 80, 'USTN closed')."))
story.append(PageBreak())

# ═══════════════════════════════════════════════════════════════════════════════
# PART VII — APPENDICES
# ═══════════════════════════════════════════════════════════════════════════════
story.append(H("PART VII — APPENDICES",0))
story.append(SP(5))

# Appendix A
story.append(H("Appendix A — Financial Control Framework (CFO)",1))
story.append(H("A.1 Fee Schedule",2))
story.append(B("[L2] <b>SGTX Platform Fee:</b> 1.5% of trade value, collected at settlement via the bank (non-custodial). The fee is locked at trade initiation (FeeLock) and collected by the bank during settlement — SGTX never receives the fee directly."))
story.append(B("[L2] <b>Optional service fees:</b> QC inspection (buyer-requested), lab tests (buyer-requested), customs broker services, logistics RFQ fees. These are quoted by the service provider and accepted by the trader; SGTX does not set these prices (non-marketplace principle)."))
story.append(H("A.2 Reserve Policy",2))
story.append(B("[L0-17] <b>110% reserve rule:</b> If reserve metadata is maintained, it must be at least 110% backed. The constitutional layer sets the threshold; ZK attestation (Add-On 7) provides cryptographic evidence."))
story.append(B("[L2] <b>Composition:</b> Reserves may consist of cash, bank guarantees, government bonds, or other approved instruments. The composition is jurisdiction-aware."))
story.append(H("A.3 Non-Custody Attestation Template",2))
story.append(B("'SGTX Platform does not hold, receive, or transfer customer funds at any point in the trade lifecycle. All funds flow through connected banks and regulated payment service providers. SGTX orchestrates payment instructions but never becomes the settlement authority. The FeeLock mechanism locks the platform fee at trade initiation, but the fee is collected by the bank during settlement.'"))
story.append(H("A.4 Unit Economics",2))
story.append(B("[L2] <b>Revenue:</b> 1.5% fee × trade volume. Example: $100,000 trade = $1,500 SGTX fee."))
story.append(B("[L2] <b>Cost structure:</b> Infrastructure (Turso, Vercel, AI providers), personnel, compliance, legal. Variable cost per trade: ~$2-5 (AI inference + DB + API). Contribution margin: ~97% at scale."))
story.append(PageBreak())

# Appendix B
story.append(H("Appendix B — Regulatory & Legal",1))
story.append(H("B.1 Regulatory Classification Matrix (Egypt)",2))
reg=[
    ["Functionality","Egypt Classification","Required Licence","Status"],
    ["Trade orchestration","Service provider","None (non-regulated)","OPERATIONAL"],
    ["Payment instruction","Payment service provider","CBE registration (if applicable)","LEGAL_AUTHORIZATION_REQUIRED"],
    ["Customs declaration","Customs broker facilitation","Broker licence (broker-side)","OPERATIONAL"],
    ["Document issuance","Digital document service","ETA/CargoX integration","CORE_READY"],
    ["Settlement orchestration","Non-custodial orchestration","Bank partnership","LEGAL_AUTHORIZATION_REQUIRED"],
    ["AI advisory","AI service provider","None (advisory only)","OPERATIONAL"],
]
story.append(mt(reg,cw=[40*mm,40*mm,45*mm,35*mm]))
story.append(H("B.2 Data-Residency Element Classification",2))
story.append(B("[L2] EGYPT_ONLY (must stay in Egypt), COUNTRY_ONLY, REGIONAL, APPROVED_CROSS_BORDER, GLOBAL_ALLOWED. Strictest applicable rule wins."))
story.append(H("B.3 SAR/FIU Interface Notes",2))
story.append(B("[L2] SGTX provides structured evidence packages for SAR filing. The platform does not file SARs directly (bank's responsibility). Add-On 17 and Add-On 7 support the evidence chain."))
story.append(PageBreak())

# Appendix C
story.append(H("Appendix C — Operating Model",1))
story.append(H("C.1 Platform Governance Authority RACI",2))
raci=[
    ["Decision","Responsible","Accountable","Consulted","Informed"],
    ["Constitutional amendment","Governance Authority","Signatories (3-of-5)","Legal, Compliance, Eng","All"],
    ["Policy update (OPA)","Policy Team","Governance Authority","Eng, Compliance","Operations"],
    ["WASM module update","Engineering","CTO","Security, Governance","Operations"],
    ["Integration activation","Integration Team","CTO","Legal, Compliance","Operations"],
    ["Incident (SEV-0)","On-call Engineer","CTO","Security, Legal, Comms","Board"],
    ["Incident (SEV-1)","On-call Engineer","Eng Lead","Security","Operations"],
]
story.append(mt(raci,cw=[35*mm,30*mm,35*mm,35*mm,25*mm]))
story.append(H("C.2 Multisig Policy",2))
story.append(B("[L2] <b>Standard:</b> 2-of-3 for trade-level irreversible actions (USTN closure, contract lock, settlement release). <b>Constitutional:</b> 3-of-5 for platform-level changes. QES required."))
story.append(H("C.3 Change-Management Process",2))
story.append(B("[L2] 4-stage: Author → Review (security + legal) → Approve (multisig 3-of-5) → Deploy (staged: sandbox → production). Each stage Loom-logged."))
story.append(H("C.4 Incident Severity Model",2))
sev=[
    ["Severity","Definition","Response","Escalation"],
    ["SEV-0","Platform-wide outage / data breach","Immediate (24/7)","CTO + Legal + Comms + Board"],
    ["SEV-1","Major feature failure (multiple trades)","1 hour","Eng Lead + CTO"],
    ["SEV-2","Feature failure (single trade/tenant)","4 hours","On-call Engineer"],
    ["SEV-3","Minor bug with workaround","24 hours","Assigned Engineer"],
    ["SEV-4","Cosmetic / enhancement","Next sprint","Product Backlog"],
]
story.append(mt(sev,cw=[15*mm,55*mm,25*mm,55*mm]))
story.append(PageBreak())

# Appendix D
story.append(H("Appendix D — Implementation Priority Framework",1))
story.append(B("[L2] P0–P4 waves are dependency-driven, not calendar-driven. No contractual calendar claims."))
waves=[
    ["Wave","Scope","Dependencies","Status"],
    ["P0 — Core Trade Execution","Trade, Contract, USTN, Governor, Event Spine, State Vector, Closure Policy","None (foundation)","CORE_READY"],
    ["P1 — Transport Engines","Road, Air, Ocean Container, RoRo, Rail, Multimodal Orchestrator","P0 complete","CORE_READY"],
    ["P2 — Intelligence & Compliance (Add-Ons 1-8)","GNN, Federated Learning, Causal, Self-Healing, Pentest, PQC, ZK, Customs Bond","P0 complete","CORE_READY"],
    ["P3 — Operational Add-Ons (9-18)","Demurrage, Broker Liability, Valuation, Cold Chain, Inspection, Currency, Sandbox, FTA, Security, Calendar","P0 + GRiRE","CORE_READY"],
    ["P4 — Extended (19-28)","Cargo Insurance, Trade Finance, Back-to-Back LC, Force Majeure, Export Docs, Port/Terminal, Payment Guarantee, Demurrage Dispute, GRiRE","P0 + P2","CORE_READY"],
]
story.append(mt(waves,cw=[45*mm,55*mm,40*mm,25*mm]))
story.append(PageBreak())

# Appendix E
story.append(H("Appendix E — Full Historical Audit Trail (Immutable Annex)",1))
story.append(B("This annex preserves the full audit trail from v13.1 Part A (findings A-01 through A-24). Nothing has been removed. The audit findings are the governing resolutions for all v14.0 architecture."))
audit=[
    ["Finding","Conflict","Resolution (Governing)"],
    ["A-01","Direct Government API Scope","Four Egypt connectors are initial reference; worldwide adapter fabric is extensibility layer."],
    ["A-02","AI A4 Authority Language","A4 is deterministic policy automation; AI never has independent execution authority."],
    ["A-03","Non-Custody vs Payment","Non-custody is architectural; Bank Settlement Gateway orchestrates but never holds funds."],
    ["A-04","Stablecoin/DeFi vs Bank Settlement","DeFi is conditional sub-rail; bank-authoritative settlement is canonical."],
    ["A-05","Reserve Metadata vs Custody","Reserve tables store attestations only; do not create custody."],
    ["A-06","Reserve Ratio Thresholds","110% rule is constitutional; ZK attestation provides evidence."],
    ["A-07","GNN Non-Marketplace","Trust graph for known parties; never discovers/recommends/ranks."],
    ["A-08","Seven vs Twenty-Eight Add-Ons","Full 28-add-on catalogue is canonical; original seven are historical reference."],
    ["A-09","RoRo as First-Class","RoRo is first-class transport mode, not ocean sub-mode."],
    ["A-10","Egypt Nafeza Mode-Specific","Mode-specific applicability; not one generic maritime workflow."],
    ["A-11","Closure Semantics","7-condition closure; CLOSED_WITH_EXCEPTION for severity ≤2 only."],
    ["A-12","USTN as Namespace","Universal reference; does not override external authorities."],
    ["A-13","ISO 20022 as Output","Integration output format, not canonical data."],
    ["A-14","Egypt Data Localisation","EGYPT_ONLY for specific elements; strictest rule wins."],
    ["A-15","Zero-Cost Clarified","Institutional-cost scope: data free; institutional costs real."],
    ["A-16","Marketplace Terminology","Relationship-controlled orchestration, NOT marketplace."],
    ["A-17","AI Explanations vs Decisions","AI generates explanations; Governor makes authoritative decisions."],
    ["A-18","Manual Fallback","Governed: authenticated, attributable, timestamped, Loom-logged."],
    ["A-19","Global Readiness Claims","Use CORE_READY/PRODUCTION_CONNECTED; never WORLDWIDE_INTEGRATED."],
    ["A-20","Command vs Event","Command (intent) ≠ Event (fact); Commands to Governor, Events to Spine."],
    ["A-21","Recovery vs Rollback","Recovery restores state; never erases history. Loom immutable."],
    ["A-22","Proof-of-Reserves Wallet Examples","Verification-only; consistent with non-custody."],
    ["A-23","Jurisdiction Examples","Illustrative configuration governed by active jurisdiction profile."],
    ["A-24","Incomplete Change-Set","Add-Ons 9-28 and Final Summary now fully integrated."],
]
story.append(mt(audit,cw=[12*mm,45*mm,113*mm]))
story.append(PageBreak())

# Appendix F
story.append(H("Appendix F — Source Manifest & SHA-256 Hashes",1))
sources=[
    ["Source","Type","Lines","SHA-256"],
    ["SGTX_PLATFORM_MASTER_BLUEPRINT_INTEGRATED_v12.0.docx","Main Blueprint","~76,122","c263f527f3966dab01d3cffc87e7d2747d01c017ca7a786d1964f09018087d42"],
    ["sgtx add ons and modifications.rtf","Change-Set","~7,582","87181d220df82a485485eec4b9896031910c79afa6332516ef2afac4682c5b72"],
    ["SGTX_v13.1_FINAL.docx","Integrated Edition","~47,216","(computed from extracted text)"],
]
story.append(mt(sources,cw=[60*mm,30*mm,20*mm,60*mm]))
story.append(PageBreak())

# Appendix G
story.append(H("Appendix G — Change Log v13.1 → v14.0",1))
cl=[
    ["Change","Rationale"],
    ["Three-layer separation (L0/L1/L2)","Separate immutable principles from mutable architecture from testable specs"],
    ["Over-claim elimination","'production-ready' → CORE_READY; 'complete' → 'specified'; 'zero-cost' → 'institutional-cost scope'"],
    ["28-add-on status matrix","Explicit deployment-state vocabulary for every add-on"],
    ["4-dimension external readiness","TECHNICAL/LEGAL/OPERATIONAL/COMMERCIAL reported independently"],
    ["Command/Event taxonomy formalized","Command (intent) ≠ Event (fact) — enforced in API contract"],
    ["32-point constitution","All 32 constitutional points listed explicitly with [L0] tags"],
    ["Audit trail preserved as annex","A-01 through A-24 preserved as governing resolutions"],
    ["RTO/RPO with quorum definitions","Explicit durability/quorum requirements per tier"],
    ["No calendar claims","P0–P4 waves are dependency-driven, not date-driven"],
    ["Full portal documentation (12 portals)","Each portal's tabs, screens, workflows documented in full"],
    ["36-stage trade lifecycle","All 36 stages with authority class, portal, status documented"],
    ["Automated stage triggers","Stages 1-3, 4, 8-9, 35-36 auto-triggered by platform"],
    ["Quote model","Dedicated Quote Prisma model (replaces JSON-in-Trade.globalNotes)"],
    ["Multi-model AI consensus","3 providers (Gemini+Groq+HuggingFace) with weighted voting"],
    ["Smart Inbox Priority","AI-computed priority: basePriority×0.4 + tradeValue×0.3 + urgency×0.2 + criticality×0.1"],
    ["Evidence Package download","26-category JSON evidence package at USTN closure"],
    ["Trade Cost Calculator","True Landed Cost (18 components per Art 24)"],
    ["Regulatory Pre-Check","Pre-submit sanctions+FTA+docs+duty+cold chain check"],
    ["Competitor Benchmark","SGTX vs TradeLens/Maersk Spot/Flexport/CargoX comparison"],
    ["SSE Realtime Notifications","Server-Sent Events for live inbox + trade updates"],
    ["1-Click Action Bar","Every portal dashboard has 1-Click Trade + 1-Click Payment buttons"],
    ["1-Click Close USTN","7-condition checklist + closure ceremony on buyer/gov portals"],
    ["Trade Lifecycle Visualizer","36-stage progress bar on every Command Center"],
]
story.append(mt(cl,cw=[60*mm,110*mm]))
story.append(PageBreak())

# Appendix H
story.append(H("Appendix H — Dependency Graph of Major Components",1))
story.append(B("[L1] The following dependency graph shows how major SGTX components relate to each other:"))
story.append(SP(3))
story.append(B("<b>Layer 0 (Constitution) → Layer 1 (Architecture) → Layer 2 (Implementation)</b>"))
story.append(SP(3))
story.append(B("<b>Governor Pipeline:</b> Governor → OPA → WasmEdge → Loom"))
story.append(BU("Governor receives Commands from all components"))
story.append(BU("OPA evaluates policies (sidecar)"))
story.append(BU("WasmEdge executes constitutional rules (deterministic)"))
story.append(BU("Loom logs all decisions (hash-chained, immutable)"))
story.append(SP(3))
story.append(B("<b>Event Flow:</b> Command → Governor → Event Spine → State Vector → Transaction Twin → Closure Policy"))
story.append(BU("Command enters Governor pipeline"))
story.append(BU("If ALLOW, Event appended to Event Spine (hash-chained)"))
story.append(BU("Event updates State Vector (12 domain clocks)"))
story.append(BU("Transaction Twin mirrors state for post-closure observation"))
story.append(BU("Closure Policy evaluates 7 conditions for USTN closure"))
story.append(SP(3))
story.append(B("<b>Settlement Flow:</b> Settlement Orchestration → Bank Settlement Gateway → Bank → Payment Settled Event"))
story.append(BU("Settlement Orchestration creates multi-leg instructions"))
story.append(BU("Bank Settlement Gateway validates (6-stage pipeline)"))
story.append(BU("Bank executes settlement (non-custodial — SGTX never holds funds)"))
story.append(BU("Bank emits Payment Settled Event → Event Spine"))
story.append(SP(3))
story.append(B("<b>Transport Flow:</b> Multimodal Orchestrator → Road/Air/Ocean/RoRo/Rail Engines → Terminal Adapters"))
story.append(BU("Multimodal Orchestrator coordinates cross-mode handoffs"))
story.append(BU("Each mode engine owns mode-specific rules"))
story.append(BU("Terminal adapters interface with port/airport/border systems"))
story.append(SP(3))
story.append(B("<b>AI Flow:</b> AI Subsystem (A1-A3) → Governor → A4 Execution → Event Spine"))
story.append(BU("AI produces recommendation (A1 advisory, A2 constraining, A3 escalation)"))
story.append(BU("Recommendation submitted to Governor as Command"))
story.append(BU("Governor evaluates (G1-G7, OPA, WasmEdge)"))
story.append(BU("If ALLOW, A4 executes deterministically (NOT AI autonomy)"))
story.append(BU("Event appended to Spine + decision logged to Loom"))

# ═══════════════════════════════════════════════════════════════════════════════
# BUILD PDF
# ═══════════════════════════════════════════════════════════════════════════════
output="/home/z/my-project/SGTX_v14.0_CLEAN_MASTER_FULL.pdf"
doc=SimpleDocTemplate(output,pagesize=A4,leftMargin=20*mm,rightMargin=20*mm,topMargin=25*mm,bottomMargin=20*mm,
    title="SGTX Platform Master Blueprint — Clean Master Edition v14.0 (Full)",
    author="SGTX Master Blueprint Integration Engine",
    subject="Sovereign Governed Trade Execution Infrastructure — Fully Expanded",
    creator="SGTX Platform")
fc=Frame(0,0,A4[0],A4[1],leftPadding=0,rightPadding=0,topPadding=0,bottomPadding=0,id='cover')
fb=Frame(20*mm,20*mm,170*mm,257*mm,leftPadding=0,rightPadding=0,topPadding=0,bottomPadding=0,id='body')
doc.addPageTemplates([
    PageTemplate(id='CoverPage',frames=fc,onPage=cover),
    PageTemplate(id='BodyPage',frames=fb,onPage=hf),
])
# Set first template to CoverPage
from reportlab.platypus.doctemplate import NextPageTemplate
# Prepend cover page template
story_with_cover = [NextPageTemplate('CoverPage'), PageBreak()] + [NextPageTemplate('BodyPage')] + story
doc.build(story_with_cover)
print(f"✓ PDF generated: {output}")
print(f"  Size: {os.path.getsize(output)/1024:.1f} KB")
