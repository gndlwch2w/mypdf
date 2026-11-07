import { existsSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const python = process.platform === 'win32'
  ? join(projectRoot, '.venv', 'Scripts', 'python.exe')
  : join(projectRoot, '.venv', 'bin', 'python')

if (!existsSync(python)) {
  console.error('Missing .venv. Create it and install backend/requirements.txt and backend/requirements-build.txt.')
  process.exit(1)
}

// The desktop API uses h11/asyncio. Uvicorn's optional reload, WebSocket and
// accelerated protocol dependencies add native modules that PyInstaller tries
// to import while resolving Windows DLL search paths. Keeping them out of the
// frozen backend avoids the Windows CI import stall and produces a smaller exe.
const excludedModules = [
  'dotenv',
  'httptools',
  'tkinter',
  'tzdata',
  'uvloop',
  'watchfiles',
  'websockets',
  'yaml'
]

const traceWindows = process.platform === 'win32' && process.env.MYPDF_PYINSTALLER_TRACE === '1'
const args = [
  ...(traceWindows ? ['-u', 'scripts/trace-pyinstaller.py'] : ['-m', 'PyInstaller']),
  '--noconfirm',
  '--noupx',
  '--onefile',
  '--name', 'mypdf-backend',
  '--paths', 'backend',
  '--distpath', 'backend/dist',
  '--workpath', 'backend/build',
  '--specpath', 'backend',
  '--collect-binaries', 'fitz',
  '--collect-data', 'fitz',
  '--collect-binaries', 'pikepdf',
  '--collect-data', 'pikepdf',
  '--collect-data', 'pptx',
  '--hidden-import', 'app.main',
  '--hidden-import', 'app.api.pdf_routes',
  ...excludedModules.flatMap((moduleName) => ['--exclude-module', moduleName]),
  'backend/desktop_main.py'
]

if (process.env.MYPDF_PYINSTALLER_CLEAN === '1') args.splice(3, 0, '--clean')

const timeoutMs = Number(process.env.MYPDF_PYINSTALLER_TIMEOUT_MS ?? 20 * 60 * 1000)
const startedAt = Date.now()
const pyinstallerConfigDir = join(projectRoot, 'backend', '.pyinstaller-cache')
const child = spawn(python, args, {
  cwd: projectRoot,
  stdio: 'inherit',
  env: {
    ...process.env,
    PYTHONUNBUFFERED: '1',
    PYINSTALLER_CONFIG_DIR: process.env.PYINSTALLER_CONFIG_DIR ?? pyinstallerConfigDir
  }
})

const heartbeat = setInterval(() => {
  const elapsedSeconds = Math.round((Date.now() - startedAt) / 1000)
  console.log(`[backend-build] PyInstaller is still running (${elapsedSeconds}s elapsed)`)
}, 30_000)

let timedOut = false
const timeout = setTimeout(() => {
  timedOut = true
  console.error(`[backend-build] PyInstaller exceeded ${Math.round(timeoutMs / 60_000)} minutes and was stopped.`)
  child.kill('SIGTERM')
}, timeoutMs)

const exitCode = await new Promise((resolve, reject) => {
  child.once('error', reject)
  child.once('exit', (code) => resolve(code ?? 1))
}).catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  return 1
})

clearInterval(heartbeat)
clearTimeout(timeout)
process.exit(timedOut ? 124 : exitCode)
