import React, { useState, useEffect } from "react";
import { supabase } from "./supabase";
import { Badge, Modal, Toast, ConfirmDialog, formatTL, useSessionTimeout, useTheme, GoogleAuthButton, AuthDivider, uid, WEEKDAYS, nextWeeklyOccurrence, NotificationBell } from "./shared";
import { stageLabel, dealWordKind, isAppointmentSector, supportsSelfBooking, supportsGroupClasses, groupClassWords, supportExamples, appointmentNoteExample, SECTOR_PRESETS } from "./Sectors";

const PORTAL_DEAL_WORDS = {
  teklif: { emptyList: "Henüz bir teklifiniz yok.", possAcc: "tekliflerinizi", tabLabel: "Tekliflerim" },
  randevu: { emptyList: "Henüz bir randevunuz yok.", possAcc: "randevularınızı", tabLabel: "Randevularım" },
  uyelik: { emptyList: "Henüz bir üyeliğiniz yok.", possAcc: "üyeliklerinizi", tabLabel: "Üyeliklerim" },
};

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

function rowToDeal(r) {
  // customer_deal_view select("*") ile tüm custom_fields JSONB'sini döndürüyor,
  // ama portal UI'ı bunlardan sadece ikisini okuyor — geri kalanı (KOBİ'nin
  // teklife girdiği başka özel alanlar, iç notlar olabilir) tarayıcıya hiç
  // gitmesin diye burada bilinçli olarak sadece bu iki anahtar taşınıyor.
  const cf = r.custom_fields || {};
  return {
    id: r.id,
    customerId: r.customer_id,
    title: r.title,
    value: r.value,
    stage: r.stage,
    createdAt: r.created_at,
    customFields: { portal_randevu_zamani: cf.portal_randevu_zamani, kaynak: cf.kaynak },
    approvalToken: r.approval_token || null,
    paymentMode: r.payment_mode || "none",
    paymentStatus: r.payment_status || null,
    approvedAt: r.approved_at || null,
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

function rowToPriceListItem(r) {
  return { id: r.id, userId: r.user_id, name: r.name, price: r.price };
}

function formatDateTime(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleDateString("tr-TR", { day: "numeric", month: "short", year: "numeric" }) +
    " · " + d.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
}

function canCancelAppointmentDeal(randevuTarihi) {
  return new Date(`${randevuTarihi}+03:00`).getTime() - Date.now() > 2 * 60 * 60 * 1000;
}

function CustomerAuthForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState(new URLSearchParams(window.location.search).get("register") ? "register" : "login");
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
      redirectTo: `${window.location.origin}/portal`,
    });
    setLoading(false);
    setMessage(error ? error.message : "E-postanıza bir şifre sıfırlama bağlantısı gönderdik.");
  };

  const handleGoogleCredential = async (idToken, nonce) => {
    const { error } = await supabase.auth.signInWithIdToken({ provider: "google", token: idToken, nonce });
    if (error) setMessage(error.message);
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f5f8fc", padding: "1rem" }}>
      <div style={{ background: "#fff", borderRadius: 16, padding: "2rem", width: "100%", maxWidth: 400 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
          <img src="/favicon.svg" alt="Binerly" style={{ width: 39, height: 39 }} />
          <span style={{ fontWeight: 700, fontSize: 16, color: "#0c2540" }}>Binerly Müşteri Bilgi Sistemi</span>
        </div>
        <h2 style={{ fontSize: 18, fontWeight: 700, margin: "0 0 4px", color: "#0c2540" }}>
          {mode === "login" ? "Giriş yap" : "Hesap oluştur"}
        </h2>
        <p style={{ fontSize: 13, color: "#5b7088", margin: "0 0 20px" }}>
          Bir firmanın müşterisiyseniz, taleplerinizi ve kayıtlarınızı buradan takip edin.
        </p>
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
        <p style={{ fontSize: 13, textAlign: "center", marginTop: 16, color: "#5b7088" }}>
          {mode === "login" ? "Hesabın yok mu? " : "Hesabın var mı? "}
          <button onClick={() => { setMode(mode === "login" ? "register" : "login"); setMessage(""); }} style={{ background: "none", border: "none", color: "#185fa5", padding: 0, cursor: "pointer", fontSize: 13, fontWeight: 600 }}>
            {mode === "login" ? "Kayıt ol" : "Giriş yap"}
          </button>
        </p>
        <p style={{ fontSize: 12, textAlign: "center", marginTop: 20 }}>
          <a href="/" style={{ color: "#94a7bb" }}>← Binerly ana sayfaya dön</a>
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
          <label style={{ fontSize: 13, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Hangi firma için?</label>
          <select value={customerId} onChange={(e) => setCustomerId(e.target.value)} style={{ width: "100%" }}>
            {customerRows.map((c) => <option key={c.id} value={c.id}>{c.companyName || c.name}</option>)}
          </select>
        </div>
      )}
      <div style={{ marginBottom: 12 }}>
        <label style={{ fontSize: 13, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Konu</label>
        <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder={`Örn. ${supportExamples(selectedSector).subject}`} style={{ width: "100%" }} />
      </div>
      <div style={{ marginBottom: 16 }}>
        <label style={{ fontSize: 13, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Açıklama</label>
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Talebinizin detayları" style={{ width: "100%", minHeight: 80, resize: "vertical" }} />
      </div>
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button type="button" onClick={onCancel}>Vazgeç</button>
        <button type="submit" style={{ background: "var(--fill-accent)", color: "var(--on-accent)", border: "none" }}>Gönder</button>
      </div>
    </form>
  );
}

function PortalTicketList({ tickets, unreadCountByTicket, onOpenTicket, companyNameByCustomerId, showCompany }) {
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
            style={{ background: "var(--surface-1)", borderRadius: "var(--radius)", padding: "0.75rem 1rem", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", cursor: "pointer" }}
          >
            <div>
              <p style={{ margin: 0, fontWeight: 500, fontSize: 14, display: "flex", alignItems: "center", gap: 6 }}>
                {t.subject}
                {unreadCountByTicket[t.id] > 0 && <Badge tone="accent">{unreadCountByTicket[t.id]} yeni mesaj</Badge>}
              </p>
              <p style={{ margin: 0, fontSize: 12, color: "var(--text-secondary)" }}>
                {showCompany && `${companyNameByCustomerId[t.customerId] || "Bilinmeyen firma"} · `}{formatDateTime(t.createdAt)}
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
          <p style={{ margin: "0 0 8px", fontSize: 13, color: "var(--text-secondary)" }}>{ticket.description}</p>
        )}
        <Badge tone={STATUS_TONE[ticket.status] || "default"}>{statusInfo?.label}</Badge>
      </div>

      <p style={{ fontSize: 13, fontWeight: 500, margin: "0 0 8px" }}>Mesajlar</p>
      <form onSubmit={submit} style={{ marginBottom: 16 }}>
        <div style={{ marginBottom: 8 }}>
          <input value={content} onChange={(e) => setContent(e.target.value)} placeholder="Mesajınızı yazın" style={{ width: "100%" }} />
        </div>
        <button type="submit" disabled={saving || !content.trim()} style={{ background: "var(--fill-accent)", color: "var(--on-accent)", border: "none", fontSize: 13 }}>
          Gönder
        </button>
      </form>

      {sorted.length === 0 ? (
        <p style={{ fontSize: 13, color: "var(--text-muted)" }}>Henüz mesaj yok.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, maxHeight: 260, overflowY: "auto" }}>
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

function PortalDealList({ deals, companyNameByCustomerId, sectorByCustomerId, showCompany, dealKind, onCancelAppointment }) {
  if (deals.length === 0) {
    return <p style={{ fontSize: 14, color: "var(--text-secondary)" }}>{PORTAL_DEAL_WORDS[dealKind].emptyList}</p>;
  }
  const sorted = [...deals].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {sorted.map((d) => {
        const stageText = stageLabel(d.stage, "bireysel", sectorByCustomerId[d.customerId]);
        const tone = d.stage === "kazanildi" ? "success" : d.stage === "kaybedildi" ? "default" : d.stage === "muzakere" ? "warning" : "accent";
        const randevuTarihi = d.customFields?.portal_randevu_zamani;
        const cancellable = d.stage === "ilk_gorusme" && randevuTarihi;
        const canCancel = cancellable && canCancelAppointmentDeal(randevuTarihi);
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
        const actionLabel = isCompleted
          ? "Öde"
          : !isApproved
            ? (d.paymentMode === "required" ? "Öde ve Onayla" : d.paymentMode === "optional" ? "Onayla / Öde" : "Onayla")
            : "Öde";
        const showAction = d.approvalToken && (isCompleted ? needsPayment : (!isApproved || needsPayment));
        return (
          <div key={d.id} style={{ background: "var(--surface-1)", borderRadius: "var(--radius)", padding: "0.75rem 1rem", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <div>
              <p style={{ margin: 0, fontWeight: 500, fontSize: 14 }}>{d.title}</p>
              {randevuTarihi && (
                <p style={{ margin: 0, fontSize: 12, color: "var(--text-secondary)" }}>{formatDateTime(randevuTarihi)}</p>
              )}
              {showCompany && (
                <p style={{ margin: 0, fontSize: 12, color: "var(--text-secondary)" }}>{companyNameByCustomerId[d.customerId] || "Bilinmeyen firma"}</p>
              )}
            </div>
            <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
              <Badge tone={tone}>{stageText}</Badge>
              {isApproved && <Badge tone="success">✓ Onaylandı</Badge>}
              {isPaid && <Badge tone="success">✓ Ödendi</Badge>}
              {showAction && (
                <a href={`/onay/${d.approvalToken}`} style={{ fontSize: 13, fontWeight: 600, color: "var(--fill-accent)" }}>{actionLabel}</a>
              )}
              <span style={{ fontSize: 13, fontWeight: 600, minWidth: 90, textAlign: "right" }}>{formatTL(d.value)}</span>
              {cancellable && (canCancel ? (
                <button type="button" onClick={() => onCancelAppointment(d.id)} style={{ fontSize: 13 }}>İptal Et</button>
              ) : (
                <span style={{ fontSize: 12, color: "var(--text-muted)" }} title="Randevu saatine 2 saatten az kaldığı için iptal edilemez">İptal edilemez</span>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function PortalGroupClasses({ groupClasses, groupClassEnrollments, customerRows, showCompany, hasActiveMembership, onEnroll, onCancel }) {
  const words = groupClassWords(customerRows[0]?.companySector);
  const companyNameByUserId = Object.fromEntries(customerRows.map((c) => [c.userId, c.companyName || c.name]));
  const myCustomerIds = new Set(customerRows.map((c) => c.id));
  const myEnrollments = groupClassEnrollments.filter((e) => myCustomerIds.has(e.customerId));
  const myEnrolledClassIds = new Set(myEnrollments.map((e) => e.groupClassId));
  const enrolled = groupClasses.filter((g) => myEnrolledClassIds.has(g.id));
  const joinable = groupClasses.filter((g) => !myEnrolledClassIds.has(g.id));
  const countFor = (classId) => groupClassEnrollments.filter((e) => e.groupClassId === classId).length;

  const rowStyle = { background: "var(--surface-1)", borderRadius: "var(--radius)", padding: "0.75rem 1rem", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" };

  return (
    <div>
      <p style={{ fontSize: 14, fontWeight: 500, margin: "0 0 8px" }}>Kayıtlı olduklarım</p>
      {enrolled.length === 0 ? (
        <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 20 }}>Henüz kayıtlı bir dersiniz yok.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 }}>
          {enrolled.map((g) => {
            const myEnrollment = myEnrollments.find((e) => e.groupClassId === g.id);
            const hoursLeft = (nextWeeklyOccurrence(g.weekday, g.startTime).getTime() - Date.now()) / 3600000;
            const canCancel = hoursLeft >= 2;
            return (
              <div key={g.id} style={rowStyle}>
                <div>
                  <p style={{ margin: 0, fontWeight: 500, fontSize: 14 }}>{g.name}</p>
                  <p style={{ margin: 0, fontSize: 12, color: "var(--text-secondary)" }}>
                    {WEEKDAYS[g.weekday - 1]} {g.startTime}{g.instructorName ? ` · ${g.instructorName}` : ""}{showCompany ? ` · ${companyNameByUserId[g.userId]}` : ""}
                  </p>
                </div>
                {canCancel ? (
                  <button onClick={() => onCancel(myEnrollment.id)} style={{ fontSize: 13 }}>İptal Et</button>
                ) : (
                  <span style={{ fontSize: 12, color: "var(--text-muted)" }} title="Ders saatine 2 saatten az kaldığı için iptal edilemez">İptal edilemez</span>
                )}
              </div>
            );
          })}
        </div>
      )}

      <p style={{ fontSize: 14, fontWeight: 500, margin: "0 0 8px" }}>Katılabileceklerim</p>
      {joinable.length === 0 ? (
        <p style={{ fontSize: 13, color: "var(--text-muted)" }}>Katılabileceğiniz başka ders yok.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {joinable.map((g) => {
            const count = countFor(g.id);
            const full = count >= g.capacity;
            const myCustomerId = customerRows.find((c) => c.userId === g.userId)?.id;
            const eligible = myCustomerId && hasActiveMembership(myCustomerId);
            return (
              <div key={g.id} style={rowStyle}>
                <div>
                  <p style={{ margin: 0, fontWeight: 500, fontSize: 14 }}>{g.name}</p>
                  <p style={{ margin: 0, fontSize: 12, color: "var(--text-secondary)" }}>
                    {WEEKDAYS[g.weekday - 1]} {g.startTime}{g.instructorName ? ` · ${g.instructorName}` : ""}{showCompany ? ` · ${companyNameByUserId[g.userId]}` : ""}
                  </p>
                  {!eligible && <p style={{ margin: "2px 0 0", fontSize: 11.5, color: "var(--text-muted)" }}>{words.portalEligibility}</p>}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Badge tone={full ? "danger" : "success"}>{count}/{g.capacity} dolu</Badge>
                  <button disabled={full || !eligible} onClick={() => onEnroll({ groupClassId: g.id, customerId: myCustomerId })} style={{ fontSize: 13 }}>Katıl</button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function AppointmentBookingModal({ customerRow, priceListItems, onBook, onClose }) {
  const todayStr = new Date().toISOString().slice(0, 10);
  const maxDateStr = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const [date, setDate] = useState(todayStr);
  const [slots, setSlots] = useState([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [slotsError, setSlotsError] = useState("");
  const [selectedTime, setSelectedTime] = useState("");
  const [note, setNote] = useState("");
  const [value, setValue] = useState("");
  const [booking, setBooking] = useState(false);
  const [dateTimeKey, setDateTimeKey] = useState(null);

  useEffect(() => {
    if (!date || !customerRow.userId) { setSlotsError("İşletme bilgisi eksik, müsaitlik sorgulanamadı."); return; }
    setLoadingSlots(true);
    setSlotsError("");
    setSelectedTime("");
    fetch(`/api/appointment-availability?businessUserId=${customerRow.userId}&date=${date}`)
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data?.error || "Müsaitlik alınamadı.");
        setSlots(data.slots || []);
        setDateTimeKey(data.dateTimeKey || null);
      })
      .catch((err) => { setSlots([]); setSlotsError(err.message || "Müsaitlik alınamadı."); })
      .finally(() => setLoadingSlots(false));
  }, [date, customerRow.userId]);

  const confirm = async () => {
    if (!selectedTime || !note.trim() || !dateTimeKey) return;
    setBooking(true);
    const ok = await onBook({ customerId: customerRow.id, businessUserId: customerRow.userId, dateTime: `${date}T${selectedTime}:00`, dateTimeKey, note, value: Number(value) || 0 });
    setBooking(false);
    if (ok) onClose();
  };

  return (
    <Modal title={`${customerRow.companyName || customerRow.name} — Randevu Al`} onClose={onClose}>
      <div style={{ marginBottom: 12 }}>
        <label style={{ fontSize: 13, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Tarih</label>
        <input type="date" min={todayStr} max={maxDateStr} value={date} onChange={(e) => setDate(e.target.value)} style={{ width: "100%" }} />
      </div>
      <div style={{ marginBottom: 12 }}>
        <label style={{ fontSize: 13, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Saat</label>
        {loadingSlots ? (
          <p style={{ fontSize: 13, color: "var(--text-muted)" }}>Yükleniyor…</p>
        ) : slotsError ? (
          <p style={{ fontSize: 13, color: "var(--text-danger)" }}>{slotsError}</p>
        ) : slots.length === 0 ? (
          <p style={{ fontSize: 13, color: "var(--text-muted)" }}>Bu tarihte müsait saat yok.</p>
        ) : (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {slots.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSelectedTime(s)}
                style={{
                  background: selectedTime === s ? "var(--fill-accent)" : "var(--surface-1)",
                  color: selectedTime === s ? "var(--on-accent)" : "var(--text-primary)",
                  border: "0.5px solid var(--border)", fontSize: 13, padding: "6px 10px",
                }}
              >
                {s}
              </button>
            ))}
          </div>
        )}
      </div>
      {priceListItems && priceListItems.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 13, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Hizmet</label>
          <select
            value=""
            onChange={(e) => {
              const item = priceListItems.find((p) => p.id === e.target.value);
              if (item) { setNote(item.name); setValue(String(item.price)); }
            }}
            style={{ width: "100%" }}
          >
            <option value="">Elle gir / listeden seç</option>
            {priceListItems.map((p) => (
              <option key={p.id} value={p.id}>{p.name} — {formatTL(p.price)}</option>
            ))}
          </select>
        </div>
      )}
      <div style={{ marginBottom: 16 }}>
        <label style={{ fontSize: 13, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Ne için randevu almak istiyorsunuz?</label>
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder={`Örn. ${appointmentNoteExample(customerRow.companySector)}`} style={{ width: "100%" }} />
      </div>
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button type="button" onClick={onClose}>Vazgeç</button>
        <button
          type="button"
          disabled={!selectedTime || !note.trim() || !dateTimeKey || booking}
          onClick={confirm}
          style={{ background: "var(--fill-accent)", color: "var(--on-accent)", border: "none" }}
        >
          {booking ? "Alınıyor…" : "Randevuyu Onayla"}
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

function PortalSettings({ session, theme, onThemeChange, pushSubscribed, onSubscribe, onUnsubscribe, notify }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);

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
    <div>
      <div style={{ marginBottom: 20 }}>
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
            Firma size yanıt verdiğinde anında bildirim
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
        <form onSubmit={changePassword}>
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
      </div>
    </div>
  );
}

export default function CustomerPortal() {
  const [session, setSession] = useState(undefined);
  const [portalTab, setPortalTab] = useState("talepler");
  const [tickets, setTickets] = useState([]);
  const [ticketMessages, setTicketMessages] = useState([]);
  const [deals, setDeals] = useState([]);
  const [customerRows, setCustomerRows] = useState([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState(() => localStorage.getItem("binerly_portal_company") || null);
  const [groupClasses, setGroupClasses] = useState([]);
  const [groupClassEnrollments, setGroupClassEnrollments] = useState([]);
  const [priceListItems, setPriceListItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showNewTicketForm, setShowNewTicketForm] = useState(false);
  const [bookingFor, setBookingFor] = useState(null);
  const [viewingTicket, setViewingTicket] = useState(null);
  const [toast, setToast] = useState(null);
  const [pushSubscribed, setPushSubscribed] = useState(false);
  const [theme, setTheme] = useTheme();
  const [showPasswordRecovery, setShowPasswordRecovery] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(null); // { type: "appointment" | "enrollment", id }
  const [loadError, setLoadError] = useState(false);

  const notify = (message, tone = "danger") => setToast({ message, tone });

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
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      if (event === "PASSWORD_RECOVERY") setShowPasswordRecovery(true);
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session || !("serviceWorker" in navigator)) { setPushSubscribed(false); return; }
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
    if (t) setViewingTicket(t);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCompanyId]);

  useEffect(() => {
    if (!session) {
      setTickets([]); setTicketMessages([]); setDeals([]); setCustomerRows([]);
      setGroupClasses([]); setGroupClassEnrollments([]); setPriceListItems([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError(false);
    (async () => {
      try {
        await supabase
          .from("customer_portal_users")
          .upsert({ id: session.user.id, email: session.user.email }, { onConflict: "id", ignoreDuplicates: true });
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
        const { data: c, error: profileError } = await supabase.from("customer_profile_view").select("*");
        if (profileError) {
          // Burada sessizce customerRows=[] set edilirse müşteriye "hesabınız hiçbir
          // firmayla eşleşmedi" gibi YANLIŞ bir mesaj gösterilir — oysa asıl sebep
          // geçici bir ağ/DB hatası olabilir. Ayrı bir hata durumu gösteriyoruz.
          console.error("customer_profile_view load error:", profileError.message);
          setLoadError(true);
          return;
        }
        const rows = (c || []).map((r) => ({ id: r.id, userId: r.user_id, name: r.name, companyName: r.company_name, companySector: r.company_sector }));
        setCustomerRows(rows);
        const customerIds = rows.map((r) => r.id);

        if (customerIds.length === 0) {
          setTickets([]); setTicketMessages([]); setDeals([]);
          setGroupClasses([]); setGroupClassEnrollments([]); setPriceListItems([]);
          return;
        }

        const businessUserIds = [...new Set(rows.map((r) => r.userId))];

        const [
          { data: t, error: tError },
          { data: d, error: dError },
          { data: gce, error: gceError },
          { data: gc, error: gcError },
          { data: pli, error: pliError },
        ] = await Promise.all([
          supabase.from("tickets").select("*").is("deleted_at", null).in("customer_id", customerIds).order("created_at"),
          // Diğer sorgular gibi (tickets/group_classes) customer_id ile bilerek
          // sınırlanıyor — RLS'e tek başına güvenmeme prensibi (yukarıdaki yorum)
          // burada da geçerli.
          supabase.from("customer_deal_view").select("*").in("customer_id", customerIds).order("created_at"),
          supabase.from("group_class_enrollments").select("*").in("customer_id", customerIds),
          supabase.from("group_classes").select("*").is("deleted_at", null).in("user_id", businessUserIds).order("weekday").order("start_time"),
          supabase.from("price_list_items").select("*").in("user_id", businessUserIds).order("name"),
        ]);
        const firstError = tError || dError || gceError || gcError || pliError;
        if (firstError) { console.error("customer portal data load error:", firstError.message); setLoadError(true); }
        setGroupClassEnrollments((gce || []).map(rowToGroupClassEnrollment));
        setGroupClasses((gc || []).map(rowToGroupClass));
        setPriceListItems((pli || []).map(rowToPriceListItem));
        const ticketIds = (t || []).map((row) => row.id);
        const { data: tm, error: tmError } = ticketIds.length
          ? await supabase.from("ticket_messages").select("*").eq("is_internal", false).in("ticket_id", ticketIds).order("created_at")
          : { data: [] };
        if (tmError) console.error("ticket_messages load error:", tmError.message);

        setTickets((t || []).map(rowToTicket));
        setTicketMessages((tm || []).map(rowToTicketMessage));
        setDeals((d || []).map(rowToDeal));
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
      .insert({ user_id: row.userId, customer_id: customerId, subject, description, priority: "orta", status: "acik" })
      .select()
      .single();
    if (error) { notify(`Talep gönderilemedi: ${error.message}`); return; }
    setTickets((prev) => [...prev, rowToTicket(data)]);
    setShowNewTicketForm(false);

    // Talebin açıklamasını ilk "gelen" mesaj olarak da kaydediyoruz — böylece
    // yeni bir talep açmak da (var olan bir talebe yazmak gibi) okunmamış-mesaj
    // rozetini ve anlık bildirimi tetikliyor; yoksa müşterinin ilk teması sessiz kalırdı.
    const { data: msgData, error: msgError } = await supabase
      .from("ticket_messages")
      .insert({ user_id: row.userId, ticket_id: data.id, direction: "gelen", is_internal: false, content: description || subject })
      .select()
      .single();
    if (!msgError) setTicketMessages((prev) => [...prev, rowToTicketMessage(msgData)]);
  };

  const hasActiveMembership = (customerId) =>
    deals.some((d) => {
      if (d.customerId !== customerId || d.stage !== "kazanildi") return false;
      const endDate = d.customFields?.uyelik_bitis_tarihi ?? d.customFields?.kurs_bitis_tarihi;
      return !endDate || endDate >= new Date().toISOString().slice(0, 10);
    });

  const enrollInClass = async ({ groupClassId, customerId }) => {
    const row = customerRows.find((c) => c.id === customerId);
    const group = groupClasses.find((g) => g.id === groupClassId);
    if (!row || !group) return;
    if (!hasActiveMembership(customerId)) { notify(groupClassWords(row.companySector).portalEligibility); return; }
    const count = groupClassEnrollments.filter((e) => e.groupClassId === groupClassId).length;
    if (count >= group.capacity) { notify("Bu ders dolu."); return; }
    if (groupClassEnrollments.some((e) => e.groupClassId === groupClassId && e.customerId === customerId)) { notify("Zaten kayıtlısınız."); return; }
    const { data, error } = await supabase
      .from("group_class_enrollments")
      .insert({ id: uid(), user_id: row.userId, group_class_id: groupClassId, customer_id: customerId })
      .select()
      .single();
    if (error) { notify(`Derse katılamadınız: ${error.message}`); return; }
    setGroupClassEnrollments((prev) => [...prev, rowToGroupClassEnrollment(data)]);
    notify("Derse kaydınız yapıldı.", "success");
  };

  const cancelEnrollment = async (enrollmentId) => {
    const { error } = await supabase.from("group_class_enrollments").delete().eq("id", enrollmentId);
    if (error) { notify(`İptal edilemedi: ${error.message}`); return; }
    setGroupClassEnrollments((prev) => prev.filter((e) => e.id !== enrollmentId));
    notify("Kaydınız iptal edildi.", "success");
  };

  const bookAppointment = async ({ customerId, businessUserId, dateTime, dateTimeKey, note, value }) => {
    const row = {
      id: uid(), user_id: businessUserId, customer_id: customerId,
      title: (note || "").trim() || "Randevu talebi", value: Number(value) || 0, stage: "ilk_gorusme",
      // dateTimeKey, işletmenin gerçek sektör alanı (örn. randevu_tarihi/gorusme_tarihi)
      // — normal DealForm/PDF/hatırlatma akışında görünsün diye. portal_randevu_zamani
      // ise sektörden bağımsız sabit anahtar — iptal/bildirim/gösterim mantığı bunu okur.
      custom_fields: { [dateTimeKey]: dateTime, portal_randevu_zamani: dateTime, kaynak: "portal" },
    };
    const { data, error } = await supabase.from("deals").insert(row).select().single();
    if (error) { notify(`Randevu alınamadı: ${error.message}`); return false; }
    setDeals((prev) => [...prev, rowToDeal(data)]);
    notify("Randevunuz alındı.", "success");
    return true;
  };

  const cancelAppointment = async (dealId) => {
    const { error } = await supabase.from("deals").update({ stage: "kaybedildi" }).eq("id", dealId);
    if (error) { notify(`İptal edilemedi: ${error.message}`); return; }
    setDeals((prev) => prev.map((d) => (d.id === dealId ? { ...d, stage: "kaybedildi" } : d)));
    notify("Randevunuz iptal edildi.", "success");
  };

  const addMessage = async ({ ticketId, content }) => {
    const ticket = tickets.find((t) => t.id === ticketId);
    if (!ticket) return;
    const { data, error } = await supabase
      .from("ticket_messages")
      .insert({ user_id: ticket.userId, ticket_id: ticketId, direction: "gelen", is_internal: false, content })
      .select()
      .single();
    if (error) { notify(`Mesaj gönderilemedi: ${error.message}`); return; }
    setTicketMessages((prev) => [...prev, rowToTicketMessage(data)]);
    // Yanıt vermek, firmadan gelen bekleyen mesajı "okundu/yanıtlandı" sayar.
    await markMessagesRead(ticketId, "giden");
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

  if (session === undefined) return <div style={{ padding: "2rem", textAlign: "center", color: "var(--text-secondary)" }}>Yükleniyor…</div>;
  if (!session) return <CustomerAuthForm />;
  if (loading) return <div style={{ padding: "2rem 0", textAlign: "center", color: "var(--text-secondary)" }}>Yükleniyor…</div>;

  const currentTicket = viewingTicket ? tickets.find((t) => t.id === viewingTicket.id) || viewingTicket : null;
  const currentMessages = currentTicket ? ticketMessages.filter((m) => m.ticketId === currentTicket.id) : [];

  // Birden fazla firmaya bağlıysa (aynı e-posta ile), müşteri önce hangi firmayla
  // işlem yapmak istediğini seçer — sonrasında tüm ekran (sekmeler, randevu/ders
  // alanları) SADECE o firmaya göre şekillenir, farklı firmaların verisi asla
  // karışmaz. Tek firmaya bağlıysa activeCustomerRow otomatik seçilir (yukarıdaki
  // useEffect), müşteri hiçbir seçim ekranı görmez.
  const activeCustomerRow = customerRows.find((r) => r.id === selectedCompanyId) || null;
  const showCompanyPicker = customerRows.length > 1 && !activeCustomerRow;

  const visibleCustomerRows = activeCustomerRow ? [activeCustomerRow] : [];
  const visibleTickets = activeCustomerRow ? tickets.filter((t) => t.customerId === activeCustomerRow.id) : [];
  const visibleDeals = activeCustomerRow ? deals.filter((d) => d.customerId === activeCustomerRow.id) : [];
  const visibleGroupClasses = activeCustomerRow ? groupClasses.filter((g) => g.userId === activeCustomerRow.userId) : [];

  const unreadCountByTicket = ticketMessages.reduce((acc, m) => {
    if (m.direction === "giden" && !m.readAt) acc[m.ticketId] = (acc[m.ticketId] || 0) + 1;
    return acc;
  }, {});

  const companyNameByCustomerId = Object.fromEntries(visibleCustomerRows.map((c) => [c.id, c.companyName || c.name]));
  const sectorByCustomerId = Object.fromEntries(visibleCustomerRows.map((c) => [c.id, c.companySector]));
  const totalUnreadTickets = visibleTickets.filter((t) => unreadCountByTicket[t.id] > 0).length;

  const dealKind = dealWordKind(activeCustomerRow?.companySector);
  const appointmentCompanies = activeCustomerRow && supportsSelfBooking(activeCustomerRow.companySector) ? [activeCustomerRow] : [];
  const showDersler = supportsGroupClasses(activeCustomerRow?.companySector) && visibleGroupClasses.length > 0;

  return (
    <div style={{ maxWidth: 980, margin: "0 auto", padding: "24px 16px 64px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1.5rem" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <img src="/favicon.svg" alt="Binerly" style={{ width: 31, height: 31 }} />
            <h1 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>Binerly — Müşteri Bilgi Sistemi</h1>
          </div>
          <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: 0 }}>Taleplerinizi ve {PORTAL_DEAL_WORDS[dealKind].possAcc} buradan takip edin</p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <NotificationBell userId={session.user.id} supabase={supabase} />
          {customerRows.length > 1 && activeCustomerRow && (
            <button
              onClick={() => setSelectedCompanyId(null)}
              style={{ fontSize: 12, color: "var(--text-secondary)", background: "none", border: "0.5px solid var(--border)", display: "flex", alignItems: "center", gap: 4 }}
              title="Başka bir işletme seç"
            >
              <i className="ti ti-building-store" style={{ fontSize: 14 }} aria-hidden="true"></i>
              İşletme değiştir
            </button>
          )}
          <button
            onClick={() => supabase.auth.signOut()}
            style={{ fontSize: 12, color: "var(--text-secondary)", background: "none", border: "0.5px solid var(--border)", display: "flex", alignItems: "center", gap: 4 }}
            title="Çıkış yap"
          >
            <i className="ti ti-logout" style={{ fontSize: 14 }} aria-hidden="true"></i>
            Çıkış
          </button>
        </div>
      </div>

      {loadError ? (
        <p style={{ fontSize: 14, color: "var(--text-danger)" }}>
          Verileriniz yüklenirken bir hata oluştu. Lütfen sayfayı yenileyip tekrar deneyin.
        </p>
      ) : customerRows.length === 0 ? (
        <p style={{ fontSize: 14, color: "var(--text-secondary)" }}>
          Hesabınız henüz bir firmayla eşleşmedi. Kayıt olurken kullandığınız e-postanın, ilgili firmanın sisteminde kayıtlı e-posta ile aynı olduğundan emin olun.
        </p>
      ) : customerRows.length === 1 && !activeCustomerRow ? (
        // Tek firmaya bağlı müşteri için otomatik seçim efekti henüz işlenmeden
        // önceki tek karelik an — boş sekme yerine kısa bir yükleniyor gösterilir.
        <div style={{ textAlign: "center", color: "var(--text-secondary)", padding: "2rem 0" }}>Yükleniyor…</div>
      ) : showCompanyPicker ? (
        <div>
          <p style={{ fontSize: 14, color: "var(--text-secondary)", margin: "0 0 16px" }}>
            Birden fazla işletmeyle bağlantılısınız — hangisiyle işlem yapmak istiyorsunuz?
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {customerRows.map((row) => {
              const preset = SECTOR_PRESETS.find((s) => s.id === row.companySector);
              return (
                <button
                  key={row.id}
                  onClick={() => setSelectedCompanyId(row.id)}
                  style={{
                    display: "flex", alignItems: "center", gap: 12, textAlign: "left",
                    background: "var(--surface-1)", border: "0.5px solid var(--border)", borderRadius: "var(--radius)",
                    padding: "0.9rem 1rem", fontSize: 14, color: "var(--text-primary)",
                  }}
                >
                  <i className={`ti ${preset?.icon || "ti-building-store"}`} style={{ fontSize: 20, color: "var(--fill-accent)", flex: "none" }} aria-hidden="true"></i>
                  <span style={{ flex: 1 }}>
                    <span style={{ display: "block", fontWeight: 600 }}>{row.companyName || row.name}</span>
                    {preset && <span style={{ display: "block", fontSize: 12, color: "var(--text-secondary)" }}>{preset.label}</span>}
                  </span>
                  <i className="ti ti-chevron-right" style={{ fontSize: 16, color: "var(--text-muted)" }} aria-hidden="true"></i>
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <>
          <div style={{ display: "flex", gap: 8, marginBottom: "1.5rem" }}>
            {[
              { id: "talepler", label: "Taleplerim", icon: "ti-ticket" },
              { id: "teklifler", label: PORTAL_DEAL_WORDS[dealKind].tabLabel, icon: "ti-file-text" },
              ...(showDersler ? [{ id: "dersler", label: "Derslerim", icon: "ti-calendar-time" }] : []),
              { id: "ayarlar", label: "Ayarlar", icon: "ti-adjustments" },
            ].map((t) => (
              <button
                key={t.id}
                onClick={() => setPortalTab(t.id)}
                style={{
                  flex: 1,
                  border: portalTab === t.id ? "0.5px solid var(--border-strong)" : "0.5px solid var(--border)",
                  background: portalTab === t.id ? "var(--surface-1)" : "transparent",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                  position: "relative",
                }}
              >
                <i className={`ti ${t.icon}`} style={{ fontSize: 16 }} aria-hidden="true"></i>
                {t.label}
                {t.id === "talepler" && totalUnreadTickets > 0 && (
                  <span
                    style={{
                      position: "absolute", top: -6, right: -6, minWidth: 18, height: 18, borderRadius: 9,
                      background: "var(--text-danger)", color: "var(--on-accent)", fontSize: 11, fontWeight: 700,
                      display: "flex", alignItems: "center", justifyContent: "center", padding: "0 4px",
                    }}
                  >
                    {totalUnreadTickets}
                  </span>
                )}
              </button>
            ))}
          </div>

          {portalTab === "talepler" && (
            <div>
              <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
                <button
                  onClick={() => setShowNewTicketForm(true)}
                  style={{ background: "var(--fill-accent)", color: "var(--on-accent)", border: "none", display: "flex", alignItems: "center", gap: 6 }}
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

          {portalTab === "teklifler" && (
            <div>
              {appointmentCompanies.length > 0 && (
                <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
                  {appointmentCompanies.map((row) => (
                    <button
                      key={row.id}
                      onClick={() => setBookingFor(row)}
                      style={{ background: "var(--fill-accent)", color: "var(--on-accent)", border: "none", display: "flex", alignItems: "center", gap: 6 }}
                    >
                      <i className="ti ti-plus" style={{ fontSize: 16 }} aria-hidden="true"></i>
                      {appointmentCompanies.length > 1 ? `${row.companyName || row.name} — Randevu Al` : "Randevu Al"}
                    </button>
                  ))}
                </div>
              )}
              <PortalDealList deals={visibleDeals} companyNameByCustomerId={companyNameByCustomerId} sectorByCustomerId={sectorByCustomerId} showCompany={false} dealKind={dealKind} onCancelAppointment={(id) => setConfirmCancel({ type: "appointment", id })} />
            </div>
          )}

          {portalTab === "dersler" && (
            <PortalGroupClasses
              groupClasses={visibleGroupClasses}
              groupClassEnrollments={groupClassEnrollments}
              customerRows={visibleCustomerRows}
              showCompany={false}
              hasActiveMembership={hasActiveMembership}
              onEnroll={enrollInClass}
              onCancel={(id) => setConfirmCancel({ type: "enrollment", id })}
            />
          )}

          {portalTab === "ayarlar" && (
            <PortalSettings
              session={session}
              theme={theme}
              onThemeChange={setTheme}
              pushSubscribed={pushSubscribed}
              onSubscribe={subscribeToPush}
              onUnsubscribe={unsubscribeFromPush}
              notify={notify}
            />
          )}
        </>
      )}

      {showNewTicketForm && (
        <Modal title="Yeni destek talebi" onClose={() => setShowNewTicketForm(false)}>
          <PortalNewTicketForm customerRows={visibleCustomerRows} onSave={createTicket} onCancel={() => setShowNewTicketForm(false)} />
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

      {confirmCancel && (
        <ConfirmDialog
          title="İptal edilsin mi?"
          message={confirmCancel.type === "appointment" ? "Randevunuzu iptal etmek istediğinizden emin misiniz? Bu işlem geri alınamaz." : "Bu derse kaydınızı iptal etmek istediğinizden emin misiniz? Bu işlem geri alınamaz."}
          confirmLabel="İptal Et"
          onClose={() => setConfirmCancel(null)}
          onConfirm={async () => {
            if (confirmCancel.type === "appointment") await cancelAppointment(confirmCancel.id);
            else await cancelEnrollment(confirmCancel.id);
            setConfirmCancel(null);
          }}
        />
      )}

      {toast && <Toast message={toast.message} tone={toast.tone} onClose={() => setToast(null)} />}
    </div>
  );
}
