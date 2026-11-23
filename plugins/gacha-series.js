import { promises as fs } from 'fs'

const FILE_PATH = new URL('../lib/characters.json', import.meta.url)
const MAX_POR_PAGINA = 45

let cache = { mtime: 0, series: [] }

async function cargarSeries() {
  const { mtimeMs } = await fs.stat(FILE_PATH)
  if (mtimeMs !== cache.mtime) {
    const data = JSON.parse(await fs.readFile(FILE_PATH, 'utf-8'))
    cache = {
      mtime: mtimeMs,
      series: Object.entries(data).map(([id, s]) => ({
        id,
        name: String(s?.name || 'Desconocido'),
        tags: Array.isArray(s?.tags) ? s.tags : [],
        characters: Array.isArray(s?.characters) ? s.characters : []
      }))
    }
  }
  return cache.series
}

const normalizar = (str = '') =>
  String(str)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()

function buscarSerie(seriesList, query) {
  const q = normalizar(query)
  if (!q) return null

  return (
    seriesList.find(s => normalizar(s.name) === q || s.tags.some(t => normalizar(t) === q)) ||
    seriesList.find(s => normalizar(s.name).includes(q) || s.tags.some(t => normalizar(t).includes(q))) ||
    null
  )
}

const handler = async (m, { conn, args, usedPrefix, command }) => {
  try {
    const seriesList = await cargarSeries()
    if (!seriesList.length) {
      return m.reply('⚠️ No hay series cargadas en `./lib/characters.json`.')
    }

    const textoArg = (args || []).join(' ').trim()

    // Sin argumentos: listar todas las series disponibles
    if (!textoArg) {
      const totalPersonajes = seriesList.reduce((acc, s) => acc + s.characters.length, 0)
      const lista = seriesList
        .map((s, i) => `${i + 1}. *${s.name}* (${s.characters.length})`)
        .join('\n')

      const mensaje =
        `❀ *Series en el gacha* (${seriesList.length} series • ${totalPersonajes.toLocaleString()} personajes)\n\n` +
        `${lista}\n\n` +
        `> Usa *${usedPrefix}${command} <nombre de la serie>* para ver sus personajes.`

      return conn.sendMessage(m.chat, { text: mensaje }, { quoted: m })
    }

    // Con argumento: buscar serie y mostrar sus personajes
    const serie = buscarSerie(seriesList, textoArg)
    if (!serie) {
      return m.reply(`ꕥ No encontré ninguna serie que coincida con *${textoArg}*. Usa *${usedPrefix}${command}* para ver la lista.`)
    }

    if (!serie.characters.length) {
      return m.reply(`ꕥ La serie *${serie.name}* no tiene personajes registrados.`)
    }

    const nombres = serie.characters.map((c, i) => `${i + 1}. ${c.name || 'Sin nombre'}`)

    if (nombres.length <= MAX_POR_PAGINA) {
      const mensaje =
        `❀ *${serie.name}* (${serie.characters.length} personajes)\n\n` +
        nombres.join('\n')

      return conn.sendMessage(m.chat, { text: mensaje }, { quoted: m })
    }

    // Si la serie tiene muchísimos personajes, los divide en partes para no cortar el mensaje
    for (let i = 0; i < nombres.length; i += MAX_POR_PAGINA) {
      const parte = nombres.slice(i, i + MAX_POR_PAGINA)
      const numParte = Math.floor(i / MAX_POR_PAGINA) + 1
      const totalPartes = Math.ceil(nombres.length / MAX_POR_PAGINA)
      const encabezado =
        i === 0
          ? `❀ *${serie.name}* (${serie.characters.length} personajes) — Parte ${numParte}/${totalPartes}\n\n`
          : `❀ *${serie.name}* — Parte ${numParte}/${totalPartes}\n\n`

      await conn.sendMessage(m.chat, { text: encabezado + parte.join('\n') }, { quoted: m })
    }
  } catch (error) {
    console.error('Error en series:', error.message)
    await m.reply(
      `⚠︎ Se ha producido un problema al consultar las series.\n> Usa *${usedPrefix}report* para informarlo.\n\n${error.message}`
    )
  }
}

handler.help = ['series']
handler.tags = ['gacha']
handler.command = ['series', 'serie']

export default handler
