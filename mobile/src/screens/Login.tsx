import { useState } from "react";
import { KeyboardAvoidingView, Platform, Text, TextInput, View } from "react-native";
import { Art } from "../art";
import { useAuth } from "../auth";
import { C } from "../theme";
import { Button, Err, Screen } from "../ui";

export default function Login() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState(""); const [password, setPassword] = useState(""); const [busy, setBusy] = useState(false); const [err, setErr] = useState(""); const [needCode, setNeedCode] = useState(false); const [code, setCode] = useState("");
  const go = async () => { setBusy(true); setErr(""); try { await signIn(email.trim(), password, code.trim() || undefined); } catch (e: any) { if (e.data?.twoFactorRequired) setNeedCode(true); setErr(e.message); } finally { setBusy(false); } };
  const input = { borderWidth: 1, borderColor: C.line, borderRadius: 12, padding: 14, fontSize: 16, backgroundColor: "#fff", marginBottom: 12, color: C.ink } as const;
  return (
    <Screen pad={0}>
      <View style={{ height: 230, overflow: "hidden" }}><Art slug="taj-mahal" type="monument" height={230} /></View>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ padding: 20 }}>
        <Text style={{ fontSize: 34, color: C.ink, fontFamily: "serif", fontWeight: "600" }}>Walk into history, not a queue.</Text>
        <Text style={{ color: C.muted, marginVertical: 10 }}>Sign in to book timed tickets and carry your QR tickets with you.</Text>
        {err ? <Err message={err} /> : null}
        <TextInput accessibilityLabel="Email" style={input} placeholder="Email" autoCapitalize="none" keyboardType="email-address" autoComplete="email" value={email} onChangeText={setEmail} />
        <TextInput accessibilityLabel="Password" style={input} placeholder="Password" secureTextEntry autoComplete="password" value={password} onChangeText={setPassword} />
        {needCode ? <TextInput accessibilityLabel="Authenticator code" style={input} placeholder="6-digit code or recovery code" autoCapitalize="characters" autoComplete="one-time-code" value={code} onChangeText={setCode} /> : null}
        <Button title="Sign in" onPress={go} loading={busy} disabled={!email || !password} />
        <Text style={{ color: C.muted, fontSize: 12, marginTop: 16 }}>Need an account? Register on the HeritageHub website, then sign in here. Staff accounts use the same sign-in.</Text>
      </KeyboardAvoidingView>
    </Screen>
  );
}
