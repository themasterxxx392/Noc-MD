import axios from 'axios'

const CHUNK_SIZE = 2000

function dividir(texto) {
  const partes = []
  let actual = ''
  for (const bloque of texto.split('\n\n')) {
    if ((actual + '\n\n' + bloque).length > CHUNK_SIZE && actual) {
      partes.push(actual.trim())
      actual = bloque
    } else {
      actual = actual ? actual + '\n\n' + bloque : bloque
    }
  }
  if (actual.trim()) partes.push(actual.trim())
  return partes
}

let handler = async (m, { conn, text, usedPrefix, command }) => {
  const key = global.info?.evogbkey
  const base = global.info?.evogb

  if (!text?.trim()) {
    return conn.reply(m.chat, `✿ Ingresa el nombre de la canción.\n\n*Ejemplo:* \`${usedPrefix + command} Coldplay Yellow\``, m)
  }

  await conn.sendMessage(m.chat, { react: { text: '🕒', key: m.key } })

  try {
    const { data: res } = await axios.get(`${base}/tools/lyrics`, {
      params: { key, query: text.trim(), server: 'auto' },
      timeout: 30000
    })

    const d = res?.data
    const letra = (d?.plainLyrics || d?.lyrics || '').trim()

    if (!res?.status || !d || !letra) {
      throw new Error('No se encontró la letra de esta canción.')
    }

    const views = Number(d.views)
    const txt = `*[ LYRICS ]*\n\n` +
                `> *Título:* ${d.title}\n` +
                `> *Artista:* ${d.artist || d.author?.name || 'Desconocido'}\n` +
                `> *Álbum:* ${d.album || '-'}\n` +
                `> *Duración:* ${d.timestamp || '-'}\n` +
                `> *Vistas:* ${Number.isFinite(views) ? views.toLocaleString('es-PE') : '-'}\n` +
                `> *Link:* ${d.url || '-'}`

    if (d.thumbnail) {
      await conn.sendMessage(m.chat, { image: { url: d.thumbnail }, caption: txt }, { quoted: m }).catch(() => conn.reply(m.chat, txt, m))
    } else {
      await conn.reply(m.chat, txt, m)
    }

    for (const parte of dividir(letra)) {
      await conn.sendMessage(m.chat, { text: parte }, { quoted: m })
    }

    await conn.sendMessage(m.chat, { react: { text: '✔️', key: m.key } })

  } catch (e) {
    console.error('Error en lyrics:', e.message)
    await conn.sendMessage(m.chat, { react: { text: '✖️', key: m.key } })
    return conn.reply(m.chat, `> ✿︎ Ocurrió un error al buscar la letra.\n> *[Detalle: ${e.message}]*`, m)
  }
}

handler.help = ['lyrics <canción>']
handler.tags = ['buscadores']
handler.command = ['lyrics']

export default handler
