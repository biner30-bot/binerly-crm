import { useState, useEffect } from "react";
import { supabase } from "./supabase";
import AdminPanel from "./Admin";

// Sadece bu e-postayla giriş yapan (kurucu) buraya erişebilir — gerçek yetki
// kontrolü api/admin-data.js'te sunucu tarafında yapılıyor, bu sadece sayfayı
// gösterip gizlemek için. Bilinçli olarak App.jsx'in sekme çubuğunun dışında,
// ayrı bir /admin sayfası — normal KOBİ kullanıcılarının hiç görmediği bir yer.
const ADMIN_EMAIL = "biner30@gmail.com";

function AdminLogin({ notify }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) notify(error.message);
    setLoading(false);
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f5f8fc", fontFamily: "system-ui, -apple-system, sans-serif" }}>
      <form onSubmit={submit} style={{ background: "#fff", borderRadius: 12, padding: "2rem", width: "100%", maxWidth: 340, border: "1px solid #e1e8f0" }}>
        <h1 style={{ fontSize: 18, fontWeight: 700, color: "#0c2540", margin: "0 0 20px" }}>Yönetici Girişi</h1>
        <div style={{ marginBottom: 12 }}>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="E-posta" required style={{ width: "100%" }} />
        </div>
        <div style={{ marginBottom: 16 }}>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Şifre" required style={{ width: "100%" }} />
        </div>
        <button type="submit" disabled={loading} style={{ width: "100%", background: "#185fa5", color: "#fff", border: "none", borderRadius: 8, padding: "10px", fontWeight: 600 }}>
          Giriş Yap
        </button>
      </form>
    </div>
  );
}

export default function AdminPage() {
  const [session, setSession] = useState(undefined);
  const [error, setError] = useState("");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => subscription.unsubscribe();
  }, []);

  if (session === undefined) return null;
  if (!session) return <AdminLogin notify={setError} />;
  if (session.user.email !== ADMIN_EMAIL) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "system-ui, -apple-system, sans-serif" }}>
        <p style={{ color: "#5b7088" }}>Bu sayfaya erişiminiz yok.</p>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", fontFamily: "system-ui, -apple-system, sans-serif", padding: "2rem" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>Binerly — Yönetici</h1>
          <button onClick={() => supabase.auth.signOut()}>Çıkış yap</button>
        </div>
        {error && <p style={{ color: "#b91c1c", fontSize: 13, marginBottom: 12 }}>{error}</p>}
        <AdminPanel session={session} />
      </div>
    </div>
  );
}
