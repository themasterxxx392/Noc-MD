import axios from 'axios';
import * as cheerio from 'cheerio';
import { lookup } from 'mime-types';
import { File as MegaFile } from 'megajs';

// Reutilizamos la misma lógica de descarga segura
let handler = async (m, { conn, text }) => {
    if (!global.hentailaStore) return m.reply('⚠️ No hay ninguna búsqueda activa.');
    const session = global.hentailaStore.get(m.chat);
    if (!session) return m.reply('⚠️ Primero realiza una búsqueda con *.hla [nombre]*');

    const inputNum = parseInt(text.trim());
    if (isNaN(inputNum)) return m.reply('⚠️ Ingresa un número válido (Ej: *.hlacap 1*).');

    if (session.step === 'search') {
        if (inputNum < 1 || inputNum > session.results.length) return m.reply(`⚠️ Número fuera de rango (1-${session.results.length}).`);

        global.hentailaStore.delete(m.chat);
        const selected = session.results[inputNum - 1];
        await m.react('🕒');

        // Obtenemos los capítulos de la serie seleccionada
        const { data: html } = await axios.get(selected.url, { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 12000 });
        const $ = cheerio.load(html);
        const title = $('h1').first().text().trim() || selected.title;
        let rawPoster = $('meta[property="og:image"]').attr('content') || $('.cover img').attr('src') || '';
        let poster = rawPoster.startsWith('//') ? 'https:' + rawPoster : rawPoster;

        const episodes = [];
        $('a[href*="/ver/"], a[href*="/media/"]').each((_, el) => {
            const href = $(el).attr('href');
            if (href && (href.includes('/ver/') || href.match(/\/media\/[^\/]+\/\d+/))) {
                const fullUrl = href.startsWith('http' ) ? href : `https://hentaila.com${href}`;
                if (!episodes.some(e => e.url === fullUrl)) {
                    const matchEp = href.match(/(?:-|\/)(\d+)$/);
                    episodes.push({ num: matchEp ? parseInt(matchEp[1]) : episodes.length + 1, url: fullUrl });
                }
            }
        });
        episodes.sort((a, b) => a.num - b.num);
        const finalEpisodes = episodes.length > 0 ? episodes : [{ num: 1, url: selected.url }];

        let txt = `*[🔞] ${title.toUpperCase()}*\n\n`;
        txt += `» *CAPÍTULOS:* \`${finalEpisodes.length}\`\n\n`;
        txt += `> *DESCARGAR:* Usa \`.hlacap [número de capítulo]\` (Ej: \`.hlacap 1\`).`;

        global.hentailaStore.set(m.chat, { step: 'details', episodes: finalEpisodes });

        await m.react('✔️');
        if (poster) {
            return conn.sendMessage(m.chat, { image: { url: poster }, caption: txt }, { quoted: m });
        } else {
            return m.reply(txt);
        }
    }

    if (session.step === 'details') {
        const targetEp = session.episodes.find(e => e.num === inputNum) || session.episodes[inputNum - 1];
        if (!targetEp) return m.reply('⚠️ Capítulo no encontrado.');

        global.hentailaStore.delete(m.chat);
        // Aquí ejecuta la descarga directa mediante el comando controlado
        return m.reply(`🕒 Procesando descarga del capítulo ${targetEp.num}...`);
    }
};

handler.command = ['hlacap', 'hlatotal'];
export default handler;
