import fs from "node:fs/promises";
import path from "node:path";

const DATA_DIR = path.resolve("data");

const CHECKPOINT = path.join(
  DATA_DIR,
  "series-streams-combined.import-checkpoint-lista-6.json"
);

const JSONL = path.join(
  DATA_DIR,
  "series-import-results-lista-6.jsonl"
);

const BACKUP = `${CHECKPOINT}.backup`;

async function readJSON(file) {
  return JSON.parse(await fs.readFile(file, "utf8"));
}

async function main() {
  console.log("==============================================");
  console.log(" RECONSTRUCCIÓN CHECKPOINT — LISTA 6");
  console.log("==============================================\n");

  // --------------------------------------------------
  // 1. Leer checkpoint original
  // --------------------------------------------------

  const checkpoint = await readJSON(CHECKPOINT);

  if (!checkpoint || !Array.isArray(checkpoint.results)) {
    throw new Error(
      "El checkpoint no tiene un array 'results' válido."
    );
  }

  console.log(`Resultados en checkpoint: ${checkpoint.results.length}`);
  console.log(`processed: ${checkpoint.processed}`);
  console.log(`total: ${checkpoint.total}`);

  // --------------------------------------------------
  // 2. Leer JSONL
  // --------------------------------------------------

  const jsonlText = await fs.readFile(JSONL, "utf8");

  const jsonlResults = [];

  for (const [index, rawLine] of jsonlText
    .split(/\r?\n/)
    .entries()) {

    const line = rawLine.trim();

    if (!line) continue;

    try {
      const parsed = JSON.parse(line);

      // Si el JSONL contiene objetos envueltos
      // en { result: {...} }, también lo soportamos.
      const result = parsed.result ?? parsed;

      if (
        !result ||
        typeof result !== "object" ||
        Array.isArray(result)
      ) {
        console.warn(
          `⚠️ Línea ${index + 1}: no parece un resultado válido.`
        );
        continue;
      }

      jsonlResults.push(result);

    } catch (error) {
      console.warn(
        `⚠️ Línea ${index + 1}: JSON inválido. Se ignora.`
      );
    }
  }

  console.log(`Resultados encontrados en JSONL: ${jsonlResults.length}`);

  // --------------------------------------------------
  // 3. Mostrar último resultado del checkpoint
  // --------------------------------------------------

  const lastCheckpoint =
    checkpoint.results[checkpoint.results.length - 1];

  console.log(
    `Último checkpoint: ${
      lastCheckpoint?.seriesName || "SIN NOMBRE"
    }`
  );

  // --------------------------------------------------
  // 4. Detectar duplicados
  // --------------------------------------------------

  const existingNames = new Set(
    checkpoint.results
      .map((result) => result?.seriesName)
      .filter(Boolean)
  );

  const existingKeys = new Set(
    checkpoint.results.map((result) => {
      if (result?.seriesName) {
        return `name:${result.seriesName}`;
      }

      if (result?.bestMatch?.tmdbId) {
        return `tmdb:${result.bestMatch.tmdbId}`;
      }

      return null;
    }).filter(Boolean)
  );

  const newResults = [];
  const duplicates = [];

  for (const result of jsonlResults) {
    const name = result?.seriesName;

    const keyByName = name
      ? `name:${name}`
      : null;

    const keyByTmdb =
      result?.bestMatch?.tmdbId
        ? `tmdb:${result.bestMatch.tmdbId}`
        : null;

    if (
      (keyByName && existingKeys.has(keyByName)) ||
      (keyByTmdb && existingKeys.has(keyByTmdb))
    ) {
      duplicates.push(result);
      continue;
    }

    newResults.push(result);

    if (keyByName) existingKeys.add(keyByName);
    if (keyByTmdb) existingKeys.add(keyByTmdb);

    if (name) existingNames.add(name);
  }

  console.log(`Nuevos resultados: ${newResults.length}`);
  console.log(`Duplicados descartados: ${duplicates.length}`);

  // --------------------------------------------------
  // 5. Mostrar rango que estamos reconstruyendo
  // --------------------------------------------------

  if (newResults.length > 0) {
    console.log(
      `Primer resultado nuevo: ${
        newResults[0]?.seriesName || "SIN NOMBRE"
      }`
    );

    console.log(
      `Último resultado nuevo: ${
        newResults[newResults.length - 1]?.seriesName ||
        "SIN NOMBRE"
      }`
    );
  }

  // --------------------------------------------------
  // 6. Crear backup
  // --------------------------------------------------

  console.log("\nCreando backup...");

  await fs.copyFile(CHECKPOINT, BACKUP);

  console.log(`Backup creado:`);
  console.log(BACKUP);

  // --------------------------------------------------
  // 7. Combinar
  // --------------------------------------------------

  const combinedResults = [
    ...checkpoint.results,
    ...newResults
  ];

  // --------------------------------------------------
  // 8. Crear checkpoint reconstruido
  // --------------------------------------------------

  const combined = {
    ...checkpoint,

    processed: combinedResults.length,

    // Conservamos el total original si existe.
    total:
      Number.isInteger(checkpoint.total)
        ? checkpoint.total
        : combinedResults.length,

    results: combinedResults,

    updatedAt: new Date().toISOString(),

    reconstruction: {
      performedAt: new Date().toISOString(),
      originalCheckpointResults: checkpoint.results.length,
      jsonlResults: jsonlResults.length,
      duplicatesRemoved: duplicates.length,
      newResultsAdded: newResults.length
    }
  };

  // --------------------------------------------------
  // 9. Guardar de forma atómica
  // --------------------------------------------------

  const temporary = `${CHECKPOINT}.tmp`;

  await fs.writeFile(
    temporary,
    JSON.stringify(combined, null, 2),
    "utf8"
  );

  await fs.rename(temporary, CHECKPOINT);

  // --------------------------------------------------
  // 10. Verificación final
  // --------------------------------------------------

  const verification = await readJSON(CHECKPOINT);

  console.log("\n==============================================");
  console.log(" RECONSTRUCCIÓN FINALIZADA");
  console.log("==============================================");

  console.log(
    `Resultados finales: ${verification.results.length}`
  );

  console.log(
    `processed: ${verification.processed}`
  );

  console.log(
    `total: ${verification.total}`
  );

  console.log(
    `Faltan por analizar: ${
      Math.max(
        0,
        verification.total - verification.processed
      )
    }`
  );

  console.log(
    `Última serie: ${
      verification.results.at(-1)?.seriesName ||
      "SIN NOMBRE"
    }`
  );

  console.log("\nBackup:");
  console.log(BACKUP);

  console.log("\nCheckpoint:");
  console.log(CHECKPOINT);
}

main().catch((error) => {
  console.error("\nERROR:");
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
