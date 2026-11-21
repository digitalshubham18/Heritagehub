import { useEffect, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { api, inr } from "../api";
import { Art } from "../art";
import { C } from "../theme";
import { Card, Err, H1, LevelBadge, Loading, Muted, Screen } from "../ui";

export default function Explore({ navigation }: any) {
  const [items, setItems] = useState<any[] | null>(null); const [err, setErr] = useState(""); const [q, setQ] = useState("");
  const load = () => { setErr(""); api(`/api/destinations${q ? `?q=${encodeURIComponent(q)}` : ""}`).then((r) => setItems(r.items)).catch((e) => setErr(e.message)); };
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [q]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Screen>
      <H1>Explore</H1>
      <TextInput accessibilityLabel="Search destinations" placeholder="Search monuments, cities, museums" value={q} onChangeText={setQ} style={{ borderWidth: 1, borderColor: C.line, borderRadius: 14, padding: 13, backgroundColor: "#fff", marginBottom: 14, fontSize: 16 }} />
      {err ? <Err message={err} onRetry={load} /> : !items ? <Loading /> : items.length === 0 ? <Muted>No destinations match.</Muted> : items.map((d) => (
        <Pressable key={d._id} accessibilityRole="button" accessibilityLabel={`${d.name}, ${d.city}`} onPress={() => navigation.navigate("Destination", { slug: d.slug, name: d.name })}>
          <Card style={{ padding: 0 }}>
            <Art slug={d.slug} type={d.type} height={150} />
            <View style={{ padding: 14 }}>
              <Text style={{ fontSize: 20, color: C.ink, fontFamily: "serif", fontWeight: "600" }}>{d.name}</Text>
              <Muted>{d.city}, {d.state}</Muted>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 12 }}>
                <Text style={{ color: C.ink }}>From <Text style={{ fontWeight: "700", fontSize: 18 }}>{inr(d.fromPriceMinor)}</Text></Text>
                {d.crowd.closed ? <Muted>Closed today</Muted> : <LevelBadge level={d.crowd.level} />}
              </View>
            </View>
          </Card>
        </Pressable>))}
    </Screen>
  );
}
