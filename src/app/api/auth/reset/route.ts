import { z } from "zod";
import { handle, ok } from "@/lib/api";
import { clientIp, limit } from "@/lib/ratelimit";
import { completePasswordReset } from "@/lib/account";

export const POST = handle(async (req) => {
  const { token, password } = z.object({ token: z.string().min(20).max(100), password: z.string().min(8, "Use at least 8 characters").max(100) }).parse(await req.json());
  await limit("reset-ip", [clientIp(req)], 20, 3600);
  await completePasswordReset(token, password);
  return ok({ ok: true });
});
export const dynamic = "force-dynamic";
