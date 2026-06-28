import { db, schema } from "@/lib/db";
import { eq, desc } from "drizzle-orm";
import { notFound } from "next/navigation";
import SimulateCallButton from "./SimulateCallButton";
import BillingActions from "./BillingActions";

export const dynamic = "force-dynamic";

function Badge({
  label,
  color,
}: {
  label: string;
  color: "green" | "yellow" | "red" | "blue" | "gray";
}) {
  const colors = {
    green: "bg-emerald-100 text-emerald-800",
    yellow: "bg-yellow-100 text-yellow-800",
    red: "bg-red-100 text-red-800",
    blue: "bg-blue-100 text-blue-800",
    gray: "bg-gray-100 text-gray-600",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${colors[color]}`}
    >
      {label}
    </span>
  );
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

function leadStatusColor(
  status: string
): "green" | "yellow" | "red" | "blue" | "gray" {
  switch (status) {
    case "booked":
    case "converted":
      return "green";
    case "new":
      return "yellow";
    case "lost":
      return "red";
    case "contacted":
      return "blue";
    default:
      return "gray";
  }
}

export default async function ClientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const client = await db
    .select()
    .from(schema.clients)
    .where(eq(schema.clients.id, id))
    .then((rows) => rows[0]);

  if (!client) notFound();

  const [recentCalls, recentLeads, upcomingAppointments] = await Promise.all([
    db
      .select()
      .from(schema.calls)
      .where(eq(schema.calls.clientId, id))
      .orderBy(desc(schema.calls.createdAt))
      .limit(20),
    db
      .select()
      .from(schema.leads)
      .where(eq(schema.leads.clientId, id))
      .orderBy(desc(schema.leads.createdAt))
      .limit(20),
    db
      .select()
      .from(schema.appointments)
      .where(eq(schema.appointments.clientId, id))
      .orderBy(desc(schema.appointments.scheduledAt))
      .limit(20),
  ]);

  return (
    <div>
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{client.name}</h1>
          <p className="mt-1 text-sm text-gray-500">
            Owner: {client.ownerName}
          </p>
        </div>
        <SimulateCallButton clientId={client.id} />
      </div>

      <BillingActions
        clientId={client.id}
        subscriptionStatus={client.subscriptionStatus}
      />

      {/* Client Info Card */}
      <div className="mt-6 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          <InfoItem label="Phone" value={client.ownerPhone} />
          <InfoItem label="Twilio" value={client.twilioPhone} />
          <InfoItem
            label="Plan"
            value={
              <Badge
                label={client.plan}
                color={client.plan === "pro" ? "blue" : "gray"}
              />
            }
          />
          <InfoItem
            label="Status"
            value={
              <Badge
                label={client.status}
                color={
                  client.status === "active"
                    ? "green"
                    : client.status === "pilot"
                      ? "yellow"
                      : "red"
                }
              />
            }
          />
          <InfoItem
            label="Services"
            value={(client.services as string[]).join(", ")}
          />
          <InfoItem label="Service Area" value={client.serviceArea} />
          <InfoItem
            label="Avg Ticket"
            value={`$${client.avgTicketValue ?? "350"}`}
          />
          <InfoItem label="Slug" value={client.slug} />
        </div>
      </div>

      {/* Recent Calls */}
      <section className="mt-8">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          Recent Calls ({recentCalls.length})
        </h2>
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Date
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Caller
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Status
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Summary
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {recentCalls.map((call) => (
                <tr key={call.id}>
                  <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">
                    {call.createdAt
                      ? new Date(call.createdAt).toLocaleString("en-US", {
                          month: "short",
                          day: "numeric",
                          hour: "numeric",
                          minute: "2-digit",
                        })
                      : "-"}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-900">
                    {call.callerPhone}
                  </td>
                  <td className="px-4 py-3">
                    <Badge
                      label={callStatusLabel(call.status)}
                      color={callStatusColor(call.status)}
                    />
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600 max-w-xs truncate">
                    {call.aiSummary ?? "-"}
                  </td>
                </tr>
              ))}
              {recentCalls.length === 0 && (
                <tr>
                  <td
                    colSpan={4}
                    className="px-4 py-8 text-center text-sm text-gray-400"
                  >
                    No calls yet
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Recent Leads */}
      <section className="mt-8">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          Recent Leads ({recentLeads.length})
        </h2>
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Name
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Phone
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Issue
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Status
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Source
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {recentLeads.map((lead) => (
                <tr key={lead.id}>
                  <td className="px-4 py-3 text-sm text-gray-900">
                    {lead.contactName ?? "-"}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {lead.contactPhone}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600 max-w-xs truncate">
                    {lead.issueDescription ?? "-"}
                  </td>
                  <td className="px-4 py-3">
                    <Badge
                      label={lead.status}
                      color={leadStatusColor(lead.status)}
                    />
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500">
                    {lead.source}
                  </td>
                </tr>
              ))}
              {recentLeads.length === 0 && (
                <tr>
                  <td
                    colSpan={5}
                    className="px-4 py-8 text-center text-sm text-gray-400"
                  >
                    No leads yet
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Upcoming Appointments */}
      <section className="mt-8">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          Appointments ({upcomingAppointments.length})
        </h2>
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Scheduled
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Contact
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Issue
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Status
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {upcomingAppointments.map((apt) => (
                <tr key={apt.id}>
                  <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">
                    {new Date(apt.scheduledAt).toLocaleString("en-US", {
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-900">
                    {apt.contactName}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600 max-w-xs truncate">
                    {apt.issueDescription ?? "-"}
                  </td>
                  <td className="px-4 py-3">
                    <Badge
                      label={apt.status}
                      color={
                        apt.status === "scheduled"
                          ? "green"
                          : apt.status === "completed"
                            ? "blue"
                            : "gray"
                      }
                    />
                  </td>
                </tr>
              ))}
              {upcomingAppointments.length === 0 && (
                <tr>
                  <td
                    colSpan={4}
                    className="px-4 py-8 text-center text-sm text-gray-400"
                  >
                    No appointments
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function InfoItem({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div>
      <p className="text-xs font-medium text-gray-500">{label}</p>
      <p className="mt-1 text-sm text-gray-900">{value}</p>
    </div>
  );
}
