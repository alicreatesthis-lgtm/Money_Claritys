import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { apiLimiter } from './middleware/rateLimiter.js';

// Route handlers
import authRoutes from './routes/auth.js';
import accountsRoutes from './routes/accounts.js';
import transactionsRoutes from './routes/transactions.js';
import budgetsRoutes from './routes/budgets.js';
import goalsRoutes from './routes/goals.js';
import analyticsRoutes from './routes/analytics.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Security and Utility Middleware
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

// Apply General Rate Limiter to API
app.use('/api', apiLimiter);

// Mount API Routes
app.use('/api/auth', authRoutes);
app.use('/api/accounts', accountsRoutes);
app.use('/api/transactions', transactionsRoutes);
app.use('/api/budgets', budgetsRoutes);
app.use('/api/goals', goalsRoutes);
app.use('/api/analytics', analyticsRoutes);

// Health Check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', app: 'Money Clarity API', timestamp: new Date().toISOString() });
});

// Serve Static Frontend Assets (for local and standalone runs)
const publicDir = path.join(__dirname, '../public');
app.use(express.static(publicDir));

// Clean Navigation Routes
app.get('/login', (req, res) => {
    res.sendFile(path.join(publicDir, 'auth.html'));
});

app.get('/register', (req, res) => {
    res.sendFile(path.join(publicDir, 'auth.html'));
});

app.get('/forgot-password', (req, res) => {
    res.sendFile(path.join(publicDir, 'auth.html'));
});

// Global Error Handler
app.use((err, req, res, next) => {
    console.error('[Unhandled Server Error]:', err);
    res.status(500).json({
        success: false,
        error: 'An unexpected internal server error occurred.'
    });
});

export default app;
