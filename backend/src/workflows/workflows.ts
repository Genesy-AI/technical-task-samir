import { ActivityOptions, proxyActivities } from '@temporalio/workflow'
import type * as activities from './activities'
import type { PhoneEnrichmentStatus, PhoneLookupInput, PhoneProviderName } from './activities'

const { verifyEmail } = proxyActivities<typeof activities>({
  startToCloseTimeout: '1 second',
})

export async function verifyEmailWorkflow(email: string): Promise<boolean> {
  return await verifyEmail(email)
}

// Queried in this order; timeouts sized from observed latency (Orion ~4.5s, others <3s)
const PHONE_PROVIDERS: Array<{ name: PhoneProviderName; timeout: ActivityOptions['startToCloseTimeout'] }> = [
  { name: 'orionConnect', timeout: '10 seconds' },
  { name: 'astraDialer', timeout: '5 seconds' },
  { name: 'nimbusLookup', timeout: '5 seconds' },
]

const { savePhoneEnrichmentResult } = proxyActivities<typeof activities>({
  startToCloseTimeout: '10 seconds',
})

export async function enrichPhoneWorkflow(leadId: number, input: PhoneLookupInput): Promise<PhoneEnrichmentStatus> {
  let providerFailed = false

  for (const provider of PHONE_PROVIDERS) {
    const { findPhone } = proxyActivities<typeof activities>({
      startToCloseTimeout: provider.timeout,
      retry: {
        maximumAttempts: 3,
        initialInterval: '1 second',
        backoffCoefficient: 2,
        // Bad request / auth errors won't succeed on retry
        nonRetryableErrorTypes: ['ProviderRequestError'],
      },
    })

    try {
      const phone = await findPhone(provider.name, input)
      if (phone) {
        // Stop early on the first provider that has data
        await savePhoneEnrichmentResult(leadId, 'FOUND', phone)
        return 'FOUND'
      }
    } catch {
      // Provider exhausted its retries; fall through to the next one
      providerFailed = true
    }
  }

  // FAILED (retryable by the user) is distinguished from a genuine "no data found"
  const status: PhoneEnrichmentStatus = providerFailed ? 'FAILED' : 'NOT_FOUND'
  await savePhoneEnrichmentResult(leadId, status, null)
  return status
}
