import { useState, useEffect } from "react";
import { supabase } from "./supabase";
import {
  Modal,
  InfoTip,
  ConfirmDialog,
  Badge,
  IconButton,
  formatTL,
  uid,
  TagInput,
  VoiceInputButton,
  AttachmentList,
  PRICE_ITEM_NAME_EXAMPLES,
  TONE_COLORS,
} from "./shared";
import {
  dealWordKind,
  STAGES,
  stageLabel,
  stageTone,
  stageGuide,
  isAppointmentSector,
  supportsSelfBooking,
  bookingModel,
  supportsSessionPackages,
  CustomFieldsSection,
} from "./Sectors";
import { DEAL_WORD_FORMS } from "./staticData";
// Vadesi geçmiş bakiye / kredi limiti uyarısı — GERÇEK BİR ENGEL DEĞİL, sadece
// bilgilendirme (kullanıcının kararı: "riskli müşteriye teklif vermek KOBİ'nin
// kendi bileceği iş"). "Ödeme Vadesi" (Peşin/30 gün/60 gün/90 gün) zaten var
// olan bir müşteri alanı — ayrı bir "vade tarihi" kolonu eklemeden, en eski
// ödenmemiş kazanılmış teklifin kapanma tarihine bu süre eklenip "vadesi geçti
// mi" hesaplanıyor. "Peşin" vade 0 gün sayılır (hiç beklememesi gerekirdi).
const PAYMENT_TERM_DAYS = { Peşin: 0, "30 gün": 30, "60 gün": 60, "90 gün": 90 };

export function computeCustomerCreditRisk(customer, deals, payments) {
  const creditLimit = Number(customer.customFields?.kredi_limiti) || 0;
  const paymentTerm = customer.customFields?.odeme_vadesi;
  const termDays = PAYMENT_TERM_DAYS[paymentTerm];
  if (!creditLimit && termDays === undefined) return null;

  const unpaidDeals = deals
    .filter((d) => d.customerId === customer.id && d.stage === "kazanildi")
    .map((d) => {
      const paid = payments
        .filter((p) => p.dealId === d.id)
        .reduce((sum, p) => sum + (p.amount || 0), 0);
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
export function computeNoShowRisk(customer, deals, strikeLimit) {
  if (!strikeLimit) return null;
  const relevant = deals.filter(
    (d) =>
      d.customerId === customer.id &&
      d.stage === "kaybedildi" &&
      (d.lostReason === "Randevuya gelmedi" || d.lostReason === "Geç iptal etti"),
  );
  if (relevant.length < strikeLimit) return null;
  const noShowCount = relevant.filter((d) => d.lostReason === "Randevuya gelmedi").length;
  const lateCancelCount = relevant.filter((d) => d.lostReason === "Geç iptal etti").length;
  return { noShowCount, lateCancelCount, totalCount: relevant.length };
}

// Otel gibi oda-stoklu sektörlerde (bookingModel === "inventory") aynı oda
// tipinde, aynı tarih aralığına çakışan aktif rezervasyon sayısı stoktaki
// adedi aşarsa çakışma bilgisi döner; stok hiç tanımlanmamışsa (owner Oda
// Stoku'nu henüz kurmadıysa) kısıtlama uygulanmaz. Hem DealForm'un kaydetme
// kontrolünde hem Liste'deki aşama seçiciyle tekrar aktifleştirmede kullanılır.
export function roomTypeConflict(
  { excludeDealId, roomType, checkIn, checkOut },
  deals,
  roomInventory,
) {
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
export function lineItemsDurationMinutes(lineItemsForDeal, priceListItems) {
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
export function AppointmentDateTimeField({ businessUserId, label, value, onChange }) {
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
      .catch((err) => {
        setSlots([]);
        setError(err.message || "Müsaitlik alınamadı.");
      })
      .finally(() => setLoading(false));
  }, [businessUserId, date]);

  return (
    <div>
      <label
        style={{
          fontSize: 13,
          color: "var(--text-secondary)",
          display: "flex",
          alignItems: "center",
          gap: 4,
          marginBottom: 4,
        }}
      >
        {label}
        <InfoTip
          placement="bottom"
          align="right"
          text="Tarihi seçince o güne ait müsait saatler otomatik listelenir - birine tıklamak saati doldurur. İstediğiniz saat listede yoksa saat kutusuna elle de yazabilirsiniz."
        />
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
        <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0 }}>
          Bu tarihte müsait saat görünmüyor (Müsaitlik Saatleri tanımlı değil ya da tüm saatler
          dolu).
        </p>
      ) : (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {slots.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => onChange(`${date}T${s}:00`)}
              style={{
                fontSize: 12.5,
                padding: "5px 10px",
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

export function DealForm({
  customers,
  initial,
  defaultKdvRate,
  preferredCustomerType,
  sector,
  deals = [],
  payments = [],
  appointmentDateTimeKey = null,
  roomInventory = [],
  resources = [],
  customFieldDefs = [],
  sectorTags = [],
  teamMembers = [],
  currentUserId,
  currentUserEmail,
  businessUserId,
  titleSuggestions = [],
  priceListItems = [],
  initialLineItems = [],
  dealLineItems = [],
  hasPaymentConnection = false,
  totalPaid = 0,
  attachments = [],
  appointmentPenaltyStrikeLimit = null,
  appointmentPenaltyBurnsSession = false,
  appointmentConcurrency = null,
  onUploadAttachment,
  onDownloadAttachment,
  onDeleteAttachment,
  onToggleAttachmentShare,
  onRequestPhotoConsent,
  onSave,
  onCancel,
}) {
  const [customerId, setCustomerId] = useState(
    initial?.customerId ||
      customers.find((c) => c.customerType === preferredCustomerType)?.id ||
      customers[0]?.id ||
      "",
  );
  const selectedCustomer = customers.find((c) => c.id === customerId);
  const selectedCustomerType = selectedCustomer?.customerType || "kurumsal";
  // Sadece YENİ teklifte gösterilir — var olan bir teklifi düzenlerken (initial
  // dolu) müşteri zaten seçilmiş, bu uyarı o an bir işe yaramaz, sadece gürültü olur.
  const creditRisk =
    !initial && selectedCustomer
      ? computeCustomerCreditRisk(selectedCustomer, deals, payments)
      : null;
  const noShowRisk =
    !initial && selectedCustomer && isAppointmentSector(sector)
      ? computeNoShowRisk(selectedCustomer, deals, appointmentPenaltyStrikeLimit)
      : null;
  // Müşterinin zaten aktif (tükenmemiş) bir paketi varsa VE kobi "paket
  // sahiplerinde seans yaksın"ı açtıysa, ihlal cezası ödeme zorunluluğu
  // DEĞİL seans yakma olarak uygulanıyor (bkz. computeAppointmentPenaltyBurn,
  // ihlal anında otomatik) — bu durumda burada ayrıca ödeme istemeye gerek yok.
  const hasActivePackage =
    !!selectedCustomer &&
    deals.some(
      (d) =>
        d.customerId === selectedCustomer.id &&
        d.stage === "kazanildi" &&
        d.sessionTotal > 0 &&
        (d.sessionUsed || 0) < d.sessionTotal,
    );
  const noShowPenaltyBurnsInstead =
    !!noShowRisk && appointmentPenaltyBurnsSession && hasActivePackage;
  // İşletme kaynaklı geç iptallerde tanınan ücretsiz telafi hakkı — sadece YENİ
  // randevu oluştururken sorulur (var olanı düzenlerken anlamsız).
  const hasCredit =
    !initial && !!selectedCustomer && (selectedCustomer.appointmentCreditCount || 0) > 0;
  const [applyCredit, setApplyCredit] = useState(false);
  const [title, setTitle] = useState(initial?.title || "");
  const [value, setValue] = useState(initial?.value ?? "");
  const [selectedPriceItemId, setSelectedPriceItemId] = useState("");
  // Kalemler tamamen opsiyonel — boşsa Tutar bugünkü gibi elle girilir, hiçbir
  // şey değişmez. Dolu ise Tutar bunların toplamına otomatik kilitlenir.
  const [lineItems, setLineItems] = useState(
    initialLineItems.map((li) => ({
      localId: li.id,
      description: li.description,
      quantity: li.quantity,
      unitPrice: li.unitPrice,
      priceItemId: li.priceItemId || null,
    })),
  );
  const lineItemsTotal = lineItems.reduce(
    (sum, li) => sum + (Number(li.quantity) || 0) * (Number(li.unitPrice) || 0),
    0,
  );
  const lineItemsDuration = lineItemsDurationMinutes(lineItems, priceListItems);
  // İndirim - SADECE kalem toplamı üzerinden uygulanır (Kalemler boşsa Tutar zaten
  // elle girilen tek bir sayı, indirim varsa staff onu doğrudan o sayıya yansıtır).
  // Ham tip/değer custom_fields.discount'ta saklanır ki teklif tekrar açıldığında
  // indirim alanı (ve gerekçesi) kaybolmasın - Tutar'a sadece SONUÇ yazılır.
  const [discountType, setDiscountType] = useState(
    initial?.customFields?.discount?.type || "percent",
  );
  const [discountValue, setDiscountValue] = useState(
    initial?.customFields?.discount?.value != null
      ? String(initial.customFields.discount.value)
      : "",
  );
  const discountAmount =
    discountValue === "" || Number(discountValue) <= 0
      ? 0
      : Math.min(
          discountType === "percent"
            ? lineItemsTotal * (Number(discountValue) / 100)
            : Number(discountValue),
          lineItemsTotal,
        );
  // Basit gümrük/navlun hesaplayıcı — CANLI gümrük/navlun verisi çekmiyor,
  // sadece kullanıcının kendi (localStorage'da hatırlanan) sabit oranını mevcut
  // kalem toplamına uygulayıp yeni bir kalem olarak ekliyor.
  const [showFreightCalc, setShowFreightCalc] = useState(false);
  const [freightIncoterm, setFreightIncoterm] = useState(
    () => localStorage.getItem("binerly_freight_incoterm") || "FOB",
  );
  const [freightPercent, setFreightPercent] = useState(
    () => localStorage.getItem("binerly_freight_percent") || "",
  );
  const [freightFlatFee, setFreightFlatFee] = useState(
    () => localStorage.getItem("binerly_freight_flat_fee") || "",
  );
  const [cost, setCost] = useState(initial?.cost ?? "");
  // Yeni tekliflerde son seçilen ödeme tercihi hatırlanır (localStorage) —
  // kaydetmeden formu kapatıp tekrar açsa bile "Sadece onaylasın"a sıfırlanmasın.
  // Var olan bir teklifi düzenlerken bu, kaydedilmiş değeri EZMEZ.
  const [paymentMode, setPaymentMode] = useState(
    initial?.paymentMode ||
      (noShowRisk && !noShowPenaltyBurnsInstead ? "required" : null) ||
      localStorage.getItem(PAYMENT_MODE_LAST_CHOICE_KEY) ||
      "none",
  );
  const [kdvRate, setKdvRate] = useState(initial?.kdvRate ?? defaultKdvRate ?? 20);
  const [stage, setStage] = useState(initial?.stage || "ilk_gorusme");
  const [dealDate, setDealDate] = useState(
    (initial?.createdAt || new Date().toISOString()).slice(0, 10),
  );
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
    (wasAlreadyClosed && initial?.closedAt ? initial.closedAt : new Date().toISOString()).slice(
      0,
      10,
    ),
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
    Array.isArray(initial?.customFields?.package_breakdown)
      ? initial.customFields.package_breakdown
      : [],
  );
  useEffect(() => {
    if (packageBreakdown.length === 0) return;
    setSessionTotal(packageBreakdown.reduce((sum, b) => sum + (Number(b.total) || 0), 0));
    setSessionUsed(packageBreakdown.reduce((sum, b) => sum + (Number(b.used) || 0), 0));
  }, [packageBreakdown]);
  const convertToBreakdown = () =>
    setPackageBreakdown([
      { label: "", total: Number(sessionTotal) || 1, used: Number(sessionUsed) || 0 },
    ]);
  const addBreakdownRow = () =>
    setPackageBreakdown((prev) => [...prev, { label: "", total: 1, used: 0 }]);
  const updateBreakdownRow = (i, patch) =>
    setPackageBreakdown((prev) => prev.map((b, idx) => (idx === i ? { ...b, ...patch } : b)));
  const removeBreakdownRow = (i) =>
    setPackageBreakdown((prev) => prev.filter((_, idx) => idx !== i));
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
  const defsForEntity = customFieldDefs.filter(
    (d) => d.entity === "deal" && (!d.audience || d.audience === selectedCustomerType),
  );
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
  const membershipEndDef =
    sector === "spor_merkezi"
      ? customFieldDefs.find(
          (d) => d.entity === "deal" && d.key === "uyelik_bitis_tarihi" && d.active,
        )
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
    if (
      !appointmentDateTimeKey ||
      bookingModel(sector) !== "slot" ||
      candidateStage === "kaybedildi"
    )
      return null;
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
        lineItemsDurationMinutes(
          dealLineItems.filter((li) => li.dealId === d.id),
          priceListItems,
        ),
        1,
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
      const staffName =
        teamMembers.find((m) => m.id === assignedTo)?.name ||
        (assignedTo === currentUserId ? currentUserEmail : "");
      return `Bu tarih/saatte ${staffName || "bu personelin"} zaten ${name} ile aktif bir randevusu var - aynı personele aynı saate iki randevu girilemez.`;
    }
    // Kaynağın adedi (varsayılan 1) dolana kadar aynı isimdeki kaynağa paralel
    // randevu verilebilir - hangi fiziksel birimin kullanıldığı ayrıca takip
    // edilmiyor, sadece o an kaç tanesinin dolu olduğu sayılıyor (Otel'in oda
    // adedi mantığıyla aynı, ama saat bazlı).
    const sameResourceOverlap = resourceId
      ? overlapping.filter((d) => d.customFields?.resource_id === resourceId)
      : [];
    const resourceQuantity = Math.max(
      1,
      Number(resources.find((r) => r.id === resourceId)?.quantity) || 1,
    );
    if (resourceId && sameResourceOverlap.length >= resourceQuantity) {
      const name =
        customers.find((c) => c.id === sameResourceOverlap[0].customerId)?.name ||
        "başka bir kayıt";
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
      deals,
      roomInventory,
    );
    if (!conflict) return null;
    return `Bu oda tipinde seçili tarihler için müsait oda kalmadı (${conflict.occupied}/${conflict.quantity} dolu).`;
  };

  useEffect(() => {
    if (lineItems.length > 0)
      setValue(String(Math.round((lineItemsTotal - discountAmount) * 100) / 100));
  }, [lineItemsTotal, lineItems.length, discountAmount]);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!customerId || !title.trim()) return;
        if (totalPaid > 0 && Number(value) < totalPaid) {
          setValueError(
            `Tutar, zaten tahsil edilen ${formatTL(totalPaid)}'nin altına düşürülemez.`,
          );
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
          setSessionError(
            `Toplam seans sayısı, zaten kullanılan ${sessionUsed} seansın altına düşürülemez.`,
          );
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
          sessionUsed: isPackageDeal
            ? Math.min(Number(sessionUsed) || 0, Number(sessionTotal) || 0)
            : 0,
          tags,
          // price_item_id: hangi fiyat listesi kalemi seçildiyse (üst seçici,
          // Kalemler'den bağımsız tek-hizmetlik durum) — tazeleme hatırlatıcısı
          // ve stok reçetesi düşümü bunu okuyor (bkz. App.jsx:computeServiceCompletionEffects).
          customFields: {
            ...customFields,
            price_item_id: selectedPriceItemId || null,
            package_breakdown:
              isPackageDeal && packageBreakdown.length > 0
                ? packageBreakdown
                    .filter((b) => b.label.trim() && Number(b.total) >= 1)
                    .map((b) => ({
                      label: b.label.trim(),
                      total: Number(b.total) || 1,
                      used: Math.min(Number(b.used) || 0, Number(b.total) || 1),
                    }))
                : null,
            discount:
              lineItems.length > 0 && discountValue !== "" && Number(discountValue) > 0
                ? { type: discountType, value: Number(discountValue) }
                : null,
            resource_id: resourceId || null,
          },
          lineItems: lineItems
            .filter((li) => li.description.trim())
            .map((li) => ({
              description: li.description.trim(),
              quantity: Number(li.quantity) || 1,
              unitPrice: Number(li.unitPrice) || 0,
              priceItemId: li.priceItemId || null,
            })),
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
          createdAt: new Date(
            `${dealDate}T${dealTime || (initial ? "00:00" : new Date().toTimeString().slice(0, 5))}`,
          ).toISOString(),
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
          <label
            style={{
              fontSize: 13,
              color: "var(--text-secondary)",
              display: "block",
              marginBottom: 4,
            }}
          >
            Müşteri
          </label>
          {initial ? (
            <p style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>
              {customers.find((c) => c.id === customerId)?.name || "Bilinmeyen müşteri"}
            </p>
          ) : customers.length === 0 ? (
            <p style={{ fontSize: 13, color: "var(--text-muted)" }}>Önce bir müşteri ekleyin.</p>
          ) : (
            <select
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
              style={{ width: "100%" }}
            >
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          )}
        </div>
        {creditRisk && (
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 8,
              background: "var(--bg-warning)",
              border: "0.5px solid var(--text-warning)",
              borderRadius: "var(--radius)",
              padding: "10px 12px",
              marginBottom: 12,
              fontSize: 13,
            }}
          >
            <i
              className="ti ti-alert-triangle"
              style={{ fontSize: 16, color: "var(--text-warning)", flexShrink: 0, marginTop: 1 }}
              aria-hidden="true"
            ></i>
            <div>
              <p style={{ margin: 0, fontWeight: 500, color: "var(--text-warning)" }}>
                {selectedCustomer?.name} için ödeme riski
              </p>
              <p style={{ margin: "2px 0 0", color: "var(--text-secondary)" }}>
                {creditRisk.overLimit &&
                  `Bakiyesi (${formatTL(creditRisk.balance)}) kredi limitini (${formatTL(creditRisk.creditLimit)}) aşıyor. `}
                {creditRisk.overdueBalance > 0 &&
                  `${formatTL(creditRisk.overdueBalance)} tutarında vadesi geçmiş bakiyesi var. `}
                Bu sadece bir uyarı - devam edip etmemek size kalmış.
              </p>
            </div>
          </div>
        )}
        {noShowRisk && (
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 8,
              background: "var(--bg-warning)",
              border: "0.5px solid var(--text-warning)",
              borderRadius: "var(--radius)",
              padding: "10px 12px",
              marginBottom: 12,
              fontSize: 13,
            }}
          >
            <i
              className="ti ti-calendar-off"
              style={{ fontSize: 16, color: "var(--text-warning)", flexShrink: 0, marginTop: 1 }}
              aria-hidden="true"
            ></i>
            <div style={{ flex: 1 }}>
              <p style={{ margin: 0, fontWeight: 500, color: "var(--text-warning)" }}>
                {selectedCustomer?.name} daha önce
                {noShowRisk.noShowCount > 0
                  ? ` ${noShowRisk.noShowCount} kez randevusuna gelmedi`
                  : ""}
                {noShowRisk.noShowCount > 0 && noShowRisk.lateCancelCount > 0 ? "," : ""}
                {noShowRisk.lateCancelCount > 0
                  ? ` ${noShowRisk.lateCancelCount} kez geç iptal etti`
                  : ""}
              </p>
              <p style={{ margin: "2px 0 0", color: "var(--text-secondary)" }}>
                {noShowPenaltyBurnsInstead
                  ? "Bu müşterinin aktif bir paketi var - politikanız gereği ödeme istemek yerine ihlallerinde paketten otomatik seans düşülüyor, ayrıca bir işlem yapmanız gerekmiyor."
                  : paymentMode === "required"
                    ? "Müsaitlik Saatleri'ndeki politikanız gereği ödeme otomatik olarak zorunlu yapıldı - Tutar alanına kapora/tutar girin, isterseniz aşağıdan bu tercihi değiştirebilirsiniz."
                    : 'Politikanız bu müşteri için ödeme zorunlu tutmayı öneriyor - Tutar alanına kapora miktarını girip aşağıdan "Ödeme zorunlu" seçebilirsiniz.'}
              </p>
            </div>
            {!noShowPenaltyBurnsInstead && paymentMode !== "required" && (
              <button
                type="button"
                onClick={() => setPaymentMode("required")}
                style={{ fontSize: 12, flexShrink: 0, whiteSpace: "nowrap" }}
              >
                Ödemeyi zorunlu yap
              </button>
            )}
          </div>
        )}
        {hasCredit && (
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 8,
              background: "var(--bg-accent)",
              border: "0.5px solid var(--border-strong)",
              borderRadius: "var(--radius)",
              padding: "10px 12px",
              marginBottom: 12,
              fontSize: 13,
            }}
          >
            <i
              className="ti ti-gift"
              style={{ fontSize: 16, color: "var(--text-accent)", flexShrink: 0, marginTop: 1 }}
              aria-hidden="true"
            ></i>
            <div style={{ flex: 1 }}>
              <p style={{ margin: 0, fontWeight: 500 }}>
                {selectedCustomer?.name} için {selectedCustomer?.appointmentCreditCount} ücretsiz
                telafi hakkı var
              </p>
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  marginTop: 4,
                  color: "var(--text-secondary)",
                  cursor: "pointer",
                }}
              >
                <input
                  type="checkbox"
                  checked={applyCredit}
                  onChange={(e) => setApplyCredit(e.target.checked)}
                />
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
            {initial?.paymentStatus === "paid" && totalPaid >= (initial?.value || 0) && (
              <Badge tone="success">✓ Online ödendi</Badge>
            )}
            {initial?.paymentStatus === "paid" && totalPaid < (initial?.value || 0) && (
              <Badge tone="warning">✓ Kapora ödendi</Badge>
            )}
          </div>
        )}
        {(priceListItems.length > 0 ||
          (bookingModel(sector) === "slot" && appointmentDateTimeKey) ||
          membershipEndDef) && (
          <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
            {priceListItems.length > 0 && (
              <div style={{ flex: 1, minWidth: 200 }}>
                <label
                  style={{
                    fontSize: 13,
                    color: "var(--text-secondary)",
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                    marginBottom: 4,
                  }}
                >
                  Ürün/Hizmet
                  <InfoTip
                    placement="bottom"
                    align="left"
                    text="Listeden seçmek başlığı ve tutarı otomatik doldurur, sonrasında yine de değiştirebilirsiniz. Fiyat Listesi sekmesinden yönetilir."
                  />
                </label>
                <select
                  value={selectedPriceItemId}
                  onChange={(e) => {
                    const item = priceListItems.find((p) => p.id === e.target.value);
                    setSelectedPriceItemId(e.target.value);
                    if (item) {
                      setTitle(item.name);
                      setValue(String(item.price));
                    } else {
                      setTitle("");
                      setValue("");
                    }
                  }}
                  style={{ width: "100%" }}
                >
                  <option value="">Elle doldur / listeden seç</option>
                  {priceListItems.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} - {formatTL(p.price)}
                    </option>
                  ))}
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
                  label={
                    customFieldDefs.find(
                      (d) => d.entity === "deal" && d.key === appointmentDateTimeKey,
                    )?.label || "Randevu Tarihi"
                  }
                  value={customFields[appointmentDateTimeKey]}
                  onChange={(v) =>
                    setCustomFields({ ...customFields, [appointmentDateTimeKey]: v })
                  }
                />
              </div>
            )}
            {membershipEndDef && (
              <div style={{ flex: 1, minWidth: 160 }}>
                <label
                  style={{
                    fontSize: 13,
                    color: "var(--text-secondary)",
                    display: "block",
                    marginBottom: 4,
                  }}
                >
                  {membershipEndDef.label}
                </label>
                <input
                  type="date"
                  value={customFields[membershipEndDef.key] || ""}
                  onChange={(e) =>
                    setCustomFields({ ...customFields, [membershipEndDef.key]: e.target.value })
                  }
                  style={{ width: "100%" }}
                />
              </div>
            )}
          </div>
        )}
        <div style={{ marginBottom: 6 }}>
          <label
            style={{
              fontSize: 13,
              color: "var(--text-secondary)",
              display: "flex",
              alignItems: "center",
              gap: 4,
              marginBottom: 4,
            }}
          >
            Kalemler (opsiyonel)
            <InfoTip
              align="left"
              text="Birden fazla ürün/hizmet satırı eklerseniz Tutar bunların toplamına otomatik hesaplanır. Hiç kalem eklemezseniz Tutar'ı yine elle girebilirsiniz."
            />
            {lineItemsDuration > 0 && (
              <Badge tone="default">Tahmini süre: {lineItemsDuration} dk</Badge>
            )}
          </label>
          {lineItems.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 6 }}>
              {lineItems.map((li, i) => (
                <div
                  key={li.localId ?? i}
                  style={{
                    border: "0.5px solid var(--border)",
                    borderRadius: "var(--radius)",
                    padding: 8,
                  }}
                >
                  <div style={{ display: "flex", gap: 6, alignItems: "flex-end", marginBottom: 6 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <label
                        style={{
                          fontSize: 11,
                          color: "var(--text-muted)",
                          display: "block",
                          marginBottom: 2,
                        }}
                      >
                        Açıklama
                      </label>
                      <input
                        value={li.description}
                        onChange={(e) =>
                          setLineItems((prev) =>
                            prev.map((x, j) =>
                              j === i ? { ...x, description: e.target.value } : x,
                            ),
                          )
                        }
                        placeholder={`Örn. ${PRICE_ITEM_NAME_EXAMPLES[sector] || "Danışmanlık"}`}
                        style={{ width: "100%", fontSize: 13 }}
                      />
                    </div>
                    <IconButton
                      icon="ti-trash"
                      title="Kalemi sil"
                      size="sm"
                      onClick={() => setLineItems((prev) => prev.filter((_, j) => j !== i))}
                    />
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <div style={{ width: 70 }}>
                      <label
                        style={{
                          fontSize: 11,
                          color: "var(--text-muted)",
                          display: "block",
                          marginBottom: 2,
                        }}
                      >
                        Adet
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={li.quantity}
                        onChange={(e) =>
                          setLineItems((prev) =>
                            prev.map((x, j) => (j === i ? { ...x, quantity: e.target.value } : x)),
                          )
                        }
                        style={{ width: "100%", minWidth: 0, fontSize: 13 }}
                      />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <label
                        style={{
                          fontSize: 11,
                          color: "var(--text-muted)",
                          display: "block",
                          marginBottom: 2,
                        }}
                      >
                        Birim fiyat (TL)
                      </label>
                      <input
                        type="number"
                        min="0"
                        value={li.unitPrice}
                        onChange={(e) =>
                          setLineItems((prev) =>
                            prev.map((x, j) => (j === i ? { ...x, unitPrice: e.target.value } : x)),
                          )
                        }
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
              onClick={() =>
                setLineItems((prev) => {
                  const blank = { localId: uid(), description: "", quantity: 1, unitPrice: 0 };
                  // İlk kalem eklendiğinde, o ana kadar Başlık/Tutar'a elle (veya
                  // üstteki Ürün/Hizmet seçiciyle) girilmiş olan tutar sessizce
                  // kaybolmasın diye ilk satır olarak devralınır — AYRICA hemen
                  // arkasından boş bir satır daha eklenir, yoksa buton "hiçbir şey
                  // yapmıyormuş" gibi görünüyordu (Tutar aynı kalıyordu çünkü
                  // devralınan tek kalem zaten mevcut tutara eşit).
                  if (prev.length === 0 && title.trim() && Number(value) > 0) {
                    return [
                      {
                        localId: uid(),
                        description: title.trim(),
                        quantity: 1,
                        unitPrice: Number(value),
                      },
                      blank,
                    ];
                  }
                  return [...prev, blank];
                })
              }
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
                    const newRow = {
                      localId: uid(),
                      description: item.name,
                      quantity: 1,
                      unitPrice: item.price,
                      priceItemId: item.id,
                    };
                    if (prev.length === 0 && title.trim() && Number(value) > 0) {
                      return [
                        {
                          localId: uid(),
                          description: title.trim(),
                          quantity: 1,
                          unitPrice: Number(value),
                          priceItemId: null,
                        },
                        newRow,
                      ];
                    }
                    return [...prev, newRow];
                  });
                }}
                style={{ fontSize: 12 }}
              >
                <option value="">Fiyat listesinden kalem ekle…</option>
                {priceListItems.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} - {formatTL(p.price)}
                  </option>
                ))}
              </select>
            )}
            {sector === "uretim_satis" && (
              <div style={{ position: "relative" }}>
                <button
                  type="button"
                  onClick={() => setShowFreightCalc((v) => !v)}
                  style={{ fontSize: 12 }}
                >
                  + Navlun/Gümrük ekle
                </button>
                {showFreightCalc && (
                  <div
                    style={{
                      position: "absolute",
                      top: "calc(100% + 4px)",
                      left: 0,
                      zIndex: 20,
                      background: "var(--surface-1)",
                      border: "0.5px solid var(--border)",
                      borderRadius: "var(--radius)",
                      padding: 10,
                      width: 220,
                      boxShadow: "0 8px 24px rgba(0,0,0,0.15)",
                    }}
                  >
                    <label
                      style={{
                        fontSize: 11,
                        color: "var(--text-muted)",
                        display: "block",
                        marginBottom: 2,
                      }}
                    >
                      Teslim Şekli
                    </label>
                    <select
                      value={freightIncoterm}
                      onChange={(e) => setFreightIncoterm(e.target.value)}
                      style={{ width: "100%", fontSize: 13, marginBottom: 6 }}
                    >
                      <option value="FOB">FOB</option>
                      <option value="CIF">CIF</option>
                      <option value="EXW">EXW</option>
                      <option value="DAP">DAP</option>
                    </select>
                    <label
                      style={{
                        fontSize: 11,
                        color: "var(--text-muted)",
                        display: "block",
                        marginBottom: 2,
                      }}
                    >
                      Navlun/Gümrük Oranı (%)
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="0.1"
                      value={freightPercent}
                      onChange={(e) => setFreightPercent(e.target.value)}
                      placeholder="Örn. 8"
                      style={{ width: "100%", fontSize: 13, marginBottom: 6 }}
                    />
                    <label
                      style={{
                        fontSize: 11,
                        color: "var(--text-muted)",
                        display: "block",
                        marginBottom: 2,
                      }}
                    >
                      Sabit Navlun Ücreti (TL)
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={freightFlatFee}
                      onChange={(e) => setFreightFlatFee(e.target.value)}
                      placeholder="Opsiyonel"
                      style={{ width: "100%", fontSize: 13, marginBottom: 8 }}
                    />
                    <p style={{ fontSize: 11, color: "var(--text-muted)", margin: "0 0 8px" }}>
                      Oran, mevcut kalem toplamı üzerinden hesaplanır - bu kendi sabit oranınız,
                      canlı gümrük/navlun verisi değildir.
                    </p>
                    <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                      <button
                        type="button"
                        onClick={() => setShowFreightCalc(false)}
                        style={{ fontSize: 12 }}
                      >
                        Vazgeç
                      </button>
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
                            const newRow = {
                              localId: uid(),
                              description: `Navlun/Gümrük (${freightIncoterm}${percent ? `, %${percent}` : ""})`,
                              quantity: 1,
                              unitPrice: amount,
                            };
                            if (prev.length === 0 && title.trim() && Number(value) > 0) {
                              return [
                                {
                                  localId: uid(),
                                  description: title.trim(),
                                  quantity: 1,
                                  unitPrice: Number(value),
                                },
                                newRow,
                              ];
                            }
                            return [...prev, newRow];
                          });
                          setShowFreightCalc(false);
                        }}
                        style={{
                          fontSize: 12,
                          background: "var(--fill-accent)",
                          color: "var(--on-accent)",
                          border: "none",
                        }}
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
            <div
              style={{
                marginTop: 8,
                display: "flex",
                gap: 8,
                alignItems: "flex-end",
                flexWrap: "wrap",
              }}
            >
              <div style={{ width: 100 }}>
                <label
                  style={{
                    fontSize: 11,
                    color: "var(--text-muted)",
                    display: "block",
                    marginBottom: 2,
                  }}
                >
                  İndirim
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={discountValue}
                  onChange={(e) => setDiscountValue(e.target.value)}
                  placeholder="0"
                  style={{ width: "100%", fontSize: 13 }}
                />
              </div>
              <div style={{ width: 70 }}>
                <label
                  style={{
                    fontSize: 11,
                    color: "var(--text-muted)",
                    display: "block",
                    marginBottom: 2,
                  }}
                >
                  &nbsp;
                </label>
                <select
                  value={discountType}
                  onChange={(e) => setDiscountType(e.target.value)}
                  style={{ width: "100%", fontSize: 13 }}
                >
                  <option value="percent">%</option>
                  <option value="amount">TL</option>
                </select>
              </div>
              {discountAmount > 0 && (
                <p style={{ fontSize: 12.5, color: "var(--text-muted)", margin: "0 0 6px" }}>
                  Kalem toplamı {formatTL(lineItemsTotal)} - indirim {formatTL(discountAmount)} ={" "}
                  <strong>{formatTL(lineItemsTotal - discountAmount)}</strong>
                </p>
              )}
            </div>
          )}
        </div>
        <div style={{ display: "flex", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
          <div style={{ flex: "1.6 1 200px" }}>
            <label
              style={{
                fontSize: 13,
                color: "var(--text-secondary)",
                display: "block",
                marginBottom: 4,
              }}
            >
              Başlık
            </label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={
                DEAL_TITLE_EXAMPLES[sector] ||
                (selectedCustomerType === "bireysel"
                  ? "İlk randevu / danışmanlık"
                  : "Yıllık tedarik anlaşması")
              }
              list="deal-title-suggestions"
              style={{ width: "100%" }}
            />
            <datalist id="deal-title-suggestions">
              {titleSuggestions.map((t) => (
                <option key={t} value={t} />
              ))}
            </datalist>
          </div>
          <div style={{ flex: "1 1 140px" }}>
            <label
              style={{
                fontSize: 13,
                color: "var(--text-secondary)",
                display: "block",
                marginBottom: 4,
              }}
            >
              Tutar (TL){" "}
              <span style={{ fontWeight: 400, color: "var(--text-muted)" }}>
                - KDV dahil{lineItems.length > 0 ? ", kalemlerden otomatik" : ""}
              </span>
            </label>
            <input
              type="number"
              min="0"
              value={value}
              disabled={lineItems.length > 0}
              onChange={(e) => setValue(e.target.value)}
              placeholder="0"
              style={{ width: "100%" }}
            />
            {totalPaid > 0 && (
              <p
                style={{
                  fontSize: 12,
                  color: valueError ? "var(--text-danger)" : "var(--text-muted)",
                  margin: "4px 0 0",
                }}
              >
                {valueError || `Şu ana kadar ${formatTL(totalPaid)} tahsil edildi.`}
              </p>
            )}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 120px" }}>
            <label
              style={{
                fontSize: 13,
                color: "var(--text-secondary)",
                display: "flex",
                alignItems: "center",
                gap: 4,
                marginBottom: 4,
              }}
            >
              KDV oranı <InfoTip align="left" text={kdvRateInfoText(sector)} />
            </label>
            <select
              value={kdvRate}
              onChange={(e) => setKdvRate(Number(e.target.value))}
              style={{ width: "100%" }}
            >
              <option value={20}>%20</option>
              <option value={10}>%10</option>
              <option value={1}>%1</option>
              <option value={0}>%0</option>
            </select>
          </div>
          <div style={{ flex: "1.4 1 180px" }}>
            <label
              style={{
                fontSize: 13,
                color: "var(--text-secondary)",
                display: "flex",
                alignItems: "center",
                gap: 4,
                marginBottom: 4,
              }}
            >
              Müşteri ödemesi
              <InfoTip text="Onay linkinden veya müşteri portalından kartla ödeme alınabilir - iyzico veya PayTR bağlantısı Ayarlar'dan kurulmalı." />
            </label>
            <select
              value={paymentMode}
              onChange={(e) => {
                setPaymentMode(e.target.value);
                localStorage.setItem(PAYMENT_MODE_LAST_CHOICE_KEY, e.target.value);
              }}
              style={{ width: "100%" }}
            >
              {PAYMENT_MODE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            {paymentMode !== "none" && !hasPaymentConnection && (
              <p
                style={{ fontSize: 12.5, color: "var(--text-warning, #b45309)", margin: "4px 0 0" }}
              >
                Ödeme almak için önce Ayarlar'dan iyzico veya PayTR hesabınızı bağlamanız gerekiyor.
              </p>
            )}
          </div>
        </div>
        {initial?.stage === "kazanildi" &&
          (Number(value) !== initial?.value || Number(kdvRate) !== initial?.kdvRate) && (
            <p
              style={{
                fontSize: 12.5,
                color: "var(--text-warning, #b45309)",
                margin: "-4px 0 12px",
              }}
            >
              Bu {DEAL_WORD_FORMS[dealWordKind(sector)].bare} zaten kazanılmış - Tutar/KDV
              değişikliği, bu döneme ait KDV Özet Raporu'nu da geriye dönük etkiler.
            </p>
          )}
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <div style={{ flex: 1 }}>
            <label
              style={{
                fontSize: 13,
                color: "var(--text-secondary)",
                display: "flex",
                alignItems: "center",
                gap: 4,
                marginBottom: 4,
              }}
            >
              {supportsSelfBooking(sector) ? "Kayıt Tarihi" : "Tarih"}
              {supportsSelfBooking(sector) && (
                <InfoTip
                  align="left"
                  text={`Bu, kaydın oluşturulma/güncellenme tarihidir - ${DEAL_WORD_FORMS[dealWordKind(sector)].bare === "randevu" ? "randevunun" : DEAL_WORD_FORMS[dealWordKind(sector)].bare === "rezervasyon" ? "rezervasyonun" : "görüşmenin"} kendi tarih/saati için ${bookingModel(sector) === "slot" ? "yukarıdaki" : "aşağıdaki özel alanlar bölümündeki"} "${customFieldDefs.find((d) => d.entity === "deal" && d.key === appointmentDateTimeKey)?.label || "Randevu/Görüşme Tarihi"}" alanını kullanın.`}
                />
              )}
            </label>
            <input
              type="date"
              value={dealDate}
              onChange={(e) => setDealDate(e.target.value)}
              style={{ width: "100%" }}
            />
          </div>
          <div style={{ flex: 1 }}>
            <label
              style={{
                fontSize: 13,
                color: "var(--text-secondary)",
                display: "block",
                marginBottom: 4,
              }}
            >
              Saat <span style={{ fontWeight: 400, color: "var(--text-muted)" }}>(opsiyonel)</span>
            </label>
            <input
              type="time"
              value={dealTime}
              onChange={(e) => setDealTime(e.target.value)}
              style={{ width: "100%" }}
            />
          </div>
          <div style={{ flex: 1 }}>
            <label
              style={{
                fontSize: 13,
                color: "var(--text-secondary)",
                display: "block",
                marginBottom: 4,
              }}
            >
              Aşama
            </label>
            <select
              value={stage}
              onChange={(e) => setStage(e.target.value)}
              style={{ width: "100%", fontWeight: 500, ...TONE_COLORS[stageTone(stage)] }}
            >
              {STAGES.map((s) => (
                <option key={s.id} value={s.id} style={TONE_COLORS[stageTone(s.id)]}>
                  {stageLabel(s.id, selectedCustomerType, sector)}
                </option>
              ))}
            </select>
          </div>
        </div>
        {stageGuide(stage, sector) && (
          <div
            style={{
              background: "var(--surface-1)",
              borderRadius: "var(--radius)",
              padding: "8px 10px",
              marginBottom: 12,
              fontSize: 12.5,
              color: "var(--text-secondary)",
              display: "flex",
              alignItems: "flex-start",
              gap: 6,
            }}
          >
            <i
              className="ti ti-bulb"
              style={{ fontSize: 14, flexShrink: 0, marginTop: 1, color: "var(--text-accent)" }}
              aria-hidden="true"
            ></i>
            <span>{stageGuide(stage, sector)}</span>
          </div>
        )}
        {isClosingStage && (
          <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 160 }}>
              <label
                style={{
                  fontSize: 13,
                  color: "var(--text-secondary)",
                  display: "block",
                  marginBottom: 4,
                }}
              >
                {selectedCustomerType === "bireysel"
                  ? stage === "kazanildi"
                    ? "Tamamlanma / fatura tarihi"
                    : "İptal tarihi"
                  : stage === "kazanildi"
                    ? "Kapanma / fatura tarihi"
                    : "Kapanma tarihi"}
              </label>
              <input
                type="date"
                min={dealDate}
                value={closedDate}
                onChange={(e) => setClosedDate(e.target.value)}
                style={{ width: "100%" }}
              />
              {dateError && (
                <p style={{ fontSize: 12, color: "var(--text-danger)", margin: "4px 0 0" }}>
                  {dateError}
                </p>
              )}
            </div>
            {stage === "kaybedildi" && (
              <div style={{ flex: 1, minWidth: 160 }}>
                <label
                  style={{
                    fontSize: 13,
                    color: "var(--text-secondary)",
                    display: "block",
                    marginBottom: 4,
                  }}
                >
                  {selectedCustomerType === "bireysel" ? "İptal nedeni" : "Kayıp nedeni"}
                </label>
                <select
                  value={lostReason}
                  onChange={(e) => setLostReason(e.target.value)}
                  style={{ width: "100%" }}
                >
                  {dealLostReasons(sector).map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        )}

        <button
          type="button"
          onClick={() => setShowAdvanced((v) => !v)}
          style={{
            width: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            background: "var(--surface-1)",
            border: "0.5px solid var(--border)",
            borderRadius: "var(--radius)",
            padding: "8px 12px",
            marginBottom: showAdvanced ? 10 : 12,
            fontSize: 13,
            fontWeight: 500,
            cursor: "pointer",
          }}
        >
          <span>
            Ek Bilgiler ve Dosyalar{" "}
            <span style={{ fontWeight: 400, color: "var(--text-muted)", fontSize: 12 }}>
              (Gider, seans/paket, not, sorumlu, etiket, özel alan, dosya)
            </span>
          </span>
          <i
            className={`ti ${showAdvanced ? "ti-chevron-up" : "ti-chevron-down"}`}
            style={{ fontSize: 16, flexShrink: 0 }}
            aria-hidden="true"
          ></i>
        </button>
        {showAdvanced && (
          <div>
            <div style={{ marginBottom: 12 }}>
              <label
                style={{
                  fontSize: 13,
                  color: "var(--text-secondary)",
                  display: "block",
                  marginBottom: 4,
                }}
              >
                Gider (TL)
              </label>
              <input
                type="number"
                min="0"
                value={cost}
                onChange={(e) => setCost(e.target.value)}
                placeholder="0"
                style={{ width: "100%" }}
              />
            </div>
            {teamMembers.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                <label
                  style={{
                    fontSize: 13,
                    color: "var(--text-secondary)",
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                    marginBottom: 4,
                  }}
                >
                  Sorumlu <InfoTip text={ASSIGNEE_INFO_TEXT} />
                </label>
                <select
                  value={assignedTo}
                  onChange={(e) => setAssignedTo(e.target.value)}
                  style={{ width: "100%" }}
                >
                  {currentUserId && <option value={currentUserId}>Ben ({currentUserEmail})</option>}
                  {teamMembers
                    .filter((m) => m.id !== currentUserId)
                    .map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name || m.email}
                      </option>
                    ))}
                  {assignedTo &&
                    assignedTo !== currentUserId &&
                    !teamMembers.some((m) => m.id === assignedTo) && (
                      <option value={assignedTo}>Eski üye (takımdan çıkarılmış)</option>
                    )}
                </select>
              </div>
            )}
            {resources.length > 0 && bookingModel(sector) === "slot" && (
              <div style={{ marginBottom: 12 }}>
                <label
                  style={{
                    fontSize: 13,
                    color: "var(--text-secondary)",
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                    marginBottom: 4,
                  }}
                >
                  Cihaz/Oda{" "}
                  <InfoTip text="Seçtiğiniz kaynağa aynı saatte ikinci bir randevu girilemez - kaynak seçmezseniz bu kontrol uygulanmaz." />
                </label>
                <select
                  value={resourceId}
                  onChange={(e) => setResourceId(e.target.value)}
                  style={{ width: "100%" }}
                >
                  <option value="">Seçilmedi</option>
                  {resources.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                  {resourceId && !resources.some((r) => r.id === resourceId) && (
                    <option value={resourceId}>Eski kaynak (silinmiş)</option>
                  )}
                </select>
              </div>
            )}
            {supportsSessionPackages(sector) && (
              <div style={{ marginBottom: 12 }}>
                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    fontSize: 13,
                    color: "var(--text-secondary)",
                    cursor: "pointer",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={isPackageDeal}
                    onChange={(e) => setIsPackageDeal(e.target.checked)}
                  />
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
                      <label
                        style={{
                          fontSize: 13,
                          color: "var(--text-secondary)",
                          display: "block",
                          marginBottom: 4,
                        }}
                      >
                        Toplam seans sayısı
                      </label>
                      <input
                        type="number"
                        min="1"
                        value={sessionTotal}
                        onChange={(e) => setSessionTotal(e.target.value)}
                        style={{ width: "100%" }}
                      />
                    </div>
                    <div style={{ flex: 1 }}>
                      <label
                        style={{
                          fontSize: 13,
                          color: "var(--text-secondary)",
                          display: "block",
                          marginBottom: 4,
                        }}
                      >
                        Kullanılan seans sayısı
                      </label>
                      <input
                        type="number"
                        min="0"
                        value={sessionUsed}
                        onChange={(e) => setSessionUsed(e.target.value)}
                        style={{ width: "100%" }}
                      />
                    </div>
                  </div>
                ) : (
                  <div>
                    <label
                      style={{
                        fontSize: 13,
                        color: "var(--text-secondary)",
                        display: "flex",
                        alignItems: "center",
                        gap: 4,
                        marginBottom: 6,
                      }}
                    >
                      Hizmet türleri
                      <InfoTip
                        align="left"
                        text="Örn. '8 seans Lazer + 2 seans Kontrol' gibi karma bir paket - her hizmet türünün kendi seans sayacı olur, toplam/kullanılan otomatik hesaplanır."
                      />
                    </label>
                    {packageBreakdown.map((b, i) => (
                      <div
                        key={i}
                        style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 6 }}
                      >
                        <input
                          value={b.label}
                          onChange={(e) => updateBreakdownRow(i, { label: e.target.value })}
                          placeholder="Örn. Lazer"
                          style={{ flex: 2, minWidth: 0 }}
                        />
                        <input
                          type="number"
                          min="1"
                          value={b.total}
                          onChange={(e) =>
                            updateBreakdownRow(i, { total: Number(e.target.value) || 1 })
                          }
                          placeholder="Toplam"
                          title="Toplam seans"
                          style={{ width: 64 }}
                        />
                        <input
                          type="number"
                          min="0"
                          value={b.used}
                          onChange={(e) =>
                            updateBreakdownRow(i, {
                              used: Math.min(Number(e.target.value) || 0, Number(b.total) || 0),
                            })
                          }
                          placeholder="Kullanılan"
                          title="Kullanılan seans"
                          style={{ width: 64 }}
                        />
                        <button
                          type="button"
                          onClick={() => removeBreakdownRow(i)}
                          style={{ fontSize: 12, flexShrink: 0 }}
                        >
                          Kaldır
                        </button>
                      </div>
                    ))}
                    <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: "4px 0" }}>
                      Toplam: {sessionTotal} seans, {sessionUsed} kullanıldı
                    </p>
                  </div>
                )}
                <button
                  type="button"
                  onClick={() =>
                    packageBreakdown.length === 0 ? convertToBreakdown() : addBreakdownRow()
                  }
                  style={{ fontSize: 12, marginTop: 4 }}
                >
                  {packageBreakdown.length === 0
                    ? "+ Karma pakete çevir (birden fazla hizmet türü)"
                    : "+ Hizmet türü ekle"}
                </button>
                {sessionError && (
                  <p style={{ fontSize: 12, color: "var(--text-danger)", margin: "4px 0 0" }}>
                    {sessionError}
                  </p>
                )}
              </div>
            )}
            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
              <div style={{ flex: 2 }}>
                <label
                  style={{
                    fontSize: 13,
                    color: "var(--text-secondary)",
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                    marginBottom: 4,
                  }}
                >
                  Not
                  <InfoTip
                    align="left"
                    text="İsterseniz sadece bir not olarak kullanın (tarih boş kalabilir), isterseniz sağdaki tarihi de doldurup gerçek bir hatırlatmaya çevirin - tarih girilirse Pano'da ve 'Bugün ne yapmalıyım' listesinde çıkar."
                  />
                </label>
                <div style={{ display: "flex", gap: 6 }}>
                  <input
                    value={reminder}
                    onChange={(e) => setReminder(e.target.value)}
                    placeholder="Yarın takip araması yap"
                    style={{ flex: 1 }}
                  />
                  <VoiceInputButton
                    onResult={(text) => setReminder((prev) => (prev ? `${prev} ${text}` : text))}
                  />
                </div>
              </div>
              <div style={{ flex: 1 }}>
                <label
                  style={{
                    fontSize: 13,
                    color: "var(--text-secondary)",
                    display: "block",
                    marginBottom: 4,
                  }}
                >
                  Hatırlatma tarihi{" "}
                  <span style={{ fontWeight: 400, color: "var(--text-muted)" }}>(opsiyonel)</span>
                </label>
                <input
                  type="date"
                  value={reminderDate}
                  onChange={(e) => setReminderDate(e.target.value)}
                  style={{ width: "100%" }}
                />
                <div style={{ display: "flex", gap: 4, marginTop: 4 }}>
                  {[
                    ["Bugün", 0],
                    ["Yarın", 1],
                    ["1 hafta sonra", 7],
                  ].map(([label, days]) => (
                    <button
                      key={label}
                      type="button"
                      onClick={() =>
                        setReminderDate(
                          new Date(Date.now() + days * 86400000).toISOString().slice(0, 10),
                        )
                      }
                      style={{
                        fontSize: 11,
                        height: 24,
                        padding: "0 10px",
                        display: "inline-flex",
                        alignItems: "center",
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            {reminder.trim() && reminderDate && (
              <div style={{ marginBottom: 12 }}>
                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    fontSize: 13,
                    color: "var(--text-secondary)",
                    cursor: selectedCustomerEmail ? "pointer" : "not-allowed",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={notifyCustomer}
                    disabled={!selectedCustomerEmail}
                    onChange={(e) => setNotifyCustomer(e.target.checked)}
                  />
                  Hatırlatma tarihinde müşteriye de e-posta gönder
                </label>
                {!selectedCustomerEmail && (
                  <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "4px 0 0 24px" }}>
                    Müşterinin e-postası yok, gönderilemez.
                  </p>
                )}
              </div>
            )}
            <div style={{ marginBottom: 12 }}>
              <label
                style={{
                  fontSize: 13,
                  color: "var(--text-secondary)",
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  marginBottom: 4,
                }}
              >
                Etiketler <InfoTip align="left" text={TAGS_INFO_TEXT} />
              </label>
              <TagInput tags={tags} onChange={setTags} suggestions={sectorTags} />
            </div>
            <CustomFieldsSection
              defs={otherDefsForEntity}
              values={customFields}
              onChange={setCustomFields}
            />
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
        {conflictError && (
          <p style={{ fontSize: 12.5, color: "var(--text-danger)", margin: "0 0 8px" }}>
            {conflictError}
          </p>
        )}
      </div>
      <div
        style={{
          display: "flex",
          gap: 8,
          justifyContent: "flex-end",
          paddingTop: 12,
          marginTop: 4,
          borderTop: "1px solid var(--border)",
          flexShrink: 0,
        }}
      >
        <button type="button" onClick={onCancel}>
          Vazgeç
        </button>
        <button
          type="submit"
          disabled={customers.length === 0}
          style={{ background: "var(--fill-accent)", color: "var(--on-accent)", border: "none" }}
        >
          Kaydet
        </button>
      </div>
    </form>
  );
}

export function BeforeAfterPhotoThumb({ attachment, onDelete }) {
  const [url, setUrl] = useState(null);

  useEffect(() => {
    let active = true;
    supabase.storage
      .from("attachments")
      .createSignedUrl(attachment.storagePath, 3600)
      .then(({ data }) => {
        if (active && data?.signedUrl) setUrl(data.signedUrl);
      });
    return () => {
      active = false;
    };
  }, [attachment.storagePath]);

  return (
    <div
      style={{
        position: "relative",
        width: 88,
        height: 88,
        borderRadius: "var(--radius)",
        overflow: "hidden",
        border: "0.5px solid var(--border)",
        background: "var(--surface-1)",
        flexShrink: 0,
      }}
    >
      {url ? (
        <a href={url} target="_blank" rel="noopener noreferrer">
          <img
            src={url}
            alt={attachment.fileName}
            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
          />
        </a>
      ) : (
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 10,
            color: "var(--text-muted)",
          }}
        >
          Yükleniyor…
        </div>
      )}
      <button
        type="button"
        onClick={() => onDelete(attachment.id)}
        title="Sil"
        style={{
          position: "absolute",
          top: 2,
          right: 2,
          width: 18,
          height: 18,
          borderRadius: "50%",
          background: "var(--surface-0)",
          border: "0.5px solid var(--border)",
          fontSize: 12,
          lineHeight: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
          padding: 0,
        }}
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
export function BeforeAfterPhotos({
  dealId,
  customer,
  attachments,
  onUpload,
  onDelete,
  onRequestConsent,
}) {
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
      <p
        style={{ fontSize: 12, fontWeight: 500, margin: "0 0 6px", color: "var(--text-secondary)" }}
      >
        {label}
      </p>
      {photos.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 6 }}>
          {photos.map((a) => (
            <BeforeAfterPhotoThumb key={a.id} attachment={a} onDelete={setConfirmDeleteId} />
          ))}
        </div>
      )}
      <label
        style={{
          background: "var(--surface-1)",
          border: "0.5px dashed var(--border)",
          borderRadius: "var(--radius)",
          padding: "6px 10px",
          fontSize: 12,
          display: "inline-block",
          cursor: consentGranted && uploadingSlot === null ? "pointer" : "not-allowed",
          opacity: consentGranted ? 1 : 0.5,
        }}
      >
        {uploadingSlot === slot ? "Yükleniyor…" : `+ ${label} fotoğrafı`}
        <input
          type="file"
          accept="image/*"
          onChange={(e) => handleFile(slot, e)}
          disabled={!consentGranted || uploadingSlot !== null}
          style={{ display: "none" }}
        />
      </label>
    </div>
  );

  return (
    <div style={{ marginBottom: 16 }}>
      <label
        style={{ fontSize: 13, color: "var(--text-secondary)", display: "block", marginBottom: 6 }}
      >
        Öncesi / Sonrası Fotoğrafları
      </label>
      {consentGranted ? (
        <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: "0 0 10px" }}>
          ✓ Fotoğraf saklama izni alındı
          {customer?.photoConsentAt
            ? ` (${new Date(customer.photoConsentAt).toLocaleDateString("tr-TR")})`
            : ""}
        </p>
      ) : (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            flexWrap: "wrap",
            marginBottom: 10,
            fontSize: 12,
            color: "var(--text-secondary)",
          }}
        >
          <span>Bu müşteri için fotoğraf saklama izni alınmamış - yükleme kilitli.</span>
          <button
            type="button"
            onClick={() => onRequestConsent(customer)}
            style={{
              fontSize: 12,
              background: "none",
              border: "0.5px solid var(--border)",
              borderRadius: "var(--radius)",
              padding: "2px 8px",
              cursor: "pointer",
            }}
          >
            {customer?.email ? "İzin e-postası gönder" : "İzin linki paylaş"}
          </button>
        </div>
      )}
      <div style={{ display: "flex", gap: 12 }}>
        {renderColumn("Öncesi", "before", beforePhotos)}
        {renderColumn("Sonrası", "after", afterPhotos)}
      </div>
      <p style={{ fontSize: 11, color: "var(--text-muted)", margin: "6px 0 0" }}>
        Fotoğraflar yalnızca ekibinizin erişebildiği güvenli bir alanda saklanır, müşteri portalında
        görünmez.
      </p>
      {confirmDeleteId && (
        <ConfirmDialog
          title="Fotoğraf silinsin mi?"
          message="Bu fotoğraf çöp kutusuna taşınır."
          onConfirm={() => {
            onDelete(confirmDeleteId);
            setConfirmDeleteId(null);
          }}
          onClose={() => setConfirmDeleteId(null)}
        />
      )}
    </div>
  );
}

// Yeni teklif/kayıt formundaki "Başlık" alanı için sektöre göre örnek —
// kullanıcı fark etti: sektör ne olursa olsun sadece bireysel/kurumsal ayrımına
// göre iki sabit örnek (biri sağlık diline yakın "İlk randevu / danışmanlık")
// gösteriliyordu, Emlak/Otel/Üretim gibi sektörlerde alakasız kalıyordu.
export const DEAL_TITLE_EXAMPLES = {
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

export const TAGS_INFO_TEXT =
  "Serbest metin etiketler - arama/filtrelemede ve listelerde kayda hızlıca göz atmak için kullanılır. " +
  "Sektörünüze göre bazı etiketler öneri olarak çıkar, istediğiniz herhangi bir kelimeyi de ekleyebilirsiniz.";

const SESSION_PACKAGE_INFO_TEXT =
  "Kuaför/klinik gibi paket/seans bazlı satış yapıyorsanız kullanın - toplam ve kullanılan seans sayısını siz " +
  'elle güncellersiniz ("Seans kullanıldı" butonuyla), kullanılan sayı toplama ulaşınca kart üzerinde ' +
  '"Paket tamamlandı" rozeti otomatik görünür.';

const kdvRateInfoText = (sector) => {
  const kind = dealWordKind(sector);
  const label =
    kind === "uyelik"
      ? "Üyelik Özeti PDF'inde"
      : kind === "randevu"
        ? "Randevu Özeti PDF'inde"
        : kind === "rezervasyon"
          ? "Rezervasyon Özeti PDF'inde"
          : "yazdırılan teklif PDF'inde";
  return (
    `Yukarıdaki Tutar zaten KDV dahil, müşteriden alınan toplam tutarı DEĞİŞTİRMEZ - sadece ${label} ` +
    '"Ara Toplam / KDV / Genel Toplam" satırlarının nasıl bölüneceğini belirler.'
  );
};

const ASSIGNEE_INFO_TEXT =
  'Bu teklif kazanıldığında, Pano\'daki "Personel Performansı" bölümünde seçtiğiniz kişinin altında sayılır.';

const LOST_REASONS = [
  "Yüksek fiyat",
  "Rakip tercih edildi",
  "Bütçe yok",
  "Zamanlama uymadı",
  "Vazgeçti",
  "Diğer",
];
// Randevu sektörlerinde (Güzellik & Bakım, Sağlık/Klinik) "kaybedildi" hemen
// hemen hep ya "randevuya gelmedi" ya "iptal etti" demek — genel satış
// nedenleri ("Yüksek fiyat", "Rakip tercih edildi" vb.) burada anlamsız
// kalıyordu. "İptal etti" bilinçli olarak İLK sırada: bir kaybı yanlışlıkla
// "gelmedi" (no-show, müşteri hakkında daha ağır bir iddia) olarak
// varsayılmasın diye varsayılan seçim daha nötr olan tarafta.
const APPOINTMENT_LOST_REASONS = [
  "İptal etti",
  "Geç iptal etti",
  "Randevuya gelmedi",
  "Mücbir sebep",
  "İşletme iptal etti",
  "Diğer",
];
export function dealLostReasons(sector) {
  return isAppointmentSector(sector) ? APPOINTMENT_LOST_REASONS : LOST_REASONS;
}

export const PAYMENT_MODE_LAST_CHOICE_KEY = "binerly_last_payment_mode";
export const PAYMENT_MODE_OPTIONS = [
  {
    value: "none",
    label: "Sadece onaylasın",
    desc: "Bugünkü gibi - ödeme adımı yok, müşteri sadece onaylar.",
  },
  {
    value: "optional",
    label: "Onaylasın + isterse ödesin",
    desc: "Onay ve ödeme birbirinden bağımsız, ikisi de ayrı ayrı sunulur.",
  },
  {
    value: "required",
    label: "Onaylamak için ödemesi şart",
    desc: "Tek adım: ödeme tamamlanınca onay da otomatik gerçekleşir.",
  },
];
