import React, { useState } from "react";
import { Badge, Modal, ConfirmDialog, IconButton, InfoTip } from "./shared";

export const STAGES = [
  { id: "ilk_gorusme", label: "İlk görüşme" },
  { id: "teklif", label: "Teklif verildi" },
  { id: "muzakere", label: "Müzakere" },
  { id: "kazanildi", label: "Kazanıldı" },
  { id: "kaybedildi", label: "Kaybedildi" },
];

export const STAGE_LABELS_BIREYSEL = {
  ilk_gorusme: "İlgileniyor",
  teklif: "Planlandı",
  muzakere: "Onay bekleniyor",
  kazanildi: "Tamamlandı",
  kaybedildi: "İptal",
};

// Şirketin sektörüne göre satış hunisi aşama isimlerini, önerilen etiketleri ve
// sektöre özel alanları hazır getiren şablonlar. "Genel" bilinçli olarak boş
// stageLabels/customFields ile varsayılana düşer (no-op).
export const SECTOR_PRESETS = [
  {
    id: "emlak",
    label: "Emlak",
    icon: "ti-home",
    stageLabels: {
      ilk_gorusme: "İlk görüşme",
      teklif: "Teklif sunuldu",
      muzakere: "Pazarlık",
      kazanildi: "Satış/Kiralama tamamlandı",
      kaybedildi: "Vazgeçildi",
    },
    tags: ["Sıcak lead", "Alıcı adayı", "Kiracı", "Yatırımcı", "Kredi bekliyor", "Ekspertiz bekleniyor"],
    customFields: [
      { entity: "deal", key: "mulk_tipi", label: "Mülk Tipi", type: "select", options: ["Daire", "Villa", "Arsa", "İşyeri"] },
      { entity: "deal", key: "islem_turu", label: "İşlem Türü", type: "select", options: ["Satış", "Kiralama"] },
      { entity: "deal", key: "metrekare", label: "Metrekare (m²)", type: "number" },
      { entity: "deal", key: "gorusme_tarihi", label: "Görüşme/Randevu Tarihi", type: "datetime" },
      { entity: "customer", key: "butce_araligi", label: "Bütçe / Kira aralığı", type: "text" },
      { entity: "deal", key: "ilan_no", label: "İlan / Referans No", type: "text" },
    ],
    stageGuides: {
      ilk_gorusme: "Müşterinin bütçesini ve tercih ettiği bölgeyi netleştirin.",
      teklif: "Mülkün ilan/referans bilgisini ve fotoğraflarını paylaşın.",
      muzakere: "Kredi kullanılacaksa ekspertiz/kredi sürecini takip edin.",
      kazanildi: "Tapu/sözleşme işlemlerini ve komisyon tahsilatını planlayın.",
      kaybedildi: "Vazgeçme nedenini not düşün (fiyat, bölge, zamanlama vb.).",
    },
  },
  {
    id: "dijital_ajans",
    label: "Dijital Ajans",
    icon: "ti-device-desktop-analytics",
    stageLabels: {
      ilk_gorusme: "Keşif görüşmesi",
      teklif: "Teklif/Brief gönderildi",
      muzakere: "Revizyon görüşülüyor",
      kazanildi: "Proje onaylandı",
      kaybedildi: "Kaybedildi",
    },
    tags: ["Aylık abonelik", "Proje bazlı", "Reklam yönetimi", "Web tasarım", "SEO", "Rapor gecikti"],
    customFields: [
      { entity: "deal", key: "hizmet_turu", label: "Hizmet Türü", type: "select", options: ["Sosyal medya yönetimi", "Web tasarım", "SEO", "Reklam yönetimi (Ads)", "İçerik üretimi"] },
      { entity: "deal", key: "sozlesme_suresi", label: "Sözleşme Süresi", type: "select", options: ["Tek seferlik", "Aylık", "3 Aylık", "Yıllık"] },
      { entity: "deal", key: "aylik_butce", label: "Aylık Reklam Bütçesi (TL)", type: "number" },
      { entity: "deal", key: "gorusme_tarihi", label: "Keşif Görüşmesi Tarihi", type: "datetime" },
      { entity: "customer", key: "web_sitesi", label: "Web sitesi", type: "text" },
      { entity: "deal", key: "raporlama_sikligi", label: "Raporlama Sıklığı", type: "select", options: ["Haftalık", "Aylık"] },
    ],
    stageGuides: {
      ilk_gorusme: "Müşterinin hedeflerini ve bütçesini netleştirin.",
      teklif: "Brief/teklifi net kapsam ve teslim tarihleriyle gönderin.",
      muzakere: "Revizyon taleplerini yazılı olarak not alın.",
      kazanildi: "Raporlama sıklığını ve iletişim kanalını müşteriyle netleştirin.",
      kaybedildi: "Kaybetme nedenini not alın (fiyat, kapsam, zamanlama vb.).",
    },
  },
  {
    id: "saglik_klinik",
    label: "Sağlık / Klinik",
    icon: "ti-stethoscope",
    stageLabels: {
      ilk_gorusme: "İlk muayene / Danışma",
      teklif: "Tedavi planı sunuldu",
      muzakere: "Onay bekleniyor",
      kazanildi: "Tedavi tamamlandı",
      kaybedildi: "Vazgeçti",
    },
    tags: ["Yeni hasta", "Kontrol randevusu", "Takip gerekiyor", "Sigortalı", "Acil", "Gelmedi"],
    customFields: [
      { entity: "customer", key: "randevu_turu", label: "Randevu Türü", type: "select", options: ["Muayene", "Kontrol", "Tedavi", "Danışmanlık"], audience: "bireysel" },
      { entity: "customer", key: "sigorta_durumu", label: "Sigorta/SGK Durumu", type: "select", options: ["Özel sigorta", "SGK", "Sigortasız"], audience: "bireysel" },
      { entity: "customer", key: "dogum_tarihi", label: "Doğum Tarihi", type: "date", audience: "bireysel" },
      { entity: "deal", key: "tedavi_hizmet", label: "Tedavi / Hizmet", type: "text" },
      { entity: "deal", key: "randevu_tarihi", label: "Randevu Tarihi", type: "datetime" },
      { entity: "deal", key: "tetkik_turu", label: "İstenen Tetkik", type: "text" },
    ],
    stageGuides: {
      ilk_gorusme: "Şikayeti/geçmişi not alın, gerekiyorsa tetkik isteyin.",
      teklif: "Tedavi planını ve maliyetini hastaya açıkça anlatın.",
      muzakere: "Randevudan bir gün önce hatırlatma yapmayı unutmayın.",
      kazanildi: "Kontrol randevusu gerekiyorsa hatırlatma ekleyin.",
      kaybedildi: "Vazgeçme nedenini not alın; hasta randevuya gelmediyse \"Gelmedi\" etiketini ekleyin — Pano'daki oran bunu kullanıyor.",
    },
  },
  {
    id: "uretim_satis",
    label: "Üretim / Satış",
    icon: "ti-truck-delivery",
    stageLabels: {
      ilk_gorusme: "İlk temas",
      teklif: "Fiyat teklifi verildi",
      muzakere: "Sipariş görüşülüyor",
      kazanildi: "Sipariş alındı",
      kaybedildi: "Sipariş kaybedildi",
    },
    tags: ["Toptan", "Perakende", "Tekrarlayan müşteri", "Yeni bayi", "İhracat", "Numune gönderildi"],
    customFields: [
      { entity: "deal", key: "urun_grubu", label: "Ürün / Ürün Grubu", type: "text" },
      { entity: "deal", key: "siparis_miktari", label: "Sipariş Miktarı", type: "number" },
      { entity: "customer", key: "odeme_vadesi", label: "Ödeme Vadesi", type: "select", options: ["Peşin", "30 gün", "60 gün", "90 gün"], audience: "kurumsal" },
      { entity: "deal", key: "teslimat_tarihi", label: "Teslimat Tarihi", type: "date" },
      { entity: "deal", key: "sevkiyat_durumu", label: "Sevkiyat Durumu", type: "select", options: ["Hazırlanıyor", "Kargoya verildi", "Teslim edildi"] },
    ],
    stageGuides: {
      ilk_gorusme: "Ürün ihtiyacını ve tahmini miktarı netleştirin.",
      teklif: "Fiyat teklifini miktar/vade seçenekleriyle birlikte sunun.",
      muzakere: "Ödeme vadesi ve teslimat tarihini netleştirin.",
      kazanildi: "Sevkiyatı planlayın, sevkiyat durumunu güncel tutun.",
      kaybedildi: "Kaybetme nedenini not alın (fiyat, vade, rakip vb.).",
    },
  },
  {
    id: "hizmet_danismanlik",
    label: "Hizmet / Danışmanlık",
    icon: "ti-briefcase",
    stageLabels: {
      ilk_gorusme: "Ön görüşme",
      teklif: "Teklif gönderildi",
      muzakere: "Kapsam görüşülüyor",
      kazanildi: "Anlaşma imzalandı",
      kaybedildi: "Kaybedildi",
    },
    tags: ["Kurumsal danışmanlık", "Bireysel koçluk", "Tek seferlik", "Sürekli hizmet", "Referans", "Sözleşme bekleniyor"],
    customFields: [
      { entity: "deal", key: "ucretlendirme_modeli", label: "Ücretlendirme Modeli", type: "select", options: ["Saatlik", "Proje bazlı", "Aylık paket"] },
      { entity: "deal", key: "teslimat_tarihi", label: "Rapor/Teslimat Tarihi", type: "date" },
      { entity: "deal", key: "gorusme_tarihi", label: "Görüşme Tarihi", type: "datetime" },
      { entity: "customer", key: "sirket_buyuklugu", label: "Şirket Büyüklüğü", type: "select", options: ["1-10 çalışan", "11-50 çalışan", "51-200 çalışan", "200+ çalışan"], audience: "kurumsal" },
      { entity: "deal", key: "proje_kapsami", label: "Proje Kapsamı", type: "text" },
    ],
    stageGuides: {
      ilk_gorusme: "İhtiyacı ve hedefleri netleştirin.",
      teklif: "Kapsamı ve ücretlendirme modelini net yazın.",
      muzakere: "Kapsam/teslim tarihi değişikliklerini yazılı onaylatın.",
      kazanildi: "Sözleşmeyi imzalatın, teslim tarihini takvime ekleyin.",
      kaybedildi: "Kaybetme nedenini not alın.",
    },
  },
  {
    id: "perakende",
    label: "Perakende",
    icon: "ti-shopping-cart",
    stageLabels: {
      ilk_gorusme: "İlk temas",
      teklif: "Teklif/Kampanya sunuldu",
      muzakere: "Pazarlık",
      kazanildi: "Satış tamamlandı",
      kaybedildi: "Vazgeçti",
    },
    tags: ["Sadık müşteri", "Kampanya", "Online sipariş", "Mağaza içi", "İade talebi"],
    customFields: [
      { entity: "deal", key: "satis_kanali", label: "Satış Kanalı", type: "select", options: ["Mağaza", "Online", "Telefon"] },
      { entity: "customer", key: "uyelik_no", label: "Üyelik / Sadakat Kartı No", type: "text", audience: "bireysel" },
      { entity: "customer", key: "dogum_gunu", label: "Doğum Günü", type: "date", audience: "bireysel" },
      { entity: "deal", key: "urun_kategorisi", label: "Ürün Kategorisi", type: "text" },
    ],
    stageGuides: {
      ilk_gorusme: "Müşterinin aradığı ürün/kategoriyi not alın.",
      teklif: "Uygun kampanya/indirim varsa bilgilendirin.",
      muzakere: "Son fiyat/ödeme seçeneklerini netleştirin.",
      kazanildi: "Fiş/fatura bilgisini kaydedin, sadakat programına ekleyin.",
      kaybedildi: "Vazgeçme nedenini not alın (fiyat, stok, tercih değişikliği vb.).",
    },
  },
  {
    id: "guzellik_bakim",
    label: "Güzellik & Bakım",
    icon: "ti-scissors",
    stageLabels: {
      ilk_gorusme: "Randevu talebi",
      teklif: "Randevu planlandı",
      muzakere: "Hatırlatma gönderildi",
      kazanildi: "Hizmet tamamlandı",
      kaybedildi: "Randevuya gelmedi / iptal",
    },
    tags: ["Yeni randevu", "Sadık müşteri", "Hatırlatma gerekiyor", "Geldi", "Gelmedi"],
    customFields: [
      { entity: "deal", key: "hizmet_turu", label: "Hizmet Türü", type: "select", options: ["Manikür/Pedikür", "Saç Kesimi/Boyama", "Lazer Epilasyon", "Cilt Bakımı", "Makyaj", "Diğer"] },
      { entity: "deal", key: "randevu_tarihi", label: "Randevu Tarihi", type: "datetime" },
      { entity: "deal", key: "seans_no", label: "Seans No (paket hizmetlerde)", type: "number" },
      { entity: "customer", key: "tercih_edilen_uzman", label: "Tercih Edilen Uzman/Personel", type: "text", audience: "bireysel" },
      { entity: "customer", key: "alerji_notu", label: "Alerji / Cilt Notu", type: "text", audience: "bireysel" },
      { entity: "deal", key: "hizmet_suresi_dk", label: "Hizmet Süresi (dk)", type: "number" },
    ],
    stageGuides: {
      ilk_gorusme: "Hizmet türünü ve tahmini süreyi netleştirip randevu saatini onaylayın.",
      teklif: "Randevu saatini müşteriye tekrar teyit edin.",
      muzakere: "Randevudan bir gün önce hatırlatma mesajı/arama yapın — randevuya gelmeme riskini azaltır.",
      kazanildi: "Paket hizmetse sonraki seans için hatırlatma ekleyin.",
      kaybedildi: "Müşteri randevuya gelmediyse \"Gelmedi\" etiketini ekleyin — Pano'daki oran bunu kullanıyor.",
    },
  },
  {
    id: "spor_merkezi",
    label: "Spor Merkezi",
    icon: "ti-barbell",
    stageLabels: {
      ilk_gorusme: "Deneme dersi",
      teklif: "Üyelik teklifi sunuldu",
      muzakere: "Paket görüşülüyor",
      kazanildi: "Üye oldu",
      kaybedildi: "Üye olmadı",
    },
    tags: ["Yeni üye", "Deneme üyeliği", "Üyelik yenileme", "PT (Personal Training)", "Dondurulmuş üyelik"],
    customFields: [
      { entity: "deal", key: "uyelik_paketi", label: "Üyelik Paketi", type: "select", options: ["Aylık", "3 Aylık", "6 Aylık", "Yıllık", "PT Paketi"] },
      { entity: "deal", key: "deneme_dersi_tarihi", label: "Deneme Dersi Tarihi", type: "datetime" },
      { entity: "deal", key: "uyelik_bitis_tarihi", label: "Üyelik Bitiş Tarihi", type: "date", audience: "bireysel" },
      { entity: "customer", key: "hedef", label: "Hedef (kilo verme, kas kütlesi vb.)", type: "text", audience: "bireysel" },
      { entity: "deal", key: "antrenor", label: "Antrenör/Eğitmen", type: "text" },
    ],
    stageGuides: {
      ilk_gorusme: "Deneme dersi saatini netleştirin, hedefini not alın.",
      teklif: "Uygun üyelik paketini önerin.",
      muzakere: "Ödeme planı/taksit seçeneklerini netleştirin.",
      kazanildi: "Üyelik bitiş tarihini girin, yenileme hatırlatması ekleyin.",
      kaybedildi: "Üye olmama nedenini not alın (fiyat, konum, program vb.).",
    },
  },
  {
    id: "egitim_kurs",
    label: "Eğitim / Kurs Merkezi",
    icon: "ti-school",
    stageLabels: {
      ilk_gorusme: "Deneme dersi",
      teklif: "Kayıt teklifi sunuldu",
      muzakere: "Kayıt görüşülüyor",
      kazanildi: "Kursa kayıt oldu",
      kaybedildi: "Kayıt olmadı",
    },
    tags: ["Yeni öğrenci", "Deneme dersi", "Kayıt yenileme", "Burslu/İndirimli", "Kurs tamamlandı"],
    customFields: [
      { entity: "deal", key: "kurs_programi", label: "Kurs / Program", type: "select", options: ["Yabancı Dil", "Sürücü Kursu", "Müzik/Sanat", "Akademik Destek", "Mesleki Kurs", "Diğer"] },
      { entity: "deal", key: "deneme_dersi_tarihi", label: "Deneme Dersi Tarihi", type: "datetime" },
      { entity: "deal", key: "kurs_bitis_tarihi", label: "Kurs Bitiş Tarihi", type: "date", audience: "bireysel" },
      { entity: "customer", key: "veli_bilgisi", label: "Veli Adı / Telefonu (varsa)", type: "text", audience: "bireysel" },
      { entity: "deal", key: "egitmen", label: "Eğitmen", type: "text" },
    ],
    stageGuides: {
      ilk_gorusme: "Deneme dersi saatini netleştirin.",
      teklif: "Kurs programını ve ücretini net anlatın.",
      muzakere: "Ödeme planı/taksit seçeneklerini netleştirin.",
      kazanildi: "Kurs bitiş tarihini girin, ders programını paylaşın.",
      kaybedildi: "Kayıt olmama nedenini not alın.",
    },
  },
  {
    id: "otel",
    label: "Otel",
    icon: "ti-bed",
    stageLabels: {
      ilk_gorusme: "Rezervasyon talebi",
      teklif: "Uygunluk/Fiyat bildirildi",
      muzakere: "Kapora bekleniyor",
      kazanildi: "Rezervasyon onaylandı",
      kaybedildi: "İptal / Vazgeçti",
    },
    tags: ["Yeni rezervasyon", "Kapora alındı", "Grup rezervasyonu", "Tekrar eden misafir", "Erken giriş/Geç çıkış talebi", "İptal"],
    customFields: [
      { entity: "deal", key: "oda_tipi", label: "Oda Tipi", type: "select", options: ["Standart Oda", "Deluxe Oda", "Suit", "Aile Odası"] },
      { entity: "deal", key: "giris_tarihi", label: "Giriş Tarihi", type: "datetime" },
      { entity: "deal", key: "cikis_tarihi", label: "Çıkış Tarihi", type: "date" },
      { entity: "deal", key: "kisi_sayisi", label: "Kişi Sayısı", type: "number" },
      { entity: "deal", key: "kapora_durumu", label: "Kapora Durumu", type: "select", options: ["Alınmadı", "Kısmi alındı", "Tamamı alındı"] },
      { entity: "customer", key: "ozel_istek", label: "Özel İstek (alerji, diyet, kutlama vb.)", type: "text" },
    ],
    stageGuides: {
      ilk_gorusme: "Giriş/çıkış tarihini ve kişi sayısını netleştirip uygun oda tipini kontrol edin.",
      teklif: "Oda fiyatını ve varsa kahvaltı/ekstra hizmetleri net belirtin.",
      muzakere: "Rezervasyonu kesinleştirmek için kapora/ön ödeme isteyin.",
      kazanildi: "Giriş günü öncesi hatırlatma yapın, varsa özel isteği resepsiyona iletin.",
      kaybedildi: "Vazgeçme nedenini not alın (fiyat, müsaitlik, tarih değişikliği vb.).",
    },
  },
  {
    id: "sanayi_esnaf",
    label: "Sanayi Esnafı",
    icon: "ti-tool",
    stageLabels: {
      ilk_gorusme: "Arıza tespiti / Keşif",
      teklif: "Tamir teklifi verildi",
      muzakere: "Onay bekleniyor",
      kazanildi: "İşlem tamamlandı",
      kaybedildi: "Vazgeçildi",
    },
    tags: ["Garantili işçilik", "Acil", "Sigorta işi", "Yedek parça bekleniyor", "Teslim edildi", "Fiyat onayı bekleniyor"],
    customFields: [
      { entity: "deal", key: "arac_ekipman_bilgisi", label: "Araç/Ekipman Bilgisi (Plaka, Marka, Model)", type: "text" },
      { entity: "deal", key: "servis_turu", label: "Servis Türü", type: "select", options: ["Oto Tamir", "Oto Boya", "Kaynak İşi", "Elektrik İşi", "Tornacılık", "Diğer"] },
      { entity: "deal", key: "parca_durumu", label: "Yedek Parça Durumu", type: "select", options: ["Stokta var", "Sipariş verildi", "Bekleniyor"] },
      { entity: "deal", key: "teslim_tarihi", label: "Tahmini Teslim Tarihi", type: "date" },
      { entity: "deal", key: "tahmini_ucret", label: "Tahmini Ücret (TL)", type: "number" },
    ],
    stageGuides: {
      ilk_gorusme: "Arıza/ihtiyaç net değilse önce keşif için randevu netleştirin.",
      teklif: "Yedek parça durumunu kontrol edin, bekleme süresi varsa müşteriye bildirin.",
      muzakere: "Tahmini teslim tarihini netleştirip müşteriye bildirin.",
      kazanildi: "Teslim öncesi son kontrolü yapın, garanti bilgisini paylaşın.",
      kaybedildi: "Vazgeçme nedenini not düşün.",
    },
  },
  {
    id: "genel",
    label: "Genel",
    icon: "ti-building-store",
    stageLabels: {},
    tags: ["Yeni", "Takipte", "VIP"],
    customFields: [],
  },
];

// Şirketin sektörüne göre (varsa) ve kurumsal/bireysel müşteri tipine göre aşama
// görünen metnini belirler. Aşama id'leri hiç değişmez — sadece bu fonksiyonun
// ürettiği metin değişir, iş mantığı hep id üzerinden çalışır.
// Sektör override'ı önce gelir: bir sektör (örn. Güzellik & Bakım) bir aşamayı
// özelleştirmişse, o etiket müşteri kurumsal da olsa bireysel de olsa geçerlidir —
// çünkü sektörün kendi dili (örn. "Randevu planlandı") ikisi için de doğru. Sektör
// o aşamayı özelleştirmemişse (örn. "Genel"), bireysel/kurumsal ayrımı devam eder.
export function stageLabel(stageId, customerType, sector) {
  const preset = SECTOR_PRESETS.find((p) => p.id === sector);
  if (preset?.stageLabels?.[stageId]) return preset.stageLabels[stageId];
  if (customerType === "bireysel") return STAGE_LABELS_BIREYSEL[stageId] || stageId;
  return STAGES.find((s) => s.id === stageId)?.label || stageId;
}

// Bazı sektörlerde kayıt gerçekten bir randevu/hizmet slotudur (teklif değil) —
// bu sektörlerde uygulamanın dört bir yanındaki "teklif" kelimesi "randevu" olur.
// Diğer sektörlerde (Emlak, Dijital Ajans vb.) görüşme/randevu sadece bir ara adım,
// asıl kayıt hâlâ bir tekliftir.
export function isAppointmentSector(sector) {
  return sector === "guzellik_bakim" || sector === "saglik_klinik";
}

// Müşterinin portaldan kendi randevusunu alabildiği sektörler — isAppointmentSector()'dan
// KASITLI OLARAK AYRI bir bayrak: Emlak/Dijital Ajans/Hizmet-Danışmanlık'ta da bir
// "görüşme tarihi" alanı var ve müşteri kendi görüşme saatini seçebilmeli, ama bu üç
// sektörde asıl kayıt hâlâ bir tekliftir (dealWordKind/isIndividualFocusedSector
// değişmiyor) — sadece randevu alma YETENEĞİ ekleniyor, "randevu" diline geçilmiyor.
export function supportsSelfBooking(sector) {
  return isAppointmentSector(sector) || sector === "emlak" || sector === "dijital_ajans" || sector === "hizmet_danismanlik" || sector === "otel";
}

// Kendi kendine randevu alma YETENEĞİ tek tip değil — çoğu sektörde "işletme =
// tek kaynak, aynı anda tek randevu" varsayımı doğru (Müsaitlik Saatleri: gün/saat
// + slot süresi, "slot" modeli). Otel'de ise doğru model bu değil: bir otelin aynı
// tipte birden fazla odası olabilir, müsaitlik saat slotuna değil GİRİŞ/ÇIKIŞ TARİH
// ARALIĞINA ve oda tipi STOKUNA göre hesaplanır ("inventory" modeli). Bu ayrım
// olmadan Otel'de slot mantığı zorlanırsa, odalar boş olsa bile ikinci bir
// rezervasyon "çakışma" sayılıp yanlışlıkla engellenir.
export function bookingModel(sector) {
  if (sector === "otel") return "inventory";
  if (supportsSelfBooking(sector)) return "slot";
  return null;
}

// Grup Dersleri (haftalık program, kapasite, kendi kendine kayıt/iptal) hem Spor
// Merkezi'nde (üyeler) hem Eğitim/Kurs Merkezi'nde (öğrenciler) aynı ihtiyaca karşılık
// geliyor.
export function supportsGroupClasses(sector) {
  return sector === "spor_merkezi" || sector === "egitim_kurs";
}

// Seans/paket satışı (10 seanslık PT paketi, epilasyon paketi, kurs dönemi, fizyoterapi
// paketi vb.) bu sektörlerde doğal bir satış şekli — diğerlerinde (Emlak, Üretim/Satış,
// Perakende vb.) hiç karşılığı olmadığı için teklif formunda gereksiz bir alan olarak kalıyordu.
export function supportsSessionPackages(sector) {
  return sector === "spor_merkezi" || sector === "egitim_kurs" || sector === "guzellik_bakim" || sector === "saglik_klinik";
}

// Bir teklifin o anki aşaması için sektöre özel, salt bilgilendirici bir
// "yapılacaklar" rehberi — kayıt/işaretleme tutmuyor, sadece Teklif formunda
// gösterilecek kısa bir metin. Preset'i (veya o aşama için tanımlı rehberi)
// olmayan sektörlerde/aşamalarda null döner, hiçbir şey gösterilmez.
export function stageGuide(stageId, sector) {
  const preset = SECTOR_PRESETS.find((p) => p.id === sector);
  return preset?.stageGuides?.[stageId] || null;
}

// Bu sektörlerde müşteri neredeyse hiç kurumsal olmaz (kişisel bakım/üyelik
// hizmetleri) — yeni müşteri eklerken "Kurumsal" seçeneği kaldırılmıyor
// (istisnai durumlar için, örn. bir firmanın toplu üyelik alması), ama
// varsayılan müşteri tipi "Bireysel" olur.
export function isIndividualFocusedSector(sector) {
  return isAppointmentSector(sector) || sector === "spor_merkezi" || sector === "egitim_kurs" || sector === "otel";
}

// Kayıt kelimesinin dört hâli: Spor Merkezi'nde kayıt bir üyeliktir (ne randevu
// ne teklif), randevu sektörlerinde (Güzellik & Bakım, Sağlık/Klinik) randevudur,
// Otel'de rezervasyondur (oda-stoklu, bkz. bookingModel — tarih aralığı + oda
// tipi asıl kayıt, "teklif" veya "randevu" değil), geri kalanında tekliftir.
// Bireysel müşteri görünümü TEK BAŞINA "randevu"ya çevirmez — örn. Emlak'ta
// bireysel bir alıcıya sunulan şey de yine bir tekliftir.
export function dealWordKind(sector) {
  if (sector === "spor_merkezi") return "uyelik";
  if (isAppointmentSector(sector)) return "randevu";
  if (sector === "otel") return "rezervasyon";
  return "teklif";
}

const SUPPORT_EXAMPLES = {
  emlak: { subject: "Sözleşmemle ilgili bir sorum var", message: "Kira sözleşmesi taslağı müşteriye iletildi", kbTitle: "Kira sözleşmesi nasıl hazırlanır?", kbCategory: "Sözleşme, Ödeme, Ekspertiz" },
  dijital_ajans: { subject: "Reklam raporunda bir tutarsızlık var", message: "Güncel reklam raporu müşteriye iletildi", kbTitle: "Reklam raporu ne zaman gelir?", kbCategory: "Raporlama, Sözleşme, Teknik" },
  saglik_klinik: { subject: "Randevumu değiştirmek istiyorum", message: "Yeni randevu saati müşteriye iletildi", kbTitle: "Randevumu nasıl değiştiririm?", kbCategory: "Randevu, Ödeme, Sigorta" },
  uretim_satis: { subject: "Siparişim gecikti", message: "Kargo takip numarası müşteriye iletildi", kbTitle: "Kargo takibi nasıl yapılır?", kbCategory: "Kargo, Faturalama, Teknik" },
  hizmet_danismanlik: { subject: "Rapor teslim tarihini öğrenmek istiyorum", message: "Güncel proje durumu müşteriye iletildi", kbTitle: "Teslimat süreci nasıl işler?", kbCategory: "Süreç, Ödeme, Sözleşme" },
  perakende: { subject: "Siparişim gecikti", message: "Kargo takip numarası müşteriye iletildi", kbTitle: "Kargo takibi nasıl yapılır?", kbCategory: "Kargo, İade, Ödeme" },
  guzellik_bakim: { subject: "Randevumu değiştirmek istiyorum", message: "Yeni randevu saati müşteriye iletildi", kbTitle: "Randevumu nasıl değiştiririm?", kbCategory: "Randevu, Hizmetler, Ödeme" },
  spor_merkezi: { subject: "Üyeliğimi dondurmak istiyorum", message: "Üyelik dondurma talebiniz işleme alındı", kbTitle: "Üyeliğimi nasıl dondurabilirim?", kbCategory: "Üyelik, Ödeme, PT" },
  egitim_kurs: { subject: "Ders saatimi değiştirmek istiyorum", message: "Yeni ders saati müşteriye iletildi", kbTitle: "Ders saatimi nasıl değiştirebilirim?", kbCategory: "Ders Programı, Ödeme, Kayıt" },
  sanayi_esnaf: { subject: "Aracım ne zaman teslim edilecek?", message: "Güncel teslim tarihi müşteriye iletildi", kbTitle: "Tahmini teslim süresi ne kadar?", kbCategory: "Servis, Ödeme, Garanti" },
  otel: { subject: "Rezervasyonumu değiştirmek istiyorum", message: "Yeni giriş/çıkış tarihi misafire iletildi", kbTitle: "Rezervasyonumu nasıl değiştiririm?", kbCategory: "Rezervasyon, Ödeme, İptal Koşulları" },
};
const DEFAULT_SUPPORT_EXAMPLE = { subject: "Bir konuda yardım almak istiyorum", message: "Talep hakkında müşteriye bilgi verildi", kbTitle: "Sıkça sorulan bir soru", kbCategory: "Genel, Ödeme, Teknik" };
export const supportExamples = (sector) => SUPPORT_EXAMPLES[sector] || DEFAULT_SUPPORT_EXAMPLE;

// isAppointmentSector() true olan sektörler için randevu notu örneği — "Saç
// kesimi" gibi tek bir sabit örnek her iki randevu sektöründe de kullanılırsa
// Sağlık/Klinik'te yersiz kaçar, bu yüzden sektöre göre ayrılıyor.
const APPOINTMENT_NOTE_EXAMPLES = {
  guzellik_bakim: "Saç kesimi, cilt bakımı, manikür...",
  saglik_klinik: "Kontrol muayenesi, diş temizliği...",
  emlak: "Mülk gösterimi, kira sözleşmesi görüşmesi...",
  dijital_ajans: "Keşif görüşmesi, reklam kampanyası planlaması...",
  hizmet_danismanlik: "Danışmanlık görüşmesi, proje kapsamı...",
  // otel burada yok — Otel'in RoomBookingModal'ı artık "ne için" diye sebep
  // sormuyor, sade bir opsiyonel not alanı kullanıyor (bkz. CustomerPortal.jsx).
};
export const appointmentNoteExample = (sector) => APPOINTMENT_NOTE_EXAMPLES[sector] || "Randevu sebebinizi kısaca yazın...";

// Grup Dersleri hem Spor Merkezi (üye/üyelik dili) hem Eğitim/Kurs Merkezi (öğrenci/kayıt
// dili) için kullanılıyor — Türkçe'de "üyeliği"/"kaydı" gibi çekimler farklı olduğu için
// (STAGE_LABELS/SUPPORT_EXAMPLES'taki gibi) kelime birleştirmek yerine tam cümleler
// sektöre göre saklanıyor.
const GROUP_CLASS_WORDS = {
  egitim_kurs: {
    tabSubtitle: "Haftalık ders programınız ve kayıtlı öğrenciler",
    rosterTitle: "Kayıtlı öğrenciler",
    emptyRoster: "Henüz öğrenci yok.",
    fullMessage: "Ders dolu — yeni öğrenci eklemek için önce birini çıkarın.",
    addMemberLabel: "+ Öğrenci ekle",
    addMemberInfoTip: "Sadece aktif kaydı olan müşteriler listelenir — kaydı olmayan bir öğrenciyi eklemek için önce Teklifler'den kayıt oluşturun.",
    removeMemberTitle: "Öğrenciyi dersten çıkar",
    deleteClassMessage: "silinecek. Bu dersteki öğrencilerin listesi de silinir; dersi geri yüklerseniz öğrencileri tekrar eklemeniz gerekir.",
    noMembershipToast: "Bu müşterinin aktif bir kaydı yok — önce Teklifler'den kayıt oluşturun.",
    addErrorPrefix: "Öğrenci eklenemedi",
    removeErrorPrefix: "Öğrenci çıkarılamadı",
    portalEligibility: "Katılmak için aktif kaydınız olması gerekiyor.",
    panoMetricLabel: "Aktif Kayıtlar",
    panoMetricInfoTip: "Kurs Bitiş Tarihi bugün veya sonrasında olan (ya da hiç girilmemiş) 'Kursa kayıt oldu' kayıtlarının sayısı.",
  },
  spor_merkezi: {
    tabSubtitle: "Haftalık grup dersi programınız ve kayıtlı üyeler",
    rosterTitle: "Kayıtlı üyeler",
    emptyRoster: "Henüz üye yok.",
    fullMessage: "Ders dolu — yeni üye eklemek için önce birini çıkarın.",
    addMemberLabel: "+ Üye ekle",
    addMemberInfoTip: "Sadece aktif üyeliği olan müşteriler listelenir — üyeliği olmayan bir müşteriyi eklemek için önce Üyelikler'den üyelik kaydı oluşturun.",
    removeMemberTitle: "Üyeyi dersten çıkar",
    deleteClassMessage: "silinecek. Bu dersteki üyelerin listesi de silinir; dersi geri yüklerseniz üyeleri tekrar eklemeniz gerekir.",
    noMembershipToast: "Bu müşterinin aktif bir üyeliği yok — önce üyelik kaydı oluşturun.",
    addErrorPrefix: "Üye eklenemedi",
    removeErrorPrefix: "Üye çıkarılamadı",
    portalEligibility: "Katılmak için aktif üyeliğiniz olması gerekiyor.",
    panoMetricLabel: "Aktif Üyelikler",
    panoMetricInfoTip: "Üyelik Bitiş Tarihi bugün veya sonrasında olan (ya da hiç girilmemiş) 'Üye oldu' kayıtlarının sayısı.",
  },
};
export const groupClassWords = (sector) => GROUP_CLASS_WORDS[sector] || GROUP_CLASS_WORDS.spor_merkezi;

export function rowToCustomFieldDef(r) {
  return {
    id: r.id,
    entity: r.entity,
    key: r.key,
    label: r.label,
    type: r.field_type,
    options: r.options || null,
    sector: r.sector || null,
    audience: r.audience || null,
    sortOrder: r.sort_order || 0,
    active: r.active !== false,
  };
}

const AUDIENCE_LABELS = { kurumsal: "Kurumsal", bireysel: "Bireysel" };

// Uygulamanın kendi iç mantığının (portal randevu akışı, kaynak rozetleri vb.)
// custom_fields JSONB'sinde ayırt edici olarak okuduğu sabit anahtarlar — bir
// kullanıcı "Kaynak" gibi gayet doğal bir alan adı eklerse slugifyKey aynı
// anahtarı üretip bu iç işaretle çakışabilir (bkz. proje geçmişindeki "kaynak"
// çakışma hatası). Elle alan eklerken bu anahtarlar asla üretilmemeli.
const RESERVED_CUSTOM_FIELD_KEYS = new Set(["kaynak", "portal_randevu_zamani"]);

function slugifyKey(label) {
  const map = { ç: "c", ğ: "g", ı: "i", ö: "o", ş: "s", ü: "u", İ: "i", Ç: "c", Ğ: "g", Ö: "o", Ş: "s", Ü: "u" };
  return label
    .trim()
    .toLowerCase()
    .replace(/[çğıöşüİÇĞÖŞÜ]/g, (ch) => map[ch] || ch)
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function SectorOnboardingModal({ onPick, onSkip }) {
  const [companyName, setCompanyName] = useState("");
  return (
    <Modal title="İşletmenizi tanıyalım" onClose={onSkip}>
      <div style={{ marginBottom: 16 }}>
        <label style={{ fontSize: 13, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>İşletme adı</label>
        <input value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="Akın Diş Kliniği" style={{ width: "100%" }} />
      </div>
      <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: "0 0 16px" }}>
        Seçtiğiniz sektöre göre satış aşamalarınız, önerilen etiketler ve size özel alanlar otomatik hazırlanır. İstediğiniz zaman İşletme ayarları'ndan değiştirebilirsiniz.
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
        {SECTOR_PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => onPick(p.id, companyName.trim())}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "10px 12px",
              background: "var(--surface-1)",
              border: "0.5px solid var(--border)",
              borderRadius: "var(--radius)",
              textAlign: "left",
              fontSize: 14,
            }}
          >
            <i className={`ti ${p.icon}`} style={{ fontSize: 18, color: "var(--text-accent)" }} aria-hidden="true"></i>
            {p.label}
          </button>
        ))}
      </div>
      <div style={{ textAlign: "right" }}>
        <button type="button" onClick={() => onSkip(companyName.trim())} style={{ background: "none", border: "none", fontSize: 13, color: "var(--text-secondary)" }}>
          Atla, sonra İşletme ayarları'ndan seçerim
        </button>
      </div>
    </Modal>
  );
}

const FIELD_TYPE_LABELS = { text: "Metin", number: "Sayı", select: "Seçenekli", date: "Tarih", datetime: "Tarih & Saat" };

const CUSTOM_FIELD_NAME_EXAMPLES = {
  emlak: "Mülk Tipi",
  dijital_ajans: "Hizmet Paketi",
  saglik_klinik: "Tedavi Türü",
  uretim_satis: "Ürün Kodu",
  hizmet_danismanlik: "Proje Kapsamı",
  perakende: "Kampanya Adı",
  guzellik_bakim: "Tercih Edilen Uzman",
  spor_merkezi: "Üyelik Paketi",
  egitim_kurs: "Kurs Programı",
  sanayi_esnaf: "Servis Türü",
  otel: "Oda Tipi",
};

// App.jsx'teki DEAL_TAB_STRINGS.navLabel ile aynı değerler — Sectors.jsx App.jsx'i
// import edemediği için (bağımlılık yönü ters) burada küçük bir kopyası tutuluyor.
const DEAL_ENTITY_NAV_LABELS = { teklif: "Teklifler", randevu: "Randevular", uyelik: "Üyelikler", rezervasyon: "Rezervasyonlar" };

export function CustomFieldDefsManager({ customFieldDefs, onAdd, onUpdate, onDelete, sector }) {
  const dealEntityLabel = DEAL_ENTITY_NAV_LABELS[dealWordKind(sector)];
  const [entity, setEntity] = useState("customer");
  const [label, setLabel] = useState("");
  const [type, setType] = useState("text");
  const [options, setOptions] = useState("");
  const [audience, setAudience] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [editingDef, setEditingDef] = useState(null);

  const activeDefs = customFieldDefs.filter((d) => d.active);
  const customerDefs = activeDefs.filter((d) => d.entity === "customer");
  const dealDefs = activeDefs.filter((d) => d.entity === "deal");

  const startEdit = (d) => {
    setEditingDef(d);
    setEntity(d.entity);
    setLabel(d.label);
    setType(d.type);
    setOptions((d.options || []).join(", "));
    setAudience(d.audience || "");
  };

  const cancelEdit = () => {
    setEditingDef(null);
    setLabel("");
    setOptions("");
    setAudience("");
    setType("text");
  };

  const submit = (e) => {
    e.preventDefault();
    const trimmedLabel = label.trim();
    if (!trimmedLabel) return;
    const parsedOptions = type === "select" ? options.split(",").map((o) => o.trim()).filter(Boolean) : null;
    if (editingDef) {
      onUpdate({ id: editingDef.id, label: trimmedLabel, options: parsedOptions, audience: audience || null });
      cancelEdit();
      return;
    }
    const key = slugifyKey(trimmedLabel);
    // customFieldDefs (sadece activeDefs değil) kontrol ediliyor — aksi halde başka
    // bir sektöre etiketlenmiş, şu an gizli (inactive) bir satırla aynı key'e sahip
    // ikinci bir tanım oluşturulabilir (aynı JSONB anahtarını paylaşan iki kayıt).
    if (!key || RESERVED_CUSTOM_FIELD_KEYS.has(key) || customFieldDefs.some((d) => d.entity === entity && d.key === key)) return;
    onAdd({
      entity,
      key,
      label: trimmedLabel,
      type,
      options: parsedOptions,
      audience: audience || null,
    });
    setLabel("");
    setOptions("");
    setAudience("");
  };

  const renderGroup = (title, defs) => (
    <div style={{ marginBottom: 12 }}>
      <p style={{ fontSize: 13, fontWeight: 500, margin: "0 0 6px" }}>{title}</p>
      {defs.length === 0 ? (
        <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0 }}>Henüz alan yok.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {defs.map((d) => (
            <div key={d.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "var(--surface-1)", borderRadius: "var(--radius)", padding: "6px 10px" }}>
              <span style={{ fontSize: 13 }}>
                {d.label} <span style={{ color: "var(--text-muted)" }}>· {FIELD_TYPE_LABELS[d.type] || d.type}{d.audience ? ` · Sadece ${AUDIENCE_LABELS[d.audience]}` : ""}</span>
              </span>
              <div style={{ display: "flex", gap: 4 }}>
                <IconButton icon="ti-edit" title="Düzenle" size="sm" onClick={() => startEdit(d)} />
                <IconButton icon="ti-trash" title="Sil" size="sm" onClick={() => setConfirmDelete(d)} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div style={{ marginTop: 24, paddingTop: 20, borderTop: "0.5px solid var(--border)" }}>
      <p style={{ fontSize: 14, fontWeight: 500, margin: "0 0 4px" }}>Özel alanlar</p>
      <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "0 0 12px" }}>
        Sektör değiştirdiğinizde başka sektöre ait alanlar burada gizlenir (silinmez) — daha önce kaydedilmiş değerler korunur, aynı sektöre dönerseniz alanlar geri gelir.
      </p>
      {renderGroup("Müşteri alanları", customerDefs)}
      {renderGroup(`${dealEntityLabel} alanları`, dealDefs)}

      <p style={{ fontSize: 13, fontWeight: 500, margin: "12px 0 4px", display: "flex", alignItems: "center", gap: 4 }}>
        {editingDef ? "Alanı düzenle" : "Yeni alan ekle"}
        <InfoTip text={`Standart alanların (isim, telefon, tutar vb.) dışında, işinize özel ekstra bilgi alanları tanımlayabilirsiniz — örn. "Mülk Tipi", "Tercih Edilen Uzman", "Alerji Notu". "Nerede": bu bilgi müşteri kartında mı yoksa ${dealEntityLabel} kaydında mı görünsün. "Tip": ne tür veri gireceksiniz (metin, sayı, tarih, tarih & saat veya hazır seçim listesi) — "Tarih & Saat" tipiyle ${dealEntityLabel} kaydına eklenen alanlar için, o saatten 2 saat önce müşteriye otomatik hatırlatma e-postası gönderilir (randevu takibi için). "Kime": bu alanı sadece kurumsal, sadece bireysel müşterilerde mi yoksa herkeste mi göstermek istiyorsunuz.`} />
      </p>
      <form onSubmit={submit} style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "flex-end", marginTop: 8 }}>
        <div>
          <label style={{ fontSize: 12, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Nerede</label>
          <select value={entity} onChange={(e) => setEntity(e.target.value)} disabled={!!editingDef} style={{ fontSize: 13 }}>
            <option value="customer">Müşteriler</option>
            <option value="deal">{dealEntityLabel}</option>
          </select>
        </div>
        <div style={{ flex: 1, minWidth: 120 }}>
          <label style={{ fontSize: 12, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Alan adı</label>
          <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder={`Örn. ${CUSTOM_FIELD_NAME_EXAMPLES[sector] || "Referans Notu"}`} style={{ width: "100%", fontSize: 13 }} />
        </div>
        <div>
          <label style={{ fontSize: 12, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Tip</label>
          <select value={type} onChange={(e) => setType(e.target.value)} disabled={!!editingDef} style={{ fontSize: 13 }}>
            <option value="text">Metin</option>
            <option value="number">Sayı</option>
            <option value="select">Seçenekli</option>
            <option value="date">Tarih</option>
            <option value="datetime">Tarih &amp; Saat</option>
          </select>
        </div>
        {type === "select" && (
          <div style={{ flex: 1, minWidth: 160 }}>
            <label style={{ fontSize: 12, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Seçenekler (virgülle)</label>
            <input value={options} onChange={(e) => setOptions(e.target.value)} placeholder="Daire, Villa, Arsa" style={{ width: "100%", fontSize: 13 }} />
          </div>
        )}
        <div>
          <label style={{ fontSize: 12, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Kime</label>
          <select value={audience} onChange={(e) => setAudience(e.target.value)} style={{ fontSize: 13 }}>
            <option value="">Herkese (Kurumsal + Bireysel)</option>
            <option value="kurumsal">Sadece Kurumsal</option>
            <option value="bireysel">Sadece Bireysel</option>
          </select>
        </div>
        <button type="submit" style={{ background: "var(--surface-1)", border: "0.5px solid var(--border)", fontSize: 13 }}>
          {editingDef ? "Güncelle" : "+ Alan ekle"}
        </button>
        {editingDef && (
          <button type="button" onClick={cancelEdit} style={{ fontSize: 13 }}>
            Vazgeç
          </button>
        )}
      </form>

      {confirmDelete && (
        <ConfirmDialog
          title="Özel alanı sil"
          message={`"${confirmDelete.label}" alanı formlardan kaldırılacak. Daha önce kaydedilmiş değerler silinmez, sadece görünmez olur.`}
          onConfirm={() => { onDelete(confirmDelete.id); setConfirmDelete(null); }}
          onClose={() => setConfirmDelete(null)}
        />
      )}
    </div>
  );
}

// Bir varlığa (müşteri/teklif) ait aktif özel alan tanımlarını, formda dinamik
// input render etmek için kullanılır — CustomerForm/DealForm bu bileşeni kullanır.
export function CustomFieldsSection({ defs, values, onChange }) {
  const active = defs.filter((d) => d.active);
  if (active.length === 0) return null;
  return (
    <div style={{ marginBottom: 12 }}>
      <p style={{ fontSize: 13, fontWeight: 500, margin: "0 0 6px", display: "flex", alignItems: "center", gap: 4 }}>
        Özel alanlar
        <InfoTip text="Bu alanlar sabit değil — Ayarlar → Sektör & Özel Alanlar'dan kendiniz ekleyip kaldırabilirsiniz. Sektör seçtiğinizde bazı alanlar otomatik hazır gelir." />
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {active.map((d) => (
          <div key={d.key}>
            <label style={{ fontSize: 13, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>{d.label}</label>
            {d.type === "select" ? (
              <select value={values[d.key] || ""} onChange={(e) => onChange({ ...values, [d.key]: e.target.value })} style={{ width: "100%" }}>
                <option value="">Seçiniz</option>
                {(d.options || []).map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            ) : (
              <input
                type={d.type === "number" ? "number" : d.type === "date" ? "date" : d.type === "datetime" ? "datetime-local" : "text"}
                value={values[d.key] || ""}
                onChange={(e) => onChange({ ...values, [d.key]: e.target.value })}
                style={{ width: "100%" }}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export function TagBadges({ tags }) {
  if (!tags || tags.length === 0) return null;
  return (
    <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
      {tags.map((t) => <Badge key={t}>{t}</Badge>)}
    </div>
  );
}
