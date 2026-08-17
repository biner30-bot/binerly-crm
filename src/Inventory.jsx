import { useState } from "react";
import {
  Modal,
  InfoTip,
  ConfirmDialog,
  formatTL,
  PRICE_ITEM_NAME_EXAMPLES,
  Badge,
  IconButton,
  SegmentedControl,
  moveItem,
  moveBeforeDrop,
  ReorderButtons,
} from "./shared";
import { dealWordKind, bookingModel } from "./Sectors";

const STOCK_MANAGER_TABS = [
  { id: "stok", label: "Stok Kalemleri" },
  { id: "recete", label: "Reçeteler" },
];
import { DEAL_WORD_FORMS } from "./staticData";
// FreeServiceModal'daki isim örneği — sadece randevu bazlı (slot) sektörlerde
// gösterildiği için otel/üretim/perakende gibi ilgisiz sektörler burada yok.
const FREE_SERVICE_NAME_EXAMPLES = {
  guzellik_bakim: "Ücretsiz Cilt Analizi",
  saglik_klinik: "Ücretsiz Ön Muayene",
  spor_merkezi: "Ücretsiz Deneme Antrenmanı",
  emlak: "Ücretsiz Ekspertiz Görüşmesi",
  dijital_ajans: "Ücretsiz Strateji Görüşmesi",
  hizmet_danismanlik: "Ücretsiz İlk Görüşme",
};

export function FreeServiceModal({ sector, onAdd, onClose }) {
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    setSaving(true);
    await onAdd({ name: trimmed, price: 0, refreshDays: null, durationMinutes: null });
    setSaving(false);
    onClose();
  };

  return (
    <Modal title="Ücretsiz Hizmet Tanımla" onClose={onClose}>
      <p
        style={{
          fontSize: 13,
          color: "var(--text-secondary)",
          margin: "0 0 16px",
          lineHeight: 1.6,
        }}
      >
        Randevu almadan önce sizinle tanışmak isteyen tereddütlü müşterileri ilk adımı atmaya teşvik
        edin - tanımladığınız ücretsiz hizmet (örn. "Ücretsiz İlk Görüşme", "Deneme Seansı") Randevu
        Alma Linki'nde müşterilerinize ayrı, vurgulu bir buton olarak gösterilir. Fiyat listenize
        otomatik olarak 0 TL ile eklenir.
      </p>
      <form onSubmit={submit}>
        <div style={{ marginBottom: 16 }}>
          <label
            style={{
              fontSize: 12,
              color: "var(--text-secondary)",
              display: "block",
              marginBottom: 4,
            }}
          >
            Hizmet adı
          </label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={`Örn. ${FREE_SERVICE_NAME_EXAMPLES[sector] || "Ücretsiz İlk Görüşme"}`}
            autoFocus
            style={{ width: "100%" }}
          />
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button type="button" onClick={onClose}>
            Vazgeç
          </button>
          <button
            type="submit"
            disabled={!name.trim() || saving}
            style={{ background: "var(--fill-accent)", color: "var(--on-accent)", border: "none" }}
          >
            {saving ? "Ekleniyor…" : "+ Ekle"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// Satır listesindeki "Düzenle" ikonu artık aynı formu değil, ayrı bir Modal
// açıyor - önceden alttaki "ekle" formu düzenleme moduna geçip yer değiştiriyordu,
// kullanıcı formun aşağı kaydığını/butonun "Güncelle"ye döndüğünü fark etmeyip
// kafası karışıyordu (bkz. [[feedback]] - kullanıcı geri bildirimi).
export function PriceListEditModal({ item, sector, resources, onSave, onClose }) {
  const [name, setName] = useState(item.name);
  const [price, setPrice] = useState(String(item.price));
  const [refreshDays, setRefreshDays] = useState(item.refreshDays ? String(item.refreshDays) : "");
  const [durationMinutes, setDurationMinutes] = useState(
    item.durationMinutes ? String(item.durationMinutes) : "",
  );
  const [commissionPercent, setCommissionPercent] = useState(
    item.commissionPercent != null ? String(item.commissionPercent) : "",
  );
  const [resourceId, setResourceId] = useState(item.resourceId || "");
  const [parallelGroup, setParallelGroup] = useState(item.parallelGroup || "");

  const submit = (e) => {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName || price === "") return;
    onSave({
      name: trimmedName,
      price: Number(price),
      refreshDays: Number(refreshDays) || null,
      durationMinutes: Number(durationMinutes) || null,
      commissionPercent: commissionPercent !== "" ? Number(commissionPercent) : null,
      resourceId: resourceId || null,
      parallelGroup: parallelGroup.trim() || null,
    });
  };

  return (
    <Modal title="Ürün/hizmeti düzenle" onClose={onClose}>
      <form onSubmit={submit}>
        <div style={{ marginBottom: 10 }}>
          <label
            style={{
              fontSize: 12,
              color: "var(--text-secondary)",
              display: "block",
              marginBottom: 4,
            }}
          >
            İsim
          </label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={`Örn. ${PRICE_ITEM_NAME_EXAMPLES[sector] || "Danışmanlık"}`}
            style={{ width: "100%" }}
          />
        </div>
        <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 100 }}>
            <label
              style={{
                fontSize: 12,
                color: "var(--text-secondary)",
                display: "block",
                marginBottom: 4,
              }}
            >
              Fiyat (TL)
            </label>
            <input
              type="number"
              min="0"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="0"
              style={{ width: "100%" }}
            />
          </div>
          <div style={{ flex: 1, minWidth: 100 }}>
            <label
              style={{
                fontSize: 12,
                color: "var(--text-secondary)",
                display: "flex",
                alignItems: "center",
                gap: 3,
                marginBottom: 4,
              }}
            >
              Süre (dk)
              <InfoTip
                align="left"
                text="Opsiyonel - girerseniz, bu hizmet bir randevuya kalem olarak eklendiğinde randevunun süresi buna göre hesaplanır; aynı randevuda birden fazla hizmet varsa süreleri ardışık toplanır (Paralel Grup ile eşleştirilmiş hizmetler hariç, aşağıya bkz.) ve çakışma kontrolü buna göre yapılır. Ayrıca randevu alma ekranında müşteriye tahmini süre olarak gösterilir - boş bırakırsanız müşteriye süre bilgisi gösterilmez."
              />
            </label>
            <input
              type="number"
              min="0"
              value={durationMinutes}
              onChange={(e) => setDurationMinutes(e.target.value)}
              placeholder="Opsiyonel"
              style={{ width: "100%" }}
            />
          </div>
          <div style={{ flex: 1, minWidth: 100 }}>
            <label
              style={{
                fontSize: 12,
                color: "var(--text-secondary)",
                display: "flex",
                alignItems: "center",
                gap: 3,
                marginBottom: 4,
              }}
            >
              Tazeleme (gün)
              <InfoTip
                align="left"
                text="Opsiyonel - girerseniz, bu hizmet 'tamamlandı' olarak işaretlendiğinde bu kadar gün sonrasına otomatik bir hatırlatma kurulur (örn. protez tırnak için 21 gün)."
              />
            </label>
            <input
              type="number"
              min="0"
              value={refreshDays}
              onChange={(e) => setRefreshDays(e.target.value)}
              placeholder="Opsiyonel"
              style={{ width: "100%" }}
            />
          </div>
          <div style={{ flex: 1, minWidth: 100 }}>
            <label
              style={{
                fontSize: 12,
                color: "var(--text-secondary)",
                display: "flex",
                alignItems: "center",
                gap: 3,
                marginBottom: 4,
              }}
            >
              Prim oranı (%)
              <InfoTip
                align="left"
                text="Opsiyonel - bu hizmete özel bir prim yüzdesi. Girerseniz, bu hizmeti satan personelin hakedişi (Ayarlar → Takım'daki genel prim yüzdesi yerine) burada belirttiğiniz oranla hesaplanır - Personel Performansı raporunda görünür. Boş bırakırsanız personelin genel prim yüzdesi geçerli olur."
              />
            </label>
            <input
              type="number"
              min="0"
              step="0.5"
              value={commissionPercent}
              onChange={(e) => setCommissionPercent(e.target.value)}
              placeholder="Genel oran"
              style={{ width: "100%" }}
            />
          </div>
        </div>
        {bookingModel(sector) === "slot" && resources?.length > 0 && (
          <div style={{ marginBottom: 10 }}>
            <label
              style={{
                fontSize: 12,
                color: "var(--text-secondary)",
                display: "flex",
                alignItems: "center",
                gap: 3,
                marginBottom: 4,
              }}
            >
              Varsayılan Kaynak
              <InfoTip
                align="left"
                text="Opsiyonel - bu hizmet randevuya eklendiğinde Cihaz/Oda alanı otomatik bu kaynağa ayarlanır (yine de değiştirebilirsiniz). Müşteri widget/portaldan bu hizmeti seçtiğinde de müsaitlik ve rezervasyon otomatik bu kaynağa göre hesaplanır."
              />
            </label>
            <select
              value={resourceId}
              onChange={(e) => setResourceId(e.target.value)}
              style={{ width: "100%" }}
            >
              <option value="">Seçilmedi</option>
              {resources.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>
        )}
        {bookingModel(sector) === "slot" && (
          <div style={{ marginBottom: 10 }}>
            <label
              style={{
                fontSize: 12,
                color: "var(--text-secondary)",
                display: "flex",
                alignItems: "center",
                gap: 3,
                marginBottom: 4,
              }}
            >
              Paralel Grup
              <InfoTip
                align="left"
                text="Opsiyonel - aynı grup adını birden fazla hizmete verirseniz, bu hizmetler bir randevuda birlikte seçildiğinde eşzamanlı yapılıyor kabul edilir (ör. manikür yapılırken kaş lifting) - randevu süresi toplanmaz, en uzun süren hizmet baz alınır. Farklı gruptaki ya da grupsuz hizmetler her zaman ardışık (art arda, toplanarak) hesaplanır."
              />
            </label>
            <input
              list="parallel-group-options"
              value={parallelGroup}
              onChange={(e) => setParallelGroup(e.target.value)}
              placeholder="Örn. Manikür + Kaş Kombinasyonu"
              style={{ width: "100%" }}
            />
          </div>
        )}
        {bookingModel(sector) === "slot" && !durationMinutes && (
          <p style={{ fontSize: 11.5, color: "var(--text-warning)", margin: "0 0 10px" }}>
            Süre boş bırakılırsa Müsaitlik Saatleri'ndeki genel slot süresi varsayılır - gerçek süre
            farklıysa randevu takviminde boşluk kalabilir.
          </p>
        )}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button type="button" onClick={onClose}>
            Vazgeç
          </button>
          <button
            type="submit"
            style={{ background: "var(--fill-accent)", color: "var(--on-accent)", border: "none" }}
          >
            Güncelle
          </button>
        </div>
      </form>
    </Modal>
  );
}

const PRICE_LIST_SORT_OPTIONS = [
  { id: "custom", label: "Sıra (kendi düzeniniz)" },
  { id: "name_asc", label: "İsim (A-Z)" },
  { id: "name_desc", label: "İsim (Z-A)" },
  { id: "price_asc", label: "Fiyat (düşükten yükseğe)" },
  { id: "price_desc", label: "Fiyat (yüksekten düşüğe)" },
  { id: "created_desc", label: "Eklenme tarihi (yeni önce)" },
  { id: "created_asc", label: "Eklenme tarihi (eski önce)" },
];

function sortListItems(items, sortMode) {
  const sorted = [...items];
  if (sortMode === "custom") sorted.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  else if (sortMode === "name_asc") sorted.sort((a, b) => a.name.localeCompare(b.name, "tr"));
  else if (sortMode === "name_desc") sorted.sort((a, b) => b.name.localeCompare(a.name, "tr"));
  else if (sortMode === "price_asc") sorted.sort((a, b) => (a.price ?? 0) - (b.price ?? 0));
  else if (sortMode === "price_desc") sorted.sort((a, b) => (b.price ?? 0) - (a.price ?? 0));
  else if (sortMode === "created_desc")
    sorted.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  else if (sortMode === "created_asc")
    sorted.sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0));
  return sorted;
}

export function PriceListManager({
  items,
  onAdd,
  onUpdate,
  onDelete,
  onReorder,
  sector,
  resources,
}) {
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [refreshDays, setRefreshDays] = useState("");
  const [durationMinutes, setDurationMinutes] = useState("");
  const [resourceId, setResourceId] = useState("");
  const [parallelGroup, setParallelGroup] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [editingItem, setEditingItem] = useState(null);
  const [search, setSearch] = useState("");
  const [sortMode, setSortMode] = useState("custom");
  const [draggedId, setDraggedId] = useState(null);
  const query = search.trim().toLowerCase();
  const filteredItems = query
    ? items.filter((item) => item.name.toLowerCase().includes(query))
    : items;
  const sortedItems = sortListItems(filteredItems, sortMode);
  const canReorder = sortMode === "custom" && !query;
  const existingGroups = [...new Set(items.map((i) => i.parallelGroup).filter(Boolean))];

  const handleDrop = (targetId) => {
    if (draggedId && draggedId !== targetId)
      onReorder(moveBeforeDrop(sortedItems, draggedId, targetId).map((i) => i.id));
    setDraggedId(null);
  };

  const submit = (e) => {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName || price === "") return;
    onAdd({
      name: trimmedName,
      price: Number(price),
      refreshDays: Number(refreshDays) || null,
      durationMinutes: Number(durationMinutes) || null,
      resourceId: resourceId || null,
      parallelGroup: parallelGroup.trim() || null,
    });
    setName("");
    setPrice("");
    setRefreshDays("");
    setDurationMinutes("");
    setResourceId("");
    setParallelGroup("");
  };

  return (
    <div>
      <p
        style={{
          fontSize: 13,
          color: "var(--text-secondary)",
          margin: "0 0 16px",
          display: "flex",
          alignItems: "center",
          gap: 4,
        }}
      >
        Sabit fiyatlı ürün/hizmetlerinizi buraya kaydedin
        <InfoTip
          placement="bottom"
          align="right"
          text={`Bu tamamen opsiyonel - kaydettikleriniz, yeni ${DEAL_WORD_FORMS[dealWordKind(sector)].bare} formunda hızlı seçim olarak çıkar; seçince başlık ve tutar otomatik dolar, sonrasında yine de değiştirebilirsiniz. Bir kalemi silmek veya fiyatını güncellemek, daha önce oluşturulmuş ${DEAL_WORD_FORMS[dealWordKind(sector)].pluralAcc} etkilemez - sadece o ${DEAL_WORD_FORMS[dealWordKind(sector)].bare} kaydedildiği andaki başlık/tutarı taşır.`}
        />
      </p>

      {items.length === 0 ? (
        <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 16 }}>
          Henüz ürün/hizmet eklenmedi.
        </p>
      ) : (
        <>
          {(items.length > 5 || items.length > 1) && (
            <div style={{ display: "flex", gap: 6, marginBottom: 8, flexWrap: "wrap" }}>
              {items.length > 5 && (
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Ürün/hizmet ara..."
                  style={{ flex: 1, minWidth: 140, fontSize: 16 }}
                />
              )}
              {items.length > 1 && (
                <select
                  value={sortMode}
                  onChange={(e) => setSortMode(e.target.value)}
                  style={{ fontSize: 13 }}
                >
                  {PRICE_LIST_SORT_OPTIONS.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.label}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}
          {sortedItems.length === 0 ? (
            <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 16 }}>
              Aramayla eşleşen kayıt yok.
            </p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 16 }}>
              {sortedItems.map((item, idx) => (
                <div
                  key={item.id}
                  onDragOver={(e) => canReorder && e.preventDefault()}
                  onDrop={() => canReorder && handleDrop(item.id)}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 8,
                    background: "var(--surface-1)",
                    border: "0.5px solid var(--border)",
                    borderRadius: "var(--radius)",
                    padding: "8px 12px",
                  }}
                >
                  <div
                    style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0, flex: 1 }}
                  >
                    {canReorder && (
                      <i
                        className="ti ti-grip-vertical"
                        draggable
                        onDragStart={() => setDraggedId(item.id)}
                        onDragEnd={() => setDraggedId(null)}
                        title="Sürükleyerek taşı"
                        style={{
                          cursor: "grab",
                          color: "var(--text-muted)",
                          fontSize: 16,
                          flexShrink: 0,
                        }}
                        aria-hidden="true"
                      ></i>
                    )}
                    <span
                      style={{
                        fontSize: 13,
                        fontWeight: 500,
                        minWidth: 0,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {item.name}
                    </span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                    <Badge tone="accent">{formatTL(item.price)}</Badge>
                    {item.durationMinutes > 0 && (
                      <Badge tone="default">{item.durationMinutes} dk</Badge>
                    )}
                    {item.refreshDays > 0 && (
                      <Badge tone="default">{item.refreshDays} günde bir</Badge>
                    )}
                    {item.commissionPercent != null && (
                      <span title="Bu hizmete özel prim oranı">
                        <Badge tone="default">%{item.commissionPercent} prim</Badge>
                      </span>
                    )}
                    {item.resourceId && (
                      <span title="Varsayılan kaynak - randevuda otomatik seçilir">
                        <Badge tone="default">
                          {resources?.find((r) => r.id === item.resourceId)?.name || "Kaynak"}
                        </Badge>
                      </span>
                    )}
                    {item.parallelGroup && (
                      <span title="Paralel Grup - bu gruptaki hizmetler birlikte seçilince eşzamanlı yapılıyor kabul edilir">
                        <Badge tone="default">⇄ {item.parallelGroup}</Badge>
                      </span>
                    )}
                    {canReorder && (
                      <ReorderButtons
                        onMoveTop={() =>
                          onReorder(moveItem(sortedItems, item.id, "top").map((i) => i.id))
                        }
                        onMoveUp={() =>
                          onReorder(moveItem(sortedItems, item.id, "up").map((i) => i.id))
                        }
                        onMoveDown={() =>
                          onReorder(moveItem(sortedItems, item.id, "down").map((i) => i.id))
                        }
                        isFirst={idx === 0}
                        isLast={idx === sortedItems.length - 1}
                      />
                    )}
                    <IconButton
                      icon="ti-edit"
                      title="Düzenle"
                      size="sm"
                      onClick={() => setEditingItem(item)}
                    />
                    <IconButton
                      icon="ti-trash"
                      title="Sil"
                      size="sm"
                      onClick={() => setConfirmDelete(item)}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      <p style={{ fontSize: 13, fontWeight: 500, margin: "0 0 8px" }}>Yeni ürün/hizmet ekle</p>
      <form
        onSubmit={submit}
        style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "flex-end" }}
      >
        <div style={{ flex: 1, minWidth: 140 }}>
          <label
            style={{
              fontSize: 12,
              color: "var(--text-secondary)",
              display: "block",
              marginBottom: 4,
            }}
          >
            İsim
          </label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={`Örn. ${PRICE_ITEM_NAME_EXAMPLES[sector] || "Danışmanlık"}`}
            style={{ width: "100%", fontSize: 16 }}
          />
        </div>
        <div style={{ width: 120 }}>
          <label
            style={{
              fontSize: 12,
              color: "var(--text-secondary)",
              display: "block",
              marginBottom: 4,
            }}
          >
            Fiyat (TL)
          </label>
          <input
            type="number"
            min="0"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder="0"
            style={{ width: "100%", fontSize: 16 }}
          />
        </div>
        <div style={{ width: 130 }}>
          <label
            style={{
              fontSize: 12,
              color: "var(--text-secondary)",
              display: "flex",
              alignItems: "center",
              gap: 3,
              marginBottom: 4,
            }}
          >
            Süre (dk)
            <InfoTip
              align="left"
              text="Opsiyonel - girerseniz, bu hizmet bir randevuya kalem olarak eklendiğinde randevunun süresi buna göre hesaplanır; aynı randevuda birden fazla hizmet varsa süreleri ardışık toplanır (Paralel Grup ile eşleştirilmiş hizmetler hariç, aşağıya bkz.) ve çakışma kontrolü buna göre yapılır. Ayrıca randevu alma ekranında müşteriye tahmini süre olarak gösterilir - boş bırakırsanız müşteriye süre bilgisi gösterilmez."
            />
          </label>
          <input
            type="number"
            min="0"
            value={durationMinutes}
            onChange={(e) => setDurationMinutes(e.target.value)}
            placeholder="Opsiyonel"
            style={{ width: "100%", fontSize: 16 }}
          />
        </div>
        <div style={{ width: 150 }}>
          <label
            style={{
              fontSize: 12,
              color: "var(--text-secondary)",
              display: "flex",
              alignItems: "center",
              gap: 3,
              marginBottom: 4,
            }}
          >
            Tazeleme (gün)
            <InfoTip
              align="left"
              text="Opsiyonel - girerseniz, bu hizmet 'tamamlandı' olarak işaretlendiğinde bu kadar gün sonrasına otomatik bir hatırlatma kurulur (örn. protez tırnak için 21 gün)."
            />
          </label>
          <input
            type="number"
            min="0"
            value={refreshDays}
            onChange={(e) => setRefreshDays(e.target.value)}
            placeholder="Opsiyonel"
            style={{ width: "100%", fontSize: 16 }}
          />
        </div>
        {bookingModel(sector) === "slot" && resources?.length > 0 && (
          <div style={{ width: 160 }}>
            <label
              style={{
                fontSize: 12,
                color: "var(--text-secondary)",
                display: "flex",
                alignItems: "center",
                gap: 3,
                marginBottom: 4,
              }}
            >
              Varsayılan Kaynak
              <InfoTip
                align="left"
                text="Opsiyonel - bu hizmet randevuya eklendiğinde Cihaz/Oda alanı otomatik bu kaynağa ayarlanır (yine de değiştirebilirsiniz). Müşteri widget/portaldan bu hizmeti seçtiğinde de müsaitlik ve rezervasyon otomatik bu kaynağa göre hesaplanır."
              />
            </label>
            <select
              value={resourceId}
              onChange={(e) => setResourceId(e.target.value)}
              style={{ width: "100%", fontSize: 16 }}
            >
              <option value="">Seçilmedi</option>
              {resources.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>
        )}
        {bookingModel(sector) === "slot" && (
          <div style={{ width: 190 }}>
            <label
              style={{
                fontSize: 12,
                color: "var(--text-secondary)",
                display: "flex",
                alignItems: "center",
                gap: 3,
                marginBottom: 4,
              }}
            >
              Paralel Grup
              <InfoTip
                align="left"
                text="Opsiyonel - aynı grup adını birden fazla hizmete verirseniz, bu hizmetler bir randevuda birlikte seçildiğinde eşzamanlı yapılıyor kabul edilir (ör. manikür yapılırken kaş lifting) - randevu süresi toplanmaz, en uzun süren hizmet baz alınır. Farklı gruptaki ya da grupsuz hizmetler her zaman ardışık (art arda, toplanarak) hesaplanır."
              />
            </label>
            <input
              list="parallel-group-options"
              value={parallelGroup}
              onChange={(e) => setParallelGroup(e.target.value)}
              placeholder="Örn. Manikür + Kaş Kombinasyonu"
              style={{ width: "100%", fontSize: 16 }}
            />
            <datalist id="parallel-group-options">
              {existingGroups.map((g) => (
                <option key={g} value={g} />
              ))}
            </datalist>
          </div>
        )}
        <button
          type="submit"
          style={{
            background: "var(--fill-accent)",
            color: "var(--on-accent)",
            border: "none",
            fontSize: 13,
          }}
        >
          + Ekle
        </button>
      </form>
      {bookingModel(sector) === "slot" && !durationMinutes && (
        <p style={{ fontSize: 11.5, color: "var(--text-warning)", margin: "6px 0 0" }}>
          Süre boş bırakılırsa Müsaitlik Saatleri'ndeki genel slot süresi varsayılır - gerçek süre
          farklıysa randevu takviminde boşluk kalabilir.
        </p>
      )}

      {confirmDelete && (
        <ConfirmDialog
          title="Ürün/hizmeti sil"
          message={`"${confirmDelete.name}" kaldırılacak. Bu geri alınamaz - ancak daha önce bu kalemle oluşturulmuş ${DEAL_WORD_FORMS[dealWordKind(sector)].plural} etkilenmez.`}
          onConfirm={() => {
            onDelete(confirmDelete.id);
            setConfirmDelete(null);
          }}
          onClose={() => setConfirmDelete(null)}
        />
      )}

      {editingItem && (
        <PriceListEditModal
          item={editingItem}
          sector={sector}
          resources={resources}
          onClose={() => setEditingItem(null)}
          onSave={(payload) => {
            onUpdate({ id: editingItem.id, ...payload });
            setEditingItem(null);
          }}
        />
      )}
    </div>
  );
}

const STOCK_UNITS = ["adet", "ml", "gr", "kg", "lt", "kutu", "paket"];

// Gramaj bazlı stok/reçete yönetimi — sektörden bağımsız, sadece kullanan
// görür. "Stok" sekmesi malzemeleri (hammadde/sarf) tutar; "Reçete" sekmesi
// bir fiyat listesi kaleminin (hizmet/ürün) TEK SEFERLİK ne kadar malzeme
// tükettiğini tanımlar — bir teklif "kazanıldı"ya geçtiğinde bu miktar
// otomatik düşülür (bkz. App.jsx:computeServiceCompletionEffects).
const STOCK_ITEM_NAME_EXAMPLES = {
  guzellik_bakim: "Tüp Boya 8.1",
  saglik_klinik: "Lateks Eldiven",
  uretim_satis: "Çelik Sac 2mm",
  sanayi_esnaf: "Motor Yağı",
  perakende: "Karton Kutu (Ambalaj)",
  otel: "Havlu Seti",
  spor_merkezi: "Protein Tozu",
  egitim_kurs: "Ders Kitabı",
};

export function StockEditModal({ item, sector, onSave, onClose }) {
  const [name, setName] = useState(item.name);
  const [unit, setUnit] = useState(item.unit);
  const [quantityOnHand, setQuantityOnHand] = useState(String(item.quantityOnHand));
  const [reorderThreshold, setReorderThreshold] = useState(
    item.reorderThreshold != null ? String(item.reorderThreshold) : "",
  );
  const [supplierName, setSupplierName] = useState(item.supplierName || "");
  const [unitCost, setUnitCost] = useState(item.unitCost != null ? String(item.unitCost) : "");

  const submit = (e) => {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName || quantityOnHand === "") return;
    onSave({
      name: trimmedName,
      unit,
      quantityOnHand: Number(quantityOnHand),
      reorderThreshold: reorderThreshold === "" ? null : Number(reorderThreshold),
      supplierName: supplierName.trim(),
      unitCost: unitCost === "" ? null : Number(unitCost),
    });
  };

  return (
    <Modal title="Stok kalemini düzenle" onClose={onClose}>
      <form onSubmit={submit}>
        <div style={{ marginBottom: 10 }}>
          <label
            style={{
              fontSize: 12,
              color: "var(--text-secondary)",
              display: "block",
              marginBottom: 4,
            }}
          >
            İsim
          </label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={`Örn. ${STOCK_ITEM_NAME_EXAMPLES[sector] || "Sarf Malzemesi"}`}
            style={{ width: "100%" }}
          />
        </div>
        <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
          <div style={{ flex: 1 }}>
            <label
              style={{
                fontSize: 12,
                color: "var(--text-secondary)",
                display: "block",
                marginBottom: 4,
              }}
            >
              Birim
            </label>
            <select
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              style={{ width: "100%" }}
            >
              {STOCK_UNITS.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <label
              style={{
                fontSize: 12,
                color: "var(--text-secondary)",
                display: "block",
                marginBottom: 4,
              }}
            >
              Mevcut miktar
            </label>
            <input
              type="number"
              value={quantityOnHand}
              onChange={(e) => setQuantityOnHand(e.target.value)}
              placeholder="0"
              style={{ width: "100%" }}
            />
          </div>
          <div style={{ flex: 1 }}>
            <label
              style={{
                fontSize: 12,
                color: "var(--text-secondary)",
                display: "flex",
                alignItems: "center",
                gap: 3,
                marginBottom: 4,
              }}
            >
              Kritik seviye
              <InfoTip
                placement="bottom"
                align="right"
                text="Bu miktara inince (veya altına düşünce) Pano'da düşük stok uyarısı çıkar. Boş bırakırsanız hiç uyarı verilmez."
              />
            </label>
            <input
              type="number"
              value={reorderThreshold}
              onChange={(e) => setReorderThreshold(e.target.value)}
              placeholder="Opsiyonel"
              style={{ width: "100%" }}
            />
          </div>
        </div>
        <div style={{ marginBottom: 10 }}>
          <label
            style={{
              fontSize: 12,
              color: "var(--text-secondary)",
              display: "block",
              marginBottom: 4,
            }}
          >
            Tedarikçi
          </label>
          <input
            value={supplierName}
            onChange={(e) => setSupplierName(e.target.value)}
            placeholder="Opsiyonel"
            style={{ width: "100%" }}
          />
        </div>
        <div style={{ marginBottom: 10 }}>
          <label
            style={{
              fontSize: 12,
              color: "var(--text-secondary)",
              display: "flex",
              alignItems: "center",
              gap: 3,
              marginBottom: 4,
            }}
          >
            Birim maliyet (TL)
            <InfoTip
              placement="bottom"
              align="right"
              text="Bu kalemi kullanan ürünlerin reçete maliyetini hesaplamak için kullanılır. Boş bırakırsanız o ürün için maliyet/marj uyarısı hiç gösterilmez."
            />
          </label>
          <input
            type="number"
            value={unitCost}
            onChange={(e) => setUnitCost(e.target.value)}
            placeholder="Opsiyonel"
            style={{ width: "100%" }}
          />
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button type="button" onClick={onClose}>
            Vazgeç
          </button>
          <button
            type="submit"
            style={{ background: "var(--fill-accent)", color: "var(--on-accent)", border: "none" }}
          >
            Güncelle
          </button>
        </div>
      </form>
    </Modal>
  );
}

// Zararına satış uyarısı için minimum kâr marjı — varsayılan KAPALI (opt-in,
// bkz. feedback_features_opt_in_kobi_choice), tam genişlikte özet satır +
// "Ayarla"/"Düzenle" ile açılan tek alanlı form (LateCancelPolicyBox ile aynı
// desen: dar bir modalde değil burada, dar-modal InfoTip taşması hatasını
// tekrarlamamak için).
function MinMarginBox({ value, onSave }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value != null ? String(value) : "");

  const submit = (e) => {
    e.preventDefault();
    onSave(draft === "" ? null : Number(draft));
    setEditing(false);
  };

  return (
    <div
      style={{
        background: "var(--surface-1)",
        border: "0.5px solid var(--border)",
        borderRadius: "var(--radius)",
        padding: "10px 12px",
        marginBottom: 16,
      }}
    >
      {!editing ? (
        <div
          style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}
        >
          <div>
            <p
              style={{
                margin: 0,
                fontSize: 13,
                fontWeight: 500,
                display: "flex",
                alignItems: "center",
                gap: 4,
              }}
            >
              Minimum kâr marjı
              <InfoTip
                placement="bottom"
                text="Reçetesi ve birim maliyetleri girilmiş bir ürünü, bu marjın altında bir fiyata teklife eklerseniz form üzerinde bir uyarı gösterilir. Kaydetmeyi engellemez, sadece bilgilendirir."
              />
            </p>
            <p style={{ margin: "2px 0 0", fontSize: 12, color: "var(--text-secondary)" }}>
              {value != null
                ? `%${value} - altına düşen tekliflerde uyarı gösterilir`
                : "Kullanılmıyor - maliyet/marj uyarısı hiç gösterilmez"}
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setDraft(value != null ? String(value) : "");
              setEditing(true);
            }}
            style={{ fontSize: 12, flexShrink: 0 }}
          >
            {value != null ? "Düzenle" : "Ayarla"}
          </button>
        </div>
      ) : (
        <form
          onSubmit={submit}
          style={{ display: "flex", alignItems: "flex-end", gap: 8, flexWrap: "wrap" }}
        >
          <div style={{ width: 120 }}>
            <label
              style={{
                fontSize: 12,
                color: "var(--text-secondary)",
                display: "block",
                marginBottom: 4,
              }}
            >
              Minimum marj (%)
            </label>
            <input
              type="number"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Örn. 15"
              autoFocus
              style={{ width: "100%" }}
            />
          </div>
          <button
            type="submit"
            style={{
              background: "var(--fill-accent)",
              color: "var(--on-accent)",
              border: "none",
              fontSize: 13,
            }}
          >
            Kaydet
          </button>
          <button type="button" onClick={() => setEditing(false)} style={{ fontSize: 13 }}>
            Vazgeç
          </button>
        </form>
      )}
    </div>
  );
}

const STOCK_SORT_OPTIONS = [
  { id: "custom", label: "Sıra (kendi düzeniniz)" },
  { id: "name_asc", label: "İsim (A-Z)" },
  { id: "name_desc", label: "İsim (Z-A)" },
  { id: "quantity_asc", label: "Miktar (azdan çoğa)" },
  { id: "quantity_desc", label: "Miktar (çoktan aza)" },
  { id: "created_desc", label: "Eklenme tarihi (yeni önce)" },
  { id: "created_asc", label: "Eklenme tarihi (eski önce)" },
];

function sortStockItems(items, sortMode) {
  const sorted = [...items];
  if (sortMode === "custom") sorted.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  else if (sortMode === "name_asc") sorted.sort((a, b) => a.name.localeCompare(b.name, "tr"));
  else if (sortMode === "name_desc") sorted.sort((a, b) => b.name.localeCompare(a.name, "tr"));
  else if (sortMode === "quantity_asc") sorted.sort((a, b) => a.quantityOnHand - b.quantityOnHand);
  else if (sortMode === "quantity_desc") sorted.sort((a, b) => b.quantityOnHand - a.quantityOnHand);
  else if (sortMode === "created_desc")
    sorted.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  else if (sortMode === "created_asc")
    sorted.sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0));
  return sorted;
}

export function StockManager({
  stockItems,
  priceListItems,
  priceItemIngredients,
  sector,
  minProfitMarginPercent,
  onAddStock,
  onUpdateStock,
  onDeleteStock,
  onReorderStock,
  onAddIngredient,
  onDeleteIngredient,
  onUpdateMinMargin,
}) {
  const [tab, setTab] = useState("stok");
  const [name, setName] = useState("");
  const [unit, setUnit] = useState("adet");
  const [quantityOnHand, setQuantityOnHand] = useState("");
  const [reorderThreshold, setReorderThreshold] = useState("");
  const [supplierName, setSupplierName] = useState("");
  const [unitCost, setUnitCost] = useState("");
  const [editingItem, setEditingItem] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [stockSortMode, setStockSortMode] = useState("custom");
  const [draggedStockId, setDraggedStockId] = useState(null);

  const [recipePriceItemId, setRecipePriceItemId] = useState(priceListItems[0]?.id || "");
  const [recipeStockItemId, setRecipeStockItemId] = useState("");
  const [recipeQuantity, setRecipeQuantity] = useState("");
  const sortedStockItems = sortStockItems(stockItems, stockSortMode);
  const canReorderStock = stockSortMode === "custom";

  const handleStockDrop = (targetId) => {
    if (draggedStockId && draggedStockId !== targetId)
      onReorderStock(moveBeforeDrop(sortedStockItems, draggedStockId, targetId).map((i) => i.id));
    setDraggedStockId(null);
  };

  const submitStock = (e) => {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName || quantityOnHand === "") return;
    onAddStock({
      name: trimmedName,
      unit,
      quantityOnHand: Number(quantityOnHand),
      reorderThreshold: reorderThreshold === "" ? null : Number(reorderThreshold),
      supplierName: supplierName.trim(),
      unitCost: unitCost === "" ? null : Number(unitCost),
    });
    setName("");
    setUnit("adet");
    setQuantityOnHand("");
    setReorderThreshold("");
    setSupplierName("");
    setUnitCost("");
  };

  const recipeRows = priceItemIngredients.filter((i) => i.priceItemId === recipePriceItemId);

  return (
    <div>
      <MinMarginBox value={minProfitMarginPercent} onSave={onUpdateMinMargin} />
      <div style={{ marginBottom: 16 }}>
        <SegmentedControl value={tab} onChange={setTab} options={STOCK_MANAGER_TABS} />
      </div>

      {tab === "stok" ? (
        <div>
          {stockItems.length === 0 ? (
            <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 16 }}>
              Henüz stok kalemi eklenmedi.
            </p>
          ) : (
            <>
              {stockItems.length > 1 && (
                <div style={{ marginBottom: 8 }}>
                  <select
                    value={stockSortMode}
                    onChange={(e) => setStockSortMode(e.target.value)}
                    style={{ fontSize: 13 }}
                  >
                    {STOCK_SORT_OPTIONS.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 16 }}>
                {sortedStockItems.map((item, idx) => {
                  const low =
                    item.reorderThreshold != null && item.quantityOnHand <= item.reorderThreshold;
                  return (
                    <div
                      key={item.id}
                      onDragOver={(e) => canReorderStock && e.preventDefault()}
                      onDrop={() => canReorderStock && handleStockDrop(item.id)}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        gap: 8,
                        background: "var(--surface-1)",
                        border: "0.5px solid var(--border)",
                        borderRadius: "var(--radius)",
                        padding: "8px 12px",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                        {canReorderStock && (
                          <i
                            className="ti ti-grip-vertical"
                            draggable
                            onDragStart={() => setDraggedStockId(item.id)}
                            onDragEnd={() => setDraggedStockId(null)}
                            title="Sürükleyerek taşı"
                            style={{
                              cursor: "grab",
                              color: "var(--text-muted)",
                              fontSize: 16,
                              flexShrink: 0,
                            }}
                            aria-hidden="true"
                          ></i>
                        )}
                        <div style={{ minWidth: 0 }}>
                          <p style={{ margin: 0, fontSize: 13, fontWeight: 500 }}>{item.name}</p>
                          {item.supplierName && (
                            <p style={{ margin: 0, fontSize: 11, color: "var(--text-muted)" }}>
                              Tedarikçi: {item.supplierName}
                            </p>
                          )}
                        </div>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                        <Badge tone={low ? "danger" : "accent"}>
                          {item.quantityOnHand} {item.unit}
                        </Badge>
                        {canReorderStock && (
                          <ReorderButtons
                            onMoveTop={() =>
                              onReorderStock(
                                moveItem(sortedStockItems, item.id, "top").map((i) => i.id),
                              )
                            }
                            onMoveUp={() =>
                              onReorderStock(
                                moveItem(sortedStockItems, item.id, "up").map((i) => i.id),
                              )
                            }
                            onMoveDown={() =>
                              onReorderStock(
                                moveItem(sortedStockItems, item.id, "down").map((i) => i.id),
                              )
                            }
                            isFirst={idx === 0}
                            isLast={idx === sortedStockItems.length - 1}
                          />
                        )}
                        <IconButton
                          icon="ti-edit"
                          title="Düzenle"
                          size="sm"
                          onClick={() => setEditingItem(item)}
                        />
                        <IconButton
                          icon="ti-trash"
                          title="Sil"
                          size="sm"
                          onClick={() => setConfirmDelete(item)}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          <p style={{ fontSize: 13, fontWeight: 500, margin: "0 0 8px" }}>Yeni stok kalemi ekle</p>
          <form
            onSubmit={submitStock}
            style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "flex-end" }}
          >
            <div style={{ flex: 1, minWidth: 140 }}>
              <label
                style={{
                  fontSize: 12,
                  color: "var(--text-secondary)",
                  display: "block",
                  marginBottom: 4,
                }}
              >
                İsim
              </label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={`Örn. ${STOCK_ITEM_NAME_EXAMPLES[sector] || "Sarf Malzemesi"}`}
                style={{ width: "100%", fontSize: 16 }}
              />
            </div>
            <div style={{ width: 90 }}>
              <label
                style={{
                  fontSize: 12,
                  color: "var(--text-secondary)",
                  display: "block",
                  marginBottom: 4,
                }}
              >
                Birim
              </label>
              <select
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                style={{ width: "100%", fontSize: 16 }}
              >
                {STOCK_UNITS.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            </div>
            <div style={{ width: 110 }}>
              <label
                style={{
                  fontSize: 12,
                  color: "var(--text-secondary)",
                  display: "block",
                  marginBottom: 4,
                }}
              >
                Mevcut miktar
              </label>
              <input
                type="number"
                value={quantityOnHand}
                onChange={(e) => setQuantityOnHand(e.target.value)}
                placeholder="0"
                style={{ width: "100%", fontSize: 16 }}
              />
            </div>
            <div style={{ width: 130 }}>
              <label
                style={{
                  fontSize: 12,
                  color: "var(--text-secondary)",
                  display: "flex",
                  alignItems: "center",
                  gap: 3,
                  marginBottom: 4,
                }}
              >
                Kritik seviye
                <InfoTip
                  placement="bottom"
                  align="right"
                  text="Bu miktara inince (veya altına düşünce) Pano'da düşük stok uyarısı çıkar. Boş bırakırsanız hiç uyarı verilmez."
                />
              </label>
              <input
                type="number"
                value={reorderThreshold}
                onChange={(e) => setReorderThreshold(e.target.value)}
                placeholder="Opsiyonel"
                style={{ width: "100%", fontSize: 16 }}
              />
            </div>
            <div style={{ flex: 1, minWidth: 140 }}>
              <label
                style={{
                  fontSize: 12,
                  color: "var(--text-secondary)",
                  display: "block",
                  marginBottom: 4,
                }}
              >
                Tedarikçi
              </label>
              <input
                value={supplierName}
                onChange={(e) => setSupplierName(e.target.value)}
                placeholder="Opsiyonel"
                style={{ width: "100%", fontSize: 16 }}
              />
            </div>
            <div style={{ width: 130 }}>
              <label
                style={{
                  fontSize: 12,
                  color: "var(--text-secondary)",
                  display: "flex",
                  alignItems: "center",
                  gap: 3,
                  marginBottom: 4,
                }}
              >
                Birim maliyet (TL)
                <InfoTip
                  placement="bottom"
                  align="right"
                  text="Bu kalemi kullanan ürünlerin reçete maliyetini hesaplamak için kullanılır. Boş bırakırsanız o ürün için maliyet/marj uyarısı hiç gösterilmez."
                />
              </label>
              <input
                type="number"
                value={unitCost}
                onChange={(e) => setUnitCost(e.target.value)}
                placeholder="Opsiyonel"
                style={{ width: "100%", fontSize: 16 }}
              />
            </div>
            <button
              type="submit"
              style={{
                background: "var(--fill-accent)",
                color: "var(--on-accent)",
                border: "none",
                fontSize: 13,
              }}
            >
              + Ekle
            </button>
          </form>

          {confirmDelete && (
            <ConfirmDialog
              title="Stok kalemini sil"
              message={`"${confirmDelete.name}" kaldırılacak. Bu kalemi kullanan reçete satırları da silinir.`}
              onConfirm={() => {
                onDeleteStock(confirmDelete.id);
                setConfirmDelete(null);
              }}
              onClose={() => setConfirmDelete(null)}
            />
          )}

          {editingItem && (
            <StockEditModal
              item={editingItem}
              sector={sector}
              onClose={() => setEditingItem(null)}
              onSave={(payload) => {
                onUpdateStock({ id: editingItem.id, ...payload });
                setEditingItem(null);
              }}
            />
          )}
        </div>
      ) : (
        <div>
          {priceListItems.length === 0 || stockItems.length === 0 ? (
            <p style={{ fontSize: 13, color: "var(--text-muted)" }}>
              Reçete tanımlamak için önce Fiyat Listesi sekmesinde en az bir kalem ve burada en az
              bir stok kalemi olmalı.
            </p>
          ) : (
            <>
              <div style={{ marginBottom: 12 }}>
                <label
                  style={{
                    fontSize: 12,
                    color: "var(--text-secondary)",
                    display: "block",
                    marginBottom: 4,
                  }}
                >
                  Hangi ürün/hizmet için reçete tanımlıyorsunuz?
                </label>
                <select
                  value={recipePriceItemId}
                  onChange={(e) => setRecipePriceItemId(e.target.value)}
                  style={{ width: "100%", fontSize: 16 }}
                >
                  {priceListItems.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>

              {recipeRows.length === 0 ? (
                <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 12 }}>
                  Bu kalem için henüz reçete tanımlanmadı.
                </p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 12 }}>
                  {recipeRows.map((row) => {
                    const stockItem = stockItems.find((s) => s.id === row.stockItemId);
                    return (
                      <div
                        key={row.id}
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          gap: 8,
                          background: "var(--surface-1)",
                          border: "0.5px solid var(--border)",
                          borderRadius: "var(--radius)",
                          padding: "8px 12px",
                        }}
                      >
                        <span style={{ fontSize: 13 }}>{stockItem?.name || "Silinmiş kalem"}</span>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <Badge tone="accent">
                            {row.quantity} {stockItem?.unit || ""}
                          </Badge>
                          <IconButton
                            icon="ti-trash"
                            title="Sil"
                            size="sm"
                            onClick={() => onDeleteIngredient(row.id)}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!recipeStockItemId || !recipeQuantity) return;
                  onAddIngredient({
                    priceItemId: recipePriceItemId,
                    stockItemId: recipeStockItemId,
                    quantity: Number(recipeQuantity),
                  });
                  setRecipeStockItemId("");
                  setRecipeQuantity("");
                }}
                style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "flex-end" }}
              >
                <div style={{ flex: 1, minWidth: 160 }}>
                  <label
                    style={{
                      fontSize: 12,
                      color: "var(--text-secondary)",
                      display: "block",
                      marginBottom: 4,
                    }}
                  >
                    Stok kalemi
                  </label>
                  <select
                    value={recipeStockItemId}
                    onChange={(e) => setRecipeStockItemId(e.target.value)}
                    style={{ width: "100%", fontSize: 16 }}
                  >
                    <option value="">Seçin</option>
                    {stockItems.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.unit})
                      </option>
                    ))}
                  </select>
                </div>
                <div style={{ width: 110 }}>
                  <label
                    style={{
                      fontSize: 12,
                      color: "var(--text-secondary)",
                      display: "block",
                      marginBottom: 4,
                    }}
                  >
                    Miktar
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={recipeQuantity}
                    onChange={(e) => setRecipeQuantity(e.target.value)}
                    placeholder="0"
                    style={{ width: "100%", fontSize: 16 }}
                  />
                </div>
                <button
                  type="submit"
                  style={{
                    background: "var(--fill-accent)",
                    color: "var(--on-accent)",
                    border: "none",
                    fontSize: 13,
                  }}
                >
                  + Reçeteye ekle
                </button>
              </form>
            </>
          )}
        </div>
      )}
    </div>
  );
}
