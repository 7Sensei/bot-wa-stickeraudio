import type makeWASocket from '@whiskeysockets/baileys';
import type { WAMessage } from '@whiskeysockets/baileys';
import { stickerStore } from '../stores/sticker.store.js';
import { audioStore } from '../stores/audio.store.js';
import { sendSoundSticker } from '../models/sound-sticker.service.js';
import { logger } from '../utils/logger.js';

export type WASocket = ReturnType<typeof makeWASocket>;

export class WhatsAppView {
  private sock: WASocket | null = null;
  private isSubscribed = false;

  /**
   * Cache pesan asli WhatsApp untuk dikutip (quoted).
   * Kunci: `${chatId}:${messageId}`, kapasitas maksimal 100 pesan.
   */
  private messageCache = new Map<string, WAMessage>();

  /**
   * Mengikat socket Baileys yang aktif ke View
   */
  bindSocket(sock: WASocket): void {
    this.sock = sock;

    if (!this.isSubscribed) {
      this.subscribeToStores();
      this.isSubscribed = true;
    }
  }

  /**
   * Menyimpan referensi pesan asli ke cache agar bisa di-quote dengan benar
   */
  rememberMessage(msg: WAMessage): void {
    const chatId = msg.key.remoteJid;
    const messageId = msg.key.id;
    if (!chatId || !messageId) return;

    const key = `${chatId}:${messageId}`;
    if (this.messageCache.size >= 100) {
      const oldestKey = this.messageCache.keys().next().value;
      if (oldestKey) {
        this.messageCache.delete(oldestKey);
      }
    }
    this.messageCache.set(key, msg);
  }

  /**
   * Mengambil pesan asli dari cache untuk dijadikan quoted
   */
  private quotedFor(chatId: string, messageId: string): WAMessage | undefined {
    return this.messageCache.get(`${chatId}:${messageId}`);
  }

  /**
   * Menghapus pesan dari cache setelah tugas selesai
   */
  private forgetMessage(chatId: string, messageId: string): void {
    this.messageCache.delete(`${chatId}:${messageId}`);
  }

  /**
   * Mengirim pesan dengan quoted asli jika tersedia.
   * Jika gagal dengan quoted, mencoba sekali lagi tanpa quoted sebagai fallback.
   */
  private async sendMessageWithQuotedFallback(
    chatId: string,
    content: Parameters<WASocket['sendMessage']>[1],
    messageId?: string
  ): Promise<void> {
    if (!this.sock) return;
    const quoted = messageId ? this.quotedFor(chatId, messageId) : undefined;

    try {
      await this.sock.sendMessage(chatId, content, quoted ? { quoted } : undefined);
    } catch (err) {
      if (quoted) {
        logger.warn(
          { err, chatId, messageId },
          'Gagal mengirim pesan dengan quoted, mencoba ulang tanpa quoted'
        );
        await this.sock.sendMessage(chatId, content);
      } else {
        throw err;
      }
    }
  }

  /**
   * Berlangganan (subscribe) ke Zustand Store untuk stiker dan audio.
   * Merender balasan: reaksi ⏳ saat processing, ✅ saat selesai beserta media,
   * atau pesan error yang ramah dan ❌ saat gagal.
   */
  private subscribeToStores(): void {
    // 1. Subscribe ke Store Stiker
    stickerStore.subscribe(async (state, prevState) => {
      const chatId = state.lastUpdatedChatId;
      if (!chatId || !this.sock) return;

      const current = state.chats[chatId];
      const prev = prevState?.chats?.[chatId];

      if (!current) return;

      // Status berubah ke 'processing'
      if (current.status === 'processing' && prev?.status !== 'processing') {
        await this.sendReaction(chatId, current.messageId, '⏳');
      }

      // Status berubah ke 'done'
      else if (current.status === 'done' && prev?.status !== 'done' && current.result) {
        try {
          if (current.audio) {
            const quoted = this.quotedFor(chatId, current.messageId);

            try {
              // Coba kirim stiker bersuara dengan quoted jika ada
              try {
                await sendSoundSticker(this.sock, chatId, {
                  sticker: current.result,
                  audio: current.audio,
                  durationMs: current.durationMs,
                  quoted,
                });
              } catch (quotedErr) {
                if (quoted) {
                  logger.warn(
                    { err: quotedErr, chatId },
                    'Gagal mengirim stiker bersuara dengan quoted, mencoba tanpa quoted'
                  );
                  await sendSoundSticker(this.sock, chatId, {
                    sticker: current.result,
                    audio: current.audio,
                    durationMs: current.durationMs,
                    quoted: undefined,
                  });
                } else {
                  throw quotedErr;
                }
              }
            } catch (soundError) {
              logger.error(
                { err: soundError, chatId },
                'Gagal mengirim stiker bersuara, fallback ke stiker biasa'
              );
              await this.sendMessageWithQuotedFallback(
                chatId,
                { sticker: current.result },
                current.messageId
              );
              await this.sendMessageWithQuotedFallback(
                chatId,
                { text: '⚠️ Gagal mengirim stiker bersuara, stiker dikirim dalam format biasa.' },
                current.messageId
              );
            }
          } else {
            // Kirim stiker standar
            await this.sendMessageWithQuotedFallback(
              chatId,
              { sticker: current.result },
              current.messageId
            );
          }

          // Kirim pesan pemberitahuan/notice jika ada
          if (current.notice) {
            await this.sendMessageWithQuotedFallback(
              chatId,
              { text: current.notice },
              current.messageId
            );
          }

          await this.sendReaction(chatId, current.messageId, '✅');
        } catch (error) {
          logger.error({ err: error, chatId }, 'Gagal mengirim stiker ke WhatsApp');
        } finally {
          this.forgetMessage(chatId, current.messageId);
          stickerStore.getState().reset(chatId);
        }
      }

      // Status berubah ke 'error'
      else if (current.status === 'error' && prev?.status !== 'error' && current.error) {
        try {
          await this.sendMessageWithQuotedFallback(
            chatId,
            { text: current.error },
            current.messageId
          );
          await this.sendReaction(chatId, current.messageId, '❌');
        } catch (error) {
          logger.error({ err: error, chatId }, 'Gagal mengirim pesan error stiker');
        } finally {
          this.forgetMessage(chatId, current.messageId);
          stickerStore.getState().reset(chatId);
        }
      }
    });

    // 2. Subscribe ke Store Audio
    audioStore.subscribe(async (state, prevState) => {
      const chatId = state.lastUpdatedChatId;
      if (!chatId || !this.sock) return;

      const current = state.chats[chatId];
      const prev = prevState?.chats?.[chatId];

      if (!current) return;

      // Status berubah ke 'processing'
      if (current.status === 'processing' && prev?.status !== 'processing') {
        await this.sendReaction(chatId, current.messageId, '⏳');
      }

      // Status berubah ke 'done'
      else if (current.status === 'done' && prev?.status !== 'done' && current.result) {
        try {
          if (current.isVoiceNote) {
            await this.sendMessageWithQuotedFallback(
              chatId,
              {
                audio: current.result,
                mimetype: 'audio/ogg; codecs=opus',
                ptt: true,
              },
              current.messageId
            );
          } else {
            await this.sendMessageWithQuotedFallback(
              chatId,
              {
                audio: current.result,
                mimetype: 'audio/mp4',
                ptt: false,
              },
              current.messageId
            );
          }
          await this.sendReaction(chatId, current.messageId, '✅');
        } catch (error) {
          logger.error({ err: error, chatId }, 'Gagal mengirim audio ke WhatsApp');
        } finally {
          this.forgetMessage(chatId, current.messageId);
          audioStore.getState().reset(chatId);
        }
      }

      // Status berubah ke 'error'
      else if (current.status === 'error' && prev?.status !== 'error' && current.error) {
        try {
          await this.sendMessageWithQuotedFallback(
            chatId,
            { text: current.error },
            current.messageId
          );
          await this.sendReaction(chatId, current.messageId, '❌');
        } catch (error) {
          logger.error({ err: error, chatId }, 'Gagal mengirim pesan error audio');
        } finally {
          this.forgetMessage(chatId, current.messageId);
          audioStore.getState().reset(chatId);
        }
      }
    });
  }

  /**
   * Mengirim reaksi emoji ke pesan WhatsApp tertentu
   */
  async sendReaction(chatId: string, messageId: string, emoji: string): Promise<void> {
    if (!this.sock) return;
    try {
      await this.sock.sendMessage(chatId, {
        react: {
          text: emoji,
          key: {
            remoteJid: chatId,
            id: messageId,
          },
        },
      });
    } catch (error) {
      logger.warn({ err: error, chatId, messageId, emoji }, 'Gagal mengirim reaksi WhatsApp');
    }
  }

  /**
   * Mengirim pesan teks menu bantuan ke WhatsApp
   */
  async sendMenu(chatId: string, menuText: string, messageId?: string): Promise<void> {
    if (!this.sock) return;
    try {
      await this.sendMessageWithQuotedFallback(chatId, { text: menuText }, messageId);
    } catch (error) {
      logger.error({ err: error, chatId }, 'Gagal mengirim menu bantuan');
    }
  }
}

export const whatsAppView = new WhatsAppView();
