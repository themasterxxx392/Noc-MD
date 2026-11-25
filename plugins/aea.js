import { execFile } from 'child_process'
import { promisify } from 'util'
import fs from 'fs'
import os from 'os'
import path from 'path'
import crypto from 'crypto'
import webp from 'node-webpmux'
import * as baileys from '@whiskeysockets/baileys'

const { proto, prepareWAMessageMedia } = baileys.proto ? baileys : baileys.default
const run = promisify(execFile)

const MAX_SEGUNDOS = 25
const MAX_WEBP = 950 * 1024
const CALIDADES = [30, 20, 12]

//INICIO-PARCHE
function instalarParche() {
  const Msg = proto.Message
  if (Msg.encode.__sonido) return

  const encodeSticker = Msg.StickerMessage.encode
  Msg.StickerMessage.encode = function (m, w) {
    const writer = encodeSticker.call(this, m, w)
    if (m && m.__audio) writer.uint32(210).bytes(Msg.AudioMessage.encode(m.__audio).finish())
    return writer
  }

  const encodeMensaje = Msg.encode
  Msg.encode = function (m, w) {
    const writer = encodeMensaje.call(this, m, w)
    if (m && m.__sonido) writer.uint32(1074).bytes(m.__sonido)
    return writer
  }
  Msg.encode.__sonido = true
}

function construirMensaje(stickerMsg, audioMsg) {
  const Msg = proto.Message
  const sticker = Msg.StickerMessage.create(stickerMsg)
  sticker.__audio = audioMsg

  const interno = Msg.create({ stickerMessage: sticker })
  const futuro = Msg.FutureProofMessage.encode(Msg.FutureProofMessage.create({ message: interno })).finish()

  const contenido = Msg.create({ stickerMessage: sticker })
  contenido.__sonido = futuro
  return contenido
}
//FIN-PARCHE

async function agregarExif(webpBuffer, packname, author) {
  const img = new webp.Image()
  await img.load(webpBuffer)

  const json = {
    'sticker-pack-id': crypto.randomBytes(32).toString('hex'),
    'sticker-pack-name': packname,
    'sticker-pack-publisher': author,
    'emojis': ['']
  }

  const jsonBuf = Buffer.from(JSON.stringify(json), 'utf8')
  const cabecera = Buffer.from([
    0x49, 0x49, 0x2A, 0x00, 0x08, 0x00, 0x00, 0x00, 0x01, 0x00, 0x41, 0x57,
    0x07, 0x00, 0x00, 0x00, 0x00, 0x00, 0x16, 0x00, 0x00, 0x00
  ])
  cabecera.writeUInt32LE(jsonBuf.length, 14)

  img.exif = Buffer.concat([cabecera, jsonBuf])
  return await img.save(null)
}

async function convertir(buffer) {
  const id = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  const entrada = path.join(os.tmpdir(), `sa_${id}.mp4`)
  const salidaWebp = path.join(os.tmpdir(), `sa_${id}.webp`)
  const salidaOgg = path.join(os.tmpdir(), `sa_${id}.ogg`)

  fs.writeFileSync(entrada, buffer)

  try {
    const info = await run('ffmpeg', ['-hide_banner', '-i', entrada]).then(r => r.stderr, e => e.stderr || '')

    if (!/Video:/.test(info)) throw new Error('El archivo no tiene video.')
    if (!/Audio:/.test(info)) throw new Error('El video no tiene audio.')

    const dur = info.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/)
    const total = dur ? Number(dur[1]) * 3600 + Number(dur[2]) * 60 + Number(dur[3]) : MAX_SEGUNDOS
    const segundos = Math.max(1, Math.min(MAX_SEGUNDOS, Math.ceil(total)))

    const filtroVideo = 'setpts=PTS-STARTPTS,fps=12,scale=512:512:force_original_aspect_ratio=decrease,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=#00000000,format=rgba'

    let webpBuffer
    for (const calidad of CALIDADES) {
      await run('ffmpeg', [
        '-y', '-nostdin', '-threads', '2', '-i', entrada, '-t', String(MAX_SEGUNDOS),
        '-vf', filtroVideo, '-vcodec', 'libwebp', '-preset', 'default',
        '-q:v', String(calidad), '-compression_level', '6', '-loop', '0', '-an', salidaWebp
      ], { timeout: 90000 })
      webpBuffer = fs.readFileSync(salidaWebp)
      if (webpBuffer.length <= MAX_WEBP) break
    }

    if (webpBuffer.length > MAX_WEBP) throw new Error('El sticker pesa demasiado, prueba con un video más corto o simple.')

    await run('ffmpeg', [
      '-y', '-nostdin', '-threads', '2', '-i', entrada, '-t', String(MAX_SEGUNDOS), '-vn',
      '-filter_complex', '[0:a]aresample=48000:async=1,loudnorm=I=-16:TP=-1.5:LRA=11[a]',
      '-map', '[a]', '-c:a', 'libopus', '-b:a', '48k', '-vbr', 'on', '-application', 'voip',
      '-ac', '1', '-ar', '48000', salidaOgg
    ], { timeout: 90000 })

    return { webp: webpBuffer, ogg: fs.readFileSync(salidaOgg), segundos }
  } finally {
    for (const f of [entrada, salidaWebp, salidaOgg]) fs.promises.unlink(f).catch(() => {})
  }
}

let handler = async (m, { conn, usedPrefix, command }) => {
  const q = m.quoted ? m.quoted : m
  const mime = (q.msg || q).mimetype || q.mediaType || ''

  if (!/video|gif/i.test(mime)) {
    return conn.reply(m.chat, `❖ Responde a un video con *${usedPrefix + command}*.\n\n> ✩ Se usan los primeros ${MAX_SEGUNDOS} segundos, con su audio.`, m)
  }

  await conn.sendMessage(m.chat, { react: { text: '🕒', key: m.key } })

  try {
    const original = await q.download()
    if (!original || !original.length) throw new Error('No pude descargar el video.')

    const { webp: sticker, ogg, segundos } = await convertir(original)
    const conExif = await agregarExif(sticker, global.info?.packname || 'Sticker', global.info?.author || '')

    const stickerMedia = await prepareWAMessageMedia({ sticker: conExif }, { upload: conn.waUploadToServer })
    const audioMedia = await prepareWAMessageMedia({
      audio: ogg,
      mimetype: 'audio/ogg; codecs=opus',
      ptt: true,
      seconds: segundos
    }, { upload: conn.waUploadToServer })

    if (!stickerMedia?.stickerMessage || !audioMedia?.audioMessage) {
      throw new Error('No se pudieron subir los archivos a WhatsApp.')
    }

    instalarParche()

    const contenido = construirMensaje(
      { ...stickerMedia.stickerMessage, isAnimated: true, stickerSentTs: Date.now() },
      { ...audioMedia.audioMessage, seconds: segundos }
    )

    const messageId = '3EB0' + crypto.randomBytes(9).toString('hex').toUpperCase()
    await conn.relayMessage(m.chat, contenido, { messageId })

    await conn.sendMessage(m.chat, { react: { text: '✔️', key: m.key } })
  } catch (e) {
    console.error('Error en stickeraudio:', e.message)
    await conn.sendMessage(m.chat, { react: { text: '✖️', key: m.key } })
    return conn.reply(m.chat, `> ✿︎ Ocurrió un error al crear el sticker con audio.\n> *[Detalle: ${e.message}]*`, m)
  }
}

handler.help = ['sa', 'stickeraudio']
handler.tags = ['sticker']
handler.command = ['sa', 'stickeraudio', 'soundsticker']

export default handler
