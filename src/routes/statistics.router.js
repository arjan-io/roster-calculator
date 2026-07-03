import express from "express";
import {
  deleteBaseStation,
  getStatistics,
  listBaseStations,
  saveBaseStation
} from "../services/statistics.service.js";

const router = express.Router();

router.get("/", (req, res) => res.json(getStatistics(req.query)));
router.get("/base-stations", (_req, res) => res.json(listBaseStations()));
router.post("/base-stations", (req, res, next) => {
  try { res.json(saveBaseStation(req.body)); } catch (error) { next(error); }
});
router.put("/base-stations/:id", (req, res, next) => {
  try { res.json(saveBaseStation({ ...req.body, id: req.params.id })); } catch (error) { next(error); }
});
router.delete("/base-stations/:id", (req, res, next) => {
  try { res.json(deleteBaseStation(req.params.id)); } catch (error) { next(error); }
});
router.use((error, _req, res, _next) => res.status(400).json({ error: error.message }));

export default router;
