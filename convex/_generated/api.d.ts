/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as account from "../account.js";
import type * as articles from "../articles.js";
import type * as auth from "../auth.js";
import type * as catalog from "../catalog.js";
import type * as crons from "../crons.js";
import type * as extract from "../extract.js";
import type * as extractPages from "../extractPages.js";
import type * as feeds from "../feeds.js";
import type * as http from "../http.js";
import type * as lib_account from "../lib/account.js";
import type * as lib_appReturn from "../lib/appReturn.js";
import type * as lib_authErrors from "../lib/authErrors.js";
import type * as lib_currentUser from "../lib/currentUser.js";
import type * as lib_deleteArticles from "../lib/deleteArticles.js";
import type * as lib_feed_blocks from "../lib/feed/blocks.js";
import type * as lib_feed_discover from "../lib/feed/discover.js";
import type * as lib_feed_errors from "../lib/feed/errors.js";
import type * as lib_feed_extract from "../lib/feed/extract.js";
import type * as lib_feed_face from "../lib/feed/face.js";
import type * as lib_feed_fetch from "../lib/feed/fetch.js";
import type * as lib_feed_find from "../lib/feed/find.js";
import type * as lib_feed_http from "../lib/feed/http.js";
import type * as lib_feed_nesting from "../lib/feed/nesting.js";
import type * as lib_feed_pace from "../lib/feed/pace.js";
import type * as lib_feed_parse from "../lib/feed/parse.js";
import type * as lib_feed_prove from "../lib/feed/prove.js";
import type * as lib_feed_record from "../lib/feed/record.js";
import type * as lib_feed_store from "../lib/feed/store.js";
import type * as lib_feed_timer from "../lib/feed/timer.js";
import type * as lib_feed_typed from "../lib/feed/typed.js";
import type * as lib_feed_validators from "../lib/feed/validators.js";
import type * as lib_feedName from "../lib/feedName.js";
import type * as lib_pinned from "../lib/pinned.js";
import type * as lib_signUp from "../lib/signUp.js";
import type * as migrations from "../migrations.js";
import type * as rateLimits from "../rateLimits.js";
import type * as refresh from "../refresh.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  account: typeof account;
  articles: typeof articles;
  auth: typeof auth;
  catalog: typeof catalog;
  crons: typeof crons;
  extract: typeof extract;
  extractPages: typeof extractPages;
  feeds: typeof feeds;
  http: typeof http;
  "lib/account": typeof lib_account;
  "lib/appReturn": typeof lib_appReturn;
  "lib/authErrors": typeof lib_authErrors;
  "lib/currentUser": typeof lib_currentUser;
  "lib/deleteArticles": typeof lib_deleteArticles;
  "lib/feed/blocks": typeof lib_feed_blocks;
  "lib/feed/discover": typeof lib_feed_discover;
  "lib/feed/errors": typeof lib_feed_errors;
  "lib/feed/extract": typeof lib_feed_extract;
  "lib/feed/face": typeof lib_feed_face;
  "lib/feed/fetch": typeof lib_feed_fetch;
  "lib/feed/find": typeof lib_feed_find;
  "lib/feed/http": typeof lib_feed_http;
  "lib/feed/nesting": typeof lib_feed_nesting;
  "lib/feed/pace": typeof lib_feed_pace;
  "lib/feed/parse": typeof lib_feed_parse;
  "lib/feed/prove": typeof lib_feed_prove;
  "lib/feed/record": typeof lib_feed_record;
  "lib/feed/store": typeof lib_feed_store;
  "lib/feed/timer": typeof lib_feed_timer;
  "lib/feed/typed": typeof lib_feed_typed;
  "lib/feed/validators": typeof lib_feed_validators;
  "lib/feedName": typeof lib_feedName;
  "lib/pinned": typeof lib_pinned;
  "lib/signUp": typeof lib_signUp;
  migrations: typeof migrations;
  rateLimits: typeof rateLimits;
  refresh: typeof refresh;
  users: typeof users;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  auth: import("@convex-dev/auth/_generated/component.js").ComponentApi<"auth">;
  authGoogle: import("@convex-dev/auth/components/google/_generated/component.js").ComponentApi<"authGoogle">;
  rateLimiter: import("@convex-dev/rate-limiter/_generated/component.js").ComponentApi<"rateLimiter">;
};
