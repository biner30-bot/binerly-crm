import React, { useState, useEffect } from "react";
import { Badge, Modal, InfoTip, ConfirmDialog, IconButton, uid, matchesDateRange, DateRangeFilter, downloadXlsx } from "./shared";
import { ImportModal } from "./ImportExport";
import { SECTOR_PRESETS, supportExamples } from "./Sectors";

const PRIORITIES = [
  { id: "acil", label: "Acil", hours: 4 },
  { id: "yuksek", label: "Yüksek", hours: 24 },
  { id: "orta", label: "Orta", hours: 48 },
  { id: "dusuk", label: "Düşük", hours: 72 },
];

const PRIORITY_TONE = { acil: "danger", yuksek: "warning", orta: "accent", dusuk: "default" };

export const STATUSES = [
  { id: "acik", label: "Açık" },
  { id: "islemde", label: "İşlemde" },
  { id: "musteri_bekleniyor", label: "Müşteri yanıtı bekleniyor" },
  { id: "cozuldu", label: "Çözüldü" },
  { id: "kapatildi", label: "Kapatıldı" },
];

const STATUS_TONE = {
  acik: "accent",
  islemde: "warning",
  musteri_bekleniyor: "warning",
  cozuldu: "success",
  kapatildi: "default",
};

export const TERMINAL_STATUSES = ["cozuldu", "kapatildi"];

const TICKET_IMPORT_FIELDS = [
  { key: "customerName", label: "Müşteri adı", required: true, resolveCustomer: true },
  { key: "subject", label: "Konu", required: true },
  { key: "description", label: "Açıklama", hideInPreview: true },
  { key: "priority", label: "Öncelik", type: "enum", enumOptions: PRIORITIES, enumDefault: "orta" },
  { key: "status", label: "Durum", type: "enum", enumOptions: STATUSES, enumDefault: "acik" },
];

const KB_IMPORT_FIELDS = [
  { key: "title", label: "Başlık", required: true },
  { key: "category", label: "Kategori" },
  { key: "content", label: "İçerik", required: true, hideInPreview: true },
];

const KB_TEMPLATES_BY_SECTOR = {
  emlak: [
    {
      title: "Bu mülk için kredi kullanabilir miyim?",
      category: "Finansman",
      content:
        "Bankaların konut/işyeri kredisi değerlendirmesi, mülkün ekspertiz değerine ve sizin gelir durumunuza göre yapılır. " +
        "İsterseniz süreçte size eşlik edebilir, [anlaştığımız banka/danışman varsa burada belirtin] yönlendirebiliriz.",
    },
    {
      title: "Tapu devri ne zaman ve nasıl yapılır?",
      category: "Tapu & Devir",
      content:
        "Tapu devri, taraflar anlaştıktan sonra Tapu Müdürlüğü'nde randevu alınarak gerçekleştirilir. " +
        "Gerekli belgeler: kimlik, [DASK, ekspertiz raporu vb. varsa ekleyin]. Süreç genelde [X iş günü] içinde tamamlanır.",
    },
    {
      title: "Kiralık mülklerde depozito iadesi nasıl işler?",
      category: "Kiralama",
      content:
        "Depozito, kira sözleşmesi sona erdiğinde ve mülk teslim alındığında, hasar/eksik ödeme yoksa " +
        "[X iş günü] içinde iade edilir. Varsa kesinti sebepleri (hasar, ödenmemiş fatura vb.) yazılı olarak bildirilir.",
    },
    {
      title: "Mülkü görmeden teklif verebilir miyim?",
      category: "Randevu & Görüşme",
      content:
        "Fotoğraf/video ve detaylı bilgi paylaşabiliriz, ancak bağlayıcı bir teklif öncesi yerinde görmenizi öneririz. " +
        "Uygun bir randevu için bizimle iletişime geçebilirsiniz.",
    },
  ],
  dijital_ajans: [
    {
      title: "Reklam bütçem ne zaman harcanmaya başlar?",
      category: "Reklam Yönetimi",
      content:
        "Kampanya kurulumu ve onayınızın ardından reklamlar genelde [1-2 iş günü] içinde yayına alınır. " +
        "Platform onay süreçleri (Google/Meta) nedeniyle bu süre bazen uzayabilir.",
    },
    {
      title: "Web sitem/projem ne zaman yayına alınır?",
      category: "Web Tasarım",
      content:
        "Proje süresi kapsam ve revizyon sayısına göre değişir — sözleşmede belirtilen [X hafta] hedeflenir. " +
        "İçerik ve görsellerin zamanında tarafımıza ulaşması süreci hızlandırır.",
    },
    {
      title: "Aylık performans raporum ne zaman gelir?",
      category: "Raporlama",
      content:
        "Raporlar her ayın [ilk haftasında] e-posta ile paylaşılır; talep ederseniz ek olarak bir görüşme de planlayabiliriz.",
    },
    {
      title: "Sözleşmemi/aboneliğimi nasıl iptal ederim?",
      category: "Sözleşme & İptal",
      content:
        "İptal talebinizi bize e-posta ile iletmeniz yeterli. Sözleşmenizde belirtilen [bildirim süresi, varsa cayma koşulları] geçerlidir.",
    },
  ],
  saglik_klinik: [
    {
      title: "Randevumu nasıl iptal edebilir veya erteleyebilirim?",
      category: "Randevu",
      content:
        "Randevunuzu en az [X saat] önceden bize bildirerek iptal edebilir veya erteleyebilirsiniz. " +
        "Geç iptallerde [varsa ücret politikanızı burada belirtin].",
    },
    {
      title: "Sigortam/SGK tedaviyi karşılıyor mu?",
      category: "Sigorta & Ödeme",
      content:
        "Bu, sigorta türünüze ve uygulanacak tedaviye göre değişir. Randevu öncesi sigorta bilgilerinizi paylaşırsanız " +
        "size net bilgi verebiliriz.",
    },
    {
      title: "Tedavi/muayene sonrası nelere dikkat etmeliyim?",
      category: "Tedavi Sonrası",
      content:
        "Size özel bakım önerileri randevu sonunda sözlü ve/veya yazılı olarak paylaşılır. " +
        "Herhangi bir olağan dışı durumda bizimle iletişime geçmenizi öneririz.",
    },
    {
      title: "Sonuçlarım/raporum ne zaman hazır olur?",
      category: "Sonuç & Rapor",
      content:
        "Tetkik/tahlil türüne göre değişmekle birlikte genelde [X gün] içinde sonuçlarınız hazır olur ve tarafınıza iletilir.",
    },
  ],
  uretim_satis: [
    {
      title: "Siparişim ne zaman kargoya/sevkiyata verilir?",
      category: "Kargo & Teslimat",
      content:
        "Siparişleriniz onaylandıktan sonra ortalama [1-3 iş günü] içinde kargoya/sevkiyata verilir. " +
        "Yoğun dönemlerde bu süre uzayabilir.",
    },
    {
      title: "Minimum sipariş miktarı var mı?",
      category: "Sipariş",
      content:
        "Ürün grubuna göre minimum sipariş miktarı değişebilir — güncel bilgi için bizimle iletişime geçebilirsiniz.",
    },
    {
      title: "Toptan/bayilik fiyat listesi nasıl alırım?",
      category: "Bayilik & Toptan",
      content:
        "Vergi levhanız ve iletişim bilgilerinizle bize ulaşmanız yeterli, size uygun fiyat listesini paylaşırız.",
    },
    {
      title: "Ürün garantisi ne kadar sürer?",
      category: "Garanti",
      content:
        "Ürünlerimiz [X ay/yıl] garanti kapsamındadır. Garanti belgesi ve fatura ile talepte bulunabilirsiniz.",
    },
  ],
  hizmet_danismanlik: [
    {
      title: "Danışmanlık ücreti nasıl hesaplanıyor?",
      category: "Ücretlendirme",
      content:
        "Ücretlendirme; saatlik, proje bazlı veya aylık paket şeklinde olabilir, ihtiyacınıza göre birlikte belirleriz.",
    },
    {
      title: "İlk görüşme ücretsiz mi?",
      category: "Randevu & Görüşme",
      content:
        "İlk ön görüşme genelde ücretsizdir ve ihtiyaçlarınızı anlamaya yöneliktir; kapsam netleştikten sonra teklif sunulur.",
    },
    {
      title: "Raporum/teslimatım ne zaman hazır olur?",
      category: "Teslimat",
      content:
        "Teslimat tarihi, anlaşma kapsamında belirlenen [X hafta/ay] süreye göre planlanır ve süreç boyunca bilgilendirilirsiniz.",
    },
    {
      title: "Sözleşmeyi nasıl feshedebilirim?",
      category: "Sözleşme",
      content:
        "Fesih talebinizi yazılı olarak bize iletmeniz yeterli. Sözleşmenizde belirtilen [bildirim süresi] geçerlidir.",
    },
  ],
  perakende: [
    {
      title: "Siparişim ne zaman kargoya verilir?",
      category: "Kargo & Teslimat",
      content:
        "Siparişleriniz onaylandıktan sonra ortalama [1-3 iş günü] içinde kargoya verilir, takip numaranız tarafınıza iletilir.",
    },
    {
      title: "Ürün iadesi nasıl yapılır?",
      category: "İade & Değişim",
      content:
        "Ürünü teslim aldığınız tarihten itibaren [14 gün] içinde, kullanılmamış ve orijinal ambalajında olması " +
        "koşuluyla iade edebilirsiniz.",
    },
    {
      title: "Sadakat kartı/üyelik avantajları nedir?",
      category: "Üyelik",
      content:
        "Üyeliğiniz kapsamında [puan, indirim, kampanya avantajları vb. burada belirtin] yararlanabilirsiniz.",
    },
    {
      title: "Online sipariş verip mağazadan teslim alabilir miyim?",
      category: "Sipariş Takibi",
      content:
        "Evet, online sipariş verip [mağaza adı/adresi] üzerinden teslim alabilirsiniz — sipariş onayından sonra sizi bilgilendiririz.",
    },
  ],
  guzellik_bakim: [
    {
      title: "Randevumu nasıl değiştirebilir veya iptal edebilirim?",
      category: "Randevu",
      content:
        "Randevunuzu en az [X saat] önceden bize bildirerek değiştirebilir veya iptal edebilirsiniz.",
    },
    {
      title: "Lazer epilasyonda kaç seans gerekir?",
      category: "Hizmet Bilgisi",
      content:
        "Seans sayısı bölgeye ve kıl yapısına göre değişir, genelde [X-Y seans] önerilir; ilk seansta size özel bir plan paylaşırız.",
    },
    {
      title: "Randevuma gelemezsem ne olur?",
      category: "Randevu Politikası",
      content:
        "Randevunuza gelemeyecekseniz en az [X saat] önceden haber vermenizi rica ederiz. " +
        "[Geç iptal/no-show politikanız varsa burada belirtin].",
    },
    {
      title: "Cilt hassasiyeti/alerjim var, önceden bilgi vermeli miyim?",
      category: "Sağlık & Güvenlik",
      content:
        "Evet, randevu öncesi cilt hassasiyeti, alerji veya kullandığınız ilaç/kozmetik ürünleri hakkında bizi " +
        "bilgilendirmeniz, size en uygun ve güvenli hizmeti sunmamız için önemlidir.",
    },
  ],
  spor_merkezi: [
    {
      title: "Üyeliğimi nasıl dondurabilirim?",
      category: "Üyelik",
      content:
        "Sağlık raporu, seyahat gibi durumlarda üyeliğinizi en az [X gün] öncesinden bildirerek dondurabilirsiniz. " +
        "Dondurma süresi üyelik bitiş tarihinize otomatik eklenir.",
    },
    {
      title: "Üyeliğimi iptal etmek istiyorum",
      category: "Üyelik & İptal",
      content:
        "İptal talebinizi resepsiyona veya bize yazılı olarak iletmeniz yeterli. Sözleşmenizde belirtilen " +
        "[bildirim süresi, varsa cayma koşulları] geçerlidir.",
    },
    {
      title: "PT (Personal Training) seansı nasıl alırım?",
      category: "Hizmetler",
      content:
        "Resepsiyondan veya bizimle iletişime geçerek size uygun bir PT eğitmeniyle randevu oluşturabilirsiniz. " +
        "PT paketleri üyelikten ayrı olarak satılmaktadır.",
    },
    {
      title: "Salonun çalışma saatleri nedir?",
      category: "Genel",
      content:
        "Salonumuz [hafta içi saatler] ve [hafta sonu saatler] arasında hizmet vermektedir. Resmi tatillerde " +
        "çalışma saatlerimiz değişebilir, güncel bilgi için bizimle iletişime geçebilirsiniz.",
    },
  ],
  egitim_kurs: [
    {
      title: "Ders saatimi/gruplarımı nasıl değiştirebilirim?",
      category: "Ders Programı",
      content:
        "Ders saati değişikliği taleplerinizi en az [X gün] öncesinden bize iletmeniz yeterli, uygun bir saate " +
        "göre programınızı güncelleriz.",
    },
    {
      title: "Kayıt ücretini taksitle ödeyebilir miyim?",
      category: "Ödeme",
      content:
        "Kurs ücreti için taksit seçenekleri sunuyoruz, detaylar için bizimle iletişime geçebilirsiniz.",
    },
    {
      title: "Devamsızlık durumunda ders telafisi yapılıyor mu?",
      category: "Ders Programı",
      content:
        "Önceden haber verdiğiniz devamsızlıklar için [telafi koşulları] çerçevesinde telafi dersi planlanabilir.",
    },
    {
      title: "Kursu tamamladığımda sertifika alabilir miyim?",
      category: "Kayıt",
      content:
        "Kursu başarıyla tamamlayan öğrencilerimize katılım/başarı sertifikası verilmektedir.",
    },
  ],
  sanayi_esnaf: [
    {
      title: "Aracım/işim ne zaman teslim edilir?",
      category: "Servis",
      content:
        "Tahmini teslim süresi, yapılacak işin kapsamına ve yedek parça durumuna göre değişir — güncel durumu " +
        "sizinle paylaşırız.",
    },
    {
      title: "Verilen fiyat teklifi kesin midir?",
      category: "Fiyatlandırma",
      content:
        "Teklif, ilk incelemeye göre hazırlanır — sökme sırasında ek bir arıza/ihtiyaç tespit edilirse " +
        "onayınızı almadan işleme devam etmeyiz.",
    },
    {
      title: "Yapılan işte garanti süresi ne kadar?",
      category: "Garanti",
      content:
        "İşçiliğimiz [X ay/yıl] garantilidir, kullanılan parçalarda üretici garantisi geçerlidir.",
    },
    {
      title: "Sigorta/kasko üzerinden işlem yapabiliyor musunuz?",
      category: "Sigorta",
      content:
        "Anlaşmalı olduğumuz sigorta şirketleri için hasar dosyası üzerinden işlem yapabiliyoruz, poliçe " +
        "bilgilerinizi bizimle paylaşmanız yeterli.",
    },
  ],
  genel: [
    {
      title: "Siparişim/talebim ne zaman işleme alınır?",
      category: "Sipariş & Süreç",
      content:
        "Talepleriniz onaylandıktan sonra ortalama [X iş günü] içinde işleme alınır, süreç boyunca sizi bilgilendiririz.",
    },
    {
      title: "Fatura bilgilerimi nasıl güncellerim?",
      category: "Fatura & Ödeme",
      content:
        "Fatura bilgilerinizi (ad-soyad/unvan, adres, vergi no) güncellemek için bizimle iletişime geçmeniz yeterli.",
    },
    {
      title: "Ürün/hizmet iadesi veya iptali nasıl yapılır?",
      category: "İade & İptal",
      content:
        "İade/iptal koşulları [ürün/hizmet türüne göre burada belirtin]. Talebiniz için bizimle iletişime geçebilirsiniz.",
    },
    {
      title: "Destek talebimin durumunu nasıl takip ederim?",
      category: "Destek",
      content:
        "Bize e-posta adresinizle kayıtlıysanız, Müşteri Bilgi Sistemi üzerinden (binerly.com/portal) " +
        "kendi hesabınızla giriş yaparak tüm destek taleplerinizin güncel durumunu ve mesaj geçmişini görebilirsiniz.",
    },
  ],
};

const PRIORITY_INFO_TEXT =
  "Öncelik, talebin hedef çözüm süresini (talep oluşturulduğu andan itibaren) belirler:\n" +
  "Acil → 4 saat\n" +
  "Yüksek → 24 saat\n" +
  "Orta → 48 saat\n" +
  "Düşük → 72 saat";

const SLA_INFO_TEXT =
  "Talep hâlâ açıksa, hedef süreye kalan zamana göre:\n" +
  "🟢 Zamanında — kalan süre hedefin %20'sinden fazla\n" +
  "🟠 Süre yaklaşıyor — kalan süre hedefin son %20'lik diliminde (Acil'de son 48 dk, Yüksek'te son ~5 sa, Orta'da son ~10 sa, Düşük'te son ~14 sa)\n" +
  "🔴 SLA aşıldı — hedef süre geçti\n\n" +
  "Talep Çözüldü/Kapatıldı ise: çözülme anı hedeften önceyse zamanında, sonraysa SLA aşıldı sayılır.";

const MESSAGE_DIRECTIONS = [
  { id: "giden", label: "Giden (müşteriye)", icon: "ti-arrow-up-right" },
  { id: "gelen", label: "Gelen (müşteriden)", icon: "ti-arrow-down-left" },
];

const STATUS_INFO_TEXT =
  "Durumu \"Çözüldü\" veya \"Kapatıldı\" yaptığınızda, e-posta bildirimleri açıksa (Ayarlar → İşletme Bilgileri) " +
  "müşteriye otomatik bir bilgilendirme e-postası gider.\n\n" +
  "İkisi arasındaki fark tamamen size kalmış — örn. \"Çözüldü\" sorunun giderildiğini, \"Kapatıldı\" konunun " +
  "artık takip edilmeyeceğini belirtmek için kullanılabilir. İkisi de SLA süresini durdurur.";

const DIRECTION_INFO_TEXT =
  "\"Giden (müşteriye)\" bir e-posta GÖNDERMEZ — sadece bu mesajı kaydeder ve müşteri, kendi hesabıyla " +
  "Müşteri Portalı'na (binerly.com/portal) giriş yaptığında görebilir. Müşteriye gerçekten e-posta atmak için " +
  "WhatsApp/e-posta gibi kendi iletişim kanallarınızı kullanmanız gerekir.";

const KB_INFO_TEXT =
  "Bilgi Bankası makaleleri sadece siz ve ekibiniz için — iç kaynak niteliğindedir. Müşterileriniz bu makaleleri " +
  "Müşteri Portalı'nda göremez.";

function getSlaDueAt(priority, createdAt) {
  const hours = PRIORITIES.find((p) => p.id === priority)?.hours ?? 48;
  return new Date(new Date(createdAt).getTime() + hours * 3600000);
}

export function getSlaStatus(ticket) {
  const dueAt = getSlaDueAt(ticket.priority, ticket.createdAt);
  const isTerminal = TERMINAL_STATUSES.includes(ticket.status);

  if (isTerminal) {
    const resolvedAt = ticket.resolvedAt ? new Date(ticket.resolvedAt) : new Date();
    const onTime = resolvedAt <= dueAt;
    return {
      dueAt,
      isBreached: !onTime,
      isApproaching: false,
      tone: onTime ? "success" : "danger",
      label: onTime ? "Zamanında çözüldü" : "SLA aşıldı",
    };
  }

  const remainingMs = dueAt.getTime() - Date.now();
  const totalMs = dueAt.getTime() - new Date(ticket.createdAt).getTime();

  if (remainingMs <= 0) {
    return { dueAt, isBreached: true, isApproaching: false, tone: "danger", label: "SLA aşıldı" };
  }
  if (remainingMs <= totalMs * 0.2) {
    return { dueAt, isBreached: false, isApproaching: true, tone: "warning", label: "Süre yaklaşıyor" };
  }
  return { dueAt, isBreached: false, isApproaching: false, tone: "success", label: "Zamanında" };
}

export function rowToTicket(r) {
  return {
    id: r.id,
    customerId: r.customer_id,
    subject: r.subject,
    description: r.description || "",
    priority: r.priority,
    status: r.status,
    resolvedAt: r.resolved_at,
    createdAt: r.created_at,
    deletedAt: r.deleted_at || null,
  };
}

export function rowToTicketMessage(r) {
  return {
    id: r.id,
    ticketId: r.ticket_id,
    direction: r.direction,
    content: r.content,
    isInternal: r.is_internal || false,
    createdAt: r.created_at,
    readAt: r.read_at || null,
  };
}

export function rowToKbArticle(r) {
  return {
    id: r.id,
    title: r.title,
    category: r.category || "",
    content: r.content,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    deletedAt: r.deleted_at || null,
  };
}

function formatDateTime(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleDateString("tr-TR", { day: "numeric", month: "short", year: "numeric" }) +
    " · " + d.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
}

function TicketForm({ customers, initial, onSave, onCancel, sector }) {
  const [customerId, setCustomerId] = useState(initial?.customerId || customers[0]?.id || "");
  const [subject, setSubject] = useState(initial?.subject || "");
  const [description, setDescription] = useState(initial?.description || "");
  const [priority, setPriority] = useState(initial?.priority || "orta");
  const [status, setStatus] = useState(initial?.status || "acik");

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!customerId || !subject.trim()) return;
        const isTerminal = TERMINAL_STATUSES.includes(status);
        onSave({
          id: initial?.id || uid(),
          customerId,
          subject: subject.trim(),
          description: description.trim(),
          priority,
          status,
          resolvedAt: isTerminal ? (initial?.resolvedAt || new Date().toISOString()) : null,
          createdAt: initial?.createdAt || new Date().toISOString(),
        });
      }}
    >
      <div style={{ marginBottom: 12 }}>
        <label style={{ fontSize: 13, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Müşteri</label>
        {initial ? (
          <p style={{ margin: 0, fontSize: 14, fontWeight: 500 }}>{customers.find((c) => c.id === customerId)?.name || "Bilinmeyen müşteri"}</p>
        ) : customers.length === 0 ? (
          <p style={{ fontSize: 13, color: "var(--text-muted)" }}>Önce bir müşteri ekleyin.</p>
        ) : (
          <select value={customerId} onChange={(e) => setCustomerId(e.target.value)} style={{ width: "100%" }}>
            {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        )}
      </div>
      <div style={{ marginBottom: 12 }}>
        <label style={{ fontSize: 13, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Konu</label>
        <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder={`Örn. ${supportExamples(sector).subject}`} style={{ width: "100%" }} />
      </div>
      <div style={{ display: "flex", gap: 12, marginBottom: 12 }}>
        <div style={{ flex: 1 }}>
          <label style={{ fontSize: 13, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Öncelik</label>
          <select value={priority} onChange={(e) => setPriority(e.target.value)} style={{ width: "100%" }}>
            {PRIORITIES.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
        </div>
        <div style={{ flex: 1 }}>
          <label style={{ fontSize: 13, color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: 4, marginBottom: 4 }}>Durum <InfoTip text={STATUS_INFO_TEXT} /></label>
          <select value={status} onChange={(e) => setStatus(e.target.value)} style={{ width: "100%" }}>
            {STATUSES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </div>
      </div>
      <div style={{ marginBottom: 16 }}>
        <label style={{ fontSize: 13, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Açıklama</label>
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Talebin detayları" style={{ width: "100%", minHeight: 80, resize: "vertical" }} />
      </div>
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button type="button" onClick={onCancel}>Vazgeç</button>
        <button type="submit" disabled={customers.length === 0} style={{ background: "var(--fill-accent)", color: "var(--on-accent)", border: "none" }}>Kaydet</button>
      </div>
    </form>
  );
}

function TicketList({
  tickets,
  totalCount,
  customers,
  unreadCountByTicket,
  statusFilter,
  onFilterChange,
  searchQuery,
  onSearchChange,
  priorityFilter,
  onPriorityFilterChange,
  slaFilter,
  onSlaFilterChange,
  fromDate,
  toDate,
  onFromDateChange,
  onToDateChange,
  onOpenTicket,
  onEditTicket,
  onDeleteTicket,
  onCreateNew,
}) {
  const [confirmDelete, setConfirmDelete] = useState(null);
  const customerById = (id) => customers.find((c) => c.id === id);
  const sorted = tickets;

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        <input
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Talep ara (konu, müşteri)..."
          style={{ flex: 1, minWidth: 160 }}
        />
        <select value={statusFilter} onChange={(e) => onFilterChange(e.target.value)} style={{ fontSize: 13 }}>
          <option value="all">Tüm durumlar</option>
          {STATUSES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>
        <select value={priorityFilter} onChange={(e) => onPriorityFilterChange(e.target.value)} style={{ fontSize: 13 }}>
          <option value="all">Tüm öncelikler</option>
          {PRIORITIES.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
        </select>
        <select value={slaFilter} onChange={(e) => onSlaFilterChange(e.target.value)} style={{ fontSize: 13 }}>
          <option value="all">Tüm SLA durumları</option>
          <option value="gecikti">Gecikti</option>
          <option value="yaklasiyor">Yaklaşıyor</option>
          <option value="zamaninda">Zamanında</option>
        </select>
        <DateRangeFilter from={fromDate} to={toDate} onFromChange={onFromDateChange} onToChange={onToDateChange} />
      </div>
      {sorted.length === 0 ? (
        totalCount === 0 ? (
          <div style={{ background: "var(--surface-1)", borderRadius: 12, padding: "2rem 1.5rem", textAlign: "center" }}>
            <p style={{ fontWeight: 500, margin: "0 0 4px" }}>Henüz talep eklenmedi</p>
            <p style={{ fontSize: 14, color: "var(--text-secondary)", margin: "0 0 16px" }}>Müşteri portaldan yazdığında burada görünür, isterseniz kendiniz de bir talep oluşturabilirsiniz.</p>
            <button onClick={onCreateNew} style={{ background: "var(--fill-accent)", color: "var(--on-accent)", border: "none" }}>
              + Yeni Talep
            </button>
          </div>
        ) : (
          <p style={{ fontSize: 14, color: "var(--text-secondary)" }}>Aramayla eşleşen talep yok.</p>
        )
      ) : (
        <div>
          <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: "0 8px" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", padding: "0 12px", fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.3 }}>Talep</th>
                <th style={{ textAlign: "left", padding: "0 12px", fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.3, whiteSpace: "nowrap" }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>Öncelik <InfoTip text={PRIORITY_INFO_TEXT} /></span>
                </th>
                <th style={{ textAlign: "left", padding: "0 12px", fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.3, whiteSpace: "nowrap" }}>Durum</th>
                <th style={{ textAlign: "left", padding: "0 12px", fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.3, whiteSpace: "nowrap" }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>SLA <InfoTip text={SLA_INFO_TEXT} /></span>
                </th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((t) => {
                const c = customerById(t.customerId);
                const statusInfo = STATUSES.find((s) => s.id === t.status);
                const priorityInfo = PRIORITIES.find((p) => p.id === t.priority);
                const sla = getSlaStatus(t);
                return (
                  <tr key={t.id} style={{ background: "var(--surface-1)" }}>
                    <td onClick={() => onOpenTicket(t)} style={{ padding: "10px 12px", borderRadius: "var(--radius) 0 0 var(--radius)", cursor: "pointer" }}>
                      <p style={{ margin: 0, fontWeight: 500, fontSize: 14, display: "flex", alignItems: "center", gap: 6 }}>
                        {t.subject}
                        {unreadCountByTicket[t.id] > 0 && (
                          <Badge tone="accent">{unreadCountByTicket[t.id]} yeni mesaj</Badge>
                        )}
                      </p>
                      <p style={{ margin: 0, fontSize: 12, color: "var(--text-secondary)" }}>{c?.name || "Bilinmeyen müşteri"}</p>
                    </td>
                    <td style={{ padding: "10px 12px", whiteSpace: "nowrap" }}>
                      <span style={{ fontSize: 12, color: `var(--text-${PRIORITY_TONE[t.priority]})`, display: "flex", alignItems: "center", gap: 4 }}>
                        <i className="ti ti-point-filled" style={{ fontSize: 14 }} aria-hidden="true"></i>
                        {priorityInfo?.label}
                      </span>
                    </td>
                    <td style={{ padding: "10px 12px", whiteSpace: "nowrap" }}>
                      <Badge tone={STATUS_TONE[t.status] || "default"}>{statusInfo?.label}</Badge>
                    </td>
                    <td style={{ padding: "10px 12px", whiteSpace: "nowrap" }}>
                      <Badge tone={sla.tone}>{sla.label}</Badge>
                    </td>
                    <td style={{ padding: "10px 12px", borderRadius: "0 var(--radius) var(--radius) 0" }}>
                      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                        <IconButton icon="ti-message-circle" title="Detay ve mesaj geçmişi" onClick={() => onOpenTicket(t)} />
                        <IconButton icon="ti-edit" title="Düzenle" onClick={() => onEditTicket(t)} />
                        <IconButton icon="ti-trash" title="Sil" onClick={() => setConfirmDelete(t)} />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {confirmDelete && (
        <ConfirmDialog
          title="Talebi sil"
          message="Bu destek talebi çöp kutusuna taşınacak (mesaj geçmişi korunur), dilediğiniz zaman geri yükleyebilirsiniz."
          onConfirm={() => { onDeleteTicket(confirmDelete.id); setConfirmDelete(null); }}
          onClose={() => setConfirmDelete(null)}
        />
      )}
    </div>
  );
}

function TicketDetail({ ticket, customer, messages, onAddMessage, onStatusChange, onClose, sector }) {
  const [direction, setDirection] = useState("giden");
  const [content, setContent] = useState("");
  const [isInternal, setIsInternal] = useState(false);
  const [saving, setSaving] = useState(false);

  const sla = getSlaStatus(ticket);
  const priorityInfo = PRIORITIES.find((p) => p.id === ticket.priority);
  const sortedMessages = [...messages].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  // Yeni talep açılırken açıklama otomatik olarak ilk "gelen" mesaj da oluyor —
  // aynı metni iki kez göstermeyelim.
  const descriptionIsFirstMessage = sortedMessages.length > 0 && sortedMessages[0].content === ticket.description;

  const submit = async (e) => {
    e.preventDefault();
    if (!content.trim()) return;
    setSaving(true);
    await onAddMessage({ ticketId: ticket.id, direction, content: content.trim(), isInternal });
    setContent("");
    setIsInternal(false);
    setSaving(false);
  };

  return (
    <Modal title={ticket.subject} onClose={onClose}>
      <div style={{ marginBottom: 16 }}>
        <p style={{ margin: 0, fontSize: 13, color: "var(--text-secondary)" }}>
          {customer?.name || "Bilinmeyen müşteri"} {customer?.phone ? `· ${customer.phone}` : ""} {customer?.email ? `· ${customer.email}` : ""}
        </p>
        {ticket.description && !descriptionIsFirstMessage && (
          <p style={{ margin: "6px 0 0", fontSize: 13, color: "var(--text-secondary)" }}>{ticket.description}</p>
        )}
        <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>Öncelik: {priorityInfo?.label}</span>
          <Badge tone={sla.tone}>{sla.label}</Badge>
          <span style={{ fontSize: 11, color: "var(--text-muted)" }}>Hedef: {formatDateTime(sla.dueAt)}</span>
          <InfoTip text={SLA_INFO_TEXT} />
        </div>
      </div>

      <div style={{ marginBottom: 16 }}>
        <label style={{ fontSize: 13, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Durum</label>
        <select value={ticket.status} onChange={(e) => onStatusChange(ticket.id, e.target.value)} style={{ width: "100%" }}>
          {STATUSES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>
      </div>

      <p style={{ fontSize: 13, fontWeight: 500, margin: "0 0 8px", display: "flex", alignItems: "center", gap: 4 }}>
        Mesaj geçmişi <InfoTip text={DIRECTION_INFO_TEXT} />
      </p>
      <form onSubmit={submit} style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
          <select value={direction} onChange={(e) => setDirection(e.target.value)} style={{ width: 190 }}>
            {MESSAGE_DIRECTIONS.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
          </select>
          <input value={content} onChange={(e) => setContent(e.target.value)} placeholder={`Örn. ${supportExamples(sector).message}`} style={{ flex: 1 }} />
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--text-secondary)", marginBottom: 8, cursor: "pointer" }}>
          <input type="checkbox" checked={isInternal} onChange={(e) => setIsInternal(e.target.checked)} />
          Dahili not (müşteri portalında görünmez)
        </label>
        <button type="submit" disabled={saving || !content.trim()} style={{ background: "var(--fill-accent)", color: "var(--on-accent)", border: "none", fontSize: 13 }}>
          Ekle
        </button>
      </form>

      {sortedMessages.length === 0 ? (
        <p style={{ fontSize: 13, color: "var(--text-muted)" }}>Henüz mesaj yok.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, maxHeight: 260, overflowY: "auto" }}>
          {sortedMessages.map((m) => {
            const dirInfo = MESSAGE_DIRECTIONS.find((d) => d.id === m.direction) || MESSAGE_DIRECTIONS[0];
            return (
              <div key={m.id} style={{ display: "flex", gap: 10 }}>
                <i className={`ti ${m.isInternal ? "ti-lock" : dirInfo.icon}`} style={{ fontSize: 16, color: m.isInternal ? "var(--text-muted)" : "var(--text-accent)", marginTop: 2 }} aria-hidden="true"></i>
                <div>
                  <p style={{ margin: 0, fontSize: 13 }}>{m.content}</p>
                  <p style={{ margin: 0, fontSize: 11, color: "var(--text-muted)" }}>
                    {m.isInternal ? "Dahili not" : dirInfo.label} · {formatDateTime(m.createdAt)}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Modal>
  );
}

function KbList({
  articles,
  totalCount,
  categories,
  searchQuery,
  onSearchChange,
  categoryFilter,
  onCategoryFilterChange,
  fromDate,
  toDate,
  onFromDateChange,
  onToDateChange,
  onEdit,
  onDelete,
  onUseTemplate,
  sector,
}) {
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [showTemplates, setShowTemplates] = useState(totalCount === 0);
  const filtered = articles;
  const sectorLabel = SECTOR_PRESETS.find((p) => p.id === sector)?.label;
  const templates = KB_TEMPLATES_BY_SECTOR[sector] || KB_TEMPLATES_BY_SECTOR.genel;

  return (
    <div>
      <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "0 0 10px", display: "flex", alignItems: "center", gap: 4 }}>
        Sadece siz ve ekibiniz görür <InfoTip text={KB_INFO_TEXT} />
      </p>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12, gap: 8, flexWrap: "wrap" }}>
        <input
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Makale ara (başlık)..."
          style={{ flex: 1, minWidth: 200 }}
        />
        {categories.length > 0 && (
          <select value={categoryFilter} onChange={(e) => onCategoryFilterChange(e.target.value)} style={{ fontSize: 13 }}>
            <option value="all">Tüm kategoriler</option>
            {categories.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        )}
        <DateRangeFilter from={fromDate} to={toDate} onFromChange={onFromDateChange} onToChange={onToDateChange} />
        <button
          onClick={() => setShowTemplates((v) => !v)}
          style={{ background: "var(--surface-1)", border: "0.5px solid var(--border)", display: "flex", alignItems: "center", gap: 6 }}
        >
          <i className="ti ti-sparkles" style={{ fontSize: 16 }} aria-hidden="true"></i>
          Örnek şablonlar
        </button>
      </div>

      {showTemplates && (
        <div style={{ background: "var(--bg-accent)", borderRadius: "var(--radius)", padding: "0.9rem 1rem", marginBottom: 16 }}>
          <p style={{ margin: "0 0 8px", fontSize: 13, fontWeight: 500, color: "var(--text-accent)" }}>
            {sectorLabel ? `${sectorLabel} sektörüne uygun örnek makaleler` : "Hızlı başlangıç için örnek makaleler"} — "Kullan" ile taslağı açar, düzenleyip kaydedebilirsin.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {templates.map((t) => (
              <div key={t.title} style={{ background: "var(--surface-1)", borderRadius: "var(--radius)", padding: "0.6rem 0.8rem", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <p style={{ margin: 0, fontWeight: 500, fontSize: 13 }}>{t.title}</p>
                  <p style={{ margin: 0, fontSize: 11, color: "var(--text-secondary)" }}>{t.category}</p>
                </div>
                <button onClick={() => onUseTemplate(t)} style={{ fontSize: 12 }}>Kullan</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {filtered.length === 0 ? (
        <p style={{ fontSize: 14, color: "var(--text-secondary)" }}>
          {totalCount === 0 ? "Henüz makale eklenmedi." : "Aramayla eşleşen makale yok."}
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {filtered.map((a) => (
            <div key={a.id} style={{ background: "var(--surface-1)", borderRadius: "var(--radius)", padding: "0.75rem 1rem", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: 200 }}>
                <p style={{ margin: 0, fontWeight: 500, fontSize: 14 }}>{a.title}</p>
                <p style={{ margin: 0, fontSize: 12, color: "var(--text-secondary)" }}>
                  {a.category ? `${a.category} · ` : ""}{a.content.slice(0, 80)}{a.content.length > 80 ? "…" : ""}
                </p>
              </div>
              <IconButton icon="ti-edit" title="Düzenle" onClick={() => onEdit(a)} />
              <IconButton icon="ti-trash" title="Sil" onClick={() => setConfirmDelete(a)} />
            </div>
          ))}
        </div>
      )}

      {confirmDelete && (
        <ConfirmDialog
          title="Makaleyi sil"
          message={`"${confirmDelete.title}" makalesi çöp kutusuna taşınacak, dilediğiniz zaman geri yükleyebilirsiniz.`}
          onConfirm={() => { onDelete(confirmDelete.id); setConfirmDelete(null); }}
          onClose={() => setConfirmDelete(null)}
        />
      )}
    </div>
  );
}

function KbArticleForm({ initial, onSave, onCancel, sector }) {
  const [title, setTitle] = useState(initial?.title || "");
  const [category, setCategory] = useState(initial?.category || "");
  const [content, setContent] = useState(initial?.content || "");

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!title.trim() || !content.trim()) return;
        onSave({
          id: initial?.id || uid(),
          title: title.trim(),
          category: category.trim(),
          content: content.trim(),
          createdAt: initial?.createdAt || new Date().toISOString(),
        });
      }}
    >
      <div style={{ marginBottom: 12 }}>
        <label style={{ fontSize: 13, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Başlık</label>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={`Örn. ${supportExamples(sector).kbTitle}`} style={{ width: "100%" }} />
      </div>
      <div style={{ marginBottom: 12 }}>
        <label style={{ fontSize: 13, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Kategori</label>
        <input value={category} onChange={(e) => setCategory(e.target.value)} placeholder={`Örn. ${supportExamples(sector).kbCategory}`} style={{ width: "100%" }} />
      </div>
      <div style={{ marginBottom: 16 }}>
        <label style={{ fontSize: 13, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>İçerik</label>
        <textarea value={content} onChange={(e) => setContent(e.target.value)} placeholder="Yanıt metnini yazın" style={{ width: "100%", minHeight: 150, resize: "vertical" }} />
      </div>
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button type="button" onClick={onCancel}>Vazgeç</button>
        <button type="submit" style={{ background: "var(--fill-accent)", color: "var(--on-accent)", border: "none" }}>Kaydet</button>
      </div>
    </form>
  );
}

export default function Support({
  customers,
  tickets,
  ticketMessages,
  kbArticles,
  onSaveTicket,
  onDeleteTicket,
  onChangeTicketStatus,
  onAddTicketMessage,
  onSaveKbArticle,
  onDeleteKbArticle,
  onBulkImportTickets,
  onBulkImportKbArticles,
  initialViewTicketId,
  onConsumeInitialViewTicket,
  sector,
}) {
  const [supportView, setSupportView] = useState("talepler");
  const [showImportTickets, setShowImportTickets] = useState(false);
  const [showImportKbArticles, setShowImportKbArticles] = useState(false);
  const [showTicketForm, setShowTicketForm] = useState(false);
  const [editingTicket, setEditingTicket] = useState(null);
  const [viewingTicket, setViewingTicket] = useState(null);
  const [ticketStatusFilter, setTicketStatusFilter] = useState("all");
  const [ticketSearch, setTicketSearch] = useState("");
  const [ticketPriorityFilter, setTicketPriorityFilter] = useState("all");
  const [ticketSlaFilter, setTicketSlaFilter] = useState("all");
  const [ticketFromDate, setTicketFromDate] = useState("");
  const [ticketToDate, setTicketToDate] = useState("");
  const [showKbForm, setShowKbForm] = useState(false);
  const [editingKbArticle, setEditingKbArticle] = useState(null);
  const [kbSearch, setKbSearch] = useState("");
  const [kbCategoryFilter, setKbCategoryFilter] = useState("all");
  const [kbFromDate, setKbFromDate] = useState("");
  const [kbToDate, setKbToDate] = useState("");

  const customerById = (id) => customers.find((c) => c.id === id);

  useEffect(() => {
    if (!initialViewTicketId) return;
    const t = tickets.find((x) => x.id === initialViewTicketId);
    if (t) {
      setSupportView("talepler");
      setViewingTicket(t);
    }
    onConsumeInitialViewTicket?.();
  }, [initialViewTicketId]);

  const saveTicket = async (t) => {
    await onSaveTicket(t);
    setShowTicketForm(false);
    setEditingTicket(null);
  };

  const saveKbArticle = async (a) => {
    await onSaveKbArticle(a);
    setShowKbForm(false);
    setEditingKbArticle(null);
  };

  const currentTicket = viewingTicket ? tickets.find((t) => t.id === viewingTicket.id) || viewingTicket : null;
  const currentTicketMessages = currentTicket ? ticketMessages.filter((m) => m.ticketId === currentTicket.id) : [];

  const unreadCountByTicket = ticketMessages.reduce((acc, m) => {
    if (m.direction === "gelen" && !m.readAt) acc[m.ticketId] = (acc[m.ticketId] || 0) + 1;
    return acc;
  }, {});

  const ticketQuery = ticketSearch.trim().toLowerCase();
  const filteredTickets = tickets.filter((t) => {
    if (ticketStatusFilter !== "all" && t.status !== ticketStatusFilter) return false;
    if (ticketPriorityFilter !== "all" && t.priority !== ticketPriorityFilter) return false;
    if (!matchesDateRange(t.createdAt, ticketFromDate, ticketToDate)) return false;
    if (ticketSlaFilter !== "all") {
      const sla = getSlaStatus(t);
      if (ticketSlaFilter === "gecikti" && !sla.isBreached) return false;
      if (ticketSlaFilter === "yaklasiyor" && !sla.isApproaching) return false;
      if (ticketSlaFilter === "zamaninda" && (sla.isBreached || sla.isApproaching)) return false;
    }
    if (!ticketQuery) return true;
    return t.subject.toLowerCase().includes(ticketQuery) || (customerById(t.customerId)?.name || "").toLowerCase().includes(ticketQuery);
  });
  const ticketSlaRank = { danger: 0, warning: 1, success: 2 };
  const sortedTickets = [...filteredTickets].sort((a, b) => {
    const aOpen = !TERMINAL_STATUSES.includes(a.status);
    const bOpen = !TERMINAL_STATUSES.includes(b.status);
    if (aOpen !== bOpen) return aOpen ? -1 : 1;
    const aSla = ticketSlaRank[getSlaStatus(a).tone] ?? 3;
    const bSla = ticketSlaRank[getSlaStatus(b).tone] ?? 3;
    if (aSla !== bSla) return aSla - bSla;
    return new Date(a.createdAt) - new Date(b.createdAt);
  });

  const kbCategories = [...new Set(kbArticles.map((a) => a.category).filter(Boolean))];
  const kbQuery = kbSearch.trim().toLowerCase();
  const filteredKbArticles = kbArticles.filter((a) => {
    if (kbCategoryFilter !== "all" && a.category !== kbCategoryFilter) return false;
    if (!matchesDateRange(a.createdAt, kbFromDate, kbToDate)) return false;
    return a.title.toLowerCase().includes(kbQuery);
  });

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12, gap: 8, flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: 4, background: "var(--surface-1)", borderRadius: "var(--radius)", padding: 3 }}>
          <button
            onClick={() => setSupportView("talepler")}
            style={{ border: "none", background: supportView === "talepler" ? "var(--surface-2)" : "transparent", display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}
          >
            <i className="ti ti-ticket" style={{ fontSize: 15 }} aria-hidden="true"></i>
            Talepler
          </button>
          <button
            onClick={() => setSupportView("bilgi-bankasi")}
            style={{ border: "none", background: supportView === "bilgi-bankasi" ? "var(--surface-2)" : "transparent", display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}
          >
            <i className="ti ti-book" style={{ fontSize: 15 }} aria-hidden="true"></i>
            Bilgi Bankası
          </button>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {supportView === "talepler" ? (
            <>
              <button
                onClick={() =>
                  downloadXlsx(
                    "destek-talepleri.xlsx",
                    ["Müşteri", "Konu", "Öncelik", "Durum", "Oluşturulma tarihi"],
                    sortedTickets.map((t) => [
                      customerById(t.customerId)?.name || "",
                      t.subject,
                      PRIORITIES.find((p) => p.id === t.priority)?.label || t.priority,
                      STATUSES.find((s) => s.id === t.status)?.label || t.status,
                      t.createdAt ? new Date(t.createdAt).toLocaleDateString("tr-TR") : "",
                    ])
                  )
                }
                disabled={sortedTickets.length === 0}
                style={{ background: "var(--surface-1)", border: "0.5px solid var(--border)", display: "flex", alignItems: "center", gap: 6 }}
              >
                <i className="ti ti-download" style={{ fontSize: 16 }} aria-hidden="true"></i>
                Dışa aktar
              </button>
              <button
                onClick={() => setShowImportTickets(true)}
                style={{ background: "var(--surface-1)", border: "0.5px solid var(--border)", display: "flex", alignItems: "center", gap: 6 }}
              >
                <i className="ti ti-upload" style={{ fontSize: 16 }} aria-hidden="true"></i>
                İçe aktar
              </button>
              <button
                onClick={() => { setEditingTicket(null); setShowTicketForm(true); }}
                disabled={customers.length === 0}
                style={{ background: "var(--fill-accent)", color: "var(--on-accent)", border: "none", display: "flex", alignItems: "center", gap: 6 }}
              >
                <i className="ti ti-plus" style={{ fontSize: 16 }} aria-hidden="true"></i>
                Talep ekle
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() =>
                  downloadXlsx(
                    "bilgi-bankasi.xlsx",
                    ["Başlık", "Kategori", "İçerik"],
                    filteredKbArticles.map((a) => [a.title, a.category, a.content])
                  )
                }
                disabled={filteredKbArticles.length === 0}
                style={{ background: "var(--surface-1)", border: "0.5px solid var(--border)", display: "flex", alignItems: "center", gap: 6 }}
              >
                <i className="ti ti-download" style={{ fontSize: 16 }} aria-hidden="true"></i>
                Dışa aktar
              </button>
              <button
                onClick={() => setShowImportKbArticles(true)}
                style={{ background: "var(--surface-1)", border: "0.5px solid var(--border)", display: "flex", alignItems: "center", gap: 6 }}
              >
                <i className="ti ti-upload" style={{ fontSize: 16 }} aria-hidden="true"></i>
                İçe aktar
              </button>
              <button
                onClick={() => { setEditingKbArticle(null); setShowKbForm(true); }}
                style={{ background: "var(--fill-accent)", color: "var(--on-accent)", border: "none", display: "flex", alignItems: "center", gap: 6 }}
              >
                <i className="ti ti-plus" style={{ fontSize: 16 }} aria-hidden="true"></i>
                Makale ekle
              </button>
            </>
          )}
        </div>
      </div>

      {supportView === "talepler" && customers.length === 0 && (
        <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 12 }}>Talep eklemeden önce bir müşteri oluşturun.</p>
      )}

      {supportView === "talepler" ? (
        <TicketList
          tickets={sortedTickets}
          totalCount={tickets.length}
          customers={customers}
          unreadCountByTicket={unreadCountByTicket}
          statusFilter={ticketStatusFilter}
          onFilterChange={setTicketStatusFilter}
          searchQuery={ticketSearch}
          onSearchChange={setTicketSearch}
          priorityFilter={ticketPriorityFilter}
          onPriorityFilterChange={setTicketPriorityFilter}
          slaFilter={ticketSlaFilter}
          onSlaFilterChange={setTicketSlaFilter}
          fromDate={ticketFromDate}
          toDate={ticketToDate}
          onFromDateChange={setTicketFromDate}
          onToDateChange={setTicketToDate}
          onOpenTicket={setViewingTicket}
          onEditTicket={(t) => { setEditingTicket(t); setShowTicketForm(true); }}
          onDeleteTicket={onDeleteTicket}
          onCreateNew={() => { setEditingTicket(null); setShowTicketForm(true); }}
        />
      ) : (
        <KbList
          articles={filteredKbArticles}
          totalCount={kbArticles.length}
          categories={kbCategories}
          searchQuery={kbSearch}
          onSearchChange={setKbSearch}
          categoryFilter={kbCategoryFilter}
          onCategoryFilterChange={setKbCategoryFilter}
          fromDate={kbFromDate}
          toDate={kbToDate}
          onFromDateChange={setKbFromDate}
          onToDateChange={setKbToDate}
          onEdit={(a) => { setEditingKbArticle(a); setShowKbForm(true); }}
          onDelete={onDeleteKbArticle}
          onUseTemplate={(t) => { setEditingKbArticle(t); setShowKbForm(true); }}
          sector={sector}
        />
      )}

      {showTicketForm && (
        <Modal title={editingTicket ? "Talebi düzenle" : "Yeni destek talebi"} onClose={() => { setShowTicketForm(false); setEditingTicket(null); }}>
          <TicketForm customers={customers} initial={editingTicket} onSave={saveTicket} onCancel={() => { setShowTicketForm(false); setEditingTicket(null); }} sector={sector} />
        </Modal>
      )}

      {showKbForm && (
        <Modal title={editingKbArticle?.id ? "Makaleyi düzenle" : "Yeni makale"} onClose={() => { setShowKbForm(false); setEditingKbArticle(null); }}>
          <KbArticleForm initial={editingKbArticle} onSave={saveKbArticle} onCancel={() => { setShowKbForm(false); setEditingKbArticle(null); }} sector={sector} />
        </Modal>
      )}

      {showImportTickets && (
        <ImportModal
          entityType="tickets"
          entityLabel="Destek Talepleri"
          fieldDefs={TICKET_IMPORT_FIELDS}
          customers={customers}
          onImport={onBulkImportTickets}
          onClose={() => setShowImportTickets(false)}
        />
      )}

      {showImportKbArticles && (
        <ImportModal
          entityType="kb_articles"
          entityLabel="Bilgi Bankası"
          fieldDefs={KB_IMPORT_FIELDS}
          onImport={onBulkImportKbArticles}
          onClose={() => setShowImportKbArticles(false)}
        />
      )}

      {currentTicket && (
        <TicketDetail
          ticket={currentTicket}
          customer={customerById(currentTicket.customerId)}
          messages={currentTicketMessages}
          onAddMessage={onAddTicketMessage}
          onStatusChange={onChangeTicketStatus}
          onClose={() => setViewingTicket(null)}
          sector={sector}
        />
      )}
    </div>
  );
}
