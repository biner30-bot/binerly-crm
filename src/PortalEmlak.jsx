import React, { useEffect, useMemo, useState } from "react";
import { Badge, formatTL } from "./shared";
import { matchEmlakListing } from "./Sectors";
import {
  authorizationStatus,
  propertyAsListingDeal,
  propertyStatusMeta,
  SHOWING_INTEREST,
  transactionLabel,
} from "./realEstate";

// Müşteri portalı - emlak bölümleri. Veri iki kaynaktan gelir:
// - portal_emlak_overview() RPC: müşterinin SADECE kendi talebi, gezdiği evler,
//   mal sahibi olduğu portföyler (alıcı kimliği / danışman notu yok).
// - Vitrin (zaten herkese açık): uygun evler listesi ve fotoğrafları.

const card = {
  background: "var(--surface-1)",
  border: "0.5px solid var(--border)",
  borderRadius: "var(--radius-lg)",
  padding: 14,
  marginBottom: 12,
};
const fmtDate = (iso) => (iso ? new Date(iso).toLocaleDateString("tr-TR") : "");
const daysSince = (iso) =>
  iso ? Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)) : null;

function useVitrinListings(token) {
  const [state, setState] = useState({ loading: !!token, listings: [] });
  useEffect(() => {
    if (!token) return undefined;
    let alive = true;
    fetch(`/api/lead-capture?token=${encodeURIComponent(token)}&view=vitrin`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => alive && setState({ loading: false, listings: d?.listings || [] }))
      .catch(() => alive && setState({ loading: false, listings: [] }));
    return () => {
      alive = false;
    };
  }, [token]);
  return state;
}

const hasDemand = (t) =>
  !!(
    t &&
    (t.aranan_islem ||
      t.aranan_bolge ||
      t.min_butce ||
      t.max_butce ||
      (t.aranan_oda_sayisi && t.aranan_oda_sayisi !== "Farketmez"))
  );

export function PortalHomes({ overview, companyName, onSendMessage, notify }) {
  const { loading, listings } = useVitrinListings(overview?.vitrin_token);
  const hiddenKey = `portal_hidden_homes_${overview?.customer_id}`;
  const [hidden, setHidden] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(hiddenKey) || "[]");
    } catch {
      return [];
    }
  });
  const [sent, setSent] = useState({});
  const [openPhoto, setOpenPhoto] = useState({});
  const talep = overview?.talep || {};
  const demand = hasDemand(talep);
  const ranked = useMemo(() => {
    const me = [{ id: "me", phone: "-", customFields: talep }];
    return listings
      .map((l) => {
        if (!demand) return { l, score: null };
        const deal = propertyAsListingDeal(
          {
            ...l,
            neighborhood: l.location,
            details: l.details || {},
          },
          { forMatching: true },
        );
        const [m] = matchEmlakListing(deal, me);
        return m ? { l, score: m.score } : null;
      })
      .filter(Boolean)
      .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  }, [listings, talep, demand]);
  const visible = ranked.filter(({ l }) => !hidden.includes(l.id));

  const hide = (id) => {
    const next = [...hidden, id];
    setHidden(next);
    try {
      localStorage.setItem(hiddenKey, JSON.stringify(next));
    } catch {
      // sadece kolaylık
    }
  };
  const interested = async (l) => {
    await onSendMessage(
      `İlgileniyorum: ${l.title}${l.location ? ` (${l.location})` : ""}${l.price ? ` - ${formatTL(l.price)}` : ""}. Görmek isterim.`,
    );
    setSent((p) => ({ ...p, [l.id]: true }));
    notify?.(`${companyName || "Danışmanınız"} bilgilendirildi - sizi arayacak.`, "success");
  };

  return (
    <div>
      <h2 style={{ margin: "0 0 4px", fontSize: 22, fontWeight: 700 }}>Size uygun evler</h2>
      <p style={{ margin: "0 0 16px", fontSize: 13, color: "var(--text-secondary)" }}>
        {demand
          ? 'Aradığınız bölge, bütçe ve özelliklere uyan güncel ilanlar. Beğendiğiniz evde "İlgileniyorum"a basın, danışmanınız sizi arayıp gösterim için gün ayarlasın.'
          : "Danışmanınızın güncel ilanları. Aradığınız evi anlatırsanız (bölge, bütçe, oda) size uyanlar öne çıkar."}
      </p>
      {loading ? (
        <p style={{ fontSize: 13, color: "var(--text-muted)" }}>İlanlar yükleniyor…</p>
      ) : visible.length === 0 ? (
        <div style={card}>
          <p style={{ margin: "0 0 8px", fontSize: 14 }}>
            {listings.length === 0
              ? "Şu anda yayında ilan yok."
              : "Şu an talebinize uyan ilan yok - yeni ilanlar eklendikçe burada görünür."}
          </p>
          <button
            type="button"
            onClick={async () => {
              await onSendMessage(
                "Aradığım evi konuşmak istiyorum, uygun olduğunuzda arayabilir misiniz?",
              );
              notify?.("Mesajınız iletildi - sizi arayacaklar.", "success");
            }}
          >
            Beni arayın
          </button>
        </div>
      ) : (
        visible.map(({ l, score }) => {
          const photos = l.photos || [];
          const idx = openPhoto[l.id] || 0;
          return (
            <div key={l.id} style={{ ...card, padding: 0, overflow: "hidden" }}>
              {photos.length > 0 && (
                <div style={{ position: "relative" }}>
                  <img
                    src={photos[idx]}
                    alt={l.title}
                    style={{ width: "100%", height: 220, objectFit: "cover", display: "block" }}
                  />
                  {photos.length > 1 && (
                    <button
                      type="button"
                      onClick={() =>
                        setOpenPhoto((p) => ({ ...p, [l.id]: (idx + 1) % photos.length }))
                      }
                      style={{
                        position: "absolute",
                        right: 8,
                        bottom: 8,
                        fontSize: 12,
                        background: "rgba(0,0,0,0.55)",
                        color: "#fff",
                        border: "none",
                      }}
                    >
                      {idx + 1}/{photos.length} - sonraki
                    </button>
                  )}
                </div>
              )}
              <div style={{ padding: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 15 }}>{l.title}</div>
                    <div style={{ fontSize: 12.5, color: "var(--text-secondary)" }}>
                      {[
                        l.location,
                        l.roomCount,
                        (l.grossM2 || l.netM2) && `${l.grossM2 || l.netM2} m²`,
                        l.buildingAge !== "" && l.buildingAge != null && `${l.buildingAge} yaşında`,
                        l.floor && `Kat: ${l.floor}`,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </div>
                  </div>
                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 15 }}>
                      {l.price ? formatTL(l.price) : "Fiyat için arayın"}
                      {l.transactionType === "kiralik" && l.price ? " / ay" : ""}
                    </div>
                    {score != null && (
                      <Badge tone={score >= 80 ? "success" : "accent"}>%{score} uyum</Badge>
                    )}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                  {sent[l.id] ? (
                    <Badge tone="success">İletildi - sizi arayacaklar</Badge>
                  ) : (
                    <button
                      type="button"
                      onClick={() => interested(l)}
                      style={{
                        background: "var(--fill-accent)",
                        color: "var(--on-accent)",
                        border: "none",
                      }}
                    >
                      İlgileniyorum
                    </button>
                  )}
                  <button type="button" onClick={() => hide(l.id)}>
                    Uygun değil
                  </button>
                </div>
              </div>
            </div>
          );
        })
      )}
      {hidden.length > 0 && (
        <button
          type="button"
          style={{ fontSize: 12 }}
          onClick={() => {
            setHidden([]);
            try {
              localStorage.removeItem(hiddenKey);
            } catch {
              // sadece kolaylık
            }
          }}
        >
          Gizlediğim {hidden.length} ilanı tekrar göster
        </button>
      )}
    </div>
  );
}

export function PortalShowings({ showings }) {
  return (
    <div>
      <h2 style={{ margin: "0 0 4px", fontSize: 22, fontWeight: 700 }}>Gezdiğim evler</h2>
      <p style={{ margin: "0 0 16px", fontSize: 13, color: "var(--text-secondary)" }}>
        Danışmanınızla gördüğünüz evler.
      </p>
      {showings.length === 0 ? (
        <p style={{ fontSize: 13, color: "var(--text-muted)" }}>Henüz gösterim kaydı yok.</p>
      ) : (
        showings.map((s, i) => (
          <div key={i} style={{ ...card, display: "flex", gap: 10, alignItems: "center" }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 14 }}>{s.title}</div>
              <div style={{ fontSize: 12.5, color: "var(--text-secondary)" }}>
                {[
                  [s.neighborhood, s.district].filter(Boolean).join(", "),
                  s.room_count,
                  s.gross_m2 && `${s.gross_m2} m²`,
                  transactionLabel(s.transaction_type),
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </div>
            </div>
            <div style={{ textAlign: "right", fontSize: 12.5 }}>
              <div>{fmtDate(s.shown_at)}</div>
              {s.signed && <Badge tone="success">Belge onaylı</Badge>}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

export function PortalMyProperties({ properties }) {
  return (
    <div>
      <h2 style={{ margin: "0 0 4px", fontSize: 22, fontWeight: 700 }}>Mülklerim</h2>
      <p style={{ margin: "0 0 16px", fontSize: 13, color: "var(--text-secondary)" }}>
        Danışmanınıza emanet ettiğiniz mülklerin güncel durumu.
      </p>
      {properties.map((p) => {
        const status = propertyStatusMeta(p.status);
        const auth = authorizationStatus({
          authorizationStart: p.authorization_start,
          authorizationMonths: p.authorization_months,
          authorizationAutoRenew: p.authorization_auto_renew,
        });
        const listed = daysSince(p.authorization_start || p.created_at);
        const refs = p.listing_refs || {};
        const interest = p.interest || {};
        return (
          <div key={p.id} style={card}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 15 }}>{p.title}</div>
                <div style={{ fontSize: 12.5, color: "var(--text-secondary)" }}>
                  {[
                    [p.neighborhood, p.district].filter(Boolean).join(", "),
                    transactionLabel(p.transaction_type),
                    p.price && formatTL(p.price),
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </div>
              </div>
              <Badge tone={status.tone || "default"}>{status.label}</Badge>
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
                gap: 8,
                marginTop: 12,
              }}
            >
              {[
                listed != null && ["Yayında", `${listed} gün`],
                ["Toplam gösterim", String(p.show_total || 0)],
                ["Son 30 gün", `${p.show_30d || 0} gösterim`],
                auth && [
                  "Yetki sözleşmesi",
                  auth.expired
                    ? "süresi doldu"
                    : `${auth.end.toLocaleDateString("tr-TR")}${auth.autoRenew ? " (otomatik uzar)" : ""}`,
                ],
              ]
                .filter(Boolean)
                .map(([k, v]) => (
                  <div
                    key={k}
                    style={{
                      border: "0.5px solid var(--border)",
                      borderRadius: "var(--radius)",
                      padding: "6px 10px",
                    }}
                  >
                    <div style={{ fontSize: 11.5, color: "var(--text-muted)" }}>{k}</div>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{v}</div>
                  </div>
                ))}
            </div>
            {Object.keys(interest).length > 0 && (
              <p style={{ fontSize: 12.5, margin: "10px 0 0" }}>
                Gösterimlerde ilgi:{" "}
                {SHOWING_INTEREST.filter((i) => interest[i.id])
                  .map((i) => `${i.label} ${interest[i.id]}`)
                  .join(" · ")}
              </p>
            )}
            {(refs.sahibinden || refs.hepsiemlak || refs.emlakjet) && (
              <p style={{ fontSize: 12.5, margin: "8px 0 0" }}>
                İlan numarası:{" "}
                {[
                  refs.sahibinden && `Sahibinden ${refs.sahibinden}`,
                  refs.hepsiemlak && `Hepsiemlak ${refs.hepsiemlak}`,
                  refs.emlakjet && `Emlakjet ${refs.emlakjet}`,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
