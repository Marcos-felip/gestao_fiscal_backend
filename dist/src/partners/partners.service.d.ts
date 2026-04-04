import { Partner } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePartnerDto } from './dto/create-partner.dto';
import { UpdatePartnerDto } from './dto/update-partner.dto';
import { FilterPartnerDto } from './dto/filter-partner.dto';
export declare class PartnersService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    findAll(companyId: string, filter: FilterPartnerDto): Promise<{
        data: Partner[];
        total: number;
        page: number;
        limit: number;
    }>;
    findOne(id: string, companyId: string): Promise<Partner>;
    create(companyId: string, dto: CreatePartnerDto): Promise<Partner>;
    update(id: string, companyId: string, dto: UpdatePartnerDto): Promise<Partner>;
    remove(id: string, companyId: string): Promise<void>;
}
