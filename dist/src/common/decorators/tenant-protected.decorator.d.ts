import { MembershipRole } from '@prisma/client';
export declare function TenantProtected(...roles: MembershipRole[]): <TFunction extends Function, Y>(target: TFunction | object, propertyKey?: string | symbol, descriptor?: TypedPropertyDescriptor<Y>) => void;
