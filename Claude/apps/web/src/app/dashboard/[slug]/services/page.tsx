import { requireDashboardSession } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { eq, desc, sql, and, gte } from "drizzle-orm";
import { notFound } from "next/navigation";
import { getTemplate } from "@serviceline/templates";

export const dynamic = "force-dynamic";

export default async function ServicesPage({
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

  // ── By service category: leads, calls, revenue ──
  const serviceBreakdown = await db
    .select({
      category: sql<string>`coalesce(issue_category, 'Uncategorized')`,
      totalLeads: sql<number>`count(*)::int`,
      bookedLeads: sql<number>`count(*) filter (where status = 'booked' or status = 'completed')::int`,
      revenue: sql<number>`coalesce(sum(revenue_rescued::numeric), 0)::float`,
      avgUrgency: sql<number>`coalesce(avg(urgency), 0)::float`,
    })
    .from(schema.leads)
    .where(eq(schema.leads.clientId, client.id))
    .groupBy(sql`coalesce(issue_category, 'Uncategorized')`)
    .orderBy(sql`count(*) desc`);

  // ── This month by category ──
  const monthlyByService = await db
    .select({
      category: sql<string>`coalesce(issue_category, 'Uncategorized')`,
      count: sql<number>`count(*)::int`,
      revenue: sql<number>`coalesce(sum(revenue_rescued::numeric), 0)::float`,
    })
    .from(schema.leads)
    .where(
      and(
        eq(schema.leads.clientId, client.id),
        gte(schema.leads.createdAt, startOfMonth)
      )
    )
    .groupBy(sql`coalesce(issue_category, 'Uncategorized')`)
    .orderBy(sql`count(*) desc`);

  // ── Appointments by service ──
  const apptsByService = await db
    .select({
      category: sql<string>`coalesce(l.issue_category, 'Uncategorized')`,
      count: sql<number>`count(*)::int`,
      upcoming: sql<number>`count(*) filter (where a.status = 'scheduled')::int`,
    })
    .from(sql`${schema.appointments} a left join ${schema.leads} l on a.lead_id = l.id`)
    .where(sql`a.client_id = ${client.id}`)
    .groupBy(sql`coalesce(l.issue_category, 'Uncategorized')`)
    .orderBy(sql`count(*) desc`);

  // ── Call outcomes by service ──
  const callsByService = await db
    .select({
      category: sql<string>`coalesce(l.issue_category, 'Uncategorized')`,
      totalCalls: sql<number>`count(*)::int`,
      aiAnswered: sql<number>`count(*) filter (where c.status = 'answered_ai')::int`,
      booked: sql<number>`count(*) filter (where c.appointment_booked = true)::int`,
    })
    .from(sql`${schema.calls} c left join ${schema.leads} l on c.lead_id = l.id`)
    .where(sql`c.client_id = ${client.id}`)
    .groupBy(sql`coalesce(l.issue_category, 'Uncategorized')`)
    .orderBy(sql`count(*) desc`);

  // ── Client's configured services ──
  const configuredServices = client.services ?? [];

  // ── Template categories (scaffold — show even with no data) ──
  const template = getTemplate(client.industry);
  const templateCategories = template?.issueCategories ?? [];

  // Merge all data by category
  const categories = new Set<string>();
  serviceBreakdown.forEach((r) => categories.add(r.category));
  callsByService.forEach((r) => categories.add(r.category));
  apptsByService.forEach((r) => categories.add(r.category));
  configuredServices.forEach((s) => categories.add(s));
  templateCategories.forEach((c: string) => {
    // Add template categories formatted nicely (replace underscores)
    if (c !== "other" && c !== "emergency") categories.add(c);
  });

  const callsMap = new Map(callsByService.map((r) => [r.category, r]));
  const apptsMap = new Map(apptsByService.map((r) => [r.category, r]));
  const leadsMap = new Map(serviceBreakdown.map((r) => [r.category, r]));
  const monthlyMap = new Map(monthlyByService.map((r) => [r.category, r]));

  const sortedCategories = Array.from(categories).sort((a, b) => {
    const aLeads = leadsMap.get(a)?.totalLeads ?? 0;
    const bLeads = leadsMap.get(b)?.totalLeads ?? 0;
    return bLeads - aLeads;
  });

  // Totals
  const totalLeads = serviceBreakdown.reduce((s, r) => s + r.totalLeads, 0);
  const totalRevenue = serviceBreakdown.reduce((s, r) => s + r.revenue, 0);
  const totalCalls = callsByService.reduce((s, r) => s + r.totalCalls, 0);
  const totalAppts = apptsByService.reduce((s, r) => s + r.count, 0);

  return (
    <div>
      <h1 className="text-2xl font-bold text-white">By Service</h1>
      <p className="mt-1 text-sm text-slate-500">
        Performance broken down by service category
      </p>

      {/* Summary strip */}
      <div className="mt-6 grid grid-cols-4 gap-4">
        <SummaryCard label="Categories" value={sortedCategories.length.toString()} />
        <SummaryCard label="Total Leads" value={totalLeads.toString()} />
        <SummaryCard label="Total Appointments" value={totalAppts.toString()} />
        <SummaryCard label="Total Revenue" value={`$${Math.round(totalRevenue).toLocaleString()}`} accent />
      </div>

      {/* Service Cards */}
      <div className="mt-6 space-y-4">
        {sortedCategories.map((category) => {
          const lead = leadsMap.get(category);
          const calls = callsMap.get(category);
          const appts = apptsMap.get(category);
          const monthly = monthlyMap.get(category);

          const leadCount = lead?.totalLeads ?? 0;
          const rev = Math.round(lead?.revenue ?? 0);
          const callCount = calls?.totalCalls ?? 0;
          const aiCount = calls?.aiAnswered ?? 0;
          const bookedCount = calls?.booked ?? 0;
          const apptCount = appts?.count ?? 0;
          const upcomingAppts = appts?.upcoming ?? 0;
          const monthLeads = monthly?.count ?? 0;
          const monthRevenue = Math.round(monthly?.revenue ?? 0);

          const shareOfLeads = totalLeads > 0 ? Math.round((leadCount / totalLeads) * 100) : 0;
          const bookingRate = callCount > 0 ? Math.round((bookedCount / callCount) * 100) : 0;

          return (
            <div
              key={category}
              className="rounded-xl border border-slate-800 bg-slate-900/50 p-6"
            >
              {/* Category header */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <ServiceIcon category={category} />
                  <div>
                    <h3 className="text-base font-semibold text-white">
                      {category}
                    </h3>
                    <p className="text-xs text-slate-500">
                      {shareOfLeads}% of all leads
                    </p>
                  </div>
                </div>
                {rev > 0 && (
                  <p className="text-lg font-bold font-mono text-amber-500">
                    ${rev.toLocaleString()}
                  </p>
                )}
              </div>

              {/* Metrics grid */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                <ServiceMetric label="Leads" value={leadCount} sub={monthLeads > 0 ? `${monthLeads} this month` : undefined} />
                <ServiceMetric label="Calls" value={callCount} sub={aiCount > 0 ? `${aiCount} AI answered` : undefined} />
                <ServiceMetric label="Appointments" value={apptCount} sub={upcomingAppts > 0 ? `${upcomingAppts} upcoming` : undefined} />
                <ServiceMetric label="Booking Rate" value={`${bookingRate}%`} sub={`${bookedCount} of ${callCount}`} isText />
                <ServiceMetric label="This Month Rev" value={monthRevenue > 0 ? `$${monthRevenue.toLocaleString()}` : "—"} isText accent />
              </div>

              {/* Volume bar */}
              <div className="mt-4">
                <div className="h-1 rounded-full bg-slate-800">
                  <div
                    className="h-full rounded-full bg-amber-500/50 transition-all"
                    style={{ width: `${Math.max(shareOfLeads, 2)}%` }}
                  />
                </div>
              </div>
            </div>
          );
        })}

        {sortedCategories.length === 0 && (
          <div className="text-center py-16">
            <p className="text-sm text-slate-600">
              No service data yet. Categories are assigned when AI captures leads.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Components ──

function SummaryCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className={`rounded-xl border ${accent ? "border-amber-500/20" : "border-slate-800"} bg-slate-900/50 p-4`}>
      <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">
        {label}
      </p>
      <p className={`mt-1.5 text-xl font-bold font-mono ${accent ? "text-amber-500" : "text-white"}`}>
        {value}
      </p>
    </div>
  );
}

function ServiceMetric({
  label,
  value,
  sub,
  isText,
  accent,
}: {
  label: string;
  value: number | string;
  sub?: string;
  isText?: boolean;
  accent?: boolean;
}) {
  return (
    <div>
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`mt-0.5 text-base font-bold font-mono ${accent ? "text-amber-500" : "text-white"}`}>
        {isText ? value : Number(value).toLocaleString()}
      </p>
      {sub && <p className="text-xs text-slate-600 mt-0.5">{sub}</p>}
    </div>
  );
}

function ServiceIcon({ category }: { category: string }) {
  const lower = category.toLowerCase();
  let icon = "🔧";
  if (lower.includes("plumb")) icon = "🪠";
  else if (lower.includes("hvac") || lower.includes("heat") || lower.includes("cool") || lower.includes("air")) icon = "❄️";
  else if (lower.includes("drain")) icon = "🚿";
  else if (lower.includes("water heater") || lower.includes("hot water")) icon = "🔥";
  else if (lower.includes("electric")) icon = "⚡";
  else if (lower.includes("pest") || lower.includes("termite") || lower.includes("bug")) icon = "🐛";
  else if (lower.includes("paint")) icon = "🎨";
  else if (lower.includes("lawn") || lower.includes("landscape") || lower.includes("yard")) icon = "🌿";
  else if (lower.includes("roof")) icon = "🏠";
  else if (lower.includes("clean")) icon = "✨";
  else if (lower.includes("emergency")) icon = "🚨";

  return (
    <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-800/50 text-lg">
      {icon}
    </span>
  );
}
