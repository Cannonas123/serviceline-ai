"use client";

import { useState } from "react";

export default function BillingActions({
  clientId,
  subscriptionStatus,
}: {
  clientId: string;
  subscriptionStatus: string | null;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function go(path: string, body: object) {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.url) {
        window.location.href = data.url;
        return;
      }
      setError(data.error || "Something went wrong");
    } catch {
      setError("Network error");
    } finally {
      setBusy(false);
    }
  }

  const active =
    subscriptionStatus === "active" || subscriptionStatus === "trialing";

  const btn =
    "inline-flex items-center rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50";

  return (
    <div className="mt-6 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">Billing</h2>
        <span className="text-sm text-gray-500">
          Subscription: {subscriptionStatus ?? "none"}
        </span>
      </div>
      <div className="mt-4 flex flex-wrap gap-3">
        {active ? (
          <button
            onClick={() => go("/api/billing/portal", { clientId })}
            disabled={busy}
            className={`${btn} bg-gray-900 text-white hover:bg-gray-800`}
          >
            Manage billing
          </button>
        ) : (
          <>
            <button
              onClick={() => go("/api/billing/checkout", { clientId, plan: "starter" })}
              disabled={busy}
              className={`${btn} border border-gray-300 bg-white text-gray-800 hover:bg-gray-50`}
            >
              Start Starter — $199/mo
            </button>
            <button
              onClick={() => go("/api/billing/checkout", { clientId, plan: "pro" })}
              disabled={busy}
              className={`${btn} bg-gray-900 text-white hover:bg-gray-800`}
            >
              Start Pro — $499/mo
            </button>
          </>
        )}
      </div>
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
    </div>
  );
}
