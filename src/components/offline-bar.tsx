"use client";
import { useEffect } from "react";
import { CloudOff, RefreshCw, Trash2, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui";
import { useTx } from "@/lib/i18n";
import { useOnline, type OutboxItem } from "@/lib/offline";

/** Registers the staff service worker once, so the counter and parking pages can be reopened without a connection. */
export function useOfflineShell() {
  useEffect(() => { if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {}); }, []);
}
export function OfflineBar({ pending, conflicts, onSync, onDiscard, onRetry }: { pending: number; conflicts: OutboxItem[]; onSync: () => void; onDiscard: (id: string) => void; onRetry: (id: string) => void }) {
  const tx = useTx();
  const online = useOnline();
  if (online && !pending && !conflicts.length) return null;
  return (
    <div className="space-y-2" role="status" aria-live="polite">
      {(!online || pending > 0) && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
          <CloudOff className="h-4 w-4 shrink-0" aria-hidden />
          <p className="flex-1">{!online ? "You're offline. Entries, exits and sales are saved on this device and will upload by themselves when the connection returns." : `${pending} saved action${pending > 1 ? "s" : ""} waiting to upload.`}{pending > 0 && !online ? ` ${pending} waiting.` : ""}</p>
          {online && pending > 0 && <Button size="sm" variant="outline" onClick={onSync}><RefreshCw className="h-4 w-4" aria-hidden />{tx("Upload now")}</Button>}
        </div>
      )}
      {conflicts.map((c) => (
        <div key={c.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-950">
          <TriangleAlert className="h-4 w-4 shrink-0" aria-hidden />
          <p className="min-w-0 flex-1"><strong>{c.label}</strong> could not be uploaded: {c.error}. It happened at {new Date(c.at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}. Tell your manager, then retry or remove it.</p>
          <Button size="sm" variant="outline" onClick={() => onRetry(c.id)}>{tx("Retry")}</Button><Button size="sm" variant="ghost" onClick={() => onDiscard(c.id)} aria-label={`Remove ${c.label}`}><Trash2 className="h-4 w-4" aria-hidden /></Button>
        </div>
      ))}
    </div>
  );
}
