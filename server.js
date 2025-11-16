const http = require('http');
const url = require('url');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const DATA_PATH = path.join(__dirname, 'data', 'db.json');
const PUBLIC_DIR = path.join(__dirname, 'public');
const sessions = {};
const SESSION_TTL = 1000 * 60 * 60 * 12; // 12 hours

const PAGE_DEFINITIONS = {
  sstda: {
    id: 'sstda',
    label: 'SSTDA',
    categories: ['Courses - Recorded', 'Courses - Online', 'Courses - Onsite', 'Services', 'Analysis', 'Solutions', 'Consultation', 'Products']
  },
  tamer: {
    id: 'tamer',
    label: 'Tamer Personal',
    categories: ['Courses - Recorded', 'Courses - Online', 'Courses - Onsite', 'Analysis Services', 'Consultation']
  },
  majdi: {
    id: 'majdi',
    label: 'Majdi Personal',
    categories: ['Courses - Recorded', 'Courses - Online', 'Courses - Onsite', 'Services', 'Analysis']
  },
  research: {
    id: 'research',
    label: 'Research Work',
    categories: ['Master Thesis', 'PhD Thesis', 'Research Paper', 'Proposal']
  }
};

const ROLES = {
  ADMIN: 'admin',
  MANAGER: 'manager',
  STAFF: 'staff'
};

function ensureDataFile() {
  if (fs.existsSync(DATA_PATH)) {
    return;
  }
  const defaultPassword = hashPassword('changeme');
  const data = {
    lastIncomeId: 0,
    lastExpenseId: 0,
    lastDistributionId: 0,
    users: [
      { id: 'u1', name: 'Tamer', username: 'tamer', role: ROLES.ADMIN, passwordHash: defaultPassword },
      { id: 'u2', name: 'Majdi', username: 'majdi', role: ROLES.ADMIN, passwordHash: defaultPassword },
      { id: 'u3', name: 'Sajedah', username: 'sajedah', role: ROLES.MANAGER, passwordHash: defaultPassword },
      { id: 'u4', name: 'Sara', username: 'sara', role: ROLES.STAFF, passwordHash: defaultPassword },
      { id: 'u5', name: 'Julnar', username: 'julnar', role: ROLES.STAFF, passwordHash: defaultPassword }
    ],
    incomes: [],
    expenses: [],
    weeklyDistributions: [],
    settings: {
      commissionRate: 0.05,
      researchShares: {
        manager: 0.2,
        tamer: 0.375,
        majdi: 0.375
      },
      sstdaProfit: {
        savings: 0.2,
        majdiFee: 0.1,
        tamerFee: 0.1,
        thabit: 0.114,
        tamerShare: 0.443,
        majdiShare: 0.443
      }
    }
  };
  fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2));
}

function loadStore() {
  ensureDataFile();
  const raw = fs.readFileSync(DATA_PATH, 'utf-8');
  return JSON.parse(raw);
}

let store = loadStore();

function persistStore() {
  fs.writeFileSync(DATA_PATH, JSON.stringify(store, null, 2));
}

function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

function createSession(userId) {
  const token = crypto.randomBytes(24).toString('hex');
  sessions[token] = { userId, createdAt: Date.now() };
  return token;
}

function parseCookies(req) {
  const header = req.headers.cookie || '';
  const cookies = {};
  header.split(';').forEach((pair) => {
    const [key, value] = pair.trim().split('=');
    if (key) {
      cookies[key] = decodeURIComponent(value);
    }
  });
  return cookies;
}

function getCurrentUser(req) {
  const cookies = parseCookies(req);
  const token = cookies.auth;
  if (!token) return null;
  const session = sessions[token];
  if (!session) return null;
  if (Date.now() - session.createdAt > SESSION_TTL) {
    delete sessions[token];
    return null;
  }
  return store.users.find((u) => u.id === session.userId) || null;
}

function sendJSON(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body)
  });
  res.end(body);
}

function sendText(res, statusCode, text) {
  res.writeHead(statusCode, { 'Content-Type': 'text/plain' });
  res.end(text);
}

function serveStatic(req, res) {
  let pathname = url.parse(req.url).pathname;
  if (pathname === '/') pathname = '/index.html';
  const filePath = path.normalize(path.join(PUBLIC_DIR, pathname));
  if (!filePath.startsWith(PUBLIC_DIR)) {
    sendText(res, 403, 'Forbidden');
    return true;
  }
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    return false;
  }
  const ext = path.extname(filePath).toLowerCase();
  const contentType = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.json': 'application/json'
  }[ext] || 'text/plain';
  const stream = fs.createReadStream(filePath);
  res.writeHead(200, { 'Content-Type': contentType });
  stream.pipe(res);
  return true;
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > 1e6) {
        reject(new Error('Payload too large'));
        req.connection.destroy();
      }
    });
    req.on('end', () => {
      if (!data) return resolve({});
      try {
        resolve(JSON.parse(data));
      } catch (err) {
        reject(err);
      }
    });
  });
}

function requireAuth(req, res) {
  const user = getCurrentUser(req);
  if (!user) {
    sendJSON(res, 401, { message: 'Unauthorized' });
    return null;
  }
  return user;
}

function generateIncomeId() {
  store.lastIncomeId += 1;
  return `inc_${store.lastIncomeId}`;
}

function generateExpenseId() {
  store.lastExpenseId += 1;
  return `exp_${store.lastExpenseId}`;
}

function generateDistributionId() {
  store.lastDistributionId += 1;
  return `dist_${store.lastDistributionId}`;
}

function getPage(pageId) {
  return PAGE_DEFINITIONS[pageId] || null;
}

function sum(items, selector) {
  return items.reduce((acc, item) => acc + (selector ? selector(item) : item), 0);
}

function getLinkedExpenses(incomeId) {
  return store.expenses.filter((exp) => exp.linkedIncomeId === incomeId);
}

function getIncomeNetAmount(income) {
  const direct = sum(getLinkedExpenses(income.id), (item) => item.amount);
  return income.amount - direct;
}

function filterByDate(records, start, end) {
  return records.filter((record) => {
    const recordDate = new Date(record.date).getTime();
    if (start && recordDate < start) return false;
    if (end && recordDate > end) return false;
    return true;
  });
}

function buildPageSummary(pageId, start, end, category, broughtBy) {
  const incomes = store.incomes.filter((income) => income.pageId === pageId);
  const expenses = store.expenses.filter((expense) => expense.pageId === pageId);
  const startMs = start ? new Date(start).getTime() : null;
  const endMs = end ? new Date(end).getTime() : null;
  let filteredIncomes = incomes;
  let filteredExpenses = expenses;
  if (startMs || endMs) {
    filteredIncomes = filterByDate(filteredIncomes, startMs, endMs);
    filteredExpenses = filterByDate(filteredExpenses, startMs, endMs);
  }
  if (category) {
    filteredIncomes = filteredIncomes.filter((income) => income.category === category);
    filteredExpenses = filteredExpenses.filter((expense) => expense.category === category);
  }
  if (broughtBy) {
    filteredIncomes = filteredIncomes.filter((income) => income.broughtById === broughtBy);
  }
  const totalIncome = sum(filteredIncomes, (income) => income.amount);
  const totalExpenses = sum(filteredExpenses, (expense) => expense.amount);
  const net = totalIncome - totalExpenses;
  const incomesWithNet = filteredIncomes.map((income) => ({
    ...income,
    netAmount: getIncomeNetAmount(income)
  }));
  return {
    pageId,
    summary: {
      totalIncome,
      totalExpenses,
      net
    },
    incomes: incomesWithNet,
    expenses: filteredExpenses
  };
}

function getUserById(id) {
  return store.users.find((user) => user.id === id) || null;
}

function userCanEditRecord(user, record) {
  if (!user) return false;
  if (user.role === ROLES.ADMIN) return true;
  if (user.role === ROLES.MANAGER) return true;
  if (user.role === ROLES.STAFF) {
    return record.createdById === user.id;
  }
  return false;
}

function userCanDelete(user) {
  return user && user.role === ROLES.ADMIN;
}

function canCloseWeek(user) {
  return user && (user.role === ROLES.ADMIN || user.role === ROLES.MANAGER);
}

function canManageSettings(user) {
  return user && user.role === ROLES.ADMIN;
}

function calculateGeneralCommission(income, userId) {
  if (!income.broughtById || income.broughtById !== userId) return 0;
  if (income.pageId === 'sstda') return 0;
  const netAmount = getIncomeNetAmount(income);
  return netAmount * store.settings.commissionRate;
}

function calculateResearchShares() {
  const shares = {};
  store.incomes
    .filter((income) => income.pageId === 'research')
    .forEach((income) => {
      const net = getIncomeNetAmount(income);
      shares['u3'] = (shares['u3'] || 0) + net * store.settings.researchShares.manager; // Sajedah
      shares['u1'] = (shares['u1'] || 0) + net * store.settings.researchShares.tamer;
      shares['u2'] = (shares['u2'] || 0) + net * store.settings.researchShares.majdi;
    });
  return shares;
}

function calculatePersonalOwnerProfits() {
  const profits = { u1: 0, u2: 0 };
  store.incomes
    .filter((income) => income.pageId === 'tamer' || income.pageId === 'majdi')
    .forEach((income) => {
      const net = getIncomeNetAmount(income);
      const ownerId = income.pageId === 'tamer' ? 'u1' : 'u2';
      const commission = income.broughtById ? net * store.settings.commissionRate : 0;
      profits[ownerId] += net - commission;
    });
  return profits;
}

function calculateMyWork(userId, start, end) {
  const startMs = start ? new Date(start).getTime() : null;
  const endMs = end ? new Date(end).getTime() : null;
  let deals = store.incomes.filter((income) => income.broughtById === userId);
  if (startMs || endMs) {
    deals = filterByDate(deals, startMs, endMs);
  }
  const dealDetails = deals.map((income) => {
    const net = getIncomeNetAmount(income);
    let commission = 0;
    if (income.pageId !== 'sstda') {
      commission = net * store.settings.commissionRate;
    }
    return {
      id: income.id,
      pageId: income.pageId,
      category: income.category,
      clientName: income.clientName,
      date: income.date,
      amount: income.amount,
      netAmount: net,
      commission
    };
  });
  const totalCommission = sum(dealDetails, (deal) => deal.commission);
  const researchShares = calculateResearchShares();
  const personalProfits = calculatePersonalOwnerProfits();
  const weeklyEarnings = store.weeklyDistributions.map((distribution) => {
    const breakdown = { ...distribution.breakdown };
    return {
      id: distribution.id,
      weekStart: distribution.weekStart,
      weekEnd: distribution.weekEnd,
      amount: breakdown[userId] || 0
    };
  });
  const totalWeekly = sum(weeklyEarnings, (item) => item.amount);
  return {
    deals: dealDetails,
    totalCommission,
    researchShare: researchShares[userId] || 0,
    personalProfits: personalProfits[userId] || 0,
    weeklyDistributions: weeklyEarnings,
    weeklyTotal: totalWeekly
  };
}

function closeSSTDAWeek(startDate, endDate, user) {
  if (!canCloseWeek(user)) {
    return { error: 'Forbidden' };
  }
  const startMs = new Date(startDate).getTime();
  const endMs = new Date(endDate).getTime();
  const incomes = filterByDate(store.incomes.filter((income) => income.pageId === 'sstda'), startMs, endMs);
  const expenses = filterByDate(
    store.expenses.filter((expense) => expense.pageId === 'sstda' && !expense.linkedIncomeId),
    startMs,
    endMs
  );
  const totalIncome = sum(incomes, (income) => getIncomeNetAmount(income));
  const totalExpenses = sum(expenses, (expense) => expense.amount);
  const netProfit = totalIncome - totalExpenses;
  const portions = store.settings.sstdaProfit;
  const savings = netProfit * portions.savings;
  const majdiFee = netProfit * portions.majdiFee;
  const tamerFee = netProfit * portions.tamerFee;
  const pool = netProfit - savings - majdiFee - tamerFee;
  const thabitShare = pool * portions.thabit;
  const tamerShare = pool * portions.tamerShare;
  const majdiShare = pool * portions.majdiShare;
  const id = generateDistributionId();
  const breakdown = {
    savings,
    majdiFee,
    tamerFee,
    thabit: thabitShare,
    u1: tamerShare + tamerFee,
    u2: majdiShare + majdiFee
  };
  const record = {
    id,
    weekStart: startDate,
    weekEnd: endDate,
    totalIncome,
    totalExpenses,
    netProfit,
    breakdown
  };
  store.weeklyDistributions.push(record);
  persistStore();
  return record;
}

function handleExport(pageId, type, res) {
  const page = getPage(pageId);
  if (!page) {
    sendText(res, 404, 'Page not found');
    return;
  }
  const headers = type === 'expenses'
    ? ['Date', 'Category', 'Amount', 'Linked Deal', 'Notes']
    : ['Date', 'Category', 'Amount', 'Client', 'Brought By', 'Notes'];
  const rows = type === 'expenses'
    ? store.expenses.filter((expense) => expense.pageId === pageId).map((expense) => [
        expense.date,
        expense.category,
        expense.amount,
        expense.linkedIncomeId || '',
        escapeCsv(expense.notes || '')
      ])
    : store.incomes.filter((income) => income.pageId === pageId).map((income) => [
        income.date,
        income.category,
        income.amount,
        escapeCsv(income.clientName || ''),
        getUserById(income.broughtById)?.name || '',
        escapeCsv(income.notes || '')
      ]);
  const csv = [headers.join(','), ...rows.map((row) => row.join(','))].join('\n');
  res.writeHead(200, {
    'Content-Type': 'text/csv',
    'Content-Disposition': `attachment; filename="${page.id}-${type}.csv"`
  });
  res.end(csv);
}

function escapeCsv(value) {
  if (value.includes(',') || value.includes('"')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

async function handleApi(req, res) {
  const parsed = url.parse(req.url, true);
  const { pathname } = parsed;

  if (pathname === '/api/login' && req.method === 'POST') {
    const body = await parseBody(req).catch(() => null);
    if (!body) return sendJSON(res, 400, { message: 'Invalid payload' });
    const { username, password } = body;
    const user = store.users.find((u) => u.username === username);
    if (!user || user.passwordHash !== hashPassword(password || '')) {
      return sendJSON(res, 401, { message: 'Invalid credentials' });
    }
    const token = createSession(user.id);
    res.writeHead(200, {
      'Set-Cookie': `auth=${token}; HttpOnly; Path=/; Max-Age=${SESSION_TTL / 1000}`,
      'Content-Type': 'application/json'
    });
    res.end(JSON.stringify({ id: user.id, name: user.name, role: user.role }));
    return;
  }

  if (pathname === '/api/logout' && req.method === 'POST') {
    const cookies = parseCookies(req);
    const token = cookies.auth;
    if (token) {
      delete sessions[token];
    }
    res.writeHead(204, { 'Set-Cookie': 'auth=; HttpOnly; Path=/; Max-Age=0' });
    res.end();
    return;
  }

  const user = requireAuth(req, res);
  if (!user) return;

  if (pathname === '/api/me' && req.method === 'GET') {
    return sendJSON(res, 200, { id: user.id, name: user.name, role: user.role });
  }

  if (pathname === '/api/pages' && req.method === 'GET') {
    const summaries = Object.values(PAGE_DEFINITIONS).map((page) => {
      const { summary } = buildPageSummary(page.id);
      return {
        id: page.id,
        label: page.label,
        categories: page.categories,
        summary
      };
    });
    return sendJSON(res, 200, { pages: summaries });
  }

  if (pathname.startsWith('/api/page/') && req.method === 'GET') {
    const [, , , pageId] = pathname.split('/');
    const page = getPage(pageId);
    if (!page) return sendJSON(res, 404, { message: 'Page not found' });
    const { start, end, category, broughtBy } = parsed.query;
    const result = buildPageSummary(pageId, start, end, category, broughtBy);
    return sendJSON(res, 200, {
      page,
      ...result,
      users: store.users.map((u) => ({ id: u.id, name: u.name }))
    });
  }

  if (pathname === '/api/incomes' && req.method === 'POST') {
    const body = await parseBody(req).catch(() => null);
    if (!body) return sendJSON(res, 400, { message: 'Invalid payload' });
    const page = getPage(body.pageId);
    if (!page) return sendJSON(res, 400, { message: 'Invalid page' });
    const income = {
      id: generateIncomeId(),
      date: body.date,
      pageId: body.pageId,
      category: body.category,
      amount: Number(body.amount) || 0,
      clientName: body.clientName || '',
      broughtById: body.broughtById || null,
      notes: body.notes || '',
      createdById: user.id
    };
    store.incomes.push(income);
    persistStore();
    return sendJSON(res, 201, income);
  }

  if (pathname.startsWith('/api/incomes/') && req.method === 'PUT') {
    const incomeId = pathname.split('/')[3];
    const income = store.incomes.find((item) => item.id === incomeId);
    if (!income) return sendJSON(res, 404, { message: 'Income not found' });
    if (!userCanEditRecord(user, income)) return sendJSON(res, 403, { message: 'Forbidden' });
    const body = await parseBody(req).catch(() => null);
    if (!body) return sendJSON(res, 400, { message: 'Invalid payload' });
    Object.assign(income, {
      date: body.date,
      category: body.category,
      amount: Number(body.amount) || 0,
      clientName: body.clientName || '',
      broughtById: body.broughtById || null,
      notes: body.notes || ''
    });
    persistStore();
    return sendJSON(res, 200, income);
  }

  if (pathname.startsWith('/api/incomes/') && req.method === 'DELETE') {
    if (!userCanDelete(user)) return sendJSON(res, 403, { message: 'Forbidden' });
    const incomeId = pathname.split('/')[3];
    const idx = store.incomes.findIndex((item) => item.id === incomeId);
    if (idx === -1) return sendJSON(res, 404, { message: 'Income not found' });
    store.incomes.splice(idx, 1);
    persistStore();
    return sendJSON(res, 204, {});
  }

  if (pathname === '/api/expenses' && req.method === 'POST') {
    const body = await parseBody(req).catch(() => null);
    if (!body) return sendJSON(res, 400, { message: 'Invalid payload' });
    const page = getPage(body.pageId);
    if (!page) return sendJSON(res, 400, { message: 'Invalid page' });
    const expense = {
      id: generateExpenseId(),
      date: body.date,
      pageId: body.pageId,
      category: body.category,
      amount: Number(body.amount) || 0,
      linkedIncomeId: body.linkedIncomeId || null,
      notes: body.notes || '',
      createdById: user.id
    };
    store.expenses.push(expense);
    persistStore();
    return sendJSON(res, 201, expense);
  }

  if (pathname.startsWith('/api/expenses/') && req.method === 'PUT') {
    const expenseId = pathname.split('/')[3];
    const expense = store.expenses.find((item) => item.id === expenseId);
    if (!expense) return sendJSON(res, 404, { message: 'Expense not found' });
    if (!userCanEditRecord(user, expense)) return sendJSON(res, 403, { message: 'Forbidden' });
    const body = await parseBody(req).catch(() => null);
    if (!body) return sendJSON(res, 400, { message: 'Invalid payload' });
    Object.assign(expense, {
      date: body.date,
      category: body.category,
      amount: Number(body.amount) || 0,
      linkedIncomeId: body.linkedIncomeId || null,
      notes: body.notes || ''
    });
    persistStore();
    return sendJSON(res, 200, expense);
  }

  if (pathname.startsWith('/api/expenses/') && req.method === 'DELETE') {
    if (!userCanDelete(user)) return sendJSON(res, 403, { message: 'Forbidden' });
    const expenseId = pathname.split('/')[3];
    const idx = store.expenses.findIndex((item) => item.id === expenseId);
    if (idx === -1) return sendJSON(res, 404, { message: 'Expense not found' });
    store.expenses.splice(idx, 1);
    persistStore();
    return sendJSON(res, 204, {});
  }

  if (pathname === '/api/my-work' && req.method === 'GET') {
    const { start, end } = parsed.query;
    const data = calculateMyWork(user.id, start, end);
    return sendJSON(res, 200, data);
  }

  if (pathname === '/api/settings' && req.method === 'GET') {
    if (!canManageSettings(user)) return sendJSON(res, 403, { message: 'Forbidden' });
    return sendJSON(res, 200, store.settings);
  }

  if (pathname === '/api/settings' && req.method === 'PUT') {
    if (!canManageSettings(user)) return sendJSON(res, 403, { message: 'Forbidden' });
    const body = await parseBody(req).catch(() => null);
    if (!body) return sendJSON(res, 400, { message: 'Invalid payload' });
    store.settings = {
      commissionRate: Number(body.commissionRate) || store.settings.commissionRate,
      researchShares: {
        manager: Number(body.researchManager) || store.settings.researchShares.manager,
        tamer: Number(body.researchTamer) || store.settings.researchShares.tamer,
        majdi: Number(body.researchMajdi) || store.settings.researchShares.majdi
      },
      sstdaProfit: {
        savings: Number(body.sstdaSavings) || store.settings.sstdaProfit.savings,
        majdiFee: Number(body.sstdaMajdiFee) || store.settings.sstdaProfit.majdiFee,
        tamerFee: Number(body.sstdaTamerFee) || store.settings.sstdaProfit.tamerFee,
        thabit: Number(body.sstdaThabit) || store.settings.sstdaProfit.thabit,
        tamerShare: Number(body.sstdaTamerShare) || store.settings.sstdaProfit.tamerShare,
        majdiShare: Number(body.sstdaMajdiShare) || store.settings.sstdaProfit.majdiShare
      }
    };
    persistStore();
    return sendJSON(res, 200, store.settings);
  }

  if (pathname === '/api/weekly-close' && req.method === 'POST') {
    if (!canCloseWeek(user)) return sendJSON(res, 403, { message: 'Forbidden' });
    const body = await parseBody(req).catch(() => null);
    if (!body) return sendJSON(res, 400, { message: 'Invalid payload' });
    if (!body.startDate || !body.endDate) {
      return sendJSON(res, 400, { message: 'Start and end dates are required' });
    }
    const record = closeSSTDAWeek(body.startDate, body.endDate, user);
    if (record.error) return sendJSON(res, 403, { message: record.error });
    return sendJSON(res, 200, record);
  }

  if (pathname.startsWith('/api/export/') && req.method === 'GET') {
    const [, , , pageId, type] = pathname.split('/');
    return handleExport(pageId, type, res);
  }

  sendJSON(res, 404, { message: 'Not found' });
}

const server = http.createServer((req, res) => {
  if (req.url.startsWith('/api/')) {
    return handleApi(req, res).catch((err) => {
      console.error(err);
      sendJSON(res, 500, { message: 'Internal server error' });
    });
  }
  if (serveStatic(req, res)) {
    return;
  }
  sendText(res, 404, 'Not found');
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
