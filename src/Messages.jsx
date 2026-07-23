import React, { useState, useEffect, useMemo } from "react";
import { Badge, Modal } from "./shared";

const CHANNEL_LABELS = { whatsapp: "WhatsApp", instagram: "Instagram" };

export function rowToChannelCredential(r) {
  return {
    id: r.id,
    channel: r.channel,
    externalId: r.external_id,
    displayName: r.display_name || "",
    connectedAt: r.connected_at,
  };
}

export function rowToChannelMessage(r) {
  return {
    id: r.id,
    channel: r.channel,
    direction: r.direction,
    externalMessageId: r.external_message_id,
    counterpartId: r.counterpart_id,
    counterpartName: r.counterpart_name || "",
    customerId: r.customer_id || null,
    body: r.body,
    createdAt: r.created_at,
    readAt: r.read_at || null,
  };
}

function buildConversations(channelMessages) {
  const map = {};
  channelMessages.forEach((m) => {
    const key = `${m.channel}:${m.counterpartId}`;
    if (!map[key]) {
      map[key] = { channel: m.channel, counterpartId: m.counterpartId, counterpartName: m.counterpartName, customerId: m.customerId, messages: [] };
    }
    map[key].messages.push(m);
    if (m.customerId) map[key].customerId = m.customerId;
    if (m.counterpartName) map[key].counterpartName = m.counterpartName;
  });
  return Object.values(map)
    .map((c) => {
      const sorted = c.messages.slice().sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
      return {
        ...c,
        messages: sorted,
        lastMessage: sorted[sorted.length - 1],
        unread: sorted.filter((m) => m.direction === "in" && !m.readAt).length,
      };
    })
    .sort((a, b) => new Date(b.lastMessage.createdAt) - new Date(a.lastMessage.createdAt));
}

function ConnectPanel({ channel, credential, onSave, onDisconnect, onCancel }) {
  const [externalId, setExternalId] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [appSecret, setAppSecret] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [saving, setSaving] = useState(false);

  const webhookUrl = `${window.location.origin}/api/${channel}-webhook`;
  const verifyToken = import.meta.env.VITE_META_WEBHOOK_VERIFY_TOKEN || "(Binerly'nin size ileteceği doğrulama kodu)";

  const submit = async (e) => {
    e.preventDefault();
    if (!externalId.trim() || !accessToken.trim() || !appSecret.trim()) return;
    setSaving(true);
    await onSave({ externalId: externalId.trim(), accessToken: accessToken.trim(), appSecret: appSecret.trim(), displayName: displayName.trim() });
    setSaving(false);
  };

  return (
    <Modal title={`${CHANNEL_LABELS[channel]} bağlantısı`} onClose={onCancel}>
      <div style={{ background: "var(--bg-accent)", borderRadius: "var(--radius)", padding: "0.9rem 1rem", marginBottom: 16 }}>
        <p style={{ margin: "0 0 6px", fontSize: 13, fontWeight: 500, color: "var(--text-accent)" }}>Bu bağlantı tamamen ücretsizdir</p>
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: "var(--text-accent)" }}>
          <li>
            {channel === "whatsapp"
              ? "WhatsApp Business hesabına geçiş ücretsizdir; \"Coexistence\" özelliği sayesinde mevcut numaranızı ve sohbet geçmişinizi kaybetmezsiniz."
              : "Instagram Profesyonel hesaba geçiş, ayarlardan anlık ve ücretsiz yapılır, hesabınız normal kullanım için aynı şekilde çalışmaya devam eder."}
          </li>
          <li>Ayda ilk 1000 müşteri-başlatan konuşma ücretsizdir.</li>
          <li>"Meta Verified" gibi ek yükseltmeler tamamen opsiyoneldir, gerekli değildir.</li>
        </ul>
      </div>

      {credential ? (
        <div style={{ marginBottom: 16 }}>
          <p style={{ fontSize: 13, color: "var(--text-secondary)" }}>
            Bağlı: <strong>{credential.displayName || credential.externalId}</strong>
          </p>
          <button type="button" onClick={onDisconnect} style={{ fontSize: 13, color: "var(--text-danger)" }}>
            Bağlantıyı kaldır
          </button>
        </div>
      ) : (
        <form onSubmit={submit}>
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 13, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>
              {channel === "whatsapp" ? "Phone Number ID" : "Instagram/Sayfa ID"}
            </label>
            <input value={externalId} onChange={(e) => setExternalId(e.target.value)} style={{ width: "100%" }} />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 13, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Erişim jetonu (Access Token)</label>
            <input value={accessToken} onChange={(e) => setAccessToken(e.target.value)} type="password" style={{ width: "100%" }} />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 13, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Meta App Secret</label>
            <input value={appSecret} onChange={(e) => setAppSecret(e.target.value)} type="password" style={{ width: "100%" }} />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 13, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Görünen ad (opsiyonel)</label>
            <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Örn. Mağaza WhatsApp hattı" style={{ width: "100%" }} />
          </div>

          <div style={{ background: "var(--surface-1)", borderRadius: "var(--radius)", padding: "0.75rem 1rem", marginBottom: 16, fontSize: 12, color: "var(--text-secondary)" }}>
            <p style={{ margin: "0 0 4px" }}>Meta Geliştirici panelinizde webhook olarak şunu girin:</p>
            <p style={{ margin: "0 0 4px", fontFamily: "monospace", wordBreak: "break-all" }}>{webhookUrl}</p>
            <p style={{ margin: 0 }}>
              Doğrulama kodu (Verify Token): <span style={{ fontFamily: "monospace" }}>{verifyToken}</span>
            </p>
          </div>

          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button type="button" onClick={onCancel}>Vazgeç</button>
            <button
              type="submit"
              disabled={saving || !externalId.trim() || !accessToken.trim() || !appSecret.trim()}
              style={{ background: "var(--fill-accent)", color: "var(--on-accent)", border: "none" }}
            >
              Bağla
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}

function ConversationList({ conversations, customerById, selectedKey, onSelect }) {
  return (
    <div style={{ background: "var(--surface-1)", borderRadius: "var(--radius)", padding: 8, maxHeight: 560, overflowY: "auto" }}>
      {conversations.map((c) => {
        const key = `${c.channel}:${c.counterpartId}`;
        const customer = c.customerId ? customerById(c.customerId) : null;
        return (
          <div
            key={key}
            onClick={() => onSelect(key)}
            style={{
              display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderRadius: "var(--radius)",
              cursor: "pointer", background: selectedKey === key ? "var(--surface-2)" : "transparent",
            }}
          >
            <i className={`ti ${c.channel === "whatsapp" ? "ti-brand-whatsapp" : "ti-brand-instagram"}`} style={{ fontSize: 16, color: "var(--text-accent)" }} aria-hidden="true"></i>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ margin: 0, fontSize: 13, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {customer?.name || c.counterpartName || c.counterpartId}
              </p>
              <p style={{ margin: 0, fontSize: 12, color: "var(--text-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {c.lastMessage.direction === "out" ? "Siz: " : ""}{c.lastMessage.body}
              </p>
            </div>
            {c.unread > 0 && <Badge tone="accent">{c.unread}</Badge>}
          </div>
        );
      })}
    </div>
  );
}

function ThreadView({ conversation, customer, onSend, onConvertToCustomer, onCreateDeal }) {
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);

  const inboundMessages = conversation.messages.filter((m) => m.direction === "in");
  const lastInbound = inboundMessages[inboundMessages.length - 1];
  const withinWindow = !!lastInbound && Date.now() - new Date(lastInbound.createdAt).getTime() <= 24 * 3600 * 1000;

  const submit = async (e) => {
    e.preventDefault();
    if (!body.trim() || !withinWindow) return;
    setSending(true);
    await onSend(body.trim());
    setBody("");
    setSending(false);
  };

  return (
    <div style={{ background: "var(--surface-1)", borderRadius: "var(--radius)", padding: "1rem", display: "flex", flexDirection: "column", height: 560 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
        <p style={{ margin: 0, fontWeight: 500, fontSize: 14 }}>
          {customer?.name || conversation.counterpartName || conversation.counterpartId}
        </p>
        <div style={{ display: "flex", gap: 8 }}>
          {!conversation.customerId && conversation.channel === "whatsapp" && (
            <button onClick={onConvertToCustomer} style={{ fontSize: 12 }}>Müşteriye dönüştür</button>
          )}
          {conversation.customerId && (
            <button onClick={onCreateDeal} style={{ fontSize: 12 }}>Teklif oluştur</button>
          )}
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
        {conversation.messages.map((m) => (
          <div key={m.id} style={{ alignSelf: m.direction === "out" ? "flex-end" : "flex-start", maxWidth: "75%" }}>
            <div
              style={{
                background: m.direction === "out" ? "var(--fill-accent)" : "var(--surface-2)",
                color: m.direction === "out" ? "var(--on-accent)" : "var(--text-primary)",
                borderRadius: "var(--radius)", padding: "6px 10px", fontSize: 13,
              }}
            >
              {m.body}
            </div>
            <p style={{ margin: "2px 4px 0", fontSize: 10, color: "var(--text-muted)", textAlign: m.direction === "out" ? "right" : "left" }}>
              {new Date(m.createdAt).toLocaleString("tr-TR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
            </p>
          </div>
        ))}
      </div>

      {!withinWindow && (
        <p style={{ fontSize: 12, color: "var(--text-warning)", margin: "0 0 8px" }}>
          24 saatlik yanıt penceresi kapandı — bu kişiye şu an serbest metinli mesaj gönderilemez.
        </p>
      )}
      <form onSubmit={submit} style={{ display: "flex", gap: 8 }}>
        <input value={body} onChange={(e) => setBody(e.target.value)} placeholder="Mesaj yazın..." disabled={!withinWindow} style={{ flex: 1 }} />
        <button type="submit" disabled={sending || !body.trim() || !withinWindow} style={{ background: "var(--fill-accent)", color: "var(--on-accent)", border: "none" }}>
          Gönder
        </button>
      </form>
    </div>
  );
}

export default function Messages({
  customers, credentials, channelMessages,
  onSaveCredential, onDisconnectCredential, onRefresh,
  onSendMessage, onMarkRead, onConvertToCustomer, onCreateDeal,
}) {
  const [selectedKey, setSelectedKey] = useState(null);
  const [showConnect, setShowConnect] = useState(null);

  useEffect(() => {
    const id = setInterval(onRefresh, 17000);
    return () => clearInterval(id);
  }, [onRefresh]);

  const customerById = (id) => customers.find((c) => c.id === id);
  const credentialByChannel = (channel) => credentials.find((c) => c.channel === channel);

  const conversations = useMemo(() => buildConversations(channelMessages), [channelMessages]);
  const selected = conversations.find((c) => `${c.channel}:${c.counterpartId}` === selectedKey) || null;

  useEffect(() => {
    if (selected && selected.unread > 0) onMarkRead(selected.channel, selected.counterpartId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedKey]);

  const anyConnected = !!credentialByChannel("whatsapp") || !!credentialByChannel("instagram");

  return (
    <div>
      <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
        {["whatsapp", "instagram"].map((channel) => {
          const cred = credentialByChannel(channel);
          return (
            <div
              key={channel}
              style={{ background: "var(--surface-1)", borderRadius: "var(--radius)", padding: "0.75rem 1rem", display: "flex", alignItems: "center", gap: 10, minWidth: 220 }}
            >
              <i className={`ti ${channel === "whatsapp" ? "ti-brand-whatsapp" : "ti-brand-instagram"}`} style={{ fontSize: 20, color: "var(--text-accent)" }} aria-hidden="true"></i>
              <div style={{ flex: 1 }}>
                <p style={{ margin: 0, fontSize: 13, fontWeight: 500 }}>{CHANNEL_LABELS[channel]}</p>
                <p style={{ margin: 0, fontSize: 12, color: cred ? "var(--text-success)" : "var(--text-muted)" }}>
                  {cred ? `Bağlı${cred.displayName ? ` · ${cred.displayName}` : ""}` : "Bağlı değil"}
                </p>
              </div>
              <button onClick={() => setShowConnect(channel)} style={{ fontSize: 12 }}>
                {cred ? "Değiştir" : "Bağla"}
              </button>
            </div>
          );
        })}
      </div>

      {!anyConnected ? (
        <p style={{ fontSize: 14, color: "var(--text-secondary)" }}>
          Gelen kutusunu kullanmaya başlamak için yukarıdan WhatsApp veya Instagram hesabınızı bağlayın.
        </p>
      ) : conversations.length === 0 ? (
        <p style={{ fontSize: 14, color: "var(--text-secondary)" }}>Henüz mesaj yok.</p>
      ) : (
        <div className="messages-grid" data-has-selection={selected ? "true" : "false"} style={{ display: "grid", gridTemplateColumns: "300px 1fr", gap: 16, alignItems: "start" }}>
          <div className="msg-list-pane">
            <ConversationList conversations={conversations} customerById={customerById} selectedKey={selectedKey} onSelect={setSelectedKey} />
          </div>
          <div className="msg-thread-pane">
            <button type="button" className="msg-back-button" onClick={() => setSelectedKey(null)} style={{ display: "none", alignItems: "center", gap: 6, fontSize: 13, marginBottom: 10, background: "none", border: "none", color: "var(--text-accent)", padding: 0, cursor: "pointer" }}>
              <i className="ti ti-arrow-left" style={{ fontSize: 16 }} aria-hidden="true"></i> Konuşmalara dön
            </button>
            {selected ? (
              <ThreadView
                conversation={selected}
                customer={selected.customerId ? customerById(selected.customerId) : null}
                onSend={(body) => onSendMessage({ channel: selected.channel, to: selected.counterpartId, body, customerId: selected.customerId })}
                onConvertToCustomer={() => onConvertToCustomer(selected)}
                onCreateDeal={() => onCreateDeal(selected)}
              />
            ) : (
              <div style={{ background: "var(--surface-1)", borderRadius: "var(--radius)", padding: "2rem", textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>
                Bir konuşma seçin
              </div>
            )}
          </div>
        </div>
      )}

      {showConnect && (
        <ConnectPanel
          channel={showConnect}
          credential={credentialByChannel(showConnect)}
          onSave={async (fields) => { await onSaveCredential(showConnect, fields); setShowConnect(null); }}
          onDisconnect={async () => { await onDisconnectCredential(showConnect); setShowConnect(null); }}
          onCancel={() => setShowConnect(null)}
        />
      )}
    </div>
  );
}
