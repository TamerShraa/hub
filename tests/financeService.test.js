const test = require('node:test');
const assert = require('node:assert');
const {
  calculateGeneralCommission,
  calculateResearchShares,
  getIncomeNetAmount,
  projectSstdaDistribution
} = require('../src/services/financeService');

const baseSettings = {
  commissionRate: 0.05,
  researchShares: { manager: 0.2, tamer: 0.375, majdi: 0.375 },
  sstdaProfit: {
    savings: 0.2,
    majdiFee: 0.1,
    tamerFee: 0.1,
    thabit: 0.114,
    tamerShare: 0.443,
    majdiShare: 0.443
  }
};

test('net amount subtracts linked expenses', () => {
  const store = { expenses: [{ linkedIncomeId: 'inc_1', amount: 200 }] };
  const income = { id: 'inc_1', amount: 1000 };
  const net = getIncomeNetAmount(store, income);
  assert.equal(net, 800);
});

test('commission skips SSTDA deals and respects brought by', () => {
  const store = { expenses: [], settings: baseSettings };
  const income = { id: 'inc_2', amount: 2000, pageId: 'tamer', broughtById: 'u4' };
  const commission = calculateGeneralCommission(store, income, 'u4');
  assert.equal(commission, 100); // 5% of 2000
  const sstdaIncome = { id: 'inc_3', amount: 1500, pageId: 'sstda', broughtById: 'u4' };
  const sstdaCommission = calculateGeneralCommission(store, sstdaIncome, 'u4');
  assert.equal(sstdaCommission, 0);
});

test('research shares split net amount and add commission for bringer', () => {
  const store = {
    expenses: [{ linkedIncomeId: 'inc_4', amount: 100 }],
    incomes: [
      { id: 'inc_4', amount: 1000, pageId: 'research', broughtById: 'u4', date: '2024-01-01' }
    ],
    settings: baseSettings
  };
  const shares = calculateResearchShares(store, '2023-12-01', '2024-12-31');
  const net = 900;
  assert.equal(shares.u3, net * baseSettings.researchShares.manager);
  assert.equal(shares.u1, net * baseSettings.researchShares.tamer);
  assert.equal(shares.u2, net * baseSettings.researchShares.majdi);
  assert.equal(shares.u4, net * baseSettings.commissionRate);
});

test('SSTDA projection respects configured percentages', () => {
  const store = {
    incomes: [
      { id: 'inc_5', amount: 5000, pageId: 'sstda', date: '2024-02-10' }
    ],
    expenses: [
      { id: 'exp_1', amount: 800, pageId: 'sstda', date: '2024-02-11' }
    ],
    settings: baseSettings
  };
  const projection = projectSstdaDistribution(store, '2024-02-05', '2024-02-12');
  assert.equal(projection.totalIncome, 5000);
  assert.equal(projection.totalExpenses, 800);
  const expectedNet = 4200;
  assert.equal(projection.netProfit, expectedNet);
  assert(Math.abs(projection.breakdown.savings - expectedNet * baseSettings.sstdaProfit.savings) < 0.001);
  assert(Math.abs(projection.breakdown.u1 - ((expectedNet - expectedNet * (baseSettings.sstdaProfit.savings + baseSettings.sstdaProfit.majdiFee + baseSettings.sstdaProfit.tamerFee)) * baseSettings.sstdaProfit.tamerShare + expectedNet * baseSettings.sstdaProfit.tamerFee)) < 0.001);
});
