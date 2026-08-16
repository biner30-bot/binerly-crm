import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { renderEmailHtml, plainTextFallback } from "./_email-template.js";

function secretsMatch(a, b) {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB);
}

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

  try {
    const today = new Date().toISOString().slice(0, 10);
    const { data: dueDeals, error: dealsError } = await supabaseAdmin
      .from("deals")
      .select("id, user_id, customer_id, title, reminder, reminder_date, notify_customer")
      .is("deleted_at", null)
      .not("stage", "in", "(kazanildi,kaybedildi)")
      .neq("reminder", "")
      .lte("reminder_date", today);

    if (dealsError) {
      return res.status(500).json({ error: dealsError.message });
    }

    const { data: dueTasks, error: tasksError } = await supabaseAdmin
      .from("tasks")
      .select("id, user_id, title, type, due_date, assigned_to, customer_id")
      .is("deleted_at", null)
      .is("completed_at", null)
      .not("due_date", "is", null)
      .lte("due_date", today);

    if (tasksError) {
      return res.status(500).json({ error: tasksError.message });
    }

    // Google değerlendirme isteği: "kazanildi" aşamasına DÜN geçmiş (Europe/Istanbul
    // takvim günü) ve daha önce hiç istek gönderilmemiş kayıtlar. Türkiye 2016'dan beri
    // kalıcı olarak UTC+3'te (DST yok), bu yüzden sabit ofsetle gün sınırını güvenle
    // UTC'ye çevirebiliyoruz (bkz. appointment-availability.js'teki Europe/Istanbul
    // hesaplaması — aynı UTC-yanlışı tuzağına düşmemek için).
    const istanbulParts = Object.fromEntries(
      new Intl.DateTimeFormat("en-CA", {
        timeZone: "Europe/Istanbul",
        year: "numeric", month: "2-digit", day: "2-digit",
      }).formatToParts(new Date()).map((p) => [p.type, p.value])
    );
    const todayIstanbul = `${istanbulParts.year}-${istanbulParts.month}-${istanbulParts.day}`;
    const yesterdayDateObj = new Date(`${todayIstanbul}T00:00:00Z`);
    yesterdayDateObj.setUTCDate(yesterdayDateObj.getUTCDate() - 1);
    const yesterdayIstanbul = yesterdayDateObj.toISOString().slice(0, 10);

    // Spor Merkezi: "Üye oldu" aşamasında duran ama Üyelik Bitiş Tarihi geçmiş
    // kayıtları otomatik "Paket görüşülüyor" aşamasına taşı — send-appointment-
    // reminders.js'deki Güzellik & Bakım'ın "Hatırlatma gönderildi" otomatik
    // geçişiyle aynı desen. Bilinçli olarak SADECE Spor Merkezi: uyelik_bitis_tarihi
    // bu sektöre özel bir alan, Eğitim/Kurs'taki kurs_bitis_tarihi kapsam dışı.
    let membershipsMoved = 0;
    const { data: gymSettings, error: gymSettingsError } = await supabaseAdmin
      .from("company_settings")
      .select("user_id")
      .eq("sector", "spor_merkezi");
    if (gymSettingsError) {
      console.error("gym settings query error:", gymSettingsError.message);
    } else if (gymSettings && gymSettings.length > 0) {
      const { data: expiredMemberships, error: expiredError } = await supabaseAdmin
        .from("deals")
        .select("id")
        .in("user_id", gymSettings.map((s) => s.user_id))
        .eq("stage", "kazanildi")
        .is("deleted_at", null)
        .not("custom_fields->>uyelik_bitis_tarihi", "is", null)
        .lt("custom_fields->>uyelik_bitis_tarihi", todayIstanbul);
      if (expiredError) {
        console.error("membership expiry query error:", expiredError.message);
      } else {
        for (const deal of expiredMemberships || []) {
          const { error: moveError } = await supabaseAdmin
            .from("deals")
            .update({ stage: "muzakere", closed_at: null })
            .eq("id", deal.id);
          if (moveError) console.error("membership stage move error, deal.id:", deal.id, moveError.message);
          else membershipsMoved++;
        }
      }
    }

    const { data: reviewDeals, error: reviewDealsError } = await supabaseAdmin
      .from("deals")
      .select("id, user_id, customer_id, title, approval_token")
      .is("deleted_at", null)
      .eq("stage", "kazanildi")
      .is("review_requested_at", null)
      .gte("closed_at", `${yesterdayIstanbul}T00:00:00+03:00`)
      .lt("closed_at", `${todayIstanbul}T00:00:00+03:00`);
    if (reviewDealsError) {
      console.error("send-reminders review query error:", reviewDealsError.message);
    }

    // Bekleme listesi girdileri de erken-çıkış kontrolüne dahil edilmeli -
    // aksi halde sessiz/bekleyen bir günde (hatırlatma/değerlendirme YOK ama
    // bekleme listesi VAR) fonksiyon aşağıdaki bloğa hiç ulaşmadan erken
    // dönerdi (bkz. sql/2026-08-12_appointment_waitlist.sql).
    const { data: waitlistEntries, error: waitlistQueryError } = await supabaseAdmin
      .from("appointment_waitlist")
      .select("id, user_id, customer_id, requested_date")
      .is("notified_at", null)
      .gte("requested_date", todayIstanbul);
    if (waitlistQueryError) {
      console.error("appointment_waitlist query error:", waitlistQueryError.message);
    }

    const hasReminders = dueDeals && dueDeals.length > 0;
    const hasReviewRequests = reviewDeals && reviewDeals.length > 0;
    const hasWaitlistEntries = waitlistEntries && waitlistEntries.length > 0;
    const hasTasks = dueTasks && dueTasks.length > 0;
    if (!hasReminders && !hasReviewRequests && !hasWaitlistEntries && !hasTasks) {
      return res.status(200).json({ usersNotified: 0, customersNotified: 0, reviewsRequested: 0, membershipsMoved });
    }

    const customerIds = [
      ...new Set([
        ...(dueDeals || []).map((d) => d.customer_id),
        ...(reviewDeals || []).map((d) => d.customer_id),
        ...(dueTasks || []).map((t) => t.customer_id).filter(Boolean),
      ]),
    ];
    const { data: customers } = await supabaseAdmin
      .from("customers")
      .select("id, name, email, marketing_consent")
      .in("id", customerIds);
    const customerById = Object.fromEntries((customers || []).map((c) => [c.id, c]));
    const customerNameById = Object.fromEntries((customers || []).map((c) => [c.id, c.name]));

    // deal.user_id takım desteğiyle birlikte artık "hesap/takım kimliği" anlamına
    // geliyor (bkz. team_members) — bu yüzden gruplama zaten doğal olarak takım
    // başına tek e-posta, sahibe gönderiliyor; ekstra bir değişiklik gerekmiyor.
    const dealsByUser = {};
    for (const deal of dueDeals || []) {
      (dealsByUser[deal.user_id] ||= []).push(deal);
    }
    const reviewDealsByUser = {};
    for (const deal of reviewDeals || []) {
      (reviewDealsByUser[deal.user_id] ||= []).push(deal);
    }

    // Görevler sahibe değil ATANAN kişiye gider (deals hatırlatmasından farklı) -
    // atanmamışsa görevi oluşturan takımın sahibine düşer.
    const tasksByAssignee = {};
    for (const task of dueTasks || []) {
      (tasksByAssignee[task.assigned_to || task.user_id] ||= []).push(task);
    }

    const settingsUserIds = [...new Set([...Object.keys(dealsByUser), ...Object.keys(reviewDealsByUser)])];
    const { data: settingsRows } = await supabaseAdmin
      .from("company_settings")
      .select("user_id, company_name, logo_url, email, google_review_link, google_review_requests_enabled")
      .in("user_id", settingsUserIds);
    const settingsByUser = Object.fromEntries((settingsRows || []).map((s) => [s.user_id, s]));

    let usersNotified = 0;
    let failed = 0;
    let customersNotified = 0;
    let reviewsRequested = 0;

    for (const [userId, userDeals] of Object.entries(dealsByUser)) {
      const { data: userData, error: userError } = await supabaseAdmin.auth.admin.getUserById(userId);
      const email = userData?.user?.email;
      if (userError || !email) {
        failed++;
        continue;
      }

      const lines = userDeals.map(
        (d) => `- ${customerNameById[d.customer_id] || "Bilinmeyen müşteri"}: ${d.title} - ${d.reminder}`
      );
      const ownerBodyText = `Bugün için hatırlatmalarınız:\n\n${lines.join("\n")}\n\nBinerly'ye giriş yaparak fırsatlarınızı görüntüleyebilirsiniz.`;
      const ownerFooterLines = ["Binerly Ekibi"];

      const sendRes = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: "Binerly <noreply@binerly.com>",
          to: email,
          subject: `Bugünkü hatırlatmalarınız (${userDeals.length})`,
          html: renderEmailHtml({ bodyText: ownerBodyText, footerLines: ownerFooterLines }),
          text: plainTextFallback(ownerBodyText, null, null, ownerFooterLines),
        }),
      });

      if (sendRes.ok) usersNotified++;
      else failed++;

      // Müşteriye de gönder işaretliyse (DealForm'daki "Hatırlatma tarihinde
      // müşteriye de e-posta gönder" kutusu) — sadece müşterinin e-postası
      // varsa, ayrı ve dostane bir metinle.
      const settings = settingsByUser[userId] || {};
      const company = settings.company_name || "Binerly";
      for (const deal of userDeals) {
        if (!deal.notify_customer) continue;
        const customer = customerById[deal.customer_id];
        if (!customer?.email) continue;
        const bodyText = `Merhaba ${customer.name || ""},\n\n${company} tarafından hatırlatma: ${deal.reminder}`;
        const footerLines = [`${company} (Binerly ile)`, "Bu e-posta Binerly (binerly.com) altyapısıyla gönderildi."];
        const customerRes = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${resendApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: `${company} (Binerly ile) <noreply@binerly.com>`,
            to: customer.email,
            subject: `Hatırlatma: ${deal.title}`,
            html: renderEmailHtml({ logoUrl: settings.logo_url, bodyText, footerLines }),
            text: plainTextFallback(bodyText, null, null, footerLines),
            ...(settings.email ? { reply_to: settings.email } : {}),
          }),
        });
        if (customerRes.ok) customersNotified++;
      }
    }

    // Görev hatırlatmaları — "gönderildi" damgası YOK, deals.reminder ile tutarlı
    // olarak açık/gecikmiş görev tamamlanana kadar her gün tekrar hatırlatılır.
    const TASK_TYPE_LABELS = { arama: "Arama", toplanti: "Toplantı", eposta: "E-posta", diger: "Diğer" };
    let tasksNotified = 0;
    for (const [assigneeId, userTasks] of Object.entries(tasksByAssignee)) {
      const { data: assigneeData, error: assigneeError } = await supabaseAdmin.auth.admin.getUserById(assigneeId);
      const assigneeEmail = assigneeData?.user?.email;
      if (assigneeError || !assigneeEmail) {
        failed++;
        continue;
      }

      const taskLines = userTasks.map(
        (t) =>
          `- [${TASK_TYPE_LABELS[t.type] || t.type}] ${t.title}${t.customer_id ? ` (${customerNameById[t.customer_id] || "Bilinmeyen müşteri"})` : ""}`
      );
      const taskBodyText = `Bugün için görevleriniz:\n\n${taskLines.join("\n")}\n\nBinerly'ye giriş yaparak görevlerinizi görüntüleyebilirsiniz.`;
      const taskFooterLines = ["Binerly Ekibi"];

      const taskSendRes = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: "Binerly <noreply@binerly.com>",
          to: assigneeEmail,
          subject: `Bugünkü görevleriniz (${userTasks.length})`,
          html: renderEmailHtml({ bodyText: taskBodyText, footerLines: taskFooterLines }),
          text: plainTextFallback(taskBodyText, null, null, taskFooterLines),
        }),
      });
      if (taskSendRes.ok) tasksNotified++;
      else failed++;
    }

    // Google değerlendirme istekleri — ayrı bir döngü, çünkü hatırlatması olmayan
    // ama dün tamamlanmış bir kayıt için de tetiklenmesi gerekiyor (yukarıdaki
    // dealsByUser sadece hatırlatmalı kayıtları içeriyor).
    for (const [userId, userDeals] of Object.entries(reviewDealsByUser)) {
      const settings = settingsByUser[userId] || {};
      const reviewLink = settings.google_review_link;
      const reviewEnabled = settings.google_review_requests_enabled !== false;
      const company = settings.company_name || "Binerly";

      for (const deal of userDeals) {
        if (reviewLink && reviewEnabled) {
          const customer = customerById[deal.customer_id];
          // Tam otomatik, insan onayı olmayan bir akış - izin yoksa sessizce
          // atlanır (Kampanya Gönder'deki gibi "İzin iste" seçeneği burada yok,
          // çünkü devrede bir KOBİ beyanı da yok).
          if (customer?.email && customer.marketing_consent) {
            // Müşteri artık DOĞRUDAN Google'a değil, önce kısa bir memnuniyet
            // sorusuna yönlendiriliyor - mutsuz bir müşteriyi hiç sormadan
            // herkese açık Google'a göndermek riskliydi (bkz. sql/2026-08-12_
            // review_satisfaction_gate.sql). confirm-attendance ile AYNI desen:
            // ayrı bir React sayfası/route DEĞİL, deal-approval.js'in ham HTML
            // döndüren action=review dalına doğrudan gidiliyor. Token, aynı
            // dosyanın zaten kullandığı approval_token'ın AYNISI - yoksa burada
            // üretilir (send-appointment-reminders.js'teki AYNI desen).
            let token = deal.approval_token;
            if (!token) {
              token = crypto.randomUUID();
              await supabaseAdmin.from("deals").update({ approval_token: token }).eq("id", deal.id);
            }
            const gateUrl = `https://binerly.com/api/deal-approval?action=review&token=${token}`;
            const bodyText = `Merhaba ${customer.name || ""},\n\n${company} ile yaşadığınız deneyim hakkında görüşünüzü bizimle paylaşır mısınız? Birkaç dakikanız bizim için çok değerli.`;
            const footerLines = [`${company} (Binerly ile)`, "Bu e-posta Binerly (binerly.com) altyapısıyla gönderildi."];
            const reviewRes = await fetch("https://api.resend.com/emails", {
              method: "POST",
              headers: {
                Authorization: `Bearer ${resendApiKey}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                from: `${company} (Binerly ile) <noreply@binerly.com>`,
                to: customer.email,
                subject: `${company} hakkındaki görüşünüz`,
                html: renderEmailHtml({ logoUrl: settings.logo_url, bodyText, ctaLabel: "Deneyimimi Paylaş", ctaUrl: gateUrl, footerLines }),
                text: plainTextFallback(bodyText, "Deneyimimi Paylaş", gateUrl, footerLines),
                ...(settings.email ? { reply_to: settings.email } : {}),
              }),
            });
            if (reviewRes.ok) reviewsRequested++;
          }
        }
        // Gönderilsin ya da gönderilmesin (link yok/kapalı/müşteri e-postası yok),
        // bu deal için tekrar denenmesin diye her durumda damgalanıyor —
        // appointment_reminder_sent_at ile aynı desen.
        await supabaseAdmin.from("deals").update({ review_requested_at: new Date().toISOString() }).eq("id", deal.id);
      }
    }

    // Bekleme listesi bildirimleri (bkz. sql/2026-08-12_appointment_waitlist.sql) —
    // "boşaldı" sinyali App.jsx'teki freedAppointmentAlerts ile AYNI basit tanım
    // (o gün için kaybedildi + lostReason != 'Diğer' bir randevu var mı).
    // appointment-availability.js'teki kaynak/eşzamanlılık-farkında tam slot
    // hesabı BİLİNÇLİ OLARAK burada tekrarlanmadı - personel bildirimi de zaten
    // aynı basit sinyali kullanıyor, tutarlılık tercih edildi. Bu yüzden gerçek
    // saat müsaitliği garanti değildir - müşteri "Randevu Al" linkine tıklayıp
    // normal akıştan devam eder, otomatik rezervasyon yapılmaz.
    let waitlistNotified = 0;
    if (hasWaitlistEntries) {
      const waitlistUserIds = [...new Set(waitlistEntries.map((w) => w.user_id))];
      const [{ data: waitlistSettingsRows }, { data: waitlistFieldDefs }, { data: cancelledDeals }] = await Promise.all([
        supabaseAdmin.from("company_settings").select("user_id, company_name, logo_url, lead_capture_token").in("user_id", waitlistUserIds),
        supabaseAdmin.from("custom_field_defs").select("user_id, key").eq("entity", "deal").eq("field_type", "datetime").eq("active", true).in("user_id", waitlistUserIds),
        // .neq("lost_reason", "Diğer") TEK BAŞINA lost_reason NULL olan satırları
        // dışlardı (Postgres'in üç değerli mantığı, bkz. claimDealPayment yorumu) -
        // App.jsx'teki freedAppointmentAlerts'ın client-side "!==" karşılaştırması
        // NULL'ı zaten dahil ediyor, burada da AYNI davranış gerekiyor.
        supabaseAdmin.from("deals").select("user_id, custom_fields").in("user_id", waitlistUserIds).eq("stage", "kaybedildi").is("deleted_at", null).or("lost_reason.is.null,lost_reason.neq.Diğer"),
      ]);
      const waitlistSettingsByUser = Object.fromEntries((waitlistSettingsRows || []).map((s) => [s.user_id, s]));
      // Randevu tarihi alanının anahtarı işletmeye göre değişir (Güzellik &
      // Bakım/Sağlık-Klinik'te randevu_tarihi vb.) - appointment-availability.js'teki
      // AYNI dinamik bulma ilkesi.
      const dateTimeKeyByUser = Object.fromEntries((waitlistFieldDefs || []).map((d) => [d.user_id, d.key]));
      const freedDatesByUser = {};
      for (const d of cancelledDeals || []) {
        const key = dateTimeKeyByUser[d.user_id];
        const raw = key ? d.custom_fields?.[key] : null;
        if (typeof raw !== "string" || raw.length < 10) continue;
        (freedDatesByUser[d.user_id] ||= new Set()).add(raw.slice(0, 10));
      }

      const waitlistCustomerIds = [...new Set(waitlistEntries.map((w) => w.customer_id).filter(Boolean))];
      const { data: waitlistCustomerRows } = await supabaseAdmin.from("customers").select("id, name, email").in("id", waitlistCustomerIds);
      const waitlistCustomerById = Object.fromEntries((waitlistCustomerRows || []).map((c) => [c.id, c]));

      for (const entry of waitlistEntries) {
        const freedDates = freedDatesByUser[entry.user_id];
        if (freedDates && freedDates.has(entry.requested_date)) {
          const customer = waitlistCustomerById[entry.customer_id];
          const settings = waitlistSettingsByUser[entry.user_id] || {};
          if (customer?.email) {
            const company = settings.company_name || "Binerly";
            const dateLabel = new Date(`${entry.requested_date}T12:00:00Z`).toLocaleDateString("tr-TR", { day: "numeric", month: "long" });
            const bookUrl = settings.lead_capture_token ? `https://binerly.com/randevu-al/${settings.lead_capture_token}` : null;
            const bodyText = `Merhaba ${customer.name || ""},\n\n${company}'de ${dateLabel} günü için bir yer açıldı. Sizin için not almıştık, hemen bir saat seçmek ister misiniz?`;
            const footerLines = [`${company} (Binerly ile)`, "Bu e-posta Binerly (binerly.com) altyapısıyla gönderildi."];
            const notifyRes = await fetch("https://api.resend.com/emails", {
              method: "POST",
              headers: { Authorization: `Bearer ${resendApiKey}`, "Content-Type": "application/json" },
              body: JSON.stringify({
                from: `${company} (Binerly ile) <noreply@binerly.com>`,
                to: customer.email,
                subject: `${company} - ${dateLabel} için yer açıldı`,
                html: renderEmailHtml({ logoUrl: settings.logo_url, bodyText, ctaLabel: bookUrl ? "Randevu Al" : undefined, ctaUrl: bookUrl, footerLines }),
                text: plainTextFallback(bodyText, bookUrl ? "Randevu Al" : null, bookUrl, footerLines),
              }),
            });
            if (notifyRes.ok) waitlistNotified++;
          }
          // E-postası olmayan (sadece telefonlu) bir bekleyen için gönderilecek bir
          // kanal yok (SMS/WhatsApp henüz entegre değil, bkz. proje notları) -
          // yine de tekrar tekrar denenmesin diye damgalanır.
          await supabaseAdmin.from("appointment_waitlist").update({ notified_at: new Date().toISOString() }).eq("id", entry.id);
        }
      }
    }

    // Geri kazanım (churn/win-back) — VARSAYILAN KAPALI (bkz. sql/2026-08-03_
    // winback_notifications.sql), sadece winback_enabled=true olan işletmeler
    // için. "Pasif" tanımı customers.last_contact - Pano'daki "Pasif Müşteri
    // Oranı" istatistiğiyle AYNI sinyal, farklı bir tanım icat edilmedi.
    let winbackSent = 0;
    const { data: winbackSettings, error: winbackSettingsError } = await supabaseAdmin
      .from("company_settings")
      .select("user_id, company_name, logo_url, email, winback_inactive_days, lead_capture_token")
      .eq("winback_enabled", true);
    if (winbackSettingsError) {
      console.error("winback settings query error:", winbackSettingsError.message);
    } else if (winbackSettings && winbackSettings.length > 0) {
      const winbackUserIds = winbackSettings.map((s) => s.user_id);
      const { data: candidateCustomers, error: candidatesError } = await supabaseAdmin
        .from("customers")
        .select("id, user_id, name, email, marketing_consent, last_contact, winback_sent_at")
        .in("user_id", winbackUserIds)
        .is("deleted_at", null)
        .eq("marketing_consent", true)
        .not("email", "is", null)
        .not("last_contact", "is", null);
      if (candidatesError) {
        console.error("winback candidates query error:", candidatesError.message);
      } else {
        const winbackSettingsByUser = Object.fromEntries(winbackSettings.map((s) => [s.user_id, s]));
        const now = Date.now();
        for (const customer of candidateCustomers || []) {
          const settings = winbackSettingsByUser[customer.user_id];
          const thresholdDays = settings?.winback_inactive_days > 0 ? settings.winback_inactive_days : 60;
          const daysSinceContact = (now - new Date(customer.last_contact).getTime()) / (24 * 60 * 60 * 1000);
          if (daysSinceContact < thresholdDays) continue;
          // Müşteri son bildirimden SONRA yeniden temas kurduysa (last_contact
          // ilerlediyse) tekrar gönderilebilir - ama aynı "sessizlik dönemi"
          // içinde bir daha gönderilmez, her gün aynı kişiye spam olmasın.
          if (customer.winback_sent_at && new Date(customer.winback_sent_at) >= new Date(customer.last_contact)) continue;

          const company = settings.company_name || "Binerly";
          const bodyText = `Merhaba ${customer.name || ""},\n\nSizi bir süredir ${company}'de görmedik, sizi özledik! Tekrar görüşmek isteriz.`;
          const footerLines = [`${company} (Binerly ile)`, "Bu e-posta Binerly (binerly.com) altyapısıyla gönderildi."];
          // Randevu widget'ı varsa (Ayarlar → Müşteri Kazanma Linki) tek tıkla
          // yeniden randevu almayı önerir - yoksa sade bir mesaj olarak kalır.
          const ctaUrl = settings.lead_capture_token ? `https://binerly.com/randevu-al/${settings.lead_capture_token}` : null;
          const winbackRes = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: { Authorization: `Bearer ${resendApiKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              from: `${company} (Binerly ile) <noreply@binerly.com>`,
              to: customer.email,
              subject: `Sizi özledik - ${company}`,
              html: renderEmailHtml({ logoUrl: settings.logo_url, bodyText, ctaLabel: ctaUrl ? "Randevu Al" : undefined, ctaUrl, footerLines }),
              text: plainTextFallback(bodyText, ctaUrl ? "Randevu Al" : null, ctaUrl, footerLines),
              ...(settings.email ? { reply_to: settings.email } : {}),
            }),
          });
          if (winbackRes.ok) {
            winbackSent++;
            await supabaseAdmin.from("customers").update({ winback_sent_at: new Date().toISOString() }).eq("id", customer.id);
          }
        }
      }
    }

    return res.status(200).json({ usersNotified, failed, customersNotified, reviewsRequested, membershipsMoved, winbackSent, waitlistNotified, tasksNotified });
  } catch (err) {
    console.error("send-reminders fatal error:", err.message);
    return res.status(500).json({ error: "Gönderim sırasında hata oluştu." });
  }
}
