import { config } from '../config/index.js';
import { stickerStore } from '../stores/sticker.store.js';
import { imageToSticker, videoToSticker, videoToSoundSticker } from '../models/sticker.service.js';
import { mediaQueue } from '../utils/queue.js';
import { logger } from '../utils/logger.js';
import type { ParsedCommand } from '../utils/message-extractor.js';

export class StickerViewModel {
  /**
   * Menangani perintah .s atau .stiker
   * State dikunci per messageId sehingga banyak perintah dari chat/grup yang sama
   * tidak saling menimpa. Balasan tetap dikirim ke chatId yang benar via store.
   */
  async handleSticker(context: ParsedCommand): Promise<void> {
    const { chatId, senderId, messageId, media, args } = context;

    // 1. Validasi keberadaan media
    if (!media) {
      stickerStore.getState().setProcessing(chatId, senderId, messageId);
      stickerStore.getState().setError(
        messageId,
        '⚠️ Kirim gambar/video/GIF dengan caption *.s* atau balas (reply) media tersebut dengan *.s*!'
      );
      return;
    }

    const mimetype = media.mimetype.toLowerCase();
    const isImage = mimetype.startsWith('image/');
    const isVideo = mimetype.startsWith('video/') || Boolean(media.isAnimated);

    // 2. Validasi tipe media
    if (!isImage && !isVideo) {
      stickerStore.getState().setProcessing(chatId, senderId, messageId);
      stickerStore.getState().setError(
        messageId,
        '⚠️ Format media tidak didukung! Harap gunakan file gambar (JPG/PNG) atau video/GIF.'
      );
      return;
    }

    // 3. Validasi durasi video/GIF
    if (isVideo && media.seconds && media.seconds > config.maxStickerVideoDurationSec) {
      stickerStore.getState().setProcessing(chatId, senderId, messageId);
      stickerStore.getState().setError(
        messageId,
        `⚠️ Durasi video terlalu panjang (${media.seconds} detik)! Maksimal ${config.maxStickerVideoDurationSec} detik untuk stiker bergerak.`
      );
      return;
    }

    // 4. Validasi ukuran file
    const maxAllowedMB = isVideo ? config.maxVideoSizeMB : config.maxImageSizeMB;
    if (media.fileLength && media.fileLength > maxAllowedMB * 1024 * 1024) {
      stickerStore.getState().setProcessing(chatId, senderId, messageId);
      stickerStore.getState().setError(
        messageId,
        `⚠️ Ukuran file terlalu besar! Maksimal ukuran yang diizinkan adalah ${maxAllowedMB}MB.`
      );
      return;
    }

    // 5. Ekstraksi metadata stiker kustom dari argumen teks (jika ada: .s PackName | AuthorName)
    let packName = config.stickerPackName;
    let authorName = config.stickerAuthorName;
    if (args.length > 0) {
      const fullArg = args.join(' ');
      if (fullArg.includes('|')) {
        const parts = fullArg.split('|');
        packName = parts[0].trim() || packName;
        authorName = parts[1].trim() || authorName;
      } else {
        packName = fullArg.trim();
      }
    }

    // 6. Update store ke status processing (kunci: messageId)
    stickerStore.getState().setProcessing(chatId, senderId, messageId);

    // 7. Masukkan tugas ke antrean media tunggal (mencegah Termux OOM)
    mediaQueue.enqueue(async () => {
      try {
        logger.info({ chatId, messageId, isVideo }, 'Mulai mendownload dan memproses stiker...');
        const mediaBuffer = await media.download();

        let resultBuffer: Buffer;
        if (isVideo) {
          resultBuffer = await videoToSticker(mediaBuffer, { packName, authorName });
        } else {
          resultBuffer = await imageToSticker(mediaBuffer, { packName, authorName });
        }

        // 8. Update store ke status done (kunci: messageId)
        stickerStore.getState().setDone(messageId, resultBuffer);
        logger.info({ chatId, messageId }, 'Berhasil membuat stiker');
      } catch (error: any) {
        logger.error({ err: error, chatId, messageId }, 'Gagal memproses stiker');

        let friendlyMsg = '❌ Terjadi kesalahan saat membuat stiker. Pastikan format media valid dan coba lagi.';
        if (error?.message?.includes('melebihi batas 1MB')) {
          friendlyMsg = '⚠️ Ukuran stiker animasi melebihi batas 1MB WhatsApp. Silakan gunakan video dengan durasi lebih singkat.';
        }

        stickerStore.getState().setError(messageId, friendlyMsg);
      }
    });
  }

  /**
   * Menangani perintah .som, .ss, atau .soundsticker (Stiker Bersuara)
   * Hanya menerima video/GIF bersuara, mengompresi stiker WebP animasi di bawah 500 KB,
   * dan menyematkan audio Ogg Opus. Jika tidak bersuara, fallback ke stiker animasi biasa.
   */
  async handleSoundSticker(context: ParsedCommand): Promise<void> {
    const { chatId, senderId, messageId, media, args } = context;

    // 1. Validasi keberadaan media
    if (!media) {
      stickerStore.getState().setProcessing(chatId, senderId, messageId);
      stickerStore.getState().setError(
        messageId,
        '⚠️ Kirim video/GIF dengan caption *.som* atau balas (reply) video tersebut dengan *.som*!'
      );
      return;
    }

    const mimetype = media.mimetype.toLowerCase();
    const isVideo = mimetype.startsWith('video/') || Boolean(media.isAnimated);

    // 2. Validasi tipe media (hanya video atau GIF, bukan gambar diam)
    if (!isVideo) {
      stickerStore.getState().setProcessing(chatId, senderId, messageId);
      stickerStore.getState().setError(
        messageId,
        '⚠️ Fitur stiker bersuara hanya mendukung video atau GIF bersuara, bukan gambar diam.'
      );
      return;
    }

    // 3. Validasi durasi video/GIF
    if (media.seconds && media.seconds > config.maxStickerVideoDurationSec) {
      stickerStore.getState().setProcessing(chatId, senderId, messageId);
      stickerStore.getState().setError(
        messageId,
        `⚠️ Durasi video terlalu panjang (${media.seconds} detik)! Maksimal ${config.maxStickerVideoDurationSec} detik untuk stiker bersuara.`
      );
      return;
    }

    // 4. Validasi ukuran file
    if (media.fileLength && media.fileLength > config.maxVideoSizeMB * 1024 * 1024) {
      stickerStore.getState().setProcessing(chatId, senderId, messageId);
      stickerStore.getState().setError(
        messageId,
        `⚠️ Ukuran file terlalu besar! Maksimal ukuran yang diizinkan adalah ${config.maxVideoSizeMB}MB.`
      );
      return;
    }

    // 5. Ekstraksi metadata stiker kustom dari argumen teks (.som PackName | AuthorName)
    let packName = config.stickerPackName;
    let authorName = config.stickerAuthorName;
    if (args.length > 0) {
      const fullArg = args.join(' ');
      if (fullArg.includes('|')) {
        const parts = fullArg.split('|');
        packName = parts[0].trim() || packName;
        authorName = parts[1].trim() || authorName;
      } else {
        packName = fullArg.trim();
      }
    }

    // 6. Update store ke status processing (kunci: messageId)
    stickerStore.getState().setProcessing(chatId, senderId, messageId);

    // 7. Masukkan tugas ke antrean media tunggal
    mediaQueue.enqueue(async () => {
      try {
        logger.info({ chatId, messageId }, 'Mulai mendownload dan memproses stiker bersuara...');
        const mediaBuffer = await media.download();

        try {
          const soundResult = await videoToSoundSticker(mediaBuffer, { packName, authorName });

          if (soundResult.hasAudio && soundResult.audio) {
            stickerStore.getState().setDone(messageId, soundResult.sticker, {
              audio: soundResult.audio,
              durationMs: soundResult.durationMs,
            });
            logger.info({ chatId, messageId }, 'Berhasil membuat stiker bersuara');
          } else {
            // Video tidak punya stream audio atau audio senyap -> fallback ke stiker biasa
            stickerStore.getState().setDone(messageId, soundResult.sticker, {
              audio: null,
              durationMs: soundResult.durationMs,
              notice: 'ℹ️ Video tidak memiliki suara atau suara terlalu senyap, dikirim sebagai stiker biasa.',
            });
            logger.info({ chatId, messageId }, 'Stiker dibuat tanpa audio (suara senyap/tidak ada)');
          }
        } catch (soundError) {
          logger.warn({ soundError, chatId, messageId }, 'Gagal membuat stiker bersuara, mencoba fallback ke stiker animasi biasa');
          const fallbackSticker = await videoToSticker(mediaBuffer, { packName, authorName });
          stickerStore.getState().setDone(messageId, fallbackSticker, {
            audio: null,
            durationMs: 0,
            notice: 'ℹ️ Gagal membuat stiker bersuara, dikirim sebagai stiker animasi biasa.',
          });
        }
      } catch (error: any) {
        logger.error({ err: error, chatId, messageId }, 'Gagal memproses stiker bersuara');

        let friendlyMsg = '❌ Terjadi kesalahan saat membuat stiker bersuara. Pastikan format media valid dan coba lagi.';
        if (error?.message?.includes('500 KB') || error?.message?.includes('1MB')) {
          friendlyMsg = '⚠️ Ukuran stiker melebihi batas WhatsApp. Silakan gunakan video dengan durasi lebih singkat.';
        }

        stickerStore.getState().setError(messageId, friendlyMsg);
      }
    });
  }
}

export const stickerViewModel = new StickerViewModel();
