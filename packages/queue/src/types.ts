export enum QueueNames {
  SEO_SCRAPE = "seo-scrape",
  REVIEW_SCRAPE = "review-scrape",
}

export interface QueueConfig {
  jobOptions?: {
    attempts?: number;
    timeout?: number;
    removeOnComplete?: boolean;
    removeOnFail?: boolean;
  };
}

export interface SeoScrapeJobData {
  taskId: string;
  domainId: string;
  url: string;
  userId: string;
  options?: {
    depth?: number;
    includeSubdomains?: boolean;
  };
}

export interface ReviewScrapeJobData {
  taskId: string;
  domainId: string;
  url: string;
  userId: string;
  sources: string[];
}
