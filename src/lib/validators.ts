import { z } from "zod";
import { payDetailsSchema } from "./collect";

const hhmm = z.string().regex(/^\d{2}:\d{2}$/, "Use HH:MM");
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");

export const registerSchema = z.object({
  name: z.string().trim().min(2, "Enter your name").max(100),
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  password: z.string().min(8, "Use at least 8 characters").max(100),
  phone: z.string().trim().max(20).optional(),
  nationality: z.enum(["indian", "foreign"]).default("indian"),
});
export const loginSchema = z.object({ email: z.string().trim().toLowerCase().email(), password: z.string().min(1) });
export const profileSchema = z.object({
  name: z.string().trim().min(2).max(100).optional(),
  phone: z.string().trim().max(20).optional(),
  nationality: z.enum(["indian", "foreign"]).optional(),
  currentPassword: z.string().optional(),
  newPassword: z.string().min(8).max(100).optional(),
});

export const createBookingSchema = z.object({
  destinationId: z.string().min(1),
  slotId: z.string().min(1),
  items: z.array(z.object({ categoryId: z.string().min(1), quantity: z.number().int().min(1).max(20) })).min(1),
  visitors: z.array(z.object({ name: z.string().trim().min(1, "Enter visitor name").max(100), age: z.number().int().min(0).max(120).optional() })).min(1),
  contact: z.object({ name: z.string().trim().min(2), email: z.string().trim().email(), phone: z.string().trim().min(7, "Enter a phone number").max(20) }),
  idempotencyKey: z.string().min(8).max(80).optional(), redeemPoints: z.number().int().min(0).max(100000).optional(),
  buyer: z.object({ gstin: z.string().trim().toUpperCase(), legalName: z.string().trim().min(2).max(120), address: z.string().trim().min(5).max(100), city: z.string().trim().min(2).max(50), pin: z.string().trim().regex(/^\d{6}$/, "PIN code is 6 digits") }).optional(),
});
export const paySchema = z.object({
  bookingId: z.string().min(1),
  method: z.enum(["upi", "card", "netbanking"]).default("upi"),
  idempotencyKey: z.string().min(8).max(80),
  simulateFailure: z.boolean().optional(),
});

export const destinationSchema = z.object({
  name: z.string().trim().min(2),
  slug: z.string().regex(/^[a-z0-9-]+$/, "Lowercase letters, numbers and hyphens only").optional(),
  city: z.string().trim().min(2),
  state: z.string().trim().min(2),
  type: z.enum(["monument", "fort", "museum", "temple", "archaeological", "palace"]),
  shortDescription: z.string().trim().min(10).max(300),
  history: z.string().default(""),
  significance: z.string().default(""),
  images: z.array(z.string().min(1)).default([]),
  guidelines: z.array(z.string()).default([]),
  facilities: z.array(z.string()).default([]),
  accessibility: z.array(z.string()).default([]),
  faqs: z.array(z.object({ q: z.string(), a: z.string() })).default([]),
  location: z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180), address: z.string().default("") }),
  hours: z.object({ open: hhmm, close: hhmm, closedDays: z.array(z.number().int().min(0).max(6)).default([]) }),
  slotDurationMin: z.number().int().min(15).max(240).default(60),
  defaultSlotCapacity: z.number().int().min(1),
  occupancyLimit: z.number().int().min(1).default(3000),
  avgDailyVisitors: z.number().int().min(0).default(1000),
  bookingPolicy: z.object({ maxTicketsPerBooking: z.number().int().min(1).max(20).default(10), advanceDays: z.number().int().min(1).max(365).default(60) }).default({}),
  cancellationPolicy: z.object({ freeUntilHours: z.number().min(0).default(24), lateRefundPercent: z.number().min(0).max(100).default(50), noRefundHours: z.number().min(0).default(2) }).default({}),
  crowdThresholds: z.object({ moderate: z.number().min(1).max(100), high: z.number().min(1).max(150), veryHigh: z.number().min(1).max(200) }).refine((t) => t.moderate < t.high && t.high < t.veryHigh, "Thresholds must increase").default({ moderate: 40, high: 70, veryHigh: 90 }),
  alertThresholdPct: z.number().min(1).max(100).default(85),
  publicHeadcount: z.boolean().optional(),
  closures: z.array(z.object({ date, reason: z.string().default("Closed") })).default([]),
  categories: z.array(z.object({
    _id: z.string().optional(), name: z.string().min(2), audience: z.enum(["indian", "foreign", "child", "student"]),
    priceMinor: z.number().int().min(0), feeMinor: z.number().int().min(0).default(0), description: z.string().optional(),
  })).optional(),
  active: z.boolean().optional(),
  operatorId: z.string().optional(),
  heritageSlug: z.string().regex(/^[a-z0-9-]+$/).optional(), // set when this destination is created from a heritage directory entry
});
export const destinationPatchSchema = destinationSchema.partial();

export const slotCreateSchema = z.object({ destinationId: z.string(), date, start: hhmm, end: hhmm, capacity: z.number().int().min(0) });
export const slotPatchSchema = z.object({ capacity: z.number().int().min(0).optional(), closed: z.boolean().optional(), closedReason: z.string().max(200).optional() });
export const entrySchema = z.object({ code: z.string().min(4), action: z.enum(["in", "out"]), quantity: z.number().int().min(1).max(50).optional(), destinationId: z.string().optional() });
export const verifySchema = z.object({ code: z.string().min(4), destinationId: z.string().optional() });
export const reviewSchema = z.object({ destinationId: z.string(), rating: z.number().int().min(1).max(5), comment: z.string().max(1000).optional() });
export const userAdminSchema = z.object({
  name: z.string().trim().min(2), email: z.string().trim().toLowerCase().email(), password: z.string().min(8),
  role: z.enum(["tourist", "staff", "admin", "operator"]).default("staff"), assignedDestinations: z.array(z.string()).default([]), operatorId: z.string().optional(),
});

export const counterSaleSchema = z.object({
  destinationId: z.string().min(1),
  slotId: z.string().optional(),
  items: z.array(z.object({ categoryId: z.string().min(1), quantity: z.number().int().min(1).max(50) })).min(1, "Add at least one ticket"),
  method: z.enum(["cash", "upi", "card"]),
  checkIn: z.boolean().optional(),
  idempotencyKey: z.string().min(8).max(80).optional(),
  payment: payDetailsSchema.optional(),
  parking: z.object({
    vehicleType: z.enum(["car", "two_wheeler", "bus"]), bay: z.enum(["standard", "ev", "accessible"]).optional(), badgeChecked: z.boolean().optional(),
    vehicleNumber: z.string().trim().min(4, "Enter the vehicle number").max(20),
    driverName: z.string().trim().min(2, "Enter the driver's name").max(80),
    driverPhone: z.string().trim().regex(/^[+\d][\d\s-]{6,17}$/, "Enter a valid mobile number"),
    reservationRef: z.string().trim().toUpperCase().max(20).optional().or(z.literal("")).transform((v) => v || undefined),
    prepay: z.boolean().optional(),
  }).optional(),
  offline: z.object({ at: z.string().min(10).max(40), id: z.string().max(60).optional() }).optional(),
});
export const syncSchema = z.object({
  ops: z.array(z.object({ id: z.string().max(60), code: z.string().min(4).max(80), action: z.enum(["in", "out"]), quantity: z.number().int().min(1).max(50).optional(), at: z.string() })).min(1).max(200),
});
