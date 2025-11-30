require('dotenv').config();
const tmi = require('tmi.js');
const { Client } = require('pg');

const BOT_USERNAME = process.env.TWITCH_BOT_USERNAME;   // mich_botsito
const CHANNEL = process.env.TWITCH_CHANNEL;             // mich_patitas0w0
const OAUTH_TOKEN = process.env.TWITCH_OAUTH_TOKEN;     // oauth:xxxxx
const DATABASE_URL = process.env.DATABASE_URL || null;  // Railway Postgres

const MAX_MESSAGES = 50000;
const RANDOM_TALK_PROBABILITY = 0.15; // 15%

// Usuarios/bots a ignorar
const IGNORE_USERS = [
  'streamelements',
  'streamelementa',
  'nightbot'
];

let dbClient = null;
const useDb = !!DATABASE_URL;

// Configuración TMI
const client = new tmi.Client({
  options: { debug: true },
  connection: { secure: true, reconnect: true },
  identity: {
    username: BOT_USERNAME,
    password: OAUTH_TOKEN
  },
  channels: [CHANNEL]
});

// In-memory fallback (si no hay DB)
const memoryMessages = [];

// ---------- DB: inicialización ----------
async function initDb() {
  if (!useDb) {
    console.log('DATABASE_URL no configurado, usando memoria (no persistente).');
    return;
  }

  dbClient = new Client({ connectionString: DATABASE_URL });
  await dbClient.connect();

  await dbClient.query(`
    CREATE TABLE IF NOT EXISTS messages (
      id SERIAL PRIMARY KEY,
      text TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  console.log('Base de datos lista.');
}

// Guarda mensaje en DB o memoria
async function storeMessage(text) {
  const clean = text.trim();
  if (!clean) return;

  if (useDb) {
    // Insertar mensaje
    await dbClient.query(
      'INSERT INTO messages (text) VALUES ($1)',
      [clean]
    );
    // Mantener solo los últimos MAX_MESSAGES
    await dbClient.query(
      `
      DELETE FROM messages
      WHERE id NOT IN (
        SELECT id FROM messages
        ORDER BY id DESC
        LIMIT $1
      )
      `,
      [MAX_MESSAGES]
    );
  } else {
    // Modo memoria
    memoryMessages.push(clean);
    if (memoryMessages.length > MAX_MESSAGES) {
      memoryMessages.shift();
    }
  }
}

// Obtiene un mensaje aleatorio
async function getRandomMessage() {
  if (useDb) {
    const result = await dbClient.query(
      'SELECT text FROM messages ORDER BY RANDOM() LIMIT 1'
    );
    if (result.rowCount === 0) return null;
    return result.rows[0].text;
  } else {
    if (memoryMessages.length === 0) return null;
    const idx = Math.floor(Math.random() * memoryMessages.length);
    return memoryMessages[idx];
  }
}

// ---------- Lógica principal ----------
client.on('connected', () => {
  console.log(`Conectado como ${BOT_USERNAME} en #${CHANNEL}`);
});

client.on('message', async (channel, tags, message, self) => {
  try {
    if (self) return;

    const username = (tags.username || '').toLowerCase();
    const raw = (message || '').trim();
    const lower = raw.toLowerCase();
    const botLower = BOT_USERNAME.toLowerCase();

    // 1) Ignorar bots específicos
    if (IGNORE_USERS.includes(username)) return;

    // 2) Ignorar comandos tipo "!algo"
    if (raw.startsWith('!')) return;

    // 3) Ver si mencionan al bot
    const isMentioningBot =
      lower.includes(botLower) ||
      lower.includes(`@${botLower}`);

    // 4) Si NO lo mencionan, aprendemos el mensaje
    if (!isMentioningBot && raw.length > 0) {
      await storeMessage(raw);

      // 5) Probabilidad de hablar solo (15%)
      if (Math.random() < RANDOM_TALK_PROBABILITY) {
        const randomMsg = await getRandomMessage();
        if (randomMsg) {
          client.say(channel, randomMsg);
        }
      }
    }

    // 6) Si lo mencionan, responde SIEMPRE
    if (isMentioningBot) {
      const reply = await getRandomMessage();
      if (reply) {
        client.say(channel, reply);
      } else {
        client.say(channel, 'Todavía no he aprendido mucho, uwu.');
      }
    }

  } catch (err) {
    console.error('Error en handler de mensaje:', err);
  }
});

// ---------- Arranque ----------
async function main() {
  await initDb();
  await client.connect();
}

main().catch(err => {
  console.error('Error al iniciar el bot:', err);
});
