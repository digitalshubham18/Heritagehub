import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";

export const config = { matcher: ["/dashboard/:path*", "/checkout/:path*", "/staff/:path*", "/admin/:path*", "/invoice/:path*", "/account/:path*"] };

// First line of defence for pages. Every API route and layout re-checks authorization on the server.
export async function middleware(req: NextRequest) {
  const token = req.cookies.get("hh_session")?.value;
  let role: string | null = null;
  if (token) {
    try {
      const { payload } = await jwtVerify(token, new TextEncoder().encode(process.env.AUTH_SECRET || "dev-secret-change-me"));
      role = payload.role as string;
    } catch { /* invalid token */ }
  }
  const p = req.nextUrl.pathname;
  if (!role) {
    const u = req.nextUrl.clone();
    u.pathname = "/login"; u.search = `?next=${encodeURIComponent(p)}`;
    return NextResponse.redirect(u);
  }
  if (p.startsWith("/admin") && !["admin", "operator"].includes(role)) return NextResponse.redirect(new URL("/", req.url));
  if (p.startsWith("/staff") && !["staff", "admin", "operator"].includes(role)) return NextResponse.redirect(new URL("/", req.url));
  return NextResponse.next();
}
