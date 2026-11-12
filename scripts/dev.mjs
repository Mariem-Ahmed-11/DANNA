import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { createInterface } from 'node:readline'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'
import net from 'node:net'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const backend = join(root, 'backend')
const frontend = join(root, 'frontend')
const viteCli = join(frontend, 'node_modules', 'vite', 'bin', 'vite.js')
const php = [process.env.DANNA_PHP, process.env.PHP_EXECUTABLE, process.platform === 'win32' ? 'C:\\xampp\\php\\php.exe' : undefined, 'php']
  .filter(Boolean)
  .find((candidate) => candidate === 'php' || existsSync(candidate))
const children = new Set()
let stopping = false
let shutdownPromise

function fail(message) {
  console.error(`[DHANA] ${message}`)
  process.exitCode = 1
}

function portAvailable(port) {
  return new Promise((resolvePort, rejectPort) => {
    const server = net.createServer()
    server.once('error', (error) => error.code === 'EADDRINUSE' ? resolvePort(false) : rejectPort(error))
    server.once('listening', () => server.close(() => resolvePort(true)))
    server.listen(port, '127.0.0.1')
  })
}

function start(label, command, args, cwd) {
  const child = spawn(command, args, { cwd, stdio: ['inherit', 'pipe', 'pipe'], windowsHide: true })
  children.add(child)
  for (const [stream, output] of [['stdout', process.stdout], ['stderr', process.stderr]]) {
    createInterface({ input: child[stream] }).on('line', (line) => output.write(`[${label}] ${line}\n`))
  }
  child.on('error', (error) => {
    console.error(`[${label}] Could not start: ${error.message}`)
    children.delete(child)
    void stop(1)
  })
  child.on('close', (code, signal) => {
    children.delete(child)
    if (!stopping) {
      console.error(`[${label}] exited unexpectedly (${signal || `code ${code}`}). Stopping the other server.`)
      void stop(code || 1)
    }
  })
}

function endProcessTree(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return

  try {
    if (process.platform === 'win32') {
      spawn('taskkill', ['/pid', String(child.pid), '/t', '/f'], { stdio: 'ignore', windowsHide: true })
      return
    }

    child.kill('SIGTERM')
    const watchdog = setTimeout(() => {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill('SIGKILL')
      }
    }, 2000)

    child.once('close', () => clearTimeout(watchdog))
  } catch (error) {
    console.error(`[DHANA] Could not terminate child process ${child.pid}: ${error.message}`)
  }
}

async function stop(exitCode = 0) {
  if (stopping) return shutdownPromise
  stopping = true
  process.exitCode = exitCode

  const activeChildren = [...children]
  const closed = activeChildren.map((child) => {
    if (child.exitCode !== null || child.signalCode !== null) {
      return Promise.resolve()
    }

    return new Promise((resolveClose) => {
      const onClose = () => {
        children.delete(child)
        resolveClose()
      }

      child.once('close', onClose)
      endProcessTree(child)

      setTimeout(() => {
        if (child.exitCode === null && child.signalCode === null) {
          child.removeListener('close', onClose)
          children.delete(child)
          resolveClose()
        }
      }, 4000)
    })
  })

  shutdownPromise = Promise.all(closed)
  await shutdownPromise
  children.clear()
  return shutdownPromise
}

async function main() {
  const required = [[backend, 'backend directory'], [join(backend, 'artisan'), 'Laravel artisan file'], [frontend, 'frontend directory'], [viteCli, 'frontend dependencies (run npm install in frontend)']]
  const missing = required.find(([file]) => !existsSync(file))
  if (missing) return fail(`Missing ${missing[1]}: ${missing[0]}`)
  if (!php) return fail('PHP was not found. Set DANNA_PHP or PHP_EXECUTABLE to php.exe, or install PHP on PATH.')
  const occupied = []
  for (const port of [8000, 5173]) if (!(await portAvailable(port))) occupied.push(port)
  if (occupied.length) return fail(`Port${occupied.length > 1 ? 's' : ''} ${occupied.join(', ')} ${occupied.length > 1 ? 'are' : 'is'} already in use. Stop the process using ${occupied.length > 1 ? 'them' : 'it'} before running npm run dev.`)
  console.log('[DHANA] Starting Laravel at http://127.0.0.1:8000 and Vite at http://127.0.0.1:5173')
  start('Laravel', php, ['artisan', 'serve', '--host=127.0.0.1', '--port=8000'], backend)
  start('Vite', process.execPath, [viteCli, '--host', '127.0.0.1', '--port', '5173', '--strictPort'], frontend)
}

process.on('SIGINT', () => void stop(0))
process.on('SIGTERM', () => void stop(0))
void main().catch((error) => fail(error.message))
