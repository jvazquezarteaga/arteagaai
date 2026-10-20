// Tiny local server so you can run the app without the Vercel CLI:
//   npm install && npm run dev      then open http://localhost:3000
// (Vercel does NOT use this file. It is for development only.)

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const handler = require('./api/audit');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
};

// Adds the res.status().json() helpers that Vercel provides automatically.
function addVercelHelpers(res) {
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (data) => {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(data));
  };
}

http
  .createServer((req, res) => {
    if (req.url.startsWith('/api/audit')) {
      addVercelHelpers(res);
      let raw = '';
      req.on('data', (chunk) => (raw += chunk));
      req.on('end', () => {
        try {
          req.body = raw ? JSON.parse(raw) : {};
        } catch {
          req.body = {};
        }
        handler(req, res);
      });
      return;
    }

    // Static files from /public
    const urlPath = req.url.split('?')[0];
    const filePath = path.join(PUBLIC_DIR, urlPath === '/' ? 'index.html' : urlPath);
    if (!filePath.startsWith(PUBLIC_DIR)) {
      res.statusCode = 403;
      return res.end('Forbidden');
    }
    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.statusCode = 404;
        return res.end('Not found');
      }
      res.setHeader('Content-Type', MIME[path.extname(filePath)] || 'application/octet-stream');
      res.end(data);
    });
  })
  .listen(PORT, () => console.log(`Audit tool running at http://localhost:${PORT}`));
