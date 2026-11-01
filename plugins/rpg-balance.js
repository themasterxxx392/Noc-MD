const handler = async (m, { conn, usedPrefix }) => {
    const who = m.quoted?.sender || m.mentionedJid?.[0] || (m.fromMe ? conn.user.jid : m.sender);
    
    // Usamos global.db o la conexión directa que usan tus otros plugins que sí funcionan
    const database = global.db || conn.db || m.db;
    if (!database) return conn.reply(m.chat, '❌ Error crítico: No se encuentra la base de datos global.', m);

    let res = await database.query("SELECT limite, exp, money, banco FROM usuarios WHERE id = $1", [who]);
    let user = res.rows[0];

    if (!user) {
        await database.query(
            `INSERT INTO usuarios (id, nombre, num, registered, limite, exp, money, banco)
             VALUES ($1, $2, $3, true, 10, 100, 50, 0) ON CONFLICT (id) DO NOTHING`,
            [who, m.pushName || "Usuario", who.split("@")[0]]
        );
        res = await database.query("SELECT limite, exp, money, banco FROM usuarios WHERE id = $1", [who]);
        user = res.rows[0] || { limite: 10, exp: 100, money: 50, banco: 0 };
    }

    await conn.reply(m.chat, `*•───⧼⧼⧼ 𝙱𝙰𝙻𝙰𝙽𝙲𝙴 ⧽⧽⧽───•*

@${who.split('@')[0]} Tiene:

*• 𝐃𝐢𝐚𝐦𝐚𝐧𝐭𝐞:* _${user.limite} 💎_
*• 𝐄𝐱𝐩:* _${user.exp} ⬆️_
*• 𝐋𝐨𝐥𝐢𝐂𝐨𝐢𝐧𝐬:* _${user.money} 🪙_
> Afuera del Banco 

*•───⧼⧼⧼ 𝙱𝙰𝙽𝙲𝙾 ⧽⧽⧽───•*

*🏦 𝐃𝐢𝐧𝐞𝐫𝐨 :* _${user.banco} 💎_
> Adentro del Banco 🏦`, m, { mentions: [who] });
};

handler.help = ['balance'];
handler.tags = ['econ'];
handler.command = ['bal', 'diamantes', 'diamond', 'balance'];
handler.register = false;

export default handler;
