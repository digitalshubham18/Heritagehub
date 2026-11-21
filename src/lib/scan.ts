import { ApiError } from "./api";
import { recordEntry, validateTicket } from "./booking";
import { isPassCode, recordPassEntry, validatePass } from "./passes";

/** One entry point for gate scans: routes booking QR codes and season-pass QR codes to the right logic. */
export async function verifyAny(actor: any, code: string, opts: { quantity?: number; destinationId?: string } = {}) {
  if (isPassCode(code)) { const v = await validatePass(actor, code, "verify", opts.destinationId); return { kind: "pass" as const, ...v, booking: null }; }
  const v = await validateTicket(actor, code, "verify", opts.quantity);
  return { kind: "booking" as const, ...v, pass: null };
}

export async function recordAny(actor: any, code: string, action: "in" | "out", opts: { quantity?: number; destinationId?: string; at?: Date; note?: string } = {}) {
  if (isPassCode(code)) {
    const r = await recordPassEntry(actor, code, action, opts.destinationId, { at: opts.at });
    return { kind: "pass" as const, reference: r.pass.reference, quantity: 1, occupancy: r.occupancy, limit: 0, holderName: r.pass.holderName, destination: r.destination };
  }
  const r = await recordEntry(actor, code, action, opts.quantity, { at: opts.at, note: opts.note });
  return { kind: "booking" as const, reference: r.booking.reference, quantity: r.quantity, occupancy: r.occupancy, limit: r.limit, booking: r.booking, destination: r.dest };
}
export { ApiError };
