import "./config.js";
import { watchFile, unwatchFile } from 'fs';
import chalk from "chalk";
import { fileURLToPath } from "url";
import crypto from "crypto";
import { db, getSubbotConfig } from "./lib/postgres.js";
import { logCommand } from "./lib/logger.js";
import { smsg } from "./lib/simple.js";

const META_TTL = 300_000;
const CHAT_TTL = 60_000;
const USER_TTL = 600_000;

const processedMessages = new Set();
const lastDbUpdate = new Map();
const chatSeen = new Map();
const userCache = new Map();
const groupMetaCache = new Map();

const FIXED_OWNERS = [
  "51987812968@s.whatsapp.net",
  "51972409783@s.whatsapp.net"
];

const DEFAULT_ANTIFAKE_PREFIXES = ["91", "92", "222", "93", "265", "213", "225", "226", "240", "241", "61", "249", "62", "966", "229", "244", "40", "49", "20", "963", "967", "234", "256", "243", "210", "212", "971", "974", "968", "965", "962", "961", "964", "263", "970"];

globalThis.__handlerIntervals?.forEach(id => clearInterval(id));
globalThis.__handlerIntervals = [];
const addInterval = (fn, ms) => globalThis.__handlerIntervals.push(setInterval(fn, ms));

const cleanJid = (jid = "") => String(jid || "").replace(/:\d+/, "");

async function getGroupMeta(conn, chat, force = false) {
  const cached = groupMetaCache.get(chat);
  if (!force && cached && Date.now() - cached.t < META_TTL) return cached.meta;
  const meta = await conn.groupMetadata(chat);
  groupMetaCache.set(chat, { meta, t: Date.now() });
  return meta;
}

async function resolveJid(conn, chat, jid) {
  if (!jid || !jid.endsWith('@lid')) return jid;
  try {
    const meta = await getGroupMeta(conn, chat);
    const p = meta.participants.find(p => p.id === jid || p.lid === jid);
    const real = [p?.phoneNumber, p?.jid, p?.id].find(x => x && x.endsWith('@s.whatsapp.net'));
    if (real) return real;
  } catch {}
  return jid;
}

function parsePrefixes(raw) {
  let list = raw;
  if (typeof list === 'string') {
    try {
      list = JSON.parse(list);
    } catch {
      list = list.split(',');
    }
  }
  if (!Array.isArray(list)) return DEFAULT_ANTIFAKE_PREFIXES;
  list = list.map(v => String(v).replace(/[^0-9]/g, "")).filter(Boolean);
  return list.length ? list : DEFAULT_ANTIFAKE_PREFIXES;
}

const isFakeNumber = (num, prefixes) => prefixes.some(p => num.startsWith(p));

export async function participantsUpdate(conn, { id, participants, action, author, authorPn }) {
  try {
    if (!id || !Array.isArray(participants) || !action) return;
    if (!conn?.user?.id) return;

    const getRealJid = (p) => {
      if (typeof p === "string") return cleanJid(p);
      return cleanJid(p?.phoneNumber || p?.participantAlt || p?.jid || p?.id || p?.lid || "");
    };

    const getLidJid = (p) => {
      if (typeof p === "string") return cleanJid(p);
      return cleanJid(p?.id || p?.lid || p?.jid || "");
    };

    const getTag = (jid) => jid?.includes("@") ? `@${jid.split("@")[0]}` : "@usuario";
    const makeMsg = (raw, vars = {}) => {
      let txt = String(raw || "");
      for (const [k, v] of Object.entries(vars)) {
        txt = txt.replace(new RegExp(k, "gi"), v ?? "");
      }
      return txt;
    };

    const botId = conn.user.id;
    const botConfig = await getSubbotConfig(botId);
    const modo = botConfig.mode || "public";
    const botJidClean = cleanJid(conn.user?.id);
    const botLidClean = cleanJid(conn.user?.lid);
    const authorJid = cleanJid(authorPn || author);

    const isCreator = global.owner.map(([v]) => v.replace(/[^0-9]/g, "") + "@s.whatsapp.net").includes(authorJid);
    if (modo === "private" && !isCreator && authorJid !== botJidClean) return;

    const metadata = await getGroupMeta(conn, id, true);

    const groupName = metadata.subject || "Grupo";
    const groupDesc = metadata.desc || "Sin descripción";
    const pp = "./media/Menu1.jpg";

    const settings = (await db.query("SELECT * FROM group_settings WHERE group_id = $1", [id])).rows[0] || {
      welcome: true,
      bye: false,
      detect: true,
      antifake: false
    };

    const isBotAdmin = metadata.participants.some(p => {
      const jid = cleanJid(p.id);
      return ((jid === botJidClean || jid === botLidClean) && (p.admin === "admin" || p.admin === "superadmin"));
    });

    const blockedPrefixes = parsePrefixes(settings.antifake_prefixes);

    const sendText = async (jid, msg, title, body, image, mentions = []) => {
      return conn.sendMessage(id, {
        text: msg,
        contextInfo: {
          mentionedJid: mentions.filter(Boolean),
          externalAdReply: {
            mediaUrl: [info.nna, info.nna2, info.md].getRandom(),
            mediaType: 2,
            showAdAttribution: false,
            renderLargerThumbnail: false,
            thumbnailUrl: image,
            title,
            body,
            containsAutoReply: true,
            sourceUrl: "https://skyultraplus.com"
          }
        }
      }, { quoted: null });
    };

    const sendImage = async (msg, image, mentions = []) => {
      return conn.sendMessage(id, {
        image: { url: image },
        caption: msg,
        contextInfo: {
          mentionedJid: mentions.filter(Boolean)
        }
      }, { quoted: null });
    };

    for (const p of participants) {
      const participant = getRealJid(p);
      const participantLid = getLidJid(p);
      if (!participant || !participant.includes("@")) continue;

      const mentions = [...new Set([participant, participantLid, authorJid].filter(Boolean))];
      const userTag = getTag(participant);
      const authorTag = getTag(authorJid);

      let image = pp;
      try {
        image = await conn.profilePictureUrl(participant, "image");
      } catch {}

      if (action === "add" && settings.antifake) {
        const phoneNumber = participant.split("@")[0].replace(/[^0-9]/g, "");
        const isFake = isFakeNumber(phoneNumber, blockedPrefixes);

        if (isFake && isBotAdmin) {
          await conn.sendMessage(id, { text: `⚠️ ${userTag} fue eliminado automáticamente por *número no permitido*`, mentions: [participant] });
          await conn.groupParticipantsUpdate(id, [participant], "remove");
          continue;
        }

        if (isFake && !isBotAdmin) continue;
      }

      const vars = {
        "@user": userTag,
        "@author": authorTag,
        "@group": groupName,
        "@subject": groupName,
        "@desc": groupDesc
      };

      if (action === "add") {
        if (!settings.welcome) continue;
        const raw = settings.swelcome || settings.sWelcome || `HOLAA!! @user ¿COMO ESTAS?😃\n\n『Bienvenido A *@group*』\n\nUn gusto conocerte amig@ 🤗\n\n_Recuerda leer las reglas del grupo para no tener ningun problema 🧐_\n\n*Solo disfrutar de este grupo y divertite 🥳*`;
        const msg = makeMsg(raw, vars);

        if (settings.photowelcome) {
          await sendImage(msg, image, mentions);
        } else {
          await sendText(id, msg, "🌟 WELCOME 🌟", "Bienvenido al grupo 🤗", image, mentions);
        }

        continue;
      }

      if (action === "remove") {
        try {
          await db.query(`DELETE FROM messages WHERE user_id = $1 AND group_id = $2`, [participant, id]);

          if (participant === botJidClean || participantLid === botLidClean) {
            await db.query(`UPDATE chats SET joined = false WHERE id = $1 AND bot_id = $2`, [id, botJidClean]);
          }
        } catch (err) {
          console.error("❌ Error limpiando remove:", err);
        }

        if (!settings.bye) continue;
        const raw = settings.sbye || settings.sBye || `Bueno, se fue @user 👋\n\nQue dios lo bendiga 😎`;
        const msg = makeMsg(raw, vars);

        if (settings.photobye) {
          await sendImage(msg, image, mentions);
        } else {
          await sendText(id, msg, "👋 BYE", "Se fue del grupo", image, mentions);
        }

        continue;
      }

      if (["promote", "daradmin", "darpoder"].includes(action)) {
        if (!settings.detect) continue;
        const raw = settings.spromote || settings.sPromote || `@user 𝘼𝙃𝙊𝙍𝘼 𝙀𝙎 𝘼𝘿𝙈𝙄𝙉 𝙀𝙉 𝙀𝙎𝙏𝙀 𝙂𝙍𝙐𝙋𝙊\n\n😼🫵𝘼𝘾𝘾𝙄𝙊𝙉 𝙍𝙀𝘼𝙇𝙄𝙕𝘼𝘿𝘼 𝙋𝙊𝙍: @author`;
        const msg = makeMsg(raw, vars);

        await sendText(id, msg, "NUEVO ADMIN 🥳", "Ahora tiene admin", image, mentions);
        continue;
      }

      if (["demote", "quitaradmin", "quitarpoder"].includes(action)) {
        if (!settings.detect) continue;
        const raw = settings.sdemote || settings.sDemote || `@user 𝘿𝙀𝙅𝘼 𝘿𝙀 𝙎𝙀𝙍 𝘼𝘿𝙈𝙄𝙉 𝙀𝙉 𝙀𝙎𝙏𝙀 𝙂𝙍𝙐𝙋𝙊\n\n😼🫵𝘼𝘾𝘾𝙄𝙊𝙉 𝙍𝙀𝘼𝙇𝙄𝙕𝘼𝘿𝘼 𝙋𝙊𝙍: @author`;
        const msg = makeMsg(raw, vars);

        await sendText(id, msg, "📛 ADMIN REMOVIDO", "Ya no tiene admin", image, mentions);
        continue;
      }
    }
  } catch (err) {
    console.error(chalk.red(`❌ Error en participantsUpdate - Acción: ${action} | Grupo: ${id}`), err);
  }
}

export async function groupsUpdate(conn, updates) {
  try {
    if (!Array.isArray(updates)) updates = [updates];
    const botId = conn.user?.id;
    if (!botId) return;

    const botConfig = await getSubbotConfig(botId);
    const modo = botConfig.mode || "public";
    const botJid = cleanJid(conn.user?.id);
    const fixedOwners = global.owner.map(([v]) => v.replace(/[^0-9]/g, "") + "@s.whatsapp.net");

    const sendDetect = async (groupId, text, mentions = []) => {
      await conn.sendMessage(groupId, {
        text,
        mentions,
        contextInfo: {
          mentionedJid: mentions
        }
      });
    };

    for (const update of updates) {
      const id = update?.id;
      if (!id) continue;

      const author = cleanJid(update.authorPn || update.author || "");
      const isCreator = fixedOwners.includes(author) || fixedOwners.includes(botJid);

      if (modo === "private" && !isCreator && author !== botJid) continue;

      const settings = (await db.query("SELECT detect FROM group_settings WHERE group_id = $1", [id])).rows[0] || { detect: true };
      if (!settings.detect) continue;

      let metadata = {};
      try {
        metadata = await getGroupMeta(conn, id, true);
      } catch {}

      const groupName = update.subject || metadata.subject || "Grupo";

      let message = "";
      if (typeof update.subject === "string") {
        message = `✏️ *Nombre del grupo actualizado*\n\nNuevo nombre:\n*${groupName}*`;
      } else if (typeof update.desc === "string") {
        message = `📝 *Descripción del grupo actualizada*\n\n${metadata.desc || update.desc || "Sin descripción"}`;
      } else if (update.picture) {
        message = `🖼️ *Foto del grupo actualizada*`;
      } else if (typeof update.restrict === "boolean") {
        message = update.restrict ? `🔒 *Modo edición cerrado*\n\nSolo admins pueden editar la info del grupo.` : `🔓 *Modo edición abierto*\n\nTodos pueden editar la info del grupo.`;
      } else if (typeof update.announce === "boolean") {
        message = update.announce ? `🔇 *Grupo cerrado*\n\nSolo admins pueden enviar mensajes.` : `🔊 *Grupo abierto*\n\nTodos pueden enviar mensajes.`;
      } else if (typeof update.memberAddMode === "boolean") {
        message = update.memberAddMode ? `✅ *Añadir miembros activado*\n\nTodos pueden añadir miembros al grupo.` : `🚫 *Añadir miembros desactivado*\n\nSolo admins pueden añadir miembros al grupo.`;
      } else if (typeof update.joinApprovalMode === "boolean") {
        message = update.joinApprovalMode ? `🛂 *Aprobación activada*\n\nLos nuevos miembros necesitan aprobación para entrar.` : `🚪 *Aprobación desactivada*\n\nLos nuevos miembros pueden entrar sin aprobación.`;
      } else if (update.inviteCode) {
        const link = `https://chat.whatsapp.com/${update.inviteCode}`;
        message = `🔗 *Nuevo enlace del grupo generado*\n\n${link}`;
      }

      if (!message) continue;
      await sendDetect(id, message, author ? [author] : []);
    }
  } catch (err) {
    console.error(chalk.red("❌ Error en groupsUpdate:"), err);
  }
}

export async function handleJoinRequest(conn, data) {
  try {
    const groupId = data.id || data.jid || data.groupJid;
    const participantsRaw = data.participants || data.participant || [];

    if (!groupId) return;

    const users = Array.isArray(participantsRaw) ? participantsRaw : [participantsRaw];
    if (!users.length) return;

    const myJid = (conn.user?.id || '').replace(/:\d+/, '');

    const res = await db.query(
      `SELECT auto_approve, antifake, antifake_prefixes, primary_bot
       FROM group_settings
       WHERE group_id = $1`,
      [groupId]
    );

    const settings = res.rows[0];
    if (!settings) return;

    let {
      auto_approve,
      antifake,
      antifake_prefixes = [],
      primary_bot
    } = settings;

    if (typeof antifake_prefixes === 'string') {
      try {
        antifake_prefixes = JSON.parse(antifake_prefixes);
      } catch {
        antifake_prefixes = antifake_prefixes.split(',').map(v => v.trim()).filter(Boolean);
      }
    }

    if (!Array.isArray(antifake_prefixes)) antifake_prefixes = [];

    if (primary_bot && primary_bot !== myJid) return;
    if (!auto_approve) return;

    for (const user of users) {
      const jid = user.jid || user.id || user.lid;
      const pn = user.pn || user.phoneNumber || user.phone_number;

      if (!jid) continue;

      const num = pn ? pn.replace(/[^0-9]/g, '') : jid.replace(/[^0-9]/g, '');

      if (antifake && num) {
        const blocked = antifake_prefixes.some(p => {
          const prefix = String(p).replace(/[^0-9]/g, '');
          return prefix && num.startsWith(prefix);
        });

        if (blocked) {
          console.log('🚫 AUTO-REJECT JOIN:', num || jid);
          await conn.groupRequestParticipantsUpdate(groupId, [jid], 'reject');
          continue;
        }
      }

      console.log('✅ AUTO-APPROVE JOIN:', num || jid);
      await conn.groupRequestParticipantsUpdate(groupId, [jid], 'approve');
    }
  } catch (err) {
    console.error('❌ Error en handleJoinRequest:', err);
  }
}

export async function callUpdate(conn, call) {
  try {
    const callerId = call.from;
    const botConfig = await getSubbotConfig(conn.user?.id);
    if (!botConfig.anti_call) return;
    await conn.sendMessage(callerId, { text: `🚫 Está prohibido hacer llamadas, serás bloqueado...` });
    await conn.updateBlockStatus(callerId, "block");
  } catch (err) {
    console.error(chalk.red("❌ Error en callUpdate:"), err);
  }
}

export async function handler(conn, m) {
  const chatId = m.key?.remoteJid || "";
  const botId = conn.user?.id;
  const botJid = cleanJid(botId);
  const isGroup = chatId.endsWith("@g.us");
  const nowTs = Date.now();

  const config = await getSubbotConfig(botId);
  info.wm = config.name ?? info.wm;
  info.img2 = config.logo_url ?? info.img2;

  if (nowTs - (chatSeen.get(chatId) || 0) > CHAT_TTL) {
    chatSeen.set(chatId, nowTs);
    try {
      await db.query(
        `INSERT INTO chats (id, is_group, timestamp, bot_id, joined)
         VALUES ($1, $2, $3, $4, true)
         ON CONFLICT (id) DO UPDATE SET timestamp = $3, bot_id = $4, joined = true`,
        [chatId, isGroup, nowTs, botJid.replace('@s.whatsapp.net', '')]
      );
    } catch (err) {
      console.error(err);
    }
  }

  const botType = conn === globalThis.conn ? "oficial" : "subbot";
  if (config.tipo !== botType) {
    try {
      await db.query(`UPDATE subbots SET tipo = $1 WHERE id = $2`, [botType, botJid]);
    } catch (err) {
      console.error(err);
    }
  }

  const prefijo = Array.isArray(config.prefix) ? config.prefix : [config.prefix];
  const modo = config.mode || "public";
  m.isGroup = isGroup;

  let rawSender = m.key?.participantAlt && m.key.participantAlt.endsWith("@s.whatsapp.net")
    ? m.key.participantAlt
    : (m.key?.participant || chatId);

    if (m.key?.fromMe) {
    rawSender = conn.user?.id || rawSender;
  }

  rawSender = cleanJid(rawSender);

  if (isGroup && rawSender.endsWith("@lid")) {
    rawSender = await resolveJid(conn, chatId, rawSender);
  }

  m.sender = rawSender;
  m.lid = cleanJid(m.key?.senderLid || m.lid || "");

  m.reply = async (text) => {
    return await conn.sendMessage(chatId, { text }, { quoted: m });
  };

  await smsg(conn, m);

  const hash = crypto.createHash("md5").update(m.key.id + (m.key.remoteJid || "")).digest("hex");
  if (processedMessages.has(hash)) return;
  processedMessages.add(hash);
  setTimeout(() => processedMessages.delete(hash), 60_000);

  if (isGroup) {
    const uniqueIds = [...new Set([
      m.sender,
      m.lid,
      m.key?.participant,
      m.key?.participantAlt,
      m.key?.senderLid
    ].filter(Boolean).map(cleanJid))].filter(v => v && v !== botJid);

    for (const userId of uniqueIds) {
      const key = `${userId}|${chatId}`;
      if (nowTs - (lastDbUpdate.get(key) || 0) > 9000) {
        lastDbUpdate.set(key, nowTs);

        db.query(
          `INSERT INTO messages (user_id, group_id, message_count)
           VALUES ($1, $2, 1)
           ON CONFLICT (user_id, group_id)
           DO UPDATE SET message_count = messages.message_count + 1`,
          [userId, chatId]
        ).catch(console.error);
      }
    }
  }

  const messageContent = m.message?.ephemeralMessage?.message || m.message?.viewOnceMessage?.message || m.message;
  let text = "";

  if (messageContent?.conversation) text = messageContent.conversation;
  else if (messageContent?.extendedTextMessage?.text) text = messageContent.extendedTextMessage.text;
  else if (messageContent?.imageMessage?.caption) text = messageContent.imageMessage.caption;
  else if (messageContent?.videoMessage?.caption) text = messageContent.videoMessage.caption;
  else if (messageContent?.buttonsResponseMessage?.selectedButtonId) text = messageContent.buttonsResponseMessage.selectedButtonId;
  else if (messageContent?.listResponseMessage?.singleSelectReply?.selectedRowId) text = messageContent.listResponseMessage.singleSelectReply.selectedRowId;
  else if (messageContent?.messageContextInfo?.quotedMessage) {
    const quoted = messageContent.messageContextInfo.quotedMessage;
    text = quoted?.conversation || quoted?.extendedTextMessage?.text || "";
  } else if (m.message?.conversation) {
    text = m.message.conversation;
  }

  m.originalText = text;
  text = text.trim();
  m.text = text;

  const usedPrefix = prefijo.find(p => text.startsWith(p)) || "";
  const withoutPrefix = text.slice(usedPrefix.length).trim();
  const [commandName, ...argsArr] = withoutPrefix.split(/[\n\s]+/);
  const command = (commandName || "").toLowerCase();
  const args = argsArr;

  text = args.join(" ").trim();
  m.text = withoutPrefix.slice(commandName.length).trimStart();

  const senderJid = cleanJid(m.sender);
  const isCreator = FIXED_OWNERS.includes(m.sender) ||
    global.owner.map(([v]) => v.replace(/[^0-9]/g, '') + '@s.whatsapp.net').includes(m.sender);
  const isOwner = isCreator || senderJid === botJid || (config.owners || []).includes(senderJid);

  let metadata = { participants: [] };
  if (isGroup) {
    try {
      metadata = await getGroupMeta(conn, chatId);
    } catch {
      metadata = { participants: [] };
    }
  }

  const participants = metadata.participants || [];

  const adminIds = participants
    .filter(p => p.admin === "admin" || p.admin === "superadmin")
    .flatMap(p => {
      const clean = cleanJid(p.id);
      return clean.endsWith("@lid")
        ? [clean, clean.replace("@lid", "@s.whatsapp.net")]
        : [clean, clean.replace("@s.whatsapp.net", "@lid")];
    });

  const uniqueSenderJids = [...new Set([
    m.user?.id,
    m.user?.lid,
    m.sender,
    m.lid
  ].filter(Boolean).map(cleanJid))];

  m.isAdmin = adminIds.some(adminJid => uniqueSenderJids.includes(adminJid));

  const botLid = cleanJid(conn.user?.lid);
  const botIsAdmin = adminIds.includes(botLid) || adminIds.includes(botJid);

  let gs = {};
  if (isGroup) {
    try {
      gs = (await db.query('SELECT * FROM group_settings WHERE group_id = $1', [chatId])).rows[0] || {};
    } catch (err) {
      console.error(err);
    }
  }

  if (isGroup && gs.antifake && m.sender?.endsWith("@s.whatsapp.net") && !m.isAdmin && !isOwner) {
    try {
      const phoneNumber = m.sender.split("@")[0].replace(/[^0-9]/g, "");
      if (botIsAdmin && isFakeNumber(phoneNumber, parsePrefixes(gs.antifake_prefixes))) {
        await conn.sendMessage(chatId, { text: `⚠️ @${phoneNumber} En este grupo no está permitido el ingreso de números con prefijos prohibidos, será expulsado...`, mentions: [m.sender] });
        await conn.groupParticipantsUpdate(chatId, [m.sender], "remove");
        return;
      }
    } catch (err) {
      console.error(err);
    }
  }

  if (isGroup && !isCreator && senderJid !== botJid) {
    try {
      if (gs.banned) return;

      const primaryBot = gs.primary_bot;
      if (primaryBot && !m.isAdmin && participants.length > 0) {
        const botExists = participants.some(p => p.id === primaryBot);

        if (!botExists) {
          await db.query('UPDATE group_settings SET primary_bot = NULL WHERE group_id = $1', [chatId]);
        } else {
          const currentBotJid = botJid + "@s.whatsapp.net";
          const expected = primaryBot.replace(/:\d+/, "");
          if (!currentBotJid.includes(expected)) return;
        }
      }
    } catch (err) {
      console.error(err);
    }
  }

  try {
    const onlyNum = (jid = "") => String(jid || "").split("@")[0].replace(/[^0-9]/g, "");
    const key = m.key || {};

    const possiblePhone = [
      key.participantAlt,
      key.remoteJidAlt,
      key.participant,
      key.remoteJid
    ].filter(v => typeof v === "string" && v.endsWith("@s.whatsapp.net")).map(cleanJid);

    const possibleLid = [
      key.senderLid,
      key.participant,
      key.remoteJid,
      key.participantAlt,
      key.remoteJidAlt
    ].filter(v => typeof v === "string" && v.endsWith("@lid")).map(cleanJid);

    const phoneJid = possiblePhone[0] || (
      m.sender?.endsWith("@s.whatsapp.net") ? cleanJid(m.sender) : ""
    );

    const lidJid = possibleLid[0] || (
      m.lid?.endsWith("@lid") ? cleanJid(m.lid) : ""
    );

    const finalId = phoneJid || cleanJid(m.sender || key.remoteJid || "");
    const finalLid = lidJid || null;
    const finalNum = onlyNum(phoneJid || finalId) || null;
    const userName = m.pushName || "sin name";

    if (!finalId || !finalId.includes("@")) return;

    m.sender = finalId;
    m.lid = finalLid || "";

    const cached = userCache.get(finalId);
    const changed = !cached ||
      cached.nombre !== userName ||
      cached.num !== finalNum ||
      cached.lid !== finalLid ||
      Date.now() - cached.t > USER_TTL;

    if (changed) {
      await db.query(
        `INSERT INTO usuarios (id, nombre, num, lid, registered)
     VALUES ($1, $2, $3, $4, true)
     ON CONFLICT (id) DO NOTHING`,
        [finalId, userName, finalNum, finalLid]
      );

      await db.query(
        `UPDATE usuarios SET nombre = $1, num = $2 WHERE id = $3`,
        [userName, finalNum, finalId]
      );

      if (finalLid) {
        const old = await db.query(`SELECT id FROM usuarios WHERE lid = $1`, [finalLid]);

        for (const row of old.rows || []) {
          if (row.id && row.id !== finalId) {
            await db.query(`UPDATE usuarios SET lid = NULL WHERE id = $1`, [row.id]);
          }
        }

        await db.query(`UPDATE usuarios SET lid = $1 WHERE id = $2`, [finalLid, finalId]);
      }

      userCache.set(finalId, { nombre: userName, num: finalNum, lid: finalLid, t: Date.now() });
    }
  } catch (err) {
    console.error("❌ Error guardando usuario/lid:", err);
  }

  const plugins = Object.values(global.plugins || {});

  if (modo === "private" && senderJid !== botJid && !isCreator) return;

  const matchedPlugin = plugins.find(p => {
    const raw = m.originalText;
    return typeof p.customPrefix === 'function'
      ? p.customPrefix(raw)
      : p.customPrefix instanceof RegExp
        ? p.customPrefix.test(raw) : false;
  });

  if (!usedPrefix) {
    if (!matchedPlugin || !matchedPlugin.customPrefix) return;
  }

  const isROwner = FIXED_OWNERS.includes(m.sender);

  let banResult = null;
  const isUserBanned = async () => {
    if (banResult !== null) return banResult;
    banResult = false;
    try {
      let senderId = m.sender || m.key?.participant || "";

      if (senderId.endsWith("@lid") && m.key?.participantAlt && m.key.participantAlt.endsWith("@s.whatsapp.net")) {
        senderId = m.key.participantAlt;
      }

      senderId = cleanJid(senderId);

      if (senderId !== botJid) {
        const resBan = await db.query("SELECT banned, razon_ban, avisos_ban FROM usuarios WHERE id = $1", [senderId]);
        if (resBan.rows[0]?.banned) {
          banResult = true;
          const avisos = resBan.rows[0]?.avisos_ban || 0;
          if (avisos < 3) {
            const nuevoAviso = avisos + 1;
            await db.query("UPDATE usuarios SET avisos_ban = $2 WHERE id = $1", [senderId, nuevoAviso]);
            const razon = resBan.rows[0]?.razon_ban?.trim() || "Spam";
            await conn.sendMessage(chatId, { text: `⚠️ ESTAS BANEADO ⚠️\n*• Motivo:* ${razon} (avisos: ${nuevoAviso}/3)\n*👉🏻 Puedes contactar al propietario del Bot si crees que se trata de un error o para charlar sobre tu desbaneo*\n\n👉 ${info.fb}`, contextInfo: { mentionedJid: [senderId] } }, { quoted: m });
          }
        }
      }
    } catch (e) {
      console.error("❌ Error al verificar baneo:", e);
    }
    return banResult;
  };

  for (const plugin of plugins) {
    let match = false;

    if (plugin.command instanceof RegExp) {
      match = plugin.command.test(command);
    } else if (typeof plugin.command === 'string') {
      match = plugin.command.toLowerCase() === command;
    } else if (Array.isArray(plugin.command)) {
      match = plugin.command.map(c => c.toLowerCase()).includes(command);
    }

    if (!match && plugin.customPrefix) {
      const input = m.originalText;
      if (typeof plugin.customPrefix === 'function') {
        match = plugin.customPrefix(input);
      } else if (plugin.customPrefix instanceof RegExp) {
        match = plugin.customPrefix.test(input);
      }
    }

    if (!match) continue;

    if (gs.modoadmin && isGroup && !m.isAdmin && !isOwner) return;

    if (isGroup && plugin.tags?.includes('nsfw') && !gs.nsfw) {
      await m.reply(`🔞 Los comandos NSFW están desactivados en este grupo.\nUn admin puede activarlos con *${usedPrefix}nsfw on*`);
      continue;
    }

    if (await isUserBanned()) return;

    if (plugin.owner && !isOwner) return m.reply("⚠️ Tu que? no eres mi propietario para venir a dame orden 🙄, solo el dueño del sub-bot o el owner puede usar este comando.");
    if (plugin.rowner && !isROwner) return m.reply("⚠️ Tu que? no eres mi propietario para venir a dame orden 🙄.");
    if (plugin.admin && !m.isAdmin) return m.reply("🤨 No eres admins. Solo los admins pueden usar este comando.");
    if (plugin.botAdmin && !botIsAdmin) return m.reply(`⚠️ haz admin al Bot "YO" para poder usar este comando.`);
    if (plugin.group && !isGroup) return m.reply("⚠️ Estos es un grupo?, este comando solo funciona el grupo");
    if (plugin.private && isGroup) return m.reply("⚠️ Este comando solo funciona el pv");

    try {
      if (plugin.limit) {
        const res = await db.query('SELECT limite FROM usuarios WHERE id = $1', [m.sender]);
        if ((res.rows[0]?.limite ?? 0) < plugin.limit) {
          return m.reply("*⚠ 𝐒𝐮𝐬 𝐝𝐢𝐚𝐦𝐚𝐧𝐭𝐞 💎 𝐬𝐞 𝐡𝐚𝐧 𝐚𝐠𝐨𝐭𝐚𝐝𝐨 𝐩𝐮𝐞𝐝𝐞 𝐜𝐨𝐦𝐩𝐫𝐚𝐫 𝐦𝐚𝐬 𝐮𝐬𝐚𝐧𝐝𝐨 𝐞𝐥 𝐜𝐨𝐦𝐚𝐧𝐝𝐨:* #buy.");
        }
      }

      if (plugin.money) {
        const res = await db.query('SELECT money FROM usuarios WHERE id = $1', [m.sender]);
        if ((res.rows[0]?.money ?? 0) < plugin.money) {
          return m.reply("*NO TIENE SUFICIENTES LOLICOINS 🪙*");
        }
      }

      if (plugin.level) {
        const res = await db.query('SELECT level FROM usuarios WHERE id = $1', [m.sender]);
        const nivel = res.rows[0]?.level ?? 0;
        if (nivel < plugin.level) {
          return m.reply(`*⚠️ 𝐍𝐞𝐜𝐞𝐬𝐢𝐭𝐚 𝐞𝐥 𝐧𝐢𝐯𝐞𝐥 ${plugin.level}, 𝐩𝐚𝐫𝐚 𝐩𝐨𝐝𝐞𝐫 𝐮𝐬𝐚𝐫 𝐞𝐬𝐭𝐞 𝐜𝐨𝐦𝐚𝐧ᵈ𝐨, 𝐓𝐮 𝐧𝐢𝐯𝐞𝐥 𝐚𝐜𝐭𝐮𝐚𝐥 𝐞𝐬:* ${nivel}`);
        }
      }

      logCommand({
        conn,
        sender: m.sender,
        chatId: m.chat,
        isGroup: m.isGroup,
        command: command,
        timestamp: new Date()
      });

      await plugin(m, { conn, text, args, usedPrefix, command, participants, metadata, isOwner, isROwner, isAdmin: m.isAdmin, isBotAdmin: botIsAdmin, isGroup });

      if (plugin.limit) {
        await db.query('UPDATE usuarios SET limite = limite - $1 WHERE id = $2', [plugin.limit, m.sender]);
        await m.reply(`*${plugin.limit} diamante 💎 usado${plugin.limit > 1 ? 's' : ''}.*`);
      }

      if (plugin.money) {
        await db.query('UPDATE usuarios SET money = money - $1 WHERE id = $2', [plugin.money, m.sender]);
        await m.reply(`*${plugin.money} LoliCoins usado${plugin.money > 1 ? 's' : ''} 🪙*`);
      }

      await db.query(
        `INSERT INTO stats (command, count)
         VALUES ($1, 1)
         ON CONFLICT (command) DO UPDATE SET count = stats.count + 1`,
        [command]
      );

    } catch (e) {
      if (typeof e === 'string') {
        await m.reply(e);
        return;
      }
      console.error(chalk.red(`❌ Error al ejecutar ${command}: ${e}`));
      m.reply("❌ Error ejecutando el comando, reporte este error a mi creador con el comando: /report\n\n" + (e?.message || e));
    }
  }
}

addInterval(async () => {
  try {
    let conn = global.conn || globalThis.conn;
    if (!conn || typeof conn.groupLeave !== 'function') return;
    const { rows } = await db.query("SELECT group_id, expired FROM group_settings WHERE expired IS NOT NULL AND expired > 0 AND expired < $1", [Date.now()]);

    for (let { group_id } of rows) {
      try {
        await conn.sendMessage(group_id, { text: [`*${conn.user.name}*,ᴹᵉ ᵛᵒʸ ᵈᵉˡ ᵉˡ ᵍʳᵘᵖᵒ ᶠᵘᵉ ᵘⁿ ᵍᵘˢᵗᵒ ᵉˢᵗᵃ ᵃᵠᵘᶦ́ ˢᶦ ᵠᵘᶦᵉʳᵉˢ ᵠᵘᵉ ᵛᵘᵉˡᵛᵃ ᵁˢᵉʳ ᵈᵉ ⁿᵘᵉᵛᵒ ᵉˡ ᶜᵒᵐᵃⁿᵈᵒ`, `Bueno me voy de este grupo de mrd, no me agregue a grupo ptm`, `*${conn.user.name}*, me voy de este grupito culiado nada interesante yo queria ver teta y son puro gays aca 🤣`].getRandom() });
        await new Promise(r => setTimeout(r, 3000));
        await conn.groupLeave(group_id);
        await db.query("UPDATE group_settings SET expired = NULL WHERE group_id = $1", [group_id]);
        console.log(`[AUTO-LEAVE] Bot salió automáticamente del grupo: ${group_id}`);
      } catch (e) {
        console.error(`❌ Error en auto-leave (${group_id}):`, e.message);
      }
    }
  } catch (e) {
    console.error("❌ Error revisando grupos expirados:", e.message);
  }
}, 60_000);

addInterval(async () => {
  try {
    const { rows } = await db.query(`SELECT chat_memory.chat_id, chat_memory.updated_at,
             COALESCE(group_settings.memory_ttl, 86400) AS memory_ttl
      FROM chat_memory
      JOIN group_settings ON chat_memory.chat_id = group_settings.group_id
      WHERE group_settings.memory_ttl > 0
    `);

    const now = Date.now();
    for (const row of rows) {
      const { chat_id, updated_at, memory_ttl } = row;
      const lastUpdated = new Date(updated_at).getTime();
      const ttl = memory_ttl * 1000;

      if (now - lastUpdated > ttl) {
        await db.query("DELETE FROM chat_memory WHERE chat_id = $1", [chat_id]);
        console.log(`🧹 Memoria del grupo ${chat_id} eliminada automáticamente`);
      }
    }
  } catch (err) {
    console.error("❌ Error limpiando memorias expiradas:", err);
  }
}, 300_000);

addInterval(() => {
  const now = Date.now();
  for (const [k, t] of lastDbUpdate) if (now - t > 60_000) lastDbUpdate.delete(k);
  for (const [k, t] of chatSeen) if (now - t > CHAT_TTL) chatSeen.delete(k);
  for (const [k, v] of userCache) if (now - v.t > USER_TTL) userCache.delete(k);
  for (const [k, v] of groupMetaCache) if (now - v.t > META_TTL) groupMetaCache.delete(k);
}, 600_000);

let file = fileURLToPath(import.meta.url);
watchFile(file, () => {
  unwatchFile(file);
  console.log(chalk.redBright('Update \'handler.js\''));
  import(`${file}?update=${Date.now()}`);
});
                                  
