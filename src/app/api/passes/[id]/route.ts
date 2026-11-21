import QRCode from "qrcode";
import { handle, ok, ApiError } from "@/lib/api";
import { canAccessDestination, requireUser } from "@/lib/auth";
import { Pass } from "@/models";
import { passCode } from "@/lib/passes";
import { platformInfo } from "@/lib/invoice";

export const GET = handle(async (_req, { params }) => {
  const me = await requireUser();
  const p: any = await Pass.findById(params.id).lean();
  if (!p) throw new ApiError(404, "Pass not found");
  const mine = String(p.user) === String(me._id);
  const manager = (me.role === "admin") || ((me.role === "operator" || me.role === "staff") && p.destinations.some((d: any) => canAccessDestination(me, d)));
  if (!mine && !manager) throw new ApiError(404, "Pass not found");
  const code = passCode(p.reference);
  return ok({ pass: p, code, qr: p.status === "active" ? await QRCode.toDataURL(code, { margin: 1, width: 360, color: { dark: "#173B2C", light: "#FFFFFF" } }) : null, platform: platformInfo() });
});
export const dynamic = "force-dynamic";
