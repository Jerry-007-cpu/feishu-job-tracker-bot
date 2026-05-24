import 'dotenv/config';

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
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
    mainTableId: requireEnv('MAIN_TABLE_ID'),
    progressTableId: process.env.PROGRESS_TABLE_ID || '',
  },
  port: parseInt(process.env.PORT || '3000', 10),
};
