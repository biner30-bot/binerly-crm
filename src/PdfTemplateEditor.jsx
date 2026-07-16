import { useState, useEffect } from "react";
import { uid } from "./shared";
import { renderTemplateBlocks, MERGE_FIELD_OPTIONS, SAMPLE_MERGE_DATA, SAMPLE_LINE_ITEMS } from "./PdfTemplates";

const DEFAULT_TEXT_HEIGHT = 24;

function newBlock(type, canvasWidth) {
  const base = { id: uid(), x: 60, y: 60 };
  if (type === "text") return { ...base, type, content: "Yeni metin", w: 220, h: DEFAULT_TEXT_HEIGHT, fontSize: 13, fontWeight: 400, color: "#0c2540", align: "left", textTransform: "none" };
  if (type === "image") return { ...base, type, src: "{{logo_url}}", w: 120, h: 50 };
  if (type === "rect") return { ...base, type, w: 160, h: 80, color: "#e1e8f0" };
  // h burada gerçek çizgi kalınlığı değil — renderTemplateBlocks çizgiyi hep
  // 1px çiziyor, bu sadece editörde tıklayıp seçebilmek için daha kolay bir
  // hit-target yüksekliği.
  if (type === "line") return { ...base, type, w: 200, h: 10, color: "#5b7088" };
  return { ...base, type: "table", x: 32, y: 60, w: canvasWidth - 64, h: 170, accentColor: "#0c2540" };
}

const BLOCK_LIBRARY = [
  { type: "text", label: "+ Metin" },
  { type: "image", label: "+ Logo" },
  { type: "rect", label: "+ Dikdörtgen" },
  { type: "line", label: "+ Çizgi" },
  { type: "table", label: "+ Tablo" },
];

// Fare ile sürükleme/yeniden boyutlandırma — bu projede react-dnd/interact.js
// gibi bir kütüphane eklenmiyor (gereksiz bağımlılık), düz mousedown/move/up
// yeterli. onMove/onUp aynı çağrı içinde tanımlanıp eklendiği/kaldırıldığı
// için (kapatma referansı) her sürükleme oturumu kendi içinde tutarlı.
function startDrag(block, mode, setBlocks, e) {
  e.stopPropagation();
  const startX = e.clientX;
  const startY = e.clientY;
  const orig = { x: block.x, y: block.y, w: block.w, h: block.h ?? DEFAULT_TEXT_HEIGHT };
  const onMove = (ev) => {
    const dx = ev.clientX - startX;
    const dy = ev.clientY - startY;
    setBlocks((prev) =>
      prev.map((b) => {
        if (b.id !== block.id) return b;
        if (mode === "move") return { ...b, x: Math.round(orig.x + dx), y: Math.round(orig.y + dy) };
        return { ...b, w: Math.max(20, Math.round(orig.w + dx)), h: Math.max(14, Math.round(orig.h + dy)) };
      })
    );
  };
  const onUp = () => {
    window.removeEventListener("mousemove", onMove);
    window.removeEventListener("mouseup", onUp);
  };
  window.addEventListener("mousemove", onMove);
  window.addEventListener("mouseup", onUp);
}

export function TemplateEditor({ initialTemplate, onSave, onClose }) {
  const [name, setName] = useState(initialTemplate.name || "");
  const [blocks, setBlocks] = useState(initialTemplate.blocks);
  const [selectedId, setSelectedId] = useState(null);
  const [saving, setSaving] = useState(false);
  const { width, height } = initialTemplate;

  const selectedBlock = blocks.find((b) => b.id === selectedId) || null;

  const updateSelectedBlock = (patch) => {
    setBlocks((prev) => prev.map((b) => (b.id === selectedId ? { ...b, ...patch } : b)));
  };

  const addBlock = (type) => {
    const b = newBlock(type, width);
    setBlocks((prev) => [...prev, b]);
    setSelectedId(b.id);
  };

  const deleteSelected = () => {
    setBlocks((prev) => prev.filter((b) => b.id !== selectedId));
    setSelectedId(null);
  };

  // Seçili blokta ok tuşlarıyla hassas kaydırma (Shift ile 10px) — fareyle
  // piksel hassasiyetinde konumlamak zor olduğu için ucuz ama değerli bir ekleme.
  useEffect(() => {
    if (!selectedId) return;
    const onKeyDown = (e) => {
      if (!["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) return;
      if (["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName)) return;
      e.preventDefault();
      const step = e.shiftKey ? 10 : 1;
      const dx = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
      const dy = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;
      setBlocks((prev) => prev.map((b) => (b.id === selectedId ? { ...b, x: b.x + dx, y: b.y + dy } : b)));
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedId]);

  const handleSave = async () => {
    setSaving(true);
    await onSave({ id: initialTemplate.id || null, name: name.trim() || "Adsız Şablon", width, height, blocks });
    setSaving(false);
  };

  const labelStyle = { fontSize: 12, color: "#5b7088", display: "block", margin: "10px 0 4px" };

  return (
    <div style={{ position: "fixed", inset: 0, background: "#f5f8fc", zIndex: 1500, display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 20px", background: "#fff", borderBottom: "1px solid #e1e8f0", flex: "none" }}>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Şablon adı"
          style={{ fontSize: 14, fontWeight: 600, minWidth: 240 }}
        />
        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !name.trim()}
            style={{ background: "var(--fill-accent)", color: "var(--on-accent)", border: "none" }}
          >
            {saving ? "Kaydediliyor…" : "Kaydet"}
          </button>
          <button type="button" onClick={onClose}>Kapat</button>
        </div>
      </div>

      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        <div style={{ width: 150, flex: "none", borderRight: "1px solid #e1e8f0", background: "#fff", padding: 16, overflowY: "auto" }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: "#5b7088", textTransform: "uppercase", letterSpacing: 0.3, margin: "0 0 10px" }}>Blok Ekle</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {BLOCK_LIBRARY.map((item) => (
              <button key={item.type} type="button" onClick={() => addBlock(item.type)} style={{ fontSize: 12.5, textAlign: "left" }}>
                {item.label}
              </button>
            ))}
          </div>
        </div>

        <div style={{ flex: 1, overflow: "auto", padding: 40, display: "flex", justifyContent: "center" }} onMouseDown={() => setSelectedId(null)}>
          <div
            style={{ width, height, flex: "none", position: "relative", background: "#fff", boxShadow: "0 4px 24px rgba(12,37,64,0.15)" }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            {renderTemplateBlocks(blocks, SAMPLE_MERGE_DATA, SAMPLE_LINE_ITEMS)}
            {blocks.map((b) => (
              <div
                key={b.id}
                onMouseDown={(e) => { setSelectedId(b.id); startDrag(b, "move", setBlocks, e); }}
                style={{
                  position: "absolute", left: b.x, top: b.y, width: b.w, height: b.h ?? DEFAULT_TEXT_HEIGHT,
                  cursor: "move",
                  border: selectedId === b.id ? "1.5px dashed #185fa5" : "1px dashed transparent",
                  boxSizing: "border-box",
                }}
              >
                {selectedId === b.id && (
                  <div
                    onMouseDown={(e) => startDrag(b, "resize", setBlocks, e)}
                    style={{ position: "absolute", right: -5, bottom: -5, width: 10, height: 10, background: "#185fa5", borderRadius: 2, cursor: "nwse-resize" }}
                  />
                )}
              </div>
            ))}
          </div>
        </div>

        <div style={{ width: 280, flex: "none", borderLeft: "1px solid #e1e8f0", background: "#fff", padding: 16, overflowY: "auto" }}>
          {!selectedBlock ? (
            <p style={{ fontSize: 13, color: "#5b7088" }}>Düzenlemek için bir blok seçin, veya soldan yeni bir blok ekleyin.</p>
          ) : (
            <>
              <p style={{ fontSize: 11, fontWeight: 700, color: "#5b7088", textTransform: "uppercase", letterSpacing: 0.3, margin: "0 0 4px" }}>
                {selectedBlock.type === "text" ? "Metin" : selectedBlock.type === "image" ? "Logo" : selectedBlock.type === "rect" ? "Dikdörtgen" : selectedBlock.type === "line" ? "Çizgi" : "Tablo"}
              </p>

              {selectedBlock.type === "text" && (
                <>
                  <label style={labelStyle}>İçerik</label>
                  <textarea
                    value={selectedBlock.content}
                    onChange={(e) => updateSelectedBlock({ content: e.target.value })}
                    style={{ width: "100%", minHeight: 60, resize: "vertical" }}
                  />
                  <select
                    value=""
                    onChange={(e) => { if (e.target.value) updateSelectedBlock({ content: `${selectedBlock.content || ""}{{${e.target.value}}}` }); }}
                    style={{ width: "100%", marginTop: 6, fontSize: 12 }}
                  >
                    <option value="">+ Alan ekle</option>
                    {MERGE_FIELD_OPTIONS.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
                  </select>
                  <label style={labelStyle}>Yazı boyutu</label>
                  <input type="number" min="8" value={selectedBlock.fontSize || 13} onChange={(e) => updateSelectedBlock({ fontSize: Number(e.target.value) })} style={{ width: "100%" }} />
                  <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, margin: "10px 0" }}>
                    <input type="checkbox" checked={selectedBlock.fontWeight === 700} onChange={(e) => updateSelectedBlock({ fontWeight: e.target.checked ? 700 : 400 })} />
                    Kalın
                  </label>
                  <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, margin: "0 0 10px" }}>
                    <input type="checkbox" checked={selectedBlock.textTransform === "uppercase"} onChange={(e) => updateSelectedBlock({ textTransform: e.target.checked ? "uppercase" : "none" })} />
                    BÜYÜK HARF
                  </label>
                  <label style={labelStyle}>Hizalama</label>
                  <div style={{ display: "flex", gap: 4 }}>
                    {[["left", "Sol"], ["center", "Orta"], ["right", "Sağ"]].map(([a, l]) => (
                      <button
                        key={a}
                        type="button"
                        onClick={() => updateSelectedBlock({ align: a })}
                        style={{
                          flex: 1, fontSize: 12,
                          background: (selectedBlock.align || "left") === a ? "var(--fill-accent)" : "var(--surface-1)",
                          color: (selectedBlock.align || "left") === a ? "var(--on-accent)" : "var(--text-primary)",
                          border: "0.5px solid var(--border)",
                        }}
                      >
                        {l}
                      </button>
                    ))}
                  </div>
                  <label style={labelStyle}>Renk</label>
                  <input type="color" value={selectedBlock.color || "#0c2540"} onChange={(e) => updateSelectedBlock({ color: e.target.value })} style={{ width: "100%", height: 32 }} />
                </>
              )}

              {selectedBlock.type === "image" && (
                <p style={{ fontSize: 13, color: "#5b7088" }}>Firma logonuz (Ayarlar → İşletme Bilgileri) otomatik kullanılır.</p>
              )}

              {(selectedBlock.type === "rect" || selectedBlock.type === "line") && (
                <>
                  <label style={labelStyle}>Renk</label>
                  <input type="color" value={selectedBlock.color || "#e1e8f0"} onChange={(e) => updateSelectedBlock({ color: e.target.value })} style={{ width: "100%", height: 32 }} />
                </>
              )}

              {selectedBlock.type === "table" && (
                <>
                  <label style={labelStyle}>Vurgu rengi</label>
                  <input type="color" value={selectedBlock.accentColor || "#0c2540"} onChange={(e) => updateSelectedBlock({ accentColor: e.target.value })} style={{ width: "100%", height: 32 }} />
                </>
              )}

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 14, paddingTop: 14, borderTop: "0.5px solid var(--border)" }}>
                <div>
                  <label style={labelStyle}>X</label>
                  <input type="number" value={selectedBlock.x} onChange={(e) => updateSelectedBlock({ x: Number(e.target.value) })} style={{ width: "100%" }} />
                </div>
                <div>
                  <label style={labelStyle}>Y</label>
                  <input type="number" value={selectedBlock.y} onChange={(e) => updateSelectedBlock({ y: Number(e.target.value) })} style={{ width: "100%" }} />
                </div>
                <div>
                  <label style={labelStyle}>Genişlik</label>
                  <input type="number" value={selectedBlock.w} onChange={(e) => updateSelectedBlock({ w: Number(e.target.value) })} style={{ width: "100%" }} />
                </div>
                {selectedBlock.type !== "line" && (
                  <div>
                    <label style={labelStyle}>Yükseklik</label>
                    <input type="number" value={selectedBlock.h ?? DEFAULT_TEXT_HEIGHT} onChange={(e) => updateSelectedBlock({ h: Number(e.target.value) })} style={{ width: "100%" }} />
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={deleteSelected}
                style={{ width: "100%", marginTop: 14, background: "var(--bg-danger)", color: "var(--text-danger)", border: "none" }}
              >
                Bloğu Sil
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
