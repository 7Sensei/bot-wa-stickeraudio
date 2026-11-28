import { config } from '../config/index.js';
import { stickerViewModel } from './sticker.vm.js';
import { audioViewModel } from './audio.vm.js';
import { logger } from '../utils/logger.js';
import type { ParsedCommand } from '../utils/message-extractor.js';

export interface RouteResult {
  handled: boolean;
  isMenu?: boolean;
  menuText?: string;
}

export class CommandRouter {
  /**
   * Menghasilkan teks bantuan menu perintah dalam bahasa Indonesia
   */
  getMenuText(): string {
    const p = config.prefix;
    return (
      `🤖 *BOT WHATSAPP STIKER & AUDIO* 🤖\n` +
      `_Dioptimalkan khusus untuk Termux (Android)_\n\n` +
      `📌 *Daftar Perintah:*\n` +
      `  • *${p}s* atau *${p}stiker*\n` +
      `    Ubah gambar/video/GIF jadi stiker.\n` +
      `    _Bisa tambah pack & author:_\n` +
      `    \`${p}s Nama Pack | Nama Pembuat\`\n\n` +
      `  • *${p}som* atau *${p}ss*\n` +
      `    Ubah video jadi stiker bersuara (sound sticker).\n` +
      `    _Bisa tambah pack & author:_\n` +
      `    \`${p}som Nama Pack | Nama Pembuat\`\n\n` +
      `  • *${p}audio*\n` +
      `    Ekstrak audio dari video menjadi file MP3.\n\n` +
      `  • *${p}vn*\n` +
      `    Ubah audio/video menjadi Voice Note (PTT) WhatsApp.\n\n` +
      `  • *${p}menu*\n` +
      `    Menampilkan pesan menu bantuan ini.\n\n` +
      `  • *${p}id*\n` +
      `    Menampilkan ID chat ini (berguna untuk mengisi ALLOWED_CHATS di .env).\n\n` +
      `⚙️ *Batasan Media:*\n` +
      `  • Gambar: Maksimal ${config.maxImageSizeMB}MB\n` +
      `  • Video: Maksimal ${config.maxVideoSizeMB}MB\n` +
      `  • Durasi stiker animasi: Maksimal ${config.maxStickerVideoDurationSec} detik\n` +
      `  • Stiker bersuara: Maksimal 500 KB (WebP) & 256 KB (Audio Opus)\n` +
      `  • Antrean: 1 media pada satu waktu agar HP tetap hemat RAM & adem.`
    );
  }

  /**
   * Mem-parsing teks pesan dan meneruskan perintah ke ViewModel terkait
   */
  async route(context: ParsedCommand): Promise<RouteResult> {
    const { rawText } = context;
    const prefix = config.prefix;

    // Jika pesan tidak diawali dengan prefix, abaikan
    if (!rawText.startsWith(prefix)) {
      return { handled: false };
    }

    // Ambil string perintah tanpa prefix
    const parts = rawText.slice(prefix.length).trim().split(/\s+/);
    const command = parts[0]?.toLowerCase();
    const args = parts.slice(1);

    context.command = command;
    context.args = args;

    logger.info({ command, chatId: context.chatId }, 'Perintah diterima');

    try {
      switch (command) {
        case 's':
        case 'stiker':
        case 'sticker':
          await stickerViewModel.handleSticker(context);
          return { handled: true };

        case 'som':
        case 'ss':
        case 'soundsticker':
          await stickerViewModel.handleSoundSticker(context);
          return { handled: true };

        case 'audio':
        case 'mp3':
          await audioViewModel.handleAudio(context, false);
          return { handled: true };

        case 'vn':
        case 'voicenote':
        case 'ptt':
          await audioViewModel.handleAudio(context, true);
          return { handled: true };

        case 'menu':
        case 'help':
        case 'bantuan':
          return {
            handled: true,
            isMenu: true,
            menuText: this.getMenuText(),
          };

        case 'id':
          return {
            handled: true,
            isMenu: true,
            menuText: `🆔 *ID chat ini:*\n\`${context.chatId}\`\n\n_Salin ID di atas lalu tambahkan ke variabel ALLOWED_CHATS di file .env._`,
          };

        default:
          return { handled: false };
      }
    } catch (error) {
      logger.error({ err: error, command }, 'Error saat mengeksekusi routing perintah');
      return { handled: false };
    }
  }
}

export const commandRouter = new CommandRouter();
