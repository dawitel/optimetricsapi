import express, { Express } from "express";
import cors from "cors";
import helmet from "helmet";
import { errorHandler } from "./middlewares/errorHandler";
import { domainRoutes } from "./routes/domains";
import { taskRoutes } from "./routes/tasks";

const app: Express = express();

// Middleware
app.use(cors());
app.use(helmet());
app.use(express.json());

// API Routes
const apiPrefix = process.env.API_PREFIX || "/api/v1";
app.use(`${apiPrefix}/domains`, domainRoutes);
app.use(`${apiPrefix}/tasks`, taskRoutes);

// Error handling
app.use(errorHandler);

export { app };
