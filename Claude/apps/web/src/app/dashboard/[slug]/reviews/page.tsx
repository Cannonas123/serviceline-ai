import { requireDashboardSession } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { eq, desc, sql } from "drizzle-orm";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function ReviewsPage({
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

  const [stats] = await db
    .select({
      totalRequested: sql<number>`count(*)::int`,
      totalReceived: sql<number>`count(*) filter (where review_received = true)::int`,
      avgRating: sql<number>`coalesce(avg(review_rating)::numeric(2,1), 0)::float`,
    })
    .from(schema.reviews)
    .where(eq(schema.reviews.clientId, client.id));

  const recentReviews = await db
    .select()
    .from(schema.reviews)
    .where(eq(schema.reviews.clientId, client.id))
    .orderBy(desc(schema.reviews.createdAt))
    .limit(30);

  const totalRequested = stats?.totalRequested ?? 0;
  const totalReceived = stats?.totalReceived ?? 0;
  const avgRating = stats?.avgRating ?? 0;

  return (
    <div>
      <h1 className="text-2xl font-bold text-white">Review Velocity</h1>
      <p className="mt-1 text-sm text-slate-500">
        Track review requests and responses
      </p>

      {/* Stats Cards */}
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-6">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">
            Reviews Requested
          </p>
          <p className="mt-2 text-3xl font-bold text-white">
            {totalRequested}
          </p>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-6">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">
            Reviews Received
          </p>
          <p className="mt-2 text-3xl font-bold text-emerald-400">
            {totalReceived}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {totalRequested > 0
              ? `${Math.round((totalReceived / totalRequested) * 100)}% response rate`
              : "No requests yet"}
          </p>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-6">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">
            Average Rating
          </p>
          <p className="mt-2 text-3xl font-bold text-white">
            {avgRating > 0 ? avgRating.toFixed(1) : "-"}
          </p>
          {avgRating > 0 && (
            <div className="mt-1 flex gap-0.5">
              {[1, 2, 3, 4, 5].map((star) => (
                <svg
                  key={star}
                  className={`h-4 w-4 ${star <= Math.round(avgRating) ? "text-yellow-400" : "text-slate-700"}`}
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                </svg>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Recent Review Requests */}
      <div className="mt-8">
        <h2 className="text-lg font-semibold text-white mb-4">
          Recent Review Requests
        </h2>
        <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/50">
          <table className="min-w-full divide-y divide-slate-800">
            <thead className="bg-slate-800/50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">
                  Phone
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">
                  Sent
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">
                  Received
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">
                  Rating
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {recentReviews.map((review) => (
                <tr key={review.id}>
                  <td className="px-4 py-3 text-sm text-slate-400">
                    {review.contactPhone}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-500">
                    {review.requestSentAt
                      ? new Date(review.requestSentAt).toLocaleDateString(
                          "en-US",
                          { month: "short", day: "numeric" }
                        )
                      : "-"}
                  </td>
                  <td className="px-4 py-3">
                    {review.reviewReceived ? (
                      <span className="inline-flex items-center rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-400 ring-1 ring-emerald-500/20">
                        Yes
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-full bg-slate-500/10 px-2 py-0.5 text-xs font-medium text-slate-400 ring-1 ring-slate-500/20">
                        Pending
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-white">
                    {review.reviewRating ? (
                      <span className="flex items-center gap-1">
                        {review.reviewRating}
                        <svg
                          className="h-3.5 w-3.5 text-yellow-400"
                          fill="currentColor"
                          viewBox="0 0 20 20"
                        >
                          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                        </svg>
                      </span>
                    ) : (
                      "-"
                    )}
                  </td>
                </tr>
              ))}
              {recentReviews.length === 0 && (
                <tr>
                  <td
                    colSpan={4}
                    className="px-4 py-8 text-center text-sm text-slate-600"
                  >
                    No review requests yet
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
