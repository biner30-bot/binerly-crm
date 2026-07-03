import React, { useState, useEffect } from "react";
import { supabase } from "./supabase";
import { Badge, Modal, Toast, formatTL, useSessionTimeout } from "./shared";

const STAGES = [
  { id: "ilk_gorusme", label: "İlk görüşme" },
  { id: "teklif", label: "Teklif verildi" },
  { id: "muzakere", label: "Müzakere" },
  { id: "kazanildi", label: "Kazanıldı" },
  { id: "kaybedildi", label: "Kaybedildi" },
];

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
  return {
    id: r.id,
    customerId: r.customer_id,
    title: r.title,
    value: r.value,
    stage: r.stage,
    createdAt: r.created_at,
  };
}

function formatDateTime(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleDateString("tr-TR", { day: "numeric", month: "short", year: "numeric" }) +
    " · " + d.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
}

function CustomerAuthForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState("login");
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
      const { error } = await supabase.auth.signUp({ email, password });
      if (error) setMessage(error.message);
      else setMessage("Kayıt başarılı! E-postanıza gelen doğrulama linkine tıklayın.");
    }
    setLoading(false);
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f5f8fc", padding: "1rem" }}>
      <div style={{ background: "#fff", borderRadius: 16, padding: "2rem", width: "100%", maxWidth: 400 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
          <img src="/favicon.svg" alt="Binerly" style={{ width: 28, height: 28 }} />
          <span style={{ fontWeight: 700, fontSize: 16, color: "#0c2540" }}>Binerly Müşteri Bilgi Sistemi</span>
        </div>
        <h2 style={{ fontSize: 18, fontWeight: 700, margin: "0 0 4px", color: "#0c2540" }}>
          {mode === "login" ? "Giriş yap" : "Hesap oluştur"}
        </h2>
        <p style={{ fontSize: 13, color: "#5b7088", margin: "0 0 20px" }}>
          Bir firmanın müşterisiyseniz, taleplerinizi ve tekliflerinizi buradan takip edin.
        </p>
        <form onSubmit={submit}>
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 13, color: "#5b7088", display: "block", marginBottom: 4 }}>E-posta</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required style={{ width: "100%", padding: "10px 12px", border: "1px solid #e1e8f0", borderRadius: 8, fontSize: 14, boxSizing: "border-box" }} />
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 13, color: "#5b7088", display: "block", marginBottom: 4 }}>Şifre</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required style={{ width: "100%", padding: "10px 12px", border: "1px solid #e1e8f0", borderRadius: 8, fontSize: 14, boxSizing: "border-box" }} />
          </div>
          {message && <p style={{ fontSize: 13, color: "#b45309", marginBottom: 12 }}>{message}</p>}
          <button type="submit" disabled={loading} style={{ width: "100%", background: "#185fa5", color: "#fff", border: "none", borderRadius: 8, padding: "11px", fontSize: 15, fontWeight: 600, cursor: "pointer" }}>
            {loading ? "Yükleniyor…" : mode === "login" ? "Giriş yap" : "Kayıt ol"}
          </button>
        </form>
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
        <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Örn. Kargo gecikti" style={{ width: "100%" }} />
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

function PortalTicketList({ tickets, unreadCountByTicket, onOpenTicket }) {
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
              <p style={{ margin: 0, fontSize: 12, color: "var(--text-secondary)" }}>{formatDateTime(t.createdAt)}</p>
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

function PortalDealList({ deals }) {
  if (deals.length === 0) {
    return <p style={{ fontSize: 14, color: "var(--text-secondary)" }}>Henüz bir teklifiniz yok.</p>;
  }
  const sorted = [...deals].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {sorted.map((d) => {
        const stageInfo = STAGES.find((s) => s.id === d.stage);
        const tone = d.stage === "kazanildi" ? "success" : d.stage === "kaybedildi" ? "default" : d.stage === "muzakere" ? "warning" : "accent";
        return (
          <div key={d.id} style={{ background: "var(--surface-1)", borderRadius: "var(--radius)", padding: "0.75rem 1rem", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <p style={{ margin: 0, fontWeight: 500, fontSize: 14 }}>{d.title}</p>
            <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
              <Badge tone={tone}>{stageInfo?.label}</Badge>
              <span style={{ fontSize: 13, fontWeight: 600, minWidth: 90, textAlign: "right" }}>{formatTL(d.value)}</span>
            </div>
          </div>
        );
      })}
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
  const [loading, setLoading] = useState(true);
  const [showNewTicketForm, setShowNewTicketForm] = useState(false);
  const [viewingTicket, setViewingTicket] = useState(null);
  const [toast, setToast] = useState(null);

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
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, s) => setSession(s));
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) {
      setTickets([]); setTicketMessages([]); setDeals([]); setCustomerRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    (async () => {
      await supabase
        .from("customer_portal_users")
        .upsert({ id: session.user.id, email: session.user.email }, { onConflict: "id", ignoreDuplicates: true });
      await supabase.from("customers").update({ portal_user_id: session.user.id }).is("portal_user_id", null).ilike("email", session.user.email);

      // Önce sadece kendi bağlı müşteri kayıtlarımızı öğreniyoruz, sonra tickets/ticket_messages
      // sorgularını bilerek bu customer_id'lerle sınırlıyoruz — RLS'e tek başına güvenmiyoruz,
      // çünkü aynı hesap hem şirket sahibi hem müşteri ise RLS politikaları "veya" ile birleşip
      // şirketin TÜM taleplerini de döndürebilir. Bu ekstra filtre buna karşı bir güvenlik katmanı.
      const { data: c } = await supabase.from("customer_profile_view").select("*");
      const rows = (c || []).map((r) => ({ id: r.id, userId: r.user_id, name: r.name, companyName: r.company_name }));
      setCustomerRows(rows);
      const customerIds = rows.map((r) => r.id);

      if (customerIds.length === 0) {
        setTickets([]); setTicketMessages([]); setDeals([]);
        setLoading(false);
        return;
      }

      const [{ data: t }, { data: d }] = await Promise.all([
        supabase.from("tickets").select("*").in("customer_id", customerIds).order("created_at"),
        supabase.from("customer_deal_view").select("*").order("created_at"),
      ]);
      const ticketIds = (t || []).map((row) => row.id);
      const { data: tm } = ticketIds.length
        ? await supabase.from("ticket_messages").select("*").in("ticket_id", ticketIds).order("created_at")
        : { data: [] };

      setTickets((t || []).map(rowToTicket));
      setTicketMessages((tm || []).map(rowToTicketMessage));
      setDeals((d || []).map(rowToDeal));
      setLoading(false);
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

  const unreadCountByTicket = ticketMessages.reduce((acc, m) => {
    if (m.direction === "giden" && !m.readAt) acc[m.ticketId] = (acc[m.ticketId] || 0) + 1;
    return acc;
  }, {});
  const totalUnreadTickets = Object.keys(unreadCountByTicket).length;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1.5rem" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <img src="/favicon.svg" alt="Binerly" style={{ width: 22, height: 22 }} />
            <h1 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>Binerly — Müşteri Bilgi Sistemi</h1>
          </div>
          <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: 0 }}>Taleplerinizi ve tekliflerinizi buradan takip edin</p>
        </div>
        <button
          onClick={() => supabase.auth.signOut()}
          style={{ fontSize: 12, color: "var(--text-secondary)", background: "none", border: "0.5px solid var(--border)", display: "flex", alignItems: "center", gap: 4 }}
          title="Çıkış yap"
        >
          <i className="ti ti-logout" style={{ fontSize: 14 }} aria-hidden="true"></i>
          Çıkış
        </button>
      </div>

      {customerRows.length === 0 ? (
        <p style={{ fontSize: 14, color: "var(--text-secondary)" }}>
          Hesabınız henüz bir firmayla eşleşmedi. Kayıt olurken kullandığınız e-postanın, ilgili firmanın sisteminde kayıtlı e-posta ile aynı olduğundan emin olun.
        </p>
      ) : (
        <>
          <div style={{ display: "flex", gap: 8, marginBottom: "1.5rem" }}>
            {[
              { id: "talepler", label: "Taleplerim", icon: "ti-ticket" },
              { id: "teklifler", label: "Tekliflerim", icon: "ti-file-text" },
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
                      background: "var(--text-danger)", color: "#fff", fontSize: 11, fontWeight: 700,
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
              <PortalTicketList tickets={tickets} unreadCountByTicket={unreadCountByTicket} onOpenTicket={setViewingTicket} />
            </div>
          )}

          {portalTab === "teklifler" && <PortalDealList deals={deals} />}
        </>
      )}

      {showNewTicketForm && (
        <Modal title="Yeni destek talebi" onClose={() => setShowNewTicketForm(false)}>
          <PortalNewTicketForm customerRows={customerRows} onSave={createTicket} onCancel={() => setShowNewTicketForm(false)} />
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

      {toast && <Toast message={toast.message} tone={toast.tone} onClose={() => setToast(null)} />}
    </div>
  );
}
