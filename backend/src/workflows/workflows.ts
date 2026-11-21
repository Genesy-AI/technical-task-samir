import { proxyActivities } from '@temporalio/workflow'
import type * as activities from './activities'

// 'unknown' = verification could not complete (timeouts / exhausted retries), not an invalid address
export type EmailVerificationResult = 'valid' | 'invalid' | 'unknown'

const { verifyEmail } = proxyActivities<typeof activities>({
  // Per-attempt limit, sized for slow verification providers
  startToCloseTimeout: '3 seconds',
  // Total budget across all attempts, guarantees the activity eventually settles
  scheduleToCloseTimeout: '2 minutes',
  // Bounded retries; Temporal's default is unlimited attempts
  retry: {
    maximumAttempts: 3,
    initialInterval: '1 second',
    backoffCoefficient: 2,
  },
})

export async function verifyEmailWorkflow(email: string): Promise<EmailVerificationResult> {
  try {
    return (await verifyEmail(email)) ? 'valid' : 'invalid'
  } catch {
    return 'unknown'
  }
}
