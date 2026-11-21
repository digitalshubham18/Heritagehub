import { z } from "zod";
import { handle, ok } from "@/lib/api";
import { destroySession, requireUser } from "@/lib/auth";
import { limit } from "@/lib/ratelimit";
import { eraseUser } from "@/lib/privacy";

export const POST = handle(async (req) => {
  const me = await requireUser();
  const { password } = z.object({ password: z.string().min(1), confirm: z.literal("ERASE") }).parse(await req.json());
  await limit("erase", [String(me._id)], 5, 3600);
  const done = await eraseUser(me, password);
  destroySession();
  return ok({ erased: true, done });
});
export const dynamic = "force-dynamic";
