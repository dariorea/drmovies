import express from "express"
import dotenv from "dotenv"
import moviesRouter from "./routes/movies.routes.js"
import seriesRouter from "./routes/series.routes.js"
import cors from "cors"

dotenv.config()

const app = express()

app.use(cors())
app.use(express.json())

//app.get("/api", (req, res) => {
//  res.send({mensaje: "hilq"})
//})

app.use("/movies", moviesRouter)
app.use("/series", seriesRouter)

app.listen(3000, () => {
  console.log("Servidor en http://localhost:3000")
})