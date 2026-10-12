import { CanActivate, ExecutionContext, Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import type { Request } from "express";
import { AdminAuthService } from "./admin-auth.service.js";

@Injectable()
export class AdminAuthGuard implements CanActivate {
  constructor(@Inject(AdminAuthService) private readonly auth: AdminAuthService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const username = this.auth.authenticateCookie(request.headers.cookie);
    if (!username) throw new UnauthorizedException("请先登录管理后台。");
    return true;
  }
}
