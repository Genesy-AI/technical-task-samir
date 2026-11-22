import { PrismaClient } from '@prisma/client'

// Single client shared by the API and Temporal activities (same process)
export const prisma = new PrismaClient()
