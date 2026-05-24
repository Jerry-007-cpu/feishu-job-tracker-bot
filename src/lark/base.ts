import { larkClient } from './client.js';
import type { BitableRecord } from '../types.js';

/**
 * 多维表格操作封装
 */
export class BaseService {
  constructor(
    private baseToken: string,
  ) {}

  /** 创建单条记录 */
  async createRecord(tableId: string, fields: Record<string, unknown>): Promise<BitableRecord> {
    const res = await larkClient.post(
      `/open-apis/bitable/v1/apps/${this.baseToken}/tables/${tableId}/records`,
      { fields },
    );
    return (res.data as { record: BitableRecord }).record;
  }

  /** 更新单条记录（全量覆盖 fields） */
  async updateRecord(
    tableId: string,
    recordId: string,
    fields: Record<string, unknown>,
  ): Promise<BitableRecord> {
    const res = await larkClient.put(
      `/open-apis/bitable/v1/apps/${this.baseToken}/tables/${tableId}/records/${recordId}`,
      { fields },
    );
    return (res.data as { record: BitableRecord }).record;
  }

  /** 列出所有记录（自动翻页） */
  async listAllRecords(tableId: string): Promise<BitableRecord[]> {
    const records: BitableRecord[] = [];
    let pageToken: string | null = null;

    do {
      const query = `/open-apis/bitable/v1/apps/${this.baseToken}/tables/${tableId}/records?page_size=500${pageToken ? `&page_token=${pageToken}` : ''}`;
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
