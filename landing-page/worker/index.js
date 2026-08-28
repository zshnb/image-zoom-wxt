export function assetPath(pathname) {
  if (pathname === '/') return '/index.html'
  if (pathname.endsWith('/')) return `${pathname}index.html`
  if (!pathname.split('/').pop().includes('.')) return `${pathname}/index.html`
  return pathname
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    if (url.protocol !== 'https:' || url.hostname !== 'imagezoom.zshnb.com') {
      url.protocol = 'https:'
      url.hostname = 'imagezoom.zshnb.com'
      return Response.redirect(url, 301)
    }
    if (url.pathname === '/product.md') return Response.redirect(new URL('/product/', url), 301)
    if (url.pathname === '/en' || url.pathname.startsWith('/en/')) {
      url.pathname = url.pathname.slice(3) || '/'
      return Response.redirect(url, 301)
    }
    if (url.pathname === '/sitemap.xml') url.pathname = '/sitemap-v16.xml'
    else url.pathname = assetPath(url.pathname)
    return env.ASSETS.fetch(new Request(url, request))
  },
}
