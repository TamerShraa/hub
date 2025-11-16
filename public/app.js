const PAGE_LABELS = {
  sstda: 'SSTDA',
  tamer: 'Tamer Personal',
  majdi: 'Majdi Personal',
  research: 'Research Work'
};

const INCOME_SOURCES = ['Facebook Ads', 'University Partnership', 'Direct', 'Referral', 'Community', 'Other'];
const PRODUCT_TYPES = ['Recorded', 'Live / Cohort', 'Consultation', 'Analysis', 'Solutions', 'Services'];
const QUICK_PRESETS = [
  { key: 'thisWeek', label: 'This week' },
  { key: 'thisMonth', label: 'This month' },
  { key: 'lastMonth', label: 'Last month' }
];

const savedTheme = (() => {
  try {
    return localStorage.getItem('sstda-theme');
  } catch (err) {
    return null;
  }
})();

const state = {
  user: null,
  pages: [],
  activePage: null,
  currentFilters: {},
  sort: {
    incomes: { column: 'date', direction: 'desc' },
    expenses: { column: 'date', direction: 'desc' }
  },
  globalPreset: 'thisMonth',
  payoutRange: {},
  myWorkRange: {},
  theme: savedTheme || 'dark'
};

async function request(url, options = {}) {
  const response = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    },
    credentials: 'include',
    ...options
  });
  if (response.status === 204) return null;
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(data?.message || 'Request failed');
  }
  return data;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function init() {
  applyTheme(state.theme);
  const themeToggle = document.getElementById('theme-toggle');
  if (themeToggle) {
    themeToggle.addEventListener('click', toggleTheme);
  }
  document.getElementById('login-form').addEventListener('submit', handleLogin);
  document.getElementById('force-password-form').addEventListener('submit', handleForcedPassword);
  document.getElementById('logout-btn').addEventListener('click', handleLogout);
  document.getElementById('nav-home').addEventListener('click', () => {
    hideSections();
    document.getElementById('pages-section').classList.remove('hidden');
  });
  document.getElementById('nav-my-work').addEventListener('click', showMyWork);
  document.getElementById('nav-settings').addEventListener('click', showSettings);
  document.getElementById('nav-payout').addEventListener('click', showPayoutSummary);
  document.getElementById('global-refresh').addEventListener('click', () => loadGlobalDashboard(state.globalPreset));
  document.getElementById('payout-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const formData = new FormData(event.target);
    state.payoutRange = {
      start: formData.get('start') || '',
      end: formData.get('end') || ''
    };
    renderPayoutSummary();
  });
  document.getElementById('settings-form').addEventListener('submit', handleSettingsSave);
  document.getElementById('password-change-form').addEventListener('submit', handlePasswordChange);
  document.getElementById('backup-btn').addEventListener('click', triggerBackup);
  document.getElementById('invoice-close').addEventListener('click', closeInvoiceModal);
  document.getElementById('invoice-modal').addEventListener('click', (event) => {
    if (event.target.id === 'invoice-modal') {
      closeInvoiceModal();
    }
  });
  document.getElementById('invoice-pdf').addEventListener('click', handleInvoicePdf);
  bootstrap();
}

document.addEventListener('DOMContentLoaded', init);

async function bootstrap() {
  try {
    const me = await request('/api/me');
    state.user = me;
    if (me.mustChangePassword) {
      showForcePasswordPanel();
    } else {
      showDashboard();
    }
  } catch (err) {
    showLoginPanel(err.message);
  }
}

function showLoginPanel(error) {
  document.getElementById('login-panel').classList.remove('hidden');
  document.getElementById('force-password-panel').classList.add('hidden');
  document.getElementById('dashboard').classList.add('hidden');
  document.getElementById('login-error').textContent = error || '';
}

function showForcePasswordPanel() {
  document.getElementById('login-panel').classList.add('hidden');
  document.getElementById('force-password-panel').classList.remove('hidden');
  document.getElementById('dashboard').classList.add('hidden');
  document.getElementById('force-password-error').textContent = '';
}

function showDashboard() {
  document.getElementById('login-panel').classList.add('hidden');
  document.getElementById('force-password-panel').classList.add('hidden');
  document.getElementById('dashboard').classList.remove('hidden');
  document.getElementById('welcome').textContent = `Welcome, ${state.user.name} (${state.user.role})`;
  document.getElementById('nav-settings').style.display = state.user.role === 'admin' ? 'inline-flex' : 'none';
  document.getElementById('nav-payout').style.display = state.user.role === 'admin' ? 'inline-flex' : 'none';
  hideSections();
  document.getElementById('pages-section').classList.remove('hidden');
  loadGlobalDashboard(state.globalPreset);
  loadPages();
}

async function handleLogin(event) {
  event.preventDefault();
  const formData = new FormData(event.target);
  try {
    const data = await request('/api/login', {
      method: 'POST',
      body: JSON.stringify({
        username: formData.get('username'),
        password: formData.get('password')
      })
    });
    state.user = data;
    if (data.mustChangePassword) {
      showForcePasswordPanel();
    } else {
      showDashboard();
    }
  } catch (err) {
    document.getElementById('login-error').textContent = err.message;
  }
}

async function handleForcedPassword(event) {
  event.preventDefault();
  const formData = new FormData(event.target);
  const newPassword = formData.get('newPassword');
  const confirm = formData.get('confirmPassword');
  if (newPassword !== confirm) {
    document.getElementById('force-password-error').textContent = 'Passwords must match.';
    return;
  }
  try {
    await request('/api/password/first', {
      method: 'POST',
      body: JSON.stringify({ newPassword })
    });
    const me = await request('/api/me');
    state.user = me;
    showDashboard();
  } catch (err) {
    document.getElementById('force-password-error').textContent = err.message;
  }
}

async function handleLogout() {
  await request('/api/logout', { method: 'POST' });
  state.user = null;
  showLoginPanel();
}

function hideSections() {
  document.getElementById('pages-section').classList.add('hidden');
  document.getElementById('page-detail').classList.add('hidden');
  document.getElementById('my-work').classList.add('hidden');
  document.getElementById('settings').classList.add('hidden');
  document.getElementById('payout-summary').classList.add('hidden');
}

async function loadPages() {
  try {
    const data = await request('/api/pages');
    state.pages = data.pages;
    renderPageCards();
  } catch (err) {
    console.error(err);
  }
}

function renderPageCards() {
  const container = document.getElementById('page-cards');
  container.innerHTML = '';
  state.pages.forEach((page) => {
    const card = document.createElement('button');
    card.className = 'card clickable';
    card.innerHTML = `
      <div class="card-title">${page.label}</div>
      <div class="card-meta">Income</div>
      <strong>${page.summary.totalIncome.toFixed(2)}</strong>
      <div class="card-meta">Net</div>
      <strong>${page.summary.net.toFixed(2)}</strong>
    `;
    card.addEventListener('click', () => openPage(page.id));
    container.appendChild(card);
  });
}

async function loadGlobalDashboard(preset) {
  try {
    state.globalPreset = preset;
    const data = await request(`/api/reports/dashboard?preset=${preset}`);
    renderGlobalDashboard(data);
  } catch (err) {
    console.error(err);
  }
}

function renderGlobalDashboard(data) {
  document.getElementById('global-income').textContent = data.totalIncome.toFixed(2);
  document.getElementById('global-expenses').textContent = data.totalExpenses.toFixed(2);
  document.getElementById('global-net').textContent = data.net.toFixed(2);
  const topCategories = document.getElementById('top-categories');
  const topContributors = document.getElementById('top-contributors');
  topCategories.innerHTML = data.topCategories
    .map((item) => `<li><span>${item.name}</span><strong>${item.total.toFixed(2)}</strong></li>`)
    .join('');
  topContributors.innerHTML = data.topContributors
    .map((item) => `<li><span>${item.name}</span><strong>${item.total.toFixed(2)}</strong></li>`)
    .join('');
}

async function openPage(pageId, filters = {}) {
  hideSections();
  const detailSection = document.getElementById('page-detail');
  detailSection.classList.remove('hidden');
  const scrollPosition = detailSection.scrollTop;
  detailSection.innerHTML = '<div class="panel">Loading...</div>';
  state.activePage = pageId;
  state.currentFilters[pageId] = filters;
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value) params.append(key, value);
  });
  const url = params.toString() ? `/api/page/${pageId}?${params.toString()}` : `/api/page/${pageId}`;
  try {
    const data = await request(url);
    renderPageDetail(data, filters);
    detailSection.scrollTop = scrollPosition;
  } catch (err) {
    detailSection.innerHTML = `<div class="panel error">${err.message}</div>`;
  }
}

function renderPageDetail(data, filters = {}) {
  const detailSection = document.getElementById('page-detail');
  const { page, summary, incomes, expenses, users } = data;
  const userMap = Object.fromEntries(users.map((user) => [user.id, user.name]));
  const userOptions = users.map((user) => `<option value="${user.id}">${user.name}</option>`).join('');
  const categoryOptions = page.categories
    .map((category) => `<option value="${category}" ${filters.category === category ? 'selected' : ''}>${category}</option>`)
    .join('');
  const filterUserOptions = users
    .map((user) => `<option value="${user.id}" ${filters.broughtBy === user.id ? 'selected' : ''}>${user.name}</option>`)
    .join('');
  const sourceOptions = INCOME_SOURCES.map(
    (source) => `<option value="${source}" ${filters.source === source ? 'selected' : ''}>${source}</option>`
  ).join('');
  const productOptions = PRODUCT_TYPES.map(
    (type) => `<option value="${type}" ${filters.productType === type ? 'selected' : ''}>${type}</option>`
  ).join('');
  const presetButtons = QUICK_PRESETS.map((preset) => `<button type="button" class="chip" data-preset="${preset.key}">${preset.label}</button>`).join('');
  detailSection.innerHTML = `
    <div class="panel page-panel">
      <div class="page-header">
        <div>
          <button class="nav-button" id="back-to-pages">Back</button>
          <h2>${page.label}</h2>
          <p>Track deals, expenses, and profit in one place.</p>
        </div>
        <div class="cta-group">
          <button class="primary" id="jump-add-income">+ Add income</button>
          <button class="secondary" id="jump-add-expense">+ Add expense</button>
        </div>
      </div>
      <div class="summary-row">
        <div class="mini-card"><span>Total income</span><strong>${summary.totalIncome.toFixed(2)}</strong></div>
        <div class="mini-card"><span>Total expenses</span><strong>${summary.totalExpenses.toFixed(2)}</strong></div>
        <div class="mini-card"><span>Net</span><strong>${summary.net.toFixed(2)}</strong></div>
      </div>
      <form class="filters" id="filter-form">
        <label>Start date<input type="date" name="start" value="${filters.start || ''}"></label>
        <label>End date<input type="date" name="end" value="${filters.end || ''}"></label>
        <label>Category<select name="category"><option value="">All</option>${categoryOptions}</select></label>
        <label>Brought by<select name="broughtBy"><option value="">All</option>${filterUserOptions}</select></label>
        <label>Source<select name="source"><option value="">All</option>${sourceOptions}</select></label>
        <label>Product type<select name="productType"><option value="">All</option>${productOptions}</select></label>
        <label class="grow">Search
          <input type="text" name="search" placeholder="Client or notes" value="${filters.search || ''}">
        </label>
        <div class="chip-row">${presetButtons}</div>
        <button type="submit" class="primary">Apply filters</button>
      </form>
      <div class="split">
        <div class="form-card" id="income-form-card">
          <h3>Add income</h3>
          <form id="income-form">
            <label>Date<input type="date" name="date" required></label>
            <div class="field-error" data-for="date"></div>
            <label>Category<select name="category">${page.categories
              .map((category) => `<option value="${category}">${category}</option>`)
              .join('')}</select></label>
            <label>Source<select name="source">${INCOME_SOURCES.map((item) => `<option value="${item}">${item}</option>`).join('')}</select></label>
            <label>Product type<select name="productType">${PRODUCT_TYPES.map((item) => `<option value="${item}">${item}</option>`).join('')}</select></label>
            <div class="payment-section">
              <div class="payment-section-header">
                <h4>Payment schedule</h4>
                <p>Capture up to four installments. Leave extras blank.</p>
                <div class="payment-total">Total <span id="payment-total">0.00 JD</span></div>
              </div>
              ${[1, 2, 3, 4]
                .map(
                  (slot) => `
                    <div class="payment-row">
                      <label>Payment ${slot} amount<input type="number" step="0.01" name="payment${slot}Amount" data-payment-amount></label>
                      <label>Payment ${slot} date<input type="date" name="payment${slot}Date"></label>
                    </div>
                  `
                )
                .join('')}
            </div>
            <div class="field-error" data-for="payments"></div>
            <label>Client<input type="text" name="clientName"></label>
            <label>Brought by<select name="broughtById"><option value="">Select member</option>${userOptions}</select></label>
            <label>Notes<textarea name="notes" rows="2"></textarea></label>
            <button type="submit" class="primary">Save income</button>
          </form>
        </div>
        <div class="form-card" id="expense-form-card">
          <h3>Add expense</h3>
          <form id="expense-form">
            <label>Date<input type="date" name="date" required></label>
            <div class="field-error" data-for="expense-date"></div>
            <label>Category<input type="text" name="category" placeholder="Tools, ads, hall..." required></label>
            <div class="field-error" data-for="expense-category"></div>
            <label>Amount<input type="number" step="0.01" name="amount" required></label>
            <div class="field-error" data-for="expense-amount"></div>
            <label>Linked deal<select name="linkedIncomeId"><option value="">None</option>${incomes
              .map((income) => `<option value="${income.id}">${income.id} - ${income.category}</option>`)
              .join('')}</select></label>
            <label>Notes<textarea name="notes" rows="2"></textarea></label>
            <button type="submit" class="secondary">Save expense</button>
          </form>
        </div>
      </div>
      <div class="table-wrap">
        <h3>Incomes</h3>
        ${renderIncomeTable(incomes, userMap)}
      </div>
      <div class="table-wrap">
        <h3>Expenses</h3>
        ${renderExpenseTable(expenses)}
      </div>
    </div>
  `;
  document.getElementById('back-to-pages').addEventListener('click', () => {
    hideSections();
    document.getElementById('pages-section').classList.remove('hidden');
  });
  document.getElementById('filter-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const formData = new FormData(event.target);
    const nextFilters = Object.fromEntries([...formData.entries()].filter(([, value]) => value));
    openPage(state.activePage, nextFilters);
  });
  document.querySelectorAll('#filter-form .chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      openPage(state.activePage, { ...state.currentFilters[state.activePage], preset: chip.dataset.preset });
    });
  });
  document.getElementById('income-form').addEventListener('submit', handleIncomeSubmit);
  document.getElementById('expense-form').addEventListener('submit', handleExpenseSubmit);
  attachPaymentWatcher(document.getElementById('income-form'));
  document.getElementById('jump-add-income').addEventListener('click', () => document.getElementById('income-form').scrollIntoView({ behavior: 'smooth' }));
  document.getElementById('jump-add-expense').addEventListener('click', () => document.getElementById('expense-form').scrollIntoView({ behavior: 'smooth' }));
  attachSorting();
  detailSection.querySelectorAll('.invoice-btn').forEach((button) => {
    button.addEventListener('click', () => openInvoice(button.dataset.type, button.dataset.id));
  });
}

function renderIncomeTable(incomes, userMap) {
  const sorted = applySorting([...incomes], state.sort.incomes);
  return `
    <table>
      <thead>
        <tr>
          <th data-table="incomes" data-column="date">Date</th>
          <th>Category</th>
          <th>Source</th>
          <th>Product</th>
          <th data-table="incomes" data-column="amount">Amount</th>
          <th data-table="incomes" data-column="netAmount">Net</th>
          <th>Client</th>
          <th>Brought by</th>
          <th>Payments</th>
          <th>Invoice</th>
        </tr>
      </thead>
      <tbody>
        ${sorted
          .map(
            (income) => `
              <tr>
                <td>${income.date}</td>
                <td>${income.category}</td>
                <td>${income.source}</td>
                <td>${income.productType}</td>
                <td>${income.amount.toFixed(2)}</td>
                <td>${income.netAmount.toFixed(2)}</td>
                <td>${income.clientName || '-'}</td>
                <td>${income.broughtById ? userMap[income.broughtById] || '—' : '—'}</td>
                <td>
                  <div class="payment-list">${renderPaymentBreakdown(income)}</div>
                </td>
                <td>
                  <div class="table-actions">
                    <span class="invoice-pill">${income.invoiceNumber}</span>
                    <button type="button" class="ghost-button invoice-btn" data-type="income" data-id="${income.id}">View</button>
                  </div>
                </td>
              </tr>
            `
          )
          .join('')}
      </tbody>
    </table>
  `;
}

function renderPaymentBreakdown(income) {
  const payments = income.payments && income.payments.length ? income.payments : [{ amount: income.amount, date: income.date }];
  return payments
    .map(
      (payment, index) => `
        <div class="payment-chip">
          <span>Part ${index + 1}</span>
          <strong>${Number(payment.amount || 0).toFixed(2)} JD</strong>
          <small>${escapeHtml(payment.date || 'N/A')}</small>
        </div>
      `
    )
    .join('');
}

function renderExpenseTable(expenses) {
  const sorted = applySorting([...expenses], state.sort.expenses);
  return `
    <table>
      <thead>
        <tr>
          <th data-table="expenses" data-column="date">Date</th>
          <th>Description</th>
          <th data-table="expenses" data-column="amount">Amount</th>
          <th>Linked deal</th>
          <th>Notes</th>
          <th>Invoice</th>
        </tr>
      </thead>
      <tbody>
        ${sorted
          .map(
            (expense) => `
              <tr>
                <td>${expense.date}</td>
                <td>${expense.category}</td>
                <td>${expense.amount.toFixed(2)}</td>
                <td>${expense.linkedIncomeId || '-'}</td>
                <td>${expense.notes || '-'}</td>
                <td>
                  <div class="table-actions">
                    <span class="invoice-pill">${expense.invoiceNumber}</span>
                    <button type="button" class="ghost-button invoice-btn" data-type="expense" data-id="${expense.id}">View</button>
                  </div>
                </td>
              </tr>
            `
          )
          .join('')}
      </tbody>
    </table>
  `;
}

function applySorting(rows, sortConfig) {
  return rows.sort((a, b) => {
    let valueA = a[sortConfig.column];
    let valueB = b[sortConfig.column];
    if (sortConfig.column.includes('date')) {
      valueA = Date.parse(valueA);
      valueB = Date.parse(valueB);
    }
    if (valueA < valueB) return sortConfig.direction === 'asc' ? -1 : 1;
    if (valueA > valueB) return sortConfig.direction === 'asc' ? 1 : -1;
    return 0;
  });
}

function attachSorting() {
  document.querySelectorAll('th[data-table]').forEach((header) => {
    header.addEventListener('click', () => {
      const table = header.dataset.table;
      const column = header.dataset.column;
      const config = state.sort[table];
      if (config.column === column) {
        config.direction = config.direction === 'asc' ? 'desc' : 'asc';
      } else {
        config.column = column;
        config.direction = 'desc';
      }
      if (state.activePage) {
        openPage(state.activePage, state.currentFilters[state.activePage] || {});
      }
    });
  });
}

async function handleIncomeSubmit(event) {
  event.preventDefault();
  const form = event.target;
  const formData = new FormData(form);
  const payload = {
    date: formData.get('date'),
    category: formData.get('category'),
    source: formData.get('source'),
    productType: formData.get('productType'),
    clientName: formData.get('clientName'),
    broughtById: formData.get('broughtById'),
    notes: formData.get('notes'),
    pageId: state.activePage
  };
  const payments = collectPayments(formData, payload.date);
  const errors = {};
  if (!payload.date) errors.date = 'Date is required';
  if (!payments.length) errors.payments = 'Add at least one payment amount';
  showFieldErrors(form, errors);
  if (Object.keys(errors).length) return;
  const totalAmount = payments.reduce((sum, payment) => sum + payment.amount, 0);
  payload.payments = payments;
  payload.amount = totalAmount;
  try {
    await request('/api/incomes', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    form.reset();
    updatePaymentTotal(form);
    openPage(state.activePage, state.currentFilters[state.activePage] || {});
  } catch (err) {
    alert(err.message);
  }
}

function collectPayments(formData, fallbackDate) {
  const payments = [];
  for (let index = 1; index <= 4; index += 1) {
    const amount = Number(formData.get(`payment${index}Amount`));
    const date = formData.get(`payment${index}Date`) || fallbackDate;
    if (amount && amount > 0) {
      payments.push({ amount, date });
    }
  }
  return payments;
}

function updatePaymentTotal(form) {
  if (!form) return;
  const display = form.querySelector('#payment-total');
  if (!display) return;
  const total = [...form.querySelectorAll('[data-payment-amount]')].reduce((sum, input) => {
    const value = Number(input.value);
    return sum + (Number.isNaN(value) ? 0 : value);
  }, 0);
  display.textContent = `${total.toFixed(2)} JD`;
}

function attachPaymentWatcher(form) {
  if (!form) return;
  const inputs = form.querySelectorAll('[data-payment-amount]');
  inputs.forEach((input) => {
    input.addEventListener('input', () => updatePaymentTotal(form));
  });
  updatePaymentTotal(form);
}

async function handleExpenseSubmit(event) {
  event.preventDefault();
  const form = event.target;
  const formData = new FormData(form);
  const payload = Object.fromEntries(formData.entries());
  payload.pageId = state.activePage;
  const errors = {};
  if (!payload.date) errors['expense-date'] = 'Date is required';
  if (!payload.category) errors['expense-category'] = 'Category is required';
  if (!payload.amount) errors['expense-amount'] = 'Amount is required';
  showFieldErrors(form, errors);
  if (Object.keys(errors).length) return;
  try {
    await request('/api/expenses', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    form.reset();
    openPage(state.activePage, state.currentFilters[state.activePage] || {});
  } catch (err) {
    alert(err.message);
  }
}

function showFieldErrors(form, errors) {
  form.querySelectorAll('.field-error').forEach((el) => {
    const key = el.dataset.for;
    el.textContent = errors[key] || '';
  });
}

function applyTheme(theme) {
  state.theme = theme;
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem('sstda-theme', theme);
  } catch (err) {
    // ignore storage errors
  }
  updateThemeToggleLabel();
}

function toggleTheme() {
  const next = state.theme === 'dark' ? 'light' : 'dark';
  applyTheme(next);
}

function updateThemeToggleLabel() {
  const toggle = document.getElementById('theme-toggle');
  if (!toggle) return;
  toggle.textContent = state.theme === 'dark' ? '☀️ Light Mode' : '🌙 Dark Mode';
}

async function showMyWork() {
  hideSections();
  const panel = document.getElementById('my-work');
  panel.classList.remove('hidden');
  const params = new URLSearchParams(state.myWorkRange);
  const query = params.toString();
  const endpoint = query ? `/api/my-work?${query}` : '/api/my-work';
  const data = await request(endpoint);
  panel.innerHTML = `
    <div class="panel">
      <h2>My work</h2>
      <form id="my-work-form" class="filters inline">
        <label>Start<input type="date" name="start" value="${state.myWorkRange.start || ''}"></label>
        <label>End<input type="date" name="end" value="${state.myWorkRange.end || ''}"></label>
        <button class="primary">Filter</button>
      </form>
      <div class="summary-row">
        <div class="mini-card"><span>Commissions</span><strong>${data.totalCommission.toFixed(2)}</strong></div>
        <div class="mini-card"><span>Research</span><strong>${data.researchShare.toFixed(2)}</strong></div>
        <div class="mini-card"><span>SSTDA</span><strong>${data.weeklyTotal.toFixed(2)}</strong></div>
      </div>
      <table>
        <thead><tr><th>Date</th><th>Page</th><th>Category</th><th>Source</th><th>Product</th><th>Net</th><th>Commission</th></tr></thead>
        <tbody>
          ${data.deals
            .map(
              (deal) => `
                <tr>
                  <td>${deal.date}</td>
                  <td>${PAGE_LABELS[deal.pageId]}</td>
                  <td>${deal.category}</td>
                  <td>${deal.source}</td>
                  <td>${deal.productType}</td>
                  <td>${deal.netAmount.toFixed(2)}</td>
                  <td>${deal.commission.toFixed(2)}</td>
                </tr>
              `
            )
            .join('')}
        </tbody>
      </table>
    </div>
  `;
  panel.querySelector('#my-work-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const formData = new FormData(event.target);
    state.myWorkRange = {
      start: formData.get('start') || '',
      end: formData.get('end') || ''
    };
    showMyWork();
  });
}

async function showSettings() {
  hideSections();
  const panel = document.getElementById('settings');
  panel.classList.remove('hidden');
  const settings = await request('/api/settings');
  panel.querySelector('[name="commissionRate"]').value = settings.commissionRate;
  panel.querySelector('[name="researchManager"]').value = settings.researchShares.manager;
  panel.querySelector('[name="researchTamer"]').value = settings.researchShares.tamer;
  panel.querySelector('[name="researchMajdi"]').value = settings.researchShares.majdi;
  panel.querySelector('[name="sstdaSavings"]').value = settings.sstdaProfit.savings;
  panel.querySelector('[name="sstdaMajdiFee"]').value = settings.sstdaProfit.majdiFee;
  panel.querySelector('[name="sstdaTamerFee"]').value = settings.sstdaProfit.tamerFee;
  panel.querySelector('[name="sstdaThabit"]').value = settings.sstdaProfit.thabit;
  panel.querySelector('[name="sstdaTamerShare"]').value = settings.sstdaProfit.tamerShare;
  panel.querySelector('[name="sstdaMajdiShare"]').value = settings.sstdaProfit.majdiShare;
  panel.querySelector('[name="sessionAdminHours"]').value = settings.sessionTimeoutHours.admin;
  panel.querySelector('[name="sessionManagerHours"]').value = settings.sessionTimeoutHours.manager;
  panel.querySelector('[name="sessionStaffHours"]').value = settings.sessionTimeoutHours.staff;
}

async function handleSettingsSave(event) {
  event.preventDefault();
  const formData = new FormData(event.target);
  const payload = Object.fromEntries(formData.entries());
  try {
    await request('/api/settings', {
      method: 'PUT',
      body: JSON.stringify(payload)
    });
    alert('Settings saved');
  } catch (err) {
    alert(err.message);
  }
}

async function handlePasswordChange(event) {
  event.preventDefault();
  const formData = new FormData(event.target);
  const newPassword = formData.get('newPassword');
  if (newPassword !== formData.get('confirmPassword')) {
    alert('Passwords do not match');
    return;
  }
  try {
    await request('/api/password/change', {
      method: 'POST',
      body: JSON.stringify({
        currentPassword: formData.get('currentPassword'),
        newPassword
      })
    });
    event.target.reset();
    alert('Password updated');
  } catch (err) {
    alert(err.message);
  }
}

async function triggerBackup() {
  try {
    await request('/api/backups', { method: 'POST' });
    window.location.href = '/api/backups/latest';
  } catch (err) {
    alert(err.message);
  }
}

function closeInvoiceModal() {
  const modal = document.getElementById('invoice-modal');
  modal.classList.add('hidden');
  document.getElementById('invoice-content').innerHTML = '';
}

function handleInvoicePdf() {
  const button = document.getElementById('invoice-pdf');
  const { type, id } = button.dataset;
  if (!type || !id) return;
  window.open(`/api/invoices/${type}/${id}/pdf`, '_blank');
}

async function openInvoice(type, id) {
  try {
    const invoice = await request(`/api/invoices/${type}/${id}`);
    renderInvoicePreview(invoice);
    const modal = document.getElementById('invoice-modal');
    modal.classList.remove('hidden');
  } catch (err) {
    alert(err.message);
  }
}

function renderInvoicePreview(invoice) {
  const content = document.getElementById('invoice-content');
  document.getElementById('invoice-pdf').dataset.type = invoice.type;
  document.getElementById('invoice-pdf').dataset.id = invoice.id;
  const title = invoice.type === 'income' ? 'Income Invoice' : 'Expense Report';
  const phones = Array.isArray(invoice.company.phones)
    ? invoice.company.phones.join(' • ')
    : invoice.company.phone;
  const totalReceived = typeof invoice.totalAmount === 'number' ? invoice.totalAmount : invoice.amount;
  const schedule = invoice.type === 'income'
    ? `
        <div class="invoice-schedule">
          <div class="invoice-schedule-header">
            <h4>Payment schedule</h4>
            <span>Total received: ${Number(totalReceived || 0).toFixed(2)} ${escapeHtml(invoice.currency)}</span>
          </div>
          <ul>
            ${invoice.payments
              .map(
                (payment, index) => `
                  <li>
                    <span>Payment ${index + 1}</span>
                    <strong>${Number(payment.amount || 0).toFixed(2)} ${escapeHtml(invoice.currency)}</strong>
                    <small>${escapeHtml(payment.date || 'N/A')}</small>
                  </li>
                `
              )
              .join('')}
          </ul>
        </div>
      `
    : `
        <div class="invoice-schedule">
          <div class="invoice-schedule-header">
            <h4>Amount</h4>
            <span>${invoice.amount.toFixed(2)} ${escapeHtml(invoice.currency)}</span>
          </div>
        </div>
      `;
  content.innerHTML = `
    <div class="invoice-header">
      <div>
        <h4>${escapeHtml(invoice.company.name)}</h4>
        <p>${escapeHtml(invoice.company.description)}</p>
        <p>${escapeHtml(invoice.company.address)}</p>
        <p>${escapeHtml(phones)}</p>
        <p>${escapeHtml(invoice.company.email)}</p>
      </div>
      <div class="invoice-meta">
        <span class="invoice-pill">${escapeHtml(title)}</span>
        <p>${escapeHtml(invoice.invoiceNumber)}</p>
        <p>${escapeHtml(invoice.date)}</p>
      </div>
    </div>
    <div class="invoice-grid">
      <div class="invoice-field"><span>Type</span><strong>${escapeHtml(invoice.typeLabel)}</strong></div>
      <div class="invoice-field"><span>Page</span><strong>${escapeHtml(invoice.pageLabel)}</strong></div>
      <div class="invoice-field"><span>Party</span><strong>${escapeHtml(invoice.partyName)}</strong></div>
      <div class="invoice-field"><span>Category</span><strong>${escapeHtml(invoice.category)}</strong></div>
      <div class="invoice-field"><span>Payment method</span><strong>${escapeHtml(invoice.paymentMethod)}</strong></div>
      <div class="invoice-field"><span>Linked deal</span><strong>${escapeHtml(invoice.linkedIncomeId || '—')}</strong></div>
    </div>
    ${schedule}
    <div class="invoice-notes">
      <span>Notes</span>
      <p>${escapeHtml(invoice.notes || 'No additional notes recorded.')}</p>
    </div>
    <p class="muted invoice-footer">This invoice was generated by Smart Summit Finance System – SSTDA.</p>
  `;
}

async function showPayoutSummary() {
  hideSections();
  document.getElementById('payout-summary').classList.remove('hidden');
  renderPayoutSummary();
}

async function renderPayoutSummary() {
  const panel = document.getElementById('payout-summary');
  const params = new URLSearchParams(state.payoutRange);
  const query = params.toString();
  const endpoint = query ? `/api/reports/payout?${query}` : '/api/reports/payout';
  const data = await request(endpoint);
  const payoutForm = document.getElementById('payout-form');
  payoutForm.querySelector('[name="start"]').value = state.payoutRange.start || '';
  payoutForm.querySelector('[name="end"]').value = state.payoutRange.end || '';
  panel.querySelector('#payout-table-body').innerHTML = data.rows
    .map(
      (row) => `
        <tr>
          <td>${row.name}</td>
          <td>${row.commission.toFixed(2)}</td>
          <td>${row.researchShare.toFixed(2)}</td>
          <td>${row.sstdaShare.toFixed(2)}</td>
          <td>${row.total.toFixed(2)}</td>
        </tr>
      `
    )
    .join('');
}
