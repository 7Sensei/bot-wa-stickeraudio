import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import crypto from 'crypto';
import { config } from '../config/index.js';
import { logger } from './logger.js';

/**
 * Memastikan direktori temp ada saat aplikasi mulai
 */
export async function ensureTempDir(): Promise<void> {
  if (!fsSync.existsSync(config.tempDir)) {
    await fs.mkdir(config.tempDir, { recursive: true });
  }
}

/**
 * Menghasilkan path acak untuk file sementara di folder temp
 */
export function createTempFilePath(extension: string): string {
  const ext = extension.startsWith('.') ? extension : `.${extension}`;
  const randomName = `${Date.now()}_${crypto.randomBytes(4).toString('hex')}${ext}`;
  return path.join(config.tempDir, randomName);
}

/**
 * Menulis Buffer ke file sementara dan mengembalikan path filenya
 */
export async function writeTempFile(buffer: Buffer, extension: string): Promise<string> {
  await ensureTempDir();
  const filePath = createTempFilePath(extension);
  await fs.writeFile(filePath, buffer);
  return filePath;
}

/**
 * Menghapus file sementara dengan aman (tidak melempar error jika file tidak ada)
 */
export async function deleteTempFile(filePath: string | null | undefined): Promise<void> {
  if (!filePath) return;
  try {
    if (fsSync.existsSync(filePath)) {
      await fs.unlink(filePath);
    }
  } catch (err) {
    logger.warn({ filePath, err }, 'Gagal menghapus file sementara');
  }
}

/**
 * Membersihkan file lama di folder temp jika ada sisa file dari sesi sebelumnya
 */
export async function cleanupTempDir(): Promise<void> {
  try {
    await ensureTempDir();
    const files = await fs.readdir(config.tempDir);
    for (const file of files) {
      const fullPath = path.join(config.tempDir, file);
      try {
        const stats = await fs.stat(fullPath);
        // Hapus file yang lebih tua dari 1 jam
        if (Date.now() - stats.mtimeMs > 3600000) {
          await fs.unlink(fullPath);
        }
      } catch {
        // Abaikan jika gagal
      }
    }
  } catch (err) {
    logger.warn({ err }, 'Gagal membersihkan direktori temp');
  }
}
