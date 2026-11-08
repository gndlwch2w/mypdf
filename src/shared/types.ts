export type ToolId =
  | 'merge'
  | 'split'
  | 'compress'
  | 'pdf-to-images'
  | 'images-to-pdf'
  | 'powerpoint'
  | 'edit'
  | 'word'
  | 'rotate'
  | 'watermark'
  | 'unlock'
  | 'protect'
  | 'organize'
  | 'pagenum'
  | 'extract-text'

export interface DesktopFile {
  path: string
  name: string
  size: number
  type: string
}

export interface OrganizePage {
  fileIndex: number
  page: number
  included: boolean
}

export type PdfEditorTool = 'select' | 'hand' | 'text' | 'shape' | 'draw' | PdfAnnotationKind
export type PdfShapeKind = 'rectangle' | 'ellipse' | 'line' | 'arrow'
export type PdfAnnotationKind = 'highlight' | 'underline' | 'strikeout' | 'note'

export interface PdfEditElementBase {
  id: string
  page: number
  x: number
  y: number
  width: number
  height: number
  opacity: number
  zIndex: number
}

export interface PdfTextElement extends PdfEditElementBase {
  type: 'text'
  text: string
  fontFamily: 'helvetica' | 'times' | 'courier'
  fontSize: number
  color: string
  bold: boolean
  italic: boolean
  underline: boolean
  align: 'left' | 'center' | 'right'
}

export interface PdfImageElement extends PdfEditElementBase {
  type: 'image'
  assetId: string
}

export interface PdfShapeElement extends PdfEditElementBase {
  type: 'shape'
  shape: PdfShapeKind
  stroke: string
  fill: string
  strokeWidth: number
}

export interface PdfDrawingElement extends PdfEditElementBase {
  type: 'drawing'
  points: number[]
  stroke: string
  strokeWidth: number
}

export interface PdfAnnotationElement extends PdfEditElementBase {
  type: 'annotation'
  annotation: PdfAnnotationKind
  color: string
  text: string
}

export type PdfEditElement = PdfTextElement | PdfImageElement | PdfShapeElement | PdfDrawingElement | PdfAnnotationElement

export interface PdfEditDocument {
  version: 1
  pageCount: number
  elements: PdfEditElement[]
}

export interface PdfEditAsset {
  id: string
  file: DesktopFile
}

export interface ProcessRequest {
  tool: ToolId
  files: DesktopFile[]
  options: Record<string, string>
  organizePages?: OrganizePage[]
  editorDocument?: PdfEditDocument
  editorAssets?: PdfEditAsset[]
}

export interface ProcessResult {
  cancelled: boolean
  outputPath?: string
  originalSize?: number
  outputSize?: number
}

export interface PdfMetadata {
  pages: number
  title?: string | null
  author?: string | null
  is_encrypted: boolean
}

export interface MyPdfApi {
  selectFiles(tool: ToolId): Promise<DesktopFile[]>
  selectWatermarkImage(): Promise<DesktopFile | null>
  selectEditorImage(): Promise<DesktopFile | null>
  describeDroppedFiles(paths: string[]): Promise<DesktopFile[]>
  getPathForFile(file: File): string
  readFile(file: DesktopFile): Promise<Uint8Array>
  getMetadata(file: DesktopFile): Promise<PdfMetadata>
  process(request: ProcessRequest): Promise<ProcessResult>
  showItemInFolder(path: string): Promise<void>
  getVersion(): Promise<string>
}
