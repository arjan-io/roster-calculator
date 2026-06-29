import express from "express";
import {
  deleteDutyType,
  deleteMiscDuty,
  listDutyTypes,
  listMiscDuties,
  markMiscDutyPaid,
  saveDutyType,
  saveMiscDuty
} from "../services/duty.service.js";

const router = express.Router();

router.get("/types", (_req, res) => res.json(listDutyTypes()));
router.post("/types", (req, res, next) => {
  try { res.json(saveDutyType(req.body)); } catch (error) { next(error); }
});
router.put("/types/:id", (req, res, next) => {
  try { res.json(saveDutyType({ ...req.body, id: req.params.id })); } catch (error) { next(error); }
});
router.delete("/types/:id", (req, res, next) => {
  try { res.json(deleteDutyType(req.params.id)); } catch (error) { next(error); }
});
router.get("/", (_req, res) => res.json(listMiscDuties()));

router.post("/", (req, res, next) => {
  try { res.json(saveMiscDuty(req.body)); } catch (error) { next(error); }
});
router.put("/:id", (req, res, next) => {
  try { res.json(saveMiscDuty({ ...req.body, id: req.params.id })); } catch (error) { next(error); }
});
router.patch("/:id/paid", (req, res, next) => {
  try { res.json(markMiscDutyPaid(req.params.id)); } catch (error) { next(error); }
});
router.delete("/:id", (req, res, next) => {
  try { res.json(deleteMiscDuty(req.params.id)); } catch (error) { next(error); }
});

router.use((error, _req, res, _next) => res.status(400).json({ error: error.message }));
export default router;
