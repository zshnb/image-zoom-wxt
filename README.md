# Click Image Zoom

Chrome Web Store listing copy for the extension.

## Name

AI Image Upscaler & Zoom – Click Image Zoom

## Short Description

Local AI image upscaler for web images with shortcut zoom, pan, and 4x enhancement.

## Detailed Description

AI Image Upscaler & Zoom – Click Image Zoom helps you inspect small web images without hover popups, new tabs, or uploads. Hold your chosen shortcut, click an image, and open a clean image viewer right on the current page. Create a clearer 4x version with local AI image upscaling and enhancement, then zoom and pan around it.

It is built for quick visual checks when a product photo is too small, an article screenshot is hard to read, a diagram needs inspection, or a thumbnail needs a closer look.

Main features:

- Local AI image upscaler and image enhancer that creates a clearer 4x enlarged image directly in your browser
- Two AI processing preferences: Faster for everyday use or Better quality when you can wait longer
- Automatic fallback to quick sharpening when AI enhancement is unavailable, so the viewer remains usable
- Press-and-click activation, so images do not pop up just because your mouse passes over them
- Clean in-page image viewer for photos, product images, diagrams, screenshots, avatars, and thumbnails
- Wheel zoom up to 10x with smooth scaling
- Drag to pan around enlarged images naturally
- Tries a higher-resolution image source when the page exposes one
- Open the original image, copy its link, or save it from the viewer
- Custom trigger key: Shift, Alt, Ctrl, or Command
- Enable or disable the extension per site
- Works on dynamic pages and image buttons

Click Image Zoom is intentionally simple: no automatic hover previews, no account required, and no cloud image processing. Image pixels stay in your browser and are not uploaded to an AI server by the extension.

AI upscaling enhances perceived detail, but it cannot recover information that is missing from the original image. Processing time depends on image size and device performance; unsupported cases automatically use quick sharpening.

Use it when you want to inspect an image quickly without changing your browsing flow.

## 中文名称

AI图片高清放大器 - 网页图片缩放

## 中文简短描述

本地 AI 图片高清放大器，支持网页图片快捷缩放、拖动查看和 4 倍增强。

## 中文详细描述

AI图片高清放大器 - 网页图片缩放（点击图片放大器）可以帮你在不离开当前页面的情况下查看网页图片细节。按住设置好的快捷键，点击图片，即可打开网页图片查看器；还可以在浏览器本地进行 AI 图片高清增强，生成 4 倍放大的清晰版本。

它适合快速检查商品图、文章截图、图表、头像、缩略图和图片搜索结果：图片太小、文字或细节看不清时，不需要新开标签页，也不需要先下载文件。

主要功能：

- 本地 AI 图片放大：直接在浏览器中生成 4 倍高清版本
- 两种 AI 处理偏好：速度优先，或画质优先
- AI 不可用时自动使用快速清晰，查看器仍然可以正常使用
- 按住快捷键再点击图片才触发，避免鼠标经过图片时自动弹窗
- 在当前页面放大查看商品图、文章配图、截图、缩略图、头像和图表
- 支持滚轮缩放，最高可放大到 10 倍
- 放大后可拖动图片查看局部细节
- 当网页提供更高清图片来源时，优先尝试使用更高清版本
- 可直接打开原图、复制图片链接或下载图片
- 可自定义触发按键：Shift、Alt、Ctrl 或 Command
- 可按站点启用或禁用
- 支持动态加载的网页图片和按钮内图片

点击图片放大器刻意保持轻量：不自动悬停预览，不需要账号，不使用云端 AI 处理，也不会把图片上传到 AI 服务器。图片像素直接在浏览器本地处理。

AI 高清增强可以改善视觉细节，但无法恢复原图中不存在的信息。处理时间取决于图片尺寸和设备性能；不兼容的情况下会自动使用快速清晰。

适合在商品图片太小、文章截图看不清、图表需要检查、社交媒体缩略图或图片搜索结果需要放大时使用。

## Enhancement diagnostics

Open the inspected page's DevTools console and filter for:

```text
[ImageZoom][enhancement]
```

Structured events include the overlay session and request IDs, runtime/model load time,
selected model and backend, per-tile inference time, total upscale time, cache hits, cancellation,
fallback reasons, and cleanup.
