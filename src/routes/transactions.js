import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../db/connection.js';
import { authenticateToken } from '../middleware/auth.js';
import { sanitizeString } from '../middleware/validate.js';

const router = Router();
router.use(authenticateToken);

/**
 * GET /api/transactions
 * Retrieve filtered list of transactions for the user
 */
router.get('/', (req, res) => {
    try {
        const {
            account_id,
            category,
            type,
            start_date,
            end_date,
            search,
            limit = 50,
            offset = 0
        } = req.query;

        let query = `
            SELECT t.*, a.name as account_name, a.color as account_color, a.type as account_type
            FROM transactions t
            LEFT JOIN accounts a ON t.account_id = a.id
            WHERE t.user_id = ?
        `;
        const params = [req.user.id];

        if (account_id) {
            query += ' AND t.account_id = ?';
            params.push(account_id);
        }

        if (category) {
            query += ' AND t.category = ?';
            params.push(category);
        }

        if (type) {
            query += ' AND t.type = ?';
            params.push(type);
        }

        if (start_date) {
            query += ' AND t.date >= ?';
            params.push(start_date);
        }

        if (end_date) {
            query += ' AND t.date <= ?';
            params.push(end_date);
        }

        if (search) {
            query += ' AND (t.payee LIKE ? OR t.notes LIKE ? OR t.category LIKE ?)';
            const term = `%${search}%`;
            params.push(term, term, term);
        }

        query += ' ORDER BY t.date DESC, t.created_at DESC LIMIT ? OFFSET ?';
        params.push(parseInt(limit, 10), parseInt(offset, 10));

        const transactions = db.prepare(query).all(...params);

        // Get total count for pagination
        let countQuery = 'SELECT COUNT(*) as total FROM transactions WHERE user_id = ?';
        const countParams = [req.user.id];
        if (account_id) {
            countQuery += ' AND account_id = ?';
            countParams.push(account_id);
        }
        if (category) {
            countQuery += ' AND category = ?';
            countParams.push(category);
        }
        if (type) {
            countQuery += ' AND type = ?';
            countParams.push(type);
        }
        const total = db.prepare(countQuery).get(...countParams).total;

        return res.json({
            success: true,
            transactions,
            pagination: {
                total,
                limit: parseInt(limit, 10),
                offset: parseInt(offset, 10)
            }
        });
    } catch (err) {
        console.error('[Transactions GET Error]:', err);
        return res.status(500).json({ success: false, error: 'Failed to retrieve transactions.' });
    }
});

/**
 * POST /api/transactions
 * Add a new transaction and update associated account balance atomically
 */
router.post('/', (req, res) => {
    try {
        const { account_id, type, amount, category, payee, date, notes = '', is_recurring = 0 } = req.body;

        if (!account_id || !type || amount === undefined || !category || !payee || !date) {
            return res.status(400).json({
                success: false,
                error: 'Please provide all required transaction fields: account, type, amount, category, payee, date.'
            });
        }

        const validTypes = ['income', 'expense', 'transfer'];
        if (!validTypes.includes(type)) {
            return res.status(400).json({ success: false, error: 'Invalid transaction type.' });
        }

        const numAmount = Math.abs(parseFloat(amount));
        if (isNaN(numAmount) || numAmount <= 0) {
            return res.status(400).json({ success: false, error: 'Amount must be a positive number.' });
        }

        // Verify account belongs to user
        const account = db.prepare('SELECT id, balance, type FROM accounts WHERE id = ? AND user_id = ?').get(account_id, req.user.id);
        if (!account) {
            return res.status(404).json({ success: false, error: 'Associated account not found.' });
        }

        const txId = uuidv4();
        const now = Date.now();

        const addTx = db.transaction(() => {
            // Insert transaction
            db.prepare(`
                INSERT INTO transactions (id, user_id, account_id, type, amount, category, payee, date, notes, is_recurring, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(
                txId,
                req.user.id,
                account_id,
                type,
                numAmount,
                sanitizeString(category),
                sanitizeString(payee),
                sanitizeString(date),
                sanitizeString(notes),
                is_recurring ? 1 : 0,
                now
            );

            // Adjust account balance
            // For checking/savings/cash: income increases balance (+), expense decreases balance (-)
            // For credit card: expense increases liability (+ or - depending on convention, standard: balance + expense)
            let balanceDelta = 0;
            if (account.type === 'credit_card') {
                balanceDelta = type === 'expense' ? numAmount : -numAmount;
            } else {
                balanceDelta = type === 'income' ? numAmount : -numAmount;
            }

            db.prepare(`
                UPDATE accounts 
                SET balance = balance + ?, updated_at = ?
                WHERE id = ? AND user_id = ?
            `).run(balanceDelta, now, account_id, req.user.id);
        });

        addTx();

        const createdTx = db.prepare(`
            SELECT t.*, a.name as account_name, a.color as account_color
            FROM transactions t
            LEFT JOIN accounts a ON t.account_id = a.id
            WHERE t.id = ?
        `).get(txId);

        return res.status(201).json({
            success: true,
            message: 'Transaction recorded successfully.',
            transaction: createdTx
        });
    } catch (err) {
        console.error('[Transactions POST Error]:', err);
        return res.status(500).json({ success: false, error: 'Failed to record transaction.' });
    }
});

/**
 * DELETE /api/transactions/:id
 * Delete transaction and reverse the account balance effect
 */
router.delete('/:id', (req, res) => {
    try {
        const { id } = req.params;

        const tx = db.prepare(`
            SELECT t.*, a.type as account_type
            FROM transactions t
            JOIN accounts a ON t.account_id = a.id
            WHERE t.id = ? AND t.user_id = ?
        `).get(id, req.user.id);

        if (!tx) {
            return res.status(404).json({ success: false, error: 'Transaction not found.' });
        }

        const deleteTx = db.transaction(() => {
            // Calculate reverse balance delta
            let reverseDelta = 0;
            if (tx.account_type === 'credit_card') {
                reverseDelta = tx.type === 'expense' ? -tx.amount : tx.amount;
            } else {
                reverseDelta = tx.type === 'income' ? -tx.amount : tx.amount;
            }

            db.prepare(`
                UPDATE accounts 
                SET balance = balance + ?, updated_at = ?
                WHERE id = ? AND user_id = ?
            `).run(reverseDelta, Date.now(), tx.account_id, req.user.id);

            db.prepare('DELETE FROM transactions WHERE id = ? AND user_id = ?').run(id, req.user.id);
        });

        deleteTx();

        return res.json({
            success: true,
            message: 'Transaction deleted and account balance updated.'
        });
    } catch (err) {
        console.error('[Transactions DELETE Error]:', err);
        return res.status(500).json({ success: false, error: 'Failed to delete transaction.' });
    }
});

/**
 * GET /api/transactions/export/csv
 * Export all user transactions as a CSV file
 */
router.get('/export/csv', (req, res) => {
    try {
        const transactions = db.prepare(`
            SELECT t.date, t.payee, t.category, t.type, t.amount, a.name as account_name, t.notes
            FROM transactions t
            LEFT JOIN accounts a ON t.account_id = a.id
            WHERE t.user_id = ?
            ORDER BY t.date DESC
        `).all(req.user.id);

        let csv = 'Date,Payee,Category,Type,Amount,Account,Notes\n';
        for (const row of transactions) {
            const cleanPayee = `"${(row.payee || '').replace(/"/g, '""')}"`;
            const cleanCat = `"${(row.category || '').replace(/"/g, '""')}"`;
            const cleanAcc = `"${(row.account_name || '').replace(/"/g, '""')}"`;
            const cleanNotes = `"${(row.notes || '').replace(/"/g, '""')}"`;
            csv += `${row.date},${cleanPayee},${cleanCat},${row.type},${row.amount},${cleanAcc},${cleanNotes}\n`;
        }

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="clarity_cash_transactions_${Date.now()}.csv"`);
        return res.send(csv);
    } catch (err) {
        console.error('[Export CSV Error]:', err);
        return res.status(500).json({ success: false, error: 'Failed to export CSV.' });
    }
});

export default router;
