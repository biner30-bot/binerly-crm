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

function uid() { return crypto.randomUUID(); }
function formatTL(n) { return new Intl.NumberFormat("tr-TR").format(Math.round(n || 0)) + " TL"; }
function daysAgo(dateStr) {
  if (!dateStr) return null;
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
  if (diff <= 0) return "Bugün";
  if (diff === 1) return "Dün";
  return `${diff} gün önce`;
}
function rowToCustomer(r) {
  return { id: r.id, name: r.name, sector: r.sector, phone: r.phone || "", notes: r.notes || "", lastContact: r.last_contact, createdAt: r.created_at };
}
function rowToDeal(r) {
  return { id: r.id, customerId: r.customer_id, title: r.title, value: r.value, stage: r.stage, reminder: r.reminder || "", createdAt: r.created_at };
}

function Badge({ children, tone = "default" }) {
  const tones = {
    default: { background: "var(--surface-1)", color: "var(--text-secondary)" },
    warning: { background: "var(--bg-warning)", color: "var(--text-warning)" },
    success: { background: "var(--bg-success)", color: "var(--text-success)" },
    accent: { background: "var(--bg-accent)", color: "var(--text-accent)" },
  };
  return <span style={{ ...tones[tone], fontSize: 12, fontWeight: 500, padding: "3px 10px", borderRadius: "var(--radius)", whiteSpace: "nowrap" }}>{children}</span>;
}

function MetricCard({ label, value, tone }) {
  return (
    <div style={{ background: "var(--surface-1)", borderRadius: "var(--radius)", padding: "1rem" }}>
      <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: "0 0 4px" }}>{label}</p>
      <p style={{ fontSize: 24, fontWeight: 500, margin: 0, color: tone ? `var(--text-${tone})` : "var(--text-primary)" }}>{value}</p>
    </div>
  );
}

function Modal({ title, onClose, children }) {
  return (
    <div style={{ minHeight: 400, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", position: "relative", padding: "1rem" }}>
      <div style={{ background: "var(--surface-2)", border: "0.5px solid var(--border)", borderRadius: 12, padding: "1.5rem", width: "100%", maxWidth: 420 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h3 style={{ margin: 0 }}>{title}</h3>
          <button onClick={onClose} style={{ width: 32, height: 32, padding: 0 }}><i className="ti ti-x"></i></button>
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
    <form onSubmit={(e) => { e.preventDefault(); if (!name.trim()) return; onSave({ id: initial?.id || uid(), name: name.trim(), sector, phone: phone.trim(), notes: notes.trim(), lastContact: initial?.lastContact || new Date().toISOString(), createdAt: initial?.createdAt || new Date().toISOString() }); }}>
      <div style={{ marginBottom: 12 }}><label style={{ fontSize: 13, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Firma adı</label><input value={name} onChange={(e) => setName(e.target.value)} placeholder="Akın İnşaat" style={{ width: "100%" }} /></div>
      <div style={{ marginBottom: 12 }}><label style={{ fontSize: 13, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Sektör</label><select value={sector} onChange={(e) => setSector(e.target.value)} style={{ width: "100%" }}>{SECTORS.map((s) => <option key={s} value={s}>{s}</option>)}</select></div>
      <div style={{ marginBottom: 12 }}><label style={{ fontSize: 13, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Telefon</label><input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0532 000 00 00" style={{ width: "100%" }} /></div>
      <div style={{ marginBottom: 16 }}><label style={{ fontSize: 13, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Not</label><textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Örn. yaz aylarında sipariş hacmi artıyor" style={{ width: "100%", minHeight: 70, resize: "vertical" }} /></div>
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}><button type="button" onClick={onCancel}>Vazgeç</button><button type="submit" style={{ background: "var(--fill-accent)", color: "var(--on-accent)", border: "none" }}>Kaydet</button></div>
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
    <form onSubmit={(e) => { e.preventDefault(); if (!customerId || !title.trim()) return; onSave({ id: initial?.id || uid(), customerId, title: title.trim(), value: Number(value) || 0, stage, reminder: reminder.trim(), createdAt: initial?.createdAt || new Date().toISOString() }); }}>
      <div style={{ marginBottom: 12 }}><label style={{ fontSize: 13, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Müşteri</label>{customers.length === 0 ? <p style={{ fontSize: 13, color: "var(--text-muted)" }}>Önce bir müşteri ekleyin.</p> : <select value={customerId} onChange={(e) => setCustomerId(e.target.value)} style={{ width: "100%" }}>{customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>}</div>
      <div style={{ marginBottom: 12 }}><label style={{ fontSize: 13, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Fırsat başlığı</label><input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Yıllık tedarik anlaşması" style={{ width: "100%" }} /></div>
      <div style={{ display: "flex", gap: 12, marginBottom: 12 }}>
        <div style={{ flex: 1 }}><label style={{ fontSize: 13, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Tutar (TL)</label><input type="number" min="0" value={value} onChange={(e) => setValue(e.target.value)} placeholder="50000" style={{ width: "100%" }} /></div>
        <div style={{ flex: 1 }}><label style={{ fontSize: 13, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Aşama</label><select value={stage} onChange={(e) => setStage(e.target.value)} style={{ width: "100%" }}>{STAGES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select></div>
      </div>
      <div style={{ marginBottom: 16 }}><label style={{ fontSize: 13, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Hatırlatma</label><input value={reminder} onChange={(e) => setReminder(e.target.value)} placeholder="Yarın takip araması yap" style={{ width: "100%" }} /></div>
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}><button type="button" onClick={onCancel}>Vazgeç</button><button type="submit" disabled={customers.length === 0} style={{ background: "var(--fill-accent)", color: "var(--on-accent)", border: "none" }}>Kaydet</button></div>
    </form>
  );
}

function LandingPage({ onLogin, onRegister }) {
  return (
    <div style={{ minHeight: "100vh", background: "var(--bg-page, #f8fafc)" }}>
      <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/tabler-icons/2.47.0/iconfont/tabler-icons.min.css" />

      {/* Navbar */}
      <nav style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "1rem 2rem", borderBottom: "0.5px solid var(--border, #e2e8f0)", background: "white" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <svg width="28" height="28" viewBox="0 0 100 100">
            <path d="M18 50 L38 36 L54 41 L66 51" fill="none" stroke="#185FA5" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M82 50 L62 36 L46 41 L34 51" fill="none" stroke="#378ADD" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="50" cy="43" r="8" fill="#0C447C" />
          </svg>
          <span style={{ fontSize: 18, fontWeight: 700, color: "#185FA5" }}>Binerly</span>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onLogin} style={{ background: "none", border: "1px solid #185FA5", color: "#185FA5", padding: "8px 20px", borderRadius: 8, cursor: "pointer", fontWeight: 500 }}>Giriş yap</button>
          <button onClick={onRegister} style={{ background: "#185FA5", border: "none", color: "white", padding: "8px 20px", borderRadius: 8, cursor: "pointer", fontWeight: 500 }}>Ücretsiz Dene</button>
        </div>
      </nav>

      {/* Hero */}
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "5rem 2rem 3rem", textAlign: "center" }}>
        <div style={{ display: "inline-block", background: "#EFF6FF", color: "#185FA5", fontSize: 13, fontWeight: 600, padding: "6px 16px", borderRadius: 20, marginBottom: "1.5rem" }}>
          KOBİ'lere özel satış takip sistemi
        </div>
        <h1 style={{ fontSize: "clamp(2rem, 5vw, 3rem)", fontWeight: 800, color: "#0f172a", margin: "0 0 1.5rem", lineHeight: 1.2 }}>
          Müşterilerinizi ve fırsatlarınızı<br />
          <span style={{ color: "#185FA5" }}>tek yerden yönetin</span>
        </h1>
        <p style={{ fontSize: 18, color: "#64748b", maxWidth: 560, margin: "0 auto 2.5rem", lineHeight: 1.7 }}>
          Excel ve WhatsApp karmaşasına son verin. Binerly ile müşteri takibi, teklif yönetimi ve satış süreçlerinizi kolayca takip edin.
        </p>
        <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
          <button onClick={onRegister} style={{ background: "#185FA5", border: "none", color: "white", padding: "14px 32px", borderRadius: 10, cursor: "pointer", fontWeight: 600, fontSize: 16 }}>
            Ücretsiz Başla →
          </button>
          <button onClick={onLogin} style={{ background: "white", border: "1px solid #e2e8f0", color: "#0f172a", padding: "14px 32px", borderRadius: 10, cursor: "pointer", fontWeight: 600, fontSize: 16 }}>
            Giriş yap
          </button>
        </div>
      </div>

      {/* Özellikler */}
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "3rem 2rem" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 24 }}>
          {[
            { icon: "ti-building", title: "Müşteri Takibi", desc: "Tüm müşterilerinizi, iletişim geçmişinizi ve notlarınızı tek panelden görün." },
            { icon: "ti-target-arrow", title: "Fırsat Yönetimi", desc: "Tekliflerinizi aşama aşama takip edin, hangisinin ne durumda olduğunu anında görün." },
            { icon: "ti-layout-dashboard", title: "Satış Panosu", desc: "Açık fırsatlar, kazanılan anlaşmalar ve teklif değerlerinizi tek bakışta görün." },
            { icon: "ti-bell", title: "Hatırlatmalar", desc: "Takip araması yapmanız gereken müşterileri asla unutmayın." },
          ].map((f) => (
            <div key={f.title} style={{ background: "white", borderRadius: 12, padding: "1.5rem", border: "1px solid #e2e8f0" }}>
              <div style={{ width: 44, height: 44, background: "#EFF6FF", borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 12 }}>
                <i className={`ti ${f.icon}`} style={{ fontSize: 22, color: "#185FA5" }}></i>
              </div>
              <h3 style={{ margin: "0 0 8px", fontSize: 16, color: "#0f172a" }}>{f.title}</h3>
              <p style={{ margin: 0, fontSize: 14, color: "#64748b", lineHeight: 1.6 }}>{f.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* CTA */}
      <div style={{ background: "#185FA5", margin: "2rem", borderRadius: 16, padding: "3rem 2rem", textAlign: "center" }}>
        <h2 style={{ color: "white", fontSize: "1.8rem", fontWeight: 700, margin: "0 0 1rem" }}>Hemen başlayın, ücretsiz</h2>
        <p style={{ color: "#bfdbfe", margin: "0 0 2rem", fontSize: 16 }}>Kredi kartı gerekmez. Dakikalar içinde kurulum.</p>
        <button onClick={onRegister} style={{ background: "white", border: "none", color: "#185FA5", padding: "14px 36px", borderRadius: 10, cursor: "pointer", fontWeight: 700, fontSize: 16 }}>
          Ücretsiz Hesap Oluştur →
        </button>
      </div>

      <div style={{ textAlign: "center", padding: "2rem", color: "#94a3b8", fontSize: 13 }}>
        © 2025 Binerly · KOBİ satış takip sistemi
      </div>
    </div>
  );
}

function AuthModal({ initialMode, onClose }) {
  const [mode, setMode] = useState(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault(); setMessage(""); setLoading(true);
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
      <div style={{ background: "white", borderRadius: 16, padding: "2rem", width: "100%", maxWidth: 400, position: "relative" }}>
        <button onClick={onClose} style={{ position: "absolute", top: 16, right: 16, background: "none", border: "none", cursor: "pointer", fontSize: 20, color: "#64748b" }}>✕</button>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: "1.5rem" }}>
          <svg width="24" height="24" viewBox="0 0 100 100">
            <path d="M18 50 L38 36 L54 41 L66 51" fill="none" stroke="#185FA5" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M82 50 L62 36 L46 41 L34 51" fill="none" stroke="#378ADD" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="50" cy="43" r="8" fill="#0C447C" />
          </svg>
          <span style={{ fontWeight: 700, color: "#185FA5" }}>Binerly</span>
        </div>
        <h2 style={{ margin: "0 0 1.5rem", fontSize: 20, color: "#0f172a" }}>{mode === "login" ? "Giriş yap" : "Hesap oluştur"}</h2>
        <form onSubmit={submit}>
          <div style={{ marginBottom: 12 }}><label style={{ fontSize: 13, color: "#64748b", display: "block", marginBottom: 4 }}>E-posta</label><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required style={{ width: "100%", padding: "10px 12px", border: "1px solid #e2e8f0", borderRadius: 8, fontSize: 14, boxSizing: "border-box" }} /></div>
          <div style={{ marginBottom: 20 }}><label style={{ fontSize: 13, color: "#64748b", display: "block", marginBottom: 4 }}>Şifre</label><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required style={{ width: "100%", padding: "10px 12px", border: "1px solid #e2e8f0", borderRadius: 8, fontSize: 14, boxSizing: "border-box" }} /></div>
          {message && <p style={{ fontSize: 13, color: message.includes("başarılı") ? "#16a34a" : "#dc2626", marginBottom: 12 }}>{message}</p>}
          <button type="submit" disabled={loading} style={{ width: "100%", background: "#185FA5", border: "none", color: "white", padding: "12px", borderRadius: 8, fontWeight: 600, fontSize: 15, cursor: "pointer" }}>
            {loading ? "Yükleniyor…" : mode === "login" ? "Giriş yap" : "Hesap oluştur"}
          </button>
        </form>
        <p style={{ fontSize: 13, textAlign: "center", marginTop: 16, color: "#64748b" }}>
          {mode === "login" ? "Hesabın yok mu? " : "Zaten hesabın var mı? "}
          <button onClick={() => { setMode(mode === "login" ? "register" : "login"); setMessage(""); }} style={{ background: "none", border: "none", color: "#185FA5", cursor: "pointer", fontWeight: 600, fontSize: 13 }}>
            {mode === "login" ? "Kayıt ol" : "Giriş yap"}
          </button>
        </p>
      </div>
    </div>
  );
}

export default function App() {
  const [session, setSession] = useState(undefined);
  const [authModal, setAuthModal] = useState(null);
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
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, s) => {
      setSession(s);
      if (s) setAuthModal(null);
    });
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
    const row = { id: c.id, user_id: session.user.id, name: c.name, sector: c.sector, phone: c.phone, notes: c.notes, last_contact: c.lastContact, created_at: c.createdAt };
    const { data, error } = await supabase.from("customers").upsert(row).select().single();
    if (!error) { const customer = rowToCustomer(data); setCustomers((prev) => prev.some((x) => x.id === customer.id) ? prev.map((x) => x.id === customer.id ? customer : x) : [...prev, customer]); }
    setShowCustomerForm(false); setEditingCustomer(null);
  };

  const deleteCustomer = async (id) => {
    await supabase.from("customers").delete().eq("id", id);
    setCustomers((prev) => prev.filter((c) => c.id !== id));
    setDeals((prev) => prev.filter((d) => d.customerId !== id));
  };

  const upsertDeal = async (d) => {
    const row = { id: d.id, user_id: session.user.id, customer_id: d.customerId, title: d.title, value: d.value, stage: d.stage, reminder: d.reminder, created_at: d.createdAt };
    const { data, error } = await supabase.from("deals").upsert(row).select().single();
    if (!error) { const deal = rowToDeal(data); setDeals((prev) => prev.some((x) => x.id === deal.id) ? prev.map((x) => x.id === deal.id ? deal : x) : [...prev, deal]); }
    setShowDealForm(false); setEditingDeal(null);
  };

  const deleteDeal = async (id) => {
    await supabase.from("deals").delete().eq("id", id);
    setDeals((prev) => prev.filter((d) => d.id !== id));
  };

  const touchCustomer = async (id) => {
    const now = new Date().toISOString();
    await supabase.from("customers").update({ last_contact: now }).eq("id", id);
    setCustomers((prev) => prev.map((c) => c.id === id ? { ...c, lastContact: now } : c));
  };

  if (session === undefined) return <div style={{ padding: "2rem", textAlign: "center" }}>Yükleniyor…</div>;

  if (!session) return (
    <>
      <LandingPage onLogin={() => setAuthModal("login")} onRegister={() => setAuthModal("register")} />
      {authModal && <AuthModal initialMode={authModal} onClose={() => setAuthModal(null)} />}
    </>
  );

  if (loading) return <div style={{ padding: "2rem", textAlign: "center" }}>Yükleniyor…</div>;

  const openDeals = deals.filter((d) => d.stage !== "kazanildi" && d.stage !== "kaybedildi");
  const wonDeals = deals.filter((d) => d.stage === "kazanildi");
  const totalOpenValue = openDeals.reduce((sum, d) => sum + (d.value || 0), 0);
  const dealsWithReminder = deals.filter((d) => d.reminder && d.stage !== "kazanildi" && d.stage !== "kaybedildi");
  const customerById = (id) => customers.find((c) => c.id === id);

  return (
    <div>
      <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/tabler-icons/2.47.0/iconfont/tabler-icons.min.css" />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <svg width="28" height="28" viewBox="0 0 100 100">
            <path d="M18 50 L38 36 L54 41 L66 51" fill="none" stroke="#185FA5" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M82 50 L62 36 L46 41 L34 51" fill="none" stroke="#378ADD" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="50" cy="43" r="8" fill="#0C447C" />
          </svg>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, color: "#185FA5" }}>Binerly</div>
            <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>KOBİ satış takip sistemi</div>
          </div>
        </div>
        <button onClick={() => supabase.auth.signOut()} style={{ fontSize: 13, color: "var(--text-secondary)", background: "none", border: "0.5px solid var(--border)", borderRadius: 8, padding: "6px 14px", cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
          <i className="ti ti-logout" style={{ fontSize: 14 }}></i> Çıkış
        </button>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: "1.5rem" }}>
        {[{ id: "pano", label: "Pano", icon: "ti-layout-dashboard" }, { id: "musteri", label: "Müşteriler", icon: "ti-building" }, { id: "firsat", label: "Fırsatlar", icon: "ti-target-arrow" }].map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{ flex: 1, border: tab === t.id ? "1px solid var(--border-strong)" : "0.5px solid var(--border)", background: tab === t.id ? "var(--bg-accent)" : "transparent", color: tab === t.id ? "var(--text-accent)" : "var(--text-primary)", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
            <i className={`ti ${t.icon}`} style={{ fontSize: 16 }}></i>{t.label}
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
              <p style={{ fontSize: 14, color: "var(--text-secondary)", margin: "0 0 16px" }}>Başlamak için önce bir müşteri ekleyin.</p>
              <button onClick={() => { setTab("musteri"); setShowCustomerForm(true); }} style={{ background: "var(--fill-accent)", color: "var(--on-accent)", border: "none" }}>Müşteri ekle</button>
            </div>
          ) : (
            <div>
              <p style={{ fontSize: 14, fontWeight: 500, margin: "0 0 8px" }}>Fırsat aşamaları</p>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px,1fr))", gap: 8 }}>
                {STAGES.filter((s) => s.id !== "kaybedildi").map((stage) => {
                  const stageDeals = deals.filter((d) => d.stage === stage.id);
                  return (
                    <div key={stage.id}>
                      <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 6 }}>{stage.label} · {stageDeals.length}</div>
                      {stageDeals.length === 0 && <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Boş</div>}
                      {stageDeals.map((d) => {
                        const c = customerById(d.customerId);
                        const tone = stage.id === "kazanildi" ? "success" : stage.id === "muzakere" ? "warning" : "default";
                        return <div key={d.id} style={{ background: tone === "default" ? "var(--surface-1)" : `var(--bg-${tone})`, border: tone === "default" ? "0.5px solid var(--border)" : "none", borderRadius: "var(--radius)", padding: 8, marginBottom: 6, fontSize: 13 }}>{c?.name || "?"}<br /><span style={{ fontSize: 12, opacity: 0.85 }}>{formatTL(d.value)}</span></div>;
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
            <button onClick={() => { setEditingCustomer(null); setShowCustomerForm(true); }} style={{ background: "var(--fill-accent)", color: "var(--on-accent)", border: "none", display: "flex", alignItems: "center", gap: 6 }}>
              <i className="ti ti-plus" style={{ fontSize: 16 }}></i>Müşteri ekle
            </button>
          </div>
          {customers.length === 0 ? <p style={{ fontSize: 14, color: "var(--text-secondary)" }}>Henüz müşteri eklenmedi.</p> : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {customers.map((c) => (
                <div key={c.id} style={{ background: "var(--surface-1)", borderRadius: "var(--radius)", padding: "0.75rem 1rem", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                  <div style={{ flex: 1, minWidth: 160 }}>
                    <p style={{ margin: 0, fontWeight: 500, fontSize: 14 }}>{c.name}</p>
                    <p style={{ margin: 0, fontSize: 12, color: "var(--text-secondary)" }}>{c.sector} {c.phone ? `· ${c.phone}` : ""}</p>
                  </div>
                  <Badge tone={daysAgo(c.lastContact) === "Bugün" ? "success" : "default"}>{daysAgo(c.lastContact) || "Temas yok"}</Badge>
                  <button onClick={() => touchCustomer(c.id)} style={{ width: 32, height: 32, padding: 0 }}><i className="ti ti-phone-check" style={{ fontSize: 16 }}></i></button>
                  <button onClick={() => { setEditingCustomer(c); setShowCustomerForm(true); }} style={{ width: 32, height: 32, padding: 0 }}><i className="ti ti-edit" style={{ fontSize: 16 }}></i></button>
                  <button onClick={() => deleteCustomer(c.id)} style={{ width: 32, height: 32, padding: 0 }}><i className="ti ti-trash" style={{ fontSize: 16 }}></i></button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === "firsat" && (
        <div>
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
            <button onClick={() => { setEditingDeal(null); setShowDealForm(true); }} disabled={customers.length === 0} style={{ background: "var(--fill-accent)", color: "var(--on-accent)", border: "none", display: "flex", alignItems: "center", gap: 6 }}>
              <i className="ti ti-plus" style={{ fontSize: 16 }}></i>Fırsat ekle
            </button>
          </div>
          {customers.length === 0 && <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 12 }}>Önce müşteri ekleyin.</p>}
          {deals.length === 0 ? <p style={{ fontSize: 14, color: "var(--text-secondary)" }}>Henüz fırsat eklenmedi.</p> : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {deals.map((d) => {
                const c = customerById(d.customerId);
                const stageInfo = STAGES.find((s) => s.id === d.stage);
                const tone = d.stage === "kazanildi" ? "success" : d.stage === "kaybedildi" ? "default" : d.stage === "muzakere" ? "warning" : "accent";
                return (
                  <div key={d.id} style={{ background: "var(--surface-1)", borderRadius: "var(--radius)", padding: "0.75rem 1rem", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                    <div style={{ flex: 1, minWidth: 180 }}>
                      <p style={{ margin: 0, fontWeight: 500, fontSize: 14 }}>{c?.name || "?"} — {d.title}</p>
                      <p style={{ margin: 0, fontSize: 12, color: "var(--text-secondary)" }}>{d.reminder ? `Hatırlatma: ${d.reminder}` : "Hatırlatma yok"}</p>
                    </div>
                    <Badge tone={tone}>{stageInfo?.label}</Badge>
                    <span style={{ fontSize: 13, fontWeight: 500, minWidth: 90, textAlign: "right" }}>{formatTL(d.value)}</span>
                    <button onClick={() => { setEditingDeal(d); setShowDealForm(true); }} style={{ width: 32, height: 32, padding: 0 }}><i className="ti ti-edit" style={{ fontSize: 16 }}></i></button>
                    <button onClick={() => deleteDeal(d.id)} style={{ width: 32, height: 32, padding: 0 }}><i className="ti ti-trash" style={{ fontSize: 16 }}></i></button>
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
