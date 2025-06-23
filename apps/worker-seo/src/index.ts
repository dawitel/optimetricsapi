import { createWorker } from "@seo-analyzer/queue";
import { QueueNames } from "@seo-analyzer/queue/src/types";
import { processSeoScrape } from "./tasks/seoScrape";
import { logger } from "@seo-analyzer/logging";

const worker = createWorker(QueueNames.SEO_SCRAPE, processSeoScrape);

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
