import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import db from './connection.js';
import { runMigrations } from './migrate.js';

async function seed() {
    console.log('[Seed] Starting database seed...');
    runMigrations();

    const email = 'alex@claritycash.io';
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);

    if (existing) {
        console.log('[Seed] Demo user already exists. Skipping seed.');
        return;
    }

    const saltRounds = 12;
    const passwordHash = await bcrypt.hash('Clarity123!', saltRounds);
    const userId = uuidv4();
    const now = Date.now();

    const seedTx = db.transaction(() => {
        // 1. Create User
        db.prepare(`
            INSERT INTO users (id, email, password_hash, full_name, currency, theme_preference, created_at, updated_at)
            VALUES (?, ?, ?, 'Alex Morgan', 'USD', 'dark', ?, ?)
        `).run(userId, email, passwordHash, now, now);

        // 2. Create Accounts
        const accCheckingId = uuidv4();
        const accSavingsId = uuidv4();
        const accCreditId = uuidv4();
        const accInvestId = uuidv4();

        db.prepare(`
            INSERT INTO accounts (id, user_id, name, type, balance, currency, institution, mask, color, is_archived, created_at, updated_at)
            VALUES 
            (?, ?, 'Chase Total Checking', 'checking', 4850.25, 'USD', 'Chase Bank', '4821', '#3B82F6', 0, ?, ?),
            (?, ?, 'High-Yield Savings', 'savings', 24150.00, 'USD', 'Marcus by Goldman Sachs', '9103', '#10B981', 0, ?, ?),
            (?, ?, 'Sapphire Preferred Card', 'credit_card', 1240.80, 'USD', 'Chase Bank', '3309', '#F43F5E', 0, ?, ?),
            (?, ?, 'Vanguard Index Portfolio', 'investment', 68400.50, 'USD', 'Vanguard', '7712', '#8B5CF6', 0, ?, ?)
        `).run(
            accCheckingId, userId, now, now,
            accSavingsId, userId, now, now,
            accCreditId, userId, now, now,
            accInvestId, userId, now, now
        );

        // 3. Create Budgets
        const budgets = [
            { cat: 'Housing & Rent', limit: 2200 },
            { cat: 'Food & Dining', limit: 800 },
            { cat: 'Transportation', limit: 350 },
            { cat: 'Utilities & Bills', limit: 300 },
            { cat: 'Entertainment', limit: 250 },
            { cat: 'Shopping & Goods', limit: 400 }
        ];

        budgets.forEach(b => {
            db.prepare(`
                INSERT INTO budgets (id, user_id, category, monthly_limit, period, created_at, updated_at)
                VALUES (?, ?, ?, ?, 'monthly', ?, ?)
            `).run(uuidv4(), userId, b.cat, b.limit, now, now);
        });

        // 4. Create Savings Goals
        db.prepare(`
            INSERT INTO goals (id, user_id, title, target_amount, current_amount, target_date, color, created_at, updated_at)
            VALUES 
            (?, ?, 'Emergency Fund (6 Months)', 30000.00, 24150.00, '2026-12-31', '#10B981', ?, ?),
            (?, ?, 'Japan Vacation 2027', 6000.00, 3200.00, '2027-04-15', '#06B6D4', ?, ?),
            (?, ?, 'New Tech & Hardware', 3500.00, 1800.00, '2026-10-30', '#8B5CF6', ?, ?)
        `).run(
            uuidv4(), userId, now, now,
            uuidv4(), userId, now, now,
            uuidv4(), userId, now, now
        );

        // 5. Create Transactions across multiple dates
        const dateObj = new Date();
        const y = dateObj.getFullYear();
        const m = String(dateObj.getMonth() + 1).padStart(2, '0');

        const transactions = [
            { type: 'income', amount: 5500.00, cat: 'Salary & Wages', payee: 'Apex Tech Labs (Bi-weekly Direct Deposit)', date: `${y}-${m}-01`, acc: accCheckingId },
            { type: 'expense', amount: 2200.00, cat: 'Housing & Rent', payee: 'Metropolitan Luxury Apartments', date: `${y}-${m}-02`, acc: accCheckingId },
            { type: 'expense', amount: 142.50, cat: 'Food & Dining', payee: 'Whole Foods Market', date: `${y}-${m}-03`, acc: accCreditId },
            { type: 'expense', amount: 89.00, cat: 'Utilities & Bills', payee: 'ConEdison Electric & Gas', date: `${y}-${m}-04`, acc: accCheckingId },
            { type: 'expense', amount: 65.40, cat: 'Transportation', payee: 'Chevron Gas Station', date: `${y}-${m}-05`, acc: accCreditId },
            { type: 'expense', amount: 18.99, cat: 'Entertainment', payee: 'Netflix & Spotify Subscriptions', date: `${y}-${m}-06`, acc: accCreditId },
            { type: 'income', amount: 850.00, cat: 'Freelance & Side Income', payee: 'Design Consulting Client', date: `${y}-${m}-07`, acc: accCheckingId },
            { type: 'expense', amount: 124.00, cat: 'Shopping & Goods', payee: 'Amazon Prime Order', date: `${y}-${m}-08`, acc: accCreditId }
        ];

        transactions.forEach(t => {
            db.prepare(`
                INSERT INTO transactions (id, user_id, account_id, type, amount, category, payee, date, notes, is_recurring, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, '', 0, ?)
            `).run(uuidv4(), userId, t.acc, t.type, t.amount, t.cat, t.payee, t.date, now);
        });

    });

    seedTx();
    console.log('[Seed] Database seeded with demo user (alex@claritycash.io / Clarity123!).');
}

seed().catch(err => {
    console.error('[Seed Error]:', err);
    process.exit(1);
});
