import express from "express";
import { 
    getSerieID, 
    getSeries, 
    getRecommendationsSeries 
} from "../controllers/series.controller.js";

const router = express.Router()

router.get("/", getSeries)
router.get("/recommendations/:id", getRecommendationsSeries)
router.get("/:id", getSerieID)

export default router