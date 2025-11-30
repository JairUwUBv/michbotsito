const tmi = require('tmi.js');

// 👇 RELLENA ESTO CON TUS DATOS
const BOT_USERNAME = 'mich_botsito';        // ej: 'mich_botsito'
const OAUTH_TOKEN  = 'oauth:v7tc0ddw5lu0dp2bhigldvlmfdys6m';         // debe empezar con oauth:
const CHANNEL_NAME = 'mich_patitas0w0';                 // ej: 'jair123'

// Memoria del bot: cosas que lee del chat
const memoriaChat = [];
const LIMITE_MEMORIA = 30000;

// Guarda mensajes del chat, excepto los que mencionan al bot
function aprender(msg, lower, botLower) {
  if (msg.length < 2) return;
  if (msg.startsWith('!')) return;           // no comandos (!)
  if (lower.includes('@' + botLower)) return; // ❌ NO aprender mensajes que mencionen al bot

  // ✔️ Sí guarda preguntas con '?'
  memoriaChat.push(msg);
  if (memoriaChat.length > LIMITE_MEMORIA) {
    memoriaChat.shift();
  }
}

// Escoge una frase al azar de la memoria
function fraseAprendida() {
  if (memoriaChat.length === 0) return null;
  const idx = Math.floor(Math.random() * memoriaChat.length);
  return memoriaChat[idx];
}

const client = new tmi.Client({
  identity: {
    username: BOT_USERNAME,
    password: OAUTH_TOKEN
  },
  channels: [ CHANNEL_NAME ],
  options: { debug: true }
});

client.connect();

client.on('message', (channel, tags, message, self) => {
  if (self) return;

  const msg = message.trim();
  const lower = msg.toLowerCase();
  const botLower = BOT_USERNAME.toLowerCase();

  // 👇 Aprender mensajes (menos los que mencionen al bot)
  aprender(msg, lower, botLower);

  // Si mencionan al bot → responde con algo aprendido
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