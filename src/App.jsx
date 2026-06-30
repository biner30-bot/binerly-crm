import React, { useState, useEffect } from "react";
import { supabase } from "./supabase";

const STAGES = [
  { id: "ilk_gorusme", label: "İlk görüşme" },
  { id: "teklif", label: "Teklif verildi" },
  { id: "muzakere", label: "Müzakere" },
  { id: "kazanildi", label: "Kazanıldı" },
  { id: "kaybedildi", label: "Kaybedildi" },
];

const SECTORS = ["İnşaat", "Medikal", "Gıda", "Tekstil", "Elektrik", "Diğer"];

function uid() {
  return crypto.randomUUID();
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

function rowToCustomer(r) {
  return {
    id: r.id,
    name: r.name,
    sector: r.sector,
    phone: r.phone || "",
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
    createdAt: r.created_at,
  };
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
    <div style={{ background: "var(--surface-1)", borderRadius: "var(--radius)", padding: "1rem" }}>
      <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: "0 0 4px" }}>{label}</p>
      <p style={{ fontSize: 24, fontWeight: 500, margin: 0, color: tone ? `var(--text-${tone})` : "var(--text-primary)" }}>
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
        <label style={{ fontSize: 13, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Firma adı</label>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Akın İnşaat" style={{ width: "100%" }} />
      </div>
      <div style={{ marginBottom: 12 }}>
        <label style={{ fontSize: 13, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Sektör</label>
        <select value={sector} onChange={(e) => setSector(e.target.value)} style={{ width: "100%" }}>
          {SECTORS.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>
      <div style={{ marginBottom: 12 }}>
        <label style={{ fontSize: 13, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Telefon</label>
        <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0532 000 00 00" style={{ width: "100%" }} />
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
      <div style={{ marginBottom: 16 }}>
        <label style={{ fontSize: 13, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Hatırlatma notu</label>
        <input value={reminder} onChange={(e) => setReminder(e.target.value)} placeholder="Yarın takip araması yap" style={{ width: "100%" }} />
      </div>
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button type="button" onClick={onCancel}>Vazgeç</button>
        <button type="submit" disabled={customers.length === 0} style={{ background: "var(--fill-accent)", color: "var(--on-accent)", border: "none" }}>Kaydet</button>
      </div>
    </form>
  );
}

function LoginForm() {
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
    <div style={{ maxWidth: 380, margin: "4rem auto", padding: "0 1rem" }}>
      <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/tabler-icons/2.47.0/iconfont/tabler-icons.min.css" />
      <h1 style={{ fontSize: 20, fontWeight: 600, margin: "0 0 4px" }}>Binerly</h1>
      <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: "0 0 1.5rem" }}>KOBİ satış takip sistemi</p>
      <div style={{ background: "var(--surface-1)", borderRadius: 12, padding: "1.5rem" }}>
        <h2 style={{ fontSize: 16, margin: "0 0 1rem" }}>{mode === "login" ? "Giriş yap" : "Kayıt ol"}</h2>
        <form onSubmit={submit}>
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 13, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>E-posta</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required style={{ width: "100%" }} />
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 13, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Şifre</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required style={{ width: "100%" }} />
          </div>
          {message && (
            <p style={{ fontSize: 13, color: "var(--text-warning)", marginBottom: 12 }}>{message}</p>
          )}
          <button type="submit" disabled={loading} style={{ width: "100%", background: "var(--fill-accent)", color: "var(--on-accent)", border: "none" }}>
            {loading ? "Yükleniyor…" : mode === "login" ? "Giriş yap" : "Kayıt ol"}
          </button>
        </form>
        <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "12px 0" }}>
          <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
          <span style={{ fontSize: 12, color: "var(--text-muted)" }}>veya</span>
          <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
        </div>
        <button
          type="button"
          onClick={() => supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: "https://binerly.com" } })}
          style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, background: "var(--surface-2)", border: "0.5px solid var(--border)", borderRadius: "var(--radius)", padding: "10px 16px", cursor: "pointer", fontSize: 14, color: "var(--text-primary)" }}
        >
          <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
            <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z" fill="#4285F4"/>
            <path d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z" fill="#34A853"/>
            <path d="M3.964 10.707c-.18-.54-.282-1.117-.282-1.707s.102-1.167.282-1.707V4.961H.957C.347 6.175 0 7.548 0 9s.348 2.825.957 4.039l3.007-2.332z" fill="#FBBC05"/>
            <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.961L3.964 7.293C4.672 5.166 6.656 3.58 9 3.58z" fill="#EA4335"/>
          </svg>
          Google ile devam et
        </button>
        <p style={{ fontSize: 13, textAlign: "center", marginTop: 12, color: "var(--text-secondary)" }}>
          {mode === "login" ? "Hesabın yok mu? " : "Hesabın var mı? "}
          <button
            onClick={() => { setMode(mode === "login" ? "register" : "login"); setMessage(""); }}
            style={{ background: "none", border: "none", color: "var(--text-accent)", padding: 0, cursor: "pointer", fontSize: 13 }}
          >
            {mode === "login" ? "Kayıt ol" : "Giriş yap"}
          </button>
        </p>
      </div>
    </div>
  );
}

export default function App() {
  const [session, setSession] = useState(undefined);
  const [tab, setTab] = useState("pano");
  const [customers, setCustomers] = useState([]);
  const [deals, setDeals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCustomerForm, setShowCustomerForm] = useState(false);
  const [showDealForm, setShowDealForm] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState(null);
  const [editingDeal, setEditingDeal] = useState(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, s) => setSession(s));
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) { setCustomers([]); setDeals([]); setLoading(false); return; }
    setLoading(true);
    Promise.all([
      supabase.from("customers").select("*").order("created_at"),
      supabase.from("deals").select("*").order("created_at"),
    ]).then(([{ data: c }, { data: d }]) => {
      setCustomers((c || []).map(rowToCustomer));
      setDeals((d || []).map(rowToDeal));
      setLoading(false);
    });
  }, [session]);

  const upsertCustomer = async (c) => {
    const row = {
      id: c.id,
      user_id: session.user.id,
      name: c.name,
      sector: c.sector,
      phone: c.phone,
      notes: c.notes,
      last_contact: c.lastContact,
      created_at: c.createdAt,
    };
    const { data, error } = await supabase.from("customers").upsert(row).select().single();
    if (!error) {
      const customer = rowToCustomer(data);
      setCustomers((prev) =>
        prev.some((x) => x.id === customer.id) ? prev.map((x) => (x.id === customer.id ? customer : x)) : [...prev, customer]
      );
    }
    setShowCustomerForm(false);
    setEditingCustomer(null);
  };

  const deleteCustomer = async (id) => {
    await supabase.from("customers").delete().eq("id", id);
    setCustomers((prev) => prev.filter((c) => c.id !== id));
    setDeals((prev) => prev.filter((d) => d.customerId !== id));
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
      created_at: d.createdAt,
    };
    const { data, error } = await supabase.from("deals").upsert(row).select().single();
    if (!error) {
      const deal = rowToDeal(data);
      setDeals((prev) =>
        prev.some((x) => x.id === deal.id) ? prev.map((x) => (x.id === deal.id ? deal : x)) : [...prev, deal]
      );
    }
    setShowDealForm(false);
    setEditingDeal(null);
  };

  const deleteDeal = async (id) => {
    await supabase.from("deals").delete().eq("id", id);
    setDeals((prev) => prev.filter((d) => d.id !== id));
  };

  const touchCustomer = async (id) => {
    const now = new Date().toISOString();
    await supabase.from("customers").update({ last_contact: now }).eq("id", id);
    setCustomers((prev) => prev.map((c) => (c.id === id ? { ...c, lastContact: now } : c)));
  };

  if (session === undefined) return <div style={{ padding: "2rem", textAlign: "center", color: "var(--text-secondary)" }}>Yükleniyor…</div>;
  if (!session) return <LoginForm />;

  if (loading) return <div style={{ padding: "2rem 0", textAlign: "center", color: "var(--text-secondary)" }}>Yükleniyor…</div>;

  const openDeals = deals.filter((d) => d.stage !== "kazanildi" && d.stage !== "kaybedildi");
  const wonDeals = deals.filter((d) => d.stage === "kazanildi");
  const totalOpenValue = openDeals.reduce((sum, d) => sum + (d.value || 0), 0);
  const dealsWithReminder = deals.filter((d) => d.reminder && d.stage !== "kazanildi" && d.stage !== "kaybedildi");
  const customerById = (id) => customers.find((c) => c.id === id);

  return (
    <div>
      <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/tabler-icons/2.47.0/iconfont/tabler-icons.min.css" />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1.5rem" }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 600, margin: "0 0 4px" }}>Binerly</h1>
          <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: 0 }}>KOBİ satış takip sistemi</p>
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
        </div>
      )}

      {tab === "musteri" && (
        <div>
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
            <button
              onClick={() => { setEditingCustomer(null); setShowCustomerForm(true); }}
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
                  style={{ background: "var(--surface-1)", borderRadius: "var(--radius)", padding: "0.75rem 1rem", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}
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
                  <button onClick={() => { setEditingCustomer(c); setShowCustomerForm(true); }} style={{ width: 32, height: 32, padding: 0 }}>
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
                    <button onClick={() => { setEditingDeal(d); setShowDealForm(true); }} style={{ width: 32, height: 32, padding: 0 }}>
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
        <Modal title={editingCustomer ? "Müşteriyi düzenle" : "Yeni müşteri"} onClose={() => { setShowCustomerForm(false); setEditingCustomer(null); }}>
          <CustomerForm initial={editingCustomer} onSave={upsertCustomer} onCancel={() => { setShowCustomerForm(false); setEditingCustomer(null); }} />
        </Modal>
      )}

      {showDealForm && (
        <Modal title={editingDeal ? "Fırsatı düzenle" : "Yeni fırsat"} onClose={() => { setShowDealForm(false); setEditingDeal(null); }}>
          <DealForm customers={customers} initial={editingDeal} onSave={upsertDeal} onCancel={() => { setShowDealForm(false); setEditingDeal(null); }} />
        </Modal>
      )}
    </div>
  );
}
