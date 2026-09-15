const docsPage = document.querySelector<HTMLElement>('[data-docs-page]')

if (docsPage) {
  const article = docsPage.querySelector<HTMLElement>('.docs-content')

  article?.querySelectorAll<HTMLPreElement>('.docs-code-block pre').forEach((pre) => {
    const block = pre.closest<HTMLElement>('.docs-code-block')
    const code = pre.querySelector('code')
    if (!block || block.querySelector('[data-docs-code-tools]')) return

    const source = code?.textContent ?? pre.textContent ?? ''
    const languageName = block.dataset.language ?? 'code'
    const language = ({ tsx: 'TSX', typescript: 'TypeScript', bash: 'Shell', mindmap: 'Markdown', css: 'CSS' } as Record<string, string>)[languageName] ?? languageName
    const toolbar = document.createElement('div')
    toolbar.className = 'docs-code-tools'
    toolbar.dataset.docsCodeTools = ''

    const label = document.createElement('span')
    label.className = 'docs-code-language'
    label.textContent = language

    const button = document.createElement('button')
    button.className = 'docs-copy-button'
    button.type = 'button'
    button.textContent = 'Copy'
    button.setAttribute('aria-label', `Copy ${language} code`)

    const status = document.createElement('span')
    status.className = 'docs-copy-status'
    status.setAttribute('role', 'status')
    status.setAttribute('aria-live', 'polite')

    button.addEventListener('click', async () => {
      button.disabled = true
      try {
        if (!navigator.clipboard?.writeText) throw new Error('Clipboard is unavailable')
        await navigator.clipboard.writeText(source)
        button.textContent = 'Copied'
        button.setAttribute('aria-label', 'Code copied')
        status.classList.remove('is-error')
        status.textContent = 'Code copied to clipboard.'
        window.setTimeout(() => {
          if (button.textContent !== 'Copied') return
          button.textContent = 'Copy'
          button.setAttribute('aria-label', `Copy ${language} code`)
          status.textContent = ''
        }, 2000)
      } catch {
        button.textContent = 'Copy failed'
        button.setAttribute('aria-label', 'Could not copy code')
        status.classList.add('is-error')
        status.textContent = 'Could not copy code. Select the code and copy it manually.'
      }
      button.disabled = false
    })

    toolbar.append(label, button)
    block.append(toolbar, status)
  })

  const links = Array.from(docsPage.querySelectorAll<HTMLAnchorElement>('[data-docs-link]'))
  const sections = Array.from(docsPage.querySelectorAll<HTMLElement>('[data-docs-section] > .docs-section'))
  const setActive = (id: string) => {
    links.forEach((link) => {
      const active = link.dataset.docsLink === id
      link.classList.toggle('active', active)
      if (active) link.setAttribute('aria-current', 'location')
      else link.removeAttribute('aria-current')
    })
  }

  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver((entries) => {
      const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
      const id = visible[0]?.target.id
      if (id) setActive(id)
    }, { rootMargin: '-72px 0px -70% 0px', threshold: 0 })
    sections.forEach((section) => observer.observe(section))
  }

  const trigger = docsPage.querySelector<HTMLButtonElement>('[data-docs-menu]')
  const overlay = docsPage.querySelector<HTMLElement>('[data-docs-overlay]')
  const drawer = docsPage.querySelector<HTMLElement>('#docs-mobile-drawer')
  const close = docsPage.querySelector<HTMLButtonElement>('[data-docs-close]')

  const closeMenu = () => {
    if (!overlay || overlay.hidden) return
    overlay.hidden = true
    trigger?.setAttribute('aria-expanded', 'false')
    trigger?.focus()
  }

  trigger?.addEventListener('click', () => {
    if (!overlay) return
    overlay.hidden = false
    trigger.setAttribute('aria-expanded', 'true')
    close?.focus()
  })
  close?.addEventListener('click', closeMenu)
  overlay?.addEventListener('click', (event) => {
    if (event.target === overlay) closeMenu()
  })
  drawer?.querySelectorAll('a').forEach((link) => link.addEventListener('click', closeMenu))
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && overlay && !overlay.hidden) closeMenu()
  })

  links.forEach((link) => link.addEventListener('click', () => {
    const id = link.dataset.docsLink
    if (id) setActive(id)
  }))

  const top = docsPage.querySelector<HTMLButtonElement>('[data-docs-top]')
  const updateTop = () => {
    if (top) top.hidden = window.scrollY <= 400
  }
  updateTop()
  window.addEventListener('scroll', updateTop, { passive: true })
  top?.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }))
}
