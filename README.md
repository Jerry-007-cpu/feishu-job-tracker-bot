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

## 🚀 快速开始

> AI Agent 正在帮你安装？可以直接跳到 [AI Agent 快速开始](#ai-agent-快速开始)。

### 前置条件

- Node.js ≥ 20（[下载](https://nodejs.org/)）
- 一个飞书账号（个人或企业自建均可）
- 一个飞书自建应用的 `App ID` / `App Secret`

> 公网 HTTPS 只在启用"飞书私聊机器人"时需要；安装模板和生成 `.env` 不需要公网。

### 1. 安装模板

点击上方 **一键安装飞书模板**，复制到你自己的飞书空间。模板已配好字段和视图。

### 2. 准备飞书应用

在 [飞书开放平台](https://open.feishu.cn/app) 创建企业自建应用，然后：

1. 在"凭证与基础信息"复制 `App ID` 和 `App Secret`
2. 在"权限管理"开通 `im:message`、`im:message:send_as_bot`、`bitable:app`、`wiki:node:read`
3. 在"应用功能 → 机器人"启用机器人
4. 在模板副本里点右上角 "**...**" → "**更多**" → "**添加文档应用**"，添加这个机器人应用

### 3. 克隆并自动配置

```bash
git clone https://github.com/Jerry-007-cpu/feishu-job-tracker-bot.git
cd feishu-job-tracker-bot
npm install
npm run setup
```

`npm run setup` 会按提示生成 `.env`：可以直接粘贴你的模板副本链接，即使是 `https://xxx.feishu.cn/wiki/xxx?table=xxx` 这种老文档/wiki 链接也可以。脚本会自动解析真实 `BASE_TOKEN`，并自动找到主表 `MAIN_TABLE_ID`。

### 4. 本地启动

```bash
npm test           # 应看到 16/16 通过
npm run dev        # 启动开发服务，监听 3000 端口
```

看到 `🚀 Lark Bot server running on http://localhost:3000` 就成功了。

### 5. 启用飞书私聊机器人

如果只是复制模板，不需要这一步。  
如果要在飞书里私聊机器人发 `/创建` `/查询`，飞书必须能访问你的服务，所以这里需要公网 HTTPS。

1. 本地调试：用 ngrok 暴露 `http://localhost:3000`，得到 `https://...ngrok-free.app`
2. 生产使用：部署到 Vercel / Railway / Cloudflare Workers 等平台
3. 飞书后台 → "事件与回调" → 请求地址填 `https://你的域名/webhook/lark`
4. 添加事件 `im.message.receive_v1`
5. 复制 `Verification Token` 和可选的 `Encrypt Key`，重新运行 `npm run setup` 或手动填进 `.env`
6. "版本管理与发布"发布应用，在飞书里搜索机器人并私聊 `/帮助`

看到机器人回复，就是全通了。

### AI Agent 快速开始

如果你在用 Codex / Claude Code / Cursor 这类 AI Agent，可以先安装本仓库配套 skill：

```bash
npx skills add Jerry-007-cpu/feishu-job-tracker-bot@feishu-job-tracker-bot -g -y
```

然后直接对 Agent 说：

```text
帮我配置 feishu-job-tracker-bot。我已经复制了飞书模板，下面是模板链接和飞书应用 App ID / App Secret。
```

Agent 会按 skill 执行：安装依赖、运行 `npm run setup`、解析 wiki/base 链接、自动生成 `.env`，并只在启用飞书私聊机器人时提醒你配置公网 HTTPS webhook。

### 还不能和机器人对话？

- **搜不到机器人**：检查"应用功能 → 机器人"是否已启用，以及"版本管理与发布"是否已经发布到包含你的可见范围。
- **能发消息但没回复**：检查服务是否正在运行、飞书事件回调 URL 是否是公网 HTTPS、是否添加了 `im.message.receive_v1` 事件，以及 `.env` 里的 `FEISHU_VERIFICATION_TOKEN` / `FEISHU_ENCRYPT_KEY` 是否和后台一致。
- **机器人回复写表失败**：检查模板副本里是否已经"添加文档应用"，以及应用权限里是否开了 `bitable:app`。如果 `BASE_TOKEN` 填的是 wiki 链接，还需要 `wiki:node:read`。

## 📦 项目结构

```
src/
├── server.ts             # Hono 入口
├── setup.ts              # 交互式初始化 .env
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
