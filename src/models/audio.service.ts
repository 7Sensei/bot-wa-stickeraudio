import ffmpeg from 'fluent-ffmpeg';
import fs from 'fs/promises';
import { writeTempFile, createTempFilePath, deleteTempFile } from '../utils/temp-file.js';
import { logger } from '../utils/logger.js';

/**
 * Mengonversi video ke format audio MP3 menggunakan ffmpeg
 */
export async function videoToMp3(input: Buffer | string): Promise<Buffer> {
  let inputPath = '';
  let needDeleteInput = false;
  const outputPath = createTempFilePath('mp3');

  try {
    if (Buffer.isBuffer(input)) {
      inputPath = await writeTempFile(input, 'media_input');
      needDeleteInput = true;
    } else {
      inputPath = input;
    }

    await new Promise<void>((resolve, reject) => {
      ffmpeg(inputPath)
        .outputOptions([
          '-vn',
          '-acodec', 'libmp3lame',
          '-b:a', '128k',
          '-ar', '44100',
          '-ac', '2',
        ])
        .output(outputPath)
        .on('end', () => resolve())
        .on('error', (err) => reject(err))
        .run();
    });

    return await fs.readFile(outputPath);
  } catch (error) {
    logger.error({ error }, 'Gagal mengonversi video ke MP3');
    throw error;
  } finally {
    if (needDeleteInput) await deleteTempFile(inputPath);
    await deleteTempFile(outputPath);
  }
}

/**
 * Mengonversi file audio/video menjadi format Voice Note (OGG Opus PTT)
 * Spesifikasi WhatsApp PTT: Ogg Opus, Mono (ac 1), 48kHz, bitrate 32-64kbps
 */
export async function audioToVoiceNote(input: Buffer | string): Promise<Buffer> {
  let inputPath = '';
  let needDeleteInput = false;
  const outputPath = createTempFilePath('ogg');

  try {
    if (Buffer.isBuffer(input)) {
      inputPath = await writeTempFile(input, 'audio_input');
      needDeleteInput = true;
    } else {
      inputPath = input;
    }

    await new Promise<void>((resolve, reject) => {
      ffmpeg(inputPath)
        .outputOptions([
          '-vn',
          '-c:a', 'libopus',
          '-b:a', '32k',
          '-ar', '48000',
          '-ac', '1',
          '-f', 'ogg',
        ])
        .output(outputPath)
        .on('end', () => resolve())
        .on('error', (err) => reject(err))
        .run();
    });

    return await fs.readFile(outputPath);
  } catch (error) {
    logger.error({ error }, 'Gagal mengonversi audio ke Voice Note');
    throw error;
  } finally {
    if (needDeleteInput) await deleteTempFile(inputPath);
    await deleteTempFile(outputPath);
  }
}
