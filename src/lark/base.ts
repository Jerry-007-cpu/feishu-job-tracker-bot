import { larkClient } from './client.js';
import { RecordCache, type RecordCacheOptions } from './recordCache.js';
import { config } from '../config.js';
import type { BitableRecord } from '../types.js';

interface BitableTable {
  id: string;
  name: string;
}

interface RawBitableTable {
  id?: string;
  table_id?: string;
  name?: string;
}

function extractTokenFromUrl(input: string): { kind: 'base' | 'wiki'; token: string } | null {
  try {
    const url = new URL(input);
    const parts = url.pathname.split('/').filter(Boolean);
    const baseIndex = parts.findIndex((part) => part === 'base' || part === 'bitable');
    if (baseIndex >= 0 && parts[baseIndex + 1]) {
      return { kind: 'base', token: parts[baseIndex + 1] };
    }

    const wikiIndex = parts.findIndex((part) => part === 'wiki');
    if (wikiIndex >= 0 && parts[wikiIndex + 1]) {
      return { kind: 'wiki', token: parts[wikiIndex + 1] };
    }
  } catch {
    return null;
  }

  return null;
}

function looksLikeWikiToken(input: string): boolean {
  return input.startsWith('wiki/') || input.startsWith('wik');
}

/**
 * 多维表格操作封装
 *
 * 主表数据带内存缓存（RecordCache），所有"全表"读取路径走缓存：
 *   - listAllRecords：缓存命中即返回
 *   - 写操作（create/update）成功后 upsert 缓存里那条
 *   - 外部事件（飞书 bitable_record_changed）通过 scheduleMainTableRefresh 触发防抖刷新
 *
 * 启动时调用 prewarmMainTable() 预热（参见 ws.ts）。
 */
export class BaseService {
  private resolvedBaseToken: Promise<string> | null = null;
  private resolvedMainTableId: Promise<string> | null = null;
  private mainTableCache: RecordCache;

  constructor(
    private baseTokenInput: string,
    cacheOptions: RecordCacheOptions = {},
  ) {
    // 缓存的 loader 必须用 fetchAllRecordsFresh，绕开缓存自身，避免递归
    this.mainTableCache = new RecordCache(
      () => this.fetchAllRecordsFresh(''),
      cacheOptions,
    );
  }

  /** 启动时调用：预热主表缓存 + 启动定时刷新兜底 */
  async prewarmMainTable(): Promise<void> {
    await this.mainTableCache.prewarm();
  }

  /**
   * 外部事件触发缓存刷新（防抖）。
   * 在 ws.ts 的 bitable_record_changed 事件 handler 里调用。
   */
  scheduleMainTableRefresh(): void {
    this.mainTableCache.scheduleRefresh();
  }

  /** 诊断用：当前缓存大小 */
  getMainTableCacheSize(): number {
    return this.mainTableCache.size();
  }

  private async getBaseToken(): Promise<string> {
    if (!this.resolvedBaseToken) {
      this.resolvedBaseToken = this.resolveBaseToken();
    }
    return this.resolvedBaseToken;
  }

  private async resolveBaseToken(): Promise<string> {
    const input = this.baseTokenInput.trim();
    const fromUrl = extractTokenFromUrl(input);
    if (fromUrl?.kind === 'base') {
      return fromUrl.token;
    }

    if (fromUrl?.kind !== 'wiki' && !looksLikeWikiToken(input)) {
      return input;
    }

    const wikiToken = fromUrl?.kind === 'wiki'
      ? fromUrl.token
      : input.replace(/^wiki\//, '');

    const res = await larkClient.get(
      `/open-apis/wiki/v2/spaces/get_node?token=${encodeURIComponent(wikiToken)}`,
    );
    const node = (res.data as { node?: { obj_type?: string; obj_token?: string } }).node;

    if (!node?.obj_token) {
      throw new Error('无法从 Wiki 链接解析多维表格 token，请检查 BASE_TOKEN 是否填对');
    }
    if (node.obj_type !== 'bitable') {
      throw new Error(`Wiki 链接指向的是 ${node.obj_type ?? '未知类型'}，不是多维表格`);
    }

    return node.obj_token;
  }

  private async listTables(): Promise<BitableTable[]> {
    const baseToken = await this.getBaseToken();
    const tables: BitableTable[] = [];
    let pageToken: string | null = null;

    do {
      const query = `/open-apis/bitable/v1/apps/${baseToken}/tables?page_size=100${pageToken ? `&page_token=${pageToken}` : ''}`;
      const res = await larkClient.get(query);
      const data = res.data as {
        items?: RawBitableTable[];
        tables?: RawBitableTable[];
        has_more?: boolean;
        page_token?: string;
      };

      for (const table of data.items ?? data.tables ?? []) {
        const id = table.table_id ?? table.id;
        if (id && table.name) {
          tables.push({ id, name: table.name });
        }
      }
      pageToken = data.has_more ? (data.page_token ?? null) : null;
    } while (pageToken);

    return tables;
  }

  private async resolveTableId(tableId: string): Promise<string> {
    if (tableId) {
      return tableId;
    }

    if (!this.resolvedMainTableId) {
      this.resolvedMainTableId = this.findMainTableId();
    }

    return this.resolvedMainTableId;
  }

  private async findMainTableId(): Promise<string> {
    const tables = await this.listTables();
    const mainTable = tables.find((table) => table.name.includes('主表'))
      ?? tables.find((table) => table.name.includes('投递记录'))
      ?? tables[0];

    if (!mainTable) {
      throw new Error('未找到多维表格中的数据表，请检查 BASE_TOKEN 和机器人文档权限');
    }

    return mainTable.id;
  }

  /** 创建单条记录。成功后同步写入缓存。 */
  async createRecord(tableId: string, fields: Record<string, unknown>): Promise<BitableRecord> {
    const baseToken = await this.getBaseToken();
    const resolvedTableId = await this.resolveTableId(tableId);
    const res = await larkClient.post(
      `/open-apis/bitable/v1/apps/${baseToken}/tables/${resolvedTableId}/records`,
      { fields },
    );
    const record = (res.data as { record: BitableRecord }).record;
    // 写后失效：用飞书返回的 record 直接 upsert，不需要重拉全表
    this.mainTableCache.upsert(record);
    return record;
  }

  /** 更新单条记录（全量覆盖 fields）。成功后同步写入缓存。 */
  async updateRecord(
    tableId: string,
    recordId: string,
    fields: Record<string, unknown>,
  ): Promise<BitableRecord> {
    const baseToken = await this.getBaseToken();
    const resolvedTableId = await this.resolveTableId(tableId);
    const res = await larkClient.put(
      `/open-apis/bitable/v1/apps/${baseToken}/tables/${resolvedTableId}/records/${recordId}`,
      { fields },
    );
    const record = (res.data as { record: BitableRecord }).record;
    this.mainTableCache.upsert(record);
    return record;
  }

  /**
   * 列出所有记录。
   *
   * 默认走主表缓存（命中即返回）。如果将来需要读非主表的全表数据，
   * 调用 fetchAllRecordsFresh(tableId) 走原始 HTTP 路径。
   *
   * 注意：tableId 参数当前是为了向后兼容保留；所有调用方都在读主表。
   */
  async listAllRecords(_tableId: string): Promise<BitableRecord[]> {
    return this.mainTableCache.getAll();
  }

  /**
   * 强制从飞书拉全表（绕开缓存）。
   * 提供给 RecordCache 的 loader 使用，外部一般不需要直接调。
   */
  async fetchAllRecordsFresh(tableId: string): Promise<BitableRecord[]> {
    const baseToken = await this.getBaseToken();
    const resolvedTableId = await this.resolveTableId(tableId);
    const records: BitableRecord[] = [];
    let pageToken: string | null = null;

    do {
      const query = `/open-apis/bitable/v1/apps/${baseToken}/tables/${resolvedTableId}/records?page_size=500${pageToken ? `&page_token=${pageToken}` : ''}`;
      const res = await larkClient.get(query);
      const data = res.data as {
        items: BitableRecord[];
        has_more: boolean;
        page_token?: string;
      };
      records.push(...data.items);
      pageToken = data.has_more ? (data.page_token ?? null) : null;
    } while (pageToken);

    return records;
  }

  /**按公司 + 岗位名称搜索记录（模糊匹配） */
  async searchByCompanyAndPosition(
    tableId: string,
    company: string,
    position?: string,
  ): Promise<BitableRecord[]> {
    const all = await this.listAllRecords(tableId);
    return all.filter((r) => {
      const comp = String(r.fields['公司'] ?? '').trim();
      const pos = String(r.fields['岗位名称'] ?? '').trim();
      const matchCompany = comp.includes(company) || company.includes(comp);
      if (!matchCompany) return false;
      if (position) {
        return pos.includes(position) || position.includes(pos);
      }
      return true;
    });
  }
}

/**
 * 全局单例：commands.ts 和 ws.ts 都从这里取，保证缓存只有一份。
 */
export const baseService = new BaseService(config.base.token);
