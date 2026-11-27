import { createStore } from 'zustand/vanilla';
import type { JobStatus } from '../models/types.js';

export interface AudioChatState {
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
  chats: Record<string, AudioChatState>;
  lastUpdatedChatId: string | null;
  queue: string[];

  // Actions
  setProcessing: (chatId: string, senderId: string, messageId: string, isVoiceNote: boolean) => void;
  setDone: (chatId: string, result: Buffer) => void;
  setError: (chatId: string, error: string) => void;
  reset: (chatId: string) => void;
  getChatState: (chatId: string) => AudioChatState | undefined;
}

export const audioStore = createStore<AudioStoreState>((set, get) => ({
  chats: {},
  lastUpdatedChatId: null,
  queue: [],

  setProcessing: (chatId: string, senderId: string, messageId: string, isVoiceNote: boolean) => {
    set((state) => ({
      chats: {
        ...state.chats,
        [chatId]: {
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
      lastUpdatedChatId: chatId,
      queue: state.queue.includes(chatId) ? state.queue : [...state.queue, chatId],
    }));
  },

  setDone: (chatId: string, result: Buffer) => {
    set((state) => {
      const existing = state.chats[chatId];
      if (!existing) return state;

      return {
        chats: {
          ...state.chats,
          [chatId]: {
            ...existing,
            status: 'done',
            result,
            error: null,
            updatedAt: Date.now(),
          },
        },
        lastUpdatedChatId: chatId,
        queue: state.queue.filter((id) => id !== chatId),
      };
    });
  },

  setError: (chatId: string, error: string) => {
    set((state) => {
      const existing = state.chats[chatId];
      if (!existing) return state;

      return {
        chats: {
          ...state.chats,
          [chatId]: {
            ...existing,
            status: 'error',
            result: null,
            error,
            updatedAt: Date.now(),
          },
        },
        lastUpdatedChatId: chatId,
        queue: state.queue.filter((id) => id !== chatId),
      };
    });
  },

  reset: (chatId: string) => {
    set((state) => {
      const newChats = { ...state.chats };
      delete newChats[chatId];
      return {
        chats: newChats,
        lastUpdatedChatId: chatId,
        queue: state.queue.filter((id) => id !== chatId),
      };
    });
  },

  getChatState: (chatId: string) => {
    return get().chats[chatId];
  },
}));
