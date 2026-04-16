import express from "express";
import { getSerieID, getSeries } from "../controllers/series.controller.js";

const router = express.Router()

router.get("/", getSeries)
router.get("/:id", getSerieID)

export default router