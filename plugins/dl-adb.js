import fetch from "node-fetch";
import * as cheerio from "cheerio";
import { JSDOM } from "jsdom";
import path from "path";
import { File } from "megajs";

const HEADERS = { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" };
const TIMEOUT_MS = 15000;
const SEARCH_PAGES_TO_SCAN = 8;
const MIN_QUERY_LENGTH = 4;
const MAX_RESULTS = 10;
const MIN_VIDEO_SIZE = 3 * 1024 * 1024; // Mínimo 3 MB para ser considerado un anime válido

function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), TIMEOUT_MS);
  return fetch(url, { ...options, headers: { ...HEADERS, ...(options.headers || {}) }, signal: controller.signal })
    .finally(() => clearTimeout(id));
}

async function getBufferFromResponse(res) {
  if (typeof res.buffer === 'function') {
    return await res.buffer();
  }
  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

function fixSpanishEntities(str) {
  if (!str) return '';
  return str
    .replace(/&#(\d+);/g, (m, dec) => String.fromCharCode(dec))
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#039;/g, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&aacute;/gi, 'á')
    .replace(/&eacute;/gi, 'é')
    .replace(/&iacute;/gi, 'í')
    .replace(/&oacute;/gi, 'ó')
    .replace(/&uacute;/gi, 'ú')
    .replace(/&Aacute;/g, 'Á')
    .replace(/&Eacute;/g, 'É')
    .replace(/&Iacute;/g, 'Í')
    .replace(/&Oacute;/g, 'Ó')
    .replace(/&Uacute;/g, 'Ú')
    .replace(/&ntilde;/gi, 'ñ')
    .replace(/&Ntilde;/gi, 'Ñ')
    .replace(/&?([aeiou])a?acute;?/gi, (m, v) => {
      const map = { a: 'á', e: 'é', i: 'í', o: 'ó', u: 'ú', A: 'Á', E: 'É', I: 'Í', O: 'Ó', U: 'Ú' };
      return map[v] || v;
    })
    .replace(/&acute;/gi, '');
}

const HOST_PATTERNS = [
  { name: "Mediafire", regex: /https?:\/\/(www\.)?mediafire\.com\/[^\s"'<>]+/gi },
  { name: "Mega", regex: /https?:\/\/mega\.(nz|co\.nz)\/[^\s"'<>]+/gi },
  { name: "Zippyshare", regex: /https?:\/\/[a-z0-9]+\.zippyshare\.com\/[^\s"'<>]+/gi },
  { name: "TeraBox", regex: /https?:\/\/(www\.)?terabox\.com\/[^\s"'<>]+/gi },
  { name: "1fichier", regex: /https?:\/\/(www\.)?1fichier\.com\/[^\s"'<>]+/gi },
  { name: "Google Drive", regex: /https?:\/\/drive\.google\.com\/[^\s"'<>]+/gi },
  { name: "Pixeldrain", regex: /https?:\/\/pixeldrain\.com\/[^\s"'<>]+/gi },
  { name: "YourUpload", regex: /https?:\/\/(www\.)?yourupload\.com\/[^\s"'<>]+/gi },
];

const PLAYER_SOURCE_PATTERNS = [
  /https?:\/\/[^\s"'<>\\]+\.aysdo\.xyz[^\s"'<>\\]*/gi,
  /https?:\/\/ddl\.aysdo\.xyz[^\s"'<>\\]*/gi,
  /https?:\/\/[^\s"'<>\\]+\.m3u8[^\s"'<>\\]*/gi,
  /https?:\/\/[^\s"'<>\\]+\.mp4\?[^\s"'<>\\]*sign=[^\s"'<>\\]*/gi,
  /https?:\/\/[^\s"'<>\\]+\.mp4[^\s"'<>\\]*/gi,
];

let handler = async (m, { conn, text, args, usedPrefix }) => {
  try {
    if (!text) {
      const cap = `✩ Ingresa el nombre de un anime o pega el link de un anime.

*Ejemplo:* ${usedPrefix}animedbs Tomb Raider King
*Ejemplo:* ${usedPrefix}adb https://www.animedbs.online/anime/tomb-raider-king/`;
      return conn.reply(m.chat, cap, m);
    }

    m.react('🕒');

    if (text.includes('animedbs.online')) {
      if (/\/anime\/[^/]+\/?(\?.*)?$/.test(text)) {
        await listAnimeEpisodes(m, conn, text);
      } else {
        await downloadEpisode(m, conn, text);
      }
    } else {
      if (text.trim().length < MIN_QUERY_LENGTH) {
        await m.react('✖️');
        return conn.reply(m.chat, `✩ Escribe al menos ${MIN_QUERY_LENGTH} letras para buscar.\n\n*Ejemplo:* ${usedPrefix}animedbs musho`, m);
      }
      await searchAnimeDBS(m, conn, text);
    }
  } catch (err) {
    await m.react('✖️');
    return conn.reply(m.chat, 'Error en la ejecución.\n\n' + err, m);
  }
};

handler.help = ["animedbs"];
handler.command = ["animedbs", "adb"];
handler.tags = ["downloader"];
handler.premium = true;
export default handler;

async function searchAnimeDBS(m, conn, query) {
  try {
    const normalizedQuery = normalize(query);
    let resultados = await searchViaNativeSearch(query, normalizedQuery);

    if (resultados.length === 0) {
      resultados = await searchViaDirectory(normalizedQuery);
    }

    if (resultados.length === 0) {
      await m.react('✖️');
      return conn.reply(m.chat, `No se encontraron resultados para "${query}" en AnimeDBS.`, m);
    }

    resultados.sort((a, b) => {
      const aStarts = normalize(a.titulo).startsWith(normalizedQuery) ? 0 : 1;
      const bStarts = normalize(b.titulo).startsWith(normalizedQuery) ? 0 : 1;
      return aStarts - bStarts;
    });

    let cap = `🍡 AnimeDbs - Search\n\n`;
    resultados.slice(0, MAX_RESULTS).forEach((res, index) => {
      cap += `${index + 1}) ${fixSpanishEntities(res.titulo)}\n${res.url}\n\n`;
    });
    await conn.reply(m.chat, cap.trim(), m);
    await m.react("✔️");
  } catch (error) {
    console.error("Error en searchAnimeDBS:", error.message);
    await m.react('✖️');
    return conn.reply(m.chat, 'No se pudo completar la búsqueda.', m);
  }
}

function isRealAnimeLink(href, titulo) {
  if (!href || !titulo) return false;
  if (!/^https?:\/\/(www\.)?animedbs\.online\/anime\/[^/?]+\/?$/.test(href)) return false;
  const titulosIgnorados = ["directorio", "audio latino", "1080p", "emisión", "emision", "pedidos", "inicio", "ver todo"];
  if (titulosIgnorados.includes(titulo.trim().toLowerCase())) return false;
  return true;
}

async function searchViaNativeSearch(query, normalizedQuery) {
  try {
    const url = `https://animedbs.online/?s=${encodeURIComponent(query)}`;
    const response = await fetchWithTimeout(url);
    if (!response.ok) return [];

    const html = await response.text();
    const $ = cheerio.load(html);
    const resultados = [];

    $("a[href*='/anime/']").each((i, el) => {
      const href = $(el).attr("href");
      const titulo = $(el).attr("title") || $(el).text().trim();

      if (isRealAnimeLink(href, titulo) && normalize(titulo).includes(normalizedQuery)) {
        resultados.push({ titulo, url: href });
      }
    });

    return Array.from(new Map(resultados.map(r => [r.url, r])).values());
  } catch (error) {
    console.error("Error en searchViaNativeSearch:", error.message);
    return [];
  }
}

async function searchViaDirectory(normalizedQuery) {
  const resultados = [];

  for (let page = 1; page <= SEARCH_PAGES_TO_SCAN; page++) {
    const url = page === 1
      ? `https://www.animedbs.online/anime/?order=title`
      : `https://www.animedbs.online/anime/?order=title&page=${page}`;

    const response = await fetchWithTimeout(url);
    if (!response.ok) break;

    const html = await response.text();
    const $ = cheerio.load(html);

    $("a[href*='/anime/']").each((i, el) => {
      const href = $(el).attr("href");
      const titulo = $(el).attr("title") || $(el).text().trim();

      if (isRealAnimeLink(href, titulo) && normalize(titulo).includes(normalizedQuery)) {
        resultados.push({ titulo, url: href });
      }
    });

    if (!html.includes('Siguente') && !html.includes('Siguiente')) break;
    if (resultados.length >= MAX_RESULTS * 2) break;
  }

  return Array.from(new Map(resultados.map(r => [r.url, r])).values());
}

function normalize(str) {
  return str.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function getAnchorKeyword(title, slug) {
  const slugWords = slug.split('-').filter(w => w.length >= 4);
  if (slugWords.length > 0) return slugWords[0];

  const titleWords = normalize(title).split(/\s+/).filter(w => w.length >= 4);
  return titleWords[0] || normalize(title);
}

async function listAnimeEpisodes(m, conn, url) {
  try {
    const response = await fetchWithTimeout(url);
    const html = await response.text();
    const $ = cheerio.load(html);

    let title = $("h1").first().text().trim() || "Anime";
    title = fixSpanishEntities(title);

    const slugMatch = url.match(/\/anime\/([^/?]+)/);
    const slug = slugMatch ? slugMatch[1] : normalize(title).replace(/\s+/g, '-');
    const anchorKeyword = getAnchorKeyword(title, slug);

    let poster =
      $('meta[property="og:image"]').attr('content') ||
      $('.poster img, .thumb img, .sertothumb img').first().attr('src') ||
      $('img[itemprop="image"]').first().attr('src') ||
      null;

    if (poster && poster.startsWith('//')) poster = 'https:' + poster;
    if (poster && poster.startsWith('/')) poster = 'https://www.animedbs.online' + poster;

    let sinopsisEl = $('.wp-content p, .sinopsis, .description, [itemprop="description"]').first();
    sinopsisEl.find('script, style').remove();

    let sinopsis = sinopsisEl.text().trim() ||
      $('meta[name="description"]').attr('content') ||
      'Sin sinopsis disponible.';

    sinopsis = sinopsis.replace(/\s+/g, ' ').trim();

    const CORTE_BASURA = /(Episodio\s*\d+\s*en\s*:|\d+\s*Dias\s*\d+\s*Horas|document\.addEventListener|wpdevart_countdown)/i;
    const corteMatch = sinopsis.match(CORTE_BASURA);
    if (corteMatch) {
      sinopsis = sinopsis.slice(0, corteMatch.index).trim();
    }

    sinopsis = fixSpanishEntities(sinopsis);

    if (!sinopsis) sinopsis = 'Sin sinopsis disponible.';

    let generos = $('.genxed a, .genres a, .mgen a, [itemprop="genre"]')
      .map((i, el) => $(el).text().trim())
      .get()
      .filter(Boolean);

    const PALABRAS_NO_GENERO = /\d|exclusivo|terabox|mediafire|mega|1080p|720p|480p|hd|sub|dual|latino|castellano|audio/i;
    generos = generos.filter(g => !PALABRAS_NO_GENERO.test(g));
    generos = [...new Set(generos)];
    const generosTexto = generos.length > 0 ? fixSpanishEntities(generos.join(', ')) : 'No especificado';

    const episodios = [];
    $("a").each((i, el) => {
      const href = $(el).attr("href");
      const texto = $(el).text().trim();

      if (!href || !href.includes("animedbs.online") || href.includes("/anime/")) return;

      let num = null;
      const textMatch = texto.match(/(?:Episodio|Capitulo|Capítulo|Cap|Ep|Eps)\s*(\d+)/i);
      const urlMatch = href.match(/(?:capitulo|episodio|cap|ep)-(\d+)/i);

      if (textMatch) {
        num = parseInt(textMatch[1], 10);
      } else if (urlMatch) {
        num = parseInt(urlMatch[1], 10);
      }

      if (num !== null && normalize(href).includes(anchorKeyword)) {
        episodios.push({ numero: num, url: href });
      }
    });

    const unicos = Array.from(new Map(episodios.map(e => [e.url, e])).values())
      .sort((a, b) => a.numero - b.numero);

    let cap = `*_Título:_* _${title}_\n\n🎭 *Género:* ${generosTexto}\n\n📖 *Sinopsis:*\n${sinopsis}`;

    if (unicos.length > 0) {
      cap += `\n\n◜ Lista de episodios ◞\n`;
      unicos.forEach((ep) => {
        cap += `\nEpisodio ${ep.numero}: ${ep.url}`;
      });
    } else {
      cap += `\n\n⚠️ No se encontraron episodios listados.`;
    }

    if (poster) {
      try {
        await conn.sendMessage(m.chat, { image: { url: poster }, caption: cap }, { quoted: m });
      } catch (e) {
        await conn.reply(m.chat, cap, m);
      }
    } else {
      await conn.reply(m.chat, cap, m);
    }

    if (unicos.length === 0) {
      await m.react('✖️');
      return;
    }

    await m.react("✔️");
  } catch (error) {
    console.error("Error en listAnimeEpisodes:", error.message);
    await m.react('✖️');
    return conn.reply(m.chat, 'No se pudo obtener la lista de episodios.', m);
  }
}

function findDirectoLink($) {
  let found = null;
  $("a").each((i, el) => {
    const texto = $(el).text().trim().toLowerCase();
    const href = $(el).attr("href");
    if (texto === "directo" && href) {
      found = href;
      return false;
    }
  });
  return found;
}

function findPlayerSourceLinkStatic(html) {
  for (const pattern of PLAYER_SOURCE_PATTERNS) {
    const matches = [...html.matchAll(pattern)].map(mt => mt[0]);
    const limpio = matches.find(u => !/mediafire|mega\.|zippyshare|terabox|1fichier|drive\.google|pixeldrain|yourupload/i.test(u));
    if (limpio) return limpio.replace(/\\\//g, '/');
  }
  return null;
}

async function findPlayerSourceLinkJsdom(pageUrl) {
  let dom = null;
  try {
    dom = new JSDOM("", {
      url: pageUrl,
      runScripts: "dangerously",
      resources: "usable",
      pretendToBeVisual: true,
    });

    const response = await fetchWithTimeout(pageUrl);
    const html = await response.text();
    dom.window.document.open();
    dom.window.document.write(html);
    dom.window.document.close();

    const videoSrc = await new Promise((resolve) => {
      const start = Date.now();
      const interval = setInterval(() => {
        const video = dom.window.document.querySelector("video");
        const src = video?.currentSrc || video?.src;
        if (src && /^https?:\/\//.test(src)) {
          clearInterval(interval);
          resolve(src);
        } else if (Date.now() - start > 12000) {
          clearInterval(interval);
          resolve(null);
        }
      }, 500);
    });

    return videoSrc;
  } catch (error) {
    console.error("Error en findPlayerSourceLinkJsdom:", error.message);
    return null;
  } finally {
    if (dom) dom.window.close();
  }
}

async function downloadEpisode(m, conn, url) {
  const response = await fetchWithTimeout(url);
  const htmlRaw = await response.text();
  const html = htmlRaw.replace(/\\\//g, '/');
  const $ = cheerio.load(html);
  const dom = new JSDOM(html);
  const document = dom.window.document;

  let title = document.querySelector("h1")?.textContent.trim() ?? "Episodio";
  title = fixSpanishEntities(title);

  const foundLinks = {};
  for (const host of HOST_PATTERNS) {
    const matches = [...html.matchAll(host.regex)].map(mt => mt[0]);
    if (matches.length > 0) {
      foundLinks[host.name] = [...new Set(matches)];
    }
  }

  const directoLink = findDirectoLink($);

  // 1. Directo
  if (directoLink) {
    const ok = await tryDirectDownload(m, conn, directoLink, title, url);
    if (ok) return;
    console.error("Plan 1 (Directo) falló, probando otros servidores...");
  }

  // 2. Mediafire
  if (foundLinks["Mediafire"]) {
    const ok = await downloadMediafireFile(m, conn, foundLinks["Mediafire"][0], title, url);
    if (ok) return;
  }

  // 3. Directo 2.0 (Reproductor interno)
  let playerLink = findPlayerSourceLinkStatic(html);
  if (!playerLink) {
    playerLink = await findPlayerSourceLinkJsdom(url);
  }
  if (playerLink) {
    const ok = await downloadDirecto2(m, conn, playerLink, title, url);
    if (ok) return;
  }

  // 4. Pixeldrain
  if (foundLinks["Pixeldrain"]) {
    const ok = await downloadPixeldrainFile(m, conn, foundLinks["Pixeldrain"][0], title);
    if (ok) return;
  }

  // 5. YourUpload
  if (foundLinks["YourUpload"]) {
    const ok = await downloadYourUploadFile(m, conn, foundLinks["YourUpload"][0], title);
    if (ok) return;
  }

  // 6. Mega
  if (foundLinks["Mega"]) {
    const ok = await downloadMegaFile(m, conn, foundLinks["Mega"][0], title);
    if (ok) return;
  }

  await m.react('✖️');
  return conn.reply(m.chat, `No pude descargar ${title} en ningún servidor disponible.`, m);
}

async function tryDirectDownload(m, conn, directUrl, title, sourceUrl) {
  try {
    const sizeStr = await getFileSize(directUrl);
    const fileExtension = path.extname(directUrl.split('?')[0]).toLowerCase() || ".mp4";
    const fileName = `${title}${fileExtension}`;

    // Aviso inmediato
    await conn.reply(m.chat, `🍬 Descargando:\n${fileName} (${sizeStr})`, m);

    const fileResponse = await fetch(directUrl);
    if (!fileResponse.ok) return false;

    const buffer = await getBufferFromResponse(fileResponse);
    if (buffer.length < MIN_VIDEO_SIZE) return false;

    await conn.sendFile(m.chat, buffer, fileName, "", m, null, { mimetype: "video/mp4", asDocument: true });
    await m.react('✔️');
    return true;
  } catch (error) {
    console.error("Error en tryDirectDownload:", error.message);
    return false;
  }
}

async function downloadMediafireFile(m, conn, mediafireUrl, title, sourceUrl) {
  try {
    const response = await fetchWithTimeout(mediafireUrl);
    const html = await response.text();
    const match = html.match(/https?:\/\/download\d*\.mediafire\.com\/[^\s"'<>]+/);

    if (!match) return false;

    const directUrl = match[0];
    const fileExtension = path.extname(directUrl).toLowerCase() || ".mp4";
    const fileName = `${title}${fileExtension}`;
    const sizeStr = await getFileSize(directUrl);

    // Aviso inmediato
    await conn.reply(m.chat, `🍬 Descargando:\n${fileName} (${sizeStr})`, m);

    const fileRes = await fetch(directUrl);
    if (!fileRes.ok) return false;

    const buffer = await getBufferFromResponse(fileRes);
    if (buffer.length < MIN_VIDEO_SIZE) return false;

    await conn.sendFile(m.chat, buffer, fileName, "", m, null, { mimetype: "video/mp4", asDocument: true });
    await m.react('✔️');
    return true;
  } catch (error) {
    console.error("Error descargando de Mediafire:", error.message);
    return false;
  }
}

async function downloadDirecto2(m, conn, playerLink, title, sourceUrl) {
  try {
    const fileExtension = path.extname(playerLink.split('?')[0]).toLowerCase() || ".mp4";
    const fileName = `${title}${fileExtension}`;
    const sizeStr = await getFileSize(playerLink, { Referer: sourceUrl });

    // Aviso inmediato
    await conn.reply(m.chat, `🍬 Descargando:\n${fileName} (${sizeStr})`, m);

    const fileResponse = await fetch(playerLink, {
      headers: { ...HEADERS, Referer: sourceUrl },
    });

    if (!fileResponse.ok) return false;

    const buffer = await getBufferFromResponse(fileResponse);
    if (buffer.length < MIN_VIDEO_SIZE) return false;

    await conn.sendFile(m.chat, buffer, fileName, "", m, null, { mimetype: "video/mp4", asDocument: true });
    await m.react('✔️');
    return true;
  } catch (error) {
    console.error("Error en downloadDirecto2:", error.message);
    return false;
  }
}

function extractPixeldrainId(url) {
  const match = url.match(/pixeldrain\.com\/(?:u|l)\/([a-zA-Z0-9]+)/i);
  return match ? match[1] : null;
}

async function downloadPixeldrainFile(m, conn, pixeldrainUrl, fallbackTitle) {
  try {
    const fileId = extractPixeldrainId(pixeldrainUrl);
    if (!fileId) return false;

    const infoResponse = await fetchWithTimeout(`https://pixeldrain.com/api/file/${fileId}/info`);
    const info = await infoResponse.json();

    if (!info || info.success === false) return false;

    const maxSize = 300 * 1024 * 1024;
    const size = Number(info.size || 0);
    if (size >= maxSize) return false;

    const fileName = info.name || `${fallbackTitle}.mp4`;
    const sizeStr = size ? formatBytes(size) : 'Desconocido';

    // Aviso inmediato
    await conn.reply(m.chat, `🍬 Descargando:\n${fileName} (${sizeStr})`, m);

    const fileResponse = await fetchWithTimeout(`https://pixeldrain.com/api/file/${fileId}?download`);
    if (!fileResponse.ok) return false;

    const buffer = await getBufferFromResponse(fileResponse);
    if (buffer.length < MIN_VIDEO_SIZE) return false;

    const mimetype = info.mime_type || "video/mp4";

    await conn.sendFile(m.chat, buffer, fileName, "", m, null, { mimetype, asDocument: true });
    await m.react('✔️');
    return true;
  } catch (error) {
    console.error("Error descargando de Pixeldrain:", error.message);
    return false;
  }
}

async function downloadYourUploadFile(m, conn, youruploadUrl, fallbackTitle) {
  try {
    let fileId = null;
    const match = youruploadUrl.match(/yourupload\.com\/(?:watch|embed|download\?file=)\/([a-zA-Z0-9_-]+)/i) ||
                  youruploadUrl.match(/file=([a-zA-Z0-9_-]+)/i);

    if (match) {
      fileId = match[1];
    } else {
      const parts = youruploadUrl.split('?')[0].split('/').filter(Boolean);
      fileId = parts[parts.length - 1];
    }

    if (!fileId) return false;

    const downloadPageUrl = `https://www.yourupload.com/download?file=${fileId}`;
    const watchPageUrl = `https://www.yourupload.com/watch/${fileId}`;

    const pageRes = await fetchWithTimeout(downloadPageUrl, { headers: { Referer: watchPageUrl } });
    if (!pageRes.ok) return false;

    const html = await pageRes.text();
    const $ = cheerio.load(html);

    let directUrl = $('a[href*="/noview/"]').attr('href') ||
                    $('a.btn-success[href*="/noview/"]').attr('href') ||
                    $('a.btn-success').attr('href');

    if (!directUrl) {
      const matchMp4 = html.match(/https?:\/\/[^\s"'<>]+\.(?:mp4|mkv)[^\s"'>]*/i);
      if (matchMp4) directUrl = matchMp4[0];
    }

    if (!directUrl) return false;
    if (directUrl.startsWith('/')) directUrl = 'https://www.yourupload.com' + directUrl;

    const fileName = `${fallbackTitle}.mp4`;
    const sizeStr = await getFileSize(directUrl, { Referer: downloadPageUrl });

    // Aviso inmediato
    await conn.reply(m.chat, `🍬 Descargando:\n${fileName} (${sizeStr})`, m);

    const fileRes = await fetch(directUrl, { headers: { ...HEADERS, Referer: downloadPageUrl } });
    if (!fileRes.ok) return false;

    const buffer = await getBufferFromResponse(fileRes);
    if (buffer.length < MIN_VIDEO_SIZE) return false;

    await conn.sendFile(m.chat, buffer, fileName, "", m, null, { mimetype: "video/mp4", asDocument: true });
    await m.react('✔️');
    return true;
  } catch (error) {
    console.error("Error descargando de YourUpload:", error.message);
    return false;
  }
}

async function downloadMegaFile(m, conn, megaUrl, fallbackTitle) {
  try {
    const file = File.fromURL(megaUrl);
    await file.loadAttributes();

    const maxSize = 300 * 1024 * 1024;
    if (file.size >= maxSize) {
      await conn.reply(m.chat, `ꕥ El archivo de Mega es demasiado pesado (Peso máximo: 300MB). Link manual: ${megaUrl}`, m);
      return true;
    }

    const cap = `🍬Descargando:\n${file.name} (${formatBytes(file.size)})`;
    await conn.reply(m.chat, cap, m);

    const data = await file.downloadBuffer();
    const fileExtension = path.extname(file.name).toLowerCase();
    const mimeTypes = {
      ".mp4": "video/mp4",
      ".pdf": "application/pdf",
      ".zip": "application/zip",
      ".rar": "application/x-rar-compressed",
      ".7z": "application/x-7z-compressed",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".png": "image/png",
    };
    const mimetype = mimeTypes[fileExtension] || "application/octet-stream";

    await conn.sendFile(m.chat, data, file.name, "", m, null, { mimetype, asDocument: true });
    await m.react('✔️');
    return true;
  } catch (error) {
    console.error("Error descargando de Mega:", error.message);
    return false;
  }
}

async function getFileSize(url, extraHeaders = {}) {
  try {
    const res = await fetchWithTimeout(url, { method: 'HEAD', headers: extraHeaders });
    const size = parseInt(res.headers.get('content-length'), 10);
    if (!size) return 'Desconocido';

    if (size >= 1e9) return (size / 1e9).toFixed(2) + ' GB';
    if (size >= 1e6) return (size / 1e6).toFixed(2) + ' MB';
    if (size >= 1e3) return (size / 1e3).toFixed(2) + ' KB';
    return size + ' Bytes';
  } catch (err) {
    return 'Desconocido';
  }
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
