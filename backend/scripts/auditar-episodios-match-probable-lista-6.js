
import fs from "node:fs";
import path from "node:path";
import "dotenv/config";

const DIR = path.resolve("data");

const ARCHIVO_AUDITORIA = path.join(
  DIR,
  "auditoria-match-probable-lista-6.json"
);

const ARCHIVO_LISTA = path.join(
  DIR,
  "unmatched-series-lista-6.json"
);

const ARCHIVO_CATALOGO = path.join(
  DIR,
  "series-streams-combined.json"
);

const ARCHIVO_SALIDA = path.join(
  DIR,
  "auditoria-episodios-match-probable-lista-6.json"
);

const ARCHIVO_TXT = path.join(
  DIR,
  "auditoria-episodios-match-probable-lista-6.txt"
);

const API_KEY =
  process.env.TMDB_API_KEY ||
  process.env.VITE_TMDB_API_KEY ||
  process.env.TMDB_API_READ_ACCESS_TOKEN;

const BEARER = process.env.TMDB_BEARER_TOKEN || "";

const IDIOMAS = ["es-ES", "en-US"];
const ESPERA_MS = 250;

const pausa = ms =>
  new Promise(resolve => setTimeout(resolve, ms));

function leerJSON(archivo) {
  if (!fs.existsSync(archivo)) {
    throw new Error(`No existe el archivo: ${archivo}`);
  }

  return JSON.parse(fs.readFileSync(archivo, "utf8"));
}

function normalizar(valor) {
  return String(valor ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " y ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function obtenerNombreSerie(item) {
  return (
    item.serieLista ??
    item.nombreLista ??
    item.nombreSerie ??
    item.name ??
    item.title ??
    item.seriesName ??
    ""
  );
}

function obtenerIdTMDB(item) {
  return Number(
    item.tmdbIdPropuesto ??
    item.tmdbId ??
    item.idTMDB ??
    item.candidato?.id ??
    0
  );
}

function obtenerEpisodios(item) {
  if (Array.isArray(item.episodes)) return item.episodes;
  if (Array.isArray(item.episodios)) return item.episodios;
  if (Array.isArray(item.lista?.episodes)) return item.lista.episodes;
  if (Array.isArray(item.series?.episodes)) return item.series.episodes;
  return [];
}

function obtenerTemporada(ep) {
  return Number(
    ep.season ??
    ep.seasonNumber ??
    ep.temporada ??
    0
  );
}

function obtenerNumeroEpisodio(ep) {
  return Number(
    ep.episode ??
    ep.episodeNumber ??
    ep.numeroEpisodio ??
    0
  );
}

function obtenerNombreEpisodio(ep) {
  return String(
    ep.name ??
    ep.title ??
    ep.nombre ??
    ep.episodeName ??
    ""
  ).trim();
}

function agruparPorTemporada(episodios) {
  const grupos = new Map();

  for (const ep of episodios) {
    const temporada = obtenerTemporada(ep);
    const numero = obtenerNumeroEpisodio(ep);

    if (!Number.isFinite(temporada) || !Number.isFinite(numero)) {
      continue;
    }

    if (!grupos.has(temporada)) {
      grupos.set(temporada, new Map());
    }

    const grupo = grupos.get(temporada);

    if (!grupo.has(numero)) {
      grupo.set(numero, []);
    }

    grupo.get(numero).push(obtenerNombreEpisodio(ep));
  }

  return grupos;
}

function puntuarTexto(a, b) {
  const x = normalizar(a);
  const y = normalizar(b);

  if (!x || !y) return 0;
  if (x === y) return 1;
  if (x.includes(y) || y.includes(x)) return 0.9;

  const tokensX = new Set(x.split(" "));
  const tokensY = new Set(y.split(" "));

  const comunes = [...tokensX].filter(t => tokensY.has(t)).length;
  const dice = (2 * comunes) / (tokensX.size + tokensY.size);

  return dice;
}

function quitarIdentificadorEpisodio(nombre) {
  return normalizar(nombre)
    .replace(/\b(s|season|temporada)\s*0*\d+\b/g, " ")
    .replace(/\b(e|ep|episode|episodio|capitulo|cap)\s*0*\d+\b/g, " ")
    .replace(/\b\d{1,2}\s*x\s*\d{1,3}\b/g, " ")
    .replace(/\b\d{1,2}\s*[-_.]\s*\d{1,3}\b/g, " ")
    .replace(/\b(s\d{1,2}e\d{1,3})\b/g, " ")
    .replace(/\b(temporada|season)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function esNombreGenerico(nombre, nombreSerie) {
  const limpio = quitarIdentificadorEpisodio(nombre);
  const serie = normalizar(nombreSerie);

  if (!limpio) return true;

  const sinSerie = limpio
    .replace(serie, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!sinSerie) return true;

  if (/^(episodio|episode|capitulo|capitulo especial)\s*\d*$/.test(sinSerie)) {
    return true;
  }

  // Nombres demasiado cortos no sirven como prueba fiable.
  return sinSerie.split(" ").filter(Boolean).length < 2;
}

function extraerNombreUtil(nombre, nombreSerie) {
  let limpio = quitarIdentificadorEpisodio(nombre);
  const serie = normalizar(nombreSerie);

  if (serie) {
    limpio = limpio.replace(serie, " ").replace(/\s+/g, " ").trim();
  }

  return limpio;
}

async function consultarTMDB(endpoint, params = {}) {
  const url = new URL(`https://api.themoviedb.org/3${endpoint}`);

  url.searchParams.set("language", params.language ?? "es-ES");

  if (API_KEY) {
    url.searchParams.set("api_key", API_KEY);
  }

  const headers = {
    accept: "application/json"
  };

  if (BEARER) {
    headers.Authorization = `Bearer ${BEARER}`;
  }

  if (!API_KEY && !BEARER) {
    throw new Error(
      "Falta TMDB_API_KEY, VITE_TMDB_API_KEY o TMDB_BEARER_TOKEN en el entorno."
    );
  }

  const response = await fetch(url, { headers });

  if (!response.ok) {
    const texto = await response.text().catch(() => "");
    throw new Error(
      `TMDB HTTP ${response.status} en ${endpoint}: ${texto.slice(0, 200)}`
    );
  }

  return response.json();
}

async function obtenerDatosTMDB(id) {
  let detalles;
  let ultimoError;

  for (const idioma of IDIOMAS) {
    try {
      detalles = await consultarTMDB(`/tv/${id}`, {
        language: idioma
      });

      if (detalles?.id) break;
    } catch (error) {
      ultimoError = error;
    }
  }

  if (!detalles?.id) {
    throw ultimoError ?? new Error("No se obtuvieron detalles de TMDB.");
  }

  const temporadas = (detalles.seasons ?? [])
    .filter(s => Number.isInteger(Number(s.season_number)))
    .map(s => Number(s.season_number));

  const episodios = [];

  for (const numeroTemporada of temporadas) {
    await pausa(ESPERA_MS);

    let datosTemporada = null;
    let errorTemporada = null;

    for (const idioma of IDIOMAS) {
      try {
        datosTemporada = await consultarTMDB(
          `/tv/${id}/season/${numeroTemporada}`,
          { language: idioma }
        );

        if (Array.isArray(datosTemporada.episodes)) break;
      } catch (error) {
        errorTemporada = error;
      }
    }

    if (!Array.isArray(datosTemporada?.episodes)) {
      throw errorTemporada ??
        new Error(`No se pudo leer la temporada ${numeroTemporada}.`);
    }

    for (const ep of datosTemporada.episodes) {
      episodios.push({
        season: Number(ep.season_number ?? numeroTemporada),
        episode: Number(ep.episode_number),
        name: String(ep.name ?? ""),
        air_date: ep.air_date ?? null
      });
    }
  }

  return {
    id: detalles.id,
    name: detalles.name ?? "",
    original_name: detalles.original_name ?? "",
    first_air_date: detalles.first_air_date ?? null,
    origin_country: detalles.origin_country ?? [],
    seasons: temporadas,
    episodes: episodios
  };
}

function localizarSerieLista(itemAuditoria, registrosLista) {
  const nombre = normalizar(obtenerNombreSerie(itemAuditoria));

  const exacta = registrosLista.find(item =>
    normalizar(
      item.name ??
      item.title ??
      item.serieLista ??
      item.nombre ??
      item.seriesName ??
      ""
    ) === nombre
  );

  if (exacta) return exacta;

  // Algunos archivos pueden tener un título distinto en el registro,
  // pero conservarlo en los nombres de los episodios.
  const parcial = registrosLista.filter(item => {
    const nombreRegistro = normalizar(
      item.name ??
      item.title ??
      item.serieLista ??
      item.nombre ??
      item.seriesName ??
      ""
    );

    return nombreRegistro && nombre &&
      (nombreRegistro.includes(nombre) || nombre.includes(nombreRegistro));
  });

  return parcial.length === 1 ? parcial[0] : null;
}

function comparar(itemAuditoria, episodiosLista, datosTMDB) {
  const nombreSerie = obtenerNombreSerie(itemAuditoria);
  const lista = agruparPorTemporada(episodiosLista);
  const tmdb = agruparPorTemporada(datosTMDB.episodes);

  const temporadasLista = [...lista.keys()].sort((a, b) => a - b);
  const temporadasTMDB = [...tmdb.keys()].sort((a, b) => a - b);

  const temporadasFaltantes = temporadasLista.filter(
    t => !tmdb.has(t)
  );

  const temporadasExtra = temporadasTMDB.filter(
    t => !lista.has(t)
  );

  const diferenciasPorTemporada = [];
  const diferenciasPorEpisodio = [];

  let comparables = 0;
  let nombresCoincidentes = 0;
  let nombresDistintos = 0;
  let nombresGenericos = 0;

  for (const temporada of temporadasLista) {
    const episodiosOrigen = lista.get(temporada);
    const episodiosDestino = tmdb.get(temporada);

    if (!episodiosDestino) {
      diferenciasPorTemporada.push({
        temporada,
        episodiosLista: episodiosOrigen.size,
        episodiosTMDB: 0,
        motivo: "TEMPORADA_NO_EXISTE_EN_TMDB"
      });
      continue;
    }

    if (episodiosOrigen.size !== episodiosDestino.size) {
      diferenciasPorTemporada.push({
        temporada,
        episodiosLista: episodiosOrigen.size,
        episodiosTMDB: episodiosDestino.size,
        motivo: "CANTIDAD_DISTINTA"
      });
    }

    for (const [numero, nombresOrigen] of episodiosOrigen) {
      const nombresDestino = episodiosDestino.get(numero);

      if (!nombresDestino) {
        diferenciasPorEpisodio.push({
          temporada,
          episodio: numero,
          nombreLista: nombresOrigen[0] ?? "",
          nombreTMDB: null,
          motivo: "NUMERO_DE_EPISODIO_NO_EXISTE"
        });
        continue;
      }

      const nombreOrigen = nombresOrigen[0] ?? "";
      const nombreDestino = nombresDestino[0] ?? "";

      // Si el proveedor usa títulos como "Serie S01E01", no es
      // posible verificar la identidad por nombre del episodio.
      if (esNombreGenerico(nombreOrigen, nombreSerie)) {
        nombresGenericos++;
        continue;
      }

      const tituloOrigen = extraerNombreUtil(nombreOrigen, nombreSerie);
      const similitud = puntuarTexto(tituloOrigen, nombreDestino);

      comparables++;

      if (similitud >= 0.72) {
        nombresCoincidentes++;
      } else {
        nombresDistintos++;

        diferenciasPorEpisodio.push({
          temporada,
          episodio: numero,
          nombreLista: nombreOrigen,
          nombreListaLimpio: tituloOrigen,
          nombreTMDB: nombreDestino,
          similitud: Number(similitud.toFixed(3)),
          motivo: "NOMBRE_NO_COINCIDE"
        });
      }
    }
  }

  const totalLista = episodiosLista.length;
  const totalTMDB = datosTMDB.episodes.length;

  const estructuraExacta =
    temporadasFaltantes.length === 0 &&
    temporadasExtra.length === 0 &&
    diferenciasPorTemporada.length === 0 &&
    diferenciasPorEpisodio.every(
      d => d.motivo !== "NUMERO_DE_EPISODIO_NO_EXISTE"
    ) &&
    totalLista === totalTMDB;

  const porcentajeNombres = comparables
    ? nombresCoincidentes / comparables
    : null;

  let clasificacion;

  if (!totalLista) {
    clasificacion = "SIN_EPISODIOS_DE_LISTA";
  } else if (
    !estructuraExacta ||
    nombresDistintos > 0
  ) {
    clasificacion = "REVISAR";
  } else if (
    comparables >= 3 &&
    porcentajeNombres >= 0.8
  ) {
    clasificacion = "COINCIDENCIA_MUY_PROBABLE";
  } else {
    clasificacion = "REVISAR_NOMBRES_O_ESTRUCTURA";
  }

  return {
    clasificacion,
    estructuraExacta,
    episodiosLista: totalLista,
    episodiosTMDB: totalTMDB,
    temporadasLista: temporadasLista.map(t => ({
      temporada: t,
      episodios: lista.get(t).size
    })),
    temporadasTMDB: temporadasTMDB.map(t => ({
      temporada: t,
      episodios: tmdb.get(t).size
    })),
    temporadasFaltantes,
    temporadasExtra,
    diferenciasPorTemporada,
    comparacionNombres: {
      comparables,
      coincidentes: nombresCoincidentes,
      distintos: nombresDistintos,
      genericos: nombresGenericos,
      porcentajeCoincidencia: porcentajeNombres === null
        ? null
        : Number((porcentajeNombres * 100).toFixed(1))
    },
    diferenciasPorEpisodio
  };
}

async function main() {
  console.log("\n==============================================");
  console.log(" AUDITORÍA DE EPISODIOS LISTA 6 — SOLO LECTURA");
  console.log("==============================================\n");

  const auditoria = leerJSON(ARCHIVO_AUDITORIA);
  const registrosListaJSON = leerJSON(ARCHIVO_LISTA);

  // Se lee para comprobar que el catálogo actual existe y es JSON válido.
  // No se modifica ni se usa para importar datos.
  const catalogo = leerJSON(ARCHIVO_CATALOGO);

  const registrosLista = Array.isArray(registrosListaJSON)
    ? registrosListaJSON
    : Object.values(registrosListaJSON);

  const resultadosAuditoria = Array.isArray(auditoria)
    ? auditoria
    : auditoria.resultados;

  if (!Array.isArray(resultadosAuditoria)) {
    throw new Error(
      "No se encontró un array de resultados en auditoria-match-probable-lista-6.json"
    );
  }

  const candidatos = resultadosAuditoria.filter(item =>
    item.clasificacionAuditoria === "ALTA_ESTRUCTURA" ||
    item.clasificacionAuditoria === "REVISAR_CATALOGO" ||
    item.clasificacionAuditoria === "REVISAR" ||
    item.clasificacionAuditoria === "BAJA_COINCIDENCIA"
  );

  console.log(`Candidatos a revisar: ${candidatos.length}`);
  console.log(`Registros de lista 6: ${registrosLista.length}`);
  console.log(`Series actuales en catálogo: ${Object.keys(catalogo).length}`);
  console.log("El catálogo no será modificado.\n");

  const resultados = [];

  for (let i = 0; i < candidatos.length; i++) {
    const candidato = candidatos[i];
    const nombre = obtenerNombreSerie(candidato);
    const tmdbId = obtenerIdTMDB(candidato);

    console.log(
      `[${i + 1}/${candidatos.length}] ${nombre} | TMDB ${tmdbId || "SIN ID"}`
    );

    const registroLista = localizarSerieLista(candidato, registrosLista);

    if (!registroLista) {
      resultados.push({
        serieLista: nombre,
        tmdbIdPropuesto: tmdbId || null,
        clasificacionOriginal: candidato.clasificacionAuditoria ?? null,
        estado: "NO_SE_ENCONTRO_REGISTRO_LISTA",
        clasificacion: "REVISAR",
        mensaje: "No se pudo asociar de forma inequívoca con un registro de unmatched-series-lista-6.json."
      });

      console.log("  -> No se pudo localizar el registro de la lista.");
      continue;
    }

    const episodiosLista = obtenerEpisodios(registroLista);

    if (!tmdbId) {
      resultados.push({
        serieLista: nombre,
        clasificacionOriginal: candidato.clasificacionAuditoria ?? null,
        estado: "SIN_ID_TMDB",
        clasificacion: "REVISAR"
      });

      console.log("  -> El candidato no tiene ID TMDB válido.");
      continue;
    }

    if (!episodiosLista.length) {
      resultados.push({
        serieLista: nombre,
        tmdbIdPropuesto: tmdbId,
        clasificacionOriginal: candidato.clasificacionAuditoria ?? null,
        estado: "SIN_EPISODIOS_LISTA",
        clasificacion: "REVISAR"
      });

      console.log("  -> El registro no contiene episodios reconocibles.");
      continue;
    }

    try {
      const datosTMDB = await obtenerDatosTMDB(tmdbId);
      const comparacion = comparar(candidato, episodiosLista, datosTMDB);

      resultados.push({
        serieLista: nombre,
        tmdbIdPropuesto: tmdbId,
        nombreTMDB: datosTMDB.name,
        nombreOriginalTMDB: datosTMDB.original_name,
        fechaEstrenoTMDB: datosTMDB.first_air_date,
        paisesTMDB: datosTMDB.origin_country,
        clasificacionOriginal: candidato.clasificacionAuditoria ?? null,
        existeEnCatalogo: Boolean(catalogo[String(tmdbId)]),
        estado: "OK",
        ...comparacion
      });

      console.log(
        `  -> ${comparacion.clasificacion} | ` +
        `${comparacion.episodiosLista}/${comparacion.episodiosTMDB} episodios | ` +
        `nombres comparables: ${comparacion.comparacionNombres.comparables}`
      );
    } catch (error) {
      resultados.push({
        serieLista: nombre,
        tmdbIdPropuesto: tmdbId,
        clasificacionOriginal: candidato.clasificacionAuditoria ?? null,
        estado: "ERROR_TMDB",
        clasificacion: "REVISAR",
        error: error.message
      });

      console.log(`  -> ERROR: ${error.message}`);
    }

    await pausa(ESPERA_MS);
  }

  const resumen = {};

  for (const resultado of resultados) {
    const clasificacion = resultado.clasificacion ?? "SIN_CLASIFICAR";
    resumen[clasificacion] = (resumen[clasificacion] ?? 0) + 1;
  }

  const salida = {
    fechaAuditoria: new Date().toISOString(),
    modo: "SOLO LECTURA",
    catalogoModificado: false,
    totalCandidatos: candidatos.length,
    resumen,
    resultados
  };

  fs.writeFileSync(
    ARCHIVO_SALIDA,
    JSON.stringify(salida, null, 2),
    "utf8"
  );

  const lineas = [
    "AUDITORÍA DE EPISODIOS LISTA 6 — SOLO LECTURA",
    `Fecha: ${salida.fechaAuditoria}`,
    `Total: ${resultados.length}`,
    "",
    "RESUMEN",
    ...Object.entries(resumen).map(([nombre, cantidad]) =>
      `${nombre}: ${cantidad}`
    ),
    "",
    "DETALLE",
    ""
  ];

  for (const r of resultados) {
    lineas.push(
      `${r.serieLista} | TMDB ${r.tmdbIdPropuesto ?? "?"} | ` +
      `${r.nombreTMDB ?? "sin datos TMDB"} | ${r.clasificacion ?? "?"}`
    );

    if (r.comparacionNombres) {
      const n = r.comparacionNombres;

      lineas.push(
        `  Episodios lista/TMDB: ${r.episodiosLista}/${r.episodiosTMDB}`
      );

      lineas.push(
        `  Nombres: ${n.coincidentes} coincidentes, ` +
        `${n.distintos} distintos, ${n.genericos} genéricos`
      );
    }

    for (const d of (r.diferenciasPorTemporada ?? [])) {
      lineas.push(
        `  TEMPORADA ${d.temporada}: lista=${d.episodiosLista}, ` +
        `TMDB=${d.episodiosTMDB}, ${d.motivo}`
      );
    }

    for (const d of (r.diferenciasPorEpisodio ?? [])) {
      lineas.push(
        `  S${String(d.temporada).padStart(2, "0")}E${String(d.episodio).padStart(2, "0")} | ` +
        `${d.motivo} | Lista: ${d.nombreLista ?? ""} | TMDB: ${d.nombreTMDB ?? ""}`
      );
    }

    if (r.error) lineas.push(`  ERROR: ${r.error}`);
    if (r.mensaje) lineas.push(`  NOTA: ${r.mensaje}`);

    lineas.push("");
  }

  fs.writeFileSync(ARCHIVO_TXT, lineas.join("\n"), "utf8");

  console.log("\n==============================================");
  console.log("AUDITORÍA TERMINADA");
  console.log("==============================================");
  console.log(JSON.stringify(resumen, null, 2));
  console.log(`\nJSON: ${ARCHIVO_SALIDA}`);
  console.log(`TXT:  ${ARCHIVO_TXT}`);
  console.log("\nEl catálogo no fue modificado.");
}

main().catch(error => {
  console.error("\nERROR FATAL:", error.message);
  process.exitCode = 1;
});
