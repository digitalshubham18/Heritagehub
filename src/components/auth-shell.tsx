import Link from "next/link";
import { HeritageArt } from "./art";

/** Two-panel sign-in layout: illustrated side with a short promise, form on the right. */
export function AuthShell({ title, subtitle, children, art = "taj-mahal", footer }: { title: string; subtitle?: string; children: React.ReactNode; art?: string; footer?: React.ReactNode }) {
  return (
    <div className="grid min-h-[calc(100vh-4rem)] lg:grid-cols-[1fr_1.05fr]">
      <aside className="relative hidden overflow-hidden bg-forest text-ivory lg:block" aria-hidden>
        <HeritageArt slug={art} type="monument" variant={2} className="absolute inset-0 h-full w-full" />
        <div className="absolute inset-0 bg-gradient-to-t from-forest-900/90 via-forest-900/20 to-transparent" />
        <div className="bg-jali-light absolute inset-0" />
        <div className="relative flex h-full flex-col justify-end p-12"><p className="font-display text-4xl leading-tight">Walk into history,<br />not a queue.</p><p className="mt-3 max-w-sm text-ivory/80">Timed tickets, honest crowd forecasts and one QR for the gate.</p></div>
      </aside>
      <section className="flex items-center justify-center bg-ivory px-4 py-12">
        <div className="w-full max-w-md">
          <h1 className="text-4xl">{title}</h1>
          {subtitle && <p className="mt-2 text-ink/70">{subtitle}</p>}
          <div className="mt-8 rounded-2xl border border-forest/10 bg-white p-6 shadow-card sm:p-8">{children}</div>
          {footer && <div className="mt-5 text-sm">{footer}</div>}
        </div>
      </section>
    </div>
  );
}
export const AuthLink = ({ href, children }: { href: string; children: React.ReactNode }) => <Link href={href} className="text-terracotta underline">{children}</Link>;
