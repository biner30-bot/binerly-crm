import React, { useEffect } from "react";
import { TrackingScripts } from "./analytics";

function LegalLayout({ title, updatedAt, children }) {
  // Bu sayfalar index.html'deki genel başlığı miras alıyordu — arama
  // sonuçlarında hepsi "Binerly — KOBİ CRM Yazılımı..." olarak görünüyordu,
  // kendi içeriklerini yansıtmıyordu.
  useEffect(() => {
    document.title = `${title} - Binerly`;
    const meta = document.querySelector('meta[name="description"]');
    if (meta)
      meta.setAttribute(
        "content",
        `Binerly ${title.toLowerCase()} - son güncelleme: ${updatedAt}.`,
      );
  }, [title, updatedAt]);

  return (
    <div style={{ minHeight: "100vh", background: "#f5f8fc" }}>
      <TrackingScripts />
      <nav
        style={{
          display: "flex",
          alignItems: "center",
          padding: "0 2rem",
          height: 64,
          background: "#fff",
          borderBottom: "1px solid #e1e8f0",
        }}
      >
        <a
          href="/"
          style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none" }}
        >
          <img src="/favicon.svg" alt="Binerly" style={{ width: 39, height: 39 }} />
          <span style={{ fontWeight: 700, fontSize: 18, color: "#0c2540" }}>Binerly</span>
        </a>
      </nav>
      <div style={{ maxWidth: 760, margin: "0 auto", padding: "3rem 2rem 5rem" }}>
        <h1 style={{ fontSize: 26, fontWeight: 800, color: "#0c2540", margin: "0 0 4px" }}>
          {title}
        </h1>
        <p style={{ fontSize: 13, color: "#94a7bb", margin: "0 0 32px" }}>
          Son güncelleme: {updatedAt}
        </p>
        <div style={{ fontSize: 15, lineHeight: 1.75, color: "#334155" }}>{children}</div>
        <p style={{ marginTop: 40 }}>
          <a
            href="/"
            style={{ color: "#185fa5", fontSize: 14, fontWeight: 600, textDecoration: "none" }}
          >
            ← Ana sayfaya dön
          </a>
        </p>
      </div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <h2 style={{ fontSize: 17, fontWeight: 700, color: "#0c2540", margin: "0 0 8px" }}>
        {title}
      </h2>
      {children}
    </div>
  );
}

export function PrivacyPolicyPage() {
  return (
    <LegalLayout title="Gizlilik Politikası" updatedAt="29 Ağustos 2026">
      <Section title="1. Genel">
        <p>
          Bu Gizlilik Politikası, Binerly ("biz", "Binerly") tarafından işletilen KOBİ CRM
          hizmetinin (binerly.com, portal.binerly.com) kullanımı sırasında toplanan kişisel
          verilerin nasıl işlendiğini açıklar. Binerly'yi kullanarak bu politikayı kabul etmiş
          olursunuz.
        </p>
      </Section>
      <Section title="2. Topladığımız Veriler">
        <p>
          Hesap sahibi (KOBİ) olarak: ad-soyad, e-posta adresi ve işletme bilgileri. Hesap sahibinin
          sisteme kendi girdiği müşteri verileri: müşteri adı, iletişim bilgileri, satış/teklif
          kayıtları, destek talepleri ve mesajları. Müşteri Bilgi Sistemi (portal) kullanıcıları
          için: e-posta adresi ve portal üzerinden oluşturdukları destek talepleri/mesajlar. Hesap
          sahibinin tercihine bağlı olarak, bazı sektörlerde (örn. Sağlık/Klinik, Güzellik & Bakım)
          tedavi öncesi/sonrası fotoğraflar gibi görsel veriler de sisteme yüklenebilir - bu
          özellik, hesap sahibinin kendi müşterisinden ayrıca açık rıza almasını gerektirecek
          şekilde tasarlanmıştır (bkz. KVKK Aydınlatma Metni m.2).
        </p>
        <p>
          Hesap güvenliği ve herkese açık formların (randevu/iletişim) kötüye kullanımının önlenmesi
          amacıyla giriş kayıtları ile form gönderimi sırasındaki IP adresi işlenir. Form spam'ini
          engellemek için tutulan IP kaydı en fazla 24 saat sonra otomatik olarak silinir.
        </p>
      </Section>
      <Section title="3. Verilerin Kullanım Amacı">
        <p>
          Toplanan veriler yalnızca hizmetin sunulması (müşteri/satış/destek yönetimi, e-posta
          bildirimleri, teklif oluşturma), hesap güvenliğinin sağlanması, hizmetin kötüye kullanıma
          karşı korunması ve yasal yükümlülüklerin yerine getirilmesi amacıyla kullanılır.
        </p>
      </Section>
      <Section title="4. Üçüncü Taraf Hizmet Sağlayıcılar">
        <p>
          Verileriniz aşağıdaki alt yüklenicilerle, yalnızca hizmetin çalışması için gerekli ölçüde
          paylaşılır: Supabase (veritabanı, kimlik doğrulama ve barındırma), Vercel (uygulama
          barındırma), Resend (e-posta gönderimi), Google (Google ile giriş/kayıt tercih ettiğinizde
          kimlik doğrulama), iyzico ve PayTR (hesap sahibi online ödeme bağlantısını aktif ettiğinde
          kredi/banka kartı ile ödeme işlemleri - kart bilgileriniz bu sağlayıcılar üzerinden
          işlenir, Binerly sunucularında saklanmaz), Sentry (uygulamada oluşan teknik hataların
          otomatik tespiti için hata mesajı/oturum teknik bilgisi işlenir, kişisel veri içeriği en
          aza indirilecek şekilde yapılandırılmıştır), Google Analytics ve Meta (Facebook) Pixel
          (yalnızca herkese açık sayfalarda, çerez tercihlerinizde analitik/pazarlama çerezlerine
          onay verdiğinizde kullanım istatistiği ve reklam ölçümü amacıyla). Bu sağlayıcılarla veri
          işleme sözleşmeleri kapsamında çalışılmaktadır.
        </p>
      </Section>
      <Section title="5. Çerezler">
        <p>
          binerly.com üzerinde sitenin çalışması için gerekli zorunlu çerezlerin yanında, onayınız
          halinde kullanım istatistiklerini ölçmek için Google Analytics ve size uygun
          kampanya/reklam göstermek için Meta (Facebook) Pixel çerezleri kullanılabilir. Bu çerezler
          yalnızca herkese açık sayfalarda (ana sayfa, yasal sayfalar) ve sayfa altındaki çerez
          bildirimini "Hepsini kabul et" ile onayladığınızda veya tercihler ekranından ilgili
          kategoriyi seçtiğinizde yüklenir; giriş yaptığınız panelde veya Müşteri Bilgi Sistemi
          (portal) içinde bu çerezler hiç çalışmaz. Onay vermez veya reddederseniz bu çerezler hiç
          yüklenmez; tercihinizi tarayıcınızın çerez ayarlarından silerek sıfırlayabilirsiniz.
        </p>
      </Section>
      <Section title="6. Veri Güvenliği">
        <p>
          Verileriniz bizimle güvendedir. Her kullanıcı yalnızca kendi verisine erişebilir (satır
          düzeyinde erişim kontrolü - Row Level Security) ve Binerly ekibi, verilerinize size destek
          olmak amacıyla yalnızca sizin talebiniz veya bilginiz dahilinde erişir. Müşteri Bilgi
          Sistemi kullanıcıları yalnızca kendi doğrulanmış e-postalarıyla eşleşen kayıtlara
          erişebilir. WhatsApp/Instagram gibi bağladığınız mesajlaşma hesapları için: bağladığınız
          hesaba gelen mesajlar hizmetin çalışması amacıyla saklanır; işe özel, ayrı bir
          hesap/numara bağlamanız önerilir.
        </p>
      </Section>
      <Section title="7. Haklarınız">
        <p>
          Verilerinize erişim, düzeltme veya silme talebiniz için{" "}
          <a href="mailto:info@binerly.com" style={{ color: "#185fa5" }}>
            info@binerly.com
          </a>{" "}
          adresinden bizimle iletişime geçebilirsiniz.
        </p>
      </Section>
    </LegalLayout>
  );
}

export function KvkkPage() {
  return (
    <LegalLayout title="KVKK Aydınlatma Metni" updatedAt="29 Ağustos 2026">
      <Section title="1. Veri Sorumlusu">
        <p>
          6698 sayılı Kişisel Verilerin Korunması Kanunu ("KVKK") uyarınca, Binerly markası altında
          hizmet veren Danyel Biner, veri sorumlusu sıfatıyla, işbu aydınlatma metni ile kişisel
          verilerinizin işlenmesine ilişkin sizi bilgilendirmek ister.
        </p>
      </Section>
      <Section title="2. İşlenen Kişisel Veri Kategorileri">
        <p>
          Kimlik bilgileri (ad-soyad), iletişim bilgileri (e-posta, telefon), müşteri ilişkisi
          kapsamında hesap sahibi tarafından sisteme girilen veriler (satış/teklif/destek
          kayıtları), işlem güvenliği bilgileri (giriş kayıtları; herkese açık randevu/iletişim
          formlarının gönderildiği andaki IP adresi). Hesap sahibinin tercihine bağlı olarak, bazı
          sektörlerde (örn. Sağlık/Klinik, Güzellik & Bakım) tedavi öncesi/sonrası fotoğraflar gibi
          görsel veriler de işlenebilir; bu veriler KVKK m.6 kapsamında özel nitelikli kişisel veri
          sayılabilir.
        </p>
      </Section>
      <Section title="3. İşleme Amacı ve Hukuki Sebep">
        <p>
          Kişisel verileriniz, KVKK m.5/2(c) sözleşmenin kurulması/ifası ve m.5/2(f) meşru menfaat
          hukuki sebeplerine dayanarak; CRM hizmetinin sunulması, destek taleplerinin yönetilmesi,
          hizmetin güvenliğinin ve otomatik/bot kaynaklı kötüye kullanıma (form spam'i) karşı
          korunmasının sağlanması ve yasal yükümlülüklerin yerine getirilmesi amacıyla
          işlenmektedir. Herkese açık formların kötüye kullanımını engellemek amacıyla tutulan IP
          kayıtları en fazla 24 saat içinde otomatik olarak silinir. Özel nitelikli kişisel
          verileriniz (örn. tedavi öncesi/sonrası fotoğraflar) yalnızca KVKK m.6/2 uyarınca açık
          rızanıza dayanılarak işlenir.
        </p>
      </Section>
      <Section title="4. Verilerin Aktarılması">
        <p>
          Verileriniz, hizmetin sunulabilmesi için gerekli teknik altyapı sağlayıcılarımız (Supabase
          - veritabanı ve kimlik doğrulama, Vercel - barındırma, Resend - e-posta gönderimi, Google
          - Google ile giriş tercih edildiğinde kimlik doğrulama, iyzico/PayTR - online ödeme tercih
          edildiğinde kredi/banka kartı ile ödeme işlemleri, Sentry - uygulama hatalarının teknik
          olarak tespiti, Google Analytics/Meta Pixel - yalnızca herkese açık sayfalarda çerez onayı
          verdiğinizde kullanım istatistiği ve reklam ölçümü) ile ve yasal olarak yetkili kamu
          kurum/kuruluşlarıyla, yalnızca talep edilmesi halinde paylaşılabilir.
        </p>
      </Section>
      <Section title="5. Veri Sahibinin Hakları (KVKK m.11)">
        <p>
          Kişisel verinizin işlenip işlenmediğini öğrenme, işlenmişse bilgi talep etme, işlenme
          amacını ve amacına uygun kullanılıp kullanılmadığını öğrenme, yurt içinde/dışında
          aktarıldığı üçüncü kişileri bilme, eksik/yanlış işlenmişse düzeltilmesini isteme, KVKK'da
          öngörülen şartlar çerçevesinde silinmesini/yok edilmesini isteme, işlenen verilerin
          münhasıran otomatik sistemler vasıtasıyla analiz edilmesi suretiyle aleyhinize bir sonucun
          ortaya çıkmasına itiraz etme ve kanuna aykırı işleme nedeniyle zarara uğramanız halinde
          zararın giderilmesini talep etme haklarına sahipsiniz.
        </p>
      </Section>
      <Section title="6. Başvuru Yöntemi">
        <p>
          Yukarıdaki haklarınızı kullanmak için{" "}
          <a href="mailto:info@binerly.com" style={{ color: "#185fa5" }}>
            info@binerly.com
          </a>{" "}
          adresine yazılı olarak başvurabilirsiniz.
        </p>
      </Section>
    </LegalLayout>
  );
}

export function TermsPage() {
  return (
    <LegalLayout title="Kullanım Koşulları" updatedAt="6 Ağustos 2026">
      <Section title="1. Hizmetin Kapsamı">
        <p>
          Binerly, KOBİ'ler için müşteri ilişkileri yönetimi (CRM), satış takibi, destek talebi ve
          raporlama hizmeti sunan bir web uygulamasıdır. Hizmet "olduğu gibi" sunulmaktadır.
        </p>
      </Section>
      <Section title="2. Hesap ve Sorumluluklar">
        <p>
          Hesabınızın güvenliğinden (şifre gizliliği dahil) siz sorumlusunuz. Sisteme girdiğiniz
          müşteri verilerinin doğruluğundan ve ilgili kişilerin (müşterilerinizin) verilerini
          işlerken kendi yasal yükümlülüklerinizi (KVKK dahil) yerine getirmekten siz sorumlusunuz.
        </p>
        <p>
          Binerly üzerinden müşterilerinize e-posta, WhatsApp veya benzeri kanallardan
          pazarlama/tanıtım amaçlı mesaj (ticari elektronik ileti) göndermeniz halinde, İleti
          Yönetim Sistemi (İYS) dahil ilgili mevzuata ve kullandığınız üçüncü taraf platformların
          kurallarına (WhatsApp Business Politikası dahil) uymak tamamen sizin sorumluluğunuzdadır.
          Binerly bu iletileri sizin adınıza göndermez; ilgili özellikler (WhatsApp'tan yazma linki,
          kampanya gönderme aracı vb.) yalnızca bir kolaylık aracıdır ve gönderim kararı/onayı her
          zaman size aittir.
        </p>
      </Section>
      <Section title="3. Kalıcı Silme">
        <p>
          Çöp Kutusu'ndaki kayıtları kalıcı olarak silme yetkisi sadece hesap sahibine aittir ve bu
          işlem geri alınamaz. Kalıcı silme talimatı tamamen size (veri sorumlusuna) aittir;
          sildiğiniz kayıtların, varsa geçerli yasal saklama yükümlülüklerinize (vergi mevzuatı
          dahil) uygun olmasından siz sorumlusunuz. Tahsilat ve işletme gideri kayıtları, yasal
          saklama süreleri nedeniyle bu özellik kapsamı dışında tutulur ve kalıcı silinemez.
        </p>
      </Section>
      <Section title="4. Takım Üyeliği ve Hesap Paylaşımı">
        <p>
          Bir hesaba takım üyesi olarak eklenen kişilerin, o hesabı oluşturan işletmenin çalışanı
          veya yetkilisi olması gerekir. Bir hesap; birbirinden bağımsız, farklı işletmeler veya
          kişiler tarafından ortak kullanılamaz, kullanıcı başına maliyeti düşürmek amacıyla ilgisiz
          taraflarla paylaşılamaz. Takım daveti kabul edilirken bu husus ayrıca beyan edilir. Bu
          kurala aykırı kullanım tespit edilirse hesap askıya alınabilir veya sonlandırılabilir
          (bkz. Madde 10 - Fesih).
        </p>
        <p>
          Bir hesapta, işletme sahibi dahil en fazla 5 kullanıcı bulunabilir. Daha fazla kullanıcıya
          ihtiyaç duyan işletmeler için{" "}
          <a href="mailto:info@binerly.com" style={{ color: "#185fa5" }}>
            info@binerly.com
          </a>{" "}
          üzerinden ayrıca bir çözüm değerlendirilebilir.
        </p>
      </Section>
      <Section title="5. Faturalandırma ve Vergi Yükümlülükleri">
        <p>
          Binerly bir müşteri ilişkileri yönetimi (kayıt ve takip) aracıdır; fatura kesme, vergi
          dairesine bildirim veya benzeri resmi işlemleri gerçekleştirmez. Sattığınız ürün/hizmetler
          için fatura düzenlemek, vergi beyanında bulunmak ve ilgili tüm yasal/mali yükümlülükleri
          yerine getirmek tamamen size (hizmeti kullanan işletmeye) aittir. Binerly'nin sunduğu
          Paraşüt'e aktarma gibi özellikler sadece bir kolaylık aracıdır, bu konudaki
          sorumluluğunuzu ortadan kaldırmaz.
        </p>
      </Section>
      <Section title="6. Kabul Edilebilir Kullanım">
        <p>
          Hizmeti yasa dışı amaçlarla, izinsiz veri toplama veya üçüncü kişilerin haklarını ihlal
          edecek şekilde kullanamazsınız.
        </p>
      </Section>
      <Section title="7. Teklif Onay Linki">
        <p>
          Binerly'nin sunduğu "teklif onay linki" özelliği, müşterinizin bir bağlantıya tıklayarak
          teklifi onayladığını sisteme kaydeder ve size bildirim gönderir. Bu, 5070 sayılı
          Elektronik İmza Kanunu anlamında "güvenli elektronik imza" NİTELİĞİNDE DEĞİLDİR ve kimlik
          doğrulaması içermez - sadece dahili takip ve iletişim kaydı amaçlıdır. Hukuki
          bağlayıcılığı önemli olan anlaşmalar için ıslak imza, nitelikli elektronik imza veya başka
          resmi bir onay yöntemi kullanmanızı öneririz.
        </p>
      </Section>
      <Section title="8. Ücretlendirme">
        <p>
          Güncel fiyatlandırma ve deneme süresi koşulları binerly.com üzerinden veya tarafımızca
          ayrıca bildirilir. Ödeme koşulları ve iptal politikası ayrıca paylaşılacaktır. Hizmet
          ücretli bir plana geçse veya fiyatlandırma değişse dahi, hesabınızdaki mevcut verileriniz
          (müşteri, teklif, destek kayıtları vb.) silinmez; herhangi bir ücretlendirme değişikliği
          yürürlüğe girmeden önce size makul bir süre öncesinden bildirim yapılır.
        </p>
      </Section>
      <Section title="9. Verilerinizin Sahipliği ve Dışa Aktarımı">
        <p>
          Sisteme girdiğiniz tüm veriler (müşteri kayıtları, teklifler, destek talepleri vb.) size
          aittir. Hesabınız aktifken ilgili ekranlardaki Dışa Aktar özellikleriyle verilerinizi
          dilediğiniz zaman indirebilirsiniz. Hesabınızı kapatmak isterseniz{" "}
          <a href="mailto:info@binerly.com" style={{ color: "#185fa5" }}>
            info@binerly.com
          </a>{" "}
          üzerinden bize ulaşın; verileriniz, yasal saklama yükümlülüklerimiz (bkz. Madde 3 - Kalıcı
          Silme) dışında makul bir süre içinde silinir.
        </p>
      </Section>
      <Section title="10. Sorumluluğun Sınırlandırılması">
        <p>
          Binerly, hizmetin kesintisiz veya hatasız olacağını garanti etmez. Yasaların izin verdiği
          azami ölçüde, dolaylı zararlardan sorumlu tutulamaz.
        </p>
      </Section>
      <Section title="11. Fesih">
        <p>
          Hesabınızı istediğiniz zaman kapatabilirsiniz. Kullanım koşullarının ihlali halinde (Madde
          4'teki takım üyeliği kuralı dahil) hizmete erişiminiz askıya alınabilir veya
          sonlandırılabilir.
        </p>
      </Section>
      <Section title="12. Değişiklikler">
        <p>
          Bu Kullanım Koşulları'nda değişiklik yapabiliriz. Güncel sürüm her zaman bu sayfada
          yayınlanır ve sayfanın üstünde son güncelleme tarihi belirtilir. Önemli değişikliklerde
          (örn. ücretlendirme veya sorumluluk maddelerinde) ayrıca e-posta ile bilgilendirme
          yaparız.
        </p>
      </Section>
      <Section title="13. Uygulanacak Hukuk ve Yetkili Mahkeme">
        <p>
          Bu Kullanım Koşulları Türkiye Cumhuriyeti kanunlarına tabidir. İşbu koşullardan
          doğabilecek uyuşmazlıklarda Türkiye Cumhuriyeti mahkemeleri ve icra daireleri yetkilidir.
        </p>
      </Section>
      <Section title="14. İletişim">
        <p>
          Sorularınız için:{" "}
          <a href="mailto:info@binerly.com" style={{ color: "#185fa5" }}>
            info@binerly.com
          </a>
        </p>
      </Section>
    </LegalLayout>
  );
}

export function PortalTermsPage() {
  return (
    <LegalLayout title="Müşteri Bilgi Sistemi Kullanım Koşulları" updatedAt="6 Ağustos 2026">
      <Section title="1. Hizmetin Kapsamı">
        <p>
          Müşteri Bilgi Sistemi (Binerly Portal), Binerly'yi CRM olarak kullanan bir işletmenin
          müşterisi olarak sizin, o işletmeyle olan randevu/teklif/destek kayıtlarınızı takip
          edebilmeniz, mesajlaşabilmeniz ve talep oluşturabilmeniz için Binerly tarafından sağlanan
          bir self-servis araçtır. Asıl hizmet ilişkiniz (satın aldığınız ürün/hizmet, randevunuz
          vb.) Binerly ile değil, ilgili işletmeyle aranızdadır; Binerly yalnızca bu takip aracının
          teknik altyapısını sağlar.
        </p>
      </Section>
      <Section title="2. Hesap Güvenliği">
        <p>
          Hesabınızın (e-posta/şifre veya Google ile giriş) güvenliğinden siz sorumlusunuz.
          Şifrenizi kimseyle paylaşmayın; yetkisiz erişim şüphesi durumunda{" "}
          <a href="mailto:info@binerly.com" style={{ color: "#185fa5" }}>
            info@binerly.com
          </a>{" "}
          üzerinden bize bildirin.
        </p>
      </Section>
      <Section title="3. Verileriniz">
        <p>
          Portal üzerinden paylaştığınız bilgiler (talepleriniz, mesajlarınız, randevu bilgileriniz)
          ilgili işletmeyle ve gerektiğinde Binerly ekibiyle paylaşılır. Verilerinizin nasıl
          işlendiğine dair detaylar{" "}
          <a href="/gizlilik" style={{ color: "#185fa5" }}>
            Gizlilik Politikası
          </a>{" "}
          ve{" "}
          <a href="/kvkk" style={{ color: "#185fa5" }}>
            KVKK Aydınlatma Metni
          </a>
          'nde yer alır.
        </p>
      </Section>
      <Section title="4. Kabul Edilebilir Kullanım">
        <p>
          Portalı yalnızca kendi kayıtlarınızı görüntülemek ve ilgili işletmeyle iletişim kurmak
          amacıyla kullanabilirsiniz. Başka kullanıcıların hesaplarına yetkisiz erişim denemesi veya
          sistemi kötüye kullanım yasaktır.
        </p>
      </Section>
      <Section title="5. Hizmetin Niteliği">
        <p>
          Binerly, portalın kesintisiz veya hatasız çalışacağını garanti etmez. Portal üzerinden
          gönderdiğiniz taleplerin ilgili işletme tarafından ne zaman yanıtlanacağı Binerly'nin
          kontrolünde değildir.
        </p>
      </Section>
      <Section title="6. Hesap Kapanışı">
        <p>
          Portal hesabınızı istediğiniz zaman{" "}
          <a href="mailto:info@binerly.com" style={{ color: "#185fa5" }}>
            info@binerly.com
          </a>{" "}
          üzerinden kapatmamızı talep edebilirsiniz.
        </p>
      </Section>
      <Section title="7. Değişiklikler">
        <p>
          Bu Kullanım Koşulları'nda değişiklik yapabiliriz. Güncel sürüm her zaman bu sayfada
          yayınlanır ve sayfanın üstünde son güncelleme tarihi belirtilir.
        </p>
      </Section>
      <Section title="8. Uygulanacak Hukuk ve Yetkili Mahkeme">
        <p>
          Bu Kullanım Koşulları Türkiye Cumhuriyeti kanunlarına tabidir. İşbu koşullardan
          doğabilecek uyuşmazlıklarda Türkiye Cumhuriyeti mahkemeleri ve icra daireleri yetkilidir.
        </p>
      </Section>
      <Section title="9. İletişim">
        <p>
          Sorularınız için:{" "}
          <a href="mailto:info@binerly.com" style={{ color: "#185fa5" }}>
            info@binerly.com
          </a>
        </p>
      </Section>
    </LegalLayout>
  );
}
