"use client";

import { useState } from "react";
import { useRouter, useParams } from "next/navigation";

export default function PinEntryPage() {
  const router = useRouter();
  const params = useParams();
  const slug = params.slug as string;

  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (pin.length < 4) {
      setError("PIN must be at least 4 digits");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/dashboard/verify-pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, pin }),
      });
      const data = await res.json();

      if (res.ok) {
        router.push(`/dashboard/${slug}/overview`);
      } else {
        setError(data.error || "Invalid PIN");
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-[#0a0f1a]">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-white">
            ServiceLine<span className="text-amber-500">AI</span>
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            Enter your dashboard PIN to continue
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="rounded-xl border border-slate-800 bg-slate-900/50 p-8"
        >
          <label
            htmlFor="pin"
            className="block text-sm font-medium text-slate-400 mb-2"
          >
            Dashboard PIN
          </label>
          <input
            id="pin"
            type="password"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={6}
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
            placeholder="• • • • • •"
            className="w-full rounded-lg border border-slate-700 bg-slate-800 px-4 py-3.5 text-center text-2xl tracking-[0.5em] font-mono text-white placeholder-slate-600 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 focus:outline-none transition-colors"
            autoFocus
          />
          {error && (
            <p className="mt-2 text-sm text-red-400">{error}</p>
          )}
          <button
            type="submit"
            disabled={loading || pin.length < 4}
            className="mt-4 w-full rounded-lg bg-amber-500 px-4 py-3.5 text-sm font-semibold text-black hover:bg-amber-400 disabled:opacity-50 disabled:hover:bg-amber-500 transition-colors shadow-lg shadow-amber-500/10"
          >
            {loading ? "Verifying..." : "View Dashboard"}
          </button>
        </form>
      </div>
    </div>
  );
}
