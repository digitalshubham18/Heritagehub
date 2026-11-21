import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { DashShell } from "@/components/shell";

export const dynamic = "force-dynamic";
export default async function TouristLayout({ children }: { children: React.ReactNode }) {
  const u = await currentUser();
  if (!u) redirect("/login");
  const items = [
    { href: "/dashboard", label: "d.overview", icon: "dash" }, { href: "/dashboard/bookings", label: "d.bookings", icon: "list" },
    { href: "/dashboard/tickets", label: "d.tickets", icon: "ticket" }, { href: "/dashboard/passes", label: "d.mypasses", icon: "pass" }, { href: "/dashboard/groups", label: "d.groups", icon: "groups" }, { href: "/dashboard/parking", label: "d.myparking", icon: "car" }, { href: "/dashboard/payments", label: "d.payments", icon: "wallet" }, { href: "/dashboard/passport", label: "d.passport", icon: "stamp" }, { href: "/dashboard/loyalty", label: "d.loyalty", icon: "gift" }, { href: "/dashboard/support", label: "d.support", icon: "support" }, { href: "/dashboard/reviews", label: "d.reviews", icon: "star" }, { href: "/dashboard/profile", label: "d.profile", icon: "user" }, { href: "/dashboard/privacy", label: "d.privacy", icon: "user" },
  ];
  return <DashShell items={items} title="d.trips" tone="tourist" name={u.name}>{children}</DashShell>;
}
