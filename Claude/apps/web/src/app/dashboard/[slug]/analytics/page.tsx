import { requireDashboardSession } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { eq, gte, lt, and, sql, desc } from "drizzle-orm";
import { notFound } from "next/navigation";
import AnalyticsCharts from "@/components/dashboard/AnalyticsCharts";

export const dynamic = "force-dynamic";

export default async function AnalyticsPage({
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
  const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);

  // ── This month vs last month aggregate ──
  const [thisMonthAgg, lastMonthAgg] = await Promise.all([
    db
      .select({
        revenue: sql<number>`coalesce(sum(estimated_revenue_rescued::numeric), 0)::float`,
        calls: sql<number>`coalesce(sum(calls_rescued), 0)::int`,
        leads: sql<number>`coalesce(sum(leads_created), 0)::int`,
        appointments: sql<number>`coalesce(sum(appointments_booked), 0)::int`,
        reviewsRequested: sql<number>`coalesce(sum(reviews_requested), 0)::int`,
        reviewsReceived: sql<number>`coalesce(sum(reviews_received), 0)::int`,
      })
      .from(schema.revenueMetrics)
      .where(
        and(
          eq(schema.revenueMetrics.clientId, client.id),
          gte(schema.revenueMetrics.date, startOfMonth.toISOString().slice(0, 10))
        )
      )
      .then((r) => r[0]),
    db
      .select({
        revenue: sql<number>`coalesce(sum(estimated_revenue_rescued::numeric), 0)::float`,
        calls: sql<number>`coalesce(sum(calls_rescued), 0)::int`,
        leads: sql<number>`coalesce(sum(leads_created), 0)::int`,
        appointments: sql<number>`coalesce(sum(appointments_booked), 0)::int`,
        reviewsReceived: sql<number>`coalesce(sum(reviews_received), 0)::int`,
      })
      .from(schema.revenueMetrics)
      .where(
        and(
          eq(schema.revenueMetrics.clientId, client.id),
          gte(schema.revenueMetrics.date, startOfLastMonth.toISOString().slice(0, 10)),
          lt(schema.revenueMetrics.date, startOfMonth.toISOString().slice(0, 10))
        )
      )
      .then((r) => r[0]),
  ]);

  // ── Call breakdown by status (this month) ──
  const callBreakdown = await db
    .select({
      status: schema.calls.status,
      count: sql<number>`count(*)::int`,
    })
    .from(schema.calls)
    .where(
      and(
        eq(schema.calls.clientId, client.id),
        gte(schema.calls.createdAt, startOfMonth)
      )
    )
    .groupBy(schema.calls.status);

  // ── Daily trend (last 30 days) ──
  const thirtyDaysAgo = new Date(now);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const dailyTrend = await db
    .select({
      day: sql<string>`to_char(date::date, 'Mon DD')`,
      daySort: sql<string>`to_char(date::date, 'YYYY-MM-DD')`,
      revenue: sql<number>`coalesce(sum(estimated_revenue_rescued::numeric), 0)::float`,
      calls: sql<number>`coalesce(sum(calls_rescued), 0)::int`,
      appointments: sql<number>`coalesce(sum(appointments_booked), 0)::int`,
      leads: sql<number>`coalesce(sum(leads_created), 0)::int`,
    })
    .from(schema.revenueMetrics)
    .where(
      and(
        eq(schema.revenueMetrics.clientId, client.id),
        gte(schema.revenueMetrics.date, thirtyDaysAgo.toISOString().slice(0, 10))
      )
    )
    .groupBy(sql`to_char(date::date, 'Mon DD')`, sql`to_char(date::date, 'YYYY-MM-DD')`)
    .orderBy(sql`to_char(date::date, 'YYYY-MM-DD')`);

  // ── Monthly trend (6 months) ──
  const monthlyTrend = await db
    .select({
      month: sql<string>`to_char(date::date, 'Mon')`,
      monthSort: sql<string>`to_char(date::date, 'YYYY-MM')`,
      revenue: sql<number>`coalesce(sum(estimated_revenue_rescued::numeric), 0)::float`,
      calls: sql<number>`coalesce(sum(calls_rescued), 0)::int`,
      appointments: sql<number>`coalesce(sum(appointments_booked), 0)::int`,
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

  // ── Avg call duration & response metrics ──
  const [callMetrics] = await db
    .select({
      avgDuration: sql<number>`coalesce(avg(duration_seconds), 0)::float`,
      totalCalls: sql<number>`count(*)::int`,
      aiCalls: sql<number>`count(*) filter (where status = 'answered_ai')::int`,
      bookedCalls: sql<number>`count(*) filter (where appointment_booked = true)::int`,
    })
    .from(schema.calls)
    .where(
      and(
        eq(schema.calls.clientId, client.id),
        gte(schema.calls.createdAt, startOfMonth)
      )
    );

  // ── Review metrics ──
  const [reviewMetrics] = await db
    .select({
      avgRating: sql<number>`coalesce(avg(review_rating)::numeric(2,1), 0)::float`,
      totalReceived: sql<number>`count(*) filter (where review_received = true)::int`,
      totalRequested: sql<number>`count(*)::int`,
    })
    .from(schema.reviews)
    .where(eq(schema.reviews.clientId, client.id));

  // ── Assemble data ──
  const rev = Math.round(thisMonthAgg?.revenue ?? 0);
  const prevRev = Math.round(lastMonthAgg?.revenue ?? 0);
  const calls = thisMonthAgg?.calls ?? 0;
  const prevCalls = lastMonthAgg?.calls ?? 0;
  const appts = thisMonthAgg?.appointments ?? 0;
  const prevAppts = lastMonthAgg?.appointments ?? 0;
  const leads = thisMonthAgg?.leads ?? 0;
  const prevLeads = lastMonthAgg?.leads ?? 0;
  const reviews = thisMonthAgg?.reviewsReceived ?? 0;
  const prevReviews = lastMonthAgg?.reviewsReceived ?? 0;

  const totalCallsMonth = callMetrics?.totalCalls ?? 0;
  const aiCallsMonth = callMetrics?.aiCalls ?? 0;
  const bookedCallsMonth = callMetrics?.bookedCalls ?? 0;
  const avgDuration = Math.round(callMetrics?.avgDuration ?? 0);

  const callStatusMap: Record<string, number> = {};
  callBreakdown.forEach((row) => {
    callStatusMap[row.status] = row.count;
  });

  const chartDaily = dailyTrend.map((r) => ({
    day: r.day,
    revenue: Math.round(r.revenue),
    calls: r.calls,
    appointments: r.appointments,
    leads: r.leads,
  }));

  const chartMonthly = monthlyTrend.map((r) => ({
    month: r.month,
    revenue: Math.round(r.revenue),
    calls: r.calls,
    appointments: r.appointments,
    leads: r.leads,
  }));

  return (
    <div>
      <h1 className="text-2xl font-bold text-white">Analytics</h1>
      <p className="mt-1 text-sm text-slate-500">
        Performance data for{" "}
        {now.toLocaleString("default", { month: "long", year: "numeric" })}
      </p>

      {/* Top-line KPIs with MoM */}
      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-5">
        <MetricCard label="Revenue" value={`$${rev.toLocaleString()}`} prev={prevRev > 0 ? prevRev : undefined} current={rev} accent />
        <MetricCard label="Calls" value={calls.toString()} prev={prevCalls > 0 ? prevCalls : undefined} current={calls} />
        <MetricCard label="Leads" value={leads.toString()} prev={prevLeads > 0 ? prevLeads : undefined} current={leads} />
        <MetricCard label="Appointments" value={appts.toString()} prev={prevAppts > 0 ? prevAppts : undefined} current={appts} />
        <MetricCard label="Reviews" value={reviews.toString()} prev={prevReviews > 0 ? prevReviews : undefined} current={reviews} />
      </div>

      {/* Efficiency Metrics */}
      <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <MiniMetric
          label="AI Answer Rate"
          value={totalCallsMonth > 0 ? `${Math.round((aiCallsMonth / totalCallsMonth) * 100)}%` : "—"}
          sub={`${aiCallsMonth} of ${totalCallsMonth} calls`}
        />
        <MiniMetric
          label="Booking Rate"
          value={totalCallsMonth > 0 ? `${Math.round((bookedCallsMonth / totalCallsMonth) * 100)}%` : "—"}
          sub={`${bookedCallsMonth} appointments from calls`}
        />
        <MiniMetric
          label="Avg Call Duration"
          value={avgDuration > 0 ? `${Math.floor(avgDuration / 60)}:${(avgDuration % 60).toString().padStart(2, "0")}` : "—"}
          sub="minutes:seconds"
        />
        <MiniMetric
          label="Avg Review Rating"
          value={reviewMetrics?.avgRating ? reviewMetrics.avgRating.toFixed(1) : "—"}
          sub={`${reviewMetrics?.totalReceived ?? 0} of ${reviewMetrics?.totalRequested ?? 0} received`}
        />
      </div>

      {/* Call Status Breakdown */}
      <div className="mt-6 rounded-xl border border-slate-800 bg-slate-900/50 p-6">
        <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-4">
          Call Breakdown — This Month
        </h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatusBar label="AI Answered" count={callStatusMap["answered_ai"] ?? 0} total={totalCallsMonth} color="bg-emerald-500" />
          <StatusBar label="Human Answered" count={callStatusMap["answered_human"] ?? 0} total={totalCallsMonth} color="bg-blue-500" />
          <StatusBar label="Voicemail" count={callStatusMap["voicemail"] ?? 0} total={totalCallsMonth} color="bg-yellow-500" />
          <StatusBar label="Missed" count={callStatusMap["missed"] ?? 0} total={totalCallsMonth} color="bg-red-500" />
        </div>
      </div>

      {/* Charts */}
      <div className="mt-6 rounded-xl border border-slate-800 bg-slate-900/50 p-6">
        <AnalyticsCharts dailyData={chartDaily} monthlyData={chartMonthly} />
      </div>
    </div>
  );
}

// ── Components ──

function MetricCard({
  label,
  value,
  prev,
  current,
  accent,
}: {
  label: string;
  value: string;
  prev?: number;
  current: number;
  accent?: boolean;
}) {
  const delta = prev !== undefined && prev > 0 ? Math.round(((current - prev) / prev) * 100) : null;

  return (
    <div className={`rounded-xl border ${accent ? "border-amber-500/20" : "border-slate-800"} bg-slate-900/50 p-4 card-hover`}>
      <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">{label}</p>
      <p className={`mt-1.5 text-xl font-bold font-mono ${accent ? "text-amber-500" : "text-white"}`}>{value}</p>
      {delta !== null && (
        <p className={`mt-1 text-xs font-medium ${delta >= 0 ? "text-emerald-400/70" : "text-red-400/70"}`}>
          {delta >= 0 ? "↑" : "↓"} {Math.abs(delta)}% MoM
        </p>
      )}
    </div>
  );
}

function MiniMetric({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-lg border border-slate-800/60 bg-slate-900/30 px-4 py-3">
      <p className="text-xs text-slate-500 font-medium">{label}</p>
      <p className="mt-1 text-lg font-bold font-mono text-white">{value}</p>
      <p className="mt-0.5 text-xs text-slate-600">{sub}</p>
    </div>
  );
}

function StatusBar({
  label,
  count,
  total,
  color,
}: {
  label: string;
  count: number;
  total: number;
  color: string;
}) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <p className="text-xs text-slate-400">{label}</p>
        <p className="text-xs font-mono text-white">{count}</p>
      </div>
      <div className="h-1.5 rounded-full bg-slate-800">
        <div
          className={`h-full rounded-full ${color} transition-all`}
          style={{ width: `${Math.max(pct, 2)}%` }}
        />
      </div>
      <p className="mt-0.5 text-xs text-slate-600">{pct}%</p>
    </div>
  );
}
