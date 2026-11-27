import { execFile } from 'child_process'
import { promisify } from 'util'
import fs from 'fs'
import os from 'os'
import path from 'path'
import crypto from 'crypto'
import webp from 'node-webpmux'
import * as baileys from '@whiskeysockets/baileys'

const { proto, prepareWAMessageMedia, downloadContentFromMessage } = baileys.proto ? baileys : baileys.default
const run = promisify(execFile)

const DIR = path.join(process.cwd(), 'database', 'stickeraudios')
const INDICE = path.join(DIR, 'index.json')
const DIR_STICKERS = path.join(DIR, 'stickers')
const MAX_STICKERS_GUARDADOS = 100
const MAX_SEGUNDOS = 30
const MAX_ENTRADA = 25 * 1024 * 1024
const MAX_WEBP = 950 * 1024
const CALIDADES = [30, 20, 12]
const MAX_REGISTRO = 300

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

function instalarParche() {
  const Msg = proto.Message

  if (!Msg.encode.__sonido) {
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

  if (!Msg.StickerMessage.decode.__registro) {
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

try {
  instalarParche()
} catch (e) {
  console.error('Error instalando el parche de stickers con sonido:', e.message)
}

//INICIO-ALMACEN
const claveUsuario = (jid) => String(jid).split('@')[0].replace(/\D/g, '')
const rutaAudio = (clave) => path.join(DIR, `${clave}.ogg`)

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

const leerDuracion = (info) => {
  const d = String(info).match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/)
  return d ? Number(d[1]) * 3600 + Number(d[2]) * 60 + Number(d[3]) : 0
}

const temporal = (ext) => path.join(os.tmpdir(), `sa_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`)

const limpiar = (...archivos) => {
  for (const f of archivos) fs.promises.unlink(f).catch(() => {})
}

const infoFfmpeg = (archivo) => run('ffmpeg', ['-hide_banner', '-i', archivo]).then(r => r.stderr, e => e.stderr || '')

function tipoImagen(b) {
  if (b[0] === 0xff && b[1] === 0xd8) return 'jpg'
  if (b[0] === 0x89 && b[1] === 0x50) return 'png'
  if (b.toString('ascii', 8, 12) === 'WEBP') return 'webp'
  if (b.subarray(0, 3).toString('ascii') === 'GIF') return 'gif'
  return 'jpg'
}

async function convertirAudio(buffer) {
  const entrada = temporal('bin')
  const salida = temporal('ogg')
  fs.writeFileSync(entrada, buffer)

  try {
    const info = await infoFfmpeg(entrada)
    if (!/Audio:/.test(info)) throw new Error('No encontré audio en ese archivo.')
    const original = leerDuracion(info)

    await run('ffmpeg', [
      '-y', '-nostdin', '-threads', '2', '-i', entrada, '-t', String(MAX_SEGUNDOS), '-vn',
      '-filter_complex', '[0:a]aresample=48000:async=1,loudnorm=I=-16:TP=-1.5:LRA=11[a]',
      '-map', '[a]', '-c:a', 'libopus', '-b:a', '48k', '-vbr', 'on', '-application', 'voip',
      '-ac', '1', '-ar', '48000', salida
    ], { timeout: 60000 })

    const segundos = Math.max(1, Math.min(MAX_SEGUNDOS, Math.ceil(leerDuracion(await infoFfmpeg(salida)))))
    return { ogg: fs.readFileSync(salida), segundos, recortado: original > MAX_SEGUNDOS + 0.5 }
  } finally {
    limpiar(entrada, salida)
  }
}

async function tieneAudio(buffer) {
  const archivo = temporal('bin')
  fs.writeFileSync(archivo, buffer)
  try {
    return /Audio:/.test(await infoFfmpeg(archivo))
  } finally {
    limpiar(archivo)
  }
}

async function codificarWebp(args, salida) {
  let resultado
  for (const calidad of CALIDADES) {
    await run('ffmpeg', [...args, '-q:v', String(calidad), '-compression_level', '6', '-loop', '0', '-an', salida], { timeout: 90000 })
    resultado = fs.readFileSync(salida)
    if (resultado.length <= MAX_WEBP) return resultado
  }
  throw new Error('El sticker pesa demasiado, prueba con algo más corto o simple.')
}

const FILTRO = 'scale=512:512:force_original_aspect_ratio=decrease,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=#00000000,format=rgba'

async function videoASticker(buffer) {
  const entrada = temporal('mp4')
  const salida = temporal('webp')
  fs.writeFileSync(entrada, buffer)
  try {
    return await codificarWebp([
      '-y', '-nostdin', '-threads', '2', '-i', entrada, '-t', String(MAX_SEGUNDOS),
      '-vf', `setpts=PTS-STARTPTS,fps=12,${FILTRO}`, '-vcodec', 'libwebp', '-preset', 'default'
    ], salida)
  } finally {
    limpiar(entrada, salida)
  }
}

async function imagenASticker(buffer, segundos) {
  const entrada = temporal(tipoImagen(buffer))
  const salida = temporal('webp')
  fs.writeFileSync(entrada, buffer)
  try {
    return await codificarWebp([
      '-y', '-nostdin', '-loop', '1', '-t', String(segundos), '-i', entrada,
      '-vf', `fps=12,${FILTRO}`, '-vcodec', 'libwebp'
    ], salida)
  } finally {
    limpiar(entrada, salida)
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

function recordarSticker(sha, messageId, ogg) {
  const clave = claveSha(sha)
  AUDIOS_PROPIOS.set(`id:${messageId}`, ogg)

  if (clave) {
    AUDIOS_PROPIOS.set(clave, ogg)
    try {
      fs.mkdirSync(DIR_STICKERS, { recursive: true })
      fs.writeFileSync(path.join(DIR_STICKERS, `${clave}.ogg`), ogg)
      const archivos = fs.readdirSync(DIR_STICKERS)
        .map(f => ({ f, t: fs.statSync(path.join(DIR_STICKERS, f)).mtimeMs }))
        .sort((a, b) => b.t - a.t)
      for (const { f } of archivos.slice(MAX_STICKERS_GUARDADOS)) fs.unlinkSync(path.join(DIR_STICKERS, f))
    } catch {}
  }

  while (AUDIOS_PROPIOS.size > MAX_REGISTRO * 2) AUDIOS_PROPIOS.delete(AUDIOS_PROPIOS.keys().next().value)
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
  recordarSticker(stickerMedia.stickerMessage.fileSha256, messageId, oggBuffer)
}

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

function tipoCitado(q) {
  const mime = (q.msg || q).mimetype || ''
  const tipo = q.mediaType || ''
  const sticker = /sticker/i.test(tipo) || mime === 'image/webp'
  return {
    sticker,
    audio: /audio/i.test(mime) || /audio/i.test(tipo),
    video: /video/i.test(mime) || /video/i.test(tipo),
    imagen: !sticker && (/image/i.test(mime) || /image/i.test(tipo))
  }
}

async function descargar(q) {
  const buffer = await q.download()
  if (!buffer || !buffer.length) throw new Error('No pude descargar el archivo.')
  if (buffer.length > MAX_ENTRADA) throw new Error('El archivo pesa demasiado (máx. 25 MB).')
  return buffer
}

async function guardarAudio(m, conn, usedPrefix) {
  const q = m.quoted
  const t = q ? tipoCitado(q) : {}

  if (!q || !(t.audio || t.video || t.sticker)) {
    return conn.reply(m.chat, `❖ Responde con *${usedPrefix}saveaudio* a un audio, nota de voz, video o sticker con sonido.\n\n> ✩ Después úsalo con *${usedPrefix}saudio* respondiendo a una imagen o sticker.`, m)
  }

  await conn.sendMessage(m.chat, { react: { text: '🕒', key: m.key } })

  try {
    let origen
    if (t.sticker) {
      origen = await audioDeSticker(q)
      if (!origen) {
        await conn.sendMessage(m.chat, { react: { text: '✖️', key: m.key } })
        return conn.reply(m.chat, `⚠️ Ese sticker no tiene sonido, o no pude leerlo.\n\n> ✩ Si es un sticker que ya tenías, reenvíalo al chat y respóndele de nuevo con *${usedPrefix}saveaudio*, así el bot lo recibe completo.`, m)
      }
    } else {
      origen = await descargar(q)
    }

    const { ogg, segundos, recortado } = await convertirAudio(origen)

    const clave = claveUsuario(m.sender)
    const indice = leerIndice()
    const reemplazo = !!indice[clave]

    fs.mkdirSync(DIR, { recursive: true })
    fs.writeFileSync(rutaAudio(clave), ogg)
    indice[clave] = { segundos, fecha: Date.now() }
    guardarIndice(indice)

    await conn.sendMessage(m.chat, { react: { text: '✔️', key: m.key } })
    return conn.reply(m.chat, `❖ Tu audio quedó guardado (${segundos}s).${reemplazo ? '\n> ✩ Reemplazó tu audio anterior.' : ''}${recortado ? `\n> ✩ Se guardaron solo los primeros ${MAX_SEGUNDOS} segundos.` : ''}\n\n> ➩ Úsalo con *${usedPrefix}saudio* respondiendo a una imagen o sticker.`, m)
  } catch (e) {
    console.error('Error en saveaudio:', e.message)
    await conn.sendMessage(m.chat, { react: { text: '✖️', key: m.key } })
    return conn.reply(m.chat, `> ✿︎ Ocurrió un error al guardar el audio.\n> *[Detalle: ${e.message}]*`, m)
  }
}

async function crearSticker(m, conn, usedPrefix) {
  const q = m.quoted
  const t = q ? tipoCitado(q) : {}

  if (!q || !(t.video || t.imagen || t.sticker)) {
    return conn.reply(m.chat, `❖ Responde con *${usedPrefix}saudio* a un video, imagen o sticker.\n\n> ✩ Video: lo convierte en sticker con su sonido.\n> ✩ Imagen o sticker: le pone tu audio guardado (*${usedPrefix}saveaudio*).`, m)
  }

  const clave = claveUsuario(m.sender)
  const guardado = leerIndice()[clave]
  const tieneGuardado = !!guardado && fs.existsSync(rutaAudio(clave))

  if (!t.video && !tieneGuardado) {
    return conn.reply(m.chat, `⚠️ No tienes un audio guardado.\n\n> ✩ Responde a un audio, nota de voz, video o sticker con sonido usando *${usedPrefix}saveaudio*.`, m)
  }

  await conn.sendMessage(m.chat, { react: { text: '🕒', key: m.key } })

  try {
    const original = await descargar(q)
    const paquete = global.info?.packname || 'Sticker'
    const autor = global.info?.author || ''

    let sticker
    let ogg
    let segundos

    if (t.video) {
      if (await tieneAudio(original)) {
        const audio = await convertirAudio(original)
        ogg = audio.ogg
        segundos = audio.segundos
      } else if (tieneGuardado) {
        ogg = fs.readFileSync(rutaAudio(clave))
        segundos = guardado.segundos
      } else {
        throw new Error(`El video no tiene audio. Guarda uno con ${usedPrefix}saveaudio y vuelve a intentar.`)
      }

      sticker = await agregarExif(await videoASticker(original), paquete, autor)
    } else {
      ogg = fs.readFileSync(rutaAudio(clave))
      segundos = guardado.segundos

      if (t.sticker && original.includes(Buffer.from('ANIM'))) {
        sticker = original
      } else {
        sticker = await agregarExif(await imagenASticker(original, segundos), paquete, autor)
      }
    }

    await enviarStickerConAudio(conn, m.chat, sticker, ogg, segundos)
    await conn.sendMessage(m.chat, { react: { text: '✔️', key: m.key } })
  } catch (e) {
    console.error('Error en saudio:', e.message)
    await conn.sendMessage(m.chat, { react: { text: '✖️', key: m.key } })
    return conn.reply(m.chat, `> ✿︎ Ocurrió un error al crear el sticker con audio.\n> *[Detalle: ${e.message}]*`, m)
  }
}

async function borrarAudio(m, conn) {
  const clave = claveUsuario(m.sender)
  const indice = leerIndice()

  if (!indice[clave]) {
    return conn.reply(m.chat, '⚠️ No tienes ningún audio guardado.', m)
  }

  fs.promises.unlink(rutaAudio(clave)).catch(() => {})
  delete indice[clave]
  guardarIndice(indice)
  return conn.reply(m.chat, '❖ Tu audio guardado fue eliminado.', m)
}

let handler = async (m, { conn, usedPrefix, command }) => {
  const cmd = command.toLowerCase()

  if (cmd === 'delaudio') return borrarAudio(m, conn)

  if (ocupados.has(m.sender)) return
  ocupados.add(m.sender)

  try {
    if (cmd === 'saveaudio') return await guardarAudio(m, conn, usedPrefix)
    return await crearSticker(m, conn, usedPrefix)
  } finally {
    ocupados.delete(m.sender)
  }
}

handler.help = ['stickeraudio', 'saudio', 'saveaudio', 'delaudio']
handler.tags = ['tools']
handler.command = ['stickeraudio', 'saudio', 'saveaudio', 'delaudio']

export default handler
  
