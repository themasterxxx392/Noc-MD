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
const REGISTRO = (globalThis.__stickersConAudio = globalThis.__stickersConAudio || new Map())
const ocupados = new Set()

const MIME_VALIDO = /^(video|audio)\//i
const EXT_VALIDA = /\.(mp4|mkv|webm|mov|avi|3gp|flv|wmv|mpeg|mpg|ts|mp3|m4a|aac|ogg|oga|opus|wav|flac|wma)$/i

//INICIO-PARCHE
function buscarAudio(buf, inicio, fin) {
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
    if (tipo === 0) leer()
    else if (tipo === 1) i += 8
    else if (tipo === 5) i += 4
    else if (tipo === 2) {
      const n = leer()
      if (campo === 26) return buf.subarray(i, i + n)
      i += n
    } else return null
  }
  return null
}

function claveSha(valor) {
  if (!valor) return null
  if (valor.type === 'Buffer' && Array.isArray(valor.data)) valor = Buffer.from(valor.data)
  if (typeof valor === 'string') valor = Buffer.from(valor, 'base64')
  if (valor instanceof Uint8Array) return Buffer.from(valor).toString('hex')
  return null
}

function instalarDecodificador() {
  const Msg = proto.Message
  if (Msg.StickerMessage.decode.__registro) return

  const decodeSticker = Msg.StickerMessage.decode
  Msg.StickerMessage.decode = function (r, l, e) {
    let bytesAudio = null
    try {
      if (r && r.buf && typeof r.pos === 'number') {
        bytesAudio = buscarAudio(r.buf, r.pos, l === undefined ? r.len : r.pos + l)
      } else if (r instanceof Uint8Array) {
        bytesAudio = buscarAudio(r, 0, l === undefined ? r.length : l)
      }
      if (bytesAudio) bytesAudio = Buffer.from(bytesAudio)
    } catch {
      bytesAudio = null
    }

    const resultado = decodeSticker.call(this, r, l, e)

    try {
      const clave = bytesAudio && resultado ? claveSha(resultado.fileSha256) : null
      if (clave) {
        REGISTRO.set(clave, bytesAudio)
        if (REGISTRO.size > MAX_REGISTRO) REGISTRO.delete(REGISTRO.keys().next().value)
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
  const mime = msg.mimetype || ''
  const tipo = q.mediaType || ''
  const nombre = msg.fileName || q.fileName || ''

  const sticker = /sticker/i.test(tipo) || mime === 'image/webp'
  const documento = /document/i.test(tipo)
  const multimedia = /video|audio/i.test(tipo) || MIME_VALIDO.test(mime)
  const documentoValido = documento && (MIME_VALIDO.test(mime) || EXT_VALIDA.test(nombre))

  return { sticker, documento, nombre, valido: sticker || (!documento && multimedia) || documentoValido }
}

const nombreSalida = (nombre) => {
  const base = String(nombre || '').replace(/\.[a-z0-9]{1,5}$/i, '').replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, ' ').trim().slice(0, 80)
  return `${base || 'audio'}.mp3`
}
//FIN-CONVERSION

async function audioDeSticker(q) {
  const clave = claveSha((q.msg || q).fileSha256 || q.fileSha256)
  const bytes = clave ? REGISTRO.get(clave) : null
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

  if (!q) {
    return conn.reply(m.chat, `❖ Responde a un video, documento o sticker con sonido con *${usedPrefix + command}*.\n\n> ✩ Te devuelvo solo el audio en MP3.`, m)
  }

  if (!t.valido) {
    return conn.reply(m.chat, t.documento
      ? '⚠️ Ese documento no es un video ni un audio.'
      : `❖ Responde a un video, documento o sticker con sonido con *${usedPrefix + command}*.`, m)
  }

  if (ocupados.has(m.sender)) return
  ocupados.add(m.sender)

  await conn.sendMessage(m.chat, { react: { text: '🕒', key: m.key } })

  try {
    let origen

    if (t.sticker) {
      origen = await audioDeSticker(q)
      if (!origen) throw new Error('Ese sticker no tiene sonido, o no pude leerlo.')
    } else {
      origen = await q.download()
      if (!origen || !origen.length) throw new Error('No pude descargar el archivo.')
      if (origen.length > MAX_ENTRADA) throw new Error('El archivo pesa demasiado (máx. 100 MB).')
    }

    const mp3 = await aMp3(origen)

    await conn.sendMessage(m.chat, {
      audio: mp3,
      mimetype: 'audio/mpeg',
      fileName: nombreSalida(t.nombre)
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
