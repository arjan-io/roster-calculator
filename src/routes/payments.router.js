import express from "express";
import {
  deletePaymentPeriod,
  listPaymentPeriods,
  paymentPeriodDefaults,
  savePaymentPeriod
} from "../services/payment.service.js";

const router = express.Router();
router.get("/periods", (_req, res) => res.json(listPaymentPeriods()));
router.get("/periods/defaults", (_req, res) => res.json(paymentPeriodDefaults()));
router.post("/periods", (req, res, next) => {
  try { res.json(savePaymentPeriod(req.body)); } catch (error) { next(error); }
});
router.put("/periods/:id", (req, res, next) => {
  try { res.json(savePaymentPeriod({ ...req.body, id: req.params.id })); } catch (error) { next(error); }
});
router.delete("/periods/:id", (req, res, next) => {
  try { res.json(deletePaymentPeriod(req.params.id)); } catch (error) { next(error); }
});
router.use((error, _req, res, _next) => res.status(400).json({ error: error.message }));
export default router;
