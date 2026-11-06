import { describe, expect, it } from "vitest";

import { devPagesEnabled } from "./devPages";

describe("/dev/components switch", () => {
  it.each([
    [{ NODE_ENV: "development" }, true],
    [{ NODE_ENV: "test" }, true],
    [{ NODE_ENV: "production" }, false],
    [{ NODE_ENV: "production", SHOW_DEV_PAGES: "false" }, false],
    [{ NODE_ENV: "production", SHOW_DEV_PAGES: "1" }, false],
    [{ NODE_ENV: "production", SHOW_DEV_PAGES: "true" }, true],
  ])("%o -> %s", (env, enabled) => {
    expect(devPagesEnabled(env as unknown as NodeJS.ProcessEnv)).toBe(enabled);
  });
});
