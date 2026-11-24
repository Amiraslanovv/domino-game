# Domino MVP (101) — qurulum və handoff

## 1. Qurulum (addım-addım)

1. Kompüterdə `domino` qovluğu yarat. İçində bu quruluş olsun:
   ```
   domino/
     package.json
     server.js
     public/index.html
     README.md
   ```
2. GitHub-da yeni repo aç (məs. `domino-game`) və bu faylları yüklə (`public/index.html` qovluqla birlikdə).
3. https://render.com saytında GitHub ilə daxil ol → **New → Web Service** → reponu seç.
4. Ayarlar: **Runtime:** Node · **Build Command:** `npm install` · **Start Command:** `npm start` · **Plan:** Free.
5. **Create Web Service** bas, 2–3 dəqiqə gözlə. `https://domino-game-xxxx.onrender.com` kimi link verəcək.
6. Linki telefonda və kompüterdə aç. Birinci adam adını yazıb otaq kodunu **boş** qoyub "Daxil ol" basır, çıxan kodu (yuxarıda) digərlərinə göndərir.
7. Digərləri adını və kodu yazıb daxil olur. Host (👑) rejimi seçib **Başla** basır.
8. Səs/video üçün hər kəs sağdakı/aşağıdakı **🎤📷 Səs/Video aç** düyməsini basıb icazə verir (yalnız HTTPS-də işləyir, Render HTTPS verir).

Yerli test: `npm install && npm start` → `http://localhost:3000` (kamera localhost-da işləyir; telefondan yalnız HTTPS ilə).

Qeyd: Render pulsuz planda 15 dəq. boş qalanda yatır, ilk açılış ~30 san. çəkə bilər.

Hər dəyişiklikdən sonra GitHub-a yüklənən fayllar: dəyişən faylı (`server.js` və ya `public/index.html`) yenilə, Render avtomatik yenidən deploy edir.

## 2. Oyun qaydaları (hazırda kodda olan)

- Double-six, 28 daş, hər oyunçuya 7. 2–4 nəfər, otaq kodu ilə (login yoxdur).
- 1-ci raundda ən yüksək dublu olan başlayır və həmin daşla başlamalıdır. Sonrakı raundlarda əvvəlki raundun qalibi başlayır.
- Gedişi olmayan bazardan çəkir (2–3 nəfərdə bazar var, 4 nəfərdə yoxdur). Bazar boşdursa avtomatik pas.
- Raund bitməsi: biri bütün daşlarını qoyur **və ya** hamı ardıcıl pas deyir (blok).
- Qalib digərlərinin əlindəki xalların cəmini alır. Blokda ən az xalı olan qalibdir.
- **Bərabərlik (blok, ən az xal eyni):** bütün əllərdəki xallar **banka** yığılır, kimsə xal almır. Sonrakı raundu udan **banki + əlində qalan xalları** birlikdə götürür.
- **101 rejimi:** kimsə 101-ə çatanda oyun bitir (ən çox xallı qalib). **Klassik:** 1 raund.
- Daşları əl ilə seçmək: host lobidə seçir; hamı üzü aşağı daşlardan özü 7 daş seçir.
- Çat, səs, video: WebSocket + WebRTC mesh (STUN: Google).
- Mobil: dar ekranda tərtibat dəyişir, əl ekranın altında yapışır.

## 3. Kod xəritəsi

- `server.js` — avtoritar server. `rooms{}` yaddaşda. Mesajlar: `join, opts, start, pick, play, draw, next, again, chat, rtc`. Əsas funksiyalar: `startRound, begin, settle` (avtomatik pas + blok), `endRound` (xal + bank), `view` (hər oyunçuya öz əli).
- `public/index.html` — bütün UI + JS bir faylda. `render()` state-dən çəkir, `pc()/rtc()` WebRTC (perfect negotiation), `clickTile()` gediş.

## 4. Məlum məhdudiyyətlər / sonrakı addımlar

- Komanda (2v2) rejimi yoxdur, hamı fərdi oynayır. (İstənilsə: xalları komanda üzrə saxlamaq, 0&2 vs 1&3.)
- TURN server yoxdur: bəzi şəbəkələrdə (mobil operator, sərt firewall) səs/video qoşulmaya bilər.
- Mesaj tarixçəsi saxlanmır; server yenidən başlayanda otaqlar silinir.
- Taymer yoxdur (oyunçu getsə növbə gözləyir).
- Daş görünüşü sadədir; board uzun olanda sətirlərə bölünür.

## 5. Handoff — yeni söhbətdə davam etmək üçün

Yeni söhbətə bu faylı və `server.js` + `public/index.html` fayllarını yüklə və yaz:
"Bu domino layihəsidir, README-dəki 4-cü bəndin sonrakı addımından davam edək."

Cari vəziyyət: MVP işləyir (qaydalar, 101, bank, çat, səs/video, mobil CSS). Hələ **real cihazlarda test edilməyib** — ilk iş telefon + kompüterlə 2–4 nəfər test edib baqları siyahıya almaqdır.
