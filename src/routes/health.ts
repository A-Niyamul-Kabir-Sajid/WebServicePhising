import { Router, Request, Response } from "express";

const router = Router();

/**
 * GET /health
 *
 * Simple liveness/readiness endpoint. Always returns JSON.
 */
router.get("/health", (_req: Request, res: Response) => {
  res.status(200).json({
    status: "ok",
    service: "queuestorm-warmup",
    team: "PYM_Particles",
    timestamp: new Date().toISOString(),
  });
});

export default router;