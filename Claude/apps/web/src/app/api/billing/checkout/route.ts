import { NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { getAdminSession } from "@/lib/auth";
import { stripe, priceIdFor } from "@/lib/stripe";

const APP_URL =
  process.env.WEB_APP_URL || process.env.NEXTAUTH_URL || "http://localhost:3000";

export async function POST(request: Request) {
  try {
    if (!(await getAdminSession())) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!stripe) {
      return NextResponse.json(
        { error: "Billing not configured (set STRIPE_SECRET_KEY)" },
        { status: 503 }
      );
    }

    const { clientId, plan } = await request.json();
    if (!clientId || !plan) {
      return NextResponse.json(
        { error: "clientId and plan are required" },
        { status: 400 }
      );
    }
    const priceId = priceIdFor(plan);
    if (!priceId) {
      return NextResponse.json(
        { error: `No Stripe price configured for plan "${plan}"` },
        { status: 400 }
      );
    }

    const client = await db
      .select()
      .from(schema.clients)
      .where(eq(schema.clients.id, clientId))
      .then((r) => r[0]);
    if (!client) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }

    // Reuse or create the Stripe customer for this client.
    let customerId = client.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({
        name: client.name,
        email: client.ownerEmail ?? undefined,
        metadata: { clientId: client.id },
      });
      customerId = customer.id;
      await db
        .update(schema.clients)
        .set({ stripeCustomerId: customerId })
        .where(eq(schema.clients.id, client.id));
    }

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      client_reference_id: client.id,
      metadata: { clientId: client.id, plan },
      subscription_data: { metadata: { clientId: client.id, plan } },
      success_url: `${APP_URL}/admin/clients/${client.id}?billing=success`,
      cancel_url: `${APP_URL}/admin/clients/${client.id}?billing=cancelled`,
    });

    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error("Checkout error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
