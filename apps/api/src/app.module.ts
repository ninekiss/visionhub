import { Module } from "@nestjs/common";
import { CatalogModule } from "./catalog/catalog.module.js";

@Module({
  imports: [CatalogModule],
})
export class AppModule {}
