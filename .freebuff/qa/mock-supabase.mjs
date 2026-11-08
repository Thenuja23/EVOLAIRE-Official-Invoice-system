import http from 'node:http'

const PORT = 5190

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,PATCH,PUT,DELETE,OPTIONS',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Expose-Headers': 'Content-Range, X-Client-Info',
}

const user = {
  id: 'qa-owner',
  aud: 'authenticated',
  role: 'authenticated',
  email: 'qa@evolaire.local',
  email_confirmed_at: '2026-01-01T00:00:00.000Z',
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
  app_metadata: { provider: 'email', providers: ['email'] },
  user_metadata: {},
}

function nowSeconds() {
  return Math.floor(Date.now() / 1000)
}

function session() {
  return {
    access_token: 'qa-access-token',
    token_type: 'bearer',
    expires_in: 36000,
    expires_at: nowSeconds() + 36000,
    refresh_token: 'qa-refresh-token',
    user,
  }
}

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  for (const [key, value] of Object.entries(cors)) res.setHeader(key, value)
  if (req.method === 'OPTIONS') {
    res.writeHead(204).end()
    return
  }

  const url = new URL(req.url ?? '/', `http://127.0.0.1:${PORT}`)

  if (url.pathname.startsWith('/auth/v1/token')) {
    res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(session()))
    return
  }
  if (url.pathname === '/auth/v1/user') {
    res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(user))
    return
  }
  if (url.pathname.startsWith('/auth/v1/logout')) {
    res.writeHead(204).end()
    return
  }

  // Every data request follows the app's documented RLS fallback path.
  res.writeHead(403, { 'Content-Type': 'application/json' }).end(
    JSON.stringify({
      code: '42501',
      message: 'new row violates row-level security policy for table "qa"',
      details: null,
      hint: null,
    }),
  )
})

server.listen(PORT, '127.0.0.1', () => {
  console.log(`QA stub listening on http://127.0.0.1:${PORT}`)
})
