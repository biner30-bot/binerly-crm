import { useState } from "react";
import {
  Badge,
  MetricCard,
  InfoTip,
  formatTL,
  downloadXlsx,
  toWhatsAppNumber,
  RangeFilter,
  DateRangeFilter,
  TONE_COLORS,
  InitialsAvatar,
} from "./shared";
import { DEAL_WORD_FORMS } from "./staticData";
import { PAYMENT_METHOD_LABELS } from "./Deals";
import {
  STAGES,
  stageLabel,
  stageTone,
  dealWordKind,
  supportsGroupClasses,
  groupClassWords,
  computeCustomerReliability,
  supportsSelfBooking,
  bookingModel,
} from "./Sectors";
import { getSlaStatus, TERMINAL_STATUSES } from "./Support";
import { TASK_TYPES } from "./Tasks";

// Paket/üyelik yenileme hatırlatması — approvalLink opsiyonel, çağıran taraf
// (async generateApprovalLink sonucu) hazırsa geçiyor, hazır değilse linksiz
// gönderilir (yine de kullanışlı bir hatırlatma metni olur).
function buildRenewalMessage(deal, customer, alert, companySettings, approvalLink) {
  const firstName = (customer.name || "").split(" ")[0] || customer.name;
  const firma = companySettings?.companyName ? `${companySettings.companyName} olarak ` : "";
  const durum =
    alert.type === "session"
      ? alert.remaining <= 0
        ? `"${deal.title}" paketinizdeki seanslar bitti`
        : `"${deal.title}" paketinizin son ${alert.remaining} dersi kaldı`
      : alert.daysLeft < 0
        ? `"${deal.title}" üyeliğinizin süresi doldu`
        : `"${deal.title}" üyeliğinizin bitmesine ${alert.daysLeft} gün kaldı`;
  const linkPart = approvalLink ? ` Yenilemek için: ${approvalLink}` : "";
  return `Merhaba ${firstName}, ${firma}${durum}. Devam etmek isterseniz sizi bekleriz!${linkPart}`;
}
// "Seni özledik" — derse katılım bazlı hareketsizlik/düşüş tespit edilen üyeye
// gönderilecek hazır metin. "medium" (hâlâ geliyor ama sıklığı azalmış) ve
// "high" (hiç gelmemiş) risk seviyeleri farklı ton gerektirdiği için ayrı metin.
function buildWinBackMessage(customer, alert, companySettings) {
  const firstName = (customer.name || "").split(" ")[0] || customer.name;
  const firma = companySettings?.companyName ? `${companySettings.companyName} olarak ` : "";
  if (alert.level === "medium") {
    return `Merhaba ${firstName}, son zamanlarda derslere eskisi kadar sık gelemediğinizi fark ettik. ${firma}bir sonraki dersinizde sizi görmeyi çok isteriz - uygun bir saat için bize yazabilirsiniz.`;
  }
  return `Merhaba ${firstName}, sizi ${alert.daysSince} gündür derslerde göremedik, sizi özledik! ${firma}bir sonraki dersinizde görüşmeyi çok isteriz - uygun bir saat için bize yazabilirsiniz.`;
}
// Sipariş ritmi bozulan müşteriye "her şey yolunda mı" kontrolü — renewal/win-back
// ile aynı desen: hazır metni tek tıkla WhatsApp'a taşır, gönderim yine kullanıcının elinde.
function buildOrderCheckInMessage(customer, typicalInterval, daysSinceLast, companySettings) {
  const firstName = (customer.name || "").split(" ")[0] || customer.name;
  const firma = companySettings?.companyName ? `${companySettings.companyName} olarak ` : "";
  return `Merhaba ${firstName}, genelde ${typicalInterval} günde bir sipariş verirdiniz, ${daysSinceLast} gündür sizden yeni bir sipariş almadık. ${firma}her şey yolunda mı diye sormak istedik, ihtiyacınız varsa buradayız.`;
}
export default function Pano({
  customers,
  deals,
  tickets,
  teamMembers,
  companySettings,
  session,
  pendingInvites,
  dismissedInviteIds,
  activeTeamId,
  canEditCompanySettings,
  appointmentDateTimeKey,
  onFixAppointmentField,
  dealLineItems,
  priceListItems,
  panoRange,
  setPanoRange,
  panoRangeFrom,
  panoRangeTo,
  onPanoRangeFromChange,
  onPanoRangeToChange,
  activationChecklistDismissedClick,
  setActivationChecklistDismissedClick,
  setTab,
  setEditingDeal,
  setShowDealForm,
  setViewingCustomer,
  setInitialViewTicketId,
  setShowSettingsForm,
  setShowSectorFields,
  setShowCustomerForm,
  attemptMoveDealStage,
  handleUseSessionClick,
  addPayment,
  totalPaidForDeal,
  customerById,
  promoteFromWaitlistIfAny,
  generateApprovalLink,
  seedDemoData,
  openDealOrList,
  openTicketOrList,
  pendingArrivalConfirmations,
  pendingAppointmentRequests,
  appointmentSlotHasConflict,
  sendAppointmentOffer,
  otelArrivalsToday,
  otelDeparturesToday,
  dueReminderDeals,
  dueTasks,
  urgentTickets,
  newPortalAppointments,
  orderRhythmAlerts,
  lowStockItems,
  membershipAlerts,
  churnAlerts,
  waitlistFillableAlerts,
  vipCustomerIds,
  stuckDeals,
  freedAppointmentAlerts,
  unassignedUpcomingAppointments,
  reviewConsentMissingAlerts,
  requestCustomerConsent,
  openDeals,
  totalOpenValue,
  expectedRevenue,
  nextMonthForecast,
  passiveCustomerRate,
  totalOutstanding,
  dealsWithOutstanding,
  activeMemberships,
  dealsWithReminder,
  openTicketsCount,
  breachedTicketsCount,
  breachedTickets,
  unreadMessagesCount,
  ticketsWithUnread,
  rangeLabel,
  wonDeals,
  lostDeals,
  rangeRevenue,
  rangeCost,
  rangeProfit,
  rangeProfitMargin,
  totalCollected,
  rangeAvgDealSize,
  noShowRate,
  avgCompletionDays,
  recurringRevenueRate,
  onlineSalesRate,
  revenueProfitByBucket,
  maxBucketValue,
  winRate,
  lostReasonCounts,
  dealKind,
  dealWords,
  STAGE_PROBABILITY,
  PASSIVE_CUSTOMER_DAYS,
}) {
  // "Geldi ✓"/"Seans kullanıldı" hızlı tahsilat kısayolu - KOBİ'ler genelde
  // ödemeyi elden/kendi yöntemleriyle o anda alıyor (kart POS'u, nakit), Finans
  // sekmesine ayrıca gidip Tahsilat formunu doldurmak ekstra bir gezinme
  // adımıydı. Sadece kalan bakiye varsa (online tam ödenmiş değilse) gösterilir.
  const [payingDealId, setPayingDealId] = useState(null);
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState("nakit");
  const [paySaving, setPaySaving] = useState(false);
  // "Randevu Talepleri" widget'ı - hangi satırın "farklı bir saat" mini-formu
  // açık, hangi satır o an teklif gönderiliyor (çift tıklamayı engellemek için).
  const [customOfferDealId, setCustomOfferDealId] = useState(null);
  const [customOfferDraft, setCustomOfferDraft] = useState("");
  const [offerSendingDealId, setOfferSendingDealId] = useState(null);

  const startArrivalPayment = (deal) => {
    const remaining = deal.value - totalPaidForDeal(deal.id);
    setPayingDealId(deal.id);
    setPayAmount(remaining > 0 ? String(Math.round(remaining * 100) / 100) : "");
    setPayMethod("nakit");
  };

  const completeWithPayment = async (deal, completeAction) => {
    const amount = Number(payAmount);
    if (amount > 0) {
      setPaySaving(true);
      await addPayment({
        dealId: deal.id,
        amount,
        paidAt: new Date().toISOString(),
        method: payMethod,
      });
      setPaySaving(false);
    }
    setPayingDealId(null);
    completeAction();
  };

  return (
    <div>
      {/* Kuruluma başlayın listesinin aksine bu banner "gizle" ile kalıcı
          kapanmaz - sorun sürüyor sürece her açılışta görünür. Tek seferlik
          bir kurulum adımı değil, sürekli bir sağlık kontrolü: alan sektör
          değişimi/elle silme ile sonradan da pasife düşebilir (bkz. Elif
          Güzellik Salonu vakası), o an fark edilmesi gerekiyor. */}
      {canEditCompanySettings &&
        supportsSelfBooking(companySettings?.sector) &&
        bookingModel(companySettings?.sector) === "slot" &&
        !appointmentDateTimeKey && (
          <div
            style={{
              background: "var(--surface-1)",
              border: "1px solid var(--text-warning, #b45309)",
              borderRadius: "var(--radius-lg)",
              boxShadow: "var(--shadow-sm)",
              padding: "1rem",
              marginBottom: "1.5rem",
            }}
          >
            <p
              style={{
                fontSize: 14,
                fontWeight: 600,
                color: "var(--text-warning, #b45309)",
                margin: "0 0 6px",
              }}
            >
              ⚠ Randevu Alma Linki şu anda çalışmıyor
            </p>
            <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: "0 0 10px" }}>
              Müşteriler linke girdiğinde "şu anda online randevu almıyor" mesajı görüyor - randevu
              tarihi için gereken özel alan pasif kalmış.
            </p>
            <button
              type="button"
              onClick={onFixAppointmentField}
              style={{
                fontSize: 13,
                background: "var(--text-warning, #b45309)",
                color: "#fff",
                border: "none",
                borderRadius: "var(--radius)",
                padding: "8px 12px",
              }}
            >
              Otomatik Düzelt
            </button>
          </div>
        )}
      {!(
        activationChecklistDismissedClick ||
        (activeTeamId &&
          localStorage.getItem(`binerly_activation_checklist_dismissed_${activeTeamId}`)) ||
        pendingInvites.some((inv) => !dismissedInviteIds.includes(inv.id))
      ) &&
        (() => {
          const steps = [
            // Şirket bilgileri/sektör adımları Ayarlar hub'ındaki ile aynı yetkiye
            // (canEditCompanySettings) tabi — aksi halde yetkisi olmayan bir takım
            // üyesi checklist üzerinden bu formlara ulaşıp değiştirebilirdi.
            ...(canEditCompanySettings
              ? [
                  {
                    label: "Şirket bilgilerinizi girin",
                    done: !!companySettings?.companyName,
                    onGo: () => setShowSettingsForm(true),
                  },
                  {
                    label: "Sektörünüzü seçin",
                    done: !!companySettings?.sector,
                    onGo: () => setShowSectorFields(true),
                  },
                ]
              : []),
            {
              label: "İlk müşterinizi ekleyin",
              done: customers.length > 0,
              onGo: () => {
                setTab("musteri");
                setShowCustomerForm(true);
              },
            },
            {
              label: `İlk ${DEAL_WORD_FORMS[dealWordKind(companySettings?.sector)].possYoursAcc} oluşturun`,
              done: deals.length > 0,
              onGo: () => {
                if (customers.length > 0) {
                  setTab("firsat");
                  setShowDealForm(true);
                } else {
                  setTab("musteri");
                  setShowCustomerForm(true);
                }
              },
            },
          ];
          const doneCount = steps.filter((s) => s.done).length;
          const allDone = doneCount === steps.length;
          const dismiss = () => {
            if (activeTeamId)
              localStorage.setItem(`binerly_activation_checklist_dismissed_${activeTeamId}`, "1");
            setActivationChecklistDismissedClick(true);
          };
          return (
            <div
              style={{
                background: "var(--surface-1)",
                borderRadius: "var(--radius-lg)",
                boxShadow: "var(--shadow-sm)",
                padding: "1rem",
                marginBottom: "1.5rem",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: allDone ? 0 : 10,
                }}
              >
                <p style={{ fontSize: 14, fontWeight: 500, margin: 0 }}>
                  {allDone
                    ? "✅ Kurulum tamamlandı"
                    : `Kuruluma başlayın (${doneCount}/${steps.length})`}
                </p>
                <button onClick={dismiss} style={{ fontSize: 12 }}>
                  Gizle
                </button>
              </div>
              {!allDone && (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {steps.map((s) => (
                    <div
                      key={s.label}
                      onClick={s.done ? undefined : s.onGo}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        fontSize: 13,
                        cursor: s.done ? "default" : "pointer",
                        padding: "2px 0",
                      }}
                    >
                      <i
                        className={`ti ${s.done ? "ti-circle-check-filled" : "ti-circle"}`}
                        style={{
                          fontSize: 16,
                          color: s.done ? "var(--text-success)" : "var(--text-muted)",
                          flexShrink: 0,
                        }}
                        aria-hidden="true"
                      ></i>
                      <span
                        style={{
                          color: s.done ? "var(--text-muted)" : "inherit",
                          textDecoration: s.done ? "line-through" : "none",
                        }}
                      >
                        {s.label}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })()}
      {pendingArrivalConfirmations.length > 0 && (
        <div
          style={{
            background: "var(--surface-1)",
            borderRadius: "var(--radius-lg)",
            boxShadow: "var(--shadow-sm)",
            padding: "1rem",
            marginBottom: "1.5rem",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 10,
            }}
          >
            <p style={{ fontSize: 14, fontWeight: 500, margin: 0 }}>
              Bugünün Randevuları ({pendingArrivalConfirmations.length})
            </p>
            {pendingArrivalConfirmations.filter(({ deal }) => !deal.sessionTotal).length > 1 && (
              <button
                type="button"
                onClick={() =>
                  pendingArrivalConfirmations
                    .filter(({ deal }) => !deal.sessionTotal)
                    .forEach(({ deal }) => attemptMoveDealStage(deal.id, "kazanildi"))
                }
                style={{ fontSize: 12 }}
              >
                Hepsini Geldi işaretle
              </button>
            )}
          </div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 6,
              maxHeight: 260,
              overflowY: "auto",
            }}
          >
            {pendingArrivalConfirmations.map(({ deal, apptTime }) => {
              const c = customerById(deal.customerId);
              const reliability = computeCustomerReliability(deal.customerId, deals);
              return (
                <div
                  key={`arrival-${deal.id}`}
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    alignItems: "center",
                    gap: 8,
                    fontSize: 13,
                    padding: "4px 0",
                  }}
                >
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
                    onClick={() => {
                      setTab("firsat");
                      setEditingDeal(deal);
                      setShowDealForm(true);
                    }}
                  >
                    {apptTime.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })} -{" "}
                    {vipCustomerIds?.has(deal.customerId) && <span title="VIP müşteri">⭐ </span>}
                    {c?.name || "Bilinmeyen müşteri"} ({deal.title}
                    {deal.sessionTotal > 0
                      ? ` · ${deal.sessionUsed}/${deal.sessionTotal} seans`
                      : ""}
                    )
                  </span>
                  {reliability.tier === "riskli" && (
                    <span
                      title={`Son ${reliability.total} randevunun ${reliability.violations}'inde gelmedi/geç iptal etti`}
                      style={{ fontSize: 11, color: "var(--text-danger)", flexShrink: 0 }}
                    >
                      ⚠ Riskli
                    </span>
                  )}
                  {reliability.tier === "guvenilir" && (
                    <span
                      title={`Son ${reliability.total} randevuya hep geldi`}
                      style={{ fontSize: 11, color: "var(--text-success)", flexShrink: 0 }}
                    >
                      ✓ Güvenilir
                    </span>
                  )}
                  {payingDealId === deal.id ? (
                    // KOBİ genelde ödemeyi elden/kendi yöntemiyle (nakit, kendi POS'u)
                    // o anda alıyor - "Geldi ✓" sonrası ayrıca Finans'a gidip Tahsilat
                    // formu doldurmasın diye aynı tık akışına gömülü kısa bir alan.
                    <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={payAmount}
                        onChange={(e) => setPayAmount(e.target.value)}
                        placeholder="Tutar"
                        style={{ width: 80, fontSize: 12 }}
                      />
                      <select
                        value={payMethod}
                        onChange={(e) => setPayMethod(e.target.value)}
                        style={{ fontSize: 12 }}
                      >
                        {Object.entries(PAYMENT_METHOD_LABELS).map(([v, l]) => (
                          <option key={v} value={v}>
                            {l}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        disabled={paySaving}
                        onClick={() =>
                          completeWithPayment(deal, () =>
                            deal.sessionTotal > 0
                              ? handleUseSessionClick(deal)
                              : attemptMoveDealStage(deal.id, "kazanildi"),
                          )
                        }
                        style={{ fontSize: 12 }}
                      >
                        {paySaving ? "Kaydediliyor…" : "Tahsil Et ve Tamamla"}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setPayingDealId(null);
                          if (deal.sessionTotal > 0) handleUseSessionClick(deal);
                          else attemptMoveDealStage(deal.id, "kazanildi");
                        }}
                        style={{ fontSize: 12 }}
                      >
                        Ödemesiz Tamamla
                      </button>
                    </div>
                  ) : deal.sessionTotal > 0 ? (
                    // Paket teklifi: "Geldi ✓" burada YANLIŞ olur - stage=kazanıldı
                    // tüm paketi kapatır, tek bir seansın kullanımını değil. Bunun
                    // yerine Deals.jsx'teki (Randevular sekmesi) "Seans kullanıldı"
                    // ile AYNI aksiyon (handleUseSessionClick → incrementSessionUsage).
                    <button
                      type="button"
                      onClick={() => {
                        const remaining = deal.value - totalPaidForDeal(deal.id);
                        if (remaining > 0) startArrivalPayment(deal);
                        else handleUseSessionClick(deal);
                      }}
                      style={{ fontSize: 12, flexShrink: 0 }}
                    >
                      Seans kullanıldı
                    </button>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          const remaining = deal.value - totalPaidForDeal(deal.id);
                          if (remaining > 0) startArrivalPayment(deal);
                          else attemptMoveDealStage(deal.id, "kazanildi");
                        }}
                        style={{ fontSize: 12, flexShrink: 0 }}
                      >
                        Geldi ✓
                      </button>
                      <button
                        type="button"
                        onClick={() => attemptMoveDealStage(deal.id, "kaybedildi")}
                        style={{ fontSize: 12, flexShrink: 0 }}
                      >
                        Gelmedi/İptal
                      </button>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
      {pendingAppointmentRequests.length > 0 && (
        <div
          style={{
            background: "var(--surface-1)",
            borderRadius: "var(--radius-lg)",
            boxShadow: "var(--shadow-sm)",
            padding: "1rem",
            marginBottom: "1.5rem",
          }}
        >
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
            Randevu Talepleri ({pendingAppointmentRequests.length})
            <InfoTip
              align="left"
              text="Sadece talep al modundaki (bkz. Ayarlar → Müsaitlik Saatleri) Randevu Alma Linki'nden gelen, müşterinin sizin doluluğunuzu görmeden bıraktığı gün + saat tercihleri. Bir tercihe (ya da farklı bir saate) tıklayınca müşteriye tek bir teklif gönderilir - e-posta ile otomatik, isterseniz WhatsApp ile de. Müşteri tek tıkla onaylar/reddeder."
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
            {pendingAppointmentRequests.map((deal) => {
              const c = customerById(deal.customerId);
              const prefs = deal.customFields?.appointment_request_prefs || [];
              const durationMinutes = Number(deal.customFields?.duration_minutes) || 30;
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
                  const phone = c?.phone;
                  if (phone) {
                    const message = `Merhaba ${c?.name || ""}, "${deal.title}" randevu talebiniz için ${offerLabel(dt)} saatini önerebiliriz. Onaylamak için: ${result.confirmUrl}`;
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
                      onClick={() => {
                        setTab("firsat");
                        setEditingDeal(deal);
                        setShowDealForm(true);
                      }}
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
                    </div>
                  ) : (
                    <div style={{ marginLeft: 14 }}>
                      {deal.appointmentOfferStatus === "declined" && (
                        <div style={{ marginBottom: 6 }}>
                          <Badge tone="danger">
                            Müşteri önerilen saati reddetti - başka bir saat önerin
                          </Badge>
                        </div>
                      )}
                      {deal.appointmentOfferStatus === "expired" && (
                        <div style={{ marginBottom: 6 }}>
                          <Badge tone="danger">
                            Önceki teklifin süresi doldu - başka bir saat önerin
                          </Badge>
                        </div>
                      )}
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                        {prefs.map((dt, i) => {
                          const conflict = appointmentSlotHasConflict(
                            dt,
                            durationMinutes,
                            deal.id,
                            [
                              ...(deal.customFields?.service_ids || []),
                              ...(deal.customFields?.price_item_id
                                ? [deal.customFields.price_item_id]
                                : []),
                            ],
                          );
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
                              {i + 1}. tercih: {offerLabel(dt)}{" "}
                              {conflict ? "· dolu olabilir" : "· müsait"}
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
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
      {(otelArrivalsToday.length > 0 || otelDeparturesToday.length > 0) && (
        <div
          style={{
            background: "var(--surface-1)",
            borderRadius: "var(--radius-lg)",
            boxShadow: "var(--shadow-sm)",
            padding: "1rem",
            marginBottom: "1.5rem",
          }}
        >
          <p style={{ fontSize: 14, fontWeight: 500, margin: "0 0 10px" }}>
            Bugünün Giriş/Çıkışları
          </p>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 6,
              maxHeight: 260,
              overflowY: "auto",
            }}
          >
            {otelArrivalsToday.map((d) => (
              <div
                key={`arrival-${d.id}`}
                className="pano-alert-row"
                onClick={() => {
                  setTab("firsat");
                  setEditingDeal(d);
                  setShowDealForm(true);
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  fontSize: 13,
                  cursor: "pointer",
                  padding: "4px 0",
                }}
              >
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: "var(--fill-accent)",
                    flexShrink: 0,
                  }}
                />
                <span style={{ flex: 1 }}>
                  {customerById(d.customerId)?.name || "Bilinmeyen müşteri"} -{" "}
                  {d.customFields?.oda_tipi || d.title}
                </span>
                <Badge tone="accent">Bugün giriş</Badge>
              </div>
            ))}
            {otelDeparturesToday.map((d) => (
              <div
                key={`departure-${d.id}`}
                className="pano-alert-row"
                onClick={() => {
                  setTab("firsat");
                  setEditingDeal(d);
                  setShowDealForm(true);
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  fontSize: 13,
                  cursor: "pointer",
                  padding: "4px 0",
                }}
              >
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: "var(--fill-warning)",
                    flexShrink: 0,
                  }}
                />
                <span style={{ flex: 1 }}>
                  {customerById(d.customerId)?.name || "Bilinmeyen müşteri"} -{" "}
                  {d.customFields?.oda_tipi || d.title}
                </span>
                <Badge tone="warning">Bugün çıkış</Badge>
              </div>
            ))}
          </div>
        </div>
      )}
      <div
        style={{
          background: "var(--surface-1)",
          borderRadius: "var(--radius-lg)",
          boxShadow: "var(--shadow-sm)",
          padding: "1rem",
          marginBottom: "1.5rem",
        }}
      >
        <p style={{ fontSize: 14, fontWeight: 500, margin: "0 0 10px" }}>Bugün ne yapmalıyım</p>
        {dueReminderDeals.length === 0 &&
        dueTasks.length === 0 &&
        urgentTickets.length === 0 &&
        newPortalAppointments.length === 0 &&
        orderRhythmAlerts.length === 0 &&
        lowStockItems.length === 0 &&
        membershipAlerts.length === 0 &&
        churnAlerts.length === 0 &&
        waitlistFillableAlerts.length === 0 &&
        stuckDeals.length === 0 &&
        freedAppointmentAlerts.length === 0 &&
        unassignedUpcomingAppointments.length === 0 &&
        reviewConsentMissingAlerts.length === 0 ? (
          <p style={{ fontSize: 13, color: "var(--text-muted)", margin: 0 }}>
            Bugün için acil bir şey yok.
          </p>
        ) : (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 6,
              maxHeight: 260,
              overflowY: "auto",
            }}
          >
            {newPortalAppointments.map((d) => {
              const c = customerById(d.customerId);
              return (
                <div
                  key={`portal-${d.id}`}
                  className="pano-alert-row"
                  onClick={() => {
                    setTab("firsat");
                    setEditingDeal(d);
                    setShowDealForm(true);
                  }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    fontSize: 13,
                    cursor: "pointer",
                    padding: "8px 10px",
                    background: "var(--bg-accent)",
                    borderLeft: "3px solid var(--text-accent)",
                    borderRadius: "var(--radius)",
                  }}
                >
                  <span style={{ flex: 1 }}>
                    {c?.name || "Bilinmeyen müşteri"} - {d.title}
                  </span>
                  <Badge tone="accent">
                    {d.customFields?.kaynak === "randevu_widget"
                      ? "Web'den alındı"
                      : "Portaldan alındı"}
                  </Badge>
                </div>
              );
            })}
            {reviewConsentMissingAlerts.map(({ deal, customer }) => (
              <div
                key={`review-consent-${deal.id}`}
                className="pano-alert-row"
                onClick={() => setViewingCustomer(customer)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  fontSize: 13,
                  cursor: "pointer",
                  padding: "8px 10px",
                  background: "var(--bg-warning)",
                  borderLeft: "3px solid var(--text-warning)",
                  borderRadius: "var(--radius)",
                }}
              >
                <span style={{ flex: 1 }}>
                  {customer?.name || "Bilinmeyen müşteri"} - değerlendirme isteği için izin yok
                </span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    requestCustomerConsent(customer);
                  }}
                  style={{ fontSize: 12, padding: "4px 8px", flexShrink: 0 }}
                >
                  İzin İste
                </button>
              </div>
            ))}
            {urgentTickets
              .slice()
              .sort((a, b) =>
                getSlaStatus(a).isBreached === getSlaStatus(b).isBreached
                  ? 0
                  : getSlaStatus(a).isBreached
                    ? -1
                    : 1,
              )
              .map((t) => {
                const sla = getSlaStatus(t);
                return (
                  <div
                    key={`ticket-${t.id}`}
                    className="pano-alert-row"
                    onClick={() => {
                      setTab("destek");
                      setInitialViewTicketId(t.id);
                    }}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      fontSize: 13,
                      cursor: "pointer",
                      padding: "8px 10px",
                      background: sla.isBreached ? "var(--bg-danger)" : "var(--bg-warning)",
                      borderLeft: `3px solid ${sla.isBreached ? "var(--text-danger)" : "var(--fill-warning)"}`,
                      borderRadius: "var(--radius)",
                    }}
                  >
                    <span style={{ flex: 1 }}>{t.subject}</span>
                    <Badge tone={sla.isBreached ? "danger" : "warning"}>{sla.label}</Badge>
                  </div>
                );
              })}
            {dueReminderDeals.map((d) => {
              const c = customerById(d.customerId);
              const overdue = new Date(d.reminderDate) < new Date(new Date().setHours(0, 0, 0, 0));
              return (
                <div
                  key={`deal-${d.id}`}
                  className="pano-alert-row"
                  onClick={() => {
                    setTab("firsat");
                    setEditingDeal(d);
                    setShowDealForm(true);
                  }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    fontSize: 13,
                    cursor: "pointer",
                    padding: "8px 10px",
                    background: overdue ? "var(--bg-danger)" : "var(--bg-warning)",
                    borderLeft: `3px solid ${overdue ? "var(--text-danger)" : "var(--fill-warning)"}`,
                    borderRadius: "var(--radius)",
                  }}
                >
                  <span style={{ flex: 1 }}>
                    {c?.name || "Bilinmeyen müşteri"} - {d.reminder}
                  </span>
                  <Badge tone={overdue ? "danger" : "warning"}>
                    {overdue ? "Gecikti" : "Bugün"}
                  </Badge>
                </div>
              );
            })}
            {dueTasks.map((t) => {
              const c = t.customerId ? customerById(t.customerId) : null;
              const overdue = new Date(t.dueDate) < new Date(new Date().setHours(0, 0, 0, 0));
              const typeInfo = TASK_TYPES.find((x) => x.id === t.type) || TASK_TYPES[3];
              return (
                <div
                  key={`task-${t.id}`}
                  className="pano-alert-row"
                  onClick={() => setTab("gorevler")}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    fontSize: 13,
                    cursor: "pointer",
                    padding: "8px 10px",
                    background: overdue ? "var(--bg-danger)" : "var(--bg-warning)",
                    borderLeft: `3px solid ${overdue ? "var(--text-danger)" : "var(--fill-warning)"}`,
                    borderRadius: "var(--radius)",
                  }}
                >
                  <i
                    className={`ti ${typeInfo.icon}`}
                    style={{ fontSize: 14 }}
                    aria-hidden="true"
                  ></i>
                  <span style={{ flex: 1 }}>
                    {c ? `${c.name} - ` : ""}
                    {t.title}
                  </span>
                  <Badge tone={overdue ? "danger" : "warning"}>
                    {overdue ? "Gecikti" : "Bugün"}
                  </Badge>
                </div>
              );
            })}
            {orderRhythmAlerts.map(({ customer, typicalInterval, daysSinceLast, orderCount }) => (
              <div
                key={`rhythm-${customer.id}`}
                title={`Geçmiş ${orderCount} siparişine göre tipik olarak ${typicalInterval} günde bir sipariş veriyor`}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  fontSize: 13,
                  padding: "8px 10px",
                  background: "var(--bg-warning)",
                  borderLeft: "3px solid var(--fill-warning)",
                  borderRadius: "var(--radius)",
                }}
              >
                <span
                  className="pano-alert-row"
                  style={{ flex: 1, cursor: "pointer" }}
                  onClick={() => setViewingCustomer(customer)}
                >
                  {customer.name} - genelde {typicalInterval} günde bir sipariş verirdi,{" "}
                  {daysSinceLast} gündür yok
                </span>
                {customer.phone && (
                  <button
                    type="button"
                    onClick={() => {
                      const message = buildOrderCheckInMessage(
                        customer,
                        typicalInterval,
                        daysSinceLast,
                        companySettings,
                      );
                      window.open(
                        `https://wa.me/${toWhatsAppNumber(customer.phone)}?text=${encodeURIComponent(message)}`,
                        "_blank",
                        "noopener,noreferrer",
                      );
                    }}
                    style={{ fontSize: 12, flexShrink: 0 }}
                  >
                    WhatsApp
                  </button>
                )}
                <Badge tone="warning">Sipariş ritmi bozuldu</Badge>
              </div>
            ))}
            {lowStockItems.map((item) => (
              <div
                key={`stock-${item.id}`}
                className="pano-alert-row"
                onClick={() => setTab("stokmalzeme")}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  fontSize: 13,
                  cursor: "pointer",
                  padding: "8px 10px",
                  background: "var(--bg-danger)",
                  borderLeft: "3px solid var(--text-danger)",
                  borderRadius: "var(--radius)",
                }}
              >
                <span style={{ flex: 1 }}>
                  {item.name} - {item.quantityOnHand} {item.unit} kaldı (kritik seviye{" "}
                  {item.reorderThreshold} {item.unit})
                </span>
                <Badge tone="danger">Stok azaldı</Badge>
              </div>
            ))}
            {membershipAlerts.map((alert) => (
              <div
                key={`membership-${alert.deal.id}-${alert.type}`}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  fontSize: 13,
                  padding: "8px 10px",
                  background: "var(--bg-warning)",
                  borderLeft: "3px solid var(--fill-warning)",
                  borderRadius: "var(--radius)",
                }}
              >
                <span
                  className="pano-alert-row"
                  style={{ flex: 1, cursor: "pointer" }}
                  onClick={() => {
                    setEditingDeal(alert.deal);
                    setShowDealForm(true);
                  }}
                >
                  {alert.customer.name} -{" "}
                  {alert.type === "session"
                    ? `${alert.remaining} seans kaldı`
                    : alert.daysLeft < 0
                      ? "üyelik süresi doldu"
                      : `üyelik ${alert.daysLeft} gün sonra bitiyor`}
                </span>
                {alert.customer.phone && (
                  <button
                    type="button"
                    onClick={async () => {
                      const link = await generateApprovalLink(alert.deal);
                      const message = buildRenewalMessage(
                        alert.deal,
                        alert.customer,
                        alert,
                        companySettings,
                        link,
                      );
                      window.open(
                        `https://wa.me/${toWhatsAppNumber(alert.customer.phone)}?text=${encodeURIComponent(message)}`,
                        "_blank",
                        "noopener,noreferrer",
                      );
                    }}
                    style={{ fontSize: 12, flexShrink: 0 }}
                  >
                    WhatsApp
                  </button>
                )}
                <Badge tone="warning">Yenileme</Badge>
              </div>
            ))}
            {churnAlerts.map((alert) => (
              <div
                key={`churn-${alert.customer.id}`}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  fontSize: 13,
                  padding: "8px 10px",
                  background: alert.level === "high" ? "var(--bg-danger)" : "var(--bg-warning)",
                  borderLeft: `3px solid ${alert.level === "high" ? "var(--text-danger)" : "var(--text-warning)"}`,
                  borderRadius: "var(--radius)",
                }}
              >
                <span
                  className="pano-alert-row"
                  style={{ flex: 1, cursor: "pointer" }}
                  onClick={() => setViewingCustomer(alert.customer)}
                >
                  {alert.level === "high"
                    ? `${alert.customer.name} - ${alert.daysSince} gündür derse gelmedi`
                    : `${alert.customer.name} - ders sıklığı %${alert.dropPercent} azaldı`}
                </span>
                {alert.customer.phone && (
                  <button
                    type="button"
                    onClick={() => {
                      const message = buildWinBackMessage(alert.customer, alert, companySettings);
                      window.open(
                        `https://wa.me/${toWhatsAppNumber(alert.customer.phone)}?text=${encodeURIComponent(message)}`,
                        "_blank",
                        "noopener,noreferrer",
                      );
                    }}
                    style={{ fontSize: 12, flexShrink: 0 }}
                  >
                    WhatsApp
                  </button>
                )}
                <Badge tone={alert.level === "high" ? "danger" : "warning"}>
                  {alert.level === "high" ? "Seni özledik" : "Azalma"}
                </Badge>
              </div>
            ))}
            {waitlistFillableAlerts.map(({ group, waitCount }) => (
              <div
                key={`waitlist-${group.id}`}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  fontSize: 13,
                  padding: "8px 10px",
                  background: "var(--bg-accent)",
                  borderLeft: "3px solid var(--text-accent)",
                  borderRadius: "var(--radius)",
                }}
              >
                <span style={{ flex: 1 }}>
                  {group.name} dersinde yer açıldı - yedek listede {waitCount} kişi var
                </span>
                <button
                  type="button"
                  onClick={() => promoteFromWaitlistIfAny(group.id)}
                  style={{ fontSize: 12, flexShrink: 0 }}
                >
                  Doldur
                </button>
              </div>
            ))}
            {stuckDeals.map(({ deal, daysOpen }) => (
              <div
                key={`stuck-${deal.id}`}
                className="pano-alert-row"
                onClick={() => {
                  setTab("firsat");
                  setEditingDeal(deal);
                  setShowDealForm(true);
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  fontSize: 13,
                  cursor: "pointer",
                  padding: "8px 10px",
                  background: "var(--bg-warning)",
                  borderLeft: "3px solid var(--fill-warning)",
                  borderRadius: "var(--radius)",
                }}
              >
                <span style={{ flex: 1 }}>
                  {customerById(deal.customerId)?.name || "Bilinmeyen müşteri"} -{" "}
                  {stageLabel(deal.stage, undefined, companySettings?.sector)} aşamasında {daysOpen}{" "}
                  gündür bekliyor
                </span>
                <Badge tone="warning">Takip gerekiyor</Badge>
              </div>
            ))}
            {freedAppointmentAlerts.map(({ deal, apptTime }) => (
              <div
                key={`freed-${deal.id}`}
                className="pano-alert-row"
                onClick={() => setTab("musteri")}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  fontSize: 13,
                  cursor: "pointer",
                  padding: "8px 10px",
                  background: "var(--bg-accent)",
                  borderLeft: "3px solid var(--text-accent)",
                  borderRadius: "var(--radius)",
                }}
              >
                <span style={{ flex: 1 }}>
                  {apptTime.toLocaleDateString("tr-TR", { day: "numeric", month: "short" })}{" "}
                  {apptTime.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })} -{" "}
                  {customerById(deal.customerId)?.name || "Bilinmeyen müşteri"} (
                  {deal.lostReason?.toLocaleLowerCase("tr")}) randevusu boşaldı
                </span>
                <Badge tone="accent">Doldurulabilir</Badge>
              </div>
            ))}
            {unassignedUpcomingAppointments.map(({ deal, apptTime }) => (
              <div
                key={`unassigned-${deal.id}`}
                className="pano-alert-row"
                onClick={() => {
                  setTab("firsat");
                  setEditingDeal(deal);
                  setShowDealForm(true);
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  fontSize: 13,
                  cursor: "pointer",
                  padding: "8px 10px",
                  background: "var(--bg-warning)",
                  borderLeft: "3px solid var(--fill-warning)",
                  borderRadius: "var(--radius)",
                }}
              >
                <span style={{ flex: 1 }}>
                  {apptTime.toLocaleDateString("tr-TR", { day: "numeric", month: "short" })}{" "}
                  {apptTime.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })} -{" "}
                  {customerById(deal.customerId)?.name || "Bilinmeyen müşteri"} için Sorumlu
                  atanmamış
                </span>
                <Badge tone="warning">Atanmamış</Badge>
              </div>
            ))}
          </div>
        )}
        {lowStockItems.length > 0 && (
          <button
            type="button"
            onClick={() =>
              downloadXlsx(
                "siparis-listesi.xlsx",
                ["Malzeme", "Kalan Miktar", "Birim", "Kritik Seviye", "Tedarikçi"],
                lowStockItems.map((item) => [
                  item.name,
                  item.quantityOnHand,
                  item.unit,
                  item.reorderThreshold,
                  item.supplierName || "",
                ]),
              )
            }
            style={{ fontSize: 12, marginTop: 8, display: "flex", alignItems: "center", gap: 4 }}
          >
            <i className="ti ti-download" style={{ fontSize: 14 }} aria-hidden="true"></i>
            Sipariş listesini indir ({lowStockItems.length})
          </button>
        )}
      </div>

      <div
        style={{
          display: "flex",
          gap: 12,
          alignItems: "center",
          flexWrap: "wrap",
          marginBottom: "1.5rem",
        }}
      >
        <RangeFilter value={panoRange} onChange={setPanoRange} />
        <div style={{ marginLeft: "auto" }}>
          <DateRangeFilter
            from={panoRangeFrom}
            to={panoRangeTo}
            onFromChange={onPanoRangeFromChange}
            onToChange={onPanoRangeToChange}
          />
        </div>
      </div>

      <p
        style={{
          fontSize: 12,
          fontWeight: 600,
          color: "var(--text-secondary)",
          textTransform: "uppercase",
          margin: "0 0 8px",
        }}
      >
        Şu an
      </p>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(140px,1fr))",
          gap: 12,
          marginBottom: "1.5rem",
        }}
      >
        <MetricCard
          label={dealWords.openFilterLabel}
          value={openDeals.length}
          onClick={
            openDeals.length > 0
              ? () => openDealOrList(openDeals, dealWords.openFilterLabel)
              : undefined
          }
        />
        <MetricCard
          label={dealWords.openValueLabel}
          value={formatTL(totalOpenValue)}
          onClick={
            openDeals.length > 0
              ? () => openDealOrList(openDeals, dealWords.openFilterLabel)
              : undefined
          }
        />
        <MetricCard
          label={
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
              Beklenen gelir{" "}
              <InfoTip
                text={
                  `${dealWords.openGenPluralPhrase} tutarı, aşamalarına göre kapanma olasılığıyla çarpılıp toplanır:\n` +
                  Object.entries(STAGE_PROBABILITY)
                    .map(
                      ([id, p]) =>
                        `${stageLabel(id, "kurumsal", companySettings?.sector)} → %${Math.round(p * 100)}`,
                    )
                    .join("\n") +
                  "\n\nGerçek bir tahsilat garantisi değil, kaba bir tahmindir."
                }
              />
            </span>
          }
          value={formatTL(expectedRevenue)}
          sub="Aşama olasılığına göre tahmini"
        />
        {nextMonthForecast !== null && (
          <MetricCard
            label={
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                Gelecek ay tahmini{" "}
                <InfoTip text="Son 3 tam ayda (içinde bulunulan ay hariç) kazanılan ortalama aylık gelir. Beklenen gelir'den farklı olarak açık pipeline'a değil, geçmiş performansa dayanır." />
              </span>
            }
            value={formatTL(nextMonthForecast)}
            sub="Son 3 ayın ortalaması"
          />
        )}
        {passiveCustomerRate !== null && (
          <MetricCard
            label={
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                Pasif müşteri oranı{" "}
                <InfoTip
                  text={`En az bir kez satın almış ama son ${PASSIVE_CUSTOMER_DAYS} gündür hiç yeni işlemi/randevusu olmayan ve şu an açık bir kaydı da bulunmayan müşteri oranı. Gerçek bir abonelik iptali takibi değildir, kaba bir "uzun süredir işlem yapmadı" göstergesidir.`}
                />
              </span>
            }
            value={`%${passiveCustomerRate}`}
            tone={passiveCustomerRate > 30 ? "danger" : undefined}
          />
        )}
        <MetricCard
          label="Bekleyen alacak"
          value={formatTL(totalOutstanding)}
          onClick={
            dealsWithOutstanding.length > 0
              ? () =>
                  openDealOrList(
                    dealsWithOutstanding,
                    `Bekleyen alacağı olan ${DEAL_WORD_FORMS[dealKind].plural}`,
                  )
              : undefined
          }
        />
        {supportsGroupClasses(companySettings?.sector) && (
          <MetricCard
            label={
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                {groupClassWords(companySettings?.sector).panoMetricLabel}{" "}
                <InfoTip text={groupClassWords(companySettings?.sector).panoMetricInfoTip} />
              </span>
            }
            value={activeMemberships.length}
            tone="success"
            onClick={
              activeMemberships.length > 0
                ? () =>
                    openDealOrList(
                      activeMemberships,
                      groupClassWords(companySettings?.sector).panoMetricLabel,
                    )
                : undefined
            }
          />
        )}
        <MetricCard
          label="Hatırlatması olan"
          value={dealsWithReminder.length}
          tone="warning"
          onClick={
            dealsWithReminder.length > 0
              ? () =>
                  openDealOrList(
                    dealsWithReminder,
                    `Hatırlatması olan ${DEAL_WORD_FORMS[dealKind].plural}`,
                  )
              : undefined
          }
        />
        <MetricCard
          label={
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
              Açık destek talepleri{" "}
              <InfoTip text="Durumu Çözüldü veya Kapatıldı olmayan destek talepleri." />
            </span>
          }
          value={openTicketsCount}
          onClick={
            openTicketsCount > 0
              ? () =>
                  openTicketOrList(
                    tickets.filter((t) => !TERMINAL_STATUSES.includes(t.status)),
                    "Açık destek talepleri",
                  )
              : undefined
          }
        />
        <MetricCard
          label={
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
              SLA aşılan talepler{" "}
              <InfoTip text="Hedef çözüm süresi geçmiş ama hâlâ açık olan destek talepleri." />
            </span>
          }
          value={breachedTicketsCount}
          tone="danger"
          onClick={
            breachedTicketsCount > 0
              ? () => openTicketOrList(breachedTickets, "SLA aşılan talepler")
              : undefined
          }
        />
        <MetricCard
          label={
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
              Okunmamış mesaj{" "}
              <InfoTip text="Müşterinin (portal veya destek talebi üzerinden) yeni mesaj gönderdiği, henüz açıp görüntülemediğiniz talepler." />
            </span>
          }
          value={unreadMessagesCount}
          tone={unreadMessagesCount > 0 ? "danger" : undefined}
          onClick={
            unreadMessagesCount > 0
              ? () => openTicketOrList(ticketsWithUnread, "Okunmamış mesajı olan talepler")
              : undefined
          }
        />
      </div>

      <p
        style={{
          fontSize: 12,
          fontWeight: 600,
          color: "var(--text-secondary)",
          textTransform: "uppercase",
          margin: "0 0 8px",
        }}
      >
        {rangeLabel}
      </p>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(140px,1fr))",
          gap: 12,
          marginBottom: "1.5rem",
        }}
      >
        <MetricCard
          label="Kazanılan"
          value={wonDeals.length}
          tone="success"
          onClick={
            wonDeals.length > 0
              ? () => openDealOrList(wonDeals, `Kazanılan ${DEAL_WORD_FORMS[dealKind].plural}`)
              : undefined
          }
        />
        <MetricCard
          label="Toplam gelir"
          value={formatTL(rangeRevenue)}
          onClick={
            wonDeals.length > 0
              ? () => openDealOrList(wonDeals, `Kazanılan ${DEAL_WORD_FORMS[dealKind].plural}`)
              : undefined
          }
        />
        <MetricCard label="Toplam gider" value={formatTL(rangeCost)} />
        <MetricCard
          label="Toplam kâr"
          value={formatTL(rangeProfit)}
          sub={rangeProfitMargin !== null ? `%${rangeProfitMargin} kâr marjı` : undefined}
          tone={rangeProfit >= 0 ? "success" : "danger"}
        />
        <MetricCard label="Toplam tahsilat" value={formatTL(totalCollected)} />
        <MetricCard
          label={`Ortalama ${DEAL_WORD_FORMS[dealKind].bare} büyüklüğü`}
          value={rangeAvgDealSize !== null ? formatTL(rangeAvgDealSize) : "-"}
        />
        {noShowRate !== null && (
          <MetricCard
            label="Gelmeme oranı"
            value={`%${noShowRate}`}
            tone={noShowRate > 20 ? "danger" : undefined}
          />
        )}
        {avgCompletionDays !== null && (
          <MetricCard label="Ortalama tamamlanma süresi" value={`${avgCompletionDays} gün`} />
        )}
        {recurringRevenueRate !== null && (
          <MetricCard label="Tekrarlayan gelir oranı" value={`%${recurringRevenueRate}`} />
        )}
        {onlineSalesRate !== null && (
          <MetricCard label="Online satış oranı" value={`%${onlineSalesRate}`} />
        )}
      </div>

      {(wonDeals.length > 0 || lostDeals.length > 0) && (
        <div style={{ marginBottom: "1.5rem" }}>
          <p
            style={{
              fontSize: 14,
              fontWeight: 500,
              margin: "0 0 8px",
              display: "flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            Personel Performansı
            <InfoTip
              text={`Seçili tarih aralığında (yukarıdaki ${rangeLabel}) kapanan (kazanılan + kaybedilen) ${DEAL_WORD_FORMS[dealKind].genPlural}, her ${DEAL_WORD_FORMS[dealKind].loc} seçtiğiniz "Sorumlu" kişiye göre dağılımı ve kazanma oranı. ${dealWords.columnHeader} formunda sorumlu atamazsanız "Atanmamış" altında görünür.`}
            />
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {Object.entries(
              [...wonDeals, ...lostDeals].reduce((acc, d) => {
                const key = d.assignedTo || "unassigned";
                const stats = (acc[key] ||= { won: 0, lost: 0, revenue: 0, commissionParts: [] });
                if (d.stage === "kazanildi") {
                  stats.won += 1;
                  stats.revenue += d.value || 0;
                  // Prim, mümkünse hizmet bazında (price_list_items.commission_percent)
                  // hesaplanır - Kalemler'i (dealLineItems) veya kendi randevusunu
                  // alırken seçtiği service_ids'i kullanır; ikisi de yoksa (elle
                  // girilmiş tek tutar) personelin genel oranına düşer, öncekiyle
                  // BİREBİR AYNI davranış.
                  const itemsForDeal = dealLineItems.filter((li) => li.dealId === d.id);
                  const parts =
                    itemsForDeal.length > 0
                      ? itemsForDeal.map((li) => ({
                          amount: (Number(li.quantity) || 1) * (Number(li.unitPrice) || 0),
                          commissionPercent: li.priceItemId
                            ? (priceListItems.find((p) => p.id === li.priceItemId)
                                ?.commissionPercent ?? null)
                            : null,
                        }))
                      : Array.isArray(d.customFields?.service_ids) &&
                          d.customFields.service_ids.length > 0
                        ? d.customFields.service_ids.map((id) => {
                            const item = priceListItems.find((p) => p.id === id);
                            return {
                              amount: Number(item?.price) || 0,
                              commissionPercent: item?.commissionPercent ?? null,
                            };
                          })
                        : [{ amount: Number(d.value) || 0, commissionPercent: null }];
                  stats.commissionParts.push(...parts);
                } else stats.lost += 1;
                return acc;
              }, {}),
            )
              .sort((a, b) => b[1].revenue - a[1].revenue)
              .map(([assigneeId, stats]) => {
                const member = teamMembers.find((m) => m.id === assigneeId);
                const label =
                  assigneeId === "unassigned"
                    ? "Atanmamış"
                    : assigneeId === session.user.id
                      ? `${session.user.user_metadata?.full_name || session.user.email} (Ben)`
                      : member?.name || member?.email || "Bilinmeyen";
                const total = stats.won + stats.lost;
                const rate = total > 0 ? Math.round((stats.won / total) * 100) : null;
                const usesServiceRate = stats.commissionParts.some(
                  (p) => p.commissionPercent != null,
                );
                const hasCommission =
                  member?.commissionPercent != null ||
                  member?.chairRentalFee != null ||
                  usesServiceRate;
                const payout = hasCommission
                  ? stats.commissionParts.reduce(
                      (sum, p) =>
                        sum +
                        p.amount *
                          ((p.commissionPercent != null
                            ? p.commissionPercent
                            : member?.commissionPercent || 0) /
                            100),
                      0,
                    ) - (member?.chairRentalFee || 0)
                  : null;
                return (
                  <div
                    key={assigneeId}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      background: "var(--surface-1)",
                      borderRadius: "var(--radius)",
                      padding: "8px 12px",
                    }}
                  >
                    <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <InitialsAvatar name={label} />
                      <span style={{ fontSize: 13 }}>{label}</span>
                    </span>
                    <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>
                      {stats.won} {DEAL_WORD_FORMS[dealKind].bare} ·{" "}
                      <strong style={{ color: "var(--text-primary)" }}>
                        {formatTL(stats.revenue)}
                      </strong>
                      {rate !== null && (
                        <>
                          {" "}
                          ·{" "}
                          <span style={{ color: "var(--text-success)" }}>
                            %{rate} kazanma oranı
                          </span>
                        </>
                      )}
                      {payout !== null && (
                        <>
                          {" "}
                          ·{" "}
                          <span
                            style={{ color: "var(--text-accent)" }}
                            title={`${usesServiceRate ? "Bazı hizmetlerde kendi prim oranı uygulandı, diğerlerinde " : ""}genel oran %${member?.commissionPercent || 0}${member?.chairRentalFee ? ` − ${formatTL(member.chairRentalFee)} koltuk kirası` : ""}`}
                          >
                            Hakediş: {formatTL(payout)}
                          </span>
                        </>
                      )}
                    </span>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {customers.length === 0 && deals.length === 0 ? (
        <div
          style={{
            background: "var(--surface-1)",
            borderRadius: "var(--radius-lg)",
            boxShadow: "var(--shadow-sm)",
            padding: "2rem 1.5rem",
            textAlign: "center",
          }}
        >
          <p style={{ fontWeight: 500, margin: "0 0 4px" }}>Henüz veri yok</p>
          <p style={{ fontSize: 14, color: "var(--text-secondary)", margin: "0 0 16px" }}>
            Başlamak için önce bir müşteri ekleyin, sonra ona bir{" "}
            {DEAL_WORD_FORMS[dealWordKind(companySettings?.sector)].bare} tanımlayın.
          </p>
          <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
            <button
              onClick={() => {
                setTab("musteri");
                setShowCustomerForm(true);
              }}
              style={{
                background: "var(--fill-accent)",
                color: "var(--on-accent)",
                border: "none",
              }}
            >
              Müşteri ekle
            </button>
            <button
              onClick={seedDemoData}
              style={{ background: "var(--surface-1)", border: "0.5px solid var(--border)" }}
            >
              Örnek verilerle başla
            </button>
          </div>
        </div>
      ) : (
        <div>
          <p style={{ fontSize: 14, fontWeight: 500, margin: "0 0 8px" }}>
            {dealWordKind(companySettings?.sector) === "uyelik"
              ? "Üyelik aşamaları"
              : dealWordKind(companySettings?.sector) === "randevu"
                ? "Randevu aşamaları"
                : dealWordKind(companySettings?.sector) === "rezervasyon"
                  ? "Rezervasyon aşamaları"
                  : "Teklif aşamaları"}
          </p>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(140px,1fr))",
              gap: 8,
            }}
          >
            {STAGES.filter((s) => s.id !== "kaybedildi").map((stage) => {
              const stageDeals = deals.filter((d) => d.stage === stage.id);
              const tone = stageTone(stage.id);
              return (
                <div key={stage.id}>
                  <div
                    style={{
                      fontSize: 12,
                      color: "var(--text-secondary)",
                      marginBottom: 6,
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                    }}
                  >
                    <span
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: "50%",
                        background: TONE_COLORS[tone].color,
                        flexShrink: 0,
                      }}
                    />
                    {stageLabel(stage.id, undefined, companySettings?.sector)} · {stageDeals.length}
                  </div>
                  {stageDeals.length === 0 && (
                    <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Boş</div>
                  )}
                  {stageDeals.map((d) => {
                    const c = customerById(d.customerId);
                    return (
                      <div
                        key={d.id}
                        style={{
                          background:
                            tone === "default" ? "var(--surface-1)" : TONE_COLORS[tone].background,
                          border: tone === "default" ? "0.5px solid var(--border)" : "none",
                          borderRadius: "var(--radius)",
                          padding: 8,
                          marginBottom: 6,
                          fontSize: 13,
                          color:
                            tone === "default" ? "var(--text-primary)" : TONE_COLORS[tone].color,
                        }}
                      >
                        {c?.name || "Bilinmeyen müşteri"}
                        <br />
                        <span style={{ fontSize: 12, opacity: 0.85 }}>{formatTL(d.value)}</span>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {deals.length > 0 && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(260px,1fr))",
            gap: 12,
            marginTop: "1.5rem",
          }}
        >
          <div
            style={{
              background: "var(--surface-1)",
              borderRadius: "var(--radius-lg)",
              boxShadow: "var(--shadow-sm)",
              padding: "1rem",
            }}
          >
            <p style={{ fontSize: 14, fontWeight: 500, margin: "0 0 8px" }}>Gelir ve kâr</p>
            <div style={{ display: "flex", gap: 12, marginBottom: 12 }}>
              <span
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  fontSize: 12,
                  color: "var(--text-secondary)",
                }}
              >
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: "var(--fill-accent)",
                    display: "inline-block",
                  }}
                />
                Gelir
              </span>
              <span
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  fontSize: 12,
                  color: "var(--text-secondary)",
                }}
              >
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: "var(--fill-success)",
                    display: "inline-block",
                  }}
                />
                Kâr
              </span>
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "flex-end",
                gap: 8,
                height: 130,
                overflowX: "auto",
              }}
            >
              {revenueProfitByBucket.map((m) => (
                <div
                  key={m.label}
                  style={{
                    flex: "1 0 28px",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 4,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 90 }}>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                      <span
                        style={{
                          fontSize: 9,
                          color: "var(--text-secondary)",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {formatTL(m.revenue)}
                      </span>
                      <div
                        title={formatTL(m.revenue)}
                        style={{
                          width: 10,
                          height: Math.max(4, (m.revenue / maxBucketValue) * 80),
                          background: "var(--fill-accent)",
                          borderRadius: 3,
                        }}
                      />
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                      <span
                        style={{
                          fontSize: 9,
                          color: m.profit < 0 ? "var(--text-danger)" : "var(--text-secondary)",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {m.profit < 0 ? `-${formatTL(Math.abs(m.profit))}` : formatTL(m.profit)}
                      </span>
                      <div
                        title={formatTL(m.profit)}
                        style={{
                          width: 10,
                          height: Math.max(4, (Math.abs(m.profit) / maxBucketValue) * 80),
                          background: "var(--fill-success)",
                          borderRadius: 3,
                        }}
                      />
                    </div>
                  </div>
                  <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>{m.label}</span>
                </div>
              ))}
            </div>
          </div>

          <div
            style={{
              background: "var(--surface-1)",
              borderRadius: "var(--radius-lg)",
              boxShadow: "var(--shadow-sm)",
              padding: "1rem",
            }}
          >
            <p style={{ fontSize: 14, fontWeight: 500, margin: "0 0 12px" }}>Kazanma oranı</p>
            {winRate === null ? (
              <p style={{ fontSize: 13, color: "var(--text-muted)" }}>
                Henüz kapanmış {DEAL_WORD_FORMS[dealKind].bare} yok.
              </p>
            ) : (
              <div>
                <p
                  style={{
                    fontSize: 28,
                    fontWeight: 600,
                    margin: "0 0 4px",
                    color: "var(--text-success)",
                  }}
                >
                  %{winRate}
                </p>
                <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: 0 }}>
                  {wonDeals.length} kazanıldı · {lostDeals.length} kaybedildi
                </p>
              </div>
            )}
            {lostReasonCounts.length > 0 && (
              <div style={{ marginTop: 14 }}>
                <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: "0 0 6px" }}>
                  Kayıp nedenleri
                </p>
                {lostReasonCounts.map((r) => {
                  const maxCount = Math.max(...lostReasonCounts.map((x) => x.count));
                  return (
                    <div key={r.reason} style={{ marginBottom: 6 }}>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          fontSize: 12,
                          marginBottom: 2,
                        }}
                      >
                        <span>{r.reason}</span>
                        <span style={{ color: "var(--text-secondary)" }}>{r.count}</span>
                      </div>
                      <div style={{ height: 6, borderRadius: 3, background: "var(--surface-2)" }}>
                        <div
                          title={`${r.reason}: ${r.count}`}
                          style={{
                            height: "100%",
                            width: `${Math.max(6, (r.count / maxCount) * 100)}%`,
                            borderRadius: 3,
                            background: "var(--text-danger)",
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div
            style={{
              background: "var(--surface-1)",
              borderRadius: "var(--radius-lg)",
              boxShadow: "var(--shadow-sm)",
              padding: "1rem",
            }}
          >
            <p
              style={{
                fontSize: 14,
                fontWeight: 500,
                margin: "0 0 4px",
                display: "flex",
                alignItems: "center",
                gap: 4,
              }}
            >
              Aşama Hunisi
              <InfoTip
                text={`Şu an açık olan (kapanmamış) ${DEAL_WORD_FORMS[dealKind].plural}, aşamalarına göre dağılımı - hangi aşamada ne kadar kayıt birikmiş, "tıkanma" olan yeri gösterir.`}
              />
            </p>
            {openDeals.length === 0 ? (
              <p style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 10 }}>
                Şu an açık {DEAL_WORD_FORMS[dealKind].plural} yok.
              </p>
            ) : (
              <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
                {STAGES.filter((s) => s.id !== "kazanildi" && s.id !== "kaybedildi").map((s) => {
                  const count = openDeals.filter((d) => d.stage === s.id).length;
                  const maxStageCount = Math.max(
                    1,
                    ...STAGES.filter((x) => x.id !== "kazanildi" && x.id !== "kaybedildi").map(
                      (x) => openDeals.filter((d) => d.stage === x.id).length,
                    ),
                  );
                  const tone = stageTone(s.id);
                  const barColor =
                    tone === "default" ? "var(--text-muted)" : TONE_COLORS[tone].color;
                  return (
                    <div key={s.id}>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          fontSize: 12,
                          marginBottom: 2,
                        }}
                      >
                        <span>{stageLabel(s.id, "kurumsal", companySettings?.sector)}</span>
                        <span style={{ color: "var(--text-secondary)" }}>{count}</span>
                      </div>
                      <div style={{ height: 8, borderRadius: 4, background: "var(--surface-2)" }}>
                        <div
                          title={`${count}`}
                          style={{
                            height: "100%",
                            width: `${count > 0 ? Math.max(6, (count / maxStageCount) * 100) : 0}%`,
                            borderRadius: 4,
                            background: barColor,
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
