import type { OpbayApi } from '../../preload'

declare global {
  interface Window {
    opbay: OpbayApi
  }
}

export const api = window.opbay

export type { OpbayApi }
