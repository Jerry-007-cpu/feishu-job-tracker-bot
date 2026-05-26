import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RecordCache } from '../src/lark/recordCache.js';
import type { BitableRecord } from '../src/types.js';

function makeRecord(id: string, fields: Record<string, unknown> = {}): BitableRecord {
  return { record_id: id, fields };
}

describe('RecordCache', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('懒加载：第一次 getAll 触发 loader', async () => {
    const loader = vi.fn().mockResolvedValue([makeRecord('r1'), makeRecord('r2')]);
    const cache = new RecordCache(loader, { refreshIntervalMs: 0 });

    expect(loader).not.toHaveBeenCalled();
    const records = await cache.getAll();
    expect(loader).toHaveBeenCalledTimes(1);
    expect(records).toHaveLength(2);
    expect(cache.size()).toBe(2);
    expect(cache.isLoaded()).toBe(true);

    // 第二次直接读缓存，不再调 loader
    await cache.getAll();
    expect(loader).toHaveBeenCalledTimes(1);

    cache.dispose();
  });

  it('refresh 会覆盖整个 Map', async () => {
    const loader = vi
      .fn()
      .mockResolvedValueOnce([makeRecord('r1'), makeRecord('r2')])
      .mockResolvedValueOnce([makeRecord('r2', { 公司: '字节' }), makeRecord('r3')]);
    const cache = new RecordCache(loader, { refreshIntervalMs: 0 });

    await cache.getAll();
    expect(cache.size()).toBe(2);

    await cache.refresh();
    const after = await cache.getAll();
    expect(after).toHaveLength(2);
    expect(after.find((r) => r.record_id === 'r1')).toBeUndefined();
    expect(after.find((r) => r.record_id === 'r3')).toBeDefined();
    expect(after.find((r) => r.record_id === 'r2')?.fields.公司).toBe('字节');

    cache.dispose();
  });

  it('upsert 写入后能立刻读到', async () => {
    const loader = vi.fn().mockResolvedValue([makeRecord('r1')]);
    const cache = new RecordCache(loader, { refreshIntervalMs: 0 });
    await cache.getAll();

    cache.upsert(makeRecord('r2', { 公司: '网易' }));
    const all = await cache.getAll();
    expect(all).toHaveLength(2);
    expect(all.find((r) => r.record_id === 'r2')?.fields.公司).toBe('网易');

    // upsert 同 id 是覆盖
    cache.upsert(makeRecord('r2', { 公司: '腾讯' }));
    const all2 = await cache.getAll();
    expect(all2).toHaveLength(2);
    expect(all2.find((r) => r.record_id === 'r2')?.fields.公司).toBe('腾讯');

    cache.dispose();
  });

  it('delete 能移除指定记录', async () => {
    const loader = vi.fn().mockResolvedValue([makeRecord('r1'), makeRecord('r2')]);
    const cache = new RecordCache(loader, { refreshIntervalMs: 0 });
    await cache.getAll();

    cache.delete('r1');
    const all = await cache.getAll();
    expect(all).toHaveLength(1);
    expect(all[0].record_id).toBe('r2');

    cache.dispose();
  });

  it('并发 refresh 合并为同一个 inflight Promise', async () => {
    let resolveLoader!: (records: BitableRecord[]) => void;
    const loader = vi.fn().mockReturnValue(
      new Promise<BitableRecord[]>((resolve) => {
        resolveLoader = resolve;
      }),
    );
    const cache = new RecordCache(loader, { refreshIntervalMs: 0 });

    // 并发 5 个 refresh
    const p1 = cache.refresh();
    const p2 = cache.refresh();
    const p3 = cache.refresh();

    expect(loader).toHaveBeenCalledTimes(1);

    resolveLoader([makeRecord('r1')]);
    await Promise.all([p1, p2, p3]);

    expect(cache.size()).toBe(1);
    expect(loader).toHaveBeenCalledTimes(1);

    cache.dispose();
  });

  it('scheduleRefresh 多次调用在 debounce 窗口内只触发一次', async () => {
    const loader = vi.fn().mockResolvedValue([makeRecord('r1')]);
    const cache = new RecordCache(loader, { refreshIntervalMs: 0, debounceMs: 500 });

    cache.scheduleRefresh();
    cache.scheduleRefresh();
    cache.scheduleRefresh();
    expect(loader).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(500);
    expect(loader).toHaveBeenCalledTimes(1);

    cache.dispose();
  });

  it('refresh 失败不污染旧缓存', async () => {
    const loader = vi
      .fn()
      .mockResolvedValueOnce([makeRecord('r1'), makeRecord('r2')])
      .mockRejectedValueOnce(new Error('飞书挂了'));
    const cache = new RecordCache(loader, { refreshIntervalMs: 0 });

    await cache.getAll();
    expect(cache.size()).toBe(2);

    await expect(cache.refresh()).rejects.toThrow('飞书挂了');
    // 旧数据仍在
    expect(cache.size()).toBe(2);
    const all = await cache.getAll();
    expect(all).toHaveLength(2);

    cache.dispose();
  });

  it('定时刷新到点会触发 loader', async () => {
    let callCount = 0;
    const loader = vi.fn().mockImplementation(async () => {
      callCount++;
      return [makeRecord(`r${callCount}`)];
    });
    const cache = new RecordCache(loader, { refreshIntervalMs: 1000 });

    await cache.prewarm(); // call 1
    expect(loader).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1000); // call 2
    expect(loader).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(1000); // call 3
    expect(loader).toHaveBeenCalledTimes(3);

    cache.dispose();
  });

  it('prewarm loader 失败不抛，仍可懒加载兜底', async () => {
    const loader = vi
      .fn()
      .mockRejectedValueOnce(new Error('启动时网络抽风'))
      .mockResolvedValueOnce([makeRecord('r1')]);
    const cache = new RecordCache(loader, { refreshIntervalMs: 0 });

    await expect(cache.prewarm()).resolves.toBeUndefined();
    expect(cache.isLoaded()).toBe(false);

    // 后续 getAll 触发新的 refresh，这次成功
    const all = await cache.getAll();
    expect(all).toHaveLength(1);
    expect(cache.isLoaded()).toBe(true);

    cache.dispose();
  });

  it('upsert 忽略缺 record_id 的对象', async () => {
    const loader = vi.fn().mockResolvedValue([]);
    const cache = new RecordCache(loader, { refreshIntervalMs: 0 });
    await cache.getAll();

    cache.upsert({ record_id: '', fields: {} });
    cache.upsert(undefined as unknown as BitableRecord);
    cache.upsert(null as unknown as BitableRecord);
    expect(cache.size()).toBe(0);

    cache.dispose();
  });
});
