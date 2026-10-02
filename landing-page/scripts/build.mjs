import { createHash } from 'node:crypto'
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { contactEmail, home, legal, media, nativeRoutes, nativeSetup, routes, siteUrl, storeUrl, ui, updated } from '../content/copy.mjs'

const out = 'dist'
const ogImage = `${siteUrl}/og-image.jpg`

const icons = {
  bag: '<path d="M6 7h12l1 13H5L6 7Z"/><path d="M9 7a3 3 0 0 1 6 0"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  monitor: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>',
  chart: '<path d="M4 20V4M4 20h16"/><path d="M8 16v-5M12 16V8M16 16v-3"/>',
  grid: '<rect x="4" y="4" width="7" height="7" rx="1"/><rect x="13" y="4" width="7" height="7" rx="1"/><rect x="4" y="13" width="7" height="7" rx="1"/><rect x="13" y="13" width="7" height="7" rx="1"/>',
  news: '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/>',
  layers: '<path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m3 13 9 5 9-5"/>',
  external: '<path d="M14 4h6v6M20 4l-9 9"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
  keyboard: '<rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10"/>',
  toggle: '<rect x="2" y="7" width="20" height="10" rx="5"/><circle cx="17" cy="12" r="3"/>',
  refresh: '<path d="M20 11a8 8 0 0 0-14.9-3M4 4v4h4"/><path d="M4 13a8 8 0 0 0 14.9 3M20 20v-4h-4"/>',
  gauge: '<path d="m12 14 4-4"/><path d="M3.3 17a9 9 0 1 1 17.4 0"/>',
  maximize: '<path d="M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5"/>',
  shield: '<path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6l-8-3Z"/><path d="m9 12 2 2 4-4"/>',
  cpu: '<rect x="6" y="6" width="12" height="12" rx="2"/><path d="M10 10h4v4h-4zM9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  eyeOff: '<path d="m3 3 18 18"/><path d="M10.6 5.1A10 10 0 0 1 12 5c5 0 9 4.5 10 7a13 13 0 0 1-3 4.2M6.6 6.6A13 13 0 0 0 2 12c1 2.5 5 7 10 7a9.8 9.8 0 0 0 5.4-1.6"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
  lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 16-5-5-9 9"/>',
  check: '<path d="m5 12 5 5 9-10"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  open: '<path d="M14 4h6v6M20 4l-9 9"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
  save: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  play: '<path d="M8 5v14l11-7L8 5Z"/>',
  sparkle: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Z"/>',
  wheel: '<rect x="7" y="3" width="10" height="18" rx="5"/><path d="M12 7v3"/>',
  move: '<path d="M12 3v18M3 12h18M9 6l3-3 3 3M9 18l3 3 3-3M6 9l-3 3 3 3M18 9l3 3-3 3"/>',
  chrome: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3.5"/><path d="M12 8.5h8.2M9 13.8 4.9 6.6M15 13.8 10.9 21"/>',
}

const esc = (value) => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')
const text = (html) => html.replace(/<[^>]+>/g, '')
const icon = (name, className = 'icon') => `<svg class="${className}" viewBox="0 0 24 24" aria-hidden="true">${icons[name]}</svg>`
const pad = (index) => String(index + 1).padStart(2, '0')

function img(key, alt, { eager = false, className = '' } = {}) {
  const { src, width, height } = media[key]
  const loading = eager ? 'fetchpriority="high"' : 'loading="lazy" decoding="async"'
  return `<img${className ? ` class="${className}"` : ''} src="${src}" width="${width}" height="${height}" alt="${esc(alt)}" ${loading}>`
}

function storeHref(lang, placement) {
  return `${storeUrl}?hl=${ui[lang].storeLang}&utm_source=imagezoom.zshnb.com&utm_medium=website&utm_campaign=${placement}`
}

function installButton(lang, placement, { label = ui[lang].installFree, className = 'btn btnPrimary' } = {}) {
  return `<a class="${className}" href="${storeHref(lang, placement)}" target="_blank" rel="noopener">${icon('chrome')}<span>${label}</span></a>`
}

function sectionHead({ eyebrow, h2 }, id) {
  return `${eyebrow ? `<p class="eyebrow">${eyebrow}</p>` : ''}<h2 class="sectionTitle" id="${id}">${h2}</h2>`
}

function compare(lang, className = '') {
  const t = ui[lang]
  return `<div class="compare ${className}" data-compare style="--pos:50%">
          ${img('before', t.compareAltBefore)}
          ${img('after', t.compareAltAfter, { className: 'compareAfter' })}
          <span class="compareTag compareTagBefore">${t.compareBefore}</span>
          <span class="compareTag compareTagAfter">${icon('sparkle')}${t.compareAfter}</span>
          <span class="compareHandle" aria-hidden="true"></span>
          <input type="range" min="0" max="100" value="50" aria-label="${esc(t.compareLabel)}">
        </div>`
}

function browserBar(address) {
  return `<div class="browserBar" aria-hidden="true"><span class="dots"><i></i><i></i><i></i></span><span class="address">${address}</span><img src="/icon128.png" width="18" height="18" alt=""></div>`
}

function demo(lang) {
  const d = ui[lang].demo
  const shot = (key, alt, label, extra = '', eager = false) => `<button type="button" class="demoShot${extra}" data-demo-open data-src="${media[key].src}"${key === 'before' ? ` data-after="${media.after.src}"` : ''} aria-label="${esc(label)}">${img(key, alt, { eager })}</button>`
  return `<div class="demo" data-demo data-busy="${esc(d.busy)}" data-ready="${esc(d.ready)}" data-hint="${esc(d.hintToast)}" data-copied="${esc(d.copied)}" data-copy-failed="${esc(d.copyFailed)}" data-pause="${esc(d.pause)}" data-play="${esc(d.play)}" role="group" aria-label="${esc(d.label)}">
        <div class="browser">
          ${browserBar(d.address)}
          <div class="demoBody">
            <div class="demoPage">
              ${shot('before', d.flowerAlt, d.flowerOpen, ' demoMain', true)}
              <div class="demoInfo">
                <p class="demoKicker">${d.kicker}</p>
                <p class="demoTitle">${d.title}</p>
                <p class="demoPrice">${d.price}</p>
                <span class="demoLine"></span><span class="demoLine demoLineShort"></span>
                <span class="demoCart">${d.cart}</span>
                <p class="demoRelated">${d.related}</p>
                <div class="demoThumbs">${shot('street', d.streetAlt, d.streetOpen)}<span class="demoSkeleton"></span><span class="demoSkeleton"></span></div>
              </div>
            </div>
            <div class="viewer" data-viewer hidden>
              <div class="viewerStage" data-stage><img data-viewer-image alt="" draggable="false"></div>
              <span class="viewerScale" data-scale>1.0x</span>
              <p class="viewerStatus" data-status hidden></p>
              <div class="viewerTools">${d.tools.map(([name, label]) => `<button type="button" data-tool="${name}" aria-label="${esc(label)}" title="${esc(label)}">${icon(name)}</button>`).join('')}</div>
            </div>
            <span class="demoCursor" data-cursor aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M5 3l14 8.5-6.2 1.3L9.6 19 5 3Z"/></svg></span>
            <p class="demoToast" data-toast role="status"></p>
          </div>
        </div>
        <div class="demoFoot">
          <kbd class="demoKey" data-key>⇧ ${d.key}</kbd>
          <p>${d.hint}</p>
          <button type="button" class="demoToggle" data-toggle aria-pressed="false">${d.pause}</button>
        </div>
      </div>`
}

function nav(lang, page, alternates = routes) {
  const t = ui[lang]
  const r = routes[lang]
  const other = lang === 'en' ? 'zh' : 'en'
  const links = t.nav.map(([href, label]) => {
    return `<li><a href="${page === 'home' ? '' : r}${href}">${label}</a></li>`
  }).join('')
  return `<header class="nav">
    <div class="shell navInner">
      <a class="brand" href="${r}"><img src="/icon128.png" width="28" height="28" alt=""><span>Click Image Zoom</span></a>
      <nav aria-label="${t.navLabel}"><ul class="navLinks">${links}</ul></nav>
      <div class="navActions">
        <a class="navLang" href="${alternates[other]}" hreflang="${ui[other].htmlLang}" lang="${ui[other].htmlLang}" aria-label="${t.langSwitchLabel}">${t.langSwitch}</a>
        ${installButton(lang, 'nav', { label: t.install, className: 'btn btnPrimary btnSmall' })}
      </div>
    </div>
  </header>`
}

function footer(lang, alternates = routes) {
  const t = ui[lang]
  const r = routes[lang]
  const l = t.footerLinks
  return `<footer class="footer">
    <div class="shell footerGrid">
      <div class="footerBrand">
        <a class="brand" href="${r}"><img src="/icon128.png" width="28" height="28" alt=""><span>Click Image Zoom</span></a>
        <p>${t.footerTagline}</p>
        ${installButton(lang, 'footer', { label: t.install, className: 'btn btnGhost btnSmall' })}
      </div>
      <div><p class="footerHead">${t.footerProduct}</p><ul><li><a href="${r}#how-it-works">${l.how}</a></li><li><a href="${r}#features">${l.features}</a></li><li><a href="${r}#ai-upscaler">${l.ai}</a></li><li><a href="${r}#faq">${l.faq}</a></li></ul></div>
      <div><p class="footerHead">${t.footerResources}</p><ul><li><a href="${nativeRoutes[lang]}">${t.nativeGuide}</a></li><li><a href="${storeHref(lang, 'footer-link')}" target="_blank" rel="noopener">${l.store}</a></li><li><a href="/privacy/">${l.privacy}</a></li><li><a href="/terms/">${l.terms}</a></li></ul></div>
      <div><p class="footerHead">${t.footerLanguage}</p><ul><li><a href="${alternates.en}" hreflang="en" lang="en">English</a></li><li><a href="${alternates.zh}" hreflang="zh-CN" lang="zh-CN">中文</a></li></ul><p class="footerHead">${t.footerContact}</p><ul><li><a href="mailto:${contactEmail}">${contactEmail}</a></li></ul></div>
    </div>
    <div class="shell footerBottom"><p>© 2026 Click Image Zoom</p><p>${t.footerLegal}</p></div>
  </footer>`
}

function faqSection(lang, faq) {
  return `<section class="section" id="faq" aria-labelledby="faq-title">
      <div class="shell faqGrid">
        <div>${sectionHead({ eyebrow: 'FAQ', h2: faq.h2 }, 'faq-title')}</div>
        <div class="faqList">${faq.items.map(([q, a]) => `<details><summary>${q}</summary><p>${a}</p></details>`).join('')}</div>
      </div>
    </section>`
}

function ctaSection(lang, cta, secondary) {
  return `<section class="cta" aria-labelledby="cta-title">
      <div class="shell"><div class="ctaCard">
        <h2 id="cta-title">${cta.h2}</h2>
        <p>${cta.text}</p>
        <div class="actions">${installButton(lang, 'cta')}${secondary}</div>
      </div></div>
    </section>`
}

function privacyGrid(items) {
  return `<div class="cardGrid">${items.map(([name, title, body]) => `<article class="infoCard">${icon(name, 'icon iconBox')}<h3>${title}</h3><p>${body}</p></article>`).join('')}</div>`
}

function pillarVisual(kind, lang) {
  const d = ui[lang].demo
  if (kind === 'keys') return `<div class="pv pvKeys" aria-hidden="true"><kbd>⇧ ${d.key}</kbd><span>+</span><span class="pvClick"><svg viewBox="0 0 24 24"><path d="M5 3l14 8.5-6.2 1.3L9.6 19 5 3Z"/></svg></span></div>`
  if (kind === 'zoom') return `<div class="pv pvZoom" aria-hidden="true" style="--img:url(${media.street.src})"><span class="pvLens"></span><span class="pvScale">10x</span></div>`
  return `<div class="pv pvAi" aria-hidden="true" style="--before:url(${media.before.src});--after:url(${media.after.src})"><span></span><span></span><em>4x</em></div>`
}

function stepVisual(index, lang) {
  const s = home[lang].steps
  const p = s.popup
  if (index === 0) {
    return `<div class="popupMock" aria-hidden="true">
            <p class="popupHead"><img src="/icon128.png" width="20" height="20" alt="">${p.heading}</p>
            <p class="popupLabel">${p.key}</p><p class="popupSelect">${p.keyValue}</p>
            <p class="popupLabel">${p.quality}</p><p class="popupSelect">${p.qualityValue}</p>
            <p class="popupSite"><span><strong>${p.site}</strong>${p.siteValue}</span><span class="popupToggle"></span></p>
          </div>`
  }
  if (index === 1) return `<div class="stageMock stageZoom" aria-hidden="true">${img('before', '')}<span class="stageChip">${icon('wheel')}${s.zoomLabel} · 10x</span></div>`
  if (index === 2) return `<div class="stageMock stagePan" aria-hidden="true" style="--img:url(${media.street.src})"><span class="stageMini"><i></i></span><span class="stageChip">${icon('move')}${s.panLabel}</span></div>`
  return compare(lang, 'compareStep')
}

function homeBody(lang) {
  const c = home[lang]
  const t = ui[lang]
  const r = routes[lang]
  const recording = media.recording
    ? `<video controls preload="metadata" playsinline poster="${media.recording.poster}" width="1280" height="720"><source src="${media.recording.src}" type="video/mp4"></video>`
    : `<div class="recordingPlaceholder" data-placeholder>${icon('play', 'icon playIcon')}<p>${c.recording.placeholder}</p></div>`
  return `
    <section class="hero" aria-labelledby="hero-title">
      <div class="shell heroInner">
        <div class="heroCopy">
          <p class="badge"><span class="badgeDot" aria-hidden="true"></span>${c.hero.badge}</p>
          <h1 id="hero-title">${c.hero.h1}</h1>
          <p class="lead">${c.hero.lead}</p>
          <div class="actions">${installButton(lang, 'hero')}<a class="btn btnGhost" href="#how-it-works">${c.hero.secondary}${icon('arrow')}</a></div>
        </div>
        <div class="heroVisual" id="demo"><div class="heroStage">${demo(lang)}</div></div>
      </div>
    </section>

    <section class="strip" aria-label="${esc(c.strip.label)}">
      <div class="shell"><p class="stripLabel">${c.strip.label}</p><ul class="stripList">${c.strip.items.map(([name, label]) => `<li>${icon(name)}${label}</li>`).join('')}</ul></div>
    </section>

    <section class="section" aria-labelledby="pillars-title">
      <div class="shell">
        ${sectionHead({ h2: c.pillars.h2 }, 'pillars-title')}
        <div class="pillars">${c.pillars.cards.map((card) => `<article class="pillar">${pillarVisual(card.visual, lang)}<h3>${card.title}</h3><p>${card.text}</p>${card.link ? `<a class="textLink" href="${nativeRoutes[lang]}">${card.link}${icon('arrow')}</a>` : ''}</article>`).join('')}</div>
      </div>
    </section>

    <section class="statement" aria-label="${esc(c.statement.by)}">
      <div class="shell statementInner">
        <figure><blockquote><p>${c.statement.quote}</p></blockquote><figcaption>${c.statement.by}</figcaption></figure>
        <ul class="facts">${c.statement.facts.map(([value, label]) => `<li><strong>${value}</strong><span>${label}</span></li>`).join('')}</ul>
      </div>
    </section>

    <section class="section sectionAlt" id="how-it-works" aria-labelledby="steps-title">
      <div class="shell">
        <div class="steps" data-tabs data-autoplay>
          <div class="stepsCopy">
            ${sectionHead(c.steps, 'steps-title')}
            <div class="stepList" role="tablist" aria-label="${esc(c.steps.label)}">${c.steps.items.map((step, i) => `<button type="button" role="tab" class="stepTab" id="step-tab-${i}" aria-controls="step-panel-${i}" aria-selected="${i === 0}"${i ? ' tabindex="-1"' : ''}><span class="stepNum">${pad(i)}</span><span class="stepBody"><strong>${step.title}</strong><span>${step.text}</span></span><span class="stepProgress" aria-hidden="true"></span></button>`).join('')}</div>
          </div>
          <div class="panel panelMagenta stepPanels">${c.steps.items.map((_, i) => `<div role="tabpanel" class="stepPanel" id="step-panel-${i}" aria-labelledby="step-tab-${i}"${i ? ' hidden' : ''}>${stepVisual(i, lang)}</div>`).join('')}</div>
        </div>
      </div>
    </section>

    <section class="section" id="features" aria-labelledby="features-title">
      <div class="shell">
        ${sectionHead(c.features, 'features-title')}
        <div class="featureGrid">${c.features.items.map(([name, title, body]) => `<article class="feature">${icon(name, 'icon iconBox')}<h3>${title}</h3><p>${body}</p></article>`).join('')}</div>
      </div>
    </section>

    <section class="section sectionAlt" id="recording" aria-labelledby="recording-title">
      <div class="shell recordingGrid">
        <div>${sectionHead(c.recording, 'recording-title')}<p class="sectionText">${c.recording.text}</p>${installButton(lang, 'recording')}</div>
        <div class="browser recordingFrame">${browserBar('chrome://newtab')}${recording}</div>
      </div>
    </section>

    <section class="section" id="ai-upscaler" aria-labelledby="ai-title">
      <div class="shell aiGrid">
        <div>
          ${sectionHead(c.ai, 'ai-title')}
          <p class="sectionText">${c.ai.text}</p>
          <ul class="checks">${c.ai.bullets.map((item) => `<li>${icon('check')}${item}</li>`).join('')}</ul>
          <a class="textLink" href="${nativeRoutes[lang]}">${c.ai.setup}${icon('arrow')}</a>
          <p class="note">${c.ai.limit}</p>
        </div>
        <div class="panel panelNeutral">${compare(lang)}</div>
      </div>
    </section>

    <section class="section sectionAlt" id="privacy" aria-labelledby="privacy-title">
      <div class="shell">
        ${sectionHead(c.privacy, 'privacy-title')}
        <p class="sectionText">${c.privacy.text}</p>
        ${privacyGrid(c.privacy.items)}
        <a class="textLink" href="/privacy/">${c.privacy.link}${icon('arrow')}</a>
      </div>
    </section>

    <section class="section" id="use-cases" aria-labelledby="uses-title">
      <div class="shell">
        ${sectionHead(c.uses, 'uses-title')}
        <div class="uses" data-tabs>
          <div class="useTabs" role="tablist" aria-label="${esc(c.uses.label)}">${c.uses.items.map((use, i) => `<button type="button" role="tab" id="use-tab-${i}" aria-controls="use-panel-${i}" aria-selected="${i === 0}"${i ? ' tabindex="-1"' : ''}>${use.tab}</button>`).join('')}</div>
          ${c.uses.items.map((use, i) => `<div role="tabpanel" class="usePanel" id="use-panel-${i}" aria-labelledby="use-tab-${i}"${i ? ' hidden' : ''}>
            <div><h3>${use.title}</h3><p>${use.text}</p><ul class="checks">${use.bullets.map((item) => `<li>${icon('check')}${item}</li>`).join('')}</ul></div>
            <div class="useVisual">${img(use.image, '')}<span class="useLens" aria-hidden="true" style="--img:url(${media[use.image].src})"></span></div>
          </div>`).join('')}
        </div>
      </div>
    </section>

    ${faqSection(lang, c.faq)}
    ${ctaSection(lang, c.cta, `<a class="btn btnGhost" href="#how-it-works">${c.hero.secondary}${icon('arrow')}</a>`)}`
}

function nativeBody(lang) {
  const c = nativeSetup[lang]
  const r = routes[lang]
  return `
    <section class="setupHero" aria-labelledby="setup-title">
      <div class="shell">
        <nav class="crumbs" aria-label="${ui[lang].breadcrumbLabel}"><a href="${r}">${ui[lang].breadcrumbHome}</a><span aria-hidden="true">/</span><span aria-current="page">${ui[lang].nativeGuide}</span></nav>
        <p class="eyebrow">${c.eyebrow}</p>
        <h1 id="setup-title">${c.h1}</h1>
        <p class="sectionText">${c.lead}</p>
        <div class="actions"><a class="btn btnPrimary" href="#setup">${c.setupLink}${icon('arrow')}</a>${installButton(lang, 'native-guide', { className: 'btn btnGhost' })}</div>
      </div>
    </section>

    <section class="section sectionAlt" aria-labelledby="flow-title">
      <div class="shell">
        ${sectionHead(c.flow, 'flow-title')}
        <p class="sectionText">${c.flow.text}</p>
        <ol class="nativeFlow">${c.flow.nodes.map(([title, detail]) => `<li><h3>${title}</h3><p>${detail}</p></li>`).join('')}</ol>
        <p class="sectionText">${c.flow.note}</p>
      </div>
    </section>

    <section class="section" aria-labelledby="requirements-title">
      <div class="shell">
        ${sectionHead(c.requirements, 'requirements-title')}
        <p class="sectionText">${c.requirements.text}</p>
        <div class="nativeRequirements">${c.requirements.items.map(([title, detail]) => `<article><h3>${title}</h3><p>${detail}</p></article>`).join('')}</div>
      </div>
    </section>

    <section class="section sectionAlt" id="setup" aria-labelledby="install-title">
      <div class="shell">
        ${sectionHead(c.install, 'install-title')}
        <p class="sectionText">${c.install.intro}</p>
        <ol class="nativeSteps">${c.install.steps.map((step, i) => `<li><span class="stepNum" aria-hidden="true">${pad(i)}</span><div><h3>${step.title}</h3><div class="prose"><p>${step.body}</p>${step.command ? `<pre class="setupCode" tabindex="0"><code>${esc(step.command)}</code></pre>` : ''}${step.note ? `<p>${step.note}</p>` : ''}</div></div></li>`).join('')}</ol>
      </div>
    </section>

    <section class="section" aria-labelledby="models-title">
      <div class="shell">
        ${sectionHead(c.models, 'models-title')}
        <div class="prose">
          <div class="tableWrap"><table aria-labelledby="models-title"><thead><tr>${c.models.headers.map((heading) => `<th scope="col">${heading}</th>`).join('')}</tr></thead><tbody>${c.models.rows.map((row) => `<tr>${row.map((cell) => `<td>${esc(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
          <p>${c.models.note}</p>
        </div>
      </div>
    </section>

    ${faqSection(lang, c.faq)}
    ${ctaSection(lang, c.cta, `<a class="btn btnGhost" href="${r}">${c.back}${icon('arrow')}</a><a class="textLink" href="#setup">${c.setupLink}${icon('arrow')}</a>`)}`
}

function legalBody(page, html) {
  return `
    <section class="legal">
      <div class="shell legalInner">
        <nav class="crumbs" aria-label="Breadcrumb"><a href="/">Home</a><span aria-hidden="true">/</span><span aria-current="page">${page.h1}</span></nav>
        <h1>${page.h1}</h1>
        <article class="prose">${html}</article>
      </div>
    </section>`
}

function faqSchema(items) {
  return { '@type': 'FAQPage', mainEntity: items.map(([q, a]) => ({ '@type': 'Question', name: text(q), acceptedAnswer: { '@type': 'Answer', text: text(a) } })) }
}

function breadcrumbSchema(lang, name, url) {
  return { '@type': 'BreadcrumbList', itemListElement: [
    { '@type': 'ListItem', position: 1, name: ui[lang].breadcrumbHome, item: `${siteUrl}${routes[lang]}` },
    { '@type': 'ListItem', position: 2, name, item: url },
  ] }
}

const organization = { '@type': 'Organization', '@id': `${siteUrl}/#organization`, name: 'Click Image Zoom', url: `${siteUrl}/`, logo: `${siteUrl}/icon128.png`, email: contactEmail }

function appSchema(lang) {
  return {
    '@type': 'SoftwareApplication',
    '@id': `${siteUrl}/#app`,
    name: 'Click Image Zoom',
    applicationCategory: 'BrowserApplication',
    operatingSystem: 'Google Chrome',
    description: home[lang].description,
    url: `${siteUrl}${routes[lang]}`,
    installUrl: storeUrl,
    image: ogImage,
    featureList: home[lang].features.items.map(([, title]) => title),
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
    publisher: { '@id': `${siteUrl}/#organization` },
  }
}

function webPage(lang, url, title, description) {
  return { '@type': 'WebPage', '@id': `${url}#webpage`, url, name: title, description, inLanguage: ui[lang].htmlLang, isPartOf: { '@id': `${siteUrl}/#website` }, about: { '@id': `${siteUrl}/#app` }, dateModified: updated }
}

function layout({ lang, path, alternates, title, description, schema, body, page }) {
  const t = ui[lang]
  const url = `${siteUrl}${path}`
  const alternateLinks = alternates
    ? [['en', alternates.en], ['zh-CN', alternates.zh], ['x-default', alternates.en]].map(([code, href]) => `<link rel="alternate" hreflang="${code}" href="${siteUrl}${href}">`).join('\n    ')
    : ''
  return `<!doctype html>
<html lang="${t.htmlLang}">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${esc(title)}</title>
    <meta name="description" content="${esc(description)}">
    <meta name="robots" content="index, follow, max-image-preview:large">
    <link rel="canonical" href="${url}">
    ${alternateLinks}
    <meta name="theme-color" content="#fafafa">
    <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png">
    <link rel="apple-touch-icon" href="/icon128.png">
    <meta property="og:type" content="website">
    <meta property="og:site_name" content="Click Image Zoom">
    <meta property="og:title" content="${esc(title)}">
    <meta property="og:description" content="${esc(description)}">
    <meta property="og:url" content="${url}">
    <meta property="og:image" content="${ogImage}">
    <meta property="og:image:width" content="1200">
    <meta property="og:image:height" content="630">
    <meta property="og:locale" content="${t.ogLocale}">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="${esc(title)}">
    <meta name="twitter:description" content="${esc(description)}">
    <meta name="twitter:image" content="${ogImage}">
    <link rel="stylesheet" href="/styles.css?v=${assetVersion.css}">
    <script src="/app.js?v=${assetVersion.js}" defer></script>
    <script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@graph': schema }).replaceAll('<', '\\u003c')}</script>
  </head>
  <body>
    <a class="skip" href="#main">${t.skip}</a>
    ${nav(lang, page, alternates)}
    <main id="main">${body}
    </main>
    ${footer(lang, alternates)}
  </body>
</html>
`
}

async function writePage(path, html) {
  const dir = `${out}${path}`
  await mkdir(dir, { recursive: true })
  await writeFile(`${dir}index.html`, html)
}

const hash = async (file) => createHash('sha256').update(await readFile(file)).digest('hex').slice(0, 10)
const assetVersion = { css: await hash('site/styles.css'), js: await hash('site/app.js') }

await rm('dist', { recursive: true, force: true })
await mkdir(`${out}`, { recursive: true })
await cp('public', out, { recursive: true })
for (const file of ['styles.css', 'app.js', 'robots.txt']) await cp(`site/${file}`, `${out}/${file}`)
await mkdir(`${out}/downloads/native-host`, { recursive: true })
for (const file of ['install.sh', 'host.py']) await cp(`../native-host/${file}`, `${out}/downloads/native-host/${file}`)

const sitemap = []
const website = { '@type': 'WebSite', '@id': `${siteUrl}/#website`, url: `${siteUrl}/`, name: 'Click Image Zoom', inLanguage: ['en', 'zh-CN'], publisher: { '@id': `${siteUrl}/#organization` } }

for (const lang of ['en', 'zh']) {
  const homeUrl = `${siteUrl}${routes[lang]}`
  const homeSchema = [website, organization, appSchema(lang), webPage(lang, homeUrl, home[lang].title, home[lang].description), faqSchema(home[lang].faq.items)]
  if (media.recording) {
    homeSchema.push({ '@type': 'VideoObject', name: home[lang].recording.name, description: home[lang].recording.text, thumbnailUrl: `${siteUrl}${media.recording.poster}`, contentUrl: `${siteUrl}${media.recording.src}`, uploadDate: media.recording.uploadDate, duration: media.recording.duration })
  }
  await writePage(routes[lang], layout({ lang, page: 'home', path: routes[lang], alternates: routes, title: home[lang].title, description: home[lang].description, schema: homeSchema, body: homeBody(lang) }))

}
sitemap.push(routes)

for (const lang of ['en', 'zh']) {
  const c = nativeSetup[lang]
  const path = nativeRoutes[lang]
  const url = `${siteUrl}${path}`
  const schema = [website, organization, webPage(lang, url, c.title, c.description), breadcrumbSchema(lang, text(c.h1), url)]
  await writePage(path, layout({ lang, page: 'native', path, alternates: nativeRoutes, title: c.title, description: c.description, schema, body: nativeBody(lang) }))
}
sitemap.push(nativeRoutes)

for (const page of Object.values(legal)) {
  const url = `${siteUrl}${page.path}`
  const html = await readFile(`content/legal/${page.file}`, 'utf8')
  await writePage(page.path, layout({ lang: 'en', page: 'legal', path: page.path, title: page.title, description: page.description, schema: [website, organization, webPage('en', url, page.title, page.description), breadcrumbSchema('en', page.h1, url)], body: legalBody(page, html) }))
  sitemap.push({ en: page.path })
}

const urls = sitemap.flatMap((entry) => Object.values(entry).map((path) => {
  const alternates = entry.zh
    ? [['en', entry.en], ['zh-CN', entry.zh], ['x-default', entry.en]].map(([code, href]) => `\n    <xhtml:link rel="alternate" hreflang="${code}" href="${siteUrl}${href}"/>`).join('')
    : ''
  return `  <url>\n    <loc>${siteUrl}${path}</loc>\n    <lastmod>${updated}</lastmod>${alternates}\n  </url>`
}))
await writeFile(`${out}/sitemap.xml`, `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${urls.join('\n')}\n</urlset>\n`)
console.log(`Built ${urls.length} pages into ${out}`)
