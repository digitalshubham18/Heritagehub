import { SignJWT, jwtVerify } from "jose";
import { cookies, headers } from "next/headers";
import { connectDB } from "./db";
import { Destination, Operator, User } from "@/models";
import { ApiError } from "./api";

export const COOKIE = "hh_session";
export type Role = "tourist" | "staff" | "admin" | "operator";

function secret() {
  const s = process.env.AUTH_SECRET;
  if (!s && process.env.NODE_ENV === "production") throw new Error("AUTH_SECRET is required in production");
  return new TextEncoder().encode(s || "dev-secret-change-me");
}

type Authed = { _id: any; role: string; name: string; sessionVersion?: number };

export async function createSession(user: Authed) {
  const token = await new SignJWT({ role: user.role, name: user.name, sv: user.sessionVersion || 0 })
    .setProtectedHeader({ alg: "HS256" }).setSubject(String(user._id)).setIssuedAt().setExpirationTime("7d").sign(secret());
  cookies().set(COOKIE, token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 7 });
}
export const destroySession = () => cookies().delete(COOKIE);

/** Long-lived bearer token for the mobile app (same signing key and claims as the cookie session). */
export async function issueToken(user: Authed) {
  return new SignJWT({ role: user.role, name: user.name, sv: user.sessionVersion || 0 }).setProtectedHeader({ alg: "HS256" }).setSubject(String(user._id)).setIssuedAt().setExpirationTime("30d").sign(secret());
}

export async function getSession() {
  let t = cookies().get(COOKIE)?.value;
  if (!t) { const h = headers().get("authorization"); if (h?.startsWith("Bearer ")) t = h.slice(7); }
  if (!t) return null;
  try {
    const { payload } = await jwtVerify(t, secret());
    if (payload.purpose || !payload.role) return null; // a two-step challenge token is never a session
    return { uid: payload.sub as string, role: payload.role as Role, sv: Number(payload.sv || 0) };
  } catch { return null; }
}

/** Short-lived proof that the password step passed; exchanged for a session at /api/auth/2fa/verify once the second step passes. */



/** Loads the user fresh from the DB so role changes / deactivation take effect immediately. */
export async function currentUser(): Promise<any> {
  const s = await getSession();
  if (!s) return null;
  await connectDB();
  const u = (await User.findById(s.uid).lean()) as any;
  if (!u || !u.active) return null;
  if ((u.sessionVersion || 0) !== s.sv) return null; // password was changed or reset: older sessions end

  if (u.role === "operator") {
    // Operator managers act on exactly the destinations of their operator; the existing access checks then work unchanged.
    const op: any = u.operator ? await Operator.findById(u.operator).lean() : null;
    if (!op || !op.active) return null;
    u.assignedDestinations = (await Destination.find({ operator: u.operator }).select("_id").lean()).map((d: any) => d._id);
  }
  return u;
}

export async function requireUser(roles?: Role[], opts: { allowUnenrolled?: boolean } = {}) {
  const u = await currentUser();
  if (!u) throw new ApiError(401, "Please sign in to continue");
  if (roles && !roles.includes(u.role)) throw new ApiError(403, "You don't have permission to do that");
  return u;
}

/** Admins see everything; staff and operator managers only their assigned destinations. */
export function canAccessDestination(user: any, destinationId: any) {
  if (user.role === "admin") return true;
  return (user.role === "staff" || user.role === "operator") && (user.assignedDestinations || []).some((d: any) => String(d) === String(destinationId));
}
export const isManager = (u: any) => u.role === "admin" || u.role === "operator";
/** null = unrestricted (platform admin); otherwise the destination ids an operator manager may touch. */
export const scopeIds = (u: any): string[] | null => (u.role === "operator" ? (u.assignedDestinations || []).map(String) : null);
