import React, { useState } from "react";
import { InfoTip, formatTL } from "./shared";
import {
  DEED_TAX_SPLITS,
  SERVICE_FEE_PAYERS,
  computeTransactionCosts,
  transactionLabel,
} from "./realEstate";

const labelStyle = {
  fontSize: 12,
  color: "var(--text-secondary)",
  display: "flex",
  alignItems: "center",
  gap: 4,
  marginBottom: 4,
};

function Row({ label, value, strong, muted }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        gap: 12,
        fontSize: 13,
        padding: "4px 0",
        fontWeight: strong ? 600 : 400,
        color: muted ? "var(--text-muted)" : undefined,
        borderTop: strong ? "0.5px solid var(--border)" : undefined,
        marginTop: strong ? 4 : 0,
      }}
    >
      <span>{label}</span>
      <span style={{ whiteSpace: "nowrap" }}>{value}</span>
    </div>
  );
}

function Card({ title, children }) {
  return (
    <div
      style={{
        flex: "1 1 240px",
        border: "0.5px solid var(--border)",
        borderRadius: 8,
        padding: 12,
        background: "var(--surface-1)",
      }}
    >
      <p style={{ fontSize: 13, fontWeight: 600, margin: "0 0 6px" }}>{title}</p>
      {children}
    </div>
  );
}

const feeLabel = (fee, kdvPercent) =>
  `${formatTL(fee.net)} + %${kdvPercent} KDV = ${formatTL(fee.total)}`;

// Müşteriye verilecek döküm - sadece o tarafı ilgilendiren satırlar, ofisin
// komisyon bölüşümü/kendi net kazancı ASLA basılmaz.
function printBreakdown({ title, rows, companySettings, note }) {
  const win = window.open("", "_blank");
  if (!win) return false;
  const esc = (s) =>
    String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  const body = rows
    .map(
      ([label, value, strong]) =>
        `<tr class="${strong ? "strong" : ""}"><td>${esc(label)}</td><td>${esc(value)}</td></tr>`,
    )
    .join("");
  win.document
    .write(`<!doctype html><html lang="tr"><head><meta charset="utf-8"/><title>${esc(title)}</title>
<style>
body{font-family:Arial,sans-serif;color:#111;max-width:640px;margin:32px auto;padding:0 24px;font-size:13px}
h1{font-size:16px;margin:0 0 4px}.sub{color:#555;margin:0 0 16px}
table{width:100%;border-collapse:collapse}td{padding:6px 0;border-bottom:1px solid #eee}td:last-child{text-align:right;white-space:nowrap}
tr.strong td{font-weight:bold;border-top:1px solid #111}
.note{margin-top:16px;font-size:11px;color:#666;line-height:1.5}
.logo img{max-height:44px;margin-bottom:12px}
</style></head><body>
${companySettings?.logoUrl ? `<div class="logo"><img src="${esc(companySettings.logoUrl)}" alt=""/></div>` : ""}
<h1>${esc(title)}</h1><p class="sub">${esc(companySettings?.companyName || "")} - ${esc(new Date().toLocaleDateString("tr-TR"))}</p>
<table>${body}</table>
<p class="note">${esc(note)}</p>
<script>window.onload=function(){window.print()}</script>
</body></html>`);
  win.document.close();
  return true;
}

const ESTIMATE_NOTE =
  "Bu döküm bilgilendirme amaçlı bir tahmindir. Tapu harcı ve döner sermaye tutarları ilgili tapu müdürlüğü ve güncel mevzuata göre değişebilir; kesin tutar tapu işlemi sırasında belirlenir.";

export function CostCalculator({ property, companySettings, notify }) {
  const [price, setPrice] = useState(property.price ?? "");
  const [deedValue, setDeedValue] = useState("");
  const [withCredit, setWithCredit] = useState(false);
  const [deedTaxSplit, setDeedTaxSplit] = useState("yasal");
  const [feePayer, setFeePayer] = useState("her_iki");
  const [mortgagePayoff, setMortgagePayoff] = useState("");
  const [monthlyRent, setMonthlyRent] = useState(property.details?.monthly_rent ?? "");
  const [deposit, setDeposit] = useState(property.details?.deposit ?? "");
  const [partnerSharePercent, setPartnerSharePercent] = useState("");

  const tx = property.transactionType;
  const r = computeTransactionCosts(
    {
      transactionType: tx,
      price,
      deedValue,
      withCredit,
      deedTaxSplit,
      feePayer,
      mortgagePayoff,
      monthlyRent,
      deposit,
      partnerSharePercent,
    },
    companySettings?.realEstateSettings,
  );
  const k = r.kdvPercent;

  const numberInput = (value, setter, placeholder) => (
    <input
      type="number"
      min="0"
      value={value}
      placeholder={placeholder}
      onChange={(e) => setter(e.target.value)}
      style={{ width: "100%" }}
    />
  );

  const doPrint = (title, rows) => {
    const ok = printBreakdown({ title, rows, companySettings, note: ESTIMATE_NOTE });
    if (!ok) notify("Yazdırma penceresi açılamadı - tarayıcının açılır pencere engelini kaldırın.");
  };

  return (
    <div>
      <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: "0 0 12px" }}>
        {property.title} ({transactionLabel(tx)}) - oranlar Ayarlar &gt; Emlak ayarlarından gelir.
      </p>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
        <div style={{ flex: "1 1 160px" }}>
          <label style={labelStyle}>
            {tx === "satilik"
              ? "Satış bedeli (TL)"
              : tx === "kiralik"
                ? "Aylık kira (TL)"
                : "Devir bedeli (TL)"}
          </label>
          {numberInput(price, setPrice)}
        </div>
        {tx === "satilik" && (
          <>
            <div style={{ flex: "1 1 160px" }}>
              <label style={labelStyle}>
                Tapuda gösterilecek bedel
                <InfoTip text="Tapu harcı bu bedel üzerinden alınır. Boş bırakılırsa satış bedeli kullanılır. Belediye rayiç bedelinin altında olamaz; kredili işlemde kredi tutarının altında olamaz." />
              </label>
              {numberInput(deedValue, setDeedValue, "Satış bedeliyle aynı")}
            </div>
            <div style={{ flex: "1 1 160px" }}>
              <label style={labelStyle}>İpotek kapama tutarı</label>
              {numberInput(mortgagePayoff, setMortgagePayoff, "Yoksa boş")}
            </div>
          </>
        )}
        {tx === "devren_kiralik" && (
          <div style={{ flex: "1 1 160px" }}>
            <label style={labelStyle}>Aylık kira (TL)</label>
            {numberInput(monthlyRent, setMonthlyRent)}
          </div>
        )}
        {tx !== "satilik" && (
          <div style={{ flex: "1 1 160px" }}>
            <label style={labelStyle}>Depozito (TL)</label>
            {numberInput(deposit, setDeposit)}
          </div>
        )}
      </div>

      {tx === "satilik" && (
        <div
          style={{
            display: "flex",
            gap: 12,
            flexWrap: "wrap",
            marginBottom: 12,
            alignItems: "flex-end",
          }}
        >
          <div style={{ flex: "1 1 200px" }}>
            <label style={labelStyle}>Tapu harcı</label>
            <select
              value={deedTaxSplit}
              onChange={(e) => setDeedTaxSplit(e.target.value)}
              style={{ width: "100%" }}
            >
              {DEED_TAX_SPLITS.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div style={{ flex: "1 1 200px" }}>
            <label style={labelStyle}>Hizmet bedeli</label>
            <select
              value={feePayer}
              onChange={(e) => setFeePayer(e.target.value)}
              style={{ width: "100%" }}
            >
              {SERVICE_FEE_PAYERS.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <label
            style={{
              fontSize: 13,
              display: "flex",
              alignItems: "center",
              gap: 6,
              paddingBottom: 6,
            }}
          >
            <input
              type="checkbox"
              checked={withCredit}
              onChange={(e) => setWithCredit(e.target.checked)}
            />
            Kredili satış
            <InfoTip text="Kredili işlemlerde tapu müdürlüğü döner sermayeyi 2 adet (satış + ipotek), nakit satışta 1 adet alır." />
          </label>
        </div>
      )}

      {tx === "satilik" && r.revolvingMissing && (
        <p
          style={{
            fontSize: 12,
            margin: "0 0 12px",
            padding: "6px 10px",
            background: "var(--bg-warning)",
            borderRadius: 6,
          }}
        >
          Tapu döner sermaye ücreti ayarlarda girilmemiş, hesaba 0 TL olarak katıldı. Ayarlar &gt;
          İşletme Bilgileri &gt; Emlak ayarlarından ekleyin.
        </p>
      )}

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
        {tx === "satilik" && (
          <>
            <Card title="Satıcı">
              <Row label="Satış bedeli" value={formatTL(r.price)} />
              <Row
                label={`Tapu harcı (%${r.settings.titleDeedTaxPercent})`}
                value={`- ${formatTL(r.seller.deedTax)}`}
              />
              <Row label="Hizmet bedeli" value={`- ${formatTL(r.seller.fee.total)}`} />
              {r.seller.fee.net > 0 && <Row label="" value={feeLabel(r.seller.fee, k)} muted />}
              {r.seller.mortgagePayoff > 0 && (
                <Row label="İpotek kapama" value={`- ${formatTL(r.seller.mortgagePayoff)}`} />
              )}
              <Row label="Satıcının net eline geçen" value={formatTL(r.seller.net)} strong />
              <button
                type="button"
                style={{ fontSize: 12, marginTop: 8 }}
                onClick={() =>
                  doPrint(`Satış masraf dökümü - ${property.title}`, [
                    ["Satış bedeli", formatTL(r.price)],
                    [`Tapu harcı (satıcı payı)`, `- ${formatTL(r.seller.deedTax)}`],
                    [`Hizmet bedeli (KDV dahil)`, `- ${formatTL(r.seller.fee.total)}`],
                    ...(r.seller.mortgagePayoff > 0
                      ? [["İpotek kapama", `- ${formatTL(r.seller.mortgagePayoff)}`]]
                      : []),
                    ["Net elinize geçecek tutar", formatTL(r.seller.net), true],
                  ])
                }
              >
                <i className="ti ti-printer" aria-hidden="true" /> Satıcıya çıktı
              </button>
            </Card>
            <Card title="Alıcı">
              <Row label="Satış bedeli" value={formatTL(r.price)} />
              <Row
                label={`Tapu harcı (%${r.settings.titleDeedTaxPercent})`}
                value={`+ ${formatTL(r.buyer.deedTax)}`}
              />
              <Row
                label={`Döner sermaye (${r.revolvingCount} adet)`}
                value={`+ ${formatTL(r.buyer.revolving)}`}
              />
              <Row label="Hizmet bedeli" value={`+ ${formatTL(r.buyer.fee.total)}`} />
              {r.buyer.fee.net > 0 && <Row label="" value={feeLabel(r.buyer.fee, k)} muted />}
              <Row label="Alıcının toplam maliyeti" value={formatTL(r.buyer.total)} strong />
              <button
                type="button"
                style={{ fontSize: 12, marginTop: 8 }}
                onClick={() =>
                  doPrint(`Satın alma masraf dökümü - ${property.title}`, [
                    ["Satış bedeli", formatTL(r.price)],
                    ["Tapu harcı (alıcı payı)", `+ ${formatTL(r.buyer.deedTax)}`],
                    [
                      `Döner sermaye (${r.revolvingCount} adet)`,
                      `+ ${formatTL(r.buyer.revolving)}`,
                    ],
                    ["Hizmet bedeli (KDV dahil)", `+ ${formatTL(r.buyer.fee.total)}`],
                    ["Toplam maliyetiniz", formatTL(r.buyer.total), true],
                  ])
                }
              >
                <i className="ti ti-printer" aria-hidden="true" /> Alıcıya çıktı
              </button>
            </Card>
          </>
        )}
        {tx === "kiralik" && (
          <Card title="Kiracı">
            <Row label="İlk ay kira" value={formatTL(r.rent)} />
            <Row label="Depozito" value={formatTL(r.deposit)} />
            <Row
              label={`Hizmet bedeli (${r.settings.rentMonths} aylık kira)`}
              value={formatTL(r.tenant.fee.total)}
            />
            <Row label="" value={feeLabel(r.tenant.fee, k)} muted />
            <Row label="Kiracının ilk ödemesi" value={formatTL(r.tenant.firstPayment)} strong />
            <button
              type="button"
              style={{ fontSize: 12, marginTop: 8 }}
              onClick={() =>
                doPrint(`Kiralama masraf dökümü - ${property.title}`, [
                  ["İlk ay kira", formatTL(r.rent)],
                  ["Depozito", formatTL(r.deposit)],
                  ["Hizmet bedeli (KDV dahil)", formatTL(r.tenant.fee.total)],
                  ["İlk ödeme toplamı", formatTL(r.tenant.firstPayment), true],
                ])
              }
            >
              <i className="ti ti-printer" aria-hidden="true" /> Kiracıya çıktı
            </button>
          </Card>
        )}
        {tx === "devren_kiralik" && (
          <>
            <Card title="Devreden">
              <Row label="Devir bedeli" value={formatTL(r.transferPrice)} />
              <Row
                label={`Hizmet bedeli (%${r.settings.transferPercent})`}
                value={`- ${formatTL(r.transferor.fee.total)}`}
              />
              <Row label="" value={feeLabel(r.transferor.fee, k)} muted />
              <Row label="Devredenin net eline geçen" value={formatTL(r.transferor.net)} strong />
            </Card>
            <Card title="Devralan (yeni kiracı)">
              <Row label="Devir bedeli" value={formatTL(r.transferPrice)} />
              <Row label="İlk ay kira" value={formatTL(r.rent)} />
              <Row label="Depozito" value={formatTL(r.deposit)} />
              <Row label="Hizmet bedeli" value={formatTL(r.transferee.fee.total)} />
              <Row label="Devralanın toplam ödemesi" value={formatTL(r.transferee.total)} strong />
            </Card>
          </>
        )}
      </div>

      <Card title="Ofisin hizmet bedeli">
        <Row label="Toplam hizmet bedeli (KDV hariç)" value={formatTL(r.commission.totalNet)} />
        <div style={{ display: "flex", gap: 8, alignItems: "center", margin: "6px 0" }}>
          <label style={{ ...labelStyle, margin: 0, flex: 1 }}>
            Hizmet ortağının payı (%)
            <InfoTip text="İşlemi başka bir ofis/danışmanla ortak yaptıysanız, hizmet bedelinden onun alacağı yüzde. Bu bölüm müşteri çıktılarına basılmaz." />
          </label>
          <input
            type="number"
            min="0"
            max="100"
            value={partnerSharePercent}
            onChange={(e) => setPartnerSharePercent(e.target.value)}
            style={{ width: 90 }}
          />
        </div>
        {r.commission.partnerNet > 0 && (
          <Row label="Hizmet ortağına" value={`- ${formatTL(r.commission.partnerNet)}`} />
        )}
        <Row label="Ofise kalan (KDV hariç)" value={formatTL(r.commission.ourNet)} strong />
      </Card>

      <p style={{ fontSize: 11, color: "var(--text-muted)", margin: "12px 0 0", lineHeight: 1.5 }}>
        {ESTIMATE_NOTE}
      </p>
    </div>
  );
}
