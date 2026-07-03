import React, { useState, useEffect } from "react";
import { Badge, Modal, InfoTip, ConfirmDialog, uid } from "./shared";

const PRIORITIES = [
  { id: "acil", label: "Acil", hours: 4 },
  { id: "yuksek", label: "Yüksek", hours: 24 },
  { id: "orta", label: "Orta", hours: 48 },
  { id: "dusuk", label: "Düşük", hours: 72 },
];

const PRIORITY_TONE = { acil: "danger", yuksek: "warning", orta: "accent", dusuk: "default" };

const STATUSES = [
  { id: "acik", label: "Açık" },
  { id: "islemde", label: "İşlemde" },
  { id: "musteri_bekleniyor", label: "Müşteri yanıtı bekleniyor" },
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

export const TERMINAL_STATUSES = ["cozuldu", "kapatildi"];

const KB_TEMPLATES = [
  {
    title: "Siparişim ne zaman kargoya verilir?",
    category: "Kargo & Teslimat",
    content:
      "Siparişleriniz onaylandıktan sonra ortalama [1-3 iş günü] içinde kargoya verilir. " +
      "Kargoya verildiğinde takip numaranız [e-posta/SMS ile] tarafınıza iletilir. " +
      "Yoğun dönemlerde (kampanya, tatil öncesi vb.) bu süre uzayabilir.",
  },
  {
    title: "Kargom hasarlı veya eksik geldi, ne yapmalıyım?",
    category: "Kargo & Teslimat",
    content:
      "Paketinizi teslim alırken hasar fark ederseniz kargo görevlisine tutanak tutturmanızı rica ederiz. " +
      "Hasarlı/eksik ürün fotoğraflarını ve sipariş numaranızı bizimle paylaşırsanız en kısa sürede " +
      "yeni ürün gönderimi veya iade süreci başlatılır.",
  },
  {
    title: "Fatura bilgilerimi nasıl güncellerim?",
    category: "Fatura & Ödeme",
    content:
      "Fatura bilgilerinizi (ad-soyad/unvan, adres, vergi no) güncellemek için bizimle iletişime geçmeniz yeterli. " +
      "Zaten kesilmiş bir faturada değişiklik için [muhasebe/mali müşavir süreciniz burada belirtilebilir].",
  },
  {
    title: "Ürün iadesi nasıl yapılır?",
    category: "İade & Değişim",
    content:
      "Ürünü teslim aldığınız tarihten itibaren [14 gün] içinde, kullanılmamış ve orijinal ambalajında olması " +
      "koşuluyla iade edebilirsiniz. İade talebiniz onaylandıktan sonra ücret [X iş günü] içinde iade edilir.",
  },
  {
    title: "Destek talebimin durumunu nasıl takip ederim?",
    category: "Destek",
    content:
      "Bize e-posta adresinizle kayıtlıysanız, Müşteri Bilgi Sistemi üzerinden (binerly.com/portal) " +
      "kendi hesabınızla giriş yaparak tüm destek taleplerinizin güncel durumunu ve mesaj geçmişini görebilirsiniz.",
  },
];

const PRIORITY_INFO_TEXT =
  "Öncelik, talebin hedef çözüm süresini (talep oluşturulduğu andan itibaren) belirler:\n" +
  "Acil → 4 saat\n" +
  "Yüksek → 24 saat\n" +
  "Orta → 48 saat\n" +
  "Düşük → 72 saat";

const SLA_INFO_TEXT =
  "Talep hâlâ açıksa, hedef süreye kalan zamana göre:\n" +
  "🟢 Zamanında — kalan süre hedefin %20'sinden fazla\n" +
  "🟠 Süre yaklaşıyor — kalan süre hedefin son %20'lik diliminde (Acil'de son 48 dk, Yüksek'te son ~5 sa, Orta'da son ~10 sa, Düşük'te son ~14 sa)\n" +
  "🔴 SLA aşıldı — hedef süre geçti\n\n" +
  "Talep Çözüldü/Kapatıldı ise: çözülme anı hedeften önceyse zamanında, sonraysa SLA aşıldı sayılır.";

const MESSAGE_DIRECTIONS = [
  { id: "giden", label: "Giden (müşteriye)", icon: "ti-arrow-up-right" },
  { id: "gelen", label: "Gelen (müşteriden)", icon: "ti-arrow-down-left" },
];

function getSlaDueAt(priority, createdAt) {
  const hours = PRIORITIES.find((p) => p.id === priority)?.hours ?? 48;
  return new Date(new Date(createdAt).getTime() + hours * 3600000);
}

export function getSlaStatus(ticket) {
  const dueAt = getSlaDueAt(ticket.priority, ticket.createdAt);
  const isTerminal = TERMINAL_STATUSES.includes(ticket.status);

  if (isTerminal) {
    const resolvedAt = ticket.resolvedAt ? new Date(ticket.resolvedAt) : new Date();
    const onTime = resolvedAt <= dueAt;
    return {
      dueAt,
      isBreached: !onTime,
      isApproaching: false,
      tone: onTime ? "success" : "danger",
      label: onTime ? "Zamanında çözüldü" : "SLA aşıldı",
    };
  }

  const remainingMs = dueAt.getTime() - Date.now();
  const totalMs = dueAt.getTime() - new Date(ticket.createdAt).getTime();

  if (remainingMs <= 0) {
    return { dueAt, isBreached: true, isApproaching: false, tone: "danger", label: "SLA aşıldı" };
  }
  if (remainingMs <= totalMs * 0.2) {
    return { dueAt, isBreached: false, isApproaching: true, tone: "warning", label: "Süre yaklaşıyor" };
  }
  return { dueAt, isBreached: false, isApproaching: false, tone: "success", label: "Zamanında" };
}

export function rowToTicket(r) {
  return {
    id: r.id,
    customerId: r.customer_id,
    subject: r.subject,
    description: r.description || "",
    priority: r.priority,
    status: r.status,
    resolvedAt: r.resolved_at,
    createdAt: r.created_at,
  };
}

export function rowToTicketMessage(r) {
  return {
    id: r.id,
    ticketId: r.ticket_id,
    direction: r.direction,
    content: r.content,
    isInternal: r.is_internal || false,
    createdAt: r.created_at,
    readAt: r.read_at || null,
  };
}

export function rowToKbArticle(r) {
  return {
    id: r.id,
    title: r.title,
    category: r.category || "",
    content: r.content,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function formatDateTime(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleDateString("tr-TR", { day: "numeric", month: "short", year: "numeric" }) +
    " · " + d.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
}

function TicketForm({ customers, initial, onSave, onCancel }) {
  const [customerId, setCustomerId] = useState(initial?.customerId || customers[0]?.id || "");
  const [subject, setSubject] = useState(initial?.subject || "");
  const [description, setDescription] = useState(initial?.description || "");
  const [priority, setPriority] = useState(initial?.priority || "orta");
  const [status, setStatus] = useState(initial?.status || "acik");

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!customerId || !subject.trim()) return;
        const isTerminal = TERMINAL_STATUSES.includes(status);
        onSave({
          id: initial?.id || uid(),
          customerId,
          subject: subject.trim(),
          description: description.trim(),
          priority,
          status,
          resolvedAt: isTerminal ? (initial?.resolvedAt || new Date().toISOString()) : null,
          createdAt: initial?.createdAt || new Date().toISOString(),
        });
      }}
    >
      <div style={{ marginBottom: 12 }}>
        <label style={{ fontSize: 13, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Müşteri</label>
        {customers.length === 0 ? (
          <p style={{ fontSize: 13, color: "var(--text-muted)" }}>Önce bir müşteri ekleyin.</p>
        ) : (
          <select value={customerId} onChange={(e) => setCustomerId(e.target.value)} style={{ width: "100%" }}>
            {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        )}
      </div>
      <div style={{ marginBottom: 12 }}>
        <label style={{ fontSize: 13, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Konu</label>
        <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Örn. Kargo gecikti" style={{ width: "100%" }} />
      </div>
      <div style={{ display: "flex", gap: 12, marginBottom: 12 }}>
        <div style={{ flex: 1 }}>
          <label style={{ fontSize: 13, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Öncelik</label>
          <select value={priority} onChange={(e) => setPriority(e.target.value)} style={{ width: "100%" }}>
            {PRIORITIES.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
        </div>
        <div style={{ flex: 1 }}>
          <label style={{ fontSize: 13, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Durum</label>
          <select value={status} onChange={(e) => setStatus(e.target.value)} style={{ width: "100%" }}>
            {STATUSES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </div>
      </div>
      <div style={{ marginBottom: 16 }}>
        <label style={{ fontSize: 13, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Açıklama</label>
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Talebin detayları" style={{ width: "100%", minHeight: 80, resize: "vertical" }} />
      </div>
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button type="button" onClick={onCancel}>Vazgeç</button>
        <button type="submit" disabled={customers.length === 0} style={{ background: "var(--fill-accent)", color: "var(--on-accent)", border: "none" }}>Kaydet</button>
      </div>
    </form>
  );
}

function TicketList({ tickets, customers, unreadCountByTicket, statusFilter, onFilterChange, onOpenTicket, onEditTicket, onDeleteTicket }) {
  const [confirmDelete, setConfirmDelete] = useState(null);
  const customerById = (id) => customers.find((c) => c.id === id);
  const filtered = statusFilter === "all" ? tickets : tickets.filter((t) => t.status === statusFilter);

  const slaRank = { danger: 0, warning: 1, success: 2 };
  const sorted = [...filtered].sort((a, b) => {
    const aOpen = !TERMINAL_STATUSES.includes(a.status);
    const bOpen = !TERMINAL_STATUSES.includes(b.status);
    if (aOpen !== bOpen) return aOpen ? -1 : 1;
    const aSla = slaRank[getSlaStatus(a).tone] ?? 3;
    const bSla = slaRank[getSlaStatus(b).tone] ?? 3;
    if (aSla !== bSla) return aSla - bSla;
    return new Date(a.createdAt) - new Date(b.createdAt);
  });

  return (
    <div>
      <div style={{ marginBottom: 12 }}>
        <select value={statusFilter} onChange={(e) => onFilterChange(e.target.value)} style={{ width: 240 }}>
          <option value="all">Tüm durumlar</option>
          {STATUSES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>
      </div>
      {sorted.length === 0 ? (
        <p style={{ fontSize: 14, color: "var(--text-secondary)" }}>Bu filtreye uyan talep yok.</p>
      ) : (
        <div>
          <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: "0 8px" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", padding: "0 12px", fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.3 }}>Talep</th>
                <th style={{ textAlign: "left", padding: "0 12px", fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.3, whiteSpace: "nowrap" }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>Öncelik <InfoTip text={PRIORITY_INFO_TEXT} /></span>
                </th>
                <th style={{ textAlign: "left", padding: "0 12px", fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.3, whiteSpace: "nowrap" }}>Durum</th>
                <th style={{ textAlign: "left", padding: "0 12px", fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.3, whiteSpace: "nowrap" }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>SLA <InfoTip text={SLA_INFO_TEXT} /></span>
                </th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((t) => {
                const c = customerById(t.customerId);
                const statusInfo = STATUSES.find((s) => s.id === t.status);
                const priorityInfo = PRIORITIES.find((p) => p.id === t.priority);
                const sla = getSlaStatus(t);
                return (
                  <tr key={t.id} style={{ background: "var(--surface-1)" }}>
                    <td onClick={() => onOpenTicket(t)} style={{ padding: "10px 12px", borderRadius: "var(--radius) 0 0 var(--radius)", cursor: "pointer" }}>
                      <p style={{ margin: 0, fontWeight: 500, fontSize: 14, display: "flex", alignItems: "center", gap: 6 }}>
                        {t.subject}
                        {unreadCountByTicket[t.id] > 0 && (
                          <Badge tone="accent">{unreadCountByTicket[t.id]} yeni mesaj</Badge>
                        )}
                      </p>
                      <p style={{ margin: 0, fontSize: 12, color: "var(--text-secondary)" }}>{c?.name || "Bilinmeyen müşteri"}</p>
                    </td>
                    <td style={{ padding: "10px 12px", whiteSpace: "nowrap" }}>
                      <span style={{ fontSize: 12, color: `var(--text-${PRIORITY_TONE[t.priority]})`, display: "flex", alignItems: "center", gap: 4 }}>
                        <i className="ti ti-point-filled" style={{ fontSize: 14 }} aria-hidden="true"></i>
                        {priorityInfo?.label}
                      </span>
                    </td>
                    <td style={{ padding: "10px 12px", whiteSpace: "nowrap" }}>
                      <Badge tone={STATUS_TONE[t.status] || "default"}>{statusInfo?.label}</Badge>
                    </td>
                    <td style={{ padding: "10px 12px", whiteSpace: "nowrap" }}>
                      <Badge tone={sla.tone}>{sla.label}</Badge>
                    </td>
                    <td style={{ padding: "10px 12px", borderRadius: "0 var(--radius) var(--radius) 0" }}>
                      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                        <button onClick={() => onOpenTicket(t)} title="Detay ve mesaj geçmişi" style={{ width: 32, height: 32, padding: 0 }}>
                          <i className="ti ti-message-circle" style={{ fontSize: 16 }} aria-hidden="true"></i>
                        </button>
                        <button onClick={() => onEditTicket(t)} style={{ width: 32, height: 32, padding: 0 }}>
                          <i className="ti ti-edit" style={{ fontSize: 16 }} aria-hidden="true"></i>
                        </button>
                        <button onClick={() => setConfirmDelete(t)} style={{ width: 32, height: 32, padding: 0 }}>
                          <i className="ti ti-trash" style={{ fontSize: 16 }} aria-hidden="true"></i>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {confirmDelete && (
        <ConfirmDialog
          title="Talebi sil"
          message="Bu destek talebini silmek istediğinize emin misiniz? Mesaj geçmişi de silinecek, bu işlem geri alınamaz."
          onConfirm={() => { onDeleteTicket(confirmDelete.id); setConfirmDelete(null); }}
          onClose={() => setConfirmDelete(null)}
        />
      )}
    </div>
  );
}

function TicketDetail({ ticket, customer, messages, onAddMessage, onStatusChange, onClose }) {
  const [direction, setDirection] = useState("giden");
  const [content, setContent] = useState("");
  const [isInternal, setIsInternal] = useState(false);
  const [saving, setSaving] = useState(false);

  const sla = getSlaStatus(ticket);
  const priorityInfo = PRIORITIES.find((p) => p.id === ticket.priority);
  const sortedMessages = [...messages].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  // Yeni talep açılırken açıklama otomatik olarak ilk "gelen" mesaj da oluyor —
  // aynı metni iki kez göstermeyelim.
  const descriptionIsFirstMessage = sortedMessages.length > 0 && sortedMessages[0].content === ticket.description;

  const submit = async (e) => {
    e.preventDefault();
    if (!content.trim()) return;
    setSaving(true);
    await onAddMessage({ ticketId: ticket.id, direction, content: content.trim(), isInternal });
    setContent("");
    setIsInternal(false);
    setSaving(false);
  };

  return (
    <Modal title={ticket.subject} onClose={onClose}>
      <div style={{ marginBottom: 16 }}>
        <p style={{ margin: 0, fontSize: 13, color: "var(--text-secondary)" }}>
          {customer?.name || "Bilinmeyen müşteri"} {customer?.phone ? `· ${customer.phone}` : ""} {customer?.email ? `· ${customer.email}` : ""}
        </p>
        {ticket.description && !descriptionIsFirstMessage && (
          <p style={{ margin: "6px 0 0", fontSize: 13, color: "var(--text-secondary)" }}>{ticket.description}</p>
        )}
        <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>Öncelik: {priorityInfo?.label}</span>
          <Badge tone={sla.tone}>{sla.label}</Badge>
          <span style={{ fontSize: 11, color: "var(--text-muted)" }}>Hedef: {formatDateTime(sla.dueAt)}</span>
          <InfoTip text={SLA_INFO_TEXT} />
        </div>
      </div>

      <div style={{ marginBottom: 16 }}>
        <label style={{ fontSize: 13, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Durum</label>
        <select value={ticket.status} onChange={(e) => onStatusChange(ticket.id, e.target.value)} style={{ width: "100%" }}>
          {STATUSES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>
      </div>

      <p style={{ fontSize: 13, fontWeight: 500, margin: "0 0 8px" }}>Mesaj geçmişi</p>
      <form onSubmit={submit} style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
          <select value={direction} onChange={(e) => setDirection(e.target.value)} style={{ width: 190 }}>
            {MESSAGE_DIRECTIONS.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
          </select>
          <input value={content} onChange={(e) => setContent(e.target.value)} placeholder="Örn. müşteriye kargo takip numarası iletildi" style={{ flex: 1 }} />
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--text-secondary)", marginBottom: 8, cursor: "pointer" }}>
          <input type="checkbox" checked={isInternal} onChange={(e) => setIsInternal(e.target.checked)} />
          Dahili not (müşteri portalında görünmez)
        </label>
        <button type="submit" disabled={saving || !content.trim()} style={{ background: "var(--fill-accent)", color: "var(--on-accent)", border: "none", fontSize: 13 }}>
          Ekle
        </button>
      </form>

      {sortedMessages.length === 0 ? (
        <p style={{ fontSize: 13, color: "var(--text-muted)" }}>Henüz mesaj yok.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, maxHeight: 260, overflowY: "auto" }}>
          {sortedMessages.map((m) => {
            const dirInfo = MESSAGE_DIRECTIONS.find((d) => d.id === m.direction) || MESSAGE_DIRECTIONS[0];
            return (
              <div key={m.id} style={{ display: "flex", gap: 10 }}>
                <i className={`ti ${m.isInternal ? "ti-lock" : dirInfo.icon}`} style={{ fontSize: 16, color: m.isInternal ? "var(--text-muted)" : "var(--text-accent)", marginTop: 2 }} aria-hidden="true"></i>
                <div>
                  <p style={{ margin: 0, fontSize: 13 }}>{m.content}</p>
                  <p style={{ margin: 0, fontSize: 11, color: "var(--text-muted)" }}>
                    {m.isInternal ? "Dahili not" : dirInfo.label} · {formatDateTime(m.createdAt)}
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

function KbList({ articles, searchQuery, onSearchChange, onAdd, onEdit, onDelete, onUseTemplate }) {
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [showTemplates, setShowTemplates] = useState(articles.length === 0);
  const filtered = articles.filter((a) => a.title.toLowerCase().includes(searchQuery.trim().toLowerCase()));

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12, gap: 8, flexWrap: "wrap" }}>
        <input
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Başlıkta ara..."
          style={{ flex: 1, minWidth: 200 }}
        />
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={() => setShowTemplates((v) => !v)}
            style={{ background: "var(--surface-1)", border: "0.5px solid var(--border)", display: "flex", alignItems: "center", gap: 6 }}
          >
            <i className="ti ti-sparkles" style={{ fontSize: 16 }} aria-hidden="true"></i>
            Örnek şablonlar
          </button>
          <button onClick={onAdd} style={{ background: "var(--fill-accent)", color: "var(--on-accent)", border: "none", display: "flex", alignItems: "center", gap: 6 }}>
            <i className="ti ti-plus" style={{ fontSize: 16 }} aria-hidden="true"></i>
            Makale ekle
          </button>
        </div>
      </div>

      {showTemplates && (
        <div style={{ background: "var(--bg-accent)", borderRadius: "var(--radius)", padding: "0.9rem 1rem", marginBottom: 16 }}>
          <p style={{ margin: "0 0 8px", fontSize: 13, fontWeight: 500, color: "var(--text-accent)" }}>
            Hızlı başlangıç için örnek makaleler — "Kullan" ile taslağı açar, düzenleyip kaydedebilirsin.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {KB_TEMPLATES.map((t) => (
              <div key={t.title} style={{ background: "var(--surface-1)", borderRadius: "var(--radius)", padding: "0.6rem 0.8rem", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <p style={{ margin: 0, fontWeight: 500, fontSize: 13 }}>{t.title}</p>
                  <p style={{ margin: 0, fontSize: 11, color: "var(--text-secondary)" }}>{t.category}</p>
                </div>
                <button onClick={() => onUseTemplate(t)} style={{ fontSize: 12 }}>Kullan</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {filtered.length === 0 ? (
        <p style={{ fontSize: 14, color: "var(--text-secondary)" }}>
          {articles.length === 0 ? "Henüz makale eklenmedi." : "Aramayla eşleşen makale yok."}
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {filtered.map((a) => (
            <div key={a.id} style={{ background: "var(--surface-1)", borderRadius: "var(--radius)", padding: "0.75rem 1rem", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: 200 }}>
                <p style={{ margin: 0, fontWeight: 500, fontSize: 14 }}>{a.title}</p>
                <p style={{ margin: 0, fontSize: 12, color: "var(--text-secondary)" }}>
                  {a.category ? `${a.category} · ` : ""}{a.content.slice(0, 80)}{a.content.length > 80 ? "…" : ""}
                </p>
              </div>
              <button onClick={() => onEdit(a)} style={{ width: 32, height: 32, padding: 0 }}>
                <i className="ti ti-edit" style={{ fontSize: 16 }} aria-hidden="true"></i>
              </button>
              <button onClick={() => setConfirmDelete(a)} style={{ width: 32, height: 32, padding: 0 }}>
                <i className="ti ti-trash" style={{ fontSize: 16 }} aria-hidden="true"></i>
              </button>
            </div>
          ))}
        </div>
      )}

      {confirmDelete && (
        <ConfirmDialog
          title="Makaleyi sil"
          message={`"${confirmDelete.title}" makalesini silmek istediğinize emin misiniz?`}
          onConfirm={() => { onDelete(confirmDelete.id); setConfirmDelete(null); }}
          onClose={() => setConfirmDelete(null)}
        />
      )}
    </div>
  );
}

function KbArticleForm({ initial, onSave, onCancel }) {
  const [title, setTitle] = useState(initial?.title || "");
  const [category, setCategory] = useState(initial?.category || "");
  const [content, setContent] = useState(initial?.content || "");

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!title.trim() || !content.trim()) return;
        onSave({
          id: initial?.id || uid(),
          title: title.trim(),
          category: category.trim(),
          content: content.trim(),
          createdAt: initial?.createdAt || new Date().toISOString(),
        });
      }}
    >
      <div style={{ marginBottom: 12 }}>
        <label style={{ fontSize: 13, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Başlık</label>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Örn. Kargo takibi nasıl yapılır?" style={{ width: "100%" }} />
      </div>
      <div style={{ marginBottom: 12 }}>
        <label style={{ fontSize: 13, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Kategori</label>
        <input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Örn. Kargo, Faturalama, Teknik" style={{ width: "100%" }} />
      </div>
      <div style={{ marginBottom: 16 }}>
        <label style={{ fontSize: 13, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>İçerik</label>
        <textarea value={content} onChange={(e) => setContent(e.target.value)} placeholder="Yanıt metnini yazın" style={{ width: "100%", minHeight: 150, resize: "vertical" }} />
      </div>
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button type="button" onClick={onCancel}>Vazgeç</button>
        <button type="submit" style={{ background: "var(--fill-accent)", color: "var(--on-accent)", border: "none" }}>Kaydet</button>
      </div>
    </form>
  );
}

export default function Support({
  customers,
  tickets,
  ticketMessages,
  kbArticles,
  onSaveTicket,
  onDeleteTicket,
  onChangeTicketStatus,
  onAddTicketMessage,
  onSaveKbArticle,
  onDeleteKbArticle,
  initialViewTicketId,
  onConsumeInitialViewTicket,
}) {
  const [supportView, setSupportView] = useState("talepler");
  const [showTicketForm, setShowTicketForm] = useState(false);
  const [editingTicket, setEditingTicket] = useState(null);
  const [viewingTicket, setViewingTicket] = useState(null);
  const [ticketStatusFilter, setTicketStatusFilter] = useState("all");
  const [showKbForm, setShowKbForm] = useState(false);
  const [editingKbArticle, setEditingKbArticle] = useState(null);
  const [kbSearch, setKbSearch] = useState("");

  const customerById = (id) => customers.find((c) => c.id === id);

  useEffect(() => {
    if (!initialViewTicketId) return;
    const t = tickets.find((x) => x.id === initialViewTicketId);
    if (t) {
      setSupportView("talepler");
      setViewingTicket(t);
    }
    onConsumeInitialViewTicket?.();
  }, [initialViewTicketId]);

  const saveTicket = async (t) => {
    await onSaveTicket(t);
    setShowTicketForm(false);
    setEditingTicket(null);
  };

  const saveKbArticle = async (a) => {
    await onSaveKbArticle(a);
    setShowKbForm(false);
    setEditingKbArticle(null);
  };

  const currentTicket = viewingTicket ? tickets.find((t) => t.id === viewingTicket.id) || viewingTicket : null;
  const currentTicketMessages = currentTicket ? ticketMessages.filter((m) => m.ticketId === currentTicket.id) : [];

  const unreadCountByTicket = ticketMessages.reduce((acc, m) => {
    if (m.direction === "gelen" && !m.readAt) acc[m.ticketId] = (acc[m.ticketId] || 0) + 1;
    return acc;
  }, {});

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12, gap: 8, flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: 4, background: "var(--surface-1)", borderRadius: "var(--radius)", padding: 3 }}>
          <button
            onClick={() => setSupportView("talepler")}
            style={{ border: "none", background: supportView === "talepler" ? "var(--surface-2)" : "transparent", display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}
          >
            <i className="ti ti-ticket" style={{ fontSize: 15 }} aria-hidden="true"></i>
            Talepler
          </button>
          <button
            onClick={() => setSupportView("bilgi-bankasi")}
            style={{ border: "none", background: supportView === "bilgi-bankasi" ? "var(--surface-2)" : "transparent", display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}
          >
            <i className="ti ti-book" style={{ fontSize: 15 }} aria-hidden="true"></i>
            Bilgi Bankası
          </button>
        </div>
        {supportView === "talepler" && (
          <button
            onClick={() => { setEditingTicket(null); setShowTicketForm(true); }}
            disabled={customers.length === 0}
            style={{ background: "var(--fill-accent)", color: "var(--on-accent)", border: "none", display: "flex", alignItems: "center", gap: 6 }}
          >
            <i className="ti ti-plus" style={{ fontSize: 16 }} aria-hidden="true"></i>
            Yeni talep
          </button>
        )}
      </div>

      {supportView === "talepler" && customers.length === 0 && (
        <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 12 }}>Talep eklemeden önce bir müşteri oluşturun.</p>
      )}

      {supportView === "talepler" ? (
        tickets.length === 0 ? (
          <p style={{ fontSize: 14, color: "var(--text-secondary)" }}>Henüz destek talebi eklenmedi.</p>
        ) : (
          <TicketList
            tickets={tickets}
            customers={customers}
            unreadCountByTicket={unreadCountByTicket}
            statusFilter={ticketStatusFilter}
            onFilterChange={setTicketStatusFilter}
            onOpenTicket={setViewingTicket}
            onEditTicket={(t) => { setEditingTicket(t); setShowTicketForm(true); }}
            onDeleteTicket={onDeleteTicket}
          />
        )
      ) : (
        <KbList
          articles={kbArticles}
          searchQuery={kbSearch}
          onSearchChange={setKbSearch}
          onAdd={() => { setEditingKbArticle(null); setShowKbForm(true); }}
          onEdit={(a) => { setEditingKbArticle(a); setShowKbForm(true); }}
          onDelete={onDeleteKbArticle}
          onUseTemplate={(t) => { setEditingKbArticle(t); setShowKbForm(true); }}
        />
      )}

      {showTicketForm && (
        <Modal title={editingTicket ? "Talebi düzenle" : "Yeni destek talebi"} onClose={() => { setShowTicketForm(false); setEditingTicket(null); }}>
          <TicketForm customers={customers} initial={editingTicket} onSave={saveTicket} onCancel={() => { setShowTicketForm(false); setEditingTicket(null); }} />
        </Modal>
      )}

      {showKbForm && (
        <Modal title={editingKbArticle?.id ? "Makaleyi düzenle" : "Yeni makale"} onClose={() => { setShowKbForm(false); setEditingKbArticle(null); }}>
          <KbArticleForm initial={editingKbArticle} onSave={saveKbArticle} onCancel={() => { setShowKbForm(false); setEditingKbArticle(null); }} />
        </Modal>
      )}

      {currentTicket && (
        <TicketDetail
          ticket={currentTicket}
          customer={customerById(currentTicket.customerId)}
          messages={currentTicketMessages}
          onAddMessage={onAddTicketMessage}
          onStatusChange={onChangeTicketStatus}
          onClose={() => setViewingTicket(null)}
        />
      )}
    </div>
  );
}
