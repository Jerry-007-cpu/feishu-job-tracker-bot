---
name: feishu-job-tracker-bot
description: Use when setting up or troubleshooting the Feishu job tracker bot repository. Helps install dependencies, run npm setup, resolve Feishu wiki/base template links, generate .env, explain when public HTTPS is required, and guide webhook/bot publishing steps.
---

# Feishu Job Tracker Bot

Use this skill when the user wants to install, configure, simplify, or debug `Jerry-007-cpu/feishu-job-tracker-bot`.

## Goal

Get the user from a copied Feishu template to a working `.env` with the fewest manual steps. Keep the user-facing explanation short. Separate:

- Template-only use: no public HTTPS needed.
- Feishu private-chat bot use: public HTTPS webhook is required.

## Human Setup Path

Tell human users to run:

```bash
git clone https://github.com/Jerry-007-cpu/feishu-job-tracker-bot.git
cd feishu-job-tracker-bot
npm install
npm run setup
```

`npm run setup` prompts for:

- `FEISHU_APP_ID`
- `FEISHU_APP_SECRET`
- the copied template URL or real Base token
- optional webhook `Verification Token`
- optional `Encrypt Key`

The setup script writes `.env`, resolves wiki links to real Base tokens, and auto-picks the main table.

## Agent Setup Path

When acting as an AI Agent:

1. Inspect `package.json` and confirm `setup` exists.
2. Ask the user only for missing secrets or links. Do not ask them to manually extract `BASE_TOKEN` or `MAIN_TABLE_ID`.
3. Run `npm install` if dependencies are missing.
4. Run `npm run setup` and provide the requested values interactively.
5. If setup fails, map the error to one of these checks:
   - App ID/Secret is wrong.
   - The app lacks `bitable:app`.
   - The template link is a wiki link and the app lacks `wiki:node:read`.
   - The copied template has not added the app as a document app.
6. Run `npm test` and `npm run type-check` after code changes.

## Required Feishu Setup

The user needs a Feishu self-built app with:

- `im:message`
- `im:message:send_as_bot`
- `bitable:app`
- `wiki:node:read` if the template link is `/wiki/...`
- Bot capability enabled
- The app added to the copied template via "添加文档应用"

## Public HTTPS Rule

Be precise:

- Installing/copying the template: no public HTTPS.
- Generating `.env` and resolving table IDs: no public HTTPS.
- Running local tests: no public HTTPS.
- Receiving messages from Feishu private chat: public HTTPS is required because Feishu must POST events to `/webhook/lark`.

For local bot testing, suggest ngrok or localtunnel. For production, suggest Vercel, Railway, or Cloudflare.

## README Style

Keep README short:

- Human quick start first.
- AI Agent quick start second.
- Webhook/public HTTPS as an optional bot-enabling step.
- Troubleshooting as three bullets: cannot find bot, bot does not reply, bot cannot write table.
