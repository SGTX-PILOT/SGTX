// @ts-nocheck — defensive; interface stub returns MANUAL_REQUIRED everywhere
// SGTX Air Cargo — Airline + GHA Adapter Framework
//
// Each airline and ground handling agent (GHA) has its own booking API,
// AWB issuance flow, ULD handling rules, and acceptance cutoffs. The
// AirlineAdapter and GHAAdapter interfaces abstract these differences so
// the air-cargo engine can call carrier-agnostic methods.
//
// Capability tiers:
//   • ACTIVE      — adapter has real API integration (currently: none — all
//                   API integrations require airline/GHA credentials that
//                   the platform does not yet hold).
//   • MANUAL_REQUIRED — adapter knows the carrier's requirements but cannot
//                   file bookings / AWBs automatically; the operator must
//                   use the carrier's portal manually.
//   • NOT_SUPPORTED — base adapter. Returns NOT_SUPPORTED for everything.
//   • NOT_YET_ACTIVE — adapter is registered but the carrier isn't live yet
//                   (planned for future releases).
//
// Currently the only concrete adapter is EgyptAirAdapter (MS, ICAO: EgyptAir),
// which knows the EgyptAir Cargo booking / AWB / ULD acceptance requirements
// but returns MANUAL_REQUIRED for actual filing — the platform does not yet
// have EgyptAir Cargo API credentials.
//
// Carrier codes (IATA airline designators):
//   MS  — EgyptAir (Egypt)
//   EY  — Etihad Airways (UAE)
//   EK  — Emirates (UAE)
//   QR  — Qatar Airways (Qatar)
//   TK  — Turkish Airlines (Turkey)
//   SV  — Saudia (Saudi Arabia)
//   LY  — El Al (Israel)
//   BA  — British Airways (UK)
//   AF  — Air France (France)
//   LH  — Lufthansa (Germany)

import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";

// ============ Airline Adapter Interface ============

export interface AirlineAdapterInterface {
  carrierCode: string;          // IATA 2-letter code (e.g. "MS")
  carrierName: string;
  capabilities: string[];       // e.g. ["BOOKING", "AWB_ISSUANCE", "FLIGHT_STATUS", "ULD_TRACKING"]

  // Booking flow
  requestBooking(input: any): Promise<BookingResult>;
  confirmBooking(bookingReference: string): Promise<{ status: string; confirmedAt?: Date }>;
  cancelBooking(bookingReference: string, reason?: string): Promise<{ status: string }>;
  getBookingStatus(bookingReference: string): Promise<{ status: string }>;

  // AWB flow
  issueMawb(input: any): Promise<MawbResult>;
  issueHawb(input: any): Promise<HawbResult>;
  validateAwb(awbNumber: string): Promise<{ valid: boolean; issues: string[] }>;
  amendAwb(awbNumber: string, amendments: any): Promise<{ status: string }>;

  // Flight operations
  getFlightSchedule(flightNumber: string, date: Date): Promise<any>;
  getFlightStatus(flightNumber: string, date: Date): Promise<{ status: string; estimatedDeparture?: Date; estimatedArrival?: Date }>;
  updateFlightStatus(flightNumber: string, date: Date, status: string): Promise<{ status: string }>;

  // ULD operations
  assignUld(uldId: string, flightNumber: string): Promise<{ status: string }>;
  trackUld(uldId: string): Promise<{ status: string; location?: string; flightNumber?: string }>;
  returnUld(uldId: string, returnLocation: string): Promise<{ status: string }>;

  // Cargo-XML / ONE Record messaging
  sendMessage(messageType: string, payload: any): Promise<{ status: string; messageId?: string }>;
  receiveMessage(messageId: string): Promise<{ status: string; payload?: any }>;

  // Capabilities / health
  supportsEawb(): boolean;
  supportsOneRecord(): boolean;
  supportsCargoXml(): boolean;
  getDgAcceptancePolicy(): any;
}

// ============ Result Types ============

export interface BookingResult {
  status: string;        // REQUESTED | QUOTED | HELD | CONFIRMED | WAITLISTED | REJECTED | MANUAL_REQUIRED | NOT_SUPPORTED
  bookingReference?: string;
  airlineGtid?: string;
  quotedRate?: number;
  quotedCurrency?: string;
  flightNumber?: string;
  flightDate?: Date;
  bookingDeadline?: Date;
  allotmentReference?: string;
  issues?: string[];
  manualFilingUrl?: string;
}

export interface MawbResult {
  status: string;        // ISSUED | MANUAL_REQUIRED | NOT_SUPPORTED | REJECTED
  awbNumber?: string;
  airlinePrefix?: string;
  serial?: string;
  issuedAt?: Date;
  documentHash?: string;
  eAwbStatus?: string;   // PAPER | E_AWB | ELECTRONIC
  issues?: string[];
  manualFilingUrl?: string;
}

export interface HawbResult {
  status: string;        // ISSUED | MANUAL_REQUIRED | NOT_SUPPORTED | REJECTED
  awbNumber?: string;
  issuedAt?: Date;
  documentHash?: string;
  issues?: string[];
  manualFilingUrl?: string;
}

// ============ Base Airline Adapter ============

/**
 * Base adapter — every method returns NOT_SUPPORTED. Concrete adapters
 * override only the methods they actually support.
 */
export class BaseAirlineAdapter implements AirlineAdapterInterface {
  carrierCode: string = "__BASE__";
  carrierName: string = "Base Airline";
  capabilities: string[] = [];

  async requestBooking(_input: any): Promise<BookingResult> {
    return { status: "NOT_SUPPORTED" };
  }
  async confirmBooking(_bookingReference: string): Promise<{ status: string; confirmedAt?: Date }> {
    return { status: "NOT_SUPPORTED" };
  }
  async cancelBooking(_bookingReference: string, _reason?: string): Promise<{ status: string }> {
    return { status: "NOT_SUPPORTED" };
  }
  async getBookingStatus(_bookingReference: string): Promise<{ status: string }> {
    return { status: "NOT_SUPPORTED" };
  }
  async issueMawb(_input: any): Promise<MawbResult> {
    return { status: "NOT_SUPPORTED" };
  }
  async issueHawb(_input: any): Promise<HawbResult> {
    return { status: "NOT_SUPPORTED" };
  }
  async validateAwb(_awbNumber: string): Promise<{ valid: boolean; issues: string[] }> {
    return { valid: false, issues: ["NOT_SUPPORTED by base adapter"] };
  }
  async amendAwb(_awbNumber: string, _amendments: any): Promise<{ status: string }> {
    return { status: "NOT_SUPPORTED" };
  }
  async getFlightSchedule(_flightNumber: string, _date: Date): Promise<any> {
    return { status: "NOT_SUPPORTED" };
  }
  async getFlightStatus(_flightNumber: string, _date: Date): Promise<{ status: string; estimatedDeparture?: Date; estimatedArrival?: Date }> {
    return { status: "NOT_SUPPORTED" };
  }
  async updateFlightStatus(_flightNumber: string, _date: Date, _status: string): Promise<{ status: string }> {
    return { status: "NOT_SUPPORTED" };
  }
  async assignUld(_uldId: string, _flightNumber: string): Promise<{ status: string }> {
    return { status: "NOT_SUPPORTED" };
  }
  async trackUld(_uldId: string): Promise<{ status: string; location?: string; flightNumber?: string }> {
    return { status: "NOT_SUPPORTED" };
  }
  async returnUld(_uldId: string, _returnLocation: string): Promise<{ status: string }> {
    return { status: "NOT_SUPPORTED" };
  }
  async sendMessage(_messageType: string, _payload: any): Promise<{ status: string; messageId?: string }> {
    return { status: "NOT_SUPPORTED" };
  }
  async receiveMessage(_messageId: string): Promise<{ status: string; payload?: any }> {
    return { status: "NOT_SUPPORTED" };
  }
  supportsEawb(): boolean { return false; }
  supportsOneRecord(): boolean { return false; }
  supportsCargoXml(): boolean { return false; }
  getDgAcceptancePolicy(): any {
    return { status: "NOT_SUPPORTED" };
  }
}

// ============ GHA Adapter Interface ============

export interface GhaAdapterInterface {
  ghaCode: string;          // e.g. "EG-CAI-ACS" (Cairo Airport Cargo Services)
  ghaName: string;
  airportCode: string;     // IATA code
  carrierCodes: string[];  // airlines this GHA handles at this airport

  // Acceptance / cargo handling
  acceptCargo(input: any): Promise<{ status: string; acceptanceReference?: string; issues?: string[] }>;
  weighCargo(acceptanceReference: string): Promise<{ status: string; actualWeight?: number; volumetricWeight?: number; chargeableWeight?: number }>;
  screenCargo(input: any): Promise<{ status: string; screeningReference?: string; result?: string }>;
  buildUpUld(input: any): Promise<{ status: string; uldId?: string; buildPlan?: any }>;
  breakdownUld(uldId: string): Promise<{ status: string; piecesReleased?: number }>;
  handoverToAirline(uldId: string, flightNumber: string): Promise<{ status: string }>;
  receiveFromAirline(uldId: string, flightNumber: string): Promise<{ status: string }>;
  deliverToConsignee(acceptanceReference: string, consigneeId: string): Promise<{ status: string; deliveryReference?: string }>;

  // Storage / location
  assignStorageLocation(acceptanceReference: string, locationCode: string): Promise<{ status: string }>;
  getStorageLocation(acceptanceReference: string): Promise<{ status: string; locationCode?: string }>;

  // Cutoffs
  getAcceptanceCutoff(flightNumber: string, flightDate: Date): Promise<{ cutoffTime?: Date; status: string }>;
  getBuildupCutoff(flightNumber: string, flightDate: Date): Promise<{ cutoffTime?: Date; status: string }>;
}

// ============ Base GHA Adapter ============

/**
 * Base GHA adapter — every method returns NOT_SUPPORTED.
 */
export class BaseGhaAdapter implements GhaAdapterInterface {
  ghaCode: string = "__BASE__";
  ghaName: string = "Base GHA";
  airportCode: string = "";
  carrierCodes: string[] = [];

  async acceptCargo(_input: any): Promise<{ status: string; acceptanceReference?: string; issues?: string[] }> {
    return { status: "NOT_SUPPORTED" };
  }
  async weighCargo(_acceptanceReference: string): Promise<{ status: string; actualWeight?: number; volumetricWeight?: number; chargeableWeight?: number }> {
    return { status: "NOT_SUPPORTED" };
  }
  async screenCargo(_input: any): Promise<{ status: string; screeningReference?: string; result?: string }> {
    return { status: "NOT_SUPPORTED" };
  }
  async buildUpUld(_input: any): Promise<{ status: string; uldId?: string; buildPlan?: any }> {
    return { status: "NOT_SUPPORTED" };
  }
  async breakdownUld(_uldId: string): Promise<{ status: string; piecesReleased?: number }> {
    return { status: "NOT_SUPPORTED" };
  }
  async handoverToAirline(_uldId: string, _flightNumber: string): Promise<{ status: string }> {
    return { status: "NOT_SUPPORTED" };
  }
  async receiveFromAirline(_uldId: string, _flightNumber: string): Promise<{ status: string }> {
    return { status: "NOT_SUPPORTED" };
  }
  async deliverToConsignee(_acceptanceReference: string, _consigneeId: string): Promise<{ status: string; deliveryReference?: string }> {
    return { status: "NOT_SUPPORTED" };
  }
  async assignStorageLocation(_acceptanceReference: string, _locationCode: string): Promise<{ status: string }> {
    return { status: "NOT_SUPPORTED" };
  }
  async getStorageLocation(_acceptanceReference: string): Promise<{ status: string; locationCode?: string }> {
    return { status: "NOT_SUPPORTED" };
  }
  async getAcceptanceCutoff(_flightNumber: string, _flightDate: Date): Promise<{ cutoffTime?: Date; status: string }> {
    return { status: "NOT_SUPPORTED" };
  }
  async getBuildupCutoff(_flightNumber: string, _flightDate: Date): Promise<{ cutoffTime?: Date; status: string }> {
    return { status: "NOT_SUPPORTED" };
  }
}

// ============ EgyptAir Adapter (MS) ============

/**
 * EgyptAir Cargo adapter (MS, ICAO: EgyptAir).
 *
 * Knows the following EgyptAir-specific requirements:
 *   • IATA AWB prefix: 077 (EgyptAir's 3-digit airline prefix)
 *   • Booking channels: EgyptAir Cargo portal (https://cargo.egyptair.com)
 *   • e-AWB: EgyptAir participates in IATA e-AWB (singleAWB record per cargo)
 *   • Cargo-XML: EgyptAir supports IATA Cargo-XML (XNB, FBR, FZL, CXM)
 *   • ONE Record: EgyptAir is in onboarding phase (LIVE soon)
 *   • ULD handling: AKE, PMC, PAG, RKN (typical fleet compat)
 *   • DG acceptance: state-of-charge checks for lithium, segregation per DGR
 *   • Cairo hub (CAI): ACS-Cargo (GHA), National Air Cargo Services (NACSG)
 *
 * All filing methods return MANUAL_REQUIRED because the platform does not
 * yet hold EgyptAir Cargo API credentials. The requirement-getter methods are
 * fully implemented (they don't need API access).
 */
export class EgyptAirAdapter extends BaseAirlineAdapter {
  carrierCode = "MS";
  carrierName = "EgyptAir Cargo";
  capabilities = [
    "BOOKING",
    "AWB_ISSUANCE",
    "FLIGHT_STATUS",
    "ULD_TRACKING",
    "DG_ACCEPTANCE",
    "CARGO_XML",
    "ONE_RECORD_ONBOARDING",
  ];

  // EgyptAir Cargo portal — operator files manually here.
  portalUrl = "https://cargo.egyptair.com";
  // IATA AWB prefix (3-digit) — EgyptAir = 077
  awbPrefix = "077";
  // ICAO code
  icaoCode = "MSR";
  // Hub airport (IATA)
  hubAirport = "CAI";
  // Main fleet (cargo)
  fleet = ["B777F", "B737BCF", "A330F"];

  /**
   * Compute the booking deadline (cutoff) for an EgyptAir flight.
   * Default EgyptAir booking cutoff: T-24h (booking must be made at least 24h before STD).
   * Express: T-12h. Charter: T-72h.
   */
  computeBookingDeadline(flightDate: Date, serviceLevel = "STANDARD"): Date {
    const dep = flightDate instanceof Date ? flightDate : new Date(flightDate);
    const hoursBefore =
      serviceLevel === "EXPRESS" ? 12
      : serviceLevel === "CHARTER" ? 72
      : 24; // STANDARD default
    return new Date(dep.getTime() - hoursBefore * 60 * 60 * 1000);
  }

  // --- Requirements (no API access needed) -------------------------------

  /**
   * Return EgyptAir Cargo's document requirements for an air shipment.
   */
  getDocumentRequirements(input: any): any[] {
    const docs: any[] = [
      {
        code: "MAWB",
        name: "Master Air Waybill",
        authority: "EgyptAir Cargo",
        mandatory: true,
        portalUrl: this.portalUrl,
      },
      {
        code: "HAWB",
        name: "House Air Waybill",
        authority: "Forwarder / EgyptAir Cargo",
        mandatory: true,
      },
      {
        code: "COMMERCIAL_INVOICE",
        name: "Commercial Invoice",
        authority: "Egyptian Customs",
        mandatory: true,
      },
      {
        code: "PACKING_LIST",
        name: "Packing List",
        authority: "Egyptian Customs",
        mandatory: true,
      },
    ];

    const cargoType = String(input?.cargoType || "").toUpperCase();
    if (cargoType.includes("DG") || cargoType.includes("DANGEROUS")) {
      docs.push({
        code: "DG_DECLARATION",
        name: "Shipper's Declaration for Dangerous Goods (eDGD preferred)",
        authority: "IATA DGR",
        mandatory: true,
      });
    }
    if (cargoType.includes("PHARMA")) {
      docs.push({
        code: "GDP_CERT",
        name: "GDP Certificate + Temperature Log",
        authority: "EgyptAir Cargo Pharma",
        mandatory: true,
      });
    }
    if (cargoType.includes("PERISHABLE") || cargoType.includes("PER")) {
      docs.push({
        code: "PHYTOSANITARY",
        name: "Phytosanitary Certificate",
        authority: "Ministry of Agriculture",
        mandatory: true,
      });
    }
    if (cargoType.includes("VALUABLE")) {
      docs.push({
        code: "VALUABLE_DECLARATION",
        name: "Valuation Declaration + Insurance",
        authority: "EgyptAir Cargo VAL desk",
        mandatory: true,
      });
    }
    return docs;
  }

  /**
   * Return EgyptAir's DG acceptance policy (used by the DG validation engine).
   */
  getDgAcceptancePolicy(): any {
    return {
      status: "OK",
      airline: this.carrierCode,
      bannedClasses: ["1.1", "1.2", "1.3"], // explosives — banned on EgyptAir
      restrictedClasses: ["7"],            // radioactive — needs state approval
      acceptedClasses: ["2", "3", "4", "5", "6", "8", "9"],
      lithiumPolicy: "PI 965 / PI 968 cargo-only on freighter aircraft (B777F, A330F)",
      soCMax: 30,                          // lithium battery state of charge ≤ 30%
      eDgdPreferred: true,
      manualFilingRequired: false,          // e-DGD accepted
    };
  }

  supportsEawb(): boolean { return true; }
  supportsOneRecord(): boolean { return false; } // onboarding
  supportsCargoXml(): boolean { return true; }

  // --- Booking flow (MANUAL_REQUIRED — operator files on cargo.egyptair.com) ---

  async requestBooking(input: any): Promise<BookingResult> {
    try {
      // Compute the booking deadline — operator must file before this time.
      const flightDate = input?.flightDate ? new Date(input.flightDate) : null;
      const serviceLevel = input?.serviceLevel || "STANDARD";
      if (!flightDate) {
        return {
          status: "MANUAL_REQUIRED",
          issues: ["flightDate required to compute booking deadline"],
          manualFilingUrl: this.portalUrl,
        };
      }
      const bookingDeadline = this.computeBookingDeadline(flightDate, serviceLevel);

      // Generate an SGTX-internal tracking reference (NOT an EgyptAir booking reference).
      // The operator uses this to correlate the manual filing on cargo.egyptair.com.
      const trackingRef = `SGTX-MS-${Date.now().toString(36).toUpperCase()}`;

      // Persist an AirJurisdictionAdapter row for Egypt (if not present) so the
      // reconciliation engine knows this USTN had a MANUAL_REQUIRED filing.
      try {
        const existing = await db.airJurisdictionAdapter.findUnique({
          where: { countryCode: "EG" },
        });
        if (!existing) {
          await db.airJurisdictionAdapter.create({
            data: {
              countryCode: "EG",
              adapterName: "EgyptAir Cargo Adapter",
              status: "NOT_YET_ACTIVE",
              capabilities: JSON.stringify(this.capabilities),
              airportCodes: JSON.stringify(["CAI", "HRG", "SSH", "LXR"]),
              apiEndpoint: this.portalUrl,
              portalUrl: this.portalUrl,
              operatingMode: "MANUAL_REQUIRED",
              healthStatus: "OK",
              version: "1.0",
            },
          });
        }
      } catch (e: any) {
        logger.warn("[egypt-air-adapter] failed to register AirJurisdictionAdapter row", {
          error: e?.message,
        });
      }

      logger.info("[egypt-air-adapter] requestBooking MANUAL_REQUIRED", {
        ustn: input?.ustn,
        trackingRef,
        flightDate: flightDate.toISOString(),
        bookingDeadline: bookingDeadline.toISOString(),
      });

      return {
        status: "MANUAL_REQUIRED",
        bookingReference: trackingRef,
        airlineGtid: this.carrierCode,
        flightNumber: input?.flightNumber || undefined,
        flightDate: flightDate,
        bookingDeadline,
        issues: [
          "EgyptAir Cargo API not yet integrated — operator must file booking manually on cargo.egyptair.com",
          `Booking must be made before ${bookingDeadline.toISOString()}`,
        ],
        manualFilingUrl: this.portalUrl,
      };
    } catch (err: any) {
      logger.error("[egypt-air-adapter] requestBooking failed", { error: err?.message });
      return {
        status: "MANUAL_REQUIRED",
        issues: [`Adapter error: ${err?.message || "unknown"}`],
        manualFilingUrl: this.portalUrl,
      };
    }
  }

  async confirmBooking(bookingReference: string): Promise<{ status: string; confirmedAt?: Date }> {
    return { status: "MANUAL_REQUIRED" };
  }
  async cancelBooking(_bookingReference: string, _reason?: string): Promise<{ status: string }> {
    return { status: "MANUAL_REQUIRED" };
  }
  async getBookingStatus(_bookingReference: string): Promise<{ status: string }> {
    return { status: "MANUAL_REQUIRED" };
  }

  // --- AWB flow (MANUAL_REQUIRED — operator issues AWB on cargo.egyptair.com) ---

  async issueMawb(input: any): Promise<MawbResult> {
    // EgyptAir's AWB prefix is 077. Generate a candidate serial + check digit.
    const serialNum = Math.floor(10000000 + Math.random() * 89999999);
    const serial = String(serialNum).padStart(8, "0");
    const checkDigit = String(serialNum % 7);
    const awbNumber = `${this.awbPrefix}-${serial}${checkDigit}`;

    logger.info("[egypt-air-adapter] issueMawb MANUAL_REQUIRED", {
      ustn: input?.ustn,
      candidateAwbNumber: awbNumber,
    });

    return {
      status: "MANUAL_REQUIRED",
      awbNumber,
      airlinePrefix: this.awbPrefix,
      serial,
      documentHash: null,
      eAwbStatus: "E_AWB", // EgyptAir participates in IATA e-AWB
      issues: [
        "EgyptAir Cargo API not yet integrated — operator must issue MAWB manually on cargo.egyptair.com",
        `Candidate AWB number ${awbNumber} — verify availability on the portal before using`,
      ],
      manualFilingUrl: this.portalUrl,
    };
  }

  async issueHawb(input: any): Promise<HawbResult> {
    // HAWB uses the forwarder's own AWB prefix (NOT EgyptAir's). For SGTX demo
    // purposes we generate a candidate serial under a placeholder forwarder prefix.
    const fwdPrefix = input?.forwarderPrefix || "920";
    const serialNum = Math.floor(10000000 + Math.random() * 89999999);
    const serial = String(serialNum).padStart(8, "0");
    const checkDigit = String(serialNum % 7);
    const awbNumber = `${fwdPrefix}-${serial}${checkDigit}`;

    return {
      status: "MANUAL_REQUIRED",
      awbNumber,
      issues: [
        "HAWB issuance is the forwarder's responsibility — generated candidate number",
        `Verify prefix ${fwdPrefix} is allocated to the forwarder before using`,
      ],
      manualFilingUrl: this.portalUrl,
    };
  }

  async validateAwb(awbNumber: string): Promise<{ valid: boolean; issues: string[] }> {
    // Validate the check digit (mod 7 of the 8-digit serial).
    const cleaned = String(awbNumber || "").replace(/[\s-]/g, "").toUpperCase();
    const m = cleaned.match(/^(\d{3})(\d{8})(\d)$/);
    if (!m) {
      return { valid: false, issues: [`AWB number '${awbNumber}' is malformed (expected NNNNNNNNNNC)`] };
    }
    const [, _prefix, serial, check] = m;
    const expectedCheck = String(Number(serial) % 7);
    if (check !== expectedCheck) {
      return {
        valid: false,
        issues: [`AWB check digit mismatch: serial ${serial} → expected check ${expectedCheck}, got ${check}`],
      };
    }
    return { valid: true, issues: [] };
  }

  async amendAwb(_awbNumber: string, _amendments: any): Promise<{ status: string }> {
    return { status: "MANUAL_REQUIRED" };
  }

  // --- Flight operations (MANUAL_REQUIRED — flight status via cargo.egyptair.com) ---

  async getFlightSchedule(flightNumber: string, date: Date): Promise<any> {
    return {
      status: "MANUAL_REQUIRED",
      flightNumber,
      date: date instanceof Date ? date.toISOString() : date,
      manualFilingUrl: this.portalUrl,
    };
  }
  async getFlightStatus(flightNumber: string, date: Date): Promise<{ status: string; estimatedDeparture?: Date; estimatedArrival?: Date }> {
    return { status: "MANUAL_REQUIRED" };
  }
  async updateFlightStatus(_flightNumber: string, _date: Date, _status: string): Promise<{ status: string }> {
    return { status: "MANUAL_REQUIRED" };
  }

  // --- ULD operations (MANUAL_REQUIRED — ULD control via cargo.egyptair.com) ---

  async assignUld(_uldId: string, _flightNumber: string): Promise<{ status: string }> {
    return { status: "MANUAL_REQUIRED" };
  }
  async trackUld(_uldId: string): Promise<{ status: string; location?: string; flightNumber?: string }> {
    return { status: "MANUAL_REQUIRED" };
  }
  async returnUld(_uldId: string, _returnLocation: string): Promise<{ status: string }> {
    return { status: "MANUAL_REQUIRED" };
  }

  // --- Cargo-XML / ONE Record messaging (MANUAL_REQUIRED) ---

  async sendMessage(messageType: string, _payload: any): Promise<{ status: string; messageId?: string }> {
    // Generate an internal message ID for tracking purposes
    const messageId = `SGTX-CXML-${messageType}-${Date.now().toString(36).toUpperCase()}`;
    return {
      status: "MANUAL_REQUIRED",
      messageId,
    };
  }
  async receiveMessage(_messageId: string): Promise<{ status: string; payload?: any }> {
    return { status: "MANUAL_REQUIRED" };
  }
}

// ============ Adapter Registry ============

const AIRLINE_ADAPTERS: Map<string, AirlineAdapterInterface> = new Map();
const GHA_ADAPTERS: Map<string, GhaAdapterInterface> = new Map();

// Register EgyptAir adapter
AIRLINE_ADAPTERS.set("MS", new EgyptAirAdapter());

/**
 * Look up an airline adapter by IATA code.
 * Returns the BaseAirlineAdapter (which returns NOT_SUPPORTED everywhere) if
 * no concrete adapter is registered for the given carrier.
 */
export function getAirlineAdapter(carrierCode: string): AirlineAdapterInterface {
  const code = String(carrierCode || "").toUpperCase();
  return AIRLINE_ADAPTERS.get(code) || new BaseAirlineAdapter();
}

/**
 * Look up a GHA adapter by GHA code or airport code.
 * Returns the BaseGhaAdapter if not found.
 */
export function getGhaAdapter(ghaOrAirportCode: string): GhaAdapterInterface {
  const code = String(ghaOrAirportCode || "").toUpperCase();
  return GHA_ADAPTERS.get(code) || new BaseGhaAdapter();
}

/**
 * Register a new airline adapter at runtime (used by tests / future seeders).
 */
export function registerAirlineAdapter(adapter: AirlineAdapterInterface): void {
  if (!adapter?.carrierCode) return;
  AIRLINE_ADAPTERS.set(adapter.carrierCode.toUpperCase(), adapter);
}

/**
 * Register a new GHA adapter at runtime.
 */
export function registerGhaAdapter(adapter: GhaAdapterInterface): void {
  if (!adapter?.ghaCode) return;
  GHA_ADAPTERS.set(adapter.ghaCode.toUpperCase(), adapter);
}

/**
 * List all registered airline adapter codes.
 */
export function listRegisteredAirlineAdapters(): string[] {
  return Array.from(AIRLINE_ADAPTERS.keys());
}

/**
 * List all registered GHA adapter codes.
 */
export function listRegisteredGhaAdapters(): string[] {
  return Array.from(GHA_ADAPTERS.keys());
}
