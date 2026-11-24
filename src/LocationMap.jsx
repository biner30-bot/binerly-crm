import React, { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { OSM_ATTRIBUTION, OSM_TILE_URL, isValidLocation } from "./geo";

// Leaflet'in varsayılan iğne görseli bundler'da yol sorunu çıkardığı için
// CSS ile çizilen bir iğne kullanılır.
const pinIcon = L.divIcon({
  className: "",
  html: '<div style="width:18px;height:18px;border-radius:50%;background:#dc2626;border:3px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.5)"></div>',
  iconSize: [18, 18],
  iconAnchor: [9, 9],
});

const TURKEY = { lat: 39, lng: 35 };

export default function LocationMap({ location, center, onChange, height = 280 }) {
  const elRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    const start = isValidLocation(location) ? location : center || TURKEY;
    const map = L.map(elRef.current, { scrollWheelZoom: true }).setView(
      [start.lat, start.lng],
      isValidLocation(location) ? 18 : center ? center.zoom || 15 : 5,
    );
    L.tileLayer(OSM_TILE_URL, { maxZoom: 19, attribution: OSM_ATTRIBUTION }).addTo(map);
    map.on("click", (e) => onChangeRef.current({ lat: e.latlng.lat, lng: e.latlng.lng }));
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
    // Harita bir kez kurulur; konum/merkez değişimi aşağıdaki effect'lerde.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!isValidLocation(location)) {
      if (markerRef.current) {
        markerRef.current.remove();
        markerRef.current = null;
      }
      return;
    }
    const ll = [Number(location.lat), Number(location.lng)];
    if (!markerRef.current) {
      markerRef.current = L.marker(ll, { draggable: true, icon: pinIcon }).addTo(map);
      markerRef.current.on("dragend", () => {
        const p = markerRef.current.getLatLng();
        onChangeRef.current({ lat: p.lat, lng: p.lng });
      });
    } else {
      markerRef.current.setLatLng(ll);
    }
    // Koordinat yapıştırılınca / kayıt açılınca iğne görünür alanda değilse oraya git.
    if (!map.getBounds().contains(ll) || map.getZoom() < 15) map.setView(ll, 18);
  }, [location?.lat, location?.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (center && !isValidLocation(location) && mapRef.current)
      mapRef.current.setView([center.lat, center.lng], center.zoom || 15);
  }, [center?.lat, center?.lng, center?.zoom]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div
      ref={elRef}
      style={{ height, borderRadius: 8, border: "0.5px solid var(--border)", zIndex: 0 }}
    />
  );
}
