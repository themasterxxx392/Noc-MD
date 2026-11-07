import axios from 'axios'

let handler = async (m, { conn, args, usedPrefix, command }) => {
  const key = global.info?.evogbkey
  const base = global.info?.evogb
  const type = command.toLowerCase()

  await conn.sendMessage(m.chat, { react: { text: '🕒', key: m.key } })

  try {
    const apiUrl = type === 'loli' 
      ? `${base}/nsfw/random/loli` 
      : `${base}/nsfw/rnd`

    const res = await axios.get(apiUrl, {
      params: type === 'loli' ? { key, type: 'loli' } : { key, type },
      responseType: 'arraybuffer',
      timeout: 60000,
      validateStatus: () => true
    })

    const contentType = String(res.headers['content-type'] || '')
    const buffer = Buffer.from(res.data)

    if (res.status !== 200 || buffer.length < 1000) {
      let detalle = res.status === 404 ? 'No se encontraron resultados para esa categoría.' : `HTTP ${res.status}`
      if (contentType.includes('json')) {
        try {
          const json = JSON.parse(buffer.toString())
          detalle = json.message || json.error || json.msg || detalle
        } catch {}
      }
      throw new Error(detalle)
    }

    let imageBuffer = buffer
    if (contentType.includes('json')) {
      try {
        const json = JSON.parse(buffer.toString())
        const imageUrl = json.resultado?.url || json.resultado?.image || json.url || json.resultado
        if (!imageUrl) throw new Error('No se encontró URL en el JSON.')
        const imgRes = await axios.get(imageUrl, { responseType: 'arraybuffer', timeout: 60000 })
        imageBuffer = Buffer.from(imgRes.data)
      } catch (jsonErr) {
        throw new Error('La API devolvió un JSON inválido o sin enlace de imagen.')
      }
    }

    await conn.sendMessage(m.chat, { image: imageBuffer, caption: `✨ *• Categoria:* ${type}` }, { quoted: m })
    await conn.sendMessage(m.chat, { react: { text: '✔️', key: m.key } })

  } catch (e) {
    console.error(`Error en ${type}:`, e.message)
    await conn.sendMessage(m.chat, { react: { text: '✖️', key: m.key } })
    return conn.reply(m.chat, `> ✿︎ Ocurrió un error al procesar la imagen.\n> *[Detalle: ${e.message}]*`, m)
  }
}

handler.help = [
  'hentai', 'neko', 'kemonomimi', 'bunny', 'maid', 'boobs', 'bigboobs', 
  'mediumboobs', 'smallboobs', 'ass', 'pussy', 'masturbation', 'masturbating', 
  'threesome', 'kissing', 'bikini', 'schoolgirl', 'wet', 'yuri', 'lesbian', 'trap', 'loli'
]
handler.tags = ['nsfw']
handler.command = [
  'hentai', 'neko', 'kemonomimi', 'bunny', 'maid', 'boobs', 'bigboobs', 
  'mediumboobs', 'smallboobs', 'ass', 'pussy', 'masturbation', 'masturbating', 
  'threesome', 'kissing', 'bikini', 'schoolgirl', 'wet', 'yuri', 'lesbian', 'trap', 'loli'
]

export default handler
