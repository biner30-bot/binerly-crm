# Binerly CRM

KOBİ'ler için satış/müşteri/randevu takip sistemi. React 18 + Vite 5 frontend, Supabase (Postgres + Auth + Storage) backend, Vercel'de barındırılıyor (serverless `api/` fonksiyonları + statik SPA).

## Komutlar

```
npm run dev        # yerel geliştirme sunucusu (localhost:5173)
npm run build      # production build
npm run lint       # eslint .
npm run test:e2e   # Playwright e2e smoke testleri
```

`npm run dev` ile çalışırken `api/` altındaki serverless fonksiyonlar ÇALIŞMAZ (Vite bunları derlemez) — `fetch('/api/...')` çağrıları ham kaynak dosyasını döner, `.json()` parse hatası verir. Bu bilinen ve production'da olmayan bir kısıtlama, "düzeltilmesi gereken bug" değil.

## Mimari

- **`src/App.jsx`** — uygulamanın çekirdeği: tüm state (~useState/useEffect), Supabase CRUD handler'ları (`add*/update*/delete*`), sekme yönlendirme mantığı. Diğer her şey buradan prop/callback alan alt bileşenler.
- **Diğer `src/*.jsx` dosyaları** — konuya göre gruplanmış saf prop-alan bileşenler (Finance.jsx, Sectors.jsx, Deals.jsx, Customers.jsx, Pano.jsx, Team.jsx, GroupClasses.jsx, vb.). Yeni bir ekran/form eklerken App.jsx'e değil, en yakın konu dosyasına ekle; state App.jsx'te kalır.
  - İstisna: `CompanySettingsForm`, `TeamModal`, `TrashHistoryModal`, `AppSettingsModal`, `PasswordRecoveryModal`, `AuthModal` doğrudan `supabase` çağırıyor (saf prop deseninden bilinçli sapma).
- **`api/`** — Vercel serverless fonksiyonları. **Vercel Hobby planında 12 fonksiyon sınırı var, şu an 12/12 dolu** (`_` ile başlayan dosyalar — örn. `_email-template.js` — fonksiyon sayılmaz, paylaşılan yardımcı). Yeni bir endpoint gerekiyorsa önce mevcut bir handler'a route/action parametresiyle ekleme eklenip eklenemeyeceğini düşün; olmuyorsa kullanıcıya plan yükseltmeyi söyle.
- **`sql/`** — şema yedeği ve migration geçmişi.

## Kod stili

- **Sohbette her zaman Türkçe yaz.**
- Sitedeki tüm metinlerde (UI, commit mesajları, kod yorumları hariç) kısa tire (`-`) kullan, asla em dash (`—`) veya en dash (`–`) kullanma.
- Yorumlar sadece WHY açıklıyorsa yaz (gizli bir kısıt, kullanıcı tarafından bulunmuş bir hata, sektöre özgü bir karar) — WHAT'i açıklayan yorum yazma, isimler zaten açıklıyor.
- `src/App.jsx` Prettier'dan **bilinçli olarak hariç** — pre-commit hook'ta sadece `eslint --fix` alır (whole-file reformat diff riski). Diğer tüm `src/*.jsx` dosyaları hem `eslint --fix` hem `prettier --write` alır.
- ESLint config'de `no-unused-vars` kuralı büyük harfle başlayan (bileşen/sabit) kullanılmayan import'ları görmezden geliyor (`varsIgnorePattern: /^[A-Z_]/`) — sadece küçük harfle başlayan unused import'lar uyarı verir.
- `ConfirmDialog` prop'u `onClose`'dur, `onCancel` DEĞİL — yanlış isim sessizce yok sayılır (React invalid prop warning bile vermez, sadece işlevsiz kalır).

## Git / commit workflow

- **Push'tan önce her zaman kullanıcıdan onay al** — otomatik push yapma, `--force` asla kullanma.
- Commit mesajları Türkçe/ASCII karışık, kısa ve "neden" odaklı; `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>` satırıyla biter.
- Belirli dosyaları `git add` ile ekle, `git add -A`/`git add .` kullanma.
- Büyük refactor'larda (örn. dosya bölme) her mantıksal parça kendi commit'i olsun, asla birleştirme.

## Test / doğrulama

Kapsamlı bir otomatik test paketi yok (sadece `e2e/landing.spec.js`'te 2 salt-okur Playwright smoke testi). Bu yüzden davranış değiştiren her değişiklikten sonra:

1. `npm run build` + `npm run lint` (ESLint'in `no-undef` kuralı eksik import/prop'ları statik olarak yakalar — refactor'larda birincil güvenlik ağı).
2. `npm run test:e2e`
3. Playwright MCP ile `npm run dev`'e karşı canlı tarayıcı testi — gerçek test hesabıyla ilgili ekranı aç, konsol hatası olmadığını doğrula. Production Supabase'e karşı gerçek yazma/silme işlemi genelde gerekli değil, sadece render/etkileşim doğrulaması yeterli.

Playwright ile React controlled input'lara yazarken `input.value = x; dispatchEvent(new Event('input'))` React'ın value tracker'ını atlayıp sessizce hiçbir şey yapmayabilir — native setter'ı kullan (`Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, x)`) ya da mümkünse `browser_type`/`fill` aracını tercih et.

## Bilinen tuzaklar

- **RLS OR-birleşme**: aynı hesap birden fazla role uyarsa (örn. hem owner hem team_member) Postgres RLS politikaları OR ile birleşir — sunucu tarafı filtre yetersiz kalabilir, istemci tarafında da filtrele.
- **`service_role` GRANT tuzağı**: bir tablo `service_role` ile İLK KEZ okunduğunda (yeni tablo olması şart değil) GRANT eksikse sessizce boş sonuç döner, hata fırlatmaz. Teşhis: `X-Vercel-Cache: MISS` + `information_schema.role_table_grants` kontrolü.
- Sektöre özgü özellikler aynı `company_settings` kolonunu paylaşmasın — sektör değiştirilebilir bir alan, paylaşılan kolon "sektör sızıntısı"na yol açar.
- Yeni bir `dealWordKind` (veya benzer enum) değeri eklerken onu kullanan TÜM sözlükleri (stage label'ları, boş durum metinleri vb.) kontrol et, eksik bırakılırsa canlıda çöker.
