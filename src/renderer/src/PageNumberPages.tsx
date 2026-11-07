import { FiTrash2 } from 'react-icons/fi'
import type { DesktopFile, OrganizePage } from '../../shared/types'
import { PdfPageThumbnail } from './PdfPreview'
import { pageNumberFontFamily, pageNumberMargin, pageNumberValue } from './pageNumbers'

interface PageNumberPagesProps {
  file: DesktopFile
  pages: OrganizePage[]
  loading: boolean
  options: Record<string, string>
  onRemove: () => void
  onPreview: (page: number) => void
}

export default function PageNumberPages({
  file,
  pages,
  loading,
  options,
  onRemove,
  onPreview
}: PageNumberPagesProps): React.JSX.Element {
  if (loading) {
    return <div className="organize-loading"><span className="spinner dark" /> Reading and preparing every page…</div>
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
          const value = pageNumberValue(page.page, pages.length, options)
          const margin = pageNumberMargin(options.margin)
          return (
            <button
              className="organize-page-card split-page-card page-number-page-card"
              type="button"
              key={page.page}
              aria-label={`Preview page ${page.page} of ${file.name}`}
              onClick={() => onPreview(page.page)}
            >
              <span className="organize-order">{page.page}</span>
              <PdfPageThumbnail file={file} pageNumber={page.page} />
              {value && (
                <span
                  className={`page-number-live ${options.position || 'bottom-right'}`}
                  style={{
                    '--page-number-margin': margin,
                    color: options.color,
                    fontFamily: pageNumberFontFamily(options.font_family),
                    fontSize: `${Math.max(7, Math.min(14, Number(options.font_size || 12) * 0.75))}px`,
                    fontWeight: options.bold === 'true' ? 800 : 500,
                    fontStyle: options.italic === 'true' ? 'italic' : 'normal',
                    textDecoration: options.underline === 'true' ? 'underline' : 'none'
                  } as React.CSSProperties}
                >
                  {value.text}
                </span>
              )}
              <div className="organize-page-info split-page-info">
                <div>
                  <strong>Page {page.page}</strong>
                  <span>{value ? `Number: ${value.text}` : 'Not numbered'}</span>
                </div>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
