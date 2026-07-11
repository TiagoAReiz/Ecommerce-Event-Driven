import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ScheduleModule } from '@nestjs/schedule';
import { CategoriesController } from './adapters/in/controllers/categories.controller';
import { SellersController } from './adapters/in/controllers/sellers.controller';
import { ProductsController } from './adapters/in/controllers/products.controller';
import { VariantsController } from './adapters/in/controllers/variants.controller';
import { JwtAuthGuard } from './adapters/in/controllers/guards/jwt-auth.guard';
import { DomainExceptionFilter } from './adapters/in/filters/domain-exception.filter';
import { CategoryService } from './application/services/category.service';
import { SellerService } from './application/services/seller.service';
import { ProductService } from './application/services/product.service';
import { TokenService } from './application/services/token.service';
import { OutboxRelayService } from './application/services/outbox-relay.service';
import { KafkaEventPublisher } from './adapters/out/external/kafka-event-publisher';
import { CategoryRepository } from './adapters/out/repositories/category.repository';
import { SellerRepository } from './adapters/out/repositories/seller.repository';
import { ProductRepository } from './adapters/out/repositories/product.repository';
import { ProductVariantRepository } from './adapters/out/repositories/product-variant.repository';
import { OutboxEventRepository } from './adapters/out/repositories/outbox-event.repository';
import { CATEGORY_SERVICE } from './core/interfaces/services/category-service.interface';
import { SELLER_SERVICE } from './core/interfaces/services/seller-service.interface';
import { PRODUCT_SERVICE } from './core/interfaces/services/product-service.interface';
import { TOKEN_SERVICE } from './core/interfaces/services/token-service.interface';
import { CATEGORY_REPOSITORY } from './core/interfaces/repositories/category-repository.interface';
import { SELLER_REPOSITORY } from './core/interfaces/repositories/seller-repository.interface';
import { PRODUCT_REPOSITORY } from './core/interfaces/repositories/product-repository.interface';
import { PRODUCT_VARIANT_REPOSITORY } from './core/interfaces/repositories/product-variant-repository.interface';
import { OUTBOX_EVENT_REPOSITORY } from './core/interfaces/repositories/outbox-event-repository.interface';
import { EVENT_PUBLISHER } from './core/interfaces/external/event-publisher.interface';

@Module({
  imports: [ScheduleModule.forRoot(), JwtModule.register({})],
  controllers: [CategoriesController, SellersController, ProductsController, VariantsController],
  providers: [
    { provide: CATEGORY_SERVICE, useClass: CategoryService },
    { provide: SELLER_SERVICE, useClass: SellerService },
    { provide: PRODUCT_SERVICE, useClass: ProductService },
    { provide: TOKEN_SERVICE, useClass: TokenService },
    { provide: CATEGORY_REPOSITORY, useClass: CategoryRepository },
    { provide: SELLER_REPOSITORY, useClass: SellerRepository },
    { provide: PRODUCT_REPOSITORY, useClass: ProductRepository },
    { provide: PRODUCT_VARIANT_REPOSITORY, useClass: ProductVariantRepository },
    { provide: OUTBOX_EVENT_REPOSITORY, useClass: OutboxEventRepository },
    { provide: EVENT_PUBLISHER, useClass: KafkaEventPublisher },
    { provide: APP_FILTER, useClass: DomainExceptionFilter },
    OutboxRelayService,
    JwtAuthGuard,
  ],
})
export class CatalogModule {}
