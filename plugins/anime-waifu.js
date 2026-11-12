import axios from 'axios'

let handler = async (m, { conn, usedPrefix, command }) => {
  const base = global.info?.evogb || 'https://api.evogb.org'
  const key = global.info?.evogbkey || 'evogb-TyswGrUB'

  await conn.sendMessage(m.chat, { react: { text: '🕒', key: m.key } })

  try {
    // Realizamos la petición con los headers y query parameters correctos
    const { data: res } = await axios.get(`${base}/sfw/rnd/v2`, {
      headers: {
        'x-api-key': key,
        'Accept': 'application/json'
      },
      params: {
        key: key, // Por si el endpoint también lo pide en query
        type: 'waifu'
      },
      responseType: 'json',
      timeout: 30000
    })

    // Imprimimos la respuesta completa en tu consola negra para auditarla si vuelve a fallar
    console.log('RESPUESTA API WAIFU:', JSON.stringify(res))

    const imageUrl = res?.data?.url || res?.data?.result || res?.url || res?.result || (typeof res === 'string' ? res : null)

    if (!imageUrl || typeof imageUrl !== 'string' || !imageUrl.startsWith('http')) {
      throw new Error(`La API no devolvió una URL válida. JSON recibido: ${JSON.stringify(res)}`)
    }

    const { data: imageBuffer } = await axios.get(imageUrl, {
      responseType: 'arraybuffer',
      timeout: 30000
    })

    // Envío completamente limpio de la imagen sin caption
    await conn.sendMessage(m.chat, { image: Buffer.from(imageBuffer) }, { quoted: m })
    await conn.sendMessage(m.chat, { react: { text: '✔️', key: m.key } })

  } catch (e) {
    console.error('Error detallado en waifu:', e.response?.data || e.message)
    await conn.sendMessage(m.chat, { react: { text: '✖️', key: m.key } })
    
    // Ahora te mandará el error exacto al chat para que lo veamos sin adivinar
    const errorMsg = e.response?.data ? JSON.stringify(e.response.data) : e.message
    return conn.reply(m.chat, `> ✿︎ Error en waifu:\n> \`${errorMsg}\``, m)
  }
}

handler.help = ['waifu']
handler.tags = ['anime']
handler.command = ['waifu']

export default handler
