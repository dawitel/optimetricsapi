import { Queue, Worker, Job, QueueEvents } from "bullmq";
import IORedis from "ioredis";
import { QueueNames, QueueConfig } from "./types";

const createRedisConnection = () => {
  return new IORedis({
    host: process.env.REDIS_HOST || "localhost",
    port: parseInt(process.env.REDIS_PORT || "6379"),
    password: process.env.REDIS_PASSWORD,
    maxRetriesPerRequest: null,
  });
};

export const createQueue = (name: QueueNames, config?: QueueConfig) => {
  const connection = createRedisConnection();

  new QueueEvents(name, { connection });

  return new Queue(name, {
    connection,
    defaultJobOptions: {
      attempts: parseInt(process.env.RETRY_ATTEMPTS || "3"),
      backoff: {
        type: "exponential",
        delay: 1000,
      },
      removeOnComplete: false,
      removeOnFail: false,
      timeout: parseInt(process.env.JOB_TIMEOUT || "60000"),
      ...config?.jobOptions,
    },
  });
};

export const createWorker = <T, R>(
  queueName: QueueNames,
  processFunction: (job: Job<T>) => Promise<R>,
  concurrency = parseInt(process.env.WORKER_CONCURRENCY || "2"),
) => {
  const connection = createRedisConnection();

  return new Worker<T, R>(queueName, processFunction, {
    connection,
    concurrency,
    autorun: true,
  });
};
