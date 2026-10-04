import { SetMetadata } from '@nestjs/common';

export const ALLOW_WITHOUT_2FA = 'allowWithoutTwoFactor';

/**
 * The route stays open to someone whose school (or the platform) requires
 * two-step sign-in but who hasn't set it up yet: their profile, the set-up
 * screens and signing out. Every other route answers 403 TWO_FACTOR_SETUP_REQUIRED.
 */
export const AllowWithoutTwoFactor = () => SetMetadata(ALLOW_WITHOUT_2FA, true);
