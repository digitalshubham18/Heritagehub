import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { connectDB } from "./db";
import { reportError } from "./monitor";

export class ApiError extends Error {
  constructor(public status: number, message: string, public headers?: Record<string, string>) { super(message); }
}
export const ok = (data: unknown, status = 200) => NextResponse.json(data, { status });

/** Wraps a route handler: connects DB, maps validation/API errors to JSON responses. */
export function handle(fn: (req: NextRequest, ctx: any) => Promise<Response>) {
  return async (req: NextRequest, ctx: any) => {
    try {
      await connectDB();
      return await fn(req, ctx);
    } catch (e: any) {
      if (e instanceof ZodError) return NextResponse.json({ error: "Please check the highlighted fields", issues: e.flatten().fieldErrors }, { status: 400 });
      if (e instanceof ApiError) return NextResponse.json({ error: e.message }, { status: e.status, headers: e.headers });
      if (e?.name === "CastError") return NextResponse.json({ error: "Invalid identifier" }, { status: 400 });
      console.error(e);
      await reportError(e, { url: req.nextUrl?.pathname, method: req.method });
      return NextResponse.json({ error: "Something went wrong on our side. Please try again." }, { status: 500 });
    }
  };
}
