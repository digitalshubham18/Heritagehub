import { cn } from "@/lib/utils";
export const supportTone: Record<string, string> = { open: "bg-amber-100 text-amber-900", in_progress: "bg-sky-100 text-sky-900", resolved: "bg-emerald-100 text-emerald-900", closed: "bg-stone-100 text-stone-700" };
/** The back-and-forth on a support ticket. Visitor messages sit on the left, staff replies on the right. */
export function SupportThread({ messages }: { messages: { from: "visitor" | "staff"; byName?: string; body: string; at: string }[] }) {
  return (
    <ol className="space-y-3" aria-label="Conversation">{messages.map((m, i) => (
      <li key={i} className={cn("max-w-[85%] rounded-2xl px-4 py-3 text-sm", m.from === "staff" ? "ml-auto bg-forest text-ivory" : "bg-ivory-100")}>
        <p className={cn("text-xs", m.from === "staff" ? "text-ivory/75" : "text-ink/60")}>{m.byName || (m.from === "staff" ? "HeritageHub" : "Visitor")} · {new Date(m.at).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</p>
        <p className="mt-1 whitespace-pre-wrap">{m.body}</p></li>))}</ol>
  );
}
