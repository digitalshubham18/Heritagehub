export const haversineKm = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
  const R = 6371, rad = (x: number) => (x * Math.PI) / 180, dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
};
type Mode = "driving" | "transit" | "walking" | "bicycling";
/** Google Maps directions link. With no origin, the maps app uses the visitor's current location. */
export const googleDirections = (to: { lat: number; lng: number }, mode: Mode = "driving", from?: { lat: number; lng: number }) =>
  `https://www.google.com/maps/dir/?api=1&destination=${to.lat},${to.lng}&travelmode=${mode}${from ? `&origin=${from.lat},${from.lng}` : ""}`;
export const osmDirections = (to: { lat: number; lng: number }, from?: { lat: number; lng: number }) =>
  `https://www.openstreetmap.org/directions?engine=fossgis_osrm_car&route=${from ? `${from.lat}%2C${from.lng}` : ""}%3B${to.lat}%2C${to.lng}`;
export const appleDirections = (to: { lat: number; lng: number }) => `https://maps.apple.com/?daddr=${to.lat},${to.lng}&dirflg=d`;
/** Rough road distance and drive time from a straight-line distance (roads are about 1.35x longer; 35 km/h average). A guide only. */
export const roughDrive = (km: number) => ({ roadKm: Math.round(km * 1.35), minutes: Math.max(5, Math.round(((km * 1.35) / 35) * 60)) });
