import { useEffect, useMemo, useRef, useState } from 'react'
import {
  FiCheck,
  FiChevronDown,
  FiChevronUp,
  FiFolder,
  FiMove,
  FiPlus,
  FiShield,
  FiTrash2,
  FiUploadCloud,
  FiX
} from 'react-icons/fi'
import type { DesktopFile, OrganizePage, ToolId } from '../../shared/types'
import OrganizePages from './OrganizePages'
import PageNumberPages from './PageNumberPages'
import { ImageThumbnail, PdfThumbnail, PowerPointThumbnail, PreviewModal } from './PdfPreview'
import RotatePages from './RotatePages'
import SplitPages from './SplitPages'
import ToolOptions, { defaultOptions } from './ToolOptions'
import { getTool, tools } from './tools'
import WatermarkPages from './WatermarkPages'

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB']
  let value = bytes / 1024
  let unit = units[0]
  for (let index = 1; value >= 1024 && index < units.length; index += 1) {
    value /= 1024
    unit = units[index]
  }
  return `${value.toFixed(value >= 10 ? 1 : 2)} ${unit}`
}

function move<T>(items: T[], index: number, direction: -1 | 1): T[] {
  const target = index + direction
  if (target < 0 || target >= items.length) return items
  const next = [...items]
  ;[next[index], next[target]] = [next[target], next[index]]
  return next
}

function swapItems<T>(items: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= items.length || to >= items.length) return items
  const next = [...items]
  ;[next[from], next[to]] = [next[to], next[from]]
  return next
}

type FileEntry = DesktopFile & { uiId: string }
type PreviewTarget = {
  file: DesktopFile
  page?: number
  pageRotations?: Record<number, number>
}
let fileEntrySequence = 0

function makeFileEntry(file: DesktopFile): FileEntry {
  fileEntrySequence += 1
  return { ...file, uiId: `${Date.now()}-${fileEntrySequence}` }
}

export default function App(): React.JSX.Element {
  const [selectedTool, setSelectedTool] = useState<ToolId | null>(null)
  const [files, setFiles] = useState<FileEntry[]>([])
  const [options, setOptions] = useState<Record<string, string>>({})
  const [organizePages, setOrganizePages] = useState<OrganizePage[]>([])
  const [organizeLoading, setOrganizeLoading] = useState(false)
  const [rotatePages, setRotatePages] = useState<number[]>([])
  const [dragging, setDragging] = useState(false)
  const [draggedFileIndex, setDraggedFileIndex] = useState<number | null>(null)
  const [dragOverFileIndex, setDragOverFileIndex] = useState<number | null>(null)
  const [previewTarget, setPreviewTarget] = useState<PreviewTarget | null>(null)
  const [processing, setProcessing] = useState(false)
  const [optionsCollapsed, setOptionsCollapsed] = useState(true)
  const [error, setError] = useState('')
  const [result, setResult] = useState<{ path: string; detail?: string } | null>(null)
  const [version, setVersion] = useState('')
  const organizeFileCount = useRef(0)
  const skipNextOrganizeReload = useRef(false)

  const activeTool = useMemo(() => (selectedTool ? getTool(selectedTool) : null), [selectedTool])
  const ActiveToolIcon = activeTool?.icon
  const hasOptions = selectedTool !== null && [
    'split',
    'compress',
    'pdf-to-images',
    'images-to-pdf',
    'powerpoint',
    'rotate',
    'watermark',
    'protect',
    'unlock',
    'pagenum'
  ].includes(selectedTool)

  useEffect(() => {
    void window.mypdf.getVersion().then(setVersion)
  }, [])

  useEffect(() => {
    let active = true
    if ((selectedTool !== 'organize' && selectedTool !== 'split' && selectedTool !== 'rotate' && selectedTool !== 'watermark' && selectedTool !== 'pagenum' && selectedTool !== 'pdf-to-images') || files.length === 0) {
      skipNextOrganizeReload.current = false
      setOrganizePages([])
      setOrganizeLoading(false)
      organizeFileCount.current = 0
      return () => {
        active = false
      }
    }

    if (selectedTool === 'organize' && skipNextOrganizeReload.current) {
      skipNextOrganizeReload.current = false
      organizeFileCount.current = files.length
      setOrganizeLoading(false)
      return () => { active = false }
    }

    const previousFileCount = organizeFileCount.current
    setOrganizeLoading(true)
    Promise.all(files.map((file) => window.mypdf.getMetadata(file)))
      .then((metadata) => {
        if (!active) return
        const allPages = metadata.flatMap((item, fileIndex) =>
          Array.from({ length: item.pages }, (_, index) => ({
            fileIndex,
            page: index + 1,
            included: true
          }))
        )
        setOrganizePages((current) => selectedTool === 'organize' && previousFileCount > 0 && files.length > previousFileCount
          ? [...current, ...allPages.filter((page) => page.fileIndex >= previousFileCount)]
          : allPages)
        organizeFileCount.current = files.length
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : String(reason))
      })
      .finally(() => {
        if (active) setOrganizeLoading(false)
      })
    return () => {
      active = false
    }
  }, [files, selectedTool])

  function openTool(id: ToolId): void {
    setSelectedTool(id)
    setOptionsCollapsed(true)
    setFiles([])
    setOptions(defaultOptions(id))
    setError('')
    setResult(null)
    setPreviewTarget(null)
    setRotatePages([])
  }

  function goHome(): void {
    setSelectedTool(null)
    setFiles([])
    setError('')
    setResult(null)
    setPreviewTarget(null)
    setRotatePages([])
  }

  function addFiles(next: DesktopFile[]): void {
    if (!activeTool || next.length === 0) return
    const accepted = next.filter((file) =>
      activeTool.imageInput
        ? file.type.startsWith('image/')
        : activeTool.powerpointInput
          ? file.name.toLowerCase().endsWith('.ppt') || file.name.toLowerCase().endsWith('.pptx')
          : file.type === 'application/pdf'
    )
    if (accepted.length !== next.length) {
      setError(activeTool.imageInput
        ? 'Only supported image files can be added.'
        : activeTool.powerpointInput
          ? 'Only PPT and PPTX files can be added.'
          : 'Only PDF files can be added.')
    } else {
      setError('')
    }
    setResult(null)
    if (selectedTool === 'rotate') setRotatePages([])
    if (selectedTool === 'split') setOptions((current) => ({ ...current, ranges: '' }))
    const entries = accepted.map(makeFileEntry)
    setFiles((current) => activeTool.multiple ? [...current, ...entries] : entries.slice(0, 1))
  }

  async function browse(): Promise<void> {
    if (!selectedTool) return
    addFiles(await window.mypdf.selectFiles(selectedTool))
  }

  async function onDrop(event: React.DragEvent): Promise<void> {
    event.preventDefault()
    setDragging(false)
    if (draggedFileIndex !== null) {
      setDraggedFileIndex(null)
      setDragOverFileIndex(null)
      return
    }
    const paths = Array.from(event.dataTransfer.files)
      .map((file) => window.mypdf.getPathForFile(file))
      .filter(Boolean)
    if (paths.length === 0) return
    addFiles(await window.mypdf.describeDroppedFiles(paths))
  }

  function dropFileAt(event: React.DragEvent, index: number): void {
    if (draggedFileIndex === null) return
    event.preventDefault()
    event.stopPropagation()
    setFiles((current) => swapItems(current, draggedFileIndex, index))
    setDraggedFileIndex(null)
    setDragOverFileIndex(null)
  }

  function removeOrganizeFile(fileIndex: number): void {
    skipNextOrganizeReload.current = true
    setOrganizePages((current) => current
      .filter((page) => page.fileIndex !== fileIndex)
      .map((page) => page.fileIndex > fileIndex ? { ...page, fileIndex: page.fileIndex - 1 } : page))
    setFiles((current) => current.filter((_, index) => index !== fileIndex))
  }

  function processLabel(): string {
    if (!activeTool) return 'Process'
    if (selectedTool === 'merge') return files.length > 1 ? `Merge ${files.length} PDFs` : 'Merge PDFs'
    if (selectedTool === 'compress') return files.length > 1 ? `Compress ${files.length} PDFs` : 'Compress PDF'
    if (selectedTool === 'images-to-pdf') return files.length > 1 ? `Create PDF from ${files.length} images` : 'Create PDF'
    if (selectedTool === 'powerpoint') {
      const action = options.output_mode === 'flattened' ? 'Create flattened PowerPoint' : 'Export PDF'
      return files.length > 1 ? `${action} · ${files.length} files` : action
    }
    if (selectedTool === 'organize') return 'Save organized PDF'
    if (selectedTool === 'rotate' && rotatePages.length > 0) return `Rotate ${rotatePages.length} ${rotatePages.length === 1 ? 'page' : 'pages'}`
    return activeTool.title
  }

  function fileHint(): string {
    if (selectedTool === 'organize') return 'Each PDF is expanded into pages. Drag one page onto another to swap them.'
    if (selectedTool === 'split') return 'Every page is shown separately. Page order is fixed.'
    if (selectedTool === 'compress') return 'Add one or more PDFs. Every file uses the same compression level.'
    if (selectedTool === 'rotate') return 'Select pages to rotate, or leave all pages unselected to rotate the whole PDF.'
    if (selectedTool === 'watermark') return 'Preview the watermark on each page while you adjust its appearance and range.'
    if (selectedTool === 'pagenum') return 'Every page is shown with its final number and text styling.'
    if (selectedTool === 'powerpoint') return 'Choose a PDF quality or create an image-only PowerPoint with full-slide images.'
    return activeTool!.multiple
      ? 'Add files, preview them, then drag one onto another to swap their order.'
      : 'Add a file and click its thumbnail to inspect every page.'
  }

  function validate(): string | null {
    if (!selectedTool || files.length === 0) return 'Add at least one file first.'
    if (selectedTool === 'merge' && files.length < 2) return 'Merge needs at least two PDF files.'
    if (selectedTool === 'watermark' && options.watermark_type === 'text' && !options.watermark_text?.trim()) return 'Enter the watermark text.'
    if (selectedTool === 'watermark' && options.watermark_type === 'image' && !options.watermark_image_path) return 'Choose a watermark image.'
    if (selectedTool === 'watermark' && Number(options.page_from || 1) > Number(options.page_to || organizePages.length || 1)) return 'Check the watermark page range.'
    if (selectedTool === 'pagenum' && Number(options.first_number || 0) < 1) return 'The first number must be 1 or greater.'
    if (selectedTool === 'pagenum' && !options.text_format?.includes('{n}')) return 'Number format must include {n}.'
    if (selectedTool === 'pagenum' && (
      Number(options.page_from || 0) < 1 ||
      Number(options.page_from || 1) > Number(options.page_to || organizePages.length || 1) ||
      Number(options.page_to || organizePages.length || 1) > organizePages.length
    )) return 'Check the page numbering range.'
    if ((selectedTool === 'protect' || selectedTool === 'unlock') && !options.password) return 'Enter a password.'
    if (selectedTool === 'protect' && options.password !== options.confirm) return 'The two passwords do not match.'
    if (selectedTool === 'organize' && !organizePages.some((page) => page.included)) return 'Keep at least one page.'
    return null
  }

  async function processFiles(): Promise<void> {
    if (!selectedTool) return
    const validationError = validate()
    if (validationError) {
      setError(validationError)
      return
    }

    const backendOptions = { ...options }
    delete backendOptions.confirm
    if (selectedTool === 'rotate') backendOptions.pages = rotatePages.join(',')
    setProcessing(true)
    setError('')
    setResult(null)
    try {
      const response = await window.mypdf.process({
        tool: selectedTool,
        files,
        options: backendOptions,
        organizePages: selectedTool === 'organize' ? organizePages : undefined
      })
      if (!response.cancelled && response.outputPath) {
        let detail: string | undefined
        if (response.originalSize && response.outputSize) {
          const change = Math.round((1 - response.outputSize / response.originalSize) * 100)
          detail = selectedTool === 'compress' && change > 0
            ? `${formatBytes(response.originalSize)} → ${formatBytes(response.outputSize)} · ${change}% smaller`
            : formatBytes(response.outputSize)
        }
        setResult({ path: response.outputPath, detail })
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setProcessing(false)
    }
  }

  return (
    <div className="app-shell">
      <div className="titlebar">
        <div className="brand-mark">M</div>
        <span>MyPDF</span>
        <div className="privacy-pill"><FiShield /> Processed on this Mac</div>
      </div>

      <aside className="sidebar">
        <button className={`home-button ${selectedTool === null ? 'active' : ''}`} type="button" onClick={goHome}>
          <span className="mini-logo">M</span>
          <span><strong>MyPDF</strong><small>Local PDF studio</small></span>
        </button>
        <nav>
          <p>PDF TOOLS</p>
          {tools.map((tool) => {
            const Icon = tool.icon
            return (
              <button
                className={selectedTool === tool.id ? 'active' : ''}
                key={tool.id}
                type="button"
                onClick={() => openTool(tool.id)}
              >
                <Icon />
                <span>{tool.shortTitle}</span>
              </button>
            )
          })}
        </nav>
        <footer>
          <FiShield />
          <div><strong>Private by design</strong><span>No cloud uploads</span></div>
          {version && <small>v{version}</small>}
        </footer>
      </aside>

      <main className={`content ${selectedTool !== null ? 'tool-content' : ''}`}>
        {selectedTool === null ? (
          <div className="home-view">
            <section className="hero">
              <div className="eyebrow"><FiShield /> Offline desktop toolkit</div>
              <h1>PDF work stays<br /><em>on your Mac.</em></h1>
              <p>Merge, convert, protect and organize documents with a fast native workspace. Your files never leave this computer.</p>
            </section>
            <section className="tools-section">
              <div className="section-heading"><div><span>13 LOCAL TOOLS</span><h2>What would you like to do?</h2></div></div>
              <div className="tool-grid">
                {tools.map((tool) => {
                  const Icon = tool.icon
                  return (
                    <button key={tool.id} className="tool-card" type="button" onClick={() => openTool(tool.id)}>
                      <div className="card-icon" style={{ '--accent': tool.accent } as React.CSSProperties}><Icon /></div>
                      <div><h3>{tool.title}</h3><p>{tool.description}</p></div>
                    </button>
                  )
                })}
              </div>
            </section>
          </div>
        ) : (
          <div className="workspace-view">
            <header className="workspace-header">
              <div className="workspace-icon" style={{ background: activeTool!.accent }}>{ActiveToolIcon && <ActiveToolIcon />}</div>
              <div><span>PDF TOOL</span><h1>{activeTool!.title}</h1><p>{activeTool!.description}</p></div>
            </header>

            <div className={`workspace-body ${hasOptions ? 'has-options' : ''}`}>
              <div className="workspace-pages-panel">
                <div className="section-title-row">
                <div className="step-title"><span>01</span><div><h2>{selectedTool === 'organize' || selectedTool === 'split' || selectedTool === 'rotate' || selectedTool === 'watermark' || selectedTool === 'pagenum' ? 'Pages' : 'Files'}</h2><p>{fileHint()}</p></div></div>
                <button
                  className="process-action-button"
                  type="button"
                  disabled={processing || files.length === 0 || organizeLoading}
                  onClick={() => void processFiles()}
                >
                  {processing ? <><span className="spinner" /> Processing…</> : processLabel()}
                </button>
                </div>

                <section
                  className={`dropzone ${dragging ? 'dragging' : ''} ${files.length > 0 ? 'has-files' : ''}`}
                  onDragEnter={(event) => {
                    event.preventDefault()
                    if (draggedFileIndex === null) setDragging(true)
                  }}
                  onDragOver={(event) => event.preventDefault()}
                  onDragLeave={(event) => { if (event.currentTarget === event.target) setDragging(false) }}
                  onDrop={(event) => void onDrop(event)}
                >
                {files.length === 0 ? (
                  <button type="button" className="empty-dropzone" onClick={() => void browse()}>
                    <div className="upload-icon"><FiUploadCloud /></div>
                    <h2>Drop {activeTool!.imageInput ? 'images' : activeTool!.powerpointInput ? 'a PowerPoint file' : 'PDF files'} here</h2>
                    <p>or select them from your Mac</p>
                    <span>Choose files</span>
                    <small>{activeTool!.imageInput ? 'JPG, PNG, WebP, TIFF and BMP' : activeTool!.powerpointInput ? 'PPT and PPTX · LibreOffice required' : 'PDF documents · up to 50 MB each'}</small>
                  </button>
                ) : (
                  selectedTool === 'organize' ? (
                    <OrganizePages
                      files={files}
                      pages={organizePages}
                      loading={organizeLoading}
                      onPagesChange={setOrganizePages}
                      onRemoveFile={removeOrganizeFile}
                      onAdd={() => void browse()}
                      onPreview={(file, page) => setPreviewTarget({ file, page })}
                    />
                  ) : selectedTool === 'split' ? (
                    <SplitPages
                      file={files[0]}
                      pages={organizePages}
                      loading={organizeLoading}
                      ranges={options.ranges ?? ''}
                      onRangesChange={(ranges) => setOptions((current) => ({ ...current, ranges }))}
                      onRemove={() => {
                        setFiles([])
                        setOptions((current) => ({ ...current, ranges: '' }))
                      }}
                      onPreview={(page) => setPreviewTarget({ file: files[0], page })}
                    />
                  ) : selectedTool === 'rotate' ? (
                    <RotatePages
                      file={files[0]}
                      pages={organizePages}
                      loading={organizeLoading}
                      angle={Number(options.angle ?? 90)}
                      selectedPages={rotatePages}
                      onSelectionChange={setRotatePages}
                      onPreview={(page) => {
                        const angle = Number(options.angle ?? 90)
                        const targetPages = rotatePages.length > 0
                          ? rotatePages
                          : organizePages.map((item) => item.page)
                        setPreviewTarget({
                          file: files[0],
                          page,
                          pageRotations: Object.fromEntries(targetPages.map((pageNumber) => [pageNumber, angle]))
                        })
                      }}
                      onRemove={() => {
                        setFiles([])
                        setRotatePages([])
                      }}
                    />
                  ) : selectedTool === 'watermark' ? (
                    <WatermarkPages
                      file={files[0]}
                      pages={organizePages}
                      loading={organizeLoading}
                      options={options}
                      onRemove={() => setFiles([])}
                      onPreview={(page) => setPreviewTarget({ file: files[0], page })}
                    />
                  ) : selectedTool === 'pagenum' ? (
                    <PageNumberPages
                      file={files[0]}
                      pages={organizePages}
                      loading={organizeLoading}
                      options={options}
                      onRemove={() => setFiles([])}
                      onPreview={(page) => setPreviewTarget({ file: files[0], page })}
                    />
                  ) : (
                  <div className={`file-card-grid ${files.length === 1 ? 'single' : ''}`}>
                    {files.map((file, index) => (
                      <article
                        className={`file-card ${draggedFileIndex === index ? 'drag-source' : ''} ${dragOverFileIndex === index ? 'drag-target' : ''}`}
                        draggable={activeTool!.multiple && selectedTool !== 'compress'}
                        key={file.uiId}
                        onDragStart={(event) => {
                          setDraggedFileIndex(index)
                          event.dataTransfer.effectAllowed = 'move'
                          event.dataTransfer.setData('text/plain', file.path)
                        }}
                        onDragEnd={() => {
                          setDraggedFileIndex(null)
                          setDragOverFileIndex(null)
                        }}
                        onDragEnter={(event) => {
                          if (draggedFileIndex !== null) {
                            event.preventDefault()
                            event.stopPropagation()
                            setDragOverFileIndex(index)
                          }
                        }}
                        onDragOver={(event) => {
                          if (draggedFileIndex !== null) {
                            event.preventDefault()
                            event.stopPropagation()
                            event.dataTransfer.dropEffect = 'move'
                          }
                        }}
                        onDrop={(event) => dropFileAt(event, index)}
                      >
                        {activeTool!.multiple && selectedTool !== 'compress' && <span className="order-number">{index + 1}</span>}
                        <button className="card-remove" type="button" onClick={() => setFiles(files.filter((_, itemIndex) => itemIndex !== index))} aria-label={`Remove ${file.name}`}><FiTrash2 /></button>
                        {activeTool!.imageInput
                          ? <ImageThumbnail file={file} pdfOptions={selectedTool === 'images-to-pdf' ? options : undefined} onOpen={() => setPreviewTarget({ file })} />
                          : activeTool!.powerpointInput
                            ? <PowerPointThumbnail file={file} />
                          : <PdfThumbnail file={file} onOpen={() => setPreviewTarget({ file })} />}
                        <div className="file-card-info">
                          <div><strong title={file.name}>{file.name}</strong><span>{formatBytes(file.size)}</span></div>
                          {activeTool!.multiple && selectedTool !== 'compress' && <FiMove className="drag-handle" aria-label="Drag to reorder" />}
                        </div>
                        {activeTool!.multiple && selectedTool !== 'compress' && files.length > 1 && (
                          <div className="mobile-order-buttons">
                            <button type="button" disabled={index === 0} onClick={() => setFiles(move(files, index, -1))}><FiChevronUp /> Earlier</button>
                            <button type="button" disabled={index === files.length - 1} onClick={() => setFiles(move(files, index, 1))}>Later <FiChevronDown /></button>
                          </div>
                        )}
                      </article>
                    ))}
                    {activeTool!.multiple && (
                      <button className="add-file-card" type="button" onClick={() => void browse()}>
                        <span><FiPlus /></span>
                        <strong>Add more</strong>
                        <small>Drop or browse</small>
                      </button>
                    )}
                  </div>
                  )
                )}
                  {files.length > 1 && activeTool!.multiple && selectedTool !== 'organize' && selectedTool !== 'compress' && (
                    <div className="order-tip"><FiMove /> Drag a card onto another card to swap their positions. Numbers show the final sequence.</div>
                  )}
                </section>
              </div>

              {(hasOptions || error || result) && (
                <div
                  className={`workspace-bottom-dock ${optionsCollapsed ? 'options-collapsed' : ''}`}
                >
                  {hasOptions && (
                    <section className={`options-panel ${optionsCollapsed ? 'collapsed' : ''}`}>
                      <div className="panel-heading">
                        <span>02</span>
                        <div><h2>Options</h2><p>{optionsCollapsed ? 'Options are hidden.' : 'Fine-tune the output before processing.'}</p></div>
                        <button
                          className="options-collapse-button"
                          type="button"
                          aria-expanded={!optionsCollapsed}
                          onClick={() => setOptionsCollapsed((current) => !current)}
                        >
                          {optionsCollapsed ? <><FiChevronUp /> Show options</> : <><FiChevronDown /> Hide</>}
                        </button>
                      </div>
                      {!optionsCollapsed && (
                        <div className="options-content">
                          <ToolOptions
                            tool={selectedTool}
                            options={options}
                            sourceSize={selectedTool === 'compress'
                              ? files.reduce((total, file) => total + file.size, 0)
                              : files[0]?.size}
                            selectedPageCount={selectedTool === 'rotate' ? rotatePages.length : undefined}
                            pageCount={selectedTool === 'watermark' || selectedTool === 'pagenum' || selectedTool === 'pdf-to-images' ? organizePages.length : undefined}
                            onChange={(key, value) => setOptions((current) => ({ ...current, [key]: value }))}
                          />
                        </div>
                      )}
                    </section>
                  )}

                  {error && <div className="message error-message"><FiX /><span>{error}</span></div>}
                  {result && (
                    <div className="message success-message">
                      <FiCheck />
                      <div><strong>Done — your file is ready.</strong>{result.detail && <span>{result.detail}</span>}</div>
                      <button type="button" onClick={() => void window.mypdf.showItemInFolder(result.path)}><FiFolder /> Show in Finder</button>
                      <button className="success-dismiss" type="button" aria-label="Dismiss result" title="Close" onClick={() => setResult(null)}><FiX /></button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </main>
      <PreviewModal
        file={previewTarget?.file ?? null}
        initialPage={previewTarget?.page}
        pageRotations={previewTarget?.pageRotations}
        pageNumberOptions={selectedTool === 'pagenum' ? options : undefined}
        onClose={() => setPreviewTarget(null)}
      />
    </div>
  )
}
