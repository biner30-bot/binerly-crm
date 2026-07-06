import React, { useState } from "react";
import { Badge, Modal, MetricCard, ConfirmDialog, formatTL, PANO_RANGES, getRangeBounds, inRange } from "./shared";

export function rowToCompanyExpense(r) {
  return {
    id: r.id,
    title: r.title,
    category: r.category || "Diğer",
    amount: r.amount,
    expenseDate: r.expense_date,
    note: r.note || "",
    createdAt: r.created_at,
    deletedAt: r.deleted_at || null,
  };
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
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [time, setTime] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    const n = Number(amount);
    if (!title.trim() || !n || n <= 0) return;
    setSaving(true);
    await onSave({
      title: title.trim(),
      category,
      amount: n,
      expenseDate: (time ? new Date(`${date}T${time}`) : new Date(date)).toISOString(),
      note: note.trim(),
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
        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 13, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Not (opsiyonel)</label>
          <input value={note} onChange={(e) => setNote(e.target.value)} style={{ width: "100%" }} />
        </div>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button type="button" onClick={onCancel}>Vazgeç</button>
          <button type="submit" disabled={saving || !title.trim() || !amount} style={{ background: "var(--fill-accent)", color: "var(--on-accent)", border: "none" }}>
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
  const rangeExpenses = companyExpenses.filter((e) => inRange(e.expenseDate, bounds));
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
      id: `expense-${e.id}`,
      type: "gider",
      date: e.expenseDate,
      hasTime: true,
      label: `${e.title} · ${e.category}`,
      amount: e.amount,
      expenseId: e.id,
    })),
    ...wonDealsWithCost.map((d) => ({
      id: `dealcost-${d.id}`,
      type: "gider",
      date: d.closedAt || d.createdAt,
      hasTime: false,
      label: `${d.title} maliyeti`,
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
        <MetricCard label="Toplam Gider" value={formatTL(totalExpense)} tone="danger" />
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
                      <p style={{ margin: 0 }}>{item.label}</p>
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
                      <button onClick={() => setConfirmDelete(item.expenseId)} style={{ width: 26, height: 26, padding: 0 }} title="Sil">
                        <i className="ti ti-trash" style={{ fontSize: 13 }} aria-hidden="true"></i>
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ background: "var(--surface-1)", borderRadius: "var(--radius)", padding: "1rem", minWidth: 200 }}>
          <p style={{ fontSize: 14, fontWeight: 500, margin: "0 0 12px" }}>Kategoriye göre gider</p>
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
          message="Bu gider çöp kutusuna taşınacak, dilediğiniz zaman geri yükleyebilirsiniz."
          onConfirm={() => { onDeleteExpense(confirmDelete); setConfirmDelete(null); }}
          onClose={() => setConfirmDelete(null)}
        />
      )}
    </div>
  );
}
