import Stripe from "stripe";

const key = process.env.STRIPE_SECRET_KEY;

// Null when billing isn't configured (no key) — callers must handle this so the
// app stays healthy in environments without Stripe keys (local/demo).
export const stripe = key ? new Stripe(key) : null;

export const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || "";

// Map plan -> Stripe Price ID (set these to your test/live price IDs).
export const PRICE_IDS: Record<string, string | undefined> = {
  starter: process.env.STRIPE_PRICE_STARTER,
  pro: process.env.STRIPE_PRICE_PRO,
};

export function billingConfigured(): boolean {
  return !!stripe;
}

export function priceIdFor(plan: string): string | undefined {
  return PRICE_IDS[plan];
}
