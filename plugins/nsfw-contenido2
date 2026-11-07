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

    if (res.status !== 200 || buffer.length < 1000) {
      let detalle = res.status === 404 ? 'No se encontró animación para esta interacción.' : `HTTP ${res.status}`
      if (contentType.includes('json')) {
        try {
          const json = JSON.parse(buffer.toString())
          detalle = json.message || json.error || json.msg || detalle
        } catch {}
      }
      throw new Error(detalle)
    }

    let mediaBuffer = buffer
    if (contentType.includes('json') || (!contentType.includes('video/') && !contentType.includes('image/'))) {
      try {
        const json = JSON.parse(buffer.toString())
        const mediaUrl = json.resultado?.url || json.resultado?.image || json.url || json.resultado
        if (!mediaUrl) throw new Error('No se encontró URL en el JSON.')
        const mediaRes = await axios.get(mediaUrl, { responseType: 'arraybuffer', timeout: 60000 })
        mediaBuffer = Buffer.from(mediaRes.data)
      } catch (err) {
        throw new Error('La API devolvió un formato inválido.')
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
