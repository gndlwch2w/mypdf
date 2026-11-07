import { useEffect, useMemo, useRef, useState } from 'react'
import {
  FiAlignCenter,
  FiAlignLeft,
  FiAlignRight,
  FiBold,
  FiEdit3,
  FiImage,
  FiItalic,
  FiMousePointer,
  FiMove,
  FiCornerUpRight,
  FiSave,
  FiSquare,
  FiTrash2,
  FiType,
  FiUnderline,
  FiCornerUpLeft,
  FiX,
  FiZoomIn,
  FiZoomOut
} from 'react-icons/fi'
import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist'
import type {
  DesktopFile,
  PdfDrawingElement,
  PdfEditAsset,
  PdfEditDocument,
  PdfEditElement,
  PdfEditorTool,
  PdfShapeElement,
  PdfShapeKind,
  PdfTextElement
} from '../../../shared/types'
import { loadPdf, PdfPageThumbnail } from '../PdfPreview'

interface PdfEditorProps {
  file: DesktopFile
  saving: boolean
  onRemove: () => void
  onSave: (document: PdfEditDocument, assets: PdfEditAsset[]) => void
}

interface EditorHistory {
  past: PdfEditDocument[]
  present: PdfEditDocument
  future: PdfEditDocument[]
}

interface EditorAsset extends PdfEditAsset {
  url: string
}

const emptyDocument = (pageCount = 0): PdfEditDocument => ({ version: 1, pageCount, elements: [] })

function nextId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value))
}

function replaceElement(document: PdfEditDocument, id: string, update: (element: PdfEditElement) => PdfEditElement): PdfEditDocument {
  return { ...document, elements: document.elements.map((element) => element.id === id ? update(element) : element) }
}

function elementBounds(element: PdfEditElement, width: number, height: number): { x: number; y: number; width: number; height: number } {
  if (element.type === 'drawing' && element.points.length >= 2) {
    const xs = element.points.filter((_, index) => index % 2 === 0)
    const ys = element.points.filter((_, index) => index % 2 === 1)
    const left = Math.min(...xs)
    const top = Math.min(...ys)
    return {
      x: left * width,
      y: top * height,
      width: Math.max(0.01, Math.max(...xs) - left) * width,
      height: Math.max(0.01, Math.max(...ys) - top) * height
    }
  }
  return { x: element.x * width, y: element.y * height, width: element.width * width, height: element.height * height }
}

function colorWithOpacity(color: string, opacity: number): string {
  if (color === 'transparent') return 'transparent'
  if (!color.startsWith('#') || color.length !== 7) return color
  const alpha = Math.round(clamp(opacity, 0, 1) * 255).toString(16).padStart(2, '0')
  return `${color}${alpha}`
}

export default function PdfEditor({ file, saving, onRemove, onSave }: PdfEditorProps): React.JSX.Element {
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null)
  const [history, setHistory] = useState<EditorHistory>({ past: [], present: emptyDocument(), future: [] })
  const [currentPage, setCurrentPage] = useState(1)
  const [activeTool, setActiveTool] = useState<PdfEditorTool>('select')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [editingTextId, setEditingTextId] = useState<string | null>(null)
  const [zoom, setZoom] = useState(1)
  const [pageSize, setPageSize] = useState({ width: 612, height: 792 })
  const [assets, setAssets] = useState<EditorAsset[]>([])
  const [shapeKind, setShapeKind] = useState<PdfShapeKind>('rectangle')
  const [stroke, setStroke] = useState('#347759')
  const [fill, setFill] = useState('#edf6f0')
  const [strokeWidth, setStrokeWidth] = useState(2)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const overlayRef = useRef<SVGSVGElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const documentRef = useRef(history.present)
  const renderTaskRef = useRef<RenderTask | null>(null)
  const assetsRef = useRef<EditorAsset[]>([])
  const textEditBeforeRef = useRef<PdfEditDocument | null>(null)

  const document = history.present
  const selectedElement = selectedId ? document.elements.find((element) => element.id === selectedId) ?? null : null
  const pageElements = useMemo(
    () => document.elements.filter((element) => element.page === currentPage).sort((a, b) => a.zIndex - b.zIndex),
    [document.elements, currentPage]
  )

  useEffect(() => {
    documentRef.current = history.present
  }, [history.present])

  useEffect(() => {
    let active = true
    void loadPdf(file)
      .then((loadedPdf) => {
        if (!active) return
        setPdf(loadedPdf)
        setHistory({ past: [], present: emptyDocument(loadedPdf.numPages), future: [] })
      })
    return () => { active = false }
  }, [file])

  useEffect(() => {
    if (!pdf || !canvasRef.current) return
    let active = true
    renderTaskRef.current?.cancel()
    void pdf.getPage(currentPage).then(async (page) => {
      if (!active || !canvasRef.current) return
      const viewport = page.getViewport({ scale: zoom })
      const outputScale = Math.min(window.devicePixelRatio || 1, 2)
      const canvas = canvasRef.current
      const context = canvas.getContext('2d', { alpha: false })
      if (!context) return
      setPageSize({ width: viewport.width, height: viewport.height })
      canvas.width = Math.floor(viewport.width * outputScale)
      canvas.height = Math.floor(viewport.height * outputScale)
      canvas.style.width = `${viewport.width}px`
      canvas.style.height = `${viewport.height}px`
      const task = page.render({
        canvasContext: context,
        viewport,
        transform: outputScale === 1 ? undefined : [outputScale, 0, 0, outputScale, 0, 0]
      })
      renderTaskRef.current = task
      try {
        await task.promise
      } catch (error) {
        if ((error as { name?: string })?.name !== 'RenderingCancelledException') throw error
      }
    })
    return () => {
      active = false
      renderTaskRef.current?.cancel()
    }
  }, [pdf, currentPage, zoom])

  useEffect(() => { assetsRef.current = assets }, [assets])
  useEffect(() => () => {
    for (const asset of assetsRef.current) URL.revokeObjectURL(asset.url)
  }, [])

  function commit(next: PdfEditDocument): void {
    setHistory((current) => ({ past: [...current.past, current.present], present: next, future: [] }))
    documentRef.current = next
  }

  function setPresent(update: (current: PdfEditDocument) => PdfEditDocument): void {
    setHistory((current) => {
      const present = update(current.present)
      documentRef.current = present
      return { ...current, present }
    })
  }

  function finishInteraction(before: PdfEditDocument): void {
    setHistory((current) => ({ past: [...current.past, before], present: current.present, future: [] }))
  }

  function undo(): void {
    setHistory((current) => {
      const previous = current.past.at(-1)
      if (!previous) return current
      setSelectedId(null)
      return { past: current.past.slice(0, -1), present: previous, future: [current.present, ...current.future] }
    })
  }

  function redo(): void {
    setHistory((current) => {
      const next = current.future[0]
      if (!next) return current
      setSelectedId(null)
      return { past: [...current.past, current.present], present: next, future: current.future.slice(1) }
    })
  }

  function deleteSelected(): void {
    if (!selectedId) return
    commit({ ...documentRef.current, elements: documentRef.current.elements.filter((element) => element.id !== selectedId) })
    setSelectedId(null)
    setEditingTextId(null)
  }

  function changeSelected(patch: Partial<PdfEditElement>): void {
    if (!selectedId) return
    commit(replaceElement(documentRef.current, selectedId, (element) => ({ ...element, ...patch } as PdfEditElement)))
  }

  function beginTextEdit(id: string): void {
    textEditBeforeRef.current = documentRef.current
    setEditingTextId(id)
  }

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      const target = event.target as HTMLElement | null
      const typing = target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.tagName === 'SELECT'
      if (typing) {
        if (event.key === 'Escape') {
          event.preventDefault()
          target?.blur()
        }
        return
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault()
        if (event.shiftKey) redo()
        else undo()
        return
      }
      if (event.key === 'Delete' || event.key === 'Backspace') deleteSelected()
      if (event.key === 'Escape') {
        setSelectedId(null)
        setEditingTextId(null)
        setActiveTool('select')
      }
      const toolByKey: Partial<Record<string, PdfEditorTool>> = { v: 'select', h: 'hand', t: 'text', s: 'shape', p: 'draw' }
      const tool = toolByKey[event.key.toLowerCase()]
      if (tool) setActiveTool(tool)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  })

  function pointFromEvent(event: { clientX: number; clientY: number }): { x: number; y: number } {
    const rect = overlayRef.current?.getBoundingClientRect()
    if (!rect) return { x: 0, y: 0 }
    return { x: clamp((event.clientX - rect.left) / rect.width, 0, 1), y: clamp((event.clientY - rect.top) / rect.height, 0, 1) }
  }

  function startDrag(event: React.PointerEvent, element: PdfEditElement): void {
    if (activeTool !== 'select') return
    event.stopPropagation()
    setSelectedId(element.id)
    const start = pointFromEvent(event)
    const before = documentRef.current
    const original = { x: element.x, y: element.y }
    const originalDrawingPoints = element.type === 'drawing' ? [...element.points] : null
    const move = (moveEvent: PointerEvent): void => {
      const point = pointFromEvent(moveEvent)
      if (element.type === 'drawing') {
        const dx = point.x - start.x
        const dy = point.y - start.y
        setPresent((current) => replaceElement(current, element.id, (item) => item.type === 'drawing'
          ? { ...item, points: (originalDrawingPoints ?? item.points).map((value, index) => clamp(value + (index % 2 === 0 ? dx : dy), 0, 1)) }
          : item))
        return
      }
      const x = clamp(original.x + point.x - start.x, 0, 1 - element.width)
      const y = clamp(original.y + point.y - start.y, 0, 1 - element.height)
      setPresent((current) => replaceElement(current, element.id, (item) => ({ ...item, x, y })))
    }
    const up = (): void => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      finishInteraction(before)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up, { once: true })
  }

  function startResize(event: React.PointerEvent, element: PdfEditElement, corner: string): void {
    event.preventDefault()
    event.stopPropagation()
    const start = pointFromEvent(event)
    const before = documentRef.current
    const original = { x: element.x, y: element.y, width: element.width, height: element.height }
    const move = (moveEvent: PointerEvent): void => {
      const point = pointFromEvent(moveEvent)
      const dx = point.x - start.x
      const dy = point.y - start.y
      let { x, y, width, height } = original
      if (corner.includes('e')) width = clamp(original.width + dx, 0.02, 1 - original.x)
      if (corner.includes('s')) height = clamp(original.height + dy, 0.02, 1 - original.y)
      if (corner.includes('w')) {
        x = clamp(original.x + dx, 0, original.x + original.width - 0.02)
        width = original.width + original.x - x
      }
      if (corner.includes('n')) {
        y = clamp(original.y + dy, 0, original.y + original.height - 0.02)
        height = original.height + original.y - y
      }
      setPresent((current) => replaceElement(current, element.id, (item) => ({ ...item, x, y, width, height })))
    }
    const up = (): void => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      finishInteraction(before)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up, { once: true })
  }

  function createElementAt(event: React.PointerEvent<SVGSVGElement>): void {
    if (event.target !== overlayRef.current && activeTool === 'select') return
    const point = pointFromEvent(event)
    setSelectedId(null)
    if (activeTool === 'select') return
    if (activeTool === 'hand') {
      const scroller = scrollRef.current
      if (!scroller) return
      const startX = event.clientX
      const startY = event.clientY
      const startLeft = scroller.scrollLeft
      const startTop = scroller.scrollTop
      const move = (moveEvent: PointerEvent): void => {
        scroller.scrollLeft = startLeft - (moveEvent.clientX - startX)
        scroller.scrollTop = startTop - (moveEvent.clientY - startY)
      }
      const up = (): void => {
        window.removeEventListener('pointermove', move)
        window.removeEventListener('pointerup', up)
      }
      window.addEventListener('pointermove', move)
      window.addEventListener('pointerup', up, { once: true })
      return
    }

    const zIndex = Math.max(0, ...documentRef.current.elements.map((element) => element.zIndex)) + 1
    if (activeTool === 'text') {
      const before = documentRef.current
      const element: PdfTextElement = {
        id: nextId('text'), type: 'text', page: currentPage,
        x: clamp(point.x, 0, 0.72), y: clamp(point.y, 0, 0.9), width: 0.26, height: 0.08,
        opacity: 1, zIndex, text: 'Type here', fontFamily: 'helvetica', fontSize: 18,
        color: '#263029', bold: false, italic: false, underline: false, align: 'left'
      }
      setPresent((current) => ({ ...current, elements: [...current.elements, element] }))
      textEditBeforeRef.current = before
      setSelectedId(element.id)
      setEditingTextId(element.id)
      setActiveTool('select')
      return
    }

    if (activeTool === 'shape') {
      const before = documentRef.current
      const element: PdfShapeElement = {
        id: nextId('shape'), type: 'shape', shape: shapeKind, page: currentPage,
        x: point.x, y: point.y, width: 0.01, height: 0.01, opacity: 1, zIndex,
        stroke, fill: shapeKind === 'line' || shapeKind === 'arrow' ? 'transparent' : fill, strokeWidth
      }
      setPresent((current) => ({ ...current, elements: [...current.elements, element] }))
      setSelectedId(element.id)
      const move = (moveEvent: PointerEvent): void => {
        const next = pointFromEvent(moveEvent)
        const x = Math.min(point.x, next.x)
        const y = Math.min(point.y, next.y)
        const width = Math.max(0.01, Math.abs(next.x - point.x))
        const height = Math.max(0.01, Math.abs(next.y - point.y))
        setPresent((current) => replaceElement(current, element.id, (item) => ({ ...item, x, y, width, height })))
      }
      const up = (): void => {
        window.removeEventListener('pointermove', move)
        window.removeEventListener('pointerup', up)
        finishInteraction(before)
      }
      window.addEventListener('pointermove', move)
      window.addEventListener('pointerup', up, { once: true })
      return
    }

    if (activeTool === 'draw') {
      const before = documentRef.current
      const element: PdfDrawingElement = {
        id: nextId('drawing'), type: 'drawing', page: currentPage,
        x: 0, y: 0, width: 1, height: 1, opacity: 1, zIndex,
        points: [point.x, point.y], stroke, strokeWidth
      }
      setPresent((current) => ({ ...current, elements: [...current.elements, element] }))
      setSelectedId(element.id)
      const move = (moveEvent: PointerEvent): void => {
        const next = pointFromEvent(moveEvent)
        setPresent((current) => replaceElement(current, element.id, (item) => item.type === 'drawing'
          ? { ...item, points: [...item.points, next.x, next.y] }
          : item))
      }
      const up = (): void => {
        window.removeEventListener('pointermove', move)
        window.removeEventListener('pointerup', up)
        finishInteraction(before)
      }
      window.addEventListener('pointermove', move)
      window.addEventListener('pointerup', up, { once: true })
    }
  }

  async function addImage(): Promise<void> {
    const selectedFile = await window.mypdf.selectEditorImage()
    if (!selectedFile) return
    const id = nextId('asset')
    const bytes = await window.mypdf.readFile(selectedFile)
    const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: selectedFile.type }))
    setAssets((current) => [...current, { id, file: selectedFile, url }])
    const zIndex = Math.max(0, ...documentRef.current.elements.map((element) => element.zIndex)) + 1
    const element: PdfEditElement = {
      id: nextId('image'), type: 'image', page: currentPage,
      x: 0.32, y: 0.32, width: 0.36, height: 0.26, opacity: 1, zIndex, assetId: id
    }
    commit({ ...documentRef.current, elements: [...documentRef.current.elements, element] })
    setSelectedId(element.id)
    setActiveTool('select')
  }

  function renderElement(element: PdfEditElement): React.JSX.Element | null {
    const bounds = elementBounds(element, pageSize.width, pageSize.height)
    const common = {
      onPointerDown: (event: React.PointerEvent) => startDrag(event, element),
      onDoubleClick: () => element.type === 'text' && beginTextEdit(element.id),
      opacity: element.opacity,
      style: { cursor: activeTool === 'select' ? 'move' : 'default' }
    }
    if (element.type === 'text') {
      return (
        <foreignObject key={element.id} {...common} x={bounds.x} y={bounds.y} width={bounds.width} height={bounds.height}>
          <div
            className="pdf-editor-text"
            style={{
              color: element.color,
              fontFamily: element.fontFamily === 'times' ? 'serif' : element.fontFamily === 'courier' ? 'monospace' : 'sans-serif',
              fontSize: `${element.fontSize * zoom}px`,
              fontWeight: element.bold ? 800 : 500,
              fontStyle: element.italic ? 'italic' : 'normal',
              textDecoration: element.underline ? 'underline' : 'none',
              textAlign: element.align
            }}
          >{element.text}</div>
        </foreignObject>
      )
    }
    if (element.type === 'image') {
      const asset = assets.find((item) => item.id === element.assetId)
      return asset ? <image key={element.id} {...common} href={asset.url} x={bounds.x} y={bounds.y} width={bounds.width} height={bounds.height} preserveAspectRatio="xMidYMid meet" /> : null
    }
    if (element.type === 'drawing') {
      const points = element.points.reduce<string[]>((items, value, index) => {
        if (index % 2 === 0) items.push(`${value * pageSize.width},${element.points[index + 1] * pageSize.height}`)
        return items
      }, []).join(' ')
      return <polyline key={element.id} {...common} points={points} fill="none" stroke={element.stroke} strokeWidth={element.strokeWidth * zoom} strokeLinecap="round" strokeLinejoin="round" />
    }
    const shape = element as PdfShapeElement
    if (shape.shape === 'ellipse') {
      return <ellipse key={element.id} {...common} cx={bounds.x + bounds.width / 2} cy={bounds.y + bounds.height / 2} rx={bounds.width / 2} ry={bounds.height / 2} fill={colorWithOpacity(shape.fill, shape.opacity)} stroke={shape.stroke} strokeWidth={shape.strokeWidth * zoom} />
    }
    if (shape.shape === 'line' || shape.shape === 'arrow') {
      const markerEnd = shape.shape === 'arrow' ? 'url(#editor-arrow)' : undefined
      return <line key={element.id} {...common} x1={bounds.x} y1={bounds.y} x2={bounds.x + bounds.width} y2={bounds.y + bounds.height} stroke={shape.stroke} strokeWidth={shape.strokeWidth * zoom} markerEnd={markerEnd} />
    }
    return <rect key={element.id} {...common} x={bounds.x} y={bounds.y} width={bounds.width} height={bounds.height} fill={colorWithOpacity(shape.fill, shape.opacity)} stroke={shape.stroke} strokeWidth={shape.strokeWidth * zoom} />
  }

  const selectedBounds = selectedElement ? elementBounds(selectedElement, pageSize.width, pageSize.height) : null
  const editingText = editingTextId ? document.elements.find((element): element is PdfTextElement => element.id === editingTextId && element.type === 'text') : null
  const editingBounds = editingText ? elementBounds(editingText, pageSize.width, pageSize.height) : null

  return (
    <div className="pdf-editor-shell">
      <div className="pdf-editor-toolbar">
        <div className="pdf-editor-tool-group">
          {([
            ['select', FiMousePointer, 'Select'],
            ['hand', FiMove, 'Hand'],
            ['text', FiType, 'Text'],
            ['shape', FiSquare, 'Shapes'],
            ['draw', FiEdit3, 'Draw']
          ] as const).map(([tool, Icon, label]) => (
            <button className={activeTool === tool ? 'selected' : ''} type="button" key={tool} onClick={() => setActiveTool(tool)} title={label}>
              <Icon /><span>{label}</span>
            </button>
          ))}
          <button type="button" onClick={() => void addImage()} title="Add image"><FiImage /><span>Image</span></button>
        </div>
        <div className="pdf-editor-toolbar-spacer" />
        <div className="pdf-editor-tool-group compact">
          <button type="button" disabled={history.past.length === 0} onClick={undo} title="Undo"><FiCornerUpLeft /></button>
          <button type="button" disabled={history.future.length === 0} onClick={redo} title="Redo"><FiCornerUpRight /></button>
          <button type="button" disabled={!selectedId} onClick={deleteSelected} title="Delete"><FiTrash2 /></button>
          <button type="button" onClick={onRemove} title="Close PDF"><FiX /></button>
        </div>
        <button className="pdf-editor-save" type="button" disabled={saving} onClick={() => onSave(document, assets.map(({ id, file: assetFile }) => ({ id, file: assetFile })))}>
          {saving ? <span className="spinner" /> : <FiSave />} Save edited PDF
        </button>
      </div>

      <div className="pdf-editor-contextbar">
        {activeTool === 'shape' && (
          <div className="pdf-editor-context-group">
            <span>Shape</span>
            {(['rectangle', 'ellipse', 'line', 'arrow'] as PdfShapeKind[]).map((kind) => (
              <button className={shapeKind === kind ? 'selected' : ''} type="button" key={kind} onClick={() => setShapeKind(kind)}>{kind}</button>
            ))}
          </div>
        )}
        {(activeTool === 'shape' || activeTool === 'draw' || selectedElement?.type === 'shape' || selectedElement?.type === 'drawing') && (
          <>
            <label><span>Stroke</span><input type="color" value={selectedElement && 'stroke' in selectedElement ? selectedElement.stroke : stroke} onChange={(event) => { setStroke(event.target.value); if (selectedElement && 'stroke' in selectedElement) changeSelected({ stroke: event.target.value } as Partial<PdfEditElement>) }} /></label>
            {activeTool === 'shape' || selectedElement?.type === 'shape' ? <label><span>Fill</span><input type="color" value={selectedElement?.type === 'shape' && selectedElement.fill !== 'transparent' ? selectedElement.fill : fill} onChange={(event) => { setFill(event.target.value); if (selectedElement?.type === 'shape') changeSelected({ fill: event.target.value } as Partial<PdfEditElement>) }} /></label> : null}
            <label><span>Width</span><input className="pdf-editor-number" type="number" min="1" max="20" value={selectedElement && 'strokeWidth' in selectedElement ? selectedElement.strokeWidth : strokeWidth} onChange={(event) => { const value = Number(event.target.value); setStrokeWidth(value); if (selectedElement && 'strokeWidth' in selectedElement) changeSelected({ strokeWidth: value } as Partial<PdfEditElement>) }} /></label>
          </>
        )}
        {(activeTool === 'text' || selectedElement?.type === 'text') && (
          <>
            <label><span>Font</span><select value={selectedElement?.type === 'text' ? selectedElement.fontFamily : 'helvetica'} onChange={(event) => selectedElement?.type === 'text' && changeSelected({ fontFamily: event.target.value } as Partial<PdfEditElement>)}><option value="helvetica">Helvetica</option><option value="times">Times</option><option value="courier">Courier</option></select></label>
            <label><span>Size</span><input className="pdf-editor-number" type="number" min="6" max="144" value={selectedElement?.type === 'text' ? selectedElement.fontSize : 18} onChange={(event) => selectedElement?.type === 'text' && changeSelected({ fontSize: Number(event.target.value) } as Partial<PdfEditElement>)} /></label>
            <label><span>Color</span><input type="color" value={selectedElement?.type === 'text' ? selectedElement.color : '#263029'} onChange={(event) => selectedElement?.type === 'text' && changeSelected({ color: event.target.value } as Partial<PdfEditElement>)} /></label>
            <div className="pdf-editor-format-buttons">
              <button className={selectedElement?.type === 'text' && selectedElement.bold ? 'selected' : ''} type="button" disabled={selectedElement?.type !== 'text'} onClick={() => selectedElement?.type === 'text' && changeSelected({ bold: !selectedElement.bold } as Partial<PdfEditElement>)}><FiBold /></button>
              <button className={selectedElement?.type === 'text' && selectedElement.italic ? 'selected' : ''} type="button" disabled={selectedElement?.type !== 'text'} onClick={() => selectedElement?.type === 'text' && changeSelected({ italic: !selectedElement.italic } as Partial<PdfEditElement>)}><FiItalic /></button>
              <button className={selectedElement?.type === 'text' && selectedElement.underline ? 'selected' : ''} type="button" disabled={selectedElement?.type !== 'text'} onClick={() => selectedElement?.type === 'text' && changeSelected({ underline: !selectedElement.underline } as Partial<PdfEditElement>)}><FiUnderline /></button>
              <button className={selectedElement?.type === 'text' && selectedElement.align === 'left' ? 'selected' : ''} type="button" disabled={selectedElement?.type !== 'text'} onClick={() => changeSelected({ align: 'left' } as Partial<PdfEditElement>)}><FiAlignLeft /></button>
              <button className={selectedElement?.type === 'text' && selectedElement.align === 'center' ? 'selected' : ''} type="button" disabled={selectedElement?.type !== 'text'} onClick={() => changeSelected({ align: 'center' } as Partial<PdfEditElement>)}><FiAlignCenter /></button>
              <button className={selectedElement?.type === 'text' && selectedElement.align === 'right' ? 'selected' : ''} type="button" disabled={selectedElement?.type !== 'text'} onClick={() => changeSelected({ align: 'right' } as Partial<PdfEditElement>)}><FiAlignRight /></button>
            </div>
          </>
        )}
        {!selectedElement && activeTool === 'select' && <span className="pdf-editor-context-hint">Select an object to edit its appearance. Double-click text to change it.</span>}
      </div>

      <div className="pdf-editor-main">
        <aside className="pdf-editor-pages">
          <div><strong>Pages</strong><span>{pdf?.numPages ?? 0}</span></div>
          <div className="pdf-editor-page-list">
            {pdf && Array.from({ length: pdf.numPages }, (_, index) => index + 1).map((pageNumber) => (
              <button className={currentPage === pageNumber ? 'selected' : ''} type="button" key={pageNumber} onClick={() => { setCurrentPage(pageNumber); setSelectedId(null) }}>
                <PdfPageThumbnail file={file} pageNumber={pageNumber} />
                <span>{pageNumber}</span>
                {document.elements.some((element) => element.page === pageNumber) && <i />}
              </button>
            ))}
          </div>
        </aside>

        <div className={`pdf-editor-canvas-scroll tool-${activeTool}`} ref={scrollRef}>
          <div className="pdf-editor-page" style={{ width: pageSize.width, height: pageSize.height }}>
            <canvas ref={canvasRef} />
            <svg ref={overlayRef} className="pdf-editor-overlay" width={pageSize.width} height={pageSize.height} onPointerDown={createElementAt}>
              <defs><marker id="editor-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="context-stroke" /></marker></defs>
              {pageElements.map(renderElement)}
              {selectedElement && selectedElement.page === currentPage && selectedBounds && (
                <g className="pdf-editor-selection">
                  <rect x={selectedBounds.x} y={selectedBounds.y} width={selectedBounds.width} height={selectedBounds.height} />
                  {selectedElement.type !== 'drawing' && ([['nw', selectedBounds.x, selectedBounds.y], ['ne', selectedBounds.x + selectedBounds.width, selectedBounds.y], ['sw', selectedBounds.x, selectedBounds.y + selectedBounds.height], ['se', selectedBounds.x + selectedBounds.width, selectedBounds.y + selectedBounds.height]] as const).map(([corner, x, y]) => (
                    <circle key={corner} cx={x} cy={y} r={5} onPointerDown={(event) => startResize(event, selectedElement, corner)} />
                  ))}
                </g>
              )}
            </svg>
            {editingText && editingBounds && editingText.page === currentPage && (
              <textarea
                autoFocus
                className="pdf-editor-textarea"
                style={{
                  left: editingBounds.x,
                  top: editingBounds.y,
                  width: editingBounds.width,
                  height: editingBounds.height,
                  color: editingText.color,
                  fontSize: `${editingText.fontSize * zoom}px`,
                  fontFamily: editingText.fontFamily === 'times' ? 'serif' : editingText.fontFamily === 'courier' ? 'monospace' : 'sans-serif',
                  fontWeight: editingText.bold ? 800 : 500,
                  fontStyle: editingText.italic ? 'italic' : 'normal',
                  textDecoration: editingText.underline ? 'underline' : 'none',
                  textAlign: editingText.align
                }}
                value={editingText.text}
                onChange={(event) => setPresent((current) => replaceElement(current, editingText.id, (item) => ({ ...item, text: event.target.value } as PdfEditElement)))}
                onBlur={() => {
                  if (textEditBeforeRef.current) finishInteraction(textEditBeforeRef.current)
                  textEditBeforeRef.current = null
                  setEditingTextId(null)
                }}
              />
            )}
          </div>
        </div>

        <div className="pdf-editor-zoom">
          <button type="button" disabled={zoom <= 0.5} onClick={() => setZoom((current) => Math.max(0.5, current - 0.1))}><FiZoomOut /></button>
          <span>{Math.round(zoom * 100)}%</span>
          <button type="button" disabled={zoom >= 2} onClick={() => setZoom((current) => Math.min(2, current + 0.1))}><FiZoomIn /></button>
        </div>
      </div>
    </div>
  )
}
