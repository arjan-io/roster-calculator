import express from "express";
import multer from "multer";
import { parseRosterFile } from "../services/parser.service.js";
import { commitImport, listImportBatches, previewImport } from "../services/import.service.js";

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

router.get("/", (_req, res) => {
  res.json(listImportBatches());
});

router.post("/preview", upload.single("rosterFile"), (req, res, next) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: "No file uploaded." });
      return;
    }

    const parsed = parseRosterFile(req.file.buffer, req.file.originalname);
    res.json({
      sourceFormat: parsed.sourceFormat,
      originalFileName: req.file.originalname,
      rowCount: parsed.flights.length,
      skippedBeforeCutoff: parsed.skippedBeforeCutoff,
      flights: previewImport(parsed.flights)
    });
  } catch (error) {
    next(error);
  }
});

router.post("/commit", express.json({ limit: "10mb" }), (req, res, next) => {
  try {
    const result = commitImport(req.body);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.use((error, _req, res, _next) => {
  res.status(400).json({ error: error.message });
});

export default router;
