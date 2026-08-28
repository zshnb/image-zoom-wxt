import assert from 'node:assert/strict'
import worker, { assetPath } from './index.js'

assert.equal(assetPath('/'), '/index.html')
assert.equal(assetPath('/ai-image-upscaler-chrome-extension/'), '/ai-image-upscaler-chrome-extension/index.html')
assert.equal(assetPath('/local-ai-image-upscaler'), '/local-ai-image-upscaler/index.html')
assert.equal(assetPath('/styles.css'), '/styles.css')
assert.equal(assetPath('/llms.txt'), '/llms.txt')
assert.equal(assetPath('/facts.md'), '/facts.md')
assert.equal(assetPath('/zh-cn/use-cases/image-search/'), '/zh-cn/use-cases/image-search/index.html')

const insecure = await worker.fetch(new Request('http://imagezoom.zshnb.com/product/?ref=http'), {
  ASSETS: { fetch: () => assert.fail('canonical redirect must not hit static assets') },
})
assert.equal(insecure.status, 301)
assert.equal(insecure.headers.get('location'), 'https://imagezoom.zshnb.com/product/?ref=http')

const www = await worker.fetch(new Request('https://www.imagezoom.zshnb.com/product/?ref=www'), {
  ASSETS: { fetch: () => assert.fail('canonical redirect must not hit static assets') },
})
assert.equal(www.status, 301)
assert.equal(www.headers.get('location'), 'https://imagezoom.zshnb.com/product/?ref=www')

const redirect = await worker.fetch(new Request('https://imagezoom.zshnb.com/product.md'), {
  ASSETS: { fetch: () => assert.fail('redirect must not hit static assets') },
})
assert.equal(redirect.status, 301)
assert.equal(redirect.headers.get('location'), 'https://imagezoom.zshnb.com/product/')

const legacyEnglish = await worker.fetch(new Request('https://imagezoom.zshnb.com/en/use-cases/image-search/?ref=old'), {
  ASSETS: { fetch: () => assert.fail('redirect must not hit static assets') },
})
assert.equal(legacyEnglish.status, 301)
assert.equal(legacyEnglish.headers.get('location'), 'https://imagezoom.zshnb.com/use-cases/image-search/?ref=old')

let assetRequest
await worker.fetch(new Request('https://imagezoom.zshnb.com/sitemap.xml'), {
  ASSETS: { fetch: request => { assetRequest = request; return new Response('ok') } },
})
assert.equal(new URL(assetRequest.url).pathname, '/sitemap-v16.xml')
