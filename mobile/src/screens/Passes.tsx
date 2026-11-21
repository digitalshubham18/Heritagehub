import { useCallback, useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import QRCode from "react-native-qrcode-svg";
import { api, fmtDay } from "../api";
import { C } from "../theme";
import { Card, Err, H1, Loading, Muted, Screen } from "../ui";

function PassCard({ p }: { p: any }) {
  const [code, setCode] = useState<string | null>(null); const [open, setOpen] = useState(false);
  useEffect(() => { if (open && !code) api(`/api/passes/${p._id}`).then((r) => setCode(r.code)).catch(() => {}); }, [open, code, p._id]);
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`Season pass for ${p.holderName}. Tap to ${open ? "hide" : "show"} QR`} onPress={() => setOpen(!open)}>
      <Card>
        <Text style={{ fontSize: 20, color: C.ink, fontFamily: "serif", fontWeight: "600" }}>Season pass</Text>
        <Muted>{p.holderName}</Muted><Muted>{fmtDay(p.validFrom)} to {fmtDay(p.validTo)}</Muted><Muted>{p.destinationNames.join(", ")}</Muted>
        <Text style={{ fontFamily: "monospace", color: C.forest, fontWeight: "700", marginTop: 6 }}>{p.reference}</Text>
        {open && <View style={{ alignItems: "center", marginTop: 14, padding: 12, backgroundColor: "#fff", borderRadius: 14 }}>{code ? <QRCode value={code} size={210} color="#173B2C" /> : <Loading />}</View>}
        {!open && <Muted style={{ marginTop: 8 }}>Tap to show QR</Muted>}
      </Card>
    </Pressable>
  );
}
export default function Passes({ navigation }: any) {
  const [items, setItems] = useState<any[] | null>(null); const [err, setErr] = useState("");
  const load = useCallback(() => { setErr(""); api("/api/passes?mine=1").then((r) => setItems(r.items)).catch((e) => setErr(e.message)); }, []);
  useEffect(() => navigation.addListener("focus", load), [navigation, load]);
  return <Screen><H1>My passes</H1>{err ? <Err message={err} onRetry={load} /> : !items ? <Loading /> : items.length === 0 ? <Card><Muted>No season passes yet. Buy one on the HeritageHub website.</Muted></Card> : items.map((p) => <PassCard key={p._id} p={p} />)}</Screen>;
}
