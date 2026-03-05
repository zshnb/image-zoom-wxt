import { storage } from 'wxt/utils/storage'

export const disabledSites = storage.defineItem<string[]>('local:disabledSites', {
  fallback: [],
})
