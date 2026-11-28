import { createStore } from 'zustand/vanilla';
import type { JobStatus } from '../models/types.js';

/**
 * State per job stiker, dikunci oleh messageId (id pesan perintah).
 * Menyimpan chatId agar View bisa mengirim balasan ke chat yang benar.
 */
export interface StickerJobState {
  status: JobStatus;
  chatId: string;
  senderId: string;
  messageId: string;
  result: Buffer | null;
  audio: Buffer | null;
  durationMs: number;
  notice: string | null;
  error: string | null;
  updatedAt: number;
}

export interface StickerStoreState {
  /** Kunci: messageId (id pesan perintah), bukan chatId */
  jobs: Record<string, StickerJobState>;
  lastUpdatedMessageId: string | null;

  // Actions
  setProcessing: (chatId: string, senderId: string, messageId: string) => void;
  setDone: (
    messageId: string,
    result: Buffer,
    extra?: { audio?: Buffer | null; durationMs?: number; notice?: string | null }
  ) => void;
  setError: (messageId: string, error: string) => void;
  reset: (messageId: string) => void;
  getJobState: (messageId: string) => StickerJobState | undefined;
}

export const stickerStore = createStore<StickerStoreState>((set, get) => ({
  jobs: {},
  lastUpdatedMessageId: null,

  setProcessing: (chatId: string, senderId: string, messageId: string) => {
    set((state) => ({
      jobs: {
        ...state.jobs,
        [messageId]: {
          status: 'processing',
          chatId,
          senderId,
          messageId,
          result: null,
          audio: null,
          durationMs: 0,
          notice: null,
          error: null,
          updatedAt: Date.now(),
        },
      },
      lastUpdatedMessageId: messageId,
    }));
  },

  setDone: (
    messageId: string,
    result: Buffer,
    extra?: { audio?: Buffer | null; durationMs?: number; notice?: string | null }
  ) => {
    set((state) => {
      const existing = state.jobs[messageId];
      if (!existing) return state;

      return {
        jobs: {
          ...state.jobs,
          [messageId]: {
            ...existing,
            status: 'done',
            result,
            audio: extra?.audio ?? null,
            durationMs: extra?.durationMs ?? 0,
            notice: extra?.notice ?? null,
            error: null,
            updatedAt: Date.now(),
          },
        },
        lastUpdatedMessageId: messageId,
      };
    });
  },

  setError: (messageId: string, error: string) => {
    set((state) => {
      const existing = state.jobs[messageId];
      if (!existing) return state;

      return {
        jobs: {
          ...state.jobs,
          [messageId]: {
            ...existing,
            status: 'error',
            result: null,
            audio: null,
            durationMs: 0,
            notice: null,
            error,
            updatedAt: Date.now(),
          },
        },
        lastUpdatedMessageId: messageId,
      };
    });
  },

  reset: (messageId: string) => {
    set((state) => {
      const newJobs = { ...state.jobs };
      delete newJobs[messageId];
      return {
        jobs: newJobs,
        lastUpdatedMessageId: messageId,
      };
    });
  },

  getJobState: (messageId: string) => {
    return get().jobs[messageId];
  },
}));
