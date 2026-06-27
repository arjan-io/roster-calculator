import express from "express";
import {
  deleteAirport,
  getAirportDistance,
  listAirports,
  saveAirport
} from "../services/airport.service.js";

const router = express.Router();

router.get("/", (_req, res) => {
  res.json(listAirports());
});

router.post("/", (req, res, next) => {
  try {
    res.json(saveAirport(req.body));
  } catch (error) {
    next(error);
  }
});

router.put("/:id", (req, res, next) => {
  try {
    res.json(saveAirport({ ...req.body, id: req.params.id }));
  } catch (error) {
    next(error);
  }
});

router.delete("/:id", (req, res, next) => {
  try {
    res.json(deleteAirport(req.params.id));
  } catch (error) {
    next(error);
  }
});

router.get("/distance", (req, res, next) => {
  try {
    res.json(getAirportDistance(req.query.from, req.query.to));
  } catch (error) {
    next(error);
  }
});

router.use((error, _req, res, _next) => {
  res.status(400).json({ error: error.message });
});

export default router;
