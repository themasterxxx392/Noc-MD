import axios from 'axios';

let handler = async (m, { conn, text, usedPrefix, command }) => {
    if (!text) {
        return conn.reply(m.chat, `⚠️ Ingresa un término de búsqueda para TikTok.\n\n*Ejemplo:* \`${usedPrefix + command} waifus\``, m);
    }

    await conn.sendMessage(m.chat, { react: { text: '🕒', key: m.key } });

    try {
        const apikey = 'YUME_30c75365cf5d8687';
        // Pedimos los 10 videos completos a la API
        const url = `https://nexus--shadowxyz189.replit.app/search/tiktok?q=${encodeURIComponent(text)}&count=10&key=${apikey}`;
        
        const { data } = await axios.get(url);

        if (!data || !data.status || !data.data || data.data.length === 0) {
            await conn.sendMessage(m.chat, { react: { text: '❌', key: m.key } });
            return conn.reply(m.chat, '❌ No se encontraron resultados para esa búsqueda en TikTok.', m);
        }

        const totalVideos = Math.min(data.data.length, 10);
        await conn.reply(m.chat, `🔍 Encontrados *${totalVideos}* videos para: "${data.query}". Enviando uno por uno...`, m);

        // Bucle para enviar los 10 videos con un intervalo seguro
        for (let i = 0; i < totalVideos; i++) {
            let item = data.data[i];
            let videoUrl = item.download.video;
            let caption = `🎬 *TikTok [${i + 1}/${totalVideos}]*\n💬 *${item.title}*\n👤 @${item.author.username} | ❤️ ${item.stats.likes}`;

            try {
                await conn.sendMessage(m.chat, { 
                    video: { url: videoUrl }, 
                    caption: caption,
                    mimetype: 'video/mp4'
                }, { quoted: m });

                // Pequeña pausa de 1.5 segundos entre cada video para evitar saturar el bot
                if (i < totalVideos - 1) {
                    await new Promise(resolve => setTimeout(resolve, 1500));
                }
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
            
