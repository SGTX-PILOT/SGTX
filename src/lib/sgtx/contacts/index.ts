// SGTX Network / Saved Contacts — auto-save helper (Blueprint Part 2.6)
//
// Non-marketplace principle: the platform never recommends counterparties.
// Instead, when a tenant explicitly transacts with another tenant (trade
// creation, quote acceptance, financing agreement signing), the counterparty
// is auto-saved to the tenant's network so future GTID autocomplete surfaces
// them. The user can remove any auto-saved contact at any time.

import { db } from "@/lib/db";

export type AutoSaveTrigger =
  | "TRADE_CREATED"
  | "QUOTE_ACCEPTED"
  | "FINANCING_SIGNED"
  | "MESSAGE_SENT"
  | "MANUAL_ADD";

export interface AutoSaveResult {
  created: boolean;
  contactId: string;
  contactGtid: string;
  contactName: string;
  trigger: AutoSaveTrigger;
}

/**
 * Idempotently saves a contact to the owner's network. If the
 * (ownerGtid, contactGtid) pair already exists, the existing record is
 * returned untouched (with `totalTrades` bumped if the trigger is trade-
 * related). Otherwise a new SavedContact is created with `autoSaved=true`.
 *
 * @param ownerGtid   the tenant saving the contact
 * @param contactGtid the counterparty being saved
 * @param trigger     the lifecycle event that triggered the save
 */
export async function autoSaveContact(
  ownerGtid: string,
  contactGtid: string,
  trigger: AutoSaveTrigger,
): Promise<AutoSaveResult | null> {
  if (!ownerGtid || !contactGtid) return null;
  if (ownerGtid === contactGtid) return null; // never save self

  // Resolve the contact's public profile so we can store name + type + trust
  const contact = await db.tenant.findUnique({ where: { gtid: contactGtid } });
  if (!contact) return null;

  // Idempotency: check if already saved
  const existing = await db.savedContact.findFirst({
    where: { ownerGtid, contactGtid },
  });

  if (existing) {
    // Bump trade count for trade-related triggers
    const tradeTriggers: AutoSaveTrigger[] = ["TRADE_CREATED", "QUOTE_ACCEPTED", "FINANCING_SIGNED"];
    if (tradeTriggers.includes(trigger)) {
      await db.savedContact.update({
        where: { id: existing.id },
        data: { totalTrades: existing.totalTrades + 1 },
      });
    }
    return {
      created: false,
      contactId: existing.id,
      contactGtid: existing.contactGtid,
      contactName: existing.contactName,
      trigger,
    };
  }

  // Count existing trades between the two for the initial portrait baseline
  const trades = await db.trade.findMany({
    where: {
      OR: [
        { buyerGtid: ownerGtid, sellerGtid: contactGtid },
        { buyerGtid: contactGtid, sellerGtid: ownerGtid },
      ],
    },
  });

  const saved = await db.savedContact.create({
    data: {
      ownerGtid,
      contactGtid,
      contactName: contact.legalName,
      contactType: contact.type,
      relationship: triggerToRelationship(trigger, contact.type),
      healthScore: contact.trustScore,
      totalTrades: trades.length,
      autoSaved: true,
      // trustPortrait left null — generated lazily by /api/sgtx/contacts POST
      // when the user explicitly adds the contact. Auto-saved entries stay
      // lightweight to avoid spawning an AI call on every trade.
    },
  });

  return {
    created: true,
    contactId: saved.id,
    contactGtid: saved.contactGtid,
    contactName: saved.contactName,
    trigger,
  };
}

function triggerToRelationship(trigger: AutoSaveTrigger, contactType: string): string {
  switch (trigger) {
    case "TRADE_CREATED":
      return "trader";
    case "QUOTE_ACCEPTED":
      return "trader";
    case "FINANCING_SIGNED":
      return "financier";
    case "MESSAGE_SENT":
      return "correspondent";
    case "MANUAL_ADD":
      return contactType === "TRD" ? "trader" : contactType.toLowerCase();
  }
}
