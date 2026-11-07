import type { IconType } from 'react-icons'
import {
  FiFilePlus,
  FiFileText,
  FiHash,
  FiImage,
  FiLayers,
  FiLock,
  FiMinimize2,
  FiRotateCw,
  FiScissors,
  FiShuffle,
  FiUnlock
} from 'react-icons/fi'
import { LuPresentation, LuStamp } from 'react-icons/lu'
import type { ToolId } from '../../shared/types'

export interface ToolDefinition {
  id: ToolId
  title: string
  shortTitle: string
  description: string
  icon: IconType
  accent: string
  multiple: boolean
  imageInput?: boolean
  powerpointInput?: boolean
}

export const tools: ToolDefinition[] = [
  {
    id: 'merge',
    title: 'Merge PDF',
    shortTitle: 'Merge',
    description: 'Combine several PDFs in exactly the order you choose.',
    icon: FiLayers,
    accent: '#ef665b',
    multiple: true
  },
  {
    id: 'split',
    title: 'Split PDF',
    shortTitle: 'Split',
    description: 'Extract page ranges into independent PDF files.',
    icon: FiScissors,
    accent: '#e79039',
    multiple: false
  },
  {
    id: 'compress',
    title: 'Compress PDF',
    shortTitle: 'Compress',
    description: 'Reduce a document size while keeping it readable.',
    icon: FiMinimize2,
    accent: '#41a57b',
    multiple: true
  },
  {
    id: 'pdf-to-images',
    title: 'PDF to images',
    shortTitle: 'PDF to JPG',
    description: 'Render PDF pages or extract embedded images into a ZIP.',
    icon: FiImage,
    accent: '#617bd8',
    multiple: false
  },
  {
    id: 'images-to-pdf',
    title: 'Images to PDF',
    shortTitle: 'JPG to PDF',
    description: 'Turn JPG, PNG and other images into one PDF.',
    icon: FiFilePlus,
    accent: '#8b6fc7',
    multiple: true,
    imageInput: true
  },
  {
    id: 'powerpoint',
    title: 'PowerPoint converter',
    shortTitle: 'PowerPoint',
    description: 'Export a presentation as a PDF or a flattened image-only PowerPoint.',
    icon: LuPresentation,
    accent: '#d85b3f',
    multiple: true,
    powerpointInput: true
  },
  {
    id: 'rotate',
    title: 'Rotate PDF',
    shortTitle: 'Rotate',
    description: 'Rotate every page or only the pages you select.',
    icon: FiRotateCw,
    accent: '#2b9caf',
    multiple: false
  },
  {
    id: 'watermark',
    title: 'Add watermark',
    shortTitle: 'Watermark',
    description: 'Place a text or image watermark on the pages you choose.',
    icon: LuStamp,
    accent: '#d76e91',
    multiple: false
  },
  {
    id: 'unlock',
    title: 'Unlock PDF',
    shortTitle: 'Unlock',
    description: 'Remove a known password from a protected PDF.',
    icon: FiUnlock,
    accent: '#3ca0a0',
    multiple: false
  },
  {
    id: 'protect',
    title: 'Protect PDF',
    shortTitle: 'Protect',
    description: 'Encrypt a PDF and require a password to open it.',
    icon: FiLock,
    accent: '#586f94',
    multiple: false
  },
  {
    id: 'organize',
    title: 'Organize pages',
    shortTitle: 'Organize',
    description: 'Reorder, remove and combine pages from several PDFs.',
    icon: FiShuffle,
    accent: '#cf7445',
    multiple: true
  },
  {
    id: 'pagenum',
    title: 'Page numbers',
    shortTitle: 'Number pages',
    description: 'Add styled page numbers to the page range you choose.',
    icon: FiHash,
    accent: '#6c83a8',
    multiple: false
  },
  {
    id: 'extract-text',
    title: 'Extract text',
    shortTitle: 'Extract text',
    description: 'Read embedded text and use OCR for scanned documents.',
    icon: FiFileText,
    accent: '#538e64',
    multiple: false
  }
]

export function getTool(id: ToolId): ToolDefinition {
  return tools.find((tool) => tool.id === id) ?? tools[0]
}
