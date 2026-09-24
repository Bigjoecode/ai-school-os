import { Body, Controller, Get, HttpCode, Post, Req, Res, UnauthorizedException } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import {
  loginSchema,
  switchTenantSchema,
  type AuthResponse,
  type LoginInput,
  type MeResponse,
} from '@aischool/shared';
import { AllowNoTenant, Public } from '../common/decorators';
import { currentContext } from '../common/request-context';
import { ZodPipe } from '../common/zod.pipe';
import { AccessService } from './access.service';
import { AuthService, type IssuedSession } from './auth.service';
import { REFRESH_COOKIE, refreshCookieOptions } from './tokens';

function clientInfo(req: Request) {
  return {
    ip: req.ip,
    userAgent: req.headers['user-agent'],
    host: (req.headers['x-forwarded-host'] as string | undefined) ?? req.headers.host,
  };
}

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly access: AccessService,
  ) {}

  @Public()
  @Post('login')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async login(
    @Body(new ZodPipe(loginSchema)) body: LoginInput,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponse> {
    return this.send(res, await this.auth.login(body, clientInfo(req)));
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<AuthResponse> {
    try {
      return this.send(res, await this.auth.refresh(req.cookies?.[REFRESH_COOKIE], clientInfo(req)));
    } catch (err) {
      res.clearCookie(REFRESH_COOKIE, { ...refreshCookieOptions(), maxAge: undefined });
      throw err;
    }
  }

  @Public()
  @Post('logout')
  @HttpCode(204)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    await this.auth.logout(req.cookies?.[REFRESH_COOKIE]);
    res.clearCookie(REFRESH_COOKIE, { ...refreshCookieOptions(), maxAge: undefined });
  }

  @AllowNoTenant()
  @Get('me')
  async me(): Promise<MeResponse> {
    const ctx = currentContext();
    const me = await this.access.me(ctx.userId!, ctx.tenantId ?? null);
    if (!me) throw new UnauthorizedException();
    return me;
  }

  @AllowNoTenant()
  @Post('switch-tenant')
  @HttpCode(200)
  async switchTenant(
    @Body(new ZodPipe(switchTenantSchema)) body: { tenantId: string },
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponse> {
    const family = await this.auth.familyOf(req.cookies?.[REFRESH_COOKIE]);
    const issued = await this.auth.switchTenant(currentContext().userId!, body.tenantId, family, clientInfo(req));
    return this.send(res, issued);
  }

  private send(res: Response, issued: IssuedSession): AuthResponse {
    res.cookie(REFRESH_COOKIE, issued.refreshToken, refreshCookieOptions());
    return issued.response;
  }
}
