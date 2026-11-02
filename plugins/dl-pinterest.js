import axios from 'axios';
import { pinterest } from '../lib/scraper.js';

let handler = async (m, { conn, usedPrefix, command, text }) => {
if (!text) return m.reply(`*⚠️ Ingresa el término de búsqueda.*\nEj: ${usedPrefix + command} nayeon`)
m.react("⌛");
try {
const downloadAttempts = [async () => {
const response = await pinterest.search(text, 6);
const pins = response.result.pins.slice(0, 5);
return pins.map(pin => ({title: pin.title || text,
description: `🔎 Por: ${pin.uploader.username}`,
image: pin.media.images.orig.url}));
},
async () => {
const res = await axios.get(`https://api.siputzx.my.id/api/s/pinterest?query=${encodeURIComponent(text)}`);
const data = res.data.data.slice(0, 5);
return data.map(result => ({title: result.grid_title || text, description: '', image: result.images_url }));
},
async () => {
const res = await axios.get(`https://api.dorratz.com/v2/pinterest?q=${text}`);
const data = res.data.slice(0, 5);
return data.map(result => ({title: result.fullname || text, description: `*🔸️Autor:* ${result.upload_by}\n*🔸️ Seguidores:* ${result.followers}`, image: result.image }));
},
async () => {
const res = await axios.get(`${info.apis}/search/pinterestv2?text=${encodeURIComponent(text)}`);
const data = res.data.data.slice(0, 5);
return data.map(result => ({title: result.description || text, description: `🔎 Autor: ${result.name} (@${result.username})`, image: result.image }));
}];

let results = null;
for (const attempt of downloadAttempts) {
try {
results = await attempt();
if (results && results.length > 0) break; 
} catch (err) {
console.error(`Error in attempt: ${err.message}`);
continue; // Si falla, intentar con la siguiente API
}}

if (!results || results.length === 0) throw new Error(`❌ No se encontraron resultados para "${text}".`);
const medias = results.map(result => ({ type: "image", data: { url: result.image } }));
await conn.sendAlbumMessage(m.chat, medias, `✅ Resultados para: ${text}`, m);
//conn.sendFile(m.chat, results[0].image, 'error.jpg', `_🔎 𝙍𝙚𝙨𝙪𝙡𝙩𝙖𝙙𝙤𝙨 𝙙𝙚: ${text}_`, m);
/*if (m.isWABusiness) {
const medias = results.map(result => ({ type: "image", data: { url: result.image } }));
await conn.sendAlbumMessage(m.chat, medias, `✅ Resultados para: ${text}`, m);
} else {
const messages = results.map(result => ["", `${result.title}\n${result.description}`, result.image]);
await conn.sendCarousel(m.chat, `✅ Resultados para: ${text}`, "🔍 Pinterest Search", messages, m);
}*/
m.react("✅️");
} catch (e) {
await m.reply(e.message || `❌ No se encontraron resultados para "${text}".`);
m.react("❌️");
}};
handler.help = ['pinterest <keyword>'];
handler.tags = ['buscadores'];
handler.command = /^(pinterest)$/i;
handler.limit = 1;

export default handler;
