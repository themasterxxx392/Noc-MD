import axios from 'axios'

let handler = async (m, { conn, usedPrefix, command }) => {
  const base = global.info?.evogb || 'https://api.evogb.org'
  const key = global.info?.evogbkey || 'evogb-TyswGrUB'

  await conn.sendMessage(m.chat, { react: { text: '🕒', key: m.key } })

  try {
    const { data: res } = await axios.get(`${base}/sfw/rnd/v2`, {
      headers: {
        'x-api-key': key,
        'Accept': 'application/json'
      },
      params: {
        type: 'waifu'
      },
      responseType: 'json',
      timeout: 30000
    })

    // Extraemos la URL de la imagen de la estructura de respuesta (ajustado al nuevo endpoint v2)
    const imageUrl = res?.url || res?.data?.result || res?.data?.url || res?.result || (typeof res === 'string' ? res : null)

    if (!imageUrl) {
      throw new Error('La respuesta de la API no contiene una URL de imagen válida.')
    }

    const { data: imageBuffer } = await axios.get(imageUrl, {
      responseType: 'arraybuffer',
      timeout: 30000
    })

    // Envío limpio de la imagen sin texto ni caption
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
