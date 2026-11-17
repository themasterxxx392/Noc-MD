import { db } from "../lib/postgres.js";

const handler = async (m, { conn, text, command }) => {
let targetJid = null;

if (m.isGroup && m.mentionedJid?.[0]) {
targetJid = m.mentionedJid[0];
}

if (!targetJid && text?.match(/\d{5,}/)) {
const number = text.match(/\d{5,}/)?.[0];
targetJid = number + "@s.whatsapp.net";
}

if (!targetJid) return m.reply("🤓 Etiqueta al usuario boludito");
const cleanJid = targetJid.replace(/[^0-9]/g, "") + "@s.whatsapp.net";
try {
const res = await db.query("SELECT id FROM usuarios WHERE id = $1", [cleanJid]);
if (!res.rowCount) return m.reply("❌ Ese usuario no está registrado en la base de datos.");

if (command === "banuser") {
let ban = 'https://qu.ax/SJJt.mp3'
let razon = text?.replace(/^(@\d{5,}|[+]?[\d\s\-()]+)\s*/g, "").trim() || null;
await db.query("UPDATE usuarios SET banned = true, razon_ban = $2 WHERE id = $1", [cleanJid, razon]);
try { 
await conn.sendMessage(m.chat, { audio: { url: ban }, contextInfo: { externalAdReply: { title: `⚠️ ᴱˡ ᵘˢᵘᵃʳᶦᵒ(ᵃ) ᶠᵘᵉ ᵇᵃⁿᵉᵃᵈᵒ(ᵃ) 🙀 ⁿᵒ ᵖᵒᵈʳᵃ ᵘˢᵃʳ ᵃ`, body: info.wm, previewType: "PHOTO", thumbnailUrl: null, thumbnail: m.pp, sourceUrl: info.md, showAdAttribution: true}}, ptt: true, mimetype: 'audio/mpeg', fileName: `error.mp3` }, { quoted: m })
} catch (e) {
m.reply(`🚫 El usuario @${cleanJid.split("@")[0]} ha sido *baneado* y no podrá usar el bot.${razon ? `\n\n📌 *Razón:* ${razon}` : ""}`, { mentions: [cleanJid]});
}
}

if (command === "unbanuser") {
await db.query("UPDATE usuarios SET banned = false, avisos_ban = 0, razon_ban = NULL WHERE id = $1", [cleanJid]);
return m.reply(`✅ El usuario @${cleanJid.split("@")[0]} ha sido *desbaneado* y puede volver a usar el bot.`, { mentions: [cleanJid] });
}
} catch (err) {
console.error(err);
return m.reply("❌ Ocurrió un error al ejecutar el comando.");
}};
handler.help = ['banuser', 'unbanuser'];
handler.tags = ['owner'];
handler.command = /^banuser|unbanuser$/i;
handler.owner = true;

export default handler;
