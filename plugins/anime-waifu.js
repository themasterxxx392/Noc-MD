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

    // Inspeccionamos de forma estricta todas las rutas posibles del JSON
    const imageUrl = res?.data?.result || res?.data?.url || res?.result || res?.url || (typeof res === 'string' ? res : null)

    if (!imageUrl || typeof imageUrl !== 'string' || !imageUrl.startsWith('http')) {
      throw new Error(`Estructura inválida de la API: ${JSON.stringify(res)}`)
    }

    const { data: imageBuffer } = await axios.get(imageUrl, {
      responseType: 'arraybuffer',
      timeout: 30000
    })

    // Envío de la imagen limpia sin caption
    await conn.sendMessage(m.chat, { image: Buffer.from(imageBuffer) }, { quoted: m })
    await conn.sendMessage(m.chat, { react: { text: '✔️', key: m.key } })

  } catch (e) {
    console.error('Error detallado en waifu:', e.message)
    await conn.sendMessage(m.chat, { react: { text: '✖️', key: m.key } })
    
    // Envío de respaldo forzado mediante sendMessage para asegurarnos de que el error salga al chat sí o sí
    await conn.sendMessage(m.chat, { text: `> ✿ Error en waifu:\n> \`${e.message}\`` }, { quoted: m })
  }
}

handler.help = ['waifu']
handler.tags = ['anime']
handler.command = ['waifu']

export default handler
