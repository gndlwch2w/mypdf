import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type { DesktopFile, MyPdfApi, ProcessRequest, ToolId } from '../shared/types'

const api: MyPdfApi = {
  selectFiles: (tool: ToolId) => ipcRenderer.invoke('dialog:select-files', tool),
  selectWatermarkImage: () => ipcRenderer.invoke('dialog:select-watermark-image'),
  describeDroppedFiles: (paths: string[]) => ipcRenderer.invoke('files:describe', paths),
  getPathForFile: (file: File) => webUtils.getPathForFile(file),
  readFile: (file: DesktopFile) => ipcRenderer.invoke('files:read', file),
  getMetadata: (file: DesktopFile) => ipcRenderer.invoke('pdf:metadata', file),
  process: (request: ProcessRequest) => ipcRenderer.invoke('pdf:process', request),
  showItemInFolder: (path: string) => ipcRenderer.invoke('shell:show-item', path),
  getVersion: () => ipcRenderer.invoke('app:version')
}

contextBridge.exposeInMainWorld('mypdf', api)
