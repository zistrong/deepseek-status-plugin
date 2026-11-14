/**
 * Host half of `@zistrong/deepseek-status`.
 *
 * Probes the DeepSeek API surfaces this profile can use and answers the
 * browser through one exact Fetch route on the shared `/api` channel, so the
 * page never needs cross-origin access to DeepSeek. Requests are unauthenticated
 * on purpose: a 4xx answer (typically 401 "Authentication Fails") proves the
 * service accepted and answered the request without spending tokens, while a
 * network failure, timeout, or 5xx answer reports the surface as unavailable.
 */

/** Base origin shared by every probed DeepSeek surface. */
const API_BASE = 'https://api.deepseek.com'

/** Exact browser route, below the shared `/api` channel. */
const ROUTE = '/api/deepseek-status'

/** Probed surfaces, in display order. */
const CHECKS = [
  { id: 'chat', path: '/models' },
  { id: 'search', path: '/v1/tools' },
  { id: 'anthropic', path: '/anthropic/v1/messages' },
]

export const inject = ['connection']

/**
 * Probe one surface once.
 * @param check - declared surface.
 * @param timeoutMs - per-request deadline.
 * @returns one settled check result.
 */
async function probe(check, timeoutMs) {
  const startedAt = Date.now()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(API_BASE + check.path, {
      method: 'GET',
      redirect: 'manual',
      signal: controller.signal,
      headers: { accept: 'application/json', 'user-agent': 'dsh-deepseek-status/1.0' },
    })
    const latencyMs = Date.now() - startedAt
    try {
      await response.arrayBuffer()
    } catch {
      // The status answer is already known; a body read failure changes nothing.
    }
    return {
      id: check.id,
      path: check.path,
      state: response.status >= 500 ? 'down' : 'operational',
      httpStatus: response.status,
      latencyMs,
    }
  } catch (error) {
    const aborted = error !== null && typeof error === 'object' && error.name === 'AbortError'
    return {
      id: check.id,
      path: check.path,
      state: aborted ? 'timeout' : 'unreachable',
      httpStatus: null,
      latencyMs: Date.now() - startedAt,
    }
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Register the probe route.
 * @param ctx - Host plugin context.
 * @param config - optional row config (`timeoutMs`, `cacheSeconds`).
 */
export function apply(ctx, config) {
  const configuredTimeout = Number(config?.timeoutMs)
  const timeoutMs = Number.isFinite(configuredTimeout) && configuredTimeout > 0 ? configuredTimeout : 6000
  const configuredCache = Number(config?.cacheSeconds)
  const cacheSeconds = Number.isFinite(configuredCache) && configuredCache >= 0 ? configuredCache : 30

  let cached
  let inflight

  /**
   * Probe every surface concurrently.
   * @returns one report for the browser.
   */
  async function measure() {
    const startedAt = Date.now()
    const checks = await Promise.all(CHECKS.map((check) => probe(check, timeoutMs)))
    const working = checks.filter((check) => check.state === 'operational').length
    const overall = working === checks.length ? 'operational' : working === 0 ? 'down' : 'degraded'
    return {
      checkedAt: new Date().toISOString(),
      durationMs: Date.now() - startedAt,
      overall,
      checks,
    }
  }

  /**
   * Read the report, reusing the cached one and any in-flight measurement.
   * @param force - bypass the cache.
   * @returns the report.
   */
  function snapshot(force) {
    if (!force && cached !== undefined && Date.now() - cached.at < cacheSeconds * 1000) {
      return Promise.resolve(cached.value)
    }
    if (inflight === undefined) {
      inflight = measure()
        .then((value) => {
          cached = { at: Date.now(), value }
          return value
        })
        .finally(() => {
          inflight = undefined
        })
    }
    return inflight
  }

  ctx.effect(() => ctx.connection.fetch.register({
    path: ROUTE,
    methods: ['GET'],
    requestBody: 'buffered',
    fetch: async (request) => {
      const force = new URL(request.url).searchParams.get('refresh') === '1'
      try {
        return Response.json(await snapshot(force), {
          headers: { 'cache-control': 'no-store' },
        })
      } catch (error) {
        return Response.json(
          { overall: 'unknown', error: String(error?.message ?? error) },
          { status: 503, headers: { 'cache-control': 'no-store' } },
        )
      }
    },
  }), 'deepseek-status: probe route')
}
