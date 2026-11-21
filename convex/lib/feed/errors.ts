import { Schema } from 'effect';

/** Why adding or fetching a Feed failed. Each maps to one message the app shows. */
export class InvalidUrl extends Schema.TaggedError<InvalidUrl>()('InvalidUrl', {}) {}
export class Unreachable extends Schema.TaggedError<Unreachable>()('Unreachable', {}) {}
export class Timeout extends Schema.TaggedError<Timeout>()('Timeout', {}) {}
export class TooLarge extends Schema.TaggedError<TooLarge>()('TooLarge', {}) {}
export class NotAFeed extends Schema.TaggedError<NotAFeed>()('NotAFeed', {}) {}

export type FetchError = InvalidUrl | Unreachable | Timeout | TooLarge;
