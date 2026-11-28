# Bot WhatsApp Stiker & Audio (Termux ARM)

Bot WhatsApp otomatis untuk pembuatan stiker (gambar, video, GIF, dan stiker bersuara) serta konversi audio (video ke MP3, audio ke Voice Note WhatsApp). Didesain khusus menggunakan pola arsitektur **MVVM** (Model-View-ViewModel) dan state management **Zustand Vanilla**, dioptimalkan agar berjalan stabil di HP Android melalui **Termux** dengan RAM dan CPU terbatas.

---

## ⚡ Fitur Utama

- 🎨 **Stiker Gambar & Animasi (`.s` / `.stiker`)**:
  - Konversi gambar (JPG, PNG) menjadi stiker WebP 512x512 dengan padding transparan proporsional.
  - Konversi video / GIF menjadi stiker animasi WebP (maksimal 10 detik, frame rate dioptimasi agar ukuran selalu `< 1MB` sesuai standar WhatsApp).
  - Kustomisasi metadata stiker (Pack Name & Author) langsung lewat perintah, contoh: `.s Kucing Lucu | By Sensei`.
- 🔊 **Stiker Bersuara / Sound Sticker (`.som` / `.ss`)**:
  - Mengubah video/GIF yang memiliki audio menjadi stiker animasi WhatsApp yang dapat mengeluarkan suara saat diketuk.
  - Menggunakan kompresi adaptif agar ukuran WebP stiker tetap di bawah **500 KB** dan audio Ogg Opus di bawah **256 KB**.
  - Mendukung kustomisasi pack & author: `.som PackName | AuthorName`.
  - **Mekanisme Fallback Otomatis**: Jika video tidak memiliki stream suara, audionya senyap, atau pengiriman stiker bersuara gagal, bot secara otomatis mengirimkannya sebagai stiker animasi biasa disertai pemberitahuan ramah.
- 🎵 **Ekstraksi MP3 (`.audio`)**:
  - Ekstrak suara dari video menjadi file audio MP3 berkualitas jernih.
- 🎙️ **Voice Note WhatsApp (`.vn`)**:
  - Ubah file audio atau video menjadi format Voice Note PTT asli WhatsApp (Ogg Opus mono 48kHz).
- 📋 **Menu Bantuan (`.menu`)**:
  - Menampilkan ringkasan seluruh perintah dan batasan media bot.
- 🚦 **Single-Concurrency Queue (Antrean Ramah Termux)**:
  - Proses konversi media `ffmpeg` dijalankan secara antrean 1 per 1 agar HP Android tidak kehabisan RAM (mencegah Android OOM killer).
- 🧹 **Manajemen File Sementara Otomatis**:
  - Semua file sementara di folder `temp/` langsung dihapus setelah konversi selesai.
- 🔑 **Login Kode Pairing**:
  - Tidak perlu scan QR code dari HP lain; cukup gunakan 8 digit kode pairing langsung dari aplikasi WhatsApp.

---

## ⚠️ Peringatan Penting Mengenai Fitur Stiker Bersuara

> [!WARNING]
> **Format Eksperimental & Hasil Rekayasa Balik (Reverse Engineering)**:
> Struktur stiker bersuara dibentuk dengan menyematkan pesan audio ke dalam pembungkus `FutureProofMessage` (field 134) yang tidak didukung secara resmi di SDK Baileys standar.
> - Format ini dapat sewaktu-waktu berhenti bekerja apabila WhatsApp memperbarui protokol atau aplikasi klien resminya.
> - Penggunaan fitur tidak resmi ini membawa risiko peninjauan atau pembatasan nomor oleh pihak WhatsApp. Gunakan secara bijak dan wajar pada nomor pribadi/uji coba.

---

## 📱 Panduan Pemasangan Cepat di Termux (Android)

Cara termudah memasang dan menjalankan bot di Termux adalah menggunakan skrip otomatis `setup-termux.sh`:

### 1. Unduh Proyek dari GitHub & Jalankan Skrip Setup
Buka aplikasi **Termux** di HP Anda, lalu jalankan perintah berikut:

```bash
# Clone repository proyek
git clone <URL_REPO_GITHUB_ANDA> bot-wa-stickeraudio

# Masuk ke folder proyek
cd bot-wa-stickeraudio

# Jalankan skrip setup otomatis
bash setup-termux.sh
```

Skrip `setup-termux.sh` akan otomatis melakukan:
1. `pkg update && pkg upgrade -y`
2. `pkg install nodejs-lts git ffmpeg libwebp -y`
3. `npm install`
4. Menyiapkan file `.env` dari `.env.example`

### 2. Atur Nomor WhatsApp Bot
Buka dan edit file `.env`:

```bash
nano .env
```
Ubah nilai `BOT_PHONE_NUMBER` dengan nomor WhatsApp bot Anda (diawali kode negara tanpa `+` atau spasi, contoh: `6281234567890`).

Simpan perubahan di nano:
- Tekan `Ctrl + O`, lalu `Enter`
- Tekan `Ctrl + X` untuk keluar

### 3. Jalankan Bot
```bash
npm start
```

### 4. Tautkan Perangkat (Pairing Code)
Saat bot pertama kali dijalankan, kode pairing 8 digit akan dicetak di terminal Termux:
1. Buka aplikasi WhatsApp di HP Anda.
2. Buka **Setelan (Settings)** > **Perangkat Tertaut (Linked Devices)** > **Tautkan Perangkat**.
3. Pilih opsi **"Tautkan dengan nomor telepon saja"** di bagian bawah.
4. Masukkan kode 8 digit yang muncul di terminal Termux.
5. Bot berhasil terhubung dan siap digunakan!

---

## 🔋 Tips Menjaga Bot Tetap Aktif di Termux (Background Mode)

Sistem Android secara agresif mematikan aplikasi di latar belakang untuk menghemat baterai. Ikuti langkah-langkah berikut agar bot tidak sering mati:

### 1. Aktifkan Termux Wake Lock
Mencegah CPU HP masuk ke mode tidur (*deep sleep*) saat layar mati:
```bash
termux-wake-lock
```

### 2. Matikan Optimasi Baterai untuk Termux
- Buka **Pengaturan HP** > **Aplikasi** > **Termux**.
- Pilih **Baterai** > Ubah ke **Tidak Dibatasi (Unrestricted)**.
- Izinkan juga izin *Autostart* / *Mulai Otomatis* jika HP Anda menggunakan antarmuka kustom (MIUI, HyperOS, ColorOS, Realme UI, dll).

### 3. Jalankan Menggunakan PM2 (Rekomendasi)
Agar bot otomatis hidup kembali jika terjadi crash:

```bash
# Pasang pm2 secara global
npm install -g pm2

# Jalankan bot di latar belakang
pm2 start "npm start" --name bot-wa

# Melihat log bot
pm2 logs bot-wa

# Memeriksa status bot
pm2 status

# Menghentikan bot
pm2 stop bot-wa
```

Atau Anda juga dapat menggunakan `tmux`:
```bash
pkg install tmux -y
tmux new -s bot
npm start
# Tekan Ctrl+B lalu D untuk detach dari tmux
```

---

## 📖 Daftar Perintah WhatsApp

| Perintah | Deskripsi | Contoh Penggunaan |
|---|---|---|
| `.s` / `.stiker` | Mengubah gambar/video/GIF menjadi stiker biasa | Kirim gambar dengan caption `.s` atau balas gambar dengan `.s` |
| `.s Pack \| Author` | Stiker dengan nama pack & pembuat kustom | `.s Stiker Lucu \| Mas Sensei` |
| `.som` / `.ss` | Mengubah video menjadi **stiker bersuara** | Balas video dengan `.som` atau `.ss` |
| `.som Pack \| Author` | Stiker bersuara dengan pack & author kustom | `.som Lucu Banget \| Mas Sensei` |
| `.audio` | Mengekstrak suara dari video menjadi MP3 | Balas pesan video dengan `.audio` |
| `.vn` | Mengubah audio/video menjadi Voice Note WhatsApp | Balas pesan audio dengan `.vn` |
| `.menu` | Menampilkan panduan dan daftar perintah | Ketik `.menu` di obrolan |
| `.id` | Menampilkan ID chat ini (untuk ALLOWED_CHATS) | Ketik `.id` di obrolan |

---

## 🔒 Membatasi Akses Bot (ALLOWED_CHATS)

Variabel `ALLOWED_CHATS` di `.env` membatasi bot hanya merespons chat/grup tertentu. Isi dengan JID chat dipisah koma — kosongkan untuk mengizinkan semua chat. Gunakan perintah `.id` di WhatsApp untuk mendapatkan ID chat yang ingin ditambahkan. Perintah `.id` selalu bisa digunakan dari mana saja meskipun chat tersebut belum ada di daftar.

---

## 🛠️ Pemecahan Masalah

### "Unrecognized option vsync"
Versi ffmpeg terbaru menolak opsi `-vsync`. Bug ini **sudah diperbaiki** di versi bot ini — opsi tersebut telah dihapus dari semua perintah konversi stiker.

### Memeriksa Encoder FFmpeg di Termux
Pastikan encoder yang dibutuhkan tersedia:
```bash
ffmpeg -encoders | grep -E 'libwebp|libopus|libmp3lame'
```
Jika kosong atau ada yang kurang, install ulang FFmpeg:
```bash
pkg install ffmpeg libwebp -y
```
Bot juga akan memeriksa encoder ini secara otomatis saat startup dan menampilkan pesan error yang jelas jika ada yang kurang.

### TypeScript dan `npm run typecheck`
TypeScript 7.x menggunakan binary native yang tidak tersedia untuk Android ARM64 (Termux). Proyek ini sudah menggunakan TypeScript 5.x yang kompatibel dengan Termux. Jalankan `npm run typecheck` di PC/laptop atau di Termux dengan TypeScript 5.x.

### Bot Tidak Merespons Perintah
1. Pastikan nomor di `.env` benar (format: `628xxx`, tanpa `+` atau spasi).
2. Periksa apakah ada pesan error encoder di log startup.
3. Cek log dengan `npm start` atau `pm2 logs bot-wa`.

---

## 🛠️ Skrip Pengembangan

- `npm run dev`: Menjalankan bot dengan fitur auto-reload (`tsx watch`).
- `npm start`: Menjalankan bot dalam mode produksi.
- `npm run typecheck`: Memverifikasi seluruh tipe TypeScript tanpa kompilasi file (`tsc --noEmit`).

---

## 📄 Lisensi & Kredit

- Kode bot WhatsApp ini dirilis di bawah lisensi **MIT**.
- Fitur stiker bersuara (Sound Sticker wrapper, sidecar encoder, dan struktur protobuf) diadaptasi dari proyek sumber terbuka [coelhobugado/whatsapp-figurinhas-com-som](https://github.com/coelhobugado/whatsapp-figurinhas-com-som) yang dirilis di bawah lisensi MIT.
