import {
  formatTL,
  getRangeBounds,
  inRange,
  formatFileSize,
  SELF_BOOKED_SOURCES,
  MAX_TEAM_SIZE,
  WEEKDAYS,
  isFullNameValid,
  parseAppointmentDateTime,
} from "./shared";
import {
  STAGES,
  stageLabel,
  isAppointmentSector,
  dealWordKind,
  supportsSelfBooking,
  bookingModel,
  supportsGroupClasses,
  supportsSessionPackages,
} from "./Sectors";
import { TERMINAL_STATUSES, STATUSES, getSlaStatus } from "./Support";
import { DEAL_WORD_FORMS } from "./staticData";
import { expandExpenseOccurrences } from "./Finance";
// KOBİ'nin kendisi için "? Yardım" panelindeki statik içerik — bilinçli
// olarak küçük tutuluyor: yeni bir DB tablosu/yönetim ekranı YOK, sadece
// nadiren değişen temel "nasıl yapılır" konularını kapsıyor. Amaç, ürün
// hızla değişirken bakım yükü yaratacak kapsamlı bir dokümantasyon merkezi
// değil, düşük bakımlı bir başvuru kaynağı olmak.
export const HELP_TOPICS = [
  // Müşteriler & Kayıtlar
  {
    category: "Müşteriler & Kayıtlar",
    q: "Yeni müşteri nasıl eklerim?",
    a: 'Müşteriler sekmesine gidip "+ Müşteri ekle" butonuna tıklayın. Ad/firma adı zorunlu, geri kalan alanlar opsiyoneldir.',
  },
  {
    category: "Müşteriler & Kayıtlar",
    q: "Teklif/randevu/üyelik nasıl oluşturulur?",
    a: 'Sol menüdeki Teklifler/Randevular/Üyelikler/Rezervasyonlar sekmesinden (sektörünüze göre adı değişir) "+ Ekle" ile yeni bir kayıt açın; önce bir müşteri seçilmiş olmalı. Aşama değiştikçe kayıt otomatik ilerler.',
  },
  {
    category: "Müşteriler & Kayıtlar",
    q: "Müşteri Kazanma Linki nedir?",
    a: "Ayarlar → Müşteri Kazanma Linki'nden aldığınız linki (veya QR kodunu) paylaşırsanız, müşteri kendi bilgilerini doldurup sisteminize düşer - elle veri girmenize gerek kalmaz.",
  },
  {
    category: "Müşteriler & Kayıtlar",
    q: "Yanlışlıkla sildiğim bir kaydı nasıl geri getiririm?",
    a: 'Ayarlar → Çöp Kutusu ve Geçmiş\'ten silinen müşteri/teklif/tahsilat kayıtlarını geri yükleyebilirsiniz. Hiçbir şey otomatik olarak kalıcı silinmez - işletme sahibi isterse aynı ekrandan bir kaydı elle "Kalıcı Olarak Sil" ile geri dönüşü olmayacak şekilde silebilir (tahsilat/işletme gideri kayıtları yasal saklama süresi nedeniyle bu seçenek dışındadır).',
  },
  {
    category: "Müşteriler & Kayıtlar",
    q: "Müşteri/teklif listemi Excel'e nasıl aktarırım?",
    a: 'İlgili sekmenin üstündeki "Dışa Aktar" butonuyla .xlsx dosyası indirebilirsiniz. Aynı ekranlarda "İçe Aktar" ile de toplu veri yükleyebilirsiniz (CSV/Excel/vCard).',
  },
  {
    category: "Müşteriler & Kayıtlar",
    q: "Word tablosundaki veya WhatsApp kişilerimdeki müşterileri nasıl aktarırım?",
    a: "Word tablonuzu Excel'e kopyalayıp CSV olarak kaydedin, sonra İçe Aktar'dan yükleyin. WhatsApp'ın kendi kişi dışa aktarma özelliği yok - telefonunuzun Kişiler uygulamasından vCard (.vcf) alıp İçe Aktar'a yükleyebilirsiniz.",
  },

  // Ödeme & Faturalama
  {
    category: "Ödeme & Faturalama",
    q: "Müşteriden online ödeme nasıl alınır?",
    a: 'Ayarlar → Ödeme Bağlantısı\'ndan iyzico veya PayTR hesabınızı bağlayın. Sonra bir kaydı düzenlerken "Müşteri ödemesi" alanından onay linkine ödeme ekleyebilirsiniz.',
  },
  {
    category: "Ödeme & Faturalama",
    q: "Aldığım bir ödemeyi iade etmem gerekirse ne yapmalıyım?",
    a: "Finans sekmesinden ilgili tahsilatı bulup iade işlemini başlatın - gerçek iyzico/PayTR iade API'si çağrılır, tutar müşterinin kartına geri döner, sisteminizde de otomatik düşülür.",
  },
  {
    category: "Ödeme & Faturalama",
    q: "Paraşüt'e fatura nasıl aktarırım?",
    a: 'Teklifler/Randevular/Üyelikler/Rezervasyonlar sekmesinde "Kazanıldı" durumundaki kayıtlardan seçtiklerinizi "Paraşüt\'e Aktar"dan indirin - Paraşüt\'ün toplu fatura şablonuyla birebir uyumlu bir Excel dosyası iner, doğrudan içe aktarabilirsiniz.',
  },
  {
    category: "Ödeme & Faturalama",
    q: "KDV oranını nasıl değiştiririm?",
    a: "Her teklifte ayrı ayrı seçebilirsiniz; varsayılan oranı Ayarlar → İşletme Bilgileri'nden belirleyebilirsiniz, yeni tekliflerde otomatik gelir.",
  },

  // Finans
  {
    category: "Finans",
    q: "Gelir-Gider Defteri ne işe yarar?",
    a: "Finans sekmesindeki bu liste, tüm tahsilatlarınızı ve giderlerinizi (kazanılan tekliflerin maliyeti dahil) tek yerde, kategoriye göre gösterir - net kâr/zarar durumunuzu anlık görürsünüz.",
  },
  {
    category: "Finans",
    q: "KDV Özet Raporu nasıl okunur?",
    a: "Seçtiğiniz ay için Satış KDV'si (tahsil ettiğiniz) ile Alış KDV'si (ödediğiniz giderler) karşılaştırılır, Ödenecek/Devreden KDV otomatik hesaplanır. Muhasebecinize göstermeden önce kendi kayıtlarınızla karşılaştırmanız önerilir.",
  },
  {
    category: "Finans",
    q: "Her ay tekrar eden bir gideri (kira, abonelik) her seferinde elden mi gireceğim?",
    a: 'Hayır - gider eklerken "Tekrarlayan" seçip günlük/aylık/yıllık aralığını belirtin, sistem her dönem için otomatik hesaplar, yeniden girmenize gerek kalmaz.',
  },

  // Randevu & Program
  {
    category: "Randevu & Program",
    q: "Randevularım sekmesi ne işe yarar?",
    a: "Randevu alınabilen sektörlerde, Bugün/Bu Hafta/Bu Ay filtreleriyle tüm randevularınızı saatine göre sıralı tek listede gösterir - arama ve aşama filtresi de var.",
    visibleIf: (sector) => supportsSelfBooking(sector),
  },
  {
    category: "Randevu & Program",
    q: "Müşterilerimin portaldan randevu alabileceği saatleri nasıl belirlerim?",
    a: "Ayarlar → Müsaitlik Saatleri'nden hangi gün hangi saatler arası, kaçar dakikalık aralıklarla randevu verebileceğinizi tanımlarsınız - müşteri portalı sadece bu saatleri boş gösterir.",
    visibleIf: (sector) => bookingModel(sector) === "slot",
  },
  {
    category: "Randevu & Program",
    q: "Randevu hatırlatması otomatik mi gidiyor?",
    a: "Evet, randevu saatinden yaklaşık 2 saat önce müşteriye otomatik hatırlatma e-postası gider. Ayarlar → İşletme Bilgileri'nden bu özelliği kapatabilirsiniz.",
    visibleIf: (sector) => supportsSelfBooking(sector),
  },
  {
    category: "Randevu & Program",
    q: "Oda Stoku ne işe yarar?",
    a: 'Ayarlar → Oda Stoku\'ndan her oda tipinden kaç adet olduğunuzu belirlersiniz - müşteri portalı, seçilen giriş/çıkış tarihi aralığında o tipte zaten stok kadar rezervasyon varsa "müsait değil" gösterir. Henüz eklenmemiş bir oda tipinden rezervasyon alınamaz.',
    visibleIf: (sector) => bookingModel(sector) === "inventory",
  },
  {
    category: "Randevu & Program",
    q: "Aynı oda tipine aynı tarihler için birden fazla rezervasyon girebilir miyim?",
    a: "Evet - Oda Stoku'nda tanımladığınız adet kadar, aynı tarih aralığında çakışan rezervasyon kabul edilir; adet dolduğunda yeni bir kayıt eklemeye çalışırsanız net bir uyarıyla engellenir.",
    visibleIf: (sector) => bookingModel(sector) === "inventory",
  },
  {
    category: "Randevu & Program",
    q: 'Bir randevuyu "gelmedi" mi "iptal" mi olarak işaretlemeliyim?',
    a: 'Aşamayı "kaybedildi"ye çektiğinizde size sorulur - müşteri habersiz gelmediyse "Randevuya gelmedi", önceden haber verip iptal ettiyse "İptal etti" seçin. Bu ayrım Pano\'daki "Gelmeme oranı" metriğini doğru hesaplamak için önemlidir. Ayrıca belgelenebilir acil durumlarda "Mücbir sebep" (ceza/sayaç işletilmez) ve siz/personeliniz kaynaklı iptallerde "İşletme iptal etti" (geç iptal ediyorsanız müşteriye otomatik telafi hakkı tanınır) seçeneklerini kullanabilirsiniz.',
    visibleIf: (sector) => isAppointmentSector(sector),
  },
  {
    category: "Randevu & Program",
    q: "Grup dersi / haftalık program nasıl oluştururum?",
    a: 'Spor Merkezi ve Eğitim/Kurs Merkezi sektörlerinde "Dersler" sekmesinden haftalık program, kapasite ve eğitmen bilgisiyle ders tanımlayabilirsiniz - müşteriler portaldan kendi kaydolup iptal edebilir.',
    visibleIf: (sector) => supportsGroupClasses(sector),
  },

  // Destek & Bilgi Bankası
  {
    category: "Destek & Bilgi Bankası",
    q: "Müşteri destek talebini nasıl açar?",
    a: "Müşteri kendi portalından (Müşteri Kazanma Linki veya davet ettiğiniz portal linkiyle giriş yaparak) yeni talep oluşturur; siz Destek sekmesinden yanıtlarsınız.",
  },
  {
    category: "Destek & Bilgi Bankası",
    q: "SLA (yanıt süresi hedefi) nasıl hesaplanıyor?",
    a: "Her destek talebinin önceliğine (düşük/orta/yüksek/acil) göre otomatik bir hedef yanıt süresi belirlenir, süre yaklaşınca/aşılınca talep listesinde ve Pano'da uyarı çıkar.",
  },
  {
    category: "Destek & Bilgi Bankası",
    q: "Destek talebine müşterinin görmemesi gereken bir not nasıl eklerim?",
    a: 'Yanıt yazarken "Dahili not" kutucuğunu işaretleyin - bu not sadece siz ve takımınız tarafından görülür, müşteri portalında hiç görünmez.',
  },
  {
    category: "Destek & Bilgi Bankası",
    q: "Bilgi Bankası'na nasıl makale eklerim?",
    a: 'Destek → Bilgi Bankası\'ndan "+ Makale ekle" ile kendi yazınızı ekleyebilir, ya da "Örnek şablonlar"dan (Kargo, Fatura, İade, Destek takibi vb.) hazır bir taslağı tek tıkla açıp düzenleyebilirsiniz.',
  },

  // Takım
  {
    category: "Takım",
    q: "Takıma nasıl üye davet ederim?",
    a: "Ayarlar → Takım'dan e-posta ile davet gönderebilirsiniz. Davet edilen kişi hesabı kabul edince tüm müşteri/kayıt verilerinizi görüp düzenleyebilir.",
  },
  {
    category: "Takım",
    q: "Takım üyesinin yetkilerini sınırlayabilir miyim?",
    a: "Şu an tek ayrım var: bir üyeye İşletme Bilgileri/Sektör gibi ayarları düzenleme izni verip vermeyeceğinizi Takım ekranından belirleyebilirsiniz. Müşteri/teklif verisi tüm üyelere paylaşılı görünür.",
  },

  // Bildirimler & İletişim
  {
    category: "Bildirimler & İletişim",
    q: "Müşterilerim kendi bilgilerini/randevularını nasıl görebilir?",
    a: "Ayarlar → Müşteri Kazanma Linki'nden paylaşacağınız linkle müşteriniz kendi portalına kaydolup tekliflerini/randevularını görebilir, destek talebi açabilir.",
  },
  {
    category: "Bildirimler & İletişim",
    q: "Anlık bildirim (push) nasıl açarım?",
    a: "Ayarlar → Görünüm, Bildirimler & Hesap'tan bildirimleri açabilirsiniz. iPhone'da bildirim alabilmek için önce siteyi Ana Ekrana eklemeniz gerekir (Safari paylaş menüsü → Ana Ekrana Ekle).",
  },
  {
    category: "Bildirimler & İletişim",
    q: "Müşterilerime toplu kampanya e-postası nasıl gönderirim?",
    a: 'Müşteriler sekmesindeki "Kampanya Gönder" butonundan alıcıları seçip mesajınızı yazabilirsiniz. Türkiye\'de ticari elektronik ileti göndermek için müşterilerinizden İYS/açık onay almış olmanız yasal olarak sizin sorumluluğunuzdadır - göndermeden önce onay kutusunu işaretlemeniz istenir.',
  },

  // Ayarlar & Hesap
  {
    category: "Ayarlar & Hesap",
    q: "Sektörümü nasıl değiştiririm?",
    a: "Ayarlar → Sektör & Özel Alanlar'dan istediğiniz zaman değiştirebilirsiniz - aşama isimleri, önerilen etiketler ve özel alanlar otomatik güncellenir. Daha önce girilmiş değerler kaybolmaz, sadece görünürlükleri değişir.",
  },
  {
    category: "Ayarlar & Hesap",
    q: "Açık/koyu temayı nasıl değiştiririm?",
    a: 'Ayarlar → Görünüm, Bildirimler & Hesap\'tan "Açık"/"Koyu" arasında seçim yapabilirsiniz.',
  },
  {
    category: "Ayarlar & Hesap",
    q: "Şifremi nasıl değiştiririm?",
    a: 'Ayarlar → Görünüm, Bildirimler & Hesap\'tan, mevcut şifrenizi doğrulayarak yenisini belirleyebilirsiniz. Şifrenizi unuttuysanız giriş ekranındaki "Şifremi unuttum" linkini kullanın.',
  },
  {
    category: "Ayarlar & Hesap",
    q: "Hesabımı tamamen silebilir miyim?",
    a: 'Ayarlar → Görünüm, Bildirimler & Hesap\'taki "Hesabımı silmek istiyorum" seçeneği destek ekibine e-posta gönderir - takım sahipliği gibi durumlar elle kontrol gerektirdiği için bu işlem otomatik yapılmıyor.',
  },
  {
    category: "Ayarlar & Hesap",
    q: "Teklif onay linkini müşteriyle nasıl paylaşırım?",
    a: "İlgili kaydı açıp onay linkini kopyalayın, müşteriye WhatsApp/e-posta ile gönderin. Müşteri linke tıklayıp onaylayabilir, ayarladıysanız ödeme de yapabilir.",
  },
  {
    category: "Ayarlar & Hesap",
    q: "Örnek verilerle nasıl başlarım?",
    a: 'Pano boşken görünen "Örnek verilerle başla" butonuyla birkaç örnek müşteri ve kayıt oluşturabilirsiniz - istediğiniz zaman silinebilir, gerçek verilerinizi etkilemez.',
  },

  {
    category: "Müşteriler & Kayıtlar",
    q: "Müşteri kartına görüşme/telefon notu nasıl eklerim?",
    a: 'Müşteri kartını açıp "İletişim geçmişi" bölümünden Not/Telefon görüşmesi/Toplantı/E-posta türünü seçip kısa bir açıklama yazabilirsiniz - bu kayıtlar zaman sırasına göre listelenir.',
  },
  {
    category: "Müşteriler & Kayıtlar",
    q: "Müşteri veya teklif kaydına dosya (sözleşme, fotoğraf vb.) nasıl eklerim?",
    a: 'Müşteri kartını veya teklif formunu açıp "Dosyalar" bölümündeki "+ Dosya Ekle"ye tıklayın - dosya en fazla 10 MB olabilir, istediğiniz zaman indirebilir veya silebilirsiniz (silinen dosya da çöp kutusuna düşer).',
  },
  {
    category: "Müşteriler & Kayıtlar",
    q: "Bir teklife birden fazla ürün/hizmet kalemi (kalem kalem fiyat) nasıl eklerim?",
    a: 'Teklif formundaki "Kalemler" bölümünden "+ Kalem ekle" ile istediğiniz kadar açıklama/adet/birim fiyat satırı ekleyebilirsiniz - Tutar alanı bunların toplamına göre otomatik hesaplanır, hiç kalem eklemezseniz Tutar\'ı yine elle girebilirsiniz.',
  },
  {
    category: "Müşteriler & Kayıtlar",
    q: "Teklif kalemlerini Fiyat Listesi'nden nasıl hızlıca eklerim?",
    a: 'Kalemler bölümündeki "Fiyat listesinden kalem ekle…" menüsünden bir ürün/hizmet seçtiğinizde açıklama ve birim fiyat otomatik dolan yeni bir satır eklenir; Fiyat Listesi sekmesinde kayıtlı olmanız yeterli.',
  },
  {
    category: "Müşteriler & Kayıtlar",
    q: 'Teklif formundaki "Sorumlu" ataması ne işe yarar?',
    a: 'Bir takım üyesi seçebilirsiniz - kapanan (kazanılan veya kaybedilen) kayıtlar Pano\'daki "Personel Performansı" bölümünde o kişinin altında ve kazanma oranına dahil olarak sayılır; atama yapılmazsa "Atanmamış" grubuna düşer.',
  },
  {
    category: "Müşteriler & Kayıtlar",
    q: "Müşteri listemi nasıl filtreleyip ararım?",
    a: "Müşteriler sekmesindeki arama kutusu ad/sektör/bölge/adres/telefon/e-postada arar; ayrıca Kurumsal/Bireysel, sektör, en yeni/en eski sıralama ve tarih aralığı filtrelerini de kullanabilirsiniz.",
  },
  {
    category: "Müşteriler & Kayıtlar",
    q: "Not veya hatırlatmaları sesle nasıl yazabilirim?",
    a: "Not/hatırlatma gibi metin alanlarının yanındaki mikrofon simgesine tıklayıp konuşarak yazdırabilirsiniz - bu özellik Chrome/Edge'de çalışır, Firefox/Safari'de görünmez.",
  },
  {
    category: "Müşteriler & Kayıtlar",
    q: 'Müşteriyi "Kurumsal" veya "Bireysel" olarak işaretlemek neyi değiştirir?',
    a: 'Formda hangi alanların (örn. firma unvanı) göründüğünü ve teklif/randevu aşamalarının hangi dille gösterileceğini belirler; bazı özel alanlar da "Kime" ayarına göre sadece kurumsal veya sadece bireysel müşterilerde görünür.',
  },
  {
    category: "Müşteriler & Kayıtlar",
    q: "Cari Hesap Ekstresi müşteri kartında ne gösterir?",
    a: "Kazanılmış tekliflerden doğan toplam borcu, toplam tahsilatı ve güncel bakiyeyi; altında da her borç/tahsilat hareketini tarih sırasıyla ve o andaki bakiyeyle listeler.",
  },
  {
    category: "Müşteriler & Kayıtlar",
    q: 'Teklif formundaki "Gider" alanı ne işe yarar?',
    a: "O teklifin size maliyetini (örn. malzeme, alt yüklenici) girmenizi sağlar - kayıt kazanıldığında bu tutar Finans → Gelir-Gider Defteri'nde otomatik gider olarak sayılır, ayrıca Finans sekmesinden de düzenlenebilir.",
  },
  {
    category: "Müşteriler & Kayıtlar",
    q: "Kazanılmış bir teklifin tutarını veya KDV oranını sonradan değiştirirsem ne olur?",
    a: "Değişiklik geriye dönük işler - o teklifin kazanıldığı ayın KDV Özet Raporu'nu da (o ay için zaten beyanname vermiş olsanız bile) yeniden hesaplar; formda bu durumda bir uyarı gösterilir.",
  },
  {
    category: "Müşteriler & Kayıtlar",
    q: "Müşteri kartındaki WhatsApp simgesi ne yapar?",
    a: "Müşterinin kayıtlı telefon numarasıyla doğrudan WhatsApp Web/uygulamasında yeni bir sohbet penceresi açar, numarayı elle aramanıza gerek kalmaz.",
  },

  {
    category: "Ödeme & Faturalama",
    q: "iyzico/PayTR bağlarken hangi bilgileri girmem gerekiyor?",
    a: "iyzico için API Key ve Secret Key; PayTR için Mağaza No (Merchant ID), Merchant Key ve Merchant Salt gerekir - bu bilgileri sağlayıcının kendi panelinden alıp Ayarlar → Ödeme Bağlantısı'na girersiniz.",
  },
  {
    category: "Ödeme & Faturalama",
    q: "Aynı anda hem iyzico hem PayTR'yi aktif edebilir miyim?",
    a: "Hayır, aynı anda yalnızca bir sağlayıcı aktif olabilir - yeni birini bağlarsanız öncekinin yerini alır.",
  },
  {
    category: "Ödeme & Faturalama",
    q: "Ödeme bağlantımı canlıya almadan önce nasıl test ederim?",
    a: 'Ödeme Bağlantısı formundaki "Test modu (Sandbox)" kutusunu işaretleyip sağlayıcınızın test API bilgileriyle bağlayın; hazır olduğunuzda aynı formdan gerçek anahtarlarla güncelleyip kutuyu kaldırabilirsiniz.',
  },
  {
    category: "Ödeme & Faturalama",
    q: "Taksitli ödeme nasıl açarım?",
    a: 'Ödeme Bağlantısı formundaki "Taksit" alanından azami taksit sayısını (2, 3, 6, 9 veya 12) seçin - bu sadece bir üst sınırdır, taksitin gerçekten sunulması sağlayıcı hesabınızda taksitli satışın açık olmasına ve müşterinin kartına bağlıdır.',
  },
  {
    category: "Ödeme & Faturalama",
    q: "PayTR bağlarken ekstra bir ayar yapmam gerekiyor mu?",
    a: "Evet - PayTR panelinizde \"Bildirim URL'i\" olarak Binerly'nin size gösterdiği adresi bir kez girmeniz gerekir, aksi halde ödemeler onaylanmaz.",
  },
  {
    category: "Ödeme & Faturalama",
    q: 'Onay linkindeki "Sadece onaylasın", "Onaylasın + isterse ödesin" ve "Onaylamak için ödemesi şart" seçenekleri ne fark eder?',
    a: "Bu üç seçenek müşterinin onay ve ödeme adımlarını nasıl yaşayacağını belirler: birincisinde ödeme adımı hiç yok, ikincisinde ikisi bağımsız sunulur, üçüncüsünde ödeme tamamlanmadan onay da gerçekleşmez.",
  },
  {
    category: "Ödeme & Faturalama",
    q: "Müşterinin kart bilgileri Binerly sunucularından geçiyor mu?",
    a: "Hayır - kart bilgisi hiçbir zaman Binerly sunucularından geçmez, müşteri doğrudan iyzico/PayTR'nin kendi güvenli ödeme sayfasına yönlendirilir.",
  },
  {
    category: "Ödeme & Faturalama",
    q: "Online alınan bir ödemeyi iade edersem sistemimde ne değişir?",
    a: "Finans → Gelir-Gider Defteri'nde ilgili tahsilatın yanındaki \"İade Et\"e tıkladığınızda gerçek iyzico/PayTR iade API'si çağrılır, tutar müşterinin bakiyesinden otomatik düşülür ve deftere iade olarak işlenir.",
  },
  {
    category: "Ödeme & Faturalama",
    q: "Paraşüt'e aktarırken tüm kazanılan teklifleri mi seçmem gerekiyor?",
    a: 'Hayır - "Paraşüt\'e Aktar" ekranında müşteri/başlık arama, min/max tutar, ödeme durumu ve tarih aralığı filtreleriyle sadece istediğiniz teklifleri seçip aktarabilirsiniz.',
  },
  {
    category: "Ödeme & Faturalama",
    q: "Varsayılan KDV oranını değiştirdim, daha önce oluşturduğum tekliflerin oranı da değişir mi?",
    a: "Hayır - Ayarlar → İşletme Bilgileri'ndeki varsayılan KDV oranı sadece o andan sonra oluşturacağınız yeni tekliflere uygulanır, mevcut tekliflerin kendi kaydettiği oran aynen kalır.",
  },
  {
    category: "Ödeme & Faturalama",
    q: "Onay linkinden ödeme tercihini her teklifte ayrı mı seçmem gerekiyor?",
    a: "Onay linkini her kopyaladığınızda son seçtiğiniz ödeme tercihi otomatik ön işaretli gelir, isterseniz o teklife özel değiştirebilirsiniz.",
  },

  {
    category: "Finans",
    q: "KDV Özet Raporu resmi beyanname yerine geçer mi?",
    a: "Hayır - bu rapor sadece kendi ön hazırlığınız içindir, muhasebecinizin/SMMM'nizin resmi beyanname veya e-defterinin yerini tutmaz; göndermeden önce kendi kayıtlarınızla karşılaştırmanız önerilir.",
  },
  {
    category: "Finans",
    q: "Giderime KDV oranı girmezsem ne olur?",
    a: "O gider, KDV Özet Raporu'ndaki \"Alış KDV'si\" hesabına dahil edilmez - rapor ekranında kaç giderin bu şekilde dışarıda kaldığı ayrıca gösterilir.",
  },
  {
    category: "Finans",
    q: "Tekrarlayan bir gideri silersem geçmiş aylardaki kayıtlar da silinir mi?",
    a: "Evet - tekrarlayan gider tek bir kayıttır, gördüğünüz her tekrar aynı kaydın otomatik kopyasıdır; birini sildiğinizde geçmiş ve gelecekteki TÜM tekrarlar birlikte çöp kutusuna taşınır.",
  },
  {
    category: "Finans",
    q: 'Toplam Gider ile "Kategoriye göre gider" listesi neden birbirini tutmuyor?',
    a: '"Kategoriye göre gider" sadece elle eklediğiniz işletme giderlerini toplar; Toplam Gider\'e ayrıca kazanılan tekliflerin "Gider" tutarları da eklendiği için iki rakam farklı çıkabilir.',
  },
  {
    category: "Finans",
    q: "Gelir-Gider Defteri'nde bir tahsilatı düzenleyebilir miyim?",
    a: 'Elle girilmiş (online olmayan) tahsilatların tutarını, tarihini ve notunu düzenleyebilir veya silebilirsiniz; online (iyzico/PayTR) tahsilatlarda düzenleme yerine "İade Et" seçeneği çıkar.',
  },
  {
    category: "Finans",
    q: 'Finans sekmesindeki "Tahsilat / Cari Hesap" görünümü ne işe yarar?',
    a: "Kazanılmış teklifi olan her müşterinin toplam borcunu, tahsil edilenini ve kalan bakiyesini listeler; bir müşteriyi genişletip üzerindeki tekliften doğrudan yeni tahsilat ekleyebilirsiniz.",
  },
  {
    category: "Finans",
    q: "Yeni bir tahsilatı hangi teklife/müşteriye ekleyeceğimi nasıl seçerim?",
    a: 'Finans → Tahsilat / Cari Hesap\'taki "Yeni Tahsilat" kutusundan önce müşteriyi, sonra o müşterinin kazanılmış tekliflerinden birini seçip "Devam"a basarsınız - tahsilat formu o teklif için açılır.',
  },
  {
    category: "Finans",
    q: "Gider eklerken saat de girebilir miyim?",
    a: "Evet, tarih zorunlu olmakla birlikte saat alanı opsiyoneldir - saat girerseniz gider listesinde tarih yanında saat de gösterilir.",
  },
  {
    category: "Finans",
    q: "KDV Özet Raporu'nda görüntülediğim ayı nasıl değiştiririm?",
    a: "Rapor ekranının üstündeki ay seçiciden istediğiniz ay/yıl kombinasyonunu seçebilirsiniz, rapor her zaman o anki güncel verilerle yeniden hesaplanır.",
  },
  {
    category: "Finans",
    q: "Gider kategorisi listede yoksa ne yapmalıyım?",
    a: 'Kategori olarak "Diğer"i seçip açılan kutuya kendi kategori adınızı yazabilirsiniz, bu isim o gider için kaydedilir ve kategori listelerinde görünür.',
  },
  {
    category: "Finans",
    q: 'Bir teklifin "Gider"ini doğrudan Finans sekmesinden düzenleyebilir miyim?',
    a: "Evet - Gelir-Gider Defteri'nde o kaydın yanındaki kalem işaretine tıklayıp tutarı doğrudan güncelleyebilirsiniz; bu, teklif formundaki Gider alanıyla aynı değeri paylaşır.",
  },

  {
    category: "Randevu & Program",
    q: "Ajanda sekmesi ne işe yarar?",
    a: "Tüm sektörlerde hatırlatmalarınızı, randevu alanı olan kayıtlarınızı ve grup derslerinizi tek bir ay/hafta takviminde birleştirir - bir güne tıklayınca o günün tüm etkinlikleri altta listelenir.",
  },
  {
    category: "Randevu & Program",
    q: "Ajanda'da bir güne tıklayınca ne görürüm?",
    a: "O tarihteki hatırlatmaları, randevuları ve (varsa) grup derslerini saatine göre sıralı bir liste hâlinde görürsünüz; bir hatırlatma/randevuya tıklarsanız ilgili kayıt açılır, bir derse tıklarsanız o günün yoklama listesi açılır.",
  },
  {
    category: "Randevu & Program",
    q: "Yoklama (Geldi/Gelmedi) nasıl alınır?",
    a: "Ajanda'da geçmiş veya bugüne ait bir ders gününe tıklayıp açılan listede her öğrenci/üye için Geldi ya da Gelmedi işaretlersiniz; henüz gerçekleşmemiş bir ders günü için yoklama alınamaz.",
    visibleIf: (sector) => supportsGroupClasses(sector),
  },
  {
    category: "Randevu & Program",
    q: 'Müşteri randevusunu kendisi iptal ederse bu "Gelmedi" olarak mı sayılır?',
    a: 'Hayır - müşterinin kendi portalından yaptığı iptal "İptal etti" (veya ayarladığınız geç sayılma penceresi içindeyse "Geç iptal etti") olarak işaretlenir, "Randevuya gelmedi" sadece siz elle işaretlediğinizde (habersiz gelmeme durumunda) kullanılır.',
    visibleIf: (sector) => isAppointmentSector(sector),
  },
  {
    category: "Randevu & Program",
    q: "Müşteri randevusunu portaldan iptal ederken bir süre sınırı var mı?",
    a: 'Bunu tamamen siz belirlersiniz - Ayarlar → Müsaitlik Saatleri\'ndeki "Randevu iptal / gelmeme politikası"ndan hiç kısıtlama uygulamayabilir, belirli bir süreden az kala iptali tamamen kilitleyebilir ve/veya geç iptal + gelmeme sayısı bir eşiği geçince sonraki randevuda ödemeyi otomatik zorunlu hale getirebilirsiniz. Hiçbir şey ayarlamazsanız müşteri istediği an iptal edebilir.',
    visibleIf: (sector) => supportsSelfBooking(sector),
  },
  {
    category: "Randevu & Program",
    q: "Müşteri ders kaydını portaldan iptal ederken bir süre sınırı var mı?",
    a: 'Evet, varsayılan olarak ders saatine en az 2 saat kala portaldan iptal edilebilir; bunu Dersler sekmesindeki "Geç iptal / seans yakma politikası"ndan tamamen kendiniz özelleştirebilirsiniz (kilitleme süresi, geç iptal penceresi, kaçıncı geç iptalde seansın yanacağı).',
    visibleIf: (sector) => supportsGroupClasses(sector),
  },
  {
    category: "Randevu & Program",
    q: "Müşteri portaldan randevu alırken hizmet/fiyat seçebilir mi?",
    a: "Evet, Fiyat Listesi sekmesinde kayıtlı kalemleriniz varsa müşteri randevu formunda listeden seçebilir, açıklama ve tutar otomatik dolar; isterse yine elle de yazabilir.",
    visibleIf: (sector) => supportsSelfBooking(sector),
  },
  {
    category: "Randevu & Program",
    q: "Ücretsiz ilk görüşme/deneme randevusunu nasıl vurgularım?",
    a: 'Fiyat Listesi sekmesine fiyatı 0 TL olan bir kalem ekleyin (örn. "Ücretsiz İlk Görüşme") - Ayarlar → Randevu Alma Linki ile paylaştığınız widget\'ta bu otomatik olarak ayrı, vurgulu bir buton olarak öne çıkar, ekstra bir ayar gerekmez.',
    visibleIf: (sector) => supportsSelfBooking(sector) && bookingModel(sector) === "slot",
  },
  {
    category: "Randevu & Program",
    q: "Randevu Alma Linki'nden gelen müşteriden kapora alabilir miyim?",
    a: "Evet - Ayarlar → Müsaitlik Saatleri → Randevu iptal/gelmeme politikası'ndan \"Randevu Kaporası\"nı açıp sabit bir TL tutarı girersiniz (Ödeme Bağlantısı - iyzico veya PayTR - kurulu olmalı). Widget'tan randevu alan misafirden bu tutar (seçilen hizmetin fiyatını aşmayacak şekilde) online tahsil edilir, varsayılan kapalıdır.",
    visibleIf: (sector) => supportsSelfBooking(sector) && bookingModel(sector) === "slot",
  },
  {
    category: "Randevu & Program",
    q: "Bir grup dersine kaç kişi kaydolabilir, bunu nasıl sınırlarım?",
    a: 'Ders oluştururken girdiğiniz "Kapasite" değeri sınırı belirler; kapasite dolunca portalda ders "dolu" görünür ve yeni kayıt alınamaz. Kapasiteyi zaten kayıtlı kişi sayısının altına düşüremezsiniz.',
    visibleIf: (sector) => supportsGroupClasses(sector),
  },
  {
    category: "Randevu & Program",
    q: "Müşterinin bir derse kaydolabilmesi için aktif üyeliği/kaydı olması gerekir mi?",
    a: "Evet - sadece kazanılmış ve süresi (varsa) dolmamış bir kaydı olan müşteriler derse kaydolabilir; uygun olmayan müşteriler için portalda kısa bir uyarı metni gösterilir.",
    visibleIf: (sector) => supportsGroupClasses(sector),
  },
  {
    category: "Randevu & Program",
    q: "Randevu/görüşme tarihi alanı nereden geliyor, ben mi ekliyorum?",
    a: 'Bu, Sektör & Özel Alanlar\'da "Tarih & Saat" tipinde tanımlanan bir özel alandır - randevu sektörlerinde hazır gelir, diğer sektörlerde isterseniz kendiniz ekleyebilirsiniz.',
    visibleIf: (sector) => supportsSelfBooking(sector),
  },
  {
    category: "Randevu & Program",
    q: "Aynı saate iki randevu/görüşme girebilir miyim?",
    a: "Hayır - Tarih & Saat özel alanınız varsa ve aynı tarih/saatte başka bir aktif kayıt bulunursa, sistem kaydı engeller ve önce bu çakışmayı çözmeniz gerekir.",
    visibleIf: (sector) => supportsSelfBooking(sector),
  },
  {
    category: "Randevu & Program",
    q: "Haftalık ders programını nasıl kurarım?",
    a: "Dersler sekmesinden her ders için gün, saat, süre, eğitmen ve kapasite girip kaydedersiniz - program haftadan haftaya aynı şekilde tekrarlar, tarihe özel tek seferlik ders oluşturma yoktur.",
    visibleIf: (sector) => supportsGroupClasses(sector),
  },
  {
    category: "Randevu & Program",
    q: "Müsaitlik Saatleri'nde öğle arası gibi bir boşluk tanımlayabilir miyim?",
    a: 'Evet - her gün için başlangıç/bitiş saati ile kaçar dakikalık aralıklarla randevu verileceğini belirlersiniz; "Öğle arası var" kutusunu işaretleyip ara saatlerini girerseniz sistem günü otomatik olarak iki ayrı müsaitlik bloğuna böler.',
    visibleIf: (sector) => bookingModel(sector) === "slot",
  },
  {
    category: "Randevu & Program",
    q: "Randevu hatırlatma e-postasının içeriğini değiştirebilir miyim?",
    a: "Hayır, hatırlatma sabit bir şablonla otomatik gönderilir, içeriği uygulama içinden özelleştirilemez - sadece Ayarlar → İşletme Bilgileri'nden tamamen açıp kapatabilirsiniz.",
    visibleIf: (sector) => supportsSelfBooking(sector),
  },

  {
    category: "Destek & Bilgi Bankası",
    q: "SLA süresi dolmak üzereyken bunu nasıl anlarım?",
    a: "Talep listesinde ve talep detayında SLA rozeti \"Süre yaklaşıyor\" olur - bu, kalan sürenin hedefin son %20'lik dilimine girdiği andır (örn. Acil'de son 48 dakika, Yüksek'te son ~5 saat).",
  },
  {
    category: "Destek & Bilgi Bankası",
    q: 'Bir talebi "Çözüldü" mü "Kapatıldı" mı yapmalıyım?',
    a: 'Fark tamamen size kalmış - "Çözüldü" sorunun giderildiğini, "Kapatıldı" konunun artık takip edilmeyeceğini belirtmek için kullanılabilir; ikisi de SLA süresini durdurur ve e-posta bildirimleri açıksa müşteriye otomatik bilgilendirme gönderir.',
  },
  {
    category: "Destek & Bilgi Bankası",
    q: 'Destek talebine yazdığım "Giden (müşteriye)" mesaj müşteriye e-posta olarak gider mi?',
    a: "Hayır - bu sadece mesajı kaydeder, müşteri kendi hesabıyla Müşteri Portalı'na girdiğinde görür. Müşteriye gerçekten e-posta göndermek isterseniz, talep durumu değiştiğinde veya yanıt yazdığınızda zaten otomatik bir bilgilendirme e-postası gider.",
  },
  {
    category: "Destek & Bilgi Bankası",
    q: "Bilgi Bankası makalelerini müşterilerim görebilir mi?",
    a: "Hayır, Bilgi Bankası tamamen iç kaynak niteliğindedir - sadece siz ve ekibiniz görür, müşteri portalında hiç görünmez.",
  },
  {
    category: "Destek & Bilgi Bankası",
    q: "Destek taleplerimi/Bilgi Bankası makalelerimi Excel'e aktarabilir miyim?",
    a: 'Evet, her iki listenin üstündeki "Dışa aktar" butonuyla .xlsx dosyası indirebilir, "İçe aktar" ile de toplu talep/makale yükleyebilirsiniz.',
  },
  {
    category: "Destek & Bilgi Bankası",
    q: "Örnek Bilgi Bankası şablonları sektörüme göre mi geliyor?",
    a: "Evet - Destek → Bilgi Bankası'ndaki \"Örnek şablonlar\" listesi, Ayarlar'da seçtiğiniz sektöre göre (örn. Emlak'ta tapu/depozito, Spor Merkezi'nde üyelik dondurma) farklı hazır taslaklar gösterir.",
  },
  {
    category: "Destek & Bilgi Bankası",
    q: "Destek talebi mesaj geçmişindeki okunmamış mesaj rozeti nasıl temizlenir?",
    a: "Müşteriden gelen bir mesaja yanıt yazdığınızda o talebin okunmamış rozeti otomatik temizlenir; talebi sadece açıp bakmak rozeti kaldırmaz, yanıt vermeniz gerekir.",
  },
  {
    category: "Destek & Bilgi Bankası",
    q: "Öncelik (Acil/Yüksek/Orta/Düşük) hedef çözüm süresini nasıl belirliyor?",
    a: "Her öncelik seviyesinin sabit bir hedef süresi vardır: Acil 4 saat, Yüksek 24 saat, Orta 48 saat, Düşük 72 saat - süre talebin oluşturulduğu andan itibaren işler.",
  },
  {
    category: "Destek & Bilgi Bankası",
    q: "Talep listesini SLA durumuna göre filtreleyebilir miyim?",
    a: 'Evet, talep listesindeki SLA filtresinden "Gecikti", "Yaklaşıyor" veya "Zamanında" durumundaki talepleri ayrı ayrı görebilirsiniz; ayrıca durum, öncelik, arama ve tarih aralığı filtreleri de var.',
  },
  {
    category: "Destek & Bilgi Bankası",
    q: "Bir destek talebini silersem mesaj geçmişi de silinir mi?",
    a: "Talep çöp kutusuna taşınır ama mesaj geçmişi korunur - geri yüklediğinizde tüm mesajlar aynen yerinde durur.",
  },
  {
    category: "Destek & Bilgi Bankası",
    q: "Müşteri yeni bir destek talebi açtığında bunu nereden fark ederim?",
    a: 'Pano\'daki "Bugün ne yapmalıyım" listesinde SLA durumuna göre öne çıkar, ayrıca sol menüdeki Destek sekmesi üzerinde okunmamış mesaj sayısı rozet olarak görünür.',
  },

  {
    category: "Takım",
    q: "Takıma davet ettiğim bir kişiyi henüz kabul etmeden iptal edebilir miyim?",
    a: 'Evet, Ayarlar → Takım\'daki "Bekleyen davetler" listesinden ilgili davetin yanındaki "İptal et"e tıklayabilirsiniz - kişi daha sonra aynı e-postayla tekrar davet edilebilir.',
  },
  {
    category: "Takım",
    q: "Bir takım üyesini nasıl çıkarırım?",
    a: 'Ayarlar → Takım\'da ilgili üyenin yanındaki "Kaldır"a tıklarsınız - üye, müşteri/teklif/destek verilerinize erişimini anında kaybeder, tekrar erişmesi için yeniden davet edilmesi gerekir.',
  },
  {
    category: "Takım",
    q: "Bir takıma üye olarak eklendiğimde ne görürüm?",
    a: "Davet eden işletmenin tüm müşteri, teklif ve destek verisini görüp düzenleyebilirsiniz; isterseniz Ayarlar → Takım'dan o takımdan ayrılabilirsiniz.",
  },
  {
    category: "Takım",
    q: "Takım sahibi değilsem Ayarlar'da neler görürüm?",
    a: 'İşletme Bilgileri, Sektör & Özel Alanlar gibi ayarlar sadece "İşletme/sektör ayarlarını düzenleyebilir" izni size verilmişse görünür; Takım ekranında ise sadece hangi işletmenin üyesi olduğunuzu ve "Takımdan ayrıl" seçeneğini görürsünüz.',
  },
  {
    category: "Takım",
    q: "Bir takım üyesine sadece belirli sekmeleri mi açabilirim?",
    a: "Hayır, sekme bazlı bir kısıtlama yok - tek ayrım İşletme Bilgileri/Sektör gibi ayarları düzenleme izni; verilen izin dışında tüm müşteri/teklif/destek verisi her üyeye aynı şekilde açıktır.",
  },
  {
    category: "Takım",
    q: "Davet e-postası karşı tarafa otomatik mi gönderiliyor?",
    a: "Davet kaydını oluşturduğunuzda sistem otomatik bir bilgilendirme e-postası göndermeyi dener; e-posta gönderimi başarısız olsa bile davet geçerli kalır, kişi giriş yaptığında bekleyen daveti Binerly içinde görür.",
  },
  {
    category: "Takım",
    q: "Takım üyesi sayısında bir sınır var mı?",
    a: "Evet, işletme sahibi dahil en fazla 5 kişi (kabul edilmiş üyeler + bekleyen davetler) olabilir. Sınıra ulaştığınızda yeni davet göndermeden önce bekleyen bir daveti iptal etmeniz veya bir üyeyi kaldırmanız gerekir; daha fazla kullanıcıya ihtiyacınız varsa bize ulaşın.",
  },
  {
    category: "Takım",
    q: "Bir kişi aynı anda birden fazla işletmenin takımına üye olabilir mi?",
    a: "Evet - aynı e-posta adresiyle farklı işletmelerden davet alıp kabul edebilir, giriş yaptığında hangi işletmeyle çalışacağını seçer.",
  },
  {
    category: "Takım",
    q: "Bir üyeyi takımdan çıkarırsam, o üyenin sorumlu olduğu kayıtlara ne olur?",
    a: "Kayıtlar olduğu gibi kalır, sorumlu ataması değişmez - sadece o kişinin sisteme erişimi kesilir; kayıtları başka bir üyeye yeniden atamak isterseniz elle değiştirmeniz gerekir.",
  },
  {
    category: "Takım",
    q: "Tek seferde birden fazla kişiyi davet edebilir miyim?",
    a: "Hayır, davet ekranı tek bir e-posta adresi alır - birden fazla kişiyi davet etmek için işlemi her kişi için ayrı ayrı tekrarlamanız gerekir.",
  },
  {
    category: "Takım",
    q: "Bekleyen bir daveti tekrar gönderebilir miyim?",
    a: 'Ayrı bir "yeniden gönder" özelliği yok - davet e-postası ulaşmadıysa daveti iptal edip aynı e-postayla yeniden davet edebilirsiniz.',
  },
  {
    category: "Takım",
    q: "Takıma üye eklemek ek ücrete tabi mi?",
    a: "Hayır, 5 kullanıcıya kadar ek bir ücret alınmaz - abonelik ücretiniz sabittir. Daha büyük bir ekibiniz varsa bizimle iletişime geçip vaka bazlı bir çözüm bulabiliriz.",
  },
  {
    category: "Takım",
    q: "Bir üyenin e-postasını sonradan değiştirebilir miyim?",
    a: "Hayır, doğrudan bir düzenleme seçeneği yok - üyeyi çıkarıp doğru e-postayla yeniden davet etmeniz gerekir.",
  },
  {
    category: "Takım",
    q: "Bir üyenin ayarları düzenleme iznini sonradan kaldırabilir miyim?",
    a: "Evet, bu izin herhangi bir zamanda Takım ekranından açılıp kapatılabilir - sadece davet anında değil, istediğiniz zaman değiştirebilirsiniz.",
  },

  {
    category: "Bildirimler & İletişim",
    q: "Bildirim çanı (üstteki zil simgesi) nasıl çalışır?",
    a: "Okunmamış bildirim sayısını rozet olarak gösterir; zile tıklayınca açılan panelde bildirimlerde arama yapabilir, sadece okunmamışları filtreleyebilir ve bir bildirime tıkladığınızda hem okundu işaretlenir hem de ilgili kayda yönlendirilirsiniz.",
  },
  {
    category: "Bildirimler & İletişim",
    q: "Müşteriyle talep açmadan direkt nasıl mesajlaşırım?",
    a: "Destek → Müşteri Mesajları'ndan (müşteri tarafında Portal → Mesajlar sekmesinden) konu/durum girmeden düz bir sohbet gibi yazışabilirsiniz - bu, resmi destek talebi akışından tamamen ayrı, karşılıklı mesajlar anlık düşer.",
  },
  {
    category: "Bildirimler & İletişim",
    q: "Bir bildirim geldiğinde takım üyelerim de haberdar olur mu?",
    a: "Evet - yeni bir destek talebi/mesaj, ödeme veya randevu gibi olaylarda işletme sahibiyle birlikte tüm takım üyeleri, bildirim izni verdikleri kendi cihazlarında aynı anda bildirim alır.",
  },
  {
    category: "Bildirimler & İletişim",
    q: "Müşteriye hangi durumlarda otomatik e-posta gider?",
    a: "Başlıca durumlar: bir teklif/randevu aşaması değiştiğinde, destek talebine yanıt verildiğinde veya durumu güncellendiğinde, bir ödeme alındığında ve randevu saatinden önce hatırlatma olarak. Bu e-postalar sistemin temel bildirim kanalıdır, tek tek kapatılamaz.",
  },
  {
    category: "Bildirimler & İletişim",
    q: "Müşteri portalında da bildirim çanı var mı?",
    a: "Evet, müşteri portalında da benzer bir bildirim çanı var - müşteri sadece kendi talep/mesaj/randevu bildirimlerini görür, sizin veya başka müşterilerin bildirimleri karışmaz.",
  },
  {
    category: "Bildirimler & İletişim",
    q: "WhatsApp/Instagram üzerinden gelen mesajları buradan yönetebilir miyim?",
    a: 'Henüz değil - üst menüdeki "Mesajlar" sekmesi bu özellik üzerinde çalışıldığını gösteriyor, şu an için sadece Destek → Müşteri Mesajları ve Portal → Mesajlar üzerinden mesajlaşabilirsiniz.',
  },
  {
    category: "Bildirimler & İletişim",
    q: "Destek talebine gelen bildirim e-postasına doğrudan yanıt yazarak cevap verebilir miyim?",
    a: "Hayır - gelen bildirim e-postası sadece bilgilendirme amaçlıdır, yanıtınızı Destek sekmesinden (veya Müşteri Mesajları'ndan) yazmanız gerekir; e-postaya cevap yazmanız sisteme işlenmez.",
  },
  {
    category: "Bildirimler & İletişim",
    q: "Bir push bildirimine tıklayınca beni nereye götürür?",
    a: "Bildirim türüne göre değişir - bir destek talebi/mesaj bildirimi doğrudan ilgili talebi/sohbeti açar, böylece aramanıza gerek kalmadan konuşmaya kaldığınız yerden devam edersiniz.",
  },
  {
    category: "Bildirimler & İletişim",
    q: "Bildirim iznini bir cihazda verdim, başka bir telefonda/tarayıcıda da otomatik gelir mi?",
    a: "Hayır - bildirim izni cihaz/tarayıcı bazlıdır, her yeni cihazda veya tarayıcıda (Ayarlar → Görünüm, Bildirimler & Hesap'tan) ayrıca izin vermeniz gerekir.",
  },
  {
    category: "Bildirimler & İletişim",
    q: "Bildirim panelinde en fazla kaç bildirim görünür?",
    a: "Panel en son 30 bildirimi gösterir; daha eski bir bildirimi aramanın bir yolu yok - önemli bir gelişmeyi kaçırdıysanız ilgili sekmeden (Talepler, Randevular vb.) doğrudan kontrol etmeniz gerekir.",
  },
  {
    category: "Bildirimler & İletişim",
    q: "Tüm bildirimlerimi tek seferde okundu olarak işaretleyebilir miyim?",
    a: 'Evet, bildirim panelindeki "Tümünü okundu işaretle" ile tek tıkla tüm okunmamış bildirimleri temizleyebilirsiniz.',
  },
  {
    category: "Bildirimler & İletişim",
    q: "Android telefonda veya bilgisayarda bildirim almak için de Ana Ekrana Eklemem gerekir mi?",
    a: "Hayır, bu adım sadece iPhone/Safari için gerekli - Android'de Chrome'dan, bilgisayarda ise herhangi bir modern tarayıcıdan siteyi kurmadan doğrudan bildirim izni verebilirsiniz.",
  },
  {
    category: "Bildirimler & İletişim",
    q: "Müşteri portalında bildirim izni açmak KOBİ tarafındakiyle aynı mı çalışır?",
    a: "Evet, aynı mantıkla çalışır - müşteri kendi portal hesabında bildirimleri açtığında, sadece kendi talep/randevu/mesaj güncellemeleri için bu cihaza push bildirimi gider.",
  },

  {
    category: "Ayarlar & Hesap",
    q: "Sistemin nasıl çalıştığını gösteren kısa turu tekrar izleyebilir miyim?",
    a: 'Evet, Ayarlar → "Turu Tekrar Başlat"a tıklayarak ilk girişte gördüğünüz kısa tanıtım turunu istediğiniz zaman baştan izleyebilirsiniz.',
  },
  {
    category: "Ayarlar & Hesap",
    q: 'Pano\'daki "Kuruluma başlayın" kutusunu nasıl kapatırım?',
    a: 'Kutunun sağ üstündeki "Gizle"ye tıklarsınız - bu tercih saklanır, adımları tamamlamasanız bile bir daha görünmez.',
  },
  {
    category: "Ayarlar & Hesap",
    q: "Bir özel alanı silersem, o alana daha önce girilmiş veriler ne olur?",
    a: "Hiçbir veri silinmez - alan sadece formlardan kaldırılır (gizlenir), müşteri/teklif kayıtlarındaki mevcut değerler veritabanında saklı kalmaya devam eder.",
  },
  {
    category: "Ayarlar & Hesap",
    q: "Özel alan eklerken sistemin kendi kullandığı bir isim girersem ne olur?",
    a: 'Sistemin iç kullandığı birkaç anahtar (örn. "Kaynak") özel alan adı olarak kullanılamaz - böyle bir isim girip kaydetmeye çalıştığınızda alan sessizce eklenmez; farklı bir isim kullanmanız yeterli.',
  },
  {
    category: "Ayarlar & Hesap",
    q: "Aynı isimde iki özel alan tanımlayabilir miyim?",
    a: 'Hayır, aynı "Nerede" (Müşteriler/Teklifler-Randevular-Üyelikler-Rezervasyonlar) için aynı isimden ikinci bir alan eklenemez - farklı bir isim seçmeniz veya mevcut alanı düzenlemeniz gerekir.',
  },
  {
    category: "Ayarlar & Hesap",
    q: "Oturumum neden belirli bir süre sonra kendiliğinden kapanıyor?",
    a: "Güvenlik için oturumlar, hiç hareketsiz kalmasanız bile girişten itibaren en fazla 24 saat sonra otomatik sonlanır; süre dolduğunda tekrar giriş yapmanız istenir.",
  },
  {
    category: "Ayarlar & Hesap",
    q: "Uygulamayı telefonuma nasıl kurarım (PWA)?",
    a: "Tarayıcınızın paylaş/menü seçeneğinden \"Ana Ekrana Ekle\"yi seçerek Binerly'i normal bir uygulama gibi ana ekranınıza ekleyebilirsiniz - özellikle iPhone'da anlık bildirim alabilmek için bu adım gereklidir.",
  },
  {
    category: "Ayarlar & Hesap",
    q: "Google hesabımla giriş yapabilir miyim?",
    a: "Evet, giriş ekranındaki Google seçeneğiyle e-posta/şifre girmeden tek tıkla giriş yapabilir veya kayıt olabilirsiniz - bu hem ana uygulamada hem Müşteri Portalı'nda mevcuttur.",
  },
  {
    category: "Ayarlar & Hesap",
    q: "Şirket logomu teklif PDF'lerinde nasıl gösteririm?",
    a: "Ayarlar → İşletme Bilgileri'nden logonuzu yükleyin - Teklif Şablonları'ndaki hazır tasarımlar ve oluşturacağınız özel şablonlar logo alanında otomatik olarak bu görseli kullanır.",
  },
  {
    category: "Ayarlar & Hesap",
    q: "Vergi numaramı nereye giriyorum, teklif PDF'inde otomatik çıkar mı?",
    a: 'Ayarlar → İşletme Bilgileri\'ne girdiğiniz vergi numarası, teklif PDF şablonlarındaki "Vergi no" satırında otomatik olarak görünür.',
  },
  {
    category: "Ayarlar & Hesap",
    q: "Ayarlar menüsünden hangi ekranlara ulaşabilirim?",
    a: "İşletme Bilgileri, Sektör & Özel Alanlar, Teklif Şablonları, Ödeme Bağlantısı, (randevu alınabilen sektörlerde) Müsaitlik Saatleri, Görünüm/Bildirimler/Hesap, Takım, Çöp Kutusu ve Geçmiş, Müşteri Kazanma Linki, Müşteri Portalı Linki ve Turu Tekrar Başlat - hepsi tek bir Ayarlar penceresinden açılır (Fiyat Listesi ve Stok & Malzeme artık kendi sekmelerinde).",
  },

  {
    category: "İçe/Dışa Aktarma",
    q: "İçe aktarırken dosyamdaki sütunları Binerly alanlarıyla nasıl eşleştiririm?",
    a: "Dosyanızı yükledikten sonra açılan eşleştirme ekranında her Binerly alanı için dosyanızdaki hangi sütunun kullanılacağını seçersiniz - sistem sütun başlıklarına bakarak bu eşleşmeyi olabildiğince otomatik önerir, siz kontrol edip düzeltirsiniz.",
  },
  {
    category: "İçe/Dışa Aktarma",
    q: "İçe aktarmadan önce hangi satırların hatalı olduğunu görebilir miyim?",
    a: "Evet, önizleme ekranında her satır tek tek gösterilir; hatalı (örn. eşleşen müşteri bulunamayan) satırlar işaretlenip seçilemez hâle gelir, olası yinelenen kayıtlar ise ayrı bir uyarıyla belirtilir.",
  },
  {
    category: "İçe/Dışa Aktarma",
    q: "İçe aktarırken bazı satırları hariç tutabilir miyim?",
    a: "Evet, önizleme ekranındaki kutucuğu işaretleyerek her satırı ayrı ayrı içe aktarıma dahil edebilir veya çıkarabilirsiniz; hatalı satırların kutucuğu zaten devre dışı gelir.",
  },
  {
    category: "İçe/Dışa Aktarma",
    q: "Destek taleplerini veya Bilgi Bankası makalelerini de toplu içe aktarabilir miyim?",
    a: 'Evet, Destek sekmesindeki Talepler ve Bilgi Bankası listelerinin her ikisinde de ayrı "İçe aktar" seçeneği vardır, aynı CSV/Excel akışını kullanır.',
  },
  {
    category: "İçe/Dışa Aktarma",
    q: "Ürün & Hizmet Fiyat Listemi toplu olarak yükleyebilir/indirebilir miyim?",
    a: 'Evet, Fiyat Listesi sekmesinde de ayrı "İçe aktar"/"Dışa aktar" butonları var - ürün/hizmet adı ve fiyat sütunlarıyla aynı CSV/Excel akışını kullanır.',
  },
  {
    category: "İçe/Dışa Aktarma",
    q: "Teklif/talep içe aktarırken müşteri sütununda tam adı mı yazmalıyım?",
    a: "Evet, müşteri sütunundaki isim sistemdeki müşteri adıyla (büyük/küçük harf hariç) birebir eşleşmelidir; eşleşme bulunamazsa veya birden fazla müşteri aynı isme sahipse o satır hatalı sayılır.",
  },
  {
    category: "İçe/Dışa Aktarma",
    q: "CSV dosyamda noktalı virgül mü virgül mü kullanmalıyım?",
    a: "İkisi de desteklenir - dosyanızın ilk satırına bakılarak hangi ayırıcının kullanıldığı otomatik tespit edilir, ayrıca bir ayar yapmanıza gerek yoktur.",
  },
  {
    category: "İçe/Dışa Aktarma",
    q: "vCard (.vcf) içe aktarırken hangi bilgiler okunur?",
    a: "Kişinin adı, telefonu ve e-postası (varsa) okunur - adı olmayan kartlar listeye hiç dahil edilmez, diğer vCard alanları (adres, doğum günü vb.) içe aktarılmaz.",
  },
  {
    category: "İçe/Dışa Aktarma",
    q: "İçe aktarırken yinelenen (mükerrer) kayıt kontrolü nasıl yapılıyor?",
    a: "Sadece müşteri ve fiyat listesi içe aktarımında, isim eşleşmesine (büyük/küçük harf hariç) bakılır - aynı isimde bir kayıt zaten varsa satır bir uyarıyla işaretlenir, ama otomatik olarak dışlanmaz; içe aktarmak istemiyorsanız kutucuğunu elle kaldırmanız gerekir.",
  },
  {
    category: "İçe/Dışa Aktarma",
    q: "İçe aktarabileceğim satır sayısında bir sınır var mı?",
    a: "Pratik bir üst sınır belirtilmemiştir; satırlar arka planda küçük gruplar hâlinde (chunk) yüklenir, çok büyük dosyalarda ilerleme çubuğundan yükleme durumunu takip edebilirsiniz.",
  },
  {
    category: "İçe/Dışa Aktarma",
    q: "Kayıt (teklif/randevu/üyelik) içe aktarırken aşama belirtmezsem ne olur?",
    a: 'Aşama sütununu boş bırakırsanız kayıt otomatik olarak en baştaki aşamada ("İlk Görüşme") açılır.',
  },
  {
    category: "İçe/Dışa Aktarma",
    q: "İçe aktarma sırasında bazı satırlar hata verirse diğerleri yine de eklenir mi?",
    a: "Evet - satırlar gruplar hâlinde yüklenir, bir grupta hata olsa bile önceden başarıyla yüklenmiş gruplar sisteme eklenmiş olarak kalır; işlem sonunda kaç satırın eklendiği ve varsa hata mesajları gösterilir.",
  },
  {
    category: "İçe/Dışa Aktarma",
    q: "Destek talebi içe aktarırken öncelik/durum belirtmezsem ne olur?",
    a: 'Öncelik boş bırakılırsa "Orta", durum boş bırakılırsa "Açık" olarak ayarlanır.',
  },
  {
    category: "İçe/Dışa Aktarma",
    q: "Hangi ekranlarda toplu içe/dışa aktarma yapabilirim?",
    a: 'Müşteriler, Teklifler/Randevular/Üyelikler/Rezervasyonlar, Destek Talepleri, Bilgi Bankası ve Ürün & Hizmet Fiyat Listesi ekranlarının hepsinde ayrı "İçe Aktar"/"Dışa Aktar" butonları vardır, hepsi aynı CSV/Excel akışını kullanır.',
  },
  {
    category: "İçe/Dışa Aktarma",
    q: 'İçe aktarılan müşterilerin "son temas" tarihi ne olur?',
    a: 'İçe aktarma anının tarihi "son temas" olarak otomatik kaydedilir, dosyanızda bu bilgiyi ayrıca belirtmenize gerek yoktur.',
  },

  {
    category: "Teklif Şablonları",
    q: "Kendi teklif PDF şablonumu nasıl tasarlarım?",
    a: 'Ayarlar → Teklif Şablonları\'ndaki galeriden "+ Yeni Şablon (boş)" ile boş bir sayfa açar ya da mevcut bir şablonu "Düzenle"yle kopyalayıp üzerinde değişiklik yaparsınız; editörde metin, logo, dikdörtgen, çizgi ve tablo blokları ekleyip konumlandırabilirsiniz.',
  },
  {
    category: "Teklif Şablonları",
    q: "Şablon editöründe bir bloğu nasıl hassas taşırım?",
    a: "Bloğu seçtikten sonra ok tuşlarıyla 1 piksel, Shift'e basılı tutarak 10 piksel adımlarla kaydırabilirsiniz - fareyle sürüklemek yerine ince ayar yapmak için kullanışlıdır.",
  },
  {
    category: "Teklif Şablonları",
    q: "Şablonuma hangi bilgileri otomatik doldurtabilirim?",
    a: "Firma adı/adres/telefon/e-posta/vergi no, müşteri adı/telefon/e-posta, belge başlığı, tarih, ara toplam/KDV/genel toplam, geçerlilik metni ve ek not gibi hazır alanları metin bloklarına ekleyip otomatik doldurulmasını sağlayabilirsiniz.",
  },
  {
    category: "Teklif Şablonları",
    q: "Bir teklif şablonunu silersem ne olur?",
    a: 'Şablon kalıcı olarak silinir (geri alınamaz); o an seçili şablonsa otomatik olarak "Klasik" hazır şablona geri dönülür, daha önce o şablonla oluşturulmuş PDF\'ler etkilenmez.',
  },
  {
    category: "Teklif Şablonları",
    q: "Teklif PDF'inde kalem sayısı arttıkça tasarım bozulur mu?",
    a: "Hayır - kalem sayısı arttıkça tablo bloğunun altındaki bloklar (geçerlilik metni, ek not vb.) otomatik olarak aşağı kayar, tasarımınız bozulmadan birden fazla kalemli teklifler de düzgün görünür.",
  },
  {
    category: "Teklif Şablonları",
    q: 'Hazır "Klasik" ve "Modern" şablonlarını değiştirebilir miyim?',
    a: 'Hazır şablonları doğrudan düzenleyemezsiniz ama "Düzenle"ye bastığınızda adının sonuna "(Kopya)" eklenmiş bir kopyası açılır, üzerinde değişiklik yapıp kendi şablonunuz olarak kaydedebilirsiniz.',
  },
  {
    category: "Teklif Şablonları",
    q: "Teklif PDF'inde hangi şablonun kullanılacağını nasıl seçerim?",
    a: 'Ayarlar → Teklif Şablonları galerisinde istediğiniz şablonun yanındaki "Seç"e tıklarsınız - o andan sonra oluşturduğunuz tüm teklif PDF\'leri bu şablonla üretilir.',
  },
  {
    category: "Teklif Şablonları",
    q: "Şablon editöründe bir metin bloğunun rengini/hizasını değiştirebilir miyim?",
    a: "Evet, seçili metin bloğu için yazı boyutu, kalınlık, renk, hizalama (sol/orta/sağ) ve büyük/küçük harf dönüşümü gibi özellikleri ayrı ayrı ayarlayabilirsiniz.",
  },
  {
    category: "Teklif Şablonları",
    q: "Boş şablondan başlarsam varsayılan sayfa boyutu ne olur?",
    a: "Boş şablon 700×900 piksellik bir sayfa olarak açılır, istediğiniz blokları sıfırdan ekleyip konumlandırırsınız - hazır şablonlardaki gibi önceden yerleştirilmiş hiçbir blok gelmez.",
  },
  {
    category: "Teklif Şablonları",
    q: "Şablonuma birden fazla sayfa ekleyebilir miyim?",
    a: "Hayır, şu an tek sayfalık bir tasarım alanı var - kalem sayısı arttıkça bloklar otomatik aşağı kayar ama ikinci bir sayfaya geçilmez.",
  },
  {
    category: "Teklif Şablonları",
    q: "Şablonuma logo dışında bir görsel/resim ekleyebilir miyim?",
    a: "Hayır, editördeki tek görsel bloğu firma logonuzdur (Ayarlar → İşletme Bilgileri'nden yüklediğiniz) - ayrı bir serbest resim/görsel bloğu eklenemez.",
  },
  {
    category: "Teklif Şablonları",
    q: "Şablonlarım müşteri portalında da görünür mü?",
    a: "Evet - müşteri portalından bir kaydın PDF'ini indirdiğinde, o kayıt için seçili olan aynı şablon kullanılır.",
  },
  {
    category: "Teklif Şablonları",
    q: "Tablo bloğundaki sütunları özelleştirebilir miyim?",
    a: "Tablo bloğu kalem listenizin (ürün/hizmet adı, miktar, birim fiyat, tutar) standart görünümünü kullanır; sütun ekleme/çıkarma veya yeniden adlandırma seçeneği yoktur, sadece rengini ve konumunu ayarlayabilirsiniz.",
  },
  {
    category: "Teklif Şablonları",
    q: "Bir dikdörtgen veya çizgi bloğunun rengini değiştirebilir miyim?",
    a: "Evet, dikdörtgen ve çizgi bloklarının rengini seçili blok panelinden değiştirebilirsiniz.",
  },
  {
    category: "Teklif Şablonları",
    q: "Kaç tane özel şablon oluşturabilirim?",
    a: "Pratik bir üst sınır yok, istediğiniz kadar özel şablon oluşturup galeriden aralarında geçiş yapabilirsiniz.",
  },
  {
    category: "Teklif Şablonları",
    q: "Şablon adını sonradan değiştirebilir miyim?",
    a: "Evet, editörde şablonun üst kısmındaki ad alanına tıklayıp istediğiniz zaman yeniden adlandırabilirsiniz.",
  },
];

// "Soru Sor" — gerçek bir AI/LLM çağrısı YOK, önceden tanımlı sorulara canlı
// veriden hesaplanan cevaplar veren deterministik bir kütüphane (maliyet
// sıfır, veri hiç dışarı çıkmıyor). HELP_TOPICS'teki statik soru/cevap
// deseninin aynısı, tek fark cevabın compute(ctx) ile canlı hesaplanması —
// aşağıda HELP_TOPICS/ADVISOR_TIPS ile birlikte tek kütüphanede (UNIFIED_LIBRARY) birleşiyor.
// Bazı Pano metrikleri (winRate, rangeRevenue vb.) Pano'da seçili tarih
// aralığına bağlı olduğu için burada KASITLI OLARAK yeniden kullanılmıyor —
// bu panel her yerden açılabildiğinden cevap Pano'daki filtreye göre sessizce
// değişmesin diye kendi sabit dönemini (bu ay / tüm zamanlar) taze hesaplar.
function topEntry(totals) {
  const entries = Object.entries(totals);
  if (entries.length === 0) return null;
  return entries.sort((a, b) => b[1] - a[1])[0];
}

// "Analiz" kategorisindeki teşhis soruları (aşağıda) tek bir sayı yerine
// birkaç sinyali birleştirip bir yorum/öneri üretiyor — kayıp nedenine göre
// somut bir tavsiyeye eşleşen sabit bir sözlük. Hem teklif sektörlerindeki
// LOST_REASONS'ı hem randevu sektörlerindeki APPOINTMENT_LOST_REASONS'ı kapsar.
const REASON_ADVICE = {
  "Yüksek fiyat":
    "Fiyatlandırmanızı ve sunduğunuz değeri gözden geçirmeyi düşünebilirsiniz - doğrudan indirim yerine paketleme veya ek hizmet eklemek genelde daha sürdürülebilir bir çözümdür.",
  "Rakip tercih edildi":
    "Rakiplerinizi analiz edip kendi farklılaşma noktalarınızı (hız, kalite, kişisel ilgi, garanti) tekliflerinizde daha net vurgulamayı deneyin.",
  "Bütçe yok":
    "Daha küçük/esnek bir paket veya taksitli ödeme seçeneği sunmak bütçe engelini aşmanıza yardımcı olabilir.",
  "Zamanlama uymadı":
    "Bu kayıtlar için bir hatırlatma bırakıp uygun zaman geldiğinde tekrar iletişime geçmeyi unutmayın.",
  Vazgeçti:
    "İlk temas sonrası takip hızınızı gözden geçirin - yanıt gecikmesi genelde ilginin soğumasına yol açar.",
  "Randevuya gelmedi":
    "Randevu hatırlatmalarınızın açık olduğundan emin olun, randevuya yakın ek bir hatırlatma da gelmeme oranını azaltabilir.",
  "İptal etti":
    "İptal nedenini not almayı sürdürün - tekrarlayan bir kalıp (örn. hep aynı gün/saat) varsa program/müsaitlik saatlerinizi gözden geçirebilirsiniz.",
  "Geç iptal etti":
    "Bu müşteriler randevuya çok yakın iptal ediyor - Müsaitlik Saatleri'ndeki geç iptal/gelmeme cezası ayarını kullanarak tekrarlayanlarda sonraki randevuda ödeme zorunlu tutabilirsiniz.",
  "Mücbir sebep":
    "Belgelenebilir acil durumlarda (hastalık, kaza, resmi mücbir sebep) ceza/sayaç uygulanmaması adil bir istisnadır - sık tekrarlanıyorsa yine de not tutmakta fayda var.",
  "İşletme iptal etti":
    "İşletme/personel kaynaklı geç iptallerde müşteriye otomatik tanınan telafi hakkını bir sonraki randevusunda hatırlatmayı unutmayın.",
};

export const ANSWER_LIBRARY = [
  {
    id: "top_customer_month",
    category: "Satış",
    label: "Bu ay en çok kazandıran müşterim kim?",
    keywords: ["en çok kazandıran", "en iyi müşteri", "en çok gelir getiren müşteri"],
    compute: (ctx) => {
      const bounds = getRangeBounds("bu_ay");
      const won = ctx.deals.filter(
        (d) => d.stage === "kazanildi" && inRange(d.closedAt || d.createdAt, bounds),
      );
      if (won.length === 0) return "Bu ay henüz kazanılmış bir kaydınız yok.";
      const totals = {};
      won.forEach((d) => {
        totals[d.customerId] = (totals[d.customerId] || 0) + (d.value || 0);
      });
      const top = topEntry(totals);
      const customer = ctx.customers.find((c) => c.id === top[0]);
      return `${customer?.name || "Bilinmeyen müşteri"} - bu ay ${formatTL(top[1])} ile en çok kazandıran müşteriniz.`;
    },
  },
  {
    id: "win_rate_month",
    category: "Satış",
    label: "Bu ay kazanma oranım nedir?",
    keywords: ["bu ay kazanma oranı", "bu ay başarı oranı"],
    compute: (ctx) => {
      const bounds = getRangeBounds("bu_ay");
      const closed = ctx.deals.filter(
        (d) =>
          (d.stage === "kazanildi" || d.stage === "kaybedildi") &&
          inRange(d.closedAt || d.createdAt, bounds),
      );
      const won = closed.filter((d) => d.stage === "kazanildi");
      if (closed.length === 0)
        return "Bu ay henüz sonuçlanmış (kazanılmış/kaybedilmiş) bir kaydınız yok.";
      return `Bu ay kazanma oranınız %${Math.round((won.length / closed.length) * 100)} (${won.length}/${closed.length}).`;
    },
  },
  {
    id: "win_rate_all_time",
    category: "Satış",
    label: "Genel (tüm zamanlar) kazanma oranım nedir?",
    keywords: ["genel kazanma oranı", "tüm zamanlar kazanma oranı", "toplam kazanma oranı"],
    compute: (ctx) => {
      const closed = ctx.deals.filter((d) => d.stage === "kazanildi" || d.stage === "kaybedildi");
      const won = closed.filter((d) => d.stage === "kazanildi");
      if (closed.length === 0) return "Henüz sonuçlanmış bir kaydınız yok.";
      return `Tüm zamanlar kazanma oranınız %${Math.round((won.length / closed.length) * 100)} (${won.length}/${closed.length}).`;
    },
  },
  {
    id: "loss_rate_all_time",
    category: "Satış",
    label: "Kayıp oranım nedir?",
    keywords: ["kayıp oranı", "kaybetme oranı"],
    compute: (ctx) => {
      const closed = ctx.deals.filter((d) => d.stage === "kazanildi" || d.stage === "kaybedildi");
      const lost = closed.filter((d) => d.stage === "kaybedildi");
      if (closed.length === 0) return "Henüz sonuçlanmış bir kaydınız yok.";
      return `Tüm zamanlar kayıp oranınız %${Math.round((lost.length / closed.length) * 100)} (${lost.length}/${closed.length}).`;
    },
  },
  {
    id: "top_lost_reason",
    category: "Satış",
    label: "En çok hangi nedenle kaybediyorum?",
    keywords: ["kayıp nedeni", "neden kaybediyorum", "en çok kaybettiğim neden"],
    compute: (ctx) => {
      const lost = ctx.deals.filter((d) => d.stage === "kaybedildi" && d.lostReason);
      if (lost.length === 0) return "Henüz nedeni belirtilmiş kayıp bir kaydınız yok.";
      const totals = {};
      lost.forEach((d) => {
        totals[d.lostReason] = (totals[d.lostReason] || 0) + 1;
      });
      const top = topEntry(totals);
      return `En sık kayıp nedeniniz "${top[0]}" (${top[1]} kayıt).`;
    },
  },
  {
    id: "open_deals_count",
    category: "Satış",
    label: (sector) => {
      const words = DEAL_WORD_FORMS[dealWordKind(sector)];
      return words.bare === "teklif"
        ? "Kaç açık teklifim var?"
        : `Kaç bekleyen ${words.bare === "randevu" ? "randevum" : words.bare === "rezervasyon" ? "rezervasyonum" : "üyeliğim"} var?`;
    },
    keywords: [
      "açık teklif",
      "açık fırsat",
      "açık kayıt",
      "bekleyen teklif",
      "bekleyen randevu",
      "bekleyen üyelik",
    ],
    compute: (ctx) => {
      const words = DEAL_WORD_FORMS[dealWordKind(ctx.companySettings?.sector)];
      const open = ctx.deals.filter((d) => d.stage !== "kazanildi" && d.stage !== "kaybedildi");
      return `${open.length} açık ${words.bare === "teklif" ? "teklifiniz" : words.bare === "randevu" ? "randevunuz" : words.bare === "rezervasyon" ? "rezervasyonunuz" : "üyeliğiniz"} var.`;
    },
  },
  {
    id: "avg_deal_size_month",
    category: "Satış",
    label: (sector) =>
      `Bu ay ortalama kazanılan ${DEAL_WORD_FORMS[dealWordKind(sector)].bare} değeri ne kadar?`,
    keywords: [
      "ortalama teklif büyüklüğü",
      "ortalama fırsat büyüklüğü",
      "ortalama kayıt tutarı",
      "ortalama randevu değeri",
      "ortalama üyelik değeri",
    ],
    compute: (ctx) => {
      const bounds = getRangeBounds("bu_ay");
      const words = DEAL_WORD_FORMS[dealWordKind(ctx.companySettings?.sector)];
      const won = ctx.deals.filter(
        (d) => d.stage === "kazanildi" && inRange(d.closedAt || d.createdAt, bounds),
      );
      if (won.length === 0) return "Bu ay henüz kazanılmış bir kaydınız yok.";
      const avg = won.reduce((sum, d) => sum + (d.value || 0), 0) / won.length;
      return `Bu ay ortalama kazanılan ${words.bare} değeriniz ${formatTL(avg)}.`;
    },
  },
  {
    id: "funnel",
    category: "Satış",
    label: "Hangi aşamada kaç kaydım var?",
    keywords: ["aşama hunisi", "hangi aşamada", "huni"],
    compute: (ctx) => {
      const openDeals = ctx.deals.filter(
        (d) => d.stage !== "kazanildi" && d.stage !== "kaybedildi",
      );
      return STAGES.filter((s) => s.id !== "kazanildi" && s.id !== "kaybedildi")
        .map(
          (s) =>
            `${stageLabel(s.id, "kurumsal", ctx.companySettings?.sector)}: ${openDeals.filter((d) => d.stage === s.id).length}`,
        )
        .join(", ");
    },
  },
  {
    id: "forecast",
    category: "Satış",
    label: "Gelecek ay ne kadar kazanırım?",
    keywords: ["gelecek ay tahmin", "önümüzdeki ay tahmin", "gelecek ay ne kadar"],
    compute: (ctx) =>
      ctx.nextMonthForecast != null
        ? `Gelecek ay tahmini geliriniz yaklaşık ${formatTL(ctx.nextMonthForecast)}.`
        : "Tahmin için henüz yeterli geçmiş veri yok (son 3 ayda kazanılmış kayıt gerekiyor).",
  },
  {
    id: "customer_count",
    category: "Müşteri",
    label: "Kaç müşterim var?",
    keywords: ["kaç müşteri", "müşteri sayım"],
    compute: (ctx) => `Toplam ${ctx.customers.length} müşteriniz var.`,
  },
  {
    id: "passive_rate",
    category: "Müşteri",
    label: "Pasif müşteri oranım nedir?",
    keywords: ["pasif müşteri", "uyuyan müşteri"],
    compute: (ctx) =>
      ctx.passiveCustomerRate != null
        ? `Pasif (90 gündür alışverişi olmayan) müşteri oranınız %${Math.round(ctx.passiveCustomerRate)}.`
        : "Henüz bu oranı hesaplamak için yeterli veri yok.",
  },
  {
    id: "top_debtor",
    category: "Müşteri",
    label: "En çok borçlu müşterim kim?",
    keywords: ["en çok borçlu", "borcu en yüksek", "en çok alacağım"],
    compute: (ctx) => {
      const balances = {};
      ctx.deals
        .filter((d) => d.stage === "kazanildi")
        .forEach((d) => {
          balances[d.customerId] = (balances[d.customerId] || 0) + (d.value || 0);
        });
      ctx.payments.forEach((p) => {
        const deal = ctx.deals.find((d) => d.id === p.dealId);
        if (deal && balances[deal.customerId] != null) balances[deal.customerId] -= p.amount || 0;
      });
      const top = Object.entries(balances)
        .filter(([, v]) => v > 0)
        .sort((a, b) => b[1] - a[1])[0];
      if (!top) return "Şu anda borcu olan bir müşteriniz görünmüyor.";
      const customer = ctx.customers.find((c) => c.id === top[0]);
      return `${customer?.name || "Bilinmeyen müşteri"} - ${formatTL(top[1])} bakiye ile en çok borçlu müşteriniz.`;
    },
  },
  {
    id: "top_sector",
    category: "Müşteri",
    label: "Hangi sektörden en çok müşterim var?",
    keywords: ["hangi sektörden en çok", "en çok sektör", "müşteri sektör dağılımı"],
    compute: (ctx) => {
      const totals = {};
      ctx.customers.forEach((c) => {
        if (c.sector) totals[c.sector] = (totals[c.sector] || 0) + 1;
      });
      const top = topEntry(totals);
      if (!top) return "Müşterilerinizde henüz sektör bilgisi girilmemiş.";
      return `En çok müşteriniz "${top[0]}" sektöründen (${top[1]} müşteri).`;
    },
  },
  {
    id: "collected_this_month",
    category: "Finans",
    label: "Bu ay ne kadar tahsilat aldım?",
    keywords: ["bu ay tahsilat", "bu ay ne kadar aldım", "bu ay tahsil ettim"],
    compute: (ctx) => {
      const bounds = getRangeBounds("bu_ay");
      const total = ctx.payments
        .filter((p) => inRange(p.paidAt, bounds))
        .reduce((sum, p) => sum + (p.amount || 0), 0);
      return `Bu ay toplam ${formatTL(total)} tahsilat aldınız.`;
    },
  },
  {
    id: "outstanding",
    category: "Finans",
    label: "Bekleyen alacağım ne kadar?",
    keywords: ["bekleyen alacak", "tahsil edilmemiş alacak", "alacağım ne kadar"],
    compute: (ctx) =>
      `Şu anda bekleyen (tahsil edilmemiş) alacağınız ${formatTL(ctx.totalOutstanding || 0)}.`,
  },
  {
    id: "net_remaining_month",
    category: "Finans",
    label: "Bu ay net kârım ne kadar?",
    keywords: ["net kâr", "net kalan", "bu ay kârım"],
    compute: (ctx) => {
      const bounds = getRangeBounds("bu_ay");
      const income = ctx.payments
        .filter((p) => inRange(p.paidAt, bounds))
        .reduce((sum, p) => sum + (p.amount || 0), 0);
      const expense = ctx.companyExpenses
        .flatMap((e) => expandExpenseOccurrences(e, bounds))
        .reduce((sum, e) => sum + (e.amount || 0), 0);
      const dealCost = ctx.deals
        .filter(
          (d) =>
            d.stage === "kazanildi" &&
            (d.cost || 0) > 0 &&
            inRange(d.closedAt || d.createdAt, bounds),
        )
        .reduce((sum, d) => sum + (d.cost || 0), 0);
      const net = income - expense - dealCost;
      return `Bu ay net kalanınız ${formatTL(net)} (${formatTL(income)} gelir − ${formatTL(expense + dealCost)} gider).`;
    },
  },
  {
    id: "top_expense_category_month",
    category: "Finans",
    label: "Bu ay en çok hangi kategoriye gider yapıyorum?",
    keywords: ["en çok gider", "gider kategorisi", "nereye harcıyorum"],
    compute: (ctx) => {
      const bounds = getRangeBounds("bu_ay");
      const totals = {};
      ctx.companyExpenses
        .flatMap((e) => expandExpenseOccurrences(e, bounds))
        .forEach((e) => {
          totals[e.category] = (totals[e.category] || 0) + (e.amount || 0);
        });
      const top = topEntry(totals);
      if (!top) return "Bu ay henüz kayıtlı bir gideriniz yok.";
      return `Bu ay en çok "${top[0]}" kategorisine gider yaptınız (${formatTL(top[1])}).`;
    },
  },
  {
    id: "forgotten_expense_categories",
    category: "Finans",
    label: "Unuttuğum bir gider kalemi olabilir mi?",
    keywords: [
      "unuttuğum gider",
      "kaçırdığım gider",
      "eksik gider kalemi",
      "hangi giderleri unuttum",
    ],
    compute: (ctx) => {
      // Gerçekten yapılmış ama sisteme hiç girilmemiş, meşru ve indirilebilir
      // giderleri hatırlatır — vergi yükünü YASAL yollardan azaltmak için.
      const commonlyMissed = [
        "Eğitim",
        "Danışmanlık",
        "Sigorta",
        "Bakım / Onarım",
        "Seyahat / Konaklama",
        "Temsil ve Ağırlama",
      ];
      const usedCategories = new Set(ctx.companyExpenses.map((e) => e.category));
      const missing = commonlyMissed.filter((c) => !usedCategories.has(c));
      if (missing.length === 0)
        return "Yaygın gider kategorilerinin hepsini en az bir kez kullanmışsınız - başka bir kalem gözden kaçıyorsa muhasebecinize danışabilirsiniz.";
      return `Şu kategorilerde hiç gideriniz görünmüyor: ${missing.join(", ")}. Gerçekten yaptığınız ama kaydetmediğiniz bir harcama varsa (örn. bir eğitim, sigorta poliçesi, danışmanlık ücreti) Finans → Gider ekle'den kaydedin - hem gerçek kârınızı doğru gösterir hem KDV'nizi doğru hesaplar.`;
    },
  },
  {
    id: "sla_breached",
    category: "Destek",
    label: "SLA'sı geçen kaç talebim var?",
    keywords: ["sla geçen", "süresi geçen talep", "gecikmiş talep"],
    compute: (ctx) =>
      ctx.breachedTicketsCount > 0
        ? `SLA süresi geçmiş ${ctx.breachedTicketsCount} talebiniz var.`
        : "SLA süresi geçmiş bir talebiniz yok.",
  },
  {
    id: "unread_messages",
    category: "Destek",
    label: "Kaç okunmamış mesajım var?",
    keywords: ["okunmamış mesaj", "yanıtlanmamış mesaj"],
    compute: (ctx) =>
      ctx.unreadMessagesCount > 0
        ? `${ctx.unreadMessagesCount} talepte okunmamış mesajınız var.`
        : "Okunmamış mesajınız yok.",
  },
  {
    id: "open_tickets_count",
    category: "Destek",
    label: "Açık kaç destek talebim var?",
    keywords: ["açık talep", "kaç destek talebi", "çözülmemiş talep"],
    compute: (ctx) => {
      const open = ctx.tickets.filter((t) => !TERMINAL_STATUSES.includes(t.status));
      return `${open.length} açık (çözülmemiş) destek talebiniz var.`;
    },
  },
  {
    id: "no_show_rate_month",
    category: "Satış",
    label: "Bu ay gelmeme oranım nedir?",
    keywords: ["gelmeme oranı", "no-show", "randevuya gelmeyen"],
    visibleIf: (sector) => isAppointmentSector(sector),
    compute: (ctx) => {
      const bounds = getRangeBounds("bu_ay");
      const closed = ctx.deals.filter(
        (d) =>
          (d.stage === "kazanildi" || d.stage === "kaybedildi") &&
          inRange(d.closedAt || d.createdAt, bounds),
      );
      const noShow = closed.filter(
        (d) => d.stage === "kaybedildi" && d.lostReason === "Randevuya gelmedi",
      );
      if (closed.length === 0) return "Bu ay henüz sonuçlanmış bir randevunuz yok.";
      return `Bu ay gelmeme oranınız %${Math.round((noShow.length / closed.length) * 100)} (${noShow.length}/${closed.length}).`;
    },
  },
  {
    id: "new_deals_this_month",
    category: "Satış",
    label: "Bu ay kaç yeni kayıt oluşturdum?",
    keywords: ["bu ay kaç yeni kayıt", "bu ay kaç teklif oluşturdum", "yeni kayıt sayısı"],
    compute: (ctx) => {
      const bounds = getRangeBounds("bu_ay");
      const words = DEAL_WORD_FORMS[dealWordKind(ctx.companySettings?.sector)];
      const count = ctx.deals.filter((d) => inRange(d.createdAt, bounds)).length;
      return `Bu ay ${count} yeni ${words.bare} oluşturdunuz.`;
    },
  },
  {
    id: "due_reminders_this_week",
    category: "Satış",
    label: "Bu hafta hatırlatması olan kaç kaydım var?",
    keywords: ["bu hafta hatırlatma", "hatırlatmalarım", "bu haftaki hatırlatma"],
    compute: (ctx) => {
      const today = new Date();
      const todayStr = today.toISOString().slice(0, 10);
      const weekEnd = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 10);
      const count = ctx.deals.filter(
        (d) =>
          d.stage !== "kazanildi" &&
          d.stage !== "kaybedildi" &&
          d.reminderDate &&
          d.reminderDate >= todayStr &&
          d.reminderDate <= weekEnd,
      ).length;
      return `Bu hafta hatırlatması olan ${count} kaydınız var.`;
    },
  },
  {
    id: "overdue_reminders",
    category: "Satış",
    label: "Hatırlatma tarihi geçmiş kaç kaydım var?",
    keywords: ["hatırlatma tarihi geçmiş", "geciken hatırlatma", "süresi geçen hatırlatma"],
    compute: (ctx) => {
      const todayStr = new Date().toISOString().slice(0, 10);
      const count = ctx.deals.filter(
        (d) =>
          d.stage !== "kazanildi" &&
          d.stage !== "kaybedildi" &&
          d.reminderDate &&
          d.reminderDate < todayStr,
      ).length;
      return count > 0
        ? `Hatırlatma tarihi geçmiş ${count} kaydınız var.`
        : "Hatırlatma tarihi geçmiş bir kaydınız yok.";
    },
  },
  {
    id: "most_expensive_open_deal",
    category: "Satış",
    label: "En değerli açık kaydım hangisi?",
    keywords: ["en değerli açık", "en pahalı açık teklif", "en büyük açık kayıt"],
    compute: (ctx) => {
      const open = ctx.deals
        .filter((d) => d.stage !== "kazanildi" && d.stage !== "kaybedildi")
        .sort((a, b) => (b.value || 0) - (a.value || 0));
      if (open.length === 0) return "Şu anda açık bir kaydınız yok.";
      const top = open[0];
      const customer = ctx.customers.find((c) => c.id === top.customerId);
      return `"${top.title}" (${customer?.name || "müşteri silinmiş"}) - ${formatTL(top.value)} ile en değerli açık kaydınız.`;
    },
  },
  {
    id: "oldest_open_deal",
    category: "Satış",
    label: "En uzun süredir açık kalan kaydım hangisi?",
    keywords: ["en eski açık", "en uzun süredir açık", "en eski teklif"],
    compute: (ctx) => {
      const open = ctx.deals
        .filter((d) => d.stage !== "kazanildi" && d.stage !== "kaybedildi")
        .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
      if (open.length === 0) return "Şu anda açık bir kaydınız yok.";
      const top = open[0];
      const customer = ctx.customers.find((c) => c.id === top.customerId);
      const days = Math.floor(
        (Date.now() - new Date(top.createdAt).getTime()) / (24 * 60 * 60 * 1000),
      );
      return `"${top.title}" (${customer?.name || "müşteri silinmiş"}) - ${days} gündür açık.`;
    },
  },
  {
    id: "avg_sales_cycle",
    category: "Satış",
    label: "Ortalama satış süresi (gün) ne kadar?",
    keywords: ["ortalama satış süresi", "satış döngüsü", "kaç günde kazanıyorum"],
    compute: (ctx) => {
      const won = ctx.deals.filter((d) => d.stage === "kazanildi" && d.closedAt);
      if (won.length === 0) return "Henüz kazanılmış bir kaydınız yok.";
      const avgDays =
        won.reduce(
          (sum, d) => sum + (new Date(d.closedAt) - new Date(d.createdAt)) / (24 * 60 * 60 * 1000),
          0,
        ) / won.length;
      return `Ortalama satış süreniz (kayıt açılıştan kazanılana kadar) ${Math.round(avgDays)} gün.`;
    },
  },
  {
    id: "this_year_revenue",
    category: "Satış",
    label: "Bu yıl toplam ne kadar kazandım?",
    keywords: ["bu yıl ne kadar kazandım", "bu yıl toplam gelir", "yıllık gelir"],
    compute: (ctx) => {
      const bounds = getRangeBounds("bu_yil");
      const total = ctx.deals
        .filter((d) => d.stage === "kazanildi" && inRange(d.closedAt || d.createdAt, bounds))
        .reduce((sum, d) => sum + (d.value || 0), 0);
      return `Bu yıl toplam ${formatTL(total)} kazandınız.`;
    },
  },
  {
    id: "last_month_revenue",
    category: "Satış",
    label: "Geçen ay ne kadar kazandım?",
    keywords: ["geçen ay ne kadar kazandım", "geçen ayki gelir", "önceki ay gelir"],
    compute: (ctx) => {
      const now = new Date();
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
      const total = ctx.deals
        .filter(
          (d) => d.stage === "kazanildi" && inRange(d.closedAt || d.createdAt, { start, end }),
        )
        .reduce((sum, d) => sum + (d.value || 0), 0);
      return `Geçen ay toplam ${formatTL(total)} kazandınız.`;
    },
  },
  {
    id: "top_tag_deals",
    category: "Satış",
    label: "En çok kullandığım kayıt etiketi hangisi?",
    keywords: ["en çok kullanılan etiket", "kayıt etiketi", "teklif etiketleri"],
    compute: (ctx) => {
      const totals = {};
      ctx.deals.forEach((d) =>
        (d.tags || []).forEach((t) => {
          totals[t] = (totals[t] || 0) + 1;
        }),
      );
      const top = topEntry(totals);
      return top
        ? `En çok kullandığınız etiket "${top[0]}" (${top[1]} kayıtta).`
        : "Henüz hiçbir kaydınıza etiket eklenmemiş.";
    },
  },
  {
    id: "top_assignee_by_win",
    category: "Satış",
    label: "Takımda en çok kim kazandırıyor?",
    keywords: ["en çok kim kazandırıyor", "takımda en iyi", "kimin performansı iyi"],
    compute: (ctx) => {
      if (ctx.teamMembers.length === 0) return "Henüz takım üyeniz yok.";
      const totals = {};
      ctx.deals
        .filter((d) => d.stage === "kazanildi" && d.assignedTo)
        .forEach((d) => {
          totals[d.assignedTo] = (totals[d.assignedTo] || 0) + (d.value || 0);
        });
      const top = topEntry(totals);
      if (!top) return "Henüz sorumlu atanmış kazanılan bir kaydınız yok.";
      const name =
        top[0] === ctx.currentUserId
          ? "Siz"
          : ctx.teamMembers.find((m) => m.id === top[0])?.name ||
            ctx.teamMembers.find((m) => m.id === top[0])?.email ||
            "Bilinmeyen üye";
      return `${name} - ${formatTL(top[1])} ile en çok kazandıran kişi.`;
    },
  },
  {
    id: "newest_customer",
    category: "Müşteri",
    label: "En son eklenen müşterim kim?",
    keywords: ["en son eklenen müşteri", "son eklenen müşteri", "yeni müşterim"],
    compute: (ctx) => {
      if (ctx.customers.length === 0) return "Henüz müşteriniz yok.";
      const sorted = [...ctx.customers].sort(
        (a, b) => new Date(b.createdAt) - new Date(a.createdAt),
      );
      return `${sorted[0].name} - ${new Date(sorted[0].createdAt).toLocaleDateString("tr-TR")} tarihinde eklendi.`;
    },
  },
  {
    id: "new_customers_this_month",
    category: "Müşteri",
    label: "Bu ay kaç yeni müşteri kazandım?",
    keywords: ["bu ay kaç yeni müşteri", "bu ay yeni müşteri sayısı"],
    compute: (ctx) => {
      const bounds = getRangeBounds("bu_ay");
      return `Bu ay ${ctx.customers.filter((c) => inRange(c.createdAt, bounds)).length} yeni müşteri kazandınız.`;
    },
  },
  {
    id: "customer_type_split",
    category: "Müşteri",
    label: "Kurumsal mı bireysel mi daha çok müşterim var?",
    keywords: ["kurumsal bireysel", "müşteri türü dağılımı"],
    compute: (ctx) => {
      const kurumsal = ctx.customers.filter((c) => c.customerType === "kurumsal").length;
      const bireysel = ctx.customers.filter((c) => c.customerType === "bireysel").length;
      return `${kurumsal} kurumsal, ${bireysel} bireysel müşteriniz var.`;
    },
  },
  {
    id: "customers_missing_phone",
    category: "Müşteri",
    label: "Telefonu olmayan kaç müşterim var?",
    keywords: ["telefonu olmayan müşteri", "telefon eksik"],
    compute: (ctx) =>
      `Telefonu kayıtlı olmayan ${ctx.customers.filter((c) => !c.phone).length} müşteriniz var.`,
  },
  {
    id: "customers_missing_email",
    category: "Müşteri",
    label: "E-postası olmayan kaç müşterim var?",
    keywords: ["e-postası olmayan müşteri", "email eksik"],
    compute: (ctx) =>
      `E-postası kayıtlı olmayan ${ctx.customers.filter((c) => !c.email).length} müşteriniz var.`,
  },
  {
    id: "top_customer_tag",
    category: "Müşteri",
    label: "En çok kullandığım müşteri etiketi hangisi?",
    keywords: ["en çok kullanılan müşteri etiketi", "müşteri etiketleri"],
    compute: (ctx) => {
      const totals = {};
      ctx.customers.forEach((c) =>
        (c.tags || []).forEach((t) => {
          totals[t] = (totals[t] || 0) + 1;
        }),
      );
      const top = topEntry(totals);
      return top
        ? `En çok kullandığınız müşteri etiketi "${top[0]}" (${top[1]} müşteride).`
        : "Henüz hiçbir müşterinize etiket eklenmemiş.";
    },
  },
  {
    id: "top_region",
    category: "Müşteri",
    label: "En çok hangi bölgeden müşterim var?",
    keywords: ["hangi bölgeden", "bölge dağılımı", "en çok bölge"],
    compute: (ctx) => {
      const totals = {};
      ctx.customers.forEach((c) => {
        if (c.region) totals[c.region] = (totals[c.region] || 0) + 1;
      });
      const top = topEntry(totals);
      return top
        ? `En çok müşteriniz "${top[0]}" bölgesinden (${top[1]} müşteri).`
        : "Müşterilerinizde henüz bölge bilgisi girilmemiş.";
    },
  },
  {
    id: "total_collected_all_time",
    category: "Finans",
    label: "Tüm zamanlar toplam tahsilatım ne kadar?",
    keywords: ["toplam tahsilat", "tüm zamanlar tahsilat", "şimdiye kadar ne kadar tahsil ettim"],
    compute: (ctx) =>
      `Şimdiye kadar toplam ${formatTL(ctx.payments.reduce((sum, p) => sum + (p.amount || 0), 0))} tahsilat aldınız.`,
  },
  {
    id: "biggest_payment",
    category: "Finans",
    label: "En büyük tek tahsilatım ne kadar oldu?",
    keywords: ["en büyük tahsilat", "en yüksek ödeme"],
    compute: (ctx) => {
      const positive = ctx.payments.filter((p) => (p.amount || 0) > 0);
      if (positive.length === 0) return "Henüz bir tahsilatınız yok.";
      return `En büyük tek tahsilatınız ${formatTL(Math.max(...positive.map((p) => p.amount)))}.`;
    },
  },
  {
    id: "last_payment_date",
    category: "Finans",
    label: "En son ne zaman tahsilat aldım?",
    keywords: ["en son tahsilat", "son ödeme ne zaman"],
    compute: (ctx) => {
      if (ctx.payments.length === 0) return "Henüz bir tahsilatınız yok.";
      const sorted = [...ctx.payments].sort((a, b) => new Date(b.paidAt) - new Date(a.paidAt));
      return `En son ${new Date(sorted[0].paidAt).toLocaleDateString("tr-TR")} tarihinde tahsilat aldınız.`;
    },
  },
  {
    id: "recurring_expense_count",
    category: "Finans",
    label: "Kaç tane tekrarlayan giderim var?",
    keywords: ["tekrarlayan gider sayısı", "kaç tekrarlayan gider"],
    compute: (ctx) =>
      `${ctx.companyExpenses.filter((e) => e.isRecurring).length} tekrarlayan gideriniz var.`,
  },
  {
    id: "monthly_fixed_expense",
    category: "Finans",
    label: "Aylık sabit gider toplamım ne kadar?",
    keywords: ["aylık sabit gider", "aylık giderim ne kadar"],
    compute: (ctx) => {
      const total = ctx.companyExpenses
        .filter((e) => e.isRecurring && e.recurrenceInterval === "monthly")
        .reduce((sum, e) => sum + (e.amount || 0), 0);
      return `Aylık tekrarlayan (sabit) gider toplamınız ${formatTL(total)}.`;
    },
  },
  {
    id: "this_year_expense",
    category: "Finans",
    label: "Bu yıl toplam giderim ne kadar?",
    keywords: ["bu yıl toplam gider", "yıllık gider"],
    compute: (ctx) => {
      const bounds = getRangeBounds("bu_yil");
      const expense = ctx.companyExpenses
        .flatMap((e) => expandExpenseOccurrences(e, bounds))
        .reduce((sum, e) => sum + (e.amount || 0), 0);
      const dealCost = ctx.deals
        .filter(
          (d) =>
            d.stage === "kazanildi" &&
            (d.cost || 0) > 0 &&
            inRange(d.closedAt || d.createdAt, bounds),
        )
        .reduce((sum, d) => sum + (d.cost || 0), 0);
      return `Bu yıl toplam gideriniz ${formatTL(expense + dealCost)}.`;
    },
  },
  {
    id: "payment_connection_status",
    category: "Finans",
    label: "Online ödeme bağlantım var mı?",
    keywords: ["ödeme bağlantım var mı", "iyzico bağlı mı", "paytr bağlı mı"],
    compute: (ctx) =>
      ctx.paymentCredentials.length > 0
        ? `Evet, ${ctx.paymentCredentials[0].provider === "paytr" ? "PayTR" : "iyzico"} bağlı.`
        : "Henüz bir ödeme sağlayıcısı bağlamadınız.",
  },
  {
    id: "avg_payment_amount",
    category: "Finans",
    label: "Ortalama tahsilat tutarım ne kadar?",
    keywords: ["ortalama tahsilat", "ortalama ödeme tutarı"],
    compute: (ctx) => {
      const positive = ctx.payments.filter((p) => (p.amount || 0) > 0);
      if (positive.length === 0) return "Henüz bir tahsilatınız yok.";
      return `Ortalama tahsilat tutarınız ${formatTL(positive.reduce((sum, p) => sum + p.amount, 0) / positive.length)}.`;
    },
  },
  {
    id: "total_tickets",
    category: "Destek",
    label: "Toplam kaç destek talebim var?",
    keywords: ["toplam destek talebi", "kaç talebim var"],
    compute: (ctx) => `Toplam ${ctx.tickets.length} destek talebiniz var.`,
  },
  {
    id: "tickets_by_priority",
    category: "Destek",
    label: "Önceliğe göre talep dağılımım nasıl?",
    keywords: ["öncelik dağılımı", "talep önceliği"],
    compute: (ctx) => {
      if (ctx.tickets.length === 0) return "Henüz bir destek talebiniz yok.";
      const labels = { acil: "Acil", yuksek: "Yüksek", orta: "Orta", dusuk: "Düşük" };
      const totals = {};
      ctx.tickets.forEach((t) => {
        totals[t.priority] = (totals[t.priority] || 0) + 1;
      });
      return Object.entries(totals)
        .map(([k, v]) => `${labels[k] || k}: ${v}`)
        .join(", ");
    },
  },
  {
    id: "resolved_tickets_count",
    category: "Destek",
    label: "Kaç talebim çözüldü?",
    keywords: ["kaç talep çözüldü", "çözülen talep sayısı"],
    compute: (ctx) =>
      `${ctx.tickets.filter((t) => TERMINAL_STATUSES.includes(t.status)).length} talebiniz çözüldü/kapatıldı.`,
  },
  {
    id: "kb_article_count",
    category: "Destek",
    label: "Kaç Bilgi Bankası makalem var?",
    keywords: ["kaç makale", "bilgi bankası makale sayısı"],
    compute: (ctx) => `${ctx.kbArticles.length} Bilgi Bankası makaleniz var.`,
  },
  {
    id: "top_kb_category",
    category: "Destek",
    label: "Hangi kategoride en çok makalem var?",
    keywords: ["en çok makale kategorisi", "makale kategorileri"],
    compute: (ctx) => {
      const totals = {};
      ctx.kbArticles.forEach((a) => {
        if (a.category) totals[a.category] = (totals[a.category] || 0) + 1;
      });
      const top = topEntry(totals);
      return top
        ? `En çok makaleniz "${top[0]}" kategorisinde (${top[1]} makale).`
        : "Henüz kategorili bir makaleniz yok.";
    },
  },
  {
    id: "avg_resolution_days",
    category: "Destek",
    label: "Ortalama kaç günde talep çözüyorum?",
    keywords: ["ortalama çözüm süresi", "kaç günde çözüyorum"],
    compute: (ctx) => {
      const resolved = ctx.tickets.filter((t) => t.resolvedAt);
      if (resolved.length === 0) return "Henüz çözülmüş bir talebiniz yok.";
      const avgDays =
        resolved.reduce(
          (sum, t) =>
            sum + (new Date(t.resolvedAt) - new Date(t.createdAt)) / (24 * 60 * 60 * 1000),
          0,
        ) / resolved.length;
      return `Ortalama talep çözüm süreniz ${Math.round(avgDays * 10) / 10} gün.`;
    },
  },
  {
    id: "appointments_today",
    category: "Randevu & Program",
    label: "Bugün kaç randevum var?",
    keywords: ["bugün kaç randevum", "bugünkü randevular"],
    visibleIf: (sector) => supportsSelfBooking(sector) || isAppointmentSector(sector),
    compute: (ctx) => {
      if (!ctx.appointmentDateTimeKey) return "Randevu tarihi alanı henüz tanımlı değil.";
      const todayStr = new Date().toISOString().slice(0, 10);
      const count = ctx.deals.filter(
        (d) =>
          d.stage !== "kazanildi" &&
          d.stage !== "kaybedildi" &&
          (d.customFields?.[ctx.appointmentDateTimeKey] || "").slice(0, 10) === todayStr,
      ).length;
      return `Bugün ${count} randevunuz var.`;
    },
  },
  {
    id: "group_class_count",
    category: "Randevu & Program",
    label: "Kaç grup dersim var?",
    keywords: ["kaç grup dersi", "ders sayım"],
    visibleIf: (sector) => supportsGroupClasses(sector),
    compute: (ctx) => `${ctx.groupClasses.length} grup dersiniz var.`,
  },
  {
    id: "fullest_group_class",
    category: "Randevu & Program",
    label: "Hangi dersimde en çok kayıt var?",
    keywords: ["en dolu ders", "en çok kayıtlı ders"],
    visibleIf: (sector) => supportsGroupClasses(sector),
    compute: (ctx) => {
      if (ctx.groupClasses.length === 0) return "Henüz bir dersiniz yok.";
      const totals = {};
      ctx.groupClassEnrollments.forEach((e) => {
        totals[e.groupClassId] = (totals[e.groupClassId] || 0) + 1;
      });
      const top = topEntry(totals);
      if (!top) return "Henüz hiçbir dersinize kayıt yok.";
      const cls = ctx.groupClasses.find((g) => g.id === top[0]);
      return `En dolu dersiniz "${cls?.name || "silinmiş ders"}" - ${top[1]}/${cls?.capacity ?? "?"} kayıt.`;
    },
  },
  {
    id: "business_hours_defined",
    category: "Randevu & Program",
    label: "Müsaitlik saatlerimi tanımladım mı?",
    keywords: ["müsaitlik saatleri tanımlı mı", "randevu saatlerim"],
    visibleIf: (sector) => bookingModel(sector) === "slot",
    compute: (ctx) =>
      ctx.businessHours.length > 0
        ? `Evet, ${ctx.businessHours.length} gün için müsaitlik saati tanımlı.`
        : "Henüz müsaitlik saati tanımlamadınız.",
  },
  {
    id: "team_member_count",
    category: "Takım",
    label: "Kaç takım üyem var?",
    keywords: ["kaç takım üyem var", "takım büyüklüğü", "kaç kullanıcı hakkım kaldı"],
    compute: (ctx) => {
      const total = ctx.teamMembers.length + 1;
      const remaining = MAX_TEAM_SIZE - total;
      if (ctx.teamMembers.length === 0)
        return `Henüz takım üyeniz yok, tek başınızasınız (en fazla ${MAX_TEAM_SIZE} kullanıcıya kadar davet edebilirsiniz).`;
      return remaining > 0
        ? `Siz dahil ${total} kişisiniz - ${MAX_TEAM_SIZE} kullanıcı hakkınızın ${remaining} tanesi boşta.`
        : `Siz dahil ${total} kişisiniz - ${MAX_TEAM_SIZE} kullanıcı sınırınıza ulaştınız.`;
    },
  },
  {
    id: "attachment_count",
    category: "Sistem",
    label: "Kaç dosya (ek) yüklemişim?",
    keywords: ["kaç dosya yükledim", "dosya sayım", "eklerim"],
    compute: (ctx) =>
      `Müşteri/teklif kayıtlarınıza toplam ${ctx.attachments.length} dosya eklenmiş.`,
  },
  {
    id: "custom_field_count",
    category: "Sistem",
    label: "Kaç özel alan tanımlamışım?",
    keywords: ["özel alan sayısı", "kaç özel alanım var"],
    compute: (ctx) =>
      `${ctx.customFieldDefs.filter((d) => d.active).length} aktif özel alanınız var.`,
  },
  {
    id: "price_list_count",
    category: "Sistem",
    label: "Fiyat listemde kaç ürün/hizmet var?",
    keywords: ["fiyat listesi kaç ürün", "kaç hizmetim var listede"],
    compute: (ctx) => `Fiyat listenizde ${ctx.priceListItems.length} ürün/hizmet var.`,
  },
  // ---- Satış ----
  {
    id: "revenue_this_quarter",
    category: "Satış",
    label: "Bu çeyrek toplam ne kadar kazandım?",
    keywords: ["bu çeyrek gelir", "bu çeyrek ne kadar kazandım", "çeyreklik gelir"],
    compute: (ctx) => {
      const bounds = getRangeBounds("bu_ceyrek");
      const total = ctx.deals
        .filter((d) => d.stage === "kazanildi" && inRange(d.closedAt || d.createdAt, bounds))
        .reduce((sum, d) => sum + (d.value || 0), 0);
      return `Bu çeyrek toplam ${formatTL(total)} kazandınız.`;
    },
  },
  {
    id: "revenue_last_quarter",
    category: "Satış",
    label: "Geçen çeyrek ne kadar kazandım?",
    keywords: ["geçen çeyrek gelir", "önceki çeyrek gelir"],
    compute: (ctx) => {
      const now = new Date();
      const qStartMonth = Math.floor(now.getMonth() / 3) * 3;
      const thisQStart = new Date(now.getFullYear(), qStartMonth, 1);
      const lastQStart = new Date(now.getFullYear(), qStartMonth - 3, 1);
      const lastQEnd = new Date(thisQStart.getTime() - 1);
      const total = ctx.deals
        .filter(
          (d) =>
            d.stage === "kazanildi" &&
            inRange(d.closedAt || d.createdAt, { start: lastQStart, end: lastQEnd }),
        )
        .reduce((sum, d) => sum + (d.value || 0), 0);
      return `Geçen çeyrek toplam ${formatTL(total)} kazandınız.`;
    },
  },
  {
    id: "win_rate_this_quarter",
    category: "Satış",
    label: "Bu çeyrek kazanma oranım nedir?",
    keywords: ["bu çeyrek kazanma oranı", "çeyreklik başarı oranı"],
    compute: (ctx) => {
      const bounds = getRangeBounds("bu_ceyrek");
      const closed = ctx.deals.filter(
        (d) =>
          (d.stage === "kazanildi" || d.stage === "kaybedildi") &&
          inRange(d.closedAt || d.createdAt, bounds),
      );
      const won = closed.filter((d) => d.stage === "kazanildi");
      if (closed.length === 0) return "Bu çeyrek henüz sonuçlanmış bir kaydınız yok.";
      return `Bu çeyrek kazanma oranınız %${Math.round((won.length / closed.length) * 100)} (${won.length}/${closed.length}).`;
    },
  },
  {
    id: "win_rate_last_quarter",
    category: "Satış",
    label: "Geçen çeyrek kazanma oranım neydi?",
    keywords: ["geçen çeyrek kazanma oranı", "önceki çeyrek başarı oranı"],
    compute: (ctx) => {
      const now = new Date();
      const qStartMonth = Math.floor(now.getMonth() / 3) * 3;
      const thisQStart = new Date(now.getFullYear(), qStartMonth, 1);
      const lastQStart = new Date(now.getFullYear(), qStartMonth - 3, 1);
      const lastQEnd = new Date(thisQStart.getTime() - 1);
      const closed = ctx.deals.filter(
        (d) =>
          (d.stage === "kazanildi" || d.stage === "kaybedildi") &&
          inRange(d.closedAt || d.createdAt, { start: lastQStart, end: lastQEnd }),
      );
      const won = closed.filter((d) => d.stage === "kazanildi");
      if (closed.length === 0) return "Geçen çeyrek sonuçlanmış bir kaydınız yoktu.";
      return `Geçen çeyrek kazanma oranınız %${Math.round((won.length / closed.length) * 100)} (${won.length}/${closed.length}) idi.`;
    },
  },
  {
    id: "win_rate_this_year",
    category: "Satış",
    label: "Bu yıl kazanma oranım nedir?",
    keywords: ["bu yıl kazanma oranı", "yıllık başarı oranı"],
    compute: (ctx) => {
      const bounds = getRangeBounds("bu_yil");
      const closed = ctx.deals.filter(
        (d) =>
          (d.stage === "kazanildi" || d.stage === "kaybedildi") &&
          inRange(d.closedAt || d.createdAt, bounds),
      );
      const won = closed.filter((d) => d.stage === "kazanildi");
      if (closed.length === 0) return "Bu yıl henüz sonuçlanmış bir kaydınız yok.";
      return `Bu yıl kazanma oranınız %${Math.round((won.length / closed.length) * 100)} (${won.length}/${closed.length}).`;
    },
  },
  {
    id: "yoy_revenue_comparison",
    category: "Satış",
    label: "Bu yıl geçen yıla göre ne kadar kazandım?",
    keywords: ["geçen yılla karşılaştırma", "yıllık kıyaslama", "geçen yıla göre gelir"],
    compute: (ctx) => {
      const now = new Date();
      const thisBounds = getRangeBounds("bu_yil");
      const lastBounds = {
        start: new Date(now.getFullYear() - 1, 0, 1),
        end: new Date(now.getFullYear() - 1, 11, 31, 23, 59, 59, 999),
      };
      const thisYear = ctx.deals
        .filter((d) => d.stage === "kazanildi" && inRange(d.closedAt || d.createdAt, thisBounds))
        .reduce((sum, d) => sum + (d.value || 0), 0);
      const lastYear = ctx.deals
        .filter((d) => d.stage === "kazanildi" && inRange(d.closedAt || d.createdAt, lastBounds))
        .reduce((sum, d) => sum + (d.value || 0), 0);
      if (lastYear === 0)
        return `Geçen yıl kazancınız yoktu, bu yıl ${formatTL(thisYear)} kazandınız.`;
      const change = Math.round(((thisYear - lastYear) / lastYear) * 100);
      return `Bu yıl ${formatTL(thisYear)}, geçen yıl ${formatTL(lastYear)} kazandınız (%${change > 0 ? "+" : ""}${change} değişim).`;
    },
  },
  {
    id: "mom_revenue_comparison",
    category: "Satış",
    label: "Bu ay geçen aya göre ne kadar kazandım?",
    keywords: ["geçen aya göre gelir", "aylık kıyaslama", "bir önceki aya göre"],
    compute: (ctx) => {
      const now = new Date();
      const thisBounds = getRangeBounds("bu_ay");
      const lastStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lastEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
      const thisMonth = ctx.deals
        .filter((d) => d.stage === "kazanildi" && inRange(d.closedAt || d.createdAt, thisBounds))
        .reduce((sum, d) => sum + (d.value || 0), 0);
      const lastMonth = ctx.deals
        .filter(
          (d) =>
            d.stage === "kazanildi" &&
            inRange(d.closedAt || d.createdAt, { start: lastStart, end: lastEnd }),
        )
        .reduce((sum, d) => sum + (d.value || 0), 0);
      if (lastMonth === 0)
        return `Geçen ay kazancınız yoktu, bu ay ${formatTL(thisMonth)} kazandınız.`;
      const change = Math.round(((thisMonth - lastMonth) / lastMonth) * 100);
      return `Bu ay ${formatTL(thisMonth)}, geçen ay ${formatTL(lastMonth)} kazandınız (%${change > 0 ? "+" : ""}${change} değişim).`;
    },
  },
  {
    id: "open_deals_value_total",
    category: "Satış",
    label: (sector) =>
      `Açık ${DEAL_WORD_FORMS[dealWordKind(sector)].genPlural} toplam değeri ne kadar?`,
    keywords: ["açık teklif toplam değeri", "açık fırsat değeri", "bekleyen kayıt tutarı"],
    compute: (ctx) => {
      const open = ctx.deals.filter((d) => d.stage !== "kazanildi" && d.stage !== "kaybedildi");
      const words = DEAL_WORD_FORMS[dealWordKind(ctx.companySettings?.sector)];
      if (open.length === 0) return "Şu anda açık bir kaydınız yok.";
      const total = open.reduce((sum, d) => sum + (d.value || 0), 0);
      return `Açık ${words.genPlural} toplam değeri ${formatTL(total)} (${open.length} kayıt).`;
    },
  },
  {
    id: "avg_deal_size_all_time",
    category: "Satış",
    label: "Tüm zamanlar ortalama kazanılan kayıt değeri ne kadar?",
    keywords: ["tüm zamanlar ortalama teklif", "genel ortalama kayıt değeri"],
    compute: (ctx) => {
      const won = ctx.deals.filter((d) => d.stage === "kazanildi");
      if (won.length === 0) return "Henüz kazanılmış bir kaydınız yok.";
      const avg = won.reduce((sum, d) => sum + (d.value || 0), 0) / won.length;
      return `Tüm zamanlar ortalama kazanılan kayıt değeriniz ${formatTL(avg)}.`;
    },
  },
  {
    id: "avg_deal_size_open",
    category: "Satış",
    label: "Açık kayıtlarımın ortalama değeri ne kadar?",
    keywords: ["açık kayıt ortalama değeri", "ortalama açık teklif"],
    compute: (ctx) => {
      const open = ctx.deals.filter((d) => d.stage !== "kazanildi" && d.stage !== "kaybedildi");
      if (open.length === 0) return "Şu anda açık bir kaydınız yok.";
      const avg = open.reduce((sum, d) => sum + (d.value || 0), 0) / open.length;
      return `Açık kayıtlarınızın ortalama değeri ${formatTL(avg)}.`;
    },
  },
  {
    id: "deals_by_stage_value",
    category: "Satış",
    label: "Hangi aşamada toplam ne kadar değer var?",
    keywords: ["aşama bazında değer", "aşamalara göre tutar"],
    compute: (ctx) => {
      const openDeals = ctx.deals.filter(
        (d) => d.stage !== "kazanildi" && d.stage !== "kaybedildi",
      );
      if (openDeals.length === 0) return "Şu anda açık bir kaydınız yok.";
      return STAGES.filter((s) => s.id !== "kazanildi" && s.id !== "kaybedildi")
        .map(
          (s) =>
            `${stageLabel(s.id, "kurumsal", ctx.companySettings?.sector)}: ${formatTL(openDeals.filter((d) => d.stage === s.id).reduce((sum, d) => sum + (d.value || 0), 0))}`,
        )
        .join(", ");
    },
  },
  {
    id: "deals_won_this_week",
    category: "Satış",
    label: "Bu hafta kaç kayıt kazandım?",
    keywords: ["bu hafta kazanılan", "bu hafta kaç teklif kazandım"],
    compute: (ctx) => {
      const now = new Date();
      const start = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000);
      start.setHours(0, 0, 0, 0);
      const count = ctx.deals.filter(
        (d) => d.stage === "kazanildi" && inRange(d.closedAt || d.createdAt, { start, end: now }),
      ).length;
      return `Son 7 günde ${count} kayıt kazandınız.`;
    },
  },
  {
    id: "deals_created_this_week",
    category: "Satış",
    label: "Bu hafta kaç yeni kayıt oluşturdum?",
    keywords: ["bu hafta yeni kayıt", "bu haftaki yeni teklifler"],
    compute: (ctx) => {
      const now = new Date();
      const start = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000);
      start.setHours(0, 0, 0, 0);
      const count = ctx.deals.filter((d) => inRange(d.createdAt, { start, end: now })).length;
      return `Son 7 günde ${count} yeni kayıt oluşturdunuz.`;
    },
  },
  {
    id: "deals_created_last_month",
    category: "Satış",
    label: "Geçen ay kaç yeni kayıt oluşturdum?",
    keywords: ["geçen ay yeni kayıt", "geçen ayki yeni teklifler"],
    compute: (ctx) => {
      const now = new Date();
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
      const count = ctx.deals.filter((d) => inRange(d.createdAt, { start, end })).length;
      return `Geçen ay ${count} yeni kayıt oluşturdunuz.`;
    },
  },
  {
    id: "deals_lost_this_month",
    category: "Satış",
    label: "Bu ay kaç kayıt kaybettim?",
    keywords: ["bu ay kaybedilen", "bu ay kaç teklif kaybettim"],
    compute: (ctx) => {
      const bounds = getRangeBounds("bu_ay");
      const count = ctx.deals.filter(
        (d) => d.stage === "kaybedildi" && inRange(d.closedAt || d.createdAt, bounds),
      ).length;
      return count > 0
        ? `Bu ay ${count} kayıt kaybettiniz.`
        : "Bu ay henüz kaybedilmiş bir kaydınız yok.";
    },
  },
  {
    id: "deals_lost_this_quarter",
    category: "Satış",
    label: "Bu çeyrek kaç kayıt kaybettim?",
    keywords: ["bu çeyrek kaybedilen", "çeyreklik kayıp sayısı"],
    compute: (ctx) => {
      const bounds = getRangeBounds("bu_ceyrek");
      const count = ctx.deals.filter(
        (d) => d.stage === "kaybedildi" && inRange(d.closedAt || d.createdAt, bounds),
      ).length;
      return count > 0
        ? `Bu çeyrek ${count} kayıt kaybettiniz.`
        : "Bu çeyrek henüz kaybedilmiş bir kaydınız yok.";
    },
  },
  {
    id: "top_lost_reason_month",
    category: "Satış",
    label: "Bu ay en çok hangi nedenle kaybettim?",
    keywords: ["bu ay kayıp nedeni", "bu ay en çok kaybettiğim neden"],
    compute: (ctx) => {
      const bounds = getRangeBounds("bu_ay");
      const lost = ctx.deals.filter(
        (d) =>
          d.stage === "kaybedildi" && d.lostReason && inRange(d.closedAt || d.createdAt, bounds),
      );
      if (lost.length === 0) return "Bu ay nedeni belirtilmiş kayıp bir kaydınız yok.";
      const totals = {};
      lost.forEach((d) => {
        totals[d.lostReason] = (totals[d.lostReason] || 0) + 1;
      });
      const top = topEntry(totals);
      return `Bu ay en sık kayıp nedeniniz "${top[0]}" (${top[1]} kayıt).`;
    },
  },
  {
    id: "no_show_rate_quarter",
    category: "Satış",
    label: "Bu çeyrek gelmeme oranım nedir?",
    keywords: ["bu çeyrek gelmeme oranı", "çeyreklik no-show"],
    visibleIf: (sector) => isAppointmentSector(sector),
    compute: (ctx) => {
      const bounds = getRangeBounds("bu_ceyrek");
      const closed = ctx.deals.filter(
        (d) =>
          (d.stage === "kazanildi" || d.stage === "kaybedildi") &&
          inRange(d.closedAt || d.createdAt, bounds),
      );
      const noShow = closed.filter(
        (d) => d.stage === "kaybedildi" && d.lostReason === "Randevuya gelmedi",
      );
      if (closed.length === 0) return "Bu çeyrek henüz sonuçlanmış bir randevunuz yok.";
      return `Bu çeyrek gelmeme oranınız %${Math.round((noShow.length / closed.length) * 100)} (${noShow.length}/${closed.length}).`;
    },
  },
  {
    id: "no_show_rate_all_time",
    category: "Satış",
    label: "Tüm zamanlar gelmeme oranım nedir?",
    keywords: ["tüm zamanlar gelmeme oranı", "genel no-show oranı"],
    visibleIf: (sector) => isAppointmentSector(sector),
    compute: (ctx) => {
      const closed = ctx.deals.filter((d) => d.stage === "kazanildi" || d.stage === "kaybedildi");
      const noShow = closed.filter(
        (d) => d.stage === "kaybedildi" && d.lostReason === "Randevuya gelmedi",
      );
      if (closed.length === 0) return "Henüz sonuçlanmış bir randevunuz yok.";
      return `Tüm zamanlar gelmeme oranınız %${Math.round((noShow.length / closed.length) * 100)} (${noShow.length}/${closed.length}).`;
    },
  },
  {
    id: "cancellation_rate",
    category: "Satış",
    label: "İptal oranım nedir?",
    keywords: ["iptal oranı", "randevu iptal oranı"],
    visibleIf: (sector) => isAppointmentSector(sector),
    compute: (ctx) => {
      const closed = ctx.deals.filter((d) => d.stage === "kazanildi" || d.stage === "kaybedildi");
      const cancelled = closed.filter(
        (d) =>
          d.stage === "kaybedildi" &&
          (d.lostReason === "İptal etti" || d.lostReason === "Geç iptal etti"),
      );
      if (closed.length === 0) return "Henüz sonuçlanmış bir randevunuz yok.";
      return `Tüm zamanlar iptal oranınız %${Math.round((cancelled.length / closed.length) * 100)} (${cancelled.length}/${closed.length}).`;
    },
  },
  {
    id: "top_customer_all_time",
    category: "Satış",
    label: "Tüm zamanlar en çok kazandıran müşterim kim?",
    keywords: ["tüm zamanlar en iyi müşteri", "genel en çok kazandıran müşteri"],
    compute: (ctx) => {
      const won = ctx.deals.filter((d) => d.stage === "kazanildi");
      if (won.length === 0) return "Henüz kazanılmış bir kaydınız yok.";
      const totals = {};
      won.forEach((d) => {
        totals[d.customerId] = (totals[d.customerId] || 0) + (d.value || 0);
      });
      const top = topEntry(totals);
      const customer = ctx.customers.find((c) => c.id === top[0]);
      return `${customer?.name || "Bilinmeyen müşteri"} - tüm zamanlar ${formatTL(top[1])} ile en çok kazandıran müşteriniz.`;
    },
  },
  {
    id: "top_customer_quarter",
    category: "Satış",
    label: "Bu çeyrek en çok kazandıran müşterim kim?",
    keywords: ["bu çeyrek en iyi müşteri", "çeyreklik en çok kazandıran"],
    compute: (ctx) => {
      const bounds = getRangeBounds("bu_ceyrek");
      const won = ctx.deals.filter(
        (d) => d.stage === "kazanildi" && inRange(d.closedAt || d.createdAt, bounds),
      );
      if (won.length === 0) return "Bu çeyrek henüz kazanılmış bir kaydınız yok.";
      const totals = {};
      won.forEach((d) => {
        totals[d.customerId] = (totals[d.customerId] || 0) + (d.value || 0);
      });
      const top = topEntry(totals);
      const customer = ctx.customers.find((c) => c.id === top[0]);
      return `${customer?.name || "Bilinmeyen müşteri"} - bu çeyrek ${formatTL(top[1])} ile en çok kazandıran müşteriniz.`;
    },
  },
  {
    id: "top_customer_year",
    category: "Satış",
    label: "Bu yıl en çok kazandıran müşterim kim?",
    keywords: ["bu yıl en iyi müşteri", "yıllık en çok kazandıran"],
    compute: (ctx) => {
      const bounds = getRangeBounds("bu_yil");
      const won = ctx.deals.filter(
        (d) => d.stage === "kazanildi" && inRange(d.closedAt || d.createdAt, bounds),
      );
      if (won.length === 0) return "Bu yıl henüz kazanılmış bir kaydınız yok.";
      const totals = {};
      won.forEach((d) => {
        totals[d.customerId] = (totals[d.customerId] || 0) + (d.value || 0);
      });
      const top = topEntry(totals);
      const customer = ctx.customers.find((c) => c.id === top[0]);
      return `${customer?.name || "Bilinmeyen müşteri"} - bu yıl ${formatTL(top[1])} ile en çok kazandıran müşteriniz.`;
    },
  },
  {
    id: "biggest_single_deal_ever",
    category: "Satış",
    label: "En büyük tek kazanılan kaydım hangisi?",
    keywords: ["en büyük kazanılan kayıt", "en yüksek tekli teklif", "rekor teklif"],
    compute: (ctx) => {
      const won = ctx.deals.filter((d) => d.stage === "kazanildi");
      if (won.length === 0) return "Henüz kazanılmış bir kaydınız yok.";
      const top = [...won].sort((a, b) => (b.value || 0) - (a.value || 0))[0];
      const customer = ctx.customers.find((c) => c.id === top.customerId);
      return `"${top.title}" (${customer?.name || "müşteri silinmiş"}) - ${formatTL(top.value)} ile en büyük kazanılan kaydınız.`;
    },
  },
  {
    id: "highest_value_customer_lifetime",
    category: "Satış",
    label: "En değerli müşterim kim (tüm zamanlar toplam)?",
    keywords: ["en değerli müşteri", "yaşam boyu değer", "en kârlı müşteri"],
    compute: (ctx) => {
      const won = ctx.deals.filter((d) => d.stage === "kazanildi");
      if (won.length === 0) return "Henüz kazanılmış bir kaydınız yok.";
      const totals = {};
      won.forEach((d) => {
        totals[d.customerId] = (totals[d.customerId] || 0) + (d.value || 0);
      });
      const top = topEntry(totals);
      const customer = ctx.customers.find((c) => c.id === top[0]);
      const count = won.filter((d) => d.customerId === top[0]).length;
      return `${customer?.name || "Bilinmeyen müşteri"} - bugüne kadar ${count} kayıtla toplam ${formatTL(top[1])} kazandırdı.`;
    },
  },
  {
    id: "deals_without_tag_count",
    category: "Satış",
    label: "Etiketi olmayan kaç kaydım var?",
    keywords: ["etiketsiz kayıt", "etiketi olmayan teklif"],
    compute: (ctx) => {
      const count = ctx.deals.filter((d) => !(d.tags && d.tags.length > 0)).length;
      return `Etiketi olmayan ${count} kaydınız var.`;
    },
  },
  {
    id: "deals_without_reminder_count",
    category: "Satış",
    label: "Hatırlatması olmayan kaç açık kaydım var?",
    keywords: ["hatırlatmasız kayıt", "hatırlatması olmayan teklif"],
    compute: (ctx) => {
      const open = ctx.deals.filter((d) => d.stage !== "kazanildi" && d.stage !== "kaybedildi");
      const count = open.filter((d) => !d.reminderDate).length;
      return open.length === 0
        ? "Şu anda açık bir kaydınız yok."
        : `Açık kayıtlarınızdan ${count} tanesinde hatırlatma tarihi girilmemiş.`;
    },
  },
  {
    id: "top_tag_won_deals",
    category: "Satış",
    label: "Kazanılan kayıtlarda en çok kullanılan etiket hangisi?",
    keywords: ["kazanılan kayıt etiketi", "kazanılan tekliflerin etiketi"],
    compute: (ctx) => {
      const won = ctx.deals.filter((d) => d.stage === "kazanildi");
      const totals = {};
      won.forEach((d) =>
        (d.tags || []).forEach((t) => {
          totals[t] = (totals[t] || 0) + 1;
        }),
      );
      const top = topEntry(totals);
      return top
        ? `Kazanılan kayıtlarda en çok kullanılan etiket "${top[0]}" (${top[1]} kayıtta).`
        : "Kazanılan kayıtlarınıza henüz etiket eklenmemiş.";
    },
  },
  {
    id: "session_package_count",
    category: "Satış",
    label: "Seansı devam eden kaç paketim var?",
    keywords: ["devam eden paket", "seansı bitmeyen paket", "kalan seans"],
    visibleIf: (sector) => supportsSessionPackages(sector),
    compute: (ctx) => {
      const packages = ctx.deals.filter(
        (d) =>
          d.stage === "kazanildi" &&
          d.sessionTotal != null &&
          (d.sessionUsed || 0) < d.sessionTotal,
      );
      return packages.length > 0
        ? `Seansı bitmemiş ${packages.length} paketiniz var.`
        : "Seansı devam eden bir paketiniz şu anda yok.";
    },
  },
  {
    id: "avg_session_usage_rate",
    category: "Satış",
    label: "Seans paketlerimde ortalama kullanım oranı nedir?",
    keywords: ["ortalama seans kullanımı", "paket kullanım oranı"],
    visibleIf: (sector) => supportsSessionPackages(sector),
    compute: (ctx) => {
      const packages = ctx.deals.filter((d) => d.sessionTotal != null && d.sessionTotal > 0);
      if (packages.length === 0) return "Henüz seans paketi tanımlı bir kaydınız yok.";
      const avg =
        packages.reduce((sum, d) => sum + (d.sessionUsed || 0) / d.sessionTotal, 0) /
        packages.length;
      return `Seans paketlerinizde ortalama kullanım oranı %${Math.round(avg * 100)}.`;
    },
  },
  {
    id: "session_packages_near_completion",
    category: "Satış",
    label: "Son seansına gelmiş kaç paketim var?",
    keywords: ["son seans", "bitmek üzere olan paket", "yenileme fırsatı"],
    visibleIf: (sector) => supportsSessionPackages(sector),
    compute: (ctx) => {
      const near = ctx.deals.filter(
        (d) =>
          d.stage === "kazanildi" &&
          d.sessionTotal != null &&
          d.sessionTotal - (d.sessionUsed || 0) === 1,
      );
      return near.length > 0
        ? `Son seansına gelmiş ${near.length} paketiniz var - yenileme teklifi için iyi bir fırsat.`
        : "Son seansına gelmiş bir paketiniz şu anda yok.";
    },
  },
  {
    id: "unassigned_deals_count",
    category: "Satış",
    label: "Sorumlusu atanmamış kaç açık kaydım var?",
    keywords: ["sorumlusu olmayan kayıt", "atanmamış teklif"],
    compute: (ctx) => {
      const open = ctx.deals.filter((d) => d.stage !== "kazanildi" && d.stage !== "kaybedildi");
      const count = open.filter((d) => !d.assignedTo).length;
      return open.length === 0
        ? "Şu anda açık bir kaydınız yok."
        : `Sorumlusu atanmamış ${count} açık kaydınız var.`;
    },
  },
  {
    id: "deals_missing_value_count",
    category: "Satış",
    label: "Tutarı girilmemiş kaç açık kaydım var?",
    keywords: ["tutarsız kayıt", "değeri girilmemiş teklif", "0 tl teklif"],
    compute: (ctx) => {
      const open = ctx.deals.filter((d) => d.stage !== "kazanildi" && d.stage !== "kaybedildi");
      const count = open.filter((d) => !d.value || d.value === 0).length;
      return open.length === 0
        ? "Şu anda açık bir kaydınız yok."
        : `Tutarı girilmemiş (0 TL) ${count} açık kaydınız var.`;
    },
  },
  {
    id: "this_quarter_new_deals",
    category: "Satış",
    label: "Bu çeyrek kaç yeni kayıt oluşturdum?",
    keywords: ["bu çeyrek yeni kayıt", "çeyreklik yeni teklif sayısı"],
    compute: (ctx) => {
      const bounds = getRangeBounds("bu_ceyrek");
      const count = ctx.deals.filter((d) => inRange(d.createdAt, bounds)).length;
      return `Bu çeyrek ${count} yeni kayıt oluşturdunuz.`;
    },
  },
  {
    id: "this_year_new_deals",
    category: "Satış",
    label: "Bu yıl kaç yeni kayıt oluşturdum?",
    keywords: ["bu yıl yeni kayıt", "yıllık yeni teklif sayısı"],
    compute: (ctx) => {
      const bounds = getRangeBounds("bu_yil");
      const count = ctx.deals.filter((d) => inRange(d.createdAt, bounds)).length;
      return `Bu yıl ${count} yeni kayıt oluşturdunuz.`;
    },
  },
  {
    id: "last_year_revenue",
    category: "Satış",
    label: "Geçen yıl toplam ne kadar kazandım?",
    keywords: ["geçen yıl gelir", "geçen yılki toplam kazanç"],
    compute: (ctx) => {
      const now = new Date();
      const start = new Date(now.getFullYear() - 1, 0, 1);
      const end = new Date(now.getFullYear() - 1, 11, 31, 23, 59, 59, 999);
      const total = ctx.deals
        .filter(
          (d) => d.stage === "kazanildi" && inRange(d.closedAt || d.createdAt, { start, end }),
        )
        .reduce((sum, d) => sum + (d.value || 0), 0);
      return `Geçen yıl toplam ${formatTL(total)} kazandınız.`;
    },
  },
  {
    id: "best_month_this_year",
    category: "Satış",
    label: "Bu yıl en iyi ayım hangisiydi?",
    keywords: ["en iyi ay", "yılın en iyi ayı", "en çok kazandığım ay"],
    compute: (ctx) => {
      const bounds = getRangeBounds("bu_yil");
      const won = ctx.deals.filter(
        (d) => d.stage === "kazanildi" && inRange(d.closedAt || d.createdAt, bounds),
      );
      if (won.length === 0) return "Bu yıl henüz kazanılmış bir kaydınız yok.";
      const totals = {};
      won.forEach((d) => {
        const date = new Date(d.closedAt || d.createdAt);
        const key = date.getMonth();
        totals[key] = (totals[key] || 0) + (d.value || 0);
      });
      const top = topEntry(totals);
      const monthNames = [
        "Ocak",
        "Şubat",
        "Mart",
        "Nisan",
        "Mayıs",
        "Haziran",
        "Temmuz",
        "Ağustos",
        "Eylül",
        "Ekim",
        "Kasım",
        "Aralık",
      ];
      return `Bu yılın en iyi ayı ${monthNames[Number(top[0])]} - ${formatTL(top[1])} kazandınız.`;
    },
  },
  {
    id: "avg_deal_cost_ratio",
    category: "Satış",
    label: "Kazanılan kayıtlarımda ortalama maliyet oranı nedir?",
    keywords: ["ortalama maliyet oranı", "maliyet yüzdesi"],
    compute: (ctx) => {
      const won = ctx.deals.filter((d) => d.stage === "kazanildi" && (d.value || 0) > 0);
      if (won.length === 0) return "Henüz kazanılmış bir kaydınız yok.";
      const avg = won.reduce((sum, d) => sum + (d.cost || 0) / d.value, 0) / won.length;
      return `Kazanılan kayıtlarınızda ortalama maliyet oranınız %${Math.round(avg * 100)}.`;
    },
  },
  {
    id: "deals_with_cost_count",
    category: "Satış",
    label: "Maliyeti girilmiş kaç kazanılan kaydım var?",
    keywords: ["maliyetli kayıt", "maliyeti olan teklif sayısı"],
    compute: (ctx) => {
      const won = ctx.deals.filter((d) => d.stage === "kazanildi");
      const withCost = won.filter((d) => (d.cost || 0) > 0).length;
      return won.length === 0
        ? "Henüz kazanılmış bir kaydınız yok."
        : `Kazanılan ${won.length} kaydınızdan ${withCost} tanesinde maliyet girilmiş.`;
    },
  },
  {
    id: "quarter_over_quarter_change",
    category: "Satış",
    label: "Bu çeyrek geçen çeyreğe göre nasıl gidiyorum?",
    keywords: ["çeyrek karşılaştırması", "çeyrekten çeyreğe değişim"],
    compute: (ctx) => {
      const now = new Date();
      const qStartMonth = Math.floor(now.getMonth() / 3) * 3;
      const thisQStart = new Date(now.getFullYear(), qStartMonth, 1);
      const lastQStart = new Date(now.getFullYear(), qStartMonth - 3, 1);
      const lastQEnd = new Date(thisQStart.getTime() - 1);
      const thisQ = ctx.deals
        .filter(
          (d) =>
            d.stage === "kazanildi" &&
            inRange(d.closedAt || d.createdAt, {
              start: thisQStart,
              end: getRangeBounds("bu_ceyrek").end,
            }),
        )
        .reduce((sum, d) => sum + (d.value || 0), 0);
      const lastQ = ctx.deals
        .filter(
          (d) =>
            d.stage === "kazanildi" &&
            inRange(d.closedAt || d.createdAt, { start: lastQStart, end: lastQEnd }),
        )
        .reduce((sum, d) => sum + (d.value || 0), 0);
      if (lastQ === 0)
        return `Geçen çeyrek kazancınız yoktu, bu çeyrek ${formatTL(thisQ)} kazandınız.`;
      const change = Math.round(((thisQ - lastQ) / lastQ) * 100);
      return `Bu çeyrek ${formatTL(thisQ)}, geçen çeyrek ${formatTL(lastQ)} kazandınız (%${change > 0 ? "+" : ""}${change} değişim).`;
    },
  },
  {
    id: "deals_open_over_30_days_count",
    category: "Satış",
    label: "30 günden uzun süredir açık kaç kaydım var?",
    keywords: ["30 günden eski açık kayıt", "uzun süredir açık teklifler"],
    compute: (ctx) => {
      const open = ctx.deals.filter((d) => d.stage !== "kazanildi" && d.stage !== "kaybedildi");
      const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
      const count = open.filter((d) => new Date(d.createdAt).getTime() < cutoff).length;
      return open.length === 0
        ? "Şu anda açık bir kaydınız yok."
        : `30 günden uzun süredir açık ${count} kaydınız var.`;
    },
  },
  {
    id: "deals_stalled_in_negotiation_count",
    category: "Satış",
    label: "Müzakere aşamasında kaç kaydım var?",
    keywords: ["müzakerede kaç kayıt", "pazarlık aşamasındaki kayıtlar"],
    compute: (ctx) => {
      const count = ctx.deals.filter((d) => d.stage === "muzakere").length;
      return `${stageLabel("muzakere", "kurumsal", ctx.companySettings?.sector)} aşamasında ${count} kaydınız var.`;
    },
  },

  // ---- Müşteri ----
  {
    id: "customers_by_region_breakdown",
    category: "Müşteri",
    label: "Bölgelere göre müşteri dağılımım nasıl?",
    keywords: ["bölge dağılımı tam liste", "bölgelere göre müşteri sayısı"],
    compute: (ctx) => {
      const totals = {};
      ctx.customers.forEach((c) => {
        if (c.region) totals[c.region] = (totals[c.region] || 0) + 1;
      });
      const entries = Object.entries(totals).sort((a, b) => b[1] - a[1]);
      return entries.length > 0
        ? entries.map(([k, v]) => `${k}: ${v}`).join(", ")
        : "Müşterilerinizde henüz bölge bilgisi girilmemiş.";
    },
  },
  {
    id: "customers_by_sector_breakdown",
    category: "Müşteri",
    label: "Sektörlere göre müşteri dağılımım nasıl?",
    keywords: ["sektör dağılımı tam liste", "sektörlere göre müşteri sayısı"],
    compute: (ctx) => {
      const totals = {};
      ctx.customers.forEach((c) => {
        if (c.sector) totals[c.sector] = (totals[c.sector] || 0) + 1;
      });
      const entries = Object.entries(totals).sort((a, b) => b[1] - a[1]);
      return entries.length > 0
        ? entries.map(([k, v]) => `${k}: ${v}`).join(", ")
        : "Müşterilerinizde henüz sektör bilgisi girilmemiş.";
    },
  },
  {
    id: "customers_with_open_deal_count",
    category: "Müşteri",
    label: "Açık kaydı olan kaç müşterim var?",
    keywords: ["açık kaydı olan müşteri", "bekleyen teklifi olan müşteri sayısı"],
    compute: (ctx) => {
      const open = ctx.deals.filter((d) => d.stage !== "kazanildi" && d.stage !== "kaybedildi");
      const ids = new Set(open.map((d) => d.customerId));
      return `${ids.size} müşterinizin açık bir kaydı var.`;
    },
  },
  {
    id: "customers_without_any_deal",
    category: "Müşteri",
    label: "Hiç kaydı olmayan kaç müşterim var?",
    keywords: ["kaydı olmayan müşteri", "hiç teklifi olmayan müşteri"],
    compute: (ctx) => {
      const withDeal = new Set(ctx.deals.map((d) => d.customerId));
      const count = ctx.customers.filter((c) => !withDeal.has(c.id)).length;
      return count > 0
        ? `${count} müşterinizin hiç kaydı yok.`
        : "Tüm müşterilerinizin en az bir kaydı var.";
    },
  },
  {
    id: "customers_added_this_quarter",
    category: "Müşteri",
    label: "Bu çeyrek kaç yeni müşteri kazandım?",
    keywords: ["bu çeyrek yeni müşteri", "çeyreklik yeni müşteri sayısı"],
    compute: (ctx) => {
      const bounds = getRangeBounds("bu_ceyrek");
      return `Bu çeyrek ${ctx.customers.filter((c) => inRange(c.createdAt, bounds)).length} yeni müşteri kazandınız.`;
    },
  },
  {
    id: "customers_added_this_year",
    category: "Müşteri",
    label: "Bu yıl kaç yeni müşteri kazandım?",
    keywords: ["bu yıl yeni müşteri", "yıllık yeni müşteri sayısı"],
    compute: (ctx) => {
      const bounds = getRangeBounds("bu_yil");
      return `Bu yıl ${ctx.customers.filter((c) => inRange(c.createdAt, bounds)).length} yeni müşteri kazandınız.`;
    },
  },
  {
    id: "customers_added_last_month",
    category: "Müşteri",
    label: "Geçen ay kaç yeni müşteri kazandım?",
    keywords: ["geçen ay yeni müşteri", "geçen ayki yeni müşteri sayısı"],
    compute: (ctx) => {
      const now = new Date();
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
      return `Geçen ay ${ctx.customers.filter((c) => inRange(c.createdAt, { start, end })).length} yeni müşteri kazandınız.`;
    },
  },
  {
    id: "customers_added_this_week",
    category: "Müşteri",
    label: "Bu hafta kaç yeni müşteri kazandım?",
    keywords: ["bu hafta yeni müşteri", "haftalık yeni müşteri sayısı"],
    compute: (ctx) => {
      const now = new Date();
      const start = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000);
      start.setHours(0, 0, 0, 0);
      return `Son 7 günde ${ctx.customers.filter((c) => inRange(c.createdAt, { start, end: now })).length} yeni müşteri kazandınız.`;
    },
  },
  {
    id: "avg_customer_age_days",
    category: "Müşteri",
    label: "Müşterilerim ortalama ne kadar süredir kayıtlı?",
    keywords: ["ortalama müşteri yaşı", "müşteri kayıt süresi"],
    compute: (ctx) => {
      if (ctx.customers.length === 0) return "Henüz müşteriniz yok.";
      const avgDays =
        ctx.customers.reduce(
          (sum, c) => sum + (Date.now() - new Date(c.createdAt).getTime()) / (24 * 60 * 60 * 1000),
          0,
        ) / ctx.customers.length;
      return `Müşterileriniz ortalama ${Math.round(avgDays)} gündür sisteminizde kayıtlı.`;
    },
  },
  {
    id: "customer_with_most_deals",
    category: "Müşteri",
    label: "En çok kaydı olan müşterim kim?",
    keywords: ["en çok kayıt olan müşteri", "en fazla teklifi olan müşteri"],
    compute: (ctx) => {
      if (ctx.deals.length === 0) return "Henüz bir kaydınız yok.";
      const totals = {};
      ctx.deals.forEach((d) => {
        totals[d.customerId] = (totals[d.customerId] || 0) + 1;
      });
      const top = topEntry(totals);
      const customer = ctx.customers.find((c) => c.id === top[0]);
      return `${customer?.name || "Bilinmeyen müşteri"} - ${top[1]} kayıtla en çok kaydı olan müşteriniz.`;
    },
  },
  {
    id: "customer_with_highest_single_deal",
    category: "Müşteri",
    label: "Hangi müşterimle en yüksek tutarlı tek kayıt yaptım?",
    keywords: ["en yüksek tutarlı müşteri kaydı", "tekli en büyük kayıt hangi müşteri"],
    compute: (ctx) => {
      if (ctx.deals.length === 0) return "Henüz bir kaydınız yok.";
      const top = [...ctx.deals].sort((a, b) => (b.value || 0) - (a.value || 0))[0];
      const customer = ctx.customers.find((c) => c.id === top.customerId);
      return `${customer?.name || "Bilinmeyen müşteri"} - "${top.title}" kaydı ${formatTL(top.value)} ile en yüksek tutarlı tekli kaydınız.`;
    },
  },
  {
    id: "customers_missing_region",
    category: "Müşteri",
    label: "Bölgesi girilmemiş kaç müşterim var?",
    keywords: ["bölgesi olmayan müşteri", "bölge bilgisi eksik"],
    compute: (ctx) =>
      `Bölgesi girilmemiş ${ctx.customers.filter((c) => !c.region).length} müşteriniz var.`,
  },
  {
    id: "customers_missing_notes",
    category: "Müşteri",
    label: "Notu girilmemiş kaç müşterim var?",
    keywords: ["notu olmayan müşteri", "not eksik müşteri"],
    compute: (ctx) =>
      `Notu girilmemiş ${ctx.customers.filter((c) => !c.notes).length} müşteriniz var.`,
  },
  {
    id: "customers_with_portal_access",
    category: "Müşteri",
    label: "Kaç müşterim portala kayıt olmuş?",
    keywords: ["portala kayıtlı müşteri", "müşteri portalı kullanan"],
    compute: (ctx) => {
      const count = ctx.customers.filter((c) => c.portalUserId).length;
      return count > 0
        ? `${count} müşteriniz kendi portal hesabını oluşturmuş.`
        : "Henüz portala kayıt olan bir müşteriniz yok.";
    },
  },
  {
    id: "customers_without_portal_access",
    category: "Müşteri",
    label: "Kaç müşterim henüz portala kayıt olmamış?",
    keywords: ["portala kayıt olmamış müşteri", "portalsız müşteri"],
    compute: (ctx) => {
      if (ctx.customers.length === 0) return "Henüz müşteriniz yok.";
      const count = ctx.customers.filter((c) => !c.portalUserId).length;
      return `${count} müşteriniz henüz portala kayıt olmamış.`;
    },
  },
  {
    id: "customer_tags_breakdown",
    category: "Müşteri",
    label: "Müşteri etiketlerimin tam dağılımı nasıl?",
    keywords: ["müşteri etiket dağılımı tam liste", "tüm müşteri etiketleri"],
    compute: (ctx) => {
      const totals = {};
      ctx.customers.forEach((c) =>
        (c.tags || []).forEach((t) => {
          totals[t] = (totals[t] || 0) + 1;
        }),
      );
      const entries = Object.entries(totals).sort((a, b) => b[1] - a[1]);
      return entries.length > 0
        ? entries.map(([k, v]) => `${k}: ${v}`).join(", ")
        : "Henüz hiçbir müşterinize etiket eklenmemiş.";
    },
  },
  {
    id: "customers_without_tags_count",
    category: "Müşteri",
    label: "Etiketi olmayan kaç müşterim var?",
    keywords: ["etiketsiz müşteri", "etiketi olmayan müşteri sayısı"],
    compute: (ctx) =>
      `Etiketi olmayan ${ctx.customers.filter((c) => !(c.tags && c.tags.length > 0)).length} müşteriniz var.`,
  },
  {
    id: "longest_inactive_customer",
    category: "Müşteri",
    label: "En uzun süredir temas etmediğim müşterim kim?",
    keywords: ["en uzun süredir temas edilmeyen", "en soğuk müşteri"],
    compute: (ctx) => {
      const withContact = ctx.customers.filter((c) => c.lastContact);
      if (withContact.length === 0) return "Henüz temas tarihi girilmiş bir müşteriniz yok.";
      const oldest = [...withContact].sort(
        (a, b) => new Date(a.lastContact) - new Date(b.lastContact),
      )[0];
      const days = Math.floor(
        (Date.now() - new Date(oldest.lastContact).getTime()) / (24 * 60 * 60 * 1000),
      );
      return `${oldest.name} - ${days} gündür temas edilmemiş.`;
    },
  },
  {
    id: "customers_contacted_this_week",
    category: "Müşteri",
    label: "Bu hafta kaç müşteriyle temas ettim?",
    keywords: ["bu hafta temas edilen müşteri", "haftalık temas sayısı"],
    compute: (ctx) => {
      const now = new Date();
      const start = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000);
      start.setHours(0, 0, 0, 0);
      const count = ctx.customers.filter((c) => inRange(c.lastContact, { start, end: now })).length;
      return `Son 7 günde ${count} müşteriyle temas ettiniz.`;
    },
  },
  {
    id: "customers_never_contacted",
    category: "Müşteri",
    label: "Hiç temas kaydı olmayan kaç müşterim var?",
    keywords: ["hiç temas edilmemiş müşteri", "temas kaydı olmayan"],
    compute: (ctx) => {
      const count = ctx.customers.filter((c) => !c.lastContact).length;
      return count > 0
        ? `${count} müşterinizde hiç son temas tarihi girilmemiş.`
        : "Tüm müşterilerinizde son temas tarihi girilmiş.";
    },
  },
  {
    id: "individual_vs_corporate_revenue",
    category: "Müşteri",
    label: "Kurumsal mı bireysel müşterilerden mi daha çok kazanıyorum?",
    keywords: ["kurumsal bireysel gelir karşılaştırması", "müşteri türüne göre gelir"],
    compute: (ctx) => {
      const won = ctx.deals.filter((d) => d.stage === "kazanildi");
      if (won.length === 0) return "Henüz kazanılmış bir kaydınız yok.";
      let kurumsal = 0,
        bireysel = 0;
      won.forEach((d) => {
        const customer = ctx.customers.find((c) => c.id === d.customerId);
        if (customer?.customerType === "bireysel") bireysel += d.value || 0;
        else kurumsal += d.value || 0;
      });
      return `Kurumsal müşterilerden ${formatTL(kurumsal)}, bireysel müşterilerden ${formatTL(bireysel)} kazandınız.`;
    },
  },
  {
    id: "top_region_revenue",
    category: "Müşteri",
    label: "En çok gelir getiren bölge hangisi?",
    keywords: ["en çok kazandıran bölge", "bölgeye göre gelir"],
    compute: (ctx) => {
      const won = ctx.deals.filter((d) => d.stage === "kazanildi");
      if (won.length === 0) return "Henüz kazanılmış bir kaydınız yok.";
      const totals = {};
      won.forEach((d) => {
        const customer = ctx.customers.find((c) => c.id === d.customerId);
        if (customer?.region)
          totals[customer.region] = (totals[customer.region] || 0) + (d.value || 0);
      });
      const top = topEntry(totals);
      return top
        ? `En çok gelir getiren bölgeniz "${top[0]}" (${formatTL(top[1])}).`
        : "Kazanılan kayıtlarınızdaki müşterilerde henüz bölge bilgisi girilmemiş.";
    },
  },
  {
    id: "top_customer_sector_revenue",
    category: "Müşteri",
    label: "En çok gelir getiren müşteri sektörü hangisi?",
    keywords: ["en çok kazandıran müşteri sektörü", "müşteri sektörüne göre gelir"],
    compute: (ctx) => {
      const won = ctx.deals.filter((d) => d.stage === "kazanildi");
      if (won.length === 0) return "Henüz kazanılmış bir kaydınız yok.";
      const totals = {};
      won.forEach((d) => {
        const customer = ctx.customers.find((c) => c.id === d.customerId);
        if (customer?.sector)
          totals[customer.sector] = (totals[customer.sector] || 0) + (d.value || 0);
      });
      const top = topEntry(totals);
      return top
        ? `En çok gelir getiren müşteri sektörünüz "${top[0]}" (${formatTL(top[1])}).`
        : "Kazanılan kayıtlarınızdaki müşterilerde henüz sektör bilgisi girilmemiş.";
    },
  },
  {
    id: "customers_complete_profile_count",
    category: "Müşteri",
    label: "Hem telefonu hem e-postası olan kaç müşterim var?",
    keywords: ["tam dolu müşteri profili", "eksiksiz müşteri bilgisi"],
    compute: (ctx) => {
      if (ctx.customers.length === 0) return "Henüz müşteriniz yok.";
      const count = ctx.customers.filter((c) => c.phone && c.email).length;
      return `${count} müşterinizin hem telefonu hem e-postası kayıtlı (toplam ${ctx.customers.length} müşteriden).`;
    },
  },
  {
    id: "customer_growth_rate_mom",
    category: "Müşteri",
    label: "Müşteri kazanma hızım geçen aya göre nasıl değişti?",
    keywords: ["müşteri büyüme oranı", "geçen aya göre yeni müşteri değişimi"],
    compute: (ctx) => {
      const now = new Date();
      const thisBounds = getRangeBounds("bu_ay");
      const lastStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lastEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
      const thisMonth = ctx.customers.filter((c) => inRange(c.createdAt, thisBounds)).length;
      const lastMonth = ctx.customers.filter((c) =>
        inRange(c.createdAt, { start: lastStart, end: lastEnd }),
      ).length;
      if (lastMonth === 0)
        return `Geçen ay yeni müşteriniz yoktu, bu ay ${thisMonth} yeni müşteri kazandınız.`;
      const change = Math.round(((thisMonth - lastMonth) / lastMonth) * 100);
      return `Bu ay ${thisMonth}, geçen ay ${lastMonth} yeni müşteri kazandınız (%${change > 0 ? "+" : ""}${change} değişim).`;
    },
  },
  {
    id: "top_customer_by_deal_count_quarter",
    category: "Müşteri",
    label: "Bu çeyrek en çok kayıt açtığım müşteri kim?",
    keywords: ["bu çeyrek en çok kayıt açılan müşteri", "çeyreklik en aktif müşteri"],
    compute: (ctx) => {
      const bounds = getRangeBounds("bu_ceyrek");
      const deals = ctx.deals.filter((d) => inRange(d.createdAt, bounds));
      if (deals.length === 0) return "Bu çeyrek henüz yeni bir kaydınız yok.";
      const totals = {};
      deals.forEach((d) => {
        totals[d.customerId] = (totals[d.customerId] || 0) + 1;
      });
      const top = topEntry(totals);
      const customer = ctx.customers.find((c) => c.id === top[0]);
      return `${customer?.name || "Bilinmeyen müşteri"} - bu çeyrek ${top[1]} yeni kayıtla en çok kayıt açtığınız müşteri.`;
    },
  },
  {
    id: "customers_inactive_180_days",
    category: "Müşteri",
    label: "180 gündür işlem yapmayan kaç müşterim var?",
    keywords: ["180 gün işlem yapmayan müşteri", "6 aydır alışverişi olmayan müşteri"],
    compute: (ctx) => {
      const won = ctx.deals.filter((d) => d.stage === "kazanildi");
      const everWonCustomerIds = new Set(won.map((d) => d.customerId));
      if (everWonCustomerIds.size === 0) return "Henüz kazanılmış bir kaydınız yok.";
      const cutoff = Date.now() - 180 * 24 * 60 * 60 * 1000;
      const recentCustomerIds = new Set(
        won
          .filter((d) => new Date(d.closedAt || d.createdAt).getTime() >= cutoff)
          .map((d) => d.customerId),
      );
      const inactiveCount = [...everWonCustomerIds].filter(
        (id) => !recentCustomerIds.has(id),
      ).length;
      return `${inactiveCount} müşteriniz son 180 gündür işlem yapmadı (toplam ${everWonCustomerIds.size} müşteriden).`;
    },
  },
  {
    id: "repeat_customers_count",
    category: "Müşteri",
    label: "Birden fazla kazanılan kaydı olan kaç müşterim var?",
    keywords: ["tekrar eden müşteri", "birden fazla kez satın alan müşteri"],
    compute: (ctx) => {
      const won = ctx.deals.filter((d) => d.stage === "kazanildi");
      if (won.length === 0) return "Henüz kazanılmış bir kaydınız yok.";
      const totals = {};
      won.forEach((d) => {
        totals[d.customerId] = (totals[d.customerId] || 0) + 1;
      });
      const repeatCount = Object.values(totals).filter((v) => v > 1).length;
      return `${repeatCount} müşteriniz birden fazla kez sizden satın aldı.`;
    },
  },
  {
    id: "one_time_customers_count",
    category: "Müşteri",
    label: "Sadece bir kez satın alan kaç müşterim var?",
    keywords: ["tek seferlik müşteri", "bir kez satın alan müşteri"],
    compute: (ctx) => {
      const won = ctx.deals.filter((d) => d.stage === "kazanildi");
      if (won.length === 0) return "Henüz kazanılmış bir kaydınız yok.";
      const totals = {};
      won.forEach((d) => {
        totals[d.customerId] = (totals[d.customerId] || 0) + 1;
      });
      const oneTimeCount = Object.values(totals).filter((v) => v === 1).length;
      return `${oneTimeCount} müşteriniz sizden yalnızca bir kez satın aldı.`;
    },
  },
  {
    id: "avg_deals_per_customer",
    category: "Müşteri",
    label: "Müşteri başına ortalama kaç kaydım var?",
    keywords: ["müşteri başına ortalama kayıt", "müşteri başına teklif sayısı"],
    compute: (ctx) => {
      if (ctx.customers.length === 0) return "Henüz müşteriniz yok.";
      return `Müşteri başına ortalama ${(ctx.deals.length / ctx.customers.length).toFixed(1)} kaydınız var.`;
    },
  },

  // ---- Finans ----
  {
    id: "collected_this_quarter",
    category: "Finans",
    label: "Bu çeyrek ne kadar tahsilat aldım?",
    keywords: ["bu çeyrek tahsilat", "çeyreklik tahsilat"],
    compute: (ctx) => {
      const bounds = getRangeBounds("bu_ceyrek");
      const total = ctx.payments
        .filter((p) => inRange(p.paidAt, bounds))
        .reduce((sum, p) => sum + (p.amount || 0), 0);
      return `Bu çeyrek toplam ${formatTL(total)} tahsilat aldınız.`;
    },
  },
  {
    id: "collected_this_year",
    category: "Finans",
    label: "Bu yıl ne kadar tahsilat aldım?",
    keywords: ["bu yıl tahsilat", "yıllık tahsilat"],
    compute: (ctx) => {
      const bounds = getRangeBounds("bu_yil");
      const total = ctx.payments
        .filter((p) => inRange(p.paidAt, bounds))
        .reduce((sum, p) => sum + (p.amount || 0), 0);
      return `Bu yıl toplam ${formatTL(total)} tahsilat aldınız.`;
    },
  },
  {
    id: "collected_last_year",
    category: "Finans",
    label: "Geçen yıl ne kadar tahsilat aldım?",
    keywords: ["geçen yıl tahsilat", "geçen yılki toplam tahsilat"],
    compute: (ctx) => {
      const now = new Date();
      const start = new Date(now.getFullYear() - 1, 0, 1);
      const end = new Date(now.getFullYear() - 1, 11, 31, 23, 59, 59, 999);
      const total = ctx.payments
        .filter((p) => inRange(p.paidAt, { start, end }))
        .reduce((sum, p) => sum + (p.amount || 0), 0);
      return `Geçen yıl toplam ${formatTL(total)} tahsilat aldınız.`;
    },
  },
  {
    id: "weekly_collection_this_week",
    category: "Finans",
    label: "Son 7 günde ne kadar tahsilat aldım?",
    keywords: ["son 7 gün tahsilat", "haftalık tahsilat"],
    compute: (ctx) => {
      const now = new Date();
      const start = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000);
      start.setHours(0, 0, 0, 0);
      const total = ctx.payments
        .filter((p) => inRange(p.paidAt, { start, end: now }))
        .reduce((sum, p) => sum + (p.amount || 0), 0);
      return `Son 7 günde toplam ${formatTL(total)} tahsilat aldınız.`;
    },
  },
  {
    id: "mom_collection_change",
    category: "Finans",
    label: "Tahsilatım geçen aya göre nasıl değişti?",
    keywords: ["geçen aya göre tahsilat değişimi", "tahsilat kıyaslama"],
    compute: (ctx) => {
      const now = new Date();
      const thisMonthBounds = getRangeBounds("bu_ay");
      const lastStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lastEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
      const thisTotal = ctx.payments
        .filter((p) => inRange(p.paidAt, thisMonthBounds))
        .reduce((sum, p) => sum + (p.amount || 0), 0);
      const lastTotal = ctx.payments
        .filter((p) => inRange(p.paidAt, { start: lastStart, end: lastEnd }))
        .reduce((sum, p) => sum + (p.amount || 0), 0);
      if (lastTotal === 0)
        return thisTotal > 0
          ? `Geçen ay tahsilatınız yoktu, bu ay ${formatTL(thisTotal)} tahsilat aldınız.`
          : "Bu ay ve geçen ay tahsilatınız yok.";
      const change = Math.round(((thisTotal - lastTotal) / lastTotal) * 100);
      return `Bu ayki tahsilatınız geçen aya göre %${change > 0 ? "+" : ""}${change} değişti (${formatTL(thisTotal)} / ${formatTL(lastTotal)}).`;
    },
  },
  {
    id: "net_remaining_quarter",
    category: "Finans",
    label: "Bu çeyrek net kârım ne kadar?",
    keywords: ["bu çeyrek net kâr", "çeyreklik net kalan"],
    compute: (ctx) => {
      const bounds = getRangeBounds("bu_ceyrek");
      const income = ctx.payments
        .filter((p) => inRange(p.paidAt, bounds))
        .reduce((sum, p) => sum + (p.amount || 0), 0);
      const expense = ctx.companyExpenses
        .flatMap((e) => expandExpenseOccurrences(e, bounds))
        .reduce((sum, e) => sum + (e.amount || 0), 0);
      const dealCost = ctx.deals
        .filter(
          (d) =>
            d.stage === "kazanildi" &&
            (d.cost || 0) > 0 &&
            inRange(d.closedAt || d.createdAt, bounds),
        )
        .reduce((sum, d) => sum + (d.cost || 0), 0);
      const net = income - expense - dealCost;
      return `Bu çeyrek net kalanınız ${formatTL(net)} (${formatTL(income)} gelir − ${formatTL(expense + dealCost)} gider).`;
    },
  },
  {
    id: "net_remaining_year",
    category: "Finans",
    label: "Bu yıl net kârım ne kadar?",
    keywords: ["bu yıl net kâr", "yıllık net kalan"],
    compute: (ctx) => {
      const bounds = getRangeBounds("bu_yil");
      const income = ctx.payments
        .filter((p) => inRange(p.paidAt, bounds))
        .reduce((sum, p) => sum + (p.amount || 0), 0);
      const expense = ctx.companyExpenses
        .flatMap((e) => expandExpenseOccurrences(e, bounds))
        .reduce((sum, e) => sum + (e.amount || 0), 0);
      const dealCost = ctx.deals
        .filter(
          (d) =>
            d.stage === "kazanildi" &&
            (d.cost || 0) > 0 &&
            inRange(d.closedAt || d.createdAt, bounds),
        )
        .reduce((sum, d) => sum + (d.cost || 0), 0);
      const net = income - expense - dealCost;
      return `Bu yıl net kalanınız ${formatTL(net)} (${formatTL(income)} gelir − ${formatTL(expense + dealCost)} gider).`;
    },
  },
  {
    id: "net_remaining_all_time",
    category: "Finans",
    label: "Tüm zamanlar net kârım ne kadar?",
    keywords: ["tüm zamanlar net kâr", "genel net kalan"],
    compute: (ctx) => {
      const bounds = getRangeBounds("tum_zamanlar");
      const income = ctx.payments
        .filter((p) => inRange(p.paidAt, bounds))
        .reduce((sum, p) => sum + (p.amount || 0), 0);
      const expense = ctx.companyExpenses
        .flatMap((e) => expandExpenseOccurrences(e, bounds))
        .reduce((sum, e) => sum + (e.amount || 0), 0);
      const dealCost = ctx.deals
        .filter(
          (d) =>
            d.stage === "kazanildi" &&
            (d.cost || 0) > 0 &&
            inRange(d.closedAt || d.createdAt, bounds),
        )
        .reduce((sum, d) => sum + (d.cost || 0), 0);
      const net = income - expense - dealCost;
      return `Tüm zamanlar net kalanınız ${formatTL(net)} (${formatTL(income)} gelir − ${formatTL(expense + dealCost)} gider).`;
    },
  },
  {
    id: "total_expense_all_time",
    category: "Finans",
    label: "Tüm zamanlar toplam giderim ne kadar?",
    keywords: ["tüm zamanlar gider", "genel toplam gider"],
    compute: (ctx) => {
      const bounds = getRangeBounds("tum_zamanlar");
      const expense = ctx.companyExpenses
        .flatMap((e) => expandExpenseOccurrences(e, bounds))
        .reduce((sum, e) => sum + (e.amount || 0), 0);
      const dealCost = ctx.deals
        .filter((d) => d.stage === "kazanildi" && (d.cost || 0) > 0)
        .reduce((sum, d) => sum + (d.cost || 0), 0);
      return `Tüm zamanlar toplam gideriniz ${formatTL(expense + dealCost)}.`;
    },
  },
  {
    id: "total_expense_this_quarter",
    category: "Finans",
    label: "Bu çeyrek toplam giderim ne kadar?",
    keywords: ["bu çeyrek gider", "çeyreklik toplam gider"],
    compute: (ctx) => {
      const bounds = getRangeBounds("bu_ceyrek");
      const expense = ctx.companyExpenses
        .flatMap((e) => expandExpenseOccurrences(e, bounds))
        .reduce((sum, e) => sum + (e.amount || 0), 0);
      const dealCost = ctx.deals
        .filter(
          (d) =>
            d.stage === "kazanildi" &&
            (d.cost || 0) > 0 &&
            inRange(d.closedAt || d.createdAt, bounds),
        )
        .reduce((sum, d) => sum + (d.cost || 0), 0);
      return `Bu çeyrek toplam gideriniz ${formatTL(expense + dealCost)}.`;
    },
  },
  {
    id: "avg_monthly_expense_6m",
    category: "Finans",
    label: "Son 6 ayda aylık ortalama giderim ne kadar?",
    keywords: ["aylık ortalama gider", "son 6 ay ortalama gider"],
    compute: (ctx) => {
      const bounds = getRangeBounds("son_6_ay");
      const total = ctx.companyExpenses
        .flatMap((e) => expandExpenseOccurrences(e, bounds))
        .reduce((sum, e) => sum + (e.amount || 0), 0);
      return `Son 6 ayda aylık ortalama gideriniz ${formatTL(total / 6)}.`;
    },
  },
  {
    id: "yearly_fixed_expense",
    category: "Finans",
    label: "Yıllık sabit (tekrarlayan) gider toplamım ne kadar?",
    keywords: ["yıllık sabit gider", "yıllık tekrarlayan gider"],
    compute: (ctx) => {
      const total = ctx.companyExpenses
        .filter((e) => e.isRecurring && e.recurrenceInterval === "yearly")
        .reduce((sum, e) => sum + (e.amount || 0), 0);
      return `Yıllık tekrarlayan gider toplamınız ${formatTL(total)}.`;
    },
  },
  {
    id: "daily_recurring_expense_count",
    category: "Finans",
    label: "Kaç tane günlük tekrarlayan giderim var?",
    keywords: ["günlük tekrarlayan gider", "kaç günlük gider"],
    compute: (ctx) =>
      `${ctx.companyExpenses.filter((e) => e.isRecurring && e.recurrenceInterval === "daily").length} günlük tekrarlayan gideriniz var.`,
  },
  {
    id: "expense_count_total",
    category: "Finans",
    label: "Toplam kaç gider kaydım var?",
    keywords: ["toplam gider kaydı sayısı", "kaç gider girdim"],
    compute: (ctx) =>
      `Toplam ${ctx.companyExpenses.length} gider kaydınız var (tekrarlayanlar tek kayıt sayılır).`,
  },
  {
    id: "expense_categories_breakdown_month",
    category: "Finans",
    label: "Bu ay tüm gider kategorilerim nasıl dağılıyor?",
    keywords: ["gider kategorisi tam liste bu ay", "bu ay kategori dağılımı"],
    compute: (ctx) => {
      const bounds = getRangeBounds("bu_ay");
      const occurrences = ctx.companyExpenses.flatMap((e) => expandExpenseOccurrences(e, bounds));
      if (occurrences.length === 0) return "Bu ay henüz kayıtlı bir gideriniz yok.";
      const totals = {};
      occurrences.forEach((e) => {
        totals[e.category] = (totals[e.category] || 0) + (e.amount || 0);
      });
      return Object.entries(totals)
        .sort((a, b) => b[1] - a[1])
        .map(([k, v]) => `${k}: ${formatTL(v)}`)
        .join(", ");
    },
  },
  {
    id: "expense_categories_breakdown_year",
    category: "Finans",
    label: "Bu yıl tüm gider kategorilerim nasıl dağılıyor?",
    keywords: ["gider kategorisi tam liste yıl", "bu yıl kategori dağılımı"],
    compute: (ctx) => {
      const bounds = getRangeBounds("bu_yil");
      const occurrences = ctx.companyExpenses.flatMap((e) => expandExpenseOccurrences(e, bounds));
      if (occurrences.length === 0) return "Bu yıl henüz kayıtlı bir gideriniz yok.";
      const totals = {};
      occurrences.forEach((e) => {
        totals[e.category] = (totals[e.category] || 0) + (e.amount || 0);
      });
      return Object.entries(totals)
        .sort((a, b) => b[1] - a[1])
        .map(([k, v]) => `${k}: ${formatTL(v)}`)
        .join(", ");
    },
  },
  {
    id: "biggest_expense_category_year",
    category: "Finans",
    label: "Bu yıl en çok hangi kategoriye gider yaptım?",
    keywords: ["bu yıl en çok gider kategorisi", "yıllık en büyük gider kategorisi"],
    compute: (ctx) => {
      const bounds = getRangeBounds("bu_yil");
      const occurrences = ctx.companyExpenses.flatMap((e) => expandExpenseOccurrences(e, bounds));
      if (occurrences.length === 0) return "Bu yıl henüz kayıtlı bir gideriniz yok.";
      const totals = {};
      occurrences.forEach((e) => {
        totals[e.category] = (totals[e.category] || 0) + (e.amount || 0);
      });
      const top = topEntry(totals);
      return `Bu yıl en çok "${top[0]}" kategorisine gider yaptınız (${formatTL(top[1])}).`;
    },
  },
  {
    id: "biggest_single_expense",
    category: "Finans",
    label: "En büyük tek giderim hangisi?",
    keywords: ["en büyük tek gider", "en yüksek gider kaydı"],
    compute: (ctx) => {
      if (ctx.companyExpenses.length === 0) return "Henüz kayıtlı bir gideriniz yok.";
      const top = [...ctx.companyExpenses].sort((a, b) => (b.amount || 0) - (a.amount || 0))[0];
      return `En büyük tek gider kaydınız "${top.title}" - ${formatTL(top.amount)}.`;
    },
  },
  {
    id: "payments_count_this_month",
    category: "Finans",
    label: "Bu ay kaç tahsilat işlemi yaptım?",
    keywords: ["bu ay tahsilat sayısı", "bu ay kaç ödeme aldım"],
    compute: (ctx) => {
      const bounds = getRangeBounds("bu_ay");
      const count = ctx.payments.filter((p) => inRange(p.paidAt, bounds)).length;
      return `Bu ay ${count} tahsilat işlemi yaptınız.`;
    },
  },
  {
    id: "payments_count_all_time",
    category: "Finans",
    label: "Tüm zamanlar kaç tahsilat işlemi yaptım?",
    keywords: ["tüm zamanlar tahsilat sayısı", "toplam ödeme işlemi sayısı"],
    compute: (ctx) => `Şimdiye kadar toplam ${ctx.payments.length} tahsilat işlemi yapılmış.`,
  },
  {
    id: "refunded_payments_count",
    category: "Finans",
    label: "Kaç tahsilatım iade edildi?",
    keywords: ["iade edilen tahsilat sayısı", "kaç ödeme iade edildi"],
    compute: (ctx) => {
      const refunds = ctx.payments.filter((p) => p.refundOfPaymentId);
      return refunds.length > 0
        ? `${refunds.length} tahsilatınız iade edilmiş.`
        : "Henüz iade edilmiş bir tahsilatınız yok.";
    },
  },
  {
    id: "total_refunded_amount",
    category: "Finans",
    label: "Toplam ne kadar iade yaptım?",
    keywords: ["toplam iade tutarı", "ne kadar para iade ettim"],
    compute: (ctx) => {
      const refunds = ctx.payments.filter((p) => p.refundOfPaymentId);
      if (refunds.length === 0) return "Henüz iade edilmiş bir tahsilatınız yok.";
      const total = refunds.reduce((sum, p) => sum + Math.abs(p.amount || 0), 0);
      return `Toplam iade tutarınız ${formatTL(total)}.`;
    },
  },
  {
    id: "avg_refund_rate",
    category: "Finans",
    label: "İade oranım nedir?",
    keywords: ["iade oranı", "ne kadar iade oranı"],
    compute: (ctx) => {
      const positive = ctx.payments.filter(
        (p) => (p.amount || 0) > 0 && !p.refundOfPaymentId,
      ).length;
      const refunds = ctx.payments.filter((p) => p.refundOfPaymentId).length;
      if (positive === 0) return "Henüz bir tahsilatınız yok.";
      return `Tahsilatlarınızın %${Math.round((refunds / positive) * 100)}'i iade edilmiş (${refunds}/${positive}).`;
    },
  },
  {
    id: "payment_provider_sandbox_status",
    category: "Finans",
    label: "Ödeme bağlantım test modunda mı, canlı mı?",
    keywords: ["sandbox modunda mı", "test modunda mı ödeme", "canlı ödeme modu"],
    compute: (ctx) => {
      if (ctx.paymentCredentials.length === 0) return "Henüz bir ödeme sağlayıcısı bağlamadınız.";
      const cred = ctx.paymentCredentials[0];
      return `${cred.provider === "paytr" ? "PayTR" : "iyzico"} bağlantınız ${cred.sandbox ? "test (sandbox) modunda" : "canlı modda"}.`;
    },
  },
  {
    id: "max_installment_allowed",
    category: "Finans",
    label: "Müşterilerim kaç taksitle ödeyebiliyor?",
    keywords: ["kaç taksit", "taksit sayısı", "maksimum taksit"],
    compute: (ctx) => {
      if (ctx.paymentCredentials.length === 0) return "Henüz bir ödeme sağlayıcısı bağlamadınız.";
      const max = ctx.paymentCredentials[0].maxInstallment || 1;
      return max > 1
        ? `Müşterileriniz en fazla ${max} taksitle ödeme yapabiliyor.`
        : "Taksit seçeneğiniz açık değil, sadece tek çekim kabul ediyorsunuz.";
    },
  },
  {
    id: "customers_with_outstanding_balance_count",
    category: "Finans",
    label: "Kaç müşterimin bekleyen bakiyesi var?",
    keywords: ["bekleyen bakiyesi olan müşteri sayısı", "borçlu müşteri sayısı"],
    compute: (ctx) => {
      const balances = {};
      ctx.deals
        .filter((d) => d.stage === "kazanildi")
        .forEach((d) => {
          balances[d.customerId] = (balances[d.customerId] || 0) + (d.value || 0);
        });
      ctx.payments.forEach((p) => {
        const deal = ctx.deals.find((d) => d.id === p.dealId);
        if (deal && balances[deal.customerId] != null) balances[deal.customerId] -= p.amount || 0;
      });
      const count = Object.values(balances).filter((v) => v > 0).length;
      return count > 0
        ? `${count} müşterinizin bekleyen bakiyesi var.`
        : "Şu anda bakiyesi olan bir müşteriniz yok.";
    },
  },
  {
    id: "fully_paid_deals_rate",
    category: "Finans",
    label: "Kazanılan kayıtlarımın yüzde kaçı tamamen tahsil edildi?",
    keywords: ["tamamen tahsil edilen kayıt oranı", "tam tahsilat oranı"],
    compute: (ctx) => {
      const won = ctx.deals.filter((d) => d.stage === "kazanildi");
      if (won.length === 0) return "Henüz kazanılmış bir kaydınız yok.";
      const paidTotals = {};
      ctx.payments.forEach((p) => {
        paidTotals[p.dealId] = (paidTotals[p.dealId] || 0) + (p.amount || 0);
      });
      const fullyPaid = won.filter(
        (d) => (paidTotals[d.id] || 0) >= (d.value || 0) && (d.value || 0) > 0,
      ).length;
      return `Kazanılan kayıtlarınızın %${Math.round((fullyPaid / won.length) * 100)}'i tamamen tahsil edilmiş (${fullyPaid}/${won.length}).`;
    },
  },
  {
    id: "avg_days_to_first_payment",
    category: "Finans",
    label: "Kazandıktan sonra ortalama kaç günde ilk ödemeyi alıyorum?",
    keywords: ["ilk ödeme süresi", "kazanınca ne kadar sürede ödeme alıyorum"],
    compute: (ctx) => {
      const won = ctx.deals.filter((d) => d.stage === "kazanildi" && d.closedAt);
      const withFirstPayment = won
        .map((d) => {
          const dealPayments = ctx.payments
            .filter((p) => p.dealId === d.id)
            .sort((a, b) => new Date(a.paidAt) - new Date(b.paidAt));
          return dealPayments.length > 0 ? { d, first: dealPayments[0] } : null;
        })
        .filter(Boolean);
      if (withFirstPayment.length === 0)
        return "Henüz ödemesi alınmış, kazanılmış bir kaydınız yok.";
      const avgDays =
        withFirstPayment.reduce(
          (sum, x) =>
            sum +
            Math.max(
              0,
              (new Date(x.first.paidAt) - new Date(x.d.closedAt)) / (24 * 60 * 60 * 1000),
            ),
          0,
        ) / withFirstPayment.length;
      return `Bir kayıt kazanıldıktan sonra ortalama ${Math.round(avgDays)} günde ilk ödemeyi alıyorsunuz.`;
    },
  },
  {
    id: "avg_kdv_rate_open_deals",
    category: "Finans",
    label: "Açık kayıtlarımda ortalama KDV oranı nedir?",
    keywords: ["ortalama kdv oranı", "açık tekliflerde kdv"],
    compute: (ctx) => {
      const open = ctx.deals.filter((d) => d.stage !== "kazanildi" && d.stage !== "kaybedildi");
      if (open.length === 0) return "Şu anda açık bir kaydınız yok.";
      const avg = open.reduce((sum, d) => sum + (d.kdvRate ?? 20), 0) / open.length;
      return `Açık kayıtlarınızda ortalama KDV oranınız %${Math.round(avg)}.`;
    },
  },
  {
    id: "deals_with_partial_payment_count",
    category: "Finans",
    label: "Kısmi ödemesi olan kaç kazanılan kaydım var?",
    keywords: ["kısmi ödeme yapılan kayıt", "kısmen tahsil edilen teklif"],
    compute: (ctx) => {
      const won = ctx.deals.filter((d) => d.stage === "kazanildi" && (d.value || 0) > 0);
      const paidTotals = {};
      ctx.payments.forEach((p) => {
        paidTotals[p.dealId] = (paidTotals[p.dealId] || 0) + (p.amount || 0);
      });
      const partial = won.filter((d) => {
        const paid = paidTotals[d.id] || 0;
        return paid > 0 && paid < d.value;
      }).length;
      return partial > 0
        ? `${partial} kaydınızda kısmi ödeme alınmış, tamamı tahsil edilmemiş.`
        : "Kısmi ödemesi olan bir kaydınız yok.";
    },
  },
  {
    id: "avg_payment_per_customer",
    category: "Finans",
    label: "Tahsilat yapılan müşteri başına ortalama ne kadar aldım?",
    keywords: ["müşteri başına ortalama tahsilat", "müşteri başına ödeme"],
    compute: (ctx) => {
      const positive = ctx.payments.filter((p) => (p.amount || 0) > 0);
      if (positive.length === 0) return "Henüz bir tahsilatınız yok.";
      const byCustomer = {};
      positive.forEach((p) => {
        const deal = ctx.deals.find((d) => d.id === p.dealId);
        if (deal) byCustomer[deal.customerId] = (byCustomer[deal.customerId] || 0) + p.amount;
      });
      const customerCount = Object.keys(byCustomer).length;
      if (customerCount === 0) return "Henüz bir tahsilatınız yok.";
      const total = Object.values(byCustomer).reduce((sum, v) => sum + v, 0);
      return `Tahsilat yapılan müşteri başına ortalama ${formatTL(total / customerCount)} almışsınız.`;
    },
  },
  {
    id: "this_year_vs_last_year_expense",
    category: "Finans",
    label: "Bu yılki giderim geçen yıla göre nasıl?",
    keywords: ["geçen yıla göre gider", "yıllık gider kıyaslaması"],
    compute: (ctx) => {
      const now = new Date();
      const thisBounds = getRangeBounds("bu_yil");
      const lastBounds = {
        start: new Date(now.getFullYear() - 1, 0, 1),
        end: new Date(now.getFullYear() - 1, 11, 31, 23, 59, 59, 999),
      };
      const thisExpense = ctx.companyExpenses
        .flatMap((e) => expandExpenseOccurrences(e, thisBounds))
        .reduce((sum, e) => sum + (e.amount || 0), 0);
      const lastExpense = ctx.companyExpenses
        .flatMap((e) => expandExpenseOccurrences(e, lastBounds))
        .reduce((sum, e) => sum + (e.amount || 0), 0);
      return `Bu yılki gideriniz ${formatTL(thisExpense)}, geçen yıl ${formatTL(lastExpense)} idi.`;
    },
  },
  {
    id: "recurring_vs_onetime_expense_ratio",
    category: "Finans",
    label: "Kaç tekrarlayan, kaç tek seferlik giderim var?",
    keywords: ["tekrarlayan tek seferlik gider oranı", "gider türü dağılımı"],
    compute: (ctx) => {
      if (ctx.companyExpenses.length === 0) return "Henüz kayıtlı bir gideriniz yok.";
      const recurring = ctx.companyExpenses.filter((e) => e.isRecurring).length;
      const onetime = ctx.companyExpenses.length - recurring;
      return `${recurring} tekrarlayan, ${onetime} tek seferlik gider kaydınız var.`;
    },
  },
  {
    id: "deals_cost_total_month",
    category: "Finans",
    label: "Bu ay kazanılan kayıtların toplam maliyeti ne kadar?",
    keywords: ["bu ay maliyet toplamı", "kazanılan kayıtların maliyeti"],
    compute: (ctx) => {
      const bounds = getRangeBounds("bu_ay");
      const total = ctx.deals
        .filter(
          (d) =>
            d.stage === "kazanildi" &&
            (d.cost || 0) > 0 &&
            inRange(d.closedAt || d.createdAt, bounds),
        )
        .reduce((sum, d) => sum + d.cost, 0);
      return `Bu ay kazanılan kayıtların toplam maliyeti ${formatTL(total)}.`;
    },
  },
  {
    id: "gross_margin_rate_month",
    category: "Finans",
    label: "Bu ay brüt kâr marjım nedir?",
    keywords: ["brüt kâr marjı", "bu ay kâr marjı yüzdesi"],
    compute: (ctx) => {
      const bounds = getRangeBounds("bu_ay");
      const won = ctx.deals.filter(
        (d) => d.stage === "kazanildi" && inRange(d.closedAt || d.createdAt, bounds),
      );
      const income = won.reduce((sum, d) => sum + (d.value || 0), 0);
      if (income === 0) return "Bu ay henüz kazanılmış bir kaydınız yok.";
      const cost = won.reduce((sum, d) => sum + (d.cost || 0), 0);
      return `Bu ay brüt kâr marjınız %${Math.round(((income - cost) / income) * 100)}.`;
    },
  },

  // ---- Destek ----
  {
    id: "tickets_by_status_breakdown",
    category: "Destek",
    label: "Durum bazında destek talebi dağılımım nasıl?",
    keywords: ["durum dağılımı", "talep durumu", "açık işlemde çözüldü dağılımı"],
    compute: (ctx) => {
      if (ctx.tickets.length === 0) return "Henüz bir destek talebiniz yok.";
      return STATUSES.map(
        (s) => `${s.label}: ${ctx.tickets.filter((t) => t.status === s.id).length}`,
      ).join(", ");
    },
  },
  {
    id: "open_tickets_by_priority",
    category: "Destek",
    label: "Açık taleplerimin önceliğe göre dağılımı nasıl?",
    keywords: ["açık talep önceliği", "açık taleplerin öncelik dağılımı"],
    compute: (ctx) => {
      const open = ctx.tickets.filter((t) => !TERMINAL_STATUSES.includes(t.status));
      if (open.length === 0) return "Açık bir destek talebiniz yok.";
      const labels = { acil: "Acil", yuksek: "Yüksek", orta: "Orta", dusuk: "Düşük" };
      const totals = {};
      open.forEach((t) => {
        totals[t.priority] = (totals[t.priority] || 0) + 1;
      });
      return Object.entries(totals)
        .map(([k, v]) => `${labels[k] || k}: ${v}`)
        .join(", ");
    },
  },
  {
    id: "tickets_this_month_count",
    category: "Destek",
    label: "Bu ay kaç destek talebi geldi?",
    keywords: ["bu ay kaç talep", "bu ayki destek talepleri"],
    compute: (ctx) => {
      const bounds = getRangeBounds("bu_ay");
      return `Bu ay ${ctx.tickets.filter((t) => inRange(t.createdAt, bounds)).length} destek talebi aldınız.`;
    },
  },
  {
    id: "tickets_this_week_count",
    category: "Destek",
    label: "Bu hafta kaç destek talebi geldi?",
    keywords: ["bu hafta kaç talep", "haftalık destek talebi sayısı"],
    compute: (ctx) => {
      const now = new Date();
      const start = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000);
      start.setHours(0, 0, 0, 0);
      return `Son 7 günde ${ctx.tickets.filter((t) => inRange(t.createdAt, { start, end: now })).length} destek talebi aldınız.`;
    },
  },
  {
    id: "resolved_this_month_count",
    category: "Destek",
    label: "Bu ay kaç talep çözdüm?",
    keywords: ["bu ay çözülen talep", "bu ayki çözülen talep sayısı"],
    compute: (ctx) => {
      const bounds = getRangeBounds("bu_ay");
      const count = ctx.tickets.filter((t) => t.resolvedAt && inRange(t.resolvedAt, bounds)).length;
      return count > 0
        ? `Bu ay ${count} talep çözdünüz.`
        : "Bu ay henüz çözülmüş bir talebiniz yok.";
    },
  },
  {
    id: "tickets_resolved_this_week",
    category: "Destek",
    label: "Bu hafta kaç talep çözdüm?",
    keywords: ["bu hafta çözülen talep", "haftalık çözülen talep sayısı"],
    compute: (ctx) => {
      const now = new Date();
      const start = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000);
      start.setHours(0, 0, 0, 0);
      const count = ctx.tickets.filter(
        (t) => t.resolvedAt && inRange(t.resolvedAt, { start, end: now }),
      ).length;
      return count > 0
        ? `Son 7 günde ${count} talep çözdünüz.`
        : "Son 7 günde çözülmüş bir talebiniz yok.";
    },
  },
  {
    id: "acil_ticket_avg_resolution_days",
    category: "Destek",
    label: "Acil önceliği çözme süresi ortalama ne kadar?",
    keywords: ["acil talep çözüm süresi", "acil öncelik ortalama süre"],
    compute: (ctx) => {
      const resolved = ctx.tickets.filter((t) => t.priority === "acil" && t.resolvedAt);
      if (resolved.length === 0) return "Henüz çözülmüş acil öncelikli bir talebiniz yok.";
      const avgHours =
        resolved.reduce(
          (sum, t) => sum + (new Date(t.resolvedAt) - new Date(t.createdAt)) / (60 * 60 * 1000),
          0,
        ) / resolved.length;
      return `Acil öncelikli taleplerinizi ortalama ${Math.round(avgHours)} saatte çözüyorsunuz.`;
    },
  },
  {
    id: "top_customer_by_ticket_count",
    category: "Destek",
    label: "En çok destek talebi açan müşterim kim?",
    keywords: ["en çok talep açan müşteri", "en çok destek talebi olan müşteri"],
    compute: (ctx) => {
      if (ctx.tickets.length === 0) return "Henüz bir destek talebiniz yok.";
      const totals = {};
      ctx.tickets.forEach((t) => {
        totals[t.customerId] = (totals[t.customerId] || 0) + 1;
      });
      const top = topEntry(totals);
      const customer = ctx.customers.find((c) => c.id === top[0]);
      return `${customer?.name || "Bilinmeyen müşteri"} - ${top[1]} destek talebiyle en çok talep açan müşteriniz.`;
    },
  },
  {
    id: "customers_with_open_ticket_count",
    category: "Destek",
    label: "Açık talebi olan kaç müşterim var?",
    keywords: ["açık talebi olan müşteri sayısı", "bekleyen desteği olan müşteri"],
    compute: (ctx) => {
      const open = ctx.tickets.filter((t) => !TERMINAL_STATUSES.includes(t.status));
      const ids = new Set(open.map((t) => t.customerId));
      return ids.size > 0
        ? `${ids.size} müşterinizin açık bir destek talebi var.`
        : "Açık destek talebi olan bir müşteriniz yok.";
    },
  },
  {
    id: "kb_article_recently_added",
    category: "Destek",
    label: "En son ne zaman Bilgi Bankası makalesi ekledim?",
    keywords: ["en son eklenen makale", "son makale ne zaman"],
    compute: (ctx) => {
      if (ctx.kbArticles.length === 0) return "Henüz bir Bilgi Bankası makaleniz yok.";
      const sorted = [...ctx.kbArticles].sort(
        (a, b) => new Date(b.createdAt) - new Date(a.createdAt),
      );
      return `En son "${sorted[0].title}" makalesini ${new Date(sorted[0].createdAt).toLocaleDateString("tr-TR")} tarihinde eklediniz.`;
    },
  },
  {
    id: "kb_articles_without_category_count",
    category: "Destek",
    label: "Kategorisi girilmemiş kaç makalem var?",
    keywords: ["kategorisiz makale", "kategorisi olmayan makale"],
    compute: (ctx) => {
      if (ctx.kbArticles.length === 0) return "Henüz bir Bilgi Bankası makaleniz yok.";
      const count = ctx.kbArticles.filter((a) => !a.category).length;
      return count > 0
        ? `${count} makalenizde kategori girilmemiş.`
        : "Tüm makalelerinizde kategori girilmiş.";
    },
  },
  {
    id: "kb_category_count_distinct",
    category: "Destek",
    label: "Kaç farklı Bilgi Bankası kategorim var?",
    keywords: ["farklı makale kategorisi sayısı", "kaç kategori var"],
    compute: (ctx) => {
      const categories = new Set(ctx.kbArticles.filter((a) => a.category).map((a) => a.category));
      return categories.size > 0
        ? `${categories.size} farklı Bilgi Bankası kategoriniz var.`
        : "Henüz kategorili bir makaleniz yok.";
    },
  },
  {
    id: "tickets_avg_age_open",
    category: "Destek",
    label: "Açık taleplerim ortalama kaç gündür bekliyor?",
    keywords: ["açık talep ortalama bekleme", "açık talebin yaşı"],
    compute: (ctx) => {
      const open = ctx.tickets.filter((t) => !TERMINAL_STATUSES.includes(t.status));
      if (open.length === 0) return "Açık bir destek talebiniz yok.";
      const avgDays =
        open.reduce(
          (sum, t) => sum + (Date.now() - new Date(t.createdAt).getTime()) / (24 * 60 * 60 * 1000),
          0,
        ) / open.length;
      return `Açık talepleriniz ortalama ${Math.round(avgDays)} gündür bekliyor.`;
    },
  },
  {
    id: "oldest_open_ticket",
    category: "Destek",
    label: "En uzun süredir açık kalan talebim hangisi?",
    keywords: ["en eski açık talep", "en uzun süredir bekleyen talep"],
    compute: (ctx) => {
      const open = ctx.tickets.filter((t) => !TERMINAL_STATUSES.includes(t.status));
      if (open.length === 0) return "Açık bir destek talebiniz yok.";
      const oldest = [...open].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))[0];
      const days = Math.floor(
        (Date.now() - new Date(oldest.createdAt).getTime()) / (24 * 60 * 60 * 1000),
      );
      const customer = ctx.customers.find((c) => c.id === oldest.customerId);
      return `"${oldest.subject}" (${customer?.name || "müşteri silinmiş"}) - ${days} gündür açık.`;
    },
  },
  {
    id: "resolved_rate_all_time",
    category: "Destek",
    label: "Taleplerimin yüzde kaçı çözüldü?",
    keywords: ["çözülme oranı", "toplam çözülen talep yüzdesi"],
    compute: (ctx) => {
      if (ctx.tickets.length === 0) return "Henüz bir destek talebiniz yok.";
      const resolved = ctx.tickets.filter((t) => TERMINAL_STATUSES.includes(t.status)).length;
      return `Destek taleplerinizin %${Math.round((resolved / ctx.tickets.length) * 100)}'i çözüldü/kapatıldı (${resolved}/${ctx.tickets.length}).`;
    },
  },
  {
    id: "tickets_created_vs_resolved_this_month",
    category: "Destek",
    label: "Bu ay kaç talep açıldı, kaçı çözüldü?",
    keywords: ["bu ay açılan çözülen talep karşılaştırması", "bu ay talep dengesi"],
    compute: (ctx) => {
      const bounds = getRangeBounds("bu_ay");
      const created = ctx.tickets.filter((t) => inRange(t.createdAt, bounds)).length;
      const resolved = ctx.tickets.filter(
        (t) => t.resolvedAt && inRange(t.resolvedAt, bounds),
      ).length;
      return `Bu ay ${created} talep açıldı, ${resolved} talep çözüldü.`;
    },
  },
  {
    id: "urgent_tickets_open_count",
    category: "Destek",
    label: "Acil öncelikli kaç açık talebim var?",
    keywords: ["acil açık talep", "acil öncelikli talep sayısı"],
    compute: (ctx) => {
      const count = ctx.tickets.filter(
        (t) => t.priority === "acil" && !TERMINAL_STATUSES.includes(t.status),
      ).length;
      return count > 0
        ? `Acil öncelikli ${count} açık talebiniz var.`
        : "Acil öncelikli açık bir talebiniz yok.";
    },
  },
  {
    id: "low_priority_tickets_open_count",
    category: "Destek",
    label: "Düşük öncelikli kaç açık talebim var?",
    keywords: ["düşük öncelikli açık talep", "düşük öncelik talep sayısı"],
    compute: (ctx) => {
      const count = ctx.tickets.filter(
        (t) => t.priority === "dusuk" && !TERMINAL_STATUSES.includes(t.status),
      ).length;
      return `Düşük öncelikli ${count} açık talebiniz var.`;
    },
  },
  {
    id: "tickets_without_description_count",
    category: "Destek",
    label: "Açıklaması girilmemiş kaç talebim var?",
    keywords: ["açıklamasız talep", "açıklaması eksik destek talebi"],
    compute: (ctx) => {
      if (ctx.tickets.length === 0) return "Henüz bir destek talebiniz yok.";
      const count = ctx.tickets.filter((t) => !t.description).length;
      return `${count} talebinizde açıklama girilmemiş.`;
    },
  },
  {
    id: "avg_tickets_per_customer",
    category: "Destek",
    label: "Müşteri başına ortalama kaç destek talebim var?",
    keywords: ["müşteri başına ortalama talep", "müşteri başına destek sayısı"],
    compute: (ctx) => {
      if (ctx.customers.length === 0) return "Henüz müşteriniz yok.";
      return `Müşteri başına ortalama ${(ctx.tickets.length / ctx.customers.length).toFixed(2)} destek talebiniz var.`;
    },
  },

  // ---- Randevu & Program ----
  {
    id: "appointments_this_week",
    category: "Randevu & Program",
    label: "Önümüzdeki 7 günde kaç randevum var?",
    keywords: ["bu hafta randevu", "önümüzdeki 7 gün randevu"],
    visibleIf: (sector) => supportsSelfBooking(sector) || isAppointmentSector(sector),
    compute: (ctx) => {
      if (!ctx.appointmentDateTimeKey) return "Randevu tarihi alanı henüz tanımlı değil.";
      const now = new Date();
      const weekEnd = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      const count = ctx.deals.filter(
        (d) =>
          d.stage !== "kaybedildi" &&
          inRange(d.customFields?.[ctx.appointmentDateTimeKey], { start: now, end: weekEnd }),
      ).length;
      return `Önümüzdeki 7 gün içinde ${count} randevunuz var.`;
    },
  },
  {
    id: "appointments_tomorrow",
    category: "Randevu & Program",
    label: "Yarın kaç randevum var?",
    keywords: ["yarınki randevular", "yarın kaç randevu"],
    visibleIf: (sector) => supportsSelfBooking(sector) || isAppointmentSector(sector),
    compute: (ctx) => {
      if (!ctx.appointmentDateTimeKey) return "Randevu tarihi alanı henüz tanımlı değil.";
      const tomorrowStr = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const count = ctx.deals.filter(
        (d) =>
          d.stage !== "kazanildi" &&
          d.stage !== "kaybedildi" &&
          (d.customFields?.[ctx.appointmentDateTimeKey] || "").slice(0, 10) === tomorrowStr,
      ).length;
      return `Yarın ${count} randevunuz var.`;
    },
  },
  {
    id: "next_appointment",
    category: "Randevu & Program",
    label: "Bir sonraki randevum ne zaman?",
    keywords: ["sıradaki randevu", "bir sonraki randevu"],
    visibleIf: (sector) => supportsSelfBooking(sector) || isAppointmentSector(sector),
    compute: (ctx) => {
      if (!ctx.appointmentDateTimeKey) return "Randevu tarihi alanı henüz tanımlı değil.";
      const nowStr = new Date().toISOString().slice(0, 16);
      const upcoming = ctx.deals
        .filter(
          (d) =>
            d.stage !== "kazanildi" &&
            d.stage !== "kaybedildi" &&
            (d.customFields?.[ctx.appointmentDateTimeKey] || "") >= nowStr,
        )
        .sort((a, b) =>
          (a.customFields[ctx.appointmentDateTimeKey] || "").localeCompare(
            b.customFields[ctx.appointmentDateTimeKey] || "",
          ),
        );
      if (upcoming.length === 0) return "Yaklaşan bir randevunuz görünmüyor.";
      const next = upcoming[0];
      const customer = ctx.customers.find((c) => c.id === next.customerId);
      const dt = next.customFields[ctx.appointmentDateTimeKey];
      return `Bir sonraki randevunuz ${new Date(dt).toLocaleDateString("tr-TR")} tarihinde, saat ${dt.slice(11, 16)} - ${customer?.name || "müşteri silinmiş"}.`;
    },
  },
  {
    id: "avg_appointments_per_day_this_month",
    category: "Randevu & Program",
    label: "Bu ay günde ortalama kaç randevum var?",
    keywords: ["günlük ortalama randevu", "bu ay ortalama randevu sayısı"],
    visibleIf: (sector) => supportsSelfBooking(sector) || isAppointmentSector(sector),
    compute: (ctx) => {
      if (!ctx.appointmentDateTimeKey) return "Randevu tarihi alanı henüz tanımlı değil.";
      const bounds = getRangeBounds("bu_ay");
      const count = ctx.deals.filter(
        (d) =>
          d.stage !== "kaybedildi" && inRange(d.customFields?.[ctx.appointmentDateTimeKey], bounds),
      ).length;
      const daysElapsed = new Date().getDate();
      return `Bu ay güne kadar günde ortalama ${(count / daysElapsed).toFixed(1)} randevunuz var (toplam ${count}).`;
    },
  },
  {
    id: "group_class_enrollment_total",
    category: "Randevu & Program",
    label: "Tüm derslerimde toplam kaç kayıt var?",
    keywords: ["toplam ders kaydı", "tüm derslerdeki kayıt sayısı"],
    visibleIf: (sector) => supportsGroupClasses(sector),
    compute: (ctx) => `Tüm derslerinizde toplam ${ctx.groupClassEnrollments.length} kayıt var.`,
  },
  {
    id: "emptiest_group_class",
    category: "Randevu & Program",
    label: "Hangi dersimde en az kayıt var?",
    keywords: ["en az kayıtlı ders", "en boş ders"],
    visibleIf: (sector) => supportsGroupClasses(sector),
    compute: (ctx) => {
      if (ctx.groupClasses.length === 0) return "Henüz bir dersiniz yok.";
      const totals = {};
      ctx.groupClassEnrollments.forEach((e) => {
        totals[e.groupClassId] = (totals[e.groupClassId] || 0) + 1;
      });
      const sorted = [...ctx.groupClasses].sort(
        (a, b) => (totals[a.id] || 0) - (totals[b.id] || 0),
      );
      const emptiest = sorted[0];
      return `En az kayıtlı dersiniz "${emptiest.name}" - ${totals[emptiest.id] || 0}/${emptiest.capacity ?? "?"} kayıt.`;
    },
  },
  {
    id: "group_class_capacity_utilization",
    category: "Randevu & Program",
    label: "Derslerimin genel doluluk oranı nedir?",
    keywords: ["genel doluluk oranı", "derslerin doluluk yüzdesi"],
    visibleIf: (sector) => supportsGroupClasses(sector),
    compute: (ctx) => {
      const totalCapacity = ctx.groupClasses.reduce((sum, g) => sum + (g.capacity || 0), 0);
      if (totalCapacity === 0) return "Henüz kapasitesi tanımlı bir dersiniz yok.";
      const totalEnrolled = ctx.groupClassEnrollments.length;
      return `Derslerinizin genel doluluk oranı %${Math.round((totalEnrolled / totalCapacity) * 100)} (${totalEnrolled}/${totalCapacity}).`;
    },
  },
  {
    id: "group_classes_by_weekday_count",
    category: "Randevu & Program",
    label: "Haftanın hangi günü kaç dersim var?",
    keywords: ["güne göre ders sayısı", "haftalık ders dağılımı"],
    visibleIf: (sector) => supportsGroupClasses(sector),
    compute: (ctx) => {
      if (ctx.groupClasses.length === 0) return "Henüz bir dersiniz yok.";
      return WEEKDAYS.map(
        (name, idx) => `${name}: ${ctx.groupClasses.filter((g) => g.weekday === idx + 1).length}`,
      ).join(", ");
    },
  },
  {
    id: "group_class_instructor_count",
    category: "Randevu & Program",
    label: "Kaç farklı eğitmenim/antrenörüm var?",
    keywords: ["eğitmen sayısı", "antrenör sayısı"],
    visibleIf: (sector) => supportsGroupClasses(sector),
    compute: (ctx) => {
      const instructors = new Set(
        ctx.groupClasses.filter((g) => g.instructorName).map((g) => g.instructorName),
      );
      return instructors.size > 0
        ? `${instructors.size} farklı eğitmen/antrenörünüz var.`
        : "Derslerinize henüz eğitmen bilgisi girilmemiş.";
    },
  },
  {
    id: "group_class_avg_capacity",
    category: "Randevu & Program",
    label: "Derslerimin ortalama kapasitesi ne kadar?",
    keywords: ["ortalama ders kapasitesi", "ders başına kapasite"],
    visibleIf: (sector) => supportsGroupClasses(sector),
    compute: (ctx) => {
      if (ctx.groupClasses.length === 0) return "Henüz bir dersiniz yok.";
      const avg =
        ctx.groupClasses.reduce((sum, g) => sum + (g.capacity || 0), 0) / ctx.groupClasses.length;
      return `Derslerinizin ortalama kapasitesi ${Math.round(avg)} kişi.`;
    },
  },
  {
    id: "group_class_total_capacity",
    category: "Randevu & Program",
    label: "Tüm derslerimin toplam kapasitesi ne kadar?",
    keywords: ["toplam kapasite", "tüm derslerin kapasitesi"],
    visibleIf: (sector) => supportsGroupClasses(sector),
    compute: (ctx) =>
      `Tüm derslerinizin toplam kapasitesi ${ctx.groupClasses.reduce((sum, g) => sum + (g.capacity || 0), 0)} kişi.`,
  },
  {
    id: "avg_class_duration_minutes",
    category: "Randevu & Program",
    label: "Derslerimin ortalama süresi ne kadar?",
    keywords: ["ortalama ders süresi", "ders kaç dakika"],
    visibleIf: (sector) => supportsGroupClasses(sector),
    compute: (ctx) => {
      if (ctx.groupClasses.length === 0) return "Henüz bir dersiniz yok.";
      const avg =
        ctx.groupClasses.reduce((sum, g) => sum + (g.durationMinutes || 0), 0) /
        ctx.groupClasses.length;
      return `Derslerinizin ortalama süresi ${Math.round(avg)} dakika.`;
    },
  },
  {
    id: "class_attendance_rate_overall",
    category: "Randevu & Program",
    label: "Derslerime genel katılım oranım nedir?",
    keywords: ["genel katılım oranı", "derse gelme oranı"],
    visibleIf: (sector) => supportsGroupClasses(sector),
    compute: (ctx) => {
      const attendance = ctx.classAttendance || [];
      if (attendance.length === 0) return "Henüz yoklama kaydı girilmemiş.";
      const came = attendance.filter((a) => a.status === "geldi").length;
      return `Genel derse katılım oranınız %${Math.round((came / attendance.length) * 100)} (${came}/${attendance.length}).`;
    },
  },
  {
    id: "class_attendance_rate_this_month",
    category: "Randevu & Program",
    label: "Bu ay derslerime katılım oranı nedir?",
    keywords: ["bu ay katılım oranı", "bu ayki derse gelme oranı"],
    visibleIf: (sector) => supportsGroupClasses(sector),
    compute: (ctx) => {
      const bounds = getRangeBounds("bu_ay");
      const attendance = (ctx.classAttendance || []).filter((a) =>
        inRange(a.occurrenceDate, bounds),
      );
      if (attendance.length === 0) return "Bu ay henüz yoklama kaydı girilmemiş.";
      const came = attendance.filter((a) => a.status === "geldi").length;
      return `Bu ay derse katılım oranınız %${Math.round((came / attendance.length) * 100)} (${came}/${attendance.length}).`;
    },
  },
  {
    id: "best_attended_class",
    category: "Randevu & Program",
    label: "En yüksek katılım oranına sahip dersim hangisi?",
    keywords: ["en yüksek katılımlı ders", "en çok gelinen ders"],
    visibleIf: (sector) => supportsGroupClasses(sector),
    compute: (ctx) => {
      if (ctx.groupClasses.length === 0) return "Henüz bir dersiniz yok.";
      const attendance = ctx.classAttendance || [];
      const rates = ctx.groupClasses
        .map((g) => {
          const recs = attendance.filter((a) => a.groupClassId === g.id);
          if (recs.length === 0) return null;
          const came = recs.filter((a) => a.status === "geldi").length;
          return { name: g.name, rate: came / recs.length, total: recs.length };
        })
        .filter(Boolean);
      if (rates.length === 0) return "Henüz hiçbir dersiniz için yoklama girilmemiş.";
      const best = [...rates].sort((a, b) => b.rate - a.rate)[0];
      return `En yüksek katılım oranına sahip dersiniz "${best.name}" - %${Math.round(best.rate * 100)} (${best.total} yoklama kaydı).`;
    },
  },
  {
    id: "worst_attended_class",
    category: "Randevu & Program",
    label: "En düşük katılım oranına sahip dersim hangisi?",
    keywords: ["en düşük katılımlı ders", "en çok gelinmeyen ders"],
    visibleIf: (sector) => supportsGroupClasses(sector),
    compute: (ctx) => {
      if (ctx.groupClasses.length === 0) return "Henüz bir dersiniz yok.";
      const attendance = ctx.classAttendance || [];
      const rates = ctx.groupClasses
        .map((g) => {
          const recs = attendance.filter((a) => a.groupClassId === g.id);
          if (recs.length === 0) return null;
          const came = recs.filter((a) => a.status === "geldi").length;
          return { name: g.name, rate: came / recs.length, total: recs.length };
        })
        .filter(Boolean);
      if (rates.length === 0) return "Henüz hiçbir dersiniz için yoklama girilmemiş.";
      const worst = [...rates].sort((a, b) => a.rate - b.rate)[0];
      return `En düşük katılım oranına sahip dersiniz "${worst.name}" - %${Math.round(worst.rate * 100)} (${worst.total} yoklama kaydı).`;
    },
  },
  {
    id: "customer_with_most_class_attendance",
    category: "Randevu & Program",
    label: "En çok derse gelen müşterim/üyem kim?",
    keywords: ["en çok derse katılan", "en düzenli gelen üye"],
    visibleIf: (sector) => supportsGroupClasses(sector),
    compute: (ctx) => {
      const attendance = (ctx.classAttendance || []).filter((a) => a.status === "geldi");
      if (attendance.length === 0) return "Henüz katılım kaydı girilmemiş.";
      const totals = {};
      attendance.forEach((a) => {
        totals[a.customerId] = (totals[a.customerId] || 0) + 1;
      });
      const top = topEntry(totals);
      const customer = ctx.customers.find((c) => c.id === top[0]);
      return `${customer?.name || "Bilinmeyen müşteri"} - ${top[1]} derse katılarak en çok derse gelen müşteriniz.`;
    },
  },
  {
    id: "total_attendance_marked_count",
    category: "Randevu & Program",
    label: "Kaç yoklama kaydı girmişim?",
    keywords: ["toplam yoklama sayısı", "girilen yoklama kaydı"],
    visibleIf: (sector) => supportsGroupClasses(sector),
    compute: (ctx) => `${(ctx.classAttendance || []).length} yoklama kaydı girilmiş.`,
  },
  {
    id: "business_hours_days_count",
    category: "Randevu & Program",
    label: "Kaç gün için müsaitlik saati tanımlamışım?",
    keywords: ["müsaitlik günleri", "kaç gün müsait"],
    visibleIf: (sector) => bookingModel(sector) === "slot",
    compute: (ctx) => {
      if (ctx.businessHours.length === 0) return "Henüz müsaitlik saati tanımlamadınız.";
      const days = ctx.businessHours.map((b) => WEEKDAYS[b.weekday - 1]).filter(Boolean);
      return `${days.length} gün için müsaitlik saati tanımlı: ${days.join(", ")}.`;
    },
  },
  {
    id: "business_hours_missing_days",
    category: "Randevu & Program",
    label: "Hangi günler için müsaitlik saatim tanımlı değil?",
    keywords: ["müsaitlik tanımlanmamış günler", "eksik müsaitlik günü"],
    visibleIf: (sector) => bookingModel(sector) === "slot",
    compute: (ctx) => {
      const defined = new Set(ctx.businessHours.map((b) => b.weekday));
      const missing = WEEKDAYS.map((name, idx) => (defined.has(idx + 1) ? null : name)).filter(
        Boolean,
      );
      if (missing.length === 0) return "Haftanın tüm günleri için müsaitlik saati tanımlı.";
      return `Şu günler için henüz müsaitlik saati tanımlamadınız: ${missing.join(", ")}.`;
    },
  },
  {
    id: "business_hours_total_weekly_hours",
    category: "Randevu & Program",
    label: "Haftalık toplam müsaitlik saatim ne kadar?",
    keywords: ["haftalık toplam müsaitlik", "toplam müsait saat"],
    visibleIf: (sector) => bookingModel(sector) === "slot",
    compute: (ctx) => {
      if (ctx.businessHours.length === 0) return "Henüz müsaitlik saati tanımlamadınız.";
      const totalMinutes = ctx.businessHours.reduce((sum, b) => {
        const [sh, sm] = (b.startTime || "0:0").split(":").map(Number);
        const [eh, em] = (b.endTime || "0:0").split(":").map(Number);
        return sum + Math.max(0, eh * 60 + em - (sh * 60 + sm));
      }, 0);
      return `Haftalık toplam müsaitlik süreniz yaklaşık ${Math.round(totalMinutes / 60)} saat.`;
    },
  },
  {
    id: "avg_appointment_slot_minutes",
    category: "Randevu & Program",
    label: "Randevu aralıklarım ortalama kaç dakika?",
    keywords: ["ortalama randevu aralığı", "randevu slotu kaç dakika"],
    visibleIf: (sector) => bookingModel(sector) === "slot",
    compute: (ctx) => {
      if (ctx.businessHours.length === 0) return "Henüz müsaitlik saati tanımlamadınız.";
      const avg =
        ctx.businessHours.reduce((sum, b) => sum + (b.slotDurationMinutes || 0), 0) /
        ctx.businessHours.length;
      return `Randevu aralıklarınız ortalama ${Math.round(avg)} dakika.`;
    },
  },

  // ---- Takım ----
  {
    id: "team_members_with_settings_access",
    category: "Takım",
    label: "Kaç takım üyemin ayarları düzenleme izni var?",
    keywords: ["ayar düzenleme izni olan üye", "yetkili takım üyesi sayısı"],
    compute: (ctx) => {
      if (ctx.teamMembers.length === 0) return "Henüz takım üyeniz yok.";
      const count = ctx.teamMembers.filter((m) => m.canEditSettings).length;
      return count > 0
        ? `${count} takım üyenizin ayarları düzenleme izni var.`
        : "Şu anda ayarları düzenleme izni olan bir takım üyeniz yok.";
    },
  },
  {
    id: "per_member_open_deal_count",
    category: "Takım",
    label: "Üye başına kaç açık kaydım var?",
    keywords: ["üye başına açık kayıt", "kişi başına bekleyen teklif"],
    compute: (ctx) => {
      if (ctx.teamMembers.length === 0) return "Henüz takım üyeniz yok.";
      const open = ctx.deals.filter(
        (d) => d.stage !== "kazanildi" && d.stage !== "kaybedildi" && d.assignedTo,
      );
      const totals = {};
      open.forEach((d) => {
        totals[d.assignedTo] = (totals[d.assignedTo] || 0) + 1;
      });
      const names = [ctx.currentUserId, ...ctx.teamMembers.map((m) => m.id)];
      return names
        .map((id) => {
          const name =
            id === ctx.currentUserId
              ? "Siz"
              : ctx.teamMembers.find((m) => m.id === id)?.name ||
                ctx.teamMembers.find((m) => m.id === id)?.email ||
                "Bilinmeyen üye";
          return `${name}: ${totals[id] || 0}`;
        })
        .join(", ");
    },
  },
  {
    id: "per_member_win_rate",
    category: "Takım",
    label: "Üye başına kazanma oranım nedir?",
    keywords: ["üye başına kazanma oranı", "kişi başına başarı oranı"],
    compute: (ctx) => {
      if (ctx.teamMembers.length === 0) return "Henüz takım üyeniz yok.";
      const closed = ctx.deals.filter(
        (d) => (d.stage === "kazanildi" || d.stage === "kaybedildi") && d.assignedTo,
      );
      if (closed.length === 0) return "Henüz sorumlu atanmış, sonuçlanmış bir kaydınız yok.";
      const names = [ctx.currentUserId, ...ctx.teamMembers.map((m) => m.id)];
      return names
        .map((id) => {
          const memberClosed = closed.filter((d) => d.assignedTo === id);
          if (memberClosed.length === 0) return null;
          const won = memberClosed.filter((d) => d.stage === "kazanildi").length;
          const name =
            id === ctx.currentUserId
              ? "Siz"
              : ctx.teamMembers.find((m) => m.id === id)?.name ||
                ctx.teamMembers.find((m) => m.id === id)?.email ||
                "Bilinmeyen üye";
          return `${name}: %${Math.round((won / memberClosed.length) * 100)}`;
        })
        .filter(Boolean)
        .join(", ");
    },
  },
  {
    id: "per_member_revenue_month",
    category: "Takım",
    label: "Bu ay üye başına ne kadar ciro var?",
    keywords: ["üye başına bu ay ciro", "kişi başına bu ayki gelir"],
    compute: (ctx) => {
      if (ctx.teamMembers.length === 0) return "Henüz takım üyeniz yok.";
      const bounds = getRangeBounds("bu_ay");
      const won = ctx.deals.filter(
        (d) =>
          d.stage === "kazanildi" && d.assignedTo && inRange(d.closedAt || d.createdAt, bounds),
      );
      if (won.length === 0) return "Bu ay henüz sorumlu atanmış, kazanılmış bir kaydınız yok.";
      const totals = {};
      won.forEach((d) => {
        totals[d.assignedTo] = (totals[d.assignedTo] || 0) + (d.value || 0);
      });
      return Object.entries(totals)
        .map(([id, total]) => {
          const name =
            id === ctx.currentUserId
              ? "Siz"
              : ctx.teamMembers.find((m) => m.id === id)?.name ||
                ctx.teamMembers.find((m) => m.id === id)?.email ||
                "Bilinmeyen üye";
          return `${name}: ${formatTL(total)}`;
        })
        .join(", ");
    },
  },
  {
    id: "members_with_zero_deals",
    category: "Takım",
    label: "Hiç kaydı olmayan takım üyem var mı?",
    keywords: ["kaydı olmayan üye", "atanmış kaydı olmayan takım üyesi"],
    compute: (ctx) => {
      if (ctx.teamMembers.length === 0) return "Henüz takım üyeniz yok.";
      const assignedIds = new Set(ctx.deals.filter((d) => d.assignedTo).map((d) => d.assignedTo));
      const zeroMembers = ctx.teamMembers.filter((m) => !assignedIds.has(m.id));
      if (zeroMembers.length === 0) return "Tüm takım üyelerinize en az bir kayıt atanmış.";
      return `${zeroMembers.length} takım üyenize hiç kayıt atanmamış: ${zeroMembers.map((m) => m.name || m.email).join(", ")}.`;
    },
  },
  {
    id: "avg_deals_per_member",
    category: "Takım",
    label: "Üye başına ortalama kaç kayıt atanmış?",
    keywords: ["üye başına ortalama kayıt", "kişi başına ortalama teklif"],
    compute: (ctx) => {
      if (ctx.teamMembers.length === 0) return "Henüz takım üyeniz yok.";
      const assigned = ctx.deals.filter((d) => d.assignedTo).length;
      const memberCount = ctx.teamMembers.length + 1;
      return `Sorumlu atanmış ${assigned} kaydınız var, kişi başına ortalama ${(assigned / memberCount).toFixed(1)} kayıt düşüyor.`;
    },
  },
  {
    id: "members_without_name",
    category: "Takım",
    label: "İsmi girilmemiş kaç takım üyem var?",
    keywords: ["ismi olmayan üye", "isimsiz takım üyesi"],
    compute: (ctx) => {
      if (ctx.teamMembers.length === 0) return "Henüz takım üyeniz yok.";
      const count = ctx.teamMembers.filter((m) => !m.name).length;
      return count > 0
        ? `${count} takım üyenizde henüz isim girilmemiş, sadece e-posta görünüyor.`
        : "Tüm takım üyelerinizde isim girilmiş.";
    },
  },
  {
    id: "team_open_deals_total_value_by_member",
    category: "Takım",
    label: "Açık kayıtlarda en yüksek değere sahip üye kim?",
    keywords: ["en yüksek açık değer üye", "en çok açık kaydı olan üye değeri"],
    compute: (ctx) => {
      if (ctx.teamMembers.length === 0) return "Henüz takım üyeniz yok.";
      const open = ctx.deals.filter(
        (d) => d.stage !== "kazanildi" && d.stage !== "kaybedildi" && d.assignedTo,
      );
      if (open.length === 0) return "Şu anda sorumlu atanmış açık bir kaydınız yok.";
      const totals = {};
      open.forEach((d) => {
        totals[d.assignedTo] = (totals[d.assignedTo] || 0) + (d.value || 0);
      });
      const top = topEntry(totals);
      const name =
        top[0] === ctx.currentUserId
          ? "Siz"
          : ctx.teamMembers.find((m) => m.id === top[0])?.name ||
            ctx.teamMembers.find((m) => m.id === top[0])?.email ||
            "Bilinmeyen üye";
      return `${name} - açık kayıtlarında ${formatTL(top[1])} değerle en yüksek açık portföye sahip.`;
    },
  },
  {
    id: "top_assignee_by_deal_count",
    category: "Takım",
    label: "En çok kayıt sorumlusu (sayıca) kim?",
    keywords: ["en çok kayıt sayısı olan kişi", "en çok teklifi olan takım üyesi"],
    compute: (ctx) => {
      if (ctx.teamMembers.length === 0) return "Henüz takım üyeniz yok.";
      const assigned = ctx.deals.filter((d) => d.assignedTo);
      if (assigned.length === 0) return "Henüz sorumlu atanmış bir kaydınız yok.";
      const totals = {};
      assigned.forEach((d) => {
        totals[d.assignedTo] = (totals[d.assignedTo] || 0) + 1;
      });
      const top = topEntry(totals);
      const name =
        top[0] === ctx.currentUserId
          ? "Siz"
          : ctx.teamMembers.find((m) => m.id === top[0])?.name ||
            ctx.teamMembers.find((m) => m.id === top[0])?.email ||
            "Bilinmeyen üye";
      return `${name} - ${top[1]} kayıtla en çok kayıt sorumlusu olan kişi.`;
    },
  },
  {
    id: "top_uploader",
    category: "Takım",
    label: "En çok dosya yükleyen kim?",
    keywords: ["en çok dosya yükleyen", "en çok ek ekleyen kişi"],
    compute: (ctx) => {
      const withUploader = ctx.attachments.filter((a) => a.uploadedBy);
      if (withUploader.length === 0) return "Henüz bir dosya yüklenmemiş.";
      const totals = {};
      withUploader.forEach((a) => {
        totals[a.uploadedBy] = (totals[a.uploadedBy] || 0) + 1;
      });
      const top = topEntry(totals);
      const member = ctx.teamMembers.find((m) => m.email === top[0]);
      return `${member?.name || top[0]} - ${top[1]} dosya ile en çok dosya yükleyen kişi.`;
    },
  },
  {
    id: "avg_open_deal_value_per_member",
    category: "Takım",
    label: "Üye başına ortalama açık kayıt değeri ne kadar?",
    keywords: ["üye başına açık değer", "kişi başına açık kayıt tutarı"],
    compute: (ctx) => {
      if (ctx.teamMembers.length === 0) return "Henüz takım üyeniz yok.";
      const open = ctx.deals.filter(
        (d) => d.stage !== "kazanildi" && d.stage !== "kaybedildi" && d.assignedTo,
      );
      if (open.length === 0) return "Şu anda sorumlu atanmış açık bir kaydınız yok.";
      const totals = {};
      open.forEach((d) => {
        totals[d.assignedTo] = (totals[d.assignedTo] || 0) + (d.value || 0);
      });
      const memberCount = Object.keys(totals).length;
      const total = Object.values(totals).reduce((sum, v) => sum + v, 0);
      return `Sorumlu atanmış açık kayıtlarda üye başına ortalama ${formatTL(total / memberCount)} değer var.`;
    },
  },

  // ---- Sistem ----
  {
    id: "custom_field_count_by_entity",
    category: "Sistem",
    label: "Müşteri mi teklif mi, hangi tarafta daha çok özel alanım var?",
    keywords: ["özel alan müşteri teklif dağılımı", "entity bazında özel alan sayısı"],
    compute: (ctx) => {
      const active = ctx.customFieldDefs.filter((d) => d.active);
      if (active.length === 0) return "Henüz aktif bir özel alanınız yok.";
      const customerCount = active.filter((d) => d.entity === "customer").length;
      const dealCount = active.filter((d) => d.entity === "deal").length;
      return `Müşteri tarafında ${customerCount}, kayıt (teklif/randevu/üyelik) tarafında ${dealCount} aktif özel alanınız var.`;
    },
  },
  {
    id: "custom_field_inactive_count",
    category: "Sistem",
    label: "Kaç pasif özel alanım var?",
    keywords: ["pasif özel alan", "devre dışı özel alan sayısı"],
    compute: (ctx) => {
      const count = ctx.customFieldDefs.filter((d) => !d.active).length;
      return count > 0
        ? `${count} pasif (devre dışı) özel alanınız var.`
        : "Pasif özel alanınız yok, tüm özel alanlarınız aktif.";
    },
  },
  {
    id: "custom_field_fill_rate_top",
    category: "Sistem",
    label: "En az doldurulan özel alanım hangisi?",
    keywords: ["en az doldurulan özel alan", "boş kalan özel alan"],
    compute: (ctx) => {
      const active = ctx.customFieldDefs.filter((d) => d.active);
      if (active.length === 0) return "Henüz aktif bir özel alanınız yok.";
      const rates = active.map((def) => {
        const records = def.entity === "customer" ? ctx.customers : ctx.deals;
        if (records.length === 0) return { label: def.label, rate: 0 };
        const filled = records.filter(
          (r) => r.customFields?.[def.key] != null && r.customFields?.[def.key] !== "",
        ).length;
        return { label: def.label, rate: filled / records.length };
      });
      const lowest = [...rates].sort((a, b) => a.rate - b.rate)[0];
      return `En az doldurulan özel alanınız "${lowest.label}" - %${Math.round(lowest.rate * 100)} doluluk.`;
    },
  },
  {
    id: "attachments_by_entity_type",
    category: "Sistem",
    label: "Dosyalarım daha çok müşteri kaydında mı, teklif kaydında mı?",
    keywords: ["dosya entity dağılımı", "hangi kayıtta daha çok dosya var"],
    compute: (ctx) => {
      if (ctx.attachments.length === 0) return "Henüz bir dosya yüklenmemiş.";
      const customerCount = ctx.attachments.filter((a) => a.entityType === "customers").length;
      const dealCount = ctx.attachments.filter((a) => a.entityType === "deals").length;
      return `Müşteri kayıtlarında ${customerCount}, teklif/randevu/üyelik kayıtlarında ${dealCount} dosyanız var.`;
    },
  },
  {
    id: "attachments_this_month_count",
    category: "Sistem",
    label: "Bu ay kaç dosya eklemişim?",
    keywords: ["bu ay eklenen dosya", "bu ayki dosya sayısı"],
    compute: (ctx) => {
      const bounds = getRangeBounds("bu_ay");
      const count = ctx.attachments.filter((a) => inRange(a.createdAt, bounds)).length;
      return `Bu ay ${count} dosya eklediniz.`;
    },
  },
  {
    id: "recently_added_attachment",
    category: "Sistem",
    label: "En son ne zaman dosya eklemişim?",
    keywords: ["en son eklenen dosya", "son yüklenen dosya"],
    compute: (ctx) => {
      if (ctx.attachments.length === 0) return "Henüz bir dosya yüklenmemiş.";
      const sorted = [...ctx.attachments].sort(
        (a, b) => new Date(b.createdAt) - new Date(a.createdAt),
      );
      return `En son "${sorted[0].fileName}" dosyasını ${new Date(sorted[0].createdAt).toLocaleDateString("tr-TR")} tarihinde eklediniz.`;
    },
  },
  {
    id: "attachment_total_size",
    category: "Sistem",
    label: "Yüklediğim dosyaların toplam boyutu ne kadar?",
    keywords: ["toplam dosya boyutu", "kaç mb dosya yükledim"],
    compute: (ctx) => {
      if (ctx.attachments.length === 0) return "Henüz bir dosya yüklenmemiş.";
      const total = ctx.attachments.reduce((sum, a) => sum + (a.fileSize || 0), 0);
      return `Yüklediğiniz dosyaların toplam boyutu ${formatFileSize(total)}.`;
    },
  },
  {
    id: "price_list_extremes",
    category: "Sistem",
    label: "Fiyat listemdeki en pahalı ve en ucuz ürün hangisi?",
    keywords: ["en pahalı ürün", "en ucuz ürün", "fiyat listesi aralığı"],
    compute: (ctx) => {
      if (ctx.priceListItems.length === 0) return "Fiyat listenizde henüz bir ürün/hizmet yok.";
      const sorted = [...ctx.priceListItems].sort((a, b) => (a.price || 0) - (b.price || 0));
      const cheapest = sorted[0];
      const priciest = sorted[sorted.length - 1];
      return `En ucuz "${cheapest.name}" (${formatTL(cheapest.price)}), en pahalı "${priciest.name}" (${formatTL(priciest.price)}).`;
    },
  },
  {
    id: "price_list_avg_price",
    category: "Sistem",
    label: "Fiyat listemdeki ortalama fiyat ne kadar?",
    keywords: ["fiyat listesi ortalama fiyat", "ortalama ürün fiyatı"],
    compute: (ctx) => {
      if (ctx.priceListItems.length === 0) return "Fiyat listenizde henüz bir ürün/hizmet yok.";
      const avg =
        ctx.priceListItems.reduce((sum, p) => sum + (p.price || 0), 0) / ctx.priceListItems.length;
      return `Fiyat listenizdeki ortalama fiyat ${formatTL(avg)}.`;
    },
  },
  {
    id: "company_settings_completeness",
    category: "Sistem",
    label: "İşletme bilgilerim ne kadar dolu?",
    keywords: ["işletme bilgisi doluluk", "işletme bilgileri eksik mi"],
    compute: (ctx) => {
      const fields = [
        ctx.companySettings?.companyName,
        ctx.companySettings?.address,
        ctx.companySettings?.phone,
        ctx.companySettings?.email,
        ctx.companySettings?.taxNumber,
      ];
      const filled = fields.filter(Boolean).length;
      return `İşletme bilgilerinizin ${filled}/${fields.length} alanı dolu.`;
    },
  },
  {
    id: "logo_uploaded",
    category: "Sistem",
    label: "Logom yüklü mü?",
    keywords: ["logo yüklü mü", "firma logosu var mı"],
    compute: (ctx) =>
      ctx.companySettings?.logoUrl
        ? "Evet, logonuz yüklü."
        : "Henüz bir logo yüklemediniz - teklif PDF'lerinizde ve portalda daha profesyonel görünmesi için ekleyebilirsiniz.",
  },
  {
    id: "lead_capture_link_active",
    category: "Sistem",
    label: "Müşteri Kazanma Linkim aktif mi?",
    keywords: ["müşteri kazanma linki aktif mi", "lead capture link"],
    compute: (ctx) =>
      ctx.companySettings?.leadCaptureToken
        ? "Evet, Müşteri Kazanma Linkiniz aktif - Ayarlar'dan paylaşabilirsiniz."
        : "Müşteri Kazanma Linkiniz henüz oluşturulmamış görünüyor.",
  },
  {
    id: "default_kdv_rate_value",
    category: "Sistem",
    label: "Varsayılan KDV oranım kaç?",
    keywords: ["varsayılan kdv oranı", "default kdv"],
    compute: (ctx) => `Varsayılan KDV oranınız %${ctx.companySettings?.defaultKdvRate ?? 20}.`,
  },
  {
    id: "customer_notifications_enabled_status",
    category: "Sistem",
    label: "Müşteri bildirimleri açık mı?",
    keywords: ["müşteri bildirimleri açık mı", "customer notification durumu"],
    compute: (ctx) =>
      ctx.companySettings?.customerNotificationsEnabled !== false
        ? "Evet, müşteri bildirimleri açık."
        : "Hayır, müşteri bildirimlerini kapatmışsınız.",
  },
  {
    id: "appointment_reminders_enabled_status",
    category: "Sistem",
    label: "Randevu hatırlatmaları açık mı?",
    keywords: ["randevu hatırlatması açık mı", "otomatik hatırlatma durumu"],
    visibleIf: (sector) => supportsSelfBooking(sector),
    compute: (ctx) =>
      ctx.companySettings?.appointmentRemindersEnabled !== false
        ? "Evet, otomatik randevu hatırlatma e-postaları açık."
        : "Hayır, otomatik randevu hatırlatmalarını kapatmışsınız.",
  },
  {
    id: "pdf_template_count",
    category: "Sistem",
    label: "Kaç özel PDF şablonum var?",
    keywords: ["pdf şablon sayısı", "kaç teklif şablonum var"],
    compute: (ctx) => {
      const count = (ctx.pdfTemplates || []).length;
      return count > 0
        ? `${count} özel PDF şablonunuz var.`
        : "Henüz özel bir PDF şablonu oluşturmadınız, hazır şablonlardan birini kullanıyorsunuz.";
    },
  },
  {
    id: "using_custom_pdf_template",
    category: "Sistem",
    label: "Şu anda özel bir PDF şablonu mu kullanıyorum?",
    keywords: ["özel şablon kullanıyor muyum", "seçili pdf şablonu"],
    compute: (ctx) => {
      const isCustom =
        ctx.companySettings?.pdfTemplateKey &&
        (ctx.pdfTemplates || []).some((t) => t.id === ctx.companySettings.pdfTemplateKey);
      return isCustom
        ? "Evet, kendi oluşturduğunuz özel bir PDF şablonunu kullanıyorsunuz."
        : "Hayır, hazır (galeri) şablonlardan birini kullanıyorsunuz.";
    },
  },
  {
    id: "deal_line_items_usage_count",
    category: "Sistem",
    label: "Kaç kaydımda kalem bazlı ürün/hizmet listesi kullanılmış?",
    keywords: ["kalem bazlı kayıt sayısı", "çoklu kalem kullanan teklif"],
    compute: (ctx) => {
      const dealIds = new Set((ctx.dealLineItems || []).map((li) => li.dealId));
      return dealIds.size > 0
        ? `${dealIds.size} kaydınızda kalem bazlı ürün/hizmet listesi kullanılmış.`
        : "Henüz kalem bazlı ürün/hizmet listesi kullanan bir kaydınız yok.";
    },
  },
  {
    id: "avg_line_items_per_deal",
    category: "Sistem",
    label: "Kalem kullanan kayıtlarda ortalama kaç kalem var?",
    keywords: ["ortalama kalem sayısı", "kayıt başına kalem sayısı"],
    compute: (ctx) => {
      const lineItems = ctx.dealLineItems || [];
      if (lineItems.length === 0)
        return "Henüz kalem bazlı ürün/hizmet listesi kullanan bir kaydınız yok.";
      const dealIds = new Set(lineItems.map((li) => li.dealId));
      return `Kalem kullanan kayıtlarınızda ortalama ${(lineItems.length / dealIds.size).toFixed(1)} kalem var.`;
    },
  },

  // ---- Analiz (teşhis — birden fazla sinyali birleştirip yorum/öneri üretir) ----
  {
    id: "diagnosis_why_losing",
    category: "Analiz",
    label: "Neden satışlarımı/kayıtlarımı kaybediyorum?",
    keywords: [
      "neden kaybediyorum",
      "satış kaybı analizi",
      "neden satamıyorum",
      "kayıp analizi teşhis",
      "neyi değiştirmem lazım",
    ],
    compute: (ctx) => {
      const lost = ctx.deals.filter((d) => d.stage === "kaybedildi" && d.lostReason);
      if (lost.length < 3)
        return "Nedeni belirtilmiş yeterli kayıp kaydınız yok (en az birkaç kayıt gerekiyor) - kayıp nedenini not etmeye devam edin, zamanla burada net bir örüntü görebiliriz.";
      const totals = {};
      lost.forEach((d) => {
        totals[d.lostReason] = (totals[d.lostReason] || 0) + 1;
      });
      const [topReason, topCount] = topEntry(totals);
      const share = Math.round((topCount / lost.length) * 100);
      const advice =
        REASON_ADVICE[topReason] ||
        "Bu nedeni daha yakından incelemek için ilgili kayıtların notlarına tekrar göz atmanızda fayda var.";
      if (share >= 40)
        return `Kayıplarınızın %${share}'i "${topReason}" nedeniyle (${topCount}/${lost.length}) - baskın bir örüntü var. ${advice}`;
      return `Kayıplarınız birçok farklı nedene dağılmış, tek bir baskın neden yok (en sık: "${topReason}", %${share}). Genel bir sorundan çok kayıt bazlı özel durumlar öne çıkıyor gibi görünüyor.`;
    },
  },
  {
    id: "diagnosis_win_rate_trend",
    category: "Analiz",
    label: "Satış performansım iyileşiyor mu kötüleşiyor mu?",
    keywords: ["performansım nasıl gidiyor", "satış trendi", "iyileşiyor muyum kötüleşiyor muyum"],
    compute: (ctx) => {
      const now = new Date();
      const thisBounds = getRangeBounds("bu_ay");
      const lastStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lastEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
      const closedThis = ctx.deals.filter(
        (d) =>
          (d.stage === "kazanildi" || d.stage === "kaybedildi") &&
          inRange(d.closedAt || d.createdAt, thisBounds),
      );
      const closedLast = ctx.deals.filter(
        (d) =>
          (d.stage === "kazanildi" || d.stage === "kaybedildi") &&
          inRange(d.closedAt || d.createdAt, { start: lastStart, end: lastEnd }),
      );
      if (closedThis.length < 3 || closedLast.length < 3)
        return "Sağlıklı bir trend karşılaştırması için bu ay ve geçen ay yeterli sayıda sonuçlanmış kaydınız yok.";
      const winRateThis =
        closedThis.filter((d) => d.stage === "kazanildi").length / closedThis.length;
      const winRateLast =
        closedLast.filter((d) => d.stage === "kazanildi").length / closedLast.length;
      const diff = Math.round((winRateThis - winRateLast) * 100);
      if (diff <= -10)
        return `Kazanma oranınız geçen aya göre ${Math.abs(diff)} puan düştü (%${Math.round(winRateLast * 100)} → %${Math.round(winRateThis * 100)}) - kayıp nedenlerinize bakmanızda fayda var, "neden kaybediyorum" diye de sorabilirsiniz.`;
      if (diff >= 10)
        return `Kazanma oranınız geçen aya göre ${diff} puan arttı (%${Math.round(winRateLast * 100)} → %${Math.round(winRateThis * 100)}) - iyi gidiyor, bu ay ne farklı yaptığınızı not etmeye değer.`;
      return `Kazanma oranınız geçen aya göre görece stabil (%${Math.round(winRateLast * 100)} → %${Math.round(winRateThis * 100)}).`;
    },
  },
  {
    id: "diagnosis_follow_up_habits",
    category: "Analiz",
    label: "Takip alışkanlıklarımda bir sorun var mı?",
    keywords: [
      "takip alışkanlığım nasıl",
      "hatırlatma eksikliği teşhis",
      "takibimi nasıl iyileştiririm",
    ],
    compute: (ctx) => {
      const open = ctx.deals.filter((d) => d.stage !== "kazanildi" && d.stage !== "kaybedildi");
      if (open.length === 0) return "Şu anda açık bir kaydınız yok.";
      const todayStr = new Date().toISOString().slice(0, 10);
      const missing = open.filter((d) => !d.reminderDate).length;
      const overdue = open.filter((d) => d.reminderDate && d.reminderDate < todayStr).length;
      const missingShare = Math.round((missing / open.length) * 100);
      if (missingShare >= 40 || overdue >= 5) {
        return `Açık kayıtlarınızın %${missingShare}'inde hiç hatırlatma tarihi yok, ${overdue} tanesinin hatırlatması da geçmiş - bu, takibi kaçırıp kayıt kaybetmenin yaygın bir nedenidir. Her açık kayda bir sonraki adım için hatırlatma tarihi eklemeyi alışkanlık hâline getirin.`;
      }
      return `Takip alışkanlıklarınız iyi görünüyor - açık kayıtlarınızın çoğunda hatırlatma tarihi var, geciken hatırlatma sayınız (${overdue}) düşük.`;
    },
  },
  {
    id: "diagnosis_retention_risk",
    category: "Analiz",
    label: "Müşteri kaybetme riskim var mı?",
    keywords: ["müşteri kaybetme riski", "churn riski teşhis", "müşterilerim uzaklaşıyor mu"],
    compute: (ctx) => {
      if (ctx.passiveCustomerRate == null)
        return "Bu analiz için henüz yeterli müşteri/kayıt verisi yok.";
      const rate = Math.round(ctx.passiveCustomerRate);
      if (rate >= 40)
        return `Müşterilerinizin %${rate}'i 90 gündür işlem yapmıyor - bu yüksek bir oran, kaybetme riski taşıyorsunuz. Bu müşterilere kişisel bir hatırlatma mesajı veya küçük bir kampanya göndermeyi değerlendirin.`;
      if (rate >= 20)
        return `Müşterilerinizin %${rate}'i pasif durumda - takip edilmeye değer ama henüz alarm verici değil.`;
      return `Pasif müşteri oranınız düşük (%${rate}) - müşteri bağlılığınız şu an sağlıklı görünüyor.`;
    },
  },
  {
    id: "diagnosis_pricing_signal",
    category: "Analiz",
    label: "Fiyatımı gözden geçirmeli miyim?",
    keywords: [
      "fiyatımı değiştirmeli miyim",
      "fiyat sorunu var mı",
      "fiyat gözden geçirme sinyali",
    ],
    compute: (ctx) => {
      const bounds = getRangeBounds("son_6_ay");
      const lost = ctx.deals.filter(
        (d) =>
          d.stage === "kaybedildi" && d.lostReason && inRange(d.closedAt || d.createdAt, bounds),
      );
      if (lost.length < 3)
        return "Son 6 ayda nedeni belirtilmiş yeterli kayıp kaydınız yok, güvenilir bir sinyal veremiyorum.";
      const priceLost = lost.filter((d) => d.lostReason === "Yüksek fiyat").length;
      const share = Math.round((priceLost / lost.length) * 100);
      if (share >= 35)
        return `Son 6 aydaki kayıplarınızın %${share}'i "Yüksek fiyat" nedeniyle - bu, fiyatlandırmanızı gözden geçirmeniz için makul bir sinyal. İndirim yerine paketleme veya ek değer eklemeyi deneyebilirsiniz.`;
      return `Son 6 ayda "Yüksek fiyat" kayıplarınızın payı %${share} - fiyat, kayıplarınızda baskın bir neden gibi görünmüyor.`;
    },
  },
  {
    id: "diagnosis_stalled_deals",
    category: "Analiz",
    label: "Kayıtlarım neden takılı kalıyor?",
    keywords: ["kayıtlarım neden ilerlemiyor", "teklif takılı kaldı teşhis", "açık kayıt sorunu"],
    compute: (ctx) => {
      const open = ctx.deals.filter((d) => d.stage !== "kazanildi" && d.stage !== "kaybedildi");
      if (open.length === 0) return "Şu anda açık bir kaydınız yok.";
      const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
      const stalled = open.filter((d) => new Date(d.createdAt).getTime() < cutoff).length;
      const share = Math.round((stalled / open.length) * 100);
      if (share >= 40)
        return `Açık kayıtlarınızın %${share}'i 30 günden uzun süredir açık - bu kayıtlarda net bir "evet/hayır" cevabı almak için daha proaktif bir takip deneyin; uzayan belirsizlik genelde kayba dönüşür.`;
      return `Açık kayıtlarınızın çoğu makul bir sürede ilerliyor (%${share}'i 30 günden eski) - takılı kalma şu an büyük bir sorun gibi görünmüyor.`;
    },
  },
  {
    id: "diagnosis_sla_health",
    category: "Analiz",
    label: "Destek sürecim satışlarımı etkiliyor olabilir mi?",
    keywords: ["destek satışı etkiliyor mu", "sla satış ilişkisi", "destek kalitesi teşhis"],
    compute: (ctx) => {
      if (ctx.tickets.length === 0) return "Henüz destek talebi verisi yok, bu analiz için erken.";
      const resolved = ctx.tickets.filter((t) => TERMINAL_STATUSES.includes(t.status));
      const rate = Math.round((resolved.length / ctx.tickets.length) * 100);
      if (ctx.breachedTicketsCount >= 3 || rate < 50) {
        return `${ctx.breachedTicketsCount} talebiniz SLA'yı aşmış ve çözülme oranınız %${rate} - yavaş/eksik destek genelde müşteri güvenini ve tekrar satın almayı olumsuz etkiler. Önce bekleyen talepleri kapatmaya odaklanın.`;
      }
      return `Destek sürecinizde (SLA aşımı ${ctx.breachedTicketsCount}, çözülme oranı %${rate}) belirgin bir sorun görünmüyor - bu şu an satışlarınızı olumsuz etkileyen bir faktör gibi durmuyor.`;
    },
  },
  {
    id: "diagnosis_top_priority",
    category: "Analiz",
    label: "Şu an en çok neye odaklanmalıyım?",
    keywords: [
      "neyi değiştirmem lazım genel",
      "en öncelikli sorunum ne",
      "şimdi ne yapmalıyım",
      "genel teşhis",
    ],
    compute: (ctx) => {
      const candidates = [];
      if (ctx.breachedTicketsCount > 0) {
        candidates.push({
          score: ctx.breachedTicketsCount * 3,
          text: `${ctx.breachedTicketsCount} destek talebinizin SLA süresi geçmiş - müşteri güvenini doğrudan etkiler, önce bunlara bakın.`,
        });
      }
      const open = ctx.deals.filter((d) => d.stage !== "kazanildi" && d.stage !== "kaybedildi");
      const todayStr = new Date().toISOString().slice(0, 10);
      const overdueReminders = open.filter(
        (d) => d.reminderDate && d.reminderDate < todayStr,
      ).length;
      if (overdueReminders > 0) {
        candidates.push({
          score: overdueReminders * 2,
          text: `${overdueReminders} kaydınızın hatırlatma tarihi geçmiş - bunları güncelleyip takip etmek muhtemelen en hızlı kazanımı sağlar.`,
        });
      }
      if (ctx.passiveCustomerRate != null && ctx.passiveCustomerRate >= 40) {
        candidates.push({
          score: ctx.passiveCustomerRate,
          text: `Müşterilerinizin %${Math.round(ctx.passiveCustomerRate)}'i pasif durumda - bir yeniden etkileşim kampanyası düşünmelisiniz.`,
        });
      }
      const bounds6m = getRangeBounds("son_6_ay");
      const lost6m = ctx.deals.filter(
        (d) =>
          d.stage === "kaybedildi" && d.lostReason && inRange(d.closedAt || d.createdAt, bounds6m),
      );
      if (lost6m.length >= 3) {
        const priceLost = lost6m.filter((d) => d.lostReason === "Yüksek fiyat").length;
        if (priceLost / lost6m.length >= 0.35) {
          candidates.push({
            score: (priceLost / lost6m.length) * 50,
            text: 'Son 6 ayda kayıplarınızın önemli bir kısmı "Yüksek fiyat" nedeniyle - fiyatlandırmanızı gözden geçirmeyi düşünün.',
          });
        }
      }
      if (candidates.length === 0)
        return "Şu an belirgin bir alarm sinyali görünmüyor - genel durumunuz istikrarlı, düzenli takibe devam edin.";
      return candidates.sort((a, b) => b.score - a.score)[0].text;
    },
  },
  {
    id: "diagnosis_repeat_customer_rate",
    category: "Analiz",
    label: "Müşterilerim tekrar mı satın alıyor?",
    keywords: ["tekrar satın alma", "sadık müşteri oranı", "müşteri tekrar geliyor mu"],
    compute: (ctx) => {
      const won = ctx.deals.filter((d) => d.stage === "kazanildi");
      if (won.length === 0) return "Henüz kazanılmış bir kaydınız yok, bu analiz için erken.";
      const byCustomer = {};
      won.forEach((d) => {
        byCustomer[d.customerId] = (byCustomer[d.customerId] || 0) + 1;
      });
      const customerCount = Object.keys(byCustomer).length;
      if (customerCount < 5)
        return "Sağlıklı bir oran için yeterli müşteri sayınız yok, veri arttıkça burada anlamlı bir sonuç görürsünüz.";
      const repeatCount = Object.values(byCustomer).filter((n) => n >= 2).length;
      const share = Math.round((repeatCount / customerCount) * 100);
      if (share >= 30)
        return `Müşterilerinizin %${share}'i birden fazla kez satın almış - sağlıklı bir tekrar oranı, mevcut müşteri ilişkilerinizi korumaya devam edin.`;
      return `Müşterilerinizin sadece %${share}'i birden fazla kez satın almış, çoğu tek seferlik - mevcut müşterilere yeniden ulaşmayı (hatırlatma, küçük bir kampanya) değerlendirin, genelde yeni müşteri kazanmaktan daha ucuza gelir.`;
    },
  },
  {
    id: "diagnosis_sales_cycle_length",
    category: "Analiz",
    label: "Bir kaydı kapatmam ortalama ne kadar sürüyor?",
    keywords: ["satış döngüsü", "kapanma süresi", "ne kadar sürede kazanıyorum"],
    compute: (ctx) => {
      const won = ctx.deals.filter((d) => d.stage === "kazanildi" && d.closedAt);
      if (won.length < 3) return "Sağlıklı bir ortalama için yeterli kazanılmış kaydınız yok.";
      const totalDays = won.reduce(
        (sum, d) => sum + (new Date(d.closedAt) - new Date(d.createdAt)) / (1000 * 60 * 60 * 24),
        0,
      );
      const avgDays = Math.round(totalDays / won.length);
      if (avgDays > 30)
        return `Bir kaydı kazanmanız ortalama ${avgDays} gün sürüyor - bu uzun bir süre, açık kayıtlarınızı daha sık takip etmek karar sürecini hızlandırabilir.`;
      return `Bir kaydı kazanmanız ortalama ${avgDays} gün sürüyor - makul bir hız, mevcut takip temponuzu koruyun.`;
    },
  },
  {
    id: "diagnosis_expense_to_revenue_health",
    category: "Analiz",
    label: "Giderlerim gelirime göre sağlıklı bir seviyede mi?",
    keywords: ["gider gelir oranı", "marjım sağlıklı mı", "kâr marjı teşhis"],
    compute: (ctx) => {
      const bounds = getRangeBounds("bu_ay");
      const income = ctx.payments
        .filter((p) => inRange(p.paidAt, bounds))
        .reduce((sum, p) => sum + (p.amount || 0), 0);
      const expense = ctx.companyExpenses
        .flatMap((e) => expandExpenseOccurrences(e, bounds))
        .reduce((sum, e) => sum + (e.amount || 0), 0);
      const dealCost = ctx.deals
        .filter(
          (d) =>
            d.stage === "kazanildi" &&
            (d.cost || 0) > 0 &&
            inRange(d.closedAt || d.createdAt, bounds),
        )
        .reduce((sum, d) => sum + (d.cost || 0), 0);
      const totalExpense = expense + dealCost;
      if (income === 0) return "Bu ay henüz bir geliriniz yok, bu oranı hesaplamak için erken.";
      const ratio = Math.round((totalExpense / income) * 100);
      if (ratio >= 80)
        return `Bu ay giderleriniz gelirinizin %${ratio}'i - kâr marjınız daralmış görünüyor, gereksiz/tekrarlayan giderlerinizi gözden geçirmenizde fayda var.`;
      if (ratio >= 50)
        return `Bu ay giderleriniz gelirinizin %${ratio}'i - normal aralıkta ama yakından takip etmeye devam edin.`;
      return `Bu ay giderleriniz gelirinizin sadece %${ratio}'i - sağlıklı bir marjla çalışıyorsunuz.`;
    },
  },
  {
    id: "diagnosis_collection_delay",
    category: "Analiz",
    label: "Kazandığım kayıtlarda tahsilatı almam ne kadar sürüyor?",
    keywords: ["tahsilat gecikmesi", "ödeme almam ne kadar sürüyor", "nakit akışı gecikme teşhisi"],
    compute: (ctx) => {
      const won = ctx.deals.filter((d) => d.stage === "kazanildi" && d.closedAt && d.value > 0);
      if (won.length === 0) return "Henüz kazanılmış bir kaydınız yok.";
      const delays = [];
      won.forEach((d) => {
        const dealPayments = ctx.payments
          .filter((p) => p.dealId === d.id)
          .sort((a, b) => new Date(a.paidAt) - new Date(b.paidAt));
        const paidTotal = dealPayments.reduce((sum, p) => sum + (p.amount || 0), 0);
        if (dealPayments.length > 0 && paidTotal >= d.value) {
          const lastPayment = dealPayments[dealPayments.length - 1];
          delays.push(
            (new Date(lastPayment.paidAt) - new Date(d.closedAt)) / (1000 * 60 * 60 * 24),
          );
        }
      });
      if (delays.length < 3)
        return "Tamamen tahsil edilmiş yeterli kaydınız yok, güvenilir bir ortalama veremiyorum.";
      const avgDelay = Math.round(delays.reduce((a, b) => a + b, 0) / delays.length);
      if (avgDelay <= 0)
        return "Kazandığınız kayıtlarda tahsilatı genelde aynı gün veya önceden alıyorsunuz - tahsilat süreciniz sağlıklı.";
      if (avgDelay > 14)
        return `Kazandığınız bir kaydın tamamen tahsil edilmesi ortalama ${avgDelay} gün sürüyor - bu nakit akışınızı zorlayabilir, peşinat almayı veya daha kısa vadeli bir ödeme planı istemeyi değerlendirin.`;
      return `Kazandığınız bir kaydın tamamen tahsil edilmesi ortalama ${avgDelay} gün sürüyor - makul bir süre.`;
    },
  },
  {
    id: "diagnosis_no_show_trend",
    category: "Analiz",
    label: "Gelmeme oranım geçen aya göre artıyor mu?",
    keywords: ["gelmeme oranı artıyor mu", "no-show trend", "randevuya gelmeme değişimi"],
    visibleIf: (sector) => isAppointmentSector(sector),
    compute: (ctx) => {
      const now = new Date();
      const thisBounds = getRangeBounds("bu_ay");
      const lastStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lastEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
      const closedThis = ctx.deals.filter(
        (d) =>
          (d.stage === "kazanildi" || d.stage === "kaybedildi") &&
          inRange(d.closedAt || d.createdAt, thisBounds),
      );
      const closedLast = ctx.deals.filter(
        (d) =>
          (d.stage === "kazanildi" || d.stage === "kaybedildi") &&
          inRange(d.closedAt || d.createdAt, { start: lastStart, end: lastEnd }),
      );
      if (closedThis.length < 3 || closedLast.length < 3)
        return "Sağlıklı bir karşılaştırma için bu ay ve geçen ay yeterli sayıda sonuçlanmış randevunuz yok.";
      const rateOf = (list) =>
        Math.round(
          (list.filter((d) => d.stage === "kaybedildi" && d.lostReason === "Randevuya gelmedi")
            .length /
            list.length) *
            100,
        );
      const thisRate = rateOf(closedThis);
      const lastRate = rateOf(closedLast);
      if (thisRate > lastRate + 5)
        return `Bu ay gelmeme oranınız %${thisRate}, geçen ay %${lastRate}'ti - artış var, randevu hatırlatmalarınızın açık olduğundan emin olun ve randevuya yakın ek bir hatırlatma göndermeyi deneyin.`;
      if (thisRate < lastRate - 5)
        return `Bu ay gelmeme oranınız %${thisRate}, geçen ay %${lastRate}'ti - düşüş iyi bir işaret, mevcut hatırlatma alışkanlığınızı koruyun.`;
      return `Bu ay gelmeme oranınız %${thisRate}, geçen ay %${lastRate}'ti - belirgin bir değişim yok.`;
    },
  },
  {
    id: "diagnosis_top_price_item",
    category: "Analiz",
    label: "Hangi ürün/hizmetim en çok satılıyor?",
    keywords: ["en çok satılan ürün", "en çok satılan hizmet", "hangi kalem öne çıkıyor"],
    compute: (ctx) => {
      const wonIds = new Set(ctx.deals.filter((d) => d.stage === "kazanildi").map((d) => d.id));
      const items = ctx.dealLineItems.filter((li) => wonIds.has(li.dealId));
      const totals = {};
      items.forEach((li) => {
        totals[li.description] = (totals[li.description] || 0) + (li.quantity || 1);
      });
      const top = topEntry(totals);
      if (!top) return "Kazanılmış kayıtlarınızda henüz kalem (ürün/hizmet satırı) bulunmuyor.";
      return `En çok satılan kaleminiz "${top[0]}" - kazanılmış kayıtlarınızda toplam ${top[1]} adet. Bunu öne çıkaran bir kampanya veya paket düşünebilirsiniz.`;
    },
  },
  {
    id: "diagnosis_missing_attachments_risk",
    category: "Analiz",
    label: "Kazandığım kayıtlarda dosya/sözleşme eksikliği riski var mı?",
    keywords: ["dosya eksikliği riski", "sözleşme eksik", "belgelendirme teşhisi"],
    compute: (ctx) => {
      const won = ctx.deals.filter((d) => d.stage === "kazanildi");
      if (won.length < 3) return "Yeterli kazanılmış kaydınız yok, bu analiz için erken.";
      const dealIdsWithAttachment = new Set(
        ctx.attachments
          .filter((a) => a.entityType === "deals" && !a.deletedAt)
          .map((a) => a.entityId),
      );
      const missing = won.filter((d) => !dealIdsWithAttachment.has(d.id)).length;
      const share = Math.round((missing / won.length) * 100);
      if (share >= 50)
        return `Kazandığınız kayıtların %${share}'inde hiç dosya/sözleşme eklenmemiş - bir anlaşmazlık durumunda elinizde kanıt olmayabilir, en azından önemli kayıtlara sözleşme veya onay yazışması eklemeyi alışkanlık hâline getirin.`;
      return `Kazandığınız kayıtların çoğunda (%${100 - share}'i) dosya/sözleşme eklenmiş - dokümantasyon alışkanlığınız iyi durumda.`;
    },
  },
  {
    id: "diagnosis_portal_lead_quality",
    category: "Analiz",
    label: "Kendi kendine alınan randevularım ne kadar iyi dönüşüyor?",
    keywords: [
      "portal kaydı kalitesi",
      "kendi randevusunu alan müşteri",
      "portal dönüşüm oranı",
      "web randevu widget kalitesi",
    ],
    visibleIf: (sector) => supportsSelfBooking(sector),
    compute: (ctx) => {
      // Müşteri portalından (giriş yapıp) veya herkese açık randevu-al widget'ından
      // (hiç kaydı olmadan) gelenler burada birlikte sayılır — ikisi de "KOBİ'nin
      // elle eklemediği" aynı kalite sorusuna cevap arıyor.
      const selfBookedDeals = ctx.deals.filter(
        (d) =>
          SELF_BOOKED_SOURCES.includes(d.customFields?.kaynak) &&
          (d.stage === "kazanildi" || d.stage === "kaybedildi"),
      );
      const manualDeals = ctx.deals.filter(
        (d) =>
          !SELF_BOOKED_SOURCES.includes(d.customFields?.kaynak) &&
          (d.stage === "kazanildi" || d.stage === "kaybedildi"),
      );
      if (selfBookedDeals.length < 3)
        return "Kendi kendine alınan yeterli sayıda sonuçlanmış kaydınız yok, karşılaştırma için erken.";
      const selfBookedWinRate = Math.round(
        (selfBookedDeals.filter((d) => d.stage === "kazanildi").length / selfBookedDeals.length) *
          100,
      );
      if (manualDeals.length < 3)
        return `Kendi kendine alınan kayıtlarınızın kazanma oranı %${selfBookedWinRate} - elle eklediğiniz kayıt sayınız karşılaştırma için henüz yetersiz.`;
      const manualWinRate = Math.round(
        (manualDeals.filter((d) => d.stage === "kazanildi").length / manualDeals.length) * 100,
      );
      if (selfBookedWinRate < manualWinRate - 15)
        return `Kendi kendine alınan kayıtlarınızın kazanma oranı %${selfBookedWinRate}, elle eklediklerinizde ise %${manualWinRate} - kendi kendine alınan taleplerin kalitesi biraz daha düşük olabilir, bu kayıtlara daha hızlı geri dönmeyi deneyin.`;
      return `Kendi kendine alınan kayıtlarınızın kazanma oranı %${selfBookedWinRate}, elle eklediklerinizde %${manualWinRate} - aralarında belirgin bir kalite farkı görünmüyor.`;
    },
  },
  {
    id: "diagnosis_price_list_usage",
    category: "Analiz",
    label: "Kayıtlarımda fiyat listesini mi kullanıyorum, yoksa hep elle mi fiyat giriyorum?",
    keywords: [
      "fiyat listesi kullanım oranı",
      "elle fiyat giriyorum",
      "yapılandırılmış fiyatlandırma",
    ],
    compute: (ctx) => {
      if (ctx.priceListItems.length === 0)
        return "Henüz bir fiyat listeniz yok - Fiyat Listesi sekmesinden ekleyip kayıtlarınızda seçerek zaman kazanabilirsiniz.";
      if (ctx.dealLineItems.length === 0)
        return "Kayıtlarınızda henüz kalem (ürün/hizmet satırı) kullanılmamış.";
      const priceListNames = new Set(ctx.priceListItems.map((i) => i.name));
      const fromList = ctx.dealLineItems.filter((li) => priceListNames.has(li.description)).length;
      const share = Math.round((fromList / ctx.dealLineItems.length) * 100);
      if (share < 40)
        return `Kalemlerinizin sadece %${share}'i fiyat listenizdeki ürün/hizmet adlarıyla eşleşiyor - çoğunlukla elle fiyat giriyor olabilirsiniz, fiyat listesini kullanmak hata riskini ve zaman kaybını azaltır.`;
      return `Kalemlerinizin %${share}'i fiyat listenizdeki ürün/hizmetlerle eşleşiyor - fiyat listenizi düzenli kullanıyorsunuz.`;
    },
  },
  {
    id: "diagnosis_missing_contact_info",
    category: "Analiz",
    label: "Müşterilerimin iletişim bilgileri eksik mi?",
    keywords: [
      "telefon eksik",
      "e-posta eksik",
      "iletişim bilgisi eksikliği",
      "ulaşılamayan müşteri",
    ],
    compute: (ctx) => {
      if (ctx.customers.length === 0) return "Henüz bir müşteri kaydınız yok.";
      const unreachable = ctx.customers.filter((c) => !c.phone && !c.email).length;
      const share = Math.round((unreachable / ctx.customers.length) * 100);
      if (share >= 15)
        return `Müşterilerinizin %${share}'inde ne telefon ne e-posta var - bu müşterilere ulaşamazsınız, kayıtlarını güncellemeyi önceliklendirin.`;
      return `Müşterilerinizin çoğunda telefon veya e-posta kayıtlı (%${100 - share}'i) - iletişim bilgileriniz genel olarak sağlıklı.`;
    },
  },
  {
    id: "diagnosis_team_performance_gap",
    category: "Analiz",
    label: "Takım üyelerim arasında performans farkı büyük mü?",
    keywords: ["performans farkı", "takım dengesizliği", "üye performansı karşılaştırma"],
    compute: (ctx) => {
      const closed = ctx.deals.filter(
        (d) => d.assignedTo && (d.stage === "kazanildi" || d.stage === "kaybedildi"),
      );
      const byMember = {};
      closed.forEach((d) => {
        if (!byMember[d.assignedTo]) byMember[d.assignedTo] = { won: 0, total: 0 };
        byMember[d.assignedTo].total += 1;
        if (d.stage === "kazanildi") byMember[d.assignedTo].won += 1;
      });
      const rates = Object.values(byMember)
        .filter((m) => m.total >= 3)
        .map((m) => (m.won / m.total) * 100);
      if (rates.length < 2)
        return "Karşılaştırma için yeterli veri yok (en az 2 üye, her biri en az 3 sonuçlanmış kayıt gerekiyor).";
      const gap = Math.round(Math.max(...rates) - Math.min(...rates));
      if (gap >= 30)
        return `Takım üyeleriniz arasında kazanma oranı farkı %${gap} puana kadar çıkıyor - düşük performanslı üyeye eşlik/eğitim desteği vermeyi değerlendirin.`;
      return `Takım üyeleriniz arasındaki kazanma oranı farkı %${gap} puan - belirgin bir dengesizlik görünmüyor.`;
    },
  },
  {
    id: "diagnosis_best_weekday",
    category: "Analiz",
    label: "Haftanın hangi günü en çok kazanıyorum?",
    keywords: ["hangi gün daha çok satıyorum", "haftanın en verimli günü", "en çok kazandığım gün"],
    visibleIf: (sector) => isAppointmentSector(sector) || supportsSelfBooking(sector),
    compute: (ctx) => {
      const won = ctx.deals.filter((d) => d.stage === "kazanildi" && d.closedAt);
      if (won.length < 7) return "Sağlıklı bir örüntü için yeterli kazanılmış kaydınız yok.";
      const counts = {};
      won.forEach((d) => {
        const wd = WEEKDAYS[(new Date(d.closedAt).getDay() + 6) % 7];
        counts[wd] = (counts[wd] || 0) + 1;
      });
      const top = topEntry(counts);
      return `En çok kazandığınız gün ${top[0]} (${top[1]} kayıt) - o gün için ekstra hazırlıklı/müsait olmak işinize yarayabilir.`;
    },
  },
  {
    id: "diagnosis_lost_value_total",
    category: "Analiz",
    label: "Kaybettiğim kayıtların toplam değeri ne kadar?",
    keywords: ["kayıp fırsat maliyeti", "kaybedilen kayıtların tutarı", "kaçırdığım ciro"],
    compute: (ctx) => {
      const bounds = getRangeBounds("son_6_ay");
      const lost = ctx.deals.filter(
        (d) => d.stage === "kaybedildi" && inRange(d.closedAt || d.createdAt, bounds),
      );
      if (lost.length === 0) return "Son 6 ayda kaybedilmiş bir kaydınız yok.";
      const total = lost.reduce((sum, d) => sum + (d.value || 0), 0);
      return `Son 6 ayda kaybettiğiniz kayıtların toplam değeri ${formatTL(total)} (${lost.length} kayıt) - bu tutarın bir kısmını geri kazanmak için uygun olanlara tekrar dönmeyi değerlendirebilirsiniz.`;
    },
  },
  {
    id: "diagnosis_pipeline_momentum",
    category: "Analiz",
    label: "Yeni kayıt açma hızım yavaşlıyor mu?",
    keywords: ["pipeline yavaşlıyor mu", "yeni kayıt hızı", "yeni fırsat girişi azalıyor mu"],
    compute: (ctx) => {
      const now = new Date();
      const thisBounds = getRangeBounds("bu_ay");
      const lastStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lastEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
      const thisCount = ctx.deals.filter((d) => inRange(d.createdAt, thisBounds)).length;
      const lastCount = ctx.deals.filter((d) =>
        inRange(d.createdAt, { start: lastStart, end: lastEnd }),
      ).length;
      if (lastCount < 3)
        return "Geçen ay yeterli veri yok, sağlıklı bir karşılaştırma yapılamıyor.";
      const change = Math.round(((thisCount - lastCount) / lastCount) * 100);
      if (change <= -30)
        return `Bu ay ${thisCount} yeni kayıt açtınız, geçen ay ${lastCount} idi - %${Math.abs(change)} bir düşüş var, yeni müşteri/kayıt kazanma çabalarınızı gözden geçirmenin zamanı olabilir.`;
      if (change >= 30)
        return `Bu ay ${thisCount} yeni kayıt açtınız, geçen ay ${lastCount} idi - belirgin bir artış var, bu ivmeyi sürdürmeye çalışın.`;
      return `Bu ay ${thisCount} yeni kayıt açtınız, geçen ay ${lastCount} idi - hızınız istikrarlı.`;
    },
  },
  {
    id: "diagnosis_repeat_ticket_customers",
    category: "Analiz",
    label: "Aynı müşteriden tekrar tekrar destek talebi geliyor mu?",
    keywords: [
      "tekrarlayan şikayet",
      "sık destek talebi açan müşteri",
      "aynı müşteri sürekli talep açıyor",
    ],
    compute: (ctx) => {
      if (ctx.tickets.length < 5) return "Bu analiz için yeterli destek talebi verisi yok.";
      const byCustomer = {};
      ctx.tickets.forEach((t) => {
        byCustomer[t.customerId] = (byCustomer[t.customerId] || 0) + 1;
      });
      const repeatCustomers = Object.values(byCustomer).filter((n) => n >= 3).length;
      if (repeatCustomers === 0)
        return "3'ten fazla destek talebi açan bir müşteriniz yok - bu iyi bir işaret.";
      return `${repeatCustomers} müşteriniz 3 veya daha fazla destek talebi açmış - bu müşterilerde tekrar eden bir sorun olabilir, kök nedeni araştırmaya değer.`;
    },
  },
  {
    id: "diagnosis_internal_note_ratio",
    category: "Analiz",
    label: "Destek yanıtlarımın ne kadarı müşteriye gitmeden sadece dahili kalıyor?",
    keywords: ["dahili not oranı", "müşteriye gitmeyen yanıt", "destek şeffaflığı"],
    compute: (ctx) => {
      const outgoing = ctx.ticketMessages.filter((m) => m.direction === "giden");
      if (outgoing.length < 5) return "Bu analiz için yeterli destek mesajı verisi yok.";
      const internal = outgoing.filter((m) => m.isInternal).length;
      const share = Math.round((internal / outgoing.length) * 100);
      if (share >= 50)
        return `"Giden" mesajlarınızın %${share}'i dahili not - müşteriye giden gerçek yanıt oranınız düşük olabilir, taleplere doğrudan yanıt vermeyi unutmayın.`;
      return `"Giden" mesajlarınızın %${share}'i dahili not, geri kalanı doğrudan müşteriye gidiyor - sağlıklı bir oran.`;
    },
  },
  {
    id: "diagnosis_urgent_sla_health",
    category: "Analiz",
    label: "Acil öncelikli taleplerim SLA'yı sık aşıyor mu?",
    keywords: ["acil talep sla", "öncelik bazlı sla sağlığı", "acil talepler geç mi kalıyor"],
    compute: (ctx) => {
      const urgent = ctx.tickets.filter((t) => t.priority === "acil");
      if (urgent.length < 3)
        return 'Yeterli sayıda "Acil" öncelikli talebiniz yok, bu analiz için erken.';
      const openUrgent = urgent.filter((t) => !TERMINAL_STATUSES.includes(t.status));
      if (openUrgent.length === 0) return 'Şu anda açık bir "Acil" öncelikli talebiniz yok.';
      const breached = openUrgent.filter((t) => getSlaStatus(t).isBreached).length;
      const share = Math.round((breached / openUrgent.length) * 100);
      if (share >= 30)
        return `Açık "Acil" önceliğe sahip taleplerinizin %${share}'i SLA süresini aşmış - en acil talepleriniz bile geç kalıyor, önceliklendirme sürecinizi gözden geçirin.`;
      return `Açık "Acil" önceliğe sahip taleplerinizin %${share}'i SLA süresini aşmış - acil talepleriniz genel olarak zamanında yönetiliyor.`;
    },
  },
  {
    id: "diagnosis_avg_value_trend",
    category: "Analiz",
    label: "Ortalama kayıt değerim büyüyor mu küçülüyor mu?",
    keywords: [
      "ortalama değer trendi",
      "ortalama sepet büyüklüğü değişimi",
      "kayıt değerlerim küçülüyor mu",
    ],
    compute: (ctx) => {
      const now = new Date();
      const thisBounds = getRangeBounds("bu_ay");
      const lastStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lastEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
      const thisWon = ctx.deals.filter(
        (d) => d.stage === "kazanildi" && inRange(d.closedAt || d.createdAt, thisBounds),
      );
      const lastWon = ctx.deals.filter(
        (d) =>
          d.stage === "kazanildi" &&
          inRange(d.closedAt || d.createdAt, { start: lastStart, end: lastEnd }),
      );
      if (thisWon.length < 3 || lastWon.length < 3)
        return "Sağlıklı bir karşılaştırma için bu ay ve geçen ay yeterli kazanılmış kaydınız yok.";
      const avg = (list) => list.reduce((sum, d) => sum + (d.value || 0), 0) / list.length;
      const thisAvg = avg(thisWon);
      const lastAvg = avg(lastWon);
      const change = Math.round(((thisAvg - lastAvg) / lastAvg) * 100);
      if (change <= -15)
        return `Bu ay ortalama kayıt değeriniz ${formatTL(thisAvg)}, geçen ay ${formatTL(lastAvg)} idi - %${Math.abs(change)} düşüş var, daha küçük paketlere mi kayıyorsunuz kontrol edin.`;
      if (change >= 15)
        return `Bu ay ortalama kayıt değeriniz ${formatTL(thisAvg)}, geçen ay ${formatTL(lastAvg)} idi - %${change} artış var, olumlu bir gidişat.`;
      return `Bu ay ortalama kayıt değeriniz ${formatTL(thisAvg)}, geçen ay ${formatTL(lastAvg)} idi - belirgin bir değişim yok.`;
    },
  },
  {
    id: "diagnosis_activity_gap_months",
    category: "Analiz",
    label: "Son zamanlarda hiç yeni kayıt açmadığım bir dönem var mı?",
    keywords: ["aktivitesiz dönem", "kayıt açmadığım ay", "boşluk var mı"],
    compute: (ctx) => {
      const now = new Date();
      const emptyMonths = [];
      for (let i = 1; i <= 6; i++) {
        const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59, 999);
        const count = ctx.deals.filter((d) => inRange(d.createdAt, { start, end })).length;
        if (count === 0)
          emptyMonths.push(start.toLocaleDateString("tr-TR", { month: "long", year: "numeric" }));
      }
      if (emptyMonths.length === 0)
        return "Son 6 ayın her birinde en az bir yeni kayıt açmışsınız - tutarlı bir aktiviteniz var.";
      return `Son 6 ayda hiç yeni kayıt açmadığınız ay(lar): ${emptyMonths.join(", ")} - bu dönemlerde ne olduğunu hatırlamaya çalışın (tatil, yoğunluk, pazarlama eksikliği?), tekrarlamaması için not alın.`;
    },
  },
  {
    id: "diagnosis_manual_collection_risk",
    category: "Analiz",
    label: "Ödeme sağlayıcım bağlı değilse ne kadar tahsilatı elle takip ediyorum?",
    keywords: [
      "ödeme sağlayıcı bağlı değil",
      "elle tahsilat takibi riski",
      "online ödeme eksikliği",
    ],
    compute: (ctx) => {
      if (ctx.paymentCredentials.length > 0)
        return "Bir ödeme sağlayıcınız (iyzico/PayTR) bağlı - tahsilatlarınızın bir kısmı zaten otomatik/online takip ediliyor.";
      if (!ctx.totalOutstanding || ctx.totalOutstanding <= 0)
        return "Şu an bekleyen bir alacağınız yok, bu risk şu an için düşük.";
      return `Hiçbir ödeme sağlayıcınız bağlı değil ve ${formatTL(ctx.totalOutstanding)} bekleyen alacağınız var - bunların tamamını elle takip ediyorsunuz. Ayarlar → Ödeme Bağlantısı'ndan iyzico/PayTR bağlarsanız online tahsilat ve otomatik takip alabilirsiniz.`;
    },
  },
  {
    id: "diagnosis_popular_appointment_hour",
    category: "Analiz",
    label: "Hangi randevu saati en çok tercih ediliyor?",
    keywords: [
      "en popüler randevu saati",
      "hangi saat daha çok talep görüyor",
      "yoğun randevu saati",
    ],
    compute: (ctx) => {
      if (!ctx.appointmentDateTimeKey) return "Randevu tarihi alanı henüz tanımlı değil.";
      const withDate = ctx.deals.filter((d) => d.customFields?.[ctx.appointmentDateTimeKey]);
      if (withDate.length < 5) return "Yeterli randevu verisi yok, bu analiz için erken.";
      const counts = {};
      withDate.forEach((d) => {
        const dt = parseAppointmentDateTime(d.customFields[ctx.appointmentDateTimeKey]);
        if (dt) {
          const hour = `${String(dt.getHours()).padStart(2, "0")}:00`;
          counts[hour] = (counts[hour] || 0) + 1;
        }
      });
      const top = topEntry(counts);
      if (!top) return "Yeterli randevu verisi yok, bu analiz için erken.";
      return `En çok tercih edilen randevu saati ${top[0]} civarı (${top[1]} randevu) - o saat aralığında yeterli kapasite/personel ayırdığınızdan emin olun.`;
    },
  },
  {
    id: "diagnosis_passive_high_balance",
    category: "Analiz",
    label: "Uzun süredir iletişime geçmediğim ama bakiyesi olan müşterim var mı?",
    keywords: ["pasif yüksek bakiyeli müşteri", "unutulmuş alacak", "iletişimsiz borçlu müşteri"],
    compute: (ctx) => {
      const cutoff = Date.now() - 90 * 24 * 60 * 60 * 1000;
      const risky = ctx.customers.filter((c) => {
        if (!c.lastContact || new Date(c.lastContact).getTime() >= cutoff) return false;
        const wonDeals = ctx.deals.filter((d) => d.customerId === c.id && d.stage === "kazanildi");
        if (wonDeals.length === 0) return false;
        const debt = wonDeals.reduce((sum, d) => sum + (d.value || 0), 0);
        const paid = ctx.payments
          .filter((p) => wonDeals.some((d) => d.id === p.dealId))
          .reduce((sum, p) => sum + (p.amount || 0), 0);
        return debt - paid > 0;
      });
      if (risky.length === 0)
        return "90 günden uzun süredir iletişime geçmediğiniz, bakiyesi olan bir müşteriniz görünmüyor.";
      return `${risky.length} müşterinizle 90 günden uzun süredir iletişim yok ama hâlâ bekleyen bakiyeleri var - unutulmuş bir alacak riski oluşmadan bu müşterileri aramanızda fayda var.`;
    },
  },
  {
    id: "diagnosis_busiest_day_load",
    category: "Analiz",
    label: "Aynı günde çok fazla randevum/rezervasyonum birikiyor mu?",
    keywords: ["yoğun gün riski", "aynı gün çok fazla randevu", "program yoğunluğu"],
    compute: (ctx) => {
      if (!ctx.appointmentDateTimeKey) return "Randevu tarihi alanı henüz tanımlı değil.";
      const upcoming = ctx.deals.filter(
        (d) =>
          d.stage !== "kaybedildi" &&
          d.customFields?.[ctx.appointmentDateTimeKey] &&
          new Date(d.customFields[ctx.appointmentDateTimeKey]) >= new Date(),
      );
      if (upcoming.length < 5) return "Yeterli yaklaşan randevu verisi yok, bu analiz için erken.";
      const counts = {};
      upcoming.forEach((d) => {
        const day = d.customFields[ctx.appointmentDateTimeKey].slice(0, 10);
        counts[day] = (counts[day] || 0) + 1;
      });
      const top = topEntry(counts);
      if (!top || top[1] < 5) return "Şu an tek bir günde aşırı yoğunlaşma görünmüyor.";
      return `${new Date(top[0]).toLocaleDateString("tr-TR", { day: "numeric", month: "long" })} tarihinde ${top[1]} randevunuz birikmiş - o gün için ekstra hazırlık/personel planlamayı düşünün.`;
    },
  },
  {
    id: "diagnosis_seasonality",
    category: "Analiz",
    label: "Hangi ayda en çok satış/kayıt kazanıyorum?",
    keywords: ["mevsimsellik", "en yoğun ayım hangisi", "hangi ay daha çok satıyorum"],
    compute: (ctx) => {
      const won = ctx.deals.filter((d) => d.stage === "kazanildi" && d.closedAt);
      if (won.length < 12)
        return "Mevsimsel bir örüntü görmek için yeterli kazanılmış kaydınız yok.";
      const monthNames = [
        "Ocak",
        "Şubat",
        "Mart",
        "Nisan",
        "Mayıs",
        "Haziran",
        "Temmuz",
        "Ağustos",
        "Eylül",
        "Ekim",
        "Kasım",
        "Aralık",
      ];
      const counts = {};
      won.forEach((d) => {
        const m = new Date(d.closedAt).getMonth();
        counts[m] = (counts[m] || 0) + 1;
      });
      const top = topEntry(counts);
      return `En çok kazandığınız ay ${monthNames[Number(top[0])]} (tüm zamanlar, ${top[1]} kayıt) - bu döneme yaklaşırken stok/kapasite/pazarlama planınızı buna göre yapabilirsiniz.`;
    },
  },
  {
    id: "deals_won_value_all_time",
    category: "Satış",
    label: "Tüm zamanlar toplam ne kadar kazandım?",
    keywords: [
      "tüm zamanlar toplam kazanç",
      "toplam kazanılan değer",
      "şimdiye kadar ne kadar kazandım",
    ],
    compute: (ctx) => {
      const won = ctx.deals.filter((d) => d.stage === "kazanildi");
      if (won.length === 0) return "Henüz kazanılmış bir kaydınız yok.";
      const total = won.reduce((sum, d) => sum + (d.value || 0), 0);
      return `Tüm zamanlar toplam kazandığınız değer ${formatTL(total)} (${won.length} kayıt).`;
    },
  },
  {
    id: "deals_won_value_this_week",
    category: "Satış",
    label: "Bu hafta ne kadar kazandım?",
    keywords: ["bu hafta kazanç", "bu hafta ne kadar kazandım", "son 7 gün kazanç"],
    compute: (ctx) => {
      const now = new Date();
      const start = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000);
      start.setHours(0, 0, 0, 0);
      const won = ctx.deals.filter(
        (d) => d.stage === "kazanildi" && inRange(d.closedAt || d.createdAt, { start, end: now }),
      );
      const total = won.reduce((sum, d) => sum + (d.value || 0), 0);
      return `Son 7 günde ${formatTL(total)} kazandınız (${won.length} kayıt).`;
    },
  },
  {
    id: "deals_won_value_last_week",
    category: "Satış",
    label: "Geçen hafta ne kadar kazandım?",
    keywords: ["geçen hafta kazanç", "önceki hafta kazanç"],
    compute: (ctx) => {
      const now = new Date();
      const end = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      end.setHours(23, 59, 59, 999);
      const start = new Date(end.getTime() - 6 * 24 * 60 * 60 * 1000);
      start.setHours(0, 0, 0, 0);
      const won = ctx.deals.filter(
        (d) => d.stage === "kazanildi" && inRange(d.closedAt || d.createdAt, { start, end }),
      );
      const total = won.reduce((sum, d) => sum + (d.value || 0), 0);
      return `Geçen hafta ${formatTL(total)} kazandınız (${won.length} kayıt).`;
    },
  },
  {
    id: "top_customer_this_week",
    category: "Satış",
    label: "Bu hafta en çok kazandıran müşterim kim?",
    keywords: ["bu hafta en iyi müşteri", "bu hafta en çok gelir getiren müşteri"],
    compute: (ctx) => {
      const now = new Date();
      const start = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000);
      start.setHours(0, 0, 0, 0);
      const won = ctx.deals.filter(
        (d) => d.stage === "kazanildi" && inRange(d.closedAt || d.createdAt, { start, end: now }),
      );
      if (won.length === 0) return "Bu hafta henüz kazanılmış bir kaydınız yok.";
      const totals = {};
      won.forEach((d) => {
        totals[d.customerId] = (totals[d.customerId] || 0) + (d.value || 0);
      });
      const top = topEntry(totals);
      const customer = ctx.customers.find((c) => c.id === top[0]);
      return `${customer?.name || "Bilinmeyen müşteri"} - bu hafta ${formatTL(top[1])} ile en çok kazandıran müşteriniz.`;
    },
  },
  {
    id: "deals_lost_count_all_time",
    category: "Satış",
    label: "Tüm zamanlar kaç kayıt kaybettim?",
    keywords: ["toplam kayıp sayısı", "şimdiye kadar kaç kayıp"],
    compute: (ctx) =>
      `Tüm zamanlar ${ctx.deals.filter((d) => d.stage === "kaybedildi").length} kayıt kaybettiniz.`,
  },
  {
    id: "deals_lost_count_this_week",
    category: "Satış",
    label: "Bu hafta kaç kayıt kaybettim?",
    keywords: ["bu hafta kayıp sayısı", "bu hafta kaç kayıt kaybettim"],
    compute: (ctx) => {
      const now = new Date();
      const start = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000);
      start.setHours(0, 0, 0, 0);
      const count = ctx.deals.filter(
        (d) => d.stage === "kaybedildi" && inRange(d.closedAt || d.createdAt, { start, end: now }),
      ).length;
      return `Son 7 günde ${count} kayıt kaybettiniz.`;
    },
  },
  {
    id: "win_rate_this_week",
    category: "Satış",
    label: "Bu hafta kazanma oranım nedir?",
    keywords: ["bu hafta kazanma oranı", "bu hafta başarı oranı"],
    compute: (ctx) => {
      const now = new Date();
      const start = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000);
      start.setHours(0, 0, 0, 0);
      const closed = ctx.deals.filter(
        (d) =>
          (d.stage === "kazanildi" || d.stage === "kaybedildi") &&
          inRange(d.closedAt || d.createdAt, { start, end: now }),
      );
      if (closed.length === 0) return "Son 7 günde sonuçlanmış bir kaydınız yok.";
      const won = closed.filter((d) => d.stage === "kazanildi").length;
      return `Son 7 günde kazanma oranınız %${Math.round((won / closed.length) * 100)} (${won}/${closed.length}).`;
    },
  },
  {
    id: "new_customers_last_week",
    category: "Satış",
    label: "Geçen hafta kaç yeni müşteri kazandım?",
    keywords: ["geçen hafta yeni müşteri", "önceki hafta müşteri sayısı"],
    compute: (ctx) => {
      const now = new Date();
      const end = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      end.setHours(23, 59, 59, 999);
      const start = new Date(end.getTime() - 6 * 24 * 60 * 60 * 1000);
      start.setHours(0, 0, 0, 0);
      const count = ctx.customers.filter((c) => inRange(c.createdAt, { start, end })).length;
      return `Geçen hafta ${count} yeni müşteri kazandınız.`;
    },
  },
  {
    id: "avg_deal_value_this_quarter",
    category: "Satış",
    label: "Bu çeyrek ortalama kazanılan kayıt değeri ne kadar?",
    keywords: ["bu çeyrek ortalama değer", "çeyreklik ortalama kazanç"],
    compute: (ctx) => {
      const bounds = getRangeBounds("bu_ceyrek");
      const won = ctx.deals.filter(
        (d) => d.stage === "kazanildi" && inRange(d.closedAt || d.createdAt, bounds),
      );
      if (won.length === 0) return "Bu çeyrek henüz kazanılmış bir kaydınız yok.";
      const avg = won.reduce((sum, d) => sum + (d.value || 0), 0) / won.length;
      return `Bu çeyrek ortalama kazanılan kayıt değeriniz ${formatTL(avg)}.`;
    },
  },
  {
    id: "avg_deal_value_this_week",
    category: "Satış",
    label: "Bu hafta ortalama kazanılan kayıt değeri ne kadar?",
    keywords: ["bu hafta ortalama değer", "haftalık ortalama kazanç"],
    compute: (ctx) => {
      const now = new Date();
      const start = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000);
      start.setHours(0, 0, 0, 0);
      const won = ctx.deals.filter(
        (d) => d.stage === "kazanildi" && inRange(d.closedAt || d.createdAt, { start, end: now }),
      );
      if (won.length === 0) return "Bu hafta henüz kazanılmış bir kaydınız yok.";
      const avg = won.reduce((sum, d) => sum + (d.value || 0), 0) / won.length;
      return `Bu hafta ortalama kazanılan kayıt değeriniz ${formatTL(avg)}.`;
    },
  },
  {
    id: "stalled_deals_60_days",
    category: "Satış",
    label: "60 günden uzun süredir açık kaç kaydım var?",
    keywords: ["60 gün açık kayıt", "uzun süredir açık"],
    compute: (ctx) => {
      const cutoff = Date.now() - 60 * 24 * 60 * 60 * 1000;
      const count = ctx.deals.filter(
        (d) =>
          d.stage !== "kazanildi" &&
          d.stage !== "kaybedildi" &&
          new Date(d.createdAt).getTime() < cutoff,
      ).length;
      return `${count} kaydınız 60 günden uzun süredir açık.`;
    },
  },
  {
    id: "lost_reason_this_week",
    category: "Satış",
    label: "Bu hafta en çok hangi nedenle kaybettim?",
    keywords: ["bu hafta kayıp nedeni", "bu hafta en çok neden kaybettim"],
    compute: (ctx) => {
      const now = new Date();
      const start = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000);
      start.setHours(0, 0, 0, 0);
      const lost = ctx.deals.filter(
        (d) =>
          d.stage === "kaybedildi" &&
          d.lostReason &&
          inRange(d.closedAt || d.createdAt, { start, end: now }),
      );
      if (lost.length === 0) return "Bu hafta nedeni belirtilmiş bir kaybınız yok.";
      const totals = {};
      lost.forEach((d) => {
        totals[d.lostReason] = (totals[d.lostReason] || 0) + 1;
      });
      const top = topEntry(totals);
      return `Bu hafta en çok "${top[0]}" nedeniyle kaybettiniz (${top[1]} kayıt).`;
    },
  },
  {
    id: "total_deals_count_all_stages",
    category: "Satış",
    label: "Toplam kaç kaydım var (tüm aşamalar dahil)?",
    keywords: ["toplam kayıt sayısı", "kaç kaydım var genel"],
    compute: (ctx) => `Tüm aşamalar dahil toplam ${ctx.deals.length} kaydınız var.`,
  },
  {
    id: "deals_created_last_quarter",
    category: "Satış",
    label: "Geçen çeyrek kaç yeni kayıt oluşturdum?",
    keywords: ["geçen çeyrek yeni kayıt", "önceki çeyrek yeni kayıt sayısı"],
    compute: (ctx) => {
      const now = new Date();
      const currentQStart = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
      const lastQEnd = new Date(currentQStart.getTime() - 1);
      const lastQStart = new Date(
        lastQEnd.getFullYear(),
        Math.floor(lastQEnd.getMonth() / 3) * 3,
        1,
      );
      const count = ctx.deals.filter((d) =>
        inRange(d.createdAt, { start: lastQStart, end: lastQEnd }),
      ).length;
      return `Geçen çeyrek ${count} yeni kayıt oluşturdunuz.`;
    },
  },
  {
    id: "deals_created_last_year",
    category: "Satış",
    label: "Geçen yıl kaç yeni kayıt oluşturdum?",
    keywords: ["geçen yıl yeni kayıt", "önceki yıl yeni kayıt sayısı"],
    compute: (ctx) => {
      const now = new Date();
      const start = new Date(now.getFullYear() - 1, 0, 1);
      const end = new Date(now.getFullYear() - 1, 11, 31, 23, 59, 59, 999);
      const count = ctx.deals.filter((d) => inRange(d.createdAt, { start, end })).length;
      return `Geçen yıl ${count} yeni kayıt oluşturdunuz.`;
    },
  },
  {
    id: "collection_last_week",
    category: "Finans",
    label: "Geçen hafta ne kadar tahsilat aldım?",
    keywords: ["geçen hafta tahsilat", "önceki hafta ödeme"],
    compute: (ctx) => {
      const now = new Date();
      const end = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      end.setHours(23, 59, 59, 999);
      const start = new Date(end.getTime() - 6 * 24 * 60 * 60 * 1000);
      start.setHours(0, 0, 0, 0);
      const total = ctx.payments
        .filter((p) => inRange(p.paidAt, { start, end }))
        .reduce((sum, p) => sum + (p.amount || 0), 0);
      return `Geçen hafta ${formatTL(total)} tahsilat aldınız.`;
    },
  },
  {
    id: "net_profit_quarter_trend",
    category: "Finans",
    label: "Bu çeyrek net kârım geçen çeyreğe göre nasıl değişti?",
    keywords: ["çeyreklik net kâr trendi", "net kârım değişti mi"],
    compute: (ctx) => {
      const now = new Date();
      const thisQStart = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
      const thisBounds = { start: thisQStart, end: now };
      const lastQEnd = new Date(thisQStart.getTime() - 1);
      const lastQStart = new Date(
        lastQEnd.getFullYear(),
        Math.floor(lastQEnd.getMonth() / 3) * 3,
        1,
      );
      const lastBounds = { start: lastQStart, end: lastQEnd };
      const netOf = (bounds) => {
        const income = ctx.payments
          .filter((p) => inRange(p.paidAt, bounds))
          .reduce((sum, p) => sum + (p.amount || 0), 0);
        const expense = ctx.companyExpenses
          .flatMap((e) => expandExpenseOccurrences(e, bounds))
          .reduce((sum, e) => sum + (e.amount || 0), 0);
        return income - expense;
      };
      const thisNet = netOf(thisBounds);
      const lastNet = netOf(lastBounds);
      return `Bu çeyrek (şimdiye kadar) net kalanınız ${formatTL(thisNet)}, geçen çeyrek ${formatTL(lastNet)} idi.`;
    },
  },
  {
    id: "payment_count_this_year",
    category: "Finans",
    label: "Bu yıl kaç tahsilat işlemi yaptım?",
    keywords: ["bu yıl tahsilat sayısı", "bu yıl kaç ödeme aldım"],
    compute: (ctx) => {
      const bounds = getRangeBounds("bu_yil");
      const count = ctx.payments.filter(
        (p) => (p.amount || 0) > 0 && !p.refundOfPaymentId && inRange(p.paidAt, bounds),
      ).length;
      return `Bu yıl ${count} tahsilat işlemi yaptınız.`;
    },
  },
  {
    id: "payment_count_this_quarter",
    category: "Finans",
    label: "Bu çeyrek kaç tahsilat işlemi yaptım?",
    keywords: ["bu çeyrek tahsilat sayısı", "bu çeyrek kaç ödeme aldım"],
    compute: (ctx) => {
      const bounds = getRangeBounds("bu_ceyrek");
      const count = ctx.payments.filter(
        (p) => (p.amount || 0) > 0 && !p.refundOfPaymentId && inRange(p.paidAt, bounds),
      ).length;
      return `Bu çeyrek ${count} tahsilat işlemi yaptınız.`;
    },
  },
  {
    id: "avg_expense_record_amount",
    category: "Finans",
    label: "Ortalama tek gider kaydımın tutarı ne kadar?",
    keywords: ["ortalama gider kaydı", "gider kaydı başına tutar"],
    compute: (ctx) => {
      if (ctx.companyExpenses.length === 0) return "Henüz bir gider kaydınız yok.";
      const avg =
        ctx.companyExpenses.reduce((sum, e) => sum + (e.amount || 0), 0) /
        ctx.companyExpenses.length;
      return `Ortalama gider kaydınızın tutarı ${formatTL(avg)} (${ctx.companyExpenses.length} kayıt üzerinden).`;
    },
  },
  {
    id: "expense_category_count_month",
    category: "Finans",
    label: "Bu ay kaç farklı gider kategorisi kullanmışım?",
    keywords: ["bu ay gider kategorisi sayısı", "kaç farklı kategori gider"],
    compute: (ctx) => {
      const bounds = getRangeBounds("bu_ay");
      const categories = new Set(
        ctx.companyExpenses
          .flatMap((e) => expandExpenseOccurrences(e, bounds))
          .map((e) => e.category),
      );
      if (categories.size === 0) return "Bu ay henüz kayıtlı bir gideriniz yok.";
      return `Bu ay ${categories.size} farklı gider kategorisi kullanmışsınız.`;
    },
  },
  {
    id: "expenses_missing_kdv_rate",
    category: "Finans",
    label: "KDV oranı girilmemiş kaç giderim var?",
    keywords: ["kdv oranı eksik gider", "kdv girilmemiş gider sayısı"],
    compute: (ctx) => {
      const missing = ctx.companyExpenses.filter((e) => e.kdvRate == null).length;
      if (missing === 0) return "Tüm gider kayıtlarınızda KDV oranı girilmiş.";
      return `${missing} gider kaydınızda KDV oranı girilmemiş - KDV Özet Raporu'nun doğru hesaplanması için bunları tamamlamanız önerilir.`;
    },
  },
  {
    id: "busiest_payment_day_month",
    category: "Finans",
    label: "Bu ay en çok tahsilat aldığım gün hangisi?",
    keywords: ["en çok tahsilat aldığım gün", "yoğun tahsilat günü"],
    compute: (ctx) => {
      const bounds = getRangeBounds("bu_ay");
      const payments = ctx.payments.filter(
        (p) => (p.amount || 0) > 0 && !p.refundOfPaymentId && inRange(p.paidAt, bounds),
      );
      if (payments.length === 0) return "Bu ay henüz bir tahsilatınız yok.";
      const totals = {};
      payments.forEach((p) => {
        const day = (p.paidAt || "").slice(0, 10);
        totals[day] = (totals[day] || 0) + (p.amount || 0);
      });
      const top = topEntry(totals);
      return `Bu ay en çok tahsilatı ${new Date(top[0]).toLocaleDateString("tr-TR", { day: "numeric", month: "long" })} tarihinde aldınız (${formatTL(top[1])}).`;
    },
  },
  {
    id: "refund_amount_this_month",
    category: "Finans",
    label: "Bu ay ne kadar iade yaptım?",
    keywords: ["bu ay iade tutarı", "bu ayki iadeler"],
    compute: (ctx) => {
      const bounds = getRangeBounds("bu_ay");
      const refunds = ctx.payments.filter((p) => (p.amount || 0) < 0 && inRange(p.paidAt, bounds));
      if (refunds.length === 0) return "Bu ay bir iade yapmadınız.";
      const total = refunds.reduce((sum, p) => sum + Math.abs(p.amount || 0), 0);
      return `Bu ay ${formatTL(total)} iade yaptınız (${refunds.length} işlem).`;
    },
  },
  {
    id: "refund_rate_this_month",
    category: "Finans",
    label: "Bu ay iade oranım nedir?",
    keywords: ["bu ay iade oranı", "bu ayki iade yüzdesi"],
    compute: (ctx) => {
      const bounds = getRangeBounds("bu_ay");
      const positive = ctx.payments.filter(
        (p) => (p.amount || 0) > 0 && !p.refundOfPaymentId && inRange(p.paidAt, bounds),
      ).length;
      const refunds = ctx.payments.filter(
        (p) => p.refundOfPaymentId && inRange(p.paidAt, bounds),
      ).length;
      if (positive === 0) return "Bu ay henüz bir tahsilatınız yok.";
      return `Bu ay tahsilatlarınızın %${Math.round((refunds / positive) * 100)}'i iade edilmiş (${refunds}/${positive}).`;
    },
  },
  {
    id: "commission_expense_this_month",
    category: "Finans",
    label: "Ödeme sağlayıcı komisyonu olarak bu ay ne kadar ödedim?",
    keywords: ["bu ay komisyon gideri", "iyzico paytr komisyonu bu ay"],
    compute: (ctx) => {
      const bounds = getRangeBounds("bu_ay");
      const commission = ctx.companyExpenses
        .filter((e) => e.category === "Ödeme Komisyonu")
        .flatMap((e) => expandExpenseOccurrences(e, bounds))
        .reduce((sum, e) => sum + (e.amount || 0), 0);
      if (commission === 0)
        return "Bu ay ödeme sağlayıcı komisyonu görünmüyor - online tahsilat yapmadıysanız normaldir.";
      return `Bu ay ödeme sağlayıcı komisyonu olarak ${formatTL(commission)} ödediniz.`;
    },
  },
  {
    id: "commission_expense_all_time",
    category: "Finans",
    label: "Ödeme sağlayıcı komisyonu olarak tüm zamanlar ne kadar ödedim?",
    keywords: ["tüm zamanlar komisyon gideri", "toplam iyzico paytr komisyonu"],
    compute: (ctx) => {
      const commission = ctx.companyExpenses
        .filter((e) => e.category === "Ödeme Komisyonu")
        .reduce((sum, e) => sum + (e.amount || 0), 0);
      if (commission === 0) return "Şu ana kadar ödeme sağlayıcı komisyonu görünmüyor.";
      return `Tüm zamanlar ödeme sağlayıcı komisyonu olarak ${formatTL(commission)} ödediniz - bu, gelir-gider defterinize otomatik işleniyor.`;
    },
  },
  {
    id: "net_profit_last_month",
    category: "Finans",
    label: "Geçen ay net kârım ne kadar?",
    keywords: ["geçen ay net kâr", "önceki ay kârım"],
    compute: (ctx) => {
      const now = new Date();
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
      const bounds = { start, end };
      const income = ctx.payments
        .filter((p) => inRange(p.paidAt, bounds))
        .reduce((sum, p) => sum + (p.amount || 0), 0);
      const expense = ctx.companyExpenses
        .flatMap((e) => expandExpenseOccurrences(e, bounds))
        .reduce((sum, e) => sum + (e.amount || 0), 0);
      const dealCost = ctx.deals
        .filter(
          (d) =>
            d.stage === "kazanildi" &&
            (d.cost || 0) > 0 &&
            inRange(d.closedAt || d.createdAt, bounds),
        )
        .reduce((sum, d) => sum + (d.cost || 0), 0);
      return `Geçen ay net kalanınız ${formatTL(income - expense - dealCost)} (${formatTL(income)} gelir − ${formatTL(expense + dealCost)} gider).`;
    },
  },
  {
    id: "total_expense_last_quarter",
    category: "Finans",
    label: "Geçen çeyrek toplam giderim ne kadar?",
    keywords: ["geçen çeyrek gider", "önceki çeyrek toplam gider"],
    compute: (ctx) => {
      const now = new Date();
      const currentQStart = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
      const lastQEnd = new Date(currentQStart.getTime() - 1);
      const lastQStart = new Date(
        lastQEnd.getFullYear(),
        Math.floor(lastQEnd.getMonth() / 3) * 3,
        1,
      );
      const bounds = { start: lastQStart, end: lastQEnd };
      const total = ctx.companyExpenses
        .flatMap((e) => expandExpenseOccurrences(e, bounds))
        .reduce((sum, e) => sum + (e.amount || 0), 0);
      return `Geçen çeyrek toplam gideriniz ${formatTL(total)}.`;
    },
  },
  {
    id: "total_expense_this_week",
    category: "Finans",
    label: "Bu hafta ne kadar gider yaptım?",
    keywords: ["bu hafta gider", "haftalık gider toplamı"],
    compute: (ctx) => {
      const now = new Date();
      const start = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000);
      start.setHours(0, 0, 0, 0);
      const total = ctx.companyExpenses
        .flatMap((e) => expandExpenseOccurrences(e, { start, end: now }))
        .reduce((sum, e) => sum + (e.amount || 0), 0);
      return `Son 7 günde ${formatTL(total)} gider yaptınız.`;
    },
  },
  {
    id: "new_customers_last_quarter",
    category: "Müşteri",
    label: "Geçen çeyrek kaç yeni müşteri kazandım?",
    keywords: ["geçen çeyrek yeni müşteri", "önceki çeyrek müşteri sayısı"],
    compute: (ctx) => {
      const now = new Date();
      const currentQStart = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
      const lastQEnd = new Date(currentQStart.getTime() - 1);
      const lastQStart = new Date(
        lastQEnd.getFullYear(),
        Math.floor(lastQEnd.getMonth() / 3) * 3,
        1,
      );
      const count = ctx.customers.filter((c) =>
        inRange(c.createdAt, { start: lastQStart, end: lastQEnd }),
      ).length;
      return `Geçen çeyrek ${count} yeni müşteri kazandınız.`;
    },
  },
  {
    id: "new_customers_last_year",
    category: "Müşteri",
    label: "Geçen yıl kaç yeni müşteri kazandım?",
    keywords: ["geçen yıl yeni müşteri", "önceki yıl müşteri sayısı"],
    compute: (ctx) => {
      const now = new Date();
      const start = new Date(now.getFullYear() - 1, 0, 1);
      const end = new Date(now.getFullYear() - 1, 11, 31, 23, 59, 59, 999);
      const count = ctx.customers.filter((c) => inRange(c.createdAt, { start, end })).length;
      return `Geçen yıl ${count} yeni müşteri kazandınız.`;
    },
  },
  {
    id: "new_customers_last_30_days",
    category: "Müşteri",
    label: "Son 30 günde kaç yeni müşteri kazandım?",
    keywords: ["son 30 gün yeni müşteri", "son bir ayda kaç müşteri"],
    compute: (ctx) => {
      const now = new Date();
      const start = new Date(now.getTime() - 29 * 24 * 60 * 60 * 1000);
      start.setHours(0, 0, 0, 0);
      const count = ctx.customers.filter((c) => inRange(c.createdAt, { start, end: now })).length;
      return `Son 30 günde ${count} yeni müşteri kazandınız.`;
    },
  },
  {
    id: "inactive_customers_90_days",
    category: "Müşteri",
    label: "90 gündür işlem yapmayan kaç müşterim var?",
    keywords: ["90 gün işlem yapmayan müşteri", "3 aydır alışverişi olmayan müşteri"],
    compute: (ctx) => {
      const won = ctx.deals.filter((d) => d.stage === "kazanildi");
      const everWonCustomerIds = new Set(won.map((d) => d.customerId));
      if (everWonCustomerIds.size === 0) return "Henüz kazanılmış bir kaydınız yok.";
      const cutoff = Date.now() - 90 * 24 * 60 * 60 * 1000;
      const recentCustomerIds = new Set(
        won
          .filter((d) => new Date(d.closedAt || d.createdAt).getTime() >= cutoff)
          .map((d) => d.customerId),
      );
      const inactiveCount = [...everWonCustomerIds].filter(
        (id) => !recentCustomerIds.has(id),
      ).length;
      return `${inactiveCount} müşteriniz 90 gündür (yaklaşık 3 ay) işlem yapmıyor.`;
    },
  },
  {
    id: "inactive_customers_365_days",
    category: "Müşteri",
    label: "365 gündür işlem yapmayan kaç müşterim var?",
    keywords: ["365 gün işlem yapmayan müşteri", "1 yıldır alışverişi olmayan müşteri"],
    compute: (ctx) => {
      const won = ctx.deals.filter((d) => d.stage === "kazanildi");
      const everWonCustomerIds = new Set(won.map((d) => d.customerId));
      if (everWonCustomerIds.size === 0) return "Henüz kazanılmış bir kaydınız yok.";
      const cutoff = Date.now() - 365 * 24 * 60 * 60 * 1000;
      const recentCustomerIds = new Set(
        won
          .filter((d) => new Date(d.closedAt || d.createdAt).getTime() >= cutoff)
          .map((d) => d.customerId),
      );
      const inactiveCount = [...everWonCustomerIds].filter(
        (id) => !recentCustomerIds.has(id),
      ).length;
      return `${inactiveCount} müşteriniz 365 gündür (yaklaşık 1 yıl) işlem yapmıyor.`;
    },
  },
  {
    id: "contacted_customers_this_month",
    category: "Müşteri",
    label: "Bu ay kaç müşteriyle temas ettim?",
    keywords: ["bu ay temas ettiğim müşteri", "bu ay iletişime geçtiğim müşteri sayısı"],
    compute: (ctx) => {
      const bounds = getRangeBounds("bu_ay");
      const count = ctx.customers.filter(
        (c) => c.lastContact && inRange(c.lastContact, bounds),
      ).length;
      return `Bu ay ${count} müşteriyle temas ettiniz.`;
    },
  },
  {
    id: "contacted_customers_this_quarter",
    category: "Müşteri",
    label: "Bu çeyrek kaç müşteriyle temas ettim?",
    keywords: ["bu çeyrek temas ettiğim müşteri", "bu çeyrek iletişime geçtiğim müşteri sayısı"],
    compute: (ctx) => {
      const bounds = getRangeBounds("bu_ceyrek");
      const count = ctx.customers.filter(
        (c) => c.lastContact && inRange(c.lastContact, bounds),
      ).length;
      return `Bu çeyrek ${count} müşteriyle temas ettiniz.`;
    },
  },
  {
    id: "contacted_customers_this_year",
    category: "Müşteri",
    label: "Bu yıl kaç müşteriyle temas ettim?",
    keywords: ["bu yıl temas ettiğim müşteri", "bu yıl iletişime geçtiğim müşteri sayısı"],
    compute: (ctx) => {
      const bounds = getRangeBounds("bu_yil");
      const count = ctx.customers.filter(
        (c) => c.lastContact && inRange(c.lastContact, bounds),
      ).length;
      return `Bu yıl ${count} müşteriyle temas ettiniz.`;
    },
  },
  {
    id: "duplicate_phone_customers",
    category: "Müşteri",
    label: "Aynı telefon numarasına sahip birden fazla müşterim var mı?",
    keywords: ["mükerrer telefon numarası", "aynı telefon farklı müşteri", "telefon çakışması"],
    compute: (ctx) => {
      const byPhone = {};
      ctx.customers
        .filter((c) => c.phone)
        .forEach((c) => {
          byPhone[c.phone] = (byPhone[c.phone] || 0) + 1;
        });
      const duplicateGroups = Object.values(byPhone).filter((n) => n >= 2).length;
      if (duplicateGroups === 0)
        return "Aynı telefon numarasını paylaşan birden fazla müşteri kaydınız görünmüyor.";
      return `${duplicateGroups} farklı telefon numarası birden fazla müşteri kaydında kullanılmış - mükerrer kayıt olup olmadığını kontrol etmenizde fayda var.`;
    },
  },
  {
    id: "duplicate_email_customers",
    category: "Müşteri",
    label: "Aynı e-postaya sahip birden fazla müşterim var mı?",
    keywords: ["mükerrer e-posta", "aynı e-posta farklı müşteri", "e-posta çakışması"],
    compute: (ctx) => {
      const byEmail = {};
      ctx.customers
        .filter((c) => c.email)
        .forEach((c) => {
          byEmail[c.email] = (byEmail[c.email] || 0) + 1;
        });
      const duplicateGroups = Object.values(byEmail).filter((n) => n >= 2).length;
      if (duplicateGroups === 0)
        return "Aynı e-postayı paylaşan birden fazla müşteri kaydınız görünmüyor.";
      return `${duplicateGroups} farklı e-posta adresi birden fazla müşteri kaydında kullanılmış - mükerrer kayıt olup olmadığını kontrol etmenizde fayda var.`;
    },
  },
  {
    id: "best_customer_acquisition_month_all_time",
    category: "Müşteri",
    label: "En çok müşteri kazandığım ay hangisi (tüm zamanlar)?",
    keywords: ["en çok müşteri kazandığım ay", "müşteri kazanımında mevsimsellik"],
    compute: (ctx) => {
      if (ctx.customers.length < 12)
        return "Mevsimsel bir örüntü görmek için yeterli müşteri verisi yok.";
      const monthNames = [
        "Ocak",
        "Şubat",
        "Mart",
        "Nisan",
        "Mayıs",
        "Haziran",
        "Temmuz",
        "Ağustos",
        "Eylül",
        "Ekim",
        "Kasım",
        "Aralık",
      ];
      const counts = {};
      ctx.customers.forEach((c) => {
        const m = new Date(c.createdAt).getMonth();
        counts[m] = (counts[m] || 0) + 1;
      });
      const top = topEntry(counts);
      return `En çok müşteri kazandığınız ay ${monthNames[Number(top[0])]} (tüm zamanlar, ${top[1]} müşteri).`;
    },
  },
  {
    id: "best_customer_acquisition_month_this_year",
    category: "Müşteri",
    label: "Bu yıl en çok müşteri kazandığım ay hangisiydi?",
    keywords: ["bu yıl en çok müşteri kazandığım ay"],
    compute: (ctx) => {
      const bounds = getRangeBounds("bu_yil");
      const thisYear = ctx.customers.filter((c) => inRange(c.createdAt, bounds));
      if (thisYear.length < 3) return "Bu yıl yeterli müşteri verisi yok.";
      const monthNames = [
        "Ocak",
        "Şubat",
        "Mart",
        "Nisan",
        "Mayıs",
        "Haziran",
        "Temmuz",
        "Ağustos",
        "Eylül",
        "Ekim",
        "Kasım",
        "Aralık",
      ];
      const counts = {};
      thisYear.forEach((c) => {
        const m = new Date(c.createdAt).getMonth();
        counts[m] = (counts[m] || 0) + 1;
      });
      const top = topEntry(counts);
      return `Bu yıl en çok müşteri kazandığınız ay ${monthNames[Number(top[0])]} (${top[1]} müşteri).`;
    },
  },
  {
    id: "customers_missing_address",
    category: "Müşteri",
    label: "Adresi girilmemiş kaç müşterim var?",
    keywords: ["adres eksik müşteri", "adresi olmayan müşteri sayısı"],
    compute: (ctx) =>
      `${ctx.customers.filter((c) => !c.address).length} müşterinizin adresi girilmemiş.`,
  },
  {
    id: "customers_single_word_name",
    category: "Müşteri",
    label: "Adı tek kelime (soyadsız) girilmiş kaç müşterim var?",
    keywords: ["soyadsız müşteri", "tek kelime isim", "eksik isim girişi"],
    compute: (ctx) => {
      const count = ctx.customers.filter((c) => !isFullNameValid(c.name)).length;
      if (count === 0) return "Tüm müşterilerinizin adı en az iki kelimeden oluşuyor.";
      return `${count} müşterinizin adı tek kelime - gerçek ad/soyad ya da firma adı olup olmadığını kontrol etmenizde fayda var.`;
    },
  },
  {
    id: "customers_no_custom_fields_filled",
    category: "Müşteri",
    label: "Kaç müşterimde hiç özel alan (custom field) doldurulmamış?",
    keywords: ["boş özel alan müşteri", "doldurulmamış özel alan sayısı"],
    compute: (ctx) => {
      const count = ctx.customers.filter(
        (c) => Object.keys(c.customFields || {}).length === 0,
      ).length;
      return `${count} müşterinizde hiç özel alan doldurulmamış.`;
    },
  },
  {
    id: "tickets_this_quarter_count",
    category: "Destek",
    label: "Bu çeyrek kaç destek talebi geldi?",
    keywords: ["bu çeyrek talep sayısı", "bu çeyrekte gelen talepler"],
    compute: (ctx) => {
      const bounds = getRangeBounds("bu_ceyrek");
      return `Bu çeyrek ${ctx.tickets.filter((t) => inRange(t.createdAt, bounds)).length} destek talebi geldi.`;
    },
  },
  {
    id: "tickets_this_year_count",
    category: "Destek",
    label: "Bu yıl kaç destek talebi geldi?",
    keywords: ["bu yıl talep sayısı", "bu yılki gelen talepler"],
    compute: (ctx) => {
      const bounds = getRangeBounds("bu_yil");
      return `Bu yıl ${ctx.tickets.filter((t) => inRange(t.createdAt, bounds)).length} destek talebi geldi.`;
    },
  },
  {
    id: "tickets_resolved_this_quarter",
    category: "Destek",
    label: "Bu çeyrek kaç talep çözdüm?",
    keywords: ["bu çeyrek çözülen talep", "bu çeyrekte kapanan talepler"],
    compute: (ctx) => {
      const bounds = getRangeBounds("bu_ceyrek");
      const count = ctx.tickets.filter((t) => t.resolvedAt && inRange(t.resolvedAt, bounds)).length;
      return `Bu çeyrek ${count} talep çözdünüz.`;
    },
  },
  {
    id: "tickets_resolved_this_year",
    category: "Destek",
    label: "Bu yıl kaç talep çözdüm?",
    keywords: ["bu yıl çözülen talep", "bu yılki kapanan talepler"],
    compute: (ctx) => {
      const bounds = getRangeBounds("bu_yil");
      const count = ctx.tickets.filter((t) => t.resolvedAt && inRange(t.resolvedAt, bounds)).length;
      return `Bu yıl ${count} talep çözdünüz.`;
    },
  },
  {
    id: "open_tickets_high_priority",
    category: "Destek",
    label: "Yüksek öncelikli kaç açık talebim var?",
    keywords: ["yüksek öncelik açık talep", "yüksek öncelikli talep sayısı"],
    compute: (ctx) => {
      const count = ctx.tickets.filter(
        (t) => t.priority === "yuksek" && !TERMINAL_STATUSES.includes(t.status),
      ).length;
      return `${count} yüksek öncelikli açık talebiniz var.`;
    },
  },
  {
    id: "open_tickets_medium_priority",
    category: "Destek",
    label: "Orta öncelikli kaç açık talebim var?",
    keywords: ["orta öncelik açık talep", "orta öncelikli talep sayısı"],
    compute: (ctx) => {
      const count = ctx.tickets.filter(
        (t) => t.priority === "orta" && !TERMINAL_STATUSES.includes(t.status),
      ).length;
      return `${count} orta öncelikli açık talebiniz var.`;
    },
  },
  {
    id: "high_priority_resolution_time",
    category: "Destek",
    label: "Yüksek öncelik çözme süresi ortalama ne kadar?",
    keywords: [
      "yüksek öncelik çözüm süresi",
      "yüksek öncelikli talepleri ne kadar sürede çözüyorum",
    ],
    compute: (ctx) => {
      const resolved = ctx.tickets.filter((t) => t.priority === "yuksek" && t.resolvedAt);
      if (resolved.length === 0) return "Henüz çözülmüş yüksek öncelikli bir talebiniz yok.";
      const avgDays =
        resolved.reduce(
          (sum, t) =>
            sum + (new Date(t.resolvedAt) - new Date(t.createdAt)) / (1000 * 60 * 60 * 24),
          0,
        ) / resolved.length;
      return `Yüksek öncelikli talepleri ortalama ${avgDays.toFixed(1)} günde çözüyorsunuz.`;
    },
  },
  {
    id: "tickets_closed_status_count",
    category: "Destek",
    label: "Kapatıldı durumunda kaç talebim var?",
    keywords: ["kapatıldı durumu talep sayısı", "kapatılan talep sayısı"],
    compute: (ctx) =>
      `${ctx.tickets.filter((t) => t.status === "kapatildi").length} talebiniz "Kapatıldı" durumunda - bu, "Çözüldü"den farklı, tamamen sonlandırılmış talepleri sayar.`,
  },
  {
    id: "tickets_today_count",
    category: "Destek",
    label: "Bugün kaç destek talebi geldi?",
    keywords: ["bugün gelen talep", "bugünkü destek talebi sayısı"],
    compute: (ctx) => {
      const todayStr = new Date().toISOString().slice(0, 10);
      const count = ctx.tickets.filter((t) => (t.createdAt || "").slice(0, 10) === todayStr).length;
      return `Bugün ${count} destek talebi geldi.`;
    },
  },
  {
    id: "tickets_resolved_today",
    category: "Destek",
    label: "Bugün kaç talep çözdüm?",
    keywords: ["bugün çözülen talep", "bugün kapattığım talep sayısı"],
    compute: (ctx) => {
      const todayStr = new Date().toISOString().slice(0, 10);
      const count = ctx.tickets.filter(
        (t) => t.resolvedAt && t.resolvedAt.slice(0, 10) === todayStr,
      ).length;
      return `Bugün ${count} talep çözdünüz.`;
    },
  },
  {
    id: "tickets_last_30_days_count",
    category: "Destek",
    label: "Son 30 günde kaç destek talebi geldi?",
    keywords: ["son 30 gün talep sayısı", "son bir ayda gelen talepler"],
    compute: (ctx) => {
      const now = new Date();
      const start = new Date(now.getTime() - 29 * 24 * 60 * 60 * 1000);
      start.setHours(0, 0, 0, 0);
      const count = ctx.tickets.filter((t) => inRange(t.createdAt, { start, end: now })).length;
      return `Son 30 günde ${count} destek talebi geldi.`;
    },
  },
  {
    id: "tickets_never_replied",
    category: "Destek",
    label: "Hiç yanıtlanmamış (mesajsız) kaç talebim var?",
    keywords: ["yanıtsız talep", "hiç mesaj yazılmamış talep", "boş talep sayısı"],
    compute: (ctx) => {
      const ticketIdsWithMessages = new Set(ctx.ticketMessages.map((m) => m.ticketId));
      const openTickets = ctx.tickets.filter((t) => !TERMINAL_STATUSES.includes(t.status));
      const neverReplied = openTickets.filter((t) => !ticketIdsWithMessages.has(t.id)).length;
      if (neverReplied === 0) return "Açık taleplerinizin hepsinde en az bir mesaj var.";
      return `${neverReplied} açık talebinizde hiç mesaj yok (açıklama dahil) - bu talepleri gözden kaçırmış olabilirsiniz.`;
    },
  },
  {
    id: "avg_messages_per_ticket",
    category: "Destek",
    label: "Ortalama bir talepte kaç mesaj yazışması oluyor?",
    keywords: ["talep başına mesaj sayısı", "ortalama yazışma sayısı"],
    compute: (ctx) => {
      if (ctx.tickets.length === 0) return "Henüz bir destek talebiniz yok.";
      const avg = ctx.ticketMessages.length / ctx.tickets.length;
      return `Talep başına ortalama ${avg.toFixed(1)} mesaj yazışması oluyor.`;
    },
  },
  {
    id: "kb_avg_article_length",
    category: "Destek",
    label: "Bilgi Bankası makalelerimin ortalama uzunluğu ne kadar?",
    keywords: ["makale uzunluğu", "ortalama makale karakter sayısı"],
    compute: (ctx) => {
      if (ctx.kbArticles.length === 0) return "Henüz bir Bilgi Bankası makaleniz yok.";
      const avgLength = Math.round(
        ctx.kbArticles.reduce((sum, a) => sum + (a.content?.length || 0), 0) /
          ctx.kbArticles.length,
      );
      return `Bilgi Bankası makaleleriniz ortalama ${avgLength} karakter uzunluğunda.`;
    },
  },
  {
    id: "fastest_resolved_ticket",
    category: "Destek",
    label: "En kısa sürede çözdüğüm talebim hangisi?",
    keywords: ["en hızlı çözülen talep", "en kısa çözüm süresi"],
    compute: (ctx) => {
      const resolved = ctx.tickets.filter((t) => t.resolvedAt);
      if (resolved.length === 0) return "Henüz çözülmüş bir talebiniz yok.";
      const withDuration = resolved.map((t) => ({
        ...t,
        durationHours: (new Date(t.resolvedAt) - new Date(t.createdAt)) / (1000 * 60 * 60),
      }));
      const fastest = withDuration.sort((a, b) => a.durationHours - b.durationHours)[0];
      const hours = Math.round(fastest.durationHours);
      return `En hızlı çözdüğünüz talep "${fastest.subject}" - yaklaşık ${hours < 1 ? "1 saatten kısa" : `${hours} saat`} sürdü.`;
    },
  },
  {
    id: "revenue_per_member_quarter",
    category: "Takım",
    label: "Bu çeyrek üye başına ne kadar ciro var?",
    keywords: ["üye başına bu çeyrek ciro", "kişi başına bu çeyrekki gelir"],
    compute: (ctx) => {
      if (ctx.teamMembers.length === 0) return "Henüz takım üyeniz yok.";
      const bounds = getRangeBounds("bu_ceyrek");
      const won = ctx.deals.filter(
        (d) =>
          d.stage === "kazanildi" && d.assignedTo && inRange(d.closedAt || d.createdAt, bounds),
      );
      if (won.length === 0) return "Bu çeyrek henüz sorumlu atanmış, kazanılmış bir kaydınız yok.";
      const totals = {};
      won.forEach((d) => {
        totals[d.assignedTo] = (totals[d.assignedTo] || 0) + (d.value || 0);
      });
      return Object.entries(totals)
        .map(([id, total]) => {
          const name =
            id === ctx.currentUserId
              ? "Siz"
              : ctx.teamMembers.find((m) => m.id === id)?.name ||
                ctx.teamMembers.find((m) => m.id === id)?.email ||
                "Bilinmeyen üye";
          return `${name}: ${formatTL(total)}`;
        })
        .join(", ");
    },
  },
  {
    id: "revenue_per_member_year",
    category: "Takım",
    label: "Bu yıl üye başına ne kadar ciro var?",
    keywords: ["üye başına bu yıl ciro", "kişi başına bu yılki gelir"],
    compute: (ctx) => {
      if (ctx.teamMembers.length === 0) return "Henüz takım üyeniz yok.";
      const bounds = getRangeBounds("bu_yil");
      const won = ctx.deals.filter(
        (d) =>
          d.stage === "kazanildi" && d.assignedTo && inRange(d.closedAt || d.createdAt, bounds),
      );
      if (won.length === 0) return "Bu yıl henüz sorumlu atanmış, kazanılmış bir kaydınız yok.";
      const totals = {};
      won.forEach((d) => {
        totals[d.assignedTo] = (totals[d.assignedTo] || 0) + (d.value || 0);
      });
      return Object.entries(totals)
        .map(([id, total]) => {
          const name =
            id === ctx.currentUserId
              ? "Siz"
              : ctx.teamMembers.find((m) => m.id === id)?.name ||
                ctx.teamMembers.find((m) => m.id === id)?.email ||
                "Bilinmeyen üye";
          return `${name}: ${formatTL(total)}`;
        })
        .join(", ");
    },
  },
  {
    id: "revenue_per_member_all_time",
    category: "Takım",
    label: "Tüm zamanlar üye başına ne kadar ciro var?",
    keywords: ["üye başına tüm zamanlar ciro", "kişi başına toplam gelir"],
    compute: (ctx) => {
      if (ctx.teamMembers.length === 0) return "Henüz takım üyeniz yok.";
      const won = ctx.deals.filter((d) => d.stage === "kazanildi" && d.assignedTo);
      if (won.length === 0) return "Henüz sorumlu atanmış, kazanılmış bir kaydınız yok.";
      const totals = {};
      won.forEach((d) => {
        totals[d.assignedTo] = (totals[d.assignedTo] || 0) + (d.value || 0);
      });
      return Object.entries(totals)
        .map(([id, total]) => {
          const name =
            id === ctx.currentUserId
              ? "Siz"
              : ctx.teamMembers.find((m) => m.id === id)?.name ||
                ctx.teamMembers.find((m) => m.id === id)?.email ||
                "Bilinmeyen üye";
          return `${name}: ${formatTL(total)}`;
        })
        .join(", ");
    },
  },
  {
    id: "least_assigned_member",
    category: "Takım",
    label: "En az kayıt sorumlusu olan (en boşta) üye kim?",
    keywords: ["en az kaydı olan üye", "en boşta üye"],
    compute: (ctx) => {
      if (ctx.teamMembers.length === 0) return "Henüz takım üyeniz yok.";
      const assigned = ctx.deals.filter((d) => d.assignedTo);
      const names = [ctx.currentUserId, ...ctx.teamMembers.map((m) => m.id)];
      const totals = {};
      names.forEach((id) => {
        totals[id] = 0;
      });
      assigned.forEach((d) => {
        totals[d.assignedTo] = (totals[d.assignedTo] || 0) + 1;
      });
      const bottom = Object.entries(totals).sort((a, b) => a[1] - b[1])[0];
      const name =
        bottom[0] === ctx.currentUserId
          ? "Siz"
          : ctx.teamMembers.find((m) => m.id === bottom[0])?.name ||
            ctx.teamMembers.find((m) => m.id === bottom[0])?.email ||
            "Bilinmeyen üye";
      return `${name} - ${bottom[1]} kayıtla en az sorumlu olduğunuz/olunan üye.`;
    },
  },
  {
    id: "top_earning_member_month",
    category: "Takım",
    label: "Bu ay en çok kazandıran üye kim?",
    keywords: ["bu ay en çok kazandıran üye", "bu ay en başarılı üye"],
    compute: (ctx) => {
      if (ctx.teamMembers.length === 0) return "Henüz takım üyeniz yok.";
      const bounds = getRangeBounds("bu_ay");
      const won = ctx.deals.filter(
        (d) =>
          d.stage === "kazanildi" && d.assignedTo && inRange(d.closedAt || d.createdAt, bounds),
      );
      if (won.length === 0) return "Bu ay henüz sorumlu atanmış, kazanılmış bir kaydınız yok.";
      const totals = {};
      won.forEach((d) => {
        totals[d.assignedTo] = (totals[d.assignedTo] || 0) + (d.value || 0);
      });
      const top = topEntry(totals);
      const name =
        top[0] === ctx.currentUserId
          ? "Siz"
          : ctx.teamMembers.find((m) => m.id === top[0])?.name ||
            ctx.teamMembers.find((m) => m.id === top[0])?.email ||
            "Bilinmeyen üye";
      return `${name} - bu ay ${formatTL(top[1])} ile en çok kazandıran üye.`;
    },
  },
  {
    id: "top_earning_member_year",
    category: "Takım",
    label: "Bu yıl en çok kazandıran üye kim?",
    keywords: ["bu yıl en çok kazandıran üye", "bu yılın en başarılı üyesi"],
    compute: (ctx) => {
      if (ctx.teamMembers.length === 0) return "Henüz takım üyeniz yok.";
      const bounds = getRangeBounds("bu_yil");
      const won = ctx.deals.filter(
        (d) =>
          d.stage === "kazanildi" && d.assignedTo && inRange(d.closedAt || d.createdAt, bounds),
      );
      if (won.length === 0) return "Bu yıl henüz sorumlu atanmış, kazanılmış bir kaydınız yok.";
      const totals = {};
      won.forEach((d) => {
        totals[d.assignedTo] = (totals[d.assignedTo] || 0) + (d.value || 0);
      });
      const top = topEntry(totals);
      const name =
        top[0] === ctx.currentUserId
          ? "Siz"
          : ctx.teamMembers.find((m) => m.id === top[0])?.name ||
            ctx.teamMembers.find((m) => m.id === top[0])?.email ||
            "Bilinmeyen üye";
      return `${name} - bu yıl ${formatTL(top[1])} ile en çok kazandıran üye.`;
    },
  },
  {
    id: "top_earning_member_all_time",
    category: "Takım",
    label: "Tüm zamanlar en çok kazandıran üye kim?",
    keywords: ["tüm zamanlar en çok kazandıran üye", "genel en başarılı üye"],
    compute: (ctx) => {
      if (ctx.teamMembers.length === 0) return "Henüz takım üyeniz yok.";
      const won = ctx.deals.filter((d) => d.stage === "kazanildi" && d.assignedTo);
      if (won.length === 0) return "Henüz sorumlu atanmış, kazanılmış bir kaydınız yok.";
      const totals = {};
      won.forEach((d) => {
        totals[d.assignedTo] = (totals[d.assignedTo] || 0) + (d.value || 0);
      });
      const top = topEntry(totals);
      const name =
        top[0] === ctx.currentUserId
          ? "Siz"
          : ctx.teamMembers.find((m) => m.id === top[0])?.name ||
            ctx.teamMembers.find((m) => m.id === top[0])?.email ||
            "Bilinmeyen üye";
      return `${name} - tüm zamanlar ${formatTL(top[1])} ile en çok kazandıran üye.`;
    },
  },
  {
    id: "avg_sales_cycle_per_member",
    category: "Takım",
    label: "Üye başına ortalama satış döngüsü (gün) ne kadar?",
    keywords: ["üye başına satış süresi", "kişi başına kapanma süresi"],
    compute: (ctx) => {
      if (ctx.teamMembers.length === 0) return "Henüz takım üyeniz yok.";
      const won = ctx.deals.filter((d) => d.stage === "kazanildi" && d.assignedTo && d.closedAt);
      if (won.length === 0) return "Henüz sorumlu atanmış, kazanılmış bir kaydınız yok.";
      const byMember = {};
      won.forEach((d) => {
        if (!byMember[d.assignedTo]) byMember[d.assignedTo] = [];
        byMember[d.assignedTo].push(
          (new Date(d.closedAt) - new Date(d.createdAt)) / (1000 * 60 * 60 * 24),
        );
      });
      return Object.entries(byMember)
        .map(([id, days]) => {
          const name =
            id === ctx.currentUserId
              ? "Siz"
              : ctx.teamMembers.find((m) => m.id === id)?.name ||
                ctx.teamMembers.find((m) => m.id === id)?.email ||
                "Bilinmeyen üye";
          const avg = Math.round(days.reduce((a, b) => a + b, 0) / days.length);
          return `${name}: ${avg} gün`;
        })
        .join(", ");
    },
  },
  {
    id: "lost_deals_per_member",
    category: "Takım",
    label: "Üye başına kaç kayıp (kaybedilen) kaydı var?",
    keywords: ["üye başına kayıp kayıt", "kişi başına kaybedilen teklif"],
    compute: (ctx) => {
      if (ctx.teamMembers.length === 0) return "Henüz takım üyeniz yok.";
      const lost = ctx.deals.filter((d) => d.stage === "kaybedildi" && d.assignedTo);
      if (lost.length === 0) return "Henüz sorumlu atanmış, kaybedilmiş bir kaydınız yok.";
      const totals = {};
      lost.forEach((d) => {
        totals[d.assignedTo] = (totals[d.assignedTo] || 0) + 1;
      });
      return Object.entries(totals)
        .map(([id, count]) => {
          const name =
            id === ctx.currentUserId
              ? "Siz"
              : ctx.teamMembers.find((m) => m.id === id)?.name ||
                ctx.teamMembers.find((m) => m.id === id)?.email ||
                "Bilinmeyen üye";
          return `${name}: ${count}`;
        })
        .join(", ");
    },
  },
  {
    id: "inactive_members_30_days",
    category: "Takım",
    label: "Son 30 günde hiç yeni kayıt eklemeyen (kendine atamayan) üye var mı?",
    keywords: ["pasif takım üyesi", "son 30 gün kayıt eklemeyen üye"],
    compute: (ctx) => {
      if (ctx.teamMembers.length === 0) return "Henüz takım üyeniz yok.";
      const now = new Date();
      const start = new Date(now.getTime() - 29 * 24 * 60 * 60 * 1000);
      start.setHours(0, 0, 0, 0);
      const activeIds = new Set(
        ctx.deals
          .filter((d) => d.assignedTo && inRange(d.createdAt, { start, end: now }))
          .map((d) => d.assignedTo),
      );
      const inactiveMembers = ctx.teamMembers.filter((m) => !activeIds.has(m.id));
      if (inactiveMembers.length === 0)
        return "Tüm takım üyeleriniz son 30 günde en az bir kayıt eklemiş/kendine atamış.";
      return `${inactiveMembers.length} takım üyeniz son 30 günde hiç kayıt eklememiş/kendine atamamış: ${inactiveMembers.map((m) => m.name || m.email).join(", ")}.`;
    },
  },
  {
    id: "last_win_date_per_member",
    category: "Takım",
    label: "Üye başına en son ne zaman bir kayıt kazandı?",
    keywords: ["üye son kazanma tarihi", "kişi başına son satış tarihi"],
    compute: (ctx) => {
      if (ctx.teamMembers.length === 0) return "Henüz takım üyeniz yok.";
      const won = ctx.deals.filter((d) => d.stage === "kazanildi" && d.assignedTo && d.closedAt);
      if (won.length === 0) return "Henüz sorumlu atanmış, kazanılmış bir kaydınız yok.";
      const lastByMember = {};
      won.forEach((d) => {
        if (
          !lastByMember[d.assignedTo] ||
          new Date(d.closedAt) > new Date(lastByMember[d.assignedTo])
        )
          lastByMember[d.assignedTo] = d.closedAt;
      });
      return Object.entries(lastByMember)
        .map(([id, date]) => {
          const name =
            id === ctx.currentUserId
              ? "Siz"
              : ctx.teamMembers.find((m) => m.id === id)?.name ||
                ctx.teamMembers.find((m) => m.id === id)?.email ||
                "Bilinmeyen üye";
          return `${name}: ${new Date(date).toLocaleDateString("tr-TR")}`;
        })
        .join(", ");
    },
  },
  {
    id: "top_member_open_value_share",
    category: "Takım",
    label: "En yüksek açık portföye sahip üyenin toplam içindeki payı ne kadar?",
    keywords: ["üye konsantrasyon riski", "en yüksek portföy payı"],
    compute: (ctx) => {
      const open = ctx.deals.filter(
        (d) => d.stage !== "kazanildi" && d.stage !== "kaybedildi" && d.assignedTo,
      );
      if (open.length === 0) return "Şu anda sorumlu atanmış açık bir kaydınız yok.";
      const totals = {};
      open.forEach((d) => {
        totals[d.assignedTo] = (totals[d.assignedTo] || 0) + (d.value || 0);
      });
      const total = Object.values(totals).reduce((sum, v) => sum + v, 0);
      const top = topEntry(totals);
      const share = Math.round((top[1] / total) * 100);
      const name =
        top[0] === ctx.currentUserId
          ? "Siz"
          : ctx.teamMembers.find((m) => m.id === top[0])?.name ||
            ctx.teamMembers.find((m) => m.id === top[0])?.email ||
            "Bilinmeyen üye";
      if (share >= 60)
        return `${name} açık portföyün %${share}'ini tek başına taşıyor - bu kişi izinli/uzakta olursa iş sürekliliği riski oluşabilir.`;
      return `${name} açık portföyün %${share}'ini taşıyor - dağılım makul görünüyor.`;
    },
  },
  {
    id: "deals_won_per_member_this_week",
    category: "Takım",
    label: "Üye başına bu hafta kaç kayıt kazanmış?",
    keywords: ["üye başına haftalık kazanç", "kişi başına bu hafta kazanılan kayıt"],
    compute: (ctx) => {
      if (ctx.teamMembers.length === 0) return "Henüz takım üyeniz yok.";
      const now = new Date();
      const start = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000);
      start.setHours(0, 0, 0, 0);
      const won = ctx.deals.filter(
        (d) =>
          d.stage === "kazanildi" &&
          d.assignedTo &&
          inRange(d.closedAt || d.createdAt, { start, end: now }),
      );
      if (won.length === 0) return "Bu hafta henüz sorumlu atanmış, kazanılmış bir kaydınız yok.";
      const totals = {};
      won.forEach((d) => {
        totals[d.assignedTo] = (totals[d.assignedTo] || 0) + 1;
      });
      return Object.entries(totals)
        .map(([id, count]) => {
          const name =
            id === ctx.currentUserId
              ? "Siz"
              : ctx.teamMembers.find((m) => m.id === id)?.name ||
                ctx.teamMembers.find((m) => m.id === id)?.email ||
                "Bilinmeyen üye";
          return `${name}: ${count}`;
        })
        .join(", ");
    },
  },
  {
    id: "lowest_win_rate_member",
    category: "Takım",
    label: "Kazanma oranı en düşük olan üye kim?",
    keywords: ["en düşük kazanma oranı üye", "en zayıf performans üye"],
    compute: (ctx) => {
      if (ctx.teamMembers.length === 0) return "Henüz takım üyeniz yok.";
      const closed = ctx.deals.filter(
        (d) => (d.stage === "kazanildi" || d.stage === "kaybedildi") && d.assignedTo,
      );
      const names = [ctx.currentUserId, ...ctx.teamMembers.map((m) => m.id)];
      const rates = names
        .map((id) => {
          const memberClosed = closed.filter((d) => d.assignedTo === id);
          if (memberClosed.length < 3) return null;
          const won = memberClosed.filter((d) => d.stage === "kazanildi").length;
          return { id, rate: (won / memberClosed.length) * 100 };
        })
        .filter(Boolean);
      if (rates.length === 0)
        return "Karşılaştırma için yeterli veri yok (her üyenin en az 3 sonuçlanmış kaydı olmalı).";
      const bottom = rates.sort((a, b) => a.rate - b.rate)[0];
      const name =
        bottom.id === ctx.currentUserId
          ? "Siz"
          : ctx.teamMembers.find((m) => m.id === bottom.id)?.name ||
            ctx.teamMembers.find((m) => m.id === bottom.id)?.email ||
            "Bilinmeyen üye";
      return `${name} - %${Math.round(bottom.rate)} kazanma oranıyla en düşük performansa sahip üye.`;
    },
  },
  {
    id: "avg_won_value_per_member",
    category: "Takım",
    label: "Üye başına ortalama kazanılan kayıt değeri ne kadar?",
    keywords: ["üye başına ortalama kazanılan değer", "kişi başına ortalama satış tutarı"],
    compute: (ctx) => {
      if (ctx.teamMembers.length === 0) return "Henüz takım üyeniz yok.";
      const won = ctx.deals.filter((d) => d.stage === "kazanildi" && d.assignedTo);
      if (won.length === 0) return "Henüz sorumlu atanmış, kazanılmış bir kaydınız yok.";
      const byMember = {};
      won.forEach((d) => {
        if (!byMember[d.assignedTo]) byMember[d.assignedTo] = [];
        byMember[d.assignedTo].push(d.value || 0);
      });
      return Object.entries(byMember)
        .map(([id, values]) => {
          const name =
            id === ctx.currentUserId
              ? "Siz"
              : ctx.teamMembers.find((m) => m.id === id)?.name ||
                ctx.teamMembers.find((m) => m.id === id)?.email ||
                "Bilinmeyen üye";
          const avg = values.reduce((a, b) => a + b, 0) / values.length;
          return `${name}: ${formatTL(avg)}`;
        })
        .join(", ");
    },
  },
  {
    id: "attachments_this_year",
    category: "Sistem",
    label: "Bu yıl kaç dosya eklemişim?",
    keywords: ["bu yıl eklenen dosya", "bu yılki dosya sayısı"],
    compute: (ctx) => {
      const bounds = getRangeBounds("bu_yil");
      const count = ctx.attachments.filter((a) => inRange(a.createdAt, bounds)).length;
      return `Bu yıl ${count} dosya eklediniz.`;
    },
  },
  {
    id: "attachments_this_quarter",
    category: "Sistem",
    label: "Bu çeyrek kaç dosya eklemişim?",
    keywords: ["bu çeyrek eklenen dosya", "bu çeyrekki dosya sayısı"],
    compute: (ctx) => {
      const bounds = getRangeBounds("bu_ceyrek");
      const count = ctx.attachments.filter((a) => inRange(a.createdAt, bounds)).length;
      return `Bu çeyrek ${count} dosya eklediniz.`;
    },
  },
  {
    id: "attachments_this_week",
    category: "Sistem",
    label: "Bu hafta kaç dosya eklemişim?",
    keywords: ["bu hafta eklenen dosya", "bu haftaki dosya sayısı"],
    compute: (ctx) => {
      const now = new Date();
      const start = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000);
      start.setHours(0, 0, 0, 0);
      const count = ctx.attachments.filter((a) => inRange(a.createdAt, { start, end: now })).length;
      return `Son 7 günde ${count} dosya eklediniz.`;
    },
  },
  {
    id: "avg_attachment_size",
    category: "Sistem",
    label: "Ortalama dosya boyutu ne kadar?",
    keywords: ["ortalama dosya boyutu", "dosya başına boyut"],
    compute: (ctx) => {
      if (ctx.attachments.length === 0) return "Henüz bir dosya yüklenmemiş.";
      const avg =
        ctx.attachments.reduce((sum, a) => sum + (a.fileSize || 0), 0) / ctx.attachments.length;
      return `Ortalama dosya boyutunuz ${formatFileSize(avg)}.`;
    },
  },
  {
    id: "largest_attachment",
    category: "Sistem",
    label: "En büyük dosyam hangisi?",
    keywords: ["en büyük dosya", "en yüksek boyutlu dosya"],
    compute: (ctx) => {
      if (ctx.attachments.length === 0) return "Henüz bir dosya yüklenmemiş.";
      const sorted = [...ctx.attachments].sort((a, b) => (b.fileSize || 0) - (a.fileSize || 0));
      return `En büyük dosyanız "${sorted[0].fileName}" - ${formatFileSize(sorted[0].fileSize || 0)}.`;
    },
  },
  {
    id: "attachment_content_type_variety",
    category: "Sistem",
    label: "Kaç farklı dosya türü yüklemişim?",
    keywords: ["dosya türü çeşitliliği", "kaç farklı uzantı"],
    compute: (ctx) => {
      if (ctx.attachments.length === 0) return "Henüz bir dosya yüklenmemiş.";
      const types = new Set(ctx.attachments.map((a) => a.contentType).filter(Boolean));
      return `Şimdiye kadar ${types.size} farklı dosya türü yüklemişsiniz.`;
    },
  },
  {
    id: "price_list_total_value",
    category: "Sistem",
    label: "Fiyat listemdeki ürünlerin toplam değeri ne kadar?",
    keywords: ["fiyat listesi toplam değer", "tüm ürünlerin toplam fiyatı"],
    compute: (ctx) => {
      if (ctx.priceListItems.length === 0) return "Fiyat listenizde henüz bir ürün/hizmet yok.";
      const total = ctx.priceListItems.reduce((sum, p) => sum + (p.price || 0), 0);
      return `Fiyat listenizdeki ${ctx.priceListItems.length} ürün/hizmetin toplam değeri ${formatTL(total)}.`;
    },
  },
  {
    id: "most_filled_custom_field",
    category: "Sistem",
    label: "En çok doldurulan özel alanım hangisi?",
    keywords: ["en çok doldurulan özel alan", "en dolu özel alan"],
    compute: (ctx) => {
      const active = ctx.customFieldDefs.filter((d) => d.active);
      if (active.length === 0) return "Henüz aktif bir özel alanınız yok.";
      const rates = active.map((def) => {
        const records = def.entity === "customer" ? ctx.customers : ctx.deals;
        if (records.length === 0) return { label: def.label, rate: 0 };
        const filled = records.filter(
          (r) => r.customFields?.[def.key] != null && r.customFields?.[def.key] !== "",
        ).length;
        return { label: def.label, rate: filled / records.length };
      });
      const highest = [...rates].sort((a, b) => b.rate - a.rate)[0];
      return `En çok doldurulan özel alanınız "${highest.label}" - %${Math.round(highest.rate * 100)} doluluk.`;
    },
  },
  {
    id: "overall_custom_field_fill_rate",
    category: "Sistem",
    label: "Özel alanlarımın genel doluluk oranı nedir?",
    keywords: ["genel özel alan doluluk oranı", "ortalama özel alan doluluğu"],
    compute: (ctx) => {
      const active = ctx.customFieldDefs.filter((d) => d.active);
      if (active.length === 0) return "Henüz aktif bir özel alanınız yok.";
      const rates = active.map((def) => {
        const records = def.entity === "customer" ? ctx.customers : ctx.deals;
        if (records.length === 0) return 0;
        return (
          records.filter(
            (r) => r.customFields?.[def.key] != null && r.customFields?.[def.key] !== "",
          ).length / records.length
        );
      });
      const avg = Math.round((rates.reduce((a, b) => a + b, 0) / rates.length) * 100);
      return `Özel alanlarınızın genel doluluk oranı %${avg}.`;
    },
  },
  {
    id: "missing_company_info_fields",
    category: "Sistem",
    label: "İşletme bilgilerimde hangi alan(lar) eksik?",
    keywords: ["eksik işletme bilgisi", "hangi işletme alanı boş"],
    compute: (ctx) => {
      const fields = [
        { key: "companyName", label: "Firma adı" },
        { key: "address", label: "Adres" },
        { key: "phone", label: "Telefon" },
        { key: "email", label: "E-posta" },
        { key: "taxNumber", label: "Vergi numarası" },
      ];
      const missing = fields.filter((f) => !ctx.companySettings?.[f.key]);
      if (missing.length === 0) return "İşletme bilgilerinizin tamamı dolu.";
      return `Eksik işletme bilgileriniz: ${missing.map((f) => f.label).join(", ")}.`;
    },
  },
  {
    id: "deals_without_line_items",
    category: "Sistem",
    label: "Kalemsiz (tek satırlık) fiyatlandırma kullanan kaç kaydım var?",
    keywords: ["kalemsiz kayıt sayısı", "tek satırlık fiyatlandırma"],
    compute: (ctx) => {
      if (ctx.deals.length === 0) return "Henüz bir kaydınız yok.";
      const dealIdsWithItems = new Set((ctx.dealLineItems || []).map((li) => li.dealId));
      const withoutItems = ctx.deals.filter((d) => !dealIdsWithItems.has(d.id)).length;
      const share = Math.round((withoutItems / ctx.deals.length) * 100);
      return `Kayıtlarınızın %${share}'i (${withoutItems} kayıt) kalem bazlı liste kullanmadan, tek satırlık tutar üzerinden girilmiş.`;
    },
  },
  {
    id: "custom_field_type_breakdown",
    category: "Sistem",
    label: "Aktif özel alanlarım hangi tiplerden oluşuyor?",
    keywords: ["özel alan tip dağılımı", "metin sayı tarih özel alan sayısı"],
    compute: (ctx) => {
      const active = ctx.customFieldDefs.filter((d) => d.active);
      if (active.length === 0) return "Henüz aktif bir özel alanınız yok.";
      const totals = {};
      active.forEach((d) => {
        totals[d.type] = (totals[d.type] || 0) + 1;
      });
      return Object.entries(totals)
        .map(([type, count]) => `${type}: ${count}`)
        .join(", ");
    },
  },
  {
    id: "custom_field_dropdown_count",
    category: "Sistem",
    label: "Kaç aktif özel alanım seçim listesi (dropdown) tipinde?",
    keywords: ["dropdown özel alan sayısı", "seçim listesi tipi özel alan"],
    compute: (ctx) => {
      const count = ctx.customFieldDefs.filter((d) => d.active && d.type === "select").length;
      return count > 0
        ? `${count} aktif özel alanınız seçim listesi (dropdown) tipinde.`
        : "Seçim listesi tipinde aktif bir özel alanınız yok.";
    },
  },
];
