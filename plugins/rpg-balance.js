const handler = async (m, { conn, usedPrefix }) => {
    const who = m.quoted?.sender || m.mentionedJid?.[0] || (m.fromMe ? conn.user.jid : m.sender);
    
    if (!m.db) return conn.reply(m.chat, '⚠️ Base de datos no disponible.', m);

    // Intentamos buscar al usuario
    let res = await m.db.query("SELECT limite, exp, money, banco FROM usuarios WHERE id = $1", [who]);
    let user = res.rows[0];

    // Si por alguna razón no existe en la tabla, lo creamos al instante para evitar el error
    if (!user) {
        const userName = m.pushName || "Usuario";
        const cleanNum = who.split("@")[0].replace(/[^0-9]/g, "");
        await m.db.query(
            `INSERT INTO usuarios (id, nombre, num, registered, limite, exp, money, banco)
             VALUES ($1, $2, $3, true, 10, 100, 50, 0)
             ON CONFLICT (id) DO NOTHING`,
            [who, userName, cleanNum || null]
        );
        // Volvemos a consultar los datos ya creados
        res = await m.db.query("SELECT limite, exp, money, banco FROM usuarios WHERE id = $1", [who]);
        user = res.rows[0] || { limite: 10, exp: 100, money: 50, banco: 0 };
    }

    await conn.reply(m.chat, `*•───⧼⧼⧼ 𝙱𝙰𝙻𝙰𝙽𝙲𝙴 ⧽⧽⧽───•*

@${who.split('@')[0]} Tiene:

*• 𝐃𝐢𝐚𝐦𝐚𝐧𝐭𝐞:* _${user.limite ?? 0} 💎_
*• 𝐄𝐱𝐩:* _${user.exp ?? 0} ⬆️_
*• 𝐋𝐨𝐥𝐢𝐂𝐨𝐢𝐧𝐬:* _${user.money ?? 0} 🪙_
> Afuera del Banco 

*•───⧼⧼⧼ 𝙱𝙰𝙽𝙲𝙾 ⧽⧽⧽───•*

*🏦 𝐃𝐢𝐧𝐞𝐫𝐨 :* _${user.banco ?? 0} 💎_
> Adentro del Banco 🏦 

•───────────────•

> *𝐍𝐎𝐓𝐀 :* 
> 𝐩𝐮𝐞𝐝𝐞𝐬 𝐜𝐨𝐦𝐩𝐫𝐚𝐫 💎 𝐝𝐢𝐚𝐦𝐚𝐧𝐭𝐞 𝐮𝐬𝐚𝐧𝐝𝐨 𝐥𝐨𝐬 𝐜𝐨𝐦𝐚𝐧𝐝𝐨𝐬
> *• ${usedPrefix}buy <cantidad>*
> *• ${usedPrefix}buyall*`, m, { mentions: [who] });
};

handler.help = ['balance'];
handler.tags = ['econ'];
handler.command = ['bal', 'diamantes', 'diamond', 'balance'];
handler.register = false;

export default handler;
         
