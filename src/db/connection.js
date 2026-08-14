import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Detect if running in Netlify or AWS Lambda serverless runtime
const isServerless = !!(process.env.NETLIFY || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.LAMBDA_TASK_ROOT);

let dbPath = process.env.DB_PATH;

if (!dbPath) {
    if (isServerless) {
        dbPath = '/tmp/clarity_cash.db';
    } else {
        dbPath = path.join(__dirname, '../../data/clarity_cash.db');
    }
}

const resolvedPath = path.resolve(dbPath);
const dbDir = path.dirname(resolvedPath);

if (!fs.existsSync(dbDir)) {
    try {
        fs.mkdirSync(dbDir, { recursive: true });
    } catch (e) {
        console.warn('[DB] Notice: Directory creation in serverless environment:', e.message);
    }
}

const db = new Database(resolvedPath);

// Enable WAL mode for high concurrency and Foreign Keys enforcement
try {
    db.pragma('journal_mode = WAL');
} catch {
    // Some serverless environments with tmpfs work better with standard journal mode
    db.pragma('journal_mode = DELETE');
}
db.pragma('foreign_keys = ON');

export default db;
