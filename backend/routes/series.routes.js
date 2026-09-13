import express from "express";
import { 
    getSerieID, 
    getSeries, 
    getRecommendationsSeries,
    getSeriesByGenre
} from "../controllers/series.controller.js";

const router = express.Router()

router.get("/", getSeries)
router.get("/genre/:genreId", getSeriesByGenre);
router.get("/recommendations/:id", getRecommendationsSeries)
router.get("/:id", getSerieID)

export default router