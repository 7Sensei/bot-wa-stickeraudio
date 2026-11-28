import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
} from '@whiskeysockets/baileys';
import readline from 'readline';
import pino from 'pino';
import { config } from './config/index.js';
import { logger } from './utils/logger.js';
import { ensureTempDir, cleanupTempDir } from './utils/temp-file.js';
import { ensureFfmpegInstallation } from './utils/ffmpeg-check.js';
import { extractMessageText, extractMediaInfo, type ParsedCommand } from './utils/message-extractor.js';
import { commandRouter } from './viewmodels/router.js';
import { whatsAppView } from './views/whatsapp.view.js';

/**
 * Fungsi pembantu untuk meminta input nomor telepon jika belum diset di .env
 */
async function promptPhoneNumber(): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question('Masukkan nomor WhatsApp bot (contoh: 6281234567890): ', (answer) => {
      rl.close();
      resolve(answer.replace(/[^0-9]/g, ''));
    });
  });
}

/**
 * Inisialisasi dan koneksi bot WhatsApp menggunakan Baileys
 */
async function startBot(): Promise<void> {
  logger.info('Memulai bot WhatsApp...');
  // Periksa dependensi ffmpeg sebelum membuat koneksi socket
  await ensureFfmpegInstallation();
  await ensureTempDir();
  await cleanupTempDir();

  // 1. Muat sesi otentikasi multi-file dari folder auth/
  const { state, saveCreds } = await useMultiFileAuthState(config.authDir);

  // 2. Buat socket WhatsApp Baileys
  const sock = makeWASocket({
    auth: state,
    logger: pino({ level: 'silent' }), // Log internal Baileys dibuat silent agar terminal Termux bersih
    printQRInTerminal: false,          // Gunakan kode pairing, bukan QR code
    browser: ['Ubuntu', 'Chrome', '20.0.04'],
    syncFullHistory: false,            // Hemat RAM HP dengan tidak mendownload riwayat penuh
    generateHighQualityLinkPreview: false,
  });

  // 3. Simpan kredensial setiap kali diperbarui
  sock.ev.on('creds.update', saveCreds);

  // 4. Hubungkan socket ke WhatsApp View
  whatsAppView.bindSocket(sock);

  // 5. Alur Login Pairing Code (jika belum terdaftar)
  if (!sock.authState.creds.registered) {
    let phoneNumber = config.botPhoneNumber;

    if (!phoneNumber) {
      logger.warn('Nomor bot belum diisi di BOT_PHONE_NUMBER pada file .env');
      phoneNumber = await promptPhoneNumber();
    }

    if (!phoneNumber) {
      logger.error('Nomor WhatsApp wajib diisi untuk pairing code! Bot berhenti.');
      process.exit(1);
    }

    // Beri jeda 3 detik agar koneksi socket awal stabil sebelum meminta kode
    setTimeout(async () => {
      try {
        const code = await sock.requestPairingCode(phoneNumber);
        const formattedCode = code?.match(/.{1,4}/g)?.join('-') || code;

        console.log('\n======================================================');
        console.log('🔑 KODE PAIRING WHATSAPP ANDA:');
        console.log(`\n       >>>  ${formattedCode}  <<<\n`);
        console.log('Langkah Menautkan:');
        console.log('1. Buka aplikasi WhatsApp di HP Anda');
        console.log('2. Masuk ke Pengaturan > Perangkat Tertaut > Tautkan Perangkat');
        console.log('3. Ketuk "Tautkan dengan nomor telepon saja" di bagian bawah');
        console.log(`4. Masukkan kode di atas: ${code}`);
        console.log('======================================================\n');
      } catch (error) {
        logger.error({ err: error }, 'Gagal meminta kode pairing dari WhatsApp');
      }
    }, 3000);
  }

  // 6. Penanganan Pembaruan Koneksi & Reconnect Otomatis
  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect } = update;

    if (connection === 'close') {
      const statusCode = (lastDisconnect?.error as any)?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

      logger.warn({ statusCode, shouldReconnect }, 'Koneksi WhatsApp tertutup');

      if (shouldReconnect) {
        logger.info('Menyambung ulang ke WhatsApp dalam 3 detik...');
        setTimeout(() => startBot(), 3000);
      } else {
        logger.error(
          'Perangkat telah Keluar (Logged Out). Hapus isi folder auth/ jika ingin menautkan nomor baru.'
        );
      }
    } else if (connection === 'open') {
      logger.info('======================================================');
      logger.info('✅ BOT WHATSAPP BERHASIL TERHUBUNG!');
      logger.info(`Prefix perintah : ${config.prefix}`);
      logger.info(`Ketik ${config.prefix}menu di WhatsApp untuk melihat daftar fitur.`);
      logger.info('======================================================');
    }
  });

  // 7. Penanganan Pesan Masuk (Forward ke router viewmodels)
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;

    for (const msg of messages) {
      // Abaikan pesan kosong atau pesan yang dikirim oleh bot sendiri
      if (!msg.message || msg.key.fromMe) continue;

      try {
        const rawText = extractMessageText(msg.message);

        // Hanya proses pesan yang diawali prefix bot
        if (!rawText.startsWith(config.prefix)) {
          continue;
        }

        const chatId = msg.key.remoteJid || '';
        const senderId = msg.key.participant || msg.key.remoteJid || '';
        const messageId = msg.key.id || '';

        // Deteksi perintah (tanpa prefix) untuk keperluan filter whitelist
        const rawCommand = rawText.slice(config.prefix.length).trim().split(/\s+/)[0]?.toLowerCase() || '';

        // Filter whitelist chat: jika ALLOWED_CHATS diisi dan chatId tidak ada di daftar,
        // abaikan pesan secara diam-diam — kecuali perintah .id (selalu diizinkan)
        if (config.allowedChats.length > 0 && rawCommand !== 'id' && !config.allowedChats.includes(chatId)) {
          logger.debug({ chatId, rawCommand }, 'Pesan dari chat tidak terotorisasi, diabaikan');
          continue;
        }

        // Ingat pesan asli di View untuk dijadikan balasan (quoted)
        whatsAppView.rememberMessage(msg);
        const media = extractMediaInfo(msg);

        const context: ParsedCommand = {
          chatId,
          senderId,
          messageId,
          command: '',
          args: [],
          rawText,
          media,
        };

        // Teruskan perintah ke Command Router
        const result = await commandRouter.route(context);

        // Jika perintah adalah menu bantuan, render teks menu lewat View
        if (result.isMenu && result.menuText) {
          await whatsAppView.sendMenu(chatId, result.menuText, messageId);
        }
      } catch (error) {
        logger.error({ err: error, msgId: msg.key.id }, 'Error saat menangani pesan masuk');
      }
    }
  });
}

// Tangani uncaught errors agar bot tidak pernah crash mendadak
process.on('uncaughtException', (err) => {
  logger.error({ err }, 'Uncaught Exception terdeteksi');
});

process.on('unhandledRejection', (reason) => {
  logger.error({ reason }, 'Unhandled Rejection terdeteksi');
});

// Jalankan bot
startBot();
