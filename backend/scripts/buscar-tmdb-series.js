/**
 * buscar-tmdb-series.js
 *
 * Lee:
 *   data/series-m3u-structural-lista-1.json
 *
 * Genera:
 *   data/series-m3u-tmdb-lista-1.json
 *   data/series-m3u-tmdb-lista-1-revision.json
 *
 * NO modifica el JSON original.
 *
 * Requisitos:
 *   - Node.js 18+
 *   - TMDB_API_KEY en .env
 *
 * Uso:
 *   node scripts/buscar-tmdb-series.js
 */

 import "dotenv/config";
 import fs from "fs";
 import path from "path";
 import { fileURLToPath } from "url";
 
 // ============================================================
 // ESM — __dirname
 // ============================================================
 
 const __filename = fileURLToPath(import.meta.url);
 const __dirname = path.dirname(__filename);
 
 // ============================================================
 // ARCHIVOS
 // ============================================================
 
 const INPUT_FILE = path.join(
   __dirname,
   "../data/series-m3u-structural-lista-1.json"
 );
 
 const OUTPUT_FILE = path.join(
   __dirname,
   "../data/series-m3u-tmdb-lista-1.json"
 );
 
 const REVIEW_FILE = path.join(
   __dirname,
   "../data/series-m3u-tmdb-lista-1-revision.json"
 );
 
 // ============================================================
 // TMDB
 // ============================================================
 
 const TMDB_API_KEY = process.env.TMDB_API_KEY;
 
 const TMDB_BASE_URL =
   "https://api.themoviedb.org/3";
 
 // Idiomas utilizados para buscar títulos.
 // Primero español y luego idiomas que suelen ayudar
 // con títulos originales.
 const LANGUAGE_PRIORITY = [
   "es-ES",
   "es-MX",
   "es-AR",
   "en-US",
   "ko-KR",
   "ja-JP"
 ];
 
 // Espera entre peticiones.
 // Ayuda a no golpear TMDB demasiado rápido.
 const REQUEST_DELAY = 250;
 
 // Puntuación mínima para considerar una coincidencia fuerte.
 const MIN_ACCEPTED_SCORE = 70;
 
 // Diferencia mínima entre primer y segundo candidato
 // para aceptar automáticamente cuando ambos son buenos.
 const MIN_SCORE_DIFFERENCE = 8;
 
 const fsPromises = fs.promises;
 
 // ============================================================
 // UTILIDADES
 // ============================================================
 
 function sleep(ms) {
   return new Promise(resolve =>
     setTimeout(resolve, ms)
   );
 }
 
 // ------------------------------------------------------------
 // NORMALIZAR TEXTO
 // ------------------------------------------------------------
 
 function normalizeText(text) {
   if (!text) return "";
 
   return String(text)
     .normalize("NFD")
     .replace(/[\u0300-\u036f]/g, "")
     .toLowerCase()
     .replace(/&/g, " y ")
     .replace(/['’"`]/g, "")
     .replace(/[()[\]{}:;,!?¡¿./\\|_-]+/g, " ")
     .replace(/\s+/g, " ")
     .trim();
 }
 
 // ------------------------------------------------------------
 // LIMPIAR NOMBRE DE SERIE
 // ------------------------------------------------------------
 
 function cleanSeriesName(name) {
   if (!name) return "";
 
   return String(name)
     // S01 E01
     .replace(
       /\s*S\d{1,3}\s*E\d{1,4}\s*$/i,
       ""
     )
 
     // S01E01
     .replace(
       /\s*S\d{1,3}E\d{1,4}\s*$/i,
       ""
     )
 
     .trim();
 }
 
 // ------------------------------------------------------------
 // TOKENS
 // ------------------------------------------------------------
 
 function tokenize(text) {
   return normalizeText(text)
     .split(" ")
     .filter(Boolean);
 }
 
 // ------------------------------------------------------------
 // UNIQUE
 // ------------------------------------------------------------
 
 function unique(array) {
   return [...new Set(array)];
 }
 
 // ------------------------------------------------------------
 // INTERSECCIÓN
 // ------------------------------------------------------------
 
 function intersectionCount(a, b) {
   const setB = new Set(b);
 
   return a.filter(token =>
     setB.has(token)
   ).length;
 }
 
 // ------------------------------------------------------------
 // SIMILITUD POR TOKENS
 // ------------------------------------------------------------
 
 function tokenSimilarity(a, b) {
   const aa = tokenize(a);
   const bb = tokenize(b);
 
   if (!aa.length || !bb.length) {
     return 0;
   }
 
   const common =
     intersectionCount(aa, bb);
 
   const precision =
     common / aa.length;
 
   const recall =
     common / bb.length;
 
   if (precision + recall === 0) {
     return 0;
   }
 
   return (
     (2 * precision * recall) /
     (precision + recall)
   );
 }
 
 // ------------------------------------------------------------
 // LEVENSHTEIN
 // ------------------------------------------------------------
 
 function levenshtein(a, b) {
   a = normalizeText(a);
   b = normalizeText(b);
 
   if (a === b) return 0;
 
   if (!a.length) return b.length;
   if (!b.length) return a.length;
 
   const previous =
     new Array(b.length + 1);
 
   for (
     let j = 0;
     j <= b.length;
     j++
   ) {
     previous[j] = j;
   }
 
   for (
     let i = 1;
     i <= a.length;
     i++
   ) {
     const current = [i];
 
     for (
       let j = 1;
       j <= b.length;
       j++
     ) {
       const insert =
         current[j - 1] + 1;
 
       const remove =
         previous[j] + 1;
 
       const replace =
         previous[j - 1] +
         (
           a[i - 1] === b[j - 1]
             ? 0
             : 1
         );
 
       current[j] =
         Math.min(
           insert,
           remove,
           replace
         );
     }
 
     for (
       let j = 0;
       j <= b.length;
       j++
     ) {
       previous[j] =
         current[j];
     }
   }
 
   return previous[b.length];
 }
 
 // ------------------------------------------------------------
 // SIMILITUD DE CADENA
 // ------------------------------------------------------------
 
 function stringSimilarity(a, b) {
   const aa = normalizeText(a);
   const bb = normalizeText(b);
 
   if (!aa || !bb) return 0;
 
   if (aa === bb) return 1;
 
   const maxLength =
     Math.max(
       aa.length,
       bb.length
     );
 
   if (!maxLength) return 1;
 
   return (
     1 -
     levenshtein(aa, bb) /
       maxLength
   );
 }
 
 // ============================================================
 // TMDB REQUEST
 // ============================================================
 
 async function tmdbRequest(
   endpoint,
   params = {}
 ) {
   if (!TMDB_API_KEY) {
     throw new Error(
       "Falta TMDB_API_KEY en .env"
     );
   }
 
   const url =
     new URL(
       `${TMDB_BASE_URL}${endpoint}`
     );
 
   url.searchParams.set(
     "api_key",
     TMDB_API_KEY
   );
 
   for (
     const [key, value]
     of Object.entries(params)
   ) {
     if (
       value !== undefined &&
       value !== null &&
       value !== ""
     ) {
       url.searchParams.set(
         key,
         String(value)
       );
     }
   }
 
   const response =
     await fetch(url);
 
   if (!response.ok) {
     const text =
       await response.text();
 
     throw new Error(
       `TMDB ${response.status}: ${text.slice(
         0,
         300
       )}`
     );
   }
 
   return response.json();
 }
 
 // ============================================================
 // BÚSQUEDA TMDB
 // ============================================================
 
 async function searchTmdbSeries(
   query
 ) {
   const results = [];
   const seenIds = new Set();
 
   for (
     const language
     of LANGUAGE_PRIORITY
   ) {
     try {
       const data =
         await tmdbRequest(
           "/search/tv",
           {
             query,
             language,
             include_adult: false
           }
         );
 
       for (
         const item
         of data.results || []
       ) {
         if (!item.id) {
           continue;
         }
 
         if (
           seenIds.has(item.id)
         ) {
           continue;
         }
 
         seenIds.add(item.id);
 
         results.push({
           ...item,
           searchLanguage:
             language
         });
       }
 
       await sleep(
         REQUEST_DELAY
       );
     } catch (error) {
       console.log(
         `   ⚠️ Error buscando "${query}" [${language}]: ${error.message}`
       );
     }
   }
 
   return results;
 }
 
 // ============================================================
 // SCORE
 // ============================================================
 
 function scoreCandidate(
   sourceName,
   candidate
 ) {
   const names =
     unique(
       [
         candidate.name,
         candidate.original_name
       ].filter(Boolean)
     );
 
   let best = 0;
   let bestType = "NONE";
 
   for (
     const candidateName
     of names
   ) {
     // --------------------------------------------------------
     // EXACTO
     // --------------------------------------------------------
 
     const exact =
       normalizeText(
         sourceName
       ) ===
       normalizeText(
         candidateName
       );
 
     if (exact) {
       best = Math.max(
         best,
         100
       );
 
       bestType = "EXACT";
 
       continue;
     }
 
     // --------------------------------------------------------
     // TOKENS
     // --------------------------------------------------------
 
     const tokenScore =
       tokenSimilarity(
         sourceName,
         candidateName
       ) * 100;
 
     if (
       tokenScore > best
     ) {
       best = tokenScore;
       bestType = "TOKENS";
     }
 
     // --------------------------------------------------------
     // STRING
     // --------------------------------------------------------
 
     const stringScore =
       stringSimilarity(
         sourceName,
         candidateName
       ) * 100;
 
     if (
       stringScore > best
     ) {
       best = stringScore;
       bestType = "STRING";
     }
   }
 
   return {
     score: Math.round(best),
     matchType: bestType
   };
 }
 
 // ============================================================
 // ESTRUCTURA LOCAL
 // ============================================================
 
 function getStructureStats(
   series
 ) {
   let seasons = 0;
   let episodes = 0;
 
   for (
     const season
     of Object.values(
       series.seasons || {}
     )
   ) {
     seasons++;
 
     episodes +=
       Object.keys(
         season.episodes || {}
       ).length;
   }
 
   return {
     seasons,
     episodes
   };
 }
 
 // ============================================================
 // POSTER
 // ============================================================
 
 function getFirstEpisodePoster(
   series
 ) {
   for (
     const season
     of Object.values(
       series.seasons || {}
     )
   ) {
     for (
       const episode
       of Object.values(
         season.episodes || {}
       )
     ) {
       if (episode.poster) {
         return episode.poster;
       }
     }
   }
 
   return null;
 }
 
 // ============================================================
 // PROCESAR UNA SERIE
 // ============================================================
 
 async function processSeries(
   seriesKey,
   series,
   index,
   total
 ) {
   const originalName =
     series.name ||
     seriesKey;
 
   const cleanName =
     cleanSeriesName(
       originalName
     );
 
   console.log(
     `\n[${index}/${total}] ${originalName}`
   );
 
   console.log(
     `   🔎 Buscando: "${cleanName}"`
   );
 
   // ----------------------------------------------------------
   // BUSCAR EN TMDB
   // ----------------------------------------------------------
 
   const candidates =
     await searchTmdbSeries(
       cleanName
     );
 
   if (!candidates.length) {
     console.log(
       "   ❌ No se encontraron resultados"
     );
 
     return {
       status: "NO_RESULT",
 
       series: {
         ...series,
 
         tmdbId: null,
 
         tmdb: null,
 
         tmdbMatch: {
           score: 0,
           matchType: "NO_RESULT",
           differenceWithSecond: null,
           searchedName: cleanName
         }
       },
 
       review: {
         seriesKey,
         name: originalName,
 
         normalizedName:
           normalizeText(
             cleanName
           ),
 
         reason:
           "NO_RESULT",
 
         candidates: []
       }
     };
   }
 
   // ----------------------------------------------------------
   // PUNTUAR CANDIDATOS
   // ----------------------------------------------------------
 
   const scored =
     candidates
       .map(candidate => {
         const score =
           scoreCandidate(
             cleanName,
             candidate
           );
 
         return {
           candidate,
           ...score
         };
       })
       .sort((a, b) => {
         if (
           b.score !== a.score
         ) {
           return (
             b.score -
             a.score
           );
         }
 
         return (
           (b.candidate
             .popularity || 0) -
           (a.candidate
             .popularity || 0)
         );
       });
 
   const best =
     scored[0];
 
   const second =
     scored[1];
 
   // ----------------------------------------------------------
   // MOSTRAR CANDIDATOS
   // ----------------------------------------------------------
 
   console.log(
     `   🥇 ${best.candidate.name} → TMDB ${best.candidate.id} → ${best.score} puntos`
   );
 
   if (second) {
     console.log(
       `   🥈 ${second.candidate.name} → TMDB ${second.candidate.id} → ${second.score} puntos`
     );
   }
 
   const bestScore =
     best.score;
 
   const secondScore =
     second?.score ?? 0;
 
   const difference =
     bestScore -
     secondScore;
 
   // ----------------------------------------------------------
   // DETERMINAR MATCH
   // ----------------------------------------------------------
 
   const strongMatch =
     bestScore >=
     MIN_ACCEPTED_SCORE;
 
   const ambiguous =
     strongMatch &&
     second &&
     difference <
       MIN_SCORE_DIFFERENCE &&
     normalizeText(
       best.candidate.name
     ) !==
       normalizeText(
         second.candidate.name
       );
 
   // ----------------------------------------------------------
   // MATCH DÉBIL O AMBIGUO
   // ----------------------------------------------------------
 
   if (
     !strongMatch ||
     ambiguous
   ) {
     console.log(
       ambiguous
         ? "   ⚠️ MATCH AMBIGUO"
         : "   ⚠️ COINCIDENCIA DÉBIL"
     );
 
     return {
       status: ambiguous
         ? "AMBIGUOUS"
         : "WEAK_MATCH",
 
       series: {
         ...series,
 
         tmdbId: null,
 
         tmdb: {
           bestCandidate: {
             id:
               best.candidate.id,
 
             name:
               best.candidate.name,
 
             originalName:
               best.candidate
                 .original_name ||
               null,
 
             firstAirDate:
               best.candidate
                 .first_air_date ||
               null,
 
             posterPath:
               best.candidate
                 .poster_path ||
               null,
 
             score:
               bestScore
           }
         },
 
         tmdbMatch: {
           score: bestScore,
 
           matchType:
             best.matchType,
 
           differenceWithSecond:
             difference,
 
           searchedName:
             cleanName
         }
       },
 
       review: {
         seriesKey,
 
         name:
           originalName,
 
         normalizedName:
           normalizeText(
             cleanName
           ),
 
         reason:
           ambiguous
             ? "AMBIGUOUS"
             : "WEAK_MATCH",
 
         bestCandidate: {
           id:
             best.candidate.id,
 
           name:
             best.candidate.name,
 
           originalName:
             best.candidate
               .original_name ||
             null,
 
           score:
             bestScore
         },
 
         candidates:
           scored
             .slice(0, 10)
             .map(item => ({
               id:
                 item.candidate.id,
 
               name:
                 item.candidate.name,
 
               originalName:
                 item.candidate
                   .original_name ||
                 null,
 
               firstAirDate:
                 item.candidate
                   .first_air_date ||
                 null,
 
               popularity:
                 item.candidate
                   .popularity ||
                 0,
 
               score:
                 item.score,
 
               matchType:
                 item.matchType
             }))
       }
     };
   }
 
   // ----------------------------------------------------------
   // OBTENER DETALLE TMDB
   // ----------------------------------------------------------
 
   let details = null;
 
   try {
     details =
       await tmdbRequest(
         `/tv/${best.candidate.id}`,
         {
           language:
             "es-ES"
         }
       );
 
     await sleep(
       REQUEST_DELAY
     );
   } catch (error) {
     console.log(
       `   ⚠️ No se pudo obtener detalle TMDB: ${error.message}`
     );
   }
 
   // ----------------------------------------------------------
   // ESTADÍSTICAS LOCALES
   // ----------------------------------------------------------
 
   const structure =
     getStructureStats(
       series
     );
 
   // ----------------------------------------------------------
   // POSTER
   // ----------------------------------------------------------
 
   const poster =
     series.poster ||
     getFirstEpisodePoster(
       series
     );
 
   // ----------------------------------------------------------
   // SERIE ENRIQUECIDA
   // ----------------------------------------------------------
 
   const enrichedSeries = {
     ...series,
 
     // --------------------------------------------------------
     // TMDB ID
     // --------------------------------------------------------
 
     tmdbId:
       best.candidate.id,
 
     // --------------------------------------------------------
     // INFORMACIÓN TMDB
     // --------------------------------------------------------
 
     tmdb: {
       id:
         best.candidate.id,
 
       name:
         details?.name ||
         best.candidate.name,
 
       originalName:
         details?.original_name ||
         best.candidate
           .original_name ||
         null,
 
       overview:
         details?.overview ||
         null,
 
       firstAirDate:
         details?.first_air_date ||
         best.candidate
           .first_air_date ||
         null,
 
       lastAirDate:
         details?.last_air_date ||
         null,
 
       posterPath:
         details?.poster_path ||
         best.candidate
           .poster_path ||
         null,
 
       backdropPath:
         details?.backdrop_path ||
         null,
 
       voteAverage:
         details?.vote_average ??
         best.candidate
           .vote_average ??
         null,
 
       voteCount:
         details?.vote_count ??
         best.candidate
           .vote_count ??
         null,
 
       popularity:
         details?.popularity ??
         best.candidate
           .popularity ??
         null,
 
       numberOfSeasons:
         details?.number_of_seasons ??
         null,
 
       numberOfEpisodes:
         details?.number_of_episodes ??
         null,
 
       genres:
         details?.genres?.map(
           genre => ({
             id: genre.id,
             name: genre.name
           })
         ) || []
     },
 
     // --------------------------------------------------------
     // MATCH
     // --------------------------------------------------------
 
     tmdbMatch: {
       score:
         bestScore,
 
       matchType:
         best.matchType,
 
       differenceWithSecond:
         difference,
 
       searchedName:
         cleanName
     },
 
     // --------------------------------------------------------
     // ESTADÍSTICAS
     // --------------------------------------------------------
 
     stats: {
       ...(series.stats || {}),
 
       localSeasons:
         structure.seasons,
 
       localEpisodes:
         structure.episodes,
 
       tmdbSeasons:
         details?.number_of_seasons ??
         null,
 
       tmdbEpisodes:
         details?.number_of_episodes ??
         null
     },
 
     // --------------------------------------------------------
     // POSTER
     // --------------------------------------------------------
 
     poster,
 
     posterPath:
       details?.poster_path ||
       best.candidate
         .poster_path ||
       null
   };
 
   console.log(
     `   ✅ MATCH → TMDB ${best.candidate.id}`
   );
 
   if (details) {
     console.log(
       `   📺 TMDB: ${details.name}`
     );
 
     console.log(
       `   🎬 Temporadas: ${details.number_of_seasons ?? "?"}`
     );
 
     console.log(
       `   🎞️ Episodios: ${details.number_of_episodes ?? "?"}`
     );
   }
 
   return {
     status: "MATCH",
 
     series:
       enrichedSeries,
 
     review: null
   };
 }
 
 // ============================================================
 // MAIN
 // ============================================================
 
 async function main() {
   console.log(
     "=============================================="
   );
 
   console.log(
     " BÚSQUEDA TMDB — SERIES DESDE JSON ESTRUCTURAL"
   );
 
   console.log(
     "=============================================="
   );
 
   // ----------------------------------------------------------
   // API KEY
   // ----------------------------------------------------------
 
   if (!TMDB_API_KEY) {
     console.error(
       "\n❌ Falta TMDB_API_KEY en .env"
     );
 
     console.error(
       "Ejemplo:"
     );
 
     console.error(
       "TMDB_API_KEY=tu_api_key"
     );
 
     process.exit(1);
   }
 
   // ----------------------------------------------------------
   // COMPROBAR INPUT
   // ----------------------------------------------------------
 
   if (
     !fs.existsSync(
       INPUT_FILE
     )
   ) {
     console.error(
       `\n❌ No existe:\n${INPUT_FILE}`
     );
 
     process.exit(1);
   }
 
   // ----------------------------------------------------------
   // LEER JSON
   // ----------------------------------------------------------
 
   let data;
 
   try {
     data =
       JSON.parse(
         await fsPromises.readFile(
           INPUT_FILE,
           "utf8"
         )
       );
   } catch (error) {
     console.error(
       "\n❌ Error leyendo JSON:",
       error.message
     );
 
     process.exit(1);
   }
 
   // ----------------------------------------------------------
   // VALIDAR ESTRUCTURA
   // ----------------------------------------------------------
 
   if (
     !data ||
     typeof data !== "object"
   ) {
     console.error(
       "\n❌ El JSON no contiene un objeto válido."
     );
 
     process.exit(1);
   }
 
   if (
     !data.series ||
     typeof data.series !== "object" ||
     Array.isArray(data.series)
   ) {
     console.error(
       "\n❌ No se encontró data.series en el JSON."
     );
 
     console.error(
       "El archivo debe tener esta estructura:"
     );
 
     console.error(
       "{ generatedAt, source, seriesCount, series: { ... } }"
     );
 
     process.exit(1);
   }
 
   // ==========================================================
   // IMPORTANTE
   // ==========================================================
   //
   // Antes hacíamos:
   //
   //   Object.entries(data)
   //
   // Eso provocaba que TMDB recibiera:
   //
   //   generatedAt
   //   source
   //   seriesCount
   //   series
   //
   // Ahora recorremos SOLAMENTE:
   //
   //   data.series
   //
   // ==========================================================
 
   const entries =
     Object.entries(
       data.series
     );
 
   console.log(
     `\n📂 Series encontradas: ${entries.length}`
   );
 
   // ----------------------------------------------------------
   // RESULTADOS
   // ----------------------------------------------------------
 
   const outputSeries = {};
 
   const review = [];
 
   let matched = 0;
   let ambiguous = 0;
   let weak = 0;
   let noResult = 0;
 
   // ----------------------------------------------------------
   // PROCESAMIENTO SECUENCIAL
   // ----------------------------------------------------------
 
   for (
     let i = 0;
     i < entries.length;
     i++
   ) {
     const [
       seriesKey,
       series
     ] = entries[i];
 
     const result =
       await processSeries(
         seriesKey,
         series,
         i + 1,
         entries.length
       );
 
     outputSeries[seriesKey] =
       result.series;
 
     // --------------------------------------------------------
     // CONTADORES
     // --------------------------------------------------------
 
     if (
       result.status ===
       "MATCH"
     ) {
       matched++;
     }
 
     if (
       result.status ===
       "AMBIGUOUS"
     ) {
       ambiguous++;
     }
 
     if (
       result.status ===
       "WEAK_MATCH"
     ) {
       weak++;
     }
 
     if (
       result.status ===
       "NO_RESULT"
     ) {
       noResult++;
     }
 
     if (
       result.review
     ) {
       review.push(
         result.review
       );
     }
 
     // --------------------------------------------------------
     // GUARDADO INCREMENTAL
     // --------------------------------------------------------
 
     if (
       (i + 1) % 25 === 0
     ) {
       const partialOutput = {
         generatedAt:
           new Date().toISOString(),
 
         source:
           data.source ||
           null,
 
         seriesCount:
           entries.length,
 
         series:
           outputSeries
       };
 
       await fsPromises.writeFile(
         OUTPUT_FILE,
         JSON.stringify(
           partialOutput,
           null,
           2
         ),
         "utf8"
       );
 
       console.log(
         `\n💾 Guardado parcial: ${i + 1}/${entries.length}`
       );
     }
   }
 
   // ----------------------------------------------------------
   // RESULTADO FINAL
   // ----------------------------------------------------------
 
   const finalOutput = {
     generatedAt:
       new Date().toISOString(),
 
     source:
       data.source ||
       null,
 
     originalGeneratedAt:
       data.generatedAt ||
       null,
 
     seriesCount:
       entries.length,
 
     series:
       outputSeries
   };
 
   // ----------------------------------------------------------
   // GUARDAR RESULTADO
   // ----------------------------------------------------------
 
   await fsPromises.writeFile(
     OUTPUT_FILE,
     JSON.stringify(
       finalOutput,
       null,
       2
     ),
     "utf8"
   );
 
   // ----------------------------------------------------------
   // GUARDAR REVISIÓN
   // ----------------------------------------------------------
 
   await fsPromises.writeFile(
     REVIEW_FILE,
     JSON.stringify(
       {
         generatedAt:
           new Date().toISOString(),
 
         source:
           data.source ||
           null,
 
         total:
           entries.length,
 
         matched,
 
         ambiguous,
 
         weak,
 
         noResult,
 
         reviews:
           review
       },
       null,
       2
     ),
     "utf8"
   );
 
   // ----------------------------------------------------------
   // RESUMEN
   // ----------------------------------------------------------
 
   console.log(
     "\n=============================================="
   );
 
   console.log(
     " PROCESO TERMINADO"
   );
 
   console.log(
     "=============================================="
   );
 
   console.log(
     `Total:          ${entries.length}`
   );
 
   console.log(
     `✅ MATCH:        ${matched}`
   );
 
   console.log(
     `⚠️ AMBIGUOS:     ${ambiguous}`
   );
 
   console.log(
     `⚠️ DÉBILES:      ${weak}`
   );
 
   console.log(
     `❌ SIN RESULTADO: ${noResult}`
   );
 
   console.log(
     "\n📄 Resultado:"
   );
 
   console.log(
     OUTPUT_FILE
   );
 
   console.log(
     "\n📄 Para revisar:"
   );
 
   console.log(
     REVIEW_FILE
   );
 }
 
 // ============================================================
 // ERROR GLOBAL
 // ============================================================
 
 main().catch(error => {
   console.error(
     "\n❌ ERROR:"
   );
 
   console.error(
     error.stack ||
     error.message
   );
 
   process.exitCode = 1;
 });