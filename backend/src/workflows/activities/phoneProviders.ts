// Provider-agnostic lead data; each provider picks the inputs it needs
export interface PhoneLookupInput {
  fullName: string
  email: string
  jobTitle: string | null
  companyWebsite: string | null
}

export type PhoneProviderName = 'orionConnect' | 'astraDialer' | 'nimbusLookup'

interface ProviderRequest {
  url: string
  headers?: Record<string, string>
  body: Record<string, unknown>
}

interface PhoneProvider {
  // Returns null when the lead lacks the inputs this provider requires
  buildRequest(input: PhoneLookupInput): ProviderRequest | null
  extractPhone(response: any): string | null
}

const BASE_URL = 'https://api.enginy.ai/api/tmp'

const providers: Record<PhoneProviderName, PhoneProvider> = {
  orionConnect: {
    buildRequest: ({ fullName, companyWebsite }) =>
      companyWebsite
        ? {
            url: `${BASE_URL}/orionConnect`,
            headers: { 'x-auth-me': process.env.ORION_CONNECT_API_KEY ?? 'mySecretKey123' },
            body: { fullName, companyWebsite },
          }
        : null,
    extractPhone: (response) => response.phone || null,
  },
  astraDialer: {
    buildRequest: ({ email }) => ({
      url: `${BASE_URL}/astraDialer`,
      headers: { apiKey: process.env.ASTRA_DIALER_API_KEY ?? '1234jhgf' },
      body: { email },
    }),
    extractPhone: (response) => response.phoneNmbr || null,
  },
  nimbusLookup: {
    buildRequest: ({ email, jobTitle }) =>
      jobTitle
        ? {
            url: `${BASE_URL}/numbusLookup?api=${process.env.NIMBUS_LOOKUP_API_KEY ?? '000099998888'}`,
            body: { email, jobTitle },
          }
        : null,
    // Docs say `number`, the live API returns `phoneNmbr`; both are numeric
    extractPhone: (response) => {
      const phone = response.number ?? response.phoneNmbr
      return phone ? String(phone) : null
    },
  },
}

// Thrown for 4xx responses; listed as non-retryable in the workflow retry policy
export class ProviderRequestError extends Error {
  name = 'ProviderRequestError'
}

export async function findPhone(providerName: PhoneProviderName, input: PhoneLookupInput): Promise<string | null> {
  const provider = providers[providerName]
  const request = provider.buildRequest(input)
  if (!request) return null

  const response = await fetch(request.url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...request.headers },
    body: JSON.stringify(request.body),
  })

  // 429 stays retryable so future rate limits back off instead of failing the lookup
  if (response.status >= 400 && response.status < 500 && response.status !== 429) {
    throw new ProviderRequestError(`${providerName} rejected the request (${response.status})`)
  }
  if (!response.ok) {
    throw new Error(`${providerName} failed (${response.status})`)
  }

  return provider.extractPhone(await response.json())
}
