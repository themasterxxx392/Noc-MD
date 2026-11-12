import axios from 'axios'

let handler = async (m, { conn, usedPrefix, command }) => {
  const base = global.info?.evogb || 'https://api.evogb.org'
  const key = global.info?.evogbkey || 'evogb-TyswGrUB'

  await conn.sendMessage(m.chat, { react: { text: '🕒', key: m.key } })

  try {
    const res = await axios.get(`${base}/sfw/rnd/v2`, {
      headers: {
        'x-api-key': key,
        'Accept': 'application/json, image/*'
      },
      params: {
        type: 'waifu'
      },
      responseType: 'arraybuffer',
      timeout: 60000,
      validateStatus: () => true
    })

    const contentType = String(res.headers['content-type'] || '')
    const buffer = Buffer.from(res.data)

    // Si la API devuelve un JSON de error en lugar de imagen, lo atrapamos
    if (res.status !== 200 || !contentType.startsWith('image/') || buffer.length < 1000) {
      let detalle = res.status === 404 ? 'No se encontró la imagen.' : `HTTP ${res.status}`
      if (contentType.includes('json') || !contentType.startsWith('image/')) {
        try {
          const json = JSON.parse(buffer.toString())
          detalle = json.message || json.error || json.msg || JSON.stringify(json)
        } catch {}
      }
      throw new Error(detalle)
    }

    // Envío limpio de la imagen directamente desde el buffer
    await conn.sendMessage(m.chat, { image: buffer }, { quoted: m })
    await conn.sendMessage(m.chat, { react: { text: '✔️', key: m.key } })

  } catch (e) {
    console.error('Error en waifu:', e.message)
    await conn.sendMessage(m.chat, { react: { text: '✖️', key: m.key } })
    await conn.sendMessage(m.chat, { text: `> ✿ Error en waifu:\n> \`${e.message}\`` }, { quoted: m })
  }
}

handler.help = ['waifu']
handler.tags = ['anime']
handler.command = ['waifu']

export default handler
