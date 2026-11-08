let handler = async (m, { conn, participants, usedPrefix, command, isOwner }) => {
let kickte = `A quien eliminó? etiquetas a una persona con @tag pendejo`
if (!m.mentionedJid[0] && !m.quoted) return m.reply(kickte, m.chat, { mentions: conn.parseMention(kickte)}) 
let user = m.mentionedJid[0] ? m.mentionedJid[0] : m.quoted.sender
let owr = m.chat.split`-`[0]
await conn.groupParticipantsUpdate(m.chat, [user], 'remove')}
handler.help = ['kick']
handler.tags = ['group']
handler.command = ['kick'] 
handler.admin = true
handler.group = true
handler.botAdmin = true
export default handler
