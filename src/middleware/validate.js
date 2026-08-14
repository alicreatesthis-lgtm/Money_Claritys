// Input Validation and Sanitization Middleware

export function sanitizeString(val) {
    if (typeof val !== 'string') return '';
    return val.trim().replace(/[<>]/g, ''); // Basic anti-XSS strip
}

export function validateEmail(email) {
    if (!email || typeof email !== 'string') return false;
    const re = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    return re.test(email.trim().toLowerCase());
}

export function validatePasswordStrength(password) {
    if (!password || typeof password !== 'string') {
        return { valid: false, message: 'Password is required.' };
    }
    if (password.length < 8) {
        return { valid: false, message: 'Password must be at least 8 characters long.' };
    }
    if (!/[A-Za-z]/.test(password)) {
        return { valid: false, message: 'Password must contain at least one letter.' };
    }
    if (!/[0-9]/.test(password)) {
        return { valid: false, message: 'Password must contain at least one number.' };
    }
    return { valid: true };
}

export function validateRegisterInput(req, res, next) {
    const { email, password, full_name } = req.body;

    if (!full_name || typeof full_name !== 'string' || full_name.trim().length < 2) {
        return res.status(400).json({
            success: false,
            error: 'Full name is required (at least 2 characters).'
        });
    }

    if (!validateEmail(email)) {
        return res.status(400).json({
            success: false,
            error: 'Please provide a valid email address.'
        });
    }

    const passCheck = validatePasswordStrength(password);
    if (!passCheck.valid) {
        return res.status(400).json({
            success: false,
            error: passCheck.message
        });
    }

    req.body.email = email.trim().toLowerCase();
    req.body.full_name = sanitizeString(full_name);
    next();
}

export function validateLoginInput(req, res, next) {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({
            success: false,
            error: 'Email and password are required.'
        });
    }

    if (!validateEmail(email)) {
        return res.status(400).json({
            success: false,
            error: 'Please provide a valid email address.'
        });
    }

    req.body.email = email.trim().toLowerCase();
    next();
}
