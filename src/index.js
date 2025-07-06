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

    // Get resource_key and path from query parameters
    const resourceKey = req.query.resource_key;
    const pathParam = req.query.path;

    // Accept full public_url as query param for maximum compatibility
    let publicKeyUrl = req.query.public_url;
    if (!publicKeyUrl) {
      publicKeyUrl = `https://disk.yandex.com/${type}/${hash}`;
      const urlParams = [];
      if (resourceKey) urlParams.push(`resource_key=${encodeURIComponent(resourceKey)}`);
      if (pathParam) urlParams.push(`path=${encodeURIComponent(pathParam)}`);
      if (urlParams.length) publicKeyUrl += `?${urlParams.join('&')}`;
    }

    const apiUrl = `https://cloud-api.yandex.net/v1/disk/public/resources/download?public_key=${encodeURIComponent(publicKeyUrl)}`;
    const response = await fetch(apiUrl);
    const result = await response.json();

    // Debug log for troubleshooting
    if (!response.ok || !result.href) {
      console.error('Yandex API error:', {
        status: response.status,
        statusText: response.statusText,
        apiUrl,
        result
      });
      return res.status(response.status || 500).type('html').send(`
        <!DOCTYPE html>
        <html>
          <head><title>Error</title></head>
          <body>
            <h1>Error: Unable to generate download link</h1>
            <pre>Status: ${response.status} ${response.statusText}</pre>
            <pre>${JSON.stringify(result, null, 2)}</pre>
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
          <title>Redirecting...</title>
          <meta http-equiv="refresh" content="0; url=${result.href}" />
        </head>
        <body>
          <script>
            window.location.href = ${JSON.stringify(result.href)};
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
