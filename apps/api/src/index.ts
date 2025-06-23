import { app } from "./server";
import { logger } from "@seo-analyzer/logging";

const port = 8080;

app.listen(port, () => {
  logger.info(`API server running on port ${port}`);
});
