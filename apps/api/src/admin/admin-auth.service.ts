import {
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import { createHmac, timingSafeEqual } from "node:crypto";

const COOKIE_NAME = "visionhub_admin";
const SESSION_LIFETIME_SECONDS = 60 * 60 * 8;

type SessionPayload = { sub: string; exp: number };
type AdminCredentials = { username: string; password: string; secret: string };

@Injectable()
export class AdminAuthService {
  private getCredentials(): AdminCredentials {
    const username = process.env.ADMIN_USERNAME?.trim();
    const password = process.env.ADMIN_PASSWORD;
    const secret = process.env.ADMIN_SESSION_SECRET;
    if (!username || !password || !secret || secret.length < 32) {
      throw new ServiceUnavailableException(
        "Admin access is not configured. Set ADMIN_USERNAME, ADMIN_PASSWORD, and a random ADMIN_SESSION_SECRET of at least 32 characters.",
      );
    }
    return { username, password, secret };
  }

  login(username: string, password: string): { username: string; token: string } {
    const expected = this.getCredentials();
    if (!this.constantTimeEqual(username, expected.username) ||
        !this.constantTimeEqual(password, expected.password)) {
      throw new UnauthorizedException("用户名或密码错误。");
    }

    const payload: SessionPayload = {
      sub: expected.username,
      exp: Math.floor(Date.now() / 1000) + SESSION_LIFETIME_SECONDS,
    };
    const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
    const signature = this.sign(encoded, expected.secret);
    return { username: expected.username, token: encoded + "." + signature };
  }

  authenticateCookie(cookieHeader?: string): string | null {
    const expected = this.getCredentials();
    const token = cookieHeader
      ?.split(";")
      .map((part) => part.trim())
      .find((part) => part.startsWith(COOKIE_NAME + "="))
      ?.slice(COOKIE_NAME.length + 1);
    if (!token) return null;

    const separator = token.lastIndexOf(".");
    if (separator <= 0) return null;
    const encoded = token.slice(0, separator);
    const signature = token.slice(separator + 1);
    const expectedSignature = this.sign(encoded, expected.secret);
    if (!this.constantTimeEqual(signature, expectedSignature)) return null;

    try {
      const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as SessionPayload;
      if (payload.sub !== expected.username || !Number.isFinite(payload.exp) ||
          payload.exp <= Math.floor(Date.now() / 1000)) return null;
      return payload.sub;
    } catch {
      return null;
    }
  }

  sessionCookie(token: string): string {
    const secure = process.env.ADMIN_COOKIE_SECURE === "true" ? "; Secure" : "";
    return `${COOKIE_NAME}=${token}; Max-Age=${SESSION_LIFETIME_SECONDS}; Path=/api/v1/admin; HttpOnly; SameSite=Lax${secure}`;
  }

  clearSessionCookie(): string {
    const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
    return `${COOKIE_NAME}=; Max-Age=0; Path=/api/v1/admin; HttpOnly; SameSite=Lax${secure}`;
  }

  private sign(value: string, secret: string): string {
    return createHmac("sha256", secret).update(value).digest("base64url");
  }

  private constantTimeEqual(left: string, right: string): boolean {
    const a = Buffer.from(left);
    const b = Buffer.from(right);
    if (a.length !== b.length) {
      timingSafeEqual(a, Buffer.alloc(a.length));
      return false;
    }
    return timingSafeEqual(a, b);
  }
}
