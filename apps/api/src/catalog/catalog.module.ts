import { Module } from "@nestjs/common";
import { AppConfigModule } from "../config/app-config.module.js";
import { DatabaseModule } from "../database/database.module.js";
import { CatalogController } from "./catalog.controller.js";
import { CatalogService } from "./catalog.service.js";

@Module({
  imports: [AppConfigModule, DatabaseModule],
  controllers: [CatalogController],
  providers: [CatalogService],
  exports: [CatalogService],
})
export class CatalogModule {}
