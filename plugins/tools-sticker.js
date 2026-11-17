import { sticker } from '../lib/sticker.js';

let handler = async (m, { conn, text, usedPrefix, command }) => {
    try {
        let q = m.quoted ? m.quoted : m;
        let mime = (q.msg || q).mimetype || q.mediaType || '';
        
        if (!mime) {
            return m.reply(`[ ❌ ] ¡Responde a una imagen o video corto para convertirlo en sticker, w! Usa *${usedPrefix + command}*`);
        }

        if (!/image|video/g.test(mime)) {
            return m.reply(`[ ❌ ] El archivo multimedia que enviaste no es válido. Solo se permiten imágenes o videos.`);
        }

        let img = await q.download?.();
        if (!img) {
            return m.reply(`[ ❌ ] No pude descargar el archivo multimedia. Inténtalo de nuevo.`);
        }

        let stiker = await sticker(img, false, "AnimsKuro", "Bot");
        
        if (stiker) {
            await conn.sendMessage(m.chat, { sticker: stiker }, { quoted: m });
        } else {
            throw new Error('No se pudo generar el buffer del sticker.');
        }

    } catch (err) {
        console.error("❌ Error en el comando sticker:", err);
        await m.reply(`[ ❌ ] Hubo un error al crear el sticker, w. Intenta con otra imagen o video más corto.`);
    }
};

handler.help = ['s', 'sticker'];
handler.tags = ['tools'];
handler.command = ['s', 'sticker']

export default handler;
