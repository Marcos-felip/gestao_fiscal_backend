import { PrismaService } from '../prisma/prisma.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdateActiveCompanyDto } from './dto/update-active-company.dto';
export declare class UsersService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    getProfile(userId: string): Promise<{
        membershipsCount: number;
        name: string;
        email: string;
        id: string;
        companyActiveId: string | null;
        createdAt: Date;
        updatedAt: Date;
    }>;
    updateProfile(userId: string, dto: UpdateUserDto): Promise<{
        name: string;
        email: string;
        id: string;
        companyActiveId: string | null;
        updatedAt: Date;
    }>;
    updateActiveCompany(userId: string, dto: UpdateActiveCompanyDto): Promise<{
        name: string;
        email: string;
        id: string;
        companyActiveId: string | null;
        updatedAt: Date;
    }>;
}
