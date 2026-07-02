import React, { useState, useEffect } from "react";
import { supabase } from "./supabase";
import { Badge, Modal, MetricCard, InfoTip, Toast, ConfirmDialog, uid, formatTL, daysAgo, downloadCsv } from "./shared";
import Support, {
  rowToTicket,
  rowToTicketMessage,
  rowToKbArticle,
  getSlaStatus,
  TERMINAL_STATUSES,
} from "./Support";

const STAGES = [
  { id: "ilk_gorusme", label: "İlk görüşme" },
  { id: "teklif", label: "Teklif verildi" },
  { id: "muzakere", label: "Müzakere" },
  { id: "kazanildi", label: "Kazanıldı" },
  { id: "kaybedildi", label: "Kaybedildi" },
];

const SECTORS = ["İnşaat", "Medikal", "Gıda", "Tekstil", "Elektrik", "Diğer"];

function leadScore(lastContact) {
  if (!lastContact) return { label: "Soğuk", tone: "default" };
  const diff = Math.floor((Date.now() - new Date(lastContact).getTime()) / 86400000);
  if (diff <= 7) return { label: "Sıcak", tone: "success" };
  if (diff <= 30) return { label: "Ilık", tone: "warning" };
  return { label: "Soğuk", tone: "default" };
}

function rowToCustomer(r) {
  return {
    id: r.id,
    name: r.name,
    sector: r.sector,
    phone: r.phone || "",
    email: r.email || "",
    notes: r.notes || "",
    lastContact: r.last_contact,
    createdAt: r.created_at,
  };
}

function rowToDeal(r) {
  return {
    id: r.id,
    customerId: r.customer_id,
    title: r.title,
    value: r.value,
    stage: r.stage,
    reminder: r.reminder || "",
    reminderDate: r.reminder_date || "",
    lostReason: r.lost_reason || "",
    createdAt: r.created_at,
  };
}

const LOST_REASONS = ["Yüksek fiyat", "Rakip tercih edildi", "Bütçe yok", "Zamanlama uymadı", "Diğer"];

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

function rowToCompanySettings(r) {
  return {
    companyName: r.company_name || "",
    address: r.address || "",
    phone: r.phone || "",
    email: r.email || "",
    taxNumber: r.tax_number || "",
    logoUrl: r.logo_url || "",
  };
}

function CustomerForm({ initial, onSave, onCancel }) {
  const [name, setName] = useState(initial?.name || "");
  const [sector, setSector] = useState(initial?.sector || SECTORS[0]);
  const [phone, setPhone] = useState(initial?.phone || "");
  const [email, setEmail] = useState(initial?.email || "");
  const [notes, setNotes] = useState(initial?.notes || "");

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!name.trim()) return;
        onSave({
          id: initial?.id || uid(),
          name: name.trim(),
          sector,
          phone: phone.trim(),
          email: email.trim(),
          notes: notes.trim(),
          lastContact: initial?.lastContact || new Date().toISOString(),
          createdAt: initial?.createdAt || new Date().toISOString(),
        });
      }}
    >
      <div style={{ marginBottom: 12 }}>
        <label style={{ fontSize: 13, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Firma adı</label>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Akın İnşaat" style={{ width: "100%" }} />
      </div>
      <div style={{ marginBottom: 12 }}>
        <label style={{ fontSize: 13, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Sektör</label>
        <select value={sector} onChange={(e) => setSector(e.target.value)} style={{ width: "100%" }}>
          {SECTORS.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
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
      <div style={{ marginBottom: 16 }}>
        <label style={{ fontSize: 13, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Not</label>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Örn. yaz aylarında sipariş hacmi artıyor" style={{ width: "100%", minHeight: 70, resize: "vertical" }} />
      </div>
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button type="button" onClick={onCancel}>Vazgeç</button>
        <button type="submit" style={{ background: "var(--fill-accent)", color: "var(--on-accent)", border: "none" }}>Kaydet</button>
      </div>
    </form>
  );
}

function CompanySettingsForm({ initial, onSave, onCancel }) {
  const [companyName, setCompanyName] = useState(initial?.companyName || "");
  const [address, setAddress] = useState(initial?.address || "");
  const [phone, setPhone] = useState(initial?.phone || "");
  const [email, setEmail] = useState(initial?.email || "");
  const [taxNumber, setTaxNumber] = useState(initial?.taxNumber || "");
  const [logoUrl, setLogoUrl] = useState(initial?.logoUrl || "");

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
        });
      }}
    >
      <div style={{ marginBottom: 12 }}>
        <label style={{ fontSize: 13, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Şirket adı</label>
        <input value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="Akın İnşaat Ltd. Şti." style={{ width: "100%" }} />
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
        <label style={{ fontSize: 13, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Logo URL</label>
        <input value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} placeholder="https://.../logo.png" style={{ width: "100%" }} />
        <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "4px 0 0" }}>Dosya yükleme yok — bir yerde barındırılan logonuzun bağlantısını yapıştırın.</p>
      </div>
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button type="button" onClick={onCancel}>Vazgeç</button>
        <button type="submit" style={{ background: "var(--fill-accent)", color: "var(--on-accent)", border: "none" }}>Kaydet</button>
      </div>
    </form>
  );
}

function DealForm({ customers, initial, onSave, onCancel }) {
  const [customerId, setCustomerId] = useState(initial?.customerId || customers[0]?.id || "");
  const [title, setTitle] = useState(initial?.title || "");
  const [value, setValue] = useState(initial?.value ?? "");
  const [stage, setStage] = useState(initial?.stage || "ilk_gorusme");
  const [reminder, setReminder] = useState(initial?.reminder || "");
  const [reminderDate, setReminderDate] = useState(initial?.reminderDate || "");
  const [lostReason, setLostReason] = useState(initial?.lostReason || LOST_REASONS[0]);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!customerId || !title.trim()) return;
        onSave({
          id: initial?.id || uid(),
          customerId,
          title: title.trim(),
          value: Number(value) || 0,
          stage,
          reminder: reminder.trim(),
          reminderDate: reminderDate || null,
          lostReason: stage === "kaybedildi" ? lostReason : "",
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
        <label style={{ fontSize: 13, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Fırsat / teklif başlığı</label>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Yıllık tedarik anlaşması" style={{ width: "100%" }} />
      </div>
      <div style={{ display: "flex", gap: 12, marginBottom: 12 }}>
        <div style={{ flex: 1 }}>
          <label style={{ fontSize: 13, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Tutar (TL)</label>
          <input type="number" min="0" value={value} onChange={(e) => setValue(e.target.value)} placeholder="50000" style={{ width: "100%" }} />
        </div>
        <div style={{ flex: 1 }}>
          <label style={{ fontSize: 13, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Aşama</label>
          <select value={stage} onChange={(e) => setStage(e.target.value)} style={{ width: "100%" }}>
            {STAGES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </div>
      </div>
      <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
        <div style={{ flex: 2 }}>
          <label style={{ fontSize: 13, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Hatırlatma notu</label>
          <input value={reminder} onChange={(e) => setReminder(e.target.value)} placeholder="Yarın takip araması yap" style={{ width: "100%" }} />
        </div>
        <div style={{ flex: 1 }}>
          <label style={{ fontSize: 13, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Hatırlatma tarihi</label>
          <input type="date" value={reminderDate} onChange={(e) => setReminderDate(e.target.value)} style={{ width: "100%" }} />
        </div>
      </div>
      {stage === "kaybedildi" && (
        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 13, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Kayıp nedeni</label>
          <select value={lostReason} onChange={(e) => setLostReason(e.target.value)} style={{ width: "100%" }}>
            {LOST_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
      )}
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button type="button" onClick={onCancel}>Vazgeç</button>
        <button type="submit" disabled={customers.length === 0} style={{ background: "var(--fill-accent)", color: "var(--on-accent)", border: "none" }}>Kaydet</button>
      </div>
    </form>
  );
}

function activityDateLabel(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleDateString("tr-TR", { day: "numeric", month: "short", year: "numeric" }) +
    " · " + d.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
}

function CustomerDetail({ customer, deals, activities, onAddActivity, onClose }) {
  const [type, setType] = useState("note");
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);

  const customerDeals = deals.filter((d) => d.customerId === customer.id);
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
        <p style={{ margin: 0, fontSize: 13, color: "var(--text-secondary)" }}>
          {customer.sector} {customer.phone ? `· ${customer.phone}` : ""} {customer.email ? `· ${customer.email}` : ""}
        </p>
        {customer.notes && <p style={{ margin: "6px 0 0", fontSize: 13, color: "var(--text-secondary)" }}>{customer.notes}</p>}
      </div>

      {customerDeals.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <p style={{ fontSize: 13, fontWeight: 500, margin: "0 0 6px" }}>Fırsatlar</p>
          {customerDeals.map((d) => {
            const stageInfo = STAGES.find((s) => s.id === d.stage);
            return (
              <div key={d.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "4px 0" }}>
                <span>{d.title}</span>
                <span style={{ color: "var(--text-secondary)" }}>{stageInfo?.label} · {formatTL(d.value)}</span>
              </div>
            );
          })}
        </div>
      )}

      <p style={{ fontSize: 13, fontWeight: 500, margin: "0 0 8px" }}>İletişim geçmişi</p>
      <form onSubmit={submit} style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
          <select value={type} onChange={(e) => setType(e.target.value)} style={{ width: 160 }}>
            {ACTIVITY_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
          <input value={content} onChange={(e) => setContent(e.target.value)} placeholder="Örn. fiyat teklifi görüşüldü" style={{ flex: 1 }} />
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

function TeklifPrint({ deal, customer, companySettings, onClose }) {
  useEffect(() => {
    const t = setTimeout(() => window.print(), 50);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    window.addEventListener("afterprint", onClose);
    return () => window.removeEventListener("afterprint", onClose);
  }, [onClose]);

  return (
    <div style={{ position: "fixed", inset: 0, background: "#fff", zIndex: 1500, overflowY: "auto" }}>
      <div className="no-print" style={{ position: "fixed", top: 16, right: 16, display: "flex", gap: 8 }}>
        <button onClick={() => window.print()} style={{ background: "var(--fill-accent)", color: "var(--on-accent)", border: "none" }}>
          Yazdır
        </button>
        <button onClick={onClose}>Kapat</button>
      </div>
      <div id="teklif-print" style={{ maxWidth: 700, margin: "0 auto", padding: "3rem 2rem", color: "#0c2540" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 40 }}>
          <div>
            {companySettings?.logoUrl && (
              <img src={companySettings.logoUrl} alt="Logo" style={{ maxHeight: 60, marginBottom: 10 }} />
            )}
            <p style={{ fontWeight: 700, fontSize: 18, margin: 0 }}>
              {companySettings?.companyName || "Firma bilgisi eksik"}
            </p>
            {companySettings?.address && <p style={{ fontSize: 13, margin: "4px 0 0", color: "#5b7088" }}>{companySettings.address}</p>}
            {companySettings?.phone && <p style={{ fontSize: 13, margin: "2px 0 0", color: "#5b7088" }}>{companySettings.phone}</p>}
            {companySettings?.email && <p style={{ fontSize: 13, margin: "2px 0 0", color: "#5b7088" }}>{companySettings.email}</p>}
            {companySettings?.taxNumber && <p style={{ fontSize: 13, margin: "2px 0 0", color: "#5b7088" }}>Vergi no: {companySettings.taxNumber}</p>}
          </div>
          <div style={{ textAlign: "right" }}>
            <h1 style={{ fontSize: 22, margin: 0 }}>TEKLİF</h1>
            <p style={{ fontSize: 13, color: "#5b7088", margin: "4px 0 0" }}>{new Date().toLocaleDateString("tr-TR")}</p>
          </div>
        </div>

        <div style={{ marginBottom: 30 }}>
          <p style={{ fontSize: 12, color: "#5b7088", margin: "0 0 4px", textTransform: "uppercase" }}>Müşteri</p>
          <p style={{ fontWeight: 600, fontSize: 15, margin: 0 }}>{customer?.name || "Bilinmeyen müşteri"}</p>
          {customer?.phone && <p style={{ fontSize: 13, margin: "2px 0 0", color: "#5b7088" }}>{customer.phone}</p>}
          {customer?.email && <p style={{ fontSize: 13, margin: "2px 0 0", color: "#5b7088" }}>{customer.email}</p>}
        </div>

        <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 30 }}>
          <thead>
            <tr style={{ borderBottom: "2px solid #0c2540" }}>
              <th style={{ textAlign: "left", padding: "8px 0", fontSize: 12, textTransform: "uppercase" }}>Açıklama</th>
              <th style={{ textAlign: "right", padding: "8px 0", fontSize: 12, textTransform: "uppercase" }}>Tutar</th>
            </tr>
          </thead>
          <tbody>
            <tr style={{ borderBottom: "1px solid #e1e8f0" }}>
              <td style={{ padding: "12px 0", fontSize: 14 }}>{deal.title}</td>
              <td style={{ padding: "12px 0", fontSize: 14, textAlign: "right" }}>{formatTL(deal.value)}</td>
            </tr>
          </tbody>
          <tfoot>
            <tr>
              <td style={{ padding: "12px 0", fontWeight: 700, fontSize: 15 }}>Toplam</td>
              <td style={{ padding: "12px 0", fontWeight: 700, fontSize: 15, textAlign: "right" }}>{formatTL(deal.value)}</td>
            </tr>
          </tfoot>
        </table>

        <p style={{ fontSize: 12, color: "#5b7088" }}>Bu teklif 15 gün geçerlidir.</p>
      </div>
    </div>
  );
}

function CampaignModal({ customers, replyTo, onClose }) {
  const emailCustomers = customers.filter((c) => c.email);
  const [selected, setSelected] = useState(() => new Set(emailCustomers.map((c) => c.id)));
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState("");

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
    if (recipients.length === 0 || !subject.trim() || !message.trim()) return;
    setSending(true);
    setResult("");
    try {
      const res = await fetch("/api/send-campaign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipients, subject, message, replyTo }),
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
        {result && <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 12 }}>{result}</p>}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button type="button" onClick={onClose}>Kapat</button>
          <button type="submit" disabled={sending || selected.size === 0} style={{ background: "var(--fill-accent)", color: "var(--on-accent)", border: "none" }}>
            {sending ? "Gönderiliyor…" : "Gönder"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function AuthModal({ initialMode = "login", onClose }) {
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
      const { error } = await supabase.auth.signUp({ email, password });
      if (error) setMessage(error.message);
      else setMessage("Kayıt başarılı! E-postanıza gelen doğrulama linkine tıklayın.");
    }
    setLoading(false);
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: "1rem" }}>
      <div style={{ background: "#fff", borderRadius: 16, padding: "2rem", width: "100%", maxWidth: 420, position: "relative" }}>
        <button onClick={onClose} style={{ position: "absolute", top: 16, right: 16, background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#666" }}>✕</button>
        <h2 style={{ fontSize: 20, fontWeight: 700, margin: "0 0 4px", color: "#0c2540" }}>
          {mode === "login" ? "Giriş yap" : "Ücretsiz başla"}
        </h2>
        <p style={{ fontSize: 13, color: "#5b7088", margin: "0 0 1.5rem" }}>Binerly CRM'e hoş geldiniz</p>
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
        <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "12px 0" }}>
          <div style={{ flex: 1, height: 1, background: "#e1e8f0" }} />
          <span style={{ fontSize: 12, color: "#94a7bb" }}>veya</span>
          <div style={{ flex: 1, height: 1, background: "#e1e8f0" }} />
        </div>
        <button
          type="button"
          onClick={() => supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: "https://binerly.com" } })}
          style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, background: "#fff", border: "1px solid #e1e8f0", borderRadius: 8, padding: "10px 16px", cursor: "pointer", fontSize: 14, color: "#0c2540", fontWeight: 500 }}
        >
          <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
            <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z" fill="#4285F4"/>
            <path d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z" fill="#34A853"/>
            <path d="M3.964 10.707c-.18-.54-.282-1.117-.282-1.707s.102-1.167.282-1.707V4.961H.957C.347 6.175 0 7.548 0 9s.348 2.825.957 4.039l3.007-2.332z" fill="#FBBC05"/>
            <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.961L3.964 7.293C4.672 5.166 6.656 3.58 9 3.58z" fill="#EA4335"/>
          </svg>
          Google ile devam et
        </button>
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
      {authModal && <AuthModal initialMode={authModal} onClose={() => setAuthModal(null)} />}

      {/* Navbar */}
      <nav style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 2rem", height: 64, background: "#fff", borderBottom: "1px solid #e1e8f0", position: "sticky", top: 0, zIndex: 100 }}>
        <div onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
          <img src="/favicon.svg" alt="Binerly" style={{ width: 28, height: 28 }} />
          <span style={{ fontWeight: 700, fontSize: 18, color: "#0c2540" }}>Binerly</span>
        </div>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <button onClick={() => setAuthModal("login")} style={{ background: "none", border: "none", color: "#185fa5", fontWeight: 600, fontSize: 14, cursor: "pointer", padding: "8px 12px" }}>
            Giriş Yap
          </button>
          <button onClick={() => setAuthModal("register")} style={{ background: "#185fa5", color: "#fff", border: "none", borderRadius: 8, padding: "8px 18px", fontWeight: 600, fontSize: 14, cursor: "pointer" }}>
            Ücretsiz Dene
          </button>
        </div>
      </nav>

      {/* Hero */}
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "5rem 2rem 3rem", display: "flex", alignItems: "center", gap: "4rem", flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 300 }}>
          <div style={{ display: "inline-block", background: "#e6f1fb", color: "#185fa5", fontSize: 12, fontWeight: 600, padding: "4px 12px", borderRadius: 20, marginBottom: 20 }}>
            KOBİ'ler için CRM
          </div>
          <h1 style={{ fontSize: "clamp(2rem, 4vw, 3rem)", fontWeight: 800, color: "#0c2540", lineHeight: 1.2, margin: "0 0 1.25rem" }}>
            Müşteri ve satışlarını{" "}
            <span style={{ color: "#185fa5" }}>tek ekrandan</span>{" "}
            yönet
          </h1>
          <p style={{ fontSize: 17, color: "#5b7088", lineHeight: 1.7, margin: "0 0 2rem", maxWidth: 480 }}>
            Müşteri takibi, fırsat yönetimi ve satış süreçlerini kolaylaştıran, KOBİ'lere özel CRM sistemi.
          </p>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <button onClick={() => setAuthModal("register")} style={{ background: "#185fa5", color: "#fff", border: "none", borderRadius: 8, padding: "13px 28px", fontWeight: 700, fontSize: 15, cursor: "pointer" }}>
              14 Gün Ücretsiz Dene →
            </button>
            <button onClick={() => setAuthModal("login")} style={{ background: "#fff", color: "#185fa5", border: "1.5px solid #185fa5", borderRadius: 8, padding: "13px 28px", fontWeight: 600, fontSize: 15, cursor: "pointer" }}>
              Giriş Yap
            </button>
          </div>
        </div>

        {/* Mockup */}
        <div style={{ flex: 1, minWidth: 280 }}>
          <div style={{ background: "#0c2540", borderRadius: 16, padding: "1.5rem", boxShadow: "0 20px 60px rgba(12,37,64,0.2)" }}>
            <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
              <div style={{ width: 12, height: 12, borderRadius: "50%", background: "#ff5f57" }} />
              <div style={{ width: 12, height: 12, borderRadius: "50%", background: "#ffbd2e" }} />
              <div style={{ width: 12, height: 12, borderRadius: "50%", background: "#28c840" }} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 12 }}>
              {[["Açık Fırsatlar", "12"], ["Kazanılan", "8"], ["Toplam Değer", "₺284K"]].map(([label, val]) => (
                <div key={label} style={{ background: "#1a3a5c", borderRadius: 8, padding: "10px 12px" }}>
                  <div style={{ fontSize: 10, color: "#94a7bb", marginBottom: 4 }}>{label}</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: "#fff" }}>{val}</div>
                </div>
              ))}
            </div>
            {[
              ["Akın İnşaat", "Müzakere", "₺85.000"],
              ["Yıldız Medikal", "Teklif verildi", "₺42.500"],
              ["Ege Tekstil", "Kazanıldı", "₺120.000"],
            ].map(([name, stage, value]) => (
              <div key={name} style={{ background: "#1a3a5c", borderRadius: 8, padding: "10px 12px", marginBottom: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#fff" }}>{name}</div>
                  <div style={{ fontSize: 11, color: "#94a7bb" }}>{stage}</div>
                </div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#378add" }}>{value}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Özellikler */}
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "3rem 2rem" }}>
        <h2 style={{ textAlign: "center", fontSize: "1.75rem", fontWeight: 700, color: "#0c2540", margin: "0 0 2.5rem" }}>
          İşinizi büyütmek için ihtiyacınız olan her şey
        </h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 20 }}>
          {[
            {
              icon: "ti-address-book",
              title: "Müşteri & İletişim Yönetimi",
              desc: "Müşterilerin iletişim bilgileri, e-posta yazışmaları, telefon notları ve geçmiş satın alma kayıtlarını tek veritabanında tutun. Sektör, bölge ve potansiyele göre segmentasyon yapın.",
              tags: ["İletişim Geçmişi", "Segmentasyon"],
            },
            {
              icon: "ti-target-arrow",
              title: "Satış & Fırsat Yönetimi",
              desc: "İlk temastan kapanışa kadar tüm satış sürecini Kanban tahtasında takip edin. Şablon kullanarak PDF teklif hazırlayın, ürün ve fiyat kataloğunuzu yönetin.",
              tags: ["Kanban Pipeline", "PDF Teklif"],
            },
            {
              icon: "ti-mail-forward",
              title: "Pazarlama Otomasyonu",
              desc: "E-posta ve SMS kampanyaları gönderin. Web sitenizdeki formlardan gelen müşteri adayları otomatik olarak CRM'e düşsün. Lead scoring ile en sıcak adayları öncelikli görün.",
              tags: ["E-posta Kampanyası", "Lead Scoring"],
            },
            {
              icon: "ti-headset",
              title: "Satış Sonrası Destek",
              desc: "Müşteri şikayet ve destek taleplerini bilet sistemiyle takip edin. SLA sürelerini izleyin, sıkça sorulan sorular için bilgi bankası oluşturun.",
              tags: ["Ticketing", "SLA Takibi"],
            },
            {
              icon: "ti-chart-bar",
              title: "Raporlama & Analitik",
              desc: "Satış tahminleme ile gelecek dönem gelirinizi öngörün. Temsilci bazlı performans dashboard'ları ve kaybedilen müşteri analizleriyle stratejik kararlar alın.",
              tags: ["Forecasting", "Dashboard"],
            },
            {
              icon: "ti-plug-connected",
              title: "Entegrasyonlar & Mobil",
              desc: "Gmail, Outlook ve takvim uygulamalarıyla tam senkronizasyon. Muhasebe sistemleriyle ERP entegrasyonu. iOS ve Android uyumlu mobil uygulama ile her yerden erişin.",
              tags: ["Gmail/Outlook", "Mobil Uygulama"],
            },
          ].map((f) => (
            <div key={f.title} style={{ background: "#fff", borderRadius: 12, padding: "1.5rem", border: "1px solid #e1e8f0" }}>
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

      {/* CTA */}
      <div style={{ background: "#185fa5", padding: "4rem 2rem", textAlign: "center" }}>
        <h2 style={{ fontSize: "1.75rem", fontWeight: 800, color: "#fff", margin: "0 0 1rem" }}>
          Hemen başlayın, ücretsiz deneyin
        </h2>
        <p style={{ fontSize: 16, color: "#b8d4f0", margin: "0 0 2rem" }}>Kredi kartı gerekmez. 14 gün boyunca tüm özellikleri kullanın.</p>
        <button onClick={() => setAuthModal("register")} style={{ background: "#fff", color: "#185fa5", border: "none", borderRadius: 8, padding: "14px 32px", fontWeight: 700, fontSize: 16, cursor: "pointer" }}>
          Ücretsiz Hesap Oluştur
        </button>
      </div>

      {/* Footer */}
      <div style={{ textAlign: "center", padding: "1.5rem", fontSize: 13, color: "#94a7bb", background: "#f5f8fc" }}>
        © 2026 Binerly · KOBİ Satış Takip Sistemi
      </div>
    </div>
  );
}

export default function App() {
  const [session, setSession] = useState(undefined);
  const [tab, setTab] = useState("pano");
  const [customers, setCustomers] = useState([]);
  const [deals, setDeals] = useState([]);
  const [activities, setActivities] = useState([]);
  const [tickets, setTickets] = useState([]);
  const [ticketMessages, setTicketMessages] = useState([]);
  const [kbArticles, setKbArticles] = useState([]);
  const [companySettings, setCompanySettings] = useState(null);
  const [showSettingsForm, setShowSettingsForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showCustomerForm, setShowCustomerForm] = useState(false);
  const [showDealForm, setShowDealForm] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState(null);
  const [editingDeal, setEditingDeal] = useState(null);
  const [viewingCustomer, setViewingCustomer] = useState(null);
  const [dealView, setDealView] = useState("kanban");
  const [dragDealId, setDragDealId] = useState(null);
  const [showCampaignModal, setShowCampaignModal] = useState(false);
  const [confirmDeleteCustomer, setConfirmDeleteCustomer] = useState(null);
  const [confirmDeleteDeal, setConfirmDeleteDeal] = useState(null);
  const [customerSearch, setCustomerSearch] = useState("");
  const [dealSearch, setDealSearch] = useState("");
  const [teklifDeal, setTeklifDeal] = useState(null);
  const [toast, setToast] = useState(null);

  const notify = (message, tone = "danger") => setToast({ message, tone });

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, s) => setSession(s));
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) {
      setCustomers([]); setDeals([]); setActivities([]);
      setTickets([]); setTicketMessages([]); setKbArticles([]);
      setCompanySettings(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    Promise.all([
      supabase.from("customers").select("*").order("created_at"),
      supabase.from("deals").select("*").order("created_at"),
      supabase.from("activities").select("*").order("created_at"),
      supabase.from("tickets").select("*").order("created_at"),
      supabase.from("ticket_messages").select("*").order("created_at"),
      supabase.from("kb_articles").select("*").order("created_at"),
      supabase.from("company_settings").select("*").maybeSingle(),
    ]).then(([{ data: c }, { data: d }, { data: a }, { data: t }, { data: tm }, { data: kb }, { data: cs }]) => {
      setCustomers((c || []).map(rowToCustomer));
      setDeals((d || []).map(rowToDeal));
      setActivities((a || []).map(rowToActivity));
      setTickets((t || []).map(rowToTicket));
      setTicketMessages((tm || []).map(rowToTicketMessage));
      setKbArticles((kb || []).map(rowToKbArticle));
      setCompanySettings(cs ? rowToCompanySettings(cs) : null);
      setLoading(false);
    });
  }, [session]);

  const addActivity = async ({ customerId, type, content }) => {
    const row = {
      id: uid(),
      user_id: session.user.id,
      customer_id: customerId,
      type,
      content,
    };
    const { data, error } = await supabase.from("activities").insert(row).select().single();
    if (error) { notify(`Kayıt eklenemedi: ${error.message}`); return; }
    const activity = rowToActivity(data);
    setActivities((prev) => [...prev, activity]);
    await touchCustomer(customerId);
  };

  const upsertCustomer = async (c) => {
    const row = {
      id: c.id,
      user_id: session.user.id,
      name: c.name,
      sector: c.sector,
      phone: c.phone,
      email: c.email,
      notes: c.notes,
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
  };

  const deleteCustomer = async (id) => {
    const { error } = await supabase.from("customers").delete().eq("id", id);
    if (error) { notify(`Müşteri silinemedi: ${error.message}`); return; }
    setCustomers((prev) => prev.filter((c) => c.id !== id));
    setDeals((prev) => prev.filter((d) => d.customerId !== id));
    setTickets((prev) => prev.filter((t) => t.customerId !== id));
  };

  const upsertDeal = async (d) => {
    const row = {
      id: d.id,
      user_id: session.user.id,
      customer_id: d.customerId,
      title: d.title,
      value: d.value,
      stage: d.stage,
      reminder: d.reminder,
      reminder_date: d.reminderDate || null,
      lost_reason: d.lostReason,
      created_at: d.createdAt,
    };
    const { data, error } = await supabase.from("deals").upsert(row).select().single();
    if (error) { notify(`Fırsat kaydedilemedi: ${error.message}`); return; }
    const deal = rowToDeal(data);
    setDeals((prev) =>
      prev.some((x) => x.id === deal.id) ? prev.map((x) => (x.id === deal.id ? deal : x)) : [...prev, deal]
    );
    setShowDealForm(false);
    setEditingDeal(null);
  };

  const deleteDeal = async (id) => {
    const { error } = await supabase.from("deals").delete().eq("id", id);
    if (error) { notify(`Fırsat silinemedi: ${error.message}`); return; }
    setDeals((prev) => prev.filter((d) => d.id !== id));
  };

  const moveDealStage = async (id, stage) => {
    const previousStage = deals.find((d) => d.id === id)?.stage;
    setDeals((prev) => prev.map((d) => (d.id === id ? { ...d, stage } : d)));
    const { error } = await supabase.from("deals").update({ stage }).eq("id", id);
    if (error) {
      notify(`Aşama güncellenemedi: ${error.message}`);
      setDeals((prev) => prev.map((d) => (d.id === id ? { ...d, stage: previousStage } : d)));
    }
  };

  const touchCustomer = async (id) => {
    const now = new Date().toISOString();
    const { error } = await supabase.from("customers").update({ last_contact: now }).eq("id", id);
    if (error) return;
    setCustomers((prev) => prev.map((c) => (c.id === id ? { ...c, lastContact: now } : c)));
  };

  const upsertTicket = async (t) => {
    const row = {
      id: t.id,
      user_id: session.user.id,
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
  };

  const deleteTicket = async (id) => {
    const { error } = await supabase.from("tickets").delete().eq("id", id);
    if (error) { notify(`Talep silinemedi: ${error.message}`); return; }
    setTickets((prev) => prev.filter((t) => t.id !== id));
    setTicketMessages((prev) => prev.filter((m) => m.ticketId !== id));
  };

  const changeTicketStatus = async (id, status) => {
    const previous = tickets.find((t) => t.id === id);
    const resolvedAt = TERMINAL_STATUSES.includes(status) ? new Date().toISOString() : null;
    setTickets((prev) => prev.map((t) => (t.id === id ? { ...t, status, resolvedAt } : t)));
    const { error } = await supabase.from("tickets").update({ status, resolved_at: resolvedAt }).eq("id", id);
    if (error) {
      notify(`Durum güncellenemedi: ${error.message}`);
      setTickets((prev) => prev.map((t) => (t.id === id ? previous : t)));
    }
  };

  const addTicketMessage = async ({ ticketId, direction, content }) => {
    const row = {
      id: uid(),
      user_id: session.user.id,
      ticket_id: ticketId,
      direction,
      content,
    };
    const { data, error } = await supabase.from("ticket_messages").insert(row).select().single();
    if (error) { notify(`Mesaj eklenemedi: ${error.message}`); return; }
    const message = rowToTicketMessage(data);
    setTicketMessages((prev) => [...prev, message]);
  };

  const upsertKbArticle = async (a) => {
    const row = {
      id: a.id,
      user_id: session.user.id,
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
  };

  const deleteKbArticle = async (id) => {
    const { error } = await supabase.from("kb_articles").delete().eq("id", id);
    if (error) { notify(`Makale silinemedi: ${error.message}`); return; }
    setKbArticles((prev) => prev.filter((a) => a.id !== id));
  };

  const upsertCompanySettings = async (s) => {
    const row = {
      user_id: session.user.id,
      company_name: s.companyName,
      address: s.address,
      phone: s.phone,
      email: s.email,
      tax_number: s.taxNumber,
      logo_url: s.logoUrl,
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await supabase.from("company_settings").upsert(row).select().single();
    if (error) { notify(`Şirket ayarları kaydedilemedi: ${error.message}`); return; }
    setCompanySettings(rowToCompanySettings(data));
    setShowSettingsForm(false);
  };

  if (session === undefined) return <div style={{ padding: "2rem", textAlign: "center", color: "var(--text-secondary)" }}>Yükleniyor…</div>;
  if (!session) return <LandingPage />;

  if (loading) return <div style={{ padding: "2rem 0", textAlign: "center", color: "var(--text-secondary)" }}>Yükleniyor…</div>;

  const openDeals = deals.filter((d) => d.stage !== "kazanildi" && d.stage !== "kaybedildi");
  const wonDeals = deals.filter((d) => d.stage === "kazanildi");
  const lostDeals = deals.filter((d) => d.stage === "kaybedildi");
  const totalOpenValue = openDeals.reduce((sum, d) => sum + (d.value || 0), 0);
  const dealsWithReminder = deals.filter((d) => d.reminder && d.stage !== "kazanildi" && d.stage !== "kaybedildi");
  const customerById = (id) => customers.find((c) => c.id === id);

  const customerQuery = customerSearch.trim().toLowerCase();
  const filteredCustomers = !customerQuery
    ? customers
    : customers.filter((c) =>
        [c.name, c.sector, c.phone, c.email].some((f) => (f || "").toLowerCase().includes(customerQuery))
      );

  const dealQuery = dealSearch.trim().toLowerCase();
  const filteredDeals = !dealQuery
    ? deals
    : deals.filter(
        (d) =>
          d.title.toLowerCase().includes(dealQuery) ||
          (customerById(d.customerId)?.name || "").toLowerCase().includes(dealQuery)
      );

  const openTicketsCount = tickets.filter((t) => !TERMINAL_STATUSES.includes(t.status)).length;
  const breachedTicketsCount = tickets.filter(
    (t) => !TERMINAL_STATUSES.includes(t.status) && getSlaStatus(t).isBreached
  ).length;

  const closedCount = wonDeals.length + lostDeals.length;
  const winRate = closedCount > 0 ? Math.round((wonDeals.length / closedCount) * 100) : null;

  const monthLabels = Array.from({ length: 6 }, (_, i) => {
    const d = new Date();
    d.setMonth(d.getMonth() - (5 - i));
    return { key: `${d.getFullYear()}-${d.getMonth()}`, label: d.toLocaleDateString("tr-TR", { month: "short" }) };
  });
  const monthlyRevenue = monthLabels.map(({ key, label }) => {
    const total = wonDeals
      .filter((d) => {
        const dd = new Date(d.createdAt);
        return `${dd.getFullYear()}-${dd.getMonth()}` === key;
      })
      .reduce((sum, d) => sum + (d.value || 0), 0);
    return { label, total };
  });
  const maxMonthly = Math.max(1, ...monthlyRevenue.map((m) => m.total));

  const lostReasonCounts = LOST_REASONS.map((reason) => ({
    reason,
    count: lostDeals.filter((d) => d.lostReason === reason).length,
  })).filter((r) => r.count > 0);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1.5rem" }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 600, margin: "0 0 4px" }}>Binerly</h1>
          <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: 0 }}>KOBİ satış takip sistemi</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={() => setShowSettingsForm(true)}
            style={{ width: 32, height: 32, padding: 0 }}
            title="Şirket ayarları"
          >
            <i className="ti ti-settings" style={{ fontSize: 16 }} aria-hidden="true"></i>
          </button>
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
      <h2 className="sr-only">KOBİ satış takip uygulaması: pano, müşteriler ve fırsatlar sekmeleri</h2>

      <div style={{ display: "flex", gap: 8, marginBottom: "1.5rem" }}>
        {[
          { id: "pano", label: "Pano", icon: "ti-layout-dashboard" },
          { id: "musteri", label: "Müşteriler", icon: "ti-building" },
          { id: "firsat", label: "Fırsatlar", icon: "ti-target-arrow" },
          { id: "destek", label: "Destek", icon: "ti-headset" },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              flex: 1,
              border: tab === t.id ? "0.5px solid var(--border-strong)" : "0.5px solid var(--border)",
              background: tab === t.id ? "var(--surface-1)" : "transparent",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
            }}
          >
            <i className={`ti ${t.icon}`} style={{ fontSize: 16 }} aria-hidden="true"></i>
            {t.label}
          </button>
        ))}
      </div>

      {tab === "pano" && (
        <div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px,1fr))", gap: 12, marginBottom: "1.5rem" }}>
            <MetricCard label="Açık fırsatlar" value={openDeals.length} />
            <MetricCard label="Kazanılan" value={wonDeals.length} tone="success" />
            <MetricCard label="Açık teklif değeri" value={formatTL(totalOpenValue)} />
            <MetricCard label="Hatırlatması olan" value={dealsWithReminder.length} tone="warning" />
            <MetricCard
              label={<span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>Açık destek talepleri <InfoTip text="Durumu Çözüldü veya Kapatıldı olmayan destek talepleri." /></span>}
              value={openTicketsCount}
            />
            <MetricCard
              label={<span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>SLA aşılan talepler <InfoTip text="Hedef çözüm süresi geçmiş ama hâlâ açık olan destek talepleri." /></span>}
              value={breachedTicketsCount}
              tone="danger"
            />
          </div>

          {customers.length === 0 && deals.length === 0 ? (
            <div style={{ background: "var(--surface-1)", borderRadius: 12, padding: "2rem 1.5rem", textAlign: "center" }}>
              <p style={{ fontWeight: 500, margin: "0 0 4px" }}>Henüz veri yok</p>
              <p style={{ fontSize: 14, color: "var(--text-secondary)", margin: "0 0 16px" }}>
                Başlamak için önce bir müşteri ekleyin, sonra ona bir fırsat tanımlayın.
              </p>
              <button onClick={() => { setTab("musteri"); setShowCustomerForm(true); }} style={{ background: "var(--fill-accent)", color: "var(--on-accent)", border: "none" }}>
                Müşteri ekle
              </button>
            </div>
          ) : (
            <div>
              <p style={{ fontSize: 14, fontWeight: 500, margin: "0 0 8px" }}>Fırsat aşamaları</p>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px,1fr))", gap: 8 }}>
                {STAGES.filter((s) => s.id !== "kaybedildi").map((stage) => {
                  const stageDeals = deals.filter((d) => d.stage === stage.id);
                  return (
                    <div key={stage.id}>
                      <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 6 }}>
                        {stage.label} · {stageDeals.length}
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
                <p style={{ fontSize: 14, fontWeight: 500, margin: "0 0 12px" }}>Aylık kazanılan gelir</p>
                <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height: 100 }}>
                  {monthlyRevenue.map((m) => (
                    <div key={m.label} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                      <div
                        title={formatTL(m.total)}
                        style={{
                          width: "100%",
                          height: Math.max(4, (m.total / maxMonthly) * 80),
                          background: "var(--fill-accent)",
                          borderRadius: 4,
                        }}
                      />
                      <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>{m.label}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ background: "var(--surface-1)", borderRadius: "var(--radius)", padding: "1rem" }}>
                <p style={{ fontSize: 14, fontWeight: 500, margin: "0 0 12px" }}>Kazanma oranı</p>
                {winRate === null ? (
                  <p style={{ fontSize: 13, color: "var(--text-muted)" }}>Henüz kapanmış fırsat yok.</p>
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
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12, gap: 8, flexWrap: "wrap" }}>
            <input
              value={customerSearch}
              onChange={(e) => setCustomerSearch(e.target.value)}
              placeholder="Müşteri ara (ad, sektör, telefon, e-posta)..."
              style={{ flex: 1, minWidth: 200 }}
            />
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={() =>
                  downloadCsv(
                    "musteriler.csv",
                    ["Firma adı", "Sektör", "Telefon", "E-posta", "Not", "Son temas"],
                    filteredCustomers.map((c) => [
                      c.name,
                      c.sector,
                      c.phone,
                      c.email,
                      c.notes,
                      c.lastContact ? new Date(c.lastContact).toLocaleDateString("tr-TR") : "",
                    ])
                  )
                }
                disabled={filteredCustomers.length === 0}
                style={{ background: "var(--surface-1)", border: "0.5px solid var(--border)", display: "flex", alignItems: "center", gap: 6 }}
              >
                <i className="ti ti-download" style={{ fontSize: 16 }} aria-hidden="true"></i>
                Dışa aktar
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
                onClick={() => { setEditingCustomer(null); setShowCustomerForm(true); }}
                style={{ background: "var(--fill-accent)", color: "var(--on-accent)", border: "none", display: "flex", alignItems: "center", gap: 6 }}
              >
                <i className="ti ti-plus" style={{ fontSize: 16 }} aria-hidden="true"></i>
                Müşteri ekle
              </button>
            </div>
          </div>

          {filteredCustomers.length === 0 ? (
            <p style={{ fontSize: 14, color: "var(--text-secondary)" }}>
              {customers.length === 0 ? "Henüz müşteri eklenmedi." : "Aramayla eşleşen müşteri yok."}
            </p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {filteredCustomers.map((c) => (
                <div
                  key={c.id}
                  style={{ background: "var(--surface-1)", borderRadius: "var(--radius)", padding: "0.75rem 1rem", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}
                >
                  <div onClick={() => setViewingCustomer(c)} style={{ flex: 1, minWidth: 160, cursor: "pointer" }}>
                    <p style={{ margin: 0, fontWeight: 500, fontSize: 14 }}>{c.name}</p>
                    <p style={{ margin: 0, fontSize: 12, color: "var(--text-secondary)" }}>
                      {c.sector} {c.phone ? `· ${c.phone}` : ""}
                    </p>
                  </div>
                  <Badge tone={leadScore(c.lastContact).tone}>{leadScore(c.lastContact).label}</Badge>
                  <Badge tone={daysAgo(c.lastContact) === "Bugün" ? "success" : "default"}>
                    {daysAgo(c.lastContact) || "Temas yok"}
                  </Badge>
                  <button onClick={() => setViewingCustomer(c)} title="Detay ve iletişim geçmişi" style={{ width: 32, height: 32, padding: 0 }}>
                    <i className="ti ti-history" style={{ fontSize: 16 }} aria-hidden="true"></i>
                  </button>
                  <button onClick={() => { setEditingCustomer(c); setShowCustomerForm(true); }} style={{ width: 32, height: 32, padding: 0 }}>
                    <i className="ti ti-edit" style={{ fontSize: 16 }} aria-hidden="true"></i>
                  </button>
                  <button onClick={() => setConfirmDeleteCustomer(c)} style={{ width: 32, height: 32, padding: 0 }}>
                    <i className="ti ti-trash" style={{ fontSize: 16 }} aria-hidden="true"></i>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === "firsat" && (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12, gap: 8, flexWrap: "wrap" }}>
            <div style={{ display: "flex", gap: 4, background: "var(--surface-1)", borderRadius: "var(--radius)", padding: 3 }}>
              <button
                onClick={() => setDealView("kanban")}
                style={{ border: "none", background: dealView === "kanban" ? "var(--surface-2)" : "transparent", display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}
              >
                <i className="ti ti-layout-kanban" style={{ fontSize: 15 }} aria-hidden="true"></i>
                Kanban
              </button>
              <button
                onClick={() => setDealView("list")}
                style={{ border: "none", background: dealView === "list" ? "var(--surface-2)" : "transparent", display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}
              >
                <i className="ti ti-list" style={{ fontSize: 15 }} aria-hidden="true"></i>
                Liste
              </button>
            </div>
            <input
              value={dealSearch}
              onChange={(e) => setDealSearch(e.target.value)}
              placeholder="Fırsat ara (başlık, müşteri)..."
              style={{ flex: 1, minWidth: 160 }}
            />
            <button
              onClick={() =>
                downloadCsv(
                  "firsatlar.csv",
                  ["Müşteri", "Başlık", "Tutar", "Aşama", "Hatırlatma notu"],
                  filteredDeals.map((d) => [
                    customerById(d.customerId)?.name || "",
                    d.title,
                    d.value,
                    STAGES.find((s) => s.id === d.stage)?.label || d.stage,
                    d.reminder,
                  ])
                )
              }
              disabled={filteredDeals.length === 0}
              style={{ background: "var(--surface-1)", border: "0.5px solid var(--border)", display: "flex", alignItems: "center", gap: 6 }}
            >
              <i className="ti ti-download" style={{ fontSize: 16 }} aria-hidden="true"></i>
              Dışa aktar
            </button>
            <button
              onClick={() => { setEditingDeal(null); setShowDealForm(true); }}
              disabled={customers.length === 0}
              style={{ background: "var(--fill-accent)", color: "var(--on-accent)", border: "none", display: "flex", alignItems: "center", gap: 6 }}
            >
              <i className="ti ti-plus" style={{ fontSize: 16 }} aria-hidden="true"></i>
              Fırsat ekle
            </button>
          </div>

          {customers.length === 0 && (
            <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 12 }}>Fırsat eklemeden önce bir müşteri oluşturun.</p>
          )}

          {filteredDeals.length === 0 ? (
            <p style={{ fontSize: 14, color: "var(--text-secondary)" }}>
              {deals.length === 0 ? "Henüz fırsat eklenmedi." : "Aramayla eşleşen fırsat yok."}
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
                      <p style={{ fontSize: 13, fontWeight: 600, margin: "0 0 2px" }}>{stage.label} · {stageDeals.length}</p>
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
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                              <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "var(--text-accent)" }}>{formatTL(d.value)}</p>
                              <button
                                onClick={(e) => { e.stopPropagation(); setTeklifDeal(d); }}
                                title="Teklif PDF"
                                style={{ width: 24, height: 24, padding: 0 }}
                              >
                                <i className="ti ti-file-text" style={{ fontSize: 13 }} aria-hidden="true"></i>
                              </button>
                            </div>
                            {d.reminder && (
                              <p style={{ margin: "4px 0 0", fontSize: 11, color: "var(--text-warning)", display: "flex", alignItems: "center", gap: 4 }}>
                                <i className="ti ti-bell" style={{ fontSize: 12 }} aria-hidden="true"></i>
                                {d.reminder}
                              </p>
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
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {filteredDeals.map((d) => {
                const c = customerById(d.customerId);
                const stageInfo = STAGES.find((s) => s.id === d.stage);
                const tone = d.stage === "kazanildi" ? "success" : d.stage === "kaybedildi" ? "default" : d.stage === "muzakere" ? "warning" : "accent";
                return (
                  <div
                    key={d.id}
                    style={{ background: "var(--surface-1)", borderRadius: "var(--radius)", padding: "0.75rem 1rem", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}
                  >
                    <div style={{ flex: 1, minWidth: 180 }}>
                      <p style={{ margin: 0, fontWeight: 500, fontSize: 14 }}>
                        {c?.name || "Bilinmeyen müşteri"} — {d.title}
                      </p>
                      <p style={{ margin: 0, fontSize: 12, color: "var(--text-secondary)" }}>
                        {d.reminder ? `Hatırlatma: ${d.reminder}` : "Hatırlatma yok"}
                      </p>
                    </div>
                    <Badge tone={tone}>{stageInfo?.label}</Badge>
                    <span style={{ fontSize: 13, fontWeight: 500, minWidth: 90, textAlign: "right" }}>{formatTL(d.value)}</span>
                    <button onClick={() => setTeklifDeal(d)} title="Teklif PDF" style={{ width: 32, height: 32, padding: 0 }}>
                      <i className="ti ti-file-text" style={{ fontSize: 16 }} aria-hidden="true"></i>
                    </button>
                    <button onClick={() => { setEditingDeal(d); setShowDealForm(true); }} style={{ width: 32, height: 32, padding: 0 }}>
                      <i className="ti ti-edit" style={{ fontSize: 16 }} aria-hidden="true"></i>
                    </button>
                    <button onClick={() => setConfirmDeleteDeal(d)} style={{ width: 32, height: 32, padding: 0 }}>
                      <i className="ti ti-trash" style={{ fontSize: 16 }} aria-hidden="true"></i>
                    </button>
                  </div>
                );
              })}
            </div>
          )}
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
        />
      )}

      {showCustomerForm && (
        <Modal title={editingCustomer ? "Müşteriyi düzenle" : "Yeni müşteri"} onClose={() => { setShowCustomerForm(false); setEditingCustomer(null); }}>
          <CustomerForm initial={editingCustomer} onSave={upsertCustomer} onCancel={() => { setShowCustomerForm(false); setEditingCustomer(null); }} />
        </Modal>
      )}

      {showSettingsForm && (
        <Modal title="Şirket ayarları" onClose={() => setShowSettingsForm(false)}>
          <CompanySettingsForm initial={companySettings} onSave={upsertCompanySettings} onCancel={() => setShowSettingsForm(false)} />
        </Modal>
      )}

      {teklifDeal && (
        <TeklifPrint
          deal={teklifDeal}
          customer={customerById(teklifDeal.customerId)}
          companySettings={companySettings}
          onClose={() => setTeklifDeal(null)}
        />
      )}

      {showDealForm && (
        <Modal title={editingDeal ? "Fırsatı düzenle" : "Yeni fırsat"} onClose={() => { setShowDealForm(false); setEditingDeal(null); }}>
          <DealForm customers={customers} initial={editingDeal} onSave={upsertDeal} onCancel={() => { setShowDealForm(false); setEditingDeal(null); }} />
        </Modal>
      )}

      {showCampaignModal && (
        <CampaignModal customers={customers} replyTo={session.user.email} onClose={() => setShowCampaignModal(false)} />
      )}

      {viewingCustomer && (
        <CustomerDetail
          customer={customerById(viewingCustomer.id) || viewingCustomer}
          deals={deals}
          activities={activities}
          onAddActivity={addActivity}
          onClose={() => setViewingCustomer(null)}
        />
      )}

      {confirmDeleteCustomer && (
        <ConfirmDialog
          title="Müşteriyi sil"
          message={`"${confirmDeleteCustomer.name}" silinsin mi? Bu müşteriye ait fırsatlar ve destek talepleri de silinir, bu işlem geri alınamaz.`}
          onConfirm={() => { deleteCustomer(confirmDeleteCustomer.id); setConfirmDeleteCustomer(null); }}
          onClose={() => setConfirmDeleteCustomer(null)}
        />
      )}

      {confirmDeleteDeal && (
        <ConfirmDialog
          title="Fırsatı sil"
          message="Bu fırsatı silmek istediğinize emin misiniz? Bu işlem geri alınamaz."
          onConfirm={() => { deleteDeal(confirmDeleteDeal.id); setConfirmDeleteDeal(null); }}
          onClose={() => setConfirmDeleteDeal(null)}
        />
      )}

      {toast && <Toast message={toast.message} tone={toast.tone} onClose={() => setToast(null)} />}
    </div>
  );
}
