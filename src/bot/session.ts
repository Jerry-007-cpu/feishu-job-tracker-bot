import type { SessionData } from '../types.js';

interface SessionEntry {
  data: SessionData;
  createdAt: number;
}

const SESSION_TTL = 10 * 60 * 1000; // 10 分钟

/**
 * 内存 Session 存储
 * 每个用户仅保留一个待确认操作
 */
class SessionStore {
  private store = new Map<string, SessionEntry>();

  private cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.store) {
      if (now - entry.createdAt > SESSION_TTL) {
        this.store.delete(key);
      }
    }
  }

  get(userId: string): SessionData | null {
    this.cleanup();
    const entry = this.store.get(userId);
    if (!entry) return null;
    if (Date.now() - entry.createdAt > SESSION_TTL) {
      this.store.delete(userId);
      return null;
    }
    return entry.data;
  }

  set(userId: string, data: SessionData): void {
    this.cleanup();
    this.store.set(userId, { data, createdAt: Date.now() });
  }

  delete(userId: string): void {
    this.store.delete(userId);
  }
}

export const sessionStore = new SessionStore();
