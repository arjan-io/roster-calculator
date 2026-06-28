import express from "express";
import { getFlightSummary, listFlights } from "../services/flight.service.js";

const router = express.Router();

router.get("/", (req, res) => {
  res.json(listFlights({
    limit: req.query.limit,
    issue: req.query.issue,
    airport: req.query.airport
  }));
});

router.get("/summary", (_req, res) => {
  res.json(getFlightSummary());
});

export default router;
