import { useState } from "react";
import { Badge, InfoTip, toWhatsAppNumber } from "./shared";

// "Sadece talep al" modundaki (Ayarlar -> Musaitlik Saatleri) Randevu Alma
// Linki'nden gelen, musterinin doluluk gormeden biraktigi gun+saat tercihleri.
// Bir tercihe (ya da farkli bir saate) tiklayinca musteriye tek bir teklif
// gonderilir (e-posta otomatik + istege bagli WhatsApp), musteri tek tikla
// onaylar/reddeder.
//
// Hem Pano'da hem Randevular sekmesinde ayni panel gosterilir - ayri ayri bakim
// gerektiren kopya olusmasin diye ortak bilesen. Panoya ozgu kart cercevesi
// (bg/shadow) `framed` ile acilir; Randevular sekmesinde de acik (kendi
// cercevesi var).
export function AppointmentRequestsPanel({
  requests,
  customerById,
  vipCustomerIds,
  appointmentSlotHasConflict,
  sendAppointmentOffer,
  onOpenDeal,
  framed = true,
}) {
  const [offerSendingDealId, setOfferSendingDealId] = useState(null);
  const [customOfferDealId, setCustomOfferDealId] = useState(null);
  const [customOfferDraft, setCustomOfferDraft] = useState("");
  const [copiedDealId, setCopiedDealId] = useState(null);

  if (!requests || requests.length === 0) return null;

  // Musterinin telefonu yoksa WhatsApp acilmiyor - KOBI linki baska kanaldan
  // (Instagram DM vb.) iletebilsin diye panoya kopyalar. Link deterministik:
  // approval_token'dan turer (bkz. api/deal-approval.js handleSendAppointmentOffer).
  const copyOfferLink = (deal) => {
    if (!deal.approvalToken) return;
    navigator.clipboard?.writeText(`https://binerly.com/randevu-onay/${deal.approvalToken}`);
    setCopiedDealId(deal.id);
    setTimeout(() => setCopiedDealId((cur) => (cur === deal.id ? null : cur)), 2000);
  };

  const wrapStyle = framed
    ? {
        background: "var(--surface-1)",
        borderRadius: "var(--radius-lg)",
        boxShadow: "var(--shadow-sm)",
        padding: "1rem",
        marginBottom: "1.5rem",
      }
    : {
        border: "0.5px solid var(--border)",
        borderRadius: "var(--radius-lg)",
        padding: "1rem",
        marginBottom: "1rem",
      };

  return (
    <div style={wrapStyle}>
      <p
        style={{
          fontSize: 14,
          fontWeight: 500,
          margin: "0 0 10px",
          display: "flex",
          alignItems: "center",
          gap: 4,
        }}
      >
        Randevu Talepleri ({requests.length})
        <InfoTip
          align="left"
          text="Sadece talep al modundaki (bkz. Ayarlar → Müsaitlik Saatleri) Randevu Alma Linki'nden veya Müşteri Portalı'ndan gelen, müşterinin sizin doluluğunuzu görmeden bıraktığı gün + saat tercihleri. Bir tercihe (ya da farklı bir saate) tıklayınca müşteriye tek bir teklif gönderilir - e-posta ile otomatik, isterseniz WhatsApp ile de. Müşteri tek tıkla onaylar/reddeder."
        />
      </p>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 10,
          maxHeight: 320,
          overflowY: "auto",
        }}
      >
        {requests.map((deal) => {
          const c = customerById(deal.customerId);
          const prefs = deal.customFields?.appointment_request_prefs || [];
          const durationMinutes = Number(deal.customFields?.duration_minutes) || 30;
          const serviceIds = [
            ...(deal.customFields?.service_ids || []),
            ...(deal.customFields?.price_item_id ? [deal.customFields.price_item_id] : []),
          ];
          const customConflict =
            customOfferDealId === deal.id &&
            customOfferDraft &&
            appointmentSlotHasConflict(customOfferDraft, durationMinutes, deal.id, serviceIds);
          const offerLabel = (dt) => {
            const d = new Date(`${dt}:00+03:00`);
            if (isNaN(d.getTime())) return dt;
            return d.toLocaleString("tr-TR", {
              day: "numeric",
              month: "short",
              hour: "2-digit",
              minute: "2-digit",
            });
          };
          const sendOffer = async (dt) => {
            setOfferSendingDealId(deal.id);
            const result = await sendAppointmentOffer(deal, dt);
            setOfferSendingDealId(null);
            if (result) {
              setCustomOfferDealId(null);
              setCustomOfferDraft("");
              const phone = c?.phone;
              if (phone) {
                const message = `Merhaba ${c?.name || ""}, "${deal.title}" randevu talebiniz için ${offerLabel(dt)} saatini önerebiliriz. Yanıtlamak için: ${result.confirmUrl}`;
                window.open(
                  `https://wa.me/${toWhatsAppNumber(phone)}?text=${encodeURIComponent(message)}`,
                  "_blank",
                  "noopener,noreferrer",
                );
              }
            }
          };
          return (
            <div
              key={`req-${deal.id}`}
              style={{
                fontSize: 13,
                padding: "6px 0",
                borderBottom: "0.5px solid var(--border)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: "var(--fill-warning)",
                    flexShrink: 0,
                  }}
                />
                <span
                  className="pano-alert-row"
                  style={{ flex: 1, cursor: "pointer" }}
                  onClick={() => onOpenDeal(deal)}
                >
                  {vipCustomerIds?.has(deal.customerId) && <span title="VIP müşteri">⭐ </span>}
                  {c?.name || "Bilinmeyen müşteri"} ({deal.title})
                </span>
              </div>
              {deal.appointmentOfferStatus === "sent" ? (
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    alignItems: "center",
                    gap: 8,
                    marginLeft: 14,
                  }}
                >
                  <Badge tone="warning">
                    Teklif gönderildi:{" "}
                    {new Date(deal.appointmentOfferTime).toLocaleString("tr-TR", {
                      day: "numeric",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                    {deal.appointmentOfferExpiresAt
                      ? ` · ${new Date(deal.appointmentOfferExpiresAt).toLocaleString("tr-TR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}'e kadar geçerli`
                      : ""}
                  </Badge>
                  <button
                    type="button"
                    onClick={() => setCustomOfferDealId(deal.id)}
                    style={{ fontSize: 12 }}
                  >
                    Farklı bir saat öner
                  </button>
                  {deal.approvalToken && (
                    <button
                      type="button"
                      onClick={() => copyOfferLink(deal)}
                      style={{ fontSize: 12 }}
                    >
                      {copiedDealId === deal.id ? "Kopyalandı ✓" : "Onay linkini kopyala"}
                    </button>
                  )}
                </div>
              ) : (
                <div style={{ marginLeft: 14 }}>
                  {deal.appointmentOfferStatus === "declined" && (
                    <div style={{ marginBottom: 6 }}>
                      <Badge tone="danger">Müşteri önerilen saati reddetti - başka bir saat önerin</Badge>
                    </div>
                  )}
                  {deal.appointmentOfferStatus === "expired" && (
                    <div style={{ marginBottom: 6 }}>
                      <Badge tone="danger">Önceki teklifin süresi doldu - başka bir saat önerin</Badge>
                    </div>
                  )}
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {prefs.map((dt, i) => {
                      const conflict = appointmentSlotHasConflict(dt, durationMinutes, deal.id, serviceIds);
                      return (
                        <button
                          key={dt}
                          type="button"
                          disabled={offerSendingDealId === deal.id}
                          onClick={() => sendOffer(dt)}
                          title={
                            conflict
                              ? "Bu saat başka bir randevuyla çakışıyor olabilir - yine de önerebilirsiniz"
                              : "Bu saati öner"
                          }
                          style={{
                            fontSize: 12,
                            padding: "4px 10px",
                            borderRadius: 20,
                            border: conflict
                              ? "1px solid var(--text-danger)"
                              : "1px solid var(--border)",
                            color: conflict ? "var(--text-danger)" : "var(--text-primary)",
                            background: "var(--surface-2)",
                          }}
                        >
                          {i + 1}. tercih: {offerLabel(dt)} {conflict ? "· dolu olabilir" : "· müsait"}
                        </button>
                      );
                    })}
                    <button
                      type="button"
                      onClick={() => setCustomOfferDealId(deal.id)}
                      style={{ fontSize: 12 }}
                    >
                      + Farklı bir saat öner
                    </button>
                  </div>
                </div>
              )}
              {customOfferDealId === deal.id && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    flexWrap: "wrap",
                    gap: 6,
                    marginTop: 8,
                    marginLeft: 14,
                  }}
                >
                  <input
                    type="datetime-local"
                    value={customOfferDraft}
                    onChange={(e) => setCustomOfferDraft(e.target.value)}
                    style={{ fontSize: 12 }}
                  />
                  <button
                    type="button"
                    disabled={!customOfferDraft || offerSendingDealId === deal.id}
                    onClick={() => sendOffer(customOfferDraft)}
                    style={{ fontSize: 12 }}
                  >
                    {offerSendingDealId === deal.id ? "Gönderiliyor…" : "Öner"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setCustomOfferDealId(null);
                      setCustomOfferDraft("");
                    }}
                    style={{ fontSize: 12 }}
                  >
                    Vazgeç
                  </button>
                  {customConflict && (
                    <span style={{ fontSize: 11, color: "var(--text-danger)", flexBasis: "100%" }}>
                      Bu saat dolu ya da çalışma saatleri dışında olabilir - yine de önerebilirsiniz
                    </span>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
