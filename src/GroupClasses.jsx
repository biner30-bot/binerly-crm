import { useState } from "react";
import {
  Modal,
  InfoTip,
  ConfirmDialog,
  Badge,
  IconButton,
  WEEKDAYS,
  nextWeeklyOccurrence,
} from "./shared";
import { groupClassWords } from "./Sectors";
export function GroupClassForm({ initial, sector, currentEnrollment = 0, onSave, onCancel }) {
  const [name, setName] = useState(initial?.name || "");
  const [instructorName, setInstructorName] = useState(initial?.instructorName || "");
  const [weekday, setWeekday] = useState(initial?.weekday || 1);
  const [startTime, setStartTime] = useState(initial?.startTime || "18:00");
  const [durationMinutes, setDurationMinutes] = useState(initial?.durationMinutes ?? 60);
  const [capacity, setCapacity] = useState(initial?.capacity ?? 10);
  const [notes, setNotes] = useState(initial?.notes || "");
  const [capacityError, setCapacityError] = useState("");

  const submit = (e) => {
    e.preventDefault();
    if (!name.trim() || !capacity || Number(capacity) < 1) return;
    if (currentEnrollment > 0 && Number(capacity) < currentEnrollment) {
      setCapacityError(`Kapasite, zaten kayıtlı ${currentEnrollment} kişinin altına düşürülemez.`);
      return;
    }
    setCapacityError("");
    onSave({
      name: name.trim(),
      instructorName: instructorName.trim(),
      weekday: Number(weekday),
      startTime,
      durationMinutes: Number(durationMinutes) || 60,
      capacity: Number(capacity),
      notes: notes.trim(),
    });
  };

  return (
    <form onSubmit={submit}>
      <div style={{ marginBottom: 12 }}>
        <label
          style={{
            fontSize: 13,
            color: "var(--text-secondary)",
            display: "block",
            marginBottom: 4,
          }}
        >
          Ders adı
        </label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={sector === "egitim_kurs" ? "Örn. Yabancı Dil Kursu" : "Örn. Pilates"}
          style={{ width: "100%" }}
        />
      </div>
      <div style={{ marginBottom: 12 }}>
        <label
          style={{
            fontSize: 13,
            color: "var(--text-secondary)",
            display: "block",
            marginBottom: 4,
          }}
        >
          Eğitmen <span style={{ fontWeight: 400, color: "var(--text-muted)" }}>(opsiyonel)</span>
        </label>
        <input
          value={instructorName}
          onChange={(e) => setInstructorName(e.target.value)}
          placeholder={sector === "egitim_kurs" ? "Örn. Ahmet Öğretmen" : "Örn. Ayşe Hoca"}
          style={{ width: "100%" }}
        />
      </div>
      <div style={{ display: "flex", gap: 12, marginBottom: 12, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 130 }}>
          <label
            style={{
              fontSize: 13,
              color: "var(--text-secondary)",
              display: "block",
              marginBottom: 4,
            }}
          >
            Gün
          </label>
          <select
            value={weekday}
            onChange={(e) => setWeekday(e.target.value)}
            style={{ width: "100%" }}
          >
            {WEEKDAYS.map((w, i) => (
              <option key={w} value={i + 1}>
                {w}
              </option>
            ))}
          </select>
          <p style={{ fontSize: 11.5, color: "var(--text-muted)", margin: "4px 0 0" }}>
            Her hafta tekrar eder - ilk oturum:{" "}
            {nextWeeklyOccurrence(Number(weekday), startTime || "00:00").toLocaleDateString(
              "tr-TR",
              { day: "numeric", month: "long", weekday: "long" },
            )}
          </p>
        </div>
        <div style={{ flex: 1, minWidth: 100 }}>
          <label
            style={{
              fontSize: 13,
              color: "var(--text-secondary)",
              display: "block",
              marginBottom: 4,
            }}
          >
            Saat
          </label>
          <input
            type="time"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            style={{ width: "100%" }}
          />
        </div>
        <div style={{ flex: 1, minWidth: 100 }}>
          <label
            style={{
              fontSize: 13,
              color: "var(--text-secondary)",
              display: "block",
              marginBottom: 4,
            }}
          >
            Süre (dk)
          </label>
          <input
            type="number"
            min="1"
            value={durationMinutes}
            onChange={(e) => setDurationMinutes(e.target.value)}
            style={{ width: "100%" }}
          />
        </div>
        <div style={{ flex: 1, minWidth: 100 }}>
          <label
            style={{
              fontSize: 13,
              color: "var(--text-secondary)",
              display: "block",
              marginBottom: 4,
            }}
          >
            Kapasite
          </label>
          <input
            type="number"
            min="1"
            value={capacity}
            onChange={(e) => {
              setCapacity(e.target.value);
              setCapacityError("");
            }}
            style={{ width: "100%" }}
          />
        </div>
      </div>
      {capacityError && (
        <p style={{ fontSize: 12, color: "var(--text-danger)", margin: "-8px 0 12px" }}>
          {capacityError}
        </p>
      )}
      <div style={{ marginBottom: 16 }}>
        <label
          style={{
            fontSize: 13,
            color: "var(--text-secondary)",
            display: "block",
            marginBottom: 4,
          }}
        >
          Not <span style={{ fontWeight: 400, color: "var(--text-muted)" }}>(opsiyonel)</span>
        </label>
        <input value={notes} onChange={(e) => setNotes(e.target.value)} style={{ width: "100%" }} />
      </div>
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button type="button" onClick={onCancel}>
          Vazgeç
        </button>
        <button
          type="submit"
          style={{ background: "var(--fill-accent)", color: "var(--on-accent)", border: "none" }}
        >
          Kaydet
        </button>
      </div>
    </form>
  );
}

export function GroupClassRoster({
  group,
  enrollments,
  customers,
  activeCustomerIds,
  sector,
  occurrenceDate,
  attendance = [],
  onSetAttendance,
  onEdit,
  onDelete,
  onEnroll,
  onRemove,
}) {
  const words = groupClassWords(sector);
  const [search, setSearch] = useState("");
  const [confirmRemove, setConfirmRemove] = useState(null);
  const enrolledIds = new Set(enrollments.map((e) => e.customerId));
  const full = enrollments.length >= group.capacity;
  const query = search.trim().toLowerCase();
  const todayStr = new Date().toISOString().slice(0, 10);
  const showAttendance = !!occurrenceDate && occurrenceDate <= todayStr;
  const matches = query
    ? customers
        .filter(
          (c) =>
            !enrolledIds.has(c.id) &&
            activeCustomerIds.has(c.id) &&
            (c.name.toLowerCase().includes(query) ||
              (c.phone || "").includes(query) ||
              (c.email || "").toLowerCase().includes(query)),
        )
        .slice(0, 8)
    : [];

  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 8,
        }}
      >
        <Badge tone={full ? "danger" : "success"}>
          {enrollments.length}/{group.capacity} dolu
        </Badge>
        <div style={{ display: "flex", gap: 4 }}>
          <IconButton icon="ti-edit" title="Düzenle" size="sm" onClick={onEdit} />
          <IconButton icon="ti-trash" title="Sil" size="sm" onClick={onDelete} />
        </div>
      </div>
      <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: "0 0 16px" }}>
        {WEEKDAYS[group.weekday - 1]} {group.startTime}
        {group.instructorName ? ` · ${group.instructorName}` : ""}
      </p>

      {occurrenceDate && !showAttendance && (
        <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "0 0 12px" }}>
          Bu ders henüz gerçekleşmedi, yoklama alınamaz.
        </p>
      )}

      <p style={{ fontSize: 13, fontWeight: 500, margin: "0 0 8px" }}>
        {showAttendance
          ? `Yoklama - ${new Date(occurrenceDate).toLocaleDateString("tr-TR", { day: "numeric", month: "long" })}`
          : words.rosterTitle}
      </p>
      {enrollments.length === 0 ? (
        <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 16 }}>
          {words.emptyRoster}
        </p>
      ) : (
        <div style={{ marginBottom: 16, overflowX: "auto" }}>
          {/* Sayfa genelindeki liste tablolarıyla (Üyelikler/Randevular vb.) aynı
              görsel dil - üst büyük harf başlık, yuvarlak köşeli "hap" satırlar. */}
          <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: "0 6px" }}>
            <thead>
              <tr>
                <th
                  style={{
                    textAlign: "left",
                    padding: "0 10px",
                    fontSize: 11,
                    fontWeight: 600,
                    color: "var(--text-muted)",
                    textTransform: "uppercase",
                    letterSpacing: 0.3,
                  }}
                >
                  {words.memberColLabel}
                </th>
                {showAttendance && (
                  <>
                    <th
                      style={{
                        textAlign: "center",
                        padding: "0 4px",
                        fontSize: 10.5,
                        fontWeight: 700,
                        color: "var(--text-muted)",
                        textTransform: "uppercase",
                      }}
                    >
                      Geldi
                    </th>
                    <th
                      style={{
                        textAlign: "center",
                        padding: "0 4px",
                        fontSize: 10.5,
                        fontWeight: 700,
                        color: "var(--text-muted)",
                        textTransform: "uppercase",
                      }}
                    >
                      Gelmedi
                    </th>
                  </>
                )}
                <th style={{ padding: "0 10px" }}></th>
              </tr>
            </thead>
            <tbody>
              {enrollments.map((e) => {
                const c = customers.find((cust) => cust.id === e.customerId);
                const att = showAttendance
                  ? attendance.find((a) => a.customerId === e.customerId)
                  : null;
                return (
                  <tr key={e.id} style={{ background: "var(--surface-1)" }}>
                    <td
                      style={{
                        padding: "8px 10px",
                        borderRadius: "var(--radius) 0 0 var(--radius)",
                        fontSize: 13,
                      }}
                    >
                      {c?.name || "Bilinmeyen müşteri"}
                    </td>
                    {showAttendance && (
                      <>
                        <td style={{ textAlign: "center", padding: "6px 4px" }}>
                          <button
                            type="button"
                            title="Geldi olarak işaretle"
                            onClick={() => onSetAttendance(e.customerId, "geldi")}
                            style={{
                              width: 28,
                              height: 28,
                              padding: 0,
                              borderRadius: 6,
                              border:
                                att?.status === "geldi"
                                  ? "1.5px solid #15803d"
                                  : "0.5px solid var(--border)",
                              background: att?.status === "geldi" ? "#15803d" : "var(--surface-2)",
                              color: att?.status === "geldi" ? "#fff" : "transparent",
                            }}
                          >
                            <i className="ti ti-check" aria-hidden="true"></i>
                          </button>
                        </td>
                        <td style={{ textAlign: "center", padding: "6px 4px" }}>
                          <button
                            type="button"
                            title="Gelmedi olarak işaretle"
                            onClick={() => onSetAttendance(e.customerId, "gelmedi")}
                            style={{
                              width: 28,
                              height: 28,
                              padding: 0,
                              borderRadius: 6,
                              border:
                                att?.status === "gelmedi"
                                  ? "1.5px solid #b91c1c"
                                  : "0.5px solid var(--border)",
                              background:
                                att?.status === "gelmedi" ? "#b91c1c" : "var(--surface-2)",
                              color: att?.status === "gelmedi" ? "#fff" : "transparent",
                            }}
                          >
                            <i className="ti ti-check" aria-hidden="true"></i>
                          </button>
                        </td>
                      </>
                    )}
                    <td
                      style={{
                        textAlign: "right",
                        padding: "6px 10px",
                        borderRadius: "0 var(--radius) var(--radius) 0",
                      }}
                    >
                      <IconButton
                        icon="ti-x"
                        title="Dersten çıkar"
                        size="sm"
                        onClick={() => setConfirmRemove(e)}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {full ? (
        <p style={{ fontSize: 12, color: "var(--text-danger)" }}>{words.fullMessage}</p>
      ) : (
        <>
          <p
            style={{
              fontSize: 13,
              fontWeight: 500,
              margin: "0 0 4px",
              display: "flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            {words.addMemberLabel}
            <InfoTip text={words.addMemberInfoTip} />
          </p>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Müşteri ara (ad, telefon, e-posta)"
            style={{ width: "100%" }}
          />
          {matches.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 8 }}>
              {matches.map((c) => (
                <div
                  key={c.id}
                  onClick={() => {
                    onEnroll(c.id);
                    setSearch("");
                  }}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    background: "var(--surface-1)",
                    borderRadius: "var(--radius)",
                    padding: "6px 10px",
                    cursor: "pointer",
                  }}
                >
                  <span style={{ fontSize: 13 }}>{c.name}</span>
                  <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{c.phone}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {confirmRemove && (
        <ConfirmDialog
          title={words.removeMemberTitle}
          message={`"${customers.find((c) => c.id === confirmRemove.customerId)?.name || "Müşteri"}" bu dersten çıkarılacak. Bu geri alınamaz.`}
          onConfirm={() => {
            onRemove(confirmRemove.id);
            setConfirmRemove(null);
          }}
          onClose={() => setConfirmRemove(null)}
        />
      )}
    </div>
  );
}

// Çoğu KOBİ bu politikayı hiç kullanmayacak — İşletme Bilgileri'nde her zaman
// açık 3 alan olarak dururken hem gereksiz karmaşıklık katıyordu hem de dar
// (420px) modalde InfoTip balonu taşıyordu. Artık Dersler sekmesinde,
// varsayılan olarak KAPALI, "Ayarla"/"Düzenle" butonuyla açılan bir kutu —
// kullanılmıyorsa özet satırı bile göstermiyor, tek satır bilgi yeterli.
export function LateCancelPolicyBox({ companySettings, onSave }) {
  const configured =
    companySettings?.hardBlockHours != null ||
    companySettings?.lateCancelHours != null ||
    companySettings?.lateCancelStrikeLimit != null;
  const [open, setOpen] = useState(false);
  const [hardBlockOn, setHardBlockOn] = useState(companySettings?.hardBlockHours != null);
  const [hardBlockHours, setHardBlockHours] = useState(companySettings?.hardBlockHours ?? "");
  const [lateCancelOn, setLateCancelOn] = useState(companySettings?.lateCancelHours != null);
  const [lateCancelHours, setLateCancelHours] = useState(companySettings?.lateCancelHours ?? "");
  const [strikeOn, setStrikeOn] = useState(companySettings?.lateCancelStrikeLimit != null);
  const [lateCancelStrikeLimit, setLateCancelStrikeLimit] = useState(
    companySettings?.lateCancelStrikeLimit ?? "",
  );

  const handleOpen = () => {
    setHardBlockOn(companySettings?.hardBlockHours != null);
    setHardBlockHours(companySettings?.hardBlockHours ?? "");
    setLateCancelOn(companySettings?.lateCancelHours != null);
    setLateCancelHours(companySettings?.lateCancelHours ?? "");
    setStrikeOn(companySettings?.lateCancelStrikeLimit != null);
    setLateCancelStrikeLimit(companySettings?.lateCancelStrikeLimit ?? "");
    setOpen(true);
  };

  const handleSave = () => {
    onSave({
      hardBlockHours: hardBlockOn && hardBlockHours !== "" ? Number(hardBlockHours) : null,
      lateCancelHours: lateCancelOn && lateCancelHours !== "" ? Number(lateCancelHours) : null,
      lateCancelStrikeLimit:
        strikeOn && lateCancelStrikeLimit !== "" ? Number(lateCancelStrikeLimit) : null,
    });
    setOpen(false);
  };

  return (
    <div
      style={{
        marginBottom: 16,
        background: "var(--surface-1)",
        border: "0.5px solid var(--border)",
        borderRadius: "var(--radius)",
        padding: 12,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 8,
          flexWrap: "wrap",
        }}
      >
        <p
          style={{
            fontSize: 13,
            fontWeight: 500,
            margin: 0,
            display: "flex",
            alignItems: "center",
            gap: 4,
          }}
        >
          Geç iptal / seans yakma politikası
          <InfoTip
            align="left"
            text={
              "Üçü de opsiyonel, hiç ayarlamazsanız hiçbir şey değişmez (sabit 2 saatlik iptal kilidi geçerli olmaya devam eder).\n\n" +
              "Nasıl işler: ders saatine 'Tamamen kilitle' süresinden az kala üye HİÇ iptal edemez. Bunun ile 'Uyarı/seans yakma başlangıcı' süresi arasında iptal ederse 'geç iptal' sayılır - kaçıncı geç iptalde seansın yanacağını 'Kaçıncı geç iptalde' alanı belirler (örn. 3 girerseniz ilk 2 geç iptal sadece uyarı, 3.'den itibaren her geç iptalde 1 seans düşer). Bu iki eşiğin arasındaki sürede DEĞİLSE (yani yeterince erken iptal ediyorsa) hiçbir ceza uygulanmaz."
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
            ? `Aktif: dersten ${companySettings.hardBlockHours ?? 2} saat kalana kadar tamamen kilit${companySettings.lateCancelHours != null ? `, ${companySettings.lateCancelHours} saatten itibaren geç iptal sayılır` : ""}${companySettings.lateCancelStrikeLimit ? `, ${companySettings.lateCancelStrikeLimit}. geç iptalde seans yanmaya başlar` : ""}.`
            : "Kullanılmıyor - üyeler ders saatine 2 saat kalana kadar serbestçe iptal edebiliyor, geç iptal için özel bir kural/ceza yok."}
        </p>
      )}
      {open && (
        <>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 10 }}>
            <div>
              <label
                style={{
                  fontSize: 12,
                  color: "var(--text-secondary)",
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  marginBottom: 4,
                }}
              >
                <input
                  type="checkbox"
                  checked={hardBlockOn}
                  onChange={(e) => setHardBlockOn(e.target.checked)}
                />
                Tamamen kilitle (saat)
              </label>
              <input
                type="number"
                min="0"
                step="0.5"
                disabled={!hardBlockOn}
                value={hardBlockHours}
                onChange={(e) => setHardBlockHours(e.target.value)}
                placeholder="Varsayılan: 2"
                style={{ width: 150 }}
              />
            </div>
            <div>
              <label
                style={{
                  fontSize: 12,
                  color: "var(--text-secondary)",
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  marginBottom: 4,
                }}
              >
                <input
                  type="checkbox"
                  checked={lateCancelOn}
                  onChange={(e) => setLateCancelOn(e.target.checked)}
                />
                Uyarı/seans yakma başlangıcı (saat)
              </label>
              <input
                type="number"
                min="0"
                step="0.5"
                disabled={!lateCancelOn}
                value={lateCancelHours}
                onChange={(e) => setLateCancelHours(e.target.value)}
                placeholder="Örn. 4"
                style={{ width: 150 }}
              />
            </div>
            <div>
              <label
                style={{
                  fontSize: 12,
                  color: "var(--text-secondary)",
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  marginBottom: 4,
                }}
              >
                <input
                  type="checkbox"
                  checked={strikeOn}
                  onChange={(e) => setStrikeOn(e.target.checked)}
                />
                Kaçıncı geç iptalde seans yansın
              </label>
              <input
                type="number"
                min="1"
                step="1"
                disabled={!strikeOn}
                value={lateCancelStrikeLimit}
                onChange={(e) => setLateCancelStrikeLimit(e.target.value)}
                placeholder="Varsayılan: 1 (hemen)"
                style={{ width: 150 }}
              />
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 10 }}>
            <button type="button" onClick={() => setOpen(false)}>
              Vazgeç
            </button>
            <button
              type="button"
              onClick={handleSave}
              style={{
                background: "var(--fill-accent)",
                color: "var(--on-accent)",
                border: "none",
              }}
            >
              Kaydet
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// Tekli randevu sektörlerinde (Güzellik & Bakım, Sağlık/Klinik, Emlak vb. —
// bookingModel(sector)==="slot" olan her yerde) portaldan iptal/gelmeme
// politikası TAMAMEN kobiye bırakılıyor — dört bağımsız, opsiyonel katman:
// 1) Tamamen kilitle: bu süreden az kala portaldan iptal edilemez.
// 2) Geç sayılma penceresi: (1)'den fazla ama bu süreden az kala yapılan
//    iptaller ENGELLENMEZ ama "Geç iptal etti" olarak işaretlenir.
// 3) Kaçıncı ihlalde: geç iptal + gelmeme (Randevuya gelmedi) sayısı bu
//    eşiğe ulaşınca o müşterinin SONRAKİ randevusunda ödeme otomatik
//    zorunlu hale gelir (bkz. computeNoShowRisk, DealForm).
// 4) Paket sahiplerinde seans yaksın: müşterinin zaten aktif (tükenmemiş)
//    bir paketi varsa, (3)'teki ödeme zorunluluğu YERİNE, ihlal ANINDA
//    (gecikmesiz — bkz. computeAppointmentPenaltyBurn) paketten 1 seans
//    düşülür. Zaten ödemiş birine tekrar ödeme istemek adaletsiz olurdu.
// Dördü de boşsa HİÇBİR kısıtlama/ceza yok — eski "kapalıyken sabit 2 saat
// kilitli" davranışı BİLEREK kaldırıldı, kobi "iptal etse de sorun değil"
// diyorsa bunu tam olarak uygulayabilsin diye (2026-07-26).
export function GroupClassesTab({
  groupClasses,
  groupClassEnrollments,
  customers,
  activeCustomerIds,
  sector,
  companySettings,
  onAdd,
  onUpdate,
  onDelete,
  onEnroll,
  onRemove,
  onSaveCancelPolicy,
}) {
  const words = groupClassWords(sector);
  const [showForm, setShowForm] = useState(false);
  const [editingClass, setEditingClass] = useState(null);
  const [rosterClass, setRosterClass] = useState(null);
  const [confirmDeleteClass, setConfirmDeleteClass] = useState(null);

  const enrollCountFor = (classId) =>
    groupClassEnrollments.filter((e) => e.groupClassId === classId).length;
  const rosterClassLive = rosterClass
    ? groupClasses.find((g) => g.id === rosterClass.id) || null
    : null;

  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 16,
        }}
      >
        <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: 0 }}>
          {words.tabSubtitle}
        </p>
        <button
          onClick={() => {
            setEditingClass(null);
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
          Yeni ders
        </button>
      </div>

      <LateCancelPolicyBox companySettings={companySettings} onSave={onSaveCancelPolicy} />

      {groupClasses.length === 0 ? (
        <p style={{ fontSize: 14, color: "var(--text-secondary)" }}>Henüz ders eklenmedi.</p>
      ) : (
        <div style={{ display: "flex", gap: 12, overflowX: "auto", paddingBottom: 8 }}>
          {WEEKDAYS.map((wLabel, i) => {
            const wd = i + 1;
            const dayClasses = groupClasses
              .filter((g) => g.weekday === wd)
              .sort((a, b) => a.startTime.localeCompare(b.startTime));
            return (
              <div key={wd} style={{ minWidth: 160, flex: "none" }}>
                <p
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: "var(--text-secondary)",
                    textTransform: "uppercase",
                    margin: "0 0 8px",
                  }}
                >
                  {wLabel}
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {dayClasses.map((g) => {
                    const count = enrollCountFor(g.id);
                    const full = count >= g.capacity;
                    return (
                      <div
                        key={g.id}
                        onClick={() => setRosterClass(g)}
                        style={{
                          background: "var(--surface-1)",
                          border: "0.5px solid var(--border)",
                          borderRadius: "var(--radius)",
                          padding: "10px 12px",
                          cursor: "pointer",
                          opacity: full ? 0.7 : 1,
                        }}
                      >
                        <p style={{ margin: 0, fontSize: 13, fontWeight: 600 }}>{g.name}</p>
                        <p
                          style={{
                            margin: "2px 0 6px",
                            fontSize: 12,
                            color: "var(--text-secondary)",
                          }}
                        >
                          {g.startTime}
                          {g.instructorName ? ` · ${g.instructorName}` : ""}
                        </p>
                        <Badge tone={full ? "danger" : "success"}>
                          {count}/{g.capacity} dolu
                        </Badge>
                      </div>
                    );
                  })}
                  {dayClasses.length === 0 && (
                    <p style={{ fontSize: 12, color: "var(--text-muted)" }}>-</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showForm && (
        <Modal
          title={editingClass ? "Dersi düzenle" : "Yeni ders"}
          onClose={() => setShowForm(false)}
        >
          <GroupClassForm
            initial={editingClass}
            sector={sector}
            currentEnrollment={editingClass ? enrollCountFor(editingClass.id) : 0}
            onSave={(vals) => {
              editingClass ? onUpdate({ id: editingClass.id, ...vals }) : onAdd(vals);
              setShowForm(false);
            }}
            onCancel={() => setShowForm(false)}
          />
        </Modal>
      )}

      {rosterClassLive && (
        <Modal title={rosterClassLive.name} onClose={() => setRosterClass(null)}>
          <GroupClassRoster
            group={rosterClassLive}
            enrollments={groupClassEnrollments.filter((e) => e.groupClassId === rosterClassLive.id)}
            customers={customers}
            activeCustomerIds={activeCustomerIds}
            sector={sector}
            onEdit={() => {
              setEditingClass(rosterClassLive);
              setShowForm(true);
              setRosterClass(null);
            }}
            onDelete={() => setConfirmDeleteClass(rosterClassLive)}
            onEnroll={(customerId) => onEnroll({ groupClassId: rosterClassLive.id, customerId })}
            onRemove={onRemove}
          />
        </Modal>
      )}

      {confirmDeleteClass && (
        <ConfirmDialog
          title="Dersi sil"
          message={`"${confirmDeleteClass.name}" ${words.deleteClassMessage}`}
          onConfirm={() => {
            onDelete(confirmDeleteClass.id);
            setConfirmDeleteClass(null);
            setRosterClass(null);
          }}
          onClose={() => setConfirmDeleteClass(null)}
        />
      )}
    </div>
  );
}
