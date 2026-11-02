import fetch from "node-fetch";
import * as cheerio from "cheerio";

const HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    "Referer": "https://turvexa.ir/"
};

const TIMEOUT_MS = 20000;
const MAX_SIZE = 500 * 1024 * 1024;
const RETRY_STATUS = new Set([429, 502, 503, 504]);
const MAX_RETRIES = 4;

const processedMessages = new Set();
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function fetchWithTimeout(url, options = {}) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), TIMEOUT_MS);
    return fetch(url, { ...options, headers: { ...HEADERS, ...(options.headers || {}) }, signal: controller.signal })
        .finally(() => clearTimeout(id));
}

async function fetchWithRetry(url, options = {}) {
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        try {
            const res = await fetchWithTimeout(url, options);
            if (!RETRY_STATUS.has(res.status) || attempt === MAX_RETRIES) return res;

            try { res.body?.destroy?.(); } catch (e) {}

            const retryAfter = parseInt(res.headers.get('retry-after') || '0', 10);
            const wait = retryAfter > 0 ? Math.min(retryAfter, 15) * 1000 : Math.min(2000 * 2 ** attempt, 15000);
            await sleep(wait);
        } catch (err) {
            if (attempt === MAX_RETRIES) throw err;
            await sleep(Math.min(2000 * 2 ** attempt, 15000));
        }
    }
}

let handler = async (m, { conn, text, usedPrefix, command }) => {
    const chatId = m.key?.remoteJid || m.chat;
    const msgId = m.key?.id;

    if (!text || !text.includes('turvexa.ir')) {
        return conn.sendMessage(chatId, { text: `⚠️ *Ingresa un enlace válido de Turvexa.*\n\n*Ejemplo:* ${usedPrefix + command} https://turvexa.ir/dl/` }, { quoted: m });
    }

    if (processedMessages.has(msgId)) return;
    processedMessages.add(msgId);
    setTimeout(() => processedMessages.delete(msgId), 60000);

    try {
        await m.react('🕒');
        const url = text.trim();

        const response = await fetchWithRetry(url);
        if (!response.ok) throw new Error(`No se pudo acceder a la página de descarga (código ${response.status}).`);

        const html = await response.text();
        const $ = cheerio.load(html);

        let directVideoUrl = null;

        const downloadBtnHref = $('a.btn-secondary, a[href*="/download"]').attr('href');
        if (downloadBtnHref) {
            directVideoUrl = downloadBtnHref;
        }

        if (!directVideoUrl) {
            $('video').each((_, el) => {
                const src = $(el).attr('src') || $(el).attr('data-src');
                if (src) directVideoUrl = src;
            });
        }

        if (!directVideoUrl) {
            await m.react('✖️');
            return conn.sendMessage(chatId, { text: '❌ No se pudo encontrar el enlace directo del video en esa página.' }, { quoted: m });
        }

        if (directVideoUrl.startsWith('/')) {
            const urlObj = new URL(url);
            directVideoUrl = `${urlObj.protocol}//${urlObj.host}${directVideoUrl}`;
        }

        let originalName = 'video_turvexa.mp4';
        const titleAttr = $('video source').attr('title') || $('h1, h2').first().text().trim();
        if (titleAttr && /\.mp4$/i.test(titleAttr)) {
            originalName = titleAttr;
        } else {
            const urlNameMatch = directVideoUrl.split('?')[0].match(/([^/]+\.mp4)$/i);
            if (urlNameMatch) originalName = urlNameMatch[1];
        }

        await conn.sendMessage(chatId, { text: '⚡ Descargando...' }, { quoted: m });

        const videoRes = await fetchWithRetry(directVideoUrl);

        if (!videoRes.ok) {
            await m.react('✖️');
            const msg = videoRes.status === 503
                ? '❌ El servidor de Turvexa está saturado en este momento (503). Ya reintenté varias veces, prueba de nuevo en unos minutos.'
                : `❌ No se pudo descargar el video (código ${videoRes.status}).`;
            return conn.sendMessage(chatId, { text: msg }, { quoted: m });
        }

        const contentType = videoRes.headers.get('content-type') || '';
        if (contentType.includes('text/html')) {
            await m.react('✖️');
            return conn.sendMessage(chatId, { text: '❌ El servidor devolvió una página en vez del video (el link puede haber expirado).' }, { quoted: m });
        }

        const declaredSize = parseInt(videoRes.headers.get('content-length') || '0', 10);
        if (declaredSize && declaredSize > MAX_SIZE) {
            try { videoRes.body?.destroy?.(); } catch (e) {}
            await m.react('✖️');
            return conn.sendMessage(chatId, { text: `❌ El video pesa ${(declaredSize / 1024 / 1024).toFixed(1)}MB, supera el límite de ${MAX_SIZE / 1024 / 1024}MB.` }, { quoted: m });
        }

        const arrayBuffer = await videoRes.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        if (buffer.length < 5000) {
            await m.react('✖️');
            return conn.sendMessage(chatId, { text: '❌ El archivo obtenido está vacío o es inválido (0 KB).' }, { quoted: m });
        }

        if (buffer.length > MAX_SIZE) {
            await m.react('✖️');
            return conn.sendMessage(chatId, { text: `❌ El video supera el límite de ${MAX_SIZE / 1024 / 1024}MB.` }, { quoted: m });
        }

        await conn.sendMessage(chatId, {
            document: buffer,
            mimetype: 'video/mp4',
            fileName: originalName
        }, { quoted: m });

        await m.react('✔️');

    } catch (err) {
        console.error(err);
        await m.react('✖️');
        if (err.name === 'AbortError') {
            return conn.sendMessage(chatId, { text: '❌ Tiempo de espera agotado al procesar el enlace.' }, { quoted: m });
        }
        return conn.sendMessage(chatId, { text: `❌ Ocurrió un error al procesar el enlace:\n${err.message}` }, { quoted: m });
    }
};

handler.help = ['turvexa <url>'];
handler.command = ['turvexa', 'dltv'];
handler.tags = ['downloader'];

export default handler;
          
