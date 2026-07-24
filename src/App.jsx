import React, { useState, useEffect, useRef } from "react";
import { supabase } from "./supabase";
import { Badge, Modal, MetricCard, InfoTip, Toast, ConfirmDialog, TagInput, IconButton, MenuRow, VoiceInputButton, GoogleAuthButton, AuthDivider, uid, formatTL, daysAgo, downloadXlsx, toWhatsAppNumber, WhatsAppIcon, useSessionTimeout, useTheme, matchesDateRange, DateRangeFilter, PANO_RANGES, getRangeBounds, inRange, WEEKDAYS, nextWeeklyOccurrence, NotificationBell, OnboardingTour, getPortalUrl } from "./shared";
import Finance, { rowToCompanyExpense, expandExpenseOccurrences } from "./Finance";
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
  "destek talebi açabildiği ve sizinle mesajlaşabildiği ayrı bir alan (portal.binerly.com).\n\n" +
  "Var — bu müşteri portala kayıt olup kendi hesabını bu müşteri kaydına bağlamış.\n" +
  "— — bu müşteri henüz portala giriş yapmamış. Müşterinizin, kayıtlı e-posta adresiyle " +
  "portal üzerinden kendi hesabını oluşturması yeterli, özel bir davet göndermenize gerek yok — " +
  "isterseniz \"Linki paylaş\"a tıklayıp portal adresini WhatsApp'tan hatırlatabilirsiniz.";

const DEAL_WORD_FORMS = {
  teklif: { bare: "teklif", pdfLabel: "Teklif PDF", acc: "teklifi", dat: "teklife", plural: "teklifler", pluralAcc: "teklifleri", gen: "teklifin", genPlural: "tekliflerin", loc: "teklifte", pluralLoc: "tekliflerde", ctaLabel: "Teklifi Görüntüle", possYours: "Teklifiniz", possYoursAcc: "teklifinizi" },
  randevu: { bare: "randevu", pdfLabel: "Randevu Özeti PDF", acc: "randevuyu", dat: "randevuya", plural: "randevular", pluralAcc: "randevuları", gen: "randevunun", genPlural: "randevuların", loc: "randevuda", pluralLoc: "randevularda", ctaLabel: "Randevuyu Görüntüle", possYours: "Randevunuz", possYoursAcc: "randevunuzu" },
  uyelik: { bare: "üyelik", pdfLabel: "Üyelik Özeti PDF", acc: "üyeliği", dat: "üyeliğe", plural: "üyelikler", pluralAcc: "üyelikleri", gen: "üyeliğin", genPlural: "üyeliklerin", loc: "üyelikte", pluralLoc: "üyeliklerde", ctaLabel: "Üyeliği Görüntüle", possYours: "Üyeliğiniz", possYoursAcc: "üyeliğinizi" },
  rezervasyon: { bare: "rezervasyon", pdfLabel: "Rezervasyon Özeti PDF", acc: "rezervasyonu", dat: "rezervasyona", plural: "rezervasyonlar", pluralAcc: "rezervasyonları", gen: "rezervasyonun", genPlural: "rezervasyonların", loc: "rezervasyonda", pluralLoc: "rezervasyonlarda", ctaLabel: "Rezervasyonu Görüntüle", possYours: "Rezervasyonunuz", possYoursAcc: "rezervasyonunuzu" },
};

// Müşteri Takibi sekmesindeki liste UI'ı (ekle butonu, arama, boş durumlar,
// tablo başlığı, dışa aktar/düzenle modal başlıkları) için hazır metinler.
const DEAL_TAB_STRINGS = {
  teklif: {
    navLabel: "Teklifler",
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
    navLabel: "Randevular",
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
    navLabel: "Üyelikler",
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
  rezervasyon: {
    navLabel: "Rezervasyonlar",
    addLabel: "Rezervasyon ekle",
    searchPlaceholder: "Rezervasyon ara (başlık, müşteri)...",
    openFilterLabel: "Bekleyen rezervasyonlar",
    openValueLabel: "Bekleyen rezervasyon değeri",
    openGenPluralPhrase: "Bekleyen rezervasyonların",
    emptyDefault: "Henüz rezervasyon eklenmedi.",
    emptySearch: "Aramayla eşleşen rezervasyon yok.",
    columnHeader: "Rezervasyon",
    exportTitle: "Rezervasyonları Dışa Aktar",
    editTitle: "Rezervasyonu düzenle",
    deleteTitle: "Rezervasyonu sil",
    newTitle: "Yeni rezervasyon",
    exportFilename: "rezervasyonlar.xlsx",
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
  const label = kind === "uyelik" ? "Üyelik Özeti PDF'inde" : kind === "randevu" ? "Randevu Özeti PDF'inde" : kind === "rezervasyon" ? "Rezervasyon Özeti PDF'inde" : "yazdırılan teklif PDF'inde";
  return (
    `Yukarıdaki Tutar zaten KDV dahil, müşteriden alınan toplam tutarı DEĞİŞTİRMEZ — sadece ${label} ` +
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
    createdAt: r.created_at,
    deletedAt: r.deleted_at || null,
    deletedBatchId: r.deleted_batch_id || null,
  };
}

function formatFileSize(bytes) {
  if (!bytes) return "0 KB";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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
const APPOINTMENT_LOST_REASONS = ["İptal etti", "Randevuya gelmedi", "Diğer"];
function dealLostReasons(sector) {
  return isAppointmentSector(sector) ? APPOINTMENT_LOST_REASONS : LOST_REASONS;
}

// "Örnek verilerle başla" — şirket bir sektör seçtiyse (şimdilik 3 sektör
// için), örnek kayıtlar o sektörün gerçek diliyle (başlık, özel alan, etiket)
// geliyor. Diğer sektörlerde/sektör seçilmemişse seedDemoData'daki genel
// (sektörden bağımsız) sabit set kullanılmaya devam ediyor.
const SECTOR_DEMO_PRESETS = {
  guzellik_bakim: {
    customers: [
      { name: "Örnek Müşteri — Elif Kaya", customerType: "bireysel", phone: "0532 000 00 11" },
      { name: "Örnek Müşteri — Zeynep Demir", customerType: "bireysel", phone: "0532 000 00 12" },
    ],
    deals: [
      { customerIndex: 0, title: "Lazer Epilasyon Paketi", value: 3500, cost: 0, stage: "kazanildi", customFields: { hizmet_turu: "Lazer Epilasyon", hizmet_suresi_dk: 45 } },
      { customerIndex: 1, title: "Saç Kesimi Randevusu", value: 400, cost: 0, stage: "kaybedildi", tags: ["Gelmedi"], customFields: { hizmet_turu: "Saç Kesimi/Boyama" } },
      { customerIndex: 0, title: "Cilt Bakımı Randevusu", value: 800, cost: 0, stage: "muzakere", reminderToday: true, reminder: "Randevu hatırlatması yap", customFields: { hizmet_turu: "Cilt Bakımı" } },
    ],
  },
  saglik_klinik: {
    customers: [
      { name: "Örnek Hasta — Mehmet Aydın", customerType: "bireysel", phone: "0532 000 00 21" },
      { name: "Örnek Hasta — Fatma Şahin", customerType: "bireysel", phone: "0532 000 00 22" },
    ],
    deals: [
      { customerIndex: 0, title: "Diş Muayenesi ve Tedavi", value: 2500, cost: 0, stage: "kazanildi", customFields: { tedavi_hizmet: "Diş dolgusu", tetkik_turu: "Panoramik röntgen" } },
      { customerIndex: 1, title: "Check-up Paketi", value: 1800, cost: 0, stage: "teklif", reminderToday: true, reminder: "Tedavi planını sun", customFields: { tedavi_hizmet: "Genel check-up" } },
      { customerIndex: 0, title: "Kontrol Muayenesi", value: 300, cost: 0, stage: "muzakere", customFields: { tedavi_hizmet: "Kontrol" } },
    ],
  },
  sanayi_esnaf: {
    customers: [
      { name: "Örnek Müşteri — Ahmet Yılmaz", customerType: "bireysel", phone: "0532 000 00 31" },
      { name: "Örnek Müşteri — Kaya Nakliyat", customerType: "kurumsal", phone: "0532 000 00 32" },
    ],
    deals: [
      { customerIndex: 0, title: "Oto Boya İşlemi", value: 8500, cost: 3000, stage: "kazanildi", customFields: { servis_turu: "Oto Boya", arac_ekipman_bilgisi: "34 ABC 123, Toyota Corolla", tahmini_ucret: 8000 } },
      { customerIndex: 1, title: "Kaynak İşi Teklifi", value: 4200, cost: 0, stage: "teklif", reminderToday: true, reminder: "Parça durumunu kontrol et", customFields: { servis_turu: "Kaynak İşi", parca_durumu: "Sipariş verildi" } },
      { customerIndex: 0, title: "Elektrik Arızası", value: 1200, cost: 0, stage: "ilk_gorusme", customFields: { servis_turu: "Elektrik İşi" } },
    ],
  },
  emlak: {
    customers: [
      { name: "Örnek Müşteri — Can Öztürk", customerType: "bireysel", phone: "0532 000 00 41" },
      { name: "Örnek Müşteri — Ada Yapı A.Ş.", customerType: "kurumsal", phone: "0532 000 00 42" },
    ],
    deals: [
      { customerIndex: 0, title: "3+1 Daire Satışı — Kadıköy", value: 2500000, cost: 0, stage: "kazanildi", customFields: { mulk_tipi: "Daire", islem_turu: "Satış", metrekare: 120, ilan_no: "KDK-1042" } },
      { customerIndex: 1, title: "Ofis Kiralama Teklifi", value: 45000, cost: 0, stage: "teklif", reminderToday: true, reminder: "Mülk fotoğraflarını gönder", customFields: { mulk_tipi: "İşyeri", islem_turu: "Kiralama", metrekare: 200 } },
      { customerIndex: 0, title: "Villa Görüşmesi", value: 4500000, cost: 0, stage: "ilk_gorusme", customFields: { mulk_tipi: "Villa", islem_turu: "Satış" } },
    ],
  },
  dijital_ajans: {
    customers: [
      { name: "Örnek Müşteri — Lezzet Cafe", customerType: "kurumsal", phone: "0532 000 00 51" },
      { name: "Örnek Müşteri — Parlak Kozmetik", customerType: "kurumsal", phone: "0532 000 00 52" },
    ],
    deals: [
      { customerIndex: 0, title: "Sosyal Medya Yönetimi (Aylık)", value: 12000, cost: 0, stage: "kazanildi", customFields: { hizmet_turu: "Sosyal medya yönetimi", sozlesme_suresi: "Aylık", aylik_butce: 5000 } },
      { customerIndex: 1, title: "Web Sitesi Yenileme Teklifi", value: 35000, cost: 0, stage: "teklif", reminderToday: true, reminder: "Teklifi takip et", customFields: { hizmet_turu: "Web tasarım", sozlesme_suresi: "Tek seferlik" } },
      { customerIndex: 0, title: "SEO Danışmanlığı Görüşmesi", value: 8000, cost: 0, stage: "ilk_gorusme", customFields: { hizmet_turu: "SEO" } },
    ],
  },
  uretim_satis: {
    customers: [
      { name: "Örnek Müşteri — Yıldız Market Zinciri", customerType: "kurumsal", phone: "0532 000 00 61" },
      { name: "Örnek Müşteri — Deniz Toptan Gıda", customerType: "kurumsal", phone: "0532 000 00 62" },
    ],
    deals: [
      { customerIndex: 0, title: "Aylık Ürün Sevkiyatı", value: 85000, cost: 0, stage: "kazanildi", customFields: { urun_grubu: "Gıda ambalaj", siparis_miktari: 5000, sevkiyat_durumu: "Teslim edildi" } },
      { customerIndex: 1, title: "Toptan Sipariş Teklifi", value: 42000, cost: 0, stage: "teklif", reminderToday: true, reminder: "Fiyat teklifini takip et", customFields: { urun_grubu: "Temizlik ürünleri", siparis_miktari: 2000 } },
      { customerIndex: 0, title: "Yeni Ürün Görüşmesi", value: 15000, cost: 0, stage: "ilk_gorusme", customFields: { urun_grubu: "Kağıt ürünleri" } },
    ],
  },
  hizmet_danismanlik: {
    customers: [
      { name: "Örnek Müşteri — Vizyon Holding", customerType: "kurumsal", phone: "0532 000 00 71" },
      { name: "Örnek Müşteri — Selin Aydın", customerType: "bireysel", phone: "0532 000 00 72" },
    ],
    deals: [
      { customerIndex: 0, title: "Kurumsal Verimlilik Danışmanlığı", value: 60000, cost: 0, stage: "kazanildi", customFields: { ucretlendirme_modeli: "Proje bazlı", proje_kapsami: "Süreç iyileştirme" } },
      { customerIndex: 1, title: "Kariyer Koçluğu Teklifi", value: 6000, cost: 0, stage: "teklif", reminderToday: true, reminder: "Teklifi takip et", customFields: { ucretlendirme_modeli: "Aylık paket" } },
      { customerIndex: 0, title: "Yeni Proje Görüşmesi", value: 25000, cost: 0, stage: "muzakere", customFields: { ucretlendirme_modeli: "Saatlik" } },
    ],
  },
  perakende: {
    customers: [
      { name: "Örnek Müşteri — Burak Kaya", customerType: "bireysel", phone: "0532 000 00 81" },
      { name: "Örnek Müşteri — Naz Yılmaz", customerType: "bireysel", phone: "0532 000 00 82" },
    ],
    deals: [
      { customerIndex: 0, title: "Mağaza İçi Alışveriş", value: 3200, cost: 0, stage: "kazanildi", customFields: { satis_kanali: "Mağaza", urun_kategorisi: "Giyim" } },
      { customerIndex: 1, title: "Online Sipariş Teklifi", value: 1500, cost: 0, stage: "teklif", reminderToday: true, reminder: "Siparişi takip et", customFields: { satis_kanali: "Online", urun_kategorisi: "Ayakkabı" } },
      { customerIndex: 0, title: "Telefon Siparişi Görüşmesi", value: 900, cost: 0, stage: "ilk_gorusme", customFields: { satis_kanali: "Telefon" } },
    ],
  },
  spor_merkezi: {
    customers: [
      { name: "Örnek Üye — Deniz Arslan", customerType: "bireysel", phone: "0532 000 00 91" },
      { name: "Örnek Üye — Ege Korkmaz", customerType: "bireysel", phone: "0532 000 00 92" },
    ],
    deals: [
      { customerIndex: 0, title: "Yıllık Üyelik", value: 18000, cost: 0, stage: "kazanildi", customFields: { uyelik_paketi: "Yıllık" } },
      { customerIndex: 1, title: "PT Paketi Teklifi", value: 9000, cost: 0, stage: "teklif", reminderToday: true, reminder: "Paketi takip et", customFields: { uyelik_paketi: "PT Paketi", antrenor: "Mert Hoca" } },
      { customerIndex: 0, title: "Deneme Dersi Görüşmesi", value: 250, cost: 0, stage: "ilk_gorusme", customFields: { uyelik_paketi: "Aylık" } },
    ],
  },
  egitim_kurs: {
    customers: [
      { name: "Örnek Öğrenci — Defne Yıldız", customerType: "bireysel", phone: "0532 000 01 01" },
      { name: "Örnek Öğrenci — Kerem Çelik", customerType: "bireysel", phone: "0532 000 01 02" },
    ],
    deals: [
      { customerIndex: 0, title: "İngilizce Kursu Kaydı", value: 7500, cost: 0, stage: "kazanildi", customFields: { kurs_programi: "Yabancı Dil", egitmen: "Ayşe Öğretmen" } },
      { customerIndex: 1, title: "Sürücü Kursu Teklifi", value: 12000, cost: 0, stage: "teklif", reminderToday: true, reminder: "Kaydı takip et", customFields: { kurs_programi: "Sürücü Kursu" } },
      { customerIndex: 0, title: "Deneme Dersi Görüşmesi", value: 500, cost: 0, stage: "ilk_gorusme", customFields: { kurs_programi: "Müzik/Sanat" } },
    ],
  },
};

// KOBİ'nin kendisi için "? Yardım" panelindeki statik içerik — bilinçli
// olarak küçük tutuluyor: yeni bir DB tablosu/yönetim ekranı YOK, sadece
// nadiren değişen temel "nasıl yapılır" konularını kapsıyor. Amaç, ürün
// hızla değişirken bakım yükü yaratacak kapsamlı bir dokümantasyon merkezi
// değil, düşük bakımlı bir başvuru kaynağı olmak.
const HELP_TOPICS = [
  // Müşteriler & Kayıtlar
  { category: "Müşteriler & Kayıtlar", q: "Yeni müşteri nasıl eklerim?", a: "Müşteriler sekmesine gidip \"+ Müşteri ekle\" butonuna tıklayın. Ad/firma adı zorunlu, geri kalan alanlar opsiyoneldir." },
  { category: "Müşteriler & Kayıtlar", q: "Teklif/randevu/üyelik nasıl oluşturulur?", a: "Sol menüdeki Teklifler/Randevular/Üyelikler/Rezervasyonlar sekmesinden (sektörünüze göre adı değişir) \"+ Ekle\" ile yeni bir kayıt açın; önce bir müşteri seçilmiş olmalı. Aşama değiştikçe kayıt otomatik ilerler." },
  { category: "Müşteriler & Kayıtlar", q: "Müşteri Kazanma Linki nedir?", a: "Ayarlar → Müşteri Kazanma Linki'nden aldığınız linki (veya QR kodunu) paylaşırsanız, müşteri kendi bilgilerini doldurup sisteminize düşer — elle veri girmenize gerek kalmaz." },
  { category: "Müşteriler & Kayıtlar", q: "Yanlışlıkla sildiğim bir kaydı nasıl geri getiririm?", a: "Ayarlar → Çöp Kutusu ve Geçmiş'ten silinen müşteri/teklif/tahsilat kayıtlarını geri yükleyebilirsiniz. Hiçbir şey otomatik olarak kalıcı silinmez." },
  { category: "Müşteriler & Kayıtlar", q: "Müşteri/teklif listemi Excel'e nasıl aktarırım?", a: "İlgili sekmenin üstündeki \"Dışa Aktar\" butonuyla .xlsx dosyası indirebilirsiniz. Aynı ekranlarda \"İçe Aktar\" ile de toplu veri yükleyebilirsiniz (CSV/Excel/vCard)." },
  { category: "Müşteriler & Kayıtlar", q: "Word tablosundaki veya WhatsApp kişilerimdeki müşterileri nasıl aktarırım?", a: "Word tablonuzu Excel'e kopyalayıp CSV olarak kaydedin, sonra İçe Aktar'dan yükleyin. WhatsApp'ın kendi kişi dışa aktarma özelliği yok — telefonunuzun Kişiler uygulamasından vCard (.vcf) alıp İçe Aktar'a yükleyebilirsiniz." },

  // Ödeme & Faturalama
  { category: "Ödeme & Faturalama", q: "Müşteriden online ödeme nasıl alınır?", a: "Ayarlar → Ödeme Bağlantısı'ndan iyzico veya PayTR hesabınızı bağlayın. Sonra bir kaydı düzenlerken \"Müşteri ödemesi\" alanından onay linkine ödeme ekleyebilirsiniz." },
  { category: "Ödeme & Faturalama", q: "Aldığım bir ödemeyi iade etmem gerekirse ne yapmalıyım?", a: "Finans sekmesinden ilgili tahsilatı bulup iade işlemini başlatın — gerçek iyzico/PayTR iade API'si çağrılır, tutar müşterinin kartına geri döner, sisteminizde de otomatik düşülür." },
  { category: "Ödeme & Faturalama", q: "Paraşüt'e fatura nasıl aktarırım?", a: "Teklifler/Randevular/Üyelikler/Rezervasyonlar sekmesinde \"Kazanıldı\" durumundaki kayıtlardan seçtiklerinizi \"Paraşüt'e Aktar\"dan indirin — Paraşüt'ün toplu fatura şablonuyla birebir uyumlu bir Excel dosyası iner, doğrudan içe aktarabilirsiniz." },
  { category: "Ödeme & Faturalama", q: "KDV oranını nasıl değiştiririm?", a: "Her teklifte ayrı ayrı seçebilirsiniz; varsayılan oranı Ayarlar → İşletme Bilgileri'nden belirleyebilirsiniz, yeni tekliflerde otomatik gelir." },

  // Finans
  { category: "Finans", q: "Gelir-Gider Defteri ne işe yarar?", a: "Finans sekmesindeki bu liste, tüm tahsilatlarınızı ve giderlerinizi (kazanılan tekliflerin maliyeti dahil) tek yerde, kategoriye göre gösterir — net kâr/zarar durumunuzu anlık görürsünüz." },
  { category: "Finans", q: "KDV Özet Raporu nasıl okunur?", a: "Seçtiğiniz ay için Satış KDV'si (tahsil ettiğiniz) ile Alış KDV'si (ödediğiniz giderler) karşılaştırılır, Ödenecek/Devreden KDV otomatik hesaplanır. Muhasebecinize göstermeden önce kendi kayıtlarınızla karşılaştırmanız önerilir." },
  { category: "Finans", q: "Her ay tekrar eden bir gideri (kira, abonelik) her seferinde elden mi gireceğim?", a: "Hayır — gider eklerken \"Tekrarlayan\" seçip günlük/aylık/yıllık aralığını belirtin, sistem her dönem için otomatik hesaplar, yeniden girmenize gerek kalmaz." },

  // Randevu & Program
  { category: "Randevu & Program", q: "Randevularım sekmesi ne işe yarar?", a: "Randevu alınabilen sektörlerde, Bugün/Bu Hafta/Bu Ay filtreleriyle tüm randevularınızı saatine göre sıralı tek listede gösterir — arama ve aşama filtresi de var.", visibleIf: (sector) => supportsSelfBooking(sector) },
  { category: "Randevu & Program", q: "Müşterilerimin portaldan randevu alabileceği saatleri nasıl belirlerim?", a: "Ayarlar → Müsaitlik Saatleri'nden hangi gün hangi saatler arası, kaçar dakikalık aralıklarla randevu verebileceğinizi tanımlarsınız — müşteri portalı sadece bu saatleri boş gösterir.", visibleIf: (sector) => bookingModel(sector) === "slot" },
  { category: "Randevu & Program", q: "Randevu hatırlatması otomatik mi gidiyor?", a: "Evet, randevu saatinden yaklaşık 2 saat önce müşteriye otomatik hatırlatma e-postası gider. Ayarlar → İşletme Bilgileri'nden bu özelliği kapatabilirsiniz.", visibleIf: (sector) => supportsSelfBooking(sector) },
  { category: "Randevu & Program", q: "Oda Stoku ne işe yarar?", a: "Ayarlar → Oda Stoku'ndan her oda tipinden kaç adet olduğunuzu belirlersiniz — müşteri portalı, seçilen giriş/çıkış tarihi aralığında o tipte zaten stok kadar rezervasyon varsa \"müsait değil\" gösterir. Henüz eklenmemiş bir oda tipinden rezervasyon alınamaz.", visibleIf: (sector) => bookingModel(sector) === "inventory" },
  { category: "Randevu & Program", q: "Aynı oda tipine aynı tarihler için birden fazla rezervasyon girebilir miyim?", a: "Evet — Oda Stoku'nda tanımladığınız adet kadar, aynı tarih aralığında çakışan rezervasyon kabul edilir; adet dolduğunda yeni bir kayıt eklemeye çalışırsanız net bir uyarıyla engellenir.", visibleIf: (sector) => bookingModel(sector) === "inventory" },
  { category: "Randevu & Program", q: "Bir randevuyu \"gelmedi\" mi \"iptal\" mi olarak işaretlemeliyim?", a: "Aşamayı \"kaybedildi\"ye çektiğinizde size sorulur — müşteri habersiz gelmediyse \"Randevuya gelmedi\", önceden haber verip iptal ettiyse \"İptal etti\" seçin. Bu ayrım Pano'daki \"Gelmeme oranı\" metriğini doğru hesaplamak için önemlidir.", visibleIf: (sector) => isAppointmentSector(sector) },
  { category: "Randevu & Program", q: "Grup dersi / haftalık program nasıl oluştururum?", a: "Spor Merkezi ve Eğitim/Kurs Merkezi sektörlerinde \"Dersler\" sekmesinden haftalık program, kapasite ve eğitmen bilgisiyle ders tanımlayabilirsiniz — müşteriler portaldan kendi kaydolup iptal edebilir.", visibleIf: (sector) => supportsGroupClasses(sector) },

  // Destek & Bilgi Bankası
  { category: "Destek & Bilgi Bankası", q: "Müşteri destek talebini nasıl açar?", a: "Müşteri kendi portalından (Müşteri Kazanma Linki veya davet ettiğiniz portal linkiyle giriş yaparak) yeni talep oluşturur; siz Destek sekmesinden yanıtlarsınız." },
  { category: "Destek & Bilgi Bankası", q: "SLA (yanıt süresi hedefi) nasıl hesaplanıyor?", a: "Her destek talebinin önceliğine (düşük/orta/yüksek/acil) göre otomatik bir hedef yanıt süresi belirlenir, süre yaklaşınca/aşılınca talep listesinde ve Pano'da uyarı çıkar." },
  { category: "Destek & Bilgi Bankası", q: "Destek talebine müşterinin görmemesi gereken bir not nasıl eklerim?", a: "Yanıt yazarken \"Dahili not\" kutucuğunu işaretleyin — bu not sadece siz ve takımınız tarafından görülür, müşteri portalında hiç görünmez." },
  { category: "Destek & Bilgi Bankası", q: "Bilgi Bankası'na nasıl makale eklerim?", a: "Destek → Bilgi Bankası'ndan \"+ Makale ekle\" ile kendi yazınızı ekleyebilir, ya da \"Örnek şablonlar\"dan (Kargo, Fatura, İade, Destek takibi vb.) hazır bir taslağı tek tıkla açıp düzenleyebilirsiniz." },

  // Takım
  { category: "Takım", q: "Takıma nasıl üye davet ederim?", a: "Ayarlar → Takım'dan e-posta ile davet gönderebilirsiniz. Davet edilen kişi hesabı kabul edince tüm müşteri/kayıt verilerinizi görüp düzenleyebilir." },
  { category: "Takım", q: "Takım üyesinin yetkilerini sınırlayabilir miyim?", a: "Şu an tek ayrım var: bir üyeye İşletme Bilgileri/Sektör gibi ayarları düzenleme izni verip vermeyeceğinizi Takım ekranından belirleyebilirsiniz. Müşteri/teklif verisi tüm üyelere paylaşılı görünür." },

  // Bildirimler & İletişim
  { category: "Bildirimler & İletişim", q: "Müşterilerim kendi bilgilerini/randevularını nasıl görebilir?", a: "Ayarlar → Müşteri Kazanma Linki'nden paylaşacağınız linkle müşteriniz kendi portalına kaydolup tekliflerini/randevularını görebilir, destek talebi açabilir." },
  { category: "Bildirimler & İletişim", q: "Anlık bildirim (push) nasıl açarım?", a: "Ayarlar → Görünüm, Bildirimler & Hesap'tan bildirimleri açabilirsiniz. iPhone'da bildirim alabilmek için önce siteyi Ana Ekrana eklemeniz gerekir (Safari paylaş menüsü → Ana Ekrana Ekle)." },
  { category: "Bildirimler & İletişim", q: "Müşterilerime toplu kampanya e-postası nasıl gönderirim?", a: "Müşteriler sekmesindeki \"Kampanya Gönder\" butonundan alıcıları seçip mesajınızı yazabilirsiniz. Türkiye'de ticari elektronik ileti göndermek için müşterilerinizden İYS/açık onay almış olmanız yasal olarak sizin sorumluluğunuzdadır — göndermeden önce onay kutusunu işaretlemeniz istenir." },

  // Ayarlar & Hesap
  { category: "Ayarlar & Hesap", q: "Sektörümü nasıl değiştiririm?", a: "Ayarlar → Sektör & Özel Alanlar'dan istediğiniz zaman değiştirebilirsiniz — aşama isimleri, önerilen etiketler ve özel alanlar otomatik güncellenir. Daha önce girilmiş değerler kaybolmaz, sadece görünürlükleri değişir." },
  { category: "Ayarlar & Hesap", q: "Açık/koyu temayı nasıl değiştiririm?", a: "Ayarlar → Görünüm, Bildirimler & Hesap'tan \"Açık\"/\"Koyu\" arasında seçim yapabilirsiniz." },
  { category: "Ayarlar & Hesap", q: "Şifremi nasıl değiştiririm?", a: "Ayarlar → Görünüm, Bildirimler & Hesap'tan, mevcut şifrenizi doğrulayarak yenisini belirleyebilirsiniz. Şifrenizi unuttuysanız giriş ekranındaki \"Şifremi unuttum\" linkini kullanın." },
  { category: "Ayarlar & Hesap", q: "Hesabımı tamamen silebilir miyim?", a: "Ayarlar → Görünüm, Bildirimler & Hesap'taki \"Hesabımı silmek istiyorum\" seçeneği destek ekibine e-posta gönderir — takım sahipliği gibi durumlar elle kontrol gerektirdiği için bu işlem otomatik yapılmıyor." },
  { category: "Ayarlar & Hesap", q: "Teklif onay linkini müşteriyle nasıl paylaşırım?", a: "İlgili kaydı açıp onay linkini kopyalayın, müşteriye WhatsApp/e-posta ile gönderin. Müşteri linke tıklayıp onaylayabilir, ayarladıysanız ödeme de yapabilir." },
  { category: "Ayarlar & Hesap", q: "Örnek verilerle nasıl başlarım?", a: "Pano boşken görünen \"Örnek verilerle başla\" butonuyla birkaç örnek müşteri ve kayıt oluşturabilirsiniz — istediğiniz zaman silinebilir, gerçek verilerinizi etkilemez." },

  { category: "Müşteriler & Kayıtlar", q: "Müşteri kartına görüşme/telefon notu nasıl eklerim?", a: "Müşteri kartını açıp \"İletişim geçmişi\" bölümünden Not/Telefon görüşmesi/Toplantı/E-posta türünü seçip kısa bir açıklama yazabilirsiniz — bu kayıtlar zaman sırasına göre listelenir." },
  { category: "Müşteriler & Kayıtlar", q: "Müşteri veya teklif kaydına dosya (sözleşme, fotoğraf vb.) nasıl eklerim?", a: "Müşteri kartını veya teklif formunu açıp \"Dosyalar\" bölümündeki \"+ Dosya Ekle\"ye tıklayın — dosya en fazla 10 MB olabilir, istediğiniz zaman indirebilir veya silebilirsiniz (silinen dosya da çöp kutusuna düşer)." },
  { category: "Müşteriler & Kayıtlar", q: "Bir teklife birden fazla ürün/hizmet kalemi (kalem kalem fiyat) nasıl eklerim?", a: "Teklif formundaki \"Kalemler\" bölümünden \"+ Kalem ekle\" ile istediğiniz kadar açıklama/adet/birim fiyat satırı ekleyebilirsiniz — Tutar alanı bunların toplamına göre otomatik hesaplanır, hiç kalem eklemezseniz Tutar'ı yine elle girebilirsiniz." },
  { category: "Müşteriler & Kayıtlar", q: "Teklif kalemlerini Fiyat Listesi'nden nasıl hızlıca eklerim?", a: "Kalemler bölümündeki \"Fiyat listesinden kalem ekle…\" menüsünden bir ürün/hizmet seçtiğinizde açıklama ve birim fiyat otomatik dolan yeni bir satır eklenir; Ayarlar → Ürün & Hizmet Fiyat Listesi'nde kayıtlı olmanız yeterli." },
  { category: "Müşteriler & Kayıtlar", q: "Teklif formundaki \"Sorumlu\" ataması ne işe yarar?", a: "Bir takım üyesi seçebilirsiniz — kapanan (kazanılan veya kaybedilen) kayıtlar Pano'daki \"Personel Performansı\" bölümünde o kişinin altında ve kazanma oranına dahil olarak sayılır; atama yapılmazsa \"Atanmamış\" grubuna düşer." },
  { category: "Müşteriler & Kayıtlar", q: "Müşteri listemi nasıl filtreleyip ararım?", a: "Müşteriler sekmesindeki arama kutusu ad/sektör/bölge/adres/telefon/e-postada arar; ayrıca Kurumsal/Bireysel, sektör, en yeni/en eski sıralama ve tarih aralığı filtrelerini de kullanabilirsiniz." },
  { category: "Müşteriler & Kayıtlar", q: "Not veya hatırlatmaları sesle nasıl yazabilirim?", a: "Not/hatırlatma gibi metin alanlarının yanındaki mikrofon simgesine tıklayıp konuşarak yazdırabilirsiniz — bu özellik Chrome/Edge'de çalışır, Firefox/Safari'de görünmez." },
  { category: "Müşteriler & Kayıtlar", q: "Müşteriyi \"Kurumsal\" veya \"Bireysel\" olarak işaretlemek neyi değiştirir?", a: "Formda hangi alanların (örn. firma unvanı) göründüğünü ve teklif/randevu aşamalarının hangi dille gösterileceğini belirler; bazı özel alanlar da \"Kime\" ayarına göre sadece kurumsal veya sadece bireysel müşterilerde görünür." },
  { category: "Müşteriler & Kayıtlar", q: "Cari Hesap Ekstresi müşteri kartında ne gösterir?", a: "Kazanılmış tekliflerden doğan toplam borcu, toplam tahsilatı ve güncel bakiyeyi; altında da her borç/tahsilat hareketini tarih sırasıyla ve o andaki bakiyeyle listeler." },
  { category: "Müşteriler & Kayıtlar", q: "Teklif formundaki \"Gider\" alanı ne işe yarar?", a: "O teklifin size maliyetini (örn. malzeme, alt yüklenici) girmenizi sağlar — kayıt kazanıldığında bu tutar Finans → Gelir-Gider Defteri'nde otomatik gider olarak sayılır, ayrıca Finans sekmesinden de düzenlenebilir." },
  { category: "Müşteriler & Kayıtlar", q: "Kazanılmış bir teklifin tutarını veya KDV oranını sonradan değiştirirsem ne olur?", a: "Değişiklik geriye dönük işler — o teklifin kazanıldığı ayın KDV Özet Raporu'nu da (o ay için zaten beyanname vermiş olsanız bile) yeniden hesaplar; formda bu durumda bir uyarı gösterilir." },
  { category: "Müşteriler & Kayıtlar", q: "Müşteri kartındaki WhatsApp simgesi ne yapar?", a: "Müşterinin kayıtlı telefon numarasıyla doğrudan WhatsApp Web/uygulamasında yeni bir sohbet penceresi açar, numarayı elle aramanıza gerek kalmaz." },

  { category: "Ödeme & Faturalama", q: "iyzico/PayTR bağlarken hangi bilgileri girmem gerekiyor?", a: "iyzico için API Key ve Secret Key; PayTR için Mağaza No (Merchant ID), Merchant Key ve Merchant Salt gerekir — bu bilgileri sağlayıcının kendi panelinden alıp Ayarlar → Ödeme Bağlantısı'na girersiniz." },
  { category: "Ödeme & Faturalama", q: "Aynı anda hem iyzico hem PayTR'yi aktif edebilir miyim?", a: "Hayır, aynı anda yalnızca bir sağlayıcı aktif olabilir — yeni birini bağlarsanız öncekinin yerini alır." },
  { category: "Ödeme & Faturalama", q: "Ödeme bağlantımı canlıya almadan önce nasıl test ederim?", a: "Ödeme Bağlantısı formundaki \"Test modu (Sandbox)\" kutusunu işaretleyip sağlayıcınızın test API bilgileriyle bağlayın; hazır olduğunuzda aynı formdan gerçek anahtarlarla güncelleyip kutuyu kaldırabilirsiniz." },
  { category: "Ödeme & Faturalama", q: "Taksitli ödeme nasıl açarım?", a: "Ödeme Bağlantısı formundaki \"Taksit\" alanından azami taksit sayısını (2, 3, 6, 9 veya 12) seçin — bu sadece bir üst sınırdır, taksitin gerçekten sunulması sağlayıcı hesabınızda taksitli satışın açık olmasına ve müşterinin kartına bağlıdır." },
  { category: "Ödeme & Faturalama", q: "PayTR bağlarken ekstra bir ayar yapmam gerekiyor mu?", a: "Evet — PayTR panelinizde \"Bildirim URL'i\" olarak Binerly'nin size gösterdiği adresi bir kez girmeniz gerekir, aksi halde ödemeler onaylanmaz." },
  { category: "Ödeme & Faturalama", q: "Onay linkindeki \"Sadece onaylasın\", \"Onaylasın + isterse ödesin\" ve \"Onaylamak için ödemesi şart\" seçenekleri ne fark eder?", a: "Bu üç seçenek müşterinin onay ve ödeme adımlarını nasıl yaşayacağını belirler: birincisinde ödeme adımı hiç yok, ikincisinde ikisi bağımsız sunulur, üçüncüsünde ödeme tamamlanmadan onay da gerçekleşmez." },
  { category: "Ödeme & Faturalama", q: "Müşterinin kart bilgileri Binerly sunucularından geçiyor mu?", a: "Hayır — kart bilgisi hiçbir zaman Binerly sunucularından geçmez, müşteri doğrudan iyzico/PayTR'nin kendi güvenli ödeme sayfasına yönlendirilir." },
  { category: "Ödeme & Faturalama", q: "Online alınan bir ödemeyi iade edersem sistemimde ne değişir?", a: "Finans → Gelir-Gider Defteri'nde ilgili tahsilatın yanındaki \"İade Et\"e tıkladığınızda gerçek iyzico/PayTR iade API'si çağrılır, tutar müşterinin bakiyesinden otomatik düşülür ve deftere iade olarak işlenir." },
  { category: "Ödeme & Faturalama", q: "Paraşüt'e aktarırken tüm kazanılan teklifleri mi seçmem gerekiyor?", a: "Hayır — \"Paraşüt'e Aktar\" ekranında müşteri/başlık arama, min/max tutar, ödeme durumu ve tarih aralığı filtreleriyle sadece istediğiniz teklifleri seçip aktarabilirsiniz." },
  { category: "Ödeme & Faturalama", q: "Varsayılan KDV oranını değiştirdim, daha önce oluşturduğum tekliflerin oranı da değişir mi?", a: "Hayır — Ayarlar → İşletme Bilgileri'ndeki varsayılan KDV oranı sadece o andan sonra oluşturacağınız yeni tekliflere uygulanır, mevcut tekliflerin kendi kaydettiği oran aynen kalır." },
  { category: "Ödeme & Faturalama", q: "Onay linkinden ödeme tercihini her teklifte ayrı mı seçmem gerekiyor?", a: "Onay linkini her kopyaladığınızda son seçtiğiniz ödeme tercihi otomatik ön işaretli gelir, isterseniz o teklife özel değiştirebilirsiniz." },

  { category: "Finans", q: "KDV Özet Raporu resmi beyanname yerine geçer mi?", a: "Hayır — bu rapor sadece kendi ön hazırlığınız içindir, muhasebecinizin/SMMM'nizin resmi beyanname veya e-defterinin yerini tutmaz; göndermeden önce kendi kayıtlarınızla karşılaştırmanız önerilir." },
  { category: "Finans", q: "Giderime KDV oranı girmezsem ne olur?", a: "O gider, KDV Özet Raporu'ndaki \"Alış KDV'si\" hesabına dahil edilmez — rapor ekranında kaç giderin bu şekilde dışarıda kaldığı ayrıca gösterilir." },
  { category: "Finans", q: "Tekrarlayan bir gideri silersem geçmiş aylardaki kayıtlar da silinir mi?", a: "Evet — tekrarlayan gider tek bir kayıttır, gördüğünüz her tekrar aynı kaydın otomatik kopyasıdır; birini sildiğinizde geçmiş ve gelecekteki TÜM tekrarlar birlikte çöp kutusuna taşınır." },
  { category: "Finans", q: "Toplam Gider ile \"Kategoriye göre gider\" listesi neden birbirini tutmuyor?", a: "\"Kategoriye göre gider\" sadece elle eklediğiniz işletme giderlerini toplar; Toplam Gider'e ayrıca kazanılan tekliflerin \"Gider\" tutarları da eklendiği için iki rakam farklı çıkabilir." },
  { category: "Finans", q: "Gelir-Gider Defteri'nde bir tahsilatı düzenleyebilir miyim?", a: "Elle girilmiş (online olmayan) tahsilatların tutarını, tarihini ve notunu düzenleyebilir veya silebilirsiniz; online (iyzico/PayTR) tahsilatlarda düzenleme yerine \"İade Et\" seçeneği çıkar." },
  { category: "Finans", q: "Finans sekmesindeki \"Tahsilat / Cari Hesap\" görünümü ne işe yarar?", a: "Kazanılmış teklifi olan her müşterinin toplam borcunu, tahsil edilenini ve kalan bakiyesini listeler; bir müşteriyi genişletip üzerindeki tekliften doğrudan yeni tahsilat ekleyebilirsiniz." },
  { category: "Finans", q: "Yeni bir tahsilatı hangi teklife/müşteriye ekleyeceğimi nasıl seçerim?", a: "Finans → Tahsilat / Cari Hesap'taki \"Yeni Tahsilat\" kutusundan önce müşteriyi, sonra o müşterinin kazanılmış tekliflerinden birini seçip \"Devam\"a basarsınız — tahsilat formu o teklif için açılır." },
  { category: "Finans", q: "Gider eklerken saat de girebilir miyim?", a: "Evet, tarih zorunlu olmakla birlikte saat alanı opsiyoneldir — saat girerseniz gider listesinde tarih yanında saat de gösterilir." },
  { category: "Finans", q: "KDV Özet Raporu'nda görüntülediğim ayı nasıl değiştiririm?", a: "Rapor ekranının üstündeki ay seçiciden istediğiniz ay/yıl kombinasyonunu seçebilirsiniz, rapor her zaman o anki güncel verilerle yeniden hesaplanır." },
  { category: "Finans", q: "Gider kategorisi listede yoksa ne yapmalıyım?", a: "Kategori olarak \"Diğer\"i seçip açılan kutuya kendi kategori adınızı yazabilirsiniz, bu isim o gider için kaydedilir ve kategori listelerinde görünür." },
  { category: "Finans", q: "Bir teklifin \"Gider\"ini doğrudan Finans sekmesinden düzenleyebilir miyim?", a: "Evet — Gelir-Gider Defteri'nde o kaydın yanındaki kalem işaretine tıklayıp tutarı doğrudan güncelleyebilirsiniz; bu, teklif formundaki Gider alanıyla aynı değeri paylaşır." },

  { category: "Randevu & Program", q: "Ajanda sekmesi ne işe yarar?", a: "Tüm sektörlerde hatırlatmalarınızı, randevu alanı olan kayıtlarınızı ve grup derslerinizi tek bir ay/hafta takviminde birleştirir — bir güne tıklayınca o günün tüm etkinlikleri altta listelenir." },
  { category: "Randevu & Program", q: "Ajanda'da bir güne tıklayınca ne görürüm?", a: "O tarihteki hatırlatmaları, randevuları ve (varsa) grup derslerini saatine göre sıralı bir liste hâlinde görürsünüz; bir hatırlatma/randevuya tıklarsanız ilgili kayıt açılır, bir derse tıklarsanız o günün yoklama listesi açılır." },
  { category: "Randevu & Program", q: "Yoklama (Geldi/Gelmedi) nasıl alınır?", a: "Ajanda'da geçmiş veya bugüne ait bir ders gününe tıklayıp açılan listede her öğrenci/üye için Geldi ya da Gelmedi işaretlersiniz; henüz gerçekleşmemiş bir ders günü için yoklama alınamaz.", visibleIf: (sector) => supportsGroupClasses(sector) },
  { category: "Randevu & Program", q: "Müşteri randevusunu kendisi iptal ederse bu \"Gelmedi\" olarak mı sayılır?", a: "Hayır — müşterinin kendi portalından yaptığı iptal her zaman \"İptal etti\" olarak işaretlenir, \"Randevuya gelmedi\" sadece siz elle işaretlediğinizde (habersiz gelmeme durumunda) kullanılır.", visibleIf: (sector) => isAppointmentSector(sector) },
  { category: "Randevu & Program", q: "Müşteri randevusunu/ders kaydını portaldan iptal ederken bir süre sınırı var mı?", a: "Evet, randevu/ders saatine en az 2 saat kala portaldan iptal edilebilir; 2 saatten az kaldıysa \"İptal edilemez\" yazısı çıkar ve iptal butonu devre dışı kalır.", visibleIf: (sector) => supportsSelfBooking(sector) || supportsGroupClasses(sector) },
  { category: "Randevu & Program", q: "Müşteri portaldan randevu alırken hizmet/fiyat seçebilir mi?", a: "Evet, Ayarlar → Ürün & Hizmet Fiyat Listesi'nde kayıtlı kalemleriniz varsa müşteri randevu formunda listeden seçebilir, açıklama ve tutar otomatik dolar; isterse yine elle de yazabilir.", visibleIf: (sector) => supportsSelfBooking(sector) },
  { category: "Randevu & Program", q: "Bir grup dersine kaç kişi kaydolabilir, bunu nasıl sınırlarım?", a: "Ders oluştururken girdiğiniz \"Kapasite\" değeri sınırı belirler; kapasite dolunca portalda ders \"dolu\" görünür ve yeni kayıt alınamaz. Kapasiteyi zaten kayıtlı kişi sayısının altına düşüremezsiniz.", visibleIf: (sector) => supportsGroupClasses(sector) },
  { category: "Randevu & Program", q: "Müşterinin bir derse kaydolabilmesi için aktif üyeliği/kaydı olması gerekir mi?", a: "Evet — sadece kazanılmış ve süresi (varsa) dolmamış bir kaydı olan müşteriler derse kaydolabilir; uygun olmayan müşteriler için portalda kısa bir uyarı metni gösterilir.", visibleIf: (sector) => supportsGroupClasses(sector) },
  { category: "Randevu & Program", q: "Randevu/görüşme tarihi alanı nereden geliyor, ben mi ekliyorum?", a: "Bu, Sektör & Özel Alanlar'da \"Tarih & Saat\" tipinde tanımlanan bir özel alandır — randevu sektörlerinde hazır gelir, diğer sektörlerde isterseniz kendiniz ekleyebilirsiniz.", visibleIf: (sector) => supportsSelfBooking(sector) },
  { category: "Randevu & Program", q: "Aynı saate iki randevu/görüşme girebilir miyim?", a: "Hayır — Tarih & Saat özel alanınız varsa ve aynı tarih/saatte başka bir aktif kayıt bulunursa, sistem kaydı engeller ve önce bu çakışmayı çözmeniz gerekir.", visibleIf: (sector) => supportsSelfBooking(sector) },
  { category: "Randevu & Program", q: "Haftalık ders programını nasıl kurarım?", a: "Dersler sekmesinden her ders için gün, saat, süre, eğitmen ve kapasite girip kaydedersiniz — program haftadan haftaya aynı şekilde tekrarlar, tarihe özel tek seferlik ders oluşturma yoktur.", visibleIf: (sector) => supportsGroupClasses(sector) },
  { category: "Randevu & Program", q: "Müsaitlik Saatleri'nde öğle arası gibi bir boşluk tanımlayabilir miyim?", a: "Evet — her gün için başlangıç/bitiş saati ile kaçar dakikalık aralıklarla randevu verileceğini belirlersiniz; \"Öğle arası var\" kutusunu işaretleyip ara saatlerini girerseniz sistem günü otomatik olarak iki ayrı müsaitlik bloğuna böler.", visibleIf: (sector) => bookingModel(sector) === "slot" },
  { category: "Randevu & Program", q: "Randevu hatırlatma e-postasının içeriğini değiştirebilir miyim?", a: "Hayır, hatırlatma sabit bir şablonla otomatik gönderilir, içeriği uygulama içinden özelleştirilemez — sadece Ayarlar → İşletme Bilgileri'nden tamamen açıp kapatabilirsiniz.", visibleIf: (sector) => supportsSelfBooking(sector) },

  { category: "Destek & Bilgi Bankası", q: "SLA süresi dolmak üzereyken bunu nasıl anlarım?", a: "Talep listesinde ve talep detayında SLA rozeti \"Süre yaklaşıyor\" olur — bu, kalan sürenin hedefin son %20'lik dilimine girdiği andır (örn. Acil'de son 48 dakika, Yüksek'te son ~5 saat)." },
  { category: "Destek & Bilgi Bankası", q: "Bir talebi \"Çözüldü\" mü \"Kapatıldı\" mı yapmalıyım?", a: "Fark tamamen size kalmış — \"Çözüldü\" sorunun giderildiğini, \"Kapatıldı\" konunun artık takip edilmeyeceğini belirtmek için kullanılabilir; ikisi de SLA süresini durdurur ve e-posta bildirimleri açıksa müşteriye otomatik bilgilendirme gönderir." },
  { category: "Destek & Bilgi Bankası", q: "Destek talebine yazdığım \"Giden (müşteriye)\" mesaj müşteriye e-posta olarak gider mi?", a: "Hayır — bu sadece mesajı kaydeder, müşteri kendi hesabıyla Müşteri Portalı'na girdiğinde görür. Müşteriye gerçekten e-posta göndermek isterseniz, talep durumu değiştiğinde veya yanıt yazdığınızda zaten otomatik bir bilgilendirme e-postası gider." },
  { category: "Destek & Bilgi Bankası", q: "Bilgi Bankası makalelerini müşterilerim görebilir mi?", a: "Hayır, Bilgi Bankası tamamen iç kaynak niteliğindedir — sadece siz ve ekibiniz görür, müşteri portalında hiç görünmez." },
  { category: "Destek & Bilgi Bankası", q: "Destek taleplerimi/Bilgi Bankası makalelerimi Excel'e aktarabilir miyim?", a: "Evet, her iki listenin üstündeki \"Dışa aktar\" butonuyla .xlsx dosyası indirebilir, \"İçe aktar\" ile de toplu talep/makale yükleyebilirsiniz." },
  { category: "Destek & Bilgi Bankası", q: "Örnek Bilgi Bankası şablonları sektörüme göre mi geliyor?", a: "Evet — Destek → Bilgi Bankası'ndaki \"Örnek şablonlar\" listesi, Ayarlar'da seçtiğiniz sektöre göre (örn. Emlak'ta tapu/depozito, Spor Merkezi'nde üyelik dondurma) farklı hazır taslaklar gösterir." },
  { category: "Destek & Bilgi Bankası", q: "Destek talebi mesaj geçmişindeki okunmamış mesaj rozeti nasıl temizlenir?", a: "Müşteriden gelen bir mesaja yanıt yazdığınızda o talebin okunmamış rozeti otomatik temizlenir; talebi sadece açıp bakmak rozeti kaldırmaz, yanıt vermeniz gerekir." },
  { category: "Destek & Bilgi Bankası", q: "Öncelik (Acil/Yüksek/Orta/Düşük) hedef çözüm süresini nasıl belirliyor?", a: "Her öncelik seviyesinin sabit bir hedef süresi vardır: Acil 4 saat, Yüksek 24 saat, Orta 48 saat, Düşük 72 saat — süre talebin oluşturulduğu andan itibaren işler." },
  { category: "Destek & Bilgi Bankası", q: "Talep listesini SLA durumuna göre filtreleyebilir miyim?", a: "Evet, talep listesindeki SLA filtresinden \"Gecikti\", \"Yaklaşıyor\" veya \"Zamanında\" durumundaki talepleri ayrı ayrı görebilirsiniz; ayrıca durum, öncelik, arama ve tarih aralığı filtreleri de var." },
  { category: "Destek & Bilgi Bankası", q: "Bir destek talebini silersem mesaj geçmişi de silinir mi?", a: "Talep çöp kutusuna taşınır ama mesaj geçmişi korunur — geri yüklediğinizde tüm mesajlar aynen yerinde durur." },
  { category: "Destek & Bilgi Bankası", q: "Müşteri yeni bir destek talebi açtığında bunu nereden fark ederim?", a: "Pano'daki \"Bugün ne yapmalıyım\" listesinde SLA durumuna göre öne çıkar, ayrıca sol menüdeki Destek sekmesi üzerinde okunmamış mesaj sayısı rozet olarak görünür." },

  { category: "Takım", q: "Takıma davet ettiğim bir kişiyi henüz kabul etmeden iptal edebilir miyim?", a: "Evet, Ayarlar → Takım'daki \"Bekleyen davetler\" listesinden ilgili davetin yanındaki \"İptal et\"e tıklayabilirsiniz — kişi daha sonra aynı e-postayla tekrar davet edilebilir." },
  { category: "Takım", q: "Bir takım üyesini nasıl çıkarırım?", a: "Ayarlar → Takım'da ilgili üyenin yanındaki \"Kaldır\"a tıklarsınız — üye, müşteri/teklif/destek verilerinize erişimini anında kaybeder, tekrar erişmesi için yeniden davet edilmesi gerekir." },
  { category: "Takım", q: "Bir takıma üye olarak eklendiğimde ne görürüm?", a: "Davet eden işletmenin tüm müşteri, teklif ve destek verisini görüp düzenleyebilirsiniz; isterseniz Ayarlar → Takım'dan o takımdan ayrılabilirsiniz." },
  { category: "Takım", q: "Takım sahibi değilsem Ayarlar'da neler görürüm?", a: "İşletme Bilgileri, Sektör & Özel Alanlar gibi ayarlar sadece \"İşletme/sektör ayarlarını düzenleyebilir\" izni size verilmişse görünür; Takım ekranında ise sadece hangi işletmenin üyesi olduğunuzu ve \"Takımdan ayrıl\" seçeneğini görürsünüz." },
  { category: "Takım", q: "Bir takım üyesine sadece belirli sekmeleri mi açabilirim?", a: "Hayır, sekme bazlı bir kısıtlama yok — tek ayrım İşletme Bilgileri/Sektör gibi ayarları düzenleme izni; verilen izin dışında tüm müşteri/teklif/destek verisi her üyeye aynı şekilde açıktır." },
  { category: "Takım", q: "Davet e-postası karşı tarafa otomatik mi gönderiliyor?", a: "Davet kaydını oluşturduğunuzda sistem otomatik bir bilgilendirme e-postası göndermeyi dener; e-posta gönderimi başarısız olsa bile davet geçerli kalır, kişi giriş yaptığında bekleyen daveti Binerly içinde görür." },
  { category: "Takım", q: "Takım üyesi sayısında bir sınır var mı?", a: "Şu an için pratik bir üst sınır yok; bekleyen davetleriniz de Takım ekranında listelenir, dilerseniz kabul edilmeden önce iptal edebilirsiniz." },

  { category: "Bildirimler & İletişim", q: "Bildirim çanı (üstteki zil simgesi) nasıl çalışır?", a: "Okunmamış bildirim sayısını rozet olarak gösterir; zile tıklayınca açılan panelde bildirimlerde arama yapabilir, sadece okunmamışları filtreleyebilir ve bir bildirime tıkladığınızda hem okundu işaretlenir hem de ilgili kayda yönlendirilirsiniz." },

  { category: "Ayarlar & Hesap", q: "Sistemin nasıl çalıştığını gösteren kısa turu tekrar izleyebilir miyim?", a: "Evet, Ayarlar → \"Turu Tekrar Başlat\"a tıklayarak ilk girişte gördüğünüz kısa tanıtım turunu istediğiniz zaman baştan izleyebilirsiniz." },
  { category: "Ayarlar & Hesap", q: "Pano'daki \"Kuruluma başlayın\" kutusunu nasıl kapatırım?", a: "Kutunun sağ üstündeki \"Gizle\"ye tıklarsınız — bu tercih saklanır, adımları tamamlamasanız bile bir daha görünmez." },
  { category: "Ayarlar & Hesap", q: "Bir özel alanı silersem, o alana daha önce girilmiş veriler ne olur?", a: "Hiçbir veri silinmez — alan sadece formlardan kaldırılır (gizlenir), müşteri/teklif kayıtlarındaki mevcut değerler veritabanında saklı kalmaya devam eder." },
  { category: "Ayarlar & Hesap", q: "Özel alan eklerken sistemin kendi kullandığı bir isim girersem ne olur?", a: "Sistemin iç kullandığı birkaç anahtar (örn. \"Kaynak\") özel alan adı olarak kullanılamaz — böyle bir isim girip kaydetmeye çalıştığınızda alan sessizce eklenmez; farklı bir isim kullanmanız yeterli." },
  { category: "Ayarlar & Hesap", q: "Aynı isimde iki özel alan tanımlayabilir miyim?", a: "Hayır, aynı \"Nerede\" (Müşteriler/Teklifler-Randevular-Üyelikler-Rezervasyonlar) için aynı isimden ikinci bir alan eklenemez — farklı bir isim seçmeniz veya mevcut alanı düzenlemeniz gerekir." },
  { category: "Ayarlar & Hesap", q: "Oturumum neden belirli bir süre sonra kendiliğinden kapanıyor?", a: "Güvenlik için oturumlar, hiç hareketsiz kalmasanız bile girişten itibaren en fazla 24 saat sonra otomatik sonlanır; süre dolduğunda tekrar giriş yapmanız istenir." },
  { category: "Ayarlar & Hesap", q: "Uygulamayı telefonuma nasıl kurarım (PWA)?", a: "Tarayıcınızın paylaş/menü seçeneğinden \"Ana Ekrana Ekle\"yi seçerek Binerly'i normal bir uygulama gibi ana ekranınıza ekleyebilirsiniz — özellikle iPhone'da anlık bildirim alabilmek için bu adım gereklidir." },
  { category: "Ayarlar & Hesap", q: "Google hesabımla giriş yapabilir miyim?", a: "Evet, giriş ekranındaki Google seçeneğiyle e-posta/şifre girmeden tek tıkla giriş yapabilir veya kayıt olabilirsiniz — bu hem ana uygulamada hem Müşteri Portalı'nda mevcuttur." },
  { category: "Ayarlar & Hesap", q: "Şirket logomu teklif PDF'lerinde nasıl gösteririm?", a: "Ayarlar → İşletme Bilgileri'nden logonuzu yükleyin — Teklif Şablonları'ndaki hazır tasarımlar ve oluşturacağınız özel şablonlar logo alanında otomatik olarak bu görseli kullanır." },
  { category: "Ayarlar & Hesap", q: "Vergi numaramı nereye giriyorum, teklif PDF'inde otomatik çıkar mı?", a: "Ayarlar → İşletme Bilgileri'ne girdiğiniz vergi numarası, teklif PDF şablonlarındaki \"Vergi no\" satırında otomatik olarak görünür." },
  { category: "Ayarlar & Hesap", q: "Ayarlar menüsünden hangi ekranlara ulaşabilirim?", a: "İşletme Bilgileri, Sektör & Özel Alanlar, Ürün & Hizmet Fiyat Listesi, Teklif Şablonları, Ödeme Bağlantısı, (randevu alınabilen sektörlerde) Müsaitlik Saatleri, Görünüm/Bildirimler/Hesap, Takım, Çöp Kutusu ve Geçmiş, Müşteri Kazanma Linki, Müşteri Portalı Linki ve Turu Tekrar Başlat — hepsi tek bir Ayarlar penceresinden açılır." },

  { category: "İçe/Dışa Aktarma", q: "İçe aktarırken dosyamdaki sütunları Binerly alanlarıyla nasıl eşleştiririm?", a: "Dosyanızı yükledikten sonra açılan eşleştirme ekranında her Binerly alanı için dosyanızdaki hangi sütunun kullanılacağını seçersiniz — sistem sütun başlıklarına bakarak bu eşleşmeyi olabildiğince otomatik önerir, siz kontrol edip düzeltirsiniz." },
  { category: "İçe/Dışa Aktarma", q: "İçe aktarmadan önce hangi satırların hatalı olduğunu görebilir miyim?", a: "Evet, önizleme ekranında her satır tek tek gösterilir; hatalı (örn. eşleşen müşteri bulunamayan) satırlar işaretlenip seçilemez hâle gelir, olası yinelenen kayıtlar ise ayrı bir uyarıyla belirtilir." },
  { category: "İçe/Dışa Aktarma", q: "İçe aktarırken bazı satırları hariç tutabilir miyim?", a: "Evet, önizleme ekranındaki kutucuğu işaretleyerek her satırı ayrı ayrı içe aktarıma dahil edebilir veya çıkarabilirsiniz; hatalı satırların kutucuğu zaten devre dışı gelir." },
  { category: "İçe/Dışa Aktarma", q: "Destek taleplerini veya Bilgi Bankası makalelerini de toplu içe aktarabilir miyim?", a: "Evet, Destek sekmesindeki Talepler ve Bilgi Bankası listelerinin her ikisinde de ayrı \"İçe aktar\" seçeneği vardır, aynı CSV/Excel akışını kullanır." },
  { category: "İçe/Dışa Aktarma", q: "Ürün & Hizmet Fiyat Listemi toplu olarak yükleyebilir/indirebilir miyim?", a: "Evet, Ayarlar → Ürün & Hizmet Fiyat Listesi'nde de ayrı \"İçe aktar\"/\"Dışa aktar\" butonları var — ürün/hizmet adı ve fiyat sütunlarıyla aynı CSV/Excel akışını kullanır." },
  { category: "İçe/Dışa Aktarma", q: "Teklif/talep içe aktarırken müşteri sütununda tam adı mı yazmalıyım?", a: "Evet, müşteri sütunundaki isim sistemdeki müşteri adıyla (büyük/küçük harf hariç) birebir eşleşmelidir; eşleşme bulunamazsa veya birden fazla müşteri aynı isme sahipse o satır hatalı sayılır." },
  { category: "İçe/Dışa Aktarma", q: "CSV dosyamda noktalı virgül mü virgül mü kullanmalıyım?", a: "İkisi de desteklenir — dosyanızın ilk satırına bakılarak hangi ayırıcının kullanıldığı otomatik tespit edilir, ayrıca bir ayar yapmanıza gerek yoktur." },
  { category: "İçe/Dışa Aktarma", q: "vCard (.vcf) içe aktarırken hangi bilgiler okunur?", a: "Kişinin adı, telefonu ve e-postası (varsa) okunur — adı olmayan kartlar listeye hiç dahil edilmez, diğer vCard alanları (adres, doğum günü vb.) içe aktarılmaz." },

  { category: "Teklif Şablonları", q: "Kendi teklif PDF şablonumu nasıl tasarlarım?", a: "Ayarlar → Teklif Şablonları'ndaki galeriden \"+ Yeni Şablon (boş)\" ile boş bir sayfa açar ya da mevcut bir şablonu \"Düzenle\"yle kopyalayıp üzerinde değişiklik yaparsınız; editörde metin, logo, dikdörtgen, çizgi ve tablo blokları ekleyip konumlandırabilirsiniz." },
  { category: "Teklif Şablonları", q: "Şablon editöründe bir bloğu nasıl hassas taşırım?", a: "Bloğu seçtikten sonra ok tuşlarıyla 1 piksel, Shift'e basılı tutarak 10 piksel adımlarla kaydırabilirsiniz — fareyle sürüklemek yerine ince ayar yapmak için kullanışlıdır." },
  { category: "Teklif Şablonları", q: "Şablonuma hangi bilgileri otomatik doldurtabilirim?", a: "Firma adı/adres/telefon/e-posta/vergi no, müşteri adı/telefon/e-posta, belge başlığı, tarih, ara toplam/KDV/genel toplam, geçerlilik metni ve ek not gibi hazır alanları metin bloklarına ekleyip otomatik doldurulmasını sağlayabilirsiniz." },
  { category: "Teklif Şablonları", q: "Bir teklif şablonunu silersem ne olur?", a: "Şablon kalıcı olarak silinir (geri alınamaz); o an seçili şablonsa otomatik olarak \"Klasik\" hazır şablona geri dönülür, daha önce o şablonla oluşturulmuş PDF'ler etkilenmez." },
  { category: "Teklif Şablonları", q: "Teklif PDF'inde kalem sayısı arttıkça tasarım bozulur mu?", a: "Hayır — kalem sayısı arttıkça tablo bloğunun altındaki bloklar (geçerlilik metni, ek not vb.) otomatik olarak aşağı kayar, tasarımınız bozulmadan birden fazla kalemli teklifler de düzgün görünür." },
  { category: "Teklif Şablonları", q: "Hazır \"Klasik\" ve \"Modern\" şablonlarını değiştirebilir miyim?", a: "Hazır şablonları doğrudan düzenleyemezsiniz ama \"Düzenle\"ye bastığınızda adının sonuna \"(Kopya)\" eklenmiş bir kopyası açılır, üzerinde değişiklik yapıp kendi şablonunuz olarak kaydedebilirsiniz." },
  { category: "Teklif Şablonları", q: "Teklif PDF'inde hangi şablonun kullanılacağını nasıl seçerim?", a: "Ayarlar → Teklif Şablonları galerisinde istediğiniz şablonun yanındaki \"Seç\"e tıklarsınız — o andan sonra oluşturduğunuz tüm teklif PDF'leri bu şablonla üretilir." },
  { category: "Teklif Şablonları", q: "Şablon editöründe bir metin bloğunun rengini/hizasını değiştirebilir miyim?", a: "Evet, seçili metin bloğu için yazı boyutu, kalınlık, renk, hizalama (sol/orta/sağ) ve büyük/küçük harf dönüşümü gibi özellikleri ayrı ayrı ayarlayabilirsiniz." },
  { category: "Teklif Şablonları", q: "Boş şablondan başlarsam varsayılan sayfa boyutu ne olur?", a: "Boş şablon 700×900 piksellik bir sayfa olarak açılır, istediğiniz blokları sıfırdan ekleyip konumlandırırsınız — hazır şablonlardaki gibi önceden yerleştirilmiş hiçbir blok gelmez." },
];

// "Soru Sor" — gerçek bir AI/LLM çağrısı YOK, önceden tanımlı sorulara canlı
// veriden hesaplanan cevaplar veren deterministik bir kütüphane (maliyet
// sıfır, veri hiç dışarı çıkmıyor). HELP_TOPICS'teki statik soru/cevap
// deseninin aynısı, tek fark cevabın compute(ctx) ile canlı hesaplanması —
// aşağıda HELP_TOPICS/ADVISOR_TIPS ile birlikte tek kütüphanede (UNIFIED_LIBRARY) birleşiyor.
// Bazı Pano metrikleri (winRate, rangeRevenue vb.) Pano'da seçili tarih
// aralığına bağlı olduğu için burada KASITLI OLARAK yeniden kullanılmıyor —
// bu panel her yerden açılabildiğinden cevap Pano'daki filtreye göre sessizce
// değişmesin diye kendi sabit dönemini (bu ay / tüm zamanlar) taze hesaplar.
function topEntry(totals) {
  const entries = Object.entries(totals);
  if (entries.length === 0) return null;
  return entries.sort((a, b) => b[1] - a[1])[0];
}

// "Analiz" kategorisindeki teşhis soruları (aşağıda) tek bir sayı yerine
// birkaç sinyali birleştirip bir yorum/öneri üretiyor — kayıp nedenine göre
// somut bir tavsiyeye eşleşen sabit bir sözlük. Hem teklif sektörlerindeki
// LOST_REASONS'ı hem randevu sektörlerindeki APPOINTMENT_LOST_REASONS'ı kapsar.
const REASON_ADVICE = {
  "Yüksek fiyat": "Fiyatlandırmanızı ve sunduğunuz değeri gözden geçirmeyi düşünebilirsiniz — doğrudan indirim yerine paketleme veya ek hizmet eklemek genelde daha sürdürülebilir bir çözümdür.",
  "Rakip tercih edildi": "Rakiplerinizi analiz edip kendi farklılaşma noktalarınızı (hız, kalite, kişisel ilgi, garanti) tekliflerinizde daha net vurgulamayı deneyin.",
  "Bütçe yok": "Daha küçük/esnek bir paket veya taksitli ödeme seçeneği sunmak bütçe engelini aşmanıza yardımcı olabilir.",
  "Zamanlama uymadı": "Bu kayıtlar için bir hatırlatma bırakıp uygun zaman geldiğinde tekrar iletişime geçmeyi unutmayın.",
  "Vazgeçti": "İlk temas sonrası takip hızınızı gözden geçirin — yanıt gecikmesi genelde ilginin soğumasına yol açar.",
  "Randevuya gelmedi": "Randevu hatırlatmalarınızın açık olduğundan emin olun, randevuya yakın ek bir hatırlatma da gelmeme oranını azaltabilir.",
  "İptal etti": "İptal nedenini not almayı sürdürün — tekrarlayan bir kalıp (örn. hep aynı gün/saat) varsa program/müsaitlik saatlerinizi gözden geçirebilirsiniz.",
};

const ANSWER_LIBRARY = [
  {
    id: "top_customer_month",
    category: "Satış",
    label: "Bu ay en çok kazandıran müşterim kim?",
    keywords: ["en çok kazandıran", "en iyi müşteri", "en çok gelir getiren müşteri"],
    compute: (ctx) => {
      const bounds = getRangeBounds("bu_ay");
      const won = ctx.deals.filter((d) => d.stage === "kazanildi" && inRange(d.closedAt || d.createdAt, bounds));
      if (won.length === 0) return "Bu ay henüz kazanılmış bir kaydınız yok.";
      const totals = {};
      won.forEach((d) => { totals[d.customerId] = (totals[d.customerId] || 0) + (d.value || 0); });
      const top = topEntry(totals);
      const customer = ctx.customers.find((c) => c.id === top[0]);
      return `${customer?.name || "Bilinmeyen müşteri"} — bu ay ${formatTL(top[1])} ile en çok kazandıran müşteriniz.`;
    },
  },
  {
    id: "win_rate_month",
    category: "Satış",
    label: "Bu ay kazanma oranım nedir?",
    keywords: ["bu ay kazanma oranı", "bu ay başarı oranı"],
    compute: (ctx) => {
      const bounds = getRangeBounds("bu_ay");
      const closed = ctx.deals.filter((d) => (d.stage === "kazanildi" || d.stage === "kaybedildi") && inRange(d.closedAt || d.createdAt, bounds));
      const won = closed.filter((d) => d.stage === "kazanildi");
      if (closed.length === 0) return "Bu ay henüz sonuçlanmış (kazanılmış/kaybedilmiş) bir kaydınız yok.";
      return `Bu ay kazanma oranınız %${Math.round((won.length / closed.length) * 100)} (${won.length}/${closed.length}).`;
    },
  },
  {
    id: "win_rate_all_time",
    category: "Satış",
    label: "Genel (tüm zamanlar) kazanma oranım nedir?",
    keywords: ["genel kazanma oranı", "tüm zamanlar kazanma oranı", "toplam kazanma oranı"],
    compute: (ctx) => {
      const closed = ctx.deals.filter((d) => d.stage === "kazanildi" || d.stage === "kaybedildi");
      const won = closed.filter((d) => d.stage === "kazanildi");
      if (closed.length === 0) return "Henüz sonuçlanmış bir kaydınız yok.";
      return `Tüm zamanlar kazanma oranınız %${Math.round((won.length / closed.length) * 100)} (${won.length}/${closed.length}).`;
    },
  },
  {
    id: "loss_rate_all_time",
    category: "Satış",
    label: "Kayıp oranım nedir?",
    keywords: ["kayıp oranı", "kaybetme oranı"],
    compute: (ctx) => {
      const closed = ctx.deals.filter((d) => d.stage === "kazanildi" || d.stage === "kaybedildi");
      const lost = closed.filter((d) => d.stage === "kaybedildi");
      if (closed.length === 0) return "Henüz sonuçlanmış bir kaydınız yok.";
      return `Tüm zamanlar kayıp oranınız %${Math.round((lost.length / closed.length) * 100)} (${lost.length}/${closed.length}).`;
    },
  },
  {
    id: "top_lost_reason",
    category: "Satış",
    label: "En çok hangi nedenle kaybediyorum?",
    keywords: ["kayıp nedeni", "neden kaybediyorum", "en çok kaybettiğim neden"],
    compute: (ctx) => {
      const lost = ctx.deals.filter((d) => d.stage === "kaybedildi" && d.lostReason);
      if (lost.length === 0) return "Henüz nedeni belirtilmiş kayıp bir kaydınız yok.";
      const totals = {};
      lost.forEach((d) => { totals[d.lostReason] = (totals[d.lostReason] || 0) + 1; });
      const top = topEntry(totals);
      return `En sık kayıp nedeniniz "${top[0]}" (${top[1]} kayıt).`;
    },
  },
  {
    id: "open_deals_count",
    category: "Satış",
    label: (sector) => {
      const words = DEAL_WORD_FORMS[dealWordKind(sector)];
      return words.bare === "teklif" ? "Kaç açık teklifim var?" : `Kaç bekleyen ${words.bare === "randevu" ? "randevum" : words.bare === "rezervasyon" ? "rezervasyonum" : "üyeliğim"} var?`;
    },
    keywords: ["açık teklif", "açık fırsat", "açık kayıt", "bekleyen teklif", "bekleyen randevu", "bekleyen üyelik"],
    compute: (ctx) => {
      const words = DEAL_WORD_FORMS[dealWordKind(ctx.companySettings?.sector)];
      const open = ctx.deals.filter((d) => d.stage !== "kazanildi" && d.stage !== "kaybedildi");
      return `${open.length} açık ${words.bare === "teklif" ? "teklifiniz" : words.bare === "randevu" ? "randevunuz" : words.bare === "rezervasyon" ? "rezervasyonunuz" : "üyeliğiniz"} var.`;
    },
  },
  {
    id: "avg_deal_size_month",
    category: "Satış",
    label: (sector) => `Bu ay ortalama kazanılan ${DEAL_WORD_FORMS[dealWordKind(sector)].bare} değeri ne kadar?`,
    keywords: ["ortalama teklif büyüklüğü", "ortalama fırsat büyüklüğü", "ortalama kayıt tutarı", "ortalama randevu değeri", "ortalama üyelik değeri"],
    compute: (ctx) => {
      const bounds = getRangeBounds("bu_ay");
      const words = DEAL_WORD_FORMS[dealWordKind(ctx.companySettings?.sector)];
      const won = ctx.deals.filter((d) => d.stage === "kazanildi" && inRange(d.closedAt || d.createdAt, bounds));
      if (won.length === 0) return "Bu ay henüz kazanılmış bir kaydınız yok.";
      const avg = won.reduce((sum, d) => sum + (d.value || 0), 0) / won.length;
      return `Bu ay ortalama kazanılan ${words.bare} değeriniz ${formatTL(avg)}.`;
    },
  },
  {
    id: "funnel",
    category: "Satış",
    label: "Hangi aşamada kaç kaydım var?",
    keywords: ["aşama hunisi", "hangi aşamada", "huni"],
    compute: (ctx) => {
      const openDeals = ctx.deals.filter((d) => d.stage !== "kazanildi" && d.stage !== "kaybedildi");
      return STAGES.filter((s) => s.id !== "kazanildi" && s.id !== "kaybedildi")
        .map((s) => `${stageLabel(s.id, "kurumsal", ctx.companySettings?.sector)}: ${openDeals.filter((d) => d.stage === s.id).length}`)
        .join(", ");
    },
  },
  {
    id: "forecast",
    category: "Satış",
    label: "Gelecek ay ne kadar kazanırım?",
    keywords: ["gelecek ay tahmin", "önümüzdeki ay tahmin", "gelecek ay ne kadar"],
    compute: (ctx) => (ctx.nextMonthForecast != null ? `Gelecek ay tahmini geliriniz yaklaşık ${formatTL(ctx.nextMonthForecast)}.` : "Tahmin için henüz yeterli geçmiş veri yok (son 3 ayda kazanılmış kayıt gerekiyor)."),
  },
  {
    id: "customer_count",
    category: "Müşteri",
    label: "Kaç müşterim var?",
    keywords: ["kaç müşteri", "müşteri sayım"],
    compute: (ctx) => `Toplam ${ctx.customers.length} müşteriniz var.`,
  },
  {
    id: "passive_rate",
    category: "Müşteri",
    label: "Pasif müşteri oranım nedir?",
    keywords: ["pasif müşteri", "uyuyan müşteri"],
    compute: (ctx) => (ctx.passiveCustomerRate != null ? `Pasif (90 gündür alışverişi olmayan) müşteri oranınız %${Math.round(ctx.passiveCustomerRate)}.` : "Henüz bu oranı hesaplamak için yeterli veri yok."),
  },
  {
    id: "top_debtor",
    category: "Müşteri",
    label: "En çok borçlu müşterim kim?",
    keywords: ["en çok borçlu", "borcu en yüksek", "en çok alacağım"],
    compute: (ctx) => {
      const balances = {};
      ctx.deals.filter((d) => d.stage === "kazanildi").forEach((d) => { balances[d.customerId] = (balances[d.customerId] || 0) + (d.value || 0); });
      ctx.payments.forEach((p) => {
        const deal = ctx.deals.find((d) => d.id === p.dealId);
        if (deal && balances[deal.customerId] != null) balances[deal.customerId] -= (p.amount || 0);
      });
      const top = Object.entries(balances).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1])[0];
      if (!top) return "Şu anda borcu olan bir müşteriniz görünmüyor.";
      const customer = ctx.customers.find((c) => c.id === top[0]);
      return `${customer?.name || "Bilinmeyen müşteri"} — ${formatTL(top[1])} bakiye ile en çok borçlu müşteriniz.`;
    },
  },
  {
    id: "top_sector",
    category: "Müşteri",
    label: "Hangi sektörden en çok müşterim var?",
    keywords: ["hangi sektörden en çok", "en çok sektör", "müşteri sektör dağılımı"],
    compute: (ctx) => {
      const totals = {};
      ctx.customers.forEach((c) => { if (c.sector) totals[c.sector] = (totals[c.sector] || 0) + 1; });
      const top = topEntry(totals);
      if (!top) return "Müşterilerinizde henüz sektör bilgisi girilmemiş.";
      return `En çok müşteriniz "${top[0]}" sektöründen (${top[1]} müşteri).`;
    },
  },
  {
    id: "collected_this_month",
    category: "Finans",
    label: "Bu ay ne kadar tahsilat aldım?",
    keywords: ["bu ay tahsilat", "bu ay ne kadar aldım", "bu ay tahsil ettim"],
    compute: (ctx) => {
      const bounds = getRangeBounds("bu_ay");
      const total = ctx.payments.filter((p) => inRange(p.paidAt, bounds)).reduce((sum, p) => sum + (p.amount || 0), 0);
      return `Bu ay toplam ${formatTL(total)} tahsilat aldınız.`;
    },
  },
  {
    id: "outstanding",
    category: "Finans",
    label: "Bekleyen alacağım ne kadar?",
    keywords: ["bekleyen alacak", "tahsil edilmemiş alacak", "alacağım ne kadar"],
    compute: (ctx) => `Şu anda bekleyen (tahsil edilmemiş) alacağınız ${formatTL(ctx.totalOutstanding || 0)}.`,
  },
  {
    id: "net_remaining_month",
    category: "Finans",
    label: "Bu ay net kârım ne kadar?",
    keywords: ["net kâr", "net kalan", "bu ay kârım"],
    compute: (ctx) => {
      const bounds = getRangeBounds("bu_ay");
      const income = ctx.payments.filter((p) => inRange(p.paidAt, bounds)).reduce((sum, p) => sum + (p.amount || 0), 0);
      const expense = ctx.companyExpenses.flatMap((e) => expandExpenseOccurrences(e, bounds)).reduce((sum, e) => sum + (e.amount || 0), 0);
      const dealCost = ctx.deals.filter((d) => d.stage === "kazanildi" && (d.cost || 0) > 0 && inRange(d.closedAt || d.createdAt, bounds)).reduce((sum, d) => sum + (d.cost || 0), 0);
      const net = income - expense - dealCost;
      return `Bu ay net kalanınız ${formatTL(net)} (${formatTL(income)} gelir − ${formatTL(expense + dealCost)} gider).`;
    },
  },
  {
    id: "top_expense_category_month",
    category: "Finans",
    label: "Bu ay en çok hangi kategoriye gider yapıyorum?",
    keywords: ["en çok gider", "gider kategorisi", "nereye harcıyorum"],
    compute: (ctx) => {
      const bounds = getRangeBounds("bu_ay");
      const totals = {};
      ctx.companyExpenses.flatMap((e) => expandExpenseOccurrences(e, bounds)).forEach((e) => { totals[e.category] = (totals[e.category] || 0) + (e.amount || 0); });
      const top = topEntry(totals);
      if (!top) return "Bu ay henüz kayıtlı bir gideriniz yok.";
      return `Bu ay en çok "${top[0]}" kategorisine gider yaptınız (${formatTL(top[1])}).`;
    },
  },
  {
    id: "forgotten_expense_categories",
    category: "Finans",
    label: "Unuttuğum bir gider kalemi olabilir mi?",
    keywords: ["unuttuğum gider", "kaçırdığım gider", "eksik gider kalemi", "hangi giderleri unuttum"],
    compute: (ctx) => {
      // Gerçekten yapılmış ama sisteme hiç girilmemiş, meşru ve indirilebilir
      // giderleri hatırlatır — vergi yükünü YASAL yollardan azaltmak için.
      const commonlyMissed = ["Eğitim", "Danışmanlık", "Sigorta", "Bakım / Onarım", "Seyahat / Konaklama", "Temsil ve Ağırlama"];
      const usedCategories = new Set(ctx.companyExpenses.map((e) => e.category));
      const missing = commonlyMissed.filter((c) => !usedCategories.has(c));
      if (missing.length === 0) return "Yaygın gider kategorilerinin hepsini en az bir kez kullanmışsınız — başka bir kalem gözden kaçıyorsa muhasebecinize danışabilirsiniz.";
      return `Şu kategorilerde hiç gideriniz görünmüyor: ${missing.join(", ")}. Gerçekten yaptığınız ama kaydetmediğiniz bir harcama varsa (örn. bir eğitim, sigorta poliçesi, danışmanlık ücreti) Finans → Gider ekle'den kaydedin — hem gerçek kârınızı doğru gösterir hem KDV'nizi doğru hesaplar.`;
    },
  },
  {
    id: "sla_breached",
    category: "Destek",
    label: "SLA'sı geçen kaç talebim var?",
    keywords: ["sla geçen", "süresi geçen talep", "gecikmiş talep"],
    compute: (ctx) => (ctx.breachedTicketsCount > 0 ? `SLA süresi geçmiş ${ctx.breachedTicketsCount} talebiniz var.` : "SLA süresi geçmiş bir talebiniz yok."),
  },
  {
    id: "unread_messages",
    category: "Destek",
    label: "Kaç okunmamış mesajım var?",
    keywords: ["okunmamış mesaj", "yanıtlanmamış mesaj"],
    compute: (ctx) => (ctx.unreadMessagesCount > 0 ? `${ctx.unreadMessagesCount} talepte okunmamış mesajınız var.` : "Okunmamış mesajınız yok."),
  },
  {
    id: "open_tickets_count",
    category: "Destek",
    label: "Açık kaç destek talebim var?",
    keywords: ["açık talep", "kaç destek talebi", "çözülmemiş talep"],
    compute: (ctx) => {
      const open = ctx.tickets.filter((t) => !TERMINAL_STATUSES.includes(t.status));
      return `${open.length} açık (çözülmemiş) destek talebiniz var.`;
    },
  },
  {
    id: "no_show_rate_month",
    category: "Satış",
    label: "Bu ay gelmeme oranım nedir?",
    keywords: ["gelmeme oranı", "no-show", "randevuya gelmeyen"],
    visibleIf: (sector) => isAppointmentSector(sector),
    compute: (ctx) => {
      const bounds = getRangeBounds("bu_ay");
      const closed = ctx.deals.filter((d) => (d.stage === "kazanildi" || d.stage === "kaybedildi") && inRange(d.closedAt || d.createdAt, bounds));
      const noShow = closed.filter((d) => d.stage === "kaybedildi" && d.lostReason === "Randevuya gelmedi");
      if (closed.length === 0) return "Bu ay henüz sonuçlanmış bir randevunuz yok.";
      return `Bu ay gelmeme oranınız %${Math.round((noShow.length / closed.length) * 100)} (${noShow.length}/${closed.length}).`;
    },
  },
  {
    id: "new_deals_this_month",
    category: "Satış",
    label: "Bu ay kaç yeni kayıt oluşturdum?",
    keywords: ["bu ay kaç yeni kayıt", "bu ay kaç teklif oluşturdum", "yeni kayıt sayısı"],
    compute: (ctx) => {
      const bounds = getRangeBounds("bu_ay");
      const words = DEAL_WORD_FORMS[dealWordKind(ctx.companySettings?.sector)];
      const count = ctx.deals.filter((d) => inRange(d.createdAt, bounds)).length;
      return `Bu ay ${count} yeni ${words.bare} oluşturdunuz.`;
    },
  },
  {
    id: "due_reminders_this_week",
    category: "Satış",
    label: "Bu hafta hatırlatması olan kaç kaydım var?",
    keywords: ["bu hafta hatırlatma", "hatırlatmalarım", "bu haftaki hatırlatma"],
    compute: (ctx) => {
      const today = new Date(); const todayStr = today.toISOString().slice(0, 10);
      const weekEnd = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const count = ctx.deals.filter((d) => d.stage !== "kazanildi" && d.stage !== "kaybedildi" && d.reminderDate && d.reminderDate >= todayStr && d.reminderDate <= weekEnd).length;
      return `Bu hafta hatırlatması olan ${count} kaydınız var.`;
    },
  },
  {
    id: "overdue_reminders",
    category: "Satış",
    label: "Hatırlatma tarihi geçmiş kaç kaydım var?",
    keywords: ["hatırlatma tarihi geçmiş", "geciken hatırlatma", "süresi geçen hatırlatma"],
    compute: (ctx) => {
      const todayStr = new Date().toISOString().slice(0, 10);
      const count = ctx.deals.filter((d) => d.stage !== "kazanildi" && d.stage !== "kaybedildi" && d.reminderDate && d.reminderDate < todayStr).length;
      return count > 0 ? `Hatırlatma tarihi geçmiş ${count} kaydınız var.` : "Hatırlatma tarihi geçmiş bir kaydınız yok.";
    },
  },
  {
    id: "most_expensive_open_deal",
    category: "Satış",
    label: "En değerli açık kaydım hangisi?",
    keywords: ["en değerli açık", "en pahalı açık teklif", "en büyük açık kayıt"],
    compute: (ctx) => {
      const open = ctx.deals.filter((d) => d.stage !== "kazanildi" && d.stage !== "kaybedildi").sort((a, b) => (b.value || 0) - (a.value || 0));
      if (open.length === 0) return "Şu anda açık bir kaydınız yok.";
      const top = open[0];
      const customer = ctx.customers.find((c) => c.id === top.customerId);
      return `"${top.title}" (${customer?.name || "müşteri silinmiş"}) — ${formatTL(top.value)} ile en değerli açık kaydınız.`;
    },
  },
  {
    id: "oldest_open_deal",
    category: "Satış",
    label: "En uzun süredir açık kalan kaydım hangisi?",
    keywords: ["en eski açık", "en uzun süredir açık", "en eski teklif"],
    compute: (ctx) => {
      const open = ctx.deals.filter((d) => d.stage !== "kazanildi" && d.stage !== "kaybedildi").sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
      if (open.length === 0) return "Şu anda açık bir kaydınız yok.";
      const top = open[0];
      const customer = ctx.customers.find((c) => c.id === top.customerId);
      const days = Math.floor((Date.now() - new Date(top.createdAt).getTime()) / (24 * 60 * 60 * 1000));
      return `"${top.title}" (${customer?.name || "müşteri silinmiş"}) — ${days} gündür açık.`;
    },
  },
  {
    id: "avg_sales_cycle",
    category: "Satış",
    label: "Ortalama satış süresi (gün) ne kadar?",
    keywords: ["ortalama satış süresi", "satış döngüsü", "kaç günde kazanıyorum"],
    compute: (ctx) => {
      const won = ctx.deals.filter((d) => d.stage === "kazanildi" && d.closedAt);
      if (won.length === 0) return "Henüz kazanılmış bir kaydınız yok.";
      const avgDays = won.reduce((sum, d) => sum + (new Date(d.closedAt) - new Date(d.createdAt)) / (24 * 60 * 60 * 1000), 0) / won.length;
      return `Ortalama satış süreniz (kayıt açılıştan kazanılana kadar) ${Math.round(avgDays)} gün.`;
    },
  },
  {
    id: "this_year_revenue",
    category: "Satış",
    label: "Bu yıl toplam ne kadar kazandım?",
    keywords: ["bu yıl ne kadar kazandım", "bu yıl toplam gelir", "yıllık gelir"],
    compute: (ctx) => {
      const bounds = getRangeBounds("bu_yil");
      const total = ctx.deals.filter((d) => d.stage === "kazanildi" && inRange(d.closedAt || d.createdAt, bounds)).reduce((sum, d) => sum + (d.value || 0), 0);
      return `Bu yıl toplam ${formatTL(total)} kazandınız.`;
    },
  },
  {
    id: "last_month_revenue",
    category: "Satış",
    label: "Geçen ay ne kadar kazandım?",
    keywords: ["geçen ay ne kadar kazandım", "geçen ayki gelir", "önceki ay gelir"],
    compute: (ctx) => {
      const now = new Date();
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
      const total = ctx.deals.filter((d) => d.stage === "kazanildi" && inRange(d.closedAt || d.createdAt, { start, end })).reduce((sum, d) => sum + (d.value || 0), 0);
      return `Geçen ay toplam ${formatTL(total)} kazandınız.`;
    },
  },
  {
    id: "top_tag_deals",
    category: "Satış",
    label: "En çok kullandığım kayıt etiketi hangisi?",
    keywords: ["en çok kullanılan etiket", "kayıt etiketi", "teklif etiketleri"],
    compute: (ctx) => {
      const totals = {};
      ctx.deals.forEach((d) => (d.tags || []).forEach((t) => { totals[t] = (totals[t] || 0) + 1; }));
      const top = topEntry(totals);
      return top ? `En çok kullandığınız etiket "${top[0]}" (${top[1]} kayıtta).` : "Henüz hiçbir kaydınıza etiket eklenmemiş.";
    },
  },
  {
    id: "top_assignee_by_win",
    category: "Satış",
    label: "Takımda en çok kim kazandırıyor?",
    keywords: ["en çok kim kazandırıyor", "takımda en iyi", "kimin performansı iyi"],
    compute: (ctx) => {
      if (ctx.teamMembers.length === 0) return "Henüz takım üyeniz yok.";
      const totals = {};
      ctx.deals.filter((d) => d.stage === "kazanildi" && d.assignedTo).forEach((d) => { totals[d.assignedTo] = (totals[d.assignedTo] || 0) + (d.value || 0); });
      const top = topEntry(totals);
      if (!top) return "Henüz sorumlu atanmış kazanılan bir kaydınız yok.";
      const name = top[0] === ctx.currentUserId ? "Siz" : (ctx.teamMembers.find((m) => m.id === top[0])?.name || ctx.teamMembers.find((m) => m.id === top[0])?.email || "Bilinmeyen üye");
      return `${name} — ${formatTL(top[1])} ile en çok kazandıran kişi.`;
    },
  },
  {
    id: "newest_customer",
    category: "Müşteri",
    label: "En son eklenen müşterim kim?",
    keywords: ["en son eklenen müşteri", "son eklenen müşteri", "yeni müşterim"],
    compute: (ctx) => {
      if (ctx.customers.length === 0) return "Henüz müşteriniz yok.";
      const sorted = [...ctx.customers].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      return `${sorted[0].name} — ${new Date(sorted[0].createdAt).toLocaleDateString("tr-TR")} tarihinde eklendi.`;
    },
  },
  {
    id: "new_customers_this_month",
    category: "Müşteri",
    label: "Bu ay kaç yeni müşteri kazandım?",
    keywords: ["bu ay kaç yeni müşteri", "bu ay yeni müşteri sayısı"],
    compute: (ctx) => {
      const bounds = getRangeBounds("bu_ay");
      return `Bu ay ${ctx.customers.filter((c) => inRange(c.createdAt, bounds)).length} yeni müşteri kazandınız.`;
    },
  },
  {
    id: "customer_type_split",
    category: "Müşteri",
    label: "Kurumsal mı bireysel mi daha çok müşterim var?",
    keywords: ["kurumsal bireysel", "müşteri türü dağılımı"],
    compute: (ctx) => {
      const kurumsal = ctx.customers.filter((c) => c.customerType === "kurumsal").length;
      const bireysel = ctx.customers.filter((c) => c.customerType === "bireysel").length;
      return `${kurumsal} kurumsal, ${bireysel} bireysel müşteriniz var.`;
    },
  },
  {
    id: "customers_missing_phone",
    category: "Müşteri",
    label: "Telefonu olmayan kaç müşterim var?",
    keywords: ["telefonu olmayan müşteri", "telefon eksik"],
    compute: (ctx) => `Telefonu kayıtlı olmayan ${ctx.customers.filter((c) => !c.phone).length} müşteriniz var.`,
  },
  {
    id: "customers_missing_email",
    category: "Müşteri",
    label: "E-postası olmayan kaç müşterim var?",
    keywords: ["e-postası olmayan müşteri", "email eksik"],
    compute: (ctx) => `E-postası kayıtlı olmayan ${ctx.customers.filter((c) => !c.email).length} müşteriniz var.`,
  },
  {
    id: "top_customer_tag",
    category: "Müşteri",
    label: "En çok kullandığım müşteri etiketi hangisi?",
    keywords: ["en çok kullanılan müşteri etiketi", "müşteri etiketleri"],
    compute: (ctx) => {
      const totals = {};
      ctx.customers.forEach((c) => (c.tags || []).forEach((t) => { totals[t] = (totals[t] || 0) + 1; }));
      const top = topEntry(totals);
      return top ? `En çok kullandığınız müşteri etiketi "${top[0]}" (${top[1]} müşteride).` : "Henüz hiçbir müşterinize etiket eklenmemiş.";
    },
  },
  {
    id: "top_region",
    category: "Müşteri",
    label: "En çok hangi bölgeden müşterim var?",
    keywords: ["hangi bölgeden", "bölge dağılımı", "en çok bölge"],
    compute: (ctx) => {
      const totals = {};
      ctx.customers.forEach((c) => { if (c.region) totals[c.region] = (totals[c.region] || 0) + 1; });
      const top = topEntry(totals);
      return top ? `En çok müşteriniz "${top[0]}" bölgesinden (${top[1]} müşteri).` : "Müşterilerinizde henüz bölge bilgisi girilmemiş.";
    },
  },
  {
    id: "total_collected_all_time",
    category: "Finans",
    label: "Tüm zamanlar toplam tahsilatım ne kadar?",
    keywords: ["toplam tahsilat", "tüm zamanlar tahsilat", "şimdiye kadar ne kadar tahsil ettim"],
    compute: (ctx) => `Şimdiye kadar toplam ${formatTL(ctx.payments.reduce((sum, p) => sum + (p.amount || 0), 0))} tahsilat aldınız.`,
  },
  {
    id: "biggest_payment",
    category: "Finans",
    label: "En büyük tek tahsilatım ne kadar oldu?",
    keywords: ["en büyük tahsilat", "en yüksek ödeme"],
    compute: (ctx) => {
      const positive = ctx.payments.filter((p) => (p.amount || 0) > 0);
      if (positive.length === 0) return "Henüz bir tahsilatınız yok.";
      return `En büyük tek tahsilatınız ${formatTL(Math.max(...positive.map((p) => p.amount)))}.`;
    },
  },
  {
    id: "last_payment_date",
    category: "Finans",
    label: "En son ne zaman tahsilat aldım?",
    keywords: ["en son tahsilat", "son ödeme ne zaman"],
    compute: (ctx) => {
      if (ctx.payments.length === 0) return "Henüz bir tahsilatınız yok.";
      const sorted = [...ctx.payments].sort((a, b) => new Date(b.paidAt) - new Date(a.paidAt));
      return `En son ${new Date(sorted[0].paidAt).toLocaleDateString("tr-TR")} tarihinde tahsilat aldınız.`;
    },
  },
  {
    id: "recurring_expense_count",
    category: "Finans",
    label: "Kaç tane tekrarlayan giderim var?",
    keywords: ["tekrarlayan gider sayısı", "kaç tekrarlayan gider"],
    compute: (ctx) => `${ctx.companyExpenses.filter((e) => e.isRecurring).length} tekrarlayan gideriniz var.`,
  },
  {
    id: "monthly_fixed_expense",
    category: "Finans",
    label: "Aylık sabit gider toplamım ne kadar?",
    keywords: ["aylık sabit gider", "aylık giderim ne kadar"],
    compute: (ctx) => {
      const total = ctx.companyExpenses.filter((e) => e.isRecurring && e.recurrenceInterval === "monthly").reduce((sum, e) => sum + (e.amount || 0), 0);
      return `Aylık tekrarlayan (sabit) gider toplamınız ${formatTL(total)}.`;
    },
  },
  {
    id: "this_year_expense",
    category: "Finans",
    label: "Bu yıl toplam giderim ne kadar?",
    keywords: ["bu yıl toplam gider", "yıllık gider"],
    compute: (ctx) => {
      const bounds = getRangeBounds("bu_yil");
      const expense = ctx.companyExpenses.flatMap((e) => expandExpenseOccurrences(e, bounds)).reduce((sum, e) => sum + (e.amount || 0), 0);
      const dealCost = ctx.deals.filter((d) => d.stage === "kazanildi" && (d.cost || 0) > 0 && inRange(d.closedAt || d.createdAt, bounds)).reduce((sum, d) => sum + (d.cost || 0), 0);
      return `Bu yıl toplam gideriniz ${formatTL(expense + dealCost)}.`;
    },
  },
  {
    id: "payment_connection_status",
    category: "Finans",
    label: "Online ödeme bağlantım var mı?",
    keywords: ["ödeme bağlantım var mı", "iyzico bağlı mı", "paytr bağlı mı"],
    compute: (ctx) => (ctx.paymentCredentials.length > 0 ? `Evet, ${ctx.paymentCredentials[0].provider === "paytr" ? "PayTR" : "iyzico"} bağlı.` : "Henüz bir ödeme sağlayıcısı bağlamadınız."),
  },
  {
    id: "avg_payment_amount",
    category: "Finans",
    label: "Ortalama tahsilat tutarım ne kadar?",
    keywords: ["ortalama tahsilat", "ortalama ödeme tutarı"],
    compute: (ctx) => {
      const positive = ctx.payments.filter((p) => (p.amount || 0) > 0);
      if (positive.length === 0) return "Henüz bir tahsilatınız yok.";
      return `Ortalama tahsilat tutarınız ${formatTL(positive.reduce((sum, p) => sum + p.amount, 0) / positive.length)}.`;
    },
  },
  {
    id: "total_tickets",
    category: "Destek",
    label: "Toplam kaç destek talebim var?",
    keywords: ["toplam destek talebi", "kaç talebim var"],
    compute: (ctx) => `Toplam ${ctx.tickets.length} destek talebiniz var.`,
  },
  {
    id: "tickets_by_priority",
    category: "Destek",
    label: "Önceliğe göre talep dağılımım nasıl?",
    keywords: ["öncelik dağılımı", "talep önceliği"],
    compute: (ctx) => {
      if (ctx.tickets.length === 0) return "Henüz bir destek talebiniz yok.";
      const labels = { acil: "Acil", yuksek: "Yüksek", orta: "Orta", dusuk: "Düşük" };
      const totals = {};
      ctx.tickets.forEach((t) => { totals[t.priority] = (totals[t.priority] || 0) + 1; });
      return Object.entries(totals).map(([k, v]) => `${labels[k] || k}: ${v}`).join(", ");
    },
  },
  {
    id: "resolved_tickets_count",
    category: "Destek",
    label: "Kaç talebim çözüldü?",
    keywords: ["kaç talep çözüldü", "çözülen talep sayısı"],
    compute: (ctx) => `${ctx.tickets.filter((t) => TERMINAL_STATUSES.includes(t.status)).length} talebiniz çözüldü/kapatıldı.`,
  },
  {
    id: "kb_article_count",
    category: "Destek",
    label: "Kaç Bilgi Bankası makalem var?",
    keywords: ["kaç makale", "bilgi bankası makale sayısı"],
    compute: (ctx) => `${ctx.kbArticles.length} Bilgi Bankası makaleniz var.`,
  },
  {
    id: "top_kb_category",
    category: "Destek",
    label: "Hangi kategoride en çok makalem var?",
    keywords: ["en çok makale kategorisi", "makale kategorileri"],
    compute: (ctx) => {
      const totals = {};
      ctx.kbArticles.forEach((a) => { if (a.category) totals[a.category] = (totals[a.category] || 0) + 1; });
      const top = topEntry(totals);
      return top ? `En çok makaleniz "${top[0]}" kategorisinde (${top[1]} makale).` : "Henüz kategorili bir makaleniz yok.";
    },
  },
  {
    id: "avg_resolution_days",
    category: "Destek",
    label: "Ortalama kaç günde talep çözüyorum?",
    keywords: ["ortalama çözüm süresi", "kaç günde çözüyorum"],
    compute: (ctx) => {
      const resolved = ctx.tickets.filter((t) => t.resolvedAt);
      if (resolved.length === 0) return "Henüz çözülmüş bir talebiniz yok.";
      const avgDays = resolved.reduce((sum, t) => sum + (new Date(t.resolvedAt) - new Date(t.createdAt)) / (24 * 60 * 60 * 1000), 0) / resolved.length;
      return `Ortalama talep çözüm süreniz ${Math.round(avgDays * 10) / 10} gün.`;
    },
  },
  {
    id: "appointments_today",
    category: "Randevu & Program",
    label: "Bugün kaç randevum var?",
    keywords: ["bugün kaç randevum", "bugünkü randevular"],
    visibleIf: (sector) => supportsSelfBooking(sector) || isAppointmentSector(sector),
    compute: (ctx) => {
      if (!ctx.appointmentDateTimeKey) return "Randevu tarihi alanı henüz tanımlı değil.";
      const todayStr = new Date().toISOString().slice(0, 10);
      const count = ctx.deals.filter((d) => d.stage !== "kazanildi" && d.stage !== "kaybedildi" && (d.customFields?.[ctx.appointmentDateTimeKey] || "").slice(0, 10) === todayStr).length;
      return `Bugün ${count} randevunuz var.`;
    },
  },
  {
    id: "group_class_count",
    category: "Randevu & Program",
    label: "Kaç grup dersim var?",
    keywords: ["kaç grup dersi", "ders sayım"],
    visibleIf: (sector) => supportsGroupClasses(sector),
    compute: (ctx) => `${ctx.groupClasses.length} grup dersiniz var.`,
  },
  {
    id: "fullest_group_class",
    category: "Randevu & Program",
    label: "Hangi dersimde en çok kayıt var?",
    keywords: ["en dolu ders", "en çok kayıtlı ders"],
    visibleIf: (sector) => supportsGroupClasses(sector),
    compute: (ctx) => {
      if (ctx.groupClasses.length === 0) return "Henüz bir dersiniz yok.";
      const totals = {};
      ctx.groupClassEnrollments.forEach((e) => { totals[e.groupClassId] = (totals[e.groupClassId] || 0) + 1; });
      const top = topEntry(totals);
      if (!top) return "Henüz hiçbir dersinize kayıt yok.";
      const cls = ctx.groupClasses.find((g) => g.id === top[0]);
      return `En dolu dersiniz "${cls?.name || "silinmiş ders"}" — ${top[1]}/${cls?.capacity ?? "?"} kayıt.`;
    },
  },
  {
    id: "business_hours_defined",
    category: "Randevu & Program",
    label: "Müsaitlik saatlerimi tanımladım mı?",
    keywords: ["müsaitlik saatleri tanımlı mı", "randevu saatlerim"],
    visibleIf: (sector) => bookingModel(sector) === "slot",
    compute: (ctx) => (ctx.businessHours.length > 0 ? `Evet, ${ctx.businessHours.length} gün için müsaitlik saati tanımlı.` : "Henüz müsaitlik saati tanımlamadınız."),
  },
  {
    id: "team_member_count",
    category: "Takım",
    label: "Kaç takım üyem var?",
    keywords: ["kaç takım üyem var", "takım büyüklüğü"],
    compute: (ctx) => (ctx.teamMembers.length > 0 ? `Siz dahil ${ctx.teamMembers.length + 1} kişisiniz.` : "Henüz takım üyeniz yok, tek başınızasınız."),
  },
  {
    id: "attachment_count",
    category: "Sistem",
    label: "Kaç dosya (ek) yüklemişim?",
    keywords: ["kaç dosya yükledim", "dosya sayım", "eklerim"],
    compute: (ctx) => `Müşteri/teklif kayıtlarınıza toplam ${ctx.attachments.length} dosya eklenmiş.`,
  },
  {
    id: "custom_field_count",
    category: "Sistem",
    label: "Kaç özel alan tanımlamışım?",
    keywords: ["özel alan sayısı", "kaç özel alanım var"],
    compute: (ctx) => `${ctx.customFieldDefs.filter((d) => d.active).length} aktif özel alanınız var.`,
  },
  {
    id: "price_list_count",
    category: "Sistem",
    label: "Fiyat listemde kaç ürün/hizmet var?",
    keywords: ["fiyat listesi kaç ürün", "kaç hizmetim var listede"],
    compute: (ctx) => `Fiyat listenizde ${ctx.priceListItems.length} ürün/hizmet var.`,
  },
  // ---- Satış ----
  {
    id: "revenue_this_quarter",
    category: "Satış",
    label: "Bu çeyrek toplam ne kadar kazandım?",
    keywords: ["bu çeyrek gelir", "bu çeyrek ne kadar kazandım", "çeyreklik gelir"],
    compute: (ctx) => {
      const bounds = getRangeBounds("bu_ceyrek");
      const total = ctx.deals.filter((d) => d.stage === "kazanildi" && inRange(d.closedAt || d.createdAt, bounds)).reduce((sum, d) => sum + (d.value || 0), 0);
      return `Bu çeyrek toplam ${formatTL(total)} kazandınız.`;
    },
  },
  {
    id: "revenue_last_quarter",
    category: "Satış",
    label: "Geçen çeyrek ne kadar kazandım?",
    keywords: ["geçen çeyrek gelir", "önceki çeyrek gelir"],
    compute: (ctx) => {
      const now = new Date();
      const qStartMonth = Math.floor(now.getMonth() / 3) * 3;
      const thisQStart = new Date(now.getFullYear(), qStartMonth, 1);
      const lastQStart = new Date(now.getFullYear(), qStartMonth - 3, 1);
      const lastQEnd = new Date(thisQStart.getTime() - 1);
      const total = ctx.deals.filter((d) => d.stage === "kazanildi" && inRange(d.closedAt || d.createdAt, { start: lastQStart, end: lastQEnd })).reduce((sum, d) => sum + (d.value || 0), 0);
      return `Geçen çeyrek toplam ${formatTL(total)} kazandınız.`;
    },
  },
  {
    id: "win_rate_this_quarter",
    category: "Satış",
    label: "Bu çeyrek kazanma oranım nedir?",
    keywords: ["bu çeyrek kazanma oranı", "çeyreklik başarı oranı"],
    compute: (ctx) => {
      const bounds = getRangeBounds("bu_ceyrek");
      const closed = ctx.deals.filter((d) => (d.stage === "kazanildi" || d.stage === "kaybedildi") && inRange(d.closedAt || d.createdAt, bounds));
      const won = closed.filter((d) => d.stage === "kazanildi");
      if (closed.length === 0) return "Bu çeyrek henüz sonuçlanmış bir kaydınız yok.";
      return `Bu çeyrek kazanma oranınız %${Math.round((won.length / closed.length) * 100)} (${won.length}/${closed.length}).`;
    },
  },
  {
    id: "win_rate_last_quarter",
    category: "Satış",
    label: "Geçen çeyrek kazanma oranım neydi?",
    keywords: ["geçen çeyrek kazanma oranı", "önceki çeyrek başarı oranı"],
    compute: (ctx) => {
      const now = new Date();
      const qStartMonth = Math.floor(now.getMonth() / 3) * 3;
      const thisQStart = new Date(now.getFullYear(), qStartMonth, 1);
      const lastQStart = new Date(now.getFullYear(), qStartMonth - 3, 1);
      const lastQEnd = new Date(thisQStart.getTime() - 1);
      const closed = ctx.deals.filter((d) => (d.stage === "kazanildi" || d.stage === "kaybedildi") && inRange(d.closedAt || d.createdAt, { start: lastQStart, end: lastQEnd }));
      const won = closed.filter((d) => d.stage === "kazanildi");
      if (closed.length === 0) return "Geçen çeyrek sonuçlanmış bir kaydınız yoktu.";
      return `Geçen çeyrek kazanma oranınız %${Math.round((won.length / closed.length) * 100)} (${won.length}/${closed.length}) idi.`;
    },
  },
  {
    id: "win_rate_this_year",
    category: "Satış",
    label: "Bu yıl kazanma oranım nedir?",
    keywords: ["bu yıl kazanma oranı", "yıllık başarı oranı"],
    compute: (ctx) => {
      const bounds = getRangeBounds("bu_yil");
      const closed = ctx.deals.filter((d) => (d.stage === "kazanildi" || d.stage === "kaybedildi") && inRange(d.closedAt || d.createdAt, bounds));
      const won = closed.filter((d) => d.stage === "kazanildi");
      if (closed.length === 0) return "Bu yıl henüz sonuçlanmış bir kaydınız yok.";
      return `Bu yıl kazanma oranınız %${Math.round((won.length / closed.length) * 100)} (${won.length}/${closed.length}).`;
    },
  },
  {
    id: "yoy_revenue_comparison",
    category: "Satış",
    label: "Bu yıl geçen yıla göre ne kadar kazandım?",
    keywords: ["geçen yılla karşılaştırma", "yıllık kıyaslama", "geçen yıla göre gelir"],
    compute: (ctx) => {
      const now = new Date();
      const thisBounds = getRangeBounds("bu_yil");
      const lastBounds = { start: new Date(now.getFullYear() - 1, 0, 1), end: new Date(now.getFullYear() - 1, 11, 31, 23, 59, 59, 999) };
      const thisYear = ctx.deals.filter((d) => d.stage === "kazanildi" && inRange(d.closedAt || d.createdAt, thisBounds)).reduce((sum, d) => sum + (d.value || 0), 0);
      const lastYear = ctx.deals.filter((d) => d.stage === "kazanildi" && inRange(d.closedAt || d.createdAt, lastBounds)).reduce((sum, d) => sum + (d.value || 0), 0);
      if (lastYear === 0) return `Geçen yıl kazancınız yoktu, bu yıl ${formatTL(thisYear)} kazandınız.`;
      const change = Math.round(((thisYear - lastYear) / lastYear) * 100);
      return `Bu yıl ${formatTL(thisYear)}, geçen yıl ${formatTL(lastYear)} kazandınız (%${change > 0 ? "+" : ""}${change} değişim).`;
    },
  },
  {
    id: "mom_revenue_comparison",
    category: "Satış",
    label: "Bu ay geçen aya göre ne kadar kazandım?",
    keywords: ["geçen aya göre gelir", "aylık kıyaslama", "bir önceki aya göre"],
    compute: (ctx) => {
      const now = new Date();
      const thisBounds = getRangeBounds("bu_ay");
      const lastStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lastEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
      const thisMonth = ctx.deals.filter((d) => d.stage === "kazanildi" && inRange(d.closedAt || d.createdAt, thisBounds)).reduce((sum, d) => sum + (d.value || 0), 0);
      const lastMonth = ctx.deals.filter((d) => d.stage === "kazanildi" && inRange(d.closedAt || d.createdAt, { start: lastStart, end: lastEnd })).reduce((sum, d) => sum + (d.value || 0), 0);
      if (lastMonth === 0) return `Geçen ay kazancınız yoktu, bu ay ${formatTL(thisMonth)} kazandınız.`;
      const change = Math.round(((thisMonth - lastMonth) / lastMonth) * 100);
      return `Bu ay ${formatTL(thisMonth)}, geçen ay ${formatTL(lastMonth)} kazandınız (%${change > 0 ? "+" : ""}${change} değişim).`;
    },
  },
  {
    id: "open_deals_value_total",
    category: "Satış",
    label: (sector) => `Açık ${DEAL_WORD_FORMS[dealWordKind(sector)].genPlural} toplam değeri ne kadar?`,
    keywords: ["açık teklif toplam değeri", "açık fırsat değeri", "bekleyen kayıt tutarı"],
    compute: (ctx) => {
      const open = ctx.deals.filter((d) => d.stage !== "kazanildi" && d.stage !== "kaybedildi");
      const words = DEAL_WORD_FORMS[dealWordKind(ctx.companySettings?.sector)];
      if (open.length === 0) return "Şu anda açık bir kaydınız yok.";
      const total = open.reduce((sum, d) => sum + (d.value || 0), 0);
      return `Açık ${words.genPlural} toplam değeri ${formatTL(total)} (${open.length} kayıt).`;
    },
  },
  {
    id: "avg_deal_size_all_time",
    category: "Satış",
    label: "Tüm zamanlar ortalama kazanılan kayıt değeri ne kadar?",
    keywords: ["tüm zamanlar ortalama teklif", "genel ortalama kayıt değeri"],
    compute: (ctx) => {
      const won = ctx.deals.filter((d) => d.stage === "kazanildi");
      if (won.length === 0) return "Henüz kazanılmış bir kaydınız yok.";
      const avg = won.reduce((sum, d) => sum + (d.value || 0), 0) / won.length;
      return `Tüm zamanlar ortalama kazanılan kayıt değeriniz ${formatTL(avg)}.`;
    },
  },
  {
    id: "avg_deal_size_open",
    category: "Satış",
    label: "Açık kayıtlarımın ortalama değeri ne kadar?",
    keywords: ["açık kayıt ortalama değeri", "ortalama açık teklif"],
    compute: (ctx) => {
      const open = ctx.deals.filter((d) => d.stage !== "kazanildi" && d.stage !== "kaybedildi");
      if (open.length === 0) return "Şu anda açık bir kaydınız yok.";
      const avg = open.reduce((sum, d) => sum + (d.value || 0), 0) / open.length;
      return `Açık kayıtlarınızın ortalama değeri ${formatTL(avg)}.`;
    },
  },
  {
    id: "deals_by_stage_value",
    category: "Satış",
    label: "Hangi aşamada toplam ne kadar değer var?",
    keywords: ["aşama bazında değer", "aşamalara göre tutar"],
    compute: (ctx) => {
      const openDeals = ctx.deals.filter((d) => d.stage !== "kazanildi" && d.stage !== "kaybedildi");
      if (openDeals.length === 0) return "Şu anda açık bir kaydınız yok.";
      return STAGES.filter((s) => s.id !== "kazanildi" && s.id !== "kaybedildi")
        .map((s) => `${stageLabel(s.id, "kurumsal", ctx.companySettings?.sector)}: ${formatTL(openDeals.filter((d) => d.stage === s.id).reduce((sum, d) => sum + (d.value || 0), 0))}`)
        .join(", ");
    },
  },
  {
    id: "deals_won_this_week",
    category: "Satış",
    label: "Bu hafta kaç kayıt kazandım?",
    keywords: ["bu hafta kazanılan", "bu hafta kaç teklif kazandım"],
    compute: (ctx) => {
      const now = new Date();
      const start = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000);
      start.setHours(0, 0, 0, 0);
      const count = ctx.deals.filter((d) => d.stage === "kazanildi" && inRange(d.closedAt || d.createdAt, { start, end: now })).length;
      return `Son 7 günde ${count} kayıt kazandınız.`;
    },
  },
  {
    id: "deals_created_this_week",
    category: "Satış",
    label: "Bu hafta kaç yeni kayıt oluşturdum?",
    keywords: ["bu hafta yeni kayıt", "bu haftaki yeni teklifler"],
    compute: (ctx) => {
      const now = new Date();
      const start = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000);
      start.setHours(0, 0, 0, 0);
      const count = ctx.deals.filter((d) => inRange(d.createdAt, { start, end: now })).length;
      return `Son 7 günde ${count} yeni kayıt oluşturdunuz.`;
    },
  },
  {
    id: "deals_created_last_month",
    category: "Satış",
    label: "Geçen ay kaç yeni kayıt oluşturdum?",
    keywords: ["geçen ay yeni kayıt", "geçen ayki yeni teklifler"],
    compute: (ctx) => {
      const now = new Date();
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
      const count = ctx.deals.filter((d) => inRange(d.createdAt, { start, end })).length;
      return `Geçen ay ${count} yeni kayıt oluşturdunuz.`;
    },
  },
  {
    id: "deals_lost_this_month",
    category: "Satış",
    label: "Bu ay kaç kayıt kaybettim?",
    keywords: ["bu ay kaybedilen", "bu ay kaç teklif kaybettim"],
    compute: (ctx) => {
      const bounds = getRangeBounds("bu_ay");
      const count = ctx.deals.filter((d) => d.stage === "kaybedildi" && inRange(d.closedAt || d.createdAt, bounds)).length;
      return count > 0 ? `Bu ay ${count} kayıt kaybettiniz.` : "Bu ay henüz kaybedilmiş bir kaydınız yok.";
    },
  },
  {
    id: "deals_lost_this_quarter",
    category: "Satış",
    label: "Bu çeyrek kaç kayıt kaybettim?",
    keywords: ["bu çeyrek kaybedilen", "çeyreklik kayıp sayısı"],
    compute: (ctx) => {
      const bounds = getRangeBounds("bu_ceyrek");
      const count = ctx.deals.filter((d) => d.stage === "kaybedildi" && inRange(d.closedAt || d.createdAt, bounds)).length;
      return count > 0 ? `Bu çeyrek ${count} kayıt kaybettiniz.` : "Bu çeyrek henüz kaybedilmiş bir kaydınız yok.";
    },
  },
  {
    id: "top_lost_reason_month",
    category: "Satış",
    label: "Bu ay en çok hangi nedenle kaybettim?",
    keywords: ["bu ay kayıp nedeni", "bu ay en çok kaybettiğim neden"],
    compute: (ctx) => {
      const bounds = getRangeBounds("bu_ay");
      const lost = ctx.deals.filter((d) => d.stage === "kaybedildi" && d.lostReason && inRange(d.closedAt || d.createdAt, bounds));
      if (lost.length === 0) return "Bu ay nedeni belirtilmiş kayıp bir kaydınız yok.";
      const totals = {};
      lost.forEach((d) => { totals[d.lostReason] = (totals[d.lostReason] || 0) + 1; });
      const top = topEntry(totals);
      return `Bu ay en sık kayıp nedeniniz "${top[0]}" (${top[1]} kayıt).`;
    },
  },
  {
    id: "no_show_rate_quarter",
    category: "Satış",
    label: "Bu çeyrek gelmeme oranım nedir?",
    keywords: ["bu çeyrek gelmeme oranı", "çeyreklik no-show"],
    visibleIf: (sector) => isAppointmentSector(sector),
    compute: (ctx) => {
      const bounds = getRangeBounds("bu_ceyrek");
      const closed = ctx.deals.filter((d) => (d.stage === "kazanildi" || d.stage === "kaybedildi") && inRange(d.closedAt || d.createdAt, bounds));
      const noShow = closed.filter((d) => d.stage === "kaybedildi" && d.lostReason === "Randevuya gelmedi");
      if (closed.length === 0) return "Bu çeyrek henüz sonuçlanmış bir randevunuz yok.";
      return `Bu çeyrek gelmeme oranınız %${Math.round((noShow.length / closed.length) * 100)} (${noShow.length}/${closed.length}).`;
    },
  },
  {
    id: "no_show_rate_all_time",
    category: "Satış",
    label: "Tüm zamanlar gelmeme oranım nedir?",
    keywords: ["tüm zamanlar gelmeme oranı", "genel no-show oranı"],
    visibleIf: (sector) => isAppointmentSector(sector),
    compute: (ctx) => {
      const closed = ctx.deals.filter((d) => d.stage === "kazanildi" || d.stage === "kaybedildi");
      const noShow = closed.filter((d) => d.stage === "kaybedildi" && d.lostReason === "Randevuya gelmedi");
      if (closed.length === 0) return "Henüz sonuçlanmış bir randevunuz yok.";
      return `Tüm zamanlar gelmeme oranınız %${Math.round((noShow.length / closed.length) * 100)} (${noShow.length}/${closed.length}).`;
    },
  },
  {
    id: "cancellation_rate",
    category: "Satış",
    label: "İptal oranım nedir?",
    keywords: ["iptal oranı", "randevu iptal oranı"],
    visibleIf: (sector) => isAppointmentSector(sector),
    compute: (ctx) => {
      const closed = ctx.deals.filter((d) => d.stage === "kazanildi" || d.stage === "kaybedildi");
      const cancelled = closed.filter((d) => d.stage === "kaybedildi" && d.lostReason === "İptal etti");
      if (closed.length === 0) return "Henüz sonuçlanmış bir randevunuz yok.";
      return `Tüm zamanlar iptal oranınız %${Math.round((cancelled.length / closed.length) * 100)} (${cancelled.length}/${closed.length}).`;
    },
  },
  {
    id: "top_customer_all_time",
    category: "Satış",
    label: "Tüm zamanlar en çok kazandıran müşterim kim?",
    keywords: ["tüm zamanlar en iyi müşteri", "genel en çok kazandıran müşteri"],
    compute: (ctx) => {
      const won = ctx.deals.filter((d) => d.stage === "kazanildi");
      if (won.length === 0) return "Henüz kazanılmış bir kaydınız yok.";
      const totals = {};
      won.forEach((d) => { totals[d.customerId] = (totals[d.customerId] || 0) + (d.value || 0); });
      const top = topEntry(totals);
      const customer = ctx.customers.find((c) => c.id === top[0]);
      return `${customer?.name || "Bilinmeyen müşteri"} — tüm zamanlar ${formatTL(top[1])} ile en çok kazandıran müşteriniz.`;
    },
  },
  {
    id: "top_customer_quarter",
    category: "Satış",
    label: "Bu çeyrek en çok kazandıran müşterim kim?",
    keywords: ["bu çeyrek en iyi müşteri", "çeyreklik en çok kazandıran"],
    compute: (ctx) => {
      const bounds = getRangeBounds("bu_ceyrek");
      const won = ctx.deals.filter((d) => d.stage === "kazanildi" && inRange(d.closedAt || d.createdAt, bounds));
      if (won.length === 0) return "Bu çeyrek henüz kazanılmış bir kaydınız yok.";
      const totals = {};
      won.forEach((d) => { totals[d.customerId] = (totals[d.customerId] || 0) + (d.value || 0); });
      const top = topEntry(totals);
      const customer = ctx.customers.find((c) => c.id === top[0]);
      return `${customer?.name || "Bilinmeyen müşteri"} — bu çeyrek ${formatTL(top[1])} ile en çok kazandıran müşteriniz.`;
    },
  },
  {
    id: "top_customer_year",
    category: "Satış",
    label: "Bu yıl en çok kazandıran müşterim kim?",
    keywords: ["bu yıl en iyi müşteri", "yıllık en çok kazandıran"],
    compute: (ctx) => {
      const bounds = getRangeBounds("bu_yil");
      const won = ctx.deals.filter((d) => d.stage === "kazanildi" && inRange(d.closedAt || d.createdAt, bounds));
      if (won.length === 0) return "Bu yıl henüz kazanılmış bir kaydınız yok.";
      const totals = {};
      won.forEach((d) => { totals[d.customerId] = (totals[d.customerId] || 0) + (d.value || 0); });
      const top = topEntry(totals);
      const customer = ctx.customers.find((c) => c.id === top[0]);
      return `${customer?.name || "Bilinmeyen müşteri"} — bu yıl ${formatTL(top[1])} ile en çok kazandıran müşteriniz.`;
    },
  },
  {
    id: "biggest_single_deal_ever",
    category: "Satış",
    label: "En büyük tek kazanılan kaydım hangisi?",
    keywords: ["en büyük kazanılan kayıt", "en yüksek tekli teklif", "rekor teklif"],
    compute: (ctx) => {
      const won = ctx.deals.filter((d) => d.stage === "kazanildi");
      if (won.length === 0) return "Henüz kazanılmış bir kaydınız yok.";
      const top = [...won].sort((a, b) => (b.value || 0) - (a.value || 0))[0];
      const customer = ctx.customers.find((c) => c.id === top.customerId);
      return `"${top.title}" (${customer?.name || "müşteri silinmiş"}) — ${formatTL(top.value)} ile en büyük kazanılan kaydınız.`;
    },
  },
  {
    id: "highest_value_customer_lifetime",
    category: "Satış",
    label: "En değerli müşterim kim (tüm zamanlar toplam)?",
    keywords: ["en değerli müşteri", "yaşam boyu değer", "en kârlı müşteri"],
    compute: (ctx) => {
      const won = ctx.deals.filter((d) => d.stage === "kazanildi");
      if (won.length === 0) return "Henüz kazanılmış bir kaydınız yok.";
      const totals = {};
      won.forEach((d) => { totals[d.customerId] = (totals[d.customerId] || 0) + (d.value || 0); });
      const top = topEntry(totals);
      const customer = ctx.customers.find((c) => c.id === top[0]);
      const count = won.filter((d) => d.customerId === top[0]).length;
      return `${customer?.name || "Bilinmeyen müşteri"} — bugüne kadar ${count} kayıtla toplam ${formatTL(top[1])} kazandırdı.`;
    },
  },
  {
    id: "deals_without_tag_count",
    category: "Satış",
    label: "Etiketi olmayan kaç kaydım var?",
    keywords: ["etiketsiz kayıt", "etiketi olmayan teklif"],
    compute: (ctx) => {
      const count = ctx.deals.filter((d) => !(d.tags && d.tags.length > 0)).length;
      return `Etiketi olmayan ${count} kaydınız var.`;
    },
  },
  {
    id: "deals_without_reminder_count",
    category: "Satış",
    label: "Hatırlatması olmayan kaç açık kaydım var?",
    keywords: ["hatırlatmasız kayıt", "hatırlatması olmayan teklif"],
    compute: (ctx) => {
      const open = ctx.deals.filter((d) => d.stage !== "kazanildi" && d.stage !== "kaybedildi");
      const count = open.filter((d) => !d.reminderDate).length;
      return open.length === 0 ? "Şu anda açık bir kaydınız yok." : `Açık kayıtlarınızdan ${count} tanesinde hatırlatma tarihi girilmemiş.`;
    },
  },
  {
    id: "top_tag_won_deals",
    category: "Satış",
    label: "Kazanılan kayıtlarda en çok kullanılan etiket hangisi?",
    keywords: ["kazanılan kayıt etiketi", "kazanılan tekliflerin etiketi"],
    compute: (ctx) => {
      const won = ctx.deals.filter((d) => d.stage === "kazanildi");
      const totals = {};
      won.forEach((d) => (d.tags || []).forEach((t) => { totals[t] = (totals[t] || 0) + 1; }));
      const top = topEntry(totals);
      return top ? `Kazanılan kayıtlarda en çok kullanılan etiket "${top[0]}" (${top[1]} kayıtta).` : "Kazanılan kayıtlarınıza henüz etiket eklenmemiş.";
    },
  },
  {
    id: "session_package_count",
    category: "Satış",
    label: "Seansı devam eden kaç paketim var?",
    keywords: ["devam eden paket", "seansı bitmeyen paket", "kalan seans"],
    visibleIf: (sector) => supportsSessionPackages(sector),
    compute: (ctx) => {
      const packages = ctx.deals.filter((d) => d.stage === "kazanildi" && d.sessionTotal != null && (d.sessionUsed || 0) < d.sessionTotal);
      return packages.length > 0 ? `Seansı bitmemiş ${packages.length} paketiniz var.` : "Seansı devam eden bir paketiniz şu anda yok.";
    },
  },
  {
    id: "avg_session_usage_rate",
    category: "Satış",
    label: "Seans paketlerimde ortalama kullanım oranı nedir?",
    keywords: ["ortalama seans kullanımı", "paket kullanım oranı"],
    visibleIf: (sector) => supportsSessionPackages(sector),
    compute: (ctx) => {
      const packages = ctx.deals.filter((d) => d.sessionTotal != null && d.sessionTotal > 0);
      if (packages.length === 0) return "Henüz seans paketi tanımlı bir kaydınız yok.";
      const avg = packages.reduce((sum, d) => sum + (d.sessionUsed || 0) / d.sessionTotal, 0) / packages.length;
      return `Seans paketlerinizde ortalama kullanım oranı %${Math.round(avg * 100)}.`;
    },
  },
  {
    id: "session_packages_near_completion",
    category: "Satış",
    label: "Son seansına gelmiş kaç paketim var?",
    keywords: ["son seans", "bitmek üzere olan paket", "yenileme fırsatı"],
    visibleIf: (sector) => supportsSessionPackages(sector),
    compute: (ctx) => {
      const near = ctx.deals.filter((d) => d.stage === "kazanildi" && d.sessionTotal != null && d.sessionTotal - (d.sessionUsed || 0) === 1);
      return near.length > 0 ? `Son seansına gelmiş ${near.length} paketiniz var — yenileme teklifi için iyi bir fırsat.` : "Son seansına gelmiş bir paketiniz şu anda yok.";
    },
  },
  {
    id: "unassigned_deals_count",
    category: "Satış",
    label: "Sorumlusu atanmamış kaç açık kaydım var?",
    keywords: ["sorumlusu olmayan kayıt", "atanmamış teklif"],
    compute: (ctx) => {
      const open = ctx.deals.filter((d) => d.stage !== "kazanildi" && d.stage !== "kaybedildi");
      const count = open.filter((d) => !d.assignedTo).length;
      return open.length === 0 ? "Şu anda açık bir kaydınız yok." : `Sorumlusu atanmamış ${count} açık kaydınız var.`;
    },
  },
  {
    id: "deals_missing_value_count",
    category: "Satış",
    label: "Tutarı girilmemiş kaç açık kaydım var?",
    keywords: ["tutarsız kayıt", "değeri girilmemiş teklif", "0 tl teklif"],
    compute: (ctx) => {
      const open = ctx.deals.filter((d) => d.stage !== "kazanildi" && d.stage !== "kaybedildi");
      const count = open.filter((d) => !d.value || d.value === 0).length;
      return open.length === 0 ? "Şu anda açık bir kaydınız yok." : `Tutarı girilmemiş (0 TL) ${count} açık kaydınız var.`;
    },
  },
  {
    id: "this_quarter_new_deals",
    category: "Satış",
    label: "Bu çeyrek kaç yeni kayıt oluşturdum?",
    keywords: ["bu çeyrek yeni kayıt", "çeyreklik yeni teklif sayısı"],
    compute: (ctx) => {
      const bounds = getRangeBounds("bu_ceyrek");
      const count = ctx.deals.filter((d) => inRange(d.createdAt, bounds)).length;
      return `Bu çeyrek ${count} yeni kayıt oluşturdunuz.`;
    },
  },
  {
    id: "this_year_new_deals",
    category: "Satış",
    label: "Bu yıl kaç yeni kayıt oluşturdum?",
    keywords: ["bu yıl yeni kayıt", "yıllık yeni teklif sayısı"],
    compute: (ctx) => {
      const bounds = getRangeBounds("bu_yil");
      const count = ctx.deals.filter((d) => inRange(d.createdAt, bounds)).length;
      return `Bu yıl ${count} yeni kayıt oluşturdunuz.`;
    },
  },
  {
    id: "last_year_revenue",
    category: "Satış",
    label: "Geçen yıl toplam ne kadar kazandım?",
    keywords: ["geçen yıl gelir", "geçen yılki toplam kazanç"],
    compute: (ctx) => {
      const now = new Date();
      const start = new Date(now.getFullYear() - 1, 0, 1);
      const end = new Date(now.getFullYear() - 1, 11, 31, 23, 59, 59, 999);
      const total = ctx.deals.filter((d) => d.stage === "kazanildi" && inRange(d.closedAt || d.createdAt, { start, end })).reduce((sum, d) => sum + (d.value || 0), 0);
      return `Geçen yıl toplam ${formatTL(total)} kazandınız.`;
    },
  },
  {
    id: "best_month_this_year",
    category: "Satış",
    label: "Bu yıl en iyi ayım hangisiydi?",
    keywords: ["en iyi ay", "yılın en iyi ayı", "en çok kazandığım ay"],
    compute: (ctx) => {
      const bounds = getRangeBounds("bu_yil");
      const won = ctx.deals.filter((d) => d.stage === "kazanildi" && inRange(d.closedAt || d.createdAt, bounds));
      if (won.length === 0) return "Bu yıl henüz kazanılmış bir kaydınız yok.";
      const totals = {};
      won.forEach((d) => {
        const date = new Date(d.closedAt || d.createdAt);
        const key = date.getMonth();
        totals[key] = (totals[key] || 0) + (d.value || 0);
      });
      const top = topEntry(totals);
      const monthNames = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
      return `Bu yılın en iyi ayı ${monthNames[Number(top[0])]} — ${formatTL(top[1])} kazandınız.`;
    },
  },
  {
    id: "avg_deal_cost_ratio",
    category: "Satış",
    label: "Kazanılan kayıtlarımda ortalama maliyet oranı nedir?",
    keywords: ["ortalama maliyet oranı", "maliyet yüzdesi"],
    compute: (ctx) => {
      const won = ctx.deals.filter((d) => d.stage === "kazanildi" && (d.value || 0) > 0);
      if (won.length === 0) return "Henüz kazanılmış bir kaydınız yok.";
      const avg = won.reduce((sum, d) => sum + (d.cost || 0) / d.value, 0) / won.length;
      return `Kazanılan kayıtlarınızda ortalama maliyet oranınız %${Math.round(avg * 100)}.`;
    },
  },
  {
    id: "deals_with_cost_count",
    category: "Satış",
    label: "Maliyeti girilmiş kaç kazanılan kaydım var?",
    keywords: ["maliyetli kayıt", "maliyeti olan teklif sayısı"],
    compute: (ctx) => {
      const won = ctx.deals.filter((d) => d.stage === "kazanildi");
      const withCost = won.filter((d) => (d.cost || 0) > 0).length;
      return won.length === 0 ? "Henüz kazanılmış bir kaydınız yok." : `Kazanılan ${won.length} kaydınızdan ${withCost} tanesinde maliyet girilmiş.`;
    },
  },
  {
    id: "quarter_over_quarter_change",
    category: "Satış",
    label: "Bu çeyrek geçen çeyreğe göre nasıl gidiyorum?",
    keywords: ["çeyrek karşılaştırması", "çeyrekten çeyreğe değişim"],
    compute: (ctx) => {
      const now = new Date();
      const qStartMonth = Math.floor(now.getMonth() / 3) * 3;
      const thisQStart = new Date(now.getFullYear(), qStartMonth, 1);
      const lastQStart = new Date(now.getFullYear(), qStartMonth - 3, 1);
      const lastQEnd = new Date(thisQStart.getTime() - 1);
      const thisQ = ctx.deals.filter((d) => d.stage === "kazanildi" && inRange(d.closedAt || d.createdAt, { start: thisQStart, end: getRangeBounds("bu_ceyrek").end })).reduce((sum, d) => sum + (d.value || 0), 0);
      const lastQ = ctx.deals.filter((d) => d.stage === "kazanildi" && inRange(d.closedAt || d.createdAt, { start: lastQStart, end: lastQEnd })).reduce((sum, d) => sum + (d.value || 0), 0);
      if (lastQ === 0) return `Geçen çeyrek kazancınız yoktu, bu çeyrek ${formatTL(thisQ)} kazandınız.`;
      const change = Math.round(((thisQ - lastQ) / lastQ) * 100);
      return `Bu çeyrek ${formatTL(thisQ)}, geçen çeyrek ${formatTL(lastQ)} kazandınız (%${change > 0 ? "+" : ""}${change} değişim).`;
    },
  },
  {
    id: "deals_open_over_30_days_count",
    category: "Satış",
    label: "30 günden uzun süredir açık kaç kaydım var?",
    keywords: ["30 günden eski açık kayıt", "uzun süredir açık teklifler"],
    compute: (ctx) => {
      const open = ctx.deals.filter((d) => d.stage !== "kazanildi" && d.stage !== "kaybedildi");
      const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
      const count = open.filter((d) => new Date(d.createdAt).getTime() < cutoff).length;
      return open.length === 0 ? "Şu anda açık bir kaydınız yok." : `30 günden uzun süredir açık ${count} kaydınız var.`;
    },
  },
  {
    id: "deals_stalled_in_negotiation_count",
    category: "Satış",
    label: "Müzakere aşamasında kaç kaydım var?",
    keywords: ["müzakerede kaç kayıt", "pazarlık aşamasındaki kayıtlar"],
    compute: (ctx) => {
      const count = ctx.deals.filter((d) => d.stage === "muzakere").length;
      return `${stageLabel("muzakere", "kurumsal", ctx.companySettings?.sector)} aşamasında ${count} kaydınız var.`;
    },
  },

  // ---- Müşteri ----
  {
    id: "customers_by_region_breakdown",
    category: "Müşteri",
    label: "Bölgelere göre müşteri dağılımım nasıl?",
    keywords: ["bölge dağılımı tam liste", "bölgelere göre müşteri sayısı"],
    compute: (ctx) => {
      const totals = {};
      ctx.customers.forEach((c) => { if (c.region) totals[c.region] = (totals[c.region] || 0) + 1; });
      const entries = Object.entries(totals).sort((a, b) => b[1] - a[1]);
      return entries.length > 0 ? entries.map(([k, v]) => `${k}: ${v}`).join(", ") : "Müşterilerinizde henüz bölge bilgisi girilmemiş.";
    },
  },
  {
    id: "customers_by_sector_breakdown",
    category: "Müşteri",
    label: "Sektörlere göre müşteri dağılımım nasıl?",
    keywords: ["sektör dağılımı tam liste", "sektörlere göre müşteri sayısı"],
    compute: (ctx) => {
      const totals = {};
      ctx.customers.forEach((c) => { if (c.sector) totals[c.sector] = (totals[c.sector] || 0) + 1; });
      const entries = Object.entries(totals).sort((a, b) => b[1] - a[1]);
      return entries.length > 0 ? entries.map(([k, v]) => `${k}: ${v}`).join(", ") : "Müşterilerinizde henüz sektör bilgisi girilmemiş.";
    },
  },
  {
    id: "customers_with_open_deal_count",
    category: "Müşteri",
    label: "Açık kaydı olan kaç müşterim var?",
    keywords: ["açık kaydı olan müşteri", "bekleyen teklifi olan müşteri sayısı"],
    compute: (ctx) => {
      const open = ctx.deals.filter((d) => d.stage !== "kazanildi" && d.stage !== "kaybedildi");
      const ids = new Set(open.map((d) => d.customerId));
      return `${ids.size} müşterinizin açık bir kaydı var.`;
    },
  },
  {
    id: "customers_without_any_deal",
    category: "Müşteri",
    label: "Hiç kaydı olmayan kaç müşterim var?",
    keywords: ["kaydı olmayan müşteri", "hiç teklifi olmayan müşteri"],
    compute: (ctx) => {
      const withDeal = new Set(ctx.deals.map((d) => d.customerId));
      const count = ctx.customers.filter((c) => !withDeal.has(c.id)).length;
      return count > 0 ? `${count} müşterinizin hiç kaydı yok.` : "Tüm müşterilerinizin en az bir kaydı var.";
    },
  },
  {
    id: "customers_added_this_quarter",
    category: "Müşteri",
    label: "Bu çeyrek kaç yeni müşteri kazandım?",
    keywords: ["bu çeyrek yeni müşteri", "çeyreklik yeni müşteri sayısı"],
    compute: (ctx) => {
      const bounds = getRangeBounds("bu_ceyrek");
      return `Bu çeyrek ${ctx.customers.filter((c) => inRange(c.createdAt, bounds)).length} yeni müşteri kazandınız.`;
    },
  },
  {
    id: "customers_added_this_year",
    category: "Müşteri",
    label: "Bu yıl kaç yeni müşteri kazandım?",
    keywords: ["bu yıl yeni müşteri", "yıllık yeni müşteri sayısı"],
    compute: (ctx) => {
      const bounds = getRangeBounds("bu_yil");
      return `Bu yıl ${ctx.customers.filter((c) => inRange(c.createdAt, bounds)).length} yeni müşteri kazandınız.`;
    },
  },
  {
    id: "customers_added_last_month",
    category: "Müşteri",
    label: "Geçen ay kaç yeni müşteri kazandım?",
    keywords: ["geçen ay yeni müşteri", "geçen ayki yeni müşteri sayısı"],
    compute: (ctx) => {
      const now = new Date();
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
      return `Geçen ay ${ctx.customers.filter((c) => inRange(c.createdAt, { start, end })).length} yeni müşteri kazandınız.`;
    },
  },
  {
    id: "customers_added_this_week",
    category: "Müşteri",
    label: "Bu hafta kaç yeni müşteri kazandım?",
    keywords: ["bu hafta yeni müşteri", "haftalık yeni müşteri sayısı"],
    compute: (ctx) => {
      const now = new Date();
      const start = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000);
      start.setHours(0, 0, 0, 0);
      return `Son 7 günde ${ctx.customers.filter((c) => inRange(c.createdAt, { start, end: now })).length} yeni müşteri kazandınız.`;
    },
  },
  {
    id: "avg_customer_age_days",
    category: "Müşteri",
    label: "Müşterilerim ortalama ne kadar süredir kayıtlı?",
    keywords: ["ortalama müşteri yaşı", "müşteri kayıt süresi"],
    compute: (ctx) => {
      if (ctx.customers.length === 0) return "Henüz müşteriniz yok.";
      const avgDays = ctx.customers.reduce((sum, c) => sum + (Date.now() - new Date(c.createdAt).getTime()) / (24 * 60 * 60 * 1000), 0) / ctx.customers.length;
      return `Müşterileriniz ortalama ${Math.round(avgDays)} gündür sisteminizde kayıtlı.`;
    },
  },
  {
    id: "customer_with_most_deals",
    category: "Müşteri",
    label: "En çok kaydı olan müşterim kim?",
    keywords: ["en çok kayıt olan müşteri", "en fazla teklifi olan müşteri"],
    compute: (ctx) => {
      if (ctx.deals.length === 0) return "Henüz bir kaydınız yok.";
      const totals = {};
      ctx.deals.forEach((d) => { totals[d.customerId] = (totals[d.customerId] || 0) + 1; });
      const top = topEntry(totals);
      const customer = ctx.customers.find((c) => c.id === top[0]);
      return `${customer?.name || "Bilinmeyen müşteri"} — ${top[1]} kayıtla en çok kaydı olan müşteriniz.`;
    },
  },
  {
    id: "customer_with_highest_single_deal",
    category: "Müşteri",
    label: "Hangi müşterimle en yüksek tutarlı tek kayıt yaptım?",
    keywords: ["en yüksek tutarlı müşteri kaydı", "tekli en büyük kayıt hangi müşteri"],
    compute: (ctx) => {
      if (ctx.deals.length === 0) return "Henüz bir kaydınız yok.";
      const top = [...ctx.deals].sort((a, b) => (b.value || 0) - (a.value || 0))[0];
      const customer = ctx.customers.find((c) => c.id === top.customerId);
      return `${customer?.name || "Bilinmeyen müşteri"} — "${top.title}" kaydı ${formatTL(top.value)} ile en yüksek tutarlı tekli kaydınız.`;
    },
  },
  {
    id: "customers_missing_region",
    category: "Müşteri",
    label: "Bölgesi girilmemiş kaç müşterim var?",
    keywords: ["bölgesi olmayan müşteri", "bölge bilgisi eksik"],
    compute: (ctx) => `Bölgesi girilmemiş ${ctx.customers.filter((c) => !c.region).length} müşteriniz var.`,
  },
  {
    id: "customers_missing_notes",
    category: "Müşteri",
    label: "Notu girilmemiş kaç müşterim var?",
    keywords: ["notu olmayan müşteri", "not eksik müşteri"],
    compute: (ctx) => `Notu girilmemiş ${ctx.customers.filter((c) => !c.notes).length} müşteriniz var.`,
  },
  {
    id: "customers_with_portal_access",
    category: "Müşteri",
    label: "Kaç müşterim portala kayıt olmuş?",
    keywords: ["portala kayıtlı müşteri", "müşteri portalı kullanan"],
    compute: (ctx) => {
      const count = ctx.customers.filter((c) => c.portalUserId).length;
      return count > 0 ? `${count} müşteriniz kendi portal hesabını oluşturmuş.` : "Henüz portala kayıt olan bir müşteriniz yok.";
    },
  },
  {
    id: "customers_without_portal_access",
    category: "Müşteri",
    label: "Kaç müşterim henüz portala kayıt olmamış?",
    keywords: ["portala kayıt olmamış müşteri", "portalsız müşteri"],
    compute: (ctx) => {
      if (ctx.customers.length === 0) return "Henüz müşteriniz yok.";
      const count = ctx.customers.filter((c) => !c.portalUserId).length;
      return `${count} müşteriniz henüz portala kayıt olmamış.`;
    },
  },
  {
    id: "customer_tags_breakdown",
    category: "Müşteri",
    label: "Müşteri etiketlerimin tam dağılımı nasıl?",
    keywords: ["müşteri etiket dağılımı tam liste", "tüm müşteri etiketleri"],
    compute: (ctx) => {
      const totals = {};
      ctx.customers.forEach((c) => (c.tags || []).forEach((t) => { totals[t] = (totals[t] || 0) + 1; }));
      const entries = Object.entries(totals).sort((a, b) => b[1] - a[1]);
      return entries.length > 0 ? entries.map(([k, v]) => `${k}: ${v}`).join(", ") : "Henüz hiçbir müşterinize etiket eklenmemiş.";
    },
  },
  {
    id: "customers_without_tags_count",
    category: "Müşteri",
    label: "Etiketi olmayan kaç müşterim var?",
    keywords: ["etiketsiz müşteri", "etiketi olmayan müşteri sayısı"],
    compute: (ctx) => `Etiketi olmayan ${ctx.customers.filter((c) => !(c.tags && c.tags.length > 0)).length} müşteriniz var.`,
  },
  {
    id: "longest_inactive_customer",
    category: "Müşteri",
    label: "En uzun süredir temas etmediğim müşterim kim?",
    keywords: ["en uzun süredir temas edilmeyen", "en soğuk müşteri"],
    compute: (ctx) => {
      const withContact = ctx.customers.filter((c) => c.lastContact);
      if (withContact.length === 0) return "Henüz temas tarihi girilmiş bir müşteriniz yok.";
      const oldest = [...withContact].sort((a, b) => new Date(a.lastContact) - new Date(b.lastContact))[0];
      const days = Math.floor((Date.now() - new Date(oldest.lastContact).getTime()) / (24 * 60 * 60 * 1000));
      return `${oldest.name} — ${days} gündür temas edilmemiş.`;
    },
  },
  {
    id: "customers_contacted_this_week",
    category: "Müşteri",
    label: "Bu hafta kaç müşteriyle temas ettim?",
    keywords: ["bu hafta temas edilen müşteri", "haftalık temas sayısı"],
    compute: (ctx) => {
      const now = new Date();
      const start = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000);
      start.setHours(0, 0, 0, 0);
      const count = ctx.customers.filter((c) => inRange(c.lastContact, { start, end: now })).length;
      return `Son 7 günde ${count} müşteriyle temas ettiniz.`;
    },
  },
  {
    id: "customers_never_contacted",
    category: "Müşteri",
    label: "Hiç temas kaydı olmayan kaç müşterim var?",
    keywords: ["hiç temas edilmemiş müşteri", "temas kaydı olmayan"],
    compute: (ctx) => {
      const count = ctx.customers.filter((c) => !c.lastContact).length;
      return count > 0 ? `${count} müşterinizde hiç son temas tarihi girilmemiş.` : "Tüm müşterilerinizde son temas tarihi girilmiş.";
    },
  },
  {
    id: "individual_vs_corporate_revenue",
    category: "Müşteri",
    label: "Kurumsal mı bireysel müşterilerden mi daha çok kazanıyorum?",
    keywords: ["kurumsal bireysel gelir karşılaştırması", "müşteri türüne göre gelir"],
    compute: (ctx) => {
      const won = ctx.deals.filter((d) => d.stage === "kazanildi");
      if (won.length === 0) return "Henüz kazanılmış bir kaydınız yok.";
      let kurumsal = 0, bireysel = 0;
      won.forEach((d) => {
        const customer = ctx.customers.find((c) => c.id === d.customerId);
        if (customer?.customerType === "bireysel") bireysel += (d.value || 0);
        else kurumsal += (d.value || 0);
      });
      return `Kurumsal müşterilerden ${formatTL(kurumsal)}, bireysel müşterilerden ${formatTL(bireysel)} kazandınız.`;
    },
  },
  {
    id: "top_region_revenue",
    category: "Müşteri",
    label: "En çok gelir getiren bölge hangisi?",
    keywords: ["en çok kazandıran bölge", "bölgeye göre gelir"],
    compute: (ctx) => {
      const won = ctx.deals.filter((d) => d.stage === "kazanildi");
      if (won.length === 0) return "Henüz kazanılmış bir kaydınız yok.";
      const totals = {};
      won.forEach((d) => {
        const customer = ctx.customers.find((c) => c.id === d.customerId);
        if (customer?.region) totals[customer.region] = (totals[customer.region] || 0) + (d.value || 0);
      });
      const top = topEntry(totals);
      return top ? `En çok gelir getiren bölgeniz "${top[0]}" (${formatTL(top[1])}).` : "Kazanılan kayıtlarınızdaki müşterilerde henüz bölge bilgisi girilmemiş.";
    },
  },
  {
    id: "top_customer_sector_revenue",
    category: "Müşteri",
    label: "En çok gelir getiren müşteri sektörü hangisi?",
    keywords: ["en çok kazandıran müşteri sektörü", "müşteri sektörüne göre gelir"],
    compute: (ctx) => {
      const won = ctx.deals.filter((d) => d.stage === "kazanildi");
      if (won.length === 0) return "Henüz kazanılmış bir kaydınız yok.";
      const totals = {};
      won.forEach((d) => {
        const customer = ctx.customers.find((c) => c.id === d.customerId);
        if (customer?.sector) totals[customer.sector] = (totals[customer.sector] || 0) + (d.value || 0);
      });
      const top = topEntry(totals);
      return top ? `En çok gelir getiren müşteri sektörünüz "${top[0]}" (${formatTL(top[1])}).` : "Kazanılan kayıtlarınızdaki müşterilerde henüz sektör bilgisi girilmemiş.";
    },
  },
  {
    id: "customers_complete_profile_count",
    category: "Müşteri",
    label: "Hem telefonu hem e-postası olan kaç müşterim var?",
    keywords: ["tam dolu müşteri profili", "eksiksiz müşteri bilgisi"],
    compute: (ctx) => {
      if (ctx.customers.length === 0) return "Henüz müşteriniz yok.";
      const count = ctx.customers.filter((c) => c.phone && c.email).length;
      return `${count} müşterinizin hem telefonu hem e-postası kayıtlı (toplam ${ctx.customers.length} müşteriden).`;
    },
  },
  {
    id: "customer_growth_rate_mom",
    category: "Müşteri",
    label: "Müşteri kazanma hızım geçen aya göre nasıl değişti?",
    keywords: ["müşteri büyüme oranı", "geçen aya göre yeni müşteri değişimi"],
    compute: (ctx) => {
      const now = new Date();
      const thisBounds = getRangeBounds("bu_ay");
      const lastStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lastEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
      const thisMonth = ctx.customers.filter((c) => inRange(c.createdAt, thisBounds)).length;
      const lastMonth = ctx.customers.filter((c) => inRange(c.createdAt, { start: lastStart, end: lastEnd })).length;
      if (lastMonth === 0) return `Geçen ay yeni müşteriniz yoktu, bu ay ${thisMonth} yeni müşteri kazandınız.`;
      const change = Math.round(((thisMonth - lastMonth) / lastMonth) * 100);
      return `Bu ay ${thisMonth}, geçen ay ${lastMonth} yeni müşteri kazandınız (%${change > 0 ? "+" : ""}${change} değişim).`;
    },
  },
  {
    id: "top_customer_by_deal_count_quarter",
    category: "Müşteri",
    label: "Bu çeyrek en çok kayıt açtığım müşteri kim?",
    keywords: ["bu çeyrek en çok kayıt açılan müşteri", "çeyreklik en aktif müşteri"],
    compute: (ctx) => {
      const bounds = getRangeBounds("bu_ceyrek");
      const deals = ctx.deals.filter((d) => inRange(d.createdAt, bounds));
      if (deals.length === 0) return "Bu çeyrek henüz yeni bir kaydınız yok.";
      const totals = {};
      deals.forEach((d) => { totals[d.customerId] = (totals[d.customerId] || 0) + 1; });
      const top = topEntry(totals);
      const customer = ctx.customers.find((c) => c.id === top[0]);
      return `${customer?.name || "Bilinmeyen müşteri"} — bu çeyrek ${top[1]} yeni kayıtla en çok kayıt açtığınız müşteri.`;
    },
  },
  {
    id: "customers_inactive_180_days",
    category: "Müşteri",
    label: "180 gündür işlem yapmayan kaç müşterim var?",
    keywords: ["180 gün işlem yapmayan müşteri", "6 aydır alışverişi olmayan müşteri"],
    compute: (ctx) => {
      const won = ctx.deals.filter((d) => d.stage === "kazanildi");
      const everWonCustomerIds = new Set(won.map((d) => d.customerId));
      if (everWonCustomerIds.size === 0) return "Henüz kazanılmış bir kaydınız yok.";
      const cutoff = Date.now() - 180 * 24 * 60 * 60 * 1000;
      const recentCustomerIds = new Set(won.filter((d) => new Date(d.closedAt || d.createdAt).getTime() >= cutoff).map((d) => d.customerId));
      const inactiveCount = [...everWonCustomerIds].filter((id) => !recentCustomerIds.has(id)).length;
      return `${inactiveCount} müşteriniz son 180 gündür işlem yapmadı (toplam ${everWonCustomerIds.size} müşteriden).`;
    },
  },
  {
    id: "repeat_customers_count",
    category: "Müşteri",
    label: "Birden fazla kazanılan kaydı olan kaç müşterim var?",
    keywords: ["tekrar eden müşteri", "birden fazla kez satın alan müşteri"],
    compute: (ctx) => {
      const won = ctx.deals.filter((d) => d.stage === "kazanildi");
      if (won.length === 0) return "Henüz kazanılmış bir kaydınız yok.";
      const totals = {};
      won.forEach((d) => { totals[d.customerId] = (totals[d.customerId] || 0) + 1; });
      const repeatCount = Object.values(totals).filter((v) => v > 1).length;
      return `${repeatCount} müşteriniz birden fazla kez sizden satın aldı.`;
    },
  },
  {
    id: "one_time_customers_count",
    category: "Müşteri",
    label: "Sadece bir kez satın alan kaç müşterim var?",
    keywords: ["tek seferlik müşteri", "bir kez satın alan müşteri"],
    compute: (ctx) => {
      const won = ctx.deals.filter((d) => d.stage === "kazanildi");
      if (won.length === 0) return "Henüz kazanılmış bir kaydınız yok.";
      const totals = {};
      won.forEach((d) => { totals[d.customerId] = (totals[d.customerId] || 0) + 1; });
      const oneTimeCount = Object.values(totals).filter((v) => v === 1).length;
      return `${oneTimeCount} müşteriniz sizden yalnızca bir kez satın aldı.`;
    },
  },
  {
    id: "avg_deals_per_customer",
    category: "Müşteri",
    label: "Müşteri başına ortalama kaç kaydım var?",
    keywords: ["müşteri başına ortalama kayıt", "müşteri başına teklif sayısı"],
    compute: (ctx) => {
      if (ctx.customers.length === 0) return "Henüz müşteriniz yok.";
      return `Müşteri başına ortalama ${(ctx.deals.length / ctx.customers.length).toFixed(1)} kaydınız var.`;
    },
  },

  // ---- Finans ----
  {
    id: "collected_this_quarter",
    category: "Finans",
    label: "Bu çeyrek ne kadar tahsilat aldım?",
    keywords: ["bu çeyrek tahsilat", "çeyreklik tahsilat"],
    compute: (ctx) => {
      const bounds = getRangeBounds("bu_ceyrek");
      const total = ctx.payments.filter((p) => inRange(p.paidAt, bounds)).reduce((sum, p) => sum + (p.amount || 0), 0);
      return `Bu çeyrek toplam ${formatTL(total)} tahsilat aldınız.`;
    },
  },
  {
    id: "collected_this_year",
    category: "Finans",
    label: "Bu yıl ne kadar tahsilat aldım?",
    keywords: ["bu yıl tahsilat", "yıllık tahsilat"],
    compute: (ctx) => {
      const bounds = getRangeBounds("bu_yil");
      const total = ctx.payments.filter((p) => inRange(p.paidAt, bounds)).reduce((sum, p) => sum + (p.amount || 0), 0);
      return `Bu yıl toplam ${formatTL(total)} tahsilat aldınız.`;
    },
  },
  {
    id: "collected_last_year",
    category: "Finans",
    label: "Geçen yıl ne kadar tahsilat aldım?",
    keywords: ["geçen yıl tahsilat", "geçen yılki toplam tahsilat"],
    compute: (ctx) => {
      const now = new Date();
      const start = new Date(now.getFullYear() - 1, 0, 1);
      const end = new Date(now.getFullYear() - 1, 11, 31, 23, 59, 59, 999);
      const total = ctx.payments.filter((p) => inRange(p.paidAt, { start, end })).reduce((sum, p) => sum + (p.amount || 0), 0);
      return `Geçen yıl toplam ${formatTL(total)} tahsilat aldınız.`;
    },
  },
  {
    id: "weekly_collection_this_week",
    category: "Finans",
    label: "Son 7 günde ne kadar tahsilat aldım?",
    keywords: ["son 7 gün tahsilat", "haftalık tahsilat"],
    compute: (ctx) => {
      const now = new Date();
      const start = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000);
      start.setHours(0, 0, 0, 0);
      const total = ctx.payments.filter((p) => inRange(p.paidAt, { start, end: now })).reduce((sum, p) => sum + (p.amount || 0), 0);
      return `Son 7 günde toplam ${formatTL(total)} tahsilat aldınız.`;
    },
  },
  {
    id: "mom_collection_change",
    category: "Finans",
    label: "Tahsilatım geçen aya göre nasıl değişti?",
    keywords: ["geçen aya göre tahsilat değişimi", "tahsilat kıyaslama"],
    compute: (ctx) => {
      const now = new Date();
      const thisMonthBounds = getRangeBounds("bu_ay");
      const lastStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lastEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
      const thisTotal = ctx.payments.filter((p) => inRange(p.paidAt, thisMonthBounds)).reduce((sum, p) => sum + (p.amount || 0), 0);
      const lastTotal = ctx.payments.filter((p) => inRange(p.paidAt, { start: lastStart, end: lastEnd })).reduce((sum, p) => sum + (p.amount || 0), 0);
      if (lastTotal === 0) return thisTotal > 0 ? `Geçen ay tahsilatınız yoktu, bu ay ${formatTL(thisTotal)} tahsilat aldınız.` : "Bu ay ve geçen ay tahsilatınız yok.";
      const change = Math.round(((thisTotal - lastTotal) / lastTotal) * 100);
      return `Bu ayki tahsilatınız geçen aya göre %${change > 0 ? "+" : ""}${change} değişti (${formatTL(thisTotal)} / ${formatTL(lastTotal)}).`;
    },
  },
  {
    id: "net_remaining_quarter",
    category: "Finans",
    label: "Bu çeyrek net kârım ne kadar?",
    keywords: ["bu çeyrek net kâr", "çeyreklik net kalan"],
    compute: (ctx) => {
      const bounds = getRangeBounds("bu_ceyrek");
      const income = ctx.payments.filter((p) => inRange(p.paidAt, bounds)).reduce((sum, p) => sum + (p.amount || 0), 0);
      const expense = ctx.companyExpenses.flatMap((e) => expandExpenseOccurrences(e, bounds)).reduce((sum, e) => sum + (e.amount || 0), 0);
      const dealCost = ctx.deals.filter((d) => d.stage === "kazanildi" && (d.cost || 0) > 0 && inRange(d.closedAt || d.createdAt, bounds)).reduce((sum, d) => sum + (d.cost || 0), 0);
      const net = income - expense - dealCost;
      return `Bu çeyrek net kalanınız ${formatTL(net)} (${formatTL(income)} gelir − ${formatTL(expense + dealCost)} gider).`;
    },
  },
  {
    id: "net_remaining_year",
    category: "Finans",
    label: "Bu yıl net kârım ne kadar?",
    keywords: ["bu yıl net kâr", "yıllık net kalan"],
    compute: (ctx) => {
      const bounds = getRangeBounds("bu_yil");
      const income = ctx.payments.filter((p) => inRange(p.paidAt, bounds)).reduce((sum, p) => sum + (p.amount || 0), 0);
      const expense = ctx.companyExpenses.flatMap((e) => expandExpenseOccurrences(e, bounds)).reduce((sum, e) => sum + (e.amount || 0), 0);
      const dealCost = ctx.deals.filter((d) => d.stage === "kazanildi" && (d.cost || 0) > 0 && inRange(d.closedAt || d.createdAt, bounds)).reduce((sum, d) => sum + (d.cost || 0), 0);
      const net = income - expense - dealCost;
      return `Bu yıl net kalanınız ${formatTL(net)} (${formatTL(income)} gelir − ${formatTL(expense + dealCost)} gider).`;
    },
  },
  {
    id: "net_remaining_all_time",
    category: "Finans",
    label: "Tüm zamanlar net kârım ne kadar?",
    keywords: ["tüm zamanlar net kâr", "genel net kalan"],
    compute: (ctx) => {
      const bounds = getRangeBounds("tum_zamanlar");
      const income = ctx.payments.filter((p) => inRange(p.paidAt, bounds)).reduce((sum, p) => sum + (p.amount || 0), 0);
      const expense = ctx.companyExpenses.flatMap((e) => expandExpenseOccurrences(e, bounds)).reduce((sum, e) => sum + (e.amount || 0), 0);
      const dealCost = ctx.deals.filter((d) => d.stage === "kazanildi" && (d.cost || 0) > 0 && inRange(d.closedAt || d.createdAt, bounds)).reduce((sum, d) => sum + (d.cost || 0), 0);
      const net = income - expense - dealCost;
      return `Tüm zamanlar net kalanınız ${formatTL(net)} (${formatTL(income)} gelir − ${formatTL(expense + dealCost)} gider).`;
    },
  },
  {
    id: "total_expense_all_time",
    category: "Finans",
    label: "Tüm zamanlar toplam giderim ne kadar?",
    keywords: ["tüm zamanlar gider", "genel toplam gider"],
    compute: (ctx) => {
      const bounds = getRangeBounds("tum_zamanlar");
      const expense = ctx.companyExpenses.flatMap((e) => expandExpenseOccurrences(e, bounds)).reduce((sum, e) => sum + (e.amount || 0), 0);
      const dealCost = ctx.deals.filter((d) => d.stage === "kazanildi" && (d.cost || 0) > 0).reduce((sum, d) => sum + (d.cost || 0), 0);
      return `Tüm zamanlar toplam gideriniz ${formatTL(expense + dealCost)}.`;
    },
  },
  {
    id: "total_expense_this_quarter",
    category: "Finans",
    label: "Bu çeyrek toplam giderim ne kadar?",
    keywords: ["bu çeyrek gider", "çeyreklik toplam gider"],
    compute: (ctx) => {
      const bounds = getRangeBounds("bu_ceyrek");
      const expense = ctx.companyExpenses.flatMap((e) => expandExpenseOccurrences(e, bounds)).reduce((sum, e) => sum + (e.amount || 0), 0);
      const dealCost = ctx.deals.filter((d) => d.stage === "kazanildi" && (d.cost || 0) > 0 && inRange(d.closedAt || d.createdAt, bounds)).reduce((sum, d) => sum + (d.cost || 0), 0);
      return `Bu çeyrek toplam gideriniz ${formatTL(expense + dealCost)}.`;
    },
  },
  {
    id: "avg_monthly_expense_6m",
    category: "Finans",
    label: "Son 6 ayda aylık ortalama giderim ne kadar?",
    keywords: ["aylık ortalama gider", "son 6 ay ortalama gider"],
    compute: (ctx) => {
      const bounds = getRangeBounds("son_6_ay");
      const total = ctx.companyExpenses.flatMap((e) => expandExpenseOccurrences(e, bounds)).reduce((sum, e) => sum + (e.amount || 0), 0);
      return `Son 6 ayda aylık ortalama gideriniz ${formatTL(total / 6)}.`;
    },
  },
  {
    id: "yearly_fixed_expense",
    category: "Finans",
    label: "Yıllık sabit (tekrarlayan) gider toplamım ne kadar?",
    keywords: ["yıllık sabit gider", "yıllık tekrarlayan gider"],
    compute: (ctx) => {
      const total = ctx.companyExpenses.filter((e) => e.isRecurring && e.recurrenceInterval === "yearly").reduce((sum, e) => sum + (e.amount || 0), 0);
      return `Yıllık tekrarlayan gider toplamınız ${formatTL(total)}.`;
    },
  },
  {
    id: "daily_recurring_expense_count",
    category: "Finans",
    label: "Kaç tane günlük tekrarlayan giderim var?",
    keywords: ["günlük tekrarlayan gider", "kaç günlük gider"],
    compute: (ctx) => `${ctx.companyExpenses.filter((e) => e.isRecurring && e.recurrenceInterval === "daily").length} günlük tekrarlayan gideriniz var.`,
  },
  {
    id: "expense_count_total",
    category: "Finans",
    label: "Toplam kaç gider kaydım var?",
    keywords: ["toplam gider kaydı sayısı", "kaç gider girdim"],
    compute: (ctx) => `Toplam ${ctx.companyExpenses.length} gider kaydınız var (tekrarlayanlar tek kayıt sayılır).`,
  },
  {
    id: "expense_categories_breakdown_month",
    category: "Finans",
    label: "Bu ay tüm gider kategorilerim nasıl dağılıyor?",
    keywords: ["gider kategorisi tam liste bu ay", "bu ay kategori dağılımı"],
    compute: (ctx) => {
      const bounds = getRangeBounds("bu_ay");
      const occurrences = ctx.companyExpenses.flatMap((e) => expandExpenseOccurrences(e, bounds));
      if (occurrences.length === 0) return "Bu ay henüz kayıtlı bir gideriniz yok.";
      const totals = {};
      occurrences.forEach((e) => { totals[e.category] = (totals[e.category] || 0) + (e.amount || 0); });
      return Object.entries(totals).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}: ${formatTL(v)}`).join(", ");
    },
  },
  {
    id: "expense_categories_breakdown_year",
    category: "Finans",
    label: "Bu yıl tüm gider kategorilerim nasıl dağılıyor?",
    keywords: ["gider kategorisi tam liste yıl", "bu yıl kategori dağılımı"],
    compute: (ctx) => {
      const bounds = getRangeBounds("bu_yil");
      const occurrences = ctx.companyExpenses.flatMap((e) => expandExpenseOccurrences(e, bounds));
      if (occurrences.length === 0) return "Bu yıl henüz kayıtlı bir gideriniz yok.";
      const totals = {};
      occurrences.forEach((e) => { totals[e.category] = (totals[e.category] || 0) + (e.amount || 0); });
      return Object.entries(totals).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}: ${formatTL(v)}`).join(", ");
    },
  },
  {
    id: "biggest_expense_category_year",
    category: "Finans",
    label: "Bu yıl en çok hangi kategoriye gider yaptım?",
    keywords: ["bu yıl en çok gider kategorisi", "yıllık en büyük gider kategorisi"],
    compute: (ctx) => {
      const bounds = getRangeBounds("bu_yil");
      const occurrences = ctx.companyExpenses.flatMap((e) => expandExpenseOccurrences(e, bounds));
      if (occurrences.length === 0) return "Bu yıl henüz kayıtlı bir gideriniz yok.";
      const totals = {};
      occurrences.forEach((e) => { totals[e.category] = (totals[e.category] || 0) + (e.amount || 0); });
      const top = topEntry(totals);
      return `Bu yıl en çok "${top[0]}" kategorisine gider yaptınız (${formatTL(top[1])}).`;
    },
  },
  {
    id: "biggest_single_expense",
    category: "Finans",
    label: "En büyük tek giderim hangisi?",
    keywords: ["en büyük tek gider", "en yüksek gider kaydı"],
    compute: (ctx) => {
      if (ctx.companyExpenses.length === 0) return "Henüz kayıtlı bir gideriniz yok.";
      const top = [...ctx.companyExpenses].sort((a, b) => (b.amount || 0) - (a.amount || 0))[0];
      return `En büyük tek gider kaydınız "${top.title}" — ${formatTL(top.amount)}.`;
    },
  },
  {
    id: "payments_count_this_month",
    category: "Finans",
    label: "Bu ay kaç tahsilat işlemi yaptım?",
    keywords: ["bu ay tahsilat sayısı", "bu ay kaç ödeme aldım"],
    compute: (ctx) => {
      const bounds = getRangeBounds("bu_ay");
      const count = ctx.payments.filter((p) => inRange(p.paidAt, bounds)).length;
      return `Bu ay ${count} tahsilat işlemi yaptınız.`;
    },
  },
  {
    id: "payments_count_all_time",
    category: "Finans",
    label: "Tüm zamanlar kaç tahsilat işlemi yaptım?",
    keywords: ["tüm zamanlar tahsilat sayısı", "toplam ödeme işlemi sayısı"],
    compute: (ctx) => `Şimdiye kadar toplam ${ctx.payments.length} tahsilat işlemi yapılmış.`,
  },
  {
    id: "refunded_payments_count",
    category: "Finans",
    label: "Kaç tahsilatım iade edildi?",
    keywords: ["iade edilen tahsilat sayısı", "kaç ödeme iade edildi"],
    compute: (ctx) => {
      const refunds = ctx.payments.filter((p) => p.refundOfPaymentId);
      return refunds.length > 0 ? `${refunds.length} tahsilatınız iade edilmiş.` : "Henüz iade edilmiş bir tahsilatınız yok.";
    },
  },
  {
    id: "total_refunded_amount",
    category: "Finans",
    label: "Toplam ne kadar iade yaptım?",
    keywords: ["toplam iade tutarı", "ne kadar para iade ettim"],
    compute: (ctx) => {
      const refunds = ctx.payments.filter((p) => p.refundOfPaymentId);
      if (refunds.length === 0) return "Henüz iade edilmiş bir tahsilatınız yok.";
      const total = refunds.reduce((sum, p) => sum + Math.abs(p.amount || 0), 0);
      return `Toplam iade tutarınız ${formatTL(total)}.`;
    },
  },
  {
    id: "avg_refund_rate",
    category: "Finans",
    label: "İade oranım nedir?",
    keywords: ["iade oranı", "ne kadar iade oranı"],
    compute: (ctx) => {
      const positive = ctx.payments.filter((p) => (p.amount || 0) > 0 && !p.refundOfPaymentId).length;
      const refunds = ctx.payments.filter((p) => p.refundOfPaymentId).length;
      if (positive === 0) return "Henüz bir tahsilatınız yok.";
      return `Tahsilatlarınızın %${Math.round((refunds / positive) * 100)}'i iade edilmiş (${refunds}/${positive}).`;
    },
  },
  {
    id: "payment_provider_sandbox_status",
    category: "Finans",
    label: "Ödeme bağlantım test modunda mı, canlı mı?",
    keywords: ["sandbox modunda mı", "test modunda mı ödeme", "canlı ödeme modu"],
    compute: (ctx) => {
      if (ctx.paymentCredentials.length === 0) return "Henüz bir ödeme sağlayıcısı bağlamadınız.";
      const cred = ctx.paymentCredentials[0];
      return `${cred.provider === "paytr" ? "PayTR" : "iyzico"} bağlantınız ${cred.sandbox ? "test (sandbox) modunda" : "canlı modda"}.`;
    },
  },
  {
    id: "max_installment_allowed",
    category: "Finans",
    label: "Müşterilerim kaç taksitle ödeyebiliyor?",
    keywords: ["kaç taksit", "taksit sayısı", "maksimum taksit"],
    compute: (ctx) => {
      if (ctx.paymentCredentials.length === 0) return "Henüz bir ödeme sağlayıcısı bağlamadınız.";
      const max = ctx.paymentCredentials[0].maxInstallment || 1;
      return max > 1 ? `Müşterileriniz en fazla ${max} taksitle ödeme yapabiliyor.` : "Taksit seçeneğiniz açık değil, sadece tek çekim kabul ediyorsunuz.";
    },
  },
  {
    id: "customers_with_outstanding_balance_count",
    category: "Finans",
    label: "Kaç müşterimin bekleyen bakiyesi var?",
    keywords: ["bekleyen bakiyesi olan müşteri sayısı", "borçlu müşteri sayısı"],
    compute: (ctx) => {
      const balances = {};
      ctx.deals.filter((d) => d.stage === "kazanildi").forEach((d) => { balances[d.customerId] = (balances[d.customerId] || 0) + (d.value || 0); });
      ctx.payments.forEach((p) => {
        const deal = ctx.deals.find((d) => d.id === p.dealId);
        if (deal && balances[deal.customerId] != null) balances[deal.customerId] -= (p.amount || 0);
      });
      const count = Object.values(balances).filter((v) => v > 0).length;
      return count > 0 ? `${count} müşterinizin bekleyen bakiyesi var.` : "Şu anda bakiyesi olan bir müşteriniz yok.";
    },
  },
  {
    id: "fully_paid_deals_rate",
    category: "Finans",
    label: "Kazanılan kayıtlarımın yüzde kaçı tamamen tahsil edildi?",
    keywords: ["tamamen tahsil edilen kayıt oranı", "tam tahsilat oranı"],
    compute: (ctx) => {
      const won = ctx.deals.filter((d) => d.stage === "kazanildi");
      if (won.length === 0) return "Henüz kazanılmış bir kaydınız yok.";
      const paidTotals = {};
      ctx.payments.forEach((p) => { paidTotals[p.dealId] = (paidTotals[p.dealId] || 0) + (p.amount || 0); });
      const fullyPaid = won.filter((d) => (paidTotals[d.id] || 0) >= (d.value || 0) && (d.value || 0) > 0).length;
      return `Kazanılan kayıtlarınızın %${Math.round((fullyPaid / won.length) * 100)}'i tamamen tahsil edilmiş (${fullyPaid}/${won.length}).`;
    },
  },
  {
    id: "avg_days_to_first_payment",
    category: "Finans",
    label: "Kazandıktan sonra ortalama kaç günde ilk ödemeyi alıyorum?",
    keywords: ["ilk ödeme süresi", "kazanınca ne kadar sürede ödeme alıyorum"],
    compute: (ctx) => {
      const won = ctx.deals.filter((d) => d.stage === "kazanildi" && d.closedAt);
      const withFirstPayment = won
        .map((d) => {
          const dealPayments = ctx.payments.filter((p) => p.dealId === d.id).sort((a, b) => new Date(a.paidAt) - new Date(b.paidAt));
          return dealPayments.length > 0 ? { d, first: dealPayments[0] } : null;
        })
        .filter(Boolean);
      if (withFirstPayment.length === 0) return "Henüz ödemesi alınmış, kazanılmış bir kaydınız yok.";
      const avgDays = withFirstPayment.reduce((sum, x) => sum + Math.max(0, (new Date(x.first.paidAt) - new Date(x.d.closedAt)) / (24 * 60 * 60 * 1000)), 0) / withFirstPayment.length;
      return `Bir kayıt kazanıldıktan sonra ortalama ${Math.round(avgDays)} günde ilk ödemeyi alıyorsunuz.`;
    },
  },
  {
    id: "avg_kdv_rate_open_deals",
    category: "Finans",
    label: "Açık kayıtlarımda ortalama KDV oranı nedir?",
    keywords: ["ortalama kdv oranı", "açık tekliflerde kdv"],
    compute: (ctx) => {
      const open = ctx.deals.filter((d) => d.stage !== "kazanildi" && d.stage !== "kaybedildi");
      if (open.length === 0) return "Şu anda açık bir kaydınız yok.";
      const avg = open.reduce((sum, d) => sum + (d.kdvRate ?? 20), 0) / open.length;
      return `Açık kayıtlarınızda ortalama KDV oranınız %${Math.round(avg)}.`;
    },
  },
  {
    id: "deals_with_partial_payment_count",
    category: "Finans",
    label: "Kısmi ödemesi olan kaç kazanılan kaydım var?",
    keywords: ["kısmi ödeme yapılan kayıt", "kısmen tahsil edilen teklif"],
    compute: (ctx) => {
      const won = ctx.deals.filter((d) => d.stage === "kazanildi" && (d.value || 0) > 0);
      const paidTotals = {};
      ctx.payments.forEach((p) => { paidTotals[p.dealId] = (paidTotals[p.dealId] || 0) + (p.amount || 0); });
      const partial = won.filter((d) => {
        const paid = paidTotals[d.id] || 0;
        return paid > 0 && paid < d.value;
      }).length;
      return partial > 0 ? `${partial} kaydınızda kısmi ödeme alınmış, tamamı tahsil edilmemiş.` : "Kısmi ödemesi olan bir kaydınız yok.";
    },
  },
  {
    id: "avg_payment_per_customer",
    category: "Finans",
    label: "Tahsilat yapılan müşteri başına ortalama ne kadar aldım?",
    keywords: ["müşteri başına ortalama tahsilat", "müşteri başına ödeme"],
    compute: (ctx) => {
      const positive = ctx.payments.filter((p) => (p.amount || 0) > 0);
      if (positive.length === 0) return "Henüz bir tahsilatınız yok.";
      const byCustomer = {};
      positive.forEach((p) => {
        const deal = ctx.deals.find((d) => d.id === p.dealId);
        if (deal) byCustomer[deal.customerId] = (byCustomer[deal.customerId] || 0) + p.amount;
      });
      const customerCount = Object.keys(byCustomer).length;
      if (customerCount === 0) return "Henüz bir tahsilatınız yok.";
      const total = Object.values(byCustomer).reduce((sum, v) => sum + v, 0);
      return `Tahsilat yapılan müşteri başına ortalama ${formatTL(total / customerCount)} almışsınız.`;
    },
  },
  {
    id: "this_year_vs_last_year_expense",
    category: "Finans",
    label: "Bu yılki giderim geçen yıla göre nasıl?",
    keywords: ["geçen yıla göre gider", "yıllık gider kıyaslaması"],
    compute: (ctx) => {
      const now = new Date();
      const thisBounds = getRangeBounds("bu_yil");
      const lastBounds = { start: new Date(now.getFullYear() - 1, 0, 1), end: new Date(now.getFullYear() - 1, 11, 31, 23, 59, 59, 999) };
      const thisExpense = ctx.companyExpenses.flatMap((e) => expandExpenseOccurrences(e, thisBounds)).reduce((sum, e) => sum + (e.amount || 0), 0);
      const lastExpense = ctx.companyExpenses.flatMap((e) => expandExpenseOccurrences(e, lastBounds)).reduce((sum, e) => sum + (e.amount || 0), 0);
      return `Bu yılki gideriniz ${formatTL(thisExpense)}, geçen yıl ${formatTL(lastExpense)} idi.`;
    },
  },
  {
    id: "recurring_vs_onetime_expense_ratio",
    category: "Finans",
    label: "Kaç tekrarlayan, kaç tek seferlik giderim var?",
    keywords: ["tekrarlayan tek seferlik gider oranı", "gider türü dağılımı"],
    compute: (ctx) => {
      if (ctx.companyExpenses.length === 0) return "Henüz kayıtlı bir gideriniz yok.";
      const recurring = ctx.companyExpenses.filter((e) => e.isRecurring).length;
      const onetime = ctx.companyExpenses.length - recurring;
      return `${recurring} tekrarlayan, ${onetime} tek seferlik gider kaydınız var.`;
    },
  },
  {
    id: "deals_cost_total_month",
    category: "Finans",
    label: "Bu ay kazanılan kayıtların toplam maliyeti ne kadar?",
    keywords: ["bu ay maliyet toplamı", "kazanılan kayıtların maliyeti"],
    compute: (ctx) => {
      const bounds = getRangeBounds("bu_ay");
      const total = ctx.deals.filter((d) => d.stage === "kazanildi" && (d.cost || 0) > 0 && inRange(d.closedAt || d.createdAt, bounds)).reduce((sum, d) => sum + d.cost, 0);
      return `Bu ay kazanılan kayıtların toplam maliyeti ${formatTL(total)}.`;
    },
  },
  {
    id: "gross_margin_rate_month",
    category: "Finans",
    label: "Bu ay brüt kâr marjım nedir?",
    keywords: ["brüt kâr marjı", "bu ay kâr marjı yüzdesi"],
    compute: (ctx) => {
      const bounds = getRangeBounds("bu_ay");
      const won = ctx.deals.filter((d) => d.stage === "kazanildi" && inRange(d.closedAt || d.createdAt, bounds));
      const income = won.reduce((sum, d) => sum + (d.value || 0), 0);
      if (income === 0) return "Bu ay henüz kazanılmış bir kaydınız yok.";
      const cost = won.reduce((sum, d) => sum + (d.cost || 0), 0);
      return `Bu ay brüt kâr marjınız %${Math.round(((income - cost) / income) * 100)}.`;
    },
  },

  // ---- Destek ----
  {
    id: "tickets_by_status_breakdown",
    category: "Destek",
    label: "Durum bazında destek talebi dağılımım nasıl?",
    keywords: ["durum dağılımı", "talep durumu", "açık işlemde çözüldü dağılımı"],
    compute: (ctx) => {
      if (ctx.tickets.length === 0) return "Henüz bir destek talebiniz yok.";
      return STATUSES.map((s) => `${s.label}: ${ctx.tickets.filter((t) => t.status === s.id).length}`).join(", ");
    },
  },
  {
    id: "open_tickets_by_priority",
    category: "Destek",
    label: "Açık taleplerimin önceliğe göre dağılımı nasıl?",
    keywords: ["açık talep önceliği", "açık taleplerin öncelik dağılımı"],
    compute: (ctx) => {
      const open = ctx.tickets.filter((t) => !TERMINAL_STATUSES.includes(t.status));
      if (open.length === 0) return "Açık bir destek talebiniz yok.";
      const labels = { acil: "Acil", yuksek: "Yüksek", orta: "Orta", dusuk: "Düşük" };
      const totals = {};
      open.forEach((t) => { totals[t.priority] = (totals[t.priority] || 0) + 1; });
      return Object.entries(totals).map(([k, v]) => `${labels[k] || k}: ${v}`).join(", ");
    },
  },
  {
    id: "tickets_this_month_count",
    category: "Destek",
    label: "Bu ay kaç destek talebi geldi?",
    keywords: ["bu ay kaç talep", "bu ayki destek talepleri"],
    compute: (ctx) => {
      const bounds = getRangeBounds("bu_ay");
      return `Bu ay ${ctx.tickets.filter((t) => inRange(t.createdAt, bounds)).length} destek talebi aldınız.`;
    },
  },
  {
    id: "tickets_this_week_count",
    category: "Destek",
    label: "Bu hafta kaç destek talebi geldi?",
    keywords: ["bu hafta kaç talep", "haftalık destek talebi sayısı"],
    compute: (ctx) => {
      const now = new Date();
      const start = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000);
      start.setHours(0, 0, 0, 0);
      return `Son 7 günde ${ctx.tickets.filter((t) => inRange(t.createdAt, { start, end: now })).length} destek talebi aldınız.`;
    },
  },
  {
    id: "resolved_this_month_count",
    category: "Destek",
    label: "Bu ay kaç talep çözdüm?",
    keywords: ["bu ay çözülen talep", "bu ayki çözülen talep sayısı"],
    compute: (ctx) => {
      const bounds = getRangeBounds("bu_ay");
      const count = ctx.tickets.filter((t) => t.resolvedAt && inRange(t.resolvedAt, bounds)).length;
      return count > 0 ? `Bu ay ${count} talep çözdünüz.` : "Bu ay henüz çözülmüş bir talebiniz yok.";
    },
  },
  {
    id: "tickets_resolved_this_week",
    category: "Destek",
    label: "Bu hafta kaç talep çözdüm?",
    keywords: ["bu hafta çözülen talep", "haftalık çözülen talep sayısı"],
    compute: (ctx) => {
      const now = new Date();
      const start = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000);
      start.setHours(0, 0, 0, 0);
      const count = ctx.tickets.filter((t) => t.resolvedAt && inRange(t.resolvedAt, { start, end: now })).length;
      return count > 0 ? `Son 7 günde ${count} talep çözdünüz.` : "Son 7 günde çözülmüş bir talebiniz yok.";
    },
  },
  {
    id: "acil_ticket_avg_resolution_days",
    category: "Destek",
    label: "Acil önceliği çözme süresi ortalama ne kadar?",
    keywords: ["acil talep çözüm süresi", "acil öncelik ortalama süre"],
    compute: (ctx) => {
      const resolved = ctx.tickets.filter((t) => t.priority === "acil" && t.resolvedAt);
      if (resolved.length === 0) return "Henüz çözülmüş acil öncelikli bir talebiniz yok.";
      const avgHours = resolved.reduce((sum, t) => sum + (new Date(t.resolvedAt) - new Date(t.createdAt)) / (60 * 60 * 1000), 0) / resolved.length;
      return `Acil öncelikli taleplerinizi ortalama ${Math.round(avgHours)} saatte çözüyorsunuz.`;
    },
  },
  {
    id: "top_customer_by_ticket_count",
    category: "Destek",
    label: "En çok destek talebi açan müşterim kim?",
    keywords: ["en çok talep açan müşteri", "en çok destek talebi olan müşteri"],
    compute: (ctx) => {
      if (ctx.tickets.length === 0) return "Henüz bir destek talebiniz yok.";
      const totals = {};
      ctx.tickets.forEach((t) => { totals[t.customerId] = (totals[t.customerId] || 0) + 1; });
      const top = topEntry(totals);
      const customer = ctx.customers.find((c) => c.id === top[0]);
      return `${customer?.name || "Bilinmeyen müşteri"} — ${top[1]} destek talebiyle en çok talep açan müşteriniz.`;
    },
  },
  {
    id: "customers_with_open_ticket_count",
    category: "Destek",
    label: "Açık talebi olan kaç müşterim var?",
    keywords: ["açık talebi olan müşteri sayısı", "bekleyen desteği olan müşteri"],
    compute: (ctx) => {
      const open = ctx.tickets.filter((t) => !TERMINAL_STATUSES.includes(t.status));
      const ids = new Set(open.map((t) => t.customerId));
      return ids.size > 0 ? `${ids.size} müşterinizin açık bir destek talebi var.` : "Açık destek talebi olan bir müşteriniz yok.";
    },
  },
  {
    id: "kb_article_recently_added",
    category: "Destek",
    label: "En son ne zaman Bilgi Bankası makalesi ekledim?",
    keywords: ["en son eklenen makale", "son makale ne zaman"],
    compute: (ctx) => {
      if (ctx.kbArticles.length === 0) return "Henüz bir Bilgi Bankası makaleniz yok.";
      const sorted = [...ctx.kbArticles].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      return `En son "${sorted[0].title}" makalesini ${new Date(sorted[0].createdAt).toLocaleDateString("tr-TR")} tarihinde eklediniz.`;
    },
  },
  {
    id: "kb_articles_without_category_count",
    category: "Destek",
    label: "Kategorisi girilmemiş kaç makalem var?",
    keywords: ["kategorisiz makale", "kategorisi olmayan makale"],
    compute: (ctx) => {
      if (ctx.kbArticles.length === 0) return "Henüz bir Bilgi Bankası makaleniz yok.";
      const count = ctx.kbArticles.filter((a) => !a.category).length;
      return count > 0 ? `${count} makalenizde kategori girilmemiş.` : "Tüm makalelerinizde kategori girilmiş.";
    },
  },
  {
    id: "kb_category_count_distinct",
    category: "Destek",
    label: "Kaç farklı Bilgi Bankası kategorim var?",
    keywords: ["farklı makale kategorisi sayısı", "kaç kategori var"],
    compute: (ctx) => {
      const categories = new Set(ctx.kbArticles.filter((a) => a.category).map((a) => a.category));
      return categories.size > 0 ? `${categories.size} farklı Bilgi Bankası kategoriniz var.` : "Henüz kategorili bir makaleniz yok.";
    },
  },
  {
    id: "tickets_avg_age_open",
    category: "Destek",
    label: "Açık taleplerim ortalama kaç gündür bekliyor?",
    keywords: ["açık talep ortalama bekleme", "açık talebin yaşı"],
    compute: (ctx) => {
      const open = ctx.tickets.filter((t) => !TERMINAL_STATUSES.includes(t.status));
      if (open.length === 0) return "Açık bir destek talebiniz yok.";
      const avgDays = open.reduce((sum, t) => sum + (Date.now() - new Date(t.createdAt).getTime()) / (24 * 60 * 60 * 1000), 0) / open.length;
      return `Açık talepleriniz ortalama ${Math.round(avgDays)} gündür bekliyor.`;
    },
  },
  {
    id: "oldest_open_ticket",
    category: "Destek",
    label: "En uzun süredir açık kalan talebim hangisi?",
    keywords: ["en eski açık talep", "en uzun süredir bekleyen talep"],
    compute: (ctx) => {
      const open = ctx.tickets.filter((t) => !TERMINAL_STATUSES.includes(t.status));
      if (open.length === 0) return "Açık bir destek talebiniz yok.";
      const oldest = [...open].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))[0];
      const days = Math.floor((Date.now() - new Date(oldest.createdAt).getTime()) / (24 * 60 * 60 * 1000));
      const customer = ctx.customers.find((c) => c.id === oldest.customerId);
      return `"${oldest.subject}" (${customer?.name || "müşteri silinmiş"}) — ${days} gündür açık.`;
    },
  },
  {
    id: "resolved_rate_all_time",
    category: "Destek",
    label: "Taleplerimin yüzde kaçı çözüldü?",
    keywords: ["çözülme oranı", "toplam çözülen talep yüzdesi"],
    compute: (ctx) => {
      if (ctx.tickets.length === 0) return "Henüz bir destek talebiniz yok.";
      const resolved = ctx.tickets.filter((t) => TERMINAL_STATUSES.includes(t.status)).length;
      return `Destek taleplerinizin %${Math.round((resolved / ctx.tickets.length) * 100)}'i çözüldü/kapatıldı (${resolved}/${ctx.tickets.length}).`;
    },
  },
  {
    id: "tickets_created_vs_resolved_this_month",
    category: "Destek",
    label: "Bu ay kaç talep açıldı, kaçı çözüldü?",
    keywords: ["bu ay açılan çözülen talep karşılaştırması", "bu ay talep dengesi"],
    compute: (ctx) => {
      const bounds = getRangeBounds("bu_ay");
      const created = ctx.tickets.filter((t) => inRange(t.createdAt, bounds)).length;
      const resolved = ctx.tickets.filter((t) => t.resolvedAt && inRange(t.resolvedAt, bounds)).length;
      return `Bu ay ${created} talep açıldı, ${resolved} talep çözüldü.`;
    },
  },
  {
    id: "urgent_tickets_open_count",
    category: "Destek",
    label: "Acil öncelikli kaç açık talebim var?",
    keywords: ["acil açık talep", "acil öncelikli talep sayısı"],
    compute: (ctx) => {
      const count = ctx.tickets.filter((t) => t.priority === "acil" && !TERMINAL_STATUSES.includes(t.status)).length;
      return count > 0 ? `Acil öncelikli ${count} açık talebiniz var.` : "Acil öncelikli açık bir talebiniz yok.";
    },
  },
  {
    id: "low_priority_tickets_open_count",
    category: "Destek",
    label: "Düşük öncelikli kaç açık talebim var?",
    keywords: ["düşük öncelikli açık talep", "düşük öncelik talep sayısı"],
    compute: (ctx) => {
      const count = ctx.tickets.filter((t) => t.priority === "dusuk" && !TERMINAL_STATUSES.includes(t.status)).length;
      return `Düşük öncelikli ${count} açık talebiniz var.`;
    },
  },
  {
    id: "tickets_without_description_count",
    category: "Destek",
    label: "Açıklaması girilmemiş kaç talebim var?",
    keywords: ["açıklamasız talep", "açıklaması eksik destek talebi"],
    compute: (ctx) => {
      if (ctx.tickets.length === 0) return "Henüz bir destek talebiniz yok.";
      const count = ctx.tickets.filter((t) => !t.description).length;
      return `${count} talebinizde açıklama girilmemiş.`;
    },
  },
  {
    id: "avg_tickets_per_customer",
    category: "Destek",
    label: "Müşteri başına ortalama kaç destek talebim var?",
    keywords: ["müşteri başına ortalama talep", "müşteri başına destek sayısı"],
    compute: (ctx) => {
      if (ctx.customers.length === 0) return "Henüz müşteriniz yok.";
      return `Müşteri başına ortalama ${(ctx.tickets.length / ctx.customers.length).toFixed(2)} destek talebiniz var.`;
    },
  },

  // ---- Randevu & Program ----
  {
    id: "appointments_this_week",
    category: "Randevu & Program",
    label: "Önümüzdeki 7 günde kaç randevum var?",
    keywords: ["bu hafta randevu", "önümüzdeki 7 gün randevu"],
    visibleIf: (sector) => supportsSelfBooking(sector) || isAppointmentSector(sector),
    compute: (ctx) => {
      if (!ctx.appointmentDateTimeKey) return "Randevu tarihi alanı henüz tanımlı değil.";
      const now = new Date();
      const weekEnd = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      const count = ctx.deals.filter((d) => d.stage !== "kaybedildi" && inRange(d.customFields?.[ctx.appointmentDateTimeKey], { start: now, end: weekEnd })).length;
      return `Önümüzdeki 7 gün içinde ${count} randevunuz var.`;
    },
  },
  {
    id: "appointments_tomorrow",
    category: "Randevu & Program",
    label: "Yarın kaç randevum var?",
    keywords: ["yarınki randevular", "yarın kaç randevu"],
    visibleIf: (sector) => supportsSelfBooking(sector) || isAppointmentSector(sector),
    compute: (ctx) => {
      if (!ctx.appointmentDateTimeKey) return "Randevu tarihi alanı henüz tanımlı değil.";
      const tomorrowStr = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const count = ctx.deals.filter((d) => d.stage !== "kazanildi" && d.stage !== "kaybedildi" && (d.customFields?.[ctx.appointmentDateTimeKey] || "").slice(0, 10) === tomorrowStr).length;
      return `Yarın ${count} randevunuz var.`;
    },
  },
  {
    id: "next_appointment",
    category: "Randevu & Program",
    label: "Bir sonraki randevum ne zaman?",
    keywords: ["sıradaki randevu", "bir sonraki randevu"],
    visibleIf: (sector) => supportsSelfBooking(sector) || isAppointmentSector(sector),
    compute: (ctx) => {
      if (!ctx.appointmentDateTimeKey) return "Randevu tarihi alanı henüz tanımlı değil.";
      const nowStr = new Date().toISOString().slice(0, 16);
      const upcoming = ctx.deals
        .filter((d) => d.stage !== "kazanildi" && d.stage !== "kaybedildi" && (d.customFields?.[ctx.appointmentDateTimeKey] || "") >= nowStr)
        .sort((a, b) => (a.customFields[ctx.appointmentDateTimeKey] || "").localeCompare(b.customFields[ctx.appointmentDateTimeKey] || ""));
      if (upcoming.length === 0) return "Yaklaşan bir randevunuz görünmüyor.";
      const next = upcoming[0];
      const customer = ctx.customers.find((c) => c.id === next.customerId);
      const dt = next.customFields[ctx.appointmentDateTimeKey];
      return `Bir sonraki randevunuz ${new Date(dt).toLocaleDateString("tr-TR")} tarihinde, saat ${dt.slice(11, 16)} — ${customer?.name || "müşteri silinmiş"}.`;
    },
  },
  {
    id: "avg_appointments_per_day_this_month",
    category: "Randevu & Program",
    label: "Bu ay günde ortalama kaç randevum var?",
    keywords: ["günlük ortalama randevu", "bu ay ortalama randevu sayısı"],
    visibleIf: (sector) => supportsSelfBooking(sector) || isAppointmentSector(sector),
    compute: (ctx) => {
      if (!ctx.appointmentDateTimeKey) return "Randevu tarihi alanı henüz tanımlı değil.";
      const bounds = getRangeBounds("bu_ay");
      const count = ctx.deals.filter((d) => d.stage !== "kaybedildi" && inRange(d.customFields?.[ctx.appointmentDateTimeKey], bounds)).length;
      const daysElapsed = new Date().getDate();
      return `Bu ay güne kadar günde ortalama ${(count / daysElapsed).toFixed(1)} randevunuz var (toplam ${count}).`;
    },
  },
  {
    id: "group_class_enrollment_total",
    category: "Randevu & Program",
    label: "Tüm derslerimde toplam kaç kayıt var?",
    keywords: ["toplam ders kaydı", "tüm derslerdeki kayıt sayısı"],
    visibleIf: (sector) => supportsGroupClasses(sector),
    compute: (ctx) => `Tüm derslerinizde toplam ${ctx.groupClassEnrollments.length} kayıt var.`,
  },
  {
    id: "emptiest_group_class",
    category: "Randevu & Program",
    label: "Hangi dersimde en az kayıt var?",
    keywords: ["en az kayıtlı ders", "en boş ders"],
    visibleIf: (sector) => supportsGroupClasses(sector),
    compute: (ctx) => {
      if (ctx.groupClasses.length === 0) return "Henüz bir dersiniz yok.";
      const totals = {};
      ctx.groupClassEnrollments.forEach((e) => { totals[e.groupClassId] = (totals[e.groupClassId] || 0) + 1; });
      const sorted = [...ctx.groupClasses].sort((a, b) => (totals[a.id] || 0) - (totals[b.id] || 0));
      const emptiest = sorted[0];
      return `En az kayıtlı dersiniz "${emptiest.name}" — ${totals[emptiest.id] || 0}/${emptiest.capacity ?? "?"} kayıt.`;
    },
  },
  {
    id: "group_class_capacity_utilization",
    category: "Randevu & Program",
    label: "Derslerimin genel doluluk oranı nedir?",
    keywords: ["genel doluluk oranı", "derslerin doluluk yüzdesi"],
    visibleIf: (sector) => supportsGroupClasses(sector),
    compute: (ctx) => {
      const totalCapacity = ctx.groupClasses.reduce((sum, g) => sum + (g.capacity || 0), 0);
      if (totalCapacity === 0) return "Henüz kapasitesi tanımlı bir dersiniz yok.";
      const totalEnrolled = ctx.groupClassEnrollments.length;
      return `Derslerinizin genel doluluk oranı %${Math.round((totalEnrolled / totalCapacity) * 100)} (${totalEnrolled}/${totalCapacity}).`;
    },
  },
  {
    id: "group_classes_by_weekday_count",
    category: "Randevu & Program",
    label: "Haftanın hangi günü kaç dersim var?",
    keywords: ["güne göre ders sayısı", "haftalık ders dağılımı"],
    visibleIf: (sector) => supportsGroupClasses(sector),
    compute: (ctx) => {
      if (ctx.groupClasses.length === 0) return "Henüz bir dersiniz yok.";
      return WEEKDAYS.map((name, idx) => `${name}: ${ctx.groupClasses.filter((g) => g.weekday === idx + 1).length}`).join(", ");
    },
  },
  {
    id: "group_class_instructor_count",
    category: "Randevu & Program",
    label: "Kaç farklı eğitmenim/antrenörüm var?",
    keywords: ["eğitmen sayısı", "antrenör sayısı"],
    visibleIf: (sector) => supportsGroupClasses(sector),
    compute: (ctx) => {
      const instructors = new Set(ctx.groupClasses.filter((g) => g.instructorName).map((g) => g.instructorName));
      return instructors.size > 0 ? `${instructors.size} farklı eğitmen/antrenörünüz var.` : "Derslerinize henüz eğitmen bilgisi girilmemiş.";
    },
  },
  {
    id: "group_class_avg_capacity",
    category: "Randevu & Program",
    label: "Derslerimin ortalama kapasitesi ne kadar?",
    keywords: ["ortalama ders kapasitesi", "ders başına kapasite"],
    visibleIf: (sector) => supportsGroupClasses(sector),
    compute: (ctx) => {
      if (ctx.groupClasses.length === 0) return "Henüz bir dersiniz yok.";
      const avg = ctx.groupClasses.reduce((sum, g) => sum + (g.capacity || 0), 0) / ctx.groupClasses.length;
      return `Derslerinizin ortalama kapasitesi ${Math.round(avg)} kişi.`;
    },
  },
  {
    id: "group_class_total_capacity",
    category: "Randevu & Program",
    label: "Tüm derslerimin toplam kapasitesi ne kadar?",
    keywords: ["toplam kapasite", "tüm derslerin kapasitesi"],
    visibleIf: (sector) => supportsGroupClasses(sector),
    compute: (ctx) => `Tüm derslerinizin toplam kapasitesi ${ctx.groupClasses.reduce((sum, g) => sum + (g.capacity || 0), 0)} kişi.`,
  },
  {
    id: "avg_class_duration_minutes",
    category: "Randevu & Program",
    label: "Derslerimin ortalama süresi ne kadar?",
    keywords: ["ortalama ders süresi", "ders kaç dakika"],
    visibleIf: (sector) => supportsGroupClasses(sector),
    compute: (ctx) => {
      if (ctx.groupClasses.length === 0) return "Henüz bir dersiniz yok.";
      const avg = ctx.groupClasses.reduce((sum, g) => sum + (g.durationMinutes || 0), 0) / ctx.groupClasses.length;
      return `Derslerinizin ortalama süresi ${Math.round(avg)} dakika.`;
    },
  },
  {
    id: "class_attendance_rate_overall",
    category: "Randevu & Program",
    label: "Derslerime genel katılım oranım nedir?",
    keywords: ["genel katılım oranı", "derse gelme oranı"],
    visibleIf: (sector) => supportsGroupClasses(sector),
    compute: (ctx) => {
      const attendance = ctx.classAttendance || [];
      if (attendance.length === 0) return "Henüz yoklama kaydı girilmemiş.";
      const came = attendance.filter((a) => a.status === "geldi").length;
      return `Genel derse katılım oranınız %${Math.round((came / attendance.length) * 100)} (${came}/${attendance.length}).`;
    },
  },
  {
    id: "class_attendance_rate_this_month",
    category: "Randevu & Program",
    label: "Bu ay derslerime katılım oranı nedir?",
    keywords: ["bu ay katılım oranı", "bu ayki derse gelme oranı"],
    visibleIf: (sector) => supportsGroupClasses(sector),
    compute: (ctx) => {
      const bounds = getRangeBounds("bu_ay");
      const attendance = (ctx.classAttendance || []).filter((a) => inRange(a.occurrenceDate, bounds));
      if (attendance.length === 0) return "Bu ay henüz yoklama kaydı girilmemiş.";
      const came = attendance.filter((a) => a.status === "geldi").length;
      return `Bu ay derse katılım oranınız %${Math.round((came / attendance.length) * 100)} (${came}/${attendance.length}).`;
    },
  },
  {
    id: "best_attended_class",
    category: "Randevu & Program",
    label: "En yüksek katılım oranına sahip dersim hangisi?",
    keywords: ["en yüksek katılımlı ders", "en çok gelinen ders"],
    visibleIf: (sector) => supportsGroupClasses(sector),
    compute: (ctx) => {
      if (ctx.groupClasses.length === 0) return "Henüz bir dersiniz yok.";
      const attendance = ctx.classAttendance || [];
      const rates = ctx.groupClasses
        .map((g) => {
          const recs = attendance.filter((a) => a.groupClassId === g.id);
          if (recs.length === 0) return null;
          const came = recs.filter((a) => a.status === "geldi").length;
          return { name: g.name, rate: came / recs.length, total: recs.length };
        })
        .filter(Boolean);
      if (rates.length === 0) return "Henüz hiçbir dersiniz için yoklama girilmemiş.";
      const best = [...rates].sort((a, b) => b.rate - a.rate)[0];
      return `En yüksek katılım oranına sahip dersiniz "${best.name}" — %${Math.round(best.rate * 100)} (${best.total} yoklama kaydı).`;
    },
  },
  {
    id: "worst_attended_class",
    category: "Randevu & Program",
    label: "En düşük katılım oranına sahip dersim hangisi?",
    keywords: ["en düşük katılımlı ders", "en çok gelinmeyen ders"],
    visibleIf: (sector) => supportsGroupClasses(sector),
    compute: (ctx) => {
      if (ctx.groupClasses.length === 0) return "Henüz bir dersiniz yok.";
      const attendance = ctx.classAttendance || [];
      const rates = ctx.groupClasses
        .map((g) => {
          const recs = attendance.filter((a) => a.groupClassId === g.id);
          if (recs.length === 0) return null;
          const came = recs.filter((a) => a.status === "geldi").length;
          return { name: g.name, rate: came / recs.length, total: recs.length };
        })
        .filter(Boolean);
      if (rates.length === 0) return "Henüz hiçbir dersiniz için yoklama girilmemiş.";
      const worst = [...rates].sort((a, b) => a.rate - b.rate)[0];
      return `En düşük katılım oranına sahip dersiniz "${worst.name}" — %${Math.round(worst.rate * 100)} (${worst.total} yoklama kaydı).`;
    },
  },
  {
    id: "customer_with_most_class_attendance",
    category: "Randevu & Program",
    label: "En çok derse gelen müşterim/üyem kim?",
    keywords: ["en çok derse katılan", "en düzenli gelen üye"],
    visibleIf: (sector) => supportsGroupClasses(sector),
    compute: (ctx) => {
      const attendance = (ctx.classAttendance || []).filter((a) => a.status === "geldi");
      if (attendance.length === 0) return "Henüz katılım kaydı girilmemiş.";
      const totals = {};
      attendance.forEach((a) => { totals[a.customerId] = (totals[a.customerId] || 0) + 1; });
      const top = topEntry(totals);
      const customer = ctx.customers.find((c) => c.id === top[0]);
      return `${customer?.name || "Bilinmeyen müşteri"} — ${top[1]} derse katılarak en çok derse gelen müşteriniz.`;
    },
  },
  {
    id: "total_attendance_marked_count",
    category: "Randevu & Program",
    label: "Kaç yoklama kaydı girmişim?",
    keywords: ["toplam yoklama sayısı", "girilen yoklama kaydı"],
    visibleIf: (sector) => supportsGroupClasses(sector),
    compute: (ctx) => `${(ctx.classAttendance || []).length} yoklama kaydı girilmiş.`,
  },
  {
    id: "business_hours_days_count",
    category: "Randevu & Program",
    label: "Kaç gün için müsaitlik saati tanımlamışım?",
    keywords: ["müsaitlik günleri", "kaç gün müsait"],
    visibleIf: (sector) => bookingModel(sector) === "slot",
    compute: (ctx) => {
      if (ctx.businessHours.length === 0) return "Henüz müsaitlik saati tanımlamadınız.";
      const days = ctx.businessHours.map((b) => WEEKDAYS[b.weekday - 1]).filter(Boolean);
      return `${days.length} gün için müsaitlik saati tanımlı: ${days.join(", ")}.`;
    },
  },
  {
    id: "business_hours_missing_days",
    category: "Randevu & Program",
    label: "Hangi günler için müsaitlik saatim tanımlı değil?",
    keywords: ["müsaitlik tanımlanmamış günler", "eksik müsaitlik günü"],
    visibleIf: (sector) => bookingModel(sector) === "slot",
    compute: (ctx) => {
      const defined = new Set(ctx.businessHours.map((b) => b.weekday));
      const missing = WEEKDAYS.map((name, idx) => (defined.has(idx + 1) ? null : name)).filter(Boolean);
      if (missing.length === 0) return "Haftanın tüm günleri için müsaitlik saati tanımlı.";
      return `Şu günler için henüz müsaitlik saati tanımlamadınız: ${missing.join(", ")}.`;
    },
  },
  {
    id: "business_hours_total_weekly_hours",
    category: "Randevu & Program",
    label: "Haftalık toplam müsaitlik saatim ne kadar?",
    keywords: ["haftalık toplam müsaitlik", "toplam müsait saat"],
    visibleIf: (sector) => bookingModel(sector) === "slot",
    compute: (ctx) => {
      if (ctx.businessHours.length === 0) return "Henüz müsaitlik saati tanımlamadınız.";
      const totalMinutes = ctx.businessHours.reduce((sum, b) => {
        const [sh, sm] = (b.startTime || "0:0").split(":").map(Number);
        const [eh, em] = (b.endTime || "0:0").split(":").map(Number);
        return sum + Math.max(0, eh * 60 + em - (sh * 60 + sm));
      }, 0);
      return `Haftalık toplam müsaitlik süreniz yaklaşık ${Math.round(totalMinutes / 60)} saat.`;
    },
  },
  {
    id: "avg_appointment_slot_minutes",
    category: "Randevu & Program",
    label: "Randevu aralıklarım ortalama kaç dakika?",
    keywords: ["ortalama randevu aralığı", "randevu slotu kaç dakika"],
    visibleIf: (sector) => bookingModel(sector) === "slot",
    compute: (ctx) => {
      if (ctx.businessHours.length === 0) return "Henüz müsaitlik saati tanımlamadınız.";
      const avg = ctx.businessHours.reduce((sum, b) => sum + (b.slotDurationMinutes || 0), 0) / ctx.businessHours.length;
      return `Randevu aralıklarınız ortalama ${Math.round(avg)} dakika.`;
    },
  },

  // ---- Takım ----
  {
    id: "team_members_with_settings_access",
    category: "Takım",
    label: "Kaç takım üyemin ayarları düzenleme izni var?",
    keywords: ["ayar düzenleme izni olan üye", "yetkili takım üyesi sayısı"],
    compute: (ctx) => {
      if (ctx.teamMembers.length === 0) return "Henüz takım üyeniz yok.";
      const count = ctx.teamMembers.filter((m) => m.canEditSettings).length;
      return count > 0 ? `${count} takım üyenizin ayarları düzenleme izni var.` : "Şu anda ayarları düzenleme izni olan bir takım üyeniz yok.";
    },
  },
  {
    id: "per_member_open_deal_count",
    category: "Takım",
    label: "Üye başına kaç açık kaydım var?",
    keywords: ["üye başına açık kayıt", "kişi başına bekleyen teklif"],
    compute: (ctx) => {
      if (ctx.teamMembers.length === 0) return "Henüz takım üyeniz yok.";
      const open = ctx.deals.filter((d) => d.stage !== "kazanildi" && d.stage !== "kaybedildi" && d.assignedTo);
      const totals = {};
      open.forEach((d) => { totals[d.assignedTo] = (totals[d.assignedTo] || 0) + 1; });
      const names = [ctx.currentUserId, ...ctx.teamMembers.map((m) => m.id)];
      return names
        .map((id) => {
          const name = id === ctx.currentUserId ? "Siz" : (ctx.teamMembers.find((m) => m.id === id)?.name || ctx.teamMembers.find((m) => m.id === id)?.email || "Bilinmeyen üye");
          return `${name}: ${totals[id] || 0}`;
        })
        .join(", ");
    },
  },
  {
    id: "per_member_win_rate",
    category: "Takım",
    label: "Üye başına kazanma oranım nedir?",
    keywords: ["üye başına kazanma oranı", "kişi başına başarı oranı"],
    compute: (ctx) => {
      if (ctx.teamMembers.length === 0) return "Henüz takım üyeniz yok.";
      const closed = ctx.deals.filter((d) => (d.stage === "kazanildi" || d.stage === "kaybedildi") && d.assignedTo);
      if (closed.length === 0) return "Henüz sorumlu atanmış, sonuçlanmış bir kaydınız yok.";
      const names = [ctx.currentUserId, ...ctx.teamMembers.map((m) => m.id)];
      return names
        .map((id) => {
          const memberClosed = closed.filter((d) => d.assignedTo === id);
          if (memberClosed.length === 0) return null;
          const won = memberClosed.filter((d) => d.stage === "kazanildi").length;
          const name = id === ctx.currentUserId ? "Siz" : (ctx.teamMembers.find((m) => m.id === id)?.name || ctx.teamMembers.find((m) => m.id === id)?.email || "Bilinmeyen üye");
          return `${name}: %${Math.round((won / memberClosed.length) * 100)}`;
        })
        .filter(Boolean)
        .join(", ");
    },
  },
  {
    id: "per_member_revenue_month",
    category: "Takım",
    label: "Bu ay üye başına ne kadar ciro var?",
    keywords: ["üye başına bu ay ciro", "kişi başına bu ayki gelir"],
    compute: (ctx) => {
      if (ctx.teamMembers.length === 0) return "Henüz takım üyeniz yok.";
      const bounds = getRangeBounds("bu_ay");
      const won = ctx.deals.filter((d) => d.stage === "kazanildi" && d.assignedTo && inRange(d.closedAt || d.createdAt, bounds));
      if (won.length === 0) return "Bu ay henüz sorumlu atanmış, kazanılmış bir kaydınız yok.";
      const totals = {};
      won.forEach((d) => { totals[d.assignedTo] = (totals[d.assignedTo] || 0) + (d.value || 0); });
      return Object.entries(totals)
        .map(([id, total]) => {
          const name = id === ctx.currentUserId ? "Siz" : (ctx.teamMembers.find((m) => m.id === id)?.name || ctx.teamMembers.find((m) => m.id === id)?.email || "Bilinmeyen üye");
          return `${name}: ${formatTL(total)}`;
        })
        .join(", ");
    },
  },
  {
    id: "members_with_zero_deals",
    category: "Takım",
    label: "Hiç kaydı olmayan takım üyem var mı?",
    keywords: ["kaydı olmayan üye", "atanmış kaydı olmayan takım üyesi"],
    compute: (ctx) => {
      if (ctx.teamMembers.length === 0) return "Henüz takım üyeniz yok.";
      const assignedIds = new Set(ctx.deals.filter((d) => d.assignedTo).map((d) => d.assignedTo));
      const zeroMembers = ctx.teamMembers.filter((m) => !assignedIds.has(m.id));
      if (zeroMembers.length === 0) return "Tüm takım üyelerinize en az bir kayıt atanmış.";
      return `${zeroMembers.length} takım üyenize hiç kayıt atanmamış: ${zeroMembers.map((m) => m.name || m.email).join(", ")}.`;
    },
  },
  {
    id: "avg_deals_per_member",
    category: "Takım",
    label: "Üye başına ortalama kaç kayıt atanmış?",
    keywords: ["üye başına ortalama kayıt", "kişi başına ortalama teklif"],
    compute: (ctx) => {
      if (ctx.teamMembers.length === 0) return "Henüz takım üyeniz yok.";
      const assigned = ctx.deals.filter((d) => d.assignedTo).length;
      const memberCount = ctx.teamMembers.length + 1;
      return `Sorumlu atanmış ${assigned} kaydınız var, kişi başına ortalama ${(assigned / memberCount).toFixed(1)} kayıt düşüyor.`;
    },
  },
  {
    id: "members_without_name",
    category: "Takım",
    label: "İsmi girilmemiş kaç takım üyem var?",
    keywords: ["ismi olmayan üye", "isimsiz takım üyesi"],
    compute: (ctx) => {
      if (ctx.teamMembers.length === 0) return "Henüz takım üyeniz yok.";
      const count = ctx.teamMembers.filter((m) => !m.name).length;
      return count > 0 ? `${count} takım üyenizde henüz isim girilmemiş, sadece e-posta görünüyor.` : "Tüm takım üyelerinizde isim girilmiş.";
    },
  },
  {
    id: "team_open_deals_total_value_by_member",
    category: "Takım",
    label: "Açık kayıtlarda en yüksek değere sahip üye kim?",
    keywords: ["en yüksek açık değer üye", "en çok açık kaydı olan üye değeri"],
    compute: (ctx) => {
      if (ctx.teamMembers.length === 0) return "Henüz takım üyeniz yok.";
      const open = ctx.deals.filter((d) => d.stage !== "kazanildi" && d.stage !== "kaybedildi" && d.assignedTo);
      if (open.length === 0) return "Şu anda sorumlu atanmış açık bir kaydınız yok.";
      const totals = {};
      open.forEach((d) => { totals[d.assignedTo] = (totals[d.assignedTo] || 0) + (d.value || 0); });
      const top = topEntry(totals);
      const name = top[0] === ctx.currentUserId ? "Siz" : (ctx.teamMembers.find((m) => m.id === top[0])?.name || ctx.teamMembers.find((m) => m.id === top[0])?.email || "Bilinmeyen üye");
      return `${name} — açık kayıtlarında ${formatTL(top[1])} değerle en yüksek açık portföye sahip.`;
    },
  },
  {
    id: "top_assignee_by_deal_count",
    category: "Takım",
    label: "En çok kayıt sorumlusu (sayıca) kim?",
    keywords: ["en çok kayıt sayısı olan kişi", "en çok teklifi olan takım üyesi"],
    compute: (ctx) => {
      if (ctx.teamMembers.length === 0) return "Henüz takım üyeniz yok.";
      const assigned = ctx.deals.filter((d) => d.assignedTo);
      if (assigned.length === 0) return "Henüz sorumlu atanmış bir kaydınız yok.";
      const totals = {};
      assigned.forEach((d) => { totals[d.assignedTo] = (totals[d.assignedTo] || 0) + 1; });
      const top = topEntry(totals);
      const name = top[0] === ctx.currentUserId ? "Siz" : (ctx.teamMembers.find((m) => m.id === top[0])?.name || ctx.teamMembers.find((m) => m.id === top[0])?.email || "Bilinmeyen üye");
      return `${name} — ${top[1]} kayıtla en çok kayıt sorumlusu olan kişi.`;
    },
  },
  {
    id: "top_uploader",
    category: "Takım",
    label: "En çok dosya yükleyen kim?",
    keywords: ["en çok dosya yükleyen", "en çok ek ekleyen kişi"],
    compute: (ctx) => {
      const withUploader = ctx.attachments.filter((a) => a.uploadedBy);
      if (withUploader.length === 0) return "Henüz bir dosya yüklenmemiş.";
      const totals = {};
      withUploader.forEach((a) => { totals[a.uploadedBy] = (totals[a.uploadedBy] || 0) + 1; });
      const top = topEntry(totals);
      const member = ctx.teamMembers.find((m) => m.email === top[0]);
      return `${member?.name || top[0]} — ${top[1]} dosya ile en çok dosya yükleyen kişi.`;
    },
  },
  {
    id: "avg_open_deal_value_per_member",
    category: "Takım",
    label: "Üye başına ortalama açık kayıt değeri ne kadar?",
    keywords: ["üye başına açık değer", "kişi başına açık kayıt tutarı"],
    compute: (ctx) => {
      if (ctx.teamMembers.length === 0) return "Henüz takım üyeniz yok.";
      const open = ctx.deals.filter((d) => d.stage !== "kazanildi" && d.stage !== "kaybedildi" && d.assignedTo);
      if (open.length === 0) return "Şu anda sorumlu atanmış açık bir kaydınız yok.";
      const totals = {};
      open.forEach((d) => { totals[d.assignedTo] = (totals[d.assignedTo] || 0) + (d.value || 0); });
      const memberCount = Object.keys(totals).length;
      const total = Object.values(totals).reduce((sum, v) => sum + v, 0);
      return `Sorumlu atanmış açık kayıtlarda üye başına ortalama ${formatTL(total / memberCount)} değer var.`;
    },
  },

  // ---- Sistem ----
  {
    id: "custom_field_count_by_entity",
    category: "Sistem",
    label: "Müşteri mi teklif mi, hangi tarafta daha çok özel alanım var?",
    keywords: ["özel alan müşteri teklif dağılımı", "entity bazında özel alan sayısı"],
    compute: (ctx) => {
      const active = ctx.customFieldDefs.filter((d) => d.active);
      if (active.length === 0) return "Henüz aktif bir özel alanınız yok.";
      const customerCount = active.filter((d) => d.entity === "customer").length;
      const dealCount = active.filter((d) => d.entity === "deal").length;
      return `Müşteri tarafında ${customerCount}, kayıt (teklif/randevu/üyelik) tarafında ${dealCount} aktif özel alanınız var.`;
    },
  },
  {
    id: "custom_field_inactive_count",
    category: "Sistem",
    label: "Kaç pasif özel alanım var?",
    keywords: ["pasif özel alan", "devre dışı özel alan sayısı"],
    compute: (ctx) => {
      const count = ctx.customFieldDefs.filter((d) => !d.active).length;
      return count > 0 ? `${count} pasif (devre dışı) özel alanınız var.` : "Pasif özel alanınız yok, tüm özel alanlarınız aktif.";
    },
  },
  {
    id: "custom_field_fill_rate_top",
    category: "Sistem",
    label: "En az doldurulan özel alanım hangisi?",
    keywords: ["en az doldurulan özel alan", "boş kalan özel alan"],
    compute: (ctx) => {
      const active = ctx.customFieldDefs.filter((d) => d.active);
      if (active.length === 0) return "Henüz aktif bir özel alanınız yok.";
      const rates = active.map((def) => {
        const records = def.entity === "customer" ? ctx.customers : ctx.deals;
        if (records.length === 0) return { label: def.label, rate: 0 };
        const filled = records.filter((r) => r.customFields?.[def.key] != null && r.customFields?.[def.key] !== "").length;
        return { label: def.label, rate: filled / records.length };
      });
      const lowest = [...rates].sort((a, b) => a.rate - b.rate)[0];
      return `En az doldurulan özel alanınız "${lowest.label}" — %${Math.round(lowest.rate * 100)} doluluk.`;
    },
  },
  {
    id: "attachments_by_entity_type",
    category: "Sistem",
    label: "Dosyalarım daha çok müşteri kaydında mı, teklif kaydında mı?",
    keywords: ["dosya entity dağılımı", "hangi kayıtta daha çok dosya var"],
    compute: (ctx) => {
      if (ctx.attachments.length === 0) return "Henüz bir dosya yüklenmemiş.";
      const customerCount = ctx.attachments.filter((a) => a.entityType === "customers").length;
      const dealCount = ctx.attachments.filter((a) => a.entityType === "deals").length;
      return `Müşteri kayıtlarında ${customerCount}, teklif/randevu/üyelik kayıtlarında ${dealCount} dosyanız var.`;
    },
  },
  {
    id: "attachments_this_month_count",
    category: "Sistem",
    label: "Bu ay kaç dosya eklemişim?",
    keywords: ["bu ay eklenen dosya", "bu ayki dosya sayısı"],
    compute: (ctx) => {
      const bounds = getRangeBounds("bu_ay");
      const count = ctx.attachments.filter((a) => inRange(a.createdAt, bounds)).length;
      return `Bu ay ${count} dosya eklediniz.`;
    },
  },
  {
    id: "recently_added_attachment",
    category: "Sistem",
    label: "En son ne zaman dosya eklemişim?",
    keywords: ["en son eklenen dosya", "son yüklenen dosya"],
    compute: (ctx) => {
      if (ctx.attachments.length === 0) return "Henüz bir dosya yüklenmemiş.";
      const sorted = [...ctx.attachments].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      return `En son "${sorted[0].fileName}" dosyasını ${new Date(sorted[0].createdAt).toLocaleDateString("tr-TR")} tarihinde eklediniz.`;
    },
  },
  {
    id: "attachment_total_size",
    category: "Sistem",
    label: "Yüklediğim dosyaların toplam boyutu ne kadar?",
    keywords: ["toplam dosya boyutu", "kaç mb dosya yükledim"],
    compute: (ctx) => {
      if (ctx.attachments.length === 0) return "Henüz bir dosya yüklenmemiş.";
      const total = ctx.attachments.reduce((sum, a) => sum + (a.fileSize || 0), 0);
      return `Yüklediğiniz dosyaların toplam boyutu ${formatFileSize(total)}.`;
    },
  },
  {
    id: "price_list_extremes",
    category: "Sistem",
    label: "Fiyat listemdeki en pahalı ve en ucuz ürün hangisi?",
    keywords: ["en pahalı ürün", "en ucuz ürün", "fiyat listesi aralığı"],
    compute: (ctx) => {
      if (ctx.priceListItems.length === 0) return "Fiyat listenizde henüz bir ürün/hizmet yok.";
      const sorted = [...ctx.priceListItems].sort((a, b) => (a.price || 0) - (b.price || 0));
      const cheapest = sorted[0];
      const priciest = sorted[sorted.length - 1];
      return `En ucuz "${cheapest.name}" (${formatTL(cheapest.price)}), en pahalı "${priciest.name}" (${formatTL(priciest.price)}).`;
    },
  },
  {
    id: "price_list_avg_price",
    category: "Sistem",
    label: "Fiyat listemdeki ortalama fiyat ne kadar?",
    keywords: ["fiyat listesi ortalama fiyat", "ortalama ürün fiyatı"],
    compute: (ctx) => {
      if (ctx.priceListItems.length === 0) return "Fiyat listenizde henüz bir ürün/hizmet yok.";
      const avg = ctx.priceListItems.reduce((sum, p) => sum + (p.price || 0), 0) / ctx.priceListItems.length;
      return `Fiyat listenizdeki ortalama fiyat ${formatTL(avg)}.`;
    },
  },
  {
    id: "company_settings_completeness",
    category: "Sistem",
    label: "İşletme bilgilerim ne kadar dolu?",
    keywords: ["işletme bilgisi doluluk", "işletme bilgileri eksik mi"],
    compute: (ctx) => {
      const fields = [ctx.companySettings?.companyName, ctx.companySettings?.address, ctx.companySettings?.phone, ctx.companySettings?.email, ctx.companySettings?.taxNumber];
      const filled = fields.filter(Boolean).length;
      return `İşletme bilgilerinizin ${filled}/${fields.length} alanı dolu.`;
    },
  },
  {
    id: "logo_uploaded",
    category: "Sistem",
    label: "Logom yüklü mü?",
    keywords: ["logo yüklü mü", "firma logosu var mı"],
    compute: (ctx) => (ctx.companySettings?.logoUrl ? "Evet, logonuz yüklü." : "Henüz bir logo yüklemediniz — teklif PDF'lerinizde ve portalda daha profesyonel görünmesi için ekleyebilirsiniz."),
  },
  {
    id: "lead_capture_link_active",
    category: "Sistem",
    label: "Müşteri Kazanma Linkim aktif mi?",
    keywords: ["müşteri kazanma linki aktif mi", "lead capture link"],
    compute: (ctx) => (ctx.companySettings?.leadCaptureToken ? "Evet, Müşteri Kazanma Linkiniz aktif — Ayarlar'dan paylaşabilirsiniz." : "Müşteri Kazanma Linkiniz henüz oluşturulmamış görünüyor."),
  },
  {
    id: "default_kdv_rate_value",
    category: "Sistem",
    label: "Varsayılan KDV oranım kaç?",
    keywords: ["varsayılan kdv oranı", "default kdv"],
    compute: (ctx) => `Varsayılan KDV oranınız %${ctx.companySettings?.defaultKdvRate ?? 20}.`,
  },
  {
    id: "customer_notifications_enabled_status",
    category: "Sistem",
    label: "Müşteri bildirimleri açık mı?",
    keywords: ["müşteri bildirimleri açık mı", "customer notification durumu"],
    compute: (ctx) => (ctx.companySettings?.customerNotificationsEnabled !== false ? "Evet, müşteri bildirimleri açık." : "Hayır, müşteri bildirimlerini kapatmışsınız."),
  },
  {
    id: "appointment_reminders_enabled_status",
    category: "Sistem",
    label: "Randevu hatırlatmaları açık mı?",
    keywords: ["randevu hatırlatması açık mı", "otomatik hatırlatma durumu"],
    visibleIf: (sector) => supportsSelfBooking(sector),
    compute: (ctx) => (ctx.companySettings?.appointmentRemindersEnabled !== false ? "Evet, otomatik randevu hatırlatma e-postaları açık." : "Hayır, otomatik randevu hatırlatmalarını kapatmışsınız."),
  },
  {
    id: "pdf_template_count",
    category: "Sistem",
    label: "Kaç özel PDF şablonum var?",
    keywords: ["pdf şablon sayısı", "kaç teklif şablonum var"],
    compute: (ctx) => {
      const count = (ctx.pdfTemplates || []).length;
      return count > 0 ? `${count} özel PDF şablonunuz var.` : "Henüz özel bir PDF şablonu oluşturmadınız, hazır şablonlardan birini kullanıyorsunuz.";
    },
  },
  {
    id: "using_custom_pdf_template",
    category: "Sistem",
    label: "Şu anda özel bir PDF şablonu mu kullanıyorum?",
    keywords: ["özel şablon kullanıyor muyum", "seçili pdf şablonu"],
    compute: (ctx) => {
      const isCustom = ctx.companySettings?.pdfTemplateKey && (ctx.pdfTemplates || []).some((t) => t.id === ctx.companySettings.pdfTemplateKey);
      return isCustom ? "Evet, kendi oluşturduğunuz özel bir PDF şablonunu kullanıyorsunuz." : "Hayır, hazır (galeri) şablonlardan birini kullanıyorsunuz.";
    },
  },
  {
    id: "deal_line_items_usage_count",
    category: "Sistem",
    label: "Kaç kaydımda kalem bazlı ürün/hizmet listesi kullanılmış?",
    keywords: ["kalem bazlı kayıt sayısı", "çoklu kalem kullanan teklif"],
    compute: (ctx) => {
      const dealIds = new Set((ctx.dealLineItems || []).map((li) => li.dealId));
      return dealIds.size > 0 ? `${dealIds.size} kaydınızda kalem bazlı ürün/hizmet listesi kullanılmış.` : "Henüz kalem bazlı ürün/hizmet listesi kullanan bir kaydınız yok.";
    },
  },
  {
    id: "avg_line_items_per_deal",
    category: "Sistem",
    label: "Kalem kullanan kayıtlarda ortalama kaç kalem var?",
    keywords: ["ortalama kalem sayısı", "kayıt başına kalem sayısı"],
    compute: (ctx) => {
      const lineItems = ctx.dealLineItems || [];
      if (lineItems.length === 0) return "Henüz kalem bazlı ürün/hizmet listesi kullanan bir kaydınız yok.";
      const dealIds = new Set(lineItems.map((li) => li.dealId));
      return `Kalem kullanan kayıtlarınızda ortalama ${(lineItems.length / dealIds.size).toFixed(1)} kalem var.`;
    },
  },

  // ---- Analiz (teşhis — birden fazla sinyali birleştirip yorum/öneri üretir) ----
  {
    id: "diagnosis_why_losing",
    category: "Analiz",
    label: "Neden satışlarımı/kayıtlarımı kaybediyorum?",
    keywords: ["neden kaybediyorum", "satış kaybı analizi", "neden satamıyorum", "kayıp analizi teşhis", "neyi değiştirmem lazım"],
    compute: (ctx) => {
      const lost = ctx.deals.filter((d) => d.stage === "kaybedildi" && d.lostReason);
      if (lost.length < 3) return "Nedeni belirtilmiş yeterli kayıp kaydınız yok (en az birkaç kayıt gerekiyor) — kayıp nedenini not etmeye devam edin, zamanla burada net bir örüntü görebiliriz.";
      const totals = {};
      lost.forEach((d) => { totals[d.lostReason] = (totals[d.lostReason] || 0) + 1; });
      const [topReason, topCount] = topEntry(totals);
      const share = Math.round((topCount / lost.length) * 100);
      const advice = REASON_ADVICE[topReason] || "Bu nedeni daha yakından incelemek için ilgili kayıtların notlarına tekrar göz atmanızda fayda var.";
      if (share >= 40) return `Kayıplarınızın %${share}'i "${topReason}" nedeniyle (${topCount}/${lost.length}) — baskın bir örüntü var. ${advice}`;
      return `Kayıplarınız birçok farklı nedene dağılmış, tek bir baskın neden yok (en sık: "${topReason}", %${share}). Genel bir sorundan çok kayıt bazlı özel durumlar öne çıkıyor gibi görünüyor.`;
    },
  },
  {
    id: "diagnosis_win_rate_trend",
    category: "Analiz",
    label: "Satış performansım iyileşiyor mu kötüleşiyor mu?",
    keywords: ["performansım nasıl gidiyor", "satış trendi", "iyileşiyor muyum kötüleşiyor muyum"],
    compute: (ctx) => {
      const now = new Date();
      const thisBounds = getRangeBounds("bu_ay");
      const lastStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lastEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
      const closedThis = ctx.deals.filter((d) => (d.stage === "kazanildi" || d.stage === "kaybedildi") && inRange(d.closedAt || d.createdAt, thisBounds));
      const closedLast = ctx.deals.filter((d) => (d.stage === "kazanildi" || d.stage === "kaybedildi") && inRange(d.closedAt || d.createdAt, { start: lastStart, end: lastEnd }));
      if (closedThis.length < 3 || closedLast.length < 3) return "Sağlıklı bir trend karşılaştırması için bu ay ve geçen ay yeterli sayıda sonuçlanmış kaydınız yok.";
      const winRateThis = closedThis.filter((d) => d.stage === "kazanildi").length / closedThis.length;
      const winRateLast = closedLast.filter((d) => d.stage === "kazanildi").length / closedLast.length;
      const diff = Math.round((winRateThis - winRateLast) * 100);
      if (diff <= -10) return `Kazanma oranınız geçen aya göre ${Math.abs(diff)} puan düştü (%${Math.round(winRateLast * 100)} → %${Math.round(winRateThis * 100)}) — kayıp nedenlerinize bakmanızda fayda var, "neden kaybediyorum" diye de sorabilirsiniz.`;
      if (diff >= 10) return `Kazanma oranınız geçen aya göre ${diff} puan arttı (%${Math.round(winRateLast * 100)} → %${Math.round(winRateThis * 100)}) — iyi gidiyor, bu ay ne farklı yaptığınızı not etmeye değer.`;
      return `Kazanma oranınız geçen aya göre görece stabil (%${Math.round(winRateLast * 100)} → %${Math.round(winRateThis * 100)}).`;
    },
  },
  {
    id: "diagnosis_follow_up_habits",
    category: "Analiz",
    label: "Takip alışkanlıklarımda bir sorun var mı?",
    keywords: ["takip alışkanlığım nasıl", "hatırlatma eksikliği teşhis", "takibimi nasıl iyileştiririm"],
    compute: (ctx) => {
      const open = ctx.deals.filter((d) => d.stage !== "kazanildi" && d.stage !== "kaybedildi");
      if (open.length === 0) return "Şu anda açık bir kaydınız yok.";
      const todayStr = new Date().toISOString().slice(0, 10);
      const missing = open.filter((d) => !d.reminderDate).length;
      const overdue = open.filter((d) => d.reminderDate && d.reminderDate < todayStr).length;
      const missingShare = Math.round((missing / open.length) * 100);
      if (missingShare >= 40 || overdue >= 5) {
        return `Açık kayıtlarınızın %${missingShare}'inde hiç hatırlatma tarihi yok, ${overdue} tanesinin hatırlatması da geçmiş — bu, takibi kaçırıp kayıt kaybetmenin yaygın bir nedenidir. Her açık kayda bir sonraki adım için hatırlatma tarihi eklemeyi alışkanlık hâline getirin.`;
      }
      return `Takip alışkanlıklarınız iyi görünüyor — açık kayıtlarınızın çoğunda hatırlatma tarihi var, geciken hatırlatma sayınız (${overdue}) düşük.`;
    },
  },
  {
    id: "diagnosis_retention_risk",
    category: "Analiz",
    label: "Müşteri kaybetme riskim var mı?",
    keywords: ["müşteri kaybetme riski", "churn riski teşhis", "müşterilerim uzaklaşıyor mu"],
    compute: (ctx) => {
      if (ctx.passiveCustomerRate == null) return "Bu analiz için henüz yeterli müşteri/kayıt verisi yok.";
      const rate = Math.round(ctx.passiveCustomerRate);
      if (rate >= 40) return `Müşterilerinizin %${rate}'i 90 gündür işlem yapmıyor — bu yüksek bir oran, kaybetme riski taşıyorsunuz. Bu müşterilere kişisel bir hatırlatma mesajı veya küçük bir kampanya göndermeyi değerlendirin.`;
      if (rate >= 20) return `Müşterilerinizin %${rate}'i pasif durumda — takip edilmeye değer ama henüz alarm verici değil.`;
      return `Pasif müşteri oranınız düşük (%${rate}) — müşteri bağlılığınız şu an sağlıklı görünüyor.`;
    },
  },
  {
    id: "diagnosis_pricing_signal",
    category: "Analiz",
    label: "Fiyatımı gözden geçirmeli miyim?",
    keywords: ["fiyatımı değiştirmeli miyim", "fiyat sorunu var mı", "fiyat gözden geçirme sinyali"],
    compute: (ctx) => {
      const bounds = getRangeBounds("son_6_ay");
      const lost = ctx.deals.filter((d) => d.stage === "kaybedildi" && d.lostReason && inRange(d.closedAt || d.createdAt, bounds));
      if (lost.length < 3) return "Son 6 ayda nedeni belirtilmiş yeterli kayıp kaydınız yok, güvenilir bir sinyal veremiyorum.";
      const priceLost = lost.filter((d) => d.lostReason === "Yüksek fiyat").length;
      const share = Math.round((priceLost / lost.length) * 100);
      if (share >= 35) return `Son 6 aydaki kayıplarınızın %${share}'i "Yüksek fiyat" nedeniyle — bu, fiyatlandırmanızı gözden geçirmeniz için makul bir sinyal. İndirim yerine paketleme veya ek değer eklemeyi deneyebilirsiniz.`;
      return `Son 6 ayda "Yüksek fiyat" kayıplarınızın payı %${share} — fiyat, kayıplarınızda baskın bir neden gibi görünmüyor.`;
    },
  },
  {
    id: "diagnosis_stalled_deals",
    category: "Analiz",
    label: "Kayıtlarım neden takılı kalıyor?",
    keywords: ["kayıtlarım neden ilerlemiyor", "teklif takılı kaldı teşhis", "açık kayıt sorunu"],
    compute: (ctx) => {
      const open = ctx.deals.filter((d) => d.stage !== "kazanildi" && d.stage !== "kaybedildi");
      if (open.length === 0) return "Şu anda açık bir kaydınız yok.";
      const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
      const stalled = open.filter((d) => new Date(d.createdAt).getTime() < cutoff).length;
      const share = Math.round((stalled / open.length) * 100);
      if (share >= 40) return `Açık kayıtlarınızın %${share}'i 30 günden uzun süredir açık — bu kayıtlarda net bir "evet/hayır" cevabı almak için daha proaktif bir takip deneyin; uzayan belirsizlik genelde kayba dönüşür.`;
      return `Açık kayıtlarınızın çoğu makul bir sürede ilerliyor (%${share}'i 30 günden eski) — takılı kalma şu an büyük bir sorun gibi görünmüyor.`;
    },
  },
  {
    id: "diagnosis_sla_health",
    category: "Analiz",
    label: "Destek sürecim satışlarımı etkiliyor olabilir mi?",
    keywords: ["destek satışı etkiliyor mu", "sla satış ilişkisi", "destek kalitesi teşhis"],
    compute: (ctx) => {
      if (ctx.tickets.length === 0) return "Henüz destek talebi verisi yok, bu analiz için erken.";
      const resolved = ctx.tickets.filter((t) => TERMINAL_STATUSES.includes(t.status));
      const rate = Math.round((resolved.length / ctx.tickets.length) * 100);
      if (ctx.breachedTicketsCount >= 3 || rate < 50) {
        return `${ctx.breachedTicketsCount} talebiniz SLA'yı aşmış ve çözülme oranınız %${rate} — yavaş/eksik destek genelde müşteri güvenini ve tekrar satın almayı olumsuz etkiler. Önce bekleyen talepleri kapatmaya odaklanın.`;
      }
      return `Destek sürecinizde (SLA aşımı ${ctx.breachedTicketsCount}, çözülme oranı %${rate}) belirgin bir sorun görünmüyor — bu şu an satışlarınızı olumsuz etkileyen bir faktör gibi durmuyor.`;
    },
  },
  {
    id: "diagnosis_top_priority",
    category: "Analiz",
    label: "Şu an en çok neye odaklanmalıyım?",
    keywords: ["neyi değiştirmem lazım genel", "en öncelikli sorunum ne", "şimdi ne yapmalıyım", "genel teşhis"],
    compute: (ctx) => {
      const candidates = [];
      if (ctx.breachedTicketsCount > 0) {
        candidates.push({ score: ctx.breachedTicketsCount * 3, text: `${ctx.breachedTicketsCount} destek talebinizin SLA süresi geçmiş — müşteri güvenini doğrudan etkiler, önce bunlara bakın.` });
      }
      const open = ctx.deals.filter((d) => d.stage !== "kazanildi" && d.stage !== "kaybedildi");
      const todayStr = new Date().toISOString().slice(0, 10);
      const overdueReminders = open.filter((d) => d.reminderDate && d.reminderDate < todayStr).length;
      if (overdueReminders > 0) {
        candidates.push({ score: overdueReminders * 2, text: `${overdueReminders} kaydınızın hatırlatma tarihi geçmiş — bunları güncelleyip takip etmek muhtemelen en hızlı kazanımı sağlar.` });
      }
      if (ctx.passiveCustomerRate != null && ctx.passiveCustomerRate >= 40) {
        candidates.push({ score: ctx.passiveCustomerRate, text: `Müşterilerinizin %${Math.round(ctx.passiveCustomerRate)}'i pasif durumda — bir yeniden etkileşim kampanyası düşünmelisiniz.` });
      }
      const bounds6m = getRangeBounds("son_6_ay");
      const lost6m = ctx.deals.filter((d) => d.stage === "kaybedildi" && d.lostReason && inRange(d.closedAt || d.createdAt, bounds6m));
      if (lost6m.length >= 3) {
        const priceLost = lost6m.filter((d) => d.lostReason === "Yüksek fiyat").length;
        if (priceLost / lost6m.length >= 0.35) {
          candidates.push({ score: (priceLost / lost6m.length) * 50, text: "Son 6 ayda kayıplarınızın önemli bir kısmı \"Yüksek fiyat\" nedeniyle — fiyatlandırmanızı gözden geçirmeyi düşünün." });
        }
      }
      if (candidates.length === 0) return "Şu an belirgin bir alarm sinyali görünmüyor — genel durumunuz istikrarlı, düzenli takibe devam edin.";
      return candidates.sort((a, b) => b.score - a.score)[0].text;
    },
  },
];

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

const ADVISOR_TIPS = [
  { category: "Satış", q: "Satışlarımı nasıl artırabilirim?", keywords: ["satışlarımı nasıl arttırabilirim", "arttırmak", "ciro artırmak", "satış artırma", "daha çok satış"], a: "Tek bir taktiğe değil üç alana birden bakın: yeni müşteri kazanmak (pazarlama, referans), mevcut müşteriye daha fazla satmak (çapraz satış, yeniden alım hatırlatması) ve kayıp oranını azaltmak (kaybedilen tekliflerin nedenini analiz etmek). Genelde en hızlı sonuç, elinizdeki açık kayıtların takibini sıkılaştırmaktan (hatırlatma tarihleri, zamanında yanıt) gelir — yeni müşteri bulmaktan daha ucuzdur." },
  { category: "Nakit Akışı", q: "Nakit akışımı nasıl iyileştiririm?", a: "Kâr ile nakit farklıdır — kârlı olsanız bile tahsilat gecikirse nakit sıkışabilir. Vadeli satışlarda kısmi peşinat almak, tahsilat takibini düzenli yapmak (Finans → Bekleyen Alacak) ve tekrarlayan giderlerinizi önceden bilmek nakit akışını daha öngörülebilir kılar." },
  { category: "Fiyatlandırma", q: "Fiyatımı nasıl belirlemeliyim?", a: "Sadece maliyeti değil, rakiplerinizin fiyatını ve müşterinin algıladığı değeri de hesaba katın. Çok düşük fiyat kâr bırakmaz, çok yüksek fiyat müşteri kaybettirir — küçük bir müşteri grubuyla test ederek ayarlamak risksiz bir yöntemdir." },
  { category: "Müşteri Sadakati", q: "Mevcut müşterilerimi nasıl elde tutarım?", a: "Yeni müşteri kazanmak, mevcut müşteriyi elde tutmaktan genelde daha pahalıdır. Düzenli iletişim, hızlı destek yanıtı ve küçük jestler (doğum günü, sadakat indirimi) uzun vadede en çok geri dönüşü sağlar." },
  { category: "Pazarlama", q: "Sınırlı bütçeyle nasıl pazarlama yaparım?", a: "Önce mevcut müşterilerinizden referans isteyin — en ucuz ve en güvenilir pazarlama budur. Sosyal medyada düzenli ama az sayıda paylaşım, tek seferlik büyük kampanyadan daha sürdürülebilirdir." },
  { category: "Satış", q: "Kaybettiğim satışlardan nasıl ders çıkarırım?", a: "Kayıp nedenini her zaman not edin (Binerly'de otomatik istenir) — belirli bir dönemde aynı neden tekrar ediyorsa (örn. \"yüksek fiyat\") bu, fiyatlandırma veya değer anlatımınızda sistemli bir sorun olduğunun işaretidir." },
  { category: "Ekip Yönetimi", q: "Küçük ekibimi nasıl daha verimli yönetirim?", a: "Herkesin net bir sorumluluk alanı olsun, aynı işi iki kişi paralel yapmasın. Haftalık kısa bir değerlendirme (neler bitti, neler bekliyor) büyük toplantılardan daha etkilidir." },
  { category: "Zaman Yönetimi", q: "Günlük işlerime nasıl öncelik veririm?", a: "Güne başlarken \"bugün gerçekten yapılması gerekenler\" listesi (Pano'daki \"Bugün ne yapmalıyım\") 3-5 maddeyi geçmesin. Acil ama önemsiz işler (bildirimler, küçük sorular) genelde beklettirilebilir." },
  { category: "Marka", q: "Küçük işletmem nasıl daha güvenilir görünür?", a: "Tutarlı iletişim (aynı logo, aynı ton), zamanında yanıt ve net bir iade/iptal politikası büyük bütçeli reklamdan daha fazla güven yaratır. Müşteri yorumları/referanslar varsa görünür kılın." },
  { category: "Sosyal Medya", q: "Sosyal medyada ne paylaşmalıyım?", a: "Sadece ürün tanıtımı değil, işin arkasındaki süreci (üretim, ekip, müşteri hikayeleri) de gösterin — insanlar markalardan değil insanlardan alışveriş yapmayı sever." },
  { category: "Müzakere", q: "Müşteriyle fiyat pazarlığında nasıl davranmalıyım?", a: "Doğrudan indirim yerine değer ekleyin (ek hizmet, daha hızlı teslim) — bu, fiyatınızı düşürmeden müşteriyi tatmin edebilir. Sürekli indirim vermek, gelecekte \"normal fiyatın\" pazarlık payı olduğu algısı yaratır." },
  { category: "Rekabet", q: "Rakiplerimi nasıl takip etmeliyim?", a: "Fiyatlarını kopyalamak yerine neyi farklı/daha iyi yaptıklarını anlayın. Kendi güçlü yönünüze (hız, kişisel ilgi, uzmanlık) odaklanmak, sürekli fiyat savaşından daha sürdürülebilir bir stratejidir." },
  { category: "Girişimcilik", q: "Tükenmişlik hissediyorum, ne yapmalıyım?", a: "Küçük işletme sahipliğinde her şeyi tek başına yapma isteği yaygın bir tükenmişlik nedenidir. Tekrar eden işleri (hatırlatma, raporlama) sistemlere bırakmak gerçek bir zaman kazancı sağlar." },
  { category: "Yeni İşletme", q: "İşimin ilk aylarında nelere odaklanmalıyım?", a: "İlk aylarda çok kanal/çok ürün denemek yerine, tek bir müşteri segmentinde gerçekten iyi olmaya odaklanın. İlk 10-20 gerçek müşterinizden aldığınız geri bildirim, herhangi bir pazar araştırmasından daha değerlidir." },
  { category: "Networking", q: "İş bağlantılarımı nasıl genişletirim?", a: "Sektör etkinlikleri/odalar dışında, mevcut müşterilerinizin tanıdıkları da güçlü bir ağdır — memnun bir müşteriden doğrudan tavsiye istemek genelde soğuk bir tanıtımdan daha etkilidir." },
  { category: "Şikayet Yönetimi", q: "Müşteri şikayetlerini nasıl ele almalıyım?", a: "Hızlı yanıt (SLA takibi bunun için var) ve savunmaya geçmeden dinlemek en önemli iki adımdır. İyi çözülmüş bir şikayet, memnun bir müşteriden bile daha güçlü bir sadakat yaratabilir." },
  { category: "Büyüme", q: "İşimi ne zaman büyütmeliyim (yeni çalışan, yeni ürün)?", a: "Talep sürekli kapasitenizi aşıyorsa ve bu geçici bir dönem değilse büyüme sinyali olabilir. Aceleyle büyümek yerine, mevcut süreçlerinizin yeni hacmi kaldırıp kaldıramayacağını önce test edin." },
  { category: "İşe Alım", q: "Doğru elemanı nasıl bulurum?", keywords: ["eleman bulma", "personel bulma", "çalışan arama", "doğru çalışanı bulma"], a: "İlanı sadece görev tanımıyla değil, ilk 90 günde başaracağı somut 2-3 hedefle yazın — bu, doğru adayları çeker ve yanlış beklentiyle gelenleri elemenizi sağlar. Mülakatta geçmişte gerçekten yaptığı bir işi detaylıca anlatmasını isteyin (\"anlat\" yerine \"nasıl yaptın\"), genel cevaplar genelde deneyim eksikliğinin işaretidir." },
  { category: "İşe Alım", q: "Yeni çalışanı işe nasıl daha hızlı adapte ederim (oryantasyon)?", a: "İlk haftada net bir kontrol listesi (kimden ne öğrenecek, hangi sistemlere erişimi olacak, ilk göreve ne zaman başlayacak) belirsizlikten doğan yavaşlamayı önler. Sık yapılan hatalardan biri yeni çalışanı hemen tam yüke koymaktır — ilk 2 haftada deneyimli biriyle birlikte gölge çalışma, daha az hataya yol açar." },
  { category: "Sözleşmeler", q: "Müşteri sözleşmelerimde nelere dikkat etmeliyim?", a: "Kapsam (tam olarak ne yapılacak, ne yapılmayacak), ödeme takvimi ve gecikme durumunda ne olacağı, iptal/erteleme koşulları en sık ihtilaf çıkan üç maddedir — bunları net yazmak sonradan tartışmayı büyük ölçüde azaltır. Standart bir şablon oluşturup her müşteride küçük değişikliklerle kullanmak sıfırdan yazmaktan hızlıdır; bağlayıcı maddeler için şablona bir kez avukat onayı aldırmak uzun vadede ucuza gelir." },
  { category: "Sözleşmeler", q: "Sözlü anlaşmalarla mı çalışmalıyım yoksa yazılı mı?", a: "İş büyüdükçe hafıza ve iyi niyete güvenmek risklidir — en azından teklif/onay yazışmasını (e-posta, WhatsApp mesajı, PDF teklif) saklamak asgari bir kayıttır. Tutarı, tarihi ve kapsamı içeren tek sayfalık basit bir onay formu bile, ilerideki \"böyle anlaşmamıştık\" tartışmalarının çoğunu önler." },
  { category: "Stok Yönetimi", q: "Stok seviyemi nasıl doğru tutarım?", a: "ABC analizi denen basit bir yöntem işe yarar: ürünlerinizi cirodaki paya göre sıralayın, en çok kazandıran %20'lik dilimi (A grubu) sıkı takip edin, geri kalanı daha gevşek kontrol edin. Aşırı stok nakdinizi kilitler, yetersiz stok satış kaybettirir — dengeyi geçmiş 2-3 ayın satış hızına göre ayarlamak tahminden daha güvenilirdir." },
  { category: "Stok Yönetimi", q: "Ölü stoktan (satılmayan üründen) nasıl kurtulurum?", a: "Belirli bir süredir (örn. 90 gün) hiç hareket etmeyen kalemleri düzenli olarak listeleyip ayrı değerlendirin — biriktirmek yerine erken fark etmek kayıp tutarını küçük tutar. Kampanya/paket satışıyla eritmek tamamen zarar yazmaktan genelde daha iyidir; ama o ürünü neden fazla aldığınızı not edin ki hata tekrarlanmasın." },
  { category: "E-ticaret", q: "Online satışa yeni başlıyorum, nelere dikkat etmeliyim?", keywords: ["e-ticarete başlamak", "online mağaza açmak", "internetten satış"], a: "Önce tek bir kanalda (kendi site veya tek bir pazaryeri) düzgün çalışmayı öğrenin, aynı anda beş platformda birden başlamak stok ve sipariş takibini karmaşıklaştırır. Kargo/iade sürecini netleştirmeden reklam vermek memnuniyetsiz ilk müşteri deneyimleri yaratır — süreç oturduktan sonra büyütün." },
  { category: "E-ticaret", q: "Online mağazamda terk edilmiş sepetleri nasıl azaltırım?", a: "En sık neden beklenmedik ek maliyettir (kargo ücretinin son adımda çıkması gibi) — bunu en baştan göstermek terk oranını düşürür. Ödeme adımını mümkün olduğunca kısaltmak (gereksiz form alanlarını kaldırmak) ve tamamlanmayan siparişe kısa bir hatırlatma göndermek de işe yarayan basit adımlardır." },
  { category: "Mevsimsellik", q: "Sezonluk talep dalgalanmasına nasıl hazırlanmalıyım?", a: "Geçmiş yılların aynı dönemine ait satış verisi en güvenilir tahmin kaynağınızdır — sezon başlamadan stok/personel kararını buna göre verin, sezon ortasında toparlamak genelde geç kalır. Düşük sezonda nakit sıkışmasına karşı önceden bir tampon ayırmak (tekrarlayan giderlerinizi bilerek), yüksek sezon kârını düşük sezona taşımanızı sağlar." },
  { category: "Franchise", q: "İşimi franchise/bayilik modeliyle büyütmeyi düşünüyorum, nereden başlamalıyım?", a: "Franchise vermeden önce kendi tek şubenizde süreçlerinizin (eğitim, tedarik, kalite standardı) yazılı ve tekrarlanabilir olduğundan emin olun — belgelenmemiş bir iş modeli başka birine devredilemez. İlk bayiyi mümkünse güvendiğiniz, yakından takip edebileceğiniz biriyle pilot olarak başlatmak, hatanın büyümeden görülmesini sağlar." },
  { category: "Kriz Yönetimi", q: "Beklenmedik bir kriz anında (talep düşüşü, tedarik sorunu) ilk ne yapmalıyım?", a: "Panikle karar vermek yerine önce net bir tablo çıkarın: elinizdeki nakit kaç ay yeter, hangi giderler ertelenebilir/kesilebilir, hangi müşteriler/gelirler en risksiz. Durumu müşterilerinize şeffaf ama sakin bir dille erken bildirmek, sessiz kalıp güven kaybetmekten çok daha iyidir." },
  { category: "Kriz Yönetimi", q: "Krizde çalışanlarımı nasıl bilgilendirmeliyim?", a: "Belirsizlik kötü haberden daha fazla kaygı yaratır — durum netleşmemiş olsa bile ne bildiğinizi ve ne zaman güncelleme vereceğinizi paylaşmak ekibi sakinleştirir. Kararları (kesinti, öncelik değişikliği) toplu duyurmadan önce mümkünse doğrudan etkilenenlerle önce konuşun." },
  { category: "Rekabet", q: "Rakip analizini nasıl daha sistemli yaparım?", a: "Ayda bir düzenli olarak rakiplerin fiyat, kampanya ve müşteri yorumlarına (Google/sosyal medya) bakıp kısa not tutmak, hafızaya güvenmekten daha güvenilirdir. Sadece ne yaptıklarını değil müşteri yorumlarında neyi eleştirdiklerini de takip edin — rakibin zayıf noktası sizin fırsatınız olabilir." },
  { category: "Fiyatlandırma", q: "Fiyat artışını müşterilerime nasıl duyurmalıyım?", a: "Artışı son ana bırakmadan (en az 2-4 hafta önceden) ve nedenini kısaca açıklayarak (maliyet artışı, kalite iyileştirme) duyurmak tepkiyi azaltır. Sadık/uzun süreli müşterilere geçiş dönemi için küçük bir esneklik (eski fiyatla son sipariş hakkı gibi) tanımak, ilişkiyi korurken artışı kabul edilebilir kılar." },
  { category: "Müşteri Kaybı Analizi", q: "Müşteri kaybımı (churn) nasıl analiz etmeliyim?", keywords: ["churn analizi", "müşteri kaybı analizi", "müşteri neden ayrılıyor"], a: "Tek tek kaybedilen müşteriye üzülmek yerine belirli bir dönemdeki kayıpları bir arada listeleyip ortak nedeni arayın — fiyat mı, hizmet gecikmesi mi, rakip mi tekrar ediyor? Kaybeden müşteriyle mümkünse kısa bir \"neden ayrıldınız\" görüşmesi yapmak, iç varsayımlarınızdan çok daha doğru bilgi verir." },
  { category: "Muhasebe", q: "Küçük işletme sahibi olarak muhasebe konusunda nelere dikkat etmeliyim?", a: "Gelir-gider kayıtlarını gerçek zamanlı tutmak (ay sonuna bırakmamak) hem nakit durumunuzu net görmenizi sağlar hem de yıl sonunda sürpriz yaşamamanızı. Fatura/gider belgelerini düzenli arşivlemek ve mevzuat takibini bir mali müşavire bırakmak, kendi vaktinizi işin büyümesine ayırmanızı sağlar — bu bir hukuki/mali tavsiye değildir, kendi durumunuz için mutlaka bir uzmana danışın." },
  { category: "Vergi", q: "Vergi yükümlülüklerimi nasıl takip etmeliyim?", a: "Beyanname/ödeme tarihlerini kendi takviminize hatırlatma olarak işlemek, son güne kalıp cezai gecikmeye düşmekten daha güvenlidir. Bu alan sık değişen mevzuata tabidir — güncel oran ve yükümlülükler için mutlaka bir mali müşavirle çalışın, burada verilen bilgi genel farkındalık amaçlıdır." },
  { category: "Yatırım", q: "İşimi büyütmek için dışarıdan finansman almalı mıyım?", a: "Önce borç mu (kredi) yoksa ortaklık mı (yatırımcı) istediğinizi netleştirin — borç kontrolü sizde bırakır ama geri ödeme yükümlülüğü getirir, ortaklık yükü paylaştırır ama karar gücünüzü paylaştırır. Finansmanı almadan önce parayı tam olarak neye harcayacağınızı ve ne kadar ek gelir getireceğini yazılı netleştirmek, \"büyürüz nasılsa\" iyimserliğinden daha sağlıklıdır." },
  { category: "Yatırım", q: "Kredi kullanmadan önce nelere dikkat etmeliyim?", a: "Aylık geri ödemenin işletmenizin ortalama nakit akışına oranını hesaplayın — düşük sezonda bile ödemeyi karşılayıp karşılayamayacağınızı görmeden kredi almak risklidir. Farklı bankaların koşullarını (faiz, erken kapama, ek masraf) karşılaştırmak ve nihai kararı bir mali danışmanla teyit etmek, sadece en düşük görünen faize bakmaktan daha güvenlidir." },
  { category: "Dijital Pazarlama", q: "Google reklamlarına nasıl başlamalıyım?", keywords: ["google ads", "google reklam", "arama reklamı"], a: "Geniş bir bütçeyle her şeyi denemek yerine, en çok kâr getiren tek bir ürün/hizmet ve dar bir hedef kitle (bölge, arama terimi) ile küçük bütçeli test başlatın. İlk haftalarda hangi aramaların tıklama getirdiğini değil hangisinin gerçek satışa dönüştüğünü izleyin — tıklama ucuz, dönüşüm değerlidir." },
  { category: "Dijital Pazarlama", q: "Meta (Facebook/Instagram) reklamlarında bütçemi nasıl verimli kullanırım?", keywords: ["facebook reklamı", "instagram reklamı", "meta ads"], a: "Yeni başlarken geniş kitleye tek reklam yerine 2-3 farklı görsel/mesaj varyasyonunu küçük bütçeyle test edip en iyi performans göstereni büyütün. Soğuk kitleye satış reklamı yerine önce marka farkındalığı, sonra sizi ziyaret edenlere yeniden hedefleme genelde daha az maliyetle daha çok dönüşüm getirir." },
  { category: "Dijital Pazarlama", q: "SEO (Google'da üst sıralarda çıkma) için ne yapmalıyım?", keywords: ["seo nasıl yapılır", "google'da üst sıraya çıkmak", "arama motoru optimizasyonu"], a: "Küçük işletme için en yüksek getiri genelde genel anahtar kelimelerde değil, bölge + hizmet kombinasyonunda (\"Kadıköy klima servisi\" gibi) rekabettir — burada üst sıraya çıkmak çok daha kolaydır. Site içeriğinizde bu ifadeleri doğal şekilde kullanmak ve ayda 1-2 yeni içerik eklemek, tek seferlik teknik ayardan daha kalıcı sonuç verir." },
  { category: "E-posta Pazarlaması", q: "E-posta pazarlamasına nasıl başlamalıyım?", a: "Elinizdeki izinli müşteri listesine ayda 1-2 kez, satış baskısı yapmayan gerçek değer (ipucu, kampanya, yenilik) içeren kısa bir e-posta göndermek, sık ve agresif göndermekten daha az abonelikten çıkma yaratır. Konu başlığı e-postanın açılıp açılmayacağını belirleyen en önemli faktördür — birkaç farklı başlık deneyip hangisinin daha çok açıldığına bakmak zamanla işe yarar bir sezgi kazandırır." },
  { category: "Müzakere", q: "Müşteri \"rakip daha ucuza yapıyor\" derse ne yanıt vermeliyim?", a: "Hemen fiyat kırmak yerine önce aynı kapsamda olup olmadığını sorun — çoğu zaman rakip teklifi farklı bir kapsam/kalitededir, bu farkı net anlatmak fiyatı savunmaktan daha etkilidir. Gerçekten aynı kapsamdaysa indirim yerine ek değer (garanti süresi, öncelikli destek) önermek kâr marjınızı korur." },
  { category: "Delegasyon", q: "İşleri ekibime nasıl devredebilirim (delegasyon)?", a: "\"Nasıl yapacağını\" değil \"ne sonucu istediğinizi\" tarif edin — mikro yönetim hem sizin zamanınızı hem çalışanın özgüvenini tüketir. İlk birkaç seferde küçük, geri dönüşü kolay işlerle başlayıp güven oluşturmak, doğrudan kritik bir işi devretmekten daha güvenlidir." },
  { category: "İş-Yaşam Dengesi", q: "İş ile özel hayatımı nasıl dengelerim?", a: "Net bir \"kapanış\" rutini olmadan (belirli saatten sonra bildirim bakmamak gibi) küçük işletme sahipliği kolayca 7/24 işe dönüşür. Tekrar eden soruları/işleri sisteme veya ekibe bırakmak, sürekli \"acil\" hissi yaratan işleri azaltır." },
  { category: "Ortaklık", q: "İş ortağımla anlaşmazlıkları nasıl yönetmeliyim?", a: "Kararların kim tarafından, nasıl alınacağı (eşit oy mu, alan bazlı yetki mi) baştan yazılı netleşmediyse her anlaşmazlık güç mücadelesine dönüşür — bunu erken, sorun çıkmadan konuşun. Ciddi ortaklıklarda ayrılık senaryosunu da (biri çekilirse ne olacak) yazılı hale getirmek ileride büyük anlaşmazlıkları önler; bunun için bir avukattan destek almak faydalı olur." },
  { category: "Tedarikçi İlişkileri", q: "Tedarikçilerimle ilişkimi nasıl güçlendirmeliyim?", a: "Sadece sorun çıktığında değil düzenli iletişimde kalmak ve ödemeleri zamanında yapmak, kriz anında (kıtlık, öncelik) size öncelik tanınmasını sağlar. Tek tedarikçiye tamamen bağımlı olmak risklidir — kritik ürünlerde en az bir alternatif kaynağı önceden belirlemiş olmak size pazarlık gücü de verir." },
  { category: "Tedarikçi İlişkileri", q: "Tedarikçi seçerken/değiştirirken nelere dikkat etmeliyim?", a: "Sadece fiyata değil, teslim süresinin tutarlılığına ve sorun çıktığında ne kadar hızlı çözüm ürettiğine bakın — ucuz ama gecikmeli tedarikçi, size müşteri kaybettirerek daha pahalıya gelebilir. Yeni bir tedarikçiye tüm siparişi birden kaydırmak yerine küçük bir siparişle önce güvenilirliğini test etmek daha güvenlidir." },
  { category: "Kalite Kontrol", q: "Ürün/hizmet kalitesini nasıl tutarlı tutarım?", a: "Kalitenin \"göze bakarak\" değil yazılı bir kontrol listesiyle (teslimden önce kontrol edilecek 5-10 madde) sağlanması, ekip büyüdükçe tutarlılığı korur. Müşteri şikayetlerini tek tek unutmak yerine kategori bazında takip etmek, kalite sorununun kaynağını (tedarik mi, süreç mi, eğitim mi) gösterir." },
  { category: "Müşteri Segmentasyonu", q: "Müşterilerimi nasıl segmentlere ayırmalıyım?", a: "En basit ve etkili yöntem RFM'dir: müşteri ne zaman son alışveriş yaptı (Recency), ne sıklıkla alıyor (Frequency), ne kadar harcıyor (Monetary) — bu üçüne göre gruplamak kimi öncelikli takip edeceğinizi gösterir. Müşteri etiketlerini bu segmentleri (\"VIP\", \"riskli\", \"pasif\" gibi) işaretlemek için kullanmak, herkese aynı mesajı göndermek yerine segmente göre farklı yaklaşmanızı ve dönüşümü artırmanızı sağlar." },
  { category: "Büyüme", q: "İkinci şube/lokasyon açmadan önce neye bakmalıyım?", a: "Mevcut şubenizin kârlı olması tek başına yeterli değildir — o kârın sizin kişisel çabanıza mı yoksa tekrarlanabilir bir sisteme mi bağlı olduğuna bakın, birinci şubede siz olmadan ikincisi aynı performansı gösteremeyebilir. Yeni lokasyonu açmadan önce o bölgede gerçek talep olduğunu (rakip yoğunluğu, nüfus/demografi) doğrulamak, \"iyi gidiyoruz, bir tane daha açalım\" iyimserliğinden daha güvenlidir." },
  { category: "Ekip Yönetimi", q: "Uzaktan/hibrit çalışan ekibimi nasıl yönetmeliyim?", a: "Fiziksel gözetim olmadan güven, net teslim tarihleri ve görünür sonuçlarla kurulur — \"ne kadar çalıştı\" yerine \"ne teslim etti\"ye odaklanmak daha sağlıklı bir ölçüttür. Önemli kararları anlık mesajla değil yazılı (e-posta, ortak not) kaydetmek, dağınık ekipte bilgi kaybını önler." },
  { category: "Fiyatlandırma", q: "Fiyat listemi hazırlarken çapa etkisinden nasıl faydalanırım?", a: "Üç seçenek sunduğunuzda (temel/standart/premium) müşterilerin çoğu ortadakini seçer — en çok satmasını istediğiniz paketi ortada konumlandırmak, tek fiyat sunmaktan daha yüksek ortalama sepet getirir. En üstteki pahalı seçenek az satılsa bile, ortadaki paketi \"makul\" gösteren bir çapa görevi görür, tamamen kaldırmayın." },
  { category: "Abonelik Modeli", q: "İşimi tekrarlayan gelir (abonelik) modeline nasıl geçiririm?", keywords: ["tekrarlayan gelir", "abonelik modeli", "recurring revenue"], a: "Tek seferlik satışın yanına aynı müşteriye düzenli değer sunan bir bakım/yenileme/üyelik paketi eklemek gelirinizi öngörülebilir kılar — tüm işi birden abonmanlığa çevirmek yerine önce en istekli müşteri grubunda pilot yapın. Tekrarlayan giderlerinizi izlediğiniz gibi tekrarlayan gelirinizi de düzenli izlemek nakit planlamanızı kolaylaştırır." },
  { category: "Mevsimlik Personel", q: "Sezonluk/geçici personeli nasıl yönetmeliyim?", a: "Kısa süreli çalışacak birine bile temel işleyişi (en sık sorulan 5-10 soru, hangi durumda kime sorulacağı) yazılı bir kısa kılavuzla anlatmak, her seferinde sıfırdan eğitim vermekten çok daha hızlıdır. İyi performans gösteren mevsimlik çalışanları not edin — bir sonraki sezon yeniden işe almak sıfırdan ilan vermekten hem hızlı hem güvenilirdir." },
  { category: "Müşteri Geri Bildirimi", q: "Müşterilerimden düzenli geri bildirim nasıl toplarım?", keywords: ["nps", "müşteri anketi", "geri bildirim toplama"], a: "Uzun anketler genelde cevaplanmaz — tek soruluk basit bir \"bizi 0-10 arası tavsiye eder misiniz\" sorusu (NPS) bile, zamanla takip edildiğinde memnuniyet trendini görmenizi sağlar. Olumsuz cevap verenlere kısa süre içinde dönüp nedenini sormak hem sorunu çözer hem müşteride \"gerçekten dinleniyorum\" hissi yaratır." },
  { category: "Yerel SEO", q: "Google İşletme Profilimi (Google Haritalar) nasıl etkili kullanırım?", keywords: ["google my business", "google işletmem", "harita kaydı"], a: "Profili eksiksiz doldurmak (çalışma saatleri, fotoğraflar, hizmet listesi) ve düzenli müşteri yorumu istemek yerel aramalarda görünürlüğü doğrudan artırır — çoğu küçük işletme bu profili bir kere doldurup unutur. Gelen yorumlara kısa bir yanıt yazmak, hem yorumu okuyanlara hem Google'ın sıralama algoritmasına aktif olduğunuzu gösterir." },
  { category: "İtibar Yönetimi", q: "Olumsuz online yorumlara nasıl karşılık vermeliyim?", a: "Savunmaya geçmeden, sorunu anladığınızı gösteren sakin bir yanıt yazıp çözümü mümkünse özelden devam ettirin — herkese açık bir tartışma yorumu okuyan diğer müşterileri de etkiler. Yorumu silmeye/görmezden gelmeye çalışmak genelde daha kötü sonuç verir; iyi yönetilmiş bir olumsuz yorum bile markanızın hesap verebilir olduğunu gösterebilir." },
  { category: "B2B / B2C", q: "Kurumsal (B2B) müşteriye satış, bireysel (B2C) müşteriden nasıl farklıdır?", a: "Kurumsalda genelde tek kişi değil birden fazla kişi (kullanıcı, satın alma, yönetici) karar sürecine dahildir ve karar süresi daha uzundur — sabırsız takip yerine düzenli, profesyonel hatırlatma daha etkilidir. Bireyselde ise duygusal/anlık karar daha belirleyicidir, hız ve kolaylık genelde fiyattan bile önemli olabilir." },
  { category: "Satış Ekibi", q: "Satış ekibime nasıl bir prim/komisyon sistemi kurmalıyım?", keywords: ["komisyon sistemi", "satış primi", "prim sistemi kurma"], a: "Sadece ciroya değil, kâr marjına veya tahsilata bağlı prim vermek, ekibi indirimle satış kapatmaya değil kârlı ve tahsil edilebilir satışa yönlendirir. Prim hesabını basit ve şeffaf tutun — karmaşık formüller güven kaybettirir, kimse anlamadığı bir sisteme motive olmaz." },
  { category: "Freelancer/Taşeron", q: "Freelancer/taşeronla çalışırken nelere dikkat etmeliyim?", a: "İşi devretmeden önce teslim tarihini, kapsamı ve revizyon hakkını (kaç revizyon dahil) net yazın — sözlü \"anlaşırız\" ifadeleri en sık gecikme ve ek ücret tartışmasına yol açar. İlk işte küçük bir görevle güvenilirliğini test etmeden büyük/kritik bir işi doğrudan vermek risklidir." },
  { category: "Nakit Akışı", q: "Kriz anında (talep düşüşü) nakdimi nasıl korurum?", a: "Önce zorunlu olmayan giderleri (yeni yatırım, ek kiralama, birikmiş stok alımı) askıya alın, sabit giderlerinizi yeniden müzakere edin (kira, abonelikler) — kesinti kararını erken almak, nakit tükenene kadar beklemekten daha güvenlidir. Mevcut alacaklarınızı (Finans → Bekleyen Alacak) bu dönemde her zamankinden daha sıkı takip etmek, elinizdeki en hızlı nakit kaynağıdır." },
  { category: "Girişimcilik", q: "Yeni bir iş fikrini uygulamaya koymadan önce nasıl test etmeliyim?", a: "Büyük yatırım yapmadan önce, fikri en küçük haliyle (basit bir sayfa, sınırlı sayıda müşteri, elle yürütülen bir hizmet) gerçek insanlarla test edin — \"bence tutar\" varsayımı gerçek para ödeyip ödemeyecekleri sorusunun yerini tutmaz. İlk 5-10 gerçek müşteriden çıkan tepki, uzun bir pazar araştırması raporundan daha güvenilir bir sinyaldir." },
  { category: "Pazarlama", q: "İçerik pazarlaması veya influencer işbirliği işime katkı sağlar mı?", a: "Takipçi sayısına değil, o kişinin kitlesinin sizin hedef müşterinizle ne kadar örtüştüğüne bakın — küçük ama ilgili bir kitleye sahip biri, büyük ama alakasız bir kitleden daha fazla dönüşüm getirebilir. Tek seferlik bir gönderi yerine, sonucu (kod, link, indirim) ölçülebilir yapılandırılmış bir işbirliği, harcamanın karşılığını görmenizi sağlar." },
  { category: "Satış", q: "Mevcut müşteriye ek satış (upsell/çapraz satış) nasıl yaparım?", a: "En doğru an, müşteri zaten memnunken (bir işi başarıyla tamamladıktan hemen sonra) ek bir ihtiyacını çözecek teklif sunmaktır — memnuniyetsiz bir müşteriye ek satış denemek güveni daha da zedeler. Rastgele değil, müşterinin geçmiş taleplerine/kayıtlarına bakarak hangi ürünü/hizmeti almamış ama ihtiyacı olabilir diye hedefli öneri sunmak dönüşümü artırır." },
  { category: "Nakit Akışı", q: "Geç ödeyen müşterilerle nasıl başa çıkarım?", a: "Vade dolmadan kısa bir hatırlatma (vade gününde değil, birkaç gün önce) göndermek, vade geçtikten sonra sert bir uyarı yazmaktan daha az sürtüşme yaratır ve daha erken sonuç verir. Kronik geç ödeyen müşterilerde bir sonraki işte kısmi peşinat şartı koymak, ilişkiyi bitirmeden riski azaltan makul bir adımdır." },
  { category: "Fiyatlandırma", q: "Hizmetlerimi paket (bundle) halinde satmalı mıyım?", a: "Ayrı ayrı satıldığında düşük görünen küçük hizmetleri bir pakette birleştirmek, hem müşteriye \"daha değerli\" bir teklif gibi görünür hem de ortalama sepet tutarınızı yükseltir. Fiyat listenizde 2-3 net paket seçeneği sunmak, müşteriyi çok fazla seçenekle boğmaktan daha hızlı karar verdirir." },
  { category: "Ekip Yönetimi", q: "Çalışanlarımı nasıl adil bir şekilde değerlendirmeliyim?", a: "Yıl sonunu beklemeden, kısa aralıklarla (3 ayda bir gibi) somut örneklere dayalı geri bildirim vermek hem çalışanın gelişimini hızlandırır hem yıl sonu değerlendirmesini sürpriz olmaktan çıkarır. \"Genel olarak iyisin\" gibi belirsiz yorumlar yerine belirli bir olayı (\"şu talebi hızlı çözdün\") örnek göstermek, geri bildirimi daha inandırıcı ve uygulanabilir kılar." },
  { category: "Marka", q: "Kurumsal kimliğimi (logo, renkler, ton) nasıl oluşturmalıyım?", a: "Pahalı bir marka ajansı olmadan da, tüm materyallerinizde (fatura, sosyal medya, tabela) aynı logo/renk/yazı tipini tutarlı kullanmak profesyonel bir izlenim yaratır — tutarsızlık, kalitesizlikten çok güvensizlik hissi verir. Marka tonunuzu (resmi mi samimi mi) bir kere netleştirip tüm iletişiminizde aynı tonu korumak, büyük bütçeli tasarımdan daha etkili bir tutarlılık sağlar." },
  { category: "Müşteri Sadakati", q: "Sadakat programı nasıl kurmalıyım?", a: "Karmaşık puan sistemleri yerine basit bir kural (örneğin belirli sayıda alışveriş sonrası bir avantaj) hem sizin takip etmenizi hem müşterinin anlamasını kolaylaştırır. Programı geniş kitleye açmadan önce en sadık mevcut müşterilerinizde (en çok işlem yapan müşteri etiketi/listesi) test etmek, ayarlamaları erken yapmanızı sağlar." },
  { category: "Vergi Teşvikleri", q: "Genç girişimci vergi istisnasından yararlanabilir miyim?", a: "29 yaşını doldurmamış ve ilk kez vergi mükellefi olan girişimciler için Gelir Vergisi Kanunu'nda kazancın belirli bir kısmını gelir vergisinden istisna tutan bir düzenleme (\"genç girişimci kazanç istisnası\") var. Şartlar ve güncel tutar sık değiştiği için muhasebecinize/SMMM'nize sorup uygunluğunuzu teyit ettirin." },
  { category: "Vergi Teşvikleri", q: "KOBİ'me devlet desteği/hibe var mı?", a: "KOSGEB, KOBİ'lere yönelik girişimcilik, dijitalleşme, Ar-Ge ve işletme geliştirme destekleri (hibe ve düşük faizli kredi) sunuyor. Güncel programları ve başvuru şartlarını KOSGEB'in kendi sitesinden veya bağlı olduğunuz Ticaret/Sanayi Odası'ndan öğrenebilirsiniz." },
  { category: "Vergi Teşvikleri", q: "Yeni ekipman/makine alırken vergi avantajı var mı?", a: "Belirli yatırımlar için alınan \"yatırım teşvik belgesi\" kapsamında KDV istisnası, gümrük vergisi muafiyeti ve vergi indirimi gibi avantajlardan yararlanılabiliyor. Bu belge genelde yatırımdan ÖNCE alınması gerektiği için, büyük bir alım öncesi muhasebecinize danışmanız önemli." },
  { category: "Vergi Teşvikleri", q: "Fazla ödediğim KDV'yi geri alabilir miyim?", a: "Bazı işlemlerde (ihracat, indirimli orana tabi teslimler, KDV tevkifatı uygulanan hizmetler vb.) yüklendiğiniz KDV, hesapladığınız KDV'den fazla kalabilir — bu fark belirli şartlarda nakden veya mahsuben iade alınabilir. Çoğu KOBİ'nin bilmediği ama muhasebecisinin başvurabileceği bir hak." },
];

const UNIFIED_LIBRARY = [
  ...ANSWER_LIBRARY,
  ...HELP_TOPICS.map((t, i) => staticToLibraryEntry(t, i, "help", "Nasıl Yapılır")),
  ...ADVISOR_TIPS.map((t, i) => staticToLibraryEntry(t, i, "advisor", "Danışman")),
];

function AskBubble({ open, onToggle }) {
  return (
    <button
      onClick={onToggle}
      title="Soru Sor"
      aria-label="Soru Sor"
      data-tour="ask-bubble"
      style={{
        position: "fixed", bottom: 24, right: 24, width: 56, height: 56, borderRadius: "50%",
        background: "var(--fill-accent)", color: "var(--on-accent)", border: "none",
        display: "flex", alignItems: "center", justifyContent: "center",
        boxShadow: "0 4px 16px rgba(0,0,0,0.25)", zIndex: 950, cursor: "pointer", fontSize: 24,
      }}
    >
      <i className={`ti ${open ? "ti-x" : "ti-message-circle-2"}`} aria-hidden="true"></i>
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
      ? { id: uid(), role: "assistant", text: "Bunu şu an bilmiyorum — farklı bir ifadeyle sorabilir ya da aşağıdaki örneklerden birini deneyebilirsiniz.", suggestions: starters.map((e) => e.resolvedLabel) }
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
          <h3 style={{ margin: 0, fontSize: 15 }}>Soru Sor</h3>
          <p style={{ margin: "2px 0 0", fontSize: 11, color: "var(--text-muted)" }}>Hiçbir soru/veri dışarı gönderilmez</p>
        </div>
        <button onClick={onClose} aria-label="Kapat" style={{ width: 28, height: 28, padding: 0, flexShrink: 0 }}>
          <i className="ti ti-x" aria-hidden="true"></i>
        </button>
      </div>
      <div ref={threadRef} style={{ flex: 1, overflowY: "auto", padding: "14px 16px", display: "flex", flexDirection: "column", gap: 12 }}>
        {messages.length === 0 && (
          <div style={{ background: "var(--surface-1)", border: "0.5px solid var(--border)", borderRadius: "4px 12px 12px 12px", padding: "10px 12px", maxWidth: "88%", alignSelf: "flex-start" }}>
            <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5 }}>Merhaba! Satışlarınız/müşterileriniz hakkında, Binerly'nin nasıl kullanıldığı veya genel işletme tavsiyesi — istediğinizi sorabilirsiniz.</p>
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

function rowToRoomInventory(r) {
  return { id: r.id, roomType: r.room_type, quantity: r.quantity, capacity: r.capacity || null, description: r.description || "" };
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

function CustomerForm({ initial, customers = [], customFieldDefs = [], sectorTags = [], preferredCustomerType, companySector, onSave, onCancel, onPreferredTypeChange }) {
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
  const [duplicateError, setDuplicateError] = useState("");
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
          setDuplicateError(`"${duplicateWith.name}" adlı müşteride aynı e-posta veya telefon zaten kayıtlı — aynı telefon/e-posta ile ikinci bir müşteri eklenemez.`);
          return;
        }
        setDuplicateError("");
        onSave(payload);
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
      <div style={{ marginBottom: 12 }}>
        <label style={{ fontSize: 13, color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: 4, marginBottom: 4 }}>
          Açık Adres <InfoTip text="Online ödeme (iyzico/PayTR) alırken fatura/adres bilgisi olarak kullanılır — boş bırakılırsa sadece Bölge/Şehir gönderilir." />
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
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={isKurumsal ? `Örn. ${CUSTOMER_NOTE_EXAMPLES_KURUMSAL[companySector] || "yaz aylarında sipariş hacmi artıyor"}` : "Örn. genelde akşamları ulaşmak daha kolay"} style={{ flex: 1, minHeight: 70, resize: "vertical" }} />
          <VoiceInputButton onResult={(text) => setNotes((prev) => (prev ? `${prev} ${text}` : text))} />
        </div>
      </div>
      <div style={{ marginBottom: 16 }}>
        <label style={{ fontSize: 13, color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: 4, marginBottom: 4 }}>Etiketler <InfoTip text={TAGS_INFO_TEXT} /></label>
        <TagInput tags={tags} onChange={setTags} suggestions={sectorTags} />
      </div>
      <CustomFieldsSection defs={defsForEntity} values={customFields} onChange={setCustomFields} />
      {duplicateError && <p style={{ fontSize: 12.5, color: "var(--text-danger)", margin: "0 0 8px" }}>{duplicateError}</p>}
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
  saglik_klinik: "Akın Diş Kliniği",
  uretim_satis: "Akın Tekstil",
  hizmet_danismanlik: "Akın Danışmanlık",
  perakende: "Akın Mağazacılık",
  guzellik_bakim: "Akın Güzellik Salonu",
  spor_merkezi: "Akın Spor Merkezi",
  egitim_kurs: "Akın Eğitim Kurumları",
  sanayi_esnaf: "Akın Oto Servis",
  otel: "Akın Otel",
};

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
        <input value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder={COMPANY_NAME_EXAMPLES[initial?.sector] || "Akın Diş Kliniği"} style={{ width: "100%" }} />
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
        <InfoTip text="Tarihi seçince o güne ait müsait saatler otomatik listelenir — birine tıklamak saati doldurur. İstediğiniz saat listede yoksa saat kutusuna elle de yazabilirsiniz." />
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

// Müşteri Takibi satırındaki tekil ikon butonları (PDF, onay linki, tahsilat,
// kopyala, düzenle, sil...) sayı arttıkça (seans/paket alanlarıyla 7'ye kadar
// çıkabiliyordu) sıkışık ve okunaksız hale geliyordu. Tek bir "..." menüsünde
// yazılı etiketlerle toplanıyor — NotificationBell'deki aynı dışa-tıkla-kapat
// deseni kullanılıyor.
function RowActionsMenu({ items }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);
  const visibleItems = items.filter(Boolean);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  if (visibleItems.length === 0) return null;

  return (
    <div ref={containerRef} style={{ position: "relative" }}>
      <IconButton icon="ti-dots-vertical" title="İşlemler" onClick={() => setOpen((v) => !v)} active={open} />
      {open && (
        <div
          style={{
            position: "absolute", top: "calc(100% + 4px)", right: 0, minWidth: 210,
            background: "var(--surface-1)", border: "0.5px solid var(--border)", borderRadius: "var(--radius)",
            boxShadow: "0 8px 24px rgba(0,0,0,0.15)", zIndex: 60, overflow: "hidden",
          }}
        >
          {visibleItems.map((item, i) => (
            <button
              key={item.label}
              type="button"
              disabled={item.disabled}
              title={item.title}
              onClick={() => { item.onClick(); setOpen(false); }}
              style={{
                width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "9px 12px",
                background: "none", border: "none", borderBottom: i < visibleItems.length - 1 ? "0.5px solid var(--border)" : "none",
                borderRadius: 0, textAlign: "left", fontSize: 13,
                color: item.danger ? "var(--text-danger)" : "var(--text-primary)",
                opacity: item.disabled ? 0.4 : 1, cursor: item.disabled ? "not-allowed" : "pointer",
              }}
            >
              <i className={`ti ${item.icon}`} style={{ fontSize: 15, flexShrink: 0 }} aria-hidden="true"></i>
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function DealForm({ customers, initial, defaultKdvRate, preferredCustomerType, sector, deals = [], appointmentDateTimeKey = null, roomInventory = [], customFieldDefs = [], sectorTags = [], teamMembers = [], currentUserId, currentUserEmail, businessUserId, titleSuggestions = [], priceListItems = [], initialLineItems = [], hasPaymentConnection = false, totalPaid = 0, attachments = [], onUploadAttachment, onDownloadAttachment, onDeleteAttachment, onSave, onCancel }) {
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
  // Yeni tekliflerde son seçilen ödeme tercihi hatırlanır (localStorage) —
  // kaydetmeden formu kapatıp tekrar açsa bile "Sadece onaylasın"a sıfırlanmasın.
  // Var olan bir teklifi düzenlerken bu, kaydedilmiş değeri EZMEZ.
  const [paymentMode, setPaymentMode] = useState(initial?.paymentMode || localStorage.getItem(PAYMENT_MODE_LAST_CHOICE_KEY) || "none");
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
  const [valueError, setValueError] = useState("");
  const [tags, setTags] = useState(initial?.tags || []);
  const [customFields, setCustomFields] = useState(initial?.customFields || {});
  const [assignedTo, setAssignedTo] = useState(initial?.assignedTo || currentUserId || "");
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
  const otherDefsForEntity =
    bookingModel(sector) === "slot" && appointmentDateTimeKey
      ? defsForEntity.filter((d) => d.key !== appointmentDateTimeKey)
      : defsForEntity;
  const selectedCustomerEmail = customers.find((c) => c.id === customerId)?.email || "";

  // Aynı tarih/saate iki aktif randevu düşerse (örn. biri iptal edilip slot
  // boşaldıktan sonra başkası aynı saati aldı, sonra ilk randevu yeniden
  // "planlandı"ya çekildi) sessizce çift rezervasyon oluşurdu. Tek bir
  // randevu saati aynı anda gerçekten iki farklı kişiye verilemeyeceği için
  // (kullanıcı isteğiyle) bu artık uyarıyla geçilebilen bir onay değil,
  // gerçek bir engel — çakışma varken kayıt yapılamaz.
  const findAppointmentConflict = (candidateStage, candidateCustomFields) => {
    if (!appointmentDateTimeKey || bookingModel(sector) !== "slot" || candidateStage === "kaybedildi") return null;
    const dt = candidateCustomFields?.[appointmentDateTimeKey];
    if (!dt) return null;
    const conflict = deals.find((d) =>
      d.id !== initial?.id && d.stage !== "kaybedildi" && d.customFields?.[appointmentDateTimeKey] === dt
    );
    if (!conflict) return null;
    return customers.find((c) => c.id === conflict.customerId)?.name || "başka bir kayıt";
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
    if (lineItems.length > 0) setValue(String(lineItemsTotal));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lineItemsTotal, lineItems.length]);

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
        const payload = {
          id: initial?.id || uid(),
          customerId,
          title: title.trim(),
          value: Number(value) || 0,
          cost: Number(cost) || 0,
          paymentMode,
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
          // Saat boş bırakılırsa YENİ bir teklifte gerçek "şu an"ın saatini
          // kullanıyoruz — yoksa aynı gün eklenen tüm teklifler aynı (gece
          // yarısı) zaman damgasını alıp "en yeni eklenen" sıralamasında
          // birbirinden ayırt edilemiyordu (ekleme sırası korunuyor, en
          // yeni en üste çıkmıyordu). Var olan bir teklifi düzenlerken bu
          // davranış değişmiyor — kaydedilmiş saat neyse o korunuyor.
          createdAt: new Date(`${dealDate}T${dealTime || (initial ? "00:00" : new Date().toTimeString().slice(0, 5))}`).toISOString(),
          closedAt: isClosingStage ? new Date(`${closedDate}T00:00`).toISOString() : null,
        };
        const conflictWith = findAppointmentConflict(stage, customFields);
        if (conflictWith) {
          setConflictError(`Bu tarih/saatte ${conflictWith} için de aktif bir randevu var — aynı saate iki randevu girilemez.`);
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
      {(initial?.approvedAt || initial?.paymentStatus === "paid") && (
        <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
          {initial?.approvedAt && <Badge tone="success">✓ Müşteri onayladı</Badge>}
          {initial?.paymentStatus === "paid" && <Badge tone="success">✓ Online ödendi</Badge>}
        </div>
      )}
      {(priceListItems.length > 0 || (bookingModel(sector) === "slot" && appointmentDateTimeKey)) && (
        <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
          {priceListItems.length > 0 && (
            <div style={{ flex: 1, minWidth: 200 }}>
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
        </div>
      )}
      <div style={{ marginBottom: 6 }}>
        <label style={{ fontSize: 13, color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: 4, marginBottom: 4 }}>
          Kalemler (opsiyonel)
          <InfoTip text="Birden fazla ürün/hizmet satırı eklerseniz Tutar bunların toplamına otomatik hesaplanır. Hiç kalem eklemezseniz Tutar'ı yine elle girebilirsiniz." />
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
            Tutar (TL) <span style={{ fontWeight: 400, color: "var(--text-muted)" }}>— KDV dahil{lineItems.length > 0 ? ", kalemlerden otomatik" : ""}</span>
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
          <label style={{ fontSize: 13, color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: 4, marginBottom: 4 }}>KDV oranı <InfoTip text={kdvRateInfoText(sector)} /></label>
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
            <InfoTip text="Onay linkinden veya müşteri portalından kartla ödeme alınabilir — iyzico veya PayTR bağlantısı Ayarlar'dan kurulmalı." />
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
          Bu {DEAL_WORD_FORMS[dealWordKind(sector)].bare} zaten kazanılmış — Tutar/KDV değişikliği, bu döneme ait KDV Özet Raporu'nu da geriye dönük etkiler.
        </p>
      )}
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <div style={{ flex: 1 }}>
          <label style={{ fontSize: 13, color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: 4, marginBottom: 4 }}>
            {supportsSelfBooking(sector) ? "Kayıt Tarihi" : "Tarih"}
            {supportsSelfBooking(sector) && (
              <InfoTip text={`Bu, kaydın oluşturulma/güncellenme tarihidir — ${DEAL_WORD_FORMS[dealWordKind(sector)].bare === "randevu" ? "randevunun" : DEAL_WORD_FORMS[dealWordKind(sector)].bare === "rezervasyon" ? "rezervasyonun" : "görüşmenin"} kendi tarih/saati için ${bookingModel(sector) === "slot" ? "yukarıdaki" : "aşağıdaki özel alanlar bölümündeki"} "${customFieldDefs.find((d) => d.entity === "deal" && d.key === appointmentDateTimeKey)?.label || "Randevu/Görüşme Tarihi"}" alanını kullanın.`} />
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
            style={{ width: "100%" }}
          >
            {STAGES.map((s) => <option key={s.id} value={s.id}>{stageLabel(s.id, selectedCustomerType, sector)}</option>)}
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
            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
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
          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            <div style={{ flex: 2 }}>
              <label style={{ fontSize: 13, color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: 4, marginBottom: 4 }}>
                Not
                <InfoTip text="İsterseniz sadece bir not olarak kullanın (tarih boş kalabilir), isterseniz sağdaki tarihi de doldurup gerçek bir hatırlatmaya çevirin — tarih girilirse Pano'da ve 'Bugün ne yapmalıyım' listesinde çıkar." />
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
            <label style={{ fontSize: 13, color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: 4, marginBottom: 4 }}>Etiketler <InfoTip text={TAGS_INFO_TEXT} /></label>
            <TagInput tags={tags} onChange={setTags} suggestions={sectorTags} />
          </div>
          <CustomFieldsSection defs={otherDefsForEntity} values={customFields} onChange={setCustomFields} />
          {initial?.id && (
            <AttachmentList
              entityType="deals"
              entityId={initial.id}
              attachments={attachments}
              onUpload={onUploadAttachment}
              onDownload={onDownloadAttachment}
              onDelete={onDeleteAttachment}
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

function DealPayments({ deal, payments, sector, onAddPayment, onUpdatePayment, onDeletePayment, onRefundPayment }) {
  const [amount, setAmount] = useState("");
  const [paidAt, setPaidAt] = useState(new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editAmount, setEditAmount] = useState("");
  const [editPaidAt, setEditPaidAt] = useState("");
  const [editNote, setEditNote] = useState("");
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
    setEditError("");
  };

  const confirmEdit = async (payment) => {
    const n = Number(editAmount);
    if (!n || n <= 0) { setEditError("Geçerli bir tutar girin."); return; }
    // Bu ödeme hariç tutulunca kalan bakiye: yeni tutar bunu aşamaz.
    const remainingExcluding = remaining + payment.amount;
    if (n > remainingExcluding + 0.01) { setEditError(`En fazla ${formatTL(remainingExcluding)} girilebilir.`); return; }
    setEditSaving(true);
    await onUpdatePayment({ id: payment.id, amount: n, paidAt: editPaidAt, note: editNote.trim() });
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
                    <span style={{ color: "var(--text-muted)" }}>· {paymentDateLabel(p.paidAt)}{p.note ? ` · ${p.note}` : ""}</span>
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
                      <IconButton icon="ti-trash" title="Sil" size="sm" onClick={() => setConfirmDeleteId(p.id)} />
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

function AttachmentList({ entityType, entityId, attachments, onUpload, onDownload, onDelete }) {
  const [uploading, setUploading] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const items = attachments.filter((a) => a.entityType === entityType && a.entityId === entityId);

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    await onUpload(entityType, entityId, file);
    setUploading(false);
  };

  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ fontSize: 13, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Dosyalar</label>
      {items.length === 0 && <p style={{ fontSize: 12.5, color: "var(--text-muted)", margin: "0 0 6px" }}>Henüz dosya eklenmedi.</p>}
      {items.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 8 }}>
          {items.map((a) => (
            <div key={a.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, fontSize: 12.5, background: "var(--surface-1)", border: "0.5px solid var(--border)", borderRadius: "var(--radius)", padding: "6px 10px" }}>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.fileName} <span style={{ color: "var(--text-muted)" }}>· {formatFileSize(a.fileSize)}</span></span>
              <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                <button type="button" onClick={() => onDownload(a)} style={{ fontSize: 12 }}>İndir</button>
                <button type="button" onClick={() => setConfirmDeleteId(a.id)} style={{ fontSize: 12, color: "var(--text-danger)" }}>Sil</button>
              </div>
            </div>
          ))}
        </div>
      )}
      <label style={{ background: "var(--surface-1)", border: "0.5px solid var(--border)", borderRadius: "var(--radius)", padding: "6px 12px", fontSize: 12.5, cursor: uploading ? "default" : "pointer", display: "inline-block" }}>
        {uploading ? "Yükleniyor…" : "+ Dosya Ekle"}
        <input type="file" onChange={handleFile} disabled={uploading} style={{ display: "none" }} />
      </label>
      <p style={{ fontSize: 11, color: "var(--text-muted)", margin: "4px 0 0" }}>En fazla 10 MB.</p>
      {confirmDeleteId && (
        <ConfirmDialog
          title="Dosya silinsin mi?"
          message="Bu dosya çöp kutusuna taşınır."
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

function CustomerDetail({ customer, deals, payments, activities, sector, customFieldDefs = [], groupClasses = [], groupClassEnrollments = [], attachments = [], onUploadAttachment, onDownloadAttachment, onDeleteAttachment, onAddActivity, onClose }) {
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

function CampaignModal({ customers, replyTo, companyName, logoUrl, session, onClose }) {
  const emailCustomers = customers.filter((c) => c.email);
  const [selected, setSelected] = useState(() => new Set(emailCustomers.map((c) => c.id)));
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState("");
  const [consentConfirmed, setConsentConfirmed] = useState(false);
  const [confirmSend, setConfirmSend] = useState(false);

  const toggle = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const requestSend = (e) => {
    e.preventDefault();
    const recipients = emailCustomers.filter((c) => selected.has(c.id)).map((c) => c.email);
    if (recipients.length === 0 || !subject.trim() || !message.trim() || !consentConfirmed) return;
    setConfirmSend(true);
  };

  const send = async () => {
    const recipients = emailCustomers.filter((c) => selected.has(c.id)).map((c) => c.email);
    setSending(true);
    setResult("");
    try {
      const res = await fetch("/api/send-campaign", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
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
      <form onSubmit={requestSend}>
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
      {confirmSend && (
        <ConfirmDialog
          title="Kampanya gönderilsin mi?"
          message={`${selected.size} kişiye e-posta gönderilecek — bu işlem geri alınamaz.`}
          onConfirm={() => { setConfirmSend(false); send(); }}
          onClose={() => setConfirmSend(false)}
        />
      )}
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
  otel: "Standart Oda (Gecelik)",
};

// Yeni teklif/kayıt formundaki "Başlık" alanı için sektöre göre örnek —
// kullanıcı fark etti: sektör ne olursa olsun sadece bireysel/kurumsal ayrımına
// göre iki sabit örnek (biri sağlık diline yakın "İlk randevu / danışmanlık")
// gösteriliyordu, Emlak/Otel/Üretim gibi sektörlerde alakasız kalıyordu.
const DEAL_TITLE_EXAMPLES = {
  emlak: "3+1 daire satışı / Kadıköy'de kiralık ofis",
  dijital_ajans: "Sosyal medya yönetimi paketi",
  saglik_klinik: "Diş kontrolü / kanal tedavisi",
  uretim_satis: "500 adet toptan sipariş",
  hizmet_danismanlik: "Aylık danışmanlık anlaşması",
  perakende: "Kampanya kapsamında toplu satış",
  guzellik_bakim: "Saç kesimi + fön randevusu",
  spor_merkezi: "Salon üyeliği / Reformer Pilates",
  egitim_kurs: "Yabancı dil kursu kaydı",
  sanayi_esnaf: "Motor bakımı / yağ değişimi",
  otel: "Hafta sonu 2 kişilik rezervasyon",
};

function PriceListManager({ items, onAdd, onUpdate, onDelete, sector }) {
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [editingItem, setEditingItem] = useState(null);
  const [search, setSearch] = useState("");
  const query = search.trim().toLowerCase();
  const filteredItems = query ? items.filter((item) => item.name.toLowerCase().includes(query)) : items;

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
        </>
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
        {showAttendance ? `Yoklama — ${new Date(occurrenceDate).toLocaleDateString("tr-TR", { day: "numeric", month: "long" })}` : words.rosterTitle}
      </p>
      {enrollments.length === 0 ? (
        <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 16 }}>{words.emptyRoster}</p>
      ) : (
        <div style={{ marginBottom: 16 }}>
          {showAttendance && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 52px 52px 30px", gap: 4, padding: "0 10px", marginBottom: 4 }}>
              <span></span>
              <span style={{ fontSize: 10.5, fontWeight: 700, color: "var(--text-muted)", textAlign: "center", textTransform: "uppercase" }}>Geldi</span>
              <span style={{ fontSize: 10.5, fontWeight: 700, color: "var(--text-muted)", textAlign: "center", textTransform: "uppercase" }}>Gelmedi</span>
              <span></span>
            </div>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {enrollments.map((e) => {
              const c = customers.find((cust) => cust.id === e.customerId);
              const att = showAttendance ? attendance.find((a) => a.customerId === e.customerId) : null;
              return (
                <div
                  key={e.id}
                  style={{
                    display: "grid",
                    gridTemplateColumns: showAttendance ? "1fr 52px 52px 30px" : "1fr auto",
                    alignItems: "center", gap: 4, background: "var(--surface-1)", borderRadius: "var(--radius)", padding: "6px 10px",
                  }}
                >
                  <span style={{ fontSize: 13 }}>{c?.name || "Bilinmeyen müşteri"}</span>
                  {showAttendance && (
                    <>
                      <button
                        type="button"
                        title="Geldi olarak işaretle"
                        onClick={() => onSetAttendance(e.customerId, "geldi")}
                        style={{ justifySelf: "center", width: 28, height: 28, padding: 0, borderRadius: 6, border: att?.status === "geldi" ? "1.5px solid #15803d" : "0.5px solid var(--border)", background: att?.status === "geldi" ? "#15803d" : "var(--surface-2)", color: att?.status === "geldi" ? "#fff" : "transparent" }}
                      >
                        <i className="ti ti-check" aria-hidden="true"></i>
                      </button>
                      <button
                        type="button"
                        title="Gelmedi olarak işaretle"
                        onClick={() => onSetAttendance(e.customerId, "gelmedi")}
                        style={{ justifySelf: "center", width: 28, height: 28, padding: 0, borderRadius: 6, border: att?.status === "gelmedi" ? "1.5px solid #b91c1c" : "0.5px solid var(--border)", background: att?.status === "gelmedi" ? "#b91c1c" : "var(--surface-2)", color: att?.status === "gelmedi" ? "#fff" : "transparent" }}
                      >
                        <i className="ti ti-check" aria-hidden="true"></i>
                      </button>
                    </>
                  )}
                  <IconButton icon="ti-x" title="Dersten çıkar" size="sm" onClick={() => setConfirmRemove(e)} />
                </div>
              );
            })}
          </div>
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

// deals.custom_fields'teki datetime-local değeri saat dilimi bilgisi taşımaz
// (örn. "2026-07-20T14:00") — bu proje sadece Türkiye için, +03:00 olarak
// yorumlanır (api/send-appointment-reminders.js'teki aynı yaklaşım).
function parseAppointmentDateTime(raw) {
  if (typeof raw !== "string" || raw.length < 16) return null;
  const d = new Date(`${raw.slice(0, 16)}:00+03:00`);
  return isNaN(d.getTime()) ? null : d;
}

function agendaDateKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
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
function AgendaTab({ deals, customers, groupClasses, groupClassEnrollments, classAttendance, activeCustomerIds, sector, dateTimeKey, onOpenDeal, onOpenClasses, onEnrollClass, onRemoveFromClass, onSetAttendance }) {
  const [rosterClass, setRosterClass] = useState(null);
  const [rosterOccurrenceDate, setRosterOccurrenceDate] = useState(null);
  const rosterClassLive = rosterClass ? groupClasses.find((g) => g.id === rosterClass.id) || null : null;
  const today = new Date();
  const [viewMode, setViewMode] = useState("ay");
  const [anchorDate, setAnchorDate] = useState(today);
  const [selectedDateKey, setSelectedDateKey] = useState(agendaDateKey(today));
  const [showDayModal, setShowDayModal] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const todayKey = agendaDateKey(today);
  const agendaYearOptions = Array.from({ length: 11 }, (_, i) => today.getFullYear() - 5 + i);

  const gridDays = viewMode === "ay" ? getMonthGridDays(anchorDate) : getWeekDays(anchorDate);
  const bounds = {
    start: new Date(gridDays[0].getFullYear(), gridDays[0].getMonth(), gridDays[0].getDate()),
    end: new Date(gridDays[gridDays.length - 1].getFullYear(), gridDays[gridDays.length - 1].getMonth(), gridDays[gridDays.length - 1].getDate(), 23, 59, 59, 999),
  };
  const eventsByDate = buildAgendaEvents(bounds, { deals, groupClasses, groupClassEnrollments, appointmentDateTimeKey: dateTimeKey });
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
                : `${getWeekDays(anchorDate)[0].toLocaleDateString("tr-TR", { day: "numeric", month: "short" })} – ${getWeekDays(anchorDate)[6].toLocaleDateString("tr-TR", { day: "numeric", month: "short" })}`}
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

      <div className="agenda-grid" style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4, marginBottom: 4 }}>
        {WEEKDAYS.map((w) => (
          <p key={w} style={{ margin: 0, fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textAlign: "center", textTransform: "uppercase" }}>{w.slice(0, 3)}</p>
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

// Otel gibi "randevu saati" değil "oda stoku" mantığıyla çalışan sektörler için —
// Müsaitlik Saatleri'ndeki gün/saat/slot modeli buraya uymuyor (bkz. bookingModel,
// Sectors.jsx): burada müsaitlik bir GÜN/SAAT slotu değil, bir TARİH ARALIĞINDA
// kaç aynı tipte oda boş olduğudur. Oda tipi listesi serbest metin değil, "Sektör &
// Özel Alanlar"daki aktif "oda_tipi" seçenekli alanının kendi seçeneklerinden
// geliyor — böylece iki ayrı yerde oda tipi listesi bakımı gerekmiyor.
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
    if (!editingItem && roomType && !availableOptions.includes(roomType)) {
      setRoomType(availableOptions[0] || "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [availableOptions.join("|"), editingItem]);

  const startEdit = (item) => {
    setEditingItem(item);
    setRoomType(item.roomType);
    setQuantity(item.quantity);
    setCapacity(item.capacity ? String(item.capacity) : "");
    setDescription(item.description || "");
  };

  const cancelEdit = () => {
    setEditingItem(null);
    setRoomType(availableOptions[0] || "");
    setQuantity(1);
    setCapacity("");
    setDescription("");
  };

  const submit = (e) => {
    e.preventDefault();
    if (Number(quantity) < 1) return;
    if (editingItem) {
      onUpdate({ id: editingItem.id, quantity: Number(quantity), capacity: capacity ? Number(capacity) : null, description: description.trim() });
      cancelEdit();
      return;
    }
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
        <InfoTip text={`Adet: bu tipte kaç oda varsa, seçilen giriş/çıkış tarihi aralığında zaten o kadar rezervasyon oluşmuşsa müşteri portalı "müsait değil" gösterir. Kapasite ve açıklama rezervasyon sırasında misafire gösterilir. Oda tipi seçenekleri Sektör & Özel Alanlar'daki "Oda Tipi" alanından geliyor.`} />
      </p>

      {items.length === 0 ? (
        <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 16 }}>Henüz oda tipi eklenmedi — eklenene kadar müşteri portalından rezervasyon alınamaz.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 16 }}>
          {items.map((r) => (
            <div key={r.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, background: "var(--surface-1)", borderRadius: "var(--radius)", padding: "8px 10px" }}>
              <div style={{ minWidth: 0 }}>
                <span style={{ fontSize: 13, fontWeight: 500 }}>{r.roomType}</span>
                <span style={{ fontSize: 12, color: "var(--text-muted)" }}> · {r.quantity} adet{r.capacity ? ` · ${r.capacity} kişilik` : ""}</span>
                {r.description && <p style={{ margin: "2px 0 0", fontSize: 12, color: "var(--text-secondary)" }}>{r.description}</p>}
              </div>
              <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                <IconButton icon="ti-edit" title="Düzenle" size="sm" onClick={() => startEdit(r)} />
                <IconButton icon="ti-trash" title="Sil" size="sm" onClick={() => setConfirmDelete(r)} />
              </div>
            </div>
          ))}
        </div>
      )}

      {availableOptions.length === 0 && !editingItem ? (
        <p style={{ fontSize: 12, color: "var(--text-muted)" }}>
          {roomTypeOptions.length === 0
            ? 'Önce Sektör & Özel Alanlar\'da "Oda Tipi" alanına en az bir seçenek eklemelisiniz.'
            : "Tanımlı tüm oda tipleri zaten eklendi."}
        </p>
      ) : (
        <>
          <p style={{ fontSize: 13, fontWeight: 500, margin: "0 0 8px" }}>{editingItem ? "Oda tipini düzenle" : "Yeni oda tipi ekle"}</p>
          <form onSubmit={submit} style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "flex-end" }}>
            <div style={{ minWidth: 160 }}>
              <label style={{ fontSize: 12, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Oda Tipi</label>
              <select value={roomType} onChange={(e) => setRoomType(e.target.value)} disabled={!!editingItem} style={{ fontSize: 13, width: "100%" }}>
                {(editingItem ? [editingItem.roomType] : availableOptions).map((o) => <option key={o} value={o}>{o}</option>)}
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
              {editingItem ? "Güncelle" : "+ Ekle"}
            </button>
            {editingItem && (
              <button type="button" onClick={cancelEdit} style={{ fontSize: 13 }}>Vazgeç</button>
            )}
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
  const [confirmRemoveMember, setConfirmRemoveMember] = useState(null);
  const [confirmLeave, setConfirmLeave] = useState(false);

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
          <button onClick={() => setConfirmLeave(true)} style={{ color: "var(--text-danger)" }}>Takımdan ayrıl</button>
        </div>
        {confirmLeave && (
          <ConfirmDialog
            title="Takımdan ayrılınsın mı?"
            message="Bu takımın müşteri/teklif/destek verilerine erişiminiz kalmaz — tekrar erişmek için yeniden davet edilmeniz gerekir."
            onConfirm={() => { setConfirmLeave(false); leaveTeam(); }}
            onClose={() => setConfirmLeave(false)}
          />
        )}
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
                    <button onClick={() => setConfirmRemoveMember(m)} style={{ fontSize: 12, color: "var(--text-danger)" }}>Kaldır</button>
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
  attachments: "Dosya",
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
        Aynı anda sadece bir sağlayıcı aktif olabilir — yeni birini bağlarsanız öncekinin yerini alır.
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
            Müşteriye ödeme sayfasında sunulacak azami taksit sayısı. Bu sadece bir üst sınır — taksitin gerçekten
            sunulabilmesi {isPayTR ? "PayTR" : "iyzico"} hesabınızda taksitli satış özelliğinin açık olmasına ve
            müşterinin kartının taksit desteğine bağlıdır; hesabınızda kapalıysa bu ayara rağmen tek çekim gösterilir.
          </p>
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, marginBottom: 16 }}>
          <input type="checkbox" checked={sandbox} onChange={(e) => setSandbox(e.target.checked)} />
          Test modu (Sandbox) — canlıya geçmeden önce test anahtarlarınızla deneyin
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

function LandingPage() {
  const [authModal, setAuthModal] = useState(null);

  return (
    <div style={{ minHeight: "100vh", background: "#f5f8fc", fontFamily: "system-ui, -apple-system, sans-serif" }}>
      <TrackingScripts />
      {authModal && <AuthModal initialMode={authModal} onClose={() => setAuthModal(null)} />}

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
            <a href="/blog" style={{ color: "#0c2540", fontWeight: 500, fontSize: 14, textDecoration: "none" }}>Blog</a>
          </div>
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <button onClick={() => setAuthModal("login")} style={{ background: "none", border: "none", color: "#185fa5", fontWeight: 600, fontSize: 14, cursor: "pointer", padding: "8px 12px" }}>
              Giriş Yap
            </button>
            <button onClick={() => setAuthModal("register")} style={{ background: "#185fa5", color: "#fff", border: "none", borderRadius: 8, padding: "8px 18px", fontWeight: 600, fontSize: 14, cursor: "pointer" }}>
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
            💬 Sizi dinliyoruz — talepleriniz doğrultusunda hızla geliştiriyoruz.
          </p>
        </div>

        {/* Mockup — dört farklı sektörden (inşaat/tekstil/güzellik/spor) örnek satır; her satırda sektör etiketiyle "sisteminiz sektöre göre şekillenir" mesajı verilir, tek işletmenin canlı paneli gibi algılanmasın diye */}
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
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8, marginBottom: 10 }}>
              {[["Açık Teklifler", "12"], ["Toplam Değer", "₺940K"], ["Bekleyen Randevular", "5"], ["Aktif Üyelikler", "37"]].map(([label, val]) => (
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
              desc: "İster iş teklifi ister randevu ya da üyelik satışı olsun, ilk temastan kapanışa kadar tüm süreci tek listede aşama aşama takip edin. Hazır şablon galerisinden seçip markalı PDF oluşturun, onay linkiyle müşteriden tek tıkla onay ve isterseniz kartla online ödeme alın, sık sattığınız ürün/hizmetleri fiyat listenize kaydedip saniyeler içinde seçin.",
              tags: ["Aşama Takibi", "PDF Şablon Galerisi", "Onay Linki", "Online Tahsilat", "Fiyat Listesi", "Seans/Paket Takibi"],
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
              desc: "Kazanma oranı, aşama hunisi, gelecek ay gelir tahmini ve kayıp nedeni analizleriyle stratejik kararlar alın. Pasif müşteri oranıyla kimi aramanız gerektiğini görün. Cari hesap ve KDV özet raporuyla kimin ne kadar borcu olduğunu, aylık KDV yükünüzü tek bakışta görün.",
              tags: ["Dashboard", "Aşama Hunisi", "Gelir Tahmini", "Pasif Müşteri Oranı", "Kayıp Analizi", "Cari Hesap", "KDV Özeti"],
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
              <a href="/blog" style={{ fontSize: 13, color: "#5b7088", textDecoration: "none" }}>Blog</a>
              <a href="mailto:info@binerly.com" style={{ fontSize: 13, color: "#5b7088", textDecoration: "none" }}>İletişim</a>
              <a href={getPortalUrl()} style={{ fontSize: 13, color: "#5b7088", textDecoration: "none" }}>Müşteri Portalı</a>
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
  const [attachments, setAttachments] = useState([]);
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
  const [classAttendance, setClassAttendanceState] = useState([]);
  const [businessHours, setBusinessHours] = useState([]);
  const [roomInventory, setRoomInventory] = useState([]);
  const [showSectorOnboarding, setShowSectorOnboarding] = useState(false);
  const [showTour, setShowTour] = useState(false);
  const [tourStep, setTourStep] = useState(0);
  const [activationChecklistDismissedClick, setActivationChecklistDismissedClick] = useState(false);
  const [showAskDock, setShowAskDock] = useState(false);
  // v1: üye sayısı kod tarafında henüz sınırlanmıyor, henüz billing yok.
  // Hedef fiyatlandırma "10 kullanıcıya kadar sabit ücret" olarak siteye
  // yazıldı (App.jsx LandingPage, "Neden Binerly" bölümü) — billing
  // eklendiğinde davet oluşturma burada 10 üyeyle sınırlanmalı.
  const [activeTeamId, setActiveTeamId] = useState(undefined);
  const [pendingInvites, setPendingInvites] = useState([]);
  const [dismissedInviteIds, setDismissedInviteIds] = useState([]);
  const [acknowledgedInviteIds, setAcknowledgedInviteIds] = useState([]);
  const [showSettingsHub, setShowSettingsHub] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showSettingsForm, setShowSettingsForm] = useState(false);
  const [showSectorFields, setShowSectorFields] = useState(false);
  const [showPriceList, setShowPriceList] = useState(false);
  const [showImportPriceList, setShowImportPriceList] = useState(false);
  const [showPriceListExport, setShowPriceListExport] = useState(false);
  const [showBusinessHours, setShowBusinessHours] = useState(false);
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
  const [showPortalLinkModal, setShowPortalLinkModal] = useState(false);
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
      setChannelCredentials([]); setPaymentCredentials([]); setAttachments([]); setChannelMessages([]);
      setTickets([]); setTicketMessages([]); setKbArticles([]);
      setCompanySettings(null);
      setCustomFieldDefs([]);
      setPriceListItems([]);
      setGroupClasses([]); setGroupClassEnrollments([]); setClassAttendanceState([]);
      setBusinessHours([]);
      setRoomInventory([]);
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
      supabase.from("room_inventory").select("*").order("room_type"),
      supabase.from("deal_pdf_templates").select("*").order("created_at"),
      supabase.from("deal_line_items").select("*").order("sort_order"),
      supabase.from("team_members").select("team_id").eq("member_id", session.user.id).maybeSingle(),
      supabase.from("team_invites").select("*").eq("status", "pending"),
    ]).then(([{ data: c }, { data: d }, { data: a }, { data: pay }, { data: exp }, { data: cred }, { data: payCred }, { data: att }, { data: chMsg }, { data: t }, { data: tm }, { data: kb }, { data: cs }, { data: cfd }, { data: pli }, { data: gc }, { data: gce }, { data: catt }, { data: bh }, { data: ri }, { data: pdft }, { data: dli }, { data: myMembership }, { data: invites }]) => {
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
      setRoomInventory((ri || []).filter((row) => row.user_id === ownerId).map(rowToRoomInventory));
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
  useEffect(() => {
    if (!activeTeamId) { setTeamMembers([]); return; }
    supabase.from("team_members").select("member_id, email, name, can_edit_settings").eq("team_id", activeTeamId).then(({ data }) => {
      setTeamMembers((data || []).map((m) => ({ id: m.member_id, email: m.email, name: m.name || null, canEditSettings: m.can_edit_settings || false })));
    });
  }, [activeTeamId]);

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
    setDeals((prev) => prev.filter((d) => d.id !== id));
    setPayments((prev) => prev.filter((p) => p.dealId !== id));
    setAttachments((prev) => prev.filter((att) => !(att.entityType === "deals" && att.entityId === id)));
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

  // Sadece elle eklenen (online olmayan) tahsilatlar burada düzenlenebilir —
  // online bir ödemenin tutarını burada değiştirmek gerçek sağlayıcı işlemiyle
  // tutarsızlığa yol açar, onlar sadece "İade Et" ile değişebilir (deletePayment
  // ile aynı gerekçe/koruma). İade kayıtları (amount<0) da düzenlenemez.
  const updatePayment = async ({ id, amount, paidAt, note }) => {
    const payment = payments.find((p) => p.id === id);
    const isRefundableOnline = (payment?.provider === "iyzico" && payment?.iyzicoPaymentTransactionId) || (payment?.provider === "paytr" && payment?.paytrMerchantOid);
    if (isRefundableOnline || (payment?.amount || 0) < 0) {
      notify("Online ödemeler ve iade kayıtları burada düzenlenemez.");
      return;
    }
    const { data, error } = await supabase
      .from("payments")
      .update({ amount, paid_at: paidAt, note: note || null })
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
      notify("Online ödemeler doğrudan silinemez — \"İade Et\" ile geri ödeme yapın.");
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

  const uploadAttachment = async (entityType, entityId, file) => {
    if (!file) return;
    if (file.size > MAX_ATTACHMENT_SIZE) { notify("Dosya en fazla 10 MB olabilir."); return; }
    const lowerName = file.name.toLowerCase();
    if (BLOCKED_ATTACHMENT_EXTENSIONS.some((ext) => lowerName.endsWith(ext))) {
      notify("Bu dosya türü güvenlik nedeniyle yüklenemiyor.");
      return;
    }
    const safeFileName = file.name.replace(/[^\w.\-]+/g, "_");
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
    };
    const { data, error } = await supabase.from("attachments").insert(row).select().single();
    if (error) { notify(`Dosya kaydedilemedi: ${error.message}`); return; }
    setAttachments((prev) => [rowToAttachment(data), ...prev]);
    logAction(entityType, entityId, "updated", `"${file.name}" dosyası eklendi`);
  };

  const downloadAttachment = async (attachment) => {
    const { data, error } = await supabase.storage.from("attachments").createSignedUrl(attachment.storagePath, 60);
    if (error || !data?.signedUrl) { notify(`Dosya indirilemedi: ${error?.message || ""}`); return; }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
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
          { id: uid(), name: "Örnek Müşteri — Akın İnşaat", customerType: "kurumsal", sector: "İnşaat", phone: "0532 000 00 01", email: "", notes: demoNote, lastContact: now, createdAt: now },
          { id: uid(), name: "Örnek Müşteri — Medipark Klinik", customerType: "kurumsal", sector: "Medikal / Sağlık", phone: "0532 000 00 02", email: "", notes: demoNote, lastContact: now, createdAt: now },
          { id: uid(), name: "Örnek Müşteri — Tazegül Gıda", customerType: "kurumsal", sector: "Gıda", phone: "0532 000 00 03", email: "", notes: demoNote, lastContact: now, createdAt: now },
          { id: uid(), name: "Örnek Müşteri — Ayşe Yılmaz", customerType: "bireysel", sector: "", region: "İzmir", phone: "0532 000 00 04", email: "", notes: demoNote, lastContact: now, createdAt: now },
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
      notify(`Bu tarih/saatte ${customers.find((c) => c.id === slotConflict.customerId)?.name || "başka bir kayıt"} için de aktif bir randevu var — aynı saate iki randevu girilemez.`);
    } else if (roomConflict) {
      notify(`Bu oda tipinde seçili tarihler için müsait oda kalmadı (${roomConflict.occupied}/${roomConflict.quantity} dolu).`);
    } else {
      moveDealStage(dealId, newStageId);
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
      markMessagesRead(ticket.id, "gelen");
      const customer = customers.find((c) => c.id === ticket.customerId);
      const company = companySettings?.companyName || "Binerly";
      const statusLabel = STATUSES.find((s) => s.id === ticket.status)?.label || ticket.status;
      notifyCustomerByEmail(
        customer,
        `Destek talebiniz güncellendi — ${company}`,
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
          `Destek talebiniz güncellendi — ${company}`,
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
    if (direction === "giden" && !isInternal) {
      const ticket = tickets.find((t) => t.id === ticketId);
      const customer = customers.find((c) => c.id === ticket?.customerId);
      const company = companySettings?.companyName || "Binerly";
      notifyCustomerByEmail(
        customer,
        `Yeni bir yanıtınız var — ${company}`,
        `Merhaba,\n\n"${ticket?.subject || "Destek talebiniz"}" konulu talebinize yeni bir yanıt geldi:\n\n"${content.slice(0, 300)}"\n\nTam görüşme için müşteri portalımıza giriş yapabilirsiniz: https://portal.binerly.com\n\n${company}`
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

  const askCtx = {
    customers, deals, payments, tickets, companyExpenses, companySettings,
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

  const lostReasonCounts = dealLostReasons(companySettings?.sector).map((reason) => ({
    reason,
    count: lostDeals.filter((d) => d.lostReason === reason).length,
  })).filter((r) => r.count > 0);

  return (
    <div style={{ padding: "24px 16px 64px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1.5rem" }}>
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
          <IconButton icon="ti-logout" label="Çıkış" onClick={() => supabase.auth.signOut()} title="Çıkış yap" />
        </div>
      </div>

      <p style={{ fontSize: 11, color: "var(--text-accent)", fontWeight: 500, margin: "-12px 0 12px" }}>
        🎉 Erken erişim aşamasındayız, şu an için tamamen ücretsiz.
      </p>

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

      <div style={{ display: "flex", gap: 32, alignItems: "flex-start", maxWidth: 1300 }}>
      {sidebarOpen && <div className="app-sidebar-backdrop" onClick={() => setSidebarOpen(false)} />}
      <nav className={`app-sidebar${sidebarOpen ? " open" : ""}`} style={{ width: 200, flexShrink: 0, display: "flex", flexDirection: "column", gap: 4, position: "sticky", top: 24 }}>
        {[
          { id: "pano", label: "Pano", icon: "ti-layout-dashboard" },
          { id: "musteri", label: "Müşteriler", icon: "ti-building" },
          { id: "firsat", label: dealWords.navLabel, icon: "ti-target-arrow" },
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
          </button>
        ))}
      </nav>

      <div style={{ flex: 1, minWidth: 0 }}>

      {tab === "pano" && (
        <div>
          {!(activationChecklistDismissedClick || (activeTeamId && localStorage.getItem(`binerly_activation_checklist_dismissed_${activeTeamId}`))) && (() => {
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
              value={rangeAvgDealSize !== null ? formatTL(rangeAvgDealSize) : "—"}
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
                    const stats = (acc[key] ||= { won: 0, lost: 0, revenue: 0 });
                    if (d.stage === "kazanildi") { stats.won += 1; stats.revenue += d.value || 0; }
                    else stats.lost += 1;
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
                    const total = stats.won + stats.lost;
                    const rate = total > 0 ? Math.round((stats.won / total) * 100) : null;
                    return (
                      <div key={assigneeId} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "var(--surface-1)", borderRadius: "var(--radius)", padding: "8px 12px" }}>
                        <span style={{ fontSize: 13 }}>{label}</span>
                        <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>
                          {stats.won} {DEAL_WORD_FORMS[dealKind].bare} · <strong style={{ color: "var(--text-primary)" }}>{formatTL(stats.revenue)}</strong>
                          {rate !== null && <> · <span style={{ color: "var(--text-success)" }}>%{rate} kazanma oranı</span></>}
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
                  <InfoTip text={`Şu an açık olan (kapanmamış) ${DEAL_WORD_FORMS[dealKind].plural}, aşamalarına göre dağılımı — hangi aşamada ne kadar kayıt birikmiş, "tıkanma" olan yeri gösterir.`} />
                </p>
                {openDeals.length === 0 ? (
                  <p style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 10 }}>Şu an açık {DEAL_WORD_FORMS[dealKind].plural} yok.</p>
                ) : (
                  <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
                    {STAGES.filter((s) => s.id !== "kazanildi" && s.id !== "kaybedildi").map((s) => {
                      const count = openDeals.filter((d) => d.stage === s.id).length;
                      const maxStageCount = Math.max(1, ...STAGES.filter((x) => x.id !== "kazanildi" && x.id !== "kaybedildi").map((x) => openDeals.filter((d) => d.stage === x.id).length));
                      return (
                        <div key={s.id}>
                          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 2 }}>
                            <span>{stageLabel(s.id, "kurumsal", companySettings?.sector)}</span>
                            <span style={{ color: "var(--text-secondary)" }}>{count}</span>
                          </div>
                          <div style={{ height: 8, borderRadius: 4, background: "var(--surface-2)" }}>
                            <div title={`${count}`} style={{ height: "100%", width: `${count > 0 ? Math.max(6, (count / maxStageCount) * 100) : 0}%`, borderRadius: 4, background: "var(--fill-accent)" }} />
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
            <table style={{ width: "100%", minWidth: 640, borderCollapse: "separate", borderSpacing: "0 8px" }}>
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
            </div>
          )}
        </div>
      )}

      {tab === "firsat" && (
        <div>
          <div style={{ display: "flex", gap: 4, background: "var(--surface-1)", borderRadius: "var(--radius)", padding: 3, marginBottom: 12, width: "fit-content" }}>
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
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12, gap: 8, flexWrap: "wrap" }}>
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
          ) : (
            <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", minWidth: 620, borderCollapse: "separate", borderSpacing: "0 8px" }}>
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
                        <select
                          value={d.stage}
                          onChange={(e) => attemptMoveDealStage(d.id, e.target.value)}
                          onClick={(e) => e.stopPropagation()}
                          style={{ fontSize: 12.5 }}
                        >
                          {STAGES.map((s) => (
                            <option key={s.id} value={s.id}>{stageLabel(s.id, c?.customerType || "kurumsal", companySettings?.sector)}</option>
                          ))}
                        </select>
                      </td>
                      <td onClick={() => setPaymentsDeal(d)} style={{ padding: "10px 12px", whiteSpace: "nowrap", cursor: "pointer" }}>
                        {paid > 0 ? <Badge tone={remaining <= 0 ? "success" : "warning"}>{remaining <= 0 ? "Ödendi" : "Kısmi ödeme"}</Badge> : <span style={{ fontSize: 12, color: "var(--text-muted)" }}>—</span>}
                      </td>
                      <td style={{ padding: "10px 12px", whiteSpace: "nowrap", textAlign: "right", fontSize: 13, fontWeight: 500 }}>{formatTL(d.value)}</td>
                      <td style={{ padding: "10px 12px", borderRadius: "0 var(--radius) var(--radius) 0" }}>
                        <div style={{ display: "flex", justifyContent: "flex-end" }}>
                          <RowActionsMenu
                            items={[
                              { icon: "ti-file-text", label: dealPdfLabel, onClick: () => setTeklifDeal(d) },
                              {
                                icon: "ti-link",
                                label: "Onay Linki",
                                title: c?.email ? "Müşterinin onaylayabileceği link — kopyala ve gönder" : "Onay linki için müşterinin e-postası kayıtlı olmalı",
                                disabled: !c?.email,
                                onClick: () => {
                                  if (!c?.email) { notify("Onay linki oluşturmak için önce müşterinin e-postasını ekleyin."); return; }
                                  setPaymentModeDeal(d);
                                },
                              },
                              !!d.sessionTotal && d.sessionUsed < d.sessionTotal && { icon: "ti-plus", label: "Seans kullanıldı", onClick: () => incrementSessionUsage(d.id) },
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
          onAdd={addGroupClass}
          onUpdate={updateGroupClass}
          onDelete={deleteGroupClass}
          onEnroll={enrollMember}
          onRemove={removeMember}
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
            sectorTags={SECTOR_PRESETS.find((p) => p.id === companySettings?.sector)?.tags || []}
            preferredCustomerType={companySettings?.preferredCustomerType}
            companySector={companySettings?.sector}
            onSave={upsertCustomer}
            onCancel={() => { setShowCustomerForm(false); setEditingCustomer(null); }}
            onPreferredTypeChange={updatePreferredCustomerType}
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
                  label="Ödeme Bağlantısı"
                  description={paymentCredentials.length > 0 ? `Bağlı ✓ (${paymentCredentials[0].provider === "paytr" ? "PayTR" : "iyzico"}) — müşteriler onay linkinden kartla ödeyebilir` : "Onay linkinden kartla tahsilat almak için iyzico veya PayTR bağlayın"}
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
            <MenuRow
              icon="ti-users-group"
              label="Müşteri Portalı Linki"
              description="Mevcut müşterileriniz için — kendi hesaplarıyla giriş yapıp takip etsinler"
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
            Bu linki (veya QR kodu) mevcut müşterilerinizle paylaşın — kayıtlı e-postalarıyla kendi hesaplarını oluşturup teklif/randevu/üyelik durumlarını görebilir, destek talebi açabilirler. Belirli bir müşteriye özel paylaşmak isterseniz Müşteriler listesindeki "Linki paylaş" butonunu da kullanabilirsiniz.
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
            Bu linki (veya QR kodu) fuarda, mağazada, kartvizitte paylaşın — müşteri kendi adı/telefonu/e-postasını/adresini kendisi girer, sizin elle eklemenize gerek kalmaz.
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
            {companySettings?.sector && (
              <button
                type="button"
                onClick={async () => { await applySectorCustomFields(companySettings.sector); notify("Sektöre özel yeni alanlar getirildi.", "success"); }}
                style={{ fontSize: 12, marginTop: 8 }}
              >
                Sektöre özel yeni alanları getir
              </button>
            )}
          </div>
          <CustomFieldDefsManager customFieldDefs={customFieldDefs} onAdd={addCustomFieldDef} onUpdate={updateCustomFieldDef} onDelete={deleteCustomFieldDef} sector={companySettings?.sector} />
        </Modal>
      )}

      {showPriceList && (
        <Modal title="Ürün & Hizmet Fiyat Listesi" onClose={() => setShowPriceList(false)}>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
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
          </div>
          <PriceListManager items={priceListItems} onAdd={addPriceListItem} onUpdate={updatePriceListItem} onDelete={deletePriceListItem} sector={companySettings?.sector} />
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
          onSave={savePdfTemplate}
          onClose={() => { setEditingTemplate(null); setShowPdfTemplates(true); }}
        />
      )}

      {showBusinessHours && (
        <Modal title="Müsaitlik Saatleri" onClose={() => setShowBusinessHours(false)}>
          <BusinessHoursManager items={businessHours} onAdd={addBusinessHours} onDelete={deleteBusinessHours} />
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
          entityLabel="Müşteriler"
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
        <Modal wide title={editingDeal?.id ? dealWords.editTitle : dealWords.newTitle} onClose={() => { setShowDealForm(false); setEditingDeal(null); }}>
          <DealForm
            customers={customers}
            initial={editingDeal}
            defaultKdvRate={companySettings?.defaultKdvRate}
            preferredCustomerType={dealAudience}
            sector={companySettings?.sector}
            deals={deals}
            appointmentDateTimeKey={appointmentDateTimeKey}
            roomInventory={roomInventory}
            customFieldDefs={customFieldDefs}
            sectorTags={SECTOR_PRESETS.find((p) => p.id === companySettings?.sector)?.tags || []}
            teamMembers={teamMembers}
            currentUserId={session.user.id}
            currentUserEmail={session.user.email}
            businessUserId={activeTeamId}
            titleSuggestions={[...new Set(deals.map((d) => d.title).filter(Boolean))]}
            priceListItems={priceListItems}
            initialLineItems={editingDeal ? dealLineItems.filter((li) => li.dealId === editingDeal.id) : []}
            hasPaymentConnection={paymentCredentials.length > 0}
            totalPaid={editingDeal ? totalPaidForDeal(editingDeal.id) : 0}
            attachments={attachments}
            onUploadAttachment={uploadAttachment}
            onDownloadAttachment={downloadAttachment}
            onDeleteAttachment={deleteAttachment}
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
            onUpdatePayment={updatePayment}
            onDeletePayment={deletePayment}
            onRefundPayment={refundPayment}
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
        <CampaignModal customers={customers} replyTo={session.user.email} companyName={companySettings?.companyName} logoUrl={companySettings?.logoUrl} session={session} onClose={() => setShowCampaignModal(false)} />
      )}

      {pendingLostReasonMove && (
        <Modal title="Neden kaybedildi?" onClose={() => setPendingLostReasonMove(null)}>
          <p style={{ fontSize: 14, color: "var(--text-secondary)", margin: "0 0 16px" }}>
            Müşteri randevuya gelmedi mi, yoksa iptal mi etti? Bu ayrım Pano'daki "Gelmeme oranı" hesabında kullanılıyor.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {dealLostReasons(companySettings?.sector).map((reason) => (
              <button
                key={reason}
                onClick={() => { moveDealStage(pendingLostReasonMove.dealId, "kaybedildi", reason); setPendingLostReasonMove(null); }}
                style={{ textAlign: "left" }}
              >
                {reason}
              </button>
            ))}
          </div>
        </Modal>
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
          attachments={attachments}
          onUploadAttachment={uploadAttachment}
          onDownloadAttachment={downloadAttachment}
          onDeleteAttachment={deleteAttachment}
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
