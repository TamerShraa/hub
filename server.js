const http = require('http');
const path = require('path');
const fs = require('fs');
const { handle, sendJson } = require('./src/router');
require('./src/routes');
const { scheduleDailyBackup } = require('./src/services/backupService');

const PUBLIC_DIR = path.join(__dirname, 'public');

function serveStatic(req, res) {
  let pathname = req.url.split('?')[0];
  if (pathname === '/') pathname = '/index.html';
  const filePath = path.normalize(path.join(PUBLIC_DIR, pathname));
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end('Forbidden');
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

const server = http.createServer(async (req, res) => {
  try {
    if (req.url.startsWith('/api/')) {
      const handled = await handle(req, res);
      if (!handled) {
        sendJson(res, 404, { message: 'Not found' });
      }
      return;
    }
    if (serveStatic(req, res)) {
      return;
    }
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
  } catch (err) {
    console.error(err);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ message: 'Internal server error' }));
  }
});

scheduleDailyBackup();

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
