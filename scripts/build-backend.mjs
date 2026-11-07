import { existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const python = process.platform === 'win32'
  ? join(projectRoot, '.venv', 'Scripts', 'python.exe')
  : join(projectRoot, '.venv', 'bin', 'python')

if (!existsSync(python)) {
  console.error('Missing .venv. Create it and install backend/requirements.txt plus pyinstaller.')
  process.exit(1)
}

const args = [
  '-m', 'PyInstaller',
  '--noconfirm',
  '--clean',
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
  'backend/desktop_main.py'
]

const result = spawnSync(python, args, { cwd: projectRoot, stdio: 'inherit' })
if (result.error) {
  console.error(result.error.message)
  process.exit(1)
}
process.exit(result.status ?? 1)
