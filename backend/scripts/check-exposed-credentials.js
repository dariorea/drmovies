import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const STREAMS_FILE = path.join(
    __dirname,
    "../data/movie-streams.json"
);

const content = fs.readFileSync(STREAMS_FILE, "utf8");

// Busca:
// /movie/usuario/password/archivo
// /series/usuario/password/archivo
//
// No considera como credenciales:
// {user}
// {password}
// %7Buser%7D
// %7Bpassword%7D

const regex =
    /"streamUrl"\s*:\s*"([^"]*\/(?:movie|series)\/([^/"]+)\/([^/"]+)\/([^"]+))"/gi;

let total = 0;
let exposed = 0;

console.log("🔎 Analizando movie-streams.json...\n");

let match;

while ((match = regex.exec(content)) !== null) {
    total++;

    const fullUrl = match[1];
    const user = decodeURIComponent(match[2]);
    const password = decodeURIComponent(match[3]);
    const file = match[4];

    const normalizedUser = user.toLowerCase();
    const normalizedPassword = password.toLowerCase();

    const isPlaceholderUser =
        normalizedUser === "{user}";

    const isPlaceholderPassword =
        normalizedPassword === "{password}";

    if (
        isPlaceholderUser &&
        isPlaceholderPassword
    ) {
        continue;
    }

    exposed++;

    console.log(`⚠️ Credenciales encontradas #${exposed}`);
    console.log(`URL: ${fullUrl}`);
    console.log(`Usuario: ${user}`);
    console.log(`Archivo: ${file}`);
    console.log("-----------------------------------");
}

console.log("\n=================================");
console.log("📊 RESULTADO");
console.log("=================================");

console.log("URLs analizadas:", total);
console.log("Con posibles credenciales:", exposed);