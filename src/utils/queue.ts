import { logger } from './logger.js';

/**
 * Antrean proses tunggal (Single-concurrency queue)
 * Menjamin hanya ada 1 proses konversi media (ffmpeg) yang berjalan pada satu waktu.
 * Mencegah HP Android/Termux kehabisan RAM akibat proses ffmpeg simultan.
 */
class MediaQueue {
  private queue: (() => Promise<void>)[] = [];
  private isProcessing = false;

  /**
   * Menambahkan tugas ke dalam antrean
   */
  async enqueue<T>(task: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.queue.push(async () => {
        try {
          const result = await task();
          resolve(result);
        } catch (error) {
          reject(error);
        }
      });

      this.processNext();
    });
  }

  /**
   * Mengambil dan menjalankan tugas berikutnya dari antrean
   */
  private async processNext(): Promise<void> {
    if (this.isProcessing || this.queue.length === 0) {
      return;
    }

    this.isProcessing = true;
    const nextTask = this.queue.shift();

    if (nextTask) {
      try {
        await nextTask();
      } catch (error) {
        logger.error({ err: error }, 'Error saat menjalankan tugas dalam antrean');
      } finally {
        this.isProcessing = false;
        // Jalankan tugas berikutnya jika ada
        setImmediate(() => this.processNext());
      }
    } else {
      this.isProcessing = false;
    }
  }

  /**
   * Mengembalikan jumlah tugas yang sedang mengantre
   */
  get pendingCount(): number {
    return this.queue.length;
  }

  /**
   * Status apakah antrean sedang memproses sesuatu
   */
  get running(): boolean {
    return this.isProcessing;
  }
}

// Instance global antrean media untuk seluruh bot
export const mediaQueue = new MediaQueue();
