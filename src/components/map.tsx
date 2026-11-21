"use client";
import "leaflet/dist/leaflet.css";
import { CircleMarker, MapContainer, Popup, TileLayer } from "react-leaflet";

export default function LeafletMap({ lat, lng, name, zoom = 14, points }: { lat: number; lng: number; name: string; zoom?: number; points?: { lat: number; lng: number; name: string }[] }) {
  const pts = points || [{ lat, lng, name }];
  return (
    <MapContainer center={[lat, lng]} zoom={zoom} scrollWheelZoom={false} className="h-72 w-full rounded-xl" aria-label={`Map showing ${name}`}>
      <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      {pts.map((p) => <CircleMarker key={p.name} center={[p.lat, p.lng]} radius={9} pathOptions={{ color: "#B8532E", fillColor: "#B8532E", fillOpacity: 0.85 }}><Popup>{p.name}</Popup></CircleMarker>)}
    </MapContainer>
  );
}
