const fs = require('fs');
const tmi = require('tmi.js');

// ⚙️ Configuración: usa variables de entorno (Railway) o valores por defecto
const BOT_USERNAME = process.env.BOT_USERNAME || 'mich_botsito';
const OAUTH_TOKEN  = process.env.OAUTH_TOKEN  || 'oauth:TOKEN_AQUI';
const CHANNEL_NAME = process.env.CHANNEL_NAME || 'mich_patitas0w0';

// Memoria del bot
const memoriaChat = [];
const LIMITE_MEMORIA = 5000;           // Máxima cantidad de mensajes que recuerda
const PATH_MEMORIA = './memoria.json'; // Archivo donde guardamos la memoria

// Cargar memoria desde archivo (si existe y está bien)
function cargarMemoria() {
  if (!fs.existsSync(PATH_MEMORIA)) {
    console.log('No hay memoria previa, empezando desde cero.');
    return;
  }

  try {
    const data = fs.readFileSync(PATH_MEMORIA, 'utf8');

    // Si el archivo está vacío o solo espacios, lo ignoramos
    if (!data || !data.trim()) {
      console.log('memoria.json está vacío, empezando limpio.');
      return;
    }

    const arr = JSON.parse(data);

    if (Array.isArray(arr)) {
      const recortado = arr.slice(-LIMITE_MEMORIA);
      memoriaChat.push(...recortado);
      console.log(`Memoria cargada: ${memoriaChat.length} mensajes.`);
    } else {
      console.log('memoria.json no tiene un array válido, ignorando.');
    }
  } catch (err) {
    console.error('Error al cargar memoria, borrando archivo dañado:', err);
    try {
      fs.unlinkSync(PATH_MEMORIA);
      console.log('memoria.json dañado eliminado.');
    } catch (e) {
      console.error('No se pudo borrar memoria.json:', e);
    }
  }
}

// Guardar memoria en archivo
function guardarMemoria() {
  try {
    const data = JSON.stringify(memoriaChat, null, 2);
    fs.writeFile(PATH_MEMORIA, data, (err) => {
      if (err) console.error('Error al guardar memoria:', err);
    });
  } catch (err) {
    console.error('Error al preparar memoria para guardar:', err);
  }
}

// Guarda mensajes del chat, con filtros + memoria rotativa
function aprender(msg, lower, botLower) {
  if (msg.length < 2) return;

  // No aprender comandos tipo !comando
  if (msg.startsWith('!')) return;

  // No aprender mensajes que mencionen al bot (@mich_botsito)
  if (lower.includes('@' + botLower)) return;

  memoriaChat.push(msg);

  // Borrar mensajes antiguos si nos pasamos del límite
  while (memoriaChat.length > LIMITE_MEMORIA) {
    memoriaChat.shift();
  }

  // Guardar en disco después de aprender
  guardarMemoria();
}

// Devuelve un mensaje random de la memoria
function fraseAprendida() {
  if (memoriaChat.length === 0) return null;
  const idx = Math.floor(Math.random() * memoriaChat.length);
  return memoriaChat[idx];
}

// Cargar memoria al iniciar
cargarMemoria();

// Cliente del bot
const client = new tmi.Client({
  identity: {
    username: BOT_USERNAME,
    password: OAUTH_TOKEN
  },
  channels: [CHANNEL_NAME],
  options: { debug: true }
});

client.connect();

// Evento de mensaje
client.on('message', (channel, tags, message, self) => {
  if (self) return;

  // IGNORAR MENSAJES DE OTROS BOTS
  const username = (tags.username || '').toLowerCase();
  const botsIgnorados = ['nightbot', 'streamelements'];
  if (botsIgnorados.includes(username)) return;

  const msg = message.trim();
  const lower = msg.toLowerCase();
  const botLower = BOT_USERNAME.toLowerCase();

  // Aprender del mensaje
  aprender(msg, lower, botLower);

  // Si mencionan al bot → responder con algo aprendido
  if (lower.includes('@' + botLower)) {
    const frase = fraseAprendida();
    if (frase) client.say(channel, frase);
    return;
  }

  // Probabilidad de hablar solo (15%)
  const probHablarSolo = 0.15;

  if (Math.random() < probHablarSolo && memoriaChat.length > 0) {
    const frase = fraseAprendida();
    client.say(channel, frase);
  }
});

// Log de avisos de Twitch (para ver si bloquea mensajes del bot)
client.on('notice', (channel, msgid, message) => {
  console.log('[NOTICE]', channel, msgid, message);
});




