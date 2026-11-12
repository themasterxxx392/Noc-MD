import util from 'util'
import path from 'path' 
import fetch from 'node-fetch';

let toM = a => '@' + a.split('@')[0] 

let handler = async (m, { conn, metadata, command, text, participants, usedPrefix}) => {
let fkontak = { "key": { "participants":"0@s.whatsapp.net", "remoteJid": "status@broadcast", "fromMe": false, "id": "Halo" }, "message": { "contactMessage": { "vcard": `BEGIN:VCARD\nVERSION:3.0\nN:Sy;Bot;;;\nFN:y\nitem1.TEL;waid=${m.sender.split('@')[0]}:${m.sender.split('@')[0]}\nitem1.X-ABLabel:Ponsel\nEND:VCARD` }}, "participant": "0@s.whatsapp.net" }  

try {
let user = a => '@' + a.split('@')[0]
let ps = metadata.participants.map(v => v.id)
let a = ps.getRandom()
let b = ps.getRandom() 
let c = ps.getRandom()
let d = ps.getRandom()
let e = ps.getRandom()
let f = ps.getRandom()
let g = ps.getRandom()
let h = ps.getRandom()
let i = ps.getRandom()
let j = ps.getRandom() 

//------------------------------------------------------------------------------------

if (command == 'amistad' || command == 'amigorandom') {   
m.reply(`*🔰 Vamos a hacer algunas amistades 🔰*\n\n*Oye ${toM(a)} hablale al privado a ${toM(b)} para que jueguen y se haga una amistad 🙆*\n\n*Las mejores amistades empiezan con un juego 😉*`, null, {
mentions: [a, b]})}

//------------------------------------------------------------------------------------

if (command == 'formarpareja' || command == 'formarparejas') {
m.reply(`*${toM(a)}, 𝙔𝙖 𝙚𝙨 𝙝𝙤𝙧𝙖 𝙙𝙚 𝙦𝙪𝙚 𝙩𝙚 💍 𝘾𝙖𝙨𝙚𝙨 𝙘𝙤𝙣 ${toM(b)}, 𝙇𝙞𝙣𝙙𝙖 𝙋𝙖𝙧𝙚𝙟𝙖 😉💓*`, null, {
mentions: [a, b]})}
  
//------------------------------------------------------------------------------------
    
if (command == 'personalidad') {
if (!text) return conn.reply(m.chat, 'Ingrese un nombre?', m)
let personalidad = `┏━━°❀❬ *PERSONALIDAD}* ❭❀°━━┓
*┃*
*┃• Nombre* : ${text}
*┃• Buena Moral* : ${pickRandom(['6%','12%','20%','27%','35%','41%','49%','54%','60%','66%','73%','78%','84%','92%','93%','94%','96%','98,3%','99,7%','99,9%','1%','2,9%','0%','0,4%'])}
*┃• Mala Moral* : ${pickRandom(['6%','12%','20%','27%','35%','41%','49%','54%','60%','66%','73%','78%','84%','92%','93%','94%','96%','98,3%','99,7%','99,9%','1%','2,9%','0%','0,4%'])}
*┃• Tipo de persona* : ${pickRandom(['De buen corazón','Arrogante','Tacaño','Generoso','Humilde','Tímido','Cobarde','Entrometido','Cristal','No binarie XD', 'Pendejo'])}
*┃• Siempre* : ${pickRandom(['Pesado','De malas','Distraido','De molestoso','Chismoso','Pasa jalandosela','De compras','Viendo anime','Chatea en WhatsApp porque esta soltero','Acostado bueno para nada','De mujeriego','En el celular'])}
*┃• Inteligencia* : ${pickRandom(['6%','12%','20%','27%','35%','41%','49%','54%','60%','66%','73%','78%','84%','92%','93%','94%','96%','98,3%','99,7%','99,9%','1%','2,9%','0%','0,4%'])}
*┃• Morosidad* : ${pickRandom(['6%','12%','20%','27%','35%','41%','49%','54%','60%','66%','73%','78%','84%','92%','93%','94%','96%','98,3%','99,7%','99,9%','1%','2,9%','0%','0,4%'])}
*┃• Coraje* : ${pickRandom(['6%','12%','20%','27%','35%','41%','49%','54%','60%','66%','73%','78%','84%','92%','93%','94%','96%','98,3%','99,7%','99,9%','1%','2,9%','0%','0,4%'])}
*┃• Miedo* : ${pickRandom(['6%','12%','20%','27%','35%','41%','49%','54%','60%','66%','73%','78%','84%','92%','93%','94%','96%','98,3%','99,7%','99,9%','1%','2,9%','0%','0,4%'])}
*┃• Fama* : ${pickRandom(['6%','12%','20%','27%','35%','41%','49%','54%','60%','66%','73%','78%','84%','92%','93%','94%','96%','98,3%','99,7%','99,9%','1%','2,9%','0%','0,4%'])}
*┃• Género* : ${pickRandom(['Hombre', 'Mujer', 'Homosexual', 'Bisexual', 'Pansexual', 'Feminista', 'Heterosexual', 'Macho alfa', 'Mujerzona', 'Marimacha', 'Palosexual', 'PlayStationSexual', 'Sr. Manuela', 'Pollosexual'])}
┗━━━━━━━━━━━━━━━━`
conn.reply(m.chat, personalidad, m, { mentions: conn.parseMention(personalidad) })
}   

//------------------------------------------------------------------------------------

if (command == 'ship' || command == 'shippear') {
if (!text) return m.reply(`⚠️ 𝐄𝐬𝐜𝐫𝐢𝐛𝐚 𝐞𝐥 𝐧𝐨𝐦𝐛𝐫𝐞 𝐝𝐞 𝐝𝐨𝐬 𝐩𝐞𝐫𝐬𝐨𝐧𝐚𝐬 𝐩𝐚𝐫𝐚 𝐜𝐚𝐥𝐜𝐮𝐥𝐚𝐫 𝐬𝐮𝐬 𝐚𝐦𝐨𝐫`)
let [text1, ...text2] = text.split(' ')
text2 = (text2 || []).join(' ')
if (!text2) throw `⚠️ 𝐅𝐚𝐥𝐭𝐚 𝐞𝐥 𝐧𝐨𝐦𝐛𝐫𝐞 𝐝𝐞 𝐥𝐚 𝐬𝐞𝐠𝐮𝐧𝐝𝐚 𝐩𝐞𝐫𝐬𝐨𝐧𝐚`
let love = `_❤️ *${text1}* tu oportunidad de enamorarte de *${text2}* es de *${Math.floor(Math.random() * 100)}%* 👩🏻‍❤️‍👨🏻_ `.trim()
m.reply(love, null, { mentions: conn.parseMention(love) })
}

//------------------------------------------------------------------------------------

if (command == 'Doxxeo' || command == 'doxxeo' || command == 'doxxear' || command == 'Doxxear' || command == 'doxeo' || command == 'doxear' || command == 'doxxeame' || command == 'doxeame') {
let who
if (m.isGroup) who = m.mentionedJid[0]
else who = m.chat
let start = `*😱 ¡¡𝙀𝙢𝙥𝙚𝙯𝙖𝙣𝙙𝙤 𝙙𝙤𝙭𝙭𝙚𝙤!! 😱*`
let boost2 = `*${pickRandom(['21','22','23','24','25','26','27','28','29','30','31','32','33','34','35','36','37','38','39','40'])}%*`
let boost3 = `*${pickRandom(['41','42','43','44','45','46','47','48','49','50','51','52','53','54','55','56','57','58','59','60'])}%*`
let boost4 = `*${pickRandom(['61','62','63','64','65','66','67','68','69','70','71','72','73','74','75','76','77','78','79','80'])}%*`
let boost5 = `*${pickRandom(['81','82','83','84','85','86','87','88','89','90','91','92','93','94','95','96','97','98','99','100'])}%*`

const { key } = await conn.sendMessage(m.chat, {text: `${start}`, mentions: conn.parseMention(text)}, {quoted: m}) 
await delay(1000 * 1)
await conn.sendMessage(m.chat, {text: `${boost2}`, edit: key})
await delay(1000 * 1)
await conn.sendMessage(m.chat, {text: `${boost3}`, edit: key})
await delay(1000 * 1)
await conn.sendMessage(m.chat, {text: `${boost4}`, edit: key})
await delay(1000 * 1)
await conn.sendMessage(m.chat, {text: `${boost5}`, edit: key})

let old = performance.now()
let neww = performance.now()
let speed = `${neww - old}`
let doxeo = `*✅ 𝐏𝐞𝐫𝐬𝐨𝐧𝐚 𝐡𝐚𝐜𝐤𝐞𝐚𝐝𝐚 𝐜𝐨𝐧 𝐞𝐱𝐢𝐭𝐨𝐬 🤣*\n\n*𝐓𝐢𝐞𝐦𝐩𝐨: ${speed} 𝐒𝐞𝐠𝐮𝐧𝑑𝐨𝐬!*

*𝐑𝐞𝐬𝐮𝐥𝐭𝐚𝐝𝐨𝐬:*
*Nombre:* ${text}
*Ip:* 192.28.213.234
*N:* 43 7462
*W:* 12.4893
*SS NUMBER:* 6979191519182016
*IPV6:* fe80::5dcd::ef69::fb22::d9888%12 
*UPNP:* Enabled
*DMZ:* 10.112.42.15
*MAC:* 5A:78:3E:7E:00
*ISP:* TORNADO SLK PRODUCTION
*DNS:* 8.8.8.8
*ALT DNS:* 1.1.1.1.1  
*DNS SUFFIX:* TORNADO WI-FI
*WAN:* 100.23.10.90
*WAN TYPE:* private nat
*GATEWAY:* 192.168.0.1
*SUBNET MASK:* 255.255.0.255
*UDP OPEN PORTS:* 8080.80
*TCP OPEN PORTS:* 443
*ROUTER VENDEDOR:* ERICCSON
*DEVICE VENDEDOR:* WIN32-X
*CONNECTION TYPE:* TORNADO SLK PRODUCTION
*ICMPHOPS:* 192.168.0.1 192.168.1.1 100.73.43.4
host-132.12.32.167.ucom.com
host-132.12.111.ucom.com
36.134.67.189 216.239.78.11
Sof02s32inf14.1e100.net
*HTTP:* 192.168.3.1:433-->92.28.211.234:80
*Http:* 192.168.625-->92.28.211.455:80
*Http:* 192.168.817-->92.28.211.8:971
*Upd:* 192.168452-->92.28.211:7265288
*Tcp:* 192.168.682-->92.28.211:62227.7
*Tcp:* 192.168.725-->92.28.211:67wu2
*Tcp:* 192.168.629-->92.28.211.167:8615
*EXTERNAL MAC:* 6U:77:89:ER:O4
*MODEM JUMPS:* 58`
await conn.sendMessage(m.chat, {text: doxeo, edit: key})
}

//------------------------------------------------------------------------------------

if (command == 'gay') {
let vn = 'https://qu.ax/HfeP.mp3'
let who
if (m.isGroup) who = m.mentionedJid[0] ? m.mentionedJid[0] : m.sender
else who = m.sender 
let random = `${Math.floor(Math.random() * 100)}`
let gay = random
if (gay < 20 ) {gay = 'Usted es hetero 🤪🤙'} else if (gay == 21 ) {gay = 'Mas o menos 🤔'} else if (gay == 23 ) {gay = 'Mas o menos 🤔'} else if (gay == 24 ) {gay = 'Mas o menos 🤔'} else if (gay == 25 ) {gay = 'Mas o menos 🤔'} else if (gay == 26 ) {gay = 'Mas o menos 🤔'} else if (gay == 27 ) {gay = 'Mas o menos 🤔'} else if (gay == 28 ) {gay = 'Mas o menos 🤔'} else if (gay == 29 ) {gay = 'Mas o menos 🤔'} else if (gay == 30 ) {gay = 'Mas o menos 🤔'} else if (gay >= 31 && gay <= 40 ) {gay = 'Tengo mi dudas 😑'} else if (gay >= 41 && gay <= 50 ) {gay = 'Tengo razon? 😏'} else if (gay == 50 ) {gay = 'Eres o no? 🧐'} else if (gay > 51) {gay = 'Usted es gay 🥸'}
    let jawab = `@${who.split("@")[0]} Es 🏳️‍🌈 ${random}% Gay\n\n${gay}`;
    const avatar = await conn.profilePictureUrl(who, 'image').catch(_ => 'https://telegra.ph/file/24fa902ead26340f3df2c.png');

    const imageRes = await fetch(`https://some-random-api.com/canvas/gay?avatar=${encodeURIComponent(avatar)}`);
    const buffer = await imageRes.buffer();

    await conn.sendMessage(m.chat, {
      image: buffer,
      caption: jawab,
      contextInfo: {
        mentionedJid: [who],
        forwardingScore: 9999999,
        isForwarded: false
      }
    }, { quoted: m, ephemeralExpiration: 24 * 60 * 1000 });

    await conn.sendFile(m.chat, vn, 'gay.mp3', null, m, true, {
      type: 'audioMessage',
      ptt: true
    });
  }

//------------------------------------------------------------------------------------
    
if (command == 'gay2') {
if (!text) return m.reply(`🤔 𝙋𝙚𝙣𝙙𝙚𝙟𝙤 𝙚𝙩𝙞𝙦𝙪𝙚𝙩𝙖𝙨 𝙖𝙡 𝙡𝙖 𝙥𝙚𝙧𝙨𝙤𝙣𝙖 𝙘𝙤𝙣 𝙚𝙡 @Tag` ) 
let juego = `_*${text.toUpperCase()}* *ES* *${(500).getRandom()}%* *GAY*_ 🏳️‍🌈`.trim()
await conn.reply(m.chat, juego, m, m.mentionedJid ? { mentions: m.mentionedJid } : {})}

//------------------------------------------------------------------------------------
  
if (command == 'lesbiana') { 
if (!text) return m.reply(`🤔 𝙋𝙚𝙣𝙙𝙚𝙟𝙤 𝙚𝙩𝙞𝙦𝙪𝙚𝙩𝙖𝙨 𝙖𝙡 𝙡𝙖 𝙥𝙚𝙧𝙨𝙤𝙣𝙖 𝙘𝙤𝙣 𝙚𝙡 @Tag` ) 
let juego = `_*${text.toUpperCase()}* *ES* *${(500).getRandom()}%* *${command.replace('how', '').toUpperCase()}*_ 🏳️‍🌈`.trim()
await conn.reply(m.chat, juego, m, m.mentionedJid ? { mentions: m.mentionedJid } : {})}
  
//------------------------------------------------------------------------------------
  
if (command == 'pajero') {
if (!text) return m.reply(`🤔 𝙋𝙚𝙣𝙙𝙚𝙟𝙤 𝙚𝙩𝙞𝙦𝙪𝙚𝙩𝙖𝙨 𝙖𝙡 𝙡𝙖 𝙥𝙚𝙧𝙨𝙤𝙣𝙖 𝙘𝙤𝙣 𝙚𝙡 @Tag` ) 
let juego = `_*${text.toUpperCase()}* *ES* *${(500).getRandom()}%* *${command.replace('how', '').toUpperCase()}*_ 😏💦`.trim()
await conn.reply(m.chat, juego, m, m.mentionedJid ? { mentions: m.mentionedJid } : {})}
  
//------------------------------------------------------------------------------------
  
if (command == 'pajera') {
if (!text) return m.reply(`🤔 𝙋𝙚𝙣𝙙𝙚𝙟𝙤 𝙚𝙩𝙞𝙦𝙪𝙚𝙩𝙖𝙨 𝙖𝙡 𝙡𝙖 𝙥𝙚𝙧𝙨𝙤𝙣𝙖 𝙘𝙤𝙣 𝙚𝙡 @Tag` ) 
let juego = `_*${text.toUpperCase()}* *ES* *${(500).getRandom()}%* *${command.replace('how', '').toUpperCase()}*_ 😏💦`.trim()
await conn.reply(m.chat, juego, m, m.mentionedJid ? { mentions: m.mentionedJid } : {})}
  
//------------------------------------------------------------------------------------
  
if (command == 'puto') {
if (!text) return m.reply(`🤔 𝙋𝙚𝙣𝙙𝙚𝙟𝙤 𝙚𝙩𝙞𝙦𝙪𝙚𝙩𝙖𝙨 𝙖𝙡 𝙡𝙖 𝙥𝙚𝙧𝙨𝙤𝙣𝙖 𝙘𝙤𝙣 𝙚𝙡 @Tag` ) 
let juego = `_*${text.toUpperCase()}* *ES* *${(500).getRandom()}%* *${command.replace('how', '').toUpperCase()},* *MÁS INFORMACIÓN A SU PRIVADO 🔥🥵 XD*_`.trim()
await conn.reply(m.chat, juego, m, m.mentionedJid ? { mentions: m.mentionedJid } : {})}
  
//------------------------------------------------------------------------------------
  
if (command == 'puta') {
if (!text) return m.reply(`🤔 𝙋𝙚𝙣𝙙𝙚𝙟𝙤 𝙚𝙩𝙞𝙦𝙪𝙚𝙩𝙖𝙨 𝙖𝙡 𝙡𝙖 𝙥𝙚𝙧𝙨𝙤𝙣𝙖 𝙘𝙤𝙣 𝙚𝙡 @Tag` ) 
let juego = `_*${text.toUpperCase()}* *ES* *${(500).getRandom()}%* *${command.replace('how', '').toUpperCase()},* *MÁS INFORMACIÓN A SU PRIVADO 🔥🥵 XD*_`.trim()
await conn.reply(m.chat, juego, m, m.mentionedJid ? { mentions: m.mentionedJid } : {})}

//------------------------------------------------------------------------------------
  
if (command == 'manco') {
if (!text) return m.reply(`🤔 𝙋𝙚𝙣𝙙𝙚𝙟𝙤 𝙚𝙩𝙞𝙦𝙪𝙚𝙩𝙖𝙨 𝙖𝙡 𝙡𝙖 𝙥𝙚𝙧𝙨𝙤𝙣𝙖 𝙘𝙤𝙣 𝙚𝙡 @Tag` ) 
let juego = `_*${text.toUpperCase()}* *ES* *${(500).getRandom()}%* *${command.replace('how', '').toUpperCase()} 💩*_`.trim()
await conn.reply(m.chat, juego, m, m.mentionedJid ? { mentions: m.mentionedJid } : {})}
  
//------------------------------------------------------------------------------------ 
  
if (command == 'manca') {
if (!text) return m.reply(`🤔 𝙋𝙚𝙣𝙙𝙚𝙟𝙤 𝙚𝙩𝙞𝙦𝙪𝙚𝙩𝙖𝙨 𝙖𝙡 𝙡𝙖 𝙥𝙚𝙧𝙨𝙤𝙣𝙖 𝙘𝙤𝙣 𝙚𝙡 @Tag` ) 
let juego = `_*${text.toUpperCase()}* *ES* *${(500).getRandom()}%* *${command.replace('how', '').toUpperCase()} 💩*_`.trim()
await conn.reply(m.chat, juego, m, m.mentionedJid ? { mentions: m.mentionedJid } : {})}
  
//------------------------------------------------------------------------------------
  
if (command == 'rata') {
if (!text) return m.reply(`🤔 𝙋𝙚𝙣𝙙𝙚𝙟𝙤 𝙚𝙩𝙞𝙦𝙪𝙚𝙩𝙖𝙨 𝙖𝙡 𝙡𝙖 𝙥𝙚𝙧𝙨𝙤𝙣𝙖 𝙘𝙤𝙣 𝙚𝙡 @Tag` ) 
let juego = `_*${text.toUpperCase()}* *ES* *${(500).getRandom()}%* *${command.replace('how', '').toUpperCase()} 🐁 COME QUESO 🧀*_`.trim()
await conn.reply(m.chat, juego, m, m.mentionedJid ? { mentions: m.mentionedJid } : {})}
  
//------------------------------------------------------------------------------------ 
  
if (command == 'prostituto') {
if (!text) return m.reply(`🤔 𝙋𝙚𝙣𝙙𝙚𝙟𝙤 𝙚𝙩𝙞𝙦𝙪𝙚𝙩𝙖𝙨 𝙖𝙡 𝙡𝙖 𝙥𝙚𝙧𝙨𝙤𝙣𝙖 𝙘𝙤𝙣 𝙚𝙡 @Tag` ) 
let juego = `_*${text.toUpperCase()}* *ES* *${(500).getRandom()}%* *${command.replace('how', '').toUpperCase()} 🫦👅, QUIEN QUIERE DE SUS SERVICIOS? XD*_`.trim()
await conn.reply(m.chat, juego, m, m.mentionedJid ? { mentions: m.mentionedJid } : {})}
  
//------------------------------------------------------------------------------------  
  
if (command == 'prostituta') {
if (!text) return m.reply(`🤔 𝙋𝙚𝙣𝙙𝙚𝙟𝙤 𝙚𝙩𝙞𝙦𝙪𝙚𝙩𝙖𝙨 𝙖𝙡 𝙡𝙖 𝙥𝙚𝙧𝙨𝙤𝙣𝙖 𝙘𝙤𝙣 𝙚𝙡 @Tag` ) 
let juego = `_*${text.toUpperCase()}* *ES* *${(500).getRandom()}%* *${command.replace('how', '').toUpperCase()} 🫦👅, QUIEN QUIERE DE SUS SERVICIOS? XD*_`.trim()
await conn.reply(m.chat, juego, m, m.mentionedJid ? { mentions: m.mentionedJid } : {})}
  
//------------------------------------------------------------------------------------

if (command == 'love') {
if (!text) return m.reply(`🤔 𝙋𝙚𝙣𝙙𝙚𝙟𝙤 𝙚𝙩𝙞𝙦𝙪𝙚𝙩𝙖𝙨 𝙖𝙡 𝙡𝙖 𝙥𝙚𝙧𝙨𝙤𝙣𝙖 𝙘𝙤𝙣 𝙚𝙡 @Tag` ) 
conn.reply(m.chat, ` *❤️❤️ MEDIDOR DE AMOR ❤️❤️* 
*El amor de ${text} por ti es de* *${Math.floor(Math.random() * 100)}%* *de un 100%*
*Deberias pedirle que sea tu  novia/o ?*`.trim(), m, m.mentionedJid ? {
 mentions: m.mentionedJid
 } : {})} 

} catch (e) {
  console.error(e)
}
}

export default handler
