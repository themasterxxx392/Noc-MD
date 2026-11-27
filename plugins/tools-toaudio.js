import { execFile } from 'child_process'
import { promisify } from 'util'
import fs from 'fs'
import os from 'os'
import path from 'path'
import * as baileys from '@whiskeysockets/baileys'

const { proto, downloadContentFromMessage } = baileys.proto ? baileys : baileys.default
const run = promisify(execFile)

const MAX_ENTRADA = 100 * 1024 * 1024
const MAX_REGISTRO = 300
const DIR_STICKERS = path.join(process.cwd(), 'database', 'stickeraudios', 'stickers')
const REGISTRO = (globalThis.__stickersConAudio = globalThis.__stickersConAudio || new Map())
const CAMPOS = (globalThis.__stickersCampos = globalThis.__stickersCampos || new Map())
const AUDIOS_PROPIOS = (globalThis.__audiosStickersPropios = globalThis.__audiosStickersPropios || new Map())
const ocupados = new Set()

//INICIO-PARCHE
function escanearSticker(buf, inicio, fin) {
  const campos = []
  let audio = null
  let i = inicio
  const leer = () => {
    let r = 0
    let s = 0
    let b
    do {
      if (i >= fin) throw new Error('fin')
      b = buf[i++]
      r += (b & 127) * 2 ** s
      s += 7
    } while (b & 128)
    return r
  }

  while (i < fin) {
    const tag = leer()
    const campo = Math.floor(tag / 8)
    const tipo = tag % 8
    if (!campos.includes(campo)) campos.push(campo)
    if (tipo === 0) leer()
    else if (tipo === 1) i += 8
    else if (tipo === 5) i += 4
    else if (tipo === 2) {
      const n = leer()
      if (campo === 26 && !audio) audio = Buffer.from(buf.subarray(i, i + n))
      i += n
    } else break
  }
  return { audio, campos }
}

function claveSha(valor) {
  if (!valor) return null
  if (valor.type === 'Buffer' && Array.isArray(valor.data)) valor = Buffer.from(valor.data)
  if (typeof valor === 'string') valor = Buffer.from(valor, 'base64')
  if (!(valor instanceof Uint8Array) && typeof valor === 'object' && Object.keys(valor).every(k => /^\d+$/.test(k))) valor = Buffer.from(Object.values(valor))
  if (valor instanceof Uint8Array && valor.length) return Buffer.from(valor).toString('hex')
  return null
}

function instalarDecodificador() {
  const Msg = proto.Message
  if (Msg.StickerMessage.decode.__registro) return

  const decodeSticker = Msg.StickerMessage.decode
  Msg.StickerMessage.decode = function (r, l, e) {
    let escaneo = { audio: null, campos: [] }
    try {
      if (r && r.buf && typeof r.pos === 'number') {
        escaneo = escanearSticker(r.buf, r.pos, l === undefined ? r.len : r.pos + l)
      } else if (r instanceof Uint8Array) {
        escaneo = escanearSticker(r, 0, l === undefined ? r.length : l)
      }
    } catch {}

    const resultado = decodeSticker.call(this, r, l, e)

    try {
      const clave = resultado ? claveSha(resultado.fileSha256) : null
      if (clave) {
        CAMPOS.set(clave, escaneo.campos.join(','))
        if (CAMPOS.size > MAX_REGISTRO) CAMPOS.delete(CAMPOS.keys().next().value)
        if (escaneo.audio) {
          REGISTRO.set(clave, escaneo.audio)
          if (REGISTRO.size > MAX_REGISTRO) REGISTRO.delete(REGISTRO.keys().next().value)
        }
      }
    } catch {}

    return resultado
  }
  Msg.StickerMessage.decode.__registro = true
}
//FIN-PARCHE

try {
  instalarDecodificador()
} catch (e) {
  console.error('Error instalando el lector de stickers con sonido:', e.message)
}

//INICIO-CONVERSION
const temporal = (ext) => path.join(os.tmpdir(), `ta_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`)

const limpiar = (...archivos) => {
  for (const f of archivos) fs.promises.unlink(f).catch(() => {})
}

async function aMp3(buffer) {
  const entrada = temporal('bin')
  const salida = temporal('mp3')
  fs.writeFileSync(entrada, buffer)

  try {
    const info = await run('ffmpeg', ['-hide_banner', '-i', entrada]).then(r => r.stderr, e => e.stderr || '')
    if (!/Audio:/.test(info)) throw new Error('No encontré audio en ese archivo.')

    await run('ffmpeg', [
      '-y', '-nostdin', '-hide_banner', '-loglevel', 'error', '-threads', '2', '-i', entrada,
      '-vn', '-map', '0:a:0', '-c:a', 'libmp3lame', '-b:a', '128k', '-ar', '44100', salida
    ], { timeout: 180000 })

    return fs.readFileSync(salida)
  } finally {
    limpiar(entrada, salida)
  }
}

function tipoCitado(q) {
  const msg = q.msg || q
  const senales = [q.mtype, q.mediaType, q.type, msg.mimetype, q.mimetype, Object.keys(q.message || {})[0]]
    .filter(x => typeof x === 'string')
    .join(' ')

  const sticker = /sticker|image\/webp/i.test(senales)
  const video = !sticker && /video|ptv/i.test(senales)
  const desconocido = !senales && typeof q.download === 'function'

  return { sticker, video, senales, valido: sticker || video || desconocido }
}
//FIN-CONVERSION

async function audioDeSticker(q) {
  const msg = q.msg || q
  const sha = claveSha(msg.fileSha256 || q.fileSha256)
  const id = q.id || q.key?.id

  const propio = (id && AUDIOS_PROPIOS.get(`id:${id}`)) || (sha && AUDIOS_PROPIOS.get(sha))
  if (propio) return propio

  if (sha) {
    const archivo = path.join(DIR_STICKERS, `${sha}.ogg`)
    if (fs.existsSync(archivo)) return fs.readFileSync(archivo)
  }

  const bytes = sha ? REGISTRO.get(sha) : null
  console.log(`[sonido] sticker sha=${sha ? sha.slice(0, 8) : 'sin-sha'} id=${id || 'sin-id'} | capturado=${bytes ? 'sí' : 'no'} | campos vistos=${(sha && CAMPOS.get(sha)) || 'ninguno'}`)
  if (!bytes) return null

  const audioMsg = proto.Message.AudioMessage.decode(bytes)
  const flujo = await downloadContentFromMessage(audioMsg, 'audio')
  const partes = []
  for await (const parte of flujo) partes.push(parte)
  return Buffer.concat(partes)
}

let handler = async (m, { conn, usedPrefix, command }) => {
  const q = m.quoted
  const t = q ? tipoCitado(q) : null
  const uso = `❖ Responde a un video o sticker con sonido con *${usedPrefix + command}*.\n\n> ✩ Te devuelvo solo el audio en MP3.`

  if (!q) return conn.reply(m.chat, uso, m)

  if (!t.valido) {
    console.log('[toaudio] tipo no reconocido:', t.senales || 'ninguno', '| propiedades:', Object.keys(q).slice(0, 15).join(','))
    return conn.reply(m.chat, `${uso}\n> Tipo detectado: ${t.senales || 'desconocido'}`, m)
  }

  if (ocupados.has(m.sender)) return
  ocupados.add(m.sender)

  await conn.sendMessage(m.chat, { react: { text: '🕒', key: m.key } })

  try {
    let origen

    if (t.sticker) {
      origen = await audioDeSticker(q)
      if (!origen) {
        await conn.sendMessage(m.chat, { react: { text: '✖️', key: m.key } })
        return conn.reply(m.chat, `⚠️ Ese sticker no tiene sonido, o no pude leerlo.\n\n> ✩ Si es un sticker que ya tenías, reenvíalo al chat y respóndele de nuevo con *${usedPrefix + command}*, así el bot lo recibe completo.`, m)
      }
    } else {
      origen = await q.download()
      if (!origen || !origen.length) throw new Error('No pude descargar el archivo.')
      if (origen.length > MAX_ENTRADA) throw new Error('El archivo pesa demasiado (máx. 100 MB).')
    }

    const mp3 = await aMp3(origen)

    await conn.sendMessage(m.chat, {
      audio: mp3,
      mimetype: 'audio/mpeg',
      fileName: 'audio.mp3'
    }, { quoted: m })

    await conn.sendMessage(m.chat, { react: { text: '✔️', key: m.key } })
  } catch (e) {
    console.error('Error en toaudio:', e.message)
    await conn.sendMessage(m.chat, { react: { text: '✖️', key: m.key } })
    return conn.reply(m.chat, `> ✿︎ Ocurrió un error al extraer el audio.\n> *[Detalle: ${e.message}]*`, m)
  } finally {
    ocupados.delete(m.sender)
  }
}

handler.help = ['toaudio']
handler.tags = ['tools']
handler.command = ['toaudio']

export default handler
