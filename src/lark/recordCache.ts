/**
 * 主表记录内存缓存
 *
 * 设计目标：把"每次查询都拉飞书全表"这条慢路径变成"读内存"。
 *
 * 三层一致性保证（强 → 弱）：
 *   1. 写后失效（最强）：我们自己调用 createRecord / updateRecord 成功后立即 upsert，
 *      缓存里始终是最新值。
 *   2. 飞书事件订阅（次强）：外部在飞书 App / 网页端改了表，飞书会通过长连接推
 *      drive.file.bitable_record_changed_v1 事件给我们 → scheduleRefresh 防抖刷新。
 *   3. 定时全量刷新（兜底）：每 5 分钟 force refresh 一次，防止事件丢失导致缓存长期偏。
 *
 * 失败策略：refresh 抛错不污染旧缓存；缓存若从未加载过则懒加载时往上抛。
 */

import type { BitableRecord } from '../types.js';

const DEFAULT_REFRESH_INTERVAL_MS = 5 * 60 * 1000; // 5 分钟
const DEFAULT_DEBOUNCE_MS = 1500; // 事件触发刷新的防抖

export interface RecordCacheOptions {
  /** 后台定时刷新间隔，默认 5 分钟。设为 0 关闭定时刷新（测试时常用） */
  refreshIntervalMs?: number;
  /** scheduleRefresh 的防抖窗口，默认 1.5s */
  debounceMs?: number;
}

export class RecordCache {
  private records = new Map<string, BitableRecord>();
  private loaded = false;
  private inflightLoad: Promise<void> | null = null;
  private lastLoadedAt = 0;
  private periodicTimer: ReturnType<typeof setInterval> | null = null;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly refreshIntervalMs: number;
  private readonly debounceMs: number;

  /**
   * @param loader 真正从飞书拉全表的函数（必须绕开本缓存，否则递归）
   * @param options 见 RecordCacheOptions
   */
  constructor(
    private loader: () => Promise<BitableRecord[]>,
    options: RecordCacheOptions = {},
  ) {
    this.refreshIntervalMs = options.refreshIntervalMs ?? DEFAULT_REFRESH_INTERVAL_MS;
    this.debounceMs = options.debounceMs ?? DEFAULT_DEBOUNCE_MS;
  }

  /**
   * 启动时的预热。**只在 ws.ts 启动成功后调用一次**。
   * - 立即 force refresh 一次
   * - 启动定时刷新（如果配置了 refreshIntervalMs > 0）
   *
   * 失败不抛，只打 log。运行时第一次查询会自己懒加载兜底。
   */
  async prewarm(): Promise<void> {
    try {
      await this.refresh();
    } catch (err) {
      console.error('[cache] prewarm failed (将在首次查询时懒加载):', (err as Error).message);
    }
    this.startPeriodicTimer();
  }

  /**
   * 强制从 loader 拉全表，覆盖整个 Map。
   * 并发调用时合并为同一个 inflight Promise（避免重复请求飞书）。
   */
  async refresh(): Promise<void> {
    if (this.inflightLoad) {
      return this.inflightLoad;
    }
    this.inflightLoad = (async () => {
      try {
        const fresh = await this.loader();
        const next = new Map<string, BitableRecord>();
        for (const r of fresh) {
          next.set(r.record_id, r);
        }
        // 只在 loader 成功返回后才覆盖，避免半成品污染缓存
        this.records = next;
        this.loaded = true;
        this.lastLoadedAt = Date.now();
        console.log(`[cache] refreshed: ${fresh.length} records @ ${new Date(this.lastLoadedAt).toISOString()}`);
      } finally {
        this.inflightLoad = null;
      }
    })();
    return this.inflightLoad;
  }

  /**
   * 防抖触发一次 refresh。
   * 用于外部事件（飞书 bitable_record_changed）—— 多条记录连续变更时只触发一次拉取。
   */
  scheduleRefresh(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      this.refresh().catch((err) => {
        console.error('[cache] scheduled refresh failed:', (err as Error).message);
      });
    }, this.debounceMs);
    if (typeof this.debounceTimer.unref === 'function') {
      this.debounceTimer.unref();
    }
  }

  /** 取所有记录。未加载时会同步等加载完成。 */
  async getAll(): Promise<BitableRecord[]> {
    if (!this.loaded) {
      await this.refresh();
    }
    return Array.from(this.records.values());
  }

  /**
   * 把一条记录写进缓存。createRecord / updateRecord 成功后调用。
   * 用飞书返回的最新 record 直接覆盖，无需再发请求。
   */
  upsert(record: BitableRecord): void {
    if (!record?.record_id) return;
    this.records.set(record.record_id, record);
  }

  /** 删除一条。删除接口走完后调用（目前 BaseService 还没 delete，但留口） */
  delete(recordId: string): void {
    this.records.delete(recordId);
  }

  /** 用于测试或诊断 */
  size(): number {
    return this.records.size;
  }

  /** 用于测试或诊断 */
  isLoaded(): boolean {
    return this.loaded;
  }

  /** 关闭定时器（测试 / 优雅退出用） */
  dispose(): void {
    if (this.periodicTimer) {
      clearInterval(this.periodicTimer);
      this.periodicTimer = null;
    }
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
  }

  private startPeriodicTimer(): void {
    if (this.periodicTimer || this.refreshIntervalMs <= 0) return;
    this.periodicTimer = setInterval(() => {
      this.refresh().catch((err) => {
        console.error('[cache] periodic refresh failed:', (err as Error).message);
      });
    }, this.refreshIntervalMs);
    if (typeof this.periodicTimer.unref === 'function') {
      this.periodicTimer.unref();
    }
  }
}
