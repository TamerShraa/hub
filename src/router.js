const url = require('url');

const routes = [];

function register(method, pattern, handler) {
  routes.push({ method: method.toUpperCase(), pattern, handler });
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    if (req.method === 'GET' || req.method === 'DELETE') {
      return resolve(null);
    }
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > 1e6) {
        reject(new Error('Payload too large'));
        req.destroy();
      }
    });
    req.on('end', () => {
      if (!data) return resolve(null);
      try {
        resolve(JSON.parse(data));
      } catch (err) {
        reject(err);
      }
    });
  });
}

function matchPath(pattern, actualPath) {
  const patternSegments = pattern.split('/').filter(Boolean);
  const actualSegments = actualPath.split('/').filter(Boolean);
  if (patternSegments.length !== actualSegments.length) return null;
  const params = {};
  for (let i = 0; i < patternSegments.length; i += 1) {
    const expected = patternSegments[i];
    const value = actualSegments[i];
    if (expected.startsWith(':')) {
      params[expected.slice(1)] = value;
    } else if (expected !== value) {
      return null;
    }
  }
  return params;
}

async function handle(req, res, context = {}) {
  const parsed = url.parse(req.url, true);
  const pathname = parsed.pathname;
  const route = routes.find((item) => item.method === req.method && matchPath(item.pattern, pathname));
  if (!route) {
    return false;
  }
  const params = matchPath(route.pattern, pathname);
  let body = null;
  try {
    body = await parseBody(req);
  } catch (err) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ message: 'Invalid JSON payload' }));
    return true;
  }
  const ctx = { query: parsed.query, params, body, ...context };
  await route.handler(req, res, ctx);
  return true;
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(payload));
}

module.exports = { register, handle, sendJson };
