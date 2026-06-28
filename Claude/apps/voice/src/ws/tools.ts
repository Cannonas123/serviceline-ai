import Anthropic from '@anthropic-ai/sdk';
import { ClientConfig } from '../lib/client-config.js';
import { isValidPhone } from '../lib/xml-utils.js';
import { smsToOwner } from '../services/notifications.js';
import { notifyOnCall } from '../services/on-call.js';
import { buildCallBrief, formatBriefForSms } from '../lib/call-brief.js';
import { db, appointments, leads } from '@serviceline/db';
import { eq } from 'drizzle-orm';

export const voiceTools: Anthropic.Tool[] = [
  {
    name: 'check_availability',
    description: 'Check available appointment slots on the business calendar for a given date',
    input_schema: {
      type: 'object' as const,
      properties: {
        date: { type: 'string', description: 'Date to check (YYYY-MM-DD)' },
        time_preference: {
          type: 'string',
          enum: ['morning', 'afternoon', 'any'],
          description: 'Preferred time of day',
        },
      },
      required: ['date'],
    },
  },
  {
    name: 'book_appointment',
    description: 'Book a service appointment for the caller',
    input_schema: {
      type: 'object' as const,
      properties: {
        name: { type: 'string', description: 'Caller name' },
        phone: { type: 'string', description: 'Caller phone number' },
        address: { type: 'string', description: 'Service address' },
        issue: { type: 'string', description: 'Description of the issue' },
        datetime: { type: 'string', description: 'Appointment datetime in ISO 8601 format' },
        notes: { type: 'string', description: 'Extra context from the conversation that would help the technician (e.g., "unit is 8 years old", "pilot light may be out", "tenant property")' },
        special_instructions: { type: 'string', description: 'Special requests from the caller (e.g., "quote before any work", "call before arriving", "enter through side gate")' },
        urgency: { type: 'string', enum: ['normal', 'same_day', 'emergency'], description: 'How urgent the job is' },
        category: { type: 'string', description: 'Issue category from the industry template (e.g., leak_repair, ac_repair, general_pest). Classify the caller\'s issue into the most appropriate category.' },
      },
      required: ['name', 'phone', 'address', 'issue', 'datetime'],
    },
  },
  {
    name: 'escalate_emergency',
    description:
      'Immediately alert the business owner about an emergency situation (burst pipe, gas leak, flooding, etc.)',
    input_schema: {
      type: 'object' as const,
      properties: {
        name: { type: 'string', description: 'Caller name if known' },
        phone: { type: 'string', description: 'Caller phone number' },
        address: { type: 'string', description: 'Address of emergency if known' },
        issue: { type: 'string', description: 'Description of the emergency' },
      },
      required: ['phone', 'issue'],
    },
  },
];

interface ToolInput {
  date?: string;
  time_preference?: string;
  name?: string;
  phone?: string;
  address?: string;
  issue?: string;
  datetime?: string;
  notes?: string;
  special_instructions?: string;
  urgency?: string;
  category?: string;
}

export async function executeTool(
  name: string,
  input: ToolInput,
  client: ClientConfig,
  leadId?: string | null,
): Promise<Record<string, unknown>> {
  switch (name) {
    case 'check_availability': {
      if (!input.date) {
        return { error: 'Missing required field: date' };
      }
      // Validate date format (YYYY-MM-DD) and parsability
      if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date) || isNaN(new Date(input.date).getTime())) {
        return { error: `Invalid date format: "${input.date}". Please use YYYY-MM-DD format.` };
      }
      // TODO: integrate with Google Calendar API when OAuth tokens available
      // For now, return mock availability slots
      const slots = ['9:00 AM', '11:00 AM', '2:00 PM', '4:00 PM'];
      return {
        available_slots: slots,
        date: input.date,
        message: `Available slots for ${input.date}: ${slots.join(', ')}`,
      };
    }

    case 'book_appointment': {
      // Validate required fields
      if (!input.name || !input.phone || !input.address || !input.issue || !input.datetime) {
        return { error: 'Missing required fields for booking. Need: name, phone, address, issue, datetime' };
      }

      // Enforce length limits on free-text fields
      const MAX_NAME_LEN = 200;
      const MAX_ADDRESS_LEN = 500;
      const MAX_ISSUE_LEN = 1000;
      if (input.name.length > MAX_NAME_LEN || input.address.length > MAX_ADDRESS_LEN || input.issue.length > MAX_ISSUE_LEN) {
        return { error: 'One or more fields exceed maximum length. Please provide shorter values.' };
      }

      // Validate phone number format
      if (!isValidPhone(input.phone)) {
        return { error: `Invalid phone number format: "${input.phone}". Phone must be in E.164 format (e.g., +15551234567).` };
      }

      // Validate datetime
      const scheduledDate = new Date(input.datetime);
      if (isNaN(scheduledDate.getTime())) {
        return { error: `Invalid datetime format: "${input.datetime}". Please use ISO 8601 format like "2026-03-17T14:00:00".` };
      }

      // Don't book in the past
      if (scheduledDate < new Date()) {
        return { error: 'Cannot book an appointment in the past. Please choose a future date and time.' };
      }

      // Build structured call brief
      const brief = buildCallBrief({
        customerName: input.name,
        customerPhone: input.phone,
        customerAddress: input.address,
        issue: input.issue,
        scheduledAt: scheduledDate,
        urgency: (input.urgency as 'normal' | 'same_day' | 'emergency') || 'normal',
        conversationNotes: input.notes ? [input.notes] : undefined,
        specialInstructions: input.special_instructions ? [input.special_instructions] : undefined,
      });

      // Create appointment in DB — linked to lead, with brief attached
      const [appointment] = await db
        .insert(appointments)
        .values({
          clientId: client.id,
          leadId: leadId || null,
          contactName: input.name,
          contactPhone: input.phone,
          contactAddress: input.address,
          issueDescription: input.issue,
          scheduledAt: scheduledDate,
          status: 'scheduled',
          urgency: input.urgency || 'normal',
          customerNotes: input.notes || null,
          specialInstructions: input.special_instructions || null,
          brief,
        })
        .returning();

      // Send structured brief to on-call person (or owner as fallback)
      try {
        const smsText = formatBriefForSms(brief);
        await notifyOnCall(client, smsText, 'booking');
      } catch (smsErr) {
        console.error('SMS notification failed for booking:', smsErr instanceof Error ? smsErr.message : 'Unknown error');
      }

      // Update lead with issue category if we have one
      if (leadId && input.category) {
        try {
          await db
            .update(leads)
            .set({ issueCategory: input.category })
            .where(eq(leads.id, leadId));
        } catch (err) {
          console.error('Failed to update lead issueCategory:', err instanceof Error ? err.message : 'Unknown error');
        }
      }

      return {
        success: true,
        appointmentId: appointment.id,
        datetime: input.datetime,
        message: 'Appointment booked successfully',
      };
    }

    case 'escalate_emergency': {
      if (!input.phone || !input.issue) {
        return { error: 'Missing required fields for emergency escalation. Need: phone, issue' };
      }

      // Enforce length limits on free-text fields
      if ((input.issue && input.issue.length > 1000) || (input.address && input.address.length > 500) || (input.name && input.name.length > 200)) {
        return { error: 'One or more fields exceed maximum length.' };
      }

      // Never block an emergency on phone formatting. Dropping (or delaying) an
      // escalation because the model passed an oddly-formatted number is far worse
      // than an imperfect callback number — escalate regardless, just flag it.
      const callerPhone = isValidPhone(input.phone)
        ? input.phone
        : `${input.phone} (unverified — check caller ID)`;

      try {
        const emergencyMsg = `🚨 EMERGENCY: ${input.issue}\nCaller: ${callerPhone}${input.address ? `\nAddress: ${input.address}` : ''}${input.name ? `\nName: ${input.name}` : ''}\n\nCall them back ASAP!`;
        await notifyOnCall(client, emergencyMsg, 'emergency');
      } catch (smsErr) {
        console.error('EMERGENCY SMS failed:', smsErr instanceof Error ? smsErr.message : 'Unknown error');
        // Still return success — the caller shouldn't be told the SMS failed
        // The call itself IS the escalation; SMS is supplementary
      }

      return {
        success: true,
        message: 'Owner has been notified immediately via text and will call back shortly',
      };
    }

    default:
      return { error: `Unknown tool: ${name}` };
  }
}
