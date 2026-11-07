import { db, getSubbotConfig } from '../lib/postgres.js'

const GRUPO = {
  welcome: { alias: ['welcome', 'bienvenida'], col: 'welcome' },
  bye: { alias: ['bye', 'despedidas'], col: 'bye' },
  detect: { alias: ['detect', 'avisos'], col: 'detect' },
  antilink: { alias: ['antilink', 'antienlace'], col: 'antilink' },
  antilink2: { alias: ['antilink2'], col: 'antilink2' },
  approve: { alias: ['approve', 'autoapprove', 'aprobar'], col: 'auto_approve' },
  antiporn: { alias: ['antiporn', 'antiporno', 'antinwfs'], col: 'antiporn' },
  audios: { alias: ['audios'], col: 'audios' },
  antifake: { alias: ['antifake'], col: 'antifake' },
  antistatus: { alias: ['antistatus', 'antiestados'], col: 'antistatus' },
  nsfw: { alias: ['nsfw', 'modohorny', 'modocaliente'], col: 'nsfw' },
  modoadmin: { alias: ['modoadmin', 'onlyadmin'], col: 'modoadmin' }
}

const BOT = {
  antiprivate: { alias: ['antiprivate', 'antiprivado'], col: 'anti_private' },
  anticall: { alias: ['anticall', 'antillamada', 'antillamadas'], col: 'anti_call' }
}

const OPCIONES = {}
for (const [nombre, o] of Object.entries(GRUPO)) for (const a of o.alias) OPCIONES[a] = { ...o, nombre, bot: false }
for (const [nombre, o] of Object.entries(BOT)) for (const a of o.alias) OPCIONES[a] = { ...o, nombre, bot: true }

const ACCION = /^((en|dis)able|(tru|fals)e|(turn)?o(n|ff))$/i
const ON = ['on', 'activar', 'enable', 'true', '1']
const OFF = ['off', 'desactivar', 'disable', 'false', '0']

const handler = async (m, { conn, args, usedPrefix, command, isAdmin, isOwner }) => {
  const cmd = command.toLowerCase()
  let opcion
  let isEnable

  if (ACCION.test(cmd)) {
    opcion = OPCIONES[(args[0] || '').toLowerCase()]
    isEnable = /true|enable|(turn)?on/i.test(cmd)
  } else {
    opcion = OPCIONES[cmd]
    const accion = (args[0] || '').toLowerCase()
    if (ON.includes(accion)) isEnable = true
    else if (OFF.includes(accion)) isEnable = false
  }

  const res = await db.query('SELECT * FROM group_settings WHERE group_id = $1', [m.chat])
  const chat = res.rows[0] || {}
  const botConf = await getSubbotConfig(conn.user?.id)
  const getStatus = (flag) => m.isGroup ? (chat[flag] ? '✔️' : '✖️') : '⚠️'

  if (!opcion) {
    let menu = `*『 ⧼⧼⧼ ＣＯＮＦＩＧＵＲＡＣＩＯ́Ｎ ⧽⧽⧽ 』*\n\n`
    menu += `> *Seleccione una opción de la lista*\n> *Para empezar a Configurar*\n\n`
    menu += `● *Avisos de la Configuracion:*
✔️ ⇢ *Función Activada*
✖️ ⇢ *Función Desactivada*
⚠️ ⇢ *Este Chat no es un Grupo*\n\n`
    menu += `*『 FUNCIONES PARA ADMINS 』*\n\n`
    menu += `🎉 BIENVENIDA ${getStatus('welcome')}\n• Mensaje de bienvenida\n• ${usedPrefix}welcome on/off\n\n`
    menu += `📣 DETECTAR AVISOS ${getStatus('detect')}\n• Avisar cambios en el grupo\n• ${usedPrefix}detect on/off\n\n`
    menu += `🔗 ANTILINK ${getStatus('antilink')}\n• Detectar enlaces de grupo\n• ${usedPrefix}antilink on/off\n\n`
    menu += `🌐 ANTILINK2 ${getStatus('antilink2')}\n• Detectar cualquier link\n• ${usedPrefix}antilink2 on/off\n\n`
    menu += `🕵️ ANTIFAKE ${getStatus('antifake')}\n• Bloquear números de otros países\n• ${usedPrefix}antifake on/off\n\n`
    menu += `🔞 NSFW ${getStatus('nsfw')}\n• Comandos +18 en el grupo\n• ${usedPrefix}nsfw on/off\n\n`
    menu += `🔒 MODO SOLO ADMIN ${getStatus('modoadmin')}\n• Solo admins pueden usar comandos\n• ${usedPrefix}modoadmin on/off\n\n`
    menu += `\n*『 FUNCIONES PARA OWNER 』*\n\n`
    menu += `🚫 ANTIPRIVADO ${botConf.anti_private ? '✔️' : '✖️'}
• Bloquear uso en privado
• ${usedPrefix}antiprivate on/off\n\n`
    menu += `📵 ANTILLAMADAS ${botConf.anti_call ? '✔️' : '✖️'}
• Bloquear llamadas
• ${usedPrefix}anticall on/off`
    return m.reply(menu.trim())
  }

  if (opcion.bot) {
    if (!isOwner) return m.reply('✖️ Solo el owner del bot puede cambiar esto.')
  } else {
    if (!m.isGroup) throw '⚠️ Este comando solo se puede usar dentro de un grupo.'
    if (!isAdmin) throw '⚠️ Solo los admins puede usar este comando.'
  }

  if (isEnable === undefined) {
    const actual = opcion.bot ? botConf[opcion.col] : chat[opcion.col]
    const base = usedPrefix + opcion.alias[0]
    return m.reply(`❖ *${opcion.nombre.toUpperCase()}* » ${actual ? '✅ Activado' : '❌ Desactivado'}\n\nUsa: *${base} on* o *${base} off*`)
  }

  if (opcion.bot) {
    const cleanId = conn.user.id.replace(/:\d+/, '')
    await db.query(`INSERT INTO subbots (id, ${opcion.col})
    VALUES ($1, $2)
    ON CONFLICT (id) DO UPDATE SET ${opcion.col} = $2`, [cleanId, isEnable])
  } else {
    await db.query(`INSERT INTO group_settings (group_id) VALUES ($1) ON CONFLICT DO NOTHING`, [m.chat])
    await db.query(`UPDATE group_settings SET ${opcion.col} = $1 WHERE group_id = $2`, [isEnable, m.chat])
  }

  await m.reply(`🗂️ La opción *${opcion.nombre}* para ${opcion.bot ? 'todo el bot' : 'este chat'} fue *${isEnable ? 'activada' : 'desactivada'}* correctamente.`)
}

handler.help = ['enable <opción>', 'disable <opción>']
handler.tags = ['nable']
handler.command = new RegExp(`^(${['(en|dis)able', '(tru|fals)e', '(turn)?o(n|ff)', ...Object.keys(OPCIONES)].join('|')})$`, 'i')

export default handler
