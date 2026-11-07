import { FiCheck, FiTrash2 } from 'react-icons/fi'
import type { DesktopFile, OrganizePage } from '../../shared/types'
import { PdfPageThumbnail } from './PdfPreview'

interface RotatePagesProps {
  file: DesktopFile
  pages: OrganizePage[]
  loading: boolean
  angle: number
  selectedPages: number[]
  onSelectionChange: (pages: number[]) => void
  onPreview: (page: number) => void
  onRemove: () => void
}

export default function RotatePages({
  file,
  pages,
  loading,
  angle,
  selectedPages,
  onSelectionChange,
  onPreview,
  onRemove
}: RotatePagesProps): React.JSX.Element {
  if (loading) {
    return <div className="organize-loading"><span className="spinner dark" /> Reading and preparing every page…</div>
  }

  const selected = new Set(selectedPages)

  function togglePage(pageNumber: number): void {
    onSelectionChange(selected.has(pageNumber)
      ? selectedPages.filter((page) => page !== pageNumber)
      : [...selectedPages, pageNumber].sort((left, right) => left - right))
  }

  return (
    <div className="split-pages-view">
      <div className="split-source-file rotate-source-file">
        <div>
          <strong title={file.name}>{file.name}</strong>
          <span>{pages.length} {pages.length === 1 ? 'page' : 'pages'}</span>
        </div>
        <div className="rotate-source-actions">
          <span className="rotate-target-summary">
            {selectedPages.length > 0 ? `${selectedPages.length} selected` : 'All pages'}
          </span>
          {selectedPages.length > 0 && (
            <button className="rotate-all-button" type="button" onClick={() => onSelectionChange([])}>
              Use all pages
            </button>
          )}
          <button className="rotate-remove-button" type="button" onClick={onRemove} aria-label={`Remove ${file.name}`}>
            <FiTrash2 /> Remove PDF
          </button>
        </div>
      </div>

      <div className="split-page-grid">
        {pages.map((page) => {
          const isSelected = selected.has(page.page)
          const previewRotation = selectedPages.length === 0 || isSelected ? angle : 0
          return (
            <article
              className={`organize-page-card rotate-page-card ${isSelected ? 'selected' : ''}`}
              key={`${page.fileIndex}-${page.page}`}
            >
              <span className="organize-order">{page.page}</span>
              {isSelected && <span className="rotate-page-check"><FiCheck /></span>}
              <button
                className="page-preview-button"
                type="button"
                aria-label={`Preview page ${page.page} of ${file.name}`}
                onClick={() => onPreview(page.page)}
              >
                <PdfPageThumbnail file={file} pageNumber={page.page} rotation={previewRotation} />
              </button>
              <button
                className="organize-page-info split-page-info rotate-page-select"
                type="button"
                aria-pressed={isSelected}
                onClick={() => togglePage(page.page)}
              >
                <div>
                  <strong>Page {page.page}</strong>
                  <span>{isSelected ? `Selected · ${angle}°` : 'Click to select'}</span>
                </div>
              </button>
            </article>
          )
        })}
      </div>
    </div>
  )
}
