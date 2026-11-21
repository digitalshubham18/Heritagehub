import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, Text, View } from "react-native";
import { api, fmtDay, fmtTime, inr, istDate } from "../api";
import { Art } from "../art";
import { useAuth } from "../auth";
import { C } from "../theme";
import { Button, Card, Chip, Err, H2, LevelBadge, Loading, Muted, Ribbon, Screen } from "../ui";

export default function Destination({ route, navigation }: any) {
  const { user } = useAuth();
  const slug: string = route.params.slug;
  const [d, setD] = useState<any>(null); const [err, setErr] = useState("");
  const [date, setDate] = useState(istDate()); const [slots, setSlots] = useState<any>(null);
  const [slotId, setSlotId] = useState(""); const [qty, setQty] = useState<Record<string, number>>({}); const [busy, setBusy] = useState(false);
  const key = useRef(String(Date.now()) + Math.random().toString(36).slice(2));
  useEffect(() => { api(`/api/destinations/${slug}`).then(setD).catch((e) => setErr(e.message)); }, [slug]);
  useEffect(() => { setSlots(null); setSlotId(""); api(`/api/slots?destination=${slug}&date=${date}`).then(setSlots).catch((e) => setErr(e.message)); }, [slug, date]);
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => istDate(i)), []);
  const total = Object.values(qty).reduce((a, b) => a + b, 0);
  const items = (d?.categories || []).filter((c: any) => qty[c._id]).map((c: any) => ({ unitPriceMinor: c.priceMinor, unitFeeMinor: c.feeMinor || 0, quantity: qty[c._id] }));
  const sub = items.reduce((s: number, i: any) => s + (i.unitPriceMinor + i.unitFeeMinor) * i.quantity, 0);
  const fee = Math.round(sub * 0.02), gst = Math.round(fee * 0.18), grand = sub + fee + gst;
  const slot = slots?.slots?.find((s: any) => s.id === slotId);

  async function book() {
    if (!user) return;
    setBusy(true);
    try {
      const b = await api("/api/bookings", { body: { destinationId: d.destination._id, slotId, items: Object.entries(qty).filter(([, v]) => v).map(([categoryId, quantity]) => ({ categoryId, quantity })), visitors: Array.from({ length: total }, (_, i) => ({ name: i === 0 ? user.name : `Guest ${i + 1}` })), contact: { name: user.name, email: user.email, phone: user.phone || "0000000000" }, idempotencyKey: key.current } });
      const p = await api("/api/payments", { body: { bookingId: b.booking._id, method: "upi", idempotencyKey: "pay-" + key.current } });
      key.current = String(Date.now()) + Math.random().toString(36).slice(2);
      Alert.alert("Booked", "Payment received (test mode). Your ticket is ready.");
      navigation.navigate("Tickets", { screen: "TicketDetail", params: { id: p.booking._id } });
    } catch (e: any) { Alert.alert("Couldn't complete booking", e.message); } finally { setBusy(false); }
  }
  if (err && !d) return <Screen><Err message={err} /></Screen>;
  if (!d) return <Screen><Loading /></Screen>;
  const x = d.destination;
  return (
    <Screen pad={0}>
      <Art slug={x.slug} type={x.type} height={190} />
      <View style={{ padding: 16 }}>
        <Text style={{ fontSize: 30, color: C.ink, fontFamily: "serif", fontWeight: "600" }}>{x.name}</Text>
        <Muted>{x.city}, {x.state} · {fmtTime(x.hours.open)} to {fmtTime(x.hours.close)}</Muted>
        <Text style={{ color: C.ink, marginVertical: 12, lineHeight: 21 }}>{x.shortDescription}</Text>

        <H2>Pick a day</H2>
        <View style={{ flexDirection: "row", flexWrap: "wrap" }}>{days.map((dd) => <Chip key={dd} label={fmtDay(dd)} on={dd === date} onPress={() => setDate(dd)} />)}</View>

        <H2>Crowd and time slot</H2>
        {!slots ? <Loading /> : slots.closed ? <Card><Muted>Closed on this date.</Muted></Card> : (<>
          <Ribbon slots={slots.slots} />
          <View style={{ marginTop: 12 }}>{slots.slots.filter((s: any) => !s.past).map((s: any) => {
            const dis = s.closed || s.remaining === 0; const on = slotId === s.id;
            return (
              <Card key={s.id} style={{ padding: 0, marginBottom: 8, borderColor: on ? C.forest : C.line, borderWidth: on ? 2 : 1, opacity: dis ? 0.5 : 1 }}>
                <Button title={`${fmtTime(s.start)} to ${fmtTime(s.end)}   ·   ${dis ? (s.closed ? "Closed" : "Sold out") : `${s.remaining} left`}`} variant={on ? "primary" : "outline"} disabled={dis} onPress={() => setSlotId(s.id)} style={{ borderWidth: 0, borderRadius: 0 }} />
                {!dis && <View style={{ padding: 8, paddingTop: 6 }}><LevelBadge level={s.level} /></View>}
              </Card>);
          })}</View></>)}

        <H2>Tickets</H2>
        {d.categories.map((c: any) => (
          <Card key={c._id} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <View style={{ flex: 1, paddingRight: 8 }}><Text style={{ color: C.ink, fontWeight: "600" }}>{c.name}</Text><Muted>{c.priceMinor + (c.feeMinor || 0) === 0 ? "Free" : inr(c.priceMinor + (c.feeMinor || 0))}</Muted></View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <Button title="−" variant="outline" onPress={() => setQty((q) => ({ ...q, [c._id]: Math.max(0, (q[c._id] || 0) - 1) }))} style={{ minHeight: 40, width: 44, paddingHorizontal: 0 }} />
              <Text accessibilityLabel={`${qty[c._id] || 0} tickets`} style={{ width: 22, textAlign: "center", fontSize: 17 }}>{qty[c._id] || 0}</Text>
              <Button title="+" variant="outline" disabled={total >= Math.min(x.bookingPolicy.maxTicketsPerBooking, slot?.remaining ?? 99)} onPress={() => setQty((q) => ({ ...q, [c._id]: (q[c._id] || 0) + 1 }))} style={{ minHeight: 40, width: 44, paddingHorizontal: 0 }} />
            </View>
          </Card>))}

        <Card style={{ backgroundColor: C.ivory100 }}>
          <Row l="Tickets" r={inr(sub)} /><Row l="Convenience fee" r={inr(fee)} muted /><Row l="GST on fee" r={inr(gst)} muted />
          <View style={{ height: 1, backgroundColor: C.line, marginVertical: 8 }} /><Row l="Total" r={inr(grand)} bold />
        </Card>
        {!user ? <Muted>Sign in to book.</Muted> : <Button title={`Pay ${inr(grand)} (test mode)`} variant="accent" loading={busy} disabled={!slotId || !total} onPress={book} />}
        <Muted style={{ marginTop: 10, fontSize: 12 }}>Payments are simulated; no money moves. Free cancellation windows follow the site's policy on the website.</Muted>
      </View>
    </Screen>
  );
}
const Row = ({ l, r, bold, muted }: { l: string; r: string; bold?: boolean; muted?: boolean }) => <View style={{ flexDirection: "row", justifyContent: "space-between", marginVertical: 2 }}><Text style={{ color: muted ? C.muted : C.ink, fontWeight: bold ? "700" : "400" }}>{l}</Text><Text style={{ color: muted ? C.muted : C.ink, fontWeight: bold ? "700" : "400" }}>{r}</Text></View>;
