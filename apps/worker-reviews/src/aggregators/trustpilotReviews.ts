import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import { logger } from "@seo-analyzer/logging";
import { ReviewSource } from "@seo-analyzer/prisma";
import { Review } from "./googleReviews";

puppeteer.use(StealthPlugin());

export async function scrapeTrustpilotReviews(url: string): Promise<Review[]> {
  const browser = await puppeteer.launch({
    headless: "shell",
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  try {
    const page = await browser.newPage();
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
    );

    const searchUrl = `https://www.trustpilot.com/review/${new URL(url).hostname}`;
    await page.goto(searchUrl, { waitUntil: "networkidle0", timeout: 30000 });

    await page.waitForSelector(
      "article[data-service-review-card-paper='true']",
      {
        timeout: 5000,
      },
    );

    const reviews = await page.evaluate(() => {
      const reviewElements = document.querySelectorAll(
        "article[data-service-review-card-paper='true']",
      );
      return Array.from(reviewElements).map((element) => {
        const id = `${Math.random().toString(36).slice(2)}`;

        const ratingText =
          element
            .querySelector("img[alt]")
            ?.getAttribute("alt")
            ?.match(/Noté (\d) sur 5 étoiles/)?.[1] || "0";
        const rating = parseFloat(ratingText);

        const title = "";

        const previewText =
          element
            .querySelector(
              "p[data-relevant-review-text-typography='true'] span.styles_previewText__afbaG",
            )
            ?.textContent?.trim() || "";
        const truncatedText =
          element
            .querySelector(
              "p[data-relevant-review-text-typography='true'] span.styles_truncatedText__SYw6V",
            )
            ?.textContent?.trim() || "";
        const content = `${previewText} ${truncatedText}`.trim();

        const author =
          element
            .querySelector("span[data-consumer-name-typography='true']")
            ?.textContent?.trim() || "";

        const dateStr =
          element
            .querySelector("time[data-service-review-date-time-ago='true']")
            ?.getAttribute("datetime") || "";

        return {
          id,
          rating,
          title,
          content,
          author,
          date: dateStr ? new Date(dateStr) : new Date(),
          additionalData: {
            verified: false,
          },
          source: ReviewSource.TRUSTPILOT,
        };
      });
    });

    return reviews.filter((review) => review.content);
  } catch (error) {
    logger.error("Trustpilot Reviews error:", error);
    return [];
  } finally {
    await browser.close();
  }
}
