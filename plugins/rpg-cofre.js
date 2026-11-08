const handler = async (m, { conn }) => {
const cooldown = 122_400_000; // 3 días
const now = Date.now();
const res = await m.db.query("SELECT exp, money, limite, lastcofre FROM usuarios WHERE id = $1", [m.sender]);
const user = res.rows[0];
const lastCofre = Number(user?.lastcofre) || 0;
const nextTime = lastCofre + cooldown;
const restante = Math.max(0, nextTime - now);
if (restante > 0) return m.reply(`🕛 𝐘𝐚 𝐫𝐞𝐜𝐥𝐚𝐦𝐚𝐬𝐭𝐞 𝐭𝐮 𝐜𝐨𝐟𝐫𝐞 🎁\n𝐕𝐮𝐞𝐥𝐯𝐞 𝐞𝐧 *${msToTime(restante)}* 𝐩𝐚𝐫𝐚 𝐫𝐞𝐜𝐥𝐚𝐦𝐚𝐫 𝐧𝐮𝐞𝐯𝐚𝐦𝐞𝐧𝐭𝐞`);

const img = 'https://img.freepik.com/vector-gratis/cofre-monedas-oro-piedras-preciosas-cristales-trofeo_107791-7769.jpg?w=2000';
const diamantes = Math.floor(Math.random() * 30);
const coins = Math.floor(Math.random() * 4000);
const xp = Math.floor(Math.random() * 5000);

await m.db.query(`UPDATE usuarios 
    SET exp = exp + $1, money = money + $2, limite = limite + $3, lastcofre = $4 
    WHERE id = $5
  `, [xp, coins, diamantes, now, m.sender]);

const texto = `[ 🛒 𝐎𝐁𝐓𝐈𝐄𝐍𝐄𝐒 𝐔𝐍 𝐂𝐎𝐅𝐑𝐄 🎉 ]

* ${diamantes} 𝐃𝐢𝐚𝐦𝐚𝐧𝐭𝐞𝐬 💎
* ${coins} 𝐂𝐨𝐢𝐧𝐬 🪙
* ${xp} 𝐄𝐱𝐩 ⚡`;

await conn.sendMessage(m.chat, { image: { url: img }, caption: texto }, { quoted: {
key: {
fromMe: false,
participant: '0@s.whatsapp.net',
remoteJid: 'status@broadcast' },
message: {
conversation: '🎉 Obtiene un regalo 🎁'
}}});
};
handler.help = ['cofre'];
handler.tags = ['econ'];
handler.command = ['cofre'];
handler.level = 9;

export default handler;

// Helpers

function msToTime(duration) {
  const totalMinutes = Math.floor(duration / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours} Horas ${minutes} Minutos`;
}
