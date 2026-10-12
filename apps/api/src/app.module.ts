import { Module } from "@nestjs/common";
import { AdminModule } from "./admin/admin.module.js";
import { CatalogModule } from "./catalog/catalog.module.js";

@Module({
  imports: [CatalogModule, AdminModule],
})
export class AppModule {}
