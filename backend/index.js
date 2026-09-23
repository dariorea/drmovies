import express from "express"
import dotenv from "dotenv"
import moviesRouter from "./routes/movies.routes.js"
import seriesRouter from "./routes/series.routes.js"
import searchRouter from "./routes/search.routes.js"
import streamRoutes from "./routes/stream.routes.js"
import channelsRouter from "./routes/channels.routes.js"
import cors from "cors"

dotenv.config()

const app = express()

app.use(cors())
app.use(express.json())

app.use("/movies", moviesRouter)
app.use("/series", seriesRouter)
app.use("/search", searchRouter)
app.use("/api", streamRoutes);
app.use("/api", channelsRouter);

const PORT = process.env.PORT || 3000

app.listen(PORT, () => {
  console.log(`Servidor en http://localhost:${PORT}`)
})