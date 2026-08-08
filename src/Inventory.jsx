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
                text="Opsiyonel - girerseniz, bu hizmet bir randevuya kalem olarak eklendiğinde randevunun süresi buna göre hesaplanır; aynı randevuda birden fazla hizmet varsa süreleri toplanır ve çakışma kontrolü buna göre yapılır. Ayrıca randevu alma ekranında müşteriye tahmini süre olarak gösterilir - boş bırakırsanız müşteriye süre bilgisi gösterilmez."
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

export function PriceListManager({ items, onAdd, onUpdate, onDelete, sector, resources }) {
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [refreshDays, setRefreshDays] = useState("");
  const [durationMinutes, setDurationMinutes] = useState("");
  const [resourceId, setResourceId] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [editingItem, setEditingItem] = useState(null);
  const [search, setSearch] = useState("");
  const query = search.trim().toLowerCase();
  const filteredItems = query
    ? items.filter((item) => item.name.toLowerCase().includes(query))
    : items;

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
    });
    setName("");
    setPrice("");
    setRefreshDays("");
    setDurationMinutes("");
    setResourceId("");
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
          {items.length > 5 && (
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Ürün/hizmet ara..."
              style={{ width: "100%", marginBottom: 8, fontSize: 13 }}
            />
          )}
          {filteredItems.length === 0 ? (
            <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 16 }}>
              Aramayla eşleşen kayıt yok.
            </p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 16 }}>
              {filteredItems.map((item) => (
                <div
                  key={item.id}
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
            style={{ width: "100%", fontSize: 13 }}
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
            style={{ width: "100%", fontSize: 13 }}
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
              text="Opsiyonel - girerseniz, bu hizmet bir randevuya kalem olarak eklendiğinde randevunun süresi buna göre hesaplanır; aynı randevuda birden fazla hizmet varsa süreleri toplanır ve çakışma kontrolü buna göre yapılır. Ayrıca randevu alma ekranında müşteriye tahmini süre olarak gösterilir - boş bırakırsanız müşteriye süre bilgisi gösterilmez."
            />
          </label>
          <input
            type="number"
            min="0"
            value={durationMinutes}
            onChange={(e) => setDurationMinutes(e.target.value)}
            placeholder="Opsiyonel"
            style={{ width: "100%", fontSize: 13 }}
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
            style={{ width: "100%", fontSize: 13 }}
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
              style={{ width: "100%", fontSize: 13 }}
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

export function StockManager({
  stockItems,
  priceListItems,
  priceItemIngredients,
  sector,
  onAddStock,
  onUpdateStock,
  onDeleteStock,
  onAddIngredient,
  onDeleteIngredient,
}) {
  const [tab, setTab] = useState("stok");
  const [name, setName] = useState("");
  const [unit, setUnit] = useState("adet");
  const [quantityOnHand, setQuantityOnHand] = useState("");
  const [reorderThreshold, setReorderThreshold] = useState("");
  const [supplierName, setSupplierName] = useState("");
  const [editingItem, setEditingItem] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);

  const [recipePriceItemId, setRecipePriceItemId] = useState(priceListItems[0]?.id || "");
  const [recipeStockItemId, setRecipeStockItemId] = useState("");
  const [recipeQuantity, setRecipeQuantity] = useState("");

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
    });
    setName("");
    setUnit("adet");
    setQuantityOnHand("");
    setReorderThreshold("");
    setSupplierName("");
  };

  const recipeRows = priceItemIngredients.filter((i) => i.priceItemId === recipePriceItemId);

  return (
    <div>
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
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 16 }}>
              {stockItems.map((item) => {
                const low =
                  item.reorderThreshold != null && item.quantityOnHand <= item.reorderThreshold;
                return (
                  <div
                    key={item.id}
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
                    <div style={{ minWidth: 0 }}>
                      <p style={{ margin: 0, fontSize: 13, fontWeight: 500 }}>{item.name}</p>
                      {item.supplierName && (
                        <p style={{ margin: 0, fontSize: 11, color: "var(--text-muted)" }}>
                          Tedarikçi: {item.supplierName}
                        </p>
                      )}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                      <Badge tone={low ? "danger" : "accent"}>
                        {item.quantityOnHand} {item.unit}
                      </Badge>
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
                style={{ width: "100%", fontSize: 13 }}
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
                style={{ width: "100%", fontSize: 13 }}
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
                style={{ width: "100%", fontSize: 13 }}
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
                style={{ width: "100%", fontSize: 13 }}
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
                style={{ width: "100%", fontSize: 13 }}
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
                  style={{ width: "100%", fontSize: 13 }}
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
                    style={{ width: "100%", fontSize: 13 }}
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
                    style={{ width: "100%", fontSize: 13 }}
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
