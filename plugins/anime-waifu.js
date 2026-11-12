import axios from 'axios'

let handler = async (m, { conn, usedPrefix, command }) => {
  const base = global.info?.evogb || 'https://api.evogb.org'
  const key = global.info?.evogbkey || 'evogb-TyswGrUB'

  await conn.sendMessage(m.chat, { react: { text: '🕒', key: m.key } })

  try {
    const { data: res } = await axios.get(`${base}/sfw/rnd`, {
      params: { key, type: 'list' },
      responseType: 'json',
      timeout: 30000
    })

    
    let items = res?.data || res?.result || res
    let imageUrl = null

    if (Array.isArray(items) && items.length > 0) {
      
      const randomItem = items[Math.floor(Math.random() * items.length)]
      imageUrl = typeof randomItem === 'string' ? randomItem : (randomItem?.url || randomItem?.path)
    } else if (typeof items === 'string') {
      imageUrl = items
    } else if (res?.url) {
      imageUrl = res.url
    }

    if (!imageUrl) {
      throw new Error('La API no devolvió ninguna imagen válida.')
    }

    const { data: imageBuffer } = await axios.get(imageUrl, {
      responseType: 'arraybuffer',
      timeout: 30000
    })

    await conn.sendMessage(m.chat, { image: Buffer.from(imageBuffer) }, { quoted: m })
    await conn.sendMessage(m.chat, { react: { text: '✔️', key: m.key } })

  } catch (e) {
    console.error('Error en waifu:', e.message)
    await conn.sendMessage(m.chat, { react: { text: '✖️', key: m.key } })
    return conn.reply(m.chat, `> ✿︎ Ocurrió un error al obtener la waifu.\n> *[Detalle: ${e.message}]*`, m)
  }
}

handler.help = ['waifu']
handler.tags = ['anime']
handler.command = ['waifu']

export default handler
