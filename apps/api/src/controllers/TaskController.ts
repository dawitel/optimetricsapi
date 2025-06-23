import { Request, Response } from "express";
import { prisma, TaskType, TaskStatus } from "@seo-analyzer/prisma";
import { seoQueue, reviewQueue } from "@seo-analyzer/queue/src/queues";
import { logger } from "@seo-analyzer/logging";
import {
  isSeoScrapePayload,
  isReviewScrapePayload,
} from "../types/taskPayload";

export class TaskController {
  async retry(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const task = await prisma.task.findUnique({
        where: { id },
        include: { domain: true },
      });

      if (!task) {
        return res.status(404).json({
          success: false,
          message: "Task not found",
          data: null,
        });
      }

      if (task.status !== TaskStatus.FAILED) {
        return res.status(400).json({
          success: false,
          message: "Only failed tasks can be retried",
          data: null,
        });
      }

      const updatedTask = await prisma.task.update({
        where: { id },
        data: {
          status: TaskStatus.PENDING,
          retryCount: { increment: 1 },
        },
      });

      if (task.type === TaskType.SEO_SCRAPE) {
        if (!isSeoScrapePayload(task.payload)) {
          throw new Error("Invalid SEO scrape payload");
        }
        await seoQueue.add("analyze", {
          taskId: task.id,
          domainId: task.domainId,
          url: task.payload.url,
        });
      } else if (task.type === TaskType.REVIEW_SCRAPE) {
        if (!isReviewScrapePayload(task.payload)) {
          throw new Error("Invalid review scrape payload");
        }
        await reviewQueue.add("aggregate", {
          taskId: task.id,
          domainId: task.domainId,
          url: task.payload.url,
          sources: task.payload.sources,
        });
      }

      res.json({
        success: true,
        message: "Task retry initiated successfully",
        data: updatedTask,
      });
    } catch (error) {
      logger.error("Error retrying task:", error);
      res.status(500).json({
        success: false,
        message: "Failed to retry task",
        data: null,
      });
    }
  }
}
