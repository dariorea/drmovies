import dotenv from "dotenv";
import axios from "axios";

dotenv.config()
const TOTAL_LISTAS = 9;

// Cuántos streams probar de cada lista.
// 0 = solamente comprobar que la M3U se puede descargar.
const STREAMS_A_PROBAR = 3;

// Timeout para descargar la M3U
const TIMEOUT_M3U = 30000;

// Timeout para probar cada stream
const TIMEOUT_STREAM = 15000;

function obtenerListas() {
  const listas = [];

  for (let i = 1; i <= TOTAL_LISTAS; i++) {
    const url = process.env[`IPTV_M3U_URL_${i}`];

    listas.push({
      numero: i,
      url,
    });
  }

  return listas;
}

function ocultarCredenciales(url) {
  if (!url) return "URL no definida";

  try {
    const parsed = new URL(url);

    if (parsed.username) {
      parsed.username = "***";
    }

    if (parsed.password) {
      parsed.password = "***";
    }

    return parsed.toString();
  } catch {
    return url
      .replace(/username=[^&]*/gi, "username=***")
      .replace(/password=[^&]*/gi, "password=***");
  }
}

function analizarM3U(texto) {
  const limpio = texto.trim();

  const esM3U =
    limpio.startsWith("#EXTM3U") ||
    limpio.includes("#EXTINF:");

  const lineas = limpio
    .split(/\r?\n/)
    .map((linea) => linea.trim())
    .filter(Boolean);

  const entradas = [];

  for (let i = 0; i < lineas.length; i++) {
    const linea = lineas[i];

    if (linea.startsWith("#EXTINF:")) {
      const siguiente = lineas[i + 1];

      if (
        siguiente &&
        !siguiente.startsWith("#")
      ) {
        entradas.push({
          nombre: linea,
          url: siguiente,
        });
      }
    }
  }

  return {
    esM3U,
    lineas: lineas.length,
    entradas: entradas.length,
    streams: entradas,
  };
}

function esHTML(texto, contentType = "") {
  const inicio = texto.trim().slice(0, 500).toLowerCase();

  return (
    contentType.includes("text/html") ||
    inicio.startsWith("<!doctype html") ||
    inicio.startsWith("<html") ||
    inicio.includes("<html")
  );
}

async function descargarLista(lista) {
  const inicio = Date.now();

  try {
    const respuesta = await axios.get(lista.url, {
      timeout: TIMEOUT_M3U,
      maxRedirects: 5,
      responseType: "text",

      // Algunas plataformas IPTV responden distinto
      // según el User-Agent.
      headers: {
        "User-Agent": "VLC/3.0.20 LibVLC/3.0.20",
        Accept: "*/*",
      },

      validateStatus: () => true,
    });

    const tiempo = Date.now() - inicio;

    const texto =
      typeof respuesta.data === "string"
        ? respuesta.data
        : String(respuesta.data);

    const contentType =
      respuesta.headers["content-type"] || "";

    const analisis = analizarM3U(texto);

    const html = esHTML(texto, contentType);

    return {
      ok:
        respuesta.status >= 200 &&
        respuesta.status < 300 &&
        !html &&
        analisis.esM3U &&
        analisis.entradas > 0,

      status: respuesta.status,

      contentType,

      tiempo,

      tamano: Buffer.byteLength(texto, "utf8"),

      ...analisis,

      html,

      urlFinal:
        respuesta.request?.res?.responseUrl ||
        respuesta.config?.url ||
        lista.url,

    };
  } catch (error) {
    const tiempo = Date.now() - inicio;

    return {
      ok: false,
      status: null,
      contentType: "",
      tiempo,
      tamano: 0,
      esM3U: false,
      entradas: 0,
      streams: [],
      html: false,

      error: error.code || error.message,
    };
  }
}

function imprimirResultado(lista, resultado) {
  console.log("");
  console.log("======================================");
  console.log(`📋 LISTA ${lista.numero}`);
  console.log("======================================");

  console.log(`🔗 URL: ${ocultarCredenciales(lista.url)}`);

  if (resultado.error) {
    console.log(`❌ ERROR: ${resultado.error}`);
    return;
  }

  console.log(`🌐 HTTP: ${resultado.status}`);
  console.log(`⏱️ Tiempo: ${resultado.tiempo} ms`);
  console.log(`📦 Tamaño: ${resultado.tamano} bytes`);
  console.log(`📄 Content-Type: ${resultado.contentType || "desconocido"}`);
  console.log(`↪️ URL final: ${ocultarCredenciales(resultado.urlFinal)}`);

  if (resultado.html) {
    console.log("❌ El servidor devolvió HTML en lugar de una M3U");
  }

  if (!resultado.esM3U) {
    console.log("❌ La respuesta no parece ser una lista M3U");
  }

  if (resultado.entradas > 0) {
    console.log(`🎬 Entradas encontradas: ${resultado.entradas}`);
  } else {
    console.log("⚠️ No se encontraron entradas");
  }

  if (resultado.ok) {
    console.log("🟢 RESULTADO: LISTA FUNCIONA");
  } else {
    console.log("🔴 RESULTADO: LISTA NO FUNCIONA");
  }
}

async function probarStream(stream) {
  try {
    const respuesta = await axios.get(stream.url, {
      timeout: TIMEOUT_STREAM,
      maxRedirects: 5,

      responseType: "stream",

      headers: {
        "User-Agent": "VLC/3.0.20 LibVLC/3.0.20",
        Accept: "*/*",
      },

      validateStatus: () => true,
    });

    const status = respuesta.status;

    // Cerramos inmediatamente el stream.
    if (respuesta.data) {
      respuesta.data.destroy();
    }

    return {
      ok: status >= 200 && status < 400,
      status,
    };
  } catch (error) {
    return {
      ok: false,
      status: null,
      error: error.code || error.message,
    };
  }
}

async function probarStreams(lista, resultado) {
  if (!resultado.streams.length) {
    return [];
  }

  const cantidad = Math.min(
    STREAMS_A_PROBAR,
    resultado.streams.length
  );

  const seleccionados = resultado.streams.slice(0, cantidad);

  console.log("");
  console.log(
    `🔎 Probando ${cantidad} stream(s) de la lista ${lista.numero}...`
  );

  const resultados = [];

  for (let i = 0; i < seleccionados.length; i++) {
    const stream = seleccionados[i];

    const nombre =
      stream.nombre
        .replace(/^#EXTINF:[^,]*,/, "")
        .trim()
        .slice(0, 80);

    console.log("");
    console.log(`   [${i + 1}/${cantidad}] ${nombre}`);

    const prueba = await probarStream(stream);

    if (prueba.ok) {
      console.log(`   🟢 HTTP ${prueba.status}`);
    } else if (prueba.status) {
      console.log(`   🔴 HTTP ${prueba.status}`);
    } else {
      console.log(`   🔴 ${prueba.error}`);
    }

    resultados.push({
      nombre,
      ...prueba,
    });
  }

  return resultados;
}

async function main() {
  console.log("");
  console.log("==============================================");
  console.log("       VERIFICADOR DE LISTAS IPTV");
  console.log("==============================================");
  console.log("");

  const listas = obtenerListas();

  const definidas = listas.filter((lista) => lista.url);

  console.log(
    `📋 Listas configuradas: ${definidas.length}/${TOTAL_LISTAS}`
  );

  const resumen = [];

  for (const lista of listas) {
    if (!lista.url) {
      console.log("");
      console.log(
        `⚠️ LISTA ${lista.numero}: IPTV_M3U_URL_${lista.numero} no definida`
      );

      resumen.push({
        lista: lista.numero,
        estado: "NO CONFIGURADA",
        entradas: 0,
      });

      continue;
    }

    const resultado = await descargarLista(lista);

    imprimirResultado(lista, resultado);

    let pruebasStreams = [];

    if (resultado.ok && STREAMS_A_PROBAR > 0) {
      pruebasStreams = await probarStreams(
        lista,
        resultado
      );
    }

    const streamsOK = pruebasStreams.filter(
      (item) => item.ok
    ).length;

    const streamsError = pruebasStreams.filter(
      (item) => !item.ok
    ).length;

    resumen.push({
      lista: lista.numero,
      estado: resultado.ok
        ? "FUNCIONA"
        : "NO FUNCIONA",
      http: resultado.status,
      entradas: resultado.entradas,
      tiempo: resultado.tiempo,
      streamsOK,
      streamsError,
    });
  }

  console.log("");
  console.log("");
  console.log("==============================================");
  console.log("                 RESUMEN");
  console.log("==============================================");

  console.table(resumen);

  console.log("");

  const funcionando = resumen.filter(
    (item) => item.estado === "FUNCIONA"
  );

  const fallando = resumen.filter(
    (item) => item.estado === "NO FUNCIONA"
  );

  console.log(
    `🟢 Listas funcionando: ${funcionando.length}`
  );

  console.log(
    `🔴 Listas con problemas: ${fallando.length}`
  );

  console.log("");
}

main().catch((error) => {
  console.error("");
  console.error("💥 Error inesperado:");
  console.error(error);
  process.exit(1);
});