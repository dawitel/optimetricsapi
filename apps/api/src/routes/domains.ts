import { Router } from "express";
import { DomainController } from "../controllers/DomainController";

const router: Router = Router();
const domainController = new DomainController();

router.post("/:domainId/:userId/analyze", domainController.analyze);

export const domainRoutes: Router = router;
