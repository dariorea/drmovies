import fs from "fs/promises";

const FILE = "./data/movie-streams-all.json";

async function main() {
    const data = JSON.parse(
        await fs.readFile(FILE, "utf8")
    );

    const stats = {
        "lista-1": {
            total: 0,
            valid: 0,
            invalid: 0
        },
        "lista-2": {
            total: 0,
            valid: 0,
            invalid: 0
        }
    };

    const errors = {};
    const examples = [];

    for (const movie of Object.values(data)) {
        for (const stream of movie.streams ?? []) {
            const source = stream.source;

            if (!stats[source]) {
                continue;
            }

            stats[source].total++;

            if (stream.probe?.ok === true) {
                stats[source].valid++;
            } else {
                stats[source].invalid++;

                const error =
                    stream.probe?.error ??
                    "Sin descripción del error";

                errors[error] =
                    (errors[error] ?? 0) + 1;

                if (examples.length < 10) {
                    examples.push({
                        title: movie.title,
                        source,
                        error,
                        streamUrl: stream.streamUrl
                    });
                }
            }
        }
    }

    console.log("\n📊 ESTADÍSTICAS POR LISTA");

    console.table(stats);

    console.log("\n⚠️ ERRORES MÁS FRECUENTES");

    console.table(
        Object.entries(errors)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 15)
            .map(([error, cantidad]) => ({
                error,
                cantidad
            }))
    );

    console.log("\n🔎 EJEMPLOS DE STREAMS INVÁLIDOS");

    console.table(examples);
}

main().catch(console.error);