import { requireDashboardSession } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { eq, desc } from "drizzle-orm";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

function redactPhone(phone: string): string {
  if (phone.length <= 4) return phone;
  return phone.slice(0, -4).replace(/\d/g, "*") + phone.slice(-4);
}

function Badge({
  label,
  color,
}: {
  label: string;
  color: "green" | "yellow" | "red" | "blue" | "gray";
}) {
  const colors = {
    green: "bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/20",
    yellow: "bg-yellow-500/10 text-yellow-400 ring-1 ring-yellow-500/20",
    red: "bg-red-500/10 text-red-400 ring-1 ring-red-500/20",
    blue: "bg-blue-500/10 text-blue-400 ring-1 ring-blue-500/20",
    gray: "bg-slate-500/10 text-slate-400 ring-1 ring-slate-500/20",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${colors[color]}`}
    >
      {label}
    </span>
  );
}

function callStatusLabel(status: string): string {
  switch (status) {
    case "answered_ai":
      return "AI Answered";
    case "answered_human":
      return "Human Answered";
    case "voicemail":
      return "Voicemail";
    case "missed":
      return "Missed";
    default:
      return status;
  }
}

function callStatusColor(
  status: string
): "green" | "yellow" | "red" | "blue" | "gray" {
  switch (status) {
    case "answered_ai":
      return "green";
    case "answered_human":
      return "blue";
    case "voicemail":
      return "yellow";
    case "missed":
      return "red";
    default:
      return "gray";
  }
}

function formatDuration(seconds: number | null): string {
  if (!seconds) return "-";
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export default async function CallsPage({
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

  const recentCalls = await db
    .select()
    .from(schema.calls)
    .where(eq(schema.calls.clientId, client.id))
    .orderBy(desc(schema.calls.createdAt))
    .limit(30);

  return (
    <div>
      <h1 className="text-2xl font-bold text-white">Call History</h1>
      <p className="mt-1 text-sm text-slate-500">Last 30 calls</p>

      <div className="mt-6 space-y-3">
        {recentCalls.map((call) => (
          <div
            key={call.id}
            className="rounded-xl border border-slate-800 bg-slate-900/50 p-4"
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="flex items-center gap-3">
                <Badge
                  label={callStatusLabel(call.status)}
                  color={callStatusColor(call.status)}
                />
                <span className="text-sm font-medium text-white">
                  {redactPhone(call.callerPhone)}
                </span>
              </div>
              <div className="flex items-center gap-4 text-xs text-slate-500">
                <span>{formatDuration(call.durationSeconds)}</span>
                <span>
                  {call.createdAt
                    ? new Date(call.createdAt).toLocaleString("en-US", {
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })
                    : "-"}
                </span>
              </div>
            </div>
            {call.aiSummary && (
              <p className="mt-2 text-sm text-slate-400 leading-relaxed">
                {call.aiSummary}
              </p>
            )}
          </div>
        ))}
        {recentCalls.length === 0 && (
          <p className="text-center text-sm text-slate-600 py-12">
            No calls recorded yet.
          </p>
        )}
      </div>
    </div>
  );
}
