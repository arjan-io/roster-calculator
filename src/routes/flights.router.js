import express from "express";
import { deleteFlight, getFlightSummary, listFlights } from "../services/flight.service.js";

const router = express.Router();

router.get("/", (req, res) => {
  res.json(listFlights({
    limit: req.query.limit,
    issue: req.query.issue,
    airport: req.query.airport,
    date: req.query.date
  }));
});

router.delete("/:id", (req, res, next) => {
  try { res.json(deleteFlight(req.params.id)); } catch (error) { next(error); }
});

router.get("/summary", (_req, res) => {
  res.json(getFlightSummary());
});

router.use((error, _req, res, _next) => res.status(400).json({ error: error.message }));
export default router;
