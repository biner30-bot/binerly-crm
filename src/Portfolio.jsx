import React, { useEffect, useMemo, useState } from "react";
import { Badge, Modal, ConfirmDialog, InfoTip, AttachmentList, formatTL, uid } from "./shared";
import {
  TRANSACTION_TYPES,
  PROPERTY_STATUSES,
  PROPERTY_TYPE_OPTIONS,
  ROOM_COUNT_OPTIONS,
  PRICE_LABELS,
  FLOOR_SUGGESTIONS,
  PROPERTY_DETAIL_FIELDS,
  DETAIL_GROUP_LABELS,
  AUTHORIZATION_NOTICE_DAYS,
  authorizationStatus,
  transactionLabel,
  propertyStatusMeta,
  checklistFor,
  checklistProgress,
  isChecklistItemDone,
} from "./realEstate";

function ChecklistBar({ progress }) {
  const pct = progress.total ? Math.round((progress.done / progress.total) * 100) : 0;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div
        style={{
          flex: 1,
          height: 6,
          borderRadius: 3,
          background: "var(--surface-1)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: "100%",
            background: pct === 100 ? "var(--text-success)" : "var(--fill-accent)",
          }}
        />
      </div>
      <span style={{ fontSize: 11, color: "var(--text-muted)", whiteSpace: "nowrap" }}>
        Kontrol listesi {progress.done}/{progress.total}
      </span>
    </div>
  );
}

const labelStyle = {
  fontSize: 13,
  color: "var(--text-secondary)",
  display: "flex",
  alignItems: "center",
  gap: 4,
  marginBottom: 4,
};

const sectionTitleStyle = {
  fontSize: 13,
  fontWeight: 600,
  margin: "16px 0 8px",
  paddingTop: 12,
  borderTop: "0.5px solid var(--border)",
};

function formatPropertyPrice(p) {
  if (!p.price) return "Fiyat girilmedi";
  return p.transactionType === "kiralik" ? `${formatTL(p.price)} / ay` : formatTL(p.price);
}

// Kartta gösterilecek uyarılar - yetki bitişi ve aktif ilanda eksik EİDS.
// Kapanmış (satıldı/kiralandı/pasif) portföylerde uyarı gürültü olur, gösterilmez.
export function propertyWarnings(p) {
  if (!["taslak", "aktif", "opsiyonlu"].includes(p.status)) return [];
  const warnings = [];
  const auth = authorizationStatus(p);
  if (!auth) {
    warnings.push({ tone: "warning", label: "Yetki sözleşmesi girilmedi" });
  } else if (auth.expired) {
    warnings.push({ tone: "danger", label: "Yetki süresi doldu" });
  } else if (!auth.autoRenew && auth.daysLeft <= 30) {
    warnings.push({ tone: "danger", label: `Yetki ${auth.daysLeft} gün içinde bitiyor` });
  } else if (auth.autoRenew && auth.daysLeft <= AUTHORIZATION_NOTICE_DAYS + 7) {
    warnings.push({
      tone: "accent",
      label: `Yetki ${auth.end.toLocaleDateString("tr-TR")} tarihinde uzuyor`,
    });
  }
  if (p.status === "aktif" && p.eidsStatus !== "onaylandi") {
    warnings.push({ tone: "warning", label: "EİDS yetkisi yok" });
  }
  return warnings;
}

export function Portfolio({
  properties,
  propertyPrivate,
  customers,
  teamMembers,
  currentUserId,
  currentUserEmail,
  isOwner,
  onSave,
  onDelete,
  attachments,
  onUploadPhotos,
  onReorderPhotos,
  onUploadDoc,
  onDownloadAttachment,
  onDeleteAttachment,
  getSignedUrls,
  notify,
}) {
  const [editing, setEditing] = useState(null);
  const [coverUrls, setCoverUrls] = useState({});

  const photosByProperty = useMemo(() => {
    const map = {};
    for (const a of attachments) {
      if (a.entityType !== "property_photos") continue;
      (map[a.entityId] ||= []).push(a);
    }
    for (const list of Object.values(map)) list.sort(comparePhotos);
    return map;
  }, [attachments]);

  const coverPaths = Object.values(photosByProperty)
    .map((list) => list[0]?.storagePath)
    .filter(Boolean);
  const coverKey = coverPaths.join("|");
  useEffect(() => {
    let cancelled = false;
    getSignedUrls(coverPaths).then((urls) => {
      if (!cancelled) setCoverUrls(urls);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coverKey]);
  const [query, setQuery] = useState("");
  const [txFilter, setTxFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("open");
  const [districtFilter, setDistrictFilter] = useState("all");

  const districts = useMemo(
    () =>
      [...new Set(properties.map((p) => p.district).filter(Boolean))].sort((a, b) =>
        a.localeCompare(b, "tr"),
      ),
    [properties],
  );

  const customerById = useMemo(() => new Map(customers.map((c) => [c.id, c])), [customers]);

  const filtered = properties
    .filter((p) => txFilter === "all" || p.transactionType === txFilter)
    .filter((p) => {
      if (statusFilter === "all") return true;
      if (statusFilter === "open") return ["taslak", "aktif", "opsiyonlu"].includes(p.status);
      return p.status === statusFilter;
    })
    .filter((p) => districtFilter === "all" || p.district === districtFilter)
    .filter((p) => {
      const q = query.trim().toLocaleLowerCase("tr");
      if (!q) return true;
      const owner = customerById.get(p.ownerCustomerId);
      return [p.title, p.neighborhood, p.district, p.city, p.listingRefs?.sahibinden, owner?.name]
        .filter(Boolean)
        .some((v) => String(v).toLocaleLowerCase("tr").includes(q));
    })
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  const canSeePrivate = (p) => isOwner || !p || p.assignedTo === currentUserId;

  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
          flexWrap: "wrap",
          marginBottom: 16,
        }}
      >
        <div>
          <h2 style={{ fontSize: 20, margin: 0 }}>Portföy</h2>
          <p style={{ fontSize: 13, color: "var(--text-muted)", margin: "4px 0 0" }}>
            Satılık, kiralık ve devren kiralık mülkleriniz, mal sahipleri ve yetki durumlarıyla.
          </p>
        </div>
        <button
          onClick={() => setEditing({})}
          style={{ background: "var(--fill-accent)", color: "var(--on-accent)", border: "none" }}
        >
          <i className="ti ti-plus" aria-hidden="true" /> Yeni portföy
        </button>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Başlık, bölge, mal sahibi veya ilan no ara"
          style={{ flex: "1 1 220px" }}
        />
        <select value={txFilter} onChange={(e) => setTxFilter(e.target.value)}>
          <option value="all">Tüm işlem türleri</option>
          {TRANSACTION_TYPES.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="open">Açık portföyler</option>
          <option value="all">Tüm durumlar</option>
          {PROPERTY_STATUSES.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
        {districts.length > 1 && (
          <select value={districtFilter} onChange={(e) => setDistrictFilter(e.target.value)}>
            <option value="all">Tüm ilçeler</option>
            {districts.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        )}
      </div>

      {properties.length === 0 ? (
        <div
          style={{
            textAlign: "center",
            padding: "48px 16px",
            border: "0.5px dashed var(--border)",
            borderRadius: "var(--radius-lg)",
          }}
        >
          <i
            className="ti ti-building-estate"
            style={{ fontSize: 32, color: "var(--text-muted)" }}
            aria-hidden="true"
          />
          <p style={{ fontSize: 15, fontWeight: 600, margin: "8px 0 4px" }}>Henüz portföy yok</p>
          <p style={{ fontSize: 13, color: "var(--text-muted)", margin: "0 0 16px" }}>
            İlk mülkünüzü ekleyin - mal sahibi, yetki sözleşmesi ve ilan bilgileri tek kartta durur.
          </p>
          <button
            onClick={() => setEditing({})}
            style={{ background: "var(--fill-accent)", color: "var(--on-accent)", border: "none" }}
          >
            Yeni portföy
          </button>
        </div>
      ) : filtered.length === 0 ? (
        <p style={{ fontSize: 14, color: "var(--text-muted)" }}>Bu filtrelere uyan portföy yok.</p>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
            gap: 12,
          }}
        >
          {filtered.map((p) => (
            <PropertyCard
              key={p.id}
              property={p}
              owner={customerById.get(p.ownerCustomerId)}
              coverUrl={coverUrls[photosByProperty[p.id]?.[0]?.storagePath]}
              photoCount={photosByProperty[p.id]?.length || 0}
              onClick={() => setEditing(p)}
            />
          ))}
        </div>
      )}

      {editing && (
        <Modal
          title={editing.id ? "Portföyü düzenle" : "Yeni portföy"}
          onClose={() => setEditing(null)}
          wide
        >
          <PropertyForm
            key={editing.id || "new"}
            photoCount={photosByProperty[editing.id]?.length || 0}
            initial={editing.id ? editing : null}
            initialPrivate={editing.id ? propertyPrivate[editing.id] : null}
            canSeePrivate={canSeePrivate(editing.id ? editing : null)}
            customers={customers}
            teamMembers={teamMembers}
            currentUserId={currentUserId}
            currentUserEmail={currentUserEmail}
            onSave={async (p, priv) => {
              const saved = await onSave(p, priv);
              if (!saved) return;
              // Yeni portföyde fotoğraf/belge yüklemek için kaydın var olması
              // gerekiyor - kapatmak yerine düzenleme moduna geçilir.
              if (editing.id) {
                setEditing(null);
              } else {
                setEditing(saved);
                notify("Portföy kaydedildi. Şimdi fotoğraf ve belge ekleyebilirsiniz.", "success");
              }
            }}
            media={
              editing.id ? (
                <PropertyMedia
                  propertyId={editing.id}
                  photos={photosByProperty[editing.id] || []}
                  attachments={attachments}
                  onUploadPhotos={onUploadPhotos}
                  onReorderPhotos={onReorderPhotos}
                  onUploadDoc={onUploadDoc}
                  onDownloadAttachment={onDownloadAttachment}
                  onDeleteAttachment={onDeleteAttachment}
                  getSignedUrls={getSignedUrls}
                  notify={notify}
                />
              ) : (
                <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "0 0 12px" }}>
                  Fotoğraf ve belgeleri ilk kayıttan sonra ekleyebilirsiniz.
                </p>
              )
            }
            onDelete={
              editing.id
                ? async () => {
                    await onDelete(editing.id);
                    setEditing(null);
                  }
                : null
            }
            onCancel={() => setEditing(null)}
          />
        </Modal>
      )}
    </div>
  );
}

function PropertyCard({ property: p, owner, coverUrl, photoCount, onClick }) {
  const status = propertyStatusMeta(p.status);
  const warnings = propertyWarnings(p);
  const location = [p.neighborhood, p.district, p.city].filter(Boolean).join(", ");
  const specs = [
    p.roomCount,
    p.netM2 || p.grossM2 ? `${p.netM2 || p.grossM2} m²` : null,
    p.propertyType,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        textAlign: "left",
        display: "flex",
        flexDirection: "column",
        gap: 6,
        padding: 14,
        background: "var(--surface-2)",
        border: "0.5px solid var(--border)",
        borderRadius: "var(--radius-lg)",
        cursor: "pointer",
        width: "100%",
      }}
    >
      <div
        style={{
          position: "relative",
          margin: "-14px -14px 4px",
          aspectRatio: "4 / 3",
          background: "var(--surface-1)",
          borderRadius: "var(--radius-lg) var(--radius-lg) 0 0",
          overflow: "hidden",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {coverUrl ? (
          <img
            src={coverUrl}
            alt=""
            loading="lazy"
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        ) : (
          <i
            className="ti ti-photo"
            style={{ fontSize: 28, color: "var(--text-muted)" }}
            aria-hidden="true"
          />
        )}
        {photoCount > 0 && (
          <span
            style={{
              position: "absolute",
              right: 8,
              bottom: 8,
              background: "rgba(0,0,0,0.6)",
              color: "#fff",
              fontSize: 11,
              padding: "2px 6px",
              borderRadius: 6,
            }}
          >
            <i className="ti ti-photo" aria-hidden="true" /> {photoCount}
          </span>
        )}
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <Badge tone="accent">{transactionLabel(p.transactionType)}</Badge>
        <Badge tone={status.tone}>{status.label}</Badge>
      </div>
      <span style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary)" }}>{p.title}</span>
      <span style={{ fontSize: 15, fontWeight: 600, color: "var(--text-accent)" }}>
        {formatPropertyPrice(p)}
      </span>
      {location && (
        <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>
          <i className="ti ti-map-pin" aria-hidden="true" /> {location}
        </span>
      )}
      {specs && <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>{specs}</span>}
      {owner && (
        <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
          <i className="ti ti-user" aria-hidden="true" /> Mal sahibi: {owner.name}
        </span>
      )}
      {["taslak", "aktif", "opsiyonlu"].includes(p.status) && (
        <ChecklistBar progress={checklistProgress(p, photoCount)} />
      )}
      {warnings.length > 0 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 2 }}>
          {warnings.map((w) => (
            <Badge key={w.label} tone={w.tone}>
              {w.label}
            </Badge>
          ))}
        </div>
      )}
    </button>
  );
}

function DetailInput({ field, value, onChange }) {
  if (field.type === "select") {
    return (
      <select
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        style={{ width: "100%" }}
      >
        <option value="">-</option>
        {field.options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    );
  }
  if (field.type === "multi") {
    const selected = Array.isArray(value) ? value : [];
    return (
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", paddingTop: 4 }}>
        {field.options.map((o) => (
          <label key={o} style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 4 }}>
            <input
              type="checkbox"
              checked={selected.includes(o)}
              onChange={(e) =>
                onChange(e.target.checked ? [...selected, o] : selected.filter((x) => x !== o))
              }
            />
            {o}
          </label>
        ))}
      </div>
    );
  }
  if (field.type === "textarea") {
    return (
      <textarea
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        rows={3}
        style={{ width: "100%", resize: "vertical" }}
      />
    );
  }
  return (
    <input
      type={field.type === "number" ? "number" : field.type === "date" ? "date" : "text"}
      min={field.type === "number" ? "0" : undefined}
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value)}
      style={{ width: "100%" }}
    />
  );
}

const toNumberOrNull = (v) => (v === "" || v == null || Number.isNaN(Number(v)) ? null : Number(v));

export function PropertyForm({
  initial,
  initialPrivate,
  canSeePrivate,
  customers,
  teamMembers,
  currentUserId,
  currentUserEmail,
  onSave,
  onDelete,
  onCancel,
  media,
  photoCount = 0,
}) {
  const [f, setF] = useState(() => ({
    transactionType: initial?.transactionType || "satilik",
    status: initial?.status || "taslak",
    title: initial?.title || "",
    propertyType: initial?.propertyType || "",
    price: initial?.price ?? "",
    ownerCustomerId: initial?.ownerCustomerId || "",
    assignedTo: initial?.assignedTo || currentUserId || "",
    city: initial?.city || "",
    district: initial?.district || "",
    neighborhood: initial?.neighborhood || "",
    address: initial?.address || "",
    parcelBlock: initial?.parcelBlock || "",
    parcelNo: initial?.parcelNo || "",
    unitNo: initial?.unitNo || "",
    grossM2: initial?.grossM2 ?? "",
    netM2: initial?.netM2 ?? "",
    roomCount: initial?.roomCount || "",
    buildingAge: initial?.buildingAge ?? "",
    floor: initial?.floor || "",
    totalFloors: initial?.totalFloors ?? "",
    description: initial?.description || "",
    authorizationStart: initial?.authorizationStart || "",
    authorizationMonths: initial?.authorizationMonths ?? "",
    authorizationAutoRenew: initial?.authorizationAutoRenew ?? true,
    authorizationExclusive: initial?.authorizationExclusive ?? true,
    eidsStatus: initial?.eidsStatus || "yok",
    eidsDate: initial?.eidsDate || "",
    sahibindenNo: initial?.listingRefs?.sahibinden || "",
    details: initial?.details || {},
    checklist: initial?.checklist || {},
  }));
  const [minPrice, setMinPrice] = useState(initialPrivate?.minPrice ?? "");
  const [privateNote, setPrivateNote] = useState(initialPrivate?.privateNote || "");
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const set = (key) => (e) => setF((prev) => ({ ...prev, [key]: e.target.value }));
  const setDetail = (key, value) =>
    setF((prev) => ({ ...prev, details: { ...prev.details, [key]: value } }));

  const visibleDetailFields = PROPERTY_DETAIL_FIELDS.filter(
    (d) => !d.only || d.only.includes(f.transactionType),
  );
  const auth = authorizationStatus({
    authorizationStart: f.authorizationStart,
    authorizationMonths: Number(f.authorizationMonths) || null,
    authorizationAutoRenew: f.authorizationAutoRenew,
  });
  const checklistItems = checklistFor(f.transactionType);
  const checklistSubject = {
    authorizationStart: f.authorizationStart,
    authorizationMonths: Number(f.authorizationMonths) || null,
    eidsStatus: f.eidsStatus,
    checklist: f.checklist,
  };
  const checklistDone = checklistItems.filter((i) =>
    isChecklistItemDone(i, checklistSubject, photoCount),
  ).length;

  const renderDetailGroup = (group) => {
    const fields = visibleDetailFields.filter((d) => d.group === group);
    if (fields.length === 0) return null;
    return (
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
          gap: 12,
        }}
      >
        {fields.map((d) => (
          <div
            key={d.key}
            style={
              d.type === "textarea" || d.type === "multi" ? { gridColumn: "1 / -1" } : undefined
            }
          >
            <label style={labelStyle}>{d.label}</label>
            <DetailInput field={d} value={f.details[d.key]} onChange={(v) => setDetail(d.key, v)} />
          </div>
        ))}
      </div>
    );
  };

  const field = (key, label, props = {}) => (
    <div style={{ flex: props.flex || "1 1 160px" }}>
      <label style={labelStyle}>{label}</label>
      <input value={f[key]} onChange={set(key)} style={{ width: "100%" }} {...props.input} />
    </div>
  );

  // Seçenek listesinde olmayan eski/elle girilmiş bir değer select'te
  // kaybolmasın diye listeye eklenir.
  const withCurrent = (options, current) =>
    current && !options.includes(current) ? [current, ...options] : options;

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (!f.title.trim() || saving) return;
        setSaving(true);
        const cleanDetails = Object.fromEntries(
          Object.entries(f.details).filter(
            ([, v]) => v !== "" && v != null && !(Array.isArray(v) && v.length === 0),
          ),
        );
        await onSave(
          {
            id: initial?.id || uid(),
            transactionType: f.transactionType,
            status: f.status,
            title: f.title.trim(),
            propertyType: f.propertyType || null,
            price: toNumberOrNull(f.price),
            ownerCustomerId: f.ownerCustomerId || null,
            assignedTo: f.assignedTo || null,
            city: f.city.trim() || null,
            district: f.district.trim() || null,
            neighborhood: f.neighborhood.trim() || null,
            address: f.address.trim() || null,
            parcelBlock: f.parcelBlock.trim() || null,
            parcelNo: f.parcelNo.trim() || null,
            unitNo: f.unitNo.trim() || null,
            grossM2: toNumberOrNull(f.grossM2),
            netM2: toNumberOrNull(f.netM2),
            roomCount: f.roomCount || null,
            buildingAge: toNumberOrNull(f.buildingAge),
            floor: f.floor.trim() || null,
            totalFloors: toNumberOrNull(f.totalFloors),
            description: f.description.trim() || null,
            authorizationStart: f.authorizationStart || null,
            authorizationMonths: toNumberOrNull(f.authorizationMonths),
            authorizationAutoRenew: f.authorizationAutoRenew,
            authorizationExclusive: f.authorizationExclusive,
            eidsStatus: f.eidsStatus,
            eidsDate: f.eidsStatus === "onaylandi" ? f.eidsDate || null : null,
            listingRefs: {
              ...(initial?.listingRefs || {}),
              sahibinden: f.sahibindenNo.trim() || undefined,
            },
            details: cleanDetails,
            checklist: f.checklist,
          },
          canSeePrivate
            ? { minPrice: toNumberOrNull(minPrice), privateNote: privateNote.trim() || null }
            : null,
        );
        setSaving(false);
      }}
    >
      <div style={{ marginBottom: 12 }}>
        <label style={labelStyle}>İşlem türü</label>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {TRANSACTION_TYPES.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setF((prev) => ({ ...prev, transactionType: t.id }))}
              style={
                f.transactionType === t.id
                  ? { background: "var(--fill-accent)", color: "var(--on-accent)", border: "none" }
                  : undefined
              }
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>
      <div style={{ marginBottom: 12 }}>
        <label style={labelStyle}>Başlık</label>
        <input
          value={f.title}
          onChange={set("title")}
          placeholder="Örn. Merkezde 2+1 site içi daire"
          style={{ width: "100%" }}
          autoFocus
        />
      </div>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
        <div style={{ flex: "1 1 160px" }}>
          <label style={labelStyle}>Mülk tipi</label>
          <select value={f.propertyType} onChange={set("propertyType")} style={{ width: "100%" }}>
            <option value="">-</option>
            {withCurrent(PROPERTY_TYPE_OPTIONS, f.propertyType).map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </div>
        {field("price", PRICE_LABELS[f.transactionType], { input: { type: "number", min: "0" } })}
        <div style={{ flex: "1 1 140px" }}>
          <label style={labelStyle}>Durum</label>
          <select value={f.status} onChange={set("status")} style={{ width: "100%" }}>
            {PROPERTY_STATUSES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
        <div style={{ flex: "1 1 200px" }}>
          <label style={labelStyle}>
            Mal sahibi
            <InfoTip text="Mülkün sahibi (veya devren kiralıkta devreden). Önce Müşteriler'e kaydedin, buradan seçin - müşteri kartında mülkleri listelenir." />
          </label>
          <select
            value={f.ownerCustomerId}
            onChange={set("ownerCustomerId")}
            style={{ width: "100%" }}
          >
            <option value="">Seçilmedi</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        {teamMembers.length > 0 && (
          <div style={{ flex: "1 1 200px" }}>
            <label style={labelStyle}>Sorumlu danışman</label>
            <select value={f.assignedTo} onChange={set("assignedTo")} style={{ width: "100%" }}>
              <option value="">Atanmamış</option>
              {currentUserId && <option value={currentUserId}>Ben ({currentUserEmail})</option>}
              {teamMembers
                .filter((m) => m.id !== currentUserId)
                .map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name || m.email}
                  </option>
                ))}
              {f.assignedTo &&
                f.assignedTo !== currentUserId &&
                !teamMembers.some((m) => m.id === f.assignedTo) && (
                  <option value={f.assignedTo}>Eski üye (takımdan çıkarılmış)</option>
                )}
            </select>
          </div>
        )}
      </div>

      <p style={sectionTitleStyle}>Konum</p>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
        {field("city", "İl")}
        {field("district", "İlçe")}
        {field("neighborhood", "Mahalle")}
      </div>
      <div style={{ marginBottom: 12 }}>
        <label style={labelStyle}>Açık adres</label>
        <textarea
          value={f.address}
          onChange={set("address")}
          rows={2}
          style={{ width: "100%", resize: "vertical" }}
        />
      </div>

      <p style={sectionTitleStyle}>Ölçüler ve bina</p>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
        {field("grossM2", "Brüt m²", { input: { type: "number", min: "0" } })}
        {field("netM2", "Net m²", { input: { type: "number", min: "0" } })}
        <div style={{ flex: "1 1 120px" }}>
          <label style={labelStyle}>Oda sayısı</label>
          <select value={f.roomCount} onChange={set("roomCount")} style={{ width: "100%" }}>
            <option value="">-</option>
            {withCurrent(ROOM_COUNT_OPTIONS, f.roomCount).map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
        {field("buildingAge", "Bina yaşı", { input: { type: "number", min: "0" } })}
        {field("floor", "Bulunduğu kat", { input: { list: "property-floor-options" } })}
        {field("totalFloors", "Kat sayısı", { input: { type: "number", min: "0" } })}
        <datalist id="property-floor-options">
          {FLOOR_SUGGESTIONS.map((o) => (
            <option key={o} value={o} />
          ))}
        </datalist>
      </div>
      {renderDetailGroup("bina")}

      <p style={sectionTitleStyle}>{DETAIL_GROUP_LABELS.ic}</p>
      {renderDetailGroup("ic")}

      <p style={sectionTitleStyle}>{DETAIL_GROUP_LABELS.tapu}</p>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
        {field("parcelBlock", "Ada")}
        {field("parcelNo", "Parsel")}
        {field("unitNo", "Bağımsız bölüm no")}
      </div>
      {renderDetailGroup("tapu")}

      {f.transactionType !== "satilik" && (
        <>
          <p style={sectionTitleStyle}>{DETAIL_GROUP_LABELS.kira}</p>
          {renderDetailGroup("kira")}
        </>
      )}

      <p style={sectionTitleStyle}>Yetki sözleşmesi ve ilan</p>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 8 }}>
        {field("authorizationStart", "Yetki başlangıcı", { input: { type: "date" } })}
        {field("authorizationMonths", "Süre (ay)", { input: { type: "number", min: "1" } })}
      </div>
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 8 }}>
        <label style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}>
          <input
            type="checkbox"
            checked={f.authorizationAutoRenew}
            onChange={(e) =>
              setF((prev) => ({ ...prev, authorizationAutoRenew: e.target.checked }))
            }
          />
          Fesih bildirilmezse kendiliğinden uzar
          <InfoTip
            text={`Yetki sözleşmelerinde yaygın kayıt: bitişten ${AUTHORIZATION_NOTICE_DAYS} gün önce yazılı fesih bildirimi yapılmazsa sözleşme aynı süreyle uzar.`}
          />
        </label>
        <label style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}>
          <input
            type="checkbox"
            checked={f.authorizationExclusive}
            onChange={(e) =>
              setF((prev) => ({ ...prev, authorizationExclusive: e.target.checked }))
            }
          />
          Münhasır (tek yetkili)
        </label>
      </div>
      {auth && (
        <p
          style={{
            fontSize: 12,
            color: auth.expired ? "var(--text-danger)" : "var(--text-muted)",
            margin: "0 0 12px",
          }}
        >
          {auth.expired
            ? `Yetki süresi ${auth.end.toLocaleDateString("tr-TR")} tarihinde doldu.`
            : auth.autoRenew
              ? `Mevcut dönem ${auth.end.toLocaleDateString("tr-TR")} tarihinde bitiyor, fesih bildirilmezse kendiliğinden uzar.`
              : `Yetki ${auth.end.toLocaleDateString("tr-TR")} tarihinde bitiyor (${auth.daysLeft} gün kaldı).`}
        </p>
      )}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
        <div style={{ flex: "1 1 160px" }}>
          <label style={labelStyle}>
            EİDS yetkisi
            <InfoTip text="İnternette emlak ilanı verebilmek için mal sahibinin e-Devlet üzerinden Elektronik İlan Doğrulama Sistemi (EİDS) ile yetki vermesi gerekir." />
          </label>
          <select value={f.eidsStatus} onChange={set("eidsStatus")} style={{ width: "100%" }}>
            <option value="yok">Alınmadı</option>
            <option value="bekliyor">Mal sahibinden bekleniyor</option>
            <option value="onaylandi">Onaylandı</option>
          </select>
        </div>
        {f.eidsStatus === "onaylandi" &&
          field("eidsDate", "EİDS onay tarihi", { input: { type: "date" } })}
        {field("sahibindenNo", "Sahibinden ilan no")}
      </div>

      <p style={sectionTitleStyle}>
        Portföy alım kontrol listesi ({checklistDone}/{checklistItems.length})
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 12 }}>
        {checklistItems.map((item) => {
          const done = isChecklistItemDone(item, checklistSubject, photoCount);
          const doneAt = !item.auto && f.checklist[item.key];
          return (
            <label
              key={item.key}
              style={{
                fontSize: 13,
                display: "flex",
                alignItems: "center",
                gap: 8,
                color: item.auto ? "var(--text-secondary)" : undefined,
              }}
            >
              <input
                type="checkbox"
                checked={done}
                disabled={!!item.auto}
                onChange={(e) =>
                  setF((prev) => {
                    const next = { ...prev.checklist };
                    if (e.target.checked) next[item.key] = new Date().toISOString().slice(0, 10);
                    else delete next[item.key];
                    return { ...prev, checklist: next };
                  })
                }
              />
              <span style={{ flex: 1 }}>{item.label}</span>
              {item.auto ? (
                <span style={{ fontSize: 11, color: "var(--text-muted)" }}>otomatik</span>
              ) : doneAt ? (
                <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                  {new Date(`${doneAt}T00:00:00`).toLocaleDateString("tr-TR")}
                </span>
              ) : null}
            </label>
          );
        })}
      </div>

      <p style={sectionTitleStyle}>Açıklama</p>
      <textarea
        value={f.description}
        onChange={set("description")}
        rows={5}
        placeholder="İlan açıklaması, öne çıkan özellikler, konum avantajları..."
        style={{ width: "100%", resize: "vertical", marginBottom: 12 }}
      />

      {media}

      {canSeePrivate && (
        <div
          style={{
            border: "0.5px solid var(--border)",
            borderRadius: 8,
            padding: 12,
            marginBottom: 16,
            background: "var(--surface-1)",
          }}
        >
          <p
            style={{
              fontSize: 13,
              fontWeight: 600,
              margin: "0 0 4px",
              display: "flex",
              gap: 6,
              alignItems: "center",
            }}
          >
            <i className="ti ti-lock" aria-hidden="true" /> Gizli bilgiler
          </p>
          <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "0 0 10px" }}>
            Sadece ofis sahibi ve bu portföyün sorumlu danışmanı görür. İlan metinlerine ve
            müşteriyle paylaşılan hiçbir belgeye eklenmez.
          </p>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 8 }}>
            <div style={{ flex: "1 1 180px" }}>
              <label style={labelStyle}>Mal sahibinin inebileceği son fiyat (TL)</label>
              <input
                type="number"
                min="0"
                value={minPrice}
                onChange={(e) => setMinPrice(e.target.value)}
                style={{ width: "100%" }}
              />
            </div>
          </div>
          <label style={labelStyle}>Gizli not</label>
          <textarea
            value={privateNote}
            onChange={(e) => setPrivateNote(e.target.value)}
            rows={3}
            placeholder="Mal sahibinin beklentileri, kiracı tercihleri, pazarlık notları..."
            style={{ width: "100%", resize: "vertical" }}
          />
        </div>
      )}

      <div
        style={{ display: "flex", gap: 8, justifyContent: "space-between", alignItems: "center" }}
      >
        <div>
          {onDelete && (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              style={{ color: "var(--text-danger)" }}
            >
              Sil
            </button>
          )}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" onClick={onCancel}>
            Vazgeç
          </button>
          <button
            type="submit"
            disabled={!f.title.trim() || saving}
            style={{ background: "var(--fill-accent)", color: "var(--on-accent)", border: "none" }}
          >
            {saving ? "Kaydediliyor…" : "Kaydet"}
          </button>
        </div>
      </div>
      {confirmDelete && (
        <ConfirmDialog
          message={`"${initial?.title}" portföyü çöp kutusuna taşınsın mı? Fotoğrafları ve belgeleri de birlikte taşınır, Çöp Kutusu'ndan geri yükleyebilirsiniz.`}
          confirmLabel="Çöp kutusuna taşı"
          onConfirm={async () => {
            setConfirmDelete(false);
            await onDelete();
          }}
          onClose={() => setConfirmDelete(false)}
        />
      )}
    </form>
  );
}

function comparePhotos(a, b) {
  return (
    (a.sortOrder ?? 1e9) - (b.sortOrder ?? 1e9) || new Date(a.createdAt) - new Date(b.createdAt)
  );
}

const PHOTO_MAX_SIDE = 1920;

// İlan fotoğrafları yüklenmeden önce tarayıcıda küçültülür: telefon/fotoğraf
// makinesi çıktıları 5-15 MB, Supabase ücretsiz planda depolama 1 GB. Uzun
// kenar 1920 px + WebP ile fotoğraf başına ~200-300 KB'a iner - portallar da
// zaten bu boyutun üstünü küçültüyor. WebP kodlayamayan eski tarayıcılarda
// toBlob sessizce PNG döner (daha büyük), o durumda JPEG'e düşülür.
async function compressImage(file) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, PHOTO_MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  const toBlob = (type, quality) => new Promise((resolve) => canvas.toBlob(resolve, type, quality));
  let blob = await toBlob("image/webp", 0.82);
  let ext = "webp";
  if (!blob || blob.type !== "image/webp") {
    blob = await toBlob("image/jpeg", 0.85);
    ext = "jpg";
  }
  const baseName = file.name.replace(/\.[^.]+$/, "");
  return new File([blob], `${baseName}.${ext}`, { type: blob.type });
}

function PropertyMedia({
  propertyId,
  photos,
  attachments,
  onUploadPhotos,
  onReorderPhotos,
  onUploadDoc,
  onDownloadAttachment,
  onDeleteAttachment,
  getSignedUrls,
  notify,
}) {
  const [urls, setUrls] = useState({});
  const [uploading, setUploading] = useState(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [dragId, setDragId] = useState(null);

  const pathKey = photos.map((p) => p.storagePath).join("|");
  useEffect(() => {
    let cancelled = false;
    getSignedUrls(photos.map((p) => p.storagePath)).then((u) => {
      if (!cancelled) setUrls(u);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathKey]);

  const handleFiles = async (e) => {
    const files = [...(e.target.files || [])];
    e.target.value = "";
    if (files.length === 0) return;
    const images = files.filter((f) => f.type.startsWith("image/"));
    if (images.length < files.length)
      notify("Sadece fotoğraf dosyaları yüklenebilir, diğerleri atlandı.");
    const compressed = [];
    for (let i = 0; i < images.length; i++) {
      setUploading(`Hazırlanıyor ${i + 1}/${images.length}`);
      try {
        compressed.push(await compressImage(images[i]));
      } catch {
        notify(
          `"${images[i].name}" okunamadı (desteklenmeyen format olabilir, JPEG olarak deneyin).`,
        );
      }
    }
    setUploading(`Yükleniyor (${compressed.length} fotoğraf)`);
    await onUploadPhotos(propertyId, compressed);
    setUploading(null);
  };

  const ordered = photos.map((p) => p.id);
  const move = (id, toIndex) => {
    const rest = ordered.filter((x) => x !== id);
    rest.splice(Math.max(0, Math.min(toIndex, rest.length)), 0, id);
    onReorderPhotos(rest);
  };

  const smallButton = { fontSize: 11, padding: "2px 6px" };

  return (
    <div style={{ marginBottom: 12 }}>
      <p style={sectionTitleStyle}>İlan fotoğrafları</p>
      {photos.length > 0 && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))",
            gap: 8,
            marginBottom: 8,
          }}
        >
          {photos.map((p, i) => (
            <div
              key={p.id}
              draggable
              onDragStart={() => setDragId(p.id)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (dragId && dragId !== p.id) move(dragId, ordered.indexOf(p.id));
                setDragId(null);
              }}
              style={{
                border: i === 0 ? "2px solid var(--fill-accent)" : "0.5px solid var(--border)",
                borderRadius: 8,
                overflow: "hidden",
                background: "var(--surface-1)",
                opacity: dragId === p.id ? 0.5 : 1,
                cursor: "grab",
              }}
            >
              <div style={{ aspectRatio: "4 / 3", position: "relative" }}>
                {urls[p.storagePath] ? (
                  <img
                    src={urls[p.storagePath]}
                    alt={p.fileName}
                    draggable={false}
                    style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                  />
                ) : null}
                {i === 0 && (
                  <span
                    style={{
                      position: "absolute",
                      left: 4,
                      top: 4,
                      background: "var(--fill-accent)",
                      color: "var(--on-accent)",
                      fontSize: 10,
                      padding: "1px 5px",
                      borderRadius: 4,
                    }}
                  >
                    Kapak
                  </span>
                )}
              </div>
              <div style={{ display: "flex", gap: 4, padding: 4, justifyContent: "space-between" }}>
                <span style={{ display: "flex", gap: 2 }}>
                  <button
                    type="button"
                    style={smallButton}
                    disabled={i === 0}
                    onClick={() => move(p.id, i - 1)}
                    aria-label="Sola taşı"
                  >
                    <i className="ti ti-chevron-left" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    style={smallButton}
                    disabled={i === photos.length - 1}
                    onClick={() => move(p.id, i + 1)}
                    aria-label="Sağa taşı"
                  >
                    <i className="ti ti-chevron-right" aria-hidden="true" />
                  </button>
                </span>
                <span style={{ display: "flex", gap: 2 }}>
                  {i !== 0 && (
                    <button type="button" style={smallButton} onClick={() => move(p.id, 0)}>
                      Kapak yap
                    </button>
                  )}
                  <button
                    type="button"
                    style={{ ...smallButton, color: "var(--text-danger)" }}
                    onClick={() => setConfirmDeleteId(p.id)}
                    aria-label="Fotoğrafı sil"
                  >
                    <i className="ti ti-trash" aria-hidden="true" />
                  </button>
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
      <label
        style={{
          background: "var(--surface-1)",
          border: "0.5px solid var(--border)",
          borderRadius: "var(--radius)",
          padding: "6px 12px",
          fontSize: 12.5,
          cursor: uploading ? "default" : "pointer",
          display: "inline-block",
        }}
      >
        {uploading || "+ Fotoğraf ekle"}
        <input
          type="file"
          accept="image/*"
          multiple
          onChange={handleFiles}
          disabled={!!uploading}
          style={{ display: "none" }}
        />
      </label>
      <p style={{ fontSize: 11, color: "var(--text-muted)", margin: "4px 0 0" }}>
        Birden fazla seçebilirsiniz. Fotoğraflar yüklenmeden önce otomatik küçültülür (uzun kenar
        1920 px). Sırayı sürükleyerek veya oklarla değiştirin, ilk fotoğraf kapaktır.
      </p>

      <p style={sectionTitleStyle}>Mülk belgeleri</p>
      <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "0 0 8px" }}>
        Tapu, takyidat, iskan, imzalı yetki sözleşmesi gibi belgeler. Orijinal kalitede saklanır,
        sadece ofis içinde görünür - kişisel veri içerdiği için hiçbir yerde yayınlanmaz.
      </p>
      <AttachmentList
        entityType="property_docs"
        entityId={propertyId}
        attachments={attachments}
        onUpload={onUploadDoc}
        onDownload={onDownloadAttachment}
        onDelete={onDeleteAttachment}
      />

      {confirmDeleteId && (
        <ConfirmDialog
          title="Fotoğraf silinsin mi?"
          message="Bu fotoğraf çöp kutusuna taşınır."
          onConfirm={() => {
            onDeleteAttachment(confirmDeleteId);
            setConfirmDeleteId(null);
          }}
          onClose={() => setConfirmDeleteId(null)}
        />
      )}
    </div>
  );
}
