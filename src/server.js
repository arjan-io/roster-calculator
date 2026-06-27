import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import importsRouter from "./routes/imports.router.js";
import flightsRouter from "./routes/flights.router.js";
import airportsRouter from "./routes/airports.router.js";
import dutiesRouter from "./routes/duties.router.js";
import paymentsRouter from "./routes/payments.router.js";
import issuesRouter from "./routes/issues.router.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = Number(process.env.PORT || 3000);

app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true, limit: "2mb" }));
app.use(express.static(path.join(__dirname, "../public")));

app.use("/api/imports", importsRouter);
app.use("/api/flights", flightsRouter);
app.use("/api/airports", airportsRouter);
app.use("/api/duties", dutiesRouter);
app.use("/api/payments", paymentsRouter);
app.use("/api/issues", issuesRouter);

app.get("/", (_req, res) => {
  res.sendFile(path.join(__dirname, "../public/index.html"));
});

app.listen(port, () => {
  console.log(`Roster Calculator running at http://localhost:${port}`);
});
