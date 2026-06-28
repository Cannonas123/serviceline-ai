/**
 * On-Call Resolution Service
 *
 * Determines who should receive notifications right now based on
 * the client's on-call schedule. Falls back to the business owner
 * if no one is on-call or if the on-call person doesn't respond.
 *
 * Resolution order:
 * 1. Check on_call_schedule for current day + time
 * 2. If match → return that contact's phone
 * 3. If no match → return owner's phone (default)
 */
import { db, onCallContacts, onCallSchedule, escalations, eq, and } from '@serviceline/db';
import { ClientConfig } from '../lib/client-config.js';
import { smsToOwner } from './notifications.js';

export interface OnCallContact {
  id: string;
  name: string;
  phone: string;
  role: string;
}

export interface OnCallResult {
  contact: OnCallContact;
  isOwner: boolean; // true if falling back to owner (no schedule match)
}

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
};

/** Current weekday (0=Sun) and HH:MM in the given IANA timezone (server-local if unset). */
function localDayAndTime(timeZone?: string): { dayOfWeek: number; time: string } {
  const now = new Date();
  if (!timeZone) {
    const pad = (n: number) => n.toString().padStart(2, '0');
    return { dayOfWeek: now.getDay(), time: `${pad(now.getHours())}:${pad(now.getMinutes())}` };
  }
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return {
    dayOfWeek: WEEKDAY_INDEX[get('weekday')] ?? now.getDay(),
    time: `${get('hour')}:${get('minute')}`,
  };
}

/**
 * Resolve who is currently on-call for a client.
 * Returns the on-call contact, or the owner as fallback.
 */
export async function resolveOnCall(client: ClientConfig): Promise<OnCallResult> {
  // On-call schedules are stored in the contractor's local wall-clock time, but a
  // production server runs in UTC — so day/time must be evaluated in the business's
  // timezone, not the server's. Set DEFAULT_TIMEZONE (IANA, e.g. America/Chicago)
  // in production. TODO: store timezone per client for multi-region operators.
  const { dayOfWeek, time: currentTime } = localDayAndTime(process.env.DEFAULT_TIMEZONE);

  // Find schedule entries for this client + current day
  const scheduleEntries = await db
    .select({
      contactId: onCallSchedule.contactId,
      startTime: onCallSchedule.startTime,
      endTime: onCallSchedule.endTime,
      contactName: onCallContacts.name,
      contactPhone: onCallContacts.phone,
      contactRole: onCallContacts.role,
      isActive: onCallContacts.isActive,
    })
    .from(onCallSchedule)
    .innerJoin(onCallContacts, eq(onCallSchedule.contactId, onCallContacts.id))
    .where(
      and(
        eq(onCallSchedule.clientId, client.id),
        eq(onCallSchedule.dayOfWeek, dayOfWeek),
      ),
    );

  // Find who's on-call right now (current time within their shift)
  for (const entry of scheduleEntries) {
    if (!entry.isActive) continue;

    if (isTimeInRange(currentTime, entry.startTime, entry.endTime)) {
      return {
        contact: {
          id: entry.contactId,
          name: entry.contactName,
          phone: entry.contactPhone,
          role: entry.contactRole || 'technician',
        },
        isOwner: false,
      };
    }
  }

  // No on-call match — fall back to owner
  return {
    contact: {
      id: 'owner',
      name: client.ownerName,
      phone: client.ownerPhone,
      role: 'owner',
    },
    isOwner: true,
  };
}

/**
 * Send a notification to the on-call person with escalation tracking.
 * If the on-call person doesn't acknowledge within the timeout,
 * the message is escalated to the owner.
 *
 * @param escalationTimeoutMs - How long to wait before escalating to owner.
 *   Emergency: 5 min (300000). Booking: 15 min (900000). Voicemail: 30 min (1800000).
 */
export async function notifyOnCall(
  client: ClientConfig,
  message: string,
  type: 'emergency' | 'booking' | 'voicemail',
  escalationTimeoutMs?: number,
): Promise<void> {
  const { contact, isOwner } = await resolveOnCall(client);

  // Send SMS to on-call person
  await smsToOwner(contact.phone, client.twilioPhone, message);

  // If already going to owner, no escalation needed
  if (isOwner) return;

  // Track the escalation
  const [esc] = await db
    .insert(escalations)
    .values({
      clientId: client.id,
      originalContactId: contact.id,
      type,
      message,
      sentTo: contact.phone,
    })
    .returning();

  // Set up escalation timeout (if configured)
  const timeout = escalationTimeoutMs ?? getDefaultTimeout(type);
  if (timeout > 0) {
    setTimeout(async () => {
      try {
        // Check if the escalation was acknowledged
        const [current] = await db
          .select()
          .from(escalations)
          .where(eq(escalations.id, esc.id))
          .limit(1);

        if (current && !current.acknowledged) {
          // Not acknowledged — escalate to owner
          await db
            .update(escalations)
            .set({ escalatedToOwner: true, escalatedAt: new Date() })
            .where(eq(escalations.id, esc.id));

          const escalationMsg = `⚠️ ${contact.name} didn't respond (${type}). Escalating to you.\n\n${message}`;
          await smsToOwner(client.ownerPhone, client.twilioPhone, escalationMsg);
        }
      } catch (err) {
        console.error('Escalation check failed:', err instanceof Error ? err.message : err);
      }
    }, timeout).unref();
  }
}

/**
 * Mark an escalation as acknowledged (e.g., tech replies "OK" via SMS).
 */
// TODO: unused — planned for Phase 2
export async function acknowledgeEscalation(escalationId: string): Promise<void> {
  await db
    .update(escalations)
    .set({ acknowledged: true, acknowledgedAt: new Date() })
    .where(eq(escalations.id, escalationId));
}

function getDefaultTimeout(type: 'emergency' | 'booking' | 'voicemail'): number {
  switch (type) {
    case 'emergency': return 5 * 60 * 1000; // 5 minutes
    case 'booking': return 15 * 60 * 1000; // 15 minutes
    case 'voicemail': return 30 * 60 * 1000; // 30 minutes
  }
}

/**
 * Check if a time (HH:MM) falls within a range.
 * Handles overnight ranges (e.g., "22:00" to "06:00").
 */
function isTimeInRange(current: string, start: string, end: string): boolean {
  if (start <= end) {
    // Normal range: 08:00 to 17:00
    return current >= start && current < end;
  } else {
    // Overnight range: 22:00 to 06:00
    return current >= start || current < end;
  }
}
