import express from "express";
import { getSeries } from "../controllers/series.controller.js";

const router = express.Router()

router.get("/", getSeries)

export default router