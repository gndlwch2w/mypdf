import type { ToolId } from '../../shared/types'
import { useState } from 'react'
import { FiEye, FiEyeOff, FiFileText, FiImage, FiMonitor } from 'react-icons/fi'
import PageNumberOptions from './PageNumberOptions'
import WatermarkOptions from './WatermarkOptions'

interface ToolOptionsProps {
  tool: ToolId
  options: Record<string, string>
  sourceSize?: number
  selectedPageCount?: number
  pageCount?: number
  onChange: (key: string, value: string) => void
}

function PasswordField({
  id,
  label,
  value,
  placeholder,
  onChange
}: {
  id: string
  label: string
  value: string
  placeholder: string
  onChange: (value: string) => void
}): React.JSX.Element {
  const [visible, setVisible] = useState(false)
  const actionLabel = visible ? 'Hide password' : 'Show password'

  return (
    <div className="field grow">
      <label htmlFor={id}>{label}</label>
      <div className="password-input">
        <input
          id={id}
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
        />
        <button
          type="button"
          aria-label={actionLabel}
          title={actionLabel}
          aria-pressed={visible}
          onClick={() => setVisible((current) => !current)}
        >
          {visible ? <FiEyeOff /> : <FiEye />}
        </button>
      </div>
    </div>
  )
}

function formatEstimatedSize(bytes: number): string {
  if (bytes < 1024) return `${Math.max(1, Math.round(bytes))} B`
  const units = ['KB', 'MB', 'GB']
  let value = bytes / 1024
  let unit = units[0]
  for (let index = 1; value >= 1024 && index < units.length; index += 1) {
    value /= 1024
    unit = units[index]
  }
  return `${value.toFixed(value >= 10 ? 1 : 2)} ${unit}`
}

function SelectField({
  label,
  name,
  value,
  children,
  onChange
}: {
  label: string
  name: string
  value: string
  children: React.ReactNode
  onChange: (key: string, value: string) => void
}): React.JSX.Element {
  return (
    <label className="field">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(name, event.target.value)}>
        {children}
      </select>
    </label>
  )
}

export function defaultOptions(tool: ToolId): Record<string, string> {
  switch (tool) {
    case 'split':
      return { ranges: '' }
    case 'compress':
      return { level: 'medium' }
    case 'pdf-to-images':
      return { mode: 'pages', format: 'png', quality: 'medium' }
    case 'images-to-pdf':
      return { page_size: 'A4', orientation: 'portrait', margin: 'none' }
    case 'rotate':
      return { angle: '90' }
    case 'watermark':
      return {
        watermark_type: 'text', watermark_text: '', opacity: '0.3', position: 'center-center', mosaic: 'false',
        rotation: '45', font_family: 'helvetica', font_size: '48', bold: 'false', italic: 'false', underline: 'false',
        color: '#666666', page_from: '1', page_to: '', layer: 'over', watermark_image_path: '', watermark_image_name: '',
        watermark_image_type: '', watermark_image_size: ''
      }
    case 'pagenum':
      return {
        position: 'bottom-right', margin: 'recommended', first_number: '1', page_from: '1', page_to: '', text_format: '{n} / {p}',
        font_family: 'helvetica', font_size: '12', bold: 'false', italic: 'false', underline: 'false', color: '#333333'
      }
    case 'protect':
      return { password: '', confirm: '' }
    case 'unlock':
      return { password: '' }
    default:
      return {}
  }
}

function passwordStrength(password: string): { label: string; level: number } {
  if (!password) return { label: 'Enter a password', level: 0 }
  let score = 1
  if (password.length >= 8) score += 1
  if (password.length >= 12) score += 1
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score += 1
  if (/\d/.test(password) && /[^A-Za-z0-9]/.test(password)) score += 1
  if (score <= 2) return { label: 'Weak password', level: 1 }
  if (score <= 4) return { label: 'Good password', level: 2 }
  return { label: 'Strong password', level: 3 }
}

export default function ToolOptions({
  tool,
  options,
  sourceSize,
  selectedPageCount,
  pageCount,
  onChange
}: ToolOptionsProps): React.JSX.Element | null {
  if (tool === 'split') {
    return (
      <label className="field field-wide">
        <span>Page ranges</span>
        <input
          value={options.ranges ?? ''}
          onChange={(event) => onChange('ranges', event.target.value)}
          placeholder="For example: 1-3, 5, 8-"
        />
        <small>Select page cards or enter ranges manually. Leave empty to export the complete document.</small>
      </label>
    )
  }
  if (tool === 'compress') {
    return (
      <div className="choice-grid three">
        {([
          ['low', 'Light', 'Best quality', 0.94],
          ['medium', 'Balanced', 'Recommended', 0.84],
          ['high', 'Strong', 'Smallest file', 0.72]
        ] as const).map(([value, title, detail, ratio]) => (
          <button
            key={value}
            className={`choice compression-choice ${options.level === value ? 'selected' : ''}`}
            onClick={() => onChange('level', value)}
            type="button"
          >
            <span className={`compression-mark ${value}`}><i /><i /><i /></span>
            <span className="compression-copy">
              <strong>{title}</strong>
              <span className="choice-detail">{detail}</span>
              <span className={`compression-estimate ${sourceSize ? '' : 'empty'}`}>
                {sourceSize ? `≈ ${formatEstimatedSize(sourceSize * ratio)}` : 'Add a PDF to estimate'}
              </span>
            </span>
          </button>
        ))}
      </div>
    )
  }
  if (tool === 'pdf-to-images') {
    return (
      <div className="pdf-image-options">
        <div className="pdf-image-mode-field">
          <span className="option-group-label">Conversion mode</span>
          <div className="pdf-image-mode-grid">
            <button
              className={`choice pdf-image-mode ${options.mode !== 'extract' ? 'selected' : ''}`}
              type="button"
              onClick={() => onChange('mode', 'pages')}
            >
              <FiFileText />
              <span>
                <strong>Render pages</strong>
                <small>{pageCount ? `Create one image for each of the ${pageCount} pages.` : 'Create one image for every PDF page.'}</small>
              </span>
            </button>
            <button
              className={`choice pdf-image-mode ${options.mode === 'extract' ? 'selected' : ''}`}
              type="button"
              onClick={() => onChange('mode', 'extract')}
            >
              <FiImage />
              <span>
                <strong>Extract images</strong>
                <small>Export raster images embedded inside the PDF.</small>
              </span>
            </button>
          </div>
        </div>
        <div className="pdf-image-settings">
          <SelectField label="Output format" name="format" value={options.format} onChange={onChange}>
            <option value="png">PNG</option>
            <option value="jpg">JPG</option>
          </SelectField>
          <SelectField label="Quality" name="quality" value={options.quality} onChange={onChange}>
            <option value="low">Low</option>
            <option value="medium">Normal</option>
            <option value="high">High</option>
          </SelectField>
        </div>
      </div>
    )
  }
  if (tool === 'images-to-pdf') {
    const autoPageSize = options.page_size === 'auto'
    return (
      <div className="image-pdf-options">
        <section className="image-pdf-panel image-pdf-page-panel">
          <div className="image-pdf-panel-heading">
            <span><FiFileText /></span>
            <div><strong>Page setup</strong><small>Choose the paper dimensions and direction.</small></div>
          </div>
          <div className="image-pdf-page-controls">
            <div className={`image-pdf-control ${autoPageSize ? 'disabled' : ''}`}>
              <span className="image-pdf-control-label">Orientation</span>
              <div className="image-pdf-segmented orientation">
                {([['portrait', 'Portrait'], ['landscape', 'Landscape']] as const).map(([value, label]) => (
                  <button
                    className={options.orientation === value ? 'selected' : ''}
                    type="button"
                    key={value}
                    disabled={autoPageSize}
                    onClick={() => onChange('orientation', value)}
                  >
                    {value === 'portrait' ? <FiFileText /> : <FiMonitor />}
                    <span><strong>{label}</strong><small>{value === 'portrait' ? 'Vertical page' : 'Wide page'}</small></span>
                  </button>
                ))}
              </div>
            </div>
            <SelectField label="Page size" name="page_size" value={options.page_size} onChange={onChange}>
              <option value="A4">A4 · 210 × 297 mm</option>
              <option value="Letter">Letter · 8.5 × 11 in</option>
              <option value="Legal">Legal · 8.5 × 14 in</option>
              <option value="auto">Match each image</option>
            </SelectField>
          </div>
        </section>

        <section className={`image-pdf-panel image-pdf-spacing-panel ${autoPageSize ? 'disabled' : ''}`}>
          <div className="image-pdf-panel-heading">
            <span><FiImage /></span>
            <div><strong>Image spacing</strong><small>{autoPageSize ? 'Available with a fixed page size.' : 'Control the white border around each image.'}</small></div>
          </div>
          <div className="image-pdf-segmented spacing">
            {([['none', 'No margin', 'Edge to edge'], ['small', 'Small', 'Balanced'], ['big', 'Big', 'Wide border']] as const).map(([value, label, detail]) => (
              <button
                className={options.margin === value ? 'selected' : ''}
                type="button"
                key={value}
                disabled={autoPageSize}
                onClick={() => onChange('margin', value)}
              >
                <span className={`image-spacing-preview ${value}`}><FiImage /></span>
                <span><strong>{label}</strong><small>{detail}</small></span>
              </button>
            ))}
          </div>
        </section>
      </div>
    )
  }
  if (tool === 'rotate') {
    return (
      <div className="rotation-options">
        <p className="rotation-target-note">
          {selectedPageCount ? `Applies to ${selectedPageCount} selected ${selectedPageCount === 1 ? 'page' : 'pages'}.` : 'Applies to every page.'}
        </p>
        <div className="choice-grid four">
          {[
            ['0', '0°', 'Keep original'],
            ['90', '90°', 'Clockwise'],
            ['180', '180°', 'Upside down'],
            ['270', '270°', 'Counter-clockwise']
          ].map(([value, title, detail]) => (
            <button
              key={value}
              className={`choice ${options.angle === value ? 'selected' : ''}`}
              onClick={() => onChange('angle', value)}
              type="button"
            >
              <span className="rotation-card-copy">
                <strong>{title}</strong>
                <span>{detail}</span>
              </span>
              <span className="rotation-card-visual">
                <span className="rotation-card-preview" style={{ transform: `rotate(${value}deg)` }}>A</span>
                {options.angle === value && <span className="rotation-card-check">✓</span>}
              </span>
            </button>
          ))}
        </div>
      </div>
    )
  }
  if (tool === 'watermark') {
    return <WatermarkOptions options={options} pageCount={pageCount} onChange={onChange} />
  }
  if (tool === 'pagenum') {
    return <PageNumberOptions options={options} pageCount={pageCount} onChange={onChange} />
  }
  if (tool === 'protect' || tool === 'unlock') {
    const strength = passwordStrength(options.password)
    return (
      <div>
        <div className="fields-row">
          <PasswordField
            id={`${tool}-password`}
            label={tool === 'protect' ? 'New password' : 'Current password'}
            value={options.password}
            onChange={(value) => onChange('password', value)}
            placeholder="Enter password"
          />
          {tool === 'protect' && (
            <PasswordField
              id="protect-password-confirm"
              label="Confirm password"
              value={options.confirm}
              onChange={(value) => onChange('confirm', value)}
              placeholder="Enter it again"
            />
          )}
        </div>
        {tool === 'protect' && (
          <div className={`password-meter level-${strength.level}`}>
            <span><i /><i /><i /></span><strong>{strength.label}</strong>
          </div>
        )}
      </div>
    )
  }
  return null
}
