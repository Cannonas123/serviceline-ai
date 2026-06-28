import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import bcrypt from "bcryptjs";
import { createAdminSession, ADMIN_COOKIE } from "@/lib/auth";
import { rateLimit, clientIp, tooMany } from "@/lib/rate-limit";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@servicelineai.com";

function passwordOk(password: string): boolean {
  const hash = process.env.ADMIN_PASSWORD_HASH;
  if (hash && hash.startsWith("$2")) return bcrypt.compareSync(password, hash);
  const expected = process.env.ADMIN_PASSWORD || "changeme";
  const a = Buffer.from(password);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: Request) {
  try {
    // Throttle password guessing: 6 attempts / 5 min per IP.
    const rl = rateLimit(`adminlogin:${clientIp(request)}`, 6, 5 * 60_000);
    if (!rl.allowed) return tooMany(rl.retryAfter);

    const { email, password } = await request.json();
    if (!email || !password) {
      return NextResponse.json(
        { error: "email and password are required" },
        { status: 400 }
      );
    }

    if (
      String(email).toLowerCase() !== ADMIN_EMAIL.toLowerCase() ||
      !passwordOk(String(password))
    ) {
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }

    const token = await createAdminSession(ADMIN_EMAIL);
    const response = NextResponse.json({ success: true });
    response.cookies.set(ADMIN_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24,
      path: "/",
    });
    return response;
  } catch (error) {
    console.error("Admin login error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
