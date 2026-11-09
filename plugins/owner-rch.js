import axios from 'axios';

let handler = async (m, { conn, text, usedPrefix, command }) => {
    if (!text) {
        return conn.reply(m.chat, `❖ Uso incorrecto del comando.\n\n*Ejemplo:* \`${usedPrefix + command} https://whatsapp.com/channel/... 💩\``, m);
    }

    // Separa el texto por espacios: el último elemento será el emoji y lo demás el link
    let parts = text.trim().split(/\s+/);
    if (parts.length < 2) {
        return conn.reply(m.chat, `❖ Faltan los emojis.\n\n*Ejemplo:* \`${usedPrefix + command} https://whatsapp.com/channel/... 💩\``, m);
    }

    const emojis = parts.pop(); // Saca el último trozo como emoji(s)
    const targetUrl = parts.join(' '); // Lo demás vuelve a ser el link del canal

    await m.react('🕒');

    try {
        const apiUrl = `https://api.omegatech.app/api/Fun/Rch?action=react&url=${encodeURIComponent(targetUrl)}&emoji=${encodeURIComponent(emojis)}`;

        const { data } = await axios.get(apiUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0' },
            timeout: 15000,
            validateStatus: () => true
        });

        if (!data || !data.success) {
            await m.react('✖️');
            return m.reply(`❌ Error en la API: ${data?.message || 'Respuesta no válida'}`);
        }

        let txt = `✰ ᩧ　𓈒　ׄ　𝖱𝖤𝖠𝖢𝖳𝖨𝖮𝖭 - 𝖢𝖧𝖠𝖭𝖭𝖤𝖫　ׅ　✿\n\n`;
        txt += `ׄ ﹙ׅ✿﹚ּ *Estado* › Exitoso\n`;
        txt += `ׄ ﹙ׅ✿﹚ּ *Emojis* › \`${data.data.emojis}\`\n`;
        txt += `ׄ ﹙ׅ✿﹚ּ *Task ID* › \`${data.data.task_id}\`\n`;
        txt += `ׄ ﹙ׅ✿﹚ּ *Usos hoy* › \`${data.data.usage_today}/${data.data.limit}\`\n`;

        await conn.reply(m.chat, txt, m);
        await m.react('✔️');

    } catch (error) {
        console.error('Error en comando rch:', error.message);
        await m.react('✖️');
        return m.reply(`> ✿︎ Ocurrió un error al procesar la reacción.\n> *[Detalle: ${error.message}]*`);
    }
};

handler.help = ['rch'];
handler.tags = ['owner'];
handler.command = ['rch'];
handler.owner = true;

export default handler;
