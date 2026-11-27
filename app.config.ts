import { execSync } from 'node:child_process';

import type { ConfigContext, ExpoConfig } from 'expo/config';

type Build = { appId: string; version: string; sha: string; dirty: boolean };

/** The Sentry release a build reports: `<app id>@<version>+<short commit>`, `-dirty` when built from uncommitted changes (FEE-135). */
export function releaseName({ appId, version, sha, dirty }: Build): string {
  return `${appId}@${version}+${sha}${dirty ? '-dirty' : ''}`;
}

/** The commit this build comes from, or undefined outside a git checkout (Sentry's default name applies then). */
function commit(): { sha: string; dirty: boolean } | undefined {
  try {
    const git = (args: string) => execSync(`git ${args}`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    return { sha: git('rev-parse --short=7 HEAD'), dirty: git('status --porcelain') !== '' };
  } catch {
    return undefined;
  }
}

/**
 * app.json passes through unchanged. Every build resolves this config before it bundles or runs Gradle, so this is
 * where the release name is worked out once: Gradle's Sentry source-map upload reads `SENTRY_RELEASE`, and the
 * bundle inlines `EXPO_PUBLIC_SENTRY_RELEASE` for `initSentry`, so maps and events share one name (T50).
 * A name already set in the environment wins.
 */
export default ({ config }: ConfigContext): ExpoConfig => {
  const appId = config.android?.package;
  const from = commit();
  if (appId && config.version && from && !process.env.SENTRY_RELEASE) {
    process.env.SENTRY_RELEASE = releaseName({ appId, version: config.version, ...from });
  }
  if (process.env.SENTRY_RELEASE && !process.env.EXPO_PUBLIC_SENTRY_RELEASE) {
    process.env.EXPO_PUBLIC_SENTRY_RELEASE = process.env.SENTRY_RELEASE;
  }
  return config as ExpoConfig;
};
