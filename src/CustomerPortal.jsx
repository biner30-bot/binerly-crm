import React, { useState, useEffect, useRef } from "react";
import { supabase } from "./supabase";
import {
  Badge,
  Modal,
  Toast,
  ConfirmDialog,
  formatTL,
  useSessionTimeout,
  useTheme,
  GoogleAuthButton,
  AuthDivider,
  uid,
  isFullNameValid,
  WEEKDAYS,
  nextWeeklyOccurrence,
  NotificationBell,
  getPortalUrl,
  EmojiPickerButton,
  IconButton,
  translateAuthError,
  humanizeDbMessage,
  InitialsAvatar,
  SegmentedControl,
  THEME_OPTIONS,
} from "./shared";
import {
  STAGES,
  stageLabel,
  dealWordKind,
  isAppointmentSector,
  supportsSelfBooking,
  bookingModel,
  supportsGroupClasses,
  groupClassWords,
  supportExamples,
  appointmentNoteExample,
  SECTOR_PRESETS,
  computeAppointmentPenaltyBurn,
} from "./Sectors";

const PORTAL_DEAL_WORDS = {
  teklif: {
    emptyList: "Henüz bir teklifiniz yok.",
    possAcc: "tekliflerinizi",
    tabLabel: "Tekliflerim",
    plural: "teklifler",
  },
  randevu: {
    emptyList: "Henüz bir randevunuz yok.",
    possAcc: "randevularınızı",
    tabLabel: "Randevularım",
    plural: "randevular",
  },
  uyelik: {
    emptyList: "Henüz bir üyeliğiniz yok.",
    possAcc: "üyeliklerinizi",
    tabLabel: "Üyeliklerim",
    plural: "üyelikler",
  },
  rezervasyon: {
    emptyList: "Henüz bir rezervasyonunuz yok.",
    possAcc: "rezervasyonlarınızı",
    tabLabel: "Rezervasyonlarım",
    plural: "rezervasyonlar",
  },
};
// "Gelecek/geçmiş" filtresi randevu ve rezervasyon (Otel) için anlamlı — ikisi
// de somut bir tarih/saat taşıyor (portal_randevu_zamani); teklif/üyelikte
// bunun karşılığı yok.
const PORTAL_DEAL_KINDS_WITH_PERIOD_FILTER = new Set(["randevu", "rezervasyon"]);
// api/deal-approval.js'teki "selfBooked" hesabıyla AYNI liste olmalı — burada
// eksik olması ("portal" değil "randevu_widget" ile alınan randevularda da)
// PortalDealList'in "Onayla" butonu göstermesine ama /onay/{token} sayfasının
// "bu kayıt zaten oluşturulmuş, ek işlem gerekmiyor" demesine yol açan gerçek
// bir bug'dı (2026-08-03).
const SELF_BOOKED_SOURCES = new Set(["portal", "randevu_widget"]);

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

const TICKET_STATUSES = [
  { id: "acik", label: "Açık" },
  { id: "islemde", label: "İşlemde" },
  { id: "musteri_bekleniyor", label: "Yanıtınız bekleniyor" },
  { id: "cozuldu", label: "Çözüldü" },
  { id: "kapatildi", label: "Kapatıldı" },
];

const STATUS_TONE = {
  acik: "accent",
  islemde: "warning",
  musteri_bekleniyor: "warning",
  cozuldu: "success",
  kapatildi: "default",
};

function rowToTicket(r) {
  return {
    id: r.id,
    userId: r.user_id,
    customerId: r.customer_id,
    subject: r.subject,
    description: r.description || "",
    status: r.status,
    createdAt: r.created_at,
    isGeneralChat: r.is_general_chat || false,
  };
}

function rowToTicketMessage(r) {
  return {
    id: r.id,
    ticketId: r.ticket_id,
    direction: r.direction,
    content: r.content,
    createdAt: r.created_at,
    readAt: r.read_at || null,
  };
}

// Portal UI'ının gerçekten okuduğu custom_fields anahtarları — customer_deal_view
// select("*") tüm JSONB'yi döndürür, ama geri kalanı (KOBİ'nin teklife girdiği
// başka özel alanlar, iç notlar olabilir) tarayıcıya hiç gitmesin diye rowToDeal
// SADECE bu listedeki anahtarları taşır. Yeni bir yerde d.customFields?.X
// okumaya başlarsan X'i buraya da eklemeyi unutma — yoksa (uyelik_bitis_tarihi/
// kurs_bitis_tarihi'nde olduğu gibi) o alan sessizce undefined gelir.
const PORTAL_VISIBLE_DEAL_CUSTOM_FIELD_KEYS = [
  "portal_randevu_zamani",
  "kaynak",
  "uyelik_bitis_tarihi",
  "kurs_bitis_tarihi",
  "sevkiyat_durumu",
  "service_ids",
];

function rowToDeal(r) {
  const cf = r.custom_fields || {};
  const customFields = {};
  for (const key of PORTAL_VISIBLE_DEAL_CUSTOM_FIELD_KEYS) customFields[key] = cf[key];
  return {
    id: r.id,
    customerId: r.customer_id,
    title: r.title,
    value: r.value,
    stage: r.stage,
    createdAt: r.created_at,
    customFields,
    approvalToken: r.approval_token || null,
    paymentMode: r.payment_mode || "none",
    paymentStatus: r.payment_status || null,
    approvedAt: r.approved_at || null,
    sessionTotal: r.session_total ?? null,
    sessionUsed: r.session_used ?? 0,
    lateCancelCount: r.late_cancel_count || 0,
  };
}

function rowToGroupClass(r) {
  return {
    id: r.id,
    userId: r.user_id,
    name: r.name,
    instructorName: r.instructor_name || "",
    weekday: r.weekday,
    startTime: (r.start_time || "").slice(0, 5),
    capacity: r.capacity,
  };
}

function rowToGroupClassEnrollment(r) {
  return { id: r.id, groupClassId: r.group_class_id, customerId: r.customer_id };
}

function rowToWaitlistEntry(r) {
  return { id: r.id, groupClassId: r.group_class_id, customerId: r.customer_id };
}

function rowToPriceListItem(r) {
  return {
    id: r.id,
    userId: r.user_id,
    name: r.name,
    price: r.price,
    durationMinutes: r.duration_minutes || null,
    parallelGroup: r.parallel_group || null,
  };
}

// customer_payments_view'den geliyor (bkz. sql/2026-08-03_portal_self_service.sql)
// - iade satırları (amount negatif) DIŞLANMADI, PortalPayments bunları ayrı gösterir.
function rowToPayment(r) {
  return {
    id: r.id,
    dealId: r.deal_id,
    amount: Number(r.amount) || 0,
    paidAt: r.paid_at,
    createdAt: r.created_at,
    note: r.note,
    dealTitle: r.deal_title,
    customerId: r.customer_id,
  };
}

// Sadece işletmenin açıkça "Müşteriyle Paylaş" dediği dosyalar buraya düşer -
// RLS zaten shared_with_customer=true VE kendi deal'i şartını uyguluyor
// (bkz. sql/2026-07-31_attachment_customer_sharing.sql), burada sadece alan eşlemesi var.
function rowToPortalAttachment(r) {
  return {
    id: r.id,
    dealId: r.entity_id,
    fileName: r.file_name,
    storagePath: r.storage_path,
    fileSize: r.file_size || 0,
  };
}

function formatDateTime(dateStr) {
  const d = new Date(dateStr);
  return (
    d.toLocaleDateString("tr-TR", { day: "numeric", month: "short", year: "numeric" }) +
    " · " +
    d.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })
  );
}

// Randevu iptal/gelmeme politikası tamamen kobiye bırakılmıştır (Ayarlar →
// Müsaitlik Saatleri → "Randevu iptal / gelmeme politikası"). hardBlockHours
// boşsa (kobi hiç ayarlamadıysa) HİÇBİR kısıtlama uygulanmaz — eski sabit 2
// saatlik varsayılan BİLEREK kaldırıldı: kobi "iptal etse de sorun değil"
// diyorsa bu tercih birebir uygulanır. penaltyHours boşsa hiçbir iptal "geç"
// sayılmaz (ceza sayacına eklenmez).
function appointmentCancelDecision(randevuTarihi, hardBlockHours, penaltyHours) {
  const hoursLeft = (new Date(`${randevuTarihi}+03:00`).getTime() - Date.now()) / (60 * 60 * 1000);
  const canCancel = hardBlockHours == null || hoursLeft >= hardBlockHours;
  const isLate = canCancel && penaltyHours != null && hoursLeft < penaltyHours;
  return { canCancel, isLate, hoursLeft };
}

function CustomerPortalLanding({ onEnter }) {
  const features = [
    { icon: "ti-list-check", text: "Teklif, randevu, üyelik veya rezervasyon durumunuzu görün" },
    { icon: "ti-message-circle", text: "İşletmeyle mesajlaşın, destek talebi açın" },
    { icon: "ti-calendar-plus", text: "Uygun işletmelerde kendi randevunuzu alın veya iptal edin" },
    { icon: "ti-bell", text: "Yeni gelişmelerde anında bildirim alın" },
  ];
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "var(--bg)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1rem",
      }}
    >
      <div style={{ maxWidth: 440, width: "100%" }}>
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <img
            src="/favicon.svg"
            alt="Binerly"
            style={{ width: 52, height: 52, marginBottom: 14 }}
          />
          <h1
            style={{
              fontSize: 22,
              fontWeight: 700,
              color: "var(--text-primary)",
              margin: "0 0 8px",
            }}
          >
            Binerly Müşteri Portalı
          </h1>
          <p style={{ fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.6, margin: 0 }}>
            Hizmet aldığınız işletmeyle ilgili her şeyi tek yerden takip edin.
          </p>
        </div>
        <div
          style={{
            background: "var(--surface-1)",
            borderRadius: "var(--radius-lg)",
            boxShadow: "var(--shadow-sm)",
            padding: "1.5rem",
            marginBottom: 20,
          }}
        >
          {features.map((f) => (
            <div
              key={f.text}
              style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}
            >
              <span
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: "50%",
                  background: "var(--bg-accent)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flex: "none",
                }}
              >
                <i
                  className={`ti ${f.icon}`}
                  style={{ fontSize: 16, color: "var(--text-accent)" }}
                  aria-hidden="true"
                ></i>
              </span>
              <span style={{ fontSize: 14, color: "var(--text-primary)" }}>{f.text}</span>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <button
            onClick={() => onEnter("login")}
            style={{
              background: "var(--fill-accent)",
              color: "var(--on-accent)",
              border: "none",
              borderRadius: "var(--radius)",
              padding: "13px",
              fontSize: 15,
              fontWeight: 600,
            }}
          >
            Giriş Yap
          </button>
          <button
            onClick={() => onEnter("register")}
            style={{
              background: "var(--surface-1)",
              color: "var(--text-accent)",
              border: "1.5px solid var(--border-strong)",
              borderRadius: "var(--radius)",
              padding: "13px",
              fontSize: 15,
              fontWeight: 600,
            }}
          >
            Hesap Oluştur
          </button>
        </div>
        <p style={{ fontSize: 12, color: "var(--text-muted)", textAlign: "center", marginTop: 20 }}>
          Bir işletme sahibi misiniz?{" "}
          <a href="https://binerly.com" style={{ color: "var(--text-accent)" }}>
            binerly.com
          </a>
          'u ziyaret edin.
        </p>
      </div>
    </div>
  );
}

function CustomerPortalEntry() {
  const params = new URLSearchParams(window.location.search);
  const [mode, setMode] = useState(
    params.get("register") ? "register" : params.get("login") ? "login" : null,
  );
  if (!mode) return <CustomerPortalLanding onEnter={setMode} />;
  return <CustomerAuthForm initialMode={mode} onBack={() => setMode(null)} />;
}

function CustomerAuthForm({ initialMode = "login", onBack }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState(initialMode);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setMessage("");
    setLoading(true);
    if (mode === "login") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setMessage(translateAuthError(error.message));
    } else {
      if (!isFullNameValid(name)) {
        setMessage("Lütfen ad ve soyadınızı girin.");
        setLoading(false);
        return;
      }
      if (!termsAccepted) {
        setMessage(
          "Devam etmek için Kullanım Koşulları ve Gizlilik Politikası'nı kabul etmeniz gerekiyor.",
        );
        setLoading(false);
        return;
      }
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: name.trim() }, emailRedirectTo: getPortalUrl() },
      });
      if (error) setMessage(translateAuthError(error.message));
      // Supabase, zaten kayıtlı+onaylı bir e-postayla tekrar signUp çağrılınca
      // e-posta numaralandırma saldırılarını önlemek için hata DÖNDÜRMEZ - mesaj
      // bu yüzden iki durumu da kapsayacak şekilde nötr yazılıyor, kayıtlı/kayıtsız
      // ayrımını dışarı sızdırmıyoruz.
      else
        setMessage(
          "Bu e-posta ile daha önce kayıt olmadıysanız doğrulama linki gönderildi. Zaten kayıtlıysanız buradan giriş yapabilirsiniz.",
        );
    }
    setLoading(false);
  };

  const sendResetEmail = async () => {
    if (!email) {
      setMessage("Önce e-posta adresinizi yazın.");
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: getPortalUrl(),
    });
    setLoading(false);
    setMessage(
      error
        ? translateAuthError(error.message)
        : "E-postanıza bir şifre sıfırlama bağlantısı gönderdik.",
    );
  };

  const handleGoogleCredential = async (idToken, nonce) => {
    const { error } = await supabase.auth.signInWithIdToken({
      provider: "google",
      token: idToken,
      nonce,
    });
    if (error) setMessage(translateAuthError(error.message));
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--bg)",
        padding: "1rem",
      }}
    >
      <div
        style={{
          background: "var(--surface-1)",
          borderRadius: "var(--radius-lg)",
          boxShadow: "var(--shadow-sm)",
          padding: "2rem",
          width: "100%",
          maxWidth: 400,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
          <img src="/favicon.svg" alt="Binerly" style={{ width: 39, height: 39 }} />
          <span style={{ fontWeight: 700, fontSize: 16, color: "var(--text-primary)" }}>
            Binerly Müşteri Bilgi Sistemi
          </span>
        </div>
        <h2
          style={{ fontSize: 18, fontWeight: 700, margin: "0 0 4px", color: "var(--text-primary)" }}
        >
          {mode === "login" ? "Giriş yap" : "Hesap oluştur"}
        </h2>
        <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: "0 0 20px" }}>
          Bir firmanın müşterisiyseniz, taleplerinizi ve kayıtlarınızı buradan takip edin.
        </p>
        <form onSubmit={submit}>
          {mode === "register" && (
            <div style={{ marginBottom: 12 }}>
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
                required
                style={{ width: "100%", boxSizing: "border-box" }}
              />
            </div>
          )}
          <div style={{ marginBottom: 12 }}>
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
              required
              style={{ width: "100%", boxSizing: "border-box" }}
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
              Şifre
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={mode === "register" ? 6 : undefined}
              style={{ width: "100%", boxSizing: "border-box" }}
            />
            {mode === "register" && (
              <p style={{ fontSize: 11.5, color: "var(--text-muted)", margin: "4px 0 0" }}>
                En az 6 karakter olmalı.
              </p>
            )}
          </div>
          {mode === "login" && (
            <p style={{ margin: "0 0 16px" }}>
              <button
                type="button"
                onClick={sendResetEmail}
                disabled={loading}
                style={{
                  background: "none",
                  border: "none",
                  boxShadow: "none",
                  color: "var(--text-accent)",
                  padding: 0,
                  fontSize: 12,
                }}
              >
                Şifremi unuttum
              </button>
            </p>
          )}
          {mode === "register" && (
            <div style={{ marginBottom: 16 }}>
              <label
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 8,
                  fontSize: 12.5,
                  color: "var(--text-secondary)",
                  cursor: "pointer",
                }}
              >
                <input
                  type="checkbox"
                  checked={termsAccepted}
                  onChange={(e) => setTermsAccepted(e.target.checked)}
                  style={{ marginTop: 2 }}
                />
                <span>
                  <a
                    href="/portal-kullanim-kosullari"
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: "var(--text-accent)" }}
                  >
                    Kullanım Koşulları
                  </a>
                  {"'nı, "}
                  <a
                    href="/gizlilik"
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: "var(--text-accent)" }}
                  >
                    Gizlilik Politikası
                  </a>
                  {"'nı ve "}
                  <a
                    href="/kvkk"
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: "var(--text-accent)" }}
                  >
                    KVKK Aydınlatma Metni
                  </a>
                  {"'ni okudum, kabul ediyorum."}
                </span>
              </label>
            </div>
          )}
          {message && (
            <p style={{ fontSize: 13, color: "var(--text-warning)", marginBottom: 12 }}>
              {message}
            </p>
          )}
          <button
            type="submit"
            disabled={loading}
            style={{
              width: "100%",
              background: "var(--fill-accent)",
              color: "var(--on-accent)",
              border: "none",
              borderRadius: "var(--radius)",
              padding: "11px",
              fontSize: 15,
              fontWeight: 600,
            }}
          >
            {loading ? "Yükleniyor…" : mode === "login" ? "Giriş yap" : "Kayıt ol"}
          </button>
        </form>
        <AuthDivider />
        <GoogleAuthButton onCredential={handleGoogleCredential} />
        <p
          style={{
            fontSize: 13,
            textAlign: "center",
            marginTop: 16,
            color: "var(--text-secondary)",
          }}
        >
          {mode === "login" ? "Hesabın yok mu? " : "Hesabın var mı? "}
          <button
            onClick={() => {
              setMode(mode === "login" ? "register" : "login");
              setMessage("");
            }}
            style={{
              background: "none",
              border: "none",
              boxShadow: "none",
              color: "var(--text-accent)",
              padding: 0,
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            {mode === "login" ? "Kayıt ol" : "Giriş yap"}
          </button>
        </p>
        <p style={{ fontSize: 12, textAlign: "center", marginTop: 20 }}>
          <button
            type="button"
            onClick={onBack}
            style={{
              background: "none",
              border: "none",
              boxShadow: "none",
              color: "var(--text-muted)",
              fontSize: 12,
              padding: 0,
            }}
          >
            ← Geri
          </button>
        </p>
      </div>
    </div>
  );
}

function PortalNewTicketForm({ customerRows, onSave, onCancel }) {
  const [customerId, setCustomerId] = useState(customerRows[0]?.id || "");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const selectedSector = customerRows.find((c) => c.id === customerId)?.companySector;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!subject.trim() || !customerId) return;
        onSave({ customerId, subject: subject.trim(), description: description.trim() });
      }}
    >
      {customerRows.length > 1 && (
        <div style={{ marginBottom: 12 }}>
          <label
            style={{
              fontSize: 13,
              color: "var(--text-secondary)",
              display: "block",
              marginBottom: 4,
            }}
          >
            Hangi firma için?
          </label>
          <select
            value={customerId}
            onChange={(e) => setCustomerId(e.target.value)}
            style={{ width: "100%" }}
          >
            {customerRows.map((c) => (
              <option key={c.id} value={c.id}>
                {c.companyName || c.name}
              </option>
            ))}
          </select>
        </div>
      )}
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
          placeholder={`Örn. ${supportExamples(selectedSector).subject}`}
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
          Açıklama
        </label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Talebinizin detayları"
          style={{ width: "100%", minHeight: 80, resize: "vertical" }}
        />
      </div>
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button type="button" onClick={onCancel}>
          Vazgeç
        </button>
        <button
          type="submit"
          style={{ background: "var(--fill-accent)", color: "var(--on-accent)", border: "none" }}
        >
          Gönder
        </button>
      </div>
    </form>
  );
}

function PortalTicketList({
  tickets,
  unreadCountByTicket,
  onOpenTicket,
  companyNameByCustomerId,
  showCompany,
}) {
  if (tickets.length === 0) {
    return <p style={{ fontSize: 14, color: "var(--text-secondary)" }}>Henüz bir talebiniz yok.</p>;
  }
  const sorted = [...tickets].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {sorted.map((t) => {
        const statusInfo = TICKET_STATUSES.find((s) => s.id === t.status);
        return (
          <div
            key={t.id}
            onClick={() => onOpenTicket(t)}
            style={{
              background: "var(--surface-1)",
              borderRadius: "var(--radius-lg)",
              boxShadow: "var(--shadow-sm)",
              padding: "0.75rem 1rem",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 12,
              flexWrap: "wrap",
              cursor: "pointer",
            }}
          >
            <div>
              <p
                style={{
                  margin: 0,
                  fontWeight: 500,
                  fontSize: 14,
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                {t.subject}
                {unreadCountByTicket[t.id] > 0 && (
                  <Badge tone="accent">{unreadCountByTicket[t.id]} yeni mesaj</Badge>
                )}
              </p>
              <p style={{ margin: 0, fontSize: 12, color: "var(--text-secondary)" }}>
                {showCompany && `${companyNameByCustomerId[t.customerId] || "Bilinmeyen firma"} · `}
                {formatDateTime(t.createdAt)}
              </p>
            </div>
            <Badge tone={STATUS_TONE[t.status] || "default"}>{statusInfo?.label}</Badge>
          </div>
        );
      })}
    </div>
  );
}

function PortalTicketDetail({ ticket, messages, onAddMessage, onClose }) {
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);
  const statusInfo = TICKET_STATUSES.find((s) => s.id === ticket.status);
  const sorted = [...messages].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  const descriptionIsFirstMessage = sorted.length > 0 && sorted[0].content === ticket.description;

  const submit = async (e) => {
    e.preventDefault();
    if (!content.trim()) return;
    setSaving(true);
    await onAddMessage({ ticketId: ticket.id, content: content.trim() });
    setContent("");
    setSaving(false);
  };

  return (
    <Modal title={ticket.subject} onClose={onClose}>
      <div style={{ marginBottom: 16 }}>
        {ticket.description && !descriptionIsFirstMessage && (
          <p style={{ margin: "0 0 8px", fontSize: 13, color: "var(--text-secondary)" }}>
            {ticket.description}
          </p>
        )}
        <Badge tone={STATUS_TONE[ticket.status] || "default"}>{statusInfo?.label}</Badge>
      </div>

      <p style={{ fontSize: 13, fontWeight: 500, margin: "0 0 8px" }}>Mesajlar</p>
      <form onSubmit={submit} style={{ marginBottom: 16 }}>
        <div style={{ marginBottom: 8 }}>
          <input
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Mesajınızı yazın"
            style={{ width: "100%" }}
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
          Gönder
        </button>
      </form>

      {sorted.length === 0 ? (
        <p style={{ fontSize: 13, color: "var(--text-muted)" }}>Henüz mesaj yok.</p>
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
          {sorted.map((m) => (
            <div key={m.id}>
              <p style={{ margin: 0, fontSize: 13 }}>{m.content}</p>
              <p style={{ margin: 0, fontSize: 11, color: "var(--text-muted)" }}>
                {m.direction === "giden" ? "Firmadan" : "Siz"} · {formatDateTime(m.createdAt)}
              </p>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}

// "Mesajlar" sekmesi — Taleplerim'in aksine konu/durum yok, düz bir sohbet.
// İlk mesaj gönderildiğinde CustomerPortal'daki sendChatMessage otomatik
// olarak arkada bir "genel sohbet" talebi açar, burası bunu hiç bilmez.
function PortalMessagesPanel({ messages, onSend, sending, companyName }) {
  const [content, setContent] = useState("");
  const sorted = [...messages].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

  const submit = async (e) => {
    e.preventDefault();
    if (!content.trim() || sending) return;
    const text = content.trim();
    setContent("");
    await onSend(text);
  };

  return (
    <div
      style={{
        background: "var(--surface-1)",
        borderRadius: "var(--radius-lg)",
        boxShadow: "var(--shadow-sm)",
        padding: "1rem",
        display: "flex",
        flexDirection: "column",
        height: 480,
      }}
    >
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
          gap: 8,
          marginBottom: 12,
        }}
      >
        {sorted.length === 0 ? (
          <p style={{ fontSize: 13, color: "var(--text-muted)" }}>
            Henüz mesaj yok - işletmeye buradan yazabilirsiniz.
          </p>
        ) : (
          sorted.map((m) => (
            <div
              key={m.id}
              style={{
                alignSelf: m.direction === "gelen" ? "flex-end" : "flex-start",
                maxWidth: "75%",
              }}
            >
              {m.direction !== "gelen" && companyName && (
                <p
                  style={{
                    margin: "0 0 2px 4px",
                    fontSize: 11,
                    fontWeight: 600,
                    color: "var(--text-secondary)",
                  }}
                >
                  {companyName}
                </p>
              )}
              <div
                style={{
                  background: m.direction === "gelen" ? "var(--fill-accent)" : "var(--surface-2)",
                  color: m.direction === "gelen" ? "var(--on-accent)" : "var(--text-primary)",
                  borderRadius: "var(--radius)",
                  padding: "6px 10px",
                  fontSize: 13,
                }}
              >
                {m.content}
              </div>
              <p
                style={{
                  margin: "2px 4px 0",
                  fontSize: 10,
                  color: "var(--text-muted)",
                  textAlign: m.direction === "gelen" ? "right" : "left",
                }}
              >
                {formatDateTime(m.createdAt)}
              </p>
            </div>
          ))
        )}
      </div>
      <form onSubmit={submit} style={{ display: "flex", gap: 8 }}>
        <input
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Mesajınızı yazın..."
          style={{ flex: 1 }}
        />
        <EmojiPickerButton onSelect={(emoji) => setContent((c) => c + emoji)} />
        <button
          type="submit"
          disabled={sending || !content.trim()}
          style={{ background: "var(--fill-accent)", color: "var(--on-accent)", border: "none" }}
        >
          Gönder
        </button>
      </form>
    </div>
  );
}

function PortalDealList({
  deals,
  companyNameByCustomerId,
  sectorByCustomerId,
  hardBlockHoursByCustomerId = {},
  appointmentPenaltyHoursByCustomerId = {},
  appointmentPenaltyStrikeLimitByCustomerId = {},
  appointmentPenaltyBurnsSessionByCustomerId = {},
  appointmentPartialChargeHoursByCustomerId = {},
  sector,
  showCompany,
  dealKind,
  onCancelAppointment,
  onReschedule,
  sharedAttachments = [],
  onDownloadAttachment,
  onBookNew,
}) {
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState("all");
  const [paymentFilter, setPaymentFilter] = useState("all");
  // Randevu/rezervasyon sektörlerinde "geçmiş/gelecek" ayrımı en çok aranan
  // filtre — teklif/üyelikte bunun bir karşılığı yok (tarih taşımıyorlar).
  const hasPeriodFilter = PORTAL_DEAL_KINDS_WITH_PERIOD_FILTER.has(dealKind);
  const [periodFilter, setPeriodFilter] = useState(hasPeriodFilter ? "gelecek" : "all");

  if (deals.length === 0) {
    return (
      <p style={{ fontSize: 14, color: "var(--text-secondary)" }}>
        {PORTAL_DEAL_WORDS[dealKind].emptyList}
      </p>
    );
  }

  const query = search.trim().toLowerCase();
  const now = Date.now();
  const filtered = deals.filter((d) => {
    if (query && !d.title.toLowerCase().includes(query)) return false;
    if (stageFilter === "acik" && (d.stage === "kazanildi" || d.stage === "kaybedildi"))
      return false;
    if (stageFilter !== "all" && stageFilter !== "acik" && d.stage !== stageFilter) return false;
    if (paymentFilter === "odendi" && d.paymentStatus !== "paid") return false;
    if (paymentFilter === "odenmedi" && (d.paymentMode === "none" || d.paymentStatus === "paid"))
      return false;
    if (hasPeriodFilter && periodFilter !== "all") {
      const dt = d.customFields?.portal_randevu_zamani;
      // Tarihi bilinmeyen (örn. henüz aynalanmamış eski) bir kayıt "geçmiş"e
      // gizlenip kaybolmasın diye varsayılan olarak "gelecek" sayılır.
      const isFuture = !dt || new Date(dt).getTime() >= now;
      if (periodFilter === "gelecek" && !isFuture) return false;
      if (periodFilter === "gecmis" && isFuture) return false;
    }
    return true;
  });
  const sorted = [...filtered].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  return (
    <div>
      <div
        className="list-toolbar"
        style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}
      >
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={`${PORTAL_DEAL_WORDS[dealKind].tabLabel} ara...`}
          style={{ flex: 1, minWidth: 140, fontSize: 13 }}
        />
        <select
          value={stageFilter}
          onChange={(e) => setStageFilter(e.target.value)}
          style={{ fontSize: 13 }}
        >
          <option value="all">Tüm aşamalar</option>
          <option value="acik">Açık olanlar</option>
          {STAGES.map((s) => (
            <option key={s.id} value={s.id}>
              {stageLabel(s.id, "bireysel", sector)}
            </option>
          ))}
        </select>
        <select
          value={paymentFilter}
          onChange={(e) => setPaymentFilter(e.target.value)}
          style={{ fontSize: 13 }}
        >
          <option value="all">Tüm ödeme durumları</option>
          <option value="odendi">Ödendi</option>
          <option value="odenmedi">Ödenmedi</option>
        </select>
        {hasPeriodFilter && (
          <select
            value={periodFilter}
            onChange={(e) => setPeriodFilter(e.target.value)}
            style={{ fontSize: 13 }}
          >
            <option value="all">Tüm zamanlar</option>
            <option value="gelecek">{`Gelecek ${PORTAL_DEAL_WORDS[dealKind].plural}`}</option>
            <option value="gecmis">{`Geçmiş ${PORTAL_DEAL_WORDS[dealKind].plural}`}</option>
          </select>
        )}
      </div>
      {sorted.length === 0 ? (
        <p style={{ fontSize: 14, color: "var(--text-secondary)" }}>Aramayla eşleşen kayıt yok.</p>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
            gap: 12,
          }}
        >
          {sorted.map((d) => {
            const stageText = stageLabel(d.stage, "bireysel", sectorByCustomerId[d.customerId]);
            const tone =
              d.stage === "kazanildi"
                ? "success"
                : d.stage === "kaybedildi"
                  ? "default"
                  : d.stage === "muzakere"
                    ? "warning"
                    : "accent";
            const randevuTarihi = d.customFields?.portal_randevu_zamani;
            const cancellable = d.stage === "ilk_gorusme" && randevuTarihi;
            const hardBlockHours = hardBlockHoursByCustomerId[d.customerId];
            const penaltyHours = appointmentPenaltyHoursByCustomerId[d.customerId];
            const partialChargeHours = appointmentPartialChargeHoursByCustomerId[d.customerId];
            const { canCancel, isLate, hoursLeft } = cancellable
              ? appointmentCancelDecision(randevuTarihi, hardBlockHours, penaltyHours)
              : { canCancel: false, isLate: false, hoursLeft: null };
            // Sadece bilgilendirme amaçlı bir ÖNİZLEME — cezanın gerçek uygulanışı
            // cancelAppointment'ta (isLate onaylanınca) aynı fonksiyonla tekrar
            // hesaplanıyor. Burada erken göstermek müşteriye "bu iptal ne yapacak"
            // sorusunu iptal etmeden önce, detaylı açıklayarak yanıtlıyor.
            const willBurnSession =
              isLate &&
              !!computeAppointmentPenaltyBurn({
                customerId: d.customerId,
                deals,
                burnsSessionEnabled:
                  appointmentPenaltyBurnsSessionByCustomerId[d.customerId] === true,
                strikeLimit: appointmentPenaltyStrikeLimitByCustomerId[d.customerId],
                missedPriceItemId: d.customFields?.price_item_id,
              });
            // Kısmi kesinti sınırı — sadece bilgi amaçlı bir bölge etiketi, otomatik
            // para hareketi yapmaz (bkz. AppointmentCancelPolicyBox InfoTip'i).
            const chargeZone =
              isLate && partialChargeHours != null
                ? hoursLeft >= partialChargeHours
                  ? "partial"
                  : "full"
                : null;
            // Onay ve ödeme birbirinden bağımsız — /onay/{token} sayfası zaten
            // hangi moda göre ne göstereceğini kendi kararlaştırıyor, burada
            // sadece o sayfaya giden tek bir uyarlanmış link/rozet sunuluyor.
            const isApproved = !!d.approvedAt;
            const isPaid = d.paymentStatus === "paid";
            const needsPayment = d.paymentMode !== "none" && !isPaid;
            // İş tamamlanmışsa (stage=kazanildi) saf onay adımının artık bir anlamı
            // yok — müşteri işi zaten yüz yüze/telefonla onaylamış ya da hizmet
            // doğrudan verilmiş demektir. Ödeme hâlâ eksikse yine de gösterilir,
            // ama "Onayla" değil sadece "Öde" olarak.
            const isCompleted = d.stage === "kazanildi";
            // Portaldan kendi alınan randevu/üyelik/rezervasyonlarda (kaynak: "portal")
            // onay diye bir kavram yok — müşteri zaten kendi almış, tek eylem ödeme.
            const isSelfBooked = SELF_BOOKED_SOURCES.has(d.customFields?.kaynak);
            const actionLabel =
              isCompleted || isSelfBooked
                ? "Öde"
                : !isApproved
                  ? d.paymentMode === "required"
                    ? "Onayla ve Öde"
                    : d.paymentMode === "optional"
                      ? "Onayla / Öde"
                      : "Onayla"
                  : "Öde";
            // Ödeyen müşteri artık kaynağı ne olursa olsun approved_at alıyor
            // (api/deal-approval.js) — self-booked+ödenmiş bir kayıtta bile
            // isApproved true olabilir. actionLabel/showAction bunu isCompleted
            // gibi ele alıp needsPayment'a bakıyor, o yüzden buton mantığı
            // etkilenmiyor; ama "✓ Onaylandı" rozeti self-booked'ta bilerek
            // gösterilmiyor (bkz. aşağı) — müşteri kendi aldığı bir randevuyu
            // "onaylamadı", sadece ödedi, o zaten ayrı bir rozetle belli oluyor.
            const showAction =
              d.approvalToken &&
              (isCompleted || isSelfBooked ? needsPayment : !isApproved || needsPayment);
            const dealDocs = sharedAttachments.filter((a) => a.dealId === d.id);
            const sectorIcon =
              SECTOR_PRESETS.find((s) => s.id === sectorByCustomerId[d.customerId])?.icon ||
              "ti-file-text";
            return (
              <div
                key={d.id}
                style={{
                  background: "var(--surface-1)",
                  borderRadius: "var(--radius-lg)",
                  boxShadow: "var(--shadow-sm)",
                  padding: "1rem 1.1rem",
                  display: "flex",
                  flexDirection: "column",
                  gap: 10,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    gap: 8,
                  }}
                >
                  <div
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: "50%",
                      background: "var(--bg-accent)",
                      color: "var(--text-accent)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flex: "none",
                    }}
                  >
                    <i
                      className={`ti ${sectorIcon}`}
                      style={{ fontSize: 19 }}
                      aria-hidden="true"
                    ></i>
                  </div>
                  <Badge tone={tone}>{stageText}</Badge>
                </div>

                <div>
                  <p
                    style={{
                      margin: 0,
                      fontWeight: 700,
                      fontSize: 15,
                      color: "var(--text-primary)",
                    }}
                  >
                    {d.title}
                  </p>
                  {randevuTarihi && (
                    <p
                      style={{
                        margin: "4px 0 0",
                        fontSize: 12.5,
                        color: "var(--text-secondary)",
                        display: "flex",
                        alignItems: "center",
                        gap: 5,
                      }}
                    >
                      <i className="ti ti-clock" style={{ fontSize: 13 }} aria-hidden="true"></i>
                      {formatDateTime(randevuTarihi)}
                    </p>
                  )}
                  {showCompany && (
                    <p style={{ margin: "2px 0 0", fontSize: 12, color: "var(--text-secondary)" }}>
                      {companyNameByCustomerId[d.customerId] || "Bilinmeyen firma"}
                    </p>
                  )}
                  {/* Eskiden sadece span'ın title tooltip'indeydi - dokunmatik ekranda
                  hover olmadığı için bu bilgi mobilde hiç görünmüyordu. */}
                  {cancellable && !canCancel && (
                    <p style={{ margin: "4px 0 0", fontSize: 11.5, color: "var(--text-muted)" }}>
                      Randevu saatine {hardBlockHours} saatten az kaldığı için iptal edilemez
                    </p>
                  )}
                  {d.value > 0 && (
                    <p
                      style={{
                        margin: "6px 0 0",
                        fontSize: 14,
                        fontWeight: 700,
                        color: "var(--text-primary)",
                      }}
                    >
                      {formatTL(d.value)}
                    </p>
                  )}
                </div>

                {(d.customFields?.sevkiyat_durumu || (isApproved && !isSelfBooked) || isPaid) && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {d.customFields?.sevkiyat_durumu && (
                      <Badge tone="accent">{d.customFields.sevkiyat_durumu}</Badge>
                    )}
                    {isApproved && !isSelfBooked && <Badge tone="success">✓ Onaylandı</Badge>}
                    {isPaid && <Badge tone="success">✓ Ödendi</Badge>}
                  </div>
                )}

                {dealDocs.length > 0 && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    {dealDocs.map((doc) => (
                      <button
                        key={doc.id}
                        type="button"
                        onClick={() => onDownloadAttachment(doc)}
                        style={{
                          background: "none",
                          border: "none",
                          padding: 0,
                          color: "var(--text-accent)",
                          fontSize: 12,
                          textAlign: "left",
                          cursor: "pointer",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 4,
                        }}
                      >
                        <i
                          className="ti ti-file-download"
                          style={{ fontSize: 14 }}
                          aria-hidden="true"
                        ></i>
                        {doc.fileName}
                      </button>
                    ))}
                  </div>
                )}

                {/* Erteleme sadece saat-slotu bazlı randevularda (Güzellik & Bakım,
                Sağlık/Klinik) destekleniyor — Otel'in giriş/çıkış tarih aralığı +
                oda stoku modeli (bookingModel === "inventory") çok farklı bir
                form gerektirir, kapsam dışı bırakıldı. İptal ile AYNI hardBlock
                kapısını (canCancel) kullanır - randevu saatine çok az kalmışsa
                ne iptal ne erteleme yapılabilir, ikisi de işletmeye aynı son
                dakika etkisini yaratır. */}
                {(showAction || cancellable) && (
                  <div
                    style={{
                      borderTop: "1px solid var(--border)",
                      marginTop: 2,
                      paddingTop: 10,
                      display: "flex",
                      flexWrap: "wrap",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    {showAction && (
                      <a
                        href={`/onay/${d.approvalToken}`}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 6,
                          fontSize: 13,
                          fontWeight: 600,
                          color: "var(--on-accent)",
                          background: "var(--fill-accent)",
                          padding: "7px 14px",
                          borderRadius: "var(--radius)",
                          textDecoration: "none",
                          whiteSpace: "nowrap",
                        }}
                      >
                        <i
                          className="ti ti-credit-card"
                          style={{ fontSize: 15 }}
                          aria-hidden="true"
                        ></i>
                        {actionLabel}
                      </a>
                    )}
                    {cancellable &&
                      canCancel &&
                      onReschedule &&
                      bookingModel(sectorByCustomerId[d.customerId]) !== "inventory" && (
                        <button
                          type="button"
                          onClick={() => onReschedule(d)}
                          style={{ fontSize: 13 }}
                        >
                          Ertele
                        </button>
                      )}
                    {cancellable &&
                      (canCancel ? (
                        <button
                          type="button"
                          onClick={() =>
                            onCancelAppointment(d.id, isLate, willBurnSession, chargeZone)
                          }
                          style={{ fontSize: 13 }}
                        >
                          İptal Et
                        </button>
                      ) : (
                        <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
                          İptal edilemez
                        </span>
                      ))}
                  </div>
                )}
              </div>
            );
          })}
          {onBookNew && (
            <button
              type="button"
              onClick={onBookNew}
              style={{
                background: "none",
                border: "1.5px dashed var(--border-strong)",
                borderRadius: "var(--radius-lg)",
                padding: "1rem",
                minHeight: 140,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                cursor: "pointer",
                color: "var(--text-secondary)",
              }}
            >
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: "50%",
                  background: "var(--bg-accent)",
                  color: "var(--text-accent)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <i className="ti ti-plus" style={{ fontSize: 18 }} aria-hidden="true"></i>
              </div>
              <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>
                {bookingModel(sector) === "inventory" ? "Yeni Rezervasyon" : "Yeni Randevu"}
              </span>
              <span style={{ fontSize: 12, textAlign: "center" }}>
                Hızlıca yeni bir {bookingModel(sector) === "inventory" ? "rezervasyon" : "randevu"}{" "}
                oluşturun
              </span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// paid_at DATE tipinde (bkz. api/deal-approval.js handleRefund - "YYYY-MM-DD"
// olarak yazılıyor), formatDateTime'daki saat kısmı burada anlamsız olurdu.
function formatPaymentDate(dateStr) {
  if (!dateStr) return "";
  return new Date(`${dateStr}T12:00:00`).toLocaleDateString("tr-TR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function PortalPayments({ payments, showCompany, companyNameByCustomerId }) {
  if (payments.length === 0) {
    return <p style={{ fontSize: 14, color: "var(--text-secondary)" }}>Henüz bir ödemeniz yok.</p>;
  }
  const sorted = [...payments].sort(
    (a, b) => new Date(b.paidAt || b.createdAt) - new Date(a.paidAt || a.createdAt),
  );
  const total = payments.reduce((sum, p) => sum + p.amount, 0);
  return (
    <div>
      <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: "0 0 12px" }}>
        Toplam: <strong style={{ color: "var(--text-primary)" }}>{formatTL(total)}</strong>
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {sorted.map((p) => {
          const isRefund = p.amount < 0;
          return (
            <div
              key={p.id}
              style={{
                background: "var(--surface-1)",
                borderRadius: "var(--radius-lg)",
                boxShadow: "var(--shadow-sm)",
                padding: "0.75rem 1rem",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 12,
                flexWrap: "wrap",
              }}
            >
              <div>
                <p
                  style={{
                    margin: 0,
                    fontWeight: 500,
                    fontSize: 14,
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  {p.dealTitle || "Ödeme"}
                  {isRefund && <Badge tone="warning">İade</Badge>}
                </p>
                <p style={{ margin: 0, fontSize: 12, color: "var(--text-secondary)" }}>
                  {formatPaymentDate(p.paidAt)}
                </p>
                {showCompany && (
                  <p style={{ margin: 0, fontSize: 12, color: "var(--text-secondary)" }}>
                    {companyNameByCustomerId[p.customerId] || "Bilinmeyen firma"}
                  </p>
                )}
              </div>
              <span
                style={{
                  fontSize: 14,
                  fontWeight: 600,
                  color: isRefund ? "var(--text-danger)" : "var(--text-success)",
                }}
              >
                {isRefund ? "" : "+"}
                {formatTL(p.amount)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PortalGroupClasses({
  groupClasses,
  groupClassEnrollments,
  groupClassWaitlist,
  customerRows,
  showCompany,
  hasActiveMembership,
  getMembershipDeal,
  onEnroll,
  onCancel,
  onJoinWaitlist,
  onLeaveWaitlist,
}) {
  const words = groupClassWords(customerRows[0]?.companySector);
  const companyNameByUserId = Object.fromEntries(
    customerRows.map((c) => [c.userId, c.companyName || c.name]),
  );
  const myCustomerIds = new Set(customerRows.map((c) => c.id));
  const myEnrollments = groupClassEnrollments.filter((e) => myCustomerIds.has(e.customerId));
  const myWaitlistEntries = groupClassWaitlist.filter((w) => myCustomerIds.has(w.customerId));
  const myEnrolledClassIds = new Set(myEnrollments.map((e) => e.groupClassId));
  const enrolled = groupClasses.filter((g) => myEnrolledClassIds.has(g.id));
  const joinable = groupClasses.filter((g) => !myEnrolledClassIds.has(g.id));
  const countFor = (classId) =>
    groupClassEnrollments.filter((e) => e.groupClassId === classId).length;

  const rowStyle = {
    background: "var(--surface-1)",
    borderRadius: "var(--radius-lg)",
    boxShadow: "var(--shadow-sm)",
    padding: "0.75rem 1rem",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    flexWrap: "wrap",
  };

  return (
    <div>
      <p style={{ fontSize: 14, fontWeight: 500, margin: "0 0 8px" }}>Kayıtlı olduklarım</p>
      {enrolled.length === 0 ? (
        <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 20 }}>
          Henüz kayıtlı bir dersiniz yok.
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 }}>
          {enrolled.map((g) => {
            const myEnrollment = myEnrollments.find((e) => e.groupClassId === g.id);
            const hoursLeft =
              (nextWeeklyOccurrence(g.weekday, g.startTime).getTime() - Date.now()) / 3600000;
            const ownerRow = customerRows.find((c) => c.userId === g.userId);
            // Üç ayarı da işletme kendi belirler (İşletme Bilgileri'nde), üçü de
            // opsiyonel: hardBlockHours boşsa varsayılan 2 saat (eski sabit davranış).
            // lateCancelHours boşsa "geç iptal" kavramı hiç yok, sadece hardBlockHours
            // kadar bir tam kilit kalır. strikeLimit boşsa/1 ise geç iptalde HEMEN yanar.
            const hardBlockHours = ownerRow?.companyHardBlockHours ?? 2;
            const lateCancelHours = ownerRow?.companyLateCancelHours;
            const strikeLimit = ownerRow?.companyLateCancelStrikeLimit || 1;
            const canCancel = hoursLeft >= hardBlockHours;
            const isLate = canCancel && lateCancelHours != null && hoursLeft < lateCancelHours;
            const membershipDeal = isLate ? getMembershipDeal(myEnrollment.customerId) : null;
            const nextStrikeCount = membershipDeal
              ? (membershipDeal.lateCancelCount || 0) + 1
              : null;
            const willBurnSession =
              isLate && membershipDeal?.sessionTotal > 0 && nextStrikeCount >= strikeLimit;
            return (
              <div key={g.id} style={rowStyle}>
                <div>
                  <p style={{ margin: 0, fontWeight: 500, fontSize: 14 }}>{g.name}</p>
                  <p style={{ margin: 0, fontSize: 12, color: "var(--text-secondary)" }}>
                    {WEEKDAYS[g.weekday - 1]} {g.startTime}
                    {g.instructorName ? ` · ${g.instructorName}` : ""}
                    {showCompany ? ` · ${companyNameByUserId[g.userId]}` : ""}
                  </p>
                  {isLate && (
                    <p style={{ margin: "2px 0 0", fontSize: 11.5, color: "var(--text-warning)" }}>
                      {willBurnSession
                        ? "Bu süreden az kala iptal ederseniz 1 seansınız düşülür"
                        : membershipDeal?.sessionTotal > 0
                          ? `Bu süreden az kala iptal ederseniz geç iptal sayınız ${nextStrikeCount}/${strikeLimit} olur, ${strikeLimit}. geç iptalden itibaren seans düşer`
                          : "Bu süreden az kala iptal ediyorsunuz"}
                    </p>
                  )}
                  {/* Eskiden sadece span'ın title tooltip'indeydi - dokunmatik
                      ekranda hover olmadığı için mobilde hiç görünmüyordu. */}
                  {!canCancel && (
                    <p style={{ margin: "2px 0 0", fontSize: 11.5, color: "var(--text-muted)" }}>
                      Ders saatine {hardBlockHours} saatten az kaldığı için iptal edilemez
                    </p>
                  )}
                </div>
                {canCancel ? (
                  <button
                    onClick={() =>
                      onCancel(
                        myEnrollment.id,
                        isLate
                          ? {
                              dealId: membershipDeal.id,
                              newLateCancelCount: nextStrikeCount,
                              newSessionUsed: willBurnSession
                                ? (membershipDeal.sessionUsed || 0) + 1
                                : null,
                            }
                          : null,
                      )
                    }
                    style={{ fontSize: 13 }}
                  >
                    İptal Et
                  </button>
                ) : (
                  <span style={{ fontSize: 12, color: "var(--text-muted)" }}>İptal edilemez</span>
                )}
              </div>
            );
          })}
        </div>
      )}

      <p style={{ fontSize: 14, fontWeight: 500, margin: "0 0 8px" }}>Katılabileceklerim</p>
      {joinable.length === 0 ? (
        <p style={{ fontSize: 13, color: "var(--text-muted)" }}>
          Katılabileceğiniz başka ders yok.
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {joinable.map((g) => {
            const count = countFor(g.id);
            const full = count >= g.capacity;
            const myCustomerId = customerRows.find((c) => c.userId === g.userId)?.id;
            const eligible = myCustomerId && hasActiveMembership(myCustomerId);
            const myWaitlistEntry = myWaitlistEntries.find((w) => w.groupClassId === g.id);
            return (
              <div key={g.id} style={rowStyle}>
                <div>
                  <p style={{ margin: 0, fontWeight: 500, fontSize: 14 }}>{g.name}</p>
                  <p style={{ margin: 0, fontSize: 12, color: "var(--text-secondary)" }}>
                    {WEEKDAYS[g.weekday - 1]} {g.startTime}
                    {g.instructorName ? ` · ${g.instructorName}` : ""}
                    {showCompany ? ` · ${companyNameByUserId[g.userId]}` : ""}
                  </p>
                  {!eligible && (
                    <p style={{ margin: "2px 0 0", fontSize: 11.5, color: "var(--text-muted)" }}>
                      {words.portalEligibility}
                    </p>
                  )}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Badge tone={full ? "danger" : "success"}>
                    {count}/{g.capacity} dolu
                  </Badge>
                  {full && eligible ? (
                    myWaitlistEntry ? (
                      <>
                        <Badge tone="warning">Yedek listedesiniz</Badge>
                        <button
                          onClick={() => onLeaveWaitlist(myWaitlistEntry.id)}
                          style={{ fontSize: 13 }}
                        >
                          Vazgeç
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() =>
                          onJoinWaitlist({ groupClassId: g.id, customerId: myCustomerId })
                        }
                        style={{ fontSize: 13 }}
                      >
                        Yedek Listeye Katıl
                      </button>
                    )
                  ) : (
                    <button
                      disabled={full || !eligible}
                      onClick={() => onEnroll({ groupClassId: g.id, customerId: myCustomerId })}
                      style={{ fontSize: 13 }}
                    >
                      Katıl
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// new Date().toISOString() sunucunun/tarayıcının yerel saatini değil UTC'yi
// baz alır — Türkiye'de gece yarısından sonraki ilk birkaç saatte (UTC+3
// farkı yüzünden) "bugün"ü bir gün geriye kaydırıp dünün tarihini min/varsayılan
// olarak veriyordu (aynı sınıf hata api/send-appointment-reminders.js'te de
// bulunup düzeltilmişti). Europe/Istanbul takvim gününü doğrudan hesaplar.
function istanbulDateStr(date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Istanbul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

// AppointmentRequestPage.jsx'teki AYNI fonksiyon (kasıtlı kopya, route bazlı
// kod bölmenin amacını korumak için import edilmedi). "YYYY-MM-DD" -> "Sal",
// "15" gibi kısa gün/tarih etiketleri, müsaitlik şeridindeki her gün butonu için.
function shortDayLabel(dateStr) {
  const d = new Date(`${dateStr}T12:00:00Z`);
  const weekday = new Intl.DateTimeFormat("tr-TR", { weekday: "short" }).format(d);
  return {
    weekday: weekday.charAt(0).toUpperCase() + weekday.slice(1),
    day: String(d.getUTCDate()),
  };
}

// Otel gibi oda-stoklu (bookingModel === "inventory") sektörlerde müsaitlik bir
// SAAT SLOTU değil, GİRİŞ/ÇIKIŞ TARİH ARALIĞI + oda tipi stoku bazlıdır — alanların
// neredeyse tamamı (tarih/saat slotu yerine tarih aralığı, oda tipi seçimi) farklı
// olduğu için ayrı bir bileşene ayrıldı. Bu dispatcher'ın kendisi hiç hook
// çağırmıyor (Rules of Hooks'u ihlal etmeden koşullu dallanabilmek için) —
// gerçek form mantığı SlotBookingModal/RoomBookingModal'da.
// reschedule (opsiyonel): { initialNote, initialServiceIds } — sadece SlotBookingModal
// destekliyor (RoomBookingModal'ın tarih aralığı + oda tipi modeli erteleme
// için henüz kapsanmadı, bkz. PortalDealList'teki bookingModel !== "inventory" kapısı).
function AppointmentBookingModal({ customerRow, priceListItems, onBook, onClose, reschedule }) {
  if (bookingModel(customerRow.companySector) === "inventory") {
    return <RoomBookingModal customerRow={customerRow} onBook={onBook} onClose={onClose} />;
  }
  return (
    <SlotBookingModal
      customerRow={customerRow}
      priceListItems={priceListItems}
      onBook={onBook}
      onClose={onClose}
      reschedule={reschedule}
    />
  );
}

function SlotBookingModal({ customerRow, priceListItems, onBook, onClose, reschedule }) {
  const todayStr = istanbulDateStr(new Date());
  const maxDateStr = istanbulDateStr(new Date(Date.now() + 60 * 24 * 60 * 60 * 1000));
  const [date, setDate] = useState(todayStr);
  const [slots, setSlots] = useState([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [slotsError, setSlotsError] = useState("");
  const [selectedTime, setSelectedTime] = useState("");
  const [note, setNote] = useState(reschedule?.initialNote || "");
  const [serviceIds, setServiceIds] = useState(reschedule?.initialServiceIds || []);
  const [booking, setBooking] = useState(false);
  const [dateTimeKey, setDateTimeKey] = useState(null);
  const [hasPaymentProvider, setHasPaymentProvider] = useState(false);
  const [dayOverview, setDayOverview] = useState(null); // [{ date, slotCount }] - hangi günlerde boşluk olduğunu tek tek denemeden görebilsin diye

  useEffect(() => {
    if (!date || !customerRow.userId) {
      setSlotsError("İşletme bilgisi eksik, müsaitlik sorgulanamadı.");
      return;
    }
    setLoadingSlots(true);
    setSlotsError("");
    setSelectedTime("");
    // serviceIds, sunucunun toplam süreyi hesaplayıp (candidateDuration) sadece
    // TAM saat eşleşmesine değil gerçek aralık çakışmasına bakmasını sağlar -
    // seçim değişince (hizmet eklenip/çıkarılınca) liste yeniden hesaplanmalı,
    // bkz. api/appointment-availability.js computeDaySlots.
    const serviceQuery = serviceIds.length
      ? `&serviceIds=${encodeURIComponent(serviceIds.join(","))}`
      : "";
    fetch(
      `/api/appointment-availability?businessUserId=${customerRow.userId}&date=${date}${serviceQuery}`,
    )
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data?.error || "Müsaitlik alınamadı.");
        setSlots(data.slots || []);
        setDateTimeKey(data.dateTimeKey || null);
        setHasPaymentProvider(!!data.hasPaymentProvider);
      })
      .catch((err) => {
        setSlots([]);
        setSlotsError(err.message || "Müsaitlik alınamadı.");
      })
      .finally(() => setLoadingSlots(false));
  }, [date, customerRow.userId, serviceIds]);

  // Önümüzdeki 14 günün boş saat sayısını TEK istekte çeker - AppointmentRequestPage'teki
  // AYNI mantık (bkz. api/appointment-availability.js overview dalı). date state'inden
  // bağımsız ama serviceIds'e bağımlı - hizmet seçilmeden önce varsayılan (adım)
  // süreyle hesaplanan sayı, seçim değişince o hizmetin gerçek süresine göre
  // yeniden hesaplanmazsa rozet olduğundan iyimser kalabilir.
  useEffect(() => {
    if (!customerRow.userId) return;
    const serviceQuery = serviceIds.length
      ? `&serviceIds=${encodeURIComponent(serviceIds.join(","))}`
      : "";
    fetch(
      `/api/appointment-availability?businessUserId=${customerRow.userId}&overview=14${serviceQuery}`,
    )
      .then((r) => r.json())
      .then((data) => setDayOverview(data.days || []))
      .catch(() => setDayOverview([]));
  }, [customerRow.userId, serviceIds]);

  // 0 TL'lik bir fiyat kalemi "ücretsiz" demek - AppointmentRequestPage.jsx'teki
  // (widget) AYNI ayrım/deseni (kasıtlı kopya) burada da uyguluyoruz, tutarlı olsun.
  const freeServices = (priceListItems || []).filter((s) => Number(s.price) === 0);
  const paidServices = (priceListItems || []).filter((s) => Number(s.price) !== 0);
  // AppointmentRequestPage.jsx'teki AYNI kısıt (kasıtlı kopya) - hizmet
  // tanımlıysa müşteri önce en az birini seçmeden gün/saat adımına geçemez,
  // süre sonradan değişip saat listesi şaşırtıcı şekilde kaymasın.
  const hasServices = freeServices.length > 0 || paidServices.length > 0;
  const canPickTime = !hasServices || serviceIds.length > 0;
  const toggleService = (id) => {
    setServiceIds((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      // Not alanı hâlâ boşsa (kullanıcı henüz kendi notunu yazmadıysa) seçilen
      // hizmetlerin isimleriyle otomatik doldurulur - zorunlu bu alanı her
      // hizmet seçiminde ayrıca elle yazmak zorunda kalmasınlar diye.
      setNote((currentNote) => {
        if (currentNote.trim()) return currentNote;
        const names = (priceListItems || []).filter((p) => next.includes(p.id)).map((p) => p.name);
        return names.length ? names.join(", ") : currentNote;
      });
      return next;
    });
  };
  const stripFreeWord = (name) => {
    const words = (name || "")
      .split(/\s+/)
      .filter((w) => w && w.localeCompare("ücretsiz", "tr", { sensitivity: "base" }) !== 0);
    return words.join(" ").trim() || name || "";
  };
  const selectedTotal = (priceListItems || [])
    .filter((p) => serviceIds.includes(p.id))
    .reduce((sum, p) => sum + (Number(p.price) || 0), 0);
  // api/lead-capture.js'teki groupedDurationMinutes ile AYNI ilke (kasıtlı
  // kopya) - aynı parallel_group'taki hizmetler MAX (eşzamanlı), farklı
  // gruptaki/grupsuz hizmetler SUM (ardışık) alınır.
  const selectedDuration = (() => {
    const groups = new Map();
    (priceListItems || [])
      .filter((p) => serviceIds.includes(p.id))
      .forEach((p, i) => {
        const key = p.parallelGroup || `__solo_${p.id ?? i}`;
        groups.set(key, Math.max(groups.get(key) || 0, Number(p.durationMinutes) || 0));
      });
    return [...groups.values()].reduce((sum, v) => sum + v, 0);
  })();

  const confirm = async () => {
    // Hizmet tanımlıysa (hasServices) yukarıdaki yapılandırılmış seçim zaten
    // "ne için randevu" sorusunu cevaplıyor - not zorunlu değil, sadece ek
    // bilgi. Hiç hizmet tanımlı değilse tek bilgi kaynağı bu alan, zorunlu kalır.
    if (!selectedTime || !dateTimeKey || (!hasServices && !note.trim())) return;
    setBooking(true);
    const ok = await onBook({
      customerId: customerRow.id,
      businessUserId: customerRow.userId,
      dateTime: `${date}T${selectedTime}:00`,
      dateTimeKey,
      note,
      serviceIds,
      hasPaymentProvider,
    });
    setBooking(false);
    if (ok) onClose();
  };

  return (
    <Modal
      title={`${customerRow.companyName || customerRow.name} - ${reschedule ? "Randevunuzu Erteleyin" : "Randevu Al"}`}
      onClose={onClose}
    >
      {priceListItems && priceListItems.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <p
            style={{
              fontSize: 12.5,
              fontWeight: 700,
              color: "var(--text-accent)",
              letterSpacing: 0.3,
              textTransform: "uppercase",
              margin: "0 0 10px",
            }}
          >
            Hizmet Seçin
          </p>
          <label
            style={{
              fontSize: 12.5,
              color: "var(--text-muted)",
              display: "block",
              marginBottom: 6,
            }}
          >
            Opsiyonel, birden fazla seçebilirsiniz
          </label>
          {freeServices.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
              {freeServices.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => toggleService(s.id)}
                  style={{
                    background: serviceIds.includes(s.id)
                      ? "var(--fill-accent)"
                      : "var(--surface-1)",
                    color: serviceIds.includes(s.id) ? "var(--on-accent)" : "var(--text-primary)",
                    border: "0.5px solid var(--border)",
                    fontSize: 12.5,
                    fontWeight: 600,
                    padding: "8px 14px",
                    borderRadius: 999,
                  }}
                >
                  {stripFreeWord(s.name)} - Ücretsiz
                  {s.durationMinutes ? ` · ${s.durationMinutes} dk` : ""}
                </button>
              ))}
            </div>
          )}
          {paidServices.filter((s) => !serviceIds.includes(s.id)).length > 0 && (
            <select
              value=""
              onChange={(e) => {
                if (e.target.value) toggleService(e.target.value);
              }}
              style={{ width: "100%", borderRadius: 10, padding: "10px 12px" }}
            >
              <option value="">Hizmet ekle…</option>
              {paidServices
                .filter((s) => !serviceIds.includes(s.id))
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} - {formatTL(s.price)}
                    {s.durationMinutes ? ` · ${s.durationMinutes} dk` : ""}
                  </option>
                ))}
            </select>
          )}
          {paidServices.filter((s) => serviceIds.includes(s.id)).length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
              {paidServices
                .filter((s) => serviceIds.includes(s.id))
                .map((s) => (
                  <div
                    key={s.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 8,
                      fontSize: 13.5,
                      background: "var(--bg-accent)",
                      border: "0.5px solid var(--border-strong)",
                      borderRadius: 10,
                      padding: "10px 12px",
                    }}
                  >
                    <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>
                      {s.name} - {formatTL(s.price)}
                      {s.durationMinutes ? ` · ${s.durationMinutes} dk` : ""}
                    </span>
                    <button
                      type="button"
                      onClick={() => toggleService(s.id)}
                      style={{ fontSize: 12, padding: "3px 8px", flexShrink: 0, borderRadius: 20 }}
                    >
                      Kaldır
                    </button>
                  </div>
                ))}
            </div>
          )}
          {selectedTotal > 0 && (
            <p
              style={{
                fontSize: 12.5,
                color: "var(--text-secondary)",
                margin: "8px 0 0",
                fontWeight: 600,
              }}
            >
              Toplam: {formatTL(selectedTotal)}
            </p>
          )}
          {selectedDuration > 0 && (
            <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "4px 0 0" }}>
              Tahmini süre: {selectedDuration} dk. Süreler tahminidir, hizmetin seyrine göre
              değişebilir.
            </p>
          )}
        </div>
      )}
      {!canPickTime ? (
        <p
          style={{
            fontSize: 13,
            color: "var(--text-secondary)",
            margin: "0 0 16px",
            textAlign: "center",
          }}
        >
          Gün/saat seçmek için önce yukarıdan bir hizmet seçin.
        </p>
      ) : (
        <>
          {dayOverview && dayOverview.length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <p
                style={{
                  fontSize: 12.5,
                  fontWeight: 700,
                  color: "var(--text-accent)",
                  letterSpacing: 0.3,
                  textTransform: "uppercase",
                  margin: "0 0 10px",
                }}
              >
                Müsait Günler
              </p>
              <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4 }}>
                {dayOverview.map((d) => {
                  const { weekday, day } = shortDayLabel(d.date);
                  const selected = d.date === date;
                  const empty = d.slotCount === 0;
                  return (
                    <button
                      key={d.date}
                      type="button"
                      disabled={empty}
                      onClick={() => setDate(d.date)}
                      style={{
                        flex: "0 0 auto",
                        width: 58,
                        padding: "10px 4px",
                        borderRadius: 12,
                        textAlign: "center",
                        cursor: empty ? "default" : "pointer",
                        border: selected
                          ? "2px solid var(--border-strong)"
                          : "0.5px solid var(--border)",
                        background: selected ? "var(--bg-accent)" : "var(--surface-1)",
                        boxShadow: selected ? "var(--shadow-sm)" : "none",
                        opacity: empty ? 0.45 : 1,
                      }}
                    >
                      <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>{weekday}</div>
                      <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)" }}>
                        {day}
                      </div>
                      <div
                        style={{
                          fontSize: 10,
                          color: empty ? "var(--text-muted)" : "var(--text-success)",
                        }}
                      >
                        {d.closed ? "Kapalı" : empty ? "Dolu" : `${d.slotCount} boş`}
                      </div>
                    </button>
                  );
                })}
              </div>
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
              Ya da farklı bir tarih seçin
            </label>
            <input
              type="date"
              min={todayStr}
              max={maxDateStr}
              value={date}
              onChange={(e) => setDate(e.target.value)}
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
              Saat
            </label>
            {loadingSlots ? (
              <p style={{ fontSize: 13, color: "var(--text-muted)" }}>Yükleniyor…</p>
            ) : slotsError ? (
              <p style={{ fontSize: 13, color: "var(--text-danger)" }}>{slotsError}</p>
            ) : slots.length === 0 ? (
              <p style={{ fontSize: 13, color: "var(--text-muted)" }}>
                Bu tarihte müsait saat yok.
              </p>
            ) : (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {slots.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setSelectedTime(s)}
                    style={{
                      background: selectedTime === s ? "var(--fill-accent)" : "var(--surface-1)",
                      color: selectedTime === s ? "var(--on-accent)" : "var(--text-primary)",
                      border: "0.5px solid var(--border)",
                      borderRadius: 10,
                      fontSize: 13.5,
                      fontWeight: 600,
                      padding: "9px 14px",
                      boxShadow: selectedTime === s ? "var(--shadow-sm)" : "none",
                    }}
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>
        </>
      )}
      <div style={{ marginBottom: 16 }}>
        <label
          style={{
            fontSize: 13,
            color: "var(--text-secondary)",
            display: "block",
            marginBottom: 4,
          }}
        >
          {hasServices ? "Not (opsiyonel)" : "Ne için randevu almak istiyorsunuz?"}
        </label>
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={
            hasServices
              ? "Eklemek istediğiniz bir not varsa yazabilirsiniz"
              : `Örn. ${appointmentNoteExample(customerRow.companySector)}`
          }
          style={{ width: "100%" }}
        />
      </div>
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button type="button" onClick={onClose}>
          Vazgeç
        </button>
        <button
          type="button"
          disabled={!selectedTime || !dateTimeKey || (!hasServices && !note.trim()) || booking}
          onClick={confirm}
          style={{ background: "var(--fill-accent)", color: "var(--on-accent)", border: "none" }}
        >
          {booking
            ? reschedule
              ? "Erteleniyor…"
              : "Alınıyor…"
            : reschedule
              ? "Ertele"
              : "Randevuyu Onayla"}
        </button>
      </div>
    </Modal>
  );
}

// Sectors.jsx'teki "otel" preset'inin ziyaret_amaci alanıyla AYNI liste — KOBİ
// tarafında CustomFieldsSection ile otomatik gelirken, portalda genel özel alan
// render'ı olmadığı (custom_field_defs portala hiç açılmıyor) için burada elle
// tutuluyor. İkisi birden değişirse ikisini de güncellemeyi unutma.
const VISIT_PURPOSE_OPTIONS = [
  "Belirtilmedi",
  "Tatil",
  "İş seyahati",
  "Balayı",
  "Evlilik yıldönümü",
  "Doğum günü",
  "Evlilik teklifi",
  "Toplantı/Organizasyon",
  "Diğer",
];

function RoomBookingModal({ customerRow, onBook, onClose }) {
  const todayStr = istanbulDateStr(new Date());
  const tomorrowStr = istanbulDateStr(new Date(Date.now() + 24 * 60 * 60 * 1000));
  const maxDateStr = istanbulDateStr(new Date(Date.now() + 60 * 24 * 60 * 60 * 1000));
  const [checkIn, setCheckIn] = useState(todayStr);
  const [checkOut, setCheckOut] = useState(tomorrowStr);
  const [arrivalTime, setArrivalTime] = useState("14:00");
  const [partySize, setPartySize] = useState(1);
  const [rooms, setRooms] = useState([]);
  const [loadingRooms, setLoadingRooms] = useState(false);
  const [roomsError, setRoomsError] = useState("");
  const [selectedRoomType, setSelectedRoomType] = useState("");
  const [note, setNote] = useState("");
  const [visitPurpose, setVisitPurpose] = useState("");
  const [booking, setBooking] = useState(false);

  // Giriş tarihi çıkıştan sonraya çekilirse çıkışı da otomatik bir gün ileri
  // alır — kullanıcı elle her seferinde ikisini de güncellemek zorunda kalmasın.
  useEffect(() => {
    if (checkOut <= checkIn) {
      setCheckOut(
        istanbulDateStr(new Date(new Date(`${checkIn}T00:00:00`).getTime() + 24 * 60 * 60 * 1000)),
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkIn]);

  useEffect(() => {
    if (!checkIn || !checkOut || checkOut <= checkIn || !customerRow.userId) {
      setRooms([]);
      setSelectedRoomType("");
      return;
    }
    setLoadingRooms(true);
    setRoomsError("");
    setSelectedRoomType("");
    fetch(
      `/api/appointment-availability?businessUserId=${customerRow.userId}&checkIn=${checkIn}&checkOut=${checkOut}`,
    )
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data?.error || "Müsaitlik alınamadı.");
        setRooms(data.rooms || []);
      })
      .catch((err) => {
        setRooms([]);
        setRoomsError(err.message || "Müsaitlik alınamadı.");
      })
      .finally(() => setLoadingRooms(false));
  }, [checkIn, checkOut, customerRow.userId]);

  const confirm = async () => {
    if (!selectedRoomType) return;
    setBooking(true);
    const ok = await onBook({
      customerId: customerRow.id,
      businessUserId: customerRow.userId,
      checkIn: `${checkIn}T${arrivalTime}:00`,
      checkOut,
      roomType: selectedRoomType,
      partySize: Number(partySize) || 1,
      note,
      visitPurpose,
    });
    setBooking(false);
    if (ok) onClose();
  };

  const availableRooms = rooms.filter((r) => r.available);

  return (
    <Modal
      title={`${customerRow.companyName || customerRow.name} - Rezervasyon Yap`}
      onClose={onClose}
    >
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
            Giriş tarihi
          </label>
          <input
            type="date"
            min={todayStr}
            max={maxDateStr}
            value={checkIn}
            onChange={(e) => setCheckIn(e.target.value)}
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
            Çıkış tarihi
          </label>
          <input
            type="date"
            min={checkIn}
            value={checkOut}
            onChange={(e) => setCheckOut(e.target.value)}
            style={{ width: "100%" }}
          />
        </div>
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
            Tahmini varış saati{" "}
            <span style={{ fontWeight: 400, color: "var(--text-muted)" }}>(opsiyonel)</span>
          </label>
          <input
            type="time"
            value={arrivalTime}
            onChange={(e) => setArrivalTime(e.target.value)}
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
            Kişi sayısı
          </label>
          <input
            type="number"
            min="1"
            value={partySize}
            onChange={(e) => setPartySize(e.target.value)}
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
            marginBottom: 6,
          }}
        >
          Oda Tipi
        </label>
        {loadingRooms ? (
          <p style={{ fontSize: 13, color: "var(--text-muted)" }}>Yükleniyor…</p>
        ) : roomsError ? (
          <p style={{ fontSize: 13, color: "var(--text-danger)" }}>{roomsError}</p>
        ) : availableRooms.length === 0 ? (
          <p style={{ fontSize: 13, color: "var(--text-muted)" }}>
            Bu tarihler için müsait oda yok.
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {availableRooms.map((r) => (
              <button
                key={r.roomType}
                type="button"
                onClick={() => setSelectedRoomType(r.roomType)}
                style={{
                  textAlign: "left",
                  background:
                    selectedRoomType === r.roomType ? "var(--fill-accent)" : "var(--surface-1)",
                  color:
                    selectedRoomType === r.roomType ? "var(--on-accent)" : "var(--text-primary)",
                  border: "0.5px solid var(--border)",
                  fontSize: 13,
                  padding: "8px 10px",
                  borderRadius: 8,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                  <span style={{ fontWeight: 600 }}>
                    {r.roomType}
                    {r.capacity ? ` · ${r.capacity} kişilik` : ""}
                  </span>
                  <span style={{ fontSize: 12, opacity: 0.85 }}>
                    {r.remaining}/{r.quantity} müsait
                  </span>
                </div>
                {r.description && (
                  <p style={{ margin: "3px 0 0", fontSize: 12, opacity: 0.85 }}>{r.description}</p>
                )}
              </button>
            ))}
          </div>
        )}
        {selectedRoomType &&
          (() => {
            const room = availableRooms.find((r) => r.roomType === selectedRoomType);
            if (!room?.capacity || Number(partySize) <= room.capacity) return null;
            return (
              <p style={{ fontSize: 12, color: "var(--text-warning, #b45309)", margin: "6px 0 0" }}>
                Seçtiğiniz oda {room.capacity} kişilik - kişi sayınız bunu aşıyor, işletmeyle
                iletişime geçmeniz gerekebilir.
              </p>
            );
          })()}
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
          Ziyaret Amacı / Özel Gün{" "}
          <span style={{ fontWeight: 400, color: "var(--text-muted)" }}>(opsiyonel)</span>
        </label>
        <select
          value={visitPurpose}
          onChange={(e) => setVisitPurpose(e.target.value)}
          style={{ width: "100%" }}
        >
          <option value="">Seçiniz</option>
          {VISIT_PURPOSE_OPTIONS.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
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
          Not <span style={{ fontWeight: 400, color: "var(--text-muted)" }}>(opsiyonel)</span>
        </label>
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Eklemek istediğiniz bir not varsa yazın"
          style={{ width: "100%" }}
        />
      </div>
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button type="button" onClick={onClose}>
          Vazgeç
        </button>
        <button
          type="button"
          disabled={!selectedRoomType || booking}
          onClick={confirm}
          style={{ background: "var(--fill-accent)", color: "var(--on-accent)", border: "none" }}
        >
          {booking ? "Alınıyor…" : "Rezervasyonu Onayla"}
        </button>
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
    if (newPassword.length < 6) {
      notify("Şifre en az 6 karakter olmalı.");
      return;
    }
    if (newPassword !== confirmPassword) {
      notify("Şifreler eşleşmiyor.");
      return;
    }
    setSaving(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setSaving(false);
    if (error) {
      notify(`Şifre güncellenemedi: ${translateAuthError(error.message)}`);
      return;
    }
    notify("Şifreniz güncellendi.", "success");
    onClose();
  };

  return (
    <Modal title="Yeni şifre belirleyin" onClose={onClose}>
      <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: "0 0 16px" }}>
        Sıfırlama bağlantısına tıkladınız - hesabınız için yeni bir şifre belirleyin.
      </p>
      <form onSubmit={submit}>
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
            autoFocus
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
            Yeni şifre (tekrar)
          </label>
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            style={{ width: "100%" }}
          />
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button
            type="submit"
            disabled={saving || !newPassword}
            style={{ background: "var(--fill-accent)", color: "var(--on-accent)", border: "none" }}
          >
            {saving ? "Kaydediliyor…" : "Şifreyi kaydet"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function PortalSettings({
  section,
  session,
  theme,
  onThemeChange,
  pushSubscribed,
  onSubscribe,
  onUnsubscribe,
  marketingConsent,
  onMarketingConsentChange,
  companyName,
  companySector,
  photoConsent,
  onPhotoConsentChange,
  customerName,
  customerPhone,
  customerEmail,
  onUpdateProfile,
  notify,
}) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);

  const [profileName, setProfileName] = useState(customerName || "");
  const [profilePhone, setProfilePhone] = useState(customerPhone || "");
  const [profileEmail, setProfileEmail] = useState(customerEmail || "");
  const [savingProfile, setSavingProfile] = useState(false);
  // Firma değişince (çoklu işletmeli portalda) alanlar o firmanın kendi
  // bilgileriyle yeniden doldurulmalı — yoksa önceki firmanın taslak
  // değerleri yanlışlıkla yeni firmaya kaydedilebilir.
  useEffect(() => {
    setProfileName(customerName || "");
    setProfilePhone(customerPhone || "");
    setProfileEmail(customerEmail || "");
  }, [customerName, customerPhone, customerEmail]);
  const profileDirty =
    profileName.trim() !== (customerName || "") ||
    profilePhone.trim() !== (customerPhone || "") ||
    profileEmail.trim() !== (customerEmail || "");

  const saveProfile = async (e) => {
    e.preventDefault();
    if (!profileName.trim()) {
      notify("Ad Soyad boş olamaz.");
      return;
    }
    if (!profilePhone.trim() && !profileEmail.trim()) {
      notify("Telefon veya e-postadan en az biri gerekli.");
      return;
    }
    setSavingProfile(true);
    await onUpdateProfile({ name: profileName, phone: profilePhone, email: profileEmail });
    setSavingProfile(false);
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
    <div>
      {section === "profile" && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
            <InitialsAvatar name={customerName || session.user.email} size={48} />
            <div>
              <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "var(--text-primary)" }}>
                {customerName || session.user.email}
              </p>
              <p style={{ margin: 0, fontSize: 12, color: "var(--text-secondary)" }}>
                {companyName ? `${companyName} müşterisi` : "Profil"}
              </p>
            </div>
          </div>
          <p style={{ fontSize: 13, fontWeight: 500, margin: "0 0 8px" }}>
            Bilgilerim{companyName ? ` (${companyName})` : ""}
          </p>
          <form onSubmit={saveProfile}>
            <div style={{ marginBottom: 8 }}>
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
                value={profileName}
                onChange={(e) => setProfileName(e.target.value)}
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
                Telefon
              </label>
              <input
                type="tel"
                value={profilePhone}
                onChange={(e) => setProfilePhone(e.target.value)}
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
                E-posta
              </label>
              <input
                type="email"
                value={profileEmail}
                onChange={(e) => setProfileEmail(e.target.value)}
                style={{ width: "100%" }}
              />
            </div>
            <button
              type="submit"
              disabled={savingProfile || !profileDirty}
              style={{
                background: "var(--fill-accent)",
                color: "var(--on-accent)",
                border: "none",
                fontSize: 13,
              }}
            >
              {savingProfile ? "Kaydediliyor…" : "Kaydet"}
            </button>
          </form>
          <p style={{ fontSize: 11, color: "var(--text-muted)", margin: "8px 0 0" }}>
            Birden fazla işletmeye bağlıysanız, bu bilgiler sadece şu an seçili olan işletme için
            geçerlidir.
          </p>
        </div>
      )}

      {section === "account" && (
        <>
          <div style={{ marginBottom: 20, paddingTop: 16, borderTop: "0.5px solid var(--border)" }}>
            <p style={{ fontSize: 13, fontWeight: 500, margin: "0 0 8px" }}>Görünüm</p>
            <SegmentedControl value={theme} onChange={onThemeChange} options={THEME_OPTIONS} />
          </div>

          <div style={{ marginBottom: 20, paddingTop: 16, borderTop: "0.5px solid var(--border)" }}>
            <p style={{ fontSize: 13, fontWeight: 500, margin: "0 0 8px" }}>Bildirimler</p>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>
                Firma size yanıt verdiğinde anında bildirim
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

          <div style={{ marginBottom: 20, paddingTop: 16, borderTop: "0.5px solid var(--border)" }}>
            <p style={{ fontSize: 11, color: "var(--text-muted)", margin: "0 0 12px" }}>
              Bilgileriniz {companyName || "bu işletme"} tarafından yalnızca hizmet/randevu takibi
              amacıyla saklanır ve işlenir. Aşağıdaki izinler bunun dışında, dilediğiniz zaman
              değiştirebileceğiniz ek tercihlerdir.
            </p>
            <p style={{ fontSize: 13, fontWeight: 500, margin: "0 0 8px" }}>Pazarlama İzni</p>
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              <input
                type="checkbox"
                checked={!!marketingConsent}
                onChange={(e) => onMarketingConsentChange(e.target.checked)}
              />
              Bu işletmeden kampanya ve değerlendirme isteği gibi e-postalar almak istiyorum
            </label>
            <p style={{ fontSize: 11, color: "var(--text-muted)", margin: "8px 0 0" }}>
              Bu izin dilediğiniz zaman geri çekilebilir. Birden fazla işletmeye bağlıysanız, sadece
              şu an seçili olan işletme için geçerlidir.
            </p>
          </div>

          {isAppointmentSector(companySector) && (
            <div
              style={{ marginBottom: 20, paddingTop: 16, borderTop: "0.5px solid var(--border)" }}
            >
              <p style={{ fontSize: 13, fontWeight: 500, margin: "0 0 8px" }}>Fotoğraf İzni</p>
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  fontSize: 13,
                  cursor: "pointer",
                }}
              >
                <input
                  type="checkbox"
                  checked={!!photoConsent}
                  onChange={(e) => onPhotoConsentChange(e.target.checked)}
                />
                Hizmet öncesi/sonrası fotoğraflarımın çekilip saklanmasına izin veriyorum
              </label>
              <p style={{ fontSize: 11, color: "var(--text-muted)", margin: "8px 0 0" }}>
                Bu izin dilediğiniz zaman geri çekilebilir. Birden fazla işletmeye bağlıysanız,
                sadece şu an seçili olan işletme için geçerlidir.
              </p>
            </div>
          )}

          <div style={{ paddingTop: 16, borderTop: "0.5px solid var(--border)" }}>
            <p style={{ fontSize: 13, fontWeight: 500, margin: "0 0 8px" }}>Hesap</p>
            <form onSubmit={changePassword}>
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
          </div>
        </>
      )}
    </div>
  );
}

export default function CustomerPortal() {
  const [session, setSession] = useState(undefined);
  const [portalTab, setPortalTab] = useState("talepler");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [tickets, setTickets] = useState([]);
  const [ticketMessages, setTicketMessages] = useState([]);
  const [deals, setDeals] = useState([]);
  const [payments, setPayments] = useState([]);
  const [customerRows, setCustomerRows] = useState([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState(
    () => localStorage.getItem("binerly_portal_company") || null,
  );
  const [groupClasses, setGroupClasses] = useState([]);
  const [groupClassEnrollments, setGroupClassEnrollments] = useState([]);
  const [groupClassWaitlist, setGroupClassWaitlist] = useState([]);
  const [priceListItems, setPriceListItems] = useState([]);
  const [sharedAttachments, setSharedAttachments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showNewTicketForm, setShowNewTicketForm] = useState(false);
  const [bookingFor, setBookingFor] = useState(null);
  const [reschedulingDeal, setReschedulingDeal] = useState(null);
  const [viewingTicket, setViewingTicket] = useState(null);
  const [toast, setToast] = useState(null);
  const [pushSubscribed, setPushSubscribed] = useState(false);
  const [theme, setTheme] = useTheme();
  const [showPasswordRecovery, setShowPasswordRecovery] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(null); // { type: "appointment" | "enrollment", id }
  const [loadError, setLoadError] = useState(false);

  const notify = (message, tone = "danger") =>
    setToast({ message: humanizeDbMessage(message), tone });

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(timer);
  }, [toast]);

  useSessionTimeout(session, () => {
    supabase.auth.signOut();
    alert("Oturumunuz uzun süre hareketsiz kaldığı için sona erdi. Lütfen tekrar giriş yapın.");
  });

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      if (event === "PASSWORD_RECOVERY") setShowPasswordRecovery(true);
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session || !("serviceWorker" in navigator)) {
      setPushSubscribed(false);
      return;
    }
    navigator.serviceWorker.ready
      .then((registration) => registration.pushManager.getSubscription())
      .then((sub) => setPushSubscribed(!!sub))
      .catch(() => {});
  }, [session]);

  // Bildirime tıklanınca gelen ?ticket= derin bağlantısı — talepler yüklendikten
  // sonra bir kere işlenir, sonra URL'den temizlenir.
  useEffect(() => {
    if (tickets.length === 0) return;
    const params = new URLSearchParams(window.location.search);
    const ticketId = params.get("ticket");
    if (!ticketId) return;
    const t = tickets.find((x) => x.id === ticketId);
    if (t) {
      if (t.isGeneralChat) setPortalTab("mesajlar");
      else setViewingTicket(t);
    }
    const url = new URL(window.location.href);
    url.searchParams.delete("ticket");
    window.history.replaceState({}, "", url);
  }, [tickets]);

  // Tek firmaya bağlı müşteriler hiçbir seçim ekranı görmeden doğrudan portale
  // düşer — otomatik seçim sadece bağlı firma sayısı 1 olduğunda tetiklenir.
  useEffect(() => {
    if (customerRows.length === 1 && !customerRows.some((r) => r.id === selectedCompanyId)) {
      setSelectedCompanyId(customerRows[0].id);
    }
  }, [customerRows]); // eslint-disable-line react-hooks/exhaustive-deps

  // "Mesajlar" sohbetinin sayfa yenilenmeden anlık gelmesi için — App.jsx'teki
  // payments/deals canlı senkronuyla (live-${activeTeamId} kanalı) aynı desen,
  // burada seçili firmanın user_id'sine göre filtreleniyor. ticket_messages'ın
  // select RLS'i zaten sadece bu müşterinin kendi taleplerine izin veriyor.
  useEffect(() => {
    const row = customerRows.find((r) => r.id === selectedCompanyId);
    if (!row) return;
    const channel = supabase
      .channel(`portal-messages-${row.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "ticket_messages",
          filter: `user_id=eq.${row.userId}`,
        },
        (payload) => {
          setTicketMessages((prev) =>
            prev.some((m) => m.id === payload.new.id)
              ? prev
              : [...prev, rowToTicketMessage(payload.new)],
          );
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [customerRows, selectedCompanyId]);

  useEffect(() => {
    if (selectedCompanyId) localStorage.setItem("binerly_portal_company", selectedCompanyId);
    else localStorage.removeItem("binerly_portal_company");
  }, [selectedCompanyId]);

  // Firma değişince önceki firmada açık kalmış olabilecek sekme/modal durumu
  // yeni firmada anlamsız olabilir (örn. sadece eski firmada var olan "dersler"
  // sekmesi) — bu yüzden temiz bir başlangıç yapılır.
  useEffect(() => {
    setPortalTab("talepler");
    setBookingFor(null);
    setViewingTicket(null);
    setShowNewTicketForm(false);
  }, [selectedCompanyId]);

  useEffect(() => {
    if (!session) {
      setTickets([]);
      setTicketMessages([]);
      setDeals([]);
      setPayments([]);
      setCustomerRows([]);
      setGroupClasses([]);
      setGroupClassEnrollments([]);
      setPriceListItems([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError(false);
    (async () => {
      try {
        await supabase
          .from("customer_portal_users")
          .upsert(
            { id: session.user.id, email: session.user.email },
            { onConflict: "id", ignoreDuplicates: true },
          );
        await supabase
          .from("customers")
          .update({ portal_user_id: session.user.id })
          .is("portal_user_id", null)
          .is("deleted_at", null)
          .ilike("email", session.user.email);

        // Önce sadece kendi bağlı müşteri kayıtlarımızı öğreniyoruz, sonra tickets/ticket_messages
        // sorgularını bilerek bu customer_id'lerle sınırlıyoruz — RLS'e tek başına güvenmiyoruz,
        // çünkü aynı hesap hem şirket sahibi hem müşteri ise RLS politikaları "veya" ile birleşip
        // şirketin TÜM taleplerini de döndürebilir. Bu ekstra filtre buna karşı bir güvenlik katmanı.
        const { data: c, error: profileError } = await supabase
          .from("customer_profile_view")
          .select("*");
        if (profileError) {
          // Burada sessizce customerRows=[] set edilirse müşteriye "hesabınız hiçbir
          // firmayla eşleşmedi" gibi YANLIŞ bir mesaj gösterilir — oysa asıl sebep
          // geçici bir ağ/DB hatası olabilir. Ayrı bir hata durumu gösteriyoruz.
          console.error("customer_profile_view load error:", profileError.message);
          setLoadError(true);
          return;
        }
        const rows = (c || []).map((r) => ({
          id: r.id,
          userId: r.user_id,
          name: r.name,
          phone: r.phone,
          email: r.email,
          companyName: r.company_name,
          companySector: r.company_sector,
          companyLateCancelHours: r.company_late_cancel_hours ?? null,
          companyHardBlockHours: r.company_hard_block_hours ?? null,
          companyLateCancelStrikeLimit: r.company_late_cancel_strike_limit ?? null,
          companyAppointmentCancelHours: r.company_appointment_cancel_hours ?? null,
          companyAppointmentPenaltyHours: r.company_appointment_penalty_hours ?? null,
          companyAppointmentPenaltyStrikeLimit: r.company_appointment_penalty_strike_limit ?? null,
          companyAppointmentPenaltyBurnsSession:
            r.company_appointment_penalty_burns_session === true,
          companyAppointmentPartialChargeHours: r.company_appointment_partial_charge_hours ?? null,
          marketingConsent: r.marketing_consent === true,
          marketingConsentAt: r.marketing_consent_at || null,
          photoConsent: r.photo_consent === true,
          photoConsentAt: r.photo_consent_at || null,
        }));
        setCustomerRows(rows);
        const customerIds = rows.map((r) => r.id);

        if (customerIds.length === 0) {
          setTickets([]);
          setTicketMessages([]);
          setDeals([]);
          setPayments([]);
          setGroupClasses([]);
          setGroupClassEnrollments([]);
          setPriceListItems([]);
          return;
        }

        const businessUserIds = [...new Set(rows.map((r) => r.userId))];

        const [
          { data: t, error: tError },
          { data: d, error: dError },
          { data: gce, error: gceError },
          { data: gc, error: gcError },
          { data: pli, error: pliError },
          { data: pay, error: payError },
        ] = await Promise.all([
          supabase
            .from("tickets")
            .select("*")
            .is("deleted_at", null)
            .in("customer_id", customerIds)
            .order("created_at"),
          // Diğer sorgular gibi (tickets/group_classes) customer_id ile bilerek
          // sınırlanıyor — RLS'e tek başına güvenmeme prensibi (yukarıdaki yorum)
          // burada da geçerli.
          supabase
            .from("customer_deal_view")
            .select("*")
            .in("customer_id", customerIds)
            .order("created_at"),
          supabase.from("group_class_enrollments").select("*").in("customer_id", customerIds),
          supabase
            .from("group_classes")
            .select("*")
            .is("deleted_at", null)
            .in("user_id", businessUserIds)
            .order("weekday")
            .order("start_time"),
          supabase
            .from("price_list_items")
            .select("*")
            .in("user_id", businessUserIds)
            .order("name"),
          supabase.from("customer_payments_view").select("*").in("customer_id", customerIds),
        ]);
        const firstError = tError || dError || gceError || gcError || pliError;
        if (firstError) {
          console.error("customer portal data load error:", firstError.message);
          setLoadError(true);
        }
        // payError bilerek firstError'a dahil edilmedi — customer_payments_view
        // henüz oluşturulmamışsa (yeni migration çalıştırılmadan önce) "Ödemelerim"
        // sekmesi boş görünsün, portalın geri kalanı tam bir hata ekranına düşmesin.
        if (payError) console.error("customer_payments_view load error:", payError.message);
        setGroupClassEnrollments((gce || []).map(rowToGroupClassEnrollment));
        setGroupClasses((gc || []).map(rowToGroupClass));
        // Yedek liste — RLS zaten sadece BENİM (portal_user_id=auth.uid()) müşteri
        // kayıtlarıma ait satırları döndürüyor, .in() burada ek bir gereklilik değil
        // ama diğer sorgularla aynı savunmacı deseni koruyoruz.
        const { data: gcw } = await supabase
          .from("group_class_waitlist")
          .select("*")
          .in("customer_id", customerIds);
        setGroupClassWaitlist((gcw || []).map(rowToWaitlistEntry));
        setPriceListItems((pli || []).map(rowToPriceListItem));
        setPayments((pay || []).map(rowToPayment));
        const ticketIds = (t || []).map((row) => row.id);
        const { data: tm, error: tmError } = ticketIds.length
          ? await supabase
              .from("ticket_messages")
              .select("*")
              .eq("is_internal", false)
              .in("ticket_id", ticketIds)
              .order("created_at")
          : { data: [] };
        if (tmError) console.error("ticket_messages load error:", tmError.message);

        setTickets((t || []).map(rowToTicket));
        setTicketMessages((tm || []).map(rowToTicketMessage));
        setDeals((d || []).map(rowToDeal));

        // İşletmenin açıkça "Müşteriyle Paylaş" dediği dosyalar - RLS zaten
        // shared_with_customer=true VE kendi deal'i şartını uyguluyor (bkz.
        // sql/2026-07-31_attachment_customer_sharing.sql), .in() diğer
        // sorgularla aynı savunmacı desen.
        const dealIds = (d || []).map((row) => row.id);
        const { data: att } = dealIds.length
          ? await supabase
              .from("attachments")
              .select("*")
              .eq("entity_type", "deals")
              .eq("shared_with_customer", true)
              .in("entity_id", dealIds)
          : { data: [] };
        setSharedAttachments((att || []).map(rowToPortalAttachment));
      } catch (err) {
        console.error("customer portal load fatal error:", err.message);
        setLoadError(true);
      } finally {
        setLoading(false);
      }
    })();
  }, [session]);

  const createTicket = async ({ customerId, subject, description }) => {
    const row = customerRows.find((c) => c.id === customerId);
    if (!row) return;
    const { data, error } = await supabase
      .from("tickets")
      .insert({
        user_id: row.userId,
        customer_id: customerId,
        subject,
        description,
        priority: "orta",
        status: "acik",
      })
      .select()
      .single();
    if (error) {
      notify(`Talep gönderilemedi: ${error.message}`);
      return;
    }
    setTickets((prev) => [...prev, rowToTicket(data)]);
    setShowNewTicketForm(false);

    // Talebin açıklamasını ilk "gelen" mesaj olarak da kaydediyoruz — böylece
    // yeni bir talep açmak da (var olan bir talebe yazmak gibi) okunmamış-mesaj
    // rozetini ve anlık bildirimi tetikliyor; yoksa müşterinin ilk teması sessiz kalırdı.
    const { data: msgData, error: msgError } = await supabase
      .from("ticket_messages")
      .insert({
        user_id: row.userId,
        ticket_id: data.id,
        direction: "gelen",
        is_internal: false,
        content: description || subject,
      })
      .select()
      .single();
    if (!msgError) setTicketMessages((prev) => [...prev, rowToTicketMessage(msgData)]);
  };

  const activeMembershipDeal = (customerId) =>
    deals.find((d) => {
      if (d.customerId !== customerId || d.stage !== "kazanildi") return false;
      const endDate = d.customFields?.uyelik_bitis_tarihi ?? d.customFields?.kurs_bitis_tarihi;
      return !endDate || endDate >= new Date().toISOString().slice(0, 10);
    });
  const hasActiveMembership = (customerId) => !!activeMembershipDeal(customerId);

  const enrollInClass = async ({ groupClassId, customerId }) => {
    const row = customerRows.find((c) => c.id === customerId);
    const group = groupClasses.find((g) => g.id === groupClassId);
    if (!row || !group) return;
    if (!hasActiveMembership(customerId)) {
      notify(groupClassWords(row.companySector).portalEligibility);
      return;
    }
    const count = groupClassEnrollments.filter((e) => e.groupClassId === groupClassId).length;
    if (count >= group.capacity) {
      notify("Bu ders dolu.");
      return;
    }
    if (
      groupClassEnrollments.some(
        (e) => e.groupClassId === groupClassId && e.customerId === customerId,
      )
    ) {
      notify("Zaten kayıtlısınız.");
      return;
    }
    const { data, error } = await supabase
      .from("group_class_enrollments")
      .insert({
        id: uid(),
        user_id: row.userId,
        group_class_id: groupClassId,
        customer_id: customerId,
      })
      .select()
      .single();
    if (error) {
      notify(`Derse katılamadınız: ${error.message}`);
      return;
    }
    setGroupClassEnrollments((prev) => [...prev, rowToGroupClassEnrollment(data)]);
    notify("Derse kaydınız yapıldı.", "success");
  };

  // burn: { dealId, newSessionUsed } — işletme "geç iptalde seans yakma" süresini
  // ayarladıysa ve bu, paketli bir üyeliğin kesim süresinden az kala yapılan bir
  // iptalse doldurulur (bkz. PortalGroupClasses). Ayarlanmadıysa (varsayılan)
  // hiçbir şey yanmaz — sadece kayıt silinir, önceki davranışla birebir aynı.
  const joinWaitlist = async ({ groupClassId, customerId }) => {
    const row = {
      id: uid(),
      user_id: customerRows.find((c) => c.id === customerId)?.userId,
      group_class_id: groupClassId,
      customer_id: customerId,
    };
    const { data, error } = await supabase
      .from("group_class_waitlist")
      .insert(row)
      .select()
      .single();
    if (error) {
      notify(`Yedek listeye eklenemedi: ${error.message}`);
      return;
    }
    setGroupClassWaitlist((prev) => [...prev, rowToWaitlistEntry(data)]);
    notify(
      "Yedek listeye eklendiniz - yer açılınca otomatik veya işletme tarafından eklenebilirsiniz.",
      "success",
    );
  };

  const leaveWaitlist = async (waitlistId) => {
    const { error } = await supabase.from("group_class_waitlist").delete().eq("id", waitlistId);
    if (error) {
      notify(`Yedek listeden çıkılamadı: ${error.message}`);
      return;
    }
    setGroupClassWaitlist((prev) => prev.filter((w) => w.id !== waitlistId));
  };

  // burn: { dealId, newLateCancelCount, newSessionUsed } — işletme geç iptal
  // politikasını ayarladıysa ve bu, o politikanın "geç" saydığı süreden az kala
  // yapılan bir iptalse doldurulur (bkz. PortalGroupClasses). newLateCancelCount
  // her geç iptalde artar (sayaç); newSessionUsed SADECE strike limitine
  // ulaşıldıysa dolu gelir (null ise seans düşürülmez, sadece sayaç artar).
  // Hiçbir politika ayarlanmadıysa (varsayılan) burn hep null — önceki
  // davranışla birebir aynı.
  const cancelEnrollment = async (enrollmentId, burn) => {
    const { error } = await supabase
      .from("group_class_enrollments")
      .delete()
      .eq("id", enrollmentId);
    if (error) {
      notify(`İptal edilemedi: ${error.message}`);
      return;
    }
    setGroupClassEnrollments((prev) => prev.filter((e) => e.id !== enrollmentId));
    if (burn) {
      const update = { late_cancel_count: burn.newLateCancelCount };
      if (burn.newSessionUsed != null) update.session_used = burn.newSessionUsed;
      const { error: burnError } = await supabase
        .from("deals")
        .update(update)
        .eq("id", burn.dealId);
      if (!burnError) {
        setDeals((prev) =>
          prev.map((d) =>
            d.id === burn.dealId
              ? {
                  ...d,
                  lateCancelCount: burn.newLateCancelCount,
                  ...(burn.newSessionUsed != null ? { sessionUsed: burn.newSessionUsed } : {}),
                }
              : d,
          ),
        );
      }
    }
    notify(
      burn?.newSessionUsed != null
        ? "Kaydınız iptal edildi, 1 seansınız düşüldü."
        : "Kaydınız iptal edildi.",
      "success",
    );
  };

  const bookAppointment = async ({
    customerId,
    businessUserId,
    dateTime,
    dateTimeKey,
    note,
    serviceIds,
    hasPaymentProvider,
    checkIn,
    checkOut,
    roomType,
    partySize,
    visitPurpose,
  }) => {
    // Otel gibi oda-stoklu (bookingModel === "inventory") sektörlerde RoomBookingModal
    // dateTime/dateTimeKey yerine checkIn/checkOut/roomType gönderiyor — saat slotu
    // yerine giriş/çıkış tarih aralığı + oda tipi yazılıyor. Kayıt SUNUCU
    // TARAFINDA (api/appointment-availability.js POST) atılır - önceden doğrudan
    // istemciden insert ediliyordu, oda kapasitesi HİÇ kontrol edilmiyordu.
    if (checkIn) {
      if (new Date(checkIn).getTime() < Date.now()) {
        notify("Geçmiş bir tarih için rezervasyon alınamaz.");
        return false;
      }
      const {
        data: { session: roomSession },
      } = await supabase.auth.getSession();
      const roomRes = await fetch("/api/appointment-availability", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${roomSession?.access_token || ""}`,
        },
        body: JSON.stringify({
          customerId,
          businessUserId,
          note,
          checkIn,
          checkOut,
          roomType,
          partySize,
          visitPurpose,
        }),
      });
      const roomResult = await roomRes.json().catch(() => ({}));
      if (!roomRes.ok) {
        notify(roomResult.error || "Rezervasyon alınamadı.");
        return false;
      }
      setDeals((prev) => [...prev, rowToDeal(roomResult.deal)]);
      notify("Rezervasyonunuz alındı.", "success");
      return true;
    }
    // Müsaitlik uç noktası geçmiş tarihler için zaten boş liste dönüyor, ama
    // asıl kayıt SUNUCU TARAFINDA (api/appointment-availability.js POST) atılır —
    // önceden bu insert doğrudan istemciden gidiyordu (RLS sadece sahiplik
    // kontrol ediyor, ne çift-randevuyu ne de fiyat listesi tutarını
    // doğruluyor). Portal kullanıcısı RLS gereği başka müşterilerin
    // randevularını göremediği için (bkz. api dosyasındaki GET yorumu) çift-
    // randevu kontrolü zaten client-side yapılamazdı — service_role gerekir.
    if (new Date(dateTime).getTime() < Date.now()) {
      notify("Geçmiş bir tarih/saat için randevu alınamaz.");
      return false;
    }
    const {
      data: { session: currentSession },
    } = await supabase.auth.getSession();
    const res = await fetch("/api/appointment-availability", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${currentSession?.access_token || ""}`,
      },
      body: JSON.stringify({ customerId, businessUserId, dateTime, dateTimeKey, note, serviceIds }),
    });
    const result = await res.json().catch(() => ({}));
    if (!res.ok) {
      notify(result.error || "Randevu alınamadı.");
      return false;
    }
    setDeals((prev) => [...prev, rowToDeal(result.deal)]);
    notify("Randevunuz alındı.", "success");
    return true;
  };

  // Erteleme = yeni bir randevu al (mevcut bookAppointment - server tarafında
  // çift-randevu/müsaitlik kontrolü zaten yapıyor) + eski deal'i kapat. Ayrı bir
  // "PATCH mevcut randevuyu" uç noktası YAZILMADI - hem booking hem cancel zaten
  // test edilmiş/çalışan yollar, ikisini birleştirmek yeni bir saldırı/hata
  // yüzeyi açmadan aynı sonucu veriyor. lost_reason bilerek "İptal etti"/"Geç
  // iptal etti" DEĞİL - computeAppointmentPenaltyBurn/no-show sayacı sadece bu
  // iki string'i sayıyor (bkz. Sectors.jsx), erteleme bir ihlal sayılmamalı.
  const rescheduleAppointment = async (oldDeal, bookingParams) => {
    const ok = await bookAppointment(bookingParams);
    if (!ok) return false;
    const { error } = await supabase
      .from("deals")
      .update({ stage: "kaybedildi", lost_reason: "Randevusunu erteledi" })
      .eq("id", oldDeal.id);
    if (error) {
      notify(
        `Yeni randevunuz alındı ama eski randevunuz kapatılamadı, lütfen destekle iletişime geçin: ${error.message}`,
      );
      return true;
    }
    setDeals((prev) =>
      prev.map((d) =>
        d.id === oldDeal.id ? { ...d, stage: "kaybedildi", lostReason: "Randevusunu erteledi" } : d,
      ),
    );
    notify("Randevunuz ertelendi.", "success");
    return true;
  };

  const downloadSharedAttachment = async (attachment) => {
    const { data, error } = await supabase.storage
      .from("attachments")
      .createSignedUrl(attachment.storagePath, 60);
    if (error || !data?.signedUrl) {
      notify(`Dosya indirilemedi: ${error?.message || ""}`);
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  };

  const cancelAppointment = async (dealId, isLate = false) => {
    // Müşterinin kendi iptali asla "Randevuya gelmedi" sayılmaz — bu iki farklı
    // iş anlamı taşıyor. "Geç iptal etti" (isLate), kobinin Müsaitlik
    // Saatleri'nde ayarladığı "geç sayılma penceresi" içinde yapılan iptaller
    // için — App.jsx'teki computeNoShowRisk bunu "Randevuya gelmedi" ile
    // AYNI sayaçta birleştirip kaçıncı ihlalde ödeme zorunlu olacağını hesaplar.
    const lostReason = isLate ? "Geç iptal etti" : "İptal etti";
    const { error } = await supabase
      .from("deals")
      .update({ stage: "kaybedildi", lost_reason: lostReason })
      .eq("id", dealId);
    if (error) {
      notify(`İptal edilemedi: ${error.message}`);
      return;
    }
    const cancelledDeal = deals.find((d) => d.id === dealId);
    setDeals((prev) =>
      prev.map((d) => (d.id === dealId ? { ...d, stage: "kaybedildi", lostReason } : d)),
    );
    notify("Randevunuz iptal edildi.", "success");
    // Paket sahibi müşterilerde ("paket sahiplerinde seans yaksın" açıksa)
    // ödeme zorunluluğu YERİNE ihlal ANINDA paketten 1 seans düşülür — bkz.
    // Sectors.jsx computeAppointmentPenaltyBurn (App.jsx staff tarafında
    // aynı fonksiyonu moveDealStage/upsertDeal'dan çağırıyor).
    if (isLate && cancelledDeal) {
      const ownerRow = customerRows.find((c) => c.id === cancelledDeal.customerId);
      const burn = computeAppointmentPenaltyBurn({
        customerId: cancelledDeal.customerId,
        deals,
        burnsSessionEnabled: ownerRow?.companyAppointmentPenaltyBurnsSession === true,
        strikeLimit: ownerRow?.companyAppointmentPenaltyStrikeLimit,
        missedPriceItemId: cancelledDeal.customFields?.price_item_id,
      });
      if (burn) {
        // deals_cancel_portal RLS policy'si sadece stage='ilk_gorusme' satırlarını
        // kapsıyor, paket kaydı (stage='kazanildi') bu kapsamın dışında kalıyordu —
        // düz bir .update() burada RLS tarafından sessizce (hatasız) hiçbir satırı
        // etkilemeden geçiştirilirdi. burn_appointment_penalty_session RPC'si hem
        // bunu (kendi yetki kontrolüyle) çözüyor hem de increment'i atomik yapıyor.
        const { data: newSessionUsed, error: burnError } = await supabase.rpc(
          "burn_appointment_penalty_session",
          { p_deal_id: burn.packageDealId },
        );
        if (!burnError)
          setDeals((prev) =>
            prev.map((d) =>
              d.id === burn.packageDealId ? { ...d, sessionUsed: newSessionUsed } : d,
            ),
          );
      }
    }
  };

  // "Mesajlar" sekmesi — talep açmadan düz sohbet. İlk mesajda müşteri başına
  // kalıcı, gizli bir "genel sohbet" tickets satırı (is_general_chat) otomatik
  // açılır; sonraki mesajlar mevcut addMessage ile aynı sohbete eklenir.
  const [creatingChat, setCreatingChat] = useState(false);
  const sendChatMessage = async (content) => {
    if (!activeCustomerRow) return;
    if (chatTicket) {
      await addMessage({ ticketId: chatTicket.id, content });
      return;
    }
    if (creatingChat) return;
    setCreatingChat(true);
    const { data, error } = await supabase
      .from("tickets")
      .insert({
        user_id: activeCustomerRow.userId,
        customer_id: activeCustomerRow.id,
        subject: "Genel Mesajlaşma",
        description: "",
        priority: "orta",
        status: "acik",
        is_general_chat: true,
      })
      .select()
      .single();
    if (error) {
      notify(`Mesaj gönderilemedi: ${error.message}`);
      setCreatingChat(false);
      return;
    }
    setTickets((prev) => [...prev, rowToTicket(data)]);
    const { data: msgData, error: msgError } = await supabase
      .from("ticket_messages")
      .insert({
        user_id: activeCustomerRow.userId,
        ticket_id: data.id,
        direction: "gelen",
        is_internal: false,
        content,
      })
      .select()
      .single();
    if (!msgError) setTicketMessages((prev) => [...prev, rowToTicketMessage(msgData)]);
    setCreatingChat(false);
  };

  const addMessage = async ({ ticketId, content }) => {
    const ticket = tickets.find((t) => t.id === ticketId);
    if (!ticket) return;
    const { data, error } = await supabase
      .from("ticket_messages")
      .insert({
        user_id: ticket.userId,
        ticket_id: ticketId,
        direction: "gelen",
        is_internal: false,
        content,
      })
      .select()
      .single();
    if (error) {
      notify(`Mesaj gönderilemedi: ${error.message}`);
      return;
    }
    setTicketMessages((prev) => [...prev, rowToTicketMessage(data)]);
    // Yanıt vermek, firmadan gelen bekleyen mesajı "okundu/yanıtlandı" sayar.
    await markMessagesRead(ticketId, "giden");
  };

  const markMessagesRead = async (ticketId, direction) => {
    const hasUnread = ticketMessages.some(
      (m) => m.ticketId === ticketId && m.direction === direction && !m.readAt,
    );
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
      prev.map((m) =>
        m.ticketId === ticketId && m.direction === direction && !m.readAt
          ? { ...m, readAt: now }
          : m,
      ),
    );
  };

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
        {
          user_id: session.user.id,
          endpoint: json.endpoint,
          p256dh: json.keys.p256dh,
          auth_key: json.keys.auth,
        },
        { onConflict: "endpoint" },
      );
      if (error) {
        notify(`Bildirim aboneliği kaydedilemedi: ${error.message}`);
        return;
      }
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
      // yoksay
    }
    setPushSubscribed(false);
  };

  // Müşteri için firmanın yanıtını görmesi yeterli — yanıt vermek zorunda değil,
  // talebi açtığında bildirim temizlenir. (KOBİ tarafında ise tam tersi: sadece
  // yanıt vermek temizler, bkz. App.jsx addTicketMessage.)
  useEffect(() => {
    if (viewingTicket) markMessagesRead(viewingTicket.id, "giden");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewingTicket?.id]);

  // "Mesajlar" sekmesi bir modal değil, doğrudan sekme içeriği olduğu için
  // yukarıdaki gibi tek bir ticket id'ye değil, sekme açık kaldığı sürece
  // gelen her yeni yanıta da okundu işareti koymalı.
  useEffect(() => {
    if (portalTab !== "mesajlar") return;
    const row = customerRows.find((r) => r.id === selectedCompanyId);
    const chat = row ? tickets.find((t) => t.customerId === row.id && t.isGeneralChat) : null;
    if (chat) markMessagesRead(chat.id, "giden");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [portalTab, tickets, selectedCompanyId]);

  // Randevu alabilen bir müşteri portala girdiğinde varsayılan "Taleplerim"
  // sekmesi yerine doğrudan "Randevu Al" butonunun olduğu sekmeye düşsün -
  // buton zaten vardı ama Taleplerim'in arkasında kalıp fark edilmiyordu.
  // Ref guard: sadece İLK yüklemede bir kez çalışır, kullanıcı sonradan başka
  // bir sekmeye geçerse bunu geri almaz.
  const initialAppointmentTabRef = useRef(false);
  useEffect(() => {
    if (initialAppointmentTabRef.current) return;
    const row = customerRows.find((r) => r.id === selectedCompanyId);
    if (!row || !supportsSelfBooking(row.companySector)) return;
    initialAppointmentTabRef.current = true;
    setPortalTab("teklifler");
  }, [customerRows, selectedCompanyId]);

  if (session === undefined)
    return (
      <div style={{ padding: "2rem", textAlign: "center", color: "var(--text-secondary)" }}>
        Yükleniyor…
      </div>
    );
  if (!session) return <CustomerPortalEntry />;
  if (loading)
    return (
      <div style={{ padding: "2rem 0", textAlign: "center", color: "var(--text-secondary)" }}>
        Yükleniyor…
      </div>
    );

  const currentTicket = viewingTicket
    ? tickets.find((t) => t.id === viewingTicket.id) || viewingTicket
    : null;
  const currentMessages = currentTicket
    ? ticketMessages.filter((m) => m.ticketId === currentTicket.id)
    : [];

  // Birden fazla firmaya bağlıysa (aynı e-posta ile), müşteri önce hangi firmayla
  // işlem yapmak istediğini seçer — sonrasında tüm ekran (sekmeler, randevu/ders
  // alanları) SADECE o firmaya göre şekillenir, farklı firmaların verisi asla
  // karışmaz. Tek firmaya bağlıysa activeCustomerRow otomatik seçilir (yukarıdaki
  // useEffect), müşteri hiçbir seçim ekranı görmez.
  const activeCustomerRow = customerRows.find((r) => r.id === selectedCompanyId) || null;
  const showCompanyPicker = customerRows.length > 1 && !activeCustomerRow;

  // İzin İŞLETME BAZINDA — müşteri birden fazla firmaya bağlıysa (çoklu işletme
  // portalı), sadece o an seçili olan firma için izin değişir, diğerleri etkilenmez.
  const setMarketingConsent = async (consent) => {
    if (!activeCustomerRow) return;
    const { error } = await supabase.rpc("set_my_marketing_consent", {
      p_customer_id: activeCustomerRow.id,
      p_consent: consent,
    });
    if (error) {
      notify(`Güncellenemedi: ${error.message}`);
      return;
    }
    setCustomerRows((prev) =>
      prev.map((r) =>
        r.id === activeCustomerRow.id
          ? {
              ...r,
              marketingConsent: consent,
              marketingConsentAt: consent ? new Date().toISOString() : r.marketingConsentAt,
            }
          : r,
      ),
    );
    notify(consent ? "Pazarlama e-postası izniniz kaydedildi." : "İzniniz kaldırıldı.", "success");
  };

  const setPhotoConsent = async (consent) => {
    if (!activeCustomerRow) return;
    const { error } = await supabase.rpc("set_my_photo_consent", {
      p_customer_id: activeCustomerRow.id,
      p_consent: consent,
    });
    if (error) {
      notify(`Güncellenemedi: ${error.message}`);
      return;
    }
    setCustomerRows((prev) =>
      prev.map((r) =>
        r.id === activeCustomerRow.id
          ? {
              ...r,
              photoConsent: consent,
              photoConsentAt: consent ? new Date().toISOString() : r.photoConsentAt,
            }
          : r,
      ),
    );
    notify(consent ? "Fotoğraf izniniz kaydedildi." : "İzniniz kaldırıldı.", "success");
  };

  // set_my_marketing_consent/set_my_photo_consent ile AYNI desen (dar bir
  // SECURITY DEFINER fonksiyon, customers'a geniş bir UPDATE grant/policy yok)
  // — İZİN'ler gibi bu da İŞLETME BAZINDA: aynı müşteri farklı firmalara farklı
  // ad/telefon/e-posta ile kayıtlı olabilir, sadece o an seçili firma değişir.
  const updateProfile = async ({ name, phone, email }) => {
    if (!activeCustomerRow) return false;
    const { error } = await supabase.rpc("set_my_profile", {
      p_customer_id: activeCustomerRow.id,
      p_name: name,
      p_phone: phone,
      p_email: email,
    });
    if (error) {
      notify(`Bilgileriniz güncellenemedi: ${error.message}`);
      return false;
    }
    setCustomerRows((prev) =>
      prev.map((r) =>
        r.id === activeCustomerRow.id
          ? {
              ...r,
              name: name.trim() || r.name,
              phone: phone.trim() || null,
              email: email.trim() || null,
            }
          : r,
      ),
    );
    notify("Bilgileriniz güncellendi.", "success");
    return true;
  };

  const visibleCustomerRows = activeCustomerRow ? [activeCustomerRow] : [];
  // "Mesajlar" sohbeti (is_general_chat) Taleplerim listesinde görünmez — kendi
  // sekmesinde, konu/durum olmadan düz bir sohbet olarak gösteriliyor.
  const visibleTickets = activeCustomerRow
    ? tickets.filter((t) => t.customerId === activeCustomerRow.id && !t.isGeneralChat)
    : [];
  const visibleDeals = activeCustomerRow
    ? deals.filter((d) => d.customerId === activeCustomerRow.id)
    : [];
  const visiblePayments = activeCustomerRow
    ? payments.filter((p) => p.customerId === activeCustomerRow.id)
    : [];
  const visibleGroupClasses = activeCustomerRow
    ? groupClasses.filter((g) => g.userId === activeCustomerRow.userId)
    : [];

  const chatTicket = activeCustomerRow
    ? tickets.find((t) => t.customerId === activeCustomerRow.id && t.isGeneralChat) || null
    : null;
  const chatMessages = chatTicket ? ticketMessages.filter((m) => m.ticketId === chatTicket.id) : [];
  const chatUnreadCount = chatMessages.filter((m) => m.direction === "giden" && !m.readAt).length;

  const unreadCountByTicket = ticketMessages.reduce((acc, m) => {
    if (m.direction === "giden" && !m.readAt) acc[m.ticketId] = (acc[m.ticketId] || 0) + 1;
    return acc;
  }, {});

  const companyNameByCustomerId = Object.fromEntries(
    visibleCustomerRows.map((c) => [c.id, c.companyName || c.name]),
  );
  const sectorByCustomerId = Object.fromEntries(
    visibleCustomerRows.map((c) => [c.id, c.companySector]),
  );
  const hardBlockHoursByCustomerId = Object.fromEntries(
    visibleCustomerRows.map((c) => [c.id, c.companyAppointmentCancelHours]),
  );
  const appointmentPenaltyHoursByCustomerId = Object.fromEntries(
    visibleCustomerRows.map((c) => [c.id, c.companyAppointmentPenaltyHours]),
  );
  const appointmentPenaltyStrikeLimitByCustomerId = Object.fromEntries(
    visibleCustomerRows.map((c) => [c.id, c.companyAppointmentPenaltyStrikeLimit]),
  );
  const appointmentPenaltyBurnsSessionByCustomerId = Object.fromEntries(
    visibleCustomerRows.map((c) => [c.id, c.companyAppointmentPenaltyBurnsSession]),
  );
  const appointmentPartialChargeHoursByCustomerId = Object.fromEntries(
    visibleCustomerRows.map((c) => [c.id, c.companyAppointmentPartialChargeHours]),
  );
  const totalUnreadTickets = visibleTickets.filter((t) => unreadCountByTicket[t.id] > 0).length;

  const dealKind = dealWordKind(activeCustomerRow?.companySector);
  const appointmentCompanies =
    activeCustomerRow && supportsSelfBooking(activeCustomerRow.companySector)
      ? [activeCustomerRow]
      : [];
  const showDersler =
    supportsGroupClasses(activeCustomerRow?.companySector) && visibleGroupClasses.length > 0;

  return (
    <div style={{ padding: "24px 16px 64px" }}>
      <div
        className="app-header-row"
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "1.5rem",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <IconButton
            icon="ti-menu-2"
            onClick={() => setSidebarOpen(true)}
            title="Menü"
            className="app-sidebar-toggle"
          />
          <img src="/favicon.svg" alt="Binerly" style={{ width: 24, height: 24 }} />
          <span style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)" }}>
            Binerly
          </span>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {customerRows.length > 1 && activeCustomerRow && (
            <button
              onClick={() => setSelectedCompanyId(null)}
              style={{
                fontSize: 12,
                color: "var(--text-secondary)",
                background: "none",
                border: "0.5px solid var(--border)",
                display: "flex",
                alignItems: "center",
                gap: 4,
              }}
              title="Başka bir işletme seç"
            >
              <i className="ti ti-building-store" style={{ fontSize: 14 }} aria-hidden="true"></i>
              İşletme değiştir
            </button>
          )}
          <NotificationBell userId={session.user.id} supabase={supabase} />
          <IconButton
            icon="ti-adjustments"
            onClick={() => setPortalTab("ayarlar")}
            title="Ayarlar"
          />
          <button
            onClick={() => setPortalTab("profil")}
            title="Profilim"
            aria-label="Profilim"
            style={{
              background: "none",
              border: "none",
              padding: 0,
              boxShadow: "none",
              cursor: "pointer",
              display: "flex",
              lineHeight: 0,
            }}
          >
            <InitialsAvatar name={activeCustomerRow?.name || session.user.email} size={30} />
          </button>
        </div>
      </div>

      <div style={{ maxWidth: 1300 }}>
        {loadError ? (
          <p style={{ fontSize: 14, color: "var(--text-danger)" }}>
            Verileriniz yüklenirken bir hata oluştu. Lütfen sayfayı yenileyip tekrar deneyin.
          </p>
        ) : customerRows.length === 0 ? (
          <p style={{ fontSize: 14, color: "var(--text-secondary)" }}>
            Hesabınız henüz bir firmayla eşleşmedi. Kayıt olurken kullandığınız e-postanın, ilgili
            firmanın sisteminde kayıtlı e-posta ile aynı olduğundan emin olun.
          </p>
        ) : customerRows.length === 1 && !activeCustomerRow ? (
          // Tek firmaya bağlı müşteri için otomatik seçim efekti henüz işlenmeden
          // önceki tek karelik an — boş sekme yerine kısa bir yükleniyor gösterilir.
          <div style={{ textAlign: "center", color: "var(--text-secondary)", padding: "2rem 0" }}>
            Yükleniyor…
          </div>
        ) : showCompanyPicker ? (
          <div>
            <p style={{ fontSize: 14, color: "var(--text-secondary)", margin: "0 0 16px" }}>
              Birden fazla işletmeyle bağlantılısınız - hangisiyle işlem yapmak istiyorsunuz?
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {customerRows.map((row) => {
                const preset = SECTOR_PRESETS.find((s) => s.id === row.companySector);
                return (
                  <button
                    key={row.id}
                    onClick={() => setSelectedCompanyId(row.id)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      textAlign: "left",
                      background: "var(--surface-1)",
                      border: "0.5px solid var(--border)",
                      borderRadius: "var(--radius-lg)",
                      boxShadow: "var(--shadow-sm)",
                      padding: "0.9rem 1rem",
                      fontSize: 14,
                      color: "var(--text-primary)",
                    }}
                  >
                    <i
                      className={`ti ${preset?.icon || "ti-building-store"}`}
                      style={{ fontSize: 20, color: "var(--fill-accent)", flex: "none" }}
                      aria-hidden="true"
                    ></i>
                    <span style={{ flex: 1 }}>
                      <span style={{ display: "block", fontWeight: 600 }}>
                        {row.companyName || row.name}
                      </span>
                      {preset && (
                        <span
                          style={{ display: "block", fontSize: 12, color: "var(--text-secondary)" }}
                        >
                          {preset.label}
                        </span>
                      )}
                    </span>
                    <i
                      className="ti ti-chevron-right"
                      style={{ fontSize: 16, color: "var(--text-muted)" }}
                      aria-hidden="true"
                    ></i>
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          <>
            <div style={{ display: "flex", gap: 32, alignItems: "flex-start" }}>
              {sidebarOpen && (
                <div className="app-sidebar-backdrop" onClick={() => setSidebarOpen(false)} />
              )}
              <nav
                className={`app-sidebar${sidebarOpen ? " open" : ""}`}
                style={{
                  width: 200,
                  flexShrink: 0,
                  display: "flex",
                  flexDirection: "column",
                  gap: 4,
                  position: "sticky",
                  top: 24,
                }}
              >
                {activeCustomerRow && (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "6px 10px 14px",
                    }}
                  >
                    <InitialsAvatar
                      name={activeCustomerRow.companyName || activeCustomerRow.name}
                      size={38}
                    />
                    <div style={{ minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: 14,
                          fontWeight: 700,
                          color: "var(--text-primary)",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {activeCustomerRow.companyName || activeCustomerRow.name}
                      </div>
                      <div style={{ fontSize: 11.5, color: "var(--text-muted)" }}>Binerly ile</div>
                    </div>
                  </div>
                )}
                {[
                  { id: "talepler", label: "Taleplerim", icon: "ti-ticket" },
                  { id: "mesajlar", label: "Mesajlar", icon: "ti-message-circle" },
                  {
                    id: "teklifler",
                    label: PORTAL_DEAL_WORDS[dealKind].tabLabel,
                    icon: "ti-file-text",
                  },
                  ...(showDersler
                    ? [{ id: "dersler", label: "Derslerim", icon: "ti-calendar-time" }]
                    : []),
                  { id: "odemeler", label: "Ödemelerim", icon: "ti-receipt" },
                ].map((t) => (
                  <button
                    key={t.id}
                    onClick={() => {
                      setPortalTab(t.id);
                      setSidebarOpen(false);
                    }}
                    className={portalTab === t.id ? undefined : "app-sidebar-tab"}
                    style={{
                      border: "0.5px solid transparent",
                      background: portalTab === t.id ? "var(--fill-accent)" : "transparent",
                      color: portalTab === t.id ? "var(--on-accent)" : "var(--text-primary)",
                      fontWeight: portalTab === t.id ? 600 : 400,
                      boxShadow: portalTab === t.id ? "var(--shadow-sm)" : "none",
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
                    <i
                      className={`ti ${t.icon}`}
                      style={{ fontSize: 16, flexShrink: 0 }}
                      aria-hidden="true"
                    ></i>
                    <span style={{ flex: 1 }}>{t.label}</span>
                    {((t.id === "talepler" && totalUnreadTickets > 0) ||
                      (t.id === "mesajlar" && chatUnreadCount > 0)) && (
                      <span
                        style={{
                          minWidth: 18,
                          height: 18,
                          borderRadius: 9,
                          background: "var(--text-danger)",
                          color: "var(--on-accent)",
                          fontSize: 11,
                          fontWeight: 700,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          padding: "0 4px",
                          flexShrink: 0,
                        }}
                      >
                        {t.id === "talepler" ? totalUnreadTickets : chatUnreadCount}
                      </span>
                    )}
                  </button>
                ))}
                <div
                  style={{ height: 1, background: "var(--border)", margin: "8px 10px" }}
                  aria-hidden="true"
                />
                <button
                  onClick={() => supabase.auth.signOut()}
                  className="app-sidebar-tab"
                  style={{
                    border: "0.5px solid transparent",
                    background: "transparent",
                    color: "var(--text-secondary)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "flex-start",
                    gap: 8,
                    padding: "8px 10px",
                    width: "100%",
                    textAlign: "left",
                  }}
                >
                  <i
                    className="ti ti-logout"
                    style={{ fontSize: 16, flexShrink: 0 }}
                    aria-hidden="true"
                  ></i>
                  <span style={{ flex: 1 }}>Çıkış Yap</span>
                </button>
              </nav>

              <div style={{ flex: 1, minWidth: 0 }}>
                {portalTab === "talepler" && (
                  <div>
                    <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
                      <button
                        onClick={() => setShowNewTicketForm(true)}
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
                        Yeni talep
                      </button>
                    </div>
                    <PortalTicketList
                      tickets={visibleTickets}
                      unreadCountByTicket={unreadCountByTicket}
                      onOpenTicket={setViewingTicket}
                      companyNameByCustomerId={companyNameByCustomerId}
                      showCompany={false}
                    />
                  </div>
                )}

                {portalTab === "mesajlar" && (
                  <PortalMessagesPanel
                    messages={chatMessages}
                    onSend={sendChatMessage}
                    sending={creatingChat}
                    companyName={activeCustomerRow?.companyName || activeCustomerRow?.name}
                  />
                )}

                {portalTab === "teklifler" && (
                  <div>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "flex-start",
                        gap: 12,
                        flexWrap: "wrap",
                        marginBottom: 20,
                      }}
                    >
                      <div>
                        <h2
                          style={{
                            margin: "0 0 4px",
                            fontSize: 22,
                            fontWeight: 700,
                            color: "var(--text-primary)",
                          }}
                        >
                          {PORTAL_DEAL_WORDS[dealKind].tabLabel}
                        </h2>
                        <p style={{ margin: 0, fontSize: 13, color: "var(--text-secondary)" }}>
                          {`Yaklaşan ve geçmiş ${PORTAL_DEAL_WORDS[dealKind].plural} buradan yönetebilirsiniz.`}
                        </p>
                      </div>
                      {appointmentCompanies.length > 0 && (
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                          {appointmentCompanies.map((row) => (
                            <button
                              key={row.id}
                              onClick={() => setBookingFor(row)}
                              style={{
                                background: "var(--fill-accent)",
                                color: "var(--on-accent)",
                                border: "none",
                                display: "flex",
                                alignItems: "center",
                                gap: 6,
                              }}
                            >
                              <i
                                className="ti ti-plus"
                                style={{ fontSize: 16 }}
                                aria-hidden="true"
                              ></i>
                              {(() => {
                                const label =
                                  bookingModel(row.companySector) === "inventory"
                                    ? "Rezervasyon Yap"
                                    : "Randevu Al";
                                return appointmentCompanies.length > 1
                                  ? `${row.companyName || row.name} - ${label}`
                                  : label;
                              })()}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <PortalDealList
                      deals={visibleDeals}
                      companyNameByCustomerId={companyNameByCustomerId}
                      sectorByCustomerId={sectorByCustomerId}
                      hardBlockHoursByCustomerId={hardBlockHoursByCustomerId}
                      appointmentPenaltyHoursByCustomerId={appointmentPenaltyHoursByCustomerId}
                      appointmentPenaltyStrikeLimitByCustomerId={
                        appointmentPenaltyStrikeLimitByCustomerId
                      }
                      appointmentPenaltyBurnsSessionByCustomerId={
                        appointmentPenaltyBurnsSessionByCustomerId
                      }
                      appointmentPartialChargeHoursByCustomerId={
                        appointmentPartialChargeHoursByCustomerId
                      }
                      sector={activeCustomerRow?.companySector}
                      showCompany={false}
                      dealKind={dealKind}
                      onBookNew={
                        appointmentCompanies.length > 0
                          ? () => setBookingFor(appointmentCompanies[0])
                          : undefined
                      }
                      onCancelAppointment={(id, isLate, willBurnSession, chargeZone) =>
                        setConfirmCancel({
                          type: "appointment",
                          id,
                          isLate,
                          willBurnSession,
                          chargeZone,
                        })
                      }
                      onReschedule={setReschedulingDeal}
                      sharedAttachments={sharedAttachments}
                      onDownloadAttachment={downloadSharedAttachment}
                    />
                  </div>
                )}

                {portalTab === "dersler" && (
                  <PortalGroupClasses
                    groupClasses={visibleGroupClasses}
                    groupClassEnrollments={groupClassEnrollments}
                    groupClassWaitlist={groupClassWaitlist}
                    customerRows={visibleCustomerRows}
                    showCompany={false}
                    hasActiveMembership={hasActiveMembership}
                    getMembershipDeal={activeMembershipDeal}
                    onEnroll={enrollInClass}
                    onCancel={(id, burn) => setConfirmCancel({ type: "enrollment", id, burn })}
                    onJoinWaitlist={joinWaitlist}
                    onLeaveWaitlist={leaveWaitlist}
                  />
                )}

                {portalTab === "odemeler" && (
                  <PortalPayments
                    payments={visiblePayments}
                    showCompany={false}
                    companyNameByCustomerId={companyNameByCustomerId}
                  />
                )}

                {portalTab === "profil" && (
                  <PortalSettings
                    section="profile"
                    session={session}
                    theme={theme}
                    onThemeChange={setTheme}
                    pushSubscribed={pushSubscribed}
                    onSubscribe={subscribeToPush}
                    onUnsubscribe={unsubscribeFromPush}
                    marketingConsent={activeCustomerRow?.marketingConsent}
                    onMarketingConsentChange={setMarketingConsent}
                    companyName={activeCustomerRow?.companyName}
                    companySector={activeCustomerRow?.companySector}
                    photoConsent={activeCustomerRow?.photoConsent}
                    onPhotoConsentChange={setPhotoConsent}
                    customerName={activeCustomerRow?.name}
                    customerPhone={activeCustomerRow?.phone}
                    customerEmail={activeCustomerRow?.email}
                    onUpdateProfile={updateProfile}
                    notify={notify}
                  />
                )}
                {portalTab === "ayarlar" && (
                  <PortalSettings
                    section="account"
                    session={session}
                    theme={theme}
                    onThemeChange={setTheme}
                    pushSubscribed={pushSubscribed}
                    onSubscribe={subscribeToPush}
                    onUnsubscribe={unsubscribeFromPush}
                    marketingConsent={activeCustomerRow?.marketingConsent}
                    onMarketingConsentChange={setMarketingConsent}
                    companyName={activeCustomerRow?.companyName}
                    companySector={activeCustomerRow?.companySector}
                    photoConsent={activeCustomerRow?.photoConsent}
                    onPhotoConsentChange={setPhotoConsent}
                    customerName={activeCustomerRow?.name}
                    customerPhone={activeCustomerRow?.phone}
                    customerEmail={activeCustomerRow?.email}
                    onUpdateProfile={updateProfile}
                    notify={notify}
                  />
                )}
              </div>
            </div>
          </>
        )}
      </div>

      {showNewTicketForm && (
        <Modal title="Yeni destek talebi" onClose={() => setShowNewTicketForm(false)}>
          <PortalNewTicketForm
            customerRows={visibleCustomerRows}
            onSave={createTicket}
            onCancel={() => setShowNewTicketForm(false)}
          />
        </Modal>
      )}

      {currentTicket && (
        <PortalTicketDetail
          ticket={currentTicket}
          messages={currentMessages}
          onAddMessage={addMessage}
          onClose={() => setViewingTicket(null)}
        />
      )}

      {showPasswordRecovery && (
        <PasswordRecoveryModal notify={notify} onClose={() => setShowPasswordRecovery(false)} />
      )}

      {bookingFor && (
        <AppointmentBookingModal
          customerRow={bookingFor}
          priceListItems={priceListItems.filter((p) => p.userId === bookingFor.userId)}
          onBook={bookAppointment}
          onClose={() => setBookingFor(null)}
        />
      )}

      {reschedulingDeal &&
        (() => {
          const rescheduleCustomerRow = customerRows.find(
            (r) => r.id === reschedulingDeal.customerId,
          );
          if (!rescheduleCustomerRow) return null;
          return (
            <AppointmentBookingModal
              customerRow={rescheduleCustomerRow}
              priceListItems={priceListItems.filter(
                (p) => p.userId === rescheduleCustomerRow.userId,
              )}
              reschedule={{
                initialNote: reschedulingDeal.title,
                initialServiceIds: Array.isArray(reschedulingDeal.customFields?.service_ids)
                  ? reschedulingDeal.customFields.service_ids
                  : [],
              }}
              onBook={(params) => rescheduleAppointment(reschedulingDeal, params)}
              onClose={() => setReschedulingDeal(null)}
            />
          );
        })()}

      {confirmCancel && (
        <ConfirmDialog
          title="İptal edilsin mi?"
          message={
            confirmCancel.type === "appointment"
              ? confirmCancel.willBurnSession
                ? "Randevunuzu iptal etmek istediğinizden emin misiniz? Randevu saatine az kaldığı için bu iptal paketinizden 1 seans düşürecek. Bu işlem geri alınamaz."
                : confirmCancel.chargeZone === "full"
                  ? "Randevunuzu iptal etmek istediğinizden emin misiniz? Randevu saatine çok az kaldığı için bu iptal 'geç iptal' olarak işaretlenecek ve tam kesinti (seans yapılmış sayılabilir) bölgesinde. Bu işlem geri alınamaz."
                  : confirmCancel.chargeZone === "partial"
                    ? "Randevunuzu iptal etmek istediğinizden emin misiniz? Randevu saatine az kaldığı için bu iptal 'geç iptal' olarak işaretlenecek ve kısmi kesinti (~%50) önerilen bölgede. Bu işlem geri alınamaz."
                    : confirmCancel.isLate
                      ? "Randevunuzu iptal etmek istediğinizden emin misiniz? Randevu saatine az kaldığı için bu iptal 'geç iptal' olarak işaretlenecek. Bu işlem geri alınamaz."
                      : "Randevunuzu iptal etmek istediğinizden emin misiniz? Bu işlem geri alınamaz."
              : confirmCancel.burn?.newSessionUsed != null
                ? "Bu derse kaydınızı iptal etmek istediğinizden emin misiniz? Bu süreden az kala iptal ettiğiniz için 1 seansınız düşülecek. Bu işlem geri alınamaz."
                : confirmCancel.burn
                  ? "Bu derse kaydınızı iptal etmek istediğinizden emin misiniz? Bu süreden az kala iptal ediyorsunuz, tekrarlanırsa ileride seans düşebilir. Bu işlem geri alınamaz."
                  : "Bu derse kaydınızı iptal etmek istediğinizden emin misiniz? Bu işlem geri alınamaz."
          }
          confirmLabel="İptal Et"
          onClose={() => setConfirmCancel(null)}
          onConfirm={async () => {
            if (confirmCancel.type === "appointment")
              await cancelAppointment(confirmCancel.id, confirmCancel.isLate);
            else await cancelEnrollment(confirmCancel.id, confirmCancel.burn);
            setConfirmCancel(null);
          }}
        />
      )}

      {toast && <Toast message={toast.message} tone={toast.tone} onClose={() => setToast(null)} />}
    </div>
  );
}
