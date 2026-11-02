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
        const headers = {
            'User-Agent': UA,
            'Referer': 'https://www.mp4upload.com/'
        };

        const { data: html } = await axios.get(embedUrl, { headers, timeout: 15000 });
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
            headers: { 
                'User-Agent': UA, 
                'Referer': 'https://hentaila.com/' 
            },
            timeout: 10000
        });

        const $ = cheerio.load(html);
        const results = [];

        $('a[href*="/media/"]').each((_, el) => {
            const $el = $(el);
            const href = $el.attr('href');

            if (href && href.includes('/media/')) {
                let title = $el.find('h3, h2, h4, .title, .name').text().trim();
                if (!title) {
                    title = $el.attr('title') || $el.text().trim();
                }

                if (!title || title.length <= 2) {
                    const slugMatch = href.match(/\/media\/([^\/]+)/);
                    if (slugMatch && slugMatch[1]) {
                        title = slugMatch[1]
                            .replace(/-/g, ' ')
                            .replace(/\b\w/g, l => l.toUpperCase());
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
                        $('meta[name="twitter:image"]').attr('content') || 
                        $('.cover img, .poster img, .anime-cover img').attr('data-src') ||
                        $('.cover img, .poster img, .anime-cover img').attr('src') || '';

        let poster = '';
        if (rawPoster) {
            poster = rawPoster.startsWith('//') ? 'https:' + rawPoster : rawPoster;
            poster = poster
                .replace(/\/thumbs?\//i, '/uploads/')
                .replace(/[-_]thumb/i, '')
                .replace(/-\d+x\d+(\.(?:jpg|jpeg|png|webp))/i, '$1');
        }

        const genres = [];
        $('a[href*="/catalogo?genre="], .genres a, .genre-item').each((_, el) => {
            const g = $(el).text().trim();
            if (g && !genres.includes(g)) genres.push(g);
        });

        let synopsis = $('.sinopsis, .synopsis, .description, .story, #synopsis').text().trim() ||
                       $('meta[property="og:description"]').attr('content') || 
                       $('meta[name="description"]').attr('content') || 
                       'Sin sinopsis disponible.';

        synopsis = synopsis.replace(/^ver\s+/i, '').replace(/\s+/g, ' ').trim();

        let statusText = $('.status, .estado, .type, .badge').text().trim();
        let status = 'Finalizado';
        if (/en emisi/i.test(statusText)) {
            status = 'En emisión';
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
            genres: genres.length > 0 ? genres.join(' | ') : 'Hentai',
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
    let epNumber = episodeNum ? String(episodeNum).padStart(2, '0') : '';

    const urlMatch = pageUrl.match(/\/(?:media|ver)\/([^\/]+)(?:\/(\d+))?/i);
    if (urlMatch) {
        let slug = urlMatch[1];
        let epFromUrl = urlMatch[2];

        if (!epNumber && epFromUrl) {
            epNumber = epFromUrl.padStart(2, '0');
        }

        animeName = slug
            .replace(/^-+|-+$/g, '')
            .replace(/-/g, ' ')
            .replace(/\b\w/g, l => l.toUpperCase());
    }

    if (!epNumber) {
        epNumber = '01';
    }

    if (!animeName) {
        const pageTitle = $('h1').first().text().trim() || $('title').text().trim();
        animeName = pageTitle
            .replace(/ver\s+/i, '')
            .replace(/episodio.*/i, '')
            .replace(/capitulo.*/i, '')
            .replace(/[\\/:*?"<>|]/g, '')
            .trim() || 'Hentai Video';
    }

    return `${epNumber} ${animeName}.mp4`;
}

async function getHentaiLADownloadUrl(pageUrl, episodeNum) {
    const { data: html } = await axios.get(pageUrl, {
        headers: {
            'User-Agent': UA,
            'Referer': 'https://hentaila.com/'
        },
        timeout: 12000
    });

    const $ = cheerio.load(html);
    const fileName = formatFileName(pageUrl, $, episodeNum);

    const links = {
        mediafire: null,
        yourupload: null,
        mp4upload: null,
        mega: null,
        directMp4: null
    };

    $('script').each((_, el) => {
        const content = $(el).html() || '';
        if (!content) return;

        const mfMatch = content.match(/https?:\/\/(?:www\.)?mediafire\.com\/[^\s"'<>]+/i) ||
                        content.match(/["'](https?:\/\/[^"']*mediafire[^"']*)["']/i) ||
                        content.match(/["'](\/(?:download|option)\/[^"']*mediafire[^"']*)["']/i);
        if (mfMatch && !links.mediafire) links.mediafire = mfMatch[1] || mfMatch[0];

        const megaMatch = content.match(/https?:\/\/(?:www\.)?mega\.(?:nz|co\.nz)\/[^\s"'<>]+/i) ||
                          content.match(/["'](https?:\/\/[^"']*mega\.(?:nz|co\.nz)[^"']*)["']/i);
        if (megaMatch && !links.mega) links.mega = megaMatch[1] || megaMatch[0];

        const yuMatch = content.match(/https?:\/\/(?:www\.)?yourupload\.com\/(?:watch|embed|download)\/[A-Za-z0-9]+/i) ||
                        content.match(/["'](https?:\/\/[^"']*yourupload[^"']*)["']/i);
        if (yuMatch && !links.yourupload) links.yourupload = yuMatch[1] || yuMatch[0];

        const mp4Match = content.match(/https?:\/\/(?:www\.)?mp4upload\.com\/(?:embed-)?([a-zA-Z0-9]+)/i);
        if (mp4Match && !links.mp4upload) links.mp4upload = `https://www.mp4upload.com/embed-${mp4Match[1]}.html`;
    });

    $('a, iframe, source, button, div').each((_, el) => {
        const $el = $(el);
        const href = $el.attr('href') || $el.attr('src') || $el.attr('data-url') || $el.attr('data-link') || '';
        const text = $el.text().trim().toLowerCase();

        if (href.includes('mediafire.com') || (text.includes('mediafire') && href)) {
            if (!links.mediafire) links.mediafire = href.startsWith('http') ? href : `https://hentaila.com${href.startsWith('/') ? '' : '/'}${href}`;
        }
        if (href.includes('yourupload.com') && !links.yourupload) links.yourupload = href;
        if (href.includes('mp4upload.com') && !links.mp4upload) {
            const match = href.match(/https?:\/\/(www\.)?mp4upload\.com\/(?:embed-)?([a-zA-Z0-9]+)/i);
            if (match) links.mp4upload = `https://www.mp4upload.com/embed-${match[2]}.html`;
        }
        if ((href.includes('mega.nz') || href.includes('mega.co.nz')) && !links.mega) links.mega = href;
        if (href.includes('.mp4') && !links.directMp4) links.directMp4 = href;
    });

if (!links.mediafire) {
        const match = html.match(/https?:\/\/(?:www\.)?mediafire\.com\/[^\s"'<>]+/i) ||
                      html.match(/https?:\/\/hentaila\.com\/(?:download|option)\/[^\s"'<>]*/i);
        if (match) links.mediafire = match[0];
    }
    if (!links.yourupload) {
        const match = html.match(/https?:\/\/(?:www\.)?yourupload\.com\/(?:watch|embed|download)\/[A-Za-z0-9]+/i);
        if (match) links.yourupload = match[0];
    }
    if (!links.mp4upload) {
        const match = html.match(/https?:\/\/(?:www\.)?mp4upload\.com\/(?:embed-)?([a-zA-Z0-9]+)/i);
        if (match) links.mp4upload = `https://www.mp4upload.com/embed-${match[2]}.html`;
    }
    if (!links.mega) {
        const match = html.match(/https?:\/\/(?:www\.)?mega\.(?:nz|co\.nz)\/([^\s"'<>]+)/i);
        if (match) links.mega = match[0];
    }

    const providers = [
        {
            name: 'Mediafire',
            link: links.mediafire,
            extract: async (url) => {
                const direct = await getMediafireDirectLink(url);
                if (direct) return { downloadUrl: direct, referer: 'https://mediafire.com/' };
                return null;
            }
        },
        {
            name: 'YourUpload',
            link: links.yourupload,
            extract: async (url) => {
                let direct = await getYourUploadDirectLink(url);
                if (direct) {
                    if (direct.startsWith('//')) direct = 'https:' + direct;
                    else if (direct.startsWith('/')) direct = 'https://www.yourupload.com' + direct;
                    return { downloadUrl: direct, referer: 'https://www.yourupload.com/' };
                }
                return null;
            }
        },
        {
            name: 'Mp4Upload',
            link: links.mp4upload,
            extract: async (url) => {
                const direct = await getMp4UploadDirectLink(url);
                if (direct) return { downloadUrl: direct, referer: 'https://www.mp4upload.com/' };
                return null;
            }
        },
        {
            name: 'MEGA',
            link: links.mega,
            extract: async (url) => {
                const megaRes = await getMegaBuffer(url);
                if (megaRes && !megaRes.error && megaRes.buffer) {
                    return { buffer: megaRes.buffer, knownSize: megaRes.size };
                }
                return null;
            }
        },
        {
            name: 'Direct MP4',
            link: links.directMp4,
            extract: async (url) => {
                return { downloadUrl: url, referer: pageUrl };
            }
        }
    ];

    for (const provider of providers) {
        if (!provider.link) continue;

        try {
            const res = await provider.extract(provider.link);
            if (res && (res.downloadUrl || res.buffer)) {
                return { ...res, fileName };
            }
        } catch (e) {
            console.warn(`[HentaiLA] Falló servidor ${provider.name}, intentando siguiente...`);
        }
    }

    return null;
}

async function processDownload(m, conn, downloadUrlTarget, episodeNum) {
    const lockKey = `${m.chat}:${downloadUrlTarget}`;
    if (activeDownloads.has(lockKey)) return;

    activeDownloads.add(lockKey);
    const lockTimeout = setTimeout(() => activeDownloads.delete(lockKey), LOCK_TTL_MS);

    await m.react('🕒');

    try {
        const resolved = await getHentaiLADownloadUrl(downloadUrlTarget, episodeNum);

        if (!resolved) {
            await m.react('✖️');
            return m.reply('❌ No se pudo descargar este episodio de ninguno de los servidores disponibles.');
        }

        const { downloadUrl, fileName, referer, buffer: directBuffer, knownSize: megaSize } = resolved;

        let buffer = directBuffer;
        let knownSize = megaSize || null;

        if (!buffer && downloadUrl) {
            let contentLength = 0;
            let acceptRanges = false;

            try {
                const head = await axios.head(downloadUrl, { 
                    headers: { 'User-Agent': UA, 'Referer': referer }, 
                    timeout: 10000,
                    httpsAgent: keepAliveAgent
                });
                contentLength = Number(head.headers['content-length'] || 0);
                acceptRanges = (head.headers['accept-ranges'] || '').includes('bytes');
                if (contentLength) {
                    knownSize = contentLength;
                    if (contentLength >= MAX_SIZE_BYTES) {
                        await m.react('✖️');
                        return m.reply(`ꕥ El archivo supera el límite permitido (*${formatMB(contentLength)} MB* / Máx: *1024 MB*).`);
                    }
                }
            } catch (headErr) {}

            await conn.reply(m.chat, `🔞 Descargando: \`${fileName}\`${contentLength ? ` (*${formatMB(contentLength)} MB*)` : ''}`, m);

            if (acceptRanges && contentLength > 1024 * 1024) {
                buffer = await segmentedDownload(downloadUrl, { 'User-Agent': UA, 'Referer': referer }, contentLength, CONCURRENCY);
            } else {
                const fileResponse = await axios.get(downloadUrl, {
                    responseType: 'arraybuffer',
                    headers: { 
                        'User-Agent': UA, 
                        'Referer': referer,
                        'Range': 'bytes=0-' 
                    },
                    timeout: 300000,
                    httpsAgent: keepAliveAgent
                });
                buffer = Buffer.from(fileResponse.data);
            }
        } else if (buffer) {
            await conn.reply(m.chat, `🔞 Descargando: \`${fileName}\``, m);
        }

        if (!buffer || buffer.length < 100000) {
            await m.react('✖️');
            return m.reply('⚠️ El servidor devolvió una respuesta inválida o el enlace caducó.');
        }

        if (buffer.length >= MAX_SIZE_BYTES) {
            await m.react('✖️');
            return m.reply(`ꕥ El archivo supera el límite permitido (*${formatMB(buffer.length)} MB* / Máx: *1024 MB*).`);
        }

        const mimetype = lookup(fileName) || 'video/mp4';

        await conn.sendMessage(m.chat, {
            document: buffer,
            fileName,
            mimetype
        }, { quoted: m });

        await m.react('✔️');

    } catch (error) {
        console.error('Error en HentaiLA DL:', error.message);
        await m.react('✖️');
        return m.reply(`⚠︎ Ocurrió un error al procesar la descarga:\n\n${error.message}`);
    } finally {
        clearTimeout(lockTimeout);
        activeDownloads.delete(lockKey);
    }
}

let handler = async (m, { conn, text, usedPrefix, command }) => {
    if (!text) {
        return m.reply(`🔥 *Ingresa el nombre para buscar*`);
    }

    const args = text.trim().split(/\s+/);
    let targetUrl = args[0];
    let episodeNum = args[1] && !isNaN(args[1]) ? parseInt(args[1]) : null;

    if (/hentaila\.com/i.test(targetUrl)) {
        if (episodeNum && !targetUrl.endsWith(`/${episodeNum}`)) {
            targetUrl = targetUrl.replace(/\/+$/, '') + `/${episodeNum}`;
        }
        return processDownload(m, conn, targetUrl, episodeNum);
    }

    const queryText = text.trim();
    if (queryText.length < 3) {
        return m.reply('⚠️ Por favor, ingresa al menos *3 caracteres* para realizar la búsqueda.');
    }

    await m.react('🕒');
    const results = await searchHentaiLA(queryText);

    if (!results || results.length === 0) {
        await m.react('✖️');
        return m.reply('❌ No se encontraron resultados para tu búsqueda.');
    }

    const topResults = results.slice(0, 10);

    let txt = `🔞 *HENTAILA - BÚSQUEDA*\n\n`;
    topResults.forEach((item, index) => {
        txt += `*${index + 1})* ${item.title}\n\n`;
    });
    txt += `➡️ *Responde a este mensaje con el número (1-${topResults.length}) para ver los detalles y capítulos.*`;

    const keyMsg = await conn.reply(m.chat, txt, m);
    await m.react('✔️');

    const timer = setTimeout(() => {
        global.hentailaStore.delete(keyMsg.key.id);
    }, 10 * 60 * 1000);

    global.hentailaStore.set(keyMsg.key.id, {
        type: 'search',
        results: topResults,
        timer
    });
};

handler.before = async function (m, { conn }) {
    if (!m.text || !m.quoted || !global.hentailaStore.has(m.quoted.id)) return;

    const session = global.hentailaStore.get(m.quoted.id);
    const inputNum = parseInt(m.text.trim());

    if (session.type === 'search') {
        if (isNaN(inputNum) || inputNum < 1 || inputNum > session.results.length) {
            return m.reply(`⚠️ Por favor, responde con un número válido del *1 al ${session.results.length}*.`);
        }

        const selected = session.results[inputNum - 1];
        await m.react('🕒');

        const details = await getSeriesDetails(selected.url);
        if (!details) {
            await m.react('✖️');
            return m.reply('❌ No se pudieron obtener los detalles de este título.');
        }

        const minEp = String(details.episodes[0]?.num || 1).padStart(2, '0');
        const maxEp = String(details.episodes[details.episodes.length - 1]?.num || 1).padStart(2, '0');
        const capRange = details.episodes.length > 1 ? `${minEp} - ${maxEp}` : minEp;

        let txt = `*[🔞] ${details.title.toUpperCase()}*\n\n`;
        txt += `» *GÉNEROS:* \`${details.genres}\`\n`;
        txt += `» *ESTADO:* \`${details.status}\`\n`;
        txt += `» *CAPÍTULOS:* \`${capRange}\`\n\n`;
        txt += `--- *SINOPSIS* ---\n`;
        txt += `_${details.synopsis}_\n\n`;
        txt += `> *DESCARGAR:* Responde con el número. Ej: \`1\``;

        let detailsMsg;
        if (details.poster) {
            detailsMsg = await conn.sendMessage(m.chat, { image: { url: details.poster }, caption: txt }, { quoted: m });
        } else {
            detailsMsg = await conn.reply(m.chat, txt, m);
        }

        await m.react('✔️');

        const timer = setTimeout(() => {
            global.hentailaStore.delete(detailsMsg.key.id);
        }, 10 * 60 * 1000);

        global.hentailaStore.set(detailsMsg.key.id, {
            type: 'details',
            episodes: details.episodes,
            timer
        });

        return true;
    }

    if (session.type === 'details') {
        if (isNaN(inputNum)) {
            return m.reply('⚠️ Por favor escribe solo el número del capítulo que deseas descargar.');
        }

        const targetEp = session.episodes.find(e => e.num === inputNum) || session.episodes[inputNum - 1];

        if (!targetEp) {
            return m.reply(`⚠️ Capítulo no disponible. Elige un número válido.`);
        }

        await processDownload(m, conn, targetEp.url, targetEp.num);

        return true;
    }
};

handler.command = ['hentaila', 'hla'];
handler.tags = ['downloader'];
handler.help = ['hentaila'];

export default handler;
