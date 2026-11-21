import { useCallback, useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import QRCode from "react-native-qrcode-svg";
import { api, fmtDay, fmtTime, inr, istDate } from "../api";
import { C } from "../theme";
import { Card, Err, H1, H2, Loading, Muted, Screen } from "../ui";

export function Tickets({ navigation }: any) {
  const [items, setItems] = useState<any[] | null>(null); const [err, setErr] = useState("");
  const load = useCallback(() => { setErr(""); api("/api/bookings").then((r) => setItems(r.items)).catch((e) => setErr(e.message)); }, []);
  useEffect(() => navigation.addListener("focus", load), [navigation, load]);
  const today = istDate();
  const list = (items || []).filter((b) => b.status === "confirmed" && b.date >= today).sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start));
  return (
    <Screen><H1>My tickets</H1>
      {err ? <Err message={err} onRetry={load} /> : !items ? <Loading /> : list.length === 0 ? <Card><Muted>No upcoming tickets. Book a visit from Explore.</Muted></Card> : list.map((b) => (
        <Pressable key={b._id} accessibilityRole="button" accessibilityLabel={`Ticket for ${b.destinationInfo?.name} on ${fmtDay(b.date)}`} onPress={() => navigation.navigate("TicketDetail", { id: b._id })}>
          <Card><Text style={{ fontSize: 19, color: C.ink, fontFamily: "serif", fontWeight: "600" }}>{b.destinationInfo?.name}</Text><Muted>{fmtDay(b.date)} · {fmtTime(b.start)} to {fmtTime(b.end)}</Muted><Text style={{ marginTop: 6, color: C.ink }}>{b.quantity} ticket(s) · <Text style={{ fontFamily: "monospace" }}>{b.reference}</Text></Text></Card>
        </Pressable>))}
    </Screen>
  );
}
export function TicketDetail({ route }: any) {
  const [d, setD] = useState<any>(null); const [err, setErr] = useState("");
  useEffect(() => { api(`/api/bookings/${route.params.id}`).then(setD).catch((e) => setErr(e.message)); }, [route.params.id]);
  if (err) return <Screen><Err message={err} /></Screen>;
  if (!d) return <Screen><Loading /></Screen>;
  const b = d.booking;
  return (
    <Screen>
      <Card style={{ alignItems: "center" }}>
        <Text style={{ fontSize: 24, color: C.ink, fontFamily: "serif", fontWeight: "600", textAlign: "center" }}>{d.destination.name}</Text>
        <Muted>{fmtDay(b.date)} · {fmtTime(b.start)} to {fmtTime(b.end)}</Muted>
        <View style={{ marginVertical: 18, padding: 12, backgroundColor: "#fff", borderRadius: 14 }}>{d.code ? <QRCode value={d.code} size={220} color="#173B2C" /> : <Muted>The QR appears once the booking is confirmed.</Muted>}</View>
        <Text accessibilityLabel={`Booking reference ${b.reference}`} style={{ fontFamily: "monospace", fontSize: 22, letterSpacing: 2, color: C.forest, fontWeight: "700" }}>{b.reference}</Text>
        <Muted style={{ marginTop: 6, textAlign: "center" }}>Show this at the gate with a valid photo ID.</Muted>
      </Card>
      <Card><H2>Details</H2><Muted>{b.quantity} visitor(s): {b.visitors.map((v: any) => v.name).join(", ")}</Muted><Muted>{b.items.map((i: any) => `${i.quantity} × ${i.name}`).join("; ")}</Muted><Text style={{ marginTop: 6, color: C.ink, fontWeight: "700" }}>Total paid {inr(b.totalMinor)}</Text>{b.checkedInCount > 0 && <Muted>{b.checkedInCount} of {b.quantity} entered</Muted>}</Card>
    </Screen>
  );
}
