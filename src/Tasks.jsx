import React, { useState } from "react";
import { Badge, Modal, InfoTip, ConfirmDialog, IconButton, uid } from "./shared";

export const TASK_TYPES = [
  { id: "arama", label: "Arama", icon: "ti-phone" },
  { id: "toplanti", label: "Toplantı", icon: "ti-users" },
  { id: "eposta", label: "E-posta", icon: "ti-mail" },
  { id: "diger", label: "Diğer", icon: "ti-checkbox" },
];

const ASSIGNEE_INFO_TEXT =
  "Görev bir takım üyesine atanabilir, atanan kişi son tarihte e-posta hatırlatması alır.";

function taskDueInfo(dueDate, completedAt) {
  if (completedAt || !dueDate) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(`${dueDate}T00:00:00`);
  const diffDays = Math.round((due - today) / 86400000);
  const dateLabel = due.toLocaleDateString("tr-TR");
  if (diffDays < 0) return { label: `Gecikti (${dateLabel})`, tone: "danger" };
  if (diffDays === 0) return { label: "Bugün", tone: "warning" };
  if (diffDays <= 7) return { label: dateLabel, tone: "accent" };
  return { label: dateLabel, tone: "default" };
}

export function TaskForm({
  customers,
  deals,
  teamMembers,
  currentUserId,
  currentUserEmail,
  initial,
  onSave,
  onCancel,
}) {
  const [title, setTitle] = useState(initial?.title || "");
  const [type, setType] = useState(initial?.type || "diger");
  const [dueDate, setDueDate] = useState(initial?.dueDate || "");
  const [customerId, setCustomerId] = useState(initial?.customerId || "");
  const [dealId, setDealId] = useState(initial?.dealId || "");
  const [assignedTo, setAssignedTo] = useState(initial?.assignedTo || currentUserId || "");
  const [description, setDescription] = useState(initial?.description || "");
  const [saving, setSaving] = useState(false);

  const dealsForCustomer = customerId ? deals.filter((d) => d.customerId === customerId) : deals;

  const labelStyle = {
    fontSize: 13,
    color: "var(--text-secondary)",
    display: "flex",
    alignItems: "center",
    gap: 4,
    marginBottom: 4,
  };

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (!title.trim() || saving) return;
        setSaving(true);
        await onSave({
          id: initial?.id || uid(),
          title: title.trim(),
          type,
          dueDate: dueDate || null,
          customerId: customerId || null,
          dealId: customerId ? dealId || null : null,
          assignedTo: assignedTo || null,
          description: description.trim(),
        });
        setSaving(false);
      }}
    >
      <div style={{ marginBottom: 12 }}>
        <label style={labelStyle}>Başlık</label>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Örn. Teklif için müşteriyi ara"
          style={{ width: "100%" }}
          autoFocus
        />
      </div>
      <div style={{ display: "flex", gap: 12, marginBottom: 12 }}>
        <div style={{ flex: 1 }}>
          <label style={labelStyle}>Tür</label>
          <select value={type} onChange={(e) => setType(e.target.value)} style={{ width: "100%" }}>
            {TASK_TYPES.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
        <div style={{ flex: 1 }}>
          <label style={labelStyle}>Son tarih</label>
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            style={{ width: "100%" }}
          />
        </div>
      </div>
      <div style={{ marginBottom: 12 }}>
        <label style={labelStyle}>Müşteri (opsiyonel)</label>
        <select
          value={customerId}
          onChange={(e) => {
            setCustomerId(e.target.value);
            setDealId("");
          }}
          style={{ width: "100%" }}
        >
          <option value="">Bağlantısız - genel görev</option>
          {customers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
      {customerId && dealsForCustomer.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <label style={labelStyle}>Fırsat (opsiyonel)</label>
          <select
            value={dealId}
            onChange={(e) => setDealId(e.target.value)}
            style={{ width: "100%" }}
          >
            <option value="">Bağlantısız</option>
            {dealsForCustomer.map((d) => (
              <option key={d.id} value={d.id}>
                {d.title}
              </option>
            ))}
          </select>
        </div>
      )}
      {teamMembers.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <label style={labelStyle}>
            Atanan <InfoTip text={ASSIGNEE_INFO_TEXT} />
          </label>
          <select
            value={assignedTo}
            onChange={(e) => setAssignedTo(e.target.value)}
            style={{ width: "100%" }}
          >
            <option value="">Atanmamış</option>
            {currentUserId && <option value={currentUserId}>Ben ({currentUserEmail})</option>}
            {teamMembers
              .filter((m) => m.id !== currentUserId)
              .map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name || m.email}
                </option>
              ))}
            {assignedTo &&
              assignedTo !== currentUserId &&
              !teamMembers.some((m) => m.id === assignedTo) && (
                <option value={assignedTo}>Eski üye (takımdan çıkarılmış)</option>
              )}
          </select>
        </div>
      )}
      <div style={{ marginBottom: 16 }}>
        <label style={labelStyle}>Not (opsiyonel)</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          style={{ width: "100%", resize: "vertical" }}
        />
      </div>
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button
          type="button"
          onClick={onCancel}
          style={{ background: "var(--surface-1)", border: "0.5px solid var(--border)" }}
        >
          Vazgeç
        </button>
        <button
          type="submit"
          disabled={!title.trim() || saving}
          style={{ background: "var(--fill-accent)", color: "var(--on-accent)", border: "none" }}
        >
          Kaydet
        </button>
      </div>
    </form>
  );
}

export default function Tasks({
  tasks,
  customers,
  deals,
  teamMembers,
  currentUserId,
  currentUserEmail,
  onSave,
  onDelete,
  onToggleComplete,
}) {
  const [showForm, setShowForm] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [statusFilter, setStatusFilter] = useState("open");
  const [assigneeFilter, setAssigneeFilter] = useState("all");
  const [search, setSearch] = useState("");

  const customerById = (id) => customers.find((c) => c.id === id);
  const dealById = (id) => deals.find((d) => d.id === id);
  const memberLabel = (id) => {
    if (!id) return null;
    if (id === currentUserId) return `Ben (${currentUserEmail})`;
    const m = teamMembers.find((x) => x.id === id);
    return m ? m.name || m.email : "Eski üye";
  };

  const query = search.trim().toLowerCase();
  const filtered = tasks.filter((t) => {
    if (statusFilter === "open" && t.completedAt) return false;
    if (statusFilter === "done" && !t.completedAt) return false;
    if (assigneeFilter === "mine" && t.assignedTo !== currentUserId) return false;
    if (assigneeFilter === "unassigned" && t.assignedTo) return false;
    if (!query) return true;
    return (
      t.title.toLowerCase().includes(query) ||
      (customerById(t.customerId)?.name || "").toLowerCase().includes(query)
    );
  });

  const sorted = [...filtered].sort((a, b) => {
    if (!!a.completedAt !== !!b.completedAt) return a.completedAt ? 1 : -1;
    if (!a.dueDate && !b.dueDate) return new Date(b.createdAt) - new Date(a.createdAt);
    if (!a.dueDate) return 1;
    if (!b.dueDate) return -1;
    return new Date(a.dueDate) - new Date(b.dueDate);
  });

  const saveTask = async (t) => {
    const ok = await onSave(t);
    // Basarisiz kaydetmede formu kapatmiyoruz - aksi halde kullanicinin
    // az once yazdigi baslik/not hata toast'iyla birlikte kaybolurdu.
    if (ok) {
      setShowForm(false);
      setEditingTask(null);
    }
  };

  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginBottom: 12,
          gap: 8,
          flexWrap: "wrap",
        }}
      >
        <div className="list-toolbar" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Görev ara (başlık, müşteri)..."
            style={{ minWidth: 160 }}
          />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={{ fontSize: 13 }}
          >
            <option value="open">Bekleyen</option>
            <option value="done">Tamamlanan</option>
            <option value="all">Tümü</option>
          </select>
          <select
            value={assigneeFilter}
            onChange={(e) => setAssigneeFilter(e.target.value)}
            style={{ fontSize: 13 }}
          >
            <option value="all">Herkes</option>
            <option value="mine">Bana atananlar</option>
            <option value="unassigned">Atanmamış</option>
          </select>
        </div>
        <button
          onClick={() => {
            setEditingTask(null);
            setShowForm(true);
          }}
          style={{
            background: "var(--fill-accent)",
            color: "var(--on-accent)",
            border: "none",
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <i className="ti ti-plus" style={{ fontSize: 16 }} aria-hidden="true"></i>
          Görev ekle
        </button>
      </div>

      {sorted.length === 0 ? (
        tasks.length === 0 ? (
          <div
            style={{
              background: "var(--surface-1)",
              borderRadius: 12,
              padding: "2rem 1.5rem",
              textAlign: "center",
            }}
          >
            <p style={{ fontWeight: 500, margin: "0 0 4px" }}>Henüz görev eklenmedi</p>
            <p style={{ fontSize: 14, color: "var(--text-secondary)", margin: "0 0 16px" }}>
              Arama, toplantı veya e-posta gibi son tarihli işleri buradan takip edin.
            </p>
            <button
              onClick={() => setShowForm(true)}
              style={{
                background: "var(--fill-accent)",
                color: "var(--on-accent)",
                border: "none",
              }}
            >
              + Yeni Görev
            </button>
          </div>
        ) : (
          <p style={{ fontSize: 14, color: "var(--text-secondary)" }}>
            Filtreyle eşleşen görev yok.
          </p>
        )
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table
            className="responsive-table"
            style={{
              width: "100%",
              minWidth: 600,
              borderCollapse: "separate",
              borderSpacing: "0 8px",
            }}
          >
            <thead>
              <tr>
                <th
                  style={{
                    textAlign: "left",
                    padding: "0 12px",
                    fontSize: 11,
                    fontWeight: 600,
                    color: "var(--text-muted)",
                    textTransform: "uppercase",
                    letterSpacing: 0.3,
                    width: 32,
                  }}
                ></th>
                <th
                  style={{
                    textAlign: "left",
                    padding: "0 12px",
                    fontSize: 11,
                    fontWeight: 600,
                    color: "var(--text-muted)",
                    textTransform: "uppercase",
                    letterSpacing: 0.3,
                  }}
                >
                  Görev
                </th>
                <th
                  style={{
                    textAlign: "left",
                    padding: "0 12px",
                    fontSize: 11,
                    fontWeight: 600,
                    color: "var(--text-muted)",
                    textTransform: "uppercase",
                    letterSpacing: 0.3,
                    whiteSpace: "nowrap",
                  }}
                >
                  Son tarih
                </th>
                <th
                  style={{
                    textAlign: "left",
                    padding: "0 12px",
                    fontSize: 11,
                    fontWeight: 600,
                    color: "var(--text-muted)",
                    textTransform: "uppercase",
                    letterSpacing: 0.3,
                    whiteSpace: "nowrap",
                  }}
                >
                  Atanan
                </th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((t) => {
                const typeInfo = TASK_TYPES.find((x) => x.id === t.type) || TASK_TYPES[3];
                const dueInfo = taskDueInfo(t.dueDate, t.completedAt);
                const c = t.customerId ? customerById(t.customerId) : null;
                const d = t.dealId ? dealById(t.dealId) : null;
                return (
                  <tr
                    key={t.id}
                    style={{ background: "var(--surface-1)", boxShadow: "var(--shadow-sm)" }}
                  >
                    <td
                      style={{
                        padding: "10px 0 10px 12px",
                        borderRadius: "var(--radius-lg) 0 0 var(--radius-lg)",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={!!t.completedAt}
                        onChange={() => onToggleComplete(t.id)}
                        style={{ width: 18, height: 18, cursor: "pointer" }}
                        aria-label={
                          t.completedAt
                            ? "Tamamlandı işaretini kaldır"
                            : "Tamamlandı olarak işaretle"
                        }
                      />
                    </td>
                    <td
                      data-label="Görev"
                      onClick={() => {
                        setEditingTask(t);
                        setShowForm(true);
                      }}
                      style={{ padding: "10px 12px", cursor: "pointer" }}
                    >
                      <p
                        style={{
                          margin: 0,
                          fontWeight: 500,
                          fontSize: 14,
                          textDecoration: t.completedAt ? "line-through" : "none",
                          color: t.completedAt ? "var(--text-muted)" : "var(--text-primary)",
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                        }}
                      >
                        <i
                          className={`ti ${typeInfo.icon}`}
                          style={{ fontSize: 14, color: "var(--text-secondary)" }}
                          aria-hidden="true"
                        ></i>
                        {t.title}
                      </p>
                      {(c || d) && (
                        <p style={{ margin: 0, fontSize: 12, color: "var(--text-secondary)" }}>
                          {c ? c.name : "Bilinmeyen müşteri"}
                          {d ? ` - ${d.title}` : ""}
                        </p>
                      )}
                    </td>
                    <td
                      data-label="Son tarih"
                      style={{ padding: "10px 12px", whiteSpace: "nowrap" }}
                    >
                      {dueInfo ? (
                        <Badge tone={dueInfo.tone}>{dueInfo.label}</Badge>
                      ) : t.dueDate ? (
                        <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                          {new Date(`${t.dueDate}T00:00:00`).toLocaleDateString("tr-TR")}
                        </span>
                      ) : (
                        <span style={{ fontSize: 12, color: "var(--text-muted)" }}>-</span>
                      )}
                    </td>
                    <td
                      data-label="Atanan"
                      style={{
                        padding: "10px 12px",
                        whiteSpace: "nowrap",
                        fontSize: 13,
                        color: "var(--text-secondary)",
                      }}
                    >
                      {memberLabel(t.assignedTo) || "-"}
                    </td>
                    <td
                      style={{
                        padding: "10px 12px",
                        borderRadius: "0 var(--radius-lg) var(--radius-lg) 0",
                      }}
                    >
                      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                        <IconButton
                          icon="ti-edit"
                          title="Düzenle"
                          onClick={() => {
                            setEditingTask(t);
                            setShowForm(true);
                          }}
                        />
                        <IconButton
                          icon="ti-trash"
                          title="Sil"
                          onClick={() => setConfirmDelete(t)}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {showForm && (
        <Modal
          title={editingTask ? "Görevi düzenle" : "Yeni görev"}
          onClose={() => {
            setShowForm(false);
            setEditingTask(null);
          }}
        >
          <TaskForm
            customers={customers}
            deals={deals}
            teamMembers={teamMembers}
            currentUserId={currentUserId}
            currentUserEmail={currentUserEmail}
            initial={editingTask}
            onSave={saveTask}
            onCancel={() => {
              setShowForm(false);
              setEditingTask(null);
            }}
          />
        </Modal>
      )}

      {confirmDelete && (
        <ConfirmDialog
          title="Görevi sil"
          message="Bu görev çöp kutusuna taşınacak."
          onConfirm={() => {
            onDelete(confirmDelete.id);
            setConfirmDelete(null);
          }}
          onClose={() => setConfirmDelete(null)}
        />
      )}
    </div>
  );
}
