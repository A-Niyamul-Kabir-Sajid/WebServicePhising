/**
 * QueueStorm Warmup - PYM_Particles
 *
 * Entry point for the Express server.
 * Deployable as a single Render Web Service.
 */

import "dotenv/config";
import path from "path";

import express, { NextFunction, Request, Response } from "express";
import cors from "cors";

import healthRouter from "./routes/health";
import sortTicketRouter from "./routes/sortTicket";

const app = express();

// Core middleware
app.use(express.json({ limit: "1mb" }));
app.use(cors());

// Static dashboard (optional convenience page served at GET /).
// Mounted before the routes/404 so / resolves to public/index.html.
app.use(express.static(path.join(__dirname, "..", "public")));

// Routes
app.use(healthRouter);
app.use(sortTicketRouter);

// JSON 404 handler for any unmatched route.
app.use((req: Request, res: Response, _next: NextFunction) => {
  if (res.headersSent) return;
  res.status(404).json({
    error: "Not Found",
    path: req.originalUrl,
  });
});

// Global JSON error handler.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  // Body-parser invalid JSON error has type 400.
  const anyErr = err as { type?: string; status?: number; message?: string };
  if (anyErr && anyErr.type === "entity.parse.failed") {
    res.status(400).json({ error: "Invalid JSON body" });
    return;
  }

  const status =
    typeof anyErr?.status === "number" && anyErr.status >= 400
      ? anyErr.status
      : 500;
  res.status(status).json({
    error: anyErr?.message || "Internal Server Error",
  });
});

const PORT = Number(process.env.PORT) || 3000;

app.listen(PORT, "0.0.0.0", () => {
  // eslint-disable-next-line no-console
  console.log(`QueueStorm Warmup API running on port ${PORT}`);
});
