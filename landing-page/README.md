# Click Image Zoom website

Static bilingual landing page for https://imagezoom.zshnb.com. No framework and no dependencies.

```bash
pnpm build    # writes the static site to dist/
pnpm preview  # build, then serve dist/ at http://localhost:4173
pnpm check    # build, then run SEO checks
```

Deploy the contents of `dist/` to any static host. The host should serve `/path/` from `/path/index.html`.

## Cloudflare Pages

Use the native Git integration to build the complete GitHub repository on each production-branch push. Choose the repository and branch that hold this project, then configure:

- Framework preset: None
- Root directory: `landing-page`
- Build command: `node scripts/build.mjs && node scripts/check.mjs`
- Build output directory: `dist`
- Environment variables for production and previews: `SKIP_DEPENDENCY_INSTALL=true`, `NODE_VERSION=24.18.0`

The checkout must include the sibling `native-host/` directory because the build copies its two installer files into the website. The static site needs no additional packages or GitHub Actions deployment secrets.

`public/404.html` is copied to the output root so Cloudflare serves a real not-found page instead of its default SPA homepage fallback. `public/_redirects` supplies the permanent legacy-URL redirects. After deployment, verify a random missing URL returns HTTP 404, a retired URL returns 301, and both local AI guides return 200 without a redirect.

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

The old site had more URLs. `public/_redirects` implements these Cloudflare Pages 301 mappings:

- `/en/privacy/`, `/en/terms/`, `/en/local-ai-image-upscaler/` → their corresponding current pages without `/en`
- `/en/ai-image-upscaler-chrome-extension/` → `/#ai-upscaler`; other retired `/en/*` pages → `/`
- `/about/`, `/product/`, `/product.md`, `/pricing/`, `/faq/`, `/compare-hover-zoom/`, `/zoom-images-on-web-pages/`, `/use-cases/*` → `/`
- `/ai-image-upscaler-chrome-extension/` → `/#ai-upscaler`
- `/zh-cn/zoom-images-on-web-pages/` → `/zh-cn/`
- `/zh-cn/ai-image-upscaler-chrome-extension/` → `/zh-cn/#ai-upscaler`

Keep `/local-ai-image-upscaler/` and `/zh-cn/local-ai-image-upscaler/` as directly served guide pages; remove any old redirects for these two paths when launching this build.
