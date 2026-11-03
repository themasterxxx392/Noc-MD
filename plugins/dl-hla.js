import axios from 'axios';
import * as cheerio from 'cheerio';
import { lookup } from 'mime-types';
import { File as MegaFile } from 'megajs';

global.hentailaStore = global.hentailaStore || new Map();

const MAX_SIZE_BYTES = 1024 * 1024 * 1024; // 1 GB
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

function formatMB(bytes) {
    return (bytes / (1024 * 1024)).toFixed(2);
}

async function searchHentaiLA(query) {
    try {
        const searchUrl = `https://hentaila.com/catalogo?search=${encodeURIComponent(query)}`;
        const { data: html } = await axios.get(searchUrl, {
            headers: { 'User-Agent': UA, 'Referer': 'https://hentaila.com/' },
            timeout: 10000
        });

        const $ = cheerio.load(html);
        const results = [];

        $('a[href*="/media/"]').each((_, el) => {
            const $el = $(el);
            const href = $el.attr('href');

            if (href && href.includes('/media/')) {
                let title = $el.find('h3, h2, h4, .title, .name').text().trim() || $el.attr('title') || $el.text().trim();
                title = title.replace(/^ver\s+/i, '').trim();
                const fullUrl = href.startsWith('http') ? href : `https://hentaila.com${href.startsWith('/') ? '' : '/'}${href}`;

                if (title && !results.some(r => r.url === fullUrl)) {
                    results.push({ title, url: fullUrl });
                }
            }
        });

        return results;
    } catch (e) {
        return [];
    }
}

async function getSeriesDetails(seriesUrl) {
    try {
        const { data: html } = await axios.get(seriesUrl, {
            headers: { 'User-Agent': UA, 'Referer': 'https://hentaila.com/' },
            timeout: 12000
        });

        const $ = cheerio.load(html);
        const title = $('h1').first().text().trim() || $('title').text().replace(/-.*/, '').trim();

        let rawPoster = $('meta[property="og:image"]').attr('content') || $('.cover img').attr('src') || '';
        let poster = '';
        if (rawPoster) {
            poster = rawPoster.startsWith('//') ? 'https:' + rawPoster : rawPoster;
        }

        const episodes = [];
        $('a[href*="/ver/"], a[href*="/media/"]').each((_, el) => {
            const href = $(el).attr('href');
            if (href && (href.includes('/ver/') || href.match(/\/media\/[^\/]+\/\d+/))) {
                const fullUrl = href.startsWith('http') ? href : `https://hentaila.com${href.startsWith('/') ? '' : '/'}${href}`;
                if (!episodes.some(e => e.url === fullUrl)) {
                    const matchEp = href.match(/(?:-|\/)(\d+)$/);
                    const epNum = matchEp ? parseInt(matchEp[1]) : episodes.length + 1;
                    episodes.push({ num: epNum, url: fullUrl });
                }
            }
        });

        episodes.sort((a, b) => a.num - b.num);

        return {
            title,
            poster,
            episodes: episodes.length > 0 ? episodes : [{ num: 1, url: seriesUrl }]
        };
    } catch (e) {
        return null;
    }
}

async function resolveRedirectIfNeeded(url) {
    if (!url) return null;
    if (/mediafire|yourupload|mega|mp4upload/i.test(url)) return url;
    try {
        const res = await axios.get(url, { headers: { 'User-Agent': UA, 'Referer': 'https://hentaila.com/' }, maxRedirects: 5, timeout: 10000 });
        const finalUrl = res.request?.res?.responseUrl || res.config?.url || '';
        if (finalUrl && finalUrl !== url) return finalUrl;
        const match = res.data.match(/https?:\/\/(?:www\.)?(?:mediafire\.com|yourupload\.com|mega\.nz|mp4upload\.com)\/[^\s"'<>]+/i);
        return match ? match[0] : url;
    } catch { return url; }
}

async function getMediafireDirectLink(mediafireUrl) {
    try {
        let targetUrl = await resolveRedirectIfNeeded(mediafireUrl);
        const { data: html } = await axios.get(targetUrl, { headers: { 'User-Agent': UA, 'Referer': 'https://www.mediafire.com/' }, timeout: 12000 });
        const $ = cheerio.load(html);
        let downloadButton = $('#downloadButton').attr('href') || $('#download_link').attr('href');
        return downloadButton || null;
    } catch { return null; }
}

async function getYourUploadDirectLink(yourUploadUrl) {
    try {
        let target = await resolveRedirectIfNeeded(yourUploadUrl);
        const matchId = target.match(/yourupload\.com\/(?:watch|embed|download)\/([A-Za-z0-9]+)/i);
        const id = matchId ? matchId[1] : null;
        const url = id ? `https://www.yourupload.com/embed/${id}` : target;
        
        const { data } = await axios.get(url, { headers: { 'User-Agent': UA, 'Referer': 'https://www.yourupload.com/' }, timeout: 12000 });
        const $ = cheerio.load(data);
        const ogVideo = $('meta[property="og:video"]').attr('content') || $('meta[property="og:video:src"]').attr('content');
        if (ogVideo) return ogVideo;

        const fileMatch = data.match(/file\s*:\s*["'](?<url>https?:\/\/[^"']+\.mp4[^"']*)["']/i);
        return fileMatch ? (fileMatch.groups?.url || fileMatch[1]) : null;
    } catch { return null; }
}

async function getMp4UploadDirectLink(mp4Url) {
    try {
        let target = await resolveRedirectIfNeeded(mp4Url);
        const match = target.match(/mp4upload\.com\/(?:embed-)?([a-zA-Z0-9]+)/i);
        if (!match) return null;
        const { data: html } = await axios.get(`https://www.mp4upload.com/embed-${match[1]}.html`, { headers: { 'User-Agent': UA, 'Referer': 'https://www.mp4upload.com/' }, timeout: 15000 });
        const videoMatch = html.match(/src:\s*["'](https?:\/\/[^"']+\.mp4[^"']*)["']/i);
        return videoMatch ? videoMatch[1] : null;
    } catch { return null; }
}

async function getMegaBuffer(megaUrl) {
    try {
        let target = await resolveRedirectIfNeeded(megaUrl);
        const file = MegaFile.fromURL(target);
        await file.loadAttributes();
        if (file.size >= MAX_SIZE_BYTES) return { error: 'Excede el límite' };
        const buffer = await file.downloadBuffer();
        return { buffer, size: file.size, name: file.name };
    } catch { return null; }
}

async function getHentaiLADownloadUrl(pageUrl, episodeNum) {
    const { data: html } = await axios.get(pageUrl, { headers: { 'User-Agent': UA, 'Referer': 'https://hentaila.com/' }, timeout: 12000 });
    const $ = cheerio.load(html);

    let animeName = 'Video';
    const urlMatch = pageUrl.match(/\/(?:media|ver)\/([^\/]+)/i);
    if (urlMatch) {
        animeName = urlMatch[1].replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    }
    const epNumber = String(episodeNum || 1).padStart(2, '0');
    const fileName = `${epNumber} ${animeName}.mp4`;

    const links = { mediafire: null, yourupload: null, mp4upload: null, mega: null };
    $('script, a, iframe').each((_, el) => {
        const href = $(el).attr('href') || $(el).attr('src') || $(el).html() || '';
        if (/mediafire\.com/i.test(href) && !links.mediafire) links.mediafire = href.match(/https?:\/\/[^"'\s]+mediafire\.com\/[^\s"'<>]+/i)?.[0] || href;
        if (/yourupload\.com/i.test(href) && !links.yourupload) links.yourupload = href;
        if (/mp4upload\.com/i.test(href) && !links.mp4upload) links.mp4upload = href;
        if (/mega\.(?:nz|co\.nz)/i.test(href) && !links.mega) links.mega = href;
    });

    const providers = [
        { link: links.mediafire, extract: u => getMediafireDirectLink(u).then(d => d ? { downloadUrl: d, referer: 'https://mediafire.com/' } : null) },
        { link: links.yourupload, extract: u => getYourUploadDirectLink(u).then(d => d ? { referer: 'https://www.yourupload.com/' } : null) },
        { link: links.mp4upload, extract: u => getMp4UploadDirectLink(u).then(d => d ? { referer: 'https://www.mp4upload.com/' } : null) },
        { link: links.mega, extract: u => getMegaBuffer(u).then(res => res && !res.error ? { buffer: res.buffer } : null) }
    ];

    for (const p of providers) {
        if (!p.link) continue;
        try {
            const res = await p.extract(p.link);
            if (res && (res.downloadUrl || res.buffer)) return { ...res, fileName };
        } catch {}
    }
    return null;
}

let handler = async (m, { conn, text, command }) => {
    // Si mandan el comando principal de búsqueda
    if (command === 'hentaila' || command === 'hla') {
        if (!text || text.trim().length < 3) {
            return m.reply('⚠️ Por favor, ingresa un nombre válido (*mínimo 3 caracteres*). Ej: `.hla camp`');
        }

        await m.react('🕒');
        const results = await searchHentaiLA(text.trim());

        if (!results || results.length === 0) {
            await m.react('✖️');
            return m.reply('❌ No se encontraron resultados para tu búsqueda.');
        }

        const topResults = results.slice(0, 10);

        let txt = `🔞 *HENTAILA - BÚSQUEDA*\n\n`;
        topResults.forEach((item, index) => {
            txt += `*${index + 1})* ${item.title}\n\n`;
        });
        txt += `➡️ *Escribe un número del 1 al ${topResults.length} para seleccionar el anime.*`;

        const sentMsg = await conn.reply(m.chat, txt, m);
        await m.react('✔️');

        // Guardamos la sesión en el mapa global por chat ID
        global.hentailaStore.set(m.chat, {
            step: 'select_anime',
            results: topResults,
            msgId: sentMsg.key.id
        });
        return;
    }
};

// Middleware infalible que captura los números directamente en el mismo archivo sin depender de handler.before
handler.all = async function (m, { conn }) {
    if (!m.text || m.isBaileys) return;
    const session = global.hentailaStore.get(m.chat);
    if (!session) return;

    const inputNum = parseInt(m.text.trim());
    if (isNaN(inputNum)) return;

    // PASO 1: Seleccionar anime de la lista de búsqueda
    if (session.step === 'select_anime') {
        if (inputNum < 1 || inputNum > session.results.length) return;

        const selected = session.results[inputNum - 1];
        await m.react('🕒');

        const details = await getSeriesDetails(selected.url);
        if (!details) {
            await m.react('✖️');
            return m.reply('❌ No se pudieron obtener los detalles de este anime.');
        }

        let txt = `*[🔞] ${details.title.toUpperCase()}*\n\n`;
        txt += `» *CAPÍTULOS DISPONIBLES:* \`${details.episodes.length}\`\n\n`;
        txt += `> *DESCARGAR:* Escribe el número del capítulo que deseas (Ej: \`1\`)`;

        session.step = 'select_episode';
        session.episodes = details.episodes;
        global.hentailaStore.set(m.chat, session);

        await m.react('✔️');
        if (details.poster) {
            await conn.sendMessage(m.chat, { image: { url: details.poster }, caption: txt }, { quoted: m });
        } else {
            await conn.reply(m.chat, txt, m);
        }
        return true;
    }

    // PASO 2: Seleccionar y descargar el capítulo
    if (session.step === 'select_episode') {
        const targetEp = session.episodes.find(e => e.num === inputNum) || session.episodes[inputNum - 1];
        if (!targetEp) return;

        await m.react('🕒');

        try {
            const resolved = await getHentaiLADownloadUrl(targetEp.url, targetEp.num);
            if (!resolved) {
                await m.react('✖️');
                return m.reply('❌ No se pudo extraer el enlace de descarga de este capítulo.');
            }

            const { downloadUrl, fileName, referer, buffer: directBuffer } = resolved;
            let buffer = directBuffer;

            if (!buffer && downloadUrl) {
                let contentLength = 0;
                try {
                    const head = await axios.head(downloadUrl, { headers: { 'User-Agent': UA, 'Referer': referer }, timeout: 10000 });
                    contentLength = Number(head.headers['content-length'] || 0);
                    if (contentLength >= MAX_SIZE_BYTES) {
                        await m.react('✖️');
                        return m.reply(`ꕥ El archivo supera el límite permitido (*${formatMB(contentLength)} MB*).`);
                    }
                } catch {}

                await conn.reply(m.chat, `🔞 Descargando: \`${fileName}\`${contentLength ? ` (*${formatMB(contentLength)} MB*)` : ''}`, m);

                const fileRes = await axios.get(downloadUrl, {
                    responseType: 'arraybuffer',
                    headers: { 'User-Agent': UA, 'Referer': referer },
                    timeout: 300000
                });
                buffer = Buffer.from(fileRes.data);
            }

            if (!buffer || buffer.length < 100000) {
                await m.react('✖️');
                return m.reply('⚠️ El archivo está vacío o el enlace ha caducado.');
            }

            if (buffer.length >= MAX_SIZE_BYTES) {
                await m.react('✖️');
                return m.reply(`ꕥ El archivo supera el límite permitido (*${formatMB(buffer.length)} MB*).`);
            }

            const mimetype = lookup(fileName) || 'video/mp4';

            await conn.sendMessage(m.chat, {
                document: buffer,
                fileName,
                mimetype
            }, { quoted: m });

            await m.react('✔️');

        } catch (e) {
            await m.react('✖️');
            return m.reply(`⚠︎ Ocurrió un error en la descarga: ${e.message}`);
        }
        return true;
    }
};

handler.command = ['hentaila', 'hla'];
export default handler;
