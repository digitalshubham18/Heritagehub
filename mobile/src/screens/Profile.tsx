import { Text } from "react-native";
import { BASE } from "../api";
import { useAuth } from "../auth";
import { C } from "../theme";
import { Button, Card, H1, Muted, Screen } from "../ui";

export default function Profile() {
  const { user, signOut } = useAuth();
  return <Screen><H1>Profile</H1><Card><Text style={{ fontSize: 20, color: C.ink, fontWeight: "600" }}>{user?.name}</Text><Muted>{user?.email}</Muted><Muted>Role: {user?.role}</Muted><Muted style={{ marginTop: 8, fontSize: 12 }}>Server: {BASE}</Muted></Card><Button title="Sign out" variant="outline" onPress={signOut} /></Screen>;
}
