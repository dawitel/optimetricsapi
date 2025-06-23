import { Job } from "bullmq";
import { prisma } from "@seo-analyzer/prisma";
import { ReviewScrapeJobData } from "@seo-analyzer/queue/src/types";
import { TaskStatus, TaskStage, ReviewSource } from "@seo-analyzer/prisma";
import { logger } from "@seo-analyzer/logging";
import { ScrapeResult } from "../types";
import {
  analyzeSentiment,
  Review,
  scrapeGoogleReviews,
  updateTask,
} from "../aggregators/googleReviews";
import { scrapeTrustpilotReviews } from "../aggregators/trustpilotReviews";

export async function processReviewScrape(
  job: Job<ReviewScrapeJobData>,
): Promise<ScrapeResult[]> {
  const { taskId, domainId, url, sources, userId } = job.data;
  const reviews: ScrapeResult[] = [];
  let rawReviews: Review[] = [];
  let reportId: string | null = null;

  await updateTask(
    taskId,
    TaskStatus.PROCESSING,
    TaskStage.SOURCE_IDENTIFICATION,
  );

  const stages: TaskStage[] = [
    TaskStage.SOURCE_IDENTIFICATION,
    TaskStage.SCRAPING_TRUSTPILOT,
    TaskStage.SCRAPING_GOOGLE,
    TaskStage.NORMALIZATION,
    TaskStage.AI_SENTIMENT_ANALYSIS,
    TaskStage.REVIEW_REPORT_GENERATION,
  ];

  for (const stage of stages) {
    try {
      switch (stage) {
        case TaskStage.SOURCE_IDENTIFICATION:
          if (!sources.length) {
            throw new Error("No review sources specified");
          }
          break;

        case TaskStage.SCRAPING_TRUSTPILOT:
          if (sources.includes(ReviewSource.TRUSTPILOT)) {
            rawReviews = rawReviews.concat(await scrapeTrustpilotReviews(url));
          }
          break;

        case TaskStage.SCRAPING_GOOGLE:
          if (sources.includes(ReviewSource.GOOGLE)) {
            rawReviews = rawReviews.concat(await scrapeGoogleReviews(url));
          }
          break;

        case TaskStage.NORMALIZATION:
          rawReviews = rawReviews.map((r) => ({
            ...r,
            rating: Math.min(Math.max(r.rating, 0), 5),
            content: r.content?.substring(0, 1000),
            author: r.author,
            date: r.date || new Date(),
            title: r.title?.substring(0, 255),
            id: r.id || `${Math.random().toString(36).slice(2)}`,
            additionalData: r.additionalData,
            source: r.source,
          }));
          break;

        case TaskStage.AI_SENTIMENT_ANALYSIS:
          rawReviews = await Promise.all(
            rawReviews.map(async (r) => ({
              ...r,
              additionalData: {
                ...r.additionalData,
                sentiment: r.content
                  ? await analyzeSentiment(r.content)
                  : "NEUTRAL",
              },
            })),
          );
          break;

        case TaskStage.REVIEW_REPORT_GENERATION:
          const report = await prisma.report.create({
            data: {
              type: "REVIEW",
              title: `Review Report for ${url}`,
              domainId,
              userId: userId,
            },
          });
          reportId = report.id;

          for (const review of rawReviews) {
            const stored = await prisma.review.create({
              data: {
                domainId,
                reportId,
                source: review.source,
                externalId: review.id,
                rating: review.rating,
                title: review.title,
                content: review.content,
                authorName: review.author,
                reviewDate: review.date,
                data: review.additionalData,
              },
            });
            reviews.push(stored);
          }
          break;
      }

      await updateTask(taskId, TaskStatus.PROCESSING, stage);
    } catch (error: any) {
      logger.error(`Review stage ${stage} failed:`, error);
      await updateTask(taskId, TaskStatus.FAILED, stage, error.message);
      throw error;
    }
  }

  await updateTask(taskId, TaskStatus.COMPLETED);
  return reviews;
}
