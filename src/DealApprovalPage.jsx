import { useState, useEffect } from "react";
import { supabase } from "./supabase";
import { GoogleAuthButton, AuthDivider } from "./shared";

function formatTL(n) {
  return new Intl.NumberFormat("tr-TR").format(Math.round(n || 0)) + " TL";
}

function formatDate(dateStr) {
  if (!dateStr) return "";
  return new Date(dateStr).toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" });
}

function formatDateTime(dateStr) {
  if (!dateStr) return "";
  return new Date(dateStr).toLocaleDateString("tr-TR", { day: "numeric", month: "short", year: "numeric" }) +
    " · " + new Date(dateStr).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
}

// Bu teklifin sahibi olan müşteriye bağlar — customers.email ile giriş yapılan
// e-posta eşleşiyorsa ve henüz kimse bağlanmamışsa portal_user_id set edilir.
// CustomerPortal.jsx'teki aynı otomatik eşleştirme mantığı.
async function linkPortalAccount(session) {
  await supabase
    .from("customer_portal_users")
    .upsert({ id: session.user.id, email: session.user.email }, { onConflict: "id", ignoreDuplicates: true });
  await supabase
    .from("customers")
    .update({ portal_user_id: session.user.id })
    .is("portal_user_id", null)
    .is("deleted_at", null)
    .ilike("email", session.user.email);
}

// Kamuya açık sayfa — /onay/{token}. Sadece api/deal-approval.js tarafından
// döndürülen minimal bilgiyi gösterir; onay için müşteri portalına giriş
// yapmış olmak gerekir (token tek başına yeterli değil).
export default function DealApprovalPage() {
  const token = window.location.pathname.split("/")[2] || "";
  const [session, setSession] = useState(undefined);
  const [state, setState] = useState({ loading: true, error: "", requiresAuth: false, deal: null, branding: null });
  const [approving, setApproving] = useState(false);
  const [authMode, setAuthMode] = useState("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authMessage, setAuthMessage] = useState("");
  const [authLoading, setAuthLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!token || session === undefined) return;
    (async () => {
      setState((s) => ({ ...s, loading: true }));
      if (session) await linkPortalAccount(session);
      const headers = session ? { Authorization: `Bearer ${session.access_token}` } : {};
      const res = await fetch(`/api/deal-approval?token=${encodeURIComponent(token)}`, { headers }).catch(() => null);
      if (!res) { setState({ loading: false, error: "Yüklenemedi.", requiresAuth: false, deal: null, branding: null }); return; }
      const data = await res.json().catch(() => ({}));
      if (res.status === 401 && data.requiresAuth) {
        setState({ loading: false, error: "", requiresAuth: true, deal: null, branding: { companyName: data.companyName, logoUrl: data.logoUrl } });
        return;
      }
      if (!res.ok) { setState({ loading: false, error: data.error || "Bulunamadı.", requiresAuth: false, deal: null, branding: null }); return; }
      setState({ loading: false, error: "", requiresAuth: false, deal: data, branding: null });
    })();
  }, [token, session]);

  const submitAuth = async (e) => {
    e.preventDefault();
    setAuthMessage("");
    setAuthLoading(true);
    if (authMode === "login") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setAuthMessage(error.message);
    } else {
      const { error } = await supabase.auth.signUp({ email, password, options: { data: { full_name: name.trim() }, emailRedirectTo: window.location.href } });
      if (error) setAuthMessage(error.message);
      else setAuthMessage("Kayıt başarılı! E-postanıza gelen doğrulama linkine tıklayıp bu sayfaya geri dönün.");
    }
    setAuthLoading(false);
  };

  const handleGoogleCredential = async (idToken, nonce) => {
    const { error } = await supabase.auth.signInWithIdToken({ provider: "google", token: idToken, nonce });
    if (error) setAuthMessage(error.message);
  };

  const approve = async () => {
    setApproving(true);
    const res = await fetch("/api/deal-approval", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ token }),
    });
    if (res.ok) {
      const data = await res.json().catch(() => ({}));
      setState((s) => ({ ...s, deal: { ...s.deal, approved: true, approvedAt: data.approvedAt || new Date().toISOString() } }));
    }
    setApproving(false);
  };

  const branding = state.branding || state.deal;

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "#f5f8fc", fontFamily: "system-ui, -apple-system, sans-serif", padding: "1rem" }}>
      <div style={{ background: "#fff", borderRadius: 12, padding: "2rem", width: "100%", maxWidth: 420, border: "1px solid #e1e8f0", textAlign: "center", boxShadow: "0 4px 24px rgba(12,37,64,0.06)" }}>
        {state.loading ? (
          <p style={{ color: "#5b7088" }}>Yükleniyor…</p>
        ) : state.error ? (
          <p style={{ color: "#b91c1c" }}>{state.error}</p>
        ) : state.requiresAuth ? (
          <div style={{ textAlign: "left" }}>
            {branding?.logoUrl && <img src={branding.logoUrl} alt="" style={{ maxHeight: 40, marginBottom: 12, display: "block", marginLeft: "auto", marginRight: "auto" }} />}
            <p style={{ fontSize: 13, color: "#94a7bb", margin: "0 0 4px", textAlign: "center" }}>{branding?.companyName}</p>
            <h2 style={{ fontSize: 17, fontWeight: 700, color: "#0c2540", margin: "0 0 4px", textAlign: "center" }}>
              {authMode === "login" ? "Giriş yap" : "Hesap oluştur"}
            </h2>
            <p style={{ fontSize: 12.5, color: "#5b7088", margin: "0 0 18px", textAlign: "center" }}>
              Bu teklifi görüp onaylayabilmek için, bu firmaya kayıtlı e-posta adresinizle giriş yapmanız gerekiyor.
            </p>
            <form onSubmit={submitAuth}>
              {authMode === "register" && (
                <div style={{ marginBottom: 10 }}>
                  <label style={{ fontSize: 12, color: "#5b7088", display: "block", marginBottom: 4 }}>Ad Soyad</label>
                  <input value={name} onChange={(e) => setName(e.target.value)} required style={{ width: "100%", padding: "9px 10px", border: "1px solid #e1e8f0", borderRadius: 8, fontSize: 14, boxSizing: "border-box" }} />
                </div>
              )}
              <div style={{ marginBottom: 10 }}>
                <label style={{ fontSize: 12, color: "#5b7088", display: "block", marginBottom: 4 }}>E-posta</label>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required style={{ width: "100%", padding: "9px 10px", border: "1px solid #e1e8f0", borderRadius: 8, fontSize: 14, boxSizing: "border-box" }} />
              </div>
              <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 12, color: "#5b7088", display: "block", marginBottom: 4 }}>Şifre</label>
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required style={{ width: "100%", padding: "9px 10px", border: "1px solid #e1e8f0", borderRadius: 8, fontSize: 14, boxSizing: "border-box" }} />
              </div>
              {authMessage && <p style={{ fontSize: 12.5, color: "#b45309", marginBottom: 12 }}>{authMessage}</p>}
              <button type="submit" disabled={authLoading} style={{ width: "100%", background: "#185fa5", color: "#fff", border: "none", borderRadius: 8, padding: "11px", fontWeight: 700, fontSize: 15, cursor: "pointer" }}>
                {authLoading ? "Yükleniyor…" : authMode === "login" ? "Giriş yap" : "Kayıt ol"}
              </button>
            </form>
            <AuthDivider />
            <GoogleAuthButton onCredential={handleGoogleCredential} />
            <p style={{ fontSize: 12.5, textAlign: "center", marginTop: 14, color: "#5b7088" }}>
              {authMode === "login" ? "Hesabın yok mu? " : "Hesabın var mı? "}
              <button onClick={() => { setAuthMode(authMode === "login" ? "register" : "login"); setAuthMessage(""); }} style={{ background: "none", border: "none", color: "#185fa5", padding: 0, cursor: "pointer", fontSize: 12.5, fontWeight: 600 }}>
                {authMode === "login" ? "Kayıt ol" : "Giriş yap"}
              </button>
            </p>
          </div>
        ) : (
          <>
            {state.deal.logoUrl && <img src={state.deal.logoUrl} alt="" style={{ maxHeight: 48, marginBottom: 16 }} />}
            <p style={{ fontSize: 13, color: "#94a7bb", margin: "0 0 4px" }}>{state.deal.companyName}</p>
            {state.deal.customerName && (
              <p style={{ fontSize: 14, color: "#5b7088", margin: "0 0 12px" }}>Sayın {state.deal.customerName},</p>
            )}
            <h1 style={{ fontSize: 20, fontWeight: 700, color: "#0c2540", margin: "0 0 8px" }}>{state.deal.title}</h1>
            <p style={{ fontSize: 24, fontWeight: 800, color: "#185fa5", margin: "0 0 4px" }}>{formatTL(state.deal.value)}</p>
            {state.deal.createdAt && (
              <p style={{ fontSize: 12, color: "#94a7bb", margin: "0 0 20px" }}>Teklif tarihi: {formatDate(state.deal.createdAt)}</p>
            )}
            {state.deal.approved ? (
              <div>
                <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 8, padding: "14px 16px" }}>
                  <p style={{ color: "#15803d", fontWeight: 600, margin: "0 0 4px" }}>✓ Bu teklifi onayladınız</p>
                  {state.deal.approvedAt && (
                    <p style={{ fontSize: 12, color: "#5b7088", margin: 0 }}>{formatDateTime(state.deal.approvedAt)} tarihinde kaydedildi</p>
                  )}
                </div>
                <p style={{ fontSize: 12, color: "#94a7bb", margin: "12px 0 0" }}>
                  {state.deal.companyName} en kısa sürede sizinle iletişime geçecek.
                </p>
              </div>
            ) : (
              <>
                <button
                  onClick={approve}
                  disabled={approving}
                  style={{ width: "100%", background: "#185fa5", color: "#fff", border: "none", borderRadius: 8, padding: "12px", fontWeight: 700, fontSize: 15, cursor: "pointer" }}
                >
                  {approving ? "Onaylanıyor…" : "Onaylıyorum"}
                </button>
                <p style={{ fontSize: 11.5, color: "#94a7bb", margin: "12px 0 0", lineHeight: 1.5, display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
                  <i className="ti ti-lock" style={{ fontSize: 13 }} aria-hidden="true"></i>
                  Kimliğiniz doğrulandı, onayınız zaman damgasıyla kaydedilir.
                </p>
              </>
            )}
          </>
        )}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 20, opacity: 0.6 }}>
        <img src="/favicon.svg" alt="" style={{ width: 16, height: 16 }} />
        <span style={{ fontSize: 12, color: "#5b7088" }}>Binerly ile güvenle yönetiliyor</span>
      </div>
    </div>
  );
}
