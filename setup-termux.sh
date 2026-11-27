#!/bin/bash
set -e

echo "=================================================="
echo "🚀 Memulai Setup Bot WhatsApp Stiker & Audio di Termux"
echo "=================================================="

# 1. Update paket Termux
echo "📦 Memperbarui repository Termux..."
pkg update && pkg upgrade -y

# 2. Install dependensi sistem yang dibutuhkan
echo "📦 Menginstal Node.js LTS, Git, FFmpeg, dan LibWebP..."
pkg install nodejs-lts git ffmpeg libwebp -y

# 3. Install dependensi proyek Node.js
echo "📦 Menginstal dependensi Node.js..."
npm install

# 4. Salin .env.example jika .env belum ada
if [ ! -f .env ]; then
  echo "⚙️ Menyalin .env.example ke .env..."
  cp .env.example .env
  echo "✅ File .env berhasil dibuat."
else
  echo "ℹ️ File .env sudah ada, melewati penyalinan."
fi

# 5. Cetak petunjuk langkah berikutnya
echo ""
echo "=================================================="
echo "🎉 SETUP TERMUX SELESAI!"
echo "=================================================="
echo "Langkah selanjutnya:"
echo "1. Buka dan edit file .env:"
echo "   nano .env"
echo "2. Masukkan nomor WhatsApp bot pada BOT_PHONE_NUMBER (contoh: 6281234567890)"
echo "   Simpan dengan: Ctrl+O, Enter, lalu Ctrl+X"
echo "3. Jalankan bot dengan perintah:"
echo "   npm start"
echo "=================================================="
