import { useState } from "react";
import { supabase } from "./supabase";
import {
  Modal,
  AuthDivider,
  GoogleAuthButton,
  isFullNameValid,
  translateAuthError,
} from "./shared";
export function PasswordRecoveryModal({ notify, onClose }) {
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (newPassword.length < 6) {
      notify("Şifre en az 6 karakter olmalı.");
      return;
    }
    if (newPassword !== confirmPassword) {
      notify("Şifreler eşleşmiyor.");
      return;
    }
    setSaving(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setSaving(false);
    if (error) {
      notify(`Şifre güncellenemedi: ${error.message}`);
      return;
    }
    notify("Şifreniz güncellendi.", "success");
    onClose();
  };

  return (
    <Modal title="Yeni şifre belirleyin" onClose={onClose}>
      <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: "0 0 16px" }}>
        Sıfırlama bağlantısına tıkladınız - hesabınız için yeni bir şifre belirleyin.
      </p>
      <form onSubmit={submit}>
        <div style={{ marginBottom: 8 }}>
          <label
            style={{
              fontSize: 13,
              color: "var(--text-secondary)",
              display: "block",
              marginBottom: 4,
            }}
          >
            Yeni şifre
          </label>
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            style={{ width: "100%" }}
            autoFocus
          />
        </div>
        <div style={{ marginBottom: 16 }}>
          <label
            style={{
              fontSize: 13,
              color: "var(--text-secondary)",
              display: "block",
              marginBottom: 4,
            }}
          >
            Yeni şifre (tekrar)
          </label>
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            style={{ width: "100%" }}
          />
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button
            type="submit"
            disabled={saving || !newPassword}
            style={{ background: "var(--fill-accent)", color: "var(--on-accent)", border: "none" }}
          >
            {saving ? "Kaydediliyor…" : "Şifreyi kaydet"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function AuthModal({ initialMode = "login", onClose }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState(initialMode);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setMessage("");
    setLoading(true);
    if (mode === "login") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setMessage(translateAuthError(error.message));
    } else {
      if (!isFullNameValid(name)) {
        setMessage("Lütfen ad ve soyadınızı girin.");
        setLoading(false);
        return;
      }
      if (!termsAccepted) {
        setMessage(
          "Devam etmek için Kullanım Koşulları ve Gizlilik Politikası'nı kabul etmeniz gerekiyor.",
        );
        setLoading(false);
        return;
      }
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: name.trim() } },
      });
      if (error) setMessage(translateAuthError(error.message));
      else setMessage("Kayıt başarılı! E-postanıza gelen doğrulama linkine tıklayın.");
    }
    setLoading(false);
  };

  const sendResetEmail = async () => {
    if (!email) {
      setMessage("Önce e-posta adresinizi yazın.");
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/`,
    });
    setLoading(false);
    setMessage(
      error
        ? translateAuthError(error.message)
        : "E-postanıza bir şifre sıfırlama bağlantısı gönderdik.",
    );
  };

  const handleGoogleCredential = async (idToken, nonce) => {
    const { error } = await supabase.auth.signInWithIdToken({
      provider: "google",
      token: idToken,
      nonce,
    });
    if (error) setMessage(translateAuthError(error.message));
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.5)",
        display: "flex",
        justifyContent: "center",
        zIndex: 1000,
        padding: "1rem",
        overflowY: "auto",
      }}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: 16,
          padding: "2rem",
          width: "100%",
          maxWidth: 420,
          position: "relative",
          margin: "auto",
        }}
      >
        <button
          onClick={onClose}
          style={{
            position: "absolute",
            top: 16,
            right: 16,
            background: "none",
            border: "none",
            fontSize: 20,
            cursor: "pointer",
            color: "#666",
          }}
        >
          ✕
        </button>
        <h2 style={{ fontSize: 20, fontWeight: 700, margin: "0 0 4px", color: "#0c2540" }}>
          {mode === "login" ? "Giriş yap" : "Ücretsiz başla"}
        </h2>
        <p style={{ fontSize: 13, color: "#5b7088", margin: "0 0 1.5rem" }}>
          Binerly CRM'e hoş geldiniz
        </p>
        <form onSubmit={submit}>
          {mode === "register" && (
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 13, color: "#5b7088", display: "block", marginBottom: 4 }}>
                Ad Soyad
              </label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  border: "1px solid #e1e8f0",
                  borderRadius: 8,
                  fontSize: 14,
                  boxSizing: "border-box",
                }}
              />
            </div>
          )}
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 13, color: "#5b7088", display: "block", marginBottom: 4 }}>
              E-posta
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              style={{
                width: "100%",
                padding: "10px 12px",
                border: "1px solid #e1e8f0",
                borderRadius: 8,
                fontSize: 14,
                boxSizing: "border-box",
              }}
            />
          </div>
          <div style={{ marginBottom: 8 }}>
            <label style={{ fontSize: 13, color: "#5b7088", display: "block", marginBottom: 4 }}>
              Şifre
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={mode === "register" ? 6 : undefined}
              style={{
                width: "100%",
                padding: "10px 12px",
                border: "1px solid #e1e8f0",
                borderRadius: 8,
                fontSize: 14,
                boxSizing: "border-box",
              }}
            />
            {mode === "register" && (
              <p style={{ fontSize: 11.5, color: "#94a7bb", margin: "4px 0 0" }}>
                En az 6 karakter olmalı.
              </p>
            )}
          </div>
          {mode === "login" && (
            <p style={{ margin: "0 0 16px" }}>
              <button
                type="button"
                onClick={sendResetEmail}
                disabled={loading}
                style={{
                  background: "none",
                  border: "none",
                  color: "#185fa5",
                  padding: 0,
                  cursor: "pointer",
                  fontSize: 12,
                }}
              >
                Şifremi unuttum
              </button>
            </p>
          )}
          {mode === "register" && (
            <div style={{ marginBottom: 16 }}>
              <label
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 8,
                  fontSize: 12.5,
                  color: "#5b7088",
                  cursor: "pointer",
                }}
              >
                <input
                  type="checkbox"
                  checked={termsAccepted}
                  onChange={(e) => setTermsAccepted(e.target.checked)}
                  style={{ marginTop: 2 }}
                />
                <span>
                  <a
                    href="/kullanim-kosullari"
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: "#185fa5" }}
                  >
                    Kullanım Koşulları
                  </a>
                  {"'nı, "}
                  <a
                    href="/gizlilik"
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: "#185fa5" }}
                  >
                    Gizlilik Politikası
                  </a>
                  {"'nı ve "}
                  <a
                    href="/kvkk"
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: "#185fa5" }}
                  >
                    KVKK Aydınlatma Metni
                  </a>
                  {"'ni okudum, kabul ediyorum."}
                </span>
              </label>
            </div>
          )}
          {message && <p style={{ fontSize: 13, color: "#b45309", marginBottom: 12 }}>{message}</p>}
          <button
            type="submit"
            disabled={loading}
            style={{
              width: "100%",
              background: "#185fa5",
              color: "#fff",
              border: "none",
              borderRadius: 8,
              padding: "11px",
              fontSize: 15,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            {loading ? "Yükleniyor…" : mode === "login" ? "Giriş yap" : "Kayıt ol"}
          </button>
        </form>
        <AuthDivider />
        <GoogleAuthButton onCredential={handleGoogleCredential} />
        <p style={{ fontSize: 13, textAlign: "center", marginTop: 12, color: "#5b7088" }}>
          {mode === "login" ? "Hesabın yok mu? " : "Hesabın var mı? "}
          <button
            onClick={() => {
              setMode(mode === "login" ? "register" : "login");
              setMessage("");
            }}
            style={{
              background: "none",
              border: "none",
              color: "#185fa5",
              padding: 0,
              cursor: "pointer",
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            {mode === "login" ? "Kayıt ol" : "Giriş yap"}
          </button>
        </p>
      </div>
    </div>
  );
}
