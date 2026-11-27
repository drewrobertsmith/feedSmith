/**
 * Which build is installed, for the Account sheet's last line (FEE-140): the version, then whatever the build's Sentry
 * release name carries after its `+` (the commit today, T50; a build number if releases move to EAS). A development
 * build says `dev`, since under Fast Refresh its code drifts from any one commit.
 */
export function buildLine({ release, version, dev }: { release: string | undefined; version: string; dev: boolean }) {
  const [, named] = release?.match(/@([^@+]+)(?:\+(.+))?$/) ?? [];
  const build = dev ? 'dev' : release?.split('+')[1];
  return `feedSmith ${named ?? version}${build ? ` · ${build}` : ''}`;
}
