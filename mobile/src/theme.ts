export const C = { ivory: "#FAF6EE", ivory100: "#F3ECDD", forest: "#1F4D3A", forest50: "#E8F0EB", forest900: "#0F271D", terracotta: "#B8532E", ink: "#26261F", muted: "#6B6B62", line: "#1F4D3A22", white: "#FFFFFF" };
export const LEVEL = { low: { c: "#3E8E6B", bg: "#D7F2E4", t: "Low", bars: 1 }, moderate: { c: "#D9A441", bg: "#FBEFC9", t: "Moderate", bars: 2 }, high: { c: "#D9722E", bg: "#FCE2CC", t: "High", bars: 3 }, very_high: { c: "#A8282B", bg: "#F8D7D7", t: "Very High", bars: 4 } } as const;
export type Level = keyof typeof LEVEL;
