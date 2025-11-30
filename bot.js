const tmi = require('tmi.js');

// 👇 RELLENA ESTO CON TUS DATOS
const BOT_USERNAME = 'mich_botsito';        // ej: 'mich_botsito'
const OAUTH_TOKEN  = 'oauth:v7tc0ddw5lu0dp2bhigldvlmfdys6m';         // debe empezar con oauth:
const CHANNEL_NAME = 'mich_patitas0w0';                 // ej: 'jair123'

// Memoria del bot: cosas que lee del chat
const memoriaChat = [];
const LIMITE_MEMORIA = 30000;

// Guarda mensajes del chat, con filtros
function aprender(msg, lower, botLower) {
  if (msg.length < 2) return;

  // No aprender comandos tipo !algo
  if (msg.startsWith('!')) return;

  // No aprender mensajes que mencionen al bot (@mich_botsito)
  if (lower.includes('@' + botLower)) return;

  memoriaChat.push(msg);

  // Si se pasa del límite, borrar los más viejos
  if (memoriaChat.length > LIMITE_MEMORIA) {
    memoriaChat.shift();
  }
}

// Devuelve un mensaje al azar de lo que ya aprendió
function fraseAprendida() {
  if (memoriaChat.length === 0) return null;
  const idx = Math.floor(Math.random() * memoriaChat.length);
  return memoriaChat[idx];
}

// Cliente de Twitch
const client = new tmi.Client({
  identity: {
    username: BOT_USERNAME,
    password: OAUTH_TOKEN
  },
  channels: [ CHANNEL_NAME ],
  options: { debug: true }
});

client.connect();

// Evento: cuando llega un mensaje al chat
client.on('message', (channel, tags, message, self) => {
  if (self) return;

  // Ignorar otros bots (Nightbot, StreamElements)
  const usernameRaw = tags.username || '';
  const username = usernameRaw.toLowerCase();
  const botsIgnorados = ['nightbot', 'streamelements'];

  if (botsIgnorados.includes(username)) {
    return; // no aprende ni responde a estos bots
  }

  const msg = message.trim();
  const lower = msg.toLowerCase();
  const botLower = BOT_USERNAME.toLowerCase();

  // Aprender del mensaje (ya filtrado)
  aprender(msg, lower, botLower);

  // Si mencionan al bot, responder con algo que ya aprendió
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

  if (Math.random() < probHablarSolo && memoriaChat.length > 0) {
    const frase = fraseAprendida();
    client.say(channel, frase);
  }

});
