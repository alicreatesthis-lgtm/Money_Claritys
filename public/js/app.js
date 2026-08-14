import { API, AuthStorage, showToast } from './api.js';

// Global App State
let currentUser = null;
let userAccounts = [];
let cashFlowChart = null;
let categoryDonutChart = null;
let analyticsBarChart = null;
let analyticsPieChart = null;

// Format Currency Utility
function formatCurrency(amount, currency = null) {
    const cur = currency || (currentUser && currentUser.currency) || 'USD';
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: cur,
        minimumFractionDigits: 2
    }).format(amount);
}

// Format Date Utility
function formatDate(dateStr) {
    if (!dateStr) return '';
    const parts = dateStr.split('-');
    if (parts.length === 3) {
        const d = new Date(parts[0], parts[1] - 1, parts[2]);
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    }
    return dateStr;
}

// Navigation & View Routing
window.switchView = function(viewName) {
    const sections = document.querySelectorAll('.view-section');
    sections.forEach(s => s.classList.remove('active'));

    const activeSec = document.getElementById(`view-${viewName}`);
    if (activeSec) {
        activeSec.classList.add('active');
    }

    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(n => {
        if (n.getAttribute('data-view') === viewName) {
            n.classList.add('active');
        } else {
            n.classList.remove('active');
        }
    });

    const titles = {
        overview: 'Financial Overview',
        accounts: 'Financial Accounts & Balances',
        transactions: 'Transactions & Ledger',
        budgets: 'Monthly Category Budgets',
        goals: 'Savings Goals & Milestones',
        analytics: 'Cash Flow & Analytics',
        settings: 'Settings & Security Center'
    };

    const titleEl = document.getElementById('current-view-title');
    if (titleEl) {
        titleEl.textContent = titles[viewName] || 'Dashboard';
    }

    // Refresh view data
    if (viewName === 'overview') loadOverviewData();
    if (viewName === 'accounts') loadAccountsData();
    if (viewName === 'transactions') loadTransactionsData();
    if (viewName === 'budgets') loadBudgetsData();
    if (viewName === 'goals') loadGoalsData();
    if (viewName === 'analytics') loadAnalyticsData();
    if (viewName === 'settings') loadSettingsData();
};

// Modal Controllers
window.openModal = function(id) {
    const el = document.getElementById(id);
    if (el) el.classList.add('active');
};

window.closeModal = function(id) {
    const el = document.getElementById(id);
    if (el) el.classList.remove('active');
};

window.openTransactionModal = function() {
    populateAccountSelect('tx-modal-account');
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('tx-modal-date').value = today;
    window.openModal('modal-transaction');
};

window.openAccountModal = function() {
    window.openModal('modal-account');
};

window.openBudgetModal = function() {
    window.openModal('modal-budget');
};

window.openGoalModal = function() {
    window.openModal('modal-goal');
};

window.openDepositModal = function(goalId, goalTitle) {
    document.getElementById('deposit-goal-id').value = goalId;
    document.getElementById('deposit-goal-title').textContent = `Deposit into ${goalTitle}`;
    window.openModal('modal-deposit');
};

window.handleLogout = function() {
    API.auth.logout();
};

// Helper: Populate Accounts dropdown in forms
function populateAccountSelect(selectId) {
    const el = document.getElementById(selectId);
    if (!el) return;
    el.innerHTML = '';
    userAccounts.forEach(acc => {
        const opt = document.createElement('option');
        opt.value = acc.id;
        opt.textContent = `${acc.name} (${formatCurrency(acc.balance)})`;
        el.appendChild(opt);
    });
}

// ----------------------------------------------------
// 1. OVERVIEW DATA LOADER
// ----------------------------------------------------
async function loadOverviewData() {
    try {
        const [dashRes, accRes, goalsRes] = await Promise.all([
            API.analytics.getDashboard(),
            API.accounts.getAll(),
            API.goals.getAll()
        ]);

        const a = dashRes.analytics;
        userAccounts = accRes.accounts || [];

        // Update Stat Cards
        document.getElementById('stat-net-worth').textContent = formatCurrency(a.netWorth);
        document.getElementById('stat-income').textContent = formatCurrency(a.monthlyIncome);
        document.getElementById('stat-expense').textContent = formatCurrency(a.monthlyExpense);
        document.getElementById('stat-savings-rate').textContent = `${a.savingsRate}%`;

        // Render Cash Flow Chart
        renderCashFlowChart(a.monthlyTrends);

        // Render Donut Chart
        renderCategoryDonut(a.categorySpending);

        // Render Recent Transactions
        renderRecentTransactionsTable(a.recentTransactions);

        // Render Overview Goals
        renderOverviewGoals(goalsRes.goals || []);

    } catch (err) {
        showToast(err.message, 'error');
    }
}

function renderCashFlowChart(trends) {
    const ctx = document.getElementById('chart-cashflow')?.getContext('2d');
    if (!ctx) return;

    if (cashFlowChart) cashFlowChart.destroy();

    const labels = trends.map(t => t.month);
    const incomeData = trends.map(t => t.income);
    const expenseData = trends.map(t => t.expense);

    cashFlowChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels,
            datasets: [
                {
                    label: 'Income',
                    data: incomeData,
                    backgroundColor: 'rgba(16, 185, 129, 0.75)',
                    borderRadius: 6
                },
                {
                    label: 'Expenses',
                    data: expenseData,
                    backgroundColor: 'rgba(244, 63, 94, 0.75)',
                    borderRadius: 6
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    labels: { color: '#94A3B8', font: { family: 'Plus Jakarta Sans', size: 12 } }
                }
            },
            scales: {
                x: {
                    grid: { color: 'rgba(255, 255, 255, 0.05)' },
                    ticks: { color: '#64748B' }
                },
                y: {
                    grid: { color: 'rgba(255, 255, 255, 0.05)' },
                    ticks: {
                        color: '#64748B',
                        callback: (val) => `$${val}`
                    }
                }
            }
        }
    });
}

function renderCategoryDonut(categories) {
    const ctx = document.getElementById('chart-category-donut')?.getContext('2d');
    if (!ctx) return;

    if (categoryDonutChart) categoryDonutChart.destroy();

    if (!categories || categories.length === 0) {
        categories = [{ category: 'No expenses yet', total: 1 }];
    }

    const labels = categories.map(c => c.category);
    const data = categories.map(c => c.total);
    const colors = ['#3B82F6', '#10B981', '#F59E0B', '#8B5CF6', '#EC4899', '#06B6D4', '#64748B'];

    categoryDonutChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels,
            datasets: [{
                data,
                backgroundColor: colors.slice(0, categories.length),
                borderWidth: 2,
                borderColor: '#0D1322'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: { color: '#94A3B8', font: { size: 11 } }
                }
            },
            cutout: '70%'
        }
    });
}

function renderRecentTransactionsTable(transactions) {
    const tbody = document.getElementById('overview-recent-tx-body');
    if (!tbody) return;

    if (!transactions || transactions.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:var(--text-muted); padding:24px;">No transactions recorded yet. Click "+ Add Transaction" to start!</td></tr>`;
        return;
    }

    tbody.innerHTML = transactions.map(tx => {
        const sign = tx.type === 'income' ? '+' : '-';
        const cssClass = tx.type;
        return `
            <tr>
                <td>${formatDate(tx.date)}</td>
                <td style="font-weight:600;">${tx.payee}</td>
                <td><span class="cat-badge">${tx.category}</span></td>
                <td><span class="badge-pill">${tx.account_name || 'Account'}</span></td>
                <td style="text-align:right;" class="tx-amount ${cssClass}">${sign}${formatCurrency(tx.amount)}</td>
            </tr>
        `;
    }).join('');
}

function renderOverviewGoals(goals) {
    const container = document.getElementById('overview-goals-list');
    if (!container) return;

    if (!goals || goals.length === 0) {
        container.innerHTML = `<div style="text-align:center; color:var(--text-muted); padding:20px;">No goals created yet.</div>`;
        return;
    }

    container.innerHTML = goals.slice(0, 3).map(g => `
        <div style="background:rgba(255,255,255,0.02); border:1px solid var(--border-subtle); padding:14px; border-radius:10px;">
            <div style="display:flex; justify-content:space-between; margin-bottom:6px;">
                <span style="font-weight:600; font-size:0.9rem;">${g.title}</span>
                <span style="font-weight:700; color:var(--accent-emerald); font-size:0.85rem;">${g.percent}%</span>
            </div>
            <div class="progress-bar-bg" style="height:6px; margin-bottom:6px;">
                <div class="progress-bar-fill" style="width:${g.percent}%; background:var(--accent-emerald);"></div>
            </div>
            <div style="display:flex; justify-content:space-between; font-size:0.75rem; color:var(--text-muted);">
                <span>Saved: ${formatCurrency(g.current_amount)}</span>
                <span>Target: ${formatCurrency(g.target_amount)}</span>
            </div>
        </div>
    `).join('');
}

// ----------------------------------------------------
// 2. ACCOUNTS DATA LOADER
// ----------------------------------------------------
async function loadAccountsData() {
    try {
        const res = await API.accounts.getAll();
        userAccounts = res.accounts || [];

        document.getElementById('acc-total-assets').textContent = formatCurrency(res.summary.totalAssets);
        document.getElementById('acc-total-liabilities').textContent = formatCurrency(res.summary.totalLiabilities);
        document.getElementById('acc-net-worth').textContent = formatCurrency(res.summary.netWorth);

        const container = document.getElementById('accounts-grid-container');
        if (!container) return;

        if (userAccounts.length === 0) {
            container.innerHTML = `<div style="grid-column: 1/-1; text-align:center; padding:40px; color:var(--text-muted);">No accounts found. Click "+ Add New Account" to add your first balance.</div>`;
            return;
        }

        container.innerHTML = userAccounts.map(acc => {
            const isLiab = acc.type === 'credit_card';
            const icon = acc.type === 'savings' ? '🏦' : acc.type === 'credit_card' ? '💳' : acc.type === 'investment' ? '📈' : '💵';
            const typeLabel = acc.type.replace('_', ' ').toUpperCase();

            return `
                <div class="account-card">
                    <div class="account-card-header">
                        <div style="display:flex; gap:12px; align-items:center;">
                            <div class="account-type-icon" style="background:${acc.color}20; color:${acc.color};">
                                ${icon}
                            </div>
                            <div>
                                <h4 style="font-size:1.05rem; font-weight:700;">${acc.name}</h4>
                                <div style="font-size:0.75rem; color:var(--text-muted);">${acc.institution || 'Standard'} •••• ${acc.mask || '****'}</div>
                            </div>
                        </div>
                        <span class="badge-pill" style="font-size:0.7rem;">${typeLabel}</span>
                    </div>

                    <div class="account-balance" style="color: ${isLiab ? 'var(--accent-rose)' : '#FFFFFF'}">
                        ${formatCurrency(acc.balance)}
                    </div>

                    <div class="account-meta">
                        <span>Currency: ${acc.currency}</span>
                        <button class="btn btn-danger btn-sm" onclick="handleDeleteAccount('${acc.id}')">Delete</button>
                    </div>
                </div>
            `;
        }).join('');

    } catch (err) {
        showToast(err.message, 'error');
    }
}

window.handleDeleteAccount = async function(id) {
    if (!confirm('Are you sure you want to remove this account? This will also remove its associated transactions.')) return;
    try {
        await API.accounts.delete(id);
        showToast('Account removed.', 'success');
        loadAccountsData();
    } catch (err) {
        showToast(err.message, 'error');
    }
};

// ----------------------------------------------------
// 3. TRANSACTIONS DATA LOADER
// ----------------------------------------------------
async function loadTransactionsData() {
    try {
        const search = document.getElementById('tx-search-input')?.value || '';
        const account_id = document.getElementById('tx-filter-account')?.value || '';
        const type = document.getElementById('tx-filter-type')?.value || '';
        const category = document.getElementById('tx-filter-category')?.value || '';

        // Also ensure accounts select has values
        const accSelect = document.getElementById('tx-filter-account');
        if (accSelect && accSelect.children.length <= 1) {
            userAccounts.forEach(acc => {
                const opt = document.createElement('option');
                opt.value = acc.id;
                opt.textContent = acc.name;
                accSelect.appendChild(opt);
            });
        }

        const res = await API.transactions.getAll({ search, account_id, type, category, limit: 100 });
        const txs = res.transactions || [];

        const tbody = document.getElementById('transactions-table-body');
        if (!tbody) return;

        if (txs.length === 0) {
            tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; color:var(--text-muted); padding:30px;">No transactions matching filter criteria.</td></tr>`;
            return;
        }

        tbody.innerHTML = txs.map(t => {
            const sign = t.type === 'income' ? '+' : '-';
            return `
                <tr>
                    <td>${formatDate(t.date)}</td>
                    <td>
                        <div style="font-weight:600;">${t.payee}</div>
                        ${t.notes ? `<div style="font-size:0.74rem; color:var(--text-muted);">${t.notes}</div>` : ''}
                    </td>
                    <td><span class="cat-badge">${t.category}</span></td>
                    <td><span class="badge-pill">${t.account_name || 'General Account'}</span></td>
                    <td><span class="badge-pill" style="text-transform:capitalize;">${t.type}</span></td>
                    <td style="text-align:right;" class="tx-amount ${t.type}">${sign}${formatCurrency(t.amount)}</td>
                    <td style="text-align:center;">
                        <button class="btn btn-danger btn-sm" onclick="handleDeleteTransaction('${t.id}')">✕</button>
                    </td>
                </tr>
            `;
        }).join('');

    } catch (err) {
        showToast(err.message, 'error');
    }
}

window.handleDeleteTransaction = async function(id) {
    if (!confirm('Are you sure you want to delete this transaction? Account balance will be restored automatically.')) return;
    try {
        await API.transactions.delete(id);
        showToast('Transaction removed & balance adjusted.', 'success');
        loadTransactionsData();
    } catch (err) {
        showToast(err.message, 'error');
    }
};

window.resetTxFilters = function() {
    document.getElementById('tx-search-input').value = '';
    document.getElementById('tx-filter-account').value = '';
    document.getElementById('tx-filter-type').value = '';
    document.getElementById('tx-filter-category').value = '';
    loadTransactionsData();
};

// ----------------------------------------------------
// 4. BUDGETS DATA LOADER
// ----------------------------------------------------
async function loadBudgetsData() {
    try {
        const res = await API.budgets.getAll();
        const budgets = res.budgets || [];
        const summary = res.summary || {};

        document.getElementById('budget-total-limit').textContent = formatCurrency(summary.totalBudgeted || 0);
        document.getElementById('budget-total-spent').textContent = formatCurrency(summary.totalSpent || 0);
        document.getElementById('budget-total-remaining').textContent = formatCurrency(summary.remaining || 0);

        const container = document.getElementById('budget-cards-container');
        if (!container) return;

        if (budgets.length === 0) {
            container.innerHTML = `<div style="text-align:center; padding:40px; color:var(--text-muted);">No monthly category budgets set yet. Click "+ Create Category Budget" to begin.</div>`;
            return;
        }

        container.innerHTML = budgets.map(b => {
            const barColor = b.is_over ? 'var(--accent-rose)' : b.percent > 80 ? 'var(--accent-amber)' : 'var(--accent-emerald)';
            return `
                <div class="budget-card">
                    <div class="budget-info">
                        <div>
                            <h4 style="font-size:1.1rem; font-weight:700;">${b.category}</h4>
                            <div style="font-size:0.8rem; color:var(--text-muted); margin-top:2px;">
                                Spent ${formatCurrency(b.spent)} of ${formatCurrency(b.monthly_limit)} monthly limit
                            </div>
                        </div>
                        <div style="text-align:right;">
                            <span class="badge-pill" style="color:${barColor}; border-color:${barColor}; font-weight:700; font-size:0.85rem;">
                                ${b.percent}% ${b.is_over ? 'OVER BUDGET' : 'used'}
                            </span>
                            <button class="btn btn-danger btn-sm" style="margin-left:12px;" onclick="handleDeleteBudget('${b.id}')">Delete</button>
                        </div>
                    </div>

                    <div class="progress-bar-bg">
                        <div class="progress-bar-fill" style="width:${Math.min(100, b.percent)}%; background:${barColor};"></div>
                    </div>

                    <div style="display:flex; justify-content:space-between; font-size:0.78rem; color:var(--text-muted); margin-top:8px;">
                        <span>Remaining: ${formatCurrency(b.remaining)}</span>
                        <span>Period: Monthly</span>
                    </div>
                </div>
            `;
        }).join('');

    } catch (err) {
        showToast(err.message, 'error');
    }
}

window.handleDeleteBudget = async function(id) {
    if (!confirm('Are you sure you want to delete this budget category?')) return;
    try {
        await API.budgets.delete(id);
        showToast('Budget category deleted.', 'success');
        loadBudgetsData();
    } catch (err) {
        showToast(err.message, 'error');
    }
};

// ----------------------------------------------------
// 5. SAVINGS GOALS DATA LOADER
// ----------------------------------------------------
async function loadGoalsData() {
    try {
        const res = await API.goals.getAll();
        const goals = res.goals || [];

        const container = document.getElementById('goals-grid-container');
        if (!container) return;

        if (goals.length === 0) {
            container.innerHTML = `<div style="grid-column: 1/-1; text-align:center; padding:40px; color:var(--text-muted);">No savings goals created yet. Click "+ Create Savings Goal" to set a milestone!</div>`;
            return;
        }

        container.innerHTML = goals.map(g => `
            <div class="goal-card">
                <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                    <div>
                        <h4 style="font-size:1.15rem; font-weight:700;">${g.title}</h4>
                        <div style="font-size:0.78rem; color:var(--text-muted); margin-top:2px;">
                            Target: ${g.target_date ? formatDate(g.target_date) : 'No deadline'}
                        </div>
                    </div>
                    <span class="badge-pill" style="color:var(--accent-emerald); font-weight:700;">${g.percent}%</span>
                </div>

                <div style="margin: 8px 0;">
                    <div style="font-size:1.4rem; font-weight:800; color:var(--accent-emerald);">
                        ${formatCurrency(g.current_amount)}
                    </div>
                    <div style="font-size:0.8rem; color:var(--text-muted);">of ${formatCurrency(g.target_amount)} goal</div>
                </div>

                <div class="progress-bar-bg">
                    <div class="progress-bar-fill" style="width:${g.percent}%; background:var(--accent-emerald);"></div>
                </div>

                <div style="display:flex; justify-content:space-between; margin-top:6px; gap:8px;">
                    <button class="btn btn-primary btn-sm" style="flex:1;" onclick="openDepositModal('${g.id}', '${g.title}')">+ Deposit</button>
                    <button class="btn btn-danger btn-sm" onclick="handleDeleteGoal('${g.id}')">Delete</button>
                </div>
            </div>
        `).join('');

    } catch (err) {
        showToast(err.message, 'error');
    }
}

window.handleDeleteGoal = async function(id) {
    if (!confirm('Are you sure you want to delete this savings goal?')) return;
    try {
        await API.goals.delete(id);
        showToast('Goal removed.', 'success');
        loadGoalsData();
    } catch (err) {
        showToast(err.message, 'error');
    }
};

// ----------------------------------------------------
// 6. ANALYTICS DATA LOADER
// ----------------------------------------------------
async function loadAnalyticsData() {
    try {
        const res = await API.analytics.getDashboard();
        const a = res.analytics;

        // Bar Chart
        const barCtx = document.getElementById('chart-analytics-bar')?.getContext('2d');
        if (barCtx) {
            if (analyticsBarChart) analyticsBarChart.destroy();
            analyticsBarChart = new Chart(barCtx, {
                type: 'bar',
                data: {
                    labels: a.monthlyTrends.map(t => t.month),
                    datasets: [
                        { label: 'Income', data: a.monthlyTrends.map(t => t.income), backgroundColor: 'rgba(16, 185, 129, 0.8)', borderRadius: 6 },
                        { label: 'Expense', data: a.monthlyTrends.map(t => t.expense), backgroundColor: 'rgba(244, 63, 94, 0.8)', borderRadius: 6 }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        x: { grid: { color: 'rgba(255, 255, 255, 0.05)' }, ticks: { color: '#64748B' } },
                        y: { grid: { color: 'rgba(255, 255, 255, 0.05)' }, ticks: { color: '#64748B' } }
                    }
                }
            });
        }

        // Pie Chart
        const pieCtx = document.getElementById('chart-analytics-pie')?.getContext('2d');
        if (pieCtx) {
            if (analyticsPieChart) analyticsPieChart.destroy();
            const cats = a.categorySpending.length > 0 ? a.categorySpending : [{ category: 'No expenses yet', total: 1 }];
            analyticsPieChart = new Chart(pieCtx, {
                type: 'pie',
                data: {
                    labels: cats.map(c => c.category),
                    datasets: [{
                        data: cats.map(c => c.total),
                        backgroundColor: ['#3B82F6', '#10B981', '#F59E0B', '#8B5CF6', '#EC4899', '#06B6D4', '#64748B'],
                        borderColor: '#0D1322',
                        borderWidth: 2
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { position: 'bottom', labels: { color: '#94A3B8' } } }
                }
            });
        }

    } catch (err) {
        showToast(err.message, 'error');
    }
}

// ----------------------------------------------------
// 7. SETTINGS DATA LOADER
// ----------------------------------------------------
function loadSettingsData() {
    if (!currentUser) return;
    document.getElementById('settings-email').value = currentUser.email;
    document.getElementById('settings-fullname').value = currentUser.full_name;
    document.getElementById('settings-currency').value = currentUser.currency || 'USD';
}

// ----------------------------------------------------
// FORM SUBMISSION HANDLERS
// ----------------------------------------------------

// Form: Add Transaction
document.getElementById('form-tx')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const type = document.getElementById('tx-modal-type').value;
    const amount = document.getElementById('tx-modal-amount').value;
    const payee = document.getElementById('tx-modal-payee').value;
    const category = document.getElementById('tx-modal-category').value;
    const account_id = document.getElementById('tx-modal-account').value;
    const date = document.getElementById('tx-modal-date').value;
    const notes = document.getElementById('tx-modal-notes').value;

    try {
        await API.transactions.create({ type, amount, payee, category, account_id, date, notes });
        showToast('Transaction saved and balance updated!', 'success');
        closeModal('modal-transaction');
        e.target.reset();
        loadOverviewData();
        loadTransactionsData();
    } catch (err) {
        showToast(err.message, 'error');
    }
});

// Form: Add Account
document.getElementById('form-account')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('acc-modal-name').value;
    const type = document.getElementById('acc-modal-type').value;
    const balance = document.getElementById('acc-modal-balance').value;
    const institution = document.getElementById('acc-modal-inst').value;
    const mask = document.getElementById('acc-modal-mask').value;
    const color = document.getElementById('acc-modal-color').value;

    try {
        await API.accounts.create({ name, type, balance, institution, mask, color });
        showToast('Account added to persistent database!', 'success');
        closeModal('modal-account');
        e.target.reset();
        loadAccountsData();
        loadOverviewData();
    } catch (err) {
        showToast(err.message, 'error');
    }
});

// Form: Add Budget
document.getElementById('form-budget')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const category = document.getElementById('budget-modal-category').value;
    const monthly_limit = document.getElementById('budget-modal-limit').value;

    try {
        await API.budgets.save({ category, monthly_limit });
        showToast('Budget configured!', 'success');
        closeModal('modal-budget');
        e.target.reset();
        loadBudgetsData();
    } catch (err) {
        showToast(err.message, 'error');
    }
});

// Form: Add Goal
document.getElementById('form-goal')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const title = document.getElementById('goal-modal-title').value;
    const target_amount = document.getElementById('goal-modal-target').value;
    const current_amount = document.getElementById('goal-modal-current').value;
    const target_date = document.getElementById('goal-modal-date').value;

    try {
        await API.goals.create({ title, target_amount, current_amount, target_date });
        showToast('Savings goal saved!', 'success');
        closeModal('modal-goal');
        e.target.reset();
        loadGoalsData();
        loadOverviewData();
    } catch (err) {
        showToast(err.message, 'error');
    }
});

// Form: Deposit to Goal
document.getElementById('form-deposit')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const goalId = document.getElementById('deposit-goal-id').value;
    const deposit_amount = document.getElementById('deposit-modal-amount').value;

    try {
        await API.goals.update(goalId, { deposit_amount });
        showToast('Savings funds deposited!', 'success');
        closeModal('modal-deposit');
        e.target.reset();
        loadGoalsData();
        loadOverviewData();
    } catch (err) {
        showToast(err.message, 'error');
    }
});

// Form: Save Profile
document.getElementById('form-profile')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const full_name = document.getElementById('settings-fullname').value;
    const currency = document.getElementById('settings-currency').value;

    try {
        const res = await API.auth.updateProfile({ full_name, currency });
        currentUser = res.user;
        document.getElementById('sidebar-username').textContent = currentUser.full_name;
        showToast('Profile and currency preferences saved!', 'success');
        loadOverviewData();
    } catch (err) {
        showToast(err.message, 'error');
    }
});

// Form: Change Password
document.getElementById('form-password')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const current_password = document.getElementById('settings-curr-pass').value;
    const new_password = document.getElementById('settings-new-pass').value;

    try {
        await API.auth.changePassword(current_password, new_password);
        showToast('Password updated successfully with salted bcrypt hash!', 'success');
        e.target.reset();
    } catch (err) {
        showToast(err.message, 'error');
    }
});

// Filter event listeners
document.getElementById('tx-search-input')?.addEventListener('input', () => loadTransactionsData());
document.getElementById('tx-filter-account')?.addEventListener('change', () => loadTransactionsData());
document.getElementById('tx-filter-type')?.addEventListener('change', () => loadTransactionsData());
document.getElementById('tx-filter-category')?.addEventListener('change', () => loadTransactionsData());

// Nav clicks
document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', (e) => {
        const view = item.getAttribute('data-view');
        if (view) {
            window.switchView(view);
        }
    });
});

// INITIALIZE APP
async function init() {
    if (!AuthStorage.isAuthenticated()) {
        window.location.href = '/login';
        return;
    }

    try {
        const res = await API.auth.me();
        currentUser = res.user;

        document.getElementById('sidebar-username').textContent = currentUser.full_name;
        document.getElementById('sidebar-useremail').textContent = currentUser.email;
        document.getElementById('sidebar-avatar').textContent = currentUser.full_name.charAt(0).toUpperCase();

        const hash = window.location.hash.replace('#', '') || 'overview';
        window.switchView(hash);
    } catch (err) {
        AuthStorage.clear();
        window.location.href = '/login';
    }
}

init();
