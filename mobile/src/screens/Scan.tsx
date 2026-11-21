import { CameraView, useCameraPermissions } from "expo-camera";
import { useEffect, useRef, useState } from "react";
import { Alert, Text, View } from "react-native";
import { api, fmtTime } from "../api";
import { C } from "../theme";
import { Button, Card, Chip, Err, H1, Muted, Screen } from "../ui";

/** Staff scanner. Online only: the server checks the QR signature, date, slot and entry limits. */
export default function Scan() {
  const [perm, ask] = useCameraPermissions();
  const [sites, setSites] = useState<any[]>([]); const [siteId, setSiteId] = useState("");
  const [res, setRes] = useState<any>(null); const [code, setCode] = useState(""); const [busy, setBusy] = useState(false); const [err, setErr] = useState("");
  const last = useRef(0);
  useEffect(() => { api("/api/entries").then((r) => { setSites(r.items); setSiteId(r.items[0]?.id || ""); }).catch((e) => setErr(e.message)); }, []);

  async function onScan({ data }: { data: string }) {
    if (busy || Date.now() - last.current < 2500) return; last.current = Date.now();
    setBusy(true); setErr(""); setCode(data);
    try { setRes(await api("/api/tickets/verify", { body: { code: data, destinationId: siteId || undefined } })); } catch (e: any) { setErr(e.message); setRes(null); } finally { setBusy(false); }
  }
  async function record(action: "in" | "out") {
    setBusy(true);
    try { const r = await api("/api/entries", { body: { code, action, destinationId: siteId || undefined } }); Alert.alert(action === "in" ? "Checked in" : "Checked out", `${r.quantity} visitor(s). Inside now: ${r.occupancy}`); setRes(await api("/api/tickets/verify", { body: { code, destinationId: siteId || undefined } })); }
    catch (e: any) { Alert.alert("Not allowed", e.message); } finally { setBusy(false); }
  }
  const b = res?.booking, p = res?.pass;
  const toEnter = b ? b.quantity - (b.checkedInCount || 0) : 0, inside = b ? (b.checkedInCount || 0) - (b.checkedOutCount || 0) : 0;
  const canIn = res?.kind === "pass" ? res.valid && !p.inside && p.entriesToday < p.maxEntriesPerDay : res?.valid && toEnter > 0;
  const canOut = res?.kind === "pass" ? res.valid && p.inside : inside > 0 && res?.reasons.every((r: string) => r.startsWith("Outside slot window"));
  if (!perm) return <Screen><Muted>Checking camera permission…</Muted></Screen>;
  if (!perm.granted) return <Screen><H1>Scan tickets</H1><Card><Text style={{ color: C.ink, marginBottom: 12 }}>Camera access is needed to scan visitor QR codes.</Text><Button title="Allow camera" onPress={ask} /></Card></Screen>;
  return (
    <Screen>
      <H1>Scan tickets</H1>
      {sites.length > 1 && <View style={{ flexDirection: "row", flexWrap: "wrap" }}>{sites.map((s) => <Chip key={s.id} label={s.name} on={s.id === siteId} onPress={() => setSiteId(s.id)} />)}</View>}
      <View style={{ height: 260, borderRadius: 18, overflow: "hidden", marginBottom: 14, backgroundColor: "#000" }}>
        <CameraView style={{ flex: 1 }} facing="back" barcodeScannerSettings={{ barcodeTypes: ["qr"] }} onBarcodeScanned={onScan} accessibilityLabel="Camera view for scanning QR codes" />
      </View>
      {err ? <Err message={err} /> : null}
      {res && (
        <Card style={{ borderWidth: 2, borderColor: canIn || canOut ? "#2F855A" : "#C53030" }}>
          <Text style={{ fontSize: 20, fontWeight: "700", color: C.ink }}>{canIn ? "Valid for entry" : canOut ? "Visitors are inside" : "Not valid for entry"}</Text>
          {res.reasons.map((r: string) => <Text key={r} style={{ color: "#9B2C2C", marginTop: 4 }}>• {r}</Text>)}
          {res.warnings.map((w: string) => <Text key={w} style={{ color: "#975A16", marginTop: 4 }}>{w}</Text>)}
          {res.kind === "pass" ? <><Muted style={{ marginTop: 8 }}>Pass holder: {p.holderName}</Muted><Muted>{p.reference} · {p.entriesToday}/{p.maxEntriesPerDay} entries today</Muted></> : b ? <><Muted style={{ marginTop: 8 }}>{b.reference} · {b.date} · {fmtTime(b.start)} to {fmtTime(b.end)}</Muted><Muted>{b.quantity} visitor(s): {b.checkedInCount || 0} entered, {inside} inside</Muted></> : null}
          <View style={{ flexDirection: "row", gap: 10, marginTop: 14 }}><Button title="Check in" disabled={!canIn} loading={busy} onPress={() => record("in")} style={{ flex: 1 }} /><Button title="Check out" variant="outline" disabled={!canOut} loading={busy} onPress={() => record("out")} style={{ flex: 1 }} /></View>
        </Card>)}
      {!res && !err && <Muted>Point the camera at a ticket or pass QR.</Muted>}
    </Screen>
  );
}
