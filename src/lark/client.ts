import { config } from '../config.js';

interface TokenCache {
  token: string;
  expiresAt: number; // ms timestamp
}

interface ApiError {
  code: number;
  msg: string;
  [key: string]: unknown;
}

interface ApiResponse {
  code: number;
  msg: string;
  data?: Record<string, unknown>;
  [key: string]: unknown;
}

export class LarkClient {
  private tokenCache: TokenCache | null = null;
  private baseUrl = 'https://open.feishu.cn';

  constructor(
    private appId: string,
    private appSecret: string,
  ) {}

  /** 获取 tenant_access_token，自动缓存与刷新 */
  private async getTenantToken(): Promise<string> {
    const now = Date.now();
    if (this.tokenCache && now < this.tokenCache.expiresAt) {
      return this.tokenCache.token;
    }

    const res = await fetch(`${this.baseUrl}/open-apis/auth/v3/tenant_access_token/internal`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ app_id: this.appId, app_secret: this.appSecret }),
    });

    if (!res.ok) {
      throw new Error(`Failed to get tenant token: ${res.status} ${res.statusText}`);
    }

    const data = (await res.json()) as { tenant_access_token: string; expire: number };

    // expire 单位秒，提前 60s 刷新
    this.tokenCache = {
      token: data.tenant_access_token,
      expiresAt: now + (data.expire - 60) * 1000,
    };

    return data.tenant_access_token;
  }

  /** 发起飞书 Open API 请求 */
  async request(method: string, path: string, body?: unknown): Promise<ApiResponse> {
    const token = await this.getTenantToken();
    const url = `${this.baseUrl}${path}`;

    const res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json; charset=utf-8',
      },
      body: body != null ? JSON.stringify(body) : undefined,
    });

    const json = (await res.json()) as ApiResponse;

    if (json.code !== 0) {
      throw new Error(`API error [${json.code}]: ${json.msg} — ${method} ${path}`);
    }

    return json;
  }

  async get(path: string): Promise<ApiResponse> {
    return this.request('GET', path);
  }

  async post(path: string, body?: unknown): Promise<ApiResponse> {
    return this.request('POST', path, body);
  }

  async put(path: string, body?: unknown): Promise<ApiResponse> {
    return this.request('PUT', path, body);
  }
}

/** 全局单例 */
export const larkClient = new LarkClient(config.feishu.appId, config.feishu.appSecret);
