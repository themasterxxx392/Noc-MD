import { db } from '../lib/postgres.js';

const handler = async (m, { conn }) => {
    const sender = m.sender || m.quoted?.sender || conn.user?.jid || '';
    const who = m.quoted?.sender || m.mentionedJid?.[0] || sender;
    const cleanWho = typeof who === 'string' ? who : String(sender);
    const userTag = cleanWho.includes('@') ? cleanWho.split('@')[0] : cleanWho;

    let res = await db.query("SELECT limite, exp, money, banco FROM usuarios WHERE id = $1", [cleanWho]);
    let user = res.rows[0];

    if (!user) {
        await db.query(
            `INSERT INTO usuarios (id, nombre, num, registered, limite, exp, money, banco)
             VALUES ($1, $2, $3, true, 10, 100, 50, 0) ON CONFLICT (id) DO NOTHING`,
            [cleanWho, m.pushName || "Usuario", userTag]
        );
        res = await db.query("SELECT limite, exp, money, banco FROM usuarios WHERE id = $1", [cleanWho]);
        user = res.rows[0] || { limite: 10, exp: 100, money: 50, banco: 0 };
    }

    await conn.reply(m.chat, `*•───⧼⧼⧼ 𝙱𝙰𝙻𝙰𝙽𝙲𝙴 ⧽⧽⧽───•*

@${userTag} Tiene:

*• 𝐃𝐢𝐚𝐦𝐚𝐧𝐭𝐞:* _${user.limite} 💎_
*• 𝐄𝐱𝐩:* _${user.exp} ⬆️_
*• 𝐋𝐨𝐥𝐢𝐂𝐨𝐢𝐧𝐬:* _${user.money} 🪙_
> Afuera del Banco 

*•───⧼⧼⧼ 𝙱𝙰𝙽𝙲𝙾 ⧽⧽⧽───•*

*🏦 𝐃𝐢𝐧𝐞𝐫𝐨 :* _${user.banco} 💎_
> Adentro del Banco 🏦`, m, { mentions: [cleanWho] });
};

handler.help = ['balance'];
handler.tags = ['econ'];
handler.command = ['bal', 'diamantes', 'diamond', 'balance'];

export default handler;
