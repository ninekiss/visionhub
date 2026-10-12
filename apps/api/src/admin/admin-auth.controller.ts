import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Res,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import type { Response } from "express";
import { AdminAuthGuard } from "./admin-auth.guard.js";
import { AdminAuthService } from "./admin-auth.service.js";

@Controller("admin/auth")
export class AdminAuthController {
  constructor(@Inject(AdminAuthService) private readonly auth: AdminAuthService) {}

  @Post("login")
  @HttpCode(HttpStatus.OK)
  login(
    @Body() body: unknown,
    @Res({ passthrough: true }) response: Response,
  ): { data: { username: string } } {
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new UnauthorizedException("请输入用户名和密码。");
    }
    const values = body as Record<string, unknown>;
    if (typeof values.username !== "string" || typeof values.password !== "string") {
      throw new UnauthorizedException("请输入用户名和密码。");
    }
    const session = this.auth.login(values.username, values.password);
    response.setHeader("Set-Cookie", this.auth.sessionCookie(session.token));
    return { data: { username: session.username } };
  }

  @Post("logout")
  @HttpCode(HttpStatus.OK)
  logout(@Res({ passthrough: true }) response: Response): { data: { success: true } } {
    response.setHeader("Set-Cookie", this.auth.clearSessionCookie());
    return { data: { success: true } };
  }

  @Get("me")
  @UseGuards(AdminAuthGuard)
  me(): { data: { authenticated: true; username: string } } {
    // The guard has already validated the session. The username is intentionally
    // not read back from client-controlled input.
    return { data: { authenticated: true, username: process.env.ADMIN_USERNAME ?? "admin" } };
  }
}
