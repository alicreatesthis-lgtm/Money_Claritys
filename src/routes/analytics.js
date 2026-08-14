import { Router } from 'express';
import db from '../db/connection.js';
import { authenticateToken } from '../middleware/auth.js';

const router = Router();
router.use(authenticateToken);

/**
 * GET /api/analytics/dashboard
 * Retrieve aggregated metrics, cash flow trends, and category spending
 */
router.get('/dashboard', (req, res) => {
    try {
        const userId = req.user.id;
        const now = new Date();
        const currentYear = now.getFullYear();
        const currentMonth = String(now.getMonth() + 1).padStart(2, '0');
        const currentMonthPrefix = `${currentYear}-${currentMonth}`;

        // 1. Current Month Totals
        const monthIncomeRow = db.prepare(`
            SELECT SUM(amount) as total FROM transactions
            WHERE user_id = ? AND type = 'income' AND date LIKE ?
        `).get(userId, `${currentMonthPrefix}%`);

        const monthExpenseRow = db.prepare(`
            SELECT SUM(amount) as total FROM transactions
            WHERE user_id = ? AND type = 'expense' AND date LIKE ?
        `).get(userId, `${currentMonthPrefix}%`);

        const monthlyIncome = monthIncomeRow?.total || 0;
        const monthlyExpense = monthExpenseRow?.total || 0;
        const netCashFlow = monthlyIncome - monthlyExpense;
        const savingsRate = monthlyIncome > 0 ? Math.max(0, Math.round(((monthlyIncome - monthlyExpense) / monthlyIncome) * 100)) : 0;

        // 2. Spending by Category (Current Month)
        const categorySpending = db.prepare(`
            SELECT category, SUM(amount) as total, COUNT(*) as count
            FROM transactions
            WHERE user_id = ? AND type = 'expense' AND date LIKE ?
            GROUP BY category
            ORDER BY total DESC
        `).all(userId, `${currentMonthPrefix}%`);

        // 3. 6-Month Cash Flow Trend
        const monthlyTrends = [];
        for (let i = 5; i >= 0; i--) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const y = d.getFullYear();
            const m = String(d.getMonth() + 1).padStart(2, '0');
            const prefix = `${y}-${m}`;
            const label = d.toLocaleString('default', { month: 'short' });

            const inc = db.prepare(`
                SELECT SUM(amount) as total FROM transactions
                WHERE user_id = ? AND type = 'income' AND date LIKE ?
            `).get(userId, `${prefix}%`)?.total || 0;

            const exp = db.prepare(`
                SELECT SUM(amount) as total FROM transactions
                WHERE user_id = ? AND type = 'expense' AND date LIKE ?
            `).get(userId, `${prefix}%`)?.total || 0;

            monthlyTrends.push({
                month: label,
                yearMonth: prefix,
                income: inc,
                expense: exp,
                net: inc - exp
            });
        }

        // 4. Accounts Summary & Net Worth
        const accounts = db.prepare(`
            SELECT * FROM accounts WHERE user_id = ? AND is_archived = 0
        `).all(userId);

        let totalAssets = 0;
        let totalLiabilities = 0;
        accounts.forEach(acc => {
            if (acc.type === 'credit_card') {
                totalLiabilities += Math.abs(acc.balance);
            } else {
                totalAssets += acc.balance;
            }
        });

        // 5. Recent 5 Transactions
        const recentTransactions = db.prepare(`
            SELECT t.*, a.name as account_name, a.color as account_color
            FROM transactions t
            LEFT JOIN accounts a ON t.account_id = a.id
            WHERE t.user_id = ?
            ORDER BY t.date DESC, t.created_at DESC
            LIMIT 5
        `).all(userId);

        return res.json({
            success: true,
            analytics: {
                monthlyIncome,
                monthlyExpense,
                netCashFlow,
                savingsRate,
                totalAssets,
                totalLiabilities,
                netWorth: totalAssets - totalLiabilities,
                categorySpending,
                monthlyTrends,
                recentTransactions,
                currency: req.user.currency || 'USD'
            }
        });
    } catch (err) {
        console.error('[Analytics Dashboard Error]:', err);
        return res.status(500).json({ success: false, error: 'Failed to generate analytics.' });
    }
});

export default router;
