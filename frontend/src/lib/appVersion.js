// Build stamp injected by vite.config.js (CI sets it per deploy, see
// .github/workflows/deploy.yml). Local dev shows "<version>-dev".
export const APP_VERSION = __APP_VERSION__;
export const APP_COMMIT = __APP_COMMIT__;
export const APP_BUILD_DATE = __APP_BUILD_DATE__;

export const appVersionLabel = `v${APP_VERSION}`;

// Hover text: version, commit and when it was built (each part optional).
export const appVersionTitle = [
  `Vireon AI ${appVersionLabel}`,
  APP_COMMIT && `commit ${APP_COMMIT}`,
  APP_BUILD_DATE && `built ${new Date(APP_BUILD_DATE).toLocaleString()}`,
]
  .filter(Boolean)
  .join(" · ");
