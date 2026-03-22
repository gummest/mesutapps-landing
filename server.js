import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

const X_API_KEY = process.env.X_API_KEY || '';
const X_API_SECRET = process.env.X_API_SECRET || '';
const X_CALLBACK_URL = process.env.X_CALLBACK_URL || 'https://mesutapps.online/auth/x/callback';

const stateStore = new Map();

// ── Static files (landing page) ─────────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'public')));

// ── X OAuth2 callback ───────────────────────────────────────────────────────
app.get('/auth/x/callback', async (req, res) => {
  const { code, state, error, error_description } = req.query;

  if (error) {
    return res.status(400).send(`<html><body style="font-family:sans-serif;padding:40px;background:#0d0d0f;color:#f5f5f7;"><h2 style="color:#ff4d6a;">X Auth Error</h2><p>${error_description || error}</p></body></html>`);
  }

  if (!code || !state) {
    return res.status(400).send('Missing code or state parameter.');
  }

  if (!stateStore.has(state)) {
    return res.status(400).send('Invalid or expired state. Restart the OAuth flow from <a href="/auth/x">here</a>.');
  }
  stateStore.delete(state);

  const tokenUrl = 'https://api.twitter.com/2/oauth2/token';
  const credentials = Buffer.from(`${X_API_KEY}:${X_API_SECRET}`).toString('base64');

  try {
    const tokenResponse = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${credentials}`,
      },
      body: new URLSearchParams({
        code,
        grant_type: 'authorization_code',
        client_id: X_API_KEY,
        redirect_uri: X_CALLBACK_URL,
      }),
    });

    const tokens = await tokenResponse.json();

    if (!tokenResponse.ok) {
      console.error('[x-auth] Token exchange failed:', tokens);
      return res.status(502).send(`<html><body style="font-family:sans-serif;padding:40px;background:#0d0d0f;color:#f5f5f7;"><h2 style="color:#ffb84d;">Token Exchange Failed</h2><pre style="color:#a0a0a8;">${JSON.stringify(tokens, null, 2)}</pre></body></html>`);
    }

    console.log('[x-auth] ✅ Token exchange successful!');
    res.send(`<!DOCTYPE html>
<html lang="tr">
<head><meta charset="UTF-8"><title>X Auth Success</title>
<style>
  body { font-family: Inter, sans-serif; background: #0d0d0f; color: #f5f5f7; padding: 40px; }
  .card { background: #161619; border: 1px solid #2a2a2f; border-radius: 12px; padding: 32px; max-width: 520px; margin: 0 auto; }
  h2 { color: #00e5a0; margin-bottom: 8px; }
  p { color: #a0a0a8; margin-bottom: 24px; }
  .token { background: #1e1e22; padding: 12px; border-radius: 6px; font-family: monospace; font-size: 11px; word-break: break-all; color: #00e5a0; max-height: 120px; overflow-y: auto; }
  .label { color: #6b6b75; font-size: 12px; margin-bottom: 4px; margin-top: 16px; }
  .ok { color: #00e5a0; font-weight: 600; }
  a { color: #7c5cff; }
</style></head>
<body>
<div class="card">
  <h2>✅ X OAuth Başarılı!</h2>
  <p>X hesabın başarıyla bağlandı. Artık paylaşım yapabilirsin.</p>
  <div class="label">Access Token</div>
  <div class="token">${tokens.access_token || 'N/A'}</div>
  ${tokens.refresh_token ? `<div class="label">Refresh Token</div><div class="token">${tokens.refresh_token}</div>` : ''}
  <p style="margin-top:24px;color:#6b6b75;font-size:13px;">📋 Bu token'ları <strong>ClipForge panelinde</strong> "X Entegrasyonu" bölümüne gir. Süresi dolunca yeniden authorize et.</p>
  <p><a href="/">&larr; Ana sayfaya dön</a></p>
</div>
</body></html>`);
  } catch (err) {
    console.error('[x-auth] Error:', err);
    res.status(500).send('Internal server error.');
  }
});

// ── X OAuth initiate ─────────────────────────────────────────────────────────
app.get('/auth/x', (req, res) => {
  const state = crypto.randomBytes(16).toString('hex');
  stateStore.set(state, { createdAt: Date.now() });

  if (!X_API_KEY) {
    return res.status(500).send('X_API_KEY not configured.');
  }

  const scope = 'tweet.read tweet.write users.read offline.access';
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: X_API_KEY,
    redirect_uri: X_CALLBACK_URL,
    scope,
    state,
  });

  res.redirect(`https://twitter.com/i/oauth2/authorize?${params.toString()}`);
});

// ── SPA fallback ─────────────────────────────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`mesutapps-landing running on port ${PORT}`);
  console.log(`X OAuth callback: /auth/x/callback`);
});
