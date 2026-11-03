import axios from 'axios';
import * as cheerio from 'cheerio';
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

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

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
    txt += `➡️ *Usa el comando:* \`.hlasel [número]\` para seleccionar (Ej: \`.hlasel 1\`).`;

    await conn.reply(m.chat, txt, m);
    await m.react('✔️');

    global.hentailaStore.set(m.chat, { results: topResults });
};

handler.command = ['hentaila', 'hla'];
handler.tags = ['downloader'];
export default handler;
