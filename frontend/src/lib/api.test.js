import { afterEach, describe, expect, it, vi } from 'vitest'
import { api, ApiError, API_URL, setUnauthorizedHandler, tokenStore } from './api'

const jsonResponse = (status, body) => new Response(body === undefined ? null : JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json' },
})

afterEach(() => { vi.unstubAllGlobals(); setUnauthorizedHandler(() => {}) })

describe('api client', () => {
  it('sends the bearer token and JSON body', async () => {
    tokenStore.set('abc')
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { ok: true }))
    vi.stubGlobal('fetch', fetchMock)
    await api.auth.login('a@b.c', 'x')
    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toBe(`${API_URL}/api/auth/login`)
    expect(init.method).toBe('POST')
    expect(init.headers.Authorization).toBe('Bearer abc')
    expect(init.headers['Content-Type']).toBe('application/json')
    expect(JSON.parse(init.body)).toEqual({ email: 'a@b.c', password: 'x' })
  })

  it('normalises API errors into ApiError with detail and code', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(409, { detail: 'Already submitted', code: 'conflict' })))
    const err = await api.auth.me().catch((e) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect(err.status).toBe(409)
    expect(err.message).toBe('Already submitted')
    expect(err.code).toBe('conflict')
  })

  it('uses friendly messages for server errors and network failures', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('boom', { status: 502 })))
    expect((await api.auth.me().catch((e) => e)).message).toMatch(/went wrong on the server/)
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    const err = await api.auth.me().catch((e) => e)
    expect(err.status).toBe(0)
    expect(err.code).toBe('network')
  })

  it('clears the token and notifies on 401 when signed in', async () => {
    tokenStore.set('expired')
    const handler = vi.fn()
    setUnauthorizedHandler(handler)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(401, { detail: 'Token expired' })))
    await api.auth.me().catch(() => {})
    expect(handler).toHaveBeenCalledOnce()
    expect(tokenStore.get()).toBeNull()
  })
})
