import { createStore } from 'zustand/vanilla';
import type { JobStatus } from '../models/types.js';

/**
 * State per job audio, dikunci oleh messageId (id pesan perintah).
 * Menyimpan chatId agar View bisa mengirim balasan ke chat yang benar.
 */
export interface AudioJobState {
  status: JobStatus;
  chatId: string;
  senderId: string;
  messageId: string;
  isVoiceNote: boolean;
  result: Buffer | null;
  error: string | null;
  updatedAt: number;
}

export interface AudioStoreState {
  /** Kunci: messageId (id pesan perintah), bukan chatId */
  jobs: Record<string, AudioJobState>;
  lastUpdatedMessageId: string | null;

  // Actions
  setProcessing: (chatId: string, senderId: string, messageId: string, isVoiceNote: boolean) => void;
  setDone: (messageId: string, result: Buffer) => void;
  setError: (messageId: string, error: string) => void;
  reset: (messageId: string) => void;
  getJobState: (messageId: string) => AudioJobState | undefined;
}

export const audioStore = createStore<AudioStoreState>((set, get) => ({
  jobs: {},
  lastUpdatedMessageId: null,

  setProcessing: (chatId: string, senderId: string, messageId: string, isVoiceNote: boolean) => {
    set((state) => ({
      jobs: {
        ...state.jobs,
        [messageId]: {
          status: 'processing',
          chatId,
          senderId,
          messageId,
          isVoiceNote,
          result: null,
          error: null,
          updatedAt: Date.now(),
        },
      },
      lastUpdatedMessageId: messageId,
    }));
  },

  setDone: (messageId: string, result: Buffer) => {
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
