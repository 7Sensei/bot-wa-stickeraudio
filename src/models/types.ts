export type JobStatus = 'idle' | 'processing' | 'done' | 'error';

export interface StickerOptions {
  packName?: string;
  authorName?: string;
  categories?: string[];
}

export interface MediaJob {
  id: string;
  chatId: string;
  senderId: string;
  messageId: string;
  type: 'sticker' | 'audio' | 'vn';
  status: JobStatus;
  inputBuffer?: Buffer;
  inputMime?: string;
  result?: Buffer;
  error?: string;
  createdAt: number;
}

export interface FeatureState {
  status: JobStatus;
  currentJobId: string | null;
  result: Buffer | null;
  error: string | null;
}
