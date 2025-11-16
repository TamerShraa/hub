# SSTDA Finance Hub

A dependency-free Node.js application that tracks revenues, expenses, commissions, research shares, and SSTDA weekly profit distributions for Smart Summit TDA.

## Highlights

- **Modular API** with dedicated services for authentication, finance logic, backups, and reporting.
- **Role-aware security** using salted `scrypt` hashing, configurable session windows, HttpOnly + SameSite cookies, and forced password rotation on first login.
- **Four isolated ledgers** (SSTDA, Tamer Personal, Majdi Personal, Research Work) with tagging for source & product type plus linked direct expenses.
- **Professional UI** featuring a global dashboard, quick filter presets, inline validation, sortable tables, payout summary, and richer “My Work” insights.
- **Invoice-ready workflows** with sequential Smart Summit invoice numbers, printable PDF exports, and branded previews for every income or expense entry.
- **Personal theme toggle** so each teammate can switch between light and dark modes with preferences remembered per browser.
- **Finance automation** for commissions, research splits, personal page profits, SSTDA weekly close, and per-person payout exports.
- **Resilience tooling** including on-demand + scheduled JSON backups and a Node test suite that validates core money logic.

## Getting started

1. Ensure Node.js 18+ is available (no third-party packages are required).
2. Start the server:
   ```bash
   npm start
   ```
3. Open `http://localhost:3000`.
4. Sign in with one of the seeded accounts (username matches the first name, password `changeme`). You will be prompted to set a new password immediately.

### Backups

- Click **Backup all data** inside *Settings* to stream the latest JSON snapshot.
- Automated daily backups run inside the server. To trigger the same routine manually (e.g., for cron), run:
  ```bash
  npm run backup
  ```

## Tests

Core finance rules are covered with the built-in Node test runner:
```bash
npm test
```

## Project layout

```
public/         # Front-end (HTML/CSS/JS)
src/            # Routes, services, utilities, and router
data/db.json    # JSON datastore
scripts/        # Maintenance scripts (backups)
server.js       # HTTP server bootstrap
```

Data is persisted in `data/db.json`. Always keep this file (and generated backups) safe.
