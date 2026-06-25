import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import importsRouter from "./routes/imports.router.js";
import flightsRouter from "./routes/flights.router.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = Number(process.env.PORT || 3000);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "../public")));

app.use("/api/imports", importsRouter);
app.use("/api/flights", flightsRouter);

app.get("/", (_req, res) => {
  res.sendFile(path.join(__dirname, "../public/index.html"));
});

app.listen(port, () => {
  console.log(`Roster Calculator running at http://localhost:${port}`);
});
