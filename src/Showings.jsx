import React, { useState } from "react";
import { Badge, ConfirmDialog, InfoTip, toWhatsAppNumber, uid } from "./shared";
import { SHOWING_INTEREST, buildShowingDocumentText, showingProtectionEnd } from "./realEstate";

const labelStyle = {
  fontSize: 12,
  color: "var(--text-secondary)",
  display: "block",
  marginBottom: 4,
};

const SHOWING_LINK_BASE = "https://binerly.com/yer-gosterme/";

// Linkle alınan onay basit elektronik onaydır: TBK m.520 taşınmaz simsarlığında
// yazılı şekil (ıslak ya da güvenli elektronik imza) arar, bu onay onu karşılamaz.
// Ürün bunu "imza" gibi sunarsa kullanıcı hizmet bedeli davasında elinde geçerli
// belge olduğunu sanabilir - bu yüzden her yerde "ön onay" deniyor.
const PRE_APPROVAL_WARNING =
  "Ön onay ıslak imzanın yerini tutmaz. Gösterimin yapıldığını kayıt altına alır (tarih, saat, IP), ancak hizmet bedeli talebi için belgeyi müşteriye ıslak imzalı olarak da imzalatın ve taramasını buraya yükleyin.";

function interestMeta(id) {
  return SHOWING_INTEREST.find((i) => i.id === id);
}

function toLocalInput(iso) {
  const d = iso ? new Date(iso) : new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// Islak imza için yazdırılabilir çıktı. Ön onaylı gösterimde saklanan metin
// basılır, değilse güncel bilgilerle yeniden üretilir. İmza alanları ön onay
// olsa da HER ZAMAN basılır - ön onay ıslak imzanın yerini tutmaz.
export function printShowingDocument({ text, signed, logoUrl }) {
  const win = window.open("", "_blank");
  if (!win) return false;
  const [title, ...rest] = text.split("\n");
  const body = rest
    .map((line) => (line.trim() === "" ? "<br/>" : `<p>${escapeHtml(line)}</p>`))
    .join("");
  const preApproval = signed
    ? `<div class="signed">Elektronik ön onay kaydı: ${escapeHtml(signed.name)} - ${escapeHtml(
        new Date(signed.at).toLocaleString("tr-TR"),
      )} - IP ${escapeHtml(signed.ip || "-")}</div>`
    : "";
  const signatureBlock = `${preApproval}<div class="sign"><div><span>Taşınmazı gören</span>Ad soyad / imza</div><div><span>Taşınmazı gösteren</span>Ad soyad / imza</div></div>
       <p class="hint">Gören kişinin "Yukarıdaki kişisel bilgilerimin doğru olduğunu beyan ederim." cümlesini el yazısıyla yazması önerilir.</p>`;
  win.document
    .write(`<!doctype html><html lang="tr"><head><meta charset="utf-8"/><title>${escapeHtml(title)}</title>
<style>
body{font-family:Arial,sans-serif;color:#111;max-width:720px;margin:32px auto;padding:0 24px;font-size:13px;line-height:1.5}
h1{font-size:17px;text-align:center;margin:0 0 20px}
p{margin:0}
.logo{text-align:center;margin-bottom:12px}.logo img{max-height:48px}
.sign{display:flex;gap:32px;margin-top:48px}.sign div{flex:1;border-top:1px solid #111;padding-top:6px;font-size:12px;color:#444}
.sign span{display:block;font-weight:bold;color:#111}
.signed{margin-top:32px;padding:10px;border:1px solid #888;font-size:12px}
.hint{margin-top:16px;font-size:11px;color:#666}
@media print{body{margin:0 auto}}
</style></head><body>
${logoUrl ? `<div class="logo"><img src="${escapeHtml(logoUrl)}" alt=""/></div>` : ""}
<h1>${escapeHtml(title)}</h1>${body}${signatureBlock}
<script>window.onload=function(){window.print()}</script>
</body></html>`);
  win.document.close();
  return true;
}

function ShowingForm({ initial, customers, onSave, onCancel }) {
  const [customerId, setCustomerId] = useState(initial?.customerId || "");
  const [shownAt, setShownAt] = useState(toLocalInput(initial?.shownAt));
  const [method, setMethod] = useState(initial?.method || "fiziki");
  const [interest, setInterest] = useState(initial?.interest || "");
  const [feedback, setFeedback] = useState(initial?.feedback || "");
  const [saving, setSaving] = useState(false);
  return (
    <div
      style={{
        border: "0.5px solid var(--border)",
        borderRadius: 8,
        padding: 12,
        marginBottom: 8,
        background: "var(--surface-1)",
      }}
    >
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 8 }}>
        <div style={{ flex: "1 1 200px" }}>
          <label style={labelStyle}>Müşteri</label>
          <select
            value={customerId}
            onChange={(e) => setCustomerId(e.target.value)}
            disabled={!!initial?.consentSignedAt}
            style={{ width: "100%" }}
          >
            <option value="">Seçin</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div style={{ flex: "1 1 180px" }}>
          <label style={labelStyle}>Tarih ve saat</label>
          <input
            type="datetime-local"
            value={shownAt}
            onChange={(e) => setShownAt(e.target.value)}
            disabled={!!initial?.consentSignedAt}
            style={{ width: "100%" }}
          />
        </div>
        <div style={{ flex: "1 1 140px" }}>
          <label style={labelStyle}>Gösterim şekli</label>
          <select
            value={method}
            onChange={(e) => setMethod(e.target.value)}
            disabled={!!initial?.consentSignedAt}
            style={{ width: "100%" }}
          >
            <option value="fiziki">Yerinde</option>
            <option value="elektronik">Elektronik (foto/video/görüntülü)</option>
          </select>
        </div>
        <div style={{ flex: "1 1 140px" }}>
          <label style={labelStyle}>İlgi</label>
          <select
            value={interest}
            onChange={(e) => setInterest(e.target.value)}
            style={{ width: "100%" }}
          >
            <option value="">-</option>
            {SHOWING_INTEREST.map((i) => (
              <option key={i.id} value={i.id}>
                {i.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      <label style={labelStyle}>Geri bildirim</label>
      <textarea
        value={feedback}
        onChange={(e) => setFeedback(e.target.value)}
        rows={2}
        placeholder="Beğendiği/beğenmediği noktalar, fiyat görüşü, tekrar görmek istiyor mu..."
        style={{ width: "100%", resize: "vertical", marginBottom: 8 }}
      />
      {initial?.consentSignedAt && (
        <p style={{ fontSize: 11, color: "var(--text-muted)", margin: "0 0 8px" }}>
          Ön onay alındığı için müşteri, tarih ve şekil değiştirilemez.
        </p>
      )}
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button type="button" onClick={onCancel}>
          Vazgeç
        </button>
        <button
          type="button"
          disabled={!customerId || !shownAt || saving}
          onClick={async () => {
            setSaving(true);
            const ok = await onSave({
              id: initial?.id || uid(),
              customerId,
              shownAt: new Date(shownAt).toISOString(),
              method,
              interest,
              feedback: feedback.trim(),
            });
            setSaving(false);
            if (ok) onCancel();
          }}
          style={{ background: "var(--fill-accent)", color: "var(--on-accent)", border: "none" }}
        >
          {saving ? "Kaydediliyor…" : "Kaydet"}
        </button>
      </div>
    </div>
  );
}

function ShowingRow({
  title,
  subtitle,
  showing,
  onEdit,
  onPrint,
  onLink,
  onDelete,
  wetDocs = [],
  onUploadWetSigned,
  onDeleteWetSigned,
  onDownloadAttachment,
}) {
  const [uploading, setUploading] = useState(false);
  const [confirmRemoveDoc, setConfirmRemoveDoc] = useState(null);
  const interest = interestMeta(showing.interest);
  const protectionEnd = showingProtectionEnd(showing.shownAt);
  const protectionActive = protectionEnd > new Date();
  return (
    <div
      style={{
        fontSize: 13,
        padding: "8px 10px",
        background: "var(--surface-1)",
        border: "0.5px solid var(--border)",
        borderRadius: "var(--radius)",
        marginBottom: 6,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
        <span style={{ fontWeight: 500 }}>{title}</span>
        <span style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {interest && <Badge tone={interest.tone}>{interest.label}</Badge>}
          {showing.wetSignedAt && <Badge tone="success">Islak imzalı</Badge>}
          {showing.consentSignedAt ? (
            <Badge tone="accent">Ön onay alındı</Badge>
          ) : showing.consentToken ? (
            <Badge tone="warning">Ön onay bekleniyor</Badge>
          ) : null}
          {!showing.wetSignedAt && <Badge tone="default">Islak imza yok</Badge>}
        </span>
      </div>
      <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>
        {subtitle}
        {" · "}
        {protectionActive
          ? `Koruma ${protectionEnd.toLocaleDateString("tr-TR")} tarihine kadar`
          : "Koruma süresi doldu"}
      </div>
      {showing.feedback && (
        <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 4 }}>
          {showing.feedback}
        </div>
      )}
      {(onEdit || onPrint || onLink || onDelete) && (
        <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
          {onEdit && (
            <button type="button" style={{ fontSize: 12 }} onClick={onEdit}>
              Düzenle
            </button>
          )}
          {onPrint && (
            <button type="button" style={{ fontSize: 12 }} onClick={onPrint}>
              <i className="ti ti-printer" aria-hidden="true" /> Belgeyi yazdır
            </button>
          )}
          {onLink && !showing.consentSignedAt && (
            <button type="button" style={{ fontSize: 12 }} onClick={onLink}>
              <i className="ti ti-link" aria-hidden="true" /> Ön onay linki
            </button>
          )}
          {onUploadWetSigned && (
            <label
              style={{
                fontSize: 12,
                padding: "2px 8px",
                border: "0.5px solid var(--border)",
                borderRadius: "var(--radius)",
                cursor: uploading ? "default" : "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
              }}
            >
              <i className="ti ti-upload" aria-hidden="true" />
              {uploading ? "Yükleniyor…" : "Islak imzalı belgeyi yükle"}
              <input
                type="file"
                accept="image/*,application/pdf"
                disabled={uploading}
                style={{ display: "none" }}
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (!file) return;
                  setUploading(true);
                  await onUploadWetSigned(showing, file);
                  setUploading(false);
                }}
              />
            </label>
          )}
          {onDelete && (
            <button
              type="button"
              style={{ fontSize: 12, color: "var(--text-danger)" }}
              onClick={onDelete}
            >
              Sil
            </button>
          )}
        </div>
      )}
      {wetDocs.length > 0 && onDownloadAttachment && (
        <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap", fontSize: 12 }}>
          {wetDocs.map((a) => (
            <span key={a.id} style={{ display: "inline-flex", gap: 4, alignItems: "center" }}>
              <button
                type="button"
                style={{ fontSize: 12 }}
                onClick={() => onDownloadAttachment(a)}
              >
                <i className="ti ti-file-check" aria-hidden="true" /> {a.fileName}
              </button>
              {onDeleteWetSigned && (
                <button
                  type="button"
                  style={{ fontSize: 12, color: "var(--text-danger)" }}
                  onClick={() => setConfirmRemoveDoc(a)}
                  aria-label="Islak imzalı belgeyi kaldır"
                >
                  <i className="ti ti-trash" aria-hidden="true" />
                </button>
              )}
            </span>
          ))}
        </div>
      )}
      {confirmRemoveDoc && (
        <ConfirmDialog
          title="Islak imzalı belge kaldırılsın mı?"
          message={`"${confirmRemoveDoc.fileName}" çöp kutusuna taşınır. Başka imzalı belge kalmazsa gösterim "Islak imza yok" durumuna döner.`}
          confirmLabel="Kaldır"
          onConfirm={() => {
            onDeleteWetSigned(confirmRemoveDoc);
            setConfirmRemoveDoc(null);
          }}
          onClose={() => setConfirmRemoveDoc(null)}
        />
      )}
    </div>
  );
}

export function PropertyShowings({
  property,
  showings,
  customers,
  teamMembers,
  currentUserId,
  currentUserName = "",
  companySettings,
  onSave,
  onDelete,
  onCreateConsentLink,
  attachments = [],
  onUploadWetSigned,
  onDeleteWetSigned,
  onDownloadAttachment,
  notify,
}) {
  const [editing, setEditing] = useState(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [linkFor, setLinkFor] = useState(null);
  const list = showings
    .filter((s) => s.propertyId === property.id)
    .sort((a, b) => new Date(b.shownAt) - new Date(a.shownAt));
  const customerById = new Map(customers.map((c) => [c.id, c]));
  const shownByName = (id) => {
    if (!id) return "";
    if (id === currentUserId) return "siz";
    const m = teamMembers.find((tm) => tm.id === id);
    return m ? m.name || m.email : "eski üye";
  };

  // İmzalanmışsa onaylanan metin birebir korunur; imzasızsa her seferinde güncel
  // portföy/ayar bilgisiyle yeniden üretilir.
  const docText = (s) =>
    (s.consentSignedAt && s.consentText) ||
    buildShowingDocumentText({
      company: companySettings,
      realEstateSettings: companySettings?.realEstateSettings,
      property,
      customer: customerById.get(s.customerId) || { name: "-" },
      showing: s,
      // Belgede e-posta değil gerçek ad görünmeli - adı olmayan üyede satır atlanır.
      agentName:
        (s.shownBy === currentUserId && currentUserName) ||
        teamMembers.find((tm) => tm.id === s.shownBy)?.name ||
        "",
    });

  const licenseNo = (companySettings?.realEstateSettings?.licenseNo || "").trim();

  const handleLink = async (s) => {
    // Yazdırılan belgede boş alan elle doldurulabilir, linkte müşteri dolduramaz.
    if (!licenseNo) {
      notify(
        "Ön onay linki için önce yetki belgesi numaranızı girin: Ayarlar > İşletme Bilgileri > Emlak ayarları.",
      );
      return;
    }
    const token = await onCreateConsentLink(s, docText(s));
    if (token) setLinkFor({ showing: s, url: `${SHOWING_LINK_BASE}${token}` });
  };

  return (
    <div style={{ marginBottom: 12 }}>
      <p
        style={{
          fontSize: 13,
          fontWeight: 600,
          margin: "16px 0 8px",
          paddingTop: 12,
          borderTop: "0.5px solid var(--border)",
          display: "flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        Gösterimler ({list.length})
        <InfoTip text="Mülkü gösterdiğiniz her müşteriyi kaydedin. Gösterim tarihinden itibaren 12 ay, yer gösterme belgesindeki koruma süresidir - bu sürede müşteri mülkü aracısız alırsa/kiralarsa hizmet bedeli talebinizin dayanağı ıslak imzalı belgedir. Belgeyi yazdırıp imzalatın, taramasını gösterime yükleyin." />
      </p>
      {!licenseNo && (
        <p
          style={{
            fontSize: 12,
            margin: "0 0 8px",
            padding: "6px 10px",
            background: "var(--bg-warning)",
            borderRadius: 6,
          }}
        >
          Yetki belgesi numaranız girilmemiş - belgede boş kalır, ön onay linki oluşturulamaz.
          Ayarlar &gt; İşletme Bilgileri &gt; Emlak ayarları bölümünden ekleyin.
        </p>
      )}
      {list.map((s) =>
        editing?.id === s.id ? (
          <ShowingForm
            key={s.id}
            initial={s}
            customers={customers}
            onSave={(v) => onSave({ ...v, propertyId: property.id, shownBy: s.shownBy })}
            onCancel={() => setEditing(null)}
          />
        ) : (
          <ShowingRow
            key={s.id}
            title={customerById.get(s.customerId)?.name || "Silinmiş müşteri"}
            subtitle={`${new Date(s.shownAt).toLocaleString("tr-TR", { dateStyle: "short", timeStyle: "short" })} · ${s.method === "elektronik" ? "Elektronik" : "Yerinde"}${s.shownBy ? ` · gösteren: ${shownByName(s.shownBy)}` : ""}`}
            showing={s}
            onEdit={() => setEditing(s)}
            onPrint={() => {
              const ok = printShowingDocument({
                text: docText(s),
                signed: s.consentSignedAt
                  ? { name: s.consentSignerName, at: s.consentSignedAt, ip: s.consentIp }
                  : null,
                logoUrl: companySettings?.logoUrl,
              });
              if (!ok)
                notify(
                  "Yazdırma penceresi açılamadı - tarayıcının açılır pencere engelini kaldırın.",
                );
            }}
            onLink={() => handleLink(s)}
            onDelete={() => setConfirmDeleteId(s.id)}
            wetDocs={attachments.filter(
              (a) => a.entityType === "showing_docs" && a.entityId === s.id,
            )}
            onUploadWetSigned={onUploadWetSigned}
            onDeleteWetSigned={onDeleteWetSigned}
            onDownloadAttachment={onDownloadAttachment}
          />
        ),
      )}
      {editing && !editing.id ? (
        <ShowingForm
          customers={customers.filter((c) => c.id !== property.ownerCustomerId)}
          onSave={(v) => onSave({ ...v, propertyId: property.id })}
          onCancel={() => setEditing(null)}
        />
      ) : (
        <button type="button" onClick={() => setEditing({})} style={{ fontSize: 12.5 }}>
          + Gösterim ekle
        </button>
      )}

      {linkFor && (
        <div
          style={{
            marginTop: 8,
            padding: 10,
            border: "0.5px solid var(--border)",
            borderRadius: 8,
            fontSize: 12.5,
          }}
        >
          <p style={{ margin: "0 0 6px", fontWeight: 500 }}>Yer gösterme belgesi ön onay linki</p>
          <p
            style={{
              margin: "0 0 8px",
              padding: "8px 10px",
              background: "var(--bg-warning)",
              borderRadius: 6,
              fontSize: 12,
              lineHeight: 1.5,
            }}
          >
            <i className="ti ti-alert-triangle" aria-hidden="true" /> {PRE_APPROVAL_WARNING}
          </p>
          <input
            readOnly
            value={linkFor.url}
            style={{ width: "100%", marginBottom: 6 }}
            onFocus={(e) => e.target.select()}
          />
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <button
              type="button"
              style={{ fontSize: 12 }}
              onClick={() => {
                navigator.clipboard?.writeText(linkFor.url);
                notify("Link kopyalandı.", "success");
              }}
            >
              Kopyala
            </button>
            {customerById.get(linkFor.showing.customerId)?.phone && (
              <button
                type="button"
                style={{ fontSize: 12 }}
                onClick={() => {
                  const c = customerById.get(linkFor.showing.customerId);
                  const msg = `Merhaba ${c.name.split(" ")[0]}, gezdiğimiz "${property.title}" için yer gösterme belgesini aşağıdaki linkten onaylayabilirsiniz:\n${linkFor.url}`;
                  window.open(
                    `https://wa.me/${toWhatsAppNumber(c.phone)}?text=${encodeURIComponent(msg)}`,
                    "_blank",
                    "noopener,noreferrer",
                  );
                }}
              >
                WhatsApp'tan gönder
              </button>
            )}
            <button type="button" style={{ fontSize: 12 }} onClick={() => setLinkFor(null)}>
              Kapat
            </button>
          </div>
        </div>
      )}

      {confirmDeleteId && (
        <ConfirmDialog
          title="Gösterim silinsin mi?"
          message="Gösterim kaydı çöp kutusuna taşınır. Islak imzalı belge taraması varsa o da birlikte taşınır."
          confirmLabel="Çöp kutusuna taşı"
          onConfirm={() => {
            onDelete(confirmDeleteId);
            setConfirmDeleteId(null);
          }}
          onClose={() => setConfirmDeleteId(null)}
        />
      )}
    </div>
  );
}

// Müşteri kartındaki salt-okur liste - müşteriye gösterilen mülkler.
export function CustomerShowings({ customerId, showings, properties, onOpenPortfolio }) {
  const propertyById = new Map(properties.map((p) => [p.id, p]));
  const list = showings
    .filter((s) => s.customerId === customerId)
    .sort((a, b) => new Date(b.shownAt) - new Date(a.shownAt));
  if (list.length === 0) return null;
  return (
    <div style={{ marginBottom: 16 }}>
      <p style={{ fontSize: 13, fontWeight: 500, margin: "0 0 6px" }}>Gösterilen mülkler</p>
      {list.map((s) => (
        <div key={s.id} onClick={onOpenPortfolio} style={{ cursor: "pointer" }}>
          <ShowingRow
            title={propertyById.get(s.propertyId)?.title || "Silinmiş portföy"}
            subtitle={`${new Date(s.shownAt).toLocaleDateString("tr-TR")} · ${s.method === "elektronik" ? "Elektronik" : "Yerinde"}`}
            showing={s}
          />
        </div>
      ))}
    </div>
  );
}
