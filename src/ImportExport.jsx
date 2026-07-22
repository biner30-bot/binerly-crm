import { useState } from "react";
import { Modal } from "./shared";

// ---- Dosya ayrıştırma ----

function detectDelimiter(sampleLine) {
  const semi = (sampleLine.match(/;/g) || []).length;
  const comma = (sampleLine.match(/,/g) || []).length;
  return semi >= comma ? ";" : ",";
}

export function parseCsvText(text) {
  const clean = text.replace(/^﻿/, "");
  const delimiter = detectDelimiter((clean.split(/\r?\n/)[0] || ""));
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (inQuotes) {
      if (ch === '"') {
        if (clean[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && clean[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.some((f) => f !== "")) rows.push(row);
      row = [];
    } else {
      field += ch;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    if (row.some((f) => f !== "")) rows.push(row);
  }
  if (rows.length === 0) return { headers: [], rows: [] };
  const [headers, ...dataRows] = rows;
  return { headers, rows: dataRows };
}

export async function parseXlsxFile(file) {
  const XLSX = await import("xlsx");
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: "array" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const data = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: "" });
  if (data.length === 0) return { headers: [], rows: [] };
  const [headers, ...rows] = data;
  return {
    headers: headers.map((h) => String(h ?? "")),
    rows: rows.map((r) => r.map((c) => (c == null ? "" : String(c)))),
  };
}

export function parseVcfText(text) {
  const unfolded = text.replace(/\r\n[ \t]/g, "").replace(/\n[ \t]/g, "");
  const cards = unfolded.split(/BEGIN:VCARD/i).slice(1);
  return cards
    .map((block) => {
      const fn = block.match(/\n?FN(?:;[^:]*)?:(.*)/i);
      const tel = block.match(/\n?TEL(?:;[^:]*)?:(.*)/i);
      const email = block.match(/\n?EMAIL(?:;[^:]*)?:(.*)/i);
      return {
        name: (fn?.[1] || "").trim(),
        phone: (tel?.[1] || "").trim(),
        email: (email?.[1] || "").trim(),
      };
    })
    .filter((c) => c.name);
}

const FIELD_KEYWORDS = {
  name: ["ad", "isim", "müşteri", "firma", "name", "unvan"],
  sector: ["sektör", "sector"],
  region: ["bölge", "şehir", "il", "region", "city"],
  address: ["adres", "address"],
  phone: ["telefon", "tel", "phone", "gsm", "cep"],
  email: ["eposta", "e-posta", "email", "mail"],
  notes: ["not", "note", "açıklama"],
  customerName: ["müşteri", "firma", "customer"],
  title: ["başlık", "title", "konu", "teklif"],
  value: ["tutar", "değer", "value", "fiyat"],
  cost: ["gider", "maliyet", "cost"],
  stage: ["aşama", "stage", "durum"],
  subject: ["konu", "başlık", "subject"],
  priority: ["öncelik", "priority"],
  status: ["durum", "status"],
  content: ["içerik", "content", "yanıt", "cevap"],
  category: ["kategori", "category"],
};

export function guessColumnMapping(headers, fieldDefs) {
  const mapping = {};
  const used = new Set();
  for (const f of fieldDefs) {
    const keywords = FIELD_KEYWORDS[f.key] || [f.label.toLowerCase()];
    let bestIdx = -1;
    headers.forEach((h, i) => {
      if (used.has(i) || bestIdx !== -1) return;
      const hLower = (h || "").toLowerCase();
      if (keywords.some((k) => hLower.includes(k))) bestIdx = i;
    });
    mapping[f.key] = bestIdx;
    if (bestIdx !== -1) used.add(bestIdx);
  }
  return mapping;
}

// ---- Satır doğrulama/normalize ----

function normalizeRecord(rawObj, fieldDefs, customers) {
  const record = {};
  const errors = [];
  for (const f of fieldDefs) {
    let val = (rawObj[f.key] ?? "").toString().trim();
    if (f.resolveCustomer) {
      if (!val) { errors.push(`${f.label} boş olamaz`); record.customerId = null; continue; }
      const matches = customers.filter((c) => c.name.trim().toLowerCase() === val.toLowerCase());
      if (matches.length === 0) errors.push(`Müşteri bulunamadı: "${val}"`);
      else if (matches.length > 1) errors.push(`Birden fazla müşteri eşleşti: "${val}"`);
      record.customerId = matches.length === 1 ? matches[0].id : null;
      record.customerName = val;
      continue;
    }
    if (f.type === "number") {
      record[f.key] = Number(val.replace(",", ".")) || 0;
      continue;
    }
    if (f.type === "enum") {
      if (!val) { record[f.key] = f.enumDefault; continue; }
      const lower = val.toLowerCase();
      const exact = f.enumOptions.find((o) => o.id.toLowerCase() === lower || o.label.toLowerCase() === lower);
      const partial = f.enumOptions.find((o) => lower.includes(o.label.toLowerCase()) || o.label.toLowerCase().includes(lower));
      record[f.key] = (exact || partial)?.id || f.enumDefault;
      continue;
    }
    if (f.key === "sector" && val.toLowerCase() === "diğer") val = "";
    if (f.required && !val) errors.push(`${f.label} boş olamaz`);
    record[f.key] = val;
  }
  return { record, errors };
}

// ---- İçe Aktar Modalı ----

export function ImportModal({
  entityType,
  entityLabel,
  fieldDefs,
  customers = [],
  allowVcf = false,
  checkDuplicate,
  onImport,
  onClose,
}) {
  const [step, setStep] = useState("file");
  const [parsed, setParsed] = useState(null); // { headers, rows }
  const [vcfRecords, setVcfRecords] = useState(null);
  const [mapping, setMapping] = useState({});
  const [records, setRecords] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [result, setResult] = useState(null);
  const [fileError, setFileError] = useState("");

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileError("");
    const ext = file.name.split(".").pop().toLowerCase();
    try {
      if (ext === "vcf") {
        const text = await file.text();
        const cards = parseVcfText(text);
        if (cards.length === 0) { setFileError("Dosyada okunabilir bir kişi bulunamadı."); return; }
        setVcfRecords(cards);
        buildRecordsFromRaw(cards);
        setStep("preview");
        return;
      }
      if (ext === "xlsx" || ext === "xls") {
        const { headers, rows } = await parseXlsxFile(file);
        if (headers.length === 0) { setFileError("Dosyada veri bulunamadı."); return; }
        setParsed({ headers, rows });
        setMapping(guessColumnMapping(headers, fieldDefs));
        setStep("mapping");
        return;
      }
      const text = await file.text();
      const { headers, rows } = parseCsvText(text);
      if (headers.length === 0) { setFileError("Dosyada veri bulunamadı."); return; }
      setParsed({ headers, rows });
      setMapping(guessColumnMapping(headers, fieldDefs));
      setStep("mapping");
    } catch {
      setFileError("Dosya okunamadı. Lütfen geçerli bir CSV/Excel" + (allowVcf ? "/vCard" : "") + " dosyası seçin.");
    }
  };

  const buildRecordsFromRaw = (rawObjs) => {
    const built = rawObjs.map((rawObj) => {
      const { record, errors } = normalizeRecord(rawObj, fieldDefs, customers);
      const duplicate = errors.length === 0 && checkDuplicate ? checkDuplicate(record) : false;
      return { ...record, _errors: errors, _duplicate: duplicate };
    });
    setRecords(built);
    setSelected(new Set(built.map((_, i) => i).filter((i) => built[i]._errors.length === 0)));
  };

  const confirmMapping = () => {
    const rawObjs = parsed.rows.map((row) => {
      const obj = {};
      for (const f of fieldDefs) {
        const idx = mapping[f.key];
        obj[f.key] = idx != null && idx >= 0 ? row[idx] ?? "" : "";
      }
      return obj;
    });
    buildRecordsFromRaw(rawObjs);
    setStep("preview");
  };

  const toggleRow = (i) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  };

  const runImport = async () => {
    const toImport = records.filter((r, i) => selected.has(i) && r._errors.length === 0);
    if (toImport.length === 0) return;
    setStep("importing");
    setProgress({ done: 0, total: toImport.length });
    const outcome = await onImport(toImport, (done) => setProgress({ done, total: toImport.length }));
    setResult(outcome);
    setStep("done");
  };

  const previewFields = fieldDefs.filter((f) => !f.hideInPreview);

  return (
    <Modal title={`${entityLabel} — İçe Aktar`} onClose={onClose}>
      {step === "file" && (
        <div>
          <p style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.6, marginBottom: 12 }}>
            Excel (.xlsx) veya CSV dosyanızı seçin{allowVcf ? ", ya da telefonunuzun Kişiler uygulamasından dışa aktardığınız bir vCard (.vcf) dosyası yükleyin" : ""}.
          </p>
          {allowVcf && (
            <p style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.6, marginBottom: 12 }}>
              Not: WhatsApp'ın kendi bir "kişi dışa aktar" özelliği yoktur — telefonunuzun Kişiler/Contacts uygulamasından vCard dışa aktarabilirsiniz.
              Word belgesindeki bir tabloyu aktarmak isterseniz, tabloyu kopyalayıp Excel'e yapıştırıp CSV olarak kaydetmeniz yeterli.
            </p>
          )}
          <input type="file" accept={allowVcf ? ".csv,.xlsx,.xls,.vcf" : ".csv,.xlsx,.xls"} onChange={handleFile} />
          {fileError && <p style={{ fontSize: 13, color: "var(--text-danger)", marginTop: 10 }}>{fileError}</p>}
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
            <button onClick={onClose}>Kapat</button>
          </div>
        </div>
      )}

      {step === "mapping" && parsed && (
        <div>
          <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 12 }}>
            Dosyanızdaki sütunları Binerly alanlarıyla eşleştirin.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, maxHeight: 360, overflowY: "auto" }}>
            {fieldDefs.map((f) => (
              <div key={f.key} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 13, minWidth: 160 }}>
                  {f.label}{f.required && <span style={{ color: "var(--text-danger)" }}> *</span>}
                </span>
                <select
                  value={mapping[f.key] ?? -1}
                  onChange={(e) => setMapping((prev) => ({ ...prev, [f.key]: Number(e.target.value) }))}
                  style={{ flex: 1 }}
                >
                  <option value={-1}>Yoksay</option>
                  {parsed.headers.map((h, i) => <option key={i} value={i}>{h || `Sütun ${i + 1}`}</option>)}
                </select>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
            <button onClick={onClose}>Vazgeç</button>
            <button onClick={confirmMapping} style={{ background: "var(--fill-accent)", color: "var(--on-accent)", border: "none" }}>
              Devam et
            </button>
          </div>
        </div>
      )}

      {step === "preview" && (
        <div>
          <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 12 }}>
            {records.length} satır bulundu, {selected.size} tanesi işaretli olarak içe aktarılacak.
          </p>
          <div style={{ maxHeight: 380, overflowY: "auto", border: "0.5px solid var(--border)", borderRadius: "var(--radius)" }}>
            {records.map((r, i) => (
              <div
                key={i}
                style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "8px 10px", borderBottom: "0.5px solid var(--border)" }}
              >
                <input
                  type="checkbox"
                  checked={selected.has(i)}
                  disabled={r._errors.length > 0}
                  onChange={() => toggleRow(i)}
                  style={{ marginTop: 3 }}
                />
                <div style={{ flex: 1, fontSize: 13 }}>
                  {previewFields.map((f) => {
                    const rawVal = r[f.key];
                    const displayVal = f.type === "enum" && f.enumOptions
                      ? f.enumOptions.find((o) => o.id === rawVal)?.label || rawVal
                      : rawVal;
                    return (
                      <span key={f.key} style={{ marginRight: 10, color: "var(--text-secondary)" }}>
                        {f.label}: <strong style={{ color: "var(--text-primary)" }}>{String(displayVal ?? "")}</strong>
                      </span>
                    );
                  })}
                  {r._duplicate && <div style={{ fontSize: 11, color: "var(--text-warning)", marginTop: 2 }}>⚠ Bu isimde bir kayıt zaten var</div>}
                  {r._errors.length > 0 && (
                    <div style={{ fontSize: 11, color: "var(--text-danger)", marginTop: 2 }}>✗ {r._errors.join(", ")}</div>
                  )}
                  {r._errors.length === 0 && !r._duplicate && (
                    <div style={{ fontSize: 11, color: "var(--text-success)", marginTop: 2 }}>✓ Geçerli</div>
                  )}
                </div>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
            <button onClick={onClose}>Vazgeç</button>
            <button
              onClick={runImport}
              disabled={selected.size === 0}
              style={{ background: "var(--fill-accent)", color: "var(--on-accent)", border: "none" }}
            >
              {selected.size} kaydı içe aktar
            </button>
          </div>
        </div>
      )}

      {step === "importing" && (
        <p style={{ fontSize: 13, color: "var(--text-secondary)" }}>
          İçe aktarılıyor… {progress.done}/{progress.total}
        </p>
      )}

      {step === "done" && result && (
        <div>
          <p style={{ fontSize: 14 }}>
            <strong>{result.insertedCount}</strong> kayıt başarıyla içe aktarıldı
            {result.errors.length > 0 && <>, <strong style={{ color: "var(--text-danger)" }}>{result.errors.length}</strong> hata oluştu</>}.
          </p>
          {result.errors.length > 0 && (
            <ul style={{ fontSize: 12, color: "var(--text-danger)", paddingLeft: 18 }}>
              {result.errors.map((e, i) => <li key={i}>{e}</li>)}
            </ul>
          )}
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
            <button onClick={onClose} style={{ background: "var(--fill-accent)", color: "var(--on-accent)", border: "none" }}>Kapat</button>
          </div>
        </div>
      )}
    </Modal>
  );
}
