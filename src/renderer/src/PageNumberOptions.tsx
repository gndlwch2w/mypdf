import { FiBold, FiItalic, FiUnderline } from 'react-icons/fi'

interface PageNumberOptionsProps {
  options: Record<string, string>
  pageCount?: number
  onChange: (key: string, value: string) => void
}

const positions = [
  'top-left', 'top-center', 'top-right',
  'center-left', 'center-center', 'center-right',
  'bottom-left', 'bottom-center', 'bottom-right'
]

export default function PageNumberOptions({ options, pageCount, onChange }: PageNumberOptionsProps): React.JSX.Element {
  const toggle = (key: string): void => onChange(key, options[key] === 'true' ? 'false' : 'true')

  return (
    <div className="page-number-options">
      <div className="page-number-options-grid">
        <section className="page-number-option-group page-number-pages-group">
          <h3>Pages</h3>
          <div className="page-number-fields">
            <label>
              <span>First number</span>
              <input type="number" min="1" value={options.first_number} onChange={(event) => onChange('first_number', event.target.value)} />
            </label>
            <label>
              <span>From page</span>
              <input type="number" min="1" max={pageCount} value={options.page_from} onChange={(event) => onChange('page_from', event.target.value)} />
            </label>
            <label>
              <span>To page</span>
              <input type="number" min="1" max={pageCount} value={options.page_to} placeholder={pageCount ? String(pageCount) : 'Last'} onChange={(event) => onChange('page_to', event.target.value)} />
            </label>
          </div>
        </section>

        <section className="page-number-option-group page-number-position-group">
          <h3>Position</h3>
          <div className="page-number-position-grid">
            {positions.map((position) => (
              <button
                className={options.position === position ? 'selected' : ''}
                type="button"
                key={position}
                aria-label={position.replace('-', ' ')}
                title={position.replace('-', ' ')}
                onClick={() => onChange('position', position)}
              >
                <span />
              </button>
            ))}
          </div>
        </section>

        <section className="page-number-option-group page-number-margin-group">
          <h3>Margin</h3>
          <label className="page-number-select-field">
            <span>Distance from page edge</span>
            <select value={options.margin} onChange={(event) => onChange('margin', event.target.value)}>
              <option value="compact">Compact</option>
              <option value="recommended">Recommended</option>
              <option value="spacious">Spacious</option>
            </select>
          </label>
        </section>

        <section className="page-number-option-group page-number-text-group">
          <div className="page-number-text-heading">
            <h3>Text</h3>
            <span><code>{'{n}'}</code> is the page number · <code>{'{p}'}</code> is the final number</span>
          </div>
          <div className="page-number-text-controls">
            <label className="page-number-select-field page-number-template-field">
              <span>Number format</span>
              <div className="page-number-template-controls">
                <input
                  value={options.text_format}
                  maxLength={120}
                  placeholder="Page {n} of {p}"
                  onChange={(event) => onChange('text_format', event.target.value)}
                />
                <select
                  value=""
                  aria-label="Choose a number format preset"
                  onChange={(event) => {
                    if (event.target.value) onChange('text_format', event.target.value)
                  }}
                >
                  <option value="">Presets</option>
                  <option value="{n}">1</option>
                  <option value="Page {n}">Page 1</option>
                  <option value="{n} / {p}">1 / 12</option>
                  <option value="Page {n} of {p}">Page 1 of 12</option>
                </select>
              </div>
            </label>
            <div>
              <span className="page-number-format-label">Text format</span>
              <div className="watermark-format-row page-number-format-row">
                <select value={options.font_family} onChange={(event) => onChange('font_family', event.target.value)} aria-label="Font family">
                  <option value="helvetica">Helvetica</option><option value="times">Times</option><option value="courier">Courier</option>
                </select>
                <select value={options.font_size} onChange={(event) => onChange('font_size', event.target.value)} aria-label="Font size">
                  {[9, 10, 12, 14, 18].map((size) => <option key={size} value={size}>{size}px</option>)}
                </select>
                <button className={options.bold === 'true' ? 'selected' : ''} type="button" onClick={() => toggle('bold')} aria-label="Bold"><FiBold /></button>
                <button className={options.italic === 'true' ? 'selected' : ''} type="button" onClick={() => toggle('italic')} aria-label="Italic"><FiItalic /></button>
                <button className={options.underline === 'true' ? 'selected' : ''} type="button" onClick={() => toggle('underline')} aria-label="Underline"><FiUnderline /></button>
                <label className="watermark-color" title="Text color"><input type="color" value={options.color} onChange={(event) => onChange('color', event.target.value)} /></label>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
