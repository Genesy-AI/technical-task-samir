export type LeadsEnrichPhoneInput = {
  leadIds: number[]
}

export type LeadsEnrichPhoneOutput = {
  success: boolean
  startedCount: number
  // Leads that already had a phone number
  skippedCount: number
  errors: Array<{
    leadId: number
    leadName: string
    error: string
  }>
}
