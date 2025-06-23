import { logger } from "@seo-analyzer/logging";
import { ReviewSource, TaskStage, TaskStatus } from "@seo-analyzer/prisma";
import OpenAI from "openai";
import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import { prisma } from "@seo-analyzer/prisma";

puppeteer.use(StealthPlugin());

export interface Review {
  id: string;
  rating: number;
  title: string;
  content: string;
  author: string;
  date: Date;
  additionalData: Record<string, any>;
  source: ReviewSource;
}
export async function scrapeGoogleReviews(
  websiteUrl: string,
): Promise<Review[]> {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();

  try {
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36",
    );
    await page.setViewport({ width: 1280, height: 800 });

    const domain = new URL(websiteUrl).hostname.replace("www.", "");
    logger.info(`Extracted domain: ${domain}`);

    const searchUrl = `https://www.google.com/maps/search/${encodeURIComponent(domain)}`;
    logger.info(`Searching Google Maps: ${searchUrl}`);
    await page.goto(searchUrl, { waitUntil: "networkidle2", timeout: 30000 });

    await page.waitForSelector('div[role="main"] a[href^="/place/"]', {
      timeout: 15000,
    });
    const placeUrl = await page.$eval(
      'div[role="main"] a[href^="/place/"]',
      (el) => {
        return `https://www.google.com${el.getAttribute("href")}`;
      },
    );
    logger.info(`Found place URL: ${placeUrl}`);

    await page.goto(placeUrl, { waitUntil: "networkidle2", timeout: 30000 });

    logger.info("Opening reviews dialog");
    await page.waitForSelector(
      'button[jsaction="pane.reviewChart.moreReviews"]',
      { timeout: 10000 },
    );
    await page.click('button[jsaction="pane.reviewChart.moreReviews"]');

    await page.waitForSelector(
      'div[role="dialog"] div.section-layout.section-scrollbox',
      { timeout: 10000 },
    );

    const reviewsSelector =
      'div[role="dialog"] div.section-layout.section-scrollbox > div > div';
    let reviews: Review[] = [];
    let previousHeight: number;
    let attempts = 0;
    const maxAttempts = 5;

    logger.info("Scraping reviews");
    while (attempts < maxAttempts) {
      const newReviews = await page.$$eval(reviewsSelector, (nodes) =>
        nodes
          .map((node) => {
            const author =
              node.querySelector(".d4r55")?.textContent?.trim() || "Anonymous";
            const ratingText =
              node
                .querySelector('span[aria-label*="stars"]')
                ?.getAttribute("aria-label") || "0";
            const ratingMatch = ratingText.match(/(\d)/);
            const rating = ratingMatch ? parseInt(ratingMatch[1]) : 0;
            const text =
              node.querySelector(".MyEned")?.textContent?.trim() || "";
            const dateText =
              node.querySelector(".dehysf")?.textContent?.trim() || "";

            return {
              author,
              rating,
              text,
              dateText,
              nodeId:
                node.getAttribute("data-node-index") ||
                Math.random().toString(36).slice(2),
            };
          })
          .filter((r) => r.text),
      );

      for (const r of newReviews) {
        if (!reviews.some((existing) => existing.id === r.nodeId)) {
          reviews.push({
            id: r.nodeId,
            rating: Math.min(Math.max(r.rating || 0, 0), 5),
            title: "",
            content: r.text.substring(0, 1000),
            author: r.author,
            date: parseGoogleReviewDate(r.dateText),
            additionalData: {
              originalDateText: r.dateText,
            },
            source: ReviewSource.GOOGLE,
          });
        }
      }

      const scrollBox = await page.$(
        'div[role="dialog"] div.section-layout.section-scrollbox',
      );
      if (!scrollBox) {
        logger.warn("Scroll box not found, stopping review collection");
        break;
      }

      previousHeight = await page.evaluate(
        (el) => el?.scrollTop ?? 0,
        scrollBox,
      );
      await page.evaluate((el) => {
        el?.scrollBy(0, 1000);
      }, scrollBox);
      await new Promise((resolve) => setTimeout(resolve, 2000));

      const newHeight = await page.evaluate(
        (el) => el?.scrollTop ?? 0,
        scrollBox,
      );
      if (newHeight === previousHeight) {
        attempts++;
        logger.info(
          `No new reviews loaded, attempt ${attempts}/${maxAttempts}`,
        );
      } else {
        attempts = 0;
      }
    }

    logger.info(`Found ${reviews.length} reviews`);
    return reviews;
  } catch (error: any) {
    logger.error(
      `Google Reviews scraping error for ${websiteUrl}:`,
      error.message,
    );
    return [];
  } finally {
    await browser
      .close()
      .catch((e) => logger.error("Error closing browser:", e));
  }
}

function parseGoogleReviewDate(dateText: string): Date {
  const relativeMatch = dateText.match(
    /(\d+)\s+(day|week|month|year)s?\s+ago/i,
  );
  if (relativeMatch) {
    const value = parseInt(relativeMatch[1]);
    const unit = relativeMatch[2].toLowerCase();
    const now = new Date();

    switch (unit) {
      case "day":
        return new Date(now.setDate(now.getDate() - value));
      case "week":
        return new Date(now.setDate(now.getDate() - value * 7));
      case "month":
        return new Date(now.setMonth(now.getMonth() - value));
      case "year":
        return new Date(now.setFullYear(now.getFullYear() - value));
    }
  }

  const absoluteDate = new Date(dateText);
  if (!isNaN(absoluteDate.getTime())) return absoluteDate;

  return new Date();
}

export async function analyzeSentiment(content: string): Promise<string> {
  const apiKey = process.env.AIML_API_KEY;
  if (!apiKey) {
    logger.error("AIML API key is missing");
    return "NEUTRAL";
  }

  try {
    const api = new OpenAI({
      apiKey,
      baseURL: "https://api.aimlapi.com/v1",
    });

    const systemPrompt =
      "You are a sentiment analysis expert. Analyze the provided review text and classify its sentiment as 'POSITIVE', 'NEGATIVE', or 'NEUTRAL'. Return only the sentiment label in uppercase.";
    const userPrompt = `Review text: "${content}"`;

    logger.info("Sending sentiment analysis request to AIML API");
    const completion = await api.chat.completions.create({
      model: "mistralai/Mistral-7B-Instruct-v0.2",
      messages: [
        {
          role: "system",
          content: systemPrompt,
        },
        {
          role: "user",
          content: userPrompt,
        },
      ],
      temperature: 0.7,
      max_tokens: 10,
    });

    const sentiment = completion.choices[0]?.message.content
      ?.trim()
      .toUpperCase() as string;
    if (["POSITIVE", "NEGATIVE", "NEUTRAL"].includes(sentiment)) {
      logger.info(`Sentiment analysis result: ${sentiment}`);
      return sentiment;
    } else {
      logger.warn(`Invalid sentiment response: ${sentiment}`);
      return "NEUTRAL";
    }
  } catch (error: any) {
    logger.error("Sentiment analysis error:", error.message);
    return "NEUTRAL";
  }
}
export async function updateTask(
  taskId: string,
  status: TaskStatus,
  stage?: TaskStage,
  error?: string,
) {
  await prisma.task.update({
    where: { id: taskId },
    data: {
      status,
      stage,
      processingAt: status === TaskStatus.PROCESSING ? new Date() : undefined,
      completedAt: status === TaskStatus.COMPLETED ? new Date() : undefined,
      lastError: error,
    },
  });
}
