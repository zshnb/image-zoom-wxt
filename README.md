# Click Image Zoom

Chrome Web Store listing copy for the extension.

## Name

Click Image Zoom – Web Image Viewer

## Short Description

Image zoom extension for web pages. Hold a key and click a webpage image to zoom up to 10x, pan, or use optional local 4x AI.

## Detailed Description

Click Image Zoom helps you inspect a web image without leaving the page. Hold your chosen key and click an image to open an in-page viewer. Use the wheel to zoom up to 10x and drag to inspect details. If you need extra clarity, optionally create a 4x enlarged version with local AI enhancement.

It is built for quick visual checks when a product photo is too small, an article screenshot is hard to read, a diagram needs inspection, or a thumbnail needs a closer look.

Main features:

- Press-and-click activation, so images do not pop up just because your mouse passes over them
- Clean in-page image viewer for photos, product images, diagrams, screenshots, avatars, and thumbnails
- Wheel zoom up to 10x with smooth scaling
- Drag to pan around enlarged images naturally
- Tries a higher-resolution image source when the page exposes one
- Open the original image, copy its link, or save it from the viewer
- Custom trigger key: Shift, Alt, Ctrl, or Command
- Enable or disable the extension per site
- Works on dynamic pages and image buttons
- Optional local 4x AI enhancement; start it manually or configure it to run when the viewer opens or on the first zoom
- Two AI processing preferences: Faster for everyday use or Better quality when you can wait longer
- Automatic fallback to quick sharpening when AI enhancement is unavailable, so the viewer remains usable

Click Image Zoom is free to use, with no account required and no automatic hover previews. The extension does not send image pixels to a cloud service for AI enhancement; processing stays local to your device.

AI upscaling enhances perceived detail, but it cannot recover information missing from the original image. Processing time depends on image size and device performance. Some images or sites may not work with the viewer; when AI enhancement is unavailable, the normal viewer remains usable.

Use it when you want to inspect an image quickly without changing your browsing flow.

## 中文名称

Click Image Zoom｜浏览器图片放大插件

## 中文简短描述

浏览器图片放大插件：按住快捷键点击网页图片，在原页面打开查看器，滚轮放大至 10 倍并拖动查看；可选本地 4 倍 AI 增强。

## 中文详细描述

Click Image Zoom 帮你在当前网页查看单张图片。按住设置好的快捷键点击图片，即可打开原页面内的查看器；用滚轮放大至 10 倍，再拖动检查局部细节。需要时，还可以选择在本地进行 4 倍 AI 增强。

它适合快速检查商品图、文章截图、图表、头像、缩略图和图片搜索结果：图片太小、文字或细节看不清时，不需要新开标签页，也不需要先下载文件。

主要功能：

- 按住快捷键再点击图片才触发，避免鼠标经过图片时自动弹窗
- 在当前页面放大查看商品图、文章配图、截图、缩略图、头像和图表
- 支持滚轮缩放，最高可放大到 10 倍
- 放大后可拖动图片查看局部细节
- 当网页提供更高清图片来源时，优先尝试使用更高清版本
- 可直接打开原图、复制图片链接或下载图片
- 可自定义触发按键：Shift、Alt、Ctrl 或 Command
- 可按站点启用或禁用
- 支持动态加载的网页图片和按钮内图片
- 可选本地 4 倍 AI 增强：手动启动，或设为打开查看器时、首次放大时自动启动
- 两种 AI 处理偏好：速度优先，或画质优先
- AI 不可用时自动使用快速清晰，查看器仍然可以正常使用

Click Image Zoom 免费使用，无需账号，也不会在鼠标悬停时自动弹窗。扩展不会为了 AI 增强把图片像素发送到云端；处理在本地设备完成。

AI 增强可以改善视觉细节，但无法恢复原图中不存在的信息。处理时间取决于图片尺寸和设备性能；部分网页或图片可能无法使用查看器，AI 增强不可用时仍可正常查看图片。

适合在商品图片太小、文章截图看不清、图表需要检查、社交媒体缩略图或图片搜索结果需要放大时使用。

## Enhancement diagnostics

Open the inspected page's DevTools console and filter for:

```text
[ImageZoom][enhancement]
```

Structured events include the overlay session and request IDs, runtime/model load time,
selected model and backend, per-tile inference time, total upscale time, cache hits, cancellation,
fallback reasons, and cleanup.

# Local Real-ESRGAN CLI

The extension automatically tries an installed
`realesrgan-ncnn-vulkan` command before its browser-based AI upscaler.
If the native host is unavailable or fails, the normal browser fallback
continues to work.

1. Build and load the unpacked extension, then copy its ID from
   `chrome://extensions`.
2. Install the native host:

```bash
chmod +x native-host/install.sh
./native-host/install.sh EXTENSION_ID /absolute/path/to/realesrgan-ncnn-vulkan
```

The installer detects a sibling `models/` directory like the bundled
`realesrgan-upscale` Skill. Pass the model directory as a third argument
for other layouts.

Restart Chrome after installation. Re-run the installer if the unpacked
extension ID or CLI path changes.
