import React, { useState, useEffect } from "react";
import { supabase } from "./supabase";
import { Badge, Modal, MetricCard, InfoTip, Toast, ConfirmDialog, uid, formatTL, daysAgo, downloadCsv, toWhatsAppNumber, WhatsAppIcon, useSessionTimeout, useTheme, matchesDateRange, DateRangeFilter } from "./shared";
import Support, {
  rowToTicket,
  rowToTicketMessage,
  rowToKbArticle,
  getSlaStatus,
  TERMINAL_STATUSES,
  STATUSES,
} from "./Support";
import { ImportModal } from "./ImportExport";

const STAGES = [
  { id: "ilk_gorusme", label: "İlk görüşme" },
  { id: "teklif", label: "Teklif verildi" },
  { id: "muzakere", label: "Müzakere" },
  { id: "kazanildi", label: "Kazanıldı" },
  { id: "kaybedildi", label: "Kaybedildi" },
];

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

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

function rowToCustomer(r) {
  return {
    id: r.id,
    name: r.name,
    sector: r.sector,
    region: r.region || "",
    phone: r.phone || "",
    email: r.email || "",
    notes: r.notes || "",
    lastContact: r.last_contact,
    createdAt: r.created_at,
    portalUserId: r.portal_user_id || null,
    deletedAt: r.deleted_at || null,
  };
}

function rowToDeal(r) {
  return {
    id: r.id,
    customerId: r.customer_id,
    title: r.title,
    value: r.value,
    cost: r.cost || 0,
    stage: r.stage,
    reminder: r.reminder || "",
    reminderDate: r.reminder_date || "",
    lostReason: r.lost_reason || "",
    createdAt: r.created_at,
    closedAt: r.closed_at || null,
    deletedAt: r.deleted_at || null,
  };
}

const LOST_REASONS = ["Yüksek fiyat", "Rakip tercih edildi", "Bütçe yok", "Zamanlama uymadı", "Diğer"];

const CUSTOMER_IMPORT_FIELDS = [
  { key: "name", label: "Ad / Firma adı", required: true },
  { key: "sector", label: "Sektör" },
  { key: "region", label: "Bölge / Şehir" },
  { key: "phone", label: "Telefon" },
  { key: "email", label: "E-posta" },
  { key: "notes", label: "Not", hideInPreview: true },
];

const DEAL_IMPORT_FIELDS = [
  { key: "customerName", label: "Müşteri adı", required: true, resolveCustomer: true },
  { key: "title", label: "Başlık", required: true },
  { key: "value", label: "Tutar", type: "number" },
  { key: "cost", label: "Gider", type: "number" },
  { key: "stage", label: "Aşama", type: "enum", enumOptions: STAGES, enumDefault: "ilk_gorusme" },
];

const PANO_RANGES = [
  { id: "bu_ay", label: "Bu ay" },
  { id: "bu_ceyrek", label: "Bu çeyrek" },
  { id: "bu_yil", label: "Bu yıl" },
  { id: "son_6_ay", label: "Son 6 ay" },
  { id: "tum_zamanlar", label: "Tüm zamanlar" },
];

function getRangeBounds(range) {
  const now = new Date();
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  if (range === "bu_ay") return { start: new Date(now.getFullYear(), now.getMonth(), 1), end };
  if (range === "bu_ceyrek") return { start: new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1), end };
  if (range === "bu_yil") return { start: new Date(now.getFullYear(), 0, 1), end };
  if (range === "son_6_ay") return { start: new Date(now.getFullYear(), now.getMonth() - 5, 1), end };
  return { start: null, end };
}

function inRange(dateStr, { start, end }) {
  const t = new Date(dateStr).getTime();
  if (Number.isNaN(t)) return false;
  if (start && t < start.getTime()) return false;
  return t <= end.getTime();
}

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
    customerNotificationsEnabled: r.customer_notifications_enabled !== false,
  };
}

function CustomerForm({ initial, onSave, onCancel }) {
  const initialIsCustomSector = initial?.sector && !SECTORS.includes(initial.sector);
  const [name, setName] = useState(initial?.name || "");
  const [sector, setSector] = useState(initialIsCustomSector ? "Diğer" : (initial?.sector || SECTORS[0]));
  const [customSector, setCustomSector] = useState(initialIsCustomSector ? initial.sector : "");
  const [region, setRegion] = useState(initial?.region || "");
  const [phone, setPhone] = useState(initial?.phone || "");
  const [email, setEmail] = useState(initial?.email || "");
  const [notes, setNotes] = useState(initial?.notes || "");

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!name.trim()) return;
        if (sector === "Diğer" && !customSector.trim()) return;
        onSave({
          id: initial?.id || uid(),
          name: name.trim(),
          sector: sector === "Diğer" ? customSector.trim() : sector,
          region: region.trim(),
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
      <div style={{ display: "flex", gap: 12, marginBottom: 12 }}>
        <div style={{ flex: 1 }}>
          <label style={{ fontSize: 13, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Sektör</label>
          <select value={sector} onChange={(e) => setSector(e.target.value)} style={{ width: "100%" }}>
            {SECTORS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div style={{ flex: 1 }}>
          <label style={{ fontSize: 13, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Bölge / Şehir</label>
          <input value={region} onChange={(e) => setRegion(e.target.value)} placeholder="İstanbul" style={{ width: "100%" }} />
        </div>
      </div>
      {sector === "Diğer" && (
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
  const [customerNotificationsEnabled, setCustomerNotificationsEnabled] = useState(initial?.customerNotificationsEnabled !== false);

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
          customerNotificationsEnabled,
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
      <div style={{ marginBottom: 16 }}>
        <label style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={customerNotificationsEnabled}
            onChange={(e) => setCustomerNotificationsEnabled(e.target.checked)}
          />
          Müşterilere önemli gelişmelerde otomatik e-posta gönder
        </label>
        <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "4px 0 0 26px" }}>
          Teklif hazır olduğunda, destek talebi durumu değiştiğinde, yeni bir yanıt yazıldığında ve ödeme alındığında müşteriye otomatik bilgilendirme e-postası gider.
        </p>
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
  const [cost, setCost] = useState(initial?.cost ?? "");
  const [stage, setStage] = useState(initial?.stage || "ilk_gorusme");
  const [reminder, setReminder] = useState(initial?.reminder || "");
  const [reminderDate, setReminderDate] = useState(initial?.reminderDate || "");
  const [lostReason, setLostReason] = useState(initial?.lostReason || LOST_REASONS[0]);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!customerId || !title.trim()) return;
        const isClosingStage = stage === "kazanildi" || stage === "kaybedildi";
        const wasAlreadyClosed = initial?.stage === "kazanildi" || initial?.stage === "kaybedildi";
        onSave({
          id: initial?.id || uid(),
          customerId,
          title: title.trim(),
          value: Number(value) || 0,
          cost: Number(cost) || 0,
          stage,
          reminder: reminder.trim(),
          reminderDate: reminderDate || null,
          lostReason: stage === "kaybedildi" ? lostReason : "",
          createdAt: initial?.createdAt || new Date().toISOString(),
          closedAt: isClosingStage
            ? (wasAlreadyClosed && initial?.closedAt ? initial.closedAt : new Date().toISOString())
            : null,
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
        <label style={{ fontSize: 13, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Teklif başlığı</label>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Yıllık tedarik anlaşması" style={{ width: "100%" }} />
      </div>
      <div style={{ display: "flex", gap: 12, marginBottom: 12 }}>
        <div style={{ flex: 1 }}>
          <label style={{ fontSize: 13, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Tutar (TL)</label>
          <input type="number" min="0" value={value} onChange={(e) => setValue(e.target.value)} placeholder="50000" style={{ width: "100%" }} />
        </div>
        <div style={{ flex: 1 }}>
          <label style={{ fontSize: 13, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Gider (TL)</label>
          <input type="number" min="0" value={cost} onChange={(e) => setCost(e.target.value)} placeholder="0" style={{ width: "100%" }} />
        </div>
      </div>
      <div style={{ marginBottom: 12 }}>
        <label style={{ fontSize: 13, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Aşama</label>
        <select value={stage} onChange={(e) => setStage(e.target.value)} style={{ width: "100%" }}>
          {STAGES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>
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

function paymentDateLabel(dateStr) {
  return new Date(dateStr).toLocaleDateString("tr-TR", { day: "numeric", month: "short", year: "numeric" });
}

function DealPayments({ deal, payments, onAddPayment, onDeletePayment }) {
  const [amount, setAmount] = useState("");
  const [paidAt, setPaidAt] = useState(new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const sorted = payments.slice().sort((a, b) => new Date(b.paidAt) - new Date(a.paidAt));
  const totalPaid = payments.reduce((sum, p) => sum + (p.amount || 0), 0);
  const remaining = deal.value - totalPaid;

  const submit = async (e) => {
    e.preventDefault();
    const n = Number(amount);
    if (!n || n <= 0) return;
    setSaving(true);
    await onAddPayment({ dealId: deal.id, amount: n, paidAt, note: note.trim() });
    setAmount("");
    setNote("");
    setSaving(false);
  };

  return (
    <div style={{ marginTop: 20, paddingTop: 16, borderTop: "0.5px solid var(--border)" }}>
      <p style={{ fontSize: 13, fontWeight: 500, margin: "0 0 8px" }}>Tahsilat</p>
      <p style={{ fontSize: 13, margin: "0 0 12px", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span>Toplam: {formatTL(deal.value)} · Tahsil edilen: {formatTL(totalPaid)} · Kalan: {formatTL(Math.max(remaining, 0))}</span>
        {totalPaid > 0 && (
          <Badge tone={remaining <= 0 ? "success" : "warning"}>{remaining <= 0 ? "Ödendi" : "Kısmi ödeme"}</Badge>
        )}
      </p>

      <form onSubmit={submit} style={{ marginBottom: 12 }}>
        <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
          <input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Tutar" style={{ flex: 1 }} />
          <input type="date" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} style={{ width: 140 }} />
        </div>
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Not (opsiyonel)" style={{ width: "100%", marginBottom: 8 }} />
        <button type="submit" disabled={saving || !amount} style={{ background: "var(--fill-accent)", color: "var(--on-accent)", border: "none", fontSize: 13 }}>
          Ekle
        </button>
      </form>

      {sorted.length === 0 ? (
        <p style={{ fontSize: 13, color: "var(--text-muted)" }}>Henüz tahsilat kaydı yok.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 200, overflowY: "auto" }}>
          {sorted.map((p) => (
            <div key={p.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 13 }}>
              <span>{formatTL(p.amount)} <span style={{ color: "var(--text-muted)" }}>· {paymentDateLabel(p.paidAt)}{p.note ? ` · ${p.note}` : ""}</span></span>
              <button onClick={() => onDeletePayment(p.id)} style={{ width: 28, height: 28, padding: 0 }} title="Sil">
                <i className="ti ti-trash" style={{ fontSize: 14 }} aria-hidden="true"></i>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
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
      </div>

      {customerDeals.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <p style={{ fontSize: 13, fontWeight: 500, margin: "0 0 6px" }}>Teklifler</p>
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

function CampaignModal({ customers, replyTo, companyName, onClose }) {
  const emailCustomers = customers.filter((c) => c.email);
  const [selected, setSelected] = useState(() => new Set(emailCustomers.map((c) => c.id)));
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState("");
  const [consentConfirmed, setConsentConfirmed] = useState(false);

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
    if (recipients.length === 0 || !subject.trim() || !message.trim() || !consentConfirmed) return;
    setSending(true);
    setResult("");
    try {
      const res = await fetch("/api/send-campaign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipients, subject, message, replyTo, companyName }),
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
    </Modal>
  );
}

function TeamModal({ session, activeTeamId, companySettings, onClose, notify }) {
  const isOwner = activeTeamId === session.user.id;
  const [members, setMembers] = useState([]);
  const [invites, setInvites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [inviteEmail, setInviteEmail] = useState("");
  const [sending, setSending] = useState(false);

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
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipients: [email],
          subject: `${companySettings?.companyName || "Binerly"} sizi takımına davet etti`,
          message: `Merhaba,\n\n${companySettings?.companyName || "Bir şirket"} sizi Binerly hesabına takım üyesi olarak davet etti. binerly.com adresine bu e-posta ile giriş yaparak (veya kayıt olarak) daveti kabul edebilirsiniz.\n\nBinerly`,
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

  const leaveTeam = async () => {
    const { error } = await supabase.from("team_members").delete().eq("member_id", session.user.id);
    if (error) { notify(`Takımdan ayrılınamadı: ${error.message}`); return; }
    window.location.reload();
  };

  if (!isOwner) {
    return (
      <Modal title="Takım" onClose={onClose}>
        <p style={{ fontSize: 13, color: "var(--text-secondary)" }}>
          Bu hesap <strong>{companySettings?.companyName || "bir şirket"}</strong> takımının bir üyesi. Tüm müşteri, teklif ve destek verisi bu takımla paylaşılıyor.
        </p>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
          <button onClick={onClose}>Kapat</button>
          <button onClick={leaveTeam} style={{ color: "var(--text-danger)" }}>Takımdan ayrıl</button>
        </div>
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
                <div key={m.member_id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: "0.5px solid var(--border)" }}>
                  <span style={{ fontSize: 13 }}>{m.email}</span>
                  <button onClick={() => removeMember(m.member_id)} style={{ fontSize: 12, color: "var(--text-danger)" }}>Kaldır</button>
                </div>
              ))
            )}
          </div>
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
  tickets: "Talep",
  kb_articles: "Makale",
};

function TrashHistoryModal({ notify, onRestore, onClose }) {
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
    const [{ data: c }, { data: d }, { data: pay }, { data: t }, { data: kb }, { data: log }] = await Promise.all([
      supabase.from("customers").select("id,name,deleted_at,deleted_batch_id").not("deleted_at", "is", null),
      supabase.from("deals").select("id,title,deleted_at,deleted_batch_id").not("deleted_at", "is", null),
      supabase.from("payments").select("id,amount,deleted_at,deleted_batch_id").not("deleted_at", "is", null),
      supabase.from("tickets").select("id,subject,deleted_at,deleted_batch_id").not("deleted_at", "is", null),
      supabase.from("kb_articles").select("id,title,deleted_at,deleted_batch_id").not("deleted_at", "is", null),
      supabase.from("audit_log").select("*").order("created_at", { ascending: false }).limit(200),
    ]);

    const rows = [
      ...(c || []).map((r) => ({ table: "customers", label: r.name, ...r })),
      ...(d || []).map((r) => ({ table: "deals", label: r.title, ...r })),
      ...(pay || []).map((r) => ({ table: "payments", label: `${formatTL(r.amount)} tahsilat`, ...r })),
      ...(t || []).map((r) => ({ table: "tickets", label: r.subject, ...r })),
      ...(kb || []).map((r) => ({ table: "kb_articles", label: r.title, ...r })),
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
                    <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>{daysAgo(g.deletedAt)} silindi</div>
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
                {r.actor_email} · {daysAgo(r.created_at)}
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

function AppSettingsModal({ session, theme, onThemeChange, pushSubscribed, onSubscribe, onUnsubscribe, notify, onClose }) {
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
    <Modal title="Ayarlar" onClose={onClose}>
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

  const sendResetEmail = async () => {
    if (!email) { setMessage("Önce e-posta adresinizi yazın."); return; }
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/`,
    });
    setLoading(false);
    setMessage(error ? error.message : "E-postanıza bir şifre sıfırlama bağlantısı gönderdik.");
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

function EntryChoiceModal({ onChooseCompany, onChooseCustomer, onClose }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: "1rem" }}>
      <div style={{ background: "#fff", borderRadius: 16, padding: "2rem", width: "100%", maxWidth: 380, textAlign: "center", position: "relative" }}>
        <button onClick={onClose} style={{ position: "absolute", top: 16, right: 16, background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#666" }}>✕</button>
        <img src="/favicon.svg" alt="Binerly" style={{ width: 32, height: 32, marginBottom: 14 }} />
        <h2 style={{ fontSize: 17, fontWeight: 700, margin: "0 0 6px", color: "#0c2540" }}>Nasıl giriş yapmak istersiniz?</h2>
        <p style={{ fontSize: 13, color: "#5b7088", margin: "0 0 20px" }}>
          Bir KOBİ hesabı mı işletiyorsunuz, yoksa bir firmanın müşterisi misiniz?
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <button
            onClick={onChooseCompany}
            style={{ background: "#185fa5", color: "#fff", border: "none", borderRadius: 8, padding: "13px", fontSize: 15, fontWeight: 600, cursor: "pointer" }}
          >
            İşletme olarak
          </button>
          <button
            onClick={onChooseCustomer}
            style={{ background: "#fff", color: "#185fa5", border: "1.5px solid #185fa5", borderRadius: 8, padding: "13px", fontSize: 15, fontWeight: 600, cursor: "pointer" }}
          >
            Müşteri olarak
          </button>
        </div>
      </div>
    </div>
  );
}

function LandingPage() {
  const [authModal, setAuthModal] = useState(null);
  const [showEntryChoice, setShowEntryChoice] = useState(false);

  return (
    <div style={{ minHeight: "100vh", background: "#f5f8fc", fontFamily: "system-ui, -apple-system, sans-serif" }}>
      {authModal && <AuthModal initialMode={authModal} onClose={() => setAuthModal(null)} />}
      {showEntryChoice && (
        <EntryChoiceModal
          onChooseCompany={() => { setShowEntryChoice(false); setAuthModal("login"); }}
          onChooseCustomer={() => { window.location.href = "/portal"; }}
          onClose={() => setShowEntryChoice(false)}
        />
      )}

      {/* Navbar */}
      <nav style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 2rem", height: 64, background: "#fff", borderBottom: "1px solid #e1e8f0", position: "sticky", top: 0, zIndex: 100 }}>
        <div onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
          <img src="/favicon.svg" alt="Binerly" style={{ width: 28, height: 28 }} />
          <span style={{ fontWeight: 700, fontSize: 18, color: "#0c2540" }}>Binerly</span>
        </div>
        <div style={{ display: "flex", gap: 28, alignItems: "center" }}>
          <div className="landing-nav-links" style={{ display: "flex", gap: 24 }}>
            <a href="#ozellikler" style={{ color: "#0c2540", fontWeight: 500, fontSize: 14, textDecoration: "none" }}>Hizmetlerimiz</a>
            <a href="#hakkimizda" style={{ color: "#0c2540", fontWeight: 500, fontSize: 14, textDecoration: "none" }}>Hakkımızda</a>
          </div>
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <button onClick={() => setShowEntryChoice(true)} style={{ background: "none", border: "none", color: "#185fa5", fontWeight: 600, fontSize: 14, cursor: "pointer", padding: "8px 12px" }}>
              Giriş Yap
            </button>
            <button onClick={() => setAuthModal("register")} style={{ background: "#185fa5", color: "#fff", border: "none", borderRadius: 8, padding: "8px 18px", fontWeight: 600, fontSize: 14, cursor: "pointer" }}>
              Ücretsiz Dene
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
            Satış, destek ve müşterinizin kendi portalı — hepsi bir arada, KOBİ'ler için.
          </p>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <button onClick={() => setAuthModal("register")} style={{ background: "#185fa5", color: "#fff", border: "none", borderRadius: 8, padding: "13px 28px", fontWeight: 700, fontSize: 15, cursor: "pointer" }}>
              Ücretsiz Kullanmaya Başla →
            </button>
            <button onClick={() => setShowEntryChoice(true)} style={{ background: "#fff", color: "#185fa5", border: "1.5px solid #185fa5", borderRadius: 8, padding: "13px 28px", fontWeight: 600, fontSize: 15, cursor: "pointer" }}>
              Giriş Yap
            </button>
          </div>
          <p style={{ fontSize: 13, color: "#185fa5", fontWeight: 600, margin: "12px 0 0" }}>
            Erken erişim aşamasındayız, şu an için tamamen ücretsiz.
          </p>
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
              {[["Açık Teklifler", "12"], ["Kazanılan", "8"], ["Toplam Değer", "₺284K"]].map(([label, val]) => (
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
              desc: "İlk temastan kapanışa kadar tüm satış sürecini Kanban tahtasında takip edin. Tek tıkla markalı PDF teklif oluşturun, hatırlatma tarihiyle takip randevularınızı kaçırmayın.",
              tags: ["Kanban Pipeline", "PDF Teklif", "Hatırlatma E-postaları"],
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
              desc: "Müşterileriniz kendi hesaplarıyla giriş yapıp destek taleplerini açabilir, sizinle mesajlaşabilir ve tekliflerinin durumunu görebilir — telefon trafiğinizi azaltır.",
              tags: ["Müşteri Portalı", "Kendi Talebini Takip"],
            },
            {
              id: "raporlama",
              icon: "ti-chart-bar",
              title: "Raporlama & Analitik",
              desc: "Kazanma oranı, aylık kazanılan gelir grafiği ve kayıp nedeni analizleriyle stratejik kararlar alın.",
              tags: ["Dashboard", "Kayıp Analizi"],
            },
            {
              id: "entegrasyonlar",
              icon: "ti-plug-connected",
              title: "Entegrasyonlar & Mobil",
              desc: "Uygulamayı telefonunuza kurup anında bildirim alın, müşterinize tek tıkla WhatsApp'tan ulaşın. Gmail/Outlook senkronizasyonu ve muhasebe/ERP entegrasyonu yol haritamızda.",
              tags: ["Mobil Uygulama (PWA)", "Anlık Bildirim", "WhatsApp", "Yakında: ERP/Muhasebe"],
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
                KOBİ'lerin günlük operasyonel yükünü azaltıp dijitalleştirerek, zamanlarını ve zihinlerini işlerini büyütmeye, şirketlerini daha iyiye taşıyacak kararlar almaya ve müşterileriyle daha kaliteli ilişkiler kurmaya ayırabilmelerini sağlamak.
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
                Bizim için en önemli değer güven. Verileriniz güvenli şekilde saklanır, KVKK'ya uygun işlenir, asla üçüncü taraflarla paylaşılmaz. Kredi kartı istemeden ücretsiz deneyebilir, istediğiniz an ayrılabilirsiniz.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* CTA */}
      <div style={{ background: "#185fa5", padding: "4rem 2rem", textAlign: "center" }}>
        <h2 style={{ fontSize: "1.75rem", fontWeight: 800, color: "#fff", margin: "0 0 1rem" }}>
          Hemen başlayın, ücretsiz kullanın
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
              <img src="/favicon.svg" alt="Binerly" style={{ width: 22, height: 22 }} />
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
              <a href="#hakkimizda" style={{ fontSize: 13, color: "#5b7088", textDecoration: "none" }}>Hakkımızda</a>
              <a href="mailto:info@binerly.com" style={{ fontSize: 13, color: "#5b7088", textDecoration: "none" }}>İletişim</a>
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
  const [session, setSession] = useState(undefined);
  const [tab, setTab] = useState("pano");
  const [customers, setCustomers] = useState([]);
  const [deals, setDeals] = useState([]);
  const [activities, setActivities] = useState([]);
  const [payments, setPayments] = useState([]);
  const [tickets, setTickets] = useState([]);
  const [ticketMessages, setTicketMessages] = useState([]);
  const [kbArticles, setKbArticles] = useState([]);
  const [companySettings, setCompanySettings] = useState(null);
  // v1: üye sayısı sınırsız, henüz billing yok. Billing eklendiğinde davet
  // oluşturma burada plan bazlı sınırlanabilir.
  const [activeTeamId, setActiveTeamId] = useState(undefined);
  const [pendingInvites, setPendingInvites] = useState([]);
  const [dismissedInviteIds, setDismissedInviteIds] = useState([]);
  const [showSettingsForm, setShowSettingsForm] = useState(false);
  const [showTeamModal, setShowTeamModal] = useState(false);
  const [showAppSettings, setShowAppSettings] = useState(false);
  const [showTrashHistory, setShowTrashHistory] = useState(false);
  const [showImportCustomers, setShowImportCustomers] = useState(false);
  const [showImportDeals, setShowImportDeals] = useState(false);
  const [showImportTickets, setShowImportTickets] = useState(false);
  const [showImportKbArticles, setShowImportKbArticles] = useState(false);
  const [showPasswordRecovery, setShowPasswordRecovery] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showCustomerForm, setShowCustomerForm] = useState(false);
  const [showDealForm, setShowDealForm] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState(null);
  const [editingDeal, setEditingDeal] = useState(null);
  const [viewingCustomer, setViewingCustomer] = useState(null);
  const [dealView, setDealView] = useState("list");
  const [panoRange, setPanoRange] = useState("tum_zamanlar");
  const [dragDealId, setDragDealId] = useState(null);
  const [showCampaignModal, setShowCampaignModal] = useState(false);
  const [confirmDeleteCustomer, setConfirmDeleteCustomer] = useState(null);
  const [confirmDeleteDeal, setConfirmDeleteDeal] = useState(null);
  const [customerSearch, setCustomerSearch] = useState("");
  const [customerFromDate, setCustomerFromDate] = useState("");
  const [customerToDate, setCustomerToDate] = useState("");
  const [customerSectorFilter, setCustomerSectorFilter] = useState("all");
  const [dealSearch, setDealSearch] = useState("");
  const [dealFromDate, setDealFromDate] = useState("");
  const [dealToDate, setDealToDate] = useState("");
  const [dealStageFilter, setDealStageFilter] = useState("all");
  const [dealPaymentFilter, setDealPaymentFilter] = useState("all");
  const [teklifDeal, setTeklifDeal] = useState(null);
  const [quickList, setQuickList] = useState(null);
  const [initialViewTicketId, setInitialViewTicketId] = useState(null);
  const [toast, setToast] = useState(null);
  const [pushSubscribed, setPushSubscribed] = useState(false);

  const notify = (message, tone = "danger") => setToast({ message, tone });

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(timer);
  }, [toast]);

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
      setCustomers([]); setDeals([]); setActivities([]); setPayments([]);
      setTickets([]); setTicketMessages([]); setKbArticles([]);
      setCompanySettings(null);
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
      supabase.from("tickets").select("*").is("deleted_at", null).order("created_at"),
      supabase.from("ticket_messages").select("*").order("created_at"),
      supabase.from("kb_articles").select("*").is("deleted_at", null).order("created_at"),
      supabase.from("company_settings").select("*").maybeSingle(),
      supabase.from("team_members").select("team_id").eq("member_id", session.user.id).maybeSingle(),
      supabase.from("team_invites").select("*").eq("status", "pending"),
    ]).then(([{ data: c }, { data: d }, { data: a }, { data: pay }, { data: t }, { data: tm }, { data: kb }, { data: cs }, { data: myMembership }, { data: invites }]) => {
      setCustomers((c || []).map(rowToCustomer));
      setDeals((d || []).map(rowToDeal));
      setActivities((a || []).map(rowToActivity));
      setPayments((pay || []).map(rowToPayment));
      setTickets((t || []).map(rowToTicket));
      setTicketMessages((tm || []).map(rowToTicketMessage));
      setKbArticles((kb || []).map(rowToKbArticle));
      setCompanySettings(cs ? rowToCompanySettings(cs) : null);
      setActiveTeamId(myMembership ? myMembership.team_id : session.user.id);
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

  useEffect(() => {
    if (!session || !("serviceWorker" in navigator)) { setPushSubscribed(false); return; }
    navigator.serviceWorker.ready
      .then((registration) => registration.pushManager.getSubscription())
      .then((sub) => setPushSubscribed(!!sub))
      .catch(() => {});
  }, [session]);

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
  const notifyCustomerByEmail = async (customer, subject, message) => {
    if (companySettings?.customerNotificationsEnabled === false) return;
    if (!customer?.email) return;
    try {
      await fetch("/api/send-campaign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipients: [customer.email],
          subject,
          message,
          replyTo: session.user.email,
          companyName: companySettings?.companyName,
        }),
      });
    } catch {
      // yoksay — bildirim maili başarısız olsa da asıl işlemi bozmaz
    }
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
      sector: c.sector,
      region: c.region,
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

    const ticketIds = customerTickets.map((t) => t.id);
    setCustomers((prev) => prev.filter((c) => c.id !== id));
    setDeals((prev) => prev.filter((d) => d.customerId !== id));
    setTickets((prev) => prev.filter((t) => t.customerId !== id));
    setTicketMessages((prev) => prev.filter((m) => !ticketIds.includes(m.ticketId)));
    setPayments((prev) => prev.filter((p) => !dealIds.includes(p.dealId)));

    logAction("customers", id, "deleted", `${customer?.name || "Müşteri"} çöp kutusuna taşındı`);
    customerDeals.forEach((d) => logAction("deals", d.id, "deleted", `${d.title} (teklif) çöp kutusuna taşındı`));
    customerTickets.forEach((t) => logAction("tickets", t.id, "deleted", `${t.subject} (talep) çöp kutusuna taşındı`));
    cascadePayments.forEach((p) => logAction("payments", p.id, "deleted", `${formatTL(p.amount)} tahsilat çöp kutusuna taşındı`));
  };

  const upsertDeal = async (d) => {
    const isNew = !deals.some((x) => x.id === d.id);
    const previousStage = deals.find((x) => x.id === d.id)?.stage;
    const row = {
      id: d.id,
      user_id: activeTeamId,
      customer_id: d.customerId,
      title: d.title,
      value: d.value,
      cost: d.cost,
      stage: d.stage,
      reminder: d.reminder,
      reminder_date: d.reminderDate || null,
      lost_reason: d.lostReason,
      created_at: d.createdAt,
      closed_at: d.closedAt || null,
    };
    const { data, error } = await supabase.from("deals").upsert(row).select().single();
    if (error) { notify(`Teklif kaydedilemedi: ${error.message}`); return; }
    const deal = rowToDeal(data);
    setDeals((prev) =>
      prev.some((x) => x.id === deal.id) ? prev.map((x) => (x.id === deal.id ? deal : x)) : [...prev, deal]
    );
    setShowDealForm(false);
    setEditingDeal(null);
    logAction("deals", deal.id, isNew ? "created" : "updated", `${deal.title} ${isNew ? "oluşturuldu" : "güncellendi"}`);
    if (deal.stage === "teklif" && previousStage !== "teklif") {
      const customer = customers.find((c) => c.id === deal.customerId);
      const company = companySettings?.companyName || "Binerly";
      notifyCustomerByEmail(
        customer,
        `Teklifiniz hazır — ${company}`,
        `Merhaba,\n\n${company} sizin için bir teklif hazırladı: "${deal.title}" — ${formatTL(deal.value)}\n\nDetaylar için bizimle iletişime geçebilir veya müşteri portalımızdan tekliflerinizi görüntüleyebilirsiniz: https://binerly.com/portal\n\n${company}`
      );
    }
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
    if (payErr) { notify(`Teklif silinemedi: ${payErr.message}`); return; }
    const { error } = await supabase
      .from("deals")
      .update({ deleted_at: now, deleted_batch_id: batchId })
      .eq("id", id);
    if (error) { notify(`Teklif silinemedi: ${error.message}`); return; }
    setDeals((prev) => prev.filter((d) => d.id !== id));
    setPayments((prev) => prev.filter((p) => p.dealId !== id));
    logAction("deals", id, "deleted", `${deal?.title || "Teklif"} çöp kutusuna taşındı`);
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
      `Merhaba,\n\n"${deal?.title || "Teklifiniz"}" için ${formatTL(payment.amount)} tutarındaki ödemeniz alınmıştır. Teşekkür ederiz.\n\n${company}`
    );
  };

  const deletePayment = async (id) => {
    const payment = payments.find((p) => p.id === id);
    const batchId = uid();
    const { error } = await supabase
      .from("payments")
      .update({ deleted_at: new Date().toISOString(), deleted_batch_id: batchId })
      .eq("id", id);
    if (error) { notify(`Tahsilat silinemedi: ${error.message}`); return; }
    setPayments((prev) => prev.filter((p) => p.id !== id));
    logAction("payments", id, "deleted", `${formatTL(payment?.amount || 0)} tahsilat çöp kutusuna taşındı`);
  };

  const seedDemoData = async () => {
    const now = new Date().toISOString();
    const todayStr = new Date().toISOString().slice(0, 10);
    const demoNote = "Bu örnek bir kayıttır, istediğiniz zaman silebilirsiniz.";
    const demoCustomers = [
      { id: uid(), name: "Örnek Müşteri — Akın İnşaat", sector: "İnşaat", phone: "0532 000 00 01", email: "", notes: demoNote, lastContact: now, createdAt: now },
      { id: uid(), name: "Örnek Müşteri — Medipark Klinik", sector: "Medikal", phone: "0532 000 00 02", email: "", notes: demoNote, lastContact: now, createdAt: now },
      { id: uid(), name: "Örnek Müşteri — Tazegül Gıda", sector: "Gıda", phone: "0532 000 00 03", email: "", notes: demoNote, lastContact: now, createdAt: now },
    ];
    for (const c of demoCustomers) await upsertCustomer(c);

    const demoDeals = [
      { id: uid(), customerId: demoCustomers[0].id, title: "Yıllık bakım anlaşması", value: 45000, cost: 0, stage: "ilk_gorusme", reminder: "", reminderDate: null, lostReason: "", createdAt: now, closedAt: null },
      { id: uid(), customerId: demoCustomers[1].id, title: "Ekipman teklifi", value: 60000, cost: 0, stage: "muzakere", reminder: "Fiyat için tekrar ara", reminderDate: todayStr, lostReason: "", createdAt: now, closedAt: null },
      { id: uid(), customerId: demoCustomers[2].id, title: "Tedarik sözleşmesi", value: 32000, cost: 12000, stage: "kazanildi", reminder: "", reminderDate: null, lostReason: "", createdAt: now, closedAt: now },
    ];
    for (const d of demoDeals) await upsertDeal(d);
    notify("Örnek veriler eklendi.", "success");
  };

  const moveDealStage = async (id, stage) => {
    const current = deals.find((d) => d.id === id);
    const previousStage = current?.stage;
    const isClosingStage = stage === "kazanildi" || stage === "kaybedildi";
    const wasAlreadyClosed = previousStage === "kazanildi" || previousStage === "kaybedildi";
    const closedAt = isClosingStage
      ? (wasAlreadyClosed && current?.closedAt ? current.closedAt : new Date().toISOString())
      : null;
    setDeals((prev) => prev.map((d) => (d.id === id ? { ...d, stage, closedAt } : d)));
    const { error } = await supabase.from("deals").update({ stage, closed_at: closedAt }).eq("id", id);
    if (error) {
      notify(`Aşama güncellenemedi: ${error.message}`);
      setDeals((prev) => prev.map((d) => (d.id === id ? { ...d, stage: previousStage, closedAt: current?.closedAt ?? null } : d)));
    } else {
      const stageLabel = STAGES.find((s) => s.id === stage)?.label || stage;
      logAction("deals", id, "updated", `${current?.title || "Teklif"} aşaması "${stageLabel}" olarak güncellendi`);
      if (stage === "teklif" && previousStage !== "teklif") {
        const customer = customers.find((c) => c.id === current?.customerId);
        const company = companySettings?.companyName || "Binerly";
        notifyCustomerByEmail(
          customer,
          `Teklifiniz hazır — ${company}`,
          `Merhaba,\n\n${company} sizin için bir teklif hazırladı: "${current?.title || ""}" — ${formatTL(current?.value || 0)}\n\nDetaylar için bizimle iletişime geçebilir veya müşteri portalımızdan tekliflerinizi görüntüleyebilirsiniz: https://binerly.com/portal\n\n${company}`
        );
      }
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
      const customer = customers.find((c) => c.id === ticket.customerId);
      const company = companySettings?.companyName || "Binerly";
      const statusLabel = STATUSES.find((s) => s.id === ticket.status)?.label || ticket.status;
      notifyCustomerByEmail(
        customer,
        `Destek talebiniz güncellendi — ${company}`,
        `Merhaba,\n\n"${ticket.subject}" konulu talebinizin durumu "${statusLabel}" olarak güncellendi.\n\nDetaylar için müşteri portalımızdan giriş yapabilirsiniz: https://binerly.com/portal\n\n${company}`
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
        const customer = customers.find((c) => c.id === previous?.customerId);
        const company = companySettings?.companyName || "Binerly";
        const statusLabel = STATUSES.find((s) => s.id === status)?.label || status;
        notify(`[TEŞHİS] müşteri=${customer?.name || "yok"} e-posta=${customer?.email || "yok"} ayar=${String(companySettings?.customerNotificationsEnabled)}`, "success");
        notifyCustomerByEmail(
          customer,
          `Destek talebiniz güncellendi — ${company}`,
          `Merhaba,\n\n"${previous?.subject || "Destek talebiniz"}" konulu talebinizin durumu "${statusLabel}" olarak güncellendi.\n\nDetaylar için müşteri portalımızdan giriş yapabilirsiniz: https://binerly.com/portal\n\n${company}`
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
        `Merhaba,\n\n"${ticket?.subject || "Destek talebiniz"}" konulu talebinize yeni bir yanıt geldi:\n\n"${content.slice(0, 300)}"\n\nTam görüşme için müşteri portalımıza giriş yapabilirsiniz: https://binerly.com/portal\n\n${company}`
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
      { name: "tickets", setter: setTickets, map: rowToTicket, label: (r) => r.subject },
      { name: "kb_articles", setter: setKbArticles, map: rowToKbArticle, label: (r) => r.title },
    ];
    let anyError = null;
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

  const bulkImportCustomers = async (records, onProgress) => {
    const now = new Date().toISOString();
    const rows = records.map((r) => ({
      id: uid(), user_id: activeTeamId, name: r.name, sector: r.sector || "",
      region: r.region || "", phone: r.phone || "", email: r.email || "",
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
        reminder: "", reminder_date: null, lost_reason: "",
        created_at: now, closed_at: isClosingStage ? now : null,
      };
    });
    const outcome = await bulkInsertChunked("deals", rows, rowToDeal, setDeals, onProgress);
    if (outcome.insertedCount > 0) logAction("deals", uid(), "created", `${outcome.insertedCount} teklif içe aktarıldı`);
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
      customer_notifications_enabled: s.customerNotificationsEnabled !== false,
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await supabase.from("company_settings").upsert(row).select().single();
    if (error) { notify(`Şirket ayarları kaydedilemedi: ${error.message}`); return; }
    setCompanySettings(rowToCompanySettings(data));
    setShowSettingsForm(false);
  };

  const acceptTeamInvite = async (invite) => {
    const { error } = await supabase.rpc("accept_team_invite", { p_owner_id: invite.owner_id });
    if (error) { notify(`Davet kabul edilemedi: ${error.message}`); return; }
    window.location.reload();
  };

  if (session === undefined) return <div style={{ padding: "2rem", textAlign: "center", color: "var(--text-secondary)" }}>Yükleniyor…</div>;
  if (!session) return <LandingPage />;

  if (loading) return <div style={{ padding: "2rem 0", textAlign: "center", color: "var(--text-secondary)" }}>Yükleniyor…</div>;

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
  const totalOpenValue = openDeals.reduce((sum, d) => sum + (d.value || 0), 0);
  const dealsWithReminder = deals.filter((d) => d.reminder && d.stage !== "kazanildi" && d.stage !== "kaybedildi");
  const customerById = (id) => customers.find((c) => c.id === id);

  const customerQuery = customerSearch.trim().toLowerCase();
  const filteredCustomers = customers.filter((c) => {
    if (!matchesDateRange(c.lastContact, customerFromDate, customerToDate)) return false;
    if (customerSectorFilter !== "all" && c.sector !== customerSectorFilter) return false;
    if (!customerQuery) return true;
    return [c.name, c.sector, c.region, c.phone, c.email].some((f) => (f || "").toLowerCase().includes(customerQuery));
  });

  const dealQuery = dealSearch.trim().toLowerCase();
  const filteredDeals = deals.filter((d) => {
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
  });

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

  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);
  const dueReminderDeals = deals.filter(
    (d) => d.reminder && d.reminderDate && d.stage !== "kazanildi" && d.stage !== "kaybedildi" && new Date(d.reminderDate) <= todayEnd
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

  const lostReasonCounts = LOST_REASONS.map((reason) => ({
    reason,
    count: lostDeals.filter((d) => d.lostReason === reason).length,
  })).filter((r) => r.count > 0);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1.5rem" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <img src="/favicon.svg" alt="Binerly" style={{ width: 22, height: 22 }} />
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
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={() => (pushSubscribed ? unsubscribeFromPush() : subscribeToPush())}
            style={{ width: 32, height: 32, padding: 0 }}
            title={pushSubscribed ? "Bildirimler açık (kapatmak için tıkla)" : "Yeni mesaj bildirimlerini aç"}
          >
            <i className={`ti ${pushSubscribed ? "ti-bell-ringing" : "ti-bell"}`} style={{ fontSize: 16, color: pushSubscribed ? "var(--text-accent)" : undefined }} aria-hidden="true"></i>
          </button>
          <button
            onClick={() => setShowTeamModal(true)}
            style={{ width: 32, height: 32, padding: 0 }}
            title="Takım"
          >
            <i className="ti ti-users-group" style={{ fontSize: 16 }} aria-hidden="true"></i>
          </button>
          <button
            onClick={() => setShowSettingsForm(true)}
            style={{ width: 32, height: 32, padding: 0 }}
            title="Şirket ayarları"
          >
            <i className="ti ti-settings" style={{ fontSize: 16 }} aria-hidden="true"></i>
          </button>
          <button
            onClick={() => setShowAppSettings(true)}
            style={{ width: 32, height: 32, padding: 0 }}
            title="Ayarlar"
          >
            <i className="ti ti-adjustments" style={{ fontSize: 16 }} aria-hidden="true"></i>
          </button>
          <button
            onClick={() => setShowTrashHistory(true)}
            style={{ width: 32, height: 32, padding: 0 }}
            title="Çöp Kutusu ve Geçmiş"
          >
            <i className="ti ti-history" style={{ fontSize: 16 }} aria-hidden="true"></i>
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

      <p style={{ fontSize: 11, color: "var(--text-accent)", fontWeight: 500, margin: "-12px 0 12px" }}>
        🎉 Erken erişim aşamasındayız, şu an için tamamen ücretsiz.
      </p>

      {!pushSubscribed && (
        <p style={{ fontSize: 11, color: "var(--text-muted)", margin: "-12px 0 12px" }}>
          🔔 simgesine basarak yeni müşteri mesajlarında anında bildirim alabilirsiniz. iPhone'da bildirim almak için önce uygulamayı Ana Ekrana eklemeniz gerekir.
        </p>
      )}

      {pendingInvites
        .filter((inv) => !dismissedInviteIds.includes(inv.id))
        .map((inv) => (
          <div
            key={inv.id}
            style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              background: "var(--bg-accent)", border: "0.5px solid var(--border-strong)",
              borderRadius: "var(--radius)", padding: "10px 14px", marginBottom: 12, fontSize: 13,
            }}
          >
            <span>
              Bir şirket sizi takımına davet etti ({inv.email}) — takıma katılırsanız o şirketin tüm müşteri/teklif/destek verisini görüp düzenleyebilirsiniz.
              {(customers.length > 0 || deals.length > 0) && " Mevcut verileriniz size özel kalacak, takıma taşınmayacak."}
            </span>
            <span style={{ display: "flex", gap: 8, flexShrink: 0, marginLeft: 12 }}>
              <button onClick={() => setDismissedInviteIds((prev) => [...prev, inv.id])}>Şimdi değil</button>
              <button onClick={() => acceptTeamInvite(inv)} style={{ background: "var(--fill-accent)", color: "var(--on-accent)", border: "none" }}>Kabul et</button>
            </span>
          </div>
        ))}

      <h2 className="sr-only">KOBİ satış takip uygulaması: pano, müşteriler ve teklif ve anlaşmalar sekmeleri</h2>

      <div style={{ display: "flex", gap: 8, marginBottom: "1.5rem" }}>
        {[
          { id: "pano", label: "Pano", icon: "ti-layout-dashboard" },
          { id: "musteri", label: "Müşteriler", icon: "ti-building" },
          { id: "firsat", label: "Teklif ve Anlaşmalar", icon: "ti-target-arrow" },
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
              position: "relative",
            }}
          >
            <i className={`ti ${t.icon}`} style={{ fontSize: 16 }} aria-hidden="true"></i>
            {t.label}
            {t.id === "destek" && unreadMessagesCount > 0 && (
              <span
                style={{
                  position: "absolute", top: -6, right: -6, minWidth: 18, height: 18, borderRadius: 9,
                  background: "var(--text-danger)", color: "var(--on-accent)", fontSize: 11, fontWeight: 700,
                  display: "flex", alignItems: "center", justifyContent: "center", padding: "0 4px",
                }}
              >
                {unreadMessagesCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {tab === "pano" && (
        <div>
          <div style={{ background: "var(--surface-1)", borderRadius: "var(--radius)", padding: "1rem", marginBottom: "1.5rem" }}>
            <p style={{ fontSize: 14, fontWeight: 500, margin: "0 0 10px" }}>Bugün ne yapmalıyım</p>
            {dueReminderDeals.length === 0 && urgentTickets.length === 0 ? (
              <p style={{ fontSize: 13, color: "var(--text-muted)", margin: 0 }}>Bugün için acil bir şey yok.</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 260, overflowY: "auto" }}>
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
                style={{ border: "none", background: panoRange === r.id ? "var(--surface-2)" : "transparent", fontSize: 13 }}
              >
                {r.label}
              </button>
            ))}
          </div>

          <p style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase", margin: "0 0 8px" }}>Şu an</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px,1fr))", gap: 12, marginBottom: "1.5rem" }}>
            <MetricCard
              label="Açık teklifler"
              value={openDeals.length}
              onClick={openDeals.length > 0 ? () => openDealOrList(openDeals, "Açık teklifler") : undefined}
            />
            <MetricCard
              label="Açık teklif değeri"
              value={formatTL(totalOpenValue)}
              onClick={openDeals.length > 0 ? () => openDealOrList(openDeals, "Açık teklifler") : undefined}
            />
            <MetricCard
              label="Bekleyen alacak"
              value={formatTL(totalOutstanding)}
              onClick={dealsWithOutstanding.length > 0 ? () => openDealOrList(dealsWithOutstanding, "Bekleyen alacağı olan teklifler") : undefined}
            />
            <MetricCard
              label="Hatırlatması olan"
              value={dealsWithReminder.length}
              tone="warning"
              onClick={dealsWithReminder.length > 0 ? () => openDealOrList(dealsWithReminder, "Hatırlatması olan teklifler") : undefined}
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
              onClick={wonDeals.length > 0 ? () => openDealOrList(wonDeals, "Kazanılan teklifler") : undefined}
            />
            <MetricCard
              label="Toplam gelir"
              value={formatTL(rangeRevenue)}
              onClick={wonDeals.length > 0 ? () => openDealOrList(wonDeals, "Kazanılan teklifler") : undefined}
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
              label="Ortalama teklif büyüklüğü"
              value={rangeAvgDealSize !== null ? formatTL(rangeAvgDealSize) : "—"}
            />
          </div>

          {customers.length === 0 && deals.length === 0 ? (
            <div style={{ background: "var(--surface-1)", borderRadius: 12, padding: "2rem 1.5rem", textAlign: "center" }}>
              <p style={{ fontWeight: 500, margin: "0 0 4px" }}>Henüz veri yok</p>
              <p style={{ fontSize: 14, color: "var(--text-secondary)", margin: "0 0 16px" }}>
                Başlamak için önce bir müşteri ekleyin, sonra ona bir teklif tanımlayın.
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
              <p style={{ fontSize: 14, fontWeight: 500, margin: "0 0 8px" }}>Teklif aşamaları</p>
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
                  <p style={{ fontSize: 13, color: "var(--text-muted)" }}>Henüz kapanmış teklif yok.</p>
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
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12, gap: 8, flexWrap: "wrap" }}>
            <button
              onClick={() =>
                downloadCsv(
                  "musteriler.csv",
                  ["Firma adı", "Sektör", "Bölge", "Telefon", "E-posta", "Not", "Son temas"],
                  filteredCustomers.map((c) => [
                    c.name,
                    c.sector,
                    c.region,
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
            <select value={customerSectorFilter} onChange={(e) => setCustomerSectorFilter(e.target.value)} style={{ fontSize: 13 }}>
              <option value="all">Tüm sektörler</option>
              {SECTORS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <DateRangeFilter
              from={customerFromDate}
              to={customerToDate}
              onFromChange={setCustomerFromDate}
              onToChange={setCustomerToDate}
            />
          </div>

          {filteredCustomers.length === 0 ? (
            <p style={{ fontSize: 14, color: "var(--text-secondary)" }}>
              {customers.length === 0 ? "Henüz müşteri eklenmedi." : "Aramayla eşleşen müşteri yok."}
            </p>
          ) : (
            <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: "0 8px" }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left", padding: "0 12px", fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.3 }}>Müşteri</th>
                  <th style={{ textAlign: "left", padding: "0 12px", fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.3, whiteSpace: "nowrap" }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>İlgi durumu <InfoTip text={LEAD_INFO_TEXT} /></span>
                  </th>
                  <th style={{ textAlign: "left", padding: "0 12px", fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.3, whiteSpace: "nowrap" }}>Son temas</th>
                  <th style={{ textAlign: "left", padding: "0 12px", fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.3, whiteSpace: "nowrap" }}>Portal</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filteredCustomers.map((c) => (
                  <tr key={c.id} style={{ background: "var(--surface-1)" }}>
                    <td onClick={() => setViewingCustomer(c)} style={{ padding: "10px 12px", borderRadius: "var(--radius) 0 0 var(--radius)", cursor: "pointer" }}>
                      <p style={{ margin: 0, fontWeight: 500, fontSize: 14 }}>{c.name}</p>
                      <p style={{ margin: 0, fontSize: 12, color: "var(--text-secondary)" }}>
                        {c.sector} {c.region ? `· ${c.region}` : ""} {c.phone ? `· ${c.phone}` : ""}
                      </p>
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
                      {c.portalUserId ? <Badge tone="accent">Var</Badge> : <span style={{ fontSize: 12, color: "var(--text-muted)" }}>—</span>}
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
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === "firsat" && (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12, gap: 8, flexWrap: "wrap" }}>
            <div style={{ display: "flex", gap: 4, background: "var(--surface-1)", borderRadius: "var(--radius)", padding: 3 }}>
              <button
                onClick={() => setDealView("list")}
                style={{ border: "none", background: dealView === "list" ? "var(--surface-2)" : "transparent", display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}
              >
                <i className="ti ti-list" style={{ fontSize: 15 }} aria-hidden="true"></i>
                Liste
              </button>
              <button
                onClick={() => setDealView("kanban")}
                style={{ border: "none", background: dealView === "kanban" ? "var(--surface-2)" : "transparent", display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}
              >
                <i className="ti ti-layout-kanban" style={{ fontSize: 15 }} aria-hidden="true"></i>
                Kanban
              </button>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={() =>
                  downloadCsv(
                    "teklifler.csv",
                    ["Müşteri", "Başlık", "Tutar", "Gider", "Aşama", "Hatırlatma notu", "Oluşturulma tarihi"],
                    filteredDeals.map((d) => [
                      customerById(d.customerId)?.name || "",
                      d.title,
                      d.value,
                      d.cost,
                      STAGES.find((s) => s.id === d.stage)?.label || d.stage,
                      d.reminder,
                      d.createdAt ? new Date(d.createdAt).toLocaleDateString("tr-TR") : "",
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
                Teklif ekle
              </button>
            </div>
          </div>

          <div style={{ display: "flex", marginBottom: 12, gap: 8, flexWrap: "wrap" }}>
            <input
              value={dealSearch}
              onChange={(e) => setDealSearch(e.target.value)}
              placeholder="Teklif ara (başlık, müşteri)..."
              style={{ flex: 1, minWidth: 160 }}
            />
            <select value={dealStageFilter} onChange={(e) => setDealStageFilter(e.target.value)} style={{ fontSize: 13 }}>
              <option value="all">Tüm aşamalar</option>
              <option value="acik">Açık teklifler</option>
              {STAGES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
            <select value={dealPaymentFilter} onChange={(e) => setDealPaymentFilter(e.target.value)} style={{ fontSize: 13 }}>
              <option value="all">Tüm ödeme durumları</option>
              <option value="odendi">Ödendi</option>
              <option value="kismi">Kısmi ödeme</option>
              <option value="odenmedi">Ödenmedi</option>
            </select>
            <DateRangeFilter from={dealFromDate} to={dealToDate} onFromChange={setDealFromDate} onToChange={setDealToDate} />
          </div>

          {customers.length === 0 && (
            <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 12 }}>Teklif eklemeden önce bir müşteri oluşturun.</p>
          )}

          {filteredDeals.length === 0 ? (
            <p style={{ fontSize: 14, color: "var(--text-secondary)" }}>
              {deals.length === 0 ? "Henüz teklif eklenmedi." : "Aramayla eşleşen teklif yok."}
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
                            {(() => {
                              const paid = totalPaidForDeal(d.id);
                              if (paid <= 0) return null;
                              const remaining = d.value - paid;
                              return (
                                <div style={{ marginTop: 4 }}>
                                  <Badge tone={remaining <= 0 ? "success" : "warning"}>{remaining <= 0 ? "Ödendi" : "Kısmi ödeme"}</Badge>
                                </div>
                              );
                            })()}
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
            <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: "0 8px" }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left", padding: "0 12px", fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.3 }}>Teklif</th>
                  <th style={{ textAlign: "left", padding: "0 12px", fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.3, whiteSpace: "nowrap" }}>Aşama</th>
                  <th style={{ textAlign: "left", padding: "0 12px", fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.3, whiteSpace: "nowrap" }}>Ödeme</th>
                  <th style={{ textAlign: "right", padding: "0 12px", fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.3, whiteSpace: "nowrap" }}>Tutar</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filteredDeals.map((d) => {
                  const c = customerById(d.customerId);
                  const stageInfo = STAGES.find((s) => s.id === d.stage);
                  const tone = d.stage === "kazanildi" ? "success" : d.stage === "kaybedildi" ? "default" : d.stage === "muzakere" ? "warning" : "accent";
                  const paid = totalPaidForDeal(d.id);
                  const remaining = d.value - paid;
                  return (
                    <tr key={d.id} style={{ background: "var(--surface-1)" }}>
                      <td onClick={() => { setEditingDeal(d); setShowDealForm(true); }} style={{ padding: "10px 12px", borderRadius: "var(--radius) 0 0 var(--radius)", cursor: "pointer" }}>
                        <p style={{ margin: 0, fontWeight: 500, fontSize: 14 }}>
                          {c?.name || "Bilinmeyen müşteri"} — {d.title}
                        </p>
                        <p style={{ margin: 0, fontSize: 12, color: "var(--text-secondary)" }}>
                          {d.reminder ? `Hatırlatma: ${d.reminder}` : "Hatırlatma yok"}
                        </p>
                      </td>
                      <td style={{ padding: "10px 12px", whiteSpace: "nowrap" }}>
                        <Badge tone={tone}>{stageInfo?.label}</Badge>
                      </td>
                      <td style={{ padding: "10px 12px", whiteSpace: "nowrap" }}>
                        {paid > 0 ? <Badge tone={remaining <= 0 ? "success" : "warning"}>{remaining <= 0 ? "Ödendi" : "Kısmi ödeme"}</Badge> : <span style={{ fontSize: 12, color: "var(--text-muted)" }}>—</span>}
                      </td>
                      <td style={{ padding: "10px 12px", whiteSpace: "nowrap", textAlign: "right", fontSize: 13, fontWeight: 500 }}>{formatTL(d.value)}</td>
                      <td style={{ padding: "10px 12px", borderRadius: "0 var(--radius) var(--radius) 0" }}>
                        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
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
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
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
          onBulkImportTickets={bulkImportTickets}
          onBulkImportKbArticles={bulkImportKbArticles}
          initialViewTicketId={initialViewTicketId}
          onConsumeInitialViewTicket={() => setInitialViewTicketId(null)}
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
        <TrashHistoryModal notify={notify} onRestore={restoreBatch} onClose={() => setShowTrashHistory(false)} />
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
          entityLabel="Teklif ve Anlaşmalar"
          fieldDefs={DEAL_IMPORT_FIELDS}
          customers={customers}
          onImport={bulkImportDeals}
          onClose={() => setShowImportDeals(false)}
        />
      )}

      {teklifDeal && (
        <TeklifPrint
          deal={teklifDeal}
          customer={customerById(teklifDeal.customerId)}
          companySettings={companySettings}
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
        <Modal title={editingDeal ? "Teklifi düzenle" : "Yeni teklif"} onClose={() => { setShowDealForm(false); setEditingDeal(null); }}>
          <DealForm customers={customers} initial={editingDeal} onSave={upsertDeal} onCancel={() => { setShowDealForm(false); setEditingDeal(null); }} />
          {editingDeal && (
            <DealPayments
              deal={editingDeal}
              payments={paymentsByDeal[editingDeal.id] || []}
              onAddPayment={addPayment}
              onDeletePayment={deletePayment}
            />
          )}
        </Modal>
      )}

      {showCampaignModal && (
        <CampaignModal customers={customers} replyTo={session.user.email} companyName={companySettings?.companyName} onClose={() => setShowCampaignModal(false)} />
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
          message={`"${confirmDeleteCustomer.name}" silinsin mi? Bu müşteriye ait teklifler ve destek talepleri de birlikte çöp kutusuna taşınır — dilediğiniz zaman Çöp Kutusu'ndan geri yükleyebilirsiniz.`}
          onConfirm={() => { deleteCustomer(confirmDeleteCustomer.id); setConfirmDeleteCustomer(null); }}
          onClose={() => setConfirmDeleteCustomer(null)}
        />
      )}

      {confirmDeleteDeal && (
        <ConfirmDialog
          title="Teklifi sil"
          message="Bu teklif çöp kutusuna taşınacak, dilediğiniz zaman geri yükleyebilirsiniz."
          onConfirm={() => { deleteDeal(confirmDeleteDeal.id); setConfirmDeleteDeal(null); }}
          onClose={() => setConfirmDeleteDeal(null)}
        />
      )}

      {toast && <Toast message={toast.message} tone={toast.tone} onClose={() => setToast(null)} />}
    </div>
  );
}
