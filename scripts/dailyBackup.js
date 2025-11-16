const { createBackup } = require('../src/services/backupService');

try {
  const backup = createBackup();
  console.log(`Backup created: ${backup.filename}`);
} catch (err) {
  console.error('Failed to create backup', err);
  process.exit(1);
}
