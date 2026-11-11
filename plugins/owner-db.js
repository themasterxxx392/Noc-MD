import { db } from '../lib/postgres.js';

let handler = async (m, { conn, args, isOwner, command }) => {
  const subcmd = args[0]?.toLowerCase();

  switch (subcmd) {
    case 'info': {
      try {
        const [usuarios, registrados, chats, grupos, mensajes, tablasRes, totalSize] = await Promise.all([
          db.query('SELECT COUNT(*) FROM usuarios'),
          db.query('SELECT COUNT(*) FROM usuarios WHERE registered = true'),
          db.query('SELECT COUNT(*) FROM chats'),
          db.query("SELECT COUNT(*) FROM group_settings WHERE welcome IS NOT NULL"),
          db.query('SELECT SUM(message_count) FROM messages'),
          db.query(`
            SELECT relname AS tabla, n_live_tup AS filas,
                   pg_size_pretty(pg_total_relation_size(relid)) AS tamaño
            FROM pg_stat_user_tables ORDER BY pg_total_relation_size(relid) DESC;
          `),
          db.query(`
            SELECT pg_size_pretty(SUM(pg_total_relation_size(relid))) AS total
            FROM pg_stat_user_tables;
          `)
        ]);

        const text = [
          `📊 *\`ESTADÍSTICAS DE BASE DE DATOS\`*`,
          `> 👤 Usuarios: *${usuarios.rows[0].count}*`,
          `> ✅ Registrados: *${registrados.rows[0].count}*`,
          `> 💬 Chats totales: *${chats.rows[0].count}*`,
          `> 💾 Tamaño total DB: *${totalSize.rows[0].total}*`,
          `\n📁 *\`TAMAÑO POR TABLA:\`*`,
          ...tablasRes.rows.map(r => `• *${r.tabla}*: ${r.filas} filas — ${r.tamaño}`)
        ].join('\n');

        await m.reply(text);
      } catch (e) {
        console.error('[❌] /db info error:', e);
        await m.reply('❌ Error al consultar la base de datos.');
      }
      break;
    }

    case 'optimizar': {
      try {
        const inicio = Date.now();
        await db.query('VACUUM FULL;');
        const tiempo = ((Date.now() - inicio) / 1000).toFixed(2);
        await m.reply(`✅ *Optimización completada.*\n📉 Se ejecutó *VACUUM FULL*\n⏱️ Duración: *${tiempo} segundos*`);
      } catch (e) {
        console.error('[❌] Error en optimizar:', e);
        await m.reply('❌ No se pudo optimizar.');
      }
      break;
    }

    default:
      await m.reply(`❓ Usa uno de estos subcomandos:

• /db info — ver estadísticas
• /db optimizar — VACUUM FULL`);
  }
};

handler.help = ['db info', 'db optimizar', 'db borrar', 'db crear'];
handler.tags = ['owner'];
handler.command = /^(db)$/i;
handler.owner = true;

export default handler;
