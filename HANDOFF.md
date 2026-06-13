# HANDOFF

## 目标

在当前 WXT 浏览器扩展中评估并接入网页端超分辨率能力，用于图片放大时获得比 Lanczos3 更清晰的显示效果。

## 当前结论

可以使用 Qualcomm 发布的 `Real-ESRGAN-x4plus.onnx` 在插件内做 Web 端推理，但不能把整张网页图片直接丢进模型一次性处理。这个 ONNX 模型适合以 `128x128` tile 为输入做分块推理，再把每块 `4x` 输出拼回完整高清图。

推荐方案是：

1. 保留当前 Lanczos3 作为即时 fallback。
2. 在 overlay 中增加 AI 高清触发逻辑，可以是按钮，也可以是放大到指定倍率后自动触发。
3. 使用 ONNX Runtime Web 的 WebGPU execution provider 加载模型。
4. 将图片切成 `128x128` tile，推理后得到 `512x512` tile。
5. 使用 overlap + blending 拼接，避免 tile 接缝。
6. 推理完成后将 overlay 图片替换成生成的高清 blob/object URL。

## 模型信息

模型地址：

https://huggingface.co/qualcomm/Real-ESRGAN-x4plus/blob/01179a4da7bf5ac91faca650e6afbf282ac93933/Real-ESRGAN-x4plus.onnx

已知信息：

- 文件大小约 `67.1 MB`
- float 模型大小约 `63.9 MB`
- 参数量约 `16.7M`
- 输入分辨率：`128x128`
- 放大倍率：`4x`
- 目标运行时：ONNX Runtime
- 该模型页标注为 Qualcomm 设备优化版本，但 ONNX 格式可用于浏览器端 ONNX Runtime Web 尝试推理

## 为什么不能直接整图推理

原因有三个：

1. 模型导出输入是固定 `128x128`，网页图片尺寸不可控。
2. 整图推理会导致显存和内存压力不可控，尤其是长图、大图、高 DPR 屏幕。
3. MV3 扩展环境中，长时间同步推理容易卡住页面或被 service worker 生命周期影响。

所以必须做 tile pipeline。

## 推荐架构

```text
content.ts
  - 管理 overlay UI
  - 显示 Lanczos3 即时结果
  - 触发 AI 高清请求
  - 接收高清结果并替换 overlay 图片

background.ts
  - 获取原图数据
  - 处理跨域图片请求
  - 与推理模块通信

ai-upscale worker/offscreen document
  - 加载 ONNX Runtime WebGPU
  - 加载 Real-ESRGAN ONNX 模型
  - 图片预处理：ImageData -> NCHW float tensor
  - tile 推理
  - overlap blending
  - 输出 PNG/WebP blob
```

## 关键技术点

### ONNX Runtime WebGPU

使用 `onnxruntime-web/webgpu`，session 创建时显式指定：

```ts
executionProviders: ['webgpu']
```

需要检测：

```ts
if (!navigator.gpu) {
  // fallback to Lanczos3
}
```

WASM 可以作为理论 fallback，但 Real-ESRGAN 这类模型在 WASM 上大概率太慢，不建议作为默认路径。

### 模型存储

有三种方式：

1. 打包进扩展：离线稳定，但包体增加约 67 MB。
2. 首次运行下载到 Cache Storage / IndexedDB：包体小，但要做下载状态、校验和缓存失效。
3. 每次远程拉取：不建议，冷启动慢且依赖网络。

建议第一版先打包或放到扩展资源里验证功能，后续再优化成首次下载缓存。

### 图片读取和跨域

AI 推理需要读取像素。content script 直接 canvas 读取跨域图片可能失败。更稳的做法：

1. content script 把图片 URL 发给 background。
2. background 用 `fetch` 获取图片。
3. manifest 增加必要的 `host_permissions`。
4. background 将 blob / ArrayBuffer 发给推理模块。

### Tile 策略

基础策略：

- 输入 tile：`128x128`
- 输出 tile：`512x512`
- stride：建议小于 128，例如 `96` 或 `112`
- 边缘：padding 到 128，再在输出端裁剪
- 拼接：使用加权 blending，避免接缝

不要直接无重叠拼图，否则很容易出现 tile 边界。

## 实现顺序

1. 新增最小 `ai-upscale` 模块，只验证本地 `128x128` 测试图可以跑通 ONNX。
2. 接入 WebGPU feature detection 和模型加载状态。
3. 实现 ImageData 到 ONNX tensor 的预处理，以及输出 tensor 到 ImageData 的后处理。
4. 实现 tile + stitch。
5. 接入 content overlay：增加 AI 高清状态和结果替换。
6. 加入失败 fallback：WebGPU 不可用、模型加载失败、跨域读取失败、推理失败时继续使用 Lanczos3。
7. 最后再考虑模型缓存、队列取消、进度显示和尺寸上限。

## 风险和限制

- WebGPU 不是所有浏览器都可用。
- 首次加载 67 MB 模型会有明显等待时间。
- 大图分块推理会消耗大量 GPU/CPU/内存，需要设置最大输入尺寸。
- AI 超分会生成合理细节，但不保证还原真实原图。
- 人脸、文字、UI 截图可能出现错误细节，需要允许用户回退到原图/Lanczos3。
- MV3 service worker 不适合承载长时间推理，建议使用 worker 或 offscreen document。

## 推荐产品行为

第一版不要自动对所有图片运行 AI。建议：

- 默认仍然即时显示 Lanczos3。
- overlay 中提供一个明确的 `AI HD` 按钮。
- 用户点击后显示处理中状态。
- 处理完成后无闪烁替换高清图。
- 保留失败提示，但不中断当前查看体验。

## 最终判断

这个方向可以做，并且比 Python 本地服务更符合“插件内 web 端直接推理”的目标。但工程复杂度明显高于当前 Lanczos3 实现。建议按最小闭环推进：先跑通单 tile ONNX，再做 tile 拼接，最后接 overlay UI。

## 竞品与定位策略

### 市场格局

同类 Chrome 插件已经有成熟产品，头部产品多走“自动悬停 + 找高清原图 + 下载/旋转/图库/快捷键”的重功能路线。

主要竞品：

- Hover Zoom+：老牌悬停放大插件，用户量和品牌认知强，定位是悬停自动放大图片/视频。
- PhotoShow：功能完整，强调悬停查看高清图，支持大量常用网站，并提供下载、复制、旋转、视图模式和丰富设置。
- Imagus Reborn：面向高级用户，靠站点规则和 sieve 解析缩略图背后的高清图或媒体，但配置和理解成本较高。
- Image Max URL：规则库和原图发现能力很强，适合找大图、下载和批量处理，但产品复杂度远高于当前项目。
- Image Zoom：更接近轻量 lightbox，使用右键打开缩放视图，支持滚轮缩放、拖拽和旋转。
- Image Zoom Viewer：Chrome Web Store 已有同名插件，当前规模很小，但存在命名和搜索识别冲突。它主打“按键 + 悬停”的预览窗，并包含下载、复制链接和功能数据采集说明。

### 我们的优势

当前项目更适合走窄定位：低打扰、手动触发、本地清晰放大、隐私友好。

可主打的优势：

- 手动触发更低打扰：按住快捷键并点击图片才打开 overlay，不会像悬停插件一样在图片密集页面误弹。
- 当前页查看流程更干净：不打开新标签页、不下载文件，适合快速检查商品图、文章截图、图表和缩略图。
- 本地 Lanczos 清晰放大是可讲的技术卖点：小图在允许读取像素时可以本地重采样，不依赖上传服务。
- 隐私叙事更直接：当前 manifest 只有 `storage` 和必要的 `downloads` 权限，图片处理在浏览器本地完成，不上传、不需要账号。
- 产品复杂度低：相比 PhotoShow、Imagus、Image Max URL，不需要用户理解站点规则、图库、批量下载或大量选项。

### 竞争点

不要第一阶段和头部竞品拼“全能”。更合理的竞争表达：

- 英文：`Press, Click, Zoom. No hover popups. No uploads.`
- 中文：`按住点击才放大，不误触，不上传，本地清晰查看。`

目标用户：

- 讨厌悬停自动弹窗的用户。
- 经常检查商品图、截图、图表、头像、缩略图的人。
- 不想安装重型图片下载/图库插件，只想快速看清当前图片的人。
- 对隐私和权限敏感的用户。

### 当前劣势

- 功能面仍少于头部竞品：overlay 已补齐下载、复制图片链接和打开原图，但仍缺少旋转、图库、键盘导航等常见能力。
- 高清原图发现能力弱：当前主要使用 `img.src`，没有解析 `srcset`、`picture`、懒加载字段、站点规则或 API。
- 图片覆盖范围还窄：当前扫描以 `img` 为主，CSS background image、SVG、canvas、video poster、复杂 lazy image 可能不如竞品。
- 命名存在风险：Chrome Web Store 已有同名 `Image Zoom Viewer`，建议上架前考虑更有差异的名称。

### 建议优先级

第一阶段优先补齐轻量查看器的基础体验(已完成)：

1. Esc 关闭 overlay。
2. 下载图片。
3. 复制图片链接。
4. 打开原图 / 新标签页。
5. 当前站点禁用开关 UI。
6. 支持 `srcset` / `picture` / 常见 `data-src` 懒加载字段。
7. 支持 CSS background image。

第二阶段再增强差异化：

1. 保留 Lanczos3 即时放大作为默认体验。
2. 在 overlay 中加入明确的 `AI HD` 按钮，而不是默认自动运行 AI。
3. AI 超分失败时继续使用原图或 Lanczos3，不中断查看体验。
4. 控制模型体积、推理尺寸和处理时长，避免把轻量产品做重。

暂不建议第一阶段投入：

- 大规模站点规则库。
- 视频预览。
- 图库和批量下载。
- 复杂快捷键系统。

这些能力会把产品拖进 Imagus / PhotoShow / Image Max URL 的复杂战场，不符合当前项目“轻量、低打扰、隐私友好”的最佳机会。
