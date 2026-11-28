import { promises as fs } from 'fs'
import { db } from '../lib/database.js'

const FILE_PATH = new URL('../lib/characters.json', import.meta.url)
const VOTO_MIN = 100
const VOTO_MAX = 200
const COOLDOWN_MS = 60 * 60 * 1000
const MAX_OPCIONES = 5

const votando = new Set()
const cooldowns = new Map()
let cache = { mtime: 0, personajes: [] }

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
  const horas = Math.floor(total / 3600)
  const min = Math.floor((total % 3600) / 60)
  const seg = total % 60
  return [
    horas ? `${horas} hora${horas !== 1 ? 's' : ''}` : '',
    min ? `${min} minuto${min !== 1 ? 's' : ''}` : '',
    !horas && seg ? `${seg} segundo${seg !== 1 ? 's' : ''}` : ''
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

const normalizar = (texto) => String(texto || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ')
  .trim()

function buscar(personajes, consulta) {
  const q = normalizar(consulta)
  if (!q) return []

  const porId = personajes.filter(p => String(p.id) === String(consulta).trim())
  if (porId.length === 1) return porId

  let lista = personajes.filter(p => normalizar(p.name) === q)
  if (!lista.length) lista = personajes.filter(p => normalizar(p.name).startsWith(q))
  if (!lista.length) lista = personajes.filter(p => normalizar(p.name).includes(q))

  return lista
}

const tag = (jid) => `@${String(jid).split('@')[0]}`

const handler = async (m, { conn, text, usedPrefix, command }) => {
  const sender = m.sender
  const consulta = (text || '').trim()

  if (!consulta) {
    return conn.reply(m.chat, `❖ Indica el personaje al que quieres votar.\n\n*Ejemplo:* \`${usedPrefix + command} Rem\`\n\n> ✩ Cada voto sube su valor entre ${VOTO_MIN} y ${VOTO_MAX} 🪙.`, m)
  }

  const personajes = await cargarPersonajes()
  const coincidencias = buscar(personajes, consulta)

  if (!coincidencias.length) {
    return m.reply(`ꕥ No encontré ningún personaje llamado *${consulta}*.`)
  }

  if (coincidencias.length > 1) {
    const lista = coincidencias.slice(0, MAX_OPCIONES).map(p => `> ❒ *${p.name}* (${p.serie}) » id *${p.id}*`).join('\n')
    return conn.reply(m.chat, `ꕥ Encontré varios personajes, vota con su id:\n\n${lista}${coincidencias.length > MAX_OPCIONES ? `\n> ...y ${coincidencias.length - MAX_OPCIONES} más` : ''}\n\n> ✩ Ejemplo: \`${usedPrefix + command} ${coincidencias[0].id}\``, m)
  }

  const personaje = coincidencias[0]
  const id = String(personaje.id)
  const clave = `vote:${sender}`

  await cargarCooldown(clave).catch(() => cooldowns.set(clave, 0))

  const restante = (cooldowns.get(clave) || 0) - Date.now()
  if (restante > 0) {
    return m.reply(`ꕥ Debes esperar *${formatoTiempo(restante)}* para votar de nuevo.`)
  }

  if (votando.has(id)) {
    return m.reply('ꕥ Alguien más está votando por este personaje, intenta de nuevo.')
  }
  votando.add(id)

  const ahora = Date.now()
  cooldowns.set(clave, ahora + COOLDOWN_MS)
  let votado = false

  try {
    const fila = (await db.query('SELECT * FROM gacha_characters WHERE id = $1', [id])).rows?.[0]
    const guardado = Number(fila?.value)
    const anterior = fila && Number.isFinite(guardado) ? guardado : Number(personaje.value) || 100
    const aumento = Math.floor(Math.random() * (VOTO_MAX - VOTO_MIN + 1)) + VOTO_MIN
    const nuevo = anterior + aumento
    const nombre = String(personaje.name || 'Sin nombre')

    if (fila) {
      await db.query('UPDATE gacha_characters SET value = $1 WHERE id = $2', [nuevo, id])
    } else {
      await db.query(
        `INSERT INTO gacha_characters (id, name, value, owner_id, reserved_by, reserved_until, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (id) DO UPDATE SET
           name = EXCLUDED.name,
           value = EXCLUDED.value`,
        [id, nombre, nuevo, null, null, 0, 0]
      )
    }

    votado = true
    guardarCooldown(clave, ahora + COOLDOWN_MS)

    await conn.sendMessage(m.chat, {
      text: `❀ ${tag(sender)} votó por *${nombre}*\n✰ Valor » *${anterior.toLocaleString()}* ➩ *${nuevo.toLocaleString()}* 🪙 (+${aumento})\n❖ Fuente » *${personaje.serie}*`,
      mentions: [sender]
    }, { quoted: m })
  } catch (error) {
    console.error('Error en vote:', error.message)
    await m.reply(`⚠︎ Se ha producido un problema al votar.\n> Usa *${usedPrefix}report* para informarlo.\n\n${error.message}`)
  } finally {
    votando.delete(id)
    if (!votado) cooldowns.set(clave, 0)
  }
}

handler.help = ['vote']
handler.tags = ['gacha']
handler.command = ['vote', 'votar']

export default handler
