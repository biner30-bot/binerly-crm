import { createClient } from "@supabase/supabase-js";
import crypto from "node:crypto";
import { renderEmailHtml, plainTextFallback } from "./_email-template.js";

function secretsMatch(a, b) {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB);
}

// Sectors.jsx'teki isAppointmentSector ile aynı liste — api/*.js JSX içeren
// Sectors.jsx'i import edemediği için (bkz. deal-approval.js) burada da
// küçük bir kopyası tutuluyor.
const APPOINTMENT_SECTORS = new Set(["guzellik_bakim", "saglik_klinik"]);

// GitHub Actions'tan (bkz. .github/workflows/appointment-reminders.yml) her 15
// dakikada bir tetiklenir — Vercel'in ücretsiz planındaki "cron günde 1 kez"
// kısıtını aşmak için ayrı bir zamanlayıcı kullanıyoruz, ekstra ücret gerekmiyor.
export default async function handler(req, res) {
  const authHeader = req.headers.authorization || "";
  if (!process.env.CRON_SECRET || !secretsMatch(authHeader, `Bearer ${process.env.CRON_SECRET}`)) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const resendApiKey = process.env.RESEND_API_KEY;
  if (!resendApiKey) {
    return res.status(500).json({ error: "Sunucu e-posta anahtarı ayarlanmamış." });
  }

  const supabaseAdmin = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  // "Sadece talep al" modunda (bkz. AppointmentPolicies.jsx
  // AppointmentRequestModeBox) KOBİ'nin gönderdiği ama müşterinin ne
  // onaylamadığı ne reddetmediği teklifler - süresi dolunca kendiliğinden
  // "expired"e döner, Pano'daki "Randevu Talepleri" widget'ı bunu görüp
  // KOBİ'ye "başka bir saat önerin" gösterir. Müşteri hiç tıklamazsa
  // (api/deal-approval.js handleConfirmAppointmentOffer'daki expired kontrolü
  // SADECE linke tıklanınca çalışır) bu geçiş olmadan deal sonsuza kadar
  // "teklif gönderildi" görünürdü. Aşağıdaki asıl hatırlatma mantığından
  // BAĞIMSIZ, kendi try/catch'i içinde - biri başarısız olursa diğerini engellemesin.
  try {
    const { error: expireOffersError } = await supabaseAdmin
      .from("deals")
      .update({ appointment_offer_status: "expired" })
      .eq("appointment_offer_status", "sent")
      .lt("appointment_offer_expires_at", new Date().toISOString())
      .is("deleted_at", null);
    if (expireOffersError) console.error("appointment offer auto-expire error:", expireOffersError.message);
  } catch (expireErr) {
    console.error("appointment offer auto-expire fatal error:", expireErr.message);
  }

  try {
    // "Tarih & Saat" (datetime) tipindeki aktif özel alanlar — hangi şirketin
    // hangi alan adını (örn. randevu_tarihi) randevu saati olarak kullandığını
    // burada buluyoruz, sektöre göre sabit kodlamıyoruz.
    const { data: defs, error: defsError } = await supabaseAdmin
      .from("custom_field_defs")
      .select("user_id, key")
      .eq("entity", "deal")
      .eq("field_type", "datetime")
      .eq("active", true);

    if (defsError) return res.status(500).json({ error: defsError.message });
    if (!defs || defs.length === 0) return res.status(200).json({ remindersSent: 0 });

    const now = Date.now();
    // GitHub Actions'ın "*/15 * * * *" zamanlaması güvenilir değil — gerçek
    // çalışma aralığı 15dk yerine saatlerce sürebiliyor (2026-08-07'de doğrulandı:
    // 15 run arasında ortalama ~1.5-3sa boşluk). Eskiden dar bir "110-130dk
    // öncesi" penceresine bakılıyordu — cron bu dar pencereyi atladığında ilgili
    // randevu için hatırlatma SESSİZCE VE KALICI OLARAK hiç gönderilmiyordu (randevu
    // saati geçince pencere bir daha hiç tutmuyordu). Şimdi "randevu hâlâ gelecekte
    // VE 130dk içinde" bakılıyor — cron ne zaman çalışırsa çalışsın, randevu
    // gerçekleşene kadar her çalışmada tekrar denenir, en az bir kez yakalanır.
    const nearWindowEnd = now + 130 * 60 * 1000; // ~2sa10dk sonrasına kadar
    // 24 saat öncesi hatırlatma - AYNI güvenilirlik mantığıyla ~4sa'lık geniş bir
    // pencere (22-26sa sonrası) kullanılıyor, dar bir "tam 24sa" anı değil - cron
    // ~1.5-3sa aralıklarla çalıştığı için dar bir pencere kolayca atlanabilirdi.
    const farWindowStart = now + 22 * 60 * 60 * 1000;
    const farWindowEnd = now + 26 * 60 * 60 * 1000;

    const userIds = [...new Set(defs.map((d) => d.user_id))];
    const [{ data: deals, error: dealsError }, { data: settingsRows }] = await Promise.all([
      supabaseAdmin
        .from("deals")
        .select(
          "id, user_id, customer_id, title, custom_fields, stage, approval_token, appointment_reminder_sent_at, appointment_reminder_24h_sent_at",
        )
        .in("user_id", userIds)
        .is("deleted_at", null)
        .not("stage", "in", "(kazanildi,kaybedildi)")
        .or("appointment_reminder_sent_at.is.null,appointment_reminder_24h_sent_at.is.null"),
      supabaseAdmin.from("company_settings").select("user_id, company_name, logo_url, email, sector, appointment_reminders_enabled, appointment_prep_note").in("user_id", userIds),
    ]);

    if (dealsError) return res.status(500).json({ error: dealsError.message });
    if (!deals || deals.length === 0) return res.status(200).json({ remindersSent: 0 });

    const settingsByUser = Object.fromEntries((settingsRows || []).map((s) => [s.user_id, s]));
    const keysByUser = {};
    for (const d of defs) (keysByUser[d.user_id] ||= []).push(d.key);

    // Bir deal için o an hangi hatırlatma (varsa) sırası geldiğini bulur - "near"
    // (~2sa öncesi, mevcut davranış, Hatırlatma gönderildi aşamasına taşır) ve
    // "24h" (yeni, sadece bilgilendirme) pencereleri asla çakışmaz, bu yüzden bir
    // deal aynı anda en fazla birine düşer.
    const dueDeals = [];
    for (const deal of deals) {
      if (settingsByUser[deal.user_id]?.appointment_reminders_enabled === false) continue;
      const keys = keysByUser[deal.user_id] || [];
      const raw = keys.map((key) => deal.custom_fields?.[key]).find(Boolean);
      if (!raw) continue;
      // datetime-local değeri saat dilimi bilgisi taşımaz (örn. "2026-07-11T15:00")
      // — bu proje sadece Türkiye için, bu yüzden +03:00 olarak yorumluyoruz.
      // Bu adımı atlamak, sunucunun UTC saatiyle karşılaştırıp saatleri kaydırırdı.
      const apptTime = new Date(`${raw}:00+03:00`).getTime();
      if (isNaN(apptTime) || apptTime <= now) continue;
      if (!deal.appointment_reminder_sent_at && apptTime <= nearWindowEnd) {
        dueDeals.push({ deal, raw, type: "near" });
      } else if (!deal.appointment_reminder_24h_sent_at && apptTime >= farWindowStart && apptTime <= farWindowEnd) {
        dueDeals.push({ deal, raw, type: "24h" });
      }
    }

    if (dueDeals.length === 0) return res.status(200).json({ remindersSent: 0 });

    const customerIds = [...new Set(dueDeals.map((d) => d.deal.customer_id))];
    const { data: customers } = await supabaseAdmin.from("customers").select("id, name, email").in("id", customerIds);
    const customerById = Object.fromEntries((customers || []).map((c) => [c.id, c]));

    let remindersSent = 0;

    // Her deal'i kendi try/catch'i içinde, gönderim BAŞARILI olur olmaz ANINDA
    // appointment_reminder_sent_at yazarak işliyoruz — önceden bu tek bir toplu
    // update ile döngü SONUNDA yapılıyordu, bu yüzden döngü ortasında bir
    // deal'de beklenmeyen bir hata (örn. fetch reddi) atarsa daha önce başarıyla
    // gönderilmiş hatırlatmalar hiç işaretlenmiyor, cron 15dk sonra tekrar
    // çalışınca aynı müşterilere mükerrer hatırlatma mailleri gidiyordu.
    for (const { deal, raw, type } of dueDeals) {
      // "near" (~2sa öncesi) ve "24h" kendi bağımsız damgasını yazar - bir deal
      // hayatı boyunca ikisini de (sırayla, farklı cron çalışmalarında) alabilir.
      const sentAtColumn = type === "24h" ? "appointment_reminder_24h_sent_at" : "appointment_reminder_sent_at";
      try {
        const customer = customerById[deal.customer_id];
        if (!customer?.email) {
          await supabaseAdmin.from("deals").update({ [sentAtColumn]: new Date().toISOString() }).eq("id", deal.id);
          continue;
        }

        const timeLabel = raw.split("T")[1];
        const settings = settingsByUser[deal.user_id] || {};
        const company = settings.company_name || "Binerly";

        // Hatırlatma mailinden de tek tıkla onaylanabilsin diye onay linki —
        // deal-approval.js'deki üretim mantığıyla aynı, token yoksa burada üretilir.
        let token = deal.approval_token;
        if (!token) {
          token = crypto.randomUUID();
          await supabaseAdmin.from("deals").update({ approval_token: token }).eq("id", deal.id);
        }
        const ctaUrl = `https://binerly.com/onay/${token}`;

        // Randevu sektörlerinde (Güzellik & Bakım, Sağlık/Klinik) hatırlatma
        // maili girişsiz, tek tıkla Evet/Hayır onayına da izin veriyor —
        // portal girişi gerektiren /onay/{token} akışından AYRI, deal-approval.js
        // içindeki action=confirm-attendance dalı (Vercel Hobby planının 12
        // fonksiyon sınırı nedeniyle ayrı bir dosya değil, buraya taşındı).
        // Diğer sektörlerde (Emlak/Otel/Dijital Ajans/Hizmet-Danışmanlık'taki
        // "görüşme/check-in tarihi" hatırlatmaları) bu buton hiç eklenmiyor —
        // oralarda "randevu" bir teklif/rezervasyon aşamasıdır, iptal/ceza
        // politikası anlamsız olurdu.
        const isAppointmentSector = APPOINTMENT_SECTORS.has(settings.sector);
        const yesUrl = isAppointmentSector ? `https://binerly.com/api/deal-approval?action=confirm-attendance&token=${token}&response=yes` : null;
        const noUrl = isAppointmentSector ? `https://binerly.com/api/deal-approval?action=confirm-attendance&token=${token}&response=no` : null;

        // İşletmenin kendi yazdığı, opsiyonel hazırlık notu ("aç karnına gelin" gibi) -
        // varsa gövde metninin sonuna eklenir, yoksa metin hiç değişmez.
        const prepNote = (settings.appointment_prep_note || "").trim();
        const dayWord = type === "24h" ? "yarın" : "bugün";
        const bodyText = (isAppointmentSector
          ? `Merhaba ${customer.name || ""},\n\n${company} bünyesindeki "${deal.title}" randevunuz ` +
            `${dayWord} saat ${timeLabel}'de. Geleceğinizi onaylar mısınız?`
          : `Merhaba ${customer.name || ""},\n\n${company} bünyesindeki "${deal.title}" randevunuz ` +
            `${dayWord} saat ${timeLabel}'de. Sizi görmekten mutluluk duyarız.`) + (prepNote ? `\n\n${prepNote}` : "");
        const footerLines = [`${company} (Binerly ile)`, "Bu e-posta Binerly (binerly.com) altyapısıyla gönderildi."];
        const html = isAppointmentSector
          ? renderEmailHtml({ logoUrl: settings.logo_url, bodyText, ctaLabel: "✓ Evet, geliyorum", ctaUrl: yesUrl, secondaryCtaLabel: "Hayır, gelemeyeceğim", secondaryCtaUrl: noUrl, footerLines })
          : renderEmailHtml({ logoUrl: settings.logo_url, bodyText, ctaLabel: "Randevuyu Görüntüle", ctaUrl, footerLines });
        const text = isAppointmentSector
          ? plainTextFallback(bodyText, "✓ Evet, geliyorum", yesUrl, footerLines, "Hayır, gelemeyeceğim", noUrl)
          : plainTextFallback(bodyText, "Randevuyu Görüntüle", ctaUrl, footerLines);

        const sendRes = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${resendApiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            from: `${company} (Binerly ile) <noreply@binerly.com>`,
            to: customer.email,
            subject: type === "24h" ? `Yarın randevunuz var - saat ${timeLabel}` : `Randevu hatırlatması - bugün saat ${timeLabel}`,
            html,
            text,
            ...(settings.email ? { reply_to: settings.email } : {}),
          }),
        });

        if (sendRes.ok) {
          remindersSent++;
          const dealUpdate = { [sentAtColumn]: new Date().toISOString() };
          // Güzellik & Bakım'da "Müzakere" aşaması "Hatırlatma gönderildi" anlamına
          // geliyor (bkz. Sectors.jsx) - bu SADECE gün-içi (near) hatırlatmayla
          // tetiklenir, 24 saat öncesi olan sadece bir bilgilendirme, aşama
          // taşımıyor. Diğer sektörlerde "Müzakere" farklı bir şey ifade ettiği
          // için (örn. gerçek bir pazarlık aşaması) bu otomatik taşıma yapılmıyor.
          if (type === "near" && settings.sector === "guzellik_bakim" && deal.stage !== "muzakere") dealUpdate.stage = "muzakere";
          await supabaseAdmin.from("deals").update(dealUpdate).eq("id", deal.id);
        } else {
          console.error("appointment reminder send failed, deal.id:", deal.id, type, sendRes.status, await sendRes.text().catch(() => ""));
          // sentAtColumn bilinçli olarak YAZILMIYOR - bir sonraki cron
          // çalışmasında (aynı pencere içindeyse) tekrar denensin.
        }
      } catch (dealErr) {
        console.error("appointment reminder error, deal.id:", deal.id, dealErr.message);
      }
    }

    return res.status(200).json({ remindersSent });
  } catch (err) {
    console.error("send-appointment-reminders fatal error:", err.message);
    return res.status(500).json({ error: "Gönderim sırasında hata oluştu." });
  }
}
