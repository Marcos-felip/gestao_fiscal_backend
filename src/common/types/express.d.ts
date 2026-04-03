import { MembershipRole } from '@prisma/client';

declare global {
  namespace Express {
    interface Request {
      user?: { id: string; email: string };
      companyId?: string;
      membership?: { id: string; role: MembershipRole; companyId: string };
    }
  }
}
