const crypto = require('crypto');
const { loadStore, mutateStore, hashPassword, verifyPassword } = require('../data/store');
const { ROLES } = require('../constants');

const sessions = new Map();

function parseCookies(header = '') {
  return header.split(';').reduce((acc, pair) => {
    const [key, value] = pair.trim().split('=');
    if (key) acc[key] = decodeURIComponent(value || '');
    return acc;
  }, {});
}

function getSessionTtl(role) {
  const store = loadStore();
  const hours = store.settings.sessionTimeoutHours?.[role] ?? 12;
  return hours * 60 * 60 * 1000;
}

function createSession(user) {
  const token = crypto.randomBytes(24).toString('hex');
  const ttl = getSessionTtl(user.role);
  sessions.set(token, { userId: user.id, expiresAt: Date.now() + ttl });
  return { token, ttl };
}

function getUserFromRequest(req) {
  const cookies = parseCookies(req.headers.cookie || '');
  const token = cookies.auth;
  if (!token) return null;
  const session = sessions.get(token);
  if (!session) return null;
  if (Date.now() > session.expiresAt) {
    sessions.delete(token);
    return null;
  }
  const store = loadStore();
  return store.users.find((u) => u.id === session.userId) || null;
}

function login(username, password) {
  const store = loadStore();
  const user = store.users.find((u) => u.username === username);
  if (!user) return null;
  if (!verifyPassword(password, user.passwordHash)) {
    return null;
  }
  const session = createSession(user);
  const sanitized = sanitizeUser(user);
  return { token: session.token, ttl: session.ttl, user: sanitized };
}

function logout(token) {
  if (token && sessions.has(token)) {
    sessions.delete(token);
  }
}

function sanitizeUser(user) {
  const { passwordHash, ...rest } = user;
  return rest;
}

function requireRole(user, roles = []) {
  if (!user) return false;
  if (!roles.length) return true;
  return roles.includes(user.role);
}

function changePassword(userId, currentPassword, newPassword) {
  if (!newPassword || newPassword.length < 8) {
    return { error: 'New password must be at least 8 characters.' };
  }
  const store = loadStore();
  const user = store.users.find((u) => u.id === userId);
  if (!user) return { error: 'User not found' };
  if (!verifyPassword(currentPassword, user.passwordHash)) {
    return { error: 'Current password is incorrect.' };
  }
  const nextHash = hashPassword(newPassword);
  mutateStore((state) => {
    const target = state.users.find((u) => u.id === userId);
    target.passwordHash = nextHash;
    target.mustChangePassword = false;
  });
  return { success: true };
}

function forcePasswordChange(userId, newPassword) {
  if (!newPassword || newPassword.length < 8) {
    return { error: 'New password must be at least 8 characters.' };
  }
  mutateStore((state) => {
    const target = state.users.find((u) => u.id === userId);
    if (!target) throw new Error('User not found');
    target.passwordHash = hashPassword(newPassword);
    target.mustChangePassword = false;
  });
  return { success: true };
}

function buildAuthCookie(token, ttlMs) {
  const parts = [`auth=${token}`, 'HttpOnly', 'Path=/', `Max-Age=${Math.floor(ttlMs / 1000)}`, 'SameSite=Lax'];
  if (process.env.COOKIE_SECURE === 'true' || process.env.NODE_ENV === 'production') {
    parts.push('Secure');
  }
  return parts.join('; ');
}

module.exports = {
  parseCookies,
  getUserFromRequest,
  login,
  logout,
  requireRole,
  sanitizeUser,
  changePassword,
  forcePasswordChange,
  buildAuthCookie
};
