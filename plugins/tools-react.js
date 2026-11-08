import axios from 'axios'

let handler = async (m, { conn, args, usedPrefix, command }) => {
  if (!args[0]) return m.reply(`Usa: ${usedPrefix + command} https://whatsapp.com/channel/xxxx/ID emoji1,emoji2`)
  let url = args[0]
  let emojis = args.slice(1).join(',') || '❤️,🔥,👍,😍'
  try {
    await conn.sendPresenceUpdate('composing', m.chat)
    let { data } = await axios.get(`https://api.omegatech.app/api/Fun/Rch?action=react&url=${encodeURIComponent(url)}&emoji=${encodeURIComponent(emojis)}`)
    if (data?.data?.ok) m.reply(`✅ ${data.data.message}\nTask: ${data.data.task_id}`)
    else m.reply(JSON.stringify(data).slice(0,800))
  } catch (e) {
    if (e.response?.data?.error?.includes('daily limit')) {
      return m.reply(`❌ OmegaTech sin cuota hoy (50/50). Se resetea mañana 12pm hora Perú.`)
    }
    m.reply(`❌ Error: ${e.message}`)
  }
}
handler.help = ['tools']
handler.tags = ['tools']
handler.command = ['reactxd']
export default handler
