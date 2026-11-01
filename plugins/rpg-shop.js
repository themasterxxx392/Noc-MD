const xpperlimit = 750;

const handler = async (m, { conn, command, args }) => {
const res = await m.db.query("SELECT exp, limite FROM usuarios WHERE id = $1", [m.sender]);
let user = res.rows[0];
let count = 1;

if (/all/i.test(command) || (args[0] && /all/i.test(args[0]))) {
count = Math.floor(user.exp / xpperlimit);
} else {
count = parseInt(args[0]) || parseInt(command.replace(/^buy/i, "")) || 1;
}

count = Math.max(1, count);
const totalCost = xpperlimit * count;
if (user.exp < totalCost) return m.reply(`⚠️ Lo siento, no tienes suficientes *XP* para comprar *${count}* Diamantes 💎`);
await m.db.query(`UPDATE usuarios 
      SET exp = exp - $1, limite = limite + $2 
      WHERE id = $3
    `, [totalCost, count, m.sender]);
await m.reply(`╔═❖ *ＮＯＴＡ ＤＥ ＰＡＧＯ*\n║‣ *Has comprado:* ${count} 💎\n║‣ *Gastado:* ${totalCost} XP\n╚═══════════════`);
};
handler.help = ['buy [cantidad]', 'buyall', 'buy all'];
handler.tags = ['econ'];
handler.command = /^buy(all)?$/i; 

export default handler;
