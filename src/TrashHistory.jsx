import { useState, useEffect } from "react";
import { supabase } from "./supabase";
import { Modal, formatTL, DateRangeFilter, matchesDateRange, daysAgo } from "./shared";
export const TRASH_TABLE_LABELS = {
  customers: "Müşteri",
  deals: "Teklif",
  payments: "Tahsilat",
  company_expenses: "İşletme gideri",
  tickets: "Talep",
  kb_articles: "Makale",
  group_classes: "Ders",
  attachments: "Dosya",
  staff_shifts: "Vardiya",
  staff_leave_balances: "İzin bakiyesi",
  staff_leave_records: "İzin kaydı",
};

export function TrashHistoryModal({
  notify,
  onRestore,
  onPermanentDelete,
  isOwner,
  onClose,
  activeTeamId,
  session,
  teamMembers,
}) {
  const [tab, setTab] = useState("trash");
  const [loading, setLoading] = useState(true);
  const [trashGroups, setTrashGroups] = useState([]);
  const [historyRows, setHistoryRows] = useState([]);
  const [restoringGroup, setRestoringGroup] = useState(null);
  const [deletingGroup, setDeletingGroup] = useState(null);
  const [confirmDeleteGroup, setConfirmDeleteGroup] = useState(null);
  const [confirmDeleteText, setConfirmDeleteText] = useState("");
  const [query, setQuery] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");

  const load = async () => {
    setLoading(true);
    const [
      { data: c },
      { data: d },
      { data: pay },
      { data: exp },
      { data: t },
      { data: kb },
      { data: gc },
      { data: log },
      { data: att },
    ] = await Promise.all([
      supabase
        .from("customers")
        .select("id,name,user_id,deleted_at,deleted_batch_id")
        .not("deleted_at", "is", null),
      supabase
        .from("deals")
        .select("id,title,user_id,deleted_at,deleted_batch_id")
        .not("deleted_at", "is", null),
      supabase
        .from("payments")
        .select("id,amount,deleted_at,deleted_batch_id")
        .not("deleted_at", "is", null),
      supabase
        .from("company_expenses")
        .select("id,title,deleted_at,deleted_batch_id")
        .not("deleted_at", "is", null),
      supabase
        .from("tickets")
        .select("id,subject,deleted_at,deleted_batch_id")
        .not("deleted_at", "is", null),
      supabase
        .from("kb_articles")
        .select("id,title,deleted_at,deleted_batch_id")
        .not("deleted_at", "is", null),
      supabase
        .from("group_classes")
        .select("id,name,user_id,deleted_at,deleted_batch_id")
        .not("deleted_at", "is", null),
      supabase.from("audit_log").select("*").order("created_at", { ascending: false }).limit(200),
      supabase
        .from("attachments")
        .select("id,file_name,user_id,deleted_at,deleted_batch_id")
        .not("deleted_at", "is", null),
    ]);

    // customers/deals RLS'i portal kullanıcıları için de eşleşebildiğinden (bkz.
    // customer_*_view yorumları), burada sadece aktif takıma ait kayıtlarla sınırlıyoruz.
    const rows = [
      ...(c || [])
        .filter((r) => r.user_id === activeTeamId)
        .map((r) => ({ table: "customers", label: r.name, ...r })),
      ...(d || [])
        .filter((r) => r.user_id === activeTeamId)
        .map((r) => ({ table: "deals", label: r.title, ...r })),
      ...(pay || []).map((r) => ({
        table: "payments",
        label: `${formatTL(r.amount)} tahsilat`,
        ...r,
      })),
      ...(exp || []).map((r) => ({ table: "company_expenses", label: r.title, ...r })),
      ...(t || []).map((r) => ({ table: "tickets", label: r.subject, ...r })),
      ...(kb || []).map((r) => ({ table: "kb_articles", label: r.title, ...r })),
      ...(gc || [])
        .filter((r) => r.user_id === activeTeamId)
        .map((r) => ({ table: "group_classes", label: r.name, ...r })),
      ...(att || [])
        .filter((r) => r.user_id === activeTeamId)
        .map((r) => ({ table: "attachments", label: r.file_name, ...r })),
    ];

    const groups = {};
    rows.forEach((r) => {
      // deleted_batch_id her zaman dolu olmalı (her soft-delete çağrısı bunu set
      // ediyor) ama olur da boş kalan bir satır çıkarsa, gruplama/React key/UI
      // durumu (aşağıda groupKey) YİNE DE benzersiz kalsın diye r.id'ye düşüyoruz -
      // aksi halde birden fazla batchId'siz satır aynı "null" kimliğinde birleşip
      // birinin onay kutusuna yazılanın diğerlerine de yansımasına yol açar.
      const key = r.deleted_batch_id || r.id;
      if (!groups[key])
        groups[key] = {
          groupKey: key,
          batchId: r.deleted_batch_id,
          deletedAt: r.deleted_at,
          items: [],
        };
      groups[key].items.push({ table: r.table, label: r.label });
      if (new Date(r.deleted_at) > new Date(groups[key].deletedAt))
        groups[key].deletedAt = r.deleted_at;
    });
    const groupList = Object.values(groups).sort(
      (a, b) => new Date(b.deletedAt) - new Date(a.deletedAt),
    );

    setTrashGroups(groupList);
    setHistoryRows(log || []);
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const restore = async (g) => {
    setRestoringGroup(g.groupKey);
    await onRestore(g.batchId);
    await load();
    setRestoringGroup(null);
  };

  const confirmPermanentDelete = async () => {
    const g = confirmDeleteGroup;
    setDeletingGroup(g.groupKey);
    setConfirmDeleteGroup(null);
    setConfirmDeleteText("");
    const { deletedCount, skipped } = await onPermanentDelete(g.batchId);
    await load();
    setDeletingGroup(null);
    if (skipped.length > 0)
      notify(`${deletedCount} kayıt kalıcı olarak silindi. ${skipped.join(" ")}`);
    else notify(`${deletedCount} kayıt kalıcı olarak silindi.`, "success");
  };

  const actorLabel = (actorId, actorEmail) => {
    if (actorId === session.user.id) return session.user.user_metadata?.full_name || actorEmail;
    const member = teamMembers.find((m) => m.id === actorId);
    return member?.name || actorEmail;
  };

  const queryLower = query.trim().toLowerCase();
  const filteredTrashGroups = trashGroups.filter((g) => {
    if (!matchesDateRange(g.deletedAt, fromDate, toDate)) return false;
    if (typeFilter !== "all" && !g.items.some((it) => it.table === typeFilter)) return false;
    if (!queryLower) return true;
    return g.items.some((it) => (it.label || "").toLowerCase().includes(queryLower));
  });
  const filteredHistoryRows = historyRows.filter((r) => {
    if (!matchesDateRange(r.created_at, fromDate, toDate)) return false;
    if (typeFilter !== "all" && r.entity_type !== typeFilter) return false;
    if (!queryLower) return true;
    return (
      (r.summary || "").toLowerCase().includes(queryLower) ||
      (r.actor_email || "").toLowerCase().includes(queryLower)
    );
  });

  return (
    <Modal title="Çöp Kutusu ve Geçmiş" onClose={onClose}>
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <button
          onClick={() => setTab("trash")}
          style={{
            flex: 1,
            background: tab === "trash" ? "var(--fill-accent)" : "var(--surface-1)",
            color: tab === "trash" ? "var(--on-accent)" : "var(--text-primary)",
          }}
        >
          Çöp Kutusu
        </button>
        <button
          onClick={() => setTab("history")}
          style={{
            flex: 1,
            background: tab === "history" ? "var(--fill-accent)" : "var(--surface-1)",
            color: tab === "history" ? "var(--on-accent)" : "var(--text-primary)",
          }}
        >
          Geçmiş
        </button>
      </div>

      <div
        className="list-toolbar"
        style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}
      >
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Ara..."
          style={{ flex: 1, minWidth: 140, fontSize: 13 }}
        />
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          style={{ fontSize: 13 }}
        >
          <option value="all">Tüm türler</option>
          {Object.entries(TRASH_TABLE_LABELS).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
        <DateRangeFilter
          from={fromDate}
          to={toDate}
          onFromChange={setFromDate}
          onToChange={setToDate}
        />
      </div>

      {loading ? (
        <p style={{ fontSize: 13, color: "var(--text-secondary)" }}>Yükleniyor…</p>
      ) : tab === "trash" ? (
        filteredTrashGroups.length === 0 ? (
          <p style={{ fontSize: 13, color: "var(--text-muted)" }}>
            {trashGroups.length === 0 ? "Çöp kutusu boş." : "Filtreye uyan kayıt yok."}
          </p>
        ) : (
          <div style={{ maxHeight: 420, overflowY: "auto" }}>
            {filteredTrashGroups.map((g) => (
              <div
                key={g.groupKey}
                style={{ padding: "10px 0", borderBottom: "0.5px solid var(--border)" }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    gap: 8,
                  }}
                >
                  <div>
                    {g.items.map((it, i) => (
                      <div key={i} style={{ fontSize: 13 }}>
                        <span style={{ color: "var(--text-muted)" }}>
                          {TRASH_TABLE_LABELS[it.table]}:
                        </span>{" "}
                        {it.label}
                      </div>
                    ))}
                    <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>
                      {daysAgo(g.deletedAt)} silindi
                      {g.deletedAt
                        ? ` · ${new Date(g.deletedAt).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}`
                        : ""}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button
                      onClick={() => restore(g)}
                      disabled={restoringGroup === g.groupKey}
                      style={{ fontSize: 12, whiteSpace: "nowrap" }}
                    >
                      {restoringGroup === g.groupKey ? "Geri yükleniyor…" : "Geri Yükle"}
                    </button>
                    {isOwner && (
                      <button
                        onClick={() => {
                          setConfirmDeleteGroup(g);
                          setConfirmDeleteText("");
                        }}
                        disabled={deletingGroup === g.groupKey}
                        style={{
                          fontSize: 12,
                          whiteSpace: "nowrap",
                          background: "var(--surface-1)",
                          color: "var(--danger, #b91c1c)",
                          border: "0.5px solid var(--border)",
                        }}
                      >
                        {deletingGroup === g.groupKey ? "Siliniyor…" : "Kalıcı Olarak Sil"}
                      </button>
                    )}
                  </div>
                </div>
                {confirmDeleteGroup?.groupKey === g.groupKey && (
                  <div
                    style={{
                      marginTop: 8,
                      padding: 10,
                      background: "var(--surface-1)",
                      border: "0.5px solid var(--border)",
                      borderRadius: "var(--radius)",
                    }}
                  >
                    <p style={{ fontSize: 12, margin: "0 0 8px", color: "var(--text-secondary)" }}>
                      Bu işlem GERİ ALINAMAZ - bu kayıtlar bir daha geri yüklenemez. Tahsilat/fatura
                      kaydı olan teklif veya müşteriler (varsa) yasal saklama süresi nedeniyle
                      otomatik olarak hariç tutulur. Onaylamak için aşağıya <strong>SİL</strong>{" "}
                      yazın.
                    </p>
                    <div style={{ display: "flex", gap: 8 }}>
                      <input
                        value={confirmDeleteText}
                        onChange={(e) => setConfirmDeleteText(e.target.value)}
                        placeholder="SİL"
                        style={{ flex: 1, fontSize: 13 }}
                      />
                      <button
                        onClick={confirmPermanentDelete}
                        disabled={confirmDeleteText.trim().toLocaleUpperCase("tr-TR") !== "SİL"}
                        style={{
                          fontSize: 12,
                          whiteSpace: "nowrap",
                          background: "var(--danger, #b91c1c)",
                          color: "#fff",
                          border: "none",
                        }}
                      >
                        Kalıcı Olarak Sil
                      </button>
                      <button
                        onClick={() => {
                          setConfirmDeleteGroup(null);
                          setConfirmDeleteText("");
                        }}
                        style={{ fontSize: 12, whiteSpace: "nowrap" }}
                      >
                        Vazgeç
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )
      ) : filteredHistoryRows.length === 0 ? (
        <p style={{ fontSize: 13, color: "var(--text-muted)" }}>
          {historyRows.length === 0 ? "Henüz bir kayıt yok." : "Filtreye uyan kayıt yok."}
        </p>
      ) : (
        <div style={{ maxHeight: 420, overflowY: "auto" }}>
          {filteredHistoryRows.map((r) => (
            <div key={r.id} style={{ padding: "8px 0", borderBottom: "0.5px solid var(--border)" }}>
              <div style={{ fontSize: 13 }}>{r.summary}</div>
              <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
                {actorLabel(r.actor_id, r.actor_email)} · {daysAgo(r.created_at)}
                {r.created_at
                  ? ` · ${new Date(r.created_at).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}`
                  : ""}
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
        <button onClick={onClose}>Kapat</button>
      </div>
    </Modal>
  );
}
