# SSTDA Finance Hub

A lightweight Node.js application that tracks revenues, expenses, commissions, and special sharing rules for Smart Summit TDA.

## Features

- Four isolated accounting areas: SSTDA, Tamer Personal, Majdi Personal, and Research Work.
- Role-based access (admin, manager, staff) with secure cookie sessions.
- CRUD workflows for incomes and expenses, including optional links between deals and direct costs.
- Automatic calculation of general commissions, research shares, personal page profits, and SSTDA weekly distributions.
- "My Work" dashboard that summarizes deals, commissions, research allocations, and global SSTDA payouts per user.
- Configurable percentages for all distribution rules from the admin settings page.
- CSV exports for each page's incomes and expenses.

## Getting started

1. **Install dependencies** – none beyond Node.js 18+ (already available in this environment).
2. **Start the server:**
   ```bash
   npm start
   ```
3. Open `http://localhost:3000` in a browser.
4. Sign in with one of the seeded accounts (all default to password `changeme`). Please update the credentials by editing `data/db.json` before deploying.

## Project structure

```
public/         # Static client (HTML/CSS/JS)
data/db.json    # Simple JSON datastore
server.js       # HTTP server and API implementation
```

Data is persisted inside `data/db.json`. Back up this file regularly.
