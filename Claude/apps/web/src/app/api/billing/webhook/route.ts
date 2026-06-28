import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { stripe, WEBHOOK_SECRET, PRICE_IDS } from "@/lib/stripe";

function planFromPrice(priceId: string | undefined): string | undefined {
  if (!priceId) return undefined;
  return Object.keys(PRICE_IDS).find((p) => PRICE_IDS[p] === priceId);
}

export async function POST(request: Request) {
  if (!stripe || !WEBHOOK_SECRET) {
    return NextResponse.json(
      { error: "Billing not configured" },
      { status: 503 }
    );
  }

  const sig = request.headers.get("stripe-signature");
  const body = await request.text();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig ?? "", WEBHOOK_SECRET);
  } catch (err) {
    console.error("Webhook signature verification failed:", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const clientId = sub.metadata?.clientId;
        const plan = planFromPrice(sub.items.data[0]?.price?.id);
        const status =
          event.type === "customer.subscription.deleted" ? "canceled" : sub.status;
        const updates: Partial<typeof schema.clients.$inferInsert> = {
          stripeSubscriptionId: sub.id,
          subscriptionStatus: status,
        };
        if (plan) updates.plan = plan;
        if (clientId) {
          await db.update(schema.clients).set(updates).where(eq(schema.clients.id, clientId));
        } else if (typeof sub.customer === "string") {
          await db
            .update(schema.clients)
            .set(updates)
            .where(eq(schema.clients.stripeCustomerId, sub.customer));
        }
        break;
      }
      case "checkout.session.completed": {
        const s = event.data.object as Stripe.Checkout.Session;
        const clientId = s.client_reference_id || s.metadata?.clientId;
        if (clientId) {
          await db
            .update(schema.clients)
            .set({
              subscriptionStatus: "active",
              stripeCustomerId:
                typeof s.customer === "string" ? s.customer : undefined,
              stripeSubscriptionId:
                typeof s.subscription === "string" ? s.subscription : undefined,
            })
            .where(eq(schema.clients.id, clientId));
        }
        break;
      }
      default:
        break;
    }
  } catch (err) {
    console.error("Webhook handler error:", err);
    return NextResponse.json({ error: "Handler error" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
