import app from './app.js';
import { runMigrations } from './db/migrate.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, '../public');

const PORT = process.env.PORT || 3000;

// Execute Database Migrations on Startup
try {
    runMigrations();
} catch (err) {
    console.error('[Fatal] Database migration error on startup:', err);
    process.exit(1);
}

// Fallback SPA routing
app.get('*', (req, res) => {
    res.sendFile(path.join(publicDir, 'index.html'));
});

app.listen(PORT, () => {
    console.log(`====================================================`);
    console.log(`💎 Money Clarity is running live at: http://localhost:${PORT}`);
    console.log(`🔒 Secure Database: SQLite WAL Persistent Engine`);
    console.log(`🛡️  Auth Engine: Bcrypt (12 Rounds) + Signed JWTs`);
    console.log(`====================================================`);
});
