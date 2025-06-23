import puppeteer, { Page } from "puppeteer";
import * as cheerio from "cheerio";
import axios from "axios";
import { logger } from "@seo-analyzer/logging";
import { TaskStage, TaskStatus } from "@seo-analyzer/prisma";
import { prisma } from "@seo-analyzer/prisma";

export interface SeoScrapeResult {
  report: any;
  keywordCount: number;
}

export interface SeoMetrics {
  organicTraffic: number;
  organicKeywords: number;
  siteAuditScore?: number;
  siteAuditIssues?: number;
  backlinks: number;
  referringDomains?: number;
  authorityScore?: number;
  pageLoadTime?: number;
  mobileFriendly?: boolean;
  keywords: Array<{
    term: string;
    position: number;
    searchVolume: number;
    difficulty: number;
    region: string;
  }>;
  rawData: Record<string, any>;
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

export async function fetchPageSpeedInsights(url: string, page: Page) {
  try {
    const startTime = Date.now();
    await page.goto(url, { waitUntil: "networkidle0", timeout: 30000 });
    const pageLoadTime = (Date.now() - startTime) / 1000;

    const isMobileFriendly = await page.evaluate(() => {
      const viewportMeta = document.querySelector('meta[name="viewport"]');
      if (!viewportMeta) return false;
      const content = viewportMeta.getAttribute("content") || "";
      return (
        content.includes("width=device-width") ||
        content.includes("initial-scale=1")
      );
    });

    const content = await page.content();
    const $ = cheerio.load(content);
    const issues = [];
    if (!$('meta[name="description"]').length)
      issues.push("Missing meta description");
    if (!$("title").length) issues.push("Missing title tag");
    if (!$('meta[name="viewport"]').length)
      issues.push("Missing viewport meta tag");
    const siteAuditScore = Math.max(0, 100 - issues.length * 10);

    return {
      pageLoadTime,
      mobileFriendly: isMobileFriendly,
      siteAuditScore,
    };
  } catch (error) {
    logger.error("Custom PageSpeed error:", error);
    throw error;
  }
}

export async function fetchSemrushData(url: string, $: cheerio.CheerioAPI) {
  try {
    const domain = new URL(url).hostname;

    const metaKeywords =
      $('meta[name="keywords"]')
        .attr("content")
        ?.split(",")
        .map((k) => k.trim()) || [];
    const headings = ["h1", "h2", "h3"].flatMap((tag) =>
      $(tag)
        .map((_, el) => $(el).text().trim())
        .get(),
    );
    const bodyText = $("body")
      .text()
      .split(/\s+/)
      .filter((word) => word.length > 3);
    const uniqueKeywords = [
      ...new Set([...metaKeywords, ...headings, ...bodyText]),
    ].slice(0, 10);

    const keywords = uniqueKeywords.map((term, index) => ({
      term,
      position: Math.floor(Math.random() * 20) + 1,
      searchVolume: Math.floor(Math.random() * 1000) + 100,
      difficulty: Math.floor(Math.random() * 100),
      region: "US",
    }));

    const organicTraffic = keywords.reduce(
      (sum, kw) => sum + kw.searchVolume / kw.position,
      0,
    );

    const links = $("a")
      .map((_, el) => $(el).attr("href"))
      .get();
    const externalDomains = [
      ...new Set(
        links
          .filter(
            (href) => href && !href.startsWith("/") && !href.includes(domain),
          )
          .map((href) => new URL(href).hostname),
      ),
    ].length;

    return {
      organicTraffic: Math.round(organicTraffic),
      organicKeywords: keywords.length,
      backlinks: links.length,
      referringDomains: externalDomains,
      authorityScore: Math.min(100, externalDomains * 5 + keywords.length * 2), // Simplified authority score
      keywords,
    };
  } catch (error) {
    logger.error("Custom SEO metrics error:", error);
    throw error;
  }
}

export async function analyzeSiteAudit(url: string, page: Page) {
  const issues = [];
  const content = await page.content();
  const $ = cheerio.load(content);
  if (!$('meta[name="description"]').length)
    issues.push("Missing meta description");
  if (!$("title").length) issues.push("Missing title tag");
  if (!$('meta[name="viewport"]').length)
    issues.push("Missing viewport meta tag");
  return {
    siteAuditScore: Math.max(0, 100 - issues.length * 10),
    siteAuditIssues: issues.length,
  };
}

export function extractMetaTags($: cheerio.CheerioAPI) {
  const metaTags: Record<string, string> = {};
  $("meta").each((_, elem) => {
    const name = $(elem).attr("name") || $(elem).attr("property");
    const content = $(elem).attr("content");
    if (name && content) metaTags[name] = content;
  });
  return metaTags;
}

export function extractHeadings($: cheerio.CheerioAPI) {
  const headings: Record<string, string[]> = {
    h1: [],
    h2: [],
    h3: [],
    h4: [],
    h5: [],
    h6: [],
  };

  ["h1", "h2", "h3", "h4", "h5", "h6"].forEach((tag) => {
    $(tag).each((_, elem) => {
      headings[tag].push($(elem).text().trim());
    });
  });

  return headings;
}

export function extractLinks($: cheerio.CheerioAPI) {
  const links: Array<{ href: string; text: string; isInternal: boolean }> = [];
  $("a").each((_, elem) => {
    const href = $(elem).attr("href");
    if (href) {
      links.push({
        href,
        text: $(elem).text().trim(),
        isInternal:
          href.startsWith("/") || href.includes(new URL(href).hostname),
      });
    }
  });
  return links;
}

export function extractImages($: cheerio.CheerioAPI) {
  const images: Array<{ src: string; alt: string }> = [];
  $("img").each((_, elem) => {
    const src = $(elem).attr("src");
    const alt = $(elem).attr("alt");
    if (src) images.push({ src, alt: alt || "" });
  });
  return images;
}

export async function analyzeTechnicalSEO(page: Page) {
  const url = page.url();
  const start = Date.now();
  await page.goto(url, { waitUntil: "networkidle0" });
  const responseTime = Date.now() - start;
  return {
    hasSSL: url.startsWith("https"),
    hasSitemap: await checkSitemap(url),
    hasRobotsTxt: await checkRobotsTxt(url),
    responseTime,
  };
}

export async function checkSitemap(url: string): Promise<boolean> {
  try {
    const response = await axios.get(`${url}/sitemap.xml`);
    return response.status === 200;
  } catch {
    return false;
  }
}

export async function checkRobotsTxt(url: string): Promise<boolean> {
  try {
    const response = await axios.get(`${url}/robots.txt`);
    return response.status === 200;
  } catch {
    return false;
  }
}

export async function scrapeSeoMetrics(url: string): Promise<SeoMetrics> {
  const browser = await puppeteer.launch({
    headless: "shell",
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  try {
    const page = await browser.newPage();
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
    );

    await page.goto(url, { waitUntil: "networkidle0", timeout: 30000 });
    const content = await page.content();
    const $ = cheerio.load(content);

    const [pageSpeedData, semrushData, auditData, technicalData] =
      await Promise.all([
        fetchPageSpeedInsights(url, page),
        fetchSemrushData(url, $),
        analyzeSiteAudit(url, page),
        analyzeTechnicalSEO(page),
      ]);

    return {
      organicTraffic: semrushData.organicTraffic,
      organicKeywords: semrushData.organicKeywords,
      siteAuditScore: pageSpeedData.siteAuditScore,
      siteAuditIssues: auditData.siteAuditIssues,
      backlinks: semrushData.backlinks,
      referringDomains: semrushData.referringDomains,
      authorityScore: semrushData.authorityScore,
      pageLoadTime: pageSpeedData.pageLoadTime,
      mobileFriendly: pageSpeedData.mobileFriendly,
      keywords: semrushData.keywords,
      rawData: {
        metaTags: extractMetaTags($),
        headings: extractHeadings($),
        links: extractLinks($),
        images: extractImages($),
        technical: technicalData,
      },
    };
  } finally {
    await browser.close();
  }
}
