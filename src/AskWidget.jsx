import { useState, useEffect, useRef } from "react";
import { uid } from "./shared";
import { HELP_TOPICS, ANSWER_LIBRARY, ADVISOR_TIPS } from "./helpContent";

// HELP_TOPICS ("Binerly nasıl kullanılır") ve ADVISOR_TIPS (genel KOBİ
// tavsiyesi, veriden bağımsız) aynı {category,q,a,visibleIf} şeklini
// paylaşıyor — ikisini de ANSWER_LIBRARY ile aynı {id,category,label,
// keywords,visibleIf,compute} şekline çevirip tek bir arama kutusunda
// birleştiriyoruz. keywords'e hem soruyu hem cevabı koymak, eski HelpPanel'in
// "soruda veya cevapta ara" davranışını birebir koruyor.
function staticToLibraryEntry(item, idx, idPrefix, categoryPrefix) {
  return {
    id: `${idPrefix}_${idx}`,
    category: `${categoryPrefix}: ${item.category}`,
    label: item.q,
    // item.keywords opsiyonel — yazım varyasyonu ("artırmak" / "arttırmak"
    // gibi) veya eş anlamlı ifade eklemek için, soru/cevap metninden başka
    // bir eşleşme yolu daha açar.
    keywords: [item.q.toLowerCase(), item.a.toLowerCase(), ...(item.keywords || [])],
    visibleIf: item.visibleIf,
    compute: () => item.a,
  };
}

const UNIFIED_LIBRARY = [
  ...ANSWER_LIBRARY,
  ...HELP_TOPICS.map((t, i) => staticToLibraryEntry(t, i, "help", "Nasıl Yapılır")),
  ...ADVISOR_TIPS.map((t, i) => staticToLibraryEntry(t, i, "advisor", "Danışman")),
];

export function AskBubble({ open, onToggle }) {
  // Önceden sohbet balonu ikonuydu (ti-message-circle-2) - sitede ayrıca bir
  // "Mesajlar" sekmesi ve KOBİ'nin kendi müşteri "Destek" modülü de olduğu
  // için yeni kullanıcılar bu üçünü karıştırıp burayı canlı destek/insan
  // sohbeti sanabiliyordu. "Yardım" ikonu/etiketi bunun aslında bir soru-
  // cevap/nasıl-yapılır aracı olduğunu daha net anlatıyor.
  return (
    <button
      onClick={onToggle}
      title="Yardım"
      aria-label="Yardım"
      data-tour="ask-bubble"
      style={{
        position: "fixed",
        bottom: 24,
        right: 24,
        width: 56,
        height: 56,
        borderRadius: "50%",
        background: "var(--fill-accent)",
        color: "var(--on-accent)",
        border: "none",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        boxShadow: "0 4px 16px rgba(0,0,0,0.25)",
        zIndex: 950,
        cursor: "pointer",
        fontSize: 24,
      }}
    >
      <i className={`ti ${open ? "ti-x" : "ti-help"}`} aria-hidden="true"></i>
    </button>
  );
}

// Soru tam olarak yazılmadıkça hiç eşleşmemesi ("kaç alan tanımlamışım" gibi
// gevşek bir ifade hiçbir sonuç vermiyordu) kullanıcı tarafından bulunan
// gerçek bir hata — tam alt dize eşleşmesi yerine kelime bazlı puanlama
// kullanıyoruz: sorudaki her kelime (yaygın soru kalıpları hariç) bir girişin
// soru+anahtar kelime metninde geçiyorsa puan kazanır, en çok puan alan en
// üstte çıkar. Bu, Türkçe çekim eklerini tam çözmez (kök analizi yok) ama alt
// dize içerme kontrolü ("alanım" içinde "alan" geçer) çoğu pratik durumu
// karşılıyor.
// "kaç" bilerek stopword DEĞİL — "Kaç müşterim var?" gibi onlarca soru tam
// olarak bu kelimeyle "sayı" sorduğunu belli ediyor; stopword sayılırsa geriye
// tek anlamlı token "müşteri" kalıyor, bu da neredeyse HER müşteri-ilgili
// kaydla eşleşip (örn. "en çok kazandıran müşterim kim") array sırasına göre
// yanlış (alakasız) ilk eşleşmeyi öne çıkarıyordu (kullanıcı tarafından bulundu, 2026-07-23).
const ASK_STOPWORDS = new Set([
  "ne",
  "nedir",
  "mı",
  "mi",
  "mu",
  "mü",
  "var",
  "nasıl",
  "hangi",
  "olur",
  "kadar",
  "benim",
  "bir",
  "şey",
  "için",
  "ile",
  "de",
  "da",
  "musunuz",
  "yapmalıyım",
  "yapıyorum",
  "ediyorum",
  "m",
]);

function tokenizeAskQuery(str) {
  return str
    .toLowerCase()
    .replace(/[?.,!:;]/g, "")
    .split(/\s+/)
    .filter(Boolean);
}

// Türkçe çekim ekleri ("artır-abilirim", "sat-ışlarımı") ve küçük yazım
// hataları yüzünden bir kelimenin tamamının metinde birebir geçmesini
// beklemek çok kırılgan oluyordu ("satışarımı" gibi bir yazım hatası hiçbir
// şeyle eşleşmiyordu). Kelimenin ilk 5 harfine ("kök"e yakın bir kısaltma)
// bakmak, hem ek varyasyonlarını hem çoğu yazım hatasını (kelimenin
// sonundaki harfler karışsa bile) tolere ediyor.
function askStem(word) {
  return word.length <= 5 ? word : word.slice(0, 5);
}

function askTokenMatches(token, blobWords) {
  const stem = askStem(token);
  // Alt-dize kontrolünü (token.includes(w) / w.includes(token)) en az 4
  // karakterle sınırlıyoruz — sınır olmadan "en", "ay", "bu" gibi çok kısa/yaygın
  // kelimeler neredeyse her uzun kelimenin içinde tesadüfen geçtiği için (örn.
  // "kaybediyorum" içinde "ay" geçiyor) alakasız girişlerin puanını yapay olarak
  // şişirip yanlış cevabın öne çıkmasına yol açıyordu (kullanıcı tarafından bulundu).
  return blobWords.some(
    (w) =>
      askStem(w) === stem ||
      (w.length >= 4 && token.includes(w)) ||
      (token.length >= 4 && w.includes(token)),
  );
}

// Başlangıçta sohbete örnek olsun diye üç farklı türden (veri/nasıl
// yapılır/danışman) birer soru öneriliyor — kütüphane büyüdükçe bu id'lerin
// var olduğundan emin olmak için ihtiyaç halinde güncellenmeli.
const ASK_STARTER_IDS = ["top_customer_month", "help_0", "advisor_0"];

export function AskDock({ open, onClose, sector, ctx }) {
  const [query, setQuery] = useState("");
  const [messages, setMessages] = useState([]);
  const threadRef = useRef(null);
  const relevant = UNIFIED_LIBRARY.filter((e) => !e.visibleIf || e.visibleIf(sector)).map((e) => ({
    ...e,
    resolvedLabel: typeof e.label === "function" ? e.label(sector) : e.label,
  }));
  const starters = ASK_STARTER_IDS.map((id) => relevant.find((e) => e.id === id)).filter(Boolean);

  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const ask = (text) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const rawTokens = tokenizeAskQuery(trimmed);
    const meaningfulTokens = rawTokens.filter((t) => !ASK_STOPWORDS.has(t));
    const tokens = meaningfulTokens.length > 0 ? meaningfulTokens : rawTokens;
    const scored = relevant
      .map((e) => {
        const blobWords = `${e.resolvedLabel} ${e.keywords.join(" ")}`
          .toLowerCase()
          .replace(/[?.,!:;]/g, "")
          .split(/\s+/)
          .filter(Boolean);
        const score = tokens.reduce((sum, t) => sum + (askTokenMatches(t, blobWords) ? 1 : 0), 0);
        return { ...e, score };
      })
      .filter((e) => e.score > 0)
      .sort((a, b) => b.score - a.score);

    const userMsg = { id: uid(), role: "user", text: trimmed };
    const assistantMsg =
      scored.length === 0
        ? {
            id: uid(),
            role: "assistant",
            unresolved: true,
            text: "Bunu şu an bilmiyorum - farklı bir ifadeyle sorabilir ya da aşağıdaki örneklerden birini deneyebilirsiniz.",
            suggestions: starters.map((e) => e.resolvedLabel),
          }
        : {
            id: uid(),
            role: "assistant",
            category: scored[0].category,
            text: scored[0].compute(ctx),
            suggestions: scored.slice(1, 4).map((e) => e.resolvedLabel),
          };
    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setQuery("");
  };

  return (
    <div
      style={{
        position: "fixed",
        bottom: 90,
        right: 24,
        width: "min(380px, calc(100vw - 32px))",
        height: "min(560px, 70vh)",
        background: "var(--surface-2)",
        border: "0.5px solid var(--border)",
        borderRadius: 12,
        boxShadow: "0 8px 32px rgba(0,0,0,0.3)",
        zIndex: 950,
        display: open ? "flex" : "none",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "14px 16px",
          borderBottom: "0.5px solid var(--border)",
          flexShrink: 0,
        }}
      >
        <div>
          <h3 style={{ margin: 0, fontSize: 15 }}>Yardım</h3>
          <p style={{ margin: "2px 0 0", fontSize: 11, color: "var(--text-muted)" }}>
            Hiçbir soru/veri dışarı gönderilmez
          </p>
        </div>
        <button
          onClick={onClose}
          aria-label="Kapat"
          style={{ width: 28, height: 28, padding: 0, flexShrink: 0 }}
        >
          <i className="ti ti-x" aria-hidden="true"></i>
        </button>
      </div>
      <div
        ref={threadRef}
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "14px 16px",
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        {messages.length === 0 && (
          <div
            style={{
              background: "var(--surface-1)",
              border: "0.5px solid var(--border)",
              borderRadius: "4px 12px 12px 12px",
              padding: "10px 12px",
              maxWidth: "88%",
              alignSelf: "flex-start",
            }}
          >
            <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5 }}>
              Merhaba! Satışlarınız/müşterileriniz hakkında, Binerly'nin nasıl kullanıldığı veya
              genel işletme tavsiyesi - istediğinizi sorabilirsiniz.
            </p>
          </div>
        )}
        {messages.length === 0 && starters.length > 0 && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 4,
              alignSelf: "flex-start",
              maxWidth: "88%",
            }}
          >
            {starters.map((e) => (
              <button
                key={e.id}
                type="button"
                onClick={() => ask(e.resolvedLabel)}
                style={{
                  textAlign: "left",
                  background: "var(--surface-1)",
                  border: "0.5px solid var(--border)",
                  borderRadius: 8,
                  padding: "6px 10px",
                  fontSize: 12.5,
                  color: "var(--text-accent)",
                  cursor: "pointer",
                }}
              >
                {e.resolvedLabel}
              </button>
            ))}
          </div>
        )}
        {messages.map((m) =>
          m.role === "user" ? (
            <div key={m.id} style={{ alignSelf: "flex-end", maxWidth: "85%" }}>
              <div
                style={{
                  background: "var(--fill-accent)",
                  color: "var(--on-accent)",
                  borderRadius: "12px 4px 12px 12px",
                  padding: "9px 12px",
                }}
              >
                <p style={{ margin: 0, fontSize: 13.5 }}>{m.text}</p>
              </div>
            </div>
          ) : (
            <div
              key={m.id}
              style={{
                alignSelf: "flex-start",
                maxWidth: "88%",
                display: "flex",
                flexDirection: "column",
                gap: 6,
              }}
            >
              <div
                style={{
                  background: "var(--surface-1)",
                  border: "0.5px solid var(--border)",
                  borderRadius: "4px 12px 12px 12px",
                  padding: "10px 12px",
                }}
              >
                {m.category && (
                  <p
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      color: "var(--text-muted)",
                      textTransform: "uppercase",
                      letterSpacing: 0.5,
                      margin: "0 0 4px",
                    }}
                  >
                    {m.category}
                  </p>
                )}
                <p
                  style={{
                    margin: 0,
                    fontSize: 13,
                    color: "var(--text-secondary)",
                    lineHeight: 1.5,
                  }}
                >
                  {m.text}
                </p>
                {m.unresolved && (
                  <p style={{ margin: "8px 0 0", fontSize: 12, color: "var(--text-secondary)" }}>
                    Cevap bulamadıysanız <a href="mailto:info@binerly.com">info@binerly.com</a>{" "}
                    adresinden bize yazabilirsiniz.
                  </p>
                )}
              </div>
              {m.suggestions?.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {m.suggestions.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => ask(s)}
                      style={{
                        textAlign: "left",
                        background: "none",
                        border: "0.5px solid var(--border)",
                        borderRadius: 8,
                        padding: "5px 10px",
                        fontSize: 12,
                        color: "var(--text-accent)",
                        cursor: "pointer",
                      }}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ),
        )}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          ask(query);
        }}
        style={{
          display: "flex",
          gap: 8,
          padding: "10px 12px",
          borderTop: "0.5px solid var(--border)",
          flexShrink: 0,
        }}
      >
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Bir şey sorun..."
          style={{ flex: 1 }}
          autoFocus
        />
        <button
          type="submit"
          disabled={!query.trim()}
          aria-label="Gönder"
          style={{
            width: 36,
            height: 36,
            padding: 0,
            background: "var(--fill-accent)",
            color: "var(--on-accent)",
            border: "none",
            borderRadius: 8,
            flexShrink: 0,
            opacity: query.trim() ? 1 : 0.5,
          }}
        >
          <i className="ti ti-send" aria-hidden="true"></i>
        </button>
      </form>
    </div>
  );
}
