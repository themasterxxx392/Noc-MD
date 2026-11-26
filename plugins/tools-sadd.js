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

const DIR = path.join(process.cwd(), 'database', 'stickeraudios')
const INDICE = path.join(DIR, 'index.json')
const MAX_SEGUNDOS = 30
const MAX_ENTRADA = 10 * 1024 * 1024
const NOMBRE_VALIDO = /^[a-z0-9_-]{1,20}$/

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

//INICIO-ALMACEN
function leerIndice() {
  try {
    return JSON.parse(fs.readFileSync(INDICE, 'utf8'))
  } catch {
    return {}
  }
}

function guardarIndice(indice) {
  fs.mkdirSync(DIR, { recursive: true })
  fs.writeFileSync(INDICE, JSON.stringify(indice, null, 2))
}

const rutaAudio = (nombre) => path.join(DIR, `${nombre}.ogg`)

const leerDuracion = (info) => {
  const d = String(info).match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/)
  return d ? Number(d[1]) * 3600 + Number(d[2]) * 60 + Number(d[3]) : 0
}

const temporal = (ext) => path.join(os.tmpdir(), `sn_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`)

async function convertirAudio(buffer) {
  const entrada = temporal('bin')
  const salida = temporal('ogg')
  fs.writeFileSync(entrada, buffer)

  try {
    const info = await run('ffmpeg', ['-hide_banner', '-i', entrada]).then(r => r.stderr, e => e.stderr || '')
    if (!/Audio:/.test(info)) throw new Error('El archivo no tiene audio.')
    const original = leerDuracion(info)

    await run('ffmpeg', [
      '-y', '-nostdin', '-threads', '2', '-i', entrada, '-t', String(MAX_SEGUNDOS), '-vn',
      '-filter_complex', '[0:a]aresample=48000:async=1,loudnorm=I=-16:TP=-1.5:LRA=11[a]',
      '-map', '[a]', '-c:a', 'libopus', '-b:a', '48k', '-vbr', 'on', '-application', 'voip',
      '-ac', '1', '-ar', '48000', salida
    ], { timeout: 60000 })

    const info2 = await run('ffmpeg', ['-hide_banner', '-i', salida]).then(r => r.stderr, e => e.stderr || '')
    const segundos = Math.max(1, Math.min(MAX_SEGUNDOS, Math.ceil(leerDuracion(info2))))

    return { ogg: fs.readFileSync(salida), segundos, recortado: original > MAX_SEGUNDOS }
  } finally {
    for (const f of [entrada, salida]) fs.promises.unlink(f).catch(() => {})
  }
}

async function animarSticker(buffer) {
  const entrada = temporal('webp')
  const salida = temporal('webp')
  fs.writeFileSync(entrada, buffer)

  try {
    await run('ffmpeg', [
      '-y', '-nostdin', '-loop', '1', '-t', '2', '-i', entrada,
      '-vf', 'fps=12,scale=512:512:force_original_aspect_ratio=decrease,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=#00000000,format=rgba',
      '-vcodec', 'libwebp', '-q:v', '40', '-compression_level', '6', '-loop', '0', '-an', salida
    ], { timeout: 60000 })
    return fs.readFileSync(salida)
  } finally {
    for (const f of [entrada, salida]) fs.promises.unlink(f).catch(() => {})
  }
}
//FIN-ALMACEN

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

async function enviarStickerConAudio(conn, chat, stickerBuffer, oggBuffer, segundos) {
  const stickerMedia = await prepareWAMessageMedia({ sticker: stickerBuffer }, { upload: conn.waUploadToServer })
  const audioMedia = await prepareWAMessageMedia({
    audio: oggBuffer,
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
  await conn.relayMessage(chat, contenido, { messageId })
}

let handler = async (m, { conn, args, usedPrefix, command, isOwner }) => {
  const cmd = command.toLowerCase()
  const nombre = (args[0] || '').toLowerCase()
  const indice = leerIndice()
  const q = m.quoted
  const mime = (q?.msg || q)?.mimetype || ''

  if (cmd === 'slist' || cmd === 'saudios') {
    const nombres = Object.keys(indice)
    if (!nombres.length) {
      return conn.reply(m.chat, `No hay audios guardados.`, m)
    }
    const lista = nombres.map(n => `> ❒ *${n}* (${indice[n].segundos}s)`).join('\n')
    return conn.reply(m.chat, `✿︎ *AUDIOS PARA STICKERS*\n\n${lista}\n\n> ✩ Úsalos respondiendo a un sticker con *${usedPrefix}sset <nombre>*.`, m)
  }

  if (cmd === 'sadd') {
    if (!isOwner) return m.reply('⚠️ Solo el owner puede guardar audios.')

    if (!NOMBRE_VALIDO.test(nombre)) {
      return conn.reply(m.chat, `❖ Responde a un audio o nota de voz con *${usedPrefix}sadd <nombre>*.\n\n> ✩ El nombre usa letras, números, _ o -, hasta 20 caracteres.`, m)
    }
    if (!q || !/audio/i.test(mime)) {
      return conn.reply(m.chat, `❖ Responde a un audio o nota de voz con *${usedPrefix}sadd ${nombre}*.`, m)
    }
    if (indice[nombre]) {
      return conn.reply(m.chat, `⚠️ Ya existe un audio llamado *${nombre}*. Bórralo antes con *${usedPrefix}sdel ${nombre}*.`, m)
    }

    await conn.sendMessage(m.chat, { react: { text: '🕒', key: m.key } })

    try {
      const original = await q.download()
      if (!original || !original.length) throw new Error('No pude descargar el audio.')
      if (original.length > MAX_ENTRADA) throw new Error('El audio pesa demasiado (máx. 10 MB).')

      const { ogg, segundos, recortado } = await convertirAudio(original)

      fs.mkdirSync(DIR, { recursive: true })
      fs.writeFileSync(rutaAudio(nombre), ogg)
      indice[nombre] = { segundos, autor: m.sender, fecha: Date.now() }
      guardarIndice(indice)

      await conn.sendMessage(m.chat, { react: { text: '✔️', key: m.key } })
      return conn.reply(m.chat, `✿︎ Audio *${nombre}* guardado (${segundos}s).${recortado ? `\n> ✩ Se guardaron solo los primeros ${MAX_SEGUNDOS} segundos.` : ''}\n\n> ➩ Úsalo respondiendo a un sticker con *${usedPrefix}sset ${nombre}*.`, m)
    } catch (e) {
      console.error('Error en sadd:', e.message)
      await conn.sendMessage(m.chat, { react: { text: '✖️', key: m.key } })
      return conn.reply(m.chat, `> ✿︎ Ocurrió un error al guardar el audio.\n> *[Detalle: ${e.message}]*`, m)
    }
  }

  if (cmd === 'sdel') {
    if (!isOwner) return m.reply('⚠️ Solo el owner puede borrar audios.')
    if (!indice[nombre]) return conn.reply(m.chat, `⚠️ No existe ningún audio llamado *${nombre || '...'}*.`, m)

    fs.promises.unlink(rutaAudio(nombre)).catch(() => {})
    delete indice[nombre]
    guardarIndice(indice)
    return conn.reply(m.chat, `✿︎ Audio *${nombre}* eliminado.`, m)
  }

  if (cmd === 'sset') {
    const esSticker = q && (q.mediaType === 'stickerMessage' || /webp/i.test(mime))
    if (!nombre || !esSticker) {
      return conn.reply(m.chat, `Responde a un sticker con *${usedPrefix}sset <nombre>*.\n\n> ✩ Mira los audios disponibles con *${usedPrefix}slist*.`, m)
    }
    if (!indice[nombre] || !fs.existsSync(rutaAudio(nombre))) {
      return conn.reply(m.chat, `⚠️ No existe ningún audio llamado *${nombre}*. Mira la lista con *${usedPrefix}slist*.`, m)
    }

    await conn.sendMessage(m.chat, { react: { text: '🕒', key: m.key } })

    try {
      let sticker = await q.download()
      if (!sticker || !sticker.length) throw new Error('No pude descargar el sticker.')

      if (!sticker.includes(Buffer.from('ANIM'))) {
        sticker = await agregarExif(await animarSticker(sticker), global.info?.packname || 'Sticker', global.info?.author || '')
      }

      await enviarStickerConAudio(conn, m.chat, sticker, fs.readFileSync(rutaAudio(nombre)), indice[nombre].segundos)
      await conn.sendMessage(m.chat, { react: { text: '✔️', key: m.key } })
    } catch (e) {
      console.error('Error en sset:', e.message)
      await conn.sendMessage(m.chat, { react: { text: '✖️', key: m.key } })
      return conn.reply(m.chat, `> ✿︎ Ocurrió un error al crear el sticker con audio.\n> *[Detalle: ${e.message}]*`, m)
    }
  }
}

handler.help = ['sadd', 'sset', 'sdel', 'saudios']
handler.tags = ['tools']
handler.command = ['sadd', 'sset', 'sdel', 'saudios']

export default handler
