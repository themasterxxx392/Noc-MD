import axios from 'axios';

let handler = async (m, { conn, usedPrefix, command }) => {
    await m.react('🕒');

    try {
        const base = global.info?.evogb;
        const key = global.info?.evogbkey;

        if (!base || !key) {
            await m.react('✖️');
            return;
        }

        const apiUrl = `https://api.evogb.org/nsfw/random/loli?key=evogb-TyswGrUB&type=loli`;

        const { data } = await axios.get(apiUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0' },
            timeout: 15000
        });

        if (!data || !data.status) {
            await m.react('✖️');
            return;
        }

        const imagenUrl = data.data?.url; 

        if (!imagenUrl) {
            await m.react('✖️');
            return;
        }

        await conn.sendMessage(m.chat, {
            image: { url: imagenUrl }
        }, { quoted: m });

        await m.react('✔️');

    } catch (error) {
        console.error('Error en comando de imagen API:', error.message);
        await m.react('✖️');
    }
};

handler.help = ['loli'];
handler.tags = ['nsfw'];
handler.command = ['loli'];

export default handler;
