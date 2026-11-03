import axios from 'axios';
import * as cheerio from 'cheerio';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

let handler = async (m, { conn, text }) => {
    if (!global.hentailaStore) return m.reply('⚠️ No hay ninguna búsqueda activa.');
    const session = global.hentailaStore.get(m.chat);
    if (!session || !session.results) return m.reply('⚠️ Primero realiza una búsqueda con *.hla [nombre]*');

    if (!text || !text.trim()) {
        return m.reply('⚠️ Ingresa el número de la lista (Ej: `.hlasel 1`).');
    }

    const index = parseInt(text.trim());
    if (isNaN(index) || index < 1 || index > session.results.length) {
        return m.reply(`⚠️ Ingresa un número válido entre 1 y ${session.results.length}.`);
    }

    const selected = session.results[index - 1];
    await m.react('🕒');

    try {
        const { data: html } = await axios.get(selected.url, { headers: { 'User-Agent': UA }, timeout: 12000 });
        const $ = cheerio.load(html);
        const title = $('h1').first().text().trim() || selected.title;
        let rawPoster = $('meta[property="og:image"]').attr('content') || $('.cover img').attr('src') || '';
        let poster = rawPoster.startsWith('//') ? 'https:' + rawPoster : rawPoster;

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
        const finalEpisodes = episodes.length > 0 ? episodes : [{ num: 1, url: selected.url }];

        let txt = `*[🔞] ${title.toUpperCase()}*\n\n`;
        txt += `» *CAPÍTULOS:* \`${finalEpisodes.length}\`\n\n`;
        txt += `> *DESCARGAR:* Usa \`.hladl [número de capítulo]\``;

        const sentMsg = await conn.sendMessage(m.chat, poster ? { image: { url: poster }, caption: txt } : { text: txt }, { quoted: m });
        
        session.episodeStores = session.episodeStores || {};
        session.episodeStores[sentMsg.key.id] = finalEpisodes;
        session.lastEpisodes = finalEpisodes; // Respaldo por si reinicias el bot
        global.hentailaStore.set(m.chat, session);

        await m.react('✔️');
    } catch (e) {
        await m.react('✖️');
        return m.reply(`⚠️ Error al obtener los capítulos: ${e.message}`);
    }
};

handler.command = ['hlasel', 'seleccionar'];
export default handler;
