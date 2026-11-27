import ffmpeg from 'fluent-ffmpeg';
import fs from 'fs/promises';
import webp from 'node-webpmux';
import { config } from '../config/index.js';
import { writeTempFile, createTempFilePath, deleteTempFile } from '../utils/temp-file.js';
import { logger } from '../utils/logger.js';
import type { StickerOptions, SoundStickerResult } from './types.js';
import { videoToStickerAudio } from './audio.service.js';

/**
 * Informasi struktur file WebP
 */
export interface WebpInfo {
  width: number;
  height: number;
  animated: boolean;
  frames: number;
  durationMs: number;
}

/**
 * Membaca blok RIFF WebP untuk mendapatkan dimensi, frame, dan durasi dalam milidetik
 */
export function inspectWebp(data: Buffer): WebpInfo {
  if (data.length < 20 || data.toString('ascii', 0, 4) !== 'RIFF' || data.toString('ascii', 8, 12) !== 'WEBP') {
    throw new Error('Bukan file WebP yang valid.');
  }

  let offset = 12;
  let width = 0;
  let height = 0;
  let animated = false;
  let frames = 0;
  let durationMs = 0;

  while (offset + 8 <= data.length) {
    const type = data.toString('ascii', offset, offset + 4);
    const size = data.readUInt32LE(offset + 4);
    const body = offset + 8;
    if (body + size > data.length) break;

    if (type === 'VP8X') {
      animated = (data[body]! & 0x02) !== 0;
      width = data.readUIntLE(body + 4, 3) + 1;
      height = data.readUIntLE(body + 7, 3) + 1;
    } else if (type === 'ANMF') {
      frames++;
      durationMs += data.readUIntLE(body + 12, 3);
    } else if ((type === 'VP8 ' || type === 'VP8L') && !width) {
      if (type === 'VP8L') {
        const bits = data.readUInt32LE(body + 1);
        width = (bits & 0x3fff) + 1;
        height = ((bits >> 14) & 0x3fff) + 1;
      } else {
        width = data.readUInt16LE(body + 6) & 0x3fff;
        height = data.readUInt16LE(body + 8) & 0x3fff;
      }
      frames = 1;
    }
    offset = body + size + (size % 2);
  }

  if (!animated && !frames) frames = 1;
  return { width, height, animated, frames, durationMs };
}

/**
 * Mendapatkan durasi video dalam detik menggunakan ffprobe
 */
export async function getVideoDuration(filePath: string): Promise<number | null> {
  return new Promise((resolve) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err || !metadata?.format?.duration) {
        resolve(null);
        return;
      }
      const dur = Number(metadata.format.duration);
      resolve(Number.isFinite(dur) && dur > 0 ? dur : null);
    });
  });
}

/**
 * Membuat buffer EXIF metadata untuk stiker WhatsApp
 * (Format TIFF LE dengan tag 0x5741 'WA')
 */
export function createStickerExif(packName: string, authorName: string, categories: string[] = ['✨']): Buffer {
  const json = {
    'sticker-pack-id': `bot-termux-${Date.now()}`,
    'sticker-pack-name': packName,
    'sticker-pack-publisher': authorName,
    'emojis': categories,
  };

  const jsonBuf = Buffer.from(JSON.stringify(json), 'utf-8');

  // Header TIFF Little-Endian (8 byte)
  const tiffHeader = Buffer.from([0x49, 0x49, 0x2A, 0x00, 0x08, 0x00, 0x00, 0x00]);
  // Jumlah entri tag IFD (1 tag)
  const ifdCount = Buffer.from([0x01, 0x00]);

  // Entri Tag (12 byte): Tag 0x5741, Tipe 7 (UNDEFINED), Panjang JSON, Offset (26 byte)
  const tag = Buffer.alloc(12);
  tag.writeUInt16LE(0x5741, 0); // Tag 'WA'
  tag.writeUInt16LE(0x0007, 2); // Tipe UNDEFINED
  tag.writeUInt32LE(jsonBuf.length, 4); // Panjang data
  tag.writeUInt32LE(26, 8); // Offset dari awal TIFF ke payload JSON

  // Offset ke IFD berikutnya (4 byte 0x00)
  const nextIfd = Buffer.alloc(4, 0);

  return Buffer.concat([tiffHeader, ifdCount, tag, nextIfd, jsonBuf]);
}

/**
 * Menyisipkan metadata EXIF (packname & author) ke dalam file WebP murni
 */
export async function embedStickerExif(
  webpBuffer: Buffer,
  packName: string = config.stickerPackName,
  authorName: string = config.stickerAuthorName,
  categories: string[] = ['✨']
): Promise<Buffer> {
  const exif = createStickerExif(packName, authorName, categories);
  const img = new webp.Image();
  await img.load(webpBuffer);
  img.exif = exif;
  return await img.save(null);
}

/**
 * Mengonversi gambar menjadi WebP Stiker 512x512 menggunakan ffmpeg
 */
export async function imageToSticker(
  input: Buffer | string,
  options?: StickerOptions
): Promise<Buffer> {
  let inputPath = '';
  let needDeleteInput = false;
  const outputPath = createTempFilePath('webp');

  try {
    if (Buffer.isBuffer(input)) {
      inputPath = await writeTempFile(input, 'img_input');
      needDeleteInput = true;
    } else {
      inputPath = input;
    }

    await new Promise<void>((resolve, reject) => {
      ffmpeg(inputPath)
        .outputOptions([
          '-vcodec', 'libwebp',
          '-vf', 'scale=512:512:force_original_aspect_ratio=decrease,fps=15,pad=512:512:(512-iw)/2:(512-ih)/2:color=0x00000000',
          '-lossless', '0',
          '-qscale', '75',
          '-preset', 'default',
          '-an',
        ])
        .output(outputPath)
        .on('end', () => resolve())
        .on('error', (err) => reject(err))
        .run();
    });

    const webpBuffer = await fs.readFile(outputPath);
    const finalBuffer = await embedStickerExif(
      webpBuffer,
      options?.packName || config.stickerPackName,
      options?.authorName || config.stickerAuthorName,
      options?.categories
    );

    return finalBuffer;
  } catch (error) {
    logger.error({ err: error }, 'Gagal mengonversi gambar ke stiker');
    throw error;
  } finally {
    if (needDeleteInput) await deleteTempFile(inputPath);
    await deleteTempFile(outputPath);
  }
}

/**
 * Mengonversi video atau GIF menjadi WebP Stiker animasi 512x512
 * Dibatasi maksimal 10 detik dan optimasi frame rate agar ukuran < 1MB untuk WhatsApp
 */
export async function videoToSticker(
  input: Buffer | string,
  options?: StickerOptions
): Promise<Buffer> {
  let inputPath = '';
  let needDeleteInput = false;
  const outputPath = createTempFilePath('webp');

  try {
    if (Buffer.isBuffer(input)) {
      inputPath = await writeTempFile(input, 'vid_input');
      needDeleteInput = true;
    } else {
      inputPath = input;
    }

    const maxDuration = config.maxStickerVideoDurationSec;

    await new Promise<void>((resolve, reject) => {
      ffmpeg(inputPath)
        .duration(maxDuration)
        .outputOptions([
          '-vcodec', 'libwebp',
          '-vf', 'fps=12,scale=512:512:force_original_aspect_ratio=decrease,pad=512:512:(512-iw)/2:(512-ih)/2:color=0x00000000',
          '-loop', '0',
          '-lossless', '0',
          '-qscale', '45',
          '-preset', 'default',
          '-an',
        ])
        .output(outputPath)
        .on('end', () => resolve())
        .on('error', (err) => reject(err))
        .run();
    });

    const webpBuffer = await fs.readFile(outputPath);

    // Periksa ukuran stiker akhir (WhatsApp membatasi stiker maksimal 1MB)
    if (webpBuffer.length > 1024 * 1024) {
      throw new Error('Ukuran stiker animasi melebihi batas 1MB WhatsApp');
    }

    const finalBuffer = await embedStickerExif(
      webpBuffer,
      options?.packName || config.stickerPackName,
      options?.authorName || config.stickerAuthorName,
      options?.categories
    );

    return finalBuffer;
  } catch (error) {
    logger.error({ err: error }, 'Gagal mengonversi video ke stiker animasi');
    throw error;
  } finally {
    if (needDeleteInput) await deleteTempFile(inputPath);
    await deleteTempFile(outputPath);
  }
}

/**
 * Mengonversi video menjadi Stiker Bersuara (Sound Sticker):
 * - Menghasilkan WebP animasi 512x512 yang ukurannya di bawah batas 500 KB (dikurangi cadangan EXIF 2 KB)
 * - Menerapkan ladder kualitas adaptif (kombinasi fps dan qscale) hingga muat
 * - Mengekstrak audio Ogg Opus durasi sama persis
 * - Menghitung durationMs
 */
export async function videoToSoundSticker(
  input: Buffer | string,
  options?: StickerOptions
): Promise<SoundStickerResult> {
  let inputPath = '';
  let needDeleteInput = false;

  try {
    if (Buffer.isBuffer(input)) {
      inputPath = await writeTempFile(input, 'sound_sticker_in');
      needDeleteInput = true;
    } else {
      inputPath = input;
    }

    // 1. Tentukan durasi klip maksimal (sesuai config, default maks 10 detik)
    const videoDuration = await getVideoDuration(inputPath);
    const maxAllowed = config.maxStickerVideoDurationSec;
    const clipSeconds = Math.min(maxAllowed, videoDuration || maxAllowed);

    // 2. Ekstrak audio terlebih dahulu secara bersamaan
    const audio = await videoToStickerAudio(inputPath, clipSeconds);
    const hasAudio = audio !== null;

    // 3. Batas ukuran 500.000 byte dikurangi cadangan EXIF 2.000 byte = 498.000 byte
    const MAX_ANIMATED_BYTES = 500_000;
    const METADATA_RESERVE = 2_000;
    const targetLimit = MAX_ANIMATED_BYTES - METADATA_RESERVE;

    // Ladder kualitas adaptif dari tinggi ke rendah
    const LADDER = [
      { fps: 15, qscale: 55 },
      { fps: 12, qscale: 45 },
      { fps: 10, qscale: 40 },
      { fps: 10, qscale: 30 },
      { fps: 8,  qscale: 25 },
      { fps: 6,  qscale: 20 },
    ];

    let finalSticker: Buffer | null = null;
    const outputPath = createTempFilePath('webp');

    try {
      for (const step of LADDER) {
        await new Promise<void>((resolve, reject) => {
          ffmpeg(inputPath)
            .duration(clipSeconds)
            .outputOptions([
              '-vcodec', 'libwebp',
              '-vf', `fps=${step.fps},scale=512:512:force_original_aspect_ratio=decrease,pad=512:512:(512-iw)/2:(512-ih)/2:color=0x00000000`,
              '-loop', '0',
              '-lossless', '0',
              '-qscale', String(step.qscale),
              '-preset', 'default',
              '-an',
            ])
            .output(outputPath)
            .on('end', () => resolve())
            .on('error', (err) => reject(err))
            .run();
        });

        const webpBuffer = await fs.readFile(outputPath);

        // Jika ukuran WebP sebelum EXIF muat di batas target
        if (webpBuffer.length <= targetLimit) {
          const withExif = await embedStickerExif(
            webpBuffer,
            options?.packName || config.stickerPackName,
            options?.authorName || config.stickerAuthorName,
            options?.categories
          );

          if (withExif.length <= MAX_ANIMATED_BYTES) {
            finalSticker = withExif;
            break;
          }
        }
      }
    } finally {
      await deleteTempFile(outputPath);
    }

    if (!finalSticker) {
      throw new Error('Tidak dapat mengompresi stiker animasi di bawah batas 500 KB. Coba gunakan video dengan durasi lebih singkat.');
    }

    // 4. Hitung durationMs dari WebP hasil inspeksi
    let durationMs = 0;
    try {
      const info = inspectWebp(finalSticker);
      durationMs = info.durationMs;
    } catch {
      durationMs = Math.round(clipSeconds * 1000);
    }
    if (!durationMs) {
      durationMs = Math.round(clipSeconds * 1000);
    }

    return {
      sticker: finalSticker,
      audio,
      durationMs,
      hasAudio,
    };
  } catch (error) {
    logger.error({ err: error }, 'Gagal memproses video ke stiker bersuara');
    throw error;
  } finally {
    if (needDeleteInput) await deleteTempFile(inputPath);
  }
}
