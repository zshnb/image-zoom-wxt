type DownloadImageMessage = {
  type: 'DOWNLOAD_IMAGE'
  url: string
  filename: string
}

function isDownloadImageMessage(msg: unknown): msg is DownloadImageMessage {
  if (typeof msg !== 'object' || msg === null) return false
  const candidate = msg as Record<string, unknown>
  return (
    candidate.type === 'DOWNLOAD_IMAGE'
    && typeof candidate.url === 'string'
    && typeof candidate.filename === 'string'
  )
}

function sanitizeDownloadFilename(filename: string): string {
  const clean = filename
    .replace(/[\\/:*?"<>|\u0000-\u001F]/g, '_')
    .trim()

  return clean || 'image'
}

export default defineBackground(() => {
  browser.runtime.onMessage.addListener(async (msg: unknown) => {
    if (!isDownloadImageMessage(msg)) return undefined

    try {
      const url = new URL(msg.url)
      if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        return { ok: false }
      }

      await browser.downloads.download({
        url: url.href,
        filename: sanitizeDownloadFilename(msg.filename),
      })

      return { ok: true }
    } catch {
      return { ok: false }
    }
  })
})
