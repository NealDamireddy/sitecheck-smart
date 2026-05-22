import { z } from 'zod';

export const qspProfileUpdate = z.object({
  name: z.string().max(200).optional(),
  licenseNumber: z.string().max(100).optional(),
  company: z.string().max(200).optional(),
  phone: z.string().max(50).optional(),
  email: z.string().email().max(200).optional().or(z.literal('')),
});

export type QspProfileUpdate = z.infer<typeof qspProfileUpdate>;
