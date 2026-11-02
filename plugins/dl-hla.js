import fetch from 'node-fetch';
import cheerio from 'cheerio';

// Almacén temporal en memoria global para las sesiones de HentaiLA
if (!global.hentailaStore) {
    global.hentailaStore = new Map();
}

let handler = async (m, { conn, text, usedPrefix, command }) => {
    if (!text) {
        return m.reply(`🔥 Por favor, ingresa el nombre de lo que deseas buscar.\n\n*Ejemplo:*\n${usedPrefix + command} overflow`);
    }

    await m.react('🔍');

    try {
        const searchUrl = `https://hentaila.com/search?q=${encodeURIComponent(text)}`;
        const res = await fetch(searchUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
        });
        const html = await res.text();
        const $ = cheerio.load(html);

        let results = [];
        $('.post-row, .anime-card, article.anime, .item').each((_, element) => {
            const title = $(element).find('h3 a, h2 a, .title a').text().trim();
            const url = $(element).find('h3 a, h2 a, .title a').attr('href');
            if (title && url) {
                results.push({ title, url });
            }
        });

        // Fallback de búsqueda si la estructura cambia
        if (results.length === 0) {
            $('a').each((_, element) => {
                const href = $(element).attr('href');
                const title = $(element).text().trim();
                if (href && href.includes('/anime/') && title && title.length > 2) {
                    if (!results.some(r => r.url === href)) {
                        results.push({ title, url: href.startsWith('http') ? href : `https://hentaila.com${href}` });
                    }
                }
            });
        }

        results = results.slice(0, 5); // Limitado a los primeros 5 resultados

        if (results.length === 0) {
            await m.react('✖️');
            return m.reply('❌ No se encontraron resultados para tu búsqueda.');
        }

        // Guardamos la sesión en el mapa global usando el chat del usuario
        global.hentailaStore.set(m.chat, {
            type: 'search',
            results: results
        });

        let txt = `🔞 *HENTAILA - BÚSQUEDA*\n\n`;
        results.forEach((item, index) => {
            txt += `*${index + 1})* ${item.title}\n`;
        });
        txt += `\n> *¿Cómo elegir?* Responde a este mensaje con el número (1-${results.length}) o escribe directamente el número del resultado.`;

        await m.react('✔️');
        return m.reply(txt);

    } catch (error) {
        console.error(error);
        await m.react('✖️');
        return m.reply('❌ Ocurrió un error al realizar la búsqueda en HentaiLA.');
    }
};

// Manejador alternativo seguro para capturar respuestas numéricas en el chat
handler.before = async function (m, { conn }) {
    if (!m.text || !global.hentailaStore) return;
    const session = global.hentailaStore.get(m.chat);
    if (!session) return;

    const cleanText = m.text.trim().replace(/[^0-9]/g, '');
    const inputNum = parseInt(cleanText);

    if (isNaN(inputNum)) return;

    if (session.type === 'search') {
        if (inputNum < 1 || inputNum > session.results.length) return;

        global.hentailaStore.delete(m.chat);
        const selected = session.results[inputNum - 1];
        await m.react('🕒');

        try {
            const res = await fetch(selected.url, {
                headers: { 'User-Agent': 'Mozilla/5.0' }
            });
            const html = await res.text();
            const $ = cheerio.load(html);

            const title = $('h1.title, h1').text().trim() || selected.title;
            const synopsis = $('.synopsis, .description, p').first().text().trim() || 'Sin sinopsis disponible.';
            const genres = $('.genres a, .genre').map((_, el) => $(el).text().trim()).get().join(', ') || 'N/A';
            const status = $('.status').text().trim() || 'Finalizado';
            const poster = $('div.poster img, .thumb img').attr('src');

            let episodes = [];
            $('.episodes-list a, ul.episodes li a, a.episode').each((_, el) => {
                const epUrl = $(el).attr('href');
                const epNumText = $(el).text().replace(/[^0-9]/g, '');
                if (epUrl) {
                    episodes.push({
                        url: epUrl.startsWith('http') ? epUrl : `https://hentaila.com${epUrl}`,
                        num: parseInt(epNumText) || episodes.length + 1
                    });
                }
            });

            if (episodes.length === 0) {
                // Fallback por si los capítulos están estructurados de otra forma
                $('a').each((_, el) => {
                    const href = $(el).attr('href');
                    if (href && href.includes('/video/')) {
                        episodes.push({
                            url: href.startsWith('http') ? href : `https://hentaila.com${href}`,
                            num: episodes.length + 1
                        });
                    }
                });
            }

            if (episodes.length === 0) {
                await m.react('✖️');
                return m.reply('❌ No se encontraron capítulos disponibles para esta serie.');
            }

            global.hentailaStore.set(m.chat, {
                type: 'details',
                episodes: episodes
            });

            let txt = `*[🔞] ${title.toUpperCase()}*\n\n`;
            txt += `» *GÉNEROS:* \`${genres}\`\n`;
            txt += `» *ESTADO:* \`${status}\`\n`;
            txt += `» *TOTAL CAPÍTULOS:* \`${episodes.length}\`\n\n`;
            txt += `--- *SINOPSIS* ---\n`;
            txt += `_${synopsis}_\n\n`;
            txt += `> *DESCARGAR:* Responde con el número del capítulo que deseas (Ej: \`1\`).`;

            if (poster) {
                await conn.sendMessage(m.chat, { image: { url: poster.startsWith('http') ? poster : `https://hentaila.com${poster}` }, caption: txt }, { quoted: m });
            } else {
                await m.reply(txt);
            }

            await m.react('✔️');

        } catch (e) {
            console.error(e);
            await m.react('✖️');
            return m.reply('❌ Error al obtener los detalles de la serie.');
        }
        return true;
    }

    if (session.type === 'details') {
        const targetEp = session.episodes.find(e => e.num === inputNum) || session.episodes[inputNum - 1];
        if (!targetEp) return;

        global.hentailaStore.delete(m.chat);
        await m.react('📥');
        await m.reply(`⏳ Preparando descarga del capítulo ${targetEp.num}... Por favor espera.`);

        try {
            const res = await fetch(targetEp.url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
            const html = await res.text();
            const $ = cheerio.load(html);

            let videoUrl = '';
            $('script').each((_, el) => {
                const scriptContent = $(el).html() || '';
                if (scriptContent.includes('https://') && (scriptContent.includes('.mp4') || scriptContent.includes('video'))) {
                    const match = scriptContent.match(/(https:\/\/[^"']+\.mp4[^"']*)/);
                    if (match) videoUrl = match[1];
                }
            });

            if (!videoUrl) {
                // Segundo intento buscando iframes o reproductores directos
                videoUrl = $('iframe').attr('src') || $('video source').attr('src');
            }

            if (!videoUrl) {
                await m.react('✖️');
                return m.reply('❌ No se pudo extraer el enlace de video directo para este capítulo.');
            }

            await conn.sendMessage(m.chat, { 
                video: { url: videoUrl }, 
                caption: `✅ *Capítulo ${targetEp.num} descargado con éxito.*`,
                mimetype: 'video/mp4'
            }, { quoted: m });

            await m.react('✔️');
        } catch (e) {
            console.error(e);
            await m.react('✖️');
            return m.reply('❌ Ocurrió un error al intentar descargar el video.');
        }
        return true;
    }
};

handler.command = ['hla', 'hentaila'];
export default handler;
