import { Job } from "bullmq";
import { prisma } from "@seo-analyzer/prisma";
import { SeoScrapeJobData } from "@seo-analyzer/queue/src/types";
import { TaskStatus, TaskStage } from "@seo-analyzer/prisma";
import axios from "axios";
import { logger } from "@seo-analyzer/logging";
import {
  checkRobotsTxt,
  checkSitemap,
  scrapeSeoMetrics,
  SeoMetrics,
  SeoScrapeResult,
  updateTask,
} from "../scrapers/seoScraper";

export async function processSeoScrape(
  job: Job<SeoScrapeJobData>,
): Promise<SeoScrapeResult> {
  const { taskId, domainId, url } = job.data;
  let keywordCount = 0;

  const stages: TaskStage[] = [
    TaskStage.SITE_FINDING,
    TaskStage.TLS_SSL_CHECKS,
    TaskStage.CONFIGURATION_LOADING,
    TaskStage.SCRAPING,
    TaskStage.AI_ANALYSIS,
    TaskStage.REPORT_GENERATION,
  ];

  let seoData: SeoMetrics | null = null;
  let reportId: string | null = null;

  for (const stage of stages) {
    try {
      await updateTask(taskId, TaskStatus.PROCESSING, stage);

      switch (stage) {
        case TaskStage.SITE_FINDING:
          await axios.head(url);
          break;

        case TaskStage.TLS_SSL_CHECKS:
          if (!url.startsWith("https"))
            throw new Error("Site does not use HTTPS");
          break;

        case TaskStage.CONFIGURATION_LOADING:
          const [hasSitemap, hasRobotsTxt] = await Promise.all([
            checkSitemap(url),
            checkRobotsTxt(url),
          ]);
          if (!hasSitemap || !hasRobotsTxt) {
            logger.warn(`Sitemap: ${hasSitemap}, Robots.txt: ${hasRobotsTxt}`);
          }
          break;

        case TaskStage.SCRAPING:
          seoData = await scrapeSeoMetrics(url);
          break;

        case TaskStage.AI_ANALYSIS:
          if (!seoData) throw new Error("No SEO data for analysis");
          const aiResponse = await axios.post(
            "https://api.x.ai/v1/analyze-keywords",
            {
              keywords: seoData.keywords.map((k) => k.term),
              content: seoData.rawData,
            },
            { headers: { Authorization: `Bearer ${process.env.XAI_API_KEY}` } },
          );
          seoData.rawData.aiAnalysis = aiResponse.data;
          break;

        case TaskStage.REPORT_GENERATION:
          if (!seoData) throw new Error("No SEO data for report");
          const report = await prisma.report.create({
            data: {
              type: "SEO",
              title: `SEO Report for ${url}`,
              domainId,
              userId: job.data.userId || "system",
            },
          });
          reportId = report.id;

          const seoReport = await prisma.seoReport.create({
            data: {
              domainId,
              userId: job.data.userId || "system",
              reportId,
              organicTraffic: seoData.organicTraffic,
              organicKeywords: seoData.organicKeywords,
              siteAuditScore: seoData.siteAuditScore,
              siteAuditIssues: seoData.siteAuditIssues,
              backlinks: seoData.backlinks,
              referringDomains: seoData.referringDomains,
              authorityScore: seoData.authorityScore,
              pageLoadTime: seoData.pageLoadTime,
              mobileFriendly: seoData.mobileFriendly,
              data: seoData.rawData,
            },
          });

          for (const keyword of seoData.keywords) {
            const keywordRecord = await prisma.keyword.create({
              data: {
                domainId,
                keyword: keyword.term,
                searchVolume: keyword.searchVolume,
                keywordEfficiency: keyword.difficulty,
              },
            });

            await prisma.keywordRanking.create({
              data: {
                keywordId: keywordRecord.id,
                seoReportId: seoReport.id,
                position: keyword.position,
                region: keyword.region,
                date: new Date(),
              },
            });
            keywordCount++;
          }
          break;
      }

      await updateTask(taskId, TaskStatus.PROCESSING, stage);
    } catch (error: any) {
      logger.error(`SEO stage ${stage} failed:`, error);
      await updateTask(taskId, TaskStatus.FAILED, stage, error.message);
      throw error;
    }
  }

  await updateTask(taskId, TaskStatus.COMPLETED);
  return {
    report: await prisma.seoReport.findFirst({ where: { reportId } }),
    keywordCount,
  };
}
