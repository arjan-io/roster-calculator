import express from "express";
import { getFlightSummary, listFlights } from "../services/flight.service.js";

const router = express.Router();

router.get("/", (req, res) => {
  const limit = Number(req.query.limit || 100);
  res.json(listFlights({ limit }));
});

router.get("/summary", (_req, res) => {
  res.json(getFlightSummary());
});

export default router;
