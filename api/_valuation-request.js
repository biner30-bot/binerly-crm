// "Evim ne kadar eder?" (vitrin) - ev sahibinin değerleme talebi. Önce talep
// alınır (müşteri adayı + görev + danışmana taslak analiz); bölge verisi
// GÜNCEL ve yaşa yakın emsal yeterliyse teşekkür ekranında tahmini aralık da
// döner. Hesap uygulama içiyle birebir aynı olsun diye src/priceEstimate.js
// kullanılır (_market-index.js de aynı dosyayı kullanıyor).
import crypto from "node:crypto";
import {
  REGION_STALE_DAYS,
  estimateValue,
  findRegion,
  kfeSeriesForCity,
  regionAgeDays,
} from "../src/priceEstimate.js";
import { PROPERTY_TYPE_OPTIONS, ROOM_COUNT_OPTIONS } from "../src/realEstate.js";

const MIN_LISTINGS = 8;

const clean = (v, max = 80) => String(v ?? "").trim().slice(0, max);
const num = (v, lo, hi) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= lo && n <= hi ? n : "";
};

function rowToRegion(r) {
  const n = (v) => (v != null ? Number(v) : null);
  return {
    id: r.id,
    city: r.city || "",
    district: r.district || "",
    neighborhood: r.neighborhood,
    propertyType: r.property_type,
    transactionType: r.transaction_type,
    medianM2: Number(r.median_m2),
    q1M2: n(r.q1_m2),
    q3M2: n(r.q3_m2),
    medianArea: n(r.median_area),
    listingCount: r.listing_count || 0,
    typicalAge: r.typical_age ?? null,
    asOf: r.as_of,
    source: r.source,
    listings: r.listings || [],
  };
}

// İstemciden gelen daire bilgisi sıkı biçimde süzülür - herkese açık uç.
export function sanitizeSubject(raw) {
  const s = raw || {};
  const d = s.details || {};
  const pick = (v, allowed) => (allowed.includes(v) ? v : "");
  return {
    city: clean(s.city, 40),
    district: clean(s.district, 60),
    neighborhood: clean(s.neighborhood, 80),
    propertyType: pick(s.propertyType, PROPERTY_TYPE_OPTIONS) || "Daire",
    grossM2: num(s.grossM2, 15, 2000),
    netM2: num(s.netM2, 10, 2000),
    roomCount: pick(s.roomCount, ROOM_COUNT_OPTIONS),
    buildingAge: num(s.buildingAge, 0, 150),
    floor: clean(s.floor, 20),
    totalFloors: num(s.totalFloors, 1, 100),
    details: {
      elevator: pick(d.elevator, ["Var", "Yok"]),
      parking: pick(d.parking, ["Yok", "Açık Otopark", "Kapalı Otopark", "Açık & Kapalı Otopark"]),
      in_site: pick(d.in_site, ["Evet", "Hayır"]),
      condition: pick(d.condition, ["Yeni / sıfır", "Yeni tadilatlı", "Bakımlı", "Standart", "Tadilat gerekli"]),
      facade: [],
      view: [],
      heating: "",
    },
    address: { street: clean(s.address?.street, 120), buildingNo: "", unitNo: "", siteName: clean(s.address?.siteName, 80), parcelBlock: "", parcelNo: "" },
    location: null,
    photo: null,
  };
}

// Danışmanın (ve ofis arkadaşlarının ortak) bölge verisiyle tahmin. Veri yoksa,
// 30 günden eskiyse, az ilanlıysa ya da daire yaşına yakın emsal yetersizse
// rakam VERİLMEZ - kullanıcı kararı: sadece güncel veride aralık gösterilir.
export async function publicEstimate(supabaseAdmin, ownerId, realEstateSettings, subject) {
  const { data: mine } = await supabaseAdmin
    .from("office_members")
    .select("office_id")
    .eq("user_id", ownerId)
    .is("left_at", null)
    .maybeSingle();
  let owners = [ownerId];
  if (mine?.office_id) {
    const { data: peers } = await supabaseAdmin
      .from("office_members")
      .select("user_id")
      .eq("office_id", mine.office_id)
      .is("left_at", null);
    owners = [...new Set([ownerId, ...(peers || []).map((p) => p.user_id)])];
  }
  const { data: rows } = await supabaseAdmin.from("region_prices").select("*").in("user_id", owners);
  const regions = (rows || []).map(rowToRegion);
  const aliases = realEstateSettings?.neighborhoodAliases || [];
  const saleRegion = findRegion(regions, subject, "satilik", aliases);
  if (!saleRegion) return { estimate: null, reason: "no_region" };
  if (regionAgeDays(saleRegion) > REGION_STALE_DAYS) return { estimate: null, reason: "stale" };
  if ((saleRegion.listingCount || 0) < MIN_LISTINGS) return { estimate: null, reason: "few" };
  const series = kfeSeriesForCity(saleRegion.city || subject.city);
  const { data: idx } = await supabaseAdmin
    .from("market_index")
    .select("series, period, value")
    .eq("series", series)
    .gte("period", `${new Date().getFullYear() - 3}-01-01`);
  const marketIndex = (idx || []).map((m) => ({ series: m.series, period: m.period, value: Number(m.value) }));
  const result = estimateValue({
    subject,
    saleRegion,
    rentRegion: null,
    marketIndex,
    factors: realEstateSettings?.avmFactors || {},
  });
  if (result.error || !result.ageBasis?.enough) return { estimate: null, reason: "age", result };
  // Ev sahibinin girdiği bilgi eksik olabilir - danışman ekranındakinden geniş
  // ve yuvarlak bir aralık (en az ±%12).
  const spread = Math.max(0.12, result.spread);
  const step = result.value.mid >= 5_000_000 ? 100_000 : 50_000;
  const round = (n) => Math.round(n / step) * step;
  return {
    estimate: { low: round(result.value.mid * (1 - spread)), high: round(result.value.mid * (1 + spread)) },
    result,
  };
}

// Talebi kaydeder: müşteri adayı (mevcutsa onu kullanır), danışmana arama
// görevi ve analiz listesine düşen taslak değerleme.
export async function saveValuationRequest(supabaseAdmin, settings, { customerId, contactName, subject, estimateInfo }) {
  const place = [subject.neighborhood, subject.district].filter(Boolean).join(", ");
  const spec = [subject.roomCount, subject.grossM2 && `${subject.grossM2} m²`, subject.buildingAge !== "" && `${subject.buildingAge} yaş`]
    .filter(Boolean)
    .join(" · ");
  const today = new Date().toISOString().slice(0, 10);
  await supabaseAdmin.from("tasks").insert({
    user_id: settings.user_id,
    title: `Değerleme talebi: ${contactName} - ${place || "mahalle belirtilmedi"}`,
    type: "arama",
    description: `Vitrindeki "Evim ne kadar eder?" formundan. ${spec}. ${
      estimateInfo?.estimate
        ? "Ev sahibine tahmini aralık gösterildi - Piyasa Analizi'ndeki taslaktan raporu hazırlayıp arayın."
        : "Bölge verisi yok/eski olduğu için rakam gösterilmedi - mahalleyi Sahibinden'den yapıştırıp Piyasa Analizi'ndeki taslaktan raporu hazırlayın."
    }`,
    due_date: today,
    customer_id: customerId,
  });
  await supabaseAdmin.from("valuations").insert({
    id: crypto.randomUUID(),
    created_by: settings.user_id,
    title: `${contactName} (web) - ${place}`.slice(0, 160),
    subject: { ...subject, name: `${contactName} (web talebi)` },
    result: estimateInfo?.result && !estimateInfo.result.error
      ? {
          low: estimateInfo.result.value.low,
          mid: estimateInfo.result.value.mid,
          high: estimateInfo.result.value.high,
          rentMonthly: null,
          region: estimateInfo.result.region?.neighborhood || null,
          regionAsOf: estimateInfo.result.region?.asOf || null,
        }
      : null,
    status: "taslak",
  });
}
