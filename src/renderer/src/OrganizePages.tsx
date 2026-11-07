import { useState } from 'react'
import type { CSSProperties } from 'react'
import { FiMove, FiPlus, FiTrash2 } from 'react-icons/fi'
import type { DesktopFile, OrganizePage } from '../../shared/types'
import { PdfPageThumbnail } from './PdfPreview'

interface OrganizePagesProps {
  files: DesktopFile[]
  pages: OrganizePage[]
  loading: boolean
  onPagesChange: (pages: OrganizePage[]) => void
  onRemoveFile: (fileIndex: number) => void
  onAdd: () => void
  onPreview: (file: DesktopFile, page: number) => void
}

function swapPages(pages: OrganizePage[], from: number, to: number): OrganizePage[] {
  if (from === to || from < 0 || to < 0 || from >= pages.length || to >= pages.length) return pages
  const next = [...pages]
  ;[next[from], next[to]] = [next[to], next[from]]
  return next
}

const sourcePalette = [
  { accent: '#d65b63', border: '#eda2a7', soft: '#fff1f2' },
  { accent: '#168aa0', border: '#79cbd8', soft: '#ecfafc' },
  { accent: '#7656b5', border: '#b6a2df', soft: '#f5f1fc' },
  { accent: '#b57918', border: '#dfbd73', soft: '#fff8e8' },
  { accent: '#3f6fbe', border: '#96b2e1', soft: '#f0f5fd' },
  { accent: '#a85088', border: '#d49ac1', soft: '#fcf0f8' }
]

function sourceStyle(fileIndex: number): CSSProperties {
  const color = sourcePalette[fileIndex % sourcePalette.length]
  return {
    '--source-accent': color.accent,
    '--source-border': color.border,
    '--source-soft': color.soft
  } as CSSProperties
}

export default function OrganizePages({
  files,
  pages,
  loading,
  onPagesChange,
  onRemoveFile,
  onAdd,
  onPreview
}: OrganizePagesProps): React.JSX.Element {
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null)
  const [targetIndex, setTargetIndex] = useState<number | null>(null)

  if (loading) {
    return <div className="organize-loading"><span className="spinner dark" /> Reading and preparing every page…</div>
  }

  return (
    <div className="organize-pages-view">
      {files.length > 0 && (
        <div className="organize-source-legend" aria-label="PDF source colors">
          {files.map((file, fileIndex) => {
            const pageCount = pages.filter((page) => page.fileIndex === fileIndex).length
            return (
              <div style={sourceStyle(fileIndex)} key={`${file.name}-${fileIndex}`} data-file-name={file.name}>
                <span />
                <strong title={file.name}>{file.name}</strong>
                <small>{pageCount} {pageCount === 1 ? 'page' : 'pages'}</small>
                <button type="button" onClick={() => onRemoveFile(fileIndex)} aria-label={`Remove all pages from ${file.name}`} title={`Remove ${file.name}`}><FiTrash2 /></button>
              </div>
            )
          })}
        </div>
      )}
      <div className="organize-page-grid">
        {pages.map((page, index) => {
        const file = files[page.fileIndex]
        if (!file) return null
        return (
          <article
            className={`organize-page-card source-coded ${draggedIndex === index ? 'drag-source' : ''} ${targetIndex === index ? 'drag-target' : ''}`}
            draggable
            key={`${page.fileIndex}-${page.page}`}
            style={sourceStyle(page.fileIndex)}
            onDragStart={(event) => {
              setDraggedIndex(index)
              event.dataTransfer.effectAllowed = 'move'
              event.dataTransfer.setData('text/plain', `${page.fileIndex}:${page.page}`)
            }}
            onDragEnter={(event) => {
              if (draggedIndex === null) return
              event.preventDefault()
              event.stopPropagation()
              setTargetIndex(index)
            }}
            onDragOver={(event) => {
              if (draggedIndex === null) return
              event.preventDefault()
              event.stopPropagation()
              event.dataTransfer.dropEffect = 'move'
            }}
            onDrop={(event) => {
              if (draggedIndex === null) return
              event.preventDefault()
              event.stopPropagation()
              onPagesChange(swapPages(pages, draggedIndex, index))
              setDraggedIndex(null)
              setTargetIndex(null)
            }}
            onDragEnd={() => {
              setDraggedIndex(null)
              setTargetIndex(null)
            }}
          >
            <span className="organize-order">{index + 1}</span>
            <button
              className="organize-page-remove"
              type="button"
              aria-label={`Remove page ${page.page} from ${file.name}`}
              onClick={() => onPagesChange(pages.filter((_, itemIndex) => itemIndex !== index))}
            >
              <FiTrash2 />
            </button>
            <button
              className="page-preview-button"
              type="button"
              aria-label={`Preview page ${page.page} of ${file.name}`}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={() => onPreview(file, page.page)}
            >
              <PdfPageThumbnail file={file} pageNumber={page.page} />
            </button>
            <div className="organize-page-info">
              <div>
                <strong title={file.name}>{file.name}</strong>
                <span>Page {page.page}</span>
              </div>
              <FiMove aria-label="Drag to swap" />
            </div>
          </article>
        )
        })}
        <button className="organize-add-card" type="button" onClick={onAdd}>
          <span><FiPlus /></span>
          <strong>Add PDFs</strong>
          <small>Pages will be added here</small>
        </button>
      </div>
    </div>
  )
}
