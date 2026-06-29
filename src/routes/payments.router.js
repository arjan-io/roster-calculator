import express from "express";
import {
  calculatePaymentPreview,
  deleteDeduction,
  deleteOneOffPayment,
  deletePaymentPeriod,
  listDeductions,
  listOneOffPayments,
  listPaymentPeriods,
  paymentPeriodDefaults,
  saveDeduction,
  saveOneOffPayment,
  savePaymentPeriod
} from "../services/payment.service.js";

const router = express.Router();

router.get("/calculate", (req, res, next) => {
  try { res.json(calculatePaymentPreview(req.query.month)); } catch (error) { next(error); }
});

router.get("/periods", (_req, res) => res.json(listPaymentPeriods()));
router.get("/periods/defaults", (_req, res) => res.json(paymentPeriodDefaults()));
router.post("/periods", handle((req) => savePaymentPeriod(req.body)));
router.put("/periods/:id", handle((req) => savePaymentPeriod({ ...req.body, id: req.params.id })));
router.delete("/periods/:id", handle((req) => deletePaymentPeriod(req.params.id)));

router.get("/one-offs", (_req, res) => res.json(listOneOffPayments()));
router.post("/one-offs", handle((req) => saveOneOffPayment(req.body)));
router.put("/one-offs/:id", handle((req) => saveOneOffPayment({ ...req.body, id: req.params.id })));
router.delete("/one-offs/:id", handle((req) => deleteOneOffPayment(req.params.id)));

router.get("/deductions", (_req, res) => res.json(listDeductions()));
router.post("/deductions", handle((req) => saveDeduction(req.body)));
router.put("/deductions/:id", handle((req) => saveDeduction({ ...req.body, id: req.params.id })));
router.delete("/deductions/:id", handle((req) => deleteDeduction(req.params.id)));

router.use((error, _req, res, _next) => res.status(400).json({ error: error.message }));

function handle(action) {
  return (req, res, next) => {
    try { res.json(action(req)); } catch (error) { next(error); }
  };
}

export default router;
