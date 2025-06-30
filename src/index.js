#!/usr/bin/env node

import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import NodeFetchCache, { MemoryCache } from 'node-fetch-cache';

const app = express();
const router = express.Router();
const port = process.env.PORT || 3000;


// Simple ping endpoint
router.get('/ping', (req, res) => res.send('pong'));

const fetch = NodeFetchCache.create({
  cache: new MemoryCache({ ttl: 60000 }),
  shouldCacheResponse: (response) => response.ok,
});

// Main handler for /d/:token and /i/:token
router.get(/([di])\/([A-Za-z0-9_-]+)\/?(.*)?/, async (req, res) => {
  try {
    const match = req.originalUrl.match(/([di])\/([A-Za-z0-9_-]+)\/?(.*)?/);
    if (!match) return res.redirect('/');

    const type = match[1]; // 'd' or 'i'
    const hash = match[2];
    const path = match[3] ? `path=/${match[3]}&` : '';
    const publicKeyUrl = `https://disk.yandex.ru/${type}/${hash}`;
    const apiUrl = `https://cloud-api.yandex.net/v1/disk/public/resources/download?${path}public_key=${publicKeyUrl}`;

    const response = await fetch(apiUrl);
    const result = await response.json();

    if (!response.ok || !result.href) {
      return res.status(response.status || 500).type('html').send(`
        <!DOCTYPE html>
        <html>
          <head><title>Error</title></head>
          <body>
            <h1>Error: Unable to generate download link</h1>
            <p><a href="/">Return home</a></p>
          </body>
        </html>
      `);
    }

    if (type === 'i') {
      // For image preview (or iframe usage), use 302 redirect
      return res.redirect(result.href);
    }

    // For direct download (/d/), return HTML with meta-refresh + JS redirect
    const html = `
      <!DOCTYPE html>
      <html lang="en">
        <head>
          <meta charset="UTF-8" />
          <title>Downloading...</title>
          <meta name="referrer" content="no-referrer" />
          <meta name="robots" content="noindex,nofollow" />
          <meta http-equiv="refresh" content="0; url=${result.href}" />
        </head>
        <body>
          <script>
            window.location.href = ${JSON.stringify(result.href)};
            setTimeout(function() {
              window.close();
            }, 3000); // Try to close the tab after 3 seconds
          </script>
          <noscript>
            <p>If you're not redirected, <a href="${result.href}">click here</a>.</p>
          </noscript>
        </body>
      </html>
    `;
    res.status(200).type('html').send(html);

  } catch (e) {
    res.redirect('/');
  }
});

// Fallback for unknown routes
router.all('*', (req, res) => {
  res.redirect('/');
});

// App config and middleware
app.set('json spaces', 2);
app.set('x-powered-by', false);

app.use(
  cors(),
  helmet({ contentSecurityPolicy: false, xDownloadOptions: false }),
  express.urlencoded({ extended: false }),
  express.json(),
  express.static('./public'),
  router
);

app.listen(port, () => {
  console.log(`listening at ${port}/tcp`);
});
