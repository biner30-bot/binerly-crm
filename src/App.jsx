import React, { useState, useEffect, useRef } from "react";
import { supabase } from "./supabase";
import { Badge, Modal, MetricCard, InfoTip, Toast, ConfirmDialog, TagInput, IconButton, MenuRow, VoiceInputButton, GoogleAuthButton, AuthDivider, uid, formatTL, daysAgo, downloadXlsx, toWhatsAppNumber, WhatsAppIcon, useSessionTimeout, useTheme, matchesDateRange, DateRangeFilter, PANO_RANGES, getRangeBounds, inRange, WEEKDAYS, nextWeeklyOccurrence, NotificationBell, OnboardingTour } from "./shared";
import Finance, { rowToCompanyExpense } from "./Finance";
import { rowToChannelCredential, rowToChannelMessage } from "./Messages";
import Support, {
  rowToTicket,
  rowToTicketMessage,
  rowToKbArticle,
  getSlaStatus,
  TERMINAL_STATUSES,
  STATUSES,
} from "./Support";
import { ImportModal } from "./ImportExport";
import { TrackingScripts } from "./analytics";
import { PDF_TEMPLATES, buildMergeData, renderTemplateBlocks, TemplateGallery, TABLE_ROW_HEIGHT } from "./PdfTemplates";
import { TemplateEditor } from "./PdfTemplateEditor";
import {
  STAGES,
  SECTOR_PRESETS,
  stageLabel,
  isAppointmentSector,
  isIndividualFocusedSector,
  dealWordKind,
  supportsSelfBooking,
  supportsGroupClasses,
  groupClassWords,
  rowToCustomFieldDef,
  SectorOnboardingModal,
  CustomFieldDefsManager,
  CustomFieldsSection,
  TagBadges,
} from "./Sectors";

// Beklenen Gelir tahmini için basit, sabit olasılık ağırlıkları — kullanıcı
// başına ayarlanabilir değil, bilinçli olarak (KISS). Kazanıldı/kaybedildi
// zaten "openDeals" dışında tutulduğu için burada yer almıyor.
const STAGE_PROBABILITY = { ilk_gorusme: 0.1, teklif: 0.3, muzakere: 0.6 };

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

const LEAD_INFO_TEXT =
  "Son temas tarihine göre müşterinin ne kadar güncel takip edildiğini gösterir:\n" +
  "🟢 Sıcak — son 7 gün içinde temas edildi\n" +
  "🟠 Ilık — son 8-30 gün içinde temas edildi\n" +
  "⚪ Soğuk — 30 günden uzun süredir temas yok (veya hiç temas edilmedi)";

const PORTAL_INFO_TEXT =
  "Müşteri Portalı, müşterilerinizin kendi hesaplarıyla giriş yapıp tekliflerinin durumunu görebildiği, " +
  "destek talebi açabildiği ve sizinle mesajlaşabildiği ayrı bir alan (binerly.com/portal).\n\n" +
  "Var — bu müşteri portala kayıt olup kendi hesabını bu müşteri kaydına bağlamış.\n" +
  "— — bu müşteri henüz portala giriş yapmamış. Müşterinizin, kayıtlı e-posta adresiyle " +
  "portal üzerinden kendi hesabını oluşturması yeterli, sizin ayrıca bir davet göndermenize gerek yok.";

const DEAL_WORD_FORMS = {
  teklif: { bare: "teklif", pdfLabel: "Teklif PDF", acc: "teklifi", dat: "teklife", plural: "teklifler", pluralAcc: "teklifleri", gen: "teklifin", genPlural: "tekliflerin", loc: "teklifte", pluralLoc: "tekliflerde", ctaLabel: "Teklifi Görüntüle", possYours: "Teklifiniz" },
  randevu: { bare: "randevu", pdfLabel: "Randevu Özeti PDF", acc: "randevuyu", dat: "randevuya", plural: "randevular", pluralAcc: "randevuları", gen: "randevunun", genPlural: "randevuların", loc: "randevuda", pluralLoc: "randevularda", ctaLabel: "Randevuyu Görüntüle", possYours: "Randevunuz" },
  uyelik: { bare: "üyelik", pdfLabel: "Üyelik Özeti PDF", acc: "üyeliği", dat: "üyeliğe", plural: "üyelikler", pluralAcc: "üyelikleri", gen: "üyeliğin", genPlural: "üyeliklerin", loc: "üyelikte", pluralLoc: "üyeliklerde", ctaLabel: "Üyeliği Görüntüle", possYours: "Üyeliğiniz" },
};

// Müşteri Takibi sekmesindeki liste UI'ı (ekle butonu, arama, boş durumlar,
// tablo başlığı, dışa aktar/düzenle modal başlıkları) için hazır metinler.
const DEAL_TAB_STRINGS = {
  teklif: {
    addLabel: "Teklif ekle",
    searchPlaceholder: "Teklif ara (başlık, müşteri)...",
    openFilterLabel: "Açık teklifler",
    openValueLabel: "Açık teklif değeri",
    openGenPluralPhrase: "Açık tekliflerin",
    emptyDefault: "Henüz teklif eklenmedi.",
    emptySearch: "Aramayla eşleşen teklif yok.",
    columnHeader: "Teklif",
    exportTitle: "Teklifleri Dışa Aktar",
    editTitle: "Teklifi düzenle",
    deleteTitle: "Teklifi sil",
    newTitle: "Yeni teklif",
    exportFilename: "teklifler.xlsx",
  },
  randevu: {
    addLabel: "Randevu ekle",
    searchPlaceholder: "Randevu ara (başlık, müşteri)...",
    openFilterLabel: "Bekleyen randevular",
    openValueLabel: "Bekleyen randevu değeri",
    openGenPluralPhrase: "Bekleyen randevuların",
    emptyDefault: "Henüz randevu eklenmedi.",
    emptySearch: "Aramayla eşleşen randevu yok.",
    columnHeader: "Randevu",
    exportTitle: "Randevuları Dışa Aktar",
    editTitle: "Randevuyu düzenle",
    deleteTitle: "Randevuyu sil",
    newTitle: "Yeni randevu",
    exportFilename: "randevular.xlsx",
  },
  uyelik: {
    addLabel: "Üyelik ekle",
    searchPlaceholder: "Üyelik ara (başlık, müşteri)...",
    openFilterLabel: "Bekleyen üyelikler",
    openValueLabel: "Bekleyen üyelik değeri",
    openGenPluralPhrase: "Bekleyen üyeliklerin",
    emptyDefault: "Henüz üyelik eklenmedi.",
    emptySearch: "Aramayla eşleşen üyelik yok.",
    columnHeader: "Üyelik",
    exportTitle: "Üyelikleri Dışa Aktar",
    editTitle: "Üyeliği düzenle",
    deleteTitle: "Üyeliği sil",
    newTitle: "Yeni üyelik",
    exportFilename: "uyelikler.xlsx",
  },
};

const dealActionsInfoText = (sector) => {
  const forms = DEAL_WORD_FORMS[dealWordKind(sector)];
  return (
    `📄 ${forms.pdfLabel} — markalı, yazdırılabilir ${forms.bare} belgesi oluşturur.\n` +
    `🔗 Onay linki — müşterinin "onaylıyorum" diyebileceği bir link kopyalar, siz WhatsApp/e-posta ile gönderirsiniz. Müşteri, ` +
    `sisteme kayıtlı e-postasıyla giriş yapmadan ${forms.acc} göremez/onaylayamaz — bu yüzden müşterinin e-postası kayıtlı olmalı. ` +
    `Onaylayınca satırda yeşil "Onaylandı ✓" rozeti otomatik görünür. Bu, resmi/güvenli elektronik imza değildir — ` +
    `sadece takip ve bildirim amaçlıdır, hukuki bağlayıcılığı önemli anlaşmalarda ıslak imza veya nitelikli e-imza kullanın.\n` +
    `💵 Tahsilat — bu ${forms.dat} yapılan ödemeleri kaydedin/görün.\n` +
    `📋 Kopyala — aynı müşteri/tutar/etiketlerle sıfırdan yeni bir ${forms.bare} formu açar (tekrar eden işler için), hiçbir şeyi otomatik kaydetmez.\n` +
    "✏️ Düzenle · 🗑️ Sil"
  );
};

const CUSTOMER_EMAIL_INFO_TEXT =
  "Güncel bir e-posta girmeniz önemli — teklif onay linki, müşteri portalı girişi ve hatırlatma e-postaları gibi " +
  "özellikler ancak müşterinin e-postası kayıtlıysa çalışır. E-posta yoksa bu özellikler o müşteri için kullanılamaz.";

const CUSTOMER_TYPE_INFO_TEXT =
  "Kurumsal/Bireysel seçimi sadece bir etiket değil — Sektör alanının görünüp görünmeyeceğini, hangi özel alanların çıkacağını " +
  "ve teklif formundaki bazı metinleri (\"Kayıp nedeni\" yerine \"İptal nedeni\" gibi) uygulamanın birçok yerinde değiştirir. " +
  "Aşama isimleri ise önce sektörünüze (varsa) göre belirlenir, sektör bir aşamayı özelleştirmemişse kurumsal/bireysel ayrımına göre değişir.";

const SECTOR_FIELD_INFO_TEXT =
  "Bu, müşterinin kendi sektörü — Ayarlar'daki \"Sektör & Özel Alanlar\"da seçtiğiniz KENDİ şirket sektörünüzden " +
  "farklı bir alan. Burada seçtiğiniz değer, teklif formunda etiket önerisi olarak çıkabilir.";

const TAGS_INFO_TEXT =
  "Serbest metin etiketler — arama/filtrelemede ve listelerde kayda hızlıca göz atmak için kullanılır. " +
  "Sektörünüze göre bazı etiketler öneri olarak çıkar, istediğiniz herhangi bir kelimeyi de ekleyebilirsiniz.";

const SESSION_PACKAGE_INFO_TEXT =
  "Kuaför/klinik gibi paket/seans bazlı satış yapıyorsanız kullanın — toplam ve kullanılan seans sayısını siz " +
  "elle güncellersiniz (\"Seans kullanıldı\" butonuyla), kullanılan sayı toplama ulaşınca kart üzerinde " +
  "\"Paket tamamlandı\" rozeti otomatik görünür.";

const kdvRateInfoText = (sector) => {
  const kind = dealWordKind(sector);
  const label = kind === "uyelik" ? "Üyelik Özeti PDF'inde" : kind === "randevu" ? "Randevu Özeti PDF'inde" : "yazdırılan teklif PDF'inde";
  return (
    `Yukarıdaki Tutar zaten KDV dahil, müşteriden alınan toplam tutarı DEĞİŞTİRMEZ — sadece ${label} ` +
    "\"Ara Toplam / KDV / Genel Toplam\" satırlarının nasıl bölüneceğini belirler."
  );
};

const ASSIGNEE_INFO_TEXT =
  "Bu teklif kazanıldığında, Pano'daki \"Personel Performansı\" bölümünde seçtiğiniz kişinin altında sayılır.";

const cariBakiyeInfoText = (sector) => {
  const kind = dealWordKind(sector);
  const noun = kind === "uyelik" ? "üyeliklerinin" : kind === "randevu" ? "randevularının" : "tekliflerinin";
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
    phone: r.phone || "",
    email: r.email || "",
    notes: r.notes || "",
    lastContact: r.last_contact,
    createdAt: r.created_at,
    portalUserId: r.portal_user_id || null,
    deletedAt: r.deleted_at || null,
    tags: r.tags || [],
    customFields: r.custom_fields || {},
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
    connectedAt: r.connected_at,
  };
}

const LOST_REASONS = ["Yüksek fiyat", "Rakip tercih edildi", "Bütçe yok", "Zamanlama uymadı", "Vazgeçti", "Diğer"];

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
  { key: "phone", label: "Telefon" },
  { key: "email", label: "E-posta" },
  { key: "notes", label: "Not", hideInPreview: true },
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
    createdAt: r.created_at,
    deletedAt: r.deleted_at || null,
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
  };
}

function rowToPriceListItem(r) {
  return { id: r.id, name: r.name, price: r.price };
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

function rowToBusinessHours(r) {
  return {
    id: r.id, weekday: r.weekday,
    startTime: (r.start_time || "").slice(0, 5),
    endTime: (r.end_time || "").slice(0, 5),
    slotDurationMinutes: r.slot_duration_minutes,
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
    preferredCustomerType: r.preferred_customer_type || "kurumsal",
    pdfTemplateKey: r.pdf_template_key || null,
  };
}

function CustomerForm({ initial, customFieldDefs = [], sectorTags = [], preferredCustomerType, onSave, onCancel, onPreferredTypeChange }) {
  const initialIsCustomSector = initial?.sector && !SECTORS.includes(initial.sector);
  const [customerType, setCustomerType] = useState(initial?.customerType || preferredCustomerType || "kurumsal");
  const [name, setName] = useState(initial?.name || "");
  const [sector, setSector] = useState(initialIsCustomSector ? "Diğer" : (initial?.sector || SECTORS[0]));
  const [customSector, setCustomSector] = useState(initialIsCustomSector ? initial.sector : "");
  const [region, setRegion] = useState(initial?.region || "");
  const [phone, setPhone] = useState(initial?.phone || "");
  const [email, setEmail] = useState(initial?.email || "");
  const [notes, setNotes] = useState(initial?.notes || "");
  const [tags, setTags] = useState(initial?.tags || []);
  const [customFields, setCustomFields] = useState(initial?.customFields || {});
  const isKurumsal = customerType === "kurumsal";
  const defsForEntity = customFieldDefs.filter((d) => d.entity === "customer" && (!d.audience || d.audience === customerType));

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!name.trim()) return;
        if (isKurumsal && sector === "Diğer" && !customSector.trim()) return;
        onSave({
          id: initial?.id || uid(),
          customerType,
          name: name.trim(),
          sector: isKurumsal ? (sector === "Diğer" ? customSector.trim() : sector) : "",
          region: region.trim(),
          phone: phone.trim(),
          email: email.trim(),
          notes: notes.trim(),
          tags,
          customFields,
          lastContact: initial?.lastContact || new Date().toISOString(),
          createdAt: initial?.createdAt || new Date().toISOString(),
        });
      }}
    >
      <div style={{ marginBottom: 12 }}>
        <label style={{ fontSize: 13, color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: 4, marginBottom: 4 }}>Müşteri tipi <InfoTip text={CUSTOMER_TYPE_INFO_TEXT} placement="bottom" /></label>
        <select
          value={customerType}
          onChange={(e) => {
            setCustomerType(e.target.value);
            if (!initial?.id) onPreferredTypeChange?.(e.target.value);
          }}
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
      {isKurumsal && sector === "Diğer" && (
        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 13, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Sektör adı</label>
          <input value={customSector} onChange={(e) => setCustomSector(e.target.value)} placeholder="Sektörünüzü yazın" style={{ width: "100%" }} />
        </div>
      )}
      <div style={{ display: "flex", gap: 12, marginBottom: 12 }}>
        <div style={{ flex: 1 }}>
          <label style={{ fontSize: 13, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Telefon</label>
          <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0532 000 00 00" style={{ width: "100%" }} />
        </div>
        <div style={{ flex: 1 }}>
          <label style={{ fontSize: 13, color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: 4, marginBottom: 4 }}>E-posta (Önemli) <InfoTip text={CUSTOMER_EMAIL_INFO_TEXT} /></label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={isKurumsal ? "info@firma.com" : "ayse@gmail.com"} style={{ width: "100%" }} />
        </div>
      </div>
      <div style={{ marginBottom: 12 }}>
        <label style={{ fontSize: 13, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Not</label>
        <div style={{ display: "flex", gap: 6, alignItems: "flex-start" }}>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={isKurumsal ? "Örn. yaz aylarında sipariş hacmi artıyor" : "Örn. genelde akşamları ulaşmak daha kolay"} style={{ flex: 1, minHeight: 70, resize: "vertical" }} />
          <VoiceInputButton onResult={(text) => setNotes((prev) => (prev ? `${prev} ${text}` : text))} />
        </div>
      </div>
      <div style={{ marginBottom: 16 }}>
        <label style={{ fontSize: 13, color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: 4, marginBottom: 4 }}>Etiketler <InfoTip text={TAGS_INFO_TEXT} /></label>
        <TagInput tags={tags} onChange={setTags} suggestions={sectorTags} />
      </div>
      <CustomFieldsSection defs={defsForEntity} values={customFields} onChange={setCustomFields} />
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button type="button" onClick={onCancel}>Vazgeç</button>
        <button type="submit" style={{ background: "var(--fill-accent)", color: "var(--on-accent)", border: "none" }}>Kaydet</button>
      </div>
    </form>
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
          sector: initial?.sector || null,
        });
      }}
    >
      <div style={{ marginBottom: 12 }}>
        <label style={{ fontSize: 13, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>İşletme adı</label>
        <input value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="Akın Diş Kliniği" style={{ width: "100%" }} />
      </div>
      <div style={{ marginBottom: 12 }}>
        <label style={{ fontSize: 13, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Adres</label>
        <textarea value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Firma adresi" style={{ width: "100%", minHeight: 60, resize: "vertical" }} />
      </div>
      <div style={{ display: "flex", gap: 12, marginBottom: 12 }}>
        <div style={{ flex: 1 }}>
          <label style={{ fontSize: 13, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Telefon</label>
          <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0532 000 00 00" style={{ width: "100%" }} />
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
        <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "4px 0 0" }}>PNG, JPG veya SVG — en fazla 2 MB. Teklif çıktısında ve müşterinin gördüğü sayfalarda görünür.</p>
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
            text={
              `Bir ${DEAL_WORD_FORMS[dealWordKind(initial?.sector)].gen} aşaması her değiştiğinde (${STAGES.map((s) => stageLabel(s.id, "kurumsal", initial?.sector)).join(", ")}) o aşamaya özel bir mail gider — 2. ve 3. aşamalarda onay linki de eklenir. Destek talebi durumu değiştiğinde, yeni bir yanıt yazıldığında ve ödeme alındığında da müşteriye bilgilendirme gider.\n\n` +
              `Yanlışlıkla bir ${DEAL_WORD_FORMS[dealWordKind(initial?.sector)].acc} başka bir aşamaya sürüklerseniz endişelenmeyin: mail hemen gitmez, 45 saniye beklenir — bu süre içinde aşamayı düzeltirseniz mail hiç gitmez, sadece son karar verdiğiniz aşama için gider.`
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
            <InfoTip text="Tarih & Saat tipindeki özel alanı olan kayıtlarda, o saatten 2 saat önce müşteriye otomatik bir hatırlatma e-postası gider. Bu kutuyu kapatırsanız hiçbir hatırlatma e-postası gönderilmez — diğer bildirimler (aşama değişikliği, destek talebi, ödeme) bundan etkilenmez." />
          </label>
        </div>
      )}
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button type="button" onClick={onCancel}>Vazgeç</button>
        <button type="submit" style={{ background: "var(--fill-accent)", color: "var(--on-accent)", border: "none" }}>Kaydet</button>
      </div>
    </form>
  );
}

function DealForm({ customers, initial, defaultKdvRate, preferredCustomerType, sector, customFieldDefs = [], sectorTags = [], teamMembers = [], currentUserId, currentUserEmail, titleSuggestions = [], priceListItems = [], initialLineItems = [], onSave, onCancel }) {
  const [customerId, setCustomerId] = useState(
    initial?.customerId || customers.find((c) => c.customerType === preferredCustomerType)?.id || customers[0]?.id || ""
  );
  const selectedCustomerType = customers.find((c) => c.id === customerId)?.customerType || "kurumsal";
  const [title, setTitle] = useState(initial?.title || "");
  const [value, setValue] = useState(initial?.value ?? "");
  const [selectedPriceItemId, setSelectedPriceItemId] = useState("");
  // Kalemler tamamen opsiyonel — boşsa Tutar bugünkü gibi elle girilir, hiçbir
  // şey değişmez. Dolu ise Tutar bunların toplamına otomatik kilitlenir.
  const [lineItems, setLineItems] = useState(
    initialLineItems.map((li) => ({ localId: li.id, description: li.description, quantity: li.quantity, unitPrice: li.unitPrice }))
  );
  const lineItemsTotal = lineItems.reduce((sum, li) => sum + (Number(li.quantity) || 0) * (Number(li.unitPrice) || 0), 0);
  const [cost, setCost] = useState(initial?.cost ?? "");
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
  const [lostReason, setLostReason] = useState(initial?.lostReason || LOST_REASONS[0]);
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
  const [tags, setTags] = useState(initial?.tags || []);
  const [customFields, setCustomFields] = useState(initial?.customFields || {});
  const [assignedTo, setAssignedTo] = useState(initial?.assignedTo || currentUserId || "");
  const [notifyCustomer, setNotifyCustomer] = useState(initial?.notifyCustomer || false);
  const defsForEntity = customFieldDefs.filter((d) => d.entity === "deal" && (!d.audience || d.audience === selectedCustomerType));
  const selectedCustomerEmail = customers.find((c) => c.id === customerId)?.email || "";

  useEffect(() => {
    if (lineItems.length > 0) setValue(String(lineItemsTotal));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lineItemsTotal, lineItems.length]);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!customerId || !title.trim()) return;
        if (isClosingStage && closedDate < dealDate) {
          setDateError("Bitiş tarihi, başlangıç tarihinden önce olamaz.");
          return;
        }
        setDateError("");
        if (isPackageDeal && Number(sessionTotal) < 1) {
          setSessionError("Toplam seans sayısı en az 1 olmalı.");
          return;
        }
        setSessionError("");
        onSave({
          id: initial?.id || uid(),
          customerId,
          title: title.trim(),
          value: Number(value) || 0,
          cost: Number(cost) || 0,
          kdvRate,
          stage,
          reminder: reminder.trim(),
          reminderDate: reminderDate || null,
          lostReason: stage === "kaybedildi" ? lostReason : "",
          isPackageDeal,
          sessionTotal: isPackageDeal ? Number(sessionTotal) || 0 : null,
          sessionUsed: isPackageDeal ? Math.min(Number(sessionUsed) || 0, Number(sessionTotal) || 0) : 0,
          tags,
          customFields,
          lineItems: lineItems
            .filter((li) => li.description.trim())
            .map((li) => ({ description: li.description.trim(), quantity: Number(li.quantity) || 1, unitPrice: Number(li.unitPrice) || 0 })),
          assignedTo: assignedTo || null,
          notifyCustomer,
          approvalToken: initial?.approvalToken || null,
          approvedAt: initial?.approvedAt || null,
          // "T00:00" ekliyoruz çünkü saatsiz "YYYY-MM-DD" string'i JS'de UTC gece
          // yarısı sayılıyor — Türkiye saatinde bu gece 03:00 gibi görünüyordu.
          createdAt: new Date(`${dealDate}T${dealTime || "00:00"}`).toISOString(),
          closedAt: isClosingStage ? new Date(`${closedDate}T00:00`).toISOString() : null,
        });
      }}
    >
      <div style={{ marginBottom: 12 }}>
        <label style={{ fontSize: 13, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Müşteri</label>
        {initial ? (
          <p style={{ margin: 0, fontSize: 14, fontWeight: 500 }}>{customers.find((c) => c.id === customerId)?.name || "Bilinmeyen müşteri"}</p>
        ) : customers.length === 0 ? (
          <p style={{ fontSize: 13, color: "var(--text-muted)" }}>Önce bir müşteri ekleyin.</p>
        ) : (
          <select value={customerId} onChange={(e) => setCustomerId(e.target.value)} style={{ width: "100%" }}>
            {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        )}
      </div>
      {priceListItems.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 13, color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: 4, marginBottom: 4 }}>
            Ürün/Hizmet
            <InfoTip text="Listeden seçmek başlığı ve tutarı otomatik doldurur, sonrasında yine de değiştirebilirsiniz. Ayarlar → Ürün & Hizmet Fiyat Listesi'nden yönetilir." />
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
            {priceListItems.map((p) => <option key={p.id} value={p.id}>{p.name} — {formatTL(p.price)}</option>)}
          </select>
        </div>
      )}
      <div style={{ marginBottom: 12 }}>
        <label style={{ fontSize: 13, color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: 4, marginBottom: 4 }}>
          Kalemler (opsiyonel)
          <InfoTip text="Birden fazla ürün/hizmet satırı eklerseniz Tutar bunların toplamına otomatik hesaplanır. Hiç kalem eklemezseniz Tutar'ı yine elle girebilirsiniz." />
        </label>
        {lineItems.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 8 }}>
            {lineItems.map((li, i) => (
              <div key={li.localId ?? i} style={{ border: "0.5px solid var(--border)", borderRadius: "var(--radius)", padding: 8 }}>
                <div style={{ display: "flex", gap: 6, alignItems: "flex-end", marginBottom: 6 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <label style={{ fontSize: 11, color: "var(--text-muted)", display: "block", marginBottom: 2 }}>Açıklama</label>
                    <input
                      value={li.description}
                      onChange={(e) => setLineItems((prev) => prev.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)))}
                      placeholder="Örn. Muayene"
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
                  const newRow = { localId: uid(), description: item.name, quantity: 1, unitPrice: item.price };
                  if (prev.length === 0 && title.trim() && Number(value) > 0) {
                    return [{ localId: uid(), description: title.trim(), quantity: 1, unitPrice: Number(value) }, newRow];
                  }
                  return [...prev, newRow];
                });
              }}
              style={{ fontSize: 12 }}
            >
              <option value="">Fiyat listesinden kalem ekle…</option>
              {priceListItems.map((p) => <option key={p.id} value={p.id}>{p.name} — {formatTL(p.price)}</option>)}
            </select>
          )}
        </div>
      </div>
      <div style={{ marginBottom: 12 }}>
        <label style={{ fontSize: 13, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Başlık</label>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={sector === "spor_merkezi" ? "Salon üyeliği / Reformer Pilates" : selectedCustomerType === "bireysel" ? "İlk randevu / danışmanlık" : "Yıllık tedarik anlaşması"} list="deal-title-suggestions" style={{ width: "100%" }} />
        <datalist id="deal-title-suggestions">
          {titleSuggestions.map((t) => <option key={t} value={t} />)}
        </datalist>
      </div>
      <div style={{ display: "flex", gap: 12, marginBottom: 12 }}>
        <div style={{ flex: 2 }}>
          <label style={{ fontSize: 13, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>
            Tutar (TL) <span style={{ fontWeight: 400, color: "var(--text-muted)" }}>— KDV dahil{lineItems.length > 0 ? ", kalemlerden otomatik" : ""}</span>
          </label>
          <input type="number" min="0" value={value} disabled={lineItems.length > 0} onChange={(e) => setValue(e.target.value)} placeholder="0" style={{ width: "100%" }} />
        </div>
        <div style={{ flex: 1 }}>
          <label style={{ fontSize: 13, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Gider (TL)</label>
          <input type="number" min="0" value={cost} onChange={(e) => setCost(e.target.value)} placeholder="0" style={{ width: "100%" }} />
        </div>
        <div style={{ flex: 1 }}>
          <label style={{ fontSize: 13, color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: 4, marginBottom: 4 }}>KDV oranı <InfoTip text={kdvRateInfoText(sector)} /></label>
          <select value={kdvRate} onChange={(e) => setKdvRate(Number(e.target.value))} style={{ width: "100%" }}>
            <option value={20}>%20</option>
            <option value={10}>%10</option>
            <option value={1}>%1</option>
            <option value={0}>%0</option>
          </select>
        </div>
      </div>
      <div style={{ display: "flex", gap: 12, marginBottom: 12 }}>
        <div style={{ flex: 1 }}>
          <label style={{ fontSize: 13, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Tarih</label>
          <input type="date" value={dealDate} onChange={(e) => setDealDate(e.target.value)} style={{ width: "100%" }} />
        </div>
        <div style={{ flex: 1 }}>
          <label style={{ fontSize: 13, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Saat <span style={{ fontWeight: 400, color: "var(--text-muted)" }}>(opsiyonel)</span></label>
          <input type="time" value={dealTime} onChange={(e) => setDealTime(e.target.value)} style={{ width: "100%" }} />
        </div>
        <div style={{ flex: 1 }}>
          <label style={{ fontSize: 13, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Aşama</label>
          <select value={stage} onChange={(e) => setStage(e.target.value)} style={{ width: "100%" }}>
            {STAGES.map((s) => <option key={s.id} value={s.id}>{stageLabel(s.id, selectedCustomerType, sector)}</option>)}
          </select>
        </div>
      </div>
      {isClosingStage && (
        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 13, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>
            {selectedCustomerType === "bireysel"
              ? (stage === "kazanildi" ? "Tamamlanma / fatura tarihi" : "İptal tarihi")
              : (stage === "kazanildi" ? "Kapanma / fatura tarihi" : "Kapanma tarihi")}
          </label>
          <input type="date" min={dealDate} value={closedDate} onChange={(e) => setClosedDate(e.target.value)} style={{ width: "100%" }} />
          {dateError && <p style={{ fontSize: 12, color: "var(--text-danger)", margin: "4px 0 0" }}>{dateError}</p>}
        </div>
      )}
      <div style={{ marginBottom: 12 }}>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--text-secondary)", cursor: "pointer" }}>
          <input type="checkbox" checked={isPackageDeal} onChange={(e) => setIsPackageDeal(e.target.checked)} />
          Bu bir seans/paket satışı
          <InfoTip text={SESSION_PACKAGE_INFO_TEXT} />
        </label>
      </div>
      {isPackageDeal && (
        <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 13, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Toplam seans sayısı</label>
            <input type="number" min="1" value={sessionTotal} onChange={(e) => setSessionTotal(e.target.value)} style={{ width: "100%" }} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 13, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Kullanılan seans sayısı</label>
            <input type="number" min="0" value={sessionUsed} onChange={(e) => setSessionUsed(e.target.value)} style={{ width: "100%" }} />
          </div>
          {sessionError && <p style={{ fontSize: 12, color: "var(--text-danger)", margin: "4px 0 0" }}>{sessionError}</p>}
        </div>
      )}
      <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
        <div style={{ flex: 2 }}>
          <label style={{ fontSize: 13, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Hatırlatma notu</label>
          <div style={{ display: "flex", gap: 6 }}>
            <input value={reminder} onChange={(e) => setReminder(e.target.value)} placeholder="Yarın takip araması yap" style={{ flex: 1 }} />
            <VoiceInputButton onResult={(text) => setReminder((prev) => (prev ? `${prev} ${text}` : text))} />
          </div>
        </div>
        <div style={{ flex: 1 }}>
          <label style={{ fontSize: 13, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Hatırlatma tarihi</label>
          <input type="date" value={reminderDate} onChange={(e) => setReminderDate(e.target.value)} style={{ width: "100%" }} />
          <div style={{ display: "flex", gap: 4, marginTop: 4 }}>
            {[["Bugün", 0], ["Yarın", 1], ["1 hafta sonra", 7]].map(([label, days]) => (
              <button
                key={label}
                type="button"
                onClick={() => setReminderDate(new Date(Date.now() + days * 86400000).toISOString().slice(0, 10))}
                style={{ fontSize: 11, padding: "3px 8px" }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>
      {reminder.trim() && reminderDate && (
        <div style={{ marginBottom: 16 }}>
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
      {teamMembers.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 13, color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: 4, marginBottom: 4 }}>Sorumlu <InfoTip text={ASSIGNEE_INFO_TEXT} /></label>
          <select value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)} style={{ width: "100%" }}>
            {currentUserId && <option value={currentUserId}>Ben ({currentUserEmail})</option>}
            {teamMembers.filter((m) => m.id !== currentUserId).map((m) => <option key={m.id} value={m.id}>{m.name || m.email}</option>)}
          </select>
        </div>
      )}
      {stage === "kaybedildi" && (
        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 13, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>{selectedCustomerType === "bireysel" ? "İptal nedeni" : "Kayıp nedeni"}</label>
          <select value={lostReason} onChange={(e) => setLostReason(e.target.value)} style={{ width: "100%" }}>
            {LOST_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
      )}
      <div style={{ marginBottom: 16 }}>
        <label style={{ fontSize: 13, color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: 4, marginBottom: 4 }}>Etiketler <InfoTip text={TAGS_INFO_TEXT} /></label>
        <TagInput tags={tags} onChange={setTags} suggestions={sectorTags} />
      </div>
      <CustomFieldsSection defs={defsForEntity} values={customFields} onChange={setCustomFields} />
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button type="button" onClick={onCancel}>Vazgeç</button>
        <button type="submit" disabled={customers.length === 0} style={{ background: "var(--fill-accent)", color: "var(--on-accent)", border: "none" }}>Kaydet</button>
      </div>
    </form>
  );
}

function paymentDateLabel(dateStr) {
  return new Date(dateStr).toLocaleDateString("tr-TR", { day: "numeric", month: "short", year: "numeric" });
}

function DealPayments({ deal, payments, sector, onAddPayment, onDeletePayment }) {
  const [amount, setAmount] = useState("");
  const [paidAt, setPaidAt] = useState(new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const sorted = payments.slice().sort((a, b) => new Date(b.paidAt) - new Date(a.paidAt));
  const totalPaid = payments.reduce((sum, p) => sum + (p.amount || 0), 0);
  const remaining = deal.value - totalPaid;

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
    await onAddPayment({ dealId: deal.id, amount: n, paidAt, note: note.trim() });
    setAmount("");
    setNote("");
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
        <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 200, overflowY: "auto" }}>
          {sorted.map((p) => (
            <div key={p.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 13 }}>
              <span>{formatTL(p.amount)} <span style={{ color: "var(--text-muted)" }}>· {paymentDateLabel(p.paidAt)}{p.note ? ` · ${p.note}` : ""}</span></span>
              <IconButton icon="ti-trash" title="Sil" size="sm" onClick={() => onDeletePayment(p.id)} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function activityDateLabel(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleDateString("tr-TR", { day: "numeric", month: "short", year: "numeric" }) +
    " · " + d.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
}

function CustomerDetail({ customer, deals, payments, activities, sector, customFieldDefs = [], groupClasses = [], groupClassEnrollments = [], onAddActivity, onClose }) {
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
                  {g.name} — {WEEKDAYS[g.weekday - 1]} {g.startTime}
                </p>
              ))}
            </div>
          </div>
        )}
      </div>

      {customerDeals.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <p style={{ fontSize: 13, fontWeight: 500, margin: "0 0 6px" }}>{dealWordKind(sector) === "uyelik" ? "Üyelikler" : dealWordKind(sector) === "randevu" ? "Randevular" : "Teklifler"}</p>
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
          <input value={content} onChange={(e) => setContent(e.target.value)} placeholder={dealWordKind(sector) === "uyelik" ? "Örn. üyelik paketi görüşüldü" : dealWordKind(sector) === "randevu" ? "Örn. randevu detayları görüşüldü" : "Örn. fiyat teklifi görüşüldü"} style={{ flex: 1 }} />
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

function TeklifPrint({ deal, customer, companySettings, pdfTemplates, dealLineItems, onClose }) {
  const kdvRate = deal.kdvRate ?? 20;
  const netAmount = kdvRate > 0 ? deal.value / (1 + kdvRate / 100) : deal.value;
  const kdvAmount = deal.value - netAmount;
  const [downloading, setDownloading] = useState(false);
  const [validityDays, setValidityDays] = useState(15);
  const [noExpiry, setNoExpiry] = useState(false);
  const [extraNote, setExtraNote] = useState("");
  const noun = isIndividualFocusedSector(companySettings?.sector) ? "fiyat" : "teklif";
  const belgeBasligi = dealWordKind(companySettings?.sector) === "uyelik" ? "ÜYELİK ÖZETİ" : dealWordKind(companySettings?.sector) === "randevu" ? "RANDEVU ÖZETİ" : "TEKLİF";
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
    const [{ default: jsPDF }, { default: html2canvas }] = await Promise.all([import("jspdf"), import("html2canvas")]);
    const node = document.getElementById("teklif-print");
    const canvas = await html2canvas(node, { scale: 2, backgroundColor: "#ffffff" });
    const imgData = canvas.toDataURL("image/png");
    const pdf = new jsPDF({ unit: "px", format: [canvas.width, canvas.height] });
    pdf.addImage(imgData, "PNG", 0, 0, canvas.width, canvas.height);
    pdf.save(`${dealWordKind(companySettings?.sector) === "uyelik" ? "Üyelik Özeti" : dealWordKind(companySettings?.sector) === "randevu" ? "Randevu Özeti" : "Teklif"} - ${customer?.name || "Musteri"} - ${deal.title}.pdf`);
    setDownloading(false);
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

function CampaignModal({ customers, replyTo, companyName, logoUrl, onClose }) {
  const emailCustomers = customers.filter((c) => c.email);
  const [selected, setSelected] = useState(() => new Set(emailCustomers.map((c) => c.id)));
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState("");
  const [consentConfirmed, setConsentConfirmed] = useState(false);

  const toggle = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const send = async (e) => {
    e.preventDefault();
    const recipients = emailCustomers.filter((c) => selected.has(c.id)).map((c) => c.email);
    if (recipients.length === 0 || !subject.trim() || !message.trim() || !consentConfirmed) return;
    setSending(true);
    setResult("");
    try {
      const res = await fetch("/api/send-campaign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipients, subject, message, replyTo, companyName, logoUrl }),
      });
      const data = await res.json();
      if (res.ok) setResult(`${recipients.length} kişiye gönderildi.`);
      else setResult(data.error || "Gönderim başarısız oldu.");
    } catch {
      setResult("Gönderim başarısız oldu.");
    }
    setSending(false);
  };

  return (
    <Modal title="E-posta kampanyası" onClose={onClose}>
      <form onSubmit={send}>
        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 13, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>
            Alıcılar ({selected.size}/{emailCustomers.length})
          </label>
          <div style={{ maxHeight: 140, overflowY: "auto", border: "0.5px solid var(--border)", borderRadius: "var(--radius)", padding: 8 }}>
            {emailCustomers.map((c) => (
              <label key={c.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, padding: "4px 0", cursor: "pointer" }}>
                <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggle(c.id)} />
                {c.name} <span style={{ color: "var(--text-muted)" }}>({c.email})</span>
              </label>
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
        <div style={{ marginBottom: 16, background: "var(--bg-warning)", borderRadius: "var(--radius)", padding: "0.75rem 1rem" }}>
          <label style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 12.5, color: "var(--text-warning)", cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={consentConfirmed}
              onChange={(e) => setConsentConfirmed(e.target.checked)}
              style={{ marginTop: 2 }}
            />
            <span>
              Türkiye'de ticari elektronik ileti (reklam/pazarlama e-postası) göndermek için alıcıdan önceden açık onay alınması ve İYS (İleti Yönetim Sistemi) kurallarına uyulması yasal bir zorunluluktur. Seçtiğim müşterilerden bu izni aldığımı onaylıyorum.
            </span>
          </label>
        </div>
        {result && <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 12 }}>{result}</p>}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button type="button" onClick={onClose}>Kapat</button>
          <button type="submit" disabled={sending || selected.size === 0 || !consentConfirmed} style={{ background: "var(--fill-accent)", color: "var(--on-accent)", border: "none" }}>
            {sending ? "Gönderiliyor…" : "Gönder"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

const PRICE_ITEM_NAME_EXAMPLES = {
  emlak: "Ekspertiz Hizmeti",
  dijital_ajans: "Sosyal Medya Yönetimi (Aylık)",
  saglik_klinik: "Muayene",
  uretim_satis: "Toptan Palet",
  hizmet_danismanlik: "Saatlik Danışmanlık",
  perakende: "Standart Paket",
  guzellik_bakim: "Manikür",
  spor_merkezi: "Aylık Üyelik",
  egitim_kurs: "Aylık Yabancı Dil Paketi",
  sanayi_esnaf: "Yağ Bakımı",
};

function PriceListManager({ items, onAdd, onUpdate, onDelete, sector }) {
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [editingItem, setEditingItem] = useState(null);

  const startEdit = (item) => {
    setEditingItem(item);
    setName(item.name);
    setPrice(String(item.price));
  };

  const cancelEdit = () => {
    setEditingItem(null);
    setName("");
    setPrice("");
  };

  const submit = (e) => {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName || price === "") return;
    if (editingItem) {
      onUpdate({ id: editingItem.id, name: trimmedName, price: Number(price) });
      cancelEdit();
      return;
    }
    onAdd({ name: trimmedName, price: Number(price) });
    setName("");
    setPrice("");
  };

  return (
    <div>
      <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: "0 0 16px", display: "flex", alignItems: "center", gap: 4 }}>
        Sabit fiyatlı ürün/hizmetlerinizi buraya kaydedin
        <InfoTip text={`Bu tamamen opsiyonel — kaydettikleriniz, yeni ${DEAL_WORD_FORMS[dealWordKind(sector)].bare} formunda hızlı seçim olarak çıkar; seçince başlık ve tutar otomatik dolar, sonrasında yine de değiştirebilirsiniz. Bir kalemi silmek veya fiyatını güncellemek, daha önce oluşturulmuş ${DEAL_WORD_FORMS[dealWordKind(sector)].pluralAcc} etkilemez — sadece o ${DEAL_WORD_FORMS[dealWordKind(sector)].bare} kaydedildiği andaki başlık/tutarı taşır.`} />
      </p>

      {items.length === 0 ? (
        <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 16 }}>Henüz ürün/hizmet eklenmedi.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 16 }}>
          {items.map((item) => (
            <div key={item.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "var(--surface-1)", borderRadius: "var(--radius)", padding: "6px 10px" }}>
              <span style={{ fontSize: 13 }}>
                {item.name} <span style={{ color: "var(--text-muted)" }}>· {formatTL(item.price)}</span>
              </span>
              <div style={{ display: "flex", gap: 4 }}>
                <IconButton icon="ti-edit" title="Düzenle" size="sm" onClick={() => startEdit(item)} />
                <IconButton icon="ti-trash" title="Sil" size="sm" onClick={() => setConfirmDelete(item)} />
              </div>
            </div>
          ))}
        </div>
      )}

      <p style={{ fontSize: 13, fontWeight: 500, margin: "0 0 8px" }}>{editingItem ? "Ürün/hizmeti düzenle" : "Yeni ürün/hizmet ekle"}</p>
      <form onSubmit={submit} style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "flex-end" }}>
        <div style={{ flex: 1, minWidth: 140 }}>
          <label style={{ fontSize: 12, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>İsim</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder={`Örn. ${PRICE_ITEM_NAME_EXAMPLES[sector] || "Danışmanlık"}`} style={{ width: "100%", fontSize: 13 }} />
        </div>
        <div style={{ width: 120 }}>
          <label style={{ fontSize: 12, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Fiyat (TL)</label>
          <input type="number" min="0" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0" style={{ width: "100%", fontSize: 13 }} />
        </div>
        <button type="submit" style={{ background: "var(--fill-accent)", color: "var(--on-accent)", border: "none", fontSize: 13 }}>
          {editingItem ? "Güncelle" : "+ Ekle"}
        </button>
        {editingItem && (
          <button type="button" onClick={cancelEdit} style={{ fontSize: 13 }}>
            Vazgeç
          </button>
        )}
      </form>

      {confirmDelete && (
        <ConfirmDialog
          title="Ürün/hizmeti sil"
          message={`"${confirmDelete.name}" kaldırılacak. Bu geri alınamaz — ancak daha önce bu kalemle oluşturulmuş ${DEAL_WORD_FORMS[dealWordKind(sector)].plural} etkilenmez.`}
          onConfirm={() => { onDelete(confirmDelete.id); setConfirmDelete(null); }}
          onClose={() => setConfirmDelete(null)}
        />
      )}
    </div>
  );
}

function GroupClassForm({ initial, onSave, onCancel }) {
  const [name, setName] = useState(initial?.name || "");
  const [instructorName, setInstructorName] = useState(initial?.instructorName || "");
  const [weekday, setWeekday] = useState(initial?.weekday || 1);
  const [startTime, setStartTime] = useState(initial?.startTime || "18:00");
  const [durationMinutes, setDurationMinutes] = useState(initial?.durationMinutes ?? 60);
  const [capacity, setCapacity] = useState(initial?.capacity ?? 10);
  const [notes, setNotes] = useState(initial?.notes || "");

  const submit = (e) => {
    e.preventDefault();
    if (!name.trim() || !capacity || Number(capacity) < 1) return;
    onSave({
      name: name.trim(), instructorName: instructorName.trim(), weekday: Number(weekday),
      startTime, durationMinutes: Number(durationMinutes) || 60, capacity: Number(capacity), notes: notes.trim(),
    });
  };

  return (
    <form onSubmit={submit}>
      <div style={{ marginBottom: 12 }}>
        <label style={{ fontSize: 13, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Ders adı</label>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Örn. Pilates" style={{ width: "100%" }} />
      </div>
      <div style={{ marginBottom: 12 }}>
        <label style={{ fontSize: 13, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Eğitmen <span style={{ fontWeight: 400, color: "var(--text-muted)" }}>(opsiyonel)</span></label>
        <input value={instructorName} onChange={(e) => setInstructorName(e.target.value)} placeholder="Örn. Ayşe Hoca" style={{ width: "100%" }} />
      </div>
      <div style={{ display: "flex", gap: 12, marginBottom: 12, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 130 }}>
          <label style={{ fontSize: 13, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Gün</label>
          <select value={weekday} onChange={(e) => setWeekday(e.target.value)} style={{ width: "100%" }}>
            {WEEKDAYS.map((w, i) => <option key={w} value={i + 1}>{w}</option>)}
          </select>
          <p style={{ fontSize: 11.5, color: "var(--text-muted)", margin: "4px 0 0" }}>
            Her hafta tekrar eder — ilk oturum: {nextWeeklyOccurrence(Number(weekday), startTime || "00:00").toLocaleDateString("tr-TR", { day: "numeric", month: "long", weekday: "long" })}
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
          <input type="number" min="1" value={capacity} onChange={(e) => setCapacity(e.target.value)} style={{ width: "100%" }} />
        </div>
      </div>
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

function GroupClassRoster({ group, enrollments, customers, activeCustomerIds, sector, onEdit, onDelete, onEnroll, onRemove }) {
  const words = groupClassWords(sector);
  const [search, setSearch] = useState("");
  const [confirmRemove, setConfirmRemove] = useState(null);
  const enrolledIds = new Set(enrollments.map((e) => e.customerId));
  const full = enrollments.length >= group.capacity;
  const query = search.trim().toLowerCase();
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

      <p style={{ fontSize: 13, fontWeight: 500, margin: "0 0 8px" }}>{words.rosterTitle}</p>
      {enrollments.length === 0 ? (
        <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 16 }}>{words.emptyRoster}</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 16 }}>
          {enrollments.map((e) => {
            const c = customers.find((cust) => cust.id === e.customerId);
            return (
              <div key={e.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "var(--surface-1)", borderRadius: "var(--radius)", padding: "6px 10px" }}>
                <span style={{ fontSize: 13 }}>{c?.name || "Bilinmeyen müşteri"}</span>
                <IconButton icon="ti-x" title="Dersten çıkar" size="sm" onClick={() => setConfirmRemove(e)} />
              </div>
            );
          })}
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

function GroupClassesTab({ groupClasses, groupClassEnrollments, customers, activeCustomerIds, sector, onAdd, onUpdate, onDelete, onEnroll, onRemove }) {
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
                  {dayClasses.length === 0 && <p style={{ fontSize: 12, color: "var(--text-muted)" }}>—</p>}
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
        <InfoTip text={'Burada tanımladığınız gün/saat pencereleri, belirlediğiniz süre aralıklarla bölünüp müşteri portalında müsait randevu saatleri olarak gösterilir. Öğle arası varsa "Öğle arası var" kutusunu işaretleyip ara saatlerini girin — sistem günü otomatik olarak iki parçaya böler.'} />
      </p>

      {sorted.length === 0 ? (
        <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 16 }}>Henüz müsaitlik saati eklenmedi.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 16 }}>
          {sorted.map((b) => (
            <div key={b.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "var(--surface-1)", borderRadius: "var(--radius)", padding: "6px 10px" }}>
              <span style={{ fontSize: 13 }}>
                {WEEKDAYS[b.weekday - 1]} <span style={{ color: "var(--text-muted)" }}>· {b.startTime}–{b.endTime} · {b.slotDurationMinutes} dk aralıklarla</span>
              </span>
              <IconButton icon="ti-trash" title="Sil" size="sm" onClick={() => setConfirmDelete(b)} />
            </div>
          ))}
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
          message={`${WEEKDAYS[confirmDelete.weekday - 1]} ${confirmDelete.startTime}–${confirmDelete.endTime} müsaitliği kaldırılacak. Bu geri alınamaz.`}
          onConfirm={() => { onDelete(confirmDelete.id); setConfirmDelete(null); }}
          onClose={() => setConfirmDelete(null)}
        />
      )}
    </div>
  );
}

function TeamModal({ session, activeTeamId, companySettings, onClose, notify }) {
  const isOwner = activeTeamId === session.user.id;
  const [members, setMembers] = useState([]);
  const [invites, setInvites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [inviteEmail, setInviteEmail] = useState("");
  const [sending, setSending] = useState(false);

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

  const sendInvite = async (e) => {
    e.preventDefault();
    const email = inviteEmail.trim().toLowerCase();
    if (!email) return;
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
        headers: { "Content-Type": "application/json" },
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

  const leaveTeam = async () => {
    const { error } = await supabase.from("team_members").delete().eq("member_id", session.user.id);
    if (error) { notify(`Takımdan ayrılınamadı: ${error.message}`); return; }
    window.location.reload();
  };

  if (!isOwner) {
    return (
      <Modal title="Takım" onClose={onClose}>
        <p style={{ fontSize: 13, color: "var(--text-secondary)" }}>
          Bu hesap <strong>{companySettings?.companyName || "bir işletme"}</strong> takımının bir üyesi. Tüm müşteri, teklif ve destek verisi bu takımla paylaşılıyor.
        </p>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
          <button onClick={onClose}>Kapat</button>
          <button onClick={leaveTeam} style={{ color: "var(--text-danger)" }}>Takımdan ayrıl</button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title="Takım" onClose={onClose}>
      {loading ? (
        <p style={{ fontSize: 13, color: "var(--text-secondary)" }}>Yükleniyor…</p>
      ) : (
        <>
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 13, color: "var(--text-secondary)", display: "block", marginBottom: 6 }}>Üyeler</label>
            {members.length === 0 ? (
              <p style={{ fontSize: 13, color: "var(--text-muted)" }}>Henüz takım üyesi yok.</p>
            ) : (
              members.map((m) => (
                <div key={m.member_id} style={{ padding: "6px 0", borderBottom: "0.5px solid var(--border)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: 13 }}>{m.name || m.email}</span>
                    <button onClick={() => removeMember(m.member_id)} style={{ fontSize: 12, color: "var(--text-danger)" }}>Kaldır</button>
                  </div>
                  <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--text-secondary)", marginTop: 4, cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={!!m.can_edit_settings}
                      onChange={(e) => toggleEditSettings(m.member_id, e.target.checked)}
                    />
                    İşletme/sektör ayarlarını düzenleyebilir
                  </label>
                </div>
              ))
            )}
          </div>
          {invites.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 13, color: "var(--text-secondary)", display: "block", marginBottom: 6 }}>Bekleyen davetler</label>
              {invites.map((inv) => (
                <div key={inv.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: "0.5px solid var(--border)" }}>
                  <span style={{ fontSize: 13 }}>{inv.email} <Badge tone="warning">Bekliyor</Badge></span>
                  <button onClick={() => cancelInvite(inv.id)} style={{ fontSize: 12 }}>İptal et</button>
                </div>
              ))}
            </div>
          )}
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
};

function TrashHistoryModal({ notify, onRestore, onClose, activeTeamId, session, teamMembers }) {
  const [tab, setTab] = useState("trash");
  const [loading, setLoading] = useState(true);
  const [trashGroups, setTrashGroups] = useState([]);
  const [historyRows, setHistoryRows] = useState([]);
  const [restoringBatch, setRestoringBatch] = useState(null);
  const [query, setQuery] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");

  const load = async () => {
    setLoading(true);
    const [{ data: c }, { data: d }, { data: pay }, { data: exp }, { data: t }, { data: kb }, { data: gc }, { data: log }] = await Promise.all([
      supabase.from("customers").select("id,name,user_id,deleted_at,deleted_batch_id").not("deleted_at", "is", null),
      supabase.from("deals").select("id,title,user_id,deleted_at,deleted_batch_id").not("deleted_at", "is", null),
      supabase.from("payments").select("id,amount,deleted_at,deleted_batch_id").not("deleted_at", "is", null),
      supabase.from("company_expenses").select("id,title,deleted_at,deleted_batch_id").not("deleted_at", "is", null),
      supabase.from("tickets").select("id,subject,deleted_at,deleted_batch_id").not("deleted_at", "is", null),
      supabase.from("kb_articles").select("id,title,deleted_at,deleted_batch_id").not("deleted_at", "is", null),
      supabase.from("group_classes").select("id,name,user_id,deleted_at,deleted_batch_id").not("deleted_at", "is", null),
      supabase.from("audit_log").select("*").order("created_at", { ascending: false }).limit(200),
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
    ];

    const groups = {};
    rows.forEach((r) => {
      const key = r.deleted_batch_id || r.id;
      if (!groups[key]) groups[key] = { batchId: r.deleted_batch_id, deletedAt: r.deleted_at, items: [] };
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

  const restore = async (batchId) => {
    setRestoringBatch(batchId);
    await onRestore(batchId);
    await load();
    setRestoringBatch(null);
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

      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
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
              <div key={g.batchId} style={{ padding: "10px 0", borderBottom: "0.5px solid var(--border)" }}>
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
                  <button
                    onClick={() => restore(g.batchId)}
                    disabled={restoringBatch === g.batchId}
                    style={{ fontSize: 12, whiteSpace: "nowrap" }}
                  >
                    {restoringBatch === g.batchId ? "Geri yükleniyor…" : "Geri Yükle"}
                  </button>
                </div>
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

function ExportSelectionModal({ title, items, columns, filename, getLabel, getRow, getPaymentStatus, onClose }) {
  const [query, setQuery] = useState("");
  const [paymentFilter, setPaymentFilter] = useState("all");
  const [selected, setSelected] = useState(() => new Set(items.map((i) => i.id)));

  const queryLower = query.trim().toLowerCase();
  const filtered = items.filter((i) => {
    if (getPaymentStatus && paymentFilter !== "all" && getPaymentStatus(i) !== paymentFilter) return false;
    return !queryLower || getLabel(i).toLowerCase().includes(queryLower);
  });
  const allVisibleSelected = filtered.length > 0 && filtered.every((i) => selected.has(i.id));
  const selectedItems = items.filter((i) => selected.has(i.id));

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
      if (allVisibleSelected) filtered.forEach((i) => next.delete(i.id));
      else filtered.forEach((i) => next.add(i.id));
      return next;
    });
  };

  return (
    <Modal title={title} onClose={onClose}>
      <p style={{ fontSize: 12.5, color: "var(--text-muted)", margin: "0 0 12px" }}>
        Arayıp istediklerinizi seçin — hepsini dışa aktarabilir, ya da tek bir kaydı bile seçip sadece onu indirebilirsiniz.
      </p>
      <div style={{ display: "flex", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Ara..."
          style={{ flex: 1, minWidth: 140, fontSize: 13 }}
        />
        {getPaymentStatus && (
          <select value={paymentFilter} onChange={(e) => setPaymentFilter(e.target.value)} style={{ fontSize: 13 }}>
            <option value="all">Tüm ödeme durumları</option>
            <option value="odendi">Ödendi</option>
            <option value="kismi">Kısmi ödeme</option>
            <option value="odenmedi">Ödenmedi</option>
          </select>
        )}
      </div>
      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: "var(--text-secondary)", padding: "2px 0 6px", cursor: filtered.length === 0 ? "default" : "pointer" }}>
        <input type="checkbox" checked={allVisibleSelected} disabled={filtered.length === 0} onChange={toggleAllVisible} />
        Görünen {filtered.length} kaydın tümünü seç / kaldır
      </label>
      <div style={{ maxHeight: 260, overflowY: "auto", border: "0.5px solid var(--border)", borderRadius: "var(--radius)", padding: 8, marginBottom: 12 }}>
        {filtered.length === 0 ? (
          <p style={{ fontSize: 12.5, color: "var(--text-muted)", margin: 0 }}>Filtreye uyan kayıt yok.</p>
        ) : (
          filtered.map((item) => (
            <label key={item.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, padding: "4px 0", cursor: "pointer" }}>
              <input type="checkbox" checked={selected.has(item.id)} onChange={() => toggle(item.id)} />
              {getLabel(item)}
            </label>
          ))
        )}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 12.5, color: "var(--text-secondary)" }}>{selectedItems.length} kayıt seçili</span>
        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" onClick={onClose}>Vazgeç</button>
          <button
            type="button"
            disabled={selectedItems.length === 0}
            onClick={() => { downloadXlsx(filename, columns, selectedItems.map(getRow)); onClose(); }}
            style={{ background: "var(--fill-accent)", color: "var(--on-accent)", border: "none" }}
          >
            {selectedItems.length} kaydı indir
          </button>
        </div>
      </div>
    </Modal>
  );
}

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
        "{stageLabel("kazanildi", "kurumsal", sector)}" aşamasındaki {DEAL_WORD_FORMS[dealWordKind(sector)].plural} arasından aktarmak istediklerinizi seçin. Seçilenler, Paraşüt'ün satış faturası içe aktarma şablonuyla uyumlu bir Excel (.xlsx) dosyası olarak indirilecek — her {DEAL_WORD_FORMS[dealWordKind(sector)].gen} kendi KDV oranı kullanılır. İndirdiğiniz dosyayı Paraşüt'te Satışlar → Faturalar → İçe/Dışa Aktar → İçeri Aktar ile yükleyebilirsiniz.
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
                  {customerById(d.customerId)?.name || "Bilinmeyen müşteri"} — {d.title}{" "}
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
              Dikkat: Excel dosyası tahsilat bilgisi taşımıyor, faturalar Paraşüt'e aktarılınca "ödenmemiş" görünecek. Aşağıdaki {dealsWithPayments.length} teklif için Binerly'de tahsilat kaydı var — Paraşüt'e aktardıktan sonra her biri için:
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
                    <strong style={{ color: "var(--text-primary)" }}>{customerById(d.customerId)?.name || "Bilinmeyen müşteri"} — {d.title}:</strong>{" "}
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
  { value: "none", label: "Sadece onaylasın", desc: "Bugünkü gibi — ödeme adımı yok, müşteri sadece onaylar." },
  { value: "optional", label: "Onaylasın + isterse ödesin", desc: "Onay ve ödeme birbirinden bağımsız, ikisi de ayrı ayrı sunulur." },
  { value: "required", label: "Onaylamak için ödemesi şart", desc: "Tek adım: ödeme tamamlanınca onay da otomatik gerçekleşir." },
];

// Onay linki her kopyalandığında açılan, o teklife özel ödeme tercihi seçimi —
// son seçilen localStorage'dan ön-işaretli gelir, KOBİ'nin her seferinde
// Ayarlar'a gidip global bir tercih değiştirmesine gerek kalmaz.
function PaymentModeModal({ deal, iyzicoConnected, onConfirm, onClose }) {
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
      {mode !== "none" && !iyzicoConnected && (
        <p style={{ fontSize: 12.5, color: "var(--text-warning, #b45309)", margin: "0 0 12px" }}>
          Ödeme almak için önce Ayarlar'dan iyzico hesabınızı bağlamanız gerekiyor.
        </p>
      )}
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
        <button onClick={onClose}>Vazgeç</button>
        <button
          onClick={() => { localStorage.setItem(PAYMENT_MODE_LAST_CHOICE_KEY, mode); onConfirm(mode); }}
          disabled={mode !== "none" && !iyzicoConnected}
          style={{ background: "var(--fill-accent)", color: "var(--on-accent)", border: "none" }}
        >
          Onayla ve linki kopyala
        </button>
      </div>
    </Modal>
  );
}

function PaymentCredentialForm({ credential, onSave, onDelete, onClose }) {
  const [apiKey, setApiKey] = useState("");
  const [secretKey, setSecretKey] = useState("");
  const [sandbox, setSandbox] = useState(credential?.sandbox ?? true);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!apiKey.trim() || !secretKey.trim()) return;
    setSaving(true);
    await onSave({ apiKey: apiKey.trim(), secretKey: secretKey.trim(), sandbox });
    setSaving(false);
    onClose();
  };

  return (
    <>
      <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: "0 0 14px" }}>
        Müşterilerinizin onay linkinden kartla doğrudan ödeme yapabilmesi için kendi iyzico hesabınızın API bilgilerini girin.
        Kart bilgisi hiçbir zaman Binerly sunucularından geçmez, iyzico'nun kendi güvenli sayfasında girilir.
      </p>
      {credential && (
        <div style={{ background: "var(--surface-2)", borderRadius: "var(--radius)", padding: 10, marginBottom: 14, fontSize: 13 }}>
          iyzico bağlı ✓ {credential.sandbox ? "(Test modu / Sandbox)" : "(Canlı)"}
        </div>
      )}
      <form onSubmit={submit} autoComplete="off">
        <div style={{ marginBottom: 10 }}>
          <label style={{ fontSize: 13, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>API Key</label>
          <input
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={credential ? "Değiştirmek için yeniden girin" : ""}
            autoComplete="off"
            data-1p-ignore
            data-lpignore="true"
            style={{ width: "100%" }}
          />
        </div>
        <div style={{ marginBottom: 10 }}>
          <label style={{ fontSize: 13, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Secret Key</label>
          <input
            value={secretKey}
            onChange={(e) => setSecretKey(e.target.value)}
            placeholder={credential ? "Değiştirmek için yeniden girin" : ""}
            type="password"
            autoComplete="new-password"
            data-1p-ignore
            data-lpignore="true"
            style={{ width: "100%" }}
          />
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, marginBottom: 16 }}>
          <input type="checkbox" checked={sandbox} onChange={(e) => setSandbox(e.target.checked)} />
          Test modu (Sandbox) — canlıya geçmeden önce iyzico test anahtarlarınızla deneyin
        </label>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
          {credential ? (
            <button type="button" onClick={() => setConfirmDelete(true)} style={{ color: "var(--text-danger, #b91c1c)" }}>Bağlantıyı kaldır</button>
          ) : <span />}
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" onClick={onClose}>Kapat</button>
            <button type="submit" disabled={saving || !apiKey.trim() || !secretKey.trim()} style={{ background: "var(--fill-accent)", color: "var(--on-accent)", border: "none" }}>
              {saving ? "Kaydediliyor…" : "Kaydet"}
            </button>
          </div>
        </div>
      </form>
      {confirmDelete && (
        <ConfirmDialog
          title="Bağlantı kaldırılsın mı?"
          message="iyzico bağlantısı kaldırılır, ödeme modu seçilmiş tekliflerdeki online ödeme butonları çalışmaz hale gelir."
          onConfirm={async () => { await onDelete(); setConfirmDelete(false); onClose(); }}
          onCancel={() => setConfirmDelete(false)}
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
    if (error) { notify(`Kaydedilemedi: ${error.message}`); return; }
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
    if (error) { notify(`Şifre değiştirilemedi: ${error.message}`); return; }
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
            style={{ border: "none", background: theme === "light" ? "var(--surface-2)" : "transparent", display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}
          >
            <i className="ti ti-sun" style={{ fontSize: 15 }} aria-hidden="true"></i>
            Açık
          </button>
          <button
            type="button"
            onClick={() => onThemeChange("dark")}
            style={{ border: "none", background: theme === "dark" ? "var(--surface-2)" : "transparent", display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}
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

function PasswordRecoveryModal({ notify, onClose }) {
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (newPassword.length < 6) { notify("Şifre en az 6 karakter olmalı."); return; }
    if (newPassword !== confirmPassword) { notify("Şifreler eşleşmiyor."); return; }
    setSaving(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setSaving(false);
    if (error) { notify(`Şifre güncellenemedi: ${error.message}`); return; }
    notify("Şifreniz güncellendi.", "success");
    onClose();
  };

  return (
    <Modal title="Yeni şifre belirleyin" onClose={onClose}>
      <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: "0 0 16px" }}>
        Sıfırlama bağlantısına tıkladınız — hesabınız için yeni bir şifre belirleyin.
      </p>
      <form onSubmit={submit}>
        <div style={{ marginBottom: 8 }}>
          <label style={{ fontSize: 13, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Yeni şifre</label>
          <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} style={{ width: "100%" }} autoFocus />
        </div>
        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 13, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Yeni şifre (tekrar)</label>
          <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} style={{ width: "100%" }} />
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button type="submit" disabled={saving || !newPassword} style={{ background: "var(--fill-accent)", color: "var(--on-accent)", border: "none" }}>
            {saving ? "Kaydediliyor…" : "Şifreyi kaydet"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function AuthModal({ initialMode = "login", onClose }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState(initialMode);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setMessage("");
    setLoading(true);
    if (mode === "login") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setMessage(error.message);
    } else {
      const { error } = await supabase.auth.signUp({ email, password, options: { data: { full_name: name.trim() } } });
      if (error) setMessage(error.message);
      else setMessage("Kayıt başarılı! E-postanıza gelen doğrulama linkine tıklayın.");
    }
    setLoading(false);
  };

  const sendResetEmail = async () => {
    if (!email) { setMessage("Önce e-posta adresinizi yazın."); return; }
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/`,
    });
    setLoading(false);
    setMessage(error ? error.message : "E-postanıza bir şifre sıfırlama bağlantısı gönderdik.");
  };

  const handleGoogleCredential = async (idToken, nonce) => {
    const { error } = await supabase.auth.signInWithIdToken({ provider: "google", token: idToken, nonce });
    if (error) setMessage(error.message);
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", justifyContent: "center", zIndex: 1000, padding: "1rem", overflowY: "auto" }}>
      <div style={{ background: "#fff", borderRadius: 16, padding: "2rem", width: "100%", maxWidth: 420, position: "relative", margin: "auto" }}>
        <button onClick={onClose} style={{ position: "absolute", top: 16, right: 16, background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#666" }}>✕</button>
        <h2 style={{ fontSize: 20, fontWeight: 700, margin: "0 0 4px", color: "#0c2540" }}>
          {mode === "login" ? "Giriş yap" : "Ücretsiz başla"}
        </h2>
        <p style={{ fontSize: 13, color: "#5b7088", margin: "0 0 1.5rem" }}>Binerly CRM'e hoş geldiniz</p>
        <form onSubmit={submit}>
          {mode === "register" && (
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 13, color: "#5b7088", display: "block", marginBottom: 4 }}>Ad Soyad</label>
              <input value={name} onChange={(e) => setName(e.target.value)} required style={{ width: "100%", padding: "10px 12px", border: "1px solid #e1e8f0", borderRadius: 8, fontSize: 14, boxSizing: "border-box" }} />
            </div>
          )}
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 13, color: "#5b7088", display: "block", marginBottom: 4 }}>E-posta</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required style={{ width: "100%", padding: "10px 12px", border: "1px solid #e1e8f0", borderRadius: 8, fontSize: 14, boxSizing: "border-box" }} />
          </div>
          <div style={{ marginBottom: 8 }}>
            <label style={{ fontSize: 13, color: "#5b7088", display: "block", marginBottom: 4 }}>Şifre</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required style={{ width: "100%", padding: "10px 12px", border: "1px solid #e1e8f0", borderRadius: 8, fontSize: 14, boxSizing: "border-box" }} />
          </div>
          {mode === "login" && (
            <p style={{ margin: "0 0 16px" }}>
              <button type="button" onClick={sendResetEmail} disabled={loading} style={{ background: "none", border: "none", color: "#185fa5", padding: 0, cursor: "pointer", fontSize: 12 }}>
                Şifremi unuttum
              </button>
            </p>
          )}
          {message && <p style={{ fontSize: 13, color: "#b45309", marginBottom: 12 }}>{message}</p>}
          <button type="submit" disabled={loading} style={{ width: "100%", background: "#185fa5", color: "#fff", border: "none", borderRadius: 8, padding: "11px", fontSize: 15, fontWeight: 600, cursor: "pointer" }}>
            {loading ? "Yükleniyor…" : mode === "login" ? "Giriş yap" : "Kayıt ol"}
          </button>
        </form>
        <AuthDivider />
        <GoogleAuthButton onCredential={handleGoogleCredential} />
        <p style={{ fontSize: 13, textAlign: "center", marginTop: 12, color: "#5b7088" }}>
          {mode === "login" ? "Hesabın yok mu? " : "Hesabın var mı? "}
          <button onClick={() => { setMode(mode === "login" ? "register" : "login"); setMessage(""); }} style={{ background: "none", border: "none", color: "#185fa5", padding: 0, cursor: "pointer", fontSize: 13, fontWeight: 600 }}>
            {mode === "login" ? "Kayıt ol" : "Giriş yap"}
          </button>
        </p>
      </div>
    </div>
  );
}

function EntryChoiceModal({ onChooseCompany, onChooseCustomer, onClose }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", justifyContent: "center", zIndex: 1000, padding: "1rem", overflowY: "auto" }}>
      <div style={{ background: "#fff", borderRadius: 16, padding: "2rem", width: "100%", maxWidth: 380, textAlign: "center", position: "relative", margin: "auto" }}>
        <button onClick={onClose} style={{ position: "absolute", top: 16, right: 16, background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#666" }}>✕</button>
        <img src="/favicon.svg" alt="Binerly" style={{ width: 45, height: 45, marginBottom: 14 }} />
        <h2 style={{ fontSize: 17, fontWeight: 700, margin: "0 0 6px", color: "#0c2540" }}>Hesap türünü seçin</h2>
        <p style={{ fontSize: 13, color: "#5b7088", margin: "0 0 20px" }}>
          Bir işletme hesabı mı işletiyorsunuz, yoksa bir firmanın müşterisi misiniz?
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <button
            onClick={onChooseCompany}
            style={{ background: "#185fa5", color: "#fff", border: "none", borderRadius: 8, padding: "13px", fontSize: 15, fontWeight: 600, cursor: "pointer" }}
          >
            İşletme olarak
          </button>
          <button
            onClick={onChooseCustomer}
            style={{ background: "#fff", color: "#185fa5", border: "1.5px solid #185fa5", borderRadius: 8, padding: "13px", fontSize: 15, fontWeight: 600, cursor: "pointer" }}
          >
            Müşteri olarak
          </button>
        </div>
      </div>
    </div>
  );
}

function LandingPage() {
  const [authModal, setAuthModal] = useState(null);
  const [entryChoiceIntent, setEntryChoiceIntent] = useState(null);

  return (
    <div style={{ minHeight: "100vh", background: "#f5f8fc", fontFamily: "system-ui, -apple-system, sans-serif" }}>
      <TrackingScripts />
      {authModal && <AuthModal initialMode={authModal} onClose={() => setAuthModal(null)} />}
      {entryChoiceIntent && (
        <EntryChoiceModal
          onChooseCompany={() => { const mode = entryChoiceIntent; setEntryChoiceIntent(null); setAuthModal(mode); }}
          onChooseCustomer={() => { window.location.href = entryChoiceIntent === "register" ? "/portal?register=1" : "/portal"; }}
          onClose={() => setEntryChoiceIntent(null)}
        />
      )}

      {/* Navbar */}
      <nav style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 2rem", height: 64, background: "#fff", borderBottom: "1px solid #e1e8f0", position: "sticky", top: 0, zIndex: 100 }}>
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
          </div>
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <button onClick={() => setEntryChoiceIntent("login")} style={{ background: "none", border: "none", color: "#185fa5", fontWeight: 600, fontSize: 14, cursor: "pointer", padding: "8px 12px" }}>
              Giriş Yap
            </button>
            <button onClick={() => setEntryChoiceIntent("register")} style={{ background: "#185fa5", color: "#fff", border: "none", borderRadius: 8, padding: "8px 18px", fontWeight: 600, fontSize: 14, cursor: "pointer" }}>
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
            Müşteri veya danışan takibi, teklif, randevu ya da üyelik süreci, destek ve müşterinizin kendi portalı — hepsi bir arada, sektörünüze göre şekillenen tek bir sistemde.
          </p>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <button onClick={() => setEntryChoiceIntent("register")} style={{ background: "#185fa5", color: "#fff", border: "none", borderRadius: 8, padding: "13px 28px", fontWeight: 700, fontSize: 15, cursor: "pointer" }}>
              Ücretsiz Kullanmaya Başla →
            </button>
            <button onClick={() => setEntryChoiceIntent("login")} style={{ background: "#fff", color: "#185fa5", border: "1.5px solid #185fa5", borderRadius: 8, padding: "13px 28px", fontWeight: 600, fontSize: 15, cursor: "pointer" }}>
              Giriş Yap
            </button>
          </div>
          <p style={{ fontSize: 13, color: "#185fa5", fontWeight: 600, margin: "12px 0 0" }}>
            Kart bilgisi gerekmez. Erken erişim aşamasındayız, şu an için tamamen ücretsiz.
          </p>
          <p style={{ fontSize: 13, color: "#5b7088", margin: "6px 0 0" }}>
            💬 Sizi dinliyoruz — talepleriniz doğrultusunda hızla geliştiriyoruz.
          </p>
        </div>

        {/* Mockup — tek kart içinde kurumsal/teklif ve bireysel/randevu&üyelik örnekleri bir arada */}
        <div style={{ flex: 1, minWidth: 280 }}>
          <p style={{ textAlign: "center", fontSize: 13, fontWeight: 600, color: "#185fa5", margin: "0 0 10px" }}>
            İster kurumsal, ister bireysel müşteriye hitap edin
          </p>
          <div style={{ background: "#0c2540", borderRadius: 16, padding: "1.5rem", boxShadow: "0 20px 60px rgba(12,37,64,0.2)" }}>
            <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
              <div style={{ width: 12, height: 12, borderRadius: "50%", background: "#ff5f57" }} />
              <div style={{ width: 12, height: 12, borderRadius: "50%", background: "#ffbd2e" }} />
              <div style={{ width: 12, height: 12, borderRadius: "50%", background: "#28c840" }} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8, marginBottom: 12 }}>
              {[["Açık Teklifler", "12"], ["Toplam Değer", "₺940K"], ["Bekleyen Randevular", "5"], ["Aktif Üyelikler", "37"]].map(([label, val]) => (
                <div key={label} style={{ background: "#1a3a5c", borderRadius: 8, padding: "8px 10px" }}>
                  <div style={{ fontSize: 9.5, color: "#94a7bb", marginBottom: 3 }}>{label}</div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: "#fff" }}>{val}</div>
                </div>
              ))}
            </div>
            {[
              { name: "Akın İnşaat", icon: "ti-building", kind: "Ofis Tadilat Teklifi", stage: "Müzakere", value: "₺180.000" },
              { name: "Ege Tekstil", icon: "ti-building", kind: "Toptan Kumaş Siparişi", stage: "Kazanıldı", value: "₺220.000" },
              { name: "Ayşe Yılmaz", icon: "ti-user", kind: "Lazer Epilasyon Randevusu", stage: "Randevu planlandı", value: "₺1.200" },
              { name: "Mehmet Kaya", icon: "ti-user", kind: "Spor Salonu Üyeliği", stage: "Üye oldu", value: "₺3.500/ay" },
            ].map((r) => (
              <div key={r.name} style={{ background: "#1a3a5c", borderRadius: 8, padding: "8px 12px", marginBottom: 7, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                  <div style={{ flex: "none", width: 24, height: 24, borderRadius: "50%", background: "#123457", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <i className={`ti ${r.icon}`} style={{ fontSize: 12, color: "#7fb3e8" }} aria-hidden="true"></i>
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: "#fff" }}>{r.name}</span>
                      <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 0.3, color: "#0c2540", background: "#378add", padding: "1px 6px", borderRadius: 20, whiteSpace: "nowrap" }}>{r.kind.toLocaleUpperCase("tr")}</span>
                    </div>
                    <div style={{ fontSize: 11, color: "#94a7bb" }}>{r.stage}</div>
                  </div>
                </div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#378add", whiteSpace: "nowrap" }}>{r.value}</div>
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
      <div id="ozellikler" style={{ maxWidth: 1100, margin: "0 auto", padding: "3rem 2rem" }}>
        <h2 style={{ textAlign: "center", fontSize: "1.75rem", fontWeight: 700, color: "#0c2540", margin: "0 0 2.5rem" }}>
          İşinizi büyütmek için ihtiyacınız olan her şey
        </h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 20 }}>
          {[
            {
              id: "musteri-yonetimi",
              icon: "ti-address-book",
              title: "Müşteri & İletişim Yönetimi",
              desc: "Müşterilerin iletişim bilgileri, e-posta yazışmaları, telefon notları ve geçmiş satın alma kayıtlarını tek veritabanında tutun. Sektör, bölge ve potansiyele göre segmentasyon yapın.",
              tags: ["İletişim Geçmişi", "Segmentasyon", "Arama & Dışa Aktarma"],
            },
            {
              id: "satis-firsat",
              icon: "ti-target-arrow",
              title: "Satış & Teklif Yönetimi",
              desc: "İster iş teklifi ister randevu ya da üyelik satışı olsun, ilk temastan kapanışa kadar tüm süreci Kanban tahtasında takip edin. Tek tıkla markalı PDF oluşturun, onay linkiyle müşteriden tek tıkla onay alın, sık sattığınız ürün/hizmetleri fiyat listenize kaydedip saniyeler içinde seçin.",
              tags: ["Kanban Pipeline", "PDF Çıktısı", "Onay Linki", "Fiyat Listesi", "Seans/Paket Takibi"],
            },
            {
              id: "pazarlama",
              icon: "ti-mail-forward",
              title: "Pazarlama Otomasyonu",
              desc: "E-posta kampanyaları gönderin. Lead scoring ile en sıcak adayları öncelikli görün.",
              tags: ["E-posta Kampanyası", "Lead Scoring"],
            },
            {
              id: "destek",
              icon: "ti-headset",
              title: "Satış Sonrası Destek",
              desc: "Müşteri şikayet ve destek taleplerini bilet sistemiyle takip edin. SLA sürelerini izleyin, sıkça sorulan sorular için bilgi bankası oluşturun.",
              tags: ["Ticketing", "SLA Takibi", "Bilgi Bankası"],
            },
            {
              id: "musteri-portali",
              icon: "ti-users-group",
              title: "Müşteri Bilgi Sistemi",
              desc: "Müşterileriniz kendi hesaplarıyla giriş yapıp destek taleplerini açabilir, sizinle mesajlaşabilir ve teklif/randevu/üyelik kayıtlarının durumunu görebilir. Güzellik salonu veya klinikseniz müşteri, sizin tanımladığınız müsaitlik saatlerinden kendi randevusunu alıp gerekirse iptal edebilir; spor merkeziyseniz üyeleriniz grup derslerinize kendi kaydolup çıkabilir — siz her yeni işlemde anında bildirim alırsınız. Telefon trafiğinizi azaltır.",
              tags: ["Müşteri Portalı", "Kendi Randevusunu Alır", "Grup Dersi Kaydı", "Kendi Talebini Takip"],
            },
            {
              id: "raporlama",
              icon: "ti-chart-bar",
              title: "Raporlama & Analitik",
              desc: "Kazanma oranı, aylık kazanılan gelir grafiği ve kayıp nedeni analizleriyle stratejik kararlar alın. Cari hesap ve KDV özet raporuyla kimin ne kadar borcu olduğunu, aylık KDV yükünüzü tek bakışta görün.",
              tags: ["Dashboard", "Kayıp Analizi", "Cari Hesap", "KDV Özeti"],
            },
            {
              id: "entegrasyonlar",
              icon: "ti-plug-connected",
              title: "Entegrasyonlar & Mobil",
              desc: "Uygulamayı telefonunuza kurup anında bildirim alın. WhatsApp/Instagram işletme hesabınızı bağlayıp müşteri mesajlarınızı buradan takip edin, ya da tek tıkla WhatsApp'tan ulaşın. Kazanılan kayıtları tek tıkla Paraşüt'e aktarın. Gmail/Outlook senkronizasyonu yol haritamızda.",
              tags: ["Mobil Uygulama (PWA)", "Anlık Bildirim", "WhatsApp & Instagram", "Paraşüt'e Aktar"],
            },
            {
              id: "is-birligi-agi",
              icon: "ti-handshake",
              title: "KOBİ İş Birliği Ağı",
              desc: "Binerly'ye kayıtlı KOBİ'ler birbirini keşfedip iş birliği yapabilecek, ücretli veya ücretsiz iş fırsatlarını paylaşabilecek — birbirinizin müşterisi, tedarikçisi veya iş ortağı olun.",
              tags: ["Yakında"],
            },
          ].map((f) => (
            <div key={f.title} id={f.id} style={{ background: "#fff", borderRadius: 12, padding: "1.5rem", border: "1px solid #e1e8f0", scrollMarginTop: 80 }}>
              <i className={`ti ${f.icon}`} style={{ fontSize: 28, color: "#185fa5", display: "block", marginBottom: 12 }} />
              <h3 style={{ fontSize: 16, fontWeight: 700, color: "#0c2540", margin: "0 0 8px" }}>{f.title}</h3>
              <p style={{ fontSize: 14, color: "#5b7088", margin: "0 0 12px", lineHeight: 1.6 }}>{f.desc}</p>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {f.tags.map((tag) => (
                  <span key={tag} style={{ fontSize: 11, fontWeight: 600, background: "#e6f1fb", color: "#185fa5", padding: "3px 10px", borderRadius: 20 }}>{tag}</span>
                ))}
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
          Sektörünüzü seçtiğinizde aşama isimleri, alanlar ve hatta "teklif mi, randevu mu, üyelik mi" dediğimiz otomatik ayarlanır — herkese aynı kalıp değil, işinize uygun bir sistem.
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
          Listede yoksa da sorun değil — "Genel" ile başlayıp kendi özel alanlarınızı ekleyebilirsiniz.
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
            Türkiye'deki CRM'lerin çoğu kullanıcı başına ücretlendiriyor, bazıları da dolar/euro bazlı — ekibiniz büyüdükçe faturanız da büyüyor, kur dalgalandıkça bütçeniz sarsılıyor. Binerly'de öyle değil: 10 kullanıcıya kadar sabit bir ücretle çalışacağız, her zaman TL bazlı.
          </p>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 16, marginBottom: 2.5 + "rem" }}>
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
              ["ti-list-details", "Dağınıklık", "Müşteri bilgisi telefonda, WhatsApp'ta, Excel'de ve kafanızda — dört farklı yerde."],
              ["ti-eye-off", "Kör nokta", "Bir çalışan izinliyken veya ayrılınca, bildiği müşteri geçmişi de onunla gidiyor."],
              ["ti-clock-x", "Kaçan takip", "\"Yarın ararım\" dediğiniz teklifi unutup fırsatı rakibe kaptırıyorsunuz."],
              ["ti-certificate", "Kurumsal görünmeme", "Elle yazılmış teklif, büyük müşteriye karşı güven vermiyor."],
            ].map(([icon, title, desc]) => (
              <div key={title} style={{ background: "#fff", border: "1px solid #e1e8f0", borderRadius: 12, padding: "1.25rem" }}>
                <i className={`ti ${icon}`} style={{ fontSize: 22, color: "#185fa5", display: "block", marginBottom: 10 }} />
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
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 20 }}>
            <div style={{ background: "#f5f8fc", borderRadius: 12, padding: "1.5rem", border: "1px solid #e1e8f0" }}>
              <i className="ti ti-bulb" style={{ fontSize: 26, color: "#185fa5", display: "block", marginBottom: 12 }} />
              <h3 style={{ fontSize: 15, fontWeight: 700, color: "#0c2540", margin: "0 0 8px" }}>Misyonumuz</h3>
              <p style={{ fontSize: 13.5, color: "#5b7088", margin: 0, lineHeight: 1.7 }}>
                KOBİ'lerin günlük operasyonel yükünü azaltıp dijitalleştirerek, zamanlarını ve zihinlerini işlerini büyütmeye, işletmelerini daha iyiye taşıyacak kararlar almaya ve müşterileriyle daha kaliteli ilişkiler kurmaya ayırabilmelerini sağlamak.
              </p>
            </div>
            <div style={{ background: "#f5f8fc", borderRadius: 12, padding: "1.5rem", border: "1px solid #e1e8f0" }}>
              <i className="ti ti-telescope" style={{ fontSize: 26, color: "#185fa5", display: "block", marginBottom: 12 }} />
              <h3 style={{ fontSize: 15, fontWeight: 700, color: "#0c2540", margin: "0 0 8px" }}>Vizyonumuz</h3>
              <p style={{ fontSize: 13.5, color: "#5b7088", margin: 0, lineHeight: 1.7 }}>
                Türkiye'deki her KOBİ'nin, büyüklüğüne bakılmaksızın, büyük şirketlerin sahip olduğu güçlü araçlara kolay ve uygun maliyetle erişebildiği bir gelecek.
              </p>
            </div>
            <div style={{ background: "#f5f8fc", borderRadius: 12, padding: "1.5rem", border: "1px solid #e1e8f0" }}>
              <i className="ti ti-shield-check" style={{ fontSize: 26, color: "#185fa5", display: "block", marginBottom: 12 }} />
              <h3 style={{ fontSize: 15, fontWeight: 700, color: "#0c2540", margin: "0 0 8px" }}>Güvenilirlik</h3>
              <p style={{ fontSize: 13.5, color: "#5b7088", margin: 0, lineHeight: 1.7 }}>
                Verileriniz, her hesabın yalnızca kendi kayıtlarına erişebildiği satır bazlı erişim kurallarıyla saklanır — başka bir işletmenin verisine teknik olarak erişim mümkün değildir. KVKK'ya uygun işlenir, asla üçüncü taraflarla paylaşılmaz. Kredi kartı istemeden ücretsiz deneyebilir, istediğiniz an ayrılabilirsiniz.
              </p>
            </div>
            <div style={{ background: "#f5f8fc", borderRadius: 12, padding: "1.5rem", border: "1px solid #e1e8f0" }}>
              <i className="ti ti-heart-handshake" style={{ fontSize: 26, color: "#185fa5", display: "block", marginBottom: 12 }} />
              <h3 style={{ fontSize: 15, fontWeight: 700, color: "#0c2540", margin: "0 0 8px" }}>Sizi Dinliyoruz</h3>
              <p style={{ fontSize: 13.5, color: "#5b7088", margin: 0, lineHeight: 1.7 }}>
                Erken erişim aşamasında olduğumuz için Binerly'yi doğrudan kullanıcılarımızın talepleriyle şekillendiriyoruz. İşinize özel eksik bir özellik veya isteğiniz olursa bize ulaşın — değerlendirip mümkün olan en kısa sürede geliştirip ekleriz.
              </p>
            </div>
          </div>
        </div>
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
              <a href="#musteri-portali" style={{ fontSize: 13, color: "#5b7088", textDecoration: "none" }}>Müşteri Bilgi Sistemi</a>
              <a href="#raporlama" style={{ fontSize: 13, color: "#5b7088", textDecoration: "none" }}>Raporlama & Analitik</a>
            </div>
          </div>
          <div>
            <p style={{ fontSize: 12, fontWeight: 700, color: "#0c2540", letterSpacing: 0.5, margin: "0 0 14px" }}>HIZLI ERİŞİM</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <a href="/" style={{ fontSize: 13, color: "#5b7088", textDecoration: "none" }}>Ana Sayfa</a>
              <a href="#sektorler" style={{ fontSize: 13, color: "#5b7088", textDecoration: "none" }}>Sektörler</a>
              <a href="#hakkimizda" style={{ fontSize: 13, color: "#5b7088", textDecoration: "none" }}>Hakkımızda</a>
              <a href="mailto:info@binerly.com" style={{ fontSize: 13, color: "#5b7088", textDecoration: "none" }}>İletişim</a>
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
          © 2026 Binerly · KOBİ Satış Takip Sistemi · Tüm hakları saklıdır.
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
  const [channelMessages, setChannelMessages] = useState([]);
  const [tickets, setTickets] = useState([]);
  const [ticketMessages, setTicketMessages] = useState([]);
  const [kbArticles, setKbArticles] = useState([]);
  const [companySettings, setCompanySettings] = useState(null);
  const [customFieldDefs, setCustomFieldDefs] = useState([]);
  const [priceListItems, setPriceListItems] = useState([]);
  const [pdfTemplates, setPdfTemplates] = useState([]);
  const [editingTemplate, setEditingTemplate] = useState(null);
  const [groupClasses, setGroupClasses] = useState([]);
  const [groupClassEnrollments, setGroupClassEnrollments] = useState([]);
  const [businessHours, setBusinessHours] = useState([]);
  const [showSectorOnboarding, setShowSectorOnboarding] = useState(false);
  const [showTour, setShowTour] = useState(false);
  const [tourStep, setTourStep] = useState(0);
  // v1: üye sayısı kod tarafında henüz sınırlanmıyor, henüz billing yok.
  // Hedef fiyatlandırma "10 kullanıcıya kadar sabit ücret" olarak siteye
  // yazıldı (App.jsx LandingPage, "Neden Binerly" bölümü) — billing
  // eklendiğinde davet oluşturma burada 10 üyeyle sınırlanmalı.
  const [activeTeamId, setActiveTeamId] = useState(undefined);
  const [pendingInvites, setPendingInvites] = useState([]);
  const [dismissedInviteIds, setDismissedInviteIds] = useState([]);
  const [acknowledgedInviteIds, setAcknowledgedInviteIds] = useState([]);
  const [showSettingsHub, setShowSettingsHub] = useState(false);
  const [showSettingsForm, setShowSettingsForm] = useState(false);
  const [showSectorFields, setShowSectorFields] = useState(false);
  const [showPriceList, setShowPriceList] = useState(false);
  const [showBusinessHours, setShowBusinessHours] = useState(false);
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
  const [dealView, setDealView] = useState("list");
  const [panoRange, setPanoRange] = useState("tum_zamanlar");
  const [dragDealId, setDragDealId] = useState(null);
  const [showCampaignModal, setShowCampaignModal] = useState(false);
  const [confirmDeleteCustomer, setConfirmDeleteCustomer] = useState(null);
  const [confirmDeleteDeal, setConfirmDeleteDeal] = useState(null);
  const [customerSearch, setCustomerSearch] = useState("");
  const [customerFromDate, setCustomerFromDate] = useState("");
  const [customerToDate, setCustomerToDate] = useState("");
  const [customerSectorFilter, setCustomerSectorFilter] = useState("all");
  const [customerTypeFilter, setCustomerTypeFilter] = useState("all");
  const [customerSort, setCustomerSort] = useState("newest");
  const [dealSearch, setDealSearch] = useState("");
  const [dealFromDate, setDealFromDate] = useState("");
  const [dealToDate, setDealToDate] = useState("");
  const [dealStageFilter, setDealStageFilter] = useState("all");
  const [dealPaymentFilter, setDealPaymentFilter] = useState("all");
  const [dealSort, setDealSort] = useState("newest");
  const [dealAudience, setDealAudience] = useState("kurumsal");
  const [teklifDeal, setTeklifDeal] = useState(null);
  const [paymentsDeal, setPaymentsDeal] = useState(null);
  const [paymentModeDeal, setPaymentModeDeal] = useState(null);
  const [leadCaptureLink, setLeadCaptureLink] = useState(null);
  const [quickList, setQuickList] = useState(null);
  const [initialViewTicketId, setInitialViewTicketId] = useState(null);
  const [toast, setToast] = useState(null);
  const [pushSubscribed, setPushSubscribed] = useState(false);
  const [teamMembers, setTeamMembers] = useState([]);

  const notify = (message, tone = "danger") => setToast({ message, tone });

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
      setChannelCredentials([]); setPaymentCredentials([]); setChannelMessages([]);
      setTickets([]); setTicketMessages([]); setKbArticles([]);
      setCompanySettings(null);
      setCustomFieldDefs([]);
      setPriceListItems([]);
      setGroupClasses([]); setGroupClassEnrollments([]);
      setBusinessHours([]);
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
      supabase.from("channel_messages").select("*").order("created_at", { ascending: false }).limit(500),
      supabase.from("tickets").select("*").is("deleted_at", null).order("created_at"),
      supabase.from("ticket_messages").select("*").order("created_at"),
      supabase.from("kb_articles").select("*").is("deleted_at", null).order("created_at"),
      supabase.from("company_settings").select("*"),
      supabase.from("custom_field_defs").select("*").order("sort_order"),
      supabase.from("price_list_items").select("*").order("name"),
      supabase.from("group_classes").select("*").is("deleted_at", null).order("weekday").order("start_time"),
      supabase.from("group_class_enrollments").select("*"),
      supabase.from("business_hours").select("*").order("weekday").order("start_time"),
      supabase.from("deal_pdf_templates").select("*").order("created_at"),
      supabase.from("deal_line_items").select("*").order("sort_order"),
      supabase.from("team_members").select("team_id").eq("member_id", session.user.id).maybeSingle(),
      supabase.from("team_invites").select("*").eq("status", "pending"),
    ]).then(([{ data: c }, { data: d }, { data: a }, { data: pay }, { data: exp }, { data: cred }, { data: payCred }, { data: chMsg }, { data: t }, { data: tm }, { data: kb }, { data: cs }, { data: cfd }, { data: pli }, { data: gc }, { data: gce }, { data: bh }, { data: pdft }, { data: dli }, { data: myMembership }, { data: invites }]) => {
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
      setBusinessHours((bh || []).filter((row) => row.user_id === ownerId).map(rowToBusinessHours));
      setPdfTemplates((pdft || []).filter((row) => row.user_id === ownerId).map(rowToPdfTemplate));
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
  useEffect(() => {
    if (!activeTeamId) { setTeamMembers([]); return; }
    supabase.from("team_members").select("member_id, email, name, can_edit_settings").eq("team_id", activeTeamId).then(({ data }) => {
      setTeamMembers((data || []).map((m) => ({ id: m.member_id, email: m.email, name: m.name || null, canEditSettings: m.can_edit_settings || false })));
    });
  }, [activeTeamId]);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Push bildirimi tıklanınca gelen ?ticket= derin bağlantısı — talepler yüklendikten
  // sonra bir kere işlenir, sonra URL'den temizlenir.
  useEffect(() => {
    if (tickets.length === 0) return;
    const params = new URLSearchParams(window.location.search);
    const ticketId = params.get("ticket");
    if (!ticketId) return;
    if (tickets.some((t) => t.id === ticketId)) {
      setTab("destek");
      setInitialViewTicketId(ticketId);
    }
    const url = new URL(window.location.href);
    url.searchParams.delete("ticket");
    window.history.replaceState({}, "", url);
  }, [tickets]);

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
    if (companySettings?.customerNotificationsEnabled !== true) return;
    if (!customer?.email) return;
    try {
      await fetch("/api/send-campaign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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
    } catch {
      // yoksay — bildirim maili başarısız olsa da asıl işlemi bozmaz
    }
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
      body: (deal, company) => `Merhaba,\n\n${company} sizin için hazırladı: "${deal.title}" — ${formatTL(deal.value)}`,
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
      notifyCustomerByEmail(customer, `${cfg.subject(deal.title)} — ${company}`, cfg.body(deal, company), {
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

    const ticketIds = customerTickets.map((t) => t.id);
    setCustomers((prev) => prev.filter((c) => c.id !== id));
    setDeals((prev) => prev.filter((d) => d.customerId !== id));
    setTickets((prev) => prev.filter((t) => t.customerId !== id));
    setTicketMessages((prev) => prev.filter((m) => !ticketIds.includes(m.ticketId)));
    setPayments((prev) => prev.filter((p) => !dealIds.includes(p.dealId)));

    logAction("customers", id, "deleted", `${customer?.name || "Müşteri"} çöp kutusuna taşındı`);
    customerDeals.forEach((d) => logAction("deals", d.id, "deleted", `${d.title} (${DEAL_WORD_FORMS[dealWordKind(companySettings?.sector)].bare}) çöp kutusuna taşındı`));
    customerTickets.forEach((t) => logAction("tickets", t.id, "deleted", `${t.subject} (talep) çöp kutusuna taşındı`));
    cascadePayments.forEach((p) => logAction("payments", p.id, "deleted", `${formatTL(p.amount)} tahsilat çöp kutusuna taşındı`));
  };

  const upsertDeal = async (d) => {
    const isNew = !deals.some((x) => x.id === d.id);
    const previousStage = deals.find((x) => x.id === d.id)?.stage;
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
      custom_fields: d.customFields || {},
      notify_customer: d.notifyCustomer || false,
      assigned_to: d.assignedTo || null,
      // approval_token/approved_at bu formda hiç düzenlenmiyor — mevcut değeri
      // koru, yoksa normal "Kaydet" onay durumunu sıfırlardı.
      approval_token: d.approvalToken || null,
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

    // Kalemler DealForm'dan geldiyse (d.lineItems tanımlıysa — moveDealStage gibi
    // kalemlerden habersiz diğer çağrılar bu alanı hiç göndermiyor, dokunulmuyor)
    // sil-hepsini-baştan-ekle senkronizasyonu yapılır — bu projede diffing yerine
    // hep bu basit desen tercih ediliyor.
    if (d.lineItems !== undefined) {
      await supabase.from("deal_line_items").delete().eq("deal_id", deal.id);
      if (d.lineItems.length > 0) {
        const rows = d.lineItems.map((li, i) => ({
          id: uid(), user_id: activeTeamId, deal_id: deal.id,
          description: li.description, quantity: Number(li.quantity) || 1, unit_price: Number(li.unitPrice) || 0, sort_order: i,
        }));
        const { data: insertedItems, error: liError } = await supabase.from("deal_line_items").insert(rows).select();
        if (liError) notify(`Kalemler kaydedilemedi: ${liError.message}`);
        setDealLineItems((prev) => [...prev.filter((li) => li.dealId !== deal.id), ...((insertedItems || []).map(rowToDealLineItem))]);
      } else {
        setDealLineItems((prev) => prev.filter((li) => li.dealId !== deal.id));
      }
    }

    setShowDealForm(false);
    setEditingDeal(null);
    logAction("deals", deal.id, isNew ? "created" : "updated", `${deal.title} ${isNew ? "oluşturuldu" : "güncellendi"}`);
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
    setDeals((prev) => prev.filter((d) => d.id !== id));
    setPayments((prev) => prev.filter((p) => p.dealId !== id));
    logAction("deals", id, "deleted", `${deal?.title || DEAL_TAB_STRINGS[dealWordKind(companySettings?.sector)].columnHeader} çöp kutusuna taşındı`);
    dealPayments.forEach((p) => logAction("payments", p.id, "deleted", `${formatTL(p.amount)} tahsilat çöp kutusuna taşındı`));
  };

  const addPayment = async ({ dealId, amount, paidAt, note }) => {
    const row = { id: uid(), user_id: activeTeamId, deal_id: dealId, amount, paid_at: paidAt, note: note || null };
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
      `Ödemeniz alındı — ${company}`,
      `Merhaba,\n\n"${deal?.title || DEAL_WORD_FORMS[dealWordKind(companySettings?.sector)].possYours}" için ${formatTL(payment.amount)} tutarındaki ödemeniz alınmıştır. Teşekkür ederiz.\n\n${company}`
    );
  };

  const deletePayment = async (id) => {
    const payment = payments.find((p) => p.id === id);
    const batchId = uid();
    const { error } = await supabase
      .from("payments")
      .update({ deleted_at: new Date().toISOString(), deleted_batch_id: batchId })
      .eq("id", id);
    if (error) { notify(`Tahsilat silinemedi: ${error.message}`); return; }
    setPayments((prev) => prev.filter((p) => p.id !== id));
    logAction("payments", id, "deleted", `${formatTL(payment?.amount || 0)} tahsilat çöp kutusuna taşındı`);
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

  const upsertPaymentCredential = async ({ apiKey, secretKey, sandbox }) => {
    const row = { user_id: activeTeamId, provider: "iyzico", api_key: apiKey, secret_key: secretKey, sandbox, updated_at: new Date().toISOString() };
    const { data, error } = await supabase
      .from("payment_credentials")
      .upsert(row, { onConflict: "user_id,provider" })
      .select("id, user_id, provider, sandbox, connected_at")
      .single();
    if (error) { notify(`iyzico bağlantısı kaydedilemedi: ${error.message}`); return; }
    const credential = rowToPaymentCredential(data);
    setPaymentCredentials((prev) => [...prev.filter((pc) => pc.provider !== "iyzico"), credential]);
    notify("iyzico bağlandı.", "success");
  };

  const deletePaymentCredential = async () => {
    const { error } = await supabase.from("payment_credentials").delete().eq("user_id", activeTeamId).eq("provider", "iyzico");
    if (error) { notify(`Bağlantı kaldırılamadı: ${error.message}`); return; }
    setPaymentCredentials((prev) => prev.filter((pc) => pc.provider !== "iyzico"));
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
    const demoCustomers = [
      { id: uid(), name: "Örnek Müşteri — Akın İnşaat", customerType: "kurumsal", sector: "İnşaat", phone: "0532 000 00 01", email: "", notes: demoNote, lastContact: now, createdAt: now },
      { id: uid(), name: "Örnek Müşteri — Medipark Klinik", customerType: "kurumsal", sector: "Medikal / Sağlık", phone: "0532 000 00 02", email: "", notes: demoNote, lastContact: now, createdAt: now },
      { id: uid(), name: "Örnek Müşteri — Tazegül Gıda", customerType: "kurumsal", sector: "Gıda", phone: "0532 000 00 03", email: "", notes: demoNote, lastContact: now, createdAt: now },
      { id: uid(), name: "Örnek Müşteri — Ayşe Yılmaz", customerType: "bireysel", sector: "", region: "İzmir", phone: "0532 000 00 04", email: "", notes: demoNote, lastContact: now, createdAt: now },
    ];
    for (const c of demoCustomers) await upsertCustomer(c);

    const demoDeals = [
      { id: uid(), customerId: demoCustomers[0].id, title: "Yıllık bakım anlaşması", value: 45000, cost: 0, stage: "ilk_gorusme", reminder: "", reminderDate: null, lostReason: "", createdAt: now, closedAt: null },
      { id: uid(), customerId: demoCustomers[1].id, title: "Ekipman teklifi", value: 60000, cost: 0, stage: "muzakere", reminder: "Fiyat için tekrar ara", reminderDate: todayStr, lostReason: "", createdAt: now, closedAt: null },
      { id: uid(), customerId: demoCustomers[2].id, title: "Tedarik sözleşmesi", value: 32000, cost: 12000, stage: "kazanildi", reminder: "", reminderDate: null, lostReason: "", createdAt: now, closedAt: now },
    ];
    for (const d of demoDeals) await upsertDeal(d);
    notify("Örnek veriler eklendi.", "success");
  };

  const moveDealStage = async (id, stage) => {
    const current = deals.find((d) => d.id === id);
    const previousStage = current?.stage;
    const isClosingStage = stage === "kazanildi" || stage === "kaybedildi";
    const wasAlreadyClosed = previousStage === "kazanildi" || previousStage === "kaybedildi";
    const closedAt = isClosingStage
      ? (wasAlreadyClosed && current?.closedAt ? current.closedAt : new Date().toISOString())
      : null;
    setDeals((prev) => prev.map((d) => (d.id === id ? { ...d, stage, closedAt } : d)));
    const { error } = await supabase.from("deals").update({ stage, closed_at: closedAt }).eq("id", id);
    if (error) {
      notify(`Aşama güncellenemedi: ${error.message}`);
      setDeals((prev) => prev.map((d) => (d.id === id ? { ...d, stage: previousStage, closedAt: current?.closedAt ?? null } : d)));
    } else {
      const currentStageLabel = stageLabel(stage, customers.find((c) => c.id === current?.customerId)?.customerType || "kurumsal", companySettings?.sector);
      logAction("deals", id, "updated", `${current?.title || DEAL_TAB_STRINGS[dealWordKind(companySettings?.sector)].columnHeader} aşaması "${currentStageLabel}" olarak güncellendi`);
      if (current && stage !== previousStage) sendStageEmail(current, stage);
    }
  };

  const incrementSessionUsage = async (id) => {
    const current = deals.find((d) => d.id === id);
    if (!current?.sessionTotal || current.sessionUsed >= current.sessionTotal) return;
    const previousUsed = current.sessionUsed;
    const nextUsed = previousUsed + 1;
    setDeals((prev) => prev.map((d) => (d.id === id ? { ...d, sessionUsed: nextUsed } : d)));
    const { error } = await supabase.from("deals").update({ session_used: nextUsed }).eq("id", id);
    if (error) {
      notify(`Seans güncellenemedi: ${error.message}`);
      setDeals((prev) => prev.map((d) => (d.id === id ? { ...d, sessionUsed: previousUsed } : d)));
    } else {
      logAction("deals", id, "updated", `${current.title || DEAL_TAB_STRINGS[dealWordKind(companySettings?.sector)].columnHeader} — ${nextUsed}. seans kullanıldı (${nextUsed}/${current.sessionTotal})`);
    }
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
      const customer = customers.find((c) => c.id === ticket.customerId);
      const company = companySettings?.companyName || "Binerly";
      const statusLabel = STATUSES.find((s) => s.id === ticket.status)?.label || ticket.status;
      notifyCustomerByEmail(
        customer,
        `Destek talebiniz güncellendi — ${company}`,
        `Merhaba,\n\n"${ticket.subject}" konulu talebinizin durumu "${statusLabel}" olarak güncellendi.\n\nDetaylar için müşteri portalımızdan giriş yapabilirsiniz: https://binerly.com/portal\n\n${company}`
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
        const customer = customers.find((c) => c.id === previous?.customerId);
        const company = companySettings?.companyName || "Binerly";
        const statusLabel = STATUSES.find((s) => s.id === status)?.label || status;
        notifyCustomerByEmail(
          customer,
          `Destek talebiniz güncellendi — ${company}`,
          `Merhaba,\n\n"${previous?.subject || "Destek talebiniz"}" konulu talebinizin durumu "${statusLabel}" olarak güncellendi.\n\nDetaylar için müşteri portalımızdan giriş yapabilirsiniz: https://binerly.com/portal\n\n${company}`
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
    if (direction === "giden" && !isInternal) {
      const ticket = tickets.find((t) => t.id === ticketId);
      const customer = customers.find((c) => c.id === ticket?.customerId);
      const company = companySettings?.companyName || "Binerly";
      notifyCustomerByEmail(
        customer,
        `Yeni bir yanıtınız var — ${company}`,
        `Merhaba,\n\n"${ticket?.subject || "Destek talebiniz"}" konulu talebinize yeni bir yanıt geldi:\n\n"${content.slice(0, 300)}"\n\nTam görüşme için müşteri portalımıza giriş yapabilirsiniz: https://binerly.com/portal\n\n${company}`
      );
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
    ];
    let anyError = null;
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
      }
    }
    if (anyError) notify(`Geri yükleme sırasında hata: ${anyError.message}`);
    else notify("Kayıtlar geri yüklendi.", "success");
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

  const bulkImportCustomers = async (records, onProgress) => {
    const now = new Date().toISOString();
    const rows = records.map((r) => ({
      id: uid(), user_id: activeTeamId, name: r.name, customer_type: r.customerType || "kurumsal",
      sector: r.customerType === "bireysel" ? "" : (r.sector || ""),
      region: r.region || "", phone: r.phone || "", email: r.email || "",
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

  const upsertCompanySettings = async (s) => {
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

  const updateCustomFieldDef = async ({ id, label, options, audience }) => {
    const row = { label, options, audience };
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

  const addPriceListItem = async ({ name, price }) => {
    const row = { id: uid(), user_id: activeTeamId, name, price };
    const { data, error } = await supabase.from("price_list_items").insert(row).select().single();
    if (error) { notify(`Ürün/hizmet eklenemedi: ${error.message}`); return; }
    setPriceListItems((prev) => [...prev, rowToPriceListItem(data)]);
  };

  const updatePriceListItem = async ({ id, name, price }) => {
    const { data, error } = await supabase.from("price_list_items").update({ name, price }).eq("id", id).select().single();
    if (error) { notify(`Ürün/hizmet güncellenemedi: ${error.message}`); return; }
    setPriceListItems((prev) => prev.map((p) => (p.id === id ? rowToPriceListItem(data) : p)));
  };

  const deletePriceListItem = async (id) => {
    const { error } = await supabase.from("price_list_items").delete().eq("id", id);
    if (error) { notify(`Ürün/hizmet silinemedi: ${error.message}`); return; }
    setPriceListItems((prev) => prev.filter((p) => p.id !== id));
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
          `Merhaba,\n\n${companySettings?.companyName || "Binerly"} — ${updated.name} dersinin programı güncellendi. Yeni ders zamanı: ${WEEKDAYS[updated.weekday - 1]} ${updated.startTime}${updated.instructorName ? ` · ${updated.instructorName}` : ""}.`
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
          `Merhaba,\n\n${companySettings?.companyName || "Binerly"} — ${group.name} dersine (${WEEKDAYS[group.weekday - 1]} ${group.startTime}) kaydınız yapıldı.`
        );
      }
    }
  };

  const removeMember = async (enrollmentId) => {
    const { error } = await supabase.from("group_class_enrollments").delete().eq("id", enrollmentId);
    if (error) { notify(`${groupClassWords(companySettings?.sector).removeErrorPrefix}: ${error.message}`); return; }
    setGroupClassEnrollments((prev) => prev.filter((e) => e.id !== enrollmentId));
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

  // Sektör değişince formda görünen özel alanlar da değişsin isteniyor — ama
  // müşteri/teklif kayıtlarına daha önce girilmiş değerler kaybolmasın. Bu yüzden
  // başka bir sektöre ait alanlar SİLİNMEZ, sadece "active:false" ile gizlenir
  // (kaydedilmiş değerler DB'de durur); yeniden aynı sektöre dönülürse aynı
  // tanımlar "active:true" ile geri gelir. Elle eklenen alanlar (sector: null)
  // hiçbir sektör değişikliğinden etkilenmez.
  const applySectorCustomFields = async (sectorId) => {
    const preset = SECTOR_PRESETS.find((p) => p.id === sectorId);
    const toHide = customFieldDefs.filter((d) => d.active && d.sector && d.sector !== sectorId).map((d) => d.id);
    const toShow = customFieldDefs.filter((d) => !d.active && d.sector === sectorId).map((d) => d.id);
    await setCustomFieldDefsActive(toHide, false);
    await setCustomFieldDefsActive(toShow, true);
    if (!preset) return;
    for (const f of preset.customFields) {
      const exists = customFieldDefs.some((d) => d.entity === f.entity && d.key === f.key);
      if (!exists) await addCustomFieldDef({ ...f, sector: sectorId });
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
  const totalOpenValue = openDeals.reduce((sum, d) => sum + (d.value || 0), 0);
  const expectedRevenue = openDeals.reduce((sum, d) => sum + (d.value || 0) * (STAGE_PROBABILITY[d.stage] || 0), 0);
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
      if (!customerQuery) return true;
      return [c.name, c.sector, c.region, c.phone, c.email].some((f) => (f || "").toLowerCase().includes(customerQuery));
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
    if (!dealQuery) return true;
    return (
      d.title.toLowerCase().includes(dealQuery) ||
      (customerById(d.customerId)?.name || "").toLowerCase().includes(dealQuery)
    );
  }).sort((a, b) =>
    dealSort === "newest" ? new Date(b.createdAt) - new Date(a.createdAt) : new Date(a.createdAt) - new Date(b.createdAt)
  );

  const openTicketsCount = tickets.filter((t) => !TERMINAL_STATUSES.includes(t.status)).length;
  const breachedTickets = tickets.filter(
    (t) => !TERMINAL_STATUSES.includes(t.status) && getSlaStatus(t).isBreached
  );
  const breachedTicketsCount = breachedTickets.length;

  const unreadMessageTicketIds = [
    ...new Set(ticketMessages.filter((m) => m.direction === "gelen" && !m.readAt).map((m) => m.ticketId)),
  ];
  const ticketsWithUnread = tickets.filter((t) => unreadMessageTicketIds.includes(t.id));
  // unreadMessageTicketIds ham mesaj kayıtlarından geliyor — silinmiş/çöpe taşınmış
  // bir talebin mesajları yerel state'te öylece kalabilir (ticket_messages'ın kendi
  // deleted_at'i yok). Rozet sayısı bu yüzden hâlâ var olan taleplerle sınırlanmalı.
  const unreadMessagesCount = ticketsWithUnread.length;

  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);
  const dueReminderDeals = deals.filter(
    (d) => d.reminder && d.reminderDate && d.stage !== "kazanildi" && d.stage !== "kaybedildi" && new Date(d.reminderDate) <= todayEnd
  );
  // Müşteri portalından kendi kendine alınan, henüz KOBİ tarafından hiç
  // dokunulmamış (hâlâ "ilk_gorusme" aşamasında) randevu talepleri — gözden
  // kaçmasınlar diye "Bugün ne yapmalıyım" widget'ında en üstte gösterilir.
  const newPortalAppointments = deals.filter(
    (d) => d.customFields?.kaynak === "portal" && d.customFields?.portal_randevu_zamani && d.stage === "ilk_gorusme"
  );
  const urgentTickets = tickets.filter((t) => {
    if (TERMINAL_STATUSES.includes(t.status)) return false;
    const s = getSlaStatus(t);
    return s.isBreached || s.isApproaching;
  });

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

  const lostReasonCounts = LOST_REASONS.map((reason) => ({
    reason,
    count: lostDeals.filter((d) => d.lostReason === reason).length,
  })).filter((r) => r.count > 0);

  return (
    <div style={{ maxWidth: 980, margin: "0 auto", padding: "24px 16px 64px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1.5rem" }}>
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
        <div style={{ display: "flex", gap: 8 }}>
          <NotificationBell userId={session.user.id} supabase={supabase} dataTour="notification-bell" />
          <IconButton
            icon={pushSubscribed ? "ti-bell-ringing" : "ti-bell"}
            active={pushSubscribed}
            onClick={() => (pushSubscribed ? unsubscribeFromPush() : subscribeToPush())}
            title={pushSubscribed ? "Bildirimler açık (kapatmak için tıkla)" : "Yeni mesaj bildirimlerini aç"}
          />
          <IconButton icon="ti-settings" onClick={() => setShowSettingsHub(true)} title="Ayarlar" data-tour="settings-gear" />
          <IconButton icon="ti-logout" label="Çıkış" onClick={() => supabase.auth.signOut()} title="Çıkış yap" />
        </div>
      </div>

      <p style={{ fontSize: 11, color: "var(--text-accent)", fontWeight: 500, margin: "-12px 0 12px" }}>
        🎉 Erken erişim aşamasındayız, şu an için tamamen ücretsiz.
      </p>

      {!pushSubscribed && (
        <p style={{ fontSize: 11, color: "var(--text-muted)", margin: "-12px 0 12px" }}>
          🔔 simgesine basarak yeni müşteri mesajlarında anında bildirim alabilirsiniz. iPhone'da bildirim almak için önce uygulamayı Ana Ekrana eklemeniz gerekir.
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
                Bir işletme sizi takımına davet etti ({inv.email}) — takıma katılırsanız o işletmenin tüm müşteri/teklif/destek verisini görüp düzenleyebilirsiniz.
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
                  <InfoTip text="Bir hesap yalnızca aynı işletmenin çalışan/yetkilileri arasında paylaşılabilir (Kullanım Koşulları md. 3) — bu beyan, ilgisiz kişi/işletmelerin maliyet paylaşmak için bir hesabı ortak kullanmasını önlemek için isteniyor." />
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

      <div style={{ display: "flex", gap: 8, marginBottom: "1.5rem" }}>
        {[
          { id: "pano", label: "Pano", icon: "ti-layout-dashboard" },
          { id: "musteri", label: "Müşteri Kayıtları", icon: "ti-building" },
          { id: "firsat", label: "Müşteri Takibi", icon: "ti-target-arrow" },
          { id: "finans", label: "Finans", icon: "ti-chart-line" },
          { id: "mesajlar", label: "Mesajlar", icon: "ti-message-2" },
          ...(supportsGroupClasses(companySettings?.sector) ? [{ id: "dersler", label: "Dersler", icon: "ti-calendar-time" }] : []),
          { id: "destek", label: "Destek", icon: "ti-headset" },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            data-tour={`tab-${t.id}`}
            style={{
              flex: 1,
              border: tab === t.id ? "0.5px solid var(--border-strong)" : "0.5px solid var(--border)",
              background: tab === t.id ? "var(--surface-1)" : "transparent",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              position: "relative",
            }}
          >
            <i className={`ti ${t.icon}`} style={{ fontSize: 16 }} aria-hidden="true"></i>
            {t.label}
            {t.id === "destek" && unreadMessagesCount > 0 && (
              <span
                style={{
                  position: "absolute", top: -6, right: -6, minWidth: 18, height: 18, borderRadius: 9,
                  background: "var(--text-danger)", color: "var(--on-accent)", fontSize: 11, fontWeight: 700,
                  display: "flex", alignItems: "center", justifyContent: "center", padding: "0 4px",
                }}
              >
                {unreadMessagesCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {tab === "pano" && (
        <div>
          <div style={{ background: "var(--surface-1)", borderRadius: "var(--radius)", padding: "1rem", marginBottom: "1.5rem" }}>
            <p style={{ fontSize: 14, fontWeight: 500, margin: "0 0 10px" }}>Bugün ne yapmalıyım</p>
            {dueReminderDeals.length === 0 && urgentTickets.length === 0 && newPortalAppointments.length === 0 ? (
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
                      <span style={{ flex: 1 }}>{c?.name || "Bilinmeyen müşteri"} — {d.title}</span>
                      <Badge tone="accent">Portaldan alındı</Badge>
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
                      <span style={{ flex: 1 }}>{c?.name || "Bilinmeyen müşteri"} — {d.reminder}</span>
                      <Badge tone={overdue ? "danger" : "warning"}>{overdue ? "Gecikti" : "Bugün"}</Badge>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div style={{ display: "flex", gap: 4, background: "var(--surface-1)", borderRadius: "var(--radius)", padding: 3, marginBottom: "1.5rem", flexWrap: "wrap" }}>
            {PANO_RANGES.map((r) => (
              <button
                key={r.id}
                onClick={() => setPanoRange(r.id)}
                style={{ border: "none", background: panoRange === r.id ? "var(--surface-2)" : "transparent", fontSize: 13 }}
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
              value={rangeAvgDealSize !== null ? formatTL(rangeAvgDealSize) : "—"}
            />
          </div>

          {wonDeals.length > 0 && (
            <div style={{ marginBottom: "1.5rem" }}>
              <p style={{ fontSize: 14, fontWeight: 500, margin: "0 0 8px", display: "flex", alignItems: "center", gap: 4 }}>
                Personel Performansı
                <InfoTip text={`Seçili tarih aralığında (yukarıdaki ${rangeLabel}) kazanılan ${DEAL_WORD_FORMS[dealKind].genPlural}, her ${DEAL_WORD_FORMS[dealKind].loc} seçtiğiniz "Sorumlu" kişiye göre dağılımı. ${dealWords.columnHeader} formunda sorumlu atamazsanız "Atanmamış" altında görünür.`} />
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {Object.entries(
                  wonDeals.reduce((acc, d) => {
                    const key = d.assignedTo || "unassigned";
                    (acc[key] ||= { count: 0, revenue: 0 }).count += 1;
                    acc[key].revenue += d.value || 0;
                    return acc;
                  }, {})
                )
                  .sort((a, b) => b[1].revenue - a[1].revenue)
                  .map(([assigneeId, stats]) => {
                    const label =
                      assigneeId === "unassigned"
                        ? "Atanmamış"
                        : assigneeId === session.user.id
                        ? `${session.user.user_metadata?.full_name || session.user.email} (Ben)`
                        : teamMembers.find((m) => m.id === assigneeId)?.name || teamMembers.find((m) => m.id === assigneeId)?.email || "Bilinmeyen";
                    return (
                      <div key={assigneeId} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "var(--surface-1)", borderRadius: "var(--radius)", padding: "8px 12px" }}>
                        <span style={{ fontSize: 13 }}>{label}</span>
                        <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>
                          {stats.count} {DEAL_WORD_FORMS[dealKind].bare} · <strong style={{ color: "var(--text-primary)" }}>{formatTL(stats.revenue)}</strong>
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
              <p style={{ fontSize: 14, fontWeight: 500, margin: "0 0 8px" }}>{dealWordKind(companySettings?.sector) === "uyelik" ? "Üyelik aşamaları" : dealWordKind(companySettings?.sector) === "randevu" ? "Randevu aşamaları" : "Teklif aşamaları"}</p>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px,1fr))", gap: 8 }}>
                {STAGES.filter((s) => s.id !== "kaybedildi").map((stage) => {
                  const stageDeals = deals.filter((d) => d.stage === stage.id);
                  return (
                    <div key={stage.id}>
                      <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 6 }}>
                        {stageLabel(stage.id, undefined, companySettings?.sector)} · {stageDeals.length}
                      </div>
                      {stageDeals.length === 0 && <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Boş</div>}
                      {stageDeals.map((d) => {
                        const c = customerById(d.customerId);
                        const tone = stage.id === "kazanildi" ? "success" : stage.id === "muzakere" ? "warning" : "default";
                        return (
                          <div
                            key={d.id}
                            style={{
                              background: tone === "default" ? "var(--surface-1)" : `var(--bg-${tone})`,
                              border: tone === "default" ? "0.5px solid var(--border)" : "none",
                              borderRadius: "var(--radius)",
                              padding: 8,
                              marginBottom: 6,
                              fontSize: 13,
                              color: tone === "default" ? "var(--text-primary)" : `var(--text-${tone})`,
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
                    {lostReasonCounts.map((r) => (
                      <div key={r.reason} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "2px 0" }}>
                        <span>{r.reason}</span>
                        <span style={{ color: "var(--text-secondary)" }}>{r.count}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {tab === "musteri" && (
        <div>
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12, gap: 8, flexWrap: "wrap" }}>
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
              onClick={() => { setEditingCustomer(null); setShowCustomerForm(true); }}
              style={{ background: "var(--fill-accent)", color: "var(--on-accent)", border: "none", display: "flex", alignItems: "center", gap: 6 }}
            >
              <i className="ti ti-plus" style={{ fontSize: 16 }} aria-hidden="true"></i>
              Müşteri ekle
            </button>
          </div>

          <div style={{ display: "flex", marginBottom: 12, gap: 8, flexWrap: "wrap" }}>
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
            <p style={{ fontSize: 14, color: "var(--text-secondary)" }}>
              {customers.length === 0 ? "Henüz müşteri eklenmedi." : "Aramayla eşleşen müşteri yok."}
            </p>
          ) : (
            <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: "0 8px" }}>
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
                    <td onClick={() => setViewingCustomer(c)} style={{ padding: "10px 12px", borderRadius: "var(--radius) 0 0 var(--radius)", cursor: "pointer" }}>
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
                    <td style={{ padding: "10px 12px", whiteSpace: "nowrap" }}>
                      <Badge tone={leadScore(c.lastContact).tone}>{leadScore(c.lastContact).label}</Badge>
                    </td>
                    <td style={{ padding: "10px 12px", whiteSpace: "nowrap" }}>
                      <Badge tone={daysAgo(c.lastContact) === "Bugün" ? "success" : "default"}>
                        {daysAgo(c.lastContact) || "Temas yok"}
                      </Badge>
                    </td>
                    <td style={{ padding: "10px 12px", whiteSpace: "nowrap" }}>
                      {c.portalUserId ? <Badge tone="accent">Var</Badge> : <span style={{ fontSize: 12, color: "var(--text-muted)" }}>—</span>}
                    </td>
                    <td style={{ padding: "10px 12px", whiteSpace: "nowrap" }}>
                      {customerBalance > 0 ? <Badge tone="warning">{formatTL(customerBalance)}</Badge> : <span style={{ fontSize: 12, color: "var(--text-muted)" }}>—</span>}
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
          )}
        </div>
      )}

      {tab === "firsat" && (
        <div>
          <div style={{ display: "flex", gap: 4, background: "var(--surface-1)", borderRadius: "var(--radius)", padding: 3, marginBottom: 12, width: "fit-content" }}>
            <button
              onClick={() => { setDealAudience("kurumsal"); updatePreferredCustomerType("kurumsal"); }}
              style={{ border: "none", background: dealAudience === "kurumsal" ? "var(--surface-2)" : "transparent", display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}
            >
              <i className="ti ti-building" style={{ fontSize: 15 }} aria-hidden="true"></i>
              Kurumsal
            </button>
            <button
              onClick={() => { setDealAudience("bireysel"); updatePreferredCustomerType("bireysel"); }}
              style={{ border: "none", background: dealAudience === "bireysel" ? "var(--surface-2)" : "transparent", display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}
            >
              <i className="ti ti-user" style={{ fontSize: 15 }} aria-hidden="true"></i>
              Bireysel
            </button>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12, gap: 8, flexWrap: "wrap" }}>
            <div style={{ display: "flex", gap: 4, background: "var(--surface-1)", borderRadius: "var(--radius)", padding: 3 }}>
              <button
                onClick={() => setDealView("list")}
                style={{ border: "none", background: dealView === "list" ? "var(--surface-2)" : "transparent", display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}
              >
                <i className="ti ti-list" style={{ fontSize: 15 }} aria-hidden="true"></i>
                Liste
              </button>
              <button
                onClick={() => setDealView("kanban")}
                style={{ border: "none", background: dealView === "kanban" ? "var(--surface-2)" : "transparent", display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}
              >
                <i className="ti ti-layout-kanban" style={{ fontSize: 15 }} aria-hidden="true"></i>
                Kanban
              </button>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
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
              <button
                onClick={() => { setEditingDeal(null); setShowDealForm(true); }}
                disabled={customers.length === 0}
                style={{ background: "var(--fill-accent)", color: "var(--on-accent)", border: "none", display: "flex", alignItems: "center", gap: 6 }}
              >
                <i className="ti ti-plus" style={{ fontSize: 16 }} aria-hidden="true"></i>
                {dealWords.addLabel}
              </button>
            </div>
          </div>

          <div style={{ display: "flex", marginBottom: 12, gap: 8, flexWrap: "wrap" }}>
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
            <p style={{ fontSize: 14, color: "var(--text-secondary)" }}>
              {deals.length === 0 ? dealWords.emptyDefault : dealWords.emptySearch}
            </p>
          ) : dealView === "kanban" ? (
            <div style={{ display: "flex", gap: 12, overflowX: "auto", paddingBottom: 8 }}>
              {STAGES.map((stage) => {
                const stageDeals = filteredDeals.filter((d) => d.stage === stage.id);
                const stageValue = stageDeals.reduce((sum, d) => sum + (d.value || 0), 0);
                return (
                  <div
                    key={stage.id}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => { if (dragDealId) { moveDealStage(dragDealId, stage.id); setDragDealId(null); } }}
                    style={{ background: "var(--surface-1)", borderRadius: "var(--radius)", padding: 10, minWidth: 220, flex: "0 0 220px" }}
                  >
                    <div style={{ marginBottom: 8 }}>
                      <p style={{ fontSize: 13, fontWeight: 600, margin: "0 0 2px" }}>{stageLabel(stage.id, dealAudience, companySettings?.sector)} · {stageDeals.length}</p>
                      <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: 0 }}>{formatTL(stageValue)}</p>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8, minHeight: 40 }}>
                      {stageDeals.map((d) => {
                        const c = customerById(d.customerId);
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
                            {d.customFields?.kaynak === "portal" && d.customFields?.portal_randevu_zamani && (
                              <div style={{ marginBottom: 4 }}>
                                <Badge tone="accent">Portaldan alındı</Badge>
                              </div>
                            )}
                            {d.paymentStatus === "paid" && (
                              <div style={{ marginBottom: 4 }}>
                                <Badge tone="success">✓ Online ödendi</Badge>
                              </div>
                            )}
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                              <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "var(--text-accent)" }}>{formatTL(d.value)}</p>
                              <IconButton
                                icon="ti-file-text"
                                title={dealPdfLabel}
                                size="sm"
                                onClick={(e) => { e.stopPropagation(); setTeklifDeal(d); }}
                              />
                            </div>
                            {(() => {
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
                                <Badge tone={d.sessionUsed >= d.sessionTotal ? "success" : "default"}>
                                  {d.sessionUsed >= d.sessionTotal ? "Paket tamamlandı" : `${d.sessionUsed}/${d.sessionTotal} seans`}
                                </Badge>
                                {d.sessionUsed < d.sessionTotal && (
                                  <IconButton
                                    icon="ti-plus"
                                    title="Seans kullanıldı"
                                    size="sm"
                                    onClick={(e) => { e.stopPropagation(); incrementSessionUsage(d.id); }}
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
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: "0 8px" }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left", padding: "0 12px", fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.3 }}>{dealWords.columnHeader}</th>
                  <th style={{ textAlign: "left", padding: "0 12px", fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.3, whiteSpace: "nowrap" }}>Aşama</th>
                  <th style={{ textAlign: "left", padding: "0 12px", fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.3, whiteSpace: "nowrap" }}>Ödeme</th>
                  <th style={{ textAlign: "right", padding: "0 12px", fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.3, whiteSpace: "nowrap" }}>Tutar</th>
                  <th style={{ textAlign: "right", padding: "0 12px" }}>
                    <InfoTip text={dealActionsInfoText(companySettings?.sector)} />
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredDeals.map((d) => {
                  const c = customerById(d.customerId);
                  const tone = d.stage === "kazanildi" ? "success" : d.stage === "kaybedildi" ? "default" : d.stage === "muzakere" ? "warning" : "accent";
                  const paid = totalPaidForDeal(d.id);
                  const remaining = d.value - paid;
                  return (
                    <tr key={d.id} style={{ background: "var(--surface-1)" }}>
                      <td onClick={() => { setEditingDeal(d); setShowDealForm(true); }} style={{ padding: "10px 12px", borderRadius: "var(--radius) 0 0 var(--radius)", cursor: "pointer" }}>
                        <p style={{ margin: 0, fontWeight: 500, fontSize: 14 }}>
                          {c?.name || "Bilinmeyen müşteri"} — {d.title}
                        </p>
                        <p style={{ margin: 0, fontSize: 12, color: "var(--text-secondary)" }}>
                          {d.createdAt ? new Date(d.createdAt).toLocaleDateString("tr-TR") : ""}
                          {d.createdAt && new Date(d.createdAt).toTimeString().slice(0, 5) !== "00:00"
                            ? ` · ${new Date(d.createdAt).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}`
                            : ""}
                          {" "}· {d.reminder ? `Hatırlatma: ${d.reminder}` : "Hatırlatma yok"}
                        </p>
                        {d.customFields?.kaynak === "portal" && d.customFields?.portal_randevu_zamani && (
                          <div style={{ marginTop: 4 }}>
                            <Badge tone="accent">Portaldan alındı</Badge>
                          </div>
                        )}
                        {d.paymentStatus === "paid" && (
                          <div style={{ marginTop: 4 }}>
                            <Badge tone="success">✓ Online ödendi</Badge>
                          </div>
                        )}
                        {!!d.sessionTotal && (
                          <div style={{ marginTop: 4 }}>
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
                        {d.approvedAt && (
                          <div style={{ marginTop: 4 }}>
                            <Badge tone="success">Onaylandı ✓</Badge>
                          </div>
                        )}
                      </td>
                      <td style={{ padding: "10px 12px", whiteSpace: "nowrap" }}>
                        <Badge tone={tone}>{stageLabel(d.stage, c?.customerType || "kurumsal", companySettings?.sector)}</Badge>
                      </td>
                      <td onClick={() => setPaymentsDeal(d)} style={{ padding: "10px 12px", whiteSpace: "nowrap", cursor: "pointer" }}>
                        {paid > 0 ? <Badge tone={remaining <= 0 ? "success" : "warning"}>{remaining <= 0 ? "Ödendi" : "Kısmi ödeme"}</Badge> : <span style={{ fontSize: 12, color: "var(--text-muted)" }}>—</span>}
                      </td>
                      <td style={{ padding: "10px 12px", whiteSpace: "nowrap", textAlign: "right", fontSize: 13, fontWeight: 500 }}>{formatTL(d.value)}</td>
                      <td style={{ padding: "10px 12px", borderRadius: "0 var(--radius) var(--radius) 0" }}>
                        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                          <IconButton icon="ti-file-text" title={dealPdfLabel} onClick={() => setTeklifDeal(d)} />
                          <IconButton
                            icon="ti-link"
                            title={c?.email ? "Müşterinin onaylayabileceği link — kopyala ve gönder" : "Onay linki için müşterinin e-postası kayıtlı olmalı"}
                            disabled={!c?.email}
                            onClick={() => {
                              if (!c?.email) { notify("Onay linki oluşturmak için önce müşterinin e-postasını ekleyin."); return; }
                              setPaymentModeDeal(d);
                            }}
                          />
                          {!!d.sessionTotal && d.sessionUsed < d.sessionTotal && (
                            <IconButton icon="ti-plus" title="Seans kullanıldı" onClick={() => incrementSessionUsage(d.id)} />
                          )}
                          <IconButton icon="ti-cash" title="Tahsilat" onClick={() => setPaymentsDeal(d)} />
                          <IconButton
                            icon="ti-copy"
                            title={`Bu ${DEAL_WORD_FORMS[dealKind].gen} bilgileriyle yeni bir ${DEAL_WORD_FORMS[dealKind].bare} oluştur`}
                            onClick={() => {
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
                            }}
                          />
                          <IconButton icon="ti-edit" title="Düzenle" onClick={() => { setEditingDeal(d); setShowDealForm(true); }} />
                          <IconButton icon="ti-trash" title="Sil" onClick={() => setConfirmDeleteDeal(d)} />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
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
          onOpenPayments={setPaymentsDeal}
          sector={companySettings?.sector}
        />
      )}

      {tab === "mesajlar" && (
        <div style={{ background: "#fff", borderRadius: 16, padding: "3rem 2rem", textAlign: "center", border: "1px solid #e1e8f0" }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>💬</div>
          <h3 style={{ margin: "0 0 8px" }}>Yakında</h3>
          <p style={{ margin: 0, color: "#64748b", maxWidth: 420, marginLeft: "auto", marginRight: "auto" }}>
            WhatsApp ve Instagram üzerinden gelen mesajları tek yerden yönetme özelliği üzerinde çalışıyoruz. Yakında burada olacak.
          </p>
        </div>
      )}

      {tab === "destek" && (
        <Support
          customers={customers}
          tickets={tickets}
          ticketMessages={ticketMessages}
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

      {tab === "dersler" && supportsGroupClasses(companySettings?.sector) && (
        <GroupClassesTab
          groupClasses={groupClasses}
          groupClassEnrollments={groupClassEnrollments}
          customers={customers}
          activeCustomerIds={new Set(activeMemberships.map((d) => d.customerId))}
          sector={companySettings?.sector}
          onAdd={addGroupClass}
          onUpdate={updateGroupClass}
          onDelete={deleteGroupClass}
          onEnroll={enrollMember}
          onRemove={removeMember}
        />
      )}

      {showCustomerForm && (
        <Modal title={editingCustomer?.id ? "Müşteriyi düzenle" : "Yeni müşteri"} onClose={() => { setShowCustomerForm(false); setEditingCustomer(null); }}>
          <CustomerForm
            initial={editingCustomer}
            customFieldDefs={customFieldDefs}
            sectorTags={SECTOR_PRESETS.find((p) => p.id === companySettings?.sector)?.tags || []}
            preferredCustomerType={companySettings?.preferredCustomerType}
            onSave={upsertCustomer}
            onCancel={() => { setShowCustomerForm(false); setEditingCustomer(null); }}
            onPreferredTypeChange={updatePreferredCustomerType}
          />
        </Modal>
      )}

      {showSettingsHub && (
        <Modal title="Ayarlar" onClose={() => setShowSettingsHub(false)}>
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
                icon="ti-tag"
                label="Ürün & Hizmet Fiyat Listesi"
                description={`Sabit fiyatlı ürün/hizmetlerinizi kaydedin, ${DEAL_WORD_FORMS[dealKind].pluralLoc} hızlıca seçin`}
                onClick={() => { setShowSettingsHub(false); setShowPriceList(true); }}
              />
              <MenuRow
                icon="ti-layout"
                label="Teklif Şablonları"
                description="PDF teklifinizin tasarımını seçin"
                onClick={() => { setShowSettingsHub(false); setShowPdfTemplates(true); }}
              />
              <MenuRow
                icon="ti-credit-card"
                label="Ödeme Bağlantısı (iyzico)"
                description={paymentCredentials.some((pc) => pc.provider === "iyzico") ? "Bağlı ✓ — müşteriler onay linkinden kartla ödeyebilir" : "Onay linkinden kartla tahsilat almak için bağlayın"}
                onClick={() => { setShowSettingsHub(false); setShowPaymentSettings(true); }}
              />
              {supportsSelfBooking(companySettings?.sector) && (
                <MenuRow
                  icon="ti-clock"
                  label="Müsaitlik Saatleri"
                  description="Müşteri portalından randevu alınabilecek gün/saatleri belirleyin"
                  onClick={() => { setShowSettingsHub(false); setShowBusinessHours(true); }}
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
          <MenuRow
            icon="ti-map-2"
            label="Turu Tekrar Başlat"
            description="Sistemin nasıl çalıştığını gösteren kısa turu tekrar izleyin"
            onClick={() => { setShowSettingsHub(false); setTourStep(0); setShowTour(true); }}
          />
        </Modal>
      )}

      {leadCaptureLink && (
        <Modal title="Müşteri Kazanma Linki" onClose={() => setLeadCaptureLink(null)}>
          <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: "0 0 16px" }}>
            Bu linki (veya QR kodu) fuarda, mağazada, kartvizitte paylaşın — müşteri kendi adı/telefonu/e-postasını kendisi girer, sizin elle eklemenize gerek kalmaz.
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
        </Modal>
      )}

      {showSettingsForm && (
        <Modal title="İşletme Bilgileri" onClose={() => setShowSettingsForm(false)}>
          <CompanySettingsForm initial={companySettings} customFieldDefs={customFieldDefs} onSave={upsertCompanySettings} onCancel={() => setShowSettingsForm(false)} activeTeamId={activeTeamId} notify={notify} />
        </Modal>
      )}

      {showSectorFields && (
        <Modal title="Sektör & Özel Alanlar" onClose={() => setShowSectorFields(false)}>
          <div style={{ marginBottom: 8 }}>
            <label style={{ fontSize: 13, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Sektör</label>
            <select
              value={companySettings?.sector || ""}
              onChange={(e) => e.target.value && applySectorPreset(e.target.value)}
              style={{ width: "100%" }}
            >
              <option value="">Seçilmedi</option>
              {SECTOR_PRESETS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
            <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "4px 0 0" }}>Seçtiğinizde aşama isimlerini, önerilen etiketleri ve özel alanları hemen günceller.</p>
          </div>
          <CustomFieldDefsManager customFieldDefs={customFieldDefs} onAdd={addCustomFieldDef} onUpdate={updateCustomFieldDef} onDelete={deleteCustomFieldDef} sector={companySettings?.sector} />
        </Modal>
      )}

      {showPriceList && (
        <Modal title="Ürün & Hizmet Fiyat Listesi" onClose={() => setShowPriceList(false)}>
          <PriceListManager items={priceListItems} onAdd={addPriceListItem} onUpdate={updatePriceListItem} onDelete={deletePriceListItem} sector={companySettings?.sector} />
        </Modal>
      )}

      {showPdfTemplates && (
        <Modal title="Teklif Şablonları" onClose={() => setShowPdfTemplates(false)}>
          <TemplateGallery
            activeKey={companySettings?.pdfTemplateKey || "klasik"}
            customTemplates={pdfTemplates}
            onSelect={(key) => upsertCompanySettings({ ...companySettings, pdfTemplateKey: key })}
            onEdit={(tpl) => { setShowPdfTemplates(false); setEditingTemplate(tpl); }}
            onDelete={deletePdfTemplate}
            onCreateNew={(tpl) => { setShowPdfTemplates(false); setEditingTemplate(tpl); }}
          />
        </Modal>
      )}

      {showPaymentSettings && (
        <Modal title="Ödeme Bağlantısı (iyzico)" onClose={() => setShowPaymentSettings(false)}>
          <PaymentCredentialForm
            credential={paymentCredentials.find((pc) => pc.provider === "iyzico") || null}
            onSave={upsertPaymentCredential}
            onDelete={deletePaymentCredential}
            onClose={() => setShowPaymentSettings(false)}
          />
        </Modal>
      )}

      {editingTemplate && (
        <TemplateEditor
          initialTemplate={editingTemplate}
          onSave={savePdfTemplate}
          onClose={() => { setEditingTemplate(null); setShowPdfTemplates(true); }}
        />
      )}

      {showBusinessHours && (
        <Modal title="Müsaitlik Saatleri" onClose={() => setShowBusinessHours(false)}>
          <BusinessHoursManager items={businessHours} onAdd={addBusinessHours} onDelete={deleteBusinessHours} />
        </Modal>
      )}

      {showSectorOnboarding && (
        <SectorOnboardingModal onPick={applySectorPreset} onSkip={skipSectorOnboarding} />
      )}

      {showTour && (
        <OnboardingTour
          step={tourStep}
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
        <TrashHistoryModal notify={notify} onRestore={restoreBatch} onClose={() => setShowTrashHistory(false)} activeTeamId={activeTeamId} session={session} teamMembers={teamMembers} />
      )}

      {showImportCustomers && (
        <ImportModal
          entityType="customers"
          entityLabel="Müşteri Kayıtları"
          fieldDefs={CUSTOMER_IMPORT_FIELDS}
          allowVcf
          checkDuplicate={(r) => customers.some((c) => c.name.trim().toLowerCase() === (r.name || "").trim().toLowerCase())}
          onImport={bulkImportCustomers}
          onClose={() => setShowImportCustomers(false)}
        />
      )}

      {showImportDeals && (
        <ImportModal
          entityType="deals"
          entityLabel="Müşteri Takibi"
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
          columns={["Firma adı", "Sektör", "Bölge", "Telefon", "E-posta", "Not", "Son temas"]}
          getLabel={(c) => c.name}
          getRow={(c) => [
            c.name,
            c.sector,
            c.region,
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
          columns={["Müşteri", "Başlık", "Tutar", "Gider", "Aşama", "Hatırlatma notu", "Oluşturulma tarihi"]}
          getLabel={(d) => `${customerById(d.customerId)?.name || "Bilinmeyen müşteri"} — ${d.title}`}
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
                  <span style={{ fontSize: 14 }}>{customerById(item.customerId)?.name || "Bilinmeyen müşteri"} — {item.title}</span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-accent)", whiteSpace: "nowrap" }}>{formatTL(item.value)}</span>
                </div>
              ) : (
                <div
                  key={item.id}
                  onClick={() => { setQuickList(null); setTab("destek"); setInitialViewTicketId(item.id); }}
                  style={{ background: "var(--surface-1)", borderRadius: "var(--radius)", padding: "0.6rem 0.9rem", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}
                >
                  <span style={{ fontSize: 14 }}>{customerById(item.customerId)?.name || "Bilinmeyen müşteri"} — {item.subject}</span>
                </div>
              )
            )}
          </div>
        </Modal>
      )}

      {showDealForm && (
        <Modal title={editingDeal?.id ? dealWords.editTitle : dealWords.newTitle} onClose={() => { setShowDealForm(false); setEditingDeal(null); }}>
          <DealForm
            customers={customers}
            initial={editingDeal}
            defaultKdvRate={companySettings?.defaultKdvRate}
            preferredCustomerType={dealAudience}
            sector={companySettings?.sector}
            customFieldDefs={customFieldDefs}
            sectorTags={SECTOR_PRESETS.find((p) => p.id === companySettings?.sector)?.tags || []}
            teamMembers={teamMembers}
            currentUserId={session.user.id}
            currentUserEmail={session.user.email}
            titleSuggestions={[...new Set(deals.map((d) => d.title).filter(Boolean))]}
            priceListItems={priceListItems}
            initialLineItems={editingDeal ? dealLineItems.filter((li) => li.dealId === editingDeal.id) : []}
            onSave={upsertDeal}
            onCancel={() => { setShowDealForm(false); setEditingDeal(null); }}
          />
        </Modal>
      )}

      {paymentsDeal && (
        <Modal title={`Tahsilat — ${paymentsDeal.title}`} onClose={() => setPaymentsDeal(null)}>
          <DealPayments
            deal={paymentsDeal}
            payments={paymentsByDeal[paymentsDeal.id] || []}
            sector={companySettings?.sector}
            onAddPayment={addPayment}
            onDeletePayment={deletePayment}
          />
        </Modal>
      )}

      {paymentModeDeal && (
        <PaymentModeModal
          deal={paymentModeDeal}
          iyzicoConnected={paymentCredentials.some((pc) => pc.provider === "iyzico")}
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
        <CampaignModal customers={customers} replyTo={session.user.email} companyName={companySettings?.companyName} logoUrl={companySettings?.logoUrl} onClose={() => setShowCampaignModal(false)} />
      )}

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
          onAddActivity={addActivity}
          onClose={() => setViewingCustomer(null)}
        />
      )}

      {confirmDeleteCustomer && (
        <ConfirmDialog
          title="Müşteriyi sil"
          message={`"${confirmDeleteCustomer.name}" silinsin mi? Bu müşteriye ait ${DEAL_WORD_FORMS[dealKind].plural} ve destek talepleri de birlikte çöp kutusuna taşınır — dilediğiniz zaman Çöp Kutusu'ndan geri yükleyebilirsiniz.`}
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
