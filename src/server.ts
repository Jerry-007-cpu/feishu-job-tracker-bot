import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { config } from './config.js';
import { handleWebhook } from './bot/router.js';

const app = new Hono();

// 健康检查
app.get('/health', (c) => c.json({ status: 'ok', time: new Date().toISOString() }));

// 飞书事件回调
app.post('/webhook/lark', handleWebhook);

// 启动服务
serve(
  {
    fetch: app.fetch,
    port: config.port,
  },
  (info) => {
    console.log(`🚀 Lark Bot server running on http://localhost:${info.port}`);
    console.log(`   Webhook URL: http://localhost:${info.port}/webhook/lark`);
  },
);
