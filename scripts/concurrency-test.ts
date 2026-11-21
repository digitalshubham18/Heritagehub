/* Fires many parallel bookings at one small slot and asserts capacity is never exceeded. Run after seeding. */
import mongoose from "mongoose";
import { connectDB } from "../src/lib/db";
import { Destination, TicketCategory, TimeSlot, User } from "../src/models";
import { ensureSlots } from "../src/lib/slots";
import { createBooking } from "../src/lib/booking";
import { addDays, todayIST } from "../src/lib/utils";

/** Some MongoDB-compatible servers (e.g. FerretDB on SQLite) lose concurrent updates. Detect that first. */
async function atomicityProbe() {
  const c = mongoose.connection.collection("_atomicity_probe");
  await c.deleteMany({}); await c.insertOne({ _id: "p" as any, n: 0 });
  await Promise.all(Array.from({ length: 40 }, () => c.updateOne({ _id: "p" as any }, { $inc: { n: 1 } })));
  const n = (await c.findOne({ _id: "p" as any }))?.n; await c.drop().catch(() => {});
  return n === 40;
}

async function main() {
  await connectDB();
  if (!(await atomicityProbe())) {
    console.error("ABORT: this database lost concurrent $inc updates, so it does not provide MongoDB's atomic single-document updates.\nThe capacity test is meaningless here. Run it against real MongoDB (Atlas or mongod).");
    process.exit(2);
  }
  const user: any = await User.findOne({ role: "tourist" }).lean();
  const dest: any = await Destination.findOne({ slug: "qutub-minar" }).lean();
  const cat: any = await TicketCategory.findOne({ destination: dest._id }).lean();
  const date = addDays(todayIST(), 5);
  const slots = await ensureSlots(dest, date);
  const slot = slots[3];
  await TimeSlot.updateOne({ _id: slot._id }, { capacity: 10, booked: 0 });
  const attempts = Array.from({ length: 40 }, (_, i) => createBooking({ _id: new mongoose.Types.ObjectId() }, {
    destinationId: String(dest._id), slotId: slot._id, items: [{ categoryId: String(cat._id), quantity: 2 }],
    visitors: [{ name: "A" }, { name: "B" }], contact: { name: "T", email: "t@x.in", phone: "9999999999" }, idempotencyKey: `conc-${i}-${Date.now()}`,
  }).then(() => "ok", (e) => (e.status === 409 ? "full" : `error:${e.message}`)));
  const res = await Promise.all(attempts);
  const final: any = await TimeSlot.findById(slot._id).lean();
  const okN = res.filter((r) => r === "ok").length;
  console.log({ succeeded: okN, rejected: res.filter((r) => r === "full").length, booked: final.booked, capacity: final.capacity });
  if (final.booked > final.capacity || okN * 2 !== final.booked) { console.error("FAIL: capacity invariant violated"); process.exit(1); }
  console.log("PASS: capacity never exceeded under concurrent load");
  await mongoose.disconnect();
}
main();
