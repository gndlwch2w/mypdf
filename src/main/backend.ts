import { app } from 'electron'
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { basename, extname, join } from 'node:path'
import type {
  DesktopFile,
  PdfMetadata,
  ProcessRequest,
  ToolId
} from '../shared/types'

interface ProcessedOutput {
  data: Buffer
  filename: string
  originalSize?: number
}

const endpointByTool: Record<Exclude<ToolId, 'organize'>, string> = {
  merge: 'merge',
  split: 'split',
  compress: 'compress',
  'pdf-to-images': 'pdf-to-images',
  'images-to-pdf': 'images-to-pdf',
  powerpoint: 'powerpoint',
  edit: 'edit',
  word: 'word',
  rotate: 'rotate',
  watermark: 'watermark',
  unlock: 'unlock',
  protect: 'protect',
  pagenum: 'pagenum',
  'extract-text': 'extract-text'
}

const defaultFilename: Record<ToolId, string> = {
  merge: 'merged.pdf',
  split: 'split-pages.zip',
  compress: 'compressed.pdf',
  'pdf-to-images': 'pdf-images.zip',
  'images-to-pdf': 'converted.pdf',
  powerpoint: 'presentation.pdf',
  edit: 'edited.pdf',
  word: 'document.pdf',
  rotate: 'rotated.pdf',
  watermark: 'watermarked.pdf',
  unlock: 'unlocked.pdf',
  protect: 'protected.pdf',
  organize: 'organized.pdf',
  pagenum: 'numbered.pdf',
  'extract-text': 'extracted.txt'
}

async function reservePort(): Promise<number> {
  return await new Promise((resolve, reject) => {
    const server = createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (!address || typeof address === 'string') {
        server.close()
        reject(new Error('Unable to reserve a local port'))
        return
      }
      const port = address.port
      server.close(() => resolve(port))
    })
  })
}

function getDispositionFilename(response: Response): string | undefined {
  const disposition = response.headers.get('content-disposition')
  if (!disposition) return undefined
  return disposition.match(/filename\*?=(?:UTF-8''|\")?([^\";]+)/i)?.[1]
}

const outputSuffix: Record<ToolId, string> = {
  merge: 'merged',
  split: 'split',
  compress: 'compressed',
  'pdf-to-images': 'pdf_images',
  'images-to-pdf': 'images_to_pdf',
  powerpoint: 'powerpoint',
  edit: 'edited',
  word: 'word',
  rotate: 'rotated',
  watermark: 'watermarked',
  unlock: 'unlocked',
  protect: 'protected',
  organize: 'organized',
  pagenum: 'numbered',
  'extract-text': 'text'
}

function outputFilename(request: ProcessRequest, responseFilename?: string): string {
  const sourceName = basename((request.files[0]?.name || 'document').replaceAll('\\', '/'))
  const sourceExtension = extname(sourceName)
  const sourceStem = basename(sourceName, sourceExtension) || 'document'
  const fallback = defaultFilename[request.tool]
  const extension = extname(responseFilename || fallback).toLowerCase() || extname(fallback)
  const suffix = request.tool === 'pdf-to-images' && request.options.mode === 'extract'
    ? 'extracted_images'
    : request.tool === 'powerpoint'
      ? request.options.output_mode === 'flattened' ? 'flattened' : `${request.options.output_mode}_pdf`
      : request.tool === 'word'
        ? `${request.options.output_mode}_pdf`
      : outputSuffix[request.tool]
  return `${sourceStem}_${suffix}${extension}`
}

function fileBlob(data: Buffer, type: string): Blob {
  const bytes = new Uint8Array(data.byteLength)
  bytes.set(data)
  return new Blob([bytes], { type })
}

export class BackendService {
  private child?: ChildProcessWithoutNullStreams
  private baseUrl = ''
  private stopping = false

  async start(): Promise<void> {
    const port = await reservePort()
    this.baseUrl = `http://127.0.0.1:${port}`

    const projectRoot = app.getAppPath()
    const bundledBackend = process.platform === 'win32' ? 'mypdf-backend.exe' : 'mypdf-backend'
    const virtualEnvPython = process.platform === 'win32'
      ? join(projectRoot, '.venv', 'Scripts', 'python.exe')
      : join(projectRoot, '.venv', 'bin', 'python')
    const executable = app.isPackaged
      ? join(process.resourcesPath, 'backend', bundledBackend)
      : existsSync(virtualEnvPython)
        ? virtualEnvPython
        : process.platform === 'win32' ? 'python' : 'python3'

    const args = app.isPackaged
      ? []
      : [
          '-m',
          'uvicorn',
          'app.main:app',
          '--app-dir',
          join(projectRoot, 'backend'),
          '--host',
          '127.0.0.1',
          '--port',
          String(port)
        ]

    const child = spawn(executable, args, {
      env: {
        ...process.env,
        MYPDF_HOST: '127.0.0.1',
        MYPDF_PORT: String(port),
        MYPDF_DESKTOP: '1',
        MYPDF_LOG_FILE: join(app.getPath('logs'), 'backend.log')
      },
      stdio: 'pipe'
    })
    this.child = child

    child.stdout.on('data', (chunk) => console.log(`[backend] ${chunk.toString().trim()}`))
    child.stderr.on('data', (chunk) => console.error(`[backend] ${chunk.toString().trim()}`))
    child.once('exit', (code) => {
      if (!this.stopping) console.error(`MyPDF backend exited unexpectedly (${code ?? 'signal'})`)
    })

    await this.waitUntilReady()
  }

  stop(): void {
    this.stopping = true
    this.child?.kill('SIGTERM')
    this.child = undefined
  }

  private async waitUntilReady(): Promise<void> {
    const deadline = Date.now() + 25_000
    let lastError: unknown
    while (Date.now() < deadline) {
      if (this.child?.exitCode !== null) {
        throw new Error(`PDF engine stopped during startup (${this.child?.exitCode})`)
      }
      try {
        const response = await fetch(`${this.baseUrl}/api/status`)
        if (response.ok) return
      } catch (error) {
        lastError = error
      }
      await new Promise((resolve) => setTimeout(resolve, 200))
    }
    throw new Error(`PDF engine did not start in time: ${String(lastError ?? 'unknown error')}`)
  }

  async metadata(file: DesktopFile): Promise<PdfMetadata> {
    const form = new FormData()
    form.append('file', fileBlob(await readFile(file.path), 'application/pdf'), file.name)
    const response = await this.post('metadata', form)
    return (await response.json()) as PdfMetadata
  }

  async process(request: ProcessRequest): Promise<ProcessedOutput> {
    if (request.tool === 'organize') return await this.organize(request)

    const form = await this.makeForm(request)
    const response = await this.post(endpointByTool[request.tool], form)

    if (request.tool === 'extract-text') {
      const result = (await response.json()) as { text?: string }
      return {
        data: Buffer.from(result.text ?? '', 'utf8'),
        filename: outputFilename(request),
        originalSize: request.files[0]?.size
      }
    }

    const responseFilename = getDispositionFilename(response) ?? defaultFilename[request.tool]
    return {
      data: Buffer.from(await response.arrayBuffer()),
      filename: outputFilename(request, responseFilename),
      originalSize: request.files.reduce((total, file) => total + file.size, 0)
    }
  }

  private async makeForm(request: ProcessRequest): Promise<FormData> {
    const form = new FormData()
    const multiple = request.tool === 'merge' || request.tool === 'compress' || request.tool === 'images-to-pdf' || request.tool === 'powerpoint' || request.tool === 'word'

    for (const file of multiple ? request.files : request.files.slice(0, 1)) {
      const type = request.tool === 'images-to-pdf' || request.tool === 'powerpoint' || request.tool === 'word'
        ? file.type || 'application/octet-stream'
        : 'application/pdf'
      form.append(multiple ? 'files' : 'file', fileBlob(await readFile(file.path), type), file.name)
    }

    if (request.tool === 'edit') {
      if (!request.editorDocument) throw new Error('The PDF edit document is missing')
      form.append('operations', JSON.stringify(request.editorDocument))
      for (const asset of request.editorAssets ?? []) {
        const extension = extname(asset.file.name) || '.png'
        form.append(
          'assets',
          fileBlob(await readFile(asset.file.path), asset.file.type || 'application/octet-stream'),
          `${asset.id}${extension}`
        )
      }
    }

    if (request.tool === 'watermark' && request.options.watermark_image_path) {
      const imagePath = request.options.watermark_image_path
      const imageType = request.options.watermark_image_type || 'application/octet-stream'
      const imageName = request.options.watermark_image_name || basename(imagePath)
      form.append('watermark_image', fileBlob(await readFile(imagePath), imageType), imageName)
    }

    const localOnlyOptions = new Set([
      'watermark_image_path',
      'watermark_image_name',
      'watermark_image_type',
      'watermark_image_size'
    ])
    for (const [key, value] of Object.entries(request.options)) {
      if (localOnlyOptions.has(key)) continue
      if (value !== '') form.append(key, value)
    }
    return form
  }

  private async organize(request: ProcessRequest): Promise<ProcessedOutput> {
    const pages = (request.organizePages ?? []).filter((page) => page.included)
    if (pages.length === 0) throw new Error('Please keep at least one page')

    const batches: Array<{ fileIndex: number; pages: number[] }> = []
    for (const page of pages) {
      const current = batches.at(-1)
      if (!current || current.fileIndex !== page.fileIndex) {
        batches.push({ fileIndex: page.fileIndex, pages: [page.page] })
      } else {
        current.pages.push(page.page)
      }
    }

    const parts: Buffer[] = []
    for (const batch of batches) {
      const file = request.files[batch.fileIndex]
      if (!file) throw new Error('A source file for the page order is missing')
      const form = new FormData()
      form.append('file', fileBlob(await readFile(file.path), 'application/pdf'), file.name)
      form.append('order', batch.pages.join(','))
      const response = await this.post('reorder', form)
      parts.push(Buffer.from(await response.arrayBuffer()))
    }

    if (parts.length === 1) {
      return { data: parts[0], filename: outputFilename(request), originalSize: request.files[0]?.size }
    }

    const mergeForm = new FormData()
    parts.forEach((part, index) => {
      mergeForm.append('files', fileBlob(part, 'application/pdf'), `part-${index + 1}.pdf`)
    })
    const response = await this.post('merge', mergeForm)
    return {
      data: Buffer.from(await response.arrayBuffer()),
      filename: outputFilename(request),
      originalSize: request.files.reduce((total, file) => total + file.size, 0)
    }
  }

  private async post(endpoint: string, form: FormData): Promise<Response> {
    const response = await fetch(`${this.baseUrl}/api/v1/pdf/${endpoint}`, {
      method: 'POST',
      body: form
    })
    if (response.ok) return response

    const raw = await response.text()
    try {
      const payload = JSON.parse(raw) as { message?: string; detail?: string }
      throw new Error(payload.message ?? payload.detail ?? raw)
    } catch (error) {
      if (error instanceof SyntaxError) throw new Error(raw || `PDF engine error (${response.status})`)
      throw error
    }
  }
}

export function filenameForOutput(filename: string): string {
  return basename(filename.replaceAll('\\', '/'))
}
