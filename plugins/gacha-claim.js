import { db } from '../lib/database.js'

const reclamando = new Set()

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

  const id = tirada.characterId
  if (reclamando.has(id)) return
  reclamando.add(id)

  try {
    const ahora = Date.now()
    const sender = m.sender

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

    await conn.sendMessage(m.chat, {
      text: `❀ ${tag(sender)} reclamó a *${fila.name}*\n✰ Valor » *${Number(fila.value || tirada.value || 0).toLocaleString()}* 🪙\n♡ Estado » *Reclamado*`,
      mentions: [sender]
    }, { quoted: m })
  } catch (error) {
    console.error('Error en claim:', error.message)
    await m.reply(`⚠︎ Se ha producido un problema al reclamar.\n> Usa *${usedPrefix}report* para informarlo.\n\n${error.message}`)
  } finally {
    reclamando.delete(id)
  }
}

handler.help = ['claim']
handler.tags = ['gacha']
handler.command = ['c', 'claim']

export default handler
