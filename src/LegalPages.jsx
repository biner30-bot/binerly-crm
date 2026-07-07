import React from "react";
import { TrackingScripts } from "./analytics";

function LegalLayout({ title, updatedAt, children }) {
  return (
    <div style={{ minHeight: "100vh", background: "#f5f8fc" }}>
      <TrackingScripts />
      <nav style={{ display: "flex", alignItems: "center", padding: "0 2rem", height: 64, background: "#fff", borderBottom: "1px solid #e1e8f0" }}>
        <a href="/" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none" }}>
          <img src="/favicon.svg" alt="Binerly" style={{ width: 28, height: 28 }} />
          <span style={{ fontWeight: 700, fontSize: 18, color: "#0c2540" }}>Binerly</span>
        </a>
      </nav>
      <div style={{ maxWidth: 760, margin: "0 auto", padding: "3rem 2rem 5rem" }}>
        <div
          style={{
            background: "#fef3c7",
            color: "#b45309",
            fontSize: 13,
            padding: "10px 14px",
            borderRadius: 8,
            marginBottom: 24,
          }}
        >
          Bu metin genel bir taslaktır ve hukuki danışmanlık yerine geçmez. Yayına almadan önce bir uzman tarafından gözden geçirilmesi önerilir.
        </div>
        <h1 style={{ fontSize: 26, fontWeight: 800, color: "#0c2540", margin: "0 0 4px" }}>{title}</h1>
        <p style={{ fontSize: 13, color: "#94a7bb", margin: "0 0 32px" }}>Son güncelleme: {updatedAt}</p>
        <div style={{ fontSize: 15, lineHeight: 1.75, color: "#334155" }}>{children}</div>
        <p style={{ marginTop: 40 }}>
          <a href="/" style={{ color: "#185fa5", fontSize: 14, fontWeight: 600, textDecoration: "none" }}>← Ana sayfaya dön</a>
        </p>
      </div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <h2 style={{ fontSize: 17, fontWeight: 700, color: "#0c2540", margin: "0 0 8px" }}>{title}</h2>
      {children}
    </div>
  );
}

export function PrivacyPolicyPage() {
  return (
    <LegalLayout title="Gizlilik Politikası" updatedAt="2 Temmuz 2026">
      <Section title="1. Genel">
        <p>
          Bu Gizlilik Politikası, Binerly ("biz", "Binerly") tarafından işletilen KOBİ CRM hizmetinin
          (binerly.com) kullanımı sırasında toplanan kişisel verilerin nasıl işlendiğini açıklar.
          Binerly'yi kullanarak bu politikayı kabul etmiş olursunuz.
        </p>
      </Section>
      <Section title="2. Topladığımız Veriler">
        <p>
          Hesap sahibi (KOBİ) olarak: ad-soyad, e-posta adresi ve şirket bilgileri. Hesap sahibinin sisteme
          kendi girdiği müşteri verileri: müşteri adı, iletişim bilgileri, satış/teklif kayıtları, destek
          talepleri ve mesajları. Müşteri Bilgi Sistemi (portal) kullanıcıları için: e-posta adresi ve
          portal üzerinden oluşturdukları destek talepleri/mesajlar.
        </p>
      </Section>
      <Section title="3. Verilerin Kullanım Amacı">
        <p>
          Toplanan veriler yalnızca hizmetin sunulması (müşteri/satış/destek yönetimi, e-posta bildirimleri,
          teklif oluşturma), hesap güvenliğinin sağlanması ve yasal yükümlülüklerin yerine getirilmesi
          amacıyla kullanılır.
        </p>
      </Section>
      <Section title="4. Üçüncü Taraf Hizmet Sağlayıcılar">
        <p>
          Verileriniz aşağıdaki alt yüklenicilerle, yalnızca hizmetin çalışması için gerekli ölçüde paylaşılır:
          Supabase (veritabanı, kimlik doğrulama ve barındırma), Vercel (uygulama barındırma), Resend
          (e-posta gönderimi). Bu sağlayıcılarla veri işleme sözleşmeleri kapsamında çalışılmaktadır.
        </p>
      </Section>
      <Section title="5. Veri Güvenliği">
        <p>
          Verileriniz, her kullanıcının yalnızca kendi verisine erişebildiği satır düzeyinde erişim kontrolü
          (Row Level Security) ile korunur. Müşteri Bilgi Sistemi kullanıcıları yalnızca kendi doğrulanmış
          e-postalarıyla eşleşen kayıtlara erişebilir.
        </p>
      </Section>
      <Section title="6. Haklarınız">
        <p>
          Verilerinize erişim, düzeltme veya silme talebiniz için{" "}
          <a href="mailto:info@binerly.com" style={{ color: "#185fa5" }}>info@binerly.com</a> adresinden
          bizimle iletişime geçebilirsiniz.
        </p>
      </Section>
    </LegalLayout>
  );
}

export function KvkkPage() {
  return (
    <LegalLayout title="KVKK Aydınlatma Metni" updatedAt="2 Temmuz 2026">
      <Section title="1. Veri Sorumlusu">
        <p>
          6698 sayılı Kişisel Verilerin Korunması Kanunu ("KVKK") uyarınca, Binerly hizmetini işleten veri
          sorumlusu sıfatıyla, işbu aydınlatma metni ile kişisel verilerinizin işlenmesine ilişkin sizi
          bilgilendirmek isteriz.
        </p>
      </Section>
      <Section title="2. İşlenen Kişisel Veri Kategorileri">
        <p>
          Kimlik bilgileri (ad-soyad), iletişim bilgileri (e-posta, telefon), müşteri ilişkisi kapsamında
          hesap sahibi tarafından sisteme girilen veriler (satış/teklif/destek kayıtları), işlem güvenliği
          bilgileri (giriş kayıtları).
        </p>
      </Section>
      <Section title="3. İşleme Amacı ve Hukuki Sebep">
        <p>
          Kişisel verileriniz, KVKK m.5/2(c) sözleşmenin kurulması/ifası ve m.5/2(f) meşru menfaat hukuki
          sebeplerine dayanarak; CRM hizmetinin sunulması, destek taleplerinin yönetilmesi ve yasal
          yükümlülüklerin yerine getirilmesi amacıyla işlenmektedir.
        </p>
      </Section>
      <Section title="4. Verilerin Aktarılması">
        <p>
          Verileriniz, hizmetin sunulabilmesi için gerekli teknik altyapı sağlayıcılarımız (barındırma,
          veritabanı, e-posta gönderim hizmetleri) ile ve yasal olarak yetkili kamu kurum/kuruluşlarıyla,
          yalnızca talep edilmesi halinde paylaşılabilir.
        </p>
      </Section>
      <Section title="5. Veri Sahibinin Hakları (KVKK m.11)">
        <p>
          Kişisel verinizin işlenip işlenmediğini öğrenme, işlenmişse bilgi talep etme, işlenme amacını ve
          amacına uygun kullanılıp kullanılmadığını öğrenme, yurt içinde/dışında aktarıldığı üçüncü kişileri
          bilme, eksik/yanlış işlenmişse düzeltilmesini isteme, KVKK'da öngörülen şartlar çerçevesinde
          silinmesini/yok edilmesini isteme, işlenen verilerin münhasıran otomatik sistemler vasıtasıyla
          analiz edilmesi suretiyle aleyhinize bir sonucun ortaya çıkmasına itiraz etme ve kanuna aykırı
          işleme nedeniyle zarara uğramanız halinde zararın giderilmesini talep etme haklarına sahipsiniz.
        </p>
      </Section>
      <Section title="6. Başvuru Yöntemi">
        <p>
          Yukarıdaki haklarınızı kullanmak için{" "}
          <a href="mailto:info@binerly.com" style={{ color: "#185fa5" }}>info@binerly.com</a> adresine
          yazılı olarak başvurabilirsiniz.
        </p>
      </Section>
    </LegalLayout>
  );
}

export function TermsPage() {
  return (
    <LegalLayout title="Kullanım Koşulları" updatedAt="2 Temmuz 2026">
      <Section title="1. Hizmetin Kapsamı">
        <p>
          Binerly, KOBİ'ler için müşteri ilişkileri yönetimi (CRM), satış takibi, destek talebi ve
          raporlama hizmeti sunan bir web uygulamasıdır. Hizmet "olduğu gibi" sunulmaktadır.
        </p>
      </Section>
      <Section title="2. Hesap ve Sorumluluklar">
        <p>
          Hesabınızın güvenliğinden (şifre gizliliği dahil) siz sorumlusunuz. Sisteme girdiğiniz müşteri
          verilerinin doğruluğundan ve ilgili kişilerin (müşterilerinizin) verilerini işlerken kendi yasal
          yükümlülüklerinizi (KVKK dahil) yerine getirmekten siz sorumlusunuz.
        </p>
      </Section>
      <Section title="3. Takım Üyeliği ve Hesap Paylaşımı">
        <p>
          Bir hesaba takım üyesi olarak eklenen kişilerin, o hesabı oluşturan işletmenin çalışanı veya
          yetkilisi olması gerekir. Bir hesap; birbirinden bağımsız, farklı işletmeler veya kişiler
          tarafından ortak kullanılamaz, kullanıcı başına maliyeti düşürmek amacıyla ilgisiz taraflarla
          paylaşılamaz. Takım daveti kabul edilirken bu husus ayrıca beyan edilir. Bu kurala aykırı
          kullanım tespit edilirse hesap askıya alınabilir veya sonlandırılabilir (bkz. Madde 7 — Fesih).
        </p>
      </Section>
      <Section title="4. Faturalandırma ve Vergi Yükümlülükleri">
        <p>
          Binerly bir müşteri ilişkileri yönetimi (kayıt ve takip) aracıdır; fatura kesme, vergi dairesine
          bildirim veya benzeri resmi işlemleri gerçekleştirmez. Sattığınız ürün/hizmetler için fatura
          düzenlemek, vergi beyanında bulunmak ve ilgili tüm yasal/mali yükümlülükleri yerine getirmek
          tamamen size (hizmeti kullanan işletmeye) aittir. Binerly'nin sunduğu Paraşüt'e aktarma gibi
          özellikler sadece bir kolaylık aracıdır, bu konudaki sorumluluğunuzu ortadan kaldırmaz.
        </p>
      </Section>
      <Section title="5. Kabul Edilebilir Kullanım">
        <p>
          Hizmeti yasa dışı amaçlarla, izinsiz veri toplama veya üçüncü kişilerin haklarını ihlal edecek
          şekilde kullanamazsınız.
        </p>
      </Section>
      <Section title="6. Ücretlendirme">
        <p>
          Güncel fiyatlandırma ve deneme süresi koşulları binerly.com üzerinden veya tarafımızca ayrıca
          bildirilir. Ödeme koşulları ve iptal politikası ayrıca paylaşılacaktır.
        </p>
      </Section>
      <Section title="7. Sorumluluğun Sınırlandırılması">
        <p>
          Binerly, hizmetin kesintisiz veya hatasız olacağını garanti etmez. Yasaların izin verdiği azami
          ölçüde, dolaylı zararlardan sorumlu tutulamaz.
        </p>
      </Section>
      <Section title="8. Fesih">
        <p>
          Hesabınızı istediğiniz zaman kapatabilirsiniz. Kullanım koşullarının ihlali halinde (Madde 3'teki
          takım üyeliği kuralı dahil) hizmete erişiminiz askıya alınabilir veya sonlandırılabilir.
        </p>
      </Section>
      <Section title="9. İletişim">
        <p>
          Sorularınız için: <a href="mailto:info@binerly.com" style={{ color: "#185fa5" }}>info@binerly.com</a>
        </p>
      </Section>
    </LegalLayout>
  );
}
