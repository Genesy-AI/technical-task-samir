import { afterEach, describe, expect, it, vi } from 'vitest'
import { findPhone, PhoneLookupInput, ProviderRequestError } from './phoneProviders'

const input: PhoneLookupInput = {
  fullName: 'Ada Lovelace',
  email: 'ada@example.com',
  jobTitle: 'CTO',
  companyWebsite: 'example.com',
}

const mockFetch = (status: number, body: unknown) => {
  const fetchMock = vi.fn().mockResolvedValue({ status, ok: status < 400, json: async () => body })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

describe('findPhone', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('maps each provider to its own request shape and auth', async () => {
    const fetchMock = mockFetch(200, {})

    await findPhone('orionConnect', input)
    await findPhone('astraDialer', input)
    await findPhone('nimbusLookup', input)

    const [orion, astra, nimbus] = fetchMock.mock.calls
    expect(orion[0]).toContain('/orionConnect')
    expect(orion[1].headers['x-auth-me']).toBeDefined()
    expect(JSON.parse(orion[1].body)).toEqual({ fullName: 'Ada Lovelace', companyWebsite: 'example.com' })

    expect(astra[1].headers.apiKey).toBeDefined()
    expect(JSON.parse(astra[1].body)).toEqual({ email: 'ada@example.com' })

    expect(nimbus[0]).toMatch(/\/numbusLookup\?api=/)
    expect(JSON.parse(nimbus[1].body)).toEqual({ email: 'ada@example.com', jobTitle: 'CTO' })
  })

  it('extracts the phone from each provider response format', async () => {
    mockFetch(200, { phone: '111' })
    expect(await findPhone('orionConnect', input)).toBe('111')

    mockFetch(200, { phoneNmbr: '222' })
    expect(await findPhone('astraDialer', input)).toBe('222')

    mockFetch(200, { number: 333, countryCode: 'ES' })
    expect(await findPhone('nimbusLookup', input)).toBe('333')

    mockFetch(200, { phoneNmbr: 444, countryCode: 'ES' })
    expect(await findPhone('nimbusLookup', input)).toBe('444')
  })

  it('returns null when the provider has no data', async () => {
    mockFetch(200, { phoneNmbr: null })
    expect(await findPhone('astraDialer', input)).toBeNull()

    mockFetch(200, {})
    expect(await findPhone('astraDialer', input)).toBeNull()
  })

  it('skips the call when required inputs are missing', async () => {
    const fetchMock = mockFetch(200, { phone: '111' })

    expect(await findPhone('orionConnect', { ...input, companyWebsite: null })).toBeNull()
    expect(await findPhone('nimbusLookup', { ...input, jobTitle: null })).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('throws a non-retryable error for 4xx and a retryable one for 5xx and 429', async () => {
    mockFetch(401, {})
    await expect(findPhone('astraDialer', input)).rejects.toBeInstanceOf(ProviderRequestError)

    mockFetch(500, {})
    const serverError = await findPhone('astraDialer', input).catch((error) => error)
    expect(serverError).not.toBeInstanceOf(ProviderRequestError)

    mockFetch(429, {})
    const rateLimited = await findPhone('astraDialer', input).catch((error) => error)
    expect(rateLimited).not.toBeInstanceOf(ProviderRequestError)
  })
})
