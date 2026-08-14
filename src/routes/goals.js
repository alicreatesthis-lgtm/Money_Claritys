import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../db/connection.js';
import { authenticateToken } from '../middleware/auth.js';
import { sanitizeString } from '../middleware/validate.js';

const router = Router();
router.use(authenticateToken);

/**
 * GET /api/goals
 * Retrieve all savings goals for user
 */
router.get('/', (req, res) => {
    try {
        const goals = db.prepare(`
            SELECT * FROM goals WHERE user_id = ? ORDER BY created_at ASC
        `).all(req.user.id);

        const enrichedGoals = goals.map(g => {
            const percent = g.target_amount > 0 ? Math.min(100, Math.round((g.current_amount / g.target_amount) * 100)) : 0;
            const remaining = Math.max(0, g.target_amount - g.current_amount);
            return {
                ...g,
                percent,
                remaining
            };
        });

        return res.json({
            success: true,
            goals: enrichedGoals
        });
    } catch (err) {
        console.error('[Goals GET Error]:', err);
        return res.status(500).json({ success: false, error: 'Failed to retrieve goals.' });
    }
});

/**
 * POST /api/goals
 * Create a new savings goal
 */
router.post('/', (req, res) => {
    try {
        const { title, target_amount, current_amount = 0, target_date = '', color = '#10B981' } = req.body;

        if (!title || target_amount === undefined) {
            return res.status(400).json({ success: false, error: 'Goal title and target amount are required.' });
        }

        const numTarget = parseFloat(target_amount);
        const numCurrent = parseFloat(current_amount) || 0.0;

        if (isNaN(numTarget) || numTarget <= 0) {
            return res.status(400).json({ success: false, error: 'Target amount must be greater than zero.' });
        }

        const id = uuidv4();
        const now = Date.now();

        db.prepare(`
            INSERT INTO goals (id, user_id, title, target_amount, current_amount, target_date, color, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(id, req.user.id, sanitizeString(title), numTarget, numCurrent, sanitizeString(target_date), sanitizeString(color), now, now);

        const goal = db.prepare('SELECT * FROM goals WHERE id = ?').get(id);

        return res.status(201).json({
            success: true,
            message: 'Savings goal created.',
            goal
        });
    } catch (err) {
        console.error('[Goals POST Error]:', err);
        return res.status(500).json({ success: false, error: 'Failed to create goal.' });
    }
});

/**
 * PUT /api/goals/:id
 * Update savings goal or deposit funds
 */
router.put('/:id', (req, res) => {
    try {
        const { id } = req.params;
        const { title, target_amount, current_amount, target_date, color, deposit_amount } = req.body;

        const existing = db.prepare('SELECT * FROM goals WHERE id = ? AND user_id = ?').get(id, req.user.id);
        if (!existing) {
            return res.status(404).json({ success: false, error: 'Goal not found.' });
        }

        let newCurrent = current_amount !== undefined ? parseFloat(current_amount) : existing.current_amount;
        if (deposit_amount !== undefined) {
            newCurrent += parseFloat(deposit_amount) || 0;
        }

        const newTarget = target_amount !== undefined ? parseFloat(target_amount) : existing.target_amount;
        const newTitle = title ? sanitizeString(title) : existing.title;
        const newDate = target_date !== undefined ? sanitizeString(target_date) : existing.target_date;
        const newColor = color ? sanitizeString(color) : existing.color;
        const now = Date.now();

        db.prepare(`
            UPDATE goals 
            SET title = ?, target_amount = ?, current_amount = ?, target_date = ?, color = ?, updated_at = ?
            WHERE id = ? AND user_id = ?
        `).run(newTitle, newTarget, newCurrent, newDate, newColor, now, id, req.user.id);

        const updated = db.prepare('SELECT * FROM goals WHERE id = ?').get(id);

        return res.json({
            success: true,
            message: 'Savings goal updated.',
            goal: updated
        });
    } catch (err) {
        console.error('[Goals PUT Error]:', err);
        return res.status(500).json({ success: false, error: 'Failed to update goal.' });
    }
});

/**
 * DELETE /api/goals/:id
 * Delete savings goal
 */
router.delete('/:id', (req, res) => {
    try {
        const { id } = req.params;
        db.prepare('DELETE FROM goals WHERE id = ? AND user_id = ?').run(id, req.user.id);
        return res.json({ success: true, message: 'Goal deleted.' });
    } catch (err) {
        console.error('[Goals DELETE Error]:', err);
        return res.status(500).json({ success: false, error: 'Failed to delete goal.' });
    }
});

export default router;
