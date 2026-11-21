import { db } from '../lib/database.js'

const reclamando = new Set()

const tag = (jid) => `@${String(jid).split('@')[0]}`

const handler = async (m, { conn, usedPrefix }) => {
  const tirada = globalThis.__gachaRolls?.get(m.chat)

  if (!tirada) {
    return m.reply(`ꕥ No hay ningún personaje para reclamar en este chat.\n> Usa *${usedPrefix}rw* para tirar.`)
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
