import axios from 'axios'

let handler = async (m, { conn, args, usedPrefix, command }) => {
  const key = global.info?.evogbkey
  const base = global.info?.evogb
  const type = command.toLowerCase()

  await conn.sendMessage(m.chat, { react: { text: '🕒', key: m.key } })

  try {
    const apiUrl = `${base}/nsfw/interaction`
    const res = await axios.get(apiUrl, {
      params: { key, type },
      responseType: 'arraybuffer',
      timeout: 60000,
      validateStatus: () => true
    })

    const contentType = String(res.headers['content-type'] || '')
    const buffer = Buffer.from(res.data)

    // Imprimimos en consola qué carajos devolvió la API con status 200
    console.log(`[DEBUG INTERACTION ${type}] Content-Type:`, contentType)
    console.log(`[DEBUG INTERACTION ${type}] Body preview:`, buffer.toString().slice(0, 300))

    if (res.status !== 200 || buffer.length < 1000) {
      throw new Error(`HTTP ${res.status} o buffer muy pequeño`)
    }

    let mediaBuffer = buffer
    // Forzamos la lectura si viene en JSON o texto plano
    try {
      const jsonStr = buffer.toString()
      if (jsonStr.startsWith('{') || jsonStr.startsWith('[')) {
        const json = JSON.parse(jsonStr)
        const mediaUrl = json.resultado?.url || json.resultado?.image || json.url || json.resultado
        if (!mediaUrl) throw new Error('El JSON no tiene una URL válida.')
        
        const mediaRes = await axios.get(mediaUrl, { responseType: 'arraybuffer', timeout: 60000 })
        mediaBuffer = Buffer.from(mediaRes.data)
      }
    } catch (parseErr) {
      // Si no era JSON, asumimos que ya era el binario del video/gif
      if (parseErr.message !== 'El JSON no tiene una URL válida.' && !contentType.includes('video/') && !contentType.includes('image/')) {
        // Si llegó aquí y no es binario real, lanzamos el error con el texto real
      }
    }

    await conn.sendMessage(m.chat, { 
      video: mediaBuffer, 
      gifPlayback: true, 
      caption: `✨ *• Acción:* ${type}` 
    }, { quoted: m })

    await conn.sendMessage(m.chat, { react: { text: '✔️', key: m.key } })

  } catch (e) {
    console.error(`Error en interacción NSFW ${type}:`, e.message)
    await conn.sendMessage(m.chat, { react: { text: '✖️', key: m.key } })
    return conn.reply(m.chat, `> ✿︎ Ocurrió un error al procesar la animación.\n> *[Detalle: ${e.message}]*`, m)
  }
}

handler.help = [
  'spank', 'undress', 'yuri', 'sixnine', 'anal', 'fuck', 'cummoth', 
  'suckboobs', 'cumshot', 'lickpussy', 'lickdick', 'lickass', 'handjob', 
  'grope', 'cum', 'grabboobs', 'blowjob', 'boobjob', 'fap', 'footjob', 
  'fingering', 'creampie', 'facesitting', 'futanari', 'pegging', 'bondage', 
  'deepthroat', 'thighjob', 'yaoi', 'bukkake', 'orgy', 'squirting'
]
handler.tags = ['nsfw']
handler.command = [
  'spank', 'undress', 'yuri', 'sixnine', 'anal', 'fuck', 'cummoth', 
  'suckboobs', 'cumshot', 'lickpussy', 'lickdick', 'lickass', 'handjob', 
  'grope', 'cum', 'grabboobs', 'blowjob', 'boobjob', 'fap', 'footjob', 
  'fingering', 'creampie', 'facesitting', 'futanari', 'pegging', 'bondage', 
  'deepthroat', 'thighjob', 'yaoi', 'bukkake', 'orgy', 'squirting'
]

export default handler
