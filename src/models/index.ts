import { randomUUID } from "crypto";
import { Schema, models, model, Model } from "mongoose";

const T = { timestamps: true };
const oid = (ref: string, extra: object = {}) => ({ type: Schema.Types.ObjectId, ref, ...extra });
function reg(name: string, schema: Schema): Model<any> {
  return (models[name] as Model<any>) || model(name, schema);
}

export const User = reg("User", new Schema({
  name: { type: String, required: true, trim: true, maxlength: 100 },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true, select: false },
  role: { type: String, enum: ["tourist", "staff", "admin", "operator"], default: "tourist", index: true },
  operator: oid("Operator", { index: true }),
  phone: String,
  nationality: { type: String, enum: ["indian", "foreign"], default: "indian" },
  assignedDestinations: [oid("Destination")],
  favorites: [oid("Destination")],
  vehicles: [{ label: String, number: String, type: { type: String, enum: ["car", "two_wheeler", "bus"], default: "car" }, _id: false }],
  savedVisitors: [{ name: String, age: Number, _id: false }],
  active: { type: Boolean, default: true },
  sessionVersion: { type: Number, default: 0 }, // bumped on password change/reset so older sessions stop working
  twoFactor: {
    enabled: { type: Boolean, default: false }, enabledAt: Date, lastStep: { type: Number, default: 0 }, // lastStep blocks re-use of a code
    secretEnc: { type: String, select: false }, pendingSecretEnc: { type: String, select: false }, recoveryHashes: { type: [String], select: false },
  },
  erasedAt: Date, // set when the person asked for their data to be erased (personal fields are anonymised, financial records kept)
}, T));

const DestinationSchema = new Schema({
  slug: { type: String, required: true, unique: true },
  operator: oid("Operator", { index: true }),
  name: { type: String, required: true },
  city: { type: String, required: true, index: true },
  state: { type: String, required: true },
  type: { type: String, enum: ["monument", "fort", "museum", "temple", "archaeological", "palace"], required: true, index: true },
  shortDescription: { type: String, required: true },
  history: { type: String, default: "" },
  significance: { type: String, default: "" },
  images: [String],
  imageCredits: [{ url: String, author: String, license: String, licenseUrl: String, sourceUrl: String, _id: false }], // attribution for images[] (filled by the heritage import)
  guidelines: [String],
  facilities: [String],
  accessibility: [String],
  faqs: [{ q: String, a: String, _id: false }],
  location: { lat: { type: Number, required: true }, lng: { type: Number, required: true }, address: { type: String, default: "" } },
  hours: { open: { type: String, required: true }, close: { type: String, required: true }, closedDays: [Number] },
  slotDurationMin: { type: Number, default: 60, min: 15 },
  defaultSlotCapacity: { type: Number, required: true, min: 1 },
  occupancyLimit: { type: Number, default: 3000, min: 1 },
  avgDailyVisitors: { type: Number, default: 5000, min: 0 },
  rating: { type: Number, default: 0 },
  ratingCount: { type: Number, default: 0 },
  popularity: { type: Number, default: 0, index: true },
  active: { type: Boolean, default: true, index: true },
  bookingPolicy: { maxTicketsPerBooking: { type: Number, default: 10 }, advanceDays: { type: Number, default: 60 } },
  cancellationPolicy: { freeUntilHours: { type: Number, default: 24 }, lateRefundPercent: { type: Number, default: 50 }, noRefundHours: { type: Number, default: 2 } },
  crowdThresholds: { moderate: { type: Number, default: 40 }, high: { type: Number, default: 70 }, veryHigh: { type: Number, default: 90 } },
  alertThresholdPct: { type: Number, default: 85 },
  publicHeadcount: { type: Boolean, default: true }, // show the real people-inside number to visitors, not just the level
  entryPaused: { type: Boolean, default: false }, // gate staff can hold entry during a rush or an incident
  entryPausedReason: String,
  entryPausedAt: Date,
  closures: [{ date: String, reason: String, _id: false }],
  dataLabel: { type: String, default: "Sample / demonstration data" },
}, T);
export const Destination = reg("Destination", DestinationSchema);

const TicketCategorySchema = new Schema({
  destination: oid("Destination", { required: true, index: true }),
  name: { type: String, required: true },
  audience: { type: String, enum: ["indian", "foreign", "child", "student"], default: "indian" },
  priceMinor: { type: Number, required: true, min: 0 },
  feeMinor: { type: Number, default: 0, min: 0 }, // extra per-ticket site fee (e.g. special-entry charge)
  description: String,
  active: { type: Boolean, default: true },
  sortOrder: { type: Number, default: 0 },
}, T);
export const TicketCategory = reg("TicketCategory", TicketCategorySchema);

const TimeSlotSchema = new Schema({
  destination: oid("Destination", { required: true }),
  date: { type: String, required: true }, // YYYY-MM-DD (IST)
  start: { type: String, required: true },
  end: { type: String, required: true },
  capacity: { type: Number, required: true, min: 0 },
  booked: { type: Number, default: 0, min: 0 },
  closed: { type: Boolean, default: false },
  closedReason: String,
}, T);
TimeSlotSchema.index({ destination: 1, date: 1, start: 1 }, { unique: true });
export const TimeSlot = reg("TimeSlot", TimeSlotSchema);

const BookingSchema = new Schema({
  reference: { type: String, required: true, unique: true },
  user: oid("User", { required: true }),
  destination: oid("Destination", { required: true }),
  slot: oid("TimeSlot", { required: true }),
  date: { type: String, required: true },
  start: { type: String, required: true },
  end: { type: String, required: true },
  items: [{ category: oid("TicketCategory"), name: String, audience: String, basePriceMinor: Number, unitPriceMinor: Number, unitFeeMinor: Number, quantity: Number, _id: false }],
  quantity: { type: Number, required: true, min: 1 },
  subtotalMinor: Number, feesMinor: Number, taxMinor: Number, totalMinor: Number,
  status: { type: String, enum: ["pending", "confirmed", "cancelled", "expired", "completed"], default: "pending" },
  paymentStatus: { type: String, enum: ["unpaid", "paid", "failed", "refunded", "partially_refunded"], default: "unpaid" },
  payment: oid("Payment"),
  holdExpiresAt: Date,
  visitors: [{ name: String, age: Number, _id: false }],
  contact: { name: String, email: String, phone: String },
  idempotencyKey: String,
  idemKey: { type: String, required: true, unique: true }, // `${user}:${clientKey}` or `ref:${reference}`; portable replacement for a partial unique index
  checkedInCount: { type: Number, default: 0 },
  checkedOutCount: { type: Number, default: 0 },
  checkedInAt: Date,
  checkedOutAt: Date,
  cancelledAt: Date,
  cancelReason: String,
  refundMinor: { type: Number, default: 0 },
  channel: { type: String, enum: ["online", "counter", "group"], default: "online" },
  grossMinor: Number, discountMinor: { type: Number, default: 0 }, discountPct: { type: Number, default: 0 }, groupName: String,
  soldBy: oid("User"), // staff member for counter sales
  creditNoteNo: String, creditNoteAt: Date, creditNoteMinor: Number, creditNoteTaxMinor: Number, // credit note issued against the invoice when a refund is paid
  transferCount: { type: Number, default: 0 }, // times this ticket was transferred to another account (transferred tickets are non-refundable for the new holder)
  originalUser: oid("User"),
  priceAdjustPct: { type: Number, default: 0 }, // dynamic / peak pricing applied to ticket prices when the booking was held
  loyaltyPointsUsed: { type: Number, default: 0 }, loyaltyDiscountMinor: { type: Number, default: 0 },
  invoiceNo: String,
  invoiceAt: Date,
  buyer: { gstin: String, legalName: String, address: String, city: String, pin: String }, // set when the buyer is a GST-registered business (B2B); only those invoices need an IRN
  einvoice: { status: { type: String, enum: ["exported", "registered"] }, irn: String, ackNo: String, ackDate: Date, signedQr: String, exportedAt: Date, registeredAt: Date }, // e-invoice (IRN) for the tax invoice
  einvoiceCn: { status: { type: String, enum: ["exported", "registered"] }, irn: String, ackNo: String, ackDate: Date, signedQr: String, exportedAt: Date, registeredAt: Date }, // and for the credit note
  history: [{ at: { type: Date, default: Date.now }, event: String, by: String, note: String, _id: false }], // append-only audit trail
}, T);
BookingSchema.index({ user: 1, createdAt: -1 });
BookingSchema.index({ destination: 1, date: 1, status: 1 });
BookingSchema.index({ slot: 1, status: 1 });
BookingSchema.index({ status: 1, holdExpiresAt: 1 });
export const Booking = reg("Booking", BookingSchema);

const PaymentSchema = new Schema({
  booking: oid("Booking", { index: true }),
  pass: oid("Pass", { index: true }),
  parkingReservation: oid("ParkingReservation", { index: true }),
  details: Schema.Types.Mixed, // counter payments: UPI reference, card slip details, cash tendered and change
  user: oid("User", { required: true }),
  provider: { type: String, default: "simulated" },
  type: { type: String, enum: ["charge", "refund"], default: "charge" },
  amountMinor: { type: Number, required: true },
  currency: { type: String, default: "INR" },
  status: { type: String, enum: ["created", "succeeded", "failed"], default: "created" },
  method: String,
  providerRef: String,
  providerOrderId: { type: String, index: true },
  failureReason: String,
  idempotencyKey: { type: String, required: true, unique: true },
}, T);
export const Payment = reg("Payment", PaymentSchema);

const EntrySchema = new Schema({
  booking: oid("Booking", { required: true, index: true }),
  destination: oid("Destination", { required: true }),
  slot: oid("TimeSlot"),
  type: { type: String, enum: ["in", "out"], required: true },
  quantity: { type: Number, required: true },
  by: oid("User"),
  device: oid("Device"),
  at: { type: Date, default: Date.now },
  note: String,
}, { timestamps: false });
EntrySchema.index({ destination: 1, at: -1 });
export const EntryRecord = reg("EntryRecord", EntrySchema);

const ObsSchema = new Schema({
  destination: oid("Destination", { required: true }),
  date: { type: String, required: true },
  hour: { type: Number, required: true },
  visitors: { type: Number, required: true },
  source: { type: String, enum: ["simulated", "recorded"], required: true },
}, T);
ObsSchema.index({ destination: 1, date: 1, hour: 1, source: 1 }, { unique: true });
export const CrowdObservation = reg("CrowdObservation", ObsSchema);

const PredSchema = new Schema({
  destination: oid("Destination", { required: true }),
  date: { type: String, required: true },
  start: { type: String, required: true },
  expected: Number, capacity: Number, densityPct: Number,
  level: String, waitMin: Number, booked: Number,
  generatedAt: { type: Date, default: Date.now },
}, { timestamps: false });
PredSchema.index({ destination: 1, date: 1, start: 1 }, { unique: true });
export const CrowdPrediction = reg("CrowdPrediction", PredSchema);

const ReviewSchema = new Schema({
  user: oid("User", { required: true }),
  destination: oid("Destination", { required: true, index: true }),
  rating: { type: Number, min: 1, max: 5, required: true },
  comment: { type: String, maxlength: 1000 },
}, T);
ReviewSchema.index({ user: 1, destination: 1 }, { unique: true });
export const Review = reg("Review", ReviewSchema);

const NotificationSchema = new Schema({
  user: oid("User"),
  destination: oid("Destination"),
  type: { type: String, enum: ["crowd_alert", "occupancy_alert", "issue", "contact", "booking", "waitlist"], required: true },
  severity: { type: String, enum: ["info", "warning", "critical"], default: "info" },
  message: { type: String, required: true },
  key: { type: String, unique: true, default: () => randomUUID() },
  read: { type: Boolean, default: false },
  meta: Schema.Types.Mixed,
}, T);
NotificationSchema.index({ destination: 1, createdAt: -1 });
export const Notification = reg("Notification", NotificationSchema);

const WaitlistSchema = new Schema({
  user: oid("User", { required: true }),
  destination: oid("Destination", { required: true }),
  slot: oid("TimeSlot", { required: true, index: true }),
  date: { type: String, required: true },
  quantity: { type: Number, required: true, min: 1, max: 20 },
  status: { type: String, enum: ["waiting", "notified", "fulfilled", "cancelled"], default: "waiting" },
  slotKey: { type: String, required: true, unique: true }, // `${user}:${slot}` while waiting, `done:${id}` afterwards
  notifiedAt: Date,
}, T);
WaitlistSchema.index({ user: 1, status: 1 });
export const Waitlist = reg("Waitlist", WaitlistSchema);

const RateLimitSchema = new Schema({ key: { type: String, required: true, unique: true }, count: { type: Number, default: 0 }, resetAt: { type: Date, required: true } }, { timestamps: false });
export const RateLimit = reg("RateLimit", RateLimitSchema);

const AuditSchema = new Schema({
  actor: oid("User", { required: true }), actorName: String, operator: oid("Operator"), action: { type: String, required: true },
  targetType: String, targetId: String, summary: String, meta: Schema.Types.Mixed,
}, { timestamps: { createdAt: true, updatedAt: false } });
AuditSchema.index({ createdAt: -1 });
export const AuditLog = reg("AuditLog", AuditSchema);

export const Counter = reg("Counter", new Schema({ key: { type: String, required: true, unique: true }, seq: { type: Number, default: 0 } }, { timestamps: false }));

/* ---------------- Multi-operator ---------------- */
export const Operator = reg("Operator", new Schema({
  name: { type: String, required: true, trim: true },
  slug: { type: String, required: true, unique: true },
  legalName: String, gstin: String, address: String, contactEmail: String,
  commissionPct: { type: Number, default: 0, min: 0, max: 100 }, // platform commission on net online ticket value
  upiId: String, upiName: String, // payee shown in the UPI QR that staff display at the gate
  blockDemoUpi: { type: Boolean, default: false }, // refuse UPI at the gate until this operator has set its own UPI ID
  escalation: { enabled: { type: Boolean, default: true }, firstAfterMin: { type: Number, default: 10 }, secondAfterMin: { type: Number, default: 25 }, phones: [String] }, // SMS escalation of unacknowledged incidents
  supportSla: { firstResponseHours: { type: Number, default: 24, min: 1, max: 720 }, followUpHours: { type: Number, default: 48, min: 1, max: 720 }, digest: { type: Boolean, default: true } }, // support reply targets
  active: { type: Boolean, default: true },
}, T));

/* ---------------- Parking ---------------- */
const rate = { capacity: { type: Number, default: 0, min: 0 }, occupied: { type: Number, default: 0, min: 0 }, freeMinutes: { type: Number, default: 15 }, firstHourMinor: { type: Number, default: 0 }, extraHourMinor: { type: Number, default: 0 }, dailyMaxMinor: { type: Number, default: 0 } };
export const ParkingLot = reg("ParkingLot", new Schema({
  destination: oid("Destination", { required: true, unique: true }),
  name: { type: String, default: "Visitor parking" },
  active: { type: Boolean, default: true },
  reservablePct: { type: Number, default: 30, min: 0, max: 100 }, // share of each vehicle type's spaces that visitors may pre-book
  car: rate, two_wheeler: rate, bus: rate,
  ev: rate, accessible: rate, // reserved car bays: EV charging and accessible. Separate pools with their own capacity and rates.
  lostTicketFeeMinor: { type: Number, default: 0, min: 0 }, // extra charge when a driver has lost the parking ticket
  gstPct: { type: Number, default: 0, min: 0, max: 40 }, // GST included in parking rates; 0 = parking is not invoiced with GST
  monthlyPass: { car: { type: Number, default: 0, min: 0 }, two_wheeler: { type: Number, default: 0, min: 0 }, bus: { type: Number, default: 0, min: 0 }, maxPerType: { type: Number, default: 0, min: 0 } }, // 30-day pass price per vehicle type; 0 = not offered. maxPerType 0 = unlimited
}, T));
const ParkingTicketSchema = new Schema({
  ticketNo: { type: String, required: true, unique: true },
  destination: oid("Destination", { required: true }),
  lot: oid("ParkingLot", { required: true }),
  vehicleType: { type: String, enum: ["car", "two_wheeler", "bus"], required: true },
  vehicleNumber: { type: String, required: true },
  activeKey: { type: String, required: true, unique: true }, // `${destination}:${vehicle}` while parked, `done:${id}` after
  status: { type: String, enum: ["parked", "exited"], default: "parked" },
  entryAt: { type: Date, default: Date.now }, exitAt: Date,
  feeMinor: { type: Number, default: 0 }, method: String, // feeMinor = total parking fee for the stay
  prepaidMinor: { type: Number, default: 0 }, // credit already paid (online reservation, or prepaid at the counter)
  prepaidMethod: String, // how a counter prepayment was taken (online reservations are paid on the website)
  paidMinor: { type: Number, default: 0 }, // collected at exit = feeMinor - prepaidMinor
  source: { type: String, enum: ["staff", "reservation", "counter"], default: "staff" },
  reservation: oid("ParkingReservation"), booking: oid("Booking"),
  driverName: String, driverPhone: String,
  payment: Schema.Types.Mixed, // { method, upiRef, card: { network, type, last4, authCode, rrn }, tenderedMinor, changeMinor }
  by: oid("User"), exitBy: oid("User"),
  bay: { type: String, enum: ["standard", "ev", "accessible"], default: "standard" }, // standard = the vehicle-type pool; ev and accessible are reserved car pools
  lostTicket: { type: Boolean, default: false }, penaltyMinor: { type: Number, default: 0 }, lostNote: String,
  passRef: String, // monthly parking pass that covered this stay
  invoiceNo: String, invoiceAt: Date, gstMinor: { type: Number, default: 0 }, gstPct: { type: Number, default: 0 },
  reprints: { type: Number, default: 0 }, lastReprintAt: Date,
  offline: Schema.Types.Mixed, // set when the entry or exit was recorded without a connection and synced later
  plate: { read: String, confidence: Number, source: String }, // number-plate camera reading that suggested the vehicle number
}, T);
ParkingTicketSchema.index({ destination: 1, status: 1, entryAt: -1 });
export const ParkingTicket = reg("ParkingTicket", ParkingTicketSchema);

/* ---------------- Season passes ---------------- */
export const PassType = reg("PassType", new Schema({
  operator: oid("Operator", { index: true }),
  name: { type: String, required: true }, description: String,
  destinations: [oid("Destination")],
  validityDays: { type: Number, required: true, min: 1, max: 3660 },
  priceMinor: { type: Number, required: true, min: 0 },
  maxEntriesPerDay: { type: Number, default: 1, min: 1, max: 20 },
  active: { type: Boolean, default: true },
}, T));
const PassSchema = new Schema({
  reference: { type: String, required: true, unique: true },
  idemKey: { type: String, required: true, unique: true },
  passType: oid("PassType", { required: true }), operator: oid("Operator"),
  user: oid("User", { required: true }),
  holderName: { type: String, required: true },
  destinations: [oid("Destination")], destinationNames: [String],
  validFrom: { type: String, required: true }, validTo: { type: String, required: true }, // YYYY-MM-DD (IST), inclusive
  maxEntriesPerDay: { type: Number, default: 1 },
  status: { type: String, enum: ["pending", "active", "cancelled"], default: "pending" },
  subtotalMinor: Number, feesMinor: Number, taxMinor: Number, totalMinor: Number,
  invoiceNo: String, invoiceAt: Date,
  insideDestination: { type: Schema.Types.ObjectId, ref: "Destination", default: null },
  insideSince: Date, lastEntryDate: String, entriesOnDay: { type: Number, default: 0 }, totalEntries: { type: Number, default: 0 },
}, T);
PassSchema.index({ user: 1, createdAt: -1 });
PassSchema.index({ operator: 1, createdAt: -1 });
export const Pass = reg("Pass", PassSchema);
export const PassEntry = reg("PassEntry", new Schema({
  pass: oid("Pass", { required: true, index: true }), destination: oid("Destination", { required: true }),
  type: { type: String, enum: ["in", "out"], required: true }, at: { type: Date, default: Date.now }, by: oid("User"), device: oid("Device"),
}, { timestamps: false }));

/* ---------------- Group and school bookings ---------------- */
export const GroupRequest = reg("GroupRequest", new Schema({
  user: oid("User", { required: true, index: true }),
  destination: oid("Destination", { required: true, index: true }),
  organisation: { type: String, required: true }, orgType: { type: String, enum: ["school", "tour_operator", "corporate", "other"], default: "school" },
  size: { type: Number, required: true, min: 10, max: 1000 },
  category: oid("TicketCategory", { required: true }),
  date: { type: String, required: true }, preferredStart: String, notes: String,
  contact: { name: String, email: String, phone: String },
  status: { type: String, enum: ["requested", "approved", "rejected", "cancelled"], default: "requested" },
  managerNote: String, discountPct: { type: Number, default: 0 },
  booking: oid("Booking"), decidedBy: oid("User"), decidedAt: Date,
}, T));

/* ---------------- Gate hardware ---------------- */
export const Device = reg("Device", new Schema({
  name: { type: String, required: true },
  destination: oid("Destination", { required: true, index: true }), operator: oid("Operator"),
  kind: { type: String, enum: ["scanner", "turnstile", "kiosk", "printer", "plate_camera", "people_counter"], default: "scanner" },
  direction: { type: String, enum: ["in", "out"], default: "in" },
  mode: { type: String, enum: ["one", "all"], default: "one" }, // visitors admitted per scan: one (turnstile) or everyone on the booking (gate)
  keyHash: { type: String, required: true, unique: true }, keyHint: String,
  active: { type: Boolean, default: true },
  lastSeenAt: Date, lastScanAt: Date, scans: { type: Number, default: 0 },
}, T));

/**
 * Real headcount, independent of tickets. `delta` rows are people counted through a door by a sensor/camera/clicker;
 * `set` rows are an absolute "people inside right now" reading (manual walk-round count or camera snapshot) that
 * re-baselines the running total so sensor drift never accumulates.
 */
const HeadcountSchema = new Schema({
  destination: oid("Destination", { required: true }),
  kind: { type: String, enum: ["delta", "set"], default: "delta" },
  in: { type: Number, default: 0, min: 0 }, out: { type: Number, default: 0, min: 0 },
  inside: { type: Number, min: 0 }, // only for kind "set"
  source: { type: String, enum: ["sensor", "manual"], default: "sensor" },
  device: oid("Device"), by: oid("User"), gate: String,
  at: { type: Date, default: Date.now },
}, { timestamps: false });
HeadcountSchema.index({ destination: 1, at: -1 });
export const HeadcountEvent = reg("HeadcountEvent", HeadcountSchema);

/* ---------------- Parking reservations (visitor pre-booking) ---------------- */
const ParkingReservationSchema = new Schema({
  reference: { type: String, required: true, unique: true },
  idemKey: { type: String, required: true, unique: true },
  activeKey: { type: String, required: true, unique: true }, // `${destination}:${date}:${vehicle}` while live, `done:${id}` afterwards
  user: oid("User", { required: true, index: true }),
  destination: oid("Destination", { required: true, index: true }),
  lot: oid("ParkingLot", { required: true }),
  date: { type: String, required: true },
  arrivalFrom: { type: String, default: "09:00" }, // expected arrival time (informational; the space is held all day)
  vehicleType: { type: String, enum: ["car", "two_wheeler", "bus"], required: true },
  vehicleNumber: { type: String, required: true },
  bay: { type: String, enum: ["standard", "ev", "accessible"], default: "standard" },
  bookingRef: String, // optional link to the visitor's ticket booking
  status: { type: String, enum: ["reserved", "arrived", "cancelled", "expired"], default: "reserved" },
  paymentMode: { type: String, enum: ["prepay", "at_exit"], default: "at_exit" },
  prepaidMinor: { type: Number, default: 0 }, refundMinor: { type: Number, default: 0 },
  ticket: oid("ParkingTicket"),
  history: [{ at: { type: Date, default: Date.now }, event: String, note: String, _id: false }],
}, T);
ParkingReservationSchema.index({ destination: 1, date: 1, status: 1 });
ParkingReservationSchema.index({ user: 1, date: -1 });
export const ParkingReservation = reg("ParkingReservation", ParkingReservationSchema);
/** Atomic per-day counter of live reservations for one lot and vehicle type. */
export const ParkingDay = reg("ParkingDay", new Schema({
  key: { type: String, required: true, unique: true }, lot: oid("ParkingLot", { required: true }), date: { type: String, required: true },
  vehicleType: { type: String, required: true }, reserved: { type: Number, default: 0, min: 0 },
}, { timestamps: false }));

/* ---------------- Incidents, announcements, shifts, device log ---------------- */
export const Incident = reg("Incident", new Schema({
  destination: oid("Destination", { required: true, index: true }), operator: oid("Operator"),
  reportedBy: oid("User", { required: true }), reporterName: String,
  category: { type: String, enum: ["medical", "lost_child", "security", "crowd", "maintenance", "other"], default: "other" },
  severity: { type: String, enum: ["warning", "critical"], default: "warning" },
  message: { type: String, required: true, maxlength: 600 },
  status: { type: String, enum: ["open", "acknowledged", "resolved"], default: "open", index: true },
  resolvedAt: Date, resolutionNote: String, handledBy: oid("User"),
  escalationLevel: { type: Number, default: 0 }, lastEscalatedAt: Date, // 0 = none, 1 = first SMS sent, 2 = second SMS sent
  history: [{ at: { type: Date, default: Date.now }, event: String, by: String, note: String, _id: false }],
}, T));
export const Announcement = reg("Announcement", new Schema({
  operator: oid("Operator", { index: true }), destinations: [oid("Destination")], // empty = every site of the operator
  title: { type: String, required: true, maxlength: 120 }, body: { type: String, default: "", maxlength: 800 },
  severity: { type: String, enum: ["info", "warning", "critical"], default: "info" },
  audience: { type: String, enum: ["visitors", "staff", "all"], default: "all" },
  startsAt: { type: Date, default: Date.now }, endsAt: Date,
  active: { type: Boolean, default: true }, createdBy: oid("User"),
}, T));
export const ShiftReport = reg("ShiftReport", new Schema({
  user: oid("User", { required: true, index: true }), userName: String, destination: oid("Destination", { required: true }), operator: oid("Operator"),
  date: { type: String, required: true },
  ticketsSold: Number, counterCashMinor: Number, parkingCashMinor: Number, openingFloatMinor: { type: Number, default: 0 }, expectedCashMinor: Number, countedCashMinor: Number, varianceMinor: Number,
  handover: oid("ShiftHandover"),
  notes: { type: String, maxlength: 500 },
}, T));
export const DeviceEvent = reg("DeviceEvent", new Schema({
  device: oid("Device", { required: true, index: true }), destination: oid("Destination", { required: true }),
  code: String, direction: String, allow: Boolean, message: String, reason: String, source: { type: String, default: "device" }, at: { type: Date, default: Date.now },
}, { timestamps: false }));

/* ---------------- Parking: per-date capacity, monthly passes, camera reads ---------------- */
export const ParkingOverride = reg("ParkingOverride", (() => {
  const sc = new Schema({
    lot: oid("ParkingLot", { required: true }), destination: oid("Destination", { required: true, index: true }),
    date: { type: String, required: true }, pool: { type: String, enum: ["car", "two_wheeler", "bus", "ev", "accessible"], required: true },
    capacity: { type: Number, required: true, min: 0 }, reason: { type: String, maxlength: 200 }, by: oid("User"),
    key: { type: String, required: true, unique: true }, // `${lot}:${date}:${pool}`
  }, T);
  return sc;
})());
export const ParkingPass = reg("ParkingPass", (() => {
  const sc = new Schema({
    reference: { type: String, required: true, unique: true },
    idemKey: { type: String, required: true, unique: true },
    activeKey: { type: String, required: true, unique: true }, // `${destination}:${vehicle}` while the pass is live, `done:${id}` afterwards
    destination: oid("Destination", { required: true, index: true }), lot: oid("ParkingLot", { required: true }), operator: oid("Operator"),
    user: oid("User"), soldBy: oid("User"), channel: { type: String, enum: ["online", "staff"], default: "staff" },
    vehicleType: { type: String, enum: ["car", "two_wheeler", "bus"], required: true }, vehicleNumber: { type: String, required: true },
    holderName: { type: String, required: true }, holderPhone: String,
    validFrom: { type: String, required: true }, validTo: { type: String, required: true }, // YYYY-MM-DD (IST), inclusive
    status: { type: String, enum: ["active", "cancelled"], default: "active" },
    priceMinor: { type: Number, default: 0 }, gstMinor: { type: Number, default: 0 }, gstPct: { type: Number, default: 0 }, method: String, payment: Schema.Types.Mixed,
    holderEmail: String, reminderSentAt: Date, // expiry reminder (sent once, in the last 7 days)
    refundMinor: { type: Number, default: 0 }, refundMethod: String, cancelReason: String, creditNoteNo: String, creditNoteAt: Date, creditNoteGstMinor: Number,
    invoiceNo: String, invoiceAt: Date, entries: { type: Number, default: 0 }, renewals: { type: Number, default: 0 },
    history: [{ at: { type: Date, default: Date.now }, event: String, note: String, _id: false }],
  }, T);
  sc.index({ destination: 1, vehicleNumber: 1, validTo: -1 });
  return sc;
})());
export const PlateRead = reg("PlateRead", new Schema({
  destination: oid("Destination", { required: true, index: true }), device: oid("Device"), by: oid("User"),
  plate: { type: String, required: true }, raw: String, confidence: Number, direction: { type: String, enum: ["in", "out"], default: "in" },
  source: { type: String, enum: ["camera_device", "staff_camera", "provider"], default: "camera_device" },
  match: { type: String, enum: ["pass", "reservation", "parked", "none"], default: "none" }, matchRef: String,
  used: { type: Boolean, default: false }, at: { type: Date, default: Date.now },
}, { timestamps: false }));

/* ---------------- Staff: handover, lost and found, roster ---------------- */
export const ShiftHandover = reg("ShiftHandover", new Schema({
  destination: oid("Destination", { required: true, index: true }), operator: oid("Operator"),
  from: oid("User", { required: true }), fromName: String, to: oid("User", { required: true, index: true }), toName: String,
  date: { type: String, required: true },
  handedCashMinor: { type: Number, required: true }, expectedCashMinor: Number, varianceMinor: Number, report: oid("ShiftReport"),
  notes: { type: String, maxlength: 600 },
  snapshot: { vehiclesParked: Number, insideNow: Number, entryPaused: Boolean, entryPausedReason: String, openIncidents: [{ id: String, category: String, severity: String, message: String, status: String, _id: false }] },
  status: { type: String, enum: ["pending", "accepted", "cancelled"], default: "pending" },
  acceptedAt: Date, receivedCashMinor: Number, receiveVarianceMinor: Number, receiveNotes: { type: String, maxlength: 400 },
}, T));
export const LostFoundItem = reg("LostFoundItem", new Schema({
  reference: { type: String, required: true, unique: true },
  destination: oid("Destination", { required: true, index: true }), operator: oid("Operator"),
  kind: { type: String, enum: ["found", "lost"], required: true },
  category: { type: String, enum: ["bag", "phone", "wallet", "documents", "keys", "clothing", "jewellery", "child_item", "electronics", "other"], default: "other" },
  description: { type: String, required: true, maxlength: 500 }, location: { type: String, maxlength: 160 }, color: String,
  contactName: String, contactPhone: String, // who lost it (lost reports) or who handed it in (found)
  status: { type: String, enum: ["open", "matched", "returned", "disposed"], default: "open", index: true },
  matchedWith: oid("LostFoundItem"),
  returnedTo: { name: String, phone: String, idType: String, idLast4: String, at: Date, by: oid("User"), byName: String },
  loggedBy: oid("User", { required: true }), loggedByName: String,
  history: [{ at: { type: Date, default: Date.now }, event: String, by: String, note: String, _id: false }],
}, T));
export const RosterShift = reg("RosterShift", (() => {
  const sc = new Schema({
    operator: oid("Operator", { index: true }), destination: oid("Destination", { required: true, index: true }),
    user: oid("User", { required: true, index: true }), userName: String,
    date: { type: String, required: true }, start: { type: String, required: true }, end: { type: String, required: true },
    position: { type: String, enum: ["gate", "counter", "parking", "floor", "supervisor"], default: "gate" }, notes: { type: String, maxlength: 200 },
    createdBy: oid("User"),
  }, T);
  sc.index({ destination: 1, date: 1 }); sc.index({ user: 1, date: 1 });
  return sc;
})());

/* ---------------- Operator: dynamic pricing ---------------- */
export const PricingRule = reg("PricingRule", new Schema({
  operator: oid("Operator", { index: true }), destination: oid("Destination", { required: true, index: true }),
  name: { type: String, required: true, maxlength: 80 }, adjustPct: { type: Number, required: true, min: -50, max: 100 },
  daysOfWeek: [Number], dateFrom: String, dateTo: String, // empty = every day / no date limit
  timeFrom: String, timeTo: String, // slot start window (HH:MM); empty = all slots
  minBookedPct: { type: Number, default: 0, min: 0, max: 100 }, // demand: only when the slot is at least this full
  audiences: [{ type: String, enum: ["indian", "foreign", "child", "student"] }], // empty = every ticket category
  active: { type: Boolean, default: true }, createdBy: oid("User"),
}, T));

/* ---------------- Tourist: transfers, loyalty, support ---------------- */
export const TicketTransfer = reg("TicketTransfer", new Schema({
  booking: oid("Booking", { required: true, index: true }), from: oid("User", { required: true, index: true }), to: oid("User", { required: true, index: true }),
  toEmail: String, fromName: String, toName: String, visitors: [{ name: String, age: Number, _id: false }], message: { type: String, maxlength: 200 },
  status: { type: String, enum: ["pending", "accepted", "declined", "cancelled", "expired", "failed"], default: "pending" },
  expiresAt: { type: Date, required: true }, decidedAt: Date, failReason: String,
  pendingKey: { type: String, required: true, unique: true }, // `${booking}` while pending, `done:${id}` afterwards: one open transfer per booking
}, T));
export const LoyaltyAccount = reg("LoyaltyAccount", new Schema({
  user: oid("User", { required: true, unique: true }), balance: { type: Number, default: 0, min: 0 }, lifetime: { type: Number, default: 0, min: 0 },
}, T));
export const LoyaltyEntry = reg("LoyaltyEntry", (() => {
  const sc = new Schema({
    user: oid("User", { required: true, index: true }), type: { type: String, enum: ["earn", "redeem", "restore", "bonus", "adjust", "expire"], required: true },
    remaining: Number, expiresAt: Date, // for credits: points not yet spent or expired; spending takes the oldest first
    by: oid("User"), // who made a manual adjustment
    points: { type: Number, required: true }, // positive for earn/restore/bonus, negative for redeem
    booking: oid("Booking"), destination: oid("Destination"), note: String,
    key: { type: String, required: true, unique: true }, // idempotency: `earn:${booking}`, `redeem:${booking}`, `restore:${booking}`
  }, T);
  sc.index({ user: 1, createdAt: -1 });
  return sc;
})());
export const SupportTicket = reg("SupportTicket", (() => {
  const sc = new Schema({
    reference: { type: String, required: true, unique: true },
    user: oid("User", { index: true }), name: { type: String, required: true }, email: { type: String, required: true },
    destination: oid("Destination", { index: true }), operator: oid("Operator", { index: true }), bookingRef: String,
    category: { type: String, enum: ["booking", "payment", "parking", "accessibility", "lost_property", "other"], default: "other" },
    subject: { type: String, required: true, maxlength: 140 },
    status: { type: String, enum: ["open", "in_progress", "resolved", "closed"], default: "open", index: true },
    messages: [{ from: { type: String, enum: ["visitor", "staff"], required: true }, byName: String, body: { type: String, required: true, maxlength: 2000 }, at: { type: Date, default: Date.now }, _id: false }],
    lastMessageAt: { type: Date, default: Date.now }, lastFrom: { type: String, enum: ["visitor", "staff"], default: "visitor" },
    assignedTo: oid("User"),
  }, T);
  sc.index({ user: 1, lastMessageAt: -1 });
  return sc;
})());

/* ---------------- Roster attendance and swaps ---------------- */
export const Attendance = reg("Attendance", (() => {
  const sc = new Schema({
    user: oid("User", { required: true, index: true }), userName: String, destination: oid("Destination", { required: true, index: true }), operator: oid("Operator"),
    date: { type: String, required: true }, shift: oid("RosterShift"), // the rostered shift this clock-in matched, if any
    inAt: { type: Date, required: true }, outAt: Date, lateMin: { type: Number, default: 0 }, unrostered: { type: Boolean, default: false }, autoClosed: { type: Boolean, default: false },
    openKey: { type: String, required: true, unique: true }, // `${user}` while clocked in, `done:${id}` afterwards: one open clock-in per person
  }, T);
  sc.index({ destination: 1, date: 1 });
  return sc;
})());
export const SwapRequest = reg("SwapRequest", new Schema({
  shift: oid("RosterShift", { required: true, index: true }), destination: oid("Destination", { required: true, index: true }), operator: oid("Operator"),
  from: oid("User", { required: true, index: true }), fromName: String, to: oid("User", { required: true, index: true }), toName: String, note: { type: String, maxlength: 200 },
  status: { type: String, enum: ["pending_colleague", "pending_manager", "approved", "declined", "cancelled", "failed"], default: "pending_colleague" },
  decidedBy: oid("User"), decidedAt: Date, reason: String,
  openKey: { type: String, required: true, unique: true }, // `${shift}` while open: one open request per shift
}, T));


/* ---------------- Account security, privacy, reconciliation ---------------- */
export const PasswordReset = reg("PasswordReset", (() => {
  const sc = new Schema({ user: oid("User", { required: true, index: true }), tokenHash: { type: String, required: true, unique: true }, expiresAt: { type: Date, required: true }, usedAt: Date }, T);
  return sc;
})());
/** Accountability record for data requests. Holds no personal data: only the type, the outcome and counts. */
export const PrivacyRequest = reg("PrivacyRequest", new Schema({
  userRef: { type: String, required: true, index: true }, // hashed user id
  type: { type: String, enum: ["export", "erase"], required: true },
  status: { type: String, enum: ["completed", "refused"], required: true }, reason: String, counts: Schema.Types.Mixed,
}, T));
/** One run of matching staff-recorded UPI payments against an uploaded bank statement. */
export const ReconRun = reg("ReconRun", new Schema({
  operator: oid("Operator", { index: true }), destinations: [oid("Destination")], from: { type: String, required: true }, to: { type: String, required: true },
  by: oid("User", { required: true }), byName: String, fileName: String, statementRows: Number,
  totals: Schema.Types.Mixed,
  items: [{ kind: { type: String, enum: ["matched", "amount_mismatch", "unmatched_recorded", "unmatched_bank"], required: true }, source: String, ref: String, amountMinor: Number, at: Date, staffName: String, destinationName: String, bankLine: String, bankDate: String, match: String, resolved: { type: Boolean, default: false }, note: String }],
}, T));
