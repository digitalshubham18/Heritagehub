"use client";
import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2, X, AlertTriangle, Inbox, Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";

const button = cva(
  "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-terracotta disabled:opacity-50 disabled:pointer-events-none",
  {
    variants: {
      variant: {
        primary: "bg-forest text-ivory hover:bg-forest-700",
        accent: "bg-terracotta text-white hover:bg-terracotta-600",
        outline: "border border-forest/30 text-forest hover:bg-forest-50",
        ghost: "text-forest hover:bg-forest-50",
        danger: "bg-red-700 text-white hover:bg-red-800",
      },
      size: { sm: "h-8 px-3 text-sm", md: "h-10 px-4 text-sm", lg: "h-12 px-6 text-base" },
    },
    defaultVariants: { variant: "primary", size: "md" },
  }
);
export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof button> { loading?: boolean }
export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, loading, children, disabled, ...p }, ref) => (
  <button ref={ref} className={cn(button({ variant, size }), className)} disabled={disabled || loading} {...p}>
    {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}{children}
  </button>
));
Button.displayName = "Button";

export const Card = ({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) => <div className={cn("rounded-2xl border border-forest/10 bg-white shadow-card", className)} {...p} />;
export const Badge = ({ className, ...p }: React.HTMLAttributes<HTMLSpanElement>) => <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium", className)} {...p} />;

const field = "w-full rounded-lg border border-forest/25 bg-white px-3 py-2 text-sm text-ink placeholder:text-ink/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta aria-[invalid=true]:border-red-600";
export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(({ className, ...p }, r) => <input ref={r} className={cn(field, "h-10", className)} {...p} />);
Input.displayName = "Input";
/** A password field with a show/hide button, so people can check what they typed (useful on phones). Hides again on its own when the field loses focus. */
export const PasswordInput = React.forwardRef<HTMLInputElement, Omit<React.InputHTMLAttributes<HTMLInputElement>, "type">>(({ className, onBlur, ...p }, r) => {
  const [show, setShow] = React.useState(false);
  return (
    <div className="relative">
      <input ref={r} type={show ? "text" : "password"} className={cn(field, "h-10 pr-11", className)} autoCapitalize="none" autoCorrect="off" spellCheck={false} onBlur={(e) => { setShow(false); onBlur?.(e); }} {...p} />
      <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => setShow((v) => !v)} aria-pressed={show} aria-label={show ? "Hide password" : "Show password"} className="absolute right-1 top-1 flex h-8 w-9 items-center justify-center rounded-md text-ink/60 hover:bg-forest-50 hover:text-forest focus-visible:outline focus-visible:outline-2 focus-visible:outline-forest">
        {show ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
      </button>
    </div>
  );
});
PasswordInput.displayName = "PasswordInput";
export const Select = ({ className, ...p }: React.SelectHTMLAttributes<HTMLSelectElement>) => <select className={cn(field, "h-10", className)} {...p} />;
export const Textarea = ({ className, ...p }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea className={cn(field, "min-h-[88px]", className)} {...p} />;

export function Field({ label, error, hint, children, className }: { label: string; error?: string; hint?: string; children: React.ReactNode; className?: string }) {
  const id = React.useId();
  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={id} className="text-sm font-medium text-ink">{label}</label>
      {React.isValidElement(children) ? React.cloneElement(children as React.ReactElement<any>, { id, "aria-invalid": !!error, "aria-describedby": error ? id + "-e" : undefined }) : children}
      {hint && !error && <p className="text-xs text-ink/60">{hint}</p>}
      {error && <p id={id + "-e"} role="alert" className="text-xs text-red-700">{error}</p>}
    </div>
  );
}

export const Skeleton = ({ className }: { className?: string }) => <div className={cn("skeleton rounded-xl", className)} aria-hidden />;
export const PageSkeleton = () => (<div className="space-y-4" role="status" aria-label="Loading"><Skeleton className="h-8 w-1/3" /><Skeleton className="h-32" /><Skeleton className="h-32" /></div>);

export function Empty({ title, children, action }: { title: string; children?: React.ReactNode; action?: React.ReactNode }) {
  return (<div className="flex flex-col items-center rounded-2xl border border-dashed border-forest/25 bg-white/50 px-6 py-12 text-center"><span className="mb-3 flex h-14 w-12 items-center justify-center arch bg-forest-50"><Inbox className="h-6 w-6 text-forest/60" aria-hidden /></span><p className="font-display text-lg font-medium">{title}</p>{children && <p className="mt-1 max-w-sm text-sm text-ink/70">{children}</p>}{action && <div className="mt-4">{action}</div>}</div>);
}
export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (<div role="alert" className="flex flex-col items-center rounded-xl border border-red-200 bg-red-50 px-6 py-10 text-center"><AlertTriangle className="mb-3 h-8 w-8 text-red-700" aria-hidden /><p className="font-medium text-red-900">{message}</p>{onRetry && <Button variant="outline" className="mt-4" onClick={onRetry}>Try again</Button>}</div>);
}

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
/** Accessible dialog: focus moves in on open, Tab is trapped, Escape closes, focus returns to the trigger on close. */
export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode; wide?: boolean }) {
  const ref = React.useRef<HTMLDivElement>(null);
  const closeRef = React.useRef(onClose);
  closeRef.current = onClose;
  React.useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    (ref.current?.querySelector<HTMLElement>(FOCUSABLE) || ref.current)?.focus();
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") return closeRef.current();
      if (e.key !== "Tab" || !ref.current) return;
      const els = Array.from(ref.current.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (!els.length) return;
      const first = els[0], last = els[els.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    window.addEventListener("keydown", h);
    return () => { window.removeEventListener("keydown", h); prev?.focus?.(); };
  }, [open]);
  if (!open) return null;
  return (
    <div role="presentation" className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/50 p-4 sm:items-center" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label={title} className={cn("w-full rounded-xl bg-ivory p-6 shadow-xl outline-none", wide ? "max-w-3xl" : "max-w-md")}>
        <div className="mb-4 flex items-start justify-between gap-4"><h2 className="font-display text-xl">{title}</h2><button onClick={onClose} aria-label="Close" className="rounded p-1 hover:bg-forest/10"><X className="h-5 w-5" /></button></div>
        {children}
      </div>
    </div>
  );
}

/** Promise-based confirmation dialog: `if (await confirm({...})) ...` and render `dialog` once. */
export function useConfirm() {
  const [state, setState] = React.useState<{ title: string; body?: string; confirmLabel?: string; danger?: boolean } | null>(null);
  const resolver = React.useRef<(v: boolean) => void>();
  const confirm = React.useCallback((o: { title: string; body?: string; confirmLabel?: string; danger?: boolean }) => new Promise<boolean>((res) => { resolver.current = res; setState(o); }), []);
  const close = (v: boolean) => { resolver.current?.(v); setState(null); };
  const dialog = (
    <Modal open={!!state} onClose={() => close(false)} title={state?.title || ""}>
      {state?.body && <p className="mb-5 text-sm text-ink/80">{state.body}</p>}
      <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => close(false)}>Keep as is</Button><Button variant={state?.danger ? "danger" : "primary"} onClick={() => close(true)}>{state?.confirmLabel || "Confirm"}</Button></div>
    </Modal>
  );
  return { confirm, dialog };
}

export function Stat({ label, value, sub, tone, icon: Icon }: { label: string; value: React.ReactNode; sub?: string; tone?: "warn"; icon?: React.ComponentType<{ className?: string }> }) {
  return (
    <Card className={cn("relative overflow-hidden p-5", tone === "warn" && "border-terracotta/40 bg-terracotta-50")}>
      {Icon && <span className={cn("absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full", tone === "warn" ? "bg-terracotta/15 text-terracotta" : "bg-forest-50 text-forest")}><Icon className="h-4.5 w-4.5" aria-hidden /></span>}
      <p className="pr-10 text-sm text-ink/70">{label}</p><p className="mt-2 font-display text-3xl tracking-tight">{value}</p>{sub && <p className="mt-1 text-xs text-ink/60">{sub}</p>}
    </Card>
  );
}
export const statusTone: Record<string, string> = {
  confirmed: "bg-emerald-100 text-emerald-900", completed: "bg-forest-50 text-forest", pending: "bg-amber-100 text-amber-900",
  cancelled: "bg-red-100 text-red-900", expired: "bg-stone-200 text-stone-800", paid: "bg-emerald-100 text-emerald-900",
  unpaid: "bg-amber-100 text-amber-900", failed: "bg-red-100 text-red-900", refunded: "bg-sky-100 text-sky-900", partially_refunded: "bg-sky-100 text-sky-900",
};
export const StatusBadge = ({ s }: { s: string }) => <Badge className={statusTone[s] || "bg-stone-100"}>{s.replace("_", " ")}</Badge>;
