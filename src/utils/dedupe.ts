/**
 * 事件去重：基于 event_id 的 FIFO 缓存
 *
 * 飞书事件回调有重试机制，同一 event_id 可能短时间内重复送达。
 * 用一个固定容量的 FIFO 队列记录已处理的事件，超出容量时淘汰最旧的。
 *
 * 第二阶段如果上 serverless 多实例，需要换成 Redis 或 KV 共享存储。
 */

const DEFAULT_CAPACITY = 1000;

export class EventDedupe {
  private seen = new Set<string>();

  constructor(private readonly capacity: number = DEFAULT_CAPACITY) {}

  /**
   * 检查并标记。
   * @returns true 表示首次出现（应处理）；false 表示已处理过（应跳过）。
   */
  checkAndMark(eventId: string): boolean {
    if (this.seen.has(eventId)) return false;

    this.seen.add(eventId);

    // 超出容量时按插入顺序淘汰最旧
    // Set 在 JS 里保持插入顺序，删除一个最早进入的即可
    if (this.seen.size > this.capacity) {
      const oldest = this.seen.values().next().value;
      if (oldest !== undefined) {
        this.seen.delete(oldest);
      }
    }

    return true;
  }

  size(): number {
    return this.seen.size;
  }

  clear(): void {
    this.seen.clear();
  }
}

/** 全局单例 */
export const eventDedupe = new EventDedupe();
