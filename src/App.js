import { useState, useEffect, useRef, useCallback } from "react";

const ADMIN_SIFRE = "145321";
const GIZLI_ANAHTAR = "LAZER145321ESP32";

const FIRMALAR = [
  { kod: "FS", ad: "FS" },
  { kod: "LU", ad: "Luna" },
  { kod: "IR", ad: "Ironmed" },
  { kod: "RA", ad: "Rain" },
  { kod: "CL", ad: "Clinix" },
  { kod: "ZT", ad: "Zet Tech" },
];

const renk = "#6C0BA9";
const renkAcik = "#f3e8ff";

const FS_PAKETLER = [1000, 5000, 10000, 50000, 100000, 1000000];
const FS_GIZLI_ANAHTAR_1 = 0x5A3C9E1F;
const FS_GIZLI_ANAHTAR_2 = 0xB7D40C83;
const FS_YUKLEME_CARPAN = 0x9E3779B1;
const FS_YUKLEME_HASH_CARPAN = 7919;
const FS_PAKET_SINIRSIZ = 0xFFFFFFFF;

function aktivasyonKoduHesapla(seriNo, paket, yuklemeNo) {
  let h = FS_GIZLI_ANAHTAR_1 >>> 0;
  for (let i = 0; i < seriNo.length; i++) {
    const ch = seriNo.charCodeAt(i) & 0xff;
    h = (Math.imul(h, 1000003) ^ ch) >>> 0;
  }
  const paketCarp = Math.imul(paket, 0xABC1) >>> 0;
  h = (Math.imul(h, 31337) ^ paketCarp) >>> 0;
  const yuklemeCarp = Math.imul((yuklemeNo >>> 0) || 0, FS_YUKLEME_CARPAN) >>> 0;
  h = (Math.imul(h, FS_YUKLEME_HASH_CARPAN) ^ yuklemeCarp) >>> 0;
  h = (h ^ FS_GIZLI_ANAHTAR_2) >>> 0;
  return String((h % 900000) + 100000);
}

function sifreUretLazura(seriNo, atisAdedi) {
  const metin = `${seriNo}:${atisAdedi}:${GIZLI_ANAHTAR}`;
  let hash = 0;
  for (let i = 0; i < metin.length; i++) {
    hash = ((hash << 5) - hash + metin.charCodeAt(i)) | 0;
  }
  return String((Math.abs(hash) % 900000) + 100000);
}

function sifreUret(seriNo, atisAdedi, fsYuklemeNo) {
  if (seriNo.startsWith("FS")) return aktivasyonKoduHesapla(seriNo, atisAdedi, fsYuklemeNo);
  return sifreUretLazura(seriNo, atisAdedi);
}

function bugun() {
  return new Date().toLocaleDateString("tr-TR") + " " + new Date().toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
}

function seriNoUret(firmaKod, firmaSayaclari) {
  if (firmaKod === "FS") {
    const sayac = (firmaSayaclari[firmaKod] ?? 1000) + 1;
    return { sayac, seriNo: `${firmaKod}${sayac}` };
  }
  const sayac = (firmaSayaclari[firmaKod] || 0) + 1;
  return { sayac, seriNo: `${firmaKod}${String(sayac).padStart(4, "0")}` };
}

async function esp32Durum(ip) {
  const r = await fetch(`http://${ip}/durum`, { signal: AbortSignal.timeout(3000) });
  return r.json();
}
async function esp32Set(ip, params) {
  await fetch(`http://${ip}/set`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(params), signal: AbortSignal.timeout(3000) });
}
async function esp32Baslat(ip) { await fetch(`http://${ip}/baslat`, { method: "POST", signal: AbortSignal.timeout(3000) }); }
async function esp32Durdur(ip) { await fetch(`http://${ip}/durdur`, { method: "POST", signal: AbortSignal.timeout(3000) }); }
async function esp32TetikBas(ip) { await fetch(`http://${ip}/tetik/bas`, { method: "POST", signal: AbortSignal.timeout(3000) }); }
async function esp32TetikBirak(ip) { await fetch(`http://${ip}/tetik/birak`, { method: "POST", signal: AbortSignal.timeout(3000) }); }

const GEMINI_API_KEY = "AIzaSyDtvttG9K2F2nt1jZrsMoFNsIrn8kwkyCM";

async function ciltKilAnalizEt(base64Img, seansNo, oncekiSeanslar) {
  const onceki = oncekiSeanslar.length > 0
    ? `Önceki seanslar: ${oncekiSeanslar.slice(-3).map(s => `Seans ${s.seansNo}: E:${s.enerji} P:${s.pulse} Hz:${s.hz}, not:${s.notlar || ""}`).join(" | ")}`
    : "İlk seans";
  const prompt = `Lazer epilasyon uzmanısın. Bu cilt/kıl fotoğrafını analiz et. ${onceki}\nSadece JSON döndür, başka hiçbir şey yazma:\n{"ciltTonu":3,"ciltAciklama":"Orta esmer","kilRenk":"koyu","kilKalinlik":"orta","kilYogunluk":"yüksek","onerilen":{"enerji":8,"pulse":55,"hz":6},"seansNotu":"Müşteriye kısa bilgi.","uyari":""}`;

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{
          parts: [
            { inline_data: { mime_type: "image/jpeg", data: base64Img } },
            { text: prompt }
          ]
        }]
      })
    }
  );
  const data = await response.json();
  console.log("Gemini ham yanıt:", JSON.stringify(data));
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
  console.log("Gemini text:", text);
  if (!text) {
    const hata = data.error?.message || data.promptFeedback?.blockReason || "Gemini boş yanıt döndü";
    throw new Error(hata);
  }
  // JSON bloğunu bul — bazen ```json ... ``` içinde gelir
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("JSON bulunamadı: " + text.substring(0, 100));
  return JSON.parse(jsonMatch[0]);
}

// ── ESP32 KONTROL ──
function Esp32Panel({ ip, onIpDegis }) {
  const [durum, setDurum] = useState(null);
  const [baglanti, setBaglanti] = useState("bekleniyor");
  const [enerji, setEnerji] = useState(5);
  const [pulse, setPulse] = useState(35);
  const [hz, setHz] = useState(8);
  const [ipGirdi, setIpGirdi] = useState(ip || "");
  const [ipDuzenleme, setIpDuzenleme] = useState(!ip);
  const [tetikBasili, setTetikBasili] = useState(false);
  const timerRef = useRef(null);

  const durumGuncelle = useCallback(async () => {
    if (!ip) return;
    try {
      const d = await esp32Durum(ip);
      setDurum(d); setEnerji(d.enerji || 5); setPulse(d.pulse || 35); setHz(d.hz || 8);
      setTetikBasili(d.tabletTetik || false); setBaglanti("baglandi");
    } catch { setBaglanti("hata"); setDurum(null); }
  }, [ip]);

  useEffect(() => {
    if (!ip) return;
    durumGuncelle();
    timerRef.current = setInterval(durumGuncelle, 2000);
    return () => clearInterval(timerRef.current);
  }, [ip, durumGuncelle]);

  const pGonder = async (key, val) => { if (!ip) return; try { await esp32Set(ip, { [key]: val }); } catch {} };
  const baslat = async () => { if (!ip) return; try { await esp32Baslat(ip); await durumGuncelle(); } catch {} };
  const durdur = async () => { if (!ip) return; try { await esp32Durdur(ip); await durumGuncelle(); } catch {} };
  const tetikBas = async () => { if (!ip || !durum?.sistemiBaslatildi) return; setTetikBasili(true); try { await esp32TetikBas(ip); } catch {} };
  const tetikBirak = async () => { if (!ip) return; setTetikBasili(false); try { await esp32TetikBirak(ip); } catch {} };

  if (ipDuzenleme) return (
    <div style={{ padding: 20 }}>
      <div style={{ background: "white", borderRadius: 20, padding: 28, boxShadow: "0 2px 16px rgba(108,11,169,0.1)" }}>
        <div style={{ fontSize: 14, fontWeight: "bold", color: "#aaa", letterSpacing: 2, marginBottom: 16 }}>ESP32 IP ADRESİ</div>
        <input style={{ width: "88%", padding: 14, borderRadius: 12, border: `2px solid ${renkAcik}`, fontSize: 18, textAlign: "center", fontFamily: "monospace", outline: "none", marginBottom: 12 }}
          placeholder="192.168.1.151" value={ipGirdi} onChange={e => setIpGirdi(e.target.value)}
          onKeyDown={e => e.key === "Enter" && onIpDegis(ipGirdi)} />
        <button style={{ width: "100%", padding: 14, background: renk, color: "white", border: "none", borderRadius: 12, fontSize: 15, fontWeight: "bold", cursor: "pointer" }}
          onClick={() => { onIpDegis(ipGirdi); setIpDuzenleme(false); }}>BAĞLAN</button>
      </div>
    </div>
  );

  const aktif = durum?.sistemiBaslatildi || durum?.atisDevam;

  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 10, height: 10, borderRadius: 5, background: baglanti === "baglandi" ? "#22c55e" : baglanti === "hata" ? "#ef4444" : "#f59e0b" }} />
          <span style={{ fontSize: 13, color: baglanti === "baglandi" ? "#22c55e" : "#ef4444", fontWeight: "bold" }}>
            {baglanti === "baglandi" ? `Bağlı · ${ip}` : baglanti === "hata" ? "Bağlantı yok" : "Bekleniyor..."}
          </span>
        </div>
        <button onClick={() => setIpDuzenleme(true)} style={{ background: renkAcik, border: "none", borderRadius: 10, padding: "6px 10px", color: renk, cursor: "pointer", fontSize: 12, fontWeight: "bold" }}>IP Değiştir</button>
      </div>

      {durum && <>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 12 }}>
          {[
            { label: "SEANS", value: durum.oturumSayac?.toLocaleString() || "0", icon: "🎯", r: renk },
            { label: "KALAN", value: durum.kalanAtis === 0 && durum.kotaSinirsiz ? "∞" : (durum.kalanAtis?.toLocaleString() || "0"), icon: "🔋", r: renk },
            { label: "PEDAL", value: durum.pedalDurum ? "BASILI" : "BOŞ", icon: "🦶", r: durum.pedalDurum ? "#22c55e" : "#aaa" },
          ].map(item => (
            <div key={item.label} style={{ background: "white", borderRadius: 14, padding: "12px 8px", textAlign: "center", boxShadow: "0 2px 8px rgba(108,11,169,0.07)" }}>
              <div style={{ fontSize: 18, marginBottom: 4 }}>{item.icon}</div>
              <div style={{ fontSize: 13, fontWeight: "bold", color: item.r, fontFamily: "monospace" }}>{item.value}</div>
              <div style={{ fontSize: 10, color: "#aaa", letterSpacing: 1 }}>{item.label}</div>
            </div>
          ))}
        </div>

        <div style={{ marginBottom: 12 }}>
          {aktif
            ? <button onClick={durdur} style={{ width: "100%", padding: 18, background: "#ef4444", color: "white", border: "none", borderRadius: 16, fontSize: 18, fontWeight: "bold", cursor: "pointer" }}>⏹ DURDUR</button>
            : <button onClick={baslat} style={{ width: "100%", padding: 18, background: `linear-gradient(135deg, ${renk}, #4a0070)`, color: "white", border: "none", borderRadius: 16, fontSize: 18, fontWeight: "bold", cursor: "pointer" }}>▶ BAŞLAT</button>
          }
        </div>

        {aktif && (
          <div style={{ marginBottom: 16 }}>
            <button
              onPointerDown={tetikBas} onPointerUp={tetikBirak} onPointerLeave={tetikBirak}
              style={{ width: "100%", padding: 24, background: tetikBasili ? "#dc2626" : "#16a34a", color: "white", border: "none", borderRadius: 16, fontSize: 20, fontWeight: "bold", cursor: "pointer", userSelect: "none", WebkitUserSelect: "none", transition: "background 0.1s" }}>
              {tetikBasili ? "⚡ ATIŞ DEVAM EDİYOR" : "👆 TETİK — BASILI TUT"}
            </button>
            <div style={{ fontSize: 11, color: "#aaa", textAlign: "center", marginTop: 6 }}>Basılı tut → atış · Bırak → durur</div>
          </div>
        )}

        <div style={{ background: "white", borderRadius: 16, padding: 20, boxShadow: "0 2px 8px rgba(108,11,169,0.07)" }}>
          <div style={{ fontSize: 12, fontWeight: "bold", color: "#aaa", letterSpacing: 2, marginBottom: 16 }}>PARAMETRELER</div>
          {[
            { label: "ENERJİ", key: "enerji", val: enerji, set: setEnerji, min: 1, max: 20, step: 1, birim: "" },
            { label: "PULSE", key: "pulse", val: pulse, set: setPulse, min: 35, max: 200, step: 5, birim: "ms" },
            { label: "ATIŞ HIZI", key: "hz", val: hz, set: setHz, min: 1, max: 10, step: 1, birim: "" },
          ].map(p => (
            <div key={p.key} style={{ marginBottom: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <span style={{ fontSize: 13, color: "#555", fontWeight: "bold" }}>{p.label}</span>
                <span style={{ fontSize: 15, color: renk, fontWeight: "bold", fontFamily: "monospace" }}>{p.val}{p.birim}</span>
              </div>
              <input type="range" min={p.min} max={p.max} step={p.step} value={p.val}
                onChange={e => { const v = parseInt(e.target.value); p.set(v); pGonder(p.key, v); }}
                style={{ width: "100%", accentColor: renk }} />
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#bbb" }}><span>{p.min}</span><span>{p.max}</span></div>
            </div>
          ))}
        </div>
      </>}

      {baglanti === "hata" && (
        <div style={{ background: "#fff5f5", borderRadius: 14, padding: 20, textAlign: "center", marginTop: 12 }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>📡</div>
          <div style={{ color: "#ef4444", fontWeight: "bold" }}>Cihaza ulaşılamıyor</div>
          <div style={{ fontSize: 12, color: "#aaa", marginTop: 4 }}>WiFi ve IP adresini kontrol edin</div>
          <button onClick={durumGuncelle} style={{ marginTop: 12, background: renkAcik, color: renk, border: "none", borderRadius: 10, padding: "10px 20px", fontWeight: "bold", cursor: "pointer" }}>Tekrar Dene</button>
        </div>
      )}
    </div>
  );
}

// ── MÜŞTERİ ──
function MusteriPanel({ esp32Ip }) {
  const [musteriler, setMusteriler] = useState([]);
  const [ekran, setEkran] = useState("liste");
  const [seciliMusteri, setSeciliMusteri] = useState(null);
  const [yeniIsim, setYeniIsim] = useState("");
  const [yeniTel, setYeniTel] = useState("");
  const [yeniNot, setYeniNot] = useState("");
  const [seansYontemi, setSeansYontemi] = useState(null);
  const [analizSonuc, setAnalizSonuc] = useState(null);
  const [analizYukleniyor, setAnalizYukleniyor] = useState(false);
  const [analizHata, setAnalizHata] = useState("");
  const [cameraAcik, setCameraAcik] = useState(false);
  const [yakalananFoto, setYakalananFoto] = useState(null);
  const [manuelNot, setManuelNot] = useState("");
  const [manuelEnerji, setManuelEnerji] = useState(5);
  const [manuelPulse, setManuelPulse] = useState(35);
  const [manuelHz, setManuelHz] = useState(8);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const dosyaRef = useRef(null);

  useEffect(() => {
    try { const m = localStorage.getItem("lazura_musteriler"); if (m) setMusteriler(JSON.parse(m)); } catch {}
  }, []);

  const kaydet = m => { try { localStorage.setItem("lazura_musteriler", JSON.stringify(m)); } catch {} };

  const musteriEkle = () => {
    if (!yeniIsim.trim()) return;
    const yeni = { id: Date.now(), isim: yeniIsim.trim(), telefon: yeniTel.trim(), notlar: yeniNot.trim(), kayitTarih: bugun(), seanslar: [] };
    const yM = [...musteriler, yeni];
    setMusteriler(yM); kaydet(yM); setYeniIsim(""); setYeniTel(""); setYeniNot(""); setEkran("liste");
  };

  const kameraAc = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } } });
      streamRef.current = stream;
      setCameraAcik(true);
      // DOM render bekliyoruz, sonra stream atıyoruz
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.muted = true;
          const p = videoRef.current.play();
          if (p !== undefined) p.catch(() => {});
        }
      }, 250);
    } catch (e) {
      alert("Kamera açılamadı: " + e.message);
      setSeansYontemi(null);
    }
  };

  const kameraKapat = () => {
    if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null; }
    setCameraAcik(false);
  };

  const fotografCek = () => {
    if (!videoRef.current || !canvasRef.current) return;
    const v = videoRef.current;
    const c = canvasRef.current;
    c.width = v.videoWidth || 640; c.height = v.videoHeight || 480;
    c.getContext("2d").drawImage(v, 0, 0);
    setYakalananFoto(c.toDataURL("image/jpeg", 0.85));
    kameraKapat();
  };

  const analizEt = async () => {
    if (!yakalananFoto || !seciliMusteri) return;
    setAnalizYukleniyor(true); setAnalizHata("");
    try {
      const sonuc = await ciltKilAnalizEt(yakalananFoto.split(",")[1], (seciliMusteri.seanslar?.length || 0) + 1, seciliMusteri.seanslar || []);
      setAnalizSonuc(sonuc);
      if (esp32Ip && sonuc.onerilen) { try { await esp32Set(esp32Ip, sonuc.onerilen); } catch {} }
    } catch (e) { setAnalizHata("Analiz başarısız: " + e.message); }
    setAnalizYukleniyor(false);
  };

  const seansKaydet = (seans) => {
    const yM = musteriler.map(m => m.id === seciliMusteri.id ? { ...m, seanslar: [...(m.seanslar || []), seans] } : m);
    const guncel = yM.find(m => m.id === seciliMusteri.id);
    setMusteriler(yM); kaydet(yM); setSeciliMusteri(guncel);
    setEkran("detay"); setAnalizSonuc(null); setYakalananFoto(null); setSeansYontemi(null); setManuelNot("");
    alert("Seans kaydedildi!");
  };

  const seansKaydetAnalizli = () => {
    if (!analizSonuc) return;
    seansKaydet({ seansNo: (seciliMusteri.seanslar?.length || 0) + 1, tarih: bugun(), foto: yakalananFoto, ciltTonu: analizSonuc.ciltTonu, kilKalinlik: analizSonuc.kilKalinlik, enerji: analizSonuc.onerilen?.enerji, pulse: analizSonuc.onerilen?.pulse, hz: analizSonuc.onerilen?.hz, atisAdedi: 0, notlar: analizSonuc.seansNotu });
  };

  const seansKaydetManuel = () => {
    if (esp32Ip) esp32Set(esp32Ip, { enerji: manuelEnerji, pulse: manuelPulse, hz: manuelHz }).catch(() => {});
    seansKaydet({ seansNo: (seciliMusteri.seanslar?.length || 0) + 1, tarih: bugun(), foto: null, ciltTonu: null, kilKalinlik: null, enerji: manuelEnerji, pulse: manuelPulse, hz: manuelHz, atisAdedi: 0, notlar: manuelNot || "Manuel seans" });
  };

  if (ekran === "seans") return (
    <div style={{ padding: 16 }}>
      <button onClick={() => { setEkran("detay"); kameraKapat(); setYakalananFoto(null); setAnalizSonuc(null); setSeansYontemi(null); }}
        style={{ background: renkAcik, border: "none", borderRadius: 18, padding: "8px 16px", color: renk, cursor: "pointer", fontWeight: "bold", marginBottom: 16 }}>← Geri</button>

      <div style={{ background: "white", borderRadius: 20, padding: 20, boxShadow: "0 2px 12px rgba(108,11,169,0.1)" }}>
        <div style={{ fontSize: 13, fontWeight: "bold", color: "#aaa", letterSpacing: 2, marginBottom: 16 }}>
          {seciliMusteri?.isim} — SEANS {(seciliMusteri?.seanslar?.length || 0) + 1}
        </div>

        {/* Yöntem seçici */}
        {!seansYontemi && !yakalananFoto && !analizSonuc && (
          <div>
            <div style={{ fontSize: 13, color: "#888", marginBottom: 14 }}>Seans nasıl kaydedilsin?</div>
            {/* Kamera */}
            <button onClick={() => { setSeansYontemi("kamera"); kameraAc(); }}
              style={{ width: "100%", padding: 16, background: renkAcik, border: "2px solid transparent", borderRadius: 14, marginBottom: 10, cursor: "pointer", textAlign: "left", display: "flex", alignItems: "center", gap: 14 }}>
              <span style={{ fontSize: 28 }}>📸</span>
              <div><div style={{ fontWeight: "bold", color: renk, fontSize: 15 }}>Kamera ile AI Analiz</div><div style={{ fontSize: 12, color: "#888", marginTop: 2 }}>Cilt fotoğrafı çek, yapay zeka analiz etsin</div></div>
            </button>
            {/* Galeri — label ile input direkt tetiklenir */}
            <label style={{ width: "100%", padding: 16, background: renkAcik, border: "2px solid transparent", borderRadius: 14, marginBottom: 10, cursor: "pointer", textAlign: "left", display: "flex", alignItems: "center", gap: 14, boxSizing: "border-box" }}>
              <span style={{ fontSize: 28 }}>🖼️</span>
              <div><div style={{ fontWeight: "bold", color: renk, fontSize: 15 }}>Galeriden Yükle</div><div style={{ fontSize: 12, color: "#888", marginTop: 2 }}>Mevcut fotoğraf seç, AI analiz etsin</div></div>
              <input type="file" accept="image/*" style={{ display: "none" }}
                onChange={e => {
                  const file = e.target.files?.[0]; if (!file) return;
                  setSeansYontemi("galeri");
                  const r = new FileReader(); r.onload = ev => setYakalananFoto(ev.target.result); r.readAsDataURL(file);
                }} />
            </label>
            {/* Manuel */}
            <button onClick={() => setSeansYontemi("manuel")}
              style={{ width: "100%", padding: 16, background: renkAcik, border: "2px solid transparent", borderRadius: 14, marginBottom: 10, cursor: "pointer", textAlign: "left", display: "flex", alignItems: "center", gap: 14 }}>
              <span style={{ fontSize: 28 }}>✏️</span>
              <div><div style={{ fontWeight: "bold", color: renk, fontSize: 15 }}>Manuel Not + Parametre</div><div style={{ fontSize: 12, color: "#888", marginTop: 2 }}>Kamerasız, elle not ve parametre gir</div></div>
            </button>
          </div>
        )}

        {/* Kamera */}
        {seansYontemi === "kamera" && !yakalananFoto && (
          <div>
            {cameraAcik ? (
              <div>
                <video ref={videoRef} autoPlay playsInline muted
                  style={{ width: "100%", borderRadius: 14, background: "#111", minHeight: 220, display: "block" }} />
                <canvas ref={canvasRef} style={{ display: "none" }} />
                <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
                  <button onClick={fotografCek} style={{ flex: 1, padding: 14, background: renk, color: "white", border: "none", borderRadius: 12, fontWeight: "bold", cursor: "pointer", fontSize: 15 }}>📷 Çek</button>
                  <button onClick={() => { kameraKapat(); setSeansYontemi(null); }} style={{ padding: 14, background: renkAcik, color: renk, border: "none", borderRadius: 12, fontWeight: "bold", cursor: "pointer" }}>İptal</button>
                </div>
                <div style={{ fontSize: 11, color: "#aaa", textAlign: "center", marginTop: 8 }}>Cilt bölgesini iyi aydınlatılmış şekilde kameraya tut</div>
              </div>
            ) : (
              <div style={{ textAlign: "center", padding: 30, color: "#aaa" }}><div style={{ fontSize: 32 }}>📸</div><div style={{ marginTop: 8 }}>Kamera başlatılıyor...</div></div>
            )}
          </div>
        )}

        {/* Fotoğraf analiz */}
        {yakalananFoto && !analizSonuc && (
          <div>
            <img src={yakalananFoto} alt="" style={{ width: "100%", borderRadius: 14, marginBottom: 14, maxHeight: 280, objectFit: "cover" }} />
            {analizHata && <div style={{ color: "#ef4444", fontSize: 13, marginBottom: 10 }}>{analizHata}</div>}
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={analizEt} disabled={analizYukleniyor}
                style={{ flex: 1, padding: 14, background: renk, color: "white", border: "none", borderRadius: 12, fontWeight: "bold", cursor: "pointer", opacity: analizYukleniyor ? 0.6 : 1, fontSize: 15 }}>
                {analizYukleniyor ? "🔍 Analiz ediliyor..." : "🤖 AI ile Analiz Et"}
              </button>
              <button onClick={() => { setYakalananFoto(null); setSeansYontemi(null); }}
                style={{ padding: 14, background: renkAcik, color: renk, border: "none", borderRadius: 12, fontWeight: "bold", cursor: "pointer" }}>Tekrar</button>
            </div>
          </div>
        )}

        {/* Analiz sonucu */}
        {analizSonuc && (
          <div>
            {yakalananFoto && <img src={yakalananFoto} alt="" style={{ width: "100%", borderRadius: 14, marginBottom: 14, maxHeight: 200, objectFit: "cover" }} />}
            <div style={{ background: renkAcik, borderRadius: 14, padding: 14, marginBottom: 12 }}>
              <div style={{ fontSize: 12, fontWeight: "bold", color: renk, marginBottom: 10 }}>🔬 ANALİZ</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                {[["Cilt Tonu", `Tip ${analizSonuc.ciltTonu} — ${analizSonuc.ciltAciklama}`], ["Kıl Rengi", analizSonuc.kilRenk], ["Kıl Kalınlığı", analizSonuc.kilKalinlik], ["Kıl Yoğunluğu", analizSonuc.kilYogunluk]].map(([k, v]) => (
                  <div key={k} style={{ background: "white", borderRadius: 10, padding: 10 }}>
                    <div style={{ fontSize: 10, color: "#aaa" }}>{k}</div>
                    <div style={{ fontSize: 12, fontWeight: "bold", color: "#333", marginTop: 2 }}>{v}</div>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ background: `linear-gradient(135deg, #1a0030, ${renk})`, borderRadius: 14, padding: 16, marginBottom: 12, color: "white" }}>
              <div style={{ fontSize: 11, opacity: 0.7, marginBottom: 10 }}>⚡ ÖNERİLEN PARAMETRELER</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, textAlign: "center" }}>
                {[["ENERJİ", analizSonuc.onerilen?.enerji, ""], ["PULSE", analizSonuc.onerilen?.pulse, "ms"], ["HIZ", analizSonuc.onerilen?.hz, ""]].map(([k, v, b]) => (
                  <div key={k}><div style={{ fontSize: 22, fontWeight: "bold", fontFamily: "monospace" }}>{v}{b}</div><div style={{ fontSize: 10, opacity: 0.7 }}>{k}</div></div>
                ))}
              </div>
              {esp32Ip && <div style={{ fontSize: 11, opacity: 0.6, marginTop: 8, textAlign: "center" }}>✓ Cihaza gönderildi</div>}
            </div>
            <div style={{ background: "#f0fdf4", borderRadius: 14, padding: 14, marginBottom: 12, borderLeft: "4px solid #22c55e" }}>
              <div style={{ fontSize: 11, fontWeight: "bold", color: "#22c55e", marginBottom: 6 }}>💬 MÜŞTERİYE</div>
              <div style={{ fontSize: 13, color: "#333", lineHeight: 1.5 }}>{analizSonuc.seansNotu}</div>
            </div>
            {analizSonuc.uyari ? <div style={{ background: "#fff7ed", borderRadius: 14, padding: 14, marginBottom: 12, borderLeft: "4px solid #f59e0b" }}><div style={{ fontSize: 11, fontWeight: "bold", color: "#f59e0b", marginBottom: 4 }}>⚠️ UYARI</div><div style={{ fontSize: 13, color: "#333" }}>{analizSonuc.uyari}</div></div> : null}
            <button onClick={seansKaydetAnalizli} style={{ width: "100%", padding: 16, background: renk, color: "white", border: "none", borderRadius: 14, fontSize: 15, fontWeight: "bold", cursor: "pointer" }}>✓ SEANSI KAYDET</button>
          </div>
        )}

        {/* Manuel */}
        {seansYontemi === "manuel" && !analizSonuc && (
          <div>
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 12, color: "#888", marginBottom: 6 }}>Seans Notu</div>
              <textarea style={{ width: "92%", padding: 12, borderRadius: 12, border: `2px solid ${renkAcik}`, fontSize: 14, outline: "none", resize: "none", minHeight: 80, fontFamily: "sans-serif" }}
                placeholder="Müşteri geri bildirimi, gözlemler..." value={manuelNot} onChange={e => setManuelNot(e.target.value)} />
            </div>
            {[{ label: "ENERJİ", val: manuelEnerji, set: setManuelEnerji, min: 1, max: 20, step: 1 }, { label: "PULSE (ms)", val: manuelPulse, set: setManuelPulse, min: 35, max: 200, step: 5 }, { label: "ATIŞ HIZI", val: manuelHz, set: setManuelHz, min: 1, max: 10, step: 1 }].map(p => (
              <div key={p.label} style={{ marginBottom: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <span style={{ fontSize: 13, color: "#555", fontWeight: "bold" }}>{p.label}</span>
                  <span style={{ fontSize: 14, color: renk, fontWeight: "bold", fontFamily: "monospace" }}>{p.val}</span>
                </div>
                <input type="range" min={p.min} max={p.max} step={p.step} value={p.val} onChange={e => p.set(parseInt(e.target.value))} style={{ width: "100%", accentColor: renk }} />
              </div>
            ))}
            <button onClick={seansKaydetManuel} style={{ width: "100%", padding: 16, background: renk, color: "white", border: "none", borderRadius: 14, fontSize: 15, fontWeight: "bold", cursor: "pointer", marginTop: 8 }}>✓ SEANSI KAYDET</button>
          </div>
        )}
      </div>
    </div>
  );

  if (ekran === "detay" && seciliMusteri) return (
    <div style={{ padding: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <button onClick={() => setEkran("liste")} style={{ background: renkAcik, border: "none", borderRadius: 18, padding: "8px 16px", color: renk, cursor: "pointer", fontWeight: "bold" }}>← Geri</button>
        <div style={{ fontSize: 17, fontWeight: "bold", color: renk }}>{seciliMusteri.isim}</div>
        <button onClick={() => { setSeansYontemi(null); setYakalananFoto(null); setAnalizSonuc(null); setEkran("seans"); }}
          style={{ background: renk, border: "none", borderRadius: 18, padding: "8px 14px", color: "white", cursor: "pointer", fontWeight: "bold", fontSize: 13 }}>+ Seans</button>
      </div>
      <div style={{ background: "white", borderRadius: 16, padding: 18, marginBottom: 14, boxShadow: "0 2px 8px rgba(108,11,169,0.07)" }}>
        {seciliMusteri.telefon && <div style={{ fontSize: 14, color: "#555", marginBottom: 4 }}>📞 {seciliMusteri.telefon}</div>}
        {seciliMusteri.notlar && <div style={{ fontSize: 13, color: "#888" }}>📝 {seciliMusteri.notlar}</div>}
        <div style={{ fontSize: 11, color: "#bbb", marginTop: 8 }}>Kayıt: {seciliMusteri.kayitTarih}</div>
      </div>
      <div style={{ fontSize: 12, fontWeight: "bold", color: "#aaa", letterSpacing: 2, marginBottom: 10 }}>SEANS GEÇMİŞİ ({seciliMusteri.seanslar?.length || 0})</div>
      {(!seciliMusteri.seanslar || seciliMusteri.seanslar.length === 0)
        ? <div style={{ textAlign: "center", padding: 40, color: "#bbb" }}><div style={{ fontSize: 40 }}>📋</div><div style={{ marginTop: 8 }}>Seans yok — + Seans butonuna bas</div></div>
        : [...seciliMusteri.seanslar].reverse().map((s, i) => (
          <div key={i} style={{ background: "white", borderRadius: 14, padding: 16, marginBottom: 10, boxShadow: "0 2px 8px rgba(108,11,169,0.07)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
              <div style={{ fontWeight: "bold", color: renk }}>Seans {s.seansNo}</div>
              <div style={{ fontSize: 11, color: "#bbb" }}>{s.tarih}</div>
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 6 }}>
              {s.ciltTonu && <span style={{ background: renkAcik, color: renk, padding: "3px 8px", borderRadius: 20, fontSize: 11, fontWeight: "bold" }}>Cilt T{s.ciltTonu}</span>}
              {s.kilKalinlik && <span style={{ background: renkAcik, color: renk, padding: "3px 8px", borderRadius: 20, fontSize: 11, fontWeight: "bold" }}>{s.kilKalinlik}</span>}
              {s.enerji && <span style={{ background: renkAcik, color: renk, padding: "3px 8px", borderRadius: 20, fontSize: 11, fontWeight: "bold" }}>E:{s.enerji}</span>}
              {s.pulse && <span style={{ background: renkAcik, color: renk, padding: "3px 8px", borderRadius: 20, fontSize: 11, fontWeight: "bold" }}>P:{s.pulse}ms</span>}
              {s.hz && <span style={{ background: renkAcik, color: renk, padding: "3px 8px", borderRadius: 20, fontSize: 11, fontWeight: "bold" }}>Hz:{s.hz}</span>}
            </div>
            {s.notlar && <div style={{ fontSize: 12, color: "#666", fontStyle: "italic" }}>"{s.notlar}"</div>}
          </div>
        ))}
    </div>
  );

  if (ekran === "yeni") return (
    <div style={{ padding: 16 }}>
      <button onClick={() => setEkran("liste")} style={{ background: renkAcik, border: "none", borderRadius: 18, padding: "8px 16px", color: renk, cursor: "pointer", fontWeight: "bold", marginBottom: 16 }}>← Geri</button>
      <div style={{ background: "white", borderRadius: 20, padding: 24, boxShadow: "0 2px 12px rgba(108,11,169,0.1)" }}>
        <div style={{ fontSize: 13, fontWeight: "bold", color: "#aaa", letterSpacing: 2, marginBottom: 16 }}>YENİ MÜŞTERİ</div>
        {[{ label: "İsim *", val: yeniIsim, set: setYeniIsim, pl: "Ayşe Yılmaz" }, { label: "Telefon", val: yeniTel, set: setYeniTel, pl: "05xx xxx xx xx" }, { label: "Not", val: yeniNot, set: setYeniNot, pl: "Alerji, özel durum..." }].map(f => (
          <div key={f.label} style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 12, color: "#888", marginBottom: 6 }}>{f.label}</div>
            <input style={{ width: "88%", padding: 12, borderRadius: 12, border: `2px solid ${renkAcik}`, fontSize: 15, outline: "none" }} placeholder={f.pl} value={f.val} onChange={e => f.set(e.target.value)} />
          </div>
        ))}
        <button onClick={musteriEkle} disabled={!yeniIsim.trim()} style={{ width: "100%", padding: 16, background: renk, color: "white", border: "none", borderRadius: 14, fontSize: 15, fontWeight: "bold", cursor: "pointer", opacity: yeniIsim.trim() ? 1 : 0.4 }}>KAYDET</button>
      </div>
    </div>
  );

  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div style={{ fontSize: 13, fontWeight: "bold", color: "#aaa", letterSpacing: 2 }}>MÜŞTERİLER ({musteriler.length})</div>
        <button onClick={() => setEkran("yeni")} style={{ width: 36, height: 36, borderRadius: 18, background: renk, color: "white", border: "none", fontSize: 24, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>+</button>
      </div>
      {musteriler.length === 0
        ? <div style={{ textAlign: "center", padding: 60, color: "#bbb" }}><div style={{ fontSize: 48 }}>👥</div><div style={{ marginTop: 8 }}>Henüz müşteri yok</div></div>
        : musteriler.map(m => (
          <div key={m.id} onClick={() => { setSeciliMusteri(m); setEkran("detay"); }}
            style={{ background: "white", borderRadius: 14, padding: "16px 18px", marginBottom: 10, cursor: "pointer", boxShadow: "0 2px 8px rgba(108,11,169,0.07)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontSize: 16, fontWeight: "bold" }}>{m.isim}</div>
              <div style={{ fontSize: 11, color: "#bbb", marginTop: 2 }}>{m.seanslar?.length || 0} seans · {m.kayitTarih}</div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {(m.seanslar?.length || 0) > 0 && <span style={{ background: renkAcik, color: renk, padding: "3px 10px", borderRadius: 20, fontSize: 12, fontWeight: "bold" }}>Seans {m.seanslar.length}</span>}
              <span style={{ fontSize: 20, color: "#ccc" }}>›</span>
            </div>
          </div>
        ))}
    </div>
  );
}

// ── ANA APP ──
export default function App() {
  const [mod, setMod] = useState("giris");
  const [girisTipi, setGirisTipi] = useState("secim");
  const [sifreGirdi, setSifreGirdi] = useState("");
  const [firmaKodGirdi, setFirmaKodGirdi] = useState("");
  const [hata, setHata] = useState("");
  const [cihazlar, setCihazlar] = useState([]);
  const [firmaSayaclari, setFirmaSayaclari] = useState({});
  const [firmaSifreleri, setFirmaSifreleri] = useState({});
  const [aktifFirma, setAktifFirma] = useState(null);
  const [ekran, setEkran] = useState("liste");
  const [seciliCihaz, setSeciliCihaz] = useState(null);
  const [detayCihaz, setDetayCihaz] = useState(null);
  const [yeniAtis, setYeniAtis] = useState("");
  const [fsKodNoGirdi, setFsKodNoGirdi] = useState("");
  const [uretilmisKod, setUretilmisKod] = useState("");
  const [seciliFirma, setSeciliFirma] = useState(null);
  const [kopyalandiMetin, setKopyalandiMetin] = useState("");
  const [firmaSifreTaslaklari, setFirmaSifreTaslaklari] = useState({});
  const [aktifTab, setAktifTab] = useState("kontrol");
  const [esp32Ip, setEsp32Ip] = useState(() => localStorage.getItem("lazura_esp32_ip") || "");

  useEffect(() => {
    try {
      const c = localStorage.getItem("lazura_cihazlar");
      const f = localStorage.getItem("lazura_firmaSayaclari");
      const s = localStorage.getItem("lazura_firmaSifreleri");
      if (c) setCihazlar(JSON.parse(c));
      if (f) setFirmaSayaclari(JSON.parse(f));
      if (s) setFirmaSifreleri(JSON.parse(s));
    } catch {}
  }, []);

  useEffect(() => {
    if (!seciliCihaz) { setFsKodNoGirdi(""); return; }
    if (seciliCihaz.firmaKodu !== "FS") { setFsKodNoGirdi(""); return; }
    setFsKodNoGirdi(String(seciliCihaz.fsKodNo || 1));
  }, [seciliCihaz]);

  const kaydet = (c, f) => { try { localStorage.setItem("lazura_cihazlar", JSON.stringify(c)); localStorage.setItem("lazura_firmaSayaclari", JSON.stringify(f)); } catch {} };
  const esp32IpKaydet = ip => { setEsp32Ip(ip); localStorage.setItem("lazura_esp32_ip", ip); };

  const adminGiris = () => {
    if (sifreGirdi === ADMIN_SIFRE) { setMod("admin"); setHata(""); setSifreGirdi(""); }
    else { setHata("Yanlış şifre!"); setSifreGirdi(""); }
  };

  const firmaGiris = () => {
    const kod = firmaKodGirdi.toUpperCase().trim();
    const firma = FIRMALAR.find(f => f.kod === kod);
    if (!firma) { setHata("Firma bulunamadı!"); return; }
    const ds = firmaSifreleri[kod];
    if (!ds) { setHata("Bu firma için şifre tanımlanmamış!"); return; }
    if (sifreGirdi !== ds) { setHata("Yanlış şifre!"); setSifreGirdi(""); return; }
    setAktifFirma(firma); setMod("firma"); setHata(""); setSifreGirdi(""); setFirmaKodGirdi("");
  };

  const cikisYap = () => { setMod("giris"); setGirisTipi("secim"); setEkran("liste"); setAktifFirma(null); setUretilmisKod(""); setHata(""); setDetayCihaz(null); };

  const cihazEkle = () => {
    if (!seciliFirma) return;
    const { sayac, seriNo } = seriNoUret(seciliFirma.kod, firmaSayaclari);
    const yeni = { id: Date.now(), firmaKodu: seciliFirma.kod, firmaAd: seciliFirma.ad, seriNo, kalanAtis: 0, sonsuzMod: true, sonSifre: "", sonAtisYukleme: 0, fsKodNo: seciliFirma.kod === "FS" ? 1 : undefined, tarih: bugun(), gecmis: [] };
    const yC = [...cihazlar, yeni]; const yF = { ...firmaSayaclari, [seciliFirma.kod]: sayac };
    setCihazlar(yC); setFirmaSayaclari(yF); kaydet(yC, yF); setSeciliFirma(null); setEkran("liste");
  };

  const sifreUretVeYukle = () => {
    const adet = parseInt(yeniAtis); if (!adet || adet <= 0) return;
    const fsMi = seciliCihaz.firmaKodu === "FS";
    const fsKodNo = fsMi ? (fsKodNoGirdi.trim() === "" ? 1 : parseInt(fsKodNoGirdi)) : undefined;
    if (fsMi && !FS_PAKETLER.includes(adet)) { alert(`FS paketler: ${FS_PAKETLER.join(", ")}`); return; }
    if (fsMi && (Number.isNaN(fsKodNo) || fsKodNo <= 0)) { alert("FS Kod No geçersiz!"); return; }
    const kod = sifreUret(seciliCihaz.seriNo, adet, fsKodNo);
    const yeniKayit = { tarih: bugun(), adet, kod, fsKodNo: fsMi ? fsKodNo : undefined };
    const yC = cihazlar.map(c => c.id === seciliCihaz.id ? { ...c, kalanAtis: c.kalanAtis + adet, sonSifre: kod, sonAtisYukleme: adet, sonsuzMod: false, sonFsKodNo: fsMi ? fsKodNo : c.sonFsKodNo, fsKodNo: fsMi ? (fsKodNo === 0 ? 0 : fsKodNo + 1) : c.fsKodNo, gecmis: [yeniKayit, ...(c.gecmis || [])].slice(0, 20) } : c);
    const guncel = yC.find(c => c.id === seciliCihaz.id);
    setCihazlar(yC); setSeciliCihaz(guncel); kaydet(yC, firmaSayaclari);
    if (fsMi && guncel && typeof guncel.fsKodNo === "number") setFsKodNoGirdi(String(guncel.fsKodNo));
    setUretilmisKod(kod); setYeniAtis("");
  };

  const sonsuzToggle = () => {
    const yC = cihazlar.map(c => c.id === seciliCihaz.id ? { ...c, sonsuzMod: !c.sonsuzMod } : c);
    setCihazlar(yC); setSeciliCihaz(yC.find(c => c.id === seciliCihaz.id)); kaydet(yC, firmaSayaclari);
  };

  const fsKodNoKaydet = yeniNo => {
    const no = parseInt(yeniNo); if (Number.isNaN(no) || no <= 0) return;
    const yC = cihazlar.map(c => c.id === seciliCihaz.id ? { ...c, fsKodNo: no } : c);
    setCihazlar(yC); setSeciliCihaz(yC.find(c => c.id === seciliCihaz.id)); kaydet(yC, firmaSayaclari); setFsKodNoGirdi(String(no));
  };

  const sinirsizKodUret = () => {
    if (!seciliCihaz || seciliCihaz.firmaKodu !== "FS") return;
    const fsKodNo = fsKodNoGirdi.trim() === "" ? 1 : parseInt(fsKodNoGirdi);
    if (Number.isNaN(fsKodNo) || fsKodNo <= 0) { alert("FS Kod No geçersiz!"); return; }
    const kod = aktivasyonKoduHesapla(seciliCihaz.seriNo, FS_PAKET_SINIRSIZ, fsKodNo);
    const yeniKayit = { tarih: bugun(), adet: -1, kod, fsKodNo };
    const yC = cihazlar.map(c => c.id === seciliCihaz.id ? { ...c, sonSifre: kod, sonAtisYukleme: -1, sonsuzMod: true, sonFsKodNo: fsKodNo, fsKodNo: fsKodNo + 1, gecmis: [yeniKayit, ...(c.gecmis || [])].slice(0, 20) } : c);
    const guncel = yC.find(c => c.id === seciliCihaz.id);
    setCihazlar(yC); setSeciliCihaz(guncel); kaydet(yC, firmaSayaclari);
    if (guncel && typeof guncel.fsKodNo === "number") setFsKodNoGirdi(String(guncel.fsKodNo));
    setUretilmisKod(kod); setYeniAtis("");
  };

  const gecmisTemizle = cihazId => {
    if (!window.confirm("Kontör geçmişi silinsin mi?")) return;
    const yC = cihazlar.map(c => c.id === cihazId ? { ...c, gecmis: [] } : c);
    const guncel = yC.find(c => c.id === cihazId);
    setCihazlar(yC); if (seciliCihaz?.id === cihazId) setSeciliCihaz(guncel); if (detayCihaz?.id === cihazId) setDetayCihaz(guncel); kaydet(yC, firmaSayaclari);
  };

  const firmaSifresiKaydet = kod => {
    const taslak = firmaSifreTaslaklari[kod] || ""; if (!taslak.trim()) return;
    const yS = { ...firmaSifreleri, [kod]: taslak.trim() };
    setFirmaSifreleri(yS); localStorage.setItem("lazura_firmaSifreleri", JSON.stringify(yS));
    setFirmaSifreTaslaklari(prev => ({ ...prev, [kod]: "" })); alert("Şifre kaydedildi!");
  };

  const kopyala = metin => {
    const yaz = async () => { if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(metin); return; } const el = document.createElement("textarea"); el.value = metin; el.setAttribute("readonly", ""); el.style.position = "fixed"; el.style.top = "-1000px"; document.body.appendChild(el); el.select(); document.execCommand("copy"); document.body.removeChild(el); };
    yaz().finally(() => { setKopyalandiMetin(metin); setTimeout(() => setKopyalandiMetin(""), 2000); });
  };

  // GİRİŞ EKRANLARI
  if (mod === "giris") {
    if (girisTipi === "secim") return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "linear-gradient(135deg,#1a0030,#4a0070)", fontFamily: "sans-serif" }}>
        <div style={{ background: "white", borderRadius: 24, padding: "44px 32px", width: 300, textAlign: "center", boxShadow: "0 24px 60px rgba(0,0,0,0.5)" }}>
          <div style={{ fontSize: 52, marginBottom: 8 }}>🪄</div>
          <div style={{ fontSize: 22, fontWeight: "bold", color: renk, letterSpacing: 2, marginBottom: 4 }}>LAZURA COD</div>
          <div style={{ fontSize: 12, color: "#aaa", marginBottom: 36 }}>Lazer Kontrol Sistemi</div>
          <button onClick={() => setGirisTipi("admin")} style={{ width: "100%", padding: 16, background: renk, color: "white", border: "none", borderRadius: 14, fontSize: 16, fontWeight: "bold", cursor: "pointer", marginBottom: 12 }}>🔐 Yönetici Girişi</button>
          <button onClick={() => setGirisTipi("firma")} style={{ width: "100%", padding: 16, background: "white", color: renk, border: `2px solid ${renk}`, borderRadius: 14, fontSize: 16, fontWeight: "bold", cursor: "pointer" }}>🏢 Firma Girişi</button>
        </div>
      </div>
    );
    if (girisTipi === "admin") return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "linear-gradient(135deg,#1a0030,#4a0070)", fontFamily: "sans-serif" }}>
        <div style={{ background: "white", borderRadius: 24, padding: "44px 32px", width: 300, textAlign: "center", boxShadow: "0 24px 60px rgba(0,0,0,0.5)" }}>
          <button onClick={() => { setGirisTipi("secim"); setHata(""); }} style={{ background: renkAcik, border: "none", borderRadius: 20, padding: "6px 14px", color: renk, cursor: "pointer", marginBottom: 20, fontWeight: "bold" }}>← Geri</button>
          <div style={{ fontSize: 36, marginBottom: 8 }}>🔐</div>
          <div style={{ fontSize: 20, fontWeight: "bold", color: renk, marginBottom: 24 }}>YÖNETİCİ GİRİŞİ</div>
          <input style={{ width: "88%", padding: 14, borderRadius: 12, border: `2px solid ${renkAcik}`, fontSize: 18, textAlign: "center", marginBottom: 8, letterSpacing: 4, outline: "none" }}
            type="password" placeholder="Yönetici şifresi" value={sifreGirdi} onChange={e => setSifreGirdi(e.target.value)} onKeyDown={e => e.key === "Enter" && adminGiris()} />
          {hata && <div style={{ color: renk, fontSize: 13, marginBottom: 10 }}>{hata}</div>}
          <button style={{ width: "100%", padding: 14, background: renk, color: "white", border: "none", borderRadius: 12, fontSize: 15, fontWeight: "bold", cursor: "pointer" }} onClick={adminGiris}>GİRİŞ YAP</button>
        </div>
      </div>
    );
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "linear-gradient(135deg,#1a0030,#4a0070)", fontFamily: "sans-serif" }}>
        <div style={{ background: "white", borderRadius: 24, padding: "44px 32px", width: 300, textAlign: "center", boxShadow: "0 24px 60px rgba(0,0,0,0.5)" }}>
          <button onClick={() => { setGirisTipi("secim"); setHata(""); }} style={{ background: renkAcik, border: "none", borderRadius: 20, padding: "6px 14px", color: renk, cursor: "pointer", marginBottom: 20, fontWeight: "bold" }}>← Geri</button>
          <div style={{ fontSize: 36, marginBottom: 8 }}>🏢</div>
          <div style={{ fontSize: 20, fontWeight: "bold", color: renk, marginBottom: 24 }}>FİRMA GİRİŞİ</div>
          <input style={{ width: "88%", padding: 12, borderRadius: 12, border: `2px solid ${renkAcik}`, fontSize: 16, textAlign: "center", marginBottom: 10, letterSpacing: 3, outline: "none" }}
            placeholder="Firma Kodu (örn: LU)" value={firmaKodGirdi} onChange={e => setFirmaKodGirdi(e.target.value.toUpperCase())} />
          <input style={{ width: "88%", padding: 12, borderRadius: 12, border: `2px solid ${renkAcik}`, fontSize: 16, textAlign: "center", marginBottom: 10, letterSpacing: 4, outline: "none" }}
            type="password" placeholder="Firma şifresi" value={sifreGirdi} onChange={e => setSifreGirdi(e.target.value)} onKeyDown={e => e.key === "Enter" && firmaGiris()} />
          {hata && <div style={{ color: renk, fontSize: 13, marginBottom: 10 }}>{hata}</div>}
          <button style={{ width: "100%", padding: 14, background: renk, color: "white", border: "none", borderRadius: 12, fontSize: 15, fontWeight: "bold", cursor: "pointer" }} onClick={firmaGiris}>GİRİŞ YAP</button>
        </div>
      </div>
    );
  }

  // FİRMA PANELİ
  if (mod === "firma" && aktifFirma) {
    const firmaCihazlar = cihazlar.filter(c => c.firmaKodu === aktifFirma.kod);
    if (detayCihaz) {
      const c = cihazlar.find(x => x.id === detayCihaz.id) || detayCihaz;
      return (
        <div style={{ minHeight: "100vh", background: "#f5f0ff", fontFamily: "sans-serif", maxWidth: 430, margin: "0 auto" }}>
          <div style={{ background: "white", padding: "16px 20px", display: "flex", alignItems: "center", gap: 12, borderBottom: "1px solid #eee" }}>
            <button onClick={() => setDetayCihaz(null)} style={{ background: renkAcik, border: "none", borderRadius: 18, width: 36, height: 36, fontSize: 20, cursor: "pointer" }}>←</button>
            <div><div style={{ fontSize: 17, fontWeight: "bold", color: renk, fontFamily: "monospace" }}>{c.seriNo}</div><div style={{ fontSize: 12, color: "#aaa" }}>{c.tarih}</div></div>
          </div>
          <div style={{ padding: 20 }}>
            <div style={{ background: "white", borderRadius: 20, padding: 28, marginBottom: 14, textAlign: "center", boxShadow: "0 2px 12px rgba(108,11,169,0.1)" }}>
              <div style={{ fontSize: 64, fontWeight: "bold", color: renk, fontFamily: "monospace" }}>{c.sonsuzMod ? "∞" : c.kalanAtis.toLocaleString()}</div>
              <div style={{ fontSize: 11, color: "#aaa", letterSpacing: 3 }}>KALAN ATIŞ</div>
            </div>
            <div style={{ background: "white", borderRadius: 16, padding: "16px 18px", boxShadow: "0 2px 8px rgba(0,0,0,0.06)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <div style={{ fontSize: 12, fontWeight: "bold", color: "#aaa", letterSpacing: 2 }}>KONTÖR GEÇMİŞİ</div>
                {!!c.gecmis?.length && <button onClick={() => gecmisTemizle(c.id)} style={{ background: renkAcik, color: renk, border: "none", borderRadius: 10, padding: "8px 10px", fontSize: 12, cursor: "pointer", fontWeight: "bold" }}>Temizle</button>}
              </div>
              {(!c.gecmis || c.gecmis.length === 0) ? <div style={{ color: "#bbb", textAlign: "center", padding: 16 }}>Henüz kontör yüklenmedi</div>
                : c.gecmis.map((g, i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: i < c.gecmis.length - 1 ? "1px solid #f5f0ff" : "none" }}>
                    <div><div style={{ fontSize: 14, fontWeight: "bold" }}>{g.adet === -1 ? "+∞ atış" : `+${g.adet.toLocaleString()} atış`}</div><div style={{ fontSize: 11, color: "#bbb" }}>{g.tarih}</div></div>
                    <div style={{ fontFamily: "monospace", fontSize: 16, fontWeight: "bold", color: renk }}>{g.kod}</div>
                  </div>
                ))}
            </div>
          </div>
        </div>
      );
    }
    return (
      <div style={{ minHeight: "100vh", background: "#f5f0ff", fontFamily: "sans-serif", maxWidth: 430, margin: "0 auto" }}>
        <div style={{ background: "white", padding: "16px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #eee" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}><span style={{ fontSize: 28 }}>🪄</span><div><div style={{ fontSize: 16, fontWeight: "bold", color: renk }}>LAZURA COD</div><div style={{ fontSize: 12, color: "#aaa" }}>{aktifFirma.ad}</div></div></div>
          <button onClick={cikisYap} style={{ background: renkAcik, border: "none", borderRadius: 20, padding: "6px 14px", color: renk, cursor: "pointer", fontWeight: "bold", fontSize: 13 }}>Çıkış</button>
        </div>
        <div style={{ padding: 16 }}>
          <div style={{ background: `linear-gradient(135deg, #1a0030, ${renk})`, borderRadius: 20, padding: 24, marginBottom: 20, color: "white" }}>
            <div style={{ fontSize: 13, opacity: 0.8, marginBottom: 8 }}>Toplam Makine</div>
            <div style={{ fontSize: 48, fontWeight: "bold", marginBottom: 4 }}>{firmaCihazlar.length}</div>
            <div style={{ fontSize: 13, opacity: 0.8 }}>Aktif: {firmaCihazlar.filter(c => !c.sonsuzMod && c.kalanAtis > 0).length} | Sonsuz: {firmaCihazlar.filter(c => c.sonsuzMod).length}</div>
          </div>
          {firmaCihazlar.length === 0 ? <div style={{ textAlign: "center", paddingTop: 40, color: "#aaa" }}>Henüz makine yok</div>
            : firmaCihazlar.map(cihaz => (
              <div key={cihaz.id} onClick={() => setDetayCihaz(cihaz)}
                style={{ background: "white", borderRadius: 14, padding: "16px 18px", marginBottom: 10, cursor: "pointer", boxShadow: "0 2px 8px rgba(108,11,169,0.07)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div><div style={{ fontSize: 17, fontWeight: "bold", fontFamily: "monospace" }}>{cihaz.seriNo}</div><div style={{ fontSize: 11, color: "#bbb", marginTop: 2 }}>{cihaz.tarih}</div></div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  {cihaz.sonsuzMod ? <span style={{ background: renkAcik, color: renk, padding: "4px 10px", borderRadius: 20, fontSize: 12, fontWeight: "bold" }}>∞ SONSUZ</span>
                    : <span style={{ fontSize: 14, fontWeight: "bold", fontFamily: "monospace", color: cihaz.kalanAtis > 100 ? "#2d7a2d" : "#cc0000" }}>{cihaz.kalanAtis.toLocaleString()} atış</span>}
                  <span style={{ fontSize: 20, color: "#ccc" }}>›</span>
                </div>
              </div>
            ))}
        </div>
      </div>
    );
  }

  // ADMIN ALT EKRANLAR
  if (ekran === "firmaSifreleri") return (
    <div style={{ minHeight: "100vh", background: "#f5f0ff", fontFamily: "sans-serif", maxWidth: 430, margin: "0 auto" }}>
      <div style={{ background: "white", padding: "16px 20px", display: "flex", alignItems: "center", gap: 12, borderBottom: "1px solid #eee" }}>
        <button onClick={() => setEkran("liste")} style={{ background: renkAcik, border: "none", borderRadius: 18, width: 36, height: 36, fontSize: 20, cursor: "pointer" }}>←</button>
        <b style={{ fontSize: 17, color: renk }}>FİRMA ŞİFRELERİ</b>
      </div>
      <div style={{ padding: 20 }}>
        {FIRMALAR.map(f => (
          <div key={f.kod} style={{ background: "white", borderRadius: 14, padding: 16, marginBottom: 12, boxShadow: "0 2px 8px rgba(0,0,0,0.06)" }}>
            <div style={{ marginBottom: 10 }}><div style={{ fontWeight: "bold", fontSize: 16 }}>{f.ad}</div><div style={{ fontSize: 12, color: "#aaa" }}>Mevcut: {firmaSifreleri[f.kod] ? <span style={{ color: renk, fontWeight: "bold" }}>{firmaSifreleri[f.kod]}</span> : <span style={{ color: "#ccc" }}>Tanımlanmamış</span>}</div></div>
            <div style={{ display: "flex", gap: 8 }}>
              <input style={{ flex: 1, padding: 10, borderRadius: 10, border: `2px solid ${renkAcik}`, fontSize: 15, outline: "none" }} placeholder="Yeni şifre..." value={firmaSifreTaslaklari[f.kod] || ""} onChange={e => setFirmaSifreTaslaklari(prev => ({ ...prev, [f.kod]: e.target.value }))} />
              <button onClick={() => firmaSifresiKaydet(f.kod)} style={{ padding: "10px 16px", background: renk, color: "white", border: "none", borderRadius: 10, fontWeight: "bold", cursor: "pointer" }}>Kaydet</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  if (ekran === "yeniCihaz") return (
    <div style={{ minHeight: "100vh", background: "#f5f0ff", fontFamily: "sans-serif", maxWidth: 430, margin: "0 auto" }}>
      <div style={{ background: "white", padding: "16px 20px", display: "flex", alignItems: "center", gap: 12, borderBottom: "1px solid #eee" }}>
        <button onClick={() => { setEkran("liste"); setSeciliFirma(null); }} style={{ background: renkAcik, border: "none", borderRadius: 18, width: 36, height: 36, fontSize: 20, cursor: "pointer" }}>←</button>
        <b style={{ fontSize: 17, color: renk }}>YENİ CİHAZ EKLE</b>
      </div>
      <div style={{ padding: 20 }}>
        {FIRMALAR.map(f => {
          const sec = seciliFirma?.kod === f.kod;
          const { seriNo } = seriNoUret(f.kod, firmaSayaclari);
          return (
            <div key={f.kod} onClick={() => setSeciliFirma(f)}
              style={{ background: sec ? renk : "white", color: sec ? "white" : "#1a1a1a", borderRadius: 14, padding: "16px 18px", marginBottom: 10, cursor: "pointer", boxShadow: "0 2px 8px rgba(0,0,0,0.06)", display: "flex", justifyContent: "space-between", alignItems: "center", border: sec ? `2px solid ${renk}` : "2px solid transparent" }}>
              <div><div style={{ fontSize: 17, fontWeight: "bold" }}>{f.ad}</div><div style={{ fontSize: 12, opacity: 0.7, fontFamily: "monospace" }}>Sonraki: {seriNo}</div></div>
              {sec && <div style={{ fontSize: 22 }}>✓</div>}
            </div>
          );
        })}
        <button style={{ width: "100%", padding: 16, background: seciliFirma ? renk : "#ccc", color: "white", border: "none", borderRadius: 14, fontSize: 15, fontWeight: "bold", cursor: "pointer", marginTop: 8 }} onClick={cihazEkle} disabled={!seciliFirma}>CİHAZ EKLE</button>
      </div>
    </div>
  );

  if (ekran === "detay" && seciliCihaz) return (
    <div style={{ minHeight: "100vh", background: "#f5f0ff", fontFamily: "sans-serif", maxWidth: 430, margin: "0 auto" }}>
      <div style={{ background: "white", padding: "16px 20px", display: "flex", alignItems: "center", gap: 12, borderBottom: "1px solid #eee" }}>
        <button onClick={() => { setEkran("liste"); setUretilmisKod(""); }} style={{ background: renkAcik, border: "none", borderRadius: 18, width: 36, height: 36, fontSize: 20, cursor: "pointer" }}>←</button>
        <div><div style={{ fontSize: 17, fontWeight: "bold", color: renk, fontFamily: "monospace" }}>{seciliCihaz.seriNo}</div><div style={{ fontSize: 12, color: "#aaa" }}>{seciliCihaz.firmaAd}</div></div>
      </div>
      <div style={{ padding: 20 }}>
        <div style={{ background: "white", borderRadius: 20, padding: 28, marginBottom: 14, textAlign: "center", boxShadow: "0 2px 12px rgba(108,11,169,0.1)" }}>
          <div style={{ fontSize: 64, fontWeight: "bold", color: renk, fontFamily: "monospace" }}>{seciliCihaz.sonsuzMod ? "∞" : seciliCihaz.kalanAtis.toLocaleString()}</div>
          <div style={{ fontSize: 11, color: "#aaa", letterSpacing: 3 }}>KALAN ATIŞ</div>
        </div>
        <div style={{ background: "white", borderRadius: 16, padding: "16px 18px", marginBottom: 14, boxShadow: "0 2px 8px rgba(0,0,0,0.06)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: seciliCihaz.sonSifre ? 8 : 12 }}>
            <span style={{ fontSize: 15, color: "#555" }}>Son Kontrol Key</span>
            <span style={{ fontFamily: "monospace", fontSize: 18, fontWeight: "bold", color: renk }}>{seciliCihaz.sonSifre || "—"}</span>
          </div>
          {seciliCihaz.sonSifre && (
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
              <button onClick={() => kopyala(seciliCihaz.sonSifre)} style={{ background: renkAcik, color: renk, border: "none", borderRadius: 10, padding: "10px 12px", fontSize: 13, cursor: "pointer", fontWeight: "bold" }}>{kopyalandiMetin === seciliCihaz.sonSifre ? "✓ Kopyalandı!" : "📋 Key Kopyala"}</button>
              <button onClick={() => kopyala(`${seciliCihaz.seriNo} ${seciliCihaz.sonAtisYukleme} ${seciliCihaz.firmaKodu === "FS" ? `${typeof seciliCihaz.sonFsKodNo === "number" ? seciliCihaz.sonFsKodNo : Math.max(1, (parseInt(seciliCihaz.fsKodNo) || 1) - 1)} ` : ""}${seciliCihaz.sonSifre}`)} style={{ background: "white", color: renk, border: `2px solid ${renk}`, borderRadius: 10, padding: "10px 12px", fontSize: 13, cursor: "pointer", fontWeight: "bold" }}>📩 Mesaj</button>
            </div>
          )}
          <div style={{ height: 1, background: "#f0e8ff", marginBottom: 12 }} />
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div><div style={{ fontSize: 15, color: "#555" }}>Sonsuz Mod</div><div style={{ fontSize: 12, color: "#aaa" }}>Sayacı devre dışı bırakır</div></div>
            <div onClick={sonsuzToggle} style={{ width: 48, height: 28, borderRadius: 14, background: seciliCihaz.sonsuzMod ? renk : "#ddd", position: "relative", cursor: "pointer", transition: "background 0.3s" }}>
              <div style={{ width: 24, height: 24, borderRadius: 12, background: "white", position: "absolute", top: 2, transition: "transform 0.3s", transform: seciliCihaz.sonsuzMod ? "translateX(22px)" : "translateX(2px)", boxShadow: "0 2px 4px rgba(0,0,0,0.2)" }} />
            </div>
          </div>
          {seciliCihaz.firmaKodu === "FS" && seciliCihaz.sonsuzMod && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginTop: 12, paddingTop: 12, borderTop: "1px solid #f0e8ff" }}>
              <div><div style={{ fontSize: 12, fontWeight: "bold", color: "#aaa", letterSpacing: 2, marginBottom: 4 }}>SINIRSIZ KONTÖR</div><div style={{ fontSize: 12, color: "#888" }}>DGUS şifre alanına 6 haneli kodu girin.</div></div>
              <button onClick={sinirsizKodUret} style={{ padding: "10px 12px", background: renk, color: "white", border: "none", borderRadius: 10, fontWeight: "bold", cursor: "pointer", fontSize: 13, whiteSpace: "nowrap" }}>KOD ÜRET</button>
            </div>
          )}
        </div>
        {!seciliCihaz.sonsuzMod && (
          <div style={{ background: "white", borderRadius: 16, padding: 18, marginBottom: 14, boxShadow: "0 2px 8px rgba(0,0,0,0.06)" }}>
            <div style={{ fontSize: 12, fontWeight: "bold", color: "#aaa", letterSpacing: 2, marginBottom: 12 }}>KONTÖR YÜKLE</div>
            <input style={{ width: "88%", padding: 14, borderRadius: 12, border: `2px solid ${renkAcik}`, fontSize: 20, textAlign: "center", fontFamily: "monospace", outline: "none", letterSpacing: 2, marginBottom: 10 }}
              type="number" placeholder="Atış adedi..." value={yeniAtis} onChange={e => setYeniAtis(e.target.value)} />
            {seciliCihaz.firmaKodu === "FS" && <div style={{ fontSize: 12, color: "#888", marginBottom: 10 }}>Paketler: {FS_PAKETLER.join(", ")}</div>}
            {seciliCihaz.firmaKodu === "FS" && (
              <div style={{ display: "flex", gap: 8, alignItems: "center", justifyContent: "center", marginBottom: 10, flexWrap: "wrap" }}>
                <span style={{ fontSize: 12, color: "#888" }}>Kod No</span>
                <input style={{ width: 110, padding: 10, borderRadius: 10, border: `2px solid ${renkAcik}`, fontSize: 14, outline: "none", textAlign: "center", fontFamily: "monospace" }}
                  type="number" value={fsKodNoGirdi} onChange={e => setFsKodNoGirdi(e.target.value)} onBlur={() => fsKodNoKaydet(fsKodNoGirdi)} />
                <button onClick={() => fsKodNoKaydet(Math.max(1, (parseInt(fsKodNoGirdi) || 1) - 1))} style={{ background: renkAcik, color: renk, border: "none", borderRadius: 10, padding: "10px 12px", fontSize: 13, cursor: "pointer", fontWeight: "bold" }}>−</button>
                <button onClick={() => fsKodNoKaydet(fsKodNoGirdi.trim() === "" ? 1 : ((parseInt(fsKodNoGirdi) || 0) + 1))} style={{ background: renkAcik, color: renk, border: "none", borderRadius: 10, padding: "10px 12px", fontSize: 13, cursor: "pointer", fontWeight: "bold" }}>+</button>
              </div>
            )}
            <button style={{ width: "100%", padding: 16, background: renk, color: "white", border: "none", borderRadius: 14, fontSize: 15, fontWeight: "bold", cursor: "pointer", opacity: yeniAtis ? 1 : 0.4 }} onClick={sifreUretVeYukle} disabled={!yeniAtis}>🔑 ŞİFRE ÜRET</button>
          </div>
        )}
        {uretilmisKod && (
          <div style={{ background: "linear-gradient(135deg,#1a0030,#4a0070)", borderRadius: 20, padding: 28, marginBottom: 14, textAlign: "center" }}>
            <div style={{ fontSize: 11, color: "#cc88ff", letterSpacing: 3, marginBottom: 12 }}>ÜRETİLEN KOD</div>
            <div style={{ fontSize: 44, fontWeight: "bold", color: "white", fontFamily: "monospace", letterSpacing: 10, marginBottom: 6 }}>{uretilmisKod}</div>
            <div style={{ display: "flex", justifyContent: "center", gap: 10 }}>
              <button onClick={() => kopyala(uretilmisKod)} style={{ background: renk, color: "white", border: "none", borderRadius: 10, padding: "12px 18px", fontSize: 14, cursor: "pointer", fontWeight: "bold" }}>{kopyalandiMetin === uretilmisKod ? "✓ Kopyalandı!" : "📋 Kopyala"}</button>
            </div>
          </div>
        )}
        {seciliCihaz.gecmis && seciliCihaz.gecmis.length > 0 && (
          <div style={{ background: "white", borderRadius: 16, padding: "16px 18px", boxShadow: "0 2px 8px rgba(0,0,0,0.06)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div style={{ fontSize: 12, fontWeight: "bold", color: "#aaa", letterSpacing: 2 }}>KONTÖR GEÇMİŞİ</div>
              <button onClick={() => gecmisTemizle(seciliCihaz.id)} style={{ background: renkAcik, color: renk, border: "none", borderRadius: 10, padding: "8px 10px", fontSize: 12, cursor: "pointer", fontWeight: "bold" }}>Temizle</button>
            </div>
            {seciliCihaz.gecmis.map((g, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: i < seciliCihaz.gecmis.length - 1 ? "1px solid #f5f0ff" : "none" }}>
                <div><div style={{ fontSize: 14, fontWeight: "bold" }}>{g.adet === -1 ? "+∞ atış" : `+${g.adet.toLocaleString()} atış`}</div><div style={{ fontSize: 11, color: "#bbb" }}>{g.tarih}</div></div>
                <div style={{ fontFamily: "monospace", fontSize: 15, fontWeight: "bold", color: renk }}>{g.kod}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  // ADMIN ANA SAYFA — TAB
  const firmaGruplari = FIRMALAR.map(f => ({ ...f, cihazlar: cihazlar.filter(c => c.firmaKodu === f.kod) })).filter(f => f.cihazlar.length > 0);

  return (
    <div style={{ minHeight: "100vh", background: "#f5f0ff", fontFamily: "sans-serif", maxWidth: 430, margin: "0 auto" }}>
      <div style={{ background: "white", padding: "16px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #eee", position: "sticky", top: 0, zIndex: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 28 }}>🪄</span>
          <div><div style={{ fontSize: 16, fontWeight: "bold", color: renk }}>LAZURA COD</div><div style={{ fontSize: 11, color: "#aaa" }}>Yönetici Paneli</div></div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {aktifTab === "liste" && <>
            <button onClick={() => setEkran("firmaSifreleri")} style={{ background: renkAcik, border: "none", borderRadius: 20, padding: "8px 12px", color: renk, cursor: "pointer", fontSize: 18 }}>🔑</button>
            <button onClick={() => setEkran("yeniCihaz")} style={{ width: 36, height: 36, borderRadius: 18, background: renk, color: "white", border: "none", fontSize: 24, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>+</button>
          </>}
          <button onClick={cikisYap} style={{ background: renkAcik, border: "none", borderRadius: 20, padding: "8px 12px", color: renk, cursor: "pointer", fontSize: 13, fontWeight: "bold" }}>Çıkış</button>
        </div>
      </div>
      <div style={{ background: "white", display: "flex", borderBottom: "2px solid #f0e8ff", position: "sticky", top: 57, zIndex: 9 }}>
        {[{ id: "liste", label: "📋 Cihazlar" }, { id: "kontrol", label: "⚡ ESP32" }, { id: "musteri", label: "👥 Müşteriler" }].map(tab => (
          <button key={tab.id} onClick={() => setAktifTab(tab.id)}
            style={{ flex: 1, padding: "12px 4px", border: "none", background: "white", borderBottom: aktifTab === tab.id ? `3px solid ${renk}` : "3px solid transparent", color: aktifTab === tab.id ? renk : "#aaa", fontWeight: aktifTab === tab.id ? "bold" : "normal", cursor: "pointer", fontSize: 12 }}>
            {tab.label}
          </button>
        ))}
      </div>
      {aktifTab === "kontrol" && <Esp32Panel ip={esp32Ip} onIpDegis={esp32IpKaydet} />}
      {aktifTab === "musteri" && <MusteriPanel esp32Ip={esp32Ip} />}
      {aktifTab === "liste" && (
        <div style={{ padding: 16 }}>
          {cihazlar.length === 0 ? (
            <div style={{ textAlign: "center", paddingTop: 80 }}>
              <div style={{ fontSize: 52, marginBottom: 16 }}>🪄</div>
              <div style={{ fontSize: 18, color: "#555", marginBottom: 8 }}>Henüz cihaz yok.</div>
              <div style={{ fontSize: 14, color: "#aaa" }}>+ butonuna basarak ilk cihazı ekleyin.</div>
            </div>
          ) : firmaGruplari.map(firma => (
            <div key={firma.kod} style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 13, fontWeight: "bold", color: renk, letterSpacing: 1, marginBottom: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                {firma.ad.toUpperCase()}
                <span style={{ background: renkAcik, color: renk, padding: "2px 10px", borderRadius: 10, fontSize: 11 }}>{firma.cihazlar.length} cihaz</span>
              </div>
              {firma.cihazlar.map(cihaz => (
                <div key={cihaz.id} onClick={() => { setSeciliCihaz(cihaz); setUretilmisKod(""); setEkran("detay"); }}
                  style={{ background: "white", borderRadius: 14, padding: "16px 18px", marginBottom: 8, display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer", boxShadow: "0 2px 8px rgba(108,11,169,0.07)" }}>
                  <div><div style={{ fontSize: 17, fontWeight: "bold", fontFamily: "monospace" }}>{cihaz.seriNo}</div><div style={{ fontSize: 11, color: "#bbb", marginTop: 2 }}>{cihaz.tarih}</div></div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    {cihaz.sonsuzMod ? <span style={{ background: renkAcik, color: renk, padding: "4px 10px", borderRadius: 20, fontSize: 12, fontWeight: "bold" }}>∞ SONSUZ</span>
                      : <span style={{ fontSize: 14, fontWeight: "bold", fontFamily: "monospace", color: cihaz.kalanAtis > 100 ? "#2d7a2d" : "#cc0000" }}>{cihaz.kalanAtis.toLocaleString()} atış</span>}
                    <span style={{ fontSize: 20, color: "#ccc" }}>›</span>
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}