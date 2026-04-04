import { PrismaService } from '../prisma/prisma.service';
import { InviteMemberDto } from './dto/invite-member.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
export declare class MembershipsService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    invite(companyId: string, dto: InviteMemberDto): Promise<{
        user: {
            name: string;
            email: string;
            id: string;
        };
    } & {
        id: string;
        createdAt: Date;
        updatedAt: Date;
        deletedAt: Date | null;
        companyId: string;
        userId: string;
        role: import("@prisma/client").$Enums.MembershipRole;
    }>;
    findAll(companyId: string): Promise<({
        user: {
            name: string;
            email: string;
            id: string;
        };
    } & {
        id: string;
        createdAt: Date;
        updatedAt: Date;
        deletedAt: Date | null;
        companyId: string;
        userId: string;
        role: import("@prisma/client").$Enums.MembershipRole;
    })[]>;
    updateRole(id: string, companyId: string, dto: UpdateRoleDto): Promise<{
        user: {
            name: string;
            email: string;
            id: string;
        };
    } & {
        id: string;
        createdAt: Date;
        updatedAt: Date;
        deletedAt: Date | null;
        companyId: string;
        userId: string;
        role: import("@prisma/client").$Enums.MembershipRole;
    }>;
    remove(id: string, companyId: string): Promise<void>;
}
