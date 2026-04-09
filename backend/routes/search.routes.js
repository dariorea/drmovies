import express from "express";
import { searchItem } from "../controllers/movies.controller.js";

const router = express.Router()

router.get("/movie", searchItem)

export default router