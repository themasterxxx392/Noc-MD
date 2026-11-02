import { sticker } from '../lib/sticker.js'
import { db } from '../lib/postgres.js';
import fetch from 'node-fetch'
import fs from "fs"
let handler = async (m, { conn, text, args, usedPrefix, command }) => {
const userResult = await db.query('SELECT sticker_packname, sticker_author FROM usuarios WHERE id = $1', [m.sender]);
const user = userResult.rows[0] || {};
let f = user.sticker_packname || global.info.packname;
let g = (user.sticker_packname && user.sticker_author ? user.sticker_author : (user.sticker_packname && !user.sticker_author ? '' : global.info.author));
if (!args[0]) return m.reply(`⚠️ 𝘿𝙚𝙗𝙚𝙨 𝙙𝙚 𝙪𝙨𝙖𝙧 2 𝙚𝙢𝙤𝙟𝙞𝙨 𝙮 𝙚𝙣 𝙢𝙚𝙙𝙞𝙤 𝙪𝙨𝙖𝙧 𝙚𝙡 *+*\n• 𝙀𝙟𝙚𝙢𝙥𝙡𝙤 :\n*${usedPrefix + command}* 😺+😆`) 
//conn.fakeReply(m.chat, `Calma crack estoy procesando 👏\n\n> *Esto puede demorar unos minutos*`, '0@s.whatsapp.net', `No haga spam gil`, 'status@broadcast', null, fake)
try {
let [emoji1, emoji2] = text.split`+`
let anu = await fetchJson(`https://tenor.googleapis.com/v2/featured?key=AIzaSyAyimkuYQYF_FXVALexPuGQctUWRURdCYQ&contentfilter=high&media_filter=png_transparent&component=proactive&collection=emoji_kitchen_v5&q=${encodeURIComponent(emoji1)}_${encodeURIComponent(emoji2)}`)
for (let res of anu.results) {
let stiker = await sticker(false, res.url, f, g)
conn.sendFile(m.chat, stiker, 'sticker.webp', '',m, true, { contextInfo: { 'forwardingScore': 200, 'isForwarded': false, externalAdReply:{ showAdAttribution: false, title: info.wm, body: ``, mediaType: 2, sourceUrl: info.md, thumbnail: m.pp}}}, { quoted: m })
}} catch (e) {
console.log(e)}}
handler.help = ['emojimix'].map(v => v + ' emot1|emot2>')
handler.tags = ['sticker']
handler.command = /^(emojimix|emogimix|combinaremojis|crearemoji|emojismix|emogismix)$/i
handler.limit = 1
export default handler

const fetchJson = (url, options) => new Promise(async (resolve, reject) => {
fetch(url, options)
.then(response => response.json())
.then(json => {
resolve(json)
})
.catch((err) => {
reject(err)
})})
