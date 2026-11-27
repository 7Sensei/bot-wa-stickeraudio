import ffmpeg from 'fluent-ffmpeg';
import fs from 'fs/promises';
import { writeTempFile, createTempFilePath, deleteTempFile } from '../utils/temp-file.js';
import { logger } from '../utils/logger.js';

/**
 * Memeriksa apakah file media memiliki stream audio menggunakan ffprobe
 */
export async function hasAudioStream(filePath: string): Promise<boolean> {
  return new Promise((resolve) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err || !metadata?.streams) {
        resolve(false);
        return;
      }
      const found = metadata.streams.some((s) => s.codec_type === 'audio');
      resolve(found);
    });
  });
}

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
    logger.error({ err: error }, 'Gagal mengonversi video ke MP3');
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
    logger.error({ err: error }, 'Gagal mengonversi audio ke Voice Note');
    throw error;
  } finally {
    if (needDeleteInput) await deleteTempFile(inputPath);
    await deleteTempFile(outputPath);
  }
}

/**
 * Mengekstrak audio dari video untuk stiker bersuara (Sound Sticker):
 * - Format: Ogg Opus mono 48 kHz
 * - Durasi: persis sama dengan durasi stiker (-t seconds)
 * - Efek fade: fade in 0.02 detik, fade out 0.12 detik agar tidak bersuara 'klik' saat berulang
 * - Bitrate: 64k, -map_metadata -1
 * - Mengembalikan null jika video tidak memiliki audio, audionya senyap (<= -50 dB), atau ukuran > 256.000 byte
 */
export async function videoToStickerAudio(
  input: Buffer | string,
  seconds: number
): Promise<Buffer | null> {
  let inputPath = '';
  let needDeleteInput = false;
  const outputPath = createTempFilePath('ogg');

  try {
    if (Buffer.isBuffer(input)) {
      inputPath = await writeTempFile(input, 'sound_audio_in');
      needDeleteInput = true;
    } else {
      inputPath = input;
    }

    // 1. Periksa apakah video memiliki stream audio
    const hasAudio = await hasAudioStream(inputPath);
    if (!hasAudio) {
      logger.info({ inputPath }, 'Video tidak memiliki stream audio.');
      return null;
    }

    const fadeOutStart = Math.max(0, seconds - 0.12).toFixed(3);
    let stderrOutput = '';

    // 2. Ekstrak audio menggunakan ffmpeg dengan filter fade dan volumedetect
    await new Promise<void>((resolve, reject) => {
      ffmpeg(inputPath)
        .duration(seconds)
        .outputOptions([
          '-map', '0:a:0',
          '-vn',
          '-sn',
          '-dn',
          '-ac', '1',
          '-ar', '48000',
          '-af', `afade=t=in:d=0.02,afade=t=out:st=${fadeOutStart}:d=0.12,volumedetect`,
          '-c:a', 'libopus',
          '-b:a', '64k',
          '-application', 'audio',
          '-map_metadata', '-1',
          '-f', 'ogg',
        ])
        .output(outputPath)
        .on('stderr', (line) => {
          stderrOutput += line + '\n';
        })
        .on('end', () => resolve())
        .on('error', (err) => reject(err))
        .run();
    });

    // 3. Deteksi apakah audio senyap (<= -50 dB atau -inf)
    const rawVolume = /max_volume:\s*(-?[\d.]+|-inf)\s*dB/i.exec(stderrOutput)?.[1];
    const maxVolume = rawVolume === '-inf' ? -Infinity : (rawVolume ? Number(rawVolume) : undefined);
    if (maxVolume !== undefined && maxVolume <= -50) {
      logger.info({ maxVolume }, 'Audio terdeteksi senyap (<= -50 dB), diabaikan.');
      return null;
    }

    // 4. Periksa ukuran file audio (maksimal 256.000 byte untuk WhatsApp)
    const audioBuffer = await fs.readFile(outputPath);
    if (!audioBuffer.length) {
      logger.warn('Audio hasil ekstraksi kosong.');
      return null;
    }
    if (audioBuffer.length > 256_000) {
      logger.warn({ size: audioBuffer.length }, 'Ukuran audio stiker melebihi batas 256.000 byte.');
      return null;
    }

    return audioBuffer;
  } catch (error) {
    logger.warn({ error }, 'Gagal mengekstrak audio untuk stiker bersuara.');
    return null;
  } finally {
    if (needDeleteInput) await deleteTempFile(inputPath);
    await deleteTempFile(outputPath);
  }
}
