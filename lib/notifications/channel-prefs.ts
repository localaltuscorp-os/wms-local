import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { employees } from "@/db/schema";

/**
 * M4 — projection of `employees` columns the dispatcher needs to decide
 * which channels to fire for a given recipient.  Keeps the payload tiny
 * (no avatar/department/etc.) so we don't ship a full row over every
 * notification.
 */
export interface RecipientChannelPrefs {
  id: string;
  name: string;
  email: string;
  emailOptIn: boolean;
  slackOptIn: boolean;
  slackUserId: string | null;
  whatsappOptedIn: boolean;
  whatsappPhone: string | null;
  whatsappTemplateLocale: string;
  // Profile v2 — used by dispatch matrix gating + mention escalation + OOO.
  mentionEscalation: boolean;
  oooStart: string | null;
  oooEnd: string | null;
  oooDelegateId: string | null;
}

/**
 * Loads the channel-pref row for a single recipient in one query.
 * Returns null if the recipient doesn't exist (deleted between when
 * the calling action looked them up and when dispatch runs).
 */
export async function getRecipientChannelPrefs(
  recipientId: string,
): Promise<RecipientChannelPrefs | null> {
  const [row] = await db
    .select({
      id: employees.id,
      name: employees.name,
      email: employees.email,
      emailOptIn: employees.emailOptIn,
      slackOptIn: employees.slackOptIn,
      slackUserId: employees.slackUserId,
      whatsappOptedIn: employees.whatsappOptedIn,
      whatsappPhone: employees.whatsappPhone,
      whatsappTemplateLocale: employees.whatsappTemplateLocale,
      mentionEscalation: employees.mentionEscalation,
      oooStart: employees.oooStart,
      oooEnd: employees.oooEnd,
      oooDelegateId: employees.oooDelegateId,
    })
    .from(employees)
    .where(eq(employees.id, recipientId))
    .limit(1);
  return row ?? null;
}
