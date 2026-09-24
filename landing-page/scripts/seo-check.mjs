import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'

const definition = 'Click Image Zoom is a Chrome extension that lets you open webpage images in an in-page viewer, zoom up to 10x, and apply optional local 4x AI enhancement without uploading image pixels to a cloud AI service.'
const root = 'dist/assets'
const files = (await readdir(root, { recursive: true })).filter(file => file.endsWith('.html'))

assert.ok(files.length >= 18, `expected at least 18 pre-rendered HTML files, got ${files.length}`)

for (const file of files) {
  const html = await readFile(join(root, file), 'utf8')
  const h1Count = (html.match(/<h1(?:\s|>)/g) ?? []).length
  const nativeEnglish = html.includes('class="nativeContent')
  const title = html.match(/<title>(.*?)<\/title>/)?.[1] ?? ''
  const description = html.match(/<meta name="description" content="(.*?)">/)?.[1] ?? ''

  assert.equal(h1Count, 1, `${file}: expected one H1`)
  assert.match(html, /application\/ld\+json/, `${file}: missing JSON-LD`)
  assert.doesNotMatch(html, /Suggested Internal Links|for this draft/i, `${file}: contains editorial copy`)
  assert.doesNotMatch(html, /href="\/en(?:\/|")/, `${file}: contains a legacy /en link`)
  assert.match(html, /class="(?:answerBlock|definition)/, `${file}: missing definition block`)
  assert.match(html, /class="factBar/, `${file}: missing numeric facts block`)
  assert.ok(description.trim(), `${file}: missing meta description`)
  if (nativeEnglish) {
    assert.ok(title.trim(), `${file}: missing title`)
    if (file !== 'index.html') assert.match(html, /<table>/, `${file}: missing extractable facts table`)
    assert.match(html, /Frequently Asked Questions|Frequently asked questions|>FAQs</, `${file}: missing visible FAQ section`)
    assert.match(html, /Sources and Scope|Sources and scope|Sources &amp; methodology/, `${file}: missing sources section`)
  } else {
    assert.match(html, /class="comparison/, `${file}: missing comparison block`)
    assert.match(html, /class="(?:howTo|workflow)/, `${file}: missing steps block`)
    assert.match(html, /class="faq/, `${file}: missing FAQ block`)
  }
}

const englishFiles = files.filter(file => !file.startsWith('zh-cn/'))
assert.ok(englishFiles.length >= 8, `expected at least 8 native English pages, got ${englishFiles.length}`)

const [home, about, privacy, terms, zhHome, llms] = await Promise.all([
  readFile(join(root, 'index.html'), 'utf8'),
  readFile(join(root, 'about/index.html'), 'utf8'),
  readFile(join(root, 'privacy/index.html'), 'utf8'),
  readFile(join(root, 'terms/index.html'), 'utf8'),
  readFile(join(root, 'zh-cn/index.html'), 'utf8'),
  readFile(join(root, 'llms.txt'), 'utf8'),
])

assert.ok((home.match(new RegExp(definition.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) ?? []).length >= 2, 'English home definition is not consistent in visible copy and JSON-LD')
assert.match(home, /<h1>Image Zoom Extension for Chrome<\/h1>/, 'English home must identify the Chrome extension category')
assert.match(home, /<title>Image Zoom Extension for Chrome \| Click Image Zoom<\/title>/, 'English home title must match its category intent')
assert.match(home, /src="\/clickzoom-screenshot-viewer-1280x800\.webp"[^>]*alt="Click Image Zoom viewer/, 'English home must show the viewer first')
assert.match(home, /hreflang="zh-CN" href="https:\/\/imagezoom\.zshnb\.com\/zh-cn\/"/, 'English home is missing its zh-CN hreflang')
assert.match(home, /"@type":"WebSite"/, 'English home is missing WebSite schema')
assert.match(home, /"logo":\{"@type":"ImageObject","url":"https:\/\/imagezoom\.zshnb\.com\/icon128\.png"/, 'Organization logo schema is missing')
assert.match(home, /"email":"a857681664@gmail\.com"/, 'Organization contact email schema is missing')
assert.doesNotMatch(home, /"@type":"TechArticle"/, 'English home should not claim to be a TechArticle')
assert.doesNotMatch(home, /<h2>Key Facts<\/h2>|<table>/, 'English home still contains the key facts table')
assert.doesNotMatch(home, />product page<\/a>/, 'English home contains generic product-page anchor text')
assert.match(home, /<h2>Optional 4x AI Enhancement, Processed Locally<\/h2>/, 'English home AI must be a secondary feature')
assert.match(home, /<details class="sourceDisclosure"><summary>Sources &amp; methodology<\/summary>/, 'English home sources are not collapsed')
assert.doesNotMatch(home, /<details class="sourceDisclosure" open/, 'English home sources must be collapsed by default')
assert.match(home, /Facts on this page are drawn from/, 'English home source text is missing')
assert.match(home, /"dateModified":"2026-09-24"/, 'English home review date is missing from JSON-LD')
assert.match(home, /href="\/zoom-images-on-web-pages\/"/, 'English home must link to the single-image zoom tutorial')
for (const path of ['/pricing/', '/compare-hover-zoom/', '/faq/', '/use-cases/ecommerce-product-images/', '/use-cases/image-search/', '/use-cases/charts-and-screenshots/']) {
  assert.ok(home.includes(`href="${path}"`), `English home is missing its ${path} discovery link`)
}
assert.ok(about.includes(definition), 'About page definition is inconsistent')
for (const [name, html] of [['home', home], ['Chinese home', zhHome]]) {
  assert.match(html, /href="\/about\/"/, `${name}: footer is missing About`)
  assert.match(html, /href="\/privacy\/"/, `${name}: footer is missing Privacy`)
  assert.match(html, /href="\/terms\/"/, `${name}: footer is missing Terms`)
  assert.match(html, /href="mailto:a857681664@gmail\.com"/, `${name}: footer is missing Contact`)
}
assert.match(privacy, /<h1>Privacy Policy<\/h1>/, 'Privacy Policy page is missing')
assert.match(privacy, /nativeMessaging/, 'Privacy Policy does not disclose Native Messaging')
assert.match(terms, /<h1>Terms of Service<\/h1>/, 'Terms of Service page is missing')
assert.ok(llms.includes(definition), 'llms.txt definition is inconsistent')

const pricing = await readFile(join(root, 'pricing/index.html'), 'utf8')
assert.match(pricing, /<h1>Click Image Zoom Is Free, Including Local AI Enhancement<\/h1>/, 'pricing must answer the cost question directly')
assert.match(pricing, /No account or subscription is required/, 'pricing must explain free access')
for (const path of ['product', 'faq', 'zoom-images-on-web-pages', 'local-ai-image-upscaler']) {
  const html = await readFile(join(root, path, 'index.html'), 'utf8')
  assert.match(html, /both manual and automatic triggering/, `${path}: missing configurable AI trigger modes`)
  assert.doesNotMatch(html, /does not run automatically|optional and triggered manually/, `${path}: contains manual-only AI claims`)
}
assert.match(zhHome, /支持手动触发，或配置打开图片、首次放大时自动触发/, 'Chinese home must explain both trigger modes')
assert.match(zhHome, /查看器和本地 AI 增强均免费/, 'Chinese home must explain free access')
assert.match(zhHome, /<h1>Chrome 浏览器图片放大插件<\/h1>/, 'Chinese home must identify the Chrome image zoom extension category')
assert.match(zhHome, /src="\/clickzoom-screenshot-viewer-1280x800\.webp"[^>]*alt="Click Image Zoom 在 Chrome 网页内打开单张图片查看器/, 'Chinese home must show the viewer first')
assert.match(zhHome, /href="\/zh-cn\/zoom-images-on-web-pages\/"/, 'Chinese home must link to the single-image zoom tutorial')

console.log(`SEO checks passed for ${files.length} HTML files (${englishFiles.length} English).`)
