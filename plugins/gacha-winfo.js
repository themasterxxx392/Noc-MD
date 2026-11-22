import { promises as fs } from 'fs'
import { db } from '../lib/database.js'

const FILE_PATH = new URL('../lib/characters.json', import.meta.url)
const TIMEOUT_MS = 15 * 1000

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  'Accept': 'image/*, application/json, text/plain, */*;q=0.8'
}

let cache = { mtime: 0, personajes: [] }

async function cargarPersonajes() {
  const { mtimeMs } = await fs.stat(FILE_PATH)
  if (mtimeMs !== cache.mtime) {
    const data = JSON.parse(await fs.readFile(FILE_PATH, 'utf-8'))
    cache = {
      mtime: mtimeMs,
      personajes: Object.values(data).flatMap(serie =>
        Array.isArray(serie?.characters)
          ? serie.characters.map(c => ({ ...c, serie: serie.name || 'Desconocido' }))
          : []
      )
    }
  }
  return cache.personajes
}

const formatTag = (tag) => String(tag || '').toLowerCase().trim().replace(/\s+/g, '_')
const normalizar = (texto) => String(texto || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim()

function comoImagen(buffer, tipo = '') {
  if (!buffer || buffer.length < 16) return null
  if (buffer.subarray(0, 3).toString('ascii') === 'GIF') return { buffer, ext: 'gif' }
  if (buffer[0] === 0xff && buffer[1] === 0xd8) return { buffer, ext: 'jpg' }
  if (buffer[0] === 0x89 && buffer[1] === 0x50) return { buffer, ext: 'png' }
  if (buffer.toString('ascii', 8, 12) === 'WEBP') return { buffer, ext: 'webp' }
  if (String(tipo).toLowerCase().startsWith('image/')) return { buffer, ext: 'jpg' }
  return null
}

function extraerUrls(json) {
  if (!json) return []
  const lista = Array.isArray(json?.results)
    ? json.results
    : Array.isArray(json)
      ? json
      : [json?.url, json?.image, json?.file_url, json?.large_file_url, json?.data?.url, json?.data?.image]

  return lista
    .map(i => typeof i === 'string' ? i.trim() : String(i?.url || i?.file_url || i?.large_file_url || i?.image || '').trim())
    .filter(u => /^https?:\/\/\S+/i.test(u))
}

const pedir = (url) => fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(TIMEOUT_MS) })

async function descargarImagen(url) {
  const res = await pedir(url)
  if (!res.ok) return null
  return comoImagen(Buffer.from(await res.arrayBuffer()), res.headers.get('content-type') || '')
}

function endpoints(query, nsfw) {
  const base = global.info?.evogb
  const k = encodeURIComponent(global.info?.evogbkey)
  const q = encodeURIComponent(query)
  const lista = [`${base}/nsfw/safebooru?key=${k}&keyword=${q}`]
  if (nsfw) {
    lista.push(
      `${base}/nsfw/danbooru?key=${k}&keyword=${q}`,
      `${base}/nsfw/gelbooru?key=${k}&keyword=${q}&json=false`
    )
  }
  return lista
}

async function buscarImagen(tag, nombre, nsfw) {
  const consultas = [...new Set([formatTag(tag), formatTag(nombre)].filter(Boolean))]

  for (const consulta of consultas) {
    for (const url of endpoints(consulta, nsfw)) {
      try {
        const res = await pedir(url)
        if (!res.ok) continue

        const buffer = Buffer.from(await res.arrayBuffer())
        const directa = comoImagen(buffer, res.headers.get('content-type') || '')
        if (directa) return directa

        let json = null
        try {
          json = JSON.parse(buffer.toString('utf8').trim())
        } catch {}

        const candidatas = extraerUrls(json).sort(() => Math.random() - 0.5).slice(0, 3)
        for (const candidata of candidatas) {
          const descargada = await descargarImagen(candidata).catch(() => null)
          if (descargada) return descargada
        }
      } catch {}
    }
  }

  return null
}

async function nsfwActivo(chat) {
  try {
    const res = await db.query('SELECT nsfw FROM group_settings WHERE group_id = $1', [chat])
    return !!res.rows?.[0]?.nsfw
  } catch {
    return false
  }
}

const handler = async (m, { conn, text, usedPrefix, command }) => {
  const busqueda = normalizar(text)
  if (!busqueda) {
    return m.reply(`ꕥ Ingresa el nombre del personaje que deseas buscar.\n> Ejemplo: *${usedPrefix}${command} Rikka Theoto*`)
  }

  try {
    const personajes = await cargarPersonajes()
    if (!personajes.length) return

    const personaje =
      personajes.find(p => normalizar(p.name) === busqueda) ||
      personajes.find(p => normalizar(p.name).startsWith(busqueda)) ||
      personajes.find(p => normalizar(p.name).includes(busqueda))

    if (!personaje) {
      return m.reply(`ꕥ No se encontró ningún personaje llamado *${text.trim()}*.`)
    }

    const id = String(personaje.id)
    const nombre = String(personaje.name || 'Sin nombre')

    const existente = (await db.query('SELECT value, owner_id FROM gacha_characters WHERE id = $1', [id])).rows?.[0]
    const valor = typeof existente?.value === 'number' ? existente.value : Number(personaje.value) || 100
    const ownerId = existente?.owner_id || null

    let estado = 'Libre'
    const mentions = []
    if (ownerId) {
      const tag = ownerId.split('@')[0]
      const nombreDueno = await conn.getName(ownerId).then(n => (typeof n === 'string' && n.trim() ? n : tag)).catch(() => tag)
      estado = `Reclamado por @${tag} (${nombreDueno})`
      mentions.push(ownerId)
    }

    const infoTexto =
      `❀ Nombre » *${nombre}*\n` +
      `⚥ Género » *${personaje.gender || 'Desconocido'}*\n` +
      `✰ Valor » *${valor.toLocaleString()}*\n` +
      `♡ Estado » *${estado}*\n` +
      `❖ Fuente » *${personaje.serie}*`

    const nsfw = !m.isGroup || await nsfwActivo(m.chat)
    const media = await buscarImagen(personaje.tags?.[0] || '', nombre, nsfw)

    if (media) {
      await conn.sendFile(m.chat, media.buffer, `${nombre}.${media.ext}`, infoTexto, m, false, { mentions })
    } else {
      await conn.sendMessage(m.chat, { text: infoTexto, mentions }, { quoted: m })
    }
  } catch (error) {
    await conn.reply(
      m.chat,
      `⚠︎ Se ha producido un problema al buscar el personaje.\n> Usa *${usedPrefix}report* para informarlo.\n\n${error.message}`,
      m
    )
  }
}

handler.help = ['winfo']
handler.tags = ['gacha']
handler.command = ['winfo']

export default handler
