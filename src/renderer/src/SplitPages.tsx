import { FiCheck, FiEye, FiTrash2 } from 'react-icons/fi'
import type { DesktopFile, OrganizePage } from '../../shared/types'
import { PdfPageThumbnail } from './PdfPreview'
import { pagesFromRanges, rangesFromPages } from './splitRanges'

interface SplitPagesProps {
  file: DesktopFile
  pages: OrganizePage[]
  loading: boolean
  ranges: string
  onRangesChange: (ranges: string) => void
  onRemove: () => void
  onPreview: (page: number) => void
}

export default function SplitPages({
  file,
  pages,
  loading,
  ranges,
  onRangesChange,
  onRemove,
  onPreview
}: SplitPagesProps): React.JSX.Element {
  if (loading) {
    return <div className="organize-loading"><span className="spinner dark" /> Reading and preparing every page…</div>
  }

  const selectedPages = pagesFromRanges(ranges, pages.length)
  const selected = new Set(selectedPages)

  function togglePage(pageNumber: number): void {
    const next = selected.has(pageNumber)
      ? selectedPages.filter((page) => page !== pageNumber)
      : [...selectedPages, pageNumber]
    onRangesChange(rangesFromPages(next))
  }

  return (
    <div className="split-pages-view">
      <div className="split-source-file">
        <div>
          <strong title={file.name}>{file.name}</strong>
          <span>{pages.length} {pages.length === 1 ? 'page' : 'pages'}</span>
        </div>
        <button type="button" onClick={onRemove} aria-label={`Remove ${file.name}`}>
          <FiTrash2 /> Remove PDF
        </button>
      </div>

      <div className="split-page-grid">
        {pages.map((page) => {
          const isSelected = selected.has(page.page)
          return (
            <article
              className={`organize-page-card split-page-card split-select-page-card ${isSelected ? 'selected' : ''}`}
              key={`${page.fileIndex}-${page.page}`}
            >
              <span className="organize-order">{page.page}</span>
              {isSelected && <span className="split-page-check"><FiCheck /></span>}
              <button
                className="split-page-select-surface"
                type="button"
                aria-label={`${isSelected ? 'Deselect' : 'Select'} page ${page.page}`}
                aria-pressed={isSelected}
                onClick={() => togglePage(page.page)}
              >
                <PdfPageThumbnail file={file} pageNumber={page.page} />
                <div className="organize-page-info split-page-info">
                  <div>
                    <strong>Page {page.page}</strong>
                    <span>{isSelected ? 'Selected' : 'Click to select'}</span>
                  </div>
                </div>
              </button>
              <button
                className="split-page-preview-button"
                type="button"
                aria-label={`Preview page ${page.page} of ${file.name}`}
                onClick={() => onPreview(page.page)}
              >
                <FiEye />
              </button>
            </article>
          )
        })}
      </div>
    </div>
  )
}
