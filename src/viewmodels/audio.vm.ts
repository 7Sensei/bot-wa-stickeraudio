import { config } from '../config/index.js';
import { audioStore } from '../stores/audio.store.js';
import { videoToMp3, audioToVoiceNote } from '../models/audio.service.js';
import { mediaQueue } from '../utils/queue.js';
import { logger } from '../utils/logger.js';
import type { ParsedCommand } from '../utils/message-extractor.js';

export class AudioViewModel {
  /**
   * Menangani perintah .audio (konversi ke MP3) dan .vn (konversi ke Voice Note OGG Opus)
   * Melakukan validasi input, memanggil Model, dan memperbarui Zustand store.
   * Tidak memanggil Baileys secara langsung.
   */
  async handleAudio(context: ParsedCommand, isVoiceNote: boolean): Promise<void> {
    const { chatId, senderId, messageId, media } = context;

    // 1. Validasi keberadaan media
    if (!media) {
      audioStore.getState().setProcessing(chatId, senderId, messageId, isVoiceNote);
      audioStore.getState().setError(
        chatId,
        isVoiceNote
          ? '⚠️ Kirim audio/video atau balas pesan audio dengan perintah *.vn* untuk mengubahnya ke Voice Note!'
          : '⚠️ Kirim video atau balas video dengan perintah *.audio* untuk mengubahnya menjadi MP3!'
      );
      return;
    }

    const mimetype = media.mimetype.toLowerCase();
    const isAudio = mimetype.startsWith('audio/');
    const isVideo = mimetype.startsWith('video/');

    // 2. Validasi tipe media
    if (!isAudio && !isVideo) {
      audioStore.getState().setProcessing(chatId, senderId, messageId, isVoiceNote);
      audioStore.getState().setError(
        chatId,
        '⚠️ Format media tidak didukung! Harap kirim atau balas file video atau audio.'
      );
      return;
    }

    // 3. Validasi ukuran file
    const maxAllowedMB = isVoiceNote ? config.maxAudioSizeMB : config.maxVideoSizeMB;
    if (media.fileLength && media.fileLength > maxAllowedMB * 1024 * 1024) {
      audioStore.getState().setProcessing(chatId, senderId, messageId, isVoiceNote);
      audioStore.getState().setError(
        chatId,
        `⚠️ Ukuran file terlalu besar! Maksimal ukuran yang diizinkan adalah ${maxAllowedMB}MB.`
      );
      return;
    }

    // 4. Update store ke status processing
    audioStore.getState().setProcessing(chatId, senderId, messageId, isVoiceNote);

    // 5. Masukkan tugas ke antrean media tunggal
    mediaQueue.enqueue(async () => {
      try {
        logger.info({ chatId, isVoiceNote }, 'Mulai mendownload dan memproses audio...');
        const mediaBuffer = await media.download();

        let resultBuffer: Buffer;
        if (isVoiceNote) {
          resultBuffer = await audioToVoiceNote(mediaBuffer);
        } else {
          resultBuffer = await videoToMp3(mediaBuffer);
        }

        // 6. Update store ke status done
        audioStore.getState().setDone(chatId, resultBuffer);
        logger.info({ chatId, isVoiceNote }, 'Berhasil memproses audio');
      } catch (error: any) {
        logger.error({ err: error, chatId }, 'Gagal memproses konversi audio');
        audioStore.getState().setError(
          chatId,
          '❌ Terjadi kesalahan saat memproses audio. Pastikan file media tidak rusak.'
        );
      }
    });
  }
}

export const audioViewModel = new AudioViewModel();
