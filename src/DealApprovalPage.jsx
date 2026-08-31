import { useState, useEffect, useRef } from "react";
import { supabase } from "./supabase";
import {
  GoogleAuthButton,
  AuthDivider,
  isFullNameValid,
  translateAuthError,
  escapeIlikePattern,
} from "./shared";
import { dealWordKind } from "./Sectors";

const APPROVAL_DEAL_WORDS = {
  teklif: { acc: "teklifi", dateLabel: "Teklif tarihi" },
  randevu: { acc: "randevuyu", dateLabel: "Randevu tarihi" },
  uyelik: { acc: "üyeliği", dateLabel: "Üyelik tarihi" },
  rezervasyon: { acc: "rezervasyonu", dateLabel: "Rezervasyon tarihi" },
};

function formatTL(n) {
  return new Intl.NumberFormat("tr-TR").format(Math.round(n || 0)) + " TL";
}

function formatDate(dateStr) {
  if (!dateStr) return "";
  return new Date(dateStr).toLocaleDateString("tr-TR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function formatDateTime(dateStr) {
  if (!dateStr) return "";
  return (
    new Date(dateStr).toLocaleDateString("tr-TR", {
      day: "numeric",
      month: "short",
      year: "numeric",
    }) +
    " · " +
    new Date(dateStr).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })
  );
}

// Bu teklifin sahibi olan müşteriye bağlar — customers.email ile giriş yapılan
// e-posta eşleşiyorsa ve henüz kimse bağlanmamışsa portal_user_id set edilir.
// CustomerPortal.jsx'teki aynı otomatik eşleştirme mantığı.
async function linkPortalAccount(session) {
  await supabase
    .from("customer_portal_users")
    .upsert(
      { id: session.user.id, email: session.user.email },
      { onConflict: "id", ignoreDuplicates: true },
    );
  await supabase
    .from("customers")
    .update({ portal_user_id: session.user.id })
    .is("portal_user_id", null)
    .is("deleted_at", null)
    .ilike("email", escapeIlikePattern(session.user.email));
}

// Kamuya açık sayfa — /onay/{token}. Sadece api/deal-approval.js tarafından
// döndürülen minimal bilgiyi gösterir; onay için müşteri portalına giriş
// yapmış olmak gerekir (token tek başına yeterli değil).
export default function DealApprovalPage() {
  const token = window.location.pathname.split("/")[2] || "";
  const [session, setSession] = useState(undefined);
  const [state, setState] = useState({
    loading: true,
    error: "",
    requiresAuth: false,
    deal: null,
    branding: null,
  });
  const [approving, setApproving] = useState(false);
  const [note, setNote] = useState("");
  // iyzico dönüşünden sonra URL'e eklenen ?paid=1/0 — sadece bir kerelik sonuç
  // banner'ı için okunur, kalıcı durum her zaman sunucudan gelen deal.paymentStatus'e dayanır.
  const [paidParam] = useState(() => new URLSearchParams(window.location.search).get("paid"));
  const [paying, setPaying] = useState(false);
  const [paymentError, setPaymentError] = useState("");
  const [approveError, setApproveError] = useState("");
  const [authMode, setAuthMode] = useState("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authMessage, setAuthMessage] = useState("");
  const [authLoading, setAuthLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => subscription.unsubscribe();
  }, []);

  // Basit ısı haritası: sayfada aktif (sekme görünürken) geçirilen süreyi
  // biriktirip sayfadan ayrılırken tek seferlik gönderir. sessionRef kullanılıyor
  // ki bu efekt token değişmedikçe (yani hemen hiç) yeniden kaydolmasın — giriş
  // öncesi biriken süre de giriş sonrası doğru şekilde gönderilebilsin.
  const sessionRef = useRef(session);
  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  useEffect(() => {
    if (!token) return;
    const vt = {
      activeStart: document.visibilityState === "visible" ? Date.now() : null,
      accumulatedMs: 0,
    };

    const flush = () => {
      if (vt.activeStart) {
        vt.accumulatedMs += Date.now() - vt.activeStart;
        vt.activeStart = null;
      }
      const seconds = Math.round(vt.accumulatedMs / 1000);
      vt.accumulatedMs = 0;
      const s = sessionRef.current;
      if (seconds > 0 && s?.access_token) {
        fetch("/api/deal-approval", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${s.access_token}`,
          },
          body: JSON.stringify({ token, action: "track-view", seconds }),
          keepalive: true,
        }).catch(() => {});
      }
    };

    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        if (!vt.activeStart) vt.activeStart = Date.now();
      } else {
        flush();
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("pagehide", flush);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, [token]);

  useEffect(() => {
    if (!token || session === undefined) return;
    (async () => {
      setState((s) => ({ ...s, loading: true }));
      if (session) await linkPortalAccount(session);
      const headers = session ? { Authorization: `Bearer ${session.access_token}` } : {};
      const res = await fetch(`/api/deal-approval?token=${encodeURIComponent(token)}`, {
        headers,
      }).catch(() => null);
      if (!res) {
        setState({
          loading: false,
          error: "Yüklenemedi.",
          requiresAuth: false,
          deal: null,
          branding: null,
        });
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (res.status === 401 && data.requiresAuth) {
        setState({
          loading: false,
          error: "",
          requiresAuth: true,
          deal: null,
          branding: { companyName: data.companyName, logoUrl: data.logoUrl, sector: data.sector },
        });
        return;
      }
      if (!res.ok) {
        setState({
          loading: false,
          error: data.error || "Bulunamadı.",
          requiresAuth: false,
          deal: null,
          branding: null,
        });
        return;
      }
      setState({ loading: false, error: "", requiresAuth: false, deal: data, branding: null });
    })();
  }, [token, session]);

  // Sekme başlığı müşteriye işletmenin adını göstermeli (index.html varsayılanı
  // "Binerly - CRM | ..." beyaz-etiket hissini bozar).
  const brandingName = (state.branding || state.deal)?.companyName;
  useEffect(() => {
    if (brandingName) document.title = brandingName;
  }, [brandingName]);

  const submitAuth = async (e) => {
    e.preventDefault();
    setAuthMessage("");
    setAuthLoading(true);
    if (authMode === "login") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setAuthMessage(translateAuthError(error.message));
    } else {
      if (!isFullNameValid(name)) {
        setAuthMessage("Lütfen ad ve soyadınızı girin.");
        setAuthLoading(false);
        return;
      }
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: name.trim() }, emailRedirectTo: window.location.href },
      });
      if (error) setAuthMessage(translateAuthError(error.message));
      else
        setAuthMessage(
          "Kayıt başarılı! E-postanıza gelen doğrulama linkine tıklayıp bu sayfaya geri dönün.",
        );
    }
    setAuthLoading(false);
  };

  const handleGoogleCredential = async (idToken, nonce) => {
    const { error } = await supabase.auth.signInWithIdToken({
      provider: "google",
      token: idToken,
      nonce,
    });
    if (error) setAuthMessage(translateAuthError(error.message));
  };

  const approve = async () => {
    setApproveError("");
    setApproving(true);
    try {
      const res = await fetch("/api/deal-approval", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ token, note: note.trim() || null }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setState((s) => ({
          ...s,
          deal: {
            ...s.deal,
            approved: true,
            approvedAt: data.approvedAt || new Date().toISOString(),
          },
        }));
      } else {
        setApproveError(data.error || "Onaylanamadı, lütfen tekrar deneyin.");
      }
    } catch {
      setApproveError(
        "Bağlantı hatası, lütfen tekrar deneyin. İnternet bağlantınızı kontrol edin.",
      );
    }
    setApproving(false);
  };

  const payNow = async () => {
    setPaymentError("");
    setPaying(true);
    try {
      const res = await fetch("/api/deal-approval", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ token, action: "checkout-init" }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.paymentPageUrl) {
        window.location.href = data.paymentPageUrl;
        return;
      }
      setPaymentError(data.error || "Ödeme başlatılamadı, lütfen tekrar deneyin.");
    } catch {
      setPaymentError(
        "Bağlantı hatası, lütfen tekrar deneyin. İnternet bağlantınızı kontrol edin.",
      );
    }
    setPaying(false);
  };

  const branding = state.branding || state.deal;

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background:
          "radial-gradient(130% 520px at 50% -60px, rgba(79, 148, 217, 0.2), rgba(79, 148, 217, 0) 70%)",
        backgroundRepeat: "no-repeat",
        fontFamily: "system-ui, -apple-system, sans-serif",
        padding: "1rem",
      }}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: 12,
          padding: "2rem",
          width: "100%",
          maxWidth: 420,
          border: "1px solid #e1e8f0",
          textAlign: "center",
          boxShadow: "0 4px 24px rgba(12,37,64,0.06)",
        }}
      >
        {state.loading ? (
          <p style={{ color: "#5b7088" }}>Yükleniyor…</p>
        ) : state.error ? (
          <p style={{ color: "#b91c1c" }}>{state.error}</p>
        ) : state.requiresAuth ? (
          <div style={{ textAlign: "left" }}>
            {branding?.logoUrl && (
              <img
                src={branding.logoUrl}
                alt=""
                style={{
                  maxHeight: 40,
                  marginBottom: 12,
                  display: "block",
                  marginLeft: "auto",
                  marginRight: "auto",
                }}
              />
            )}
            <p style={{ fontSize: 13, color: "#94a7bb", margin: "0 0 4px", textAlign: "center" }}>
              {branding?.companyName}
            </p>
            <h2
              style={{
                fontSize: 17,
                fontWeight: 700,
                color: "#0c2540",
                margin: "0 0 4px",
                textAlign: "center",
              }}
            >
              {authMode === "login" ? "Giriş yap" : "Hesap oluştur"}
            </h2>
            <p
              style={{ fontSize: 12.5, color: "#5b7088", margin: "0 0 18px", textAlign: "center" }}
            >
              Bu {APPROVAL_DEAL_WORDS[dealWordKind(branding?.sector)].acc} görüp onaylayabilmek
              için, bu firmaya kayıtlı e-posta adresinizle giriş yapmanız gerekiyor.
            </p>
            <form onSubmit={submitAuth}>
              {authMode === "register" && (
                <div style={{ marginBottom: 10 }}>
                  <label
                    style={{ fontSize: 12, color: "#5b7088", display: "block", marginBottom: 4 }}
                  >
                    Ad Soyad
                  </label>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    style={{
                      width: "100%",
                      padding: "9px 10px",
                      border: "1px solid #e1e8f0",
                      borderRadius: 8,
                      fontSize: 14,
                      boxSizing: "border-box",
                    }}
                  />
                </div>
              )}
              <div style={{ marginBottom: 10 }}>
                <label
                  style={{ fontSize: 12, color: "#5b7088", display: "block", marginBottom: 4 }}
                >
                  E-posta
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  style={{
                    width: "100%",
                    padding: "9px 10px",
                    border: "1px solid #e1e8f0",
                    borderRadius: 8,
                    fontSize: 14,
                    boxSizing: "border-box",
                  }}
                />
              </div>
              <div style={{ marginBottom: 12 }}>
                <label
                  style={{ fontSize: 12, color: "#5b7088", display: "block", marginBottom: 4 }}
                >
                  Şifre
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={authMode === "register" ? 6 : undefined}
                  style={{
                    width: "100%",
                    padding: "9px 10px",
                    border: "1px solid #e1e8f0",
                    borderRadius: 8,
                    fontSize: 14,
                    boxSizing: "border-box",
                  }}
                />
                {authMode === "register" && (
                  <p style={{ fontSize: 11, color: "#94a7bb", margin: "4px 0 0" }}>
                    En az 6 karakter olmalı.
                  </p>
                )}
              </div>
              {authMessage && (
                <p style={{ fontSize: 12.5, color: "#b45309", marginBottom: 12 }}>{authMessage}</p>
              )}
              <button
                type="submit"
                disabled={authLoading}
                style={{
                  width: "100%",
                  background: "#185fa5",
                  color: "#fff",
                  border: "none",
                  borderRadius: 8,
                  padding: "11px",
                  fontWeight: 700,
                  fontSize: 15,
                  cursor: "pointer",
                }}
              >
                {authLoading ? "Yükleniyor…" : authMode === "login" ? "Giriş yap" : "Kayıt ol"}
              </button>
            </form>
            <AuthDivider />
            <GoogleAuthButton onCredential={handleGoogleCredential} />
            <p style={{ fontSize: 12.5, textAlign: "center", marginTop: 14, color: "#5b7088" }}>
              {authMode === "login" ? "Hesabın yok mu? " : "Hesabın var mı? "}
              <button
                onClick={() => {
                  setAuthMode(authMode === "login" ? "register" : "login");
                  setAuthMessage("");
                }}
                style={{
                  background: "none",
                  border: "none",
                  color: "#185fa5",
                  padding: 0,
                  cursor: "pointer",
                  fontSize: 12.5,
                  fontWeight: 600,
                }}
              >
                {authMode === "login" ? "Kayıt ol" : "Giriş yap"}
              </button>
            </p>
          </div>
        ) : (
          <>
            {state.deal.logoUrl && (
              <img src={state.deal.logoUrl} alt="" style={{ maxHeight: 48, marginBottom: 16 }} />
            )}
            <p style={{ fontSize: 13, color: "#94a7bb", margin: "0 0 4px" }}>
              {state.deal.companyName}
            </p>
            {state.deal.customerName && (
              <p style={{ fontSize: 14, color: "#5b7088", margin: "0 0 12px" }}>
                Sayın {state.deal.customerName},
              </p>
            )}
            <h1 style={{ fontSize: 20, fontWeight: 700, color: "#0c2540", margin: "0 0 8px" }}>
              {state.deal.title}
            </h1>
            <p style={{ fontSize: 24, fontWeight: 800, color: "#185fa5", margin: "0 0 4px" }}>
              {formatTL(state.deal.value)}
            </p>
            {(state.deal.appointmentDate || state.deal.createdAt) && (
              <p style={{ fontSize: 12, color: "#94a7bb", margin: "0 0 20px" }}>
                {APPROVAL_DEAL_WORDS[dealWordKind(state.deal.sector)].dateLabel}:{" "}
                {state.deal.appointmentDate
                  ? formatDateTime(state.deal.appointmentDate)
                  : formatDate(state.deal.createdAt)}
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
              // Portaldan kendi alınan randevu/üyelik/rezervasyonlarda (selfBooked)
              // onay diye bir kavram yok — müşteri zaten kendi almış. Bu durumu
              // isCompleted'a dahil etmezsek, ödeme talep edilmeyen (paymentMode
              // "none") self-booked kayıtlarda anlamsız bir "Onaylıyorum" ekranı
              // çıkıyordu (müşterinin zaten kendi aldığı bir randevuyu "onaylaması"
              // istenen bir durum yok) — bu yüzden Öde butonuna basınca sanki
              // hiçbir şey olmamış gibi bu ekrana düşülüyordu.
              const isSelfBooked = !!state.deal.selfBooked;
              // Sadece randevu widget'ından gelen, booking-anı kapora akışında dolu -
              // "Öde" metnini "Kaporayı Öde"ye çevirip alınan tutarın TAMAMI değil
              // sadece kapora olduğunu netleştirmek için (bkz. api/deal-approval.js GET).
              const depositAmount = state.deal.depositAmount || null;
              const showApproveOnly =
                !isCompleted &&
                !isSelfBooked &&
                state.deal.paymentMode !== "required" &&
                !state.deal.approved;
              const hasPendingAction =
                isCompleted || isSelfBooked ? needsPayment : !state.deal.approved || needsPayment;
              return (
                <>
                  {/* Self-booked (kendi randevusunu/üyeliğini alan) kayıtlarda "onayladınız"
                      demek yanlış — müşteri hiçbir onay adımından geçmedi, sadece ödedi.
                      Ödeme approved_at'i otomatik set ettiği için (bkz. api/deal-approval.js)
                      state.deal.approved self-booked'ta da true olabilir, ama metni buna göre
                      ayırıyoruz. */}
                  {state.deal.approved && !isSelfBooked && (
                    <div
                      style={{
                        background: "#f0fdf4",
                        border: "1px solid #bbf7d0",
                        borderRadius: 8,
                        padding: "14px 16px",
                        marginBottom: hasPendingAction ? 12 : 0,
                      }}
                    >
                      <p style={{ color: "#15803d", fontWeight: 600, margin: "0 0 4px" }}>
                        ✓ Bu {APPROVAL_DEAL_WORDS[dealWordKind(state.deal.sector)].acc} onayladınız
                      </p>
                      {isPaid && (
                        <p style={{ color: "#15803d", fontWeight: 600, margin: "0 0 4px" }}>
                          ✓ Ödeme alındı
                        </p>
                      )}
                      {state.deal.approvedAt && (
                        <p style={{ fontSize: 12, color: "#5b7088", margin: 0 }}>
                          {formatDateTime(state.deal.approvedAt)} tarihinde kaydedildi
                        </p>
                      )}
                    </div>
                  )}
                  {isPaid && (isSelfBooked || !state.deal.approved) && (
                    <div
                      style={{
                        background: "#f0fdf4",
                        border: "1px solid #bbf7d0",
                        borderRadius: 8,
                        padding: "10px 14px",
                        marginBottom: 12,
                        fontSize: 13,
                        color: "#15803d",
                        fontWeight: 600,
                      }}
                    >
                      {depositAmount
                        ? `✓ Kaporanız (${formatTL(depositAmount)}) alındı, kalan tutar hizmet günü ödenir.`
                        : "✓ Ödemeniz alındı"}
                    </div>
                  )}
                  {state.deal.approved && !hasPendingAction && (
                    <p style={{ fontSize: 12, color: "#94a7bb", margin: "0 0 12px" }}>
                      {state.deal.companyName} en kısa sürede sizinle iletişime geçecek.
                    </p>
                  )}
                  {isSelfBooked && !state.deal.approved && !isPaid && !hasPendingAction && (
                    <div
                      style={{
                        background: "#f0fdf4",
                        border: "1px solid #bbf7d0",
                        borderRadius: 8,
                        padding: "14px 16px",
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        justifyContent: "center",
                      }}
                    >
                      <i
                        className="ti ti-circle-check"
                        style={{ fontSize: 18, color: "#15803d" }}
                        aria-hidden="true"
                      ></i>
                      <p style={{ color: "#15803d", fontWeight: 600, margin: 0, fontSize: 13.5 }}>
                        Bu kayıt zaten oluşturulmuş, ek bir işlem gerekmiyor.
                      </p>
                    </div>
                  )}
                  {paidParam === "0" && (
                    <p style={{ fontSize: 12.5, color: "#b45309", margin: "0 0 12px" }}>
                      Ödeme tamamlanamadı, lütfen tekrar deneyin.
                    </p>
                  )}
                  {paymentError && (
                    <p style={{ fontSize: 12.5, color: "#b91c1c", margin: "0 0 12px" }}>
                      {paymentError}
                    </p>
                  )}
                  {state.deal.paymentMode === "required" && needsPayment && (
                    <button
                      onClick={payNow}
                      disabled={paying}
                      style={{
                        width: "100%",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 8,
                        background: "#185fa5",
                        color: "#fff",
                        border: "none",
                        borderRadius: 8,
                        padding: "12px",
                        fontWeight: 700,
                        fontSize: 15,
                        cursor: paying ? "default" : "pointer",
                      }}
                    >
                      {paying ? (
                        "Yönlendiriliyor…"
                      ) : (
                        <>
                          <i
                            className="ti ti-credit-card"
                            style={{ fontSize: 18 }}
                            aria-hidden="true"
                          ></i>
                          {depositAmount
                            ? `Kaporayı Öde (${formatTL(depositAmount)})`
                            : isCompleted || state.deal.approved || isSelfBooked
                              ? "Öde"
                              : "Onayla ve Öde"}
                        </>
                      )}
                    </button>
                  )}
                  {showApproveOnly && (
                    <>
                      {approveError && (
                        <p style={{ fontSize: 12.5, color: "#b91c1c", margin: "0 0 10px" }}>
                          {approveError}
                        </p>
                      )}
                      <textarea
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        placeholder="Not eklemek ister misiniz? (opsiyonel)"
                        rows={2}
                        style={{
                          width: "100%",
                          boxSizing: "border-box",
                          padding: "9px 10px",
                          border: "1px solid #e1e8f0",
                          borderRadius: 8,
                          fontSize: 13,
                          fontFamily: "inherit",
                          resize: "vertical",
                          marginBottom: 10,
                        }}
                      />
                      <button
                        onClick={approve}
                        disabled={approving}
                        style={{
                          width: "100%",
                          background: "#185fa5",
                          color: "#fff",
                          border: "none",
                          borderRadius: 8,
                          padding: "12px",
                          fontWeight: 700,
                          fontSize: 15,
                          cursor: "pointer",
                        }}
                      >
                        {approving ? "Onaylanıyor…" : "Onaylıyorum"}
                      </button>
                    </>
                  )}
                  {isOptionalPay && !isPaid && (
                    <button
                      onClick={payNow}
                      disabled={paying}
                      style={{
                        width: "100%",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 8,
                        background: "#fff",
                        color: "#185fa5",
                        border: "1px solid #185fa5",
                        borderRadius: 8,
                        padding: "12px",
                        fontWeight: 700,
                        fontSize: 15,
                        cursor: paying ? "default" : "pointer",
                        marginTop: 8,
                      }}
                    >
                      {paying ? (
                        "Yönlendiriliyor…"
                      ) : (
                        <>
                          <i
                            className="ti ti-credit-card"
                            style={{ fontSize: 18 }}
                            aria-hidden="true"
                          ></i>
                          {isCompleted || state.deal.approved || isSelfBooked
                            ? "Şimdi öde"
                            : "Onayla ve Öde"}
                        </>
                      )}
                    </button>
                  )}
                  {hasPendingAction && (
                    <p
                      style={{
                        fontSize: 11.5,
                        color: "#94a7bb",
                        margin: "12px 0 0",
                        lineHeight: 1.5,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 4,
                      }}
                    >
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
      <a
        href="https://binerly.com"
        target="_blank"
        rel="noopener noreferrer"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          marginTop: 20,
          opacity: 0.6,
          textDecoration: "none",
        }}
      >
        <img src="/favicon.svg" alt="" style={{ width: 16, height: 16 }} />
        <span style={{ fontSize: 12, color: "#5b7088" }}>Binerly ile güvenle yönetiliyor</span>
      </a>
    </div>
  );
}
