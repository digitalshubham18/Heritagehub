import { z } from "zod";
import { handle, ok } from "@/lib/api";
import { currentUser } from "@/lib/auth";
import { Notification } from "@/models";
import { clientIp, limit } from "@/lib/ratelimit";
import { openTicket } from "@/lib/support";

const schema = z.object({ name: z.string().trim().min(2), email: z.string().trim().email(), message: z.string().trim().min(10).max(1000) });
/** Guests: the message goes to the platform inbox as before. Signed-in visitors: it also becomes a support ticket, so the reply and the history appear in their account. */
export const POST = handle(async (req) => {
  await limit("contact", [clientIp(req)], 5, 3600);
  const b = schema.parse(await req.json());
  const me = await currentUser().catch(() => null);
  if (me && me.role === "tourist") {
    const t = await openTicket({ user: me, name: b.name, email: b.email, category: "other", subject: b.message.slice(0, 80), message: b.message });
    return ok({ ok: true, reference: t.reference }, 201);
  }
  await Notification.create({ type: "contact", message: `${b.name} <${b.email}>: ${b.message}` });
  return ok({ ok: true }, 201);
});

export const dynamic = "force-dynamic";
