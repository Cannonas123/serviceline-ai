import { requireDashboardSession } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { eq, desc } from "drizzle-orm";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function ClientsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  await requireDashboardSession(slug);

  const client = await db
    .select()
    .from(schema.clients)
    .where(eq(schema.clients.slug, slug))
    .then((rows) => rows[0]);

  if (!client) notFound();

  // Get all leads with their related calls and appointments
  const leadsWithActivity = await db
    .select({
      leadId: schema.leads.id,
      contactName: schema.leads.contactName,
      contactPhone: schema.leads.contactPhone,
      issueDescription: schema.leads.issueDescription,
      issueCategory: schema.leads.issueCategory,
      urgency: schema.leads.urgency,
      source: schema.leads.source,
      status: schema.leads.status,
      revenueRescued: schema.leads.revenueRescued,
      createdAt: schema.leads.createdAt,
    })
    .from(schema.leads)
    .where(eq(schema.leads.clientId, client.id))
    .orderBy(desc(schema.leads.createdAt))
    .limit(50);

  // Get calls for this client, grouped by lead
  const recentCalls = await db
    .select({
      id: schema.calls.id,
      leadId: schema.calls.leadId,
      callerPhone: schema.calls.callerPhone,
      status: schema.calls.status,
      durationSeconds: schema.calls.durationSeconds,
      aiSummary: schema.calls.aiSummary,
      appointmentBooked: schema.calls.appointmentBooked,
      emergencyEscalated: schema.calls.emergencyEscalated,
      createdAt: schema.calls.createdAt,
    })
    .from(schema.calls)
    .where(eq(schema.calls.clientId, client.id))
    .orderBy(desc(schema.calls.createdAt))
    .limit(100);

  // Get appointments
  const appointments = await db
    .select({
      id: schema.appointments.id,
      leadId: schema.appointments.leadId,
      contactName: schema.appointments.contactName,
      contactPhone: schema.appointments.contactPhone,
      contactAddress: schema.appointments.contactAddress,
      issueDescription: schema.appointments.issueDescription,
      scheduledAt: schema.appointments.scheduledAt,
      urgency: schema.appointments.urgency,
      customerNotes: schema.appointments.customerNotes,
      status: schema.appointments.status,
    })
    .from(schema.appointments)
    .where(eq(schema.appointments.clientId, client.id))
    .orderBy(desc(schema.appointments.scheduledAt))
    .limit(50);

  // Map calls and appointments by lead ID
  const callsByLead = new Map<string, typeof recentCalls>();
  const orphanCalls: typeof recentCalls = [];
  recentCalls.forEach((call) => {
    if (call.leadId) {
      const existing = callsByLead.get(call.leadId) ?? [];
      existing.push(call);
      callsByLead.set(call.leadId, existing);
    } else {
      orphanCalls.push(call);
    }
  });

  const apptsByLead = new Map<string, (typeof appointments)[0]>();
  appointments.forEach((appt) => {
    if (appt.leadId) apptsByLead.set(appt.leadId, appt);
  });

  // Summary counts
  const aiHandled = recentCalls.filter((c) => c.status === "answered_ai").length;
  const booked = recentCalls.filter((c) => c.appointmentBooked).length;
  const escalated = recentCalls.filter((c) => c.emergencyEscalated).length;

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Customer Interactions</h1>
          <p className="mt-1 text-sm text-slate-500">
            Every call AI answered — what they needed, what happened, next steps
          </p>
        </div>
        <div className="flex gap-3">
          <MiniStat label="AI Handled" value={aiHandled} />
          <MiniStat label="Booked" value={booked} color="text-emerald-400" />
          {escalated > 0 && (
            <MiniStat label="Escalated" value={escalated} color="text-red-400" />
          )}
        </div>
      </div>

      {/* Briefing Cards */}
      <div className="mt-6 space-y-3">
        {leadsWithActivity.map((lead) => {
          const calls = callsByLead.get(lead.leadId) ?? [];
          const appointment = apptsByLead.get(lead.leadId);
          const latestCall = calls[0];
          const wasAI = calls.some((c) => c.status === "answered_ai");
          const wasBooked = calls.some((c) => c.appointmentBooked);
          const wasEscalated = calls.some((c) => c.emergencyEscalated);

          return (
            <BriefingCard
              key={lead.leadId}
              contactName={lead.contactName}
              contactPhone={lead.contactPhone}
              issue={lead.issueDescription}
              category={lead.issueCategory}
              urgency={lead.urgency}
              source={lead.source}
              status={lead.status}
              revenueRescued={lead.revenueRescued}
              createdAt={lead.createdAt}
              aiSummary={latestCall?.aiSummary ?? null}
              callDuration={latestCall?.durationSeconds ?? null}
              wasAI={wasAI}
              wasBooked={wasBooked}
              wasEscalated={wasEscalated}
              appointment={appointment ?? null}
              callCount={calls.length}
            />
          );
        })}

        {/* Orphan calls (no lead attached) */}
        {orphanCalls
          .filter((c) => c.status === "answered_ai")
          .map((call) => (
            <BriefingCard
              key={call.id}
              contactName={null}
              contactPhone={call.callerPhone}
              issue={null}
              category={null}
              urgency={null}
              source="voice"
              status="new"
              revenueRescued={null}
              createdAt={call.createdAt}
              aiSummary={call.aiSummary}
              callDuration={call.durationSeconds}
              wasAI={call.status === "answered_ai"}
              wasBooked={call.appointmentBooked ?? false}
              wasEscalated={call.emergencyEscalated ?? false}
              appointment={null}
              callCount={1}
            />
          ))}

        {leadsWithActivity.length === 0 && orphanCalls.length === 0 && (
          <div className="text-center py-16">
            <p className="text-sm text-slate-600">No customer interactions yet.</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Components ──

function MiniStat({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color?: string;
}) {
  return (
    <div className="text-right">
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`text-lg font-bold font-mono ${color ?? "text-white"}`}>
        {value}
      </p>
    </div>
  );
}

function BriefingCard({
  contactName,
  contactPhone,
  issue,
  category,
  urgency,
  source,
  status,
  revenueRescued,
  createdAt,
  aiSummary,
  callDuration,
  wasAI,
  wasBooked,
  wasEscalated,
  appointment,
  callCount,
}: {
  contactName: string | null;
  contactPhone: string;
  issue: string | null;
  category: string | null;
  urgency: number | null;
  source: string;
  status: string;
  revenueRescued: string | null;
  createdAt: Date | null;
  aiSummary: string | null;
  callDuration: number | null;
  wasAI: boolean;
  wasBooked: boolean;
  wasEscalated: boolean;
  appointment: {
    contactAddress: string | null;
    scheduledAt: Date;
    urgency: string | null;
    customerNotes: string | null;
    status: string;
  } | null;
  callCount: number;
}) {
  const phone = contactPhone.length > 4
    ? contactPhone.slice(0, -4).replace(/\d/g, "•") + contactPhone.slice(-4)
    : contactPhone;

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          {/* Status dot */}
          <span
            className={`mt-0.5 h-2.5 w-2.5 rounded-full flex-shrink-0 ${
              wasEscalated
                ? "bg-red-500"
                : wasBooked
                  ? "bg-emerald-500"
                  : wasAI
                    ? "bg-blue-500"
                    : "bg-slate-500"
            }`}
          />
          <div>
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold text-white">
                {contactName ?? phone}
              </p>
              {contactName && (
                <span className="text-xs text-slate-600 font-mono">{phone}</span>
              )}
            </div>
            {/* Tags row */}
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              {wasAI && (
                <Tag label="AI Answered" variant="blue" />
              )}
              {wasBooked && (
                <Tag label="Booked" variant="green" />
              )}
              {wasEscalated && (
                <Tag label="Escalated" variant="red" />
              )}
              {category && (
                <Tag label={category} variant="gray" />
              )}
              {urgency !== null && urgency >= 4 && (
                <Tag label="Urgent" variant="yellow" />
              )}
            </div>
          </div>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="text-xs text-slate-500">
            {createdAt
              ? new Date(createdAt).toLocaleString("en-US", {
                  month: "short",
                  day: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                })
              : "-"}
          </p>
          {callDuration !== null && (
            <p className="text-xs text-slate-600 font-mono mt-0.5">
              {Math.floor(callDuration / 60)}:{(callDuration % 60).toString().padStart(2, "0")}
            </p>
          )}
          {callCount > 1 && (
            <p className="text-xs text-slate-600 mt-0.5">{callCount} calls</p>
          )}
        </div>
      </div>

      {/* What they needed */}
      {issue && (
        <div className="mt-3 pl-5.5">
          <p className="text-xs text-slate-500 font-medium uppercase tracking-wide mb-0.5">
            Issue
          </p>
          <p className="text-sm text-slate-300">{issue}</p>
        </div>
      )}

      {/* What AI did */}
      {aiSummary && (
        <div className="mt-2.5 pl-5.5">
          <p className="text-xs text-slate-500 font-medium uppercase tracking-wide mb-0.5">
            AI Action
          </p>
          <p className="text-sm text-slate-400 leading-relaxed">{aiSummary}</p>
        </div>
      )}

      {/* Appointment details */}
      {appointment && (
        <div className="mt-3 ml-5.5 rounded-lg border border-emerald-500/10 bg-emerald-500/5 px-4 py-3">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-xs font-semibold text-emerald-400 uppercase tracking-wide">
              Appointment Booked
            </span>
            <span className={`text-xs rounded-full px-2 py-0.5 ${
              appointment.status === "scheduled"
                ? "bg-emerald-500/10 text-emerald-400"
                : appointment.status === "completed"
                  ? "bg-blue-500/10 text-blue-400"
                  : "bg-slate-500/10 text-slate-400"
            }`}>
              {appointment.status}
            </span>
          </div>
          <p className="text-sm text-white font-medium">
            {new Date(appointment.scheduledAt).toLocaleString("en-US", {
              weekday: "short",
              month: "short",
              day: "numeric",
              hour: "numeric",
              minute: "2-digit",
            })}
          </p>
          {appointment.contactAddress && (
            <p className="text-xs text-slate-400 mt-1">{appointment.contactAddress}</p>
          )}
          {appointment.customerNotes && (
            <p className="text-xs text-slate-500 mt-1 italic">{appointment.customerNotes}</p>
          )}
        </div>
      )}

      {/* Revenue rescued */}
      {revenueRescued && Number(revenueRescued) > 0 && (
        <div className="mt-3 pl-5.5">
          <span className="text-xs font-medium text-amber-500/70">
            ${Math.round(Number(revenueRescued)).toLocaleString()} rescued
          </span>
        </div>
      )}
    </div>
  );
}

function Tag({
  label,
  variant,
}: {
  label: string;
  variant: "green" | "blue" | "red" | "yellow" | "gray";
}) {
  const colors = {
    green: "bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/20",
    blue: "bg-blue-500/10 text-blue-400 ring-1 ring-blue-500/20",
    red: "bg-red-500/10 text-red-400 ring-1 ring-red-500/20",
    yellow: "bg-yellow-500/10 text-yellow-400 ring-1 ring-yellow-500/20",
    gray: "bg-slate-500/10 text-slate-400 ring-1 ring-slate-500/20",
  };

  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${colors[variant]}`}>
      {label}
    </span>
  );
}
