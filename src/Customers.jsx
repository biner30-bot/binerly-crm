import { useEffect, useMemo, useState } from "react";
import {
  Modal,
  InfoTip,
  ConfirmDialog,
  Badge,
  formatTL,
  formatAmountOrDash,
  uid,
  useFormDraft,
  TagInput,
  VoiceInputButton,
  AttachmentList,
  toWhatsAppNumber,
  WhatsAppIcon,
  WEEKDAYS,
  SECTORS,
  daysAgo,
  DateRangeFilter,
  getPortalUrl,
  IconButton,
  isValidPhone,
} from "./shared";
import {
  CustomFieldsSection,
  dealWordKind,
  stageLabel,
  isAppointmentSector,
  computeCustomerReliability,
  TagBadges,
  matchEmlakListing,
} from "./Sectors";
import { paymentDateLabel, TAGS_INFO_TEXT, BeforeAfterPhotoThumb } from "./Deals";
import { TaskForm } from "./Tasks";
import {
  transactionLabel,
  propertyStatusMeta,
  propertyAsListingDeal,
  propertyShareText,
  propertyShowcaseUrl,
  CUSTOMER_ROLES,
  SEEKING_ROLE_IDS,
  SEEKING_FIELD_KEYS,
  customerRoles,
  customerSeekingSummary,
  TALEP_FEATURES,
  TALEP_PAYMENT_OPTIONS,
  TALEP_URGENCY_OPTIONS,
} from "./realEstate";
import { CustomerShowings } from "./Showings";
import { BuyerListings } from "./BuyerListings";

export const ACTIVITY_TYPES = [
  { id: "note", label: "Not", icon: "ti-note" },
  { id: "call", label: "Telefon görüşmesi", icon: "ti-phone" },
  { id: "meeting", label: "Toplantı", icon: "ti-users" },
  { id: "email", label: "E-posta", icon: "ti-mail" },
];

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

const CUSTOMER_EMAIL_INFO_TEXT =
  "Güncel bir e-posta girmeniz önemli - teklif onay linki, müşteri portalı girişi ve hatırlatma e-postaları gibi " +
  "özellikler ancak müşterinin e-postası kayıtlıysa çalışır. Kaydettiğinizde müşteriye, kampanya/değerlendirme isteği " +
  "gibi e-postalar için iznini onaylayabileceği bir e-posta gönderilir - bu izni siz adına veremezsiniz, İYS kuralları gereği. " +
  'Bu izin e-postası ticari ileti sayılmadığı için Ayarlar\'daki "Müşterilere otomatik e-posta gönder" kapalı olsa bile gönderilir.';

const CUSTOMER_TYPE_INFO_TEXT =
  "Kurumsal/Bireysel seçimi sadece bir etiket değil - Sektör alanının görünüp görünmeyeceğini, hangi özel alanların çıkacağını " +
  've teklif formundaki bazı metinleri ("Kayıp nedeni" yerine "İptal nedeni" gibi) uygulamanın birçok yerinde değiştirir. ' +
  "Aşama isimleri ise önce sektörünüze (varsa) göre belirlenir, sektör bir aşamayı özelleştirmemişse kurumsal/bireysel ayrımına göre değişir.";

const SECTOR_FIELD_INFO_TEXT =
  'Bu, müşterinin kendi sektörü - Ayarlar\'daki "Sektör & Özel Alanlar"da seçtiğiniz KENDİ şirket sektörünüzden ' +
  "farklı bir alan. Burada seçtiğiniz değer, teklif formunda etiket önerisi olarak çıkabilir.";

export const cariBakiyeInfoText = (sector) => {
  const kind = dealWordKind(sector);
  const noun =
    kind === "uyelik"
      ? "üyeliklerinin"
      : kind === "randevu"
        ? "randevularının"
        : kind === "rezervasyon"
          ? "rezervasyonlarının"
          : "tekliflerinin";
  return (
    `Bu bakiye, müşterinin "${stageLabel("kazanildi", "kurumsal", sector)}" durumundaki ${noun} toplam tutarından tahsil edilen ödemelerin düşülmesiyle bulunur. ` +
    "Resmi bir cari hesap kaydı değildir, sadece kendi takibiniz içindir."
  );
};

export function CustomerForm({
  initial,
  customers = [],
  customFieldDefs = [],
  sectorTags = [],
  preferredCustomerType,
  companySector,
  draftScopeId,
  onSave,
  onCancel,
}) {
  const initialIsCustomSector = initial?.sector && !SECTORS.includes(initial.sector);
  // Yalnızca yeni müşteride yarım kalan içerik korunur (düzenlemede bayat veri riski).
  const {
    draft,
    persist: persistDraft,
    clear: clearDraft,
    restored: draftRestored,
  } = useFormDraft(`customer_new_${draftScopeId}`, !initial?.id);
  const [showDraftNote, setShowDraftNote] = useState(draftRestored);
  const [customerType, setCustomerType] = useState(
    draft.customerType ??
      (initial?.customerType ||
        (companySector === "emlak" ? "bireysel" : preferredCustomerType) ||
        "kurumsal"),
  );
  const [name, setName] = useState(draft.name ?? (initial?.name || ""));
  const [sector, setSector] = useState(
    draft.sector ?? (initialIsCustomSector ? "Diğer" : initial?.sector || SECTORS[0]),
  );
  const [customSector, setCustomSector] = useState(
    draft.customSector ?? (initialIsCustomSector ? initial.sector : ""),
  );
  const [region, setRegion] = useState(draft.region ?? (initial?.region || ""));
  const [address, setAddress] = useState(draft.address ?? (initial?.address || ""));
  const [phone, setPhone] = useState(draft.phone ?? (initial?.phone || ""));
  const [email, setEmail] = useState(draft.email ?? (initial?.email || ""));
  const [notes, setNotes] = useState(draft.notes ?? (initial?.notes || ""));
  const [tags, setTags] = useState(draft.tags ?? (initial?.tags || []));
  const [customFields, setCustomFields] = useState(
    draft.customFields ?? (initial?.customFields || {}),
  );
  const [formError, setFormError] = useState("");

  useEffect(() => {
    const hasContent = !!(
      name.trim() ||
      phone.trim() ||
      email.trim() ||
      address.trim() ||
      region.trim() ||
      notes.trim() ||
      (tags && tags.length) ||
      Object.keys(customFields || {}).length
    );
    persistDraft(
      {
        customerType,
        name,
        sector,
        customSector,
        region,
        address,
        phone,
        email,
        notes,
        tags,
        customFields,
      },
      hasContent,
    );
  }, [
    persistDraft,
    customerType,
    name,
    sector,
    customSector,
    region,
    address,
    phone,
    email,
    notes,
    tags,
    customFields,
  ]);
  const isKurumsal = customerType === "kurumsal";
  const defsForEntity = customFieldDefs.filter(
    (d) => d.entity === "customer" && (!d.audience || d.audience === customerType),
  );
  // Emlak: rol (alıcı/kiracı/mal sahibi...) etiketten okunur; talep alanları
  // sadece bir şey arayan rollerde gösterilir - mal sahibine "aranan oda" sormak
  // formu boşuna uzatıyordu.
  const isEmlak = companySector === "emlak";
  const roleIds = new Set(
    CUSTOMER_ROLES.filter((r) => (tags || []).includes(r.tag)).map((r) => r.id),
  );
  const showSeeking =
    !isEmlak || roleIds.size === 0 || SEEKING_ROLE_IDS.some((i) => roleIds.has(i));
  const seekingDefs = isEmlak
    ? defsForEntity.filter((d) => SEEKING_FIELD_KEYS.includes(d.key))
    : [];
  const otherDefs = isEmlak
    ? defsForEntity.filter((d) => !SEEKING_FIELD_KEYS.includes(d.key))
    : defsForEntity;
  // Emlak: danışman telefonda/ayakta kayıt açar - önce ad, telefon, rol ve ne
  // aradığı; adres/not/etiket/talep detayları "Diğer bilgiler"de katlı (yeni
  // kayıtta). Blok sırası CSS order ile: diğer sektörlerin formu değişmez.
  const [showMore, setShowMore] = useState(!isEmlak || !!initial?.id);
  const ord = (n) => (isEmlak ? { order: n } : {});
  const showExtra = !isEmlak || showMore;
  const roleTagSet = new Set(CUSTOMER_ROLES.map((r) => r.tag));
  const tagSuggestions = isEmlak ? sectorTags.filter((t) => !roleTagSet.has(t)) : sectorTags;
  const toggleRole = (r) => {
    const on = !roleIds.has(r.id);
    setTags((prev) => (on ? [...(prev || []), r.tag] : (prev || []).filter((t) => t !== r.tag)));
    if (on && r.seeks && !customFields?.aranan_islem)
      setCustomFields((prev) => ({ ...(prev || {}), aranan_islem: r.seeks }));
  };

  // Aynı e-posta/telefonla ikinci bir müşteri kaydı oluşturulursa (genelde
  // yanlışlıkla), müşteri portalı bu iki kaydı da aynı hesaba bağlar ve aynı
  // işletme iki kez görünür (bkz. proje geçmişi) — aynı telefonu/e-postayı
  // gerçekten farklı iki kişinin kullanması gerçekçi olmadığı için bu artık
  // gerçek bir engel, uyarıyla geçilebilen bir onay değil.
  const findDuplicateCustomer = (trimmedEmail, trimmedPhone) => {
    const match = customers.find(
      (c) =>
        c.id !== initial?.id &&
        ((trimmedEmail && c.email?.trim().toLowerCase() === trimmedEmail.toLowerCase()) ||
          (trimmedPhone && c.phone?.trim() === trimmedPhone)),
    );
    return match || null;
  };

  return (
    <form
      style={{ display: "flex", flexDirection: "column" }}
      onSubmit={(e) => {
        e.preventDefault();
        if (!name.trim()) {
          setFormError(isKurumsal ? "Firma adı girin." : "Ad soyad girin.");
          return;
        }
        if (isKurumsal && sector === "Diğer" && !customSector.trim()) {
          setFormError("Sektörünüzü yazın.");
          return;
        }
        if (!email.trim() && !phone.trim()) {
          setFormError("Telefon veya e-postadan en az biri girilmelidir.");
          return;
        }
        if (phone.trim() && !isValidPhone(phone)) {
          setFormError("Geçerli bir telefon numarası girin.");
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
          setFormError(
            `"${duplicateWith.name}" adlı müşteride aynı e-posta veya telefon zaten kayıtlı - aynı telefon/e-posta ile ikinci bir müşteri eklenemez.`,
          );
          return;
        }
        setFormError("");
        clearDraft();
        onSave(payload);
      }}
    >
      {showDraftNote && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 8,
            fontSize: 12.5,
            color: "var(--text-secondary)",
            background: "var(--bg-accent)",
            border: "0.5px solid var(--border)",
            borderRadius: "var(--radius)",
            padding: "6px 10px",
            marginBottom: 12,
          }}
        >
          <span>Yarım kalan kayıt geri yüklendi.</span>
          <IconButton
            icon="ti-x"
            title="Bu bildirimi gizle"
            size="sm"
            onClick={() => setShowDraftNote(false)}
          />
        </div>
      )}
      {(!isEmlak || isKurumsal) && (
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
            Müşteri tipi <InfoTip text={CUSTOMER_TYPE_INFO_TEXT} placement="bottom" align="left" />
          </label>
          <select
            value={customerType}
            onChange={(e) => setCustomerType(e.target.value)}
            style={{ width: "100%" }}
          >
            <option value="kurumsal">Kurumsal</option>
            <option value="bireysel">Bireysel</option>
          </select>
        </div>
      )}
      <div style={{ marginBottom: 12, ...ord(1) }}>
        <label
          style={{
            fontSize: 13,
            color: "var(--text-secondary)",
            display: "block",
            marginBottom: 4,
          }}
        >
          {isKurumsal ? "Firma adı" : "Müşteri adı"}
        </label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={isKurumsal ? "Akın İnşaat" : "Ayşe Yılmaz"}
          style={{ width: "100%" }}
        />
      </div>
      {isEmlak && (
        <div style={{ marginBottom: 12, ...ord(3) }}>
          <label
            style={{
              fontSize: 13,
              color: "var(--text-secondary)",
              display: "block",
              marginBottom: 4,
            }}
          >
            Müşteri kim? (birden fazla seçilebilir)
          </label>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {CUSTOMER_ROLES.map((r) => {
              const on = roleIds.has(r.id);
              return (
                <button
                  key={r.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggleRole(r)}
                  style={{
                    fontSize: 12.5,
                    padding: "5px 10px",
                    borderRadius: 999,
                    ...(on
                      ? {
                          background: "var(--fill-accent)",
                          color: "var(--on-accent)",
                          border: "none",
                        }
                      : {}),
                  }}
                >
                  {on && <i className="ti ti-check" aria-hidden="true" />} {r.label}
                </button>
              );
            })}
          </div>
          {roleIds.size > 0 && !showSeeking && (
            <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "6px 0 0" }}>
              Mülkünü Portföy sekmesinden ekleyip mal sahibi olarak bu müşteriyi seçin - portföy
              kartında görünür.
            </p>
          )}
        </div>
      )}
      {showExtra && (
        <div style={{ display: "flex", gap: 12, marginBottom: 12, ...ord(11) }}>
          {isKurumsal && (
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
                Sektör <InfoTip text={SECTOR_FIELD_INFO_TEXT} />
              </label>
              <select
                value={sector}
                onChange={(e) => setSector(e.target.value)}
                style={{ width: "100%" }}
              >
                {SECTORS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div style={{ flex: 1 }}>
            <label
              style={{
                fontSize: 13,
                color: "var(--text-secondary)",
                display: "block",
                marginBottom: 4,
              }}
            >
              Bölge / Şehir
            </label>
            <input
              value={region}
              onChange={(e) => setRegion(e.target.value)}
              placeholder="İstanbul"
              style={{ width: "100%" }}
            />
          </div>
        </div>
      )}
      {showExtra && (
        <div style={{ marginBottom: 12, ...ord(12) }}>
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
            Açık Adres{" "}
            <InfoTip
              align="left"
              text="Online ödeme (iyzico/PayTR) alırken fatura/adres bilgisi olarak kullanılır - boş bırakılırsa sadece Bölge/Şehir gönderilir."
            />
          </label>
          <input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="Mahalle, cadde/sokak, no, ilçe"
            style={{ width: "100%" }}
          />
        </div>
      )}
      {isKurumsal && sector === "Diğer" && (
        <div style={{ marginBottom: 12 }}>
          <label
            style={{
              fontSize: 13,
              color: "var(--text-secondary)",
              display: "block",
              marginBottom: 4,
            }}
          >
            Sektör adı
          </label>
          <input
            value={customSector}
            onChange={(e) => setCustomSector(e.target.value)}
            placeholder="Sektörünüzü yazın"
            style={{ width: "100%" }}
          />
        </div>
      )}
      <div style={{ display: "flex", gap: 12, marginBottom: 12, ...ord(2) }}>
        <div style={{ flex: 1 }}>
          <label
            style={{
              fontSize: 13,
              color: "var(--text-secondary)",
              display: "block",
              marginBottom: 4,
            }}
          >
            Telefon
          </label>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="0532 000 00 00"
            style={{ width: "100%" }}
          />
        </div>
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
            E-posta{" "}
            {!isEmlak && (
              <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-warning)" }}>
                (önemli)
              </span>
            )}{" "}
            <InfoTip align="right" text={CUSTOMER_EMAIL_INFO_TEXT} />
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={isKurumsal ? "info@firma.com" : "ayse@gmail.com"}
            style={{ width: "100%" }}
          />
        </div>
      </div>
      {showExtra && (
        <div style={{ marginBottom: 12, ...ord(13) }}>
          <label
            style={{
              fontSize: 13,
              color: "var(--text-secondary)",
              display: "block",
              marginBottom: 4,
            }}
          >
            Not
          </label>
          <div style={{ display: "flex", gap: 6, alignItems: "flex-start" }}>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={
                isKurumsal
                  ? `Örn. ${CUSTOMER_NOTE_EXAMPLES_KURUMSAL[companySector] || "yaz aylarında sipariş hacmi artıyor"}`
                  : "Örn. genelde akşamları ulaşmak daha kolay"
              }
              style={{ flex: 1, minHeight: 70, resize: "vertical" }}
            />
            <VoiceInputButton
              onResult={(text) => setNotes((prev) => (prev ? `${prev} ${text}` : text))}
            />
          </div>
        </div>
      )}
      {showExtra && (
        <div style={{ marginBottom: 16, ...ord(14) }}>
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
          <TagInput tags={tags} onChange={setTags} suggestions={tagSuggestions} />
        </div>
      )}
      {isEmlak && showSeeking && seekingDefs.length > 0 && (
        <div style={{ marginBottom: 4, ...ord(4) }}>
          <p style={{ fontSize: 13, fontWeight: 600, margin: "0 0 6px" }}>
            Ne arıyor?{" "}
            <span style={{ fontWeight: 400, fontSize: 12, color: "var(--text-muted)" }}>
              - uyan portföyler bu bilgilere göre bulunur
            </span>
          </p>
          <CustomFieldsSection
            defs={seekingDefs}
            values={customFields}
            onChange={setCustomFields}
            hideTitle
          />
          {showExtra && <TalepDetails values={customFields || {}} onChange={setCustomFields} />}
        </div>
      )}
      {isEmlak && !showMore && (
        <button
          type="button"
          onClick={() => setShowMore(true)}
          style={{ alignSelf: "flex-start", fontSize: 12.5, marginBottom: 12, ...ord(5) }}
        >
          + Diğer bilgiler (m², bina yaşı, ödeme, aciliyet, adres, not, etiket)
        </button>
      )}
      {showExtra && (
        <div style={ord(15)}>
          <CustomFieldsSection defs={otherDefs} values={customFields} onChange={setCustomFields} />
        </div>
      )}
      {formError && (
        <p style={{ fontSize: 12.5, color: "var(--text-danger)", margin: "0 0 8px", ...ord(20) }}>
          {formError}
        </p>
      )}
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", ...ord(21) }}>
        <button
          type="button"
          onClick={() => {
            clearDraft();
            onCancel();
          }}
        >
          Vazgeç
        </button>
        <button
          type="submit"
          style={{ background: "var(--fill-accent)", color: "var(--on-accent)", border: "none" }}
        >
          Kaydet
        </button>
      </div>
    </form>
  );
}

// Emlak talep kartının ek alanları (talep_* anahtarları, bkz. realEstate.js).
function TalepDetails({ values, onChange }) {
  const set = (k, v) => onChange({ ...values, [k]: v });
  const features = Array.isArray(values.talep_ozellikler) ? values.talep_ozellikler : [];
  const lbl = { fontSize: 13, color: "var(--text-secondary)", display: "block", marginBottom: 4 };
  const num = (k, placeholder) => (
    <input
      type="number"
      min="0"
      value={values[k] ?? ""}
      placeholder={placeholder}
      onChange={(e) => set(k, e.target.value)}
      style={{ width: "100%" }}
    />
  );
  return (
    <div style={{ marginBottom: 12 }}>
      <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "-2px 0 8px" }}>
        Bölgeye virgülle birden fazla mahalle yazabilirsiniz (ör. Bostanlı, Atakent).
      </p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
        <div style={{ flex: "1 1 120px" }}>
          <label style={lbl}>Min. m² (brüt)</label>
          {num("talep_m2_min", "ör. 110")}
        </div>
        <div style={{ flex: "1 1 120px" }}>
          <label style={lbl}>Max. m² (brüt)</label>
          {num("talep_m2_max", "ör. 150")}
        </div>
        <div style={{ flex: "1 1 120px" }}>
          <label style={lbl}>En fazla bina yaşı</label>
          {num("talep_max_yas", "ör. 15")}
        </div>
      </div>
      <label style={lbl}>Olmazsa olmazlar</label>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
        {TALEP_FEATURES.map((f) => {
          const on = features.includes(f.id);
          return (
            <button
              key={f.id}
              type="button"
              aria-pressed={on}
              onClick={() =>
                set(
                  "talep_ozellikler",
                  on ? features.filter((x) => x !== f.id) : [...features, f.id],
                )
              }
              style={{
                fontSize: 12.5,
                padding: "4px 10px",
                borderRadius: 999,
                ...(on
                  ? { background: "var(--fill-accent)", color: "var(--on-accent)", border: "none" }
                  : {}),
              }}
            >
              {on && <i className="ti ti-check" aria-hidden="true" />} {f.label}
            </button>
          );
        })}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "flex-end" }}>
        <div style={{ flex: "1 1 160px" }}>
          <label style={lbl}>Ödeme</label>
          <select
            value={values.talep_odeme || ""}
            onChange={(e) => set("talep_odeme", e.target.value)}
            style={{ width: "100%" }}
          >
            <option value="">Seçiniz</option>
            {TALEP_PAYMENT_OPTIONS.map((o) => (
              <option key={o}>{o}</option>
            ))}
          </select>
        </div>
        <div style={{ flex: "1 1 160px" }}>
          <label style={lbl}>Ne zaman?</label>
          <select
            value={values.talep_aciliyet || ""}
            onChange={(e) => set("talep_aciliyet", e.target.value)}
            style={{ width: "100%" }}
          >
            <option value="">Seçiniz</option>
            {TALEP_URGENCY_OPTIONS.map((o) => (
              <option key={o}>{o}</option>
            ))}
          </select>
        </div>
        <label
          style={{
            flex: "1 1 200px",
            fontSize: 13,
            display: "flex",
            alignItems: "center",
            gap: 6,
            paddingBottom: 6,
          }}
        >
          <input
            type="checkbox"
            checked={values.talep_zincir === true}
            onChange={(e) => set("talep_zincir", e.target.checked)}
          />
          Mevcut evini satıp alacak
          <InfoTip text="İşaretlerseniz müşteri kartında hatırlatılır: önce onun evini satmak (portföy almak) hem alımı hızlandırır hem ikinci bir işlem demektir." />
        </label>
      </div>
      <p style={{ fontSize: 11.5, color: "var(--text-muted)", margin: "6px 0 0" }}>
        Olmazsa olmazı kesin olarak olmayan portföy eşleşmede elenir; portföyde o bilgi girilmemişse
        elenmez. Kredi ile alacak müşteriye "krediye uygun değil" işaretli portföy önerilmez.
      </p>
    </div>
  );
}

function activityDateLabel(dateStr) {
  const d = new Date(dateStr);
  return (
    d.toLocaleDateString("tr-TR", { day: "numeric", month: "short", year: "numeric" }) +
    " · " +
    d.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })
  );
}

// Gölge Avcı'nın ters yönü: müşterinin talebine (aranan_* alanları) uyan açık
// portföyler. Aynı matchEmlakListing puanlaması, tek müşteriyle her portföy için
// çalıştırılır - iki yönde de aynı eşik/ağırlıklar geçerli kalsın diye.
// Pano'daki "uyan evi olmayan alıcılar" ve kart içi uyarı aynı ölçütü kullansın.
export function hasOwnPropertyMatch(customer, properties) {
  return properties.some(
    (p) =>
      ["aktif", "opsiyonlu"].includes(p.status) &&
      p.ownerCustomerId !== customer.id &&
      matchEmlakListing(propertyAsListingDeal(p, { forMatching: true }), [
        { ...customer, phone: customer.phone || "-" },
      ]).length > 0,
  );
}

function MatchingProperties({ customer, properties, showings, onOpenPortfolio, companySettings }) {
  const shownIds = new Set(
    showings.filter((s) => s.customerId === customer.id).map((s) => s.propertyId),
  );
  const matches = properties
    .filter((p) => ["aktif", "opsiyonlu"].includes(p.status))
    .filter((p) => p.ownerCustomerId !== customer.id)
    .map((p) => {
      const [m] = matchEmlakListing(propertyAsListingDeal(p, { forMatching: true }), [
        { ...customer, phone: customer.phone || "-" },
      ]);
      return m ? { property: p, score: m.score, reasons: m.reasons } : null;
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score);
  if (matches.length === 0) return null;
  const wa = toWhatsAppNumber(customer.phone);
  return (
    <div style={{ marginBottom: 16 }}>
      <p style={{ fontSize: 13, fontWeight: 500, margin: "0 0 6px" }}>
        Talebine uyan portföyler ({matches.length})
        <InfoTip text="Yeşil simge portföyü müşteriye WhatsApp'tan gönderir. Portföy vitrinde yayındaysa mesaja fotoğraflı ilan sayfasının bağlantısı eklenir; adres ve ada/parsel mesajda yer almaz." />
      </p>
      {matches.map(({ property, score, reasons }) => (
        <div key={property.id} style={{ display: "flex", gap: 6, alignItems: "stretch" }}>
          <button
            type="button"
            onClick={onOpenPortfolio}
            style={{
              display: "block",
              flex: 1,
              minWidth: 0,
              textAlign: "left",
              fontSize: 13,
              padding: "8px 10px",
              marginBottom: 6,
              background: "var(--surface-1)",
              border: "0.5px solid var(--border)",
              borderRadius: "var(--radius)",
              cursor: "pointer",
            }}
          >
            <span style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
              <span>{property.title}</span>
              <span style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                {shownIds.has(property.id) && <Badge tone="default">Gösterildi</Badge>}
                <Badge tone={score >= 80 ? "success" : score >= 65 ? "accent" : "default"}>
                  %{score} uyum
                </Badge>
              </span>
            </span>
            <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
              {property.price ? `${formatTL(property.price)} · ` : ""}Uyan kriterler:{" "}
              {reasons.join(", ")}
            </span>
          </button>
          {wa && (
            <a
              href={`https://wa.me/${wa}?text=${encodeURIComponent(
                `Merhaba ${customer.name?.split(" ")[0] || ""}, aradığınız kriterlere uyan bir portföyümüz var:\n\n${propertyShareText(property, propertyShowcaseUrl(property, companySettings))}`,
              )}`}
              target="_blank"
              rel="noopener noreferrer"
              title="Bu portföyü müşteriye WhatsApp'tan gönder"
              aria-label="Bu portföyü müşteriye WhatsApp'tan gönder"
              style={{
                display: "flex",
                alignItems: "center",
                padding: "0 10px",
                marginBottom: 6,
                border: "0.5px solid var(--border)",
                borderRadius: "var(--radius)",
                color: "#25d366",
              }}
            >
              <WhatsAppIcon />
            </a>
          )}
        </div>
      ))}
    </div>
  );
}

export function CustomerDetail({
  customer,
  deals,
  payments,
  activities,
  sector,
  isVip = false,
  customFieldDefs = [],
  groupClasses = [],
  groupClassEnrollments = [],
  attachments = [],
  onUploadAttachment,
  onDownloadAttachment,
  onDeleteAttachment,
  onAddActivity,
  onRequestConsent,
  teamMembers = [],
  currentUserId,
  currentUserEmail,
  onSaveTask,
  onClose,
  ownedProperties = [],
  onOpenPortfolio,
  showings = [],
  properties = [],
  companySettings = null,
  buyerListings = [],
  officeProperties = [],
  officeMembers = [],
  onSaveBuyerListings,
  onDeleteBuyerListing,
  onStartSharedDeal,
  agentName = "",
}) {
  const [type, setType] = useState("note");
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [showTaskForm, setShowTaskForm] = useState(false);

  const myClasses = groupClassEnrollments
    .filter((e) => e.customerId === customer.id)
    .map((e) => groupClasses.find((g) => g.id === e.groupClassId))
    .filter(Boolean);

  const customerDeals = deals.filter((d) => d.customerId === customer.id);
  const reliability = isAppointmentSector(sector)
    ? computeCustomerReliability(customer.id, deals)
    : null;
  const wonCustomerDeals = customerDeals.filter((d) => d.stage === "kazanildi");
  const wonDealIds = new Set(wonCustomerDeals.map((d) => d.id));
  const customerPayments = payments.filter((p) => wonDealIds.has(p.dealId));
  const totalDebt = wonCustomerDeals.reduce((sum, d) => sum + (d.value || 0), 0);
  const totalCollected = customerPayments.reduce((sum, p) => sum + (p.amount || 0), 0);
  const balance = totalDebt - totalCollected;
  let runningBalance = 0;
  const ledgerEvents = [
    ...wonCustomerDeals.map((d) => ({
      id: `debt-${d.id}`,
      kind: "borc",
      date: d.closedAt || d.createdAt,
      label: d.title,
      amount: d.value,
    })),
    ...customerPayments.map((p) => ({
      id: `pay-${p.id}`,
      kind: "tahsilat",
      date: p.paidAt,
      label: p.note || "Tahsilat",
      amount: p.amount,
    })),
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
        <p
          style={{
            margin: 0,
            fontSize: 13,
            color: "var(--text-secondary)",
            display: "flex",
            alignItems: "center",
            gap: 6,
            flexWrap: "wrap",
          }}
        >
          <span>
            {[customer.sector, customer.region, customer.phone, customer.email]
              .filter(Boolean)
              .join(" · ")}
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
        {customer.notes && (
          <p style={{ margin: "6px 0 0", fontSize: 13, color: "var(--text-secondary)" }}>
            {customer.notes}
          </p>
        )}
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
        <div
          style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}
        >
          {isVip && (
            <span title="Ömür boyu tahsilata göre en değerli %10 müşteri arasında">
              <Badge tone="accent">⭐ VIP müşteri</Badge>
            </span>
          )}
          {customer.marketingConsent ? (
            <Badge tone="success">✓ Pazarlama e-postası izni var</Badge>
          ) : (
            <Badge tone="warning">Pazarlama e-postası izni yok</Badge>
          )}
          {isAppointmentSector(sector) &&
            (customer.photoConsent ? (
              <Badge tone="success">✓ Fotoğraf saklama izni var</Badge>
            ) : (
              <Badge tone="warning">Fotoğraf saklama izni yok</Badge>
            ))}
          {reliability?.tier === "riskli" && (
            <span
              title={`Son ${reliability.total} randevunun ${reliability.violations}'inde gelmedi/geç iptal etti`}
            >
              <Badge tone="danger">⚠ Riskli - sık gelmiyor</Badge>
            </span>
          )}
          {reliability?.tier === "guvenilir" && (
            <span title={`Son ${reliability.total} randevuya hep geldi`}>
              <Badge tone="success">✓ Güvenilir müşteri</Badge>
            </span>
          )}
          {!customer.marketingConsent && (
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
              {customer.email ? "İzin e-postası gönder" : "İzin linki paylaş"}
            </button>
          )}
        </div>
        {customFieldDefs.filter((d) => d.entity === "customer" && customer.customFields?.[d.key])
          .length > 0 && (
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

      {ownedProperties.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <p style={{ fontSize: 13, fontWeight: 500, margin: "0 0 6px" }}>Mülkleri</p>
          {ownedProperties.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={onOpenPortfolio}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 8,
                width: "100%",
                textAlign: "left",
                fontSize: 13,
                padding: "8px 10px",
                marginBottom: 6,
                background: "var(--surface-1)",
                border: "0.5px solid var(--border)",
                borderRadius: "var(--radius)",
                cursor: "pointer",
              }}
            >
              <span>{p.title}</span>
              <span style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                <Badge tone="accent">{transactionLabel(p.transactionType)}</Badge>
                <Badge tone={propertyStatusMeta(p.status).tone}>
                  {propertyStatusMeta(p.status).label}
                </Badge>
              </span>
            </button>
          ))}
        </div>
      )}

      <CustomerShowings
        customerId={customer.id}
        showings={showings}
        properties={properties}
        onOpenPortfolio={onOpenPortfolio}
      />

      {sector === "emlak" && customerSeekingSummary(customer) && (
        <div style={{ marginBottom: 12, fontSize: 13 }}>
          <b>Aradığı:</b> {customerSeekingSummary(customer)}
          {Array.isArray(customer.customFields?.talep_ozellikler) &&
            customer.customFields.talep_ozellikler.length > 0 && (
              <span style={{ color: "var(--text-muted)" }}>
                {" "}
                · olmazsa olmaz:{" "}
                {customer.customFields.talep_ozellikler
                  .map((id) => TALEP_FEATURES.find((f) => f.id === id)?.label)
                  .filter(Boolean)
                  .join(", ")}
              </span>
            )}
          {customer.customFields?.talep_odeme && (
            <span style={{ color: "var(--text-muted)" }}>
              {" "}
              · {customer.customFields.talep_odeme}
            </span>
          )}
          {customer.customFields?.talep_zincir === true && ownedProperties.length === 0 && (
            <p
              style={{
                margin: "6px 0 0",
                padding: "6px 10px",
                background: "var(--bg-warning)",
                borderRadius: 6,
                fontSize: 12.5,
              }}
            >
              Mevcut evini satıp alacak - evini portföye almak alımı hızlandırır ve ikinci bir işlem
              demektir.
            </p>
          )}
        </div>
      )}

      {sector === "emlak" && (
        <MatchingProperties
          companySettings={companySettings}
          customer={customer}
          properties={properties}
          showings={showings}
          onOpenPortfolio={onOpenPortfolio}
        />
      )}

      {sector === "emlak" && onSaveBuyerListings && (
        <BuyerListings
          customer={customer}
          listings={buyerListings.filter((l) => l.customerId === customer.id)}
          officeProperties={officeProperties}
          officeMembers={officeMembers}
          hasOwnMatches={hasOwnPropertyMatch(customer, properties)}
          companySettings={companySettings}
          agentName={agentName}
          onSave={onSaveBuyerListings}
          onDelete={onDeleteBuyerListing}
          onStartSharedDeal={onStartSharedDeal}
        />
      )}

      {customerDeals.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <p style={{ fontSize: 13, fontWeight: 500, margin: "0 0 6px" }}>
            {dealWordKind(sector) === "uyelik"
              ? "Üyelikler"
              : dealWordKind(sector) === "randevu"
                ? "Randevular"
                : dealWordKind(sector) === "rezervasyon"
                  ? "Rezervasyonlar"
                  : "Teklifler"}
          </p>
          {customerDeals.map((d) => {
            const randevuTarihi = d.customFields?.portal_randevu_zamani;
            return (
              <div
                key={d.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: 13,
                  padding: "4px 0",
                }}
              >
                <span>
                  {d.title}
                  {randevuTarihi && (
                    <span style={{ color: "var(--text-muted)" }}>
                      {" "}
                      ·{" "}
                      {new Date(`${randevuTarihi}+03:00`).toLocaleString("tr-TR", {
                        day: "numeric",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  )}
                  {d.customFields?.kaynak === "portal" && d.customFields?.portal_randevu_zamani && (
                    <span style={{ color: "var(--text-muted)" }}> · Portaldan alındı</span>
                  )}
                  {d.customFields?.kaynak === "randevu_widget" &&
                    d.customFields?.portal_randevu_zamani && (
                      <span style={{ color: "var(--text-muted)" }}> · Web'den alındı</span>
                    )}
                </span>
                <span style={{ color: "var(--text-secondary)" }}>
                  {stageLabel(d.stage, customer.customerType || "kurumsal", sector)} ·{" "}
                  {formatAmountOrDash(d.value)}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {isAppointmentSector(sector) && wonCustomerDeals.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <p
            style={{
              fontSize: 13,
              fontWeight: 500,
              margin: "0 0 8px",
              display: "flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            İşlem Geçmişi{" "}
            <InfoTip text="Hangi işlem yapıldığını, kullanılan formül/dozu ve sonucu geçmiş randevulardan otomatik toplar - hiçbir yere ayrıca girmenize gerek yok, teklif/randevu kaydını doldurmanız yeterli." />
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {[...wonCustomerDeals]
              .sort(
                (a, b) => new Date(b.closedAt || b.createdAt) - new Date(a.closedAt || a.createdAt),
              )
              .map((d) => {
                const dealPhotos = attachments.filter(
                  (a) => a.entityType === "deal_photos" && a.entityId === d.id,
                );
                const beforePhotos = dealPhotos.filter((a) => a.photoType === "before");
                const afterPhotos = dealPhotos.filter((a) => a.photoType === "after");
                const dealFieldDefs = customFieldDefs.filter(
                  (fd) => fd.entity === "deal" && d.customFields?.[fd.key],
                );
                return (
                  <div
                    key={d.id}
                    style={{
                      border: "0.5px solid var(--border)",
                      borderRadius: "var(--radius)",
                      padding: "8px 10px",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                      <strong>{d.title}</strong>
                      <span style={{ color: "var(--text-muted)" }}>
                        {paymentDateLabel(d.closedAt || d.createdAt)}
                      </span>
                    </div>
                    {dealFieldDefs.length > 0 && (
                      <div
                        style={{ marginTop: 4, display: "flex", flexDirection: "column", gap: 2 }}
                      >
                        {dealFieldDefs.map((fd) => (
                          <p
                            key={fd.key}
                            style={{ margin: 0, fontSize: 12.5, color: "var(--text-secondary)" }}
                          >
                            <strong>{fd.label}:</strong> {d.customFields[fd.key]}
                          </p>
                        ))}
                      </div>
                    )}
                    {(beforePhotos.length > 0 || afterPhotos.length > 0) && (
                      <div style={{ display: "flex", gap: 16, marginTop: 8, flexWrap: "wrap" }}>
                        {beforePhotos.length > 0 && (
                          <div>
                            <p
                              style={{
                                fontSize: 11,
                                color: "var(--text-muted)",
                                margin: "0 0 4px",
                              }}
                            >
                              Öncesi
                            </p>
                            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                              {beforePhotos.map((a) => (
                                <BeforeAfterPhotoThumb
                                  key={a.id}
                                  attachment={a}
                                  onDelete={onDeleteAttachment}
                                />
                              ))}
                            </div>
                          </div>
                        )}
                        {afterPhotos.length > 0 && (
                          <div>
                            <p
                              style={{
                                fontSize: 11,
                                color: "var(--text-muted)",
                                margin: "0 0 4px",
                              }}
                            >
                              Sonrası
                            </p>
                            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                              {afterPhotos.map((a) => (
                                <BeforeAfterPhotoThumb
                                  key={a.id}
                                  attachment={a}
                                  onDelete={onDeleteAttachment}
                                />
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {wonCustomerDeals.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <p
            style={{
              fontSize: 13,
              fontWeight: 500,
              margin: "0 0 8px",
              display: "flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            Cari Hesap Ekstresi <InfoTip text={cariBakiyeInfoText(sector)} />
          </p>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontSize: 13,
              padding: "4px 0",
            }}
          >
            <span style={{ color: "var(--text-secondary)" }}>Toplam Borç</span>
            <span>{formatTL(totalDebt)}</span>
          </div>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontSize: 13,
              padding: "4px 0",
            }}
          >
            <span style={{ color: "var(--text-secondary)" }}>Toplam Tahsilat</span>
            <span>{formatTL(totalCollected)}</span>
          </div>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontSize: 13,
              padding: "4px 0",
              marginBottom: 8,
            }}
          >
            <span style={{ color: "var(--text-secondary)" }}>Bakiye</span>
            <Badge tone={balance > 0 ? "danger" : "success"}>{formatTL(balance)}</Badge>
          </div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 6,
              maxHeight: 200,
              overflowY: "auto",
            }}
          >
            {ledgerEvents.map((e) => (
              <div
                key={e.id}
                style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5 }}
              >
                <span>
                  <span style={{ color: "var(--text-muted)" }}>{paymentDateLabel(e.date)} ·</span>{" "}
                  {e.kind === "borc" ? "Borç" : "Tahsilat"} · {e.label}
                </span>
                <span
                  style={{
                    color: e.kind === "borc" ? "var(--text-danger)" : "var(--text-success)",
                  }}
                >
                  {e.kind === "borc" ? "+" : "−"}
                  {formatTL(e.amount)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          margin: "0 0 8px",
        }}
      >
        <p style={{ fontSize: 13, fontWeight: 500, margin: 0 }}>İletişim geçmişi</p>
        {onSaveTask && (
          <button
            type="button"
            onClick={() => setShowTaskForm(true)}
            style={{
              fontSize: 12,
              background: "var(--surface-1)",
              border: "0.5px solid var(--border)",
              display: "flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            <i className="ti ti-list-check" style={{ fontSize: 13 }} aria-hidden="true"></i>
            Görev ekle
          </button>
        )}
      </div>
      <form onSubmit={submit} style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
          <select value={type} onChange={(e) => setType(e.target.value)} style={{ width: 160 }}>
            {ACTIVITY_TYPES.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
          <input
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder={
              dealWordKind(sector) === "uyelik"
                ? "Örn. üyelik paketi görüşüldü"
                : dealWordKind(sector) === "randevu"
                  ? "Örn. randevu detayları görüşüldü"
                  : dealWordKind(sector) === "rezervasyon"
                    ? "Örn. rezervasyon detayları görüşüldü"
                    : "Örn. fiyat teklifi görüşüldü"
            }
            style={{ flex: 1 }}
          />
        </div>
        <button
          type="submit"
          disabled={saving || !content.trim()}
          style={{
            background: "var(--fill-accent)",
            color: "var(--on-accent)",
            border: "none",
            fontSize: 13,
          }}
        >
          Ekle
        </button>
      </form>

      {customerActivities.length === 0 ? (
        <p style={{ fontSize: 13, color: "var(--text-muted)" }}>Henüz kayıt yok.</p>
      ) : (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 10,
            maxHeight: 260,
            overflowY: "auto",
          }}
        >
          {customerActivities.map((a) => {
            const typeInfo = ACTIVITY_TYPES.find((t) => t.id === a.type) || ACTIVITY_TYPES[0];
            return (
              <div key={a.id} style={{ display: "flex", gap: 10 }}>
                <i
                  className={`ti ${typeInfo.icon}`}
                  style={{ fontSize: 16, color: "var(--text-accent)", marginTop: 2 }}
                  aria-hidden="true"
                ></i>
                <div>
                  <p style={{ margin: 0, fontSize: 13 }}>{a.content}</p>
                  <p style={{ margin: 0, fontSize: 11, color: "var(--text-muted)" }}>
                    {typeInfo.label} · {activityDateLabel(a.createdAt)}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showTaskForm && (
        <Modal title="Görev ekle" onClose={() => setShowTaskForm(false)}>
          <TaskForm
            customers={[customer]}
            deals={deals}
            teamMembers={teamMembers}
            currentUserId={currentUserId}
            currentUserEmail={currentUserEmail}
            initial={{ customerId: customer.id }}
            onSave={async (t) => {
              await onSaveTask(t);
              setShowTaskForm(false);
            }}
            onCancel={() => setShowTaskForm(false)}
          />
        </Modal>
      )}
    </Modal>
  );
}

export function CampaignModal({
  customers,
  replyTo,
  companyName,
  logoUrl,
  session,
  onRequestConsent,
  onClose,
}) {
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
    ? emailCustomers.filter(
        (c) =>
          (c.name || "").toLowerCase().includes(recipientQueryLower) ||
          (c.email || "").toLowerCase().includes(recipientQueryLower),
      )
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
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
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
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 8,
              marginBottom: 4,
              flexWrap: "wrap",
            }}
          >
            <label style={{ fontSize: 13, color: "var(--text-secondary)" }}>
              Alıcılar ({selected.size}/{consentedCustomers.length} izinli)
            </label>
            <div style={{ display: "flex", gap: 10 }}>
              <button
                type="button"
                onClick={selectAllConsented}
                style={{
                  fontSize: 12,
                  background: "none",
                  border: "none",
                  color: "var(--accent)",
                  cursor: "pointer",
                  padding: 0,
                  textDecoration: "underline",
                }}
              >
                Tümünü seç
              </button>
              <button
                type="button"
                onClick={clearSelection}
                style={{
                  fontSize: 12,
                  background: "none",
                  border: "none",
                  color: "var(--accent)",
                  cursor: "pointer",
                  padding: 0,
                  textDecoration: "underline",
                }}
              >
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
          <div
            style={{
              maxHeight: 180,
              overflowY: "auto",
              border: "0.5px solid var(--border)",
              borderRadius: "var(--radius)",
              padding: 8,
            }}
          >
            {emailCustomers.length === 0 && (
              <p style={{ fontSize: 13, color: "var(--text-muted)", margin: 0 }}>
                E-postası kayıtlı müşteri yok.
              </p>
            )}
            {emailCustomers.length > 0 && visibleCustomers.length === 0 && (
              <p style={{ fontSize: 13, color: "var(--text-muted)", margin: 0 }}>
                Aramayla eşleşen müşteri yok.
              </p>
            )}
            {visibleCustomers.map((c) => (
              <div
                key={c.id}
                style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0" }}
              >
                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    fontSize: 13,
                    flex: 1,
                    cursor: c.marketingConsent ? "pointer" : "default",
                    opacity: c.marketingConsent ? 1 : 0.55,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={selected.has(c.id)}
                    disabled={!c.marketingConsent}
                    onChange={() => toggle(c.id)}
                  />
                  {c.name} <span style={{ color: "var(--text-muted)" }}>({c.email})</span>
                </label>
                {!c.marketingConsent && (
                  <>
                    <span style={{ fontSize: 11, color: "var(--text-warning)" }}>İzin yok</span>
                    <button
                      type="button"
                      onClick={() => onRequestConsent(c)}
                      style={{
                        fontSize: 11,
                        background: "none",
                        border: "0.5px solid var(--border)",
                        borderRadius: "var(--radius)",
                        padding: "1px 6px",
                        cursor: "pointer",
                      }}
                    >
                      İzin iste
                    </button>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
        <div style={{ marginBottom: 12 }}>
          <label
            style={{
              fontSize: 13,
              color: "var(--text-secondary)",
              display: "block",
              marginBottom: 4,
            }}
          >
            Konu
          </label>
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Yeni ürünlerimizi keşfedin"
            style={{ width: "100%" }}
          />
        </div>
        <div style={{ marginBottom: 16 }}>
          <label
            style={{
              fontSize: 13,
              color: "var(--text-secondary)",
              display: "block",
              marginBottom: 4,
            }}
          >
            Mesaj
          </label>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Merhaba, size özel..."
            style={{ width: "100%", minHeight: 100, resize: "vertical" }}
          />
        </div>
        <div
          style={{
            marginBottom: 16,
            background: "var(--bg-warning)",
            borderRadius: "var(--radius)",
            padding: "0.75rem 1rem",
            fontSize: 12.5,
            color: "var(--text-warning)",
          }}
        >
          Türkiye'de ticari elektronik ileti (reklam/pazarlama e-postası) göndermek için alıcıdan
          önceden açık onay alınması İYS (İleti Yönetim Sistemi) kurallarına uyulması yasal bir
          zorunluluktur - bu yüzden sadece pazarlama izni onaylanmış müşteriler seçilebiliyor. İzni
          olmayan bir müşteriye "İzin iste" ile bir onay e-postası gönderebilir, veya Müşteri
          Kazanma Linki/Müşteri Portalı üzerinden otomatik izin toplayabilirsiniz.
        </div>
        {result && (
          <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 12 }}>{result}</p>
        )}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button type="button" onClick={onClose}>
            Kapat
          </button>
          <button
            type="submit"
            disabled={sending || selectedConsented.length === 0}
            style={{ background: "var(--fill-accent)", color: "var(--on-accent)", border: "none" }}
          >
            {sending ? "Gönderiliyor…" : "Gönder"}
          </button>
        </div>
      </form>
      {confirmSend && (
        <ConfirmDialog
          title="Kampanya gönderilsin mi?"
          message={`${selectedConsented.length} kişiye e-posta gönderilecek - bu işlem geri alınamaz.`}
          confirmLabel="Gönder"
          onConfirm={() => {
            setConfirmSend(false);
            send();
          }}
          onClose={() => setConfirmSend(false)}
        />
      )}
    </Modal>
  );
}

function leadScore(lastContact) {
  if (!lastContact) return { label: "Soğuk", tone: "default" };
  const diff = Math.floor((Date.now() - new Date(lastContact).getTime()) / 86400000);
  if (diff <= 7) return { label: "Sıcak", tone: "success" };
  if (diff <= 30) return { label: "Ilık", tone: "warning" };
  return { label: "Soğuk", tone: "default" };
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
  'isterseniz "Linki paylaş"a tıklayıp portal adresini WhatsApp\'tan hatırlatabilirsiniz.';

const MARKETING_CONSENT_INFO_TEXT =
  "Türkiye'de kampanya/değerlendirme isteği gibi e-postalar göndermek için müşterinin gerçek, kendi verdiği " +
  "izni (İYS) gerekiyor - siz adına veremezsiniz.\n\n" +
  "Var - müşteri izin verdi (Müşteri Kazanma Linki, Müşteri Portalı veya e-posta ile çift onaydan).\n" +
  "İzin iste - müşteriye onay linkli bir e-posta gönderir.\n" +
  "İzin linki paylaş - müşterinin e-postası kayıtlı değilse, aynı onay linkini WhatsApp'tan (telefon kayıtlıysa) ya da panoya kopyalayarak paylaşır - müşteri linkten hem e-postasını girip hem izin verebiliyor.";
export function CustomersTab({
  customers,
  filteredCustomers,
  wonDealsAll,
  companySettings,
  customerSearch,
  setCustomerSearch,
  customerFromDate,
  setCustomerFromDate,
  customerToDate,
  setCustomerToDate,
  customerSectorFilter,
  setCustomerSectorFilter,
  customerTypeFilter,
  setCustomerTypeFilter,
  customerConsentFilter,
  setCustomerConsentFilter,
  customerSort,
  setCustomerSort,
  setShowCustomerExport,
  setShowImportCustomers,
  setShowCampaignModal,
  generateLeadCaptureLink,
  setLeadCaptureLink,
  setShowPortalLinkModal,
  setEditingCustomer,
  setShowCustomerForm,
  vipCustomerIds = new Set(),
  setViewingCustomer,
  setConfirmDeleteCustomer,
  totalPaidForDeal,
  requestCustomerConsent,
  notify,
  properties = [],
  showings = [],
  onQuickCall,
}) {
  const isEmlak = companySettings?.sector === "emlak";
  const [roleFilter, setRoleFilter] = useState("all");
  const [callFor, setCallFor] = useState(null);
  // Emlak listesi: rol, ne aradığı, gösterim ve uyan portföy sayısı - Portal /
  // Bakiye sütunları emlakçının günlük işine yaramıyor.
  const emlakInfo = useMemo(() => {
    if (!isEmlak) return null;
    const owned = new Map();
    for (const p of properties) {
      if (!p.ownerCustomerId) continue;
      owned.set(p.ownerCustomerId, [...(owned.get(p.ownerCustomerId) || []), p]);
    }
    const shows = new Map();
    for (const s of showings) shows.set(s.customerId, (shows.get(s.customerId) || 0) + 1);
    const matches = new Map();
    const pool = customers.map((c) => ({ ...c, phone: c.phone || "-" }));
    for (const p of properties) {
      if (!["aktif", "opsiyonlu"].includes(p.status)) continue;
      for (const m of matchEmlakListing(propertyAsListingDeal(p, { forMatching: true }), pool)) {
        const id = m.customer.id;
        if (id === p.ownerCustomerId) continue;
        matches.set(id, (matches.get(id) || 0) + 1);
      }
    }
    return { owned, shows, matches };
  }, [isEmlak, properties, showings, customers]);
  const rolesOf = (c) => customerRoles(c, emlakInfo?.owned.get(c.id) || []);
  const shownCustomers =
    isEmlak && roleFilter !== "all"
      ? filteredCustomers.filter((c) => rolesOf(c).some((r) => r.id === roleFilter))
      : filteredCustomers;
  return (
    <div>
      <div
        className="list-toolbar"
        style={{
          display: "flex",
          justifyContent: "flex-end",
          marginBottom: 12,
          gap: 8,
          flexWrap: "wrap",
        }}
      >
        <button
          onClick={() => setShowCustomerExport(true)}
          disabled={filteredCustomers.length === 0}
          style={{
            background: "var(--surface-1)",
            border: "0.5px solid var(--border)",
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <i className="ti ti-download" style={{ fontSize: 16 }} aria-hidden="true"></i>
          Dışa aktar
        </button>
        <button
          onClick={() => setShowImportCustomers(true)}
          style={{
            background: "var(--surface-1)",
            border: "0.5px solid var(--border)",
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <i className="ti ti-upload" style={{ fontSize: 16 }} aria-hidden="true"></i>
          İçe aktar
        </button>
        <button
          onClick={() => setShowCampaignModal(true)}
          disabled={customers.filter((c) => c.email).length === 0}
          style={{
            background: "var(--surface-1)",
            border: "0.5px solid var(--border)",
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <i className="ti ti-mail-forward" style={{ fontSize: 16 }} aria-hidden="true"></i>
          Kampanya gönder
        </button>
        <button
          onClick={async () => {
            const link = await generateLeadCaptureLink();
            if (link) setLeadCaptureLink(link);
          }}
          style={{
            background: "var(--surface-1)",
            border: "0.5px solid var(--border)",
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <i className="ti ti-qrcode" style={{ fontSize: 16 }} aria-hidden="true"></i>
          Müşteri Kazanma Linki
        </button>
        <button
          onClick={() => setShowPortalLinkModal(true)}
          style={{
            background: "var(--surface-1)",
            border: "0.5px solid var(--border)",
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <i className="ti ti-users-group" style={{ fontSize: 16 }} aria-hidden="true"></i>
          Müşteri Portalı Linki
        </button>
        <button
          onClick={() => {
            setEditingCustomer(null);
            setShowCustomerForm(true);
          }}
          style={{
            background: "var(--fill-accent)",
            color: "var(--on-accent)",
            border: "none",
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <i className="ti ti-plus" style={{ fontSize: 16 }} aria-hidden="true"></i>
          Müşteri ekle
        </button>
      </div>

      <div
        className="list-toolbar"
        style={{ display: "flex", marginBottom: 12, gap: 8, flexWrap: "wrap" }}
      >
        <input
          value={customerSearch}
          onChange={(e) => setCustomerSearch(e.target.value)}
          placeholder="Müşteri ara (ad, sektör, bölge, telefon, e-posta)..."
          style={{ flex: 1, minWidth: 200 }}
        />
        {isEmlak ? (
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            style={{ fontSize: 13 }}
            aria-label="Rol"
          >
            <option value="all">Tüm müşteriler</option>
            {CUSTOMER_ROLES.map((r) => (
              <option key={r.id} value={r.id}>
                {r.label}
              </option>
            ))}
          </select>
        ) : (
          <select
            value={customerTypeFilter}
            onChange={(e) => setCustomerTypeFilter(e.target.value)}
            style={{ fontSize: 13 }}
          >
            <option value="all">Tüm müşteriler</option>
            <option value="kurumsal">Kurumsal</option>
            <option value="bireysel">Bireysel</option>
          </select>
        )}
        {/* Emlakçının müşterisi alıcı/kiracı/mal sahibi - tekstil/otomotiv gibi
            B2B sektör filtresi orada anlamsız (emlak tarama turu). */}
        {companySettings?.sector !== "emlak" && (
          <select
            value={customerSectorFilter}
            onChange={(e) => setCustomerSectorFilter(e.target.value)}
            style={{ fontSize: 13 }}
          >
            <option value="all">Tüm sektörler</option>
            {SECTORS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        )}
        <select
          value={customerConsentFilter}
          onChange={(e) => setCustomerConsentFilter(e.target.value)}
          style={{ fontSize: 13 }}
        >
          <option value="all">Pazarlama izni: hepsi</option>
          <option value="verildi">İzin verildi</option>
          <option value="verilmedi">İzin verilmedi</option>
        </select>
        <select
          value={customerSort}
          onChange={(e) => setCustomerSort(e.target.value)}
          style={{ fontSize: 13 }}
        >
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

      {shownCustomers.length === 0 ? (
        customers.length === 0 ? (
          <div
            style={{
              background: "var(--surface-1)",
              borderRadius: 12,
              padding: "2rem 1.5rem",
              textAlign: "center",
            }}
          >
            <p style={{ fontWeight: 500, margin: "0 0 4px" }}>Henüz müşteri eklenmedi</p>
            <p style={{ fontSize: 14, color: "var(--text-secondary)", margin: "0 0 16px" }}>
              Başlamak için ilk müşterinizi ekleyin.
            </p>
            <button
              onClick={() => {
                setEditingCustomer(null);
                setShowCustomerForm(true);
              }}
              style={{
                background: "var(--fill-accent)",
                color: "var(--on-accent)",
                border: "none",
              }}
            >
              + Müşteri ekle
            </button>
          </div>
        ) : (
          <p style={{ fontSize: 14, color: "var(--text-secondary)" }}>
            Aramayla eşleşen müşteri yok.
          </p>
        )
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table
            className="responsive-table"
            style={{
              width: "100%",
              minWidth: 640,
              borderCollapse: "separate",
              borderSpacing: "0 8px",
            }}
          >
            <thead>
              <tr>
                <th
                  style={{
                    textAlign: "left",
                    padding: "0 12px",
                    fontSize: 11,
                    fontWeight: 600,
                    color: "var(--text-muted)",
                    textTransform: "uppercase",
                    letterSpacing: 0.3,
                  }}
                >
                  Müşteri
                </th>
                {isEmlak && (
                  <>
                    <th
                      style={{
                        textAlign: "left",
                        padding: "0 12px",
                        fontSize: 11,
                        fontWeight: 600,
                        color: "var(--text-muted)",
                        textTransform: "uppercase",
                        letterSpacing: 0.3,
                        whiteSpace: "nowrap",
                      }}
                    >
                      Rol
                    </th>
                    <th
                      style={{
                        textAlign: "left",
                        padding: "0 12px",
                        fontSize: 11,
                        fontWeight: 600,
                        color: "var(--text-muted)",
                        textTransform: "uppercase",
                        letterSpacing: 0.3,
                        whiteSpace: "nowrap",
                      }}
                    >
                      Aradığı
                    </th>
                  </>
                )}
                <th
                  style={{
                    textAlign: "left",
                    padding: "0 12px",
                    fontSize: 11,
                    fontWeight: 600,
                    color: "var(--text-muted)",
                    textTransform: "uppercase",
                    letterSpacing: 0.3,
                    whiteSpace: "nowrap",
                  }}
                >
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                    İlgi durumu <InfoTip text={LEAD_INFO_TEXT} />
                  </span>
                </th>
                <th
                  style={{
                    textAlign: "left",
                    padding: "0 12px",
                    fontSize: 11,
                    fontWeight: 600,
                    color: "var(--text-muted)",
                    textTransform: "uppercase",
                    letterSpacing: 0.3,
                    whiteSpace: "nowrap",
                  }}
                >
                  Son temas
                </th>
                <th
                  style={{
                    textAlign: "left",
                    padding: "0 12px",
                    fontSize: 11,
                    fontWeight: 600,
                    color: "var(--text-muted)",
                    textTransform: "uppercase",
                    letterSpacing: 0.3,
                    whiteSpace: "nowrap",
                  }}
                >
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                    {isEmlak ? (
                      "Gösterim"
                    ) : (
                      <>
                        Portal <InfoTip text={PORTAL_INFO_TEXT} />
                      </>
                    )}
                  </span>
                </th>
                <th
                  style={{
                    textAlign: "left",
                    padding: "0 12px",
                    fontSize: 11,
                    fontWeight: 600,
                    color: "var(--text-muted)",
                    textTransform: "uppercase",
                    letterSpacing: 0.3,
                    whiteSpace: "nowrap",
                  }}
                >
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                    İzin <InfoTip text={MARKETING_CONSENT_INFO_TEXT} />
                  </span>
                </th>
                <th
                  style={{
                    textAlign: "left",
                    padding: "0 12px",
                    fontSize: 11,
                    fontWeight: 600,
                    color: "var(--text-muted)",
                    textTransform: "uppercase",
                    letterSpacing: 0.3,
                    whiteSpace: "nowrap",
                  }}
                >
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                    {isEmlak ? (
                      <>
                        Uyan portföy{" "}
                        <InfoTip text="Aktif/opsiyonlu portföylerinizden müşterinin talebine (bölge, bütçe, oda, tip) uyanların sayısı. Müşteriyi açınca listesi ve WhatsApp'tan gönderme var." />
                      </>
                    ) : (
                      <>
                        Bakiye <InfoTip text={cariBakiyeInfoText(companySettings?.sector)} />
                      </>
                    )}
                  </span>
                </th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {shownCustomers.map((c) => {
                const roles = isEmlak ? rolesOf(c) : [];
                const seeking = isEmlak ? customerSeekingSummary(c) : "";
                const customerBalance = wonDealsAll
                  .filter((d) => d.customerId === c.id)
                  .reduce((sum, d) => sum + (d.value || 0) - totalPaidForDeal(d.id), 0);
                return (
                  <tr
                    key={c.id}
                    style={{ background: "var(--surface-1)", boxShadow: "var(--shadow-sm)" }}
                  >
                    <td
                      data-label="Müşteri"
                      onClick={() => setViewingCustomer(c)}
                      style={{
                        padding: "10px 12px",
                        borderRadius: "var(--radius-lg) 0 0 var(--radius-lg)",
                        cursor: "pointer",
                      }}
                    >
                      <p style={{ margin: 0, fontWeight: 500, fontSize: 14 }}>
                        {vipCustomerIds.has(c.id) && (
                          <span title="VIP müşteri - ömür boyu tahsilata göre en değerli %10 arasında">
                            ⭐{" "}
                          </span>
                        )}
                        {c.name}
                      </p>
                      <p style={{ margin: 0, fontSize: 12, color: "var(--text-secondary)" }}>
                        {[isEmlak ? "" : c.sector, c.region, c.phone].filter(Boolean).join(" · ")}
                      </p>
                      {c.tags?.length > 0 && (
                        <div style={{ marginTop: 4 }}>
                          <TagBadges tags={c.tags} />
                        </div>
                      )}
                    </td>
                    {isEmlak && (
                      <>
                        <td data-label="Rol" style={{ padding: "10px 12px" }}>
                          {roles.length ? (
                            <span style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                              {roles.map((r) => (
                                <Badge key={r.id} tone="default">
                                  {r.label}
                                </Badge>
                              ))}
                            </span>
                          ) : (
                            <span style={{ fontSize: 12, color: "var(--text-muted)" }}>-</span>
                          )}
                        </td>
                        <td data-label="Aradığı" style={{ padding: "10px 12px", fontSize: 12.5 }}>
                          {seeking || <span style={{ color: "var(--text-muted)" }}>-</span>}
                        </td>
                      </>
                    )}
                    <td
                      data-label="İlgi durumu"
                      style={{ padding: "10px 12px", whiteSpace: "nowrap" }}
                    >
                      <Badge tone={leadScore(c.lastContact).tone}>
                        {leadScore(c.lastContact).label}
                      </Badge>
                    </td>
                    <td
                      data-label="Son temas"
                      style={{ padding: "10px 12px", whiteSpace: "nowrap" }}
                    >
                      <Badge tone={daysAgo(c.lastContact) === "Bugün" ? "success" : "default"}>
                        {daysAgo(c.lastContact) || "Temas yok"}
                      </Badge>
                    </td>
                    <td
                      data-label={isEmlak ? "Gösterim" : "Portal"}
                      style={{ padding: "10px 12px", whiteSpace: "nowrap" }}
                    >
                      {isEmlak ? (
                        <span style={{ fontSize: 13 }}>{emlakInfo.shows.get(c.id) || "-"}</span>
                      ) : c.portalUserId ? (
                        <Badge tone="accent">Var</Badge>
                      ) : (
                        <button
                          type="button"
                          title="Müşteriye portal linkini paylaş"
                          onClick={() => {
                            // ?c= -> müşteri portal linkini açınca giriş ekranında
                            // işletmenin adı/logosu görünür (bkz. CustomerPortal.jsx).
                            const scope =
                              companySettings?.showcaseSlug || companySettings?.leadCaptureToken;
                            const portalLink = getPortalUrl(scope ? `/?c=${scope}` : "");
                            const message = `Merhaba, ${companySettings?.companyName || "işletmemiz"} Müşteri Portalımızdan taleplerinizi/randevularınızı bu kayıtlı e-postanızla takip edebilirsiniz: ${portalLink}`;
                            if (c.phone) {
                              window.open(
                                `https://wa.me/${toWhatsAppNumber(c.phone)}?text=${encodeURIComponent(message)}`,
                                "_blank",
                                "noopener,noreferrer",
                              );
                            } else {
                              navigator.clipboard.writeText(portalLink);
                              notify("Portal linki kopyalandı.", "success");
                            }
                          }}
                          style={{
                            fontSize: 12,
                            color: "var(--accent)",
                            background: "none",
                            border: "none",
                            cursor: "pointer",
                            padding: 0,
                            textDecoration: "underline",
                          }}
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
                          title={
                            c.email
                              ? "İzin e-postası gönder"
                              : "İzin linkini WhatsApp/kopyala ile paylaş"
                          }
                          onClick={() => requestCustomerConsent(c)}
                          style={{
                            fontSize: 12,
                            color: "var(--accent)",
                            background: "none",
                            border: "none",
                            cursor: "pointer",
                            padding: 0,
                            textDecoration: "underline",
                          }}
                        >
                          {c.email ? "İzin iste" : "İzin linki paylaş"}
                        </button>
                      )}
                    </td>
                    <td
                      data-label={isEmlak ? "Uyan portföy" : "Bakiye"}
                      style={{ padding: "10px 12px", whiteSpace: "nowrap" }}
                    >
                      {isEmlak ? (
                        emlakInfo.matches.get(c.id) ? (
                          <button
                            type="button"
                            onClick={() => setViewingCustomer(c)}
                            title="Uyan portföyleri gör"
                            style={{ fontSize: 12, padding: "2px 8px" }}
                          >
                            {emlakInfo.matches.get(c.id)} portföy
                          </button>
                        ) : (
                          <span style={{ fontSize: 12, color: "var(--text-muted)" }}>-</span>
                        )
                      ) : customerBalance > 0 ? (
                        <Badge tone="warning">{formatTL(customerBalance)}</Badge>
                      ) : (
                        <span style={{ fontSize: 12, color: "var(--text-muted)" }}>-</span>
                      )}
                    </td>
                    <td
                      style={{
                        padding: "10px 12px",
                        borderRadius: "0 var(--radius-lg) var(--radius-lg) 0",
                      }}
                    >
                      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                        {isEmlak && onQuickCall && (
                          <IconButton
                            icon="ti-phone-check"
                            title="Arama kaydı: görüştüm / ulaşılamadı + tekrar ara"
                            onClick={() => setCallFor(c)}
                          />
                        )}
                        {c.phone && (
                          <a
                            href={`https://wa.me/${toWhatsAppNumber(c.phone)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            title="WhatsApp'tan yaz"
                            style={{
                              width: 32,
                              height: 32,
                              padding: 0,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              border: "0.5px solid var(--border)",
                              borderRadius: "var(--radius)",
                              background: "var(--surface-1)",
                              textDecoration: "none",
                            }}
                          >
                            <WhatsAppIcon />
                          </a>
                        )}
                        <IconButton
                          icon="ti-history"
                          title="Detay ve iletişim geçmişi"
                          onClick={() => setViewingCustomer(c)}
                        />
                        <IconButton
                          icon="ti-edit"
                          title="Düzenle"
                          onClick={() => {
                            setEditingCustomer(c);
                            setShowCustomerForm(true);
                          }}
                        />
                        <IconButton
                          icon="ti-trash"
                          title="Sil"
                          onClick={() => setConfirmDeleteCustomer(c)}
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
      {callFor && (
        <QuickCallModal
          customer={callFor}
          onClose={() => setCallFor(null)}
          onSave={async (entry) => {
            const ok = await onQuickCall(callFor, entry);
            if (ok !== false) setCallFor(null);
          }}
        />
      )}
    </div>
  );
}

// Emlakta iş telefonla yürür: arama sonucu tek tıkla geçmişe yazılır, istenirse
// "tekrar ara" görevi açılır - not yazmaya üşenilen aramalar da kayda geçsin.
const CALL_OUTCOMES = [
  { id: "gorustum", label: "Görüştüm", type: "call" },
  { id: "ulasilamadi", label: "Ulaşılamadı", type: "call" },
  { id: "whatsapp", label: "WhatsApp'tan yazdım", type: "note" },
];
const FOLLOW_UPS = [
  { days: 0, label: "Tekrar arama yok" },
  { days: 1, label: "Yarın tekrar ara" },
  { days: 3, label: "3 gün sonra ara" },
  { days: 7, label: "1 hafta sonra ara" },
  { days: 30, label: "1 ay sonra ara" },
];

function QuickCallModal({ customer, onClose, onSave }) {
  const [outcome, setOutcome] = useState("gorustum");
  const [followDays, setFollowDays] = useState(0);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (outcome === "ulasilamadi" && followDays === 0) setFollowDays(1);
    // sadece sonuç değişince öneri
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [outcome]);
  return (
    <Modal title={`Arama kaydı - ${customer.name}`} onClose={onClose}>
      {customer.phone && (
        <p style={{ fontSize: 13, margin: "0 0 10px" }}>
          <a href={`tel:${customer.phone.replace(/\s/g, "")}`}>
            <i className="ti ti-phone" aria-hidden="true" /> {customer.phone}
          </a>
        </p>
      )}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
        {CALL_OUTCOMES.map((o) => (
          <button
            key={o.id}
            type="button"
            aria-pressed={outcome === o.id}
            onClick={() => setOutcome(o.id)}
            style={
              outcome === o.id
                ? { background: "var(--fill-accent)", color: "var(--on-accent)", border: "none" }
                : undefined
            }
          >
            {o.label}
          </button>
        ))}
      </div>
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Kısa not (opsiyonel) - ör. bütçe 9M'ye çıkabilir, eşiyle konuşacak"
        style={{ width: "100%", minHeight: 60, resize: "vertical", marginBottom: 10 }}
      />
      <select
        value={followDays}
        onChange={(e) => setFollowDays(Number(e.target.value))}
        style={{ width: "100%", marginBottom: 12 }}
      >
        {FOLLOW_UPS.map((f) => (
          <option key={f.days} value={f.days}>
            {f.label}
          </option>
        ))}
      </select>
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button type="button" onClick={onClose}>
          Vazgeç
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={async () => {
            setSaving(true);
            const o = CALL_OUTCOMES.find((x) => x.id === outcome);
            await onSave({ outcome: o, note: note.trim(), followDays });
            setSaving(false);
          }}
          style={{ background: "var(--fill-accent)", color: "var(--on-accent)", border: "none" }}
        >
          {saving ? "Kaydediliyor…" : "Kaydet"}
        </button>
      </div>
    </Modal>
  );
}
