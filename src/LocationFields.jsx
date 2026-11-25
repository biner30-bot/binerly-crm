import React, { useEffect, useId, useState } from "react";
import { TR_CITIES } from "./turkeyCities";

const neighborhoodCache = new Map();

function loadCityNeighborhoods(code) {
  if (!neighborhoodCache.has(code)) {
    neighborhoodCache.set(
      code,
      fetch(`/geo/mahalle/${code}.json`)
        .then((r) => (r.ok ? r.json() : {}))
        .catch(() => {
          neighborhoodCache.delete(code);
          return {};
        }),
    );
  }
  return neighborhoodCache.get(code);
}

const lower = (s) => String(s || "").toLocaleLowerCase("tr");
const findCity = (name) => TR_CITIES.find((c) => lower(c.name) === lower(name));

// Harita aramasından gelen il/ilçe/mahalleyi resmi (idari) listedeki yazımla eşler.
// Tapu/TKGM kadastro mahallesini gösterir (ör. Gaziemir "Sakarya"), ilanlar ve bu
// liste idari mahalleyi ("Beyazevler") - bölge fiyatı için doğru olan idari olan.
// Resmi listede birebir olmayan mahalle null döner, doldurulmaz.
export async function resolveOfficialPlace({ city, district, neighborhood }) {
  const c = findCity(city);
  if (!c) return { city: null, district: null, neighborhood: null };
  const d = c.districts.find((x) => lower(x) === lower(district)) || null;
  let n = null;
  if (d && neighborhood) {
    const list = (await loadCityNeighborhoods(c.code))[d] || [];
    n = list.find((x) => lower(x) === lower(neighborhood)) || null;
  }
  return { city: c.name, district: d, neighborhood: n };
}

// İl/ilçe listeden seçilir; mahalle serbest yazılır ama öneri listesi sunulur -
// resmi listede olmayan site/semt adları da girilebilsin. Eski kayıtlarda
// listede olmayan bir il/ilçe yazılıysa kaybolmasın diye seçenek olarak eklenir.
export function LocationFields({
  value,
  onChange,
  suggestions = [],
  labelStyle,
  fieldStyle = { flex: "1 1 160px" },
}) {
  const listId = useId();
  const city = findCity(value.city);
  const districtOptions = city?.districts || [];
  const cityCode = city?.code;
  const [cityNeighborhoods, setCityNeighborhoods] = useState(null);

  useEffect(() => {
    let alive = true;
    setCityNeighborhoods(null);
    if (cityCode) loadCityNeighborhoods(cityCode).then((d) => alive && setCityNeighborhoods(d));
    return () => {
      alive = false;
    };
  }, [cityCode]);

  const district = districtOptions.find((d) => lower(d) === lower(value.district));
  const official = (district && cityNeighborhoods?.[district]) || [];
  const tagged = suggestions.filter(
    (s) =>
      (!s.city || !value.city || lower(s.city) === lower(value.city)) &&
      (!s.district || !value.district || lower(s.district) === lower(value.district)),
  );
  const seen = new Set();
  const options = [];
  for (const s of tagged) {
    if (!s.name || seen.has(lower(s.name))) continue;
    seen.add(lower(s.name));
    options.push({ value: s.name, label: s.tag });
  }
  for (const n of official) {
    if (seen.has(lower(n))) continue;
    seen.add(lower(n));
    options.push({ value: n });
  }

  const legacyCity = value.city && !city;
  const legacyDistrict = value.district && !district;

  return (
    <>
      <div style={fieldStyle}>
        <label style={labelStyle}>İl</label>
        <select
          value={city?.name || value.city || ""}
          onChange={(e) => onChange({ city: e.target.value, district: "", neighborhood: "" })}
          style={{ width: "100%" }}
        >
          <option value="">Seçiniz</option>
          {legacyCity && <option value={value.city}>{value.city}</option>}
          {TR_CITIES.map((c) => (
            <option key={c.code} value={c.name}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
      <div style={fieldStyle}>
        <label style={labelStyle}>İlçe</label>
        <select
          value={district || value.district || ""}
          onChange={(e) => onChange({ district: e.target.value, neighborhood: "" })}
          disabled={!value.city}
          style={{ width: "100%" }}
        >
          <option value="">{value.city ? "Seçiniz" : "Önce il seçin"}</option>
          {legacyDistrict && <option value={value.district}>{value.district}</option>}
          {districtOptions.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
      </div>
      <div style={fieldStyle}>
        <label style={labelStyle}>Mahalle</label>
        <input
          list={listId}
          value={value.neighborhood || ""}
          onChange={(e) => onChange({ neighborhood: e.target.value })}
          placeholder={district ? "Yazın veya seçin" : ""}
          autoComplete="off"
          style={{ width: "100%" }}
        />
        <datalist id={listId}>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </datalist>
      </div>
    </>
  );
}
