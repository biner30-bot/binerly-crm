import React, { useState } from "react";
import { Badge, Modal, MetricCard, ConfirmDialog, IconButton, InfoTip, formatTL, PANO_RANGES, getRangeBounds, inRange } from "./shared";
import { stageLabel, dealWordKind } from "./Sectors";

const FINANCE_DEAL_WORDS = {
  teklif: { bare: "Teklif", locativePlural: "tekliflerdeki", genPlural: "tekliflerin", noWonEmpty: "Henüz kazanılmış bir teklifiniz yok." },
  randevu: { bare: "Randevu", locativePlural: "randevulardaki", genPlural: "randevuların", noWonEmpty: "Henüz tamamlanmış bir randevunuz yok." },
  uyelik: { bare: "Üyelik", locativePlural: "üyeliklerdeki", genPlural: "üyeliklerin", noWonEmpty: "Henüz kazanılmış bir üyeliğiniz yok." },
};

const RECURRING_INFO_TEXT =
  "Bu tekrarlayan bir gider — tek bir kayıt girdiniz, burada gördüğünüz her ay/yıl/gün otomatik oluşturulan bir kopyadır, " +
  "ayrı ayrı kaydedilmiş değildir. Herhangi birini silmek, geçmiş ve gelecekteki TÜM tekrarları kaldırır.";

const totalExpenseInfoText = (sector) => {
  const noun = FINANCE_DEAL_WORDS[dealWordKind(sector)].locativePlural;
  return (
    `Elle eklediğiniz işletme giderlerinin yanı sıra, kazanılan ${noun} "Gider" tutarlarını da içerir. ` +
    "Aşağıdaki \"Kategoriye göre gider\" listesi sadece elle eklenenleri gösterdiği için bu toplamla tam eşleşmeyebilir."
  );
};

const kdvReportInfoText = (sector) => {
  const noun = FINANCE_DEAL_WORDS[dealWordKind(sector)].genPlural;
  return (
    `Satış KDV'si, seçilen aydaki "${stageLabel("kazanildi", "kurumsal", sector)}" ${noun} KDV tutarlarından; Alış KDV'si, o ay içindeki ve KDV oranı ` +
    "girilmiş giderlerden hesaplanır. Bu, resmi bir beyanname veya e-defter değildir — sadece kendi ön hazırlığınız içindir, " +
    "muhasebecinizin/SMMM'nizin yerine geçmez."
  );
};

export function rowToCompanyExpense(r) {
  return {
    id: r.id,
    title: r.title,
    category: r.category || "Diğer",
    amount: r.amount,
    expenseDate: r.expense_date,
    isRecurring: r.is_recurring || false,
    recurrenceInterval: r.recurrence_interval || "monthly",
    kdvRate: r.kdv_rate ?? null,
    note: r.note || "",
    createdAt: r.created_at,
    deletedAt: r.deleted_at || null,
  };
}

// Tekrarlayan bir gideri (örn. aylık kira veya yıllık sözleşme), kendi tarihinden
// bugüne kadar her ay/yıl için tek bir sanal kayda (occurrence) genişletir — yeni
// bir DB satırı oluşturmadan. Gerçek satır sadece kendi döneminde (isProjected:
// false), diğer dönemlerde sanal olarak (isProjected: true) görünür; silme her
// zaman gerçek satırı hedefler.
export function expandExpenseOccurrences(expense, bounds) {
  if (!expense.isRecurring) {
    return inRange(expense.expenseDate, bounds) ? [{ ...expense, occurrenceDate: expense.expenseDate, isProjected: false }] : [];
  }
  const original = new Date(expense.expenseDate);
  const day = original.getDate();
  const hh = original.getHours();
  const mm = original.getMinutes();
  const now = new Date();
  const occurrences = [];

  if (expense.recurrenceInterval === "yearly") {
    const month = original.getMonth();
    for (let year = original.getFullYear(); year <= now.getFullYear(); year++) {
      const daysInMonth = new Date(year, month + 1, 0).getDate();
      const occDate = new Date(year, month, Math.min(day, daysInMonth), hh, mm);
      if (inRange(occDate.toISOString(), bounds)) {
        occurrences.push({ ...expense, occurrenceDate: occDate.toISOString(), isProjected: year !== original.getFullYear() });
      }
    }
    return occurrences;
  }

  if (expense.recurrenceInterval === "daily") {
    // Uzun bir "tüm zamanlar" aralığında gereksiz yere binlerce eski günü
    // dolaşmamak için, aralığın başlangıcından önceki günleri atlıyoruz.
    const startFrom = bounds.start && bounds.start > original ? bounds.start : original;
    let cursor = new Date(startFrom.getFullYear(), startFrom.getMonth(), startFrom.getDate(), hh, mm);
    const endCursorDaily = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hh, mm);
    while (cursor <= endCursorDaily) {
      if (inRange(cursor.toISOString(), bounds)) {
        const isOriginalDay =
          cursor.getFullYear() === original.getFullYear() && cursor.getMonth() === original.getMonth() && cursor.getDate() === original.getDate();
        occurrences.push({ ...expense, occurrenceDate: cursor.toISOString(), isProjected: !isOriginalDay });
      }
      cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + 1, hh, mm);
    }
    return occurrences;
  }

  const endCursor = new Date(now.getFullYear(), now.getMonth(), 1);
  let cursor = new Date(original.getFullYear(), original.getMonth(), 1);
  while (cursor <= endCursor) {
    const daysInMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
    const occDate = new Date(cursor.getFullYear(), cursor.getMonth(), Math.min(day, daysInMonth), hh, mm);
    if (inRange(occDate.toISOString(), bounds)) {
      const isOriginalMonth = cursor.getFullYear() === original.getFullYear() && cursor.getMonth() === original.getMonth();
      occurrences.push({ ...expense, occurrenceDate: occDate.toISOString(), isProjected: !isOriginalMonth });
    }
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
  }
  return occurrences;
}

const EXPENSE_CATEGORIES = ["Kira", "Maaş", "Fatura / Abonelik", "Ofis / Sarf Malzemesi", "Pazarlama", "Vergi / SGK", "Ulaşım", "Diğer"];

function paymentDateLabel(dateStr) {
  return new Date(dateStr).toLocaleDateString("tr-TR", { day: "numeric", month: "short", year: "numeric" });
}

function expenseDateTimeLabel(dateStr) {
  const d = new Date(dateStr);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const dateLabel = paymentDateLabel(dateStr);
  return hh === "00" && mm === "00" ? dateLabel : `${dateLabel} · ${hh}:${mm}`;
}

function monthBounds(yyyyMm) {
  const [y, m] = yyyyMm.split("-").map(Number);
  return { start: new Date(y, m - 1, 1), end: new Date(y, m, 0, 23, 59, 59, 999) };
}

function kdvAmountOf(grossAmount, rate) {
  const net = rate > 0 ? grossAmount / (1 + rate / 100) : grossAmount;
  return grossAmount - net;
}

function CompanyExpenseForm({ initial, onSave, onCancel }) {
  const initialIsCustomCategory = initial?.category && !EXPENSE_CATEGORIES.includes(initial.category);
  const [title, setTitle] = useState(initial?.title || "");
  const [category, setCategory] = useState(initialIsCustomCategory ? "Diğer" : (initial?.category || EXPENSE_CATEGORIES[0]));
  const [customCategory, setCustomCategory] = useState(initialIsCustomCategory ? initial.category : "");
  const [amount, setAmount] = useState(initial?.amount ?? "");
  const [date, setDate] = useState(initial?.expenseDate ? initial.expenseDate.slice(0, 10) : new Date().toISOString().slice(0, 10));
  const [time, setTime] = useState(() => {
    if (!initial?.expenseDate) return "";
    const d = new Date(initial.expenseDate);
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    return hh === "00" && mm === "00" ? "" : `${hh}:${mm}`;
  });
  const [note, setNote] = useState(initial?.note || "");
  const [isRecurring, setIsRecurring] = useState(initial?.isRecurring || false);
  const [recurrenceInterval, setRecurrenceInterval] = useState(initial?.recurrenceInterval || "monthly");
  const [kdvRate, setKdvRate] = useState(initial?.kdvRate ?? "");
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    const n = Number(amount);
    if (!title.trim() || !n || n <= 0) return;
    if (category === "Diğer" && !customCategory.trim()) return;
    setSaving(true);
    await onSave({
      id: initial?.id,
      title: title.trim(),
      category: category === "Diğer" ? customCategory.trim() : category,
      amount: n,
      // "T00:00" ekliyoruz çünkü saatsiz "YYYY-MM-DD" string'i JS'de UTC gece yarısı
      // sayılıyor — Türkiye saatinde bu gece 03:00 gibi görünür. "T00:00" ekleyince
      // yerel saat olarak yorumlanıyor, gerçekten gece yarısı oluyor.
      expenseDate: new Date(`${date}T${time || "00:00"}`).toISOString(),
      note: note.trim(),
      isRecurring,
      recurrenceInterval,
      kdvRate: kdvRate === "" ? null : Number(kdvRate),
    });
    setSaving(false);
  };

  return (
    <Modal title={initial ? "Gideri düzenle" : "Gider ekle"} onClose={onCancel}>
      <form onSubmit={submit}>
        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 13, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Başlık</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ofis kirası" style={{ width: "100%" }} />
        </div>
        <div style={{ display: "flex", gap: 12, marginBottom: 12 }}>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 13, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Kategori</label>
            <select value={category} onChange={(e) => setCategory(e.target.value)} style={{ width: "100%" }}>
              {EXPENSE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 13, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Tutar (TL)</label>
            <input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" style={{ width: "100%" }} />
          </div>
        </div>
        {category === "Diğer" && (
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 13, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Kategori adı</label>
            <input value={customCategory} onChange={(e) => setCustomCategory(e.target.value)} placeholder="Kategorinizi yazın" style={{ width: "100%" }} />
          </div>
        )}
        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 13, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>
            KDV oranı <span style={{ fontWeight: 400, color: "var(--text-muted)" }}>(opsiyonel)</span>
          </label>
          <select value={kdvRate} onChange={(e) => setKdvRate(e.target.value)} style={{ width: "100%" }}>
            <option value="">KDV bilgisi yok</option>
            <option value={20}>%20</option>
            <option value={10}>%10</option>
            <option value={1}>%1</option>
            <option value={0}>%0</option>
          </select>
          <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "6px 0 0" }}>
            Girerseniz bu gider, KDV Özet Raporu'ndaki "Alış KDV'si" hesabına dahil edilir.
          </p>
        </div>
        <div style={{ display: "flex", gap: 12, marginBottom: 12 }}>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 13, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Tarih</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ width: "100%" }} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 13, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>
              Saat <span style={{ fontWeight: 400, color: "var(--text-muted)" }}>(opsiyonel)</span>
            </label>
            <input type="time" value={time} onChange={(e) => setTime(e.target.value)} style={{ width: "100%" }} />
          </div>
        </div>
        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 13, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Not (opsiyonel)</label>
          <input value={note} onChange={(e) => setNote(e.target.value)} style={{ width: "100%" }} />
        </div>
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--text-secondary)", cursor: "pointer" }}>
            <input type="checkbox" checked={isRecurring} onChange={(e) => setIsRecurring(e.target.checked)} />
            Düzenli tekrarlanan bir gider (örn. kira, sabit fatura)
          </label>
          {isRecurring ? (
            <div style={{ margin: "8px 0 0 26px", maxWidth: 200 }}>
              <select value={recurrenceInterval} onChange={(e) => setRecurrenceInterval(e.target.value)} style={{ width: "100%" }}>
                <option value="daily">Her gün tekrarla</option>
                <option value="monthly">Her ay tekrarla</option>
                <option value="yearly">Her yıl tekrarla</option>
              </select>
              <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "6px 0 0" }}>
                Bu gideri her seferinde tekrar eklemenize gerek kalmaz, aynı tutar seçtiğiniz sıklıkta otomatik sayılır.
              </p>
            </div>
          ) : (
            <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "4px 0 0 26px" }}>
              Örn. yıllık kira sözleşmeniz varsa işaretleyip "Her yıl tekrarla" seçebilirsiniz.
            </p>
          )}
        </div>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button type="button" onClick={onCancel}>Vazgeç</button>
          <button
            type="submit"
            disabled={saving || !title.trim() || !amount || (category === "Diğer" && !customCategory.trim())}
            style={{ background: "var(--fill-accent)", color: "var(--on-accent)", border: "none" }}
          >
            Kaydet
          </button>
        </div>
      </form>
    </Modal>
  );
}

export default function Finance({ deals, payments, companyExpenses, customers, onAddExpense, onUpdateExpense, onDeleteExpense, onOpenPayments, sector }) {
  const [financeView, setFinanceView] = useState("tahsilat");
  const [financeRange, setFinanceRange] = useState("bu_ay");
  const [kdvMonth, setKdvMonth] = useState(new Date().toISOString().slice(0, 7));
  const [expandedCustomerId, setExpandedCustomerId] = useState(null);
  const [newPaymentCustomerId, setNewPaymentCustomerId] = useState("");
  const [newPaymentDealId, setNewPaymentDealId] = useState("");
  const [showExpenseForm, setShowExpenseForm] = useState(false);
  const [editingExpense, setEditingExpense] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);

  const customerById = (id) => customers.find((c) => c.id === id);
  const dealById = (id) => deals.find((d) => d.id === id);
  const bounds = getRangeBounds(financeRange);

  const rangePayments = payments.filter((p) => inRange(p.paidAt, bounds));
  const rangeExpenses = companyExpenses.flatMap((e) => expandExpenseOccurrences(e, bounds));
  const wonDealsWithCost = deals.filter(
    (d) => d.stage === "kazanildi" && (d.cost || 0) > 0 && inRange(d.closedAt || d.createdAt, bounds)
  );

  const totalIncome = rangePayments.reduce((sum, p) => sum + (p.amount || 0), 0);
  const totalCompanyExpense = rangeExpenses.reduce((sum, e) => sum + (e.amount || 0), 0);
  const totalDealCost = wonDealsWithCost.reduce((sum, d) => sum + (d.cost || 0), 0);
  const totalExpense = totalCompanyExpense + totalDealCost;
  const netRemaining = totalIncome - totalExpense;

  const categoryTotals = {};
  rangeExpenses.forEach((e) => {
    categoryTotals[e.category] = (categoryTotals[e.category] || 0) + (e.amount || 0);
  });

  const ledger = [
    ...rangePayments.map((p) => {
      const deal = dealById(p.dealId);
      const customer = customerById(deal?.customerId);
      return {
        id: `payment-${p.id}`,
        type: "gelir",
        date: p.paidAt,
        hasTime: false,
        label: `${customer?.name || "Bilinmeyen müşteri"} — ${deal?.title || "Tahsilat"}`,
        amount: p.amount,
      };
    }),
    ...rangeExpenses.map((e) => ({
      id: `expense-${e.id}-${e.occurrenceDate}`,
      type: "gider",
      date: e.occurrenceDate,
      hasTime: true,
      label: `${e.title} · ${e.category}`,
      isRecurring: e.isRecurring,
      recurrenceInterval: e.recurrenceInterval,
      amount: e.amount,
      expenseId: e.id,
    })),
    ...wonDealsWithCost.map((d) => ({
      id: `dealcost-${d.id}`,
      type: "gider",
      date: d.closedAt || d.createdAt,
      hasTime: false,
      label: `${customerById(d.customerId)?.name || "Bilinmeyen müşteri"} — ${d.title} maliyeti`,
      amount: d.cost,
    })),
  ].sort((a, b) => new Date(b.date) - new Date(a.date));

  const kdvBounds = monthBounds(kdvMonth);
  const kdvWonDeals = deals.filter((d) => d.stage === "kazanildi" && inRange(d.closedAt || d.createdAt, kdvBounds));
  const satisKdv = kdvWonDeals.reduce((sum, d) => sum + kdvAmountOf(d.value || 0, d.kdvRate ?? 20), 0);
  const kdvExpenseOccurrences = companyExpenses.flatMap((e) => expandExpenseOccurrences(e, kdvBounds));
  const expensesWithKdv = kdvExpenseOccurrences.filter((e) => e.kdvRate != null);
  const expensesWithoutKdvCount = kdvExpenseOccurrences.length - expensesWithKdv.length;
  const alisKdv = expensesWithKdv.reduce((sum, e) => sum + kdvAmountOf(e.amount || 0, e.kdvRate), 0);
  const odenecekKdv = satisKdv - alisKdv;

  const customerBalances = customers
    .map((customer) => {
      const wonDeals = deals
        .filter((d) => d.customerId === customer.id && d.stage === "kazanildi")
        .map((d) => ({ ...d, remaining: (d.value || 0) - payments.filter((p) => p.dealId === d.id).reduce((sum, p) => sum + (p.amount || 0), 0) }));
      const totalDebt = wonDeals.reduce((sum, d) => sum + (d.value || 0), 0);
      const balance = wonDeals.reduce((sum, d) => sum + d.remaining, 0);
      return { customer, wonDeals, totalDebt, totalCollected: totalDebt - balance, balance };
    })
    .filter((cb) => cb.wonDeals.length > 0)
    .sort((a, b) => b.balance - a.balance);

  const newPaymentCustomer = customerById(newPaymentCustomerId);
  const newPaymentDealOptions = newPaymentCustomer
    ? deals.filter((d) => d.customerId === newPaymentCustomer.id && d.stage === "kazanildi")
    : [];

  return (
    <div>
      <div style={{ display: "flex", gap: 4, background: "var(--surface-1)", borderRadius: "var(--radius)", padding: 3, marginBottom: 12, width: "fit-content" }}>
        <button
          onClick={() => setFinanceView("tahsilat")}
          style={{ border: "none", background: financeView === "tahsilat" ? "var(--surface-2)" : "transparent", fontSize: 13 }}
        >
          Tahsilat / Cari Hesap
        </button>
        <button
          onClick={() => setFinanceView("defter")}
          style={{ border: "none", background: financeView === "defter" ? "var(--surface-2)" : "transparent", fontSize: 13 }}
        >
          Gelir-Gider Defteri
        </button>
        <button
          onClick={() => setFinanceView("kdv")}
          style={{ border: "none", background: financeView === "kdv" ? "var(--surface-2)" : "transparent", fontSize: 13 }}
        >
          KDV Özet Raporu
        </button>
      </div>

      {financeView === "defter" && (
      <div style={{ display: "flex", gap: 4, background: "var(--surface-1)", borderRadius: "var(--radius)", padding: 3, marginBottom: 16, width: "fit-content" }}>
        {PANO_RANGES.map((r) => (
          <button
            key={r.id}
            onClick={() => setFinanceRange(r.id)}
            style={{ border: "none", background: financeRange === r.id ? "var(--surface-2)" : "transparent", fontSize: 13 }}
          >
            {r.label}
          </button>
        ))}
      </div>
      )}
      {financeView === "kdv" && (
        <div style={{ marginBottom: 16 }}>
          <input type="month" value={kdvMonth} onChange={(e) => setKdvMonth(e.target.value)} style={{ width: 180 }} />
        </div>
      )}

      {financeView === "tahsilat" ? (
        <div>
          <div style={{ background: "var(--surface-1)", borderRadius: "var(--radius)", padding: "1rem", marginBottom: 16 }}>
            <p style={{ fontSize: 14, fontWeight: 500, margin: "0 0 12px" }}>Yeni Tahsilat</p>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
              <div style={{ flex: 1, minWidth: 160 }}>
                <label style={{ fontSize: 12, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Müşteri</label>
                <select
                  value={newPaymentCustomerId}
                  onChange={(e) => { setNewPaymentCustomerId(e.target.value); setNewPaymentDealId(""); }}
                  style={{ width: "100%" }}
                >
                  <option value="">Müşteri seçin</option>
                  {customers
                    .filter((c) => deals.some((d) => d.customerId === c.id && d.stage === "kazanildi"))
                    .map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div style={{ flex: 1, minWidth: 160 }}>
                <label style={{ fontSize: 12, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>{FINANCE_DEAL_WORDS[dealWordKind(sector)].bare}</label>
                <select
                  value={newPaymentDealId}
                  onChange={(e) => setNewPaymentDealId(e.target.value)}
                  disabled={!newPaymentCustomerId}
                  style={{ width: "100%" }}
                >
                  <option value="">Seçin</option>
                  {newPaymentDealOptions.map((d) => <option key={d.id} value={d.id}>{d.title}</option>)}
                </select>
              </div>
              <button
                disabled={!newPaymentDealId}
                onClick={() => {
                  const deal = deals.find((d) => d.id === newPaymentDealId);
                  if (deal) onOpenPayments(deal);
                  setNewPaymentCustomerId(""); setNewPaymentDealId("");
                }}
                style={{ background: "var(--fill-accent)", color: "var(--on-accent)", border: "none" }}
              >
                Devam
              </button>
            </div>
          </div>

          {customerBalances.length === 0 ? (
            <p style={{ fontSize: 13, color: "var(--text-muted)" }}>{FINANCE_DEAL_WORDS[dealWordKind(sector)].noWonEmpty}</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {customerBalances.map((cb) => (
                <div key={cb.customer.id} style={{ border: "0.5px solid var(--border)", borderRadius: "var(--radius)" }}>
                  <div
                    onClick={() => setExpandedCustomerId(expandedCustomerId === cb.customer.id ? null : cb.customer.id)}
                    style={{ padding: "0.75rem 1rem", display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }}
                  >
                    <span style={{ fontSize: 13, fontWeight: 500 }}>{cb.customer.name}</span>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <span style={{ fontSize: 12, color: "var(--text-muted)" }}>Borç {formatTL(cb.totalDebt)} · Tahsilat {formatTL(cb.totalCollected)}</span>
                      <Badge tone={cb.balance > 0 ? "warning" : "success"}>{formatTL(cb.balance)}</Badge>
                      <i className={`ti ${expandedCustomerId === cb.customer.id ? "ti-chevron-up" : "ti-chevron-down"}`} style={{ fontSize: 15, color: "var(--text-muted)" }} aria-hidden="true"></i>
                    </div>
                  </div>
                  {expandedCustomerId === cb.customer.id && (
                    <div style={{ padding: "0 1rem 0.75rem", display: "flex", flexDirection: "column", gap: 6 }}>
                      {cb.wonDeals.map((d) => (
                        <div key={d.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 13, padding: "6px 0", borderTop: "0.5px solid var(--border)" }}>
                          <span>{d.title}</span>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <span style={{ color: "var(--text-secondary)" }}>{d.remaining > 0 ? `Kalan ${formatTL(d.remaining)}` : "Ödendi"}</span>
                            <button onClick={() => onOpenPayments(d)} style={{ fontSize: 12 }}>Tahsilat ekle</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      ) : financeView === "kdv" ? (
        <div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px,1fr))", gap: 12, marginBottom: 12 }}>
            <MetricCard label="Satış KDV'si" value={formatTL(satisKdv)} tone="success" />
            <MetricCard label="Alış KDV'si" value={formatTL(alisKdv)} tone="danger" />
            <MetricCard
              label={<span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>Ödenecek/Devreden KDV <InfoTip text={kdvReportInfoText(sector)} /></span>}
              value={formatTL(odenecekKdv)}
              tone={odenecekKdv >= 0 ? "danger" : "success"}
            />
          </div>
          {expensesWithoutKdvCount > 0 && (
            <p style={{ fontSize: 12.5, color: "var(--text-warning)", margin: 0 }}>
              {expensesWithoutKdvCount} gider KDV bilgisi olmadığı için Alış KDV'sine dahil edilmedi.
            </p>
          )}
        </div>
      ) : (
      <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px,1fr))", gap: 12, marginBottom: 20 }}>
        <MetricCard label="Toplam Gelir" value={formatTL(totalIncome)} tone="success" />
        <MetricCard
          label={<span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>Toplam Gider <InfoTip text={totalExpenseInfoText(sector)} /></span>}
          value={formatTL(totalExpense)}
          tone="danger"
        />
        <MetricCard label="Net Kalan" value={formatTL(netRemaining)} tone={netRemaining >= 0 ? "success" : "danger"} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 16, alignItems: "start", flexWrap: "wrap" }}>
        <div style={{ background: "var(--surface-1)", borderRadius: "var(--radius)", padding: "1rem", minWidth: 280 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
            <p style={{ fontSize: 14, fontWeight: 500, margin: 0 }}>Gelir-Gider Defteri</p>
            <button
              onClick={() => setShowExpenseForm(true)}
              style={{ background: "var(--fill-accent)", color: "var(--on-accent)", border: "none", display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}
            >
              <i className="ti ti-plus" style={{ fontSize: 16 }} aria-hidden="true"></i>
              Gider ekle
            </button>
          </div>
          {ledger.length === 0 ? (
            <p style={{ fontSize: 13, color: "var(--text-muted)" }}>Bu aralıkta hiç kayıt yok.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 420, overflowY: "auto" }}>
              {ledger.map((item) => (
                <div
                  key={item.id}
                  style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 13, padding: "6px 0", borderBottom: "0.5px solid var(--border)" }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <Badge tone={item.type === "gelir" ? "success" : "danger"}>{item.type === "gelir" ? "Gelir" : "Gider"}</Badge>
                    <div>
                      <p style={{ margin: 0, display: "flex", alignItems: "center", gap: 5 }}>
                        {item.label}
                        {item.isRecurring && (
                          <i
                            className="ti ti-repeat"
                            title={
                              item.recurrenceInterval === "yearly"
                                ? "Her yıl tekrarlanan gider"
                                : item.recurrenceInterval === "daily"
                                ? "Her gün tekrarlanan gider"
                                : "Her ay tekrarlanan gider"
                            }
                            style={{ fontSize: 13, color: "var(--text-muted)" }}
                            aria-hidden="true"
                          ></i>
                        )}
                        {item.isRecurring && <InfoTip text={RECURRING_INFO_TEXT} />}
                      </p>
                      <p style={{ margin: 0, fontSize: 11, color: "var(--text-muted)" }}>
                        {item.hasTime ? expenseDateTimeLabel(item.date) : paymentDateLabel(item.date)}
                      </p>
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontWeight: 500, color: item.type === "gelir" ? "var(--text-success)" : "var(--text-danger)" }}>
                      {item.type === "gelir" ? "+" : "-"}{formatTL(item.amount)}
                    </span>
                    {item.expenseId && (
                      <>
                        <IconButton
                          icon="ti-edit"
                          title="Düzenle"
                          size="sm"
                          onClick={() => setEditingExpense(companyExpenses.find((e) => e.id === item.expenseId))}
                        />
                        <IconButton icon="ti-trash" title="Sil" size="sm" onClick={() => setConfirmDelete(item)} />
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ background: "var(--surface-1)", borderRadius: "var(--radius)", padding: "1rem", minWidth: 200 }}>
          <p style={{ fontSize: 14, fontWeight: 500, margin: "0 0 12px", display: "flex", alignItems: "center", gap: 4 }}>
            Kategoriye göre gider
            <InfoTip text={`Sadece elle eklenen işletme giderlerini gösterir, kazanılan ${FINANCE_DEAL_WORDS[dealWordKind(sector)].locativePlural} gider tutarlarını içermez — bu yüzden yukarıdaki Toplam Gider'le tam eşleşmeyebilir.`} />
          </p>
          {Object.keys(categoryTotals).length === 0 ? (
            <p style={{ fontSize: 13, color: "var(--text-muted)" }}>Bu aralıkta işletme gideri yok.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {Object.entries(categoryTotals).sort((a, b) => b[1] - a[1]).map(([category, total]) => (
                <div key={category} style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                  <span>{category}</span>
                  <span style={{ fontWeight: 500 }}>{formatTL(total)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      </div>
      )}

      {showExpenseForm && (
        <CompanyExpenseForm
          onSave={async (expense) => { await onAddExpense(expense); setShowExpenseForm(false); }}
          onCancel={() => setShowExpenseForm(false)}
        />
      )}

      {editingExpense && (
        <CompanyExpenseForm
          initial={editingExpense}
          onSave={async (expense) => { await onUpdateExpense(expense); setEditingExpense(null); }}
          onCancel={() => setEditingExpense(null)}
        />
      )}

      {confirmDelete && (
        <ConfirmDialog
          title="Gideri sil"
          message={
            confirmDelete.isRecurring
              ? "Bu tekrarlayan bir gider — silerseniz geçmiş ve gelecekteki TÜM tekrarları çöp kutusuna taşınır, sadece bu ay/yıl değil. Dilediğiniz zaman geri yükleyebilirsiniz."
              : "Bu gider çöp kutusuna taşınacak, dilediğiniz zaman geri yükleyebilirsiniz."
          }
          onConfirm={() => { onDeleteExpense(confirmDelete.expenseId); setConfirmDelete(null); }}
          onClose={() => setConfirmDelete(null)}
        />
      )}
    </div>
  );
}
