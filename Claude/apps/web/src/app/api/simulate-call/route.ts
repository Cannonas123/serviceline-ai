import { NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { eq, sql } from "drizzle-orm";
import { randomUUID } from "crypto";
import { getAdminSession } from "@/lib/auth";

const firstNames = [
  "James", "Mary", "Robert", "Patricia", "John", "Jennifer", "Michael",
  "Linda", "David", "Barbara", "William", "Susan", "Richard", "Karen",
  "Thomas", "Nancy", "Charles", "Betty", "Daniel", "Margaret",
];

const issues = [
  "Water heater not producing hot water",
  "Leaking pipe under kitchen sink",
  "AC unit making loud noise",
  "Furnace won't turn on",
  "Toilet running constantly",
  "Garbage disposal jammed",
  "Thermostat not responding",
  "Drain clogged in bathroom",
  "Water pressure very low",
  "Pilot light keeps going out",
  "Sump pump not working",
  "Frozen pipes in basement",
  "HVAC system blowing cold air",
  "Faucet dripping constantly",
  "Sewage backup in basement",
];

const summaries = [
  "Caller reported an urgent issue. AI gathered contact info, assessed the situation, and booked an appointment for same-day service.",
  "First-time caller with a maintenance concern. AI explained services offered, captured details, and scheduled a diagnostic visit.",
  "Returning customer requesting follow-up service. AI recognized the caller, confirmed previous work, and booked a return visit.",
  "Emergency call outside business hours. AI triaged the situation, collected all necessary information, and arranged for next-available technician.",
  "Caller inquired about pricing. AI provided general ranges, explained the diagnostic process, and booked an estimate appointment.",
];

function randomItem<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomPhone(): string {
  const area = Math.floor(200 + Math.random() * 800);
  const mid = Math.floor(200 + Math.random() * 800);
  const end = Math.floor(1000 + Math.random() * 9000);
  return `+1${area}${mid}${end}`;
}

export async function POST(request: Request) {
  try {
    if (!(await getAdminSession())) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { clientId } = await request.json();

    if (!clientId) {
      return NextResponse.json(
        { error: "clientId is required" },
        { status: 400 }
      );
    }

    // Verify client exists
    const client = await db
      .select()
      .from(schema.clients)
      .where(eq(schema.clients.id, clientId))
      .then((rows) => rows[0]);

    if (!client) {
      return NextResponse.json(
        { error: "Client not found" },
        { status: 404 }
      );
    }

    const contactName = randomItem(firstNames) + " " + randomItem(firstNames).slice(0, 1) + ".";
    const contactPhone = randomPhone();
    const issue = randomItem(issues);
    const summary = randomItem(summaries);
    const ticketValue = parseFloat(client.avgTicketValue ?? "350");
    const revenueRescued = Math.round(ticketValue * (0.7 + Math.random() * 0.6));
    const durationSeconds = Math.floor(120 + Math.random() * 300);
    const scheduledAt = new Date(
      Date.now() + (1 + Math.floor(Math.random() * 3)) * 24 * 60 * 60 * 1000
    );
    const today = new Date().toISOString().slice(0, 10);

    // Create lead
    const [lead] = await db
      .insert(schema.leads)
      .values({
        clientId,
        contactName,
        contactPhone,
        issueDescription: issue,
        issueCategory: "service",
        urgency: Math.floor(1 + Math.random() * 5),
        source: "voice",
        status: "booked",
        revenueRescued: revenueRescued.toString(),
      })
      .returning();

    // Create call
    const [call] = await db
      .insert(schema.calls)
      .values({
        clientId,
        leadId: lead.id,
        callerPhone: contactPhone,
        twilioCallSid: `CA${randomUUID().replace(/-/g, "")}`,
        status: "answered_ai",
        durationSeconds,
        aiSummary: summary,
        appointmentBooked: true,
      })
      .returning();

    // Create appointment
    const [appointment] = await db
      .insert(schema.appointments)
      .values({
        clientId,
        leadId: lead.id,
        contactName,
        contactPhone,
        issueDescription: issue,
        scheduledAt,
        status: "scheduled",
        urgency: "normal",
      })
      .returning();

    // Upsert revenue metrics for today
    await db.execute(sql`
      INSERT INTO revenue_metrics (id, client_id, date, calls_rescued, leads_created, appointments_booked, estimated_revenue_rescued)
      VALUES (gen_random_uuid(), ${clientId}, ${today}, 1, 1, 1, ${revenueRescued})
      ON CONFLICT (client_id, date) DO UPDATE SET
        calls_rescued = revenue_metrics.calls_rescued + 1,
        leads_created = revenue_metrics.leads_created + 1,
        appointments_booked = revenue_metrics.appointments_booked + 1,
        estimated_revenue_rescued = revenue_metrics.estimated_revenue_rescued::numeric + ${revenueRescued}
    `);

    return NextResponse.json({
      success: true,
      callId: call.id,
      leadId: lead.id,
      appointmentId: appointment.id,
      revenueRescued,
      contactName,
      issue,
    });
  } catch (error) {
    console.error("Simulate call error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
