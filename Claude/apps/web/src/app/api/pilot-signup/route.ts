import { NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { rateLimit, clientIp, tooMany } from "@/lib/rate-limit";

const clean = (v: unknown, max: number) =>
  typeof v === "string" ? v.trim().slice(0, max) : "";

export async function POST(request: Request) {
  try {
    // Public endpoint — throttle spam: 5 signups / 10 min per IP.
    const rl = rateLimit(`pilot:${clientIp(request)}`, 5, 10 * 60_000);
    if (!rl.allowed) return tooMany(rl.retryAfter);

    const body = await request.json();
    const businessName = clean(body.businessName, 200);
    const ownerName = clean(body.ownerName, 200);
    const phone = clean(body.phone, 32);
    const industry = clean(body.industry, 32) || "plumbing";

    if (!businessName || !phone) {
      return NextResponse.json(
        { error: "Business name and phone are required" },
        { status: 400 }
      );
    }

    const [signup] = await db
      .insert(schema.pilotSignups)
      .values({
        businessName,
        ownerName: ownerName || null,
        phone,
        industry,
      })
      .returning({ id: schema.pilotSignups.id });

    console.log("New pilot signup:", {
      id: signup.id,
      businessName,
      phone,
      industry: industry || "plumbing",
      timestamp: new Date().toISOString(),
    });

    return NextResponse.json({ success: true, id: signup.id });
  } catch (error) {
    console.error("Pilot signup error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
