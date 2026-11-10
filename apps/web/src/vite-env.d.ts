/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** The portal's own hostname — skips the website-domain lookup at startup. */
  readonly VITE_PORTAL_HOST?: string;
  /** The portal's URL, for the "Parent / staff login" link on a school's own website domain. */
  readonly VITE_PORTAL_URL?: string;
  /** Map tiles for live bus tracking, e.g. https://tile.openstreetmap.org/{z}/{x}/{y}.png ({s} = a/b/c subdomain). */
  readonly VITE_MAP_TILE_URL?: string;
  /** The attribution the tile provider requires, and where it links. */
  readonly VITE_MAP_ATTRIBUTION?: string;
  readonly VITE_MAP_ATTRIBUTION_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
