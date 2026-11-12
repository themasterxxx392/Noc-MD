import axios from 'axios'

let handler = async (m, { conn, usedPrefix, command }) => {
  const base = global.info?.evogb || 'https://api.evogb.org'
  const key = global.info?.evogbkey || 'evogb-TyswGrUB'

  await conn.sendMessage(m.chat, { react: { text: '🕒', key: m.key } })

  try {
    // Probamos la petición estándar a la ruta de waifu directamente o con query params limpios
    const { data: res } = await axios.get(`${base}/sfw/waifu`, {
      params: { key },
      responseType: 'json',
      timeout: 30000
    })

    const imageUrl = res?.url || res?.data?.url || (typeof res === 'string' ? res : null)

    if (!imageUrl) {
      throw new Error('La API no devolvió una URL de imagen válida.')
    }

    const { data: imageBuffer } = await axios.get(imageUrl, {
      responseType: 'arraybuffer',
      timeout: 30000
    })

    // Envío completamente limpio de la imagen sin caption
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
