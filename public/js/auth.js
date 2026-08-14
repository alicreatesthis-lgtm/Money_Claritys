import { API, AuthStorage, showToast } from './api.js';

// Redirect if already authenticated
if (AuthStorage.isAuthenticated() && !window.location.search.includes('force=1')) {
    window.location.href = '/';
}

window.switchAuthTab = function(tabName) {
    const tabs = ['login', 'register', 'forgot', 'reset'];
    tabs.forEach(t => {
        const tabBtn = document.getElementById(`tab-${t}`);
        const form = document.getElementById(`${t}-form`);
        if (tabBtn) tabBtn.classList.remove('active');
        if (form) form.classList.remove('active');
    });

    const activeBtn = document.getElementById(`tab-${tabName}`);
    const activeForm = document.getElementById(`${tabName}-form`);
    if (activeBtn) activeBtn.classList.add('active');
    if (activeForm) activeForm.classList.add('active');
};

// Password Strength Meter
const regPasswordInput = document.getElementById('reg-password');
const strengthFill = document.getElementById('strength-fill');
const strengthText = document.getElementById('strength-text');

if (regPasswordInput && strengthFill && strengthText) {
    regPasswordInput.addEventListener('input', () => {
        const val = regPasswordInput.value;
        let score = 0;

        if (val.length >= 8) score++;
        if (/[A-Z]/.test(val)) score++;
        if (/[0-9]/.test(val)) score++;
        if (/[^A-Za-z0-9]/.test(val)) score++;

        if (val.length === 0) {
            strengthFill.style.width = '0%';
            strengthFill.style.backgroundColor = 'transparent';
            strengthText.textContent = 'Password strength: Empty';
            strengthText.style.color = 'var(--text-muted)';
        } else if (score <= 1) {
            strengthFill.style.width = '25%';
            strengthFill.style.backgroundColor = 'var(--accent-rose)';
            strengthText.textContent = 'Password strength: Weak (min 8 chars, add numbers & letters)';
            strengthText.style.color = 'var(--accent-rose)';
        } else if (score === 2) {
            strengthFill.style.width = '50%';
            strengthFill.style.backgroundColor = 'var(--accent-amber)';
            strengthText.textContent = 'Password strength: Fair';
            strengthText.style.color = 'var(--accent-amber)';
        } else if (score === 3) {
            strengthFill.style.width = '75%';
            strengthFill.style.backgroundColor = 'var(--accent-blue)';
            strengthText.textContent = 'Password strength: Good';
            strengthText.style.color = 'var(--accent-blue)';
        } else {
            strengthFill.style.width = '100%';
            strengthFill.style.backgroundColor = 'var(--accent-emerald)';
            strengthText.textContent = 'Password strength: Strong 💪';
            strengthText.style.color = 'var(--accent-emerald)';
        }
    });
}

// Quick Fill Demo
window.fillDemoCredentials = function() {
    document.getElementById('login-email').value = 'alex@claritycash.io';
    document.getElementById('login-password').value = 'Clarity123!';
};

// Login Form Submit Handler
const loginForm = document.getElementById('login-form');
if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('login-email').value.trim();
        const password = document.getElementById('login-password').value;
        const btn = document.getElementById('btn-login-submit');

        btn.disabled = true;
        btn.innerHTML = '<span>Verifying credentials...</span>';

        try {
            const res = await API.auth.login(email, password);
            showToast('Sign in successful! Redirecting...', 'success');
            setTimeout(() => {
                window.location.href = '/';
            }, 500);
        } catch (err) {
            showToast(err.message || 'Login failed', 'error');
            btn.disabled = false;
            btn.innerHTML = '<span>Sign In to Clarity Cash</span>';
        }
    });
}

// Register Form Submit Handler
const regForm = document.getElementById('register-form');
if (regForm) {
    regForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const full_name = document.getElementById('reg-fullname').value.trim();
        const email = document.getElementById('reg-email').value.trim();
        const password = document.getElementById('reg-password').value;
        const currency = document.getElementById('reg-currency').value;
        const btn = document.getElementById('btn-reg-submit');

        btn.disabled = true;
        btn.innerHTML = '<span>Creating secure account...</span>';

        try {
            const res = await API.auth.register(full_name, email, password, currency);
            showToast('Account created with real SQLite persistence! Redirecting...', 'success');
            setTimeout(() => {
                window.location.href = '/';
            }, 600);
        } catch (err) {
            showToast(err.message || 'Registration failed', 'error');
            btn.disabled = false;
            btn.innerHTML = '<span>Create Free Account</span>';
        }
    });
}

// Forgot Password Handler
let activeDemoResetToken = '';
const forgotForm = document.getElementById('forgot-form');
if (forgotForm) {
    forgotForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('forgot-email').value.trim();

        try {
            const res = await API.auth.forgotPassword(email);
            showToast(res.message, 'success');
            if (res.demo_reset_token) {
                activeDemoResetToken = res.demo_reset_token;
                document.getElementById('token-val').textContent = res.demo_reset_token;
                document.getElementById('reset-token-display').style.display = 'block';
            }
        } catch (err) {
            showToast(err.message || 'Request failed', 'error');
        }
    });
}

window.openResetWithToken = function() {
    window.switchAuthTab('reset');
    document.getElementById('reset-token-input').value = activeDemoResetToken;
};

// Reset Password Handler
const resetForm = document.getElementById('reset-form');
if (resetForm) {
    resetForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const reset_token = document.getElementById('reset-token-input').value.trim();
        const new_password = document.getElementById('reset-new-password').value;

        try {
            const res = await API.auth.resetPassword(reset_token, new_password);
            showToast(res.message, 'success');
            setTimeout(() => {
                window.switchAuthTab('login');
            }, 1000);
        } catch (err) {
            showToast(err.message || 'Password reset failed', 'error');
        }
    });
}
