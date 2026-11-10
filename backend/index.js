import express from "express";
import dotenv from "dotenv";

import moviesRouter from "./routes/movies.routes.js";
import seriesRouter from "./routes/series.routes.js";
import searchRouter from "./routes/search.routes.js";
import streamRoutes from "./routes/stream.routes.js";

import cors from "cors";

import {
    initializeSeriesCatalog,
} from "./services/seriesCatalog.service.js";

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

app.use("/movies", moviesRouter);
app.use("/series", seriesRouter);
app.use("/search", searchRouter);
app.use("/api", streamRoutes);

const PORT = process.env.PORT || 3000;

// ======================================================
// INICIO DEL SERVIDOR
// ======================================================

async function startServer() {
    try {
        // Cargar el catálogo antes de aceptar solicitudes.
        await initializeSeriesCatalog();

        app.listen(PORT, () => {
            console.log(`Servidor en http://localhost:${PORT}`);
        });

    } catch (error) {
        console.error(
            "❌ No se pudo inicializar el catálogo de series:"
        );

        console.error(error);

        process.exit(1);
    }
}

startServer();