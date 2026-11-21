import { NavigationContainer, DefaultTheme } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { StatusBar } from "expo-status-bar";
import { Text } from "react-native";
import { AuthProvider, useAuth } from "./src/auth";
import Destination from "./src/screens/Destination";
import Explore from "./src/screens/Explore";
import Login from "./src/screens/Login";
import Passes from "./src/screens/Passes";
import Profile from "./src/screens/Profile";
import Scan from "./src/screens/Scan";
import { TicketDetail, Tickets } from "./src/screens/Tickets";
import { C } from "./src/theme";
import { Loading } from "./src/ui";

const Stack = createNativeStackNavigator(); const Tab = createBottomTabNavigator();
const theme = { ...DefaultTheme, colors: { ...DefaultTheme.colors, background: C.ivory, primary: C.forest, card: "#fff", text: C.ink, border: C.line } };
const icon = (g: string) => ({ color }: { color: string }) => <Text style={{ color, fontSize: 18 }}>{g}</Text>;

function TicketsStack() { return <Stack.Navigator><Stack.Screen name="TicketList" component={Tickets} options={{ headerShown: false }} /><Stack.Screen name="TicketDetail" component={TicketDetail} options={{ title: "Ticket" }} /></Stack.Navigator>; }
function ExploreStack() { return <Stack.Navigator><Stack.Screen name="ExploreList" component={Explore} options={{ headerShown: false }} /><Stack.Screen name="Destination" component={Destination} options={({ route }: any) => ({ title: route.params?.name || "Destination" })} /></Stack.Navigator>; }

function Tabs() {
  const { user } = useAuth();
  const staff = user && ["staff", "admin", "operator"].includes(user.role);
  return (
    <Tab.Navigator screenOptions={{ headerShown: false, tabBarActiveTintColor: C.forest }}>
      {staff && <Tab.Screen name="Scan" component={Scan} options={{ tabBarIcon: icon("▣") }} />}
      <Tab.Screen name="Explore" component={ExploreStack} options={{ tabBarIcon: icon("⌂") }} />
      <Tab.Screen name="Tickets" component={TicketsStack} options={{ tabBarIcon: icon("✦") }} />
      <Tab.Screen name="Passes" component={Passes} options={{ tabBarIcon: icon("◈") }} />
      <Tab.Screen name="Profile" component={Profile} options={{ tabBarIcon: icon("☺") }} />
    </Tab.Navigator>
  );
}
function Root() { const { user, ready } = useAuth(); if (!ready) return <Loading />; return user ? <Tabs /> : <Login />; }
export default function App() { return <AuthProvider><NavigationContainer theme={theme}><StatusBar style="dark" /><Root /></NavigationContainer></AuthProvider>; }
