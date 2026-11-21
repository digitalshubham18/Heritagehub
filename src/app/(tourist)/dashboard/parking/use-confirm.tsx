"use client";
import { useCallback, useRef, useState } from "react";
import { Button, Modal } from "@/components/ui";

/** Tiny promise-based confirm dialog (title and message), for pages that need a custom message per action. */
export function useConfirmDialog() {
  const [st, setSt] = useState<{ title: string; message: string } | null>(null);
  const res = useRef<((v: boolean) => void) | null>(null);
  const ask = useCallback((title: string, message: string) => new Promise<boolean>((resolve) => { res.current = resolve; setSt({ title, message }); }), []);
  const done = (v: boolean) => { res.current?.(v); res.current = null; setSt(null); };
  const dialog = <Modal open={!!st} onClose={() => done(false)} title={st?.title || ""}><p className="text-sm text-ink/80">{st?.message}</p><div className="mt-5 flex justify-end gap-2"><Button variant="outline" onClick={() => done(false)}>Keep it</Button><Button variant="danger" onClick={() => done(true)}>Yes, cancel</Button></div></Modal>;
  return { ask, dialog };
}
