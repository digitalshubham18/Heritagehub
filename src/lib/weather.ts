/** Weather from Open-Meteo (free, no key). Fetched on the server and cached 15 minutes. */
export const WMO: Record<number, string> = { 0: "Clear sky", 1: "Mostly clear", 2: "Partly cloudy", 3: "Overcast", 45: "Fog", 48: "Fog", 51: "Light drizzle", 53: "Drizzle", 55: "Heavy drizzle", 61: "Light rain", 63: "Rain", 65: "Heavy rain", 66: "Freezing rain", 67: "Freezing rain", 71: "Light snow", 73: "Snow", 75: "Heavy snow", 80: "Rain showers", 81: "Rain showers", 82: "Violent showers", 95: "Thunderstorm", 96: "Thunderstorm with hail", 99: "Thunderstorm with hail" };
export type DayWeather = { date: string; summary: string; code: number; tempMaxC: number; tempMinC: number; rainChancePct: number; uvMax: number; advice: string[] };

export function adviceFor(w: { tempMaxC: number; rainChancePct: number; uvMax: number; code: number }) {
  const a: string[] = [];
  if (w.tempMaxC >= 40) a.push("Extreme heat: visit early morning, carry water, avoid the 12 to 4 pm window.");
  else if (w.tempMaxC >= 35) a.push("Hot day: carry water and a hat, and book an early or late slot.");
  if (w.tempMaxC <= 8) a.push("Cold: carry warm clothes, early mornings can be chilly.");
  if (w.rainChancePct >= 60 || (w.code >= 61 && w.code <= 99)) a.push("Rain likely: carry an umbrella; stone steps can be slippery.");
  if (w.uvMax >= 8) a.push("Very high UV: sunscreen and sunglasses.");
  if (w.code === 45 || w.code === 48) a.push("Fog: views and traffic may be affected in the morning.");
  return a;
}
/** Maps an Open-Meteo `daily` response to simple per-day weather. Pure, so it is easy to test. */
export function mapForecast(j: any): { current?: { tempC: number; summary: string }; days: DayWeather[] } {
  const d = j?.daily;
  const days: DayWeather[] = Array.isArray(d?.time) ? d.time.map((date: string, i: number) => {
    const code = Number(d.weather_code?.[i] ?? 0), base = { tempMaxC: Math.round(d.temperature_2m_max?.[i] ?? 0), tempMinC: Math.round(d.temperature_2m_min?.[i] ?? 0), rainChancePct: Math.round(d.precipitation_probability_max?.[i] ?? 0), uvMax: Math.round((d.uv_index_max?.[i] ?? 0) * 10) / 10, code };
    return { date, summary: WMO[code] || "Mixed conditions", ...base, advice: adviceFor(base) };
  }) : [];
  const c = j?.current;
  return { current: c && typeof c.temperature_2m === "number" ? { tempC: Math.round(c.temperature_2m), summary: WMO[Number(c.weather_code)] || "" } : undefined, days };
}
export async function fetchForecast(lat: number, lng: number) {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,weather_code&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,uv_index_max&timezone=Asia%2FKolkata&forecast_days=16`;
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 4000);
  try {
    const r = await fetch(url, { signal: ctl.signal, next: { revalidate: 900 } });
    if (!r.ok) return null;
    return mapForecast(await r.json());
  } catch { return null; } finally { clearTimeout(t); }
}
