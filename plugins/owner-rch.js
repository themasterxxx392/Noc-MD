import axios from 'axios';

let handler = async (m, { conn, text, usedPrefix, command }) => {
    // Verificación de owner (ajusta según la estructura de tu bot)
    const isOwner = m.sender.split('@')[0] === global.owner || global.s_owner?.includes(m.sender.split('@')[0]);
    if (!isOwner) {
        await m.react('✖️');
        return m.reply('❌ Este comando solo puede ser utilizado por el owner.');
    }

    let args = text ? text.split('|').map(v => v.trim()) : [];
    if (args.length < 2) {
        return conn.reply(m.chat, `❖ Uso incorrecto del comando.\n\n*Ejemplo:* \`${usedPrefix + command} https://whatsapp.com/channel/... | 🤫,🤗\``, m);
    }

    const targetUrl = args[0];
    const emojis = args[1];

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
handler.rowner = true;

export default handler;
