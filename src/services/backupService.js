const fs = require('fs');
const path = require('path');
const { loadStore, BACKUP_DIR } = require('../data/store');

function createBackup() {
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `sstda-backup-${timestamp}.json`;
  const filePath = path.join(BACKUP_DIR, filename);
  fs.writeFileSync(filePath, JSON.stringify(loadStore(), null, 2));
  return { filePath, filename };
}

function listBackups(limit = 5) {
  if (!fs.existsSync(BACKUP_DIR)) return [];
  return fs
    .readdirSync(BACKUP_DIR)
    .filter((name) => name.endsWith('.json'))
    .sort()
    .reverse()
    .slice(0, limit)
    .map((name) => ({
      filename: name,
      filePath: path.join(BACKUP_DIR, name)
    }));
}

function scheduleDailyBackup() {
  const dayMs = 24 * 60 * 60 * 1000;
  setInterval(() => {
    try {
      createBackup();
    } catch (err) {
      console.error('Failed to create automated backup', err);
    }
  }, dayMs);
}

module.exports = { createBackup, listBackups, scheduleDailyBackup };
