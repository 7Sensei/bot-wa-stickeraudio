# Bot WhatsApp Stiker & Audio (Termux ARM)

Bot WhatsApp otomatis untuk pembuatan stiker (gambar, video, GIF) dan konversi audio (video ke MP3, audio ke Voice Note WhatsApp). Didesain khusus menggunakan pola arsitektur **MVVM** (Model-View-ViewModel) dan state management **Zustand Vanilla**, dioptimalkan agar berjalan stabil di HP Android melalui **Termux** dengan RAM dan CPU terbatas.

---

## ⚡ Fitur Utama

- 🎨 **Stiker Gambar & Animasi (`.s` / `.stiker`)**:
  - Konversi gambar (JPG, PNG) menjadi stiker WebP 512x512 dengan padding transparan proporsional.
  - Konversi video / GIF menjadi stiker animasi WebP (maksimal 10 detik, frame rate dioptimasi agar ukuran selalu `< 1MB` sesuai standar WhatsApp).
  - Kustomisasi metadata stiker (Pack Name & Author) langsung lewat perintah, contoh: `.s Kucing Lucu | By Sensei`.
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
| `.s` / `.stiker` | Mengubah gambar/video/GIF menjadi stiker | Kirim gambar dengan caption `.s` atau balas gambar dengan `.s` |
| `.s Pack \| Author` | Stiker dengan nama pack & pembuat kustom | `.s Stiker Lucu \| Mas Sensei` |
| `.audio` | Mengekstrak suara dari video menjadi MP3 | Balas pesan video dengan `.audio` |
| `.vn` | Mengubah audio/video menjadi Voice Note WhatsApp | Balas pesan audio dengan `.vn` |
| `.menu` | Menampilkan panduan dan daftar perintah | Ketik `.menu` di obrolan |

---

## 🛠️ Skrip Pengembangan

- `npm run dev`: Menjalankan bot dengan fitur auto-reload (`tsx watch`).
- `npm start`: Menjalankan bot dalam mode produksi.
- `npm run typecheck`: Memverifikasi seluruh tipe TypeScript tanpa kompilasi file (`tsc --noEmit`).
