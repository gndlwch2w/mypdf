import type { MyPdfApi } from '../shared/types'

declare global {
  interface Window {
    mypdf: MyPdfApi
  }
}

export {}
