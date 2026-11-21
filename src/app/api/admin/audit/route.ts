import { handle, ok } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { AuditLog } from "@/models";

export const GET = handle(async (req) => {
  const me = await requireUser(["admin", "operator"]);
  const action = req.nextUrl.searchParams.get("action");
  const f: any = me.role === "operator" ? { operator: me.operator } : {};
  if (action) f.action = { $regex: `^${action.replace(/[^a-z._]/gi, "")}` };
  return ok({ items: await AuditLog.find(f).sort({ createdAt: -1 }).limit(200).lean() });
});

export const dynamic = "force-dynamic";
