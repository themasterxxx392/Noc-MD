import { db } from "../lib/postgres.js";

let handler = async (m, { command, text }) => {
let who = m.isGroup ? m.mentionedJid?.[0] : m.chat;
if (!who) return m.reply("⚠️ Etiqueta a una persona con el @tag");
let idFinal = who;

if (idFinal.includes("@lid")) {
const result = await db.query(`SELECT num FROM usuarios WHERE lid = $1`, [idFinal]);
if (!result.rowCount) return m.reply("❌ No se encontró al usuario con ese LID en la base de datos.");
const numero = result.rows[0].num;
idFinal = numero + "@s.whatsapp.net";
}

const cleanJid = idFinal.replace(/[^0-9]/g, "") + "@s.whatsapp.net";
const cantidad = parseInt(text.match(/\d+/)?.[0]);
if (!cantidad || isNaN(cantidad)) return m.reply("⚠️ Ingresa una cantidad válida");
try {
const res = await db.query(`SELECT id FROM usuarios WHERE id = $1`, [cleanJid]);
if (!res.rowCount) return m.reply("❌ Ese usuario no está registrado en la base de datos.");
let resultado;

if (/addexp|añadirxp|addxp/i.test(command)) {
resultado = await db.query(`UPDATE usuarios SET exp = exp + $1 WHERE id = $2 RETURNING exp`, [cantidad, cleanJid]);
return m.reply(`*≡ ✨ EXP AGREGADO:*\n┏━━━━━━━━━━━━\n┃• *𝗍᥆𝗍ᥲᥣ:* ${cantidad}\n┗━━━━━━━━━━━━`);
}

if (/removexp|quitarxp|sacarexp/i.test(command)) {
resultado = await db.query(`UPDATE usuarios SET exp = GREATEST(0, exp - $1) WHERE id = $2 RETURNING exp`, [cantidad, cleanJid]);
return m.reply(`*≡ ✨ EXP QUITADO:*\n┏━━━━━━━━━━━━\n┃• *𝗍᥆𝗍ᥲ᥹:* ${cantidad}\n┗━━━━━━━━━━━━`);
}
} catch (e) {
console.error(e);
return m.reply("❌ Error al modificar datos.");
}};
handler.help = ['addexp', 'removexp'];
handler.tags = ['owner'];
handler.command = /^(addexp|removexp)$/i;
handler.owner = true;

export default handler;
