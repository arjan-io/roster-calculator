import express from "express";
import {
  deleteMiscDuty,
  listDutyTypes,
  listMiscDuties,
  saveMiscDuty
} from "../services/duty.service.js";

const router = express.Router();

router.get("/types", (_req, res) => res.json(listDutyTypes()));
router.get("/", (_req, res) => res.json(listMiscDuties()));

router.post("/", (req, res, next) => {
  try { res.json(saveMiscDuty(req.body)); } catch (error) { next(error); }
});
router.put("/:id", (req, res, next) => {
  try { res.json(saveMiscDuty({ ...req.body, id: req.params.id })); } catch (error) { next(error); }
});
router.delete("/:id", (req, res, next) => {
  try { res.json(deleteMiscDuty(req.params.id)); } catch (error) { next(error); }
});

router.use((error, _req, res, _next) => res.status(400).json({ error: error.message }));
export default router;
