import { prisma } from '../../prisma'

export type PhoneEnrichmentStatus = 'PENDING' | 'FOUND' | 'NOT_FOUND' | 'FAILED'

export async function savePhoneEnrichmentResult(
  leadId: number,
  status: PhoneEnrichmentStatus,
  phoneNumber: string | null
): Promise<void> {
  await prisma.lead.update({
    where: { id: leadId },
    // Keep any existing phone when nothing new was found
    data: phoneNumber ? { phoneEnrichmentStatus: status, phoneNumber } : { phoneEnrichmentStatus: status },
  })
}
