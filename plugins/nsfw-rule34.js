import axios from 'axios'

const BLOQUEADOS = ['loli', 'lolicon', 'shota', 'shotacon', 'child', 'children', 'kid', 'kids', 'toddler', 'underage', 'minor', 'preteen', 'infant', 'baby', 'young', 'cub', 'babyfur']

let handler = async (m, { conn, text, usedPrefix, command, chat }) => {
  const key = global.info?.evogbkey
  const base = global.info?.evogb

  if (m.isGroup && !chat?.nsfw) {
    return conn.reply(m.chat, '❖ Los comandos NSFW están desactivados en este grupo. Un administrador debe activarlos.', m)
  }

  if (!text?.trim()) {
    return conn.reply(m.chat, `❖ Ingresa el tag que quieres buscar.\n\n*Ejemplo:* \`${usedPrefix + command} ellen joe\``, m)
  }

  const tag = text.trim().toLowerCase().replace(/\s+/g, '_')
  const partes = tag.split(/[_\-+,.]+/).filter(Boolean)

  if (partes.some(p => BLOQUEADOS.includes(p))) {
    return conn.reply(m.chat, '⚠️ Esa búsqueda no está permitida.', m)
  }

  await conn.sendMessage(m.chat, { react: { text: '🕒', key: m.key } })

  try {
    const res = await axios.get(`${base}/nsfw/rule34`, {
      params: { key, tag, type: 'image' },
      responseType: 'arraybuffer',
      timeout: 60000,
      validateStatus: () => true
    })

    const type = String(res.headers['content-type'] || '')
    const buffer = Buffer.from(res.data)

    if (res.status !== 200 || !type.startsWith('image/') || buffer.length < 1000) {
      let detalle = res.status === 404 ? 'No se encontraron resultados para ese tag.' : `HTTP ${res.status}`
      if (type.includes('json')) {
        try {
          const json = JSON.parse(buffer.toString())
          detalle = json.message || json.error || json.msg || detalle
        } catch {}
      }
      throw new Error(detalle)
    }

    await conn.sendMessage(m.chat, { image: buffer }, { quoted: m })
    await conn.sendMessage(m.chat, { react: { text: '✔️', key: m.key } })

  } catch (e) {
    console.error('Error en rule34:', e.message)
    await conn.sendMessage(m.chat, { react: { text: '✖️', key: m.key } })
    return conn.reply(m.chat, `> ✿︎ Ocurrió un error al buscar la imagen.\n> *[Detalle: ${e.message}]*`, m)
  }
}

handler.help = ['rule34']
handler.tags = ['nsfw']
handler.command = ['r34', 'rule34']

export default handler
