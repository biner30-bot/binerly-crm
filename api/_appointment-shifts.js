// Vardiya bazli randevu musaitligi (company_settings.appointment_availability_source
// = 'shifts'). Musteri personel SECMIYOR - ama randevu slotlari sadece en az bir
// personelin vardiyada oldugu saatlerde acilir ve o saatteki kapasite = o an
// vardiyada olan (+ hizmeti yapabilen + o gun izinli olmayan) personel sayisi
// (appointment_concurrency ust tavan olarak kalir). O haftagunu hic vardiya
// girilmemisse cagiran taraf business_hours'a duser (src/Team.jsx
// effectiveStaffWindows'taki mevcut "personel yoksa musaitlik saatleri" kurali).
//
// src/Team.jsx staffShiftsEffectiveOnDate + src/Deals.jsx effectiveStaffWindows /
// fitsWithinWindows mantiginin sunucu portu - CLAUDE.md: bu noktalarin hepsi AYNI
// mantik, senkron tutulmali. _ prefix = Vercel fonksiyon sayilmaz (paylasilan yardimci).
//
// Atomik concurrency_slots havuzu per-saat DEGIL (tepe personel sayisinda kalir) -
// bu kontrol kaynak/hizmet-yetkinligi on-kontroluyle AYNI guven seviyesinde
// (istemci/sunucu pre-check).

// "HH:MM[:SS]" -> gun-ici dakika.
function timeToMinutes(t) {
  const [hh, mm] = String(t).slice(0, 5).split(":").map(Number);
  return hh * 60 + mm;
}

export function minutesToTime(min) {
  return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
}

// dateStr "YYYY-MM-DD" -> ISO haftanin gunu (1=Pzt..7=Paz), saat dilimsiz
// (appointment-availability.js'teki AYNI Date.UTC deseni).
function isoWeekdayOf(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const js = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return js === 0 ? 7 : js;
}

// Belirli bir tarihte izinli olan personel id kumesi - her tur izin (yillik,
// raporlu, ucretsiz, mazeret, diger) o gun calismiyor demek.
function membersOnLeave(leaveRows, dateStr) {
  const s = new Set();
  for (const r of leaveRows || []) {
    if (r.start_date <= dateStr && dateStr <= r.end_date) s.add(r.member_id);
  }
  return s;
}

// Bir vardiya satiri o tarihte gecerli mi (temporal versioning + weekday).
function shiftRowActiveOn(s, dateStr, weekday, validStaff) {
  if (s.weekday !== weekday) return false;
  if (s.valid_from && s.valid_from > dateStr) return false;
  if (s.valid_to && s.valid_to <= dateStr) return false;
  if (validStaff && !validStaff.has(s.member_id)) return false;
  return true;
}

// Belirli bir tarih icin personel -> calistigi saat pencereleri (dakika).
// Mola zaten ayri vardiya satiri oldugu icin dogal bir bosluk olusturur.
// is_off (haftalik tatil) veya o gun izinli olan personel HIC donmez.
// validStaff verilirse (Set) takimdan cikmis uyenin eski satiri elenir.
export function staffWindowsOnDate(shiftRows, leaveRows, dateStr, validStaff = null) {
  const weekday = isoWeekdayOf(dateStr);
  const onLeave = membersOnLeave(leaveRows, dateStr);

  const rowsByMember = new Map();
  for (const s of shiftRows || []) {
    if (!shiftRowActiveOn(s, dateStr, weekday, validStaff)) continue;
    if (!rowsByMember.has(s.member_id)) rowsByMember.set(s.member_id, []);
    rowsByMember.get(s.member_id).push(s);
  }

  const byMember = new Map();
  for (const [memberId, rows] of rowsByMember) {
    if (onLeave.has(memberId)) continue;
    if (rows.some((r) => r.is_off)) continue;
    const windows = rows
      .filter((r) => r.start_time != null && r.end_time != null)
      .map((r) => ({ start: timeToMinutes(r.start_time), end: timeToMinutes(r.end_time) }))
      .sort((a, b) => a.start - b.start);
    if (windows.length > 0) byMember.set(memberId, windows);
  }
  return byMember;
}

// Personel pencereleri haritasindan gunun musteriye acik (birlesik) penceresi.
export function unionWindows(windowsByMember) {
  const all = [];
  for (const windows of windowsByMember.values()) all.push(...windows);
  if (all.length === 0) return [];
  all.sort((a, b) => a.start - b.start);
  const merged = [{ ...all[0] }];
  for (let i = 1; i < all.length; i++) {
    const last = merged[merged.length - 1];
    if (all[i].start <= last.end) last.end = Math.max(last.end, all[i].end);
    else merged.push({ ...all[i] });
  }
  return merged;
}

// [start,end] araligini TAM kapsayan personel sayisi. capablePool (Set|null)
// verilirse sadece o havuzdaki personel sayilir (hizmet bazli yetkinlik).
export function staffCountCovering(windowsByMember, start, end, capablePool = null) {
  let count = 0;
  for (const [memberId, windows] of windowsByMember) {
    if (capablePool && !capablePool.has(memberId)) continue;
    if (windows.some((w) => start >= w.start && end <= w.end)) count++;
  }
  return count;
}

// O haftagunu icin (temporal olarak gecerli) HERHANGI bir vardiya satiri var mi -
// yoksa cagiran taraf o gun business_hours'a duser.
export function weekdayHasAnyShift(shiftRows, dateStr, validStaff = null) {
  const weekday = isoWeekdayOf(dateStr);
  return (shiftRows || []).some((s) => shiftRowActiveOn(s, dateStr, weekday, validStaff));
}

// unionWindows ciktisini computeDaySlots'un bekledigi business_hours sekline
// cevirir. stepMinutes: hizmet suresi bilinmiyorsa kullanilacak izgara adimi
// (o haftagunune ait business_hours.slot_duration_minutes ya da varsayilan).
export function toSlotWindows(unionWins, stepMinutes) {
  return (unionWins || []).map((w) => ({
    start_time: minutesToTime(w.start),
    end_time: minutesToTime(w.end),
    slot_duration_minutes: stepMinutes || 30,
  }));
}

// Bir isletmenin tum vardiya + izin satirlari (service_role). staff_shifts
// service_role SELECT'e zaten sahip (sql/2026-07-28_staff_shifts.sql);
// staff_leave_records'a sql/2026-08-29_appointment_availability_source.sql ile eklendi.
export async function fetchShiftData(supabaseAdmin, businessUserId) {
  const [{ data: shiftRows }, { data: leaveRows }] = await Promise.all([
    supabaseAdmin
      .from("staff_shifts")
      .select("member_id, weekday, start_time, end_time, is_off, valid_from, valid_to")
      .eq("user_id", businessUserId),
    supabaseAdmin
      .from("staff_leave_records")
      .select("member_id, start_date, end_date")
      .eq("user_id", businessUserId),
  ]);
  return { shiftRows: shiftRows || [], leaveRows: leaveRows || [] };
}

// Cagri noktalari icin tek adimli yardimci. availabilitySource !== 'shifts' ise
// null doner (cagiran taraf mevcut business_hours yolunu aynen kullanir).
// Aksi halde .forDate(dateStr, validStaff, capablePool, fallbackStep) ile o gune
// ozel bilgi doner - o gun icin hic vardiya yoksa yine null (o gun business_hours'a duser).
export async function buildShiftAvailability(supabaseAdmin, businessUserId, availabilitySource) {
  if (availabilitySource !== "shifts") return null;
  const { shiftRows, leaveRows } = await fetchShiftData(supabaseAdmin, businessUserId);
  return {
    forDate(dateStr, validStaff = null, capablePool = null, fallbackStep = 30) {
      if (!weekdayHasAnyShift(shiftRows, dateStr, validStaff)) return null;
      const map = staffWindowsOnDate(shiftRows, leaveRows, dateStr, validStaff);
      const union = unionWindows(map);
      return {
        // computeDaySlots'a windows parametresi olarak verilir
        slotWindows: toSlotWindows(union, fallbackStep),
        // o haftagunu vardiya var ama o TARIH herkes izinli/tatil -> "Dolu" degil "Kapali"
        closed: union.length === 0,
        // computeDaySlots'a capacityFn olarak verilir
        capacityAt: (start, end) => staffCountCovering(map, start, end, capablePool),
        // en gec vardiya bitisi (talep dali kapanis kontrolu)
        latestEnd: union.length ? Math.max(...union.map((w) => w.end)) : null,
        // en erken vardiya baslangici
        earliestStart: union.length ? Math.min(...union.map((w) => w.start)) : null,
      };
    },
  };
}
