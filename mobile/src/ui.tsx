import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View, ViewStyle } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { C, LEVEL, Level } from "./theme";

export function Screen({ children, scroll = true, pad = 16 }: { children: React.ReactNode; scroll?: boolean; pad?: number }) {
  return <SafeAreaView style={{ flex: 1, backgroundColor: C.ivory }} edges={["top"]}>{scroll ? <ScrollView contentContainerStyle={{ padding: pad, paddingBottom: 40 }}>{children}</ScrollView> : <View style={{ flex: 1, padding: pad }}>{children}</View>}</SafeAreaView>;
}
export const H1 = ({ children }: { children: React.ReactNode }) => <Text accessibilityRole="header" style={s.h1}>{children}</Text>;
export const H2 = ({ children }: { children: React.ReactNode }) => <Text accessibilityRole="header" style={s.h2}>{children}</Text>;
export const Muted = ({ children, style }: { children: React.ReactNode; style?: object }) => <Text style={[s.muted, style]}>{children}</Text>;
export const Card = ({ children, style }: { children: React.ReactNode; style?: ViewStyle }) => <View style={[s.card, style]}>{children}</View>;

export function Button({ title, onPress, variant = "primary", loading, disabled, style }: { title: string; onPress: () => void; variant?: "primary" | "accent" | "outline"; loading?: boolean; disabled?: boolean; style?: ViewStyle }) {
  const bg = variant === "primary" ? C.forest : variant === "accent" ? C.terracotta : "transparent";
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ disabled: !!(disabled || loading) }} onPress={onPress} disabled={disabled || loading} style={({ pressed }) => [s.btn, { backgroundColor: bg, borderColor: variant === "outline" ? C.forest : bg, opacity: disabled ? 0.5 : pressed ? 0.85 : 1 }, style]}>
      {loading ? <ActivityIndicator color={variant === "outline" ? C.forest : "#fff"} /> : <Text style={[s.btnText, { color: variant === "outline" ? C.forest : "#fff" }]}>{title}</Text>}
    </Pressable>
  );
}
export function Chip({ label, on, onPress, disabled }: { label: string; on?: boolean; onPress: () => void; disabled?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ selected: !!on, disabled }} onPress={onPress} disabled={disabled} style={[s.chip, on && { backgroundColor: C.forest, borderColor: C.forest }, disabled && { opacity: 0.4 }]}><Text style={{ color: on ? "#fff" : C.ink, fontSize: 13 }}>{label}</Text></Pressable>;
}
/** Level is shown with text and bar count, not colour alone. */
export function LevelBadge({ level }: { level: Level }) {
  const L = LEVEL[level];
  return (
    <View accessibilityLabel={`${L.t} crowd`} style={[s.badge, { backgroundColor: L.bg }]}>
      <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 1.5, marginRight: 5 }}>{[0, 1, 2, 3].map((i) => <View key={i} style={{ width: 3, height: 4 + i * 3, backgroundColor: L.c, opacity: i < L.bars ? 1 : 0.25 }} />)}</View>
      <Text style={{ color: C.ink, fontSize: 12, fontWeight: "600" }}>{L.t}</Text>
    </View>
  );
}
export function Ribbon({ slots }: { slots: { start: string; level: Level }[] }) {
  return <View accessibilityLabel="Crowd by time slot" style={{ flexDirection: "row", gap: 2, height: 10, borderRadius: 5, overflow: "hidden" }}>{slots.map((x) => <View key={x.start} style={{ flex: 1, backgroundColor: LEVEL[x.level].c }} />)}</View>;
}
export const Err = ({ message, onRetry }: { message: string; onRetry?: () => void }) => <Card style={{ borderColor: "#E9B4B4", backgroundColor: "#FDF2F2" }}><Text style={{ color: "#7F1D1D" }}>{message}</Text>{onRetry && <Button title="Try again" variant="outline" onPress={onRetry} style={{ marginTop: 10 }} />}</Card>;
export const Loading = () => <View style={{ padding: 40 }}><ActivityIndicator color={C.forest} size="large" /></View>;

const s = StyleSheet.create({
  h1: { fontSize: 30, color: C.ink, fontWeight: "600", marginBottom: 6, fontFamily: "serif" },
  h2: { fontSize: 20, color: C.ink, fontWeight: "600", marginBottom: 6, fontFamily: "serif" },
  muted: { color: C.muted, fontSize: 14 },
  card: { backgroundColor: C.white, borderRadius: 18, borderWidth: 1, borderColor: C.line, padding: 16, marginBottom: 14, overflow: "hidden" },
  btn: { minHeight: 48, borderRadius: 14, borderWidth: 1.5, alignItems: "center", justifyContent: "center", paddingHorizontal: 18 },
  btnText: { fontSize: 16, fontWeight: "600" },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: C.line, marginRight: 8, marginBottom: 8, backgroundColor: C.white },
  badge: { flexDirection: "row", alignItems: "center", alignSelf: "flex-start", paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999 },
});
