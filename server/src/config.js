import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
dotenv.config({ path: path.join(root, '.env') });

export const config = {
  databaseUrl: process.env.DATABASE_URL || 'postgresql://aw:aw@127.0.0.1:5435/ai_workstation',
  jwtSecret: process.env.JWT_SECRET || 'dev-ai-workstation-secret-change-me',
  port: Number(process.env.PORT || 4101),
  uploadDir: process.env.UPLOAD_DIR || path.join(root, 'uploads'),
};
