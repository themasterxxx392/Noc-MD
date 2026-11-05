let handler = async (m, { conn }) => {
  // Si respondes a un mensaje del canal o reenvías uno, te dará su JID exacto
  let q = m.quoted ? m.quoted : m
  let jid = q.chat || q.sender || m.chat
  
  await m.reply(`✨ *Jid obtenido:* \`\`\`${jid}\`\`\``)
}

handler.help = ['jid']
handler.tags = ['owner']
handler.command = /^(jid|getjid)$/i

export default handler
    
