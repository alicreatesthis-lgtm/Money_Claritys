import serverless from 'serverless-http';
import app from '../../src/app.js';
import { runMigrations } from '../../src/db/migrate.js';

let isMigrated = false;

function ensureDatabase() {
    if (!isMigrated) {
        try {
            runMigrations();
            isMigrated = true;
        } catch (err) {
            console.error('[Netlify Function DB Init Error]:', err);
        }
    }
}

// Wrap express app with serverless-http handler
const serverlessHandler = serverless(app);

export const handler = async (event, context) => {
    // In Netlify, when /api/* is called, strip or adjust path prefix if needed
    ensureDatabase();
    return serverlessHandler(event, context);
};
