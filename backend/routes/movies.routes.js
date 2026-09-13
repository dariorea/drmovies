import express from "express"
import { 
    getMovies, 
    getMovieID, 
    getAllMovies, 
    getRecommendationsMovies,
    getMoviesByGenre
} from "../controllers/movies.controller.js"

const router = express.Router()

router.get("/", getMovies)
router.get("/all", getAllMovies)
router.get("/genre/:genreId", getMoviesByGenre);
router.get("/recommendations/:id", getRecommendationsMovies)
router.get("/:id", getMovieID)


export default router