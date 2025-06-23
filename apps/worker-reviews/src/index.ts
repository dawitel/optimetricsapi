import { createWorker } from "@seo-analyzer/queue";
import { QueueNames } from "@seo-analyzer/queue/src/types";
import { processReviewScrape } from "./tasks/reviewScrape";
import { logger } from "@seo-analyzer/logging";

const worker = createWorker(QueueNames.REVIEW_SCRAPE, processReviewScrape);

worker.on("completed", (job) => {
  logger.info(`Job ${job.id} completed successfully`);
});

worker.on("failed", (job, err) => {
  logger.error(`Job ${job?.id} failed:`, err);
});

process.on("SIGTERM", async () => {
  await worker.close();
  process.exit(0);
});
