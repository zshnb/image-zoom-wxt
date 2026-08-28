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
  const h2Count = (html.match(/<h2(?:\s|>)/g) ?? []).length
  const nativeEnglish = html.includes('class="nativeContent')
  const title = html.match(/<title>(.*?)<\/title>/)?.[1] ?? ''
  const description = html.match(/<meta name="description" content="(.*?)">/)?.[1] ?? ''

  assert.equal(h1Count, 1, `${file}: expected one H1`)
  assert.ok(h2Count >= 6, `${file}: expected at least 6 H2 sections, got ${h2Count}`)
  if (!nativeEnglish) assert.ok(h2Count <= 10, `${file}: expected no more than 10 H2 sections, got ${h2Count}`)
  assert.match(html, /application\/ld\+json/, `${file}: missing JSON-LD`)
  assert.doesNotMatch(html, /href="\/en(?:\/|")/, `${file}: contains a legacy /en link`)
  assert.match(html, /class="(?:answerBlock|definition)/, `${file}: missing definition block`)
  assert.match(html, /class="factBar/, `${file}: missing numeric facts block`)
  assert.ok(description.length >= 70 && description.length <= 160, `${file}: meta description must be 70-160 characters, got ${description.length}`)
  if (nativeEnglish) {
    assert.ok(title.length >= 50 && title.length <= 60, `${file}: title must be 50-60 characters, got ${title.length}`)
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

for (const file of englishFiles) {
  const html = await readFile(join(root, file), 'utf8')
  const text = html
    .replace(/<script[\s\S]*?<\/script>/g, ' ')
    .replace(/<style[\s\S]*?<\/style>/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z]+;/gi, ' ')
  const words = text.trim().split(/\s+/).filter(Boolean).length
  assert.ok(words >= 600, `${file}: expected at least 600 English words, got ${words}`)
}

const [home, about, privacy, terms, zhHome, llms] = await Promise.all([
  readFile(join(root, 'index.html'), 'utf8'),
  readFile(join(root, 'about/index.html'), 'utf8'),
  readFile(join(root, 'privacy/index.html'), 'utf8'),
  readFile(join(root, 'terms/index.html'), 'utf8'),
  readFile(join(root, 'zh-cn/index.html'), 'utf8'),
  readFile(join(root, 'llms.txt'), 'utf8'),
])

assert.ok((home.match(new RegExp(definition.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) ?? []).length >= 2, 'English home definition is not consistent in visible copy and JSON-LD')
assert.match(home, /<h1>Zoom Any Web Image<\/h1>/, 'English home headline is incorrect')
assert.match(home, /hreflang="zh-CN" href="https:\/\/imagezoom\.zshnb\.com\/zh-cn\/"/, 'English home is missing its zh-CN hreflang')
assert.match(home, /"@type":"WebSite"/, 'English home is missing WebSite schema')
assert.match(home, /"logo":\{"@type":"ImageObject","url":"https:\/\/imagezoom\.zshnb\.com\/icon128\.png"/, 'Organization logo schema is missing')
assert.match(home, /"email":"a857681664@gmail\.com"/, 'Organization contact email schema is missing')
assert.doesNotMatch(home, /"@type":"TechArticle"/, 'English home should not claim to be a TechArticle')
assert.doesNotMatch(home, /<h2>Key Facts<\/h2>|<table>/, 'English home still contains the key facts table')
assert.doesNotMatch(home, />product page<\/a>/, 'English home contains generic product-page anchor text')
assert.match(home, /<h2>Sharper Details, Processed Locally<\/h2>/, 'English home AI section is incorrect')
assert.match(home, /<details class="sourceDisclosure"><summary>Sources &amp; methodology<\/summary>/, 'English home sources are not collapsed')
assert.doesNotMatch(home, /<details class="sourceDisclosure" open/, 'English home sources must be collapsed by default')
assert.match(home, /Facts on this page are drawn from/, 'English home source text is missing')
assert.match(home, /"dateModified":"2026-08-17"/, 'English home review date is missing from JSON-LD')
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

console.log(`SEO checks passed for ${files.length} HTML files (${englishFiles.length} English).`)
