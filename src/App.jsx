import React, { useState, useEffect, useCallback } from "react";

const STAGES = [
  { id: "ilk_gorusme", label: "İlk görüşme" },
  { id: "teklif", label: "Teklif verildi" },
  { id: "muzakere", label: "Müzakere" },
  { id: "kazanildi", label: "Kazanıldı" },
  { id: "kaybedildi", label: "Kaybedildi" },
];

const SECTORS = ["İnşaat", "Medikal", "Gıda", "Tekstil", "Elektrik", "Diğer"];

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function formatTL(n) {
  return new Intl.NumberFormat("tr-TR").format(Math.round(n || 0)) + " TL";
}

function daysAgo(dateStr) {
  if (!dateStr) return null;
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
  if (diff <= 0) return "Bugün";
  if (diff === 1) return "Dün";
  return `${diff} gün önce`;
}

async function loadData() {
  try {
    const customers = localStorage.getItem("binerly_customers");
    const deals = localStorage.getItem("binerly_deals");
    return {
      customers: customers ? JSON.parse(customers) : [],
      deals: deals ? JSON.parse(deals) : [],
    };
  } catch (e) {
    return { customers: [], deals: [] };
  }
}

async function saveCustomers(customers) {
  try {
    localStorage.setItem("binerly_customers", JSON.stringify(customers));
  } catch (e) {
    console.error("Kaydetme hatası", e);
  }
}

async function saveDeals(deals) {
  try {
    localStorage.setItem("binerly_deals", JSON.stringify(deals));
  } catch (e) {
    console.error("Kaydetme hatası", e);
  }
}

function Badge({ children, tone = "default" }) {
  const tones = {
    default: { background: "var(--surface-1)", color: "var(--text-secondary)" },
    warning: { background: "var(--bg-warning)", color: "var(--text-warning)" },
    success: { background: "var(--bg-success)", color: "var(--text-success)" },
    accent: { background: "var(--bg-accent)", color: "var(--text-accent)" },
  };
  return (
    <span
      style={{
        ...tones[tone],
        fontSize: 12,
        fontWeight: 500,
        padding: "3px 10px",
        borderRadius: "var(--radius)",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}

function MetricCard({ label, value, tone }) {
  return (
    <div
      style={{
        background: "var(--surface-1)",
        borderRadius: "var(--radius)",
        padding: "1rem",
      }}
    >
      <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: "0 0 4px" }}>{label}</p>
      <p
        style={{
          fontSize: 24,
          fontWeight: 500,
          margin: 0,
          color: tone ? `var(--text-${tone})` : "var(--text-primary)",
        }}
      >
        {value}
      </p>
    </div>
  );
}

function Modal({ title, onClose, children }) {
  return (
    <div
      style={{
        minHeight: 400,
        background: "rgba(0,0,0,0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        position: "relative",
        padding: "1rem",
      }}
    >
      <div
        style={{
          background: "var(--surface-2)",
          border: "0.5px solid var(--border)",
          borderRadius: 12,
          padding: "1.5rem",
          width: "100%",
          maxWidth: 420,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h3 style={{ margin: 0 }}>{title}</h3>
          <button onClick={onClose} aria-label="Kapat" style={{ width: 32, height: 32, padding: 0 }}>
            <i className="ti ti-x" aria-hidden="true"></i>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function CustomerForm({ initial, onSave, onCancel }) {
  const [name, setName] = useState(initial?.name || "");
  const [sector, setSector] = useState(initial?.sector || SECTORS[0]);
  const [phone, setPhone] = useState(initial?.phone || "");
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
          notes: notes.trim(),
          lastContact: initial?.lastContact || new Date().toISOString(),
          createdAt: initial?.createdAt || new Date().toISOString(),
        });
      }}
    >
      <div style={{ marginBottom: 12 }}>
        <label style={{ fontSize: 13, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>
          Firma adı
        </label>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Akın İnşaat" style={{ width: "100%" }} />
      </div>
      <div style={{ marginBottom: 12 }}>
        <label style={{ fontSize: 13, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>
          Sektör
        </label>
        <select value={sector} onChange={(e) => setSector(e.target.value)} style={{ width: "100%" }}>
          {SECTORS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>
      <div style={{ marginBottom: 12 }}>
        <label style={{ fontSize: 13, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>
          Telefon
        </label>
        <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0532 000 00 00" style={{ width: "100%" }} />
      </div>
      <div style={{ marginBottom: 16 }}>
        <label style={{ fontSize: 13, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>
          Not
        </label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Örn. yaz aylarında sipariş hacmi artıyor"
          style={{ width: "100%", minHeight: 70, resize: "vertical" }}
        />
      </div>
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button type="button" onClick={onCancel}>
          Vazgeç
        </button>
        <button type="submit" style={{ background: "var(--fill-accent)", color: "var(--on-accent)", border: "none" }}>
          Kaydet
        </button>
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
          createdAt: initial?.createdAt || new Date().toISOString(),
        });
      }}
    >
      <div style={{ marginBottom: 12 }}>
        <label style={{ fontSize: 13, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>
          Müşteri
        </label>
        {customers.length === 0 ? (
          <p style={{ fontSize: 13, color: "var(--text-muted)" }}>Önce bir müşteri ekleyin.</p>
        ) : (
          <select value={customerId} onChange={(e) => setCustomerId(e.target.value)} style={{ width: "100%" }}>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        )}
      </div>
      <div style={{ marginBottom: 12 }}>
        <label style={{ fontSize: 13, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>
          Fırsat / teklif başlığı
        </label>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Yıllık tedarik anlaşması" style={{ width: "100%" }} />
      </div>
      <div style={{ display: "flex", gap: 12, marginBottom: 12 }}>
        <div style={{ flex: 1 }}>
          <label style={{ fontSize: 13, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>
            Tutar (TL)
          </label>
          <input type="number" min="0" value={value} onChange={(e) => setValue(e.target.value)} placeholder="50000" style={{ width: "100%" }} />
        </div>
        <div style={{ flex: 1 }}>
          <label style={{ fontSize: 13, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>
            Aşama
          </label>
          <select value={stage} onChange={(e) => setStage(e.target.value)} style={{ width: "100%" }}>
            {STAGES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div style={{ marginBottom: 16 }}>
        <label style={{ fontSize: 13, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>
          Hatırlatma notu
        </label>
        <input value={reminder} onChange={(e) => setReminder(e.target.value)} placeholder="Yarın takip araması yap" style={{ width: "100%" }} />
      </div>
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button type="button" onClick={onCancel}>
          Vazgeç
        </button>
        <button
          type="submit"
          disabled={customers.length === 0}
          style={{ background: "var(--fill-accent)", color: "var(--on-accent)", border: "none" }}
        >
          Kaydet
        </button>
      </div>
    </form>
  );
}

export default function App() {
  const [tab, setTab] = useState("pano");
  const [customers, setCustomers] = useState([]);
  const [deals, setDeals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCustomerForm, setShowCustomerForm] = useState(false);
  const [showDealForm, setShowDealForm] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState(null);
  const [editingDeal, setEditingDeal] = useState(null);

  useEffect(() => {
    loadData().then(({ customers, deals }) => {
      setCustomers(customers);
      setDeals(deals);
      setLoading(false);
    });
  }, []);

  const persistCustomers = useCallback((next) => {
    setCustomers(next);
    saveCustomers(next);
  }, []);

  const persistDeals = useCallback((next) => {
    setDeals(next);
    saveDeals(next);
  }, []);

  const upsertCustomer = (c) => {
    const exists = customers.some((x) => x.id === c.id);
    const next = exists ? customers.map((x) => (x.id === c.id ? c : x)) : [...customers, c];
    persistCustomers(next);
    setShowCustomerForm(false);
    setEditingCustomer(null);
  };

  const deleteCustomer = (id) => {
    persistCustomers(customers.filter((c) => c.id !== id));
    persistDeals(deals.filter((d) => d.customerId !== id));
  };

  const upsertDeal = (d) => {
    const exists = deals.some((x) => x.id === d.id);
    const next = exists ? deals.map((x) => (x.id === d.id ? d : x)) : [...deals, d];
    persistDeals(next);
    setShowDealForm(false);
    setEditingDeal(null);
  };

  const deleteDeal = (id) => {
    persistDeals(deals.filter((d) => d.id !== id));
  };

  const touchCustomer = (id) => {
    persistCustomers(customers.map((c) => (c.id === id ? { ...c, lastContact: new Date().toISOString() } : c)));
  };

  if (loading) {
    return (
      <div style={{ padding: "2rem 0", textAlign: "center", color: "var(--text-secondary)" }}>Yükleniyor…</div>
    );
  }

  const openDeals = deals.filter((d) => d.stage !== "kazanildi" && d.stage !== "kaybedildi");
  const wonDeals = deals.filter((d) => d.stage === "kazanildi");
  const totalOpenValue = openDeals.reduce((sum, d) => sum + (d.value || 0), 0);
  const dealsWithReminder = deals.filter((d) => d.reminder && d.stage !== "kazanildi" && d.stage !== "kaybedildi");

  const customerById = (id) => customers.find((c) => c.id === id);

  return (
    <div>
      <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/tabler-icons/2.47.0/iconfont/tabler-icons.min.css" />
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
        <svg width="32" height="32" viewBox="0 0 100 100" aria-hidden="true">
          <path d="M18 50 L38 36 L54 41 L66 51" fill="none" stroke="#185FA5" stroke-width="7" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M82 50 L62 36 L46 41 L34 51" fill="none" stroke="#378ADD" stroke-width="7" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="50" cy="43" r="8" fill="#0C447C" />
        </svg>
        <h1 style={{ fontSize: 20, fontWeight: 600, margin: 0, color: "var(--text-accent)" }}>Binerly</h1>
      </div>
      <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: "0 0 1.5rem" }}>KOBİ satış takip sistemi</p>
      <h2 className="sr-only">KOBİ satış takip uygulaması: pano, müşteriler ve fırsatlar sekmeleri</h2>

      <div style={{ display: "flex", gap: 8, marginBottom: "1.5rem" }}>
        {[
          { id: "pano", label: "Pano", icon: "ti-layout-dashboard" },
          { id: "musteri", label: "Müşteriler", icon: "ti-building" },
          { id: "firsat", label: "Fırsatlar", icon: "ti-target-arrow" },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              flex: 1,
              border: tab === t.id ? "1px solid var(--border-strong)" : "0.5px solid var(--border)",
              background: tab === t.id ? "var(--bg-accent)" : "transparent",
              color: tab === t.id ? "var(--text-accent)" : "var(--text-primary)",
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
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(140px,1fr))",
              gap: 12,
              marginBottom: "1.5rem",
            }}
          >
            <MetricCard label="Açık fırsatlar" value={openDeals.length} />
            <MetricCard label="Kazanılan" value={wonDeals.length} tone="success" />
            <MetricCard label="Açık teklif değeri" value={formatTL(totalOpenValue)} />
            <MetricCard label="Hatırlatması olan" value={dealsWithReminder.length} tone="warning" />
          </div>

          {customers.length === 0 && deals.length === 0 ? (
            <div
              style={{
                background: "var(--surface-1)",
                borderRadius: 12,
                padding: "2rem 1.5rem",
                textAlign: "center",
              }}
            >
              <p style={{ fontWeight: 500, margin: "0 0 4px" }}>Henüz veri yok</p>
              <p style={{ fontSize: 14, color: "var(--text-secondary)", margin: "0 0 16px" }}>
                Başlamak için önce bir müşteri ekleyin, sonra ona bir fırsat tanımlayın.
              </p>
              <button
                onClick={() => {
                  setTab("musteri");
                  setShowCustomerForm(true);
                }}
                style={{ background: "var(--fill-accent)", color: "var(--on-accent)", border: "none" }}
              >
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
                      {stageDeals.length === 0 && (
                        <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Boş</div>
                      )}
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
        </div>
      )}

      {tab === "musteri" && (
        <div>
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
            <button
              onClick={() => {
                setEditingCustomer(null);
                setShowCustomerForm(true);
              }}
              style={{ background: "var(--fill-accent)", color: "var(--on-accent)", border: "none", display: "flex", alignItems: "center", gap: 6 }}
            >
              <i className="ti ti-plus" style={{ fontSize: 16 }} aria-hidden="true"></i>
              Müşteri ekle
            </button>
          </div>

          {customers.length === 0 ? (
            <p style={{ fontSize: 14, color: "var(--text-secondary)" }}>Henüz müşteri eklenmedi.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {customers.map((c) => (
                <div
                  key={c.id}
                  style={{
                    background: "var(--surface-1)",
                    borderRadius: "var(--radius)",
                    padding: "0.75rem 1rem",
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    flexWrap: "wrap",
                  }}
                >
                  <div style={{ flex: 1, minWidth: 160 }}>
                    <p style={{ margin: 0, fontWeight: 500, fontSize: 14 }}>{c.name}</p>
                    <p style={{ margin: 0, fontSize: 12, color: "var(--text-secondary)" }}>
                      {c.sector} {c.phone ? `· ${c.phone}` : ""}
                    </p>
                  </div>
                  <Badge tone={daysAgo(c.lastContact) === "Bugün" ? "success" : "default"}>
                    {daysAgo(c.lastContact) || "Temas yok"}
                  </Badge>
                  <button onClick={() => touchCustomer(c.id)} title="Bugün arandı olarak işaretle" style={{ width: 32, height: 32, padding: 0 }}>
                    <i className="ti ti-phone-check" style={{ fontSize: 16 }} aria-hidden="true"></i>
                  </button>
                  <button
                    onClick={() => {
                      setEditingCustomer(c);
                      setShowCustomerForm(true);
                    }}
                    style={{ width: 32, height: 32, padding: 0 }}
                  >
                    <i className="ti ti-edit" style={{ fontSize: 16 }} aria-hidden="true"></i>
                  </button>
                  <button onClick={() => deleteCustomer(c.id)} style={{ width: 32, height: 32, padding: 0 }}>
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
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
            <button
              onClick={() => {
                setEditingDeal(null);
                setShowDealForm(true);
              }}
              disabled={customers.length === 0}
              style={{ background: "var(--fill-accent)", color: "var(--on-accent)", border: "none", display: "flex", alignItems: "center", gap: 6 }}
            >
              <i className="ti ti-plus" style={{ fontSize: 16 }} aria-hidden="true"></i>
              Fırsat ekle
            </button>
          </div>

          {customers.length === 0 && (
            <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 12 }}>
              Fırsat eklemeden önce bir müşteri oluşturun.
            </p>
          )}

          {deals.length === 0 ? (
            <p style={{ fontSize: 14, color: "var(--text-secondary)" }}>Henüz fırsat eklenmedi.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {deals.map((d) => {
                const c = customerById(d.customerId);
                const stageInfo = STAGES.find((s) => s.id === d.stage);
                const tone = d.stage === "kazanildi" ? "success" : d.stage === "kaybedildi" ? "default" : d.stage === "muzakere" ? "warning" : "accent";
                return (
                  <div
                    key={d.id}
                    style={{
                      background: "var(--surface-1)",
                      borderRadius: "var(--radius)",
                      padding: "0.75rem 1rem",
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      flexWrap: "wrap",
                    }}
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
                    <button
                      onClick={() => {
                        setEditingDeal(d);
                        setShowDealForm(true);
                      }}
                      style={{ width: 32, height: 32, padding: 0 }}
                    >
                      <i className="ti ti-edit" style={{ fontSize: 16 }} aria-hidden="true"></i>
                    </button>
                    <button onClick={() => deleteDeal(d.id)} style={{ width: 32, height: 32, padding: 0 }}>
                      <i className="ti ti-trash" style={{ fontSize: 16 }} aria-hidden="true"></i>
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {showCustomerForm && (
        <Modal
          title={editingCustomer ? "Müşteriyi düzenle" : "Yeni müşteri"}
          onClose={() => {
            setShowCustomerForm(false);
            setEditingCustomer(null);
          }}
        >
          <CustomerForm
            initial={editingCustomer}
            onSave={upsertCustomer}
            onCancel={() => {
              setShowCustomerForm(false);
              setEditingCustomer(null);
            }}
          />
        </Modal>
      )}

      {showDealForm && (
        <Modal
          title={editingDeal ? "Fırsatı düzenle" : "Yeni fırsat"}
          onClose={() => {
            setShowDealForm(false);
            setEditingDeal(null);
          }}
        >
          <DealForm
            customers={customers}
            initial={editingDeal}
            onSave={upsertDeal}
            onCancel={() => {
              setShowDealForm(false);
              setEditingDeal(null);
            }}
          />
        </Modal>
      )}
    </div>
  );
}
