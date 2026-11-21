import Link from "next/link";
import { BarChart3, Building2, Cpu, CarFront, Receipt, ScanLine, ShieldCheck, Ticket, Users } from "lucide-react";
import { HeritageArt } from "@/components/art";
import { Reveal } from "@/components/reveal";

export const metadata = { title: "For heritage operators" };
const FEATURES = [
  [Building2, "Your sites, your team", "Each operator gets its own dashboard, staff accounts and settings. Managers only ever see their own destinations."],
  [ScanLine, "Fast gates", "Scan QR tickets and season passes, admit groups in parts, and keep scanning when the connection drops."],
  [Cpu, "Gate hardware", "Connect turnstiles, QR readers and thermal printers over a simple HTTPS protocol with per-device keys."],
  [Ticket, "Counter, online and passes", "Walk-in sales, timed online tickets, season passes and group bookings share one capacity engine."],
  [CarFront, "Parking", "Track cars, two-wheelers and coaches in and out, with fees by time parked and live free-space counts."],
  [Receipt, "Invoices and settlements", "Sequential invoices, GST on fees, refunds, commission and clear payout figures per site."],
  [BarChart3, "Crowd intelligence", "Forecasts, utilisation, peak hours and predicted-versus-actual reports to plan staffing."],
  [Users, "Group and school desk", "Review requests, set concessions and hold seats for the whole party with one decision."],
  [ShieldCheck, "Audit trail", "Every administrative change is logged, and every entry and scan keeps its history."],
];
export default function Operators() {
  return (
    <>
      <section className="relative overflow-hidden bg-forest text-ivory">
        <HeritageArt slug="red-fort" type="fort" variant={2} className="absolute inset-0 h-full w-full opacity-45" />
        <div className="bg-jali-light absolute inset-0" aria-hidden />
        <div className="relative mx-auto max-w-6xl px-4 py-24"><h1 className="max-w-2xl text-4xl leading-tight sm:text-6xl">Run every gate, slot and rupee from one place.</h1><p className="mt-5 max-w-xl text-lg text-ivory/85">HeritageHub gives operators of forts, monuments and museums the tools to sell tickets, manage crowds and settle accounts, without a separate system for each job.</p>
          <div className="mt-8 flex flex-wrap gap-3"><Link href="/contact" className="rounded-xl bg-terracotta px-6 py-3.5 font-medium text-white hover:bg-terracotta-600">Talk to us</Link><Link href="/login" className="rounded-xl border border-ivory/50 px-6 py-3.5 hover:bg-ivory hover:text-forest">Operator sign in</Link></div></div>
      </section>
      <section className="mx-auto max-w-6xl px-4 py-20">
        <Reveal><h2 className="text-3xl sm:text-4xl">What operators get</h2></Reveal>
        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{FEATURES.map(([Icon, h, d], i) => <Reveal key={h as string} delay={(i % 3) * 70} className="card-lift rounded-3xl border border-forest/10 bg-white p-6 shadow-card"><span className="flex h-11 w-11 items-center justify-center rounded-full bg-forest-50 text-forest"><Icon className="h-5 w-5" aria-hidden /></span><h3 className="mt-4 text-xl">{h as string}</h3><p className="mt-2 text-sm leading-relaxed text-ink/80">{d as string}</p></Reveal>)}</div>
        <p className="mt-10 rounded-2xl bg-ivory-100 p-5 text-sm text-ink/75">This is an independent prototype. Operators shown in the demo are fictional. Real deployments need agreements with each managing authority, verified prices and a review of invoicing and tax treatment by an accountant.</p>
      </section>
    </>
  );
}
