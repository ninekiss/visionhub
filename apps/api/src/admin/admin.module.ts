import { Module } from "@nestjs/common";
import { CatalogModule } from "../catalog/catalog.module.js";
import { DatabaseModule } from "../database/database.module.js";
import { AdminAuthController } from "./admin-auth.controller.js";
import { AdminAuthGuard } from "./admin-auth.guard.js";
import { AdminAuthService } from "./admin-auth.service.js";
import { AdminController } from "./admin.controller.js";
import { AdminService } from "./admin.service.js";

@Module({
  imports: [CatalogModule, DatabaseModule],
  controllers: [AdminAuthController, AdminController],
  providers: [AdminAuthService, AdminAuthGuard, AdminService],
})
export class AdminModule {}
