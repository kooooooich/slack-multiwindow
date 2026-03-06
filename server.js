// Custom server: Next.js + Slack Bolt simultaneous startup
// Railway / production deployment で使用

const { createServer } = require('http');
const { parse } = require('url');
const next = require('next');

const dev = process.env.NODE_ENV !== 'production';
const hostname = '0.0.0.0';
const port = parseInt(process.env.PORT || '3000', 10);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(async () => {
  // Slack Bolt を起動（Socket Mode対応ワークスペースがあれば）
  try {
    const { startSlackBolt } = require('./lib/bolt-server');
    await startSlackBolt();
    console.log('[Server] Slack Bolt initialized');
  } catch (err) {
    console.log('[Server] Slack Bolt initialization skipped:', err.message);
  }

  createServer(async (req, res) => {
    try {
      const parsedUrl = parse(req.url, true);
      await handle(req, res, parsedUrl);
    } catch (err) {
      console.error('Error occurred handling', req.url, err);
      res.statusCode = 500;
      res.end('internal server error');
    }
  }).listen(port, hostname, () => {
    console.log(`[Server] Ready on http://${hostname}:${port}`);
    console.log(`[Server] Environment: ${dev ? 'development' : 'production'}`);
  });
});
