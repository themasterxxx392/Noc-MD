import axios from 'axios';
//import cheerio from 'cheerio';
//import { search, download } from 'aptoide-scraper';
const userMessages = new Map();
const userRequests = {};

const handler = async (m, { conn, usedPrefix, command, text }) => {
const apkpureApi = 'https://apkpure.com/api/v2/search?q=';
const apkpureDownloadApi = 'https://apkpure.com/api/v2/download?id=';
if (!text) return m.reply(`⚠️ *𝙀𝙨𝙘𝙧𝙞𝙗𝙖 𝙚𝙡 𝙣𝙤𝙢𝙗𝙧𝙚 𝙙𝙚𝙡 𝘼𝙋𝙆*`)
if (userRequests[m.sender]) return await conn.reply(m.chat, `⚠️ Hey @${m.sender.split('@')[0]} pendejo, ya estás descargando un APK 🙄\nEspera a que termine tu descarga actual antes de pedir otra. 👆`, userMessages.get(m.sender) || m)
userRequests[m.sender] = true;
m.react("⌛");
try {
const downloadAttempts = [async () => {
const res = await fetch(`https://api.dorratz.com/v2/apk-dl?text=${text}`);
const data = await res.json();
if (!data.name) throw new Error('No data from dorratz API');
return { name: data.name, package: data.package, lastUpdate: data.lastUpdate, size: data.size, icon: data.icon, dllink: data.dllink };
},
async () => {
const res = await fetch(`${info.apis}/download/apk?query=${text}`);
const data = await res.json();
const apkData = data.data;
return { name: apkData.name, developer: apkData.developer, publish: apkData.publish, size: apkData.size, icon: apkData.image, dllink: apkData.download };
},
async () => {
const searchA = await search(text);
const data5 = await download(searchA[0].id);
return { name: data5.name, package: data5.package, lastUpdate: data5.lastup, size: data5.size, icon: data5.icon, dllink: data5.dllink };
}];

let apkData = null;
for (const attempt of downloadAttempts) {
try {
apkData = await attempt();
if (apkData) break; 
} catch (err) {
console.error(`Error in attempt: ${err.message}`);
continue; // Si falla, intentar con la siguiente API
}}

if (!apkData) throw new Error('No se pudo descargar el APK desde ninguna API');
const response = `≪ＤＥＳＣＡＲＧＡＤＯ ＡＰＫＳ🚀≫

┏━━━━━━━━━━━━━━━━━━━━━━• 
┃💫 𝙉𝙊𝙈𝘽𝙍𝙀: ${apkData.name}
${apkData.developer ? `┃👤 𝘿𝙀𝙎𝘼𝙍𝙍𝙊𝙇𝙇𝙊: ${apkData.developer}` : `┃📦 𝙋𝘼𝘾𝙆𝘼𝙂𝙀: ${apkData.package}`}
┃🕒 𝙐𝙇𝙏𝙄𝙈𝘼 𝘼𝘾𝙏𝙐𝙇𝙄𝙕𝘼𝘾𝙄𝙊𝙉: ${apkData.developer ? apkData.publish : apkData.lastUpdate}
┃💪 𝙋𝙀𝙎𝙊: ${apkData.size}
┗━━━━━━━━━━━━━━━━━━━━━━━•

> *⏳ ᴱˢᵖᵉʳᵉ ᵘⁿ ᵐᵒᵐᵉⁿᵗᵒ ˢᵘˢ ᵃᵖᵏ ˢᵉ ᵉˢᵗᵃ ᵉⁿᵛᶦᵃⁿᵈᵒ...*`;
const responseMessage = await conn.sendFile(m.chat, apkData.icon, 'apk.jpg', response, m);
userMessages.set(m.sender, responseMessage);

const apkSize = apkData.size.toLowerCase();
if (apkSize.includes('gb') || (apkSize.includes('mb') && parseFloat(apkSize) > 999)) {
await m.reply('*⚠️ 𝙀𝙡 𝙖𝙥𝙠 𝙚𝙨 𝙢𝙪𝙮 𝙥𝙚𝙨𝙖𝙙𝙤.*');
return;
}

await conn.sendMessage(m.chat, { document: { url: apkData.dllink }, mimetype: 'application/vnd.android.package-archive', fileName: `${apkData.name}.apk`, caption: null }, { quoted: m });
m.react("✅");
} catch (e) {
m.react('❌');
console.log(e);
handler.limit = false;
} finally {
delete userRequests[m.sender];
}};
handler.help = ['apk', 'apkmod'];
handler.tags = ['downloader'];
handler.command = /^(apkmod|apk|modapk|dapk2|aptoide|aptoidedl)$/i;
handler.limit = 2;

export default handler;

async function searchApk(text) {
  const response = await axios.get(`${apkpureApi}${encodeURIComponent(text)}`);
  const data = response.data;
  return data.results;
}

async function downloadApk(id) {
  const response = await axios.get(`${apkpureDownloadApi}${id}`);
  const data = response.data;
  return data;
}
