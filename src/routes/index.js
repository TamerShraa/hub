const fs = require('fs');
const { register, sendJson } = require('../router');
const { getUserFromRequest, login, logout, buildAuthCookie, changePassword, forcePasswordChange, sanitizeUser } = require('../services/authService');
const {
  listPagesOverview,
  buildPageSummary,
  createIncome,
  updateIncome,
  deleteIncome,
  createExpense,
  updateExpense,
  deleteExpense,
  calculateMyWork,
  closeSSTDAWeek,
  calculateGlobalDashboard,
  calculatePayoutSummary,
  getPage
} = require('../services/financeService');
const { loadStore, mutateStore } = require('../data/store');
const { createBackup, listBackups } = require('../services/backupService');

function requireAuth(handler) {
  return async (req, res, ctx) => {
    const user = getUserFromRequest(req);
    if (!user) {
      return sendJson(res, 401, { message: 'Unauthorized' });
    }
    return handler(req, res, { ...ctx, user });
  };
}

function requireAdmin(handler) {
  return requireAuth((req, res, ctx) => {
    if (ctx.user.role !== 'admin') {
      return sendJson(res, 403, { message: 'Forbidden' });
    }
    return handler(req, res, ctx);
  });
}

register('POST', '/api/login', async (req, res, { body }) => {
  if (!body) return sendJson(res, 400, { message: 'Invalid payload' });
  const { username, password } = body;
  const result = login(username, password);
  if (!result) return sendJson(res, 401, { message: 'Invalid credentials' });
  res.setHeader('Set-Cookie', buildAuthCookie(result.token, result.ttl));
  sendJson(res, 200, result.user);
});

register('POST', '/api/logout', (req, res) => {
  const token = (req.headers.cookie || '').split(';').find((pair) => pair.trim().startsWith('auth='));
  if (token) {
    const value = token.split('=')[1];
    logout(value);
  }
  res.setHeader('Set-Cookie', 'auth=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax');
  res.writeHead(204);
  res.end();
});

register(
  'GET',
  '/api/me',
  requireAuth((req, res, { user }) => {
    sendJson(res, 200, sanitizeUser(user));
  })
);

register(
  'POST',
  '/api/password/change',
  requireAuth((req, res, { user, body }) => {
    if (!body) return sendJson(res, 400, { message: 'Invalid payload' });
    const result = changePassword(user.id, body.currentPassword, body.newPassword);
    if (result.error) return sendJson(res, 400, { message: result.error });
    sendJson(res, 200, { success: true });
  })
);

register(
  'POST',
  '/api/password/first',
  requireAuth((req, res, { user, body }) => {
    if (!user.mustChangePassword) return sendJson(res, 400, { message: 'Password already updated' });
    if (!body) return sendJson(res, 400, { message: 'Invalid payload' });
    const result = forcePasswordChange(user.id, body.newPassword);
    if (result.error) return sendJson(res, 400, { message: result.error });
    sendJson(res, 200, { success: true });
  })
);

register(
  'GET',
  '/api/pages',
  requireAuth((req, res) => {
    const pages = listPagesOverview();
    sendJson(res, 200, { pages });
  })
);

register(
  'GET',
  '/api/page/:pageId',
  requireAuth((req, res, { params, query }) => {
    const { pageId } = params;
    try {
      const data = buildPageSummary(pageId, query);
      const store = loadStore();
      sendJson(res, 200, { ...data, users: store.users.map((user) => sanitizeUser(user)) });
    } catch (err) {
      sendJson(res, 404, { message: err.message });
    }
  })
);

register(
  'POST',
  '/api/incomes',
  requireAuth((req, res, { body, user }) => {
    if (!body) return sendJson(res, 400, { message: 'Invalid payload' });
    try {
      const income = createIncome(body, user);
      sendJson(res, 201, income);
    } catch (err) {
      sendJson(res, 400, { message: err.message });
    }
  })
);

register(
  'PUT',
  '/api/incomes/:incomeId',
  requireAuth((req, res, { params, body, user }) => {
    try {
      const income = updateIncome(params.incomeId, body, user);
      sendJson(res, 200, income);
    } catch (err) {
      const status = err.message === 'Forbidden' ? 403 : err.message === 'Income not found' ? 404 : 400;
      sendJson(res, status, { message: err.message });
    }
  })
);

register(
  'DELETE',
  '/api/incomes/:incomeId',
  requireAuth((req, res, { params, user }) => {
    try {
      deleteIncome(params.incomeId, user);
      res.writeHead(204);
      res.end();
    } catch (err) {
      const status = err.message === 'Forbidden' ? 403 : err.message === 'Income not found' ? 404 : 400;
      sendJson(res, status, { message: err.message });
    }
  })
);

register(
  'POST',
  '/api/expenses',
  requireAuth((req, res, { body, user }) => {
    if (!body) return sendJson(res, 400, { message: 'Invalid payload' });
    try {
      const expense = createExpense(body, user);
      sendJson(res, 201, expense);
    } catch (err) {
      sendJson(res, 400, { message: err.message });
    }
  })
);

register(
  'PUT',
  '/api/expenses/:expenseId',
  requireAuth((req, res, { params, body, user }) => {
    try {
      const expense = updateExpense(params.expenseId, body, user);
      sendJson(res, 200, expense);
    } catch (err) {
      const status = err.message === 'Forbidden' ? 403 : err.message === 'Expense not found' ? 404 : 400;
      sendJson(res, status, { message: err.message });
    }
  })
);

register(
  'DELETE',
  '/api/expenses/:expenseId',
  requireAuth((req, res, { params, user }) => {
    try {
      deleteExpense(params.expenseId, user);
      res.writeHead(204);
      res.end();
    } catch (err) {
      const status = err.message === 'Forbidden' ? 403 : err.message === 'Expense not found' ? 404 : 400;
      sendJson(res, status, { message: err.message });
    }
  })
);

register(
  'GET',
  '/api/my-work',
  requireAuth((req, res, { user, query }) => {
    const data = calculateMyWork(user.id, query.start, query.end);
    sendJson(res, 200, data);
  })
);

register(
  'GET',
  '/api/reports/dashboard',
  requireAuth((req, res, { query }) => {
    const data = calculateGlobalDashboard(query);
    const store = loadStore();
    const contributors = data.topContributors.map((entry) => ({
      ...entry,
      name: store.users.find((u) => u.id === entry.userId)?.name || 'Unknown'
    }));
    sendJson(res, 200, { ...data, topContributors: contributors });
  })
);

register(
  'GET',
  '/api/reports/payout',
  requireAuth((req, res, { query }) => {
    const rows = calculatePayoutSummary(query.start, query.end);
    sendJson(res, 200, { rows });
  })
);

register(
  'POST',
  '/api/weekly-close',
  requireAuth((req, res, { user, body }) => {
    if (user.role === 'staff') return sendJson(res, 403, { message: 'Forbidden' });
    if (!body?.startDate || !body?.endDate) {
      return sendJson(res, 400, { message: 'Start and end dates are required' });
    }
    try {
      const record = closeSSTDAWeek(body.startDate, body.endDate);
      sendJson(res, 200, record);
    } catch (err) {
      sendJson(res, 400, { message: err.message });
    }
  })
);

register(
  'GET',
  '/api/settings',
  requireAdmin((req, res) => {
    const store = loadStore();
    sendJson(res, 200, store.settings);
  })
);

register(
  'PUT',
  '/api/settings',
  requireAdmin((req, res, { body }) => {
    if (!body) return sendJson(res, 400, { message: 'Invalid payload' });
    mutateStore((state) => {
      state.settings.commissionRate = Number(body.commissionRate) || state.settings.commissionRate;
      state.settings.researchShares = {
        manager: Number(body.researchManager) || state.settings.researchShares.manager,
        tamer: Number(body.researchTamer) || state.settings.researchShares.tamer,
        majdi: Number(body.researchMajdi) || state.settings.researchShares.majdi
      };
      state.settings.sstdaProfit = {
        savings: Number(body.sstdaSavings) || state.settings.sstdaProfit.savings,
        majdiFee: Number(body.sstdaMajdiFee) || state.settings.sstdaProfit.majdiFee,
        tamerFee: Number(body.sstdaTamerFee) || state.settings.sstdaProfit.tamerFee,
        thabit: Number(body.sstdaThabit) || state.settings.sstdaProfit.thabit,
        tamerShare: Number(body.sstdaTamerShare) || state.settings.sstdaProfit.tamerShare,
        majdiShare: Number(body.sstdaMajdiShare) || state.settings.sstdaProfit.majdiShare
      };
      if (body.sessionAdminHours) {
        state.settings.sessionTimeoutHours.admin = Number(body.sessionAdminHours);
      }
      if (body.sessionManagerHours) {
        state.settings.sessionTimeoutHours.manager = Number(body.sessionManagerHours);
      }
      if (body.sessionStaffHours) {
        state.settings.sessionTimeoutHours.staff = Number(body.sessionStaffHours);
      }
    });
    const store = loadStore();
    sendJson(res, 200, store.settings);
  })
);

register(
  'GET',
  '/api/export/:pageId/:type',
  requireAuth((req, res, { params }) => {
    const store = loadStore();
    const page = getPage(params.pageId);
    if (!page) return sendJson(res, 404, { message: 'Page not found' });
    const type = params.type;
    const headers = type === 'expenses'
      ? ['Date', 'Category', 'Amount', 'Linked Deal', 'Notes']
      : ['Date', 'Category', 'Amount', 'Client', 'Brought By', 'Source', 'Product Type', 'Notes'];
    const rows = type === 'expenses'
      ? store.expenses.filter((expense) => expense.pageId === page.id).map((expense) => [
          expense.date,
          expense.category,
          expense.amount,
          expense.linkedIncomeId || '',
          escapeCsv(expense.notes || '')
        ])
      : store.incomes.filter((income) => income.pageId === page.id).map((income) => [
          income.date,
          income.category,
          income.amount,
          escapeCsv(income.clientName || ''),
          store.users.find((u) => u.id === income.broughtById)?.name || '',
          income.source,
          income.productType,
          escapeCsv(income.notes || '')
        ]);
    const csv = [headers.join(','), ...rows.map((row) => row.join(','))].join('\n');
    res.writeHead(200, {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="${page.id}-${type}.csv"`
    });
    res.end(csv);
  })
);

register(
  'POST',
  '/api/backups',
  requireAdmin((req, res) => {
    const backup = createBackup();
    sendJson(res, 201, { filename: backup.filename });
  })
);

register(
  'GET',
  '/api/backups/latest',
  requireAdmin((req, res) => {
    const backups = listBackups(1);
    if (!backups.length) return sendJson(res, 404, { message: 'No backups' });
    const latest = backups[0];
    const stream = fs.createReadStream(latest.filePath);
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="${latest.filename}"`
    });
    stream.pipe(res);
  })
);

function escapeCsv(value) {
  if (value.includes(',') || value.includes('"')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
