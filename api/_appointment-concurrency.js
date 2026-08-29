// Hizmet bazli personel yetkinliginin widget/portal musaitlik hesabina yansimasi.
// Musteri personel SECMIYOR - ama sectigi hizmeti yapabilen personel sayisi,
// o saatteki etkin kapasiteyi belirler. Ornek: 3 personelli salonda manikuru
// sadece 2 kisi yapiyorsa, o 2 kisi o saatte doluyken 3. musteriye manikur
// slotu gosterilmez.
//
// MODEL (KOBI-dostu, "ters model"): bir personel fiyat listesinde hic hizmete
// isaretli DEGILSE tum hizmetleri yapar; en az bir hizmete isaretliyse SADECE
// isaretli hizmetleri yapar. price_list_items.staff_member_ids = "bu hizmeti
// yapabilen KISITLI personel" listesi. Bir hizmet ancak onu yapamayan (kisitli
// ve o listede olmayan) bir personel varsa "kisit"tir.
//
// Bu, src/Deals.jsx findAppointmentConflict'in SUNUCU esdegeri - CLAUDE.md'de
// isaretlendigi gibi noktalarin hepsi AYNI mantik, senkron tutulmali
// (findAppointmentConflict, appointmentSlotHasConflict, appointment-availability.js,
// lead-capture.js, deal-approval.js handleSendAppointmentOffer). concurrency_slots
// atomik havuzu per-hizmet DEGIL - bu kontrol kaynak on-kontroluyle ayni guven
// seviyesinde (istemci/sunucu on-kontrol).
//
// _ ile basladigi icin Vercel fonksiyon sayilmaz (paylasilan yardimci).

// Bir randevunun (deal.custom_fields) bagli oldugu fiyat listesi kalemleri.
// price_item_id (CRM tekli secici) + service_ids (widget/portal). deal_line_items
// sunucuda kolay erisilmedigi icin dahil edilmez - bilinmeyen hizmet temkinli
// tarafta (her havuzla rekabet eder) sayilir.
export function dealServiceIds(customFields) {
  const ids = [];
  if (customFields?.price_item_id) ids.push(customFields.price_item_id);
  if (Array.isArray(customFields?.service_ids)) ids.push(...customFields.service_ids);
  return [...new Set(ids.filter(Boolean))];
}

// Tum fiyat listesinden "kisitli" personel kumesi: herhangi bir hizmetin
// staff_member_ids dizisinde gecen (ve hala takimda olan) her personel kisitlidir
// = SADECE gectigi hizmetleri yapar.
export function restrictedStaffSet(priceItems, validStaff) {
  const s = new Set();
  for (const p of priceItems || []) {
    for (const id of p.staff_member_ids || []) if (validStaff.has(id)) s.add(id);
  }
  return s;
}

// Bir hizmeti yapabilen gecerli personel kumesi. Herkes yapabiliyorsa (kisit yok)
// null doner. restricted = restrictedStaffSet ciktisi.
export function capableStaffForService(item, restricted, validStaff) {
  const allowed = new Set(item?.staff_member_ids || []);
  const capable = new Set();
  for (const id of validStaff) {
    if (!restricted.has(id) || allowed.has(id)) capable.add(id);
  }
  return capable.size === validStaff.size ? null : capable;
}

// Istenen hizmet(ler)i yapabilen personel havuzu + etkin kapasite.
// - requestedServiceIds: musterinin sectigi price_list_items id listesi
// - priceItems: [{ id, staff_member_ids }] - bu isletmenin TUM fiyat listesi
// - validStaff: Set<uuid> - isletme sahibi + team_members (silinmis uye id'leri elenir)
// - baseConcurrency: company_settings.appointment_concurrency (>=1)
// Donus: { capablePool: Set<uuid>|null, effectiveConcurrency: number }
//   capablePool null => kisit yok (herkes), davranis degismez.
export function resolveServiceCapacity(requestedServiceIds, priceItems, validStaff, baseConcurrency) {
  const byId = new Map((priceItems || []).map((p) => [p.id, p]));
  const restricted = restrictedStaffSet(priceItems, validStaff);
  let pool = null;
  for (const sid of requestedServiceIds || []) {
    const cap = capableStaffForService(byId.get(sid), restricted, validStaff);
    if (cap === null) continue; // bu hizmeti herkes yapabiliyor - kisit degil
    pool = pool === null ? cap : new Set([...pool].filter((id) => cap.has(id)));
  }
  if (pool === null) return { capablePool: null, effectiveConcurrency: baseConcurrency };
  return {
    capablePool: pool,
    effectiveConcurrency: Math.max(1, Math.min(baseConcurrency, pool.size)),
  };
}

// Var olan bir randevu, istenen hizmetin personel havuzuyla kapasite acisindan
// rekabet ediyor mu? Havuzu kesisiyorsa VEYA hizmeti bilinmiyorsa/kisitsizsa evet.
// capablePool null ise (istenen hizmet kisitsiz) her randevu genel tavana sayilir.
export function dealCompetesForPool(customFields, capablePool, priceItems, validStaff) {
  if (!capablePool) return true;
  const byId = new Map((priceItems || []).map((p) => [p.id, p]));
  const restricted = restrictedStaffSet(priceItems, validStaff);
  const sids = dealServiceIds(customFields);
  let otherPool = null;
  for (const sid of sids) {
    const cap = capableStaffForService(byId.get(sid), restricted, validStaff);
    if (cap === null) return true; // rakip randevunun hizmeti kisitsiz
    otherPool = otherPool === null ? cap : new Set([...otherPool, ...cap]);
  }
  if (otherPool === null) return true; // hic hizmet bilgisi yok - temkinli
  for (const id of otherPool) if (capablePool.has(id)) return true;
  return false;
}

// Yardimci: isletme sahibi + team_members'tan gecerli personel id kumesi.
export async function fetchValidStaff(supabaseAdmin, businessUserId) {
  const { data: members } = await supabaseAdmin
    .from("team_members")
    .select("member_id")
    .eq("team_id", businessUserId);
  return new Set([businessUserId, ...(members || []).map((m) => m.member_id)]);
}

// Cagri noktalari icin tek adimli yardimci: istenen hizmet(ler)in yetkin
// personel kisiti varsa etkin kapasiteyi dusurur ve "bu doluluk bizim havuzla
// rekabet ediyor mu" testini dondurur. serviceIds hem dizi hem virgullu string
// olabilir. Kisit yoksa davranis tamamen degismez (effectiveConcurrency = base,
// competes hep true).
export async function applyServiceCapacity(supabaseAdmin, businessUserId, serviceIds, baseConcurrency) {
  const ids = Array.isArray(serviceIds)
    ? serviceIds.filter(Boolean)
    : (serviceIds || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (ids.length === 0) {
    return { effectiveConcurrency: baseConcurrency, competes: () => true };
  }
  const [{ data: priceItems }, validStaff] = await Promise.all([
    supabaseAdmin.from("price_list_items").select("id, staff_member_ids").eq("user_id", businessUserId),
    fetchValidStaff(supabaseAdmin, businessUserId),
  ]);
  const { capablePool, effectiveConcurrency } = resolveServiceCapacity(
    ids,
    priceItems || [],
    validStaff,
    baseConcurrency,
  );
  return {
    effectiveConcurrency,
    competes: (customFields) => dealCompetesForPool(customFields, capablePool, priceItems || [], validStaff),
  };
}
