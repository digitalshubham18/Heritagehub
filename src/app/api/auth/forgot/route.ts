import { z } from "zod";
import { handle, ok } from "@/lib/api";
import { clientIp, limit } from "@/lib/ratelimit";
import { requestPasswordReset } from "@/lib/account";

/** Always answers the same way, so it cannot be used to find out which emails have accounts. */
export const POST = handle(async (req) => {
  const { email } = z.object({ email: z.string().trim().toLowerCase().email() }).parse(await req.json());
  await limit("forgot-ip", [clientIp(req)], 10, 3600);
  await limit("forgot-email", [email], 3, 3600);
  await requestPasswordReset(email);
  return ok({ ok: true, message: "If an account exists for that email, a reset link is on its way. It works for 60 minutes." });
});
export const dynamic = "force-dynamic";
