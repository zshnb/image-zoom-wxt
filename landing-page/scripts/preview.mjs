import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { createServer } from 'node:http'
import { extname, join, normalize } from 'node:path'

const root = 'dist'
const port = Number(process.env.PORT) || 4173
const types = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.mp4': 'video/mp4',
}

createServer(async (request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname)
  let file = join(root, normalize(pathname).replace(/^(\.\.[/\\])+/, ''))
  try {
    if ((await stat(file)).isDirectory()) file = join(file, 'index.html')
    await stat(file)
  } catch {
    response.writeHead(404, { 'content-type': types['.txt'] }).end('Not found')
    return
  }
  response.writeHead(200, { 'content-type': types[extname(file)] || 'application/octet-stream' })
  createReadStream(file).pipe(response)
}).listen(port, () => console.log(`Preview: http://localhost:${port}/`))
