import { Body, Controller, Get, HttpCode, Post, Req, Res, UnauthorizedException } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import {
  changePasswordSchema,
  loginSchema,
  switchTenantSchema,
  twoFactorLoginSchema,
  type AuthResponse,
  type ChangePasswordInput,
  type ChangePasswordResponse,
  type LoginInput,
  type MeResponse,
  type TwoFactorChallengeResponse,
  type TwoFactorLoginInput,
} from '@aischool/shared';
import { AllowNoTenant, Public } from '../common/decorators';
import { currentContext } from '../common/request-context';
import { ZodPipe } from '../common/zod.pipe';
import { AccessService } from './access.service';
import { AuthService, type IssuedSession } from './auth.service';
import { PasswordService } from './password.service';
import { REFRESH_COOKIE, refreshCookieOptions } from './tokens';
import { AllowWithoutTwoFactor } from './two-factor.decorator';

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
    private readonly passwords: PasswordService,
  ) {}

  @Public()
  @Post('login')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async login(
    @Body(new ZodPipe(loginSchema)) body: LoginInput,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponse | TwoFactorChallengeResponse> {
    const result = await this.auth.login(body, clientInfo(req));
    if ('twoFactorRequired' in result) return result;
    return this.send(res, result);
  }

  /** Second step of sign-in: the challenge from /auth/login plus a code (or a recovery code). */
  @Public()
  @Post('2fa')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 5 * 60_000 } })
  async twoFactor(
    @Body(new ZodPipe(twoFactorLoginSchema)) body: TwoFactorLoginInput,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponse> {
    return this.send(res, await this.auth.completeTwoFactor(body, clientInfo(req)));
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
    const bearer = req.headers.authorization?.match(/^Bearer (.+)$/i)?.[1];
    await this.auth.logout(req.cookies?.[REFRESH_COOKIE], bearer);
    res.clearCookie(REFRESH_COOKIE, { ...refreshCookieOptions(), maxAge: undefined });
  }

  @AllowNoTenant()
  @AllowWithoutTwoFactor()
  @Get('me')
  async me(): Promise<MeResponse> {
    const ctx = currentContext();
    const me = await this.access.me(ctx.userId!, ctx.tenantId ?? null);
    if (!me) throw new UnauthorizedException();
    return me;
  }

  /**
   * Change my password: needs the current one. Every other device is signed
   * out; this one stays signed in. Also how someone whose password an admin
   * reset chooses their own (everything else is closed until then).
   */
  @AllowNoTenant()
  @AllowWithoutTwoFactor()
  @Post('password')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 15 * 60_000 } })
  changePassword(@Body(new ZodPipe(changePasswordSchema)) body: ChangePasswordInput): Promise<ChangePasswordResponse> {
    const ctx = currentContext();
    return this.passwords.changeOwn({ userId: ctx.userId!, sessionId: ctx.sessionId, tenantId: ctx.tenantId ?? null }, body);
  }

  @AllowNoTenant()
  @AllowWithoutTwoFactor()
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
