import { db } from '../lib/database.js'

const COOLDOWN_MS = 15 * 60 * 1000

const reclamando = new Set()

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

const tag = (jid) => `@${String(jid).split('@')[0]}`

function buscarTirada(m) {
  const citado = m.quoted
  if (!citado) return null

  const vigentes = (globalThis.__gachaRecientes?.get(m.chat) || []).filter(r => r.expiresAt > Date.now())
  if (!vigentes.length) return null

  const citadoId = citado.id || citado.key?.id || m.message?.extendedTextMessage?.contextInfo?.stanzaId
  const porId = citadoId ? vigentes.find(r => r.msgId === citadoId) : null
  if (porId) return porId

  const texto = [citado.text, citado.caption, citado.msg?.caption, citado.message?.imageMessage?.caption].find(t => typeof t === 'string' && t) || ''
  const nombre = texto.match(/Nombre\s*»\s*\*([^*]+)\*/)?.[1]?.trim()
  if (!nombre) return null

  return [...vigentes].reverse().find(r => r.name === nombre) || null
}

const handler = async (m, { conn, usedPrefix, command }) => {
  if (!m.quoted) {
    return m.reply(`ꕥ Responde al mensaje del personaje que quieres reclamar con *${usedPrefix}${command}*.`)
  }

  const tirada = buscarTirada(m)
  if (!tirada) {
    return m.reply('ꕥ Ese mensaje no es un personaje que se pueda reclamar, o ya expiró.')
  }

  const sender = m.sender
  const clave = `claim:${sender}`

  await cargarCooldown(clave).catch(() => cooldowns.set(clave, 0))

  const restante = (cooldowns.get(clave) || 0) - Date.now()
  if (restante > 0) {
    return m.reply(`ꕥ Debes esperar *${formatoTiempo(restante)}* para reclamar de nuevo.`)
  }

  const id = tirada.characterId
  if (reclamando.has(id)) return
  reclamando.add(id)

  let reclamado = false
  const ahora = Date.now()
  cooldowns.set(clave, ahora + COOLDOWN_MS)

  try {

    const fila = (await db.query('SELECT * FROM gacha_characters WHERE id = $1', [id])).rows?.[0]
    if (!fila) {
      return m.reply('⚠️ No encontré a ese personaje, intenta tirar de nuevo.')
    }

    if (fila.owner_id) {
      const mismo = fila.owner_id === sender
      return conn.sendMessage(m.chat, {
        text: mismo
          ? `ꕥ *${fila.name}* ya es tuyo.`
          : `ꕥ *${fila.name}* ya fue reclamado por ${tag(fila.owner_id)}.`,
        mentions: mismo ? [] : [fila.owner_id]
      }, { quoted: m })
    }

    if (Number(fila.expires_at) && ahora > Number(fila.expires_at)) {
      return m.reply(`ꕥ *${fila.name}* ya expiró, nadie lo reclamó a tiempo.`)
    }

    const reservaHasta = Number(fila.reserved_until) || 0
    if (fila.reserved_by && fila.reserved_by !== sender && ahora < reservaHasta) {
      const restante = Math.ceil((reservaHasta - ahora) / 1000)
      return conn.sendMessage(m.chat, {
        text: `ꕥ *${fila.name}* está reservado para ${tag(fila.reserved_by)} por *${restante} segundo${restante !== 1 ? 's' : ''}* más.`,
        mentions: [fila.reserved_by]
      }, { quoted: m })
    }

    await db.query(
      'UPDATE gacha_characters SET owner_id = $1, reserved_by = $2, reserved_until = $3 WHERE id = $4',
      [sender, null, 0, id]
    )

    reclamado = true
    guardarCooldown(clave, ahora + COOLDOWN_MS)

    await conn.sendMessage(m.chat, {
      text: `❀ ${tag(sender)} reclamó a *${fila.name}*\n✰ Valor » *${Number(fila.value || tirada.value || 0).toLocaleString()}* 🪙\n♡ Estado » *Reclamado*`,
      mentions: [sender]
    }, { quoted: m })
  } catch (error) {
    console.error('Error en claim:', error.message)
    await m.reply(`⚠︎ Se ha producido un problema al reclamar.\n> Usa *${usedPrefix}report* para informarlo.\n\n${error.message}`)
  } finally {
    reclamando.delete(id)
    if (!reclamado) cooldowns.set(clave, 0)
  }
}

handler.help = ['claim']
handler.tags = ['gacha']
handler.command = ['c2', 'claim']

export default handler
