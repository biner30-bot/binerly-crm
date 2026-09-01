import React, { useState, useEffect, useRef, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import { supabase } from "./supabase";
import { Badge, TONE_COLORS, Modal, MetricCard, InfoTip, isFullNameValid, Toast, ConfirmDialog, TagInput, IconButton, MenuRow, VoiceInputButton, GoogleAuthButton, AuthDivider, uid, formatTL, toWhatsAppNumber, WhatsAppIcon, useSessionTimeout, useTheme, matchesDateRange, DateRangeFilter, PANO_RANGES, SegmentedControl, getRangeBounds, inRange, WEEKDAYS, WEEKDAYS_SHORT, nextWeeklyOccurrence, NotificationBell, OnboardingTour, getPortalUrl, translateAuthError, humanizeDbMessage, SELF_BOOKED_SOURCES, formatFileSize, MAX_TEAM_SIZE, parseAppointmentDateTime, RowActionsMenu, AttachmentList, PRICE_ITEM_NAME_EXAMPLES, ExportSelectionModal, SECTORS, InitialsAvatar, UserAvatar } from "./shared";
import { DEAL_WORD_FORMS, DEAL_TAB_STRINGS, SECTOR_DEMO_PRESETS } from "./staticData";
import { AuthModal, PasswordRecoveryModal } from "./Auth";
import { SectorPicker, CompanySettingsForm, PaymentCredentialForm, AppSettingsModal, ShowcaseManager, slugify } from "./Settings";
import { FreeServiceModal, PriceListEditModal, PriceListManager, StockEditModal, StockManager } from "./Inventory";
import { AppointmentCancelPolicyBox, AppointmentDepositBox, AppointmentConcurrencyBox, AppointmentRequestModeBox, AppointmentAvailabilitySourceBox, AppointmentPrepNoteBox, BusinessHoursManager, ResourceManager, RoomInventoryEditModal, RoomInventoryManager } from "./AppointmentPolicies";
import { staffLeaveDayCount, formatLeaveDateRange, STAFF_LEAVE_TYPE_LABELS, isOpenStaffShift, staffHistoryDateStr, staffShiftsEffectiveOnDate, StaffShiftDayEditor, StaffShiftGrid, StaffShiftHistoryModal, StaffLeaveRecordModal, StaffLeaveManager, TeamDailyLoadPanel, TeamModal } from "./Team";
import { TRASH_TABLE_LABELS, TrashHistoryModal } from "./TrashHistory";
import { GroupClassForm, GroupClassRoster, LateCancelPolicyBox, GroupClassesTab, AgendaTab, agendaDateKey, quickDateWindow } from "./GroupClasses";
import { DealForm, roomTypeConflict, dealLostReasons, TAGS_INFO_TEXT, DealPayments, TeklifPrint, ParasutExportModal, PaymentModeModal, DealsTab, STUCK_DEAL_DAYS_THRESHOLD } from "./Deals";
import { AppointmentRequestsPanel } from "./AppointmentRequests";
import { CustomerForm, CustomerDetail, CampaignModal, ACTIVITY_TYPES, CustomersTab } from "./Customers";
import { AskBubble, AskDock } from "./AskWidget";
import Pano from "./Pano";
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
import Tasks from "./Tasks";
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

function computeStuckDeals(deals) {
  const now = Date.now();
  return deals
    .filter((d) => d.stage !== "kazanildi" && d.stage !== "kaybedildi" && d.createdAt)
    .map((d) => ({ deal: d, daysOpen: Math.floor((now - new Date(d.createdAt).getTime()) / 86400000) }))
    .filter((x) => x.daysOpen >= STUCK_DEAL_DAYS_THRESHOLD)
    .sort((a, b) => b.daysOpen - a.daysOpen);
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
//
// İki ayrı risk seviyesi: "high" (CHURN_INACTIVITY_DAYS'tir hiç gelmedi - kesin
// sinyal, eski davranışla birebir aynı) ve "medium" (hâlâ geliyor ama son
// CHURN_LOOKBACK_DAYS içindeki haftalık sıklığı kendi geçmiş ortalamasının çok
// altına düşmüş - "ayda 12 kez gelen üye son iki haftada 1 kez geldi" gibi daha
// erken bir düşüşü, sabit bir eşikle değil kişinin KENDİ geçmiş ritmiyle
// kıyaslayarak yakalar). Güvenilir bir ortalama için en az CHURN_BASELINE_MIN_WEEKS
// haftalık geçmişi olmayan (yeni başlamış) üyeler "medium" değerlendirmesine hiç
// girmez - tek bir boş hafta yanlışlıkla düşüş sayılmasın diye.
const CHURN_INACTIVITY_DAYS = 14;
const CHURN_LOOKBACK_DAYS = 14;
const CHURN_BASELINE_MIN_WEEKS = 3;
const CHURN_DROP_RATIO = 0.5;

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
      .map((a) => new Date(a.occurrenceDate).getTime())
      .sort((a, b) => a - b);
    if (attendedTimestamps.length === 0) continue;

    const lastAttended = attendedTimestamps[attendedTimestamps.length - 1];
    const daysSince = Math.floor((now - lastAttended) / 86400000);

    if (daysSince >= CHURN_INACTIVITY_DAYS) {
      alerts.push({ customer, daysSince, level: "high" });
      continue;
    }

    const lookbackStart = now - CHURN_LOOKBACK_DAYS * 86400000;
    const firstAttended = attendedTimestamps[0];
    const baselineSpanWeeks = (lookbackStart - firstAttended) / (7 * 86400000);
    if (baselineSpanWeeks < CHURN_BASELINE_MIN_WEEKS) continue;

    const baselineCount = attendedTimestamps.filter((t) => t < lookbackStart).length;
    const baselineWeeklyRate = baselineCount / baselineSpanWeeks;
    if (baselineWeeklyRate <= 0) continue;

    const recentCount = attendedTimestamps.length - baselineCount;
    const recentWeeklyRate = recentCount / (CHURN_LOOKBACK_DAYS / 7);

    if (recentWeeklyRate <= baselineWeeklyRate * CHURN_DROP_RATIO) {
      const dropPercent = Math.round((1 - recentWeeklyRate / baselineWeeklyRate) * 100);
      alerts.push({ customer, daysSince, level: "medium", dropPercent });
    }
  }
  return alerts.sort((a, b) => {
    if (a.level !== b.level) return a.level === "high" ? -1 : 1;
    return a.level === "high" ? b.daysSince - a.daysSince : b.dropPercent - a.dropPercent;
  });
}

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
    showcaseFeatured: r.showcase_featured || false,
    notifyCustomer: r.notify_customer || false,
    assignedTo: r.assigned_to || null,
    paymentMode: r.payment_mode || "none",
    paymentStatus: r.payment_status || null,
    appointmentOfferTime: r.appointment_offer_time || null,
    appointmentOfferExpiresAt: r.appointment_offer_expires_at || null,
    appointmentOfferStatus: r.appointment_offer_status || null,
    reviewRequestedAt: r.review_requested_at || null,
  };
}

function rowToTask(r) {
  return {
    id: r.id,
    userId: r.user_id,
    title: r.title,
    type: r.type,
    description: r.description || "",
    dueDate: r.due_date || "",
    assignedTo: r.assigned_to || null,
    customerId: r.customer_id || null,
    dealId: r.deal_id || null,
    completedAt: r.completed_at || null,
    createdAt: r.created_at,
    deletedAt: r.deleted_at || null,
    deletedBatchId: r.deleted_batch_id || null,
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
function getMonthlyBuckets(range, wonDealsAll, customBounds) {
  const now = new Date();
  let startYear, startMonth;
  const endYear = now.getFullYear(), endMonth = now.getMonth();

  if (range === "ozel" && customBounds?.from) {
    const d = new Date(`${customBounds.from}T00:00:00`);
    startYear = d.getFullYear(); startMonth = d.getMonth();
  }
  else if (range === "bugun" || range === "bu_hafta" || range === "bu_ay") { startYear = endYear; startMonth = endMonth; }
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

const BUSINESS_HOURS_TABS = [
  { id: "saatler", label: "Müsaitlik Saatleri" },
  { id: "politika", label: "Randevu iptal / gelmeme politikası" },
  { id: "hazirlik_notu", label: "Randevu Öncesi Not" },
  { id: "kaynaklar", label: "Kaynaklar (Cihaz/Oda)" },
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
  return { id: r.id, name: r.name, price: r.price, refreshDays: r.refresh_days || null, durationMinutes: r.duration_minutes || null, commissionPercent: r.commission_percent ?? null, resourceId: r.resource_id || null, parallelGroup: r.parallel_group || null, staffMemberIds: r.staff_member_ids || [], sortOrder: r.sort_order ?? 0, createdAt: r.created_at || null };
}

function rowToStockItem(r) {
  return {
    id: r.id,
    name: r.name,
    unit: r.unit || "adet",
    quantityOnHand: Number(r.quantity_on_hand) || 0,
    reorderThreshold: r.reorder_threshold != null ? Number(r.reorder_threshold) : null,
    supplierName: r.supplier_name || "",
    unitCost: r.unit_cost != null ? Number(r.unit_cost) : null,
    deletedAt: r.deleted_at || null,
    sortOrder: r.sort_order ?? 0,
    createdAt: r.created_at || null,
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
function rowToStaffLeaveBalance(r) {
  return { id: r.id, memberId: r.member_id, annualLeaveDays: Number(r.annual_leave_days) };
}

// Tarih aralığı UTC'ye çevrilmeden gün sayısı hesaplasın diye "T00:00:00"
// olmadan new Date() KULLANILMIYOR — new Date("2026-08-15") UTC gece yarısı
// sayılır, yerel saat dilimi negatifse bir gün geri kayabilir.
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

function rowToShowcaseCampaign(r) {
  return {
    id: r.id,
    title: r.title,
    description: r.description || "",
    startsAt: r.starts_at || null,
    endsAt: r.ends_at || null,
    active: r.active !== false,
    sortOrder: r.sort_order ?? 0,
  };
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
    // Kolon NULL ise (sektör değiştirilmeden kalmış / eski hesap) sektöre göre
    // türet - randevu sektörlerinde müşteri neredeyse hep bireyseldir, aksi
    // halde randevu hesabı "Randevular"ı boş "Kurumsal" sekmesinde açar.
    preferredCustomerType:
      r.preferred_customer_type ||
      (isIndividualFocusedSector(r.sector) ? "bireysel" : "kurumsal"),
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
    appointmentConcurrencyAuto: r.appointment_concurrency_auto === true,
    appointmentOwnerWorks: r.appointment_owner_works !== false,
    appointmentWidgetMode: r.appointment_widget_mode || "realtime",
    appointmentAvailabilitySource: r.appointment_availability_source || "business_hours",
    appointmentOfferValidityHours: r.appointment_offer_validity_hours ?? 24,
    winbackEnabled: r.winback_enabled === true,
    winbackInactiveDays: r.winback_inactive_days ?? null,
    minProfitMarginPercent: r.min_profit_margin_percent ?? null,
    showcasePriceListVisible: r.showcase_price_list_visible === true,
    showcaseSlug: r.showcase_slug || null,
  };
}





// Ziyaretçinin abonelik/güvenlik/kurulum hakkındaki tipik tereddütlerine
// (satın alma öncesi itiraz) landing page'de taranabilir bir soru-cevap
// formatında cevap yok - bu bilgiler önceden ya hiç yoktu ya da "Hakkımızda"
// kartlarının içine düz metin olarak gömülüydü.
const LANDING_FAQS = [
  { q: "Kredi kartı bilgisi girmem gerekiyor mu?", a: "Hayır. Kayıt olurken kart bilgisi istenmez, erken erişim aşamasında kullanım tamamen ücretsizdir." },
  { q: "Verilerim ne kadar güvende?", a: "Her hesap yalnızca kendi kayıtlarına erişebilir (satır bazlı erişim kuralları) - başka bir işletmenin verisine teknik olarak erişim mümkün değildir. Veriler KVKK'ya uygun işlenir, asla üçüncü taraflarla paylaşılmaz." },
  { q: "Kuruluma ne kadar zaman ayırmam gerekiyor?", a: "Kayıt olduktan sonra sektörünüzü seçip ilk müşteri ve teklif/randevu kaydınızı birkaç dakikada girebilirsiniz - isterseniz \"Örnek verilerle başla\" seçeneğiyle sektörünüze uygun demo verilerle dolu bir panoyu tek tıkla görebilirsiniz. Ayrı bir kurulum veya eğitim süreci gerekmez." },
  { q: "Excel'deki mevcut müşteri/kayıt listemi Binerly'ye taşıyabilir miyim?", a: "Evet - Müşteriler ve Teklifler/Randevular gibi ekranlardaki \"İçe Aktar\" butonuyla mevcut Excel/CSV dosyanızı yükleyip tüm kayıtlarınızı tek seferde aktarabilirsiniz, elle tek tek girmenize gerek kalmaz." },
  { q: "Kullanmayı öğrenmek zor mu, teknik bilgi gerekir mi?", a: "Hayır - Binerly günlük kullanılan basit programlar kadar sade olacak şekilde tasarlandı. Sektörünüzü seçtiğinizde arayüz otomatik şekillenir, ekranın içindeki Yardım bölümünden anlık soru sorabilirsiniz." },
  { q: "Ekip arkadaşlarımla birlikte kullanabilir miyim?", a: "Evet, işletme sahibi dahil 5 kullanıcıya kadar takım üyesi davet edebilirsiniz - herkes aynı müşteri/teklif/randevu verisini görüp güncelleyebilir. Daha büyük bir ekibiniz varsa bize ulaşın." },
  { q: "Sadece benim sektörüme mi uygun, yoksa genel bir CRM mi?", a: "Binerly genel bir CRM'dir ama sektörünüzü seçtiğinizde (Güzellik & Bakım, Sağlık/Klinik, Emlak, Spor Merkezi ve daha fazlası) form alanları, aşama isimleri ve randevu/üyelik gibi özellikler otomatik olarak sektörünüze göre şekillenir." },
];

function LandingFaq() {
  const [openIndex, setOpenIndex] = useState(null);
  return (
    <div style={{ maxWidth: 720, margin: "0 auto" }}>
      {LANDING_FAQS.map((item, i) => {
        const open = openIndex === i;
        return (
          <div key={item.q} style={{ borderBottom: "1px solid var(--border)" }}>
            <button
              type="button"
              onClick={() => setOpenIndex(open ? null : i)}
              style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, background: "none", border: "none", padding: "16px 4px", textAlign: "left", cursor: "pointer" }}
            >
              <span style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary)" }}>{item.q}</span>
              <i className={`ti ${open ? "ti-chevron-up" : "ti-chevron-down"}`} style={{ color: "var(--text-secondary)", flexShrink: 0 }} aria-hidden="true"></i>
            </button>
            {open && (
              <p style={{ margin: "0 0 16px", fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.7 }}>{item.a}</p>
            )}
          </div>
        );
      })}
    </div>
  );
}

// Sektörler bölümünde dil değişimi örneği olarak öne çıkarılan 4 sektör - alttaki
// tam listede (SECTOR_PRESETS) TEKRAR görünmesinler diye oradan filtrelenirler.
const SECTOR_FEATURED_IDS = new Set(["guzellik_bakim", "spor_merkezi", "uretim_satis", "otel"]);

// Hero'daki sektör sekmeleri gerçek dealWordKind/stageLabel eşlemesini
// kullanıyor - "her sektöre göre şekillenir" iddiasını soyut laf olarak değil,
// sekme değişince başlık/aşama adı/ton gerçekten değişerek somut gösteriyor.
const HERO_SECTOR_DEMOS = [
  {
    sectorId: "guzellik_bakim",
    headerTitle: "Randevu Takvimi",
    listLabel: "Bugünkü Randevular",
    deals: [
      { name: "Ayşe Yılmaz", title: "Lazer Epilasyon Randevusu", value: "₺1.200", stage: "teklif" },
      { name: "Deniz Kaya", title: "Saç Bakım Randevusu", value: "₺450", stage: "kazanildi" },
    ],
  },
  {
    sectorId: "saglik_klinik",
    headerTitle: "Hasta Takip Sistemi",
    listLabel: "Bekleyen Muayeneler",
    deals: [
      { name: "Onur Demirtaş", title: "Diş İmplant Tedavisi", value: "₺18.000", stage: "teklif" },
      { name: "Aslı Yıldırım", title: "Genel Check-up", value: "₺2.400", stage: "kazanildi" },
    ],
  },
  {
    sectorId: "spor_merkezi",
    headerTitle: "Üyelik Takibi",
    listLabel: "Yeni Üyelik Başvuruları",
    deals: [
      { name: "Elif Toprak", title: "PT Paketi Görüşmesi", value: "₺2.800", stage: "muzakere" },
      { name: "Mehmet Kaya", title: "Spor Salonu Üyeliği", value: "₺3.500/ay", stage: "kazanildi" },
    ],
  },
  {
    sectorId: "otel",
    headerTitle: "Rezervasyon Defteri",
    listLabel: "Gelen Rezervasyonlar",
    deals: [
      { name: "Can Yıldız", title: "Aile Odası Talebi", value: "₺6.500", stage: "muzakere" },
      { name: "Zeynep Arslan", title: "Deluxe Oda Rezervasyonu", value: "₺4.200", stage: "kazanildi" },
    ],
  },
  {
    sectorId: "uretim_satis",
    headerTitle: "Satış Boru Hattı",
    listLabel: "Görüşme Bekleyenler",
    deals: [
      { name: "Akın İnşaat", title: "Ofis Malzemesi Teklifi", value: "₺180.000", stage: "teklif" },
      { name: "Ege Tekstil", title: "Toplu Tekstil Siparişi", value: "₺220.000", stage: "kazanildi" },
    ],
  },
  {
    sectorId: "emlak",
    headerTitle: "Emlak Portföyü",
    listLabel: "Aktif Görüşmeler",
    deals: [
      { name: "Cem Arslan", title: "3+1 Daire Satışı", value: "₺2.850.000", stage: "muzakere" },
      { name: "Buse Kılıç", title: "Kiralık Ofis Görüşmesi", value: "₺45.000/yıl", stage: "kazanildi" },
    ],
  },
];

// STAGE_TONES'un (Sectors.jsx) beş tonu (default/accent/warning/success/danger)
// için koyu kart zemininde okunaklı renk karşılıkları.
const HERO_STAGE_TONE_COLORS = {
  default: { bg: "rgba(148,167,187,0.18)", color: "#c3d7ec" },
  accent: { bg: "rgba(56,138,221,0.18)", color: "#7fb3e8" },
  warning: { bg: "rgba(251,146,60,0.18)", color: "#fdba74" },
  success: { bg: "rgba(52,211,153,0.18)", color: "#6ee7b7" },
  danger: { bg: "rgba(248,113,113,0.18)", color: "#fca5a5" },
};

function LandingHeroPipeline({ onDark = false }) {
  const [sectorIndex, setSectorIndex] = useState(0);
  const demo = HERO_SECTOR_DEMOS[sectorIndex];
  const preset = SECTOR_PRESETS.find((p) => p.id === demo.sectorId);
  const confirmed = demo.deals[demo.deals.length - 1];
  const confirmedLabel = stageLabel(confirmed.stage, undefined, demo.sectorId);

  return (
    <div style={{ flex: 1, minWidth: 280 }}>
      <p style={{ textAlign: "center", fontSize: 13, fontWeight: 600, color: onDark ? "#bcd8f5" : "var(--text-accent)", margin: "0 0 12px" }}>
        Sektörünüzü seçin, arayüzün nasıl şekillendiğini görün
      </p>
      <div style={{ display: "flex", gap: 6, justifyContent: "center", flexWrap: "wrap", marginBottom: 14 }}>
        {HERO_SECTOR_DEMOS.map((d, i) => {
          const p = SECTOR_PRESETS.find((s) => s.id === d.sectorId);
          const active = i === sectorIndex;
          return (
            <button
              key={d.sectorId}
              onClick={() => setSectorIndex(i)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                background: onDark
                  ? active
                    ? "#fff"
                    : "rgba(255,255,255,0.12)"
                  : active
                    ? "var(--fill-accent)"
                    : "var(--surface-1)",
                color: onDark
                  ? active
                    ? "#0c2540"
                    : "#eaf3fc"
                  : active
                    ? "var(--on-accent)"
                    : "var(--text-primary)",
                border: onDark
                  ? active
                    ? "1px solid #fff"
                    : "1px solid rgba(255,255,255,0.28)"
                  : active
                    ? "1px solid var(--fill-accent)"
                    : "1px solid var(--border)",
                boxShadow: "none",
                borderRadius: 20,
                padding: "6px 12px",
                fontSize: 12.5,
                fontWeight: 600,
                transition: "background 0.15s ease, color 0.15s ease, border-color 0.15s ease",
              }}
            >
              <i className={`ti ${p.icon}`} style={{ fontSize: 13 }} aria-hidden="true"></i>
              {p.label}
            </button>
          );
        })}
      </div>
      {/* Mockup — sektör sekmesine göre değişen boru hattı önizlemesi. Sahte
          tarayıcı çerçevesi/blur efekti/sürekli zıplayan rozet yok - "AI
          şablonu" hissi veren o tür öğeler bilinçli olarak kullanılmadı. */}
      <div style={{ position: "relative", paddingBottom: 24 }}>
        <div
          key={demo.sectorId}
          className="landing-fade-in"
          style={{
            background: "#0c2540",
            borderRadius: 16,
            padding: "1.25rem",
            border: onDark ? "1px solid rgba(255,255,255,0.1)" : "none",
            boxShadow: onDark
              ? "0 30px 70px rgba(4,20,40,0.45)"
              : "0 20px 60px rgba(12,37,64,0.2)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, paddingBottom: 12, borderBottom: "1px solid #1e3a5c" }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: "#fff" }}>{demo.headerTitle}</span>
            <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span className="landing-live-dot" style={{ width: 6, height: 6, borderRadius: "50%", background: "#3ddc84", display: "inline-block" }} />
              <span style={{ fontSize: 10, fontWeight: 700, color: "#7fb3e8", letterSpacing: 0.4, textTransform: "uppercase" }}>Canlı</span>
            </span>
          </div>
          <div style={{ background: "#132b47", borderRadius: 12, padding: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0 4px", marginBottom: 8 }}>
              <span style={{ fontSize: 11.5, fontWeight: 600, color: "#c3d7ec" }}>{demo.listLabel}</span>
              <span style={{ background: "#1a3a5c", color: "#7fb3e8", fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 20 }}>{demo.deals.length}</span>
            </div>
            {demo.deals.map((d) => {
              const label = stageLabel(d.stage, undefined, demo.sectorId);
              const tone = HERO_STAGE_TONE_COLORS[stageTone(d.stage)];
              return (
                <div key={d.name} style={{ background: "#fff", borderRadius: 10, padding: "10px 12px", marginBottom: 8 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, marginBottom: 4 }}>
                    <span style={{ fontSize: 12.5, fontWeight: 700, color: "#0c2540" }}>{d.title}</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: "#185fa5", whiteSpace: "nowrap" }}>{d.value}</span>
                  </div>
                  <div style={{ fontSize: 11, color: "#7c93a8", marginBottom: 8 }}>{d.name} · {preset.label}</div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: 9.5, fontWeight: 700, padding: "2px 8px", borderRadius: 20, background: tone.bg, color: tone.color }}>{label}</span>
                    <div style={{ width: 20, height: 20, borderRadius: "50%", background: "#e6f1fb", color: "#185fa5", fontSize: 10, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}>
                      {d.name[0]}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        {/* Sabit (zıplamayan) onay rozeti - sürekli bounce animasyonu klasik "AI şablonu"
            imzası olduğu için bilinçli olarak kullanılmadı. */}
        <div key={`${demo.sectorId}-confirmed`} className="landing-fade-in" style={{ position: "absolute", left: 8, bottom: 0, background: "#fff", borderRadius: 12, padding: "10px 14px", boxShadow: "0 12px 30px rgba(12,37,64,0.18)", border: "1px solid #e1e8f0", display: "flex", alignItems: "center", gap: 10, maxWidth: 220 }}>
          <div style={{ width: 32, height: 32, borderRadius: "50%", background: "#e7f9ef", color: "#16a34a", display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}>
            <i className="ti ti-circle-check" style={{ fontSize: 17 }} aria-hidden="true"></i>
          </div>
          <div>
            <div style={{ fontSize: 10.5, color: "#7c93a8" }}>{confirmedLabel}</div>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: "#0c2540" }}>{confirmed.name} · {confirmed.value}</div>
          </div>
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center", marginTop: 16 }}>
        {[
          { icon: "ti-calendar-event", label: "Randevu Takvimi" },
          { icon: "ti-credit-card", label: "Ödeme Tahsilatı" },
          { icon: "ti-address-book", label: "Müşteri Portalı" },
          { icon: "ti-message-circle", label: "Mesajlaşma" },
          { icon: "ti-package", label: "Stok & Malzeme" },
          { icon: "ti-users-group", label: "Takım Yönetimi" },
          { icon: "ti-clock", label: "Kişi & Cihaz Müsaitliği" },
        ].map((m) => (
          <span
            key={m.label}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              background: onDark ? "rgba(255,255,255,0.1)" : "#fff",
              border: onDark ? "1px solid rgba(255,255,255,0.2)" : "1px solid #e1e8f0",
              borderRadius: 20,
              padding: "6px 12px",
              fontSize: 12,
              color: onDark ? "#eaf3fc" : "#0c2540",
            }}
          >
            <i className={`ti ${m.icon}`} style={{ fontSize: 13, color: onDark ? "#8fc6f5" : "#185fa5" }} aria-hidden="true"></i>
            {m.label}
          </span>
        ))}
      </div>
    </div>
  );
}

// Hero altındaki bölümler sayfa yüklenirken değil, kullanıcı gerçekten o
// noktaya kaydırdığında beliriyor - hero'daki fade-in'le aynı sakin his,
// ama scroll'a bağlı. IntersectionObserver ile sadece bir kez tetiklenir,
// tekrar yukarı kaydırılınca kaybolmaz (dikkat dağıtan bir "AI şablonu"
// jimmick'i değil, tek seferlik bir giriş).
function useScrollReveal() {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.15, rootMargin: "0px 0px -60px 0px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, visible];
}

function ScrollReveal({ children, className, delay, style, ...rest }) {
  const [ref, visible] = useScrollReveal();
  const cls = ["landing-reveal", visible && "landing-reveal-visible", className].filter(Boolean).join(" ");
  return (
    <div ref={ref} className={cls} style={{ ...style, transitionDelay: delay ? `${delay}ms` : undefined }} {...rest}>
      {children}
    </div>
  );
}

function LandingPage() {
  const [authModal, setAuthModal] = useState(null);
  // Navbar hero'nun koyu mavi degrade zemini üzerindeyken şeffaf + beyaz
  // yazı; sayfa birazcık kaydırılınca (aşağıdaki açık içeriğin üzerine
  // gelince) düz beyaz zemine + koyu yazıya döner (Zoom/Stripe deseni).
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  const navLink = { color: scrolled ? "var(--text-primary)" : "rgba(255,255,255,0.92)", fontWeight: 500, fontSize: 14, textDecoration: "none" };

  return (
    <div style={{ minHeight: "100vh", background: "transparent", position: "relative" }}>
      <TrackingScripts />
      {authModal && <AuthModal initialMode={authModal} onClose={() => setAuthModal(null)} />}

      {/* Navbar */}
      <nav
        className="landing-navbar"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 2rem",
          height: 64,
          background: scrolled ? "var(--surface-1)" : "transparent",
          borderBottom: scrolled ? "1px solid var(--border)" : "1px solid transparent",
          boxShadow: scrolled ? "var(--shadow-sm)" : "none",
          position: "sticky",
          top: 0,
          zIndex: 100,
          transition: "background 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease",
        }}
      >
        <div onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
          <img src="/favicon.svg" alt="Binerly" style={{ width: 39, height: 39 }} />
          <span style={{ fontWeight: 700, fontSize: 18, color: scrolled ? "var(--text-primary)" : "#fff" }}>Binerly</span>
        </div>
        <div style={{ display: "flex", gap: 28, alignItems: "center" }}>
          <div className="landing-nav-links" style={{ display: "flex", gap: 24 }}>
            <a href="#ozellikler" style={navLink}>Hizmetlerimiz</a>
            <a href="#sektorler" style={navLink}>Sektörler</a>
            <a href="#neden-binerly" style={navLink}>Neden Binerly?</a>
            <a href="#hakkimizda" style={navLink}>Hakkımızda</a>
            <a href="/blog" style={navLink}>Blog</a>
          </div>
          <div className="landing-nav-actions" style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <button className="landing-nav-login" onClick={() => setAuthModal("login")} style={{ background: "none", border: "none", color: scrolled ? "var(--text-accent)" : "#fff", fontWeight: 600, fontSize: 14, cursor: "pointer", padding: "8px 12px", boxShadow: "none" }}>
              Giriş Yap
            </button>
            <button className="landing-nav-cta" onClick={() => setAuthModal("register")} style={{ background: scrolled ? "var(--fill-accent)" : "#fff", color: scrolled ? "var(--on-accent)" : "#0c2540", border: "none", borderRadius: 8, padding: "8px 18px", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>
              Ücretsiz Kullan
            </button>
          </div>
        </div>
      </nav>

      {/* Hero - tam genişlik koyu mavi degrade bölüm. marginTop:-64 +
          paddingTop:64 ile sticky navbar'ın altından kayar (navbar şeffafken
          üstünde durur). İçerik kadar uzar (sabit yükseklik yok - mobilde de
          doğru). Alt %14'lük şerit sayfa zeminine (var(--bg)) sönümlenir,
          altındaki açık içerikle sert bir çizgi olmasın. */}
      <div
        style={{
          marginTop: -64,
          paddingTop: 64,
          background:
            "linear-gradient(180deg, transparent 84%, var(--bg) 100%), linear-gradient(140deg, #0a2743 0%, #124a86 55%, #1f6bb4 100%)",
        }}
      >
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "3rem 2rem 7rem", display: "flex", alignItems: "flex-start", gap: "4rem", flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 300 }}>
          <div style={{ display: "inline-block", background: "rgba(255,255,255,0.14)", color: "#eaf3fc", fontSize: 12, fontWeight: 600, padding: "4px 12px", borderRadius: 20, marginBottom: 20, border: "1px solid rgba(255,255,255,0.22)" }}>
            Sektörünüze Özel Takip Sistemi
          </div>
          <h1 style={{ fontSize: "clamp(2rem, 4vw, 3rem)", fontWeight: 800, color: "#fff", lineHeight: 1.2, margin: "0 0 1.25rem" }}>
            KOBİ'ler için{" "}
            <span style={{ color: "#8fc6f5" }}>Akıllı İş Takip</span>{" "}
            Sistemi
          </h1>
          <p style={{ fontSize: 17, color: "rgba(255,255,255,0.82)", lineHeight: 1.7, margin: "0 0 2rem", maxWidth: 480 }}>
            Müşteri veya danışan takibi, teklif, randevu ya da üyelik süreci, destek ve müşterinizin kendi portalı - hepsi bir arada, sektörünüze göre şekillenen tek bir sistemde.
          </p>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <button onClick={() => setAuthModal("register")} style={{ background: "#fff", color: "#0c2540", border: "none", borderRadius: 8, padding: "13px 28px", fontWeight: 700, fontSize: 15, cursor: "pointer", boxShadow: "0 12px 30px rgba(4,20,40,0.28)" }}>
              Ücretsiz Kullanmaya Başla →
            </button>
            <button onClick={() => setAuthModal("login")} style={{ background: "rgba(255,255,255,0.10)", color: "#fff", border: "1.5px solid rgba(255,255,255,0.45)", borderRadius: 8, padding: "13px 28px", fontWeight: 600, fontSize: 15, cursor: "pointer" }}>
              Giriş Yap
            </button>
          </div>
          <p style={{ fontSize: 13, color: "#bcd8f5", fontWeight: 600, margin: "12px 0 0" }}>
            Kart bilgisi gerekmez. Erken erişim aşamasındayız, şu an için tamamen ücretsiz.
          </p>
          <p style={{ fontSize: 13, color: "rgba(255,255,255,0.7)", margin: "6px 0 0" }}>
            💬 Sizi dinliyoruz - talepleriniz doğrultusunda hızla geliştiriyoruz.
          </p>
        </div>

        <LandingHeroPipeline onDark />
      </div>
      </div>

      {/* Özellikler */}
      <div id="ozellikler" style={{ maxWidth: 1100, margin: "0 auto", padding: "4rem 2rem 3rem" }}>
        <ScrollReveal className="landing-section-head" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 24, flexWrap: "wrap", marginBottom: "2.5rem" }}>
          <div>
            <p style={{ fontSize: 12.5, fontWeight: 700, color: "var(--text-accent)", letterSpacing: 0.6, textTransform: "uppercase", margin: "0 0 10px" }}>Özellikler</p>
            <h2 style={{ fontSize: "1.75rem", fontWeight: 700, color: "var(--text-primary)", margin: 0, maxWidth: 460 }}>
              İşinizi büyütmek için ihtiyacınız olan her şey
            </h2>
          </div>
          <p style={{ fontSize: 14, color: "var(--text-secondary)", maxWidth: 300, margin: 0, lineHeight: 1.6 }}>
            Üç ana süreç işin omurgasını taşır, geri kalanı onları tamamlar.
          </p>
        </ScrollReveal>

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
              desc: "Müşterileriniz kendi hesaplarıyla giriş yapıp destek taleplerini açabilir, sizinle mesajlaşabilir ve teklif/randevu/üyelik/rezervasyon kayıtlarının durumunu görebilir. Sizin tanımladığınız müsaitlik saatlerinden kendi randevusunu alabilir - siz her yeni işlemde anında bildirim alırsınız. Telefon trafiğinizi azaltır.",
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
            <ScrollReveal
              key={f.id}
              id={f.id}
              className="landing-feature-row"
              delay={i * 100}
              style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem 2rem", alignItems: "flex-start", background: "var(--surface-1)", border: "1px solid var(--border)", borderRadius: 16, padding: "1.75rem 2rem", boxShadow: "var(--shadow-sm)", flexDirection: i % 2 === 1 ? "row-reverse" : "row", scrollMarginTop: 80 }}
            >
              <div style={{ flex: "none", width: 96, fontSize: 54, fontWeight: 800, color: "var(--bg-accent)", lineHeight: 1, textAlign: i % 2 === 1 ? "right" : "left" }}>{f.num}</div>
              <div style={{ flex: 1, minWidth: 260 }}>
                <h3 style={{ fontSize: 19, fontWeight: 700, color: "var(--text-primary)", margin: "0 0 10px" }}>{f.title}</h3>
                <p style={{ fontSize: 14.5, color: "var(--text-secondary)", margin: "0 0 12px", lineHeight: 1.7, maxWidth: 620 }}>{f.desc}</p>
                <p style={{ fontSize: 12.5, color: "var(--text-muted)", margin: 0, fontWeight: 600 }}>{f.tags.join("   ·   ")}</p>
              </div>
            </ScrollReveal>
          ))}
        </div>

        {/* Geri kalanı: kompakt kutu ızgarası */}
        <ScrollReveal style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16, marginTop: 32 }}>
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
            <div key={f.id} id={f.id} style={{ display: "flex", gap: 14, background: "var(--surface-1)", border: "1px solid var(--border)", borderRadius: 12, padding: "1.25rem 1.4rem", boxShadow: "var(--shadow-sm)", scrollMarginTop: 80 }}>
              <i className={`ti ${f.icon}`} style={{ fontSize: 19, color: "var(--text-accent)", flex: "none", marginTop: 2 }} aria-hidden="true"></i>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <h3 style={{ fontSize: 14.5, fontWeight: 700, color: "var(--text-primary)", margin: "0 0 5px" }}>{f.title}</h3>
                  {f.badge && (
                    <span style={{ fontSize: 10, fontWeight: 700, color: "var(--text-accent)", background: "var(--bg-accent)", padding: "2px 8px", borderRadius: 20, marginBottom: 5 }}>{f.badge}</span>
                  )}
                </div>
                <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: 0, lineHeight: 1.6 }}>{f.desc}</p>
              </div>
            </div>
          ))}
        </ScrollReveal>
      </div>

      {/* Sektörler */}
      <div id="sektorler" style={{ maxWidth: 1100, margin: "0 auto", padding: "1rem 2rem 3rem" }}>
        <ScrollReveal>
          <h2 style={{ textAlign: "center", fontSize: "1.75rem", fontWeight: 700, color: "var(--text-primary)", margin: "0 0 0.75rem" }}>
            Hangi işi yapıyorsanız, dili de ona göre değişir
          </h2>
          <p style={{ textAlign: "center", fontSize: 15, color: "var(--text-secondary)", maxWidth: 640, margin: "0 auto 2rem" }}>
            Sektörünüzü seçtiğinizde aşama isimleri, alanlar ve hatta "teklif mi, randevu mu, üyelik mi" dediğimiz otomatik ayarlanır - herkese aynı kalıp değil, işinize uygun bir sistem.
          </p>
        </ScrollReveal>

        {/* Sistemde gerçekten var olan 4 farklı dealWordKind() terimi (randevu/
            üyelik/rezervasyon/teklif) - Stitch mockup'ındaki "Portföy"/"Proje" gibi
            etiketler koddaki eşlemede yok, bu yüzden sadece gerçekte üretilen 4
            terim kullanıldı. Dört sektörün rengi (teal/mor/mavi/amber) bilinçli
            olarak farklılaştırma amaçlı sabit tutuldu, tema token'ı değil. Bu 4
            sektör alttaki tam listede TEKRARLANMASIN diye SECTOR_FEATURED_IDS ile
            oradan filtreleniyor. */}
        <ScrollReveal style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, maxWidth: 880, margin: "0 auto 1.5rem" }}>
          {[
            { sector: "Güzellik & Bakım", icon: "ti-scissors", term: "Randevu", color: "#0d9488", bg: "#ccfbf1" },
            { sector: "Spor Merkezi", icon: "ti-barbell", term: "Üyelik", color: "#7c3aed", bg: "#ede9fe" },
            { sector: "Üretim / Satış", icon: "ti-truck-delivery", term: "Teklif", color: "#185fa5", bg: "#e6f1fb" },
            { sector: "Otel", icon: "ti-bed", term: "Rezervasyon", color: "#b45309", bg: "#fef3c7" },
          ].map((s) => (
            <div key={s.sector} style={{ background: "var(--surface-1)", border: "1px solid var(--border)", borderRadius: 12, padding: "1.25rem 1rem", display: "flex", flexDirection: "column", alignItems: "center", gap: 8, textAlign: "center" }}>
              <div style={{ width: 44, height: 44, borderRadius: "50%", background: s.bg, color: s.color, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <i className={`ti ${s.icon}`} style={{ fontSize: 21 }} aria-hidden="true"></i>
              </div>
              <span style={{ fontSize: 13.5, fontWeight: 700, color: "var(--text-primary)" }}>{s.sector}</span>
              <span style={{ fontSize: 12.5, color: "var(--text-muted)", display: "flex", alignItems: "center", gap: 5 }}>
                Satış <i className="ti ti-arrow-right" style={{ fontSize: 13 }} aria-hidden="true"></i>
                <span style={{ color: s.color, fontWeight: 700 }}>{s.term}</span>
              </span>
            </div>
          ))}
        </ScrollReveal>
        <p style={{ textAlign: "center", fontSize: 13, color: "var(--text-muted)", margin: "0 0 2rem", fontWeight: 500 }}>
          ...ve 7 farklı sektör için daha hazır şablonlar
        </p>
        <ScrollReveal style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 }}>
          {SECTOR_PRESETS.filter((s) => s.id !== "genel" && !SECTOR_FEATURED_IDS.has(s.id)).map((s) => (
            <div key={s.id} style={{ background: "var(--surface-1)", border: "1px solid var(--border)", borderRadius: 12, padding: "1rem", display: "flex", alignItems: "center", gap: 10 }}>
              <i className={`ti ${s.icon}`} style={{ fontSize: 20, color: "var(--text-accent)", flex: "none" }} />
              <span style={{ fontSize: 13.5, fontWeight: 600, color: "var(--text-primary)" }}>{s.label}</span>
            </div>
          ))}
        </ScrollReveal>
        <p style={{ textAlign: "center", fontSize: 13, color: "var(--text-muted)", margin: "1.5rem 0 0" }}>
          Listede yoksa da sorun değil - "Genel" ile başlayıp kendi özel alanlarınızı ekleyebilirsiniz.
        </p>
      </div>

      {/* Neden Binerly */}
      <div id="neden-binerly" style={{ background: "transparent", borderTop: "1px solid var(--border)", borderBottom: "1px solid var(--border)", scrollMarginTop: 64 }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", padding: "4rem 2rem" }}>
          <ScrollReveal>
            <div style={{ display: "inline-block", background: "var(--bg-accent)", color: "var(--text-accent)", fontSize: 12, fontWeight: 600, padding: "4px 12px", borderRadius: 20, marginBottom: 16 }}>
              Neden Binerly?
            </div>
            <h2 style={{ fontSize: "1.75rem", fontWeight: 700, color: "var(--text-primary)", margin: "0 0 1.25rem", maxWidth: 640 }}>
              Karmaşık CRM'ler değil, sade bir sistem
            </h2>
            <p style={{ maxWidth: 680, fontSize: 16, color: "var(--text-secondary)", lineHeight: 1.8, margin: "0 0 2.5rem" }}>
              Türkiye'deki küçük ve orta ölçekli işletmelerin çoğu müşteri takibini hâlâ Excel, WhatsApp ve kağıt notlarla yürütüyor; kurumsal CRM'ler ise bu ölçek için genelde gereğinden karmaşık kalıyor. Binerly, büyük şirketlerin sahip olduğu takip gücünü KOBİ'ler için sadeleştiriyor.
            </p>
          </ScrollReveal>

          <ScrollReveal style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 16, marginBottom: "2.5rem" }}>
            {[
              ["%9,9", "10-49 çalışanlı işletmelerin CRM kullanma oranı"],
              ["%18,4", "50-249 çalışanlı işletmelerde bu oran"],
              ["%90+", "Küçük işletmelerin hâlâ sistemsiz çalıştığı tahmini pay"],
            ].map(([val, cap]) => (
              <div key={cap} style={{ background: "var(--surface-1)", border: "1px solid var(--border)", borderRadius: 12, padding: "1.25rem" }}>
                <div style={{ fontSize: 28, fontWeight: 800, color: "var(--text-accent)" }}>{val}</div>
                <div style={{ fontSize: 12.5, color: "var(--text-secondary)", marginTop: 6, lineHeight: 1.5 }}>{cap}</div>
              </div>
            ))}
          </ScrollReveal>
          <p style={{ fontSize: 11.5, color: "var(--text-muted)", margin: "-14px 0 2.5rem" }}>
            Kaynak: TÜİK, Girişimlerde Bilişim Teknolojileri Kullanım Araştırması, 2025
          </p>

          <ScrollReveal style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 16 }}>
            {[
              ["ti-list-details", "Dağınıklık", "Müşteri bilgisi telefonda, WhatsApp'ta, Excel'de ve kafanızda - dört farklı yerde."],
              ["ti-eye-off", "Kör nokta", "Bir çalışan izinliyken veya ayrılınca, bildiği müşteri geçmişi de onunla gidiyor."],
              ["ti-clock-x", "Kaçan takip", "\"Yarın ararım\" dediğiniz teklifi unutup fırsatı rakibe kaptırıyorsunuz."],
              ["ti-certificate", "Kurumsal görünmeme", "Elle yazılmış teklif, büyük müşteriye karşı güven vermiyor."],
            ].map(([icon, title, desc]) => (
              <div key={title} style={{ background: "var(--surface-1)", border: "1px solid var(--border)", borderRadius: 12, padding: "1.25rem" }}>
                <i className={`ti ${icon}`} style={{ fontSize: 22, color: "var(--text-accent)", display: "block", marginBottom: 10 }} aria-hidden="true"></i>
                <h3 style={{ fontSize: 14.5, fontWeight: 700, color: "var(--text-primary)", margin: "0 0 6px" }}>{title}</h3>
                <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: 0, lineHeight: 1.6 }}>{desc}</p>
              </div>
            ))}
          </ScrollReveal>
        </div>
      </div>

      {/* Hakkımızda */}
      <div id="hakkimizda" style={{ background: "var(--surface-1)", borderTop: "1px solid var(--border)", borderBottom: "1px solid var(--border)", scrollMarginTop: 64 }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", padding: "4rem 2rem" }}>
          <ScrollReveal>
            <h2 style={{ textAlign: "center", fontSize: "1.75rem", fontWeight: 700, color: "var(--text-primary)", margin: "0 0 1.25rem" }}>
              Hakkımızda
            </h2>
            <p style={{ maxWidth: 720, margin: "0 auto 2.5rem", fontSize: 16, color: "var(--text-secondary)", lineHeight: 1.8, textAlign: "center" }}>
              Binerly'yi, KOBİ'lerin gerçek gündelik dertlerinden yola çıkarak kurduk: dağınık Excel tabloları, kaybolan müşteri notları, takip edilemeyen teklifler. Küçük ve orta ölçekli işletmelerin, kurumsal şirketler kadar güçlü ama onlar kadar karmaşık olmayan bir sisteme ihtiyacı olduğunu gördük.
            </p>
          </ScrollReveal>
          <ScrollReveal style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "2rem 2.5rem" }}>
            {[
              ["ti-bulb", "Misyonumuz", "KOBİ'lerin günlük operasyonel yükünü azaltıp dijitalleştirerek, zamanlarını ve zihinlerini işlerini büyütmeye, işletmelerini daha iyiye taşıyacak kararlar almaya ve müşterileriyle daha kaliteli ilişkiler kurmaya ayırabilmelerini sağlamak."],
              ["ti-telescope", "Vizyonumuz", "Türkiye'deki her KOBİ'nin, büyüklüğüne bakılmaksızın, büyük şirketlerin sahip olduğu güçlü araçlara kolay ve uygun maliyetle erişebildiği bir gelecek."],
              ["ti-shield-check", "Güvenilirlik", "Verileriniz, her hesabın yalnızca kendi kayıtlarına erişebildiği satır bazlı erişim kurallarıyla saklanır - başka bir işletmenin verisine teknik olarak erişim mümkün değildir. KVKK'ya uygun işlenir, asla üçüncü taraflarla paylaşılmaz."],
              ["ti-heart-handshake", "Sizi Dinliyoruz", "Erken erişim aşamasında olduğumuz için Binerly'yi doğrudan kullanıcılarımızın talepleriyle şekillendiriyoruz. İşinize özel eksik bir özellik veya isteğiniz olursa bize ulaşın - değerlendirip mümkün olan en kısa sürede ekleriz."],
            ].map(([icon, title, desc]) => (
              <div key={title} style={{ background: "var(--bg)", borderRadius: 12, padding: "1.5rem", border: "1px solid var(--border)" }}>
                <i className={`ti ${icon}`} style={{ fontSize: 26, color: "var(--text-accent)", display: "block", marginBottom: 12 }} aria-hidden="true"></i>
                <h3 style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)", margin: "0 0 8px" }}>{title}</h3>
                <p style={{ fontSize: 13.5, color: "var(--text-secondary)", margin: 0, lineHeight: 1.7 }}>{desc}</p>
              </div>
            ))}
          </ScrollReveal>
        </div>
      </div>

      {/* SSS */}
      <div style={{ background: "transparent", padding: "4rem 2rem" }}>
        <ScrollReveal>
          <h2 style={{ textAlign: "center", fontSize: "1.75rem", fontWeight: 700, color: "var(--text-primary)", margin: "0 0 2rem" }}>
            Sıkça Sorulan Sorular
          </h2>
          <LandingFaq />
        </ScrollReveal>
      </div>

      {/* CTA — marka rengi zemin bilerek var(--fill-accent) kullanıyor (temaya göre
          değişir ama her zaman "accent" kalır); üzerindeki metin/buton var(--on-accent)
          ile hep beyaz/ters-kontrast, hangi accent tonu olursa olsun okunaklı kalır. */}
      <div style={{ background: "var(--fill-accent)", padding: "4rem 2rem", textAlign: "center" }}>
        <ScrollReveal>
          <h2 style={{ fontSize: "1.75rem", fontWeight: 800, color: "var(--on-accent)", margin: "0 0 1rem" }}>
            İlk işletmelerden biri olun, ücretsiz kullanın
          </h2>
          <p style={{ fontSize: 16, color: "rgba(255,255,255,0.8)", margin: "0 0 2rem" }}>Kredi kartı gerekmez. Erken erişim aşamasındayız, şu an için tamamen ücretsiz.</p>
          <button onClick={() => setAuthModal("register")} style={{ background: "var(--on-accent)", color: "var(--fill-accent)", border: "none", borderRadius: 8, padding: "14px 32px", fontWeight: 700, fontSize: 16, cursor: "pointer" }}>
            Ücretsiz Hesap Oluştur
          </button>
        </ScrollReveal>
      </div>

      {/* Footer */}
      <div style={{ background: "var(--surface-1)", borderTop: "1px solid var(--border)", padding: "3rem 2rem 1.5rem" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 32 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <img src="/favicon.svg" alt="Binerly" style={{ width: 31, height: 31 }} />
              <span style={{ fontWeight: 700, fontSize: 15, color: "var(--text-accent)" }}>BINERLY</span>
            </div>
            <p style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)", margin: "0 0 8px", lineHeight: 1.4 }}>
              KOBİ müşteri ilişkileri, satış ve destek yönetimi için tek platform
            </p>
            <p style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.6, margin: 0 }}>
              Müşteri takibi, teklif ve anlaşmalar, satış sonrası destek ve müşteri bilgi sistemini tek yapıda bir araya getirir.
            </p>
          </div>
          <div>
            <p style={{ fontSize: 12, fontWeight: 700, color: "var(--text-primary)", letterSpacing: 0.5, margin: "0 0 14px" }}>ÇÖZÜMLER</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <a href="#musteri-yonetimi" style={{ fontSize: 13, color: "var(--text-secondary)", textDecoration: "none" }}>Müşteri Yönetimi</a>
              <a href="#satis-firsat" style={{ fontSize: 13, color: "var(--text-secondary)", textDecoration: "none" }}>Satış & Teklif Yönetimi</a>
              <a href="#destek" style={{ fontSize: 13, color: "var(--text-secondary)", textDecoration: "none" }}>Satış Sonrası Destek</a>
              <a href="#musteri-portali" style={{ fontSize: 13, color: "var(--text-secondary)", textDecoration: "none" }}>Kendi Müşteri Portalınız</a>
              <a href="#raporlama" style={{ fontSize: 13, color: "var(--text-secondary)", textDecoration: "none" }}>Raporlama & Analitik</a>
            </div>
          </div>
          <div>
            <p style={{ fontSize: 12, fontWeight: 700, color: "var(--text-primary)", letterSpacing: 0.5, margin: "0 0 14px" }}>HIZLI ERİŞİM</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <a href="/" style={{ fontSize: 13, color: "var(--text-secondary)", textDecoration: "none" }}>Ana Sayfa</a>
              <a href="#sektorler" style={{ fontSize: 13, color: "var(--text-secondary)", textDecoration: "none" }}>Sektörler</a>
              <a href="#hakkimizda" style={{ fontSize: 13, color: "var(--text-secondary)", textDecoration: "none" }}>Hakkımızda</a>
              <a href="/blog" style={{ fontSize: 13, color: "var(--text-secondary)", textDecoration: "none" }}>Blog</a>
              <a href="mailto:info@binerly.com" style={{ fontSize: 13, color: "var(--text-secondary)", textDecoration: "none" }}>İletişim</a>
              <a href={getPortalUrl()} style={{ fontSize: 13, color: "var(--text-secondary)", textDecoration: "none" }}>Müşteri misiniz? Giriş yapın →</a>
            </div>
          </div>
          <div>
            <p style={{ fontSize: 12, fontWeight: 700, color: "var(--text-primary)", letterSpacing: 0.5, margin: "0 0 14px" }}>YASAL</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <a href="/gizlilik" style={{ fontSize: 13, color: "var(--text-secondary)", textDecoration: "none" }}>Gizlilik Politikası</a>
              <a href="/kullanim-kosullari" style={{ fontSize: 13, color: "var(--text-secondary)", textDecoration: "none" }}>Kullanım Koşulları</a>
              <a href="/kvkk" style={{ fontSize: 13, color: "var(--text-secondary)", textDecoration: "none" }}>KVKK Aydınlatma Metni</a>
            </div>
          </div>
        </div>
        <div style={{ maxWidth: 1100, margin: "2rem auto 0", paddingTop: "1.5rem", borderTop: "1px solid var(--border)", fontSize: 13, color: "var(--text-muted)" }}>
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
  const [showcaseCampaigns, setShowcaseCampaigns] = useState([]);
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
  // Takım üyesi sayısı MAX_TEAM_SIZE (shared.jsx) ile sınırlanıyor - gerçek
  // ödeme/billing tahsilatı henüz yok, fiyatlandırma netleşmedi.
  const [activeTeamId, setActiveTeamId] = useState(undefined);
  const [pendingInvites, setPendingInvites] = useState([]);
  const [dismissedInviteIds, setDismissedInviteIds] = useState([]);
  const [acknowledgedInviteIds, setAcknowledgedInviteIds] = useState([]);
  const [showSettingsHub, setShowSettingsHub] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [globalSearchQuery, setGlobalSearchQuery] = useState("");
  const [globalSearchFocused, setGlobalSearchFocused] = useState(false);
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
  const [appointmentPrefillDateTime, setAppointmentPrefillDateTime] = useState(null);
  const [viewingCustomer, setViewingCustomer] = useState(null);
  const [emlakMatches, setEmlakMatches] = useState(null); // { deal, matches } — Gölge Avcı sonuçları
  const [listingTextDeal, setListingTextDeal] = useState(null); // İlan Metni Sihirbazı için seçili teklif
  const [panoRange, setPanoRange] = useState("tum_zamanlar");
  const [panoRangeFrom, setPanoRangeFrom] = useState("");
  const [panoRangeTo, setPanoRangeTo] = useState("");
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
  const [vitrinLink, setVitrinLink] = useState(null);
  const [showPortalLinkModal, setShowPortalLinkModal] = useState(false);
  const [quickList, setQuickList] = useState(null);
  const [initialViewTicketId, setInitialViewTicketId] = useState(null);
  const [initialChatCustomerId, setInitialChatCustomerId] = useState(null);
  const [selectedChatTicketId, setSelectedChatTicketId] = useState(null);
  const [toast, setToast] = useState(null);
  const [pushSubscribed, setPushSubscribed] = useState(false);
  const [teamMembers, setTeamMembers] = useState([]);
  const [teamRoster, setTeamRoster] = useState([]);
  const [tasks, setTasks] = useState([]);

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

  // 5651 sayılı kanun kapsamında giriş/çıkış logu için - çıkışta oturum silindikten
  // SONRA loglamaya çalışırsak Edge Function'ın istediği JWT elden gitmiş olur, bu
  // yüzden signOut() çağrılmadan HEMEN ÖNCE, oturum hâlâ geçerliyken loglanır.
  const handleSignOut = async () => {
    await supabase.functions.invoke("log-client-event", { body: { action: "logout" } }).catch(() => {});
    supabase.auth.signOut();
  };

  useSessionTimeout(session, () => {
    handleSignOut();
    alert("Oturumunuz uzun süre hareketsiz kaldığı için sona erdi. Lütfen tekrar giriş yapın.");
  });

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      if (event === "PASSWORD_RECOVERY") setShowPasswordRecovery(true);
      if (event === "SIGNED_IN") {
        supabase.functions.invoke("log-client-event", { body: { action: "login" } }).catch(() => {});
      }
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
      setShowcaseCampaigns([]);
      setStockItems([]); setPriceItemIngredients([]);
      setGroupClasses([]); setGroupClassEnrollments([]); setClassAttendanceState([]); setGroupClassWaitlist([]);
      setBusinessHours([]);
      setRoomInventory([]);
      setResources([]);
      setDealLineItems([]);
      setTasks([]);
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
      supabase.from("custom_field_defs").select("*").order("sort_order").order("created_at"),
      supabase.from("price_list_items").select("*").order("sort_order").order("name"),
      supabase.from("showcase_campaigns").select("*").order("sort_order"),
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
      supabase.from("stock_items").select("*").is("deleted_at", null).order("sort_order").order("name"),
      supabase.from("price_item_ingredients").select("*"),
      supabase.from("group_class_waitlist").select("*").order("created_at"),
      supabase.from("team_members").select("team_id").eq("member_id", session.user.id).maybeSingle(),
      supabase.from("team_invites").select("*").eq("status", "pending"),
      supabase.from("tasks").select("*").is("deleted_at", null).order("due_date"),
    ]).then(([{ data: c }, { data: d }, { data: a }, { data: pay }, { data: exp }, { data: cred }, { data: payCred }, { data: att }, { data: chMsg }, { data: t }, { data: tm }, { data: kb }, { data: cs }, { data: cfd }, { data: pli }, { data: sc }, { data: gc }, { data: gce }, { data: catt }, { data: bh }, { data: ss }, { data: slb }, { data: slr }, { data: ri }, { data: res }, { data: pdft }, { data: dli }, { data: stk }, { data: pii }, { data: gcw }, { data: myMembership }, { data: invites }, { data: tk }]) => {
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
      setShowcaseCampaigns((sc || []).filter((row) => row.user_id === ownerId).map(rowToShowcaseCampaign));
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
      setTasks((tk || []).filter((row) => row.user_id === ownerId).map(rowToTask));
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
      // Başka bir takım üyesinin eklediği/tamamladığı görevler anlık yansısın diye.
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "tasks", filter: `user_id=eq.${activeTeamId}` }, (payload) => {
        setTasks((prev) => (prev.some((x) => x.id === payload.new.id) ? prev : [...prev, rowToTask(payload.new)]));
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "tasks", filter: `user_id=eq.${activeTeamId}` }, (payload) => {
        setTasks((prev) =>
          payload.new.deleted_at
            ? prev.filter((x) => x.id !== payload.new.id)
            : prev.map((x) => (x.id === payload.new.id ? rowToTask(payload.new) : x))
        );
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

  // Tüm cascade (payments->deals->tickets->customers->group_class_enrollments->
  // attachments x2) delete_customer_cascade RPC'sinde tek bir transaction —
  // eskiden ayrı ayrı await edilen adımlardan biri (örn. payments'in owner-only
  // RLS'i) başarısız olursa önceki adımlar geri alınmıyor, son 3 adımda hiç
  // hata kontrolü yapılmıyordu (bkz. migration add_delete_customer_cascade_rpc).
  const deleteCustomer = async (id) => {
    const customer = customers.find((c) => c.id === id);
    const customerDeals = deals.filter((d) => d.customerId === id);
    const customerTickets = tickets.filter((t) => t.customerId === id);
    const dealIds = customerDeals.map((d) => d.id);
    const cascadePayments = payments.filter((p) => dealIds.includes(p.dealId));

    const { error } = await supabase.rpc("delete_customer_cascade", { p_customer_id: id });
    if (error) { notify(`Müşteri silinemedi: ${error.message}`); return; }

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

  const upsertTask = async (t) => {
    const isNew = !tasks.some((x) => x.id === t.id);
    const row = {
      id: t.id,
      user_id: activeTeamId,
      title: t.title,
      type: t.type,
      description: t.description || null,
      due_date: t.dueDate || null,
      assigned_to: t.assignedTo || null,
      customer_id: t.customerId || null,
      deal_id: t.dealId || null,
    };
    const { data, error } = await supabase.from("tasks").upsert(row).select().single();
    if (error) { notify(`Görev kaydedilemedi: ${error.message}`); return false; }
    const task = rowToTask(data);
    setTasks((prev) => (isNew ? [...prev, task] : prev.map((x) => (x.id === task.id ? task : x))));
    logAction("tasks", task.id, isNew ? "created" : "updated", `"${task.title}" görevi ${isNew ? "eklendi" : "güncellendi"}`);
    return true;
  };

  const deleteTask = async (id) => {
    const task = tasks.find((x) => x.id === id);
    const { error } = await supabase
      .from("tasks")
      .update({ deleted_at: new Date().toISOString(), deleted_batch_id: uid() })
      .eq("id", id);
    if (error) { notify(`Görev silinemedi: ${error.message}`); return; }
    setTasks((prev) => prev.filter((x) => x.id !== id));
    logAction("tasks", id, "deleted", `"${task?.title || "Görev"}" çöp kutusuna taşındı`);
  };

  const toggleTaskComplete = async (id) => {
    const task = tasks.find((x) => x.id === id);
    if (!task) return;
    const completedAt = task.completedAt ? null : new Date().toISOString();
    const { error } = await supabase.from("tasks").update({ completed_at: completedAt }).eq("id", id);
    if (error) { notify(`Görev güncellenemedi: ${error.message}`); return; }
    setTasks((prev) => prev.map((x) => (x.id === id ? { ...x, completedAt } : x)));
    logAction("tasks", id, "updated", `"${task.title}" görevi ${completedAt ? "tamamlandı" : "yeniden açıldı"}`);
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

    // appointment_start/end, bu deal gerçekten bir randevuysa (kaynak/personel
    // seçili olsun olmasın) HER ZAMAN hesaplanır - deals_resource_unit_no_overlap
    // VE deals_assigned_to_no_overlap EXCLUDE CONSTRAINT'lerinin ikisi de bu
    // iki kolondan türeyen appointment_range'e bakıyor. Önceden bu hesap sadece
    // resourceId seçiliyken yapılıyordu - kaynaksız randevularda her düzenlemede
    // appointment_start/end'i sessizce null'a çekip Aşama 1'in backfill'ini
    // siliyordu, ayrıca personel kısıtının hiç devreye girmemesine yol açıyordu.
    let resourceUnitId = null, appointmentStart = null, appointmentEnd = null;
    const resourceId = customFields.resource_id || null;
    const isAppointment = bookingModel(companySettings?.sector) === "slot" && appointmentDateTimeKey && customFields[appointmentDateTimeKey];
    if (isAppointment) {
      const start = parseAppointmentDateTime(customFields[appointmentDateTimeKey]);
      if (start) {
        const dur = Math.max(Number(customFields.duration_minutes) || 1, 1);
        const end = new Date(start.getTime() + dur * 60000);
        appointmentStart = start.toISOString();
        appointmentEnd = end.toISOString();

        // Bir kaynak (oda/cihaz) seçilmişse, atanan fiziksel birim DB
        // seviyesinde (deals_resource_unit_no_overlap EXCLUDE CONSTRAINT)
        // garanti altına alınır - api/appointment-availability.js/
        // api/lead-capture.js ile AYNI pick_free_resource_unit RPC'si (tek
        // ortak kaynak, anti-join mantığı burada tekrar yazılmıyor).
        // findAppointmentConflict zaten önden bir client-side uyarı veriyor -
        // bu RPC son savunma hattı, o kontrolü atlayan bir TOCTOU penceresini
        // kapatıyor. Personel tarafı için ayrı bir RPC gerekmiyor - assigned_to
        // zaten row'a yazılıyor, deals_assigned_to_no_overlap constraint'i
        // insert/upsert anında kendiliğinden devreye giriyor.
        if (resourceId) {
          for (let attempt = 0; attempt < 3 && !resourceUnitId; attempt++) {
            const { data: unitId } = await supabase.rpc("pick_free_resource_unit", {
              p_resource_id: resourceId, p_start: appointmentStart, p_end: appointmentEnd, p_exclude_deal_id: d.id,
            });
            if (!unitId) break;
            resourceUnitId = unitId;
          }
          if (!resourceUnitId) {
            notify("Seçtiğiniz kaynak bu saatte az önce doldu, lütfen farklı bir kaynak/saat seçin.");
            return;
          }
        }
      }
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
      resource_unit_id: resourceUnitId,
      appointment_start: appointmentStart,
      appointment_end: appointmentEnd,
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
    if (error) {
      // 23P01 = exclusion_violation - ya resourceUnitId'yi başka bir eşzamanlı
      // istek yukarıdaki kontrolden SONRA ama bu upsert'ten ÖNCE kapmış, ya da
      // aynı personele aynı saatte başka bir randevu az önce eklenmiş (DB
      // seviyesinde garanti - client-side findAppointmentConflict'i atlayan
      // bir TOCTOU penceresi). Hangi constraint patladığına göre farklı mesaj.
      if (error.code === "23P01") {
        if (error.message?.includes("deals_assigned_to_no_overlap")) {
          notify("Seçtiğiniz personel bu saatte başka bir randevuda, lütfen farklı bir personel/saat seçin.");
        } else {
          notify("Bu saat/kaynak az önce doldu, lütfen tekrar deneyin.");
        }
        return;
      }
      notify(`${DEAL_TAB_STRINGS[dealWordKind(companySettings?.sector)].columnHeader} kaydedilemedi: ${error.message}`);
      return;
    }
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
      await applyAppointmentPenaltyBurn(deal, deals);
    }
    if (deal.stage === "kaybedildi" && previousStage !== "kaybedildi" && deal.lostReason === "İşletme iptal etti") {
      await applyAppointmentCreditGrant(deal);
    }

    setShowDealForm(false);
    setEditingDeal(null);
    setAppointmentPrefillDateTime(null);
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

  // showcase_slug "<işletme-adı>-<kod>" biçiminde tutulur: <kod>, hesabın zaten
  // sahip olduğu lead_capture_token'ın ilk 6 hanesi. Böylece aynı isimli iki
  // işletme çakışmadan ikisi de linkinde adını taşır; KOBİ ismi kısaltsa/
  // değiştirse bile <kod> sabit kalır (eski isimli link kırılır ama rastgele
  // token linki hep çalışır).
  // namePart boşsa (şirket adı henüz girilmemiş) null döner - link rastgele
  // token'a düşer. Yazamıyorsa (ekip üyesi / RLS) da sessizce null döner.
  const buildAndSaveShowcaseSlug = async (token, namePartOverride) => {
    const namePart = namePartOverride ?? slugify(companySettings?.companyName || "");
    const hex = (token || "").replace(/-/g, "");
    if (!namePart || !hex) return null;
    // 6 hane çakışırsa (aynı isim + aynı ilk 6 hane, neredeyse imkansız) tüm
    // token'ı kod olarak kullan - kesin benzersiz.
    for (const len of [6, hex.length]) {
      const candidate = `${namePart}-${hex.slice(0, len)}`;
      const { data, error } = await supabase
        .from("company_settings")
        .upsert({ user_id: activeTeamId, showcase_slug: candidate })
        .select("showcase_slug")
        .single();
      if (!error) {
        setCompanySettings((prev) => ({ ...(prev || {}), showcaseSlug: data.showcase_slug }));
        return data.showcase_slug;
      }
      if (error.code !== "23505") return null;
    }
    return null;
  };

  // Şirket başına sabit link/QR — müşteri kendi bilgisini bırakır, KOBİ elle
  // girmez. approval_token'dan farklı olarak deal'e değil company_settings'e bağlı.
  // pathPrefix üç herkese açık rotadan birini seçer (lead / randevu-al / vitrin);
  // üçü de api/lead-capture.js'te aynı company_settings satırına çözülür.
  // showcase_slug varsa (şirket adı belliyse ilk link açılışında otomatik
  // üretilir) rastgele UUID token yerine işletme adını taşıyan okunabilir adres
  // kullanılır - token her hâlükârda saklanır, geri dönüş yolu (bkz.
  // sql/2026-08-19_showcase_slug.sql).
  const generateLeadCaptureLink = async (pathPrefix = "lead") => {
    let token = companySettings?.leadCaptureToken;
    if (!token) {
      token = uid();
      // upsert (update değil) — company_settings satırı henüz hiç oluşmamış olabilir
      // (ilk kez Şirket Bilgileri kaydedilmeden), sadece bu sütunu dokunarak yazar.
      const { error } = await supabase.from("company_settings").upsert({ user_id: activeTeamId, lead_capture_token: token });
      if (error) { notify(`Link oluşturulamadı: ${error.message}`); return null; }
      setCompanySettings((prev) => ({ ...(prev || {}), leadCaptureToken: token }));
    }
    let slug = companySettings?.showcaseSlug;
    if (!slug) slug = await buildAndSaveShowcaseSlug(token);
    return `https://binerly.com/${pathPrefix}/${slug || token}`;
  };

  // Ayarlar → İşletme adresi: KOBİ sadece isim kısmını düzenler, "-<kod>" eki
  // otomatik eklenir. lead_capture_token yoksa önce o üretilir.
  const saveShowcaseSlug = async (namePart) => {
    let token = companySettings?.leadCaptureToken;
    if (!token) {
      token = uid();
      const { error } = await supabase.from("company_settings").upsert({ user_id: activeTeamId, lead_capture_token: token });
      if (error) return { error: error.message };
      setCompanySettings((prev) => ({ ...(prev || {}), leadCaptureToken: token }));
    }
    const slug = await buildAndSaveShowcaseSlug(token, namePart);
    if (!slug) return { error: "Bu adres kullanılamıyor, ismi biraz değiştirip tekrar deneyin." };
    return { success: true };
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
    if (deleteError) { notify(`Bağlantı kaydedilemedi: ${deleteError.message}`); return false; }

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
    if (error) { notify(`Bağlantı kaydedilemedi: ${error.message}`); return false; }
    const credential = rowToPaymentCredential(data);
    setPaymentCredentials([credential]);
    notify(`${provider === "paytr" ? "PayTR" : "iyzico"} bağlandı.`, "success");
    return true;
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

  // Bir randevunun Öncesi/Sonrası fotoğraflarını /vitrin/{token} sayfasında
  // yayınlar - anlık uygulanır, formun "Kaydet"ine bağlı değil (toggleAttachmentShare
  // ile aynı ilke). Okuma anında photo_consent tekrar kontrol edildiği için
  // (api/lead-capture.js) burada ayrıca bir izin kontrolü gerekmiyor.
  const toggleDealShowcase = async (id, featured) => {
    const { error } = await supabase.from("deals").update({ showcase_featured: featured }).eq("id", id);
    if (error) { notify(`Vitrin durumu güncellenemedi: ${error.message}`); return; }
    setDeals((prev) => prev.map((d) => (d.id === id ? { ...d, showcaseFeatured: featured } : d)));
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
  const applyAppointmentPenaltyBurn = async (missedDeal, dealsBeforeChange) => {
    const burn = computeAppointmentPenaltyBurn({
      customerId: missedDeal.customerId,
      deals: dealsBeforeChange,
      burnsSessionEnabled: companySettings?.appointmentPenaltyBurnsSession === true,
      strikeLimit: companySettings?.appointmentPenaltyStrikeLimit,
      missedPriceItemId: missedDeal.customFields?.price_item_id,
    });
    if (!burn) return;
    const packageDeal = dealsBeforeChange.find((d) => d.id === burn.packageDealId);
    // Artık istemcide hesaplanan bir değer yazılmıyor — DB'de atomik increment
    // yapan burn_appointment_penalty_session RPC'si çağrılıyor (bkz. migration
    // add_burn_appointment_penalty_session_rpc), aynı anda iki ihlal gelirse
    // (personel + portal) ikisi de doğru sayılır.
    const { data: newSessionUsed, error } = await supabase.rpc("burn_appointment_penalty_session", { p_deal_id: burn.packageDealId });
    if (error) {
      notify(`Paket seansı güncellenemedi: ${error.message}`);
      return;
    }
    setDeals((prev) => prev.map((d) => (d.id === burn.packageDealId ? { ...d, sessionUsed: newSessionUsed } : d)));
    logAction("deals", burn.packageDealId, "updated", `Geç iptal/gelmeme cezası: ${newSessionUsed}. seans otomatik düşüldü (${newSessionUsed}/${packageDeal?.sessionTotal})`);
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
    const apptDate = parseAppointmentDateTime(raw);
    const hoursLeft = apptDate ? (apptDate.getTime() - Date.now()) / (60 * 60 * 1000) : NaN;
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
        await applyAppointmentPenaltyBurn(current, deals);
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
      { name: "tasks", setter: setTasks, map: rowToTask, label: (r) => r.title },
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

    for (const table of ["kb_articles", "group_classes", "tasks"]) {
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
    const existingSortOrders = priceListItems.map((p) => p.sortOrder ?? 0);
    const startOrder = existingSortOrders.length ? Math.max(...existingSortOrders) + 1 : 0;
    const rows = records.map((r, i) => ({ id: uid(), user_id: activeTeamId, name: r.name, price: Number(r.price) || 0, sort_order: startOrder + i }));
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
      // Bu saat/tutar alanlarinda 0 gecerli bir deger (orn. "dersten 0 saat kalana
      // kadar" ya da "0 TL kapora") - || kullanirsak kullanici 0 girdiginde ayar
      // sessizce null'a (yani "kapali") duser. Sayim (strike_limit) alanlari icin
      // 0 anlamsiz oldugundan onlar || ile kaliyor.
      late_cancel_hours: s.lateCancelHours ?? null,
      hard_block_hours: s.hardBlockHours ?? null,
      late_cancel_strike_limit: s.lateCancelStrikeLimit || null,
      appointment_cancel_hours: s.appointmentCancelHours ?? null,
      appointment_penalty_hours: s.appointmentPenaltyHours ?? null,
      appointment_penalty_strike_limit: s.appointmentPenaltyStrikeLimit || null,
      appointment_penalty_burns_session: s.appointmentPenaltyBurnsSession === true,
      appointment_partial_charge_hours: s.appointmentPartialChargeHours ?? null,
      google_review_link: s.googleReviewLink || null,
      google_review_requests_enabled: s.googleReviewRequestsEnabled !== false,
      appointment_prep_note: s.appointmentPrepNote || null,
      appointment_deposit_amount: s.appointmentDepositAmount ?? null,
      appointment_concurrency: s.appointmentConcurrency ?? null,
      appointment_concurrency_auto: s.appointmentConcurrencyAuto === true,
      appointment_owner_works: s.appointmentOwnerWorks !== false,
      appointment_widget_mode: s.appointmentWidgetMode || "realtime",
      appointment_availability_source: s.appointmentAvailabilitySource || "business_hours",
      appointment_offer_validity_hours: s.appointmentOfferValidityHours ?? 24,
      winback_enabled: s.winbackEnabled === true,
      winback_inactive_days: s.winbackInactiveDays || null,
      min_profit_margin_percent: s.minProfitMarginPercent || null,
      showcase_price_list_visible: s.showcasePriceListVisible === true,
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await supabase.from("company_settings").upsert(row).select().single();
    if (error) { notify(`İşletme ayarları kaydedilemedi: ${error.message}`); return; }
    setCompanySettings(rowToCompanySettings(data));
    setShowSettingsForm(false);
    // Yalnızca sektör GERÇEKTEN değiştiyse tetiklenir — aksi halde adres/logo
    // gibi sektörle ilgisi olmayan bir alanı kaydetmek bile applySectorCustomFields'ı
    // tekrar çalıştırıp kullanıcının bilerek gizlediği preset alanlarını sessizce
    // yeniden aktifleştiriyordu (companySettings burada henüz eski değeri taşıyor,
    // setCompanySettings'in bu closure'ı etkilemesi mümkün değil).
    if (row.sector && row.sector !== companySettings?.sector) await applySectorCustomFields(row.sector);
  };

  const addCustomFieldDef = async ({ entity, key, label, type, options, sector = null, audience = null, sortOrder }) => {
    const entitySortOrders = customFieldDefs.filter((d) => d.entity === entity).map((d) => d.sortOrder ?? 0);
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
      sort_order: sortOrder ?? (entitySortOrders.length ? Math.max(...entitySortOrders) + 1 : 0),
    };
    const { data, error } = await supabase.from("custom_field_defs").insert(row).select().single();
    if (error) { notify(`Özel alan eklenemedi: ${error.message}`); return false; }
    setCustomFieldDefs((prev) => [...prev, rowToCustomFieldDef(data)]);
    return true;
  };

  const updateCustomFieldDef = async ({ id, label, options, audience, sector, active, type }) => {
    const row = { label, options, audience };
    if (sector !== undefined) row.sector = sector;
    if (active !== undefined) row.active = active;
    if (type !== undefined) row.field_type = type;
    const { data, error } = await supabase.from("custom_field_defs").update(row).eq("id", id).select().single();
    if (error) { notify(`Özel alan güncellenemedi: ${error.message}`); return false; }
    setCustomFieldDefs((prev) => prev.map((d) => (d.id === id ? rowToCustomFieldDef(data) : d)));
    return true;
  };

  const setCustomFieldDefsActive = async (ids, active) => {
    if (ids.length === 0) return true;
    // Önce yerel state güncelleniyor (optimistic) — aksi halde "Aktif Et" gibi
    // tek tık aksiyonlarda kullanıcı ağ isteği tamamlanana kadar hiçbir şey
    // olmadığını görüyor, sadece başka bir yere tıklayınca (örn. bölümü kapatıp
    // açınca) değişikliği fark ediyordu. Hata olursa aşağıda geri alınır.
    setCustomFieldDefs((prev) => prev.map((d) => (ids.includes(d.id) ? { ...d, active } : d)));
    const { error } = await supabase.from("custom_field_defs").update({ active }).in("id", ids);
    if (error) {
      notify(`Özel alanlar güncellenemedi: ${error.message}`);
      setCustomFieldDefs((prev) => prev.map((d) => (ids.includes(d.id) ? { ...d, active: !active } : d)));
      return false;
    }
    return true;
  };

  // setCustomFieldDefsActive ile aynı soft-hide davranışını kullanıyor -
  // "Sil" de "Kapatılan alanlar"daki "Aktif Et" de aynı active bayrağını
  // ters yönde çeviriyor, değerler silinmiyor (bkz. Sectors.jsx onay mesajı).
  const deleteCustomFieldDef = async (id) => setCustomFieldDefsActive([id], false);

  // orderedIds sadece TEK bir entity grubunun (customer ya da deal) yeni sırası -
  // diğer entity'nin sort_order'larına dokunmaz.
  const reorderCustomFieldDefs = async (entity, orderedIds) => {
    const orderById = new Map(orderedIds.map((id, i) => [id, i]));
    const prevOrder = new Map(
      customFieldDefs.filter((d) => orderById.has(d.id)).map((d) => [d.id, d.sortOrder]),
    );
    setCustomFieldDefs((prev) =>
      prev.map((d) => (orderById.has(d.id) ? { ...d, sortOrder: orderById.get(d.id) } : d)),
    );
    const results = await Promise.all(
      orderedIds.map((id, i) => supabase.from("custom_field_defs").update({ sort_order: i }).eq("id", id)),
    );
    const failed = results.find((r) => r.error);
    if (failed) {
      notify(`Sıralama kaydedilemedi: ${failed.error.message}`);
      setCustomFieldDefs((prev) =>
        prev.map((d) => (prevOrder.has(d.id) ? { ...d, sortOrder: prevOrder.get(d.id) } : d)),
      );
    }
  };

  const addPriceListItem = async ({ name, price, refreshDays, durationMinutes, resourceId, parallelGroup }) => {
    const sortOrders = priceListItems.map((p) => p.sortOrder ?? 0);
    const row = { id: uid(), user_id: activeTeamId, name, price, refresh_days: refreshDays || null, duration_minutes: durationMinutes || null, resource_id: resourceId || null, parallel_group: parallelGroup || null, sort_order: sortOrders.length ? Math.max(...sortOrders) + 1 : 0 };
    const { data, error } = await supabase.from("price_list_items").insert(row).select().single();
    if (error) { notify(`Ürün/hizmet eklenemedi: ${error.message}`); return; }
    setPriceListItems((prev) => [...prev, rowToPriceListItem(data)]);
  };

  const updatePriceListItem = async ({ id, name, price, refreshDays, durationMinutes, commissionPercent, resourceId, parallelGroup }) => {
    const { data, error } = await supabase.from("price_list_items").update({ name, price, refresh_days: refreshDays || null, duration_minutes: durationMinutes || null, commission_percent: commissionPercent ?? null, resource_id: resourceId || null, parallel_group: parallelGroup || null }).eq("id", id).select().single();
    if (error) { notify(`Ürün/hizmet güncellenemedi: ${error.message}`); return; }
    setPriceListItems((prev) => prev.map((p) => (p.id === id ? rowToPriceListItem(data) : p)));
  };

  const deletePriceListItem = async (id) => {
    const { error } = await supabase.from("price_list_items").delete().eq("id", id);
    if (error) { notify(`Ürün/hizmet silinemedi: ${error.message}`); return; }
    setPriceListItems((prev) => prev.filter((p) => p.id !== id));
  };

  // Hizmet <-> personel yetkinligi (Takim modali "Hizmetler" sekmesi). Iliski
  // price_list_items.staff_member_ids dizisinde; burada personel-odakli tek tik
  // ekle/cikar yapiliyor. .select() ile satirin gercekten guncellendigini
  // dogruluyoruz - RLS/stale id yuzunden 0 satir eslesirse Postgrest hata
  // dondurmez, sessizce hicbir sey degismemis olur (Team.jsx toggleEditSettings
  // ayni desen).
  const setPriceItemStaff = async (priceItemId, memberId, canDo) => {
    const item = priceListItems.find((p) => p.id === priceItemId);
    if (!item) return;
    const current = item.staffMemberIds || [];
    const next = canDo
      ? (current.includes(memberId) ? current : [...current, memberId])
      : current.filter((id) => id !== memberId);
    const { data, error } = await supabase
      .from("price_list_items")
      .update({ staff_member_ids: next })
      .eq("id", priceItemId)
      .select();
    if (error || !data?.length) {
      notify(`Yetkinlik güncellenemedi: ${error?.message || "kayıt bulunamadı."}`);
      return;
    }
    setPriceListItems((prev) => prev.map((p) => (p.id === priceItemId ? rowToPriceListItem(data[0]) : p)));
  };

  const updateParallelGroupPartners = async (updates) => {
    if (!updates.length) return;
    const results = await Promise.all(
      updates.map(({ id, parallelGroup }) =>
        supabase.from("price_list_items").update({ parallel_group: parallelGroup }).eq("id", id),
      ),
    );
    const failed = results.find((r) => r.error);
    if (failed) { notify(`Paralel grup güncellenemedi: ${failed.error.message}`); return; }
    setPriceListItems((prev) =>
      prev.map((p) => {
        const u = updates.find((x) => x.id === p.id);
        return u ? { ...p, parallelGroup: u.parallelGroup } : p;
      }),
    );
  };

  const reorderPriceListItems = async (orderedIds) => {
    const orderById = new Map(orderedIds.map((id, i) => [id, i]));
    const prevOrder = new Map(
      priceListItems.filter((p) => orderById.has(p.id)).map((p) => [p.id, p.sortOrder]),
    );
    setPriceListItems((prev) =>
      prev.map((p) => (orderById.has(p.id) ? { ...p, sortOrder: orderById.get(p.id) } : p)),
    );
    const results = await Promise.all(
      orderedIds.map((id, i) => supabase.from("price_list_items").update({ sort_order: i }).eq("id", id)),
    );
    const failed = results.find((r) => r.error);
    if (failed) {
      notify(`Sıralama kaydedilemedi: ${failed.error.message}`);
      setPriceListItems((prev) =>
        prev.map((p) => (prevOrder.has(p.id) ? { ...p, sortOrder: prevOrder.get(p.id) } : p)),
      );
    }
  };

  const addShowcaseCampaign = async ({ title, description, startsAt, endsAt }) => {
    const sortOrders = showcaseCampaigns.map((c) => c.sortOrder ?? 0);
    const row = { id: uid(), user_id: activeTeamId, title, description: description || null, starts_at: startsAt || null, ends_at: endsAt || null, sort_order: sortOrders.length ? Math.max(...sortOrders) + 1 : 0 };
    const { data, error } = await supabase.from("showcase_campaigns").insert(row).select().single();
    if (error) { notify(`Kampanya eklenemedi: ${error.message}`); return; }
    setShowcaseCampaigns((prev) => [...prev, rowToShowcaseCampaign(data)]);
  };

  const updateShowcaseCampaign = async ({ id, title, description, startsAt, endsAt, active }) => {
    const { data, error } = await supabase.from("showcase_campaigns").update({ title, description: description || null, starts_at: startsAt || null, ends_at: endsAt || null, active }).eq("id", id).select().single();
    if (error) { notify(`Kampanya güncellenemedi: ${error.message}`); return; }
    setShowcaseCampaigns((prev) => prev.map((c) => (c.id === id ? rowToShowcaseCampaign(data) : c)));
  };

  const deleteShowcaseCampaign = async (id) => {
    const { error } = await supabase.from("showcase_campaigns").delete().eq("id", id);
    if (error) { notify(`Kampanya silinemedi: ${error.message}`); return; }
    setShowcaseCampaigns((prev) => prev.filter((c) => c.id !== id));
  };

  const reorderShowcaseCampaigns = async (orderedIds) => {
    const orderById = new Map(orderedIds.map((id, i) => [id, i]));
    const prevOrder = new Map(
      showcaseCampaigns.filter((c) => orderById.has(c.id)).map((c) => [c.id, c.sortOrder]),
    );
    setShowcaseCampaigns((prev) =>
      prev.map((c) => (orderById.has(c.id) ? { ...c, sortOrder: orderById.get(c.id) } : c)),
    );
    const results = await Promise.all(
      orderedIds.map((id, i) => supabase.from("showcase_campaigns").update({ sort_order: i }).eq("id", id)),
    );
    const failed = results.find((r) => r.error);
    if (failed) {
      notify(`Sıralama kaydedilemedi: ${failed.error.message}`);
      setShowcaseCampaigns((prev) =>
        prev.map((c) => (prevOrder.has(c.id) ? { ...c, sortOrder: prevOrder.get(c.id) } : c)),
      );
    }
  };

  const addStockItem = async ({ name, unit, quantityOnHand, reorderThreshold, supplierName, unitCost }) => {
    const sortOrders = stockItems.map((s) => s.sortOrder ?? 0);
    const row = { id: uid(), user_id: activeTeamId, name, unit, quantity_on_hand: quantityOnHand || 0, reorder_threshold: reorderThreshold ?? null, supplier_name: supplierName || null, unit_cost: unitCost || null, sort_order: sortOrders.length ? Math.max(...sortOrders) + 1 : 0 };
    const { data, error } = await supabase.from("stock_items").insert(row).select().single();
    if (error) { notify(`Stok kalemi eklenemedi: ${error.message}`); return; }
    setStockItems((prev) => [...prev, rowToStockItem(data)]);
  };

  const updateStockItem = async ({ id, name, unit, quantityOnHand, reorderThreshold, supplierName, unitCost }) => {
    const { data, error } = await supabase
      .from("stock_items")
      .update({ name, unit, quantity_on_hand: quantityOnHand || 0, reorder_threshold: reorderThreshold ?? null, supplier_name: supplierName || null, unit_cost: unitCost || null })
      .eq("id", id).select().single();
    if (error) { notify(`Stok kalemi güncellenemedi: ${error.message}`); return; }
    setStockItems((prev) => prev.map((s) => (s.id === id ? rowToStockItem(data) : s)));
  };

  const deleteStockItem = async (id) => {
    const { error } = await supabase.from("stock_items").delete().eq("id", id);
    if (error) { notify(`Stok kalemi silinemedi: ${error.message}`); return; }
    setStockItems((prev) => prev.filter((s) => s.id !== id));
  };

  const reorderStockItems = async (orderedIds) => {
    const orderById = new Map(orderedIds.map((id, i) => [id, i]));
    const prevOrder = new Map(
      stockItems.filter((s) => orderById.has(s.id)).map((s) => [s.id, s.sortOrder]),
    );
    setStockItems((prev) =>
      prev.map((s) => (orderById.has(s.id) ? { ...s, sortOrder: orderById.get(s.id) } : s)),
    );
    const results = await Promise.all(
      orderedIds.map((id, i) => supabase.from("stock_items").update({ sort_order: i }).eq("id", id)),
    );
    const failed = results.find((r) => r.error);
    if (failed) {
      notify(`Sıralama kaydedilemedi: ${failed.error.message}`);
      setStockItems((prev) =>
        prev.map((s) => (prevOrder.has(s.id) ? { ...s, sortOrder: prevOrder.get(s.id) } : s)),
      );
    }
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

  // ok:false döndüğü tüm dallarda notify zaten çağrıldı (kullanıcı neden
  // eklenmediğini görür) — dönüş değeri sadece çağıranın (promoteFromWaitlistIfAny)
  // "gerçekten kaydoldu mu" bilgisine göre kendi sonraki adımına (waitlist'ten
  // silme, başarı mesajı) karar verebilmesi için var.
  const enrollMember = async ({ groupClassId, customerId, silent = false }) => {
    const group = groupClasses.find((g) => g.id === groupClassId);
    if (!group) return { ok: false, reason: "not_found" };
    if (!activeMemberships.some((d) => d.customerId === customerId)) { notify(groupClassWords(companySettings?.sector).noMembershipToast); return { ok: false, reason: "no_membership" }; }
    const currentCount = groupClassEnrollments.filter((e) => e.groupClassId === groupClassId).length;
    if (currentCount >= group.capacity) { notify("Bu ders dolu."); return { ok: false, reason: "full" }; }
    if (groupClassEnrollments.some((e) => e.groupClassId === groupClassId && e.customerId === customerId)) { notify("Bu müşteri zaten kayıtlı."); return { ok: false, reason: "already_enrolled" }; }
    const row = { id: uid(), user_id: activeTeamId, group_class_id: groupClassId, customer_id: customerId };
    const { data, error } = await supabase.from("group_class_enrollments").insert(row).select().single();
    if (error) { notify(`${groupClassWords(companySettings?.sector).addErrorPrefix}: ${error.message}`); return { ok: false, reason: "db_error" }; }
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
    return { ok: true };
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
    // Kayıt gerçekten oluşmadıysa (dolu/DB hatası/vb.) kişi yedek listede
    // kalmalı ki bir sonraki yer açılışında tekrar denensin — enrollMember
    // zaten neden eklenemediğini notify ile göstermiş oluyor, burada ayrıca
    // yanlış bir "başarı" mesajı gösterilmez.
    const result = await enrollMember({ groupClassId, customerId: next.customerId, silent: true });
    if (!result.ok) return;
    const { error } = await supabase.from("group_class_waitlist").delete().eq("id", next.id);
    if (!error) setGroupClassWaitlist((prev) => prev.filter((w) => w.id !== next.id));
    const customer = customers.find((c) => c.id === next.customerId);
    const group = groupClasses.find((g) => g.id === groupClassId);
    if (customer) {
      notify(`${customer.name}, yedek listeden "${group?.name || "ders"}" dersine otomatik eklendi.`, "success");
      // enrollMember silent:true ile çağrıldığı için normal "kaydedildiniz" maili
      // gitmedi - burada "son dakika yer açıldı" vurgusuyla ayrı bir mail atılıyor,
      // müşteri kendi haberi olmadan derse eklenmiş olmasın.
      const zamanBilgisi = group ? ` (${WEEKDAYS[group.weekday - 1]} ${group.startTime})` : "";
      notifyCustomerByEmail(
        customer,
        `Son dakika yer açıldı: ${group?.name || "Ders"}`,
        `Merhaba,\n\n${companySettings?.companyName || "Binerly"} - "${group?.name || "ders"}"${zamanBilgisi} dersinde yer açıldı ve yedek listedeki sıranız geldiği için otomatik olarak kaydedildiniz.\n\nGelemeyecekseniz lütfen bize haber verin ki yeriniz başka bir üyeye açılabilsin.`
      );
    }
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
    // Cagiranlar (Pano/Ayarlar/Sektorler "duzelt" butonlari) donen degeri success
    // toast'i gostermek icin kullaniyor — asagidaki her adim basarisiz olabilir ve
    // basarisizlik notify() ile zaten bildiriliyor, o yuzden hicbirini "&&" disinda
    // birakmiyoruz (aksi halde bir alan basarisiz olsa bile ust cagiran kosulsuz
    // "duzeltildi" diyip gercek hatayi ustune yazardi).
    let ok = await setCustomFieldDefsActive(toHide, false);
    if (!preset) return ok;
    // customFieldDefs bu fonksiyon boyunca sabit bir closure - dongu icinde eklenen
    // alanlar bu listeye yansimiyor. addCustomFieldDef'in kendi otomatik sort_order
    // hesaplamasi da ayni closure'a bakar, bu yuzden ayni entity'ye art arda birden
    // fazla yeni alan eklenirse hepsi ayni sort_order'i alirdi - kendi sayacimizi
    // tutup her ekleme icin acikca gonderiyoruz.
    const nextSortOrder = {};
    for (const d of customFieldDefs) {
      nextSortOrder[d.entity] = Math.max(nextSortOrder[d.entity] ?? -1, d.sortOrder ?? 0);
    }
    for (const f of preset.customFields) {
      const existing = customFieldDefs.find((d) => d.entity === f.entity && d.key === f.key);
      if (!existing) {
        nextSortOrder[f.entity] = (nextSortOrder[f.entity] ?? -1) + 1;
        ok = (await addCustomFieldDef({ ...f, sector: sectorId, sortOrder: nextSortOrder[f.entity] })) && ok;
      } else {
        // active:true HER ZAMAN uygulanır — eskiden sadece existing.sector !==
        // sectorId (sektör gerçekten değiştiğinde) tetikleniyordu, bu da "Varsayılan
        // Özel Alanlara Dön" butonunu aynı sektörde kalındığında (ki tek çağrı
        // yolu zaten budur, bkz. onFetchFields) işlevsiz bırakıyordu — kullanıcı
        // bir alanı (elle veya sektör değişimiyle) kapatınca bir daha hiçbir
        // zaman bu buton onu geri getiremiyordu (Elif Güzellik Salonu vakası:
        // "Randevu Tarihi" pasif kaldığı için randevu widget'ı hiç çalışmıyordu).
        // Bu artık butonun ADINA uygun bir "sıfırla" davranışı: sektörün
        // preset'indeki her alanı, elle yapılmış ad/seçenek değişiklikleri dahil,
        // koşulsuz varsayılana döndürür.
        //
        // type de kontrol/düzeltiliyor — aksi halde örn. elle "Randevu Tarihi"
        // adında "Tarih" (date) tipinde bir alan daha önce oluşturulmuşsa, bu
        // sektöre "reclaim" edilirken sadece etiket/sektör/aktiflik güncellenip
        // tip yanlış kalır — "Tarih & Saat" (datetime) beklenen yerlerde
        // (randevu müsaitliği/hatırlatma) alan hiç bulunamaz.
        // audience de f'den (yeni sektörün preset'i) alınır, existing'den DEĞİL —
        // aksi halde reklam edilen alan eski sektörün "sadece bireysel/kurumsal"
        // kısıtını yanlışlıkla taşımaya devam ederdi.
        ok = (await updateCustomFieldDef({ id: existing.id, label: f.label, options: f.options, audience: f.audience ?? null, sector: sectorId, active: true, type: f.type })) && ok;
      }
    }
    return ok;
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
  // Otomatik VIP tespiti: elle "VIP" işaretlemeye gerek kalmadan, ömür boyu
  // tahsilata (won deal'lerdeki gerçek ödeme, sadece deal değeri değil) göre
  // en değerli %10 müşteri otomatik etiketlenir. Tarih aralığı filtresinden
  // (panoRange) BİLEREK bağımsız - VIP durumu "şu anki dönem" değil ömür boyu
  // bir statü. En az 5 ödeme yapmış müşteri şartı var, yoksa 2 müşteride biri
  // "VIP" gibi görünüp anlamsızlaşır.
  const customerTotalPaid = new Map();
  for (const d of wonDealsAll) {
    if (!d.customerId) continue;
    const paid = totalPaidForDeal(d.id);
    if (paid > 0) customerTotalPaid.set(d.customerId, (customerTotalPaid.get(d.customerId) || 0) + paid);
  }
  const payingCustomers = [...customerTotalPaid.entries()];
  const vipCustomerIds = new Set(
    payingCustomers.length >= 5
      ? payingCustomers
          .sort((a, b) => b[1] - a[1])
          .slice(0, Math.max(1, Math.ceil(payingCustomers.length * 0.1)))
          .map(([id]) => id)
      : [],
  );
  const rangeBounds = getRangeBounds(panoRange, { from: panoRangeFrom, to: panoRangeTo });
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

  // Ust bardaki genel arama - her sekmeye gitmeden musteri/kayit bulup
  // dogrudan acabilmek icin. Zaten client-side'da tutulan customers/deals
  // dizilerini filtreliyor, ayri bir sorgu gerekmiyor.
  const globalSearchQueryNorm = globalSearchQuery.trim().toLowerCase();
  const globalSearchActive = globalSearchQueryNorm.length >= 2;
  const globalSearchCustomers = globalSearchActive
    ? customers
        .filter((c) => !c.deletedAt && [c.name, c.phone, c.email].some((f) => (f || "").toLowerCase().includes(globalSearchQueryNorm)))
        .slice(0, 5)
    : [];
  const globalSearchDeals = globalSearchActive
    ? deals
        .filter((d) => !d.deletedAt && (d.title || "").toLowerCase().includes(globalSearchQueryNorm))
        .slice(0, 5)
    : [];
  // "Randevularım" sekmesi için — appointment-availability.js/send-appointment-
  // reminders.js'in yaptığı gibi, sektöre göre değişen randevu tarihi alanının
  // gerçek anahtarını aktif "Tarih & Saat" tipindeki tanımdan buluyoruz. Menü
  // satırlarındaki "çalışmıyor" uyarısı da aynı değeri kullanır (bkz. aşağı).
  const appointmentDateTimeKey = customFieldDefs.find((d) => d.entity === "deal" && d.type === "datetime" && d.active)?.key || null;
  // Ayarlar hub'ındaki satırlarla birebir aynı liste - kullanıcı "Ayarlar"a
  // girmeden de "kdv", "takım" gibi yazıp doğrudan ilgili paneli açabilsin.
  const settingsSearchItems = [
    ...(canEditCompanySettings
      ? [
          { label: "İşletme Bilgileri", description: "İşletme adı, adres, iletişim, KDV oranı", onOpen: () => setShowSettingsForm(true) },
          { label: "Sektör & Özel Alanlar", description: "Aşama isimleri, etiket önerileri, özel alanlar", onOpen: () => setShowSectorFields(true) },
          { label: "Teklif Şablonları", description: "PDF teklifinizin tasarımını seçin", onOpen: () => setShowPdfTemplates(true) },
          { label: "Ödeme Bağlantısı", description: "Onay linkinden kartla tahsilat almak için iyzico veya PayTR bağlayın", onOpen: () => setShowPaymentSettings(true) },
          ...(bookingModel(companySettings?.sector) === "slot"
            ? [{ label: "Müsaitlik Saatleri", description: "Randevu Alma Linki ve portaldan randevu alınabilecek gün/saatleri belirleyin", onOpen: () => setShowBusinessHours(true) }]
            : []),
          ...(bookingModel(companySettings?.sector) === "inventory"
            ? [{ label: "Oda Stoku", description: "Her oda tipinden kaç adet olduğunu belirleyin", onOpen: () => setShowRoomInventory(true) }]
            : []),
        ]
      : []),
    { label: "Görünüm, Bildirimler & Hesap", description: "Tema, push bildirimleri, şifre", onOpen: () => setShowAppSettings(true) },
    { label: "Takım", description: "Üyeler ve davetler", onOpen: () => setShowTeamModal(true) },
    { label: "Çöp Kutusu ve Geçmiş", description: "Silinen kayıtlar, işlem geçmişi", onOpen: () => setShowTrashHistory(true) },
    { label: "Müşteri Kazanma Linki", description: "Müşteri kendi bilgisini bıraksın, elle girmeyin", onOpen: async () => { const link = await generateLeadCaptureLink(); if (link) setLeadCaptureLink(link); } },
    ...(supportsSelfBooking(companySettings?.sector) && bookingModel(companySettings?.sector) === "slot"
      ? [{ label: "Randevu Alma Linki", description: appointmentDateTimeKey ? "Müşteri girişsiz kendi randevusunu seçip talep etsin" : "⚠ Şu anda çalışmıyor - açıp düzeltin", onOpen: async () => { const link = await generateLeadCaptureLink("randevu-al"); if (link) setAppointmentLink(link); } }]
      : []),
    { label: "Vitrin Linki", description: "Ürünlerinizi, fiyat listenizi ve kampanyalarınızı herkese açık gösterin", onOpen: async () => { const link = await generateLeadCaptureLink("vitrin"); if (link) setVitrinLink(link); } },
    { label: "Müşteri Portalı Linki", description: "Mevcut müşterileriniz için - kendi hesaplarıyla giriş yapıp takip etsinler", onOpen: () => setShowPortalLinkModal(true) },
    { label: "Turu Tekrar Başlat", description: "Sistemin nasıl çalıştığını gösteren kısa turu tekrar izleyin", onOpen: () => { setTourStep(0); setShowTour(true); } },
  ];
  const globalSearchSettings = globalSearchActive
    ? settingsSearchItems
        .filter((s) => s.label.toLowerCase().includes(globalSearchQueryNorm) || s.description.toLowerCase().includes(globalSearchQueryNorm))
        .slice(0, 5)
    : [];
  const globalSearchHasResults = globalSearchCustomers.length > 0 || globalSearchDeals.length > 0 || globalSearchSettings.length > 0;
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
  const dueTasks = tasks.filter((t) => !t.completedAt && t.dueDate && new Date(t.dueDate) <= todayEnd);
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
          const apptTime = parseAppointmentDateTime(raw);
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
          const apptTime = parseAppointmentDateTime(raw);
          return { deal: d, apptTime };
        })
        .filter((x) => x.apptTime && !isNaN(x.apptTime.getTime()) && x.apptTime.getTime() > Date.now())
        .sort((a, b) => a.apptTime - b.apptTime)
    : [];
  // send-reminders.js'teki Google değerlendirme isteği, müşterinin pazarlama
  // izni yoksa insan onayı olmadan sessizce atlanıp deal yine de review_requested_at
  // ile damgalanıyordu - KOBİ bu kaçırılan değerlendirme fırsatını hiç öğrenmiyordu.
  // Aynı deal'i tekrar tekrar göstermemek için sadece review_requested_at SET
  // olan (yani cron'un gerçekten denediği) ama izin hâlâ yoksa listelenir.
  const reviewConsentMissingAlerts = companySettings?.googleReviewLink && companySettings?.googleReviewRequestsEnabled !== false
    ? deals
        .filter((d) => !d.deletedAt && d.reviewRequestedAt)
        .map((d) => ({ deal: d, customer: customerById(d.customerId) }))
        .filter((x) => x.customer?.email && !x.customer.marketingConsent)
    : [];
  // Randevu sektörlerinde (anlık işlem yapılıp aynı gün kapanan randevular)
  // aşama değişikliği elle kanban/liste ile uğraşmak yerine tek tık onaya
  // indirgeniyor — saati geçmiş, hâlâ açık randevular burada toplanır. Paket
  // teklifleri (sessionTotal>0) de DAHİL - ama "Geldi ✓" (kazanıldı'ya taşıma,
  // tüm paketi kapatır) yerine Pano'da incrementSessionUsage ile aynı "Seans
  // kullanıldı" aksiyonu gösterilir (bkz. handleUseSessionClick). Tükenmiş bir
  // paket (sessionUsed >= sessionTotal) burada anlamsız olduğu için hariç.
  const pendingArrivalConfirmations = isAppointmentSector(companySettings?.sector) && appointmentDateTimeKey
    ? deals
        .filter((d) => d.stage !== "kazanildi" && d.stage !== "kaybedildi" && !(d.sessionTotal > 0 && d.sessionUsed >= d.sessionTotal))
        .map((d) => {
          const raw = d.customFields?.[appointmentDateTimeKey];
          const apptTime = parseAppointmentDateTime(raw);
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
  // "Sadece talep al" widget modunda (bkz. AppointmentPolicies.jsx
  // AppointmentRequestModeBox) gelen, henüz gerçek bir randevu saatine
  // dönüşmemiş talepler - appointmentOfferStatus "confirmed" olduğu an deal
  // normal bir randevuya döner (customFields[appointmentDateTimeKey] set
  // edilmiş olur, bkz. api/deal-approval.js handleConfirmAppointmentOffer) ve
  // bu listeden kendiliğinden düşer. Mod sonradan "realtime"a çevrilmiş olsa
  // bile (appointmentWidgetMode'a değil deal'in kendi verisine bakılıyor)
  // bekleyen eski bir talep varsa burada görünmeye devam eder - KOBİ'nin
  // elinde unutulmasın.
  const pendingAppointmentRequests = deals
    .filter(
      (d) =>
        d.stage !== "kazanildi" &&
        d.stage !== "kaybedildi" &&
        d.appointmentOfferStatus !== "confirmed" &&
        Array.isArray(d.customFields?.appointment_request_prefs) &&
        d.customFields.appointment_request_prefs.length > 0,
    )
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  // Bir tercih (ya da KOBİ'nin elle önerdiği) saatin uygun olup olmadığına dair
  // hızlı bir ipucu - Deals.jsx findAppointmentConflict'in AYNI örtüşme ilkesi +
  // aktif müsaitlik kaynağına (Ayarlar > Müsaitlik Saatleri: vardiya mı çalışma
  // saatleri mi) göre saat penceresi kontrolü. "Takvim = uyarı, çakışma = engel"
  // ilkesi (bkz. Deals.jsx findAppointmentConflict): vardiya / çalışma saati dışı
  // saat sunucuda ENGELLENMEZ (KOBİ mesai yapabilir), sadece burada uyarılır.
  // Gerçek doluluk garantisi api/deal-approval.js send-appointment-offer +
  // confirm-appointment-offer'daki atomik concurrency-slot / kaynak tahsisi.
  const appointmentSlotHasConflict = (dateTimeStr, durationMinutes, excludeDealId, serviceIds = []) => {
    if (!appointmentDateTimeKey) return false;
    const candidateDate = parseAppointmentDateTime(dateTimeStr);
    if (!candidateDate) return false;
    const candidateStart = candidateDate.getTime();
    const candidateEnd = candidateStart + Math.max(Number(durationMinutes) || 0, 1) * 60000;
    let concurrency = Math.max(1, Number(companySettings?.appointmentConcurrency) || 1);
    // Hizmet bazlı personel yetkinliği (Takım > Hizmetler): seçili hizmet(ler)i
    // sınırlı sayıda personel yapabiliyorsa etkin kapasite düşer. Bu sadece bir
    // ipucu (buton yine aktif) - Deals.jsx findAppointmentConflict'in
    // basitleştirilmiş sürümü, kesişim inceliği olmadan. Model: bir personel hiç
    // hizmete işaretli değilse tümünü yapar, işaretliyse sadece işaretlileri.
    const validStaffIds = new Set([activeTeamId, ...teamRoster.map((m) => m.id)].filter(Boolean));
    const restrictedStaffIds = new Set(
      priceListItems.flatMap((p) => p.staffMemberIds || []).filter((id) => validStaffIds.has(id)),
    );
    for (const sid of serviceIds || []) {
      const svc = priceListItems.find((p) => p.id === sid);
      if (!svc) continue;
      const allowed = new Set(svc.staffMemberIds || []);
      const capableCount = [...validStaffIds].filter(
        (id) => !restrictedStaffIds.has(id) || allowed.has(id),
      ).length;
      if (capableCount < validStaffIds.size) concurrency = Math.min(concurrency, capableCount || 1);
    }
    // Vardiya bazlı müsaitlik modu (Ayarlar > Müsaitlik Saatleri): o an vardiyada
    // olan personel sayısı da tavanı düşürür - Deals.jsx findAppointmentConflict'in
    // basitleştirilmiş sürümü (yetkinlik havuzuyla kesiştirmeden). O haftagünü hiç
    // vardiya yoksa Müsaitlik Saatleri'ne düşülür.
    if (companySettings?.appointmentAvailabilitySource === "shifts") {
      const dateStr = (dateTimeStr || "").slice(0, 10);
      const [chh = 0, cmm = 0] = (dateTimeStr || "").slice(11, 16).split(":").map(Number);
      const startMin = chh * 60 + cmm;
      const endMin = startMin + Math.max(Number(durationMinutes) || 0, 1);
      const anyShift = [...validStaffIds].some(
        (id) => staffShiftsEffectiveOnDate(staffShifts, id, dateStr).length > 0,
      );
      if (anyShift) {
        const onShift = [...validStaffIds].filter((id) => {
          if (
            staffLeaveRecords.some(
              (r) => r.memberId === id && r.startDate <= dateStr && dateStr <= r.endDate,
            )
          )
            return false;
          const rows = staffShiftsEffectiveOnDate(staffShifts, id, dateStr);
          if (rows.length === 0 || rows.some((r) => r.isOff)) return false;
          return rows.some((r) => {
            if (!r.startTime || !r.endTime) return false;
            const [sh, sm] = r.startTime.split(":").map(Number);
            const [eh, em] = r.endTime.split(":").map(Number);
            return startMin >= sh * 60 + sm && endMin <= eh * 60 + em;
          });
        }).length;
        concurrency = Math.min(concurrency, onShift);
      }
    }
    // Müsaitlik Saatleri modunda - veya vardiya modunda o haftagünü hiç vardiya
    // girilmemişse (her yerdeki AYNI "vardiyasız gün Müsaitlik Saatleri'ne düşer"
    // kuralı) - önerilen saat işletmenin açık saatleri içinde mi. Bu SADECE bir
    // istemci uyarısı (sunucu business_hours modunda saat dışı öneriyi geçirir);
    // işletme hiç Müsaitlik Saati tanımlamamışsa (sadece talep al modundaki
    // KOBİ'ler) kıyaslanacak bir şey yok, atlanır.
    const bhDateStr = (dateTimeStr || "").slice(0, 10);
    const shiftsCoverDate =
      companySettings?.appointmentAvailabilitySource === "shifts" &&
      [...validStaffIds].some((id) => staffShiftsEffectiveOnDate(staffShifts, id, bhDateStr).length > 0);
    if (!shiftsCoverDate && businessHours.length > 0) {
      const jsWeekday = new Date(`${bhDateStr}T00:00:00`).getDay();
      const weekday = jsWeekday === 0 ? 7 : jsWeekday;
      const [bhh = 0, bmm = 0] = (dateTimeStr || "").slice(11, 16).split(":").map(Number);
      const bhStart = bhh * 60 + bmm;
      const bhEnd = bhStart + Math.max(Number(durationMinutes) || 0, 1);
      const dayWindows = businessHours.filter((h) => h.weekday === weekday);
      const fitsHours = dayWindows.some((h) => {
        const [sh, sm] = h.startTime.split(":").map(Number);
        const [eh, em] = h.endTime.split(":").map(Number);
        return bhStart >= sh * 60 + sm && bhEnd <= eh * 60 + em;
      });
      if (!fitsHours) return true;
    }
    const overlapping = deals.filter((d) => {
      if (d.id === excludeDealId || d.stage === "kaybedildi") return false;
      const otherDt = d.customFields?.[appointmentDateTimeKey];
      const otherDate = parseAppointmentDateTime(otherDt);
      if (!otherDate) return false;
      const otherStart = otherDate.getTime();
      const otherEnd = otherStart + Math.max(Number(d.customFields?.duration_minutes) || 0, 1) * 60000;
      return candidateStart < otherEnd && otherStart < candidateEnd;
    }).length;
    return overlapping >= concurrency;
  };
  // RESEND_API_KEY sunucu tarafında olduğu için (client'a hiç verilmiyor)
  // e-posta gönderimi api/deal-approval.js'e (owner Bearer-auth'lu) devredilir -
  // approval_token/appointment_offer_* yazması da tutarlılık için AYNI
  // çağrıda orada yapılır, burada ayrıca bir supabase update yok.
  const sendAppointmentOffer = async (deal, offerTimeStr) => {
    try {
      const res = await fetch("/api/deal-approval", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ action: "send-appointment-offer", dealId: deal.id, offerTime: offerTimeStr }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { notify(`Teklif gönderilemedi: ${data.error || "bilinmeyen hata"}`); return null; }
      // E-posta gidemedi VE müşterinin telefonu da yoksa (panel WhatsApp
      // açamaz) teklif oluştu ama müşteriye hiçbir şey ulaşmadı - KOBİ'yi
      // "Onay linkini kopyala"ya yönlendir, sessizce "gönderildi" deme.
      const custPhone = (customers.find((c) => c.id === deal.customerId)?.phone || "").trim();
      if (data.emailSent === false && !custPhone) {
        notify("Teklif oluşturuldu - müşteriye e-posta gidemedi. 'Onay linkini kopyala' ile iletin.");
      } else {
        notify("Randevu teklifi müşteriye gönderildi.", "success");
      }
      return data;
    } catch {
      notify("Teklif gönderilemedi - bağlantı hatası.");
      return null;
    }
  };
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

  const monthBuckets = getMonthlyBuckets(panoRange, wonDealsAll, { from: panoRangeFrom, to: panoRangeTo });
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

  const rangeLabel =
    panoRange === "ozel"
      ? panoRangeFrom || panoRangeTo
        ? `${panoRangeFrom ? new Date(`${panoRangeFrom}T00:00:00`).toLocaleDateString("tr-TR") : "başlangıç"} - ${panoRangeTo ? new Date(`${panoRangeTo}T00:00:00`).toLocaleDateString("tr-TR") : "bugün"}`
        : "Özel aralık"
      : PANO_RANGES.find((r) => r.id === panoRange)?.label || "";
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
    <div
      style={{
        padding: "24px 16px 64px",
        // Üst kısımda çok soluk bir mavi ışıma - yarı saydam olduğu için
        // body'nin nokta ızgarası + zemin rengi altından geçmeye devam eder,
        // sadece başlık/ilk kartların arkasına hafif bir marka tonu katar.
        // KOBİ gün boyu burada çalıştığı için bilerek çok düşük opaklık.
        background:
          "radial-gradient(135% 90% at 50% -10%, rgba(79, 148, 217, 0.14), rgba(79, 148, 217, 0) 62%)",
      }}
    >
      <div className="app-header-row" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, marginBottom: "1.5rem" }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 16, flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 10, flex: "none" }}>
          <IconButton icon="ti-menu-2" onClick={() => setSidebarOpen(true)} title="Menü" className="app-sidebar-toggle" />
          <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <img src="/favicon.svg" alt="Binerly" style={{ width: 31, height: 31 }} />
            <h1 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>Binerly</h1>
            {companySettings?.companyName && (
              <>
                <span style={{ width: 1, height: 18, background: "var(--border)" }} aria-hidden="true" />
                <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  {companySettings.logoUrl ? (
                    <img
                      src={companySettings.logoUrl}
                      alt=""
                      style={{ width: 18, height: 18, borderRadius: 4, objectFit: "contain" }}
                      onError={(e) => { e.currentTarget.style.display = "none"; }}
                    />
                  ) : (
                    <InitialsAvatar name={companySettings.companyName} size={18} />
                  )}
                  <span style={{ fontSize: 13, color: "var(--text-secondary)", fontWeight: 500 }}>{companySettings.companyName}</span>
                </span>
              </>
            )}
          </div>
          <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: 0 }}>KOBİ satış takip sistemi</p>
          </div>
        </div>

        <div className="app-header-search" style={{ position: "relative", flex: 1, maxWidth: 360, minWidth: 0, alignSelf: "center" }}>
          <i className="ti ti-search" style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", fontSize: 15, color: "var(--text-muted)", pointerEvents: "none" }} aria-hidden="true"></i>
          <input
            type="text"
            value={globalSearchQuery}
            onChange={(e) => setGlobalSearchQuery(e.target.value)}
            onFocus={() => setGlobalSearchFocused(true)}
            onBlur={() => setGlobalSearchFocused(false)}
            onKeyDown={(e) => { if (e.key === "Escape") e.currentTarget.blur(); }}
            placeholder="Müşteri veya kayıt ara..."
            style={{ width: "100%", padding: "8px 12px 8px 32px", borderRadius: "var(--radius)", fontSize: 13 }}
          />
          {globalSearchFocused && globalSearchActive && (
            <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, background: "var(--surface-1)", border: "0.5px solid var(--border)", borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow-md)", zIndex: 400, maxHeight: 360, overflowY: "auto", padding: 6 }}>
              {!globalSearchHasResults ? (
                <p style={{ fontSize: 13, color: "var(--text-muted)", margin: 0, padding: "8px 10px" }}>Sonuç bulunamadı.</p>
              ) : (
                <>
                  {globalSearchCustomers.length > 0 && (
                    <>
                      <p style={{ fontSize: 10.5, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.3, margin: "4px 10px" }}>Müşteriler</p>
                      {globalSearchCustomers.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          className="global-search-result"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => { setViewingCustomer(c); setGlobalSearchQuery(""); }}
                          style={{ display: "block", width: "100%", textAlign: "left", padding: "8px 10px", borderRadius: "var(--radius)", background: "none", border: "none", boxShadow: "none", fontSize: 13 }}
                        >
                          <span style={{ fontWeight: 500 }}>{c.name}</span>
                          {c.phone && <span style={{ color: "var(--text-muted)", marginLeft: 6 }}>{c.phone}</span>}
                        </button>
                      ))}
                    </>
                  )}
                  {globalSearchDeals.length > 0 && (
                    <>
                      <p style={{ fontSize: 10.5, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.3, margin: "4px 10px" }}>{dealWords.navLabel}</p>
                      {globalSearchDeals.map((d) => (
                        <button
                          key={d.id}
                          type="button"
                          className="global-search-result"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => { setTab("firsat"); setEditingDeal(d); setShowDealForm(true); setGlobalSearchQuery(""); }}
                          style={{ display: "block", width: "100%", textAlign: "left", padding: "8px 10px", borderRadius: "var(--radius)", background: "none", border: "none", boxShadow: "none", fontSize: 13 }}
                        >
                          <span style={{ fontWeight: 500 }}>{d.title}</span>
                          {customerById(d.customerId) && <span style={{ color: "var(--text-muted)", marginLeft: 6 }}>{customerById(d.customerId).name}</span>}
                        </button>
                      ))}
                    </>
                  )}
                  {globalSearchSettings.length > 0 && (
                    <>
                      <p style={{ fontSize: 10.5, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.3, margin: "4px 10px" }}>Ayarlar</p>
                      {globalSearchSettings.map((s) => (
                        <button
                          key={s.label}
                          type="button"
                          className="global-search-result"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => { s.onOpen(); setGlobalSearchQuery(""); }}
                          style={{ display: "block", width: "100%", textAlign: "left", padding: "8px 10px", borderRadius: "var(--radius)", background: "none", border: "none", boxShadow: "none", fontSize: 13 }}
                        >
                          <span style={{ fontWeight: 500 }}>{s.label}</span>
                          <span style={{ color: "var(--text-muted)", marginLeft: 6 }}>{s.description}</span>
                        </button>
                      ))}
                    </>
                  )}
                </>
              )}
            </div>
          )}
        </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8, flex: "none" }}>
          <NotificationBell userId={session.user.id} supabase={supabase} dataTour="notification-bell" />
          <IconButton icon="ti-logout" label="Çıkış" onClick={handleSignOut} title="Çıkış yap" className="app-header-logout-btn" />
          <button
            type="button"
            onClick={() => setShowAppSettings(true)}
            title="Profil ayarları"
            aria-label="Profil ayarları"
            style={{ background: "none", border: "none", padding: 0, boxShadow: "none", cursor: "pointer", display: "flex", lineHeight: 0 }}
          >
            <UserAvatar
              url={session.user.user_metadata?.avatar_url}
              name={session.user.user_metadata?.full_name || session.user.email}
              size={30}
            />
          </button>
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
          ...(canEditCompanySettings ? [{ id: "vitrin", label: "Vitrin", icon: "ti-building-store" }] : []),
          { id: "ajanda", label: "Ajanda", icon: "ti-calendar-event" },
          { id: "gorevler", label: "Görevler", icon: "ti-list-check" },
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
              border: "0.5px solid transparent",
              background: tab === t.id ? "var(--fill-accent)" : "transparent",
              color: tab === t.id ? "var(--on-accent)" : "var(--text-primary)",
              fontWeight: tab === t.id ? 600 : 400,
              boxShadow: tab === t.id ? "var(--shadow-sm)" : "none",
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
        <div style={{ height: 1, background: "var(--border)", margin: "4px 10px" }} aria-hidden="true" />
        <button
          onClick={() => { setShowSettingsHub(true); setSidebarOpen(false); }}
          data-tour="settings-gear"
          className={showSettingsHub ? undefined : "app-sidebar-tab"}
          style={{
            border: "0.5px solid transparent",
            background: showSettingsHub ? "var(--fill-accent)" : "transparent",
            color: showSettingsHub ? "var(--on-accent)" : "var(--text-primary)",
            fontWeight: showSettingsHub ? 600 : 400,
            boxShadow: showSettingsHub ? "var(--shadow-sm)" : "none",
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-start",
            gap: 8,
            padding: "8px 10px",
            width: "100%",
            textAlign: "left",
          }}
        >
          <i className="ti ti-settings" style={{ fontSize: 16, flexShrink: 0 }} aria-hidden="true"></i>
          <span style={{ flex: 1 }}>Ayarlar</span>
        </button>
      </nav>

      <div style={{ flex: 1, minWidth: 0 }}>

      {tab === "pano" && (
        <Pano
          customers={customers}
          deals={deals}
          tickets={tickets}
          teamMembers={teamMembers}
          companySettings={companySettings}
          session={session}
          pendingInvites={pendingInvites}
          dismissedInviteIds={dismissedInviteIds}
          activeTeamId={activeTeamId}
          canEditCompanySettings={canEditCompanySettings}
          appointmentDateTimeKey={appointmentDateTimeKey}
          onFixAppointmentField={async () => { if (await applySectorCustomFields(companySettings.sector)) notify("Randevu alma linki düzeltildi.", "success"); }}
          dealLineItems={dealLineItems}
          priceListItems={priceListItems}
          panoRange={panoRange}
          setPanoRange={setPanoRange}
          panoRangeFrom={panoRangeFrom}
          panoRangeTo={panoRangeTo}
          onPanoRangeFromChange={(v) => {
            setPanoRangeFrom(v);
            setPanoRange("ozel");
          }}
          onPanoRangeToChange={(v) => {
            setPanoRangeTo(v);
            setPanoRange("ozel");
          }}
          activationChecklistDismissedClick={activationChecklistDismissedClick}
          setActivationChecklistDismissedClick={setActivationChecklistDismissedClick}
          setTab={setTab}
          setEditingDeal={setEditingDeal}
          setShowDealForm={setShowDealForm}
          setViewingCustomer={setViewingCustomer}
          setInitialViewTicketId={setInitialViewTicketId}
          setShowSettingsForm={setShowSettingsForm}
          setShowSectorFields={setShowSectorFields}
          setShowCustomerForm={setShowCustomerForm}
          attemptMoveDealStage={attemptMoveDealStage}
          handleUseSessionClick={handleUseSessionClick}
          addPayment={addPayment}
          totalPaidForDeal={totalPaidForDeal}
          customerById={customerById}
          promoteFromWaitlistIfAny={promoteFromWaitlistIfAny}
          generateApprovalLink={generateApprovalLink}
          seedDemoData={seedDemoData}
          openDealOrList={openDealOrList}
          openTicketOrList={openTicketOrList}
          pendingArrivalConfirmations={pendingArrivalConfirmations}
          pendingAppointmentRequests={pendingAppointmentRequests}
          appointmentSlotHasConflict={appointmentSlotHasConflict}
          sendAppointmentOffer={sendAppointmentOffer}
          otelArrivalsToday={otelArrivalsToday}
          otelDeparturesToday={otelDeparturesToday}
          dueReminderDeals={dueReminderDeals}
          dueTasks={dueTasks}
          urgentTickets={urgentTickets}
          newPortalAppointments={newPortalAppointments}
          orderRhythmAlerts={orderRhythmAlerts}
          lowStockItems={lowStockItems}
          membershipAlerts={membershipAlerts}
          churnAlerts={churnAlerts}
          waitlistFillableAlerts={waitlistFillableAlerts}
          vipCustomerIds={vipCustomerIds}
          stuckDeals={stuckDeals}
          freedAppointmentAlerts={freedAppointmentAlerts}
          unassignedUpcomingAppointments={unassignedUpcomingAppointments}
          reviewConsentMissingAlerts={reviewConsentMissingAlerts}
          requestCustomerConsent={requestCustomerConsent}
          openDeals={openDeals}
          totalOpenValue={totalOpenValue}
          expectedRevenue={expectedRevenue}
          nextMonthForecast={nextMonthForecast}
          passiveCustomerRate={passiveCustomerRate}
          totalOutstanding={totalOutstanding}
          dealsWithOutstanding={dealsWithOutstanding}
          activeMemberships={activeMemberships}
          dealsWithReminder={dealsWithReminder}
          openTicketsCount={openTicketsCount}
          breachedTicketsCount={breachedTicketsCount}
          breachedTickets={breachedTickets}
          unreadMessagesCount={unreadMessagesCount}
          ticketsWithUnread={ticketsWithUnread}
          rangeLabel={rangeLabel}
          wonDeals={wonDeals}
          lostDeals={lostDeals}
          rangeRevenue={rangeRevenue}
          rangeCost={rangeCost}
          rangeProfit={rangeProfit}
          rangeProfitMargin={rangeProfitMargin}
          totalCollected={totalCollected}
          rangeAvgDealSize={rangeAvgDealSize}
          noShowRate={noShowRate}
          avgCompletionDays={avgCompletionDays}
          recurringRevenueRate={recurringRevenueRate}
          onlineSalesRate={onlineSalesRate}
          revenueProfitByBucket={revenueProfitByBucket}
          maxBucketValue={maxBucketValue}
          winRate={winRate}
          lostReasonCounts={lostReasonCounts}
          dealKind={dealKind}
          dealWords={dealWords}
          STAGE_PROBABILITY={STAGE_PROBABILITY}
          PASSIVE_CUSTOMER_DAYS={PASSIVE_CUSTOMER_DAYS}
        />
      )}

      {tab === "musteri" && (
        <CustomersTab
          customers={customers}
          filteredCustomers={filteredCustomers}
          wonDealsAll={wonDealsAll}
          companySettings={companySettings}
          customerSearch={customerSearch}
          setCustomerSearch={setCustomerSearch}
          customerFromDate={customerFromDate}
          setCustomerFromDate={setCustomerFromDate}
          customerToDate={customerToDate}
          setCustomerToDate={setCustomerToDate}
          customerSectorFilter={customerSectorFilter}
          setCustomerSectorFilter={setCustomerSectorFilter}
          customerTypeFilter={customerTypeFilter}
          setCustomerTypeFilter={setCustomerTypeFilter}
          customerConsentFilter={customerConsentFilter}
          setCustomerConsentFilter={setCustomerConsentFilter}
          customerSort={customerSort}
          setCustomerSort={setCustomerSort}
          setShowCustomerExport={setShowCustomerExport}
          setShowImportCustomers={setShowImportCustomers}
          setShowCampaignModal={setShowCampaignModal}
          generateLeadCaptureLink={generateLeadCaptureLink}
          setLeadCaptureLink={setLeadCaptureLink}
          setShowPortalLinkModal={setShowPortalLinkModal}
          setEditingCustomer={setEditingCustomer}
          setShowCustomerForm={setShowCustomerForm}
          setViewingCustomer={setViewingCustomer}
          setConfirmDeleteCustomer={setConfirmDeleteCustomer}
          totalPaidForDeal={totalPaidForDeal}
          requestCustomerConsent={requestCustomerConsent}
          vipCustomerIds={vipCustomerIds}
          notify={notify}
        />
      )}

      {tab === "firsat" && (
        <>
        <AppointmentRequestsPanel
          requests={pendingAppointmentRequests}
          customerById={customerById}
          vipCustomerIds={vipCustomerIds}
          appointmentSlotHasConflict={appointmentSlotHasConflict}
          sendAppointmentOffer={sendAppointmentOffer}
          onOpenDeal={(deal) => { setEditingDeal(deal); setShowDealForm(true); }}
        />
        <DealsTab
          customers={customers}
          deals={deals}
          filteredDeals={filteredDeals}
          companySettings={companySettings}
          dealAudience={dealAudience}
          setDealAudience={setDealAudience}
          updatePreferredCustomerType={updatePreferredCustomerType}
          dealView={dealView}
          changeDealView={changeDealView}
          isMembershipSector={isMembershipSector}
          dealTodayClassFilter={dealTodayClassFilter}
          setDealTodayClassFilter={setDealTodayClassFilter}
          dealMembershipExpiryFilter={dealMembershipExpiryFilter}
          setDealMembershipExpiryFilter={setDealMembershipExpiryFilter}
          dealQuickDateFilter={dealQuickDateFilter}
          setDealQuickDateFilter={setDealQuickDateFilter}
          setShowDealExport={setShowDealExport}
          setShowParasutExport={setShowParasutExport}
          setShowImportDeals={setShowImportDeals}
          generateLeadCaptureLink={generateLeadCaptureLink}
          setAppointmentLink={setAppointmentLink}
          setEditingDeal={setEditingDeal}
          setShowDealForm={setShowDealForm}
          dealWords={dealWords}
          dealSearch={dealSearch}
          setDealSearch={setDealSearch}
          dealStageFilter={dealStageFilter}
          setDealStageFilter={setDealStageFilter}
          dealPaymentFilter={dealPaymentFilter}
          setDealPaymentFilter={setDealPaymentFilter}
          dealSort={dealSort}
          setDealSort={setDealSort}
          dealFromDate={dealFromDate}
          setDealFromDate={setDealFromDate}
          dealToDate={dealToDate}
          setDealToDate={setDealToDate}
          expandedKanbanStages={expandedKanbanStages}
          setExpandedKanbanStages={setExpandedKanbanStages}
          dragDealId={dragDealId}
          setDragDealId={setDragDealId}
          attemptMoveDealStage={attemptMoveDealStage}
          customerById={customerById}
          appointmentDateTimeKey={appointmentDateTimeKey}
          dealPdfLabel={dealPdfLabel}
          setTeklifDeal={setTeklifDeal}
          setListingTextDeal={setListingTextDeal}
          notify={notify}
          setPaymentModeDeal={setPaymentModeDeal}
          handleUseSessionClick={handleUseSessionClick}
          setPaymentsDeal={setPaymentsDeal}
          dealKind={dealKind}
          setConfirmDeleteDeal={setConfirmDeleteDeal}
          totalPaidForDeal={totalPaidForDeal}
          pendingArrivalDealIds={pendingArrivalDealIds}
        />
        </>
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

      {tab === "gorevler" && (
        <Tasks
          tasks={tasks}
          customers={customers}
          deals={deals}
          teamMembers={teamRoster}
          currentUserId={session.user.id}
          currentUserEmail={session.user.email}
          onSave={upsertTask}
          onDelete={deleteTask}
          onToggleComplete={toggleTaskComplete}
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
          onOpenHelp={() => setShowAskDock(true)}
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
          <PriceListManager items={priceListItems} onAdd={addPriceListItem} onUpdate={updatePriceListItem} onDelete={deletePriceListItem} onReorder={reorderPriceListItems} onSyncPartners={updateParallelGroupPartners} sector={companySettings?.sector} resources={resources} />
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
            minProfitMarginPercent={companySettings?.minProfitMarginPercent}
            onAddStock={addStockItem}
            onUpdateStock={updateStockItem}
            onDeleteStock={deleteStockItem}
            onReorderStock={reorderStockItems}
            onAddIngredient={addPriceItemIngredient}
            onDeleteIngredient={deletePriceItemIngredient}
            onUpdateMinMargin={(percent) => upsertCompanySettings({ minProfitMarginPercent: percent })}
          />
        </div>
      )}

      {tab === "vitrin" && canEditCompanySettings && (
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, margin: "0 0 16px" }}>Vitrin</h1>
          <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: "0 0 20px" }}>
            Herkese açık Vitrin sayfanızda ne görüneceğini buradan yönetin. Linki paylaşmak için
            aşağıdaki "Vitrin Linki'ni Görüntüle" butonunu (veya Ayarlar &gt; Vitrin Linki'ni) kullanın.
          </p>
          <ShowcaseManager
            companySettings={companySettings}
            priceListItems={priceListItems}
            campaigns={showcaseCampaigns}
            onTogglePriceListVisible={(visible) => upsertCompanySettings({ showcasePriceListVisible: visible })}
            onAddCampaign={addShowcaseCampaign}
            onUpdateCampaign={updateShowcaseCampaign}
            onDeleteCampaign={deleteShowcaseCampaign}
            onReorderCampaigns={reorderShowcaseCampaigns}
            onSaveSlug={saveShowcaseSlug}
            onOpenLink={async () => {
              const link = await generateLeadCaptureLink("vitrin");
              if (link) setVitrinLink(link);
            }}
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
          onAddAppointment={(dateKey) => {
            setEditingDeal(null);
            setAppointmentPrefillDateTime(`${dateKey}T09:00`);
            setShowDealForm(true);
          }}
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
            draftScopeId={activeTeamId}
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
                    description="Randevu Alma Linki ve portaldan randevu alınabilecek gün/saatleri belirleyin"
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
                description={appointmentDateTimeKey ? "Müşteri girişsiz kendi randevusunu seçip talep etsin" : "⚠ Şu anda çalışmıyor - açıp düzeltin"}
                onClick={async () => {
                  setShowSettingsHub(false);
                  const link = await generateLeadCaptureLink("randevu-al");
                  if (link) setAppointmentLink(link);
                }}
              />
            )}
            <MenuRow
              icon="ti-building-store"
              label="Vitrin Linki"
              description="Ürünlerinizi, fiyat listenizi ve kampanyalarınızı herkese açık gösterin"
              onClick={async () => {
                setShowSettingsHub(false);
                const link = await generateLeadCaptureLink("vitrin");
                if (link) setVitrinLink(link);
              }}
            />
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
          {(() => {
            // Portal linkine ?c= ekliyoruz - müşteri linki açınca giriş ekranında
            // "Binerly" yerine bu işletmenin adı/logosu görünür (bkz. CustomerPortal.jsx
            // CustomerPortalEntry). Slug varsa okunabilir, yoksa lead_capture_token.
            const portalScope = companySettings?.showcaseSlug || companySettings?.leadCaptureToken;
            const portalLink = getPortalUrl(portalScope ? `/?c=${portalScope}` : "");
            return (
              <>
                <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: "0 0 16px" }}>
                  Bu linki (veya QR kodu) mevcut müşterilerinizle paylaşın - kayıtlı e-postalarıyla kendi hesaplarını oluşturup {dealWords.columnHeader.toLowerCase()} durumlarını görebilir, destek talebi açabilirler. Belirli bir müşteriye özel paylaşmak isterseniz Müşteriler listesindeki "Linki paylaş" butonunu da kullanabilirsiniz.
                </p>
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(portalLink)}`}
                  alt="QR kod"
                  style={{ display: "block", margin: "0 auto 16px" }}
                />
                <div style={{ display: "flex", gap: 8 }}>
                  <input readOnly value={portalLink} style={{ flex: 1, fontSize: 13 }} onFocus={(e) => e.target.select()} />
                  <button
                    type="button"
                    onClick={() => { navigator.clipboard.writeText(portalLink); notify("Link kopyalandı.", "success"); }}
                    style={{ background: "var(--fill-accent)", color: "var(--on-accent)", border: "none" }}
                  >
                    Kopyala
                  </button>
                </div>
              </>
            );
          })()}
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
          {!companySettings?.showcaseSlug && (
            <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "8px 0 0" }}>
              💡 Bu linkte rastgele bir kod var. İşletme Bilgileri'nden şirket adınızı girerseniz link otomatik olarak adınızı taşır (örn. binerly.com/lead/{slugify(companySettings?.companyName || "isletme-adiniz")}-a4f2b1). Adresi Ayarlar &gt; Vitrin'den kısaltabilirsiniz.
            </p>
          )}

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
          {!appointmentDateTimeKey && (
            <div style={{ background: "var(--surface-1)", border: "1px solid var(--text-warning, #b45309)", borderRadius: "var(--radius)", padding: "10px 12px", margin: "0 0 16px" }}>
              <p style={{ fontSize: 12.5, color: "var(--text-warning, #b45309)", fontWeight: 600, margin: "0 0 6px" }}>
                ⚠ Bu link şu anda çalışmıyor
              </p>
              <p style={{ fontSize: 12.5, color: "var(--text-secondary)", margin: "0 0 8px" }}>
                Randevu tarihi için gereken özel alan pasif - müşteriler linke girdiğinde "şu anda online randevu almıyor" mesajı görür.
              </p>
              <button
                type="button"
                onClick={async () => { if (await applySectorCustomFields(companySettings.sector)) notify("Düzeltildi, link artık çalışıyor.", "success"); }}
                style={{ fontSize: 12.5, background: "var(--text-warning, #b45309)", color: "#fff", border: "none", borderRadius: "var(--radius)", padding: "6px 10px" }}
              >
                Otomatik Düzelt
              </button>
            </div>
          )}
          <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: "0 0 16px" }}>
            Bu linki (veya QR kodu) Instagram bio'nuza, sitenize veya kartvizitinize koyun - hiç kaydı olmayan bir müşteri bile giriş yapmadan uygun bir saat seçip randevu talep edebilir. Link kalıcıdır - fiyat listenizi, hizmetlerinizi veya müsaitlik saatlerinizi güncellediğinizde linki tekrar almanıza gerek yok, değişiklikler otomatik yansır.
          </p>
          {priceListItems.some((item) => item.price != null && Number(item.price) === 0) ? (
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
          {!companySettings?.showcaseSlug && (
            <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "8px 0 0" }}>
              💡 Bu linkte rastgele bir kod var. İşletme Bilgileri'nden şirket adınızı girerseniz link otomatik olarak adınızı taşır (örn. binerly.com/randevu-al/{slugify(companySettings?.companyName || "isletme-adiniz")}-a4f2b1). Adresi Ayarlar &gt; Vitrin'den kısaltabilirsiniz.
            </p>
          )}

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

      {vitrinLink && (
        <Modal title="Vitrin Linki" onClose={() => setVitrinLink(null)}>
          <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: "0 0 16px" }}>
            Bu linki (veya QR kodu) Instagram bio'nuza, sitenize veya kartvizitinize koyun - Vitrin sekmesinden açtığınız fiyat listesi ve eklediğiniz kampanyalar burada görünür. Randevu sektörlerinde ayrıca öncesi/sonrası fotoğraflarından "Vitrin sayfasında göster" diye işaretlediğiniz çalışmalar da (müşteri adı olmadan) eklenir. Hiçbir şey yayınlamadıysanız sayfa boş bir karşılama mesajı gösterir.
          </p>
          <img
            src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(vitrinLink)}`}
            alt="QR kod"
            style={{ display: "block", margin: "0 auto 16px" }}
          />
          <div style={{ display: "flex", gap: 8 }}>
            <input readOnly value={vitrinLink} style={{ flex: 1, fontSize: 13 }} onFocus={(e) => e.target.select()} />
            <button
              type="button"
              onClick={() => { navigator.clipboard.writeText(vitrinLink); notify("Link kopyalandı.", "success"); }}
              style={{ background: "var(--fill-accent)", color: "var(--on-accent)", border: "none" }}
            >
              Kopyala
            </button>
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
            onFetchFields={async () => { if (await applySectorCustomFields(companySettings.sector)) notify("Özel alanlar sektör varsayılanlarına döndürüldü.", "success"); }}
          />
          <CustomFieldDefsManager customFieldDefs={customFieldDefs} onAdd={addCustomFieldDef} onUpdate={updateCustomFieldDef} onDelete={deleteCustomFieldDef} onReorder={reorderCustomFieldDefs} onReactivate={(id) => setCustomFieldDefsActive([id], true)} sector={companySettings?.sector} />
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
          <div style={{ marginBottom: 16 }}>
            <SegmentedControl value={businessHoursTab} onChange={setBusinessHoursTab} options={BUSINESS_HOURS_TABS} />
          </div>
          {businessHoursTab === "saatler" ? (
            <>
              <AppointmentAvailabilitySourceBox companySettings={companySettings} onSave={(patch) => upsertCompanySettings({ ...companySettings, ...patch })} />
              <AppointmentConcurrencyBox companySettings={companySettings} teamMemberCount={teamRoster.length} onSave={(patch) => upsertCompanySettings({ ...companySettings, ...patch })} />
              <AppointmentRequestModeBox companySettings={companySettings} onSave={(patch) => upsertCompanySettings({ ...companySettings, ...patch })} />
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
          dealTourBody={dealWords.tourBody}
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
          priceListItems={priceListItems}
          onSetServiceStaff={setPriceItemStaff}
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
        <Modal wide title={editingDeal?.id ? dealWords.editTitle : dealWords.newTitle} onClose={() => { setShowDealForm(false); setEditingDeal(null); setAppointmentPrefillDateTime(null); }}>
          <DealForm
            customers={customers}
            initial={editingDeal}
            defaultKdvRate={companySettings?.defaultKdvRate}
            preferredCustomerType={dealAudience}
            sector={companySettings?.sector}
            deals={deals}
            payments={payments}
            appointmentDateTimeKey={appointmentDateTimeKey}
            initialAppointmentDateTime={appointmentPrefillDateTime}
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
            priceItemIngredients={priceItemIngredients}
            stockItems={stockItems}
            minProfitMarginPercent={companySettings?.minProfitMarginPercent}
            businessHours={businessHours}
            staffShifts={staffShifts}
            staffLeaveRecords={staffLeaveRecords}
            draftScopeId={activeTeamId}
            initialLineItems={editingDeal ? dealLineItems.filter((li) => li.dealId === editingDeal.id) : []}
            dealLineItems={dealLineItems}
            hasPaymentConnection={paymentCredentials.length > 0}
            totalPaid={editingDeal ? totalPaidForDeal(editingDeal.id) : 0}
            attachments={attachments}
            appointmentPenaltyStrikeLimit={companySettings?.appointmentPenaltyStrikeLimit}
            appointmentPenaltyBurnsSession={companySettings?.appointmentPenaltyBurnsSession === true}
            appointmentConcurrency={companySettings?.appointmentConcurrency}
            appointmentAvailabilitySource={companySettings?.appointmentAvailabilitySource || "business_hours"}
            onUploadAttachment={uploadAttachment}
            onDownloadAttachment={downloadAttachment}
            onDeleteAttachment={deleteAttachment}
            onToggleAttachmentShare={toggleAttachmentShare}
            onToggleShowcase={toggleDealShowcase}
            onRequestPhotoConsent={requestPhotoConsent}
            onSaveTask={upsertTask}
            onSave={upsertDeal}
            onCancel={() => { setShowDealForm(false); setEditingDeal(null); setAppointmentPrefillDateTime(null); }}
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
        const apptDateForCharge = parseAppointmentDateTime(rawAppt);
        const hoursLeft = apptDateForCharge ? (apptDateForCharge.getTime() - Date.now()) / (60 * 60 * 1000) : null;
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
          isVip={vipCustomerIds.has(viewingCustomer.id)}
          customFieldDefs={customFieldDefs}
          groupClasses={groupClasses}
          groupClassEnrollments={groupClassEnrollments}
          attachments={attachments}
          onUploadAttachment={uploadAttachment}
          onDownloadAttachment={downloadAttachment}
          onDeleteAttachment={deleteAttachment}
          onAddActivity={addActivity}
          onRequestConsent={requestCustomerConsent}
          teamMembers={teamRoster}
          currentUserId={session.user.id}
          currentUserEmail={session.user.email}
          onSaveTask={upsertTask}
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
