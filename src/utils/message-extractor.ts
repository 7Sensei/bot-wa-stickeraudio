import { downloadMediaMessage, type WAMessage, type proto } from '@whiskeysockets/baileys';
import { logger } from './logger.js';

export interface ParsedMedia {
  mimetype: string;
  fileLength?: number;
  seconds?: number;
  isAnimated?: boolean;
  download: () => Promise<Buffer>;
}

export interface ParsedCommand {
  chatId: string;
  senderId: string;
  messageId: string;
  command: string;
  args: string[];
  rawText: string;
  media?: ParsedMedia | null;
}

/**
 * Mengekstrak teks dari berbagai tipe pesan WhatsApp
 */
export function extractMessageText(message: proto.IMessage | null | undefined): string {
  if (!message) return '';

  return (
    message.conversation ||
    message.extendedTextMessage?.text ||
    message.imageMessage?.caption ||
    message.videoMessage?.caption ||
    ''
  ).trim();
}

/**
 * Mengekstrak info media (langsung atau dari pesan yang dibalas / quoted)
 */
export function extractMediaInfo(
  fullMsg: WAMessage
): ParsedMedia | null {
  const msg = fullMsg.message;
  if (!msg) return null;

  // 1. Cek media langsung di pesan
  if (msg.imageMessage) {
    const img = msg.imageMessage;
    return {
      mimetype: img.mimetype || 'image/jpeg',
      fileLength: Number(img.fileLength || 0),
      isAnimated: false,
      download: async () => {
        return (await downloadMediaMessage(fullMsg, 'buffer', {})) as Buffer;
      },
    };
  }

  if (msg.videoMessage) {
    const vid = msg.videoMessage;
    return {
      mimetype: vid.mimetype || 'video/mp4',
      fileLength: Number(vid.fileLength || 0),
      seconds: Number(vid.seconds || 0),
      isAnimated: Boolean(vid.gifPlayback),
      download: async () => {
        return (await downloadMediaMessage(fullMsg, 'buffer', {})) as Buffer;
      },
    };
  }

  if (msg.audioMessage) {
    const aud = msg.audioMessage;
    return {
      mimetype: aud.mimetype || 'audio/mp4',
      fileLength: Number(aud.fileLength || 0),
      seconds: Number(aud.seconds || 0),
      isAnimated: false,
      download: async () => {
        return (await downloadMediaMessage(fullMsg, 'buffer', {})) as Buffer;
      },
    };
  }

  // 2. Cek media dari pesan yang dibalas (quoted message)
  const quoted = msg.extendedTextMessage?.contextInfo?.quotedMessage;
  if (quoted) {
    if (quoted.imageMessage) {
      const qImg = quoted.imageMessage;
      return {
        mimetype: qImg.mimetype || 'image/jpeg',
        fileLength: Number(qImg.fileLength || 0),
        isAnimated: false,
        download: async () => {
          const fakeMsg = {
            key: {
              remoteJid: fullMsg.key.remoteJid,
              id: fullMsg.message?.extendedTextMessage?.contextInfo?.stanzaId || '',
              participant: fullMsg.message?.extendedTextMessage?.contextInfo?.participant || undefined,
            },
            message: { imageMessage: qImg },
          } as WAMessage;
          return (await downloadMediaMessage(fakeMsg, 'buffer', {})) as Buffer;
        },
      };
    }

    if (quoted.videoMessage) {
      const qVid = quoted.videoMessage;
      return {
        mimetype: qVid.mimetype || 'video/mp4',
        fileLength: Number(qVid.fileLength || 0),
        seconds: Number(qVid.seconds || 0),
        isAnimated: Boolean(qVid.gifPlayback),
        download: async () => {
          const fakeMsg = {
            key: {
              remoteJid: fullMsg.key.remoteJid,
              id: fullMsg.message?.extendedTextMessage?.contextInfo?.stanzaId || '',
              participant: fullMsg.message?.extendedTextMessage?.contextInfo?.participant || undefined,
            },
            message: { videoMessage: qVid },
          } as WAMessage;
          return (await downloadMediaMessage(fakeMsg, 'buffer', {})) as Buffer;
        },
      };
    }

    if (quoted.audioMessage) {
      const qAud = quoted.audioMessage;
      return {
        mimetype: qAud.mimetype || 'audio/mp4',
        fileLength: Number(qAud.fileLength || 0),
        seconds: Number(qAud.seconds || 0),
        isAnimated: false,
        download: async () => {
          const fakeMsg = {
            key: {
              remoteJid: fullMsg.key.remoteJid,
              id: fullMsg.message?.extendedTextMessage?.contextInfo?.stanzaId || '',
              participant: fullMsg.message?.extendedTextMessage?.contextInfo?.participant || undefined,
            },
            message: { audioMessage: qAud },
          } as WAMessage;
          return (await downloadMediaMessage(fakeMsg, 'buffer', {})) as Buffer;
        },
      };
    }
  }

  return null;
}
