const handler = async (m, { conn, args }) => {
const bet = parseInt(args[0], 10);
const cooldown = 30_000;
const now = Date.now();
if (!bet || bet <= 0) return m.reply('❌ Ingresa una cantidad válida para apostar.');
const res = await m.db.query('SELECT exp, wait FROM usuarios WHERE id = $1', [m.sender]);
const user = res.rows[0];
if (!user || user.exp < bet) return m.reply(`❌ No tienes suficiente experiencia (exp) para esta apuesta. Solo tienes ${formatNumber(user?.exp || 0)} XP.`);

const last = Number(user.wait) || 0;
const remaining = last + cooldown - now;
if (now - last < cooldown) return conn.fakeReply(m.chat, `*🕓 Calma crack 🤚, Espera ${msToTime(remaining)} antes de volver usar en comando*`, m.sender, `ᴺᵒ ʰᵃᵍᵃⁿ ˢᵖᵃᵐ`, 'status@broadcast');

const outcome = Math.random() < 0.5 ? 'cara' : 'cruz';
const win = outcome === 'cara';
const newExp = win ? user.exp + bet * 2 : user.exp - bet;
await m.db.query('UPDATE usuarios SET exp = $1, wait = $2 WHERE id = $3', [newExp, now, m.sender]);
return m.reply(`${win ? '🎉' : '💀'} La moneda cayó en *${outcome}* y ${win ? `ganaste *${formatNumber(bet * 2)}* XP.` : `perdiste *${formatNumber(bet)}* XP.`}`);
};
handler.help = ['cf <cantidad>'];
handler.tags = ['game'];
handler.command = ['cf'];

export default handler;

function msToTime(duration) {
const milliseconds = parseInt((duration % 1000) / 100);
let seconds = Math.floor((duration / 1000) % 60);
let minutes = Math.floor((duration / (1000 * 60)) % 60);
let hours = Math.floor((duration / (1000 * 60 * 60)) % 24);
hours = (hours < 10) ? '0' + hours : hours;
minutes = (minutes < 10) ? '0' + minutes : minutes;
seconds = (seconds < 10) ? '0' + seconds : seconds;
return seconds + ' segundos ';
}

function formatNumber(num) {
  return num.toLocaleString('en').replace(/,/g, '.');
}
