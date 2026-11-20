// Load environment variables from .env file FIRST, before anything else
import "dotenv/config";

import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";

const app = express();

declare module 'http' {
  interface IncomingMessage {
    rawBody: unknown
  }
}
app.use(express.json({
  verify: (req, _res, buf) => {
    req.rawBody = buf;
  }
}));
app.use(express.urlencoded({ extended: false }));

(async () => {
  const server = await registerRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    console.error(err);
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Render sets PORT automatically. Default to 8080 if not specified.
  // Bind to 0.0.0.0 (all interfaces) to accept external connections from Render.
  // For local development, you can set HOST=localhost if needed.
  // This serves both the API and the client.
  const port = parseInt(process.env.PORT || '8080', 10);
  // Use 0.0.0.0 by default (required for Render), allow override via HOST env var
  const host = process.env.HOST || '0.0.0.0';
  server.listen(port, host, () => {
    log(`serving on ${host}:${port}`);
  });
})();
