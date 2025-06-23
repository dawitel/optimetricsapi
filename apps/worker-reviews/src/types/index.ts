export interface ScrapeResult {
  id: string;
  domainId: string;
  source: string;
  externalId: string | null;
  rating: number;
  title: string | null;
  content: string | null;
  authorName: string | null;
  reviewDate: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
