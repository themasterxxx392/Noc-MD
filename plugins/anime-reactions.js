import axios from 'axios'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { execFile } from 'child_process'
import { promisify } from 'util'

const run = promisify(execFile)

const REACCIONES = {
  peek: ['{a} espía a {b}', '{a} está espiando'],
  comfort: ['{a} consuela a {b}', '{a} necesita consuelo'],
  thinkhard: ['{a} piensa intensamente en {b}', '{a} está pensando intensamente'],
  curious: ['{a} siente curiosidad por {b}', '{a} siente curiosidad'],
  sniff: ['{a} olfatea a {b}', '{a} olfatea el ambiente'],
  stare: ['{a} mira fijamente a {b}', '{a} mira fijamente a todos'],
  trip: ['{a} tropezó con {b}', '{a} tropezó'],
  snuggle: ['{a} se acurruca con {b}', '{a} se acurruca'],
  angry: ['{a} está enojado con {b}', '{a} está enojado'],
  bleh: ['{a} le saca la lengua a {b}', '{a} saca la lengua'],
  bored: ['{a} está aburrido de {b}', '{a} está aburrido'],
  clap: ['{a} aplaude a {b}', '{a} aplaude'],
  coffee: ['{a} toma café con {b}', '{a} toma café'],
  dramatic: ['{a} actúa con dramatismo ante {b}', '{a} actúa con dramatismo'],
  drunk: ['{a} está borracho con {b}', '{a} está borracho'],
  cold: ['{a} siente frío junto a {b}', '{a} siente frío'],
  impregnate: ['{a} dejó embarazada a {b}', '{a} no tiene a quién dejar embarazada'],
  kisscheek: ['{a} le da un beso en la mejilla a {b}', '{a} da un beso en la mejilla a todos'],
  tickle: ['{a} le hace cosquillas a {b}', '{a} se hace cosquillas'],
  scream: ['{a} le grita a {b}', '{a} grita'],
  push: ['{a} empuja a {b}', '{a} se empuja a sí mismo'],
  jump: ['{a} salta con {b}', '{a} salta'],
  draw: ['{a} dibuja a {b}', '{a} dibuja'],
  laugh: ['{a} se ríe de {b}', '{a} se ríe'],
  love: ['{a} siente amor por {b}', '{a} siente amor'],
  pout: ['{a} hace pucheros frente a {b}', '{a} hace pucheros'],
  punch: ['{a} le da un puñetazo a {b}', '{a} da un puñetazo al aire'],
  run: ['{a} corre con {b}', '{a} corre'],
  sad: ['{a} está triste por {b}', '{a} está triste'],
  scared: ['{a} está asustado de {b}', '{a} está asustado'],
  seduce: ['{a} intenta seducir a {b}', '{a} intenta seducir a todos'],
  shy: ['{a} se pone tímido ante {b}', '{a} se siente tímido'],
  sleep: ['{a} duerme con {b}', '{a} duerme'],
  smoke: ['{a} fuma con {b}', '{a} fuma'],
  spit: ['{a} le escupe a {b}', '{a} escupe'],
  step: ['{a} pisa a {b}', '{a} pisa con fuerza'],
  think: ['{a} piensa en {b}', '{a} está pensando'],
  walk: ['{a} camina con {b}', '{a} camina'],
  hug: ['{a} abraza a {b}', '{a} abraza a todos'],
  kill: ['{a} mató a {b}', '{a} no tiene a quién matar'],
  eat: ['{a} come con {b}', '{a} come'],
  kiss: ['{a} besa a {b}', '{a} besa a todos'],
  wink: ['{a} le guiña el ojo a {b}', '{a} guiña el ojo'],
  pat: ['{a} acaricia la cabeza de {b}', '{a} se acaricia la cabeza'],
  happy: ['{a} está feliz con {b}', '{a} está feliz'],
  bully: ['{a} molesta a {b}', '{a} molesta a todos'],
  bite: ['{a} muerde a {b}', '{a} se muerde'],
  blush: ['{a} se sonroja por {b}', '{a} se sonroja'],
  wave: ['{a} saluda a {b}', '{a} saluda a todos'],
  bath: ['{a} le da un baño a {b}', '{a} se da un baño'],
  smile: ['{a} le sonríe a {b}', '{a} sonríe'],
  handhold: ['{a} toma de la mano a {b}', '{a} no tiene con quién tomarse de las manos'],
  cringe: ['{a} siente vergüenza ajena por {b}', '{a} siente vergüenza ajena'],
  bonk: ['{a} le da un golpe en la cabeza a {b}', '{a} se golpea la cabeza'],
  cry: ['{a} llora por {b}', '{a} llora'],
  lick: ['{a} lame a {b}', '{a} lame el aire'],
  slap: ['{a} le da una bofetada a {b}', '{a} da una bofetada al aire'],
  dance: ['{a} baila con {b}', '{a} baila'],
  cuddle: ['{a} mima a {b}', '{a} quiere mimos'],
  lewd: ['{a} tiene una actitud lasciva con {b}', '{a} tiene una actitud lasciva'],
  kisshead: ['{a} besa en la cabeza a {b}', '{a} besa en la cabeza a todos'],
  kicked: ['{a} fue pateado por {b}', '{a} fue pateado'],
  tease: ['{a} molesta juguetonamente a {b}', '{a} molesta juguetonamente'],
  jealous: ['{a} está celoso de {b}', '{a} está celoso'],
  spin: ['{a} da una vuelta de emoción con {b}', '{a} da una vuelta de emoción']
}

const ALIAS = {}

const detectar = (b) => {
  if (!b || b.length < 12) return null
  if (b.subarray(0, 3).toString() === 'GIF') return 'gif'
  if (b.subarray(4, 8).toString() === 'ftyp') return 'mp4'
  if (b.subarray(0, 4).toString() === 'RIFF' && b.subarray(8, 12).toString() === 'WEBP') return 'webp'
  if (b[0] === 0x89 && b.subarray(1, 4).toString() === 'PNG') return 'png'
  if (b[0] === 0xff && b[1] === 0xd8) return 'jpg'
  if (b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) return 'webm'
  return null
}

const recorrer = (obj, salida = []) => {
  if (typeof obj === 'string') {
    if (/^https?:\/\//i.test(obj)) salida.push(obj)
  } else if (obj && typeof obj === 'object') {
    for (const v of Object.values(obj)) recorrer(v, salida)
  }
  return salida
}

const elegirUrl = (json) => {
  const urls = recorrer(json)
  return urls.find(u => /\.mp4(\?|$)/i.test(u)) ||
    urls.find(u => /\.gif(\?|$)/i.test(u)) ||
    urls.find(u => /\.(webp|png|jpe?g)(\?|$)/i.test(u)) ||
    urls[0] || null
}

const pedir = (url, params) => axios.get(url, {
  params,
  responseType: 'arraybuffer',
  timeout: 30000,
  validateStatus: () => true
})

async function obtenerMedia(base, key, tipo) {
  const r = await pedir(`${base}/sfw/interaction`, { key, type: tipo })
  if (r.status !== 200) throw new Error(`HTTP ${r.status}`)

  let buffer = Buffer.from(r.data)
  let formato = detectar(buffer)

  if (!formato) {
    let json
    try {
      json = JSON.parse(buffer.toString())
    } catch {
      throw new Error('La API devolvió un formato desconocido.')
    }
    const url = elegirUrl(json)
    if (!url) throw new Error('La API no devolvió ninguna imagen.')
    const d = await pedir(url)
    if (d.status !== 200) throw new Error(`HTTP ${d.status}`)
    buffer = Buffer.from(d.data)
    formato = detectar(buffer)
  }

  if (!formato) throw new Error('No se pudo reconocer el archivo descargado.')
  return { buffer, formato }
}

async function aMp4(buffer, formato) {
  const id = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  const entrada = path.join(os.tmpdir(), `rx_${id}.${formato}`)
  const salida = path.join(os.tmpdir(), `rx_${id}.mp4`)
  fs.writeFileSync(entrada, buffer)
  try {
    await run('ffmpeg', ['-y', '-i', entrada, '-movflags', '+faststart', '-pix_fmt', 'yuv420p', '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2', salida], { timeout: 60000 })
    return fs.readFileSync(salida)
  } finally {
    fs.promises.unlink(entrada).catch(() => {})
    fs.promises.unlink(salida).catch(() => {})
  }
}

const tag = (jid) => `@${jid.split('@')[0]}`

const resolver = (jid, participants = []) => {
  if (!jid || !jid.endsWith('@lid')) return jid
  const p = participants.find(x => x.id === jid || x.lid === jid)
  return [p?.phoneNumber, p?.jid].find(x => x && x.endsWith('@s.whatsapp.net')) || jid
}

let handler = async (m, { conn, command, usedPrefix, participants }) => {
  const cmd = command.toLowerCase()

  const tipo = ALIAS[cmd] || cmd
  const frases = REACCIONES[tipo]
  if (!frases) return

  const base = global.info?.evogb
  const key = global.info?.evogbkey

  const a = resolver(m.sender, participants)
  const objetivo = m.mentionedJid?.[0] || m.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0] || m.quoted?.sender || null
  const b = resolver(objetivo, participants)
  const conObjetivo = b && b !== a

  const texto = (conObjetivo ? frases[0] : frases[1])
    .replace('{a}', tag(a))
    .replace('{b}', conObjetivo ? tag(b) : '')

  const mentions = conObjetivo ? [a, b] : [a]

  try {
    let { buffer, formato } = await obtenerMedia(base, key, tipo)

    if (formato === 'gif' || formato === 'webm') {
      buffer = await aMp4(buffer, formato)
      formato = 'mp4'
    }

    if (formato === 'mp4') {
      await conn.sendMessage(m.chat, { video: buffer, gifPlayback: true, caption: texto, mentions }, { quoted: m })
    } else {
      await conn.sendMessage(m.chat, { image: buffer, caption: texto, mentions }, { quoted: m })
    }
  } catch (e) {
    console.error(`Error en reacción ${tipo}:`, e.message)
    await conn.sendMessage(m.chat, { react: { text: '✖️', key: m.key } })
    return conn.reply(m.chat, `> ✿︎ Ocurrió un error al enviar la reacción.\n> *[Detalle: ${e.message}]*`, m)
  }
}

handler.help = Object.keys(REACCIONES)
handler.tags = ['anime']
handler.command = Object.keys(REACCIONES)
handler.group = true

export default handler
