/** /dev/components is on in development, and in production only with SHOW_DEV_PAGES=true. */
export function devPagesEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.NODE_ENV !== "production" || env.SHOW_DEV_PAGES === "true";
}
