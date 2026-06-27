import express from "express";
import { listIssues } from "../services/issue.service.js";
const router = express.Router();
router.get("/", (_req, res) => res.json(listIssues()));
export default router;
