# HeritageHub: smart heritage-site ticketing and crowd management

A full-stack Next.js 14 (App Router, TypeScript) application: public tourism site, timed-slot ticket booking with QR tickets, a transparent crowd-prediction model, a staff entry/exit console, and an administrator dashboard. Everything (APIs, auth, business logic) lives inside Next.js. There is no separate backend. Design and brand are original.

> **Data notice.** Ticket prices, ratings, crowd history, and demo bookings are **sample/demonstration data** and are labelled as such in the UI. Historical visitor counts are **simulated**. Payments are **simulated** (no real money, no card data collected). No live sensors are connected. Verify prices, hours and rules with the managing authority (e.g. ASI) before using this for anything real. Seed photos load from Wikimedia Commons; if a file name changes, the UI falls back to a typographic placeholder, and you can replace URLs in the admin panel.

## What's in the box
| Area | Highlights |
|---|---|
| **Visitors** | Timed tickets with QR, crowd forecasts and week heatmap, day planner with travel estimates, season passes, group and school requests, parking availability, Hindi/English, calendar export |
| **Operators** (multi-tenant) | Several organisations on one platform; each manager sees only their own sites, staff, passes, groups, devices, reports and settlements |
| **Gate** | Counter sales, offline-tolerant scanning, group entry in parts, season-pass scanning, parking console, gate-hardware API (turnstiles, QR readers, ESC/POS receipt printers) |
| **Back office** | Capacity and closures, invoices, settlements with commission, CSV exports, audit log, device registry |
| **Mobile** | Native Expo (React Native) app in `mobile/` for visitors (browse, book, QR tickets and passes) and staff (camera scanning) |

## Security, privacy, reconciliation, support targets, Hindi and e-invoicing (latest revision)

**Two-step sign-in and password reset.**
* **Password reset by email**: `/forgot-password` sends a one-time link (60 minutes, works once, only its hash is stored). The page and API answer identically for known and unknown emails. Resetting or changing a password ends every older session (`sessionVersion`), including mobile tokens.
* **Two-step sign-in (authenticator app, TOTP)** with 10 single-use recovery codes, set up at `/account/security`. Secrets are encrypted at rest (AES-256-GCM; key from `TWOFA_KEY`, else `AUTH_SECRET`), each code works once, wrong codes are limited per account. Web login returns only a short-lived challenge until the second step passes; the mobile token endpoint takes an optional `code`.
* **Required for `admin` and `operator` accounts in production** (set `REQUIRE_MANAGER_2FA=true/false` to override; off by default outside production so demos and tests run). Until a manager enrols, every manager API answers 403 and the admin pages send them to `/account/security`. A required manager can't turn it off. A *different* platform admin can reset a lost device from the Users page (`resetTwoFactor`), and `scripts/reset-2fa.ts <email>` is the break-glass when nobody else can. **Before turning it on in production: enrol your own admin first and store the recovery codes.**
* The e2e suite (`npm run test:e2e`) signs in as managers, so run it against a server started with `REQUIRE_MANAGER_2FA=false`. `scripts/live-check.ts` covers the two-step flows with it on.

**Privacy requests (DPDP).** Visitors open **Your data** (`/dashboard/privacy`): *download* everything linked to the account as JSON (`GET /api/me/data`; never passwords or secrets), or *erase* the account (`POST /api/me/erase`, password + typing ERASE). Erasure anonymises name, email, phone, saved vehicles and companions, booking contacts and visitor names, vehicle numbers and driver details on linked parking records, review text, support messages and transfer details, deletes loyalty points and waitlist/notifications, and closes the account. It **keeps** amounts, GST, invoice and credit-note numbers and settlement rows (accounting retention). It refuses while a visit is still ahead, a pass or parking pass is valid, a vehicle is parked or a transfer/group booking is pending. `PrivacyRequest` records the outcome with a hashed id and counts only. **Not covered:** lost-and-found entries and incident reports written by staff (they name no account; remove them case by case), backups (see `scripts/backup.sh`; decide your backup retention), and the GST details of a business buyer, which stay on its tax invoice. Have your lawyer confirm retention periods and the wording of your privacy notice and grievance contact.

**UPI reconciliation** (`/admin/reconcile`). Upload a net-banking CSV (HDFC/SBI/ICICI/Axis-style: Date + Narration + Deposit, or Amount + Dr/Cr). It is compared with every UPI payment staff recorded for the range (counter sales, parking exit, counter parking prepayment, staff-sold parking passes). Matching, strongest first: the UPI reference staff typed, the ticket reference carried in the QR's note, then same amount on the same day or the next (shown as *weak*: it can't tell which of two equal payments is the missing one, so read the per-staff summary). Results: matched, amount differs, **recorded but not on the statement**, and bank credits nobody recorded. Managers can explain each exception with a note, download them as CSV and delete a run (statement narrations contain payer names). Counter UPI refunds aren't netted. Still manual: re-run after a payment posts late.

**Support reply targets.** A ticket is *waiting on us* when it is open/in progress and the visitor spoke last. Targets per operator (default 24 h for the first reply, 48 h after; wall-clock hours): overdue tickets are flagged in the inbox, the Support page shows waiting/overdue/median first reply/% in time, `GET /api/admin/support-sla` returns it (`format=csv` per ticket), and `GET /api/cron/support-sla` (daily, `CRON_SECRET`) emails each operator's managers the late tickets once a day.

**Hindi for staff screens.** Counter, parking, shift and cash, handover, roster, lookup, incidents, lost and found and payment collection now switch with the language toggle (`src/lib/i18n-staff.ts`, keyed by the English text; a missing entry shows English). **Not translated:** admin screens other than the navigation, text that mixes words with live values (for example "Total ₹500"), and server error messages. Wording is plain spoken Hindi but **needs review by a native speaker on your team**.

**E-invoicing (IRN).** Buyers can tick *I need a GST invoice* at checkout (GSTIN with checksum check, name, address, city, PIN); it must be given before payment because the invoice number is issued then. `/admin/einvoice` (platform admin) lists these invoices and credit notes, builds the government's INV-01 v1.1 JSON (CGST+SGST within a state, IGST across states; credit notes reference the original invoice), downloads a batch for upload to the Invoice Registration Portal or your GSP, and records the IRN, ack number and date you get back (shown with a QR on the invoice if you paste the signed QR). **This does not call the portal.** Whether you must do this at all depends on your turnover and your accountant, and the schema fields should be validated in the portal's sandbox before relying on them. Set `PLATFORM_GSTIN`, `PLATFORM_LEGAL_NAME`, `PLATFORM_ADDRESS`, `PLATFORM_LOC`, `PLATFORM_PIN`, `PLATFORM_SAC`; `EINVOICE_ENABLED=true` only shows the page as switched on.

## Multi-operator platform
* An **Operator** owns destinations (`Destination.operator`). Users with role `operator` are managers of exactly that operator; `staff` belong to an operator and are assigned sites. Platform `admin` sees everything and onboards operators at `/admin/operators` (name, GSTIN, platform commission %, first manager).
* **Isolation is enforced on the server.** `currentUser()` resolves an operator manager's allowed destination ids on every request and every admin route checks them: destinations, slots, bookings (read and cancel), reports, settlements, users (managers can only create/modify *staff* of their own operator and assign only their own sites), passes, parking, groups, devices, audit log. The e2e suite has ~35 checks probing cross-operator access (all must return 403/404 or empty results).
* **Settlements** apply each operator's commission to net online ticket value and show operator share, commission, payout, net platform fee, net GST, counter takings, parking collected at the gate, and pass sales.

## Parking
Per-destination lots with capacity and rates for cars, two-wheelers and buses/coaches (free minutes, first hour, each extra started hour, optional daily cap). Staff admit vehicles (`/staff/parking`, `POST /api/parking/entry`) and check them out (`/exit`), with the fee computed **from the time parked at the moment of exit** and the payment method recorded. Capacity is claimed with the same atomic conditional-update pattern as slots; a vehicle number can only be parked once per site. Visitors see free spaces on each destination page (`GET /api/parking`, from staff-recorded movements, not sensors). Admin configuration at `/admin/parking` (capacity can't go below vehicles parked now).

## Live crowd, parking pre-booking and gate payments (latest revision)

**Live crowd.** `GET /api/crowd/live` (and the `LivePanel` / `LiveStrip` components) show how busy a site is *right now*, from the entries and exits gate staff record (tickets and season passes), refreshed every 15 s: percentage, level, trend over the last 15 minutes, estimated queue, free parking. Public callers get percentages only; headcounts need a signed-in staff or manager (`?detail=1`). It is **not** a camera or sensor count. When a site has had no gate activity for 45 minutes it says "gates quiet" and shows the forecast instead of presenting an empty reading as fact. Shown on the destination page, the crowd-status page, the visitor dashboard, the staff Today page and the operator's crowd and live-command pages.

**Visitor dashboard.** Book parking (`/dashboard/parking`), a personalised alert feed (live gate conditions for today's visit, paused entry, parking reminders, site notices), Today's-visit card, saved vehicles and travel companions (profile), payments and receipts, Heritage passport (stamps and badges computed from completed visits), my reviews.

**Parking pre-booking.** Visitors reserve a space for a date (up to 30 days ahead); optionally prepay the first-hour rate, which is credited at exit. Operators set the share of each vehicle type that can be pre-booked (default 30 %, Admin > Parking). A per-day atomic counter enforces the quota. Spaces for pre-booked vehicles that have not arrived are held back from walk-ins. Staff admit a pre-booked vehicle by code or it is recognised by vehicle number. Cancelling is free until 2 hours before arrival (staff cancellations always refund); no-shows forfeit a prepayment.

**Taking payment at the gate (parking exit and counter sales).** One shared component handles all three methods:
* **Cash**: amount to collect, optional cash received, change to return.
* **UPI**: a QR containing the **exact amount** (UPI deep link, ticket number as reference). At parking exit the amount is fixed by a signed 5-minute quote, so what the visitor paid is what is recorded; it refreshes itself afterwards and the server refuses a stale amount. The payee is the operator's UPI ID (Admin > Parking > Payments); with none set, a clearly marked demo QR is shown.
* **Card**: staff charge on their own POS terminal and record network, credit/debit, last 4 digits and approval code (RRN optional). Full card numbers, expiry and CVV are never requested or stored.

> **Limits.** The app *records* gate payments; it does not process them. It cannot see your bank, so staff must confirm a UPI payment arrived (SMS, soundbox or app) before tapping "received". Parking *prepayment* by visitors uses the simulated gateway in this version (it records the payment but charges no real card or UPI account); wire it to Razorpay the way ticket checkout is wired before taking real money.

**Counter sales with parking.** The counter asks whether the visitor needs parking; if yes it collects vehicle type and number, driver name and mobile, an optional pre-booking code and an optional first-hour prepayment, then issues tickets and the parking ticket together. Card details, cash tender, parking availability and the vehicle number are validated before any seat is held; a retried sale returns the same parking ticket. If the vehicle cannot be admitted after the tickets are sold, the tickets stand and the receipt says why.

**Staff.** Pause or resume entry (gate scans of tickets and passes are refused with the reason; exits are never blocked; queued offline scans still sync), shift and cash count with variance, visitor lookup (reference, name, phone, vehicle, ticket, reservation code), structured incident reports (medical, lost child, security, crowd, maintenance), manager notices, overstay flags, driver details and printable parking tickets and receipts.

**Operator.** Live command centre (`/admin/live`), parking tabs (setup and rates, reservations, analytics, UPI payee), incidents workflow (acknowledge, resolve with a note), announcements for visitors and/or staff, staff activity and cash-count differences, gate-device explainer, test console and decision log.

**What is a gate device (turnstile)?** The physical gate at an entrance (a turnstile or barrier with a QR reader). It sends each scanned code to `POST /api/device/scan` and opens only if the answer is `allow`. It is optional: without hardware, staff scan with a phone on `/staff/scan`. `/admin/devices` explains this in plain language and has a test console that runs a scan through the same decision logic.

## Season passes
Operators define passes (sites covered, validity days, price, entries per site per day). Visitors buy at `/passes` (simulated gateway; idempotent per key; invoice issued) and get a QR in **My passes**. At the gate (web scanner, mobile app, or a device) a pass is checked for status, dates, covered site, "already inside" and the daily limit, using guarded atomic updates. Pass holders count toward live occupancy but not slot capacity. Passes can't be scanned offline (they need the server) and have no refund flow yet.

## Group and school bookings
`/groups` request form (10+ people, 3 days' notice) → site managers review `/admin/groups` → approve with a slot (or best fit near the preferred time), a concession % and a hold period (default 48 h) → the requester gets an email and pays once at checkout. One booking covers the whole group, bypasses the online ticket cap, and staff can admit the group **in parts**. Unpaid holds expire and release seats; requests track their booking (`awaiting_payment`, `paid`, `expired`).

## Gate hardware integration
Register devices at `/admin/devices` (turnstile, scanner, kiosk, printer; entry or exit; one person per scan or the whole booking). Each device gets a secret key **shown once** (only its SHA-256 hash is stored), can act only on its own site, and is rate limited.

| Call | Purpose |
|---|---|
| `POST /api/device/scan` `{code}` | Admit/deny. Always HTTP 200 with `{allow, relay: "open"\|"hold", message (≤24 chars), reason, occupancy}`; 401 bad key, 429 rate limit. Works for booking QRs and season passes. |
| `POST /api/device/heartbeat` | Marks the device online (admin shows Online if seen within 2 min) and returns live occupancy for a display. |
| `GET /api/device/receipt/<ref>?format=text\|escpos` | 42-column text or base64 ESC/POS bytes (init, centred header, partial cut) for 80 mm thermal printers. |

Try it without hardware: `DEVICE_KEY=hhd_demo_taj_gate_a_key npx tsx scripts/gate-sim.ts <qr-text>`. **Scope:** this is an HTTPS protocol integration. Wiegand/serial/relay wiring needs a controller that speaks HTTP (e.g. a small embedded gateway); no real hardware was available to test.

## Mobile app (`mobile/`)
Expo SDK 52 / React Native. Visitors: sign in, browse with crowd ribbons and illustrated cards, pick day/slot/tickets, pay (test mode), and show **native QR codes** for tickets and passes. Staff: camera QR scanner with verify, check-in and check-out (bookings and passes). Auth uses a bearer token from `POST /api/auth/token` (the same signed token works on all API routes) stored in the secure keystore.
```bash
cd mobile && npm install
EXPO_PUBLIC_API_URL=https://your-domain npx expo start      # Android emulator host: http://10.0.2.2:3000
```
**Verified:** strict TypeScript, and a full Metro/Hermes bundle for Android (`npx expo export --platform android`). **Not verified:** running on a device or emulator, camera scanning, iOS. The mobile app is online-only (no offline queue).

## Design system
Original identity: warm ivory, deep green and terracotta; Fraunces (display) + Figtree (body) + Noto Sans Devanagari, all **self-hosted from npm** (no Google Fonts request). Every destination has an **illustrated heritage scene** (`src/components/art.tsx`: domed tomb, fort, temple tiers, minar, museum, palace; five palettes) shown whenever there is no photo, with real photos fading in on top when they load. Other signature elements: the colour-coded crowd ribbon, arch-framed hero, jali pattern, ticket-stub cards with perforation, scroll reveal, and shimmer skeletons (all motion respects `prefers-reduced-motion`). Layouts differ by role (visitor, staff, operator/admin). Pages were reviewed in a real headless browser at desktop and phone widths.

## Operator tools (counter, invoices, settlements, offline scanning)
* **Counter sales** (`/staff/counter`, `POST /api/counter/sales`): staff sell walk-in tickets at the gate. They use the **same atomic capacity engine** as online bookings, so walk-ins and online buyers can never overfill a slot. No online convenience fee applies, payment method (cash/UPI/card) is recorded, an invoice number is issued, visitors can be checked in immediately for the current slot, and a printable receipt plus a cash-drawer summary (`/api/counter/summary`) are provided. Sales are idempotent (double-tap safe). Counter sales are not limited by the online "max tickets per booking" rule (up to 100 per sale). **The app records counter payments; it does not process them.** Cash/UPI/card are taken on the operator's own device.
* **Invoices** (`/invoice/[bookingId]`): every confirmed booking gets a number `HH/<financial-year>/<6-digit sequence>` allocated atomically, once, at confirmation. Online invoices itemise ticket value (shown as collected on behalf of the managing authority), the convenience fee, and 18% GST on the fee; counter invoices are receipts without a fee. Seller details come from `PLATFORM_LEGAL_NAME`, `PLATFORM_GSTIN`, `PLATFORM_ADDRESS`, `PLATFORM_SAC`. **Limits:** a crash between allocating and saving a number could leave a gap, and the tax treatment is a prototype assumption. Have an accountant review all of it.
* **Settlements and GST** (`/admin/settlements`, `GET /api/admin/settlements`, CSV export): per destination for a date range (by payment date, IST): online ticket value, refunds, **net payable to the operator**, net platform fee, net GST on fees, and counter takings split by cash and UPI/card. A full refund returns ticket value, fee and GST; a late partial refund returns ticket value only. Gateway refunds that failed are flagged for manual action. It reports amounts; it does not execute payouts.
* **Offline-tolerant scanning** (`/staff/scan`): the page downloads today's bookings for your sites (`GET /api/entries/manifest`) and refreshes every 5 minutes. If the network drops, scans are checked against that saved list **by reference** and queued on the device with their timestamp; when the connection returns they sync automatically (`POST /api/entries/sync`). The server re-validates every queued scan, **including the QR signature**, against the time it was recorded, and reports failures for staff to review. Partial entries/exits work offline too. **Limits:** the signature can't be checked offline (so a forged code with a valid reference would pass until sync), the page must stay open (no service worker, so a reload while offline won't load), and the queue lives in browser storage on that one device.

## Integrations (all optional; each falls back to a working dev mode)
| Feature | Enable with | Fallback |
|---|---|---|
| **Email** (booking confirmation with QR attachment, cancellation, waitlist) | `RESEND_API_KEY`, `EMAIL_FROM` | Logged to the server console |
| **SMS** (same events, short text) | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM` | Logged to the console |
| **Razorpay payments** | `PAYMENT_PROVIDER=razorpay`, `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` | Simulated gateway |
| **Cloud image storage** (Vercel Blob, up to 4 MB) | `BLOB_READ_WRITE_TOKEN` | Inline data URI, max 600 KB |
| **Waitlist** | always on | n/a |
| **Hindi / English** | language button in the header | English |

**Razorpay flow.** `POST /api/payments` creates an order server-side and returns it; the browser opens Razorpay Checkout; the callback goes to `POST /api/payments/verify`, where the HMAC-SHA256 signature is checked with the key secret before the booking is confirmed. A webhook at `/api/payments/webhook` (events `payment.captured` / `order.paid`, signature-verified) confirms bookings for users who close the tab after paying. Both paths use the same atomic `pending → confirmed` transition, so a client/webhook race can't double-confirm. If money is captured after the seat hold has expired, the payment is **refunded automatically**. Cancellations call Razorpay's refund API; if that call fails the refund record is marked `failed` and logged so it can be refunded manually from the Razorpay dashboard. Use Razorpay *test* keys first.

**Waitlist.** When a slot is full, "Notify me" joins a first-come queue (per slot and ticket count). Whenever seats come back (cancellation, expired hold, capacity increase, reopened slot) the oldest entries that fit are notified by email/SMS. Notification does not hold seats: whoever books first gets them. Entries show on the tourist dashboard.

**Hindi.** UI chrome and the main booking flow (navigation, landing headings, search, slot/ticket labels, crowd levels, checkout buttons) are translated via `src/lib/i18n.tsx`. The remaining pages (admin, staff, long destination text, validation messages) stay in English; add keys to the dictionary to extend. The Hindi strings were written without a native-speaker review, so please have one checked before launch.

## Added in the previous revision
Next.js 14, React 18, TypeScript, Tailwind CSS with shadcn/ui-style components (`src/components/ui.tsx`), MongoDB Atlas + Mongoose, signed-cookie session auth (`jose` JWT, `bcryptjs`), Zod validation, Recharts, Leaflet + OpenStreetMap, `qrcode`, `sonner` toasts.

## Added in this revision (24 features)

Every item below was a gap in the previous release. Each has server logic, screens, tests and (where relevant) a CSV export. What is **not** verified is listed at the end of "Verification status".

### Parking
| Feature | Where | How it works |
|---|---|---|
| **Lost-ticket handling** | Staff → Parking → Check out ("driver has lost the ticket") | Staff find the car by vehicle number, must tick that ID/RC papers were checked and note what they saw. The lot's **lost-ticket charge** (Admin → Parking → Setup) is added to the normal fee, shown separately, signed into the exit quote, invoiced, and listed in the "Lost tickets" CSV. Waived for monthly-pass holders. |
| **Monthly parking passes** | Staff → Parking ("Monthly passes"), visitors at My parking, Admin → Parking → Monthly passes | 30-day pass per vehicle type with a price per type and an optional cap. A vehicle with a live pass is recognised at entry, parks free, and the pass counts visits. Renewal opens in the last 7 days and continues from the end date. Passes have an invoice, are idempotent per key, and staff cash from pass sales is included in the cash count. Managers cancel a pass with a refund choice (none, the unused days, or the full price for a pass nobody has used); a credit note is issued and the holder is told. Holders get an expiry reminder a week before their pass ends. |
| **EV and accessible bays** | Setup tab, staff entry, counter sale, visitor pre-booking | Two extra **pools** of car spaces with their own capacity, rates and pre-booking quota; they do not draw on the normal car pool. Accessible bays require staff to confirm the badge was checked. |
| **Number-plate camera reading** | Admin → Devices ("Number-plate camera"), Staff → Parking ("Plate camera") | Gate cameras `POST /api/device/plate` with an `X-Device-Key`. Plates are normalised (look-alike OCR errors repaired for standard Indian plates), matched against passes, today's reservations and parked vehicles, logged, and shown to staff as a one-tap **suggestion**. Staff can also photograph a plate: that needs `ANPR_API_KEY` (Plate Recognizer-compatible); with none set the console says so and staff type the number. Nothing is admitted or charged automatically. |
| **GST and invoices on parking** | Setup tab; `/invoice/parking/<ticket or pass code>` | Rates are entered **GST-inclusive**; the invoice splits out the GST at the lot's rate (0 = no GST lines). Sequential numbers in the `HP/<FY>/nnnnnn` series, for stays with a charge, lost-ticket charges and passes. Operator legal name and GSTIN are used as the seller. Treat as a prototype document until an accountant confirms SAC, rates and place-of-supply rules. |
| **Per-date capacity overrides** | Admin → Parking → Special days | Set a pool's capacity for one date (overflow field open, part closed, 0 = closed). Applies to walk-in admission, availability and pre-booking quota. Cannot go below vehicles parked now (today) or spaces already pre-booked (future). |

### Staff
| Feature | Where | How it works |
|---|---|---|
| **Counter refunds and cancellations** | Staff → Counter → "Cancel and refund" | Walk-in sales made **today** are refunded in full by staff, in cash/UPI/card, and the refund lands in **that staff member's** cash count. Older walk-in sales and policy overrides need a manager. Online/group bookings follow the site's cancellation policy and are refunded to the original method. Used tickets cannot be refunded. Always audited. |
| **Reprint from lookup** | Staff → Lookup (bookings, parking tickets, reservations, passes) | Prints a clearly marked **DUPLICATE** (copy number, who printed, when); the count is stored and the action audited. |
| **Shift handover** | Staff → Shift handover | Outgoing staff count the drawer (this records their cash count), pick a colleague and leave notes; open incidents, parked vehicles, visitors inside and the entry-pause status are attached. The colleague counts again and accepts; the accepted float becomes their opening balance. Mismatches on either side need a note and appear in the handover CSV. |
| **Lost and found** | Staff → Lost and found, Admin → Lost and found | Log found items and visitor lost reports (name and phone required). Likely matches are suggested by category, colour and words. Returns record who collected it and the **last 4** characters of the ID checked (never the full number). |
| **Offline mode for parking and counter** | Staff → Parking, Staff → Counter | A service worker lets both pages reopen without a connection once they've been opened online; the last rates, sites and slots are cached on the device. Entries, exits and **counter sales** are saved in order and uploaded automatically, with the real entry/exit **time** preserved (fees are priced at the real exit time). Anything the server refuses on upload is kept as a visible **conflict**. See limits below. |

### Operator
| Feature | Where | How it works |
|---|---|---|
| **Staff rosters** | Admin → Roster, Staff → Roster | Weekly grid per site, repeat for up to 14 days, hours per person, overlap detection (nobody can be at two sites at once, 12 h maximum shift). Staff see their shifts and who else is on today. Rostering does not restrict who can log in. |
| **Dynamic / peak pricing** | Admin → Peak pricing | Rules by weekday, date window, slot time, **demand** (slot at least N% full) and ticket type, ±. Matching rules add up, capped at −50%…+100%, rounded to whole rupees. Applied by the booking engine for online, group and counter sales; shown to visitors as "Peak/Off-peak". The booking stores the base price and adjustment. Existing bookings keep their price. A preview calculator is on the page. The demo seed includes one rule, switched **off**. |
| **CSV export for the new reports** | Links on each page; `/api/admin/export?report=shifts\|handovers\|lost-found\|roster\|support\|pricing`, `...?format=csv` on staff activity, incidents and the parking report (`kind=daily\|stays\|hours\|reservations\|passes\|lost`) | Text cells that start with `= + - @` are neutralised so a spreadsheet can't run them as formulas. Empty exports still have a header row. |
| **SMS escalation of unacknowledged incidents** | Admin → Incidents → "SMS escalation" | If an incident stays **open** (not acknowledged) for N minutes (default 10, warnings wait twice as long) managers of that operator get an SMS; after the second time (default 25) platform admins do too. Each level is sent once, even if several requests race. Needs the Twilio settings. Trigger: dashboards while open, plus a scheduler calling `GET /api/cron/escalate` with `Authorization: Bearer $CRON_SECRET` (needed when nobody is logged in). |

### Visitor
| Feature | Where | How it works |
|---|---|---|
| **Ticket transfer** | My tickets → Transfer | Offer to another registered visitor by email, naming each visitor. They have 48 h to accept. On acceptance the booking moves in one conditional update and gets a **new reference**, so the old QR stops working; transferred tickets cannot be cancelled or refunded by the new holder; at most 2 transfers; closes 2 h before the slot; counter and group tickets can't be transferred. |
| **Map directions and weather** | Destination page, and "Weather and directions" on each ticket | Directions to Google/Apple/OpenStreetMap, plus distance from the visitor's location if they allow it (not stored). Weather from Open-Meteo, fetched by the server and cached 15 min (16-day range; the visit-day forecast on tickets). If the forecast service is unreachable the UI says so. |
| **Loyalty points** | My account → Loyalty points; "Use points" when booking | 1 point per ₹10 of ticket value, **earned at first entry** (not at purchase), +25 for the first visit to each site, 1.25× at Silver (500 lifetime points) and 1.5× at Gold (2,000). 1 point = ₹0.50 off a later online booking, up to 20% of its ticket value. Spending is atomic (the balance can't go negative under parallel bookings); points come back if the booking is cancelled or the hold lapses. Points expire after 12 months (`LOYALTY_EXPIRY_MONTHS`, 0 = never) and the oldest are spent first; the account page warns about points expiring within 30 days. Managers can grant or take back points with a reason. Counter sales earn nothing. |
| **Support ticket history** | My account → Support, Admin → Support, Contact page | Threaded tickets with status, staff replies (emailed to the visitor) and a reopen-on-reply rule. Signed-in visitors using the Contact form get a ticket automatically. Staff/managers see tickets for their sites. |

### Follow-up features (second round)
| Feature | Where | How it works |
|---|---|---|
| **Credit notes for refunds** | Booking invoice page, pass invoice page | When a refund is actually paid (online cancellation, counter refund, pass cancellation) one numbered **credit note** (`CN/<FY>/nnnnnn`) is issued against the invoice, with the GST on the convenience fee reversed in proportion to the amount refunded. It is issued once, even if the request is retried. A refund that failed at the gateway gets none. |
| **UPI warning and block** | Admin → Parking → Payments (UPI) | Operators are warned while the site would show the DEMO QR, and can choose to **refuse UPI at the gate until a UPI ID is set**. When on, the server refuses UPI for counter sales, parking exit, entry prepayment and pass sales, withholds the QR, and staff see a message; cash and card still work. Off by default so demos aren't affected. |
| **Hindi for the visitor screens** | Language switch in the header | Loyalty, support, ticket transfer, monthly passes, weather and directions, and the new booking-widget text are translated, with values filled into sentences (`{count}`). A test checks every Hindi string has the same placeholders as its English original. Staff and admin screens, weather descriptions and tips, and emails/SMS remain English, like the rest of the staff and admin app. |
| **Pass refunds and expiry reminders** | Admin → Parking → Monthly passes | See the passes row above. `GET /api/cron/pass-reminders` (Bearer `CRON_SECRET`, once a day) sends the reminders; managers can also press "Send reminders now". Each pass is reminded once, passes already renewed are skipped, and passes with no email or phone are counted but not marked, so adding a contact later still works. Staff can now record a holder email at the gate. |
| **Roster attendance and swaps** | Staff → Roster, Admin → Attendance, Admin → Roster | Staff **clock in and out** (from 30 minutes before a shift; up to 5 minutes late is not late; a clock-in with no rostered shift is allowed but flagged; one never closed is closed automatically after 16 hours and flagged). The attendance report compares rostered and worked hours and shows no-shows, late arrivals, unrostered clock-ins and **counter sales made outside the person's rostered shift** (only for people who have a roster). **Swaps**: staff ask a colleague to cover a shift; the colleague agrees, then a manager approves, and approval re-checks clashes and moves the shift in one conditional update. CSV export. Clocking in is never required to sell. |
| **Loyalty adjustments and expiry** | Admin → Loyalty points | Look a visitor up by email and grant or remove points with a reason (operators only for visitors who booked at their sites; limits per adjustment; audited). Removal can't take the balance below zero. |

### Sign-in and accounts
* **Show/hide password** (eye button) on every password field: login, register, change password, and the admin forms that set staff and manager passwords. It hides again when the field loses focus.
* **Managers and staff can use the visitor features for themselves** (reserve parking, buy a pass as a visitor with the "for myself" flag, loyalty points, book and pay for tickets, transfers, waitlist, season passes, their own support tickets). Their own support tickets are kept apart from the site inbox. Reviews and group bookings stay visitor/admin-only on purpose.

### New configuration
`ANPR_API_KEY` (+ optional `ANPR_API_URL`, `ANPR_REGIONS`), `CRON_SECRET`, `ESCALATE_ADMIN_PHONES` (see `.env.example`). The Permissions-Policy now allows geolocation for the site itself (for "How far am I?"). Demo logins add `staff2@heritagehub.test / Staff@123` for handover demos.

### Limits and design choices worth knowing
* **Offline is not magic.** Offline counter sales are paid and recorded, but the numbered ticket, QR code and invoice only exist after upload; the visitor is admitted by hand against the offline receipt. An offline sale can later be refused (for example the slot filled): it then shows as a conflict for a person to resolve. UPI/card amounts can't be verified offline; staff confirm them. Offline parking fees come from cached rates; when uploaded the server prices the stay at the real exit time and flags any difference to a manager. Entries older than 48 h or timestamped in the future are refused. Data lives in the browser (localStorage) on that device. Plate reading, refunds, passes and handovers need a connection.
* The service worker caches the HTML of the two staff pages and static assets, never API responses, and is cleared on sign-out. On a shared device, sign out.
* Transfers reveal whether an email has an account (needed for the UX); they are rate-limited to 10 an hour per user.
* Pass sale limits and per-date capacity checks are done as read-then-write; the unique keys prevent duplicate passes, but a burst could oversell the **pass cap** by a few. Parking space claims themselves are atomic.
* Expired points are written off when the account is next viewed or spent from, not at the stroke of midnight.
* Weather and directions depend on Open-Meteo and on the visitor's maps app.

## Quick start
```bash
npm install
cp .env.example .env.local       # fill MONGODB_URI, AUTH_SECRET, TICKET_SECRET
npm run seed                      # wipes the DB and loads demo data
npm run dev                       # http://localhost:3000
```
Requires Node 20.6+ (the seed script uses `--env-file`).

Demo logins (after seeding):

| Role | Email | Password |
|---|---|---|
| Administrator | admin@heritagehub.test | Admin@123 |
| Operator manager, Heritage Circle North (5 sites) | operator1@heritagehub.test | Operator@123 |
| Operator manager, Jaipur Fort Trust (Amber Fort) | operator2@heritagehub.test | Operator@123 |
| Operator manager, Karnataka Heritage Board (Hampi) | operator3@heritagehub.test | Operator@123 |
| Site staff (Taj Mahal, Agra Fort) | staff@heritagehub.test | Staff@123 |
| Tourist | tourist@heritagehub.test | Tourist@123 |

Seeding also creates three demo operators, parking lots, four season passes, a demo gate device (key `hhd_demo_taj_gate_a_key`, **demo only**), group requests, and 14 days of backdated bookings so dashboards have data. It creates 7 sites (Taj Mahal, Agra Fort, Red Fort, Amber Fort, Qutub Minar, Vittala Temple Hampi, National Museum Delhi), ticket categories, 90 days of simulated hourly history, and confirmed demo bookings for today and the next two days at the first four sites. Run `npm run seed` again any time to reset.

## Try the full booking-to-entry workflow
1. Sign in as **tourist**, open *Taj Mahal*, pick a date (not a Friday), a slot, tickets, visitor names, then *Continue to payment*.
2. On checkout, tick *Simulate a failed payment* once to see a retry, then pay. A QR ticket appears (also under *Tickets*; download PNG or print/save as PDF).
3. Sign in as **staff**, open *Scan tickets*, paste the booking reference (or the QR text, or use the camera in Chromium-based browsers), *Verify*, then *Check in*. Scan again to see the duplicate-check-in rejection. *Check out* when done.
4. Sign in as **admin**: *Overview* (updates every 15 s) shows checked-in visitors, revenue and alerts; *Crowd*, *Reports* (with CSV export) reflect the activity.
5. Cancel a booking from the tourist *Bookings* page to see refund rules and the slot capacity being released.

Slot-time checking at the gate is relaxed by default for demos (`DEMO_RELAX_SLOT_CHECK=true`). Set it to `false` in production so tickets are only valid within the slot window ± `ENTRY_SLOT_GRACE_MINUTES`. The ticket date must always be today (IST).

## Architecture notes
```
src/models/index.ts      11 Mongoose models (User, Destination, TicketCategory, TimeSlot, Booking, Payment,
                         EntryRecord, CrowdObservation, CrowdPrediction, Review, Notification)
src/lib/booking.ts       capacity allocation, payment, cancellation/refund, ticket signing, entry/exit
src/lib/crowd.ts         crowd prediction algorithm
src/lib/slots.ts         slot template + persisted slots
src/lib/auth.ts          sessions + server-side role checks
src/app/api/**           Route Handlers (Zod-validated, wrapped by `handle()`)
src/app/(public|tourist)/ staff/ admin/   four visually distinct layouts
scripts/seed.ts, scripts/concurrency-test.ts
```
* **Money** is stored as integer paise. Pricing: ticket subtotal + 2% convenience fee + 18% GST on that fee (`src/lib/pricing.ts`, shared by client preview and server, with the server authoritative).
* **Slots** are generated from opening hours and slot length; persisted lazily when first requested for booking (idempotent upserts). Admins can edit capacity, close slots, add custom slots, and define closures.
* **Entry/exit** is per person: staff can check in or out part of a group (`quantity`), occupancy is entered minus exited, and a booking becomes `completed` when everyone has left. Exit is never blocked by the slot window.
* **Audit history:** every booking carries an append-only `history` array (created, confirmed, payment_failed, checked_in, checked_out, cancelled) and `EntryRecord` keeps each scan.

### Concurrency-safe capacity
No multi-document transaction is needed. Seats are claimed with **one atomic conditional update**:
```js
TimeSlot.findOneAndUpdate(
  { _id, closed: false, capacity: <capacity just read>, booked: { $lte: capacity - qty } },
  { $inc: { booked: qty } })
```
The database evaluates `booked <= capacity - qty` at update time, so two requests can never both take the last seats; the `capacity` equality guard rejects the update if an admin changed capacity since it was read (the code re-reads and retries). If nothing matches the slot is full and the request gets a 409; if the following booking insert fails, the seats are released. Pending bookings hold seats for `BOOKING_HOLD_MINUTES` (default 10); expiry and cancellation transition status with a conditional update (`pending → expired/cancelled`) so seats are released **exactly once**. Admin capacity edits use `booked <= newCapacity` in the filter, so capacity can never drop below existing bookings.
The design deliberately avoids `$expr`, partial indexes and TTL indexes, so it also runs on MongoDB-compatible servers.
`npm run test:concurrency` fires 40 parallel bookings at a 10-seat slot and asserts the invariant. It first probes whether the database provides atomic `$inc` and **aborts** if it does not (some compatible servers lose concurrent updates), so a pass is meaningful only on real MongoDB.

### Duplicate bookings and duplicate payments
* Bookings carry a client idempotency key (unique per user), and abandoned holds by the same user on the same slot are superseded.
* Payments carry a unique `idempotencyKey`; a replay returns the original result. The booking moves `pending → confirmed` through a single conditional update, so even concurrent payments with different keys can confirm it only once.

### Authentication and authorization
Passwords are hashed with bcrypt; sessions are HttpOnly, SameSite=Lax, signed JWT cookies. `middleware.ts` redirects unauthenticated page requests, **but every API route calls `requireUser(roles)` itself** and re-loads the user from the database (so deactivation and role changes apply immediately). Staff are restricted to assigned destinations on bookings, scanning, entries and notifications; tourists only ever see their own bookings. Payment secrets are never in client code (the prototype gateway has none).

## Crowd prediction algorithm
Implemented in `src/lib/crowd.ts` and documented in its header comment:

```
baselineDaily = avgDailyVisitors × seasonality[month] × dayOfWeek[dow] × holiday(1.35 on fixed national holidays) × calibration
baselineSlot  = baselineDaily × share(slot)            share = hourly pattern normalised over opening hours
projection    = booked / bookedFraction(daysAhead)      (share of bookings normally already made: 1.0 today … 0.2 for 8+ days)
w             = booked > 0 ? 0.6 × bookedFraction : 0
expected      = max(booked, (1 − w) × baselineSlot + w × projection)
densityPct    = expected / slotCapacity × 100
level         = Low / Moderate / High / Very High by per-destination thresholds (default 40 / 70 / 90)
waitMinutes   = 0 below 60% density, then rises quadratically (≈60 min at 100%)
calibration   = Σ actual / Σ model over the last 28 days (clamped 0.5 to 1.5)
```
Alerts are raised (as notifications) when a slot's bookings reach `alertThresholdPct` of capacity, or when recorded occupancy reaches that share of the site's `occupancyLimit`. Values are labelled **predicted** (model), **recorded** (staff check-ins) or **simulated** (seeded sample data). "Predicted vs actual" in reports compares the baseline model (without bookings) with recorded counts where available, otherwise with simulated history.

## API overview
Added in later revisions: `POST /api/auth/token` (mobile bearer token); `/api/passes` (+`/[id]`), `/api/admin/pass-types`, `/api/admin/passes`; `/api/groups` (+`/[id]`); `/api/parking`, `/api/parking/{entry,exit,active,summary}`, `/api/admin/parking`; `/api/admin/operators`; `/api/admin/devices`, `/api/device/{scan,heartbeat,receipt/[id]}`; `/api/counter/{sales,summary}`; `/api/entries/{manifest,sync}`; `/api/admin/settlements`, `/api/admin/audit`, `/api/health`.

Public: `GET /api/destinations`, `GET /api/destinations/[id|slug]`, `GET /api/slots`, `GET /api/crowd`, `GET /api/reviews`, `POST /api/contact`, `POST /api/auth/{register,login,logout}`, `GET /api/auth/me`.
Signed in: `/api/bookings` (GET list, POST create), `/api/bookings/[id]` (GET with QR, DELETE cancel), `POST /api/payments`, `/api/favorites`, `/api/reviews` (POST), `PATCH /api/profile`.
Staff/Admin: `POST /api/tickets/verify`, `/api/entries` (GET occupancy, POST check in/out), `/api/notifications`.
Admin only: destination create/edit/deactivate, `/api/slots` POST and `/api/slots/[id]` PATCH, `/api/admin/reports` (JSON and `?format=csv&kind=bookings|daily|slots`), `/api/admin/users`, `/api/admin/upload`, `POST /api/crowd` (simulated counts).

## Deployment (Vercel + MongoDB Atlas)
1. Create an Atlas cluster, a database user, and allow network access (for Vercel, allow `0.0.0.0/0` or use Atlas's Vercel integration). Copy the connection string.
2. Push this repo to GitHub, import it into Vercel (framework: Next.js).
3. Add environment variables in Vercel: `MONGODB_URI`, `AUTH_SECRET`, `TICKET_SECRET` (use `openssl rand -base64 32`), `DEMO_RELAX_SLOT_CHECK=false`, optionally `ENTRY_SLOT_GRACE_MINUTES`, `BOOKING_HOLD_MINUTES`.
4. Seed once from your machine with `MONGODB_URI` pointing at Atlas: `npm run seed`. **Seeding deletes all existing data**, so never run it against a database you care about.
5. Deploy. Change the demo passwords immediately (or delete the demo users) on any shared environment.

## Moving beyond the prototype
* **Rate limiting:** add login and booking rate limiting (not included).
* **Email domain:** Resend requires a verified sending domain for production.
* **Time zone:** dates and slot times are interpreted in IST (Asia/Kolkata).
* **Scanner:** camera scanning uses the browser `BarcodeDetector` API (Chromium); other browsers can use a USB scanner or manual entry.

## Testing
| Command | What it covers |
|---|---|
| `npm run lint` | ESLint with `next/core-web-vitals` and `jsx-a11y` |
| `npm run typecheck` | Strict TypeScript |
| `npm test` | 100 unit tests: the original 52 plus 48 for clock-in matching, credit-note and pass-refund maths, expiry dates, Hindi placeholder coverage, CSV safety, GST maths, pools and per-date capacity, offline timestamps, pass periods, plate normalisation, pricing rules, loyalty maths, roster overlaps, lost-and-found matching, escalation timing, transfer rules, directions and the weather mapper |
| `npm run test:integration` | 125 database tests (72 earlier + 34 for lost tickets, GST invoices, bays, per-date capacity, passes, offline times, plate matching, counter refunds, handover, lost-and-found, roster, peak pricing, escalation (including simultaneous requests), transfer, loyalty (including a double-spend race) and support, plus 19 for credit notes, UPI blocking, pass refunds and reminders, attendance, swaps and loyalty expiry; set `MONGODB_URI_TEST`; wipes that DB). The 2 parallel-race tests in `features.integration.test.ts` probe the database and skip themselves if it does not apply conditional updates atomically (some emulators do not); real MongoDB runs them. Original coverage: capacity limits, idempotency, hold expiry, payments, cancellation and refunds, waitlist, partial entry/exit, counter sales, invoice numbering, offline-timestamp replay, parking capacity and fees, season-pass rules, group approvals, rate limiting, mocked-HTTP Razorpay flow incl. auto-refund |
| `npm run test:e2e` | 345 HTTP checks (217 earlier + 128 since; the 14 entry-window checks on pre-seeded bookings only pass when the current time falls inside the seeded slots, which is also true of the original suite) against a running, seeded app: every role, booking to entry to cancel, operator isolation, counter sales, invoices, offline sync, settlements, parking, passes, group approvals, gate devices, mobile tokens, waitlist, admin, audit, CSV, security headers, redirects, rate limit (it temporarily opens the Taj around the clock, so it works at any hour) |
| `npm run test:a11y` | axe-core on 12 server-rendered pages (not contrast, keyboard or screen-reader behaviour) |
| `cd mobile && npm run typecheck` | Mobile app types (the Android bundle was also built with `npx expo export`) |
| `npm run test:concurrency` | Parallel-booking invariant (real MongoDB only; aborts otherwise) |

`.github/workflows/ci.yml` runs all of these against a MongoDB service container.

## Security and operations
* **Rate limits** (stored in MongoDB, so they hold across serverless instances; `Retry-After` is returned): login 6 per 15 min per IP+email and 40 per IP; registration 8/hour/IP; bookings 12 and payments 15 per 10 min per user; contact 5/hour/IP; waitlist 20, reviews 10 per hour per user; scanning 240/min per staff user. Disable for load tests with `RATE_LIMIT_DISABLED=true`.
* **Audit log:** administrator changes to destinations, slots, users and bookings are recorded and shown at `/admin/audit`.
* **Headers:** `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy` (camera allowed for scanning), HSTS. The Content-Security-Policy ships **report-only**; check your browser console on a deployed preview, then set `CSP_ENFORCE=true`.
* **Monitoring:** `GET /api/health` returns 503 if the database is unreachable (point an uptime monitor at it). Set `SENTRY_DSN` to send server errors to Sentry (a small fetch-based reporter, no SDK).
* **Backups:** use Atlas cloud backups in production; `scripts/backup.sh` wraps `mongodump` for ad-hoc copies.
* **Data accuracy:** see `DATA_CHECKLIST.md` for everything that must be verified before launch.

## Verification status
**Run during development**, against a **FerretDB 1.24 / SQLite** server (a MongoDB-compatible stand-in, because MongoDB binaries could not be downloaded in the sandbox):
* strict TypeScript, lint (incl. jsx-a11y), 37 unit tests, 50 database integration tests;
* the **217-check end-to-end suite against a real `next build` + `next start` production server**, covering every role and every module;
* an axe accessibility scan of 12 pages (clean);
* a **real headless Chrome** review of the UI at desktop and phone widths with a console-error check on every page. That is how a client-side crash on the destination page (a loading/data race in the fetch hook) and a hydration mismatch were found, which none of the HTTP tests could see;
* the mobile app: strict types and a full Android Hermes bundle.

**This revision (live crowd, parking pre-booking, gate payments, staff and operator tools)** was checked the same way: strict TypeScript, lint, 52 unit tests, the 50 original database tests (still green after the booking-engine changes), 20 new database tests (2 more skip on FerretDB, see Testing), a 94-check HTTP smoke test of every new endpoint and page against a production build (roles, validation, idempotency, QR contents, pause, incidents, shift counts, device console), and the 217-check end-to-end suite (216 passed on first run; the one failure was an old assertion that now correctly accounts for held spaces). **Not re-run for this revision:** the axe scan, the real-Chrome visual review, and the mobile app. The new pages have only been checked for building, rendering (HTTP 200, no server error) and lint accessibility rules, not looked at in a browser. Also unverified: how the QR scans with real UPI apps, card-terminal workflow, and the race-safety tests on real MongoDB.

**This revision (24 features)** was checked with: strict TypeScript, lint, 91 unit tests, 106 integration tests on a **real MongoDB 8.3 server** (so the atomic-update races are meaningful, and `npm run test:concurrency` passed), a production `next build`, every new page server-rendering for its role, and the e2e suite run over HTTP against `next start` (**331 passed, 14 failed; the same 14 fail on the original, unmodified code at the same time of day**, all "Outside slot window" entry checks). Comparing against the original surfaced two things my seed data had changed (a demo pricing rule and the new bay types); the rule now ships switched off and one old assertion was updated for the pool model.

**Not verified for this revision:**
* **The new screens were never opened in a browser.** No browser was available, so layout, modals, the camera capture flow, the service worker, `localStorage` queueing and the offline-to-online upload were only type-checked, linted and server-rendered. They need a manual pass on a real phone and desktop: especially the offline flow (turn the network off in dev tools on Staff → Parking and Counter, make entries/sales/exits, turn it back on) and the plate camera.
* **Reminder and refund notifications reaching real inboxes and phones**, and the Hindi wording (translated by me, not reviewed by a native speaker).
* **Plate recognition against a real camera or service**, **SMS delivery** (Twilio), **weather** (the sandbox had no outbound network, so only the response mapper and the "unavailable" path ran) and email delivery of support replies and transfer offers.
* Accessibility of the new pages (not axe-scanned) and the Hindi wording of the new navigation labels.
* GST rules: the invoice layout and rates are a prototype, not tax advice.

**Not verified (earlier revisions), and why it matters:**
* **Concurrent-booking safety on real MongoDB.** FerretDB/SQLite lost concurrent atomic updates (40 parallel `$inc` produced 12), so parallel capacity tests (slots, parking) can't be meaningful here. The design depends on MongoDB's single-document atomicity; run `npm run test:concurrency` on Atlas or `mongod` before launch.
* Live calls to Resend, Twilio, Razorpay, Vercel Blob and Sentry (no credentials or network access); only request formats and signature logic were tested against mocks.
* The mobile app on a device or emulator (camera, iOS), real gate hardware (turnstiles, printers, QR readers), the browser-side offline scan queue, CSP behaviour, and colour contrast / keyboard / screen-reader behaviour in real browsers.
* Behaviour under production load and index performance on large datasets.
* Photos: seeded image URLs (Wikimedia Commons) were never fetched in the sandbox and their licences are unverified; the illustrated scenes are the dependable default.

## Real live crowd (people-counters)

The live crowd number is the **real headcount** whenever any is reported today, and falls back to ticket/pass scans otherwise.
The admin Live page shows which source is in use.

**1. Register a counter** – Admin → Gate devices → Register device → type *People counter*. Copy the key (shown once).

**2. Send counts** (door sensor, camera counter or a small bridge script), every few seconds:

```
POST /api/device/count
X-Device-Key: hhd_...
{ "in": 12, "out": 7 }      // people since your last report
{ "inside": 842 }           // or an absolute "inside now" (camera snapshot, fixes drift)
```

**3. No hardware yet?** Staff can use Staff → Occupancy: tap +1/+10 in/out with a hand clicker, or type the exact number inside after a walk-round. Same effect.

Visitors see "N people inside of LIMIT" on destination pages. Turn that off per site in Admin → Settings.

## Heritage directory (all UNESCO sites + ASI monuments, with real photos)

The directory is separate from bookable destinations. Every UNESCO World Heritage Site in India and every ASI
"Monument of National Importance" (about 3,700) can be searched at `/heritage` and from the main Explore search.
Sites we sell tickets for show a **Book tickets** button; the rest show photos and facts only. We never invent prices,
hours or capacity, so a directory-only site cannot be booked until an operator adds a real Destination for it.

**One-time setup (needs internet, run on your own machine):**

1. Add `HERITAGE_CONTACT=you@example.com` to `.env.local` (Wikimedia requires a contact in the User-Agent).
2. `npm run heritage:build -- --limit 3` is a quick trial (3 state lists). Look at the "SAMPLE PARSED ROWS" table; names, ids and locations should look right.
3. `npm run heritage:build` runs the full build (15 to 40 minutes, resumable; it caches in `data/.heritage-cache.json`). It writes `data/heritage-catalogue.json` and `data/heritage-report.txt`.
4. `npm run heritage:import` loads the catalogue into MongoDB, links the bookable destinations and replaces their photos with the verified ones.

**Photos.** Only photos that exist on Wikimedia Commons, are real photographs of at least 800 px and carry a free licence
(CC BY, CC BY-SA, CC0, public domain) are used. NC/ND and fair-use files are rejected. The photographer and licence are stored
and shown under every photo, which the licences require. A site with no verifiable photo shows an illustration, and is listed in
`data/heritage-report.txt`. To fix one: `npm run heritage:photo -- <slug> "File:Name on Commons.jpg"`.
Run `npm run heritage:check -- --fix` now and then to drop photos that were later renamed or deleted on Commons.

Text summaries come from Wikipedia (CC BY-SA); each site page links back to the article.
The directory model lives in `src/models/heritage.ts` and is intentionally not exported from `src/models/index.ts`, so `npm run seed` never wipes it.

### Opening online booking for heritage sites

A directory site becomes bookable only when someone supplies its real hours, ticket prices and capacity. We never guess these, because visitors pay exactly what is saved.

- **One site:** sign in as admin or operator, open the site in the directory, click **Open online booking for this site**. The form is prefilled from public records; you enter the official hours, prices and capacity and confirm you are authorised to sell tickets.
- **Many sites:** `npm run heritage:booking -- --template > data/booking.csv` lists UNESCO sites (add `--all` for every site, or `--state "Rajasthan"`). Fill in `open, close, closed_days, indian_price, foreign_price, capacity_per_slot` from the official source, then run `npm run heritage:booking -- data/booking.csv` (dry run, writes nothing) and finally add `--apply`. Rows that are blank or invalid are skipped with a reason.
- Making a site bookable also copies its credited photos and sets the "Book tickets" badge in search.

## Speed

- **Run the production build, not the dev server.** `npm run dev` compiles each page the first time it is opened, which feels like every click is slow. Use `npm run build && npm start`, or deploy.
- **Keep the database near your visitors.** Every page makes several database calls, so a database in another continent adds a delay to each one. Create your MongoDB Atlas cluster in **Mumbai (ap-south-1)**. `vercel.json` already pins the Vercel functions to Mumbai (`bom1`); if you host elsewhere, choose a region in India.
- Built in: pages show recently loaded data instantly while refreshing it (`src/lib/api-cache.ts`; any login, logout or edit clears it), search waits for a pause in typing, the booking page loads its data in one round instead of two, and the chart library loads only on pages that draw a chart.
