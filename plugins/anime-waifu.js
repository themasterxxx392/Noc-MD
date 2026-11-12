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

    // Inspeccionamos todas las posibles estructuras que pueda retornar la API
    let imageUrl = null
    const lista = Array.isArray(res) ? res : (res?.data || res?.result || res?.items)

    if (Array.isArray(lista) && lista.length > 0) {
      // Elegimos un elemento al azar de la lista
      const item = lista[Math.floor(Math.random() * lista.length)]
      imageUrl = typeof item === 'string' ? item : (item?.url || item?.path || item?.image || item?.hd || item?.mini)
    } else if (typeof res === 'string') {
      imageUrl = res
    } else if (res?.url) {
      imageUrl = res.url
    }

    if (!imageUrl) {
      throw new Error('La respuesta de la API no contiene una URL de imagen válida.')
    }

    const { data: imageBuffer } = await axios.get(imageUrl, {
      responseType: 'arraybuffer',
      timeout: 30000
    })

    // Envío limpio de la imagen sin caption
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
