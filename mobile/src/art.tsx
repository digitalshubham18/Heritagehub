import Svg, { Circle, Defs, G, LinearGradient, Path, Rect, Stop } from "react-native-svg";
import { C } from "./theme";

/** Simplified version of the web app's illustrated heritage scenes, so cards look the same on both. */
const PALS: [string, string, string, string][] = [["#BFD9E3", "#FBE7CE", "#F8F2E7", "#BDB29F"], ["#F4C08E", "#E8895F", "#9F4A2D", "#6B2E1D"], ["#1F4D3A", "#E8BC7E", "#E2D0A8", "#8F7C58"], ["#F2CDBE", "#F9E8CB", "#EBAB9C", "#A65D50"], ["#2C3160", "#D07E5C", "#DDB9A0", "#5B4B62"]];
const BY: Record<string, number> = { "taj-mahal": 0, "agra-fort": 1, "red-fort": 1, "amber-fort": 3, "qutub-minar": 1, "vittala-temple-hampi": 2, "national-museum-delhi": 4 };
const hash = (s: string) => { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; };
const dome = (cx: number, y: number, r: number) => `M${cx - r} ${y}C${cx - r} ${y - r * 1.5} ${cx - r * 0.2} ${y - r * 1.75} ${cx} ${y - r * 2.15}C${cx + r * 0.2} ${y - r * 1.75} ${cx + r} ${y - r * 1.5} ${cx + r} ${y}Z`;
const arch = (x: number, y: number, w: number, h: number) => `M${x} ${y + h}V${y + h * 0.42}Q${x} ${y} ${x + w / 2} ${y - h * 0.12}Q${x + w} ${y} ${x + w} ${y + h * 0.42}V${y + h}Z`;

export function Art({ slug, type = "monument", height = 150 }: { slug: string; type?: string; height?: number }) {
  const [s0, s1, near, shade] = PALS[BY[slug] ?? hash(slug) % PALS.length];
  return (
    <Svg width="100%" height={height} viewBox="0 0 800 500" preserveAspectRatio="xMidYMid slice">
      <Defs><LinearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><Stop offset="0" stopColor={s0} /><Stop offset="1" stopColor={s1} /></LinearGradient></Defs>
      <Rect width="800" height="500" fill="url(#sky)" />
      <Circle cx="590" cy="190" r="36" fill="#F8D98C" opacity="0.9" />
      <Path d="M0 330Q120 280 240 318T480 306T800 322V500H0Z" fill={shade} opacity="0.25" />
      {type === "fort" || type === "palace" ? (
        <G fill={near}><Rect x="60" y="262" width="680" height="120" />{Array.from({ length: 12 }, (_, i) => <Rect key={i} x={60 + i * 58} y="244" width="26" height="20" />)}<Rect x="320" y="200" width="160" height="182" /><Path d={dome(400, 200, 44)} /><Path d={arch(364, 296, 72, 86)} fill={shade} /></G>
      ) : type === "temple" ? (
        <G>{Array.from({ length: 7 }, (_, i) => <Rect key={i} x={400 - (150 - i * 20)} y={340 - (i + 1) * 36} width={(150 - i * 20) * 2} height="34" fill={i % 2 ? shade : near} />)}<Rect x="80" y="360" width="640" height="26" fill={near} /></G>
      ) : type === "archaeological" ? (
        <G fill={near}><Path d="M355 380L372 70H428L445 380Z" /><Rect x="40" y="320" width="270" height="60" /><Rect x="490" y="300" width="270" height="80" /></G>
      ) : type === "museum" ? (
        <G fill={near}><Path d="M140 240L400 168L660 240Z" /><Rect x="170" y="250" width="460" height="14" />{Array.from({ length: 9 }, (_, i) => <Rect key={i} x={186 + i * 52} y="270" width="18" height="110" />)}<Rect x="120" y="380" width="560" height="22" /></G>
      ) : (
        <G fill={near}><Rect x="290" y="236" width="220" height="130" /><Path d={dome(400, 236, 66)} /><Rect x="170" y="176" width="18" height="190" /><Rect x="612" y="176" width="18" height="190" /><Path d={arch(366, 262, 68, 104)} fill={shade} /><Rect x="110" y="366" width="580" height="22" /></G>
      )}
    </Svg>
  );
}
