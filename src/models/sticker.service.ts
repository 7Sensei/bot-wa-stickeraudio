import ffmpeg from 'fluent-ffmpeg';
import fs from 'fs/promises';
import webp from 'node-webpmux';
import { config } from '../config/index.js';
import { writeTempFile, createTempFilePath, deleteTempFile } from '../utils/temp-file.js';
import { logger } from '../utils/logger.js';
import type { StickerOptions } from './types.js';

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
          '-vsync', '0',
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
    logger.error({ error }, 'Gagal mengonversi gambar ke stiker');
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
          '-vsync', '0',
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
    logger.error({ error }, 'Gagal mengonversi video ke stiker animasi');
    throw error;
  } finally {
    if (needDeleteInput) await deleteTempFile(inputPath);
    await deleteTempFile(outputPath);
  }
}
