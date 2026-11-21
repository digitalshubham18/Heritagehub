import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { DashShell } from "@/components/shell";

export const dynamic = "force-dynamic";
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const u = await currentUser();
  if (!u || !["admin", "operator"].includes(u.role)) redirect("/login");
  const admin = u.role === "admin";
  const items = [
    { href: "/admin", label: "d.overview", icon: "dash" },
    { href: "/admin/live", label: "d.live", icon: "radio" },
    ...(admin ? [{ href: "/admin/operators", label: "d.operators", icon: "building" }] : []),
    { href: "/admin/destinations", label: "d.destinations", icon: "building" }, { href: "/admin/bookings", label: "d.bookings", icon: "list" },
    { href: "/admin/slots", label: "d.slots", icon: "clock" }, { href: "/admin/crowd", label: "d.crowd", icon: "gauge" },
    { href: "/admin/groups", label: "d.groups", icon: "groups" }, { href: "/admin/passes", label: "d.passes", icon: "pass" },
    { href: "/admin/parking", label: "d.parking", icon: "car" }, { href: "/admin/devices", label: "d.devices", icon: "device" },
    { href: "/admin/staff", label: "d.users", icon: "users" }, { href: "/admin/staff-activity", label: "d.staffact", icon: "activity" }, { href: "/admin/roster", label: "d.roster", icon: "calendar" }, { href: "/admin/attendance", label: "d.attendance", icon: "activity" }, { href: "/admin/pricing", label: "d.pricing", icon: "tag" }, { href: "/admin/lost-found", label: "d.lostfound", icon: "package" }, { href: "/admin/support", label: "d.support", icon: "support" }, { href: "/admin/loyalty", label: "d.loyalty", icon: "gift" }, { href: "/admin/incidents", label: "d.incidents", icon: "alert" }, { href: "/admin/announcements", label: "d.announce", icon: "megaphone" }, { href: "/admin/reports", label: "d.reports", icon: "chart" },
    { href: "/admin/settlements", label: "d.settlements", icon: "chart" }, { href: "/admin/reconcile", label: "d.reconcile", icon: "chart" }, ...(admin ? [{ href: "/admin/einvoice", label: "d.einvoice", icon: "list" }] : []), { href: "/admin/audit", label: "d.audit", icon: "list" }, { href: "/admin/settings", label: "d.settings", icon: "settings" },
  ];
  return <DashShell items={items} title={admin ? "d.admin" : "d.operator"} tone="admin" name={u.name}>{children}</DashShell>;
}
