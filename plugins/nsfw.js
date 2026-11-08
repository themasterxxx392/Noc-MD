import axios from 'axios';

let handler = async (m, { conn, text, usedPrefix, command }) => {
    await m.react('🕒');

    try {
        // Obtenemos la base y la key de las globales del bot
        const base = global.info?.evogb;
        const key = global.info?.evogbkey;

        if (!base || !key) {
            await m.react('✖️');
            return m.reply('❌ No se encontró la configuración o la API Key de evogb en el archivo global.');
        }

        // Armamos la URL del endpoint (puedes ajustar el path si tu endpoint requiere algo más en la ruta)
        const apiUrl = `https://api.evogb.org/nsfw/random/loli?key=evogb-TyswGrUB&type=loli`;

        const { data } = await axios.get(apiUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0' },
            timeout: 15000
        });

        if (!data || !data.status) {
            await m.react('✖️');
            return m.reply('❌ No se obtuvo una respuesta válida de la API.');
        }

        // Extraemos la URL de la imagen del JSON recibido
        const imagenUrl = data.data?.url; 

        if (!imagenUrl) {
            await m.react('✖️');
            return m.reply('❌ La API no devolvió un enlace de imagen válido.');
        }

        // Diseño del mensaje con el estilo que manejamos
        let caption = `✰ ᩧ　𓈒　ׄ　𝖨𝖬𝖠𝖦𝖤𝖭　ׅ　✿\n\n`;
        caption += `ׄ ﹙ׅ✿﹚ּ *Comando* › \`${usedPrefix + command}\`\n`;

        // Envía la imagen con el caption
        await conn.sendMessage(m.chat, {
            image: { url: imagenUrl },
            caption: caption,
            mentions: [m.sender]
        }, { quoted: m });

        await m.react('✔️');

    } catch (error) {
        console.error('Error en comando de imagen API:', error.message);
        await m.react('✖️');
        return m.reply(`> ✿︎ Ocurrió un error al obtener la imagen.\n> *[Detalle: ${error.message}]*`);
    }
};

handler.help = ['imagen'];
handler.tags = ['internet'];
handler.command = ['img', 'randomimg'];

export default handler;
