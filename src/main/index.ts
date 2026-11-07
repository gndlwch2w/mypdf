import { app, BrowserWindow, dialog, ipcMain, Menu, shell } from 'electron'
import { readFile, stat, writeFile } from 'node:fs/promises'
import { basename, extname, join } from 'node:path'
import { electronApp, is } from '@electron-toolkit/utils'
import { BackendService, filenameForOutput } from './backend'
import type { DesktopFile, ProcessRequest, ToolId } from '../shared/types'

const backend = new BackendService()
let mainWindow: BrowserWindow | null = null

const imageExtensions = new Set(['.jpg', '.jpeg', '.png', '.bmp', '.tif', '.tiff', '.gif', '.webp'])
const powerpointExtensions = new Set(['.ppt', '.pptx'])

function mimeForPath(path: string): string {
  const extension = extname(path).toLowerCase()
  if (extension === '.pdf') return 'application/pdf'
  if (extension === '.ppt') return 'application/vnd.ms-powerpoint'
  if (extension === '.pptx') return 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  if (extension === '.png') return 'image/png'
  if (extension === '.jpg' || extension === '.jpeg') return 'image/jpeg'
  if (extension === '.webp') return 'image/webp'
  if (extension === '.gif') return 'image/gif'
  if (extension === '.bmp') return 'image/bmp'
  if (extension === '.tif' || extension === '.tiff') return 'image/tiff'
  return 'application/octet-stream'
}

async function describePath(path: string): Promise<DesktopFile> {
  const info = await stat(path)
  return { path, name: basename(path), size: info.size, type: mimeForPath(path) }
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1220,
    height: 720,
    minWidth: 1120,
    minHeight: 720,
    fullscreenable: false,
    show: false,
    title: 'MyPDF',
    backgroundColor: '#f5f4ef',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    trafficLightPosition: process.platform === 'darwin' ? { x: 16, y: 17 } : undefined,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  mainWindow.once('ready-to-show', () => mainWindow?.show())
  mainWindow.webContents.on('dom-ready', () => console.log('Renderer DOM is ready'))
  mainWindow.webContents.on('did-finish-load', () => {
    console.log('Renderer finished loading')
    mainWindow?.show()
  })
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  mainWindow.webContents.on('will-navigate', (event) => event.preventDefault())
  mainWindow.webContents.on('did-fail-load', (_event, code, description) => {
    console.error(`Renderer failed to load (${code}): ${description}`)
  })
  mainWindow.webContents.on('console-message', (details) => {
    if (details.level === 'error') console.error(`[renderer] ${details.message}`)
  })

  if (is.dev && process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL).catch((error) => console.error('Renderer URL load failed', error))
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html')).catch((error) => console.error('Renderer file load failed', error))
  }
}

function registerIpc(): void {
  ipcMain.handle('dialog:select-files', async (_event, tool: ToolId) => {
    const images = tool === 'images-to-pdf'
    const powerpoint = tool === 'powerpoint'
    const multiple = images || powerpoint || tool === 'merge' || tool === 'compress' || tool === 'rotate' || tool === 'organize'
    const result = await dialog.showOpenDialog(mainWindow!, {
      properties: multiple ? ['openFile', 'multiSelections'] : ['openFile'],
      filters: images
        ? [{ name: 'Images', extensions: [...imageExtensions].map((value) => value.slice(1)) }]
        : powerpoint
          ? [{ name: 'PowerPoint presentations', extensions: [...powerpointExtensions].map((value) => value.slice(1)) }]
          : [{ name: 'PDF documents', extensions: ['pdf'] }]
    })
    if (result.canceled) return []
    return await Promise.all(result.filePaths.map(describePath))
  })

  ipcMain.handle('dialog:select-watermark-image', async () => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      properties: ['openFile'],
      filters: [{ name: 'Watermark image', extensions: ['png', 'jpg', 'jpeg', 'webp'] }]
    })
    if (result.canceled || !result.filePaths[0]) return null
    return await describePath(result.filePaths[0])
  })

  ipcMain.handle('dialog:select-editor-image', async () => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      properties: ['openFile'],
      filters: [{ name: 'Images', extensions: [...imageExtensions].map((value) => value.slice(1)) }]
    })
    if (result.canceled || !result.filePaths[0]) return null
    return await describePath(result.filePaths[0])
  })

  ipcMain.handle('files:describe', async (_event, paths: string[]) => {
    return await Promise.all(paths.map(describePath))
  })

  ipcMain.handle('files:read', async (_event, file: DesktopFile) => {
    return new Uint8Array(await readFile(file.path))
  })

  ipcMain.handle('pdf:metadata', async (_event, file: DesktopFile) => await backend.metadata(file))

  ipcMain.handle('pdf:process', async (_event, request: ProcessRequest) => {
    const output = await backend.process(request)
    const filename = filenameForOutput(output.filename)
    const result = await dialog.showSaveDialog(mainWindow!, {
      defaultPath: join(app.getPath('downloads'), filename),
      filters: [
        filename.endsWith('.pdf')
          ? { name: 'PDF document', extensions: ['pdf'] }
          : filename.endsWith('.pptx')
            ? { name: 'PowerPoint presentation', extensions: ['pptx'] }
          : filename.endsWith('.zip')
            ? { name: 'ZIP archive', extensions: ['zip'] }
            : { name: 'Text document', extensions: ['txt'] }
      ]
    })
    if (result.canceled || !result.filePath) return { cancelled: true }
    await writeFile(result.filePath, output.data)
    return {
      cancelled: false,
      outputPath: result.filePath,
      originalSize: output.originalSize,
      outputSize: output.data.byteLength
    }
  })

  ipcMain.handle('shell:show-item', async (_event, path: string) => shell.showItemInFolder(path))
  ipcMain.handle('app:version', () => app.getVersion())
}

app.whenReady().then(async () => {
  electronApp.setAppUserModelId('io.github.gndlwch2w.mypdf')
  Menu.setApplicationMenu(null)
  registerIpc()

  try {
    await backend.start()
    createWindow()
  } catch (error) {
    dialog.showErrorBox('MyPDF could not start', error instanceof Error ? error.message : String(error))
    app.quit()
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('before-quit', () => backend.stop())
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
