import dotenv from 'dotenv';
import path from 'path';

// Load .env file
dotenv.config();

export interface BotConfig {
  prefix: string;
  botPhoneNumber: string;
  maxImageSizeMB: number;
  maxVideoSizeMB: number;
  maxAudioSizeMB: number;
  maxStickerVideoDurationSec: number;
  stickerPackName: string;
  stickerAuthorName: string;
  authDir: string;
  tempDir: string;
  logLevel: string;
}

export const config: BotConfig = {
  prefix: process.env.BOT_PREFIX || '.',
  botPhoneNumber: (process.env.BOT_PHONE_NUMBER || '').replace(/[^0-9]/g, ''),
  maxImageSizeMB: Number(process.env.MAX_IMAGE_SIZE_MB) || 10,
  maxVideoSizeMB: Number(process.env.MAX_VIDEO_SIZE_MB) || 15,
  maxAudioSizeMB: Number(process.env.MAX_AUDIO_SIZE_MB) || 25,
  maxStickerVideoDurationSec: Number(process.env.MAX_STICKER_VIDEO_DURATION_SEC) || 10,
  stickerPackName: process.env.STICKER_PACK_NAME || 'Bot Stiker Termux',
  stickerAuthorName: process.env.STICKER_AUTHOR_NAME || 'Antigravity',
  authDir: path.resolve(process.cwd(), process.env.AUTH_DIR || 'auth'),
  tempDir: path.resolve(process.cwd(), process.env.TEMP_DIR || 'temp'),
  logLevel: process.env.LOG_LEVEL || 'info',
};
