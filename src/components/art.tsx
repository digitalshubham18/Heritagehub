import { useId } from "react";

/**
 * Original illustrated heritage scenes (SVG). They give every destination a distinctive, on-brand image even when no
 * photograph is available, and are drawn from simple geometry so they stay crisp at any size.
 */
type Pal = { sky: [string, string]; sun: string; far: string; mid: string; near: string; shade: string; ground: string };
const PALS: Pal[] = [
  { sky: ["#BFD9E3", "#FBE7CE"], sun: "#F6B67C", far: "#B5C6CC", mid: "#E3DACB", near: "#F8F2E7", shade: "#BDB29F", ground: "#8FAE9B" },
  { sky: ["#F4C08E", "#E8895F"], sun: "#FFE6B0", far: "#C97F5C", mid: "#B65F3E", near: "#9F4A2D", shade: "#6B2E1D", ground: "#59291E" },
  { sky: ["#1F4D3A", "#E8BC7E"], sun: "#F8D98C", far: "#2F6B52", mid: "#255A45", near: "#E2D0A8", shade: "#8F7C58", ground: "#173B2C" },
  { sky: ["#F2CDBE", "#F9E8CB"], sun: "#F8B56C", far: "#DBA391", mid: "#CC8070", near: "#EBAB9C", shade: "#A65D50", ground: "#8B4B3F" },
  { sky: ["#2C3160", "#D07E5C"], sun: "#F4C37A", far: "#41457A", mid: "#353963", near: "#DDB9A0", shade: "#5B4B62", ground: "#232648" },
];
const BY_SLUG: Record<string, number> = { "taj-mahal": 0, "agra-fort": 1, "red-fort": 1, "amber-fort": 3, "qutub-minar": 1, "vittala-temple-hampi": 2, "national-museum-delhi": 4 };
const hash = (s: string) => { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; };

export type ArtType = "monument" | "fort" | "museum" | "temple" | "archaeological" | "palace";

const arch = (x: number, y: number, w: number, h: number) => `M${x} ${y + h}V${y + h * 0.42}Q${x} ${y} ${x + w / 2} ${y - h * 0.12}Q${x + w} ${y} ${x + w} ${y + h * 0.42}V${y + h}Z`;
function Dome({ cx, y, r, fill, shade }: { cx: number; y: number; r: number; fill: string; shade: string }) {
  return (<g><path d={`M${cx - r} ${y}C${cx - r} ${y - r * 1.5} ${cx - r * 0.2} ${y - r * 1.75} ${cx} ${y - r * 2.15}C${cx + r * 0.2} ${y - r * 1.75} ${cx + r} ${y - r * 1.5} ${cx + r} ${y}Z`} fill={fill} />
    <rect x={cx - r * 1.08} y={y - 2} width={r * 2.16} height={Math.max(4, r * 0.1)} fill={shade} /><rect x={cx - 1.5} y={y - r * 2.15 - 15} width={3} height={16} fill={shade} /><circle cx={cx} cy={y - r * 2.15 - 17} r={3.2} fill={shade} /></g>);
}
function Minaret({ x, top, base, w, p }: { x: number; top: number; base: number; w: number; p: Pal }) {
  const h = base - top;
  return (<g><rect x={x - w / 2} y={top} width={w} height={h} fill={p.near} /><rect x={x - w / 2 - 3} y={top + h * 0.3} width={w + 6} height={5} fill={p.shade} /><rect x={x - w / 2 - 3} y={top + h * 0.62} width={w + 6} height={5} fill={p.shade} />
    <rect x={x + w * 0.15} y={top} width={w * 0.35} height={h} fill={p.shade} opacity=".18" /><Dome cx={x} y={top} r={w * 0.62} fill={p.near} shade={p.shade} /></g>);
}

function Scene({ type, p, id }: { type: ArtType; p: Pal; id: string }) {
  if (type === "fort") {
    const merlons = Array.from({ length: 24 }, (_, i) => 60 + i * 29);
    return (<g>
      <path d="M0 500V380Q200 320 400 346Q600 318 800 378V500Z" fill={p.mid} />
      <g fill={p.near}><rect x="60" y="262" width="680" height="110" />{merlons.map((x) => <rect key={x} x={x} y="246" width="17" height="17" />)}
        {[110, 400, 690].map((x) => <g key={x}><rect x={x - 42} y="214" width="84" height="160" /><rect x={x - 48} y="200" width="96" height="16" />{[-48, -30, -12, 6, 24, 36].map((d) => <rect key={d} x={x + d} y="186" width="12" height="15" />)}</g>)}</g>
      <Dome cx={400} y={196} r={34} fill={p.near} shade={p.shade} />
      <g fill={p.shade}><path d={arch(362, 298, 76, 76)} />{[110, 690].map((x) => <path key={x} d={arch(x - 12, 250, 24, 48)} />)}{[190, 250, 550, 610].map((x) => <path key={x} d={arch(x - 9, 290, 18, 40)} opacity=".8" />)}</g>
      <rect x="0" y="372" width="800" height="14" fill={p.shade} opacity=".35" /></g>);
  }
  if (type === "museum") {
    return (<g>
      <Dome cx={400} y={238} r={64} fill={p.mid} shade={p.shade} />
      <g fill={p.near}><rect x="150" y="238" width="500" height="26" /><path d="M140 240L400 168L660 240Z" /><rect x="170" y="264" width="460" height="14" />
        {Array.from({ length: 9 }, (_, i) => <rect key={i} x={186 + i * 52} y="278" width="18" height="102" />)}
        <rect x="140" y="380" width="520" height="14" /><rect x="120" y="394" width="560" height="14" /><rect x="100" y="408" width="600" height="14" /></g>
      <g fill={p.shade} opacity=".22">{Array.from({ length: 9 }, (_, i) => <rect key={i} x={196 + i * 52} y="278" width="8" height="102" />)}</g>
      <path d={arch(366, 290, 68, 90)} fill={p.shade} /><circle cx="400" cy="212" r="14" fill={p.shade} /></g>);
  }
  if (type === "temple") {
    return (<g>
      <g>{Array.from({ length: 8 }, (_, i) => { const w = 300 - i * 32, y = 360 - (i + 1) * 36; return (<g key={i}><path d={`M${400 - w / 2} ${y + 36}L${400 - w / 2 + 10} ${y}H${400 + w / 2 - 10}L${400 + w / 2} ${y + 36}Z`} fill={i % 2 ? p.mid : p.near} />
        {Array.from({ length: Math.max(1, Math.floor(w / 46)) }, (_, k) => <rect key={k} x={400 - w / 2 + 22 + k * ((w - 44) / Math.max(1, Math.floor(w / 46)))} y={y + 12} width="12" height="18" rx="6" fill={p.shade} opacity=".55" />)}</g>); })}
        <rect x="396" y="40" width="8" height="30" fill={p.shade} /><circle cx="400" cy="38" r="9" fill={p.shade} /><path d="M386 70H414L400 44Z" fill={p.mid} /></g>
      <g fill={p.near}><rect x="90" y="318" width="170" height="62" /><rect x="540" y="318" width="170" height="62" /><path d="M80 320H270L255 296H95Z" fill={p.mid} /><path d="M530 320H720L705 296H545Z" fill={p.mid} /></g>
      <g fill={p.shade} opacity=".6">{[0, 1, 2, 3].map((i) => <rect key={i} x={106 + i * 38} y="332" width="12" height="48" />)}{[0, 1, 2, 3].map((i) => <rect key={i} x={556 + i * 38} y="332" width="12" height="48" />)}</g>
      <path d={arch(374, 322, 52, 58)} fill={p.shade} /><rect x="60" y="380" width="680" height="12" fill={p.near} /><rect x="40" y="392" width="720" height="12" fill={p.mid} /></g>);
  }
  if (type === "archaeological") {
    const bands = [0.2, 0.38, 0.56, 0.74];
    return (<g>
      <path d="M355 380L372 70H428L445 380Z" fill={p.near} /><path d="M400 70H428L445 380H400Z" fill={p.shade} opacity=".18" />
      {bands.map((b) => { const y = 380 - b * 310, w = 90 - b * 40; return <rect key={b} x={400 - w / 2 - 6} y={y} width={w + 12} height="9" fill={p.shade} />; })}
      <Dome cx={400} y={72} r={22} fill={p.mid} shade={p.shade} />
      <g fill={p.near}><rect x="40" y="320" width="270" height="60" />{[0, 1, 2].map((i) => <rect key={i} x={50 + i * 90} y="270" width="22" height="50" />)}<rect x="490" y="300" width="270" height="80" />{[0, 1, 2].map((i) => <rect key={i} x={680 - i * 90} y="250" width="22" height="50" />)}</g>
      <g fill={p.shade}>{[0, 1, 2].map((i) => <path key={i} d={arch(70 + i * 80, 330, 44, 50)} />)}{[0, 1, 2].map((i) => <path key={i} d={arch(520 + i * 80, 320, 44, 60)} />)}</g>
      <rect x="168" y="238" width="10" height="82" fill={p.shade} opacity=".7" /><rect x="0" y="378" width="800" height="14" fill={p.shade} opacity=".3" /></g>);
  }
  if (type === "palace") {
    return (<g>
      <g fill={p.near}><rect x="110" y="250" width="580" height="130" /><rect x="90" y="236" width="620" height="16" />
        {[0, 1, 2, 3].map((i) => <rect key={i} x={118 + i * 148} y="230" width="14" height="8" />)}
        <rect x="70" y="200" width="70" height="180" /><rect x="660" y="200" width="70" height="180" /></g>
      <Dome cx={400} y={236} r={46} fill={p.near} shade={p.shade} /><Dome cx={270} y={236} r={26} fill={p.near} shade={p.shade} /><Dome cx={530} y={236} r={26} fill={p.near} shade={p.shade} />
      <Dome cx={105} y={200} r={26} fill={p.near} shade={p.shade} /><Dome cx={695} y={200} r={26} fill={p.near} shade={p.shade} />
      <g fill={p.shade}>{Array.from({ length: 7 }, (_, i) => <path key={i} d={arch(156 + i * 72, 286, 40, 94)} />)}{[88, 678].map((x) => <path key={x} d={arch(x, 230, 34, 60)} />)}</g>
      <rect x="90" y="380" width="620" height="12" fill={p.mid} /><rect x="70" y="392" width="660" height="12" fill={p.near} opacity=".8" /></g>);
  }
  // monument (Taj-like): domed tomb with minarets and a reflecting pool
  const body = (
    <g id={`b${id}`}>
      <rect x="130" y="364" width="540" height="28" fill={p.near} /><rect x="110" y="392" width="580" height="12" fill={p.mid} />
      <Minaret x={178} top={176} base={364} w={18} p={p} /><Minaret x={622} top={176} base={364} w={18} p={p} />
      <rect x="290" y="236" width="220" height="130" fill={p.near} /><rect x="440" y="236" width="70" height="130" fill={p.shade} opacity=".14" />
      <Dome cx={400} y={236} r={66} fill={p.near} shade={p.shade} />
      {[320, 480].map((x) => <g key={x}><rect x={x - 11} y={206} width="22" height="30" fill={p.near} /><Dome cx={x} y={206} r={13} fill={p.near} shade={p.shade} /></g>)}
      <g fill={p.shade}><path d={arch(366, 262, 68, 104)} />{[304, 472].map((x) => <path key={x} d={arch(x, 290, 24, 60)} opacity=".85" />)}</g>
    </g>
  );
  return (<g><defs><clipPath id={`pool${id}`}><rect x="0" y="404" width="800" height="96" /></clipPath></defs>
    <rect x="0" y="404" width="800" height="96" fill={p.sky[1]} opacity=".55" />
    {body}
    <g clipPath={`url(#pool${id})`} opacity=".28"><use href={`#b${id}`} transform="translate(0 808) scale(1 -1)" /></g>
    {[60, 120, 680, 740].map((x, i) => <ellipse key={x} cx={x} cy={i % 2 ? 372 : 366} rx="16" ry={i % 2 ? 50 : 58} fill={p.far} />)}</g>);
}

export function HeritageArt({ slug, type = "monument", variant = 0, className }: { slug: string; type?: ArtType | string; variant?: number; className?: string }) {
  const id = useId().replace(/:/g, "");
  const base = BY_SLUG[slug] ?? hash(slug) % PALS.length;
  const p = PALS[(base + variant) % PALS.length];
  const t = (["monument", "fort", "museum", "temple", "archaeological", "palace"].includes(type) ? type : "monument") as ArtType;
  const sunX = 560 - variant * 220 + (hash(slug) % 80);
  return (
    <svg viewBox="0 0 800 500" preserveAspectRatio="xMidYMid slice" className={className} role="img" aria-label={`Illustration of a ${t} at ${variant % 2 ? "sunset" : "dawn"}`}>
      <defs>
        <linearGradient id={`sky${id}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={p.sky[0]} /><stop offset="1" stopColor={p.sky[1]} /></linearGradient>
        <radialGradient id={`sun${id}`}><stop offset="0" stopColor={p.sun} stopOpacity="1" /><stop offset=".45" stopColor={p.sun} stopOpacity=".35" /><stop offset="1" stopColor={p.sun} stopOpacity="0" /></radialGradient>
        <linearGradient id={`gr${id}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={p.ground} stopOpacity="0" /><stop offset="1" stopColor={p.ground} stopOpacity=".9" /></linearGradient>
      </defs>
      <rect width="800" height="500" fill={`url(#sky${id})`} />
      <circle cx={sunX} cy="190" r="170" fill={`url(#sun${id})`} /><circle cx={sunX} cy="190" r="34" fill={p.sun} />
      <path d="M0 330Q120 280 240 318T480 306T800 322V500H0Z" fill={p.far} opacity=".55" />
      <g stroke={p.shade} strokeWidth="2" fill="none" opacity=".5" strokeLinecap="round"><path d="M120 110q6-7 12 0q6-7 12 0" /><path d="M170 82q5-6 10 0q5-6 10 0" /><path d="M660 120q6-7 12 0q6-7 12 0" /></g>
      <Scene type={t} p={p} id={id} />
      <rect y="380" width="800" height="120" fill={`url(#gr${id})`} />
    </svg>
  );
}
