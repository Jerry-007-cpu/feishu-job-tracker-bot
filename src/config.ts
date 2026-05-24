import 'dotenv/config';

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function optionalEnv(key: string): string {
  return process.env[key]?.trim() || '';
}

export const config = {
  feishu: {
    appId: requireEnv('FEISHU_APP_ID'),
    appSecret: requireEnv('FEISHU_APP_SECRET'),
    verificationToken: process.env.FEISHU_VERIFICATION_TOKEN || '',
    encryptKey: process.env.FEISHU_ENCRYPT_KEY || '',
  },
  base: {
    token: requireEnv('BASE_TOKEN'),
    mainTableId: optionalEnv('MAIN_TABLE_ID'),
    progressTableId: optionalEnv('PROGRESS_TABLE_ID'),
  },
  port: parseInt(process.env.PORT || '3000', 10),
};
