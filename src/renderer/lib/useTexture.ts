import { useEffect, useState } from 'react'
import type { Texture } from '../../preload'
import { api } from './api'

// Shared across every component instance: a list of accounts all showing the
// same skin should cost one fetch, not one per avatar.
const cache = new Map<string, Texture>()
const inFlight = new Map<string, Promise<Texture>>()

function load(url: string): Promise<Texture> {
  const pending = inFlight.get(url)
  if (pending) return pending

  const request = api.skins
    .texture(url)
    .then((texture) => {
      cache.set(url, texture)
      return texture
    })
    .finally(() => inFlight.delete(url))

  inFlight.set(url, request)
  return request
}

/**
 * Resolves a Mojang texture url to a data url the page can actually paint.
 *
 * The bytes come through the main process rather than the renderer's own
 * network stack, so nothing here depends on the content policy allowing the
 * remote host — or on the url having been stored with the right scheme.
 */
export function useTexture(url: string | undefined): Texture | undefined {
  const [resolved, setResolved] = useState<Texture | undefined>(() => (url ? cache.get(url) : undefined))

  useEffect(() => {
    if (!url) {
      setResolved(undefined)
      return
    }

    const hit = cache.get(url)
    if (hit) {
      setResolved(hit)
      return
    }

    let active = true
    setResolved(undefined)
    void load(url)
      .then((texture) => {
        if (active) setResolved(texture)
      })
      // A missing texture falls back to the placeholder rather than an error.
      .catch(() => undefined)
    return () => {
      active = false
    }
  }, [url])

  return resolved
}
