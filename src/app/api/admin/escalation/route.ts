import { z } from "zod";
import { handle, ok, ApiError } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { Operator } from "@/models";
import { audit } from "@/lib/audit";
import { DEFAULT_ESCALATION } from "@/lib/escalation";
import { normalizePhone } from "@/lib/notify";

const schema = z.object({ operatorId: z.string().optional(), enabled: z.boolean(), firstAfterMin: z.number().int().min(2).max(120), secondAfterMin: z.number().int().min(3).max(240), phones: z.array(z.string().trim().max(20)).max(8) })
  .refine((b) => b.secondAfterMin > b.firstAfterMin, { message: "The second alert must come later than the first", path: ["secondAfterMin"] });
const opId = (me: any, given?: string) => { const id = me.role === "operator" ? String(me.operator) : given; if (!id) throw new ApiError(400, "Choose an operator"); return id; };

/** SMS escalation settings for an operator (managers: their own operator; admins pass ?operator=). */
export const GET = handle(async (req) => {
  const me = await requireUser(["admin", "operator"]);
  const op: any = await Operator.findById(opId(me, req.nextUrl.searchParams.get("operator") || undefined)).select("name escalation").lean();
  if (!op) throw new ApiError(404, "Operator not found");
  return ok({ operator: { id: op._id, name: op.name }, ...DEFAULT_ESCALATION, ...(op.escalation || {}), phones: op.escalation?.phones || [], smsConfigured: !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM) });
});
export const PUT = handle(async (req) => {
  const me = await requireUser(["admin", "operator"]);
  const b = schema.parse(await req.json());
  const phones = b.phones.map(normalizePhone);
  if (phones.some((p) => !p)) throw new ApiError(400, "Enter phone numbers with 10 digits or a country code");
  const op = await Operator.findByIdAndUpdate(opId(me, b.operatorId), { escalation: { enabled: b.enabled, firstAfterMin: b.firstAfterMin, secondAfterMin: b.secondAfterMin, phones: [...new Set(phones)] } }, { new: true }).lean();
  if (!op) throw new ApiError(404, "Operator not found");
  await audit(me, "escalation.update", "Operator", (op as any)._id, `Incident SMS escalation ${b.enabled ? `on (${b.firstAfterMin}/${b.secondAfterMin} min)` : "off"}`);
  return ok({ ok: true });
});
export const dynamic = "force-dynamic";
