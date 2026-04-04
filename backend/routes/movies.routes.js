import express from "express"
import { getMovies, getMovieID } from "../controllers/movies.controller.js"

const router = express.Router()

router.get("/", getMovies)
router.get("/:id", getMovieID)


export default router