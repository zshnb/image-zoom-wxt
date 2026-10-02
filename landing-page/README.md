# Click Image Zoom website

Static bilingual landing page for https://imagezoom.zshnb.com. No framework and no dependencies.

```bash
pnpm build    # writes the static site to dist/
pnpm preview  # build, then serve dist/ at http://localhost:4173
pnpm check    # build, then run SEO checks
```

Deploy the contents of `dist/` to any static host. The host should serve `/path/` from `/path/index.html`.

## Pages and local AI

The build generates six pages: `/`, `/zh-cn/`, `/local-ai-image-upscaler/`, `/zh-cn/local-ai-image-upscaler/`, `/privacy/`, and `/terms/`.

The homepages describe the image zoom extension. The bilingual local AI guides explain a separate installation task: macOS/Linux Google Chrome, Python, the Real-ESRGAN NCNN/Vulkan CLI, local `.param`/`.bin` model pairs, and Native Messaging registration. AI automatically tries an installed native helper first, then LiteRT/WebGPU browser AI, then Lanczos sharpening. Images may be fetched from their source website; enhancement stays on the device.

Build from this project checkout: the build copies `../native-host/install.sh` and `../native-host/host.py` to `dist/downloads/native-host/`. The guides link to both files and explain preserving their names, placing them together, granting the installer execution permission, and using the actual extension ID and absolute paths. `pnpm check` verifies the downloads are byte-identical to the source, along with all six pages’ canonical URLs, alternate languages, internal links, sitemap entries, and installation facts.

This is a page implementation for English and Chinese Google organic search, using extension source and rendered-page evidence. “Local Real-ESRGAN setup” is a candidate search intent, without search-volume or ranking data. Local build and browser checks do not establish deployment, indexing, or search performance. After a separately authorized launch, check the two guide URLs’ indexing and relevant query impressions in Search Console before judging outcomes.

## Files

- `content/copy.mjs`: all English and Chinese copy, routes, and media settings
- `content/legal/`: privacy policy and terms of service body HTML
- `scripts/build.mjs`: page templates, JSON-LD, sitemap
- `site/styles.css`, `site/app.js`: styles and the interactive viewer demo
- `public/`: icons, share image, and demo media

## Replacing placeholder media

Current media is cropped from `store-assets/` screenshots. Replace these files in `public/media/` with real product material:

- `ai-before.webp` / `ai-after.webp`: one image before and after real 4x AI clarity, same size and framing
- `demo-street.webp`: second demo image

To add the real screen recording, put the MP4 and a poster image in `public/media/`, then set `media.recording` in `content/copy.mjs`:

```js
recording: { src: '/media/demo.mp4', poster: '/media/demo-poster.webp', duration: 'PT25S', uploadDate: '2026-10-01' },
```

The build then renders a `<video>` and adds `VideoObject` structured data. Update image `width`/`height` in `media` if dimensions change.

## Redirects after launch

The old site had more URLs. If the host supports redirects, 301 these to the new pages:

- `/en/*` → same path without `/en`
- `/about/`, `/product/`, `/product.md`, `/pricing/`, `/faq/`, `/compare-hover-zoom/`, `/zoom-images-on-web-pages/`, `/use-cases/*` → `/`
- `/ai-image-upscaler-chrome-extension/` → `/#ai-upscaler`
- `/zh-cn/zoom-images-on-web-pages/` → `/zh-cn/`
- `/zh-cn/ai-image-upscaler-chrome-extension/` → `/zh-cn/#ai-upscaler`

Keep `/local-ai-image-upscaler/` and `/zh-cn/local-ai-image-upscaler/` as directly served guide pages; remove any old redirects for these two paths when launching this build.
