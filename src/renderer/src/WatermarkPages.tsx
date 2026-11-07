import { useEffect, useMemo, useState } from 'react'
import { FiTrash2 } from 'react-icons/fi'
import type { DesktopFile, OrganizePage } from '../../shared/types'
import { PdfPageThumbnail } from './PdfPreview'

interface WatermarkPagesProps {
  file: DesktopFile
  pages: OrganizePage[]
  loading: boolean
  options: Record<string, string>
  onRemove: () => void
  onPreview: (page: number) => void
}

const mosaicPositions = [
  'top-left', 'top-center', 'top-right',
  'center-left', 'center-center', 'center-right',
  'bottom-left', 'bottom-center', 'bottom-right'
]

export default function WatermarkPages({ file, pages, loading, options, onRemove, onPreview }: WatermarkPagesProps): React.JSX.Element {
  const [imageUrl, setImageUrl] = useState('')

  useEffect(() => {
    let active = true
    let objectUrl = ''
    const path = options.watermark_image_path
    if (!path) {
      setImageUrl('')
      return () => { active = false }
    }
    const image: DesktopFile = {
      path,
      name: options.watermark_image_name,
      type: options.watermark_image_type,
      size: Number(options.watermark_image_size || 0)
    }
    void window.mypdf.readFile(image).then((bytes) => {
      if (!active) return
      objectUrl = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: image.type }))
      setImageUrl(objectUrl)
    })
    return () => {
      active = false
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [options.watermark_image_name, options.watermark_image_path, options.watermark_image_size, options.watermark_image_type])

  const overlayStyle = useMemo(() => ({
    opacity: Number(options.opacity || 0.3),
    color: options.color,
    fontFamily: options.font_family === 'times' ? 'serif' : options.font_family === 'courier' ? 'monospace' : 'sans-serif',
    fontSize: `${Math.max(11, Math.min(28, Number(options.font_size || 48) * 0.34))}px`,
    fontWeight: options.bold === 'true' ? 800 : 600,
    fontStyle: options.italic === 'true' ? 'italic' : 'normal',
    textDecoration: options.underline === 'true' ? 'underline' : 'none',
    transform: `translate(-50%, -50%) rotate(${Number(options.rotation || 0)}deg)`
  }), [options])

  if (loading) return <div className="organize-loading"><span className="spinner dark" /> Reading and preparing every page…</div>

  const firstPage = Math.max(1, Number(options.page_from || 1))
  const lastPage = options.page_to ? Number(options.page_to) : pages.length
  const positions = options.mosaic === 'true' ? mosaicPositions : [options.position || 'center-center']

  return (
    <div className="split-pages-view">
      <div className="split-source-file">
        <div><strong title={file.name}>{file.name}</strong><span>{pages.length} {pages.length === 1 ? 'page' : 'pages'}</span></div>
        <button type="button" onClick={onRemove} aria-label={`Remove ${file.name}`}><FiTrash2 /> Remove PDF</button>
      </div>
      <div className="split-page-grid">
        {pages.map((page) => {
          const visible = page.page >= firstPage && page.page <= lastPage
          return (
            <button className="organize-page-card split-page-card watermark-page-card" type="button" key={page.page} onClick={() => onPreview(page.page)}>
              <span className="organize-order">{page.page}</span>
              <PdfPageThumbnail file={file} pageNumber={page.page} />
              {visible && (
                <div className={`watermark-live-overlay ${options.layer === 'below' ? 'below' : ''}`}>
                  {positions.map((position) => (
                    <span className={`watermark-live-item ${position} ${options.mosaic === 'true' ? 'mosaic' : ''}`} style={overlayStyle} key={position}>
                      {options.watermark_type === 'image'
                        ? imageUrl && <img src={imageUrl} alt="" />
                        : options.watermark_text || 'WATERMARK'}
                    </span>
                  ))}
                </div>
              )}
              <div className="organize-page-info split-page-info"><div><strong>Page {page.page}</strong><span>{visible ? 'Watermark applied' : 'Outside page range'}</span></div></div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
