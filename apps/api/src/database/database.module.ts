import { Module } from "@nestjs/common";
import { AppConfigModule } from "../config/app-config.module.js";
import { PrismaService } from "./prisma.service.js";

@Module({
  imports: [AppConfigModule],
  providers: [PrismaService],
  exports: [PrismaService],
})
export class DatabaseModule {}
