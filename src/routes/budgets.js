import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../db/connection.js';
import { authenticateToken } from '../middleware/auth.js';
import { sanitizeString } from '../middleware/validate.js';

const router = Router();
router.use(authenticateToken);

/**
 * GET /api/budgets
 * Retrieve budgets with calculated monthly actual spending
 */
router.get('/', (req, res) => {
    try {
        const budgets = db.prepare(`
            SELECT * FROM budgets WHERE user_id = ? ORDER BY monthly_limit DESC
        `).all(req.user.id);

        // Get current month prefix (YYYY-MM)
        const now = new Date();
        const currentMonthPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

        // Get spent amount per category for the current month
        const spending = db.prepare(`
            SELECT category, SUM(amount) as total_spent
            FROM transactions
            WHERE user_id = ? AND type = 'expense' AND date LIKE ?
            GROUP BY category
        `).all(req.user.id, `${currentMonthPrefix}%`);

        const spendMap = {};
        spending.forEach(s => {
            spendMap[s.category] = s.total_spent;
        });

        let totalBudgeted = 0;
        let totalSpent = 0;

        const enrichedBudgets = budgets.map(b => {
            const spent = spendMap[b.category] || 0.0;
            const remaining = Math.max(0, b.monthly_limit - spent);
            const percent = b.monthly_limit > 0 ? Math.min(100, Math.round((spent / b.monthly_limit) * 100)) : 0;
            const isOver = spent > b.monthly_limit;

            totalBudgeted += b.monthly_limit;
            totalSpent += spent;

            return {
                ...b,
                spent,
                remaining,
                percent,
                is_over: isOver
            };
        });

        return res.json({
            success: true,
            budgets: enrichedBudgets,
            summary: {
                totalBudgeted,
                totalSpent,
                remaining: Math.max(0, totalBudgeted - totalSpent),
                overallPercent: totalBudgeted > 0 ? Math.round((totalSpent / totalBudgeted) * 100) : 0,
                currentMonth: currentMonthPrefix
            }
        });
    } catch (err) {
        console.error('[Budgets GET Error]:', err);
        return res.status(500).json({ success: false, error: 'Failed to retrieve budgets.' });
    }
});

/**
 * POST /api/budgets
 * Add or update budget limit for a category
 */
router.post('/', (req, res) => {
    try {
        const { category, monthly_limit, period = 'monthly' } = req.body;

        if (!category || monthly_limit === undefined) {
            return res.status(400).json({ success: false, error: 'Category and monthly limit are required.' });
        }

        const limit = parseFloat(monthly_limit);
        if (isNaN(limit) || limit < 0) {
            return res.status(400).json({ success: false, error: 'Monthly limit must be a valid non-negative number.' });
        }

        const cleanCat = sanitizeString(category);
        const now = Date.now();

        // Upsert budget
        const existing = db.prepare('SELECT id FROM budgets WHERE user_id = ? AND category = ?').get(req.user.id, cleanCat);

        if (existing) {
            db.prepare(`
                UPDATE budgets 
                SET monthly_limit = ?, period = ?, updated_at = ?
                WHERE id = ?
            `).run(limit, period, now, existing.id);
        } else {
            const id = uuidv4();
            db.prepare(`
                INSERT INTO budgets (id, user_id, category, monthly_limit, period, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `).run(id, req.user.id, cleanCat, limit, period, now, now);
        }

        return res.json({
            success: true,
            message: 'Budget saved successfully.'
        });
    } catch (err) {
        console.error('[Budgets POST Error]:', err);
        return res.status(500).json({ success: false, error: 'Failed to save budget.' });
    }
});

/**
 * DELETE /api/budgets/:id
 * Delete budget
 */
router.delete('/:id', (req, res) => {
    try {
        const { id } = req.params;
        db.prepare('DELETE FROM budgets WHERE id = ? AND user_id = ?').run(id, req.user.id);
        return res.json({ success: true, message: 'Budget deleted.' });
    } catch (err) {
        console.error('[Budgets DELETE Error]:', err);
        return res.status(500).json({ success: false, error: 'Failed to delete budget.' });
    }
});

export default router;
