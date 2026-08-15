import type { PisanKusApi } from '../../preload'

declare global {
  interface Window {
    pisankus: PisanKusApi
  }
}

export const api = window.pisankus

export type { PisanKusApi }
