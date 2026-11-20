import { promises as fs } from 'fs'
import { db } from '../lib/database.js'

const FILE_PATH = new URL('../lib/characters.json', import.meta.url)
const COOLDOWN_MS = 15 * 1000
const RESERVA_MS = 20 * 1000
const EXPIRA_MS = 60 * 60 * 1000
const TIMEOUT_MS = 15 * 1000

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  'Accept': 'image/*, application/json, text/plain, */*;q=0.8'
}

export const lastRollsByChat = new Map()

const cooldowns = new Map()
let tablaLista = false
let cache = { mtime: 0, personajes: [] }

async function asegurarTabla() {
  if (tablaLista) return
  await db.query(`
    CREATE TABLE IF NOT EXISTS gacha_characters (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      value INTEGER NOT NULL DEFAULT 100,
      owner_id TEXT,
      reserved_by TEXT,
      reserved_until BIGINT DEFAULT 0,
      expires_at BIGINT DEFAULT 0
    );
  `)
  tablaLista = true
}

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

const handler = async (message, { conn, usedPrefix, command }) => {
  const sender = message.sender
  const ahora = Date.now()

  const siguiente = cooldowns.get(sender) || 0
  if (siguiente > ahora) {
    const restante = Math.ceil((siguiente - ahora) / 1000)
    return message.reply(`ꕥ Debes esperar *${restante} segundo${restante !== 1 ? 's' : ''}* para usar *${usedPrefix}${command}* de nuevo.`)
  }

  if (cooldowns.size > 500) {
    for (const [u, t] of cooldowns) if (t < ahora) cooldowns.delete(u)
  }
  cooldowns.set(sender, ahora + COOLDOWN_MS)

  let enviado = false

  try {
    await asegurarTabla()

    const personajes = await cargarPersonajes()
    if (!personajes.length) {
      return message.reply('⚠️ No hay personajes cargados en `./lib/characters.json`.')
    }

    const personaje = personajes[Math.floor(Math.random() * personajes.length)]
    const nsfw = !message.isGroup || await nsfwActivo(message.chat)
    const media = await buscarImagen(personaje.tags?.[0] || '', personaje.name, nsfw)

    if (!media) {
      return message.reply(`ꕥ No se encontraron imágenes para el personaje *${personaje.name}*.`)
    }

    const id = String(personaje.id)
    const nombre = String(personaje.name || 'Sin nombre')

    const { rows } = await db.query(
      `INSERT INTO gacha_characters (id, name, value, owner_id, reserved_by, reserved_until, expires_at)
       VALUES ($1, $2, $3, NULL, $4, $5, $6)
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name,
         reserved_by = EXCLUDED.reserved_by,
         reserved_until = EXCLUDED.reserved_until,
         expires_at = EXCLUDED.expires_at
       RETURNING value, owner_id`,
      [id, nombre, Number(personaje.value) || 100, sender, ahora + RESERVA_MS, ahora + EXPIRA_MS]
    )

    const valor = Number(rows[0]?.value) || Number(personaje.value) || 100
    const ownerId = rows[0]?.owner_id || null

    let estado = 'Libre'
    const mentions = []
    if (ownerId) {
      const tag = ownerId.split('@')[0]
      const nombreDueno = await conn.getName(ownerId).then(n => (typeof n === 'string' && n.trim() ? n : tag)).catch(() => tag)
      estado = `Reclamado por @${tag} (${nombreDueno})`
      mentions.push(ownerId)
    }

    const texto =
      `❀ Nombre » *${nombre}*\n` +
      `⚥ Género » *${personaje.gender || 'Desconocido'}*\n` +
      `✰ Valor » *${valor.toLocaleString()}* 🪙\n` +
      `♡ Estado » *${estado}*\n` +
      `❖ Fuente » *${personaje.serie}*`

    const enviadoMsg = await conn.sendFile(message.chat, media.buffer, `${nombre}.${media.ext}`, texto, message, false, { mentions })
    enviado = true

    lastRollsByChat.set(message.chat, {
      characterId: id,
      name: nombre,
      value: valor,
      rolledBy: sender,
      rolledAt: ahora,
      msgId: enviadoMsg?.key?.id || enviadoMsg?.message?.id || null
    })
  } catch (error) {
    await conn.reply(
      message.chat,
      `⚠︎ Se ha producido un problema en el gacha.\n> Usa *${usedPrefix}report* para informarlo.\n\n${error.message}`,
      message
    )
  } finally {
    if (!enviado) cooldowns.delete(sender)
  }
}

handler.help = ['rw']
handler.tags = ['gacha']
handler.command = ['rw', 'rollwiafu']

export default handler
