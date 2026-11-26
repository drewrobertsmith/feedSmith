import { Layer } from 'effect';

import { ServerLogs } from '../log';
import { FeedHttp } from './http';

/** What every server Effect program runs on: the live network and the URL-safe logger (FEE-113). */
export const ServerLayer = Layer.mergeAll(FeedHttp.layer, ServerLogs);
