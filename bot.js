const tmi = require('tmi.js');

// ⚙️ Configuración: usa variables de entorno (Railway)
const BOT_USERNAME = process.env.BOT_USERNAME || 'mich_botsito';
const OAUTH_TOKEN  = process.env.OAUTH_TOKEN  || 'oauth:TOKEN_AQUI';
const CHANNEL_NAME = process.env.CHANNEL_NAME || 'mich_patitas0w0';

// Memoria del bot
const memoriaChat = [];
const LIMITE_MEMORIA = 30000; // Máxima cantidad de mensajes que recuerda

// Guarda mensajes del chat, con filtros + memoria rotativa
function aprender(msg, lower, botLower) {
  if (msg.length < 2) return;

  // No aprender comandos tipo !comando
  if (msg.startsWith('!')) return;

  // No aprender mensajes que mencionan al bot
  if (lower.includes('@' + botLower)) return;

  // Guardar mensaje
  memoriaChat.push(msg);

  // 🧹 BORRAR MENSAJES MÁS ANTIGUOS CUANDO SE LLENE LA MEMORIA
  while (memoriaChat.length > LIMITE_MEMORIA) {
    memoriaChat.shift();
  }
}

// Devuelve un mensaje random de la memoria
function fraseAprendida() {
  if (memoriaChat.length === 0) return null;
  const idx = Math.floor(Math.random() * memoriaChat.length);
  return memoriaChat[idx];
}

// Cliente del bot
const client = new tmi.Client({
  identity: {
    username: BOT_USERNAME,
    password: OAUTH_TOKEN
  },
  channels: [ CHANNEL_NAME ],
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

  // Probabilidad de hablar solo (5%)
  const probHablarSolo = 0.05;
  
  if (Math.random() < probHablarSolo && memoriaChat.length > 0) {
    const frase = fraseAprendida();
    client.say(channel, frase);
  }
});
