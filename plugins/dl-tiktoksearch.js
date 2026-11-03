import axios from 'axios';

let handler = async (m, { conn, text, usedPrefix, command }) => {
    if (!text) {
        return conn.reply(m.chat, `⚠️ Ingresa un término de búsqueda para TikTok.\n\n*Ejemplo:* \`${usedPrefix + command} xd\``, m);
    }

    await conn.sendMessage(m.chat, { react: { text: '🕒', key: m.key } });

    try {
        const apikey = 'YUME_30c75365cf5d8687';
        const url = `https://nexus--shadowxyz189.replit.app/search/tiktok?q=${encodeURIComponent(text)}&count=10&key=${apikey}`;
        
        const { data } = await axios.get(url);

        if (!data || !data.status || !data.data || data.data.length === 0) {
            await conn.sendMessage(m.chat, { react: { text: '❌', key: m.key } });
            return conn.reply(m.chat, '❌ No se encontraron resultados para esa búsqueda en TikTok.', m);
        }

        let resultsText = `🎬 *BÚSQUEDA DE TIKTOK* 🎬\n\n`;
        resultsText += `🔍 *Consulta:* ${data.query}\n`;
        resultsText += `📊 *Total encontrados:* ${data.total}\n\n`;

        data.data.forEach((item, index) => {
            resultsText += `*${index + 1}.* @${item.author.username} (${item.author.nickname})\n`;
            resultsText += `💬 *Título:* ${item.title}\n`;
            resultsText += `❤️ *Likes:* ${item.stats.likes} | 👁️ *Vistas:* ${item.stats.views}\n`;
            resultsText += `🔗 *Enlace:* ${item.url}\n`;
            resultsText += `📥 *Descarga:* ${item.download.video}\n`;
            resultsText += `----------------------------------------\n`;
        });

        await conn.reply(m.chat, resultsText.trim(), m);
        await conn.sendMessage(m.chat, { react: { text: '✅', key: m.key } });

    } catch (error) {
        console.error(error);
        await conn.sendMessage(m.chat, { react: { text: '✖️', key: m.key } });
        return conn.reply(m.chat, '⚠️ Ocurrió un error al realizar la búsqueda en la API de TikTok.', m);
    }
};

handler.command = ['tiktoksearch', 'ttsearch', 'tsearch'];
handler.help = ['tiktoksearch <texto>'];
handler.tags = ['downloader'];

export default handler;
            
