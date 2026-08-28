import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

const root = 'https://imagezoom.zshnb.com'
const installUrl = 'https://chromewebstore.google.com/detail/ai-image-upscaler-zoom-%E2%80%93/lmlmlkdfgcbickfngnhnmfajmenoeoll?hl=en-US&utm_source=seo_landing'
const logoUrl = `${root}/icon128.png`
const contactEmail = 'a857681664@gmail.com'
const published = '2026-07-29'
const updated = '2026-08-17'
const productDefinition = 'Click Image Zoom is a Chrome extension that lets you open webpage images in an in-page viewer, zoom up to 10x, and apply optional local 4x AI enhancement without uploading image pixels to a cloud AI service.'

const topics = [
  {
    slug: 'ai-image-upscaler-chrome-extension',
    zh: {
      title: 'Chrome AI 图片放大扩展｜本地 4 倍高清增强',
      description: '直接在 Chrome 网页中放大并用本地 AI 增强图片。Click Image Zoom 支持 4 倍高清增强、最高 10 倍滚轮缩放和拖动查看，无需下载、上传图片或注册账号。',
      eyebrow: 'AI IMAGE UPSCALER FOR CHROME',
      heading: '在 Chrome 里直接放大并增强图片',
      intro: '遇到模糊的商品图、截图或缩略图时，不必先保存到电脑，再上传到在线放大工具。按住自定义快捷键点击图片，即可在原网页中打开查看器并按需生成 4 倍高清版本。',
      sections: [
        ['为什么用浏览器扩展放大图片？', '在线放大工具适合上传文件后导出新图片，但浏览网页时会反复打断操作。Click Image Zoom 把查看、缩放和 AI 增强放在当前页面中，省去下载、切换网站和重新上传的步骤，适合连续检查搜索结果、商品图和文章截图；它不提供裁剪、批量导出或专业修图功能。'],
        ['本地 AI 增强如何工作', '扩展使用本地 Real-ESRGAN 处理图片，可选择速度优先或画质优先。AI 不可用时会回退到快速清晰模式，普通缩放和拖动查看仍可继续使用。'],
        ['适合哪些图片', '它适合网页缩略图、商品细节、低清截图、图表、头像和图片搜索结果。对于原图本身已经严重压缩或缺少细节的内容，AI 能改善观感，但不能还原从未存在的真实信息。'],
        ['如何选择速度或画质模式', '连续查看大量缩略图时，可以先用速度优先模式减少等待；检查单张商品细节、截图文字或复杂纹理时，再切换到画质优先。两种模式都在设备本地运行，实际耗时取决于图片尺寸和硬件性能。'],
        ['怎样控制设备资源', '在设置中限制 AI 最大处理尺寸，可以避免超大网页图片占用过多内存和计算资源。遇到高分辨率原图时，通常先使用查看器的普通缩放即可；只有源图细节不足时，才需要生成 4 倍增强版本。'],
      ],
      bullets: ['4 倍本地 AI 高清增强', '最高 10 倍平滑滚轮缩放', '无需下载、上传或创建账号'],
      faq: [
        ['图片会上传到服务器吗？', '不会。图片增强在浏览器和你的设备上完成，不连接云端 AI 服务。'],
        ['必须每张图片都运行 AI 吗？', '不必。你可以先普通放大查看，只在需要时触发 AI 增强。'],
        ['AI 不可用时还能使用吗？', '可以。扩展会回退到快速清晰模式，查看器、缩放和拖动仍可用。'],
      ],
    },
    en: {
      title: 'AI Image Upscaler Chrome Extension | Local 4x Enhancement',
      description: 'Upscale images directly on webpages with a local AI image upscaler for Chrome. Get 4x enhancement, wheel zoom, and pan without downloading or uploading images.',
      eyebrow: 'AI IMAGE UPSCALER FOR CHROME',
      heading: 'Upscale images without leaving the webpage',
      intro: 'When a product photo, screenshot, or thumbnail is too small, you should not have to save it, open another tool, and upload it. Hold your chosen shortcut, click the image, and inspect a locally enhanced 4x version on the same page.',
      sections: [
        ['Why use an image upscaler extension?', 'Web upscalers are useful for individual files, but they interrupt browsing. Click Image Zoom keeps viewing, zooming, panning, and AI enhancement inside the page, which is faster when checking many search results or product images.'],
        ['How local AI enhancement works', 'The extension runs Real-ESRGAN locally with speed-first and quality-first modes. If AI processing is unavailable, it falls back gracefully while the standard viewer, zoom, and pan controls keep working.'],
        ['Images it works well for', 'Use it for web thumbnails, product details, compressed screenshots, charts, avatars, and image search results. AI can improve visible clarity, but it cannot recover factual detail that never existed in the source image.'],
      ],
      bullets: ['Local 4x AI enhancement', 'Smooth wheel zoom up to 10x', 'No download, upload, or account'],
      faq: [
        ['Are images uploaded to a server?', 'No. Image enhancement runs locally in your browser and does not use a cloud AI service.'],
        ['Does every image need AI processing?', 'No. You can use normal zoom first and trigger AI enhancement only when you need it.'],
        ['What happens if AI is unavailable?', 'The extension falls back to a fast clarity mode, while the viewer, zoom, and pan controls remain available.'],
      ],
    },
  },
  {
    slug: 'zoom-images-on-web-pages',
    zh: {
      title: '如何直接放大网页图片｜点击查看、滚轮缩放',
      description: '无需离开当前网页即可放大图片。按住自定义快捷键点击商品图、截图或缩略图，使用滚轮最高缩放至 10 倍、拖动查看，并按需启用本地 4 倍 AI 高清增强。',
      eyebrow: 'ZOOM IMAGES ON WEB PAGES',
      heading: '直接放大网页图片，不再下载后查看',
      intro: '图片搜索、购物网站和文章里的图片经常只显示缩略图。Click Image Zoom 用“按住快捷键 + 点击”的明确操作打开图片，避免悬停弹窗遮挡页面，也减少误触。',
      sections: [
        ['三步查看网页图片', '先在扩展设置中选择 Shift、Alt、Ctrl 或 Command；按住它并点击目标图片；然后使用滚轮缩放、拖动平移，完成后关闭查看器继续浏览。普通缩放足以查看高分辨率原图时不必运行 AI；只有缩略图、压缩截图或小尺寸商品图仍然模糊时，再触发 4 倍增强。AI 可以改善边缘和纹理观感，但不能恢复源图中不存在的事实信息。'],
        ['适合连续检查图片的场景', '比较电商商品细节、查看图片搜索结果、阅读低清图表或检查文章截图时，你可以留在原页面逐张查看，不需要管理一堆临时下载文件。'],
        ['为什么不是悬停放大', '悬停工具启动快，但容易遮挡链接、菜单和图片旁的文字。Click Image Zoom 只在你主动按键点击时打开，更适合需要精确选择和深度缩放的任务。'],
        ['放大后如何看清不同区域', '查看器打开后，滚动鼠标滚轮可以逐步放大或缩小；图片超过视口时，按住并拖动即可移动到边角位置。最高 10 倍是显示缩放上限，最终能看到多少真实细节仍取决于网站提供的原图分辨率。'],
        ['遇到无法打开的图片怎么办', '网页可能使用背景图、画布、跨域资源或阻止扩展访问的特殊组件。先确认该站点已启用扩展并尝试直接点击可见图片；即使本地 AI 无法运行，普通查看、缩放和拖动功能仍会尽量保持可用。'],
      ],
      bullets: ['自定义 Shift、Alt、Ctrl 或 Command', '滚轮缩放与拖动平移', '原网页内打开和关闭查看器'],
      faq: [
        ['可以放大哪些网页图片？', '可点击的商品图、截图、图表、头像、缩略图和图片搜索结果都适合使用。'],
        ['会改变原网页吗？', '不会。扩展只在页面上方打开临时查看器，关闭后继续原来的浏览。'],
        ['为什么需要按住快捷键？', '快捷键让操作保持明确，减少普通点击图片或链接时的误触。'],
      ],
    },
    en: {
      title: 'How to Zoom Images on Web Pages | Click, Wheel Zoom, and Pan',
      description: 'Zoom images directly on any webpage. Hold a shortcut, click an image, use the mouse wheel to zoom, drag to pan, and optionally enhance it with local AI.',
      eyebrow: 'ZOOM IMAGES ON WEB PAGES',
      heading: 'Zoom webpage images without downloading them',
      intro: 'Image search, shopping sites, and articles often show only a thumbnail. Click Image Zoom uses an intentional hold-and-click action, so you can open the exact image you want without hover previews covering links, menus, or nearby text.',
      sections: [
        ['A three-step image zoom workflow', 'Choose Shift, Alt, Ctrl, or Command in the extension settings. Hold the key and click an image. Then use the mouse wheel to zoom and drag to pan before closing the viewer and continuing where you left off.'],
        ['Made for repeated visual checks', 'Compare product details, inspect image search results, read a small chart, or review screenshots without opening new tabs or managing temporary downloads. The viewer stays inside the original page.'],
        ['Why click instead of hover?', 'Hover tools are quick, but they can obscure links, menus, captions, and surrounding context. An explicit shortcut plus click is better when you need precise selection and deeper zoom controls.'],
      ],
      bullets: ['Choose Shift, Alt, Ctrl, or Command', 'Wheel zoom and drag-to-pan controls', 'Open and close inside the original webpage'],
      faq: [
        ['What webpage images can I zoom?', 'It is useful for product photos, screenshots, charts, avatars, thumbnails, and image search results.'],
        ['Does it modify the webpage?', 'No. It opens a temporary viewer over the page, and you return to the same browsing state when it closes.'],
        ['Why is a shortcut key required?', 'The shortcut keeps activation intentional and prevents normal clicks on images or links from triggering the viewer.'],
      ],
    },
  },
  {
    slug: 'local-ai-image-upscaler',
    zh: {
      title: '本地 AI 图片放大器｜图片不上传云端',
      description: '在 Chrome 浏览器和设备本地完成 4 倍 AI 图片放大。无需账号，不向云端 AI 服务上传图片像素，并可限制处理尺寸，适合重视隐私与浏览效率的网页图片查看。',
      eyebrow: 'PRIVATE LOCAL AI UPSCALER',
      heading: '图片留在浏览器里的 AI 放大器',
      intro: '很多在线图片工具需要先上传文件。Click Image Zoom 把增强过程放在你的设备上：网页图片无需经过第三方 AI 服务，查看和处理都在当前浏览器会话中完成。',
      sections: [
        ['本地处理意味着什么', '扩展不要求账号，也不会为了 AI 增强把图片像素发送到云端。对商品后台截图、内部图表或不希望离开设备的图片，这种处理方式减少了不必要的数据传输。'],
        ['隐私与性能的取舍', '本地 AI 会使用设备的计算资源，处理速度取决于图片尺寸和硬件能力。你可以选择速度优先模式，并设置最大 AI 处理尺寸，避免为超大图片消耗过多资源。'],
        ['失败时保持可用', '如果当前浏览器或设备无法运行 AI，扩展不会让整个查看流程失效。它会回退到快速清晰模式，继续提供缩放、平移和网页内查看。AI 放大适合改善阅读和观察体验，但不应被当作恢复证据或生成真实细节的工具；对于票据文字、医学影像、身份信息或其他需要精确判断的内容，应回到原始文件和可靠来源核验。'],
        ['本地处理不等于改变原网站', '扩展只控制额外的增强步骤，不会改变网页原本如何托管、缓存或传输图片。图片仍然来自你正在访问的网站；“本地 AI”具体表示扩展不会为了增强处理，再把图片像素发送给第三方云端 AI 服务。'],
        ['如何平衡清晰度与等待时间', '速度优先模式适合连续浏览多张图片，画质优先模式适合仔细检查单张图片。较大的输入会占用更多内存并延长处理时间，因此可以设置最大处理尺寸；高分辨率原图通常无需额外 AI 处理。'],
      ],
      bullets: ['不上传图片像素', '不连接云端 AI 服务', '可限制本地 AI 最大处理尺寸'],
      faq: [
        ['需要注册账号吗？', '不需要。安装扩展后即可使用核心查看和本地增强功能。'],
        ['本地 AI 会更慢吗？', '速度取决于设备和图片大小。扩展提供速度优先模式，并允许限制最大处理尺寸。'],
        ['网页本身还能访问图片吗？', '扩展无法改变网页原本如何托管图片；本地处理指扩展不会额外把图片发送给云端 AI 服务。'],
      ],
    },
    en: {
      title: 'Private Local AI Image Upscaler | No Image Uploads',
      description: 'Upscale images locally in your browser with no account, no image pixel uploads, and no cloud AI service. A privacy-focused Chrome image viewer and upscaler.',
      eyebrow: 'PRIVATE LOCAL AI UPSCALER',
      heading: 'An AI image upscaler that keeps images in your browser',
      intro: 'Many online image tools begin with an upload. Click Image Zoom keeps enhancement on your device, so webpage images do not need to pass through a third-party AI service before you can inspect them.',
      sections: [
        ['What local processing means', 'The extension does not require an account or send image pixels to a cloud AI service for enhancement. This removes unnecessary transfers when viewing dashboard screenshots, internal charts, product images, or other content you prefer to keep on your device.'],
        ['The privacy and performance tradeoff', 'Local AI uses your device resources, so processing time depends on image size and hardware. Choose the speed-first mode and set a maximum AI processing size when you want to limit resource use.'],
        ['Useful even when AI cannot run', 'If the current browser or device cannot run AI enhancement, the image workflow does not fail. The extension falls back to a fast clarity mode while keeping zoom, pan, and in-page viewing available.'],
      ],
      bullets: ['No image pixel uploads', 'No cloud AI service', 'Control the maximum local AI image size'],
      faq: [
        ['Do I need to create an account?', 'No. Install the extension and use the core viewer and local enhancement workflow without an account.'],
        ['Is local AI slower?', 'Performance depends on your device and the image size. A speed-first mode and maximum processing size help control resource use.'],
        ['Can the webpage itself still access the image?', 'The extension cannot change how the original website hosts its images. Local processing means the extension does not additionally send the image to a cloud AI service.'],
      ],
    },
  },
]

const englishPages = [
  {
    slug: 'about',
    en: {
      title: 'About Click Image Zoom | Product Definition and Scope',
      description: productDefinition,
      eyebrow: 'ABOUT CLICK IMAGE ZOOM',
      heading: 'A focused image viewer for the web',
      intro: productDefinition,
      answer: productDefinition,
      sections: [
        ['What the product does', 'Click Image Zoom opens a selected webpage image above the current page, where the user can zoom, pan, and optionally run local AI enhancement. It is designed for inspection during browsing rather than for creating or editing image files.'],
        ['Who it is for', 'The extension is useful for shoppers comparing product details, researchers reading charts and screenshots, designers checking visual references, and anyone who repeatedly encounters thumbnails that are too small to inspect.'],
        ['What it does not claim', 'AI enhancement can improve visible clarity, but it cannot reconstruct factual detail that was never present. Local processing speed also varies with image dimensions, browser support, and the user’s hardware.'],
      ],
      bullets: ['4x local AI enhancement', '10x maximum viewer zoom', '0 image pixel uploads for enhancement'],
      faq: [
        ['Is Click Image Zoom an online image editor?', 'No. It is an in-page viewer and optional local upscaler for images that already appear on webpages.'],
        ['Who publishes Click Image Zoom?', 'Click Image Zoom is the product and publisher name used by this website and its Chrome Web Store listing.'],
        ['Where can I verify product claims?', 'Use the official website, Chrome Web Store listing, machine-readable facts file, and linked Real-ESRGAN project documentation.'],
      ],
    },
  },
  {
    slug: 'product',
    en: {
      title: 'Click Image Zoom Product | Features, Workflow, and Privacy',
      description: 'Review the Click Image Zoom product workflow, local AI enhancement, viewer controls, privacy model, supported use cases, and practical limitations.',
      eyebrow: 'PRODUCT OVERVIEW',
      heading: 'One extension for viewing and enhancing webpage images',
      intro: 'Click Image Zoom combines deliberate shortcut activation, an in-page image viewer, wheel zoom, drag-to-pan controls, and optional local AI enhancement in one Chrome extension.',
      answer: productDefinition,
      sections: [
        ['Viewer controls', 'Choose Shift, Alt, Ctrl, or Command as the trigger key, hold it, and click a webpage image. The viewer opens over the page and supports smooth wheel zoom up to 10x plus drag-to-pan navigation.'],
        ['Local AI enhancement', 'When additional clarity is useful, the extension can create a local 4x enhanced version with Real-ESRGAN. Users can choose speed-first or quality-first processing and limit the maximum AI image size.'],
        ['Privacy and fallback behavior', 'The extension does not upload image pixels to a cloud AI service for enhancement and does not require an account. If AI cannot run, standard viewing, zoom, pan, and clarity controls remain available.'],
      ],
      bullets: ['4x local AI enhancement', '10x maximum viewer zoom', '0 required accounts'],
      faq: [
        ['Does it work without AI?', 'Yes. The in-page viewer, wheel zoom, pan, and standard clarity mode remain useful without AI enhancement.'],
        ['Can I control resource use?', 'Yes. Select a processing preference and set a maximum image size for local AI enhancement.'],
        ['Does it replace a full image editor?', 'No. It is optimized for inspecting webpage images while preserving the current browsing context.'],
      ],
    },
  },
  {
    slug: 'pricing',
    en: {
      title: 'Click Image Zoom Pricing | Current Access and Requirements',
      description: 'Understand the current Click Image Zoom access model, account requirements, device costs, and what to verify on the official Chrome Web Store listing.',
      eyebrow: 'PRICING AND ACCESS',
      heading: 'Simple access with no account requirement',
      intro: 'Click Image Zoom does not require an account for its core viewer and local enhancement workflow. The Chrome Web Store listing is the authoritative source for current availability and any future pricing changes.',
      answer: 'Click Image Zoom currently requires no product account; installation availability and any price shown on the official Chrome Web Store listing should be treated as the current source of truth.',
      sections: [
        ['Current access model', 'The product documentation describes a no-account workflow: install the extension, choose a trigger key, and use the viewer on supported webpages. No separate cloud AI subscription is required for local enhancement.'],
        ['What local processing costs', 'Local AI uses the user’s own device resources rather than metered cloud inference. Processing time and energy use depend on image size, hardware capability, browser support, and the selected speed or quality mode.'],
        ['How to verify current terms', 'Because store availability and commercial terms can change, check the official Chrome Web Store listing before installation. This page avoids promising a permanent price or plan that is not independently controlled by the website.'],
      ],
      bullets: ['0 required accounts', '0 cloud AI subscriptions', '1 official store listing'],
      faq: [
        ['Do I need an account?', 'No account is required for the documented core viewer and local enhancement workflow.'],
        ['Is cloud AI billed separately?', 'No cloud AI service is required by the documented local enhancement workflow.'],
        ['Where should I confirm the current price?', 'Confirm current availability and any displayed price on the official Chrome Web Store listing.'],
      ],
    },
  },
  {
    slug: 'privacy',
    en: {
      schemaType: 'WebPage',
      eyebrow: 'PRIVACY POLICY',
      title: '',
      description: '',
      heading: '',
      intro: '',
      answer: '',
      sections: [],
      bullets: [],
      faq: [],
    },
  },
  {
    slug: 'terms',
    en: {
      schemaType: 'WebPage',
      eyebrow: 'TERMS OF SERVICE',
      title: '',
      description: '',
      heading: '',
      intro: '',
      answer: '',
      sections: [],
      bullets: [],
      faq: [],
    },
  },
  {
    slug: 'compare-hover-zoom',
    en: {
      title: 'Click Image Zoom vs Hover Zoom Tools | Feature Comparison',
      description: 'Compare deliberate click-to-zoom, hover previews, download-and-upload upscalers, and Click Image Zoom’s local AI image inspection workflow.',
      eyebrow: 'PRODUCT COMPARISON',
      heading: 'Click-to-zoom versus hover previews and upload tools',
      intro: 'The right image tool depends on whether you value instant previews, precise activation, deep zoom controls, local processing, or full image editing. Click Image Zoom prioritizes intentional inspection inside the current page.',
      answer: 'Choose Click Image Zoom when you want deliberate activation, up to 10x viewer zoom, drag-to-pan controls, and optional local 4x enhancement without uploading image pixels to a cloud AI service.',
      sections: [
        ['Compared with hover preview extensions', 'Hover tools can reveal a larger image quickly, but they may cover links, captions, menus, or surrounding context. Click Image Zoom requires a shortcut plus click, which reduces accidental activation and supports deeper inspection.'],
        ['Compared with online AI upscalers', 'Upload-based tools are useful when exporting a new file is the main goal. Click Image Zoom removes the download-upload-return loop when the goal is simply to inspect many images during browsing.'],
        ['Compared with opening images in new tabs', 'A new tab can expose the source image, but repeated tab switching interrupts comparison work. The in-page viewer keeps the original page and browsing position available underneath the image.'],
      ],
      bullets: ['1 deliberate click workflow', '10x viewer zoom', '0 enhancement uploads'],
      faq: [
        ['Is click activation slower than hover?', 'It adds one deliberate action, but it reduces accidental popups and makes precise image selection easier.'],
        ['Can it export edited image files?', 'The product is positioned as a viewer and local enhancer, not as a full export-oriented image editor.'],
        ['When is an online upscaler better?', 'Use an online editor when you need file export, batch processing, or editing features beyond webpage inspection.'],
      ],
    },
  },
  {
    slug: 'faq',
    en: {
      title: 'Click Image Zoom FAQ | Installation, Privacy, AI, and Controls',
      description: 'Answers about Click Image Zoom installation, shortcut activation, wheel zoom, local AI enhancement, privacy, browser support, fallback behavior, and limitations.',
      eyebrow: 'PRODUCT FAQ',
      heading: 'Frequently asked questions about Click Image Zoom',
      intro: 'These answers summarize the documented product workflow and its practical boundaries. Use the official Chrome Web Store listing to confirm current installation availability.',
      answer: productDefinition,
      sections: [
        ['Installation and activation', 'Install from the official Chrome Web Store listing, choose Shift, Alt, Ctrl, or Command as the trigger, then hold that key while clicking a webpage image. The deliberate action helps avoid accidental previews.'],
        ['Zoom, pan, and enhancement', 'Use the mouse wheel to zoom up to 10x and drag to pan. Local 4x AI enhancement is optional, so users can inspect an image normally before deciding whether extra processing is worthwhile.'],
        ['Privacy, performance, and limits', 'Enhancement does not require uploading image pixels to a cloud AI service. Local processing speed depends on the image and device, and AI cannot restore factual detail absent from the source.'],
      ],
      bullets: ['4 trigger key choices', '10x viewer zoom', '0 enhancement uploads'],
      faq: [
        ['Which shortcut keys are supported?', 'The documented choices are Shift, Alt, Ctrl, and Command.'],
        ['Are images sent to a cloud AI service?', 'No. The documented enhancement process runs locally in the browser and on the user’s device.'],
        ['What happens if AI enhancement fails?', 'The viewer, normal zoom, pan, and standard clarity mode remain available.'],
        ['Can AI recover missing text or facts?', 'No. It may improve visible clarity but cannot reconstruct reliable information that never existed in the source.'],
      ],
    },
  },
  {
    slug: 'use-cases/ecommerce-product-images',
    en: {
      title: 'Zoom Ecommerce Product Images | Click Image Zoom Use Case',
      description: 'Inspect product photos, materials, labels, and small ecommerce details without downloading images or leaving the product and comparison pages.',
      eyebrow: 'USE CASE: ECOMMERCE',
      heading: 'Inspect product image details while you shop',
      intro: 'Marketplace galleries often mix large photos with compressed thumbnails. Click Image Zoom keeps the product page visible while you inspect materials, labels, connectors, finishes, and other visual details.',
      answer: 'For ecommerce research, Click Image Zoom opens product images in an in-page viewer, supports zoom up to 10x, and can apply optional local 4x enhancement without an upload workflow.',
      sections: [
        ['Compare details without tab clutter', 'Open images over each product page instead of downloading files or creating a trail of image tabs. Close the viewer and continue from the same product description, review, or comparison position.'],
        ['Use enhancement carefully', 'Local AI can make edges and textures easier to inspect, but it cannot prove material quality or reveal details missing from the seller’s source photo. Treat enhanced images as viewing aids, not new evidence.'],
        ['Protect browsing continuity', 'The shortcut-plus-click trigger avoids hover previews appearing while you move across product cards, menus, and image galleries. This is useful when comparing many listings in one session.'],
      ],
      bullets: ['10x detail inspection', '4x optional enhancement', '0 temporary downloads required'],
      faq: [
        ['Can it reveal hidden product details?', 'No. It can enlarge and enhance visible information but cannot recover facts absent from the original photo.'],
        ['Does it work on thumbnails?', 'It is designed for webpage images including thumbnails, subject to the source image and website behavior.'],
        ['Will it change the product page?', 'No. The viewer is temporary and closes back to the original browsing context.'],
      ],
    },
  },
  {
    slug: 'use-cases/image-search',
    en: {
      title: 'Zoom Image Search Results | Click Image Zoom Use Case',
      description: 'Inspect image-search thumbnails with wheel zoom, drag-to-pan controls, and optional local AI enhancement while keeping the result grid available.',
      eyebrow: 'USE CASE: IMAGE SEARCH',
      heading: 'Review image search results without opening every tab',
      intro: 'Image search is fast until every promising thumbnail requires a new page or tab. Click Image Zoom lets you inspect a selected result above the grid and return immediately to nearby alternatives.',
      answer: 'For image search, Click Image Zoom provides deliberate thumbnail selection, in-page viewing, up to 10x zoom, drag-to-pan controls, and optional local 4x enhancement.',
      sections: [
        ['Keep the result grid as context', 'The overlay viewer preserves the surrounding search results, making it easier to compare style, composition, subject, or legibility without losing the current scroll position.'],
        ['Avoid accidental hover overlays', 'Image grids contain many tightly packed targets. A shortcut plus click makes activation explicit, which helps prevent previews from appearing whenever the pointer crosses an unrelated thumbnail.'],
        ['Know the source limitation', 'The extension can only work with the image data available to the webpage and browser. A tiny or heavily compressed source may remain limited even after zooming or enhancement.'],
      ],
      bullets: ['1 result grid preserved', '10x viewer zoom', '0 new tabs required'],
      faq: [
        ['Does it replace visiting the source page?', 'No. Visit the source page when you need provenance, licensing, full resolution, or surrounding context.'],
        ['Can it enlarge every search result?', 'Compatibility depends on the webpage, browser permissions, and the image source available to the page.'],
        ['Why not use hover preview?', 'Deliberate activation is less disruptive in dense grids and supports deeper zoom and pan controls.'],
      ],
    },
  },
  {
    slug: 'use-cases/charts-and-screenshots',
    en: {
      title: 'Zoom Charts and Screenshots on Webpages | Use Case',
      description: 'Read small labels, interface screenshots, diagrams, and charts with an in-page viewer, wheel zoom, pan, and optional local AI enhancement.',
      eyebrow: 'USE CASE: CHARTS',
      heading: 'Read small charts and screenshots in place',
      intro: 'Articles, documentation, dashboards, and issue trackers often embed screenshots or charts below a comfortable reading size. Click Image Zoom provides a closer view without separating the image from its surrounding explanation.',
      answer: 'For charts and screenshots, Click Image Zoom keeps the source page visible while providing up to 10x zoom, drag-to-pan navigation, and optional local 4x enhancement.',
      sections: [
        ['Preserve the surrounding explanation', 'Open the visual over the current page, inspect labels or interface elements, then close it and continue reading the paragraph, caption, or instructions that explain what the image means.'],
        ['Use AI as a clarity aid', 'Enhancement may make edges and existing text shapes easier to see, but it must not be treated as a reliable reconstruction of unreadable labels, numbers, or interface states.'],
        ['Control local resource use', 'Large screenshots and charts can require more processing time. Choose a speed-first mode or limit the maximum AI processing size when quick inspection matters more than enhancement quality.'],
      ],
      bullets: ['10x label inspection', '4x optional enhancement', '0 context-switching uploads'],
      faq: [
        ['Can it make unreadable chart labels accurate?', 'No. It can improve visible clarity but cannot guarantee text or numbers that are missing from the source.'],
        ['Does it work for long screenshots?', 'The viewer can zoom and pan, while practical performance depends on image dimensions and device resources.'],
        ['Are internal screenshots uploaded?', 'The documented enhancement workflow does not upload image pixels to a cloud AI service.'],
      ],
    },
  },
]

const escapeHtml = value => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')
const inlineMarkdown = value => escapeHtml(value)
  .replace(/`([^`]+)`/g, '<code>$1</code>')
  .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, href) => `<a href="${escapeHtml(href)}">${label}</a>`)
  .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')

function renderMarkdown(lines) {
  const html = []
  let index = 0

  const isBlockStart = (line, next = '') => !line.trim()
    || /^#{2,3} /.test(line)
    || /^(?:- |\d+\. |>|---$)/.test(line)
    || (line.includes('|') && /^\s*\|?[\s:|-]+\|\s*$/.test(next))

  while (index < lines.length) {
    const line = lines[index]
    if (!line.trim() || line.trim() === '---') { index += 1; continue }

    const heading = line.match(/^(#{2,3})\s+(.+)$/)
    if (heading) {
      const level = heading[1].length
      html.push(`<h${level}>${inlineMarkdown(heading[2])}</h${level}>`)
      index += 1
      continue
    }

    if (line.includes('|') && /^\s*\|?[\s:|-]+\|\s*$/.test(lines[index + 1] ?? '')) {
      const rows = []
      const cells = value => value.replace(/^\s*\||\|\s*$/g, '').split('|').map(cell => inlineMarkdown(cell.trim()))
      rows.push(cells(line))
      index += 2
      while (index < lines.length && lines[index].includes('|') && lines[index].trim()) {
        rows.push(cells(lines[index]))
        index += 1
      }
      html.push(`<div class="tableWrap"><table><thead><tr>${rows[0].map(cell => `<th>${cell}</th>`).join('')}</tr></thead><tbody>${rows.slice(1).map(row => `<tr>${row.map(cell => `<td>${cell}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`)
      continue
    }

    const list = line.match(/^(-|\d+\.)\s+(.+)$/)
    if (list) {
      const ordered = list[1] !== '-'
      const items = []
      while (index < lines.length) {
        const item = lines[index].match(ordered ? /^\d+\.\s+(.+)$/ : /^-\s+(.+)$/)
        if (!item) break
        items.push(`<li>${inlineMarkdown(item[1])}</li>`)
        index += 1
      }
      html.push(`<${ordered ? 'ol' : 'ul'}>${items.join('')}</${ordered ? 'ol' : 'ul'}>`)
      continue
    }

    if (line.startsWith('>')) {
      const quote = []
      while (index < lines.length && lines[index].startsWith('>')) {
        quote.push(lines[index].replace(/^>\s?/, ''))
        index += 1
      }
      html.push(`<blockquote>${inlineMarkdown(quote.join(' '))}</blockquote>`)
      continue
    }

    const paragraph = [line.trim()]
    index += 1
    while (index < lines.length && !isBlockStart(lines[index], lines[index + 1])) {
      paragraph.push(lines[index].trim())
      index += 1
    }
    html.push(`<p>${inlineMarkdown(paragraph.join(' '))}</p>`)
  }

  return html.join('\n')
}

function parseDraft(markdown) {
  const match = markdown.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/)
  if (!match) throw new Error('native English draft is missing frontmatter')
  const metadata = Object.fromEntries(match[1].split('\n').map(line => {
    const separator = line.indexOf(':')
    const value = line.slice(separator + 1).trim().replace(/^(["'])(.*)\1$/, '$2')
    return [line.slice(0, separator).trim(), value]
  }))
  const lines = match[2].split('\n')
  const h1Index = lines.findIndex(line => line.startsWith('# '))
  const heading = lines[h1Index].slice(2).trim()
  let introStart = h1Index + 1
  while (!lines[introStart]?.trim()) introStart += 1
  const introLines = []
  while (lines[introStart]?.trim()) {
    introLines.push(lines[introStart].trim())
    introStart += 1
  }
  const faqHeading = lines.findIndex(line => /^## (?:FAQs|Frequently Asked Questions|Frequently asked questions)$/i.test(line))
  const faq = []
  if (faqHeading !== -1) {
    for (let i = faqHeading + 1; i < lines.length && !lines[i].startsWith('## '); i += 1) {
      const question = lines[i].match(/^\*\*(.+\?)\*\*$/)
      if (!question) continue
      let answerIndex = i + 1
      while (!lines[answerIndex]?.trim()) answerIndex += 1
      if (lines[answerIndex] && !lines[answerIndex].startsWith('#')) faq.push([question[1], lines[answerIndex].trim()])
    }
  }
  return {
    title: metadata.title,
    description: metadata.meta_description,
    heading,
    intro: introLines.join(' '),
    answer: introLines.join(' '),
    bodyHtml: renderMarkdown(lines.slice(introStart)),
    faq,
  }
}

const draftFiles = {
  '': 'index.md',
  about: 'about.md',
  product: 'product.md',
  pricing: 'pricing.md',
  privacy: 'privacy.md',
  terms: 'terms.md',
  'compare-hover-zoom': 'compare-hover-zoom.md',
  faq: 'faq.md',
  'zoom-images-on-web-pages': 'zoom-images-on-web-pages.md',
  'local-ai-image-upscaler': 'local-ai-image-upscaler.md',
  'ai-image-upscaler-chrome-extension': 'ai-image-upscaler-chrome-extension.md',
  'use-cases/ecommerce-product-images': 'use-cases/ecommerce-product-images.md',
  'use-cases/image-search': 'use-cases/image-search.md',
  'use-cases/charts-and-screenshots': 'use-cases/charts-and-screenshots.md',
}
const drafts = new Map(await Promise.all(Object.entries(draftFiles).map(async ([slug, file]) => {
  const draft = parseDraft(await readFile(join('content/en-native', file), 'utf8'))
  if (!slug) {
    const heading = '<h2>Sources and Scope</h2>'
    const sourceStart = draft.bodyHtml.indexOf(heading)
    if (sourceStart === -1) throw new Error('homepage sources section is missing')
    // ponytail: homepage sources stay last; use section-aware parsing if content moves below them.
    draft.bodyHtml = `${draft.bodyHtml.slice(0, sourceStart)}<details class="sourceDisclosure"><summary>Sources &amp; methodology</summary><div>${draft.bodyHtml.slice(sourceStart + heading.length)}</div></details>`
  }
  return [slug, draft]
})))
for (const topic of [...topics, ...englishPages]) Object.assign(topic.en, drafts.get(topic.slug))

const pathFor = (slug, lang) => lang === 'en' ? `/${slug ? `${slug}/` : ''}` : `/zh-cn/${slug ? `${slug}/` : ''}`
const answers = {
  'ai-image-upscaler-chrome-extension': {
    zh: 'Click Image Zoom 是一款 Chrome AI 图片放大扩展，可直接在当前网页中打开图片、滚轮缩放至 10 倍，并按需在设备本地生成 4 倍 AI 增强版本。图片像素不会为了增强处理而上传到云端 AI 服务。',
    en: 'Click Image Zoom is a Chrome AI image upscaler that opens images inside the current webpage, supports wheel zoom up to 10x, and optionally creates a local 4x AI-enhanced version. Image pixels are not uploaded to a cloud AI service for enhancement.',
  },
  'zoom-images-on-web-pages': {
    zh: '要直接放大网页图片，请先选择 Shift、Alt、Ctrl 或 Command 作为触发键，然后按住该键点击图片。查看器会在原网页中打开，你可以使用滚轮缩放、拖动平移，并在完成后返回原来的浏览位置。',
    en: 'To zoom an image on a webpage, choose Shift, Alt, Ctrl, or Command as the trigger, hold it, and click the image. The viewer opens over the original page, where you can use the mouse wheel to zoom, drag to pan, and then return to the same browsing position.',
  },
  'local-ai-image-upscaler': {
    zh: '本地 AI 图片放大器在用户自己的浏览器和设备上处理图片，而不是先把图片像素发送到云端 AI 服务。Click Image Zoom 无需账号，并允许限制最大 AI 处理尺寸；AI 不可用时仍可继续普通缩放和拖动查看。',
    en: 'A local AI image upscaler processes images in the user’s browser and on their device instead of sending image pixels to a cloud AI service. Click Image Zoom requires no account, lets users limit AI processing size, and keeps normal zoom and pan available when AI cannot run.',
  },
}

function page(topic, lang) {
  const copy = topic[lang]
  const isEn = lang === 'en'
  const englishOnly = !topic.zh && topic.slug !== ''
  const path = pathFor(topic.slug, lang)
  const related = topics.filter(item => item.slug !== topic.slug)
  const howToSteps = isEn ? [
    ['Choose a trigger key', 'Select Shift, Alt, Ctrl, or Command in the extension settings.'],
    ['Open the image viewer', 'Hold the trigger key and click the webpage image you want to inspect.'],
    ['Zoom and inspect', 'Use the mouse wheel to zoom, drag to pan, and close the viewer when finished.'],
  ] : [
    ['选择触发键', '在扩展设置中选择 Shift、Alt、Ctrl 或 Command。'],
    ['打开图片查看器', '按住触发键并点击需要检查的网页图片。'],
    ['缩放并查看', '使用滚轮缩放、拖动平移，完成后关闭查看器。'],
  ]
  const numericFacts = isEn ? [
    ['4x', 'optional local AI enhancement'],
    ['10x', 'maximum viewer zoom'],
    ['0', 'image pixel uploads for enhancement'],
  ] : [
    ['4x', '可选本地 AI 高清增强'],
    ['10x', '查看器最高缩放倍数'],
    ['0', '增强处理上传的图片像素'],
  ]
  const quickAnswer = topic.slug ? (copy.answer ?? answers[topic.slug][lang]) : productDefinition
  const schemaDescription = topic.slug ? copy.description : productDefinition
  const graph = [
    { '@type': 'Organization', '@id': `${root}/#organization`, name: 'Click Image Zoom', url: `${root}/`, email: contactEmail, logo: { '@type': 'ImageObject', url: logoUrl, width: 128, height: 128 }, contactPoint: { '@type': 'ContactPoint', email: contactEmail, contactType: 'customer support', availableLanguage: ['en', 'zh-CN'] }, sameAs: [installUrl.split('?')[0]] },
    { '@type': 'SoftwareApplication', '@id': `${root}/#software`, name: 'Click Image Zoom', applicationCategory: 'BrowserApplication', url: `${root}/`, description: productDefinition, author: { '@id': `${root}/#organization` } },
  ]
  if (topic.slug) {
    const pageEntity = copy.schemaType === 'WebPage'
      ? { '@type': 'WebPage', url: `${root}${path}`, name: copy.heading, description: schemaDescription, inLanguage: isEn ? 'en' : 'zh-CN', datePublished: published, dateModified: updated, about: { '@id': `${root}/#software` } }
      : { '@type': copy.schemaType ?? 'TechArticle', headline: copy.heading, description: schemaDescription, inLanguage: isEn ? 'en' : 'zh-CN', datePublished: published, dateModified: updated, author: { '@id': `${root}/#organization` }, publisher: { '@id': `${root}/#organization` }, mainEntityOfPage: `${root}${path}`, about: { '@id': `${root}/#software` }, citation: [installUrl.split('?')[0], 'https://github.com/xinntao/Real-ESRGAN', `${root}/facts.md`] }
    graph.push(
      pageEntity,
      { '@type': 'BreadcrumbList', itemListElement: [
        { '@type': 'ListItem', position: 1, name: isEn ? 'Home' : '首页', item: `${root}${pathFor('', lang)}` },
        { '@type': 'ListItem', position: 2, name: copy.heading, item: `${root}${path}` },
      ] },
    )
  } else {
    graph.push(
      { '@type': 'WebSite', '@id': `${root}/#website`, name: 'Click Image Zoom', url: `${root}/`, inLanguage: ['en', 'zh-CN'], publisher: { '@id': `${root}/#organization` } },
      { '@type': 'WebPage', '@id': `${root}/#webpage`, url: `${root}/`, name: copy.title, description: copy.description, inLanguage: 'en', datePublished: published, dateModified: updated, isPartOf: { '@id': `${root}/#website` }, about: { '@id': `${root}/#software` } },
    )
  }
  if (copy.faq.length) graph.push({ '@type': 'FAQPage', inLanguage: isEn ? 'en' : 'zh-CN', mainEntity: copy.faq.map(([name, text]) => ({ '@type': 'Question', name, acceptedAnswer: { '@type': 'Answer', text } })) })
  if (!copy.bodyHtml) graph.push({ '@type': 'HowTo', inLanguage: isEn ? 'en' : 'zh-CN', name: isEn ? 'How to use Click Image Zoom' : '如何使用 Click Image Zoom', step: howToSteps.map(([name, text], index) => ({ '@type': 'HowToStep', position: index + 1, name, text })) })
  const schema = { '@context': 'https://schema.org', '@graph': graph }
  const body = copy.bodyHtml ? `
      <div class="nativeContent shell section">${copy.bodyHtml}</div>
    ` : `
      <section class="howTo shell section"><p class="eyebrow">${isEn ? 'STEP BY STEP' : '操作步骤'}</p><h2>${isEn ? 'How to use Click Image Zoom' : '如何使用 Click Image Zoom'}</h2><ol>${howToSteps.map(([name, text]) => `<li><strong>${escapeHtml(name)}</strong><span>${escapeHtml(text)}</span></li>`).join('')}</ol></section>
      <section class="comparison shell section"><p class="eyebrow">${isEn ? 'COMPARISON' : '对比'}</p><h2>${isEn ? 'In-page viewing compared with upload tools' : '网页内查看与上传工具对比'}</h2><div class="comparisonGrid"><article><h3>${isEn ? 'Click Image Zoom' : 'Click Image Zoom'}</h3><ul><li>${isEn ? 'Stays on the current webpage' : '留在当前网页中查看'}</li><li>${isEn ? 'Optional local 4x enhancement' : '可选本地 4 倍增强'}</li><li>${isEn ? 'No image upload step' : '无需上传图片'}</li></ul></article><article><h3>${isEn ? 'Upload-based tools' : '上传型工具'}</h3><ul><li>${isEn ? 'Better suited to exporting edited files' : '更适合导出编辑后的文件'}</li><li>${isEn ? 'Requires leaving the browsing flow' : '需要离开当前浏览流程'}</li><li>${isEn ? 'May process images on remote servers' : '可能在远程服务器处理图片'}</li></ul></article></div></section>
      <div class="seoBody shell section">
        ${copy.sections.map(([heading, text]) => `<section><h2>${escapeHtml(heading)}</h2><p>${escapeHtml(text)}</p></section>`).join('')}
      </div>
      <section class="sourceNote shell"><h2>${isEn ? 'Sources and scope' : '信息来源与适用范围'}</h2><p>${isEn ? 'Feature statements reflect the current Click Image Zoom product documentation and Chrome Web Store listing. Real-ESRGAN technical background is available from the official open-source project.' : '功能描述来自当前 Click Image Zoom 产品文档和 Chrome 应用商店页面；Real-ESRGAN 的技术背景可查看其官方开源项目。'}</p><p><a href="${installUrl.split('?')[0]}" target="_blank" rel="noopener noreferrer">Chrome Web Store</a> · <a href="https://github.com/xinntao/Real-ESRGAN" target="_blank" rel="noopener noreferrer">Real-ESRGAN</a> · <a href="/facts.md">${isEn ? 'Machine-readable product facts' : '机器可读产品信息'}</a></p></section>
      <section class="faq section"><div class="shell"><p class="eyebrow">FAQ</p><h2>${isEn ? 'Common questions' : '常见问题'}</h2><div class="faqGrid">${copy.faq.map(([question, answer]) => `<details><summary>${escapeHtml(question)}</summary><p>${escapeHtml(answer)}</p></details>`).join('')}</div></div></section>
      <section class="related shell section"><h2>${isEn ? 'Explore related features' : '继续了解相关功能'}</h2><div class="relatedGrid">${related.map(item => `<a href="${pathFor(item.slug, lang)}"><span>${escapeHtml(item[lang].heading)}</span><small>${isEn ? 'Read guide →' : '查看指南 →'}</small></a>`).join('')}</div></section>
    `

  return `<!doctype html>
<html lang="${isEn ? 'en' : 'zh-CN'}">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    ${isEn && !topic.slug ? '<meta name="msvalidate.01" content="FDEF7F052E48D8D1B8136A8B3DF8AF9B">' : ''}
    <meta name="description" content="${escapeHtml(copy.description)}">
    <meta name="author" content="Click Image Zoom">
    <meta property="og:type" content="website">
    <meta property="og:title" content="${escapeHtml(copy.title)}">
    <meta property="og:description" content="${escapeHtml(copy.description)}">
    <meta property="og:url" content="${root}${path}">
    <meta property="og:image" content="${root}/clickzoom-screenshot-ai-1280x800.webp">
    <meta name="twitter:card" content="summary_large_image">
    <link rel="canonical" href="${root}${path}">
    ${englishOnly ? '' : `<link rel="alternate" hreflang="zh-CN" href="${root}${pathFor(topic.slug, 'zh')}">`}
    <link rel="alternate" hreflang="en" href="${root}${pathFor(topic.slug, 'en')}">
    <link rel="alternate" hreflang="x-default" href="${root}${pathFor(topic.slug, 'en')}">
    <link rel="alternate" type="text/plain" href="${root}/llms.txt" title="LLM context">
    <link rel="icon" href="/icon128.png">
    <link rel="stylesheet" href="/styles.css">
    <title>${escapeHtml(copy.title)}</title>
    <script type="application/ld+json">${JSON.stringify(schema).replaceAll('<', '\\u003c')}</script>
  </head>
  <body>
    <header class="nav shell">
      <a class="brand" href="${pathFor('', lang)}"><img src="/icon128.png" width="34" height="34" alt=""><span>Click Image Zoom</span></a>
      <div class="navControls">
        <a class="navAction" href="${installUrl}" target="_blank" rel="noopener noreferrer">${isEn ? 'Add to Chrome' : '安装扩展'}</a>
        <div class="localeSwitch"><a class="${isEn ? '' : 'active'}" href="${englishOnly ? pathFor('', 'zh') : pathFor(topic.slug, 'zh')}">简中</a><a class="${isEn ? 'active' : ''}" href="${pathFor(topic.slug, 'en')}">EN</a></div>
      </div>
    </header>
    <main>
      <article class="seoHero shell section">
        <div class="seoCopy">
          <p class="eyebrow">${copy.eyebrow}</p>
          <h1>${escapeHtml(copy.heading)}</h1>
          <p class="heroText">${escapeHtml(copy.intro)}</p>
          <p class="contentMeta">${isEn ? 'Last updated' : '最后更新'}: <time datetime="${updated}">${updated}</time> · ${isEn ? 'Product documentation by Click Image Zoom' : 'Click Image Zoom 产品文档'}</p>
          <a class="primaryButton" href="${installUrl}" target="_blank" rel="noopener noreferrer">${isEn ? 'Add to Chrome' : '安装 Chrome 扩展'}</a>
        </div>
        <img class="seoVisual" src="/clickzoom-screenshot-ai-1280x800.webp" width="1280" height="800" alt="${escapeHtml(copy.heading)}" fetchpriority="high">
      </article>
      <section class="factBar shell" aria-label="${isEn ? 'Numeric product facts' : '数字事实'}">${numericFacts.map(([value, label]) => `<div class="fact"><strong>${value}</strong><span>${escapeHtml(label)}</span></div>`).join('')}</section>
      <section class="answerBlock shell" aria-label="${copy.bodyHtml ? 'Quick answer' : (isEn ? 'Definition' : '定义')}"><strong>${copy.bodyHtml ? 'Quick answer' : (isEn ? 'Definition' : '定义')}:</strong> ${escapeHtml(quickAnswer)}</section>
      ${body}
    </main>
    <footer class="footer shell"><a class="brand" href="${pathFor('', lang)}"><img src="/icon128.png" width="30" height="30" alt=""><span>Click Image Zoom</span></a><nav class="footerLinks" aria-label="${isEn ? 'Trust and support links' : '信任与支持链接'}"><a class="footerLink" href="/about/">${isEn ? 'About' : '关于'}</a><a class="footerLink" href="/privacy/">${isEn ? 'Privacy' : '隐私政策'}</a><a class="footerLink" href="/terms/">${isEn ? 'Terms' : '服务条款'}</a><a class="footerLink" href="mailto:${contactEmail}">${isEn ? 'Contact' : '联系'}</a><a class="footerLink" href="${installUrl}" target="_blank" rel="noopener noreferrer">${isEn ? 'Install' : '安装扩展'}</a></nav></footer>
  </body>
</html>`
}

const urls = ['/', '/zh-cn/']
const homeTopic = { slug: '', en: { ...drafts.get(''), eyebrow: 'CLICK IMAGE ZOOM' } }
await mkdir('dist/assets/zh-cn', { recursive: true })
await Promise.all([
  writeFile('dist/assets/index.html', page(homeTopic, 'en')),
  writeFile('dist/assets/zh-cn/index.html', await readFile('site/index.html', 'utf8')),
])

for (const topic of topics) {
  for (const lang of ['zh', 'en']) {
    const path = pathFor(topic.slug, lang)
    const file = join('dist/assets', path, 'index.html')
    await mkdir(dirname(file), { recursive: true })
    await writeFile(file, page(topic, lang))
    urls.push(path)
  }
}

for (const topic of englishPages) {
  const path = pathFor(topic.slug, 'en')
  const file = join('dist/assets', path, 'index.html')
  await mkdir(dirname(file), { recursive: true })
  await writeFile(file, page(topic, 'en'))
  urls.push(path)
}

const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(path => `  <url><loc>${root}${path}</loc><lastmod>${updated}</lastmod></url>`).join('\n')}
</urlset>
`
await writeFile('dist/assets/sitemap-v16.xml', sitemap)
