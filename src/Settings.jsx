import { useState } from "react";
import { supabase } from "./supabase";
import {
  Modal,
  InfoTip,
  ConfirmDialog,
  translateAuthError,
  InitialsAvatar,
  SegmentedControl,
  THEME_OPTIONS,
} from "./shared";
import { SECTOR_PRESETS, STAGES, stageLabel, dealWordKind } from "./Sectors";
import { DEAL_WORD_FORMS } from "./staticData";
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
export function SectorPicker({ companySettings, onSave, onFetchFields }) {
  const currentSector = companySettings?.sector || "";
  const [pendingSector, setPendingSector] = useState(currentSector);
  const [confirmSwitch, setConfirmSwitch] = useState(false);
  const dirty = pendingSector !== currentSector;
  const currentLabel = SECTOR_PRESETS.find((p) => p.id === currentSector)?.label || currentSector;

  return (
    <div style={{ marginBottom: 8 }}>
      <label
        style={{ fontSize: 13, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}
      >
        Sektör
      </label>
      <select
        value={pendingSector}
        onChange={(e) => setPendingSector(e.target.value)}
        style={{ width: "100%" }}
      >
        <option value="">Seçilmedi</option>
        {SECTOR_PRESETS.map((p) => (
          <option key={p.id} value={p.id}>
            {p.label}
          </option>
        ))}
      </select>
      <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "4px 0 0" }}>
        Seçtikten sonra "Kaydet"e basınca aşama isimlerini, önerilen etiketleri ve özel alanları
        günceller.
      </p>
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
          style={{
            fontSize: 13,
            marginTop: 8,
            display: "block",
            background: "var(--fill-accent)",
            color: "var(--on-accent)",
            border: "none",
          }}
        >
          Kaydet
        </button>
      )}
      {confirmSwitch && (
        <ConfirmDialog
          title="Sektörü değiştir"
          message={`"${currentLabel}" sektörüne özel alanlar (form/kayıtlardan) gizlenecek - silinmeyecek, tekrar bu sektöre dönerseniz otomatik geri gelirler. Yeni sektörün kendi alanları/aşama isimleri uygulanacak. Devam edilsin mi?`}
          onConfirm={() => {
            setConfirmSwitch(false);
            onSave(pendingSector);
          }}
          onClose={() => setConfirmSwitch(false)}
        />
      )}
    </div>
  );
}

export function CompanySettingsForm({
  initial,
  customFieldDefs = [],
  onSave,
  onCancel,
  activeTeamId,
  notify,
}) {
  const hasDatetimeField = customFieldDefs.some(
    (d) => d.entity === "deal" && d.type === "datetime" && d.active,
  );
  const [companyName, setCompanyName] = useState(initial?.companyName || "");
  const [address, setAddress] = useState(initial?.address || "");
  const [phone, setPhone] = useState(initial?.phone || "");
  const [email, setEmail] = useState(initial?.email || "");
  const [taxNumber, setTaxNumber] = useState(initial?.taxNumber || "");
  const [logoUrl, setLogoUrl] = useState(initial?.logoUrl || "");
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [defaultKdvRate, setDefaultKdvRate] = useState(initial?.defaultKdvRate ?? 20);
  const [customerNotificationsEnabled, setCustomerNotificationsEnabled] = useState(
    initial?.customerNotificationsEnabled === true,
  );
  const [appointmentRemindersEnabled, setAppointmentRemindersEnabled] = useState(
    initial?.appointmentRemindersEnabled !== false,
  );
  const [googleReviewLink, setGoogleReviewLink] = useState(initial?.googleReviewLink || "");
  const [googleReviewRequestsEnabled, setGoogleReviewRequestsEnabled] = useState(
    initial?.googleReviewRequestsEnabled !== false,
  );
  const [winbackEnabled, setWinbackEnabled] = useState(initial?.winbackEnabled === true);
  const [winbackInactiveDays, setWinbackInactiveDays] = useState(
    initial?.winbackInactiveDays ?? 60,
  );

  const handleLogoFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      notify("Sadece resim dosyası yükleyebilirsiniz.");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      notify("Logo dosyası en fazla 2 MB olabilir.");
      return;
    }
    setUploadingLogo(true);
    const ext = file.name.split(".").pop();
    const path = `${activeTeamId}/logo-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("logos").upload(path, file, { upsert: true });
    setUploadingLogo(false);
    if (error) {
      notify(`Logo yüklenemedi: ${error.message}`);
      return;
    }
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
        <label
          style={{
            fontSize: 13,
            color: "var(--text-secondary)",
            display: "block",
            marginBottom: 4,
          }}
        >
          İşletme adı
        </label>
        <input
          value={companyName}
          onChange={(e) => setCompanyName(e.target.value)}
          placeholder={COMPANY_NAME_EXAMPLES[initial?.sector] || "Akın Diş Kliniği"}
          style={{ width: "100%" }}
        />
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
          Adres
        </label>
        <textarea
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="Firma adresi"
          style={{ width: "100%", minHeight: 60, resize: "vertical" }}
        />
      </div>
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
              display: "block",
              marginBottom: 4,
            }}
          >
            E-posta
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="info@firma.com"
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
          Vergi no
        </label>
        <input
          value={taxNumber}
          onChange={(e) => setTaxNumber(e.target.value)}
          placeholder="1234567890"
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
          Logo
        </label>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          {logoUrl && (
            <img
              src={logoUrl}
              alt="Logo"
              style={{
                height: 44,
                borderRadius: 6,
                objectFit: "contain",
                background: "var(--surface-1)",
                padding: 4,
              }}
            />
          )}
          <label
            style={{
              background: "var(--surface-1)",
              border: "0.5px solid var(--border)",
              borderRadius: "var(--radius)",
              padding: "8px 14px",
              fontSize: 13,
              cursor: uploadingLogo ? "default" : "pointer",
            }}
          >
            {uploadingLogo ? "Yükleniyor…" : logoUrl ? "Logoyu değiştir" : "Logo yükle"}
            <input
              type="file"
              accept="image/*"
              onChange={handleLogoFile}
              disabled={uploadingLogo}
              style={{ display: "none" }}
            />
          </label>
          {logoUrl && !uploadingLogo && (
            <button
              type="button"
              onClick={() => setLogoUrl("")}
              style={{
                background: "none",
                border: "none",
                color: "var(--text-danger)",
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              Kaldır
            </button>
          )}
        </div>
        <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "4px 0 0" }}>
          PNG, JPG veya SVG - en fazla 2 MB. Teklif çıktısında ve müşterinin gördüğü sayfalarda
          görünür.
        </p>
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
          Varsayılan KDV oranı
        </label>
        <select
          value={defaultKdvRate}
          onChange={(e) => setDefaultKdvRate(Number(e.target.value))}
          style={{ width: "100%" }}
        >
          <option value={20}>%20</option>
          <option value={10}>%10</option>
          <option value={1}>%1</option>
          <option value={0}>%0</option>
        </select>
        <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "4px 0 0" }}>
          Yeni tekliflerde bu oran varsayılan gelir, her teklifte isterseniz değiştirebilirsiniz.
        </p>
      </div>
      <div style={{ marginBottom: 16 }}>
        <label
          style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}
        >
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
          <label
            style={{
              fontSize: 13,
              display: "flex",
              alignItems: "center",
              gap: 8,
              cursor: "pointer",
            }}
          >
            <input
              type="checkbox"
              checked={appointmentRemindersEnabled}
              onChange={(e) => setAppointmentRemindersEnabled(e.target.checked)}
            />
            Randevu hatırlatma e-postası gönder
            <InfoTip
              align="right"
              text="Tarih & Saat tipindeki özel alanı olan kayıtlarda, o saatten 2 saat önce müşteriye otomatik bir hatırlatma e-postası gider. Bu kutuyu kapatırsanız hiçbir hatırlatma e-postası gönderilmez - diğer bildirimler (aşama değişikliği, destek talebi, ödeme) bundan etkilenmez."
            />
          </label>
        </div>
      )}
      <div style={{ marginBottom: 12 }}>
        <label
          style={{
            fontSize: 13,
            color: "var(--text-secondary)",
            display: "flex",
            alignItems: "center",
            gap: 6,
            marginBottom: 4,
          }}
        >
          Google değerlendirme linki
          <InfoTip
            align="right"
            text="Google İşletme Profilinizde 'Değerlendirme iste' seçeneğinden aldığınız bağlantıyı buraya yapıştırın. Bu link doluysa ve aşağıdaki seçenek açıksa, tamamlanan her kayıttan bir gün sonra müşteriye bir e-posta gider - ama müşteri doğrudan bu linke değil, önce kısa bir 'deneyiminiz nasıldı' sorusuna yönlendirilir. Memnunsa buraya, değilse geri bildirimi sadece size gelir - herkese açık Google'a gitmez."
          />
        </label>
        <input
          value={googleReviewLink}
          onChange={(e) => setGoogleReviewLink(e.target.value)}
          placeholder="https://g.page/r/xxxxxxxxxxxx/review"
          style={{ width: "100%" }}
        />
      </div>
      {googleReviewLink.trim() && (
        <div style={{ marginBottom: 16 }}>
          <label
            style={{
              fontSize: 13,
              display: "flex",
              alignItems: "center",
              gap: 8,
              cursor: "pointer",
            }}
          >
            <input
              type="checkbox"
              checked={googleReviewRequestsEnabled}
              onChange={(e) => setGoogleReviewRequestsEnabled(e.target.checked)}
            />
            Tamamlanan {DEAL_WORD_FORMS[dealWordKind(initial?.sector)].bare} sonrası müşteriden
            Google değerlendirmesi iste
          </label>
          <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "4px 0 0 26px" }}>
            Ertesi gün otomatik gönderilir. İptal edilen veya gelinmeyen kayıtlar için asla
            gönderilmez. Türkiye'de ticari elektronik ileti göndermek için İYS/açık onay yasal bir
            zorunluluktur - bu yüzden sadece pazarlama izni onaylanmış müşterilere gönderilir, izni
            olmayanlara otomatik olarak hiç gitmez. İzin, Müşteri Kayıtları'ndan (İzin e-postası
            gönder), Müşteri Kazanma Linki'nden veya Müşteri Portalı'ndan alınabilir.
          </p>
        </div>
      )}
      <div style={{ marginBottom: 16 }}>
        <label
          style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}
        >
          <input
            type="checkbox"
            checked={winbackEnabled}
            onChange={(e) => setWinbackEnabled(e.target.checked)}
          />
          Uzun süredir gelmeyen müşterilere otomatik "sizi özledik" e-postası gönder
          <InfoTip
            align="right"
            text="Varsayılan kapalı. Açarsanız, aşağıda belirlediğiniz gün sayısı kadar süredir kendisiyle hiç temas kurulmamış (not eklenmemiş) müşterilere günde bir kontrol edilerek otomatik bir hatırlatma e-postası gider - Randevu Alma Linki'niz varsa tek tıkla yeniden randevu alma bağlantısıyla birlikte. Aynı müşteriye, o tekrar temas kurana kadar ikinci kez gönderilmez. Sadece pazarlama izni verilmiş müşterilere gider (Google değerlendirme isteğiyle aynı yasal kural)."
          />
        </label>
        {winbackEnabled && (
          <div style={{ marginTop: 8, marginLeft: 26 }}>
            <label
              style={{
                fontSize: 12,
                color: "var(--text-secondary)",
                display: "block",
                marginBottom: 4,
              }}
            >
              Kaç gündür temas kurulmadıysa
            </label>
            <input
              type="number"
              min="1"
              value={winbackInactiveDays}
              onChange={(e) => setWinbackInactiveDays(e.target.value)}
              style={{ width: 100 }}
            />
          </div>
        )}
      </div>
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

const PAYTR_NOTIFICATION_URL = "https://binerly.com/api/deal-approval?action=paytr-callback";
const INSTALLMENT_TIERS = [1, 2, 3, 6, 9, 12]; // Türkiye'deki standart taksit kademeleri

export function PaymentCredentialForm({ credential, onSave, onDelete, onClose }) {
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
    await onSave({
      provider,
      apiKey: apiKey.trim(),
      secretKey: secretKey.trim(),
      merchantSalt: isPayTR ? merchantSalt.trim() : null,
      sandbox,
      maxInstallment,
    });
    setSaving(false);
    onClose();
  };

  return (
    <>
      <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: "0 0 14px" }}>
        Müşterilerinizin onay linkinden kartla doğrudan ödeme yapabilmesi için kendi iyzico veya
        PayTR hesabınızın API bilgilerini girin. Kart bilgisi hiçbir zaman Binerly sunucularından
        geçmez, sağlayıcının kendi güvenli sayfasında girilir. Aynı anda sadece bir sağlayıcı aktif
        olabilir - yeni birini bağlarsanız öncekinin yerini alır.
      </p>
      {credential && (
        <div
          style={{
            background: "var(--surface-2)",
            borderRadius: "var(--radius)",
            padding: 10,
            marginBottom: 14,
            fontSize: 13,
          }}
        >
          {credential.provider === "paytr" ? "PayTR" : "iyzico"} bağlı ✓{" "}
          {credential.sandbox ? "(Test modu / Sandbox)" : "(Canlı)"}
        </div>
      )}
      <div style={{ marginBottom: 14 }}>
        <label
          style={{
            fontSize: 13,
            color: "var(--text-secondary)",
            display: "block",
            marginBottom: 4,
          }}
        >
          Sağlayıcı
        </label>
        <select
          value={provider}
          onChange={(e) => {
            setProvider(e.target.value);
            setApiKey("");
            setSecretKey("");
            setMerchantSalt("");
          }}
          style={{ width: "100%" }}
        >
          <option value="iyzico">iyzico</option>
          <option value="paytr">PayTR</option>
        </select>
      </div>
      {isPayTR && (
        <div
          style={{
            background: "var(--surface-2)",
            borderRadius: "var(--radius)",
            padding: 10,
            marginBottom: 14,
            fontSize: 12.5,
          }}
        >
          PayTR panelinizde <strong>Bildirim URL'i</strong> olarak (bir kez) şunu ayarlamanız
          gerekiyor:
          <div
            style={{
              fontFamily: "monospace",
              fontSize: 11.5,
              margin: "6px 0",
              wordBreak: "break-all",
              userSelect: "all",
            }}
          >
            {PAYTR_NOTIFICATION_URL}
          </div>
          Bu adım yapılmadan ödemeler onaylanmaz.
        </div>
      )}
      <form onSubmit={submit} autoComplete="off">
        <div style={{ marginBottom: 10 }}>
          <label
            style={{
              fontSize: 13,
              color: "var(--text-secondary)",
              display: "block",
              marginBottom: 4,
            }}
          >
            {isPayTR ? "Mağaza No (Merchant ID)" : "API Key"}
          </label>
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
          <label
            style={{
              fontSize: 13,
              color: "var(--text-secondary)",
              display: "block",
              marginBottom: 4,
            }}
          >
            {isPayTR ? "Merchant Key" : "Secret Key"}
          </label>
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
            <label
              style={{
                fontSize: 13,
                color: "var(--text-secondary)",
                display: "block",
                marginBottom: 4,
              }}
            >
              Merchant Salt
            </label>
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
          <label
            style={{
              fontSize: 13,
              color: "var(--text-secondary)",
              display: "block",
              marginBottom: 4,
            }}
          >
            Taksit
          </label>
          <select
            value={maxInstallment}
            onChange={(e) => setMaxInstallment(Number(e.target.value))}
            style={{ width: "100%" }}
          >
            <option value={1}>Tek çekim</option>
            {INSTALLMENT_TIERS.filter((t) => t > 1).map((t) => (
              <option key={t} value={t}>
                {t} taksite kadar
              </option>
            ))}
          </select>
          <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: "4px 0 0" }}>
            Müşteriye ödeme sayfasında sunulacak azami taksit sayısı. Bu sadece bir üst sınır -
            taksitin gerçekten sunulabilmesi {isPayTR ? "PayTR" : "iyzico"} hesabınızda taksitli
            satış özelliğinin açık olmasına ve müşterinin kartının taksit desteğine bağlıdır;
            hesabınızda kapalıysa bu ayara rağmen tek çekim gösterilir.
          </p>
        </div>
        <label
          style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, marginBottom: 16 }}
        >
          <input type="checkbox" checked={sandbox} onChange={(e) => setSandbox(e.target.checked)} />
          Test modu (Sandbox) - canlıya geçmeden önce test anahtarlarınızla deneyin
        </label>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
          {credential ? (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              style={{ color: "var(--text-danger, #b91c1c)" }}
            >
              Bağlantıyı kaldır
            </button>
          ) : (
            <span />
          )}
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" onClick={onClose}>
              Kapat
            </button>
            <button
              type="submit"
              disabled={saving || !requiredFilled}
              style={{
                background: "var(--fill-accent)",
                color: "var(--on-accent)",
                border: "none",
              }}
            >
              {saving ? "Kaydediliyor…" : "Kaydet"}
            </button>
          </div>
        </div>
      </form>
      {confirmDelete && (
        <ConfirmDialog
          title="Bağlantı kaldırılsın mı?"
          message={`${credential?.provider === "paytr" ? "PayTR" : "iyzico"} bağlantısı kaldırılır, ödeme modu seçilmiş tekliflerdeki online ödeme butonları çalışmaz hale gelir.`}
          onConfirm={async () => {
            await onDelete(credential.provider);
            setConfirmDelete(false);
            onClose();
          }}
          onClose={() => setConfirmDelete(false)}
        />
      )}
    </>
  );
}

export function AppSettingsModal({
  session,
  theme,
  onThemeChange,
  pushSubscribed,
  onSubscribe,
  onUnsubscribe,
  notify,
  onClose,
}) {
  const [name, setName] = useState(session.user.user_metadata?.full_name || "");
  const [savingName, setSavingName] = useState(false);
  const [photoUrl, setPhotoUrl] = useState(session.user.user_metadata?.avatar_url || "");
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);

  const saveName = async (e) => {
    e.preventDefault();
    if (!name.trim()) {
      notify("Ad Soyad boş olamaz.");
      return;
    }
    setSavingName(true);
    const { error } = await supabase.auth.updateUser({ data: { full_name: name.trim() } });
    setSavingName(false);
    if (error) {
      notify(`Kaydedilemedi: ${translateAuthError(error.message)}`);
      return;
    }
    notify("Adınız güncellendi.", "success");
  };

  // Şirket logosuyla aynı public "logos" bucket'ı - {userId}/... yolu, storage
  // RLS'inde zaten "kendi auth.uid() klasörüne herkes yazabilir" kuralına
  // giriyor, yeni bir bucket/policy gerekmiyor.
  const handlePhotoFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      notify("Sadece resim dosyası yükleyebilirsiniz.");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      notify("Fotoğraf en fazla 2 MB olabilir.");
      return;
    }
    setUploadingPhoto(true);
    const ext = file.name.split(".").pop();
    const path = `${session.user.id}/avatar-${Date.now()}.${ext}`;
    const { error: uploadError } = await supabase.storage
      .from("logos")
      .upload(path, file, { upsert: true });
    if (uploadError) {
      setUploadingPhoto(false);
      notify(`Fotoğraf yüklenemedi: ${uploadError.message}`);
      return;
    }
    const { data } = supabase.storage.from("logos").getPublicUrl(path);
    const { error } = await supabase.auth.updateUser({ data: { avatar_url: data.publicUrl } });
    setUploadingPhoto(false);
    if (error) {
      notify(`Fotoğraf kaydedilemedi: ${translateAuthError(error.message)}`);
      return;
    }
    setPhotoUrl(data.publicUrl);
    notify("Profil fotoğrafınız güncellendi.", "success");
  };

  const removePhoto = async () => {
    setUploadingPhoto(true);
    const { error } = await supabase.auth.updateUser({ data: { avatar_url: null } });
    setUploadingPhoto(false);
    if (error) {
      notify(`Kaldırılamadı: ${translateAuthError(error.message)}`);
      return;
    }
    setPhotoUrl("");
  };

  const changePassword = async (e) => {
    e.preventDefault();
    if (newPassword.length < 6) {
      notify("Yeni şifre en az 6 karakter olmalı.");
      return;
    }
    if (newPassword !== confirmPassword) {
      notify("Yeni şifreler eşleşmiyor.");
      return;
    }
    setSaving(true);
    const { error: verifyError } = await supabase.auth.signInWithPassword({
      email: session.user.email,
      password: currentPassword,
    });
    if (verifyError) {
      setSaving(false);
      notify("Mevcut şifreniz yanlış.");
      return;
    }
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setSaving(false);
    if (error) {
      notify(`Şifre değiştirilemedi: ${translateAuthError(error.message)}`);
      return;
    }
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    notify("Şifreniz güncellendi.", "success");
  };

  return (
    <Modal title="Ayarlar" onClose={onClose}>
      <div style={{ marginBottom: 20 }}>
        <p style={{ fontSize: 13, fontWeight: 500, margin: "0 0 8px" }}>Profil</p>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
          {photoUrl ? (
            <img
              src={photoUrl}
              alt=""
              style={{ width: 56, height: 56, borderRadius: "50%", objectFit: "cover" }}
            />
          ) : (
            <InitialsAvatar name={name || session.user.email} size={56} />
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label
              style={{
                background: "var(--surface-1)",
                border: "0.5px solid var(--border)",
                borderRadius: "var(--radius)",
                padding: "6px 12px",
                fontSize: 13,
                cursor: uploadingPhoto ? "default" : "pointer",
                width: "fit-content",
              }}
            >
              {uploadingPhoto ? "Yükleniyor…" : photoUrl ? "Fotoğrafı değiştir" : "Fotoğraf yükle"}
              <input
                type="file"
                accept="image/*"
                onChange={handlePhotoFile}
                disabled={uploadingPhoto}
                style={{ display: "none" }}
              />
            </label>
            {photoUrl && !uploadingPhoto && (
              <button
                type="button"
                onClick={removePhoto}
                style={{
                  background: "none",
                  border: "none",
                  color: "var(--text-danger)",
                  fontSize: 12,
                  padding: 0,
                  cursor: "pointer",
                  textAlign: "left",
                }}
              >
                Kaldır
              </button>
            )}
          </div>
        </div>
        <form onSubmit={saveName} style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
          <div style={{ flex: 1 }}>
            <label
              style={{
                fontSize: 13,
                color: "var(--text-secondary)",
                display: "block",
                marginBottom: 4,
              }}
            >
              Ad Soyad
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={{ width: "100%" }}
            />
          </div>
          <button
            type="submit"
            disabled={savingName || !name.trim()}
            style={{
              background: "var(--fill-accent)",
              color: "var(--on-accent)",
              border: "none",
              fontSize: 13,
            }}
          >
            {savingName ? "Kaydediliyor…" : "Kaydet"}
          </button>
        </form>
      </div>

      <div style={{ marginBottom: 20, paddingTop: 16, borderTop: "0.5px solid var(--border)" }}>
        <p style={{ fontSize: 13, fontWeight: 500, margin: "0 0 8px" }}>Görünüm</p>
        <SegmentedControl value={theme} onChange={onThemeChange} options={THEME_OPTIONS} />
      </div>

      <div style={{ marginBottom: 20, paddingTop: 16, borderTop: "0.5px solid var(--border)" }}>
        <p style={{ fontSize: 13, fontWeight: 500, margin: "0 0 8px" }}>Bildirimler</p>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>
            Yeni müşteri mesajı geldiğinde anında bildirim
          </span>
          <button
            type="button"
            onClick={() => (pushSubscribed ? onUnsubscribe() : onSubscribe())}
            style={{ fontSize: 13 }}
          >
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
            <label
              style={{
                fontSize: 13,
                color: "var(--text-secondary)",
                display: "block",
                marginBottom: 4,
              }}
            >
              Mevcut şifre
            </label>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              style={{ width: "100%" }}
            />
          </div>
          <div style={{ marginBottom: 8 }}>
            <label
              style={{
                fontSize: 13,
                color: "var(--text-secondary)",
                display: "block",
                marginBottom: 4,
              }}
            >
              Yeni şifre
            </label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              style={{ width: "100%" }}
            />
          </div>
          <div style={{ marginBottom: 8 }}>
            <label
              style={{
                fontSize: 13,
                color: "var(--text-secondary)",
                display: "block",
                marginBottom: 4,
              }}
            >
              Yeni şifre (tekrar)
            </label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              style={{ width: "100%" }}
            />
          </div>
          <button
            type="submit"
            disabled={saving || !currentPassword || !newPassword}
            style={{
              background: "var(--fill-accent)",
              color: "var(--on-accent)",
              border: "none",
              fontSize: 13,
            }}
          >
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
