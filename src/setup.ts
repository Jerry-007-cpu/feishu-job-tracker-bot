import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

const FEISHU_OPEN_API = 'https://open.feishu.cn';

interface EnvValues {
  FEISHU_APP_ID: string;
  FEISHU_APP_SECRET: string;
  FEISHU_VERIFICATION_TOKEN: string;
  FEISHU_ENCRYPT_KEY: string;
  BASE_TOKEN: string;
  MAIN_TABLE_ID: string;
  PROGRESS_TABLE_ID: string;
  PORT: string;
}

interface TokenResponse {
  code?: number;
  msg?: string;
  tenant_access_token?: string;
}

interface ApiResponse<T> {
  code: number;
  msg: string;
  data?: T;
}

interface WikiNodeData {
  node?: {
    obj_type?: string;
    obj_token?: string;
  };
}

interface RawTable {
  id?: string;
  table_id?: string;
  name?: string;
}

interface TablesData {
  items?: RawTable[];
  tables?: RawTable[];
  has_more?: boolean;
  page_token?: string;
}

function parseEnv(content: string): Partial<EnvValues> {
  const values: Partial<EnvValues> = {};

  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) {
      continue;
    }

    const [key, ...rest] = trimmed.split('=');
    if (key in defaultEnv()) {
      values[key as keyof EnvValues] = rest.join('=');
    }
  }

  return values;
}

function defaultEnv(): EnvValues {
  return {
    FEISHU_APP_ID: '',
    FEISHU_APP_SECRET: '',
    FEISHU_VERIFICATION_TOKEN: '',
    FEISHU_ENCRYPT_KEY: '',
    BASE_TOKEN: '',
    MAIN_TABLE_ID: '',
    PROGRESS_TABLE_ID: '',
    PORT: '3000',
  };
}

function formatEnv(values: EnvValues): string {
  return `# 飞书应用凭证
FEISHU_APP_ID=${values.FEISHU_APP_ID}
FEISHU_APP_SECRET=${values.FEISHU_APP_SECRET}

# 飞书事件订阅；配 webhook 后再回填也可以
FEISHU_VERIFICATION_TOKEN=${values.FEISHU_VERIFICATION_TOKEN}
FEISHU_ENCRYPT_KEY=${values.FEISHU_ENCRYPT_KEY}

# 多维表格
BASE_TOKEN=${values.BASE_TOKEN}
MAIN_TABLE_ID=${values.MAIN_TABLE_ID}
PROGRESS_TABLE_ID=${values.PROGRESS_TABLE_ID}

# 服务端口
PORT=${values.PORT}
`;
}

function extractTokenFromUrl(inputValue: string): { kind: 'base' | 'wiki'; token: string } | null {
  try {
    const url = new URL(inputValue);
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

function resolveInputKind(inputValue: string): { kind: 'base' | 'wiki'; token: string } {
  const fromUrl = extractTokenFromUrl(inputValue);
  if (fromUrl) {
    return fromUrl;
  }

  if (inputValue.startsWith('wiki/')) {
    return { kind: 'wiki', token: inputValue.replace(/^wiki\//, '') };
  }

  return { kind: 'base', token: inputValue };
}

async function getTenantToken(appId: string, appSecret: string): Promise<string> {
  const res = await fetch(`${FEISHU_OPEN_API}/open-apis/auth/v3/tenant_access_token/internal`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ app_id: appId, app_secret: appSecret }),
  });
  const json = (await res.json()) as TokenResponse;

  if (!res.ok || json.code !== 0 || !json.tenant_access_token) {
    throw new Error(`获取 tenant_access_token 失败：${json.msg ?? res.statusText}`);
  }

  return json.tenant_access_token;
}

async function apiGet<T>(tenantToken: string, path: string): Promise<T> {
  const res = await fetch(`${FEISHU_OPEN_API}${path}`, {
    headers: {
      Authorization: `Bearer ${tenantToken}`,
      'Content-Type': 'application/json; charset=utf-8',
    },
  });
  const json = (await res.json()) as ApiResponse<T>;

  if (!res.ok || json.code !== 0 || !json.data) {
    throw new Error(json.msg || `${res.status} ${res.statusText}`);
  }

  return json.data;
}

async function resolveBaseToken(tenantToken: string, rawInput: string): Promise<string> {
  const inputValue = rawInput.trim();
  const parsed = resolveInputKind(inputValue);

  if (parsed.kind === 'base') {
    return parsed.token;
  }

  const data = await apiGet<WikiNodeData>(
    tenantToken,
    `/open-apis/wiki/v2/spaces/get_node?token=${encodeURIComponent(parsed.token)}`,
  );
  const node = data.node;

  if (!node?.obj_token) {
    throw new Error('Wiki 节点没有返回 obj_token');
  }

  if (node.obj_type !== 'bitable') {
    throw new Error(`这个 Wiki 节点不是多维表格，而是 ${node.obj_type ?? '未知类型'}`);
  }

  return node.obj_token;
}

async function listTables(tenantToken: string, baseToken: string): Promise<RawTable[]> {
  const tables: RawTable[] = [];
  let pageToken = '';

  do {
    const suffix = pageToken ? `&page_token=${encodeURIComponent(pageToken)}` : '';
    const data = await apiGet<TablesData>(
      tenantToken,
      `/open-apis/bitable/v1/apps/${baseToken}/tables?page_size=100${suffix}`,
    );
    tables.push(...(data.items ?? data.tables ?? []));
    pageToken = data.has_more ? (data.page_token ?? '') : '';
  } while (pageToken);

  return tables;
}

function pickMainTable(tables: RawTable[]): RawTable | undefined {
  return tables.find((table) => table.name?.includes('主表'))
    ?? tables.find((table) => table.name?.includes('投递记录'))
    ?? tables[0];
}

async function question(
  rl: ReturnType<typeof createInterface>,
  label: string,
  defaultValue = '',
): Promise<string> {
  const suffix = defaultValue ? ` (${defaultValue})` : '';
  const answer = await rl.question(`${label}${suffix}: `);
  return answer.trim() || defaultValue;
}

async function requiredQuestion(
  rl: ReturnType<typeof createInterface>,
  label: string,
  defaultValue = '',
): Promise<string> {
  while (true) {
    const answer = await question(rl, label, defaultValue);
    if (answer) {
      return answer;
    }
    console.log('这个值必填。');
  }
}

async function main(): Promise<void> {
  const envPath = '.env';
  const existing = existsSync(envPath) ? parseEnv(await readFile(envPath, 'utf8')) : {};
  const values: EnvValues = { ...defaultEnv(), ...existing };
  const rl = createInterface({ input, output });

  console.log('\n飞书投递机器人 setup');
  console.log('按提示填写信息。已经存在的 .env 值会作为默认值。\n');

  try {
    values.FEISHU_APP_ID = await requiredQuestion(rl, 'FEISHU_APP_ID', values.FEISHU_APP_ID);
    values.FEISHU_APP_SECRET = await requiredQuestion(rl, 'FEISHU_APP_SECRET', values.FEISHU_APP_SECRET);

    const rawBaseInput = await requiredQuestion(
      rl,
      '模板副本链接 / BASE_TOKEN',
      values.BASE_TOKEN,
    );
    values.FEISHU_VERIFICATION_TOKEN = await question(
      rl,
      'FEISHU_VERIFICATION_TOKEN（可先留空）',
      values.FEISHU_VERIFICATION_TOKEN,
    );
    values.FEISHU_ENCRYPT_KEY = await question(
      rl,
      'FEISHU_ENCRYPT_KEY（可先留空）',
      values.FEISHU_ENCRYPT_KEY,
    );
    values.PORT = await question(rl, 'PORT', values.PORT);

    console.log('\n正在检查飞书应用凭证和多维表格权限...');
    const tenantToken = await getTenantToken(values.FEISHU_APP_ID, values.FEISHU_APP_SECRET);
    values.BASE_TOKEN = await resolveBaseToken(tenantToken, rawBaseInput);

    const tables = await listTables(tenantToken, values.BASE_TOKEN);
    const mainTable = pickMainTable(tables);
    if (!mainTable) {
      throw new Error('没有找到任何数据表');
    }

    values.MAIN_TABLE_ID = mainTable.table_id ?? mainTable.id ?? '';
    if (!values.MAIN_TABLE_ID) {
      throw new Error(`找到了表 "${mainTable.name ?? '未命名'}"，但没有表 ID`);
    }

    const progressTable = tables.find((table) => table.name?.includes('进度'));
    values.PROGRESS_TABLE_ID = progressTable?.table_id ?? progressTable?.id ?? '';

    await writeFile(envPath, formatEnv(values), 'utf8');

    console.log('\n已生成 .env');
    console.log(`BASE_TOKEN=${values.BASE_TOKEN}`);
    console.log(`MAIN_TABLE_ID=${values.MAIN_TABLE_ID}${mainTable.name ? ` (${mainTable.name})` : ''}`);
    if (values.PROGRESS_TABLE_ID) {
      console.log(`PROGRESS_TABLE_ID=${values.PROGRESS_TABLE_ID}${progressTable?.name ? ` (${progressTable.name})` : ''}`);
    }
    console.log('\n下一步：');
    console.log('1. npm run dev');
    console.log('2. 如果要在飞书里私聊机器人，把 /webhook/lark 配成公网 HTTPS 回调。');
  } catch (err) {
    console.error(`\nsetup 失败：${(err as Error).message}`);
    console.error('请确认：App ID/Secret 正确；应用已开 bitable:app 权限；如果填 wiki 链接，还要开 wiki:node:read；并且模板副本里已经添加了这个文档应用。');
    process.exitCode = 1;
  } finally {
    rl.close();
  }
}

void main();
