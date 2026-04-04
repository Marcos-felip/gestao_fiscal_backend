import { UsersService } from './users.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdateActiveCompanyDto } from './dto/update-active-company.dto';
export declare class UsersController {
    private readonly usersService;
    constructor(usersService: UsersService);
    getProfile(user: {
        id: string;
        email: string;
    }): Promise<{
        membershipsCount: number;
        name: string;
        email: string;
        id: string;
        companyActiveId: string | null;
        createdAt: Date;
        updatedAt: Date;
    }>;
    updateProfile(user: {
        id: string;
        email: string;
    }, dto: UpdateUserDto): Promise<{
        name: string;
        email: string;
        id: string;
        companyActiveId: string | null;
        updatedAt: Date;
    }>;
    updateActiveCompany(user: {
        id: string;
        email: string;
    }, dto: UpdateActiveCompanyDto): Promise<{
        name: string;
        email: string;
        id: string;
        companyActiveId: string | null;
        updatedAt: Date;
    }>;
}
