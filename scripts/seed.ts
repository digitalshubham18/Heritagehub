/* Seeds users, 7 Indian heritage sites, 90 days of SIMULATED crowd history and a few demo bookings. */
import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import { connectDB } from "../src/lib/db";
import * as M from "../src/models";
import { baselineDaily, predictDay } from "../src/lib/crowd";
import { ensureSlots, slotTemplate } from "../src/lib/slots";
import { createBooking, payBooking } from "../src/lib/booking";
import { approveGroup } from "../src/lib/groups";
import { purchasePass } from "../src/lib/passes";
import { hashKey } from "../src/lib/devices";
import { reserveParking } from "../src/lib/parking";
import { addDays, todayIST, toMin } from "../src/lib/utils";

const wm = (f: string) => `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(f)}?width=1400`;
const rupees = (n: number) => n * 100;
const faq = (q: string, a: string) => ({ q, a });
const std = {
  facilities: ["Drinking water", "Restrooms", "Shaded rest areas", "Audio guides (on request)", "First aid"],
  accessibility: ["Wheelchair-accessible main routes (some steps remain)", "Wheelchairs available on request"],
  guidelines: ["Carry a valid photo ID that matches your booking", "Tripods, drones and large bags are not permitted", "No food or smoking inside protected areas", "Dress modestly and keep to marked paths", "Entry is only during your booked time slot"],
};
const cat = (name: string, audience: string, price: number, fee = 0, description?: string) => ({ name, audience, priceMinor: rupees(price), feeMinor: rupees(fee), description });
const standardCats = (indian: number, foreign: number) => [
  cat("Indian citizen", "indian", indian, 0, "Valid photo ID required"),
  cat("Foreign visitor", "foreign", foreign, 0, "Passport required"),
  cat("Child under 15", "child", 0, 0, "Free entry; still needs a ticket for capacity"),
];

const SITES: any[] = [
  { slug: "taj-mahal", name: "Taj Mahal", city: "Agra", state: "Uttar Pradesh", type: "monument", popularity: 100, rating: 4.8, ratingCount: 1240,
    shortDescription: "The ivory-white marble mausoleum built by Shah Jahan for Mumtaz Mahal, a UNESCO World Heritage Site.",
    history: "Commissioned by the Mughal emperor Shah Jahan in memory of his wife Mumtaz Mahal, the Taj Mahal was built on the banks of the Yamuna between about 1632 and 1653. Its design joins Persian, Islamic and Indian architectural traditions around a central marble tomb, four minarets and a charbagh garden.",
    significance: "Inscribed on the UNESCO World Heritage List in 1983 and widely regarded as a masterpiece of Mughal architecture.",
    images: [wm("Taj_Mahal_(Edited).jpeg"), wm("Taj_Mahal_in_March_2004.jpg")], location: { lat: 27.1751, lng: 78.0421, address: "Dharmapuri, Forest Colony, Tajganj, Agra" },
    hours: { open: "06:00", close: "18:00", closedDays: [5] }, slotDurationMin: 60, defaultSlotCapacity: 1500, occupancyLimit: 5000, avgDailyVisitors: 9000,
    categories: [cat("Indian citizen – grounds", "indian", 50), cat("Indian citizen – with main mausoleum", "indian", 50, 200, "Includes the separate mausoleum entry fee"), cat("Foreign visitor – grounds", "foreign", 1100), cat("Foreign visitor – with main mausoleum", "foreign", 1100, 200), cat("Child under 15", "child", 0)],
    faqs: [faq("Which day is the Taj Mahal closed?", "It is closed on Fridays for general visitors."), faq("Can I carry a bag?", "Only small bags are allowed; large bags and tripods are not permitted.")] },
  { slug: "agra-fort", name: "Agra Fort", city: "Agra", state: "Uttar Pradesh", type: "fort", popularity: 82, rating: 4.6, ratingCount: 760,
    shortDescription: "A red-sandstone Mughal fortress-palace on the Yamuna, begun under Akbar and extended by Shah Jahan.",
    history: "Construction of the present fort began under Akbar in 1565. Shah Jahan later added marble palaces such as the Khas Mahal and Musamman Burj, from where the Taj Mahal can be seen.",
    significance: "A UNESCO World Heritage Site (1983) that served as the main residence of the Mughal emperors for generations.",
    images: [wm("Agra_Fort_Delhi_Gate.jpg")], location: { lat: 27.1795, lng: 78.0211, address: "Rakabganj, Agra" },
    hours: { open: "06:00", close: "18:00", closedDays: [] }, slotDurationMin: 60, defaultSlotCapacity: 700, occupancyLimit: 2500, avgDailyVisitors: 5000,
    categories: standardCats(40, 550), faqs: [faq("How long should I allow?", "Plan for about two hours.")] },
  { slug: "red-fort", name: "Red Fort (Lal Qila)", city: "New Delhi", state: "Delhi", type: "fort", popularity: 90, rating: 4.5, ratingCount: 980,
    shortDescription: "Shah Jahan's 17th-century red-sandstone citadel in Old Delhi and a symbol of Indian independence.",
    history: "Built between 1639 and 1648 as the palace-fort of Shahjahanabad, the Red Fort served as the Mughal capital's centre. The Prime Minister of India raises the national flag here each Independence Day.",
    significance: "UNESCO World Heritage Site (2007). Its museums and Diwan-i-Aam, Diwan-i-Khas and Rang Mahal show the layout of a Mughal court.",
    images: [wm("Red_Fort_in_Delhi_03-2016_img3.jpg")], location: { lat: 28.6562, lng: 77.241, address: "Netaji Subhash Marg, Chandni Chowk, Delhi" },
    hours: { open: "09:30", close: "16:30", closedDays: [1] }, slotDurationMin: 60, defaultSlotCapacity: 1500, occupancyLimit: 4000, avgDailyVisitors: 6000,
    categories: standardCats(35, 500), faqs: [faq("Is the Red Fort open on Mondays?", "No, it is closed on Mondays.")] },
  { slug: "amber-fort", name: "Amber Fort", city: "Jaipur", state: "Rajasthan", type: "fort", popularity: 85, rating: 4.7, ratingCount: 870,
    shortDescription: "A hilltop fort-palace of sandstone and marble above Maota Lake, with mirror-work halls.",
    history: "Raja Man Singh I began the fort in 1592 on the site of an older Kachhwaha stronghold. Later rulers, notably Jai Singh I, expanded the palaces, including the Sheesh Mahal.",
    significance: "Part of the UNESCO-listed 'Hill Forts of Rajasthan' (2013), noted for Rajput-Mughal architecture.",
    images: [wm("Amer_Fort_Jaipur.jpg")], location: { lat: 26.9855, lng: 75.8513, address: "Devisinghpura, Amer, Jaipur" },
    hours: { open: "08:00", close: "17:30", closedDays: [] }, slotDurationMin: 30, defaultSlotCapacity: 450, occupancyLimit: 2500, avgDailyVisitors: 5500,
    categories: standardCats(100, 500), faqs: [faq("Is there a climb?", "Yes. You can walk up, or use the paid jeep or elephant-free alternatives available on site.")] },
  { slug: "qutub-minar", name: "Qutub Minar Complex", city: "New Delhi", state: "Delhi", type: "archaeological", popularity: 75, rating: 4.5, ratingCount: 640,
    shortDescription: "A 72.5 m brick minaret from the 12th–13th century, set within an early Delhi Sultanate complex.",
    history: "Qutb ud-Din Aibak began the tower around 1199 and later rulers, including Iltutmish, completed its upper storeys. The surrounding complex holds the Quwwat-ul-Islam Mosque and the Iron Pillar.",
    significance: "UNESCO World Heritage Site (1993) and the tallest brick minaret in the world.",
    images: [wm("Qutb_Minar_2017.jpg")], location: { lat: 28.5245, lng: 77.1855, address: "Mehrauli, New Delhi" },
    hours: { open: "07:00", close: "17:00", closedDays: [] }, slotDurationMin: 60, defaultSlotCapacity: 700, occupancyLimit: 2500, avgDailyVisitors: 3800,
    categories: standardCats(40, 600), faqs: [faq("Can I climb the tower?", "No. Climbing the minaret is not permitted.")] },
  { slug: "vittala-temple-hampi", name: "Vittala Temple, Hampi", city: "Hampi", state: "Karnataka", type: "temple", popularity: 70, rating: 4.7, ratingCount: 410,
    shortDescription: "A Vijayanagara-era temple complex famed for its stone chariot and musical pillars.",
    history: "Built mainly in the 15th–16th centuries under the Vijayanagara Empire, the Vittala Temple is known for its richly carved halls and the iconic stone chariot.",
    significance: "Part of the Group of Monuments at Hampi, a UNESCO World Heritage Site since 1986.",
    images: [wm("Hampi_chariot.jpg")], location: { lat: 15.3419, lng: 76.4759, address: "Vittala Temple Rd, Hampi" },
    hours: { open: "08:30", close: "17:30", closedDays: [] }, slotDurationMin: 60, defaultSlotCapacity: 300, occupancyLimit: 1200, avgDailyVisitors: 1800,
    categories: standardCats(40, 600), faqs: [faq("Can I tap the musical pillars?", "No. Touching or striking them is prohibited to protect the stone.")] },
  { slug: "national-museum-delhi", name: "National Museum, New Delhi", city: "New Delhi", state: "Delhi", type: "museum", popularity: 60, rating: 4.4, ratingCount: 520,
    shortDescription: "One of India's largest museums, with over 200,000 works spanning 5,000 years of art and culture.",
    history: "Established in 1949 and moved to its present building on Janpath in 1960, the museum holds archaeological finds, sculpture, manuscripts, textiles and miniature paintings.",
    significance: "A major repository of India's artistic and cultural heritage, useful for context before visiting monuments.",
    images: [wm("National_Museum_New_Delhi.jpg")], location: { lat: 28.6118, lng: 77.2195, address: "Janpath Rd, New Delhi" },
    hours: { open: "10:00", close: "18:00", closedDays: [1] }, slotDurationMin: 60, defaultSlotCapacity: 350, occupancyLimit: 1200, avgDailyVisitors: 1500,
    categories: standardCats(20, 650), faqs: [faq("Are galleries photography-friendly?", "Photography rules vary by gallery; follow signs and staff guidance.")] },
];

function rng(seed: number) { return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

const T0 = Date.now(); const lap = (m: string) => console.log(`[${Math.round((Date.now() - T0) / 1000)}s] ${m}`);
async function main() {
  process.env.NOTIFY_DISABLED = "true"; // no emails/SMS for seeded demo bookings
  await connectDB();
  for (const m of Object.values(M)) await (m as any).deleteMany({});
  await Promise.all(Object.values(M).map((m: any) => m.syncIndexes()));

  const hash = (p: string) => bcrypt.hash(p, 10);
  const admin = await M.User.create({ name: "Asha Admin", email: "admin@heritagehub.test", passwordHash: await hash("Admin@123"), role: "admin" });
  const tourist = await M.User.create({ name: "Rahul Tourist", email: "tourist@heritagehub.test", passwordHash: await hash("Tourist@123"), role: "tourist", phone: "9876543210" });

  const dests: any[] = [];
  for (const s of SITES) {
    const { categories, ...rest } = s;
    const d = await M.Destination.create({ ...std, ...rest, guidelines: std.guidelines, facilities: std.facilities, accessibility: std.accessibility });
    await M.TicketCategory.insertMany(categories.map((c: any, i: number) => ({ ...c, destination: d._id, sortOrder: i })));
    dests.push(d);
  }
  // ---- Operators: three demo organisations, each running its own sites ----
  const opN: any = await M.Operator.create({ name: "Heritage Circle North (demo)", slug: "heritage-circle-north", legalName: "Heritage Circle North (demo)", contactEmail: "north@example.test", commissionPct: 2 });
  const opJ: any = await M.Operator.create({ name: "Jaipur Fort Trust (demo)", slug: "jaipur-fort-trust", legalName: "Jaipur Fort Trust (demo)", contactEmail: "jaipur@example.test", commissionPct: 3 });
  const opK: any = await M.Operator.create({ name: "Karnataka Heritage Board (demo)", slug: "karnataka-heritage-board", legalName: "Karnataka Heritage Board (demo)", contactEmail: "karnataka@example.test", commissionPct: 2.5 });
  const opOf: Record<string, any> = { "amber-fort": opJ, "vittala-temple-hampi": opK };
  for (const d of dests) { d.operator = (opOf[d.slug] || opN)._id; await M.Destination.updateOne({ _id: d._id }, { operator: d.operator }); }
  for (const [n, o, e] of [["Neha North", opN, "operator1"], ["Jai Jaipur", opJ, "operator2"], ["Kiran Karnataka", opK, "operator3"]] as const) await M.User.create({ name: n, email: `${e}@heritagehub.test`, passwordHash: await hash("Operator@123"), role: "operator", operator: o._id, phone: "9000000001" });
  const bySlug = (s: string) => dests.find((d) => d.slug === s);
  const staff1: any = await M.User.create({ name: "Sunil Staff", email: "staff@heritagehub.test", passwordHash: await hash("Staff@123"), role: "staff", operator: opN._id, assignedDestinations: [dests[0]._id, dests[1]._id] });
  const staff2: any = await M.User.create({ name: "Meena Staff", email: "staff2@heritagehub.test", passwordHash: await hash("Staff@123"), role: "staff", operator: opN._id, assignedDestinations: [dests[0]._id, dests[1]._id] });

  // ---- Parking lots (rates in paise) with some vehicles already parked at the Taj ----
  const lotRates = (c: number, t: number, b: number) => ({ car: { capacity: c, freeMinutes: 15, firstHourMinor: 5000, extraHourMinor: 3000, dailyMaxMinor: 20000 }, two_wheeler: { capacity: t, freeMinutes: 15, firstHourMinor: 1500, extraHourMinor: 1000, dailyMaxMinor: 6000 }, bus: { capacity: b, freeMinutes: 30, firstHourMinor: 10000, extraHourMinor: 5000, dailyMaxMinor: 40000 } });
  const lots: Record<string, any> = {};
  for (const [slug, c, t, b] of [["taj-mahal", 220, 320, 24], ["agra-fort", 120, 200, 12], ["red-fort", 90, 150, 10], ["amber-fort", 180, 240, 20]] as const) lots[slug] = await M.ParkingLot.create({ destination: bySlug(slug)._id, ...lotRates(c, t, b) });
  {
    const rnd0 = rng(7), taj = bySlug("taj-mahal"), tickets: any[] = [], cnt: Record<string, number> = { car: 0, two_wheeler: 0, bus: 0 };
    const want: [string, number, string][] = [["car", 41, "UP80"], ["two_wheeler", 58, "UP81"], ["bus", 4, "UP32"]];
    for (const [type, n, pre] of want) for (let i = 0; i < n; i++) { cnt[type]++; const vn = `${pre}${["AB", "CD", "EF", "GH"][i % 4]}${1000 + i * 37 + Math.floor(rnd0() * 30)}`; tickets.push({ ticketNo: `PK-DEMO${type[0].toUpperCase()}${i}`.padEnd(9, "X"), destination: taj._id, lot: lots["taj-mahal"]._id, vehicleType: type, vehicleNumber: vn, activeKey: `${taj._id}:${vn}`, entryAt: new Date(Date.now() - Math.floor(rnd0() * 170 + 5) * 60000) }); }
    await M.ParkingTicket.insertMany(tickets);
    await M.ParkingLot.updateOne({ _id: lots["taj-mahal"]._id }, { $set: { "car.occupied": cnt.car, "two_wheeler.occupied": cnt.two_wheeler, "bus.occupied": cnt.bus } });
  }
  // ---- Parking extras: EV and accessible bays, lost-ticket charge, GST, monthly passes (demo values) ----
  for (const slug of ["taj-mahal", "agra-fort"]) await M.ParkingLot.updateOne({ _id: lots[slug]._id }, { $set: {
    ev: { capacity: 6, freeMinutes: 15, firstHourMinor: 5000, extraHourMinor: 3000, dailyMaxMinor: 20000, occupied: 0 },
    accessible: { capacity: 8, freeMinutes: 30, firstHourMinor: 0, extraHourMinor: 0, dailyMaxMinor: 0, occupied: 0 },
    lostTicketFeeMinor: 10000, gstPct: 18, monthlyPass: { car: 150000, two_wheeler: 40000, bus: 0, maxPerType: 40 } } });
  // ---- Peak pricing demo rule (weekends +20%), roster for this week, lost and found, incident escalation contacts ----
  await M.PricingRule.create({ operator: opN._id, destination: bySlug("taj-mahal")._id, name: "Weekend peak (demo, switched off)", adjustPct: 20, daysOfWeek: [0, 6], active: false });
  await M.Operator.updateOne({ _id: opN._id }, { escalation: { enabled: true, firstAfterMin: 10, secondAfterMin: 25, phones: ["9000000002"] } });
  for (let i = 0; i < 7; i++) {
    const date = addDays(todayIST(), i);
    await M.RosterShift.create({ operator: opN._id, destination: dests[0]._id, user: staff1._id, userName: staff1.name, date, start: "08:00", end: "14:00", position: "gate" });
    await M.RosterShift.create({ operator: opN._id, destination: dests[0]._id, user: staff2._id, userName: staff2.name, date, start: "14:00", end: "20:00", position: "counter" });
  }
  await M.LostFoundItem.create({ reference: "LF-DEMO0001", destination: dests[0]._id, operator: opN._id, kind: "found", category: "bag", color: "blue", description: "Blue backpack with a steel water bottle", location: "Near the east gate", loggedBy: staff1._id, loggedByName: staff1.name, history: [{ event: "logged", by: staff1.name }] });
  await M.LostFoundItem.create({ reference: "LF-DEMO0002", destination: dests[0]._id, operator: opN._id, kind: "lost", category: "bag", color: "blue", description: "Lost a blue backpack, has a water bottle inside", contactName: "Anita Verma", contactPhone: "9812345678", loggedBy: staff2._id, loggedByName: staff2.name, history: [{ event: "logged", by: staff2.name }] });
  // ---- Season passes ----
  const mkPass = (op: any, name: string, description: string, slugs: string[], days: number, rupees: number, perDay = 1) => M.PassType.create({ operator: op._id, name, description, destinations: slugs.map((s) => bySlug(s)._id), validityDays: days, priceMinor: rupees * 100, maxEntriesPerDay: perDay });
  const passAgra: any = await mkPass(opN, "Agra Heritage Pass (3 days)", "Taj Mahal and Agra Fort, one entry per site per day.", ["taj-mahal", "agra-fort"], 3, 399);
  await mkPass(opN, "Delhi Monuments Pass (30 days)", "Red Fort, Qutub Minar and the National Museum for a month.", ["red-fort", "qutub-minar", "national-museum-delhi"], 30, 499);
  await mkPass(opJ, "Amber Fort Annual Pass", "Unlimited visits for a year (one entry per day).", ["amber-fort"], 365, 999);
  await mkPass(opK, "Hampi Explorer Pass (7 days)", "Vittala Temple for a week, two entries a day.", ["vittala-temple-hampi"], 7, 299, 2);

  lap('destinations created');
  // 90 days of SIMULATED hourly observations (model × noise).
  const today = todayIST(), rand = rng(42);
  const obs: any[] = [];
  for (const d of dests) for (let i = 90; i >= 1; i--) {
    const date = addDays(today, -i);
    const tpl = slotTemplate(d, date); if (!tpl.length) continue;
    const preds = predictDay(d, date, tpl.map((t) => ({ _id: null, ...t, capacity: d.defaultSlotCapacity, booked: 0, closed: false })), 1, true);
    const byHour = new Map<number, number>(); // slots shorter than an hour share an hour bucket
    for (const p of preds) { const h = Math.floor(toMin(p.start) / 60); byHour.set(h, (byHour.get(h) || 0) + Math.round(p.baseline * (0.8 + rand() * 0.4))); }
    for (const [hour, visitors] of byHour) obs.push({ destination: d._id, date, hour, visitors, source: "simulated" });
  }
  await M.CrowdObservation.insertMany(obs); lap('observations inserted');

  // Demo bookings: today + next 2 days at the Taj, Agra Fort, Red Fort, Amber Fort.
  let made = 0;
  for (const d of dests.slice(0, 4)) {
    const cats: any[] = await M.TicketCategory.find({ destination: d._id }).lean();
    for (const date of [today, addDays(today, 1), addDays(today, 2)]) {
      const slots = await ensureSlots(d, date);
      for (const s of slots.slice(1, 8)) {
        if (!s._id) continue;
        const qty = 1 + Math.floor(rand() * 4);
        try {
          const b = await createBooking(tourist, {
            destinationId: String(d._id), slotId: s._id, items: [{ categoryId: String(cats[0]._id), quantity: qty }],
            visitors: Array.from({ length: qty }, (_, i) => ({ name: `Guest ${i + 1}`, age: 30 })),
            contact: { name: tourist.name, email: tourist.email, phone: "9876543210" },
          }, { allowPast: true });
          await payBooking(tourist, { bookingId: String(b._id), method: "upi", idempotencyKey: `seed-${b._id}` });
          made++;
        } catch { /* closed day etc. */ }
      }
    }
  }
  lap('demo bookings done');
  const demoPass: any = await purchasePass(tourist, { passTypeId: String(passAgra._id), holderName: tourist.name, idempotencyKey: "seed-pass-0001" });
  await M.Device.create({ name: "Gate A turnstile (in)", destination: bySlug("taj-mahal")._id, operator: opN._id, kind: "turnstile", direction: "in", mode: "one", keyHash: hashKey("hhd_demo_taj_gate_a_key"), keyHint: "_key" });
  // Demo content for the newer dashboards: a notice for visitors and staff, and one pre-booked parking space with a prepaid first hour.
  await M.Announcement.create({ operator: opN._id, destinations: [bySlug("taj-mahal")._id], title: "Demo notice: live crowd and parking pre-booking are switched on", body: "Visitors can check how busy the site is right now and reserve a parking space from their dashboard.", severity: "info", audience: "all" });
  try { await reserveParking(tourist, { destinationId: String(bySlug("taj-mahal")._id), date: addDays(today, 1), vehicleType: "car", vehicleNumber: "UP80AB1234", arrivalFrom: "09:30", paymentMode: "prepay", method: "upi", idempotencyKey: "seed-parking-0001" }); } catch (e: any) { console.warn("seed: demo parking reservation skipped:", e.message); }
  const catAdult: any = await M.TicketCategory.findOne({ destination: bySlug("amber-fort")._id }).lean();
  await M.GroupRequest.create({ user: tourist._id, destination: bySlug("amber-fort")._id, organisation: "Sunrise Public School", orgType: "school", size: 42, category: catAdult._id, date: addDays(today, 12), preferredStart: "10:00", notes: "Class 8 heritage trip, 40 students and 2 teachers.", contact: { name: tourist.name, email: tourist.email, phone: "9876543210" } });
  const gReq: any = await M.GroupRequest.create({ user: tourist._id, destination: bySlug("taj-mahal")._id, organisation: "Bright Futures Academy", orgType: "school", size: 30, category: (await M.TicketCategory.findOne({ destination: bySlug("taj-mahal")._id }).lean() as any)._id, date: addDays(today, 9), preferredStart: "09:00", contact: { name: tourist.name, email: tourist.email, phone: "9876543210" } });
  await approveGroup({ _id: new mongoose.Types.ObjectId(), role: "admin" }, gReq.toObject(), { discountPct: 50, holdHours: 48, note: "School concession applied." });
  // 14 days of backdated history at the first four sites, inserted in bulk (fast): mostly completed visits, a few cancellations.
  const { makeRef } = await import("../src/lib/booking");
  const { priceItems } = await import("../src/lib/pricing");
  const { financialYear, formatInvoiceNo } = await import("../src/lib/invoice");
  const fyKey = `invoice:${financialYear(today)}`;
  let seq = ((await M.Counter.findOne({ key: fyKey }).lean()) as any)?.seq || 0;
  const bookingsBulk: any[] = [], paymentsBulk: any[] = [], slotDocs: any[] = [];
  for (const d of dests.slice(0, 4)) {
    const cats: any[] = await M.TicketCategory.find({ destination: d._id }).lean();
    for (let back = 14; back >= 1; back--) {
      const date = addDays(today, -back);
      const tpl = slotTemplate(d, date); if (tpl.length < 3) continue;
      const slots = tpl.map((t) => ({ _id: new mongoose.Types.ObjectId(), destination: d._id, date, start: t.start, end: t.end, capacity: d.defaultSlotCapacity, booked: 0, closed: false }));
      slotDocs.push(...slots);
      const n = 6 + Math.floor(rand() * 10) + (back % 7 === 0 || back % 7 === 6 ? 5 : 0);
      for (let k = 0; k < n; k++) {
        const sl = slots[1 + Math.floor(rand() * (slots.length - 2))]; if (!sl._id) continue;
        const qty = 1 + Math.floor(rand() * 5), cat = cats[rand() < 0.25 ? 1 : 0], ref = makeRef();
        const items = [{ category: cat._id, name: cat.name, audience: cat.audience, unitPriceMinor: cat.priceMinor, unitFeeMinor: cat.feeMinor || 0, quantity: qty }];
        const pr = priceItems(items); const r = rand();
        const created = new Date(`${addDays(date, -1 - Math.floor(rand() * 3))}T${String(8 + Math.floor(rand() * 12)).padStart(2, "0")}:15:00+05:30`);
        const cancelled = r < 0.08, completed = !cancelled && r < 0.88;
        seq++; const bid = new mongoose.Types.ObjectId();
        bookingsBulk.push({ _id: bid, reference: ref, idemKey: `ref:${ref}`, user: tourist._id, destination: d._id, slot: sl._id, date, start: sl.start, end: sl.end, items, quantity: qty, ...pr,
          status: cancelled ? "cancelled" : completed ? "completed" : "confirmed", paymentStatus: cancelled ? "refunded" : "paid", refundMinor: cancelled ? pr.totalMinor : 0, cancelledAt: cancelled ? created : undefined, cancelReason: cancelled ? "Seed cancellation" : undefined,
          visitors: Array.from({ length: qty }, (_, i) => ({ name: `Guest ${i + 1}` })), contact: { name: tourist.name, email: tourist.email, phone: "9876543210" },
          checkedInCount: completed ? qty : 0, checkedOutCount: completed ? qty : 0, checkedInAt: completed ? new Date(`${date}T${sl.start}:00+05:30`) : undefined, checkedOutAt: completed ? new Date(`${date}T${sl.end}:00+05:30`) : undefined,
          invoiceNo: formatInvoiceNo(financialYear(today), seq), invoiceAt: created, history: [{ at: created, event: "confirmed", by: "seed", note: "Seeded history" }], createdAt: created, updatedAt: created });
        paymentsBulk.push({ booking: bid, user: tourist._id, provider: "simulated", type: "charge", amountMinor: pr.totalMinor, status: "succeeded", method: "upi", providerRef: `SIM_${ref}`, idempotencyKey: `seed-h-${ref}`, createdAt: created, updatedAt: created });
        if (cancelled) paymentsBulk.push({ booking: bid, user: tourist._id, provider: "simulated", type: "refund", amountMinor: pr.totalMinor, status: "succeeded", method: "upi", providerRef: `SIMREF_${ref}`, idempotencyKey: `refund:${bid}`, createdAt: created, updatedAt: created });
        else sl.booked += qty;
      }
    }
  }
  lap('history generated'); await M.Booking.insertMany(bookingsBulk); lap('bookings inserted'); await M.Payment.insertMany(paymentsBulk);
  await M.TimeSlot.insertMany(slotDocs);
  await M.Counter.updateOne({ key: fyKey }, { $set: { seq } }, { upsert: true });
  const hist = bookingsBulk.length;
  console.log(`Seeded ${dests.length} destinations, ${obs.length} simulated observations, ${made} upcoming and ${hist} historical demo bookings.`);
  console.log("More logins → operator1@heritagehub.test (Heritage Circle North), operator2@ (Jaipur Fort Trust), operator3@ (Karnataka) all / Operator@123");
  console.log("Second staff login for handover demos → staff2@heritagehub.test / Staff@123. Plate camera: register a \"Number-plate camera\" device in Admin → Devices.");
  console.log("Demo gate device key (Taj Mahal turnstile): hhd_demo_taj_gate_a_key   ← DEMO ONLY, never use on a real system");
  console.log("Logins → admin@heritagehub.test / Admin@123 | staff@heritagehub.test / Staff@123 | tourist@heritagehub.test / Tourist@123");
  await mongoose.disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
