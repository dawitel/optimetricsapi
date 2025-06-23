import { Router } from "express";
import { TaskController } from "../controllers/TaskController";

const router: Router = Router();
const taskController = new TaskController();

router.post("/:id/retry", taskController.retry);

export const taskRoutes: Router = router;
