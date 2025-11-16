const { loadStore, mutateStore, generateIncomeId, generateExpenseId, generateDistributionId } = require('../data/store');
const { PAGE_DEFINITIONS, ROLES } = require('../constants');
const { toMs, inRange, resolvePreset } = require('../utils/date');

function sum(list, selector = (item) => item) {
  return list.reduce((acc, item) => acc + selector(item), 0);
}

function getPage(pageId) {
  return PAGE_DEFINITIONS[pageId] || null;
}

function getLinkedExpenses(store, incomeId) {
  return store.expenses.filter((expense) => expense.linkedIncomeId === incomeId);
}

function getIncomeNetAmount(store, income) {
  const direct = sum(getLinkedExpenses(store, income.id), (item) => item.amount);
  return income.amount - direct;
}

function filterRecords(records, { start, end, category, broughtBy, search, source, productType }) {
  const startMs = toMs(start);
  const endMs = toMs(end);
  return records.filter((record) => {
    if (startMs && Date.parse(record.date) < startMs) return false;
    if (endMs && Date.parse(record.date) > endMs) return false;
    if (category && record.category !== category) return false;
    if (broughtBy && record.broughtById !== broughtBy) return false;
    if (source && record.source !== source) return false;
    if (productType && record.productType !== productType) return false;
    if (search) {
      const needle = search.toLowerCase();
      const haystack = `${record.clientName || ''} ${record.notes || ''}`.toLowerCase();
      if (!haystack.includes(needle)) return false;
    }
    return true;
  });
}

function buildPageSummary(pageId, filters = {}) {
  const store = loadStore();
  const page = getPage(pageId);
  if (!page) {
    throw new Error('Page not found');
  }
  const appliedFilters = { ...filters };
  if (filters.preset && (!filters.start || !filters.end)) {
    const presetRange = resolvePreset(filters.preset);
    appliedFilters.start = appliedFilters.start || presetRange.start;
    appliedFilters.end = appliedFilters.end || presetRange.end;
  }
  const incomes = filterRecords(
    store.incomes.filter((income) => income.pageId === pageId),
    appliedFilters
  );
  const expenseFilters = { ...appliedFilters };
  delete expenseFilters.source;
  delete expenseFilters.productType;
  const expenses = filterRecords(
    store.expenses.filter((expense) => expense.pageId === pageId),
    expenseFilters
  );
  const incomesWithNet = incomes
    .map((income) => ({
      ...income,
      netAmount: getIncomeNetAmount(store, income)
    }))
    .sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
  const expensesSorted = expenses.sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
  const summary = {
    totalIncome: sum(incomesWithNet, (income) => income.amount),
    totalExpenses: sum(expensesSorted, (expense) => expense.amount)
  };
  summary.net = summary.totalIncome - summary.totalExpenses;
  return {
    page,
    summary,
    incomes: incomesWithNet,
    expenses: expensesSorted
  };
}

function listPagesOverview() {
  return Object.values(PAGE_DEFINITIONS).map((page) => {
    const { summary } = buildPageSummary(page.id);
    return {
      id: page.id,
      label: page.label,
      categories: page.categories,
      summary
    };
  });
}

function userCanEdit(user, record) {
  if (!user) return false;
  if (user.role === ROLES.ADMIN || user.role === ROLES.MANAGER) return true;
  return record.createdById === user.id;
}

function userCanDelete(user) {
  return user && user.role === ROLES.ADMIN;
}

function createIncome(payload, user) {
  const page = getPage(payload.pageId);
  if (!page) throw new Error('Invalid page');
  const store = loadStore();
  const income = {
    id: generateIncomeId(),
    pageId: payload.pageId,
    date: payload.date,
    category: payload.category,
    source: payload.source || 'Direct',
    productType: payload.productType || 'Recorded',
    amount: Number(payload.amount) || 0,
    clientName: payload.clientName || '',
    broughtById: payload.broughtById || null,
    notes: payload.notes || '',
    createdById: user.id
  };
  mutateStore((state) => {
    state.incomes.push(income);
  });
  return income;
}

function updateIncome(incomeId, payload, user) {
  const store = loadStore();
  const income = store.incomes.find((item) => item.id === incomeId);
  if (!income) throw new Error('Income not found');
  if (!userCanEdit(user, income)) throw new Error('Forbidden');
  mutateStore((state) => {
    const target = state.incomes.find((item) => item.id === incomeId);
    Object.assign(target, {
      date: payload.date,
      category: payload.category,
      amount: Number(payload.amount) || 0,
      clientName: payload.clientName || '',
      broughtById: payload.broughtById || null,
      source: payload.source || target.source,
      productType: payload.productType || target.productType,
      notes: payload.notes || ''
    });
  });
  return loadStore().incomes.find((item) => item.id === incomeId);
}

function deleteIncome(incomeId, user) {
  const store = loadStore();
  const income = store.incomes.find((item) => item.id === incomeId);
  if (!income) throw new Error('Income not found');
  if (!userCanDelete(user)) throw new Error('Forbidden');
  mutateStore((state) => {
    state.incomes = state.incomes.filter((item) => item.id !== incomeId);
    state.expenses = state.expenses.map((expense) =>
      expense.linkedIncomeId === incomeId ? { ...expense, linkedIncomeId: null } : expense
    );
  });
}

function createExpense(payload, user) {
  const page = getPage(payload.pageId);
  if (!page) throw new Error('Invalid page');
  const expense = {
    id: generateExpenseId(),
    date: payload.date,
    pageId: payload.pageId,
    category: payload.category,
    amount: Number(payload.amount) || 0,
    linkedIncomeId: payload.linkedIncomeId || null,
    notes: payload.notes || '',
    createdById: user.id
  };
  mutateStore((state) => {
    state.expenses.push(expense);
  });
  return expense;
}

function updateExpense(expenseId, payload, user) {
  const store = loadStore();
  const expense = store.expenses.find((item) => item.id === expenseId);
  if (!expense) throw new Error('Expense not found');
  if (!userCanEdit(user, expense)) throw new Error('Forbidden');
  mutateStore((state) => {
    const target = state.expenses.find((item) => item.id === expenseId);
    Object.assign(target, {
      date: payload.date,
      category: payload.category,
      amount: Number(payload.amount) || 0,
      linkedIncomeId: payload.linkedIncomeId || null,
      notes: payload.notes || ''
    });
  });
  return loadStore().expenses.find((item) => item.id === expenseId);
}

function deleteExpense(expenseId, user) {
  const store = loadStore();
  const expense = store.expenses.find((item) => item.id === expenseId);
  if (!expense) throw new Error('Expense not found');
  if (!userCanDelete(user)) throw new Error('Forbidden');
  mutateStore((state) => {
    state.expenses = state.expenses.filter((item) => item.id !== expenseId);
  });
}

function calculateGeneralCommission(store, income, userId) {
  if (!income.broughtById || income.broughtById !== userId) return 0;
  if (income.pageId === 'sstda') return 0;
  const netAmount = getIncomeNetAmount(store, income);
  return netAmount * store.settings.commissionRate;
}

function calculateResearchShares(store, start, end) {
  const startMs = toMs(start);
  const endMs = toMs(end);
  const shares = {};
  store.incomes
    .filter((income) => income.pageId === 'research')
    .filter((income) => (startMs || endMs ? inRange(income.date, startMs, endMs) : true))
    .forEach((income) => {
      const net = getIncomeNetAmount(store, income);
      shares['u3'] = (shares['u3'] || 0) + net * store.settings.researchShares.manager;
      shares['u1'] = (shares['u1'] || 0) + net * store.settings.researchShares.tamer;
      shares['u2'] = (shares['u2'] || 0) + net * store.settings.researchShares.majdi;
      if (income.broughtById) {
        shares[income.broughtById] = (shares[income.broughtById] || 0) + net * store.settings.commissionRate;
      }
    });
  return shares;
}

function calculatePersonalOwnerProfits(store, start, end) {
  const startMs = toMs(start);
  const endMs = toMs(end);
  const profits = { u1: 0, u2: 0 };
  store.incomes
    .filter((income) => income.pageId === 'tamer' || income.pageId === 'majdi')
    .filter((income) => (startMs || endMs ? inRange(income.date, startMs, endMs) : true))
    .forEach((income) => {
      const net = getIncomeNetAmount(store, income);
      const ownerId = income.pageId === 'tamer' ? 'u1' : 'u2';
      const commission = income.broughtById ? net * store.settings.commissionRate : 0;
      profits[ownerId] += net - commission;
    });
  return profits;
}

function calculateMyWork(userId, start, end) {
  const store = loadStore();
  const startMs = toMs(start);
  const endMs = toMs(end);
  let deals = store.incomes.filter((income) => income.broughtById === userId);
  if (startMs || endMs) {
    deals = deals.filter((income) => inRange(income.date, startMs, endMs));
  }
  const dealDetails = deals.map((income) => {
    const net = getIncomeNetAmount(store, income);
    const commission = income.pageId === 'sstda' ? 0 : net * store.settings.commissionRate;
    return {
      id: income.id,
      pageId: income.pageId,
      category: income.category,
      source: income.source,
      productType: income.productType,
      clientName: income.clientName,
      date: income.date,
      amount: income.amount,
      netAmount: net,
      commission
    };
  });
  const totalCommission = sum(dealDetails, (deal) => deal.commission);
  const researchShares = calculateResearchShares(store, start, end);
  const personalProfits = calculatePersonalOwnerProfits(store, start, end);
  const weeklyEarnings = store.weeklyDistributions
    .filter((distribution) => {
      if (!startMs && !endMs) return true;
      const weekStart = toMs(distribution.weekStart);
      const weekEnd = toMs(distribution.weekEnd);
      return (!startMs || weekEnd >= startMs) && (!endMs || weekStart <= endMs);
    })
    .map((distribution) => ({
      id: distribution.id,
      weekStart: distribution.weekStart,
      weekEnd: distribution.weekEnd,
      amount: distribution.breakdown[userId] || 0
    }));
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

function projectSstdaDistribution(store, startDate, endDate) {
  const startMs = toMs(startDate);
  const endMs = toMs(endDate);
  if (!startMs || !endMs) throw new Error('Invalid dates');
  const incomes = store.incomes.filter((income) => income.pageId === 'sstda' && inRange(income.date, startMs, endMs));
  const expenses = store.expenses.filter(
    (expense) => expense.pageId === 'sstda' && !expense.linkedIncomeId && inRange(expense.date, startMs, endMs)
  );
  const totalIncome = sum(incomes, (income) => getIncomeNetAmount(store, income));
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
  const breakdown = {
    savings,
    majdiFee,
    tamerFee,
    thabit: thabitShare,
    u1: tamerShare + tamerFee,
    u2: majdiShare + majdiFee
  };
  return { totalIncome, totalExpenses, netProfit, breakdown };
}

function closeSSTDAWeek(startDate, endDate) {
  const store = loadStore();
  const projection = projectSstdaDistribution(store, startDate, endDate);
  const record = {
    id: generateDistributionId(),
    weekStart: startDate,
    weekEnd: endDate,
    ...projection
  };
  mutateStore((state) => {
    state.weeklyDistributions.push(record);
  });
  return record;
}

function calculateGlobalDashboard(range = {}) {
  const store = loadStore();
  const applied = { ...range };
  if (range.preset && (!range.start || !range.end)) {
    Object.assign(applied, resolvePreset(range.preset));
  }
  const startMs = toMs(applied.start);
  const endMs = toMs(applied.end);
  const incomes = store.incomes.filter((income) => (startMs || endMs ? inRange(income.date, startMs, endMs) : true));
  const expenses = store.expenses.filter((expense) => (startMs || endMs ? inRange(expense.date, startMs, endMs) : true));
  const totalIncome = sum(incomes, (income) => income.amount);
  const totalExpenses = sum(expenses, (expense) => expense.amount);
  const categoryTotals = {};
  const contributorTotals = {};
  incomes.forEach((income) => {
    categoryTotals[income.category] = (categoryTotals[income.category] || 0) + income.amount;
    if (income.broughtById) {
      contributorTotals[income.broughtById] = (contributorTotals[income.broughtById] || 0) + income.amount;
    }
  });
  const topCategories = Object.entries(categoryTotals)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([name, total]) => ({ name, total }));
  const topContributors = Object.entries(contributorTotals)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([userId, total]) => ({ userId, total }));
  return {
    totalIncome,
    totalExpenses,
    net: totalIncome - totalExpenses,
    topCategories,
    topContributors
  };
}

function calculatePayoutSummary(start, end) {
  const store = loadStore();
  const startMs = toMs(start);
  const endMs = toMs(end);
  const users = store.users.map((user) => ({ id: user.id, name: user.name }));
  const commissions = {};
  store.incomes
    .filter((income) => (startMs || endMs ? inRange(income.date, startMs, endMs) : true))
    .forEach((income) => {
      if (!income.broughtById) return;
      const amount = calculateGeneralCommission(store, income, income.broughtById);
      commissions[income.broughtById] = (commissions[income.broughtById] || 0) + amount;
    });
  const research = calculateResearchShares(store, start, end);
  const sstdaShares = {};
  store.weeklyDistributions
    .filter((distribution) => {
      if (!startMs && !endMs) return true;
      const weekStart = toMs(distribution.weekStart);
      const weekEnd = toMs(distribution.weekEnd);
      return (!startMs || weekEnd >= startMs) && (!endMs || weekStart <= endMs);
    })
    .forEach((distribution) => {
      Object.entries(distribution.breakdown).forEach(([key, amount]) => {
        sstdaShares[key] = (sstdaShares[key] || 0) + amount;
      });
    });
  const entries = [];
  users.forEach((user) => {
    const commission = commissions[user.id] || 0;
    const researchShare = research[user.id] || 0;
    const sstdaShare = sstdaShares[user.id] || 0;
    entries.push({
      id: user.id,
      name: user.name,
      commission,
      researchShare,
      sstdaShare,
      total: commission + researchShare + sstdaShare
    });
  });
  if (sstdaShares.thabit) {
    entries.push({ id: 'thabit', name: 'Thabit', commission: 0, researchShare: 0, sstdaShare: sstdaShares.thabit, total: sstdaShares.thabit });
  }
  if (sstdaShares.savings) {
    entries.push({ id: 'savings', name: 'Savings / Investment', commission: 0, researchShare: 0, sstdaShare: sstdaShares.savings, total: sstdaShares.savings });
  }
  return entries;
}

module.exports = {
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
  getPage,
  calculateResearchShares,
  calculatePersonalOwnerProfits,
  calculateGeneralCommission,
  getIncomeNetAmount,
  projectSstdaDistribution
};
