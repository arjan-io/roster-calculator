import express from "express";
import multer from "multer";
import { parseRosterFile } from "../services/parser.service.js";
import {
  commitImport,
  listImportBatches,
  previewImport,
  toPublicPreviewFlight
} from "../services/import.service.js";
import {
  createImportPreview,
  deleteImportPreview,
  getImportPreview
} from "../services/importPreviewStore.service.js";

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 }
});

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
    const previewToken = createImportPreview({
      sourceFormat: parsed.sourceFormat,
      originalFileName: req.file.originalname,
      flights: parsed.flights
    });

    res.json({
      previewToken,
      sourceFormat: parsed.sourceFormat,
      originalFileName: req.file.originalname,
      rowCount: parsed.flights.length,
      skippedBeforeCutoff: parsed.skippedBeforeCutoff,
      flights: previewImport(parsed.flights).map(toPublicPreviewFlight)
    });
  } catch (error) {
    next(error);
  }
});

router.post("/commit", express.json({ limit: "10mb" }), (req, res, next) => {
  try {
    const preview = getImportPreview(req.body.previewToken);

    if (!preview) {
      res.status(400).json({ error: "Import preview expired. Please upload the file again." });
      return;
    }

    const result = commitImport(preview);
    deleteImportPreview(req.body.previewToken);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.use((error, _req, res, _next) => {
  res.status(400).json({ error: error.message });
});

export default router;
