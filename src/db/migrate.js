import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import db from './connection.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function runMigrations() {
    console.log('[Database] Checking & executing migrations...');
    
    // Create migrations tracker table
    db.exec(`
        CREATE TABLE IF NOT EXISTS _migrations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT UNIQUE NOT NULL,
            applied_at INTEGER NOT NULL
        );
    `);

    const migrationsDir = path.join(__dirname, 'migrations');
    const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();

    const appliedMigrations = db.prepare('SELECT name FROM _migrations').all().map(r => r.name);

    for (const file of files) {
        if (!appliedMigrations.includes(file)) {
            console.log(`[Database] Applying migration: ${file}`);
            const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
            
            const runInTransaction = db.transaction(() => {
                db.exec(sql);
                db.prepare('INSERT INTO _migrations (name, applied_at) VALUES (?, ?)').run(file, Date.now());
            });

            runInTransaction();
            console.log(`[Database] Successfully applied migration: ${file}`);
        } else {
            console.log(`[Database] Migration already applied: ${file}`);
        }
    }
}

// Allow direct execution from CLI
if (process.argv[1] === fileURLToPath(import.meta.url)) {
    try {
        runMigrations();
        console.log('[Database] Migrations completed successfully.');
        process.exit(0);
    } catch (err) {
        console.error('[Database] Migration failed:', err);
        process.exit(1);
    }
}
