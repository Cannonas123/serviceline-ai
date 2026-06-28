import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { createDashboardSession, DASHBOARD_COOKIE } from "@/lib/auth";
import { rateLimit, clientIp, tooMany } from "@/lib/rate-limit";

export async function POST(request: Request) {
  try {
    const { slug, pin } = await request.json();

    // Throttle PIN guessing: 8 attempts / 5 min per IP+dashboard.
    const rl = rateLimit(`pin:${clientIp(request)}:${slug ?? "?"}`, 8, 5 * 60_000);
    if (!rl.allowed) return tooMany(rl.retryAfter);

    if (!slug || !pin) {
      return NextResponse.json(
        { error: "slug and pin are required" },
        { status: 400 }
      );
    }

    if (typeof pin !== "string" || pin.length < 4) {
      return NextResponse.json(
        { error: "PIN must be at least 4 digits" },
        { status: 400 }
      );
    }

    // Look up client by slug (including the hashed PIN)
    const client = await db
      .select({
        id: schema.clients.id,
        name: schema.clients.name,
        dashboardPin: schema.clients.dashboardPin,
      })
      .from(schema.clients)
      .where(eq(schema.clients.slug, slug))
      .then((rows) => rows[0]);

    if (!client) {
      return NextResponse.json({ error: "Dashboard not found" }, { status: 404 });
    }

    // Constant-time bcrypt comparison against the stored hash.
    const valid =
      !!client.dashboardPin && (await bcrypt.compare(pin, client.dashboardPin));
    if (!valid) {
      return NextResponse.json({ error: "Invalid PIN" }, { status: 401 });
    }

    const token = await createDashboardSession(client.id, slug);

    const response = NextResponse.json({
      success: true,
      clientId: client.id,
      clientName: client.name,
    });

    // Signed, httpOnly session cookie, scoped to this tenant's path.
    response.cookies.set(DASHBOARD_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24, // 24 hours
      path: `/dashboard/${slug}`,
    });

    return response;
  } catch (error) {
    console.error("Verify PIN error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
