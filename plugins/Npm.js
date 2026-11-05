import { exec } from 'child_process'

const handler = async (m, { conn, args, text, usedPrefix, command }) => {
  if (!args[0] || !args[1]) {
    return conn.reply(m.key.remoteJid, `⚠️ Uso incorrecto del comando.\n\nEjemplos:\n*${usedPrefix + command} i sharp* (para instalar)\n*${usedPrefix + command} un sharp* (para desinstalar)`, m);
  }

  const action = args[0].toLowerCase();
  const packageName = args[1];

  let npmCommand = '';
  let actionName = '';

  if (['i', 'install', 'add'].includes(action)) {
    npmCommand = `npm i ${packageName}`;
    actionName = 'instalar';
  } else if (['un', 'uninstall', 'remove', 'eliminar'].includes(action)) {
    npmCommand = `npm uninstall ${packageName}`;
    actionName = 'desinstalar';
  } else {
    return conn.reply(m.key.remoteJid, `❌ Acción no válida. Usa *i* para instalar o *un* para desinstalar.\n\nEjemplo: *${usedPrefix + command} i sharp*`, m);
  }

  await m.reply(`⏳ Procediendo a ${actionName} el paquete *${packageName}*, por favor espera un momento...`);

  exec(npmCommand, (error, stdout, stderr) => {
    if (error) {
      console.error(error);
      return m.reply(`❌ Ocurrió un error al ${actionName} *${packageName}*:\n\n\`\`\`${error.message}\`\`\``);
    }
    
    m.reply(`✅ ¡Paquete *${packageName}* ${actionName === 'instalar' ? 'instalado' : 'desinstalado'} con éxito!\n\n\`\`\`${stdout}\`\`\`\n💡 *Nota:* Recuerda reiniciar el bot si es necesario para aplicar los cambios.`);
  });
}

handler.help = ['npm <i/un> <paquete>']
handler.tags = ['owner']
handler.command = /^(npm|paquete|lib)$/i
handler.rowner = true

export default handler
