import express from "express";
import { 
    getSerieID, 
    getSeries, 
    getRecommendationsSeries,
    getSeriesByGenre,
    getDiscover
} from "../controllers/series.controller.js";
import {
    getSeriesStream
} from "../controllers/seriesStream.controller.js";

const router = express.Router()

router.get("/", getSeries)
router.get("/discover", getDiscover)
router.get("/genre/:genreId", getSeriesByGenre);
router.get("/recommendations/:id", getRecommendationsSeries)
router.get("/:id", getSerieID)
router.get(
    "/:id/stream",
    getSeriesStream
);

export default router