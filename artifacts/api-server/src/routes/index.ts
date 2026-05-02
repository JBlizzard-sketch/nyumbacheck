import { Router, type IRouter } from "express";
import healthRouter from "./health";
import reportsRouter from "./reports";
import listingsRouter from "./listings";
import agentsRouter from "./agents";
import marketRouter from "./market";
import scammerRouter from "./scammer";

const router: IRouter = Router();

router.use(healthRouter);
router.use(reportsRouter);
router.use(listingsRouter);
router.use(agentsRouter);
router.use(marketRouter);
router.use(scammerRouter);

export default router;
