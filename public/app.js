const PAGE_LABELS = {
  sstda: 'SSTDA',
  tamer: 'Tamer Personal',
  majdi: 'Majdi Personal',
  research: 'Research Work'
};

const state = {
  user: null,
  pages: [],
  activePage: null,
  currentPageData: null,
  currentFilters: {}
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
    const message = data?.message || 'Request failed';
    throw new Error(message);
  }
  return data;
}

async function bootstrap() {
  try {
    const me = await request('/api/me');
    state.user = me;
    showDashboard();
  } catch (err) {
    document.getElementById('login-panel').classList.remove('hidden');
  }
}

function showDashboard() {
  document.getElementById('login-panel').classList.add('hidden');
  document.getElementById('dashboard').classList.remove('hidden');
  document.getElementById('welcome').textContent = `Welcome, ${state.user.name} (${state.user.role})`;
  document.getElementById('nav-settings').style.display = state.user.role === 'admin' ? 'inline-flex' : 'none';
  loadPages();
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
    const card = document.createElement('div');
    card.className = 'card clickable';
    card.innerHTML = `
      <h3>${page.label}</h3>
      <p>Total income: <strong>${page.summary.totalIncome.toFixed(2)}</strong></p>
      <p>Total expenses: <strong>${page.summary.totalExpenses.toFixed(2)}</strong></p>
      <p>Net: <strong>${page.summary.net.toFixed(2)}</strong></p>
    `;
    card.addEventListener('click', () => openPage(page.id));
    container.appendChild(card);
  });
}

async function openPage(pageId, filters = {}) {
  hideSections();
  const detailSection = document.getElementById('page-detail');
  detailSection.classList.remove('hidden');
  detailSection.textContent = 'Loading...';
  state.activePage = pageId;
  state.currentFilters = filters;
  try {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value) params.append(key, value);
    });
    const url = params.toString() ? `/api/page/${pageId}?${params.toString()}` : `/api/page/${pageId}`;
    const data = await request(url);
    state.currentPageData = data;
    renderPageDetail(data, filters);
  } catch (err) {
    detailSection.textContent = err.message;
  }
}

function hideSections() {
  document.getElementById('pages-section').classList.add('hidden');
  document.getElementById('page-detail').classList.add('hidden');
  document.getElementById('my-work').classList.add('hidden');
  document.getElementById('settings').classList.add('hidden');
}

function showPagesHome() {
  document.getElementById('pages-section').classList.remove('hidden');
  document.getElementById('page-detail').classList.add('hidden');
  document.getElementById('my-work').classList.add('hidden');
  document.getElementById('settings').classList.add('hidden');
}

function renderPageDetail(data, filters = {}) {
  const detailSection = document.getElementById('page-detail');
  const { page, summary, incomes, expenses, users } = data;
  const userOptions = users
    .map((u) => `<option value="${u.id}">${u.name}</option>`) 
    .join('');
  const incomeOptions = incomes
    .map((income) => `<option value="${income.id}">${income.id} - ${income.category}</option>`) 
    .join('');
  const categories = page.categories.map((cat) => `<option value="${cat}">${cat}</option>`).join('');
  detailSection.innerHTML = `
    <div class="page-header">
      <button class="nav-button" id="back-to-pages">Back</button>
      <div>
        <h2>${page.label}</h2>
        <p>Summary cards show live data with optional filtering.</p>
      </div>
      <div class="summary-row">
        <div class="mini-card">
          <span>Total income</span>
          <strong>${summary.totalIncome.toFixed(2)}</strong>
        </div>
        <div class="mini-card">
          <span>Total expenses</span>
          <strong>${summary.totalExpenses.toFixed(2)}</strong>
        </div>
        <div class="mini-card">
          <span>Net</span>
          <strong>${summary.net.toFixed(2)}</strong>
        </div>
      </div>
    </div>
    <form class="filters" id="filter-form">
      <label>Start date <input type="date" name="start" value="${filters.start || ''}"></label>
      <label>End date <input type="date" name="end" value="${filters.end || ''}"></label>
      <label>Category
        <select name="category">
          <option value="">All</option>
          ${categories}
        </select>
      </label>
      <label>Brought by
        <select name="broughtBy">
          <option value="">All</option>
          ${userOptions}
        </select>
      </label>
      <div class="filter-actions">
        <button type="submit">Apply filters</button>
        <button type="button" class="secondary" id="clear-filters">Reset</button>
      </div>
    </form>
    <div class="actions">
      <button class="secondary" data-export="incomes">Export incomes</button>
      <button class="secondary" data-export="expenses">Export expenses</button>
    </div>
    <div class="split">
      <div class="panel">
        <h3>Incomes</h3>
        <div class="table-container">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Category</th>
                <th>Amount</th>
                <th>Client</th>
                <th>Brought by</th>
                <th>Net</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              ${incomes
                .map((income) => {
                  const brought = users.find((u) => u.id === income.broughtById)?.name || '';
                  const allowEdit = state.user.role !== 'staff' || income.createdById === state.user.id;
                  const allowDelete = state.user.role === 'admin';
                  return `
                    <tr>
                      <td>${income.date}</td>
                      <td>${income.category}</td>
                      <td>${income.amount.toFixed(2)}</td>
                      <td>${income.clientName || ''}</td>
                      <td>${brought}</td>
                      <td>${income.netAmount.toFixed(2)}</td>
                      <td>
                        ${allowEdit ? `<button class="tiny" data-edit-income="${income.id}">Edit</button>` : ''}
                        ${allowDelete ? `<button class="tiny danger" data-delete-income="${income.id}">Delete</button>` : ''}
                      </td>
                    </tr>
                  `;
                })
                .join('')}
            </tbody>
          </table>
        </div>
        <form id="income-form">
          <h4>Record income</h4>
          <input type="hidden" name="pageId" value="${page.id}" />
          <input type="hidden" name="recordId" />
          <label>Date <input type="date" name="date" required /></label>
          <label>Category
            <select name="category" required>
              <option value="">Select</option>
              ${categories}
            </select>
          </label>
          <label>Amount <input type="number" name="amount" step="0.01" required /></label>
          <label>Client name <input type="text" name="clientName" /></label>
          <label>Brought by
            <select name="broughtById">
              <option value="">-- Optional --</option>
              ${userOptions}
            </select>
          </label>
          <label>Notes <textarea name="notes"></textarea></label>
          <button type="submit">Save income</button>
          <button type="button" class="secondary" id="reset-income">Reset</button>
        </form>
      </div>
      <div class="panel">
        <h3>Expenses</h3>
        <div class="table-container">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Category</th>
                <th>Amount</th>
                <th>Linked deal</th>
                <th>Notes</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              ${expenses
                .map((expense) => {
                  const allowEdit = state.user.role !== 'staff' || expense.createdById === state.user.id;
                  const allowDelete = state.user.role === 'admin';
                  return `
                    <tr>
                      <td>${expense.date}</td>
                      <td>${expense.category}</td>
                      <td>${expense.amount.toFixed(2)}</td>
                      <td>${expense.linkedIncomeId || ''}</td>
                      <td>${expense.notes || ''}</td>
                      <td>
                        ${allowEdit ? `<button class="tiny" data-edit-expense="${expense.id}">Edit</button>` : ''}
                        ${allowDelete ? `<button class="tiny danger" data-delete-expense="${expense.id}">Delete</button>` : ''}
                      </td>
                    </tr>
                  `;
                })
                .join('')}
            </tbody>
          </table>
        </div>
        <form id="expense-form">
          <h4>Record expense</h4>
          <input type="hidden" name="pageId" value="${page.id}" />
          <input type="hidden" name="recordId" />
          <label>Date <input type="date" name="date" required /></label>
          <label>Category <input type="text" name="category" placeholder="Ads, tools, halls..." required /></label>
          <label>Amount <input type="number" name="amount" step="0.01" required /></label>
          <label>Linked deal
            <select name="linkedIncomeId">
              <option value="">-- Optional --</option>
              ${incomeOptions}
            </select>
          </label>
          <label>Notes <textarea name="notes"></textarea></label>
          <button type="submit">Save expense</button>
          <button type="button" class="secondary" id="reset-expense">Reset</button>
        </form>
      </div>
    </div>
    ${page.id === 'sstda'
      ? `<div class="panel">
          <h3>Close SSTDA week</h3>
          <form id="close-week-form">
            <label>Week start <input type="date" name="startDate" required /></label>
            <label>Week end <input type="date" name="endDate" required /></label>
            <button type="submit">Close and distribute</button>
          </form>
          <div id="close-week-result"></div>
        </div>`
      : ''}
  `;
  detailSection.querySelector('#back-to-pages').addEventListener('click', showPagesHome);
  const filterForm = detailSection.querySelector('#filter-form');
  filterForm.querySelector('[name="category"]').value = filters.category || '';
  filterForm.querySelector('[name="broughtBy"]').value = filters.broughtBy || '';
  filterForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const formData = Object.fromEntries(new FormData(filterForm));
    openPage(page.id, formData);
  });
  detailSection.querySelector('#clear-filters').addEventListener('click', () => {
    openPage(page.id, {});
  });
  detailSection.querySelectorAll('[data-export]').forEach((button) => {
    button.addEventListener('click', () => {
      const type = button.dataset.export;
      window.open(`/api/export/${page.id}/${type}`);
    });
  });
  attachIncomeFormHandlers(detailSection, page.id);
  attachExpenseFormHandlers(detailSection, page.id);
  if (page.id === 'sstda') {
    const closeForm = detailSection.querySelector('#close-week-form');
    closeForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const formData = Object.fromEntries(new FormData(closeForm));
      try {
        const result = await request('/api/weekly-close', {
          method: 'POST',
          body: JSON.stringify(formData)
        });
        detailSection.querySelector('#close-week-result').textContent = `Week closed. Net profit ${result.netProfit.toFixed(2)}.`;
        loadPages();
        openPage(page.id, state.currentFilters || {});
      } catch (err) {
        detailSection.querySelector('#close-week-result').textContent = err.message;
      }
    });
  }
}

function attachIncomeFormHandlers(section, pageId) {
  const form = section.querySelector('#income-form');
  const resetBtn = section.querySelector('#reset-income');
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const formData = Object.fromEntries(new FormData(form));
    const payload = {
      pageId,
      date: formData.date,
      category: formData.category,
      amount: parseFloat(formData.amount),
      clientName: formData.clientName,
      broughtById: formData.broughtById || null,
      notes: formData.notes
    };
    try {
      if (formData.recordId) {
        await request(`/api/incomes/${formData.recordId}`, {
          method: 'PUT',
          body: JSON.stringify(payload)
        });
      } else {
        await request('/api/incomes', {
          method: 'POST',
          body: JSON.stringify(payload)
        });
      }
      openPage(pageId, state.currentFilters || {});
    } catch (err) {
      alert(err.message);
    }
  });
  resetBtn.addEventListener('click', () => {
    form.reset();
    form.querySelector('[name="recordId"]').value = '';
  });
  section.querySelectorAll('[data-edit-income]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const incomeId = btn.dataset.editIncome;
      const income = statePageData(pageId).incomes.find((item) => item.id === incomeId);
      if (!income) return;
      form.querySelector('[name="recordId"]').value = income.id;
      form.querySelector('[name="date"]').value = income.date;
      form.querySelector('[name="category"]').value = income.category;
      form.querySelector('[name="amount"]').value = income.amount;
      form.querySelector('[name="clientName"]').value = income.clientName || '';
      form.querySelector('[name="broughtById"]').value = income.broughtById || '';
      form.querySelector('[name="notes"]').value = income.notes || '';
    });
  });
  section.querySelectorAll('[data-delete-income]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm('Delete this income?')) return;
      try {
        await request(`/api/incomes/${btn.dataset.deleteIncome}`, { method: 'DELETE' });
        openPage(pageId, state.currentFilters || {});
      } catch (err) {
        alert(err.message);
      }
    });
  });
}

function attachExpenseFormHandlers(section, pageId) {
  const form = section.querySelector('#expense-form');
  const resetBtn = section.querySelector('#reset-expense');
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const formData = Object.fromEntries(new FormData(form));
    const payload = {
      pageId,
      date: formData.date,
      category: formData.category,
      amount: parseFloat(formData.amount),
      linkedIncomeId: formData.linkedIncomeId || null,
      notes: formData.notes
    };
    try {
      if (formData.recordId) {
        await request(`/api/expenses/${formData.recordId}`, {
          method: 'PUT',
          body: JSON.stringify(payload)
        });
      } else {
        await request('/api/expenses', {
          method: 'POST',
          body: JSON.stringify(payload)
        });
      }
      openPage(pageId, state.currentFilters || {});
    } catch (err) {
      alert(err.message);
    }
  });
  resetBtn.addEventListener('click', () => {
    form.reset();
    form.querySelector('[name="recordId"]').value = '';
  });
  section.querySelectorAll('[data-edit-expense]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const expenseId = btn.dataset.editExpense;
      const expense = statePageData(pageId).expenses.find((item) => item.id === expenseId);
      if (!expense) return;
      form.querySelector('[name="recordId"]').value = expense.id;
      form.querySelector('[name="date"]').value = expense.date;
      form.querySelector('[name="category"]').value = expense.category;
      form.querySelector('[name="amount"]').value = expense.amount;
      form.querySelector('[name="linkedIncomeId"]').value = expense.linkedIncomeId || '';
      form.querySelector('[name="notes"]').value = expense.notes || '';
    });
  });
  section.querySelectorAll('[data-delete-expense]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm('Delete this expense?')) return;
      try {
        await request(`/api/expenses/${btn.dataset.deleteExpense}`, { method: 'DELETE' });
        openPage(pageId, state.currentFilters || {});
      } catch (err) {
        alert(err.message);
      }
    });
  });
}

function statePageData(pageId) {
  if (state.currentPageData && state.currentPageData.page.id === pageId) {
    return state.currentPageData;
  }
  return { incomes: [], expenses: [] };
}

async function showMyWork() {
  hideSections();
  const container = document.getElementById('my-work');
  container.classList.remove('hidden');
  container.textContent = 'Loading...';
  try {
    const data = await request('/api/my-work');
    const dealsRows = data.deals
      .map((deal) => `
        <tr>
          <td>${deal.date}</td>
          <td>${PAGE_LABELS[deal.pageId] || deal.pageId}</td>
          <td>${deal.category}</td>
          <td>${deal.netAmount.toFixed(2)}</td>
          <td>${deal.commission.toFixed(2)}</td>
        </tr>
      `)
      .join('');
    const relevantWeekly = data.weeklyDistributions.filter((item) => item.amount !== 0);
    const weeklyRows = relevantWeekly
      .map((item) => `
        <tr>
          <td>${item.weekStart}</td>
          <td>${item.weekEnd}</td>
          <td>${item.amount.toFixed(2)}</td>
        </tr>
      `)
      .join('');
    container.innerHTML = `
      <h2>My work</h2>
      <div class="summary-row">
        <div class="mini-card">
          <span>Deal commissions</span>
          <strong>${data.totalCommission.toFixed(2)}</strong>
        </div>
        <div class="mini-card">
          <span>Research share</span>
          <strong>${data.researchShare.toFixed(2)}</strong>
        </div>
        <div class="mini-card">
          <span>Personal page profit</span>
          <strong>${data.personalProfits.toFixed(2)}</strong>
        </div>
        <div class="mini-card">
          <span>SSTDA weekly</span>
          <strong>${data.weeklyTotal.toFixed(2)}</strong>
        </div>
      </div>
      <div class="panel">
        <h3>Deals brought</h3>
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Page</th>
              <th>Category</th>
              <th>Net amount</th>
              <th>Commission</th>
            </tr>
          </thead>
          <tbody>${dealsRows || '<tr><td colspan="5">No deals yet.</td></tr>'}</tbody>
        </table>
      </div>
      <div class="panel">
        <h3>SSTDA distributions</h3>
        <table>
          <thead>
            <tr>
              <th>Week start</th>
              <th>Week end</th>
              <th>Amount</th>
            </tr>
          </thead>
          <tbody>${weeklyRows || '<tr><td colspan="3">No distributions yet.</td></tr>'}</tbody>
        </table>
      </div>
    `;
  } catch (err) {
    container.textContent = err.message;
  }
}

async function showSettings() {
  hideSections();
  const container = document.getElementById('settings');
  container.classList.remove('hidden');
  if (state.user.role !== 'admin') {
    container.innerHTML = '<p>You do not have permission to edit settings.</p>';
    return;
  }
  container.textContent = 'Loading settings...';
  try {
    const settings = await request('/api/settings');
    container.innerHTML = `
      <h2>System settings</h2>
      <form id="settings-form">
        <label>General commission %
          <input type="number" name="commissionRate" step="0.01" value="${settings.commissionRate}" />
        </label>
        <fieldset>
          <legend>Research shares (net amount)</legend>
          <label>Sajedah % <input type="number" name="researchManager" step="0.01" value="${settings.researchShares.manager}" /></label>
          <label>Tamer % <input type="number" name="researchTamer" step="0.01" value="${settings.researchShares.tamer}" /></label>
          <label>Majdi % <input type="number" name="researchMajdi" step="0.01" value="${settings.researchShares.majdi}" /></label>
        </fieldset>
        <fieldset>
          <legend>SSTDA weekly distribution</legend>
          <label>Savings % <input type="number" name="sstdaSavings" step="0.01" value="${settings.sstdaProfit.savings}" /></label>
          <label>Majdi management % <input type="number" name="sstdaMajdiFee" step="0.01" value="${settings.sstdaProfit.majdiFee}" /></label>
          <label>Tamer management % <input type="number" name="sstdaTamerFee" step="0.01" value="${settings.sstdaProfit.tamerFee}" /></label>
          <label>Thabit share % of pool <input type="number" name="sstdaThabit" step="0.01" value="${settings.sstdaProfit.thabit}" /></label>
          <label>Tamer share % of pool <input type="number" name="sstdaTamerShare" step="0.01" value="${settings.sstdaProfit.tamerShare}" /></label>
          <label>Majdi share % of pool <input type="number" name="sstdaMajdiShare" step="0.01" value="${settings.sstdaProfit.majdiShare}" /></label>
        </fieldset>
        <button type="submit">Save settings</button>
      </form>
      <div id="settings-status"></div>
    `;
    const form = container.querySelector('#settings-form');
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const formData = Object.fromEntries(new FormData(form));
      Object.keys(formData).forEach((key) => {
        formData[key] = parseFloat(formData[key]);
      });
      try {
        await request('/api/settings', {
          method: 'PUT',
          body: JSON.stringify(formData)
        });
        container.querySelector('#settings-status').textContent = 'Saved!';
      } catch (err) {
        container.querySelector('#settings-status').textContent = err.message;
      }
    });
  } catch (err) {
    container.textContent = err.message;
  }
}

function bindAuthHandlers() {
  const form = document.getElementById('login-form');
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const formData = Object.fromEntries(new FormData(form));
    try {
      const user = await request('/api/login', {
        method: 'POST',
        body: JSON.stringify(formData)
      });
      state.user = user;
      showDashboard();
    } catch (err) {
      document.getElementById('login-error').textContent = err.message;
    }
  });
  document.getElementById('logout-btn').addEventListener('click', async () => {
    await request('/api/logout', { method: 'POST' }).catch(() => {});
    window.location.reload();
  });
  document.getElementById('nav-home').addEventListener('click', () => {
    hideSections();
    document.getElementById('pages-section').classList.remove('hidden');
  });
  document.getElementById('nav-my-work').addEventListener('click', showMyWork);
  document.getElementById('nav-settings').addEventListener('click', showSettings);
}

document.addEventListener('DOMContentLoaded', () => {
  bindAuthHandlers();
  bootstrap();
});
