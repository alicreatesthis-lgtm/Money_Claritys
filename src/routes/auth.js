import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import db from '../db/connection.js';
import { authenticateToken } from '../middleware/auth.js';
import { authLimiter } from '../middleware/rateLimiter.js';
import { validateRegisterInput, validateLoginInput, validatePasswordStrength, sanitizeString } from '../middleware/validate.js';

const router = Router();
const SALT_ROUNDS = parseInt(process.env.BCRYPT_SALT_ROUNDS || '12', 10);
const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret_clarity_cash_key';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

// Generate Token helper
function generateToken(userId) {
    return jwt.sign({ userId }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

/**
 * POST /api/auth/register
 * Register a new user account with secure bcrypt password hashing
 */
router.post('/register', authLimiter, validateRegisterInput, async (req, res) => {
    try {
        const { email, password, full_name, currency = 'USD' } = req.body;

        // Check if user already exists
        const existingUser = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
        if (existingUser) {
            return res.status(409).json({
                success: false,
                error: 'An account with this email address already exists.'
            });
        }

        // Hash password securely with bcrypt
        const password_hash = await bcrypt.hash(password, SALT_ROUNDS);
        const userId = uuidv4();
        const now = Date.now();

        // Transaction to create user and starter accounts
        const createUserTx = db.transaction(() => {
            db.prepare(`
                INSERT INTO users (id, email, password_hash, full_name, currency, theme_preference, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, 'dark', ?, ?)
            `).run(userId, email, password_hash, full_name, currency, now, now);

            // Starter Accounts for immediate usability
            const checkingId = uuidv4();
            const savingsId = uuidv4();
            
            db.prepare(`
                INSERT INTO accounts (id, user_id, name, type, balance, currency, institution, mask, color, is_archived, created_at, updated_at)
                VALUES 
                (?, ?, 'Primary Checking', 'checking', 2500.00, ?, 'Chase Bank', '4821', '#3B82F6', 0, ?, ?),
                (?, ?, 'High-Yield Savings', 'savings', 10000.00, ?, 'Marcus by Goldman', '9103', '#10B981', 0, ?, ?)
            `).run(checkingId, userId, currency, now, now, savingsId, userId, currency, now, now);

            // Starter Budgets
            db.prepare(`
                INSERT INTO budgets (id, user_id, category, monthly_limit, period, created_at, updated_at)
                VALUES 
                (?, ?, 'Housing & Rent', 1500.00, 'monthly', ?, ?),
                (?, ?, 'Food & Dining', 600.00, 'monthly', ?, ?),
                (?, ?, 'Transportation', 300.00, 'monthly', ?, ?)
            `).run(uuidv4(), userId, now, now, uuidv4(), userId, now, now, uuidv4(), userId, now, now);

            // Starter Savings Goal
            db.prepare(`
                INSERT INTO goals (id, user_id, title, target_amount, current_amount, target_date, color, created_at, updated_at)
                VALUES (?, ?, 'Emergency Fund', 15000.00, 10000.00, '2026-12-31', '#10B981', ?, ?)
            `).run(uuidv4(), userId, now, now);
        });

        createUserTx();

        const token = generateToken(userId);

        return res.status(201).json({
            success: true,
            message: 'Registration successful! Welcome to Clarity Cash.',
            token,
            user: {
                id: userId,
                email,
                full_name,
                currency,
                theme_preference: 'dark',
                created_at: now
            }
        });
    } catch (err) {
        console.error('[Auth Register Error]:', err);
        return res.status(500).json({
            success: false,
            error: 'Failed to create user account. Please try again.'
        });
    }
});

/**
 * POST /api/auth/login
 * Authenticate user credentials and return JWT token
 */
router.post('/login', authLimiter, validateLoginInput, async (req, res) => {
    try {
        const { email, password } = req.body;

        const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
        if (!user) {
            return res.status(401).json({
                success: false,
                error: 'Invalid email or password. Please verify your credentials.'
            });
        }

        const isPasswordValid = await bcrypt.compare(password, user.password_hash);
        if (!isPasswordValid) {
            return res.status(401).json({
                success: false,
                error: 'Invalid email or password. Please verify your credentials.'
            });
        }

        const token = generateToken(user.id);

        // Sanitize user object to never leak password_hash or reset_token
        const sanitizedUser = {
            id: user.id,
            email: user.email,
            full_name: user.full_name,
            currency: user.currency,
            theme_preference: user.theme_preference,
            created_at: user.created_at,
            updated_at: user.updated_at
        };

        return res.json({
            success: true,
            message: 'Authentication successful.',
            token,
            user: sanitizedUser
        });
    } catch (err) {
        console.error('[Auth Login Error]:', err);
        return res.status(500).json({
            success: false,
            error: 'Authentication failed due to a server error.'
        });
    }
});

/**
 * GET /api/auth/me
 * Get current authenticated user details
 */
router.get('/me', authenticateToken, (req, res) => {
    return res.json({
        success: true,
        user: req.user
    });
});

/**
 * PUT /api/auth/profile
 * Update profile details (full_name, currency, theme_preference)
 */
router.put('/profile', authenticateToken, (req, res) => {
    try {
        const { full_name, currency, theme_preference } = req.body;
        const now = Date.now();

        const cleanName = full_name ? sanitizeString(full_name) : req.user.full_name;
        const cleanCurrency = currency ? sanitizeString(currency).toUpperCase() : req.user.currency;
        const cleanTheme = ['dark', 'light'].includes(theme_preference) ? theme_preference : req.user.theme_preference;

        db.prepare(`
            UPDATE users 
            SET full_name = ?, currency = ?, theme_preference = ?, updated_at = ?
            WHERE id = ?
        `).run(cleanName, cleanCurrency, cleanTheme, now, req.user.id);

        const updatedUser = db.prepare(`
            SELECT id, email, full_name, currency, theme_preference, created_at, updated_at
            FROM users WHERE id = ?
        `).get(req.user.id);

        return res.json({
            success: true,
            message: 'Profile updated successfully.',
            user: updatedUser
        });
    } catch (err) {
        console.error('[Auth Profile Update Error]:', err);
        return res.status(500).json({
            success: false,
            error: 'Failed to update profile.'
        });
    }
});

/**
 * PUT /api/auth/change-password
 * Change password with old password verification
 */
router.put('/change-password', authenticateToken, async (req, res) => {
    try {
        const { current_password, new_password } = req.body;

        if (!current_password || !new_password) {
            return res.status(400).json({
                success: false,
                error: 'Both current password and new password are required.'
            });
        }

        const user = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.user.id);
        const isMatch = await bcrypt.compare(current_password, user.password_hash);
        if (!isMatch) {
            return res.status(400).json({
                success: false,
                error: 'Current password provided is incorrect.'
            });
        }

        const passCheck = validatePasswordStrength(new_password);
        if (!passCheck.valid) {
            return res.status(400).json({
                success: false,
                error: passCheck.message
            });
        }

        const newHash = await bcrypt.hash(new_password, SALT_ROUNDS);
        db.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?')
            .run(newHash, Date.now(), req.user.id);

        return res.json({
            success: true,
            message: 'Password changed successfully.'
        });
    } catch (err) {
        console.error('[Auth Change Password Error]:', err);
        return res.status(500).json({
            success: false,
            error: 'Failed to change password.'
        });
    }
});

/**
 * POST /api/auth/forgot-password
 * Initiate secure password reset flow with token
 */
router.post('/forgot-password', authLimiter, (req, res) => {
    try {
        const { email } = req.body;
        if (!email) {
            return res.status(400).json({ success: false, error: 'Email is required.' });
        }

        const cleanEmail = email.trim().toLowerCase();
        const user = db.prepare('SELECT id, full_name FROM users WHERE email = ?').get(cleanEmail);

        if (!user) {
            // Return identical message to prevent user enumeration attacks
            return res.json({
                success: true,
                message: 'If an account exists with this email, a password reset link/token has been generated.'
            });
        }

        const resetToken = uuidv4();
        const expiresAt = Date.now() + (3600 * 1000); // 1 hour validity

        db.prepare('UPDATE users SET reset_token = ?, reset_token_expires_at = ? WHERE id = ?')
            .run(resetToken, expiresAt, user.id);

        return res.json({
            success: true,
            message: 'If an account exists with this email, a password reset link/token has been generated.',
            demo_reset_token: resetToken // Provided for straightforward demonstration & testing
        });
    } catch (err) {
        console.error('[Forgot Password Error]:', err);
        return res.status(500).json({ success: false, error: 'Failed to process password reset.' });
    }
});

/**
 * POST /api/auth/reset-password
 * Complete password reset with valid token
 */
router.post('/reset-password', authLimiter, async (req, res) => {
    try {
        const { reset_token, new_password } = req.body;

        if (!reset_token || !new_password) {
            return res.status(400).json({
                success: false,
                error: 'Reset token and new password are required.'
            });
        }

        const passCheck = validatePasswordStrength(new_password);
        if (!passCheck.valid) {
            return res.status(400).json({
                success: false,
                error: passCheck.message
            });
        }

        const user = db.prepare(`
            SELECT id, reset_token_expires_at 
            FROM users 
            WHERE reset_token = ?
        `).get(reset_token);

        if (!user) {
            return res.status(400).json({
                success: false,
                error: 'Invalid or expired password reset token.'
            });
        }

        if (user.reset_token_expires_at < Date.now()) {
            return res.status(400).json({
                success: false,
                error: 'This password reset token has expired. Please request a new one.'
            });
        }

        const newHash = await bcrypt.hash(new_password, SALT_ROUNDS);

        db.prepare(`
            UPDATE users 
            SET password_hash = ?, reset_token = NULL, reset_token_expires_at = NULL, updated_at = ?
            WHERE id = ?
        `).run(newHash, Date.now(), user.id);

        return res.json({
            success: true,
            message: 'Your password has been successfully reset. You can now log in.'
        });
    } catch (err) {
        console.error('[Reset Password Error]:', err);
        return res.status(500).json({
            success: false,
            error: 'Failed to reset password.'
        });
    }
});

export default router;
