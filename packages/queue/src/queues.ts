import { createQueue } from './index';
import { QueueNames } from './types';

export const seoQueue = createQueue(QueueNames.SEO_SCRAPE);
export const reviewQueue = createQueue(QueueNames.REVIEW_SCRAPE);