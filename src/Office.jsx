import React, { useState } from "react";
import { Badge, ConfirmDialog, InfoTip } from "./shared";
import { OFFICE_DOC_TYPES } from "./Portfolio";

// Emlak ofisi: danışmanlar bağımsız çalışır, ofis sadece portföy paylaşımı,
// ortak bölge fiyatları ve sözleşme arşivi içindir. Broker danışmanın
// müşteri/teklif/ciro verisini görmez (kullanıcı kararı, 24 Kas 2026).

const box = {
  border: "0.5px solid var(--border)",
  borderRadius: 8,
  padding: 14,
  marginBottom: 12,
  background: "var(--surface-1)",
};
const labelStyle = {
  fontSize: 12,
  color: "var(--text-secondary)",
  display: "block",
  marginBottom: 4,
};
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString("tr-TR") : "");

function SharedScope() {
  return (
    <div style={{ ...box, background: "var(--surface-2, var(--surface-1))", fontSize: 13 }}>
      <p style={{ margin: "0 0 6px", fontWeight: 600 }}>Ofiste neler paylaşılır?</p>
      <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.6 }}>
        <li>
          <b>Portföyler</b> - diğer danışmanlar görür ama düzenleyemez. Mal sahibi bilgisi, en düşük
          fiyat, gizli not ve tapu gibi belgeler görünmez. İstediğiniz portföyü ofiste
          gizleyebilirsiniz.
        </li>
        <li>
          <b>Bölge fiyatları</b> - biri Sahibinden'den mahalle yapıştırınca herkes kullanır.
        </li>
        <li>
          <b>Yetki ve aracılık sözleşmeleri</b> - yüklediğiniz imzalı sözleşmenin bir kopyası ofis
          arşivine gider; ofisten ayrılsanız da arşivde kalır.
        </li>
      </ul>
      <p style={{ margin: "8px 0 0", color: "var(--text-muted)" }}>
        Müşterileriniz, teklif ve hizmet bedelleriniz, gösterimleriniz, görevleriniz ve piyasa
        analizleriniz sadece sizdedir - broker dahil kimse göremez.
      </p>
    </div>
  );
}

function NoOffice({ defaultName, defaultPhone, onCreate, onJoin }) {
  const [mode, setMode] = useState("join");
  const [name, setName] = useState(defaultName || "");
  const [phone, setPhone] = useState(defaultPhone || "");
  const [officeName, setOfficeName] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const run = async (fn) => {
    setBusy(true);
    await fn();
    setBusy(false);
  };
  return (
    <>
      <p style={{ fontSize: 13, color: "var(--text-muted)", margin: "0 0 12px" }}>
        Şu an bağımsız çalışıyorsunuz - Binerly'yi ofissiz de kullanabilirsiniz. Bir ofisle
        çalışıyorsanız broker'ınızdan davet kodunu alıp katılın; broker'sanız ofisinizi kurun.
      </p>
      <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
        {[
          ["join", "Ofise katıl"],
          ["create", "Ofis kur (broker)"],
        ].map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setMode(id)}
            style={
              mode === id
                ? { background: "var(--fill-accent)", color: "var(--on-accent)", border: "none" }
                : undefined
            }
          >
            {label}
          </button>
        ))}
      </div>
      <div style={box}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
          {mode === "create" ? (
            <div style={{ flex: "2 1 220px" }}>
              <label style={labelStyle}>Ofis adı</label>
              <input
                value={officeName}
                onChange={(e) => setOfficeName(e.target.value)}
                style={{ width: "100%" }}
              />
            </div>
          ) : (
            <div style={{ flex: "1 1 160px" }}>
              <label style={labelStyle}>Davet kodu</label>
              <input
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="ör. 7F3A9C21"
                style={{ width: "100%", letterSpacing: 1 }}
              />
            </div>
          )}
          <div style={{ flex: "1 1 180px" }}>
            <label style={labelStyle}>
              Adınız
              <InfoTip text="Ofisteki diğer danışmanlar portföy kartınızda 'sorumlu danışman' olarak bu adı ve telefonu görür." />
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={{ width: "100%" }}
            />
          </div>
          <div style={{ flex: "1 1 150px" }}>
            <label style={labelStyle}>Telefon</label>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              style={{ width: "100%" }}
            />
          </div>
        </div>
        <button
          type="button"
          disabled={
            busy ||
            !name.trim() ||
            (mode === "create" ? officeName.trim().length < 2 : code.trim().length < 6)
          }
          onClick={() =>
            run(() =>
              mode === "create" ? onCreate(officeName, name, phone) : onJoin(code, name, phone),
            )
          }
          style={{ background: "var(--fill-accent)", color: "var(--on-accent)", border: "none" }}
        >
          {busy ? "Bekleyin…" : mode === "create" ? "Ofisi kur" : "Ofise katıl"}
        </button>
      </div>
    </>
  );
}

function DocArchive({ docs, isBroker, onDownload, onDelete }) {
  const [type, setType] = useState("all");
  const [q, setQ] = useState("");
  const query = q.trim().toLocaleLowerCase("tr");
  const list = docs
    .filter((d) => type === "all" || d.docType === type)
    .filter(
      (d) =>
        !query ||
        [d.propertyTitle, d.uploaderName, d.fileName]
          .filter(Boolean)
          .some((x) => x.toLocaleLowerCase("tr").includes(query)),
    );
  return (
    <div style={box}>
      <p style={{ margin: "0 0 4px", fontSize: 13, fontWeight: 600 }}>
        Sözleşme arşivi ({docs.length})
        <InfoTip
          text={
            isBroker
              ? "Danışmanların portföy formundan yüklediği imzalı yetki/aracılık sözleşmeleri ve yer gösterme belgeleri. Danışman ayrılsa da burada kalır."
              : "Sizin ofis arşivine yüklediğiniz belgeler. Broker tüm arşivi görür; ofisten ayrılsanız da kopya ofiste kalır."
          }
        />
      </p>
      <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "0 0 8px" }}>
        Belge eklemek için Portföy'de ilgili portföyü açıp "Ofis sözleşme arşivi" bölümünü kullanın.
      </p>
      {docs.length > 0 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Portföy, danışman veya dosya ara"
            style={{ flex: "1 1 220px" }}
          />
          <select value={type} onChange={(e) => setType(e.target.value)}>
            <option value="all">Tüm belgeler</option>
            {OFFICE_DOC_TYPES.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
      )}
      {list.map((d) => (
        <div
          key={d.id}
          style={{
            display: "flex",
            gap: 8,
            alignItems: "center",
            flexWrap: "wrap",
            fontSize: 13,
            padding: "6px 0",
            borderTop: "0.5px solid var(--border)",
          }}
        >
          <span style={{ flex: "1 1 260px" }}>
            <b>{OFFICE_DOC_TYPES.find((t) => t.id === d.docType)?.label}</b> ·{" "}
            {d.propertyTitle || "portföy silinmiş"}
            <span style={{ color: "var(--text-muted)" }}>
              {" "}
              · {d.uploaderName} · {fmtDate(d.createdAt)} · {d.fileName}
            </span>
          </span>
          <button type="button" style={{ fontSize: 12 }} onClick={() => onDownload(d)}>
            Aç
          </button>
          {isBroker && (
            <button
              type="button"
              style={{ fontSize: 12, color: "var(--text-danger)" }}
              onClick={() => onDelete(d)}
            >
              Sil
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

export function OfficeTab({
  office,
  currentUserId,
  defaultName,
  defaultPhone,
  onCreate,
  onJoin,
  onLeave,
  onRemoveMember,
  onResetInvite,
  onUpdateMe,
  docs = [],
  onDownloadDoc,
  onDeleteDoc,
}) {
  const [confirm, setConfirm] = useState(null);
  const [editMe, setEditMe] = useState(null);
  const [codeVisible, setCodeVisible] = useState(false);

  if (office === undefined)
    return <p style={{ fontSize: 13, color: "var(--text-muted)" }}>Yükleniyor…</p>;

  const isBroker = office?.office?.brokerId === currentUserId;
  const active = (office?.members || []).filter((m) => !m.leftAt);
  const former = (office?.members || []).filter((m) => m.leftAt);

  return (
    <div>
      <h2 style={{ fontSize: 20, margin: "0 0 4px" }}>Ofis</h2>
      {!office ? (
        <>
          <NoOffice
            defaultName={defaultName}
            defaultPhone={defaultPhone}
            onCreate={onCreate}
            onJoin={onJoin}
          />
          <SharedScope />
        </>
      ) : (
        <>
          <p style={{ fontSize: 13, color: "var(--text-muted)", margin: "0 0 12px" }}>
            <b style={{ color: "var(--text-primary)" }}>{office.office.name}</b> ·{" "}
            {isBroker ? "Broker'sınız" : "Danışman olarak katıldınız"} · {active.length} aktif
            danışman
          </p>

          {isBroker && (
            <div style={box}>
              <p style={{ margin: "0 0 6px", fontSize: 13, fontWeight: 600 }}>Davet kodu</p>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <code style={{ fontSize: 18, letterSpacing: 2 }}>
                  {codeVisible ? office.inviteCode : "••••••••"}
                </code>
                <button
                  type="button"
                  style={{ fontSize: 12 }}
                  onClick={() => setCodeVisible((v) => !v)}
                >
                  {codeVisible ? "Gizle" : "Göster"}
                </button>
                {codeVisible && (
                  <button
                    type="button"
                    style={{ fontSize: 12 }}
                    onClick={() => navigator.clipboard?.writeText(office.inviteCode)}
                  >
                    Kopyala
                  </button>
                )}
                <button
                  type="button"
                  style={{ fontSize: 12 }}
                  onClick={() => setConfirm({ kind: "reset" })}
                >
                  Kodu yenile
                </button>
              </div>
              <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "6px 0 0" }}>
                Danışman Binerly'de Ofis &gt; Ofise katıl'dan bu kodu girer. Kod sızdıysa yenileyin
                - eski kod çalışmaz, katılmış danışmanlar etkilenmez.
              </p>
            </div>
          )}

          <div style={box}>
            <p style={{ margin: "0 0 8px", fontSize: 13, fontWeight: 600 }}>Danışmanlar</p>
            {active.map((m) => (
              <div
                key={m.userId}
                style={{
                  display: "flex",
                  gap: 8,
                  alignItems: "center",
                  flexWrap: "wrap",
                  fontSize: 13,
                  padding: "6px 0",
                  borderTop: "0.5px solid var(--border)",
                }}
              >
                <span style={{ flex: "1 1 220px" }}>
                  <b>{m.displayName || m.email}</b>
                  {m.userId === currentUserId && " (siz)"}{" "}
                  {m.role === "broker" && <Badge tone="accent">Broker</Badge>}
                  <span style={{ color: "var(--text-muted)" }}>
                    {" "}
                    · {[m.phone, m.email].filter(Boolean).join(" · ")} · katılış{" "}
                    {fmtDate(m.joinedAt)}
                  </span>
                </span>
                {m.userId === currentUserId && (
                  <button
                    type="button"
                    style={{ fontSize: 12 }}
                    onClick={() => setEditMe({ displayName: m.displayName, phone: m.phone })}
                  >
                    Bilgilerimi düzenle
                  </button>
                )}
                {isBroker && m.userId !== currentUserId && (
                  <button
                    type="button"
                    style={{ fontSize: 12, color: "var(--text-danger)" }}
                    onClick={() => setConfirm({ kind: "remove", member: m })}
                  >
                    Ofisten çıkar
                  </button>
                )}
              </div>
            ))}
            {editMe && (
              <div
                style={{
                  display: "flex",
                  gap: 8,
                  flexWrap: "wrap",
                  alignItems: "flex-end",
                  marginTop: 8,
                }}
              >
                <div style={{ flex: "1 1 180px" }}>
                  <label style={labelStyle}>Adınız</label>
                  <input
                    value={editMe.displayName}
                    onChange={(e) => setEditMe((p) => ({ ...p, displayName: e.target.value }))}
                    style={{ width: "100%" }}
                  />
                </div>
                <div style={{ flex: "1 1 150px" }}>
                  <label style={labelStyle}>Telefon</label>
                  <input
                    value={editMe.phone}
                    onChange={(e) => setEditMe((p) => ({ ...p, phone: e.target.value }))}
                    style={{ width: "100%" }}
                  />
                </div>
                <button
                  type="button"
                  disabled={!editMe.displayName.trim()}
                  onClick={async () => {
                    if (await onUpdateMe(editMe)) setEditMe(null);
                  }}
                >
                  Kaydet
                </button>
                <button type="button" onClick={() => setEditMe(null)}>
                  Vazgeç
                </button>
              </div>
            )}
            {isBroker && former.length > 0 && (
              <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "8px 0 0" }}>
                Ayrılan danışmanlar: {former.map((m) => m.displayName || m.email).join(", ")}{" "}
                (yükledikleri sözleşmeler arşivde kalır)
              </p>
            )}
          </div>

          <DocArchive
            docs={docs}
            isBroker={isBroker}
            onDownload={onDownloadDoc}
            onDelete={(d) => setConfirm({ kind: "deleteDoc", doc: d })}
          />

          <SharedScope />

          <button
            type="button"
            style={{ fontSize: 12.5, color: "var(--text-danger)" }}
            onClick={() => setConfirm({ kind: "leave" })}
          >
            Ofisten ayrıl
          </button>
        </>
      )}

      {confirm?.kind === "leave" && (
        <ConfirmDialog
          title="Ofisten ayrılınsın mı?"
          message={
            isBroker && active.length > 1
              ? "Ofiste başka danışmanlar varken broker ayrılamaz - önce onları çıkarın."
              : "Portföyleriniz artık ofiste görünmez ve ofisin ortak bölge fiyatlarını kullanamazsınız. Kendi müşterileriniz, portföyleriniz ve analizleriniz sizde kalır. Yüklediğiniz yetki/aracılık sözleşmelerinin kopyası ofis arşivinde kalır."
          }
          confirmLabel="Ayrıl"
          onConfirm={async () => {
            setConfirm(null);
            await onLeave();
          }}
          onClose={() => setConfirm(null)}
        />
      )}
      {confirm?.kind === "remove" && (
        <ConfirmDialog
          title="Danışman ofisten çıkarılsın mı?"
          message={`${confirm.member.displayName || confirm.member.email} ofisten çıkarılır. Portföyleri ofiste görünmez olur; kendi hesabı ve verileri ona aittir, etkilenmez. Yüklediği sözleşmelerin kopyası ofis arşivinde kalır.`}
          confirmLabel="Çıkar"
          onConfirm={async () => {
            const m = confirm.member;
            setConfirm(null);
            await onRemoveMember(m.userId);
          }}
          onClose={() => setConfirm(null)}
        />
      )}
      {confirm?.kind === "deleteDoc" && (
        <ConfirmDialog
          title="Belge arşivden silinsin mi?"
          message={`"${confirm.doc.fileName}" ofis arşivinden kalıcı olarak silinir. Danışmanın kendi portföy belgelerindeki kopya etkilenmez.`}
          onConfirm={async () => {
            const d = confirm.doc;
            setConfirm(null);
            await onDeleteDoc(d);
          }}
          onClose={() => setConfirm(null)}
        />
      )}
      {confirm?.kind === "reset" && (
        <ConfirmDialog
          title="Davet kodu yenilensin mi?"
          message="Eski kod artık çalışmaz. Ofisteki danışmanlar etkilenmez."
          confirmLabel="Yenile"
          onConfirm={async () => {
            setConfirm(null);
            await onResetInvite();
            setCodeVisible(true);
          }}
          onClose={() => setConfirm(null)}
        />
      )}
    </div>
  );
}
