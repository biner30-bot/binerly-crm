import { useState, useEffect } from "react";
import { supabase } from "./supabase";
import {
  Modal,
  InfoTip,
  ConfirmDialog,
  Badge,
  IconButton,
  MAX_TEAM_SIZE,
  WEEKDAYS,
  WEEKDAYS_SHORT,
  DateRangeFilter,
  SegmentedControl,
  formatTimeWindowsSummary,
  summarizeTimeWindows,
} from "./shared";

export function isOpenStaffShift(s) {
  return !s.validTo;
}

// Belirli bir tarihte kimin ne çalıştığını, o tarihte AÇIK OLAN versiyon(lar)ı
// tarayarak yeniden inşa eder — açık/kapalı ayrımı olmadan sadece weekday'e
// bakan eski yaklaşım, personel geçmişte farklı bir vardiyada çalışmış olsa
// bile her zaman GÜNCEL vardiyayı gösterirdi.
export function staffShiftsEffectiveOnDate(staffShifts, memberId, dateStr) {
  const jsWeekday = new Date(`${dateStr}T00:00:00`).getDay();
  const weekday = jsWeekday === 0 ? 7 : jsWeekday;
  return staffShifts.filter((s) => {
    if (s.memberId !== memberId || s.weekday !== weekday) return false;
    if (s.validFrom > dateStr) return false;
    if (s.validTo && s.validTo <= dateStr) return false;
    return true;
  });
}

export function staffLeaveDayCount(startDate, endDate) {
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  return Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
}

export function formatLeaveDateRange(startDate, endDate) {
  const fmt = (d) => new Date(`${d}T00:00:00`).toLocaleDateString("tr-TR");
  return startDate === endDate ? fmt(startDate) : `${fmt(startDate)} - ${fmt(endDate)}`;
}

export const STAFF_LEAVE_TYPE_LABELS = {
  yillik: "Yıllık İzin",
  ucretsiz: "Ücretsiz İzin",
  raporlu: "Raporlu / Sağlık İzni",
  mazeret: "Mazeret İzni",
  diger: "Diğer",
};

export function StaffShiftDayEditor({
  weekday,
  memberLabel,
  items,
  onAdd,
  onDelete,
  onSetOff,
  onClose,
}) {
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("18:00");
  const [hasBreak, setHasBreak] = useState(false);
  const [breakStart, setBreakStart] = useState("12:00");
  const [breakEnd, setBreakEnd] = useState("13:00");
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [confirmOff, setConfirmOff] = useState(false);

  const offItem = items.find((s) => s.isOff);
  const sorted = [...items]
    .filter((s) => !s.isOff)
    .sort((a, b) => a.startTime.localeCompare(b.startTime));

  // BusinessHoursManager'daki (AppointmentPolicies.jsx) AYNI sessiz-tekrar
  // koruması - form eklemeden sonra sıfırlanmıyor, çift tıklama aynı vardiya
  // aralığını ikinci kez ekleyebiliyordu.
  const alreadyExists = (s, en) =>
    items.some((it) => !it.isOff && it.startTime === s && it.endTime === en);

  const submit = (e) => {
    e.preventDefault();
    if (!startTime || !endTime || endTime <= startTime) return;
    if (hasBreak) {
      if (
        !breakStart ||
        !breakEnd ||
        breakStart <= startTime ||
        breakEnd >= endTime ||
        breakEnd <= breakStart
      )
        return;
      if (alreadyExists(startTime, breakStart) || alreadyExists(breakEnd, endTime)) return;
      onAdd({ weekday, startTime, endTime: breakStart });
      onAdd({ weekday, startTime: breakEnd, endTime });
    } else {
      if (alreadyExists(startTime, endTime)) return;
      onAdd({ weekday, startTime, endTime });
    }
  };

  return (
    <Modal title={`${memberLabel} - ${WEEKDAYS[weekday - 1]}`} onClose={onClose}>
      {offItem ? (
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 8,
            background: "var(--bg-warning)",
            border: "0.5px solid var(--border)",
            borderRadius: "var(--radius)",
            padding: "8px 12px",
            marginBottom: 12,
          }}
        >
          <span style={{ fontSize: 13, fontWeight: 500 }}>
            Bu gün haftalık tatil olarak işaretli
          </span>
          <button type="button" onClick={() => onDelete(offItem.id)} style={{ fontSize: 12 }}>
            Tatili kaldır
          </button>
        </div>
      ) : (
        <>
          {sorted.length === 0 ? (
            <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 12 }}>
              Bu gün için vardiya tanımlanmadı.
            </p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 12 }}>
              {sorted.length > 1 && (
                <p style={{ fontSize: 12.5, color: "var(--text-secondary)", margin: "0 0 2px" }}>
                  Özet: {formatTimeWindowsSummary(sorted)}
                </p>
              )}
              {sorted.map((s) => (
                <div
                  key={s.id}
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
                  <Badge tone="accent">
                    {s.startTime}-{s.endTime}
                  </Badge>
                  <IconButton
                    icon="ti-trash"
                    title="Sil"
                    size="sm"
                    onClick={() => setConfirmDelete(s)}
                  />
                </div>
              ))}
            </div>
          )}

          <form
            onSubmit={submit}
            style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}
          >
            <div style={{ width: 110 }}>
              <label
                style={{
                  fontSize: 12,
                  color: "var(--text-secondary)",
                  display: "block",
                  marginBottom: 4,
                }}
              >
                Başlangıç
              </label>
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                style={{ width: "100%" }}
              />
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
                Bitiş
              </label>
              <input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                style={{ width: "100%" }}
              />
            </div>
            <div
              style={{
                width: "100%",
                display: "flex",
                gap: 8,
                alignItems: "flex-end",
                flexWrap: "wrap",
              }}
            >
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  fontSize: 13,
                  color: "var(--text-secondary)",
                  marginBottom: 8,
                }}
              >
                <input
                  type="checkbox"
                  checked={hasBreak}
                  onChange={(e) => setHasBreak(e.target.checked)}
                />
                Öğle arası / mola var
              </label>
              {hasBreak && (
                <>
                  <div style={{ width: 110 }}>
                    <label
                      style={{
                        fontSize: 12,
                        color: "var(--text-secondary)",
                        display: "block",
                        marginBottom: 4,
                      }}
                    >
                      Ara başlangıç
                    </label>
                    <input
                      type="time"
                      value={breakStart}
                      onChange={(e) => setBreakStart(e.target.value)}
                      style={{ width: "100%" }}
                    />
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
                      Ara bitiş
                    </label>
                    <input
                      type="time"
                      value={breakEnd}
                      onChange={(e) => setBreakEnd(e.target.value)}
                      style={{ width: "100%" }}
                    />
                  </div>
                </>
              )}
            </div>
            <button
              type="submit"
              style={{
                background: "var(--fill-accent)",
                color: "var(--on-accent)",
                border: "none",
              }}
            >
              + Ekle
            </button>
          </form>
          <p style={{ fontSize: 11.5, color: "var(--text-muted)", margin: "10px 0 0" }}>
            "Öğle arası / mola var" kutusunu işaretleyip ara saatlerini girerseniz gün otomatik iki
            parçaya bölünür.
          </p>
          <button
            type="button"
            onClick={() => setConfirmOff(true)}
            style={{ fontSize: 12, marginTop: 10 }}
          >
            Bu günü haftalık tatil olarak işaretle
          </button>
        </>
      )}

      {confirmDelete && (
        <ConfirmDialog
          title="Vardiyayı sil"
          message={`${confirmDelete.startTime}-${confirmDelete.endTime} vardiyası kaldırılacak. Bu geri alınamaz.`}
          onConfirm={() => {
            onDelete(confirmDelete.id);
            setConfirmDelete(null);
          }}
          onClose={() => setConfirmDelete(null)}
        />
      )}
      {confirmOff && (
        <ConfirmDialog
          title="Haftalık tatil olarak işaretle"
          message={
            sorted.length > 0
              ? `${WEEKDAYS[weekday - 1]} günü için tanımlı ${sorted.length} çalışma saati silinip bu gün haftalık tatil olarak işaretlenecek.`
              : `${WEEKDAYS[weekday - 1]} günü haftalık tatil olarak işaretlenecek.`
          }
          confirmLabel="İşaretle"
          onConfirm={() => {
            setConfirmOff(false);
            onSetOff();
          }}
          onClose={() => setConfirmOff(false)}
        />
      )}
      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
        <button onClick={onClose}>Kapat</button>
      </div>
    </Modal>
  );
}

// Haftalık vardiya tablosu — satır=personel (sahip dahil), sütun=gün. Her
// hücre o kişi+günün vardiya penceresini (varsa) gösterir, tıklanınca
// StaffShiftDayEditor açılır. Hiç vardiya tanımlanmamış bir işletmede
// randevu slotları eskisi gibi sadece Müsaitlik Saatleri'ne göre hesaplanır —
// bu tablo boş kaldıkça mevcut davranış birebir korunur.
export function StaffShiftGrid({
  people,
  staffShifts,
  onAdd,
  onDelete,
  onSetOff,
  readOnly = false,
}) {
  const [editingCell, setEditingCell] = useState(null); // { memberId, weekday, label }

  return (
    <div style={{ overflowX: "auto" }}>
      <table
        className="responsive-table"
        style={{ width: "100%", minWidth: 520, borderCollapse: "separate", borderSpacing: "0 6px" }}
      >
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
              Personel
            </th>
            {WEEKDAYS_SHORT.map((w) => (
              <th
                key={w}
                style={{
                  textAlign: "center",
                  padding: "0 4px",
                  fontSize: 11,
                  fontWeight: 600,
                  color: "var(--text-muted)",
                  textTransform: "uppercase",
                  letterSpacing: 0.3,
                }}
              >
                {w}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {people.map((p) => (
            <tr
              key={p.id}
              style={{ background: "var(--surface-1)", boxShadow: "var(--shadow-sm)" }}
            >
              <td
                data-label="Personel"
                style={{
                  padding: "8px 10px",
                  fontSize: 12.5,
                  fontWeight: 500,
                  borderRadius: "var(--radius-lg) 0 0 var(--radius-lg)",
                  whiteSpace: "nowrap",
                }}
              >
                {p.label}
              </td>
              {WEEKDAYS.map((w, i) => {
                const weekday = i + 1;
                const dayShifts = staffShifts
                  .filter(
                    (s) => s.memberId === p.id && s.weekday === weekday && isOpenStaffShift(s),
                  )
                  .sort((a, b) => a.startTime.localeCompare(b.startTime));
                const isOff = dayShifts.some((s) => s.isOff);
                return (
                  <td
                    key={weekday}
                    data-label={w}
                    onClick={
                      readOnly
                        ? undefined
                        : () => setEditingCell({ memberId: p.id, weekday, label: p.label })
                    }
                    style={{
                      padding: "8px 4px",
                      textAlign: "center",
                      cursor: readOnly ? "default" : "pointer",
                    }}
                  >
                    {isOff ? (
                      <Badge tone="warning">Tatil</Badge>
                    ) : dayShifts.length === 0 ? (
                      readOnly ? (
                        <span style={{ fontSize: 11, color: "var(--text-muted)" }}>-</span>
                      ) : (
                        <span
                          title="Vardiya ekle"
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            width: 22,
                            height: 22,
                            borderRadius: "50%",
                            border: "1px dashed var(--border)",
                            color: "var(--text-muted)",
                            fontSize: 13,
                            fontWeight: 600,
                          }}
                        >
                          +
                        </span>
                      )
                    ) : (
                      (() => {
                        const summary = summarizeTimeWindows(dayShifts);
                        return (
                          <div
                            style={{
                              display: "flex",
                              flexDirection: "column",
                              gap: 2,
                              alignItems: "center",
                            }}
                          >
                            <Badge tone="accent">{summary.rangeLabel}</Badge>
                            {summary.breaks.length > 0 && (
                              <span style={{ fontSize: 9.5, color: "var(--text-muted)" }}>
                                {summary.breaks.map((b) => b.durationLabel).join(", ")} mola
                              </span>
                            )}
                          </div>
                        );
                      })()
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {!readOnly && editingCell && (
        <StaffShiftDayEditor
          weekday={editingCell.weekday}
          memberLabel={editingCell.label}
          items={staffShifts.filter(
            (s) =>
              s.memberId === editingCell.memberId &&
              s.weekday === editingCell.weekday &&
              isOpenStaffShift(s),
          )}
          onAdd={(shift) => onAdd({ ...shift, memberId: editingCell.memberId })}
          onDelete={onDelete}
          onSetOff={() => onSetOff(editingCell.memberId, editingCell.weekday)}
          onClose={() => setEditingCell(null)}
        />
      )}
    </div>
  );
}

// "Geçen hafta Salı kim çalışıyordu" gibi bir soruya cevap - seçilen tarih
// aralığındaki HER GÜN için, o gün geçerliydi olan vardiya versiyonu (bkz.
// staffShiftsEffectiveOnDate) yeniden inşa edilip tabloda gösterilir. Bugünkü
// canlı StaffShiftGrid'in aksine tamamen salt okunur - geçmiş değiştirilemez.
// "YYYY-MM-DD" <-> Date dönüşümü BİLEREK toISOString/UTC KULLANMIYOR - saat
// dilimi UTC'nin ilerisindeyse (ör. Türkiye, UTC+3) `new Date(str+"T00:00:00").
// toISOString()` yerel gece yarısını UTC'ye çevirirken BİR GÜN GERİYE kayıyor
// (canlı testte "Pzt 27" yerine "Paz 26" görülerek bulundu). Bunun yerine
// getFullYear/Month/Date gibi hep YEREL saat diliminde çalışan getter'larla
// elle string kuruluyor, hiç UTC'ye geçilmiyor.
export function staffHistoryDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function staffHistoryParseDateStr(s) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function StaffShiftHistoryModal({ people, staffShifts, onClose }) {
  const todayStr = staffHistoryDateStr(new Date());
  const mondayOfThisWeek = () => {
    const d = new Date();
    const jsWeekday = d.getDay();
    const iso = jsWeekday === 0 ? 7 : jsWeekday;
    d.setDate(d.getDate() - (iso - 1));
    return staffHistoryDateStr(d);
  };
  const [fromDate, setFromDate] = useState(mondayOfThisWeek());
  const [toDate, setToDate] = useState(todayStr);

  const MAX_RANGE_DAYS = 62;
  const rangeDayCount =
    fromDate && toDate && fromDate <= toDate
      ? Math.round(
          (staffHistoryParseDateStr(toDate) - staffHistoryParseDateStr(fromDate)) / 86400000,
        ) + 1
      : 0;
  const dates = [];
  if (rangeDayCount > 0 && rangeDayCount <= MAX_RANGE_DAYS) {
    const cursor = staffHistoryParseDateStr(fromDate);
    for (let i = 0; i < rangeDayCount; i++) {
      dates.push(staffHistoryDateStr(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
  }

  const dayLabel = (dateStr) => {
    const d = staffHistoryParseDateStr(dateStr);
    const iso = d.getDay() === 0 ? 7 : d.getDay();
    return `${WEEKDAYS_SHORT[iso - 1]} ${d.getDate()}`;
  };

  return (
    <Modal title="Vardiya Geçmişi" onClose={onClose} wide>
      <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: "0 0 12px" }}>
        Bir tarih aralığı seçin - o dönemde kimin hangi gün ne çalıştığını (o günkü geçerli kurala
        göre) görün. Vardiya değişiklikleri geçmiş tarihleri etkilemez.
      </p>
      <div style={{ marginBottom: 12 }}>
        <DateRangeFilter
          from={fromDate}
          to={toDate}
          onFromChange={setFromDate}
          onToChange={setToDate}
        />
      </div>
      {rangeDayCount > MAX_RANGE_DAYS ? (
        <p style={{ fontSize: 13, color: "var(--text-danger)" }}>
          En fazla {MAX_RANGE_DAYS} günlük bir aralık seçebilirsiniz (yaklaşık 2 ay).
        </p>
      ) : dates.length === 0 ? (
        <p style={{ fontSize: 13, color: "var(--text-muted)" }}>
          Geçerli bir tarih aralığı seçin (başlangıç bitişten sonra olamaz).
        </p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table
            style={{
              width: "100%",
              minWidth: dates.length * 68 + 130,
              borderCollapse: "separate",
              borderSpacing: "0 6px",
            }}
          >
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
                  Personel
                </th>
                {dates.map((d) => (
                  <th
                    key={d}
                    style={{
                      textAlign: "center",
                      padding: "0 4px",
                      fontSize: 10.5,
                      fontWeight: 600,
                      color: "var(--text-muted)",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {dayLabel(d)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {people.map((p) => (
                <tr
                  key={p.id}
                  style={{ background: "var(--surface-1)", boxShadow: "var(--shadow-sm)" }}
                >
                  <td
                    style={{
                      padding: "8px 10px",
                      fontSize: 12.5,
                      fontWeight: 500,
                      whiteSpace: "nowrap",
                      borderRadius: "var(--radius-lg) 0 0 var(--radius-lg)",
                    }}
                  >
                    {p.label}
                  </td>
                  {dates.map((d) => {
                    const shifts = staffShiftsEffectiveOnDate(staffShifts, p.id, d);
                    const isOff = shifts.some((s) => s.isOff);
                    return (
                      <td
                        key={d}
                        style={{
                          padding: "8px 4px",
                          fontSize: 10.5,
                          textAlign: "center",
                          whiteSpace: "nowrap",
                          color: isOff
                            ? "var(--text-warning)"
                            : shifts.length
                              ? "var(--text-accent)"
                              : "var(--text-muted)",
                          fontWeight: isOff ? 600 : 400,
                        }}
                      >
                        {isOff
                          ? "Tatil"
                          : shifts.length === 0
                            ? "-"
                            : formatTimeWindowsSummary(shifts)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
        <button onClick={onClose}>Kapat</button>
      </div>
    </Modal>
  );
}

export function StaffLeaveRecordModal({ memberLabel, onSave, onClose }) {
  const [leaveType, setLeaveType] = useState("yillik");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [note, setNote] = useState("");

  const submit = (e) => {
    e.preventDefault();
    if (!startDate) return;
    onSave({ leaveType, startDate, endDate: endDate || startDate, note });
  };

  return (
    <Modal title={`${memberLabel} - İzin ekle`} onClose={onClose}>
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
            İzin türü
          </label>
          <select
            value={leaveType}
            onChange={(e) => setLeaveType(e.target.value)}
            style={{ width: "100%" }}
          >
            {Object.entries(STAFF_LEAVE_TYPE_LABELS).map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
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
              Başlangıç
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              style={{ width: "100%" }}
            />
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
              Bitiş
            </label>
            <input
              type="date"
              value={endDate}
              min={startDate || undefined}
              onChange={(e) => setEndDate(e.target.value)}
              placeholder={startDate}
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
            Not <span style={{ fontWeight: 400, color: "var(--text-muted)" }}>(opsiyonel)</span>
          </label>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Örn. göz muayenesi"
            style={{ width: "100%" }}
          />
        </div>
        <p style={{ fontSize: 11.5, color: "var(--text-muted)", margin: "0 0 12px" }}>
          Bitiş tarihi boş bırakılırsa tek gün olarak kaydedilir.
        </p>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button type="button" onClick={onClose}>
            Vazgeç
          </button>
          <button
            type="submit"
            style={{ background: "var(--fill-accent)", color: "var(--on-accent)", border: "none" }}
          >
            Ekle
          </button>
        </div>
      </form>
    </Modal>
  );
}

// Kişi başına yıllık izin bakiyesi (elle girilen, sürekli takip edilen - otomatik
// yıl başı sıfırlaması yok, bkz. sql/2026-08-02_staff_leave_system.sql) + izin
// kayıtları (yıllık/ücretsiz/raporlu/mazeret/diğer). Sadece "yillik" tipi
// bakiyeden düşülür - istemci tarafında hesaplanıyor, sunucuda ayrı bir "kalan
// gün" kolonu yok (tek doğruluk kaynağı: kayıtların toplamı).
export function StaffLeaveManager({
  people,
  balances,
  records,
  onSetBalance,
  onAddRecord,
  onDeleteRecord,
  readOnly = false,
}) {
  const [addingFor, setAddingFor] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {people.map((p) => {
        const balance = balances.find((b) => b.memberId === p.id)?.annualLeaveDays ?? 14;
        const personRecords = records
          .filter((r) => r.memberId === p.id)
          .sort((a, b) => b.startDate.localeCompare(a.startDate));
        const usedAnnual = personRecords
          .filter((r) => r.leaveType === "yillik")
          .reduce((sum, r) => sum + staffLeaveDayCount(r.startDate, r.endDate), 0);
        const remaining = balance - usedAnnual;
        return (
          <div
            key={p.id}
            style={{
              background: "var(--surface-1)",
              border: "0.5px solid var(--border)",
              borderRadius: "var(--radius)",
              padding: "8px 12px",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                flexWrap: "wrap",
                gap: 8,
              }}
            >
              <span style={{ fontSize: 13, fontWeight: 500 }}>{p.label}</span>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                {readOnly ? (
                  <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                    Yıllık izin hakkı: {balance} gün
                  </span>
                ) : (
                  <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <label style={{ fontSize: 11, color: "var(--text-muted)" }}>
                      Yıllık izin hakkı
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="0.5"
                      defaultValue={balance}
                      onBlur={(e) => {
                        const v = e.target.value === "" ? 0 : Number(e.target.value);
                        if (v !== balance) onSetBalance(p.id, v);
                      }}
                      style={{ width: 60, fontSize: 12, padding: "2px 6px" }}
                    />
                  </span>
                )}
                <Badge tone={remaining < 0 ? "danger" : "accent"}>
                  {usedAnnual} kullanıldı, {remaining} kaldı
                </Badge>
                {!readOnly && (
                  <button type="button" onClick={() => setAddingFor(p)} style={{ fontSize: 12 }}>
                    + İzin ekle
                  </button>
                )}
              </div>
            </div>
            {personRecords.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 8 }}>
                {personRecords.map((r) => (
                  <div
                    key={r.id}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      gap: 8,
                      fontSize: 12,
                      padding: "4px 0",
                      borderTop: "0.5px solid var(--border)",
                    }}
                  >
                    <span>
                      <Badge tone="default">{STAFF_LEAVE_TYPE_LABELS[r.leaveType]}</Badge>{" "}
                      {formatLeaveDateRange(r.startDate, r.endDate)} ·{" "}
                      {staffLeaveDayCount(r.startDate, r.endDate)} gün
                      {r.note && <span style={{ color: "var(--text-muted)" }}> - {r.note}</span>}
                    </span>
                    {!readOnly && (
                      <IconButton
                        icon="ti-trash"
                        title="Sil"
                        size="sm"
                        onClick={() => setConfirmDelete(r)}
                      />
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}

      {addingFor && (
        <StaffLeaveRecordModal
          memberLabel={addingFor.label}
          onClose={() => setAddingFor(null)}
          onSave={(payload) => {
            onAddRecord({ memberId: addingFor.id, ...payload });
            setAddingFor(null);
          }}
        />
      )}
      {confirmDelete && (
        <ConfirmDialog
          title="İzin kaydını sil"
          message={`${STAFF_LEAVE_TYPE_LABELS[confirmDelete.leaveType]} kaydı (${formatLeaveDateRange(confirmDelete.startDate, confirmDelete.endDate)}) silinecek. Bu geri alınamaz.`}
          onConfirm={() => {
            onDeleteRecord(confirmDelete.id);
            setConfirmDelete(null);
          }}
          onClose={() => setConfirmDelete(null)}
        />
      )}
    </div>
  );
}

// Otel gibi "randevu saati" değil "oda stoku" mantığıyla çalışan sektörler için —
// Müsaitlik Saatleri'ndeki gün/saat/slot modeli buraya uymuyor (bkz. bookingModel,
// Sectors.jsx): burada müsaitlik bir GÜN/SAAT slotu değil, bir TARİH ARALIĞINDA
// kaç aynı tipte oda boş olduğudur. Oda tipi listesi serbest metin değil, "Sektör &
// Özel Alanlar"daki aktif "oda_tipi" seçenekli alanının kendi seçeneklerinden
// geliyor — böylece iki ayrı yerde oda tipi listesi bakımı gerekmiyor.
// staff_shifts (vardiya) ve deals.assigned_to (KOBİ'nin elle atadığı "Sorumlu")
// arasında zaten mevcut olan bağı (aynı member_id) kullanarak "bugün kim ne
// kadar dolu" görünümü. Yeni bir tablo/kolon YOK. Herkese açık widget'tan veya
// müşteri portalından kendi kendine alınan randevularda assigned_to hiç set
// edilmediği için (bkz. api/lead-capture.js, CustomerPortal.jsx bookAppointment)
// bunlar "Atanmamış" altında toplanır - personel seçimi müşteri tarafına henüz
// eklenmedi (appointment-availability.js'teki mevcut yorum bunu bilinçli olarak
// ertelemişti).
export function TeamDailyLoadPanel({
  members,
  staffShifts,
  deals,
  customers,
  customFieldDefs,
  sessionUserId,
}) {
  const dateTimeKey = customFieldDefs.find(
    (d) => d.entity === "deal" && d.type === "datetime" && d.active,
  )?.key;
  if (!dateTimeKey) return null;

  // toISOString (UTC) DEĞİL - Türkiye gibi UTC'nin ilerisindeki saat dilimlerinde
  // gece yarısına yakın "bugün" bir gün geriye kayabiliyordu (bkz.
  // staffHistoryDateStr yorumu, aynı sınıf hata).
  const todayStr = staffHistoryDateStr(new Date());

  const todayDeals = deals.filter((d) => {
    const raw = d.customFields?.[dateTimeKey];
    return raw && raw.startsWith(todayStr) && d.stage !== "kaybedildi";
  });
  if (todayDeals.length === 0) return null;

  const people = [
    { id: sessionUserId, label: "Ben" },
    ...members.map((m) => ({ id: m.member_id, label: m.name || m.email })),
  ];
  const dealsByAssignee = {};
  const unassigned = [];
  for (const d of todayDeals) {
    if (d.assignedTo) (dealsByAssignee[d.assignedTo] ||= []).push(d);
    else unassigned.push(d);
  }
  const customerName = (id) => customers.find((c) => c.id === id)?.name || "Bilinmeyen müşteri";
  const timeOf = (d) => (d.customFields?.[dateTimeKey] || "").slice(11, 16);
  const sortByTime = (list) => [...list].sort((a, b) => timeOf(a).localeCompare(timeOf(b)));

  return (
    <div style={{ marginBottom: 16 }}>
      <label
        style={{ fontSize: 13, color: "var(--text-secondary)", display: "block", marginBottom: 6 }}
      >
        Bugünün Doluluğu{" "}
        <InfoTip
          placement="bottom"
          text="Bugüne ait randevular, her randevunun 'Sorumlu' alanına göre gruplanır. Herkese açık randevu linkinden veya müşteri portalından gelen randevularda henüz kimse atanmamışsa 'Atanmamış' altında görünür."
        />
      </label>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {people.map((p) => {
          const dayShifts = staffShiftsEffectiveOnDate(staffShifts, p.id, todayStr).sort((a, b) =>
            a.startTime.localeCompare(b.startTime),
          );
          const isOff = dayShifts.some((s) => s.isOff);
          const list = dealsByAssignee[p.id] || [];
          return (
            <div
              key={p.id}
              style={{
                background: "var(--surface-1)",
                border: "0.5px solid var(--border)",
                borderRadius: "var(--radius)",
                padding: "8px 12px",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: 13,
                  fontWeight: 500,
                  flexWrap: "wrap",
                  gap: 6,
                }}
              >
                <span>{p.label}</span>
                <span
                  style={{
                    color: isOff ? "var(--text-warning)" : "var(--text-muted)",
                    fontWeight: isOff ? 600 : 400,
                  }}
                >
                  {isOff
                    ? "Bugün tatil"
                    : dayShifts.length
                      ? formatTimeWindowsSummary(dayShifts)
                      : "Bugün vardiyası yok"}
                </span>
              </div>
              {list.length === 0 ? (
                <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "4px 0 0" }}>
                  Bugüne atanmış randevusu yok.
                </p>
              ) : (
                <ul style={{ margin: "4px 0 0", paddingLeft: 16, fontSize: 12 }}>
                  {sortByTime(list).map((d) => (
                    <li key={d.id}>
                      {timeOf(d)} - {customerName(d.customerId)} ({d.title})
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
        {unassigned.length > 0 && (
          <div
            style={{
              background: "var(--surface-1)",
              border: "0.5px dashed var(--border)",
              borderRadius: "var(--radius)",
              padding: "8px 12px",
            }}
          >
            <p style={{ fontSize: 13, fontWeight: 500, margin: 0, color: "var(--text-warning)" }}>
              Atanmamış ({unassigned.length})
            </p>
            <ul style={{ margin: "4px 0 0", paddingLeft: 16, fontSize: 12 }}>
              {sortByTime(unassigned).map((d) => (
                <li key={d.id}>
                  {timeOf(d)} - {customerName(d.customerId)} ({d.title})
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

// Hizmet <-> personel yetkinligi. Her personel her islemi ogrenmemis/yapmaya
// uygun olmayabilir - isletme sahibi burada her kisiye (kendisi dahil)
// yapabildigi hizmetleri isaretler. Iliski price_list_items.staff_member_ids
// dizisinde tutulur (bkz. sql/2026-08-29_price_list_item_staff.sql). Bir hizmet
// en az bir kisiye isaretlenince "kisitli" olur: randevuda o hizmet secilince
// Sorumlu listesi bu kisilerle sinirlanir, hepsi o saatte doluysa o saate
// randevu verilemez (bkz. Deals.jsx findAppointmentConflict). Hic kimseye
// isaretlenmeyen hizmeti herkes yapabilir (opt-in, mevcut davranis degismez).
function ServiceCapabilityPanel({ people, priceListItems, onSetServiceStaff }) {
  const services = [...(priceListItems || [])].sort(
    (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0),
  );
  const labelById = new Map((people || []).map((p) => [p.id, p.label]));
  const restricted = services.filter((s) => (s.staffMemberIds || []).length > 0);

  if (services.length === 0) {
    return (
      <p style={{ fontSize: 13, color: "var(--text-muted)" }}>
        Önce Fiyat Listesi&apos;ne hizmet ekleyin - sonra her personele yapabildiği hizmetleri
        buradan işaretleyebilirsiniz.
      </p>
    );
  }

  return (
    <div style={{ marginBottom: 16 }}>
      <label
        style={{
          fontSize: 13,
          color: "var(--text-secondary)",
          display: "flex",
          alignItems: "center",
          gap: 6,
          marginBottom: 8,
        }}
      >
        Yapabildiği hizmetler
        <InfoTip
          placement="bottom"
          text="Bir hizmeti bir personele işaretlediğinizde o hizmet artık SADECE işaretli personel tarafından yapılabilir - o hizmeti yapan diğer personeli de işaretlemeyi unutmayın. Randevuda o hizmet seçilince Sorumlu listesi bu kişilerle sınırlanır; o saatte hepsi doluysa o saate randevu verilemez. Hiç kimseye işaretlenmeyen hizmeti herkes yapabilir."
        />
      </label>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {people.map((p) => {
          const mine = new Set(
            services.filter((s) => (s.staffMemberIds || []).includes(p.id)).map((s) => s.id),
          );
          return (
            <div
              key={p.id}
              style={{
                background: "var(--surface-1)",
                border: "0.5px solid var(--border)",
                borderRadius: "var(--radius)",
                padding: "8px 12px",
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 6 }}>{p.label}</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 14px" }}>
                {services.map((s) => (
                  <label
                    key={s.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 5,
                      fontSize: 12,
                      color: "var(--text-secondary)",
                      cursor: "pointer",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={mine.has(s.id)}
                      onChange={(e) => onSetServiceStaff(s.id, p.id, e.target.checked)}
                    />
                    {s.name}
                  </label>
                ))}
              </div>
              {mine.size === 0 && (
                <p style={{ fontSize: 11.5, color: "var(--text-muted)", margin: "6px 0 0" }}>
                  Hiçbiri işaretli değil - kısıtlanan hizmetlerde Sorumlu seçilemez, kısıtsız
                  hizmetleri yapabilir.
                </p>
              )}
            </div>
          );
        })}
      </div>
      {restricted.length > 0 && (
        <p style={{ marginTop: 10, fontSize: 12, color: "var(--text-muted)" }}>
          <strong style={{ color: "var(--text-secondary)" }}>Kısıtlı hizmetler:</strong>{" "}
          {restricted
            .map(
              (s) =>
                `${s.name} (${(s.staffMemberIds || [])
                  .map((id) => labelById.get(id) || "eski üye")
                  .join(", ")})`,
            )
            .join("; ")}
          . Listede olmayan hizmetleri herkes yapabilir.
        </p>
      )}
    </div>
  );
}

// [[project_binerly_business_goal]]: fiyatlandırma "5 kullanıcıya kadar sabit ücret" üzerine
// kurulu - işletme sahibi + kabul edilmiş üyeler + bekleyen davetler toplamı bu sayıyı geçemez
// (davet gönderirken koltuk ayrılır, kabul anında sürpriz reddedilme olmasın diye).
export function TeamModal({
  session,
  activeTeamId,
  companySettings,
  onClose,
  notify,
  staffShifts,
  onAddStaffShift,
  onDeleteStaffShift,
  onSetStaffShiftDayOff,
  staffLeaveBalances,
  staffLeaveRecords,
  onSetStaffLeaveBalance,
  onAddStaffLeaveRecord,
  onDeleteStaffLeaveRecord,
  teamRoster,
  deals,
  customers,
  customFieldDefs,
  priceListItems,
  onSetServiceStaff,
}) {
  const isOwner = activeTeamId === session.user.id;
  const [members, setMembers] = useState([]);
  const [invites, setInvites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [inviteEmail, setInviteEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [confirmRemoveMember, setConfirmRemoveMember] = useState(null);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [showShiftHistory, setShowShiftHistory] = useState(false);
  const [teamTab, setTeamTab] = useState("vardiya");

  const load = async () => {
    setLoading(true);
    if (isOwner) {
      const [{ data: m }, { data: inv }] = await Promise.all([
        supabase.from("team_members").select("*").eq("team_id", activeTeamId).order("joined_at"),
        supabase
          .from("team_invites")
          .select("*")
          .eq("owner_id", activeTeamId)
          .eq("status", "pending")
          .order("created_at"),
      ]);
      setMembers(m || []);
      setInvites(inv || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const occupiedSeats = 1 + members.length + invites.length; // 1 = işletme sahibi
  const atTeamLimit = occupiedSeats >= MAX_TEAM_SIZE;

  const sendInvite = async (e) => {
    e.preventDefault();
    const email = inviteEmail.trim().toLowerCase();
    if (!email) return;
    if (atTeamLimit) {
      notify(
        `En fazla ${MAX_TEAM_SIZE} kullanıcı sınırına ulaştınız. Daha fazlası için info@binerly.com adresinden bize ulaşın.`,
      );
      return;
    }
    setSending(true);
    const { error } = await supabase.from("team_invites").insert({ owner_id: activeTeamId, email });
    if (error) {
      notify(`Davet gönderilemedi: ${error.message}`);
      setSending(false);
      return;
    }
    try {
      await fetch("/api/send-campaign", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          recipients: [email],
          subject: `${companySettings?.companyName || "Binerly"} sizi takımına davet etti`,
          message: `Merhaba,\n\n${companySettings?.companyName || "Bir işletme"} sizi Binerly hesabına takım üyesi olarak davet etti. binerly.com adresine bu e-posta ile giriş yaparak (veya kayıt olarak) daveti kabul edebilirsiniz.\n\nBinerly`,
          replyTo: session.user.email,
          companyName: companySettings?.companyName,
        }),
      });
    } catch {
      // E-posta gönderimi başarısız olsa bile davet kaydı geçerli — kullanıcı giriş yaptığında bekleyen daveti görecek.
    }
    setInviteEmail("");
    setSending(false);
    load();
  };

  const cancelInvite = async (id) => {
    const { error } = await supabase
      .from("team_invites")
      .update({ status: "revoked" })
      .eq("id", id);
    if (error) {
      notify(`Davet iptal edilemedi: ${error.message}`);
      return;
    }
    load();
  };

  const removeMember = async (memberId) => {
    const { error } = await supabase.from("team_members").delete().eq("member_id", memberId);
    if (error) {
      notify(`Üye kaldırılamadı: ${error.message}`);
      return;
    }
    load();
  };

  const toggleEditSettings = async (memberId, value) => {
    const { data, error } = await supabase
      .from("team_members")
      .update({ can_edit_settings: value })
      .eq("member_id", memberId)
      .select();
    // .select() ile satirin gercekten guncellendigini dogruluyoruz - RLS/stale
    // member_id yuzunden 0 satir eslesirse Postgrest hata dondurmez, optimistic
    // state olmadan sessizce hicbir sey degismemis olur.
    if (error || !data?.length) {
      notify(`Yetki güncellenemedi: ${error?.message || "kayıt bulunamadı."}`);
      return;
    }
    setMembers((prev) =>
      prev.map((m) => (m.member_id === memberId ? { ...m, can_edit_settings: value } : m)),
    );
  };

  const updateCommission = async (memberId, { commission_percent, chair_rental_fee }) => {
    const { data, error } = await supabase
      .from("team_members")
      .update({ commission_percent, chair_rental_fee })
      .eq("member_id", memberId)
      .select();
    if (error || !data?.length) {
      notify(`Prim bilgisi güncellenemedi: ${error?.message || "kayıt bulunamadı."}`);
      return;
    }
    setMembers((prev) =>
      prev.map((m) =>
        m.member_id === memberId ? { ...m, commission_percent, chair_rental_fee } : m,
      ),
    );
    // onBlur ile sessizce kaydediyordu - bir "Kaydet" butonu olmadigi icin
    // kullanicinin degisikligin gercekten islendigini gorecegi tek an burasi.
    notify("Prim bilgisi kaydedildi.", "success");
  };

  const leaveTeam = async () => {
    const { error } = await supabase.from("team_members").delete().eq("member_id", session.user.id);
    if (error) {
      notify(`Takımdan ayrılınamadı: ${error.message}`);
      return;
    }
    window.location.reload();
  };

  if (!isOwner) {
    const ownerLabel = companySettings?.companyName
      ? `${companySettings.companyName} (İşletme Sahibi)`
      : "İşletme Sahibi";
    const readOnlyPeople = [
      { id: session.user.id, label: "Ben" },
      { id: activeTeamId, label: ownerLabel },
      ...(teamRoster || [])
        .filter((m) => m.id !== session.user.id)
        .map((m) => ({ id: m.id, label: m.name || m.email })),
    ];
    return (
      <Modal title="Takım" onClose={onClose}>
        <p style={{ fontSize: 13, color: "var(--text-secondary)" }}>
          Bu hesap <strong>{companySettings?.companyName || "bir işletme"}</strong> takımının bir
          üyesi. Tüm müşteri, teklif ve destek verisi bu takımla paylaşılıyor.
        </p>
        <div style={{ margin: "16px 0" }}>
          <SegmentedControl
            value={teamTab}
            onChange={setTeamTab}
            options={[
              { id: "vardiya", label: "Vardiya" },
              { id: "izinler", label: "İzinlerim" },
            ]}
          />
        </div>
        {teamTab === "vardiya" ? (
          <div style={{ marginBottom: 16 }}>
            <label
              style={{
                fontSize: 13,
                color: "var(--text-secondary)",
                display: "flex",
                alignItems: "center",
                gap: 6,
                marginBottom: 6,
              }}
            >
              Vardiya{" "}
              <InfoTip
                placement="bottom"
                text="Sadece görüntüleme - vardiyayı düzenlemek için işletme sahibiyle konuşun."
              />
              <button
                type="button"
                onClick={() => setShowShiftHistory(true)}
                style={{ fontSize: 11.5, padding: "2px 8px", marginLeft: "auto" }}
              >
                Geçmiş
              </button>
            </label>
            <StaffShiftGrid people={readOnlyPeople} staffShifts={staffShifts} readOnly />
          </div>
        ) : (
          <div style={{ marginBottom: 16 }}>
            <label
              style={{
                fontSize: 13,
                color: "var(--text-secondary)",
                display: "block",
                marginBottom: 6,
              }}
            >
              İzinlerim{" "}
              <InfoTip
                placement="bottom"
                text="Sadece kendi izin hakkınızı/kayıtlarınızı görürsünüz - başka üyelerin izin bilgisi size açık değil. Yeni izin talebi için işletme sahibiyle konuşun."
              />
            </label>
            <StaffLeaveManager
              people={[{ id: session.user.id, label: "Ben" }]}
              balances={staffLeaveBalances}
              records={staffLeaveRecords}
              readOnly
            />
          </div>
        )}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
          <button onClick={onClose}>Kapat</button>
          <button onClick={() => setConfirmLeave(true)} style={{ color: "var(--text-danger)" }}>
            Takımdan ayrıl
          </button>
        </div>
        {showShiftHistory && (
          <StaffShiftHistoryModal
            people={readOnlyPeople}
            staffShifts={staffShifts}
            onClose={() => setShowShiftHistory(false)}
          />
        )}
        {confirmLeave && (
          <ConfirmDialog
            title="Takımdan ayrılınsın mı?"
            message="Bu takımın müşteri/teklif/destek verilerine erişiminiz kalmaz - tekrar erişmek için yeniden davet edilmeniz gerekir."
            confirmLabel="Ayrıl"
            onConfirm={() => {
              setConfirmLeave(false);
              leaveTeam();
            }}
            onClose={() => setConfirmLeave(false)}
          />
        )}
      </Modal>
    );
  }

  const staffPeople = [
    { id: session.user.id, label: "Ben" },
    ...members.map((m) => ({ id: m.member_id, label: m.name || m.email })),
  ];

  return (
    <Modal title="Takım" onClose={onClose} wide>
      {loading ? (
        <p style={{ fontSize: 13, color: "var(--text-secondary)" }}>Yükleniyor…</p>
      ) : (
        <>
          <div style={{ marginBottom: 16 }}>
            <SegmentedControl
              value={teamTab}
              onChange={setTeamTab}
              options={[
                { id: "vardiya", label: "Vardiya" },
                { id: "izinler", label: "İzinler" },
                { id: "uyeler", label: `Üyeler (${occupiedSeats}/${MAX_TEAM_SIZE})` },
                { id: "hizmetler", label: "Hizmetler" },
              ]}
            />
          </div>
          {teamTab === "vardiya" ? (
            <>
              <div style={{ marginBottom: 16 }}>
                <label
                  style={{
                    fontSize: 13,
                    color: "var(--text-secondary)",
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    marginBottom: 6,
                  }}
                >
                  Vardiya{" "}
                  <InfoTip
                    placement="bottom"
                    text="Bu sadece ekip içi bir planlama görünümü - müşteri portalındaki randevu saatlerini etkilemez, orada tek geçerli olan Müsaitlik Saatleri'dir. Bir hücreye tıklayıp o günün saatini ekleyin/düzenleyin."
                  />
                  <button
                    type="button"
                    onClick={() => setShowShiftHistory(true)}
                    style={{ fontSize: 11.5, padding: "2px 8px", marginLeft: "auto" }}
                  >
                    Geçmiş
                  </button>
                </label>
                <StaffShiftGrid
                  people={staffPeople}
                  staffShifts={staffShifts}
                  onAdd={onAddStaffShift}
                  onDelete={onDeleteStaffShift}
                  onSetOff={onSetStaffShiftDayOff}
                />
              </div>
              {showShiftHistory && (
                <StaffShiftHistoryModal
                  people={staffPeople}
                  staffShifts={staffShifts}
                  onClose={() => setShowShiftHistory(false)}
                />
              )}
              <TeamDailyLoadPanel
                members={members}
                staffShifts={staffShifts}
                deals={deals}
                customers={customers}
                customFieldDefs={customFieldDefs}
                sessionUserId={session.user.id}
              />
            </>
          ) : teamTab === "izinler" ? (
            <div style={{ marginBottom: 16 }}>
              <label
                style={{
                  fontSize: 13,
                  color: "var(--text-secondary)",
                  display: "block",
                  marginBottom: 6,
                }}
              >
                İzinler{" "}
                <InfoTip
                  placement="bottom"
                  text="Yıllık izin hakkını kişi başına elle belirleyin - kullanılan izinler bu bakiyeden düşülür, sürekli/manuel takip edilir (otomatik yıl başı sıfırlaması yok). Ücretsiz/raporlu/mazeret izinleri de kaydedilir ama bakiyeyi etkilemez."
                />
              </label>
              <StaffLeaveManager
                people={staffPeople}
                balances={staffLeaveBalances}
                records={staffLeaveRecords}
                onSetBalance={onSetStaffLeaveBalance}
                onAddRecord={onAddStaffLeaveRecord}
                onDeleteRecord={onDeleteStaffLeaveRecord}
              />
            </div>
          ) : teamTab === "hizmetler" ? (
            <ServiceCapabilityPanel
              people={staffPeople}
              priceListItems={priceListItems}
              onSetServiceStaff={onSetServiceStaff}
            />
          ) : (
            <>
              <div style={{ marginBottom: 16 }}>
                <label
                  style={{
                    fontSize: 13,
                    color: "var(--text-secondary)",
                    display: "block",
                    marginBottom: 6,
                  }}
                >
                  Üyeler{" "}
                  <span style={{ color: "var(--text-muted)", fontWeight: 400 }}>
                    ({occupiedSeats}/{MAX_TEAM_SIZE})
                  </span>
                </label>
                {members.length === 0 ? (
                  <p style={{ fontSize: 13, color: "var(--text-muted)" }}>Henüz takım üyesi yok.</p>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {members.map((m) => (
                      <div
                        key={m.member_id}
                        style={{
                          background: "var(--surface-1)",
                          border: "0.5px solid var(--border)",
                          borderRadius: "var(--radius)",
                          padding: "8px 12px",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            gap: 8,
                          }}
                        >
                          <span style={{ fontSize: 13, fontWeight: 500 }}>{m.name || m.email}</span>
                          <IconButton
                            icon="ti-trash"
                            title="Kaldır"
                            size="sm"
                            onClick={() => setConfirmRemoveMember(m)}
                          />
                        </div>
                        <label
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 6,
                            fontSize: 12,
                            color: "var(--text-secondary)",
                            marginTop: 4,
                            cursor: "pointer",
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={!!m.can_edit_settings}
                            onChange={(e) => toggleEditSettings(m.member_id, e.target.checked)}
                          />
                          İşletme/sektör ayarlarını düzenleyebilir
                        </label>
                        <div
                          style={{
                            display: "flex",
                            gap: 12,
                            alignItems: "center",
                            marginTop: 6,
                            flexWrap: "wrap",
                          }}
                        >
                          <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                            <label style={{ fontSize: 11, color: "var(--text-muted)" }}>
                              Prim %
                            </label>
                            <input
                              type="number"
                              min="0"
                              max="100"
                              step="0.1"
                              defaultValue={m.commission_percent ?? ""}
                              onBlur={(e) =>
                                updateCommission(m.member_id, {
                                  commission_percent:
                                    e.target.value === "" ? null : Number(e.target.value),
                                  chair_rental_fee: m.chair_rental_fee ?? null,
                                })
                              }
                              placeholder="-"
                              style={{ width: 60, fontSize: 12, padding: "2px 6px" }}
                            />
                          </span>
                          <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                            <label style={{ fontSize: 11, color: "var(--text-muted)" }}>
                              Koltuk kirası (aylık, TL)
                            </label>
                            <input
                              type="number"
                              min="0"
                              step="1"
                              defaultValue={m.chair_rental_fee ?? ""}
                              onBlur={(e) =>
                                updateCommission(m.member_id, {
                                  commission_percent: m.commission_percent ?? null,
                                  chair_rental_fee:
                                    e.target.value === "" ? null : Number(e.target.value),
                                })
                              }
                              placeholder="-"
                              style={{ width: 80, fontSize: 12, padding: "2px 6px" }}
                            />
                          </span>
                          <InfoTip
                            placement="bottom"
                            align="right"
                            text="Prim/koltuk kirası girerseniz Pano'daki Personel Performansı kartında bu üyenin net hakedişi otomatik hesaplanır. İkisi de opsiyonel."
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              {confirmRemoveMember && (
                <ConfirmDialog
                  title="Üye kaldırılsın mı?"
                  message={`${confirmRemoveMember.name || confirmRemoveMember.email}, bu takımın müşteri/teklif/destek verilerine erişimini kaybeder.`}
                  confirmLabel="Kaldır"
                  onConfirm={() => {
                    const id = confirmRemoveMember.member_id;
                    setConfirmRemoveMember(null);
                    removeMember(id);
                  }}
                  onClose={() => setConfirmRemoveMember(null)}
                />
              )}
              {invites.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <label
                    style={{
                      fontSize: 13,
                      color: "var(--text-secondary)",
                      display: "block",
                      marginBottom: 6,
                    }}
                  >
                    Bekleyen davetler
                  </label>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {invites.map((inv) => (
                      <div
                        key={inv.id}
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
                        <span style={{ fontSize: 13, fontWeight: 500 }}>{inv.email}</span>
                        <div
                          style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}
                        >
                          <Badge tone="warning">Bekliyor</Badge>
                          <IconButton
                            icon="ti-x"
                            title="İptal et"
                            size="sm"
                            onClick={() => cancelInvite(inv.id)}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {atTeamLimit ? (
                <div
                  style={{
                    background: "var(--bg-warning)",
                    border: "0.5px solid var(--border)",
                    borderRadius: "var(--radius)",
                    padding: "10px 12px",
                  }}
                >
                  <p style={{ fontSize: 13, margin: 0, color: "var(--text-primary)" }}>
                    {MAX_TEAM_SIZE} kullanıcı sınırına ulaştınız (işletme sahibi + üyeler + bekleyen
                    davetler). Daha fazla kullanıcı için{" "}
                    <a href="mailto:info@binerly.com?subject=Ek%20kullan%C4%B1c%C4%B1%20talebi">
                      info@binerly.com
                    </a>{" "}
                    adresinden bize ulaşın.
                  </p>
                </div>
              ) : (
                <form onSubmit={sendInvite}>
                  <label
                    style={{
                      fontSize: 13,
                      color: "var(--text-secondary)",
                      display: "block",
                      marginBottom: 4,
                    }}
                  >
                    E-posta ile davet et
                  </label>
                  <div style={{ display: "flex", gap: 8 }}>
                    <input
                      type="email"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      placeholder="ornek@sirket.com"
                      required
                      style={{ flex: 1 }}
                    />
                    <button
                      type="submit"
                      disabled={sending}
                      style={{
                        background: "var(--fill-accent)",
                        color: "var(--on-accent)",
                        border: "none",
                      }}
                    >
                      {sending ? "Gönderiliyor…" : "Davet et"}
                    </button>
                  </div>
                </form>
              )}
            </>
          )}
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
            <button onClick={onClose}>Kapat</button>
          </div>
        </>
      )}
    </Modal>
  );
}
