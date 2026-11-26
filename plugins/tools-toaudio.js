import { execFile } from 'child_process'
import { promisify } from 'util'
import fs from 'fs'
import os from 'os'
import path from 'path'
import * as baileys from '@whiskeysockets/baileys'

const { proto, downloadContentFromMessage } = baileys.proto ? baileys : baileys.default
const run = promisify(execFile)

const MAX_ENTRADA = 25 * 1024 * 1024
const REGISTRO = (globalThis.__stickersConAudio = globalThis.__stickersConAudio || new Map())
const ocupados = new Set()

function claveSha(valor) {
  if (!valor) return null
  if (valor.type === 'Buffer' && Array.isArray(valor.data)) valor = Buffer.from(valor.data)
  if (typeof valor === 'string') valor = Buffer.from(valor, 'base64')
  if (valor instanceof Uint8Array) return Buffer.from(valor).toString('hex')
  return null
}

const temporal = (ext) =>
  path.join(os.tmpdir(), `toaudio_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`)

const limpiar = (...archivos) => {
  for (const f of archivos) fs.promises.unlink(f).catch(() => {})
}

const infoFfmpeg = (archivo) =>
  run('ffmpeg', ['-hide_banner', '-i', archivo]).then(
    (r) => r.stderr,
    (e) => e.stderr || ''
  )

async function extraerAudioOgg(buffer) {
  const entrada = temporal('bin')
  const salida = temporal('ogg')
  fs.writeFileSync(entrada, buffer)

  try {
    const info = await infoFfmpeg(entrada)
    if (!/Audio:/.test(info)) {
      throw new Error('Ese archivo no contiene una pista de audio.')
    }

    await run(
      'ffmpeg',
      [
        '-y',
        '-nostdin',
        '-threads',
        '2',
        '-i',
        entrada,
        '-vn',
        '-c:a',
        'libopus',
        '-b:a',
        '64k',
        '-vbr',
        'on',
        '-ac',
        '1',
        '-ar',
        '48000',
        salida
      ],
      { timeout: 60000 }
    )

    return fs.readFileSync(salida)
  } finally {
    limpiar(entrada, salida)
  }
}

async function obtenerAudioDeSticker(q) {
  const objetivo = q.msg || q
  const clave = claveSha(objetivo.fileSha256 || q.fileSha256)
  const bytes = clave ? REGISTRO.get(clave) : null

  if (!bytes) return null

  const audioMsg = proto.Message.AudioMessage.decode(bytes)
  const flujo = await downloadContentFromMessage(audioMsg, 'audio')
  const partes = []
  for await (const parte of flujo) partes.push(parte)
  return Buffer.concat(partes)
}

function analizarCitado(q) {
  const msg = q.msg || q
  const mime = msg.mimetype || ''
  const tipo = q.mediaType || ''

  const sticker = /sticker/i.test(tipo) || mime === 'image/webp'
  const video = !sticker && (/video/i.test(tipo) || /^video\//i.test(mime))
  const documento =
    !sticker &&
    !video &&
    (/document/i.test(tipo) || Boolean(msg.fileName) || Boolean(mime && !/^image\/|^audio\//i.test(mime)))

  return { sticker, video, documento }
}

async function descargarCitado(q) {
  const buffer = await q.download()
  if (!buffer || !buffer.length) throw new Error('No pude descargar el archivo citado.')
  if (buffer.length > MAX_ENTRADA) throw new Error('El archivo pesa demasiado (máx. 25 MB).')
  return buffer
}

let handler = async (m, { conn, usedPrefix, command }) => {
  const q = m.quoted
  const t = q ? analizarCitado(q) : {}

  if (!q || !(t.video || t.documento || t.sticker)) {
    return conn.reply(
      m.chat,
      `❖ Responde con *${usedPrefix + command}* a un video, documento o sticker con sonido y te devolveré solo el audio.`,
      m
    )
  }

  if (ocupados.has(m.sender)) return
  ocupados.add(m.sender)

  await conn.sendMessage(m.chat, { react: { text: '🕒', key: m.key } })

  try {
    let origenAudio

    if (t.sticker) {
      origenAudio = await obtenerAudioDeSticker(q)
      if (!origenAudio || !origenAudio.length) {
        throw new Error('Ese sticker no tiene sonido o no estaba registrado en memoria.')
      }
    } else {
      origenAudio = await descargarCitado(q)
    }

    const oggBuffer = await extraerAudioOgg(origenAudio)

    await conn.sendMessage(
      m.chat,
      {
        audio: oggBuffer,
        mimetype: 'audio/ogg; codecs=opus',
        ptt: false
      },
      { quoted: m }
    )

    await conn.sendMessage(m.chat, { react: { text: '✔️', key: m.key } })
  } catch (e) {
    console.error('Error en toaudio:', e.message)
    await conn.sendMessage(m.chat, { react: { text: '✖️', key: m.key } })
    return conn.reply(m.chat, `> ✿︎ No pude extraer el audio.\n> *[Detalle: ${e.message}]*`, m)
  } finally {
    ocupados.delete(m.sender)
  }
}

handler.help = ['toaudio']
handler.tags = ['tools',]
handler.command = ['toaudio']

export default handler
