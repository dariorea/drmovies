import express from "express"
import { getMovies, getMovieID, getAllMovies } from "../controllers/movies.controller.js"

const router = express.Router()

router.get("/", getMovies)
router.get("/all", getAllMovies)
router.get("/:id", getMovieID)


export default router