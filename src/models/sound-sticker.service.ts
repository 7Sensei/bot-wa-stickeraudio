/**
 * Layanan Pengiriman Stiker Bersuara (Sound Sticker) WhatsApp.
 *
 * Diadaptasi dari repository:
 * https://github.com/coelhobugado/whatsapp-figurinhas-com-som
 * Lisensi MIT - Hak Cipta (c) coelhobugado
 *
 * WhatsApp merepresentasikan stiker bersuara sebagai StickerMessage yang memuat
 * AudioMessage pada field 26, dibungkus di dalam FutureProofMessage pada field 134 dari Message:
 *
 *   Message
 *    └─ 134 FutureProofMessage
 *         └─ 1 Message
 *              └─ 26 StickerMessage (WebP animasi)
 *                   └─ 26 AudioMessage (Ogg/Opus + streamingSidecar)
 *
 * Kedua field ini belum ada di protobuf resmi Baileys 7.0.0-rc14, sehingga byte dirakit
 * secara manual di sini dan disematkan menggunakan encoder yang di-patch.
 * Format ini merupakan hasil rekayasa balik (reverse engineering) dari protokol WhatsApp
 * dan dapat berubah sewaktu-waktu pada pembaruan WhatsApp mendatang.
 */

import { createCipheriv, createHash, createHmac, timingSafeEqual } from 'node:crypto';
import {
  generateWAMessageFromContent,
  getMediaKeys,
  prepareWAMessageMedia,
  proto,
  type WAMessage,
  type WASocket,
} from '@whiskeysockets/baileys';

const FIELD_STICKER = 26;          // Message.stickerMessage
const FIELD_STICKER_AUDIO = 26;    // StickerMessage.<audio>, belum ada di proto Baileys
const FIELD_SOUND_WRAPPER = 134;   // Message.<FutureProofMessage stiker bersuara>
const FIELD_FUTURE_PROOF_MESSAGE = 1;
const SIDECAR_CHUNK = 64 * 1024;

/**
 * Menandai objek Message yang harus dikirim dalam format stiker bersuara.
 * Menggunakan Symbol agar tetap bertahan saat Baileys melakukan spread `{ ...message }`.
 * protobufjs mengabaikan kunci Symbol, sehingga penanda ini tidak bocor ke pesan lain.
 */
export const SOUND_STICKER_BYTES = Symbol.for('bot-figurinha-som.wrapper');
type MarkedMessage = proto.IMessage & { [SOUND_STICKER_BYTES]?: Uint8Array };

function varint(value: number): Buffer {
  const bytes: number[] = [];
  do {
    let byte = value % 128;
    value = Math.floor(value / 128);
    if (value) byte |= 0x80;
    bytes.push(byte);
  } while (value);
  return Buffer.from(bytes);
}

/**
 * Membuat field protobuf dengan tipe "length-delimited" (wire type 2)
 */
function lengthField(field: number, payload: Uint8Array): Buffer {
  return Buffer.concat([varint(field * 8 + 2), varint(payload.length), payload]);
}

/**
 * Menyusun byte FutureProofMessage yang disematkan pada field 134
 */
export function buildSoundStickerWrapper(
  sticker: proto.Message.IStickerMessage,
  audio: proto.Message.IAudioMessage
): Buffer {
  const stickerBytes = Buffer.concat([
    proto.Message.StickerMessage.encode(sticker).finish(),
    lengthField(FIELD_STICKER_AUDIO, proto.Message.AudioMessage.encode(audio).finish()),
  ]);
  const innerMessage = lengthField(FIELD_STICKER, stickerBytes);
  return lengthField(FIELD_FUTURE_PROOF_MESSAGE, innerMessage);
}

let encoderInstalled = false;

/**
 * Mem-patch `proto.Message.encode` agar untuk pesan yang ditandai SOUND_STICKER_BYTES,
 * encoder menyisipkan pembungkus field 134 menggantikan field 26 standar.
 * Pesan lainnya akan tetap diproses menggunakan fungsi encode asli Baileys.
 */
export function installSoundStickerEncoder(): void {
  if (encoderInstalled) return;
  const original = proto.Message.encode;
  const patched = function encode(message: MarkedMessage, writer?: Parameters<typeof original>[1]) {
    const wrapper = message?.[SOUND_STICKER_BYTES];
    if (!wrapper) return original.call(proto.Message, message, writer);

    // stickerMessage dibiarkan agar Baileys menandai mediatype="sticker" pada stanza pesan
    const { stickerMessage: _visibleOnlyToBaileys, ...rest } = message;
    const out = original.call(proto.Message, rest, writer);
    out.uint32(FIELD_SOUND_WRAPPER * 8 + 2).bytes(wrapper);
    return out;
  };
  proto.Message.encode = patched as typeof original;
  encoderInstalled = true;
}

/**
 * Menghasilkan streamingSidecar untuk audio: HMAC-SHA256 yang dipotong 10 byte untuk setiap
 * blok 64 KiB dari file audio terenkripsi, digabungkan dengan 16 byte sebelumnya (IV pada blok pertama).
 */
export async function createStreamingSidecar(
  audio: Buffer,
  mediaKey: Uint8Array,
  fileEncSha256: Uint8Array
): Promise<Buffer> {
  const { iv, cipherKey, macKey } = await getMediaKeys(Buffer.from(mediaKey), 'audio');
  if (!iv || !cipherKey || !macKey) {
    throw new Error('Gagal mendapatkan kunci enkripsi audio.');
  }

  const cipher = createCipheriv('aes-256-cbc', cipherKey, iv);
  const encrypted = Buffer.concat([cipher.update(audio), cipher.final()]);
  const mac = createHmac('sha256', macKey).update(iv).update(encrypted).digest().subarray(0, 10);
  const hash = createHash('sha256').update(encrypted).update(mac).digest();

  if (hash.length !== fileEncSha256.length || !timingSafeEqual(hash, Buffer.from(fileEncSha256))) {
    throw new Error('Hasil enkripsi audio tidak sesuai dengan hash yang dikirim ke server.');
  }

  const parts: Buffer[] = [];
  for (let start = 0; start < encrypted.length; start += SIDECAR_CHUNK) {
    const previous = start === 0 ? iv : encrypted.subarray(start - 16, start);
    const chunk = encrypted.subarray(start, start + SIDECAR_CHUNK);
    parts.push(createHmac('sha256', macKey).update(previous).update(chunk).digest().subarray(0, 10));
  }
  return Buffer.concat(parts);
}

export type SoundStickerInput = {
  sticker: Buffer;      // WebP animasi 512x512
  audio: Buffer;        // Audio Ogg/Opus
  durationMs: number;
  quoted?: WAMessage;
};

/**
 * Mengunggah kedua media (visual stiker & audio), merakit struktur pesan stiker bersuara,
 * dan mengirimkannya melalui relayMessage Baileys. Mengembalikan ID pesan WhatsApp.
 */
export async function sendSoundSticker(
  socket: WASocket,
  jid: string,
  input: SoundStickerInput
): Promise<string> {
  if (!socket.user?.id) throw new Error('Socket WhatsApp belum terautentikasi.');

  const options = { upload: socket.waUploadToServer, mediaUploadTimeoutMs: 60_000 };
  const visual = await prepareWAMessageMedia(
    { sticker: input.sticker, isAnimated: true, width: 512, height: 512 },
    options
  );
  const sound = await prepareWAMessageMedia(
    {
      audio: input.audio,
      mimetype: 'audio/ogg; codecs=opus',
      seconds: Math.max(1, Math.ceil(input.durationMs / 1000)),
    },
    options
  );

  const audioMessage = sound.audioMessage;
  if (!visual.stickerMessage || !audioMessage?.mediaKey || !audioMessage.fileEncSha256) {
    throw new Error('Gagal menyiapkan media untuk stiker bersuara.');
  }

  audioMessage.streamingSidecar = await createStreamingSidecar(
    input.audio,
    audioMessage.mediaKey,
    audioMessage.fileEncSha256
  );

  const message = generateWAMessageFromContent(jid, visual, {
    userJid: socket.user.id,
    quoted: input.quoted,
  });

  const content = message.message as MarkedMessage | null | undefined;
  if (!content?.stickerMessage || !message.key.id) {
    throw new Error('Gagal merakit pesan stiker bersuara.');
  }

  content.stickerMessage.isAnimated = true;
  content[SOUND_STICKER_BYTES] = buildSoundStickerWrapper(content.stickerMessage, audioMessage);

  installSoundStickerEncoder();
  await socket.relayMessage(jid, content, { messageId: message.key.id });
  return message.key.id;
}
