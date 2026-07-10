# Click Image Zoom

Chrome Web Store listing copy for the extension.

## Name

Click Image Zoom

## Short Description

Hold a shortcut and click any web image to inspect it in place with wheel zoom, drag-to-pan, and local clarity mode.

## Detailed Description

Click Image Zoom helps you inspect web images without hover popups, new tabs, or uploads. Hold your chosen shortcut, click an image, and open a clean viewer right on the current page.

It is built for quick visual checks when a product photo is too small, an article screenshot is hard to read, or a thumbnail needs a closer look.

Main features:

- Press-and-click activation, so images do not pop up just because your mouse passes over them
- Clean in-page viewer for photos, product images, diagrams, screenshots, and thumbnails
- Wheel zoom up to 10x with smooth scaling
- Drag to pan around enlarged images naturally
- Open the original image, copy its link, or save it from the viewer
- Local clarity modes: strength-adjustable AI enhancement with Real-ESRGAN, sharp Lanczos scaling, or off
- Custom trigger key: Shift, Alt, Ctrl, or Command
- Enable or disable the extension per site
- Works on dynamic pages and image buttons

Click Image Zoom is intentionally simple: no automatic hover previews, no account required, and no remote image processing. Images stay in your browser and are not uploaded for clarity mode.

Use it when you want to inspect an image quickly without changing your browsing flow.

## 中文名称

点击图片放大器

## 中文简短描述

按住快捷键点击网页图片，在当前页放大查看；支持滚轮缩放、拖拽查看和本地清晰放大。

## 中文详细描述

点击图片放大器可以帮你在不离开当前页面的情况下查看网页图片细节。按住设置好的快捷键，点击图片，即可在当前页面打开一个干净的放大查看器。

它适合快速检查商品图、文章截图、图表、头像和缩略图：图片太小、细节看不清时，不需要新开标签页，也不需要下载文件。

主要功能：

- 按住快捷键再点击图片才触发，避免鼠标经过图片时自动弹窗
- 在当前页面放大查看商品图、文章配图、截图、缩略图和图表
- 支持滚轮缩放，最高可放大到 10 倍
- 放大后可拖动图片查看局部细节
- 可直接打开原图、复制图片链接或下载图片
- 可选择 AI Real-ESRGAN、锐利 Lanczos 或关闭本地清晰算法，并可调节 AI 增强强度
- 可自定义触发按键：Shift、Alt、Ctrl 或 Command
- 可按站点启用或禁用
- 支持动态加载的网页图片和按钮内图片

点击图片放大器刻意保持轻量：不自动悬停预览，不需要账号，也不把图片上传到远程服务处理。清晰模式在浏览器本地运行，图片保留在你的浏览器中。

适合在商品图片太小、文章截图看不清、社交媒体缩略图需要放大时使用。

## Enhancement diagnostics

Open the inspected page's DevTools console and filter for:

```text
[ImageZoom][enhancement]
```

Structured events include the overlay session and request IDs, runtime/model load time,
selected backend, per-tile inference time, total upscale time, cache hits, cancellation,
fallback reasons, and cleanup.
