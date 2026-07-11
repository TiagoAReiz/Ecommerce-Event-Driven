import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { CartController } from './adapters/in/controllers/cart.controller';
import { JwtAuthGuard } from './adapters/in/controllers/guards/jwt-auth.guard';
import { DomainExceptionFilter } from './adapters/in/filters/domain-exception.filter';
import { CartService } from './application/services/cart.service';
import { TokenService } from './application/services/token.service';
import { CartRepository } from './adapters/out/repositories/cart.repository';
import { CatalogHttpClient } from './adapters/out/external/catalog-http-client';
import { CART_SERVICE } from './core/interfaces/services/cart-service.interface';
import { TOKEN_SERVICE } from './core/interfaces/services/token-service.interface';
import { CART_REPOSITORY } from './core/interfaces/repositories/cart-repository.interface';
import { CATALOG_CLIENT } from './core/interfaces/external/catalog-client.interface';

@Module({
  imports: [JwtModule.register({})],
  controllers: [CartController],
  providers: [
    { provide: CART_SERVICE, useClass: CartService },
    { provide: TOKEN_SERVICE, useClass: TokenService },
    { provide: CART_REPOSITORY, useClass: CartRepository },
    { provide: CATALOG_CLIENT, useClass: CatalogHttpClient },
    { provide: APP_FILTER, useClass: DomainExceptionFilter },
    JwtAuthGuard,
  ],
})
export class CartModule {}
