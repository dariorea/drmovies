
import fs from "fs/promises";

const INPUT_FILE =
    "./data/series-lista-6-clean-matches.json";

const OUTPUT_FILE =
    "./data/series-lista-6-clean-matches-reviewed.json";

function normalizeTitle(title) {
    return String(title || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "");
}

function getVariants(title) {
    return String(title || "")
        .split("/")
        .map(x => normalizeTitle(x.trim()))
        .filter(Boolean);
}

function exactPrimaryMatch(seriesName, candidate) {
    const variants = getVariants(seriesName);

    return [
        candidate?.name,
        candidate?.originalName
    ]
        .filter(Boolean)
        .some(title => variants.includes(normalizeTitle(title)));
}

function getCandidates(item) {
    const candidates = item.candidates || [];

    if (candidates.length) {
        return candidates;
    }

    return [
        item.bestMatch,
        item.secondMatch
    ].filter(Boolean);
}

async function main() {
    const results = JSON.parse(
        await fs.readFile(INPUT_FILE, "utf8")
    );

    let upgraded = 0;
    let stillReview = 0;

    for (const item of results) {
        // No modificar las decisiones ya clasificadas.
        if (item.decision !== "REVISAR") {
            continue;
        }

        const candidates = getCandidates(item);

        const best =
            item.bestMatch ||
            candidates[0] ||
            null;

        if (!best) {
            stillReview++;
            continue;
        }

        const bestIsExact =
            exactPrimaryMatch(item.seriesName, best);

        // Verificar si otro candidato también coincide
        // exactamente con el título principal.
        const competingExact = candidates.some(candidate =>
            candidate.tmdbId !== best.tmdbId &&
            exactPrimaryMatch(item.seriesName, candidate) &&
            candidate.score >= best.score - 12
        );

        // Solo promover a fuerte cuando el título coincide
        // exactamente, la estructura está marcada como exacta
        // y no hay otro candidato exacto competitivo.
        if (
            bestIsExact &&
            best.exactStructure === true &&
            best.score >= 95 &&
            !competingExact
        ) {
            item.previousDecision = item.decision;
            item.decision = "MATCH_FUERTE";
            item.reviewNote =
                "Promovido localmente: título principal exacto, " +
                "estructura idéntica y sin candidato exacto competitivo.";

            upgraded++;
        } else {
            stillReview++;
        }
    }

    await fs.writeFile(
        OUTPUT_FILE,
        JSON.stringify(results, null, 2),
        "utf8"
    );

    const stats = {};

    for (const item of results) {
        stats[item.decision] =
            (stats[item.decision] || 0) + 1;
    }

    console.log("\n======================================");
    console.log("REVISIÓN LOCAL TERMINADA");
    console.log("======================================");
    console.log("Series procesadas:", results.length);
    console.log("Promovidas a MATCH_FUERTE:", upgraded);
    console.log("Que siguen en REVISAR:", stillReview);
    console.log("\nEstadísticas finales:");
    console.table(stats);
    console.log("\nArchivo nuevo:", OUTPUT_FILE);
    console.log("El archivo original no fue modificado.");
}

main().catch(error => {
    console.error("Error:", error);
    process.exit(1);
});