import React, { useState } from "react";
import { Badge, Modal, MetricCard, ConfirmDialog, IconButton, InfoTip, formatTL, PANO_RANGES, getRangeBounds, inRange } from "./shared";

const RECURRING_INFO_TEXT =
  "Bu tekrarlayan bir gider — tek bir kayıt girdiniz, burada gördüğünüz her ay/yıl/gün otomatik oluşturulan bir kopyadır, " +
  "ayrı ayrı kaydedilmiş değildir. Herhangi birini silmek, geçmiş ve gelecekteki TÜM tekrarları kaldırır.";

const TOTAL_EXPENSE_INFO_TEXT =
  "Elle eklediğiniz şirket giderlerinin yanı sıra, kazanılan tekliflerdeki \"Gider\" tutarlarını da içerir. " +
  "Aşağıdaki \"Kategoriye göre gider\" listesi sadece elle eklenenleri gösterdiği için bu toplamla tam eşleşmeyebilir.";

export function rowToCompanyExpense(r) {
  return {
    id: r.id,
    title: r.title,
    category: r.category || "Diğer",
    amount: r.amount,
    expenseDate: r.expense_date,
    isRecurring: r.is_recurring || false,
    recurrenceInterval: r.recurrence_interval || "monthly",
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
function expandExpenseOccurrences(expense, bounds) {
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

function CompanyExpenseForm({ onSave, onCancel }) {
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState(EXPENSE_CATEGORIES[0]);
  const [customCategory, setCustomCategory] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [time, setTime] = useState("");
  const [note, setNote] = useState("");
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurrenceInterval, setRecurrenceInterval] = useState("monthly");
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    const n = Number(amount);
    if (!title.trim() || !n || n <= 0) return;
    if (category === "Diğer" && !customCategory.trim()) return;
    setSaving(true);
    await onSave({
      title: title.trim(),
      category: category === "Diğer" ? customCategory.trim() : category,
      amount: n,
      expenseDate: (time ? new Date(`${date}T${time}`) : new Date(date)).toISOString(),
      note: note.trim(),
      isRecurring,
      recurrenceInterval,
    });
    setSaving(false);
  };

  return (
    <Modal title="Gider ekle" onClose={onCancel}>
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

export default function Finance({ deals, payments, companyExpenses, customers, onAddExpense, onDeleteExpense }) {
  const [financeRange, setFinanceRange] = useState("bu_ay");
  const [showExpenseForm, setShowExpenseForm] = useState(false);
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

  return (
    <div>
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

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px,1fr))", gap: 12, marginBottom: 20 }}>
        <MetricCard label="Toplam Gelir" value={formatTL(totalIncome)} tone="success" />
        <MetricCard
          label={<span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>Toplam Gider <InfoTip text={TOTAL_EXPENSE_INFO_TEXT} /></span>}
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
                      <IconButton icon="ti-trash" title="Sil" size="sm" onClick={() => setConfirmDelete(item)} />
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
            <InfoTip text="Sadece elle eklenen şirket giderlerini gösterir, kazanılan tekliflerdeki gider tutarlarını içermez — bu yüzden yukarıdaki Toplam Gider'le tam eşleşmeyebilir." />
          </p>
          {Object.keys(categoryTotals).length === 0 ? (
            <p style={{ fontSize: 13, color: "var(--text-muted)" }}>Bu aralıkta şirket gideri yok.</p>
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

      {showExpenseForm && (
        <CompanyExpenseForm
          onSave={async (expense) => { await onAddExpense(expense); setShowExpenseForm(false); }}
          onCancel={() => setShowExpenseForm(false)}
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
