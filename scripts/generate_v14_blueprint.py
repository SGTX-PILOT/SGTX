#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
SGTX Platform Master Blueprint — Clean Master Edition v14.0
Generated via ReportLab. Professional institutional document.
"""
import os, sys, hashlib
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm, cm
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_JUSTIFY
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, PageBreak, Table, TableStyle,
    KeepTogether, Image, Flowable, NextPageTemplate, PageTemplate, Frame
)
from reportlab.platypus.tableofcontents import TableOfContents
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

# ═══════════════════════════════════════════════════════════════════════════════
# PALETTE (cascade-generated)
# ═══════════════════════════════════════════════════════════════════════════════
PAGE_BG       = colors.HexColor('#ffffff')
SECTION_BG    = colors.HexColor('#f5f4f0')
CARD_BG       = colors.HexColor('#eeedec')
TABLE_STRIPE  = colors.HexColor('#f5f4f0')
HEADER_FILL   = colors.HexColor('#3a3620')
COVER_BLOCK   = colors.HexColor('#1a1810')
BORDER        = colors.HexColor('#cfcbbf')
ICON          = colors.HexColor('#736740')
ACCENT        = colors.HexColor('#96771b')  # Sovereign gold
ACCENT_2      = colors.HexColor('#5734c1')
TEXT_PRIMARY   = colors.HexColor('#1c1b19')
TEXT_MUTED     = colors.HexColor('#6c6962')
SEM_SUCCESS   = colors.HexColor('#4b855e')
SEM_WARNING   = colors.HexColor('#9c7e42')
SEM_ERROR     = colors.HexColor('#a64b43')
SEM_INFO      = colors.HexColor('#517395')

# ═══════════════════════════════════════════════════════════════════════════════
# STYLES
# ═══════════════════════════════════════════════════════════════════════════════
styles = getSampleStyleSheet()

styleTitle = ParagraphStyle('CustomTitle', parent=styles['Title'], fontName='Helvetica-Bold',
    fontSize=28, leading=34, textColor=ACCENT, alignment=TA_CENTER, spaceAfter=6*mm)
styleSubtitle = ParagraphStyle('Subtitle', parent=styles['Normal'], fontName='Helvetica',
    fontSize=14, leading=18, textColor=TEXT_MUTED, alignment=TA_CENTER, spaceAfter=4*mm)
styleTagline = ParagraphStyle('Tagline', parent=styles['Normal'], fontName='Helvetica-Oblique',
    fontSize=11, leading=14, textColor=ACCENT, alignment=TA_CENTER, spaceAfter=20*mm)
styleH1 = ParagraphStyle('H1', parent=styles['Heading1'], fontName='Helvetica-Bold',
    fontSize=18, leading=22, textColor=HEADER_FILL, spaceBefore=10*mm, spaceAfter=5*mm,
    borderWidth=0, borderPadding=0)
styleH2 = ParagraphStyle('H2', parent=styles['Heading2'], fontName='Helvetica-Bold',
    fontSize=14, leading=18, textColor=ACCENT, spaceBefore=8*mm, spaceAfter=3*mm)
styleH3 = ParagraphStyle('H3', parent=styles['Heading3'], fontName='Helvetica-Bold',
    fontSize=12, leading=15, textColor=TEXT_PRIMARY, spaceBefore=6*mm, spaceAfter=2*mm)
styleBody = ParagraphStyle('Body', parent=styles['Normal'], fontName='Helvetica',
    fontSize=10, leading=14, textColor=TEXT_PRIMARY, alignment=TA_JUSTIFY, spaceAfter=3*mm)
styleBodyMuted = ParagraphStyle('BodyMuted', parent=styleBody, textColor=TEXT_MUTED, fontSize=9)
styleLayer = ParagraphStyle('Layer', parent=styleBody, fontName='Helvetica-Bold',
    fontSize=11, textColor=ACCENT, leftIndent=10*mm, spaceBefore=5*mm, spaceAfter=3*mm)
styleConstitution = ParagraphStyle('Constitution', parent=styleBody, fontSize=10,
    leading=14, textColor=TEXT_PRIMARY, leftIndent=8*mm, spaceAfter=2*mm,
    bulletIndent=5*mm)
styleTableCell = ParagraphStyle('TableCell', parent=styles['Normal'], fontName='Helvetica',
    fontSize=8, leading=11, textColor=TEXT_PRIMARY)
styleTableHeader = ParagraphStyle('TableHeader', parent=styles['Normal'], fontName='Helvetica-Bold',
    fontSize=8, leading=11, textColor=colors.white)
styleFooter = ParagraphStyle('Footer', parent=styles['Normal'], fontName='Helvetica',
    fontSize=8, leading=10, textColor=TEXT_MUTED, alignment=TA_CENTER)
styleNote = ParagraphStyle('Note', parent=styleBody, fontSize=9, leading=12,
    textColor=TEXT_MUTED, leftIndent=5*mm, spaceAfter=2*mm,
    borderColor=BORDER, borderWidth=0.5, borderPadding=4, backColor=CARD_BG)
styleCode = ParagraphStyle('Code', parent=styles['Code'], fontName='Courier',
    fontSize=8, leading=11, textColor=TEXT_PRIMARY, backColor=CARD_BG,
    leftIndent=5*mm, spaceAfter=3*mm)

# ═══════════════════════════════════════════════════════════════════════════════
# TocDocTemplate with header/footer
# ═══════════════════════════════════════════════════════════════════════════════
class TocDocTemplate(SimpleDocTemplate):
    pass
    def afterFlowable(self, flowable):
        if hasattr(flowable, 'bookmark_name'):
            key = flowable.bookmark_name
            self.canv.bookmarkPage(key)
            self.notify("TOCEntry", (int(flowable.bookmark_level), flowable.bookmark_text, key))

def header_footer(canvas, doc):
    canvas.saveState()
    # Header
    canvas.setFont('Helvetica', 8)
    canvas.setFillColor(TEXT_MUTED)
    canvas.drawString(20*mm, 287*mm, "SGTX Platform Master Blueprint — v14.0 Clean Master Edition")
    canvas.drawRightString(190*mm, 287*mm, "Classification: Internal Technical Master Specification")
    canvas.setStrokeColor(BORDER)
    canvas.setLineWidth(0.5)
    canvas.line(20*mm, 285*mm, 190*mm, 285*mm)
    # Footer
    canvas.setFont('Helvetica', 8)
    canvas.setFillColor(TEXT_MUTED)
    canvas.drawString(20*mm, 12*mm, "SGTX — Sovereign Governed Trade Execution")
    canvas.drawRightString(190*mm, 12*mm, f"Page {doc.page}")
    canvas.line(20*mm, 14*mm, 190*mm, 14*mm)
    canvas.restoreState()

def cover_page(canvas, doc):
    canvas.saveState()
    # Full-page dark background
    canvas.setFillColor(COVER_BLOCK)
    canvas.rect(0, 0, A4[0], A4[1], fill=1, stroke=0)
    # Gold accent bar at top
    canvas.setFillColor(ACCENT)
    canvas.rect(0, A4[1]-15*mm, A4[0], 5*mm, fill=1, stroke=0)
    # Gold accent bar at bottom
    canvas.rect(0, 10*mm, A4[0], 3*mm, fill=1, stroke=0)
    # Title
    canvas.setFillColor(ACCENT)
    canvas.setFont('Helvetica-Bold', 32)
    canvas.drawCentredString(A4[0]/2, A4[1]-80*mm, "SGTX Platform")
    canvas.setFont('Helvetica-Bold', 26)
    canvas.drawCentredString(A4[0]/2, A4[1]-95*mm, "Master Blueprint")
    # Subtitle
    canvas.setFillColor(colors.HexColor('#cfcbbf'))
    canvas.setFont('Helvetica', 16)
    canvas.drawCentredString(A4[0]/2, A4[1]-115*mm, "Clean Master Edition v14.0")
    # Tagline
    canvas.setFillColor(ACCENT)
    canvas.setFont('Helvetica-Oblique', 12)
    canvas.drawCentredString(A4[0]/2, A4[1]-135*mm, "Sovereign Governed Trade Execution Infrastructure")
    # Status box
    canvas.setFillColor(colors.HexColor('#2a2618'))
    canvas.roundRect(40*mm, A4[1]-190*mm, 130*mm, 35*mm, 3*mm, fill=1, stroke=0)
    canvas.setFillColor(ACCENT)
    canvas.setFont('Helvetica-Bold', 10)
    canvas.drawCentredString(A4[0]/2, A4[1]-165*mm, "STATUS: AUDITED / INTEGRATED / CANONICAL")
    canvas.setFillColor(colors.HexColor('#cfcbbf'))
    canvas.setFont('Helvetica', 9)
    canvas.drawCentredString(A4[0]/2, A4[1]-175*mm, "Document Date: 2026-08-26")
    canvas.drawCentredString(A4[0]/2, A4[1]-183*mm, "Prepared by: Master Blueprint Integration Engine")
    canvas.drawCentredString(A4[0]/2, A4[1]-191*mm, "Classification: Internal Technical Master Specification")
    # Bottom text
    canvas.setFillColor(colors.HexColor('#8c8982'))
    canvas.setFont('Helvetica', 8)
    canvas.drawCentredString(A4[0]/2, 20*mm, "Non-Custodial | Non-Marketplace | Governor-Governed | USTN-Centric | Jurisdiction-Aware")
    canvas.restoreState()

# ═══════════════════════════════════════════════════════════════════════════════
# HELPER FUNCTIONS
# ═══════════════════════════════════════════════════════════════════════════════
def make_table(data, col_widths=None, header_bg=HEADER_FILL, stripe=True):
    """Create a styled table with header row."""
    available = 170*mm
    if not col_widths:
        n = len(data[0])
        col_widths = [available/n] * n
    # Wrap text in Paragraphs
    wrapped = []
    for i, row in enumerate(data):
        wrapped_row = []
        for cell in row:
            if isinstance(cell, str):
                style = styleTableHeader if i == 0 else styleTableCell
                wrapped_row.append(Paragraph(cell, style))
            else:
                wrapped_row.append(cell)
        wrapped.append(wrapped_row)
    t = Table(wrapped, colWidths=col_widths, repeatRows=1)
    style_cmds = [
        ('BACKGROUND', (0,0), (-1,0), header_bg),
        ('TEXTCOLOR', (0,0), (-1,0), colors.white),
        ('FONTNAME', (0,0), (-1,0), 'Helvetica-Bold'),
        ('FONTSIZE', (0,0), (-1,0), 8),
        ('FONTSIZE', (0,1), (-1,-1), 8),
        ('ALIGN', (0,0), (-1,0), 'CENTER'),
        ('VALIGN', (0,0), (-1,-1), 'TOP'),
        ('GRID', (0,0), (-1,-1), 0.5, BORDER),
        ('TOPPADDING', (0,0), (-1,-1), 4),
        ('BOTTOMPADDING', (0,0), (-1,-1), 4),
        ('LEFTPADDING', (0,0), (-1,-1), 4),
        ('RIGHTPADDING', (0,0), (-1,-1), 4),
    ]
    if stripe:
        for i in range(1, len(data)):
            if i % 2 == 0:
                style_cmds.append(('BACKGROUND', (0,i), (-1,i), TABLE_STRIPE))
    t.setStyle(TableStyle(style_cmds))
    return t

def layer_heading(text, level=0):
    """Add a heading that registers in the TOC."""
    style = [styleH1, styleH2, styleH3][min(level, 2)]
    p = Paragraph(text, style)
    p.bookmark_name = text.lower().replace(' ', '_').replace('—','').replace('/','_')[:60] + str(level)
    p.bookmark_level = level
    p.bookmark_text = text
    return p

def body(text):
    return Paragraph(text, styleBody)

def note(text):
    return Paragraph(text, styleNote)

def spacer(h=3):
    return Spacer(1, h*mm)

# ═══════════════════════════════════════════════════════════════════════════════
# BUILD STORY
# ═══════════════════════════════════════════════════════════════════════════════
story = []

# ── COVER PAGE ──
story.append(NextPageTemplate('CoverPage'))
story.append(PageBreak())

# ── TABLE OF CONTENTS ──
story.append(NextPageTemplate('BodyPage'))
story.append(PageBreak())
story.append(layer_heading("Table of Contents", 0))
story.append(spacer(5))
toc_entries = [
    ("Executive Summary", 1),
    ("LAYER 0 — CONSTITUTION", 1),
    ("  0.1 Governor Principles (G1–G7)", 2),
    ("  0.2 The 32-Point SGTX Transaction Constitution", 2),
    ("  0.3 AI Authority Ladder (A0–A5)", 2),
    ("  0.4 Amendment Process", 2),
    ("LAYER 1 — ARCHITECTURE", 1),
    ("  1. Multi-Clock State Vector Model", 2),
    ("  2. Event Spine (Immutable Event Log)", 2),
    ("  3. Governor Pipeline", 2),
    ("  4. Settlement Orchestration Control Plane", 2),
    ("  5. 28-Add-On Catalogue with Status Matrix", 2),
    ("  6. Jurisdiction Capability Adapter Schema", 2),
    ("  7. Regulatory Classification Gate", 2),
    ("  8. Closure Policy", 2),
    ("  9. AI Recommendation Gateway", 2),
    ("  10. Transport Engine Architecture", 2),
    ("LAYER 2 — IMPLEMENTATION SPECIFICATIONS", 1),
    ("  11. Canonical Event Type Catalogue", 2),
    ("  12. Canonical Data Model Outline", 2),
    ("  13. API Contract Structure", 2),
    ("  14. Observability Catalogue", 2),
    ("  15. RTO/RPO Targets", 2),
    ("APPENDICES", 1),
    ("  Appendix A — Financial Control Framework (CFO)", 2),
    ("  Appendix B — Regulatory & Legal", 2),
    ("  Appendix C — Operating Model", 2),
    ("  Appendix D — Implementation Priority Framework", 2),
    ("  Appendix E — Full Historical Audit Trail (Immutable Annex)", 2),
    ("  Appendix F — Source Manifest", 2),
    ("  Change Log v13.1 → v14.0", 2),
]
for title, level in toc_entries:
    style = ParagraphStyle(f'TOC{level}', fontName='Helvetica-Bold' if level == 1 else 'Helvetica',
        fontSize=11 if level == 1 else 10, leading=16 if level == 1 else 14,
        textColor=TEXT_PRIMARY if level == 1 else TEXT_MUTED,
        leftIndent=0 if level == 1 else 8*mm, spaceBefore=2 if level == 1 else 0)
    story.append(Paragraph(title, style))
story.append(PageBreak())

# ── EXECUTIVE SUMMARY ──
story.append(layer_heading("Executive Summary — What Changed from v13.1 and Why", 0))
story.append(body(
    "This Clean Master Edition v14.0 restructures the SGTX Platform Master Blueprint into three strict layers: "
    "Layer 0 (Constitution), Layer 1 (Architecture), and Layer 2 (Implementation Specifications). "
    "The v13.1 baseline is treated as the audited historical record; all changes in v14.0 are additive, clarifying, "
    "or restructuring. No material, principle, or capability has been silently deleted."
))
story.append(body(
    "The primary motivation for v14.0 is to produce a document that a bank, CBE-class regulator, institutional "
    "investor, or independent engineering team can treat as a single source of truth. The v13.1 document, while "
    "comprehensive, mixed immutable constitutional principles with implementation details, used inconsistent "
    "deployment-state vocabulary, and contained residual over-claim language ('production-ready', 'complete', "
    "'zero-cost') that is inappropriate for a regulated multi-jurisdiction platform."
))
story.append(body(
    "<b>Key changes in v14.0:</b> (1) Three-layer separation with every normative statement tagged [L0], [L1], or [L2]. "
    "(2) Elimination of all over-claim language — replaced with precise deployment-state vocabulary: CORE_READY, "
    "PRODUCTION_CONNECTED, LEGAL_AUTHORIZATION_REQUIRED. (3) The 24 audit findings from v13.1 Part A (A-01 through A-24) "
    "are enforced as governing language, not re-opened. (4) Full 28-add-on catalogue with explicit status matrix. "
    "(5) 4-dimension external readiness reporting (TECHNICAL / LEGAL / OPERATIONAL / COMMERCIAL). "
    "(6) Command/Event taxonomy formalized. (7) Historical audit trail preserved as immutable annex."
))
story.append(body(
    "<b>What v14.0 is NOT:</b> It is not a new architecture. It is not a redesign. It does not introduce new "
    "capabilities beyond what v13.1 specified. It is a clean, restructured, institutionally-defensible presentation "
    "of the same architecture, with all contradictions resolved, all over-claims eliminated, and all principles "
    "clearly separated by mutability layer."
))
story.append(PageBreak())

# ═══════════════════════════════════════════════════════════════════════════════
# LAYER 0 — CONSTITUTION
# ═══════════════════════════════════════════════════════════════════════════════
story.append(layer_heading("LAYER 0 — CONSTITUTION", 0))
story.append(body(
    "<b>[L0] This layer contains immutable principles only.</b> These principles are the non-negotiable foundation "
    "of the SGTX platform. They may be amended only via an explicit multisig + notice process (see §0.4 Amendment "
    "Process). No implementation decision, business pressure, or operational convenience may override a Layer 0 principle."
))
story.append(spacer(5))

# G1-G7
story.append(layer_heading("0.1 Governor Principles (G1–G7)", 1))
story.append(body("[L0] The Governor is the constitutional enforcement engine of SGTX. Seven principles govern its operation:"))
g_principles = [
    ["Principle", "Statement"],
    ["G1 — Execution Always Gated", "Every irreversible action requires Governor approval before execution. No component may bypass the Governor pipeline."],
    ["G2 — OPA Enforced", "Open Policy Agent (OPA) evaluates every decision against authored policies. Policy violations block execution."],
    ["G3 — WasmEdge Constitutional", "WasmEdge executes constitutional rules (non-custody, non-marketplace, 110% reserve, closure-is-earned) as deterministic WebAssembly modules. These cannot be overridden by configuration."],
    ["G4 — Loom Audited", "Every Governor decision is appended to the Loom (SHA-256 hash-chained audit log). The Loom is immutable and externally verifiable."],
    ["G5 — Multisig for Irreversible", "Irreversible actions (USTN closure, policy amendment, fund release) require multisig approval (2-of-3 standard, 3-of-5 constitutional)."],
    ["G6 — AI Advisory Only", "The AI subsystem (A1–A3) may propose, explain, classify, and escalate, but NEVER has independent execution authority. A4 automation is deterministic policy execution, not AI autonomy."],
    ["G7 — Bank-Authoritative Settlement", "SGTX orchestrates settlement instructions but never becomes the settlement authority. Banks and regulated financial institutions confirm settlement finality. SGTX is non-custodial by architecture."],
]
story.append(make_table(g_principles, col_widths=[45*mm, 125*mm]))
story.append(spacer(5))

# 32-Point Constitution
story.append(layer_heading("0.2 The 32-Point SGTX Transaction Constitution", 1))
story.append(body("[L0] The following 32 points constitute the immutable constitution of the SGTX platform. Every trade, every component, and every integration must comply with all 32 points."))
constitution_32 = [
    "Non-custodial — SGTX never holds customer funds. FeeLock escrow is non-custodial; funds remain with the regulated bank/PSP until settlement is confirmed.",
    "Non-marketplace — SGTX does not match buyers with sellers. Trades occur between known, relationship-controlled counterparties.",
    "Non-title-taking — SGTX never takes title to goods. Title transfer is governed by the contract Incoterm and applicable law.",
    "Non-carrier — SGTX is not a carrier. It orchestrates logistics execution through approved carriers, LSPs, and shipping lines.",
    "Non-customs-authority — SGTX is not a customs authority. It interfaces with customs authorities (Nafeza, single-window systems) but never replaces them.",
    "Non-bank — SGTX is not a bank. It orchestrates payment instructions but never holds deposits or executes settlement.",
    "Non-deposit-taking — SGTX does not accept deposits. All funds flow through connected banks and regulated PSPs.",
    "Non-government — SGTX is not a government entity. It serves as infrastructure connecting commercial parties with government systems.",
    "AI-assisted — AI provides advisory (A1), constraining (A2), and escalation (A3) capabilities. A4 automation is deterministic policy execution.",
    "Governor-governed — Every irreversible action passes through the Governor pipeline (G1–G7).",
    "OPA-enforced — Open Policy Agent evaluates every decision against authored policies.",
    "WasmEdge-enforced — Constitutional rules execute as deterministic WebAssembly modules.",
    "Loom-audited — Every decision is appended to the SHA-256 hash-chained Loom audit log.",
    "USTN-centric — The Universal Shipment Tracking Number (USTN) is the canonical namespace for every trade. All downstream records reference the USTN.",
    "Jurisdiction-aware — Every trade is evaluated against the applicable jurisdiction's regulatory profile, customs procedure, and legal framework.",
    "Relationship-controlled — Counterparty relationships are explicitly established (approved, connected, saved GTID). No random matching, no public rankings.",
    "110% reserve rule — If reserve metadata is maintained, it must be at least 110% backed. The constitutional layer sets the threshold; ZK attestation provides evidence.",
    "Closure-is-earned — A USTN is closed only when all 7 closure conditions are met (delivery accepted, settlement complete, reconciliation complete, customs complete, post-clearance complete, disputes satisfied, evidence sealed). Closure cannot be forced.",
    "Recovery ≠ erasure — Recovery actions (exception resolution, obligation failure cascade) restore state but never erase audit history. The Loom is immutable.",
    "USTN as namespace, not override — The USTN is a universal reference namespace. It does not override external authoritative systems (government references, bank transaction IDs, customs declarations).",
    "Bank-authoritative settlement — Banks and regulated financial institutions are authoritative for money movement and settlement confirmation. SGTX orchestrates instructions; it does not confirm settlement.",
    "Non-custody is architectural — Non-custody is an architectural property of SGTX, not a standalone legal classification. Actual functionality determines licensing in each jurisdiction.",
    "Reserve metadata ≠ custody — Reserve tables store attestations, ratios, and evidence metadata. They do not create customer-fund custody.",
    "Stablecoin/DeFi conditional — Stablecoin/DeFi rails are conditional, jurisdiction-permitted financing capabilities, not canonical settlement authority. They are sub-rails beneath bank-authoritative settlement.",
    "GNN non-marketplace bounded — The Graph Neural Network (Add-On 1) provides trust analytics for known parties. It never discovers, recommends, ranks, or introduces counterparties.",
    "Direct API = first-party connector — 'Direct API' denotes a currently adopted first-party connector (e.g., Nafeza, CargoX, ETA, CBE). The worldwide adapter fabric is the extensibility layer.",
    "RoRo is first-class — Roll-on/Roll-off cargo is a first-class transport mode, not a sub-mode of ocean container. It has its own entity types, state machines, and terminal adapters.",
    "Mode-specific government applicability — Government integrations (e.g., Egypt Nafeza) have mode-specific applicability. A single generic maritime workflow is insufficient; ROAD, AIR, OCEAN_CONTAINER, RORO, RAIL each have distinct customs procedures.",
    "External readiness is 4-dimensional — Every integration reports independently: TECHNICAL, LEGAL, OPERATIONAL, COMMERCIAL. 'Connected' requires all four dimensions.",
    "Production-readiness vocabulary — Use CORE_READY, ADAPTER_READY, COUNTRY_CONFIGURED, SANDBOX_CONNECTED, PRODUCTION_CONNECTED, LEGAL_AUTHORIZATION_REQUIRED, MANUAL_ONLY, PORTAL_ONLY, INTEGRATION_REQUIRED. Never claim WORLDWIDE_INTEGRATED without evidence.",
    "Manual fallback is governed — Manual fallback (API → EDI → SFTP → PORTAL → BROKER → MANUAL) is authenticated, attributable, timestamped, hashed, and Loom-logged.",
    "Evidence is sealed at closure — The final evidence package (26 categories per Art 101) is sealed at USTN closure. Post-closure observation (§22) may add evidence but cannot modify sealed evidence.",
]
for i, point in enumerate(constitution_32, 1):
    story.append(Paragraph(f"<b>[L0] {i}.</b> {point}", styleConstitution))
story.append(spacer(5))

# AI Authority Ladder
story.append(layer_heading("0.3 AI Authority Ladder (A0–A5)", 1))
story.append(body("[L0] The AI subsystem operates on a strict authority ladder. A5 is FORBIDDEN."))
ai_ladder = [
    ["Level", "Name", "Authority", "Boundary"],
    ["A0", "None", "No AI involvement", "Pure deterministic rules"],
    ["A1", "Advisory", "May explain, translate, suggest, summarise, notify, generate draft instructions", "Never makes decisions; never blocks; never forces"],
    ["A2", "Constraining", "May classify, detect anomalies/discrepancies, predict delays, compare images, estimate ETA, optimise ULD/stowage, analyse route", "Proposes constraints; Governor decides whether to enforce"],
    ["A3", "Escalation", "May escalate to human review, flag for enhanced due diligence, trigger compliance review", "Escalates; never resolves autonomously"],
    ["A4", "Execution (within bounds)", "Deterministic policy automation executed by Governor + OPA + WasmEdge under pre-authorised rules", "AI NEVER acquires independent execution authority; A4 is policy, not AI autonomy"],
    ["A5", "FORBIDDEN", "Autonomous AI decision-making without human authorization", "CONSTITUTIONALLY PROHIBITED. No component may implement A5."],
]
story.append(make_table(ai_ladder, col_widths=[15*mm, 25*mm, 70*mm, 60*mm]))
story.append(spacer(5))

# Amendment Process
story.append(layer_heading("0.4 Amendment Process", 1))
story.append(body(
    "[L0] Layer 0 principles may be amended only through the following process: "
    "(1) A formal amendment proposal is submitted to the Platform Governance Authority. "
    "(2) The proposal undergoes a mandatory 30-day notice period during which all affected parties may review and comment. "
    "(3) The amendment requires 3-of-5 multisig approval from the constitutional signatories. "
    "(4) The amendment is appended to the Loom with its full provenance (proposer, reviewers, signatories, timestamp). "
    "(5) The previous version is NEVER deleted; it is marked as superseded with a forward reference to the new version. "
    "This process ensures full traceability — no constitutional change is ever silent."
))
story.append(PageBreak())

# ═══════════════════════════════════════════════════════════════════════════════
# LAYER 1 — ARCHITECTURE
# ═══════════════════════════════════════════════════════════════════════════════
story.append(layer_heading("LAYER 1 — ARCHITECTURE", 0))
story.append(body(
    "<b>[L1] This layer contains the current normative architecture of SGTX.</b> "
    "These specifications describe how the platform is structured and how components interact. "
    "They are mutable through the standard change-management process (see Appendix C), but must always comply with Layer 0."
))
story.append(spacer(5))

# Part 1 — Multi-Clock State Vector
story.append(layer_heading("1. Multi-Clock State Vector Model", 1))
story.append(body(
    "[L1] SGTX maintains a multi-clock state vector for every trade. Each domain has its own logical clock that "
    "advances independently, enabling the platform to reason about temporal consistency across heterogeneous processes "
    "that operate at different speeds and with different finality guarantees."
))
story.append(body(
    "The state vector consists of 12 domain clocks, each tracking the progress of a specific aspect of the trade lifecycle. "
    "The divergence index measures how far apart the clocks have drifted, which is a leading indicator of trade health "
    "and a trigger for Governor intervention."
))
domains = [
    ["Domain", "Clock Tracks", "Finality Classes"],
    ["1. Commercial", "Trade initiation, quote, contract, order", "F0–F5"],
    ["2. Logistics", "Transport booking, execution, tracking, delivery", "F0–F5"],
    ["3. Customs", "Declaration, assessment, clearance, post-clearance", "F0–F5"],
    ["4. Financial", "Payment instructions, settlement, reconciliation", "F0–F5"],
    ["5. Documentation", "Document generation, verification, legalization", "F0–F5"],
    ["6. Compliance", "Sanctions, regulatory, KYB/AML screening", "F0–F5"],
    ["7. Insurance", "Policy issuance, claims, settlement", "F0–F5"],
    ["8. Quality Control", "Inspection, sampling, reporting", "F0–F5"],
    ["9. Dispute", "Filing, mediation, arbitration, resolution", "F0–F5"],
    ["10. Post-Trade", "Returns, claims, warranty, drawback", "F0–F5"],
    ["11. Evidence", "Evidence package assembly, sealing", "F0–F5"],
    ["12. Governance", "Governor decisions, OPA evaluations, Loom entries", "F0–F5"],
]
story.append(make_table(domains, col_widths=[35*mm, 90*mm, 45*mm]))
story.append(spacer(3))
story.append(body(
    "<b>Finality Classes (F0–F5):</b> F0=None (no activity), F1=Proposed (intent expressed), F2=Asserted (action taken, "
    "awaiting confirmation), F3=Confirmed (counterparty or authority confirmed), F4=Settled (financial settlement complete), "
    "F5=Sealed (immutable, evidence-sealed, post-closure observation active)."
))
story.append(body(
    "<b>Divergence Index:</b> NONE (all clocks within 1 finality step), LOW (max 2 steps), MEDIUM (max 3 steps), "
    "HIGH (max 4 steps), CRITICAL (5+ steps — Governor intervention required)."
))
story.append(PageBreak())

# Part 2 — Event Spine
story.append(layer_heading("2. Event Spine (Immutable Event Log)", 1))
story.append(body(
    "[L1] The Event Spine is the immutable, append-only, hash-chained log of every significant event in the platform. "
    "It is the single source of truth for what happened, when, and by whose authority. The Event Spine is never "
    "modified or deleted; corrections are made by appending new events that reference the original."
))
story.append(body(
    "<b>Command ≠ Event:</b> A Command is an intent to change state (e.g., 'SubmitQuote'). An Event is a fact that "
    "has occurred (e.g., 'QuoteSubmitted'). Commands flow into the Governor pipeline; Events are appended to the "
    "Event Spine after the Governor authorises the Command."
))
story.append(body(
    "<b>Observation / Assertion / Confirmation taxonomy:</b> Events are classified by their authority attribute: "
    "Observation (passive recording of external state), Assertion (active claim by a party), Confirmation (authoritative "
    "verification by a trusted source). Each event type has a required authority class that determines who may emit it."
))
story.append(body(
    "<b>SHA-256 hash chain:</b> Each event's hash is computed over (previousEventHash + eventPayload + timestamp + "
    "actorGtid). This creates a tamper-evident chain where any modification to a historical event breaks all subsequent hashes."
))
story.append(body(
    "<b>Replay mode (§86):</b> The state vector for any USTN can be reconstructed by replaying all events from the "
    "Event Spine. This enables audit, dispute resolution, and regulatory inspection without querying live state."
))
story.append(PageBreak())

# Part 3 — Governor Pipeline
story.append(layer_heading("3. Governor Pipeline", 1))
story.append(body(
    "[L1] The Governor is the constitutional enforcement engine. Every irreversible action passes through the Governor "
    "pipeline, which evaluates the action against G1–G7 principles, OPA policies, and WasmEdge constitutional rules."
))
story.append(body(
    "<b>Pipeline stages:</b> (1) Command received. (2) Governor evaluates G1 (execution gated). (3) OPA evaluates "
    "authored policies. (4) WasmEdge evaluates constitutional rules. (5) Multisig check if irreversible (G5). "
    "(6) Decision merged (DENY > CONDITIONAL > ALLOW). (7) If ALLOW, action executed + event appended to Loom. "
    "(8) If DENY, blocked + reason logged. (9) If CONDITIONAL, conditions recorded + action proceeds with conditions."
))
story.append(body(
    "<b>Decision merge semantics:</b> When multiple gates evaluate the same action, the strictest verdict wins. "
    "DENY overrides CONDITIONAL overrides ALLOW. This ensures that a single gate's denial cannot be overridden by "
    "other gates' approvals."
))
story.append(PageBreak())

# Part 4 — Settlement Orchestration
story.append(layer_heading("4. Settlement Orchestration Control Plane", 1))
story.append(body(
    "[L1] The Settlement Orchestration Control Plane manages multi-leg payment instructions. It orchestrates the "
    "flow of payment instructions to banks and PSPs, tracks settlement leg states, and enforces atomicity policies."
))
story.append(body(
    "<b>Multi-leg model:</b> A single trade may have multiple payment legs (e.g., goods payment, freight payment, "
    "duty payment, SGTX fee). Each leg is an independent payment instruction with its own state machine: "
    "PENDING → SUBMITTED → ACCEPTED → SETTLED (or REJECTED / RETURNED / REVERSED)."
))
story.append(body(
    "<b>5 atomicity policies:</b> ALL_OR_NONE (all legs must settle or all fail), PARTIAL_ALLOWED (legs may settle "
    "independently), SEQUENCED (legs must settle in order), CONDITIONAL (legs settle based on conditions), "
    "HUMAN_RELEASE (legs require human release before settlement)."
))
story.append(body(
    "<b>Bank Settlement Gateway (6-stage pipeline):</b> (1) Schema validation (ISO 20022 / bank-specific format). "
    "(2) Signature validation (QES or bank API auth). (3) USTN validation (trade exists, not blocked). "
    "(4) Beneficiary consistency (match trade contract). (5) Bank policy check (limits, AML, sanctions). "
    "(6) AML/sanctions screening. The Gateway simulates this pipeline; real bank APIs are called by the connected bank's integration."
))
story.append(body(
    "<b>Non-custody boundary:</b> SGTX orchestrates settlement instructions but NEVER holds funds. The FeeLock "
    "mechanism locks the SGTX fee at trade initiation, but the fee is collected by the bank during settlement — "
    "SGTX never receives the fee directly. This is the architectural non-custody boundary."
))
story.append(PageBreak())

# Part 5 — 28 Add-On Catalogue
story.append(layer_heading("5. 28-Add-On Catalogue with Status Matrix", 1))
story.append(body(
    "[L1] The SGTX platform includes 28 add-on modules. Each add-on extends the core platform with specific capabilities. "
    "The status matrix below uses the v14.0 deployment-state vocabulary: CORE_READY (implemented and tested), "
    "PRODUCTION_CONNECTED (live integration active), LEGAL_AUTHORIZATION_REQUIRED (technical ready, awaiting legal/regulatory approval)."
))
addons = [
    ["#", "Add-On Name", "Priority", "Status", "Blueprint Ref"],
    ["1", "GNN Risk Engine & Institutional Trade Graph", "Foundation", "CORE_READY", "Part 11.1"],
    ["2", "Federated Learning Network", "Foundation", "CORE_READY", "Part 11.2"],
    ["3", "Causal Inference Engine", "Foundation", "CORE_READY", "Part 11.3"],
    ["4", "Self-Healing Infrastructure & Chaos Engineering", "Foundation", "CORE_READY", "Part 11.4"],
    ["5", "Automated Penetration Testing", "Foundation", "CORE_READY", "Part 11.5"],
    ["6", "Post-Quantum Cryptography (PQC)", "Foundation", "CORE_READY", "Part 11.6"],
    ["7", "Expanded ZK Proofs & Proof of Reserves", "Foundation", "CORE_READY", "Part 11.7"],
    ["8", "Customs Bond & Guarantee Management", "P0", "CORE_READY", "Part 11.8"],
    ["9", "Demurrage & Detention Management", "P0", "CORE_READY", "Part 11.9"],
    ["10", "Broker Liability & Insurance Management", "P0", "CORE_READY", "Part 11.10"],
    ["11", "Customs Valuation Intelligence", "P1", "CORE_READY", "Part 11.11"],
    ["12", "Cold Chain Quality Management", "P1", "CORE_READY", "Part 11.12"],
    ["13", "Inspection Agency Accreditation", "P1", "CORE_READY", "Part 11.13"],
    ["14", "Currency Risk Management", "P1", "CORE_READY", "Part 11.14"],
    ["15", "Government API Sandbox", "P1", "CORE_READY", "Part 11.15"],
    ["16", "FTA Preference Management", "P1", "CORE_READY", "Part 11.16"],
    ["17", "Piracy & Security Risk Engine", "P1", "CORE_READY", "Part 11.17"],
    ["18", "Trade Compliance Calendar", "P1", "CORE_READY", "Part 11.18"],
    ["19", "Cargo Insurance Integration", "P2", "CORE_READY", "Part 11.19"],
    ["20", "Trade Finance Documentation", "P2", "CORE_READY", "Part 11.20"],
    ["21", "Back-to-Back LC Management", "P2", "CORE_READY", "Part 11.21"],
    ["22", "Force Majeure Handling", "P2", "CORE_READY", "Part 11.22"],
    ["23", "Shipper's Declaration & Export Docs", "P2", "CORE_READY", "Part 11.23"],
    ["24", "Port & Terminal Integration", "P2", "CORE_READY", "Part 11.24"],
    ["25", "Payment Guarantee Confirmation (Optional)", "P3", "CORE_READY", "Part 11.25"],
    ["26", "Demurrage Dispute Resolution", "P3", "CORE_READY", "Part 11.26"],
    ["27", "(RESERVED)", "—", "—", "—"],
    ["28", "GRiRE (Global Regulatory Intelligence & Requirements Engine)", "Foundation", "CORE_READY", "Part 11.28"],
]
story.append(make_table(addons, col_widths=[8*mm, 65*mm, 18*mm, 35*mm, 35*mm]))
story.append(spacer(3))
story.append(note(
    "<b>Non-marketplace bound:</b> Add-On 1 (GNN) is explicitly bounded by the non-marketplace safeguard [L0-25]. "
    "It provides trust analytics for parties already known to the tenant but NEVER discovers, recommends, ranks, "
    "or introduces counterparties."
))
story.append(PageBreak())

# Part 6 — Jurisdiction Capability Adapter
story.append(layer_heading("6. Jurisdiction Capability Adapter Schema", 1))
story.append(body(
    "[L1] SGTX supports a worldwide jurisdiction capability adapter fabric. Each jurisdiction (country, customs territory, "
    "economic union) has a profile that defines its regulatory requirements, customs procedures, payment rails, and "
    "government integrations."
))
story.append(body(
    "<b>16 connector states:</b> NOT_DISCOVERED → DISCOVERED → DOCUMENTED → CONTACT_REQUIRED → CREDENTIALS_REQUIRED → "
    "SANDBOX_AVAILABLE → SANDBOX_CONNECTED → CERTIFICATION_REQUIRED → CERTIFICATION_PENDING → PRODUCTION_READY → "
    "PRODUCTION_CONNECTED → DEGRADED → OUTAGE → PORTAL_ONLY → MANUAL_ONLY → DEPRECATED."
))
story.append(body(
    "<b>7 authoritative statuses:</b> SGTX_READY → SUBMITTED → GOVERNMENT_ACCEPTED → GOVERNMENT_REJECTED → "
    "GOVERNMENT_HOLD → GOVERNMENT_RELEASED → MANUAL_AUTHORITY_CONFIRMED. SGTX never invents government approval."
))
story.append(body(
    "<b>4-dimension external readiness:</b> Every integration reports independently across TECHNICAL (API connected?), "
    "LEGAL (contracts signed?), OPERATIONAL (procedures tested?), COMMERCIAL (fees agreed?). 'Connected' requires "
    "all four dimensions to be satisfied."
))
story.append(PageBreak())

# Part 7 — Regulatory Classification Gate
story.append(layer_heading("7. Regulatory Classification Gate", 1))
story.append(body(
    "[L1] The Regulatory Classification Gate maps the platform's actual functionality to the applicable licence class "
    "in each jurisdiction. This is a dynamic, jurisdiction-aware classification — not a static label."
))
story.append(body(
    "[L1] <b>Non-custody is architectural, not legal classification.</b> SGTX's non-custody property is an architectural "
    "fact (the platform never holds customer funds). However, actual functionality determines licensing in each "
    "jurisdiction. A jurisdiction may classify SGTX's orchestration role as requiring specific licences (e.g., payment "
    "service provider, money transmission, customs broker licence) regardless of the non-custody architecture."
))
story.append(body(
    "<b>Egypt / CBE Law 194/2020 as initial reference:</b> The platform's initial regulatory classification is based "
    "on Egyptian law, including CBE Law 194/2020, Nafeza customs regulations, and ETA (Egyptian Tax Authority) "
    "requirements. The classification matrix is extensible to other jurisdictions via the Jurisdiction Capability Adapter."
))
story.append(PageBreak())

# Part 8 — Closure Policy
story.append(layer_heading("8. Closure Policy", 1))
story.append(body(
    "[L1] A USTN is closed only when all 7 closure conditions are met. Closure is earned, not forced."
))
closure_conditions = [
    ["#", "Condition", "Description"],
    ["1", "Delivery Accepted", "Final delivery confirmed by receiver (quantity, condition, quality verified)"],
    ["2", "Settlement Complete", "All payment legs settled (goods, freight, duty, fees)"],
    ["3", "Financial Reconciliation Complete", "Bank/PSP reconciliation matches SGTX records (no material mismatch)"],
    ["4", "Customs Complete", "Import and export customs cleared, no open holds"],
    ["5", "Post-Clearance Complete", "Post-clearance audit, correction, refund/drawback processed if applicable"],
    ["6", "Disputes/Claims Satisfied", "All filed disputes and claims resolved or time-barred"],
    ["7", "Evidence Sealed", "26-category evidence package assembled, hashed, and sealed (immutable)"],
]
story.append(make_table(closure_conditions, col_widths=[8*mm, 45*mm, 117*mm]))
story.append(spacer(3))
story.append(body(
    "<b>canClose predicate:</b> canClose(ustn) = AND(all 7 conditions met). The Governor evaluates this predicate; "
    "it never auto-closes. If canClose returns true, the USTN is marked CLOSED and the evidence package is sealed."
))
story.append(body(
    "<b>CLOSED_WITH_EXCEPTION:</b> In limited cases, a USTN may be closed with an open exception if the sole blocker "
    "is an EXCEPTION_OPEN state with severity ≤ 2 (low). Severity 3–5 exceptions block closure. The severity matrix "
    "ensures that minor administrative exceptions do not indefinitely block closure, while material exceptions do."
))
story.append(body(
    "<b>Post-closure event rules (§22):</b> After closure, a post-closure observation period is active. New evidence "
    "may be added (e.g., late-arriving customs confirmation) but sealed evidence cannot be modified. The Transaction "
    "Twin continues to observe and may trigger re-opening if a material exception is discovered."
))
story.append(PageBreak())

# Part 9 — AI Recommendation Gateway
story.append(layer_heading("9. AI Recommendation Gateway", 1))
story.append(body(
    "[L1] The AI Recommendation Gateway channels AI outputs through the Governor pipeline. AI never executes directly; "
    "it proposes, and the Governor decides."
))
story.append(body(
    "<b>Flow:</b> (1) AI subsystem (A1–A3) produces a recommendation. (2) Recommendation is submitted to the Governor "
    "as a Command. (3) Governor evaluates against G1–G7, OPA policies, WasmEdge rules. (4) If ALLOW, the recommended "
    "action is executed by the deterministic policy engine (A4). (5) If CONDITIONAL, conditions are recorded. "
    "(6) If DENY, the recommendation is blocked + reason logged. (7) The event is appended to the Loom."
))
story.append(body(
    "[L0-9, L0-21] <b>AI NEVER has independent execution authority.</b> A4 is deterministic policy automation — "
    "the AI proposes, the Governor + OPA + WasmEdge execute under pre-authorised rules. The AI subsystem itself "
    "never acquires execution authority. This is the constitutional boundary."
))
story.append(PageBreak())

# Part 10 — Transport Engine
story.append(layer_heading("10. Transport Engine Architecture", 1))
story.append(body(
    "[L1] SGTX supports 5 transport modes as first-class engines, each with its own entity types, state machines, "
    "and terminal adapters. A Multimodal Orchestrator coordinates multi-leg journeys across modes."
))
transport_modes = [
    ["Mode", "Entity Types", "State Machine", "Portal"],
    ["Road", "RoadCorridor, RoadLeg, RoadShipment, RoadVehicle, RoadDriver, RoadBorderCrossing, RoadGpsTracking", "PLANNED → IN_TRANSIT → AT_BORDER → CLEARED → DELIVERED", "LSP"],
    ["Air", "AirBooking, AirFlight, AirAirport, AirWaybill, AirPiece, AirUld, AirStatusEvent, AirChargeableWeight", "BOOKED → DOCUMENTS_PENDING → CUSTOMS_PENDING → READY_FOR_GATE → GATE_IN → INSPECTED → YARD → LOADED → AT_SEA → DISCHARGED → DELIVERED", "Shipping Line"],
    ["Ocean Container", "Booking, Vessel, Voyage, Port, Container, VGM, B/L, e-B/L, Manifest, ACI, Terminal, Gate, Transshipment, Demurrage, Detention, Delivery", "PLANNED → LOADED → DEPARTED → IN_TRANSIT → ARRIVED → DISCHARGED → CUSTOMS_RELEASED → DELIVERED", "Shipping Line"],
    ["RoRo", "RoRoShipment, RoRoUnit (VIN-level), RoRoVoyage, RoRoBooking, RoRoYard, RoRoGateEvent, RoRoInspection, RoRoBillOfLading", "19-state unit machine: BOOKED → ... → DELIVERED → ACCEPTED", "Shipping Line"],
    ["Rail", "RailBooking, RailTrain, RailWagon, RailTerminal, RailConsignment (CIM/SMGS), RailTransit, RailStatusEvent", "BOOKED → LOADED → DEPARTED → AT_BORDER → CUSTOMS_RELEASED → ARRIVED → UNLOADED → DELIVERED", "LSP"],
]
story.append(make_table(transport_modes, col_widths=[20*mm, 60*mm, 55*mm, 25*mm]))
story.append(spacer(3))
story.append(body(
    "<b>Multimodal Orchestrator:</b> A single USTN may span multiple transport modes (e.g., Truck → RoRo → Rail → Truck). "
    "The Multimodal Orchestrator coordinates the handoff between modes, ensuring that the USTN remains the canonical "
    "reference across all legs."
))
story.append(PageBreak())

# ═══════════════════════════════════════════════════════════════════════════════
# LAYER 2 — IMPLEMENTATION SPECIFICATIONS
# ═══════════════════════════════════════════════════════════════════════════════
story.append(layer_heading("LAYER 2 — IMPLEMENTATION SPECIFICATIONS", 0))
story.append(body(
    "<b>[L2] This layer contains concrete, testable implementation artefacts.</b> "
    "These specifications are designed to be directly implementable by an engineering team without ambiguity. "
    "They include canonical data models, event type catalogues, API contracts, and observability requirements."
))
story.append(spacer(5))

# Part 11 — Event Type Catalogue
story.append(layer_heading("11. Canonical Event Type Catalogue", 1))
story.append(body(
    "[L2] The following event types are canonical. Each event has required fields, an authority class (who may emit it), "
    "a clock impact (which domain clock it advances), and lineage rules (what it references)."
))
event_types = [
    ["Event Type", "Authority Class", "Clock Impact", "Lineage"],
    ["TradeInitiated", "Assertion (Buyer)", "Commercial F1", "References: buyerGtid, sellerGtid"],
    ["QuoteSubmitted", "Assertion (Seller)", "Commercial F2", "References: ustn, tradeId"],
    ["QuoteAccepted", "Assertion (Buyer)", "Commercial F3", "References: ustn, quoteId"],
    ["ContractLocked", "Confirmation (Governor)", "Commercial F4, Governance F3", "References: ustn, multisigId"],
    ["RegulatorySnapshotCaptured", "Observation (System)", "Compliance F3", "References: ustn, hash"],
    ["ShipmentBooked", "Assertion (Shipper)", "Logistics F2", "References: ustn, bookingRef"],
    ["ContainerLoaded", "Observation (Terminal)", "Logistics F3", "References: ustn, containerNumber"],
    ["VesselDeparted", "Observation (Carrier)", "Logistics F3", "References: ustn, voyageNumber"],
    ["CustomsDeclarationSubmitted", "Assertion (Broker)", "Customs F2", "References: ustn, declarationRef"],
    ["CustomsCleared", "Confirmation (Authority)", "Customs F4", "References: ustn, clearanceRef"],
    ["PaymentInstructionSubmitted", "Assertion (Payer)", "Financial F2", "References: ustn, legId"],
    ["PaymentSettled", "Confirmation (Bank)", "Financial F4", "References: ustn, legId, bankRef"],
    ["InspectionCompleted", "Assertion (QC/Lab)", "QC F3", "References: ustn, inspectionId"],
    ["DeliveryAccepted", "Assertion (Receiver)", "Logistics F5", "References: ustn, podRef"],
    ["DisputeFiled", "Assertion (Party)", "Dispute F2", "References: ustn, disputeId"],
    ["USTNClosed", "Confirmation (Governor)", "All domains F5", "References: ustn, evidenceHash"],
    ["ExceptionRaised", "Observation (System)", "Governance F2", "References: ustn, exceptionId"],
    ["RecoveryExecuted", "Confirmation (Governor)", "Governance F3", "References: ustn, exceptionId, recoveryPath"],
]
story.append(make_table(event_types, col_widths=[40*mm, 30*mm, 35*mm, 55*mm]))
story.append(spacer(3))
story.append(body(
    "<b>Required fields for ALL events:</b> eventId, eventType, ustn, timestamp, actorGtid, authorityClass, "
    "previousEventHash, payload (JSON), signature (QES or system). Events without these fields are rejected."
))
story.append(PageBreak())

# Part 12 — Canonical Data Model
story.append(layer_heading("12. Canonical Data Model Outline", 1))
story.append(body("[L2] The SGTX Canonical Data Model consists of the following primary stores:"))
data_model = [
    ["Store", "Purpose", "Key Fields"],
    ["State Vector Store", "12-domain × F0-F5 finality tracking per USTN", "ustn, domainClocks[12], finalityClass, divergenceIndex, healthScore"],
    ["Event Spine", "Immutable hash-chained event log", "eventId, previousEventHash, eventType, ustn, timestamp, actorGtid, payload, signature"],
    ["Obligation Graph", "Directed dependency graph of trade obligations", "obligationId, ustn, type, state, dependencies[], transitiveImpact"],
    ["Settlement Instructions/Legs", "Multi-leg payment instruction tracking", "instructionId, ustn, legs[], atomicityPolicy, state"],
    ["External Identifier Registry", "17 identifier types (UCR, MAWB, HAWB, B/L, etc.)", "identifierId, type, value, ustn, lifecycle, issuingAuthority"],
    ["Recovery Vault", "Content-addressable (SHA-256) evidence storage", "entryId, ustn, type, contentHash, reference, verified"],
    ["Transaction Twin", "14-domain digital twin for post-closure observation", "twinId, ustn, domains[14], postClosureActive, observationExpiry"],
    ["Financial Exposure", "14-dimension exposure tracking per USTN", "exposureId, ustn, dimensions[14], state, outstandingAmount"],
    ["Exception Events", "Severity 1-5 exception tracking with SLA", "exceptionId, ustn, category, severity, slaDeadline, resolutionAction"],
    ["Closure Policy", "7-condition closure evaluation per USTN", "policyId, ustn, conditions[7], blockers[], canClose, closureState"],
]
story.append(make_table(data_model, col_widths=[40*mm, 60*mm, 70*mm]))
story.append(PageBreak())

# Part 13 — API Contract
story.append(layer_heading("13. API Contract Structure", 1))
story.append(body(
    "[L2] The SGTX API enforces Command/Event separation. Commands are POST/PUT requests that intent to change state. "
    "Events are GET requests that retrieve immutable records. No API endpoint both reads and writes state."
))
story.append(body(
    "<b>Command endpoints (POST/PUT):</b> /api/sgtx/trade-request (create trade), /api/sgtx/quote/submit (submit quote), "
    "/api/sgtx/contract/lock (lock contract), /api/sgtx/ustn-close (close USTN), etc. All commands are idempotent "
    "(via Idempotency-Key header) and rate-limited."
))
story.append(body(
    "<b>Event/query endpoints (GET):</b> /api/sgtx/trade/[ustn] (fetch trade), /api/sgtx/events/[ustn] (event history), "
    "/api/sgtx/regulatory-snapshot/[ustn] (fetch snapshot), etc. All queries are read-only and cached where appropriate."
))
story.append(body(
    "<b>Standard response envelope:</b> All API responses use { ok: boolean, data: ..., error?: string, filter?: object }. "
    "List endpoints return { ok, <entity_plural>, count, filter }. This is the v14.0 standardized contract."
))
story.append(PageBreak())

# Part 14 — Observability
story.append(layer_heading("14. Observability Catalogue", 1))
story.append(body("[L2] SGTX maintains the following observability surfaces:"))
observability = [
    ["Surface", "Metrics", "Retention"],
    ["Platform Health", "Request rate, error rate, latency p50/p95/p99, uptime", "30 days"],
    ["Trade Metrics", "Trades initiated, USTN closure rate, avg trade value, avg time-to-close", "7 years"],
    ["Governor Metrics", "Decisions per minute, DENY rate, CONDITIONAL rate, multisig latency", "7 years"],
    ["Event Spine Metrics", "Events per minute, hash chain verification status, replay success rate", "7 years"],
    ["Settlement Metrics", "Settlement leg states, bank API latency, reconciliation match rate", "7 years"],
    ["Exception Metrics", "Open exceptions by severity, SLA breach count, recovery success rate", "7 years"],
    ["AI Metrics", "Recommendations per minute, acceptance rate, fallback rate, provider latency", "30 days"],
    ["Integration Metrics", "Connector health (16 states), API success rate, sandbox vs production", "90 days"],
]
story.append(make_table(observability, col_widths=[40*mm, 90*mm, 25*mm]))
story.append(spacer(3))
story.append(body(
    "<b>Minimum failure-path test suite:</b> The platform maintains an adversarial test suite covering: "
    "(1) USTN closure with missing conditions (must block). (2) Non-custody violation attempt (must block). "
    "(3) AI A5 autonomy attempt (must block). (4) Marketplace matching attempt (must block). "
    "(5) Event spine tampering (must detect). (6) Governor bypass attempt (must block). "
    "(7) Settlement without bank confirmation (must block). (8) Recovery that erases history (must block)."
))
story.append(PageBreak())

# Part 15 — RTO/RPO
story.append(layer_heading("15. RTO/RPO Targets", 1))
story.append(body("[L2] Recovery Time Objective and Recovery Point Objective targets:"))
rto_rpo = [
    ["Tier", "RTO", "RPO", "Scope", "Durability"],
    ["Critical", "4 hours", "0 (append-only)", "Event Spine, State Vector, Governor decisions", "3 copies, 2 jurisdictions, quorum 2-of-3"],
    ["Standard", "24 hours", "0 (append-only)", "All trade data, settlement instructions, evidence", "3 copies, 2 jurisdictions, quorum 2-of-3"],
    ["Extended", "72 hours", "< 1 hour", "Add-on data, analytics, logs", "2 copies, 1 jurisdiction, single-write"],
]
story.append(make_table(rto_rpo, col_widths=[20*mm, 20*mm, 25*mm, 55*mm, 45*mm]))
story.append(spacer(3))
story.append(body(
    "<b>Durability definition:</b> '3 copies, 2 jurisdictions, quorum 2-of-3' means data is replicated to 3 storage "
    "nodes across at least 2 legal jurisdictions, and writes require acknowledgement from 2 of 3 nodes before "
    "acknowledgement. This ensures no single jurisdiction's legal action can make data unavailable."
))
story.append(PageBreak())

# ═══════════════════════════════════════════════════════════════════════════════
# APPENDICES
# ═══════════════════════════════════════════════════════════════════════════════
story.append(layer_heading("APPENDICES", 0))
story.append(PageBreak())

# Appendix A — Financial Control Framework
story.append(layer_heading("Appendix A — Financial Control Framework (CFO)", 1))
story.append(body(
    "[L2] This appendix defines the financial control framework for SGTX, including fee schedule, reserve policy, "
    "non-custody attestation, and unit economics."
))
story.append(layer_heading("A.1 Fee Schedule", 2))
story.append(body(
    "<b>SGTX Platform Fee:</b> 1.5% of trade value, collected at settlement via the bank (non-custodial). The fee "
    "is locked at trade initiation (FeeLock) and collected by the bank during settlement — SGTX never receives "
    "the fee directly."
))
story.append(body(
    "<b>Optional service fees:</b> QC inspection (buyer-requested), lab tests (buyer-requested), customs broker "
    "services, logistics RFQ fees. These are quoted by the service provider and accepted by the trader; SGTX does "
    "not set these prices (non-marketplace principle)."
))
story.append(layer_heading("A.2 Reserve Policy", 2))
story.append(body(
    "[L0-17] <b>110% reserve rule:</b> If reserve metadata is maintained, it must be at least 110% backed. The "
    "constitutional layer sets the threshold; ZK attestation (Add-On 7) provides cryptographic evidence that the "
    "threshold is met."
))
story.append(body(
    "<b>Composition:</b> Reserves may consist of cash, bank guarantees, government bonds, or other approved instruments. "
    "The composition is jurisdiction-aware (each jurisdiction may have its own approved instrument list)."
))
story.append(body(
    "<b>ZK attestation:</b> Add-On 7 generates zero-knowledge proofs that the reserve ratio is ≥ 110% without "
    "revealing the exact amount or composition. This protects institutional privacy while proving compliance."
))
story.append(layer_heading("A.3 Non-Custody Attestation Template", 2))
story.append(body(
    "SGTX provides a standard non-custody attestation template for use in regulatory filings and bank onboarding: "
    "'SGTX Platform does not hold, receive, or transfer customer funds at any point in the trade lifecycle. All "
    "funds flow through connected banks and regulated payment service providers. SGTX orchestrates payment "
    "instructions but never becomes the settlement authority. The FeeLock mechanism locks the platform fee at "
    "trade initiation, but the fee is collected by the bank during settlement.'"
))
story.append(PageBreak())

# Appendix B — Regulatory & Legal
story.append(layer_heading("Appendix B — Regulatory & Legal", 1))
story.append(layer_heading("B.1 Regulatory Classification Matrix", 2))
story.append(body(
    "[L2] The Regulatory Classification Matrix maps SGTX functionality to licence classes per jurisdiction. "
    "The initial matrix covers Egypt; it is extensible to other jurisdictions via the Jurisdiction Capability Adapter."
))
reg_matrix = [
    ["Functionality", "Egypt Classification", "Required Licence", "Status"],
    ["Trade orchestration", "Service provider", "None (non-regulated)", "OPERATIONAL"],
    ["Payment instruction", "Payment service provider", "CBE registration (if applicable)", "LEGAL_AUTHORIZATION_REQUIRED"],
    ["Customs declaration", "Customs broker facilitation", "Broker licence (broker-side)", "OPERATIONAL"],
    ["Document issuance", "Digital document service", "ETA/CargoX integration", "CORE_READY"],
    ["Settlement orchestration", "Non-custodial orchestration", "Bank partnership", "LEGAL_AUTHORIZATION_REQUIRED"],
    ["AI advisory", "AI service provider", "None (advisory only)", "OPERATIONAL"],
]
story.append(make_table(reg_matrix, col_widths=[40*mm, 40*mm, 45*mm, 35*mm]))
story.append(layer_heading("B.2 Data-Residency Element Classification", 2))
story.append(body(
    "[L2] Data elements are classified by residency requirement: EGYPT_ONLY (must stay in Egypt), COUNTRY_ONLY "
    "(must stay in origin/destination country), REGIONAL (may flow within a region), APPROVED_CROSS_BORDER "
    "(may flow to approved jurisdictions), GLOBAL_ALLOWED (no restriction). The strictest applicable rule wins."
))
story.append(layer_heading("B.3 SAR/FIU Interface Notes", 2))
story.append(body(
    "[L2] SGTX maintains interface notes for Suspicious Activity Report (SAR) / Financial Intelligence Unit (FIU) "
    "reporting. The platform does not file SARs directly (that is the bank's responsibility), but it provides "
    "structured evidence packages that banks can use for SAR filing. The Add-On 17 (Piracy & Security Risk Engine) "
    "and Add-On 7 (ZK Proofs) support the evidence chain."
))
story.append(PageBreak())

# Appendix C — Operating Model
story.append(layer_heading("Appendix C — Operating Model", 1))
story.append(layer_heading("C.1 Platform Governance Authority RACI", 2))
raci = [
    ["Decision", "Responsible", "Accountable", "Consulted", "Informed"],
    ["Constitutional amendment", "Platform Governance Authority", "Constitutional Signatories (3-of-5)", "Legal, Compliance, Engineering", "All stakeholders"],
    ["Policy update (OPA)", "Policy Team", "Governance Authority", "Engineering, Compliance", "Operations"],
    ["WASM module update", "Engineering", "CTO", "Security, Governance", "Operations"],
    ["Integration activation", "Integration Team", "CTO", "Legal, Compliance", "Operations"],
    ["Incident response (SEV-0)", "On-call Engineer", "CTO", "Security, Legal, Comms", "All stakeholders"],
    ["Incident response (SEV-1)", "On-call Engineer", "Engineering Lead", "Security", "Operations"],
]
story.append(make_table(raci, col_widths=[35*mm, 30*mm, 35*mm, 35*mm, 25*mm]))
story.append(layer_heading("C.2 Multisig Policy", 2))
story.append(body(
    "[L2] <b>Standard multisig:</b> 2-of-3 for irreversible trade actions (USTN closure, contract lock, settlement release). "
    "<b>Constitutional multisig:</b> 3-of-5 for platform-level changes (policy amendment, WASM module update, integration activation). "
    "Signatories are identified by GTID and must use Qualified Electronic Signatures (QES)."
))
story.append(layer_heading("C.3 Change-Management Process", 2))
story.append(body(
    "[L2] WASM module and policy changes follow a 4-stage process: (1) Author (draft policy/module). "
    "(2) Review (security audit + legal review). (3) Approve (multisig 3-of-5). (4) Deploy (staged rollout: "
    "sandbox → production). Each stage is Loom-logged. Rollback is always possible for policies (previous version "
    "is retained); WASM modules are versioned with backward compatibility."
))
story.append(layer_heading("C.4 Incident Severity Model", 2))
incidents = [
    ["Severity", "Definition", "Response Time", "Escalation"],
    ["SEV-0", "Platform-wide outage or data breach", "Immediate (24/7)", "CTO + Legal + Comms + Board"],
    ["SEV-1", "Major feature failure affecting multiple trades", "1 hour", "Engineering Lead + CTO"],
    ["SEV-2", "Feature failure affecting single trade or tenant", "4 hours", "On-call Engineer"],
    ["SEV-3", "Minor bug with workaround", "24 hours", "Assigned Engineer"],
    ["SEV-4", "Cosmetic or enhancement request", "Next sprint", "Product Backlog"],
]
story.append(make_table(incidents, col_widths=[18*mm, 55*mm, 30*mm, 52*mm]))
story.append(PageBreak())

# Appendix D — Implementation Priority Framework
story.append(layer_heading("Appendix D — Implementation Priority Framework", 1))
story.append(body(
    "[L2] Implementation is organised into P0–P4 waves. These are dependency-driven, not calendar-driven. "
    "No contractual calendar claims are made — each wave is completed when its dependencies are satisfied."
))
waves = [
    ["Wave", "Scope", "Dependencies", "Status"],
    ["P0 — Core Trade Execution", "Trade, Contract, USTN, Governor, Event Spine, State Vector, Closure Policy", "None (foundation)", "CORE_READY"],
    ["P1 — Transport Engines", "Road, Air, Ocean Container, RoRo, Rail, Multimodal Orchestrator", "P0 complete", "CORE_READY"],
    ["P2 — Intelligence & Compliance (Add-Ons 1-8)", "GNN, Federated Learning, Causal Inference, Self-Healing, Pentest, PQC, ZK, Customs Bond", "P0 complete", "CORE_READY"],
    ["P3 — Operational Add-Ons (Add-Ons 9-18)", "Demurrage, Broker Liability, Valuation, Cold Chain, Inspection, Currency Risk, Gov Sandbox, FTA, Security, Compliance Calendar", "P0 + GRiRE (P4 foundation)", "CORE_READY"],
    ["P4 — Extended Functionality (Add-Ons 19-28)", "Cargo Insurance, Trade Finance, Back-to-Back LC, Force Majeure, Export Docs, Port/Terminal, Payment Guarantee, Demurrage Dispute, GRiRE", "P0 + P2 (for intelligence dependencies)", "CORE_READY"],
]
story.append(make_table(waves, col_widths=[45*mm, 55*mm, 40*mm, 25*mm]))
story.append(PageBreak())

# Appendix E — Historical Audit Trail
story.append(layer_heading("Appendix E — Full Historical Audit Trail (Immutable Annex)", 1))
story.append(body(
    "This annex preserves the full audit trail from v13.1 Part A (findings A-01 through A-24) and the v12.0 audit header. "
    "Nothing has been removed. The audit findings are the governing resolutions for all v14.0 architecture."
))
story.append(layer_heading("E.1 v13.1 Part A Audit Summary (A-01 through A-24)", 2))
audit_findings = [
    ["Finding", "Conflict", "Resolution (Governing)"],
    ["A-01", "Direct Government API Scope", "Four Egypt connectors (Nafeza, CargoX, ETA, CBE) are the initial reference set; worldwide adapter fabric is the extensibility layer."],
    ["A-02", "AI A4 Authority Language", "A4 is deterministic policy automation by Governor+OPA+WasmEdge; AI never has independent execution authority."],
    ["A-03", "Non-Custody vs Payment", "Non-custody is architectural; Bank Settlement Gateway orchestrates but never holds funds."],
    ["A-04", "Stablecoin/DeFi vs Bank Settlement", "DeFi is conditional, jurisdiction-permitted sub-rail; bank-authoritative settlement is canonical."],
    ["A-05", "Reserve Metadata vs Custody", "Reserve tables store attestations only; they do not create custody."],
    ["A-06", "Reserve Ratio Thresholds", "110% rule is constitutional; ZK attestation provides evidence. Both preserved."],
    ["A-07", "GNN Non-Marketplace", "Trust graph is relationship analytics for known parties; never discovers/recommends/ranks."],
    ["A-08", "Seven vs Twenty-Eight Add-Ons", "Original seven are historical reference; full 28-add-on catalogue is canonical."],
    ["A-09", "RoRo as First-Class", "RoRo is a first-class transport mode, not an ocean sub-mode."],
    ["A-10", "Egypt Nafeza Mode-Specific", "Mode-specific applicability architecture; not one generic maritime workflow."],
    ["A-11", "Closure Semantics", "7-condition closure; CLOSED_WITH_EXCEPTION for severity ≤2 only."],
    ["A-12", "USTN as Namespace", "USTN is universal reference; does not override external authorities."],
    ["A-13", "ISO 20022 as Output", "ISO 20022 is an integration output format, not canonical data."],
    ["A-14", "Egypt Data Localisation", "EGYPT_ONLY for specific elements; strictest applicable rule wins."],
    ["A-15", "Zero-Cost Clarified", "Institutional-cost scope: data sources are free; institutional costs (bank fees, broker fees, integration costs) are real."],
    ["A-16", "Marketplace Terminology", "SGTX is relationship-controlled orchestration, NOT a public marketplace."],
    ["A-17", "AI Explanations vs Decisions", "AI generates explanations; Governor makes authoritative decisions."],
    ["A-18", "Manual Fallback", "Manual fallback is governed: authenticated, attributable, timestamped, Loom-logged."],
    ["A-19", "Global Readiness Claims", "Use CORE_READY/PRODUCTION_CONNECTED vocabulary; never WORLDWIDE_INTEGRATED."],
    ["A-20", "Command vs Event", "Command (intent) ≠ Event (fact). Commands flow to Governor; Events append to Spine."],
    ["A-21", "Recovery vs Rollback", "Recovery restores state; never erases history. Loom is immutable."],
    ["A-22", "Proof-of-Reserves Wallet Examples", "Wallet/bank examples are verification-only; consistent with non-custody."],
    ["A-23", "Jurisdiction Examples", "Country-specific examples are illustrative configuration governed by active jurisdiction profile."],
    ["A-24", "Incomplete Change-Set", "Add-Ons 9-28 and Final Summary now fully integrated into v14.0."],
]
story.append(make_table(audit_findings, col_widths=[12*mm, 45*mm, 113*mm]))
story.append(PageBreak())

# Appendix F — Source Manifest
story.append(layer_heading("Appendix F — Source Manifest", 1))
story.append(body(
    "This document was produced from the following sources. SHA-256 hashes are computed over the extracted text content."
))
sources = [
    ["Source", "Type", "Lines", "SHA-256"],
    ["SGTX_PLATFORM_MASTER_BLUEPRINT_INTEGRATED_v12.0.docx", "Main Blueprint", "~76,122", "c263f527f3966dab01d3cffc87e7d2747d01c017ca7a786d1964f09018087d42"],
    ["sgtx add ons and modifications.rtf", "Change-Set", "~7,582", "87181d220df82a485485eec4b9896031910c79afa6332516ef2afac4682c5b72"],
    ["SGTX_v13.1_FINAL.docx", "Integrated Edition", "~47,216", "(computed from extracted text)"],
]
story.append(make_table(sources, col_widths=[60*mm, 30*mm, 20*mm, 60*mm]))
story.append(spacer(5))

# Change Log
story.append(layer_heading("Change Log v13.1 → v14.0", 1))
changelog = [
    ["Change", "Rationale"],
    ["Three-layer separation (L0/L1/L2)", "Separate immutable principles from mutable architecture from testable specs"],
    ["Over-claim elimination", "Replaced 'production-ready' with CORE_READY; 'complete' with 'specified'; 'zero-cost' with 'institutional-cost scope clarified'"],
    ["28-add-on status matrix", "Explicit deployment-state vocabulary for every add-on"],
    ["4-dimension external readiness", "TECHNICAL/LEGAL/OPERATIONAL/COMMERCIAL reported independently per connector"],
    ["Command/Event taxonomy formalized", "Command (intent) ≠ Event (fact) — enforced in API contract"],
    ["32-point constitution", "All 32 constitutional points listed explicitly with [L0] tags"],
    ["Audit trail preserved as annex", "A-01 through A-24 preserved verbatim as governing resolutions"],
    ["Dependency graph added", "Visual cross-reference of major components"],
    ["RTO/RPO with quorum definitions", "Explicit durability/quorum requirements per tier"],
    ["No calendar claims", "P0–P4 waves are dependency-driven, not date-driven"],
]
story.append(make_table(changelog, col_widths=[60*mm, 110*mm]))

# ═══════════════════════════════════════════════════════════════════════════════
# BUILD PDF
# ═══════════════════════════════════════════════════════════════════════════════
output_path = "/home/z/my-project/SGTX_v14.0_CLEAN_MASTER.pdf"

doc = TocDocTemplate(
    output_path,
    pagesize=A4,
    leftMargin=20*mm,
    rightMargin=20*mm,
    topMargin=25*mm,
    bottomMargin=20*mm,
    title="SGTX Platform Master Blueprint — Clean Master Edition v14.0",
    author="SGTX Master Blueprint Integration Engine",
    subject="Sovereign Governed Trade Execution Infrastructure",
    creator="SGTX Platform",
)

# Two page templates: Cover (no header/footer) + Body (with header/footer)
frame_cover = Frame(0, 0, A4[0], A4[1], leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0, id='cover')
frame_body = Frame(20*mm, 20*mm, 170*mm, 257*mm, leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0, id='body')
doc.addPageTemplates([
    PageTemplate(id='CoverPage', frames=frame_cover, onPage=cover_page),
    PageTemplate(id='BodyPage', frames=frame_body, onPage=header_footer),
])

doc.build(story)
print(f"✓ PDF generated: {output_path}")
print(f"  Size: {os.path.getsize(output_path) / 1024:.1f} KB")
