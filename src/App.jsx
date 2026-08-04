import React, { useState, useEffect, useRef, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import { supabase } from "./supabase";
import { Badge, TONE_COLORS, Modal, MetricCard, InfoTip, isFullNameValid, Toast, ConfirmDialog, TagInput, IconButton, MenuRow, VoiceInputButton, GoogleAuthButton, AuthDivider, uid, formatTL, daysAgo, downloadXlsx, toWhatsAppNumber, WhatsAppIcon, useSessionTimeout, useTheme, matchesDateRange, DateRangeFilter, PANO_RANGES, getRangeBounds, inRange, WEEKDAYS, WEEKDAYS_SHORT, nextWeeklyOccurrence, NotificationBell, OnboardingTour, getPortalUrl, translateAuthError, humanizeDbMessage, SELF_BOOKED_SOURCES, formatFileSize, MAX_TEAM_SIZE, parseAppointmentDateTime, RowActionsMenu, AttachmentList, PRICE_ITEM_NAME_EXAMPLES, ExportSelectionModal } from "./shared";
import { DEAL_WORD_FORMS, DEAL_TAB_STRINGS, SECTOR_DEMO_PRESETS } from "./staticData";
import { HELP_TOPICS, ANSWER_LIBRARY, ADVISOR_TIPS } from "./helpContent";
import { AuthModal, PasswordRecoveryModal } from "./Auth";
import Finance, { rowToCompanyExpense } from "./Finance";
import { rowToChannelCredential, rowToChannelMessage } from "./Messages";
import Support, {
  rowToTicket,
  rowToTicketMessage,
  rowToKbArticle,
  getSlaStatus,
  TERMINAL_STATUSES,
  STATUSES,
  ChatInbox,
  computeChatConversations,
} from "./Support";
import { ImportModal } from "./ImportExport";
import { TrackingScripts } from "./analytics";
import { PDF_TEMPLATES, buildMergeData, renderTemplateBlocks, TemplateGallery, TABLE_ROW_HEIGHT } from "./PdfTemplates";
import { TemplateEditor } from "./PdfTemplateEditor";
import {
  STAGES,
  SECTOR_PRESETS,
  stageLabel,
  stageTone,
  isAppointmentSector,
  isIndividualFocusedSector,
  dealWordKind,
  supportsSelfBooking,
  bookingModel,
  supportsGroupClasses,
  supportsSessionPackages,
  stageGuide,
  groupClassWords,
  rowToCustomFieldDef,
  SectorOnboardingModal,
  CustomFieldDefsManager,
  CustomFieldsSection,
  TagBadges,
  matchEmlakListing,
  buildEmlakListingTexts,
  computeAppointmentPenaltyBurn,
  sectorCustomerTags,
  sectorDealTags,
  appointmentPrepNoteExample,
} from "./Sectors";

// Beklenen Gelir tahmini için basit, sabit olasılık ağırlıkları — kullanıcı
// başına ayarlanabilir değil, bilinçli olarak (KISS). Kazanıldı/kaybedildi
// zaten "openDeals" dışında tutulduğu için burada yer almıyor.
const STAGE_PROBABILITY = { ilk_gorusme: 0.1, teklif: 0.3, muzakere: 0.6 };

// Müşterinin kendi kendine aldığı randevu için iki olası kaynak: müşteri
// portalından giriş yapıp alan (bookAppointment, "portal") veya hiç kaydı
// olmadan /randevu-al/{token} public widget'ından alan ("randevu_widget",
// lead-capture.js). İkisi de aynı "KOBİ'nin henüz dokunmadığı, gözden
// kaçmaması gereken talep" muamelesini görür. api/send-push.js'te AYNI liste
// ayrıca tutuluyor (src/ ile api/ arasında paylaşılan import yok) — biri
// değişirse diğeri de güncellenmeli.
const SECTORS = [
  "İnşaat", "Medikal / Sağlık", "Gıda", "Tekstil", "Elektrik / Elektronik",
  "Otomotiv", "Mobilya", "Perakende / Mağazacılık", "Toptan Ticaret",
  "Lojistik / Nakliye", "Turizm / Otelcilik", "Eğitim", "Danışmanlık",
  "Hukuk", "Muhasebe / Mali Müşavirlik", "Bilişim / Yazılım",
  "Reklam / Pazarlama", "Emlak", "Güzellik / Kuaförlük", "Temizlik",
  "Güvenlik", "Ambalaj", "Kimya", "Metal / Makine", "Enerji", "Tarım",
  "Sigorta", "Finans / Bankacılık", "Spor", "Sanat / Kültür", "Diğer",
];

function leadScore(lastContact) {
  if (!lastContact) return { label: "Soğuk", tone: "default" };
  const diff = Math.floor((Date.now() - new Date(lastContact).getTime()) / 86400000);
  if (diff <= 7) return { label: "Sıcak", tone: "success" };
  if (diff <= 30) return { label: "Ilık", tone: "warning" };
  return { label: "Soğuk", tone: "default" };
}

// Gölge Avcı eşleşme kartındaki "WhatsApp'tan gönder" butonu için hazır metin —
// mevcut wa.me linki deseniyle aynı (bkz. portal linki paylaşma butonu):
// otomatik gönderim yok, sadece WhatsApp'ı önceden doldurulmuş metinle açar,
// emlakçı gözden geçirip kendi gönderir.
function buildEmlakMatchMessage(deal, customer, companySettings) {
  const cf = deal.customFields || {};
  const details = [cf.mulk_tipi, cf.bolge, cf.oda_sayisi, cf.metrekare ? `${cf.metrekare} m²` : null].filter(Boolean).join(" · ");
  const fiyat = deal.value ? formatTL(deal.value) : "";
  const islem = cf.islem_turu === "Kiralama" ? "kiralık" : "satılık";
  const firstName = (customer.name || "").split(" ")[0] || customer.name;
  const firma = companySettings?.companyName ? `${companySettings.companyName} olarak ` : "";
  return `Merhaba ${firstName}, ${firma}aradığınız kriterlere uygun yeni bir ${islem} ilanımız var: ${details}${fiyat ? ` - ${fiyat}` : ""}. İlgilenirseniz detaylarını ve fotoğrafları hemen paylaşabilirim.`;
}

// Paket/üyelik yenileme hatırlatması — approvalLink opsiyonel, çağıran taraf
// (async generateApprovalLink sonucu) hazırsa geçiyor, hazır değilse linksiz
// gönderilir (yine de kullanışlı bir hatırlatma metni olur).
function buildRenewalMessage(deal, customer, alert, companySettings, approvalLink) {
  const firstName = (customer.name || "").split(" ")[0] || customer.name;
  const firma = companySettings?.companyName ? `${companySettings.companyName} olarak ` : "";
  const durum = alert.type === "session"
    ? (alert.remaining <= 0 ? `"${deal.title}" paketinizdeki seanslar bitti` : `"${deal.title}" paketinizin son ${alert.remaining} dersi kaldı`)
    : (alert.daysLeft < 0 ? `"${deal.title}" üyeliğinizin süresi doldu` : `"${deal.title}" üyeliğinizin bitmesine ${alert.daysLeft} gün kaldı`);
  const linkPart = approvalLink ? ` Yenilemek için: ${approvalLink}` : "";
  return `Merhaba ${firstName}, ${firma}${durum}. Devam etmek isterseniz sizi bekleriz!${linkPart}`;
}

// "Seni özledik" — derse katılım bazlı hareketsizlik tespit edilen üyeye
// gönderilecek hazır metin.
function buildWinBackMessage(customer, daysSince, companySettings) {
  const firstName = (customer.name || "").split(" ")[0] || customer.name;
  const firma = companySettings?.companyName ? `${companySettings.companyName} olarak ` : "";
  return `Merhaba ${firstName}, sizi ${daysSince} gündür derslerde göremedik, sizi özledik! ${firma}bir sonraki dersinizde görüşmeyi çok isteriz - uygun bir saat için bize yazabilirsiniz.`;
}

// Sipariş ritmi bozulan müşteriye "her şey yolunda mı" kontrolü — renewal/win-back
// ile aynı desen: hazır metni tek tıkla WhatsApp'a taşır, gönderim yine kullanıcının elinde.
function buildOrderCheckInMessage(customer, typicalInterval, daysSinceLast, companySettings) {
  const firstName = (customer.name || "").split(" ")[0] || customer.name;
  const firma = companySettings?.companyName ? `${companySettings.companyName} olarak ` : "";
  return `Merhaba ${firstName}, genelde ${typicalInterval} günde bir sipariş verirdiniz, ${daysSinceLast} gündür sizden yeni bir sipariş almadık. ${firma}her şey yolunda mı diye sormak istedik, ihtiyacınız varsa buradayız.`;
}

function median(nums) {
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

// Sipariş ritmi erken uyarısı: bir müşterinin geçmiş kazanılmış tekliflerinin
// (fiilen tamamlanmış siparişlerinin) tipik olarak kaç günde bir geldiğini
// öğrenip, bu sürenin belirgin ölçüde aşıldığı durumda erken bir uyarı üretir
// ("A Firması hep 45 günde bir alıyordu, 60 gün oldu henüz gelmedi"). AI/tahmin
// modeli DEĞİL — tamamen geçmiş tarihlerden çıkarılan basit bir istatistik.
// Ortalama yerine medyan kullanılıyor: tek seferlik anormal bir boşluk (örn.
// yaz tatili) ortalamayı yanıltıcı şekilde yukarı çekip uyarıyı geciktirmesin.
// En az 3 geçmiş sipariş olmadan güvenilir bir ritim çıkarılamaz, daha azı
// hiç değerlendirilmez. Günlük/haftalık gibi çok sık tekrarlayan siparişlerde
// (typicalInterval < 3 gün) doğal gün-gün oynamalar sürekli yanlış alarm
// üretir, bu yüzden onlar da atlanır.
const ORDER_RHYTHM_OVERDUE_FACTOR = 1.3;

function computeOrderRhythmAlerts(deals, customers) {
  const ordersByCustomer = new Map();
  for (const d of deals) {
    if (d.stage !== "kazanildi" || !d.customerId) continue;
    const dateStr = d.closedAt || d.createdAt;
    if (!dateStr) continue;
    if (!ordersByCustomer.has(d.customerId)) ordersByCustomer.set(d.customerId, []);
    ordersByCustomer.get(d.customerId).push(new Date(dateStr).getTime());
  }

  const now = Date.now();
  const alerts = [];
  for (const [customerId, timestamps] of ordersByCustomer) {
    if (timestamps.length < 3) continue;
    timestamps.sort((a, b) => a - b);
    const intervals = [];
    for (let i = 1; i < timestamps.length; i++) intervals.push((timestamps[i] - timestamps[i - 1]) / 86400000);
    const typicalInterval = median(intervals);
    if (typicalInterval < 3) continue;
    const daysSinceLast = (now - timestamps[timestamps.length - 1]) / 86400000;
    if (daysSinceLast < typicalInterval * ORDER_RHYTHM_OVERDUE_FACTOR) continue;
    const customer = customers.find((c) => c.id === customerId);
    if (!customer) continue;
    alerts.push({ customer, typicalInterval: Math.round(typicalInterval), daysSinceLast: Math.round(daysSinceLast), orderCount: timestamps.length });
  }
  return alerts.sort((a, b) => b.daysSinceLast / b.typicalInterval - a.daysSinceLast / a.typicalInterval);
}

// Açık (kazanılmamış/kaybedilmemiş) bir kayıt uzunca bir süre hiç ilerlemezse
// unutulmuş/takip edilmemiş olabilir — sektörden bağımsız, her satış/danışmanlık
// hattı için geçerli bir sinyal. Ayrı bir "aşama geçmişi" tablosu yok, bu yüzden
// "ne kadar süredir bu aşamada" yerine "ne kadar süredir hiç kapanmadı"
// (createdAt'ten) kullanılıyor — daha basit ve yeterince açıklayıcı bir yaklaşım,
// GERÇEK BİR ENGEL DEĞİL sadece görünürlük.
const STUCK_DEAL_DAYS_THRESHOLD = 3;
const STUCK_DEAL_DAYS_DANGER_THRESHOLD = 7;
// Liste ve Kanban'da ortak "kaç gündür açık" rozeti — computeStuckDeals'daki
// aynı createdAt-bazlı yaklaşımı tek bir kayıt için hesaplar.
function dealDaysOpen(deal) {
  if (!deal.createdAt || deal.stage === "kazanildi" || deal.stage === "kaybedildi") return null;
  return Math.floor((Date.now() - new Date(deal.createdAt).getTime()) / 86400000);
}
function computeStuckDeals(deals) {
  const now = Date.now();
  return deals
    .filter((d) => d.stage !== "kazanildi" && d.stage !== "kaybedildi" && d.createdAt)
    .map((d) => ({ deal: d, daysOpen: Math.floor((now - new Date(d.createdAt).getTime()) / 86400000) }))
    .filter((x) => x.daysOpen >= STUCK_DEAL_DAYS_THRESHOLD)
    .sort((a, b) => b.daysOpen - a.daysOpen);
}

// Vadesi geçmiş bakiye / kredi limiti uyarısı — GERÇEK BİR ENGEL DEĞİL, sadece
// bilgilendirme (kullanıcının kararı: "riskli müşteriye teklif vermek KOBİ'nin
// kendi bileceği iş"). "Ödeme Vadesi" (Peşin/30 gün/60 gün/90 gün) zaten var
// olan bir müşteri alanı — ayrı bir "vade tarihi" kolonu eklemeden, en eski
// ödenmemiş kazanılmış teklifin kapanma tarihine bu süre eklenip "vadesi geçti
// mi" hesaplanıyor. "Peşin" vade 0 gün sayılır (hiç beklememesi gerekirdi).
const PAYMENT_TERM_DAYS = { "Peşin": 0, "30 gün": 30, "60 gün": 60, "90 gün": 90 };

function computeCustomerCreditRisk(customer, deals, payments) {
  const creditLimit = Number(customer.customFields?.kredi_limiti) || 0;
  const paymentTerm = customer.customFields?.odeme_vadesi;
  const termDays = PAYMENT_TERM_DAYS[paymentTerm];
  if (!creditLimit && termDays === undefined) return null;

  const unpaidDeals = deals
    .filter((d) => d.customerId === customer.id && d.stage === "kazanildi")
    .map((d) => {
      const paid = payments.filter((p) => p.dealId === d.id).reduce((sum, p) => sum + (p.amount || 0), 0);
      return { ...d, remaining: (d.value || 0) - paid };
    })
    .filter((d) => d.remaining > 0);
  if (unpaidDeals.length === 0) return null;

  const balance = unpaidDeals.reduce((sum, d) => sum + d.remaining, 0);
  const overLimit = creditLimit > 0 && balance > creditLimit;

  let overdueBalance = 0;
  if (termDays !== undefined) {
    const now = Date.now();
    for (const d of unpaidDeals) {
      const dueDate = new Date(d.closedAt || d.createdAt).getTime() + termDays * 86400000;
      if (now > dueDate) overdueBalance += d.remaining;
    }
  }

  if (!overLimit && overdueBalance <= 0) return null;
  return { balance, creditLimit, overLimit, overdueBalance };
}

// No-show/geç iptal erken uyarısı — randevu sektörlerinde (Güzellik & Bakım,
// Sağlık/Klinik) bir müşteri habersiz gelmediyse ("Randevuya gelmedi") VEYA
// geç iptal ettiyse ("Geç iptal etti", bkz. AppointmentCancelPolicyBox) AYNI
// sayaçta birikir. strikeLimit kobinin Müsaitlik Saatleri'nde ayarladığı
// company_settings.appointment_penalty_strike_limit — HİÇ ayarlanmadıysa
// (null) ceza sistemi TAMAMEN KAPALI, bu fonksiyon hep null döner (bazı
// kobiler "iptal etse de sorun değil" diyor, o tercih tam olarak uygulanır).
// GERÇEK BİR ENGEL DEĞİL — sadece öneri; DealForm bunu görünce paymentMode'u
// "required"a ÖNERİR/varsayılan yapar, kobi yine de elle değiştirebilir.
function computeNoShowRisk(customer, deals, strikeLimit) {
  if (!strikeLimit) return null;
  const relevant = deals.filter((d) => d.customerId === customer.id && d.stage === "kaybedildi" && (d.lostReason === "Randevuya gelmedi" || d.lostReason === "Geç iptal etti"));
  if (relevant.length < strikeLimit) return null;
  const noShowCount = relevant.filter((d) => d.lostReason === "Randevuya gelmedi").length;
  const lateCancelCount = relevant.filter((d) => d.lostReason === "Geç iptal etti").length;
  return { noShowCount, lateCancelCount, totalCount: relevant.length };
}

function formatViewDuration(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes === 0) return `${seconds} sn`;
  return `${minutes} dk ${seconds} sn`;
}

// Bir hizmet/sipariş "kazanıldı"ya geçtiğinde iki şey otomatik tetiklenebilir:
// (1) fiyat listesi kaleminin "Tazeleme Süresi"ne göre bir sonraki hatırlatma
// (sadece üst "Ürün/Hizmet" seçicisinden gelen TEK birincil hizmet için —
// çoklu kalemli siparişlerde "tazeleme" kavramı belirsizleşir, bilinçli olarak
// atlanır), (2) kullanılan her fiyat kaleminin reçetesine göre stok düşümü
// (Kalemler'den price_item_id taşıyan satırlar VARSA onlar, yoksa üst
// seçiciden gelen tek hizmet, miktar 1 sayılır). Zaten var olan bir
// reminderDate'in üstüne YAZILMAZ — kullanıcı elle bir şey girdiyse
// korunur. Stok, ihtiyaçtan fazla tüketilirse BİLEREK negatife düşmesine
// izin verilir (0'da budanmaz) — bu, "malzeme sayımı tutmuyor" sinyalini
// gizlemek yerine görünür kılar (bkz. proje geneli "kısıtlama değil
// görünürlük" felsefesi).
function computeServiceCompletionEffects({ deal, lineItemsForDeal, priceListItems, priceItemIngredients, stockItems }) {
  const linkedLineItems = (lineItemsForDeal || []).filter((li) => li.priceItemId);
  const usages = linkedLineItems.length > 0
    ? linkedLineItems.map((li) => ({ priceItemId: li.priceItemId, quantity: Number(li.quantity) || 1 }))
    : (deal.customFields?.price_item_id ? [{ priceItemId: deal.customFields.price_item_id, quantity: 1 }] : []);

  const decrements = new Map();
  for (const usage of usages) {
    for (const ing of priceItemIngredients.filter((i) => i.priceItemId === usage.priceItemId)) {
      decrements.set(ing.stockItemId, (decrements.get(ing.stockItemId) || 0) + ing.quantity * usage.quantity);
    }
  }
  const stockUpdates = [];
  for (const [stockItemId, amount] of decrements) {
    const stockItem = stockItems.find((s) => s.id === stockItemId);
    if (!stockItem) continue;
    stockUpdates.push({ id: stockItemId, newQuantityOnHand: stockItem.quantityOnHand - amount });
  }

  let reminderUpdate = null;
  const primaryPriceItemId = deal.customFields?.price_item_id;
  if (primaryPriceItemId && !deal.reminderDate) {
    const priceItem = priceListItems.find((p) => p.id === primaryPriceItemId);
    if (priceItem?.refreshDays > 0) {
      const due = new Date(Date.now() + priceItem.refreshDays * 86400000);
      reminderUpdate = { reminder: `Tazeleme zamanı: ${priceItem.name}`, reminderDate: due.toISOString().slice(0, 10) };
    }
  }

  return { stockUpdates, reminderUpdate };
}

// Paket/kontör + üyelik bitiş uyarısı — Spor Merkezi/Eğitim-Kurs gibi paket
// satan sektörlerde iki farklı sinyali tek listede toplar: (1) kalan seans
// sayısı azalmış (session_total/session_used zaten var olan alanlar), (2)
// "Üyelik Bitiş Tarihi" yaklaşmış/geçmiş (o sektörlerde zaten var olan bir
// özel alan). Otomatik mesaj GÖNDERMEZ — sadece Pano'da görünür kılar,
// gönderim hep olduğu gibi tek tık wa.me ile elle yapılır.
const LOW_SESSION_THRESHOLD = 2;
const EXPIRY_WARNING_DAYS = 5;

function computeMembershipAlerts(deals, customers) {
  const alerts = [];
  const now = Date.now();
  for (const d of deals) {
    if (d.stage !== "kazanildi") continue;
    const customer = customers.find((c) => c.id === d.customerId);
    if (!customer) continue;

    if (d.sessionTotal > 0) {
      const remaining = d.sessionTotal - (d.sessionUsed || 0);
      if (remaining <= LOW_SESSION_THRESHOLD) {
        alerts.push({ customer, deal: d, type: "session", remaining });
      }
    }

    const bitisTarihi = d.customFields?.uyelik_bitis_tarihi;
    if (bitisTarihi) {
      const daysLeft = Math.ceil((new Date(bitisTarihi).getTime() - now) / 86400000);
      if (daysLeft <= EXPIRY_WARNING_DAYS) {
        alerts.push({ customer, deal: d, type: "expiry", daysLeft });
      }
    }
  }
  return alerts;
}

// Derse katılım bazlı hareketsizlik (churn) tespiti — computeOrderRhythmAlerts'ten
// KASITLI OLARAK AYRI: o "kazanılan teklif" ritmine bakıyor, bu ise Grup Dersleri
// kullanan sektörlerde (Spor Merkezi vb.) gerçek DERSE GELME sıklığına bakıyor —
// bir üyeliğin hâlâ aktif ama üyenin haftalardır derse gelmediği durumu yakalar.
// Hiç ders kaydı (enrollment) veya hiç yoklama geçmişi olmayan üyeler (henüz
// başlamamış/hiç ders almamış) değerlendirmeye alınmaz — "geri kazanma" ancak
// bir zamanlar düzenli gelen birine anlamlı.
const CHURN_INACTIVITY_DAYS = 14;

function computeAttendanceChurnRisk(customers, deals, groupClassEnrollments, classAttendance) {
  const now = Date.now();
  const alerts = [];
  for (const customer of customers) {
    const activeMembership = deals.find(
      (d) => d.customerId === customer.id && d.stage === "kazanildi" &&
        (!d.customFields?.uyelik_bitis_tarihi || new Date(d.customFields.uyelik_bitis_tarihi).getTime() >= now)
    );
    if (!activeMembership) continue;

    const hasEnrollment = groupClassEnrollments.some((e) => e.customerId === customer.id);
    if (!hasEnrollment) continue;

    const attendedTimestamps = classAttendance
      .filter((a) => a.customerId === customer.id && a.status === "geldi")
      .map((a) => new Date(a.occurrenceDate).getTime());
    if (attendedTimestamps.length === 0) continue;

    const daysSince = Math.floor((now - Math.max(...attendedTimestamps)) / 86400000);
    if (daysSince >= CHURN_INACTIVITY_DAYS) alerts.push({ customer, daysSince });
  }
  return alerts.sort((a, b) => b.daysSince - a.daysSince);
}

const LEAD_INFO_TEXT =
  "Son temas tarihine göre müşterinin ne kadar güncel takip edildiğini gösterir:\n" +
  "🟢 Sıcak - son 7 gün içinde temas edildi\n" +
  "🟠 Ilık - son 8-30 gün içinde temas edildi\n" +
  "⚪ Soğuk - 30 günden uzun süredir temas yok (veya hiç temas edilmedi)";

const PORTAL_INFO_TEXT =
  "Müşteri Portalı, müşterilerinizin kendi hesaplarıyla giriş yapıp tekliflerinin durumunu görebildiği, " +
  "destek talebi açabildiği ve sizinle mesajlaşabildiği ayrı bir alan (portal.binerly.com).\n\n" +
  "Var - bu müşteri portala kayıt olup kendi hesabını bu müşteri kaydına bağlamış.\n" +
  "Yok - bu müşteri henüz portala giriş yapmamış. Müşterinizin, kayıtlı e-posta adresiyle " +
  "portal üzerinden kendi hesabını oluşturması yeterli, özel bir davet göndermenize gerek yok - " +
  "isterseniz \"Linki paylaş\"a tıklayıp portal adresini WhatsApp'tan hatırlatabilirsiniz.";

const MARKETING_CONSENT_INFO_TEXT =
  "Türkiye'de kampanya/değerlendirme isteği gibi e-postalar göndermek için müşterinin gerçek, kendi verdiği " +
  "izni (İYS) gerekiyor - siz adına veremezsiniz.\n\n" +
  "Var - müşteri izin verdi (Müşteri Kazanma Linki, Müşteri Portalı veya e-posta ile çift onaydan).\n" +
  "İzin iste - müşteriye onay linkli bir e-posta gönderir.\n" +
  "İzin linki paylaş - müşterinin e-postası kayıtlı değilse, aynı onay linkini WhatsApp'tan (telefon kayıtlıysa) ya da panoya kopyalayarak paylaşır - müşteri linkten hem e-postasını girip hem izin verebiliyor.";

// Menüdeki tek tek öğeler artık kendi etiketiyle kendini anlatıyor (eskiden
// hepsi ikon-only butonlardı, tek bir dev InfoTip'te açıklanması gerekiyordu).
// Sadece Onay Linki'nin davranışı (e-imza yerine geçmediği, e-posta şartı)
// bariz olmadığı için o öğeye özel kısa bir InfoTip metni kaldı, bkz. aşağıda
// "Onay Linki" item tanımlarındaki `info` alanı.
const dealApprovalLinkInfoText =
  "Müşterinin e-postası kayıtlı olmalı. Görüntüleme ve onay durumları satırda otomatik görünür ama bu resmi bir elektronik imza değildir - önemli anlaşmalarda ıslak/nitelikli e-imza kullanın.";

const CUSTOMER_EMAIL_INFO_TEXT =
  "Güncel bir e-posta girmeniz önemli - teklif onay linki, müşteri portalı girişi ve hatırlatma e-postaları gibi " +
  "özellikler ancak müşterinin e-postası kayıtlıysa çalışır. Kaydettiğinizde müşteriye, kampanya/değerlendirme isteği " +
  "gibi e-postalar için iznini onaylayabileceği bir e-posta gönderilir - bu izni siz adına veremezsiniz, İYS kuralları gereği. " +
  "Bu izin e-postası ticari ileti sayılmadığı için Ayarlar'daki \"Müşterilere otomatik e-posta gönder\" kapalı olsa bile gönderilir.";

const CUSTOMER_TYPE_INFO_TEXT =
  "Kurumsal/Bireysel seçimi sadece bir etiket değil - Sektör alanının görünüp görünmeyeceğini, hangi özel alanların çıkacağını " +
  "ve teklif formundaki bazı metinleri (\"Kayıp nedeni\" yerine \"İptal nedeni\" gibi) uygulamanın birçok yerinde değiştirir. " +
  "Aşama isimleri ise önce sektörünüze (varsa) göre belirlenir, sektör bir aşamayı özelleştirmemişse kurumsal/bireysel ayrımına göre değişir.";

const SECTOR_FIELD_INFO_TEXT =
  "Bu, müşterinin kendi sektörü - Ayarlar'daki \"Sektör & Özel Alanlar\"da seçtiğiniz KENDİ şirket sektörünüzden " +
  "farklı bir alan. Burada seçtiğiniz değer, teklif formunda etiket önerisi olarak çıkabilir.";

const TAGS_INFO_TEXT =
  "Serbest metin etiketler - arama/filtrelemede ve listelerde kayda hızlıca göz atmak için kullanılır. " +
  "Sektörünüze göre bazı etiketler öneri olarak çıkar, istediğiniz herhangi bir kelimeyi de ekleyebilirsiniz.";

const SESSION_PACKAGE_INFO_TEXT =
  "Kuaför/klinik gibi paket/seans bazlı satış yapıyorsanız kullanın - toplam ve kullanılan seans sayısını siz " +
  "elle güncellersiniz (\"Seans kullanıldı\" butonuyla), kullanılan sayı toplama ulaşınca kart üzerinde " +
  "\"Paket tamamlandı\" rozeti otomatik görünür.";

const kdvRateInfoText = (sector) => {
  const kind = dealWordKind(sector);
  const label = kind === "uyelik" ? "Üyelik Özeti PDF'inde" : kind === "randevu" ? "Randevu Özeti PDF'inde" : kind === "rezervasyon" ? "Rezervasyon Özeti PDF'inde" : "yazdırılan teklif PDF'inde";
  return (
    `Yukarıdaki Tutar zaten KDV dahil, müşteriden alınan toplam tutarı DEĞİŞTİRMEZ - sadece ${label} ` +
    "\"Ara Toplam / KDV / Genel Toplam\" satırlarının nasıl bölüneceğini belirler."
  );
};

const ASSIGNEE_INFO_TEXT =
  "Bu teklif kazanıldığında, Pano'daki \"Personel Performansı\" bölümünde seçtiğiniz kişinin altında sayılır.";

const cariBakiyeInfoText = (sector) => {
  const kind = dealWordKind(sector);
  const noun = kind === "uyelik" ? "üyeliklerinin" : kind === "randevu" ? "randevularının" : kind === "rezervasyon" ? "rezervasyonlarının" : "tekliflerinin";
  return (
    `Bu bakiye, müşterinin "${stageLabel("kazanildi", "kurumsal", sector)}" durumundaki ${noun} toplam tutarından tahsil edilen ödemelerin düşülmesiyle bulunur. ` +
    "Resmi bir cari hesap kaydı değildir, sadece kendi takibiniz içindir."
  );
};

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

function rowToCustomer(r) {
  return {
    id: r.id,
    userId: r.user_id,
    name: r.name,
    customerType: r.customer_type || "kurumsal",
    sector: r.sector,
    region: r.region || "",
    address: r.address || "",
    phone: r.phone || "",
    email: r.email || "",
    notes: r.notes || "",
    lastContact: r.last_contact,
    createdAt: r.created_at,
    portalUserId: r.portal_user_id || null,
    deletedAt: r.deleted_at || null,
    tags: r.tags || [],
    customFields: r.custom_fields || {},
    appointmentCreditCount: r.appointment_credit_count || 0,
    marketingConsent: r.marketing_consent === true,
    marketingConsentAt: r.marketing_consent_at || null,
    marketingConsentSource: r.marketing_consent_source || null,
    photoConsent: r.photo_consent === true,
    photoConsentAt: r.photo_consent_at || null,
    photoConsentSource: r.photo_consent_source || null,
  };
}

function rowToDeal(r) {
  return {
    id: r.id,
    userId: r.user_id,
    customerId: r.customer_id,
    title: r.title,
    value: r.value,
    cost: r.cost || 0,
    stage: r.stage,
    kdvRate: r.kdv_rate ?? 20,
    reminder: r.reminder || "",
    reminderDate: r.reminder_date || "",
    lostReason: r.lost_reason || "",
    sessionTotal: r.session_total ?? null,
    sessionUsed: r.session_used ?? 0,
    createdAt: r.created_at,
    closedAt: r.closed_at || null,
    deletedAt: r.deleted_at || null,
    tags: r.tags || [],
    customFields: r.custom_fields || {},
    approvalToken: r.approval_token || null,
    approvedAt: r.approved_at || null,
    firstViewedAt: r.first_viewed_at || null,
    viewDurationSeconds: r.view_duration_seconds || 0,
    lateCancelCount: r.late_cancel_count || 0,
    notifyCustomer: r.notify_customer || false,
    assignedTo: r.assigned_to || null,
    paymentMode: r.payment_mode || "none",
    paymentStatus: r.payment_status || null,
  };
}

function rowToPaymentCredential(r) {
  return {
    id: r.id,
    userId: r.user_id,
    provider: r.provider,
    sandbox: !!r.sandbox,
    maxInstallment: r.max_installment || 1,
    connectedAt: r.connected_at,
  };
}

function rowToAttachment(r) {
  return {
    id: r.id,
    userId: r.user_id,
    entityType: r.entity_type,
    entityId: r.entity_id,
    fileName: r.file_name,
    storagePath: r.storage_path,
    fileSize: r.file_size || 0,
    contentType: r.content_type || "",
    uploadedBy: r.uploaded_by || "",
    photoType: r.photo_type || null,
    consentConfirmed: r.consent_confirmed === true,
    sharedWithCustomer: r.shared_with_customer === true,
    createdAt: r.created_at,
    deletedAt: r.deleted_at || null,
    deletedBatchId: r.deleted_batch_id || null,
  };
}

const BLOCKED_ATTACHMENT_EXTENSIONS = [".exe", ".bat", ".cmd", ".sh", ".msi", ".jar", ".app"];
const MAX_ATTACHMENT_SIZE = 10 * 1024 * 1024;

const LOST_REASONS =["Yüksek fiyat", "Rakip tercih edildi", "Bütçe yok", "Zamanlama uymadı", "Vazgeçti", "Diğer"];
// Randevu sektörlerinde (Güzellik & Bakım, Sağlık/Klinik) "kaybedildi" hemen
// hemen hep ya "randevuya gelmedi" ya "iptal etti" demek — genel satış
// nedenleri ("Yüksek fiyat", "Rakip tercih edildi" vb.) burada anlamsız
// kalıyordu. "İptal etti" bilinçli olarak İLK sırada: bir kaybı yanlışlıkla
// "gelmedi" (no-show, müşteri hakkında daha ağır bir iddia) olarak
// varsayılmasın diye varsayılan seçim daha nötr olan tarafta.
const APPOINTMENT_LOST_REASONS = ["İptal etti", "Geç iptal etti", "Randevuya gelmedi", "Mücbir sebep", "İşletme iptal etti", "Diğer"];
function dealLostReasons(sector) {
  return isAppointmentSector(sector) ? APPOINTMENT_LOST_REASONS : LOST_REASONS;
}



// HELP_TOPICS ("Binerly nasıl kullanılır") ve ADVISOR_TIPS (genel KOBİ
// tavsiyesi, veriden bağımsız) aynı {category,q,a,visibleIf} şeklini
// paylaşıyor — ikisini de ANSWER_LIBRARY ile aynı {id,category,label,
// keywords,visibleIf,compute} şekline çevirip tek bir arama kutusunda
// birleştiriyoruz. keywords'e hem soruyu hem cevabı koymak, eski HelpPanel'in
// "soruda veya cevapta ara" davranışını birebir koruyor.
function staticToLibraryEntry(item, idx, idPrefix, categoryPrefix) {
  return {
    id: `${idPrefix}_${idx}`,
    category: `${categoryPrefix}: ${item.category}`,
    label: item.q,
    // item.keywords opsiyonel — yazım varyasyonu ("artırmak" / "arttırmak"
    // gibi) veya eş anlamlı ifade eklemek için, soru/cevap metninden başka
    // bir eşleşme yolu daha açar.
    keywords: [item.q.toLowerCase(), item.a.toLowerCase(), ...(item.keywords || [])],
    visibleIf: item.visibleIf,
    compute: () => item.a,
  };
}

const UNIFIED_LIBRARY = [
  ...ANSWER_LIBRARY,
  ...HELP_TOPICS.map((t, i) => staticToLibraryEntry(t, i, "help", "Nasıl Yapılır")),
  ...ADVISOR_TIPS.map((t, i) => staticToLibraryEntry(t, i, "advisor", "Danışman")),
];

function AskBubble({ open, onToggle }) {
  // Önceden sohbet balonu ikonuydu (ti-message-circle-2) - sitede ayrıca bir
  // "Mesajlar" sekmesi ve KOBİ'nin kendi müşteri "Destek" modülü de olduğu
  // için yeni kullanıcılar bu üçünü karıştırıp burayı canlı destek/insan
  // sohbeti sanabiliyordu. "Yardım" ikonu/etiketi bunun aslında bir soru-
  // cevap/nasıl-yapılır aracı olduğunu daha net anlatıyor.
  return (
    <button
      onClick={onToggle}
      title="Yardım"
      aria-label="Yardım"
      data-tour="ask-bubble"
      style={{
        position: "fixed", bottom: 24, right: 24, width: 56, height: 56, borderRadius: "50%",
        background: "var(--fill-accent)", color: "var(--on-accent)", border: "none",
        display: "flex", alignItems: "center", justifyContent: "center",
        boxShadow: "0 4px 16px rgba(0,0,0,0.25)", zIndex: 950, cursor: "pointer", fontSize: 24,
      }}
    >
      <i className={`ti ${open ? "ti-x" : "ti-help"}`} aria-hidden="true"></i>
    </button>
  );
}

// Soru tam olarak yazılmadıkça hiç eşleşmemesi ("kaç alan tanımlamışım" gibi
// gevşek bir ifade hiçbir sonuç vermiyordu) kullanıcı tarafından bulunan
// gerçek bir hata — tam alt dize eşleşmesi yerine kelime bazlı puanlama
// kullanıyoruz: sorudaki her kelime (yaygın soru kalıpları hariç) bir girişin
// soru+anahtar kelime metninde geçiyorsa puan kazanır, en çok puan alan en
// üstte çıkar. Bu, Türkçe çekim eklerini tam çözmez (kök analizi yok) ama alt
// dize içerme kontrolü ("alanım" içinde "alan" geçer) çoğu pratik durumu
// karşılıyor.
// "kaç" bilerek stopword DEĞİL — "Kaç müşterim var?" gibi onlarca soru tam
// olarak bu kelimeyle "sayı" sorduğunu belli ediyor; stopword sayılırsa geriye
// tek anlamlı token "müşteri" kalıyor, bu da neredeyse HER müşteri-ilgili
// kaydla eşleşip (örn. "en çok kazandıran müşterim kim") array sırasına göre
// yanlış (alakasız) ilk eşleşmeyi öne çıkarıyordu (kullanıcı tarafından bulundu, 2026-07-23).
const ASK_STOPWORDS = new Set(["ne", "nedir", "mı", "mi", "mu", "mü", "var", "nasıl", "hangi", "olur", "kadar", "benim", "bir", "şey", "için", "ile", "de", "da", "musunuz", "yapmalıyım", "yapıyorum", "ediyorum", "m"]);

function tokenizeAskQuery(str) {
  return str.toLowerCase().replace(/[?.,!:;]/g, "").split(/\s+/).filter(Boolean);
}

// Türkçe çekim ekleri ("artır-abilirim", "sat-ışlarımı") ve küçük yazım
// hataları yüzünden bir kelimenin tamamının metinde birebir geçmesini
// beklemek çok kırılgan oluyordu ("satışarımı" gibi bir yazım hatası hiçbir
// şeyle eşleşmiyordu). Kelimenin ilk 5 harfine ("kök"e yakın bir kısaltma)
// bakmak, hem ek varyasyonlarını hem çoğu yazım hatasını (kelimenin
// sonundaki harfler karışsa bile) tolere ediyor.
function askStem(word) {
  return word.length <= 5 ? word : word.slice(0, 5);
}

function askTokenMatches(token, blobWords) {
  const stem = askStem(token);
  // Alt-dize kontrolünü (token.includes(w) / w.includes(token)) en az 4
  // karakterle sınırlıyoruz — sınır olmadan "en", "ay", "bu" gibi çok kısa/yaygın
  // kelimeler neredeyse her uzun kelimenin içinde tesadüfen geçtiği için (örn.
  // "kaybediyorum" içinde "ay" geçiyor) alakasız girişlerin puanını yapay olarak
  // şişirip yanlış cevabın öne çıkmasına yol açıyordu (kullanıcı tarafından bulundu).
  return blobWords.some((w) => askStem(w) === stem || (w.length >= 4 && token.includes(w)) || (token.length >= 4 && w.includes(token)));
}

// Başlangıçta sohbete örnek olsun diye üç farklı türden (veri/nasıl
// yapılır/danışman) birer soru öneriliyor — kütüphane büyüdükçe bu id'lerin
// var olduğundan emin olmak için ihtiyaç halinde güncellenmeli.
const ASK_STARTER_IDS = ["top_customer_month", "help_0", "advisor_0"];

function AskDock({ open, onClose, sector, ctx }) {
  const [query, setQuery] = useState("");
  const [messages, setMessages] = useState([]);
  const threadRef = useRef(null);
  const relevant = UNIFIED_LIBRARY.filter((e) => !e.visibleIf || e.visibleIf(sector)).map((e) => ({
    ...e,
    resolvedLabel: typeof e.label === "function" ? e.label(sector) : e.label,
  }));
  const starters = ASK_STARTER_IDS.map((id) => relevant.find((e) => e.id === id)).filter(Boolean);

  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const ask = (text) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const rawTokens = tokenizeAskQuery(trimmed);
    const meaningfulTokens = rawTokens.filter((t) => !ASK_STOPWORDS.has(t));
    const tokens = meaningfulTokens.length > 0 ? meaningfulTokens : rawTokens;
    const scored = relevant
      .map((e) => {
        const blobWords = `${e.resolvedLabel} ${e.keywords.join(" ")}`.toLowerCase().replace(/[?.,!:;]/g, "").split(/\s+/).filter(Boolean);
        const score = tokens.reduce((sum, t) => sum + (askTokenMatches(t, blobWords) ? 1 : 0), 0);
        return { ...e, score };
      })
      .filter((e) => e.score > 0)
      .sort((a, b) => b.score - a.score);

    const userMsg = { id: uid(), role: "user", text: trimmed };
    const assistantMsg = scored.length === 0
      ? { id: uid(), role: "assistant", unresolved: true, text: "Bunu şu an bilmiyorum - farklı bir ifadeyle sorabilir ya da aşağıdaki örneklerden birini deneyebilirsiniz.", suggestions: starters.map((e) => e.resolvedLabel) }
      : { id: uid(), role: "assistant", category: scored[0].category, text: scored[0].compute(ctx), suggestions: scored.slice(1, 4).map((e) => e.resolvedLabel) };
    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setQuery("");
  };

  return (
    <div
      style={{
        position: "fixed", bottom: 90, right: 24, width: "min(380px, calc(100vw - 32px))", height: "min(560px, 70vh)",
        background: "var(--surface-2)", border: "0.5px solid var(--border)", borderRadius: 12,
        boxShadow: "0 8px 32px rgba(0,0,0,0.3)", zIndex: 950, display: open ? "flex" : "none", flexDirection: "column", overflow: "hidden",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 16px", borderBottom: "0.5px solid var(--border)", flexShrink: 0 }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 15 }}>Yardım</h3>
          <p style={{ margin: "2px 0 0", fontSize: 11, color: "var(--text-muted)" }}>Hiçbir soru/veri dışarı gönderilmez</p>
        </div>
        <button onClick={onClose} aria-label="Kapat" style={{ width: 28, height: 28, padding: 0, flexShrink: 0 }}>
          <i className="ti ti-x" aria-hidden="true"></i>
        </button>
      </div>
      <div ref={threadRef} style={{ flex: 1, overflowY: "auto", padding: "14px 16px", display: "flex", flexDirection: "column", gap: 12 }}>
        {messages.length === 0 && (
          <div style={{ background: "var(--surface-1)", border: "0.5px solid var(--border)", borderRadius: "4px 12px 12px 12px", padding: "10px 12px", maxWidth: "88%", alignSelf: "flex-start" }}>
            <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5 }}>Merhaba! Satışlarınız/müşterileriniz hakkında, Binerly'nin nasıl kullanıldığı veya genel işletme tavsiyesi - istediğinizi sorabilirsiniz.</p>
          </div>
        )}
        {messages.length === 0 && starters.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 4, alignSelf: "flex-start", maxWidth: "88%" }}>
            {starters.map((e) => (
              <button
                key={e.id}
                type="button"
                onClick={() => ask(e.resolvedLabel)}
                style={{ textAlign: "left", background: "var(--surface-1)", border: "0.5px solid var(--border)", borderRadius: 8, padding: "6px 10px", fontSize: 12.5, color: "var(--text-accent)", cursor: "pointer" }}
              >
                {e.resolvedLabel}
              </button>
            ))}
          </div>
        )}
        {messages.map((m) =>
          m.role === "user" ? (
            <div key={m.id} style={{ alignSelf: "flex-end", maxWidth: "85%" }}>
              <div style={{ background: "var(--fill-accent)", color: "var(--on-accent)", borderRadius: "12px 4px 12px 12px", padding: "9px 12px" }}>
                <p style={{ margin: 0, fontSize: 13.5 }}>{m.text}</p>
              </div>
            </div>
          ) : (
            <div key={m.id} style={{ alignSelf: "flex-start", maxWidth: "88%", display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ background: "var(--surface-1)", border: "0.5px solid var(--border)", borderRadius: "4px 12px 12px 12px", padding: "10px 12px" }}>
                {m.category && <p style={{ fontSize: 10, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.5, margin: "0 0 4px" }}>{m.category}</p>}
                <p style={{ margin: 0, fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.5 }}>{m.text}</p>
                {m.unresolved && (
                  <p style={{ margin: "8px 0 0", fontSize: 12, color: "var(--text-secondary)" }}>
                    Cevap bulamadıysanız <a href="mailto:info@binerly.com">info@binerly.com</a> adresinden bize yazabilirsiniz.
                  </p>
                )}
              </div>
              {m.suggestions?.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {m.suggestions.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => ask(s)}
                      style={{ textAlign: "left", background: "none", border: "0.5px solid var(--border)", borderRadius: 8, padding: "5px 10px", fontSize: 12, color: "var(--text-accent)", cursor: "pointer" }}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )
        )}
      </div>
      <form
        onSubmit={(e) => { e.preventDefault(); ask(query); }}
        style={{ display: "flex", gap: 8, padding: "10px 12px", borderTop: "0.5px solid var(--border)", flexShrink: 0 }}
      >
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Bir şey sorun..."
          style={{ flex: 1 }}
          autoFocus
        />
        <button type="submit" disabled={!query.trim()} aria-label="Gönder" style={{ width: 36, height: 36, padding: 0, background: "var(--fill-accent)", color: "var(--on-accent)", border: "none", borderRadius: 8, flexShrink: 0, opacity: query.trim() ? 1 : 0.5 }}>
          <i className="ti ti-send" aria-hidden="true"></i>
        </button>
      </form>
    </div>
  );
}

const CUSTOMER_IMPORT_FIELDS = [
  { key: "name", label: "Ad / Firma adı", required: true },
  {
    key: "customerType",
    label: "Müşteri tipi",
    type: "enum",
    enumOptions: [
      { id: "kurumsal", label: "Kurumsal" },
      { id: "bireysel", label: "Bireysel" },
    ],
    enumDefault: "kurumsal",
  },
  { key: "sector", label: "Sektör (sadece Kurumsal için)" },
  { key: "region", label: "Bölge / Şehir" },
  { key: "address", label: "Açık Adres" },
  { key: "phone", label: "Telefon" },
  { key: "email", label: "E-posta" },
  { key: "notes", label: "Not", hideInPreview: true },
];

const PRICE_LIST_IMPORT_FIELDS = [
  { key: "name", label: "Ürün/Hizmet Adı", required: true },
  { key: "price", label: "Fiyat (TL)", type: "number", required: true },
];

const dealImportFields = (sector) => [
  { key: "customerName", label: "Müşteri adı", required: true, resolveCustomer: true },
  { key: "title", label: "Başlık", required: true },
  { key: "value", label: "Tutar", type: "number" },
  { key: "cost", label: "Gider", type: "number" },
  {
    key: "stage",
    label: "Aşama",
    type: "enum",
    enumOptions: STAGES.map((s) => ({ id: s.id, label: stageLabel(s.id, "kurumsal", sector) })),
    enumDefault: "ilk_gorusme",
  },
  {
    key: "kdvRate",
    label: "KDV oranı",
    type: "enum",
    enumOptions: [
      { id: "20", label: "%20" },
      { id: "10", label: "%10" },
      { id: "1", label: "%1" },
      { id: "0", label: "%0" },
    ],
  },
];

// "Tüm zamanlar" seçiliyken en eski kazanılan fırsattan bugüne kadar aylık bucket
// üretir; çok eski hesaplarda grafiğin şişmemesi için en fazla 24 ay gösterilir.
function getMonthlyBuckets(range, wonDealsAll) {
  const now = new Date();
  let startYear, startMonth;
  const endYear = now.getFullYear(), endMonth = now.getMonth();

  if (range === "bu_ay") { startYear = endYear; startMonth = endMonth; }
  else if (range === "bu_ceyrek") { startYear = endYear; startMonth = Math.floor(endMonth / 3) * 3; }
  else if (range === "bu_yil") { startYear = endYear; startMonth = 0; }
  else if (range === "son_6_ay") {
    const d = new Date(endYear, endMonth - 5, 1);
    startYear = d.getFullYear(); startMonth = d.getMonth();
  } else {
    if (wonDealsAll.length === 0) { startYear = endYear; startMonth = endMonth; }
    else {
      const earliest = wonDealsAll.reduce((min, d) => {
        const t = new Date(d.closedAt || d.createdAt);
        return t < min ? t : min;
      }, new Date(wonDealsAll[0].closedAt || wonDealsAll[0].createdAt));
      startYear = earliest.getFullYear(); startMonth = earliest.getMonth();
    }
  }

  let totalMonths = (endYear - startYear) * 12 + (endMonth - startMonth) + 1;
  if (totalMonths > 24) {
    const d = new Date(endYear, endMonth - 23, 1);
    startYear = d.getFullYear(); startMonth = d.getMonth();
    totalMonths = 24;
  }

  return Array.from({ length: totalMonths }, (_, i) => {
    const d = new Date(startYear, startMonth + i, 1);
    return {
      key: `${d.getFullYear()}-${d.getMonth()}`,
      label: d.toLocaleDateString("tr-TR", { month: "short", year: totalMonths > 12 ? "2-digit" : undefined }),
    };
  });
}

const ACTIVITY_TYPES = [
  { id: "note", label: "Not", icon: "ti-note" },
  { id: "call", label: "Telefon görüşmesi", icon: "ti-phone" },
  { id: "meeting", label: "Toplantı", icon: "ti-users" },
  { id: "email", label: "E-posta", icon: "ti-mail" },
];

function rowToActivity(r) {
  return {
    id: r.id,
    customerId: r.customer_id,
    type: r.type,
    content: r.content,
    createdAt: r.created_at,
  };
}

function rowToPayment(r) {
  return {
    id: r.id,
    dealId: r.deal_id,
    amount: r.amount,
    paidAt: r.paid_at,
    note: r.note || "",
    method: r.method || null,
    createdAt: r.created_at,
    deletedAt: r.deleted_at || null,
    provider: r.provider || null,
    refundOfPaymentId: r.refund_of_payment_id || null,
    iyzicoPaymentTransactionId: r.iyzico_payment_transaction_id || null,
    paytrMerchantOid: r.paytr_merchant_oid || null,
  };
}

function rowToDealLineItem(r) {
  return {
    id: r.id,
    dealId: r.deal_id,
    description: r.description,
    quantity: r.quantity,
    unitPrice: r.unit_price,
    sortOrder: r.sort_order,
    priceItemId: r.price_item_id || null,
  };
}

function rowToPriceListItem(r) {
  return { id: r.id, name: r.name, price: r.price, refreshDays: r.refresh_days || null, durationMinutes: r.duration_minutes || null, commissionPercent: r.commission_percent ?? null };
}

function rowToStockItem(r) {
  return {
    id: r.id,
    name: r.name,
    unit: r.unit || "adet",
    quantityOnHand: Number(r.quantity_on_hand) || 0,
    reorderThreshold: r.reorder_threshold != null ? Number(r.reorder_threshold) : null,
    supplierName: r.supplier_name || "",
    deletedAt: r.deleted_at || null,
  };
}

function rowToPriceItemIngredient(r) {
  return { id: r.id, priceItemId: r.price_item_id, stockItemId: r.stock_item_id, quantity: Number(r.quantity) || 0 };
}

function rowToPdfTemplate(r) {
  return { id: r.id, name: r.name, width: r.width, height: r.height, blocks: r.blocks || [] };
}

function rowToGroupClass(r) {
  return {
    id: r.id,
    name: r.name,
    instructorName: r.instructor_name || "",
    weekday: r.weekday,
    startTime: (r.start_time || "").slice(0, 5),
    durationMinutes: r.duration_minutes ?? 60,
    capacity: r.capacity,
    notes: r.notes || "",
  };
}

function rowToGroupClassEnrollment(r) {
  return { id: r.id, groupClassId: r.group_class_id, customerId: r.customer_id, enrolledAt: r.enrolled_at };
}

function rowToWaitlistEntry(r) {
  return { id: r.id, groupClassId: r.group_class_id, customerId: r.customer_id, createdAt: r.created_at };
}

function rowToClassAttendance(r) {
  return { id: r.id, groupClassId: r.group_class_id, customerId: r.customer_id, occurrenceDate: r.occurrence_date, status: r.status };
}

function rowToBusinessHours(r) {
  return {
    id: r.id, weekday: r.weekday,
    startTime: (r.start_time || "").slice(0, 5),
    endTime: (r.end_time || "").slice(0, 5),
    slotDurationMinutes: r.slot_duration_minutes,
  };
}

function rowToStaffShift(r) {
  return {
    id: r.id, memberId: r.member_id, weekday: r.weekday,
    startTime: r.start_time ? r.start_time.slice(0, 5) : "",
    endTime: r.end_time ? r.end_time.slice(0, 5) : "",
    isOff: !!r.is_off,
    validFrom: r.valid_from,
    validTo: r.valid_to,
  };
}

// "Bugün itibarıyla geçerli" satırlar — grid/düzenleme ekranı SADECE bunları
// gösterir/değiştirir, kapanmış (valid_to dolu) eski versiyonlar sadece
// StaffShiftHistoryView'da (geçmiş görünümünde) yeniden inşa edilerek görünür.
function isOpenStaffShift(s) {
  return !s.validTo;
}

// Belirli bir tarihte kimin ne çalıştığını, o tarihte AÇIK OLAN versiyon(lar)ı
// tarayarak yeniden inşa eder — açık/kapalı ayrımı olmadan sadece weekday'e
// bakılsaydı, geçmişte değiştirilmiş bir vardiya geçmiş tarihlerde de YANLIŞ
// (bugünkü hâliyle) görünürdü.
function staffShiftsEffectiveOnDate(staffShifts, memberId, dateStr) {
  const jsWeekday = new Date(`${dateStr}T00:00:00`).getDay();
  const weekday = jsWeekday === 0 ? 7 : jsWeekday;
  return staffShifts.filter((s) => {
    if (s.memberId !== memberId || s.weekday !== weekday) return false;
    if (s.validFrom > dateStr) return false;
    if (s.validTo && s.validTo <= dateStr) return false;
    return true;
  });
}

function rowToStaffLeaveBalance(r) {
  return { id: r.id, memberId: r.member_id, annualLeaveDays: Number(r.annual_leave_days) };
}

// Tarih aralığı UTC'ye çevrilmeden gün sayısı hesaplasın diye "T00:00:00"
// olmadan new Date() KULLANILMIYOR — new Date("2026-08-15") UTC gece yarısı
// sayılır, yerel saat dilimi negatifse bir gün geri kayabilir.
function staffLeaveDayCount(startDate, endDate) {
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  return Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
}

function formatLeaveDateRange(startDate, endDate) {
  const fmt = (d) => new Date(`${d}T00:00:00`).toLocaleDateString("tr-TR");
  return startDate === endDate ? fmt(startDate) : `${fmt(startDate)} - ${fmt(endDate)}`;
}

const STAFF_LEAVE_TYPE_LABELS = {
  yillik: "Yıllık İzin",
  ucretsiz: "Ücretsiz İzin",
  raporlu: "Raporlu / Sağlık İzni",
  mazeret: "Mazeret İzni",
  diger: "Diğer",
};

function rowToStaffLeaveRecord(r) {
  return {
    id: r.id, memberId: r.member_id, leaveType: r.leave_type,
    startDate: r.start_date, endDate: r.end_date, note: r.note || "",
    createdAt: r.created_at,
  };
}

function rowToRoomInventory(r) {
  return { id: r.id, roomType: r.room_type, quantity: r.quantity, capacity: r.capacity || null, description: r.description || "" };
}

function rowToResource(r) {
  return { id: r.id, name: r.name, active: r.active !== false, quantity: r.quantity || 1 };
}

function rowToCompanySettings(r) {
  return {
    companyName: r.company_name || "",
    address: r.address || "",
    phone: r.phone || "",
    email: r.email || "",
    taxNumber: r.tax_number || "",
    logoUrl: r.logo_url || "",
    defaultKdvRate: r.default_kdv_rate ?? 20,
    customerNotificationsEnabled: r.customer_notifications_enabled !== false,
    appointmentRemindersEnabled: r.appointment_reminders_enabled !== false,
    sector: r.sector || null,
    leadCaptureToken: r.lead_capture_token || null,
    preferredCustomerType: r.preferred_customer_type || "kurumsal",
    pdfTemplateKey: r.pdf_template_key || null,
    lateCancelHours: r.late_cancel_hours ?? null,
    hardBlockHours: r.hard_block_hours ?? null,
    lateCancelStrikeLimit: r.late_cancel_strike_limit ?? null,
    appointmentCancelHours: r.appointment_cancel_hours ?? null,
    appointmentPenaltyHours: r.appointment_penalty_hours ?? null,
    appointmentPenaltyStrikeLimit: r.appointment_penalty_strike_limit ?? null,
    appointmentPenaltyBurnsSession: r.appointment_penalty_burns_session === true,
    appointmentPartialChargeHours: r.appointment_partial_charge_hours ?? null,
    googleReviewLink: r.google_review_link || "",
    googleReviewRequestsEnabled: r.google_review_requests_enabled !== false,
    appointmentPrepNote: r.appointment_prep_note || "",
    appointmentDepositAmount: r.appointment_deposit_amount ?? null,
    appointmentConcurrency: r.appointment_concurrency ?? null,
    winbackEnabled: r.winback_enabled === true,
    winbackInactiveDays: r.winback_inactive_days ?? null,
  };
}

const CUSTOMER_NOTE_EXAMPLES_KURUMSAL = {
  emlak: "Yatırım amaçlı birden fazla portföyle ilgileniyor",
  dijital_ajans: "Yıl sonu bütçesini Aralık'ta yeniliyor",
  saglik_klinik: "Kontrolleri genelde hafta içi öğleden sonra",
  uretim_satis: "Yaz aylarında sipariş hacmi artıyor",
  hizmet_danismanlik: "Üç ayda bir durum değerlendirmesi istiyor",
  perakende: "Kampanya dönemlerinde toplu sipariş veriyor",
  guzellik_bakim: "Hafta sonları randevu tercih ediyor",
  spor_merkezi: "Kurumsal/toplu üyelik görüşmesi yapılıyor",
  egitim_kurs: "Personeline toplu eğitim almak istiyor",
  sanayi_esnaf: "Filo bakımını düzenli olarak burada yaptırıyor",
  otel: "Yıl boyunca düzenli iş seyahati rezervasyonu yapıyor",
};

function CustomerForm({ initial, customers = [], customFieldDefs = [], sectorTags = [], preferredCustomerType, companySector, onSave, onCancel }) {
  const initialIsCustomSector = initial?.sector && !SECTORS.includes(initial.sector);
  const [customerType, setCustomerType] = useState(initial?.customerType || preferredCustomerType || "kurumsal");
  const [name, setName] = useState(initial?.name || "");
  const [sector, setSector] = useState(initialIsCustomSector ? "Diğer" : (initial?.sector || SECTORS[0]));
  const [customSector, setCustomSector] = useState(initialIsCustomSector ? initial.sector : "");
  const [region, setRegion] = useState(initial?.region || "");
  const [address, setAddress] = useState(initial?.address || "");
  const [phone, setPhone] = useState(initial?.phone || "");
  const [email, setEmail] = useState(initial?.email || "");
  const [notes, setNotes] = useState(initial?.notes || "");
  const [tags, setTags] = useState(initial?.tags || []);
  const [customFields, setCustomFields] = useState(initial?.customFields || {});
  const [formError, setFormError] = useState("");
  const isKurumsal = customerType === "kurumsal";
  const defsForEntity = customFieldDefs.filter((d) => d.entity === "customer" && (!d.audience || d.audience === customerType));

  // Aynı e-posta/telefonla ikinci bir müşteri kaydı oluşturulursa (genelde
  // yanlışlıkla), müşteri portalı bu iki kaydı da aynı hesaba bağlar ve aynı
  // işletme iki kez görünür (bkz. proje geçmişi) — aynı telefonu/e-postayı
  // gerçekten farklı iki kişinin kullanması gerçekçi olmadığı için bu artık
  // gerçek bir engel, uyarıyla geçilebilen bir onay değil.
  const findDuplicateCustomer = (trimmedEmail, trimmedPhone) => {
    const match = customers.find((c) =>
      c.id !== initial?.id &&
      ((trimmedEmail && c.email?.trim().toLowerCase() === trimmedEmail.toLowerCase()) ||
        (trimmedPhone && c.phone?.trim() === trimmedPhone))
    );
    return match || null;
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!name.trim()) return;
        if (isKurumsal && sector === "Diğer" && !customSector.trim()) return;
        if (!email.trim() && !phone.trim()) {
          setFormError("Telefon veya e-postadan en az biri girilmelidir.");
          return;
        }
        const payload = {
          id: initial?.id || uid(),
          customerType,
          name: name.trim(),
          sector: isKurumsal ? (sector === "Diğer" ? customSector.trim() : sector) : "",
          region: region.trim(),
          address: address.trim(),
          phone: phone.trim(),
          email: email.trim(),
          notes: notes.trim(),
          tags,
          customFields,
          lastContact: initial?.lastContact || new Date().toISOString(),
          createdAt: initial?.createdAt || new Date().toISOString(),
        };
        const duplicateWith = findDuplicateCustomer(payload.email, payload.phone);
        if (duplicateWith) {
          setFormError(`"${duplicateWith.name}" adlı müşteride aynı e-posta veya telefon zaten kayıtlı - aynı telefon/e-posta ile ikinci bir müşteri eklenemez.`);
          return;
        }
        setFormError("");
        onSave(payload);
      }}
    >
      <div style={{ marginBottom: 12 }}>
        <label style={{ fontSize: 13, color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: 4, marginBottom: 4 }}>Müşteri tipi <InfoTip text={CUSTOMER_TYPE_INFO_TEXT} placement="bottom" align="left" /></label>
        <select
          value={customerType}
          onChange={(e) => setCustomerType(e.target.value)}
          style={{ width: "100%" }}
        >
          <option value="kurumsal">Kurumsal</option>
          <option value="bireysel">Bireysel</option>
        </select>
      </div>
      <div style={{ marginBottom: 12 }}>
        <label style={{ fontSize: 13, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>{isKurumsal ? "Firma adı" : "Müşteri adı"}</label>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder={isKurumsal ? "Akın İnşaat" : "Ayşe Yılmaz"} style={{ width: "100%" }} />
      </div>
      <div style={{ display: "flex", gap: 12, marginBottom: 12 }}>
        {isKurumsal && (
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 13, color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: 4, marginBottom: 4 }}>Sektör <InfoTip text={SECTOR_FIELD_INFO_TEXT} /></label>
            <select value={sector} onChange={(e) => setSector(e.target.value)} style={{ width: "100%" }}>
              {SECTORS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        )}
        <div style={{ flex: 1 }}>
          <label style={{ fontSize: 13, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Bölge / Şehir</label>
          <input value={region} onChange={(e) => setRegion(e.target.value)} placeholder="İstanbul" style={{ width: "100%" }} />
        </div>
      </div>
      <div style={{ marginBottom: 12 }}>
        <label style={{ fontSize: 13, color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: 4, marginBottom: 4 }}>
          Açık Adres <InfoTip align="left" text="Online ödeme (iyzico/PayTR) alırken fatura/adres bilgisi olarak kullanılır - boş bırakılırsa sadece Bölge/Şehir gönderilir." />
        </label>
        <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Mahalle, cadde/sokak, no, ilçe" style={{ width: "100%" }} />
      </div>
      {isKurumsal && sector === "Diğer" && (
        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 13, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Sektör adı</label>
          <input value={customSector} onChange={(e) => setCustomSector(e.target.value)} placeholder="Sektörünüzü yazın" style={{ width: "100%" }} />
        </div>
      )}
      <div style={{ display: "flex", gap: 12, marginBottom: 12 }}>
        <div style={{ flex: 1 }}>
          <label style={{ fontSize: 13, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Telefon</label>
          <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0532 000 00 00" style={{ width: "100%" }} />
        </div>
        <div style={{ flex: 1 }}>
          <label style={{ fontSize: 13, color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: 4, marginBottom: 4 }}>E-posta <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-warning)" }}>(önemli)</span> <InfoTip align="right" text={CUSTOMER_EMAIL_INFO_TEXT} /></label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={isKurumsal ? "info@firma.com" : "ayse@gmail.com"} style={{ width: "100%" }} />
        </div>
      </div>
      <div style={{ marginBottom: 12 }}>
        <label style={{ fontSize: 13, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Not</label>
        <div style={{ display: "flex", gap: 6, alignItems: "flex-start" }}>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={isKurumsal ? `Örn. ${CUSTOMER_NOTE_EXAMPLES_KURUMSAL[companySector] || "yaz aylarında sipariş hacmi artıyor"}` : "Örn. genelde akşamları ulaşmak daha kolay"} style={{ flex: 1, minHeight: 70, resize: "vertical" }} />
          <VoiceInputButton onResult={(text) => setNotes((prev) => (prev ? `${prev} ${text}` : text))} />
        </div>
      </div>
      <div style={{ marginBottom: 16 }}>
        <label style={{ fontSize: 13, color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: 4, marginBottom: 4 }}>Etiketler <InfoTip align="left" text={TAGS_INFO_TEXT} /></label>
        <TagInput tags={tags} onChange={setTags} suggestions={sectorTags} />
      </div>
      <CustomFieldsSection defs={defsForEntity} values={customFields} onChange={setCustomFields} />
      {formError && <p style={{ fontSize: 12.5, color: "var(--text-danger)", margin: "0 0 8px" }}>{formError}</p>}
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button type="button" onClick={onCancel}>Vazgeç</button>
        <button type="submit" style={{ background: "var(--fill-accent)", color: "var(--on-accent)", border: "none" }}>Kaydet</button>
      </div>
    </form>
  );
}

const COMPANY_NAME_EXAMPLES = {
  emlak: "Akın Emlak",
  dijital_ajans: "Akın Dijital Ajans",
  saglik_klinik: "Akın Sağlık Merkezi",
  uretim_satis: "Akın Tekstil",
  hizmet_danismanlik: "Akın Danışmanlık",
  perakende: "Akın Mağazacılık",
  guzellik_bakim: "Akın Güzellik Salonu",
  spor_merkezi: "Akın Spor Merkezi",
  egitim_kurs: "Akın Eğitim Kurumları",
  sanayi_esnaf: "Akın Oto Servis",
  otel: "Akın Otel",
};

// Sektör seçimi öncesi anında (onChange'de) uygulanıyordu — yanlışlıkla farklı
// bir seçeneğe tıklanırsa aşama isimleri/özel alanlar hemen değişiyordu. Artık
// seçim sadece dropdown'ı günceller, gerçek uygulama "Kaydet"e basınca olur —
// modal kapatılıp seçim kaydedilmeden bırakılırsa (component unmount olunca)
// bir sonraki açılışta gerçek kayıtlı sektöre sıfırlanır.
function SectorPicker({ companySettings, onSave, onFetchFields }) {
  const currentSector = companySettings?.sector || "";
  const [pendingSector, setPendingSector] = useState(currentSector);
  const [confirmSwitch, setConfirmSwitch] = useState(false);
  const dirty = pendingSector !== currentSector;
  const currentLabel = SECTOR_PRESETS.find((p) => p.id === currentSector)?.label || currentSector;

  return (
    <div style={{ marginBottom: 8 }}>
      <label style={{ fontSize: 13, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Sektör</label>
      <select value={pendingSector} onChange={(e) => setPendingSector(e.target.value)} style={{ width: "100%" }}>
        <option value="">Seçilmedi</option>
        {SECTOR_PRESETS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
      </select>
      <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "4px 0 0" }}>Seçtikten sonra "Kaydet"e basınca aşama isimlerini, önerilen etiketleri ve özel alanları günceller.</p>
      {currentSector && (
        <button type="button" onClick={onFetchFields} style={{ fontSize: 12, marginTop: 8 }}>
          Sektöre özel yeni alanları getir
        </button>
      )}
      {dirty && pendingSector && (
        <button
          type="button"
          // Zaten bir sektör seçiliyken DEĞİŞTİRMEK, eski sektöre özel alanları
          // formlardan gizliyor (silmiyor - applySectorCustomFields active:false
          // yapıyor, eski sektöre geri dönülürse otomatik tekrar görünür) ama bu
          // hiçbir yerde açıkça söylenmiyordu - kullanıcı "verilerim kayboldu"
          // sanabilirdi. İlk kurulumda (currentSector boş) uyarı gereksiz sürtünme
          // olur, sadece gerçek bir DEĞİŞİMDE gösterilir.
          onClick={() => (currentSector ? setConfirmSwitch(true) : onSave(pendingSector))}
          style={{ fontSize: 13, marginTop: 8, display: "block", background: "var(--fill-accent)", color: "var(--on-accent)", border: "none" }}
        >
          Kaydet
        </button>
      )}
      {confirmSwitch && (
        <ConfirmDialog
          title="Sektörü değiştir"
          message={`"${currentLabel}" sektörüne özel alanlar (form/kayıtlardan) gizlenecek - silinmeyecek, tekrar bu sektöre dönerseniz otomatik geri gelirler. Yeni sektörün kendi alanları/aşama isimleri uygulanacak. Devam edilsin mi?`}
          onConfirm={() => { setConfirmSwitch(false); onSave(pendingSector); }}
          onClose={() => setConfirmSwitch(false)}
        />
      )}
    </div>
  );
}

function CompanySettingsForm({ initial, customFieldDefs = [], onSave, onCancel, activeTeamId, notify }) {
  const hasDatetimeField = customFieldDefs.some((d) => d.entity === "deal" && d.type === "datetime" && d.active);
  const [companyName, setCompanyName] = useState(initial?.companyName || "");
  const [address, setAddress] = useState(initial?.address || "");
  const [phone, setPhone] = useState(initial?.phone || "");
  const [email, setEmail] = useState(initial?.email || "");
  const [taxNumber, setTaxNumber] = useState(initial?.taxNumber || "");
  const [logoUrl, setLogoUrl] = useState(initial?.logoUrl || "");
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [defaultKdvRate, setDefaultKdvRate] = useState(initial?.defaultKdvRate ?? 20);
  const [customerNotificationsEnabled, setCustomerNotificationsEnabled] = useState(initial?.customerNotificationsEnabled === true);
  const [appointmentRemindersEnabled, setAppointmentRemindersEnabled] = useState(initial?.appointmentRemindersEnabled !== false);
  const [googleReviewLink, setGoogleReviewLink] = useState(initial?.googleReviewLink || "");
  const [googleReviewRequestsEnabled, setGoogleReviewRequestsEnabled] = useState(initial?.googleReviewRequestsEnabled !== false);
  const [winbackEnabled, setWinbackEnabled] = useState(initial?.winbackEnabled === true);
  const [winbackInactiveDays, setWinbackInactiveDays] = useState(initial?.winbackInactiveDays ?? 60);

  const handleLogoFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) { notify("Sadece resim dosyası yükleyebilirsiniz."); return; }
    if (file.size > 2 * 1024 * 1024) { notify("Logo dosyası en fazla 2 MB olabilir."); return; }
    setUploadingLogo(true);
    const ext = file.name.split(".").pop();
    const path = `${activeTeamId}/logo-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("logos").upload(path, file, { upsert: true });
    setUploadingLogo(false);
    if (error) { notify(`Logo yüklenemedi: ${error.message}`); return; }
    const { data } = supabase.storage.from("logos").getPublicUrl(path);
    setLogoUrl(data.publicUrl);
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSave({
          companyName: companyName.trim(),
          address: address.trim(),
          phone: phone.trim(),
          email: email.trim(),
          taxNumber: taxNumber.trim(),
          logoUrl: logoUrl.trim(),
          defaultKdvRate,
          customerNotificationsEnabled,
          appointmentRemindersEnabled,
          googleReviewLink: googleReviewLink.trim(),
          googleReviewRequestsEnabled,
          winbackEnabled,
          winbackInactiveDays: winbackEnabled ? Number(winbackInactiveDays) || 60 : null,
          sector: initial?.sector || null,
          lateCancelHours: initial?.lateCancelHours ?? null,
          hardBlockHours: initial?.hardBlockHours ?? null,
          lateCancelStrikeLimit: initial?.lateCancelStrikeLimit ?? null,
          appointmentCancelHours: initial?.appointmentCancelHours ?? null,
        });
      }}
    >
      <div style={{ marginBottom: 12 }}>
        <label style={{ fontSize: 13, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>İşletme adı</label>
        <input value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder={COMPANY_NAME_EXAMPLES[initial?.sector] || "Akın Diş Kliniği"} style={{ width: "100%" }} />
      </div>
      <div style={{ marginBottom: 12 }}>
        <label style={{ fontSize: 13, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Adres</label>
        <textarea value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Firma adresi" style={{ width: "100%", minHeight: 60, resize: "vertical" }} />
      </div>
      <div style={{ display: "flex", gap: 12, marginBottom: 12 }}>
        <div style={{ flex: 1 }}>
          <label style={{ fontSize: 13, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Telefon</label>
          <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0532 000 00 00" style={{ width: "100%" }} />
        </div>
        <div style={{ flex: 1 }}>
          <label style={{ fontSize: 13, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>E-posta</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="info@firma.com" style={{ width: "100%" }} />
        </div>
      </div>
      <div style={{ marginBottom: 12 }}>
        <label style={{ fontSize: 13, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Vergi no</label>
        <input value={taxNumber} onChange={(e) => setTaxNumber(e.target.value)} placeholder="1234567890" style={{ width: "100%" }} />
      </div>
      <div style={{ marginBottom: 16 }}>
        <label style={{ fontSize: 13, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Logo</label>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          {logoUrl && (
            <img src={logoUrl} alt="Logo" style={{ height: 44, borderRadius: 6, objectFit: "contain", background: "var(--surface-1)", padding: 4 }} />
          )}
          <label style={{ background: "var(--surface-1)", border: "0.5px solid var(--border)", borderRadius: "var(--radius)", padding: "8px 14px", fontSize: 13, cursor: uploadingLogo ? "default" : "pointer" }}>
            {uploadingLogo ? "Yükleniyor…" : logoUrl ? "Logoyu değiştir" : "Logo yükle"}
            <input type="file" accept="image/*" onChange={handleLogoFile} disabled={uploadingLogo} style={{ display: "none" }} />
          </label>
          {logoUrl && !uploadingLogo && (
            <button type="button" onClick={() => setLogoUrl("")} style={{ background: "none", border: "none", color: "var(--text-danger)", fontSize: 13, cursor: "pointer" }}>
              Kaldır
            </button>
          )}
        </div>
        <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "4px 0 0" }}>PNG, JPG veya SVG - en fazla 2 MB. Teklif çıktısında ve müşterinin gördüğü sayfalarda görünür.</p>
      </div>
      <div style={{ marginBottom: 16 }}>
        <label style={{ fontSize: 13, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Varsayılan KDV oranı</label>
        <select value={defaultKdvRate} onChange={(e) => setDefaultKdvRate(Number(e.target.value))} style={{ width: "100%" }}>
          <option value={20}>%20</option>
          <option value={10}>%10</option>
          <option value={1}>%1</option>
          <option value={0}>%0</option>
        </select>
        <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "4px 0 0" }}>Yeni tekliflerde bu oran varsayılan gelir, her teklifte isterseniz değiştirebilirsiniz.</p>
      </div>
      <div style={{ marginBottom: 16 }}>
        <label style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={customerNotificationsEnabled}
            onChange={(e) => setCustomerNotificationsEnabled(e.target.checked)}
          />
          Müşterilere önemli gelişmelerde otomatik e-posta gönder
          <InfoTip
            align="right"
            text={
              `Bir ${DEAL_WORD_FORMS[dealWordKind(initial?.sector)].gen} aşaması her değiştiğinde (${STAGES.map((s) => stageLabel(s.id, "kurumsal", initial?.sector)).join(", ")}) o aşamaya özel bir mail gider - 2. ve 3. aşamalarda onay linki de eklenir. Destek talebi durumu değiştiğinde, yeni bir yanıt yazıldığında ve ödeme alındığında da müşteriye bilgilendirme gider.\n\n` +
              `Yanlışlıkla bir ${DEAL_WORD_FORMS[dealWordKind(initial?.sector)].acc} başka bir aşamaya sürüklerseniz endişelenmeyin: mail hemen gitmez, 45 saniye beklenir - bu süre içinde aşamayı düzeltirseniz mail hiç gitmez, sadece son karar verdiğiniz aşama için gider.\n\n` +
              `Bu kutu, yeni bir müşteri eklediğinizde gönderilen pazarlama izni onay e-postasını ETKİLEMEZ - o e-posta ticari ileti sayılmadığı için (yalnızca izin ister) bu kutu kapalıyken de gönderilir.`
            }
          />
        </label>
      </div>
      {hasDatetimeField && (
        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={appointmentRemindersEnabled}
              onChange={(e) => setAppointmentRemindersEnabled(e.target.checked)}
            />
            Randevu hatırlatma e-postası gönder
            <InfoTip align="right" text="Tarih & Saat tipindeki özel alanı olan kayıtlarda, o saatten 2 saat önce müşteriye otomatik bir hatırlatma e-postası gider. Bu kutuyu kapatırsanız hiçbir hatırlatma e-postası gönderilmez - diğer bildirimler (aşama değişikliği, destek talebi, ödeme) bundan etkilenmez." />
          </label>
        </div>
      )}
      <div style={{ marginBottom: 12 }}>
        <label style={{ fontSize: 13, color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
          Google değerlendirme linki
          <InfoTip
            align="right"
            text="Google İşletme Profilinizde 'Değerlendirme iste' seçeneğinden aldığınız bağlantıyı buraya yapıştırın. Bu link doluysa ve aşağıdaki seçenek açıksa, tamamlanan her kayıttan bir gün sonra müşteriye bu linkle bir değerlendirme isteği e-postası gider."
          />
        </label>
        <input value={googleReviewLink} onChange={(e) => setGoogleReviewLink(e.target.value)} placeholder="https://g.page/r/xxxxxxxxxxxx/review" style={{ width: "100%" }} />
      </div>
      {googleReviewLink.trim() && (
        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={googleReviewRequestsEnabled}
              onChange={(e) => setGoogleReviewRequestsEnabled(e.target.checked)}
            />
            Tamamlanan {DEAL_WORD_FORMS[dealWordKind(initial?.sector)].bare} sonrası müşteriden Google değerlendirmesi iste
          </label>
          <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "4px 0 0 26px" }}>
Ertesi gün otomatik gönderilir. İptal edilen veya gelinmeyen kayıtlar için asla gönderilmez. Türkiye'de ticari elektronik ileti göndermek için İYS/açık onay yasal bir zorunluluktur - bu yüzden sadece pazarlama izni onaylanmış müşterilere gönderilir, izni olmayanlara otomatik olarak hiç gitmez. İzin, Müşteri Kayıtları'ndan (İzin e-postası gönder), Müşteri Kazanma Linki'nden veya Müşteri Portalı'ndan alınabilir.
          </p>
        </div>
      )}
      <div style={{ marginBottom: 16 }}>
        <label style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
          <input type="checkbox" checked={winbackEnabled} onChange={(e) => setWinbackEnabled(e.target.checked)} />
          Uzun süredir gelmeyen müşterilere otomatik "sizi özledik" e-postası gönder
          <InfoTip
            align="right"
            text="Varsayılan kapalı. Açarsanız, aşağıda belirlediğiniz gün sayısı kadar süredir kendisiyle hiç temas kurulmamış (not eklenmemiş) müşterilere günde bir kontrol edilerek otomatik bir hatırlatma e-postası gider - Randevu Alma Linki'niz varsa tek tıkla yeniden randevu alma bağlantısıyla birlikte. Aynı müşteriye, o tekrar temas kurana kadar ikinci kez gönderilmez. Sadece pazarlama izni verilmiş müşterilere gider (Google değerlendirme isteğiyle aynı yasal kural)."
          />
        </label>
        {winbackEnabled && (
          <div style={{ marginTop: 8, marginLeft: 26 }}>
            <label style={{ fontSize: 12, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Kaç gündür temas kurulmadıysa</label>
            <input type="number" min="1" value={winbackInactiveDays} onChange={(e) => setWinbackInactiveDays(e.target.value)} style={{ width: 100 }} />
          </div>
        )}
      </div>
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button type="button" onClick={onCancel}>Vazgeç</button>
        <button type="submit" style={{ background: "var(--fill-accent)", color: "var(--on-accent)", border: "none" }}>Kaydet</button>
      </div>
    </form>
  );
}

// Otel gibi oda-stoklu sektörlerde (bookingModel === "inventory") aynı oda
// tipinde, aynı tarih aralığına çakışan aktif rezervasyon sayısı stoktaki
// adedi aşarsa çakışma bilgisi döner; stok hiç tanımlanmamışsa (owner Oda
// Stoku'nu henüz kurmadıysa) kısıtlama uygulanmaz. Hem DealForm'un kaydetme
// kontrolünde hem Liste'deki aşama seçiciyle tekrar aktifleştirmede kullanılır.
function roomTypeConflict({ excludeDealId, roomType, checkIn, checkOut }, deals, roomInventory) {
  if (!roomType || !checkIn || !checkOut) return null;
  const inventory = roomInventory.find((r) => r.roomType === roomType);
  if (!inventory) return null;
  const candidateStart = checkIn.slice(0, 10);
  const overlapping = deals.filter((d) => {
    if (d.id === excludeDealId || d.stage === "kaybedildi") return false;
    if (d.customFields?.oda_tipi !== roomType) return false;
    const start = d.customFields?.giris_tarihi?.slice(0, 10);
    const end = d.customFields?.cikis_tarihi;
    if (!start || !end) return false;
    return candidateStart < end && start < checkOut;
  });
  if (overlapping.length < inventory.quantity) return null;
  return { quantity: inventory.quantity, occupied: overlapping.length };
}

// Bir randevunun kalemlerinden (deal_line_items → price_list_items) toplam
// süresini çıkarır. Miktar süreye çarpılmıyor - bir kalemin 2 adet olması
// randevunun 2 katı sürmesi anlamına gelmiyor (ör. 2 ürün satışı); süreyi
// gerçekten katlamak isteyen KOBİ aynı hizmeti iki ayrı kalem olarak ekleyebilir.
function lineItemsDurationMinutes(lineItemsForDeal, priceListItems) {
  return (lineItemsForDeal || []).reduce((sum, li) => {
    const priceItem = li.priceItemId ? priceListItems.find((p) => p.id === li.priceItemId) : null;
    return sum + (priceItem?.durationMinutes || 0);
  }, 0);
}

// Randevu sektörlerinde müşteri portaldan randevu alırken müsait saatleri
// gördüğü halde, KOBİ aynı randevuyu elle girerken hiçbir müsaitlik bilgisi
// görmüyor, tarih/saati kör kör yazıyordu — çakışma ancak kaydetmeye
// çalışınca (findAppointmentConflict) fark ediliyordu. Bu, müşteri portalının
// zaten kullandığı /api/appointment-availability'den aynı müsait saatleri
// çekip öneri olarak gösterir — kısıtlama değil görünürlük: KOBİ isterse
// yine de aşağıdaki alana elle farklı bir saat girebilir.
// Önceden ayrı bir "Randevu Tarihi" alanı + altında ayrı bir "Müsait saatler"
// kutusu vardı — ikisinin de kendi tarih seçicisi olması "iki tane randevu
// tarihi var" gibi görünüyordu (2026-07-23). Artık TEK alan: tarih değişince
// o güne ait müsait saatler otomatik listeleniyor, birine tıklamak saat
// kutusunu dolduruyor — kısıtlama değil öneri, saat kutusuna elle de yazılabilir.
function AppointmentDateTimeField({ businessUserId, label, value, onChange }) {
  const todayStr = new Date().toISOString().slice(0, 10);
  const date = (value || "").slice(0, 10) || todayStr;
  const time = (value || "").slice(11, 16);
  const [slots, setSlots] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!businessUserId || !date) return;
    setLoading(true);
    setError("");
    fetch(`/api/appointment-availability?businessUserId=${businessUserId}&date=${date}`)
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data?.error || "Müsaitlik alınamadı.");
        setSlots(data.slots || []);
      })
      .catch((err) => { setSlots([]); setError(err.message || "Müsaitlik alınamadı."); })
      .finally(() => setLoading(false));
  }, [businessUserId, date]);

  return (
    <div>
      <label style={{ fontSize: 13, color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: 4, marginBottom: 4 }}>
        {label}
        <InfoTip placement="bottom" align="right" text="Tarihi seçince o güne ait müsait saatler otomatik listelenir - birine tıklamak saati doldurur. İstediğiniz saat listede yoksa saat kutusuna elle de yazabilirsiniz." />
      </label>
      <input
        type="date"
        value={date}
        onChange={(e) => onChange(e.target.value ? `${e.target.value}T${time || "09:00"}` : "")}
        style={{ width: "100%", marginBottom: 6 }}
      />
      <input
        type="time"
        value={time}
        onChange={(e) => onChange(`${date}T${e.target.value}`)}
        style={{ width: "100%", marginBottom: 8 }}
      />
      {loading ? (
        <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0 }}>Müsaitlik yükleniyor…</p>
      ) : error ? (
        <p style={{ fontSize: 12, color: "var(--text-danger)", margin: 0 }}>{error}</p>
      ) : slots.length === 0 ? (
        <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0 }}>Bu tarihte müsait saat görünmüyor (Müsaitlik Saatleri tanımlı değil ya da tüm saatler dolu).</p>
      ) : (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {slots.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => onChange(`${date}T${s}:00`)}
              style={{
                fontSize: 12.5, padding: "5px 10px",
                background: time === s ? "var(--fill-accent)" : "var(--surface-1)",
                color: time === s ? "var(--on-accent)" : "var(--text-primary)",
                border: "0.5px solid var(--border)",
              }}
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function DealForm({ customers, initial, defaultKdvRate, preferredCustomerType, sector, deals = [], payments = [], appointmentDateTimeKey = null, roomInventory = [], resources = [], customFieldDefs = [], sectorTags = [], teamMembers = [], currentUserId, currentUserEmail, businessUserId, titleSuggestions = [], priceListItems = [], initialLineItems = [], dealLineItems = [], hasPaymentConnection = false, totalPaid = 0, attachments = [], appointmentPenaltyStrikeLimit = null, appointmentPenaltyBurnsSession = false, appointmentConcurrency = null, onUploadAttachment, onDownloadAttachment, onDeleteAttachment, onToggleAttachmentShare, onRequestPhotoConsent, onSave, onCancel }) {
  const [customerId, setCustomerId] = useState(
    initial?.customerId || customers.find((c) => c.customerType === preferredCustomerType)?.id || customers[0]?.id || ""
  );
  const selectedCustomer = customers.find((c) => c.id === customerId);
  const selectedCustomerType = selectedCustomer?.customerType || "kurumsal";
  // Sadece YENİ teklifte gösterilir — var olan bir teklifi düzenlerken (initial
  // dolu) müşteri zaten seçilmiş, bu uyarı o an bir işe yaramaz, sadece gürültü olur.
  const creditRisk = !initial && selectedCustomer ? computeCustomerCreditRisk(selectedCustomer, deals, payments) : null;
  const noShowRisk = !initial && selectedCustomer && isAppointmentSector(sector) ? computeNoShowRisk(selectedCustomer, deals, appointmentPenaltyStrikeLimit) : null;
  // Müşterinin zaten aktif (tükenmemiş) bir paketi varsa VE kobi "paket
  // sahiplerinde seans yaksın"ı açtıysa, ihlal cezası ödeme zorunluluğu
  // DEĞİL seans yakma olarak uygulanıyor (bkz. computeAppointmentPenaltyBurn,
  // ihlal anında otomatik) — bu durumda burada ayrıca ödeme istemeye gerek yok.
  const hasActivePackage = !!selectedCustomer && deals.some((d) => d.customerId === selectedCustomer.id && d.stage === "kazanildi" && d.sessionTotal > 0 && (d.sessionUsed || 0) < d.sessionTotal);
  const noShowPenaltyBurnsInstead = !!noShowRisk && appointmentPenaltyBurnsSession && hasActivePackage;
  // İşletme kaynaklı geç iptallerde tanınan ücretsiz telafi hakkı — sadece YENİ
  // randevu oluştururken sorulur (var olanı düzenlerken anlamsız).
  const hasCredit = !initial && !!selectedCustomer && (selectedCustomer.appointmentCreditCount || 0) > 0;
  const [applyCredit, setApplyCredit] = useState(false);
  const [title, setTitle] = useState(initial?.title || "");
  const [value, setValue] = useState(initial?.value ?? "");
  const [selectedPriceItemId, setSelectedPriceItemId] = useState("");
  // Kalemler tamamen opsiyonel — boşsa Tutar bugünkü gibi elle girilir, hiçbir
  // şey değişmez. Dolu ise Tutar bunların toplamına otomatik kilitlenir.
  const [lineItems, setLineItems] = useState(
    initialLineItems.map((li) => ({ localId: li.id, description: li.description, quantity: li.quantity, unitPrice: li.unitPrice, priceItemId: li.priceItemId || null }))
  );
  const lineItemsTotal = lineItems.reduce((sum, li) => sum + (Number(li.quantity) || 0) * (Number(li.unitPrice) || 0), 0);
  const lineItemsDuration = lineItemsDurationMinutes(lineItems, priceListItems);
  // İndirim - SADECE kalem toplamı üzerinden uygulanır (Kalemler boşsa Tutar zaten
  // elle girilen tek bir sayı, indirim varsa staff onu doğrudan o sayıya yansıtır).
  // Ham tip/değer custom_fields.discount'ta saklanır ki teklif tekrar açıldığında
  // indirim alanı (ve gerekçesi) kaybolmasın - Tutar'a sadece SONUÇ yazılır.
  const [discountType, setDiscountType] = useState(initial?.customFields?.discount?.type || "percent");
  const [discountValue, setDiscountValue] = useState(
    initial?.customFields?.discount?.value != null ? String(initial.customFields.discount.value) : ""
  );
  const discountAmount = discountValue === "" || Number(discountValue) <= 0
    ? 0
    : Math.min(
        discountType === "percent" ? lineItemsTotal * (Number(discountValue) / 100) : Number(discountValue),
        lineItemsTotal
      );
  // Basit gümrük/navlun hesaplayıcı — CANLI gümrük/navlun verisi çekmiyor,
  // sadece kullanıcının kendi (localStorage'da hatırlanan) sabit oranını mevcut
  // kalem toplamına uygulayıp yeni bir kalem olarak ekliyor.
  const [showFreightCalc, setShowFreightCalc] = useState(false);
  const [freightIncoterm, setFreightIncoterm] = useState(() => localStorage.getItem("binerly_freight_incoterm") || "FOB");
  const [freightPercent, setFreightPercent] = useState(() => localStorage.getItem("binerly_freight_percent") || "");
  const [freightFlatFee, setFreightFlatFee] = useState(() => localStorage.getItem("binerly_freight_flat_fee") || "");
  const [cost, setCost] = useState(initial?.cost ?? "");
  // Yeni tekliflerde son seçilen ödeme tercihi hatırlanır (localStorage) —
  // kaydetmeden formu kapatıp tekrar açsa bile "Sadece onaylasın"a sıfırlanmasın.
  // Var olan bir teklifi düzenlerken bu, kaydedilmiş değeri EZMEZ.
  const [paymentMode, setPaymentMode] = useState(initial?.paymentMode || (noShowRisk && !noShowPenaltyBurnsInstead ? "required" : null) || localStorage.getItem(PAYMENT_MODE_LAST_CHOICE_KEY) || "none");
  const [kdvRate, setKdvRate] = useState(initial?.kdvRate ?? defaultKdvRate ?? 20);
  const [stage, setStage] = useState(initial?.stage || "ilk_gorusme");
  const [dealDate, setDealDate] = useState((initial?.createdAt || new Date().toISOString()).slice(0, 10));
  const [dealTime, setDealTime] = useState(() => {
    if (!initial?.createdAt) return "";
    const d = new Date(initial.createdAt);
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    return hh === "00" && mm === "00" ? "" : `${hh}:${mm}`;
  });
  const [reminder, setReminder] = useState(initial?.reminder || "");
  const [reminderDate, setReminderDate] = useState(initial?.reminderDate || "");
  const [lostReason, setLostReason] = useState(initial?.lostReason || dealLostReasons(sector)[0]);
  const isClosingStage = stage === "kazanildi" || stage === "kaybedildi";
  const wasAlreadyClosed = initial?.stage === "kazanildi" || initial?.stage === "kaybedildi";
  const [closedDate, setClosedDate] = useState(
    (wasAlreadyClosed && initial?.closedAt ? initial.closedAt : new Date().toISOString()).slice(0, 10)
  );
  const [dateError, setDateError] = useState("");
  const [isPackageDeal, setIsPackageDeal] = useState(!!initial?.sessionTotal);
  const [sessionTotal, setSessionTotal] = useState(initial?.sessionTotal ?? 10);
  const [sessionUsed, setSessionUsed] = useState(initial?.sessionUsed ?? 0);
  const [sessionError, setSessionError] = useState("");
  // Karma paket ("8 seans Lazer + 2 seans Kontrol") - opsiyonel, custom_fields.
  // package_breakdown olarak saklanır. Boşsa (varsayılan/eski davranış) tek bir
  // sessionTotal/sessionUsed sayacı geçerli, aynen öncesi gibi. Dolu olduğunda
  // sessionTotal/sessionUsed bu satırların TOPLAMINDAN otomatik hesaplanır (aşağıdaki
  // useEffect) - iki ayrı kaynağın birbirinden sapması engellenir.
  const [packageBreakdown, setPackageBreakdown] = useState(
    Array.isArray(initial?.customFields?.package_breakdown) ? initial.customFields.package_breakdown : []
  );
  useEffect(() => {
    if (packageBreakdown.length === 0) return;
    setSessionTotal(packageBreakdown.reduce((sum, b) => sum + (Number(b.total) || 0), 0));
    setSessionUsed(packageBreakdown.reduce((sum, b) => sum + (Number(b.used) || 0), 0));
  }, [packageBreakdown]);
  const convertToBreakdown = () => setPackageBreakdown([{ label: "", total: Number(sessionTotal) || 1, used: Number(sessionUsed) || 0 }]);
  const addBreakdownRow = () => setPackageBreakdown((prev) => [...prev, { label: "", total: 1, used: 0 }]);
  const updateBreakdownRow = (i, patch) => setPackageBreakdown((prev) => prev.map((b, idx) => (idx === i ? { ...b, ...patch } : b)));
  const removeBreakdownRow = (i) => setPackageBreakdown((prev) => prev.filter((_, idx) => idx !== i));
  const [valueError, setValueError] = useState("");
  const [tags, setTags] = useState(initial?.tags || []);
  const [customFields, setCustomFields] = useState(initial?.customFields || {});
  const [assignedTo, setAssignedTo] = useState(initial?.assignedTo || currentUserId || "");
  const [resourceId, setResourceId] = useState(initial?.customFields?.resource_id || "");
  const [notifyCustomer, setNotifyCustomer] = useState(initial?.notifyCustomer || false);
  const [conflictError, setConflictError] = useState("");
  // Var olan bir kaydı düzenlerken (Sorumlu/Etiket/Özel Alan/Dosya gibi zaten
  // doldurulmuş olabilecek alanlar sessizce gizli kalmasın diye) akordeon
  // açık başlar; yeni kayıtta (henüz hiçbir "ek" alan dolu olamayacağı için)
  // kapalı başlayıp hızlı girişe odaklanır.
  const [showAdvanced, setShowAdvanced] = useState(!!initial);
  const defsForEntity = customFieldDefs.filter((d) => d.entity === "deal" && (!d.audience || d.audience === selectedCustomerType));
  // Randevu tarihi alanı forma özel olarak yukarıda (Ürün/Hizmet'in yanında)
  // gösteriliyorsa, Özel alanlar listesinde mükerrer çıkmasın diye çıkarılır —
  // sadece bookingModel "slot" olan sektörlerde geçerli (Otel'in giriş tarihi
  // gibi "inventory" modelindeki alanlar Özel alanlar'da kalmaya devam eder).
  const otherDefsForEntity = (
    bookingModel(sector) === "slot" && appointmentDateTimeKey
      ? defsForEntity.filter((d) => d.key !== appointmentDateTimeKey)
      : defsForEntity
  ).filter((d) => !(sector === "spor_merkezi" && d.key === "uyelik_bitis_tarihi"));
  // Üyelik Bitiş Tarihi Spor Merkezi'nde kritik bir alan (üyelik geçmişte "Ek
  // Bilgiler"in içinde gömülüydü, kolayca gözden kaçıyordu) — Randevu Tarihi'nin
  // slot sektörlerinde aldığı muameleyle aynı şekilde forma özel olarak yukarıya,
  // Ürün/Hizmet'in yanına taşındı; sadece bu sektör için, diğerlerinde Özel
  // alanlar'da kalmaya devam ediyor.
  const membershipEndDef = sector === "spor_merkezi"
    ? customFieldDefs.find((d) => d.entity === "deal" && d.key === "uyelik_bitis_tarihi" && d.active)
    : null;
  const selectedCustomerEmail = customers.find((c) => c.id === customerId)?.email || "";

  // Aynı tarih/saate iki aktif randevu düşerse (örn. biri iptal edilip slot
  // boşaldıktan sonra başkası aynı saati aldı, sonra ilk randevu yeniden
  // "planlandı"ya çekildi) sessizce çift rezervasyon oluşurdu. Tek bir
  // randevu saati aynı anda gerçekten iki farklı kişiye verilemeyeceği için
  // (kullanıcı isteğiyle) bu artık uyarıyla geçilebilen bir onay değil,
  // gerçek bir engel — çakışma varken kayıt yapılamaz. appointmentConcurrency
  // ayarlanmışsa (Ayarlar → Müsaitlik Saatleri → Eş zamanlı randevu
  // kapasitesi) tek çakışmada değil, o sayıya ULAŞINCA engellenir — birden
  // fazla uzman/koltuk/cihazı olan işletmeler aynı saate N randevu alabilsin
  // diye (bkz. api/appointment-availability.js'teki AYNI mantık).
  const findAppointmentConflict = (candidateStage, candidateCustomFields) => {
    if (!appointmentDateTimeKey || bookingModel(sector) !== "slot" || candidateStage === "kaybedildi") return null;
    const dt = candidateCustomFields?.[appointmentDateTimeKey];
    if (!dt) return null;
    const candidateStart = new Date(dt).getTime();
    if (Number.isNaN(candidateStart)) return null;
    // Süre bilinmeyen randevular 1 dakikalık "nokta" kabul edilir - bu, eski
    // "tam dakika eşitliği" davranışını (fiyat listesi süresi girilmemiş
    // KOBİ'ler için) bozmadan, süre bilinen durumlarda hizmetlerin toplam
    // süresine göre gerçek aralık çakışmasını da yakalar.
    const candidateDuration = Math.max(lineItemsDurationMinutes(lineItems, priceListItems), 1);
    const candidateEnd = candidateStart + candidateDuration * 60000;
    const concurrency = Math.max(1, Number(appointmentConcurrency) || 1);
    const overlapping = deals.filter((d) => {
      if (d.id === initial?.id || d.stage === "kaybedildi") return false;
      const otherDt = d.customFields?.[appointmentDateTimeKey];
      if (!otherDt) return false;
      const otherStart = new Date(otherDt).getTime();
      if (Number.isNaN(otherStart)) return false;
      const otherDuration = Math.max(
        lineItemsDurationMinutes(dealLineItems.filter((li) => li.dealId === d.id), priceListItems), 1
      );
      const otherEnd = otherStart + otherDuration * 60000;
      return candidateStart < otherEnd && otherStart < candidateEnd;
    });
    // Belirli bir personel (Sorumlu) veya kaynak (Cihaz/Oda) seçiliyse, o kişi/
    // kaynak fiziksel olarak aynı anda tek bir randevuda olabileceği için bu
    // HER ZAMAN gerçek bir engel - concurrency sayısı sadece "kimseye özel
    // atanmamış" randevular arasındaki genel eş zamanlılık tavanını belirler,
    // aynı personel/kaynağa ikinci bir randevuyu asla es geçmez.
    const sameStaff = assignedTo && overlapping.find((d) => d.assignedTo === assignedTo);
    if (sameStaff) {
      const name = customers.find((c) => c.id === sameStaff.customerId)?.name || "başka bir kayıt";
      const staffName = teamMembers.find((m) => m.id === assignedTo)?.name || (assignedTo === currentUserId ? currentUserEmail : "");
      return `Bu tarih/saatte ${staffName || "bu personelin"} zaten ${name} ile aktif bir randevusu var - aynı personele aynı saate iki randevu girilemez.`;
    }
    // Kaynağın adedi (varsayılan 1) dolana kadar aynı isimdeki kaynağa paralel
    // randevu verilebilir - hangi fiziksel birimin kullanıldığı ayrıca takip
    // edilmiyor, sadece o an kaç tanesinin dolu olduğu sayılıyor (Otel'in oda
    // adedi mantığıyla aynı, ama saat bazlı).
    const sameResourceOverlap = resourceId ? overlapping.filter((d) => d.customFields?.resource_id === resourceId) : [];
    const resourceQuantity = Math.max(1, Number(resources.find((r) => r.id === resourceId)?.quantity) || 1);
    if (resourceId && sameResourceOverlap.length >= resourceQuantity) {
      const name = customers.find((c) => c.id === sameResourceOverlap[0].customerId)?.name || "başka bir kayıt";
      const resourceName = resources.find((r) => r.id === resourceId)?.name || "bu kaynak";
      return `${resourceName}, bu tarih/saatte ${name} için zaten kullanımda (adet doldu) - aynı kaynağa aynı saate ikinci bir randevu girilemez.`;
    }
    // Personel veya kaynak seçiliyse ve yukarıdaki kendi kontrolünü geçtiyse
    // (yeterli adet/uygunluk var), genel "eş zamanlı randevu kapasitesi"
    // sayısı ARTIK devreye girmemeli - o sayı sadece kimseye özel
    // atanmamış randevular için bir tavan, spesifik olarak atanmış bir
    // randevuyu, o personel/kaynağın kendi kontrolü geçmesine rağmen,
    // ilgisiz bir genel sayıyla bloke etmemeli.
    if (assignedTo || resourceId) return null;
    if (overlapping.length < concurrency) return null;
    const conflict = overlapping[0];
    const name = customers.find((c) => c.id === conflict.customerId)?.name || "başka bir kayıt";
    return `Bu tarih/saatte ${name} için de aktif bir randevu var - aynı saate iki randevu girilemez.`;
  };

  // Otel'de (bookingModel === "inventory") tek bir randevu saati yerine oda
  // tipi + tarih aralığı + stok kontrolü geçerli — bkz. roomTypeConflict.
  const findRoomConflict = (candidateStage, candidateCustomFields) => {
    if (bookingModel(sector) !== "inventory" || candidateStage === "kaybedildi") return null;
    const conflict = roomTypeConflict(
      {
        excludeDealId: initial?.id,
        roomType: candidateCustomFields?.oda_tipi,
        checkIn: candidateCustomFields?.giris_tarihi,
        checkOut: candidateCustomFields?.cikis_tarihi,
      },
      deals, roomInventory
    );
    if (!conflict) return null;
    return `Bu oda tipinde seçili tarihler için müsait oda kalmadı (${conflict.occupied}/${conflict.quantity} dolu).`;
  };

  useEffect(() => {
    if (lineItems.length > 0) setValue(String(Math.round((lineItemsTotal - discountAmount) * 100) / 100));
  }, [lineItemsTotal, lineItems.length, discountAmount]);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!customerId || !title.trim()) return;
        if (totalPaid > 0 && Number(value) < totalPaid) {
          setValueError(`Tutar, zaten tahsil edilen ${formatTL(totalPaid)}'nin altına düşürülemez.`);
          return;
        }
        setValueError("");
        if (isClosingStage && closedDate < dealDate) {
          setDateError("Bitiş tarihi, başlangıç tarihinden önce olamaz.");
          return;
        }
        setDateError("");
        if (isPackageDeal && Number(sessionTotal) < 1) {
          setSessionError("Toplam seans sayısı en az 1 olmalı.");
          return;
        }
        if (isPackageDeal && Number(sessionTotal) < Number(sessionUsed)) {
          setSessionError(`Toplam seans sayısı, zaten kullanılan ${sessionUsed} seansın altına düşürülemez.`);
          return;
        }
        setSessionError("");
        const useAppointmentCredit = hasCredit && applyCredit;
        const payload = {
          id: initial?.id || uid(),
          customerId,
          title: title.trim(),
          value: useAppointmentCredit ? 0 : Number(value) || 0,
          cost: Number(cost) || 0,
          paymentMode: useAppointmentCredit ? "none" : paymentMode,
          useAppointmentCredit,
          kdvRate,
          stage,
          reminder: reminder.trim(),
          reminderDate: reminderDate || null,
          lostReason: stage === "kaybedildi" ? lostReason : "",
          isPackageDeal,
          sessionTotal: isPackageDeal ? Number(sessionTotal) || 0 : null,
          sessionUsed: isPackageDeal ? Math.min(Number(sessionUsed) || 0, Number(sessionTotal) || 0) : 0,
          tags,
          // price_item_id: hangi fiyat listesi kalemi seçildiyse (üst seçici,
          // Kalemler'den bağımsız tek-hizmetlik durum) — tazeleme hatırlatıcısı
          // ve stok reçetesi düşümü bunu okuyor (bkz. App.jsx:computeServiceCompletionEffects).
          customFields: {
            ...customFields,
            price_item_id: selectedPriceItemId || null,
            package_breakdown: isPackageDeal && packageBreakdown.length > 0
              ? packageBreakdown.filter((b) => b.label.trim() && Number(b.total) >= 1).map((b) => ({ label: b.label.trim(), total: Number(b.total) || 1, used: Math.min(Number(b.used) || 0, Number(b.total) || 1) }))
              : null,
            discount: lineItems.length > 0 && discountValue !== "" && Number(discountValue) > 0
              ? { type: discountType, value: Number(discountValue) }
              : null,
            resource_id: resourceId || null,
          },
          lineItems: lineItems
            .filter((li) => li.description.trim())
            .map((li) => ({ description: li.description.trim(), quantity: Number(li.quantity) || 1, unitPrice: Number(li.unitPrice) || 0, priceItemId: li.priceItemId || null })),
          assignedTo: assignedTo || null,
          notifyCustomer,
          approvalToken: initial?.approvalToken || null,
          approvedAt: initial?.approvedAt || null,
          // Saat boş bırakılırsa YENİ bir teklifte gerçek "şu an"ın saatini
          // kullanıyoruz — yoksa aynı gün eklenen tüm teklifler aynı (gece
          // yarısı) zaman damgasını alıp "en yeni eklenen" sıralamasında
          // birbirinden ayırt edilemiyordu (ekleme sırası korunuyor, en
          // yeni en üste çıkmıyordu). Var olan bir teklifi düzenlerken bu
          // davranış değişmiyor — kaydedilmiş saat neyse o korunuyor.
          createdAt: new Date(`${dealDate}T${dealTime || (initial ? "00:00" : new Date().toTimeString().slice(0, 5))}`).toISOString(),
          closedAt: isClosingStage ? new Date(`${closedDate}T00:00`).toISOString() : null,
        };
        const conflictMessage = findAppointmentConflict(stage, customFields);
        if (conflictMessage) {
          setConflictError(conflictMessage);
          return;
        }
        const roomConflictMessage = findRoomConflict(stage, customFields);
        if (roomConflictMessage) {
          setConflictError(roomConflictMessage);
          return;
        }
        setConflictError("");
        onSave(payload);
      }}
      className="compact-form"
      style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}
    >
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", paddingRight: 4 }}>
      <div style={{ marginBottom: 12 }}>
        <label style={{ fontSize: 13, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Müşteri</label>
        {initial ? (
          <p style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>{customers.find((c) => c.id === customerId)?.name || "Bilinmeyen müşteri"}</p>
        ) : customers.length === 0 ? (
          <p style={{ fontSize: 13, color: "var(--text-muted)" }}>Önce bir müşteri ekleyin.</p>
        ) : (
          <select value={customerId} onChange={(e) => setCustomerId(e.target.value)} style={{ width: "100%" }}>
            {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        )}
      </div>
      {creditRisk && (
        <div style={{ display: "flex", alignItems: "flex-start", gap: 8, background: "var(--bg-warning)", border: "0.5px solid var(--text-warning)", borderRadius: "var(--radius)", padding: "10px 12px", marginBottom: 12, fontSize: 13 }}>
          <i className="ti ti-alert-triangle" style={{ fontSize: 16, color: "var(--text-warning)", flexShrink: 0, marginTop: 1 }} aria-hidden="true"></i>
          <div>
            <p style={{ margin: 0, fontWeight: 500, color: "var(--text-warning)" }}>
              {selectedCustomer?.name} için ödeme riski
            </p>
            <p style={{ margin: "2px 0 0", color: "var(--text-secondary)" }}>
              {creditRisk.overLimit && `Bakiyesi (${formatTL(creditRisk.balance)}) kredi limitini (${formatTL(creditRisk.creditLimit)}) aşıyor. `}
              {creditRisk.overdueBalance > 0 && `${formatTL(creditRisk.overdueBalance)} tutarında vadesi geçmiş bakiyesi var. `}
              Bu sadece bir uyarı - devam edip etmemek size kalmış.
            </p>
          </div>
        </div>
      )}
      {noShowRisk && (
        <div style={{ display: "flex", alignItems: "flex-start", gap: 8, background: "var(--bg-warning)", border: "0.5px solid var(--text-warning)", borderRadius: "var(--radius)", padding: "10px 12px", marginBottom: 12, fontSize: 13 }}>
          <i className="ti ti-calendar-off" style={{ fontSize: 16, color: "var(--text-warning)", flexShrink: 0, marginTop: 1 }} aria-hidden="true"></i>
          <div style={{ flex: 1 }}>
            <p style={{ margin: 0, fontWeight: 500, color: "var(--text-warning)" }}>
              {selectedCustomer?.name} daha önce{noShowRisk.noShowCount > 0 ? ` ${noShowRisk.noShowCount} kez randevusuna gelmedi` : ""}{noShowRisk.noShowCount > 0 && noShowRisk.lateCancelCount > 0 ? "," : ""}{noShowRisk.lateCancelCount > 0 ? ` ${noShowRisk.lateCancelCount} kez geç iptal etti` : ""}
            </p>
            <p style={{ margin: "2px 0 0", color: "var(--text-secondary)" }}>
              {noShowPenaltyBurnsInstead
                ? "Bu müşterinin aktif bir paketi var - politikanız gereği ödeme istemek yerine ihlallerinde paketten otomatik seans düşülüyor, ayrıca bir işlem yapmanız gerekmiyor."
                : paymentMode === "required"
                ? "Müsaitlik Saatleri'ndeki politikanız gereği ödeme otomatik olarak zorunlu yapıldı - Tutar alanına kapora/tutar girin, isterseniz aşağıdan bu tercihi değiştirebilirsiniz."
                : "Politikanız bu müşteri için ödeme zorunlu tutmayı öneriyor - Tutar alanına kapora miktarını girip aşağıdan \"Ödeme zorunlu\" seçebilirsiniz."}
            </p>
          </div>
          {!noShowPenaltyBurnsInstead && paymentMode !== "required" && (
            <button type="button" onClick={() => setPaymentMode("required")} style={{ fontSize: 12, flexShrink: 0, whiteSpace: "nowrap" }}>
              Ödemeyi zorunlu yap
            </button>
          )}
        </div>
      )}
      {hasCredit && (
        <div style={{ display: "flex", alignItems: "flex-start", gap: 8, background: "var(--bg-accent)", border: "0.5px solid var(--border-strong)", borderRadius: "var(--radius)", padding: "10px 12px", marginBottom: 12, fontSize: 13 }}>
          <i className="ti ti-gift" style={{ fontSize: 16, color: "var(--text-accent)", flexShrink: 0, marginTop: 1 }} aria-hidden="true"></i>
          <div style={{ flex: 1 }}>
            <p style={{ margin: 0, fontWeight: 500 }}>
              {selectedCustomer?.name} için {selectedCustomer?.appointmentCreditCount} ücretsiz telafi hakkı var
            </p>
            <label style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4, color: "var(--text-secondary)", cursor: "pointer" }}>
              <input type="checkbox" checked={applyCredit} onChange={(e) => setApplyCredit(e.target.checked)} />
              Bu randevuya uygula (Tutar 0 TL olur, ödeme istenmez)
            </label>
          </div>
        </div>
      )}
      {(initial?.approvedAt || initial?.paymentStatus === "paid") && (
        <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
          {initial?.approvedAt && <Badge tone="success">✓ Müşteri onayladı</Badge>}
          {/* payment_status DB'de "paid" olsa bile bu kapora gibi kısmi bir
              tahsilat olabilir (bkz. api/deal-approval.js:recordSuccessfulPayment
              yorumu) - burada gerçekten tam ödendi mi totalPaid/value ile ayrıca
              doğrulanıyor, yoksa kapora "tam ödendi" gibi yanlış görünürdü. */}
          {initial?.paymentStatus === "paid" && totalPaid >= (initial?.value || 0) && <Badge tone="success">✓ Online ödendi</Badge>}
          {initial?.paymentStatus === "paid" && totalPaid < (initial?.value || 0) && <Badge tone="warning">✓ Kapora ödendi</Badge>}
        </div>
      )}
      {(priceListItems.length > 0 || (bookingModel(sector) === "slot" && appointmentDateTimeKey) || membershipEndDef) && (
        <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
          {priceListItems.length > 0 && (
            <div style={{ flex: 1, minWidth: 200 }}>
              <label style={{ fontSize: 13, color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: 4, marginBottom: 4 }}>
                Ürün/Hizmet
                <InfoTip placement="bottom" align="left" text="Listeden seçmek başlığı ve tutarı otomatik doldurur, sonrasında yine de değiştirebilirsiniz. Fiyat Listesi sekmesinden yönetilir." />
              </label>
              <select
                value={selectedPriceItemId}
                onChange={(e) => {
                  const item = priceListItems.find((p) => p.id === e.target.value);
                  setSelectedPriceItemId(e.target.value);
                  if (item) { setTitle(item.name); setValue(String(item.price)); }
                  else { setTitle(""); setValue(""); }
                }}
                style={{ width: "100%" }}
              >
                <option value="">Elle doldur / listeden seç</option>
                {priceListItems.map((p) => <option key={p.id} value={p.id}>{p.name} - {formatTL(p.price)}</option>)}
              </select>
            </div>
          )}
          {bookingModel(sector) === "slot" && appointmentDateTimeKey && (
            // Randevu tarihi önemli bir alan — Özel alanlar'ın altında gömülü
            // kalmasın diye Ürün/Hizmet'in yanına, formun üstüne taşındı. Müsaitlik
            // önerisi ayrı bir kutu değil, alanın kendisinin bir parçası (aşağıya bkz.).
            <div style={{ flex: 1.4, minWidth: 240 }}>
              <AppointmentDateTimeField
                businessUserId={businessUserId}
                label={customFieldDefs.find((d) => d.entity === "deal" && d.key === appointmentDateTimeKey)?.label || "Randevu Tarihi"}
                value={customFields[appointmentDateTimeKey]}
                onChange={(v) => setCustomFields({ ...customFields, [appointmentDateTimeKey]: v })}
              />
            </div>
          )}
          {membershipEndDef && (
            <div style={{ flex: 1, minWidth: 160 }}>
              <label style={{ fontSize: 13, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>{membershipEndDef.label}</label>
              <input
                type="date"
                value={customFields[membershipEndDef.key] || ""}
                onChange={(e) => setCustomFields({ ...customFields, [membershipEndDef.key]: e.target.value })}
                style={{ width: "100%" }}
              />
            </div>
          )}
        </div>
      )}
      <div style={{ marginBottom: 6 }}>
        <label style={{ fontSize: 13, color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: 4, marginBottom: 4 }}>
          Kalemler (opsiyonel)
          <InfoTip align="left" text="Birden fazla ürün/hizmet satırı eklerseniz Tutar bunların toplamına otomatik hesaplanır. Hiç kalem eklemezseniz Tutar'ı yine elle girebilirsiniz." />
          {lineItemsDuration > 0 && <Badge tone="default">Tahmini süre: {lineItemsDuration} dk</Badge>}
        </label>
        {lineItems.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 6 }}>
            {lineItems.map((li, i) => (
              <div key={li.localId ?? i} style={{ border: "0.5px solid var(--border)", borderRadius: "var(--radius)", padding: 8 }}>
                <div style={{ display: "flex", gap: 6, alignItems: "flex-end", marginBottom: 6 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <label style={{ fontSize: 11, color: "var(--text-muted)", display: "block", marginBottom: 2 }}>Açıklama</label>
                    <input
                      value={li.description}
                      onChange={(e) => setLineItems((prev) => prev.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)))}
                      placeholder={`Örn. ${PRICE_ITEM_NAME_EXAMPLES[sector] || "Danışmanlık"}`}
                      style={{ width: "100%", fontSize: 13 }}
                    />
                  </div>
                  <IconButton icon="ti-trash" title="Kalemi sil" size="sm" onClick={() => setLineItems((prev) => prev.filter((_, j) => j !== i))} />
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <div style={{ width: 70 }}>
                    <label style={{ fontSize: 11, color: "var(--text-muted)", display: "block", marginBottom: 2 }}>Adet</label>
                    <input
                      type="number" min="0" step="1"
                      value={li.quantity}
                      onChange={(e) => setLineItems((prev) => prev.map((x, j) => (j === i ? { ...x, quantity: e.target.value } : x)))}
                      style={{ width: "100%", minWidth: 0, fontSize: 13 }}
                    />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <label style={{ fontSize: 11, color: "var(--text-muted)", display: "block", marginBottom: 2 }}>Birim fiyat (TL)</label>
                    <input
                      type="number" min="0"
                      value={li.unitPrice}
                      onChange={(e) => setLineItems((prev) => prev.map((x, j) => (j === i ? { ...x, unitPrice: e.target.value } : x)))}
                      style={{ width: "100%", minWidth: 0, fontSize: 13 }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button
            type="button"
            onClick={() => setLineItems((prev) => {
              const blank = { localId: uid(), description: "", quantity: 1, unitPrice: 0 };
              // İlk kalem eklendiğinde, o ana kadar Başlık/Tutar'a elle (veya
              // üstteki Ürün/Hizmet seçiciyle) girilmiş olan tutar sessizce
              // kaybolmasın diye ilk satır olarak devralınır — AYRICA hemen
              // arkasından boş bir satır daha eklenir, yoksa buton "hiçbir şey
              // yapmıyormuş" gibi görünüyordu (Tutar aynı kalıyordu çünkü
              // devralınan tek kalem zaten mevcut tutara eşit).
              if (prev.length === 0 && title.trim() && Number(value) > 0) {
                return [{ localId: uid(), description: title.trim(), quantity: 1, unitPrice: Number(value) }, blank];
              }
              return [...prev, blank];
            })}
            style={{ fontSize: 12 }}
          >
            + Kalem ekle
          </button>
          {priceListItems.length > 0 && (
            <select
              value=""
              onChange={(e) => {
                const item = priceListItems.find((p) => p.id === e.target.value);
                if (!item) return;
                setLineItems((prev) => {
                  const newRow = { localId: uid(), description: item.name, quantity: 1, unitPrice: item.price, priceItemId: item.id };
                  if (prev.length === 0 && title.trim() && Number(value) > 0) {
                    return [{ localId: uid(), description: title.trim(), quantity: 1, unitPrice: Number(value), priceItemId: null }, newRow];
                  }
                  return [...prev, newRow];
                });
              }}
              style={{ fontSize: 12 }}
            >
              <option value="">Fiyat listesinden kalem ekle…</option>
              {priceListItems.map((p) => <option key={p.id} value={p.id}>{p.name} - {formatTL(p.price)}</option>)}
            </select>
          )}
          {sector === "uretim_satis" && (
            <div style={{ position: "relative" }}>
              <button type="button" onClick={() => setShowFreightCalc((v) => !v)} style={{ fontSize: 12 }}>
                + Navlun/Gümrük ekle
              </button>
              {showFreightCalc && (
                <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, zIndex: 20, background: "var(--surface-1)", border: "0.5px solid var(--border)", borderRadius: "var(--radius)", padding: 10, width: 220, boxShadow: "0 8px 24px rgba(0,0,0,0.15)" }}>
                  <label style={{ fontSize: 11, color: "var(--text-muted)", display: "block", marginBottom: 2 }}>Teslim Şekli</label>
                  <select value={freightIncoterm} onChange={(e) => setFreightIncoterm(e.target.value)} style={{ width: "100%", fontSize: 13, marginBottom: 6 }}>
                    <option value="FOB">FOB</option>
                    <option value="CIF">CIF</option>
                    <option value="EXW">EXW</option>
                    <option value="DAP">DAP</option>
                  </select>
                  <label style={{ fontSize: 11, color: "var(--text-muted)", display: "block", marginBottom: 2 }}>Navlun/Gümrük Oranı (%)</label>
                  <input type="number" min="0" step="0.1" value={freightPercent} onChange={(e) => setFreightPercent(e.target.value)} placeholder="Örn. 8" style={{ width: "100%", fontSize: 13, marginBottom: 6 }} />
                  <label style={{ fontSize: 11, color: "var(--text-muted)", display: "block", marginBottom: 2 }}>Sabit Navlun Ücreti (TL)</label>
                  <input type="number" min="0" value={freightFlatFee} onChange={(e) => setFreightFlatFee(e.target.value)} placeholder="Opsiyonel" style={{ width: "100%", fontSize: 13, marginBottom: 8 }} />
                  <p style={{ fontSize: 11, color: "var(--text-muted)", margin: "0 0 8px" }}>
                    Oran, mevcut kalem toplamı üzerinden hesaplanır - bu kendi sabit oranınız, canlı gümrük/navlun verisi değildir.
                  </p>
                  <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                    <button type="button" onClick={() => setShowFreightCalc(false)} style={{ fontSize: 12 }}>Vazgeç</button>
                    <button
                      type="button"
                      onClick={() => {
                        const percent = Number(freightPercent) || 0;
                        const flatFee = Number(freightFlatFee) || 0;
                        const baseTotal = lineItemsTotal || Number(value) || 0;
                        const amount = Math.round(baseTotal * (percent / 100) + flatFee);
                        if (amount <= 0) return;
                        localStorage.setItem("binerly_freight_incoterm", freightIncoterm);
                        localStorage.setItem("binerly_freight_percent", freightPercent);
                        localStorage.setItem("binerly_freight_flat_fee", freightFlatFee);
                        setLineItems((prev) => {
                          const newRow = { localId: uid(), description: `Navlun/Gümrük (${freightIncoterm}${percent ? `, %${percent}` : ""})`, quantity: 1, unitPrice: amount };
                          if (prev.length === 0 && title.trim() && Number(value) > 0) {
                            return [{ localId: uid(), description: title.trim(), quantity: 1, unitPrice: Number(value) }, newRow];
                          }
                          return [...prev, newRow];
                        });
                        setShowFreightCalc(false);
                      }}
                      style={{ fontSize: 12, background: "var(--fill-accent)", color: "var(--on-accent)", border: "none" }}
                    >
                      Kalem olarak ekle
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
        {lineItems.length > 0 && (
          <div style={{ marginTop: 8, display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
            <div style={{ width: 100 }}>
              <label style={{ fontSize: 11, color: "var(--text-muted)", display: "block", marginBottom: 2 }}>İndirim</label>
              <input
                type="number" min="0" step="0.01"
                value={discountValue}
                onChange={(e) => setDiscountValue(e.target.value)}
                placeholder="0"
                style={{ width: "100%", fontSize: 13 }}
              />
            </div>
            <div style={{ width: 70 }}>
              <label style={{ fontSize: 11, color: "var(--text-muted)", display: "block", marginBottom: 2 }}>&nbsp;</label>
              <select value={discountType} onChange={(e) => setDiscountType(e.target.value)} style={{ width: "100%", fontSize: 13 }}>
                <option value="percent">%</option>
                <option value="amount">TL</option>
              </select>
            </div>
            {discountAmount > 0 && (
              <p style={{ fontSize: 12.5, color: "var(--text-muted)", margin: "0 0 6px" }}>
                Kalem toplamı {formatTL(lineItemsTotal)} - indirim {formatTL(discountAmount)} = <strong>{formatTL(lineItemsTotal - discountAmount)}</strong>
              </p>
            )}
          </div>
        )}
      </div>
      <div style={{ display: "flex", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
        <div style={{ flex: "1.6 1 200px" }}>
          <label style={{ fontSize: 13, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Başlık</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={DEAL_TITLE_EXAMPLES[sector] || (selectedCustomerType === "bireysel" ? "İlk randevu / danışmanlık" : "Yıllık tedarik anlaşması")} list="deal-title-suggestions" style={{ width: "100%" }} />
          <datalist id="deal-title-suggestions">
            {titleSuggestions.map((t) => <option key={t} value={t} />)}
          </datalist>
        </div>
        <div style={{ flex: "1 1 140px" }}>
          <label style={{ fontSize: 13, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>
            Tutar (TL) <span style={{ fontWeight: 400, color: "var(--text-muted)" }}>- KDV dahil{lineItems.length > 0 ? ", kalemlerden otomatik" : ""}</span>
          </label>
          <input type="number" min="0" value={value} disabled={lineItems.length > 0} onChange={(e) => setValue(e.target.value)} placeholder="0" style={{ width: "100%" }} />
          {totalPaid > 0 && (
            <p style={{ fontSize: 12, color: valueError ? "var(--text-danger)" : "var(--text-muted)", margin: "4px 0 0" }}>
              {valueError || `Şu ana kadar ${formatTL(totalPaid)} tahsil edildi.`}
            </p>
          )}
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 120px" }}>
          <label style={{ fontSize: 13, color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: 4, marginBottom: 4 }}>KDV oranı <InfoTip align="left" text={kdvRateInfoText(sector)} /></label>
          <select value={kdvRate} onChange={(e) => setKdvRate(Number(e.target.value))} style={{ width: "100%" }}>
            <option value={20}>%20</option>
            <option value={10}>%10</option>
            <option value={1}>%1</option>
            <option value={0}>%0</option>
          </select>
        </div>
        <div style={{ flex: "1.4 1 180px" }}>
          <label style={{ fontSize: 13, color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: 4, marginBottom: 4 }}>
            Müşteri ödemesi
            <InfoTip text="Onay linkinden veya müşteri portalından kartla ödeme alınabilir - iyzico veya PayTR bağlantısı Ayarlar'dan kurulmalı." />
          </label>
          <select value={paymentMode} onChange={(e) => { setPaymentMode(e.target.value); localStorage.setItem(PAYMENT_MODE_LAST_CHOICE_KEY, e.target.value); }} style={{ width: "100%" }}>
            {PAYMENT_MODE_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
          </select>
          {paymentMode !== "none" && !hasPaymentConnection && (
            <p style={{ fontSize: 12.5, color: "var(--text-warning, #b45309)", margin: "4px 0 0" }}>
              Ödeme almak için önce Ayarlar'dan iyzico veya PayTR hesabınızı bağlamanız gerekiyor.
            </p>
          )}
        </div>
      </div>
      {initial?.stage === "kazanildi" && (Number(value) !== initial?.value || Number(kdvRate) !== initial?.kdvRate) && (
        <p style={{ fontSize: 12.5, color: "var(--text-warning, #b45309)", margin: "-4px 0 12px" }}>
          Bu {DEAL_WORD_FORMS[dealWordKind(sector)].bare} zaten kazanılmış - Tutar/KDV değişikliği, bu döneme ait KDV Özet Raporu'nu da geriye dönük etkiler.
        </p>
      )}
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <div style={{ flex: 1 }}>
          <label style={{ fontSize: 13, color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: 4, marginBottom: 4 }}>
            {supportsSelfBooking(sector) ? "Kayıt Tarihi" : "Tarih"}
            {supportsSelfBooking(sector) && (
              <InfoTip align="left" text={`Bu, kaydın oluşturulma/güncellenme tarihidir - ${DEAL_WORD_FORMS[dealWordKind(sector)].bare === "randevu" ? "randevunun" : DEAL_WORD_FORMS[dealWordKind(sector)].bare === "rezervasyon" ? "rezervasyonun" : "görüşmenin"} kendi tarih/saati için ${bookingModel(sector) === "slot" ? "yukarıdaki" : "aşağıdaki özel alanlar bölümündeki"} "${customFieldDefs.find((d) => d.entity === "deal" && d.key === appointmentDateTimeKey)?.label || "Randevu/Görüşme Tarihi"}" alanını kullanın.`} />
            )}
          </label>
          <input type="date" value={dealDate} onChange={(e) => setDealDate(e.target.value)} style={{ width: "100%" }} />
        </div>
        <div style={{ flex: 1 }}>
          <label style={{ fontSize: 13, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Saat <span style={{ fontWeight: 400, color: "var(--text-muted)" }}>(opsiyonel)</span></label>
          <input type="time" value={dealTime} onChange={(e) => setDealTime(e.target.value)} style={{ width: "100%" }} />
        </div>
        <div style={{ flex: 1 }}>
          <label style={{ fontSize: 13, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Aşama</label>
          <select
            value={stage}
            onChange={(e) => setStage(e.target.value)}
            style={{ width: "100%", fontWeight: 500, ...TONE_COLORS[stageTone(stage)] }}
          >
            {STAGES.map((s) => <option key={s.id} value={s.id} style={TONE_COLORS[stageTone(s.id)]}>{stageLabel(s.id, selectedCustomerType, sector)}</option>)}
          </select>
        </div>
      </div>
      {stageGuide(stage, sector) && (
        <div style={{ background: "var(--surface-1)", borderRadius: "var(--radius)", padding: "8px 10px", marginBottom: 12, fontSize: 12.5, color: "var(--text-secondary)", display: "flex", alignItems: "flex-start", gap: 6 }}>
          <i className="ti ti-bulb" style={{ fontSize: 14, flexShrink: 0, marginTop: 1, color: "var(--text-accent)" }} aria-hidden="true"></i>
          <span>{stageGuide(stage, sector)}</span>
        </div>
      )}
      {isClosingStage && (
        <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 160 }}>
            <label style={{ fontSize: 13, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>
              {selectedCustomerType === "bireysel"
                ? (stage === "kazanildi" ? "Tamamlanma / fatura tarihi" : "İptal tarihi")
                : (stage === "kazanildi" ? "Kapanma / fatura tarihi" : "Kapanma tarihi")}
            </label>
            <input type="date" min={dealDate} value={closedDate} onChange={(e) => setClosedDate(e.target.value)} style={{ width: "100%" }} />
            {dateError && <p style={{ fontSize: 12, color: "var(--text-danger)", margin: "4px 0 0" }}>{dateError}</p>}
          </div>
          {stage === "kaybedildi" && (
            <div style={{ flex: 1, minWidth: 160 }}>
              <label style={{ fontSize: 13, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>{selectedCustomerType === "bireysel" ? "İptal nedeni" : "Kayıp nedeni"}</label>
              <select value={lostReason} onChange={(e) => setLostReason(e.target.value)} style={{ width: "100%" }}>
                {dealLostReasons(sector).map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={() => setShowAdvanced((v) => !v)}
        style={{
          width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
          background: "var(--surface-1)", border: "0.5px solid var(--border)", borderRadius: "var(--radius)",
          padding: "8px 12px", marginBottom: showAdvanced ? 10 : 12, fontSize: 13, fontWeight: 500, cursor: "pointer",
        }}
      >
        <span>
          Ek Bilgiler ve Dosyalar{" "}
          <span style={{ fontWeight: 400, color: "var(--text-muted)", fontSize: 12 }}>
            (Gider, seans/paket, not, sorumlu, etiket, özel alan, dosya)
          </span>
        </span>
        <i className={`ti ${showAdvanced ? "ti-chevron-up" : "ti-chevron-down"}`} style={{ fontSize: 16, flexShrink: 0 }} aria-hidden="true"></i>
      </button>
      {showAdvanced && (
        <div>
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 13, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Gider (TL)</label>
            <input type="number" min="0" value={cost} onChange={(e) => setCost(e.target.value)} placeholder="0" style={{ width: "100%" }} />
          </div>
          {teamMembers.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 13, color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: 4, marginBottom: 4 }}>Sorumlu <InfoTip text={ASSIGNEE_INFO_TEXT} /></label>
              <select value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)} style={{ width: "100%" }}>
                {currentUserId && <option value={currentUserId}>Ben ({currentUserEmail})</option>}
                {teamMembers.filter((m) => m.id !== currentUserId).map((m) => <option key={m.id} value={m.id}>{m.name || m.email}</option>)}
                {assignedTo && assignedTo !== currentUserId && !teamMembers.some((m) => m.id === assignedTo) && (
                  <option value={assignedTo}>Eski üye (takımdan çıkarılmış)</option>
                )}
              </select>
            </div>
          )}
          {resources.length > 0 && bookingModel(sector) === "slot" && (
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 13, color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: 4, marginBottom: 4 }}>
                Cihaz/Oda <InfoTip text="Seçtiğiniz kaynağa aynı saatte ikinci bir randevu girilemez - kaynak seçmezseniz bu kontrol uygulanmaz." />
              </label>
              <select value={resourceId} onChange={(e) => setResourceId(e.target.value)} style={{ width: "100%" }}>
                <option value="">Seçilmedi</option>
                {resources.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                {resourceId && !resources.some((r) => r.id === resourceId) && (
                  <option value={resourceId}>Eski kaynak (silinmiş)</option>
                )}
              </select>
            </div>
          )}
          {supportsSessionPackages(sector) && (
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--text-secondary)", cursor: "pointer" }}>
                <input type="checkbox" checked={isPackageDeal} onChange={(e) => setIsPackageDeal(e.target.checked)} />
                Bu bir seans/paket satışı
                <InfoTip text={SESSION_PACKAGE_INFO_TEXT} />
              </label>
            </div>
          )}
          {supportsSessionPackages(sector) && isPackageDeal && (
            <div style={{ marginBottom: 12 }}>
              {packageBreakdown.length === 0 ? (
                <div style={{ display: "flex", gap: 8 }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: 13, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Toplam seans sayısı</label>
                    <input type="number" min="1" value={sessionTotal} onChange={(e) => setSessionTotal(e.target.value)} style={{ width: "100%" }} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: 13, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Kullanılan seans sayısı</label>
                    <input type="number" min="0" value={sessionUsed} onChange={(e) => setSessionUsed(e.target.value)} style={{ width: "100%" }} />
                  </div>
                </div>
              ) : (
                <div>
                  <label style={{ fontSize: 13, color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: 4, marginBottom: 6 }}>
                    Hizmet türleri
                    <InfoTip align="left" text="Örn. '8 seans Lazer + 2 seans Kontrol' gibi karma bir paket - her hizmet türünün kendi seans sayacı olur, toplam/kullanılan otomatik hesaplanır." />
                  </label>
                  {packageBreakdown.map((b, i) => (
                    <div key={i} style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 6 }}>
                      <input value={b.label} onChange={(e) => updateBreakdownRow(i, { label: e.target.value })} placeholder="Örn. Lazer" style={{ flex: 2, minWidth: 0 }} />
                      <input type="number" min="1" value={b.total} onChange={(e) => updateBreakdownRow(i, { total: Number(e.target.value) || 1 })} placeholder="Toplam" title="Toplam seans" style={{ width: 64 }} />
                      <input type="number" min="0" value={b.used} onChange={(e) => updateBreakdownRow(i, { used: Math.min(Number(e.target.value) || 0, Number(b.total) || 0) })} placeholder="Kullanılan" title="Kullanılan seans" style={{ width: 64 }} />
                      <button type="button" onClick={() => removeBreakdownRow(i)} style={{ fontSize: 12, flexShrink: 0 }}>Kaldır</button>
                    </div>
                  ))}
                  <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: "4px 0" }}>Toplam: {sessionTotal} seans, {sessionUsed} kullanıldı</p>
                </div>
              )}
              <button type="button" onClick={() => (packageBreakdown.length === 0 ? convertToBreakdown() : addBreakdownRow())} style={{ fontSize: 12, marginTop: 4 }}>
                {packageBreakdown.length === 0 ? "+ Karma pakete çevir (birden fazla hizmet türü)" : "+ Hizmet türü ekle"}
              </button>
              {sessionError && <p style={{ fontSize: 12, color: "var(--text-danger)", margin: "4px 0 0" }}>{sessionError}</p>}
            </div>
          )}
          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            <div style={{ flex: 2 }}>
              <label style={{ fontSize: 13, color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: 4, marginBottom: 4 }}>
                Not
                <InfoTip align="left" text="İsterseniz sadece bir not olarak kullanın (tarih boş kalabilir), isterseniz sağdaki tarihi de doldurup gerçek bir hatırlatmaya çevirin - tarih girilirse Pano'da ve 'Bugün ne yapmalıyım' listesinde çıkar." />
              </label>
              <div style={{ display: "flex", gap: 6 }}>
                <input value={reminder} onChange={(e) => setReminder(e.target.value)} placeholder="Yarın takip araması yap" style={{ flex: 1 }} />
                <VoiceInputButton onResult={(text) => setReminder((prev) => (prev ? `${prev} ${text}` : text))} />
              </div>
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 13, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Hatırlatma tarihi <span style={{ fontWeight: 400, color: "var(--text-muted)" }}>(opsiyonel)</span></label>
              <input type="date" value={reminderDate} onChange={(e) => setReminderDate(e.target.value)} style={{ width: "100%" }} />
              <div style={{ display: "flex", gap: 4, marginTop: 4 }}>
                {[["Bugün", 0], ["Yarın", 1], ["1 hafta sonra", 7]].map(([label, days]) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => setReminderDate(new Date(Date.now() + days * 86400000).toISOString().slice(0, 10))}
                    style={{ fontSize: 11, height: 24, padding: "0 10px", display: "inline-flex", alignItems: "center" }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>
          {reminder.trim() && reminderDate && (
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--text-secondary)", cursor: selectedCustomerEmail ? "pointer" : "not-allowed" }}>
                <input
                  type="checkbox"
                  checked={notifyCustomer}
                  disabled={!selectedCustomerEmail}
                  onChange={(e) => setNotifyCustomer(e.target.checked)}
                />
                Hatırlatma tarihinde müşteriye de e-posta gönder
              </label>
              {!selectedCustomerEmail && (
                <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "4px 0 0 24px" }}>Müşterinin e-postası yok, gönderilemez.</p>
              )}
            </div>
          )}
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 13, color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: 4, marginBottom: 4 }}>Etiketler <InfoTip align="left" text={TAGS_INFO_TEXT} /></label>
            <TagInput tags={tags} onChange={setTags} suggestions={sectorTags} />
          </div>
          <CustomFieldsSection defs={otherDefsForEntity} values={customFields} onChange={setCustomFields} />
          {initial?.id && isAppointmentSector(sector) && (
            <BeforeAfterPhotos
              dealId={initial.id}
              customer={customers.find((c) => c.id === customerId)}
              attachments={attachments}
              onUpload={onUploadAttachment}
              onDelete={onDeleteAttachment}
              onRequestConsent={onRequestPhotoConsent}
            />
          )}
          {initial?.id && (
            <AttachmentList
              entityType="deals"
              entityId={initial.id}
              attachments={attachments}
              onUpload={onUploadAttachment}
              onDownload={onDownloadAttachment}
              onDelete={onDeleteAttachment}
              onToggleShare={onToggleAttachmentShare}
            />
          )}
        </div>
      )}
      {conflictError && <p style={{ fontSize: 12.5, color: "var(--text-danger)", margin: "0 0 8px" }}>{conflictError}</p>}
      </div>
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", paddingTop: 12, marginTop: 4, borderTop: "1px solid var(--border)", flexShrink: 0 }}>
        <button type="button" onClick={onCancel}>Vazgeç</button>
        <button type="submit" disabled={customers.length === 0} style={{ background: "var(--fill-accent)", color: "var(--on-accent)", border: "none" }}>Kaydet</button>
      </div>
    </form>
  );
}

function paymentDateLabel(dateStr) {
  return new Date(dateStr).toLocaleDateString("tr-TR", { day: "numeric", month: "short", year: "numeric" });
}

const REFUND_REASON_OPTIONS = [
  { value: "buyer_request", label: "Müşteri talebi" },
  { value: "double_payment", label: "Mükerrer ödeme" },
  { value: "other", label: "Diğer" },
];

// Sadece elle eklenen tahsilatlarda seçilebilir - online (iyzico/PayTR)
// ödemelerde yöntem zaten "online" olarak biliniyor, ayrıca sorulmaz.
const PAYMENT_METHOD_LABELS = { nakit: "Nakit", kart: "Kart", havale: "Havale/EFT", diger: "Diğer" };

// iyzico/PayTR'da işlem, alındığı gün gün sonu mutabakatından önce iptal
// edilirse hiç gerçekleşmemiş sayılır ve komisyon kesilmez - ama gün sonu
// kapanışı geçip muhasebeleştikten sonra yapılan bir iadede kesilen komisyon
// sağlayıcı tarafından geri ödenmez (bu maliyet üye işyerinde kalır). Bu not,
// KOBİ iade tutarını girmeden ÖNCE bu maliyeti görsün diye ödemenin gerçek
// tarihine göre otomatik hesaplanıyor - PayTR'nin gün-sonrası politikası
// sözleşmeye bağlı olduğu için (iyzico'nun aksine kesin değil) ayrı ifade edildi.
function refundCommissionNote(payment) {
  const providerLabel = payment.provider === "paytr" ? "PayTR" : "iyzico";
  const isSameDay = (payment.paidAt || "").slice(0, 10) === new Date().toISOString().slice(0, 10);
  if (isSameDay) {
    return `Bugün alınan bir ödeme - gün sonu kapanışından önce iptal ederseniz ${providerLabel} komisyon kesmez.`;
  }
  if (payment.provider === "paytr") {
    return `Bu ödeme ${paymentDateLabel(payment.paidAt)} tarihinde alındı - gün sonu kapanışı geçtiği için komisyon iadesi üye işyeri sözleşmenizin şartlarına bağlı, genel uygulamada geri ödenmez.`;
  }
  return `Bu ödeme ${paymentDateLabel(payment.paidAt)} tarihinde alındı - gün sonu kapanışı geçtiği için iyzico, satıştan kesilen komisyonu iade etmez, bu maliyet üzerinizde kalır.`;
}

function DealPayments({ deal, payments, sector, onAddPayment, onUpdatePayment, onDeletePayment, onRefundPayment, canDelete }) {
  const [amount, setAmount] = useState("");
  const [paidAt, setPaidAt] = useState(new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState("");
  const [method, setMethod] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editAmount, setEditAmount] = useState("");
  const [editPaidAt, setEditPaidAt] = useState("");
  const [editNote, setEditNote] = useState("");
  const [editMethod, setEditMethod] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState("");
  const [refundingId, setRefundingId] = useState(null);
  const [refundAmount, setRefundAmount] = useState("");
  const [refundReason, setRefundReason] = useState(REFUND_REASON_OPTIONS[0].value);
  const [refundSaving, setRefundSaving] = useState(false);
  const [refundError, setRefundError] = useState("");

  const sorted = payments.slice().sort((a, b) => new Date(b.paidAt) - new Date(a.paidAt));
  const totalPaid = payments.reduce((sum, p) => sum + (p.amount || 0), 0);
  const remaining = deal.value - totalPaid;

  const refundableFor = (payment) => {
    const refunded = payments
      .filter((p) => p.refundOfPaymentId === payment.id)
      .reduce((sum, p) => sum + Math.abs(p.amount || 0), 0);
    return payment.amount - refunded;
  };

  const startEdit = (payment) => {
    setEditingId(payment.id);
    setEditAmount(String(payment.amount));
    setEditPaidAt(payment.paidAt.slice(0, 10));
    setEditNote(payment.note || "");
    setEditMethod(payment.method || "");
    setEditError("");
  };

  const confirmEdit = async (payment) => {
    const n = Number(editAmount);
    if (!n || n <= 0) { setEditError("Geçerli bir tutar girin."); return; }
    // Bu ödeme hariç tutulunca kalan bakiye: yeni tutar bunu aşamaz.
    const remainingExcluding = remaining + payment.amount;
    if (n > remainingExcluding + 0.01) { setEditError(`En fazla ${formatTL(remainingExcluding)} girilebilir.`); return; }
    setEditSaving(true);
    await onUpdatePayment({ id: payment.id, amount: n, paidAt: editPaidAt, note: editNote.trim(), method: editMethod || null });
    setEditSaving(false);
    setEditingId(null);
  };

  const startRefund = (payment) => {
    setRefundingId(payment.id);
    setRefundAmount(String(refundableFor(payment)));
    setRefundReason(REFUND_REASON_OPTIONS[0].value);
    setRefundError("");
  };

  const confirmRefund = async (payment) => {
    const n = Number(refundAmount);
    const refundable = refundableFor(payment);
    if (!n || n <= 0) { setRefundError("Geçerli bir tutar girin."); return; }
    if (n > refundable + 0.01) { setRefundError(`En fazla ${formatTL(refundable)} iade edilebilir.`); return; }
    setRefundSaving(true);
    const ok = await onRefundPayment({ dealId: deal.id, paymentId: payment.id, amount: n, reason: refundReason });
    setRefundSaving(false);
    if (ok) setRefundingId(null);
  };

  const submit = async (e) => {
    e.preventDefault();
    const n = Number(amount);
    if (!n || n <= 0) return;
    if (remaining <= 0) {
      setError(`Bu ${DEAL_WORD_FORMS[dealWordKind(sector)].bare} zaten tamamen tahsil edilmiş, kalan bakiye yok.`);
      return;
    }
    if (n > remaining + 0.01) {
      setError(`Girilen tutar kalan bakiyeden (${formatTL(remaining)}) fazla olamaz.`);
      return;
    }
    setError("");
    setSaving(true);
    await onAddPayment({ dealId: deal.id, amount: n, paidAt, note: note.trim(), method: method || null });
    setAmount("");
    setNote("");
    setMethod("");
    setSaving(false);
  };

  return (
    <div>
      <p style={{ fontSize: 13, margin: "0 0 12px", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span>Toplam: {formatTL(deal.value)} · Tahsil edilen: {formatTL(totalPaid)} · Kalan: {formatTL(Math.max(remaining, 0))}</span>
        {totalPaid > 0 && (
          <Badge tone={remaining <= 0 ? "success" : "warning"}>{remaining <= 0 ? "Ödendi" : "Kısmi ödeme"}</Badge>
        )}
      </p>

      <form onSubmit={submit} style={{ marginBottom: 12 }}>
        <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
          <input type="number" min="0" step="0.01" value={amount} onChange={(e) => { setAmount(e.target.value); setError(""); }} placeholder="Tutar" style={{ flex: 1 }} />
          <input type="date" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} style={{ width: 140 }} />
          <select value={method} onChange={(e) => setMethod(e.target.value)} style={{ width: 120 }}>
            <option value="">Yöntem</option>
            {Object.entries(PAYMENT_METHOD_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Not (opsiyonel)" style={{ width: "100%", marginBottom: 8 }} />
        {error && <p style={{ fontSize: 12, color: "var(--text-danger)", margin: "0 0 8px" }}>{error}</p>}
        <button type="submit" disabled={saving || !amount || remaining <= 0} style={{ background: "var(--fill-accent)", color: "var(--on-accent)", border: "none", fontSize: 13 }}>
          Ekle
        </button>
      </form>

      {sorted.length === 0 ? (
        <p style={{ fontSize: 13, color: "var(--text-muted)" }}>Henüz tahsilat kaydı yok.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 260, overflowY: "auto" }}>
          {sorted.map((p) => {
            const isRefund = p.amount < 0;
            const isOnline = (p.provider === "iyzico" && !!p.iyzicoPaymentTransactionId) || (p.provider === "paytr" && !!p.paytrMerchantOid);
            const refundable = isOnline && !isRefund ? refundableFor(p) : 0;
            return (
              <div key={p.id}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 13 }}>
                  <span style={{ color: isRefund ? "var(--text-danger)" : "inherit" }}>
                    {isRefund ? "−" : ""}{formatTL(Math.abs(p.amount))}{" "}
                    <span style={{ color: "var(--text-muted)" }}>· {paymentDateLabel(p.paidAt)}{p.method ? ` · ${PAYMENT_METHOD_LABELS[p.method] || p.method}` : ""}{p.note ? ` · ${p.note}` : ""}</span>
                  </span>
                  {isRefund ? null : isOnline ? (
                    refundable > 0.01 ? (
                      <button type="button" onClick={() => startRefund(p)} style={{ fontSize: 12 }}>İade Et</button>
                    ) : (
                      <span style={{ fontSize: 12, color: "var(--text-muted)" }}>Tamamen iade edildi</span>
                    )
                  ) : (
                    <div style={{ display: "flex", gap: 4 }}>
                      <IconButton icon="ti-edit" title="Düzenle" size="sm" onClick={() => startEdit(p)} />
                      {canDelete && (
                        <IconButton icon="ti-trash" title="Sil" size="sm" onClick={() => setConfirmDeleteId(p.id)} />
                      )}
                    </div>
                  )}
                </div>
                {editingId === p.id && (
                  <div style={{ marginTop: 6, padding: 8, border: "0.5px solid var(--border)", borderRadius: "var(--radius)" }}>
                    <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                      <input
                        type="number" min="0" step="0.01"
                        value={editAmount}
                        onChange={(e) => { setEditAmount(e.target.value); setEditError(""); }}
                        style={{ flex: 1, fontSize: 13 }}
                      />
                      <input type="date" value={editPaidAt} onChange={(e) => setEditPaidAt(e.target.value)} style={{ width: 140, fontSize: 13 }} />
                      <select value={editMethod} onChange={(e) => setEditMethod(e.target.value)} style={{ width: 120, fontSize: 13 }}>
                        <option value="">Yöntem</option>
                        {Object.entries(PAYMENT_METHOD_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                      </select>
                    </div>
                    <input value={editNote} onChange={(e) => setEditNote(e.target.value)} placeholder="Not (opsiyonel)" style={{ width: "100%", marginBottom: 8, fontSize: 13 }} />
                    {editError && <p style={{ fontSize: 12, color: "var(--text-danger)", margin: "0 0 8px" }}>{editError}</p>}
                    <div style={{ display: "flex", gap: 8 }}>
                      <button type="button" onClick={() => setEditingId(null)} style={{ fontSize: 12 }}>Vazgeç</button>
                      <button
                        type="button"
                        onClick={() => confirmEdit(p)}
                        disabled={editSaving}
                        style={{ fontSize: 12, background: "var(--fill-accent)", color: "var(--on-accent)", border: "none" }}
                      >
                        {editSaving ? "Kaydediliyor…" : "Kaydet"}
                      </button>
                    </div>
                  </div>
                )}
                {refundingId === p.id && (
                  <div style={{ marginTop: 6, padding: 8, border: "0.5px solid var(--border)", borderRadius: "var(--radius)" }}>
                    <p style={{ fontSize: 11.5, color: "var(--text-muted)", margin: "0 0 8px" }}>{refundCommissionNote(p)}</p>
                    <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                      <input
                        type="number" min="0" step="0.01" max={refundable}
                        value={refundAmount}
                        onChange={(e) => { setRefundAmount(e.target.value); setRefundError(""); }}
                        style={{ flex: 1, fontSize: 13 }}
                      />
                      <select value={refundReason} onChange={(e) => setRefundReason(e.target.value)} style={{ fontSize: 13 }}>
                        {REFUND_REASON_OPTIONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                      </select>
                    </div>
                    {refundError && <p style={{ fontSize: 12, color: "var(--text-danger)", margin: "0 0 8px" }}>{refundError}</p>}
                    <div style={{ display: "flex", gap: 8 }}>
                      <button type="button" onClick={() => setRefundingId(null)} style={{ fontSize: 12 }}>Vazgeç</button>
                      <button
                        type="button"
                        onClick={() => confirmRefund(p)}
                        disabled={refundSaving}
                        style={{ fontSize: 12, background: "var(--fill-accent)", color: "var(--on-accent)", border: "none" }}
                      >
                        {refundSaving ? "İade ediliyor…" : "İadeyi Onayla"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      {confirmDeleteId && (
        <ConfirmDialog
          title="Tahsilat silinsin mi?"
          message="Bu tahsilat kaydı çöp kutusuna taşınır."
          onConfirm={() => { onDeletePayment(confirmDeleteId); setConfirmDeleteId(null); }}
          onClose={() => setConfirmDeleteId(null)}
        />
      )}
    </div>
  );
}

function BeforeAfterPhotoThumb({ attachment, onDelete }) {
  const [url, setUrl] = useState(null);

  useEffect(() => {
    let active = true;
    supabase.storage.from("attachments").createSignedUrl(attachment.storagePath, 3600).then(({ data }) => {
      if (active && data?.signedUrl) setUrl(data.signedUrl);
    });
    return () => { active = false; };
  }, [attachment.storagePath]);

  return (
    <div style={{ position: "relative", width: 88, height: 88, borderRadius: "var(--radius)", overflow: "hidden", border: "0.5px solid var(--border)", background: "var(--surface-1)", flexShrink: 0 }}>
      {url ? (
        <a href={url} target="_blank" rel="noopener noreferrer">
          <img src={url} alt={attachment.fileName} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
        </a>
      ) : (
        <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, color: "var(--text-muted)" }}>Yükleniyor…</div>
      )}
      <button
        type="button"
        onClick={() => onDelete(attachment.id)}
        title="Sil"
        style={{ position: "absolute", top: 2, right: 2, width: 18, height: 18, borderRadius: "50%", background: "var(--surface-0)", border: "0.5px solid var(--border)", fontSize: 12, lineHeight: 1, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", padding: 0 }}
      >
        ×
      </button>
    </div>
  );
}

// AI'siz basit versiyon — otomatik eşleştirme/analiz yok, ekip elle "Öncesi"/"Sonrası"
// olarak yükler, yan yana bakıp kendi gözüyle karşılaştırır. Yükleme, personelin kendi
// beyanıyla değil, müşterinin customers.photo_consent üzerinden GERÇEKTEN verdiği izinle
// kilitli/açık olur (bkz. requestPhotoConsent, sql/2026-07-30_customer_photo_consent.sql)
// — sadece isAppointmentSector sektörlerinde anlamlı, DealForm zaten öyle gate'liyor.
function BeforeAfterPhotos({ dealId, customer, attachments, onUpload, onDelete, onRequestConsent }) {
  const [uploadingSlot, setUploadingSlot] = useState(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const items = attachments.filter((a) => a.entityType === "deal_photos" && a.entityId === dealId);
  const beforePhotos = items.filter((a) => a.photoType === "before");
  const afterPhotos = items.filter((a) => a.photoType === "after");
  const consentGranted = customer?.photoConsent === true;

  const handleFile = async (slot, e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !consentGranted) return;
    setUploadingSlot(slot);
    await onUpload("deal_photos", dealId, file, { photoType: slot, consentConfirmed: true });
    setUploadingSlot(null);
  };

  const renderColumn = (label, slot, photos) => (
    <div style={{ flex: 1, minWidth: 0 }}>
      <p style={{ fontSize: 12, fontWeight: 500, margin: "0 0 6px", color: "var(--text-secondary)" }}>{label}</p>
      {photos.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 6 }}>
          {photos.map((a) => (
            <BeforeAfterPhotoThumb key={a.id} attachment={a} onDelete={setConfirmDeleteId} />
          ))}
        </div>
      )}
      <label
        style={{
          background: "var(--surface-1)", border: "0.5px dashed var(--border)", borderRadius: "var(--radius)",
          padding: "6px 10px", fontSize: 12, display: "inline-block",
          cursor: consentGranted && uploadingSlot === null ? "pointer" : "not-allowed",
          opacity: consentGranted ? 1 : 0.5,
        }}
      >
        {uploadingSlot === slot ? "Yükleniyor…" : `+ ${label} fotoğrafı`}
        <input type="file" accept="image/*" onChange={(e) => handleFile(slot, e)} disabled={!consentGranted || uploadingSlot !== null} style={{ display: "none" }} />
      </label>
    </div>
  );

  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ fontSize: 13, color: "var(--text-secondary)", display: "block", marginBottom: 6 }}>Öncesi / Sonrası Fotoğrafları</label>
      {consentGranted ? (
        <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: "0 0 10px" }}>
          ✓ Fotoğraf saklama izni alındı{customer?.photoConsentAt ? ` (${new Date(customer.photoConsentAt).toLocaleDateString("tr-TR")})` : ""}
        </p>
      ) : (
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 10, fontSize: 12, color: "var(--text-secondary)" }}>
          <span>Bu müşteri için fotoğraf saklama izni alınmamış - yükleme kilitli.</span>
          <button
            type="button"
            onClick={() => onRequestConsent(customer)}
            style={{ fontSize: 12, background: "none", border: "0.5px solid var(--border)", borderRadius: "var(--radius)", padding: "2px 8px", cursor: "pointer" }}
          >
            {customer?.email ? "İzin e-postası gönder" : "İzin linki paylaş"}
          </button>
        </div>
      )}
      <div style={{ display: "flex", gap: 12 }}>
        {renderColumn("Öncesi", "before", beforePhotos)}
        {renderColumn("Sonrası", "after", afterPhotos)}
      </div>
      <p style={{ fontSize: 11, color: "var(--text-muted)", margin: "6px 0 0" }}>Fotoğraflar yalnızca ekibinizin erişebildiği güvenli bir alanda saklanır, müşteri portalında görünmez.</p>
      {confirmDeleteId && (
        <ConfirmDialog
          title="Fotoğraf silinsin mi?"
          message="Bu fotoğraf çöp kutusuna taşınır."
          onConfirm={() => { onDelete(confirmDeleteId); setConfirmDeleteId(null); }}
          onClose={() => setConfirmDeleteId(null)}
        />
      )}
    </div>
  );
}

function activityDateLabel(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleDateString("tr-TR", { day: "numeric", month: "short", year: "numeric" }) +
    " · " + d.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
}

function CustomerDetail({ customer, deals, payments, activities, sector, customFieldDefs = [], groupClasses = [], groupClassEnrollments = [], attachments = [], onUploadAttachment, onDownloadAttachment, onDeleteAttachment, onAddActivity, onRequestConsent, onClose }) {
  const [type, setType] = useState("note");
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);

  const myClasses = groupClassEnrollments
    .filter((e) => e.customerId === customer.id)
    .map((e) => groupClasses.find((g) => g.id === e.groupClassId))
    .filter(Boolean);

  const customerDeals = deals.filter((d) => d.customerId === customer.id);
  const wonCustomerDeals = customerDeals.filter((d) => d.stage === "kazanildi");
  const wonDealIds = new Set(wonCustomerDeals.map((d) => d.id));
  const customerPayments = payments.filter((p) => wonDealIds.has(p.dealId));
  const totalDebt = wonCustomerDeals.reduce((sum, d) => sum + (d.value || 0), 0);
  const totalCollected = customerPayments.reduce((sum, p) => sum + (p.amount || 0), 0);
  const balance = totalDebt - totalCollected;
  let runningBalance = 0;
  const ledgerEvents = [
    ...wonCustomerDeals.map((d) => ({ id: `debt-${d.id}`, kind: "borc", date: d.closedAt || d.createdAt, label: d.title, amount: d.value })),
    ...customerPayments.map((p) => ({ id: `pay-${p.id}`, kind: "tahsilat", date: p.paidAt, label: p.note || "Tahsilat", amount: p.amount })),
  ]
    .sort((a, b) => new Date(a.date) - new Date(b.date))
    .map((e) => {
      runningBalance += e.kind === "borc" ? e.amount : -e.amount;
      return { ...e, runningBalance };
    })
    .reverse();

  const customerActivities = activities
    .filter((a) => a.customerId === customer.id)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  const submit = async (e) => {
    e.preventDefault();
    if (!content.trim()) return;
    setSaving(true);
    await onAddActivity({ customerId: customer.id, type, content: content.trim() });
    setContent("");
    setSaving(false);
  };

  return (
    <Modal title={customer.name} onClose={onClose}>
      <div style={{ marginBottom: 16 }}>
        <p style={{ margin: 0, fontSize: 13, color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <span>
            {customer.sector} {customer.region ? `· ${customer.region}` : ""} {customer.phone ? `· ${customer.phone}` : ""} {customer.email ? `· ${customer.email}` : ""}
          </span>
          {customer.phone && (
            <a
              href={`https://wa.me/${toWhatsAppNumber(customer.phone)}`}
              target="_blank"
              rel="noopener noreferrer"
              title="WhatsApp'tan yaz"
              style={{ display: "inline-flex", alignItems: "center" }}
            >
              <WhatsAppIcon />
            </a>
          )}
        </p>
        {customer.notes && <p style={{ margin: "6px 0 0", fontSize: 13, color: "var(--text-secondary)" }}>{customer.notes}</p>}
        {customer.tags?.length > 0 && (
          <div style={{ marginTop: 8 }}>
            <TagBadges tags={customer.tags} />
          </div>
        )}
        {customer.appointmentCreditCount > 0 && (
          <div style={{ marginTop: 8 }}>
            <Badge tone="accent">🎁 {customer.appointmentCreditCount} ücretsiz telafi hakkı</Badge>
          </div>
        )}
        <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          {customer.marketingConsent ? (
            <Badge tone="success">✓ Pazarlama e-postası izni var</Badge>
          ) : (
            <Badge tone="warning">Pazarlama e-postası izni yok</Badge>
          )}
          {isAppointmentSector(sector) && (
            customer.photoConsent ? (
              <Badge tone="success">✓ Fotoğraf saklama izni var</Badge>
            ) : (
              <Badge tone="warning">Fotoğraf saklama izni yok</Badge>
            )
          )}
          {!customer.marketingConsent && (
            <button
              type="button"
              onClick={() => onRequestConsent(customer)}
              style={{ fontSize: 12, background: "none", border: "0.5px solid var(--border)", borderRadius: "var(--radius)", padding: "2px 8px", cursor: "pointer" }}
            >
              {customer.email ? "İzin e-postası gönder" : "İzin linki paylaş"}
            </button>
          )}
        </div>
        {customFieldDefs.filter((d) => d.entity === "customer" && customer.customFields?.[d.key]).length > 0 && (
          <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 2 }}>
            {customFieldDefs
              .filter((d) => d.entity === "customer" && customer.customFields?.[d.key])
              .map((d) => (
                <p key={d.key} style={{ margin: 0, fontSize: 13, color: "var(--text-secondary)" }}>
                  <strong>{d.label}:</strong> {customer.customFields[d.key]}
                </p>
              ))}
          </div>
        )}
        {myClasses.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <p style={{ fontSize: 13, fontWeight: 500, margin: "0 0 6px" }}>Kayıtlı Dersler</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {myClasses.map((g) => (
                <p key={g.id} style={{ margin: 0, fontSize: 13, color: "var(--text-secondary)" }}>
                  {g.name} - {WEEKDAYS[g.weekday - 1]} {g.startTime}
                </p>
              ))}
            </div>
          </div>
        )}
        <div style={{ marginTop: 12 }}>
          <AttachmentList
            entityType="customers"
            entityId={customer.id}
            attachments={attachments}
            onUpload={onUploadAttachment}
            onDownload={onDownloadAttachment}
            onDelete={onDeleteAttachment}
          />
        </div>
      </div>

      {customerDeals.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <p style={{ fontSize: 13, fontWeight: 500, margin: "0 0 6px" }}>{dealWordKind(sector) === "uyelik" ? "Üyelikler" : dealWordKind(sector) === "randevu" ? "Randevular" : dealWordKind(sector) === "rezervasyon" ? "Rezervasyonlar" : "Teklifler"}</p>
          {customerDeals.map((d) => {
            const randevuTarihi = d.customFields?.portal_randevu_zamani;
            return (
              <div key={d.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "4px 0" }}>
                <span>
                  {d.title}
                  {randevuTarihi && (
                    <span style={{ color: "var(--text-muted)" }}>
                      {" "}· {new Date(`${randevuTarihi}+03:00`).toLocaleString("tr-TR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                    </span>
                  )}
                  {d.customFields?.kaynak === "portal" && d.customFields?.portal_randevu_zamani && (
                    <span style={{ color: "var(--text-muted)" }}> · Portaldan alındı</span>
                  )}
                  {d.customFields?.kaynak === "randevu_widget" && d.customFields?.portal_randevu_zamani && (
                    <span style={{ color: "var(--text-muted)" }}> · Web'den alındı</span>
                  )}
                </span>
                <span style={{ color: "var(--text-secondary)" }}>{stageLabel(d.stage, customer.customerType || "kurumsal", sector)} · {formatTL(d.value)}</span>
              </div>
            );
          })}
        </div>
      )}

      {wonCustomerDeals.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <p style={{ fontSize: 13, fontWeight: 500, margin: "0 0 8px", display: "flex", alignItems: "center", gap: 4 }}>
            Cari Hesap Ekstresi <InfoTip text={cariBakiyeInfoText(sector)} />
          </p>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "4px 0" }}>
            <span style={{ color: "var(--text-secondary)" }}>Toplam Borç</span>
            <span>{formatTL(totalDebt)}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "4px 0" }}>
            <span style={{ color: "var(--text-secondary)" }}>Toplam Tahsilat</span>
            <span>{formatTL(totalCollected)}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "4px 0", marginBottom: 8 }}>
            <span style={{ color: "var(--text-secondary)" }}>Bakiye</span>
            <Badge tone={balance > 0 ? "danger" : "success"}>{formatTL(balance)}</Badge>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 200, overflowY: "auto" }}>
            {ledgerEvents.map((e) => (
              <div key={e.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5 }}>
                <span>
                  <span style={{ color: "var(--text-muted)" }}>{paymentDateLabel(e.date)} ·</span>{" "}
                  {e.kind === "borc" ? "Borç" : "Tahsilat"} · {e.label}
                </span>
                <span style={{ color: e.kind === "borc" ? "var(--text-danger)" : "var(--text-success)" }}>
                  {e.kind === "borc" ? "+" : "−"}{formatTL(e.amount)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <p style={{ fontSize: 13, fontWeight: 500, margin: "0 0 8px" }}>İletişim geçmişi</p>
      <form onSubmit={submit} style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
          <select value={type} onChange={(e) => setType(e.target.value)} style={{ width: 160 }}>
            {ACTIVITY_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
          <input value={content} onChange={(e) => setContent(e.target.value)} placeholder={dealWordKind(sector) === "uyelik" ? "Örn. üyelik paketi görüşüldü" : dealWordKind(sector) === "randevu" ? "Örn. randevu detayları görüşüldü" : dealWordKind(sector) === "rezervasyon" ? "Örn. rezervasyon detayları görüşüldü" : "Örn. fiyat teklifi görüşüldü"} style={{ flex: 1 }} />
        </div>
        <button type="submit" disabled={saving || !content.trim()} style={{ background: "var(--fill-accent)", color: "var(--on-accent)", border: "none", fontSize: 13 }}>
          Ekle
        </button>
      </form>

      {customerActivities.length === 0 ? (
        <p style={{ fontSize: 13, color: "var(--text-muted)" }}>Henüz kayıt yok.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, maxHeight: 260, overflowY: "auto" }}>
          {customerActivities.map((a) => {
            const typeInfo = ACTIVITY_TYPES.find((t) => t.id === a.type) || ACTIVITY_TYPES[0];
            return (
              <div key={a.id} style={{ display: "flex", gap: 10 }}>
                <i className={`ti ${typeInfo.icon}`} style={{ fontSize: 16, color: "var(--text-accent)", marginTop: 2 }} aria-hidden="true"></i>
                <div>
                  <p style={{ margin: 0, fontSize: 13 }}>{a.content}</p>
                  <p style={{ margin: 0, fontSize: 11, color: "var(--text-muted)" }}>{typeInfo.label} · {activityDateLabel(a.createdAt)}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Modal>
  );
}

function TeklifPrint({ deal, customer, companySettings, pdfTemplates, dealLineItems, notify, onClose }) {
  const kdvRate = deal.kdvRate ?? 20;
  const netAmount = kdvRate > 0 ? deal.value / (1 + kdvRate / 100) : deal.value;
  const kdvAmount = deal.value - netAmount;
  const [downloading, setDownloading] = useState(false);
  const [validityDays, setValidityDays] = useState(15);
  const [noExpiry, setNoExpiry] = useState(false);
  const [extraNote, setExtraNote] = useState("");
  const noun = isIndividualFocusedSector(companySettings?.sector) ? "fiyat" : "teklif";
  const belgeBasligi = dealWordKind(companySettings?.sector) === "uyelik" ? "ÜYELİK ÖZETİ" : dealWordKind(companySettings?.sector) === "randevu" ? "RANDEVU ÖZETİ" : dealWordKind(companySettings?.sector) === "rezervasyon" ? "REZERVASYON ÖZETİ" : "TEKLİF";
  const customTemplate = (pdfTemplates || []).find((t) => t.id === companySettings?.pdfTemplateKey);
  const template = customTemplate || PDF_TEMPLATES[companySettings?.pdfTemplateKey] || PDF_TEMPLATES.klasik;
  const mergeData = buildMergeData({ deal, customer, companySettings, netAmount, kdvAmount, kdvRate, noExpiry, validityDays, extraNote, belgeBasligi, noun });
  // Kalemsiz (bugüne kadarki TÜM) deal'lerde tek kalemlik bir listeye düşer —
  // bugünkü PDF çıktısıyla birebir aynı sonucu üretir.
  const dealItems = (dealLineItems || []).filter((li) => li.dealId === deal.id);
  const printLineItems = dealItems.length > 0
    ? dealItems.map((li) => ({ description: li.description, quantity: li.quantity, unitPrice: li.unitPrice }))
    : [{ description: deal.title, quantity: 1, unitPrice: deal.value }];
  const extraCanvasHeight = Math.max(0, printLineItems.length - 1) * TABLE_ROW_HEIGHT;

  const download = async () => {
    setDownloading(true);
    try {
      const [{ default: jsPDF }, { default: html2canvas }] = await Promise.all([import("jspdf"), import("html2canvas")]);
      const original = document.getElementById("teklif-print");
      // useCORS olmadan, şirket logosu gibi farklı origin'den (Supabase Storage)
      // gelen bir <img> canvas'ı "kirletiyor" — sonraki toDataURL() bunun
      // üzerine bir SecurityError fırlatıyordu (logo yüklemiş her hesapta PDF
      // indirme sessizce "Hazırlanıyor" durumunda takılı kalıyordu).
      // Bu düğüm, kendisini saran sabit konumlu/kaydırılabilir bir üst öğenin
      // içinde olduğu için (windowWidth/windowHeight denemesi yetmedi) sağ
      // tarafı (tutar sütunu, adresin devamı) hâlâ kırpılıyordu — kesin çözüm,
      // düğümü hiçbir üst öğe kısıtlaması olmayan ekran dışı bir kopyaya
      // klonlayıp yakalamayı ORADAN yapmak.
      const clone = original.cloneNode(true);
      clone.style.position = "fixed";
      clone.style.top = "0";
      clone.style.left = "-99999px";
      clone.style.margin = "0";
      document.body.appendChild(clone);
      let canvas;
      try {
        canvas = await html2canvas(clone, { scale: 2, backgroundColor: "#ffffff", useCORS: true });
      } finally {
        document.body.removeChild(clone);
      }
      const imgData = canvas.toDataURL("image/png");
      // Asıl kırpılma sebebi buradaymış: orientation belirtilmezse jsPDF
      // varsayılan "portrait"i (dikey) zorluyor ve bizim yatay (genişlik >
      // yükseklik) format dizimizi SESSİZCE ters çeviriyor (MediaBox'ta
      // genişlik/yükseklik yer değiştiriyor) — ama görsel eski, ters
      // çevrilmemiş boyutlarıyla yerleştirildiği için sayfa ile uyuşmuyor ve
      // sağ/alt taraf kırpılmış görünüyordu. Gerçek en-boy oranına göre
      // orientation'ı açıkça belirtmek bunu tamamen ortadan kaldırıyor.
      const pdf = new jsPDF({ unit: "px", orientation: canvas.width >= canvas.height ? "l" : "p", format: [canvas.width, canvas.height] });
      pdf.addImage(imgData, "PNG", 0, 0, canvas.width, canvas.height);
      pdf.save(`${dealWordKind(companySettings?.sector) === "uyelik" ? "Üyelik Özeti" : dealWordKind(companySettings?.sector) === "randevu" ? "Randevu Özeti" : dealWordKind(companySettings?.sector) === "rezervasyon" ? "Rezervasyon Özeti" : "Teklif"} - ${customer?.name || "Musteri"} - ${deal.title}.pdf`);
    } catch (err) {
      notify?.(`PDF hazırlanamadı: ${err.message || "beklenmeyen bir hata oluştu"}. Lütfen tekrar deneyin.`);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "#fff", zIndex: 1500, overflowY: "auto" }}>
      <div className="no-print" style={{ position: "fixed", top: 0, left: 0, right: 0, background: "#fff", borderBottom: "1px solid #e1e8f0", padding: "12px 24px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12, zIndex: 1600 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "#5b7088" }}>
            <input type="checkbox" checked={noExpiry} onChange={(e) => setNoExpiry(e.target.checked)} />
            Süresiz
          </label>
          {!noExpiry && (
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "#5b7088" }}>
              Geçerlilik:
              <input
                type="number"
                min="1"
                value={validityDays}
                onChange={(e) => setValidityDays(e.target.value)}
                style={{ width: 56 }}
              />
              gün
            </label>
          )}
          <input
            value={extraNote}
            onChange={(e) => setExtraNote(e.target.value)}
            placeholder="Ek not (opsiyonel)"
            style={{ fontSize: 13, minWidth: 200 }}
          />
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={download} disabled={downloading} style={{ background: "var(--fill-accent)", color: "var(--on-accent)", border: "none" }}>
            {downloading ? "Hazırlanıyor…" : "İndir (PDF)"}
          </button>
          <button onClick={() => window.print()}>Yazdır</button>
          <button onClick={onClose}>Kapat</button>
        </div>
      </div>
      <div style={{ paddingTop: 80, paddingBottom: 48 }}>
        <div id="teklif-print" style={{ width: template.width, height: template.height + extraCanvasHeight, position: "relative", margin: "0 auto", background: "#fff" }}>
          {renderTemplateBlocks(template.blocks, mergeData, printLineItems)}
        </div>
      </div>
    </div>
  );
}

function CampaignModal({ customers, replyTo, companyName, logoUrl, session, onRequestConsent, onClose }) {
  // İYS/ticari elektronik ileti gerçek bir engel (uyarı değil) — sadece
  // marketing_consent=true olan müşteriler seçilebilir/gönderilebilir. Bu izin
  // KOBİ'nin kendi beyanıyla değil, Müşteri Kazanma Linki/Müşteri Portalı/e-posta
  // ile çift onaydan (bkz. requestCustomerConsent) geliyor.
  const emailCustomers = customers.filter((c) => c.email);
  const consentedCustomers = emailCustomers.filter((c) => c.marketingConsent);
  const [selected, setSelected] = useState(() => new Set(consentedCustomers.map((c) => c.id)));
  const [recipientQuery, setRecipientQuery] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState("");
  const [confirmSend, setConfirmSend] = useState(false);

  const toggle = (id) => {
    if (!consentedCustomers.some((c) => c.id === id)) return;
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const selectedConsented = consentedCustomers.filter((c) => selected.has(c.id));

  const recipientQueryLower = recipientQuery.trim().toLowerCase();
  const visibleCustomers = recipientQueryLower
    ? emailCustomers.filter((c) => (c.name || "").toLowerCase().includes(recipientQueryLower) || (c.email || "").toLowerCase().includes(recipientQueryLower))
    : emailCustomers;

  const selectAllConsented = () => setSelected(new Set(consentedCustomers.map((c) => c.id)));
  const clearSelection = () => setSelected(new Set());

  const requestSend = (e) => {
    e.preventDefault();
    if (selectedConsented.length === 0 || !subject.trim() || !message.trim()) return;
    setConfirmSend(true);
  };

  const send = async () => {
    setSending(true);
    setResult("");
    try {
      const res = await fetch("/api/send-campaign", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({
          recipients: selectedConsented.map((c) => c.email),
          customerIds: selectedConsented.map((c) => c.id),
          requireConsent: true,
          subject,
          message,
          replyTo,
          companyName,
          logoUrl,
        }),
      });
      const data = await res.json();
      if (res.ok) setResult(`${data.sent ?? selectedConsented.length} kişiye gönderildi.`);
      else setResult(data.error || "Gönderim başarısız oldu.");
    } catch {
      setResult("Gönderim başarısız oldu.");
    }
    setSending(false);
  };

  return (
    <Modal title="E-posta kampanyası" onClose={onClose}>
      <form onSubmit={requestSend}>
        <div style={{ marginBottom: 12 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
            <label style={{ fontSize: 13, color: "var(--text-secondary)" }}>
              Alıcılar ({selected.size}/{consentedCustomers.length} izinli)
            </label>
            <div style={{ display: "flex", gap: 10 }}>
              <button type="button" onClick={selectAllConsented} style={{ fontSize: 12, background: "none", border: "none", color: "var(--accent)", cursor: "pointer", padding: 0, textDecoration: "underline" }}>
                Tümünü seç
              </button>
              <button type="button" onClick={clearSelection} style={{ fontSize: 12, background: "none", border: "none", color: "var(--accent)", cursor: "pointer", padding: 0, textDecoration: "underline" }}>
                Seçimi temizle
              </button>
            </div>
          </div>
          {emailCustomers.length > 5 && (
            <input
              value={recipientQuery}
              onChange={(e) => setRecipientQuery(e.target.value)}
              placeholder="İsim veya e-postaya göre ara..."
              style={{ width: "100%", marginBottom: 6, fontSize: 13 }}
            />
          )}
          <div style={{ maxHeight: 180, overflowY: "auto", border: "0.5px solid var(--border)", borderRadius: "var(--radius)", padding: 8 }}>
            {emailCustomers.length === 0 && <p style={{ fontSize: 13, color: "var(--text-muted)", margin: 0 }}>E-postası kayıtlı müşteri yok.</p>}
            {emailCustomers.length > 0 && visibleCustomers.length === 0 && <p style={{ fontSize: 13, color: "var(--text-muted)", margin: 0 }}>Aramayla eşleşen müşteri yok.</p>}
            {visibleCustomers.map((c) => (
              <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0" }}>
                <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, flex: 1, cursor: c.marketingConsent ? "pointer" : "default", opacity: c.marketingConsent ? 1 : 0.55 }}>
                  <input type="checkbox" checked={selected.has(c.id)} disabled={!c.marketingConsent} onChange={() => toggle(c.id)} />
                  {c.name} <span style={{ color: "var(--text-muted)" }}>({c.email})</span>
                </label>
                {!c.marketingConsent && (
                  <>
                    <span style={{ fontSize: 11, color: "var(--text-warning)" }}>İzin yok</span>
                    <button type="button" onClick={() => onRequestConsent(c)} style={{ fontSize: 11, background: "none", border: "0.5px solid var(--border)", borderRadius: "var(--radius)", padding: "1px 6px", cursor: "pointer" }}>
                      İzin iste
                    </button>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 13, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Konu</label>
          <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Yeni ürünlerimizi keşfedin" style={{ width: "100%" }} />
        </div>
        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 13, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Mesaj</label>
          <textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Merhaba, size özel..." style={{ width: "100%", minHeight: 100, resize: "vertical" }} />
        </div>
        <div style={{ marginBottom: 16, background: "var(--bg-warning)", borderRadius: "var(--radius)", padding: "0.75rem 1rem", fontSize: 12.5, color: "var(--text-warning)" }}>
          Türkiye'de ticari elektronik ileti (reklam/pazarlama e-postası) göndermek için alıcıdan önceden açık onay alınması İYS (İleti Yönetim Sistemi) kurallarına uyulması yasal bir zorunluluktur - bu yüzden sadece pazarlama izni onaylanmış müşteriler seçilebiliyor. İzni olmayan bir müşteriye "İzin iste" ile bir onay e-postası gönderebilir, veya Müşteri Kazanma Linki/Müşteri Portalı üzerinden otomatik izin toplayabilirsiniz.
        </div>
        {result && <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 12 }}>{result}</p>}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button type="button" onClick={onClose}>Kapat</button>
          <button type="submit" disabled={sending || selected.size === 0} style={{ background: "var(--fill-accent)", color: "var(--on-accent)", border: "none" }}>
            {sending ? "Gönderiliyor…" : "Gönder"}
          </button>
        </div>
      </form>
      {confirmSend && (
        <ConfirmDialog
          title="Kampanya gönderilsin mi?"
          message={`${selected.size} kişiye e-posta gönderilecek - bu işlem geri alınamaz.`}
          onConfirm={() => { setConfirmSend(false); send(); }}
          onClose={() => setConfirmSend(false)}
        />
      )}
    </Modal>
  );
}

// FreeServiceModal'daki isim örneği — sadece randevu bazlı (slot) sektörlerde
// gösterildiği için otel/üretim/perakende gibi ilgisiz sektörler burada yok.
const FREE_SERVICE_NAME_EXAMPLES = {
  guzellik_bakim: "Ücretsiz Cilt Analizi",
  saglik_klinik: "Ücretsiz Ön Muayene",
  spor_merkezi: "Ücretsiz Deneme Antrenmanı",
  emlak: "Ücretsiz Ekspertiz Görüşmesi",
  dijital_ajans: "Ücretsiz Strateji Görüşmesi",
  hizmet_danismanlik: "Ücretsiz İlk Görüşme",
};

// Yeni teklif/kayıt formundaki "Başlık" alanı için sektöre göre örnek —
// kullanıcı fark etti: sektör ne olursa olsun sadece bireysel/kurumsal ayrımına
// göre iki sabit örnek (biri sağlık diline yakın "İlk randevu / danışmanlık")
// gösteriliyordu, Emlak/Otel/Üretim gibi sektörlerde alakasız kalıyordu.
const DEAL_TITLE_EXAMPLES = {
  emlak: "3+1 daire satışı / Kadıköy'de kiralık ofis",
  dijital_ajans: "Sosyal medya yönetimi paketi",
  saglik_klinik: "Kontrol muayenesi / Botoks uygulaması",
  uretim_satis: "500 adet toptan sipariş",
  hizmet_danismanlik: "Aylık danışmanlık anlaşması",
  perakende: "Kampanya kapsamında toplu satış",
  guzellik_bakim: "Saç kesimi + fön randevusu",
  spor_merkezi: "Salon üyeliği / Reformer Pilates",
  egitim_kurs: "Yabancı dil kursu kaydı",
  sanayi_esnaf: "Motor bakımı / yağ değişimi",
  otel: "Hafta sonu 2 kişilik rezervasyon",
};

// 0 TL'lik bir fiyat kalemi Randevu Alma Linki widget'ında ayrı/vurgulu bir
// buton olarak öne çıkıyor (tereddütlü müşteriyi ilk adıma teşvik) - önceden
// bu SADECE normal "Yeni ürün/hizmet ekle" formundaki Fiyat alanına 0 yazarak
// keşfedilebiliyordu, bir InfoTip'in içinde gömülüydü (kullanıcı geri
// bildirimi: "0 TL'lik ürünü burada iyi anlatamamışız"). Ayrı, adı konmuş bir
// buton/modal ile artık açıkça sunuluyor - fiyat alanı hiç gösterilmiyor,
// kaydedilen kalem zaten normal fiyat listesinde (0 TL rozetiyle) görünür.
function FreeServiceModal({ sector, onAdd, onClose }) {
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    setSaving(true);
    await onAdd({ name: trimmed, price: 0, refreshDays: null, durationMinutes: null });
    setSaving(false);
    onClose();
  };

  return (
    <Modal title="Ücretsiz Hizmet Tanımla" onClose={onClose}>
      <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: "0 0 16px", lineHeight: 1.6 }}>
        Randevu almadan önce sizinle tanışmak isteyen tereddütlü müşterileri ilk adımı atmaya teşvik edin - tanımladığınız
        ücretsiz hizmet (örn. "Ücretsiz İlk Görüşme", "Deneme Seansı") Randevu Alma Linki'nde müşterilerinize ayrı,
        vurgulu bir buton olarak gösterilir. Fiyat listenize otomatik olarak 0 TL ile eklenir.
      </p>
      <form onSubmit={submit}>
        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 12, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Hizmet adı</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={`Örn. ${FREE_SERVICE_NAME_EXAMPLES[sector] || "Ücretsiz İlk Görüşme"}`}
            autoFocus
            style={{ width: "100%" }}
          />
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button type="button" onClick={onClose}>Vazgeç</button>
          <button type="submit" disabled={!name.trim() || saving} style={{ background: "var(--fill-accent)", color: "var(--on-accent)", border: "none" }}>
            {saving ? "Ekleniyor…" : "+ Ekle"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// Satır listesindeki "Düzenle" ikonu artık aynı formu değil, ayrı bir Modal
// açıyor - önceden alttaki "ekle" formu düzenleme moduna geçip yer değiştiriyordu,
// kullanıcı formun aşağı kaydığını/butonun "Güncelle"ye döndüğünü fark etmeyip
// kafası karışıyordu (bkz. [[feedback]] - kullanıcı geri bildirimi).
function PriceListEditModal({ item, sector, onSave, onClose }) {
  const [name, setName] = useState(item.name);
  const [price, setPrice] = useState(String(item.price));
  const [refreshDays, setRefreshDays] = useState(item.refreshDays ? String(item.refreshDays) : "");
  const [durationMinutes, setDurationMinutes] = useState(item.durationMinutes ? String(item.durationMinutes) : "");
  const [commissionPercent, setCommissionPercent] = useState(item.commissionPercent != null ? String(item.commissionPercent) : "");

  const submit = (e) => {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName || price === "") return;
    onSave({ name: trimmedName, price: Number(price), refreshDays: Number(refreshDays) || null, durationMinutes: Number(durationMinutes) || null, commissionPercent: commissionPercent !== "" ? Number(commissionPercent) : null });
  };

  return (
    <Modal title="Ürün/hizmeti düzenle" onClose={onClose}>
      <form onSubmit={submit}>
        <div style={{ marginBottom: 10 }}>
          <label style={{ fontSize: 12, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>İsim</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder={`Örn. ${PRICE_ITEM_NAME_EXAMPLES[sector] || "Danışmanlık"}`} style={{ width: "100%" }} />
        </div>
        <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 100 }}>
            <label style={{ fontSize: 12, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Fiyat (TL)</label>
            <input type="number" min="0" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0" style={{ width: "100%" }} />
          </div>
          <div style={{ flex: 1, minWidth: 100 }}>
            <label style={{ fontSize: 12, color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: 3, marginBottom: 4 }}>
              Süre (dk)
              <InfoTip align="left" text="Opsiyonel - girerseniz, bu hizmet bir randevuya kalem olarak eklendiğinde randevunun süresi buna göre hesaplanır; aynı randevuda birden fazla hizmet varsa süreleri toplanır ve çakışma kontrolü buna göre yapılır." />
            </label>
            <input type="number" min="0" value={durationMinutes} onChange={(e) => setDurationMinutes(e.target.value)} placeholder="Opsiyonel" style={{ width: "100%" }} />
          </div>
          <div style={{ flex: 1, minWidth: 100 }}>
            <label style={{ fontSize: 12, color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: 3, marginBottom: 4 }}>
              Tazeleme (gün)
              <InfoTip align="left" text="Opsiyonel - girerseniz, bu hizmet 'tamamlandı' olarak işaretlendiğinde bu kadar gün sonrasına otomatik bir hatırlatma kurulur (örn. protez tırnak için 21 gün)." />
            </label>
            <input type="number" min="0" value={refreshDays} onChange={(e) => setRefreshDays(e.target.value)} placeholder="Opsiyonel" style={{ width: "100%" }} />
          </div>
          <div style={{ flex: 1, minWidth: 100 }}>
            <label style={{ fontSize: 12, color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: 3, marginBottom: 4 }}>
              Prim oranı (%)
              <InfoTip align="left" text="Opsiyonel - bu hizmete özel bir prim yüzdesi. Girerseniz, bu hizmeti satan personelin hakedişi (Ayarlar → Takım'daki genel prim yüzdesi yerine) burada belirttiğiniz oranla hesaplanır - Personel Performansı raporunda görünür. Boş bırakırsanız personelin genel prim yüzdesi geçerli olur." />
            </label>
            <input type="number" min="0" step="0.5" value={commissionPercent} onChange={(e) => setCommissionPercent(e.target.value)} placeholder="Genel oran" style={{ width: "100%" }} />
          </div>
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button type="button" onClick={onClose}>Vazgeç</button>
          <button type="submit" style={{ background: "var(--fill-accent)", color: "var(--on-accent)", border: "none" }}>Güncelle</button>
        </div>
      </form>
    </Modal>
  );
}

function PriceListManager({ items, onAdd, onUpdate, onDelete, sector }) {
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [refreshDays, setRefreshDays] = useState("");
  const [durationMinutes, setDurationMinutes] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [editingItem, setEditingItem] = useState(null);
  const [search, setSearch] = useState("");
  const query = search.trim().toLowerCase();
  const filteredItems = query ? items.filter((item) => item.name.toLowerCase().includes(query)) : items;

  const submit = (e) => {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName || price === "") return;
    onAdd({ name: trimmedName, price: Number(price), refreshDays: Number(refreshDays) || null, durationMinutes: Number(durationMinutes) || null });
    setName("");
    setPrice("");
    setRefreshDays("");
    setDurationMinutes("");
  };

  return (
    <div>
      <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: "0 0 16px", display: "flex", alignItems: "center", gap: 4 }}>
        Sabit fiyatlı ürün/hizmetlerinizi buraya kaydedin
        <InfoTip placement="bottom" align="right" text={`Bu tamamen opsiyonel - kaydettikleriniz, yeni ${DEAL_WORD_FORMS[dealWordKind(sector)].bare} formunda hızlı seçim olarak çıkar; seçince başlık ve tutar otomatik dolar, sonrasında yine de değiştirebilirsiniz. Bir kalemi silmek veya fiyatını güncellemek, daha önce oluşturulmuş ${DEAL_WORD_FORMS[dealWordKind(sector)].pluralAcc} etkilemez - sadece o ${DEAL_WORD_FORMS[dealWordKind(sector)].bare} kaydedildiği andaki başlık/tutarı taşır.`} />
      </p>

      {items.length === 0 ? (
        <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 16 }}>Henüz ürün/hizmet eklenmedi.</p>
      ) : (
        <>
          {items.length > 5 && (
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Ürün/hizmet ara..."
              style={{ width: "100%", marginBottom: 8, fontSize: 13 }}
            />
          )}
          {filteredItems.length === 0 ? (
            <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 16 }}>Aramayla eşleşen kayıt yok.</p>
          ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 16 }}>
          {filteredItems.map((item) => (
            <div key={item.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, background: "var(--surface-1)", border: "0.5px solid var(--border)", borderRadius: "var(--radius)", padding: "8px 12px" }}>
              <span style={{ fontSize: 13, fontWeight: 500, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {item.name}
              </span>
              <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                <Badge tone="accent">{formatTL(item.price)}</Badge>
                {item.durationMinutes > 0 && <Badge tone="default">{item.durationMinutes} dk</Badge>}
                {item.refreshDays > 0 && <Badge tone="default">{item.refreshDays} günde bir</Badge>}
                {item.commissionPercent != null && (
                  <span title="Bu hizmete özel prim oranı"><Badge tone="default">%{item.commissionPercent} prim</Badge></span>
                )}
                <IconButton icon="ti-edit" title="Düzenle" size="sm" onClick={() => setEditingItem(item)} />
                <IconButton icon="ti-trash" title="Sil" size="sm" onClick={() => setConfirmDelete(item)} />
              </div>
            </div>
          ))}
        </div>
          )}
        </>
      )}

      <p style={{ fontSize: 13, fontWeight: 500, margin: "0 0 8px" }}>Yeni ürün/hizmet ekle</p>
      <form onSubmit={submit} style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "flex-end" }}>
        <div style={{ flex: 1, minWidth: 140 }}>
          <label style={{ fontSize: 12, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>İsim</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder={`Örn. ${PRICE_ITEM_NAME_EXAMPLES[sector] || "Danışmanlık"}`} style={{ width: "100%", fontSize: 13 }} />
        </div>
        <div style={{ width: 120 }}>
          <label style={{ fontSize: 12, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Fiyat (TL)</label>
          <input type="number" min="0" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0" style={{ width: "100%", fontSize: 13 }} />
        </div>
        <div style={{ width: 130 }}>
          <label style={{ fontSize: 12, color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: 3, marginBottom: 4 }}>
            Süre (dk)
            <InfoTip align="left" text="Opsiyonel - girerseniz, bu hizmet bir randevuya kalem olarak eklendiğinde randevunun süresi buna göre hesaplanır; aynı randevuda birden fazla hizmet varsa süreleri toplanır ve çakışma kontrolü buna göre yapılır." />
          </label>
          <input type="number" min="0" value={durationMinutes} onChange={(e) => setDurationMinutes(e.target.value)} placeholder="Opsiyonel" style={{ width: "100%", fontSize: 13 }} />
        </div>
        <div style={{ width: 150 }}>
          <label style={{ fontSize: 12, color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: 3, marginBottom: 4 }}>
            Tazeleme (gün)
            <InfoTip align="left" text="Opsiyonel - girerseniz, bu hizmet 'tamamlandı' olarak işaretlendiğinde bu kadar gün sonrasına otomatik bir hatırlatma kurulur (örn. protez tırnak için 21 gün)." />
          </label>
          <input type="number" min="0" value={refreshDays} onChange={(e) => setRefreshDays(e.target.value)} placeholder="Opsiyonel" style={{ width: "100%", fontSize: 13 }} />
        </div>
        <button type="submit" style={{ background: "var(--fill-accent)", color: "var(--on-accent)", border: "none", fontSize: 13 }}>
          + Ekle
        </button>
      </form>

      {confirmDelete && (
        <ConfirmDialog
          title="Ürün/hizmeti sil"
          message={`"${confirmDelete.name}" kaldırılacak. Bu geri alınamaz - ancak daha önce bu kalemle oluşturulmuş ${DEAL_WORD_FORMS[dealWordKind(sector)].plural} etkilenmez.`}
          onConfirm={() => { onDelete(confirmDelete.id); setConfirmDelete(null); }}
          onClose={() => setConfirmDelete(null)}
        />
      )}

      {editingItem && (
        <PriceListEditModal
          item={editingItem}
          sector={sector}
          onClose={() => setEditingItem(null)}
          onSave={(payload) => { onUpdate({ id: editingItem.id, ...payload }); setEditingItem(null); }}
        />
      )}
    </div>
  );
}

const STOCK_UNITS = ["adet", "ml", "gr", "kg", "lt", "kutu", "paket"];

// Gramaj bazlı stok/reçete yönetimi — sektörden bağımsız, sadece kullanan
// görür. "Stok" sekmesi malzemeleri (hammadde/sarf) tutar; "Reçete" sekmesi
// bir fiyat listesi kaleminin (hizmet/ürün) TEK SEFERLİK ne kadar malzeme
// tükettiğini tanımlar — bir teklif "kazanıldı"ya geçtiğinde bu miktar
// otomatik düşülür (bkz. App.jsx:computeServiceCompletionEffects).
const STOCK_ITEM_NAME_EXAMPLES = {
  guzellik_bakim: "Tüp Boya 8.1",
  saglik_klinik: "Lateks Eldiven",
  uretim_satis: "Çelik Sac 2mm",
  sanayi_esnaf: "Motor Yağı",
  perakende: "Karton Kutu (Ambalaj)",
  otel: "Havlu Seti",
  spor_merkezi: "Protein Tozu",
  egitim_kurs: "Ders Kitabı",
};

function StockEditModal({ item, sector, onSave, onClose }) {
  const [name, setName] = useState(item.name);
  const [unit, setUnit] = useState(item.unit);
  const [quantityOnHand, setQuantityOnHand] = useState(String(item.quantityOnHand));
  const [reorderThreshold, setReorderThreshold] = useState(item.reorderThreshold != null ? String(item.reorderThreshold) : "");
  const [supplierName, setSupplierName] = useState(item.supplierName || "");

  const submit = (e) => {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName || quantityOnHand === "") return;
    onSave({
      name: trimmedName, unit, quantityOnHand: Number(quantityOnHand),
      reorderThreshold: reorderThreshold === "" ? null : Number(reorderThreshold),
      supplierName: supplierName.trim(),
    });
  };

  return (
    <Modal title="Stok kalemini düzenle" onClose={onClose}>
      <form onSubmit={submit}>
        <div style={{ marginBottom: 10 }}>
          <label style={{ fontSize: 12, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>İsim</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder={`Örn. ${STOCK_ITEM_NAME_EXAMPLES[sector] || "Sarf Malzemesi"}`} style={{ width: "100%" }} />
        </div>
        <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 12, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Birim</label>
            <select value={unit} onChange={(e) => setUnit(e.target.value)} style={{ width: "100%" }}>
              {STOCK_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 12, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Mevcut miktar</label>
            <input type="number" value={quantityOnHand} onChange={(e) => setQuantityOnHand(e.target.value)} placeholder="0" style={{ width: "100%" }} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 12, color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: 3, marginBottom: 4 }}>
              Kritik seviye
              <InfoTip placement="bottom" align="right" text="Bu miktara inince (veya altına düşünce) Pano'da düşük stok uyarısı çıkar. Boş bırakırsanız hiç uyarı verilmez." />
            </label>
            <input type="number" value={reorderThreshold} onChange={(e) => setReorderThreshold(e.target.value)} placeholder="Opsiyonel" style={{ width: "100%" }} />
          </div>
        </div>
        <div style={{ marginBottom: 10 }}>
          <label style={{ fontSize: 12, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Tedarikçi</label>
          <input value={supplierName} onChange={(e) => setSupplierName(e.target.value)} placeholder="Opsiyonel" style={{ width: "100%" }} />
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button type="button" onClick={onClose}>Vazgeç</button>
          <button type="submit" style={{ background: "var(--fill-accent)", color: "var(--on-accent)", border: "none" }}>Güncelle</button>
        </div>
      </form>
    </Modal>
  );
}

function StockManager({ stockItems, priceListItems, priceItemIngredients, sector, onAddStock, onUpdateStock, onDeleteStock, onAddIngredient, onDeleteIngredient }) {
  const [tab, setTab] = useState("stok");
  const [name, setName] = useState("");
  const [unit, setUnit] = useState("adet");
  const [quantityOnHand, setQuantityOnHand] = useState("");
  const [reorderThreshold, setReorderThreshold] = useState("");
  const [supplierName, setSupplierName] = useState("");
  const [editingItem, setEditingItem] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);

  const [recipePriceItemId, setRecipePriceItemId] = useState(priceListItems[0]?.id || "");
  const [recipeStockItemId, setRecipeStockItemId] = useState("");
  const [recipeQuantity, setRecipeQuantity] = useState("");

  const submitStock = (e) => {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName || quantityOnHand === "") return;
    onAddStock({
      name: trimmedName, unit, quantityOnHand: Number(quantityOnHand),
      reorderThreshold: reorderThreshold === "" ? null : Number(reorderThreshold),
      supplierName: supplierName.trim(),
    });
    setName(""); setUnit("adet"); setQuantityOnHand(""); setReorderThreshold(""); setSupplierName("");
  };

  const recipeRows = priceItemIngredients.filter((i) => i.priceItemId === recipePriceItemId);

  return (
    <div>
      <div style={{ display: "flex", gap: 4, background: "var(--surface-1)", borderRadius: "var(--radius)", padding: 3, marginBottom: 16, width: "fit-content" }}>
        <button onClick={() => setTab("stok")} style={{ border: "none", background: tab === "stok" ? "var(--fill-accent)" : "transparent", color: tab === "stok" ? "var(--on-accent)" : "var(--text-secondary)", fontWeight: tab === "stok" ? 600 : 400, fontSize: 13 }}>
          Stok Kalemleri
        </button>
        <button onClick={() => setTab("recete")} style={{ border: "none", background: tab === "recete" ? "var(--fill-accent)" : "transparent", color: tab === "recete" ? "var(--on-accent)" : "var(--text-secondary)", fontWeight: tab === "recete" ? 600 : 400, fontSize: 13 }}>
          Reçeteler
        </button>
      </div>

      {tab === "stok" ? (
        <div>
          {stockItems.length === 0 ? (
            <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 16 }}>Henüz stok kalemi eklenmedi.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 16 }}>
              {stockItems.map((item) => {
                const low = item.reorderThreshold != null && item.quantityOnHand <= item.reorderThreshold;
                return (
                  <div key={item.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, background: "var(--surface-1)", border: "0.5px solid var(--border)", borderRadius: "var(--radius)", padding: "8px 12px" }}>
                    <div style={{ minWidth: 0 }}>
                      <p style={{ margin: 0, fontSize: 13, fontWeight: 500 }}>{item.name}</p>
                      {item.supplierName && <p style={{ margin: 0, fontSize: 11, color: "var(--text-muted)" }}>Tedarikçi: {item.supplierName}</p>}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                      <Badge tone={low ? "danger" : "accent"}>{item.quantityOnHand} {item.unit}</Badge>
                      <IconButton icon="ti-edit" title="Düzenle" size="sm" onClick={() => setEditingItem(item)} />
                      <IconButton icon="ti-trash" title="Sil" size="sm" onClick={() => setConfirmDelete(item)} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <p style={{ fontSize: 13, fontWeight: 500, margin: "0 0 8px" }}>Yeni stok kalemi ekle</p>
          <form onSubmit={submitStock} style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "flex-end" }}>
            <div style={{ flex: 1, minWidth: 140 }}>
              <label style={{ fontSize: 12, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>İsim</label>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder={`Örn. ${STOCK_ITEM_NAME_EXAMPLES[sector] || "Sarf Malzemesi"}`} style={{ width: "100%", fontSize: 13 }} />
            </div>
            <div style={{ width: 90 }}>
              <label style={{ fontSize: 12, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Birim</label>
              <select value={unit} onChange={(e) => setUnit(e.target.value)} style={{ width: "100%", fontSize: 13 }}>
                {STOCK_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
            <div style={{ width: 110 }}>
              <label style={{ fontSize: 12, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Mevcut miktar</label>
              <input type="number" value={quantityOnHand} onChange={(e) => setQuantityOnHand(e.target.value)} placeholder="0" style={{ width: "100%", fontSize: 13 }} />
            </div>
            <div style={{ width: 130 }}>
              <label style={{ fontSize: 12, color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: 3, marginBottom: 4 }}>
                Kritik seviye
                <InfoTip placement="bottom" align="right" text="Bu miktara inince (veya altına düşünce) Pano'da düşük stok uyarısı çıkar. Boş bırakırsanız hiç uyarı verilmez." />
              </label>
              <input type="number" value={reorderThreshold} onChange={(e) => setReorderThreshold(e.target.value)} placeholder="Opsiyonel" style={{ width: "100%", fontSize: 13 }} />
            </div>
            <div style={{ flex: 1, minWidth: 140 }}>
              <label style={{ fontSize: 12, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Tedarikçi</label>
              <input value={supplierName} onChange={(e) => setSupplierName(e.target.value)} placeholder="Opsiyonel" style={{ width: "100%", fontSize: 13 }} />
            </div>
            <button type="submit" style={{ background: "var(--fill-accent)", color: "var(--on-accent)", border: "none", fontSize: 13 }}>
              + Ekle
            </button>
          </form>

          {confirmDelete && (
            <ConfirmDialog
              title="Stok kalemini sil"
              message={`"${confirmDelete.name}" kaldırılacak. Bu kalemi kullanan reçete satırları da silinir.`}
              onConfirm={() => { onDeleteStock(confirmDelete.id); setConfirmDelete(null); }}
              onClose={() => setConfirmDelete(null)}
            />
          )}

          {editingItem && (
            <StockEditModal
              item={editingItem}
              sector={sector}
              onClose={() => setEditingItem(null)}
              onSave={(payload) => { onUpdateStock({ id: editingItem.id, ...payload }); setEditingItem(null); }}
            />
          )}
        </div>
      ) : (
        <div>
          {priceListItems.length === 0 || stockItems.length === 0 ? (
            <p style={{ fontSize: 13, color: "var(--text-muted)" }}>
              Reçete tanımlamak için önce Fiyat Listesi sekmesinde en az bir kalem ve burada en az bir stok kalemi olmalı.
            </p>
          ) : (
            <>
              <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 12, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Hangi ürün/hizmet için reçete tanımlıyorsunuz?</label>
                <select value={recipePriceItemId} onChange={(e) => setRecipePriceItemId(e.target.value)} style={{ width: "100%", fontSize: 13 }}>
                  {priceListItems.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>

              {recipeRows.length === 0 ? (
                <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 12 }}>Bu kalem için henüz reçete tanımlanmadı.</p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 12 }}>
                  {recipeRows.map((row) => {
                    const stockItem = stockItems.find((s) => s.id === row.stockItemId);
                    return (
                      <div key={row.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, background: "var(--surface-1)", border: "0.5px solid var(--border)", borderRadius: "var(--radius)", padding: "8px 12px" }}>
                        <span style={{ fontSize: 13 }}>{stockItem?.name || "Silinmiş kalem"}</span>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <Badge tone="accent">{row.quantity} {stockItem?.unit || ""}</Badge>
                          <IconButton icon="ti-trash" title="Sil" size="sm" onClick={() => onDeleteIngredient(row.id)} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!recipeStockItemId || !recipeQuantity) return;
                  onAddIngredient({ priceItemId: recipePriceItemId, stockItemId: recipeStockItemId, quantity: Number(recipeQuantity) });
                  setRecipeStockItemId(""); setRecipeQuantity("");
                }}
                style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "flex-end" }}
              >
                <div style={{ flex: 1, minWidth: 160 }}>
                  <label style={{ fontSize: 12, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Stok kalemi</label>
                  <select value={recipeStockItemId} onChange={(e) => setRecipeStockItemId(e.target.value)} style={{ width: "100%", fontSize: 13 }}>
                    <option value="">Seçin</option>
                    {stockItems.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.unit})</option>)}
                  </select>
                </div>
                <div style={{ width: 110 }}>
                  <label style={{ fontSize: 12, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Miktar</label>
                  <input type="number" min="0" step="0.01" value={recipeQuantity} onChange={(e) => setRecipeQuantity(e.target.value)} placeholder="0" style={{ width: "100%", fontSize: 13 }} />
                </div>
                <button type="submit" style={{ background: "var(--fill-accent)", color: "var(--on-accent)", border: "none", fontSize: 13 }}>
                  + Reçeteye ekle
                </button>
              </form>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function GroupClassForm({ initial, sector, currentEnrollment = 0, onSave, onCancel }) {
  const [name, setName] = useState(initial?.name || "");
  const [instructorName, setInstructorName] = useState(initial?.instructorName || "");
  const [weekday, setWeekday] = useState(initial?.weekday || 1);
  const [startTime, setStartTime] = useState(initial?.startTime || "18:00");
  const [durationMinutes, setDurationMinutes] = useState(initial?.durationMinutes ?? 60);
  const [capacity, setCapacity] = useState(initial?.capacity ?? 10);
  const [notes, setNotes] = useState(initial?.notes || "");
  const [capacityError, setCapacityError] = useState("");

  const submit = (e) => {
    e.preventDefault();
    if (!name.trim() || !capacity || Number(capacity) < 1) return;
    if (currentEnrollment > 0 && Number(capacity) < currentEnrollment) {
      setCapacityError(`Kapasite, zaten kayıtlı ${currentEnrollment} kişinin altına düşürülemez.`);
      return;
    }
    setCapacityError("");
    onSave({
      name: name.trim(), instructorName: instructorName.trim(), weekday: Number(weekday),
      startTime, durationMinutes: Number(durationMinutes) || 60, capacity: Number(capacity), notes: notes.trim(),
    });
  };

  return (
    <form onSubmit={submit}>
      <div style={{ marginBottom: 12 }}>
        <label style={{ fontSize: 13, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Ders adı</label>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder={sector === "egitim_kurs" ? "Örn. Yabancı Dil Kursu" : "Örn. Pilates"} style={{ width: "100%" }} />
      </div>
      <div style={{ marginBottom: 12 }}>
        <label style={{ fontSize: 13, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Eğitmen <span style={{ fontWeight: 400, color: "var(--text-muted)" }}>(opsiyonel)</span></label>
        <input value={instructorName} onChange={(e) => setInstructorName(e.target.value)} placeholder={sector === "egitim_kurs" ? "Örn. Ahmet Öğretmen" : "Örn. Ayşe Hoca"} style={{ width: "100%" }} />
      </div>
      <div style={{ display: "flex", gap: 12, marginBottom: 12, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 130 }}>
          <label style={{ fontSize: 13, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Gün</label>
          <select value={weekday} onChange={(e) => setWeekday(e.target.value)} style={{ width: "100%" }}>
            {WEEKDAYS.map((w, i) => <option key={w} value={i + 1}>{w}</option>)}
          </select>
          <p style={{ fontSize: 11.5, color: "var(--text-muted)", margin: "4px 0 0" }}>
            Her hafta tekrar eder - ilk oturum: {nextWeeklyOccurrence(Number(weekday), startTime || "00:00").toLocaleDateString("tr-TR", { day: "numeric", month: "long", weekday: "long" })}
          </p>
        </div>
        <div style={{ flex: 1, minWidth: 100 }}>
          <label style={{ fontSize: 13, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Saat</label>
          <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} style={{ width: "100%" }} />
        </div>
        <div style={{ flex: 1, minWidth: 100 }}>
          <label style={{ fontSize: 13, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Süre (dk)</label>
          <input type="number" min="1" value={durationMinutes} onChange={(e) => setDurationMinutes(e.target.value)} style={{ width: "100%" }} />
        </div>
        <div style={{ flex: 1, minWidth: 100 }}>
          <label style={{ fontSize: 13, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Kapasite</label>
          <input type="number" min="1" value={capacity} onChange={(e) => { setCapacity(e.target.value); setCapacityError(""); }} style={{ width: "100%" }} />
        </div>
      </div>
      {capacityError && <p style={{ fontSize: 12, color: "var(--text-danger)", margin: "-8px 0 12px" }}>{capacityError}</p>}
      <div style={{ marginBottom: 16 }}>
        <label style={{ fontSize: 13, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Not <span style={{ fontWeight: 400, color: "var(--text-muted)" }}>(opsiyonel)</span></label>
        <input value={notes} onChange={(e) => setNotes(e.target.value)} style={{ width: "100%" }} />
      </div>
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button type="button" onClick={onCancel}>Vazgeç</button>
        <button type="submit" style={{ background: "var(--fill-accent)", color: "var(--on-accent)", border: "none" }}>Kaydet</button>
      </div>
    </form>
  );
}

function GroupClassRoster({ group, enrollments, customers, activeCustomerIds, sector, occurrenceDate, attendance = [], onSetAttendance, onEdit, onDelete, onEnroll, onRemove }) {
  const words = groupClassWords(sector);
  const [search, setSearch] = useState("");
  const [confirmRemove, setConfirmRemove] = useState(null);
  const enrolledIds = new Set(enrollments.map((e) => e.customerId));
  const full = enrollments.length >= group.capacity;
  const query = search.trim().toLowerCase();
  const todayStr = new Date().toISOString().slice(0, 10);
  const showAttendance = !!occurrenceDate && occurrenceDate <= todayStr;
  const matches = query
    ? customers
        .filter((c) => !enrolledIds.has(c.id) && activeCustomerIds.has(c.id) && (c.name.toLowerCase().includes(query) || (c.phone || "").includes(query) || (c.email || "").toLowerCase().includes(query)))
        .slice(0, 8)
    : [];

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <Badge tone={full ? "danger" : "success"}>{enrollments.length}/{group.capacity} dolu</Badge>
        <div style={{ display: "flex", gap: 4 }}>
          <IconButton icon="ti-edit" title="Düzenle" size="sm" onClick={onEdit} />
          <IconButton icon="ti-trash" title="Sil" size="sm" onClick={onDelete} />
        </div>
      </div>
      <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: "0 0 16px" }}>
        {WEEKDAYS[group.weekday - 1]} {group.startTime}{group.instructorName ? ` · ${group.instructorName}` : ""}
      </p>

      {occurrenceDate && !showAttendance && (
        <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "0 0 12px" }}>Bu ders henüz gerçekleşmedi, yoklama alınamaz.</p>
      )}

      <p style={{ fontSize: 13, fontWeight: 500, margin: "0 0 8px" }}>
        {showAttendance ? `Yoklama - ${new Date(occurrenceDate).toLocaleDateString("tr-TR", { day: "numeric", month: "long" })}` : words.rosterTitle}
      </p>
      {enrollments.length === 0 ? (
        <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 16 }}>{words.emptyRoster}</p>
      ) : (
        <div style={{ marginBottom: 16, overflowX: "auto" }}>
          {/* Sayfa genelindeki liste tablolarıyla (Üyelikler/Randevular vb.) aynı
              görsel dil - üst büyük harf başlık, yuvarlak köşeli "hap" satırlar. */}
          <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: "0 6px" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", padding: "0 10px", fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.3 }}>
                  {words.memberColLabel}
                </th>
                {showAttendance && (
                  <>
                    <th style={{ textAlign: "center", padding: "0 4px", fontSize: 10.5, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" }}>Geldi</th>
                    <th style={{ textAlign: "center", padding: "0 4px", fontSize: 10.5, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" }}>Gelmedi</th>
                  </>
                )}
                <th style={{ padding: "0 10px" }}></th>
              </tr>
            </thead>
            <tbody>
              {enrollments.map((e) => {
                const c = customers.find((cust) => cust.id === e.customerId);
                const att = showAttendance ? attendance.find((a) => a.customerId === e.customerId) : null;
                return (
                  <tr key={e.id} style={{ background: "var(--surface-1)" }}>
                    <td style={{ padding: "8px 10px", borderRadius: "var(--radius) 0 0 var(--radius)", fontSize: 13 }}>
                      {c?.name || "Bilinmeyen müşteri"}
                    </td>
                    {showAttendance && (
                      <>
                        <td style={{ textAlign: "center", padding: "6px 4px" }}>
                          <button
                            type="button"
                            title="Geldi olarak işaretle"
                            onClick={() => onSetAttendance(e.customerId, "geldi")}
                            style={{ width: 28, height: 28, padding: 0, borderRadius: 6, border: att?.status === "geldi" ? "1.5px solid #15803d" : "0.5px solid var(--border)", background: att?.status === "geldi" ? "#15803d" : "var(--surface-2)", color: att?.status === "geldi" ? "#fff" : "transparent" }}
                          >
                            <i className="ti ti-check" aria-hidden="true"></i>
                          </button>
                        </td>
                        <td style={{ textAlign: "center", padding: "6px 4px" }}>
                          <button
                            type="button"
                            title="Gelmedi olarak işaretle"
                            onClick={() => onSetAttendance(e.customerId, "gelmedi")}
                            style={{ width: 28, height: 28, padding: 0, borderRadius: 6, border: att?.status === "gelmedi" ? "1.5px solid #b91c1c" : "0.5px solid var(--border)", background: att?.status === "gelmedi" ? "#b91c1c" : "var(--surface-2)", color: att?.status === "gelmedi" ? "#fff" : "transparent" }}
                          >
                            <i className="ti ti-check" aria-hidden="true"></i>
                          </button>
                        </td>
                      </>
                    )}
                    <td style={{ textAlign: "right", padding: "6px 10px", borderRadius: "0 var(--radius) var(--radius) 0" }}>
                      <IconButton icon="ti-x" title="Dersten çıkar" size="sm" onClick={() => setConfirmRemove(e)} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {full ? (
        <p style={{ fontSize: 12, color: "var(--text-danger)" }}>{words.fullMessage}</p>
      ) : (
        <>
          <p style={{ fontSize: 13, fontWeight: 500, margin: "0 0 4px", display: "flex", alignItems: "center", gap: 4 }}>
            {words.addMemberLabel}
            <InfoTip text={words.addMemberInfoTip} />
          </p>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Müşteri ara (ad, telefon, e-posta)" style={{ width: "100%" }} />
          {matches.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 8 }}>
              {matches.map((c) => (
                <div
                  key={c.id}
                  onClick={() => { onEnroll(c.id); setSearch(""); }}
                  style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "var(--surface-1)", borderRadius: "var(--radius)", padding: "6px 10px", cursor: "pointer" }}
                >
                  <span style={{ fontSize: 13 }}>{c.name}</span>
                  <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{c.phone}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {confirmRemove && (
        <ConfirmDialog
          title={words.removeMemberTitle}
          message={`"${customers.find((c) => c.id === confirmRemove.customerId)?.name || "Müşteri"}" bu dersten çıkarılacak. Bu geri alınamaz.`}
          onConfirm={() => { onRemove(confirmRemove.id); setConfirmRemove(null); }}
          onClose={() => setConfirmRemove(null)}
        />
      )}
    </div>
  );
}

// Çoğu KOBİ bu politikayı hiç kullanmayacak — İşletme Bilgileri'nde her zaman
// açık 3 alan olarak dururken hem gereksiz karmaşıklık katıyordu hem de dar
// (420px) modalde InfoTip balonu taşıyordu. Artık Dersler sekmesinde,
// varsayılan olarak KAPALI, "Ayarla"/"Düzenle" butonuyla açılan bir kutu —
// kullanılmıyorsa özet satırı bile göstermiyor, tek satır bilgi yeterli.
function LateCancelPolicyBox({ companySettings, onSave }) {
  const configured = companySettings?.hardBlockHours != null || companySettings?.lateCancelHours != null || companySettings?.lateCancelStrikeLimit != null;
  const [open, setOpen] = useState(false);
  const [hardBlockOn, setHardBlockOn] = useState(companySettings?.hardBlockHours != null);
  const [hardBlockHours, setHardBlockHours] = useState(companySettings?.hardBlockHours ?? "");
  const [lateCancelOn, setLateCancelOn] = useState(companySettings?.lateCancelHours != null);
  const [lateCancelHours, setLateCancelHours] = useState(companySettings?.lateCancelHours ?? "");
  const [strikeOn, setStrikeOn] = useState(companySettings?.lateCancelStrikeLimit != null);
  const [lateCancelStrikeLimit, setLateCancelStrikeLimit] = useState(companySettings?.lateCancelStrikeLimit ?? "");

  const handleOpen = () => {
    setHardBlockOn(companySettings?.hardBlockHours != null);
    setHardBlockHours(companySettings?.hardBlockHours ?? "");
    setLateCancelOn(companySettings?.lateCancelHours != null);
    setLateCancelHours(companySettings?.lateCancelHours ?? "");
    setStrikeOn(companySettings?.lateCancelStrikeLimit != null);
    setLateCancelStrikeLimit(companySettings?.lateCancelStrikeLimit ?? "");
    setOpen(true);
  };

  const handleSave = () => {
    onSave({
      hardBlockHours: hardBlockOn && hardBlockHours !== "" ? Number(hardBlockHours) : null,
      lateCancelHours: lateCancelOn && lateCancelHours !== "" ? Number(lateCancelHours) : null,
      lateCancelStrikeLimit: strikeOn && lateCancelStrikeLimit !== "" ? Number(lateCancelStrikeLimit) : null,
    });
    setOpen(false);
  };

  return (
    <div style={{ marginBottom: 16, background: "var(--surface-1)", border: "0.5px solid var(--border)", borderRadius: "var(--radius)", padding: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <p style={{ fontSize: 13, fontWeight: 500, margin: 0, display: "flex", alignItems: "center", gap: 4 }}>
          Geç iptal / seans yakma politikası
          <InfoTip
            align="left"
            text={
              "Üçü de opsiyonel, hiç ayarlamazsanız hiçbir şey değişmez (sabit 2 saatlik iptal kilidi geçerli olmaya devam eder).\n\n" +
              "Nasıl işler: ders saatine 'Tamamen kilitle' süresinden az kala üye HİÇ iptal edemez. Bunun ile 'Uyarı/seans yakma başlangıcı' süresi arasında iptal ederse 'geç iptal' sayılır - kaçıncı geç iptalde seansın yanacağını 'Kaçıncı geç iptalde' alanı belirler (örn. 3 girerseniz ilk 2 geç iptal sadece uyarı, 3.'den itibaren her geç iptalde 1 seans düşer). Bu iki eşiğin arasındaki sürede DEĞİLSE (yani yeterince erken iptal ediyorsa) hiçbir ceza uygulanmaz."
            }
          />
        </p>
        {!open && (
          <button type="button" onClick={handleOpen} style={{ fontSize: 12, padding: "4px 10px" }}>
            {configured ? "Düzenle" : "Ayarla"}
          </button>
        )}
      </div>
      {!open && (
        <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: "6px 0 0" }}>
          {configured
            ? `Aktif: dersten ${companySettings.hardBlockHours ?? 2} saat kalana kadar tamamen kilit${companySettings.lateCancelHours != null ? `, ${companySettings.lateCancelHours} saatten itibaren geç iptal sayılır` : ""}${companySettings.lateCancelStrikeLimit ? `, ${companySettings.lateCancelStrikeLimit}. geç iptalde seans yanmaya başlar` : ""}.`
            : "Kullanılmıyor - üyeler ders saatine 2 saat kalana kadar serbestçe iptal edebiliyor, geç iptal için özel bir kural/ceza yok."}
        </p>
      )}
      {open && (
        <>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 10 }}>
            <div>
              <label style={{ fontSize: 12, color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                <input type="checkbox" checked={hardBlockOn} onChange={(e) => setHardBlockOn(e.target.checked)} />
                Tamamen kilitle (saat)
              </label>
              <input type="number" min="0" step="0.5" disabled={!hardBlockOn} value={hardBlockHours} onChange={(e) => setHardBlockHours(e.target.value)} placeholder="Varsayılan: 2" style={{ width: 150 }} />
            </div>
            <div>
              <label style={{ fontSize: 12, color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                <input type="checkbox" checked={lateCancelOn} onChange={(e) => setLateCancelOn(e.target.checked)} />
                Uyarı/seans yakma başlangıcı (saat)
              </label>
              <input type="number" min="0" step="0.5" disabled={!lateCancelOn} value={lateCancelHours} onChange={(e) => setLateCancelHours(e.target.value)} placeholder="Örn. 4" style={{ width: 150 }} />
            </div>
            <div>
              <label style={{ fontSize: 12, color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                <input type="checkbox" checked={strikeOn} onChange={(e) => setStrikeOn(e.target.checked)} />
                Kaçıncı geç iptalde seans yansın
              </label>
              <input type="number" min="1" step="1" disabled={!strikeOn} value={lateCancelStrikeLimit} onChange={(e) => setLateCancelStrikeLimit(e.target.value)} placeholder="Varsayılan: 1 (hemen)" style={{ width: 150 }} />
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 10 }}>
            <button type="button" onClick={() => setOpen(false)}>Vazgeç</button>
            <button type="button" onClick={handleSave} style={{ background: "var(--fill-accent)", color: "var(--on-accent)", border: "none" }}>Kaydet</button>
          </div>
        </>
      )}
    </div>
  );
}

// Tekli randevu sektörlerinde (Güzellik & Bakım, Sağlık/Klinik, Emlak vb. —
// bookingModel(sector)==="slot" olan her yerde) portaldan iptal/gelmeme
// politikası TAMAMEN kobiye bırakılıyor — dört bağımsız, opsiyonel katman:
// 1) Tamamen kilitle: bu süreden az kala portaldan iptal edilemez.
// 2) Geç sayılma penceresi: (1)'den fazla ama bu süreden az kala yapılan
//    iptaller ENGELLENMEZ ama "Geç iptal etti" olarak işaretlenir.
// 3) Kaçıncı ihlalde: geç iptal + gelmeme (Randevuya gelmedi) sayısı bu
//    eşiğe ulaşınca o müşterinin SONRAKİ randevusunda ödeme otomatik
//    zorunlu hale gelir (bkz. computeNoShowRisk, DealForm).
// 4) Paket sahiplerinde seans yaksın: müşterinin zaten aktif (tükenmemiş)
//    bir paketi varsa, (3)'teki ödeme zorunluluğu YERİNE, ihlal ANINDA
//    (gecikmesiz — bkz. computeAppointmentPenaltyBurn) paketten 1 seans
//    düşülür. Zaten ödemiş birine tekrar ödeme istemek adaletsiz olurdu.
// Dördü de boşsa HİÇBİR kısıtlama/ceza yok — eski "kapalıyken sabit 2 saat
// kilitli" davranışı BİLEREK kaldırıldı, kobi "iptal etse de sorun değil"
// diyorsa bunu tam olarak uygulayabilsin diye (2026-07-26).
function AppointmentCancelPolicyBox({ companySettings, onSave }) {
  const configured = companySettings?.appointmentCancelHours != null || companySettings?.appointmentPenaltyHours != null || companySettings?.appointmentPenaltyStrikeLimit != null || companySettings?.appointmentPartialChargeHours != null;
  const [open, setOpen] = useState(false);
  const [hardBlockOn, setHardBlockOn] = useState(companySettings?.appointmentCancelHours != null);
  const [hardBlockHours, setHardBlockHours] = useState(companySettings?.appointmentCancelHours ?? "");
  const [penaltyOn, setPenaltyOn] = useState(companySettings?.appointmentPenaltyHours != null);
  const [penaltyHours, setPenaltyHours] = useState(companySettings?.appointmentPenaltyHours ?? "");
  const [partialOn, setPartialOn] = useState(companySettings?.appointmentPartialChargeHours != null);
  const [partialHours, setPartialHours] = useState(companySettings?.appointmentPartialChargeHours ?? "");
  const [strikeOn, setStrikeOn] = useState(companySettings?.appointmentPenaltyStrikeLimit != null);
  const [strikeLimit, setStrikeLimit] = useState(companySettings?.appointmentPenaltyStrikeLimit ?? "");
  const [burnsSession, setBurnsSession] = useState(companySettings?.appointmentPenaltyBurnsSession === true);

  const handleOpen = () => {
    setHardBlockOn(companySettings?.appointmentCancelHours != null);
    setHardBlockHours(companySettings?.appointmentCancelHours ?? "");
    setPenaltyOn(companySettings?.appointmentPenaltyHours != null);
    setPenaltyHours(companySettings?.appointmentPenaltyHours ?? "");
    setPartialOn(companySettings?.appointmentPartialChargeHours != null);
    setPartialHours(companySettings?.appointmentPartialChargeHours ?? "");
    setStrikeOn(companySettings?.appointmentPenaltyStrikeLimit != null);
    setStrikeLimit(companySettings?.appointmentPenaltyStrikeLimit ?? "");
    setBurnsSession(companySettings?.appointmentPenaltyBurnsSession === true);
    setOpen(true);
  };

  const handleSave = () => {
    onSave({
      appointmentCancelHours: hardBlockOn && hardBlockHours !== "" ? Number(hardBlockHours) : null,
      appointmentPenaltyHours: penaltyOn && penaltyHours !== "" ? Number(penaltyHours) : null,
      appointmentPartialChargeHours: partialOn && partialHours !== "" ? Number(partialHours) : null,
      appointmentPenaltyStrikeLimit: strikeOn && strikeLimit !== "" ? Number(strikeLimit) : null,
      appointmentPenaltyBurnsSession: strikeOn && burnsSession,
    });
    setOpen(false);
  };

  return (
    <div style={{ marginBottom: 16, background: "var(--surface-1)", border: "0.5px solid var(--border)", borderRadius: "var(--radius)", padding: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <p style={{ fontSize: 13, fontWeight: 500, margin: 0, display: "flex", alignItems: "center", gap: 4 }}>
          Randevu iptal / gelmeme politikası
          <InfoTip
            placement="bottom"
            align="left"
            text={
              "Beşi de opsiyonel, hiç ayarlamazsanız hiçbir kısıtlama/ceza uygulanmaz.\n\n" +
              "'Tamamen kilitle'den az kala müşteri portaldan iptal edemez. Bunun ile 'Geç sayılma penceresi' arasında iptal edilebilir ama 'Geç iptal etti' sayılır. 'Kısmi kesinti sınırı', geç iptalleri SADECE GÖRÜNÜRLÜK için ikiye ayırır (otomatik para hareketi yok). Geç iptal + gelmeme sayısı 'Kaçıncı ihlalde' eşiğine ulaşınca sonraki randevuda ödeme önerilir; 'Paket sahiplerinde seans yaksın' açıksa bunun yerine paketten 1 seans düşer."
            }
          />
        </p>
        {!open && (
          <button type="button" onClick={handleOpen} style={{ fontSize: 12, padding: "4px 10px" }}>
            {configured ? "Düzenle" : "Ayarla"}
          </button>
        )}
      </div>
      {!open && (
        <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: "6px 0 0" }}>
          {configured
            ? `Aktif: ${companySettings.appointmentCancelHours != null ? `randevuya ${companySettings.appointmentCancelHours} saat kalana kadar tamamen kilit` : "tamamen kilitleme yok"}${companySettings.appointmentPenaltyHours != null ? `, ${companySettings.appointmentPenaltyHours} saatten az kala iptal 'geç iptal' sayılır` : ""}${companySettings.appointmentPartialChargeHours != null ? `, ${companySettings.appointmentPartialChargeHours} saatten az kala kısmi kesinti (~%50) önerilir` : ""}${companySettings.appointmentPenaltyStrikeLimit ? `, ${companySettings.appointmentPenaltyStrikeLimit}. ihlalde ${companySettings.appointmentPenaltyBurnsSession ? "paket sahiplerinde seans yanar, diğerlerinde sonraki randevuda ödeme önerilir" : "sonraki randevuda ödeme önerilir"}` : ""}.`
            : "Kullanılmıyor - müşteri randevusunu istediği an iptal edebilir, geç iptal/gelmeme için otomatik bir sonuç yok."}
        </p>
      )}
      {open && (
        <>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 10 }}>
            <div>
              <label style={{ fontSize: 12, color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                <input type="checkbox" checked={hardBlockOn} onChange={(e) => setHardBlockOn(e.target.checked)} />
                Tamamen kilitle (saat)
              </label>
              <input type="number" min="0" step="0.5" disabled={!hardBlockOn} value={hardBlockHours} onChange={(e) => setHardBlockHours(e.target.value)} placeholder="Örn. 2" style={{ width: 150 }} />
            </div>
            <div>
              <label style={{ fontSize: 12, color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                <input type="checkbox" checked={penaltyOn} onChange={(e) => setPenaltyOn(e.target.checked)} />
                Geç sayılma penceresi (saat)
              </label>
              <input type="number" min="0" step="0.5" disabled={!penaltyOn} value={penaltyHours} onChange={(e) => setPenaltyHours(e.target.value)} placeholder="Örn. 24" style={{ width: 150 }} />
            </div>
            <div>
              <label style={{ fontSize: 12, color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                <input type="checkbox" checked={partialOn} onChange={(e) => setPartialOn(e.target.checked)} />
                Kısmi kesinti sınırı (saat)
                <InfoTip align="left" text="Geç sayılma penceresinin içinde, bundan az kala yapılan iptaller için 'kısmi kesinti (~%50) önerilir' notu gösterilir - sadece bilgi amaçlı, otomatik tahsilat/iade yapılmaz." />
              </label>
              <input type="number" min="0" step="0.5" disabled={!partialOn} value={partialHours} onChange={(e) => setPartialHours(e.target.value)} placeholder="Örn. 12" style={{ width: 150 }} />
            </div>
            <div>
              <label style={{ fontSize: 12, color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                <input type="checkbox" checked={strikeOn} onChange={(e) => setStrikeOn(e.target.checked)} />
                Kaçıncı ihlalde ödeme zorunlu olsun
              </label>
              <input type="number" min="1" step="1" disabled={!strikeOn} value={strikeLimit} onChange={(e) => setStrikeLimit(e.target.value)} placeholder="Örn. 2" style={{ width: 150 }} />
            </div>
          </div>
          <label style={{ fontSize: 12, color: strikeOn ? "var(--text-secondary)" : "var(--text-muted)", display: "flex", alignItems: "center", gap: 6, marginTop: 10, cursor: strikeOn ? "pointer" : "default" }}>
            <input type="checkbox" checked={burnsSession} disabled={!strikeOn} onChange={(e) => setBurnsSession(e.target.checked)} />
            Paket sahibi müşterilerde ödeme yerine seans yaksın
          </label>
          <p style={{ fontSize: 11.5, color: "var(--text-muted)", margin: "10px 0 0" }}>
            Öneri: no-show'da randevu saatinden itibaren 15-20 dakika bekleyip sonra "Randevuya gelmedi" işaretlemeniz makul kabul edilir (bir ayar değil, sadece bir öneri).
          </p>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 10 }}>
            <button type="button" onClick={() => setOpen(false)}>Vazgeç</button>
            <button type="button" onClick={handleSave} style={{ background: "var(--fill-accent)", color: "var(--on-accent)", border: "none" }}>Kaydet</button>
          </div>
        </>
      )}
    </div>
  );
}

// Randevu widget'ından (/randevu-al/{token}) gelen misafir müşteriden booking
// ANINDA sabit bir TL kapora tahsil eder - tamamen opsiyonel, varsayılan
// kapalı, KOBİ hem açıp açmamayı hem tutarı kendi seçer. Ödeme Bağlantısı
// (iyzico/PayTR) kurulu değilse alan devre dışı - kısıtlama değil görünürlük,
// önce ne yapılması gerektiği açıkça söyleniyor (bkz. api/deal-approval.js,
// api/lead-capture.js).
function AppointmentDepositBox({ companySettings, hasPaymentConnection, onSave }) {
  const configured = companySettings?.appointmentDepositAmount != null;
  const [open, setOpen] = useState(false);
  const [depositOn, setDepositOn] = useState(configured);
  const [depositAmount, setDepositAmount] = useState(companySettings?.appointmentDepositAmount ?? "");

  const handleOpen = () => {
    setDepositOn(configured);
    setDepositAmount(companySettings?.appointmentDepositAmount ?? "");
    setOpen(true);
  };

  const handleSave = () => {
    onSave({ appointmentDepositAmount: depositOn && depositAmount !== "" ? Number(depositAmount) : null });
    setOpen(false);
  };

  return (
    <div style={{ marginBottom: 16, background: "var(--surface-1)", border: "0.5px solid var(--border)", borderRadius: "var(--radius)", padding: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <p style={{ fontSize: 13, fontWeight: 500, margin: 0, display: "flex", alignItems: "center", gap: 4 }}>
          Randevu kaporası
          <InfoTip
            placement="bottom"
            align="left"
            text="Opsiyonel - açarsanız, randevu widget'ından (/randevu-al) kendi randevusunu alan misafir müşteri, talebi tamamlamak için burada belirlediğiniz sabit tutarı kartla önceden öder. Ödeme, normal bir tahsilat olarak kaydedilir - iade isterseniz mevcut İade akışını kullanabilirsiniz."
          />
        </p>
        {!open && (
          <button type="button" onClick={handleOpen} disabled={!hasPaymentConnection} style={{ fontSize: 12, padding: "4px 10px" }}>
            {configured ? "Düzenle" : "Ayarla"}
          </button>
        )}
      </div>
      {!open && (
        <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: "6px 0 0" }}>
          {!hasPaymentConnection
            ? "Kullanmak için önce Ödeme Bağlantısı'nı (iyzico veya PayTR) kurmanız gerekiyor."
            : configured
              ? `Aktif: randevu widget'ından randevu alan misafirlerden ${formatTL(companySettings.appointmentDepositAmount)} kapora isteniyor.`
              : "Kullanılmıyor - randevu widget'ından gelen talepler için önceden ödeme istenmiyor."}
        </p>
      )}
      {open && (
        <>
          <label style={{ fontSize: 12, color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: 6, margin: "10px 0 4px" }}>
            <input type="checkbox" checked={depositOn} onChange={(e) => setDepositOn(e.target.checked)} />
            Kapora iste
          </label>
          <input type="number" min="0" step="1" disabled={!depositOn} value={depositAmount} onChange={(e) => setDepositAmount(e.target.value)} placeholder="Örn. 100" style={{ width: 150 }} />
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 10 }}>
            <button type="button" onClick={() => setOpen(false)}>Vazgeç</button>
            <button type="button" onClick={handleSave} style={{ background: "var(--fill-accent)", color: "var(--on-accent)", border: "none" }}>Kaydet</button>
          </div>
        </>
      )}
    </div>
  );
}

// Aynı anda kaç randevu karşılanabileceği - Otel'deki oda "quantity"/Spor
// Merkezi'ndeki ders "capacity" ile AYNI basit desen. Boş/1 = eski davranış
// (aynı anda tek randevu) - hiç dokunmayan işletmeler etkilenmez.
function AppointmentConcurrencyBox({ companySettings, onSave }) {
  const configured = companySettings?.appointmentConcurrency != null;
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(companySettings?.appointmentConcurrency ?? "");

  const handleOpen = () => {
    setValue(companySettings?.appointmentConcurrency ?? "");
    setOpen(true);
  };

  const handleSave = () => {
    onSave({ appointmentConcurrency: value !== "" ? Math.max(1, Number(value)) : null });
    setOpen(false);
  };

  return (
    <div style={{ marginBottom: 16, background: "var(--surface-1)", border: "0.5px solid var(--border)", borderRadius: "var(--radius)", padding: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <p style={{ fontSize: 13, fontWeight: 500, margin: 0, display: "flex", alignItems: "center", gap: 4 }}>
          Eş zamanlı randevu kapasitesi
          <InfoTip
            placement="bottom"
            align="left"
            text={
              "Aynı saate kaç randevu birden alınabileceğini belirler - kaç uzman/koltuk/cihazınız varsa o kadar.\n\n" +
              "Ayarlamazsanız (varsayılan) aynı saate sadece 1 randevu alınabilir; biri doluyken o saat herkes için kapanır. " +
              "Örneğin 3 uzmanınız/koltuğunuz varsa buraya 3 yazarsanız aynı saate 3 farklı müşteri randevu alabilir."
            }
          />
        </p>
        {!open && (
          <button type="button" onClick={handleOpen} style={{ fontSize: 12, padding: "4px 10px" }}>
            {configured ? "Düzenle" : "Ayarla"}
          </button>
        )}
      </div>
      {!open && (
        <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: "6px 0 0" }}>
          {configured
            ? `Aktif: aynı saate en fazla ${companySettings.appointmentConcurrency} randevu birden alınabiliyor.`
            : "Varsayılan: aynı saate sadece 1 randevu alınabiliyor."}
        </p>
      )}
      {open && (
        <>
          <input type="number" min="1" step="1" value={value} onChange={(e) => setValue(e.target.value)} placeholder="Örn. 3" style={{ width: 150, marginTop: 8 }} />
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 10 }}>
            <button type="button" onClick={() => setOpen(false)}>Vazgeç</button>
            <button type="button" onClick={handleSave} style={{ background: "var(--fill-accent)", color: "var(--on-accent)", border: "none" }}>Kaydet</button>
          </div>
        </>
      )}
    </div>
  );
}

// Randevu hatırlatma e-postasının sonuna eklenen, işletmenin kendi yazdığı
// serbest metin - "aç karnına gelin" gibi. Opsiyonel, boşsa hatırlatma metni
// hiç değişmez (bkz. api/send-appointment-reminders.js).
function AppointmentPrepNoteBox({ companySettings, onSave }) {
  const [note, setNote] = useState(companySettings?.appointmentPrepNote || "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setNote(companySettings?.appointmentPrepNote || "");
  }, [companySettings?.appointmentPrepNote]);

  const handleSave = async () => {
    setSaving(true);
    await onSave({ appointmentPrepNote: note.trim() || null });
    setSaving(false);
  };

  // Bu not, İşletme Bilgileri formundaki "Randevu hatırlatma e-postası gönder"
  // anahtarı AÇIKKEN gönderilen hatırlatma mailine ekleniyor - o anahtar
  // kapalıysa not hiçbir yere gitmiyor ama bu kutunun kendisi bunu hiç
  // söylemiyordu, KOBİ notu yazıp kaydedip fark etmeden boşa bekleyebilirdi.
  const remindersOff = companySettings?.appointmentRemindersEnabled === false;
  return (
    <div style={{ marginBottom: 16, background: "var(--surface-1)", border: "0.5px solid var(--border)", borderRadius: "var(--radius)", padding: 12 }}>
      <p style={{ fontSize: 13, fontWeight: 500, margin: "0 0 6px" }}>Randevu öncesi not (opsiyonel)</p>
      <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: "0 0 8px" }}>
        İşletme Bilgileri'ndeki "Randevu hatırlatma e-postası gönder" ayarı açıkken, randevu saatinden 2 saat önce müşteriye giden hatırlatma e-postasının sonuna eklenir - {appointmentPrepNoteExample(companySettings?.sector)}
      </p>
      {remindersOff && (
        <p style={{ fontSize: 12, color: "var(--text-warning)", background: "var(--bg-warning)", border: "0.5px solid var(--text-warning)", borderRadius: 6, padding: "6px 8px", margin: "0 0 8px" }}>
          Şu an randevu hatırlatma e-postaları kapalı - bu notu kaydetseniz bile hiçbir yere gönderilmez. Açmak için Ayarlar → İşletme Bilgileri'ne gidin.
        </p>
      )}
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Örn. Lütfen randevunuzdan 15 dakika önce gelin."
        style={{ width: "100%", minHeight: 70, fontSize: 13, resize: "vertical" }}
      />
      <button
        type="button"
        onClick={handleSave}
        disabled={saving}
        style={{ marginTop: 8, background: "var(--fill-accent)", color: "var(--on-accent)", border: "none" }}
      >
        {saving ? "Kaydediliyor…" : "Kaydet"}
      </button>
    </div>
  );
}

function GroupClassesTab({ groupClasses, groupClassEnrollments, customers, activeCustomerIds, sector, companySettings, onAdd, onUpdate, onDelete, onEnroll, onRemove, onSaveCancelPolicy }) {
  const words = groupClassWords(sector);
  const [showForm, setShowForm] = useState(false);
  const [editingClass, setEditingClass] = useState(null);
  const [rosterClass, setRosterClass] = useState(null);
  const [confirmDeleteClass, setConfirmDeleteClass] = useState(null);

  const enrollCountFor = (classId) => groupClassEnrollments.filter((e) => e.groupClassId === classId).length;
  const rosterClassLive = rosterClass ? groupClasses.find((g) => g.id === rosterClass.id) || null : null;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: 0 }}>{words.tabSubtitle}</p>
        <button
          onClick={() => { setEditingClass(null); setShowForm(true); }}
          style={{ background: "var(--fill-accent)", color: "var(--on-accent)", border: "none", display: "flex", alignItems: "center", gap: 6 }}
        >
          <i className="ti ti-plus" style={{ fontSize: 16 }} aria-hidden="true"></i>
          Yeni ders
        </button>
      </div>

      <LateCancelPolicyBox companySettings={companySettings} onSave={onSaveCancelPolicy} />

      {groupClasses.length === 0 ? (
        <p style={{ fontSize: 14, color: "var(--text-secondary)" }}>Henüz ders eklenmedi.</p>
      ) : (
        <div style={{ display: "flex", gap: 12, overflowX: "auto", paddingBottom: 8 }}>
          {WEEKDAYS.map((wLabel, i) => {
            const wd = i + 1;
            const dayClasses = groupClasses.filter((g) => g.weekday === wd).sort((a, b) => a.startTime.localeCompare(b.startTime));
            return (
              <div key={wd} style={{ minWidth: 160, flex: "none" }}>
                <p style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase", margin: "0 0 8px" }}>{wLabel}</p>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {dayClasses.map((g) => {
                    const count = enrollCountFor(g.id);
                    const full = count >= g.capacity;
                    return (
                      <div
                        key={g.id}
                        onClick={() => setRosterClass(g)}
                        style={{ background: "var(--surface-1)", border: "0.5px solid var(--border)", borderRadius: "var(--radius)", padding: "10px 12px", cursor: "pointer", opacity: full ? 0.7 : 1 }}
                      >
                        <p style={{ margin: 0, fontSize: 13, fontWeight: 600 }}>{g.name}</p>
                        <p style={{ margin: "2px 0 6px", fontSize: 12, color: "var(--text-secondary)" }}>
                          {g.startTime}{g.instructorName ? ` · ${g.instructorName}` : ""}
                        </p>
                        <Badge tone={full ? "danger" : "success"}>{count}/{g.capacity} dolu</Badge>
                      </div>
                    );
                  })}
                  {dayClasses.length === 0 && <p style={{ fontSize: 12, color: "var(--text-muted)" }}>-</p>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showForm && (
        <Modal title={editingClass ? "Dersi düzenle" : "Yeni ders"} onClose={() => setShowForm(false)}>
          <GroupClassForm
            initial={editingClass}
            sector={sector}
            currentEnrollment={editingClass ? enrollCountFor(editingClass.id) : 0}
            onSave={(vals) => { editingClass ? onUpdate({ id: editingClass.id, ...vals }) : onAdd(vals); setShowForm(false); }}
            onCancel={() => setShowForm(false)}
          />
        </Modal>
      )}

      {rosterClassLive && (
        <Modal title={rosterClassLive.name} onClose={() => setRosterClass(null)}>
          <GroupClassRoster
            group={rosterClassLive}
            enrollments={groupClassEnrollments.filter((e) => e.groupClassId === rosterClassLive.id)}
            customers={customers}
            activeCustomerIds={activeCustomerIds}
            sector={sector}
            onEdit={() => { setEditingClass(rosterClassLive); setShowForm(true); setRosterClass(null); }}
            onDelete={() => setConfirmDeleteClass(rosterClassLive)}
            onEnroll={(customerId) => onEnroll({ groupClassId: rosterClassLive.id, customerId })}
            onRemove={onRemove}
          />
        </Modal>
      )}

      {confirmDeleteClass && (
        <ConfirmDialog
          title="Dersi sil"
          message={`"${confirmDeleteClass.name}" ${words.deleteClassMessage}`}
          onConfirm={() => { onDelete(confirmDeleteClass.id); setConfirmDeleteClass(null); setRosterClass(null); }}
          onClose={() => setConfirmDeleteClass(null)}
        />
      )}
    </div>
  );
}

function agendaDateKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Kayıtlar sekmesindeki "İlgilenilmesi gereken" hızlı filtresi için pencere —
// randevu/rezervasyon "ileriye dönük" (bugünden pencere sonuna), reminder/
// üyelik bitişi ise "o tarihe kadar, geçmiş dahil" karşılaştırması yapıyor;
// ikinci durumda sadece endStr/end kullanılıyor, start hiç kontrol edilmiyor.
function quickDateWindow(mode) {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let end;
  if (mode === "today") {
    end = new Date(startOfToday.getFullYear(), startOfToday.getMonth(), startOfToday.getDate(), 23, 59, 59, 999);
  } else if (mode === "week") {
    const isoWeekday = startOfToday.getDay() === 0 ? 7 : startOfToday.getDay();
    end = new Date(startOfToday);
    end.setDate(end.getDate() + (7 - isoWeekday));
    end.setHours(23, 59, 59, 999);
  } else if (mode === "month") {
    end = new Date(startOfToday.getFullYear(), startOfToday.getMonth() + 1, 0, 23, 59, 59, 999);
  } else {
    return null;
  }
  return { start: startOfToday, end, startStr: agendaDateKey(startOfToday), endStr: agendaDateKey(end) };
}

// group_classes'ın belirli bir tarihi yok, sadece haftalık tekrarı (weekday +
// startTime) var — Finance.jsx'teki expandExpenseOccurrences'ın aynı fikri:
// verilen tarih aralığında (bounds) bu derse denk gelen her günü sanal bir
// "occurrence"a çeviriyor.
function expandGroupClassOccurrences(groupClass, bounds) {
  const occurrences = [];
  const [hh, mm] = (groupClass.startTime || "00:00").split(":").map(Number);
  let cursor = new Date(bounds.start.getFullYear(), bounds.start.getMonth(), bounds.start.getDate());
  while (cursor <= bounds.end) {
    const isoWeekday = cursor.getDay() === 0 ? 7 : cursor.getDay();
    if (isoWeekday === groupClass.weekday) {
      occurrences.push({ ...groupClass, occurrenceDate: new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate(), hh, mm) });
    }
    cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + 1);
  }
  return occurrences;
}

// Hatırlatma (tüm sektörler), randevu (sektöre özel "Tarih & Saat" alanı
// varsa) ve grup dersi (haftalık tekrar) — üçünü tek bir {dateKey: [olay,...]}
// sözlüğüne topluyor, AgendaTab bunu güne göre okuyup ızgaraya döküyor.
function buildAgendaEvents(bounds, { deals, groupClasses, groupClassEnrollments, appointmentDateTimeKey }) {
  const eventsByDate = {};
  const push = (dateKey, item) => {
    if (!eventsByDate[dateKey]) eventsByDate[dateKey] = [];
    eventsByDate[dateKey].push(item);
  };

  deals.filter((d) => d.reminderDate && d.stage !== "kazanildi" && d.stage !== "kaybedildi").forEach((d) => {
    push(d.reminderDate, { type: "reminder", id: `r-${d.id}`, deal: d, time: null, label: d.title });
  });

  if (appointmentDateTimeKey) {
    deals.filter((d) => d.stage !== "kaybedildi").forEach((d) => {
      const date = parseAppointmentDateTime(d.customFields?.[appointmentDateTimeKey]);
      if (date && date >= bounds.start && date <= bounds.end) {
        push(agendaDateKey(date), { type: "appointment", id: `a-${d.id}`, deal: d, time: date, label: d.title });
      }
    });
  }

  groupClasses.forEach((g) => {
    expandGroupClassOccurrences(g, bounds).forEach((occ) => {
      const enrolledCount = groupClassEnrollments.filter((e) => e.groupClassId === g.id).length;
      push(agendaDateKey(occ.occurrenceDate), { type: "class", id: `c-${g.id}-${agendaDateKey(occ.occurrenceDate)}`, groupClass: g, time: occ.occurrenceDate, label: g.name, enrolledCount });
    });
  });

  return eventsByDate;
}

const AGENDA_EVENT_COLORS = { reminder: "#b45309", appointment: "#185fa5", class: "#15803d" };
const AGENDA_EVENT_ICONS = { reminder: "ti-bell", appointment: "ti-calendar-event", class: "ti-users" };

function getMonthGridDays(anchorDate) {
  const year = anchorDate.getFullYear();
  const month = anchorDate.getMonth();
  const startWeekday = (new Date(year, month, 1).getDay() + 6) % 7; // 0=Pazartesi
  const gridStart = new Date(year, month, 1 - startWeekday);
  return Array.from({ length: 42 }, (_, i) => new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + i));
}

function getWeekDays(anchorDate) {
  const startWeekday = (anchorDate.getDay() + 6) % 7;
  const monday = new Date(anchorDate.getFullYear(), anchorDate.getMonth(), anchorDate.getDate() - startWeekday);
  return Array.from({ length: 7 }, (_, i) => new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i));
}

const AGENDA_MONTH_NAMES = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];

// Hatırlatma+randevu+grup dersini tek bir ay/hafta ızgarasında, tüm
// sektörlerde birleştiren "Ajanda" sekmesi (eski, sadece randevu
// sektörlerinde görünen kronolojik liste "Randevularım"ın yerine geçti).
function AgendaTab({ deals, customers, groupClasses, groupClassEnrollments, classAttendance, activeCustomerIds, sector, dateTimeKey, teamMembers = [], resources = [], currentUserId, currentUserEmail, onOpenDeal, onOpenClasses, onEnrollClass, onRemoveFromClass, onSetAttendance }) {
  const [rosterClass, setRosterClass] = useState(null);
  const [rosterOccurrenceDate, setRosterOccurrenceDate] = useState(null);
  const rosterClassLive = rosterClass ? groupClasses.find((g) => g.id === rosterClass.id) || null : null;
  const today = new Date();
  const [viewMode, setViewMode] = useState("ay");
  const [anchorDate, setAnchorDate] = useState(today);
  const [selectedDateKey, setSelectedDateKey] = useState(agendaDateKey(today));
  const [showDayModal, setShowDayModal] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [staffFilter, setStaffFilter] = useState("");
  const [resourceFilter, setResourceFilter] = useState("");
  const todayKey = agendaDateKey(today);
  const agendaYearOptions = Array.from({ length: 11 }, (_, i) => today.getFullYear() - 5 + i);

  const gridDays = viewMode === "ay" ? getMonthGridDays(anchorDate) : getWeekDays(anchorDate);
  const bounds = {
    start: new Date(gridDays[0].getFullYear(), gridDays[0].getMonth(), gridDays[0].getDate()),
    end: new Date(gridDays[gridDays.length - 1].getFullYear(), gridDays[gridDays.length - 1].getMonth(), gridDays[gridDays.length - 1].getDate(), 23, 59, 59, 999),
  };
  // Filtre seçiliyse SADECE o personel/kaynağa ait randevu+hatırlatmalar
  // kalır - ders (group class) etkinlikleri filtreden bağımsız her zaman
  // görünür (bir kaynağa/personele atanma kavramı yok).
  const filteredDeals = deals.filter((d) => {
    if (staffFilter && d.assignedTo !== staffFilter) return false;
    if (resourceFilter && d.customFields?.resource_id !== resourceFilter) return false;
    return true;
  });
  const eventsByDate = buildAgendaEvents(bounds, { deals: filteredDeals, groupClasses, groupClassEnrollments, appointmentDateTimeKey: dateTimeKey });
  const customerName = (id) => customers.find((c) => c.id === id)?.name || "Bilinmeyen müşteri";

  const navigate = (dir) => {
    if (viewMode === "ay") setAnchorDate((d) => new Date(d.getFullYear(), d.getMonth() + dir, 1));
    else setAnchorDate((d) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + dir * 7));
  };
  const goToday = () => { setAnchorDate(today); setSelectedDateKey(todayKey); };

  const selectedItems = eventsByDate[selectedDateKey] || [];
  const selectedItemsSorted = [...selectedItems].sort((a, b) => (a.time && b.time ? a.time - b.time : a.time ? -1 : b.time ? 1 : 0));

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, marginBottom: "1rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button onClick={() => navigate(-1)} aria-label="Önceki" style={{ width: 32, height: 32, padding: 0 }}><i className="ti ti-chevron-left" aria-hidden="true"></i></button>
          <button onClick={goToday} style={{ fontSize: 13 }}>Bugün</button>
          <button onClick={() => navigate(1)} aria-label="Sonraki" style={{ width: 32, height: 32, padding: 0 }}><i className="ti ti-chevron-right" aria-hidden="true"></i></button>
          <div style={{ position: "relative" }}>
            <button
              onClick={() => setPickerOpen((o) => !o)}
              style={{ fontSize: 14, fontWeight: 600, marginLeft: 4, background: "transparent", border: "none", cursor: "pointer", padding: "4px 6px", display: "flex", alignItems: "center", gap: 4, color: "var(--text-primary)" }}
            >
              {viewMode === "ay"
                ? anchorDate.toLocaleDateString("tr-TR", { month: "long", year: "numeric" })
                : `${getWeekDays(anchorDate)[0].toLocaleDateString("tr-TR", { day: "numeric", month: "short" })} - ${getWeekDays(anchorDate)[6].toLocaleDateString("tr-TR", { day: "numeric", month: "short" })}`}
              <i className="ti ti-chevron-down" style={{ fontSize: 12 }} aria-hidden="true"></i>
            </button>
            {pickerOpen && (
              <div style={{ position: "absolute", top: "100%", left: 0, marginTop: 4, background: "var(--surface-1)", border: "0.5px solid var(--border)", borderRadius: 8, padding: 10, display: "flex", gap: 6, alignItems: "center", zIndex: 20, boxShadow: "0 4px 12px rgba(0,0,0,0.15)" }}>
                <select
                  value={anchorDate.getMonth()}
                  onChange={(e) => setAnchorDate(new Date(anchorDate.getFullYear(), Number(e.target.value), 1))}
                  style={{ fontSize: 13 }}
                >
                  {AGENDA_MONTH_NAMES.map((m, i) => <option key={m} value={i}>{m}</option>)}
                </select>
                <select
                  value={anchorDate.getFullYear()}
                  onChange={(e) => setAnchorDate(new Date(Number(e.target.value), anchorDate.getMonth(), 1))}
                  style={{ fontSize: 13 }}
                >
                  {agendaYearOptions.map((y) => <option key={y} value={y}>{y}</option>)}
                </select>
                <button onClick={() => setPickerOpen(false)} style={{ fontSize: 12, padding: "4px 8px" }}>Kapat</button>
              </div>
            )}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {[{ id: "ay", label: "Ay" }, { id: "hafta", label: "Hafta" }].map((m) => (
            <button
              key={m.id}
              onClick={() => setViewMode(m.id)}
              style={{
                background: viewMode === m.id ? "var(--fill-accent)" : "var(--surface-1)",
                color: viewMode === m.id ? "var(--on-accent)" : "var(--text-primary)",
                border: "0.5px solid var(--border)", fontSize: 13,
              }}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {(teamMembers.length > 0 || resources.length > 0) && (
        <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
          {teamMembers.length > 0 && (
            <select value={staffFilter} onChange={(e) => setStaffFilter(e.target.value)} style={{ fontSize: 13 }}>
              <option value="">Tüm personel</option>
              {currentUserId && <option value={currentUserId}>Ben ({currentUserEmail})</option>}
              {teamMembers.filter((m) => m.id !== currentUserId).map((m) => <option key={m.id} value={m.id}>{m.name || m.email}</option>)}
            </select>
          )}
          {resources.length > 0 && (
            <select value={resourceFilter} onChange={(e) => setResourceFilter(e.target.value)} style={{ fontSize: 13 }}>
              <option value="">Tüm cihaz/oda</option>
              {resources.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          )}
        </div>
      )}

      <div className="agenda-grid" style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4, marginBottom: 4 }}>
        {WEEKDAYS_SHORT.map((w) => (
          <p key={w} style={{ margin: 0, fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textAlign: "center", textTransform: "uppercase" }}>{w}</p>
        ))}
      </div>
      <div className="agenda-grid" style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4, marginBottom: "1rem" }}>
        {gridDays.map((day) => {
          const dateKey = agendaDateKey(day);
          const items = eventsByDate[dateKey] || [];
          const isOtherMonth = viewMode === "ay" && day.getMonth() !== anchorDate.getMonth();
          const isToday = dateKey === todayKey;
          const isSelected = dateKey === selectedDateKey;
          return (
            <button
              key={dateKey}
              type="button"
              className={`agenda-day-cell agenda-day-cell--${viewMode}`}
              onClick={() => { setSelectedDateKey(dateKey); setShowDayModal(true); }}
              style={{
                textAlign: "left", minHeight: viewMode === "ay" ? 72 : 110, padding: "6px 6px",
                background: isSelected ? "var(--surface-accent, var(--surface-1))" : "var(--surface-1)",
                border: isSelected ? "1.5px solid var(--fill-accent)" : isToday ? "1.5px solid var(--text-accent)" : "0.5px solid var(--border)",
                borderRadius: 8, opacity: isOtherMonth ? 0.45 : 1, display: "flex", flexDirection: "column", gap: 3, cursor: "pointer",
              }}
            >
              <span className="agenda-day-number" style={{ fontSize: 12, fontWeight: isToday ? 700 : 500, color: isToday ? "var(--text-accent)" : "var(--text-primary)" }}>{day.getDate()}</span>
              {items.slice(0, 3).map((it) => (
                <span key={it.id} className="agenda-event-pill" style={{ fontSize: 10.5, color: "#fff", background: AGENDA_EVENT_COLORS[it.type], borderRadius: 4, padding: "1px 5px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {it.label}
                </span>
              ))}
              {items.length > 3 && <span style={{ fontSize: 10, color: "var(--text-muted)" }}>+{items.length - 3} daha</span>}
            </button>
          );
        })}
      </div>

      {showDayModal && (
        <Modal title={new Date(selectedDateKey).toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric", weekday: "long" })} onClose={() => setShowDayModal(false)}>
          {selectedItemsSorted.length === 0 ? (
            <p style={{ margin: 0, fontSize: 13, color: "var(--text-muted)" }}>Bu günde bir şey yok.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {selectedItemsSorted.map((it) => (
                <div
                  key={it.id}
                  onClick={() => {
                    if (it.type === "class") { setRosterClass(it.groupClass); setRosterOccurrenceDate(selectedDateKey); }
                    else { setShowDayModal(false); onOpenDeal(it.deal); }
                  }}
                  style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", padding: "6px 8px", borderRadius: 8, background: "var(--surface-1)" }}
                >
                  <i className={`ti ${AGENDA_EVENT_ICONS[it.type]}`} style={{ color: AGENDA_EVENT_COLORS[it.type], fontSize: 16 }} aria-hidden="true"></i>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ margin: 0, fontSize: 13, fontWeight: 500 }}>{it.label}</p>
                    <p style={{ margin: 0, fontSize: 12, color: "var(--text-secondary)" }}>
                      {it.type === "reminder" ? `Hatırlatma · ${customerName(it.deal.customerId)}` : null}
                      {it.type === "appointment" ? `${it.time.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })} · ${customerName(it.deal.customerId)}` : null}
                      {it.type === "class" ? (() => {
                        const dayAttendance = classAttendance.filter((a) => a.groupClassId === it.groupClass.id && a.occurrenceDate === selectedDateKey);
                        const came = dayAttendance.filter((a) => a.status === "geldi").length;
                        const notCame = dayAttendance.filter((a) => a.status === "gelmedi").length;
                        const summary = dayAttendance.length > 0 ? `${came} geldi, ${notCame} gelmedi` : `${it.enrolledCount}/${it.groupClass.capacity} kayıtlı`;
                        return `${it.time.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })} · ${summary}`;
                      })() : null}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Modal>
      )}
      {rosterClassLive && (
        <Modal title={rosterClassLive.name} onClose={() => { setRosterClass(null); setRosterOccurrenceDate(null); }}>
          <GroupClassRoster
            group={rosterClassLive}
            enrollments={groupClassEnrollments.filter((e) => e.groupClassId === rosterClassLive.id)}
            customers={customers}
            activeCustomerIds={activeCustomerIds}
            sector={sector}
            occurrenceDate={rosterOccurrenceDate}
            attendance={classAttendance.filter((a) => a.groupClassId === rosterClassLive.id && a.occurrenceDate === rosterOccurrenceDate)}
            onSetAttendance={(customerId, status) => onSetAttendance(rosterClassLive.id, customerId, rosterOccurrenceDate, status)}
            onEdit={() => { setRosterClass(null); setRosterOccurrenceDate(null); onOpenClasses(); }}
            onDelete={() => { setRosterClass(null); setRosterOccurrenceDate(null); onOpenClasses(); }}
            onEnroll={(customerId) => onEnrollClass({ groupClassId: rosterClassLive.id, customerId })}
            onRemove={onRemoveFromClass}
          />
        </Modal>
      )}
    </div>
  );
}

function BusinessHoursManager({ items, onAdd, onDelete }) {
  const [weekday, setWeekday] = useState(1);
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("18:00");
  const [slotDurationMinutes, setSlotDurationMinutes] = useState(30);
  const [hasBreak, setHasBreak] = useState(false);
  const [breakStart, setBreakStart] = useState("12:00");
  const [breakEnd, setBreakEnd] = useState("13:00");
  const [confirmDelete, setConfirmDelete] = useState(null);

  const sorted = [...items].sort((a, b) => a.weekday - b.weekday || a.startTime.localeCompare(b.startTime));

  const submit = (e) => {
    e.preventDefault();
    if (!startTime || !endTime || endTime <= startTime || !slotDurationMinutes) return;
    if (hasBreak) {
      if (!breakStart || !breakEnd || breakStart <= startTime || breakEnd >= endTime || breakEnd <= breakStart) return;
      onAdd({ weekday: Number(weekday), startTime, endTime: breakStart, slotDurationMinutes: Number(slotDurationMinutes) });
      onAdd({ weekday: Number(weekday), startTime: breakEnd, endTime, slotDurationMinutes: Number(slotDurationMinutes) });
    } else {
      onAdd({ weekday: Number(weekday), startTime, endTime, slotDurationMinutes: Number(slotDurationMinutes) });
    }
  };

  return (
    <div>
      <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: "0 0 16px", display: "flex", alignItems: "center", gap: 4 }}>
        Müşterilerinizin portaldan randevu alabileceği çalışma saatleriniz
        <InfoTip placement="bottom" align="right" text={'Burada tanımladığınız gün/saat pencereleri, belirlediğiniz süre aralıklarla bölünüp müşteri portalında müsait randevu saatleri olarak gösterilir. Öğle arası varsa "Öğle arası var" kutusunu işaretleyip ara saatlerini girin - sistem günü otomatik olarak iki parçaya böler.'} />
      </p>

      {sorted.length === 0 ? (
        <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 16 }}>Henüz müsaitlik saati eklenmedi.</p>
      ) : (
        // Haftanın 7 gününü yan yana sütun yapan bir ızgara — önceden her
        // aralık (öğle arasıyla bölünmüş günlerde 2+ satır) tek bir dikey
        // listede alt alta sıralanıyordu, haftanın genel görünümünü tek
        // bakışta kavramak zordu (kullanıcı geri bildirimi, 2026-08-01).
        <div style={{ overflowX: "auto", marginBottom: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(122px, 1fr))", gap: 6, minWidth: 780 }}>
            {WEEKDAYS.map((w, i) => {
              const weekday = i + 1;
              const dayItems = sorted.filter((b) => b.weekday === weekday);
              return (
                <div key={weekday} style={{ background: "var(--surface-1)", border: "0.5px solid var(--border)", borderRadius: "var(--radius)", padding: 8, display: "flex", flexDirection: "column", gap: 6, minHeight: 56 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.3 }}>{w}</div>
                  {dayItems.length === 0 ? (
                    <span style={{ fontSize: 12, color: "var(--text-muted)" }}>Kapalı</span>
                  ) : (
                    dayItems.map((b) => (
                      <div key={b.id} style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 4, background: "var(--surface-2)", borderRadius: 6, padding: "4px 6px" }}>
                        <div>
                          <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-accent)" }}>{b.startTime}-{b.endTime}</div>
                          <div style={{ fontSize: 10.5, color: "var(--text-muted)" }}>{b.slotDurationMinutes} dk aralık</div>
                        </div>
                        <IconButton icon="ti-trash" title="Sil" size="sm" onClick={() => setConfirmDelete(b)} />
                      </div>
                    ))
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <p style={{ fontSize: 13, fontWeight: 500, margin: "0 0 8px" }}>Yeni müsaitlik ekle</p>
      <form onSubmit={submit} style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "flex-end" }}>
        <div style={{ minWidth: 130 }}>
          <label style={{ fontSize: 12, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Gün</label>
          <select value={weekday} onChange={(e) => setWeekday(e.target.value)} style={{ fontSize: 13 }}>
            {WEEKDAYS.map((w, i) => <option key={w} value={i + 1}>{w}</option>)}
          </select>
        </div>
        <div style={{ width: 100 }}>
          <label style={{ fontSize: 12, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Başlangıç</label>
          <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} style={{ fontSize: 13, width: "100%" }} />
        </div>
        <div style={{ width: 100 }}>
          <label style={{ fontSize: 12, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Bitiş</label>
          <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} style={{ fontSize: 13, width: "100%" }} />
        </div>
        <div style={{ width: 110 }}>
          <label style={{ fontSize: 12, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Slot süresi (dk)</label>
          <input type="number" min="5" step="5" value={slotDurationMinutes} onChange={(e) => setSlotDurationMinutes(e.target.value)} style={{ fontSize: 13, width: "100%" }} />
        </div>
        <div style={{ width: "100%", display: "flex", gap: 6, alignItems: "flex-end", flexWrap: "wrap" }}>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--text-secondary)", marginBottom: 8 }}>
            <input type="checkbox" checked={hasBreak} onChange={(e) => setHasBreak(e.target.checked)} />
            Öğle arası var
          </label>
          {hasBreak && (
            <>
              <div style={{ width: 100 }}>
                <label style={{ fontSize: 12, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Ara başlangıç</label>
                <input type="time" value={breakStart} onChange={(e) => setBreakStart(e.target.value)} style={{ fontSize: 13, width: "100%" }} />
              </div>
              <div style={{ width: 100 }}>
                <label style={{ fontSize: 12, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Ara bitiş</label>
                <input type="time" value={breakEnd} onChange={(e) => setBreakEnd(e.target.value)} style={{ fontSize: 13, width: "100%" }} />
              </div>
            </>
          )}
        </div>
        <button type="submit" style={{ background: "var(--fill-accent)", color: "var(--on-accent)", border: "none", fontSize: 13 }}>+ Ekle</button>
      </form>

      {confirmDelete && (
        <ConfirmDialog
          title="Müsaitliği sil"
          message={`${WEEKDAYS[confirmDelete.weekday - 1]} ${confirmDelete.startTime}-${confirmDelete.endTime} müsaitliği kaldırılacak. Bu geri alınamaz.`}
          onConfirm={() => { onDelete(confirmDelete.id); setConfirmDelete(null); }}
          onClose={() => setConfirmDelete(null)}
        />
      )}
    </div>
  );
}

// Bir kişinin bir günündeki vardiya pencerelerini düzenleyen küçük modal —
// StaffShiftGrid'deki bir hücreye tıklanınca açılır. Birden fazla pencere
// (öğle arası için iki ayrı aralık gibi) eklemeye izin verir, gün seçici
// yok çünkü hücrenin kendisi zaten günü belirliyor.
function StaffShiftDayEditor({ weekday, memberLabel, items, onAdd, onDelete, onSetOff, onClose }) {
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("18:00");
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [confirmOff, setConfirmOff] = useState(false);

  const offItem = items.find((s) => s.isOff);
  const sorted = [...items].filter((s) => !s.isOff).sort((a, b) => a.startTime.localeCompare(b.startTime));

  const submit = (e) => {
    e.preventDefault();
    if (!startTime || !endTime || endTime <= startTime) return;
    onAdd({ weekday, startTime, endTime });
  };

  return (
    <Modal title={`${memberLabel} - ${WEEKDAYS[weekday - 1]}`} onClose={onClose}>
      {offItem ? (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, background: "var(--bg-warning)", border: "0.5px solid var(--border)", borderRadius: "var(--radius)", padding: "8px 12px", marginBottom: 12 }}>
          <span style={{ fontSize: 13, fontWeight: 500 }}>Bu gün haftalık tatil olarak işaretli</span>
          <button type="button" onClick={() => onDelete(offItem.id)} style={{ fontSize: 12 }}>Tatili kaldır</button>
        </div>
      ) : (
        <>
          {sorted.length === 0 ? (
            <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 12 }}>Bu gün için vardiya tanımlanmadı.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 12 }}>
              {sorted.map((s) => (
                <div key={s.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, background: "var(--surface-1)", border: "0.5px solid var(--border)", borderRadius: "var(--radius)", padding: "8px 12px" }}>
                  <Badge tone="accent">{s.startTime}-{s.endTime}</Badge>
                  <IconButton icon="ti-trash" title="Sil" size="sm" onClick={() => setConfirmDelete(s)} />
                </div>
              ))}
            </div>
          )}

          <form onSubmit={submit} style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
            <div style={{ width: 110 }}>
              <label style={{ fontSize: 12, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Başlangıç</label>
              <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} style={{ width: "100%" }} />
            </div>
            <div style={{ width: 110 }}>
              <label style={{ fontSize: 12, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Bitiş</label>
              <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} style={{ width: "100%" }} />
            </div>
            <button type="submit" style={{ background: "var(--fill-accent)", color: "var(--on-accent)", border: "none" }}>+ Ekle</button>
          </form>
          <p style={{ fontSize: 11.5, color: "var(--text-muted)", margin: "10px 0 0" }}>
            Öğle arası gibi bir boşluk bırakmak isterseniz iki ayrı aralık ekleyin (ör. 09:00-12:00 ve 13:00-18:00).
          </p>
          <button type="button" onClick={() => setConfirmOff(true)} style={{ fontSize: 12, marginTop: 10 }}>
            Bu günü haftalık tatil olarak işaretle
          </button>
        </>
      )}

      {confirmDelete && (
        <ConfirmDialog
          title="Vardiyayı sil"
          message={`${confirmDelete.startTime}-${confirmDelete.endTime} vardiyası kaldırılacak. Bu geri alınamaz.`}
          onConfirm={() => { onDelete(confirmDelete.id); setConfirmDelete(null); }}
          onClose={() => setConfirmDelete(null)}
        />
      )}
      {confirmOff && (
        <ConfirmDialog
          title="Haftalık tatil olarak işaretle"
          message={sorted.length > 0
            ? `${WEEKDAYS[weekday - 1]} günü için tanımlı ${sorted.length} çalışma saati silinip bu gün haftalık tatil olarak işaretlenecek.`
            : `${WEEKDAYS[weekday - 1]} günü haftalık tatil olarak işaretlenecek.`}
          confirmLabel="İşaretle"
          onConfirm={() => { setConfirmOff(false); onSetOff(); }}
          onClose={() => setConfirmOff(false)}
        />
      )}
      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
        <button onClick={onClose}>Kapat</button>
      </div>
    </Modal>
  );
}

// Haftalık vardiya tablosu — satır=personel (sahip dahil), sütun=gün. Her
// hücre o kişi+günün vardiya penceresini (varsa) gösterir, tıklanınca
// StaffShiftDayEditor açılır. Hiç vardiya tanımlanmamış bir işletmede
// randevu slotları eskisi gibi sadece Müsaitlik Saatleri'ne göre hesaplanır —
// bu tablo boş kaldıkça mevcut davranış birebir korunur.
function StaffShiftGrid({ people, staffShifts, onAdd, onDelete, onSetOff, readOnly = false }) {
  const [editingCell, setEditingCell] = useState(null); // { memberId, weekday, label }

  return (
    <div style={{ overflowX: "auto" }}>
      <table className="responsive-table" style={{ width: "100%", minWidth: 520, borderCollapse: "separate", borderSpacing: "0 6px" }}>
        <thead>
          <tr>
            <th style={{ textAlign: "left", padding: "0 10px", fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.3 }}>Personel</th>
            {WEEKDAYS_SHORT.map((w) => (
              <th key={w} style={{ textAlign: "center", padding: "0 4px", fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.3 }}>{w}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {people.map((p) => (
            <tr key={p.id} style={{ background: "var(--surface-1)" }}>
              <td data-label="Personel" style={{ padding: "8px 10px", fontSize: 12.5, fontWeight: 500, borderRadius: "var(--radius) 0 0 var(--radius)", whiteSpace: "nowrap" }}>{p.label}</td>
              {WEEKDAYS.map((w, i) => {
                const weekday = i + 1;
                const dayShifts = staffShifts.filter((s) => s.memberId === p.id && s.weekday === weekday && isOpenStaffShift(s)).sort((a, b) => a.startTime.localeCompare(b.startTime));
                const isOff = dayShifts.some((s) => s.isOff);
                return (
                  <td
                    key={weekday}
                    data-label={w}
                    onClick={readOnly ? undefined : () => setEditingCell({ memberId: p.id, weekday, label: p.label })}
                    style={{ padding: "8px 4px", fontSize: 11, textAlign: "center", cursor: readOnly ? "default" : "pointer", color: isOff ? "var(--text-warning)" : dayShifts.length ? "var(--text-accent)" : "var(--text-muted)", fontWeight: isOff ? 600 : 400 }}
                  >
                    {isOff ? "Tatil" : dayShifts.length === 0 ? "-" : dayShifts.map((s) => `${s.startTime}-${s.endTime}`).join(", ")}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {!readOnly && editingCell && (
        <StaffShiftDayEditor
          weekday={editingCell.weekday}
          memberLabel={editingCell.label}
          items={staffShifts.filter((s) => s.memberId === editingCell.memberId && s.weekday === editingCell.weekday && isOpenStaffShift(s))}
          onAdd={(shift) => onAdd({ ...shift, memberId: editingCell.memberId })}
          onDelete={onDelete}
          onSetOff={() => onSetOff(editingCell.memberId, editingCell.weekday)}
          onClose={() => setEditingCell(null)}
        />
      )}
    </div>
  );
}

// "Geçen hafta Salı kim çalışıyordu" gibi bir soruya cevap - seçilen tarih
// aralığındaki HER GÜN için, o gün geçerliydi olan vardiya versiyonu (bkz.
// staffShiftsEffectiveOnDate) yeniden inşa edilip tabloda gösterilir. Bugünkü
// canlı StaffShiftGrid'in aksine tamamen salt okunur - geçmiş değiştirilemez.
// "YYYY-MM-DD" <-> Date dönüşümü BİLEREK toISOString/UTC KULLANMIYOR - saat
// dilimi UTC'nin ilerisindeyse (ör. Türkiye, UTC+3) `new Date(str+"T00:00:00").
// toISOString()` yerel gece yarısını UTC'ye çevirirken BİR GÜN GERİYE kayıyor
// (canlı testte "Pzt 27" yerine "Paz 26" görülerek bulundu). Bunun yerine
// getFullYear/Month/Date gibi hep YEREL saat diliminde çalışan getter'larla
// elle string kuruluyor, hiç UTC'ye geçilmiyor.
function staffHistoryDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function staffHistoryParseDateStr(s) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function StaffShiftHistoryModal({ people, staffShifts, onClose }) {
  const todayStr = staffHistoryDateStr(new Date());
  const mondayOfThisWeek = () => {
    const d = new Date();
    const jsWeekday = d.getDay();
    const iso = jsWeekday === 0 ? 7 : jsWeekday;
    d.setDate(d.getDate() - (iso - 1));
    return staffHistoryDateStr(d);
  };
  const [fromDate, setFromDate] = useState(mondayOfThisWeek());
  const [toDate, setToDate] = useState(todayStr);

  const MAX_RANGE_DAYS = 62;
  const rangeDayCount = fromDate && toDate && fromDate <= toDate
    ? Math.round((staffHistoryParseDateStr(toDate) - staffHistoryParseDateStr(fromDate)) / 86400000) + 1
    : 0;
  const dates = [];
  if (rangeDayCount > 0 && rangeDayCount <= MAX_RANGE_DAYS) {
    const cursor = staffHistoryParseDateStr(fromDate);
    for (let i = 0; i < rangeDayCount; i++) {
      dates.push(staffHistoryDateStr(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
  }

  const dayLabel = (dateStr) => {
    const d = staffHistoryParseDateStr(dateStr);
    const iso = d.getDay() === 0 ? 7 : d.getDay();
    return `${WEEKDAYS_SHORT[iso - 1]} ${d.getDate()}`;
  };

  return (
    <Modal title="Vardiya Geçmişi" onClose={onClose} wide>
      <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: "0 0 12px" }}>
        Bir tarih aralığı seçin - o dönemde kimin hangi gün ne çalıştığını (o günkü geçerli kurala göre) görün. Vardiya değişiklikleri geçmiş tarihleri etkilemez.
      </p>
      <div style={{ marginBottom: 12 }}>
        <DateRangeFilter from={fromDate} to={toDate} onFromChange={setFromDate} onToChange={setToDate} />
      </div>
      {rangeDayCount > MAX_RANGE_DAYS ? (
        <p style={{ fontSize: 13, color: "var(--text-danger)" }}>En fazla {MAX_RANGE_DAYS} günlük bir aralık seçebilirsiniz (yaklaşık 2 ay).</p>
      ) : dates.length === 0 ? (
        <p style={{ fontSize: 13, color: "var(--text-muted)" }}>Geçerli bir tarih aralığı seçin (başlangıç bitişten sonra olamaz).</p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", minWidth: dates.length * 68 + 130, borderCollapse: "separate", borderSpacing: "0 6px" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", padding: "0 10px", fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.3 }}>Personel</th>
                {dates.map((d) => (
                  <th key={d} style={{ textAlign: "center", padding: "0 4px", fontSize: 10.5, fontWeight: 600, color: "var(--text-muted)", whiteSpace: "nowrap" }}>{dayLabel(d)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {people.map((p) => (
                <tr key={p.id} style={{ background: "var(--surface-1)" }}>
                  <td style={{ padding: "8px 10px", fontSize: 12.5, fontWeight: 500, whiteSpace: "nowrap", borderRadius: "var(--radius) 0 0 var(--radius)" }}>{p.label}</td>
                  {dates.map((d) => {
                    const shifts = staffShiftsEffectiveOnDate(staffShifts, p.id, d);
                    const isOff = shifts.some((s) => s.isOff);
                    return (
                      <td
                        key={d}
                        style={{ padding: "8px 4px", fontSize: 10.5, textAlign: "center", whiteSpace: "nowrap", color: isOff ? "var(--text-warning)" : shifts.length ? "var(--text-accent)" : "var(--text-muted)", fontWeight: isOff ? 600 : 400 }}
                      >
                        {isOff ? "Tatil" : shifts.length === 0 ? "-" : shifts.map((s) => `${s.startTime}-${s.endTime}`).join(", ")}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
        <button onClick={onClose}>Kapat</button>
      </div>
    </Modal>
  );
}

function StaffLeaveRecordModal({ memberLabel, onSave, onClose }) {
  const [leaveType, setLeaveType] = useState("yillik");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [note, setNote] = useState("");

  const submit = (e) => {
    e.preventDefault();
    if (!startDate) return;
    onSave({ leaveType, startDate, endDate: endDate || startDate, note });
  };

  return (
    <Modal title={`${memberLabel} - İzin ekle`} onClose={onClose}>
      <form onSubmit={submit}>
        <div style={{ marginBottom: 10 }}>
          <label style={{ fontSize: 12, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>İzin türü</label>
          <select value={leaveType} onChange={(e) => setLeaveType(e.target.value)} style={{ width: "100%" }}>
            {Object.entries(STAFF_LEAVE_TYPE_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </div>
        <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 12, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Başlangıç</label>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} style={{ width: "100%" }} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 12, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Bitiş</label>
            <input type="date" value={endDate} min={startDate || undefined} onChange={(e) => setEndDate(e.target.value)} placeholder={startDate} style={{ width: "100%" }} />
          </div>
        </div>
        <div style={{ marginBottom: 10 }}>
          <label style={{ fontSize: 12, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Not <span style={{ fontWeight: 400, color: "var(--text-muted)" }}>(opsiyonel)</span></label>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Örn. göz muayenesi" style={{ width: "100%" }} />
        </div>
        <p style={{ fontSize: 11.5, color: "var(--text-muted)", margin: "0 0 12px" }}>Bitiş tarihi boş bırakılırsa tek gün olarak kaydedilir.</p>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button type="button" onClick={onClose}>Vazgeç</button>
          <button type="submit" style={{ background: "var(--fill-accent)", color: "var(--on-accent)", border: "none" }}>Ekle</button>
        </div>
      </form>
    </Modal>
  );
}

// Kişi başına yıllık izin bakiyesi (elle girilen, sürekli takip edilen - otomatik
// yıl başı sıfırlaması yok, bkz. sql/2026-08-02_staff_leave_system.sql) + izin
// kayıtları (yıllık/ücretsiz/raporlu/mazeret/diğer). Sadece "yillik" tipi
// bakiyeden düşülür - istemci tarafında hesaplanıyor, sunucuda ayrı bir "kalan
// gün" kolonu yok (tek doğruluk kaynağı: kayıtların toplamı).
function StaffLeaveManager({ people, balances, records, onSetBalance, onAddRecord, onDeleteRecord, readOnly = false }) {
  const [addingFor, setAddingFor] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {people.map((p) => {
        const balance = balances.find((b) => b.memberId === p.id)?.annualLeaveDays ?? 14;
        const personRecords = records.filter((r) => r.memberId === p.id).sort((a, b) => b.startDate.localeCompare(a.startDate));
        const usedAnnual = personRecords.filter((r) => r.leaveType === "yillik").reduce((sum, r) => sum + staffLeaveDayCount(r.startDate, r.endDate), 0);
        const remaining = balance - usedAnnual;
        return (
          <div key={p.id} style={{ background: "var(--surface-1)", border: "0.5px solid var(--border)", borderRadius: "var(--radius)", padding: "8px 12px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 500 }}>{p.label}</span>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                {readOnly ? (
                  <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>Yıllık izin hakkı: {balance} gün</span>
                ) : (
                  <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <label style={{ fontSize: 11, color: "var(--text-muted)" }}>Yıllık izin hakkı</label>
                    <input
                      type="number" min="0" step="0.5" defaultValue={balance}
                      onBlur={(e) => {
                        const v = e.target.value === "" ? 0 : Number(e.target.value);
                        if (v !== balance) onSetBalance(p.id, v);
                      }}
                      style={{ width: 60, fontSize: 12, padding: "2px 6px" }}
                    />
                  </span>
                )}
                <Badge tone={remaining < 0 ? "danger" : "accent"}>{usedAnnual} kullanıldı, {remaining} kaldı</Badge>
                {!readOnly && <button type="button" onClick={() => setAddingFor(p)} style={{ fontSize: 12 }}>+ İzin ekle</button>}
              </div>
            </div>
            {personRecords.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 8 }}>
                {personRecords.map((r) => (
                  <div key={r.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, fontSize: 12, padding: "4px 0", borderTop: "0.5px solid var(--border)" }}>
                    <span>
                      <Badge tone="default">{STAFF_LEAVE_TYPE_LABELS[r.leaveType]}</Badge>{" "}
                      {formatLeaveDateRange(r.startDate, r.endDate)} · {staffLeaveDayCount(r.startDate, r.endDate)} gün
                      {r.note && <span style={{ color: "var(--text-muted)" }}> — {r.note}</span>}
                    </span>
                    {!readOnly && <IconButton icon="ti-trash" title="Sil" size="sm" onClick={() => setConfirmDelete(r)} />}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}

      {addingFor && (
        <StaffLeaveRecordModal
          memberLabel={addingFor.label}
          onClose={() => setAddingFor(null)}
          onSave={(payload) => { onAddRecord({ memberId: addingFor.id, ...payload }); setAddingFor(null); }}
        />
      )}
      {confirmDelete && (
        <ConfirmDialog
          title="İzin kaydını sil"
          message={`${STAFF_LEAVE_TYPE_LABELS[confirmDelete.leaveType]} kaydı (${formatLeaveDateRange(confirmDelete.startDate, confirmDelete.endDate)}) silinecek. Bu geri alınamaz.`}
          onConfirm={() => { onDeleteRecord(confirmDelete.id); setConfirmDelete(null); }}
          onClose={() => setConfirmDelete(null)}
        />
      )}
    </div>
  );
}

// Otel gibi "randevu saati" değil "oda stoku" mantığıyla çalışan sektörler için —
// Müsaitlik Saatleri'ndeki gün/saat/slot modeli buraya uymuyor (bkz. bookingModel,
// Sectors.jsx): burada müsaitlik bir GÜN/SAAT slotu değil, bir TARİH ARALIĞINDA
// kaç aynı tipte oda boş olduğudur. Oda tipi listesi serbest metin değil, "Sektör &
// Özel Alanlar"daki aktif "oda_tipi" seçenekli alanının kendi seçeneklerinden
// geliyor — böylece iki ayrı yerde oda tipi listesi bakımı gerekmiyor.
function RoomInventoryEditModal({ item, onSave, onClose }) {
  const [quantity, setQuantity] = useState(item.quantity);
  const [capacity, setCapacity] = useState(item.capacity ? String(item.capacity) : "");
  const [description, setDescription] = useState(item.description || "");

  const submit = (e) => {
    e.preventDefault();
    if (Number(quantity) < 1) return;
    onSave({ quantity: Number(quantity), capacity: capacity ? Number(capacity) : null, description: description.trim() });
  };

  return (
    <Modal title="Oda tipini düzenle" onClose={onClose}>
      <form onSubmit={submit}>
        <div style={{ marginBottom: 10 }}>
          <label style={{ fontSize: 12, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Oda Tipi</label>
          <select value={item.roomType} disabled style={{ width: "100%" }}>
            <option value={item.roomType}>{item.roomType}</option>
          </select>
        </div>
        <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 12, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Adet</label>
            <input type="number" min="1" value={quantity} onChange={(e) => setQuantity(e.target.value)} style={{ width: "100%" }} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 12, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Kapasite <span style={{ fontWeight: 400, color: "var(--text-muted)" }}>(kişi)</span></label>
            <input type="number" min="1" value={capacity} onChange={(e) => setCapacity(e.target.value)} placeholder="2" style={{ width: "100%" }} />
          </div>
        </div>
        <div style={{ marginBottom: 10 }}>
          <label style={{ fontSize: 12, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Açıklama <span style={{ fontWeight: 400, color: "var(--text-muted)" }}>(opsiyonel)</span></label>
          <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Kahvaltı dahil, klima, WiFi..." style={{ width: "100%" }} />
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button type="button" onClick={onClose}>Vazgeç</button>
          <button type="submit" style={{ background: "var(--fill-accent)", color: "var(--on-accent)", border: "none" }}>Güncelle</button>
        </div>
      </form>
    </Modal>
  );
}

function ResourceManager({ items, onAdd, onUpdate, onDelete }) {
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [confirmDelete, setConfirmDelete] = useState(null);

  const submit = (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    onAdd({ name, quantity });
    setName("");
    setQuantity(1);
  };

  return (
    <div>
      <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: "0 0 16px", display: "flex", alignItems: "center", gap: 4 }}>
        Randevu sırasında seçilebilecek cihaz/oda listesi (örn. "Lazer Cihazı", "Oda 2")
        <InfoTip placement="bottom" align="right" text="Bir kaynak tanımlarsanız teklif/randevu formunda seçilebilir hale gelir ve aynı kaynağa aynı saatte adedi dolduran sayıda ikinci bir randevu girilmesi engellenir. Adet 1'den fazlaysa (örn. aynı isimde 2 cihaz), hangi fiziksel birimin kullanıldığını ayrıca belirtmeniz gerekmez - sistem sadece o an kaçının dolu olduğunu sayar. Hiç kaynak tanımlamazsanız bu alan hiç görünmez, mevcut davranışınız değişmez." />
      </p>
      {items.length === 0 ? (
        <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 16 }}>Henüz kaynak eklenmedi.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 16 }}>
          {items.map((r) => (
            <div key={r.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, background: "var(--surface-1)", border: "0.5px solid var(--border)", borderRadius: "var(--radius)", padding: "8px 12px" }}>
              <span style={{ fontSize: 13, fontWeight: 500 }}>{r.name}</span>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <label style={{ fontSize: 11, color: "var(--text-muted)" }}>Adet</label>
                  <input
                    type="number" min="1" step="1"
                    defaultValue={r.quantity}
                    onBlur={(e) => {
                      const v = Math.max(1, Number(e.target.value) || 1);
                      if (v !== r.quantity) onUpdate({ id: r.id, quantity: v });
                    }}
                    style={{ width: 50, fontSize: 12, padding: "2px 6px" }}
                  />
                </span>
                <IconButton icon="ti-trash" title="Sil" size="sm" onClick={() => setConfirmDelete(r)} />
              </div>
            </div>
          ))}
        </div>
      )}
      <form onSubmit={submit} style={{ display: "flex", gap: 6, alignItems: "flex-end" }}>
        <div style={{ flex: 1 }}>
          <label style={{ fontSize: 11, color: "var(--text-muted)", display: "block", marginBottom: 2 }}>İsim</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Örn. Lazer Cihazı" style={{ width: "100%" }} />
        </div>
        <div style={{ width: 60 }}>
          <label style={{ fontSize: 11, color: "var(--text-muted)", display: "block", marginBottom: 2 }}>Adet</label>
          <input type="number" min="1" step="1" value={quantity} onChange={(e) => setQuantity(e.target.value)} style={{ width: "100%" }} />
        </div>
        <button type="submit" disabled={!name.trim()}>+ Ekle</button>
      </form>
      {confirmDelete && (
        <ConfirmDialog
          title="Kaynak silinsin mi?"
          message={`"${confirmDelete.name}" silinirse geçmiş randevulardaki kaydı kalır, sadece yeni seçim listesinden kalkar.`}
          onConfirm={() => { onDelete(confirmDelete.id); setConfirmDelete(null); }}
          onClose={() => setConfirmDelete(null)}
        />
      )}
    </div>
  );
}

function RoomInventoryManager({ items, roomTypeOptions, onAdd, onUpdate, onDelete }) {
  const [roomType, setRoomType] = useState(roomTypeOptions[0] || "");
  const [quantity, setQuantity] = useState(1);
  const [capacity, setCapacity] = useState("");
  const [description, setDescription] = useState("");
  const [editingItem, setEditingItem] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);

  const availableOptions = roomTypeOptions.filter((o) => !items.some((i) => i.roomType === o));

  // Bir oda tipi eklenince o tip availableOptions'tan düşüyor, ama seçim
  // kutusunun kendi state'i (roomType) buna göre otomatik güncellenmiyordu —
  // eski (artık listede olmayan) değerde takılı kalabiliyordu. Kullanıcı fark
  // etmeden tekrar "+ Ekle"ye basarsa aynı oda tipi ikinci kez eklenmeye
  // çalışılıp veritabanı "mükerrer kayıt" hatası veriyordu. Seçili değer
  // artık mevcut listede yoksa otomatik olarak ilk müsait seçeneğe döner.
  useEffect(() => {
    if (roomType && !availableOptions.includes(roomType)) {
      setRoomType(availableOptions[0] || "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [availableOptions.join("|")]);

  const submit = (e) => {
    e.preventDefault();
    if (Number(quantity) < 1) return;
    if (!roomType || !availableOptions.includes(roomType)) return;
    onAdd({ roomType, quantity: Number(quantity), capacity: capacity ? Number(capacity) : null, description: description.trim() });
    setQuantity(1);
    setCapacity("");
    setDescription("");
  };

  return (
    <div>
      <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: "0 0 16px", display: "flex", alignItems: "center", gap: 4 }}>
        Her oda tipinden kaç adet olduğunu, kaç kişilik olduğunu ve varsa açıklamasını belirleyin
        <InfoTip placement="bottom" align="right" text={`Adet: bu tipte kaç oda varsa, seçilen giriş/çıkış tarihi aralığında zaten o kadar rezervasyon oluşmuşsa müşteri portalı "müsait değil" gösterir. Kapasite ve açıklama rezervasyon sırasında misafire gösterilir. Oda tipi seçenekleri Sektör & Özel Alanlar'daki "Oda Tipi" alanından geliyor.`} />
      </p>

      {items.length === 0 ? (
        <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 16 }}>Henüz oda tipi eklenmedi - eklenene kadar müşteri portalından rezervasyon alınamaz.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 16 }}>
          {items.map((r) => (
            <div key={r.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, background: "var(--surface-1)", border: "0.5px solid var(--border)", borderRadius: "var(--radius)", padding: "8px 12px" }}>
              <div style={{ minWidth: 0 }}>
                <span style={{ fontSize: 13, fontWeight: 500 }}>{r.roomType}</span>
                {r.description && <p style={{ margin: "2px 0 0", fontSize: 12, color: "var(--text-secondary)" }}>{r.description}</p>}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                <Badge tone="accent">{r.quantity} adet{r.capacity ? ` · ${r.capacity} kişilik` : ""}</Badge>
                <IconButton icon="ti-edit" title="Düzenle" size="sm" onClick={() => setEditingItem(r)} />
                <IconButton icon="ti-trash" title="Sil" size="sm" onClick={() => setConfirmDelete(r)} />
              </div>
            </div>
          ))}
        </div>
      )}

      {availableOptions.length === 0 ? (
        <p style={{ fontSize: 12, color: "var(--text-muted)" }}>
          {roomTypeOptions.length === 0
            ? 'Önce Sektör & Özel Alanlar\'da "Oda Tipi" alanına en az bir seçenek eklemelisiniz.'
            : "Tanımlı tüm oda tipleri zaten eklendi."}
        </p>
      ) : (
        <>
          <p style={{ fontSize: 13, fontWeight: 500, margin: "0 0 8px" }}>Yeni oda tipi ekle</p>
          <form onSubmit={submit} style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "flex-end" }}>
            <div style={{ minWidth: 160 }}>
              <label style={{ fontSize: 12, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Oda Tipi</label>
              <select value={roomType} onChange={(e) => setRoomType(e.target.value)} style={{ fontSize: 13, width: "100%" }}>
                {availableOptions.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
            <div style={{ width: 80 }}>
              <label style={{ fontSize: 12, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Adet</label>
              <input type="number" min="1" value={quantity} onChange={(e) => setQuantity(e.target.value)} style={{ fontSize: 13, width: "100%" }} />
            </div>
            <div style={{ width: 100 }}>
              <label style={{ fontSize: 12, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Kapasite <span style={{ fontWeight: 400, color: "var(--text-muted)" }}>(kişi)</span></label>
              <input type="number" min="1" value={capacity} onChange={(e) => setCapacity(e.target.value)} placeholder="2" style={{ fontSize: 13, width: "100%" }} />
            </div>
            <div style={{ flex: 1, minWidth: 180 }}>
              <label style={{ fontSize: 12, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Açıklama <span style={{ fontWeight: 400, color: "var(--text-muted)" }}>(opsiyonel)</span></label>
              <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Kahvaltı dahil, klima, WiFi..." style={{ fontSize: 13, width: "100%" }} />
            </div>
            <button type="submit" style={{ background: "var(--fill-accent)", color: "var(--on-accent)", border: "none", fontSize: 13 }}>
              + Ekle
            </button>
          </form>
        </>
      )}

      {confirmDelete && (
        <ConfirmDialog
          title="Oda tipini sil"
          message={`"${confirmDelete.roomType}" kaldırılacak. Bu geri alınamaz.`}
          onConfirm={() => { onDelete(confirmDelete.id); setConfirmDelete(null); }}
          onClose={() => setConfirmDelete(null)}
        />
      )}

      {editingItem && (
        <RoomInventoryEditModal
          item={editingItem}
          onClose={() => setEditingItem(null)}
          onSave={(payload) => { onUpdate({ id: editingItem.id, ...payload }); setEditingItem(null); }}
        />
      )}
    </div>
  );
}

// staff_shifts (vardiya) ve deals.assigned_to (KOBİ'nin elle atadığı "Sorumlu")
// arasında zaten mevcut olan bağı (aynı member_id) kullanarak "bugün kim ne
// kadar dolu" görünümü. Yeni bir tablo/kolon YOK. Herkese açık widget'tan veya
// müşteri portalından kendi kendine alınan randevularda assigned_to hiç set
// edilmediği için (bkz. api/lead-capture.js, CustomerPortal.jsx bookAppointment)
// bunlar "Atanmamış" altında toplanır - personel seçimi müşteri tarafına henüz
// eklenmedi (appointment-availability.js'teki mevcut yorum bunu bilinçli olarak
// ertelemişti).
function TeamDailyLoadPanel({ members, staffShifts, deals, customers, customFieldDefs, sessionUserId }) {
  const dateTimeKey = customFieldDefs.find((d) => d.entity === "deal" && d.type === "datetime" && d.active)?.key;
  if (!dateTimeKey) return null;

  // toISOString (UTC) DEĞİL - Türkiye gibi UTC'nin ilerisindeki saat dilimlerinde
  // gece yarısına yakın "bugün" bir gün geriye kayabiliyordu (bkz.
  // staffHistoryDateStr yorumu, aynı sınıf hata).
  const todayStr = staffHistoryDateStr(new Date());

  const todayDeals = deals.filter((d) => {
    const raw = d.customFields?.[dateTimeKey];
    return raw && raw.startsWith(todayStr) && d.stage !== "kaybedildi";
  });
  if (todayDeals.length === 0) return null;

  const people = [{ id: sessionUserId, label: "Ben" }, ...members.map((m) => ({ id: m.member_id, label: m.name || m.email }))];
  const dealsByAssignee = {};
  const unassigned = [];
  for (const d of todayDeals) {
    if (d.assignedTo) (dealsByAssignee[d.assignedTo] ||= []).push(d);
    else unassigned.push(d);
  }
  const customerName = (id) => customers.find((c) => c.id === id)?.name || "Bilinmeyen müşteri";
  const timeOf = (d) => (d.customFields?.[dateTimeKey] || "").slice(11, 16);
  const sortByTime = (list) => [...list].sort((a, b) => timeOf(a).localeCompare(timeOf(b)));

  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ fontSize: 13, color: "var(--text-secondary)", display: "block", marginBottom: 6 }}>
        Bugünün Doluluğu <InfoTip placement="bottom" text="Bugüne ait randevular, her randevunun 'Sorumlu' alanına göre gruplanır. Herkese açık randevu linkinden veya müşteri portalından gelen randevularda henüz kimse atanmamışsa 'Atanmamış' altında görünür." />
      </label>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {people.map((p) => {
          const dayShifts = staffShiftsEffectiveOnDate(staffShifts, p.id, todayStr).sort((a, b) => a.startTime.localeCompare(b.startTime));
          const isOff = dayShifts.some((s) => s.isOff);
          const list = dealsByAssignee[p.id] || [];
          return (
            <div key={p.id} style={{ background: "var(--surface-1)", border: "0.5px solid var(--border)", borderRadius: "var(--radius)", padding: "8px 12px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, fontWeight: 500, flexWrap: "wrap", gap: 6 }}>
                <span>{p.label}</span>
                <span style={{ color: isOff ? "var(--text-warning)" : "var(--text-muted)", fontWeight: isOff ? 600 : 400 }}>
                  {isOff ? "Bugün tatil" : dayShifts.length ? dayShifts.map((s) => `${s.startTime}-${s.endTime}`).join(", ") : "Bugün vardiyası yok"}
                </span>
              </div>
              {list.length === 0 ? (
                <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "4px 0 0" }}>Bugüne atanmış randevusu yok.</p>
              ) : (
                <ul style={{ margin: "4px 0 0", paddingLeft: 16, fontSize: 12 }}>
                  {sortByTime(list).map((d) => (
                    <li key={d.id}>{timeOf(d)} - {customerName(d.customerId)} ({d.title})</li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
        {unassigned.length > 0 && (
          <div style={{ background: "var(--surface-1)", border: "0.5px dashed var(--border)", borderRadius: "var(--radius)", padding: "8px 12px" }}>
            <p style={{ fontSize: 13, fontWeight: 500, margin: 0, color: "var(--text-warning)" }}>Atanmamış ({unassigned.length})</p>
            <ul style={{ margin: "4px 0 0", paddingLeft: 16, fontSize: 12 }}>
              {sortByTime(unassigned).map((d) => (
                <li key={d.id}>{timeOf(d)} - {customerName(d.customerId)} ({d.title})</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

// [[project_binerly_business_goal]]: fiyatlandırma "5 kullanıcıya kadar sabit ücret" üzerine
// kurulu - işletme sahibi + kabul edilmiş üyeler + bekleyen davetler toplamı bu sayıyı geçemez
// (davet gönderirken koltuk ayrılır, kabul anında sürpriz reddedilme olmasın diye).
function TeamModal({
  session, activeTeamId, companySettings, onClose, notify,
  staffShifts, onAddStaffShift, onDeleteStaffShift, onSetStaffShiftDayOff,
  staffLeaveBalances, staffLeaveRecords, onSetStaffLeaveBalance, onAddStaffLeaveRecord, onDeleteStaffLeaveRecord,
  teamRoster, deals, customers, customFieldDefs,
}) {
  const isOwner = activeTeamId === session.user.id;
  const [members, setMembers] = useState([]);
  const [invites, setInvites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [inviteEmail, setInviteEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [confirmRemoveMember, setConfirmRemoveMember] = useState(null);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [showShiftHistory, setShowShiftHistory] = useState(false);
  const [teamTab, setTeamTab] = useState("vardiya");

  const load = async () => {
    setLoading(true);
    if (isOwner) {
      const [{ data: m }, { data: inv }] = await Promise.all([
        supabase.from("team_members").select("*").eq("team_id", activeTeamId).order("joined_at"),
        supabase.from("team_invites").select("*").eq("owner_id", activeTeamId).eq("status", "pending").order("created_at"),
      ]);
      setMembers(m || []);
      setInvites(inv || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const occupiedSeats = 1 + members.length + invites.length; // 1 = işletme sahibi
  const atTeamLimit = occupiedSeats >= MAX_TEAM_SIZE;

  const sendInvite = async (e) => {
    e.preventDefault();
    const email = inviteEmail.trim().toLowerCase();
    if (!email) return;
    if (atTeamLimit) {
      notify(`En fazla ${MAX_TEAM_SIZE} kullanıcı sınırına ulaştınız. Daha fazlası için info@binerly.com adresinden bize ulaşın.`);
      return;
    }
    setSending(true);
    const { error } = await supabase.from("team_invites").insert({ owner_id: activeTeamId, email });
    if (error) {
      notify(`Davet gönderilemedi: ${error.message}`);
      setSending(false);
      return;
    }
    try {
      await fetch("/api/send-campaign", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({
          recipients: [email],
          subject: `${companySettings?.companyName || "Binerly"} sizi takımına davet etti`,
          message: `Merhaba,\n\n${companySettings?.companyName || "Bir işletme"} sizi Binerly hesabına takım üyesi olarak davet etti. binerly.com adresine bu e-posta ile giriş yaparak (veya kayıt olarak) daveti kabul edebilirsiniz.\n\nBinerly`,
          replyTo: session.user.email,
          companyName: companySettings?.companyName,
        }),
      });
    } catch {
      // E-posta gönderimi başarısız olsa bile davet kaydı geçerli — kullanıcı giriş yaptığında bekleyen daveti görecek.
    }
    setInviteEmail("");
    setSending(false);
    load();
  };

  const cancelInvite = async (id) => {
    const { error } = await supabase.from("team_invites").update({ status: "revoked" }).eq("id", id);
    if (error) { notify(`Davet iptal edilemedi: ${error.message}`); return; }
    load();
  };

  const removeMember = async (memberId) => {
    const { error } = await supabase.from("team_members").delete().eq("member_id", memberId);
    if (error) { notify(`Üye kaldırılamadı: ${error.message}`); return; }
    load();
  };

  const toggleEditSettings = async (memberId, value) => {
    const { error } = await supabase.from("team_members").update({ can_edit_settings: value }).eq("member_id", memberId);
    if (error) { notify(`Yetki güncellenemedi: ${error.message}`); return; }
    setMembers((prev) => prev.map((m) => (m.member_id === memberId ? { ...m, can_edit_settings: value } : m)));
  };

  const updateCommission = async (memberId, { commission_percent, chair_rental_fee }) => {
    const { error } = await supabase.from("team_members").update({ commission_percent, chair_rental_fee }).eq("member_id", memberId);
    if (error) { notify(`Prim bilgisi güncellenemedi: ${error.message}`); return; }
    setMembers((prev) => prev.map((m) => (m.member_id === memberId ? { ...m, commission_percent, chair_rental_fee } : m)));
    // onBlur ile sessizce kaydediyordu - bir "Kaydet" butonu olmadigi icin
    // kullanicinin degisikligin gercekten islendigini gorecegi tek an burasi.
    notify("Prim bilgisi kaydedildi.", "success");
  };

  const leaveTeam = async () => {
    const { error } = await supabase.from("team_members").delete().eq("member_id", session.user.id);
    if (error) { notify(`Takımdan ayrılınamadı: ${error.message}`); return; }
    window.location.reload();
  };

  if (!isOwner) {
    const ownerLabel = companySettings?.companyName ? `${companySettings.companyName} (İşletme Sahibi)` : "İşletme Sahibi";
    const readOnlyPeople = [
      { id: session.user.id, label: "Ben" },
      { id: activeTeamId, label: ownerLabel },
      ...(teamRoster || []).filter((m) => m.id !== session.user.id).map((m) => ({ id: m.id, label: m.name || m.email })),
    ];
    return (
      <Modal title="Takım" onClose={onClose}>
        <p style={{ fontSize: 13, color: "var(--text-secondary)" }}>
          Bu hesap <strong>{companySettings?.companyName || "bir işletme"}</strong> takımının bir üyesi. Tüm müşteri, teklif ve destek verisi bu takımla paylaşılıyor.
        </p>
        <div style={{ display: "flex", gap: 4, background: "var(--surface-1)", borderRadius: "var(--radius)", padding: 3, margin: "16px 0", flexWrap: "wrap" }}>
          {[["vardiya", "Vardiya"], ["izinler", "İzinlerim"]].map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTeamTab(id)}
              style={{ border: "none", background: teamTab === id ? "var(--fill-accent)" : "transparent", color: teamTab === id ? "var(--on-accent)" : "var(--text-secondary)", fontWeight: teamTab === id ? 600 : 400, fontSize: 13 }}
            >
              {label}
            </button>
          ))}
        </div>
        {teamTab === "vardiya" ? (
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 13, color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
              Vardiya <InfoTip placement="bottom" text="Sadece görüntüleme — vardiyayı düzenlemek için işletme sahibiyle konuşun." />
              <button type="button" onClick={() => setShowShiftHistory(true)} style={{ fontSize: 11.5, padding: "2px 8px", marginLeft: "auto" }}>Geçmiş</button>
            </label>
            <StaffShiftGrid people={readOnlyPeople} staffShifts={staffShifts} readOnly />
          </div>
        ) : (
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 13, color: "var(--text-secondary)", display: "block", marginBottom: 6 }}>
              İzinlerim <InfoTip placement="bottom" text="Sadece kendi izin hakkınızı/kayıtlarınızı görürsünüz - başka üyelerin izin bilgisi size açık değil. Yeni izin talebi için işletme sahibiyle konuşun." />
            </label>
            <StaffLeaveManager
              people={[{ id: session.user.id, label: "Ben" }]}
              balances={staffLeaveBalances}
              records={staffLeaveRecords}
              readOnly
            />
          </div>
        )}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
          <button onClick={onClose}>Kapat</button>
          <button onClick={() => setConfirmLeave(true)} style={{ color: "var(--text-danger)" }}>Takımdan ayrıl</button>
        </div>
        {showShiftHistory && (
          <StaffShiftHistoryModal people={readOnlyPeople} staffShifts={staffShifts} onClose={() => setShowShiftHistory(false)} />
        )}
        {confirmLeave && (
          <ConfirmDialog
            title="Takımdan ayrılınsın mı?"
            message="Bu takımın müşteri/teklif/destek verilerine erişiminiz kalmaz - tekrar erişmek için yeniden davet edilmeniz gerekir."
            onConfirm={() => { setConfirmLeave(false); leaveTeam(); }}
            onClose={() => setConfirmLeave(false)}
          />
        )}
      </Modal>
    );
  }

  const staffPeople = [
    { id: session.user.id, label: "Ben" },
    ...members.map((m) => ({ id: m.member_id, label: m.name || m.email })),
  ];

  return (
    <Modal title="Takım" onClose={onClose} wide>
      {loading ? (
        <p style={{ fontSize: 13, color: "var(--text-secondary)" }}>Yükleniyor…</p>
      ) : (
        <>
          <div style={{ display: "flex", gap: 4, background: "var(--surface-1)", borderRadius: "var(--radius)", padding: 3, marginBottom: 16, flexWrap: "wrap" }}>
            {[["vardiya", "Vardiya"], ["izinler", "İzinler"], ["uyeler", `Üyeler (${occupiedSeats}/${MAX_TEAM_SIZE})`]].map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setTeamTab(id)}
                style={{ border: "none", background: teamTab === id ? "var(--fill-accent)" : "transparent", color: teamTab === id ? "var(--on-accent)" : "var(--text-secondary)", fontWeight: teamTab === id ? 600 : 400, fontSize: 13 }}
              >
                {label}
              </button>
            ))}
          </div>
          {teamTab === "vardiya" ? (
            <>
              <div style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 13, color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                  Vardiya <InfoTip placement="bottom" text="Bu sadece ekip içi bir planlama görünümü — müşteri portalındaki randevu saatlerini etkilemez, orada tek geçerli olan Müsaitlik Saatleri'dir. Bir hücreye tıklayıp o günün saatini ekleyin/düzenleyin." />
                  <button type="button" onClick={() => setShowShiftHistory(true)} style={{ fontSize: 11.5, padding: "2px 8px", marginLeft: "auto" }}>Geçmiş</button>
                </label>
                <StaffShiftGrid
                  people={staffPeople}
                  staffShifts={staffShifts}
                  onAdd={onAddStaffShift}
                  onDelete={onDeleteStaffShift}
                  onSetOff={onSetStaffShiftDayOff}
                />
              </div>
              {showShiftHistory && (
                <StaffShiftHistoryModal people={staffPeople} staffShifts={staffShifts} onClose={() => setShowShiftHistory(false)} />
              )}
              <TeamDailyLoadPanel members={members} staffShifts={staffShifts} deals={deals} customers={customers} customFieldDefs={customFieldDefs} sessionUserId={session.user.id} />
            </>
          ) : teamTab === "izinler" ? (
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 13, color: "var(--text-secondary)", display: "block", marginBottom: 6 }}>
                İzinler <InfoTip placement="bottom" text="Yıllık izin hakkını kişi başına elle belirleyin - kullanılan izinler bu bakiyeden düşülür, sürekli/manuel takip edilir (otomatik yıl başı sıfırlaması yok). Ücretsiz/raporlu/mazeret izinleri de kaydedilir ama bakiyeyi etkilemez." />
              </label>
              <StaffLeaveManager
                people={staffPeople}
                balances={staffLeaveBalances}
                records={staffLeaveRecords}
                onSetBalance={onSetStaffLeaveBalance}
                onAddRecord={onAddStaffLeaveRecord}
                onDeleteRecord={onDeleteStaffLeaveRecord}
              />
            </div>
          ) : (
            <>
              <div style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 13, color: "var(--text-secondary)", display: "block", marginBottom: 6 }}>
                  Üyeler <span style={{ color: "var(--text-muted)", fontWeight: 400 }}>({occupiedSeats}/{MAX_TEAM_SIZE})</span>
                </label>
                {members.length === 0 ? (
                  <p style={{ fontSize: 13, color: "var(--text-muted)" }}>Henüz takım üyesi yok.</p>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {members.map((m) => (
                      <div key={m.member_id} style={{ background: "var(--surface-1)", border: "0.5px solid var(--border)", borderRadius: "var(--radius)", padding: "8px 12px" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                          <span style={{ fontSize: 13, fontWeight: 500 }}>{m.name || m.email}</span>
                          <IconButton icon="ti-trash" title="Kaldır" size="sm" onClick={() => setConfirmRemoveMember(m)} />
                        </div>
                        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--text-secondary)", marginTop: 4, cursor: "pointer" }}>
                          <input
                            type="checkbox"
                            checked={!!m.can_edit_settings}
                            onChange={(e) => toggleEditSettings(m.member_id, e.target.checked)}
                          />
                          İşletme/sektör ayarlarını düzenleyebilir
                        </label>
                        <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 6, flexWrap: "wrap" }}>
                          <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                            <label style={{ fontSize: 11, color: "var(--text-muted)" }}>Prim %</label>
                            <input
                              type="number" min="0" max="100" step="0.1"
                              defaultValue={m.commission_percent ?? ""}
                              onBlur={(e) => updateCommission(m.member_id, { commission_percent: e.target.value === "" ? null : Number(e.target.value), chair_rental_fee: m.chair_rental_fee ?? null })}
                              placeholder="-"
                              style={{ width: 60, fontSize: 12, padding: "2px 6px" }}
                            />
                          </span>
                          <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                            <label style={{ fontSize: 11, color: "var(--text-muted)" }}>Koltuk kirası (aylık, TL)</label>
                            <input
                              type="number" min="0" step="1"
                              defaultValue={m.chair_rental_fee ?? ""}
                              onBlur={(e) => updateCommission(m.member_id, { commission_percent: m.commission_percent ?? null, chair_rental_fee: e.target.value === "" ? null : Number(e.target.value) })}
                              placeholder="-"
                              style={{ width: 80, fontSize: 12, padding: "2px 6px" }}
                            />
                          </span>
                          <InfoTip placement="bottom" align="right" text="Prim/koltuk kirası girerseniz Pano'daki Personel Performansı kartında bu üyenin net hakedişi otomatik hesaplanır. İkisi de opsiyonel." />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              {confirmRemoveMember && (
                <ConfirmDialog
                  title="Üye kaldırılsın mı?"
                  message={`${confirmRemoveMember.name || confirmRemoveMember.email}, bu takımın müşteri/teklif/destek verilerine erişimini kaybeder.`}
                  onConfirm={() => { const id = confirmRemoveMember.member_id; setConfirmRemoveMember(null); removeMember(id); }}
                  onClose={() => setConfirmRemoveMember(null)}
                />
              )}
              {invites.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <label style={{ fontSize: 13, color: "var(--text-secondary)", display: "block", marginBottom: 6 }}>Bekleyen davetler</label>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {invites.map((inv) => (
                      <div key={inv.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, background: "var(--surface-1)", border: "0.5px solid var(--border)", borderRadius: "var(--radius)", padding: "8px 12px" }}>
                        <span style={{ fontSize: 13, fontWeight: 500 }}>{inv.email}</span>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                          <Badge tone="warning">Bekliyor</Badge>
                          <IconButton icon="ti-x" title="İptal et" size="sm" onClick={() => cancelInvite(inv.id)} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {atTeamLimit ? (
                <div style={{ background: "var(--bg-warning)", border: "0.5px solid var(--border)", borderRadius: "var(--radius)", padding: "10px 12px" }}>
                  <p style={{ fontSize: 13, margin: 0, color: "var(--text-primary)" }}>
                    {MAX_TEAM_SIZE} kullanıcı sınırına ulaştınız (işletme sahibi + üyeler + bekleyen davetler). Daha fazla kullanıcı için{" "}
                    <a href="mailto:info@binerly.com?subject=Ek%20kullan%C4%B1c%C4%B1%20talebi">info@binerly.com</a> adresinden bize ulaşın.
                  </p>
                </div>
              ) : (
                <form onSubmit={sendInvite}>
                  <label style={{ fontSize: 13, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>E-posta ile davet et</label>
                  <div style={{ display: "flex", gap: 8 }}>
                    <input
                      type="email"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      placeholder="ornek@sirket.com"
                      required
                      style={{ flex: 1 }}
                    />
                    <button type="submit" disabled={sending} style={{ background: "var(--fill-accent)", color: "var(--on-accent)", border: "none" }}>
                      {sending ? "Gönderiliyor…" : "Davet et"}
                    </button>
                  </div>
                </form>
              )}
            </>
          )}
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
            <button onClick={onClose}>Kapat</button>
          </div>
        </>
      )}
    </Modal>
  );
}

const TRASH_TABLE_LABELS = {
  customers: "Müşteri",
  deals: "Teklif",
  payments: "Tahsilat",
  company_expenses: "İşletme gideri",
  tickets: "Talep",
  kb_articles: "Makale",
  group_classes: "Ders",
  attachments: "Dosya",
  staff_shifts: "Vardiya",
  staff_leave_balances: "İzin bakiyesi",
  staff_leave_records: "İzin kaydı",
};

function TrashHistoryModal({ notify, onRestore, onPermanentDelete, isOwner, onClose, activeTeamId, session, teamMembers }) {
  const [tab, setTab] = useState("trash");
  const [loading, setLoading] = useState(true);
  const [trashGroups, setTrashGroups] = useState([]);
  const [historyRows, setHistoryRows] = useState([]);
  const [restoringGroup, setRestoringGroup] = useState(null);
  const [deletingGroup, setDeletingGroup] = useState(null);
  const [confirmDeleteGroup, setConfirmDeleteGroup] = useState(null);
  const [confirmDeleteText, setConfirmDeleteText] = useState("");
  const [query, setQuery] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");

  const load = async () => {
    setLoading(true);
    const [{ data: c }, { data: d }, { data: pay }, { data: exp }, { data: t }, { data: kb }, { data: gc }, { data: log }, { data: att }] = await Promise.all([
      supabase.from("customers").select("id,name,user_id,deleted_at,deleted_batch_id").not("deleted_at", "is", null),
      supabase.from("deals").select("id,title,user_id,deleted_at,deleted_batch_id").not("deleted_at", "is", null),
      supabase.from("payments").select("id,amount,deleted_at,deleted_batch_id").not("deleted_at", "is", null),
      supabase.from("company_expenses").select("id,title,deleted_at,deleted_batch_id").not("deleted_at", "is", null),
      supabase.from("tickets").select("id,subject,deleted_at,deleted_batch_id").not("deleted_at", "is", null),
      supabase.from("kb_articles").select("id,title,deleted_at,deleted_batch_id").not("deleted_at", "is", null),
      supabase.from("group_classes").select("id,name,user_id,deleted_at,deleted_batch_id").not("deleted_at", "is", null),
      supabase.from("audit_log").select("*").order("created_at", { ascending: false }).limit(200),
      supabase.from("attachments").select("id,file_name,user_id,deleted_at,deleted_batch_id").not("deleted_at", "is", null),
    ]);

    // customers/deals RLS'i portal kullanıcıları için de eşleşebildiğinden (bkz.
    // customer_*_view yorumları), burada sadece aktif takıma ait kayıtlarla sınırlıyoruz.
    const rows = [
      ...(c || []).filter((r) => r.user_id === activeTeamId).map((r) => ({ table: "customers", label: r.name, ...r })),
      ...(d || []).filter((r) => r.user_id === activeTeamId).map((r) => ({ table: "deals", label: r.title, ...r })),
      ...(pay || []).map((r) => ({ table: "payments", label: `${formatTL(r.amount)} tahsilat`, ...r })),
      ...(exp || []).map((r) => ({ table: "company_expenses", label: r.title, ...r })),
      ...(t || []).map((r) => ({ table: "tickets", label: r.subject, ...r })),
      ...(kb || []).map((r) => ({ table: "kb_articles", label: r.title, ...r })),
      ...(gc || []).filter((r) => r.user_id === activeTeamId).map((r) => ({ table: "group_classes", label: r.name, ...r })),
      ...(att || []).filter((r) => r.user_id === activeTeamId).map((r) => ({ table: "attachments", label: r.file_name, ...r })),
    ];

    const groups = {};
    rows.forEach((r) => {
      // deleted_batch_id her zaman dolu olmalı (her soft-delete çağrısı bunu set
      // ediyor) ama olur da boş kalan bir satır çıkarsa, gruplama/React key/UI
      // durumu (aşağıda groupKey) YİNE DE benzersiz kalsın diye r.id'ye düşüyoruz -
      // aksi halde birden fazla batchId'siz satır aynı "null" kimliğinde birleşip
      // birinin onay kutusuna yazılanın diğerlerine de yansımasına yol açar.
      const key = r.deleted_batch_id || r.id;
      if (!groups[key]) groups[key] = { groupKey: key, batchId: r.deleted_batch_id, deletedAt: r.deleted_at, items: [] };
      groups[key].items.push({ table: r.table, label: r.label });
      if (new Date(r.deleted_at) > new Date(groups[key].deletedAt)) groups[key].deletedAt = r.deleted_at;
    });
    const groupList = Object.values(groups).sort((a, b) => new Date(b.deletedAt) - new Date(a.deletedAt));

    setTrashGroups(groupList);
    setHistoryRows(log || []);
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const restore = async (g) => {
    setRestoringGroup(g.groupKey);
    await onRestore(g.batchId);
    await load();
    setRestoringGroup(null);
  };

  const confirmPermanentDelete = async () => {
    const g = confirmDeleteGroup;
    setDeletingGroup(g.groupKey);
    setConfirmDeleteGroup(null);
    setConfirmDeleteText("");
    const { deletedCount, skipped } = await onPermanentDelete(g.batchId);
    await load();
    setDeletingGroup(null);
    if (skipped.length > 0) notify(`${deletedCount} kayıt kalıcı olarak silindi. ${skipped.join(" ")}`);
    else notify(`${deletedCount} kayıt kalıcı olarak silindi.`, "success");
  };

  const actorLabel = (actorId, actorEmail) => {
    if (actorId === session.user.id) return session.user.user_metadata?.full_name || actorEmail;
    const member = teamMembers.find((m) => m.id === actorId);
    return member?.name || actorEmail;
  };

  const queryLower = query.trim().toLowerCase();
  const filteredTrashGroups = trashGroups.filter((g) => {
    if (!matchesDateRange(g.deletedAt, fromDate, toDate)) return false;
    if (typeFilter !== "all" && !g.items.some((it) => it.table === typeFilter)) return false;
    if (!queryLower) return true;
    return g.items.some((it) => (it.label || "").toLowerCase().includes(queryLower));
  });
  const filteredHistoryRows = historyRows.filter((r) => {
    if (!matchesDateRange(r.created_at, fromDate, toDate)) return false;
    if (typeFilter !== "all" && r.entity_type !== typeFilter) return false;
    if (!queryLower) return true;
    return (r.summary || "").toLowerCase().includes(queryLower) || (r.actor_email || "").toLowerCase().includes(queryLower);
  });

  return (
    <Modal title="Çöp Kutusu ve Geçmiş" onClose={onClose}>
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <button
          onClick={() => setTab("trash")}
          style={{
            flex: 1,
            background: tab === "trash" ? "var(--fill-accent)" : "var(--surface-1)",
            color: tab === "trash" ? "var(--on-accent)" : "var(--text-primary)",
          }}
        >
          Çöp Kutusu
        </button>
        <button
          onClick={() => setTab("history")}
          style={{
            flex: 1,
            background: tab === "history" ? "var(--fill-accent)" : "var(--surface-1)",
            color: tab === "history" ? "var(--on-accent)" : "var(--text-primary)",
          }}
        >
          Geçmiş
        </button>
      </div>

      <div className="list-toolbar" style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Ara..."
          style={{ flex: 1, minWidth: 140, fontSize: 13 }}
        />
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} style={{ fontSize: 13 }}>
          <option value="all">Tüm türler</option>
          {Object.entries(TRASH_TABLE_LABELS).map(([key, label]) => (
            <option key={key} value={key}>{label}</option>
          ))}
        </select>
        <DateRangeFilter from={fromDate} to={toDate} onFromChange={setFromDate} onToChange={setToDate} />
      </div>

      {loading ? (
        <p style={{ fontSize: 13, color: "var(--text-secondary)" }}>Yükleniyor…</p>
      ) : tab === "trash" ? (
        filteredTrashGroups.length === 0 ? (
          <p style={{ fontSize: 13, color: "var(--text-muted)" }}>
            {trashGroups.length === 0 ? "Çöp kutusu boş." : "Filtreye uyan kayıt yok."}
          </p>
        ) : (
          <div style={{ maxHeight: 420, overflowY: "auto" }}>
            {filteredTrashGroups.map((g) => (
              <div key={g.groupKey} style={{ padding: "10px 0", borderBottom: "0.5px solid var(--border)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                  <div>
                    {g.items.map((it, i) => (
                      <div key={i} style={{ fontSize: 13 }}>
                        <span style={{ color: "var(--text-muted)" }}>{TRASH_TABLE_LABELS[it.table]}:</span> {it.label}
                      </div>
                    ))}
                    <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>
                      {daysAgo(g.deletedAt)} silindi{g.deletedAt ? ` · ${new Date(g.deletedAt).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}` : ""}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button
                      onClick={() => restore(g)}
                      disabled={restoringGroup === g.groupKey}
                      style={{ fontSize: 12, whiteSpace: "nowrap" }}
                    >
                      {restoringGroup === g.groupKey ? "Geri yükleniyor…" : "Geri Yükle"}
                    </button>
                    {isOwner && (
                      <button
                        onClick={() => { setConfirmDeleteGroup(g); setConfirmDeleteText(""); }}
                        disabled={deletingGroup === g.groupKey}
                        style={{ fontSize: 12, whiteSpace: "nowrap", background: "var(--surface-1)", color: "var(--danger, #b91c1c)", border: "0.5px solid var(--border)" }}
                      >
                        {deletingGroup === g.groupKey ? "Siliniyor…" : "Kalıcı Olarak Sil"}
                      </button>
                    )}
                  </div>
                </div>
                {confirmDeleteGroup?.groupKey === g.groupKey && (
                  <div style={{ marginTop: 8, padding: 10, background: "var(--surface-1)", border: "0.5px solid var(--border)", borderRadius: "var(--radius)" }}>
                    <p style={{ fontSize: 12, margin: "0 0 8px", color: "var(--text-secondary)" }}>
                      Bu işlem GERİ ALINAMAZ - bu kayıtlar bir daha geri yüklenemez. Tahsilat/fatura kaydı olan teklif veya müşteriler (varsa) yasal saklama süresi nedeniyle otomatik olarak hariç tutulur.
                      Onaylamak için aşağıya <strong>SİL</strong> yazın.
                    </p>
                    <div style={{ display: "flex", gap: 8 }}>
                      <input
                        value={confirmDeleteText}
                        onChange={(e) => setConfirmDeleteText(e.target.value)}
                        placeholder="SİL"
                        style={{ flex: 1, fontSize: 13 }}
                      />
                      <button
                        onClick={confirmPermanentDelete}
                        disabled={confirmDeleteText.trim().toLocaleUpperCase("tr-TR") !== "SİL"}
                        style={{ fontSize: 12, whiteSpace: "nowrap", background: "var(--danger, #b91c1c)", color: "#fff", border: "none" }}
                      >
                        Kalıcı Olarak Sil
                      </button>
                      <button onClick={() => { setConfirmDeleteGroup(null); setConfirmDeleteText(""); }} style={{ fontSize: 12, whiteSpace: "nowrap" }}>
                        Vazgeç
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )
      ) : filteredHistoryRows.length === 0 ? (
        <p style={{ fontSize: 13, color: "var(--text-muted)" }}>
          {historyRows.length === 0 ? "Henüz bir kayıt yok." : "Filtreye uyan kayıt yok."}
        </p>
      ) : (
        <div style={{ maxHeight: 420, overflowY: "auto" }}>
          {filteredHistoryRows.map((r) => (
            <div key={r.id} style={{ padding: "8px 0", borderBottom: "0.5px solid var(--border)" }}>
              <div style={{ fontSize: 13 }}>{r.summary}</div>
              <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
                {actorLabel(r.actor_id, r.actor_email)} · {daysAgo(r.created_at)}{r.created_at ? ` · ${new Date(r.created_at).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}` : ""}
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
        <button onClick={onClose}>Kapat</button>
      </div>
    </Modal>
  );
}

const PARASUT_INVOICE_HEADERS = [
  "MÜŞTERİ ÜNVANI *",
  "FATURA İSMİ",
  "FATURA TARİHİ",
  "DÖVİZ CİNSİ",
  "DÖVİZ KURU",
  "VADE TARİHİ",
  "TAHSİLAT TL KARŞILIĞI",
  "FATURA TÜRÜ",
  "FATURA SERİ",
  "FATURA SIRA NO",
  "KATEGORİ",
  "HİZMET/ÜRÜN *",
  "HİZMET/ÜRÜN AÇIKLAMASI",
  "ÇIKIŞ DEPOSU *",
  "MİKTAR *",
  "BİRİM FİYATI *",
  "İNDİRİM TUTARI",
  "KDV ORANI *",
  "ÖİV ORANI",
  "KONAKLAMA VERGİSİ ORANI",
];

// Paraşüt'ün kendi şablonundan birebir alındı — bu metin olmadan (veya başlık
// satırı 3. satırda değilse) Paraşüt dosyayı "hiçbir veri okuyamadık" diyerek
// reddediyor. Sadece kendi içe aktarma ekranlarına geri beslemek için kullanılıyor.
const PARASUT_HELP_TEXT = `Satış Faturaları

- Yıldız ile belirlenen alanları doldurmanız yeterlidir.
- Faturalar ile beraber Paraşüt'te kayıtlı olmayan Müşteriler ve Hizmet/Ürünler de oluşturulur.
- Paraşütte kayıtlı olan müşteriler içeri alınan faturalar ile ilişkilendirilir.
- Fatura Türü, "Fatura", "Taslak" (ya da "Proforma") veya "Konaklama" olabilir. Boş bırakmanız halinde "Fatura" olarak kaydedilir.
- Fatura döviz cinsi TRL, USD, EUR veya GBP olabilir. Döviz cinsi belirtilmediği takdirde TRL olarak kabul edilir.
- Proforma faturalarda fatura döviz kuru boş bırakılmalıdır. Eğer bir kur belirtilmişse göz ardı edilir. Faturalarda ise döviz kuru zorunludur.
- Vade tarihi olmayan veya ileri bir tarihe denk gelen faturalar açık fatura olarak içeri alınır. Geçmiş tarihli tahsilatlar gerçekleşti olarak varsayılır ve kasa hesabınıza eklenir.
- Yabancı döviz cinsinden kesilen faturalar için yapılan tahsilatların Türk Lirası karşılıklarınin girilmesi zorunludur. TL faturalarda ve diğer açık faturalarda bu alan boş bırakılmalıdır.
- Bir faturaya birden fazla hizmet/ürün eklemek için faturayı takip eden satırlarda sadece hizmet/ürün detaylarını doldurun.
- KDV Oranı 10 Temmuz 2023 itibariyle 0, 1, 10 veya 20 olmalıdır.
- Fatura Sıra Numarasının başına sıfır eklemenize gerek yoktur.
- Deponun belirtilmemesi durumunda ürünler varsayılan deponuzan çıkmış olarak kabul edilir.
- Konaklama Vergisi Oranı belirtilmemiş ise Konaklama Vergisi yok, oran 0 ise Konaklama Vergisi istisna kabul edilir.
- Tablonun sütun yapısını bozmayın.
- Bu yardım metnini silmeyin.

- Destek için destek@parasut.com veya 0212 292 04 94`;

function ParasutExportModal({ deals, customerById, totalPaidForDeal, sector, onClose }) {
  const wonDeals = deals.filter((d) => d.stage === "kazanildi");
  const [selected, setSelected] = useState(() => new Set(wonDeals.map((d) => d.id)));
  const [dealQuery, setDealQuery] = useState("");
  const [minAmount, setMinAmount] = useState("");
  const [maxAmount, setMaxAmount] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [paymentFilter, setPaymentFilter] = useState("all");
  const selectedDeals = wonDeals.filter((d) => selected.has(d.id));

  const paymentStatus = (d) => {
    const paid = totalPaidForDeal(d.id);
    if (paid <= 0) return "odenmedi";
    return paid < d.value ? "kismi" : "odendi";
  };

  const dealQueryLower = dealQuery.trim().toLowerCase();
  const filteredWonDeals = wonDeals.filter((d) => {
    if (!matchesDateRange(d.createdAt, fromDate, toDate)) return false;
    if (minAmount !== "" && d.value < Number(minAmount)) return false;
    if (maxAmount !== "" && d.value > Number(maxAmount)) return false;
    if (paymentFilter !== "all" && paymentStatus(d) !== paymentFilter) return false;
    if (!dealQueryLower) return true;
    return d.title.toLowerCase().includes(dealQueryLower) || (customerById(d.customerId)?.name || "").toLowerCase().includes(dealQueryLower);
  });
  const allVisibleSelected = filteredWonDeals.length > 0 && filteredWonDeals.every((d) => selected.has(d.id));

  const toggle = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleAllVisible = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) filteredWonDeals.forEach((d) => next.delete(d.id));
      else filteredWonDeals.forEach((d) => next.add(d.id));
      return next;
    });
  };

  const download = async () => {
    const dataRows = selectedDeals.map((d) => {
      const invoiceDate = new Date(d.closedAt || d.createdAt);
      const kdvRate = d.kdvRate ?? 20;
      // Binerly'deki tutar KDV dahil — Paraşüt birim fiyatın üzerine KDV'yi kendisi
      // ekliyor, o yüzden burada KDV'siz (net) birim fiyatı geri hesaplıyoruz.
      const netUnitPrice = kdvRate > 0 ? d.value / (1 + kdvRate / 100) : d.value;
      return [
        customerById(d.customerId)?.name || "",
        d.title,
        invoiceDate,
        "",
        "",
        invoiceDate,
        "",
        "Fatura",
        "",
        "",
        "",
        d.title,
        "",
        "",
        1,
        Math.round(netUnitPrice * 100) / 100,
        0,
        kdvRate,
        "",
        "",
      ];
    });
    // Paraşüt'ün gerçek şablonu: 1. satır (birleştirilmiş A1:F1) yardım metni,
    // 2. satır boş, 3. satır başlıklar, sonrası veri. Bu yapı birebir aynı
    // olmazsa (örn. başlık 1. satırda olursa) Paraşüt dosyayı okuyamıyor.
    const XLSX = await import("xlsx");
    const sheet = XLSX.utils.aoa_to_sheet([[PARASUT_HELP_TEXT], [], PARASUT_INVOICE_HEADERS, ...dataRows]);
    sheet["!merges"] = [
      { s: { c: 0, r: 0 }, e: { c: 5, r: 0 } },
      { s: { c: 9, r: 0 }, e: { c: 14, r: 0 } },
    ];
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, "Satış Faturaları");
    XLSX.writeFile(workbook, "parasut-satis-faturalari.xlsx");
    onClose();
  };

  return (
    <Modal title="Paraşüt'e Aktar" onClose={onClose}>
      <p style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.6, marginBottom: 12 }}>
        "{stageLabel("kazanildi", "kurumsal", sector)}" aşamasındaki {DEAL_WORD_FORMS[dealWordKind(sector)].plural} arasından aktarmak istediklerinizi seçin. Seçilenler, Paraşüt'ün satış faturası içe aktarma şablonuyla uyumlu bir Excel (.xlsx) dosyası olarak indirilecek - her {DEAL_WORD_FORMS[dealWordKind(sector)].gen} kendi KDV oranı kullanılır. İndirdiğiniz dosyayı Paraşüt'te Satışlar → Faturalar → İçe/Dışa Aktar → İçeri Aktar ile yükleyebilirsiniz.
      </p>

      {wonDeals.length === 0 ? (
        <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 16 }}>Aktarılabilecek "{stageLabel("kazanildi", "kurumsal", sector)}" {DEAL_WORD_FORMS[dealWordKind(sector)].bare} yok.</p>
      ) : (
        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 13, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>
            Aktarılacak teklifler ({selectedDeals.length}/{wonDeals.length} seçili)
          </label>
          <div style={{ display: "flex", gap: 6, marginBottom: 6, flexWrap: "wrap" }}>
            <input
              value={dealQuery}
              onChange={(e) => setDealQuery(e.target.value)}
              placeholder="Müşteri veya başlıkta ara..."
              style={{ flex: 1, minWidth: 140, fontSize: 13 }}
            />
            <input
              type="number"
              min="0"
              value={minAmount}
              onChange={(e) => setMinAmount(e.target.value)}
              placeholder="Min. tutar"
              style={{ width: 100, fontSize: 13 }}
            />
            <input
              type="number"
              min="0"
              value={maxAmount}
              onChange={(e) => setMaxAmount(e.target.value)}
              placeholder="Maks. tutar"
              style={{ width: 100, fontSize: 13 }}
            />
            <select value={paymentFilter} onChange={(e) => setPaymentFilter(e.target.value)} style={{ fontSize: 13 }}>
              <option value="all">Tüm ödeme durumları</option>
              <option value="odendi">Ödendi</option>
              <option value="kismi">Kısmi ödeme</option>
              <option value="odenmedi">Ödenmedi</option>
            </select>
            <DateRangeFilter from={fromDate} to={toDate} onFromChange={setFromDate} onToChange={setToDate} />
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: "var(--text-secondary)", padding: "2px 0 6px", cursor: filteredWonDeals.length === 0 ? "default" : "pointer" }}>
            <input type="checkbox" checked={allVisibleSelected} disabled={filteredWonDeals.length === 0} onChange={toggleAllVisible} />
            Görünen {filteredWonDeals.length} teklifin tümünü seç / kaldır
          </label>
          <div style={{ maxHeight: 180, overflowY: "auto", border: "0.5px solid var(--border)", borderRadius: "var(--radius)", padding: 8 }}>
            {filteredWonDeals.length === 0 ? (
              <p style={{ fontSize: 12.5, color: "var(--text-muted)", margin: 0 }}>Filtreye uyan teklif yok.</p>
            ) : (
              filteredWonDeals.map((d) => (
                <label key={d.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, padding: "4px 0", cursor: "pointer" }}>
                  <input type="checkbox" checked={selected.has(d.id)} onChange={() => toggle(d.id)} />
                  {customerById(d.customerId)?.name || "Bilinmeyen müşteri"} - {d.title}{" "}
                  <span style={{ color: "var(--text-muted)" }}>({formatTL(d.value)}, KDV %{d.kdvRate ?? 20})</span>
                </label>
              ))
            )}
          </div>
          <p style={{ fontSize: 11, color: "var(--text-muted)", margin: "6px 0 0" }}>KDV oranı yanlış görünüyorsa Vazgeç'e basıp ilgili teklifi düzenleyerek değiştirebilirsiniz.</p>
        </div>
      )}

      {(() => {
        const dealsWithPayments = selectedDeals.filter((d) => totalPaidForDeal(d.id) > 0);
        if (dealsWithPayments.length === 0) return null;
        return (
          <div style={{ marginBottom: 16, background: "var(--bg-warning)", borderRadius: "var(--radius)", padding: "0.75rem 1rem" }}>
            <p style={{ fontSize: 12.5, color: "var(--text-warning)", margin: "0 0 8px", lineHeight: 1.6, fontWeight: 600 }}>
              Dikkat: Excel dosyası tahsilat bilgisi taşımıyor, faturalar Paraşüt'e aktarılınca "ödenmemiş" görünecek. Aşağıdaki {dealsWithPayments.length} teklif için Binerly'de tahsilat kaydı var - Paraşüt'e aktardıktan sonra her biri için:
            </p>
            <ol style={{ margin: "0 0 10px", paddingLeft: 18, fontSize: 12.5, color: "var(--text-warning)", lineHeight: 1.6 }}>
              <li>Paraşüt'te o faturayı açın.</li>
              <li>"TAHSİLAT EKLE" butonuna tıklayın.</li>
              <li>"Nakit"i seçip aşağıdaki tutarı girin ve kaydedin.</li>
            </ol>
            <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 140, overflowY: "auto" }}>
              {dealsWithPayments.map((d) => {
                const paid = totalPaidForDeal(d.id);
                const remaining = d.value - paid;
                return (
                  <div key={d.id} style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                    <strong style={{ color: "var(--text-primary)" }}>{customerById(d.customerId)?.name || "Bilinmeyen müşteri"} - {d.title}:</strong>{" "}
                    Girilecek tutar: <strong>{formatTL(paid)}</strong>
                    {remaining > 0 ? ` (kalan ${formatTL(remaining)} henüz tahsil edilmedi)` : " (tamamı ödendi)"}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
        <button onClick={onClose}>Vazgeç</button>
        <button
          onClick={download}
          disabled={selectedDeals.length === 0}
          style={{ background: "var(--fill-accent)", color: "var(--on-accent)", border: "none" }}
        >
          İndir
        </button>
      </div>
    </Modal>
  );
}

const PAYMENT_MODE_LAST_CHOICE_KEY = "binerly_last_payment_mode";
const PAYMENT_MODE_OPTIONS = [
  { value: "none", label: "Sadece onaylasın", desc: "Bugünkü gibi - ödeme adımı yok, müşteri sadece onaylar." },
  { value: "optional", label: "Onaylasın + isterse ödesin", desc: "Onay ve ödeme birbirinden bağımsız, ikisi de ayrı ayrı sunulur." },
  { value: "required", label: "Onaylamak için ödemesi şart", desc: "Tek adım: ödeme tamamlanınca onay da otomatik gerçekleşir." },
];

// Onay linki her kopyalandığında açılan, o teklife özel ödeme tercihi seçimi —
// son seçilen localStorage'dan ön-işaretli gelir, KOBİ'nin her seferinde
// Ayarlar'a gidip global bir tercih değiştirmesine gerek kalmaz.
function PaymentModeModal({ deal, paymentConnected, onConfirm, onClose }) {
  const [mode, setMode] = useState(
    deal.paymentMode !== "none" ? deal.paymentMode : localStorage.getItem(PAYMENT_MODE_LAST_CHOICE_KEY) || "none"
  );
  return (
    <Modal title="Onay linki için ödeme tercihi" onClose={onClose}>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
        {PAYMENT_MODE_OPTIONS.map((opt) => (
          <label
            key={opt.value}
            style={{
              display: "flex", gap: 8, alignItems: "flex-start", padding: 10,
              border: `0.5px solid ${mode === opt.value ? "var(--fill-accent)" : "var(--border)"}`,
              borderRadius: "var(--radius)", cursor: "pointer",
            }}
          >
            <input type="radio" checked={mode === opt.value} onChange={() => setMode(opt.value)} style={{ marginTop: 2 }} />
            <div>
              <p style={{ margin: 0, fontSize: 13, fontWeight: 500 }}>{opt.label}</p>
              <p style={{ margin: 0, fontSize: 12, color: "var(--text-secondary)" }}>{opt.desc}</p>
            </div>
          </label>
        ))}
      </div>
      {mode !== "none" && !paymentConnected && (
        <p style={{ fontSize: 12.5, color: "var(--text-warning, #b45309)", margin: "0 0 12px" }}>
          Ödeme almak için önce Ayarlar'dan iyzico veya PayTR hesabınızı bağlamanız gerekiyor.
        </p>
      )}
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
        <button onClick={onClose}>Vazgeç</button>
        <button
          onClick={() => { localStorage.setItem(PAYMENT_MODE_LAST_CHOICE_KEY, mode); onConfirm(mode); }}
          disabled={mode !== "none" && !paymentConnected}
          style={{ background: "var(--fill-accent)", color: "var(--on-accent)", border: "none" }}
        >
          Onayla ve linki kopyala
        </button>
      </div>
    </Modal>
  );
}

const PAYTR_NOTIFICATION_URL = "https://binerly.com/api/deal-approval?action=paytr-callback";
const INSTALLMENT_TIERS = [1, 2, 3, 6, 9, 12]; // Türkiye'deki standart taksit kademeleri

function PaymentCredentialForm({ credential, onSave, onDelete, onClose }) {
  const [provider, setProvider] = useState(credential?.provider || "iyzico");
  const [apiKey, setApiKey] = useState("");
  const [secretKey, setSecretKey] = useState("");
  const [merchantSalt, setMerchantSalt] = useState("");
  const [sandbox, setSandbox] = useState(credential?.sandbox ?? true);
  const [maxInstallment, setMaxInstallment] = useState(credential?.maxInstallment || 1);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const isPayTR = provider === "paytr";
  const isConnectedProvider = credential && credential.provider === provider;
  const requiredFilled = apiKey.trim() && secretKey.trim() && (!isPayTR || merchantSalt.trim());

  const submit = async (e) => {
    e.preventDefault();
    if (!requiredFilled) return;
    setSaving(true);
    await onSave({ provider, apiKey: apiKey.trim(), secretKey: secretKey.trim(), merchantSalt: isPayTR ? merchantSalt.trim() : null, sandbox, maxInstallment });
    setSaving(false);
    onClose();
  };

  return (
    <>
      <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: "0 0 14px" }}>
        Müşterilerinizin onay linkinden kartla doğrudan ödeme yapabilmesi için kendi iyzico veya PayTR hesabınızın API
        bilgilerini girin. Kart bilgisi hiçbir zaman Binerly sunucularından geçmez, sağlayıcının kendi güvenli sayfasında girilir.
        Aynı anda sadece bir sağlayıcı aktif olabilir - yeni birini bağlarsanız öncekinin yerini alır.
      </p>
      {credential && (
        <div style={{ background: "var(--surface-2)", borderRadius: "var(--radius)", padding: 10, marginBottom: 14, fontSize: 13 }}>
          {credential.provider === "paytr" ? "PayTR" : "iyzico"} bağlı ✓ {credential.sandbox ? "(Test modu / Sandbox)" : "(Canlı)"}
        </div>
      )}
      <div style={{ marginBottom: 14 }}>
        <label style={{ fontSize: 13, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Sağlayıcı</label>
        <select value={provider} onChange={(e) => { setProvider(e.target.value); setApiKey(""); setSecretKey(""); setMerchantSalt(""); }} style={{ width: "100%" }}>
          <option value="iyzico">iyzico</option>
          <option value="paytr">PayTR</option>
        </select>
      </div>
      {isPayTR && (
        <div style={{ background: "var(--surface-2)", borderRadius: "var(--radius)", padding: 10, marginBottom: 14, fontSize: 12.5 }}>
          PayTR panelinizde <strong>Bildirim URL'i</strong> olarak (bir kez) şunu ayarlamanız gerekiyor:
          <div style={{ fontFamily: "monospace", fontSize: 11.5, margin: "6px 0", wordBreak: "break-all", userSelect: "all" }}>{PAYTR_NOTIFICATION_URL}</div>
          Bu adım yapılmadan ödemeler onaylanmaz.
        </div>
      )}
      <form onSubmit={submit} autoComplete="off">
        <div style={{ marginBottom: 10 }}>
          <label style={{ fontSize: 13, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>{isPayTR ? "Mağaza No (Merchant ID)" : "API Key"}</label>
          <input
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={isConnectedProvider ? "Değiştirmek için yeniden girin" : ""}
            autoComplete="off"
            data-1p-ignore
            data-lpignore="true"
            style={{ width: "100%" }}
          />
        </div>
        <div style={{ marginBottom: 10 }}>
          <label style={{ fontSize: 13, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>{isPayTR ? "Merchant Key" : "Secret Key"}</label>
          <input
            value={secretKey}
            onChange={(e) => setSecretKey(e.target.value)}
            placeholder={isConnectedProvider ? "Değiştirmek için yeniden girin" : ""}
            type="password"
            autoComplete="new-password"
            data-1p-ignore
            data-lpignore="true"
            style={{ width: "100%" }}
          />
        </div>
        {isPayTR && (
          <div style={{ marginBottom: 10 }}>
            <label style={{ fontSize: 13, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Merchant Salt</label>
            <input
              value={merchantSalt}
              onChange={(e) => setMerchantSalt(e.target.value)}
              placeholder={isConnectedProvider ? "Değiştirmek için yeniden girin" : ""}
              type="password"
              autoComplete="new-password"
              data-1p-ignore
              data-lpignore="true"
              style={{ width: "100%" }}
            />
          </div>
        )}
        <div style={{ marginBottom: 10 }}>
          <label style={{ fontSize: 13, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Taksit</label>
          <select value={maxInstallment} onChange={(e) => setMaxInstallment(Number(e.target.value))} style={{ width: "100%" }}>
            <option value={1}>Tek çekim</option>
            {INSTALLMENT_TIERS.filter((t) => t > 1).map((t) => (
              <option key={t} value={t}>{t} taksite kadar</option>
            ))}
          </select>
          <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: "4px 0 0" }}>
            Müşteriye ödeme sayfasında sunulacak azami taksit sayısı. Bu sadece bir üst sınır - taksitin gerçekten
            sunulabilmesi {isPayTR ? "PayTR" : "iyzico"} hesabınızda taksitli satış özelliğinin açık olmasına ve
            müşterinin kartının taksit desteğine bağlıdır; hesabınızda kapalıysa bu ayara rağmen tek çekim gösterilir.
          </p>
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, marginBottom: 16 }}>
          <input type="checkbox" checked={sandbox} onChange={(e) => setSandbox(e.target.checked)} />
          Test modu (Sandbox) - canlıya geçmeden önce test anahtarlarınızla deneyin
        </label>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
          {credential ? (
            <button type="button" onClick={() => setConfirmDelete(true)} style={{ color: "var(--text-danger, #b91c1c)" }}>Bağlantıyı kaldır</button>
          ) : <span />}
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" onClick={onClose}>Kapat</button>
            <button type="submit" disabled={saving || !requiredFilled} style={{ background: "var(--fill-accent)", color: "var(--on-accent)", border: "none" }}>
              {saving ? "Kaydediliyor…" : "Kaydet"}
            </button>
          </div>
        </div>
      </form>
      {confirmDelete && (
        <ConfirmDialog
          title="Bağlantı kaldırılsın mı?"
          message={`${credential?.provider === "paytr" ? "PayTR" : "iyzico"} bağlantısı kaldırılır, ödeme modu seçilmiş tekliflerdeki online ödeme butonları çalışmaz hale gelir.`}
          onConfirm={async () => { await onDelete(credential.provider); setConfirmDelete(false); onClose(); }}
          onClose={() => setConfirmDelete(false)}
        />
      )}
    </>
  );
}

function AppSettingsModal({ session, theme, onThemeChange, pushSubscribed, onSubscribe, onUnsubscribe, notify, onClose }) {
  const [name, setName] = useState(session.user.user_metadata?.full_name || "");
  const [savingName, setSavingName] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);

  const saveName = async (e) => {
    e.preventDefault();
    if (!name.trim()) { notify("Ad Soyad boş olamaz."); return; }
    setSavingName(true);
    const { error } = await supabase.auth.updateUser({ data: { full_name: name.trim() } });
    setSavingName(false);
    if (error) { notify(`Kaydedilemedi: ${translateAuthError(error.message)}`); return; }
    notify("Adınız güncellendi.", "success");
  };

  const changePassword = async (e) => {
    e.preventDefault();
    if (newPassword.length < 6) { notify("Yeni şifre en az 6 karakter olmalı."); return; }
    if (newPassword !== confirmPassword) { notify("Yeni şifreler eşleşmiyor."); return; }
    setSaving(true);
    const { error: verifyError } = await supabase.auth.signInWithPassword({ email: session.user.email, password: currentPassword });
    if (verifyError) {
      setSaving(false);
      notify("Mevcut şifreniz yanlış.");
      return;
    }
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setSaving(false);
    if (error) { notify(`Şifre değiştirilemedi: ${translateAuthError(error.message)}`); return; }
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    notify("Şifreniz güncellendi.", "success");
  };

  return (
    <Modal title="Ayarlar" onClose={onClose}>
      <div style={{ marginBottom: 20 }}>
        <p style={{ fontSize: 13, fontWeight: 500, margin: "0 0 8px" }}>Profil</p>
        <form onSubmit={saveName} style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 13, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Ad Soyad</label>
            <input value={name} onChange={(e) => setName(e.target.value)} style={{ width: "100%" }} />
          </div>
          <button type="submit" disabled={savingName || !name.trim()} style={{ background: "var(--fill-accent)", color: "var(--on-accent)", border: "none", fontSize: 13 }}>
            {savingName ? "Kaydediliyor…" : "Kaydet"}
          </button>
        </form>
      </div>

      <div style={{ marginBottom: 20, paddingTop: 16, borderTop: "0.5px solid var(--border)" }}>
        <p style={{ fontSize: 13, fontWeight: 500, margin: "0 0 8px" }}>Görünüm</p>
        <div style={{ display: "flex", gap: 4, background: "var(--surface-1)", borderRadius: "var(--radius)", padding: 3, width: "fit-content" }}>
          <button
            type="button"
            onClick={() => onThemeChange("light")}
            style={{ border: "none", background: theme === "light" ? "var(--fill-accent)" : "transparent", color: theme === "light" ? "var(--on-accent)" : "var(--text-secondary)", fontWeight: theme === "light" ? 600 : 400, display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}
          >
            <i className="ti ti-sun" style={{ fontSize: 15 }} aria-hidden="true"></i>
            Açık
          </button>
          <button
            type="button"
            onClick={() => onThemeChange("dark")}
            style={{ border: "none", background: theme === "dark" ? "var(--fill-accent)" : "transparent", color: theme === "dark" ? "var(--on-accent)" : "var(--text-secondary)", fontWeight: theme === "dark" ? 600 : 400, display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}
          >
            <i className="ti ti-moon" style={{ fontSize: 15 }} aria-hidden="true"></i>
            Koyu
          </button>
        </div>
      </div>

      <div style={{ marginBottom: 20, paddingTop: 16, borderTop: "0.5px solid var(--border)" }}>
        <p style={{ fontSize: 13, fontWeight: 500, margin: "0 0 8px" }}>Bildirimler</p>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>
            Yeni müşteri mesajı geldiğinde anında bildirim
          </span>
          <button type="button" onClick={() => (pushSubscribed ? onUnsubscribe() : onSubscribe())} style={{ fontSize: 13 }}>
            {pushSubscribed ? "Kapat" : "Aç"}
          </button>
        </div>
        <p style={{ fontSize: 11, color: "var(--text-muted)", margin: "8px 0 0" }}>
          iPhone'da bildirim almak için önce uygulamayı Ana Ekrana eklemeniz gerekir.
        </p>
      </div>

      <div style={{ paddingTop: 16, borderTop: "0.5px solid var(--border)" }}>
        <p style={{ fontSize: 13, fontWeight: 500, margin: "0 0 8px" }}>Hesap</p>
        <form onSubmit={changePassword} style={{ marginBottom: 16 }}>
          <div style={{ marginBottom: 8 }}>
            <label style={{ fontSize: 13, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Mevcut şifre</label>
            <input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} style={{ width: "100%" }} />
          </div>
          <div style={{ marginBottom: 8 }}>
            <label style={{ fontSize: 13, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Yeni şifre</label>
            <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} style={{ width: "100%" }} />
          </div>
          <div style={{ marginBottom: 8 }}>
            <label style={{ fontSize: 13, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Yeni şifre (tekrar)</label>
            <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} style={{ width: "100%" }} />
          </div>
          <button type="submit" disabled={saving || !currentPassword || !newPassword} style={{ background: "var(--fill-accent)", color: "var(--on-accent)", border: "none", fontSize: 13 }}>
            {saving ? "Kaydediliyor…" : "Şifreyi değiştir"}
          </button>
        </form>

        <a
          href="mailto:info@binerly.com?subject=Hesap%20silme%20talebi"
          style={{ fontSize: 13, color: "var(--text-danger)", textDecoration: "none" }}
        >
          Hesabımı silmek istiyorum (destek ekibine e-posta gönder)
        </a>
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 20 }}>
        <button onClick={onClose}>Kapat</button>
      </div>
    </Modal>
  );
}

// Ziyaretçinin abonelik/güvenlik/kurulum hakkındaki tipik tereddütlerine
// (satın alma öncesi itiraz) landing page'de taranabilir bir soru-cevap
// formatında cevap yok - bu bilgiler önceden ya hiç yoktu ya da "Hakkımızda"
// kartlarının içine düz metin olarak gömülüydü.
const LANDING_FAQS = [
  { q: "Kredi kartı bilgisi girmem gerekiyor mu?", a: "Hayır. Kayıt olurken kart bilgisi istenmez, erken erişim aşamasında kullanım tamamen ücretsizdir." },
  { q: "Verilerim ne kadar güvende?", a: "Her hesap yalnızca kendi kayıtlarına erişebilir (satır bazlı erişim kuralları) - başka bir işletmenin verisine teknik olarak erişim mümkün değildir. Veriler KVKK'ya uygun işlenir, asla üçüncü taraflarla paylaşılmaz." },
  { q: "İstediğim zaman ayrılabilir miyim?", a: "Evet, herhangi bir taahhüt veya cayma bedeli yoktur. Ayarlar bölümünden istediğiniz zaman hesabınızı kapatabilirsiniz." },
  { q: "Kullanmayı öğrenmek zor mu, teknik bilgi gerekir mi?", a: "Hayır - Binerly günlük kullanılan basit programlar kadar sade olacak şekilde tasarlandı. Sektörünüzü seçtiğinizde arayüz otomatik şekillenir, ekranın içindeki Yardım bölümünden anlık soru sorabilirsiniz." },
  { q: "Ekip arkadaşlarımla birlikte kullanabilir miyim?", a: "Evet, işletme sahibi dahil 5 kullanıcıya kadar takım üyesi davet edebilirsiniz - herkes aynı müşteri/teklif/randevu verisini görüp güncelleyebilir, ek ücret alınmaz. Daha büyük bir ekibiniz varsa bize ulaşın." },
  { q: "Sadece benim sektörüme mi uygun, yoksa genel bir CRM mi?", a: "Binerly genel bir CRM'dir ama sektörünüzü seçtiğinizde (Güzellik & Bakım, Sağlık/Klinik, Emlak, Spor Merkezi ve daha fazlası) form alanları, aşama isimleri ve randevu/üyelik gibi özellikler otomatik olarak sektörünüze göre şekillenir." },
];

function LandingFaq() {
  const [openIndex, setOpenIndex] = useState(null);
  return (
    <div style={{ maxWidth: 720, margin: "0 auto" }}>
      {LANDING_FAQS.map((item, i) => {
        const open = openIndex === i;
        return (
          <div key={item.q} style={{ borderBottom: "1px solid #e1e8f0" }}>
            <button
              type="button"
              onClick={() => setOpenIndex(open ? null : i)}
              style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, background: "none", border: "none", padding: "16px 4px", textAlign: "left", cursor: "pointer" }}
            >
              <span style={{ fontSize: 15, fontWeight: 600, color: "#0c2540" }}>{item.q}</span>
              <i className={`ti ${open ? "ti-chevron-up" : "ti-chevron-down"}`} style={{ color: "#5b7088", flexShrink: 0 }} aria-hidden="true"></i>
            </button>
            {open && (
              <p style={{ margin: "0 0 16px", fontSize: 14, color: "#5b7088", lineHeight: 1.7 }}>{item.a}</p>
            )}
          </div>
        );
      })}
    </div>
  );
}

function LandingPage() {
  const [authModal, setAuthModal] = useState(null);

  return (
    <div style={{ minHeight: "100vh", background: "#f5f8fc", fontFamily: "system-ui, -apple-system, sans-serif" }}>
      <TrackingScripts />
      {authModal && <AuthModal initialMode={authModal} onClose={() => setAuthModal(null)} />}

      {/* Navbar */}
      <nav className="landing-navbar" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 2rem", height: 64, background: "#fff", borderBottom: "1px solid #e1e8f0", position: "sticky", top: 0, zIndex: 100 }}>
        <div onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
          <img src="/favicon.svg" alt="Binerly" style={{ width: 39, height: 39 }} />
          <span style={{ fontWeight: 700, fontSize: 18, color: "#0c2540" }}>Binerly</span>
        </div>
        <div style={{ display: "flex", gap: 28, alignItems: "center" }}>
          <div className="landing-nav-links" style={{ display: "flex", gap: 24 }}>
            <a href="#ozellikler" style={{ color: "#0c2540", fontWeight: 500, fontSize: 14, textDecoration: "none" }}>Hizmetlerimiz</a>
            <a href="#sektorler" style={{ color: "#0c2540", fontWeight: 500, fontSize: 14, textDecoration: "none" }}>Sektörler</a>
            <a href="#neden-binerly" style={{ color: "#0c2540", fontWeight: 500, fontSize: 14, textDecoration: "none" }}>Neden Binerly?</a>
            <a href="#hakkimizda" style={{ color: "#0c2540", fontWeight: 500, fontSize: 14, textDecoration: "none" }}>Hakkımızda</a>
            <a href="/blog" style={{ color: "#0c2540", fontWeight: 500, fontSize: 14, textDecoration: "none" }}>Blog</a>
          </div>
          <div className="landing-nav-actions" style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <button className="landing-nav-login" onClick={() => setAuthModal("login")} style={{ background: "none", border: "none", color: "#185fa5", fontWeight: 600, fontSize: 14, cursor: "pointer", padding: "8px 12px" }}>
              Giriş Yap
            </button>
            <button className="landing-nav-cta" onClick={() => setAuthModal("register")} style={{ background: "#185fa5", color: "#fff", border: "none", borderRadius: 8, padding: "8px 18px", fontWeight: 600, fontSize: 14, cursor: "pointer" }}>
              Ücretsiz Kullan
            </button>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "5rem 2rem 3rem", display: "flex", alignItems: "center", gap: "4rem", flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 300 }}>
          <div style={{ display: "inline-block", background: "#e6f1fb", color: "#185fa5", fontSize: 12, fontWeight: 600, padding: "4px 12px", borderRadius: 20, marginBottom: 20 }}>
            KOBİ'ler için CRM
          </div>
          <h1 style={{ fontSize: "clamp(2rem, 4vw, 3rem)", fontWeight: 800, color: "#0c2540", lineHeight: 1.2, margin: "0 0 1.25rem" }}>
            Müşterinizle ilişkinizi{" "}
            <span style={{ color: "#185fa5" }}>baştan sona</span>{" "}
            tek yerde yönetin
          </h1>
          <p style={{ fontSize: 17, color: "#5b7088", lineHeight: 1.7, margin: "0 0 2rem", maxWidth: 480 }}>
            Müşteri veya danışan takibi, teklif, randevu ya da üyelik süreci, destek ve müşterinizin kendi portalı - hepsi bir arada, sektörünüze göre şekillenen tek bir sistemde.
          </p>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <button onClick={() => setAuthModal("register")} style={{ background: "#185fa5", color: "#fff", border: "none", borderRadius: 8, padding: "13px 28px", fontWeight: 700, fontSize: 15, cursor: "pointer" }}>
              Ücretsiz Kullanmaya Başla →
            </button>
            <button onClick={() => setAuthModal("login")} style={{ background: "#fff", color: "#185fa5", border: "1.5px solid #185fa5", borderRadius: 8, padding: "13px 28px", fontWeight: 600, fontSize: 15, cursor: "pointer" }}>
              Giriş Yap
            </button>
          </div>
          <p style={{ fontSize: 13, color: "#185fa5", fontWeight: 600, margin: "12px 0 0" }}>
            Kart bilgisi gerekmez. Erken erişim aşamasındayız, şu an için tamamen ücretsiz.
          </p>
          <p style={{ fontSize: 13, color: "#5b7088", margin: "6px 0 0" }}>
            💬 Sizi dinliyoruz - talepleriniz doğrultusunda hızla geliştiriyoruz.
          </p>
        </div>

        {/* Mockup — dört farklı sektörden (inşaat/tekstil/güzellik/spor) örnek satır; her satırda sektör etiketiyle "sisteminiz sektöre göre şekillenir" mesajı verilir, tek işletmenin canlı paneli gibi algılanmasın diye.
            Not: eskiden burada kırmızı/sarı/yeşil "sahte tarayıcı" noktaları vardı - en çok "şablon" hissi
            veren eleman olduğu için kaldırıldı, yerine üstte ince bir "canlı" rozeti bırakıldı. */}
        <div style={{ flex: 1, minWidth: 280 }}>
          <p style={{ textAlign: "center", fontSize: 13, fontWeight: 600, color: "#185fa5", margin: "0 0 10px" }}>
            İster kurumsal, ister bireysel müşteriye hitap edin
          </p>
          <div style={{ background: "#0c2540", borderRadius: 16, padding: "1.5rem", boxShadow: "0 20px 60px rgba(12,37,64,0.2)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 16 }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#3ddc84", display: "inline-block" }} />
              <span style={{ fontSize: 10.5, fontWeight: 700, color: "#7fb3e8", letterSpacing: 0.4, textTransform: "uppercase" }}>Canlı önizleme</span>
            </div>
            <div className="landing-hero-stats" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8, marginBottom: 10 }}>
              {[["Açık Teklifler", "12"], ["Toplam Değer", "₺940.000"], ["Bekleyen Randevular", "5"], ["Aktif Üyelikler", "37"]].map(([label, val]) => (
                <div key={label} style={{ background: "#1a3a5c", borderRadius: 8, padding: "8px 10px" }}>
                  <div style={{ fontSize: 9.5, color: "#94a7bb", marginBottom: 3 }}>{label}</div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: "#fff" }}>{val}</div>
                </div>
              ))}
            </div>
            {[
              { name: "Akın İnşaat", sector: "İnşaat", icon: "ti-building", kind: "Ofis Tadilat Teklifi", stage: "Müzakere", value: "₺180.000" },
              { name: "Ege Tekstil", sector: "Tekstil", icon: "ti-building", kind: "Toptan Kumaş Siparişi", stage: "Kazanıldı", value: "₺220.000" },
              { name: "Ayşe Yılmaz", sector: "Güzellik", icon: "ti-user", kind: "Lazer Epilasyon Randevusu", stage: "Randevu planlandı", value: "₺1.200" },
              { name: "Mehmet Kaya", sector: "Spor", icon: "ti-user", kind: "Spor Salonu Üyeliği", stage: "Üye oldu", value: "₺3.500/ay" },
            ].map((r) => (
              <div key={r.name} style={{ background: "#1a3a5c", borderRadius: 8, padding: "8px 12px", marginBottom: 7, display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ flex: "none", display: "flex", alignItems: "center", gap: 4, width: 62 }}>
                  <span style={{ fontSize: 10.5, fontWeight: 700, color: "#7fb3e8" }}>{r.sector}</span>
                  <span style={{ fontSize: 12, color: "#5b7088" }} aria-hidden="true">→</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, flex: 1 }}>
                  <div style={{ flex: "none", width: 24, height: 24, borderRadius: "50%", background: "#123457", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <i className={`ti ${r.icon}`} style={{ fontSize: 12, color: "#7fb3e8" }} aria-hidden="true"></i>
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: "#fff" }}>{r.name}</span>
                      <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 0.3, color: "#0c2540", background: "#378add", padding: "1px 6px", borderRadius: 20, whiteSpace: "nowrap" }}>{r.kind.toLocaleUpperCase("tr")}</span>
                    </div>
                    <div style={{ fontSize: 11, color: "#94a7bb" }}>{r.stage}</div>
                  </div>
                </div>
                <div style={{ flex: "none", fontSize: 13, fontWeight: 600, color: "#378add", whiteSpace: "nowrap" }}>{r.value}</div>
              </div>
            ))}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px 14px", marginTop: 10, paddingTop: 10, borderTop: "1px solid #1e3a5c" }}>
              {[
                {
                  label: "Süreç Otomasyonu",
                  items: [
                    { icon: "ti-file-text", text: "PDF çıktısı" },
                    { icon: "ti-circle-check", text: "Onay linki" },
                    { icon: "ti-bell", text: "Otomatik hatırlatma" },
                    { icon: "ti-mail", text: "Otomatik e-posta" },
                  ],
                },
                {
                  label: "Müşteri Kendi Halleder",
                  items: [
                    { icon: "ti-users-group", text: "Müşteri portalı" },
                    { icon: "ti-calendar-plus", text: "Kendi randevusunu alır" },
                    { icon: "ti-calendar-time", text: "Grup dersine kaydolur" },
                  ],
                },
                {
                  label: "Takip & İletişim",
                  items: [
                    { icon: "ti-cash", text: "Tahsilat takibi" },
                    { icon: "ti-tag", text: "Etiket & özel alan" },
                    { icon: "ti-bell-ringing", text: "Anlık bildirim" },
                    { icon: "ti-speakerphone", text: "Kampanya gönderimi" },
                  ],
                  fullWidth: true,
                },
              ].map((group) => (
                <div key={group.label} style={group.fullWidth ? { gridColumn: "1 / -1" } : undefined}>
                  <p style={{ fontSize: 9, fontWeight: 700, color: "#5b7088", textTransform: "uppercase", letterSpacing: 0.5, margin: "0 0 4px" }}>{group.label}</p>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                    {group.items.map((it) => (
                      <span key={it.text} style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 10, fontWeight: 600, color: "#7fb3e8", background: "#123457", padding: "3px 8px 3px 6px", borderRadius: 20, whiteSpace: "nowrap" }}>
                        <i className={`ti ${it.icon}`} style={{ fontSize: 11 }} aria-hidden="true"></i>
                        {it.text}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Özellikler */}
      <div id="ozellikler" style={{ maxWidth: 1100, margin: "0 auto", padding: "4rem 2rem 3rem" }}>
        <div className="landing-section-head" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 24, flexWrap: "wrap", marginBottom: "2.5rem" }}>
          <div>
            <p style={{ fontSize: 12.5, fontWeight: 700, color: "#185fa5", letterSpacing: 0.6, textTransform: "uppercase", margin: "0 0 10px" }}>Özellikler</p>
            <h2 style={{ fontSize: "1.75rem", fontWeight: 700, color: "#0c2540", margin: 0, maxWidth: 460 }}>
              İşinizi büyütmek için ihtiyacınız olan her şey
            </h2>
          </div>
          <p style={{ fontSize: 14, color: "#5b7088", maxWidth: 300, margin: 0, lineHeight: 1.6 }}>
            Üç ana süreç işin omurgasını taşır, geri kalanı onları tamamlar.
          </p>
        </div>

        {/* Öne çıkan 3 süreç: büyük sıra numarasıyla, yatayda dönüşümlü kutular */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {[
            {
              id: "satis-firsat",
              num: "01",
              title: "Satış & Teklif Yönetimi",
              desc: "İster iş teklifi ister randevu ya da üyelik satışı olsun, ilk temastan kapanışa kadar tüm süreci tek listede aşama aşama takip edin. Hazır şablon galerisinden seçip markalı PDF oluşturun, onay linkiyle müşteriden tek tıkla onay ve isterseniz kartla online ödeme alın.",
              tags: ["Aşama Takibi", "PDF Şablon Galerisi", "Onay Linki", "Online Tahsilat", "Fiyat Listesi", "Seans/Paket Takibi"],
            },
            {
              id: "musteri-portali",
              num: "02",
              title: "Kendi Müşteri Portalınız",
              desc: "Müşterileriniz kendi hesaplarıyla giriş yapıp destek taleplerini açabilir, sizinle mesajlaşabilir ve teklif/randevu/üyelik kayıtlarının durumunu görebilir. Sizin tanımladığınız müsaitlik saatlerinden kendi randevusunu alabilir - siz her yeni işlemde anında bildirim alırsınız. Telefon trafiğinizi azaltır.",
              tags: ["Müşteri Portalı", "Kendi Randevusunu Alır", "Grup Dersi Kaydı", "Kendi Talebini Takip"],
            },
            {
              id: "raporlama",
              num: "03",
              title: "Raporlama & Analitik",
              desc: "Kazanma oranı, aşama hunisi, gelecek ay gelir tahmini ve kayıp nedeni analizleriyle stratejik kararlar alın. Cari hesap ve KDV özet raporuyla kimin ne kadar borcu olduğunu, aylık KDV yükünüzü tek bakışta görün.",
              tags: ["Dashboard", "Aşama Hunisi", "Gelir Tahmini", "Cari Hesap", "KDV Özeti"],
            },
          ].map((f, i) => (
            <div
              key={f.id}
              id={f.id}
              className="landing-feature-row"
              style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem 2rem", alignItems: "flex-start", background: "#fff", border: "1px solid #e1e8f0", borderRadius: 16, padding: "1.75rem 2rem", flexDirection: i % 2 === 1 ? "row-reverse" : "row", scrollMarginTop: 80 }}
            >
              <div style={{ flex: "none", width: 96, fontSize: 54, fontWeight: 800, color: "#dceafa", lineHeight: 1, textAlign: i % 2 === 1 ? "right" : "left" }}>{f.num}</div>
              <div style={{ flex: 1, minWidth: 260 }}>
                <h3 style={{ fontSize: 19, fontWeight: 700, color: "#0c2540", margin: "0 0 10px" }}>{f.title}</h3>
                <p style={{ fontSize: 14.5, color: "#5b7088", margin: "0 0 12px", lineHeight: 1.7, maxWidth: 620 }}>{f.desc}</p>
                <p style={{ fontSize: 12.5, color: "#7c93a8", margin: 0, fontWeight: 600 }}>{f.tags.join("   ·   ")}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Geri kalanı: kompakt kutu ızgarası */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16, marginTop: 32 }}>
          {[
            {
              id: "musteri-yonetimi",
              icon: "ti-address-book",
              title: "Müşteri & İletişim Yönetimi",
              desc: "İletişim bilgileri, yazışmalar, telefon notları ve geçmiş kayıtları tek veritabanında tutun; sektöre ve potansiyele göre segmentasyon yapın.",
            },
            {
              id: "pazarlama",
              icon: "ti-mail-forward",
              title: "Pazarlama Otomasyonu",
              desc: "E-posta kampanyaları gönderin. Lead scoring ile en sıcak adayları öncelikli görün.",
            },
            {
              id: "destek",
              icon: "ti-headset",
              title: "Satış Sonrası Destek",
              desc: "Şikayet ve destek taleplerini bilet sistemiyle takip edin, SLA sürelerini izleyin, bilgi bankası oluşturun.",
            },
            {
              id: "entegrasyonlar",
              icon: "ti-plug-connected",
              title: "Entegrasyonlar & Mobil",
              desc: "Telefonunuza kurup anında bildirim alın, WhatsApp'tan tek tıkla ulaşın, kazanılan kayıtları Paraşüt'e aktarın.",
            },
            {
              id: "is-birligi-agi",
              icon: "ti-handshake",
              title: "KOBİ İş Birliği Ağı",
              desc: "Binerly'ye kayıtlı KOBİ'ler birbirini keşfedip iş birliği yapabilecek, iş fırsatı paylaşabilecek.",
              badge: "Yakında",
            },
          ].map((f) => (
            <div key={f.id} id={f.id} style={{ display: "flex", gap: 14, background: "#fff", border: "1px solid #e1e8f0", borderRadius: 12, padding: "1.25rem 1.4rem", scrollMarginTop: 80 }}>
              <i className={`ti ${f.icon}`} style={{ fontSize: 19, color: "#185fa5", flex: "none", marginTop: 2 }} aria-hidden="true"></i>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <h3 style={{ fontSize: 14.5, fontWeight: 700, color: "#0c2540", margin: "0 0 5px" }}>{f.title}</h3>
                  {f.badge && (
                    <span style={{ fontSize: 10, fontWeight: 700, color: "#185fa5", background: "#e6f1fb", padding: "2px 8px", borderRadius: 20, marginBottom: 5 }}>{f.badge}</span>
                  )}
                </div>
                <p style={{ fontSize: 13, color: "#5b7088", margin: 0, lineHeight: 1.6 }}>{f.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Sektörler */}
      <div id="sektorler" style={{ maxWidth: 1100, margin: "0 auto", padding: "1rem 2rem 3rem" }}>
        <h2 style={{ textAlign: "center", fontSize: "1.75rem", fontWeight: 700, color: "#0c2540", margin: "0 0 0.75rem" }}>
          Hangi işi yapıyorsanız, dili de ona göre değişir
        </h2>
        <p style={{ textAlign: "center", fontSize: 15, color: "#5b7088", maxWidth: 640, margin: "0 auto 2rem" }}>
          Sektörünüzü seçtiğinizde aşama isimleri, alanlar ve hatta "teklif mi, randevu mu, üyelik mi" dediğimiz otomatik ayarlanır - herkese aynı kalıp değil, işinize uygun bir sistem.
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 }}>
          {SECTOR_PRESETS.filter((s) => s.id !== "genel").map((s) => (
            <div key={s.id} style={{ background: "#fff", border: "1px solid #e1e8f0", borderRadius: 12, padding: "1rem", display: "flex", alignItems: "center", gap: 10 }}>
              <i className={`ti ${s.icon}`} style={{ fontSize: 20, color: "#185fa5", flex: "none" }} />
              <span style={{ fontSize: 13.5, fontWeight: 600, color: "#0c2540" }}>{s.label}</span>
            </div>
          ))}
        </div>
        <p style={{ textAlign: "center", fontSize: 13, color: "#94a7bb", margin: "1.5rem 0 0" }}>
          Listede yoksa da sorun değil - "Genel" ile başlayıp kendi özel alanlarınızı ekleyebilirsiniz.
        </p>
      </div>

      {/* Neden Binerly */}
      <div id="neden-binerly" style={{ background: "#f5f8fc", borderTop: "1px solid #e1e8f0", borderBottom: "1px solid #e1e8f0", scrollMarginTop: 64 }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", padding: "4rem 2rem" }}>
          <div style={{ display: "inline-block", background: "#e6f1fb", color: "#185fa5", fontSize: 12, fontWeight: 600, padding: "4px 12px", borderRadius: 20, marginBottom: 16 }}>
            Neden Binerly?
          </div>
          <h2 style={{ fontSize: "1.75rem", fontWeight: 700, color: "#0c2540", margin: "0 0 1.25rem", maxWidth: 640 }}>
            Ekibiniz büyüsün, faturanız büyümesin
          </h2>
          <p style={{ maxWidth: 680, fontSize: 16, color: "#5b7088", lineHeight: 1.8, margin: "0 0 2.5rem" }}>
            Türkiye'deki CRM'lerin çoğu kullanıcı başına ücretlendiriyor, bazıları da dolar/euro bazlı - ekibiniz büyüdükçe faturanız da büyüyor, kur dalgalandıkça bütçeniz sarsılıyor. Binerly'de öyle değil: 5 kullanıcıya kadar sabit bir ücretle çalışacağız, her zaman TL bazlı.
          </p>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 16, marginBottom: "2.5rem" }}>
            {[
              ["%9,9", "10-49 çalışanlı işletmelerin CRM kullanma oranı"],
              ["%18,4", "50-249 çalışanlı işletmelerde bu oran"],
              ["%90+", "Küçük işletmelerin hâlâ sistemsiz çalıştığı tahmini pay"],
            ].map(([val, cap]) => (
              <div key={cap} style={{ background: "#fff", border: "1px solid #e1e8f0", borderRadius: 12, padding: "1.25rem" }}>
                <div style={{ fontSize: 28, fontWeight: 800, color: "#185fa5" }}>{val}</div>
                <div style={{ fontSize: 12.5, color: "#5b7088", marginTop: 6, lineHeight: 1.5 }}>{cap}</div>
              </div>
            ))}
          </div>
          <p style={{ fontSize: 11.5, color: "#94a7bb", margin: "-14px 0 2.5rem" }}>
            Kaynak: TÜİK, Girişimlerde Bilişim Teknolojileri Kullanım Araştırması, 2025
          </p>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 16 }}>
            {[
              ["ti-list-details", "Dağınıklık", "Müşteri bilgisi telefonda, WhatsApp'ta, Excel'de ve kafanızda - dört farklı yerde."],
              ["ti-eye-off", "Kör nokta", "Bir çalışan izinliyken veya ayrılınca, bildiği müşteri geçmişi de onunla gidiyor."],
              ["ti-clock-x", "Kaçan takip", "\"Yarın ararım\" dediğiniz teklifi unutup fırsatı rakibe kaptırıyorsunuz."],
              ["ti-certificate", "Kurumsal görünmeme", "Elle yazılmış teklif, büyük müşteriye karşı güven vermiyor."],
            ].map(([icon, title, desc]) => (
              <div key={title} style={{ background: "#fff", border: "1px solid #e1e8f0", borderRadius: 12, padding: "1.25rem" }}>
                <i className={`ti ${icon}`} style={{ fontSize: 22, color: "#185fa5", display: "block", marginBottom: 10 }} aria-hidden="true"></i>
                <h3 style={{ fontSize: 14.5, fontWeight: 700, color: "#0c2540", margin: "0 0 6px" }}>{title}</h3>
                <p style={{ fontSize: 13, color: "#5b7088", margin: 0, lineHeight: 1.6 }}>{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Hakkımızda */}
      <div id="hakkimizda" style={{ background: "#fff", borderTop: "1px solid #e1e8f0", borderBottom: "1px solid #e1e8f0", scrollMarginTop: 64 }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", padding: "4rem 2rem" }}>
          <h2 style={{ textAlign: "center", fontSize: "1.75rem", fontWeight: 700, color: "#0c2540", margin: "0 0 1.25rem" }}>
            Hakkımızda
          </h2>
          <p style={{ maxWidth: 720, margin: "0 auto 2.5rem", fontSize: 16, color: "#5b7088", lineHeight: 1.8, textAlign: "center" }}>
            Binerly'yi, KOBİ'lerin gerçek gündelik dertlerinden yola çıkarak kurduk: dağınık Excel tabloları, kaybolan müşteri notları, takip edilemeyen teklifler. Küçük ve orta ölçekli işletmelerin, kurumsal şirketler kadar güçlü ama onlar kadar karmaşık olmayan bir sisteme ihtiyacı olduğunu gördük.
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "2rem 2.5rem" }}>
            {[
              ["ti-bulb", "Misyonumuz", "KOBİ'lerin günlük operasyonel yükünü azaltıp dijitalleştirerek, zamanlarını ve zihinlerini işlerini büyütmeye, işletmelerini daha iyiye taşıyacak kararlar almaya ve müşterileriyle daha kaliteli ilişkiler kurmaya ayırabilmelerini sağlamak."],
              ["ti-telescope", "Vizyonumuz", "Türkiye'deki her KOBİ'nin, büyüklüğüne bakılmaksızın, büyük şirketlerin sahip olduğu güçlü araçlara kolay ve uygun maliyetle erişebildiği bir gelecek."],
              ["ti-shield-check", "Güvenilirlik", "Verileriniz, her hesabın yalnızca kendi kayıtlarına erişebildiği satır bazlı erişim kurallarıyla saklanır - başka bir işletmenin verisine teknik olarak erişim mümkün değildir. KVKK'ya uygun işlenir, asla üçüncü taraflarla paylaşılmaz."],
              ["ti-heart-handshake", "Sizi Dinliyoruz", "Erken erişim aşamasında olduğumuz için Binerly'yi doğrudan kullanıcılarımızın talepleriyle şekillendiriyoruz. İşinize özel eksik bir özellik veya isteğiniz olursa bize ulaşın - değerlendirip mümkün olan en kısa sürede ekleriz."],
            ].map(([icon, title, desc]) => (
              <div key={title} style={{ background: "#f5f8fc", borderRadius: 12, padding: "1.5rem", border: "1px solid #e1e8f0" }}>
                <i className={`ti ${icon}`} style={{ fontSize: 26, color: "#185fa5", display: "block", marginBottom: 12 }} aria-hidden="true"></i>
                <h3 style={{ fontSize: 15, fontWeight: 700, color: "#0c2540", margin: "0 0 8px" }}>{title}</h3>
                <p style={{ fontSize: 13.5, color: "#5b7088", margin: 0, lineHeight: 1.7 }}>{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* SSS */}
      <div style={{ background: "#f5f8fc", padding: "4rem 2rem" }}>
        <h2 style={{ textAlign: "center", fontSize: "1.75rem", fontWeight: 700, color: "#0c2540", margin: "0 0 2rem" }}>
          Sıkça Sorulan Sorular
        </h2>
        <LandingFaq />
      </div>

      {/* CTA */}
      <div style={{ background: "#185fa5", padding: "4rem 2rem", textAlign: "center" }}>
        <h2 style={{ fontSize: "1.75rem", fontWeight: 800, color: "#fff", margin: "0 0 1rem" }}>
          İlk işletmelerden biri olun, ücretsiz kullanın
        </h2>
        <p style={{ fontSize: 16, color: "#b8d4f0", margin: "0 0 2rem" }}>Kredi kartı gerekmez. Erken erişim aşamasındayız, şu an için tamamen ücretsiz.</p>
        <button onClick={() => setAuthModal("register")} style={{ background: "#fff", color: "#185fa5", border: "none", borderRadius: 8, padding: "14px 32px", fontWeight: 700, fontSize: 16, cursor: "pointer" }}>
          Ücretsiz Hesap Oluştur
        </button>
      </div>

      {/* Footer */}
      <div style={{ background: "#fff", borderTop: "1px solid #e1e8f0", padding: "3rem 2rem 1.5rem" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 32 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <img src="/favicon.svg" alt="Binerly" style={{ width: 31, height: 31 }} />
              <span style={{ fontWeight: 700, fontSize: 15, color: "#185fa5" }}>BINERLY</span>
            </div>
            <p style={{ fontSize: 14, fontWeight: 700, color: "#0c2540", margin: "0 0 8px", lineHeight: 1.4 }}>
              KOBİ müşteri ilişkileri, satış ve destek yönetimi için tek platform
            </p>
            <p style={{ fontSize: 13, color: "#5b7088", lineHeight: 1.6, margin: 0 }}>
              Müşteri takibi, teklif ve anlaşmalar, satış sonrası destek ve müşteri bilgi sistemini tek yapıda bir araya getirir.
            </p>
          </div>
          <div>
            <p style={{ fontSize: 12, fontWeight: 700, color: "#0c2540", letterSpacing: 0.5, margin: "0 0 14px" }}>ÇÖZÜMLER</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <a href="#musteri-yonetimi" style={{ fontSize: 13, color: "#5b7088", textDecoration: "none" }}>Müşteri Yönetimi</a>
              <a href="#satis-firsat" style={{ fontSize: 13, color: "#5b7088", textDecoration: "none" }}>Satış & Teklif Yönetimi</a>
              <a href="#destek" style={{ fontSize: 13, color: "#5b7088", textDecoration: "none" }}>Satış Sonrası Destek</a>
              <a href="#musteri-portali" style={{ fontSize: 13, color: "#5b7088", textDecoration: "none" }}>Kendi Müşteri Portalınız</a>
              <a href="#raporlama" style={{ fontSize: 13, color: "#5b7088", textDecoration: "none" }}>Raporlama & Analitik</a>
            </div>
          </div>
          <div>
            <p style={{ fontSize: 12, fontWeight: 700, color: "#0c2540", letterSpacing: 0.5, margin: "0 0 14px" }}>HIZLI ERİŞİM</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <a href="/" style={{ fontSize: 13, color: "#5b7088", textDecoration: "none" }}>Ana Sayfa</a>
              <a href="#sektorler" style={{ fontSize: 13, color: "#5b7088", textDecoration: "none" }}>Sektörler</a>
              <a href="#hakkimizda" style={{ fontSize: 13, color: "#5b7088", textDecoration: "none" }}>Hakkımızda</a>
              <a href="/blog" style={{ fontSize: 13, color: "#5b7088", textDecoration: "none" }}>Blog</a>
              <a href="mailto:info@binerly.com" style={{ fontSize: 13, color: "#5b7088", textDecoration: "none" }}>İletişim</a>
              <a href={getPortalUrl()} style={{ fontSize: 13, color: "#5b7088", textDecoration: "none" }}>Müşteri misiniz? Giriş yapın →</a>
            </div>
          </div>
          <div>
            <p style={{ fontSize: 12, fontWeight: 700, color: "#0c2540", letterSpacing: 0.5, margin: "0 0 14px" }}>YASAL</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <a href="/gizlilik" style={{ fontSize: 13, color: "#5b7088", textDecoration: "none" }}>Gizlilik Politikası</a>
              <a href="/kullanim-kosullari" style={{ fontSize: 13, color: "#5b7088", textDecoration: "none" }}>Kullanım Koşulları</a>
              <a href="/kvkk" style={{ fontSize: 13, color: "#5b7088", textDecoration: "none" }}>KVKK Aydınlatma Metni</a>
            </div>
          </div>
        </div>
        <div style={{ maxWidth: 1100, margin: "2rem auto 0", paddingTop: "1.5rem", borderTop: "1px solid #e1e8f0", fontSize: 13, color: "#94a7bb" }}>
          © 2026 Binerly · KOBİ'ler için CRM · Tüm hakları saklıdır.
        </div>
      </div>
    </div>
  );
}

export default function App() {
  // Aşama mailleri gecikmeli gönderilir (bkz. sendStageEmail) — yanlışlıkla
  // sürüklenip hemen düzeltilen bir teklif için müşteriye yanlış mail gitmesin.
  const stageEmailTimers = useRef(new Map());
  const [session, setSession] = useState(undefined);
  const [tab, setTab] = useState("pano");
  const [customers, setCustomers] = useState([]);
  const [deals, setDeals] = useState([]);
  const [activities, setActivities] = useState([]);
  const [payments, setPayments] = useState([]);
  const [dealLineItems, setDealLineItems] = useState([]);
  const [companyExpenses, setCompanyExpenses] = useState([]);
  const [channelCredentials, setChannelCredentials] = useState([]);
  const [paymentCredentials, setPaymentCredentials] = useState([]);
  const [attachments, setAttachments] = useState([]);
  const [channelMessages, setChannelMessages] = useState([]);
  const [tickets, setTickets] = useState([]);
  const [ticketMessages, setTicketMessages] = useState([]);
  const [kbArticles, setKbArticles] = useState([]);
  const [companySettings, setCompanySettings] = useState(null);
  const [customFieldDefs, setCustomFieldDefs] = useState([]);
  const [priceListItems, setPriceListItems] = useState([]);
  const [stockItems, setStockItems] = useState([]);
  const [priceItemIngredients, setPriceItemIngredients] = useState([]);
  const [pdfTemplates, setPdfTemplates] = useState([]);
  const [editingTemplate, setEditingTemplate] = useState(null);
  const [groupClasses, setGroupClasses] = useState([]);
  const [groupClassEnrollments, setGroupClassEnrollments] = useState([]);
  const [classAttendance, setClassAttendanceState] = useState([]);
  const [groupClassWaitlist, setGroupClassWaitlist] = useState([]);
  const [businessHours, setBusinessHours] = useState([]);
  const [staffShifts, setStaffShifts] = useState([]);
  const [staffLeaveBalances, setStaffLeaveBalances] = useState([]);
  const [staffLeaveRecords, setStaffLeaveRecords] = useState([]);
  const [roomInventory, setRoomInventory] = useState([]);
  const [resources, setResources] = useState([]);
  const [showSectorOnboarding, setShowSectorOnboarding] = useState(false);
  const [showTour, setShowTour] = useState(false);
  const [tourStep, setTourStep] = useState(0);
  const [activationChecklistDismissedClick, setActivationChecklistDismissedClick] = useState(false);
  const [showAskDock, setShowAskDock] = useState(false);
  // v1: üye sayısı kod tarafında henüz sınırlanmıyor, henüz billing yok.
  // Hedef fiyatlandırma "5 kullanıcıya kadar sabit ücret" olarak siteye
  // yazıldı (App.jsx LandingPage, "Neden Binerly" bölümü) — billing
  // eklendiğinde davet oluşturma burada 5 üyeyle sınırlanmalı.
  const [activeTeamId, setActiveTeamId] = useState(undefined);
  const [pendingInvites, setPendingInvites] = useState([]);
  const [dismissedInviteIds, setDismissedInviteIds] = useState([]);
  const [acknowledgedInviteIds, setAcknowledgedInviteIds] = useState([]);
  const [showSettingsHub, setShowSettingsHub] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showSettingsForm, setShowSettingsForm] = useState(false);
  const [showSectorFields, setShowSectorFields] = useState(false);
  const [showImportPriceList, setShowImportPriceList] = useState(false);
  const [showPriceListExport, setShowPriceListExport] = useState(false);
  const [showFreeServiceModal, setShowFreeServiceModal] = useState(false);
  const [showBusinessHours, setShowBusinessHours] = useState(false);
  const [businessHoursTab, setBusinessHoursTab] = useState("saatler");
  const [showRoomInventory, setShowRoomInventory] = useState(false);
  const [showPdfTemplates, setShowPdfTemplates] = useState(false);
  const [showPaymentSettings, setShowPaymentSettings] = useState(false);
  const [showTeamModal, setShowTeamModal] = useState(false);
  const [showAppSettings, setShowAppSettings] = useState(false);
  const [showTrashHistory, setShowTrashHistory] = useState(false);
  const [showImportCustomers, setShowImportCustomers] = useState(false);
  const [showImportDeals, setShowImportDeals] = useState(false);
  const [showParasutExport, setShowParasutExport] = useState(false);
  const [showCustomerExport, setShowCustomerExport] = useState(false);
  const [showDealExport, setShowDealExport] = useState(false);
  const [showImportTickets, setShowImportTickets] = useState(false);
  const [showImportKbArticles, setShowImportKbArticles] = useState(false);
  const [showPasswordRecovery, setShowPasswordRecovery] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showCustomerForm, setShowCustomerForm] = useState(false);
  const [showDealForm, setShowDealForm] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState(null);
  const [editingDeal, setEditingDeal] = useState(null);
  const [viewingCustomer, setViewingCustomer] = useState(null);
  const [emlakMatches, setEmlakMatches] = useState(null); // { deal, matches } — Gölge Avcı sonuçları
  const [listingTextDeal, setListingTextDeal] = useState(null); // İlan Metni Sihirbazı için seçili teklif
  const [panoRange, setPanoRange] = useState("tum_zamanlar");
  const [pendingLostReasonMove, setPendingLostReasonMove] = useState(null); // { dealId }
  const [showCampaignModal, setShowCampaignModal] = useState(false);
  const [confirmDeleteCustomer, setConfirmDeleteCustomer] = useState(null);
  const [confirmDeleteDeal, setConfirmDeleteDeal] = useState(null);
  const [customerSearch, setCustomerSearch] = useState("");
  const [customerFromDate, setCustomerFromDate] = useState("");
  const [customerToDate, setCustomerToDate] = useState("");
  const [customerSectorFilter, setCustomerSectorFilter] = useState("all");
  const [customerTypeFilter, setCustomerTypeFilter] = useState("all");
  const [customerConsentFilter, setCustomerConsentFilter] = useState("all");
  const [customerSort, setCustomerSort] = useState("newest");
  const [dealSearch, setDealSearch] = useState("");
  const [dealFromDate, setDealFromDate] = useState("");
  const [dealToDate, setDealToDate] = useState("");
  const [dealStageFilter, setDealStageFilter] = useState("all");
  const [dealPaymentFilter, setDealPaymentFilter] = useState("all");
  const [dealSort, setDealSort] = useState("newest");
  const [dealAudience, setDealAudience] = useState("kurumsal");
  const [dealView, setDealView] = useState(() => localStorage.getItem("binerly_deal_view") || "list");
  const [dragDealId, setDragDealId] = useState(null);
  const [expandedKanbanStages, setExpandedKanbanStages] = useState(() => new Set());
  const changeDealView = (view) => {
    setDealView(view);
    localStorage.setItem("binerly_deal_view", view);
  };
  // "İlgilenilmesi gereken" hızlı filtresi — sektörün gerçek yeteneğine göre farklı
  // bir tarih alanına bakar (randevu/görüşme tarihi, otel giriş-çıkış, hatırlatma),
  // ders programı olan sektörlerde ise tamamen farklı iki kontrol kullanır.
  const [dealQuickDateFilter, setDealQuickDateFilter] = useState("all"); // "all" | "today" | "week" | "month"
  const [dealTodayClassFilter, setDealTodayClassFilter] = useState(false);
  const [dealMembershipExpiryFilter, setDealMembershipExpiryFilter] = useState("all"); // "all" | "1m" | "3m" | "6m"
  const [teklifDeal, setTeklifDeal] = useState(null);
  const [paymentsDeal, setPaymentsDeal] = useState(null);
  const [paymentModeDeal, setPaymentModeDeal] = useState(null);
  const [leadCaptureLink, setLeadCaptureLink] = useState(null);
  const [leadCaptureShareNumber, setLeadCaptureShareNumber] = useState("");
  const [appointmentLink, setAppointmentLink] = useState(null);
  const [showPortalLinkModal, setShowPortalLinkModal] = useState(false);
  const [quickList, setQuickList] = useState(null);
  const [initialViewTicketId, setInitialViewTicketId] = useState(null);
  const [initialChatCustomerId, setInitialChatCustomerId] = useState(null);
  const [selectedChatTicketId, setSelectedChatTicketId] = useState(null);
  const [toast, setToast] = useState(null);
  const [pushSubscribed, setPushSubscribed] = useState(false);
  const [teamMembers, setTeamMembers] = useState([]);
  const [teamRoster, setTeamRoster] = useState([]);

  // Ham Postgres/ağ hataları (ör. "violates foreign key constraint") 89+
  // notify() çağrısına ${error.message} olarak sızıyordu - tek merkezi bu
  // noktadan (bkz. shared.jsx humanizeDbMessage) bilinen kalıplar Türkçeye
  // çevrilir, tanınmayanlar olduğu gibi kalır.
  const notify = (message, tone = "danger") => setToast({ message: humanizeDbMessage(message), tone });

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (companySettings?.preferredCustomerType) setDealAudience(companySettings.preferredCustomerType);
  }, [companySettings?.preferredCustomerType]);

  const [theme, setTheme] = useTheme();

  useSessionTimeout(session, () => {
    supabase.auth.signOut();
    alert("Oturumunuz uzun süre hareketsiz kaldığı için sona erdi. Lütfen tekrar giriş yapın.");
  });

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      if (event === "PASSWORD_RECOVERY") setShowPasswordRecovery(true);
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) {
      setCustomers([]); setDeals([]); setActivities([]); setPayments([]); setCompanyExpenses([]);
      setChannelCredentials([]); setPaymentCredentials([]); setAttachments([]); setChannelMessages([]);
      setTickets([]); setTicketMessages([]); setKbArticles([]);
      setCompanySettings(null);
      setCustomFieldDefs([]);
      setPriceListItems([]);
      setStockItems([]); setPriceItemIngredients([]);
      setGroupClasses([]); setGroupClassEnrollments([]); setClassAttendanceState([]); setGroupClassWaitlist([]);
      setBusinessHours([]);
      setRoomInventory([]);
      setResources([]);
      setDealLineItems([]);
      setActiveTeamId(undefined);
      setPendingInvites([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    Promise.all([
      supabase.from("customers").select("*").is("deleted_at", null).order("created_at"),
      supabase.from("deals").select("*").is("deleted_at", null).order("created_at"),
      supabase.from("activities").select("*").order("created_at"),
      supabase.from("payments").select("*").is("deleted_at", null).order("paid_at"),
      supabase.from("company_expenses").select("*").is("deleted_at", null).order("expense_date"),
      supabase.from("channel_credentials").select("id, user_id, channel, external_id, display_name, connected_at"),
      supabase.from("payment_credentials").select("id, user_id, provider, sandbox, connected_at"),
      supabase.from("attachments").select("*").is("deleted_at", null).order("created_at", { ascending: false }),
      supabase.from("channel_messages").select("*").order("created_at", { ascending: false }).limit(500),
      supabase.from("tickets").select("*").is("deleted_at", null).order("created_at"),
      supabase.from("ticket_messages").select("*").order("created_at"),
      supabase.from("kb_articles").select("*").is("deleted_at", null).order("created_at"),
      supabase.from("company_settings").select("*"),
      supabase.from("custom_field_defs").select("*").order("sort_order"),
      supabase.from("price_list_items").select("*").order("name"),
      supabase.from("group_classes").select("*").is("deleted_at", null).order("weekday").order("start_time"),
      supabase.from("group_class_enrollments").select("*"),
      supabase.from("class_attendance").select("*"),
      supabase.from("business_hours").select("*").order("weekday").order("start_time"),
      supabase.from("staff_shifts").select("*").order("weekday").order("start_time"),
      supabase.from("staff_leave_balances").select("*"),
      supabase.from("staff_leave_records").select("*").order("start_date"),
      supabase.from("room_inventory").select("*").order("room_type"),
      supabase.from("resources").select("*").order("name"),
      supabase.from("deal_pdf_templates").select("*").order("created_at"),
      supabase.from("deal_line_items").select("*").order("sort_order"),
      supabase.from("stock_items").select("*").is("deleted_at", null).order("name"),
      supabase.from("price_item_ingredients").select("*"),
      supabase.from("group_class_waitlist").select("*").order("created_at"),
      supabase.from("team_members").select("team_id").eq("member_id", session.user.id).maybeSingle(),
      supabase.from("team_invites").select("*").eq("status", "pending"),
    ]).then(([{ data: c }, { data: d }, { data: a }, { data: pay }, { data: exp }, { data: cred }, { data: payCred }, { data: att }, { data: chMsg }, { data: t }, { data: tm }, { data: kb }, { data: cs }, { data: cfd }, { data: pli }, { data: gc }, { data: gce }, { data: catt }, { data: bh }, { data: ss }, { data: slb }, { data: slr }, { data: ri }, { data: res }, { data: pdft }, { data: dli }, { data: stk }, { data: pii }, { data: gcw }, { data: myMembership }, { data: invites }]) => {
      // customers/deals/company_settings RLS'i, sahiplik politikasına ek olarak
      // portal kullanıcılarının kendi bağlı oldukları kayıtları görmesine izin
      // veren bir politikayla da "veya" ile birleşiyor (customer_*_view'ların
      // security_invoker olması için gerekli). Aynı hesap hem şirket sahibi hem
      // başka bir firmanın portal müşterisiyse, RLS her ikisini de döndürebilir —
      // burada sadece aktif takıma ait kayıtlara ek bir filtre uyguluyoruz.
      const ownerId = myMembership ? myMembership.team_id : session.user.id;
      setCustomers((c || []).filter((row) => row.user_id === ownerId).map(rowToCustomer));
      setDeals((d || []).filter((row) => row.user_id === ownerId).map(rowToDeal));
      setActivities((a || []).map(rowToActivity));
      setPayments((pay || []).map(rowToPayment));
      setDealLineItems((dli || []).map(rowToDealLineItem));
      setCompanyExpenses((exp || []).map(rowToCompanyExpense));
      setChannelCredentials((cred || []).map(rowToChannelCredential));
      setPaymentCredentials((payCred || []).map(rowToPaymentCredential));
      setAttachments((att || []).filter((row) => row.user_id === ownerId).map(rowToAttachment));
      setChannelMessages((chMsg || []).map(rowToChannelMessage));
      setTickets((t || []).map(rowToTicket));
      setTicketMessages((tm || []).map(rowToTicketMessage));
      setKbArticles((kb || []).map(rowToKbArticle));
      const ownCompanySettings = (cs || []).find((row) => row.user_id === ownerId);
      setCompanySettings(ownCompanySettings ? rowToCompanySettings(ownCompanySettings) : null);
      setCustomFieldDefs((cfd || []).map(rowToCustomFieldDef));
      setPriceListItems((pli || []).filter((row) => row.user_id === ownerId).map(rowToPriceListItem));
      setGroupClasses((gc || []).filter((row) => row.user_id === ownerId).map(rowToGroupClass));
      setGroupClassEnrollments((gce || []).filter((row) => row.user_id === ownerId).map(rowToGroupClassEnrollment));
      setClassAttendanceState((catt || []).filter((row) => row.user_id === ownerId).map(rowToClassAttendance));
      setBusinessHours((bh || []).filter((row) => row.user_id === ownerId).map(rowToBusinessHours));
      setStaffShifts((ss || []).filter((row) => row.user_id === ownerId).map(rowToStaffShift));
      setStaffLeaveBalances((slb || []).filter((row) => row.user_id === ownerId).map(rowToStaffLeaveBalance));
      setStaffLeaveRecords((slr || []).filter((row) => row.user_id === ownerId).map(rowToStaffLeaveRecord));
      setRoomInventory((ri || []).filter((row) => row.user_id === ownerId).map(rowToRoomInventory));
      setResources((res || []).filter((row) => row.user_id === ownerId).map(rowToResource));
      setPdfTemplates((pdft || []).filter((row) => row.user_id === ownerId).map(rowToPdfTemplate));
      setStockItems((stk || []).filter((row) => row.user_id === ownerId).map(rowToStockItem));
      setPriceItemIngredients((pii || []).filter((row) => row.user_id === ownerId).map(rowToPriceItemIngredient));
      setGroupClassWaitlist((gcw || []).filter((row) => row.user_id === ownerId).map(rowToWaitlistEntry));
      setActiveTeamId(ownerId);
      // Sadece BANA gelen davetler (kendi gönderdiklerim değil) — RLS iki SELECT
      // politikasını OR ile birleştirdiği için burada e-postaya göre ek filtre şart.
      setPendingInvites(
        (invites || []).filter(
          (inv) => inv.owner_id !== session.user.id && inv.email?.toLowerCase() === session.user.email?.toLowerCase()
        )
      );
      setLoading(false);
    });
  }, [session]);

  // Müşteri kendi onay linkinden öderse, kayıt KOBİ'nin oturumundan bağımsız
  // (service-role, webhook) bir yoldan yazılıyor — sayfa yenilenmeden bunu
  // görebilmek için payments/deals'ı canlı dinliyoruz. company_expenses de aynı
  // webhook'tan (recordSuccessfulPayment, iyzico/PayTR komisyon gideri) yazılıyor —
  // o da eklenmezse Gelir-Gider Defteri'nde komisyon gideri sayfa yenilenene kadar
  // görünmüyordu (canlıda fark edildi, 2026-07-22).
  useEffect(() => {
    if (!activeTeamId) return;
    const channel = supabase
      .channel(`live-${activeTeamId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "payments", filter: `user_id=eq.${activeTeamId}` }, (payload) => {
        setPayments((prev) => (prev.some((p) => p.id === payload.new.id) ? prev : [...prev, rowToPayment(payload.new)]));
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "payments", filter: `user_id=eq.${activeTeamId}` }, (payload) => {
        setPayments((prev) =>
          payload.new.deleted_at
            ? prev.filter((p) => p.id !== payload.new.id)
            : prev.map((p) => (p.id === payload.new.id ? rowToPayment(payload.new) : p))
        );
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "deals", filter: `user_id=eq.${activeTeamId}` }, (payload) => {
        setDeals((prev) => prev.map((d) => (d.id === payload.new.id ? rowToDeal(payload.new) : d)));
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "company_expenses", filter: `user_id=eq.${activeTeamId}` }, (payload) => {
        setCompanyExpenses((prev) => (prev.some((e) => e.id === payload.new.id) ? prev : [...prev, rowToCompanyExpense(payload.new)]));
      })
      // Portal "Mesajlar" sohbetinin anlık gelmesi için — müşteri sayfayı
      // yenilemeden mesaj yazınca admin tarafında da beklemeden görünsün.
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "ticket_messages", filter: `user_id=eq.${activeTeamId}` }, (payload) => {
        setTicketMessages((prev) => (prev.some((m) => m.id === payload.new.id) ? prev : [...prev, rowToTicketMessage(payload.new)]));
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [activeTeamId]);

  useEffect(() => {
    if (loading || !session || !activeTeamId) return;
    if (activeTeamId !== session.user.id) return; // sadece gerçek şirket sahibi görür, davet edilen takım üyesi görmez
    if (companySettings?.sector) return;
    if (localStorage.getItem(`binerly_sector_onboarding_dismissed_${activeTeamId}`)) return;
    setShowSectorOnboarding(true);
  }, [loading, session, activeTeamId, companySettings]);

  useEffect(() => {
    if (!session || !("serviceWorker" in navigator)) { setPushSubscribed(false); return; }
    navigator.serviceWorker.ready
      .then((registration) => registration.pushManager.getSubscription())
      .then((sub) => setPushSubscribed(!!sub))
      .catch(() => {});
  }, [session]);

  // "Sorumlu" seçimi ve Personel Performansı için takım üyesi listesi — bulk
  // fetch'in içinde olamaz çünkü activeTeamId o fetch'in SONUCUNDA belli oluyor.
  // Bu sorgu RLS gereği owner için tüm takımı, normal üye için SADECE KENDİ
  // satırını döner (bilerek — prim/koltuk kirası gibi hassas alanlar burada,
  // başka üyelere hiç açılmasın diye team_roster()'a taşınmadı).
  useEffect(() => {
    if (!activeTeamId) { setTeamMembers([]); return; }
    supabase.from("team_members").select("member_id, email, name, can_edit_settings, commission_percent, chair_rental_fee").eq("team_id", activeTeamId).then(({ data }) => {
      setTeamMembers((data || []).map((m) => ({
        id: m.member_id, email: m.email, name: m.name || null, canEditSettings: m.can_edit_settings || false,
        commissionPercent: m.commission_percent != null ? Number(m.commission_percent) : null,
        chairRentalFee: m.chair_rental_fee != null ? Number(m.chair_rental_fee) : null,
      })));
    });
  }, [activeTeamId]);

  // team_roster(): sadece id+isim+e-posta — SECURITY DEFINER fonksiyon
  // sayesinde owner VEYA normal üye fark etmeksizin takımın TAMAMI görünür.
  // "Sorumlu" dropdown'u ve Vardiya'daki isim gösterimi burayı kullanır;
  // Personel Performansı/canEditSettings gibi hassas alanlar hâlâ yukarıdaki
  // kısıtlı teamMembers'tan geliyor.
  useEffect(() => {
    if (!activeTeamId) { setTeamRoster([]); return; }
    supabase.rpc("team_roster").then(({ data }) => {
      setTeamRoster((data || []).map((m) => ({ id: m.member_id, email: m.email, name: m.name || null })));
    });
  }, [activeTeamId]);

  const updateTeamMemberCommission = async (memberId, { commissionPercent, chairRentalFee }) => {
    const { error } = await supabase
      .from("team_members")
      .update({ commission_percent: commissionPercent, chair_rental_fee: chairRentalFee })
      .eq("member_id", memberId)
      .eq("team_id", activeTeamId);
    if (error) { notify(`Prim bilgisi güncellenemedi: ${error.message}`); return; }
    setTeamMembers((prev) => prev.map((m) => (m.id === memberId ? { ...m, commissionPercent, chairRentalFee } : m)));
  };

  // Açılış sayfasındaki "#ozellikler" gibi demir bağlantılardan giriş yapılınca
  // hash URL'de kalıp uygulama içinde sekme değiştirse bile hiç temizlenmiyordu
  // (sekmeler URL değil state ile yönetiliyor) — oturum açılınca bir kere temizle.
  useEffect(() => {
    if (session && window.location.hash) {
      window.history.replaceState({}, "", window.location.pathname + window.location.search);
    }
  }, [session]);

  // Push bildirimi tıklanınca gelen ?tab= derin bağlantısı (randevu bildirimleri
  // gibi veri yüklenmesini beklemesi gerekmeyen durumlar için) — sayfa açılır
  // açılmaz bir kere işlenir, sonra URL'den temizlenir.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tabParam = params.get("tab");
    if (!tabParam) return;
    setTab(tabParam);
    const url = new URL(window.location.href);
    url.searchParams.delete("tab");
    window.history.replaceState({}, "", url);
     
  }, []);

  // Push bildirimi tıklanınca gelen ?ticket= derin bağlantısı — talepler yüklendikten
  // sonra bir kere işlenir, sonra URL'den temizlenir.
  useEffect(() => {
    if (tickets.length === 0) return;
    const params = new URLSearchParams(window.location.search);
    const ticketId = params.get("ticket");
    if (!ticketId) return;
    const matched = tickets.find((t) => t.id === ticketId);
    if (matched) {
      if (matched.isGeneralChat) { setTab("mesajlar"); setInitialChatCustomerId(matched.customerId); }
      else { setTab("destek"); setInitialViewTicketId(ticketId); }
    }
    const url = new URL(window.location.href);
    url.searchParams.delete("ticket");
    window.history.replaceState({}, "", url);
  }, [tickets]);

  // initialChatCustomerId'yi (yukarıdaki push bildirimi derin bağlantısından)
  // ilgili sohbete çevirir — bu hook'un erken return'lerden (session/loading
  // kontrolü) ÖNCE olması şart, aksi halde "Rendered more hooks than during
  // the previous render" hatası çıkar (ilk render'da hook hiç çağrılmaz).
  useEffect(() => {
    if (!initialChatCustomerId) return;
    const t = tickets.find((x) => x.isGeneralChat && x.customerId === initialChatCustomerId);
    if (t) setSelectedChatTicketId(t.id);
    setInitialChatCustomerId(null);
  }, [initialChatCustomerId, tickets]);

  const subscribeToPush = async () => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      notify("Bu tarayıcı bildirim özelliğini desteklemiyor.");
      return;
    }
    if (!import.meta.env.VITE_VAPID_PUBLIC_KEY) {
      notify("Bildirim sistemi henüz yapılandırılmadı.");
      return;
    }
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") return;
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(import.meta.env.VITE_VAPID_PUBLIC_KEY),
      });
      const json = subscription.toJSON();
      const { error } = await supabase.from("push_subscriptions").upsert(
        { user_id: session.user.id, endpoint: json.endpoint, p256dh: json.keys.p256dh, auth_key: json.keys.auth },
        { onConflict: "endpoint" }
      );
      if (error) { notify(`Bildirim aboneliği kaydedilemedi: ${error.message}`); return; }
      setPushSubscribed(true);
    } catch {
      notify("Bildirim izni alınamadı.");
    }
  };

  const unsubscribeFromPush = async () => {
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        await supabase.from("push_subscriptions").delete().eq("endpoint", subscription.endpoint);
        await subscription.unsubscribe();
      }
    } catch {
      // yoksay — yerel abonelik zaten yoksa temizlenecek bir şey yok
    }
    setPushSubscribed(false);
  };

  // Denetim kaydı — asıl CRUD işlemini asla engellemez, başarısız olursa sadece konsola yazar.
  const logAction = async (entityType, entityId, action, summary) => {
    const { error } = await supabase.from("audit_log").insert({
      id: uid(),
      user_id: activeTeamId,
      actor_id: session.user.id,
      actor_email: session.user.email,
      entity_type: entityType,
      entity_id: entityId,
      action,
      summary,
    });
    if (error) console.error("audit log yazılamadı:", error.message);
  };

  // Müşteriye önemli gelişmelerde otomatik bilgilendirme e-postası — asıl işlemi
  // asla engellemez, şirket ayarlarından kapatılabilir, e-postası olmayan
  // müşteriler için sessizce atlanır.
  const notifyCustomerByEmail = async (customer, subject, message, opts = {}) => {
    // "Müşterilere önemli gelişmelerde otomatik e-posta gönder" kapalıysa, aşama
    // değişikliği/ödeme/destek gibi OPERASYONEL bildirimler susturulur - ama
    // izin isteği bunlardan biri DEĞİL, ticari ileti bile sayılmıyor
    // (bkz. requestCustomerConsent), o yüzden opts.ignoreNotificationToggle ile
    // bu kontrolü atlayabiliyor. KOBİ'nin bu anahtarı kapatmış olması, müşteriden
    // hiçbir zaman izin alamaması anlamına gelmemeli.
    if (!opts.ignoreNotificationToggle && companySettings?.customerNotificationsEnabled !== true) return false;
    if (!customer?.email) return false;
    try {
      const res = await fetch("/api/send-campaign", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({
          recipients: [customer.email],
          subject,
          message,
          replyTo: session.user.email,
          companyName: companySettings?.companyName,
          logoUrl: companySettings?.logoUrl,
          ctaUrl: opts.ctaUrl,
          ctaLabel: opts.ctaLabel,
        }),
      });
      return res.ok;
    } catch {
      return false; // bildirim maili başarısız olsa da asıl işlemi bozmaz
    }
  };

  // KOBİ'nin kendi eklediği bir müşteri için pazarlama izni — KOBİ'nin kendi
  // beyanı (bir kutuyu işaretlemesi) tek başına gerçek bir onay sayılmıyor, bu
  // yüzden müşteriye kendisinin tıklayıp onaylayacağı bir link gönderiliyor (çift
  // onay/double opt-in, deal-approval.js action=confirm-marketing-consent). Yeni
  // müşteri eklenirken otomatik, veya Müşteri Kayıtları/Kampanya Gönder ekranından
  // elle tekrar tetiklenebilir. SADECE pazarlama izni içindir — fotoğraf izni ayrı
  // bir akış (bkz. requestPhotoConsent), 2026-07-31'de BİLEREK ayrıldı: alakasız
  // iki izni (e-posta + fotoğraf) tek kutuya bağlamak hem KVKK'da "belirli rıza"
  // ilkesine aykırıydı hem de ilk temasta müşterinin gözünü korkutuyordu.
  const requestCustomerConsent = async (customer) => {
    const token = uid();
    const { error } = await supabase.from("customers").update({ marketing_consent_token: token }).eq("id", customer.id);
    if (error) { notify(`İzin isteği gönderilemedi: ${error.message}`); return; }
    const consentUrl = `https://binerly.com/api/deal-approval?action=confirm-marketing-consent&token=${token}`;
    const company = companySettings?.companyName || "İşletmemiz";

    // E-postası hiç yoksa e-posta gönderemeyiz — bunun yerine linki paylaşıyoruz
    // (Portal linkindeki "Linki paylaş" ile aynı desen: telefon varsa WhatsApp,
    // yoksa panoya kopyala). Linkteki sayfa (deal-approval.js) müşteriden hem
    // e-postasını isteyip hem izni tek adımda kaydediyor.
    if (!customer.email) {
      const message = `Merhaba, ${company} olarak size kampanya ve değerlendirme isteği gibi e-postalar gönderebilmemiz için izninize ihtiyacımız var, bu linkten e-postanızı girip izin verebilirsiniz: ${consentUrl}`;
      if (customer.phone) {
        window.open(`https://wa.me/${toWhatsAppNumber(customer.phone)}?text=${encodeURIComponent(message)}`, "_blank", "noopener,noreferrer");
      } else {
        navigator.clipboard.writeText(consentUrl);
        notify("İzin linki kopyalandı - müşteriye paylaşabilirsiniz.", "success");
      }
      return;
    }

    const sent = await notifyCustomerByEmail(
      customer,
      `${companySettings?.companyName || "Binerly"} - İzninizi onaylar mısınız?`,
      `Merhaba ${customer.name || ""},\n\n${company} olarak size kampanya, değerlendirme isteği gibi e-postalar gönderebilmemiz için izninize ihtiyacımız var. Onaylamak için aşağıdaki butona tıklayabilirsiniz.`,
      { ctaUrl: consentUrl, ctaLabel: "İzin Ver", ignoreNotificationToggle: true }
    );
    if (sent) notify(`${customer.name} adlı müşteriye izin e-postası gönderildi.`, "success");
    else notify(`${customer.name} adlı müşteriye izin e-postası gönderilemedi - lütfen tekrar deneyin.`);
  };

  // Fotoğraf saklama izni — SADECE öncesi/sonrası fotoğrafını gerçekten çekecek
  // olan yerden (BeforeAfterPhotos paneli, DealForm) tetiklenir, çünkü işletme her
  // müşterisinin fotoğrafını çekmeyecektir; bunu baştan herkese sormak yerine tam
  // o an, o müşteriye özel istemek daha doğru. Aynı marketing_consent_token
  // kolonunu paylaşır (aynı anda ikisi birden istenmediği için çakışma riski yok),
  // ama onay linki AYRI bir action'a (confirm-photo-consent) gider ve SADECE
  // photo_consent'i işaretler — marketing_consent'e hiç dokunmaz.
  const requestPhotoConsent = async (customer) => {
    const token = uid();
    const { error } = await supabase.from("customers").update({ marketing_consent_token: token }).eq("id", customer.id);
    if (error) { notify(`İzin isteği gönderilemedi: ${error.message}`); return; }
    const consentUrl = `https://binerly.com/api/deal-approval?action=confirm-photo-consent&token=${token}`;
    const company = companySettings?.companyName || "İşletmemiz";

    if (!customer.email) {
      const message = `Merhaba, ${company} olarak hizmet öncesi/sonrası fotoğraflarınızı çekip saklayabilmemiz için izninize ihtiyacımız var, bu linkten e-postanızı girip izin verebilirsiniz: ${consentUrl}`;
      if (customer.phone) {
        window.open(`https://wa.me/${toWhatsAppNumber(customer.phone)}?text=${encodeURIComponent(message)}`, "_blank", "noopener,noreferrer");
      } else {
        navigator.clipboard.writeText(consentUrl);
        notify("İzin linki kopyalandı - müşteriye paylaşabilirsiniz.", "success");
      }
      return;
    }

    const sent = await notifyCustomerByEmail(
      customer,
      `${companySettings?.companyName || "Binerly"} - Fotoğraf izniniz`,
      `Merhaba ${customer.name || ""},\n\n${company} olarak hizmet öncesi/sonrası fotoğraflarınızı çekip saklayabilmemiz için izninize ihtiyacımız var. Onaylamak için aşağıdaki butona tıklayabilirsiniz.`,
      { ctaUrl: consentUrl, ctaLabel: "İzin Ver", ignoreNotificationToggle: true }
    );
    if (sent) notify(`${customer.name} adlı müşteriye fotoğraf izni e-postası gönderildi.`, "success");
    else notify(`${customer.name} adlı müşteriye izin e-postası gönderilemedi - lütfen tekrar deneyin.`);
  };

  // Teklif/anlaşma her aşamaya geçtiğinde müşteriye o aşamaya özel bir mail —
  // "Teklif" ve "Müzakere" aşamalarında onay linki de eklenir (generateApprovalLink
  // token'ı idempotent üretir/döner, tekrar tekrar çağırmak güvenli).
  const STAGE_EMAIL_CONTENT = {
    ilk_gorusme: {
      subject: () => "Sizinle görüştüğümüz için teşekkürler",
      needsLink: false,
      body: (deal, company) => `Merhaba,\n\n${company} olarak "${deal.title}" ile ilgileniyoruz. Kısa süre içinde sizinle tekrar iletişime geçeceğiz.`,
    },
    teklif: {
      subject: (title) => `${title} hazır`,
      needsLink: true,
      body: (deal, company) => `Merhaba,\n\n${company} sizin için hazırladı: "${deal.title}" - ${formatTL(deal.value)}`,
    },
    muzakere: {
      subject: (title) => `${title} güncellendi`,
      needsLink: true,
      body: (deal) => `Merhaba,\n\n"${deal.title}" üzerinde konuştuğumuz güncellemeler yapıldı.`,
    },
    kazanildi: {
      subject: (title) => `${title} tamamlandı`,
      needsLink: false,
      body: (deal) => `Merhaba,\n\n"${deal.title}" ile sürecimiz tamamlandı. Bizi tercih ettiğiniz için teşekkür ederiz!`,
    },
    kaybedildi: {
      subject: (title) => `${title} hakkında`,
      needsLink: false,
      body: (deal) => `Merhaba,\n\n"${deal.title}" ile ilgili süreç şu an için sonlandırıldı. İlerleyen dönemde tekrar sizinle çalışmaktan memnuniyet duyarız.`,
    },
  };

  // 45 saniye gecikmeli gönderilir — bu süre içinde aynı teklifin aşaması
  // tekrar değişirse (yanlış sürükleyip hemen düzeltmek gibi) önceki
  // zamanlayıcı iptal edilir, müşteriye sadece son karar verilen aşama için
  // mail gider.
  const sendStageEmail = (deal, stage) => {
    const existing = stageEmailTimers.current.get(deal.id);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(async () => {
      stageEmailTimers.current.delete(deal.id);
      const cfg = STAGE_EMAIL_CONTENT[stage];
      if (!cfg) return;
      const customer = customers.find((c) => c.id === deal.customerId);
      if (!customer?.email) return;
      const company = companySettings?.companyName || "Binerly";
      const ctaUrl = cfg.needsLink ? await generateApprovalLink(deal) : null;
      notifyCustomerByEmail(customer, `${cfg.subject(deal.title)} - ${company}`, cfg.body(deal, company), {
        ctaUrl,
        ctaLabel: DEAL_WORD_FORMS[dealWordKind(companySettings?.sector)].ctaLabel,
      });
    }, 45000);
    stageEmailTimers.current.set(deal.id, timer);
  };

  const addActivity = async ({ customerId, type, content }) => {
    const row = {
      id: uid(),
      user_id: activeTeamId,
      customer_id: customerId,
      type,
      content,
    };
    const { data, error } = await supabase.from("activities").insert(row).select().single();
    if (error) { notify(`Kayıt eklenemedi: ${error.message}`); return; }
    const activity = rowToActivity(data);
    setActivities((prev) => [...prev, activity]);
    await touchCustomer(customerId);
    const customer = customers.find((c) => c.id === customerId);
    const typeLabel = ACTIVITY_TYPES.find((x) => x.id === type)?.label || type;
    logAction("customers", customerId, "updated", `${customer?.name || "Müşteri"} için ${typeLabel} eklendi`);
  };

  const upsertCustomer = async (c) => {
    const isNew = !customers.some((x) => x.id === c.id);
    const row = {
      id: c.id,
      user_id: activeTeamId,
      name: c.name,
      customer_type: c.customerType || "kurumsal",
      sector: c.sector,
      region: c.region,
      address: c.address,
      phone: c.phone,
      email: c.email,
      notes: c.notes,
      tags: c.tags || [],
      custom_fields: c.customFields || {},
      last_contact: c.lastContact,
      created_at: c.createdAt,
    };
    const { data, error } = await supabase.from("customers").upsert(row).select().single();
    if (error) { notify(`Müşteri kaydedilemedi: ${error.message}`); return; }
    const customer = rowToCustomer(data);
    setCustomers((prev) =>
      prev.some((x) => x.id === customer.id) ? prev.map((x) => (x.id === customer.id ? customer : x)) : [...prev, customer]
    );
    setShowCustomerForm(false);
    setEditingCustomer(null);
    logAction("customers", customer.id, isNew ? "created" : "updated", `${customer.name} ${isNew ? "oluşturuldu" : "güncellendi"}`);
    // Bir sonraki müşteri/teklif formunun hangi türle açılacağını belirler -
    // formdaki dropdown değişince değil, kayıt gerçekten başarılı olunca
    // güncellenir (aksi halde vazgeçilen bir form bile Fırsatlar sekmesinin
    // görünümünü sessizce değiştiriyordu).
    if (isNew) updatePreferredCustomerType(customer.customerType);
    // Sadece manuel "Yeni Müşteri" akışında otomatik tetiklenir - toplu içe
    // aktarma bulkInsertChunked kullanıyor, bu yüzden tek seferde yüzlerce izin
    // e-postası gitme riski yok.
    if (isNew && customer.email) requestCustomerConsent(customer);
  };

  const deleteCustomer = async (id) => {
    const customer = customers.find((c) => c.id === id);
    const customerDeals = deals.filter((d) => d.customerId === id);
    const customerTickets = tickets.filter((t) => t.customerId === id);
    const dealIds = customerDeals.map((d) => d.id);
    const cascadePayments = payments.filter((p) => dealIds.includes(p.dealId));
    const batchId = uid();
    const now = new Date().toISOString();

    if (dealIds.length > 0) {
      const { error: payErr } = await supabase
        .from("payments")
        .update({ deleted_at: now, deleted_batch_id: batchId })
        .in("deal_id", dealIds);
      if (payErr) { notify(`Müşteri silinemedi: ${payErr.message}`); return; }
    }
    const { error: dealErr } = await supabase
      .from("deals")
      .update({ deleted_at: now, deleted_batch_id: batchId })
      .eq("customer_id", id);
    if (dealErr) { notify(`Müşteri silinemedi: ${dealErr.message}`); return; }
    const { error: ticketErr } = await supabase
      .from("tickets")
      .update({ deleted_at: now, deleted_batch_id: batchId })
      .eq("customer_id", id);
    if (ticketErr) { notify(`Müşteri silinemedi: ${ticketErr.message}`); return; }
    const { error } = await supabase
      .from("customers")
      .update({ deleted_at: now, deleted_batch_id: batchId })
      .eq("id", id);
    if (error) { notify(`Müşteri silinemedi: ${error.message}`); return; }
    // group_class_enrollments'ın deleted_at'i yok (deleteGroupClass ile aynı
    // desen — hard delete) — yoksa "hayalet" kayıt kontenjanı işgal etmeye
    // devam eder, ders geri geldiğinde müşteri zaten silinmiş olur.
    await supabase.from("group_class_enrollments").delete().eq("customer_id", id);
    await supabase.from("attachments").update({ deleted_at: now, deleted_batch_id: batchId }).eq("entity_type", "customers").eq("entity_id", id);
    if (dealIds.length > 0) {
      await supabase.from("attachments").update({ deleted_at: now, deleted_batch_id: batchId }).eq("entity_type", "deals").in("entity_id", dealIds);
      await supabase.from("attachments").update({ deleted_at: now, deleted_batch_id: batchId }).eq("entity_type", "deal_photos").in("entity_id", dealIds);
    }

    const ticketIds = customerTickets.map((t) => t.id);
    setCustomers((prev) => prev.filter((c) => c.id !== id));
    setDeals((prev) => prev.filter((d) => d.customerId !== id));
    setTickets((prev) => prev.filter((t) => t.customerId !== id));
    setTicketMessages((prev) => prev.filter((m) => !ticketIds.includes(m.ticketId)));
    setPayments((prev) => prev.filter((p) => !dealIds.includes(p.dealId)));
    setGroupClassEnrollments((prev) => prev.filter((e) => e.customerId !== id));
    setAttachments((prev) => prev.filter((att) => !(att.entityType === "customers" && att.entityId === id) && !(att.entityType === "deals" && dealIds.includes(att.entityId))));

    logAction("customers", id, "deleted", `${customer?.name || "Müşteri"} çöp kutusuna taşındı`);
    customerDeals.forEach((d) => logAction("deals", d.id, "deleted", `${d.title} (${DEAL_WORD_FORMS[dealWordKind(companySettings?.sector)].bare}) çöp kutusuna taşındı`));
    customerTickets.forEach((t) => logAction("tickets", t.id, "deleted", `${t.subject} (talep) çöp kutusuna taşındı`));
    cascadePayments.forEach((p) => logAction("payments", p.id, "deleted", `${formatTL(p.amount)} tahsilat çöp kutusuna taşındı`));
  };

  const applyServiceCompletionEffects = async (deal, lineItemsForDeal) => {
    const { stockUpdates, reminderUpdate } = computeServiceCompletionEffects({ deal, lineItemsForDeal, priceListItems, priceItemIngredients, stockItems });
    if (stockUpdates.length > 0) {
      await Promise.all(stockUpdates.map((u) => supabase.from("stock_items").update({ quantity_on_hand: u.newQuantityOnHand }).eq("id", u.id)));
      setStockItems((prev) => prev.map((s) => {
        const u = stockUpdates.find((x) => x.id === s.id);
        return u ? { ...s, quantityOnHand: u.newQuantityOnHand } : s;
      }));
    }
    if (reminderUpdate) {
      await supabase.from("deals").update({ reminder: reminderUpdate.reminder, reminder_date: reminderUpdate.reminderDate }).eq("id", deal.id);
      setDeals((prev) => prev.map((d) => (d.id === deal.id ? { ...d, reminder: reminderUpdate.reminder, reminderDate: reminderUpdate.reminderDate } : d)));
    }
  };

  const upsertDeal = async (d) => {
    const isNew = !deals.some((x) => x.id === d.id);
    const previousDeal = deals.find((x) => x.id === d.id);
    const previousStage = previousDeal?.stage;
    // portal_randevu_zamani, sektörün gerçek "Tarih & Saat" alanından (örn.
    // randevu_tarihi) bağımsız, sabit bir anahtar — müşteri portalındaki
    // gelecek/geçmiş filtresi, iptal butonu ve tarih gösterimi SADECE bunu
    // okuyor. Önceden sadece müşteri kendi randevusunu portaldan alınca
    // set ediliyordu; KOBİ'nin elle oluşturduğu randevular bu alan hiç
    // yazılmadığı için müşteri portalında (varsayılan "Gelecek randevular"
    // filtresi altında) hiç görünmüyordu — burada da aynalanarak düzeltildi.
    const customFields = { ...(d.customFields || {}) };
    if (appointmentDateTimeKey) {
      const dt = customFields[appointmentDateTimeKey];
      if (dt) customFields.portal_randevu_zamani = dt;
      else delete customFields.portal_randevu_zamani;
    }
    const row = {
      id: d.id,
      user_id: activeTeamId,
      customer_id: d.customerId,
      title: d.title,
      value: d.value,
      cost: d.cost,
      stage: d.stage,
      kdv_rate: d.kdvRate ?? companySettings?.defaultKdvRate ?? 20,
      reminder: d.reminder,
      reminder_date: d.reminderDate || null,
      lost_reason: d.lostReason,
      session_total: d.isPackageDeal ? (Number(d.sessionTotal) || 0) : null,
      session_used: d.isPackageDeal ? (Number(d.sessionUsed) || 0) : 0,
      tags: d.tags || [],
      custom_fields: customFields,
      notify_customer: d.notifyCustomer || false,
      assigned_to: d.assignedTo || null,
      payment_mode: d.paymentMode || "none",
      // approved_at bu formda hiç düzenlenmiyor — mevcut değeri koru, yoksa
      // normal "Kaydet" onay durumunu sıfırlardı. approval_token yoksa (ödeme
      // modundan bağımsız, HER teklif için) burada otomatik üretiliyor —
      // Müşteri Portalı'nın her teklif için aynı /onay/{token} sayfasına
      // (onayla/öde) link verebilmesi buna dayanıyor.
      approval_token: d.approvalToken || uid(),
      approved_at: d.approvedAt || null,
      created_at: d.createdAt,
      closed_at: d.closedAt || null,
    };
    const { data, error } = await supabase.from("deals").upsert(row).select().single();
    if (error) { notify(`${DEAL_TAB_STRINGS[dealWordKind(companySettings?.sector)].columnHeader} kaydedilemedi: ${error.message}`); return; }
    const deal = rowToDeal(data);
    setDeals((prev) =>
      prev.some((x) => x.id === deal.id) ? prev.map((x) => (x.id === deal.id ? deal : x)) : [...prev, deal]
    );

    // DealForm'daki "telafi hakkını uygula" kutusu işaretlendiyse müşterinin
    // ücretsiz telafi hakkı sayacından 1 düşülür (bkz. applyAppointmentCreditGrant —
    // bu, hakkın verildiği yer; burası TÜKETİLDİĞİ yer).
    if (d.useAppointmentCredit) {
      const customer = customers.find((c) => c.id === deal.customerId);
      if (customer && (customer.appointmentCreditCount || 0) > 0) {
        const newCount = customer.appointmentCreditCount - 1;
        const { error: creditError } = await supabase.from("customers").update({ appointment_credit_count: newCount }).eq("id", customer.id);
        if (!creditError) setCustomers((prev) => prev.map((c) => (c.id === customer.id ? { ...c, appointmentCreditCount: newCount } : c)));
      }
    }

    // Kalemler DealForm'dan geldiyse (d.lineItems tanımlıysa — moveDealStage gibi
    // kalemlerden habersiz diğer çağrılar bu alanı hiç göndermiyor, dokunulmuyor)
    // sil-hepsini-baştan-ekle senkronizasyonu yapılır — bu projede diffing yerine
    // hep bu basit desen tercih ediliyor.
    let lineItemsForDeal = dealLineItems.filter((li) => li.dealId === deal.id);
    if (d.lineItems !== undefined) {
      await supabase.from("deal_line_items").delete().eq("deal_id", deal.id);
      if (d.lineItems.length > 0) {
        const rows = d.lineItems.map((li, i) => ({
          id: uid(), user_id: activeTeamId, deal_id: deal.id,
          description: li.description, quantity: Number(li.quantity) || 1, unit_price: Number(li.unitPrice) || 0, sort_order: i,
          price_item_id: li.priceItemId || null,
        }));
        const { data: insertedItems, error: liError } = await supabase.from("deal_line_items").insert(rows).select();
        if (liError) notify(`Kalemler kaydedilemedi: ${liError.message}`);
        lineItemsForDeal = (insertedItems || []).map(rowToDealLineItem);
        setDealLineItems((prev) => [...prev.filter((li) => li.dealId !== deal.id), ...lineItemsForDeal]);
      } else {
        lineItemsForDeal = [];
        setDealLineItems((prev) => prev.filter((li) => li.dealId !== deal.id));
      }
    }

    // Hizmet tamamlandı efekti (tazeleme hatırlatıcısı + reçete stok düşümü) —
    // sadece stage YENİ "kazanıldı"ya geçtiğinde, tekrar tekrar kaydedilince
    // aynı reçete ikinci kez düşülmesin diye previousStage kontrolü şart.
    if (deal.stage === "kazanildi" && previousStage !== "kazanildi") {
      await applyServiceCompletionEffects(deal, lineItemsForDeal);
    }
    if (deal.stage === "kaybedildi" && previousStage !== "kaybedildi" && (deal.lostReason === "Randevuya gelmedi" || deal.lostReason === "Geç iptal etti")) {
      await applyAppointmentPenaltyBurn(deal.customerId, deals);
    }
    if (deal.stage === "kaybedildi" && previousStage !== "kaybedildi" && deal.lostReason === "İşletme iptal etti") {
      await applyAppointmentCreditGrant(deal);
    }

    setShowDealForm(false);
    setEditingDeal(null);
    // Gölge Avcı: emlak sektöründe yeni bir teklif (mülk) girildiği an, geçmiş
    // müşteri taleplerine karşı otomatik taranır. Düzenlemede değil sadece
    // İLK kayıtta tetiklenir — aksi halde her küçük güncellemede aynı
    // eşleşmeler tekrar tekrar önüne çıkar.
    if (isNew && companySettings?.sector === "emlak") {
      const matches = matchEmlakListing(deal, customers);
      if (matches.length > 0) setEmlakMatches({ deal, matches });
    }
    logAction("deals", deal.id, isNew ? "created" : "updated", `${deal.title} ${isNew ? "oluşturuldu" : "güncellendi"}`);
    // "Sorumlu" ata değiştirmesi, kazanma oranı/ciro/prim hesaplarını doğrudan
    // etkiliyor — herhangi bir takım üyesi bunu kendine çevirip haksız kazanç
    // gösterebilir. Genel "güncellendi" kaydı KİME'yi belli etmiyordu; burada
    // eski→yeni sorumluyu isimle ayrı bir denetim kaydına yazıyoruz ki sahip
    // Geçmiş'ten suistimali fark edebilsin (kısıtlama değil görünürlük).
    if (!isNew && previousDeal && previousDeal.assignedTo !== deal.assignedTo) {
      const labelFor = (id) => {
        if (!id) return "Atanmamış";
        if (id === session.user.id) return `Ben (${session.user.email})`;
        const m = teamMembers.find((tm) => tm.id === id);
        return m ? (m.name || m.email) : "Eski üye";
      };
      logAction("deals", deal.id, "updated", `${deal.title}: Sorumlu ${labelFor(previousDeal.assignedTo)} → ${labelFor(deal.assignedTo)} olarak değiştirildi`);
    }
    // Kazanılmış bir teklifin Tutar/KDV'si değiştirilirse bu, geçmiş bir KDV
    // raporunu sessizce etkileyebilir — ayrı, açık bir denetim kaydı bırakıyoruz.
    if (previousDeal?.stage === "kazanildi" && (previousDeal.value !== deal.value || previousDeal.kdvRate !== deal.kdvRate)) {
      logAction(
        "deals", deal.id, "updated",
        `${deal.title}: kazanılmış teklifte Tutar ${formatTL(previousDeal.value)} → ${formatTL(deal.value)}, KDV %${previousDeal.kdvRate} → %${deal.kdvRate} olarak değiştirildi`
      );
    }
    if (deal.stage !== previousStage) sendStageEmail(deal, deal.stage);
  };

  // Müşterinin tek tıkla onaylayabileceği link — teklif zaten bir token'a
  // sahipse onu döner (aynı link her seferinde çalışsın), yoksa yeni üretip kaydeder.
  const generateApprovalLink = async (deal) => {
    if (deal.approvalToken) return `https://binerly.com/onay/${deal.approvalToken}`;
    const token = uid();
    const { error } = await supabase.from("deals").update({ approval_token: token }).eq("id", deal.id);
    if (error) { notify(`Onay linki oluşturulamadı: ${error.message}`); return null; }
    setDeals((prev) => prev.map((d) => (d.id === deal.id ? { ...d, approvalToken: token } : d)));
    return `https://binerly.com/onay/${token}`;
  };

  // Onay linki her kopyalandığında sorulan, o teklife özel ödeme tercihi —
  // link'in kendisi (approval_token) sabit kalır, sadece bu mod değişir.
  const setDealPaymentMode = async (dealId, mode) => {
    const { error } = await supabase.from("deals").update({ payment_mode: mode }).eq("id", dealId);
    if (error) { notify(`Ödeme tercihi kaydedilemedi: ${error.message}`); return; }
    setDeals((prev) => prev.map((d) => (d.id === dealId ? { ...d, paymentMode: mode } : d)));
  };

  // Gelir-Gider Defteri'ndeki bir teklif maliyetini (Gider) doğrudan günceller —
  // Teklifi düzenle formundaki "Gider" alanıyla AYNI sütunu yazar, bu yüzden
  // hangi ekrandan değiştirilirse değiştirilsin iki yer otomatik senkron kalır.
  const updateDealCost = async (dealId, cost) => {
    const deal = deals.find((d) => d.id === dealId);
    const { error } = await supabase.from("deals").update({ cost }).eq("id", dealId);
    if (error) { notify(`Gider güncellenemedi: ${error.message}`); return; }
    setDeals((prev) => prev.map((d) => (d.id === dealId ? { ...d, cost } : d)));
    logAction("deals", dealId, "updated", `${deal?.title || ""}: Gider ${formatTL(cost)} olarak güncellendi`);
  };

  // Şirket başına sabit link/QR — müşteri kendi bilgisini bırakır, KOBİ elle
  // girmez. approval_token'dan farklı olarak deal'e değil company_settings'e bağlı.
  const generateLeadCaptureLink = async () => {
    if (companySettings?.leadCaptureToken) return `https://binerly.com/lead/${companySettings.leadCaptureToken}`;
    const token = uid();
    // upsert (update değil) — company_settings satırı henüz hiç oluşmamış olabilir
    // (ilk kez Şirket Bilgileri kaydedilmeden), sadece bu iki sütunu dokunarak yazar.
    const { error } = await supabase.from("company_settings").upsert({ user_id: activeTeamId, lead_capture_token: token });
    if (error) { notify(`Link oluşturulamadı: ${error.message}`); return null; }
    setCompanySettings((prev) => ({ ...(prev || {}), leadCaptureToken: token }));
    return `https://binerly.com/lead/${token}`;
  };

  // Kurumsal/Bireysel seçimi her yapıldığında burada güncellenir, böylece bir
  // sonraki müşteri/teklif formu son seçilen türle açılır — B2C ağırlıklı
  // KOBİ'ler her seferinde "Kurumsal"ı elle değiştirmek zorunda kalmaz.
  const updatePreferredCustomerType = async (type) => {
    if (companySettings?.preferredCustomerType === type) return;
    const { error } = await supabase.from("company_settings").upsert({ user_id: activeTeamId, preferred_customer_type: type });
    if (error) return;
    setCompanySettings((prev) => ({ ...(prev || {}), preferredCustomerType: type }));
  };

  const deleteDeal = async (id) => {
    const deal = deals.find((d) => d.id === id);
    const dealPayments = payments.filter((p) => p.dealId === id);
    const batchId = uid();
    const now = new Date().toISOString();
    const { error: payErr } = await supabase
      .from("payments")
      .update({ deleted_at: now, deleted_batch_id: batchId })
      .eq("deal_id", id);
    if (payErr) { notify(`${DEAL_TAB_STRINGS[dealWordKind(companySettings?.sector)].columnHeader} silinemedi: ${payErr.message}`); return; }
    const { error } = await supabase
      .from("deals")
      .update({ deleted_at: now, deleted_batch_id: batchId })
      .eq("id", id);
    if (error) { notify(`${DEAL_TAB_STRINGS[dealWordKind(companySettings?.sector)].columnHeader} silinemedi: ${error.message}`); return; }
    await supabase.from("attachments").update({ deleted_at: now, deleted_batch_id: batchId }).eq("entity_type", "deals").eq("entity_id", id);
    await supabase.from("attachments").update({ deleted_at: now, deleted_batch_id: batchId }).eq("entity_type", "deal_photos").eq("entity_id", id);
    setDeals((prev) => prev.filter((d) => d.id !== id));
    setPayments((prev) => prev.filter((p) => p.dealId !== id));
    setAttachments((prev) => prev.filter((att) => !(att.entityType === "deals" && att.entityId === id)));
    logAction("deals", id, "deleted", `${deal?.title || DEAL_TAB_STRINGS[dealWordKind(companySettings?.sector)].columnHeader} çöp kutusuna taşındı`);
    dealPayments.forEach((p) => logAction("payments", p.id, "deleted", `${formatTL(p.amount)} tahsilat çöp kutusuna taşındı`));
  };

  const addPayment = async ({ dealId, amount, paidAt, note, method }) => {
    const row = { id: uid(), user_id: activeTeamId, deal_id: dealId, amount, paid_at: paidAt, note: note || null, method: method || null };
    const { data, error } = await supabase.from("payments").insert(row).select().single();
    if (error) { notify(`Tahsilat eklenemedi: ${error.message}`); return; }
    const payment = rowToPayment(data);
    setPayments((prev) => [...prev, payment]);
    logAction("payments", payment.id, "created", `${formatTL(payment.amount)} tahsilat eklendi`);
    const deal = deals.find((d) => d.id === payment.dealId);
    const customer = customers.find((c) => c.id === deal?.customerId);
    const company = companySettings?.companyName || "Binerly";
    notifyCustomerByEmail(
      customer,
      `Ödemeniz alındı - ${company}`,
      `Merhaba,\n\n"${deal?.title || DEAL_WORD_FORMS[dealWordKind(companySettings?.sector)].possYours}" için ${formatTL(payment.amount)} tutarındaki ödemeniz alınmıştır. Teşekkür ederiz.\n\n${company}`
    );
  };

  // Sadece elle eklenen (online olmayan) tahsilatlar burada düzenlenebilir —
  // online bir ödemenin tutarını burada değiştirmek gerçek sağlayıcı işlemiyle
  // tutarsızlığa yol açar, onlar sadece "İade Et" ile değişebilir (deletePayment
  // ile aynı gerekçe/koruma). İade kayıtları (amount<0) da düzenlenemez.
  const updatePayment = async ({ id, amount, paidAt, note, method }) => {
    const payment = payments.find((p) => p.id === id);
    const isRefundableOnline = (payment?.provider === "iyzico" && payment?.iyzicoPaymentTransactionId) || (payment?.provider === "paytr" && payment?.paytrMerchantOid);
    if (isRefundableOnline || (payment?.amount || 0) < 0) {
      notify("Online ödemeler ve iade kayıtları burada düzenlenemez.");
      return;
    }
    const { data, error } = await supabase
      .from("payments")
      .update({ amount, paid_at: paidAt, note: note || null, method: method || null })
      .eq("id", id)
      .select()
      .single();
    if (error) { notify(`Tahsilat güncellenemedi: ${error.message}`); return; }
    const updated = rowToPayment(data);
    setPayments((prev) => prev.map((p) => (p.id === id ? updated : p)));
    logAction("payments", updated.id, "updated", `Tahsilat ${formatTL(updated.amount)} olarak güncellendi`);
  };

  // Online (iyzico) ödemeler artık buradan silinemez — gerçek para geri
  // çekilmeden iç kaydı silmek "ödendi" izlenimini kaldırıp aynı linkten
  // ikinci kez gerçek tahsilata (çift ödeme) yol açabiliyordu. Tek yol
  // refundPayment — iyzico'ya gerçekten iade isteği gönderiyor.
  const deletePayment = async (id) => {
    const payment = payments.find((p) => p.id === id);
    // "İade Et" ile gerçekten iade edilebilecek (iyzico işlem numarası kayıtlı)
    // ödemeler buradan silinemez. İade Prosedürü'nden ÖNCEKİ eski online
    // ödemelerde bu numara hiç kaydedilmemişti — onlar API ile iade edilemediği
    // için (aksi halde sıkışıp kalırlar) burada normal silmeye izin veriliyor.
    const isRefundableOnline = (payment?.provider === "iyzico" && payment?.iyzicoPaymentTransactionId) || (payment?.provider === "paytr" && payment?.paytrMerchantOid);
    if (isRefundableOnline) {
      notify("Online ödemeler doğrudan silinemez - \"İade Et\" ile geri ödeme yapın.");
      return;
    }
    const batchId = uid();
    const { error } = await supabase
      .from("payments")
      .update({ deleted_at: new Date().toISOString(), deleted_batch_id: batchId })
      .eq("id", id);
    if (error) { notify(`Tahsilat silinemedi: ${error.message}`); return; }
    setPayments((prev) => prev.filter((p) => p.id !== id));
    logAction("payments", id, "deleted", `${formatTL(payment?.amount || 0)} tahsilat çöp kutusuna taşındı`);
    if (payment?.provider === "iyzico" || payment?.provider === "paytr") {
      const deal = deals.find((d) => d.id === payment.dealId);
      if (deal?.paymentStatus === "paid") {
        const { error: dealError } = await supabase.from("deals").update({ payment_status: null }).eq("id", deal.id);
        if (!dealError) setDeals((prev) => prev.map((d) => (d.id === deal.id ? { ...d, paymentStatus: null } : d)));
      }
    }
  };

  // İade Prosedürü — iyzico ile online alınmış bir tahsilatı tam veya kısmi
  // olarak GERÇEKTEN iade eder (api/deal-approval.js:handleRefund, KOBİ'nin
  // kendi oturumuyla çağrılıyor). Başarılıysa negatif tutarlı yeni bir
  // payments satırı döner — totalPaidForDeal/Finance zaten bunu doğru netler.
  const refundPayment = async ({ dealId, paymentId, amount, reason }) => {
    const res = await fetch("/api/deal-approval", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ action: "refund", dealId, paymentId, amount, reason }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { notify(`İade edilemedi: ${data.error || "Bilinmeyen hata"}`); return false; }
    const refundRow = rowToPayment(data.payment);
    setPayments((prev) => [...prev, refundRow]);
    logAction("payments", refundRow.id, "created", `${formatTL(Math.abs(refundRow.amount))} iade edildi`);
    if (data.dealPaymentStatusCleared) {
      setDeals((prev) => prev.map((d) => (d.id === dealId ? { ...d, paymentStatus: null } : d)));
    }
    notify("İade işlemi tamamlandı.", "success");
    return true;
  };

  const addCompanyExpense = async ({ title, category, amount, expenseDate, note, isRecurring, recurrenceInterval, kdvRate }) => {
    const row = {
      id: uid(), user_id: activeTeamId, title, category: category || "Diğer", amount, expense_date: expenseDate, note: note || null,
      is_recurring: !!isRecurring, recurrence_interval: recurrenceInterval || "monthly", kdv_rate: kdvRate ?? null,
    };
    const { data, error } = await supabase.from("company_expenses").insert(row).select().single();
    if (error) { notify(`Gider eklenemedi: ${error.message}`); return; }
    const expense = rowToCompanyExpense(data);
    setCompanyExpenses((prev) => [...prev, expense]);
    logAction("company_expenses", expense.id, "created", `${expense.title} gideri eklendi (${formatTL(expense.amount)})`);
  };

  const updateCompanyExpense = async ({ id, title, category, amount, expenseDate, note, isRecurring, recurrenceInterval, kdvRate }) => {
    const row = {
      title, category: category || "Diğer", amount, expense_date: expenseDate, note: note || null,
      is_recurring: !!isRecurring, recurrence_interval: recurrenceInterval || "monthly", kdv_rate: kdvRate ?? null,
    };
    const { data, error } = await supabase.from("company_expenses").update(row).eq("id", id).select().single();
    if (error) { notify(`Gider güncellenemedi: ${error.message}`); return; }
    const expense = rowToCompanyExpense(data);
    setCompanyExpenses((prev) => prev.map((e) => (e.id === id ? expense : e)));
    logAction("company_expenses", expense.id, "updated", `${expense.title} gideri güncellendi (${formatTL(expense.amount)})`);
  };

  const deleteCompanyExpense = async (id) => {
    const expense = companyExpenses.find((e) => e.id === id);
    const batchId = uid();
    const { error } = await supabase
      .from("company_expenses")
      .update({ deleted_at: new Date().toISOString(), deleted_batch_id: batchId })
      .eq("id", id);
    if (error) { notify(`Gider silinemedi: ${error.message}`); return; }
    setCompanyExpenses((prev) => prev.filter((e) => e.id !== id));
    logAction("company_expenses", id, "deleted", `${expense?.title || "Gider"} çöp kutusuna taşındı`);
  };

  const upsertChannelCredential = async (channel, { externalId, accessToken, appSecret, displayName }) => {
    const row = {
      user_id: activeTeamId, channel, external_id: externalId, access_token: accessToken,
      app_secret: appSecret, display_name: displayName || null, updated_at: new Date().toISOString(),
    };
    const { data, error } = await supabase
      .from("channel_credentials")
      .upsert(row, { onConflict: "user_id,channel" })
      .select("id, user_id, channel, external_id, display_name, connected_at")
      .single();
    if (error) { notify(`Bağlantı kaydedilemedi: ${error.message}`); return; }
    const credential = rowToChannelCredential(data);
    setChannelCredentials((prev) => [...prev.filter((c) => c.channel !== channel), credential]);
    notify(`${channel === "whatsapp" ? "WhatsApp" : "Instagram"} bağlandı.`, "success");
  };

  const deleteChannelCredential = async (channel) => {
    const { error } = await supabase.from("channel_credentials").delete().eq("user_id", activeTeamId).eq("channel", channel);
    if (error) { notify(`Bağlantı kaldırılamadı: ${error.message}`); return; }
    setChannelCredentials((prev) => prev.filter((c) => c.channel !== channel));
  };

  // Tek seferde sadece TEK bir sağlayıcı aktif olabiliyor (basitlik — "hangisi
  // kullanılacak" belirsizliği hiç oluşmasın diye) — yeni bir sağlayıcı
  // bağlanınca varsa başka sağlayıcının kaydı önce siliniyor.
  const upsertPaymentCredential = async ({ provider, apiKey, secretKey, merchantSalt, sandbox, maxInstallment }) => {
    const { error: deleteError } = await supabase
      .from("payment_credentials")
      .delete()
      .eq("user_id", activeTeamId)
      .neq("provider", provider);
    if (deleteError) { notify(`Bağlantı kaydedilemedi: ${deleteError.message}`); return; }

    const row = {
      user_id: activeTeamId, provider, api_key: apiKey, secret_key: secretKey,
      merchant_salt: merchantSalt || null, sandbox, max_installment: maxInstallment || 1,
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await supabase
      .from("payment_credentials")
      .upsert(row, { onConflict: "user_id,provider" })
      .select("id, user_id, provider, sandbox, max_installment, connected_at")
      .single();
    if (error) { notify(`Bağlantı kaydedilemedi: ${error.message}`); return; }
    const credential = rowToPaymentCredential(data);
    setPaymentCredentials([credential]);
    notify(`${provider === "paytr" ? "PayTR" : "iyzico"} bağlandı.`, "success");
  };

  const deletePaymentCredential = async (provider) => {
    const { error } = await supabase.from("payment_credentials").delete().eq("user_id", activeTeamId).eq("provider", provider);
    if (error) { notify(`Bağlantı kaldırılamadı: ${error.message}`); return; }
    setPaymentCredentials((prev) => prev.filter((pc) => pc.provider !== provider));
  };

  const uploadAttachment = async (entityType, entityId, file, extra = {}) => {
    if (!file) return;
    if (file.size > MAX_ATTACHMENT_SIZE) { notify("Dosya en fazla 10 MB olabilir."); return; }
    const lowerName = file.name.toLowerCase();
    if (BLOCKED_ATTACHMENT_EXTENSIONS.some((ext) => lowerName.endsWith(ext))) {
      notify("Bu dosya türü güvenlik nedeniyle yüklenemiyor.");
      return;
    }
    const safeFileName = file.name.replace(/[^\w.-]+/g, "_");
    const path = `${activeTeamId}/${entityType}/${entityId}/${uid()}-${safeFileName}`;
    const { error: uploadError } = await supabase.storage.from("attachments").upload(path, file);
    if (uploadError) { notify(`Dosya yüklenemedi: ${uploadError.message}`); return; }
    const row = {
      user_id: activeTeamId,
      entity_type: entityType,
      entity_id: entityId,
      file_name: file.name,
      storage_path: path,
      file_size: file.size,
      content_type: file.type || "",
      uploaded_by: session?.user?.email || "",
      photo_type: extra.photoType || null,
      consent_confirmed: extra.consentConfirmed === true,
    };
    const { data, error } = await supabase.from("attachments").insert(row).select().single();
    if (error) { notify(`Dosya kaydedilemedi: ${error.message}`); return; }
    setAttachments((prev) => [rowToAttachment(data), ...prev]);
    logAction(
      entityType,
      entityId,
      "updated",
      extra.photoType ? `"${file.name}" (${extra.photoType === "before" ? "öncesi" : "sonrası"} fotoğrafı) eklendi` : `"${file.name}" dosyası eklendi`
    );
  };

  const downloadAttachment = async (attachment) => {
    const { data, error } = await supabase.storage.from("attachments").createSignedUrl(attachment.storagePath, 60);
    if (error || !data?.signedUrl) { notify(`Dosya indirilemedi: ${error?.message || ""}`); return; }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  };

  const toggleAttachmentShare = async (id, shared) => {
    const { error } = await supabase.from("attachments").update({ shared_with_customer: shared }).eq("id", id);
    if (error) { notify(`Paylaşım durumu güncellenemedi: ${error.message}`); return; }
    setAttachments((prev) => prev.map((a) => (a.id === id ? { ...a, sharedWithCustomer: shared } : a)));
  };

  const deleteAttachment = async (id) => {
    const attachment = attachments.find((a) => a.id === id);
    const batchId = uid();
    const { error } = await supabase
      .from("attachments")
      .update({ deleted_at: new Date().toISOString(), deleted_batch_id: batchId })
      .eq("id", id);
    if (error) { notify(`Dosya silinemedi: ${error.message}`); return; }
    setAttachments((prev) => prev.filter((a) => a.id !== id));
    logAction(attachment?.entityType || "customers", attachment?.entityId, "deleted", `"${attachment?.fileName || "Dosya"}" çöp kutusuna taşındı`);
  };

  const refreshChannelMessages = async () => {
    const { data } = await supabase.from("channel_messages").select("*").order("created_at", { ascending: false }).limit(500);
    setChannelMessages((data || []).map(rowToChannelMessage));
  };

  const markChannelMessagesRead = async (channel, counterpartId) => {
    const hasUnread = channelMessages.some(
      (m) => m.channel === channel && m.counterpartId === counterpartId && m.direction === "in" && !m.readAt
    );
    if (!hasUnread) return;
    const now = new Date().toISOString();
    const { error } = await supabase
      .from("channel_messages")
      .update({ read_at: now })
      .eq("channel", channel)
      .eq("counterpart_id", counterpartId)
      .eq("direction", "in")
      .is("read_at", null);
    if (error) return;
    setChannelMessages((prev) =>
      prev.map((m) => (m.channel === channel && m.counterpartId === counterpartId && m.direction === "in" && !m.readAt ? { ...m, readAt: now } : m))
    );
  };

  const sendChannelMessage = async ({ channel, to, body, customerId }) => {
    try {
      const res = await fetch(channel === "whatsapp" ? "/api/send-whatsapp" : "/api/send-instagram", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ teamId: activeTeamId, to, body, customerId }),
      });
      const data = await res.json();
      if (!res.ok) { notify(data.error || "Mesaj gönderilemedi."); return; }
      setChannelMessages((prev) => [
        { id: uid(), channel, direction: "out", externalMessageId: null, counterpartId: to, counterpartName: "", customerId: customerId || null, body, createdAt: new Date().toISOString(), readAt: null },
        ...prev,
      ]);
    } catch {
      notify("Mesaj gönderilirken hata oluştu.");
    }
  };

  const seedDemoData = async () => {
    const now = new Date().toISOString();
    const todayStr = new Date().toISOString().slice(0, 10);
    const demoNote = "Bu örnek bir kayıttır, istediğiniz zaman silebilirsiniz.";
    const sectorPreset = SECTOR_DEMO_PRESETS[companySettings?.sector];

    const demoCustomers = sectorPreset
      ? sectorPreset.customers.map((c) => ({
          id: uid(), name: c.name, customerType: c.customerType, sector: "", region: "", phone: c.phone, email: "", notes: demoNote, lastContact: now, createdAt: now,
        }))
      : [
          { id: uid(), name: "Örnek Müşteri - Akın İnşaat", customerType: "kurumsal", sector: "İnşaat", phone: "0532 000 00 01", email: "", notes: demoNote, lastContact: now, createdAt: now },
          { id: uid(), name: "Örnek Müşteri - Medipark Klinik", customerType: "kurumsal", sector: "Medikal / Sağlık", phone: "0532 000 00 02", email: "", notes: demoNote, lastContact: now, createdAt: now },
          { id: uid(), name: "Örnek Müşteri - Tazegül Gıda", customerType: "kurumsal", sector: "Gıda", phone: "0532 000 00 03", email: "", notes: demoNote, lastContact: now, createdAt: now },
          { id: uid(), name: "Örnek Müşteri - Ayşe Yılmaz", customerType: "bireysel", sector: "", region: "İzmir", phone: "0532 000 00 04", email: "", notes: demoNote, lastContact: now, createdAt: now },
        ];
    for (const c of demoCustomers) await upsertCustomer(c);

    const demoDeals = sectorPreset
      ? sectorPreset.deals.map((d) => ({
          id: uid(),
          customerId: demoCustomers[d.customerIndex].id,
          title: d.title,
          value: d.value,
          cost: d.cost,
          stage: d.stage,
          reminder: d.reminderToday ? d.reminder : "",
          reminderDate: d.reminderToday ? todayStr : null,
          lostReason: "",
          tags: d.tags || [],
          customFields: d.customFields || {},
          createdAt: now,
          closedAt: d.stage === "kazanildi" || d.stage === "kaybedildi" ? now : null,
        }))
      : [
          { id: uid(), customerId: demoCustomers[0].id, title: "Yıllık bakım anlaşması", value: 45000, cost: 0, stage: "ilk_gorusme", reminder: "", reminderDate: null, lostReason: "", createdAt: now, closedAt: null },
          { id: uid(), customerId: demoCustomers[1].id, title: "Ekipman teklifi", value: 60000, cost: 0, stage: "muzakere", reminder: "Fiyat için tekrar ara", reminderDate: todayStr, lostReason: "", createdAt: now, closedAt: null },
          { id: uid(), customerId: demoCustomers[2].id, title: "Tedarik sözleşmesi", value: 32000, cost: 12000, stage: "kazanildi", reminder: "", reminderDate: null, lostReason: "", createdAt: now, closedAt: now },
        ];
    for (const d of demoDeals) await upsertDeal(d);
    notify("Örnek veriler eklendi.", "success");
  };

  // AppointmentCancelPolicyBox'ın "paket sahiplerinde seans yaksın" ayarı —
  // bir randevu "Randevuya gelmedi"/"Geç iptal etti" ile kapanınca (hem
  // moveDealStage hem upsertDeal'dan çağrılıyor — applyServiceCompletionEffects
  // ile aynı çifte-hook deseni) müşterinin aktif paketi varsa oradan 1 seans
  // düşer. dealsBeforeChange, BU kapanışı henüz yansıtmayan eski deals array'i
  // olmalı — computeAppointmentPenaltyBurn geçmiş ihlal sayısını ondan sayıyor.
  const applyAppointmentPenaltyBurn = async (customerId, dealsBeforeChange) => {
    const burn = computeAppointmentPenaltyBurn({
      customerId,
      deals: dealsBeforeChange,
      burnsSessionEnabled: companySettings?.appointmentPenaltyBurnsSession === true,
      strikeLimit: companySettings?.appointmentPenaltyStrikeLimit,
    });
    if (!burn) return;
    const packageDeal = dealsBeforeChange.find((d) => d.id === burn.packageDealId);
    setDeals((prev) => prev.map((d) => (d.id === burn.packageDealId ? { ...d, sessionUsed: burn.newSessionUsed } : d)));
    const { error } = await supabase.from("deals").update({ session_used: burn.newSessionUsed }).eq("id", burn.packageDealId);
    if (error) {
      notify(`Paket seansı güncellenemedi: ${error.message}`);
      setDeals((prev) => prev.map((d) => (d.id === burn.packageDealId ? { ...d, sessionUsed: packageDeal?.sessionUsed ?? 0 } : d)));
      return;
    }
    logAction("deals", burn.packageDealId, "updated", `Geç iptal/gelmeme cezası: ${burn.newSessionUsed}. seans otomatik düşüldü (${burn.newSessionUsed}/${packageDeal?.sessionTotal})`);
  };

  // Simetrik adalet: işletme/personel kaynaklı geç iptallerde (randevu saatine
  // "Geç sayılma penceresi" kadar veya daha az kala) müşteriye otomatik 1
  // ücretsiz telafi hakkı tanınır — DealForm'da yeni bir randevu oluşturulurken
  // kullanılabilir (bkz. DealForm'daki telafi hakkı banner'ı). Pencere
  // ayarlanmamışsa (appointmentPenaltyHours null) ya da randevu tarihi
  // çözümlenemiyorsa sessizce atlanır — bu özellik de tamamen opsiyonel.
  const applyAppointmentCreditGrant = async (deal) => {
    const raw = appointmentDateTimeKey ? deal.customFields?.[appointmentDateTimeKey] : null;
    if (!raw || companySettings?.appointmentPenaltyHours == null) return;
    const hoursLeft = (new Date(`${raw}:00+03:00`).getTime() - Date.now()) / (60 * 60 * 1000);
    if (isNaN(hoursLeft) || hoursLeft >= companySettings.appointmentPenaltyHours) return;
    const customer = customers.find((c) => c.id === deal.customerId);
    if (!customer) return;
    const newCount = (customer.appointmentCreditCount || 0) + 1;
    const { error } = await supabase.from("customers").update({ appointment_credit_count: newCount }).eq("id", deal.customerId);
    if (error) { notify(`Telafi hakkı kaydedilemedi: ${error.message}`); return; }
    setCustomers((prev) => prev.map((c) => (c.id === deal.customerId ? { ...c, appointmentCreditCount: newCount } : c)));
    logAction("customers", deal.customerId, "updated", `${customer.name} için işletme kaynaklı geç iptal nedeniyle 1 ücretsiz telafi hakkı tanındı.`);
  };

  const moveDealStage = async (id, stage, lostReason) => {
    const current = deals.find((d) => d.id === id);
    const previousStage = current?.stage;
    const isClosingStage = stage === "kazanildi" || stage === "kaybedildi";
    const wasAlreadyClosed = previousStage === "kazanildi" || previousStage === "kaybedildi";
    const closedAt = isClosingStage
      ? (wasAlreadyClosed && current?.closedAt ? current.closedAt : new Date().toISOString())
      : null;
    // lostReason sadece "kaybedildi"ye geçerken (randevu sektörlerinde çıkan
    // neden seçim penceresinden) veriliyor — DealForm'un kendi lostReason state'iyle
    // aynı sütunu (deals.lost_reason) hedefliyor, tek bir kaynaktan yönetiliyor.
    const previousLostReason = current?.lostReason || "";
    const nextLostReason = stage === "kaybedildi" ? (lostReason ?? previousLostReason) : "";
    setDeals((prev) => prev.map((d) => (d.id === id ? { ...d, stage, closedAt, lostReason: nextLostReason } : d)));
    const { error } = await supabase.from("deals").update({ stage, closed_at: closedAt, lost_reason: nextLostReason }).eq("id", id);
    if (error) {
      notify(`Aşama güncellenemedi: ${error.message}`);
      setDeals((prev) => prev.map((d) => (d.id === id ? { ...d, stage: previousStage, closedAt: current?.closedAt ?? null, lostReason: previousLostReason } : d)));
    } else {
      const currentStageLabel = stageLabel(stage, customers.find((c) => c.id === current?.customerId)?.customerType || "kurumsal", companySettings?.sector);
      logAction("deals", id, "updated", `${current?.title || DEAL_TAB_STRINGS[dealWordKind(companySettings?.sector)].columnHeader} aşaması "${currentStageLabel}" olarak güncellendi`);
      if (current && stage !== previousStage) sendStageEmail(current, stage);
      if (current && stage === "kazanildi" && previousStage !== "kazanildi") {
        await applyServiceCompletionEffects({ ...current, stage }, dealLineItems.filter((li) => li.dealId === id));
      }
      if (current && stage === "kaybedildi" && previousStage !== "kaybedildi" && (nextLostReason === "Randevuya gelmedi" || nextLostReason === "Geç iptal etti")) {
        await applyAppointmentPenaltyBurn(current.customerId, deals);
      }
      if (current && stage === "kaybedildi" && previousStage !== "kaybedildi" && nextLostReason === "İşletme iptal etti") {
        await applyAppointmentCreditGrant(current);
      }
    }
  };

  // Liste'deki aşama seçicisinin TEK geçidi — aşama değişikliği burada, gerçek
  // çakışmalar (aynı saate iki randevu, dolu oda tipi) kontrol edilmeden asla
  // sessizce uygulanmaz. Randevu sektörlerinde "kaybedildi"ye geçerken de
  // (gelmedi/iptal ayrımı için) önce neden sorulur, doğrudan taşınmaz.
  // (Kanban görünümü 2026-07-23'te kaldırıldı — çok sayıda kayıtta sürükle-
  // bırak kullanışsızlaşıyordu, Liste'deki bu seçici yerini aldı.)
  const attemptMoveDealStage = (dealId, newStageId) => {
    if (newStageId === "kaybedildi" && isAppointmentSector(companySettings?.sector)) {
      setPendingLostReasonMove({ dealId });
      return;
    }
    const movingDeal = deals.find((d) => d.id === dealId);
    const model = bookingModel(companySettings?.sector);
    const dt = model === "slot" && appointmentDateTimeKey && movingDeal?.customFields?.[appointmentDateTimeKey];
    const slotConflict = movingDeal?.stage === "kaybedildi" && dt
      ? deals.find((d) => d.id !== dealId && d.stage !== "kaybedildi" && d.customFields?.[appointmentDateTimeKey] === dt)
      : null;
    const roomConflict = model === "inventory" && movingDeal?.stage === "kaybedildi"
      ? roomTypeConflict(
          {
            excludeDealId: dealId,
            roomType: movingDeal?.customFields?.oda_tipi,
            checkIn: movingDeal?.customFields?.giris_tarihi,
            checkOut: movingDeal?.customFields?.cikis_tarihi,
          },
          deals, roomInventory
        )
      : null;
    if (slotConflict) {
      notify(`Bu tarih/saatte ${customers.find((c) => c.id === slotConflict.customerId)?.name || "başka bir kayıt"} için de aktif bir randevu var - aynı saate iki randevu girilemez.`);
    } else if (roomConflict) {
      notify(`Bu oda tipinde seçili tarihler için müsait oda kalmadı (${roomConflict.occupied}/${roomConflict.quantity} dolu).`);
    } else {
      moveDealStage(dealId, newStageId);
    }
  };

  // breakdownIndex: karma pakette (custom_fields.package_breakdown, bkz.
  // DealForm) hangi hizmet türünden kullanıldığı - tek tip paketlerde (breakdown
  // yok/boş) null geçilir, eski davranışla birebir aynı tek sayaç güncellenir.
  const incrementSessionUsage = async (id, breakdownIndex = null) => {
    const current = deals.find((d) => d.id === id);
    if (!current?.sessionTotal || current.sessionUsed >= current.sessionTotal) return;
    const breakdown = Array.isArray(current.customFields?.package_breakdown) ? current.customFields.package_breakdown : null;
    let nextCustomFields = current.customFields;
    if (breakdown && breakdown.length > 0) {
      const item = breakdownIndex != null ? breakdown[breakdownIndex] : null;
      if (!item || item.used >= item.total) return;
      nextCustomFields = { ...current.customFields, package_breakdown: breakdown.map((b, i) => (i === breakdownIndex ? { ...b, used: b.used + 1 } : b)) };
    }
    const previousUsed = current.sessionUsed;
    const nextUsed = previousUsed + 1;
    setDeals((prev) => prev.map((d) => (d.id === id ? { ...d, sessionUsed: nextUsed, customFields: nextCustomFields } : d)));
    const updatePayload = { session_used: nextUsed, ...(nextCustomFields !== current.customFields ? { custom_fields: nextCustomFields } : {}) };
    const { error } = await supabase.from("deals").update(updatePayload).eq("id", id);
    if (error) {
      notify(`Seans güncellenemedi: ${error.message}`);
      setDeals((prev) => prev.map((d) => (d.id === id ? { ...d, sessionUsed: previousUsed, customFields: current.customFields } : d)));
    } else {
      const label = breakdown && breakdownIndex != null ? ` (${breakdown[breakdownIndex].label})` : "";
      logAction("deals", id, "updated", `${current.title || DEAL_TAB_STRINGS[dealWordKind(companySettings?.sector)].columnHeader} - ${nextUsed}. seans kullanıldı${label} (${nextUsed}/${current.sessionTotal})`);
    }
  };

  // Karma pakette (birden fazla hizmet türü) "Seans kullanıldı" tıklanınca
  // HANGİ türden kullanıldığı sorulmalı - bu state o seçim modalını tutar.
  const [packageUsePicker, setPackageUsePicker] = useState(null);
  const handleUseSessionClick = (deal) => {
    const breakdown = Array.isArray(deal.customFields?.package_breakdown) ? deal.customFields.package_breakdown : null;
    if (breakdown && breakdown.length > 1) setPackageUsePicker(deal);
    else incrementSessionUsage(deal.id, breakdown && breakdown.length === 1 ? 0 : null);
  };

  const touchCustomer = async (id) => {
    const now = new Date().toISOString();
    const { error } = await supabase.from("customers").update({ last_contact: now }).eq("id", id);
    if (error) return;
    setCustomers((prev) => prev.map((c) => (c.id === id ? { ...c, lastContact: now } : c)));
  };

  const upsertTicket = async (t) => {
    const isNew = !tickets.some((x) => x.id === t.id);
    const previousStatus = tickets.find((x) => x.id === t.id)?.status;
    const row = {
      id: t.id,
      user_id: activeTeamId,
      customer_id: t.customerId,
      subject: t.subject,
      description: t.description,
      priority: t.priority,
      status: t.status,
      resolved_at: t.resolvedAt,
      created_at: t.createdAt,
    };
    const { data, error } = await supabase.from("tickets").upsert(row).select().single();
    if (error) { notify(`Talep kaydedilemedi: ${error.message}`); return; }
    const ticket = rowToTicket(data);
    setTickets((prev) =>
      prev.some((x) => x.id === ticket.id) ? prev.map((x) => (x.id === ticket.id ? ticket : x)) : [...prev, ticket]
    );
    logAction("tickets", ticket.id, isNew ? "created" : "updated", `${ticket.subject} ${isNew ? "oluşturuldu" : "güncellendi"}`);
    // Talep düzenleme formundan durumu Çözüldü/Kapatıldı'ya getirmek de aynı
    // bildirim mailini tetiklemeli — changeTicketStatus (talep detayındaki
    // dropdown) ile aynı davranış, çünkü kullanıcı durumu iki farklı yerden
    // değiştirebiliyor.
    if (TERMINAL_STATUSES.includes(ticket.status) && previousStatus !== ticket.status) {
      markMessagesRead(ticket.id, "gelen");
      const customer = customers.find((c) => c.id === ticket.customerId);
      const company = companySettings?.companyName || "Binerly";
      const statusLabel = STATUSES.find((s) => s.id === ticket.status)?.label || ticket.status;
      notifyCustomerByEmail(
        customer,
        `Destek talebiniz güncellendi - ${company}`,
        `Merhaba,\n\n"${ticket.subject}" konulu talebinizin durumu "${statusLabel}" olarak güncellendi.\n\nDetaylar için müşteri portalımızdan giriş yapabilirsiniz: https://portal.binerly.com\n\n${company}`
      );
    }
  };

  const deleteTicket = async (id) => {
    const ticket = tickets.find((t) => t.id === id);
    const batchId = uid();
    const { error } = await supabase
      .from("tickets")
      .update({ deleted_at: new Date().toISOString(), deleted_batch_id: batchId })
      .eq("id", id);
    if (error) { notify(`Talep silinemedi: ${error.message}`); return; }
    setTickets((prev) => prev.filter((t) => t.id !== id));
    setTicketMessages((prev) => prev.filter((m) => m.ticketId !== id));
    logAction("tickets", id, "deleted", `${ticket?.subject || "Talep"} çöp kutusuna taşındı`);
  };

  const changeTicketStatus = async (id, status) => {
    const previous = tickets.find((t) => t.id === id);
    const resolvedAt = TERMINAL_STATUSES.includes(status) ? new Date().toISOString() : null;
    setTickets((prev) => prev.map((t) => (t.id === id ? { ...t, status, resolvedAt } : t)));
    const { error } = await supabase.from("tickets").update({ status, resolved_at: resolvedAt }).eq("id", id);
    if (error) {
      notify(`Durum güncellenemedi: ${error.message}`);
      setTickets((prev) => prev.map((t) => (t.id === id ? previous : t)));
    } else {
      logAction("tickets", id, "updated", `${previous?.subject || "Talep"} durumu güncellendi`);
      // Sadece nihai durumlarda (Çözüldü/Kapatıldı) mail gider — her ara durum
      // geçişinde e-posta atmak hem müşteriyi gereksiz meşgul eder hem de
      // Resend'in günlük gönderim limitini gereksiz yere tüketir.
      if (TERMINAL_STATUSES.includes(status)) {
        markMessagesRead(id, "gelen");
        const customer = customers.find((c) => c.id === previous?.customerId);
        const company = companySettings?.companyName || "Binerly";
        const statusLabel = STATUSES.find((s) => s.id === status)?.label || status;
        notifyCustomerByEmail(
          customer,
          `Destek talebiniz güncellendi - ${company}`,
          `Merhaba,\n\n"${previous?.subject || "Destek talebiniz"}" konulu talebinizin durumu "${statusLabel}" olarak güncellendi.\n\nDetaylar için müşteri portalımızdan giriş yapabilirsiniz: https://portal.binerly.com\n\n${company}`
        );
      }
    }
  };

  const addTicketMessage = async ({ ticketId, direction, content, isInternal }) => {
    const row = {
      id: uid(),
      user_id: activeTeamId,
      ticket_id: ticketId,
      direction,
      content,
      is_internal: !!isInternal,
    };
    const { data, error } = await supabase.from("ticket_messages").insert(row).select().single();
    if (error) { notify(`Mesaj eklenemedi: ${error.message}`); return; }
    const message = rowToTicketMessage(data);
    setTicketMessages((prev) => [...prev, message]);
    // Cevap vermek, karşı taraftan gelen bekleyen mesajları "okundu/yanıtlandı" sayar —
    // sadece talebi açıp bakmak değil, gerçekten yanıt vermek bildirimi temizler.
    if (!isInternal) {
      await markMessagesRead(ticketId, direction === "giden" ? "gelen" : "giden");
    }
    // Dahili notlar müşteriye asla gitmez — sadece şirketten müşteriye giden gerçek yanıtlar.
    // Sonuç geriye döndürülür - aksi halde personel mesajı eklemenin müşteriye
    // otomatik haber verdiğini sanıp geçebiliyordu (e-postası yok / bildirimler
    // kapalı / gönderim başarısız olduğunda mesaj sadece portalda sessizce bekliyordu).
    if (direction === "giden" && !isInternal) {
      const ticket = tickets.find((t) => t.id === ticketId);
      const customer = customers.find((c) => c.id === ticket?.customerId);
      const company = companySettings?.companyName || "Binerly";
      const notified = await notifyCustomerByEmail(
        customer,
        `Yeni bir yanıtınız var - ${company}`,
        `Merhaba,\n\n"${ticket?.subject || "Destek talebiniz"}" konulu talebinize yeni bir yanıt geldi:\n\n"${content.slice(0, 300)}"\n\nTam görüşme için müşteri portalımıza giriş yapabilirsiniz: https://portal.binerly.com\n\n${company}`
      );
      return { notified, hasEmail: !!customer?.email };
    }
  };

  const markMessagesRead = async (ticketId, direction) => {
    const hasUnread = ticketMessages.some((m) => m.ticketId === ticketId && m.direction === direction && !m.readAt);
    if (!hasUnread) return;
    const now = new Date().toISOString();
    const { error } = await supabase
      .from("ticket_messages")
      .update({ read_at: now })
      .eq("ticket_id", ticketId)
      .eq("direction", direction)
      .is("read_at", null);
    if (error) return;
    setTicketMessages((prev) =>
      prev.map((m) => (m.ticketId === ticketId && m.direction === direction && !m.readAt ? { ...m, readAt: now } : m))
    );
  };

  const upsertKbArticle = async (a) => {
    const isNew = !kbArticles.some((x) => x.id === a.id);
    const row = {
      id: a.id,
      user_id: activeTeamId,
      title: a.title,
      category: a.category,
      content: a.content,
      created_at: a.createdAt,
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await supabase.from("kb_articles").upsert(row).select().single();
    if (error) { notify(`Makale kaydedilemedi: ${error.message}`); return; }
    const article = rowToKbArticle(data);
    setKbArticles((prev) =>
      prev.some((x) => x.id === article.id) ? prev.map((x) => (x.id === article.id ? article : x)) : [...prev, article]
    );
    logAction("kb_articles", article.id, isNew ? "created" : "updated", `${article.title} ${isNew ? "oluşturuldu" : "güncellendi"}`);
  };

  const deleteKbArticle = async (id) => {
    const article = kbArticles.find((a) => a.id === id);
    const batchId = uid();
    const { error } = await supabase
      .from("kb_articles")
      .update({ deleted_at: new Date().toISOString(), deleted_batch_id: batchId })
      .eq("id", id);
    if (error) { notify(`Makale silinemedi: ${error.message}`); return; }
    setKbArticles((prev) => prev.filter((a) => a.id !== id));
    logAction("kb_articles", id, "deleted", `${article?.title || "Makale"} çöp kutusuna taşındı`);
  };

  const restoreBatch = async (batchId) => {
    const tables = [
      { name: "customers", setter: setCustomers, map: rowToCustomer, label: (r) => r.name },
      { name: "deals", setter: setDeals, map: rowToDeal, label: (r) => r.title },
      { name: "payments", setter: setPayments, map: rowToPayment, label: (r) => `${formatTL(r.amount)} tahsilat` },
      { name: "company_expenses", setter: setCompanyExpenses, map: rowToCompanyExpense, label: (r) => r.title },
      { name: "tickets", setter: setTickets, map: rowToTicket, label: (r) => r.subject },
      { name: "kb_articles", setter: setKbArticles, map: rowToKbArticle, label: (r) => r.title },
      { name: "group_classes", setter: setGroupClasses, map: rowToGroupClass, label: (r) => r.name },
      { name: "attachments", setter: setAttachments, map: rowToAttachment, label: (r) => r.file_name },
    ];
    let anyError = null;
    let restoredTicketIds = [];
    for (const t of tables) {
      const { data, error } = await supabase
        .from(t.name)
        .update({ deleted_at: null, deleted_batch_id: null })
        .eq("deleted_batch_id", batchId)
        .select();
      if (error) { anyError = error; continue; }
      if (data && data.length > 0) {
        const rows = data.map(t.map);
        t.setter((prev) => [...prev, ...rows]);
        rows.forEach((r) => logAction(t.name, r.id, "restored", `${t.label(r)} geri yüklendi`));
        if (t.name === "tickets") restoredTicketIds = rows.map((r) => r.id);
      }
    }
    // ticket_messages'ın kendi deleted_at'i yok — talep silinirken sadece
    // yerel state'ten filtreleniyordu, DB'de hep kaldı. Talep geri yüklenince
    // mesaj geçmişi görünsün diye burada ayrıca çekip state'e ekliyoruz.
    if (restoredTicketIds.length > 0) {
      const { data: tm } = await supabase.from("ticket_messages").select("*").in("ticket_id", restoredTicketIds).order("created_at");
      if (tm && tm.length > 0) {
        const restoredMessages = tm.map(rowToTicketMessage);
        setTicketMessages((prev) => [...prev, ...restoredMessages]);
      }
    }
    if (anyError) notify(`Geri yükleme sırasında hata: ${anyError.message}`);
    else notify("Kayıtlar geri yüklendi.", "success");
  };

  // Çöp kutusundan KALICI silme — restoreBatch'in tersi ama SADECE belirli
  // tablolar için. payments/company_expenses'e BİLEREK hiç dokunulmuyor (bkz.
  // sql/2026-08-01_trash_permanent_delete.sql'deki gerekçe - Vergi Usul
  // Kanunu/TTK saklama süresi netleşmeden bu kayıtlar silinmiyor, ayrıca DB
  // seviyesinde de bu iki tabloya DELETE hiç verilmedi). Bir teklif/müşteri
  // hâlâ silinmemiş bir tahsilata (aynı batch içinde payments kalmışsa) bağlıysa
  // o teklif/müşteri de atlanır - dangling deal_id/customer_id bırakmamak için.
  // activities/ticket_messages/deal_line_items'ın kendi deleted_at'i yok (restore
  // akışındaki AYNI not burada da geçerli) - bu yüzden üst kayıt (customer/
  // ticket/deal) silinmeden önce onlar açıkça temizleniyor, hem öksüz satır hem
  // olası FK hatası bırakmamak için.
  const permanentlyDeleteBatch = async (batchId) => {
    const skipped = [];
    let deletedCount = 0;

    const { data: batchPayments } = await supabase.from("payments").select("deal_id").eq("deleted_batch_id", batchId);
    const blockedDealIds = new Set((batchPayments || []).map((p) => p.deal_id).filter(Boolean));

    const { data: batchAttachments } = await supabase.from("attachments").select("id, storage_path").eq("deleted_batch_id", batchId);
    if (batchAttachments && batchAttachments.length > 0) {
      const paths = batchAttachments.map((a) => a.storage_path).filter(Boolean);
      if (paths.length > 0) {
        const { error: storageError } = await supabase.storage.from("attachments").remove(paths);
        if (storageError) skipped.push(`Dosya(lar) depodan silinemedi: ${storageError.message}`);
      }
      const { data, error } = await supabase.from("attachments").delete().eq("deleted_batch_id", batchId).select();
      if (error) skipped.push(`Dosyalar silinemedi: ${error.message}`); else deletedCount += data?.length || 0;
    }

    const { data: batchTickets } = await supabase.from("tickets").select("id").eq("deleted_batch_id", batchId);
    if (batchTickets && batchTickets.length > 0) {
      const ticketIds = batchTickets.map((t) => t.id);
      await supabase.from("ticket_messages").delete().in("ticket_id", ticketIds);
      const { data, error } = await supabase.from("tickets").delete().eq("deleted_batch_id", batchId).select();
      if (error) skipped.push(`Talepler silinemedi: ${error.message}`); else deletedCount += data?.length || 0;
    }

    for (const table of ["kb_articles", "group_classes"]) {
      const { data, error } = await supabase.from(table).delete().eq("deleted_batch_id", batchId).select();
      if (error) skipped.push(`${TRASH_TABLE_LABELS[table]}: ${error.message}`); else deletedCount += data?.length || 0;
    }

    const { data: batchDeals } = await supabase.from("deals").select("id").eq("deleted_batch_id", batchId);
    const deletableDealIds = (batchDeals || []).map((d) => d.id).filter((id) => !blockedDealIds.has(id));
    if (deletableDealIds.length > 0) {
      await supabase.from("deal_line_items").delete().in("deal_id", deletableDealIds);
      const { data, error } = await supabase.from("deals").delete().in("id", deletableDealIds).select();
      if (error) skipped.push(`Teklifler silinemedi: ${error.message}`); else deletedCount += data?.length || 0;
    }
    if (blockedDealIds.size > 0) skipped.push(`${blockedDealIds.size} teklif, bağlı tahsilat kaydı olduğu için kalıcı silinemedi`);

    const { data: batchCustomers } = await supabase.from("customers").select("id").eq("deleted_batch_id", batchId);
    let remainingDealCustomerIds = new Set();
    if (blockedDealIds.size > 0) {
      const { data: blockedDealsFull } = await supabase.from("deals").select("id, customer_id").in("id", [...blockedDealIds]);
      remainingDealCustomerIds = new Set((blockedDealsFull || []).map((d) => d.customer_id).filter(Boolean));
    }
    const deletableCustomerIds = (batchCustomers || []).map((c) => c.id).filter((id) => !remainingDealCustomerIds.has(id));
    if (deletableCustomerIds.length > 0) {
      await supabase.from("activities").delete().in("customer_id", deletableCustomerIds);
      const { data, error } = await supabase.from("customers").delete().in("id", deletableCustomerIds).select();
      if (error) skipped.push(`Müşteriler silinemedi: ${error.message}`); else deletedCount += data?.length || 0;
    }
    if (remainingDealCustomerIds.size > 0) skipped.push(`${remainingDealCustomerIds.size} müşteri, bağlı tahsilat kaydı olduğu için kalıcı silinemedi`);

    logAction(
      "trash",
      batchId,
      "permanently_deleted",
      `Çöp kutusundan ${deletedCount} kayıt kalıcı olarak silindi${skipped.length > 0 ? ` - ${skipped.join("; ")}` : ""}`
    );

    return { deletedCount, skipped };
  };

  const IMPORT_CHUNK_SIZE = 200;

  const bulkInsertChunked = async (table, rows, mapFn, setter, onProgress) => {
    let insertedCount = 0;
    const errors = [];
    for (let i = 0; i < rows.length; i += IMPORT_CHUNK_SIZE) {
      const chunk = rows.slice(i, i + IMPORT_CHUNK_SIZE);
      const { data, error } = await supabase.from(table).insert(chunk).select();
      if (error) {
        errors.push(error.message);
      } else {
        const inserted = (data || []).map(mapFn);
        setter((prev) => [...prev, ...inserted]);
        insertedCount += inserted.length;
      }
      onProgress?.(Math.min(i + IMPORT_CHUNK_SIZE, rows.length));
    }
    return { insertedCount, errors };
  };

  const bulkImportPriceListItems = async (records, onProgress) => {
    const rows = records.map((r) => ({ id: uid(), user_id: activeTeamId, name: r.name, price: Number(r.price) || 0 }));
    const outcome = await bulkInsertChunked("price_list_items", rows, rowToPriceListItem, setPriceListItems, onProgress);
    if (outcome.insertedCount > 0) logAction("price_list_items", uid(), "created", `${outcome.insertedCount} ürün/hizmet içe aktarıldı`);
    return outcome;
  };

  const bulkImportCustomers = async (records, onProgress) => {
    const now = new Date().toISOString();
    const rows = records.map((r) => ({
      id: uid(), user_id: activeTeamId, name: r.name, customer_type: r.customerType || "kurumsal",
      sector: r.customerType === "bireysel" ? "" : (r.sector || ""),
      region: r.region || "", address: r.address || "", phone: r.phone || "", email: r.email || "",
      notes: r.notes || "", last_contact: now, created_at: now,
    }));
    const outcome = await bulkInsertChunked("customers", rows, rowToCustomer, setCustomers, onProgress);
    if (outcome.insertedCount > 0) logAction("customers", uid(), "created", `${outcome.insertedCount} müşteri içe aktarıldı`);
    return outcome;
  };

  const bulkImportDeals = async (records, onProgress) => {
    const now = new Date().toISOString();
    const rows = records.map((r) => {
      const isClosingStage = r.stage === "kazanildi" || r.stage === "kaybedildi";
      return {
        id: uid(), user_id: activeTeamId, customer_id: r.customerId, title: r.title,
        value: r.value || 0, cost: r.cost || 0, stage: r.stage || "ilk_gorusme",
        kdv_rate: r.kdvRate !== undefined ? Number(r.kdvRate) : (companySettings?.defaultKdvRate ?? 20),
        reminder: "", reminder_date: null, lost_reason: "",
        created_at: now, closed_at: isClosingStage ? now : null,
      };
    });
    const outcome = await bulkInsertChunked("deals", rows, rowToDeal, setDeals, onProgress);
    if (outcome.insertedCount > 0) logAction("deals", uid(), "created", `${outcome.insertedCount} ${DEAL_WORD_FORMS[dealWordKind(companySettings?.sector)].bare} içe aktarıldı`);
    return outcome;
  };

  const bulkImportTickets = async (records, onProgress) => {
    const now = new Date().toISOString();
    const rows = records.map((r) => {
      const isTerminal = TERMINAL_STATUSES.includes(r.status);
      return {
        id: uid(), user_id: activeTeamId, customer_id: r.customerId, subject: r.subject,
        description: r.description || "", priority: r.priority || "orta", status: r.status || "acik",
        resolved_at: isTerminal ? now : null, created_at: now,
      };
    });
    const outcome = await bulkInsertChunked("tickets", rows, rowToTicket, setTickets, onProgress);
    if (outcome.insertedCount > 0) logAction("tickets", uid(), "created", `${outcome.insertedCount} destek talebi içe aktarıldı`);
    return outcome;
  };

  const bulkImportKbArticles = async (records, onProgress) => {
    const now = new Date().toISOString();
    const rows = records.map((r) => ({
      id: uid(), user_id: activeTeamId, title: r.title, category: r.category || "",
      content: r.content, created_at: now, updated_at: now,
    }));
    const outcome = await bulkInsertChunked("kb_articles", rows, rowToKbArticle, setKbArticles, onProgress);
    if (outcome.insertedCount > 0) logAction("kb_articles", uid(), "created", `${outcome.insertedCount} makale içe aktarıldı`);
    return outcome;
  };

  // patch, mevcut companySettings ÜZERİNE merge edilir - çağıran (örn.
  // CompanySettingsForm) her alanı bilmek/taşımak zorunda kalmasın diye.
  // Öncesinde bu merge YOKTU: sadece birkaç "eski" alan (lateCancelHours vb.)
  // CompanySettingsForm'un kendi payload'ında elle initial'dan taşınıyordu -
  // ama appointmentPenaltyHours/appointmentDepositAmount/appointmentPrepNote
  // gibi SONRADAN eklenen alanlar unutulmuştu. Sonuç: İşletme Bilgileri
  // formunu (isim/adres/logo) kaydetmek, o formda hiç görünmeyen randevu
  // ceza politikası/kapora/hazırlık notu gibi ayarları SESSİZCE null'a
  // çekiyordu - gerçek bir veri kaybı riski. Diğer çağıranlar (AppointmentCancelPolicyBox
  // vb.) zaten kendi tarafında {...companySettings, ...patch} yapıyordu, bu
  // merge onlar için zararsız bir tekrar.
  const upsertCompanySettings = async (patch) => {
    const s = { ...companySettings, ...patch };
    const row = {
      user_id: activeTeamId,
      company_name: s.companyName,
      address: s.address,
      phone: s.phone,
      email: s.email,
      tax_number: s.taxNumber,
      logo_url: s.logoUrl,
      default_kdv_rate: s.defaultKdvRate ?? 20,
      customer_notifications_enabled: s.customerNotificationsEnabled !== false,
      appointment_reminders_enabled: s.appointmentRemindersEnabled !== false,
      sector: s.sector || null,
      ...(s.preferredCustomerType ? { preferred_customer_type: s.preferredCustomerType } : {}),
      ...(s.pdfTemplateKey ? { pdf_template_key: s.pdfTemplateKey } : {}),
      late_cancel_hours: s.lateCancelHours || null,
      hard_block_hours: s.hardBlockHours || null,
      late_cancel_strike_limit: s.lateCancelStrikeLimit || null,
      appointment_cancel_hours: s.appointmentCancelHours || null,
      appointment_penalty_hours: s.appointmentPenaltyHours || null,
      appointment_penalty_strike_limit: s.appointmentPenaltyStrikeLimit || null,
      appointment_penalty_burns_session: s.appointmentPenaltyBurnsSession === true,
      appointment_partial_charge_hours: s.appointmentPartialChargeHours || null,
      google_review_link: s.googleReviewLink || null,
      google_review_requests_enabled: s.googleReviewRequestsEnabled !== false,
      appointment_prep_note: s.appointmentPrepNote || null,
      appointment_deposit_amount: s.appointmentDepositAmount || null,
      appointment_concurrency: s.appointmentConcurrency || null,
      winback_enabled: s.winbackEnabled === true,
      winback_inactive_days: s.winbackInactiveDays || null,
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await supabase.from("company_settings").upsert(row).select().single();
    if (error) { notify(`İşletme ayarları kaydedilemedi: ${error.message}`); return; }
    setCompanySettings(rowToCompanySettings(data));
    setShowSettingsForm(false);
    if (row.sector) await applySectorCustomFields(row.sector);
  };

  const addCustomFieldDef = async ({ entity, key, label, type, options, sector = null, audience = null }) => {
    const row = {
      id: uid(),
      user_id: activeTeamId,
      entity,
      key,
      label,
      field_type: type,
      options,
      sector,
      audience,
    };
    const { data, error } = await supabase.from("custom_field_defs").insert(row).select().single();
    if (error) { notify(`Özel alan eklenemedi: ${error.message}`); return; }
    setCustomFieldDefs((prev) => [...prev, rowToCustomFieldDef(data)]);
  };

  const updateCustomFieldDef = async ({ id, label, options, audience, sector, active, type }) => {
    const row = { label, options, audience };
    if (sector !== undefined) row.sector = sector;
    if (active !== undefined) row.active = active;
    if (type !== undefined) row.field_type = type;
    const { data, error } = await supabase.from("custom_field_defs").update(row).eq("id", id).select().single();
    if (error) { notify(`Özel alan güncellenemedi: ${error.message}`); return; }
    setCustomFieldDefs((prev) => prev.map((d) => (d.id === id ? rowToCustomFieldDef(data) : d)));
  };

  const setCustomFieldDefsActive = async (ids, active) => {
    if (ids.length === 0) return;
    const { error } = await supabase.from("custom_field_defs").update({ active }).in("id", ids);
    if (error) { notify(`Özel alanlar güncellenemedi: ${error.message}`); return; }
    setCustomFieldDefs((prev) => prev.map((d) => (ids.includes(d.id) ? { ...d, active } : d)));
  };

  const deleteCustomFieldDef = async (id) => {
    const { error } = await supabase.from("custom_field_defs").delete().eq("id", id);
    if (error) { notify(`Özel alan silinemedi: ${error.message}`); return; }
    setCustomFieldDefs((prev) => prev.filter((d) => d.id !== id));
  };

  const addPriceListItem = async ({ name, price, refreshDays, durationMinutes }) => {
    const row = { id: uid(), user_id: activeTeamId, name, price, refresh_days: refreshDays || null, duration_minutes: durationMinutes || null };
    const { data, error } = await supabase.from("price_list_items").insert(row).select().single();
    if (error) { notify(`Ürün/hizmet eklenemedi: ${error.message}`); return; }
    setPriceListItems((prev) => [...prev, rowToPriceListItem(data)]);
  };

  const updatePriceListItem = async ({ id, name, price, refreshDays, durationMinutes, commissionPercent }) => {
    const { data, error } = await supabase.from("price_list_items").update({ name, price, refresh_days: refreshDays || null, duration_minutes: durationMinutes || null, commission_percent: commissionPercent ?? null }).eq("id", id).select().single();
    if (error) { notify(`Ürün/hizmet güncellenemedi: ${error.message}`); return; }
    setPriceListItems((prev) => prev.map((p) => (p.id === id ? rowToPriceListItem(data) : p)));
  };

  const deletePriceListItem = async (id) => {
    const { error } = await supabase.from("price_list_items").delete().eq("id", id);
    if (error) { notify(`Ürün/hizmet silinemedi: ${error.message}`); return; }
    setPriceListItems((prev) => prev.filter((p) => p.id !== id));
  };

  const addStockItem = async ({ name, unit, quantityOnHand, reorderThreshold, supplierName }) => {
    const row = { id: uid(), user_id: activeTeamId, name, unit, quantity_on_hand: quantityOnHand || 0, reorder_threshold: reorderThreshold || null, supplier_name: supplierName || null };
    const { data, error } = await supabase.from("stock_items").insert(row).select().single();
    if (error) { notify(`Stok kalemi eklenemedi: ${error.message}`); return; }
    setStockItems((prev) => [...prev, rowToStockItem(data)]);
  };

  const updateStockItem = async ({ id, name, unit, quantityOnHand, reorderThreshold, supplierName }) => {
    const { data, error } = await supabase
      .from("stock_items")
      .update({ name, unit, quantity_on_hand: quantityOnHand || 0, reorder_threshold: reorderThreshold || null, supplier_name: supplierName || null })
      .eq("id", id).select().single();
    if (error) { notify(`Stok kalemi güncellenemedi: ${error.message}`); return; }
    setStockItems((prev) => prev.map((s) => (s.id === id ? rowToStockItem(data) : s)));
  };

  const deleteStockItem = async (id) => {
    const { error } = await supabase.from("stock_items").delete().eq("id", id);
    if (error) { notify(`Stok kalemi silinemedi: ${error.message}`); return; }
    setStockItems((prev) => prev.filter((s) => s.id !== id));
  };

  const addPriceItemIngredient = async ({ priceItemId, stockItemId, quantity }) => {
    const row = { id: uid(), user_id: activeTeamId, price_item_id: priceItemId, stock_item_id: stockItemId, quantity };
    const { data, error } = await supabase.from("price_item_ingredients").insert(row).select().single();
    if (error) { notify(`Reçete satırı eklenemedi: ${error.message}`); return; }
    setPriceItemIngredients((prev) => [...prev, rowToPriceItemIngredient(data)]);
  };

  const deletePriceItemIngredient = async (id) => {
    const { error } = await supabase.from("price_item_ingredients").delete().eq("id", id);
    if (error) { notify(`Reçete satırı silinemedi: ${error.message}`); return; }
    setPriceItemIngredients((prev) => prev.filter((i) => i.id !== id));
  };

  // Editörden gelen şablon ya mevcut bir DB kaydını günceller (id doluysa) ya
  // da yeni bir satır olarak eklenir (hazır şablondan çatallanmış veya "+ Yeni
  // Şablon"dan başlatılmışsa, id boş gelir).
  const savePdfTemplate = async ({ id, name, width, height, blocks }) => {
    if (id) {
      const { data, error } = await supabase.from("deal_pdf_templates").update({ name, width, height, blocks, updated_at: new Date().toISOString() }).eq("id", id).select().single();
      if (error) { notify(`Şablon kaydedilemedi: ${error.message}`); return; }
      setPdfTemplates((prev) => prev.map((t) => (t.id === id ? rowToPdfTemplate(data) : t)));
      setEditingTemplate(null);
      setShowPdfTemplates(true);
      return;
    }
    const row = { id: uid(), user_id: activeTeamId, name, width, height, blocks };
    const { data, error } = await supabase.from("deal_pdf_templates").insert(row).select().single();
    if (error) { notify(`Şablon kaydedilemedi: ${error.message}`); return; }
    setPdfTemplates((prev) => [...prev, rowToPdfTemplate(data)]);
    setEditingTemplate(null);
    setShowPdfTemplates(true);
  };

  const deletePdfTemplate = async (id) => {
    const { error } = await supabase.from("deal_pdf_templates").delete().eq("id", id);
    if (error) { notify(`Şablon silinemedi: ${error.message}`); return; }
    setPdfTemplates((prev) => prev.filter((t) => t.id !== id));
    if (companySettings?.pdfTemplateKey === id) await upsertCompanySettings({ ...companySettings, pdfTemplateKey: "klasik" });
  };

  const addGroupClass = async ({ name, instructorName, weekday, startTime, durationMinutes, capacity, notes }) => {
    const row = {
      id: uid(), user_id: activeTeamId, name, instructor_name: instructorName || null,
      weekday, start_time: startTime, duration_minutes: durationMinutes || 60, capacity, notes: notes || null,
    };
    const { data, error } = await supabase.from("group_classes").insert(row).select().single();
    if (error) { notify(`Ders eklenemedi: ${error.message}`); return; }
    setGroupClasses((prev) => [...prev, rowToGroupClass(data)]);
    logAction("group_classes", data.id, "created", `${name} dersi oluşturuldu`);
  };

  const updateGroupClass = async ({ id, name, instructorName, weekday, startTime, durationMinutes, capacity, notes }) => {
    const previous = groupClasses.find((g) => g.id === id);
    const { data, error } = await supabase
      .from("group_classes")
      .update({ name, instructor_name: instructorName || null, weekday, start_time: startTime, duration_minutes: durationMinutes || 60, capacity, notes: notes || null })
      .eq("id", id)
      .select()
      .single();
    if (error) { notify(`Ders güncellenemedi: ${error.message}`); return; }
    const updated = rowToGroupClass(data);
    setGroupClasses((prev) => prev.map((g) => (g.id === id ? updated : g)));

    // Gün, saat veya eğitmen değiştiyse kayıtlı üyelere haber ver — yoksa
    // örn. "Salı"dan "Çarşamba"ya taşınan bir dersi bekleyen üyeler bundan
    // habersiz kalır (ders tarihe değil güne bağlı, tekil oturum kaydı yok).
    const scheduleChanged = previous && (previous.weekday !== updated.weekday || previous.startTime !== updated.startTime || previous.instructorName !== updated.instructorName);
    if (scheduleChanged) {
      const enrolledCustomerIds = groupClassEnrollments.filter((e) => e.groupClassId === id).map((e) => e.customerId);
      for (const customerId of enrolledCustomerIds) {
        const customer = customers.find((c) => c.id === customerId);
        if (!customer) continue;
        notifyCustomerByEmail(
          customer,
          `${updated.name} dersinin programı değişti`,
          `Merhaba,\n\n${companySettings?.companyName || "Binerly"} - ${updated.name} dersinin programı güncellendi. Yeni ders zamanı: ${WEEKDAYS[updated.weekday - 1]} ${updated.startTime}${updated.instructorName ? ` · ${updated.instructorName}` : ""}.`
        );
      }
    }
  };

  const deleteGroupClass = async (id) => {
    const group = groupClasses.find((g) => g.id === id);
    const now = new Date().toISOString();
    const batchId = uid();
    const { error } = await supabase.from("group_classes").update({ deleted_at: now, deleted_batch_id: batchId }).eq("id", id);
    if (error) { notify(`Ders silinemedi: ${error.message}`); return; }
    // Kayıtlar (roster) geçmiş/denetim değeri taşımayan hafif bir join olduğu
    // için hard-delete edilir — ders geri yüklense bile üyelerin tekrar
    // eklenmesi gerekir (silme onay metninde buna dikkat çekiliyor).
    await supabase.from("group_class_enrollments").delete().eq("group_class_id", id);
    setGroupClasses((prev) => prev.filter((g) => g.id !== id));
    setGroupClassEnrollments((prev) => prev.filter((e) => e.groupClassId !== id));
    logAction("group_classes", id, "deleted", `${group?.name || "Ders"} çöp kutusuna taşındı`);
  };

  const enrollMember = async ({ groupClassId, customerId, silent = false }) => {
    const group = groupClasses.find((g) => g.id === groupClassId);
    if (!group) return;
    if (!activeMemberships.some((d) => d.customerId === customerId)) { notify(groupClassWords(companySettings?.sector).noMembershipToast); return; }
    const currentCount = groupClassEnrollments.filter((e) => e.groupClassId === groupClassId).length;
    if (currentCount >= group.capacity) { notify("Bu ders dolu."); return; }
    if (groupClassEnrollments.some((e) => e.groupClassId === groupClassId && e.customerId === customerId)) { notify("Bu müşteri zaten kayıtlı."); return; }
    const row = { id: uid(), user_id: activeTeamId, group_class_id: groupClassId, customer_id: customerId };
    const { data, error } = await supabase.from("group_class_enrollments").insert(row).select().single();
    if (error) { notify(`${groupClassWords(companySettings?.sector).addErrorPrefix}: ${error.message}`); return; }
    setGroupClassEnrollments((prev) => [...prev, rowToGroupClassEnrollment(data)]);
    if (!silent) {
      const customer = customers.find((c) => c.id === customerId);
      if (customer) {
        notifyCustomerByEmail(
          customer,
          `${group.name} dersine kaydedildiniz`,
          `Merhaba,\n\n${companySettings?.companyName || "Binerly"} - ${group.name} dersine (${WEEKDAYS[group.weekday - 1]} ${group.startTime}) kaydınız yapıldı.`
        );
      }
    }
  };

  const removeMember = async (enrollmentId) => {
    const enrollment = groupClassEnrollments.find((e) => e.id === enrollmentId);
    const { error } = await supabase.from("group_class_enrollments").delete().eq("id", enrollmentId);
    if (error) { notify(`${groupClassWords(companySettings?.sector).removeErrorPrefix}: ${error.message}`); return; }
    setGroupClassEnrollments((prev) => prev.filter((e) => e.id !== enrollmentId));
    if (enrollment) await promoteFromWaitlistIfAny(enrollment.groupClassId);
  };

  // Bir dersten çıkarma/iptal sonrası yer açılınca yedek listedeki İLK kişiyi
  // (en eski created_at) otomatik derse ekler. Sadece BURADAN (personel
  // tarafında) çalışır — müşterinin kendi portalından iptali, başka bir
  // müşteriyi derse eklemek için gereken yetkiye (RLS) sahip değil; o durumda
  // Pano'daki "yer açıldı" uyarısı üzerinden personel elle doldurur.
  const promoteFromWaitlistIfAny = async (groupClassId) => {
    const next = groupClassWaitlist
      .filter((w) => w.groupClassId === groupClassId)
      .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))[0];
    if (!next) return;
    await enrollMember({ groupClassId, customerId: next.customerId, silent: true });
    const { error } = await supabase.from("group_class_waitlist").delete().eq("id", next.id);
    if (!error) setGroupClassWaitlist((prev) => prev.filter((w) => w.id !== next.id));
    const customer = customers.find((c) => c.id === next.customerId);
    const group = groupClasses.find((g) => g.id === groupClassId);
    if (customer) notify(`${customer.name}, yedek listeden "${group?.name || "ders"}" dersine otomatik eklendi.`, "success");
  };

  const removeFromWaitlist = async (waitlistId) => {
    const { error } = await supabase.from("group_class_waitlist").delete().eq("id", waitlistId);
    if (error) { notify(`Yedek listeden çıkarılamadı: ${error.message}`); return; }
    setGroupClassWaitlist((prev) => prev.filter((w) => w.id !== waitlistId));
  };

  // Yoklama alma sık tekrarlanan (bir derste 10 öğrenci = 10 çağrı) bir
  // işlem — audit log'a yazılmıyor, mesajı "okundu" işaretlemenin loglanmaması
  // gibi aynı gerekçe.
  const setClassAttendance = async (groupClassId, customerId, occurrenceDate, status) => {
    const row = { user_id: activeTeamId, group_class_id: groupClassId, customer_id: customerId, occurrence_date: occurrenceDate, status, updated_at: new Date().toISOString() };
    const { data, error } = await supabase
      .from("class_attendance")
      .upsert(row, { onConflict: "group_class_id,customer_id,occurrence_date" })
      .select()
      .single();
    if (error) { notify(`Yoklama kaydedilemedi: ${error.message}`); return; }
    const record = rowToClassAttendance(data);
    setClassAttendanceState((prev) => [...prev.filter((a) => !(a.groupClassId === groupClassId && a.customerId === customerId && a.occurrenceDate === occurrenceDate)), record]);
  };

  const addBusinessHours = async ({ weekday, startTime, endTime, slotDurationMinutes }) => {
    const row = { id: uid(), user_id: activeTeamId, weekday, start_time: startTime, end_time: endTime, slot_duration_minutes: slotDurationMinutes };
    const { data, error } = await supabase.from("business_hours").insert(row).select().single();
    if (error) { notify(`Müsaitlik eklenemedi: ${error.message}`); return; }
    setBusinessHours((prev) => [...prev, rowToBusinessHours(data)]);
  };

  const deleteBusinessHours = async (id) => {
    const { error } = await supabase.from("business_hours").delete().eq("id", id);
    if (error) { notify(`Müsaitlik silinemedi: ${error.message}`); return; }
    setBusinessHours((prev) => prev.filter((b) => b.id !== id));
  };

  // Vardiya/izin özet mesajlarında kullanılacak isim — teamRoster hem sahip
  // hem üye için doluyor (bkz. teamRoster yorum notu), Personel Performansı
  // gibi hassas alanlar gerektirmiyor.
  const staffMemberLabel = (memberId) => {
    if (memberId === session.user.id) return "Ben";
    const m = teamRoster.find((r) => r.id === memberId);
    return m?.name || m?.email || "Bilinmeyen üye";
  };

  const addStaffShift = async ({ memberId, weekday, startTime, endTime }) => {
    const row = { id: uid(), user_id: activeTeamId, member_id: memberId, weekday, start_time: startTime, end_time: endTime, is_off: false };
    const { data, error } = await supabase.from("staff_shifts").insert(row).select().single();
    if (error) { notify(`Vardiya eklenemedi: ${error.message}`); return; }
    setStaffShifts((prev) => [...prev, rowToStaffShift(data)]);
    logAction("staff_shifts", data.id, "created", `${staffMemberLabel(memberId)} - ${WEEKDAYS[weekday - 1]} ${startTime}-${endTime} vardiyası eklendi`);
  };

  // Bir vardiya satırını "kaldırmak" ASLINDA SİLMEZ - geçmiş sorgulanabilir kalsın
  // diye valid_to bugüne kapatılır (satır hâlâ orada, sadece artık "açık" değil).
  // Tek istisna: satır bugün eklenip bugün kaldırılıyorsa (hiç geçmişe karışmadı,
  // aynı oturumdaki bir düzeltme) gerçekten silinir - anlamsız sıfır-günlük
  // versiyon geçmişte birikmesin diye.
  const closeStaffShiftRow = async (row) => {
    const todayStr = staffHistoryDateStr(new Date());
    if (row.validFrom === todayStr) {
      const { error } = await supabase.from("staff_shifts").delete().eq("id", row.id);
      if (error) { notify(`Vardiya kaldırılamadı: ${error.message}`); return null; }
      return { deleted: true };
    }
    const { error } = await supabase.from("staff_shifts").update({ valid_to: todayStr }).eq("id", row.id);
    if (error) { notify(`Vardiya kaldırılamadı: ${error.message}`); return null; }
    return { deleted: false, validTo: todayStr };
  };

  const deleteStaffShift = async (id) => {
    const existing = staffShifts.find((s) => s.id === id);
    if (!existing) return;
    const result = await closeStaffShiftRow(existing);
    if (!result) return;
    if (result.deleted) setStaffShifts((prev) => prev.filter((s) => s.id !== id));
    else setStaffShifts((prev) => prev.map((s) => (s.id === id ? { ...s, validTo: result.validTo } : s)));
    const what = existing.isOff ? "haftalık tatil işareti" : `${existing.startTime}-${existing.endTime} vardiyası`;
    logAction("staff_shifts", id, "deleted", `${staffMemberLabel(existing.memberId)} - ${WEEKDAYS[existing.weekday - 1]} ${what} kaldırıldı`);
  };

  // Bir günü haftalık tatil (off) olarak işaretlemek, o gün için AÇIK olan mevcut
  // saat aralıklarıyla ANLAMSAL OLARAK ÇAKIŞIR (biri "çalışıyor", diğeri "hiç
  // çalışmıyor" der) - bu yüzden önce o güne ait açık satırlar kapatılıp (soft-close,
  // geçmişte kalırlar), sonra tek bir is_off satırı bugünden başlatılıyor.
  const setStaffShiftDayOff = async (memberId, weekday) => {
    const openForDay = staffShifts.filter((s) => s.memberId === memberId && s.weekday === weekday && isOpenStaffShift(s));
    for (const s of openForDay) {
      const result = await closeStaffShiftRow(s);
      if (!result) continue;
      if (result.deleted) setStaffShifts((prev) => prev.filter((row) => row.id !== s.id));
      else setStaffShifts((prev) => prev.map((row) => (row.id === s.id ? { ...row, validTo: result.validTo } : row)));
    }
    const row = { id: uid(), user_id: activeTeamId, member_id: memberId, weekday, start_time: null, end_time: null, is_off: true };
    const { data, error } = await supabase.from("staff_shifts").insert(row).select().single();
    if (error) { notify(`Tatil işaretlenemedi: ${error.message}`); return; }
    setStaffShifts((prev) => [...prev, rowToStaffShift(data)]);
    logAction("staff_shifts", data.id, "updated", `${staffMemberLabel(memberId)} - ${WEEKDAYS[weekday - 1]} haftalık tatil olarak işaretlendi`);
  };

  const setStaffLeaveBalance = async (memberId, annualLeaveDays) => {
    const { data, error } = await supabase
      .from("staff_leave_balances")
      .upsert({ user_id: activeTeamId, member_id: memberId, annual_leave_days: annualLeaveDays, updated_at: new Date().toISOString() }, { onConflict: "user_id,member_id" })
      .select()
      .single();
    if (error) { notify(`İzin hakkı güncellenemedi: ${error.message}`); return; }
    const row = rowToStaffLeaveBalance(data);
    setStaffLeaveBalances((prev) => [...prev.filter((b) => b.memberId !== memberId), row]);
    logAction("staff_leave_balances", row.id, "updated", `${staffMemberLabel(memberId)} - yıllık izin hakkı ${annualLeaveDays} gün olarak ayarlandı`);
  };

  const addStaffLeaveRecord = async ({ memberId, leaveType, startDate, endDate, note }) => {
    if (endDate < startDate) { notify("Bitiş tarihi başlangıçtan önce olamaz."); return; }
    const row = { id: uid(), user_id: activeTeamId, member_id: memberId, leave_type: leaveType, start_date: startDate, end_date: endDate, note: note?.trim() || null, created_by: session.user.id };
    const { data, error } = await supabase.from("staff_leave_records").insert(row).select().single();
    if (error) { notify(`İzin kaydedilemedi: ${error.message}`); return; }
    const rec = rowToStaffLeaveRecord(data);
    setStaffLeaveRecords((prev) => [...prev, rec]);
    const dayCount = staffLeaveDayCount(startDate, endDate);
    logAction("staff_leave_records", rec.id, "created", `${staffMemberLabel(memberId)} - ${STAFF_LEAVE_TYPE_LABELS[leaveType]} (${formatLeaveDateRange(startDate, endDate)}, ${dayCount} gün) eklendi`);
    if (leaveType === "yillik") {
      const balance = staffLeaveBalances.find((b) => b.memberId === memberId)?.annualLeaveDays ?? 14;
      const used = staffLeaveRecords.filter((r) => r.memberId === memberId && r.leaveType === "yillik").reduce((sum, r) => sum + staffLeaveDayCount(r.startDate, r.endDate), 0) + dayCount;
      if (used > balance) notify(`Not: ${staffMemberLabel(memberId)} için yıllık izin bakiyesi aşıldı (${used}/${balance} gün kullanıldı).`);
    }
  };

  const deleteStaffLeaveRecord = async (id) => {
    const existing = staffLeaveRecords.find((r) => r.id === id);
    const { error } = await supabase.from("staff_leave_records").delete().eq("id", id);
    if (error) { notify(`İzin kaydı silinemedi: ${error.message}`); return; }
    setStaffLeaveRecords((prev) => prev.filter((r) => r.id !== id));
    if (existing) logAction("staff_leave_records", id, "deleted", `${staffMemberLabel(existing.memberId)} - ${STAFF_LEAVE_TYPE_LABELS[existing.leaveType]} kaydı silindi`);
  };

  const addRoomInventory = async ({ roomType, quantity, capacity, description }) => {
    const row = { id: uid(), user_id: activeTeamId, room_type: roomType, quantity, capacity: capacity || null, description: description || "" };
    const { data, error } = await supabase.from("room_inventory").insert(row).select().single();
    if (error) { notify(`Oda tipi eklenemedi: ${error.message}`); return; }
    setRoomInventory((prev) => [...prev, rowToRoomInventory(data)]);
  };

  const updateRoomInventory = async ({ id, quantity, capacity, description }) => {
    const { data, error } = await supabase.from("room_inventory").update({ quantity, capacity: capacity || null, description: description || "" }).eq("id", id).select().single();
    if (error) { notify(`Oda tipi güncellenemedi: ${error.message}`); return; }
    setRoomInventory((prev) => prev.map((r) => (r.id === id ? rowToRoomInventory(data) : r)));
  };

  const deleteRoomInventory = async (id) => {
    const { error } = await supabase.from("room_inventory").delete().eq("id", id);
    if (error) { notify(`Oda tipi silinemedi: ${error.message}`); return; }
    setRoomInventory((prev) => prev.filter((r) => r.id !== id));
  };

  const addResource = async ({ name, quantity }) => {
    const row = { id: uid(), user_id: activeTeamId, name: name.trim(), quantity: Math.max(1, Number(quantity) || 1) };
    const { data, error } = await supabase.from("resources").insert(row).select().single();
    if (error) { notify(`Kaynak eklenemedi: ${error.message}`); return; }
    setResources((prev) => [...prev, rowToResource(data)]);
  };

  const updateResource = async ({ id, quantity }) => {
    const { data, error } = await supabase.from("resources").update({ quantity: Math.max(1, Number(quantity) || 1) }).eq("id", id).select().single();
    if (error) { notify(`Kaynak güncellenemedi: ${error.message}`); return; }
    setResources((prev) => prev.map((r) => (r.id === id ? rowToResource(data) : r)));
  };

  const deleteResource = async (id) => {
    const { error } = await supabase.from("resources").delete().eq("id", id);
    if (error) { notify(`Kaynak silinemedi: ${error.message}`); return; }
    setResources((prev) => prev.filter((r) => r.id !== id));
  };

  // Sektör değişince formda görünen özel alanlar da değişsin isteniyor — ama
  // müşteri/teklif kayıtlarına daha önce girilmiş değerler kaybolmasın. Bu yüzden
  // başka bir sektöre ait alanlar SİLİNMEZ, sadece "active:false" ile gizlenir
  // (kaydedilmiş değerler DB'de durur); yeniden aynı sektöre dönülürse aynı
  // tanımlar "active:true" ile geri gelir. Elle eklenen alanlar (sector: null)
  // hiçbir sektör değişikliğinden etkilenmez.
  //
  // Bazı sektörler aynı (entity,key)'i FARKLI etiket/seçeneklerle kullanıyor
  // (örn. "gorusme_tarihi" emlak'ta "Görüşme/Randevu Tarihi", dijital_ajans'ta
  // "Keşif Görüşmesi Tarihi") — bu yüzden preset'teki her alan için önce
  // sektörden bağımsız var olup olmadığına bakılıyor: varsa yeni sektörün
  // etiket/seçenekleriyle güncellenip yeniden bu sektöre atanıyor (reclaim),
  // yoksa sıfırdan oluşturuluyor. "exists" kontrolü (entity,key)'i görmezden
  // gelip sektörü yok sayarsa, önceden başka bir sektöre etiketlenmiş inactive
  // bir satır hiç geri gelmeyip alan kalıcı kaybolur (geçmişte yaşanan bug).
  const applySectorCustomFields = async (sectorId) => {
    const preset = SECTOR_PRESETS.find((p) => p.id === sectorId);
    const presetKeys = new Set((preset?.customFields || []).map((f) => `${f.entity}:${f.key}`));
    const toHide = customFieldDefs.filter((d) => d.active && d.sector && !presetKeys.has(`${d.entity}:${d.key}`)).map((d) => d.id);
    await setCustomFieldDefsActive(toHide, false);
    if (!preset) return;
    for (const f of preset.customFields) {
      const existing = customFieldDefs.find((d) => d.entity === f.entity && d.key === f.key);
      if (!existing) {
        await addCustomFieldDef({ ...f, sector: sectorId });
      } else if (existing.sector !== sectorId || !existing.active || existing.type !== f.type) {
        // type de kontrol/düzeltiliyor — aksi halde örn. elle "Randevu Tarihi"
        // adında "Tarih" (date) tipinde bir alan daha önce oluşturulmuşsa, bu
        // sektöre "reclaim" edilirken sadece etiket/sektör/aktiflik güncellenip
        // tip yanlış kalır — "Tarih & Saat" (datetime) beklenen yerlerde
        // (randevu müsaitliği/hatırlatma) alan hiç bulunamaz.
        // audience de f'den (yeni sektörün preset'i) alınır, existing'den DEĞİL —
        // aksi halde reklam edilen alan eski sektörün "sadece bireysel/kurumsal"
        // kısıtını yanlışlıkla taşımaya devam ederdi.
        await updateCustomFieldDef({ id: existing.id, label: f.label, options: f.options, audience: f.audience ?? null, sector: sectorId, active: true, type: f.type });
      }
    }
  };

  const maybeStartTour = () => {
    if (activeTeamId && !localStorage.getItem(`binerly_tour_dismissed_${activeTeamId}`)) {
      setTourStep(0);
      setShowTour(true);
    }
  };

  const applySectorPreset = async (sectorId, companyName) => {
    await upsertCompanySettings({
      ...(companySettings || {}),
      sector: sectorId,
      ...(companyName ? { companyName } : {}),
      ...(isIndividualFocusedSector(sectorId) ? { preferredCustomerType: "bireysel" } : {}),
    });
    setShowSectorOnboarding(false);
    maybeStartTour();
  };

  const skipSectorOnboarding = (companyName) => {
    if (companyName) upsertCompanySettings({ ...(companySettings || {}), companyName });
    if (activeTeamId) localStorage.setItem(`binerly_sector_onboarding_dismissed_${activeTeamId}`, "1");
    setShowSectorOnboarding(false);
    maybeStartTour();
  };

  const acceptTeamInvite = async (invite) => {
    const { error } = await supabase.rpc("accept_team_invite", { p_owner_id: invite.owner_id });
    if (error) { notify(`Davet kabul edilemedi: ${error.message}`); return; }
    window.location.reload();
  };

  if (session === undefined) return <div style={{ padding: "2rem", textAlign: "center", color: "var(--text-secondary)" }}>Yükleniyor…</div>;
  if (!session) return <LandingPage />;

  if (loading) return <div style={{ padding: "2rem 0", textAlign: "center", color: "var(--text-secondary)" }}>Yükleniyor…</div>;

  const isOwner = activeTeamId === session.user.id;
  const canEditCompanySettings = isOwner || !!teamMembers.find((m) => m.id === session.user.id)?.canEditSettings;

  const paymentsByDeal = payments.reduce((acc, p) => { (acc[p.dealId] ||= []).push(p); return acc; }, {});
  const totalPaidForDeal = (dealId) => (paymentsByDeal[dealId] || []).reduce((sum, p) => sum + (p.amount || 0), 0);

  const openDeals = deals.filter((d) => d.stage !== "kazanildi" && d.stage !== "kaybedildi");
  const wonDealsAll = deals.filter((d) => d.stage === "kazanildi");
  const lostDealsAll = deals.filter((d) => d.stage === "kaybedildi");
  const dealsWithOutstanding = wonDealsAll.filter((d) => d.value - totalPaidForDeal(d.id) > 0);
  const totalOutstanding = dealsWithOutstanding.reduce((sum, d) => sum + (d.value - totalPaidForDeal(d.id)), 0);
  const rangeBounds = getRangeBounds(panoRange);
  const wonDeals = wonDealsAll.filter((d) => inRange(d.closedAt || d.createdAt, rangeBounds));
  const lostDeals = lostDealsAll.filter((d) => inRange(d.closedAt || d.createdAt, rangeBounds));
  // Randevu sektörlerinde "kaybedildi" nedeni artık "İptal etti"/"Randevuya
  // gelmedi" olarak ayrı ayrı seçiliyor (dealLostReasons) — bu oran SADECE
  // gerçek gelmeme (no-show) vakalarını sayar, iptalleri dahil etmez; ikisi
  // farklı işletme riskleri (iptal önceden bilinir, gelmeme boş yer kaybıdır).
  // Eski etiket tabanlı kayıtlar (geçiş öncesi test verisi) da geriye dönük
  // sayılmaya devam etsin diye tags da kontrol ediliyor.
  const noShowRate = isAppointmentSector(companySettings?.sector) && wonDeals.length + lostDeals.length > 0
    ? Math.round((lostDeals.filter((d) => d.lostReason === "Randevuya gelmedi" || d.tags?.includes("Gelmedi") || d.tags?.includes("Gelmedi (no-show)")).length / (wonDeals.length + lostDeals.length)) * 100)
    : null;
  // Sanayi Esnafı'nda kazanılan işlerin ortalama tamamlanma süresi (gün) —
  // müşteriye "genelde ne kadar sürer" sorusuna somut bir cevap verir.
  const avgCompletionDays = (companySettings?.sector === "sanayi_esnaf" || companySettings?.sector === "emlak") && wonDeals.length > 0
    ? Math.round(
        wonDeals.reduce((sum, d) => sum + (new Date(d.closedAt || d.createdAt) - new Date(d.createdAt)) / 86400000, 0) / wonDeals.length
      )
    : null;
  // Dijital Ajans'ta "Aylık/3 Aylık/Yıllık" sözleşme, Hizmet/Danışmanlık'ta
  // "Aylık paket" ücretlendirme modeli tekrarlayan (recurring) gelir sayılır.
  const RECURRING_VALUES = { dijital_ajans: ["Aylık", "3 Aylık", "Yıllık"], hizmet_danismanlik: ["Aylık paket"] };
  const recurringField = companySettings?.sector === "dijital_ajans" ? "sozlesme_suresi" : companySettings?.sector === "hizmet_danismanlik" ? "ucretlendirme_modeli" : null;
  const recurringRevenueRate = recurringField && wonDeals.length > 0
    ? Math.round((wonDeals.filter((d) => RECURRING_VALUES[companySettings.sector]?.includes(d.customFields?.[recurringField])).length / wonDeals.length) * 100)
    : null;
  const onlineSalesRate = companySettings?.sector === "perakende" && wonDeals.length > 0
    ? Math.round((wonDeals.filter((d) => d.customFields?.satis_kanali === "Online").length / wonDeals.length) * 100)
    : null;
  const totalOpenValue = openDeals.reduce((sum, d) => sum + (d.value || 0), 0);
  const expectedRevenue = openDeals.reduce((sum, d) => sum + (d.value || 0) * (STAGE_PROBABILITY[d.stage] || 0), 0);
  // "Gelecek ay tahmini" — Pano'nun seçili tarih aralığından bağımsız, hep
  // "şu an"a göre son 3 TAM ayın (içinde bulunulan ay hariç — eksik olduğu
  // için yanıltıcı olur) ortalama kazanılan gelirine dayanan basit bir trend
  // tahmini. Beklenen Gelir'den farklı: o açık pipeline'ı ölçer, bu geçmiş
  // performansın ortalamasını ölçer.
  const now = new Date();
  const trailingMonthRevenues = [1, 2, 3].map((monthsAgo) => {
    const d = new Date(now.getFullYear(), now.getMonth() - monthsAgo, 1);
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    return wonDealsAll
      .filter((deal) => `${new Date(deal.closedAt || deal.createdAt).getFullYear()}-${new Date(deal.closedAt || deal.createdAt).getMonth()}` === key)
      .reduce((sum, deal) => sum + (deal.value || 0), 0);
  });
  const nextMonthForecast = trailingMonthRevenues.some((v) => v > 0)
    ? trailingMonthRevenues.reduce((a, b) => a + b, 0) / trailingMonthRevenues.length
    : null;
  // "Pasif müşteri oranı" — "churn" yerine bilinçli olarak bu isim kullanıldı
  // (bkz. plan notu): net bir abonelik iptali sinyali her sektörde yok, bu
  // yüzden "en az bir kez satın almış ama uzun süredir hiç yeni işlemi
  // olmayan müşteri" tanımı kullanılıyor. Pano'nun tarih aralığı filtresinden
  // bağımsız, hep "şu an"a göre hesaplanan bir anlık görüntü.
  const PASSIVE_CUSTOMER_DAYS = 90;
  const customersWithPastPurchase = customers.filter((c) => wonDealsAll.some((d) => d.customerId === c.id));
  const passiveCustomerRate = customersWithPastPurchase.length > 0
    ? Math.round(
        (customersWithPastPurchase.filter((c) => {
          const hasOpenDeal = openDeals.some((d) => d.customerId === c.id);
          if (hasOpenDeal) return false;
          const lastActivity = deals
            .filter((d) => d.customerId === c.id)
            .reduce((latest, d) => { const t = new Date(d.closedAt || d.createdAt); return t > latest ? t : latest; }, new Date(0));
          return (Date.now() - lastActivity.getTime()) / 86400000 > PASSIVE_CUSTOMER_DAYS;
        }).length / customersWithPastPurchase.length) * 100
      )
    : null;
  const dealsWithReminder = deals.filter((d) => d.reminder && d.stage !== "kazanildi" && d.stage !== "kaybedildi");
  // Grup Dersleri destekleyen sektörlerde: "kazanıldı" aşamasındaki ve bitiş
  // tarihi geçmemiş (veya hiç girilmemiş) kayıtlar "aktif üyelik/kayıt" sayılır
  // — Spor Merkezi'nde uyelik_bitis_tarihi, Eğitim/Kurs Merkezi'nde kurs_bitis_tarihi.
  const activeMemberships = supportsGroupClasses(companySettings?.sector)
    ? wonDealsAll.filter((d) => {
        const endDate = d.customFields?.uyelik_bitis_tarihi ?? d.customFields?.kurs_bitis_tarihi;
        return !endDate || endDate >= new Date().toISOString().slice(0, 10);
      })
    : [];
  const customerById = (id) => customers.find((c) => c.id === id);

  const customerQuery = customerSearch.trim().toLowerCase();
  const filteredCustomers = customers
    .filter((c) => {
      if (!matchesDateRange(c.lastContact, customerFromDate, customerToDate)) return false;
      if (customerSectorFilter !== "all" && c.sector !== customerSectorFilter) return false;
      if (customerTypeFilter !== "all" && c.customerType !== customerTypeFilter) return false;
      if (customerConsentFilter === "verildi" && !c.marketingConsent) return false;
      if (customerConsentFilter === "verilmedi" && c.marketingConsent) return false;
      if (!customerQuery) return true;
      return [c.name, c.sector, c.region, c.address, c.phone, c.email].some((f) => (f || "").toLowerCase().includes(customerQuery));
    })
    .sort((a, b) =>
      customerSort === "newest"
        ? new Date(b.createdAt) - new Date(a.createdAt)
        : new Date(a.createdAt) - new Date(b.createdAt)
    );

  // Müşteri Takibi sekmesindeki genel metinler (arama, boş durum, tablo başlığı vb.)
  // için "üyelik" mi "randevu" mu "teklif" mi diyeceğimize karar veren tek sinyal:
  // Spor Merkezi ise her zaman üyelik; değilse ya sektörün kendisi randevu-temelli,
  // ya da o an bireysel görünümdeyiz (kurumsal olsa da sektör randevu-temelliyse
  // sektör kazanır — stageLabel()'daki önceliğin aynısı).
  const dealKind = dealWordKind(companySettings?.sector);
  const dealWords = DEAL_TAB_STRINGS[dealKind];
  const dealPdfLabel = DEAL_WORD_FORMS[dealKind].pdfLabel;
  // "Randevularım" sekmesi için — appointment-availability.js/send-appointment-
  // reminders.js'in yaptığı gibi, sektöre göre değişen randevu tarihi alanının
  // gerçek anahtarını aktif "Tarih & Saat" tipindeki tanımdan buluyoruz.
  const appointmentDateTimeKey = customFieldDefs.find((d) => d.entity === "deal" && d.type === "datetime" && d.active)?.key || null;
  // "İlgilenilmesi gereken" filtresi sekme adına (dealKind) göre değil, sektörün
  // gerçek yeteneğine göre davranır — bkz. plan notu: Emlak/Dijital Ajans gibi
  // "Teklifler" adlı ama görüşme tarihi olan sektörler appointmentDateTimeKey
  // doluysa zaten randevu mantığını kullanır.
  const isInventorySector = bookingModel(companySettings?.sector) === "inventory";
  const isMembershipSector = supportsGroupClasses(companySettings?.sector);
  const todaysClassCustomerIds = isMembershipSector
    ? (() => {
        const isoWeekday = new Date().getDay() === 0 ? 7 : new Date().getDay();
        const todaysClassIds = new Set(groupClasses.filter((g) => g.weekday === isoWeekday).map((g) => g.id));
        return new Set(groupClassEnrollments.filter((e) => todaysClassIds.has(e.groupClassId)).map((e) => e.customerId));
      })()
    : null;
  const membershipExpiryMonths = { "1m": 1, "3m": 3, "6m": 6 }[dealMembershipExpiryFilter] || null;
  const membershipExpiryLimitStr = membershipExpiryMonths
    ? (() => {
        const d = new Date();
        d.setMonth(d.getMonth() + membershipExpiryMonths);
        return agendaDateKey(d);
      })()
    : null;
  const dealQuery = dealSearch.trim().toLowerCase();
  const filteredDeals = deals.filter((d) => {
    if ((customerById(d.customerId)?.customerType || "kurumsal") !== dealAudience) return false;
    if (!matchesDateRange(d.createdAt, dealFromDate, dealToDate)) return false;
    if (dealStageFilter === "acik" && (d.stage === "kazanildi" || d.stage === "kaybedildi")) return false;
    if (dealStageFilter !== "all" && dealStageFilter !== "acik" && d.stage !== dealStageFilter) return false;
    if (dealPaymentFilter !== "all") {
      const paid = totalPaidForDeal(d.id);
      if (dealPaymentFilter === "odendi" && paid < d.value) return false;
      if (dealPaymentFilter === "kismi" && !(paid > 0 && paid < d.value)) return false;
      if (dealPaymentFilter === "odenmedi" && paid > 0) return false;
    }
    if (isMembershipSector) {
      if (dealTodayClassFilter && !todaysClassCustomerIds.has(d.customerId)) return false;
      if (membershipExpiryLimitStr) {
        const endDateStr = d.customFields?.uyelik_bitis_tarihi ?? d.customFields?.kurs_bitis_tarihi;
        if (!endDateStr || endDateStr > membershipExpiryLimitStr) return false;
      }
    } else if (dealQuickDateFilter !== "all") {
      const win = quickDateWindow(dealQuickDateFilter);
      if (appointmentDateTimeKey) {
        const dt = parseAppointmentDateTime(d.customFields?.[appointmentDateTimeKey]);
        if (!dt || dt < win.start || dt > win.end) return false;
      } else if (isInventorySector) {
        const checkin = d.customFields?.giris_tarihi;
        const checkout = d.customFields?.cikis_tarihi;
        const inWindow =
          (checkin && checkin >= win.startStr && checkin <= win.endStr) ||
          (checkout && checkout >= win.startStr && checkout <= win.endStr);
        if (!inWindow) return false;
      } else {
        if (!d.reminder || !d.reminderDate || new Date(d.reminderDate) > win.end) return false;
      }
    }
    if (!dealQuery) return true;
    return (
      d.title.toLowerCase().includes(dealQuery) ||
      (customerById(d.customerId)?.name || "").toLowerCase().includes(dealQuery)
    );
  }).sort((a, b) =>
    dealSort === "newest" ? new Date(b.createdAt) - new Date(a.createdAt) : new Date(a.createdAt) - new Date(b.createdAt)
  );

  // "Mesajlar" sohbet talebi (is_general_chat) hiçbir zaman kapanmadığı için
  // Destek analitiğine (SLA, açık talep sayısı, ortalama yaş vb.) karışmaması
  // gerekiyor — bunu tek bir noktada, ham `tickets`ten türeterek ayırıyoruz;
  // aşağıdaki ve Support/askCtx'e giden HER hesap bundan sonra supportTickets
  // kullanmalı, ham tickets'i değil.
  const supportTickets = tickets.filter((t) => !t.isGeneralChat);
  const chatTickets = tickets.filter((t) => t.isGeneralChat);
  const chatTicketIds = new Set(chatTickets.map((t) => t.id));
  const supportTicketMessages = ticketMessages.filter((m) => !chatTicketIds.has(m.ticketId));
  const chatMessages = ticketMessages.filter((m) => chatTicketIds.has(m.ticketId));
  const chatConversations = computeChatConversations(chatTickets, chatMessages, customerById);
  const selectedChatConversation = chatConversations.find((c) => c.ticket.id === selectedChatTicketId) || null;
  const chatUnreadCount = chatConversations.reduce((sum, c) => sum + c.unread, 0);

  const openTicketsCount = supportTickets.filter((t) => !TERMINAL_STATUSES.includes(t.status)).length;
  const breachedTickets = supportTickets.filter(
    (t) => !TERMINAL_STATUSES.includes(t.status) && getSlaStatus(t).isBreached
  );
  const breachedTicketsCount = breachedTickets.length;

  const unreadMessageTicketIds = [
    ...new Set(supportTicketMessages.filter((m) => m.direction === "gelen" && !m.readAt).map((m) => m.ticketId)),
  ];
  const ticketsWithUnread = supportTickets.filter((t) => unreadMessageTicketIds.includes(t.id));
  // unreadMessageTicketIds ham mesaj kayıtlarından geliyor — silinmiş/çöpe taşınmış
  // bir talebin mesajları yerel state'te öylece kalabilir (ticket_messages'ın kendi
  // deleted_at'i yok). Rozet sayısı bu yüzden hâlâ var olan taleplerle sınırlanmalı.
  const unreadMessagesCount = ticketsWithUnread.length;

  const askCtx = {
    customers, deals, payments, tickets: supportTickets, ticketMessages: supportTicketMessages, companyExpenses, companySettings,
    nextMonthForecast, passiveCustomerRate, totalOutstanding, breachedTicketsCount, unreadMessagesCount,
    kbArticles, teamMembers, attachments, customFieldDefs, priceListItems,
    groupClasses, groupClassEnrollments, businessHours, paymentCredentials,
    appointmentDateTimeKey, currentUserId: session.user.id,
    classAttendance, dealLineItems, pdfTemplates,
  };

  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);
  const dueReminderDeals = deals.filter(
    (d) => d.reminder && d.reminderDate && d.stage !== "kazanildi" && d.stage !== "kaybedildi" && new Date(d.reminderDate) <= todayEnd
  );
  // Müşteri portalından kendi kendine alınan, henüz KOBİ tarafından hiç
  // dokunulmamış (hâlâ "ilk_gorusme" aşamasında) randevu talepleri — gözden
  // kaçmasınlar diye "Bugün ne yapmalıyım" widget'ında en üstte gösterilir.
  const newPortalAppointments = deals.filter(
    (d) => SELF_BOOKED_SOURCES.includes(d.customFields?.kaynak) && d.customFields?.portal_randevu_zamani && d.stage === "ilk_gorusme"
  );
  // Personel/Kaynak bazlı çakışma koruması (findAppointmentConflict) sadece
  // ATANMIŞ randevularda çalışır - müşteri portalından/widget'tan gelen
  // randevular varsayılan olarak kimseye atanmamış geliyor (bkz.
  // project_binerly_resource_staff_conflict). Bu, saati yaklaşan ama hâlâ
  // "Sorumlu"suz kalan randevuları öne çıkarır - kısıtlama değil sadece
  // görünürlük, atamayı yapıp yapmamak KOBİ'nin tercihi.
  const unassignedUpcomingAppointments = bookingModel(companySettings?.sector) === "slot" && appointmentDateTimeKey
    ? deals
        .filter((d) => d.stage !== "kazanildi" && d.stage !== "kaybedildi" && !d.assignedTo)
        .map((d) => {
          const raw = d.customFields?.[appointmentDateTimeKey];
          const apptTime = raw ? new Date(`${raw}:00+03:00`) : null;
          return { deal: d, apptTime };
        })
        .filter((x) => x.apptTime && !isNaN(x.apptTime.getTime()) && x.apptTime.getTime() > Date.now())
        .sort((a, b) => a.apptTime - b.apptTime)
    : [];
  const urgentTickets = supportTickets.filter((t) => {
    if (TERMINAL_STATUSES.includes(t.status)) return false;
    const s = getSlaStatus(t);
    return s.isBreached || s.isApproaching;
  });
  const orderRhythmAlerts = computeOrderRhythmAlerts(deals, customers);
  const stuckDeals = computeStuckDeals(deals);
  // Randevu sektörlerinde (Güzellik & Bakım, Sağlık/Klinik) bir randevu iptal/
  // gelmeme ile boşaldığında — o saat hâlâ ileride olduğu sürece (geçmiş bir
  // no-show'u "boşalan saat" olarak göstermenin anlamı yok) — Pano'da bilgi
  // amaçlı bir uyarı gösterilir. Bilinçli olarak aday müşteri ÖNERİLMİYOR
  // (doğrulanmamış eşleştirme riski, bkz. feedback_portal_privacy_priority) —
  // kimi arayacağına kobi kendi karar verir, sadece Müşteriler'e link verilir.
  const freedAppointmentAlerts = isAppointmentSector(companySettings?.sector) && appointmentDateTimeKey
    ? deals
        // Hangi lostReason'la iptal edildiği fark etmez — ileri tarihli bir randevu
        // kaybedildi'ye geçtiyse o saat boşalmıştır. "Diğer" bilerek hariç: çok
        // genel/belirsiz bir kategori, gerçekten randevu iptali olmayabilir.
        .filter((d) => d.stage === "kaybedildi" && d.lostReason !== "Diğer")
        .map((d) => {
          const raw = d.customFields?.[appointmentDateTimeKey];
          const apptTime = raw ? new Date(`${raw}:00+03:00`) : null;
          return { deal: d, apptTime };
        })
        .filter((x) => x.apptTime && !isNaN(x.apptTime.getTime()) && x.apptTime.getTime() > Date.now())
        .sort((a, b) => a.apptTime - b.apptTime)
    : [];
  // Randevu sektörlerinde (anlık işlem yapılıp aynı gün kapanan randevular)
  // aşama değişikliği elle kanban/liste ile uğraşmak yerine tek tık onaya
  // indirgeniyor — saati geçmiş, hâlâ açık randevular burada toplanır. Paket
  // teklifleri (sessionTotal>0) BİLEREK hariç: bir paketin "kazanıldı"ya
  // taşınması tüm paketi kapatır, tek bir seansın kullanımını değil — paket
  // seans sayacı ayrı bir akışla (incrementSessionUsage) yönetilmeye devam
  // ediyor, bkz. project_binerly_beauty_pipeline_fit_question.
  const pendingArrivalConfirmations = isAppointmentSector(companySettings?.sector) && appointmentDateTimeKey
    ? deals
        .filter((d) => d.stage !== "kazanildi" && d.stage !== "kaybedildi" && !(d.sessionTotal > 0))
        .map((d) => {
          const raw = d.customFields?.[appointmentDateTimeKey];
          const apptTime = raw ? new Date(`${raw}:00+03:00`) : null;
          return { deal: d, apptTime };
        })
        .filter((x) => x.apptTime && !isNaN(x.apptTime.getTime()) && x.apptTime.getTime() <= Date.now())
        .sort((a, b) => a.apptTime - b.apptTime)
    : [];
  // Kanban/liste satırlarındaki tek-tık "Tamamlandı" kısayolu (aşağıda) AYNI
  // kümeyi kullanır - saati henüz gelmemiş bir randevu yanlışlıkla erken
  // kapatılamasın diye Pano'daki "Bugünün Randevuları" widget'ıyla BİREBİR
  // aynı kural (saati geçmiş + henüz kapanmamış + paket değil).
  const pendingArrivalDealIds = new Set(pendingArrivalConfirmations.map((x) => x.deal.id));
  // Otel'de "kazanıldı" (rezervasyon onaylandı) haftalar önce gerçekleşebilir —
  // asıl operasyonel an giriş/çıkış GÜNÜ, aşama değişikliğiyle ilgisi yok. Bu
  // yüzden randevu sektörlerindeki gibi bir aşama-onayı değil, sadece bugünün
  // giriş/çıkışlarını toplayan bilgilendirici bir liste (bkz.
  // project_binerly_beauty_pipeline_fit_question — aynı "günün operasyonel
  // işi" ihtiyacı, farklı sektörde farklı çözüm).
  const otelTodayStr = new Date().toISOString().slice(0, 10);
  const otelArrivalsToday = companySettings?.sector === "otel"
    ? deals.filter((d) => d.stage === "kazanildi" && (d.customFields?.giris_tarihi || "").slice(0, 10) === otelTodayStr)
    : [];
  const otelDeparturesToday = companySettings?.sector === "otel"
    ? deals.filter((d) => d.stage === "kazanildi" && (d.customFields?.cikis_tarihi || "").slice(0, 10) === otelTodayStr)
    : [];
  const lowStockItems = stockItems.filter((s) => s.reorderThreshold != null && s.quantityOnHand <= s.reorderThreshold);
  const membershipAlerts = computeMembershipAlerts(deals, customers);
  const churnAlerts = supportsGroupClasses(companySettings?.sector) ? computeAttendanceChurnRisk(customers, deals, groupClassEnrollments, classAttendance) : [];
  // Bir üye kendi portalından iptal edip yer açtığında (personel tarafından
  // değil) otomatik terfi RLS nedeniyle çalışmaz (bkz. promoteFromWaitlistIfAny
  // yorumu) — bu durumu burada yakalayıp personele tek tık "Doldur" sunuyoruz.
  const waitlistFillableAlerts = groupClasses
    .map((g) => {
      const enrolledCount = groupClassEnrollments.filter((e) => e.groupClassId === g.id).length;
      const waitCount = groupClassWaitlist.filter((w) => w.groupClassId === g.id).length;
      return enrolledCount < g.capacity && waitCount > 0 ? { group: g, waitCount } : null;
    })
    .filter(Boolean);

  const openDealOrList = (items, title) => {
    if (items.length === 0) return;
    if (items.length === 1) {
      setTab("firsat");
      setEditingDeal(items[0]);
      setShowDealForm(true);
      return;
    }
    setQuickList({ kind: "deal", title, items });
  };

  const openTicketOrList = (items, title) => {
    if (items.length === 0) return;
    if (items.length === 1) {
      setTab("destek");
      setInitialViewTicketId(items[0].id);
      return;
    }
    setQuickList({ kind: "ticket", title, items });
  };

  const closedCount = wonDeals.length + lostDeals.length;
  const winRate = closedCount > 0 ? Math.round((wonDeals.length / closedCount) * 100) : null;

  const monthBuckets = getMonthlyBuckets(panoRange, wonDealsAll);
  const revenueProfitByBucket = monthBuckets.map(({ key, label }) => {
    const bucketDeals = wonDeals.filter((d) => {
      const dd = new Date(d.closedAt || d.createdAt);
      return `${dd.getFullYear()}-${dd.getMonth()}` === key;
    });
    const revenue = bucketDeals.reduce((sum, d) => sum + (d.value || 0), 0);
    const cost = bucketDeals.reduce((sum, d) => sum + (d.cost || 0), 0);
    return { label, revenue, profit: revenue - cost };
  });
  const maxBucketValue = Math.max(1, ...revenueProfitByBucket.map((m) => Math.max(m.revenue, m.profit, 0)));

  const rangeLabel = PANO_RANGES.find((r) => r.id === panoRange)?.label || "";
  const rangeRevenue = wonDeals.reduce((sum, d) => sum + (d.value || 0), 0);
  const rangeCost = wonDeals.reduce((sum, d) => sum + (d.cost || 0), 0);
  const rangeProfit = rangeRevenue - rangeCost;
  const rangeProfitMargin = rangeRevenue > 0 ? Math.round((rangeProfit / rangeRevenue) * 100) : null;
  const rangeAvgDealSize = wonDeals.length > 0 ? rangeRevenue / wonDeals.length : null;
  const rangePayments = payments.filter((p) => inRange(p.paidAt, rangeBounds));
  const totalCollected = rangePayments.reduce((sum, p) => sum + (p.amount || 0), 0);

  const lostReasonCounts = dealLostReasons(companySettings?.sector).map((reason) => ({
    reason,
    count: lostDeals.filter((d) => d.lostReason === reason).length,
  })).filter((r) => r.count > 0);

  return (
    <div style={{ padding: "24px 16px 64px" }}>
      <div className="app-header-row" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1.5rem" }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
          <IconButton icon="ti-menu-2" onClick={() => setSidebarOpen(true)} title="Menü" className="app-sidebar-toggle" />
          <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <img src="/favicon.svg" alt="Binerly" style={{ width: 31, height: 31 }} />
            <h1 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>Binerly</h1>
            {companySettings?.companyName && (
              <>
                <span style={{ width: 1, height: 18, background: "var(--border)" }} aria-hidden="true" />
                <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  {companySettings.logoUrl && (
                    <img
                      src={companySettings.logoUrl}
                      alt=""
                      style={{ width: 18, height: 18, borderRadius: 4, objectFit: "contain" }}
                      onError={(e) => { e.currentTarget.style.display = "none"; }}
                    />
                  )}
                  <span style={{ fontSize: 13, color: "var(--text-secondary)", fontWeight: 500 }}>{companySettings.companyName}</span>
                </span>
              </>
            )}
          </div>
          <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: 0 }}>KOBİ satış takip sistemi</p>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <NotificationBell userId={session.user.id} supabase={supabase} dataTour="notification-bell" />
          <IconButton icon="ti-settings" onClick={() => setShowSettingsHub(true)} title="Ayarlar" data-tour="settings-gear" />
          <IconButton icon="ti-logout" label="Çıkış" onClick={() => supabase.auth.signOut()} title="Çıkış yap" className="app-header-logout-btn" />
        </div>
      </div>

      {!pushSubscribed && (
        <p style={{ fontSize: 11, color: "var(--text-muted)", margin: "-12px 0 12px" }}>
          🔔{" "}
          <button type="button" onClick={() => setShowSettingsHub(true)} style={{ fontSize: 11, color: "var(--text-accent)", background: "none", border: "none", padding: 0, cursor: "pointer", textDecoration: "underline" }}>
            Ayarlar'dan bildirimleri açarak
          </button>{" "}
          yeni müşteri mesajlarında anında haberdar olabilirsiniz. iPhone'da bildirim almak için önce uygulamayı Ana Ekrana eklemeniz gerekir.
        </p>
      )}

      {pendingInvites
        .filter((inv) => !dismissedInviteIds.includes(inv.id))
        .map((inv) => {
          const acknowledged = acknowledgedInviteIds.includes(inv.id);
          return (
            <div
              key={inv.id}
              style={{
                background: "var(--bg-accent)", border: "0.5px solid var(--border-strong)",
                borderRadius: "var(--radius)", padding: "10px 14px", marginBottom: 12, fontSize: 13,
              }}
            >
              <p style={{ margin: "0 0 8px" }}>
                Bir işletme sizi takımına davet etti ({inv.email}) - takıma katılırsanız o işletmenin tüm müşteri/teklif/destek verisini görüp düzenleyebilirsiniz.
                {(customers.length > 0 || deals.length > 0) && " Mevcut verileriniz size özel kalacak, takıma taşınmayacak."}
              </p>
              <label style={{ display: "flex", alignItems: "flex-start", gap: 6, marginBottom: 10, cursor: "pointer", fontSize: 12.5 }}>
                <input
                  type="checkbox"
                  checked={acknowledged}
                  onChange={(e) =>
                    setAcknowledgedInviteIds((prev) =>
                      e.target.checked ? [...prev, inv.id] : prev.filter((id) => id !== inv.id)
                    )
                  }
                  style={{ marginTop: 2 }}
                />
                <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  Bu işletmenin çalışanı veya yetkilisi olduğumu beyan ederim.
                  <InfoTip text="Bir hesap yalnızca aynı işletmenin çalışan/yetkilileri arasında paylaşılabilir (Kullanım Koşulları md. 3) - bu beyan, ilgisiz kişi/işletmelerin maliyet paylaşmak için bir hesabı ortak kullanmasını önlemek için isteniyor." />
                </span>
              </label>
              <span style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                <button onClick={() => setDismissedInviteIds((prev) => [...prev, inv.id])}>Şimdi değil</button>
                <button
                  onClick={() => acceptTeamInvite(inv)}
                  disabled={!acknowledged}
                  style={{ background: "var(--fill-accent)", color: "var(--on-accent)", border: "none" }}
                >
                  Kabul et
                </button>
              </span>
            </div>
          );
        })}

      <h2 className="sr-only">KOBİ satış takip uygulaması: pano, müşteriler ve iş takibi sekmeleri</h2>

      <div style={{ display: "flex", gap: 32, alignItems: "flex-start", maxWidth: 1300 }}>
      {sidebarOpen && <div className="app-sidebar-backdrop" onClick={() => setSidebarOpen(false)} />}
      <nav className={`app-sidebar${sidebarOpen ? " open" : ""}`} style={{ width: 200, flexShrink: 0, display: "flex", flexDirection: "column", gap: 4, position: "sticky", top: 24 }}>
        {[
          { id: "pano", label: "Pano", icon: "ti-layout-dashboard" },
          { id: "musteri", label: "Müşteriler", icon: "ti-building" },
          { id: "firsat", label: dealWords.navLabel, icon: "ti-target-arrow" },
          ...(canEditCompanySettings ? [{ id: "fiyatlistesi", label: "Fiyat Listesi", icon: "ti-tag" }] : []),
          ...(canEditCompanySettings ? [{ id: "stokmalzeme", label: "Stok & Malzeme", icon: "ti-package" }] : []),
          { id: "ajanda", label: "Ajanda", icon: "ti-calendar-event" },
          { id: "finans", label: "Finans", icon: "ti-chart-line" },
          { id: "mesajlar", label: "Mesajlar", icon: "ti-message-2" },
          ...(supportsGroupClasses(companySettings?.sector) ? [{ id: "dersler", label: "Dersler", icon: "ti-calendar-time" }] : []),
          { id: "destek", label: "Destek", icon: "ti-headset" },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => { setTab(t.id); setSidebarOpen(false); }}
            data-tour={`tab-${t.id}`}
            className={tab === t.id ? undefined : "app-sidebar-tab"}
            style={{
              border: tab === t.id ? "0.5px solid var(--border-strong)" : "0.5px solid transparent",
              background: tab === t.id ? "var(--surface-1)" : "transparent",
              display: "flex",
              alignItems: "center",
              justifyContent: "flex-start",
              gap: 8,
              position: "relative",
              padding: "8px 10px",
              width: "100%",
              textAlign: "left",
            }}
          >
            <i className={`ti ${t.icon}`} style={{ fontSize: 16, flexShrink: 0 }} aria-hidden="true"></i>
            <span style={{ flex: 1 }}>{t.label}</span>
            {t.id === "destek" && unreadMessagesCount > 0 && (
              <span
                style={{
                  minWidth: 18, height: 18, borderRadius: 9,
                  background: "var(--text-danger)", color: "var(--on-accent)", fontSize: 11, fontWeight: 700,
                  display: "flex", alignItems: "center", justifyContent: "center", padding: "0 4px", flexShrink: 0,
                }}
              >
                {unreadMessagesCount}
              </span>
            )}
            {t.id === "mesajlar" && chatUnreadCount > 0 && (
              <span
                style={{
                  minWidth: 18, height: 18, borderRadius: 9,
                  background: "var(--text-danger)", color: "var(--on-accent)", fontSize: 11, fontWeight: 700,
                  display: "flex", alignItems: "center", justifyContent: "center", padding: "0 4px", flexShrink: 0,
                }}
              >
                {chatUnreadCount}
              </span>
            )}
          </button>
        ))}
      </nav>

      <div style={{ flex: 1, minWidth: 0 }}>

      {tab === "pano" && (
        <div>
          {!(activationChecklistDismissedClick || (activeTeamId && localStorage.getItem(`binerly_activation_checklist_dismissed_${activeTeamId}`)) || pendingInvites.some((inv) => !dismissedInviteIds.includes(inv.id))) && (() => {
            const steps = [
              // Şirket bilgileri/sektör adımları Ayarlar hub'ındaki ile aynı yetkiye
              // (canEditCompanySettings) tabi — aksi halde yetkisi olmayan bir takım
              // üyesi checklist üzerinden bu formlara ulaşıp değiştirebilirdi.
              ...(canEditCompanySettings ? [
                { label: "Şirket bilgilerinizi girin", done: !!companySettings?.companyName, onGo: () => setShowSettingsForm(true) },
                { label: "Sektörünüzü seçin", done: !!companySettings?.sector, onGo: () => setShowSectorFields(true) },
              ] : []),
              { label: "İlk müşterinizi ekleyin", done: customers.length > 0, onGo: () => { setTab("musteri"); setShowCustomerForm(true); } },
              { label: `İlk ${DEAL_WORD_FORMS[dealWordKind(companySettings?.sector)].possYoursAcc} oluşturun`, done: deals.length > 0, onGo: () => { if (customers.length > 0) { setTab("firsat"); setShowDealForm(true); } else { setTab("musteri"); setShowCustomerForm(true); } } },
            ];
            const doneCount = steps.filter((s) => s.done).length;
            const allDone = doneCount === steps.length;
            const dismiss = () => {
              if (activeTeamId) localStorage.setItem(`binerly_activation_checklist_dismissed_${activeTeamId}`, "1");
              setActivationChecklistDismissedClick(true);
            };
            return (
              <div style={{ background: "var(--surface-1)", borderRadius: "var(--radius)", padding: "1rem", marginBottom: "1.5rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: allDone ? 0 : 10 }}>
                  <p style={{ fontSize: 14, fontWeight: 500, margin: 0 }}>
                    {allDone ? "✅ Kurulum tamamlandı" : `Kuruluma başlayın (${doneCount}/${steps.length})`}
                  </p>
                  <button onClick={dismiss} style={{ fontSize: 12 }}>Gizle</button>
                </div>
                {!allDone && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {steps.map((s) => (
                      <div
                        key={s.label}
                        onClick={s.done ? undefined : s.onGo}
                        style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: s.done ? "default" : "pointer", padding: "2px 0" }}
                      >
                        <i className={`ti ${s.done ? "ti-circle-check-filled" : "ti-circle"}`} style={{ fontSize: 16, color: s.done ? "var(--text-success)" : "var(--text-muted)", flexShrink: 0 }} aria-hidden="true"></i>
                        <span style={{ color: s.done ? "var(--text-muted)" : "inherit", textDecoration: s.done ? "line-through" : "none" }}>{s.label}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })()}
          {pendingArrivalConfirmations.length > 0 && (
            <div style={{ background: "var(--surface-1)", borderRadius: "var(--radius)", padding: "1rem", marginBottom: "1.5rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <p style={{ fontSize: 14, fontWeight: 500, margin: 0 }}>Bugünün Randevuları ({pendingArrivalConfirmations.length})</p>
                {pendingArrivalConfirmations.length > 1 && (
                  <button
                    type="button"
                    onClick={() => pendingArrivalConfirmations.forEach(({ deal }) => attemptMoveDealStage(deal.id, "kazanildi"))}
                    style={{ fontSize: 12 }}
                  >
                    Hepsini Geldi işaretle
                  </button>
                )}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 260, overflowY: "auto" }}>
                {pendingArrivalConfirmations.map(({ deal, apptTime }) => {
                  const c = customerById(deal.customerId);
                  return (
                    <div key={`arrival-${deal.id}`} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, padding: "4px 0" }}>
                      <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--fill-warning)", flexShrink: 0 }} />
                      <span style={{ flex: 1, cursor: "pointer" }} onClick={() => { setTab("firsat"); setEditingDeal(deal); setShowDealForm(true); }}>
                        {apptTime.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })} - {c?.name || "Bilinmeyen müşteri"} ({deal.title})
                      </span>
                      <button type="button" onClick={() => attemptMoveDealStage(deal.id, "kazanildi")} style={{ fontSize: 12, flexShrink: 0 }}>
                        Geldi ✓
                      </button>
                      <button type="button" onClick={() => attemptMoveDealStage(deal.id, "kaybedildi")} style={{ fontSize: 12, flexShrink: 0 }}>
                        Gelmedi/İptal
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {(otelArrivalsToday.length > 0 || otelDeparturesToday.length > 0) && (
            <div style={{ background: "var(--surface-1)", borderRadius: "var(--radius)", padding: "1rem", marginBottom: "1.5rem" }}>
              <p style={{ fontSize: 14, fontWeight: 500, margin: "0 0 10px" }}>Bugünün Giriş/Çıkışları</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 260, overflowY: "auto" }}>
                {otelArrivalsToday.map((d) => (
                  <div
                    key={`arrival-${d.id}`}
                    onClick={() => { setTab("firsat"); setEditingDeal(d); setShowDealForm(true); }}
                    style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer", padding: "4px 0" }}
                  >
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--fill-accent)", flexShrink: 0 }} />
                    <span style={{ flex: 1 }}>{customerById(d.customerId)?.name || "Bilinmeyen müşteri"} - {d.customFields?.oda_tipi || d.title}</span>
                    <Badge tone="accent">Bugün giriş</Badge>
                  </div>
                ))}
                {otelDeparturesToday.map((d) => (
                  <div
                    key={`departure-${d.id}`}
                    onClick={() => { setTab("firsat"); setEditingDeal(d); setShowDealForm(true); }}
                    style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer", padding: "4px 0" }}
                  >
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--fill-warning)", flexShrink: 0 }} />
                    <span style={{ flex: 1 }}>{customerById(d.customerId)?.name || "Bilinmeyen müşteri"} - {d.customFields?.oda_tipi || d.title}</span>
                    <Badge tone="warning">Bugün çıkış</Badge>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div style={{ background: "var(--surface-1)", borderRadius: "var(--radius)", padding: "1rem", marginBottom: "1.5rem" }}>
            <p style={{ fontSize: 14, fontWeight: 500, margin: "0 0 10px" }}>Bugün ne yapmalıyım</p>
            {dueReminderDeals.length === 0 && urgentTickets.length === 0 && newPortalAppointments.length === 0 && orderRhythmAlerts.length === 0 && lowStockItems.length === 0 && membershipAlerts.length === 0 && churnAlerts.length === 0 && waitlistFillableAlerts.length === 0 && stuckDeals.length === 0 && freedAppointmentAlerts.length === 0 && unassignedUpcomingAppointments.length === 0 ? (
              <p style={{ fontSize: 13, color: "var(--text-muted)", margin: 0 }}>Bugün için acil bir şey yok.</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 260, overflowY: "auto" }}>
                {newPortalAppointments.map((d) => {
                  const c = customerById(d.customerId);
                  return (
                    <div
                      key={`portal-${d.id}`}
                      onClick={() => { setTab("firsat"); setEditingDeal(d); setShowDealForm(true); }}
                      style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer", padding: "4px 0" }}
                    >
                      <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--fill-accent)", flexShrink: 0 }} />
                      <span style={{ flex: 1 }}>{c?.name || "Bilinmeyen müşteri"} - {d.title}</span>
                      <Badge tone="accent">{d.customFields?.kaynak === "randevu_widget" ? "Web'den alındı" : "Portaldan alındı"}</Badge>
                    </div>
                  );
                })}
                {urgentTickets
                  .slice()
                  .sort((a, b) => (getSlaStatus(a).isBreached === getSlaStatus(b).isBreached ? 0 : getSlaStatus(a).isBreached ? -1 : 1))
                  .map((t) => {
                    const sla = getSlaStatus(t);
                    return (
                      <div
                        key={`ticket-${t.id}`}
                        onClick={() => { setTab("destek"); setInitialViewTicketId(t.id); }}
                        style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer", padding: "4px 0" }}
                      >
                        <span style={{ width: 8, height: 8, borderRadius: "50%", background: sla.isBreached ? "var(--text-danger)" : "var(--fill-warning)", flexShrink: 0 }} />
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
                      onClick={() => { setTab("firsat"); setEditingDeal(d); setShowDealForm(true); }}
                      style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer", padding: "4px 0" }}
                    >
                      <span style={{ width: 8, height: 8, borderRadius: "50%", background: overdue ? "var(--text-danger)" : "var(--fill-warning)", flexShrink: 0 }} />
                      <span style={{ flex: 1 }}>{c?.name || "Bilinmeyen müşteri"} - {d.reminder}</span>
                      <Badge tone={overdue ? "danger" : "warning"}>{overdue ? "Gecikti" : "Bugün"}</Badge>
                    </div>
                  );
                })}
                {orderRhythmAlerts.map(({ customer, typicalInterval, daysSinceLast, orderCount }) => (
                  <div
                    key={`rhythm-${customer.id}`}
                    title={`Geçmiş ${orderCount} siparişine göre tipik olarak ${typicalInterval} günde bir sipariş veriyor`}
                    style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, padding: "4px 0" }}
                  >
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--fill-warning)", flexShrink: 0 }} />
                    <span style={{ flex: 1, cursor: "pointer" }} onClick={() => setViewingCustomer(customer)}>{customer.name} - genelde {typicalInterval} günde bir sipariş verirdi, {daysSinceLast} gündür yok</span>
                    {customer.phone && (
                      <button
                        type="button"
                        onClick={() => {
                          const message = buildOrderCheckInMessage(customer, typicalInterval, daysSinceLast, companySettings);
                          window.open(`https://wa.me/${toWhatsAppNumber(customer.phone)}?text=${encodeURIComponent(message)}`, "_blank", "noopener,noreferrer");
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
                    onClick={() => setTab("stokmalzeme")}
                    style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer", padding: "4px 0" }}
                  >
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--text-danger)", flexShrink: 0 }} />
                    <span style={{ flex: 1 }}>{item.name} - {item.quantityOnHand} {item.unit} kaldı (kritik seviye {item.reorderThreshold} {item.unit})</span>
                    <Badge tone="danger">Stok azaldı</Badge>
                  </div>
                ))}
                {membershipAlerts.map((alert) => (
                  <div
                    key={`membership-${alert.deal.id}-${alert.type}`}
                    style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, padding: "4px 0" }}
                  >
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--fill-warning)", flexShrink: 0 }} />
                    <span style={{ flex: 1, cursor: "pointer" }} onClick={() => { setEditingDeal(alert.deal); setShowDealForm(true); }}>
                      {alert.customer.name} - {alert.type === "session" ? `${alert.remaining} seans kaldı` : alert.daysLeft < 0 ? "üyelik süresi doldu" : `üyelik ${alert.daysLeft} gün sonra bitiyor`}
                    </span>
                    {alert.customer.phone && (
                      <button
                        type="button"
                        onClick={async () => {
                          const link = await generateApprovalLink(alert.deal);
                          const message = buildRenewalMessage(alert.deal, alert.customer, alert, companySettings, link);
                          window.open(`https://wa.me/${toWhatsAppNumber(alert.customer.phone)}?text=${encodeURIComponent(message)}`, "_blank", "noopener,noreferrer");
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
                    style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, padding: "4px 0" }}
                  >
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--text-danger)", flexShrink: 0 }} />
                    <span style={{ flex: 1, cursor: "pointer" }} onClick={() => setViewingCustomer(alert.customer)}>
                      {alert.customer.name} - {alert.daysSince} gündür derse gelmedi
                    </span>
                    {alert.customer.phone && (
                      <button
                        type="button"
                        onClick={() => {
                          const message = buildWinBackMessage(alert.customer, alert.daysSince, companySettings);
                          window.open(`https://wa.me/${toWhatsAppNumber(alert.customer.phone)}?text=${encodeURIComponent(message)}`, "_blank", "noopener,noreferrer");
                        }}
                        style={{ fontSize: 12, flexShrink: 0 }}
                      >
                        WhatsApp
                      </button>
                    )}
                    <Badge tone="danger">Seni özledik</Badge>
                  </div>
                ))}
                {waitlistFillableAlerts.map(({ group, waitCount }) => (
                  <div
                    key={`waitlist-${group.id}`}
                    style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, padding: "4px 0" }}
                  >
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--fill-accent)", flexShrink: 0 }} />
                    <span style={{ flex: 1 }}>{group.name} dersinde yer açıldı - yedek listede {waitCount} kişi var</span>
                    <button type="button" onClick={() => promoteFromWaitlistIfAny(group.id)} style={{ fontSize: 12, flexShrink: 0 }}>
                      Doldur
                    </button>
                  </div>
                ))}
                {stuckDeals.map(({ deal, daysOpen }) => (
                  <div
                    key={`stuck-${deal.id}`}
                    onClick={() => { setTab("firsat"); setEditingDeal(deal); setShowDealForm(true); }}
                    style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer", padding: "4px 0" }}
                  >
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--fill-warning)", flexShrink: 0 }} />
                    <span style={{ flex: 1 }}>
                      {customerById(deal.customerId)?.name || "Bilinmeyen müşteri"} - {stageLabel(deal.stage, undefined, companySettings?.sector)} aşamasında {daysOpen} gündür bekliyor
                    </span>
                    <Badge tone="warning">Takip gerekiyor</Badge>
                  </div>
                ))}
                {freedAppointmentAlerts.map(({ deal, apptTime }) => (
                  <div
                    key={`freed-${deal.id}`}
                    onClick={() => setTab("musteri")}
                    style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer", padding: "4px 0" }}
                  >
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--fill-accent)", flexShrink: 0 }} />
                    <span style={{ flex: 1 }}>
                      {apptTime.toLocaleDateString("tr-TR", { day: "numeric", month: "short" })} {apptTime.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })} - {customerById(deal.customerId)?.name || "Bilinmeyen müşteri"} ({deal.lostReason?.toLocaleLowerCase("tr")}) randevusu boşaldı
                    </span>
                    <Badge tone="accent">Doldurulabilir</Badge>
                  </div>
                ))}
                {unassignedUpcomingAppointments.map(({ deal, apptTime }) => (
                  <div
                    key={`unassigned-${deal.id}`}
                    onClick={() => { setTab("firsat"); setEditingDeal(deal); setShowDealForm(true); }}
                    style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer", padding: "4px 0" }}
                  >
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--fill-warning)", flexShrink: 0 }} />
                    <span style={{ flex: 1 }}>
                      {apptTime.toLocaleDateString("tr-TR", { day: "numeric", month: "short" })} {apptTime.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })} - {customerById(deal.customerId)?.name || "Bilinmeyen müşteri"} için Sorumlu atanmamış
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
                    lowStockItems.map((item) => [item.name, item.quantityOnHand, item.unit, item.reorderThreshold, item.supplierName || ""])
                  )
                }
                style={{ fontSize: 12, marginTop: 8, display: "flex", alignItems: "center", gap: 4 }}
              >
                <i className="ti ti-download" style={{ fontSize: 14 }} aria-hidden="true"></i>
                Sipariş listesini indir ({lowStockItems.length})
              </button>
            )}
          </div>

          <div style={{ display: "flex", gap: 4, background: "var(--surface-1)", borderRadius: "var(--radius)", padding: 3, marginBottom: "1.5rem", flexWrap: "wrap" }}>
            {PANO_RANGES.map((r) => (
              <button
                key={r.id}
                onClick={() => setPanoRange(r.id)}
                style={{ border: "none", background: panoRange === r.id ? "var(--fill-accent)" : "transparent", color: panoRange === r.id ? "var(--on-accent)" : "var(--text-secondary)", fontWeight: panoRange === r.id ? 600 : 400, fontSize: 13 }}
              >
                {r.label}
              </button>
            ))}
          </div>

          <p style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase", margin: "0 0 8px" }}>Şu an</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px,1fr))", gap: 12, marginBottom: "1.5rem" }}>
            <MetricCard
              label={dealWords.openFilterLabel}
              value={openDeals.length}
              onClick={openDeals.length > 0 ? () => openDealOrList(openDeals, dealWords.openFilterLabel) : undefined}
            />
            <MetricCard
              label={dealWords.openValueLabel}
              value={formatTL(totalOpenValue)}
              onClick={openDeals.length > 0 ? () => openDealOrList(openDeals, dealWords.openFilterLabel) : undefined}
            />
            <MetricCard
              label={<span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>Beklenen Gelir <InfoTip text={
                `${dealWords.openGenPluralPhrase} tutarı, aşamalarına göre kapanma olasılığıyla çarpılıp toplanır:\n` +
                Object.entries(STAGE_PROBABILITY).map(([id, p]) => `${stageLabel(id, "kurumsal", companySettings?.sector)} → %${Math.round(p * 100)}`).join("\n") +
                "\n\nGerçek bir tahsilat garantisi değil, kaba bir tahmindir."
              } /></span>}
              value={formatTL(expectedRevenue)}
              sub="Aşama olasılığına göre tahmini"
            />
            {nextMonthForecast !== null && (
              <MetricCard
                label={<span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>Gelecek ay tahmini <InfoTip text="Son 3 tam ayda (içinde bulunulan ay hariç) kazanılan ortalama aylık gelir. Beklenen Gelir'den farklı olarak açık pipeline'a değil, geçmiş performansa dayanır." /></span>}
                value={formatTL(nextMonthForecast)}
                sub="Son 3 ayın ortalaması"
              />
            )}
            {passiveCustomerRate !== null && (
              <MetricCard
                label={<span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>Pasif müşteri oranı <InfoTip text={`En az bir kez satın almış ama son ${PASSIVE_CUSTOMER_DAYS} gündür hiç yeni işlemi/randevusu olmayan ve şu an açık bir kaydı da bulunmayan müşteri oranı. Gerçek bir abonelik iptali takibi değildir, kaba bir "uzun süredir işlem yapmadı" göstergesidir.`} /></span>}
                value={`%${passiveCustomerRate}`}
                tone={passiveCustomerRate > 30 ? "danger" : undefined}
              />
            )}
            <MetricCard
              label="Bekleyen alacak"
              value={formatTL(totalOutstanding)}
              onClick={dealsWithOutstanding.length > 0 ? () => openDealOrList(dealsWithOutstanding, `Bekleyen alacağı olan ${DEAL_WORD_FORMS[dealKind].plural}`) : undefined}
            />
            {supportsGroupClasses(companySettings?.sector) && (
              <MetricCard
                label={<span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>{groupClassWords(companySettings?.sector).panoMetricLabel} <InfoTip text={groupClassWords(companySettings?.sector).panoMetricInfoTip} /></span>}
                value={activeMemberships.length}
                tone="success"
                onClick={activeMemberships.length > 0 ? () => openDealOrList(activeMemberships, groupClassWords(companySettings?.sector).panoMetricLabel) : undefined}
              />
            )}
            <MetricCard
              label="Hatırlatması olan"
              value={dealsWithReminder.length}
              tone="warning"
              onClick={dealsWithReminder.length > 0 ? () => openDealOrList(dealsWithReminder, `Hatırlatması olan ${DEAL_WORD_FORMS[dealKind].plural}`) : undefined}
            />
            <MetricCard
              label={<span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>Açık destek talepleri <InfoTip text="Durumu Çözüldü veya Kapatıldı olmayan destek talepleri." /></span>}
              value={openTicketsCount}
              onClick={openTicketsCount > 0 ? () => openTicketOrList(tickets.filter((t) => !TERMINAL_STATUSES.includes(t.status)), "Açık destek talepleri") : undefined}
            />
            <MetricCard
              label={<span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>SLA aşılan talepler <InfoTip text="Hedef çözüm süresi geçmiş ama hâlâ açık olan destek talepleri." /></span>}
              value={breachedTicketsCount}
              tone="danger"
              onClick={breachedTicketsCount > 0 ? () => openTicketOrList(breachedTickets, "SLA aşılan talepler") : undefined}
            />
            <MetricCard
              label={<span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>Okunmamış mesaj <InfoTip text="Müşterinin (portal veya destek talebi üzerinden) yeni mesaj gönderdiği, henüz açıp görüntülemediğiniz talepler." /></span>}
              value={unreadMessagesCount}
              tone={unreadMessagesCount > 0 ? "danger" : undefined}
              onClick={unreadMessagesCount > 0 ? () => openTicketOrList(ticketsWithUnread, "Okunmamış mesajı olan talepler") : undefined}
            />
          </div>

          <p style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase", margin: "0 0 8px" }}>{rangeLabel}</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px,1fr))", gap: 12, marginBottom: "1.5rem" }}>
            <MetricCard
              label="Kazanılan"
              value={wonDeals.length}
              tone="success"
              onClick={wonDeals.length > 0 ? () => openDealOrList(wonDeals, `Kazanılan ${DEAL_WORD_FORMS[dealKind].plural}`) : undefined}
            />
            <MetricCard
              label="Toplam gelir"
              value={formatTL(rangeRevenue)}
              onClick={wonDeals.length > 0 ? () => openDealOrList(wonDeals, `Kazanılan ${DEAL_WORD_FORMS[dealKind].plural}`) : undefined}
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
              <MetricCard label="Gelmeme oranı" value={`%${noShowRate}`} tone={noShowRate > 20 ? "danger" : undefined} />
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
              <p style={{ fontSize: 14, fontWeight: 500, margin: "0 0 8px", display: "flex", alignItems: "center", gap: 4 }}>
                Personel Performansı
                <InfoTip text={`Seçili tarih aralığında (yukarıdaki ${rangeLabel}) kapanan (kazanılan + kaybedilen) ${DEAL_WORD_FORMS[dealKind].genPlural}, her ${DEAL_WORD_FORMS[dealKind].loc} seçtiğiniz "Sorumlu" kişiye göre dağılımı ve kazanma oranı. ${dealWords.columnHeader} formunda sorumlu atamazsanız "Atanmamış" altında görünür.`} />
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
                      const parts = itemsForDeal.length > 0
                        ? itemsForDeal.map((li) => ({
                            amount: (Number(li.quantity) || 1) * (Number(li.unitPrice) || 0),
                            commissionPercent: li.priceItemId ? priceListItems.find((p) => p.id === li.priceItemId)?.commissionPercent ?? null : null,
                          }))
                        : Array.isArray(d.customFields?.service_ids) && d.customFields.service_ids.length > 0
                          ? d.customFields.service_ids.map((id) => {
                              const item = priceListItems.find((p) => p.id === id);
                              return { amount: Number(item?.price) || 0, commissionPercent: item?.commissionPercent ?? null };
                            })
                          : [{ amount: Number(d.value) || 0, commissionPercent: null }];
                      stats.commissionParts.push(...parts);
                    }
                    else stats.lost += 1;
                    return acc;
                  }, {})
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
                    const usesServiceRate = stats.commissionParts.some((p) => p.commissionPercent != null);
                    const hasCommission = member?.commissionPercent != null || member?.chairRentalFee != null || usesServiceRate;
                    const payout = hasCommission
                      ? stats.commissionParts.reduce((sum, p) => sum + p.amount * ((p.commissionPercent != null ? p.commissionPercent : (member?.commissionPercent || 0)) / 100), 0) - (member?.chairRentalFee || 0)
                      : null;
                    return (
                      <div key={assigneeId} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "var(--surface-1)", borderRadius: "var(--radius)", padding: "8px 12px" }}>
                        <span style={{ fontSize: 13 }}>{label}</span>
                        <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>
                          {stats.won} {DEAL_WORD_FORMS[dealKind].bare} · <strong style={{ color: "var(--text-primary)" }}>{formatTL(stats.revenue)}</strong>
                          {rate !== null && <> · <span style={{ color: "var(--text-success)" }}>%{rate} kazanma oranı</span></>}
                          {payout !== null && (
                            <> · <span style={{ color: "var(--text-accent)" }} title={`${usesServiceRate ? "Bazı hizmetlerde kendi prim oranı uygulandı, diğerlerinde " : ""}genel oran %${member?.commissionPercent || 0}${member?.chairRentalFee ? ` − ${formatTL(member.chairRentalFee)} koltuk kirası` : ""}`}>Hakediş: {formatTL(payout)}</span></>
                          )}
                        </span>
                      </div>
                    );
                  })}
              </div>
            </div>
          )}

          {customers.length === 0 && deals.length === 0 ? (
            <div style={{ background: "var(--surface-1)", borderRadius: 12, padding: "2rem 1.5rem", textAlign: "center" }}>
              <p style={{ fontWeight: 500, margin: "0 0 4px" }}>Henüz veri yok</p>
              <p style={{ fontSize: 14, color: "var(--text-secondary)", margin: "0 0 16px" }}>
                Başlamak için önce bir müşteri ekleyin, sonra ona bir {DEAL_WORD_FORMS[dealWordKind(companySettings?.sector)].bare} tanımlayın.
              </p>
              <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
                <button onClick={() => { setTab("musteri"); setShowCustomerForm(true); }} style={{ background: "var(--fill-accent)", color: "var(--on-accent)", border: "none" }}>
                  Müşteri ekle
                </button>
                <button onClick={seedDemoData} style={{ background: "var(--surface-1)", border: "0.5px solid var(--border)" }}>
                  Örnek verilerle başla
                </button>
              </div>
            </div>
          ) : (
            <div>
              <p style={{ fontSize: 14, fontWeight: 500, margin: "0 0 8px" }}>{dealWordKind(companySettings?.sector) === "uyelik" ? "Üyelik aşamaları" : dealWordKind(companySettings?.sector) === "randevu" ? "Randevu aşamaları" : dealWordKind(companySettings?.sector) === "rezervasyon" ? "Rezervasyon aşamaları" : "Teklif aşamaları"}</p>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px,1fr))", gap: 8 }}>
                {STAGES.filter((s) => s.id !== "kaybedildi").map((stage) => {
                  const stageDeals = deals.filter((d) => d.stage === stage.id);
                  const tone = stageTone(stage.id);
                  return (
                    <div key={stage.id}>
                      <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 6, display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ width: 8, height: 8, borderRadius: "50%", background: TONE_COLORS[tone].color, flexShrink: 0 }} />
                        {stageLabel(stage.id, undefined, companySettings?.sector)} · {stageDeals.length}
                      </div>
                      {stageDeals.length === 0 && <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Boş</div>}
                      {stageDeals.map((d) => {
                        const c = customerById(d.customerId);
                        return (
                          <div
                            key={d.id}
                            style={{
                              background: tone === "default" ? "var(--surface-1)" : TONE_COLORS[tone].background,
                              border: tone === "default" ? "0.5px solid var(--border)" : "none",
                              borderRadius: "var(--radius)",
                              padding: 8,
                              marginBottom: 6,
                              fontSize: 13,
                              color: tone === "default" ? "var(--text-primary)" : TONE_COLORS[tone].color,
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
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px,1fr))", gap: 12, marginTop: "1.5rem" }}>
              <div style={{ background: "var(--surface-1)", borderRadius: "var(--radius)", padding: "1rem" }}>
                <p style={{ fontSize: 14, fontWeight: 500, margin: "0 0 8px" }}>Gelir ve kâr</p>
                <div style={{ display: "flex", gap: 12, marginBottom: 12 }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--text-secondary)" }}>
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--fill-accent)", display: "inline-block" }} />
                    Gelir
                  </span>
                  <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--text-secondary)" }}>
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--fill-success)", display: "inline-block" }} />
                    Kâr
                  </span>
                </div>
                <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height: 130, overflowX: "auto" }}>
                  {revenueProfitByBucket.map((m) => (
                    <div key={m.label} style={{ flex: "1 0 28px", display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                      <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 90 }}>
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                          <span style={{ fontSize: 9, color: "var(--text-secondary)", whiteSpace: "nowrap" }}>{formatTL(m.revenue)}</span>
                          <div
                            title={formatTL(m.revenue)}
                            style={{ width: 10, height: Math.max(4, (m.revenue / maxBucketValue) * 80), background: "var(--fill-accent)", borderRadius: 3 }}
                          />
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                          <span style={{ fontSize: 9, color: m.profit < 0 ? "var(--text-danger)" : "var(--text-secondary)", whiteSpace: "nowrap" }}>
                            {m.profit < 0 ? `-${formatTL(Math.abs(m.profit))}` : formatTL(m.profit)}
                          </span>
                          <div
                            title={formatTL(m.profit)}
                            style={{ width: 10, height: Math.max(4, (Math.abs(m.profit) / maxBucketValue) * 80), background: "var(--fill-success)", borderRadius: 3 }}
                          />
                        </div>
                      </div>
                      <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>{m.label}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ background: "var(--surface-1)", borderRadius: "var(--radius)", padding: "1rem" }}>
                <p style={{ fontSize: 14, fontWeight: 500, margin: "0 0 12px" }}>Kazanma oranı</p>
                {winRate === null ? (
                  <p style={{ fontSize: 13, color: "var(--text-muted)" }}>Henüz kapanmış {DEAL_WORD_FORMS[dealKind].bare} yok.</p>
                ) : (
                  <div>
                    <p style={{ fontSize: 28, fontWeight: 600, margin: "0 0 4px", color: "var(--text-success)" }}>%{winRate}</p>
                    <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: 0 }}>
                      {wonDeals.length} kazanıldı · {lostDeals.length} kaybedildi
                    </p>
                  </div>
                )}
                {lostReasonCounts.length > 0 && (
                  <div style={{ marginTop: 14 }}>
                    <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: "0 0 6px" }}>Kayıp nedenleri</p>
                    {lostReasonCounts.map((r) => {
                      const maxCount = Math.max(...lostReasonCounts.map((x) => x.count));
                      return (
                        <div key={r.reason} style={{ marginBottom: 6 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 2 }}>
                            <span>{r.reason}</span>
                            <span style={{ color: "var(--text-secondary)" }}>{r.count}</span>
                          </div>
                          <div style={{ height: 6, borderRadius: 3, background: "var(--surface-2)" }}>
                            <div title={`${r.reason}: ${r.count}`} style={{ height: "100%", width: `${Math.max(6, (r.count / maxCount) * 100)}%`, borderRadius: 3, background: "var(--text-danger)" }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div style={{ background: "var(--surface-1)", borderRadius: "var(--radius)", padding: "1rem" }}>
                <p style={{ fontSize: 14, fontWeight: 500, margin: "0 0 4px", display: "flex", alignItems: "center", gap: 4 }}>
                  Aşama Hunisi
                  <InfoTip text={`Şu an açık olan (kapanmamış) ${DEAL_WORD_FORMS[dealKind].plural}, aşamalarına göre dağılımı - hangi aşamada ne kadar kayıt birikmiş, "tıkanma" olan yeri gösterir.`} />
                </p>
                {openDeals.length === 0 ? (
                  <p style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 10 }}>Şu an açık {DEAL_WORD_FORMS[dealKind].plural} yok.</p>
                ) : (
                  <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
                    {STAGES.filter((s) => s.id !== "kazanildi" && s.id !== "kaybedildi").map((s) => {
                      const count = openDeals.filter((d) => d.stage === s.id).length;
                      const maxStageCount = Math.max(1, ...STAGES.filter((x) => x.id !== "kazanildi" && x.id !== "kaybedildi").map((x) => openDeals.filter((d) => d.stage === x.id).length));
                      const tone = stageTone(s.id);
                      const barColor = tone === "default" ? "var(--text-muted)" : TONE_COLORS[tone].color;
                      return (
                        <div key={s.id}>
                          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 2 }}>
                            <span>{stageLabel(s.id, "kurumsal", companySettings?.sector)}</span>
                            <span style={{ color: "var(--text-secondary)" }}>{count}</span>
                          </div>
                          <div style={{ height: 8, borderRadius: 4, background: "var(--surface-2)" }}>
                            <div title={`${count}`} style={{ height: "100%", width: `${count > 0 ? Math.max(6, (count / maxStageCount) * 100) : 0}%`, borderRadius: 4, background: barColor }} />
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
      )}

      {tab === "musteri" && (
        <div>
          <div className="list-toolbar" style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12, gap: 8, flexWrap: "wrap" }}>
            <button
              onClick={() => setShowCustomerExport(true)}
              disabled={filteredCustomers.length === 0}
              style={{ background: "var(--surface-1)", border: "0.5px solid var(--border)", display: "flex", alignItems: "center", gap: 6 }}
            >
              <i className="ti ti-download" style={{ fontSize: 16 }} aria-hidden="true"></i>
              Dışa aktar
            </button>
            <button
              onClick={() => setShowImportCustomers(true)}
              style={{ background: "var(--surface-1)", border: "0.5px solid var(--border)", display: "flex", alignItems: "center", gap: 6 }}
            >
              <i className="ti ti-upload" style={{ fontSize: 16 }} aria-hidden="true"></i>
              İçe aktar
            </button>
            <button
              onClick={() => setShowCampaignModal(true)}
              disabled={customers.filter((c) => c.email).length === 0}
              style={{ background: "var(--surface-1)", border: "0.5px solid var(--border)", display: "flex", alignItems: "center", gap: 6 }}
            >
              <i className="ti ti-mail-forward" style={{ fontSize: 16 }} aria-hidden="true"></i>
              Kampanya gönder
            </button>
            <button
              onClick={async () => {
                const link = await generateLeadCaptureLink();
                if (link) setLeadCaptureLink(link);
              }}
              style={{ background: "var(--surface-1)", border: "0.5px solid var(--border)", display: "flex", alignItems: "center", gap: 6 }}
            >
              <i className="ti ti-qrcode" style={{ fontSize: 16 }} aria-hidden="true"></i>
              Müşteri Kazanma Linki
            </button>
            <button
              onClick={() => setShowPortalLinkModal(true)}
              style={{ background: "var(--surface-1)", border: "0.5px solid var(--border)", display: "flex", alignItems: "center", gap: 6 }}
            >
              <i className="ti ti-users-group" style={{ fontSize: 16 }} aria-hidden="true"></i>
              Müşteri Portalı Linki
            </button>
            <button
              onClick={() => { setEditingCustomer(null); setShowCustomerForm(true); }}
              style={{ background: "var(--fill-accent)", color: "var(--on-accent)", border: "none", display: "flex", alignItems: "center", gap: 6 }}
            >
              <i className="ti ti-plus" style={{ fontSize: 16 }} aria-hidden="true"></i>
              Müşteri ekle
            </button>
          </div>

          <div className="list-toolbar" style={{ display: "flex", marginBottom: 12, gap: 8, flexWrap: "wrap" }}>
            <input
              value={customerSearch}
              onChange={(e) => setCustomerSearch(e.target.value)}
              placeholder="Müşteri ara (ad, sektör, bölge, telefon, e-posta)..."
              style={{ flex: 1, minWidth: 200 }}
            />
            <select value={customerTypeFilter} onChange={(e) => setCustomerTypeFilter(e.target.value)} style={{ fontSize: 13 }}>
              <option value="all">Tüm müşteriler</option>
              <option value="kurumsal">Kurumsal</option>
              <option value="bireysel">Bireysel</option>
            </select>
            <select value={customerSectorFilter} onChange={(e) => setCustomerSectorFilter(e.target.value)} style={{ fontSize: 13 }}>
              <option value="all">Tüm sektörler</option>
              {SECTORS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <select value={customerConsentFilter} onChange={(e) => setCustomerConsentFilter(e.target.value)} style={{ fontSize: 13 }}>
              <option value="all">Pazarlama izni: hepsi</option>
              <option value="verildi">İzin verildi</option>
              <option value="verilmedi">İzin verilmedi</option>
            </select>
            <select value={customerSort} onChange={(e) => setCustomerSort(e.target.value)} style={{ fontSize: 13 }}>
              <option value="newest">En yeni müşteri</option>
              <option value="oldest">En eski müşteri</option>
            </select>
            <DateRangeFilter
              from={customerFromDate}
              to={customerToDate}
              onFromChange={setCustomerFromDate}
              onToChange={setCustomerToDate}
            />
          </div>

          {filteredCustomers.length === 0 ? (
            customers.length === 0 ? (
              <div style={{ background: "var(--surface-1)", borderRadius: 12, padding: "2rem 1.5rem", textAlign: "center" }}>
                <p style={{ fontWeight: 500, margin: "0 0 4px" }}>Henüz müşteri eklenmedi</p>
                <p style={{ fontSize: 14, color: "var(--text-secondary)", margin: "0 0 16px" }}>Başlamak için ilk müşterinizi ekleyin.</p>
                <button onClick={() => { setEditingCustomer(null); setShowCustomerForm(true); }} style={{ background: "var(--fill-accent)", color: "var(--on-accent)", border: "none" }}>
                  + Müşteri ekle
                </button>
              </div>
            ) : (
              <p style={{ fontSize: 14, color: "var(--text-secondary)" }}>Aramayla eşleşen müşteri yok.</p>
            )
          ) : (
            <div style={{ overflowX: "auto" }}>
            <table className="responsive-table" style={{ width: "100%", minWidth: 640, borderCollapse: "separate", borderSpacing: "0 8px" }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left", padding: "0 12px", fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.3 }}>Müşteri</th>
                  <th style={{ textAlign: "left", padding: "0 12px", fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.3, whiteSpace: "nowrap" }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>İlgi durumu <InfoTip text={LEAD_INFO_TEXT} /></span>
                  </th>
                  <th style={{ textAlign: "left", padding: "0 12px", fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.3, whiteSpace: "nowrap" }}>Son temas</th>
                  <th style={{ textAlign: "left", padding: "0 12px", fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.3, whiteSpace: "nowrap" }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>Portal <InfoTip text={PORTAL_INFO_TEXT} /></span>
                  </th>
                  <th style={{ textAlign: "left", padding: "0 12px", fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.3, whiteSpace: "nowrap" }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>İzin <InfoTip text={MARKETING_CONSENT_INFO_TEXT} /></span>
                  </th>
                  <th style={{ textAlign: "left", padding: "0 12px", fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.3, whiteSpace: "nowrap" }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>Bakiye <InfoTip text={cariBakiyeInfoText(companySettings?.sector)} /></span>
                  </th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filteredCustomers.map((c) => {
                  const customerBalance = wonDealsAll
                    .filter((d) => d.customerId === c.id)
                    .reduce((sum, d) => sum + (d.value || 0) - totalPaidForDeal(d.id), 0);
                  return (
                  <tr key={c.id} style={{ background: "var(--surface-1)" }}>
                    <td data-label="Müşteri" onClick={() => setViewingCustomer(c)} style={{ padding: "10px 12px", borderRadius: "var(--radius) 0 0 var(--radius)", cursor: "pointer" }}>
                      <p style={{ margin: 0, fontWeight: 500, fontSize: 14 }}>{c.name}</p>
                      <p style={{ margin: 0, fontSize: 12, color: "var(--text-secondary)" }}>
                        {c.sector} {c.region ? `· ${c.region}` : ""} {c.phone ? `· ${c.phone}` : ""}
                      </p>
                      {c.tags?.length > 0 && (
                        <div style={{ marginTop: 4 }}>
                          <TagBadges tags={c.tags} />
                        </div>
                      )}
                    </td>
                    <td data-label="İlgi durumu" style={{ padding: "10px 12px", whiteSpace: "nowrap" }}>
                      <Badge tone={leadScore(c.lastContact).tone}>{leadScore(c.lastContact).label}</Badge>
                    </td>
                    <td data-label="Son temas" style={{ padding: "10px 12px", whiteSpace: "nowrap" }}>
                      <Badge tone={daysAgo(c.lastContact) === "Bugün" ? "success" : "default"}>
                        {daysAgo(c.lastContact) || "Temas yok"}
                      </Badge>
                    </td>
                    <td data-label="Portal" style={{ padding: "10px 12px", whiteSpace: "nowrap" }}>
                      {c.portalUserId ? (
                        <Badge tone="accent">Var</Badge>
                      ) : (
                        <button
                          type="button"
                          title="Müşteriye portal linkini paylaş"
                          onClick={() => {
                            const message = `Merhaba, ${companySettings?.companyName || "işletmemiz"} Müşteri Portalımızdan taleplerinizi/randevularınızı bu kayıtlı e-postanızla takip edebilirsiniz: ${getPortalUrl()}`;
                            if (c.phone) {
                              window.open(`https://wa.me/${toWhatsAppNumber(c.phone)}?text=${encodeURIComponent(message)}`, "_blank", "noopener,noreferrer");
                            } else {
                              navigator.clipboard.writeText(getPortalUrl());
                              notify("Portal linki kopyalandı.", "success");
                            }
                          }}
                          style={{ fontSize: 12, color: "var(--accent)", background: "none", border: "none", cursor: "pointer", padding: 0, textDecoration: "underline" }}
                        >
                          Linki paylaş
                        </button>
                      )}
                    </td>
                    <td data-label="İzin" style={{ padding: "10px 12px", whiteSpace: "nowrap" }}>
                      {c.marketingConsent ? (
                        <Badge tone="success">Var</Badge>
                      ) : (
                        <button
                          type="button"
                          title={c.email ? "İzin e-postası gönder" : "İzin linkini WhatsApp/kopyala ile paylaş"}
                          onClick={() => requestCustomerConsent(c)}
                          style={{ fontSize: 12, color: "var(--accent)", background: "none", border: "none", cursor: "pointer", padding: 0, textDecoration: "underline" }}
                        >
                          {c.email ? "İzin iste" : "İzin linki paylaş"}
                        </button>
                      )}
                    </td>
                    <td data-label="Bakiye" style={{ padding: "10px 12px", whiteSpace: "nowrap" }}>
                      {customerBalance > 0 ? <Badge tone="warning">{formatTL(customerBalance)}</Badge> : <span style={{ fontSize: 12, color: "var(--text-muted)" }}>-</span>}
                    </td>
                    <td style={{ padding: "10px 12px", borderRadius: "0 var(--radius) var(--radius) 0" }}>
                      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                        {c.phone && (
                          <a
                            href={`https://wa.me/${toWhatsAppNumber(c.phone)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            title="WhatsApp'tan yaz"
                            style={{ width: 32, height: 32, padding: 0, display: "flex", alignItems: "center", justifyContent: "center", border: "0.5px solid var(--border)", borderRadius: "var(--radius)", background: "var(--surface-1)", textDecoration: "none" }}
                          >
                            <WhatsAppIcon />
                          </a>
                        )}
                        <IconButton icon="ti-history" title="Detay ve iletişim geçmişi" onClick={() => setViewingCustomer(c)} />
                        <IconButton icon="ti-edit" title="Düzenle" onClick={() => { setEditingCustomer(c); setShowCustomerForm(true); }} />
                        <IconButton icon="ti-trash" title="Sil" onClick={() => setConfirmDeleteCustomer(c)} />
                      </div>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
          )}
        </div>
      )}

      {tab === "firsat" && (
        <div>
          <div className="list-toolbar" style={{ display: "flex", gap: 16, marginBottom: 12, flexWrap: "wrap" }}>
            <div style={{ display: "flex", gap: 4, background: "var(--surface-1)", borderRadius: "var(--radius)", padding: 3, width: "fit-content" }}>
              <button
                onClick={() => { setDealAudience("kurumsal"); updatePreferredCustomerType("kurumsal"); }}
                style={{ border: "none", background: dealAudience === "kurumsal" ? "var(--fill-accent)" : "transparent", color: dealAudience === "kurumsal" ? "var(--on-accent)" : "var(--text-secondary)", fontWeight: dealAudience === "kurumsal" ? 600 : 400, display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}
              >
                <i className="ti ti-building" style={{ fontSize: 15 }} aria-hidden="true"></i>
                Kurumsal
              </button>
              <button
                onClick={() => { setDealAudience("bireysel"); updatePreferredCustomerType("bireysel"); }}
                style={{ border: "none", background: dealAudience === "bireysel" ? "var(--fill-accent)" : "transparent", color: dealAudience === "bireysel" ? "var(--on-accent)" : "var(--text-secondary)", fontWeight: dealAudience === "bireysel" ? 600 : 400, display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}
              >
                <i className="ti ti-user" style={{ fontSize: 15 }} aria-hidden="true"></i>
                Bireysel
              </button>
            </div>
            <div style={{ display: "flex", gap: 4, background: "var(--surface-1)", borderRadius: "var(--radius)", padding: 3, width: "fit-content" }}>
              <button
                onClick={() => changeDealView("list")}
                style={{ border: "none", background: dealView === "list" ? "var(--fill-accent)" : "transparent", color: dealView === "list" ? "var(--on-accent)" : "var(--text-secondary)", fontWeight: dealView === "list" ? 600 : 400, display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}
              >
                <i className="ti ti-list" style={{ fontSize: 15 }} aria-hidden="true"></i>
                Liste
              </button>
              <button
                onClick={() => changeDealView("kanban")}
                style={{ border: "none", background: dealView === "kanban" ? "var(--fill-accent)" : "transparent", color: dealView === "kanban" ? "var(--on-accent)" : "var(--text-secondary)", fontWeight: dealView === "kanban" ? 600 : 400, display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}
              >
                <i className="ti ti-layout-kanban" style={{ fontSize: 15 }} aria-hidden="true"></i>
                Kanban
              </button>
            </div>
          </div>

          {isMembershipSector ? (
            <div className="list-toolbar" style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap", alignItems: "center" }}>
              <button
                onClick={() => setDealTodayClassFilter((v) => !v)}
                style={{ background: dealTodayClassFilter ? "var(--fill-accent)" : "var(--surface-1)", color: dealTodayClassFilter ? "var(--on-accent)" : "var(--text-primary)", border: "0.5px solid var(--border)", fontSize: 13 }}
              >
                Bugün dersi olanlar
              </button>
              <select value={dealMembershipExpiryFilter} onChange={(e) => setDealMembershipExpiryFilter(e.target.value)} style={{ fontSize: 13 }}>
                <option value="all">Üyelik bitişi: Tümü</option>
                <option value="1m">1 ay içinde bitecek</option>
                <option value="3m">3 ay içinde bitecek</option>
                <option value="6m">6 ay içinde bitecek</option>
              </select>
            </div>
          ) : (
            <div className="list-toolbar" style={{ display: "flex", gap: 4, background: "var(--surface-1)", borderRadius: "var(--radius)", padding: 3, marginBottom: 12, width: "fit-content" }}>
              {[
                { id: "all", label: "Tümü" },
                { id: "today", label: "Bugün" },
                { id: "week", label: "Bu Hafta" },
                { id: "month", label: "Bu Ay" },
              ].map((o) => (
                <button
                  key={o.id}
                  onClick={() => setDealQuickDateFilter(o.id)}
                  style={{ border: "none", background: dealQuickDateFilter === o.id ? "var(--fill-accent)" : "transparent", color: dealQuickDateFilter === o.id ? "var(--on-accent)" : "var(--text-secondary)", fontWeight: dealQuickDateFilter === o.id ? 600 : 400, fontSize: 13 }}
                >
                  {o.label}
                </button>
              ))}
            </div>
          )}

          <div className="list-toolbar" style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12, gap: 8, flexWrap: "wrap" }}>
            <button
              onClick={() => setShowDealExport(true)}
              disabled={filteredDeals.length === 0}
              style={{ background: "var(--surface-1)", border: "0.5px solid var(--border)", display: "flex", alignItems: "center", gap: 6 }}
            >
              <i className="ti ti-download" style={{ fontSize: 16 }} aria-hidden="true"></i>
              Dışa aktar
            </button>
            <button
              onClick={() => setShowParasutExport(true)}
              style={{ background: "var(--surface-1)", border: "0.5px solid var(--border)", display: "flex", alignItems: "center", gap: 6 }}
            >
              <i className="ti ti-receipt" style={{ fontSize: 16 }} aria-hidden="true"></i>
              Paraşüt'e aktar
            </button>
            <button
              onClick={() => setShowImportDeals(true)}
              style={{ background: "var(--surface-1)", border: "0.5px solid var(--border)", display: "flex", alignItems: "center", gap: 6 }}
            >
              <i className="ti ti-upload" style={{ fontSize: 16 }} aria-hidden="true"></i>
              İçe aktar
            </button>
            {supportsSelfBooking(companySettings?.sector) && bookingModel(companySettings?.sector) === "slot" && (
              <button
                onClick={async () => {
                  const link = await generateLeadCaptureLink();
                  if (link) setAppointmentLink(link.replace("/lead/", "/randevu-al/"));
                }}
                style={{ background: "var(--surface-1)", border: "0.5px solid var(--border)", display: "flex", alignItems: "center", gap: 6 }}
              >
                <i className="ti ti-calendar-event" style={{ fontSize: 16 }} aria-hidden="true"></i>
                Randevu Alma Linki
              </button>
            )}
            <button
              onClick={() => { setEditingDeal(null); setShowDealForm(true); }}
              disabled={customers.length === 0}
              style={{ background: "var(--fill-accent)", color: "var(--on-accent)", border: "none", display: "flex", alignItems: "center", gap: 6 }}
            >
              <i className="ti ti-plus" style={{ fontSize: 16 }} aria-hidden="true"></i>
              {dealWords.addLabel}
            </button>
          </div>

          <div className="list-toolbar" style={{ display: "flex", marginBottom: 12, gap: 8, flexWrap: "wrap" }}>
            <input
              value={dealSearch}
              onChange={(e) => setDealSearch(e.target.value)}
              placeholder={dealWords.searchPlaceholder}
              style={{ flex: 1, minWidth: 160 }}
            />
            <select value={dealStageFilter} onChange={(e) => setDealStageFilter(e.target.value)} style={{ fontSize: 13 }}>
              <option value="all">Tüm aşamalar</option>
              <option value="acik">{dealWords.openFilterLabel}</option>
              {STAGES.map((s) => <option key={s.id} value={s.id}>{stageLabel(s.id, dealAudience, companySettings?.sector)}</option>)}
            </select>
            <select value={dealPaymentFilter} onChange={(e) => setDealPaymentFilter(e.target.value)} style={{ fontSize: 13 }}>
              <option value="all">Tüm ödeme durumları</option>
              <option value="odendi">Ödendi</option>
              <option value="kismi">Kısmi ödeme</option>
              <option value="odenmedi">Ödenmedi</option>
            </select>
            <select value={dealSort} onChange={(e) => setDealSort(e.target.value)} style={{ fontSize: 13 }}>
              <option value="newest">En yeni eklenen</option>
              <option value="oldest">En eski eklenen</option>
            </select>
            <DateRangeFilter from={dealFromDate} to={dealToDate} onFromChange={setDealFromDate} onToChange={setDealToDate} />
          </div>

          {customers.length === 0 && (
            <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 12 }}>Kayıt eklemeden önce bir müşteri oluşturun.</p>
          )}

          {filteredDeals.length === 0 ? (
            deals.length === 0 ? (
              <div style={{ background: "var(--surface-1)", borderRadius: 12, padding: "2rem 1.5rem", textAlign: "center" }}>
                <p style={{ fontWeight: 500, margin: "0 0 4px" }}>{dealWords.emptyDefault}</p>
                <p style={{ fontSize: 14, color: "var(--text-secondary)", margin: "0 0 16px" }}>Başlamak için ilk kaydınızı ekleyin.</p>
                <button
                  onClick={() => { setEditingDeal(null); setShowDealForm(true); }}
                  disabled={customers.length === 0}
                  style={{ background: "var(--fill-accent)", color: "var(--on-accent)", border: "none" }}
                >
                  + {dealWords.addLabel}
                </button>
              </div>
            ) : (
              <p style={{ fontSize: 14, color: "var(--text-secondary)" }}>{dealWords.emptySearch}</p>
            )
          ) : dealView === "kanban" ? (
            <div style={{ display: "flex", gap: 12, overflowX: "auto", paddingBottom: 8 }}>
              {STAGES.map((stage) => {
                const isClosedStage = stage.id === "kazanildi" || stage.id === "kaybedildi";
                const cap = isClosedStage ? 15 : 20;
                const expanded = expandedKanbanStages.has(stage.id);
                const stageDeals = filteredDeals
                  .filter((d) => d.stage === stage.id)
                  .sort((a, b) =>
                    isClosedStage
                      ? new Date(b.closedAt || b.createdAt || 0) - new Date(a.closedAt || a.createdAt || 0)
                      : (dealDaysOpen(b) ?? 0) - (dealDaysOpen(a) ?? 0)
                  );
                const stageValue = stageDeals.reduce((sum, d) => sum + (d.value || 0), 0);
                const visibleDeals = expanded ? stageDeals : stageDeals.slice(0, cap);
                const hiddenCount = stageDeals.length - visibleDeals.length;
                return (
                  <div
                    key={stage.id}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => {
                      if (!dragDealId) return;
                      attemptMoveDealStage(dragDealId, stage.id);
                      setDragDealId(null);
                    }}
                    style={{ background: "var(--surface-1)", borderRadius: "var(--radius)", padding: 10, minWidth: 220, flex: "0 0 220px" }}
                  >
                    <div style={{ marginBottom: 8 }}>
                      <p style={{ fontSize: 13, fontWeight: 600, margin: "0 0 2px" }}>{stageLabel(stage.id, dealAudience, companySettings?.sector)} · {stageDeals.length}</p>
                      <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: 0 }}>{formatTL(stageValue)}</p>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8, minHeight: 40, maxHeight: 560, overflowY: "auto" }}>
                      {visibleDeals.map((d) => {
                        const c = customerById(d.customerId);
                        const daysOpen = dealDaysOpen(d);
                        return (
                          <div
                            key={d.id}
                            draggable
                            onDragStart={() => setDragDealId(d.id)}
                            onClick={() => { setEditingDeal(d); setShowDealForm(true); }}
                            style={{ background: "var(--surface-2)", border: "0.5px solid var(--border)", borderRadius: "var(--radius)", padding: 10, cursor: "grab" }}
                          >
                            <p style={{ margin: "0 0 4px", fontSize: 13, fontWeight: 500 }}>{c?.name || "Bilinmeyen müşteri"}</p>
                            <p style={{ margin: "0 0 4px", fontSize: 12, color: "var(--text-secondary)" }}>{d.title}</p>
                            {daysOpen != null && daysOpen >= STUCK_DEAL_DAYS_THRESHOLD && (
                              <div style={{ marginBottom: 4 }}>
                                <Badge tone={daysOpen >= STUCK_DEAL_DAYS_DANGER_THRESHOLD ? "danger" : "warning"}>
                                  {daysOpen >= STUCK_DEAL_DAYS_DANGER_THRESHOLD ? "🔴" : "🟡"} {daysOpen} gündür açık
                                </Badge>
                              </div>
                            )}
                            {d.customFields?.kaynak === "portal" && d.customFields?.portal_randevu_zamani && (
                              <div style={{ marginBottom: 4 }}>
                                <Badge tone="accent">Portaldan alındı</Badge>
                              </div>
                            )}
                            {d.customFields?.kaynak === "randevu_widget" && d.customFields?.portal_randevu_zamani && (
                              <div style={{ marginBottom: 4 }}>
                                <Badge tone="accent">Web'den alındı</Badge>
                              </div>
                            )}
                            {d.paymentStatus === "paid" && (
                              <div style={{ marginBottom: 4 }}>
                                <Badge tone="success">✓ Online ödendi</Badge>
                              </div>
                            )}
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                              <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "var(--text-accent)" }}>{formatTL(d.value)}</p>
                              {/* Liste görünümündeki RowActionsMenu ile birebir aynı öğeler —
                                  eskiden burada sadece PDF ikonu vardı, Sil/Kopyala/Onay Linki/
                                  Tahsilat Kanban'dan hiç erişilemiyordu. Kart tıklaması Düzenle'yi
                                  açtığı için (üstteki onClick) tıklamanın karta sızmaması gerekiyor. */}
                              <div onClick={(e) => e.stopPropagation()}>
                                <RowActionsMenu
                                  items={[
                                    { icon: "ti-file-text", label: dealPdfLabel, onClick: () => setTeklifDeal(d) },
                                    companySettings?.sector === "emlak" && { icon: "ti-wand", label: "İlan Metni Oluştur", onClick: () => setListingTextDeal(d) },
                                    {
                                      icon: "ti-link",
                                      label: "Onay Linki",
                                      title: c?.email ? "Müşterinin onaylayabileceği link - kopyala ve gönder" : "Onay linki için müşterinin e-postası kayıtlı olmalı",
                                      info: dealApprovalLinkInfoText,
                                      disabled: !c?.email,
                                      onClick: () => {
                                        if (!c?.email) { notify("Onay linki oluşturmak için önce müşterinin e-postasını ekleyin."); return; }
                                        setPaymentModeDeal(d);
                                      },
                                    },
                                    !!d.sessionTotal && d.sessionUsed < d.sessionTotal && { icon: "ti-plus", label: "Seans kullanıldı", onClick: () => handleUseSessionClick(d) },
                                    { icon: "ti-cash", label: "Tahsilat", onClick: () => setPaymentsDeal(d) },
                                    {
                                      icon: "ti-copy",
                                      label: "Kopyala",
                                      title: `Bu ${DEAL_WORD_FORMS[dealKind].gen} bilgileriyle yeni bir ${DEAL_WORD_FORMS[dealKind].bare} oluştur`,
                                      onClick: () => {
                                        setEditingDeal({
                                          customerId: d.customerId,
                                          title: d.title,
                                          value: d.value,
                                          cost: d.cost,
                                          kdvRate: d.kdvRate,
                                          tags: d.tags,
                                          customFields: d.customFields,
                                          assignedTo: d.assignedTo,
                                          createdAt: new Date().toISOString(),
                                        });
                                        setShowDealForm(true);
                                      },
                                    },
                                    { icon: "ti-edit", label: "Düzenle", onClick: () => { setEditingDeal(d); setShowDealForm(true); } },
                                    { icon: "ti-trash", label: "Sil", danger: true, onClick: () => setConfirmDeleteDeal(d) },
                                  ]}
                                />
                              </div>
                            </div>
                            {(() => {
                              // "Online ödendi" rozeti zaten tam ödendiğini gösteriyor —
                              // aynı bilgiyi burada tekrar "Ödendi" olarak basmak gereksiz
                              // tekrar oluyordu (kullanıcı bunu Kanban kartında fark etti).
                              if (d.paymentStatus === "paid") return null;
                              const paid = totalPaidForDeal(d.id);
                              if (paid <= 0) return null;
                              const remaining = d.value - paid;
                              return (
                                <div style={{ marginTop: 4 }}>
                                  <Badge tone={remaining <= 0 ? "success" : "warning"}>{remaining <= 0 ? "Ödendi" : "Kısmi ödeme"}</Badge>
                                </div>
                              );
                            })()}
                            {!!d.sessionTotal && (
                              <div style={{ marginTop: 4, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
                                <span title={Array.isArray(d.customFields?.package_breakdown) ? d.customFields.package_breakdown.map((b) => `${b.label}: ${b.used}/${b.total}`).join(", ") : undefined}>
                                  <Badge tone={d.sessionUsed >= d.sessionTotal ? "success" : "default"}>
                                    {d.sessionUsed >= d.sessionTotal ? "Paket tamamlandı" : `${d.sessionUsed}/${d.sessionTotal} seans`}
                                  </Badge>
                                </span>
                                {d.sessionUsed < d.sessionTotal && (
                                  <IconButton
                                    icon="ti-plus"
                                    title="Seans kullanıldı"
                                    size="sm"
                                    onClick={(e) => { e.stopPropagation(); handleUseSessionClick(d); }}
                                  />
                                )}
                              </div>
                            )}
                            {d.reminder && (
                              <p style={{ margin: "4px 0 0", fontSize: 11, color: "var(--text-warning)", display: "flex", alignItems: "center", gap: 4 }}>
                                <i className="ti ti-bell" style={{ fontSize: 12 }} aria-hidden="true"></i>
                                {d.reminder}
                              </p>
                            )}
                            {d.tags?.length > 0 && (
                              <div style={{ marginTop: 4 }}>
                                <TagBadges tags={d.tags} />
                              </div>
                            )}
                            {d.customFields?.sevkiyat_durumu && (
                              <div style={{ marginTop: 4 }}>
                                <Badge tone="default">{d.customFields.sevkiyat_durumu}</Badge>
                              </div>
                            )}
                            {d.firstViewedAt && !d.approvedAt && (
                              <div style={{ marginTop: 4 }} title={d.viewDurationSeconds > 0 ? `Müşteri toplam ${formatViewDuration(d.viewDurationSeconds)} inceledi` : undefined}>
                                <Badge tone="accent">👁 Görüntülendi{d.viewDurationSeconds > 0 ? ` · ${formatViewDuration(d.viewDurationSeconds)}` : ""}</Badge>
                              </div>
                            )}
                            {d.approvedAt && (
                              <div style={{ marginTop: 4 }}>
                                <Badge tone="success">Onaylandı ✓</Badge>
                              </div>
                            )}
                            {d.customFields?.attendanceConfirmedAt && (
                              <div style={{ marginTop: 4 }} title="Müşteri hatırlatma e-postasındaki linkten geleceğini onayladı">
                                <Badge tone="success">✓ Katılım onayladı</Badge>
                              </div>
                            )}
                            {pendingArrivalDealIds.has(d.id) && (
                              <div style={{ display: "flex", gap: 4, marginTop: 6 }} onClick={(e) => e.stopPropagation()}>
                                <button type="button" onClick={() => attemptMoveDealStage(d.id, "kazanildi")} style={{ fontSize: 11, flex: 1, padding: "4px 6px" }}>
                                  Geldi ✓
                                </button>
                                <button type="button" onClick={() => attemptMoveDealStage(d.id, "kaybedildi")} style={{ fontSize: 11, flex: 1, padding: "4px 6px" }}>
                                  Gelmedi
                                </button>
                              </div>
                            )}
                            {/* Sürükle-bırak dokunmatik ekranda çalışmıyor (HTML5 DnG
                                touch'ı desteklemiyor) - bu seçici mobilde aşama
                                değiştirmenin tek yolu, masaüstünde de sürüklemeye
                                alternatif. Liste görünümündeki seçiciyle aynı geçit
                                (attemptMoveDealStage) kullanılır. */}
                            <div style={{ marginTop: 6 }} onClick={(e) => e.stopPropagation()}>
                              <select
                                value={d.stage}
                                onChange={(e) => attemptMoveDealStage(d.id, e.target.value)}
                                style={{ width: "100%", fontSize: 11.5, fontWeight: 500, border: "none", ...TONE_COLORS[stageTone(d.stage)] }}
                              >
                                {STAGES.map((s) => (
                                  <option key={s.id} value={s.id} style={TONE_COLORS[stageTone(s.id)]}>{stageLabel(s.id, c?.customerType || "kurumsal", companySettings?.sector)}</option>
                                ))}
                              </select>
                            </div>
                          </div>
                        );
                      })}
                      {hiddenCount > 0 && (
                        <button
                          type="button"
                          onClick={() => setExpandedKanbanStages((prev) => new Set(prev).add(stage.id))}
                          style={{ background: "transparent", border: "0.5px dashed var(--border-strong)", color: "var(--text-secondary)", fontSize: 12, padding: "6px 8px" }}
                        >
                          +{hiddenCount} tane daha göster
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
            <table className="responsive-table" style={{ width: "100%", minWidth: 620, borderCollapse: "separate", borderSpacing: "0 8px" }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left", padding: "0 12px", fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.3 }}>{dealWords.columnHeader}</th>
                  <th style={{ textAlign: "left", padding: "0 12px", fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.3, whiteSpace: "nowrap" }}>Aşama</th>
                  <th style={{ textAlign: "left", padding: "0 12px", fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.3, whiteSpace: "nowrap" }}>Ödeme</th>
                  <th style={{ textAlign: "right", padding: "0 12px", fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.3, whiteSpace: "nowrap" }}>Tutar</th>
                  <th style={{ textAlign: "right", padding: "0 12px" }}></th>
                </tr>
              </thead>
              <tbody>
                {filteredDeals.map((d) => {
                  const c = customerById(d.customerId);
                  const paid = totalPaidForDeal(d.id);
                  const remaining = d.value - paid;
                  return (
                    <tr key={d.id} style={{ background: "var(--surface-1)" }}>
                      <td data-label={dealWords.columnHeader} onClick={() => { setEditingDeal(d); setShowDealForm(true); }} style={{ padding: "10px 12px", borderRadius: "var(--radius) 0 0 var(--radius)", cursor: "pointer" }}>
                        <p style={{ margin: 0, fontWeight: 500, fontSize: 14 }}>
                          {c?.name || "Bilinmeyen müşteri"} - {d.title}
                        </p>
                        <p style={{ margin: 0, fontSize: 12, color: "var(--text-secondary)" }}>
                          {d.createdAt ? new Date(d.createdAt).toLocaleDateString("tr-TR") : ""}
                          {d.createdAt && new Date(d.createdAt).toTimeString().slice(0, 5) !== "00:00"
                            ? ` · ${new Date(d.createdAt).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}`
                            : ""}
                          {" "}· {d.reminder ? `Hatırlatma: ${d.reminder}` : "Hatırlatma yok"}
                        </p>
                        {(() => {
                          const daysOpen = dealDaysOpen(d);
                          if (daysOpen == null || daysOpen < STUCK_DEAL_DAYS_THRESHOLD) return null;
                          const danger = daysOpen >= STUCK_DEAL_DAYS_DANGER_THRESHOLD;
                          return (
                            <div style={{ marginTop: 4 }}>
                              <Badge tone={danger ? "danger" : "warning"}>{danger ? "🔴" : "🟡"} {daysOpen} gündür açık</Badge>
                            </div>
                          );
                        })()}
                        {d.customFields?.kaynak === "portal" && d.customFields?.portal_randevu_zamani && (
                          <div style={{ marginTop: 4 }}>
                            <Badge tone="accent">Portaldan alındı</Badge>
                          </div>
                        )}
                        {d.customFields?.kaynak === "randevu_widget" && d.customFields?.portal_randevu_zamani && (
                          <div style={{ marginTop: 4 }}>
                            <Badge tone="accent">Web'den alındı</Badge>
                          </div>
                        )}
                        {d.paymentStatus === "paid" && (
                          <div style={{ marginTop: 4 }}>
                            <Badge tone="success">✓ Online ödendi</Badge>
                          </div>
                        )}
                        {!!d.sessionTotal && (
                          <div style={{ marginTop: 4 }} title={Array.isArray(d.customFields?.package_breakdown) ? d.customFields.package_breakdown.map((b) => `${b.label}: ${b.used}/${b.total}`).join(", ") : undefined}>
                            <Badge tone={d.sessionUsed >= d.sessionTotal ? "success" : "default"}>
                              {d.sessionUsed >= d.sessionTotal ? "Paket tamamlandı" : `${d.sessionUsed}/${d.sessionTotal} seans`}
                            </Badge>
                          </div>
                        )}
                        {d.tags?.length > 0 && (
                          <div style={{ marginTop: 4 }}>
                            <TagBadges tags={d.tags} />
                          </div>
                        )}
                        {d.customFields?.sevkiyat_durumu && (
                          <div style={{ marginTop: 4 }}>
                            <Badge tone="default">{d.customFields.sevkiyat_durumu}</Badge>
                          </div>
                        )}
                        {d.firstViewedAt && !d.approvedAt && (
                          <div style={{ marginTop: 4 }} title={d.viewDurationSeconds > 0 ? `Müşteri toplam ${formatViewDuration(d.viewDurationSeconds)} inceledi` : undefined}>
                            <Badge tone="accent">👁 Görüntülendi{d.viewDurationSeconds > 0 ? ` · ${formatViewDuration(d.viewDurationSeconds)}` : ""}</Badge>
                          </div>
                        )}
                        {d.approvedAt && (
                          <div style={{ marginTop: 4 }}>
                            <Badge tone="success">Onaylandı ✓</Badge>
                          </div>
                        )}
                        {d.customFields?.attendanceConfirmedAt && (
                          <div style={{ marginTop: 4 }} title="Müşteri hatırlatma e-postasındaki linkten geleceğini onayladı">
                            <Badge tone="success">✓ Katılım onayladı</Badge>
                          </div>
                        )}
                      </td>
                      <td data-label="Aşama" style={{ padding: "10px 12px", whiteSpace: "nowrap" }}>
                        {pendingArrivalDealIds.has(d.id) && (
                          <div style={{ display: "flex", gap: 4, marginBottom: 4 }} onClick={(e) => e.stopPropagation()}>
                            <button type="button" onClick={() => attemptMoveDealStage(d.id, "kazanildi")} style={{ fontSize: 11, padding: "4px 6px" }}>
                              Geldi ✓
                            </button>
                            <button type="button" onClick={() => attemptMoveDealStage(d.id, "kaybedildi")} style={{ fontSize: 11, padding: "4px 6px" }}>
                              Gelmedi
                            </button>
                          </div>
                        )}
                        <select
                          value={d.stage}
                          onChange={(e) => attemptMoveDealStage(d.id, e.target.value)}
                          onClick={(e) => e.stopPropagation()}
                          style={{ fontSize: 12.5, fontWeight: 500, border: "none", ...TONE_COLORS[stageTone(d.stage)] }}
                        >
                          {STAGES.map((s) => (
                            <option key={s.id} value={s.id} style={TONE_COLORS[stageTone(s.id)]}>{stageLabel(s.id, c?.customerType || "kurumsal", companySettings?.sector)}</option>
                          ))}
                        </select>
                      </td>
                      <td data-label="Ödeme" onClick={() => setPaymentsDeal(d)} style={{ padding: "10px 12px", whiteSpace: "nowrap", cursor: "pointer" }}>
                        {paid > 0 ? <Badge tone={remaining <= 0 ? "success" : "warning"}>{remaining <= 0 ? "Ödendi" : "Kısmi ödeme"}</Badge> : <span style={{ fontSize: 12, color: "var(--text-muted)" }}>-</span>}
                      </td>
                      <td data-label="Tutar" style={{ padding: "10px 12px", whiteSpace: "nowrap", textAlign: "right", fontSize: 13, fontWeight: 500 }}>{formatTL(d.value)}</td>
                      <td style={{ padding: "10px 12px", borderRadius: "0 var(--radius) var(--radius) 0" }}>
                        <div style={{ display: "flex", justifyContent: "flex-end" }}>
                          <RowActionsMenu
                            items={[
                              { icon: "ti-file-text", label: dealPdfLabel, onClick: () => setTeklifDeal(d) },
                              companySettings?.sector === "emlak" && { icon: "ti-wand", label: "İlan Metni Oluştur", onClick: () => setListingTextDeal(d) },
                              {
                                icon: "ti-link",
                                label: "Onay Linki",
                                title: c?.email ? "Müşterinin onaylayabileceği link - kopyala ve gönder" : "Onay linki için müşterinin e-postası kayıtlı olmalı",
                                info: dealApprovalLinkInfoText,
                                disabled: !c?.email,
                                onClick: () => {
                                  if (!c?.email) { notify("Onay linki oluşturmak için önce müşterinin e-postasını ekleyin."); return; }
                                  setPaymentModeDeal(d);
                                },
                              },
                              !!d.sessionTotal && d.sessionUsed < d.sessionTotal && { icon: "ti-plus", label: "Seans kullanıldı", onClick: () => handleUseSessionClick(d) },
                              { icon: "ti-cash", label: "Tahsilat", onClick: () => setPaymentsDeal(d) },
                              {
                                icon: "ti-copy",
                                label: "Kopyala",
                                title: `Bu ${DEAL_WORD_FORMS[dealKind].gen} bilgileriyle yeni bir ${DEAL_WORD_FORMS[dealKind].bare} oluştur`,
                                onClick: () => {
                                  setEditingDeal({
                                    customerId: d.customerId,
                                    title: d.title,
                                    value: d.value,
                                    cost: d.cost,
                                    kdvRate: d.kdvRate,
                                    tags: d.tags,
                                    customFields: d.customFields,
                                    assignedTo: d.assignedTo,
                                    createdAt: new Date().toISOString(),
                                  });
                                  setShowDealForm(true);
                                },
                              },
                              { icon: "ti-edit", label: "Düzenle", onClick: () => { setEditingDeal(d); setShowDealForm(true); } },
                              { icon: "ti-trash", label: "Sil", danger: true, onClick: () => setConfirmDeleteDeal(d) },
                            ]}
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
          )}
        </div>
      )}

      {tab === "finans" && (
        <Finance
          deals={deals}
          payments={payments}
          companyExpenses={companyExpenses}
          customers={customers}
          onAddExpense={addCompanyExpense}
          onUpdateExpense={updateCompanyExpense}
          onDeleteExpense={deleteCompanyExpense}
          onUpdatePayment={updatePayment}
          onDeletePayment={deletePayment}
          onUpdateDealCost={updateDealCost}
          onOpenPayments={setPaymentsDeal}
          sector={companySettings?.sector}
          canDelete={canEditCompanySettings}
        />
      )}

      {tab === "mesajlar" && (
        <ChatInbox
          conversations={chatConversations}
          selectedTicketId={selectedChatTicketId}
          onSelect={(ticketId) => {
            setSelectedChatTicketId(ticketId);
            // Destek talebinin aksine (bkz. addTicketMessage), burada gerçek bir
            // yanıt beklemiyoruz - sıradan bir sohbet konuşması, açması yeterli.
            if (ticketId) markMessagesRead(ticketId, "gelen");
          }}
          selectedConversation={selectedChatConversation}
          onSend={(content) => addTicketMessage({ ticketId: selectedChatConversation.ticket.id, direction: "giden", content, isInternal: false })}
        />
      )}

      {tab === "destek" && (
        <Support
          customers={customers}
          tickets={supportTickets}
          ticketMessages={supportTicketMessages}
          kbArticles={kbArticles}
          onSaveTicket={upsertTicket}
          onDeleteTicket={deleteTicket}
          onChangeTicketStatus={changeTicketStatus}
          onAddTicketMessage={addTicketMessage}
          onSaveKbArticle={upsertKbArticle}
          onDeleteKbArticle={deleteKbArticle}
          onBulkImportTickets={bulkImportTickets}
          onBulkImportKbArticles={bulkImportKbArticles}
          sector={companySettings?.sector}
          initialViewTicketId={initialViewTicketId}
          onConsumeInitialViewTicket={() => setInitialViewTicketId(null)}
        />
      )}

      {tab === "fiyatlistesi" && canEditCompanySettings && (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
            <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>Ürün & Hizmet Fiyat Listesi</h1>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                onClick={() => setShowPriceListExport(true)}
                disabled={priceListItems.length === 0}
                style={{ background: "var(--surface-1)", border: "0.5px solid var(--border)", display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}
              >
                <i className="ti ti-download" style={{ fontSize: 16 }} aria-hidden="true"></i>
                Dışa aktar
              </button>
              <button
                onClick={() => setShowImportPriceList(true)}
                style={{ background: "var(--surface-1)", border: "0.5px solid var(--border)", display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}
              >
                <i className="ti ti-upload" style={{ fontSize: 16 }} aria-hidden="true"></i>
                İçe aktar
              </button>
              {supportsSelfBooking(companySettings?.sector) && bookingModel(companySettings?.sector) === "slot" && (
                <button
                  onClick={() => setShowFreeServiceModal(true)}
                  style={{ background: "var(--surface-1)", border: "0.5px solid var(--border)", display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}
                >
                  <i className="ti ti-gift" style={{ fontSize: 16 }} aria-hidden="true"></i>
                  Ücretsiz Hizmet Tanımla
                </button>
              )}
            </div>
          </div>
          <PriceListManager items={priceListItems} onAdd={addPriceListItem} onUpdate={updatePriceListItem} onDelete={deletePriceListItem} sector={companySettings?.sector} />
          {showFreeServiceModal && (
            <FreeServiceModal sector={companySettings?.sector} onAdd={addPriceListItem} onClose={() => setShowFreeServiceModal(false)} />
          )}
        </div>
      )}

      {tab === "stokmalzeme" && canEditCompanySettings && (
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, margin: "0 0 16px" }}>Stok & Malzeme</h1>
          <StockManager
            stockItems={stockItems}
            priceListItems={priceListItems}
            priceItemIngredients={priceItemIngredients}
            sector={companySettings?.sector}
            onAddStock={addStockItem}
            onUpdateStock={updateStockItem}
            onDeleteStock={deleteStockItem}
            onAddIngredient={addPriceItemIngredient}
            onDeleteIngredient={deletePriceItemIngredient}
          />
        </div>
      )}

      {tab === "ajanda" && (
        <AgendaTab
          deals={deals}
          customers={customers}
          groupClasses={groupClasses}
          groupClassEnrollments={groupClassEnrollments}
          classAttendance={classAttendance}
          activeCustomerIds={new Set(activeMemberships.map((d) => d.customerId))}
          sector={companySettings?.sector}
          dateTimeKey={appointmentDateTimeKey}
          teamMembers={teamRoster}
          resources={resources}
          currentUserId={session.user.id}
          currentUserEmail={session.user.email}
          onOpenDeal={(deal) => openDealOrList([deal], deal.title)}
          onOpenClasses={() => setTab("dersler")}
          onEnrollClass={enrollMember}
          onRemoveFromClass={removeMember}
          onSetAttendance={setClassAttendance}
        />
      )}

      {tab === "dersler" && supportsGroupClasses(companySettings?.sector) && (
        <GroupClassesTab
          groupClasses={groupClasses}
          groupClassEnrollments={groupClassEnrollments}
          customers={customers}
          activeCustomerIds={new Set(activeMemberships.map((d) => d.customerId))}
          sector={companySettings?.sector}
          companySettings={companySettings}
          onAdd={addGroupClass}
          onUpdate={updateGroupClass}
          onDelete={deleteGroupClass}
          onEnroll={enrollMember}
          onRemove={removeMember}
          onSaveCancelPolicy={(patch) => upsertCompanySettings({ ...companySettings, ...patch })}
        />
      )}

      </div>
      </div>

      {showCustomerForm && (
        <Modal title={editingCustomer?.id ? "Müşteriyi düzenle" : "Yeni müşteri"} onClose={() => { setShowCustomerForm(false); setEditingCustomer(null); }}>
          <CustomerForm
            initial={editingCustomer}
            customers={customers}
            customFieldDefs={customFieldDefs}
            sectorTags={sectorCustomerTags(companySettings?.sector)}
            preferredCustomerType={companySettings?.preferredCustomerType}
            companySector={companySettings?.sector}
            onSave={upsertCustomer}
            onCancel={() => { setShowCustomerForm(false); setEditingCustomer(null); }}
          />
        </Modal>
      )}

      <AskBubble open={showAskDock} onToggle={() => setShowAskDock((v) => !v)} />
      <AskDock open={showAskDock} onClose={() => setShowAskDock(false)} sector={companySettings?.sector} ctx={askCtx} />

      {showSettingsHub && (
        <Modal title="Ayarlar" onClose={() => setShowSettingsHub(false)} wide>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 8 }}>
            {canEditCompanySettings && (
              <>
                <MenuRow
                  icon="ti-building"
                  label="İşletme Bilgileri"
                  description="İşletme adı, adres, iletişim, KDV oranı"
                  onClick={() => { setShowSettingsHub(false); setShowSettingsForm(true); }}
                />
                <MenuRow
                  icon="ti-category"
                  label="Sektör & Özel Alanlar"
                  description="Aşama isimleri, etiket önerileri, özel alanlar"
                  onClick={() => { setShowSettingsHub(false); setShowSectorFields(true); }}
                />
                <MenuRow
                  icon="ti-layout"
                  label="Teklif Şablonları"
                  description="PDF teklifinizin tasarımını seçin"
                  onClick={() => { setShowSettingsHub(false); setShowPdfTemplates(true); }}
                />
                <MenuRow
                  icon="ti-credit-card"
                  label="Ödeme Bağlantısı"
                  description={paymentCredentials.length > 0 ? `Bağlı ✓ (${paymentCredentials[0].provider === "paytr" ? "PayTR" : "iyzico"}) - müşteriler onay linkinden kartla ödeyebilir` : "Onay linkinden kartla tahsilat almak için iyzico veya PayTR bağlayın"}
                  onClick={() => { setShowSettingsHub(false); setShowPaymentSettings(true); }}
                />
                {bookingModel(companySettings?.sector) === "slot" && (
                  <MenuRow
                    icon="ti-clock"
                    label="Müsaitlik Saatleri"
                    description="Müşteri portalından randevu alınabilecek gün/saatleri belirleyin"
                    onClick={() => { setShowSettingsHub(false); setShowBusinessHours(true); }}
                  />
                )}
                {bookingModel(companySettings?.sector) === "inventory" && (
                  <MenuRow
                    icon="ti-door"
                    label="Oda Stoku"
                    description="Her oda tipinden kaç adet olduğunu belirleyin"
                    onClick={() => { setShowSettingsHub(false); setShowRoomInventory(true); }}
                  />
                )}
              </>
            )}
            <MenuRow
              icon="ti-adjustments"
              label="Görünüm, Bildirimler & Hesap"
              description="Tema, push bildirimleri, şifre"
              onClick={() => { setShowSettingsHub(false); setShowAppSettings(true); }}
            />
            <MenuRow
              icon="ti-users-group"
              label="Takım"
              description="Üyeler ve davetler"
              onClick={() => { setShowSettingsHub(false); setShowTeamModal(true); }}
            />
            <MenuRow
              icon="ti-history"
              label="Çöp Kutusu ve Geçmiş"
              description="Silinen kayıtlar, işlem geçmişi"
              onClick={() => { setShowSettingsHub(false); setShowTrashHistory(true); }}
            />
            <MenuRow
              icon="ti-qrcode"
              label="Müşteri Kazanma Linki"
              description="Müşteri kendi bilgisini bıraksın, elle girmeyin"
              onClick={async () => {
                setShowSettingsHub(false);
                const link = await generateLeadCaptureLink();
                if (link) setLeadCaptureLink(link);
              }}
            />
            {supportsSelfBooking(companySettings?.sector) && bookingModel(companySettings?.sector) === "slot" && (
              <MenuRow
                icon="ti-calendar-event"
                label="Randevu Alma Linki"
                description="Müşteri girişsiz kendi randevusunu seçip talep etsin"
                onClick={async () => {
                  setShowSettingsHub(false);
                  const link = await generateLeadCaptureLink();
                  if (link) setAppointmentLink(link.replace("/lead/", "/randevu-al/"));
                }}
              />
            )}
            <MenuRow
              icon="ti-users-group"
              label="Müşteri Portalı Linki"
              description="Mevcut müşterileriniz için - kendi hesaplarıyla giriş yapıp takip etsinler"
              onClick={() => { setShowSettingsHub(false); setShowPortalLinkModal(true); }}
            />
            <MenuRow
              icon="ti-map-2"
              label="Turu Tekrar Başlat"
              description="Sistemin nasıl çalıştığını gösteren kısa turu tekrar izleyin"
              onClick={() => { setShowSettingsHub(false); setTourStep(0); setShowTour(true); }}
            />
          </div>
        </Modal>
      )}

      {showPortalLinkModal && (
        <Modal title="Müşteri Portalı Linki" onClose={() => setShowPortalLinkModal(false)}>
          <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: "0 0 16px" }}>
            Bu linki (veya QR kodu) mevcut müşterilerinizle paylaşın - kayıtlı e-postalarıyla kendi hesaplarını oluşturup teklif/randevu/üyelik durumlarını görebilir, destek talebi açabilirler. Belirli bir müşteriye özel paylaşmak isterseniz Müşteriler listesindeki "Linki paylaş" butonunu da kullanabilirsiniz.
          </p>
          <img
            src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(getPortalUrl())}`}
            alt="QR kod"
            style={{ display: "block", margin: "0 auto 16px" }}
          />
          <div style={{ display: "flex", gap: 8 }}>
            <input readOnly value={getPortalUrl()} style={{ flex: 1, fontSize: 13 }} onFocus={(e) => e.target.select()} />
            <button
              type="button"
              onClick={() => { navigator.clipboard.writeText(getPortalUrl()); notify("Link kopyalandı.", "success"); }}
              style={{ background: "var(--fill-accent)", color: "var(--on-accent)", border: "none" }}
            >
              Kopyala
            </button>
          </div>
        </Modal>
      )}

      {leadCaptureLink && (
        <Modal title="Müşteri Kazanma Linki" onClose={() => setLeadCaptureLink(null)}>
          <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: "0 0 16px" }}>
            Bu linki (veya QR kodu) fuarda, mağazada, kartvizitte paylaşın - müşteri kendi adı/telefonu/e-postasını/adresini kendisi girer, sizin elle eklemenize gerek kalmaz.
          </p>
          <img
            src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(leadCaptureLink)}`}
            alt="QR kod"
            style={{ display: "block", margin: "0 auto 16px" }}
          />
          <div style={{ display: "flex", gap: 8 }}>
            <input readOnly value={leadCaptureLink} style={{ flex: 1, fontSize: 13 }} onFocus={(e) => e.target.select()} />
            <button
              type="button"
              onClick={() => { navigator.clipboard.writeText(leadCaptureLink); notify("Link kopyalandı.", "success"); }}
              style={{ background: "var(--fill-accent)", color: "var(--on-accent)", border: "none" }}
            >
              Kopyala
            </button>
          </div>

          <div style={{ marginTop: 20, paddingTop: 16, borderTop: "0.5px solid var(--border)" }}>
            <label style={{ fontSize: 13, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>
              Numara yazıp doğrudan WhatsApp'tan gönder
            </label>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                type="tel"
                value={leadCaptureShareNumber}
                onChange={(e) => setLeadCaptureShareNumber(e.target.value)}
                placeholder="0532 000 00 00"
                style={{ flex: 1, fontSize: 13 }}
              />
              <button
                type="button"
                disabled={!leadCaptureShareNumber.trim()}
                onClick={() => {
                  const message = `Merhaba, ${companySettings?.companyName || "işletmemiz"} ile iletişime geçebilmeniz için bilgilerinizi bu linkten bırakabilirsiniz: ${leadCaptureLink}`;
                  window.open(`https://wa.me/${toWhatsAppNumber(leadCaptureShareNumber)}?text=${encodeURIComponent(message)}`, "_blank", "noopener,noreferrer");
                }}
                style={{ background: "var(--fill-accent)", color: "var(--on-accent)", border: "none", display: "flex", alignItems: "center", gap: 6, whiteSpace: "nowrap" }}
              >
                <WhatsAppIcon /> Gönder
              </button>
            </div>
            <p style={{ fontSize: 11.5, color: "var(--text-muted)", margin: "6px 0 0" }}>
              WhatsApp'ınızda hazır mesajla bir sohbet açılır, gönderimi siz onaylarsınız. Bunu sadece sizinle gerçekten
              teması olan kişiler için kullanın (kartvizit bıraktı, telefonla görüştünüz vb.) - rastgele/toplu numara
              listelerine göndermek önerilmez.
            </p>
          </div>
        </Modal>
      )}

      {appointmentLink && (
        <Modal title="Randevu Alma Linki" onClose={() => setAppointmentLink(null)}>
          <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: "0 0 16px" }}>
            Bu linki (veya QR kodu) Instagram bio'nuza, sitenize veya kartvizitinize koyun - hiç kaydı olmayan bir müşteri bile giriş yapmadan uygun bir saat seçip randevu talep edebilir. Link kalıcıdır - fiyat listenizi, hizmetlerinizi veya müsaitlik saatlerinizi güncellediğinizde linki tekrar almanıza gerek yok, değişiklikler otomatik yansır.
          </p>
          {priceListItems.some((item) => Number(item.price) === 0) ? (
            <p style={{ fontSize: 12, color: "var(--text-secondary)", background: "var(--surface-1)", border: "0.5px solid var(--border)", borderRadius: "var(--radius)", padding: "8px 10px", margin: "0 0 16px" }}>
              🎁 Fiyat listenizde 0 TL'lik bir hizmet olduğu için bu widget'ta ayrı, vurgulu bir "ücretsiz" butonu olarak öne çıkıyor.
            </p>
          ) : (
            <p style={{ fontSize: 12, color: "var(--text-secondary)", background: "var(--surface-1)", border: "0.5px solid var(--border)", borderRadius: "var(--radius)", padding: "8px 10px", margin: "0 0 16px" }}>
              💡 İpucu: Fiyat Listesi sekmesine 0 TL'lik bir hizmet eklerseniz (örn. "Ücretsiz İlk Görüşme"), bu widget'ta ayrı, vurgulu bir "ücretsiz" butonu olarak öne çıkar.
            </p>
          )}
          <img
            src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(appointmentLink)}`}
            alt="QR kod"
            style={{ display: "block", margin: "0 auto 16px" }}
          />
          <div style={{ display: "flex", gap: 8 }}>
            <input readOnly value={appointmentLink} style={{ flex: 1, fontSize: 13 }} onFocus={(e) => e.target.select()} />
            <button
              type="button"
              onClick={() => { navigator.clipboard.writeText(appointmentLink); notify("Link kopyalandı.", "success"); }}
              style={{ background: "var(--fill-accent)", color: "var(--on-accent)", border: "none" }}
            >
              Kopyala
            </button>
          </div>

          <div style={{ marginTop: 20, paddingTop: 16, borderTop: "0.5px solid var(--border)" }}>
            <label style={{ fontSize: 13, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>
              Numara yazıp doğrudan WhatsApp'tan gönder
            </label>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                type="tel"
                value={leadCaptureShareNumber}
                onChange={(e) => setLeadCaptureShareNumber(e.target.value)}
                placeholder="0532 000 00 00"
                style={{ flex: 1, fontSize: 13 }}
              />
              <button
                type="button"
                disabled={!leadCaptureShareNumber.trim()}
                onClick={() => {
                  const message = `Merhaba, ${companySettings?.companyName || "işletmemiz"} için müsait bir saat seçip randevu talep edebilirsiniz: ${appointmentLink}`;
                  window.open(`https://wa.me/${toWhatsAppNumber(leadCaptureShareNumber)}?text=${encodeURIComponent(message)}`, "_blank", "noopener,noreferrer");
                }}
                style={{ background: "var(--fill-accent)", color: "var(--on-accent)", border: "none", display: "flex", alignItems: "center", gap: 6, whiteSpace: "nowrap" }}
              >
                <WhatsAppIcon /> Gönder
              </button>
            </div>
          </div>
        </Modal>
      )}

      {showSettingsForm && (
        <Modal title="İşletme Bilgileri" onClose={() => setShowSettingsForm(false)}>
          <CompanySettingsForm initial={companySettings} customFieldDefs={customFieldDefs} onSave={upsertCompanySettings} onCancel={() => setShowSettingsForm(false)} activeTeamId={activeTeamId} notify={notify} />
        </Modal>
      )}

      {showSectorFields && (
        <Modal title="Sektör & Özel Alanlar" onClose={() => setShowSectorFields(false)}>
          <SectorPicker
            companySettings={companySettings}
            onSave={(sectorId) => applySectorPreset(sectorId)}
            onFetchFields={async () => { await applySectorCustomFields(companySettings.sector); notify("Sektöre özel yeni alanlar getirildi.", "success"); }}
          />
          <CustomFieldDefsManager customFieldDefs={customFieldDefs} onAdd={addCustomFieldDef} onUpdate={updateCustomFieldDef} onDelete={deleteCustomFieldDef} sector={companySettings?.sector} />
        </Modal>
      )}

      {showImportPriceList && (
        <ImportModal
          entityType="price_list_items"
          entityLabel="Ürün & Hizmet Fiyat Listesi"
          fieldDefs={PRICE_LIST_IMPORT_FIELDS}
          checkDuplicate={(r) => priceListItems.some((p) => p.name.trim().toLowerCase() === (r.name || "").trim().toLowerCase())}
          onImport={bulkImportPriceListItems}
          onClose={() => setShowImportPriceList(false)}
        />
      )}

      {showPriceListExport && (
        <ExportSelectionModal
          title="Ürün & Hizmet Fiyat Listesini Dışa Aktar"
          items={priceListItems}
          filename="fiyat-listesi.xlsx"
          columns={["Ürün/Hizmet Adı", "Fiyat"]}
          getLabel={(p) => p.name}
          getRow={(p) => [p.name, p.price]}
          onClose={() => setShowPriceListExport(false)}
        />
      )}

      {showPdfTemplates && (
        <Modal title="Teklif Şablonları" onClose={() => setShowPdfTemplates(false)}>
          <TemplateGallery
            activeKey={companySettings?.pdfTemplateKey || "klasik"}
            customTemplates={pdfTemplates}
            companySettings={companySettings}
            onSelect={(key) => upsertCompanySettings({ ...companySettings, pdfTemplateKey: key })}
            onEdit={(tpl) => { setShowPdfTemplates(false); setEditingTemplate(tpl); }}
            onDelete={deletePdfTemplate}
            onCreateNew={(tpl) => { setShowPdfTemplates(false); setEditingTemplate(tpl); }}
          />
        </Modal>
      )}

      {showPaymentSettings && (
        <Modal title="Ödeme Bağlantısı" onClose={() => setShowPaymentSettings(false)}>
          <PaymentCredentialForm
            credential={paymentCredentials[0] || null}
            onSave={upsertPaymentCredential}
            onDelete={deletePaymentCredential}
            onClose={() => setShowPaymentSettings(false)}
          />
        </Modal>
      )}

      {editingTemplate && (
        <TemplateEditor
          initialTemplate={editingTemplate}
          companySettings={companySettings}
          onSave={savePdfTemplate}
          onClose={() => { setEditingTemplate(null); setShowPdfTemplates(true); }}
        />
      )}

      {showBusinessHours && (
        <Modal title="Müsaitlik Saatleri" wide onClose={() => setShowBusinessHours(false)}>
          <div style={{ display: "flex", gap: 4, background: "var(--surface-1)", borderRadius: "var(--radius)", padding: 3, marginBottom: 16, flexWrap: "wrap" }}>
            {[["saatler", "Müsaitlik Saatleri"], ["politika", "Randevu iptal / gelmeme politikası"], ["hazirlik_notu", "Randevu Öncesi Not"], ["kaynaklar", "Kaynaklar (Cihaz/Oda)"]].map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setBusinessHoursTab(id)}
                style={{ border: "none", background: businessHoursTab === id ? "var(--fill-accent)" : "transparent", color: businessHoursTab === id ? "var(--on-accent)" : "var(--text-secondary)", fontWeight: businessHoursTab === id ? 600 : 400, fontSize: 13 }}
              >
                {label}
              </button>
            ))}
          </div>
          {businessHoursTab === "saatler" ? (
            <>
              <AppointmentConcurrencyBox companySettings={companySettings} onSave={(patch) => upsertCompanySettings({ ...companySettings, ...patch })} />
              <BusinessHoursManager items={businessHours} onAdd={addBusinessHours} onDelete={deleteBusinessHours} />
            </>
          ) : businessHoursTab === "politika" ? (
            <>
              <AppointmentCancelPolicyBox companySettings={companySettings} onSave={(patch) => upsertCompanySettings({ ...companySettings, ...patch })} />
              <AppointmentDepositBox companySettings={companySettings} hasPaymentConnection={paymentCredentials.length > 0} onSave={(patch) => upsertCompanySettings({ ...companySettings, ...patch })} />
            </>
          ) : businessHoursTab === "hazirlik_notu" ? (
            <AppointmentPrepNoteBox companySettings={companySettings} onSave={(patch) => upsertCompanySettings({ ...companySettings, ...patch })} />
          ) : (
            <ResourceManager items={resources} onAdd={addResource} onUpdate={updateResource} onDelete={deleteResource} />
          )}
        </Modal>
      )}

      {showRoomInventory && (
        <Modal title="Oda Stoku" onClose={() => setShowRoomInventory(false)}>
          <RoomInventoryManager
            items={roomInventory}
            roomTypeOptions={customFieldDefs.find((d) => d.entity === "deal" && d.key === "oda_tipi")?.options || []}
            onAdd={addRoomInventory}
            onUpdate={updateRoomInventory}
            onDelete={deleteRoomInventory}
          />
        </Modal>
      )}

      {showSectorOnboarding && (
        <SectorOnboardingModal onPick={applySectorPreset} onSkip={skipSectorOnboarding} />
      )}

      {showTour && (
        <OnboardingTour
          step={tourStep}
          dealNavLabel={dealWords.navLabel}
          onStepChange={setTourStep}
          onClose={() => {
            if (activeTeamId) localStorage.setItem(`binerly_tour_dismissed_${activeTeamId}`, "1");
            setShowTour(false);
          }}
        />
      )}

      {showTeamModal && (
        <TeamModal
          session={session}
          activeTeamId={activeTeamId}
          companySettings={companySettings}
          notify={notify}
          staffShifts={staffShifts}
          onAddStaffShift={addStaffShift}
          onDeleteStaffShift={deleteStaffShift}
          onSetStaffShiftDayOff={setStaffShiftDayOff}
          staffLeaveBalances={staffLeaveBalances}
          staffLeaveRecords={staffLeaveRecords}
          onSetStaffLeaveBalance={setStaffLeaveBalance}
          onAddStaffLeaveRecord={addStaffLeaveRecord}
          onDeleteStaffLeaveRecord={deleteStaffLeaveRecord}
          teamRoster={teamRoster}
          deals={deals}
          customers={customers}
          customFieldDefs={customFieldDefs}
          onClose={() => setShowTeamModal(false)}
        />
      )}

      {showAppSettings && (
        <AppSettingsModal
          session={session}
          theme={theme}
          onThemeChange={setTheme}
          pushSubscribed={pushSubscribed}
          onSubscribe={subscribeToPush}
          onUnsubscribe={unsubscribeFromPush}
          notify={notify}
          onClose={() => setShowAppSettings(false)}
        />
      )}

      {showPasswordRecovery && (
        <PasswordRecoveryModal notify={notify} onClose={() => setShowPasswordRecovery(false)} />
      )}

      {showTrashHistory && (
        <TrashHistoryModal notify={notify} onRestore={restoreBatch} onPermanentDelete={permanentlyDeleteBatch} isOwner={isOwner} onClose={() => setShowTrashHistory(false)} activeTeamId={activeTeamId} session={session} teamMembers={teamMembers} />
      )}

      {showImportCustomers && (
        <ImportModal
          entityType="customers"
          entityLabel="Müşteriler"
          fieldDefs={CUSTOMER_IMPORT_FIELDS}
          allowVcf
          // Manuel müşteri formundaki gerçek engelle (findDuplicateCustomer) aynı
          // mantık: isim değil e-posta/telefon eşleşmesi bakılır - aynı isimde iki
          // farklı gerçek müşteri olabilir ama aynı telefonu/e-postayı paylaşmaları
          // gerçekçi değil. Dosyanın kendi içindeki (priorRows) tekrarlar da yakalanır.
          checkDuplicate={(r, priorRows) => {
            const email = (r.email || "").trim().toLowerCase();
            const phone = (r.phone || "").trim();
            if (!email && !phone) return false;
            const existing = customers.find((c) =>
              (email && c.email?.trim().toLowerCase() === email) || (phone && c.phone?.trim() === phone)
            );
            if (existing) return `"${existing.name}" ile aynı e-posta/telefon`;
            const dupInFile = priorRows.some((p) =>
              (email && (p.email || "").trim().toLowerCase() === email) || (phone && (p.phone || "").trim() === phone)
            );
            return dupInFile ? "Dosyada aynı e-posta/telefonla başka bir satır var" : false;
          }}
          onImport={bulkImportCustomers}
          onClose={() => setShowImportCustomers(false)}
        />
      )}

      {showImportDeals && (
        <ImportModal
          entityType="deals"
          entityLabel={dealWords.navLabel}
          fieldDefs={dealImportFields(companySettings?.sector)}
          customers={customers}
          onImport={bulkImportDeals}
          onClose={() => setShowImportDeals(false)}
        />
      )}

      {showParasutExport && (
        <ParasutExportModal deals={deals} customerById={customerById} totalPaidForDeal={totalPaidForDeal} sector={companySettings?.sector} onClose={() => setShowParasutExport(false)} />
      )}

      {showCustomerExport && (
        <ExportSelectionModal
          title="Müşterileri Dışa Aktar"
          items={filteredCustomers}
          filename="musteriler.xlsx"
          columns={["Firma adı", "Sektör", "Bölge", "Açık Adres", "Telefon", "E-posta", "Not", "Son temas"]}
          getLabel={(c) => c.name}
          getRow={(c) => [
            c.name,
            c.sector,
            c.region,
            c.address,
            c.phone,
            c.email,
            c.notes,
            c.lastContact ? new Date(c.lastContact).toLocaleDateString("tr-TR") : "",
          ]}
          onClose={() => setShowCustomerExport(false)}
        />
      )}

      {showDealExport && (
        <ExportSelectionModal
          title={dealWords.exportTitle}
          items={filteredDeals}
          filename={DEAL_TAB_STRINGS[dealKind].exportFilename}
          columns={["Müşteri", "Başlık", "Tutar", "Gider", "Aşama", "Not", "Oluşturulma tarihi"]}
          getLabel={(d) => `${customerById(d.customerId)?.name || "Bilinmeyen müşteri"} - ${d.title}`}
          getRow={(d) => [
            customerById(d.customerId)?.name || "",
            d.title,
            d.value,
            d.cost,
            stageLabel(d.stage, customerById(d.customerId)?.customerType || "kurumsal", companySettings?.sector),
            d.reminder,
            d.createdAt ? new Date(d.createdAt).toLocaleDateString("tr-TR") : "",
          ]}
          getPaymentStatus={(d) => {
            const paid = totalPaidForDeal(d.id);
            if (paid <= 0) return "odenmedi";
            return paid < d.value ? "kismi" : "odendi";
          }}
          onClose={() => setShowDealExport(false)}
        />
      )}

      {teklifDeal && (
        <TeklifPrint
          deal={teklifDeal}
          customer={customerById(teklifDeal.customerId)}
          companySettings={companySettings}
          pdfTemplates={pdfTemplates}
          dealLineItems={dealLineItems}
          notify={notify}
          onClose={() => setTeklifDeal(null)}
        />
      )}

      {quickList && (
        <Modal title={quickList.title} onClose={() => setQuickList(null)}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 320, overflowY: "auto" }}>
            {quickList.items.map((item) =>
              quickList.kind === "deal" ? (
                <div
                  key={item.id}
                  onClick={() => { setQuickList(null); setTab("firsat"); setEditingDeal(item); setShowDealForm(true); }}
                  style={{ background: "var(--surface-1)", borderRadius: "var(--radius)", padding: "0.6rem 0.9rem", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}
                >
                  <span style={{ fontSize: 14 }}>{customerById(item.customerId)?.name || "Bilinmeyen müşteri"} - {item.title}</span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-accent)", whiteSpace: "nowrap" }}>{formatTL(item.value)}</span>
                </div>
              ) : (
                <div
                  key={item.id}
                  onClick={() => { setQuickList(null); setTab("destek"); setInitialViewTicketId(item.id); }}
                  style={{ background: "var(--surface-1)", borderRadius: "var(--radius)", padding: "0.6rem 0.9rem", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}
                >
                  <span style={{ fontSize: 14 }}>{customerById(item.customerId)?.name || "Bilinmeyen müşteri"} - {item.subject}</span>
                </div>
              )
            )}
          </div>
        </Modal>
      )}

      {showDealForm && (
        <Modal wide title={editingDeal?.id ? dealWords.editTitle : dealWords.newTitle} onClose={() => { setShowDealForm(false); setEditingDeal(null); }}>
          <DealForm
            customers={customers}
            initial={editingDeal}
            defaultKdvRate={companySettings?.defaultKdvRate}
            preferredCustomerType={dealAudience}
            sector={companySettings?.sector}
            deals={deals}
            payments={payments}
            appointmentDateTimeKey={appointmentDateTimeKey}
            roomInventory={roomInventory}
            resources={resources}
            customFieldDefs={customFieldDefs}
            sectorTags={sectorDealTags(companySettings?.sector)}
            teamMembers={teamRoster}
            currentUserId={session.user.id}
            currentUserEmail={session.user.email}
            businessUserId={activeTeamId}
            titleSuggestions={[...new Set(deals.map((d) => d.title).filter(Boolean))]}
            priceListItems={priceListItems}
            initialLineItems={editingDeal ? dealLineItems.filter((li) => li.dealId === editingDeal.id) : []}
            dealLineItems={dealLineItems}
            hasPaymentConnection={paymentCredentials.length > 0}
            totalPaid={editingDeal ? totalPaidForDeal(editingDeal.id) : 0}
            attachments={attachments}
            appointmentPenaltyStrikeLimit={companySettings?.appointmentPenaltyStrikeLimit}
            appointmentPenaltyBurnsSession={companySettings?.appointmentPenaltyBurnsSession === true}
            appointmentConcurrency={companySettings?.appointmentConcurrency}
            onUploadAttachment={uploadAttachment}
            onDownloadAttachment={downloadAttachment}
            onDeleteAttachment={deleteAttachment}
            onToggleAttachmentShare={toggleAttachmentShare}
            onRequestPhotoConsent={requestPhotoConsent}
            onSave={upsertDeal}
            onCancel={() => { setShowDealForm(false); setEditingDeal(null); }}
          />
        </Modal>
      )}

      {packageUsePicker && (
        <Modal title="Hangi hizmetten kullanıldı?" onClose={() => setPackageUsePicker(null)}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {(packageUsePicker.customFields?.package_breakdown || []).map((b, i) => (
              <button
                key={i}
                type="button"
                disabled={b.used >= b.total}
                onClick={() => { incrementSessionUsage(packageUsePicker.id, i); setPackageUsePicker(null); }}
                style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 12px", fontSize: 13 }}
              >
                <span>{b.label}</span>
                <span style={{ color: "var(--text-secondary)" }}>{b.used}/{b.total}{b.used >= b.total ? " - tamamlandı" : ""}</span>
              </button>
            ))}
          </div>
        </Modal>
      )}

      {emlakMatches && (
        <Modal title="Gölge Avcı - Uyan alıcı/kiracı adayları" onClose={() => setEmlakMatches(null)}>
          <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: "0 0 12px" }}>
            "{emlakMatches.deal.title}" kaydı, müşterilerin daha önce girilmiş taleplerine göre otomatik tarandı.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {emlakMatches.matches.map(({ customer, score, reasons }) => (
              <div key={customer.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, background: "var(--surface-1)", border: "0.5px solid var(--border)", borderRadius: "var(--radius)", padding: "10px 12px" }}>
                <div style={{ minWidth: 0 }}>
                  <p style={{ margin: 0, fontSize: 14, fontWeight: 500, display: "flex", alignItems: "center", gap: 6 }}>
                    {customer.name}
                    <Badge tone={score >= 80 ? "success" : score >= 65 ? "accent" : "default"}>%{score} uyum</Badge>
                  </p>
                  <p style={{ margin: "2px 0 0", fontSize: 12, color: "var(--text-secondary)" }}>Uyan kriterler: {reasons.join(", ")}</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const message = buildEmlakMatchMessage(emlakMatches.deal, customer, companySettings);
                    window.open(`https://wa.me/${toWhatsAppNumber(customer.phone)}?text=${encodeURIComponent(message)}`, "_blank", "noopener,noreferrer");
                  }}
                  style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0, background: "var(--surface-1)", border: "0.5px solid var(--border)", borderRadius: "var(--radius)", padding: "6px 10px", fontSize: 13, cursor: "pointer" }}
                >
                  <WhatsAppIcon /> WhatsApp'tan gönder
                </button>
              </div>
            ))}
          </div>
        </Modal>
      )}

      {listingTextDeal && (
        <Modal wide title={`İlan Metni - ${listingTextDeal.title}`} onClose={() => setListingTextDeal(null)}>
          <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: "0 0 14px" }}>
            Teklifteki Mülk Tipi/Bölge/Oda Sayısı/Fiyat bilgilerinden üç platforma özel metin hazırlandı. Beğenmediğiniz kısmı kopyaladıktan sonra elle düzenleyebilirsiniz.
          </p>
          {(() => {
            const texts = buildEmlakListingTexts(listingTextDeal);
            const sections = [
              { key: "sahibinden", label: "Sahibinden / Hepsiemlak formatı" },
              { key: "instagram", label: "Instagram gönderi metni" },
              { key: "whatsapp", label: "WhatsApp sunum metni" },
            ];
            return (
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                {sections.map((s) => (
                  <div key={s.key}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                      <p style={{ margin: 0, fontSize: 13, fontWeight: 500 }}>{s.label}</p>
                      <button
                        type="button"
                        onClick={() => { navigator.clipboard.writeText(texts[s.key]); notify("Metin kopyalandı.", "success"); }}
                        style={{ display: "flex", alignItems: "center", gap: 6, background: "var(--surface-1)", border: "0.5px solid var(--border)", borderRadius: "var(--radius)", padding: "4px 10px", fontSize: 12.5, cursor: "pointer" }}
                      >
                        <i className="ti ti-copy" aria-hidden="true"></i> Kopyala
                      </button>
                    </div>
                    <textarea readOnly value={texts[s.key]} rows={s.key === "sahibinden" ? 8 : 6} style={{ width: "100%", fontSize: 13, fontFamily: "inherit", resize: "vertical" }} />
                  </div>
                ))}
              </div>
            );
          })()}
        </Modal>
      )}

      {paymentsDeal && (
        <Modal title={`Tahsilat - ${paymentsDeal.title}`} onClose={() => setPaymentsDeal(null)}>
          <DealPayments
            deal={paymentsDeal}
            payments={paymentsByDeal[paymentsDeal.id] || []}
            sector={companySettings?.sector}
            onAddPayment={addPayment}
            onUpdatePayment={updatePayment}
            onDeletePayment={deletePayment}
            onRefundPayment={refundPayment}
            canDelete={canEditCompanySettings}
          />
        </Modal>
      )}

      {paymentModeDeal && (
        <PaymentModeModal
          deal={paymentModeDeal}
          paymentConnected={paymentCredentials.length > 0}
          onConfirm={async (mode) => {
            await setDealPaymentMode(paymentModeDeal.id, mode);
            const link = await generateApprovalLink(paymentModeDeal);
            if (link) { navigator.clipboard.writeText(link); notify("Onay linki kopyalandı.", "success"); }
            setPaymentModeDeal(null);
          }}
          onClose={() => setPaymentModeDeal(null)}
        />
      )}

      {showCampaignModal && (
        <CampaignModal customers={customers} replyTo={session.user.email} companyName={companySettings?.companyName} logoUrl={companySettings?.logoUrl} session={session} onRequestConsent={requestCustomerConsent} onClose={() => setShowCampaignModal(false)} />
      )}

      {pendingLostReasonMove && (() => {
        const pendingDeal = deals.find((d) => d.id === pendingLostReasonMove.dealId);
        const rawAppt = appointmentDateTimeKey ? pendingDeal?.customFields?.[appointmentDateTimeKey] : null;
        const hoursLeft = rawAppt ? (new Date(`${rawAppt}:00+03:00`).getTime() - Date.now()) / (60 * 60 * 1000) : null;
        const partialChargeHours = companySettings?.appointmentPartialChargeHours;
        // Sadece bilgi amaçlı — "Geç iptal etti" seçilirse hangi kesinti
        // bölgesine düştüğünü gösterir, otomatik para hareketi yapmaz.
        const chargeZoneNote = hoursLeft != null && companySettings?.appointmentPenaltyHours != null && hoursLeft < companySettings.appointmentPenaltyHours && partialChargeHours != null
          ? (hoursLeft >= partialChargeHours ? "Kısmi kesinti (~%50) önerilen bölgede." : "Tam kesinti önerilen bölgede (seans yapılmış sayılabilir).")
          : null;
        const willGrantCredit = hoursLeft != null && companySettings?.appointmentPenaltyHours != null && hoursLeft < companySettings.appointmentPenaltyHours;
        return (
          <Modal title="Neden kaybedildi?" onClose={() => setPendingLostReasonMove(null)}>
            <p style={{ fontSize: 14, color: "var(--text-secondary)", margin: "0 0 16px" }}>
              Müşteri randevuya gelmedi mi, yoksa iptal mi etti? Bu ayrım Pano'daki "Gelmeme oranı" hesabında kullanılıyor.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {dealLostReasons(companySettings?.sector).map((reason) => (
                <div key={reason}>
                  <button
                    onClick={() => { moveDealStage(pendingLostReasonMove.dealId, "kaybedildi", reason); setPendingLostReasonMove(null); }}
                    style={{ textAlign: "left", width: "100%" }}
                  >
                    {reason}
                  </button>
                  {reason === "Geç iptal etti" && chargeZoneNote && (
                    <p style={{ fontSize: 11.5, color: "var(--text-muted)", margin: "2px 0 0 2px" }}>{chargeZoneNote}</p>
                  )}
                  {reason === "İşletme iptal etti" && willGrantCredit && (
                    <p style={{ fontSize: 11.5, color: "var(--text-muted)", margin: "2px 0 0 2px" }}>Randevu saatine az kaldığı için müşteriye otomatik 1 ücretsiz telafi hakkı tanınacak.</p>
                  )}
                  {reason === "Mücbir sebep" && (
                    <p style={{ fontSize: 11.5, color: "var(--text-muted)", margin: "2px 0 0 2px" }}>Ceza/sayaç işletilmez.</p>
                  )}
                </div>
              ))}
            </div>
          </Modal>
        );
      })()}

      {viewingCustomer && (
        <CustomerDetail
          customer={customerById(viewingCustomer.id) || viewingCustomer}
          deals={deals}
          payments={payments}
          activities={activities}
          sector={companySettings?.sector}
          customFieldDefs={customFieldDefs}
          groupClasses={groupClasses}
          groupClassEnrollments={groupClassEnrollments}
          attachments={attachments}
          onUploadAttachment={uploadAttachment}
          onDownloadAttachment={downloadAttachment}
          onDeleteAttachment={deleteAttachment}
          onAddActivity={addActivity}
          onRequestConsent={requestCustomerConsent}
          onClose={() => setViewingCustomer(null)}
        />
      )}

      {confirmDeleteCustomer && (
        <ConfirmDialog
          title="Müşteriyi sil"
          message={`"${confirmDeleteCustomer.name}" silinsin mi? Bu müşteriye ait ${DEAL_WORD_FORMS[dealKind].plural} ve destek talepleri de birlikte çöp kutusuna taşınır - dilediğiniz zaman Çöp Kutusu'ndan geri yükleyebilirsiniz.`}
          onConfirm={() => { deleteCustomer(confirmDeleteCustomer.id); setConfirmDeleteCustomer(null); }}
          onClose={() => setConfirmDeleteCustomer(null)}
        />
      )}

      {confirmDeleteDeal && (
        <ConfirmDialog
          title={dealWords.deleteTitle}
          message={`Bu ${DEAL_WORD_FORMS[dealKind].bare} çöp kutusuna taşınacak, dilediğiniz zaman geri yükleyebilirsiniz.`}
          onConfirm={() => { deleteDeal(confirmDeleteDeal.id); setConfirmDeleteDeal(null); }}
          onClose={() => setConfirmDeleteDeal(null)}
        />
      )}

      {toast && <Toast message={toast.message} tone={toast.tone} onClose={() => setToast(null)} />}
    </div>
  );
}
