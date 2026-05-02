import { Router, type IRouter } from "express";
import healthRouter from "./health";
import reportsRouter from "./reports";
import listingsRouter from "./listings";
import agentsRouter from "./agents";
import marketRouter from "./market";
import scammerRouter from "./scammer";
import paymentsRouter from "./payments";
import stripeRouter from "./stripe";
import adminRouter from "./admin";

const router: IRouter = Router();

router.use(healthRouter);
router.use(reportsRouter);
router.use(listingsRouter);
router.use(agentsRouter);
router.use(marketRouter);
router.use(scammerRouter);
router.use("/payments", paymentsRouter);
router.use("/payments", stripeRouter);
router.use(adminRouter);

export default router;
