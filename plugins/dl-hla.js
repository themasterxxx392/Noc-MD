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

let handler = async (m, { conn, text }) => {
    if (!text) return m.reply(`🔥 *Ingresa el nombre para buscar*`);

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

    // Enviamos el mensaje de búsqueda y guardamos su ID exacto
        const sentMsg = await conn.reply(m.chat, txt, m);
    await m.react('✔️');

    global.hentailaStore.set(m.chat, { 
        results: topResults, 
        searchMsgId: sentMsg.key.id 
    });
                                                         
handler.command = ['hentaila', 'hla'];
handler.tags = ['downloader'];
export default handler;
