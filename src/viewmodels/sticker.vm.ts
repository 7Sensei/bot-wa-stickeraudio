import { config } from '../config/index.js';
import { stickerStore } from '../stores/sticker.store.js';
import { imageToSticker, videoToSticker } from '../models/sticker.service.js';
import { mediaQueue } from '../utils/queue.js';
import { logger } from '../utils/logger.js';
import type { ParsedCommand } from '../utils/message-extractor.js';

export class StickerViewModel {
  /**
   * Menangani perintah .s atau .stiker
   * Melakukan validasi input, memanggil Model, dan memperbarui Zustand store.
   * Tidak memanggil Baileys secara langsung.
   */
  async handleSticker(context: ParsedCommand): Promise<void> {
    const { chatId, senderId, messageId, media, args } = context;

    // 1. Validasi keberadaan media
    if (!media) {
      stickerStore.getState().setProcessing(chatId, senderId, messageId);
      stickerStore.getState().setError(
        chatId,
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
        chatId,
        '⚠️ Format media tidak didukung! Harap gunakan file gambar (JPG/PNG) atau video/GIF.'
      );
      return;
    }

    // 3. Validasi durasi video/GIF
    if (isVideo && media.seconds && media.seconds > config.maxStickerVideoDurationSec) {
      stickerStore.getState().setProcessing(chatId, senderId, messageId);
      stickerStore.getState().setError(
        chatId,
        `⚠️ Durasi video terlalu panjang (${media.seconds} detik)! Maksimal ${config.maxStickerVideoDurationSec} detik untuk stiker bergerak.`
      );
      return;
    }

    // 4. Validasi ukuran file
    const maxAllowedMB = isVideo ? config.maxVideoSizeMB : config.maxImageSizeMB;
    if (media.fileLength && media.fileLength > maxAllowedMB * 1024 * 1024) {
      stickerStore.getState().setProcessing(chatId, senderId, messageId);
      stickerStore.getState().setError(
        chatId,
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

    // 6. Update store ke status processing
    stickerStore.getState().setProcessing(chatId, senderId, messageId);

    // 7. Masukkan tugas ke antrean media tunggal (mencegah Termux OOM)
    mediaQueue.enqueue(async () => {
      try {
        logger.info({ chatId, isVideo }, 'Mulai mendownload dan memproses stiker...');
        const mediaBuffer = await media.download();

        let resultBuffer: Buffer;
        if (isVideo) {
          resultBuffer = await videoToSticker(mediaBuffer, { packName, authorName });
        } else {
          resultBuffer = await imageToSticker(mediaBuffer, { packName, authorName });
        }

        // 8. Update store ke status done
        stickerStore.getState().setDone(chatId, resultBuffer);
        logger.info({ chatId }, 'Berhasil membuat stiker');
      } catch (error: any) {
        logger.error({ error, chatId }, 'Gagal memproses stiker');

        let friendlyMsg = '❌ Terjadi kesalahan saat membuat stiker. Pastikan format media valid dan coba lagi.';
        if (error?.message?.includes('melebihi batas 1MB')) {
          friendlyMsg = '⚠️ Ukuran stiker animasi melebihi batas 1MB WhatsApp. Silakan gunakan video dengan durasi lebih singkat.';
        }

        stickerStore.getState().setError(chatId, friendlyMsg);
      }
    });
  }
}

export const stickerViewModel = new StickerViewModel();
