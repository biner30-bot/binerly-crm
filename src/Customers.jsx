import { useState } from "react";
import {
  Modal,
  InfoTip,
  ConfirmDialog,
  Badge,
  formatTL,
  uid,
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
} from "./shared";
import {
  CustomFieldsSection,
  dealWordKind,
  stageLabel,
  isAppointmentSector,
  TagBadges,
} from "./Sectors";
import { paymentDateLabel, TAGS_INFO_TEXT } from "./Deals";

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
  onSave,
  onCancel,
}) {
  const initialIsCustomSector = initial?.sector && !SECTORS.includes(initial.sector);
  const [customerType, setCustomerType] = useState(
    initial?.customerType || preferredCustomerType || "kurumsal",
  );
  const [name, setName] = useState(initial?.name || "");
  const [sector, setSector] = useState(
    initialIsCustomSector ? "Diğer" : initial?.sector || SECTORS[0],
  );
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
  const defsForEntity = customFieldDefs.filter(
    (d) => d.entity === "customer" && (!d.audience || d.audience === customerType),
  );

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
          setFormError(
            `"${duplicateWith.name}" adlı müşteride aynı e-posta veya telefon zaten kayıtlı - aynı telefon/e-posta ile ikinci bir müşteri eklenemez.`,
          );
          return;
        }
        setFormError("");
        onSave(payload);
      }}
    >
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
      <div style={{ marginBottom: 12 }}>
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
      <div style={{ display: "flex", gap: 12, marginBottom: 12 }}>
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
      <div style={{ display: "flex", gap: 12, marginBottom: 12 }}>
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
            <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-warning)" }}>
              (önemli)
            </span>{" "}
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
      <div style={{ marginBottom: 12 }}>
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
      <div style={{ marginBottom: 16 }}>
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
      <CustomFieldsSection defs={defsForEntity} values={customFields} onChange={setCustomFields} />
      {formError && (
        <p style={{ fontSize: 12.5, color: "var(--text-danger)", margin: "0 0 8px" }}>
          {formError}
        </p>
      )}
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button type="button" onClick={onCancel}>
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

function activityDateLabel(dateStr) {
  const d = new Date(dateStr);
  return (
    d.toLocaleDateString("tr-TR", { day: "numeric", month: "short", year: "numeric" }) +
    " · " +
    d.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })
  );
}

export function CustomerDetail({
  customer,
  deals,
  payments,
  activities,
  sector,
  customFieldDefs = [],
  groupClasses = [],
  groupClassEnrollments = [],
  attachments = [],
  onUploadAttachment,
  onDownloadAttachment,
  onDeleteAttachment,
  onAddActivity,
  onRequestConsent,
  onClose,
}) {
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
            {customer.sector} {customer.region ? `· ${customer.region}` : ""}{" "}
            {customer.phone ? `· ${customer.phone}` : ""}{" "}
            {customer.email ? `· ${customer.email}` : ""}
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
                  {formatTL(d.value)}
                </span>
              </div>
            );
          })}
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

      <p style={{ fontSize: 13, fontWeight: 500, margin: "0 0 8px" }}>İletişim geçmişi</p>
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
            disabled={sending || selected.size === 0}
            style={{ background: "var(--fill-accent)", color: "var(--on-accent)", border: "none" }}
          >
            {sending ? "Gönderiliyor…" : "Gönder"}
          </button>
        </div>
      </form>
      {confirmSend && (
        <ConfirmDialog
          title="Kampanya gönderilsin mi?"
          message={`${selected.size} kişiye e-posta gönderilecek - bu işlem geri alınamaz.`}
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
  setViewingCustomer,
  setConfirmDeleteCustomer,
  totalPaidForDeal,
  requestCustomerConsent,
  notify,
}) {
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
        <select
          value={customerTypeFilter}
          onChange={(e) => setCustomerTypeFilter(e.target.value)}
          style={{ fontSize: 13 }}
        >
          <option value="all">Tüm müşteriler</option>
          <option value="kurumsal">Kurumsal</option>
          <option value="bireysel">Bireysel</option>
        </select>
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

      {filteredCustomers.length === 0 ? (
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
                    Portal <InfoTip text={PORTAL_INFO_TEXT} />
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
                    Bakiye <InfoTip text={cariBakiyeInfoText(companySettings?.sector)} />
                  </span>
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
                    <td
                      data-label="Müşteri"
                      onClick={() => setViewingCustomer(c)}
                      style={{
                        padding: "10px 12px",
                        borderRadius: "var(--radius) 0 0 var(--radius)",
                        cursor: "pointer",
                      }}
                    >
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
                              window.open(
                                `https://wa.me/${toWhatsAppNumber(c.phone)}?text=${encodeURIComponent(message)}`,
                                "_blank",
                                "noopener,noreferrer",
                              );
                            } else {
                              navigator.clipboard.writeText(getPortalUrl());
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
                    <td data-label="Bakiye" style={{ padding: "10px 12px", whiteSpace: "nowrap" }}>
                      {customerBalance > 0 ? (
                        <Badge tone="warning">{formatTL(customerBalance)}</Badge>
                      ) : (
                        <span style={{ fontSize: 12, color: "var(--text-muted)" }}>-</span>
                      )}
                    </td>
                    <td
                      style={{
                        padding: "10px 12px",
                        borderRadius: "0 var(--radius) var(--radius) 0",
                      }}
                    >
                      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
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
    </div>
  );
}
