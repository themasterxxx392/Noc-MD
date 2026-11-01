import { db } from "../lib/postgres.js";

const handler = async (m, { args, conn }) => {
const id = conn.user?.id;
if (!id) return;
const name = args.join(" ").trim();
if (!name) return m.reply("❌ Escribe un nombre para el bot.\n\nEjemplo:\n/setbotname LoliBot 😎");
await db.query(`UPDATE subbots SET name = $1 WHERE id = $2`, [name, id.replace(/:\d+/, '')]);
m.reply(`✅ Nombre del bot actualizado a:\n*${name}*`);
};
handler.help = ["setbotname <name>"];
handler.tags = ["jadibot"];
handler.command = /^setbotname$/i;
handler.owner = true;

export default handler;
