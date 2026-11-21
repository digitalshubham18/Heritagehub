import { z } from "zod";
import { handle, ok } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { enterVehicle } from "@/lib/parking";
import { limit } from "@/lib/ratelimit";

const schema = z.object({
  destinationId: z.string().min(1), vehicleType: z.enum(["car", "two_wheeler", "bus"]).optional(), bay: z.enum(["standard", "ev", "accessible"]).optional(), badgeChecked: z.boolean().optional(),
  at: z.string().max(40).optional(), offlineId: z.string().max(60).optional(), plate: z.object({ read: z.string().max(20), confidence: z.number().min(0).max(1).optional(), source: z.string().max(30).optional() }).optional(), vehicleNumber: z.string().min(3).max(20).optional(),
  reservationRef: z.string().trim().max(20).optional(), driverName: z.string().trim().max(80).optional(), driverPhone: z.string().trim().max(20).optional(),
}).refine((b) => b.reservationRef || (b.vehicleType && b.vehicleNumber), { message: "Choose the vehicle type and enter the vehicle number, or enter a reservation code" });
export const POST = handle(async (req) => {
  const me = await requireUser(["staff", "admin", "operator"]);
  await limit("parking", [String(me._id)], 240, 60);
  const t = await enterVehicle(me, schema.parse(await req.json()));
  return ok({ ticket: t }, 201);
});
export const dynamic = "force-dynamic";
