// Acceptance support: brings up THIS project's local Supabase stack, resets it to
// the repository migrations, builds the bundle against that stack, and serves the
// built dist/ over a real loopback HTTP origin, which is what GitHub Pages does.
//
// The service-role key is never written here: it is read back from the running
// stack, so no key of any kind lives in the repository.
import { execFileSync } from 'node:child_process'
import { createServer, type Server } from 'node:http'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')

// config.toml pins the stack's api port and names http://127.0.0.1:4317 as the
// site_url, so the acceptance origin must be exactly that.
export const ORIGIN_HOST = '127.0.0.1'
export const ORIGIN_PORT = 4317
export const ORIGIN = `http://${ORIGIN_HOST}:${ORIGIN_PORT}`

export type Stack = {
  readonly apiUrl: string
  readonly anonKey: string
  readonly serviceRoleKey: string
}

const supabaseBin = (): string => {
  const require = createRequire(import.meta.url)
  // The CLI is a devDependency, so node_modules/.bin provides it.
  return path.join(repoRoot, 'node_modules', '.bin', 'supabase')
}

const run = (file: string, args: readonly string[], env?: NodeJS.ProcessEnv): void => {
  execFileSync(file, [...args], {
    cwd: repoRoot,
    stdio: 'inherit',
    env: { ...process.env, ...env },
  })
}

const capture = (file: string, args: readonly string[]): string =>
  execFileSync(file, [...args], { cwd: repoRoot, encoding: 'utf8' })

/**
 * Starts the stack if it is not already up, then resets the database so it holds
 * exactly the repository's migrations and no rows.
 */
export const startLocalStack = (): Stack => {
  const supabase = supabaseBin()
  try {
    run(supabase, ['start'])
  } catch {
    // Already running is not a failure; `status` below is the real check.
  }
  run(supabase, ['db', 'reset', '--no-seed'])

  const raw = capture(supabase, ['status', '-o', 'json'])
  const status = JSON.parse(raw) as Record<string, string>
  const apiUrl = status['API_URL']
  const anonKey = status['ANON_KEY']
  const serviceRoleKey = status['SERVICE_ROLE_KEY']
  if (!apiUrl || !anonKey || !serviceRoleKey) {
    throw new Error(`Local stack did not report its URL and keys: ${raw}`)
  }
  return { apiUrl, anonKey, serviceRoleKey }
}

/**
 * Builds the bundle the acceptance run judges. Only the project URL and the anon
 * key cross into the bundle, as the two documented build-time variables.
 */
export const buildBundle = (stack: Stack): void => {
  run('npm', ['run', 'build'], {
    VITE_SUPABASE_URL: stack.apiUrl,
    VITE_SUPABASE_ANON_KEY: stack.anonKey,
    PAGES_BASE: '/',
  })
}

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.webmanifest': 'application/manifest+json',
}

export type ServedOrigin = { readonly origin: string; readonly close: () => Promise<void> }

/** Serves the BUILT bundle in dist/ over a real HTTP origin. */
export const serveDist = async (): Promise<ServedOrigin> => {
  const root = path.join(repoRoot, 'dist')
  const server: Server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', ORIGIN)
    const requested = url.pathname === '/' ? '/index.html' : url.pathname
    const resolved = path.join(root, path.normalize(requested))
    if (!resolved.startsWith(root)) {
      res.writeHead(403).end()
      return
    }
    readFile(resolved)
      .then((body) => {
        res.writeHead(200, {
          'content-type': CONTENT_TYPES[path.extname(resolved)] ?? 'application/octet-stream',
          'cache-control': 'no-store',
        })
        res.end(body)
      })
      .catch(() => {
        // A single-page bundle: unknown paths fall back to the document.
        readFile(path.join(root, 'index.html'))
          .then((body) => {
            res.writeHead(200, { 'content-type': CONTENT_TYPES['.html']!, 'cache-control': 'no-store' })
            res.end(body)
          })
          .catch(() => res.writeHead(404).end())
      })
  })

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(ORIGIN_PORT, ORIGIN_HOST, resolve)
  })

  return {
    origin: ORIGIN,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  }
}
