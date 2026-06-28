import { NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { getAdminSession } from "@/lib/auth";
import { stripe } from "@/lib/stripe";

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

    const { clientId } = await request.json();
    if (!clientId) {
      return NextResponse.json({ error: "clientId is required" }, { status: 400 });
    }

    const client = await db
      .select({ id: schema.clients.id, stripeCustomerId: schema.clients.stripeCustomerId })
      .from(schema.clients)
      .where(eq(schema.clients.id, clientId))
      .then((r) => r[0]);
    if (!client?.stripeCustomerId) {
      return NextResponse.json(
        { error: "Client has no Stripe customer yet" },
        { status: 400 }
      );
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: client.stripeCustomerId,
      return_url: `${APP_URL}/admin/clients/${client.id}`,
    });

    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error("Billing portal error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
