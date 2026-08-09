import { useState, useEffect } from "react";
import { Modal, InfoTip, ConfirmDialog, formatTL, Badge, IconButton, WEEKDAYS } from "./shared";
import { appointmentPrepNoteExample } from "./Sectors";
export function AppointmentCancelPolicyBox({ companySettings, onSave }) {
  const configured = companySettings?.appointmentCancelHours != null || companySettings?.appointmentPenaltyHours != null || companySettings?.appointmentPenaltyStrikeLimit != null || companySettings?.appointmentPartialChargeHours != null;
  const [open, setOpen] = useState(false);
  const [hardBlockOn, setHardBlockOn] = useState(companySettings?.appointmentCancelHours != null);
  const [hardBlockHours, setHardBlockHours] = useState(companySettings?.appointmentCancelHours ?? "");
  const [penaltyOn, setPenaltyOn] = useState(companySettings?.appointmentPenaltyHours != null);
  const [penaltyHours, setPenaltyHours] = useState(companySettings?.appointmentPenaltyHours ?? "");
  const [partialOn, setPartialOn] = useState(companySettings?.appointmentPartialChargeHours != null);
  const [partialHours, setPartialHours] = useState(companySettings?.appointmentPartialChargeHours ?? "");
  const [strikeOn, setStrikeOn] = useState(companySettings?.appointmentPenaltyStrikeLimit != null);
  const [strikeLimit, setStrikeLimit] = useState(companySettings?.appointmentPenaltyStrikeLimit ?? "");
  const [burnsSession, setBurnsSession] = useState(companySettings?.appointmentPenaltyBurnsSession === true);

  const handleOpen = () => {
    setHardBlockOn(companySettings?.appointmentCancelHours != null);
    setHardBlockHours(companySettings?.appointmentCancelHours ?? "");
    setPenaltyOn(companySettings?.appointmentPenaltyHours != null);
    setPenaltyHours(companySettings?.appointmentPenaltyHours ?? "");
    setPartialOn(companySettings?.appointmentPartialChargeHours != null);
    setPartialHours(companySettings?.appointmentPartialChargeHours ?? "");
    setStrikeOn(companySettings?.appointmentPenaltyStrikeLimit != null);
    setStrikeLimit(companySettings?.appointmentPenaltyStrikeLimit ?? "");
    setBurnsSession(companySettings?.appointmentPenaltyBurnsSession === true);
    setOpen(true);
  };

  const handleSave = () => {
    onSave({
      appointmentCancelHours: hardBlockOn && hardBlockHours !== "" ? Number(hardBlockHours) : null,
      appointmentPenaltyHours: penaltyOn && penaltyHours !== "" ? Number(penaltyHours) : null,
      appointmentPartialChargeHours: partialOn && partialHours !== "" ? Number(partialHours) : null,
      appointmentPenaltyStrikeLimit: strikeOn && strikeLimit !== "" ? Number(strikeLimit) : null,
      appointmentPenaltyBurnsSession: strikeOn && burnsSession,
    });
    setOpen(false);
  };

  return (
    <div style={{ marginBottom: 16, background: "var(--surface-1)", border: "0.5px solid var(--border)", borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow-sm)", padding: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <p style={{ fontSize: 13, fontWeight: 500, margin: 0, display: "flex", alignItems: "center", gap: 4 }}>
          Randevu iptal / gelmeme politikası
          <InfoTip
            placement="bottom"
            align="left"
            text={
              "Beşi de opsiyonel, hiç ayarlamazsanız hiçbir kısıtlama/ceza uygulanmaz.\n\n" +
              "'Tamamen kilitle'den az kala müşteri portaldan iptal edemez. Bunun ile 'Geç sayılma penceresi' arasında iptal edilebilir ama 'Geç iptal etti' sayılır. 'Kısmi kesinti sınırı', geç iptalleri SADECE GÖRÜNÜRLÜK için ikiye ayırır (otomatik para hareketi yok). Geç iptal + gelmeme sayısı 'Kaçıncı ihlalde' eşiğine ulaşınca sonraki randevuda ödeme önerilir; 'Paket sahiplerinde seans yaksın' açıksa bunun yerine paketten 1 seans düşer."
            }
          />
        </p>
        {!open && (
          <button type="button" onClick={handleOpen} style={{ fontSize: 12, padding: "4px 10px" }}>
            {configured ? "Düzenle" : "Ayarla"}
          </button>
        )}
      </div>
      {!open && (
        <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: "6px 0 0" }}>
          {configured
            ? `Aktif: ${companySettings.appointmentCancelHours != null ? `randevuya ${companySettings.appointmentCancelHours} saat kalana kadar tamamen kilit` : "tamamen kilitleme yok"}${companySettings.appointmentPenaltyHours != null ? `, ${companySettings.appointmentPenaltyHours} saatten az kala iptal 'geç iptal' sayılır` : ""}${companySettings.appointmentPartialChargeHours != null ? `, ${companySettings.appointmentPartialChargeHours} saatten az kala kısmi kesinti (~%50) önerilir` : ""}${companySettings.appointmentPenaltyStrikeLimit ? `, ${companySettings.appointmentPenaltyStrikeLimit}. ihlalde ${companySettings.appointmentPenaltyBurnsSession ? "paket sahiplerinde seans yanar, diğerlerinde sonraki randevuda ödeme önerilir" : "sonraki randevuda ödeme önerilir"}` : ""}.`
            : "Kullanılmıyor - müşteri randevusunu istediği an iptal edebilir, geç iptal/gelmeme için otomatik bir sonuç yok."}
        </p>
      )}
      {open && (
        <>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 10 }}>
            <div>
              <label style={{ fontSize: 12, color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                <input type="checkbox" checked={hardBlockOn} onChange={(e) => setHardBlockOn(e.target.checked)} />
                Tamamen kilitle (saat)
              </label>
              <input type="number" min="0" step="0.5" disabled={!hardBlockOn} value={hardBlockHours} onChange={(e) => setHardBlockHours(e.target.value)} placeholder="Örn. 2" style={{ width: 150 }} />
            </div>
            <div>
              <label style={{ fontSize: 12, color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                <input type="checkbox" checked={penaltyOn} onChange={(e) => setPenaltyOn(e.target.checked)} />
                Geç sayılma penceresi (saat)
              </label>
              <input type="number" min="0" step="0.5" disabled={!penaltyOn} value={penaltyHours} onChange={(e) => setPenaltyHours(e.target.value)} placeholder="Örn. 24" style={{ width: 150 }} />
            </div>
            <div>
              <label style={{ fontSize: 12, color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                <input type="checkbox" checked={partialOn} onChange={(e) => setPartialOn(e.target.checked)} />
                Kısmi kesinti sınırı (saat)
                <InfoTip align="left" text="Geç sayılma penceresinin içinde, bundan az kala yapılan iptaller için 'kısmi kesinti (~%50) önerilir' notu gösterilir - sadece bilgi amaçlı, otomatik tahsilat/iade yapılmaz." />
              </label>
              <input type="number" min="0" step="0.5" disabled={!partialOn} value={partialHours} onChange={(e) => setPartialHours(e.target.value)} placeholder="Örn. 12" style={{ width: 150 }} />
            </div>
            <div>
              <label style={{ fontSize: 12, color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                <input type="checkbox" checked={strikeOn} onChange={(e) => setStrikeOn(e.target.checked)} />
                Kaçıncı ihlalde ödeme zorunlu olsun
              </label>
              <input type="number" min="1" step="1" disabled={!strikeOn} value={strikeLimit} onChange={(e) => setStrikeLimit(e.target.value)} placeholder="Örn. 2" style={{ width: 150 }} />
            </div>
          </div>
          <label style={{ fontSize: 12, color: strikeOn ? "var(--text-secondary)" : "var(--text-muted)", display: "flex", alignItems: "center", gap: 6, marginTop: 10, cursor: strikeOn ? "pointer" : "default" }}>
            <input type="checkbox" checked={burnsSession} disabled={!strikeOn} onChange={(e) => setBurnsSession(e.target.checked)} />
            Paket sahibi müşterilerde ödeme yerine seans yaksın
          </label>
          <p style={{ fontSize: 11.5, color: "var(--text-muted)", margin: "10px 0 0" }}>
            Öneri: no-show'da randevu saatinden itibaren 15-20 dakika bekleyip sonra "Randevuya gelmedi" işaretlemeniz makul kabul edilir (bir ayar değil, sadece bir öneri).
          </p>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 10 }}>
            <button type="button" onClick={() => setOpen(false)}>Vazgeç</button>
            <button type="button" onClick={handleSave} style={{ background: "var(--fill-accent)", color: "var(--on-accent)", border: "none" }}>Kaydet</button>
          </div>
        </>
      )}
    </div>
  );
}

// Randevu widget'ından (/randevu-al/{token}) gelen misafir müşteriden booking
// ANINDA sabit bir TL kapora tahsil eder - tamamen opsiyonel, varsayılan
// kapalı, KOBİ hem açıp açmamayı hem tutarı kendi seçer. Ödeme Bağlantısı
// (iyzico/PayTR) kurulu değilse alan devre dışı - kısıtlama değil görünürlük,
// önce ne yapılması gerektiği açıkça söyleniyor (bkz. api/deal-approval.js,
// api/lead-capture.js).
export function AppointmentDepositBox({ companySettings, hasPaymentConnection, onSave }) {
  const configured = companySettings?.appointmentDepositAmount != null;
  const [open, setOpen] = useState(false);
  const [depositOn, setDepositOn] = useState(configured);
  const [depositAmount, setDepositAmount] = useState(companySettings?.appointmentDepositAmount ?? "");

  const handleOpen = () => {
    setDepositOn(configured);
    setDepositAmount(companySettings?.appointmentDepositAmount ?? "");
    setOpen(true);
  };

  const handleSave = () => {
    onSave({ appointmentDepositAmount: depositOn && depositAmount !== "" ? Number(depositAmount) : null });
    setOpen(false);
  };

  return (
    <div style={{ marginBottom: 16, background: "var(--surface-1)", border: "0.5px solid var(--border)", borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow-sm)", padding: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <p style={{ fontSize: 13, fontWeight: 500, margin: 0, display: "flex", alignItems: "center", gap: 4 }}>
          Randevu kaporası
          <InfoTip
            placement="bottom"
            align="left"
            text="Opsiyonel - açarsanız, randevu widget'ından (/randevu-al) kendi randevusunu alan misafir müşteri, talebi tamamlamak için burada belirlediğiniz sabit tutarı kartla önceden öder. Ödeme, normal bir tahsilat olarak kaydedilir - iade isterseniz mevcut İade akışını kullanabilirsiniz."
          />
        </p>
        {!open && (
          <button type="button" onClick={handleOpen} disabled={!hasPaymentConnection} style={{ fontSize: 12, padding: "4px 10px" }}>
            {configured ? "Düzenle" : "Ayarla"}
          </button>
        )}
      </div>
      {!open && (
        <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: "6px 0 0" }}>
          {!hasPaymentConnection
            ? "Kullanmak için önce Ödeme Bağlantısı'nı (iyzico veya PayTR) kurmanız gerekiyor."
            : configured
              ? `Aktif: randevu widget'ından randevu alan misafirlerden ${formatTL(companySettings.appointmentDepositAmount)} kapora isteniyor.`
              : "Kullanılmıyor - randevu widget'ından gelen talepler için önceden ödeme istenmiyor."}
        </p>
      )}
      {open && (
        <>
          <label style={{ fontSize: 12, color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: 6, margin: "10px 0 4px" }}>
            <input type="checkbox" checked={depositOn} onChange={(e) => setDepositOn(e.target.checked)} />
            Kapora iste
          </label>
          <input type="number" min="0" step="1" disabled={!depositOn} value={depositAmount} onChange={(e) => setDepositAmount(e.target.value)} placeholder="Örn. 100" style={{ width: 150 }} />
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 10 }}>
            <button type="button" onClick={() => setOpen(false)}>Vazgeç</button>
            <button type="button" onClick={handleSave} style={{ background: "var(--fill-accent)", color: "var(--on-accent)", border: "none" }}>Kaydet</button>
          </div>
        </>
      )}
    </div>
  );
}

// Aynı anda kaç randevu karşılanabileceği - Otel'deki oda "quantity"/Spor
// Merkezi'ndeki ders "capacity" ile AYNI basit desen. Boş/1 = eski davranış
// (aynı anda tek randevu) - hiç dokunmayan işletmeler etkilenmez.
// staffCount: team_roster() üzerinden hesaplanan toplam personel sayısı (sahip
// dahil) - sadece "otomatik" modda güncel değeri göstermek için, gerçek
// hesaplama DB'deki trigger'da yapılıyor (bkz. sql/2026-08-09_auto_concurrency.sql).
export function AppointmentConcurrencyBox({ companySettings, staffCount, onSave }) {
  const auto = companySettings?.appointmentConcurrencyAuto === true;
  const configured = companySettings?.appointmentConcurrency != null;
  const [open, setOpen] = useState(false);
  const [autoDraft, setAutoDraft] = useState(auto);
  const [value, setValue] = useState(companySettings?.appointmentConcurrency ?? "");

  const handleOpen = () => {
    setAutoDraft(auto);
    setValue(companySettings?.appointmentConcurrency ?? "");
    setOpen(true);
  };

  const handleSave = () => {
    onSave({
      appointmentConcurrencyAuto: autoDraft,
      // Otomatik modda gönderilen sayı önemli değil - trigger anında gerçek
      // personel sayısıyla değiştirir, burada sadece null bırakmamak için.
      appointmentConcurrency: autoDraft ? staffCount : value !== "" ? Math.max(1, Number(value)) : null,
    });
    setOpen(false);
  };

  return (
    <div style={{ marginBottom: 16, background: "var(--surface-1)", border: "0.5px solid var(--border)", borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow-sm)", padding: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <p style={{ fontSize: 13, fontWeight: 500, margin: 0, display: "flex", alignItems: "center", gap: 4 }}>
          Eş zamanlı randevu kapasitesi
          <InfoTip
            placement="bottom"
            align="left"
            text={
              "Aynı saate kaç randevu birden alınabileceğini belirler - kaç uzman/koltuk/cihazınız varsa o kadar.\n\n" +
              "\"Personel sayısına göre otomatik\" seçilirse bu sayı siz personel ekledikçe/çıkardıkça kendiliğinden güncellenir, elle takip etmenize gerek kalmaz. " +
              "Elle sabit bir sayı da girebilirsiniz - örneğin personeliniz daha fazla ama aynı anda sadece 2 müşteri kabul etmek istiyorsanız.\n\n" +
              "Ayarlamazsanız (varsayılan) aynı saate sadece 1 randevu alınabilir."
            }
          />
        </p>
        {!open && (
          <button type="button" onClick={handleOpen} style={{ fontSize: 12, padding: "4px 10px" }}>
            {configured || auto ? "Düzenle" : "Ayarla"}
          </button>
        )}
      </div>
      {!open && (
        <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: "6px 0 0" }}>
          {auto
            ? `Otomatik: personel sayınıza göre (şu an ${companySettings?.appointmentConcurrency ?? staffCount} kişi) aynı saate en fazla o kadar randevu alınabiliyor.`
            : configured
              ? `Aktif: aynı saate en fazla ${companySettings.appointmentConcurrency} randevu birden alınabiliyor.`
              : "Varsayılan: aynı saate sadece 1 randevu alınabiliyor."}
        </p>
      )}
      {open && (
        <>
          <label style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8, fontSize: 13, cursor: "pointer" }}>
            <input type="checkbox" checked={autoDraft} onChange={(e) => setAutoDraft(e.target.checked)} />
            Personel sayısına göre otomatik hesapla (şu an {staffCount} personel)
          </label>
          {!autoDraft && (
            <input type="number" min="1" step="1" value={value} onChange={(e) => setValue(e.target.value)} placeholder="Örn. 3" style={{ width: 150, marginTop: 8 }} />
          )}
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 10 }}>
            <button type="button" onClick={() => setOpen(false)}>Vazgeç</button>
            <button type="button" onClick={handleSave} style={{ background: "var(--fill-accent)", color: "var(--on-accent)", border: "none" }}>Kaydet</button>
          </div>
        </>
      )}
    </div>
  );
}

// Randevu hatırlatma e-postasının sonuna eklenen, işletmenin kendi yazdığı
// serbest metin - "aç karnına gelin" gibi. Opsiyonel, boşsa hatırlatma metni
// hiç değişmez (bkz. api/send-appointment-reminders.js).
export function AppointmentPrepNoteBox({ companySettings, onSave }) {
  const [note, setNote] = useState(companySettings?.appointmentPrepNote || "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setNote(companySettings?.appointmentPrepNote || "");
  }, [companySettings?.appointmentPrepNote]);

  const handleSave = async () => {
    setSaving(true);
    await onSave({ appointmentPrepNote: note.trim() || null });
    setSaving(false);
  };

  // Bu not, İşletme Bilgileri formundaki "Randevu hatırlatma e-postası gönder"
  // anahtarı AÇIKKEN gönderilen hatırlatma mailine ekleniyor - o anahtar
  // kapalıysa not hiçbir yere gitmiyor ama bu kutunun kendisi bunu hiç
  // söylemiyordu, KOBİ notu yazıp kaydedip fark etmeden boşa bekleyebilirdi.
  const remindersOff = companySettings?.appointmentRemindersEnabled === false;
  return (
    <div style={{ marginBottom: 16, background: "var(--surface-1)", border: "0.5px solid var(--border)", borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow-sm)", padding: 12 }}>
      <p style={{ fontSize: 13, fontWeight: 500, margin: "0 0 6px" }}>Randevu öncesi not (opsiyonel)</p>
      <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: "0 0 8px" }}>
        İşletme Bilgileri'ndeki "Randevu hatırlatma e-postası gönder" ayarı açıkken, randevu saatinden 2 saat önce müşteriye giden hatırlatma e-postasının sonuna eklenir - {appointmentPrepNoteExample(companySettings?.sector)}
      </p>
      {remindersOff && (
        <p style={{ fontSize: 12, color: "var(--text-warning)", background: "var(--bg-warning)", border: "0.5px solid var(--text-warning)", borderRadius: 6, padding: "6px 8px", margin: "0 0 8px" }}>
          Şu an randevu hatırlatma e-postaları kapalı - bu notu kaydetseniz bile hiçbir yere gönderilmez. Açmak için Ayarlar → İşletme Bilgileri'ne gidin.
        </p>
      )}
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Örn. Lütfen randevunuzdan 15 dakika önce gelin."
        style={{ width: "100%", minHeight: 70, fontSize: 13, resize: "vertical" }}
      />
      <button
        type="button"
        onClick={handleSave}
        disabled={saving}
        style={{ marginTop: 8, background: "var(--fill-accent)", color: "var(--on-accent)", border: "none" }}
      >
        {saving ? "Kaydediliyor…" : "Kaydet"}
      </button>
    </div>
  );
}

export function BusinessHoursManager({ items, onAdd, onDelete }) {
  const [weekday, setWeekday] = useState(1);
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("18:00");
  const [slotDurationMinutes, setSlotDurationMinutes] = useState(30);
  const [hasBreak, setHasBreak] = useState(false);
  const [breakStart, setBreakStart] = useState("12:00");
  const [breakEnd, setBreakEnd] = useState("13:00");
  const [confirmDelete, setConfirmDelete] = useState(null);

  const sorted = [...items].sort((a, b) => a.weekday - b.weekday || a.startTime.localeCompare(b.startTime));

  const submit = (e) => {
    e.preventDefault();
    if (!startTime || !endTime || endTime <= startTime || !slotDurationMinutes) return;
    if (hasBreak) {
      if (!breakStart || !breakEnd || breakStart <= startTime || breakEnd >= endTime || breakEnd <= breakStart) return;
      onAdd({ weekday: Number(weekday), startTime, endTime: breakStart, slotDurationMinutes: Number(slotDurationMinutes) });
      onAdd({ weekday: Number(weekday), startTime: breakEnd, endTime, slotDurationMinutes: Number(slotDurationMinutes) });
    } else {
      onAdd({ weekday: Number(weekday), startTime, endTime, slotDurationMinutes: Number(slotDurationMinutes) });
    }
  };

  return (
    <div>
      <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: "0 0 16px", display: "flex", alignItems: "center", gap: 4 }}>
        Müşterilerinizin portaldan randevu alabileceği çalışma saatleriniz
        <InfoTip placement="bottom" align="right" text={'Burada tanımladığınız gün/saat pencereleri, belirlediğiniz süre aralıklarla bölünüp müşteri portalında müsait randevu saatleri olarak gösterilir. Öğle arası varsa "Öğle arası var" kutusunu işaretleyip ara saatlerini girin - sistem günü otomatik olarak iki parçaya böler.'} />
      </p>

      {sorted.length === 0 ? (
        <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 16 }}>Henüz müsaitlik saati eklenmedi.</p>
      ) : (
        // Haftanın 7 gününü yan yana sütun yapan bir ızgara — önceden her
        // aralık (öğle arasıyla bölünmüş günlerde 2+ satır) tek bir dikey
        // listede alt alta sıralanıyordu, haftanın genel görünümünü tek
        // bakışta kavramak zordu (kullanıcı geri bildirimi, 2026-08-01).
        <div style={{ overflowX: "auto", marginBottom: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(122px, 1fr))", gap: 6, minWidth: 780 }}>
            {WEEKDAYS.map((w, i) => {
              const weekday = i + 1;
              const dayItems = sorted.filter((b) => b.weekday === weekday);
              return (
                <div key={weekday} style={{ background: "var(--surface-1)", border: "0.5px solid var(--border)", borderRadius: "var(--radius)", padding: 8, display: "flex", flexDirection: "column", gap: 6, minHeight: 56 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.3 }}>{w}</div>
                  {dayItems.length === 0 ? (
                    <span style={{ fontSize: 12, color: "var(--text-muted)" }}>Kapalı</span>
                  ) : (
                    dayItems.map((b) => (
                      <div key={b.id} style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 4, background: "var(--surface-2)", borderRadius: 6, padding: "4px 6px" }}>
                        <div>
                          <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-accent)" }}>{b.startTime}-{b.endTime}</div>
                          <div style={{ fontSize: 10.5, color: "var(--text-muted)" }}>{b.slotDurationMinutes} dk aralık</div>
                        </div>
                        <IconButton icon="ti-trash" title="Sil" size="sm" onClick={() => setConfirmDelete(b)} />
                      </div>
                    ))
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <p style={{ fontSize: 13, fontWeight: 500, margin: "0 0 8px" }}>Yeni müsaitlik ekle</p>
      <form onSubmit={submit} style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "flex-end" }}>
        <div style={{ minWidth: 130 }}>
          <label style={{ fontSize: 12, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Gün</label>
          <select value={weekday} onChange={(e) => setWeekday(e.target.value)} style={{ fontSize: 13 }}>
            {WEEKDAYS.map((w, i) => <option key={w} value={i + 1}>{w}</option>)}
          </select>
        </div>
        <div style={{ width: 100 }}>
          <label style={{ fontSize: 12, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Başlangıç</label>
          <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} style={{ fontSize: 13, width: "100%" }} />
        </div>
        <div style={{ width: 100 }}>
          <label style={{ fontSize: 12, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Bitiş</label>
          <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} style={{ fontSize: 13, width: "100%" }} />
        </div>
        <div style={{ width: 110 }}>
          <label style={{ fontSize: 12, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Slot süresi (dk)</label>
          <input type="number" min="5" step="5" value={slotDurationMinutes} onChange={(e) => setSlotDurationMinutes(e.target.value)} style={{ fontSize: 13, width: "100%" }} />
        </div>
        <div style={{ width: "100%", display: "flex", gap: 6, alignItems: "flex-end", flexWrap: "wrap" }}>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--text-secondary)", marginBottom: 8 }}>
            <input type="checkbox" checked={hasBreak} onChange={(e) => setHasBreak(e.target.checked)} />
            Öğle arası var
          </label>
          {hasBreak && (
            <>
              <div style={{ width: 100 }}>
                <label style={{ fontSize: 12, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Ara başlangıç</label>
                <input type="time" value={breakStart} onChange={(e) => setBreakStart(e.target.value)} style={{ fontSize: 13, width: "100%" }} />
              </div>
              <div style={{ width: 100 }}>
                <label style={{ fontSize: 12, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Ara bitiş</label>
                <input type="time" value={breakEnd} onChange={(e) => setBreakEnd(e.target.value)} style={{ fontSize: 13, width: "100%" }} />
              </div>
            </>
          )}
        </div>
        <button type="submit" style={{ background: "var(--fill-accent)", color: "var(--on-accent)", border: "none", fontSize: 13 }}>+ Ekle</button>
      </form>

      {confirmDelete && (
        <ConfirmDialog
          title="Müsaitliği sil"
          message={`${WEEKDAYS[confirmDelete.weekday - 1]} ${confirmDelete.startTime}-${confirmDelete.endTime} müsaitliği kaldırılacak. Bu geri alınamaz.`}
          onConfirm={() => { onDelete(confirmDelete.id); setConfirmDelete(null); }}
          onClose={() => setConfirmDelete(null)}
        />
      )}
    </div>
  );
}

export function RoomInventoryEditModal({ item, onSave, onClose }) {
  const [quantity, setQuantity] = useState(item.quantity);
  const [capacity, setCapacity] = useState(item.capacity ? String(item.capacity) : "");
  const [description, setDescription] = useState(item.description || "");

  const submit = (e) => {
    e.preventDefault();
    if (Number(quantity) < 1) return;
    onSave({ quantity: Number(quantity), capacity: capacity ? Number(capacity) : null, description: description.trim() });
  };

  return (
    <Modal title="Oda tipini düzenle" onClose={onClose}>
      <form onSubmit={submit}>
        <div style={{ marginBottom: 10 }}>
          <label style={{ fontSize: 12, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Oda Tipi</label>
          <select value={item.roomType} disabled style={{ width: "100%" }}>
            <option value={item.roomType}>{item.roomType}</option>
          </select>
        </div>
        <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 12, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Adet</label>
            <input type="number" min="1" value={quantity} onChange={(e) => setQuantity(e.target.value)} style={{ width: "100%" }} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 12, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Kapasite <span style={{ fontWeight: 400, color: "var(--text-muted)" }}>(kişi)</span></label>
            <input type="number" min="1" value={capacity} onChange={(e) => setCapacity(e.target.value)} placeholder="2" style={{ width: "100%" }} />
          </div>
        </div>
        <div style={{ marginBottom: 10 }}>
          <label style={{ fontSize: 12, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Açıklama <span style={{ fontWeight: 400, color: "var(--text-muted)" }}>(opsiyonel)</span></label>
          <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Kahvaltı dahil, klima, WiFi..." style={{ width: "100%" }} />
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button type="button" onClick={onClose}>Vazgeç</button>
          <button type="submit" style={{ background: "var(--fill-accent)", color: "var(--on-accent)", border: "none" }}>Güncelle</button>
        </div>
      </form>
    </Modal>
  );
}

export function ResourceManager({ items, onAdd, onUpdate, onDelete }) {
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [confirmDelete, setConfirmDelete] = useState(null);

  const submit = (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    onAdd({ name, quantity });
    setName("");
    setQuantity(1);
  };

  return (
    <div>
      <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: "0 0 16px", display: "flex", alignItems: "center", gap: 4 }}>
        Randevu sırasında seçilebilecek cihaz/oda listesi (örn. "Lazer Cihazı", "Oda 2")
        <InfoTip placement="bottom" align="right" text="Bir kaynak tanımlarsanız teklif/randevu formunda seçilebilir hale gelir ve aynı kaynağa aynı saatte adedi dolduran sayıda ikinci bir randevu girilmesi engellenir. Adet 1'den fazlaysa (örn. aynı isimde 2 cihaz), hangi fiziksel birimin kullanıldığını ayrıca belirtmeniz gerekmez - sistem sadece o an kaçının dolu olduğunu sayar. Hiç kaynak tanımlamazsanız bu alan hiç görünmez, mevcut davranışınız değişmez." />
      </p>
      {items.length === 0 ? (
        <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 16 }}>Henüz kaynak eklenmedi.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 16 }}>
          {items.map((r) => (
            <div key={r.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, background: "var(--surface-1)", border: "0.5px solid var(--border)", borderRadius: "var(--radius)", padding: "8px 12px" }}>
              <span style={{ fontSize: 13, fontWeight: 500 }}>{r.name}</span>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <label style={{ fontSize: 11, color: "var(--text-muted)" }}>Adet</label>
                  <input
                    type="number" min="1" step="1"
                    defaultValue={r.quantity}
                    onBlur={(e) => {
                      const v = Math.max(1, Number(e.target.value) || 1);
                      if (v !== r.quantity) onUpdate({ id: r.id, quantity: v });
                    }}
                    style={{ width: 50, fontSize: 12, padding: "2px 6px" }}
                  />
                </span>
                <IconButton icon="ti-trash" title="Sil" size="sm" onClick={() => setConfirmDelete(r)} />
              </div>
            </div>
          ))}
        </div>
      )}
      <form onSubmit={submit} style={{ display: "flex", gap: 6, alignItems: "flex-end" }}>
        <div style={{ flex: 1 }}>
          <label style={{ fontSize: 11, color: "var(--text-muted)", display: "block", marginBottom: 2 }}>İsim</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Örn. Lazer Cihazı" style={{ width: "100%" }} />
        </div>
        <div style={{ width: 60 }}>
          <label style={{ fontSize: 11, color: "var(--text-muted)", display: "block", marginBottom: 2 }}>Adet</label>
          <input type="number" min="1" step="1" value={quantity} onChange={(e) => setQuantity(e.target.value)} style={{ width: "100%" }} />
        </div>
        <button type="submit" disabled={!name.trim()}>+ Ekle</button>
      </form>
      {confirmDelete && (
        <ConfirmDialog
          title="Kaynak silinsin mi?"
          message={`"${confirmDelete.name}" silinirse geçmiş randevulardaki kaydı kalır, sadece yeni seçim listesinden kalkar.`}
          onConfirm={() => { onDelete(confirmDelete.id); setConfirmDelete(null); }}
          onClose={() => setConfirmDelete(null)}
        />
      )}
    </div>
  );
}

export function RoomInventoryManager({ items, roomTypeOptions, onAdd, onUpdate, onDelete }) {
  const [roomType, setRoomType] = useState(roomTypeOptions[0] || "");
  const [quantity, setQuantity] = useState(1);
  const [capacity, setCapacity] = useState("");
  const [description, setDescription] = useState("");
  const [editingItem, setEditingItem] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);

  const availableOptions = roomTypeOptions.filter((o) => !items.some((i) => i.roomType === o));

  // Bir oda tipi eklenince o tip availableOptions'tan düşüyor, ama seçim
  // kutusunun kendi state'i (roomType) buna göre otomatik güncellenmiyordu —
  // eski (artık listede olmayan) değerde takılı kalabiliyordu. Kullanıcı fark
  // etmeden tekrar "+ Ekle"ye basarsa aynı oda tipi ikinci kez eklenmeye
  // çalışılıp veritabanı "mükerrer kayıt" hatası veriyordu. Seçili değer
  // artık mevcut listede yoksa otomatik olarak ilk müsait seçeneğe döner.
  useEffect(() => {
    if (roomType && !availableOptions.includes(roomType)) {
      setRoomType(availableOptions[0] || "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [availableOptions.join("|")]);

  const submit = (e) => {
    e.preventDefault();
    if (Number(quantity) < 1) return;
    if (!roomType || !availableOptions.includes(roomType)) return;
    onAdd({ roomType, quantity: Number(quantity), capacity: capacity ? Number(capacity) : null, description: description.trim() });
    setQuantity(1);
    setCapacity("");
    setDescription("");
  };

  return (
    <div>
      <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: "0 0 16px", display: "flex", alignItems: "center", gap: 4 }}>
        Her oda tipinden kaç adet olduğunu, kaç kişilik olduğunu ve varsa açıklamasını belirleyin
        <InfoTip placement="bottom" align="right" text={`Adet: bu tipte kaç oda varsa, seçilen giriş/çıkış tarihi aralığında zaten o kadar rezervasyon oluşmuşsa müşteri portalı "müsait değil" gösterir. Kapasite ve açıklama rezervasyon sırasında misafire gösterilir. Oda tipi seçenekleri Sektör & Özel Alanlar'daki "Oda Tipi" alanından geliyor.`} />
      </p>

      {items.length === 0 ? (
        <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 16 }}>Henüz oda tipi eklenmedi - eklenene kadar müşteri portalından rezervasyon alınamaz.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 16 }}>
          {items.map((r) => (
            <div key={r.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, background: "var(--surface-1)", border: "0.5px solid var(--border)", borderRadius: "var(--radius)", padding: "8px 12px" }}>
              <div style={{ minWidth: 0 }}>
                <span style={{ fontSize: 13, fontWeight: 500 }}>{r.roomType}</span>
                {r.description && <p style={{ margin: "2px 0 0", fontSize: 12, color: "var(--text-secondary)" }}>{r.description}</p>}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                <Badge tone="accent">{r.quantity} adet{r.capacity ? ` · ${r.capacity} kişilik` : ""}</Badge>
                <IconButton icon="ti-edit" title="Düzenle" size="sm" onClick={() => setEditingItem(r)} />
                <IconButton icon="ti-trash" title="Sil" size="sm" onClick={() => setConfirmDelete(r)} />
              </div>
            </div>
          ))}
        </div>
      )}

      {availableOptions.length === 0 ? (
        <p style={{ fontSize: 12, color: "var(--text-muted)" }}>
          {roomTypeOptions.length === 0
            ? 'Önce Sektör & Özel Alanlar\'da "Oda Tipi" alanına en az bir seçenek eklemelisiniz.'
            : "Tanımlı tüm oda tipleri zaten eklendi."}
        </p>
      ) : (
        <>
          <p style={{ fontSize: 13, fontWeight: 500, margin: "0 0 8px" }}>Yeni oda tipi ekle</p>
          <form onSubmit={submit} style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "flex-end" }}>
            <div style={{ minWidth: 160 }}>
              <label style={{ fontSize: 12, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Oda Tipi</label>
              <select value={roomType} onChange={(e) => setRoomType(e.target.value)} style={{ fontSize: 13, width: "100%" }}>
                {availableOptions.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
            <div style={{ width: 80 }}>
              <label style={{ fontSize: 12, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Adet</label>
              <input type="number" min="1" value={quantity} onChange={(e) => setQuantity(e.target.value)} style={{ fontSize: 13, width: "100%" }} />
            </div>
            <div style={{ width: 100 }}>
              <label style={{ fontSize: 12, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Kapasite <span style={{ fontWeight: 400, color: "var(--text-muted)" }}>(kişi)</span></label>
              <input type="number" min="1" value={capacity} onChange={(e) => setCapacity(e.target.value)} placeholder="2" style={{ fontSize: 13, width: "100%" }} />
            </div>
            <div style={{ flex: 1, minWidth: 180 }}>
              <label style={{ fontSize: 12, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Açıklama <span style={{ fontWeight: 400, color: "var(--text-muted)" }}>(opsiyonel)</span></label>
              <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Kahvaltı dahil, klima, WiFi..." style={{ fontSize: 13, width: "100%" }} />
            </div>
            <button type="submit" style={{ background: "var(--fill-accent)", color: "var(--on-accent)", border: "none", fontSize: 13 }}>
              + Ekle
            </button>
          </form>
        </>
      )}

      {confirmDelete && (
        <ConfirmDialog
          title="Oda tipini sil"
          message={`"${confirmDelete.roomType}" kaldırılacak. Bu geri alınamaz.`}
          onConfirm={() => { onDelete(confirmDelete.id); setConfirmDelete(null); }}
          onClose={() => setConfirmDelete(null)}
        />
      )}

      {editingItem && (
        <RoomInventoryEditModal
          item={editingItem}
          onClose={() => setEditingItem(null)}
          onSave={(payload) => { onUpdate({ id: editingItem.id, ...payload }); setEditingItem(null); }}
        />
      )}
    </div>
  );
}