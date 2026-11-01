const handler = async (m, { conn, args, command, usedPrefix }) => {
const cooldown = 30_000;
const now = Date.now();
const res = await m.db.query('SELECT exp, wait FROM usuarios WHERE id = $1', [m.sender]);
const user = res.rows[0];
const lastWait = Number(user?.wait) || 0;
const remaining = lastWait + cooldown - now;

if (remaining > 0) return conn.fakeReply(m.chat, `*🕓 Calma crack 🤚, Espera ${msToTime(remaining)} antes de volver a usar el comando*`, m.sender, `ᴺᵒ ʰᵃᵍᵃⁿ ˢᵖᵃᵐ`, 'status@broadcast');
if (args.length < 2) return conn.reply(m.chat, `⚠️ Formato incorrecto. Usa: ${usedPrefix + command} <color> <cantidad>\n\nEjemplo: ${usedPrefix + command} black 100`, m);
const color = args[0].toLowerCase();
const betAmount = parseInt(args[1]);
if (!['red', 'black', 'green'].includes(color)) return conn.reply(m.chat, '🎯 Color no válido. Usa: "red", "black" o "green".', m);
if (isNaN(betAmount) || betAmount <= 0) return conn.reply(m.chat, '❌ La cantidad debe ser un número positivo.', m);
if (user.exp < betAmount) return conn.reply(m.chat, `❌ No tienes suficiente XP para apostar. Tienes *${formatExp(user.exp)} XP*`, m);

const resultColor = getRandomColor();
const isWin = resultColor === color;
let winAmount = 0;

if (isWin) {
winAmount = color === 'green' ? betAmount * 14 : betAmount * 2;
}

const newExp = user.exp - betAmount + winAmount;
await m.db.query(`UPDATE usuarios SET exp = $1, wait = $2 WHERE id = $3`, [newExp, now, m.sender]);
return conn.reply(m.chat, `😱 La ruleta cayó en *${resultColor}*\n${isWin ? `🎉 ¡Ganaste *${formatExp(winAmount)} XP*!` : `💀 Perdiste *${formatExp(betAmount)} XP*`}`, m);
};
handler.help = ['rt <color> <cantidad>'];
handler.tags = ['game'];
handler.command = ['rt'];

export default handler;

function getRandomColor() {
  const random = Math.random() * 100;
  if (random < 47.5) return 'red';
  if (random < 95) return 'black';
  return 'green';
}

function formatExp(amount) {
  if (amount >= 1000) return `${(amount / 1000).toFixed(1)}k (${amount.toLocaleString()})`;
  return amount.toLocaleString();
}

function msToTime(duration) {
  if (isNaN(duration) || duration <= 0) return '0s';
  const totalSeconds = Math.floor(duration / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes > 0 ? minutes + 'm ' : ''}${seconds}s`;
}
