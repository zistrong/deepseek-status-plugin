/**
 * Client half of `@local/deepseek-status`: a dock pill that opens the same
 * kind of click-anchored dialog the Token usage pill uses — portaled to
 * document.body, placed above the trigger, closed on Escape or an outside
 * pointer press.
 */

window.__ModuleLoader__.load({
  id: '@local/deepseek-status',
  factory(require) {
    const React = require('react')
    const { createPortal } = require('react-dom')
    const h = React.createElement

    /** Locale namespace owned by this plugin. */
    const NS = 'deepseek.status'

    /** Browser-relative route (the page may be mounted below the origin root). */
    const STATUS_PATH = 'api/deepseek-status'

    /** How often a visible pill re-reads the report. */
    const REFRESH_MS = 60_000

    /** Viewport margin and trigger gap, matching the host's anchored panels. */
    const PANEL_MARGIN = 12
    const PANEL_GAP = 8

    /** Unplaced panel: hidden but laid out so the clamp measures real size. */
    const MEASURE_STYLE = { visibility: 'hidden', left: 0, top: 0 }

    /** Stylesheet tag identity, so a reload replaces rather than duplicates it. */
    const CSS_TAG = '@local/deepseek-status/status.css'

    const CSS = `
      .dsk-status-anchor{min-width:0;font-size:calc(var(--dsh-content-font-size-secondary,13px) - 1px);line-height:calc(20px + var(--dsh-content-font-delta-secondary,0px));display:inline-flex}
      .dsk-status-pill{box-sizing:border-box;border:0;border-radius:8px;max-width:100%;background:transparent;color:var(--dsw-alias-label-tertiary);font:inherit;font-variant-numeric:tabular-nums;line-height:inherit;white-space:nowrap;display:inline-flex;align-items:center;gap:6px;padding:1px 8px;cursor:pointer}
      .dsk-status-pill[aria-expanded="true"],.dsk-status-pill:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-secondary)}
      .dsk-status-dot{width:8px;height:8px;border-radius:50%;flex:none}
      .dsk-status-sep{color:var(--dsw-alias-label-tertiary);margin:0 2px}
      .dsk-status-panel{position:fixed;z-index:1100;box-sizing:border-box;width:max-content;min-width:min(300px,calc(100vw - 24px));max-width:min(440px,calc(100vw - 24px));max-height:calc(100vh - 24px);overflow:hidden auto;padding:16px;border:1px solid var(--dsw-alias-border-l1);border-radius:12px;background:var(--dsw-alias-bg-overlay);color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px;cursor:default}
      .dsk-status-title{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:8px;color:var(--dsw-alias-label-primary);font-weight:500}
      .dsk-status-title-label{display:inline-flex;align-items:center;gap:6px;min-width:0}
      .dsk-status-title-label svg{flex:none;width:14px;height:14px}
      .dsk-status-title-value{font-variant-numeric:tabular-nums;white-space:nowrap}
      .dsk-status-rule{border-top:.5px solid var(--dsw-alias-border-l2);margin-bottom:10px}
      .dsk-status-details{display:grid;grid-template-columns:minmax(76px,auto) minmax(0,1fr);gap:6px 16px;margin:0;color:var(--dsw-alias-label-tertiary)}
      .dsk-status-details dt,.dsk-status-details dd{margin:0;min-width:0}
      .dsk-status-details dd{text-align:right;color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums}
      .dsk-status-footer{display:flex;align-items:center;gap:14px;margin-top:12px;padding-top:10px;border-top:.5px solid var(--dsw-alias-border-l1)}
      .dsk-status-action{padding:0;border:0;background:transparent;color:var(--dsw-alias-brand-primary);font:inherit;cursor:pointer}
      .dsk-status-action[disabled]{opacity:.6;cursor:default}
      .dsk-status-note{margin-top:8px;color:var(--dsw-alias-label-tertiary)}
      .dsk-status-error{color:var(--dsw-alias-state-error-primary)}
    `

    const dictionaries = {
      en: {
        'meta.title': 'DeepSeek service status',
        'summary.operational': 'DeepSeek services operational',
        'summary.degraded': 'DeepSeek services degraded',
        'summary.down': 'DeepSeek services unavailable',
        'summary.unknown': 'DeepSeek status unknown',
        'summary.loading': 'Checking DeepSeek services…',
        'check.chat': 'Chat API',
        'check.search': 'Web search API',
        'check.anthropic': 'Anthropic-compatible API',
        'state.operational': 'Operational',
        'state.degraded': 'Degraded',
        'state.down': 'Down',
        'state.timeout': 'Timed out',
        'state.unreachable': 'Unreachable',
        'meta.latency': '{ms} ms',
        'meta.updatedLabel': 'Checked',
        'meta.refresh': 'Check again',
        'meta.refreshing': 'Checking…',
        'meta.official': 'Official status page',
        'meta.note': 'Probed from this machine without an API key; an HTTP 401 reply means the service answered.',
        'meta.error': 'Status request failed: {message}',
      },
      zh: {
        'meta.title': 'DeepSeek 服务状态',
        'summary.operational': 'DeepSeek 服务正常',
        'summary.degraded': 'DeepSeek 服务部分异常',
        'summary.down': 'DeepSeek 服务不可用',
        'summary.unknown': 'DeepSeek 状态未知',
        'summary.loading': '正在检查 DeepSeek 服务…',
        'check.chat': '对话 API',
        'check.search': '联网搜索 API',
        'check.anthropic': 'Anthropic 兼容 API',
        'state.operational': '正常',
        'state.degraded': '异常',
        'state.down': '故障',
        'state.timeout': '超时',
        'state.unreachable': '无法连接',
        'meta.latency': '{ms} 毫秒',
        'meta.updatedLabel': '更新时间',
        'meta.refresh': '重新检查',
        'meta.refreshing': '检查中…',
        'meta.official': '官方状态页',
        'meta.note': '由本机未携带密钥探测；HTTP 401 表示服务已响应。',
        'meta.error': '状态请求失败：{message}',
      },
    }

    /** Dot colors per state, using theme tokens only. */
    const TONES = {
      operational: 'var(--dsw-alias-state-success-primary)',
      degraded: 'var(--dsw-alias-state-warn-primary)',
      down: 'var(--dsw-alias-state-error-primary)',
      unknown: 'var(--dsw-alias-state-idle-primary)',
      loading: 'var(--dsw-alias-state-idle-primary)',
    }

    /** Small heartbeat glyph used in the dialog title. */
    function StatusGlyph() {
      return h('svg', { viewBox: '0 0 16 16', 'aria-hidden': true },
        h('path', {
          d: 'M1.75 8.5h2.9l1.4-3.9 2.1 6.8 1.7-4.6 1 1.7h3.4',
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 1.4,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
        }))
    }

    /**
     * One trigger-anchored seat: viewport-clamped placement above the anchor,
     * re-measured on resize, scroll, and panel content changes.
     * @param options - open state and the two element refs.
     * @returns the fixed position, or null while closed.
     */
    function useAnchoredPosition({ open, anchorRef, panelRef, contentKey }) {
      const [pos, setPos] = React.useState(null)

      React.useLayoutEffect(() => {
        if (!open) {
          setPos(null)
          return
        }
        const place = () => {
          const anchor = anchorRef.current
          const panel = panelRef.current
          if (anchor === null || panel === null) return
          const rect = anchor.getBoundingClientRect()
          const width = panel.offsetWidth
          const height = panel.offsetHeight
          const vw = document.documentElement.clientWidth
          const vh = document.documentElement.clientHeight
          let left = rect.left + rect.width / 2 - width / 2
          left = Math.max(PANEL_MARGIN, Math.min(left, vw - PANEL_MARGIN - width))
          let top = rect.top - PANEL_GAP - height
          if (top < PANEL_MARGIN) top = Math.min(rect.bottom + PANEL_GAP, vh - PANEL_MARGIN - height)
          top = Math.max(PANEL_MARGIN, top)
          const next = { position: 'fixed', left: Math.round(left), top: Math.round(top), zIndex: 1100 }
          setPos((previous) => (previous !== null && previous.left === next.left && previous.top === next.top ? previous : next))
        }
        place()
        const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(place)
        if (observer !== undefined && panelRef.current !== null) observer.observe(panelRef.current)
        window.addEventListener('resize', place)
        window.addEventListener('scroll', place, true)
        return () => {
          observer?.disconnect()
          window.removeEventListener('resize', place)
          window.removeEventListener('scroll', place, true)
        }
      }, [open, contentKey, anchorRef, panelRef])

      return pos
    }

    /**
     * Apply this plugin to the browser plugin context.
     * @param ctx - browser plugin context.
     */
    function apply(ctx) {
      const t = ctx.locale.bind(NS)
      ctx.effect(() => ctx.locale.register(NS, dictionaries), 'deepseek-status: dictionaries')
      ctx.effect(() => {
        const tag = document.createElement('style')
        tag.dataset.plugin = '@local/deepseek-status'
        tag.dataset.pluginCss = CSS_TAG
        tag.textContent = CSS
        document.head.appendChild(tag)
        return () => {
          tag.remove()
        }
      }, 'deepseek-status: stylesheet')

      /** Status pill and its floating report dialog. */
      function DeepSeekStatusPill() {
        const [snapshot, setSnapshot] = React.useState({ phase: 'loading', data: null, error: null })
        const [open, setOpen] = React.useState(false)
        const [refreshing, setRefreshing] = React.useState(false)
        const anchorRef = React.useRef(null)
        const panelRef = React.useRef(null)
        const mounted = React.useRef(true)

        const load = React.useCallback(async (force) => {
          if (force) setRefreshing(true)
          try {
            const response = await fetch(force ? `${STATUS_PATH}?refresh=1` : STATUS_PATH, {
              headers: { accept: 'application/json' },
              cache: 'no-store',
            })
            const data = await response.json().catch(() => null)
            if (!mounted.current) return
            if (!response.ok || data === null || typeof data.overall !== 'string') {
              setSnapshot({
                phase: 'error',
                data: null,
                error: typeof data?.error === 'string' ? data.error : `HTTP ${response.status}`,
              })
              return
            }
            setSnapshot({ phase: 'ready', data, error: null })
          } catch (error) {
            if (!mounted.current) return
            setSnapshot({ phase: 'error', data: null, error: String(error?.message ?? error) })
          } finally {
            if (mounted.current) setRefreshing(false)
          }
        }, [])

        React.useEffect(() => {
          mounted.current = true
          void load(false)
          const timer = setInterval(() => void load(false), REFRESH_MS)
          return () => {
            mounted.current = false
            clearInterval(timer)
          }
        }, [load])

        React.useEffect(() => {
          if (!open) return
          const onKeyDown = (event) => {
            if (event.key === 'Escape') setOpen(false)
          }
          const onPointerDown = (event) => {
            const target = event.target
            if (!(target instanceof Node)) return
            if (anchorRef.current?.contains(target) === true) return
            if (panelRef.current?.contains(target) === true) return
            setOpen(false)
          }
          document.addEventListener('keydown', onKeyDown)
          document.addEventListener('pointerdown', onPointerDown, true)
          return () => {
            document.removeEventListener('keydown', onKeyDown)
            document.removeEventListener('pointerdown', onPointerDown, true)
          }
        }, [open])

        const data = snapshot.data
        const overall = snapshot.phase === 'ready' ? data.overall : snapshot.phase === 'loading' ? 'loading' : 'unknown'
        const checks = snapshot.phase === 'ready' && Array.isArray(data.checks) ? data.checks : []
        const slowest = checks.reduce((max, check) => Math.max(max, Number(check.latencyMs) || 0), 0)
        const checkedAt = snapshot.phase === 'ready' ? new Date(data.checkedAt) : null
        const checkedText = checkedAt === null || Number.isNaN(checkedAt.getTime()) ? '' : checkedAt.toLocaleTimeString()
        const summary = t(`summary.${overall}`)
        const pos = useAnchoredPosition({
          open,
          anchorRef,
          panelRef,
          contentKey: `${snapshot.phase}:${data?.checkedAt ?? ''}:${checks.length}`,
        })

        const detail = (check) => [
          t(`state.${check.state}`),
          check.httpStatus === null ? '—' : `HTTP ${check.httpStatus}`,
          t('meta.latency', { ms: check.latencyMs }),
        ].join(' · ')

        return h(React.Fragment, null,
          h('span', { ref: anchorRef, className: 'dsk-status-anchor', 'data-plugin': 'deepseek-status' },
            h('button', {
              type: 'button',
              className: 'dsk-status-pill',
              'aria-haspopup': 'dialog',
              'aria-expanded': open,
              'aria-label': summary,
              title: summary,
              onClick: () => setOpen((value) => !value),
            },
              h('span', { className: 'dsk-status-dot', style: { background: TONES[overall] ?? TONES.unknown }, 'aria-hidden': true }),
              h('span', null, summary),
              slowest > 0
                ? h(React.Fragment, null,
                  h('span', { className: 'dsk-status-sep', 'aria-hidden': true }, '·'),
                  h('span', null, t('meta.latency', { ms: slowest })))
                : null,
            ),
          ),
          open ? createPortal(
            h('div', {
              ref: panelRef,
              className: 'dsk-status-panel',
              role: 'dialog',
              'aria-label': t('meta.title'),
              style: pos ?? MEASURE_STYLE,
            },
              h('div', { className: 'dsk-status-title' },
                h('span', { className: 'dsk-status-title-label' }, h(StatusGlyph), h('span', null, t('meta.title'))),
                h('span', { className: 'dsk-status-title-value' }, summary),
              ),
              h('div', { className: 'dsk-status-rule', 'aria-hidden': true }),
              snapshot.phase === 'error'
                ? h('div', { className: 'dsk-status-error' }, t('meta.error', { message: snapshot.error ?? '' }))
                : h('dl', { className: 'dsk-status-details' },
                  ...checks.flatMap((check) => [
                    h('dt', { key: `${check.id}-k` }, t(`check.${check.id}`)),
                    h('dd', { key: `${check.id}-v` }, detail(check)),
                  ]),
                  checkedText === '' ? null : h('dt', { key: 'checked-k' }, t('meta.updatedLabel')),
                  checkedText === '' ? null : h('dd', { key: 'checked-v' }, checkedText),
                ),
              h('div', { className: 'dsk-status-footer' },
                h('button', {
                  type: 'button',
                  className: 'dsk-status-action',
                  disabled: refreshing,
                  onClick: () => void load(true),
                }, refreshing ? t('meta.refreshing') : t('meta.refresh')),
                h('a', {
                  className: 'dsk-status-action',
                  href: 'https://status.deepseek.com',
                  target: '_blank',
                  rel: 'noreferrer noopener',
                }, t('meta.official')),
              ),
              h('div', { className: 'dsk-status-note' }, t('meta.note')),
            ),
            document.body,
          ) : null,
        )
      }

      ctx.slots.inject('conversation.composer.dock', () => ctx.slots.register({
        name: 'conversation.composer.dock',
        id: 'deepseek-status',
        order: 11,
        locale: NS,
      }, DeepSeekStatusPill))
    }

    return { inject: ['slots', 'locale'], apply }
  },
})
