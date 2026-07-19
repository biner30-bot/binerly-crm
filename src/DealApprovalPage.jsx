import { useState, useEffect } from "react";
import { supabase } from "./supabase";
import { GoogleAuthButton, AuthDivider } from "./shared";
import { dealWordKind } from "./Sectors";

const APPROVAL_DEAL_WORDS = {
  teklif: { acc: "teklifi", dateLabel: "Teklif tarihi" },
  randevu: { acc: "randevuyu", dateLabel: "Randevu tarihi" },
  uyelik: { acc: "üyeliği", dateLabel: "Üyelik tarihi" },
};

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
  const [note, setNote] = useState("");
  // iyzico dönüşünden sonra URL'e eklenen ?paid=1/0 — sadece bir kerelik sonuç
  // banner'ı için okunur, kalıcı durum her zaman sunucudan gelen deal.paymentStatus'e dayanır.
  const [paidParam] = useState(() => new URLSearchParams(window.location.search).get("paid"));
  const [paying, setPaying] = useState(false);
  const [paymentError, setPaymentError] = useState("");
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
      body: JSON.stringify({ token, note: note.trim() || null }),
    });
    if (res.ok) {
      const data = await res.json().catch(() => ({}));
      setState((s) => ({ ...s, deal: { ...s.deal, approved: true, approvedAt: data.approvedAt || new Date().toISOString() } }));
    }
    setApproving(false);
  };

  const payNow = async () => {
    setPaymentError("");
    setPaying(true);
    const res = await fetch("/api/deal-approval", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ token, action: "checkout-init" }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.paymentPageUrl) {
      window.location.href = data.paymentPageUrl;
      return;
    }
    setPaymentError(data.error || "Ödeme başlatılamadı, lütfen tekrar deneyin.");
    setPaying(false);
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
              Bu {APPROVAL_DEAL_WORDS[dealWordKind(branding?.sector)].acc} görüp onaylayabilmek için, bu firmaya kayıtlı e-posta adresinizle giriş yapmanız gerekiyor.
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
              <p style={{ fontSize: 12, color: "#94a7bb", margin: "0 0 20px" }}>
                {APPROVAL_DEAL_WORDS[dealWordKind(state.deal.sector)].dateLabel}: {formatDate(state.deal.createdAt)}
              </p>
            )}
            {(() => {
              const isPaid = state.deal.paymentStatus === "paid";
              // Onaylı bir teklifin ödemesi sonradan iade/silinebiliyor — yani
              // "onaylandı" ödemenin de tamamlandığı anlamına gelmiyor (özellikle
              // "zorunlu" modda bile). needsPayment bu ikisini kasıtlı olarak
              // ayrı tutuyor, approved durumundan bağımsız.
              const needsPayment = state.deal.paymentMode !== "none" && !isPaid;
              const isOptionalPay = state.deal.paymentMode === "optional";
              // İş zaten tamamlanmışsa (stage=kazanildi — tüm sektörlerde ortak
              // "bitti" durumu) saf onay adımının bir anlamı kalmıyor: müşteri işi
              // zaten yüz yüze/telefonla onaylamış ya da hizmet doğrudan verilmiş
              // demektir. Ödeme hâlâ eksikse o kısım (sadece "Öde", "...ve Onayla"
              // değil) yine de gösterilir — onay değil tahsilat kalan tek şey.
              const isCompleted = state.deal.stage === "kazanildi";
              const showApproveOnly = !isCompleted && state.deal.paymentMode !== "required" && !state.deal.approved;
              const hasPendingAction = isCompleted ? needsPayment : (!state.deal.approved || needsPayment);
              return (
                <>
                  {state.deal.approved && (
                    <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 8, padding: "14px 16px", marginBottom: hasPendingAction ? 12 : 0 }}>
                      <p style={{ color: "#15803d", fontWeight: 600, margin: "0 0 4px" }}>✓ Bu {APPROVAL_DEAL_WORDS[dealWordKind(state.deal.sector)].acc} onayladınız</p>
                      {isPaid && <p style={{ color: "#15803d", fontWeight: 600, margin: "0 0 4px" }}>✓ Ödeme alındı</p>}
                      {state.deal.approvedAt && (
                        <p style={{ fontSize: 12, color: "#5b7088", margin: 0 }}>{formatDateTime(state.deal.approvedAt)} tarihinde kaydedildi</p>
                      )}
                    </div>
                  )}
                  {!state.deal.approved && isPaid && (
                    <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 8, padding: "10px 14px", marginBottom: 12, fontSize: 13, color: "#15803d", fontWeight: 600 }}>
                      ✓ Ödemeniz alındı
                    </div>
                  )}
                  {state.deal.approved && !hasPendingAction && (
                    <p style={{ fontSize: 12, color: "#94a7bb", margin: "0 0 12px" }}>
                      {state.deal.companyName} en kısa sürede sizinle iletişime geçecek.
                    </p>
                  )}
                  {paidParam === "0" && (
                    <p style={{ fontSize: 12.5, color: "#b45309", margin: "0 0 12px" }}>Ödeme tamamlanamadı, lütfen tekrar deneyin.</p>
                  )}
                  {paymentError && (
                    <p style={{ fontSize: 12.5, color: "#b91c1c", margin: "0 0 12px" }}>{paymentError}</p>
                  )}
                  {state.deal.paymentMode === "required" && needsPayment && (
                    <button
                      onClick={payNow}
                      disabled={paying}
                      style={{ width: "100%", background: "#185fa5", color: "#fff", border: "none", borderRadius: 8, padding: "12px", fontWeight: 700, fontSize: 15, cursor: "pointer" }}
                    >
                      {paying ? "Yönlendiriliyor…" : (isCompleted || state.deal.approved) ? "Öde" : "Onayla ve Öde"}
                    </button>
                  )}
                  {showApproveOnly && (
                    <>
                      <textarea
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        placeholder="Not eklemek ister misiniz? (opsiyonel)"
                        rows={2}
                        style={{ width: "100%", boxSizing: "border-box", padding: "9px 10px", border: "1px solid #e1e8f0", borderRadius: 8, fontSize: 13, fontFamily: "inherit", resize: "vertical", marginBottom: 10 }}
                      />
                      <button
                        onClick={approve}
                        disabled={approving}
                        style={{ width: "100%", background: "#185fa5", color: "#fff", border: "none", borderRadius: 8, padding: "12px", fontWeight: 700, fontSize: 15, cursor: "pointer" }}
                      >
                        {approving ? "Onaylanıyor…" : "Onaylıyorum"}
                      </button>
                    </>
                  )}
                  {isOptionalPay && !isPaid && (
                    <button
                      onClick={payNow}
                      disabled={paying}
                      style={{ width: "100%", background: "#fff", color: "#185fa5", border: "1px solid #185fa5", borderRadius: 8, padding: "12px", fontWeight: 700, fontSize: 15, cursor: "pointer", marginTop: 8 }}
                    >
                      {paying ? "Yönlendiriliyor…" : (isCompleted || state.deal.approved) ? "💳 Şimdi öde" : "💳 Onayla ve Öde"}
                    </button>
                  )}
                  {hasPendingAction && (
                    <p style={{ fontSize: 11.5, color: "#94a7bb", margin: "12px 0 0", lineHeight: 1.5, display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
                      <i className="ti ti-lock" style={{ fontSize: 13 }} aria-hidden="true"></i>
                      Kimliğiniz doğrulandı, onayınız zaman damgasıyla kaydedilir.
                    </p>
                  )}
                </>
              );
            })()}
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
