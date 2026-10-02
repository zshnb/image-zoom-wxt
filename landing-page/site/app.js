const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function onVisible(element, callback) {
  const observer = new IntersectionObserver(([entry]) => callback(entry.isIntersecting), { threshold: 0.35 })
  observer.observe(element)
}

// Sticky nav border
const nav = document.querySelector('.nav')
const updateNav = () => nav.classList.toggle('isScrolled', window.scrollY > 8)
updateNav()
window.addEventListener('scroll', updateNav, { passive: true })

// Before/after sliders
for (const compare of document.querySelectorAll('[data-compare]')) {
  const input = compare.querySelector('input')
  input.addEventListener('input', () => compare.style.setProperty('--pos', `${input.value}%`))
}

// Tabs (steps + use cases)
for (const group of document.querySelectorAll('[data-tabs]')) {
  const tabs = [...group.querySelectorAll('[role="tab"]')]
  let autoTimer = 0

  const select = (index, focus = false) => {
    tabs.forEach((tab, i) => {
      const active = i === index
      tab.setAttribute('aria-selected', String(active))
      tab.tabIndex = active ? 0 : -1
      document.getElementById(tab.getAttribute('aria-controls')).hidden = !active
    })
    if (focus) tabs[index].focus()
  }
  const stopAuto = () => {
    clearInterval(autoTimer)
    autoTimer = 0
    group.classList.remove('isAuto')
  }

  tabs.forEach((tab, i) => {
    tab.addEventListener('click', () => { stopAuto(); select(i) })
    tab.addEventListener('keydown', (event) => {
      const step = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[event.key]
      if (!step) return
      event.preventDefault()
      stopAuto()
      select((i + step + tabs.length) % tabs.length, true)
    })
  })

  if (group.hasAttribute('data-autoplay') && !reducedMotion) {
    let userStopped = false
    group.addEventListener('pointerdown', () => { userStopped = true })
    onVisible(group, (visible) => {
      if (!visible || userStopped) return stopAuto()
      if (autoTimer) return
      group.classList.add('isAuto')
      autoTimer = setInterval(() => {
        const current = tabs.findIndex((tab) => tab.getAttribute('aria-selected') === 'true')
        select((current + 1) % tabs.length)
      }, 6000)
    })
  }
}

// Interactive viewer demo
const demo = document.querySelector('[data-demo]')
if (demo) setupDemo(demo)

function setupDemo(root) {
  const body = root.querySelector('.demoBody')
  const viewer = root.querySelector('[data-viewer]')
  const stage = root.querySelector('[data-stage]')
  const image = root.querySelector('[data-viewer-image]')
  const scaleLabel = root.querySelector('[data-scale]')
  const status = root.querySelector('[data-status]')
  const cursor = root.querySelector('[data-cursor]')
  const toast = root.querySelector('[data-toast]')
  const toggle = root.querySelector('[data-toggle]')
  const shots = [...root.querySelectorAll('[data-demo-open]')]
  const text = root.dataset

  const state = { scale: 1, x: 0, y: 0, after: '', enhanced: false, timer: 0 }
  let armed = false
  let toastTimer = 0

  const render = () => {
    image.style.transform = `translate(${state.x}px, ${state.y}px) scale(${state.scale})`
    scaleLabel.textContent = `${state.scale.toFixed(1)}x`
  }

  const showToast = (message) => {
    toast.textContent = message
    toast.classList.add('isVisible')
    clearTimeout(toastTimer)
    toastTimer = setTimeout(() => toast.classList.remove('isVisible'), 1800)
  }

  const setArmed = (value) => {
    armed = value
    root.classList.toggle('isArmed', value)
  }

  const setStatus = (message, ready = false) => {
    status.hidden = !message
    status.textContent = message
    status.classList.toggle('isReady', ready)
  }

  const enhance = () => {
    if (!state.after || state.enhanced) return
    state.enhanced = true
    setStatus(text.busy)
    state.timer = setTimeout(() => {
      image.src = state.after
      setStatus(text.ready, true)
      state.timer = setTimeout(() => setStatus(''), 2200)
    }, 1400)
  }

  const open = (shot) => {
    clearTimeout(state.timer)
    Object.assign(state, { scale: 1, x: 0, y: 0, after: shot.dataset.after || '', enhanced: false })
    image.src = shot.dataset.src
    image.alt = shot.querySelector('img').alt
    setStatus('')
    render()
    viewer.hidden = false
  }

  const close = () => {
    clearTimeout(state.timer)
    viewer.hidden = true
    setStatus('')
  }

  const zoomTo = (scale, originX = 0, originY = 0) => {
    const next = Math.min(10, Math.max(1, scale))
    const ratio = next / state.scale
    state.x = next === 1 ? 0 : originX - (originX - state.x) * ratio
    state.y = next === 1 ? 0 : originY - (originY - state.y) * ratio
    state.scale = next
    render()
    if (next > 1) enhance()
  }

  // Keyboard: the demo mirrors the extension's default Left/Right Shift trigger.
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !viewer.hidden) { stopAutoplay(); close() }
    if (event.key === 'Shift') setArmed(true)
  })
  document.addEventListener('keyup', (event) => { if (event.key === 'Shift') setArmed(false) })
  window.addEventListener('blur', () => setArmed(false))

  for (const shot of shots) {
    shot.addEventListener('click', (event) => {
      stopAutoplay()
      const touch = event.pointerType === 'touch' || (event.detail === 0 && !event.shiftKey)
      if (event.shiftKey || armed || touch) open(shot)
      else showToast(text.hint)
    })
  }

  stage.addEventListener('wheel', (event) => {
    event.preventDefault()
    stopAutoplay()
    const rect = stage.getBoundingClientRect()
    zoomTo(state.scale * Math.exp(-event.deltaY * 0.0022), event.clientX - rect.left - rect.width / 2, event.clientY - rect.top - rect.height / 2)
  }, { passive: false })

  let drag = null
  stage.addEventListener('pointerdown', (event) => {
    stopAutoplay()
    drag = { id: event.pointerId, x: event.clientX - state.x, y: event.clientY - state.y }
    stage.setPointerCapture(event.pointerId)
    stage.classList.add('isDragging')
  })
  stage.addEventListener('pointermove', (event) => {
    if (!drag || drag.id !== event.pointerId) return
    state.x = event.clientX - drag.x
    state.y = event.clientY - drag.y
    render()
  })
  const endDrag = () => { drag = null; stage.classList.remove('isDragging') }
  stage.addEventListener('pointerup', endDrag)
  stage.addEventListener('pointercancel', endDrag)
  stage.addEventListener('dblclick', (event) => {
    const rect = stage.getBoundingClientRect()
    zoomTo(state.scale > 1 ? 1 : 3, event.clientX - rect.left - rect.width / 2, event.clientY - rect.top - rect.height / 2)
  })

  root.querySelector('.viewerTools').addEventListener('click', async (event) => {
    const button = event.target.closest('[data-tool]')
    if (!button) return
    stopAutoplay()
    const url = new URL(image.getAttribute('src'), location.href).href
    const tool = button.dataset.tool
    if (tool === 'close') close()
    if (tool === 'open') window.open(url, '_blank', 'noopener')
    if (tool === 'save') {
      const link = Object.assign(document.createElement('a'), { href: url, download: url.split('/').pop() })
      link.click()
    }
    if (tool === 'copy') {
      try {
        await navigator.clipboard.writeText(url)
        showToast(text.copied)
      } catch {
        showToast(text.copyFailed)
      }
    }
  })

  // Scripted walkthrough that plays until the visitor interacts.
  let runId = 0
  let playing = false
  let userPaused = false

  const moveCursor = (target, fx = 0.5, fy = 0.5) => {
    const box = body.getBoundingClientRect()
    const rect = target.getBoundingClientRect()
    cursor.style.left = `${((rect.left - box.left + rect.width * fx) / box.width) * 100}%`
    cursor.style.top = `${((rect.top - box.top + rect.height * fy) / box.height) * 100}%`
  }

  const clickCursor = () => {
    cursor.classList.remove('isClick')
    void cursor.offsetWidth
    cursor.classList.add('isClick')
  }

  async function script(id) {
    const step = async (ms) => {
      await sleep(ms)
      if (id !== runId) throw new Error('stopped')
    }
    const main = shots[0]
    while (true) {
      close()
      moveCursor(body, 0.85, 0.85)
      await step(900)
      moveCursor(main, 0.55, 0.55)
      await step(1100)
      setArmed(true)
      await step(600)
      clickCursor()
      open(main)
      await step(300)
      setArmed(false)
      viewer.classList.add('isAnimating')
      await step(700)
      moveCursor(stage, 0.6, 0.45)
      await step(900)
      const rect = stage.getBoundingClientRect()
      zoomTo(2.6, rect.width * 0.1, -rect.height * 0.05)
      await step(1300)
      zoomTo(4.2, rect.width * 0.1, -rect.height * 0.05)
      await step(2000)
      moveCursor(stage, 0.35, 0.6)
      state.x += rect.width * 0.28
      state.y -= rect.height * 0.12
      render()
      await step(2200)
      zoomTo(1)
      await step(1100)
      moveCursor(root.querySelector('[data-tool="close"]'))
      await step(1000)
      clickCursor()
      viewer.classList.remove('isAnimating')
      close()
      await step(1600)
    }
  }

  function startAutoplay() {
    if (playing || userPaused || reducedMotion) return
    playing = true
    runId += 1
    root.classList.add('isPlaying')
    toggle.textContent = text.pause
    toggle.setAttribute('aria-pressed', 'false')
    script(runId).catch(() => {})
  }

  function stopAutoplay(pausedByUser = true) {
    if (!playing) return
    playing = false
    runId += 1
    userPaused = pausedByUser
    root.classList.remove('isPlaying')
    viewer.classList.remove('isAnimating')
    setArmed(false)
    toggle.textContent = text.play
    toggle.setAttribute('aria-pressed', 'true')
  }

  toggle.addEventListener('click', () => {
    if (playing) return stopAutoplay()
    userPaused = false
    close()
    startAutoplay()
  })

  if (reducedMotion) toggle.hidden = true
  onVisible(root, (visible) => (visible ? startAutoplay() : stopAutoplay(false)))
}
