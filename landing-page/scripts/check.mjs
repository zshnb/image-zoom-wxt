import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'

const site = 'https://imagezoom.zshnb.com'
const pages = {
  '/': { lang: 'en', keywords: ['image zoom extension', 'chrome', 'ai image upscaler'] },
  '/zh-cn/': { lang: 'zh-CN', keywords: ['图片放大插件', 'chrome', 'ai 图片高清放大'] },
  '/local-ai-image-upscaler/': { lang: 'en', keywords: ['local real-esrgan', 'chrome', 'native messaging'] },
  '/zh-cn/local-ai-image-upscaler/': { lang: 'zh-CN', keywords: ['本地 real-esrgan', 'chrome', '本地助手'] },
  '/privacy/': { lang: 'en', keywords: ['privacy'] },
  '/terms/': { lang: 'en', keywords: ['terms'] },
}

const one = (html, pattern) => html.match(pattern)?.[1]
const plain = (value) => value.replace(/<[^>]+>/g, '').toLowerCase()

for (const [path, expected] of Object.entries(pages)) {
  const html = await readFile(`dist${path}index.html`, 'utf8')
  const title = one(html, /<title>([^<]+)<\/title>/)
  const description = one(html, /<meta name="description" content="([^"]+)"/)
  const h1s = html.match(/<h1[\s>]/g) || []

  assert.equal(one(html, /<html lang="([^"]+)"/), expected.lang, `${path} lang`)
  assert.equal(one(html, /<link rel="canonical" href="([^"]+)"/), `${site}${path}`, `${path} canonical`)
  assert.ok(title && title.length <= 70, `${path} title length ${title?.length}`)
  assert.ok(description && description.length >= 70 && description.length <= 170, `${path} description length ${description?.length}`)
  assert.equal(h1s.length, 1, `${path} exactly one h1`)
  for (const keyword of expected.keywords) {
    assert.ok(plain(`${title} ${description} ${html}`).includes(keyword), `${path} mentions "${keyword}"`)
  }

  const schema = JSON.parse(one(html, /<script type="application\/ld\+json">(.+?)<\/script>/s))
  assert.ok(Array.isArray(schema['@graph']), `${path} JSON-LD graph`)
  assert.match(html, /<meta name="robots" content="index, follow/, `${path} indexable`)

  for (const [, src] of html.matchAll(/<img[^>]+src="(\/[^"?]+)"/g)) assert.ok(existsSync(`dist${src}`), `${path} missing image ${src}`)
  for (const tag of html.match(/<img\b[^>]*>/g)) assert.match(tag, /\balt="/, `${path} img without alt: ${tag}`)
  for (const [, href] of html.matchAll(/href="(\/[^"#?]*)/g)) {
    const file = href.endsWith('/') ? `dist${href}index.html` : `dist${href}`
    assert.ok(existsSync(file), `${path} broken internal link ${href}`)
  }
  for (const [, id] of html.matchAll(/href="#([^"]+)"/g)) assert.ok(html.includes(`id="${id}"`), `${path} missing anchor #${id}`)
}

for (const path of ['/', '/zh-cn/']) {
  const html = await readFile(`dist${path}index.html`, 'utf8')
  for (const code of ['en', 'zh-CN', 'x-default']) assert.match(html, new RegExp(`hreflang="${code}"`), `${path} hreflang ${code}`)
  const types = JSON.parse(one(html, /<script type="application\/ld\+json">(.+?)<\/script>/s))['@graph'].map((node) => node['@type'])
  for (const type of ['SoftwareApplication', 'FAQPage', 'WebSite', 'Organization']) assert.ok(types.includes(type), `${path} schema ${type}`)
}

for (const pair of [{ en: '/', zh: '/zh-cn/' }, { en: '/local-ai-image-upscaler/', zh: '/zh-cn/local-ai-image-upscaler/' }]) {
  for (const path of Object.values(pair)) {
    const html = await readFile(`dist${path}index.html`, 'utf8')
    for (const [lang, target] of [['en', pair.en], ['zh-CN', pair.zh], ['x-default', pair.en]]) {
      assert.ok(html.includes(`<link rel="alternate" hreflang="${lang}" href="${site}${target}">`), `${path} matching alternate ${lang}`)
    }
  }
}

for (const [lang, path] of [['en', '/local-ai-image-upscaler/'], ['zh', '/zh-cn/local-ai-image-upscaler/']]) {
  const html = await readFile(`dist${path}index.html`, 'utf8')
  const homePath = lang === 'en' ? '/' : '/zh-cn/'
  const other = lang === 'en' ? '/zh-cn/local-ai-image-upscaler/' : '/local-ai-image-upscaler/'
  assert.match(html, new RegExp(`class="navLang" href="${other}"`), `${path} language switch stays on guide`)
  assert.ok(html.includes(`href="${homePath}"`), `${path} links back to viewer`)
  const homeHtml = await readFile(`dist${homePath}index.html`, 'utf8')
  assert.ok(homeHtml.includes(`href="${path}"`), `${homePath} links to setup`)
  for (const required of ['chmod +x native-host/install.sh', './native-host/install.sh EXTENSION_ID', '/absolute/path/to/realesrgan-ncnn-vulkan', '/absolute/path/to/models', '/usr/bin/python3', 'PATH', 'realesrgan-x4plus.param', 'realesrgan-x4plus.bin', 'realesr-general-x4v3.param', 'realesr-general-x4v3.bin', 'com.image_zoom.esrgan', 'LiteRT/WebGPU', 'Lanczos', '.pth', 'Windows', 'native_cli_fallback']) {
    assert.ok(html.includes(required), `${path} missing setup fact ${required}`)
  }
  for (const file of ['install.sh', 'host.py']) assert.ok(html.includes(`href="/downloads/native-host/${file}" download="${file}"`), `${path} download ${file}`)
  const types = JSON.parse(one(html, /<script type="application\/ld\+json">(.+?)<\/script>/s))['@graph'].map((node) => node['@type'])
  assert.ok(types.includes('BreadcrumbList') && types.includes('WebPage'), `${path} guide schema`)
  assert.ok(!types.includes('SoftwareApplication'), `${path} does not advertise a separate downloadable app`)
}

for (const file of ['install.sh', 'host.py']) {
  assert.deepEqual(await readFile(`dist/downloads/native-host/${file}`), await readFile(`../native-host/${file}`), `download ${file} matches extension source`)
}

for (const path of ['/', '/zh-cn/', '/privacy/']) {
  const html = await readFile(`dist${path}index.html`, 'utf8')
  assert.ok(html.includes('Real-ESRGAN'), `${path} documents Real-ESRGAN`)
  assert.doesNotMatch(html, /never leaves your browser|不离开浏览器|Start AI clarity yourself|手动启动 AI 清晰/, `${path} no obsolete AI promise`)
}

const sitemap = await readFile('dist/sitemap.xml', 'utf8')
for (const path of Object.keys(pages)) assert.ok(sitemap.includes(`<loc>${site}${path}</loc>`), `sitemap ${path}`)
assert.ok((await readFile('dist/robots.txt', 'utf8')).includes(`Sitemap: ${site}/sitemap.xml`), 'robots sitemap')
assert.ok(existsSync('dist/og-image.jpg'), 'og image')

console.log(`SEO checks passed for ${Object.keys(pages).length} pages`)
