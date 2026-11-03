import axios from 'axios';
import * as cheerio from 'cheerio';
import { lookup } from 'mime-types';
import { File as MegaFile } from 'megajs';
import https from 'https';

function formatMB(bytes) {
    return (bytes / (1024 * 1024)).toFixed(2);
}

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

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
                const fileMatch = data.match(/file\s*:\s*["'](?<url>https?:\/\/[^"']+\.mp4[^"']*)["']/i);
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
        const videoMatch = html.match(/src:\s*["'](https?:\/\/[^"']+\.mp4[^"']*)["']/i);
        return videoMatch ? videoMatch[1] : null;
    } catch { return null; }
}

async function getMegaBuffer(megaUrl) {
    try {
        let target = await resolveRedirectIfNeeded(megaUrl);
        const file = MegaFile.fromURL(target);
        await file.loadAttributes();
        const buffer = await file.downloadBuffer();
        return { buffer, size: file.size, name: file.name };
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

let handler = async (m, { conn, text }) => {
    if (!global.hentailaStore) return m.reply('⚠️ No hay ninguna búsqueda activa.');
    const session = global.hentailaStore.get(m.chat);
    if (!session || !session.episodeStores) return m.reply('⚠️ Primero selecciona un anime usando *.hlasel [número]*');

    if (!text || !text.trim()) {
        return m.reply('⚠️ Ingresa el número del capítulo (Ej: `.hladl 1`).');
    }

    const epNum = parseInt(text.trim());
    if (isNaN(epNum)) return m.reply('⚠️ Ingresa un número válido.');

    // Obtenemos el ID del mensaje al que el usuario está respondiendo
    const quotedId = m.quoted ? m.quoted.id : null;
    const episodes = quotedId ? session.episodeStores[quotedId] : null;

    if (!episodes) {
        return m.reply('⚠️ Por favor, **responde directamente** al mensaje del póster/capítulos del anime que deseas descargar.');
    }

    const targetEp = episodes.find(e => e.num === epNum) || episodes[epNum - 1];
    if (!targetEp) {
        return m.reply('⚠️ Número de capítulo no encontrado para este anime.');
    }

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
            } catch {}

            await conn.reply(m.chat, `🔞 Descargando: \`${fileName}\`${contentLength ? ` (*${formatMB(contentLength)} MB*)` : ''}`, m);

            const fileRes = await axios.get(downloadUrl, { responseType: 'arraybuffer', headers: { 'User-Agent': UA, 'Referer': referer }, timeout: 300000 });
            buffer = Buffer.from(fileRes.data);
        }

        if (!buffer || buffer.length < 100000) {
            await m.react('✖️');
            return m.reply('⚠️ Error: Archivo vacío o enlace caducado.');
        }

        await conn.sendMessage(m.chat, { document: buffer, fileName, mimetype: lookup(fileName) || 'video/mp4' }, { quoted: m });
        await m.react('✔️');
    } catch (e) {
        await m.react('✖️');
        return m.reply(`⚠︎ Error en la descarga: ${e.message}`);
    }
};

handler.command = ['hladl'];
export default handler;
