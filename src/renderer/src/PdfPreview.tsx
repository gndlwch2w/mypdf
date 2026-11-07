import { useEffect, useRef, useState } from 'react'
import {
  FiChevronLeft,
  FiChevronRight,
  FiFileText,
  FiLock,
  FiMinus,
  FiPlus,
  FiX
} from 'react-icons/fi'
import { LuPresentation } from 'react-icons/lu'
import {
  GlobalWorkerOptions,
  getDocument,
  type PDFDocumentProxy,
  type RenderTask
} from 'pdfjs-dist'
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import type { DesktopFile } from '../../shared/types'
import { pageNumberFontFamily, pageNumberMargin, pageNumberValue } from './pageNumbers'

GlobalWorkerOptions.workerSrc = pdfWorker

const pdfCache = new Map<string, Promise<PDFDocumentProxy>>()

export function PowerPointThumbnail({ file }: { file: DesktopFile }): React.JSX.Element {
  return (
    <div className="powerpoint-thumbnail" aria-label={file.name}>
      <LuPresentation />
      <strong>{file.name.toLowerCase().endsWith('.pptx') ? 'PPTX' : 'PPT'}</strong>
      <span>PowerPoint presentation</span>
    </div>
  )
}

function loadPdf(file: DesktopFile): Promise<PDFDocumentProxy> {
  const cached = pdfCache.get(file.path)
  if (cached) return cached

  const request = window.mypdf
    .readFile(file)
    .then((bytes) => getDocument({ data: new Uint8Array(bytes) }).promise)
    .catch((error) => {
      const detail = error instanceof Error
        ? `${error.name}: ${error.message}\n${error.stack ?? ''}`
        : JSON.stringify(error)
      console.error(`PDF preview failed: ${detail}`)
      pdfCache.delete(file.path)
      throw error
    })
  pdfCache.set(file.path, request)
  return request
}

function errorLabel(error: unknown): string {
  const name = error && typeof error === 'object' && 'name' in error ? String(error.name) : ''
  if (name.includes('Password')) return 'Password protected'
  return 'Preview unavailable'
}

export function PdfThumbnail({
  file,
  onOpen
}: {
  file: DesktopFile
  onOpen: () => void
}): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [pages, setPages] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    let renderTask: RenderTask | undefined

    void loadPdf(file)
      .then(async (pdf) => {
        if (!active) return
        setPages(pdf.numPages)
        const page = await pdf.getPage(1)
        if (!active || !canvasRef.current) return

        const baseViewport = page.getViewport({ scale: 1 })
        const scale = Math.min(210 / baseViewport.width, 250 / baseViewport.height)
        const viewport = page.getViewport({ scale })
        const outputScale = Math.min(window.devicePixelRatio || 1, 2)
        const canvas = canvasRef.current
        const context = canvas.getContext('2d', { alpha: false })
        if (!context) return

        canvas.width = Math.floor(viewport.width * outputScale)
        canvas.height = Math.floor(viewport.height * outputScale)
        renderTask = page.render({
          canvasContext: context,
          viewport,
          transform: outputScale === 1 ? undefined : [outputScale, 0, 0, outputScale, 0, 0]
        })
        await renderTask.promise
      })
      .catch((reason: unknown) => {
        if (active && (reason as { name?: string })?.name !== 'RenderingCancelledException') {
          setError(errorLabel(reason))
        }
      })

    return () => {
      active = false
      renderTask?.cancel()
    }
  }, [file])

  return (
    <button className="file-preview-button" type="button" onClick={onOpen} aria-label={`Preview ${file.name}`}>
      <div className="pdf-thumbnail">
        {!error && <canvas ref={canvasRef} />}
        {pages === null && !error && <div className="preview-skeleton"><span /></div>}
        {error && (
          <div className="thumbnail-error">
            {error === 'Password protected' ? <FiLock /> : <FiFileText />}
            <span>{error}</span>
          </div>
        )}
      </div>
      {pages !== null && <span className="page-count">{pages} {pages === 1 ? 'page' : 'pages'}</span>}
    </button>
  )
}

export function ImageThumbnail({
  file,
  pdfOptions,
  onOpen
}: {
  file: DesktopFile
  pdfOptions?: Record<string, string>
  onOpen: () => void
}): React.JSX.Element {
  const [url, setUrl] = useState('')

  useEffect(() => {
    let objectUrl = ''
    let active = true
    void window.mypdf.readFile(file).then((bytes) => {
      if (!active) return
      objectUrl = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: file.type }))
      setUrl(objectUrl)
    })
    return () => {
      active = false
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [file])

  return (
    <button className="file-preview-button image-preview-button" type="button" onClick={onOpen} aria-label={`Preview ${file.name}`}>
      <div className={`image-thumbnail ${pdfOptions ? `pdf-page ${pdfOptions.orientation} margin-${pdfOptions.margin}` : ''}`}>
        {url ? <img src={url} alt="" /> : <div className="preview-skeleton"><span /></div>}
      </div>
    </button>
  )
}

export function PdfPageThumbnail({
  file,
  pageNumber,
  rotation = 0
}: {
  file: DesktopFile
  pageNumber: number
  rotation?: number
}): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    let active = true
    let renderTask: RenderTask | undefined

    void loadPdf(file)
      .then(async (pdf) => {
        const page = await pdf.getPage(pageNumber)
        if (!active || !canvasRef.current) return
        const effectiveRotation = (page.rotate + rotation) % 360
        const baseViewport = page.getViewport({ scale: 1, rotation: effectiveRotation })
        const scale = Math.min(210 / baseViewport.width, 250 / baseViewport.height)
        const viewport = page.getViewport({ scale, rotation: effectiveRotation })
        const outputScale = Math.min(window.devicePixelRatio || 1, 2)
        const canvas = canvasRef.current
        const context = canvas.getContext('2d', { alpha: false })
        if (!context) return
        canvas.width = Math.floor(viewport.width * outputScale)
        canvas.height = Math.floor(viewport.height * outputScale)
        renderTask = page.render({
          canvasContext: context,
          viewport,
          transform: outputScale === 1 ? undefined : [outputScale, 0, 0, outputScale, 0, 0]
        })
        await renderTask.promise
      })
      .catch((reason: unknown) => {
        if (active && (reason as { name?: string })?.name !== 'RenderingCancelledException') setError(true)
      })

    return () => {
      active = false
      renderTask?.cancel()
    }
  }, [file, pageNumber, rotation])

  return (
    <div className="organize-page-thumbnail">
      {!error && <canvas ref={canvasRef} />}
      {error && <div className="thumbnail-error"><FiFileText /><span>Unavailable</span></div>}
    </div>
  )
}

export function PreviewModal({
  file,
  initialPage = 1,
  pageRotations,
  pageNumberOptions,
  onClose
}: {
  file: DesktopFile | null
  initialPage?: number
  pageRotations?: Record<number, number>
  pageNumberOptions?: Record<string, string>
  onClose: () => void
}): React.JSX.Element | null {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null)
  const [page, setPage] = useState(1)
  const [zoom, setZoom] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [imageUrl, setImageUrl] = useState('')
  const isImage = Boolean(file?.type.startsWith('image/'))

  useEffect(() => {
    if (!file) {
      setPage(1)
      setZoom(1)
      setError('')
      setPdf(null)
      setImageUrl('')
      setLoading(false)
      return
    }
    setPage(initialPage)
    setZoom(1)
    setError('')
    setPdf(null)
    setImageUrl('')
    setLoading(true)

    let active = true
    let objectUrl = ''
    if (file.type.startsWith('image/')) {
      void window.mypdf.readFile(file)
        .then((bytes) => {
          if (!active) return
          objectUrl = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: file.type }))
          setImageUrl(objectUrl)
          setLoading(false)
        })
        .catch((reason: unknown) => active && setError(errorLabel(reason)))
    } else {
      void loadPdf(file)
        .then((document) => {
          if (active) setPdf(document)
        })
        .catch((reason: unknown) => active && setError(errorLabel(reason)))
    }

    return () => {
      active = false
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [file, initialPage])

  useEffect(() => {
    if (!file) return
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
      if (event.key === 'ArrowLeft') setPage((current) => Math.max(1, current - 1))
      if (event.key === 'ArrowRight' && pdf) setPage((current) => Math.min(pdf.numPages, current + 1))
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [file, onClose, pdf])

  useEffect(() => {
    if (!pdf || !canvasRef.current) return
    let active = true
    let renderTask: RenderTask | undefined
    setLoading(true)
    setError('')

    void pdf.getPage(page)
      .then(async (pdfPage) => {
        if (!active || !canvasRef.current) return
        const effectiveRotation = (pdfPage.rotate + (pageRotations?.[page] ?? 0)) % 360
        const viewport = pdfPage.getViewport({ scale: 1.25 * zoom, rotation: effectiveRotation })
        const outputScale = Math.min(window.devicePixelRatio || 1, 2)
        const canvas = canvasRef.current
        const context = canvas.getContext('2d', { alpha: false })
        if (!context) return
        canvas.width = Math.floor(viewport.width * outputScale)
        canvas.height = Math.floor(viewport.height * outputScale)
        canvas.style.width = `${Math.floor(viewport.width)}px`
        canvas.style.height = `${Math.floor(viewport.height)}px`
        renderTask = pdfPage.render({
          canvasContext: context,
          viewport,
          transform: outputScale === 1 ? undefined : [outputScale, 0, 0, outputScale, 0, 0]
        })
        await renderTask.promise
        if (active) setLoading(false)
      })
      .catch((reason: unknown) => {
        if (active && (reason as { name?: string })?.name !== 'RenderingCancelledException') {
          setError(errorLabel(reason))
          setLoading(false)
        }
      })

    return () => {
      active = false
      renderTask?.cancel()
    }
  }, [page, pageRotations, pdf, zoom])

  if (!file) return null

  return (
    <div className="preview-modal" role="dialog" aria-modal="true" aria-label={`Preview ${file.name}`} onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="preview-dialog">
        <header className="preview-header">
          <div>
            <strong>{file.name}</strong>
            <span>{isImage ? 'Image preview' : pdf ? `${pdf.numPages} ${pdf.numPages === 1 ? 'page' : 'pages'}` : 'PDF preview'}</span>
          </div>
          <div className="preview-controls">
            {!isImage && pdf && (
              <>
                <button type="button" disabled={page <= 1} onClick={() => setPage((current) => current - 1)} aria-label="Previous page"><FiChevronLeft /></button>
                <span className="page-indicator">{page} / {pdf.numPages}</span>
                <button type="button" disabled={page >= pdf.numPages} onClick={() => setPage((current) => current + 1)} aria-label="Next page"><FiChevronRight /></button>
                <span className="control-divider" />
                <button type="button" disabled={zoom <= 0.6} onClick={() => setZoom((current) => Math.max(0.6, current - 0.2))} aria-label="Zoom out"><FiMinus /></button>
                <span className="zoom-indicator">{Math.round(zoom * 100)}%</span>
                <button type="button" disabled={zoom >= 2} onClick={() => setZoom((current) => Math.min(2, current + 0.2))} aria-label="Zoom in"><FiPlus /></button>
              </>
            )}
            <button className="preview-close" type="button" onClick={onClose} aria-label="Close preview"><FiX /></button>
          </div>
        </header>
        <div className="preview-stage">
          {loading && <div className="preview-loading"><span className="spinner dark" /> Loading preview…</div>}
          {error && <div className="preview-error"><FiFileText /><strong>{error}</strong><span>The file can still be processed.</span></div>}
          {isImage && imageUrl && <img className="large-image-preview" src={imageUrl} alt={file.name} style={{ transform: `scale(${zoom})` }} />}
          {!isImage && !error && (
            <div className="preview-canvas-wrap">
              <canvas ref={canvasRef} className={loading ? 'rendering' : ''} />
              {pageNumberOptions && pdf && (() => {
                const value = pageNumberValue(page, pdf.numPages, pageNumberOptions)
                if (!value) return null
                const margin = pageNumberMargin(pageNumberOptions.margin)
                return (
                  <span
                    className={`preview-page-number ${pageNumberOptions.position || 'bottom-right'}`}
                    style={{
                      '--page-number-margin': margin,
                      color: pageNumberOptions.color,
                      fontFamily: pageNumberFontFamily(pageNumberOptions.font_family),
                      fontSize: `${Number(pageNumberOptions.font_size || 12)}px`,
                      fontWeight: pageNumberOptions.bold === 'true' ? 800 : 500,
                      fontStyle: pageNumberOptions.italic === 'true' ? 'italic' : 'normal',
                      textDecoration: pageNumberOptions.underline === 'true' ? 'underline' : 'none'
                    } as React.CSSProperties}
                  >
                    {value.text}
                  </span>
                )
              })()}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
