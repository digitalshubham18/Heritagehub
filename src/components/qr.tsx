"use client";
import { useEffect, useState } from "react";
import QRCode from "qrcode";

/** Renders any text as a QR code in the browser (parking tickets, reservation codes). */
export function QR({ value, size = 160, className, label }: { value: string; size?: number; className?: string; label?: string }) {
  const [src, setSrc] = useState("");
  useEffect(() => { let on = true; QRCode.toDataURL(value, { margin: 1, width: size * 2, color: { dark: "#173B2C", light: "#FFFFFF" } }).then((s) => on && setSrc(s)).catch(() => {}); return () => { on = false; }; }, [value, size]);
  // eslint-disable-next-line @next/next/no-img-element
  return src ? <img src={src} width={size} height={size} alt={label || `QR code for ${value}`} className={className} /> : <div style={{ width: size, height: size }} className="skeleton rounded-xl" aria-hidden />;
}
