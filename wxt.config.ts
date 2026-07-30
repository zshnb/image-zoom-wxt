import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'wxt'

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: '__MSG_extName__',
    description: '__MSG_extDescription__',
    default_locale: 'en',
    icons: {
      16: 'icon/icon16.png',
      24: 'icon/icon24.png',
      32: 'icon/icon32.png',
      48: 'icon/icon48.png',
      128: 'icon/icon128.png',
    },
    action: {
      default_icon: {
        16: 'icon/icon16.png',
        24: 'icon/icon24.png',
        32: 'icon/icon32.png',
        48: 'icon/icon48.png',
        128: 'icon/icon128.png',
      },
    },
    permissions: ['storage', 'downloads', 'nativeMessaging'],
    host_permissions: ['http://*/*', 'https://*/*'],
    content_security_policy: {
      extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'self';",
    },
    web_accessible_resources: [
      {
        resources: ['litert-runner.html', 'litert/wasm/*', 'models/*.tflite'],
        matches: ['<all_urls>'],
      },
    ],
  },
  vite: () => ({
    plugins: [tailwindcss()],
  }),
})
