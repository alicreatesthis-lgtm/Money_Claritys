// Clarity Cash - Client API Interface & Token Management

const API_BASE = '/api';

export const AuthStorage = {
    getToken() {
        return localStorage.getItem('clarity_token');
    },
    setToken(token) {
        localStorage.setItem('clarity_token', token);
    },
    getUser() {
        try {
            return JSON.parse(localStorage.getItem('clarity_user') || 'null');
        } catch {
            return null;
        }
    },
    setUser(user) {
        localStorage.setItem('clarity_user', JSON.stringify(user));
    },
    clear() {
        localStorage.removeItem('clarity_token');
        localStorage.removeItem('clarity_user');
    },
    isAuthenticated() {
        return !!this.getToken();
    }
};

export async function apiRequest(endpoint, options = {}) {
    const url = `${API_BASE}${endpoint}`;
    const headers = {
        'Content-Type': 'application/json',
        ...(options.headers || {})
    };

    const token = AuthStorage.getToken();
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    try {
        const res = await fetch(url, {
            ...options,
            headers
        });

        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
            if (res.status === 401) {
                // If not already on auth page, redirect
                if (!window.location.pathname.includes('auth') && !window.location.pathname.includes('login')) {
                    AuthStorage.clear();
                    window.location.href = '/login';
                }
            }
            throw new Error(data.error || `Request failed with status ${res.status}`);
        }

        return data;
    } catch (err) {
        throw err;
    }
}

// API Resource Endpoints
export const API = {
    auth: {
        async login(email, password) {
            const data = await apiRequest('/auth/login', {
                method: 'POST',
                body: JSON.stringify({ email, password })
            });
            if (data.token) {
                AuthStorage.setToken(data.token);
                AuthStorage.setUser(data.user);
            }
            return data;
        },
        async register(full_name, email, password, currency = 'USD') {
            const data = await apiRequest('/auth/register', {
                method: 'POST',
                body: JSON.stringify({ full_name, email, password, currency })
            });
            if (data.token) {
                AuthStorage.setToken(data.token);
                AuthStorage.setUser(data.user);
            }
            return data;
        },
        async me() {
            const data = await apiRequest('/auth/me');
            if (data.user) {
                AuthStorage.setUser(data.user);
            }
            return data;
        },
        async updateProfile(updates) {
            const data = await apiRequest('/auth/profile', {
                method: 'PUT',
                body: JSON.stringify(updates)
            });
            if (data.user) {
                AuthStorage.setUser(data.user);
            }
            return data;
        },
        async changePassword(current_password, new_password) {
            return apiRequest('/auth/change-password', {
                method: 'PUT',
                body: JSON.stringify({ current_password, new_password })
            });
        },
        async forgotPassword(email) {
            return apiRequest('/auth/forgot-password', {
                method: 'POST',
                body: JSON.stringify({ email })
            });
        },
        async resetPassword(reset_token, new_password) {
            return apiRequest('/auth/reset-password', {
                method: 'POST',
                body: JSON.stringify({ reset_token, new_password })
            });
        },
        logout() {
            AuthStorage.clear();
            window.location.href = '/login';
        }
    },
    accounts: {
        getAll() {
            return apiRequest('/accounts');
        },
        create(account) {
            return apiRequest('/accounts', {
                method: 'POST',
                body: JSON.stringify(account)
            });
        },
        update(id, updates) {
            return apiRequest(`/accounts/${id}`, {
                method: 'PUT',
                body: JSON.stringify(updates)
            });
        },
        delete(id) {
            return apiRequest(`/accounts/${id}`, {
                method: 'DELETE'
            });
        }
    },
    transactions: {
        getAll(params = {}) {
            const qs = new URLSearchParams(params).toString();
            return apiRequest(`/transactions${qs ? `?${qs}` : ''}`);
        },
        create(tx) {
            return apiRequest('/transactions', {
                method: 'POST',
                body: JSON.stringify(tx)
            });
        },
        delete(id) {
            return apiRequest(`/transactions/${id}`, {
                method: 'DELETE'
            });
        },
        getExportUrl() {
            const token = AuthStorage.getToken();
            return `/api/transactions/export/csv?token=${token}`;
        }
    },
    budgets: {
        getAll() {
            return apiRequest('/budgets');
        },
        save(budget) {
            return apiRequest('/budgets', {
                method: 'POST',
                body: JSON.stringify(budget)
            });
        },
        delete(id) {
            return apiRequest(`/budgets/${id}`, {
                method: 'DELETE'
            });
        }
    },
    goals: {
        getAll() {
            return apiRequest('/goals');
        },
        create(goal) {
            return apiRequest('/goals', {
                method: 'POST',
                body: JSON.stringify(goal)
            });
        },
        update(id, updates) {
            return apiRequest(`/goals/${id}`, {
                method: 'PUT',
                body: JSON.stringify(updates)
            });
        },
        delete(id) {
            return apiRequest(`/goals/${id}`, {
                method: 'DELETE'
            });
        }
    },
    analytics: {
        getDashboard() {
            return apiRequest('/analytics/dashboard');
        }
    }
};

// UI Toast helper
export function showToast(message, type = 'info') {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    let icon = 'ℹ️';
    if (type === 'success') icon = '✅';
    if (type === 'error') icon = '⚠️';

    toast.innerHTML = `<span>${icon}</span> <span>${message}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(50px)';
        toast.style.transition = 'all 0.3s';
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}
