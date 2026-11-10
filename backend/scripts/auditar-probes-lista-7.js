import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const catalogPath = path.join(
  __dirname,
  '../data/movie-streams-all.json'
);

const outputPath = path.join(
  __dirname,
  '../data/auditoria-lista-7.json'
);

console.log('\n======================================');
console.log(' AUDITORÍA DE PROBES — LISTA 7');
console.log(' SOLO LECTURA');
console.log('======================================\n');

const catalog = JSON.parse(
  fs.readFileSync(catalogPath, 'utf8')
);

const stats = {
  total: 0,
  validos: 0,
  invalidos: 0,
  sinProbe: 0,
  errores: {},
  peliculas: 0
};

const details = [];

for (const [tmdbId, movie] of Object.entries(catalog)) {
  if (!movie || !Array.isArray(movie.streams)) continue;

  for (const stream of movie.streams) {
    if (stream.source !== 'lista-7') continue;

    stats.total++;

    const probe = stream.probe;

    if (probe?.ok === true) {
      stats.validos++;
      continue;
    }

    if (!probe) {
      stats.sinProbe++;
      continue;
    }

    stats.invalidos++;

    const error = probe.error || 'Error desconocido';

    let category = 'OTRO';

    if (/403|forbidden|access denied/i.test(error)) {
      category = 'HTTP_403';
    } else if (/404|not found/i.test(error)) {
      category = 'HTTP_404';
    } else if (/401|unauthorized/i.test(error)) {
      category = 'HTTP_401';
    } else if (/429|too many requests/i.test(error)) {
      category = 'HTTP_429';
    } else if (/500|502|503|504/i.test(error)) {
      category = 'HTTP_5XX';
    } else if (
      /resolve hostname|name or service not known|temporary failure in name resolution/i.test(error)
    ) {
      category = 'DNS';
    } else if (
      /timed out|timeout|rw_timeout/i.test(error)
    ) {
      category = 'TIMEOUT';
    } else if (
      /connection refused|connection reset|network is unreachable/i.test(error)
    ) {
      category = 'CONEXION';
    } else if (
      /end of file|error reading header|invalid data/i.test(error)
    ) {
      category = 'ARCHIVO_INVALIDO';
    }

    stats.errores[category] =
      (stats.errores[category] || 0) + 1;

    details.push({
      tmdbId,
      title: movie.title,
      category,
      error: error.slice(-500)
    });
  }
}

stats.peliculas = new Set(
  details.map(item => item.tmdbId)
).size;

const report = {
  fecha: new Date().toISOString(),
  fuente: 'lista-7',
  estadisticas: stats,
  detalles: details
};

fs.writeFileSync(
  outputPath,
  JSON.stringify(report, null, 2)
);

console.log('TOTAL STREAMS:', stats.total);
console.log('VÁLIDOS:', stats.validos);
console.log('INVÁLIDOS:', stats.invalidos);
console.log('SIN PROBE:', stats.sinProbe);

console.log('\n=== CLASIFICACIÓN DE ERRORES ===');

for (const [category, count] of Object.entries(stats.errores)) {
  const percentage = stats.invalidos
    ? (count / stats.invalidos * 100).toFixed(2)
    : '0.00';

  console.log(
    `${category}: ${count} (${percentage}%)`
  );
}

console.log('\nPelículas afectadas:', stats.peliculas);
console.log('\nReporte guardado en:');
console.log(outputPath);

console.log('\n======================================\n');