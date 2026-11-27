import { execFile } from 'node:child_process';
import { logger } from './logger.js';

/**
 * Menjalankan command secara asinkron menggunakan execFile
 */
function runCommand(file: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(file, args, { timeout: 15_000, windowsHide: true }, (error, stdout, stderr) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(stdout || stderr);
    });
  });
}

/**
 * Memeriksa instalasi FFmpeg, encoder yang dibutuhkan (libwebp, libopus, libmp3lame),
 * serta ketersediaan ffprobe sebelum bot terhubung ke WhatsApp.
 * Jika ada dependensi yang kurang, mencetak error ramah dan menghentikan proses (exit 1).
 */
export async function ensureFfmpegInstallation(): Promise<void> {
  const missing: string[] = [];

  // 1. Periksa ketersediaan ffmpeg dan encoder
  try {
    const stdout = await runCommand('ffmpeg', ['-hide_banner', '-encoders']);
    const requiredEncoders = ['libwebp', 'libopus', 'libmp3lame'];

    for (const encoder of requiredEncoders) {
      // Format output: V....D libwebp ... atau A....D libopus ...
      const regex = new RegExp(`\\s${encoder}\\b`);
      if (!regex.test(stdout)) {
        missing.push(`Encoder "${encoder}"`);
      }
    }
  } catch (error) {
    missing.push('Program FFmpeg (tidak ditemukan di PATH)');
  }

  // 2. Periksa ketersediaan ffprobe
  try {
    await runCommand('ffprobe', ['-version']);
  } catch (error) {
    missing.push('Program ffprobe (tidak ditemukan di PATH)');
  }

  // 3. Jika ada yang hilang, berikan pesan error jelas dan hentikan aplikasi
  if (missing.length > 0) {
    const errorMsg =
      `Gagal memulai bot: Komponen multimedia berikut belum tersedia:\n` +
      missing.map((item) => `  - ${item}`).join('\n') +
      `\n\nUntuk pengguna Termux di Android, silakan pasang dengan menjalankan:\n` +
      `  pkg update && pkg install ffmpeg libwebp -y\n`;

    logger.error({ err: new Error('FFmpeg dependencies missing') }, errorMsg);
    process.exit(1);
  }

  logger.info('Pemeriksaan FFmpeg, ffprobe, dan encoder berhasil (libwebp, libopus, libmp3lame tersedia).');
}
