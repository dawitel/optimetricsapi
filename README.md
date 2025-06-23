
# Directory Structure

├── apps
│   ├── api
│   │   └── src
│   │       ├── controllers
│   │       │   ├── DomainController.ts
│   │       │   ├── ProjectController.ts
│   │       │   ├── ReportController.ts
│   │       │   ├── TaskController.ts
│   │       ├── middlewares
│   │       │   ├── errorHandler.ts
│   │       │   ├── validators.ts
│   │       ├── routes
│   │       │   ├── domains.ts
│   │       │   ├── projects.ts
│   │       │   ├── reports.ts
│   │       │   ├── tasks.ts
│   │       └── utils
│   │           ├── logger.ts
│   │       ├── index.ts
│   │       ├── server.ts
│   │   ├── package.json
│   │   ├── tsconfig.json
│   ├── worker-reviews
│   │   └── src
│   │       ├── aggregators
│   │       │   ├── googleReviews.ts
│   │       │   ├── trustpilotReviews.ts
│   │       ├── tasks
│   │       │   ├── reviewScrape.ts
│   │       ├── types
│   │       │   ├── index.ts
│   │       └── utils
│   │           ├── logger.ts
│   │       ├── index.ts
│   │   ├── package.json
│   │   ├── tsconfig.json
│   └── worker-seo
│       └── src
│           ├── scrapers
│           │   ├── seoScraper.ts
│           ├── tasks
│           │   ├── seoScrape.ts
│           └── utils
│               ├── logger.ts
│           ├── index.ts
│       ├── package.json
│       ├── tsconfig.json
└── packages
    ├── prisma
    │   ├── .env
    │   ├── client.ts
    │   ├── dev.db
    │   ├── package.json
    │   ├── schema.prisma
    │   ├── tsconfig.json
    └── queue
        └── src
            ├── index.ts
            ├── queues.ts
            ├── types.ts
        ├── .env
        ├── package.json
        ├── tsconfig.json
├── .env
├── .gitignore
├── README.md
├── package-lock.json
├── package.json
├── pnpm-lock.yaml
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── turbo.json

# End Directory Structure