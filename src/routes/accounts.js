import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../db/connection.js';
import { authenticateToken } from '../middleware/auth.js';
import { sanitizeString } from '../middleware/validate.js';

const router = Router();
router.use(authenticateToken);

/**
 * GET /api/accounts
 * Retrieve all accounts for the authenticated user
 */
router.get('/', (req, res) => {
    try {
        const accounts = db.prepare(`
            SELECT * FROM accounts 
            WHERE user_id = ? AND is_archived = 0
            ORDER BY created_at ASC
        `).all(req.user.id);

        // Calculate Totals: Net Worth = Assets (checking, savings, investment, cash) - Liabilities (credit_card)
        let totalAssets = 0;
        let totalLiabilities = 0;

        accounts.forEach(acc => {
            if (acc.type === 'credit_card') {
                totalLiabilities += Math.abs(acc.balance);
            } else {
                totalAssets += acc.balance;
            }
        });

        const netWorth = totalAssets - totalLiabilities;

        return res.json({
            success: true,
            accounts,
            summary: {
                totalAssets,
                totalLiabilities,
                netWorth,
                currency: req.user.currency || 'USD'
            }
        });
    } catch (err) {
        console.error('[Accounts GET Error]:', err);
        return res.status(500).json({ success: false, error: 'Failed to retrieve accounts.' });
    }
});

/**
 * POST /api/accounts
 * Create a new account
 */
router.post('/', (req, res) => {
    try {
        const { name, type, balance = 0, institution = '', mask = '', color = '#3B82F6' } = req.body;

        if (!name || typeof name !== 'string' || name.trim().length === 0) {
            return res.status(400).json({ success: false, error: 'Account name is required.' });
        }

        const validTypes = ['checking', 'savings', 'credit_card', 'investment', 'cash', 'other'];
        if (!validTypes.includes(type)) {
            return res.status(400).json({ success: false, error: `Invalid account type. Must be one of: ${validTypes.join(', ')}` });
        }

        const numBalance = parseFloat(balance) || 0.0;
        const now = Date.now();
        const accountId = uuidv4();

        db.prepare(`
            INSERT INTO accounts (id, user_id, name, type, balance, currency, institution, mask, color, is_archived, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
        `).run(
            accountId,
            req.user.id,
            sanitizeString(name),
            type,
            numBalance,
            req.user.currency || 'USD',
            sanitizeString(institution),
            sanitizeString(mask || '••••'),
            sanitizeString(color),
            now,
            now
        );

        const newAccount = db.prepare('SELECT * FROM accounts WHERE id = ?').get(accountId);

        return res.status(201).json({
            success: true,
            message: 'Account created successfully.',
            account: newAccount
        });
    } catch (err) {
        console.error('[Accounts POST Error]:', err);
        return res.status(500).json({ success: false, error: 'Failed to create account.' });
    }
});

/**
 * PUT /api/accounts/:id
 * Update account details
 */
router.put('/:id', (req, res) => {
    try {
        const { id } = req.params;
        const { name, type, balance, institution, mask, color } = req.body;

        const existing = db.prepare('SELECT * FROM accounts WHERE id = ? AND user_id = ?').get(id, req.user.id);
        if (!existing) {
            return res.status(404).json({ success: false, error: 'Account not found.' });
        }

        const validTypes = ['checking', 'savings', 'credit_card', 'investment', 'cash', 'other'];
        const updateType = validTypes.includes(type) ? type : existing.type;
        const updateName = name ? sanitizeString(name) : existing.name;
        const updateBalance = balance !== undefined ? parseFloat(balance) : existing.balance;
        const updateInst = institution !== undefined ? sanitizeString(institution) : existing.institution;
        const updateMask = mask !== undefined ? sanitizeString(mask) : existing.mask;
        const updateColor = color !== undefined ? sanitizeString(color) : existing.color;
        const now = Date.now();

        db.prepare(`
            UPDATE accounts 
            SET name = ?, type = ?, balance = ?, institution = ?, mask = ?, color = ?, updated_at = ?
            WHERE id = ? AND user_id = ?
        `).run(updateName, updateType, updateBalance, updateInst, updateMask, updateColor, now, id, req.user.id);

        const updated = db.prepare('SELECT * FROM accounts WHERE id = ?').get(id);

        return res.json({
            success: true,
            message: 'Account updated successfully.',
            account: updated
        });
    } catch (err) {
        console.error('[Accounts PUT Error]:', err);
        return res.status(500).json({ success: false, error: 'Failed to update account.' });
    }
});

/**
 * DELETE /api/accounts/:id
 * Delete account
 */
router.delete('/:id', (req, res) => {
    try {
        const { id } = req.params;

        const existing = db.prepare('SELECT id FROM accounts WHERE id = ? AND user_id = ?').get(id, req.user.id);
        if (!existing) {
            return res.status(404).json({ success: false, error: 'Account not found.' });
        }

        db.prepare('DELETE FROM accounts WHERE id = ? AND user_id = ?').run(id, req.user.id);

        return res.json({
            success: true,
            message: 'Account and associated records removed successfully.'
        });
    } catch (err) {
        console.error('[Accounts DELETE Error]:', err);
        return res.status(500).json({ success: false, error: 'Failed to delete account.' });
    }
});

export default router;
