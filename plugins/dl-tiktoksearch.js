import axios from 'axios';

let handler = async (m, { conn, text, usedPrefix, command }) => {
    if (!text) {
        return conn.reply(m.chat, `⚠️ Ingresa un término de búsqueda para TikTok.\n\n*Ejemplo:* \`${usedPrefix + command} alya\``, m);
    }

    await conn.sendMessage(m.chat, { react: { text: '🕒', key: m.key } });

    try {
        const apikey = 'YUME_30c75365cf5d8687';
        const url = `https://nexus--shadowxyz189.replit.app/search/tiktok?q=${encodeURIComponent(text)}&count=5&key=${apikey}`;
        
        const { data } = await axios.get(url);

        if (!data || !data.status || !data.data || data.data.length === 0) {
            await conn.sendMessage(m.chat, { react: { text: '❌', key: m.key } });
            return conn.reply(m.chat, '❌ No se encontraron resultados para esa búsqueda en TikTok.', m);
        }

        await conn.reply(m.chat, `🔍 Encontrados *${data.data.length}* videos para: "${data.query}". Enviando...`, m);

        // Enviamos los videos uno por uno (limitado a 5 o 10 para no saturar el chat de golpe)
        for (let i = 0; i < Math.min(data.data.length, 5); i++) {
            let item = data.data[i];
            let videoUrl = item.download.video;
            let caption = `🎬 *TikTok:* ${item.title}\n👤 *Autor:* @${item.author.username} (${item.author.nickname})\n❤️ *Likes:* ${item.stats.likes}`;

            try {
                await conn.sendMessage(m.chat, { 
                    video: { url: videoUrl }, 
                    caption: caption,
                    mimetype: 'video/mp4'
                }, { quoted: m });
            } catch (err) {
                console.error(`Error al enviar el video ${i + 1}:`, err);
            }
        }

        await conn.sendMessage(m.chat, { react: { text: '✅', key: m.key } });

    } catch (error) {
        console.error(error);
        await conn.sendMessage(m.chat, { react: { text: '✖️', key: m.key } });
        return conn.reply(m.chat, '⚠️ Ocurrió un error al obtener los videos de TikTok.', m);
    }
};

handler.command = ['tiktoksearch', 'ttsearch', 'tsearch'];
handler.help = ['tiktoksearch <texto>'];
handler.tags = ['downloader'];

export default handler;
                         
