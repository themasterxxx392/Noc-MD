import axios from 'axios'

let handler = async (m, { conn, usedPrefix, command }) => {
  const base = global.info?.evogb || 'https://api.evogb.org'
  const key = global.info?.evogbkey || 'evogb-TyswGrUB'

  await conn.sendMessage(m.chat, { react: { text: '🕒', key: m.key } })

  try {
    // Intentamos primero con la ruta de endpoints aleatorios
    let res
    try {
      const response = await axios.get(`${base}/sfw/rnd`, {
        params: { key, type: 'waifu' },
        responseType: 'json',
        timeout: 30000,
        validateStatus: () => true // Evita que axios lance error 500 automáticamente y nos deja leerlo
      })
      res = response.data
    } catch {
      res = null
    }

    // Si la API principal falló o no dio url, probamos con la ruta de interacción o respaldo si aplica
    let imageUrl = res?.url || res?.data?.url || (typeof res === 'string' ? res : null)

    if (!imageUrl) {
      // Intento alternativo por si la ruta waifu requiere otro formato en tu panel
      const altResponse = await axios.get(`${base}/sfw/interaction`, {
        params: { key, type: 'waifu' },
        responseType: 'json',
        timeout: 30000
      })
      imageUrl = altResponse.data?.url || altResponse.data?.data?.url
    }

    if (!imageUrl) {
      throw new Error('La API no devolvió ninguna URL de imagen válida.')
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
