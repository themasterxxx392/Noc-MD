import axios from 'axios';
import * as cheerio from 'cheerio';
import { lookup } from 'mime-types';
import { File as MegaFile } from 'megajs';
import os from 'os';
import path from 'path';
import fs from 'fs';
import https from 'https';

// Almacén global interno para las sesiones de HentaiLA por chat
global.hentailaStore = global.hentailaStore || new Map();

const customTmpDir = path.join(process.cwd(), 'tmp');
if (!fs.existsSync(customTmpDir)) {
    fs.mkdirSync(customTmpDir, { recursive: true });
}
process.env.TMPDIR = customTmpDir;
os.tmpdir = () => customTmpDir;

const MAX_SIZE_BYTES = 1024 * 1024 * 1024; // 1 GB
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

const activeDownloads = new Set();
const LOCK_TTL_MS = 3 * 60 * 1000;

const CONCURRENCY = 6;
const keepAliveAgent = new https.Agent({ 
    keepAlive: true, 
    maxSockets: CONCURRENCY + 2, 
    keepAliveMsecs: 10000 
});

function formatMB(bytes) {
    return (bytes / (1024 * 1024)).toFixed(2);
}

function unpackJS(packed) {
    try {
        const regex = /eval\(function\(p,a,c,k,e,d\).+?\}\('(.+?)',(\d+),(\d+),'(.+?)'\.split\('\|'\)/s;
        const match = packed.match(regex);
        if (!match) return packed;
        let [_, p, a, c, k] = match;
        a = parseInt(a);
        c = parseInt(c);
        k = k.split('|');
        function e(c) {
            return (c < a ? '' : e(Math.floor(c / a))) + ((c = c % a) > 35 ? String.fromCharCode(c + 29) : c.toString(36));
        }
        while (c--) {
            if (k[c]) {
                p = p.replace(new RegExp('\\b' + e(c) + '\\b', 'g'), k[c]);
            }
        }
        return p;
    } catch {
        return packed;
    }
}

async function segmentedDownload(url, baseHeaders, totalSize, concurrency = CONCURRENCY) {
    const chunkSize = Math.ceil(totalSize / concurrency);
    const tasks = [];

    for (let i = 0; i < concurrency; i++) {
        const start = i * chunkSize;
        const end = Math.min(start + chunkSize - 1, totalSize - 1);
        if (start > end) continue;

        tasks.push(
            axios.get(url, {
                responseType: 'arraybuffer',
                headers: { ...baseHeaders, Range: `bytes=${start}-${end}` },
                timeout: 300000,
                maxRedirects: 5,
                httpsAgent: keepAliveAgent
            }).then(r => ({ index: i, data: Buffer.from(r.data) }))
        );
    }

    const results = await Promise.all(tasks);
    results.sort((a, b) => a.index - b.index);
    return Buffer.concat(results.map(r => r.data));
}

async function resolveRedirectIfNeeded(url) {
    if (!url) return null;
    if (url.includes('mediafire.com') || url.includes('yourupload.com') || url.includes('mega.nz') || url.includes('mp4upload.com')) {
        return url;
    }
    try {
        const res = await axios.get(url, {
            headers: { 'User-Agent': UA, 'Referer': 'https://hentaila.com/' },
            maxRedirects: 5,
            timeout: 10000
        });
        const finalUrl = res.request?.res?.responseUrl || res.config?.url || '';
        if (finalUrl && finalUrl !== url) return finalUrl;

        const match = res.data.match(/https?:\/\/(?:www\.)?(?:mediafire\.com|yourupload\.com|mega\.nz|mp4upload\.com)\/[^\s"'<>]+/i);
        if (match) return match[0];

        return url;
    } catch (e) {
        return url;
    }
}

async function getMediafireDirectLink(mediafireUrl) {
    try {
        if (!mediafireUrl) return null;
        let targetUrl = await resolveRedirectIfNeeded(mediafireUrl);

        const { data: html } = await axios.get(targetUrl, {
            headers: { 
                'User-Agent': UA,
                'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
                'Referer': 'https://www.mediafire.com/'
            },
            timeout: 12000
        });
        const $ = cheerio.load(html);

        let downloadButton = $('#downloadButton').attr('href') || $('#download_link').attr('href') || $('a.input.popsok').attr('href');
        if (downloadButton) return downloadButton;

        const directMatch = html.match(/https?:\/\/download\d*\.mediafire\.com\/[^\s"'<>]+/i);
        if (directMatch) return directMatch[0];

        return null;
    } catch (e) {
        return null;
    }
        }

async function getYourUploadDirectLink(yourUploadUrl) {
    try {
        if (!yourUploadUrl) return null;
        let target = await resolveRedirectIfNeeded(yourUploadUrl);

        const matchId = target.match(/yourupload\.com\/(?:watch|embed|download)\/([A-Za-z0-9]+)/i);
        const id = matchId ? matchId[1] : null;

        const urlsToTry = [];
        if (id) {
            urlsToTry.push(`https://www.yourupload.com/embed/${id}`);
            urlsToTry.push(`https://www.yourupload.com/watch/${id}`);
        }
        urlsToTry.push(target);

        for (const url of urlsToTry) {
            try {
                const { data } = await axios.get(url, {
                    headers: {
                        'User-Agent': UA,
                        'Referer': 'https://www.yourupload.com/',
                        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8'
                    },
                    timeout: 12000
                });

                const $ = cheerio.load(data);
                const ogVideo = $('meta[property="og:video"]').attr('content') || 
                                $('meta[property="og:video:src"]').attr('content') ||
                                $('meta[name="twitter:player"]').attr('content');
                if (ogVideo) return ogVideo;

                const sourceSrc = $('source').attr('src') || $('video').attr('src');
                if (sourceSrc) {
                    return sourceSrc.startsWith('//') ? 'https:' + sourceSrc : sourceSrc;
                }

                const fileMatch = data.match(/file\s*:\s*["'](?<url>https?:\/\/[^"']+\.mp4[^"']*)["']/i) ||
                                  data.match(/sources\s*:\s*\[\s*\{\s*file\s*:\s*["']([^"']+)["']/i) ||
                                  data.match(/(https?:\/\/[^"']+\.yourupload\.com\/(?:download|noview|stream)\/[^"'\s]+)/i) ||
                                  data.match(/(https?:\/\/[^"']+\.yourupload\.com\/[^"']+\.mp4[^"']*)/i);

                if (fileMatch) {
                    const found = fileMatch.groups?.url || fileMatch[1];
                    if (found) return found.startsWith('//') ? 'https:' + found : found;
                }
            } catch (e) {}
        }
    } catch (e) {}
    return null;
}

async function getMp4UploadDirectLink(mp4Url) {
    try {
        if (!mp4Url) return null;
        let target = await resolveRedirectIfNeeded(mp4Url);

        const match = target.match(/mp4upload\.com\/(?:embed-)?([a-zA-Z0-9]+)/i);
        if (!match) return null;
        const fileId = match[1];

        const embedUrl = `https://www.mp4upload.com/embed-${fileId}.html`;
        const { data: html } = await axios.get(embedUrl, { headers: { 'User-Agent': UA, 'Referer': 'https://www.mp4upload.com/' }, timeout: 15000 });
        const unpacked = unpackJS(html);

        const videoMatch = unpacked.match(/src:\s*["'](https?:\/\/[^"']+\.mp4[^"']*)["']/i) || 
                           unpacked.match(/(https?:\/\/[^"']+\.mp4)/i);

        return videoMatch ? (videoMatch.groups?.url || videoMatch[1]) : null;
    } catch (e) {
        return null;
    }
}

async function getMegaBuffer(megaUrl) {
    try {
        if (!megaUrl) return null;
        let target = await resolveRedirectIfNeeded(megaUrl);

        const file = MegaFile.fromURL(target);
        await file.loadAttributes();

        if (file.size >= MAX_SIZE_BYTES) {
            return { error: `El archivo en MEGA supera el límite (*${formatMB(file.size)} MB*).` };
        }

        const buffer = await file.downloadBuffer();
        return { buffer, size: file.size, name: file.name };
    } catch (e) {
        return null;
    }
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
                if (!title || title.length <= 2) {
                    const slugMatch = href.match(/\/media\/([^\/]+)/);
                    if (slugMatch && slugMatch[1]) {
                        title = slugMatch[1].replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
                    }
                }
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

        let rawPoster = $('meta[property="og:image"]').attr('content') || 
                        $('.cover img, .poster img, .anime-cover img').attr('src') || '';
        let poster = rawPoster.startsWith('//') ? 'https:' + rawPoster : rawPoster;

        const genres = [];
        $('a[href*="/catalogo?genre="], .genres a, .genre-item').each((_, el) => {
            const g = $(el).text().trim();
            if (g && !genres.includes(g)) genres.push(g);
        });

        let synopsis = $('.sinopsis, .synopsis, .description, #synopsis').text().trim() || 'Sin sinopsis disponible.';
        let status = /en emisi/i.test($('.status, .estado').text()) ? 'En emisión' : 'Finalizado';

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
            genres: genres.join(' | ') || 'Hentai',
            synopsis,
            status,
            episodes: episodes.length > 0 ? episodes : [{ num: 1, url: seriesUrl }]
        };
    } catch (e) {
        return null;
    }
            }

function formatFileName(pageUrl, $, episodeNum) {
    let animeName = '';
    let epNumber = episodeNum ? String(episodeNum).padStart(2, '0') : '01';

    const urlMatch = pageUrl.match(/\/(?:media|ver)\/([^\/]+)(?:\/(\d+))?/i);
    if (urlMatch) {
        animeName = urlMatch[1].replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
        if (!episodeNum && urlMatch[2]) epNumber = urlMatch[2].padStart(2, '0');
    }

    return `${epNumber} ${animeName || 'Hentai Video'}.mp4`;
}

async function getHentaiLADownloadUrl(pageUrl, episodeNum) {
    const { data: html } = await axios.get(pageUrl, {
        headers: { 'User-Agent': UA, 'Referer': 'https://hentaila.com/' },
        timeout: 12000
    });

    const $ = cheerio.load(html);
    const fileName = formatFileName(pageUrl, $, episodeNum);

    const links = { mediafire: null, yourupload: null, mp4upload: null, mega: null, directMp4: null };

    $('script').each((_, el) => {
        const content = $(el).html() || '';
        if (!content) return;
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
        { name: 'Mediafire', link: links.mediafire, extract: u => getMediafireDirectLink(u).then(d => d ? { downloadUrl: d, referer: 'https://mediafire.com/' } : null) },
        { name: 'YourUpload', link: links.yourupload, extract: u => getYourUploadDirectLink(u).then(d => d ? { downloadUrl: d, referer: 'https://www.yourupload.com/' } : null) },
        { name: 'Mp4Upload', link: links.mp4upload, extract: u => getMp4UploadDirectLink(u).then(d => d ? { downloadUrl: d, referer: 'https://www.mp4upload.com/' } : null) },
        { name: 'MEGA', link: links.mega, extract: u => getMegaBuffer(u).then(res => res && !res.error ? { buffer: res.buffer, knownSize: res.size } : null) },
        { name: 'Direct MP4', link: links.directMp4, extract: u => Promise.resolve({ downloadUrl: u, referer: pageUrl }) }
    ];

    for (const p of providers) {
        if (!p.link) continue;
        try {
            const res = await p.extract(p.link);
            if (res && (res.downloadUrl || res.buffer)) return { ...res, fileName };
        } catch (e) {}
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
            return m.reply('❌ No se pudo extraer el enlace de descarga de este episodio.');
        }

        const { downloadUrl, fileName, referer, buffer: directBuffer } = resolved;
        let buffer = directBuffer;

        if (!buffer && downloadUrl) {
            let contentLength = 0;
            let acceptRanges = false;
            try {
                const head = await axios.head(downloadUrl, { headers: { 'User-Agent': UA, 'Referer': referer }, timeout: 10000 });
                contentLength = Number(head.headers['content-length'] || 0);
                acceptRanges = (head.headers['accept-ranges'] || '').includes('bytes');
            } catch (e) {}

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
            return m.reply('⚠️ Error: Archivo vacío o enlace caducado.');
        }

        const mimetype = lookup(fileName) || 'video/mp4';
        await conn.sendMessage(m.chat, { document: buffer, fileName, mimetype }, { quoted: m });
        await m.react('✔️');
    } catch (e) {
        await m.react('✖️');
        return m.reply(`⚠︎ Error en la descarga: ${e.message}`);
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

    if (text.trim().length < 3) return m.reply('⚠️ Ingresa al menos *3 caracteres* para buscar.');

    await m.react('🕒');
    const results = await searchHentaiLA(text.trim());

    if (!results || results.length === 0) {
        await m.react('✖️');
        return m.reply('❌ No se encontraron resultados.');
    }

    const topResults = results.slice(0, 10);
    let txt = `🔞 *HENTAILA - BÚSQUEDA*\n\n`;
    topResults.forEach((item, i) => { txt += `*${i + 1})* ${item.title}\n\n`; });
    txt += `➡️ *Responde a este mensaje con el número (1-${topResults.length}) para ver los capítulos.*`;

    await conn.reply(m.chat, txt, m);
    await m.react('✔️');

    global.hentailaStore.set(m.chat, {
        step: 'search',
        results: topResults
    });
};

// Capturador automático interno de números (Intercepta el chat actual de manera independiente)
handler.before = async function (m, { conn }) {
    if (!m.text || !global.hentailaStore) return;
    const session = global.hentailaStore.get(m.chat);
    if (!session) return;

    const cleanText = m.text.trim().replace(/[^0-9]/g, '');
    const inputNum = parseInt(cleanText);
    if (isNaN(inputNum)) return;

    if (session.step === 'search') {
        if (inputNum < 1 || inputNum > session.results.length) return;

        global.hentailaStore.delete(m.chat);
        const selected = session.results[inputNum - 1];
        await m.react('🕒');

        const details = await getSeriesDetails(selected.url);
        if (!details) {
            await m.react('✖️');
            return m.reply('❌ No se pudieron obtener los detalles.');
        }

        let txt = `*[🔞] ${details.title.toUpperCase()}*\n\n`;
        txt += `» *GÉNEROS:* \`${details.genres}\`\n`;
        txt += `» *ESTADO:* \`${details.status}\`\n`;
        txt += `» *CAPÍTULOS:* \`${details.episodes.length}\`\n\n`;
        txt += `--- *SINOPSIS* ---\n_${details.synopsis}_\n\n`;
        txt += `> *DESCARGAR:* Escribe el número del capítulo que deseas.`;

        if (details.poster) {
            await conn.sendMessage(m.chat, { image: { url: details.poster }, caption: txt }, { quoted: m });
        } else {
            await m.reply(txt);
        }

        await m.react('✔️');

        global.hentailaStore.set(m.chat, {
            step: 'details',
            episodes: details.episodes
        });
        return true;
    }

    if (session.step === 'details') {
        const targetEp = session.episodes.find(e => e.num === inputNum) || session.episodes[inputNum - 1];
        if (!targetEp) return;

        global.hentailaStore.delete(m.chat);
        await processDownload(m, conn, targetEp.url, targetEp.num);
        return true;
    }
};

handler.command = ['hentaila', 'hla'];
handler.tags = ['downloader'];
export default handler;
