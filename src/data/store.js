const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { ROLES } = require('../constants');

const DATA_DIR = path.join(__dirname, '../../data');
const DATA_PATH = path.join(DATA_DIR, 'db.json');
const BACKUP_DIR = path.join(__dirname, '../../backups');

const DEFAULT_USERS = [
  { id: 'u1', name: 'Tamer', username: 'tamer', role: ROLES.ADMIN },
  { id: 'u2', name: 'Majdi', username: 'majdi', role: ROLES.ADMIN },
  { id: 'u3', name: 'Sajedah', username: 'sajedah', role: ROLES.MANAGER },
  { id: 'u4', name: 'Sara', username: 'sara', role: ROLES.STAFF },
  { id: 'u5', name: 'Julnar', username: 'julnar', role: ROLES.STAFF }
];

const DEFAULT_SETTINGS = {
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
  },
  sessionTimeoutHours: {
    admin: 12,
    manager: 4,
    staff: 4
  }
};

let store;

function ensureDirectories() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }
}

function createDefaultStore() {
  const password = hashPassword('changeme');
  return {
    lastIncomeId: 0,
    lastExpenseId: 0,
    lastDistributionId: 0,
    users: DEFAULT_USERS.map((user) => ({ ...user, passwordHash: password, mustChangePassword: true })),
    incomes: [],
    expenses: [],
    weeklyDistributions: [],
    settings: DEFAULT_SETTINGS
  };
}

function ensureDataFile() {
  ensureDirectories();
  if (!fs.existsSync(DATA_PATH)) {
    store = createDefaultStore();
    persistStore();
    return;
  }
  const raw = JSON.parse(fs.readFileSync(DATA_PATH, 'utf-8'));
  const upgraded = upgradeStore(raw);
  store = upgraded;
  persistStore();
}

function upgradeStore(data) {
  let dirty = false;
  const clone = { ...data };
  if (!clone.settings) {
    clone.settings = DEFAULT_SETTINGS;
    dirty = true;
  } else {
    if (!clone.settings.researchShares) {
      clone.settings.researchShares = { ...DEFAULT_SETTINGS.researchShares };
      dirty = true;
    }
    if (!clone.settings.sstdaProfit) {
      clone.settings.sstdaProfit = { ...DEFAULT_SETTINGS.sstdaProfit };
      dirty = true;
    }
    if (!clone.settings.sessionTimeoutHours) {
      clone.settings.sessionTimeoutHours = { ...DEFAULT_SETTINGS.sessionTimeoutHours };
      dirty = true;
    }
  }
  clone.users = (clone.users || []).map((user) => {
    const next = { ...user };
    if (!next.passwordHash || next.passwordHash.split(':').length !== 2) {
      next.passwordHash = hashPassword('changeme');
      dirty = true;
    }
    if (typeof next.mustChangePassword === 'undefined') {
      next.mustChangePassword = true;
      dirty = true;
    }
    return next;
  });
  clone.incomes = (clone.incomes || []).map((income) => ({
    source: 'Direct',
    productType: 'Recorded',
    ...income
  }));
  clone.expenses = clone.expenses || [];
  clone.weeklyDistributions = clone.weeklyDistributions || [];
  if (typeof clone.lastIncomeId !== 'number') clone.lastIncomeId = 0;
  if (typeof clone.lastExpenseId !== 'number') clone.lastExpenseId = 0;
  if (typeof clone.lastDistributionId !== 'number') clone.lastDistributionId = 0;
  if (dirty) {
    return clone;
  }
  return data;
}

function loadStore() {
  if (!store) {
    ensureDataFile();
  }
  return store;
}

function persistStore() {
  fs.writeFileSync(DATA_PATH, JSON.stringify(store, null, 2));
}

function mutateStore(mutator) {
  const current = loadStore();
  mutator(current);
  persistStore();
}

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const derived = crypto.scryptSync(password, salt, 64);
  return `${salt}:${derived.toString('hex')}`;
}

function verifyPassword(password, hashValue) {
  if (!hashValue) return false;
  const [salt, hashed] = hashValue.split(':');
  if (!salt || !hashed) return false;
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  const hashBuffer = Buffer.from(hashed, 'hex');
  const derivedBuffer = Buffer.from(derived, 'hex');
  if (hashBuffer.length !== derivedBuffer.length) {
    return false;
  }
  return crypto.timingSafeEqual(hashBuffer, derivedBuffer);
}

function generateIncomeId() {
  const current = loadStore();
  current.lastIncomeId += 1;
  persistStore();
  return `inc_${current.lastIncomeId}`;
}

function generateExpenseId() {
  const current = loadStore();
  current.lastExpenseId += 1;
  persistStore();
  return `exp_${current.lastExpenseId}`;
}

function generateDistributionId() {
  const current = loadStore();
  current.lastDistributionId += 1;
  persistStore();
  return `dist_${current.lastDistributionId}`;
}

module.exports = {
  loadStore,
  mutateStore,
  persistStore,
  hashPassword,
  verifyPassword,
  generateIncomeId,
  generateExpenseId,
  generateDistributionId,
  DATA_PATH,
  BACKUP_DIR,
  DEFAULT_SETTINGS
};
