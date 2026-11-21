import { promises as fs } from 'fs'
import { db } from '../lib/database.js'

const FILE_PATH = new URL('../lib/characters.json', import.meta.url)
const COOLDOWN_MS = 15 * 60 * 1000
const RESERVA_MS = 20 * 1000
const EXPIRA_MS = 60 * 1000
const TIMEOUT_MS = 15 * 1000

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  'Accept': 'image/*, application/json, text/plain, */*;q=0.8'
}

export const lastRollsByChat = (globalThis.__gachaRolls ||= new Map())
const recientes = (globalThis.__gachaRecientes ||= new Map())

let cache = { mtime: 0, personajes: [] }

const cooldowns = new Map()

async function cargarCooldown(clave) {
  if (cooldowns.has(clave)) return
  const res = await db.query('SELECT next_roll_at FROM gacha_cooldowns WHERE user_id = $1', [clave])
  cooldowns.set(clave, Number(res.rows?.[0]?.next_roll_at) || 0)
}

function guardarCooldown(clave, hasta) {
  db.query(
    `INSERT INTO gacha_cooldowns (user_id, next_roll_at)
     VALUES ($1, $2)
     ON CONFLICT (user_id) DO UPDATE SET next_roll_at = EXCLUDED.next_roll_at`,
    [clave, hasta]
  ).catch(error => console.error('Error guardando cooldown:', error.message))
}

function formatoTiempo(ms) {
  const total = Math.ceil(ms / 1000)
  const min = Math.floor(total / 60)
  const seg = total % 60
  return [
    min ? `${min} minuto${min !== 1 ? 's' : ''}` : '',
    seg ? `${seg} segundo${seg !== 1 ? 's' : ''}` : ''
  ].filter(Boolean).join(' y ')
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

  await cargarCooldown(sender).catch(() => cooldowns.set(sender, 0))

  const ahora = Date.now()
  const restante = (cooldowns.get(sender) || 0) - ahora
  if (restante > 0) {
    return message.reply(`ꕥ Debes esperar *${formatoTiempo(restante)}* para usar *${usedPrefix}${command}* de nuevo.`)
  }

  if (cooldowns.size > 500) {
    for (const [u, t] of cooldowns) if (t < ahora) cooldowns.delete(u)
  }
  cooldowns.set(sender, ahora + COOLDOWN_MS)

  let enviado = false

  try {
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

    const existente = (await db.query('SELECT * FROM gacha_characters WHERE id = $1', [id])).rows?.[0]
    const valor = typeof existente?.value === 'number' ? existente.value : Number(personaje.value) || 100
    const ownerId = existente?.owner_id || null

    await db.query(
      `INSERT INTO gacha_characters (id, name, value, owner_id, reserved_by, reserved_until, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name,
         value = EXCLUDED.value,
         reserved_by = EXCLUDED.reserved_by,
         reserved_until = EXCLUDED.reserved_until,
         expires_at = EXCLUDED.expires_at`,
      [id, nombre, valor, ownerId, sender, ahora + RESERVA_MS, ahora + EXPIRA_MS]
    )

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
    guardarCooldown(sender, ahora + COOLDOWN_MS)

    const msgId = enviadoMsg?.key?.id || enviadoMsg?.message?.id || null

    lastRollsByChat.set(message.chat, {
      characterId: id,
      name: nombre,
      value: valor,
      rolledBy: sender,
      rolledAt: ahora,
      msgId
    })

    const vigentes = (recientes.get(message.chat) || []).filter(r => r.expiresAt > ahora)
    vigentes.push({ characterId: id, name: nombre, value: valor, msgId, expiresAt: ahora + EXPIRA_MS })
    recientes.set(message.chat, vigentes.slice(-10))
  } catch (error) {
    await conn.reply(
      message.chat,
      `⚠︎ Se ha producido un problema en el gacha.\n> Usa *${usedPrefix}report* para informarlo.\n\n${error.message}`,
      message
    )
  } finally {
    if (!enviado) cooldowns.set(sender, 0)
  }
}

handler.help = ['rw']
handler.tags = ['gacha']
handler.command = 'rw2', 'rollwaifu']

export default handler
