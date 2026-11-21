"use client";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/** Fades content up as it scrolls into view. Content already on screen at load is never hidden. */
export function Reveal({ children, className, delay = 0, as: Tag = "div" }: { children: React.ReactNode; className?: string; delay?: number; as?: any }) {
  const ref = useRef<HTMLElement>(null);
  const [mode, setMode] = useState<"visible" | "hidden" | "in">("visible");
  useEffect(() => {
    const el = ref.current; if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (el.getBoundingClientRect().top < window.innerHeight * 0.95) return;
    setMode("hidden");
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setMode("in"); io.disconnect(); } }, { threshold: 0.12 });
    io.observe(el); return () => io.disconnect();
  }, []);
  return <Tag ref={ref} style={delay ? { transitionDelay: `${delay}ms` } : undefined} className={cn(mode !== "visible" && "reveal", mode === "in" && "in", className)}>{children}</Tag>;
}
