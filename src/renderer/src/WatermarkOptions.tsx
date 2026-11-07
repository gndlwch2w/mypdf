import { FiBold, FiImage, FiItalic, FiLayers, FiType, FiUnderline, FiUpload } from 'react-icons/fi'

interface WatermarkOptionsProps {
  options: Record<string, string>
  pageCount?: number
  onChange: (key: string, value: string) => void
}

const positions = [
  'top-left', 'top-center', 'top-right',
  'center-left', 'center-center', 'center-right',
  'bottom-left', 'bottom-center', 'bottom-right'
]

export default function WatermarkOptions({ options, pageCount, onChange }: WatermarkOptionsProps): React.JSX.Element {
  const imageMode = options.watermark_type === 'image'
  const toggle = (key: string): void => onChange(key, options[key] === 'true' ? 'false' : 'true')

  async function chooseImage(): Promise<void> {
    const file = await window.mypdf.selectWatermarkImage()
    if (!file) return
    onChange('watermark_image_path', file.path)
    onChange('watermark_image_name', file.name)
    onChange('watermark_image_type', file.type)
    onChange('watermark_image_size', String(file.size))
  }

  return (
    <div className="watermark-options">
      <div className="watermark-type-tabs" role="group" aria-label="Watermark type">
        <button className={!imageMode ? 'selected' : ''} type="button" onClick={() => onChange('watermark_type', 'text')}><FiType /> Text</button>
        <button className={imageMode ? 'selected' : ''} type="button" onClick={() => onChange('watermark_type', 'image')}><FiImage /> Image</button>
      </div>

      <div className="watermark-options-grid">
        <section className="watermark-option-group watermark-content-group">
          <h3>{imageMode ? 'Watermark image' : 'Watermark text'}</h3>
          {imageMode ? (
            <button className="watermark-image-picker" type="button" onClick={() => void chooseImage()}>
              <FiUpload /><span><strong>{options.watermark_image_name || 'Choose an image'}</strong><small>PNG, JPG or WebP</small></span>
            </button>
          ) : (
            <>
              <input className="watermark-text-input" value={options.watermark_text} onChange={(event) => onChange('watermark_text', event.target.value)} placeholder="CONFIDENTIAL" />
              <div className="watermark-format-row">
                <select value={options.font_family} onChange={(event) => onChange('font_family', event.target.value)} aria-label="Font family">
                  <option value="helvetica">Helvetica</option><option value="times">Times</option><option value="courier">Courier</option>
                </select>
                <select value={options.font_size} onChange={(event) => onChange('font_size', event.target.value)} aria-label="Font size">
                  {[24, 36, 48, 64, 96].map((size) => <option key={size} value={size}>{size}px</option>)}
                </select>
                <button className={options.bold === 'true' ? 'selected' : ''} type="button" onClick={() => toggle('bold')} aria-label="Bold"><FiBold /></button>
                <button className={options.italic === 'true' ? 'selected' : ''} type="button" onClick={() => toggle('italic')} aria-label="Italic"><FiItalic /></button>
                <button className={options.underline === 'true' ? 'selected' : ''} type="button" onClick={() => toggle('underline')} aria-label="Underline"><FiUnderline /></button>
                <label className="watermark-color" title="Text color"><input type="color" value={options.color} onChange={(event) => onChange('color', event.target.value)} /></label>
              </div>
            </>
          )}
        </section>

        <section className="watermark-option-group watermark-position-group">
          <h3>Position</h3>
          <div className="watermark-position-controls">
            <div className="watermark-position-grid">
              {positions.map((position) => <button className={options.position === position && options.mosaic !== 'true' ? 'selected' : ''} type="button" key={position} aria-label={position.replace('-', ' ')} onClick={() => { onChange('position', position); onChange('mosaic', 'false') }}><span /></button>)}
            </div>
            <button className={`watermark-mosaic ${options.mosaic === 'true' ? 'selected' : ''}`} type="button" onClick={() => toggle('mosaic')}><span>•••<br />•••<br />•••</span><strong>Tile</strong></button>
          </div>
        </section>

        <section className="watermark-option-group watermark-adjust-group">
          <h3>Appearance</h3>
          <label><span>Opacity</span><select value={options.opacity} onChange={(event) => onChange('opacity', event.target.value)}>
            <option value="1">100%</option><option value="0.75">75%</option><option value="0.5">50%</option><option value="0.3">30%</option><option value="0.15">15%</option>
          </select></label>
          <label><span>Rotation</span><select value={options.rotation} onChange={(event) => onChange('rotation', event.target.value)}>
            <option value="0">0°</option><option value="45">45°</option><option value="90">90°</option><option value="315">−45°</option>
          </select></label>
        </section>

        <section className="watermark-option-group watermark-pages-group">
          <h3>Pages</h3>
          <div className="watermark-page-range">
            <label><span>From</span><input type="number" min="1" max={pageCount} value={options.page_from} onChange={(event) => onChange('page_from', event.target.value)} /></label>
            <span className="watermark-range-arrow">→</span>
            <label><span>To</span><input type="number" min="1" max={pageCount} value={options.page_to} placeholder={pageCount ? String(pageCount) : 'Last'} onChange={(event) => onChange('page_to', event.target.value)} /></label>
          </div>
        </section>

        <section className="watermark-option-group watermark-layer-group">
          <h3>Layer</h3>
          <div className="watermark-layer-choices">
            <button className={options.layer === 'over' ? 'selected' : ''} type="button" onClick={() => onChange('layer', 'over')}><FiLayers /><span><strong>Over content</strong><small>Always visible</small></span></button>
            <button className={options.layer === 'below' ? 'selected' : ''} type="button" onClick={() => onChange('layer', 'below')}><FiLayers /><span><strong>Below content</strong><small>Behind the PDF</small></span></button>
          </div>
        </section>
      </div>
    </div>
  )
}
