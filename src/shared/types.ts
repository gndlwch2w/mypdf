export type ToolId =
  | 'merge'
  | 'split'
  | 'compress'
  | 'pdf-to-images'
  | 'images-to-pdf'
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

export interface ProcessRequest {
  tool: ToolId
  files: DesktopFile[]
  options: Record<string, string>
  organizePages?: OrganizePage[]
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
  describeDroppedFiles(paths: string[]): Promise<DesktopFile[]>
  getPathForFile(file: File): string
  readFile(file: DesktopFile): Promise<Uint8Array>
  getMetadata(file: DesktopFile): Promise<PdfMetadata>
  process(request: ProcessRequest): Promise<ProcessResult>
  showItemInFolder(path: string): Promise<void>
  getVersion(): Promise<string>
}
