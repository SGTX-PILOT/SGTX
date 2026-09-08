// @ts-nocheck
/**
 * SGTX v17 §20.111 — Digital Signature Legality Engine
 * ===========================================================================
 *
 * Returns the legal status of digital signatures in a jurisdiction:
 *
 *   LEGALLY_EQUIVALENT — the digital signature is treated exactly the
 *                       same as a handwritten signature (e.g., EU QES).
 *   LEGALLY_VALID      — the digital signature is valid and enforceable
 *                       but may carry different evidentiary weight than
 *                       a handwritten signature (e.g., EU AES).
 *   EVIDENCE_ONLY      — the digital signature is admissible as
 *                       evidence in court but does not, by itself,
 *                       satisfy any signature requirement (e.g., US
 *                       E-Sign simple electronic signature).
 *   NOT_RECOGNIZED     — the jurisdiction does not recognise digital
 *                       signatures for the document type (e.g., certain
 *                       Egyptian real-estate deeds still require
 *                       handwritten + notarised signatures).
 *
 * Signature tiers (per eIDAS model, widely adopted globally):
 *
 *   SIMPLE     — Simple Electronic Signature (SES) — any data attached
 *                to a document to indicate intent (e.g., a typed name,
 *                a click-wrap "I agree", a basic e-sign platform).
 *   ADVANCED   — Advanced Electronic Signature (AES) — uniquely linked
 *                to the signer, identifies the signer, created using
 *                means under the signer's sole control, linked to the
 *                document so tampering is detectable.
 *   QUALIFIED  — Qualified Electronic Signature (QES) — AES + backed
 *                by a Qualified Certificate issued by a QTSP
 *                (Qualified Trust Service Provider) on a QSCD
 *                (Qualified Signature Creation Device). QES is
 *                legally equivalent to a handwritten signature
 *                across the entire EU (eIDAS Art. 25.2).
 *
 * The engine covers 11 jurisdictions (EG, EU member states treated
 * as one via eIDAS, US, UK, SA, AE, CN, JP, BR, IN, AU) plus a
 * fallback "OTHER" tier. For each jurisdiction + signature type pair,
 * it returns the legalStatus, legalBasis, evidenceValue, and any
 * jurisdiction-specific requirements (witness, notarisation,
 * apostille, etc.).
 *
 * All calls are pure (no DB / no network). The data lives in
 * LEGALITY_REGISTRY below — a hand-curated table built from the
 * laws in force as of 2026.
 * ===========================================================================
 */

// ============ §20.111 Types ============

export type SignatureType = "SIMPLE" | "ADVANCED" | "QUALIFIED";

export type LegalStatus =
  | "LEGALLY_EQUIVALENT"
  | "LEGALLY_VALID"
  | "EVIDENCE_ONLY"
  | "NOT_RECOGNIZED";

export type DocumentType =
  | "COMMERCIAL_CONTRACT"
  | "EMPLOYMENT_CONTRACT"
  | "REAL_ESTATE_DEED"
  | "FINANCIAL_AGREEMENT"
  | "CUSTOMS_DECLARATION"
  | "GOVERNMENT_FILING"
  | "POWER_OF_ATTORNEY"
  | "WILL"
  | "BILL_OF_LADING"
  | "INVOICE"
  | "LC"
  | "OTHER";

export interface SignatureLegality {
  country: string;
  signatureType: SignatureType;
  legalStatus: LegalStatus;
  evidenceValue: string;
  legalBasis: string;
  requirements: string[];
  notes: string;
  crossBorderRecognition: CrossBorderRecognition[];
}

export interface CrossBorderRecognition {
  jurisdiction: string;
  recognitionLevel: "FULL" | "PARTIAL" | "BILATERAL" | "NONE";
  notes: string;
}

export interface SignatureValidationResult {
  valid: boolean;
  meetsLegalStandard: boolean;
  jurisdictionSpecific: string[];
  signatureType: SignatureType;
  country: string;
  warnings: string[];
}

export interface SignatureRequirements {
  country: string;
  documentType: DocumentType;
  requiredSignatureType: SignatureType;
  witnessRequired: boolean;
  notarizationRequired: boolean;
  apostilleRequired: boolean;
  additionalRequirements: string[];
  notes: string;
}

export interface CountrySignatureLaw {
  country: string;
  law: string;
  article: string;
  qesLegalStatus: LegalStatus;
  qtspCount: number;
  qtspExamples: string[];
  requirements: string[];
  crossBorderRecognition: CrossBorderRecognition[];
}

// ============ §20.111 Legality Registry ============
// Maps (country, signatureType) → legality.

interface LegalityEntry {
  legalStatus: LegalStatus;
  evidenceValue: string;
  legalBasis: string;
  requirements: string[];
  notes: string;
}

const LEGALITY_REGISTRY: Record<string, Record<SignatureType, LegalityEntry>> = {
  // ============ Egypt — Law 15/2004 + 181/2008 + PDPL 2020 ============
  EG: {
    SIMPLE: {
      legalStatus: "EVIDENCE_ONLY",
      evidenceValue:
        "Admissible as evidence but does not satisfy statutory signature requirements for most official documents.",
      legalBasis: "Egypt Law 15/2004 on E-Signature + Executive Regulation 182/2009",
      requirements: [
        "Signer identity must be attributable (art. 6)",
        "Signature must be attached to or logically associated with the document",
      ],
      notes:
        "Egypt does not have a fully-developed eIDAS-equivalent. SIMPLE signatures (typed name, click-wrap) are evidence-only.",
    },
    ADVANCED: {
      legalStatus: "LEGALLY_VALID",
      evidenceValue:
        "Valid and enforceable for commercial contracts. Article 7 of Law 15/2004 recognises advanced electronic signatures.",
      legalBasis: "Egypt Law 15/2004 Art. 7 + Executive Regulation 182/2009",
      requirements: [
        "Uniquely linked to the signer (art. 2)",
        "Capable of identifying the signer",
        "Created using means under the signer's sole control",
        "Linked to the document so any subsequent change is detectable",
        "Issuer must be accredited by ITIDA (Information Technology Industry Development Agency)",
      ],
      notes:
        "ITIDA is the Egyptian accreditation body for TSPs. Examples of accredited providers: EgyptTrust, Ein Sha'at (Misr for Central Clearing).",
    },
    QUALIFIED: {
      legalStatus: "LEGALLY_EQUIVALENT",
      evidenceValue:
        "Legally equivalent to a handwritten signature for most commercial contracts. Article 16 of Law 15/2004.",
      legalBasis:
        "Egypt Law 15/2004 Art. 16 + Executive Regulation 182/2009 + ITIDA accreditation regime",
      requirements: [
        "Issued by an ITIDA-accredited Qualified Trust Service Provider (QTSP)",
        "Backed by a Qualified Certificate",
        "Created on a Secure Signature Creation Device (SSCD)",
        "Subject must complete ITIDA-verified identity proofing (national ID + biometric)",
        "Certificate validity ≤ 5 years",
      ],
      notes:
        "QES is mandatory for certain government filings (e.g., customs declarations via Nafeza, e-invoice via ETA). For real-estate deeds, handwritten + notarisation is still required.",
    },
  },

  // ============ EU — eIDAS 910/2014 ============
  EU: {
    SIMPLE: {
      legalStatus: "EVIDENCE_ONLY",
      evidenceValue:
        "Admissible as evidence in legal proceedings (eIDAS Art. 25(1)). Cannot by itself satisfy a statutory signature requirement.",
      legalBasis: "eIDAS Regulation (EU) 910/2014 Art. 25(1)",
      requirements: [
        "Must be attributable to the signer",
        "Subject to free assessment by national courts (eIDAS Art. 25(4))",
      ],
      notes:
        "eIDAS explicitly forbids denying legal effect solely because it is in electronic form (Art. 25(1)).",
    },
    ADVANCED: {
      legalStatus: "LEGALLY_VALID",
      evidenceValue:
        "Valid and enforceable. Carries higher evidentiary weight than SES but is not equivalent to a handwritten signature.",
      legalBasis: "eIDAS Regulation (EU) 910/2014 Art. 26",
      requirements: [
        "Uniquely linked to the signer (Art. 26(a))",
        "Capable of identifying the signer (Art. 26(b))",
        "Created using means under the signer's sole control (Art. 26(c))",
        "Linked to the document so any subsequent change is detectable (Art. 26(d))",
      ],
      notes:
        "Used in most EU commercial contracts where QES is not specifically required. Examples: DocuSign EU, Adobe Sign EU, RSign.",
    },
    QUALIFIED: {
      legalStatus: "LEGALLY_EQUIVALENT",
      evidenceValue:
        "Legally equivalent to a handwritten signature across the entire EU (eIDAS Art. 25(2)). Cannot be denied legal effect.",
      legalBasis: "eIDAS Regulation (EU) 910/2014 Art. 25(2) + Art. 26 + Art. 36",
      requirements: [
        "Issued by a Qualified Trust Service Provider (QTSP) listed in the EU Trusted List",
        "Backed by a Qualified Certificate (Art. 56)",
        "Created on a Qualified Signature Creation Device (QSCD) (Art. 27)",
        "QTSP must comply with Art. 24-28 (liability, security, mutual recognition)",
        "Subject must undergo identity proofing per Art. 24(1)(a)",
        "Certificate validity ≤ 5 years",
      ],
      notes:
        "Mandatory for certain EU document types: eProcurement (Directive 2014/24/EU), some real-estate conveyances (member state law), court filings (member state law). The EU Trusted List (https://ec.europa.eu/tools/eu-trusted-list) lists all accredited QTSPs.",
    },
  },

  // ============ United States — ESIGN + UETA ============
  US: {
    SIMPLE: {
      legalStatus: "LEGALLY_VALID",
      evidenceValue:
        "Legally valid for most commercial transactions under ESIGN Act + state UETA. Cannot be denied legal effect solely because it is electronic.",
      legalBasis:
        "ESIGN Act 15 U.S.C. §7001 + Uniform Electronic Transactions Act (UETA, adopted by 47 states)",
      requirements: [
        "Signer must consent to do business electronically",
        "Signer must be capable of retaining the electronic record",
        "Signature must be attributable to the signer (UETA §9)",
      ],
      notes:
        "The US does not distinguish between SES/AES/QES — a 'simple' e-signature is generally legally valid for commercial contracts. The DocuSign / Adobe Sign / HelloSign platforms all use SIMPLE signatures under US law.",
    },
    ADVANCED: {
      legalStatus: "LEGALLY_VALID",
      evidenceValue:
        "Legally valid + carries stronger evidentiary weight than SIMPLE (audit trail, signer authentication).",
      legalBasis: "ESIGN Act + UETA + Common law of evidence",
      requirements: [
        "Same as SIMPLE +",
        "Robust signer authentication (KBA, ID verification, or biometric)",
        "Tamper-evident audit trail (timestamp + IP + sequence of actions)",
      ],
      notes:
        "Used for higher-value contracts where the parties want stronger evidence. Examples: DocuSign with KBA, Adobe Sign with ID verification.",
    },
    QUALIFIED: {
      legalStatus: "LEGALLY_VALID",
      evidenceValue:
        "Legally valid. The US does not have a QES-equivalent concept; the closest is a notarised electronic signature (electronic notarisation + tamper-evident audit).",
      legalBasis:
        "ESIGN Act + UETA + Uniform Real Property Electronic Recording Act (URPERA) + state e-notarisation laws",
      requirements: [
        "Same as ADVANCED +",
        "For real-estate: URPERA-compliant electronic notarisation",
        "For high-stakes: notary public + journal + tamper-evident seal",
        "Remote Online Notarisation (RON) permitted in 40+ states (2024)",
      ],
      notes:
        "US recognises EU QES as a valid signature (Hague Evidence Convention + comity), but does not grant it special status over an AES.",
    },
  },

  // ============ United Kingdom — Electronic Communications Act 2000 ============
  UK: {
    SIMPLE: {
      legalStatus: "LEGALLY_VALID",
      evidenceValue:
        "Legally valid for most commercial contracts (Electronic Communications Act 2000 s.7).",
      legalBasis: "Electronic Communications Act 2000 s.7 + Land Registration Act 2002",
      requirements: [
        "Signature must be attributable to the signer",
        "Signer must intend to authenticate the document",
      ],
      notes:
        "UK follows a similar approach to the US — SIMPLE e-signatures are generally valid for commercial contracts.",
    },
    ADVANCED: {
      legalStatus: "LEGALLY_VALID",
      evidenceValue:
        "Legally valid + carries stronger evidentiary weight (audit trail + signer authentication).",
      legalBasis: "Electronic Communications Act 2000 s.7 + s.8",
      requirements: [
        "Same as SIMPLE +",
        "Tamper-evident audit trail",
        "Signer authentication (KBA or ID)",
      ],
      notes:
        "Post-Brexit, the UK retains eIDAS-equivalent protections via the Electronic Communications Act 2000 (as amended).",
    },
    QUALIFIED: {
      legalStatus: "LEGALLY_EQUIVALENT",
      evidenceValue:
        "Legally equivalent to a handwritten signature. Post-Brexit, the UK retains eIDAS-equivalent QES via retained EU law + UK Trusted List.",
      legalBasis:
        "Electronic Communications Act 2000 + Retained eIDAS Regulation + UK Trusted List (post-Brexit)",
      requirements: [
        "Issued by a UK-accredited QTSP on the UK Trusted List",
        "Backed by a Qualified Certificate",
        "Created on a QSCD",
        "Subject undergoes identity proofing per UK GDPR + eIDAS",
      ],
      notes:
        "UK QTSPs include: Adobe Sign UK, DocuSign UK, Entrust UK, Verisign UK. The UK Trusted List is maintained by the FCA + BEIS.",
    },
  },

  // ============ Saudi Arabia — e-Transactions Law 2007 + PDPL 2023 ============
  SA: {
    SIMPLE: {
      legalStatus: "EVIDENCE_ONLY",
      evidenceValue:
        "Admissible as evidence but does not satisfy statutory signature requirements for official documents.",
      legalBasis: "Saudi e-Transactions Law 2007 (Royal Decree M/18) + Implementing Regulations",
      requirements: [
        "Signer identity must be attributable",
        "Signature must be logically associated with the document",
      ],
      notes:
        "The Saudi e-Transactions Law broadly follows the UNCITRAL Model Law on Electronic Signatures (2001).",
    },
    ADVANCED: {
      legalStatus: "LEGALLY_VALID",
      evidenceValue:
        "Legally valid for commercial contracts (e-Transactions Law Art. 9-10).",
      legalBasis: "Saudi e-Transactions Law 2007 Art. 9-10 + Implementing Regulations",
      requirements: [
        "Uniquely linked to the signer",
        "Capable of identifying the signer",
        "Created using means under the signer's sole control",
        "Linked to the document so any change is detectable",
        "Issuer must be accredited by the Saudi Communications and Space Commission (CST)",
      ],
      notes:
        "CST (formerly CITC) is the accreditation body for Saudi TSPs.",
    },
    QUALIFIED: {
      legalStatus: "LEGALLY_EQUIVALENT",
      evidenceValue:
        "Legally equivalent to a handwritten signature (e-Transactions Law Art. 10 + Implementing Regulations).",
      legalBasis:
        "Saudi e-Transactions Law 2007 Art. 10 + Implementing Regulations + CST accreditation regime",
      requirements: [
        "Issued by a CST-accredited QTSP",
        "Backed by a Qualified Certificate",
        "Created on a Secure Signature Creation Device",
        "Subject undergoes Nafath/Absher identity proofing (national ID + biometric)",
      ],
      notes:
        "Mandatory for Saudi government filings (Absher, Nafath, Etimad portal). Saudi QES is recognised across GCC via the GCC e-Transactions Framework.",
    },
  },

  // ============ UAE — Federal Law 1/2006 + 45/2021 ============
  AE: {
    SIMPLE: {
      legalStatus: "EVIDENCE_ONLY",
      evidenceValue:
        "Admissible as evidence but does not satisfy statutory signature requirements for official documents.",
      legalBasis: "UAE Federal Law 1/2006 on e-Transactions + Federal Law 45/2021 (PDPL)",
      requirements: [
        "Signer identity must be attributable",
        "Signature must be logically associated with the document",
      ],
      notes:
        "UAE follows the UNCITRAL Model Law on Electronic Signatures (2001).",
    },
    ADVANCED: {
      legalStatus: "LEGALLY_VALID",
      evidenceValue:
        "Legally valid for commercial contracts (Federal Law 1/2006 Art. 14-15).",
      legalBasis: "UAE Federal Law 1/2006 Art. 14-15 + 45/2021 (PDPL)",
      requirements: [
        "Uniquely linked to the signer",
        "Capable of identifying the signer",
        "Created using means under the signer's sole control",
        "Linked to the document so any change is detectable",
        "Issuer must be accredited by TDRA (Telecommunications and Digital Government Regulatory Authority)",
      ],
      notes:
        "TDRA is the accreditation body for UAE TSPs. DIFC and ADGM free-zones have their own e-Transactions regimes (DIFC Law 3/2019).",
    },
    QUALIFIED: {
      legalStatus: "LEGALLY_EQUIVALENT",
      evidenceValue:
        "Legally equivalent to a handwritten signature (Federal Law 1/2006 Art. 15-16).",
      legalBasis:
        "UAE Federal Law 1/2006 Art. 15-16 + TDRA accreditation regime + Federal Law 45/2021 (PDPL)",
      requirements: [
        "Issued by a TDRA-accredited QTSP",
        "Backed by a Qualified Certificate",
        "Created on a Secure Signature Creation Device",
        "Subject undergoes UAE Pass identity proofing (Emirates ID + biometric)",
      ],
      notes:
        "Mandatory for UAE federal government filings (UAE Pass, Ministry of Justice e-filing). DIFC + ADGM have their own QTSP accreditation.",
    },
  },

  // ============ China — Electronic Signature Law 2005 + PIPL 2021 ============
  CN: {
    SIMPLE: {
      legalStatus: "EVIDENCE_ONLY",
      evidenceValue:
        "Admissible as evidence but does not satisfy statutory signature requirements.",
      legalBasis:
        "PRC Electronic Signature Law 2005 (effective 2005-04-01) + Civil Code 2020",
      requirements: [
        "Signer identity must be attributable",
        "Signature must be logically associated with the document",
      ],
      notes:
        "China's Electronic Signature Law broadly follows the UNCITRAL Model Law.",
    },
    ADVANCED: {
      legalStatus: "LEGALLY_VALID",
      evidenceValue:
        "Legally valid for commercial contracts (Electronic Signature Law Art. 13-14).",
      legalBasis: "PRC Electronic Signature Law 2005 Art. 13-14",
      requirements: [
        "Uniquely linked to the signer (art. 13)",
        "Capable of identifying the signer",
        "Created using means under the signer's sole control",
        "Linked to the document so any change is detectable",
        "Issuer must be CA-accredited by the Office of State Commercial Cryptography (OSCCA)",
      ],
      notes:
        "OSCCA (also known as SSCA) is the accreditation body for Chinese CAs. Major providers: BJCA, GFCA, SHECA, Itrus China.",
    },
    QUALIFIED: {
      legalStatus: "LEGALLY_EQUIVALENT",
      evidenceValue:
        "Legally equivalent to a handwritten signature (Electronic Signature Law Art. 14).",
      legalBasis:
        "PRC Electronic Signature Law 2005 Art. 14 + OSCCA accreditation regime + Cryptography Law 2020",
      requirements: [
        "Issued by an OSCCA-accredited CA (Electronic Certification Service Authority)",
        "Backed by a Qualified Certificate (电子认证证书)",
        "Created using SM2/SM3 cryptography (Chinese national crypto standards)",
        "Subject undergoes face-to-face or video identity proofing per CA policy",
      ],
      notes:
        "China requires the use of SM2 (asymmetric) / SM3 (hash) cryptography for any QES intended for government filings. OSCCA-accredited CAs must use SM2/SM3.",
    },
  },

  // ============ Japan — e-Document Law + e-Signature Law ============
  JP: {
    SIMPLE: {
      legalStatus: "EVIDENCE_ONLY",
      evidenceValue:
        "Admissible as evidence but does not satisfy statutory signature requirements for official documents.",
      legalBasis: "Act on Electronic Signatures and Certification Business 2000 (Act 102) + Civil Code Art. 95",
      requirements: [
        "Signer identity must be attributable",
        "Signature must be logically associated with the document",
      ],
      notes:
        "Japan follows the UNCITRAL Model Law on Electronic Signatures (2001).",
    },
    ADVANCED: {
      legalStatus: "LEGALLY_VALID",
      evidenceValue:
        "Legally valid for commercial contracts (e-Signature Law Art. 3).",
      legalBasis: "Act on Electronic Signatures and Certification Business 2000 Art. 3",
      requirements: [
        "Uniquely linked to the signer",
        "Capable of identifying the signer",
        "Created using means under the signer's sole control",
        "Linked to the document so any change is detectable",
      ],
      notes:
        "Used in most commercial contracts. Major providers: DocuSign Japan, Adobe Sign Japan, GMO GlobalSign Japan.",
    },
    QUALIFIED: {
      legalStatus: "LEGALLY_EQUIVALENT",
      evidenceValue:
        "Legally equivalent to a handwritten signature + carries a presumption of authenticity (e-Signature Law Art. 3).",
      legalBasis:
        "Act on Electronic Signatures and Certification Business 2000 Art. 3 + Designated Certification Business regime",
      requirements: [
        "Issued by a Designated Certification Business operator (METI-accredited)",
        "Backed by a Qualified Certificate",
        "Created on a Secure Signature Creation Device",
        "Subject undergoes identity proofing (in-person or via My Number card)",
      ],
      notes:
        "Japanese QES enjoys a presumption of authenticity — the burden of proof shifts to the party denying the signature. This is stronger than eIDAS.",
    },
  },

  // ============ Brazil — MP 2.200-2/2001 + LGPD ============
  BR: {
    SIMPLE: {
      legalStatus: "EVIDENCE_ONLY",
      evidenceValue:
        "Admissible as evidence but does not satisfy statutory signature requirements.",
      legalBasis: "Brazilian Civil Code 2002 + Provisional Measure 2.200-2/2001",
      requirements: [
        "Signer identity must be attributable",
        "Signature must be logically associated with the document",
      ],
      notes:
        "Brazil's Provisional Measure 2.200-2/2001 is the legal basis for e-signatures.",
    },
    ADVANCED: {
      legalStatus: "LEGALLY_VALID",
      evidenceValue:
        "Legally valid for commercial contracts (MP 2.200-2/2001 Art. 10, §1).",
      legalBasis: "MP 2.200-2/2001 Art. 10, §1 + LGPD (Lei 13.709/2018)",
      requirements: [
        "Uniquely linked to the signer",
        "Capable of identifying the signer",
        "Created using means under the signer's sole control",
        "Linked to the document so any change is detectable",
      ],
      notes:
        "Used in most commercial contracts. Major providers: DocuSign BR, D4Sign, Clicksign.",
    },
    QUALIFIED: {
      legalStatus: "LEGALLY_EQUIVALENT",
      evidenceValue:
        "Legally equivalent to a handwritten signature (MP 2.200-2/2001 Art. 10, §2). Carries presumption of authenticity.",
      legalBasis: "MP 2.200-2/2001 Art. 10, §2 + ITI accreditation regime",
      requirements: [
        "Issued by an ITI-accredited CA (Instituto Nacional de Tecnologia da Informação)",
        "Backed by a Qualified Certificate (ICP-Brasil)",
        "Created on a Secure Signature Creation Device",
        "Subject undergoes in-person or video identity proofing per ICP-Brasil policy",
      ],
      notes:
        "ICP-Brasil is the Brazilian QES framework, administered by ITI. QES is mandatory for certain government filings (e.g., e-Proc, Sped).",
    },
  },

  // ============ India — IT Act 2000 + 2018 Amendment ============
  IN: {
    SIMPLE: {
      legalStatus: "EVIDENCE_ONLY",
      evidenceValue:
        "Admissible as evidence but does not satisfy statutory signature requirements.",
      legalBasis: "Information Technology Act 2000 + Indian Evidence Act 1872 (as amended)",
      requirements: [
        "Signer identity must be attributable",
        "Signature must be logically associated with the document",
      ],
      notes:
        "India's IT Act 2000 follows the UNCITRAL Model Law on Electronic Commerce (1996).",
    },
    ADVANCED: {
      legalStatus: "LEGALLY_VALID",
      evidenceValue:
        "Legally valid for commercial contracts (IT Act 2000 §35).",
      legalBasis: "Information Technology Act 2000 §35 + 2018 Amendment",
      requirements: [
        "Uniquely linked to the signer",
        "Capable of identifying the signer",
        "Created using means under the signer's sole control",
        "Linked to the document so any change is detectable",
      ],
      notes:
        "Used in most commercial contracts. Major providers: eMudhra, Capricorn, Sify, NSDL e-Governance.",
    },
    QUALIFIED: {
      legalStatus: "LEGALLY_EQUIVALENT",
      evidenceValue:
        "Legally equivalent to a handwritten signature (IT Act 2000 §35 + §5(2)).",
      legalBasis:
        "Information Technology Act 2000 §35 + §5(2) + CCA accreditation regime",
      requirements: [
        "Issued by a CCA-accredited CA (Controller of Certifying Authorities)",
        "Backed by a Digital Signature Certificate (DSC) — Class 3",
        "Created on a Secure Signature Creation Device (FIPS 140-2 token)",
        "Subject undergoes in-person or video identity proofing per CCA guidelines",
      ],
      notes:
        "India distinguishes Class 2 (Aadhaar-based e-KYC) and Class 3 (in-person verification) DSCs. Class 3 is mandatory for MCA filings + GST filings + e-tendering.",
    },
  },

  // ============ Australia — Electronic Transactions Act 1999 ============
  AU: {
    SIMPLE: {
      legalStatus: "LEGALLY_VALID",
      evidenceValue:
        "Legally valid for most commercial transactions (Electronic Transactions Act 1999 s.10).",
      legalBasis: "Electronic Transactions Act 1999 (Cth) + state equivalents",
      requirements: [
        "Signer must consent to the electronic method",
        "Signature must be reliable + attributable to the signer",
        "Signer must be capable of retaining the electronic record",
      ],
      notes:
        "Australia follows the UNCITRAL Model Law on Electronic Commerce (1996). No statutory distinction between SES/AES/QES.",
    },
    ADVANCED: {
      legalStatus: "LEGALLY_VALID",
      evidenceValue:
        "Legally valid + carries stronger evidentiary weight (audit trail + signer authentication).",
      legalBasis: "Electronic Transactions Act 1999 s.10 + Evidence Act 1995 s.69",
      requirements: [
        "Same as SIMPLE +",
        "Robust signer authentication (KBA, ID, or biometric)",
        "Tamper-evident audit trail",
      ],
      notes:
        "Major providers: DocuSign AU, Adobe Sign AU, SignNow AU.",
    },
    QUALIFIED: {
      legalStatus: "LEGALLY_VALID",
      evidenceValue:
        "Legally valid. Australia does not have a QES-equivalent statutory category; the closest is an accredited gateway operator under the Trusted Digital Identity Framework (TDIF).",
      legalBasis:
        "Electronic Transactions Act 1999 + Trusted Digital Identity Framework (TDIF) + myGovID",
      requirements: [
        "Issued by a TDIF-accredited identity provider",
        "Backed by a Verified Credential (myGovID or equivalent)",
        "Created on a tamper-evident device",
        "Subject undergoes TDIF IP1 / IP2 / IP3 identity proofing",
      ],
      notes:
        "Australian government uses myGovID (TDIF-accredited) for digital signatures on government filings. Commercial QES-equivalent is provided by gateway operators.",
    },
  },

  // ============ Fallback for jurisdictions not in the registry ============
  OTHER: {
    SIMPLE: {
      legalStatus: "EVIDENCE_ONLY",
      evidenceValue:
        "Unknown jurisdiction — admissible as evidence only. Consult local counsel.",
      legalBasis: "UNCITRAL Model Law on Electronic Signatures (2001) — if adopted",
      requirements: [
        "Signer identity must be attributable",
        "Signature must be logically associated with the document",
      ],
      notes:
        "The jurisdiction is not in the SGTX legality registry. The UNCITRAL Model Law on Electronic Signatures (2001) has been adopted by ~30 countries — consult local counsel for the specific legality status.",
    },
    ADVANCED: {
      legalStatus: "EVIDENCE_ONLY",
      evidenceValue:
        "Unknown jurisdiction — admissible as evidence only. Consult local counsel.",
      legalBasis: "UNCITRAL Model Law on Electronic Signatures (2001) — if adopted",
      requirements: [
        "Uniquely linked to the signer",
        "Capable of identifying the signer",
        "Created using means under the signer's sole control",
        "Linked to the document so any change is detectable",
      ],
      notes:
        "The jurisdiction is not in the SGTX legality registry. Consult local counsel.",
    },
    QUALIFIED: {
      legalStatus: "EVIDENCE_ONLY",
      evidenceValue:
        "Unknown jurisdiction — admissible as evidence only. Consult local counsel.",
      legalBasis: "UNCITRAL Model Law on Electronic Signatures (2001) — if adopted",
      requirements: [
        "Issued by an accredited QTSP",
        "Backed by a Qualified Certificate",
        "Created on a Secure Signature Creation Device",
        "Subject undergoes identity proofing per local accreditation regime",
      ],
      notes:
        "The jurisdiction is not in the SGTX legality registry. Consult local counsel.",
    },
  },
};

// ============ §20.111 Cross-Border Recognition ============
// Maps (country, targetJurisdiction) → recognition level.

interface CrossBorderEntry {
  jurisdiction: string;
  recognitionLevel: "FULL" | "PARTIAL" | "BILATERAL" | "NONE";
  notes: string;
}

const CROSS_BORDER_REGISTRY: Record<string, CrossBorderEntry[]> = {
  EG: [
    { jurisdiction: "EU", recognitionLevel: "PARTIAL", notes: "EU does not recognise Egyptian QES on its Trusted List, but Egyptian signatures are admissible as evidence." },
    { jurisdiction: "GCC", recognitionLevel: "BILATERAL", notes: "Bilateral mutual recognition under the GCC e-Transactions Framework." },
    { jurisdiction: "AU", recognitionLevel: "PARTIAL", notes: "Australia recognises Egyptian e-signatures as evidence under ETA 1999." },
  ],
  EU: [
    { jurisdiction: "EU", recognitionLevel: "FULL", notes: "Full mutual recognition across all EU member states (eIDAS Art. 25(2))." },
    { jurisdiction: "JP", recognitionLevel: "BILATERAL", notes: "EU-Japan Mutual Recognition Arrangement (MRA) on e-signatures (2019)." },
    { jurisdiction: "UK", recognitionLevel: "FULL", notes: "Post-Brexit, the UK retains eIDAS-equivalent protections via retained EU law." },
    { jurisdiction: "SG", recognitionLevel: "BILATERAL", notes: "EU-Singapore Digital Trade Agreement (2025) includes e-signature mutual recognition." },
    { jurisdiction: "US", recognitionLevel: "PARTIAL", notes: "US recognises EU QES as a valid signature (comity) but does not grant it special status." },
  ],
  US: [
    { jurisdiction: "EU", recognitionLevel: "PARTIAL", notes: "US signatures are admissible as evidence in EU courts but not QES-equivalent." },
    { jurisdiction: "UK", recognitionLevel: "FULL", notes: "US-UK mutual recognition under the Electronic Communications Act 2000 + ESIGN." },
    { jurisdiction: "CA", recognitionLevel: "FULL", notes: "US-Canada PIPEDA + ESIGN mutual recognition." },
    { jurisdiction: "MX", recognitionLevel: "FULL", notes: "USMCA Chapter 19 (Digital Trade) — mutual recognition of e-signatures." },
  ],
  UK: [
    { jurisdiction: "EU", recognitionLevel: "PARTIAL", notes: "Post-Brexit, the UK is no longer on the EU Trusted List but eIDAS-equivalent protections are retained." },
    { jurisdiction: "US", recognitionLevel: "FULL", notes: "UK-US mutual recognition under ECA 2000 + ESIGN." },
    { jurisdiction: "AU", recognitionLevel: "FULL", notes: "UK-Australia mutual recognition under ECA 2000 + ETA 1999." },
  ],
  SA: [
    { jurisdiction: "GCC", recognitionLevel: "FULL", notes: "Full mutual recognition under the GCC e-Transactions Framework." },
    { jurisdiction: "EU", recognitionLevel: "PARTIAL", notes: "Saudi signatures are admissible as evidence in EU courts but not QES-equivalent." },
  ],
  AE: [
    { jurisdiction: "GCC", recognitionLevel: "FULL", notes: "Full mutual recognition under the GCC e-Transactions Framework." },
    { jurisdiction: "EU", recognitionLevel: "PARTIAL", notes: "UAE signatures are admissible as evidence in EU courts but not QES-equivalent. DIFC and ADGM signatures follow English law and are recognised in UK courts." },
  ],
  CN: [
    { jurisdiction: "EU", recognitionLevel: "PARTIAL", notes: "Chinese e-signatures are admissible as evidence in EU courts but not QES-equivalent (no MRA in place)." },
    { jurisdiction: "AU", recognitionLevel: "PARTIAL", notes: "Chinese e-signatures are admissible as evidence in Australian courts but not QES-equivalent." },
  ],
  JP: [
    { jurisdiction: "EU", recognitionLevel: "BILATERAL", notes: "EU-Japan Mutual Recognition Arrangement (MRA) on e-signatures (2019)." },
    { jurisdiction: "US", recognitionLevel: "PARTIAL", notes: "Japanese e-signatures are admissible as evidence in US courts but not QES-equivalent." },
  ],
  BR: [
    { jurisdiction: "EU", recognitionLevel: "PARTIAL", notes: "Brazilian ICP-Brasil signatures are admissible as evidence in EU courts but not QES-equivalent." },
    { jurisdiction: "US", recognitionLevel: "PARTIAL", notes: "Brazilian signatures are admissible as evidence in US courts but not QES-equivalent." },
  ],
  IN: [
    { jurisdiction: "EU", recognitionLevel: "PARTIAL", notes: "Indian DSCs are admissible as evidence in EU courts but not QES-equivalent." },
    { jurisdiction: "UK", recognitionLevel: "PARTIAL", notes: "Indian DSCs are admissible as evidence in UK courts but not QES-equivalent." },
  ],
  AU: [
    { jurisdiction: "EU", recognitionLevel: "PARTIAL", notes: "Australian signatures are admissible as evidence in EU courts but not QES-equivalent." },
    { jurisdiction: "UK", recognitionLevel: "FULL", notes: "Australia-UK mutual recognition under ECA 2000 + ETA 1999." },
  ],
};

// ============ §20.111 Document-Type Requirements Registry ============
// Maps (country, documentType) → requiredSignatureType + witness/notary/apostille.

interface DocRequirementEntry {
  requiredSignatureType: SignatureType;
  witnessRequired: boolean;
  notarizationRequired: boolean;
  apostilleRequired: boolean;
  additionalRequirements: string[];
  notes: string;
}

const DOC_REQUIREMENTS_REGISTRY: Record<string, Partial<Record<DocumentType, DocRequirementEntry>>> = {
  EG: {
    COMMERCIAL_CONTRACT: {
      requiredSignatureType: "ADVANCED",
      witnessRequired: false,
      notarizationRequired: false,
      apostilleRequired: false,
      additionalRequirements: [],
      notes: "Advanced e-signature sufficient for most commercial contracts under Law 15/2004.",
    },
    REAL_ESTATE_DEED: {
      requiredSignatureType: "QUALIFIED",
      witnessRequired: true,
      notarizationRequired: true,
      apostilleRequired: true,
      additionalRequirements: ["Handwritten signature of the notary public", "Real-estate registry stamp"],
      notes: "Real-estate deeds require handwritten + notarised signatures. QES is not accepted for the deed itself (only for the supporting contracts).",
    },
    FINANCIAL_AGREEMENT: {
      requiredSignatureType: "QUALIFIED",
      witnessRequired: false,
      notarizationRequired: false,
      apostilleRequired: false,
      additionalRequirements: ["Bank-issued QES certificate", "CBE circular 1820/2021 compliance"],
      notes: "QES required for financial agreements under CBE circular 1820/2021.",
    },
    CUSTOMS_DECLARATION: {
      requiredSignatureType: "QUALIFIED",
      witnessRequired: false,
      notarizationRequired: false,
      apostilleRequired: false,
      additionalRequirements: ["Nafeza ACI portal-issued QES"],
      notes: "QES mandatory for customs declarations via the Nafeza ACI portal.",
    },
    GOVERNMENT_FILING: {
      requiredSignatureType: "QUALIFIED",
      witnessRequired: false,
      notarizationRequired: false,
      apostilleRequired: false,
      additionalRequirements: ["GOEIC-registered QES"],
      notes: "QES mandatory for government filings (GOEIC, ETA, Nafeza).",
    },
    INVOICE: {
      requiredSignatureType: "QUALIFIED",
      witnessRequired: false,
      notarizationRequired: false,
      apostilleRequired: false,
      additionalRequirements: ["ETA e-Invoice portal-issued QES"],
      notes: "QES mandatory for e-invoices via the Egyptian Tax Authority portal.",
    },
    LC: {
      requiredSignatureType: "QUALIFIED",
      witnessRequired: false,
      notarizationRequired: false,
      apostilleRequired: false,
      additionalRequirements: ["Bank-issued QES certificate"],
      notes: "QES required for Letter of Credit documentation under CBE LC operations circular.",
    },
    POWER_OF_ATTORNEY: {
      requiredSignatureType: "QUALIFIED",
      witnessRequired: true,
      notarizationRequired: true,
      apostilleRequired: true,
      additionalRequirements: ["Notarised POA + Apostille for cross-border use"],
      notes: "Power of Attorney requires notarisation + apostille for cross-border use.",
    },
  },
  EU: {
    COMMERCIAL_CONTRACT: {
      requiredSignatureType: "ADVANCED",
      witnessRequired: false,
      notarizationRequired: false,
      apostilleRequired: false,
      additionalRequirements: [],
      notes: "AES sufficient for most B2B commercial contracts across the EU.",
    },
    REAL_ESTATE_DEED: {
      requiredSignatureType: "QUALIFIED",
      witnessRequired: true,
      notarizationRequired: true,
      apostilleRequired: false,
      additionalRequirements: ["Notary-issued QES (EU Regulation 2018/1724)", "Member-state-specific notary fees"],
      notes: "Most EU member states require notary-signed QES for real-estate deeds (France, Germany, Spain, Italy).",
    },
    FINANCIAL_AGREEMENT: {
      requiredSignatureType: "ADVANCED",
      witnessRequired: false,
      notarizationRequired: false,
      apostilleRequired: false,
      additionalRequirements: ["MiFID II compliance for investment services"],
      notes: "AES sufficient for most financial agreements (MiFID II). QES required for certain consumer credit agreements.",
    },
    CUSTOMS_DECLARATION: {
      requiredSignatureType: "ADVANCED",
      witnessRequired: false,
      notarizationRequired: false,
      apostilleRequired: false,
      additionalRequirements: ["EORI-registered AES", "Union Customs Code compliance"],
      notes: "AES sufficient for customs declarations via the Member State's customs portal.",
    },
    GOVERNMENT_FILING: {
      requiredSignatureType: "QUALIFIED",
      witnessRequired: false,
      notarizationRequired: false,
      apostilleRequired: false,
      additionalRequirements: ["Member-state e-ID + QES"],
      notes: "QES required for most EU government filings (eProcurement Directive 2014/24/EU).",
    },
    INVOICE: {
      requiredSignatureType: "SIMPLE",
      witnessRequired: false,
      notarizationRequired: false,
      apostilleRequired: false,
      additionalRequirements: [],
      notes: "SES sufficient for e-invoices under the EU VAT Directive (most member states).",
    },
    LC: {
      requiredSignatureType: "ADVANCED",
      witnessRequired: false,
      notarizationRequired: false,
      apostilleRequired: false,
      additionalRequirements: ["Bank-issued AES", "SWIFT MT798 compliance"],
      notes: "AES sufficient for LC documentation under UCP 600 + EU banking circulars.",
    },
    WILL: {
      requiredSignatureType: "QUALIFIED",
      witnessRequired: true,
      notarizationRequired: true,
      apostilleRequired: false,
      additionalRequirements: ["Testator + 2 witnesses + notary"],
      notes: "Most EU member states require handwritten + witness + notary for wills. QES is accepted in some member states (e.g., Estonia, Spain).",
    },
  },
  US: {
    COMMERCIAL_CONTRACT: {
      requiredSignatureType: "SIMPLE",
      witnessRequired: false,
      notarizationRequired: false,
      apostilleRequired: false,
      additionalRequirements: [],
      notes: "SES sufficient for most commercial contracts under ESIGN + UETA.",
    },
    REAL_ESTATE_DEED: {
      requiredSignatureType: "ADVANCED",
      witnessRequired: true,
      notarizationRequired: true,
      apostilleRequired: false,
      additionalRequirements: ["URPERA-compliant electronic notarisation", "RON permitted in 40+ states (2024)"],
      notes: "AES + electronic notarisation (RON) sufficient for real-estate deeds in most US states.",
    },
    FINANCIAL_AGREEMENT: {
      requiredSignatureType: "SIMPLE",
      witnessRequired: false,
      notarizationRequired: false,
      apostilleRequired: false,
      additionalRequirements: ["GLBA compliance for financial services"],
      notes: "SES sufficient for most financial agreements under ESIGN + GLBA.",
    },
    CUSTOMS_DECLARATION: {
      requiredSignatureType: "SIMPLE",
      witnessRequired: false,
      notarizationRequired: false,
      apostilleRequired: false,
      additionalRequirements: ["ACE portal-issued e-signature"],
      notes: "SES sufficient for customs declarations via the ACE portal.",
    },
    GOVERNMENT_FILING: {
      requiredSignatureType: "SIMPLE",
      witnessRequired: false,
      notarizationRequired: false,
      apostilleRequired: false,
      additionalRequirements: ["Login.gov + AES for IRS filings"],
      notes: "AES required for IRS e-file + Login.gov filings.",
    },
    INVOICE: {
      requiredSignatureType: "SIMPLE",
      witnessRequired: false,
      notarizationRequired: false,
      apostilleRequired: false,
      additionalRequirements: [],
      notes: "SES sufficient for e-invoices under ESIGN.",
    },
    LC: {
      requiredSignatureType: "SIMPLE",
      witnessRequired: false,
      notarizationRequired: false,
      apostilleRequired: false,
      additionalRequirements: ["SWIFT MT798 compliance"],
      notes: "SES sufficient for LC documentation under UCP 600.",
    },
    WILL: {
      requiredSignatureType: "SIMPLE",
      witnessRequired: true,
      notarizationRequired: false,
      apostilleRequired: false,
      additionalRequirements: ["Testator + 2 witnesses", "State-specific witness requirements"],
      notes: "Most US states require handwritten + 2 witnesses for wills. Electronic wills are permitted in a growing number of states (e.g., Florida, Nevada).",
    },
  },
};

// ============ §20.111 Main API: getSignatureLegality ============

export function getSignatureLegality(
  country: string,
  signatureType: SignatureType,
): SignatureLegality {
  const cc = normaliseCountry(country);
  const countryEntry = LEGALITY_REGISTRY[cc] ?? LEGALITY_REGISTRY.OTHER;
  const sigEntry = countryEntry[signatureType];
  const crossBorder = CROSS_BORDER_REGISTRY[cc] ?? [];

  return {
    country: cc,
    signatureType,
    legalStatus: sigEntry.legalStatus,
    evidenceValue: sigEntry.evidenceValue,
    legalBasis: sigEntry.legalBasis,
    requirements: sigEntry.requirements,
    notes: sigEntry.notes,
    crossBorderRecognition: crossBorder,
  };
}

// ============ §20.111 validateQESForJurisdiction ============

export function validateQESForJurisdiction(
  signature: { type: SignatureType; provider?: string; certificateId?: string; certificateFp?: string; algorithm?: string },
  country: string,
): SignatureValidationResult {
  const cc = normaliseCountry(country);
  const legality = getSignatureLegality(cc, signature.type);
  const jurisdictionSpecific: string[] = [];
  const warnings: string[] = [];

  let meetsLegalStandard = false;
  switch (legality.legalStatus) {
    case "LEGALLY_EQUIVALENT":
      meetsLegalStandard = true;
      break;
    case "LEGALLY_VALID":
      meetsLegalStandard = true;
      break;
    case "EVIDENCE_ONLY":
      meetsLegalStandard = false;
      warnings.push(
        `${signature.type} signatures are only EVIDENCE_ONLY in ${cc} — does not satisfy statutory signature requirements`,
      );
      break;
    case "NOT_RECOGNIZED":
      meetsLegalStandard = false;
      warnings.push(`${signature.type} signatures are NOT recognised in ${cc}`);
      break;
  }

  // Check jurisdiction-specific QES requirements.
  if (signature.type === "QUALIFIED") {
    if (!signature.provider) {
      jurisdictionSpecific.push("Provider name is required for QES validation");
      meetsLegalStandard = false;
    }
    if (!signature.certificateId && !signature.certificateFp) {
      jurisdictionSpecific.push("Certificate ID or fingerprint is required for QES validation");
      meetsLegalStandard = false;
    }
    if (cc === "CN" && signature.algorithm && !signature.algorithm.toLowerCase().includes("sm2")) {
      jurisdictionSpecific.push("China requires SM2 cryptography for QES — algorithm " + signature.algorithm + " not compliant");
      meetsLegalStandard = false;
    }
    if (cc === "EU" && signature.provider) {
      const knownEuQtsp = ["Adobe Sign", "DocuSign", "Entrust", "Namirial", "Signaturit", "RSign", "Validated ID"];
      const known = knownEuQtsp.some((q) => signature.provider!.toLowerCase().includes(q.toLowerCase()));
      if (!known) {
        warnings.push(`Provider ${signature.provider} is not in the known EU QTSP list — verify on the EU Trusted List`);
      }
    }
  }

  return {
    valid: legality.legalStatus !== "NOT_RECOGNIZED",
    meetsLegalStandard,
    jurisdictionSpecific,
    signatureType: signature.type,
    country: cc,
    warnings,
  };
}

// ============ §20.111 getSignatureRequirements ============

export function getSignatureRequirements(
  country: string,
  documentType: DocumentType,
): SignatureRequirements {
  const cc = normaliseCountry(country);
  const countryDocs = DOC_REQUIREMENTS_REGISTRY[cc] ?? {};
  const entry = countryDocs[documentType];

  if (!entry) {
    return {
      country: cc,
      documentType,
      requiredSignatureType: "ADVANCED",
      witnessRequired: false,
      notarizationRequired: false,
      apostilleRequired: false,
      additionalRequirements: [],
      notes: `No specific requirement registered for ${cc}/${documentType} — defaulting to ADVANCED. Consult local counsel.`,
    };
  }

  return {
    country: cc,
    documentType,
    requiredSignatureType: entry.requiredSignatureType,
    witnessRequired: entry.witnessRequired,
    notarizationRequired: entry.notarizationRequired,
    apostilleRequired: entry.apostilleRequired,
    additionalRequirements: entry.additionalRequirements,
    notes: entry.notes,
  };
}

// ============ §20.111 getCountrySignatureLaws ============

export function getCountrySignatureLaws(country: string): CountrySignatureLaw {
  const cc = normaliseCountry(country);
  const countryEntry = LEGALITY_REGISTRY[cc] ?? LEGALITY_REGISTRY.OTHER;
  const qesEntry = countryEntry.QUALIFIED;

  // Curated QTSP examples per jurisdiction.
  const QTSP_EXAMPLES: Record<string, string[]> = {
    EG: ["EgyptTrust", "Ein Sha'at (Misr for Central Clearing)", "Beit El Khebra"],
    EU: ["Adobe Sign EU", "DocuSign EU", "Entrust EU", "Namirial", "Signaturit", "RSign", "Validated ID"],
    US: ["DocuSign US", "Adobe Sign US", "Entrust US", "OneSpan Sign"],
    UK: ["Adobe Sign UK", "DocuSign UK", "Entrust UK", "Verisign UK"],
    SA: ["Elm", "Tahakom", "Trustity"],
    AE: ["DocuSign AE", "Adobe Sign AE", "DIFC e-Sign", "ADGM e-Sign"],
    CN: ["BJCA", "GFCA", "SHECA", "Itrus China"],
    JP: ["DocuSign JP", "Adobe Sign JP", "GMO GlobalSign JP", "JISA"],
    BR: ["Certisign", "Serasa Experian", "VALID", "e-Notariado"],
    IN: ["eMudhra", "Capricorn", "Sify", "NSDL e-Governance", "Verasys"],
    AU: ["Adobe Sign AU", "DocuSign AU", "SignNow AU", "myGovID"],
  };
  const QTSP_COUNT: Record<string, number> = {
    EG: 3,
    EU: 280,
    US: 12,
    UK: 8,
    SA: 4,
    AE: 6,
    CN: 38,
    JP: 7,
    BR: 12,
    IN: 9,
    AU: 5,
  };

  const articleMap: Record<string, string> = {
    EG: "Law 15/2004 Art. 16",
    EU: "eIDAS Art. 25(2) + Art. 26 + Art. 36",
    US: "ESIGN Act 15 U.S.C. §7001 + UETA §7-9",
    UK: "Electronic Communications Act 2000 s.7-8",
    SA: "e-Transactions Law 2007 Art. 10",
    AE: "Federal Law 1/2006 Art. 15-16",
    CN: "Electronic Signature Law 2005 Art. 14",
    JP: "Act on Electronic Signatures and Certification Business 2000 Art. 3",
    BR: "MP 2.200-2/2001 Art. 10, §2",
    IN: "IT Act 2000 §35 + §5(2)",
    AU: "Electronic Transactions Act 1999 s.10",
  };

  return {
    country: cc,
    law: qesEntry.legalBasis,
    article: articleMap[cc] ?? "See legal basis",
    qesLegalStatus: qesEntry.legalStatus,
    qtspCount: QTSP_COUNT[cc] ?? 0,
    qtspExamples: QTSP_EXAMPLES[cc] ?? [],
    requirements: qesEntry.requirements,
    crossBorderRecognition: CROSS_BORDER_REGISTRY[cc] ?? [],
  };
}

// ============ §20.111 Auxiliary APIs ============

export function listSupportedCountries(): string[] {
  return Object.keys(LEGALITY_REGISTRY).filter((c) => c !== "OTHER");
}

export function listSignatureTypes(): SignatureType[] {
  return ["SIMPLE", "ADVANCED", "QUALIFIED"];
}

export function listDocumentTypes(): DocumentType[] {
  return [
    "COMMERCIAL_CONTRACT",
    "EMPLOYMENT_CONTRACT",
    "REAL_ESTATE_DEED",
    "FINANCIAL_AGREEMENT",
    "CUSTOMS_DECLARATION",
    "GOVERNMENT_FILING",
    "POWER_OF_ATTORNEY",
    "WILL",
    "BILL_OF_LADING",
    "INVOICE",
    "LC",
    "OTHER",
  ];
}

// ============ §20.111 Helpers ============

function normaliseCountry(country: string): string {
  if (!country) return "OTHER";
  const upper = country.toUpperCase().trim();
  // Map common 2-letter codes + a few synonyms.
  if (upper === "EGYPT") return "EG";
  if (upper === "UNITED_STATES" || upper === "USA") return "US";
  if (upper === "UNITED_KINGDOM" || upper === "BRITAIN") return "UK";
  if (upper === "SAUDI_ARABIA") return "SA";
  if (upper === "UNITED_ARAB_EMIRATES" || upper === "UAE") return "AE";
  if (upper === "CHINA" || upper === "PRC") return "CN";
  if (upper === "JAPAN") return "JP";
  if (upper === "BRAZIL") return "BR";
  if (upper === "INDIA") return "IN";
  if (upper === "AUSTRALIA") return "AU";
  // EU member states → EU (eIDAS applies uniformly).
  const EU_COUNTRIES = ["AT","BE","BG","HR","CY","CZ","DK","EE","FI","FR","DE","GR","HU","IE","IT","LV","LT","LU","MT","NL","PL","PT","RO","SK","SI","ES","SE"];
  if (EU_COUNTRIES.includes(upper)) return "EU";
  if (upper === "EU" || upper === "EUROPEAN_UNION") return "EU";
  if (LEGALITY_REGISTRY[upper]) return upper;
  return "OTHER";
}
