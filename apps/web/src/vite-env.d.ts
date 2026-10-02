/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** The portal's own hostname — skips the website-domain lookup at startup. */
  readonly VITE_PORTAL_HOST?: string;
  /** The portal's URL, for the "Parent / staff login" link on a school's own website domain. */
  readonly VITE_PORTAL_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
