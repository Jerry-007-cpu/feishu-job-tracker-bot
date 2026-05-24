# Lark Application Bot · 飞书投递记录机器人

> 用聊天指令管理求职投递记录的飞书机器人。在飞书里直接对机器人发 `/创建 携程 产品经理 当前进度三面`，自动写进你的多维表格。

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D20-brightgreen.svg)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue.svg)](https://www.typescriptlang.org/)

<p align="center">
  <a href="https://y00b74dmx5n.feishu.cn/wiki/R4llwv5GUi8WVxkNIEYcyZGOnpe?table=blkU6cb41JepghrF">
    <img alt="一键安装飞书模板" src="https://img.shields.io/badge/%E9%A3%9E%E4%B9%A6%E6%A8%A1%E6%9D%BF-%E4%B8%80%E9%94%AE%E5%AE%89%E8%A3%85-00B96B?style=for-the-badge">
  </a>
</p>

## ✨ 特性

- 🤖 **指令式交互**：`/创建` `/更新` `/查询` `/帮助` 四个命令搞定所有操作
- ✅ **写前必确认**：所有写入操作先回复确认信息，避免误写
- 🔐 **签名校验 + 加密事件**：内置 `X-Lark-Signature` 校验和 AES 解密
- 🪶 **轻量、零运维**：单进程 Node 服务，可一键部署到 Vercel / Cloudflare Workers
- 🧪 **带单测**：parser 核心逻辑有 16 个 vitest 单测护航

## 📋 适用人群

任何想用飞书机器人 + 多维表格管理结构化记录的人。本项目以"求职投递"为例，但只要改下 `src/types.ts` 里的字段和枚举，就能改造成读书记录、健身打卡、客户跟进、Bug 跟进等任何场景。

## 🎬 命令示例

```
/创建 携程 产品经理 当前进度三面 日期2026-05-25 平台官网 base上海 备注约了面试
/更新 携程 产品经理 当前进度hr面
/查询 携程
/帮助
```

参数顺序无关、可缺省，紧贴写法（`当前进度三面`）和带空格写法（`当前进度 三面`）都识别。

## 🚀 5 分钟跑通指南

### 前置条件

- Node.js ≥ 20（[下载](https://nodejs.org/)）
- 一个飞书账号（个人或企业自建均可）
- 一个能跑公网 HTTPS 的地方（本地调试用 [ngrok](https://ngrok.com/)；生产用 Vercel / Cloudflare Workers）

### 1. 安装飞书模板

点击上方 **一键安装飞书模板**，把"求职投递"模板复制到你自己的飞书空间。模板已经配好主表字段、单选枚举和基础视图，不需要手动建字段。

安装完成后，打开你自己的模板副本，从浏览器地址栏提取两个 ID：

- `BASE_TOKEN`：URL 里 `/base/` 后面的这一段
- `MAIN_TABLE_ID`：URL 里 `table=` 后面的这一段

示例：

```text
https://xxx.feishu.cn/base/bascnxxxxxxxxxxxx?table=tblxxxxxxxxxxxx
                         ^ BASE_TOKEN       ^ MAIN_TABLE_ID
```

如果你看到的是 `https://xxx.feishu.cn/wiki/<WIKI_TOKEN>?table=<TABLE_ID>` 这种 wiki 链接，不要把 `WIKI_TOKEN` 填进 `BASE_TOKEN`。请在页面里打开多维表格本体，复制 `/base/<BASE_TOKEN>?table=<MAIN_TABLE_ID>` 形式的链接；或者用 lark-cli / `wiki/v2/spaces/get_node` 把 wiki node 解析成真正的 `app_token`。

### 2. 在飞书开放平台创建机器人

1. 打开 [飞书开放平台](https://open.feishu.cn/app) → 创建企业自建应用
2. 进 "**凭证与基础信息**"，记下 `App ID` 和 `App Secret`
3. 进 "**权限管理**" → 批量开通：
   - `im:message`（收发消息）
   - `im:message:send_as_bot`（机器人身份发消息）
   - `bitable:app`（读写多维表格）
4. 进 "**应用功能** → 机器人**"，启用机器人能力
5. （稍后再做）进 "**事件与回调** → 事件配置"，等下面服务起好了再回来配 webhook URL

### 3. 把机器人授权给模板副本（方案 A）

模板安装后，你拿到的是自己的多维表格副本；你的机器人应用默认没有这个副本的读写权限，需要手动添加一次文档应用：

1. 打开第 1 步安装出来的模板副本
2. 点击右上角 "**...**" → "**更多**" → "**添加文档应用**"
3. 搜索你在第 2 步创建的机器人应用名称
4. 添加应用，并确认它可以访问当前多维表格

完成后，机器人才能用 `.env` 里的 `BASE_TOKEN` 和 `MAIN_TABLE_ID` 写入这份表。

### 4. 克隆 + 安装

```bash
git clone https://github.com/Jerry-007-cpu/feishu-job-tracker-bot.git
cd feishu-job-tracker-bot
npm install
```

### 5. 配置环境变量

```bash
cp .env.example .env
```

编辑 `.env`，填入你刚才拿到的值：

```env
FEISHU_APP_ID=cli_xxxxxxxxxxxxxxxx
FEISHU_APP_SECRET=你的_App_Secret
FEISHU_VERIFICATION_TOKEN=             # 配完 webhook 再回填
FEISHU_ENCRYPT_KEY=                    # 强烈建议在飞书后台启用并填
BASE_TOKEN=你的_多维表格_app_token
MAIN_TABLE_ID=你的_主表_table_id
PROGRESS_TABLE_ID=                     # 可选，如果有附表
PORT=3000
```

> ⚠️ `.env` 已在 `.gitignore` 里，**绝对不要提交到仓库**。

### 6. 跑通本地测试

```bash
npm test           # 应看到 16/16 通过
npm run dev        # 启动开发服务，监听 3000 端口
```

看到 `🚀 Lark Bot server running on http://localhost:3000` 就成功了。

### 7. 让飞书能找到你的服务

**本地调试**（推荐刚开始用）：

```bash
brew install ngrok                      # macOS
ngrok config add-authtoken <YOUR_TOKEN> # 注册 ngrok 后拿到
ngrok http 3000
```

会得到形如 `https://abc-def.ngrok-free.app` 的公网地址。

**生产部署**：

| 平台 | 一键部署 | 说明 |
|------|---------|------|
| [Vercel](https://vercel.com/new) | [![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new) | 最简单，免费额度够个人用 |
| [Railway](https://railway.app/new) | [Deploy on Railway](https://railway.app/new) | 长连接好用 |
| Cloudflare Workers | `wrangler deploy` | 冷启动近零、全球边缘 |

> 一键部署按钮需要你 fork 本仓库后，在按钮链接里把 git URL 改成你的仓库地址才能生效。

### 8. 回飞书后台配 webhook

1. 飞书后台 → "**事件与回调** → 事件配置**"
2. **请求地址**填 `https://你的域名/webhook/lark`
3. （建议）在"**加密策略**"启用 Encrypt Key，把生成的 Key 也回填进 `.env` 的 `FEISHU_ENCRYPT_KEY`
4. **Verification Token** 也复制到 `.env` 的 `FEISHU_VERIFICATION_TOKEN`
5. 在"**添加事件**" → 搜索并添加 `im.message.receive_v1`
6. 飞书会自动发一个 URL 验证，看到 ✅ 就成功了
7. 重启服务（`Ctrl+C` 后 `npm run dev`）让新环境变量生效

### 9. 发布应用 + 加机器人为好友

1. 飞书后台 → "**版本管理与发布**" → 创建版本 → 可见范围选"仅自己"（或你的团队） → 提交申请
2. 个人企业一般自己当管理员，立刻审批通过
3. 在飞书 APP 里搜索你的机器人名 → 添加 → 私聊发 `/帮助`

🎉 看到机器人回复就是全通了。

## 📦 项目结构

```
src/
├── server.ts             # Hono 入口
├── config.ts             # 环境变量加载 + 必填校验
├── types.ts              # 类型 + 字段枚举（要改字段从这里改）
├── lark/
│   ├── client.ts         # 飞书 Open API client（tenant_access_token 缓存）
│   ├── base.ts           # 多维表格 CRUD
│   ├── im.ts             # 消息发送
│   └── verify.ts         # 事件签名校验 + AES 解密
├── bot/
│   ├── router.ts         # /webhook/lark 路由（签名 → 解密 → 去重 → 路由）
│   ├── commands.ts       # 命令分发 + 确认流程
│   ├── parser.ts         # 命令文本解析
│   └── session.ts        # 待确认状态管理（TTL 10min）
└── utils/
    └── dedupe.ts         # event_id FIFO 去重
tests/
└── parser.test.ts        # 解析器单测
```

## 🛠 自定义你自己的场景

想改成别的用途（读书记录、客户跟进等）？只需要改这几处：

1. **`src/types.ts`** — 改 `FieldKey`、`FIELD_NAME_MAP`，加你的字段
2. **`src/bot/parser.ts`** 的 `buildBitableFields` — 加新字段的映射
3. **`src/bot/commands.ts`** 的 `handleHelp` — 改 /帮助 的文案
4. **`src/bot/parser.ts`** 的 `detectCommand` 正则 — 如果你想换命令名（比如 `/add` 替代 `/创建`）
5. **`README.md`** —— 改模板和安装说明

`src/lark/*`（飞书 API 封装）和 `src/utils/dedupe.ts` 大概率不用改。

## 🔐 安全清单

- [x] `.env` 在 `.gitignore` 里
- [x] `.env.example` 只放占位符
- [x] 配置 `FEISHU_ENCRYPT_KEY` 后会自动启用 `X-Lark-Signature` 校验
- [x] `event_id` FIFO 去重防止飞书重试导致重复写入
- [ ] 你需要做的：**不要把 `.env` 截图或粘贴到任何对话框、issue、文档**
- [ ] 你需要做的：如果不慎泄露 token，**立即去飞书后台轮换 App Secret、Encrypt Key、Bitable 访问令牌**

## ⚠️ 已知限制 / 路线图

- 当前 dedupe 是**单实例内存**，迁 serverless 多实例需换 Redis/KV
- `/查询` 和 `/更新` 用全表扫描 + 内存过滤，记录量 > 1000 后建议改 Bitable `search` API
- **不支持删除**（这是有意的，需要删请直接到多维表格操作）
- 日期目前只支持 `YYYY-MM-DD`，"今天/明天/下周一" 在路线图
- 未做 LLM 自然语言兜底解析

## 🤝 贡献

欢迎 issue 和 PR。提交前请确保：

```bash
npm test          # 测试全过
npm run type-check # 类型检查通过
```

## 📄 License

[MIT](./LICENSE) © 2026 Rui
