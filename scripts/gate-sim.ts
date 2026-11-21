/**
 * Simulates a gate controller talking to HeritageHub, to try the device protocol without hardware.
 *   DEVICE_KEY=hhd_... BASE_URL=http://localhost:3000 npx tsx scripts/gate-sim.ts <qr-text> [<qr-text> ...]
 * Prints what a real controller would do: open the relay (allow) or hold the gate (deny), and the LCD message.
 * With the seeded demo data you can use DEVICE_KEY=hhd_demo_taj_gate_a_key (demo only).
 */
const BASE = (process.env.BASE_URL || "http://localhost:3000").replace(/\/$/, "");
const KEY = process.env.DEVICE_KEY;
if (!KEY) { console.error("Set DEVICE_KEY"); process.exit(2); }
const post = (path: string, body: unknown) => fetch(BASE + path, { method: "POST", headers: { "X-Device-Key": KEY, "Content-Type": "application/json" }, body: JSON.stringify(body) });

(async () => {
  const hb = await post("/api/device/heartbeat", {});
  if (!hb.ok) { console.error(`Heartbeat failed (${hb.status}): check the key`); process.exit(1); }
  const h: any = await hb.json(); console.log(`Connected: ${h.device} at ${h.destination}. Inside now: ${h.occupancy}${h.limit ? ` / ${h.limit}` : ""}`);
  for (const code of process.argv.slice(2)) {
    const r = await post("/api/device/scan", { code });
    const j: any = await r.json();
    if (r.status === 429) { console.log("  RATE LIMITED, slow down"); continue; }
    console.log(`${j.allow ? "  OPEN " : "  HOLD "} [${(j.message || "").padEnd(24)}] ${j.reason || ""}${j.allow ? `  (inside: ${j.occupancy})` : ""}`);
  }
})();
