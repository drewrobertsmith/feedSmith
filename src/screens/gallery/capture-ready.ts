/**
 * How a world in capture mode tells the visual check it's ready (FEE-121): one log line, read from logcat,
 * naming the check's shot and the picture (`<world>-<theme>`). Shared by the gallery and the check's script.
 */
export const READY_PREFIX = 'visual-check ready';

export function readyLine(shot: string, picture: string): string {
  return `${READY_PREFIX} ${shot} ${picture}`;
}

/** A shot comes from a link, so it's untrusted (Q25): only a plain number is one. */
export function isShot(value: unknown): value is string {
  return typeof value === 'string' && /^\d{1,20}$/.test(value);
}
