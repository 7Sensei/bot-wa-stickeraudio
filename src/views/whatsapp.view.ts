import type makeWASocket from '@whiskeysockets/baileys';
import { stickerStore } from '../stores/sticker.store.js';
import { audioStore } from '../stores/audio.store.js';
import { sendSoundSticker } from '../models/sound-sticker.service.js';
import { logger } from '../utils/logger.js';

export type WASocket = ReturnType<typeof makeWASocket>;

export class WhatsAppView {
  private sock: WASocket | null = null;
  private isSubscribed = false;

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
            // Kirim stiker bersuara (tanpa quoted palsu agar tidak crash)
            try {
              await sendSoundSticker(this.sock, chatId, {
                sticker: current.result,
                audio: current.audio,
                durationMs: current.durationMs,
              });
            } catch (soundError) {
              logger.error({ soundError, chatId }, 'Gagal mengirim stiker bersuara, fallback ke stiker biasa');
              await this.sock.sendMessage(
                chatId,
                { sticker: current.result },
                { quoted: { key: { remoteJid: chatId, id: current.messageId } } as any }
              );
              await this.sock.sendMessage(
                chatId,
                { text: '⚠️ Gagal mengirim stiker bersuara, stiker dikirim dalam format biasa.' },
                { quoted: { key: { remoteJid: chatId, id: current.messageId } } as any }
              );
            }
          } else {
            // Kirim stiker standar
            await this.sock.sendMessage(
              chatId,
              { sticker: current.result },
              { quoted: { key: { remoteJid: chatId, id: current.messageId } } as any }
            );
          }

          // Kirim pesan pemberitahuan/notice jika ada
          if (current.notice) {
            await this.sock.sendMessage(
              chatId,
              { text: current.notice },
              { quoted: { key: { remoteJid: chatId, id: current.messageId } } as any }
            );
          }

          await this.sendReaction(chatId, current.messageId, '✅');
        } catch (error) {
          logger.error({ error, chatId }, 'Gagal mengirim stiker ke WhatsApp');
        } finally {
          // Bersihkan state chat setelah selesai terkirim
          stickerStore.getState().reset(chatId);
        }
      }

      // Status berubah ke 'error'
      else if (current.status === 'error' && prev?.status !== 'error' && current.error) {
        try {
          await this.sock.sendMessage(
            chatId,
            { text: current.error },
            { quoted: { key: { remoteJid: chatId, id: current.messageId } } as any }
          );
          await this.sendReaction(chatId, current.messageId, '❌');
        } catch (error) {
          logger.error({ error, chatId }, 'Gagal mengirim pesan error stiker');
        } finally {
          // Bersihkan state chat setelah error terkirim
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
            await this.sock.sendMessage(
              chatId,
              {
                audio: current.result,
                mimetype: 'audio/ogg; codecs=opus',
                ptt: true,
              },
              { quoted: { key: { remoteJid: chatId, id: current.messageId } } as any }
            );
          } else {
            await this.sock.sendMessage(
              chatId,
              {
                audio: current.result,
                mimetype: 'audio/mp4',
                ptt: false,
              },
              { quoted: { key: { remoteJid: chatId, id: current.messageId } } as any }
            );
          }
          await this.sendReaction(chatId, current.messageId, '✅');
        } catch (error) {
          logger.error({ error, chatId }, 'Gagal mengirim audio ke WhatsApp');
        } finally {
          // Bersihkan state chat setelah selesai terkirim
          audioStore.getState().reset(chatId);
        }
      }

      // Status berubah ke 'error'
      else if (current.status === 'error' && prev?.status !== 'error' && current.error) {
        try {
          await this.sock.sendMessage(
            chatId,
            { text: current.error },
            { quoted: { key: { remoteJid: chatId, id: current.messageId } } as any }
          );
          await this.sendReaction(chatId, current.messageId, '❌');
        } catch (error) {
          logger.error({ error, chatId }, 'Gagal mengirim pesan error audio');
        } finally {
          // Bersihkan state chat setelah error terkirim
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
      logger.warn({ error, chatId, messageId, emoji }, 'Gagal mengirim reaksi WhatsApp');
    }
  }

  /**
   * Mengirim pesan teks menu bantuan ke WhatsApp
   */
  async sendMenu(chatId: string, menuText: string, messageId?: string): Promise<void> {
    if (!this.sock) return;
    try {
      await this.sock.sendMessage(
        chatId,
        { text: menuText },
        messageId ? { quoted: { key: { remoteJid: chatId, id: messageId } } as any } : undefined
      );
    } catch (error) {
      logger.error({ error, chatId }, 'Gagal mengirim menu bantuan');
    }
  }
}

export const whatsAppView = new WhatsAppView();
