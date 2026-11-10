
import dotenv from "dotenv";
import axios from "axios";

const TIMEOUT_M3U = 60000;
const TIMEOUT_STREAM = 15000;
const MUESTRAS_POR_TIPO = 3;

dotenv.config()
function analizarM3U(texto) {
  const lineas = texto.split(/\r?\n/).map((x) => x.trim());
  const entradas = [];

  for (let i = 0; i < lineas.length - 1; i++) {
    if (!lineas[i].startsWith("#EXTINF:")) continue;

    const url = lineas[i + 1];

    if (!/^https?:\/\//i.test(url)) continue;

    const tipo = /\/series\//i.test(url)
      ? "SERIE"
      : /\/movie\//i.test(url)
        ? "PELICULA"
        : null;

    if (tipo) {
      entradas.push({
        nombre: lineas[i].split(",").pop()?.trim() || "Sin nombre",
        url,
        tipo,
      });
    }
  }

  return entradas;
}

async function probarStream(entrada) {
  try {
    const respuesta = await axios.get(entrada.url, {
      timeout: TIMEOUT_STREAM,
      maxRedirects: 5,
      responseType: "stream",
      headers: {
        Range: "bytes=0-1023",
        "User-Agent": "VLC/3.0.20",
      },
      validateStatus: () => true,
    });

    const status = respuesta.status;
    const headers = respuesta.headers;

    if (respuesta.data) respuesta.data.destroy();

    let diagnostico;

    if ([200, 206].includes(status)) {
      diagnostico = "RESPONDE: posible reproducción";
    } else if (status === 401) {
      diagnostico = "401: acceso no autorizado";
    } else if (status === 403) {
      diagnostico = "403: acceso prohibido";
    } else if (status === 404) {
      diagnostico = "404: recurso no encontrado";
    } else {
      diagnostico = `HTTP ${status}`;
    }

    return {
      nombre: entrada.nombre,
      tipo: entrada.tipo,
      host: new URL(entrada.url).hostname,
      status,
      diagnostico,
      contentType: headers["content-type"] || "desconocido",
      range: headers["content-range"] || "no informado",
    };
  } catch (error) {
    return {
      nombre: entrada.nombre,
      tipo: entrada.tipo,
      host: (() => {
        try {
          return new URL(entrada.url).hostname;
        } catch {
          return "desconocido";
        }
      })(),
      status: null,
      diagnostico: error.code || error.message,
    };
  }
}

async function main() {
  const urlM3U = process.env.IPTV_M3U_URL_2;

  if (!urlM3U) {
    throw new Error("No está definida IPTV_M3U_URL_2 en .env");
  }

  console.log("\n=== PRUEBA REAL DE LISTA 2 ===");
  console.log("Descargando M3U...");

  const respuesta = await axios.get(urlM3U, {
    timeout: TIMEOUT_M3U,
    maxRedirects: 5,
    responseType: "text",
    headers: { "User-Agent": "VLC/3.0.20" },
    validateStatus: () => true,
  });

  console.log("HTTP M3U:", respuesta.status);

  if (respuesta.status !== 200) {
    console.log("No se pudo descargar la lista.");
    return;
  }

  const texto = typeof respuesta.data === "string"
    ? respuesta.data
    : String(respuesta.data);

  if (!texto.trim().startsWith("#EXTM3U")) {
    console.log("La respuesta no parece una M3U válida.");
    return;
  }

  const entradas = analizarM3U(texto);

  console.log("Entradas de películas:", entradas.filter(x => x.tipo === "PELICULA").length);
  console.log("Entradas de series:", entradas.filter(x => x.tipo === "SERIE").length);

  for (const tipo of ["SERIE", "PELICULA"]) {
    const muestras = entradas
      .filter(x => x.tipo === tipo)
      .slice(0, MUESTRAS_POR_TIPO);

    console.log(`\n--- ${tipo}: ${muestras.length} pruebas ---`);

    for (const entrada of muestras) {
      const resultado = await probarStream(entrada);

      console.log(JSON.stringify(resultado, null, 2));
    }
  }

  console.log("\nPrueba finalizada.");
}

main().catch(error => {
  console.error("Error:", error.code || error.message);
  process.exitCode = 1;
});
