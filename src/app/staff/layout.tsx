import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { DashShell } from "@/components/shell";

export const dynamic = "force-dynamic";
export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  const u = await currentUser();
  if (!u || !["staff", "admin"].includes(u.role)) redirect("/login");
  if (u.mustEnrollTwoFactor) redirect("/account/security?required=1");
  const items = [{ href: "/staff", label: "d.today", icon: "dash" }, { href: "/staff/scan", label: "d.scan", icon: "qr" }, { href: "/staff/counter", label: "d.counter", icon: "ticket" }, { href: "/staff/parking", label: "d.parking", icon: "car" }, { href: "/staff/occupancy", label: "d.occupancy", icon: "gauge" }, { href: "/staff/lookup", label: "d.lookup", icon: "search" }, { href: "/staff/shift", label: "d.shift", icon: "wallet" }, { href: "/staff/handover", label: "d.handover", icon: "swap" }, { href: "/staff/lost-found", label: "d.lostfound", icon: "package" }, { href: "/staff/roster", label: "d.roster", icon: "calendar" }, { href: "/staff/incidents", label: "d.incidents", icon: "alert" }];
  return <DashShell items={items} title="d.staff" tone="staff" name={u.name}>{children}</DashShell>;
}
