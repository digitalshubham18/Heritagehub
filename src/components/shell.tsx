"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { BadgeCheck, BarChart3, Building2, CarFront, Cpu, UsersRound, CalendarDays, ClipboardList, Gauge, Home, LayoutDashboard, LogOut, Menu, QrCode, Settings, Ticket, User, Users, X, Landmark, Clock4, Search, Wallet, Siren, Megaphone, Radio, Bell, Stamp, Star, Activity, Package, Tag, LifeBuoy, Gift, ArrowLeftRight } from "lucide-react";
import { api, useUser } from "@/lib/hooks";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";

const ICONS: Record<string, any> = { home: Home, ticket: Ticket, list: ClipboardList, user: User, dash: LayoutDashboard, qr: QrCode, gauge: Gauge, building: Building2, calendar: CalendarDays, clock: Clock4, users: Users, chart: BarChart3, settings: Settings, car: CarFront, device: Cpu, groups: UsersRound, pass: BadgeCheck, search: Search, wallet: Wallet, alert: Siren, megaphone: Megaphone, radio: Radio, bell: Bell, stamp: Stamp, star: Star, activity: Activity, package: Package, tag: Tag, support: LifeBuoy, gift: Gift, swap: ArrowLeftRight };

export function Logo({ light, iconClass }: { light?: boolean; iconClass?: string }) {
  return (<Link href="/" className="flex items-center gap-2 font-display text-xl"><Landmark className={cn("h-6 w-6", iconClass || "text-terracotta")} aria-hidden /><span className={light ? "text-ivory" : "text-forest"}>HeritageHub</span></Link>);
}

export function PublicNav() {
  const { user } = useUser();
  const { t, lang, setLang } = useI18n();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const links = [["/destinations", t("nav.destinations")], ["/heritage", "Heritage directory"], ["/plan", t("nav.plan")], ["/passes", t("d.passes")], ["/crowd-status", t("nav.crowd")], ["/about", t("nav.about")], ["/contact", t("nav.contact")]];
  const langBtn = <button onClick={() => setLang(lang === "en" ? "hi" : "en")} lang={lang === "en" ? "hi" : "en"} className="rounded-lg border border-forest/25 px-2.5 py-1.5 text-sm hover:bg-forest/10" aria-label={lang === "en" ? "हिन्दी में देखें" : "View in English"}>{t("nav.lang")}</button>;
  const home = user?.role === "admin" ? "/admin" : user?.role === "staff" ? "/staff" : "/dashboard";
  const logout = async () => { try { navigator.serviceWorker?.controller?.postMessage("clear"); } catch { /* no service worker */ } await api("/api/auth/logout", { method: "POST", body: {} }); toast.success("Signed out"); router.push("/"); router.refresh(); location.reload(); };
  return (
    <header className="sticky top-0 z-40 border-b border-forest/10 bg-ivory/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
        <Logo />
        <nav aria-label="Main" className="hidden items-center gap-6 text-sm md:flex">
          {links.map(([h, l]) => <Link key={h} href={h} className="hover:text-terracotta">{l}</Link>)}
        </nav>
        <div className="hidden items-center gap-2 md:flex">
          {user ? (<><Link href={home} className="rounded-lg bg-forest px-3 py-2 text-sm text-ivory hover:bg-forest-700">{t("nav.account")}</Link><button onClick={logout} className="rounded-lg px-3 py-2 text-sm hover:bg-forest/10">{t("nav.signout")}</button></>)
            : (<><Link href="/login" className="rounded-lg px-3 py-2 text-sm hover:bg-forest/10">{t("nav.signin")}</Link><Link href="/register" className="rounded-lg bg-terracotta px-3 py-2 text-sm text-white hover:bg-terracotta-600">{t("nav.register")}</Link></>)}
          {langBtn}
        </div>
        <div className="flex items-center gap-1 md:hidden">{langBtn}<button className="rounded p-2" aria-label={open ? "Close menu" : "Open menu"} aria-expanded={open} onClick={() => setOpen(!open)}>{open ? <X /> : <Menu />}</button></div>
      </div>
      {open && (<div className="space-y-1 border-t border-forest/10 px-4 py-3 md:hidden">
        {links.map(([h, l]) => <Link key={h} href={h} onClick={() => setOpen(false)} className="block rounded px-2 py-2 hover:bg-forest/10">{l}</Link>)}
        {user ? <><Link href={home} onClick={() => setOpen(false)} className="block rounded px-2 py-2 font-medium">My account</Link><button onClick={logout} className="block w-full rounded px-2 py-2 text-left">Sign out</button></>
          : <><Link href="/login" className="block rounded px-2 py-2">Sign in</Link><Link href="/register" className="block rounded px-2 py-2 font-medium text-terracotta">Create account</Link></>}
      </div>)}
    </header>
  );
}

export function Footer() {
  return (
    <footer className="mt-20 bg-forest-900 text-ivory/80">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 md:grid-cols-3">
        <div><Logo light /><p className="mt-3 max-w-xs text-sm">Timed tickets and honest crowd forecasts for India's heritage sites.</p></div>
        <div className="text-sm"><p className="mb-2 font-medium text-ivory">Explore</p><ul className="space-y-1"><li><Link href="/destinations">Destinations</Link></li><li><Link href="/crowd-status">Crowd status</Link></li><li><Link href="/about">About</Link></li></ul></div>
        <p className="text-xs leading-relaxed text-ivory/60">Prototype notice: ticket prices, crowd predictions, ratings and booking data are sample and demonstration data. Payments are simulated. Always confirm current prices, hours and rules with the managing authority before travel.</p>
      </div>
    </footer>
  );
}

type Item = { href: string; label: string; icon: string };
/** Shared dashboard chrome. `tone` gives tourist, staff, operator and admin areas their own identity. */
export function DashShell({ items, title, tone, name, children }: { items: Item[]; title: string; tone: "tourist" | "staff" | "admin"; name: string; children: React.ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const { t, lang, setLang } = useI18n();
  const dark = tone !== "tourist";
  const side = tone === "admin" ? "bg-forest-900 text-ivory" : tone === "staff" ? "bg-terracotta-600 text-white" : "bg-white text-ink border-r border-forest/10";
  const active = (h: string) => (h === items[0].href ? path === h : path.startsWith(h));
  const logout = async () => { try { navigator.serviceWorker?.controller?.postMessage("clear"); } catch { /* no service worker */ } await api("/api/auth/logout", { method: "POST", body: {} }); router.push("/login"); router.refresh(); };
  return (
    <div className="min-h-screen md:flex">
      <aside className={cn("relative md:sticky md:top-0 md:flex md:h-screen md:w-64 md:shrink-0 md:flex-col", side)}>
        {dark && <div className="bg-jali-light pointer-events-none absolute inset-0" aria-hidden />}
        <div className="relative flex items-center justify-between px-5 py-5 md:block"><Logo light={dark} iconClass={tone === "staff" ? "text-white" : undefined} /><p className={cn("hidden pt-2 text-xs font-medium md:inline-block", dark ? "text-white/70" : "text-ink/60")}><span className={cn("rounded-full px-2 py-0.5", dark ? "bg-white/15" : "bg-forest-50 text-forest")}>{t(title as any)}</span></p></div>
        <nav aria-label={t(title as any)} className="relative flex gap-1 overflow-x-auto px-3 pb-3 md:flex-1 md:flex-col md:gap-0.5 md:overflow-y-auto md:overflow-x-visible">
          {items.map((i) => { const Icon = ICONS[i.icon] || Home; const on = active(i.href); return (
            <Link key={i.href} href={i.href} aria-current={on ? "page" : undefined} className={cn("relative flex shrink-0 items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm transition-colors", on ? (dark ? "bg-white/15 font-medium" : "bg-forest text-ivory font-medium shadow-card") : dark ? "text-white/85 hover:bg-white/10" : "hover:bg-forest-50")}>
              {on && dark && <span className="absolute -left-3 top-2 hidden h-6 w-1 rounded-r bg-terracotta md:block" aria-hidden />}<Icon className="h-4 w-4" aria-hidden />{t(i.label as any)}</Link>); })}
        </nav>
        <div className={cn("relative hidden border-t px-4 py-4 text-sm md:block", dark ? "border-white/15" : "border-forest/10")}>
          <div className="flex items-center gap-3"><span className={cn("flex h-9 w-9 items-center justify-center rounded-full font-display text-lg", dark ? "bg-white/20" : "bg-forest text-ivory")}>{name.trim()[0]?.toUpperCase()}</span><p className="min-w-0 truncate font-medium">{name}</p></div>
          <div className={cn("mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs", dark ? "text-white/80" : "text-ink/70")}><Link href="/" className="hover:underline">{t("d.public")}</Link><button onClick={() => setLang(lang === "en" ? "hi" : "en")} lang={lang === "en" ? "hi" : "en"} className="hover:underline">{t("nav.lang")}</button><button onClick={logout} className="flex items-center gap-1 hover:underline"><LogOut className="h-3 w-3" aria-hidden />{t("d.signout")}</button></div>
        </div>
      </aside>
      <main id="main" tabIndex={-1} className="min-w-0 flex-1 bg-ivory p-4 outline-none md:p-9"><div className="mx-auto max-w-6xl">{children}</div></main>
    </div>
  );
}
