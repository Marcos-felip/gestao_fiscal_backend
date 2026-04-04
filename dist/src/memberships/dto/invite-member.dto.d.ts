import { MembershipRole } from '@prisma/client';
export declare class InviteMemberDto {
    email: string;
    role?: MembershipRole;
}
