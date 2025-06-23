import { Request, Response } from "express";
import { prisma, TaskType, TaskStatus, TaskStage } from "@seo-analyzer/prisma";
import { seoQueue, reviewQueue } from "@seo-analyzer/queue/src/queues";
import { logger } from "@seo-analyzer/logging";

export class DomainController {
  async analyze(req: Request, res: Response) {
    try {
      const { domainId, userId } = req.params;
      const domain = await prisma.domain.findUnique({
        where: { id: domainId },
      });

      if (!domain) {
        return res.status(404).json({
          success: false,
          message: "Domain not found",
          data: null,
        });
      }

      const seoTask = await prisma.task.create({
        data: {
          type: TaskType.SEO_SCRAPE,
          stage: TaskStage.SITE_FINDING,
          status: TaskStatus.PENDING,
          domainId: domainId,
          payload: { url: domain.url },
          priority: 0,
          maxRetries: 3,
        },
      });

      const reviewTask = await prisma.task.create({
        data: {
          type: TaskType.REVIEW_SCRAPE,
          stage: TaskStage.SOURCE_IDENTIFICATION,
          status: TaskStatus.PENDING,
          domainId: domainId,
          payload: {
            url: domain.url,
            sources: ["TRUSTPILOT", "GOOGLE"],
          },
          priority: 0,
          maxRetries: 3,
        },
      });

      await seoQueue.add("analyze", {
        taskId: seoTask.id,
        domainId: domainId,
        url: domain.url,
        userId: userId,
      });

      await reviewQueue.add("aggregate", {
        taskId: reviewTask.id,
        domainId: domainId,
        url: domain.url,
        sources: ["TRUSTPILOT", "GOOGLE"],
        userId: userId,
      });

      logger.info(
        `Analysis started successfully for user ${userId} and review task ${reviewTask.id} and seo task ${seoTask.id} domain ${domain.url}`,
      );

      res.json({
        success: true,
        message: "Analysis started successfully",
        data: { tasks: [seoTask, reviewTask] },
      });
    } catch (error) {
      logger.error("Error starting analysis:", error);
      res.status(500).json({
        success: false,
        message: "Failed to start analysis",
        data: null,
      });
    }
  }
}
