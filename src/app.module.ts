import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { CommonModule } from './common/common.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { CompaniesModule } from './companies/companies.module';
import { MembershipsModule } from './memberships/memberships.module';
import { EstablishmentsModule } from './establishments/establishments.module';
import { ProductsModule } from './products/products.module';
import { PartnersModule } from './partners/partners.module';
import { StockModule } from './stock/stock.module';
import { SalesModule } from './sales/sales.module';
import { PurchasesModule } from './purchases/purchases.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    CommonModule,
    AuthModule,
    UsersModule,
    CompaniesModule,
    MembershipsModule,
    EstablishmentsModule,
    ProductsModule,
    PartnersModule,
    StockModule,
    SalesModule,
    PurchasesModule,
  ],
})
export class AppModule {}
