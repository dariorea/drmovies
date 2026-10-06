import fs from "fs/promises";

const INPUT = "./data/series-tmdb-v8-review.json";
const OUTPUT = "./data/series-tmdb-v8-hard-review.json";

const data = JSON.parse(
    await fs.readFile(INPUT, "utf8")
);

const hardReview = data
    .filter(
        item =>
            item.decision === "REVISAR" ||
            item.decision === "SIN_CANDIDATO"
    )
    .map(item => {

        const candidates = (
            item.candidates || []
        )
            .sort(
                (a, b) =>
                    b.score - a.score
            )
            .slice(0, 5)
            .map(candidate => ({
                tmdbId:
                    candidate.tmdbId,

                name:
                    candidate.name,

                originalName:
                    candidate.originalName,

                firstAirDate:
                    candidate.firstAirDate,

                score:
                    candidate.score,

                titleMatch:
                    candidate.titleMatch,

                titleMatches:
                    candidate.titleMatches,

                episodeRatio:
                    candidate.episodeRatio,

                episodePercent:
                    Math.round(
                        candidate.episodeRatio * 100
                    ),

                seasonRatio:
                    candidate.seasonRatio,

                seasonPercent:
                    Math.round(
                        candidate.seasonRatio * 100
                    ),

                exactStructure:
                    candidate.exactStructure,

                sameSeasonSet:
                    candidate.sameSeasonSet,

                m3uStructure:
                    candidate.m3uStructure,

                tmdbStructure:
                    candidate.tmdbStructure,

                tmdbTotal:
                    candidate.tmdbTotal,

                numberOfSeasons:
                    candidate.numberOfSeasons,

                numberOfEpisodes:
                    candidate.numberOfEpisodes,

                originCountry:
                    candidate.originCountry,

                networks:
                    candidate.networks,

                overview:
                    candidate.overview
            }));

        const best = candidates[0] || null;
        const second = candidates[1] || null;

        return {
            seriesName:
                item.seriesName,

            decision:
                item.decision,

            m3uYear:
                item.m3uYear || null,

            m3uTotal:
                item.m3uTotal,

            m3uStructure:
                item.m3uStructure,

            variants:
                item.variants,

            bestScore:
                best?.score ?? null,

            secondScore:
                second?.score ?? null,

            scoreDifference:
                best && second
                    ? best.score - second.score
                    : null,

            bestMatch:
                best,

            secondMatch:
                second,

            candidates
        };
    });

await fs.writeFile(
    OUTPUT,
    JSON.stringify(
        hardReview,
        null,
        2
    )
);


// ======================================================
// RESUMEN
// ======================================================

const reviewCount =
    hardReview.filter(
        x => x.decision === "REVISAR"
    ).length;

const noCandidateCount =
    hardReview.filter(
        x => x.decision === "SIN_CANDIDATO"
    ).length;


console.log(
    "======================================"
);

console.log(
    "📋 REPORTE V8"
);

console.log(
    "======================================"
);

console.log(
    `🟠 REVISAR: ${reviewCount}`
);

console.log(
    `🔴 SIN CANDIDATO: ${noCandidateCount}`
);

console.log(
    `📚 TOTAL: ${hardReview.length}`
);


// ======================================================
// CASOS MÁS CERCANOS
// ======================================================

console.log(
    "\n======================================"
);

console.log(
    "⚠️ CANDIDATOS MÁS CERCANOS"
);

console.log(
    "======================================"
);

const closeCases =
    hardReview
        .filter(
            x =>
                x.bestMatch &&
                x.secondMatch &&
                x.scoreDifference <= 10
        )
        .sort(
            (a, b) =>
                a.scoreDifference -
                b.scoreDifference
        );


for (
    const item of closeCases
) {

    console.log(
        `\n📺 ${item.seriesName}`
    );

    console.log(
        `   M3U: ${JSON.stringify(
            item.m3uStructure
        )}`
    );

    console.log(
        `   🥇 ${
            item.bestMatch.tmdbId
        } | ${
            item.bestMatch.name
        } | ${
            item.bestMatch.firstAirDate || "-"
        } | score ${
            item.bestMatch.score
        } | ${
            item.bestMatch.episodePercent
        }% eps`
    );

    console.log(
        `   🥈 ${
            item.secondMatch.tmdbId
        } | ${
            item.secondMatch.name
        } | ${
            item.secondMatch.firstAirDate || "-"
        } | score ${
            item.secondMatch.score
        } | ${
            item.secondMatch.episodePercent
        }% eps`
    );
}


// ======================================================
// CASOS CON SCORE ALTO PERO NO RESUELTOS
// ======================================================

console.log(
    "\n======================================"
);

console.log(
    "🔎 SCORE ALTO PERO REVISAR"
);

console.log(
    "======================================"
);

const highScore =
    hardReview
        .filter(
            x =>
                x.bestMatch &&
                x.bestMatch.score >= 65
        )
        .sort(
            (a, b) =>
                b.bestMatch.score -
                a.bestMatch.score
        );


for (
    const item of highScore
) {

    console.log(
        `\n📺 ${item.seriesName}`
    );

    console.log(
        `   🥇 ${
            item.bestMatch.tmdbId
        } | ${
            item.bestMatch.name
        } | ${
            item.bestMatch.firstAirDate || "-"
        } | score ${
            item.bestMatch.score
        }`
    );

    if (
        item.secondMatch
    ) {
        console.log(
            `   🥈 ${
                item.secondMatch.tmdbId
            } | ${
                item.secondMatch.name
            } | ${
                item.secondMatch.firstAirDate || "-"
            } | score ${
                item.secondMatch.score
            }`
        );
    }
}


// ======================================================
// SIN CANDIDATO
// ======================================================

console.log(
    "\n======================================"
);

console.log(
    "🔴 SIN CANDIDATO"
);

console.log(
    "======================================"
);

for (
    const item of hardReview.filter(
        x =>
            x.decision ===
            "SIN_CANDIDATO"
    )
) {

    console.log(
        `- ${item.seriesName}`
    );
}


console.log(
    `\n📄 Guardado: ${OUTPUT}`
);