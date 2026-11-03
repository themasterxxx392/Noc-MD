import axios from 'axios';
import * as cheerio from 'cheerio';
import { lookup } from 'mime-types';
import { File as MegaFile } from 'megajs';
import os from 'os';
import path from 'path';
import fs from 'fs';
import https from 'https';

global.hentailaStore = global.hentailaStore || new Map();

const customTmpDir = path.join(process.cwd(), 'tmp');
if (!fs.existsSync(customTmpDir)) {
    fs.mkdirSync(customTmpDir, { recursive: true });
}
process.env.TMPDIR = customTmpDir;
os.tmpdir = () => customTmpDir;

const MAX_SIZE_BYTES = 1024 * 1024 * 1024;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

const activeDownloads = new Set();
const LOCK_TTL_MS = 3 * 60 * 1000;
const CONCURRENCY = 6;
const keepAliveAgent = new https.Agent({ keepAlive: true, maxSockets: CONCURRENCY + 2, keepAliveMsecs: 10000 });

function formatMB(bytes) { return (bytes / (1024 * 1024)).toFixed(2); }

function unpackJS(packed) {
    try {
        const regex = /eval\(function\(p,a,c,k,e,d\).+?\}\('(.+?)',(\d+),(\d+),'(.+?)'\.split\('\|'\)/s;
        const match = packed.match(regex);
        if (!match) return packed;
        let [_, p, a, c, k] = match;
        a = parseInt(a); c = parseInt(c); k = k.split('|');
        function e(c) { return (c < a ? '' : e(Math.floor(c / a))) + ((c = c % a) > 35 ? String.fromCharCode(c + 29) : c.toString(36)); }
        while (c--) { if (k[c]) p = p.replace(new RegExp('\\b' + e(c) + '\\b', 'g'), k[c]); }
        return p;
    } catch { return packed; }
}

async function segmentedDownload(url, baseHeaders, totalSize, concurrency = CONCURRENCY) {
    const chunkSize = Math.ceil(totalSize / concurrency);
    const tasks = [];
    for (let i = 0; i < concurrency; i++) {
        const start = i * chunkSize;
        const end = Math.min(start + chunkSize - 1, totalSize - 1);
        if (start > end) continue;
        tasks.push(axios.get(url, { responseType: 'arraybuffer', headers: { ...baseHeaders, Range: `bytes=${start}-${end}` }, timeout: 300000, httpsAgent: keepAliveAgent }).then(r => ({ index: i, data: Buffer.from(r.data) })));
    }
    const results = await Promise.all(tasks);
    results.sort((a, b) => a.index - b.index);
    return Buffer.concat(results.map(r => r.data));
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
        if (downloadButton) return downloadButton;
        const directMatch = html.match(/https?:\/\/download\d*\.mediafire\.com\/[^\s"'<>]+/i);
        return directMatch ? directMatch[0] : null;
    } catch { return null; }
}

async function getYourUploadDirectLink(yourUploadUrl) {
    try {
        let target = await resolveRedirectIfNeeded(yourUploadUrl);
        const matchId = target.match(/yourupload\.com\/(?:watch|embed|download)\/([A-Za-z0-9]+)/i);
        const id = matchId ? matchId[1] : null;
        const urlsToTry = id ? [`https://www.yourupload.com/embed/${id}`, `https://www.yourupload.com/watch/${id}`] : [target];
        for (const url of urlsToTry) {
            try {
                const { data } = await axios.get(url, { headers: { 'User-Agent': UA, 'Referer': 'https://www.yourupload.com/' }, timeout: 12000 });
                const $ = cheerio.load(data);
                const ogVideo = $('meta[property="og:video"]').attr('content') || $('meta[property="og:video:src"]').attr('content');
                if (ogVideo) return ogVideo;
                const fileMatch = data.match(/file\s*:\s*["'](?<url>https?:\/\/[^"']+\.mp4[^"']*)["']/i) || data.match(/(https?:\/\/[^"']+\.yourupload\.com\/[^"']+\.mp4[^"']*)/i);
                if (fileMatch) { const found = fileMatch.groups?.url || fileMatch[1]; if (found) return found.startsWith('//') ? 'https:' + found : found; }
            } catch {}
        }
    } catch {}
    return null;
}

async function getMp4UploadDirectLink(mp4Url) {
    try {
        let target = await resolveRedirectIfNeeded(mp4Url);
        const match = target.match(/mp4upload\.com\/(?:embed-)?([a-zA-Z0-9]+)/i);
        if (!match) return null;
        const { data: html } = await axios.get(`https://www.mp4upload.com/embed-${match[1]}.html`, { headers: { 'User-Agent': UA, 'Referer': 'https://www.mp4upload.com/' }, timeout: 15000 });
        const unpacked = unpackJS(html);
        const videoMatch = unpacked.match(/src:\s*["'](https?:\/\/[^"']+\.mp4[^"']*)["']/i);
        return videoMatch ? videoMatch[1] : null;
    } catch { return null; }
}

async function getMegaBuffer(megaUrl) {
    try {
        let target = await resolveRedirectIfNeeded(megaUrl);
        const file = MegaFile.fromURL(target);
        await file.loadAttributes();
        if (file.size >= MAX_SIZE_BYTES) return { error: `Supera el límite (*${formatMB(file.size)} MB*).` };
        const buffer = await file.downloadBuffer();
        return { buffer, size: file.size, name: file.name };
    } catch { return null; }
}

async function searchHentaiLA(query) {
    try {
        const { data: html } = await axios.get(`https://hentaila.com/catalogo?search=${encodeURIComponent(query)}`, { headers: { 'User-Agent': UA, 'Referer': 'https://hentaila.com/' }, timeout: 10000 });
        const $ = cheerio.load(html);
        const results = [];
        $('a[href*="/media/"]').each((_, el) => {
            const $el = $(el);
            const href = $el.attr('href');
            if (href && href.includes('/media/')) {
                let title = $el.find('h3, h2, h4, .title').text().trim() || $el.attr('title') || $el.text().trim();
                title = title.replace(/^ver\s+/i, '').trim();
                const fullUrl = href.startsWith('http') ? href : `https://hentaila.com${href}`;
                if (title && !results.some(r => r.url === fullUrl)) results.push({ title, url: fullUrl });
            }
        });
        return results;
    } catch { return []; }
}

async function getSeriesDetails(seriesUrl) {
    try {
        const { data: html } = await axios.get(seriesUrl, { headers: { 'User-Agent': UA, 'Referer': 'https://hentaila.com/' }, timeout: 12000 });
        const $ = cheerio.load(html);
        const title = $('h1').first().text().trim() || $('title').text().replace(/-.*/, '').trim();
        let rawPoster = $('meta[property="og:image"]').attr('content') || $('.cover img, .poster img').attr('src') || '';
        let poster = rawPoster.startsWith('//') ? 'https:' + rawPoster : rawPoster;
        const genres = [];
        $('a[href*="/catalogo?genre="], .genres a').each((_, el) => { const g = $(el).text().trim(); if (g && !genres.includes(g)) genres.push(g); });
        let synopsis = $('.sinopsis, .synopsis, .description').text().trim() || 'Sin sinopsis.';
        let status = /en emisi/i.test($('.status').text()) ? 'En emisión' : 'Finalizado';
        const episodes = [];
        $('a[href*="/ver/"], a[href*="/media/"]').each((_, el) => {
            const href = $(el).attr('href');
            if (href && (href.includes('/ver/') || href.match(/\/media\/[^\/]+\/\d+/))) {
                const fullUrl = href.startsWith('http') ? href : `https://hentaila.com${href}`;
                if (!episodes.some(e => e.url === fullUrl)) {
                    const matchEp = href.match(/(?:-|\/)(\d+)$/);
                    episodes.push({ num: matchEp ? parseInt(matchEp[1]) : episodes.length + 1, url: fullUrl });
                }
            }
        });
        episodes.sort((a, b) => a.num - b.num);
        return { title, poster, genres: genres.join(' | ') || 'Hentai', synopsis, status, episodes: episodes.length > 0 ? episodes : [{ num: 1, url: seriesUrl }] };
    } catch { return null; }
}

async function getHentaiLADownloadUrl(pageUrl, episodeNum) {
    const { data: html } = await axios.get(pageUrl, { headers: { 'User-Agent': UA, 'Referer': 'https://hentaila.com/' }, timeout: 12000 });
    const $ = cheerio.load(html);
    const urlMatch = pageUrl.match(/\/(?:media|ver)\/([^\/]+)(?:\/(\d+))?/i);
    let animeName = urlMatch ? urlMatch[1].replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) : 'Video';
    let epNumber = episodeNum ? String(episodeNum).padStart(2, '0') : (urlMatch?.[2]?.padStart(2, '0') || '01');
    const fileName = `${epNumber} ${animeName}.mp4`;

    const links = { mediafire: null, yourupload: null, mp4upload: null, mega: null };
    $('script').each((_, el) => {
        const content = $(el).html() || '';
        if (/mediafire\.com/i.test(content) && !links.mediafire) links.mediafire = content.match(/https?:\/\/[^"'\s]+mediafire\.com\/[^\s"'<>]+/i)?.[0];
        if (/mega\.(?:nz|co\.nz)/i.test(content) && !links.mega) links.mega = content.match(/https?:\/\/[^"'\s]+mega\.(?:nz|co\.nz)\/[^\s"'<>]+/i)?.[0];
        if (/yourupload\.com/i.test(content) && !links.yourupload) links.yourupload = content.match(/https?:\/\/[^"'\s]+yourupload\.com\/[^\s"'<>]+/i)?.[0];
    });
    $('a, iframe, source').each((_, el) => {
        const href = $(el).attr('href') || $(el).attr('src') || '';
        if (/mediafire\.com/i.test(href) && !links.mediafire) links.mediafire = href;
        if (/yourupload\.com/i.test(href) && !links.yourupload) links.yourupload = href;
        if (/mp4upload\.com/i.test(href) && !links.mp4upload) links.mp4upload = href;
        if (/mega\.(?:nz|co\.nz)/i.test(href) && !links.mega) links.mega = href;
    });

    const providers = [
        { link: links.mediafire, extract: u => getMediafireDirectLink(u).then(d => d ? { downloadUrl: d, referer: 'https://mediafire.com/' } : null) },
        { link: links.yourupload, extract: u => getYourUploadDirectLink(u).then(d => d ? { downloadUrl: d, referer: 'https://www.yourupload.com/' } : null) },
        { link: links.mp4upload, extract: u => getMp4UploadDirectLink(u).then(d => d ? { downloadUrl: d, referer: 'https://www.mp4upload.com/' } : null) },
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

async function processDownload(m, conn, targetUrl, episodeNum) {
    const lockKey = `${m.chat}:${targetUrl}`;
    if (activeDownloads.has(lockKey)) return;
    activeDownloads.add(lockKey);
    const timeout = setTimeout(() => activeDownloads.delete(lockKey), LOCK_TTL_MS);

    await m.react('🕒');
    try {
        const resolved = await getHentaiLADownloadUrl(targetUrl, episodeNum);
        if (!resolved) {
            await m.react('✖️');
            return m.reply('❌ No se pudo extraer el enlace de descarga.');
        }
        const { downloadUrl, fileName, referer, buffer: directBuffer } = resolved;
        let buffer = directBuffer;

        if (!buffer && downloadUrl) {
            let contentLength = 0, acceptRanges = false;
            try {
                const head = await axios.head(downloadUrl, { headers: { 'User-Agent': UA, 'Referer': referer }, timeout: 10000 });
                contentLength = Number(head.headers['content-length'] || 0);
                acceptRanges = (head.headers['accept-ranges'] || '').includes('bytes');
            } catch {}

            await conn.reply(m.chat, `🔞 Descargando: \`${fileName}\``, m);
            if (acceptRanges && contentLength > 1024 * 1024) {
                buffer = await segmentedDownload(downloadUrl, { 'User-Agent': UA, 'Referer': referer }, contentLength, CONCURRENCY);
            } else {
                const fileRes = await axios.get(downloadUrl, { responseType: 'arraybuffer', headers: { 'User-Agent': UA, 'Referer': referer }, timeout: 300000 });
                buffer = Buffer.from(fileRes.data);
            }
        }

        if (!buffer || buffer.length < 100000) {
            await m.react('✖️');
            return m.reply('⚠️ Archivo vacío o enlace caducado.');
        }

        await conn.sendMessage(m.chat, { document: buffer, fileName, mimetype: lookup(fileName) || 'video/mp4' }, { quoted: m });
        await m.react('✔️');
    } catch (e) {
        await m.react('✖️');
        return m.reply(`⚠︎ Error: ${e.message}`);
    } finally {
        clearTimeout(timeout);
        activeDownloads.delete(lockKey);
    }
}

let handler = async (m, { conn, text }) => {
    if (!text) return m.reply(`🔥 *Ingresa el nombre para buscar*`);

    const args = text.trim().split(/\s+/);
    let targetUrl = args[0];
    let episodeNum = args[1] && !isNaN(args[1]) ? parseInt(args[1]) : null;

    if (/hentaila\.com/i.test(targetUrl)) {
        if (episodeNum && !targetUrl.endsWith(`/${episodeNum}`)) targetUrl += `/${episodeNum}`;
        return processDownload(m, conn, targetUrl, episodeNum);
    }

    if (text.trim().length < 3) return m.reply('⚠️ Ingresa al menos *3 caracteres*.');

    await m.react('🕒');
    const results = await searchHentaiLA(text.trim());
    if (!results || results.length === 0) {
        await m.react('✖️');
        return m.reply('❌ No se encontraron resultados.');
    }

    const topResults = results.slice(0, 10);
            let txt = `🔞 *HENTAILA - BÚSQUEDA*\n\n`;
    topResults.forEach((item, i) => { txt += `*${i + 1})* ${item.title}\n\n`; });
    txt += `➡️ *Usa el comando:* \`.hlacap [número]\` para seleccionar (Ej: \`.hlacap 1\`).`;

    const sentMsg = await conn.reply(m.chat, txt, m);
    await m.react('✔️');

    global.hentailaStore.set(m.chat, { 
        results: topResults, 
        searchMsgId: sentMsg.key.id // ID exacto del mensaje de búsqueda
    });
                
handler.command = ['hentaila', 'hla'];
handler.tags = ['downloader'];
export default handler;
