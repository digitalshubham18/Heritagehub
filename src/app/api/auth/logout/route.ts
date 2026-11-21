import { handle, ok } from "@/lib/api";
import { destroySession } from "@/lib/auth";
export const POST = handle(async () => { destroySession(); return ok({ ok: true }); });

export const dynamic = "force-dynamic";
