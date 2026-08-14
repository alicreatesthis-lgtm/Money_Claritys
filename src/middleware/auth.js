import jwt from 'jsonwebtoken';
import db from '../db/connection.js';

export function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({
            success: false,
            error: 'Authentication required. No access token provided.'
        });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback_secret_clarity_cash_key');
        
        // Fetch user from DB, excluding password hash
        const user = db.prepare(`
            SELECT id, email, full_name, currency, theme_preference, created_at, updated_at
            FROM users
            WHERE id = ?
        `).get(decoded.userId);

        if (!user) {
            return res.status(401).json({
                success: false,
                error: 'Invalid session. User account no longer exists.'
            });
        }

        req.user = user;
        next();
    } catch (err) {
        if (err.name === 'TokenExpiredError') {
            return res.status(401).json({
                success: false,
                error: 'Your session has expired. Please log in again.'
            });
        }
        return res.status(401).json({
            success: false,
            error: 'Invalid authentication token.'
        });
    }
}
