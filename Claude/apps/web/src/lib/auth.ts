import { SignJWT, jwtVerify, type JWTPayload } from "jose";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

const secret = new TextEncoder().encode(
  process.env.SESSION_SECRET ||
    process.env.NEXTAUTH_SECRET ||
    "serviceline-dev-insecure-secret-change-me",
);

export const DASHBOARD_COOKIE = "dashboard_session";
export const ADMIN_COOKIE = "admin_session";

async function sign(payload: JWTPayload): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("24h")
    .sign(secret);
}

async function verify(token: string | undefined): Promise<JWTPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret);
    return payload;
  } catch {
    return null;
  }
}

// ── Dashboard (per-client) sessions ──
export function createDashboardSession(clientId: string, slug: string) {
  return sign({ clientId, slug, kind: "dashboard" });
}

/**
 * Server-component guard. Call at the top of every protected dashboard page.
 * Redirects to the PIN entry page unless the caller holds a valid session
 * bound to *this* tenant's slug — enforcing both auth and tenant isolation.
 */
export async function requireDashboardSession(slug: string) {
  const token = (await cookies()).get(DASHBOARD_COOKIE)?.value;
  const session = await verify(token);
  if (!session || session.kind !== "dashboard" || session.slug !== slug) {
    redirect(`/dashboard/${slug}`);
  }
  return session;
}

// ── Admin sessions ──
export function createAdminSession(email: string) {
  return sign({ email, kind: "admin" });
}

export async function getAdminSession() {
  const token = (await cookies()).get(ADMIN_COOKIE)?.value;
  const session = await verify(token);
  return session && session.kind === "admin" ? session : null;
}

export async function requireAdminSession() {
  const session = await getAdminSession();
  if (!session) redirect("/login");
  return session;
}
