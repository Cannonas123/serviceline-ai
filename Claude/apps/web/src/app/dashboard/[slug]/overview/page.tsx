import { requireDashboardSession } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { eq, gte, and, sql, desc, lt } from "drizzle-orm";
import { notFound } from "next/navigation";
import OverviewCharts from "@/components/dashboard/OverviewCharts";

export const dynamic = "force-dynamic";

export default async function OverviewPage({
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

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - now.getDay());
  startOfWeek.setHours(0, 0, 0, 0);
  const startOfLastWeek = new Date(startOfWeek);
  startOfLastWeek.setDate(startOfLastWeek.getDate() - 7);
  const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);

  // ── Current month metrics ──
  const [thisMonth] = await db
    .select({
      revenueRescued: sql<number>`coalesce(sum(estimated_revenue_rescued::numeric), 0)::float`,
      callsRescued: sql<number>`coalesce(sum(calls_rescued), 0)::int`,
      appointmentsBooked: sql<number>`coalesce(sum(appointments_booked), 0)::int`,
      reviewsRequested: sql<number>`coalesce(sum(reviews_requested), 0)::int`,
      reviewsReceived: sql<number>`coalesce(sum(reviews_received), 0)::int`,
      leadsCreated: sql<number>`coalesce(sum(leads_created), 0)::int`,
    })
    .from(schema.revenueMetrics)
    .where(
      and(
        eq(schema.revenueMetrics.clientId, client.id),
        gte(schema.revenueMetrics.date, startOfMonth.toISOString().slice(0, 10))
      )
    );

  // ── Last month metrics (for MoM comparison) ──
  const [lastMonth] = await db
    .select({
      revenueRescued: sql<number>`coalesce(sum(estimated_revenue_rescued::numeric), 0)::float`,
      callsRescued: sql<number>`coalesce(sum(calls_rescued), 0)::int`,
      appointmentsBooked: sql<number>`coalesce(sum(appointments_booked), 0)::int`,
      reviewsReceived: sql<number>`coalesce(sum(reviews_received), 0)::int`,
      leadsCreated: sql<number>`coalesce(sum(leads_created), 0)::int`,
    })
    .from(schema.revenueMetrics)
    .where(
      and(
        eq(schema.revenueMetrics.clientId, client.id),
        gte(schema.revenueMetrics.date, startOfLastMonth.toISOString().slice(0, 10)),
        lt(schema.revenueMetrics.date, startOfMonth.toISOString().slice(0, 10))
      )
    );

  // ── This week call stats (for response time + after-hours) ──
  const [weekCallStats] = await db
    .select({
      totalCalls: sql<number>`count(*)::int`,
      aiAnswered: sql<number>`count(*) filter (where status = 'answered_ai')::int`,
      avgDuration: sql<number>`coalesce(avg(duration_seconds), 0)::float`,
      appointmentsBooked: sql<number>`count(*) filter (where appointment_booked = true)::int`,
    })
    .from(schema.calls)
    .where(
      and(
        eq(schema.calls.clientId, client.id),
        gte(schema.calls.createdAt, startOfWeek)
      )
    );

  // ── Last week call stats (for WoW) ──
  const [lastWeekCallStats] = await db
    .select({
      totalCalls: sql<number>`count(*)::int`,
      aiAnswered: sql<number>`count(*) filter (where status = 'answered_ai')::int`,
      appointmentsBooked: sql<number>`count(*) filter (where appointment_booked = true)::int`,
    })
    .from(schema.calls)
    .where(
      and(
        eq(schema.calls.clientId, client.id),
        gte(schema.calls.createdAt, startOfLastWeek),
        lt(schema.calls.createdAt, startOfWeek)
      )
    );

  // ── All-time totals ──
  const [allTime] = await db
    .select({
      revenueRescued: sql<number>`coalesce(sum(estimated_revenue_rescued::numeric), 0)::float`,
      callsRescued: sql<number>`coalesce(sum(calls_rescued), 0)::int`,
      appointmentsBooked: sql<number>`coalesce(sum(appointments_booked), 0)::int`,
    })
    .from(schema.revenueMetrics)
    .where(eq(schema.revenueMetrics.clientId, client.id));

  // ── 6-month trend (revenue + appointments) ──
  const monthlyTrend = await db
    .select({
      month: sql<string>`to_char(date::date, 'Mon')`,
      monthSort: sql<string>`to_char(date::date, 'YYYY-MM')`,
      revenue: sql<number>`coalesce(sum(estimated_revenue_rescued::numeric), 0)::float`,
      appointments: sql<number>`coalesce(sum(appointments_booked), 0)::int`,
      calls: sql<number>`coalesce(sum(calls_rescued), 0)::int`,
      leads: sql<number>`coalesce(sum(leads_created), 0)::int`,
    })
    .from(schema.revenueMetrics)
    .where(
      and(
        eq(schema.revenueMetrics.clientId, client.id),
        gte(schema.revenueMetrics.date, sixMonthsAgo.toISOString().slice(0, 10))
      )
    )
    .groupBy(sql`to_char(date::date, 'Mon')`, sql`to_char(date::date, 'YYYY-MM')`)
    .orderBy(sql`to_char(date::date, 'YYYY-MM')`);

  // ── Recent activity (last 5 calls) ──
  const recentCalls = await db
    .select({
      status: schema.calls.status,
      callerPhone: schema.calls.callerPhone,
      aiSummary: schema.calls.aiSummary,
      appointmentBooked: schema.calls.appointmentBooked,
      createdAt: schema.calls.createdAt,
      durationSeconds: schema.calls.durationSeconds,
    })
    .from(schema.calls)
    .where(eq(schema.calls.clientId, client.id))
    .orderBy(desc(schema.calls.createdAt))
    .limit(5);

  // ── Computed KPIs ──
  const revenueRescued = Math.round(thisMonth?.revenueRescued ?? 0);
  const callsRescued = thisMonth?.callsRescued ?? 0;
  const appointmentsBooked = thisMonth?.appointmentsBooked ?? 0;
  const reviewsReceived = thisMonth?.reviewsReceived ?? 0;
  const leadsCreated = thisMonth?.leadsCreated ?? 0;

  const prevRevenue = Math.round(lastMonth?.revenueRescued ?? 0);
  const prevCalls = lastMonth?.callsRescued ?? 0;
  const prevAppointments = lastMonth?.appointmentsBooked ?? 0;
  const prevReviews = lastMonth?.reviewsReceived ?? 0;

  const weekCalls = weekCallStats?.totalCalls ?? 0;
  const weekAI = weekCallStats?.aiAnswered ?? 0;
  const weekAppts = weekCallStats?.appointmentsBooked ?? 0;
  const lastWeekCalls = lastWeekCallStats?.totalCalls ?? 0;
  const lastWeekAppts = lastWeekCallStats?.appointmentsBooked ?? 0;

  const allTimeRevenue = Math.round(allTime?.revenueRescued ?? 0);
  const allTimeAppts = allTime?.appointmentsBooked ?? 0;

  // Revenue per rescued call
  const revenuePerCall = callsRescued > 0 ? Math.round(revenueRescued / callsRescued) : 0;

  // Call→Appointment conversion rate (this month)
  const conversionRate = callsRescued > 0 ? Math.round((appointmentsBooked / callsRescued) * 100) : 0;

  // AI answer rate this week
  const aiAnswerRate = weekCalls > 0 ? Math.round((weekAI / weekCalls) * 100) : 0;

  const chartData = monthlyTrend.map((row) => ({
    month: row.month,
    revenue: Math.round(row.revenue),
    appointments: row.appointments,
    calls: row.calls,
    leads: row.leads,
  }));

  return (
    <div>
      {/* Revenue Rescued — hero card */}
      <div
        className="relative rounded-2xl border border-amber-500/20 overflow-hidden"
        style={{
          background:
            "linear-gradient(135deg, rgba(245, 158, 11, 0.05) 0%, transparent 60%)",
        }}
      >
        <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative p-10 sm:p-14 text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-amber-500/20 bg-amber-500/5 px-4 py-1.5 text-xs font-medium text-amber-500 mb-6">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse-gold" />
            Revenue Rescued This Month
          </div>

          <p className="text-6xl sm:text-8xl font-bold font-mono text-amber-500 tracking-tight glow-gold">
            ${revenueRescued.toLocaleString()}
          </p>

          <div className="mt-4 flex items-center justify-center gap-4">
            <span className="text-sm text-slate-500">
              {now.toLocaleString("default", {
                month: "long",
                year: "numeric",
              })}
            </span>
            {prevRevenue > 0 && (
              <DeltaBadge current={revenueRescued} previous={prevRevenue} label="vs last month" />
            )}
          </div>

          {allTimeRevenue > revenueRescued && (
            <p className="mt-3 text-xs text-slate-600 font-mono">
              ${allTimeRevenue.toLocaleString()} rescued all-time
            </p>
          )}
        </div>
      </div>

      {/* Primary KPI cards */}
      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <KPICard
          label="Calls Rescued"
          value={callsRescued}
          icon="📞"
          prevValue={prevCalls}
          comparisonLabel="vs last month"
        />
        <KPICard
          label="Appointments Booked"
          value={appointmentsBooked}
          icon="📅"
          prevValue={prevAppointments}
          comparisonLabel="vs last month"
          accentPositive
        />
        <KPICard
          label="Revenue Per Call"
          value={revenuePerCall}
          icon="💰"
          prefix="$"
        />
        <KPICard
          label="Reviews Collected"
          value={reviewsReceived}
          icon="⭐"
          prevValue={prevReviews}
          comparisonLabel="vs last month"
        />
      </div>

      {/* Secondary KPI row — conversion & response metrics */}
      <div className="mt-4 grid grid-cols-3 gap-4">
        <MiniKPI
          label="Call→Booking Rate"
          value={`${conversionRate}%`}
          detail={`${appointmentsBooked} of ${callsRescued} calls`}
        />
        <MiniKPI
          label="AI Answer Rate"
          value={`${aiAnswerRate}%`}
          detail={`${weekAI} of ${weekCalls} calls this week`}
        />
        <MiniKPI
          label="This Week"
          value={weekCalls.toString()}
          detail={
            lastWeekCalls > 0
              ? `${weekCalls >= lastWeekCalls ? "+" : ""}${weekCalls - lastWeekCalls} vs last week`
              : "calls handled"
          }
          detailColor={weekCalls >= lastWeekCalls ? "text-emerald-400" : "text-red-400"}
        />
      </div>

      {/* Charts */}
      <div className="mt-6 rounded-xl border border-slate-800 bg-slate-900/50 p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-base font-semibold text-white">6-Month Trend</h2>
          <span className="text-xs text-slate-500 font-mono">
            Revenue + Appointments
          </span>
        </div>
        {chartData.length > 0 ? (
          <OverviewCharts data={chartData} />
        ) : (
          <p className="text-sm text-slate-600 text-center py-16">
            Not enough data yet — check back after your first week.
          </p>
        )}
      </div>

      {/* Recent Activity */}
      {recentCalls.length > 0 && (
        <div className="mt-6">
          <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3">
            Recent Activity
          </h2>
          <div className="space-y-2">
            {recentCalls.map((call, i) => (
              <div
                key={i}
                className="flex items-center gap-3 rounded-lg border border-slate-800/50 bg-slate-900/30 px-4 py-3"
              >
                <span
                  className={`h-2 w-2 rounded-full flex-shrink-0 ${
                    call.status === "answered_ai"
                      ? "bg-emerald-500"
                      : call.status === "answered_human"
                        ? "bg-blue-500"
                        : call.status === "voicemail"
                          ? "bg-yellow-500"
                          : "bg-red-500"
                  }`}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-white font-medium">
                      {call.status === "answered_ai"
                        ? "AI Answered"
                        : call.status === "answered_human"
                          ? "Human Answered"
                          : call.status === "voicemail"
                            ? "Voicemail"
                            : "Missed"}
                    </span>
                    {call.appointmentBooked && (
                      <span className="text-xs bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/20 rounded-full px-2 py-0.5">
                        Booked
                      </span>
                    )}
                  </div>
                  {call.aiSummary && (
                    <p className="text-xs text-slate-500 truncate mt-0.5">
                      {call.aiSummary}
                    </p>
                  )}
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-xs text-slate-500">
                    {call.createdAt
                      ? new Date(call.createdAt).toLocaleString("en-US", {
                          month: "short",
                          day: "numeric",
                          hour: "numeric",
                          minute: "2-digit",
                        })
                      : "-"}
                  </p>
                  {call.durationSeconds && (
                    <p className="text-xs text-slate-600 font-mono">
                      {Math.floor(call.durationSeconds / 60)}:{(call.durationSeconds % 60).toString().padStart(2, "0")}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Components ──

function DeltaBadge({
  current,
  previous,
  label,
}: {
  current: number;
  previous: number;
  label: string;
}) {
  if (previous === 0) return null;
  const pct = Math.round(((current - previous) / previous) * 100);
  const isUp = pct >= 0;

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${
        isUp
          ? "bg-emerald-500/10 text-emerald-400"
          : "bg-red-500/10 text-red-400"
      }`}
    >
      <svg
        className={`h-3 w-3 ${isUp ? "" : "rotate-180"}`}
        fill="none"
        viewBox="0 0 24 24"
        strokeWidth={2.5}
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M4.5 19.5l7.5-7.5 7.5 7.5"
        />
      </svg>
      {isUp ? "+" : ""}
      {pct}% {label}
    </span>
  );
}

function KPICard({
  label,
  value,
  icon,
  prefix,
  prevValue,
  comparisonLabel,
  accentPositive,
}: {
  label: string;
  value: number;
  icon: string;
  prefix?: string;
  prevValue?: number;
  comparisonLabel?: string;
  accentPositive?: boolean;
}) {
  const delta =
    prevValue !== undefined && prevValue > 0
      ? Math.round(((value - prevValue) / prevValue) * 100)
      : null;

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-5 card-hover">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">
          {label}
        </p>
        <span className="text-lg">{icon}</span>
      </div>
      <p className="mt-2 text-2xl font-bold font-mono text-white">
        {prefix}
        {value.toLocaleString()}
      </p>
      {delta !== null && (
        <p
          className={`mt-1.5 text-xs font-medium ${
            delta >= 0
              ? accentPositive
                ? "text-emerald-400"
                : "text-emerald-400/70"
              : "text-red-400/70"
          }`}
        >
          {delta >= 0 ? "↑" : "↓"} {Math.abs(delta)}% {comparisonLabel}
        </p>
      )}
    </div>
  );
}

function MiniKPI({
  label,
  value,
  detail,
  detailColor,
}: {
  label: string;
  value: string;
  detail: string;
  detailColor?: string;
}) {
  return (
    <div className="rounded-lg border border-slate-800/60 bg-slate-900/30 px-4 py-3">
      <p className="text-xs text-slate-500 font-medium">{label}</p>
      <p className="mt-1 text-lg font-bold font-mono text-white">{value}</p>
      <p className={`mt-0.5 text-xs ${detailColor ?? "text-slate-600"}`}>
        {detail}
      </p>
    </div>
  );
}
