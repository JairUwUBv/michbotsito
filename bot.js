const fs = require('fs');
const tmi = require('tmi.js');
const { Client } = require('pg');

// ⚙️ Configuración: variables de entorno (Railway)
const BOT_USERNAME = process.env.BOT_USERNAME || 'mich_botsito';
const OAUTH_TOKEN  = process.env.OAUTH_TOKEN  || 'oauth:TOKEN_AQUI';
const CHANNEL_NAME = process.env.CHANNEL_NAME || 'mich_patitas0w0';
const DATABASE_URL = process.env.DATABASE_URL || null;

// Memoria del bot en RAM
const memoriaChat = [];
const LIMITE_MEMORIA = 20000;              // Máxima cantidad de mensajes que recuerda
const PATH_MEMORIA = './memoria.json';    // Archivo local para desarrollo

// --- Configuración DB ---
let dbClient = null;
let usaDB = false;

// 🗃️ Inicializar conexión a la base de datos (si existe DATABASE_URL)
function initDB() {
  if (!DATABASE_URL) {
    console.log('DATABASE_URL no configurado, usando memoria en archivo (no persistente en Railway).');
    cargarMemoriaDesdeArchivo();
    return;
  }

  dbClient = new Client({
    connectionString: DATABASE_URL,
    ssl: {
      rejectUnauthorized: false // necesario en muchos hostings
    }
  });

  dbClient.connect((err) => {
    if (err) {
      console.error('Error al conectar a la base de datos, usando archivo:', err);
      cargarMemoriaDesdeArchivo();
      return;
    }

    console.log('✅ Conectado a la base de datos.');
    usaDB = true;

    // Crear tabla si no existe
    const createTableSQL = `
      CREATE TABLE IF NOT EXISTS mensajes (
        id SERIAL PRIMARY KEY,
        texto TEXT NOT NULL,
        creado_en TIMESTAMPTZ DEFAULT NOW()
      );
    `;

    dbClient.query(createTableSQL, (err2) => {
      if (err2) {
        console.error('Error al crear/verificar tabla mensajes, usando archivo:', err2);
        usaDB = false;
        cargarMemoriaDesdeArchivo();
        return;
      }

      console.log('Tabla mensajes lista.');
      cargarMemoriaDesdeDB();
    });
  });
}

// 📥 Cargar memoria desde archivo local (para desarrollo o respaldo)
function cargarMemoriaDesdeArchivo() {
  if (!fs.existsSync(PATH_MEMORIA)) {
    console.log('No hay memoria previa en archivo, empezando desde cero.');
    return;
  }

  try {
    const data = fs.readFileSync(PATH_MEMORIA, 'utf8');

    if (!data || !data.trim()) {
      console.log('memoria.json está vacío, empezando limpio.');
      return;
    }

    const arr = JSON.parse(data);

    if (Array.isArray(arr)) {
      const recortado = arr.slice(-LIMITE_MEMORIA);
      memoriaChat.push(...recortado);
      console.log(`Memoria (archivo) cargada: ${memoriaChat.length} mensajes.`);
    } else {
      console.log('memoria.json no tiene un array válido, ignorando.');
    }
  } catch (err) {
    console.error('Error al cargar memoria desde archivo, borrando archivo dañado:', err);
    try {
      fs.unlinkSync(PATH_MEMORIA);
      console.log('memoria.json dañado eliminado.');
    } catch (e) {
      console.error('No se pudo borrar memoria.json:', e);
    }
  }
}

// 💾 Guardar memoria en archivo (solo modo local / respaldo)
function guardarMemoriaEnArchivo() {
  try {
    const data = JSON.stringify(memoriaChat, null, 2);
    fs.writeFile(PATH_MEMORIA, data, (err) => {
      if (err) console.error('Error al guardar memoria en archivo:', err);
    });
  } catch (err) {
    console.error('Error al preparar memoria para guardar en archivo:', err);
  }
}

// 📤 Cargar memoria desde la base de datos
function cargarMemoriaDesdeDB() {
  const sql = `
    SELECT texto
    FROM mensajes
    ORDER BY id DESC
    LIMIT $1;
  `;

  dbClient.query(sql, [LIMITE_MEMORIA], (err, res) => {
    if (err) {
      console.error('Error al cargar memoria desde la base de datos:', err);
      // Si falla, intentamos al menos el archivo como respaldo
      cargarMemoriaDesdeArchivo();
      return;
    }

    const filas = res.rows || [];
    // Vienen de más nuevo a más viejo; los metemos al revés para respetar orden
    for (let i = filas.length - 1; i >= 0; i--) {
      memoriaChat.push(filas[i].texto);
    }

    console.log(`Memoria (DB) cargada: ${memoriaChat.length} mensajes.`);
  });
}

// 🧠 Guardar un mensaje nuevo (DB o archivo)
function guardarMensaje(msg) {
  // Siempre guardar en RAM y recortar
  memoriaChat.push(msg);
  while (memoriaChat.length > LIMITE_MEMORIA) {
    memoriaChat.shift();
  }

  if (usaDB && dbClient) {
    const sql = 'INSERT INTO mensajes (texto) VALUES ($1);';
    dbClient.query(sql, [msg], (err) => {
      if (err) {
        console.error('Error al guardar mensaje en la base de datos:', err);
      }
    });
  } else {
    // Respaldo en archivo si no hay DB
    guardarMemoriaEnArchivo();
  }
}

// Guarda mensajes del chat, con filtros + memoria rotativa
function aprender(msg, lower, botLower) {
  if (msg.length < 2) return;

  // No aprender comandos tipo !comando
  if (msg.startsWith('!')) return;

  // No aprender mensajes que mencionen al bot
  if (lower.includes('@' + botLower)) return;

  guardarMensaje(msg);
}

// Devuelve un mensaje random de la memoria
function fraseAprendida() {
  if (memoriaChat.length === 0) return null;
  const idx = Math.floor(Math.random() * memoriaChat.length);
  return memoriaChat[idx];
}

// 🧠 Inicializar memoria (DB o archivo)
initDB();

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

  // Probabilidad de hablar solo (15%)
  const probHablarSolo = 0.15;

  if (Math.random() < probHablarSolo && memoriaChat.length > 0) {
    const frase = fraseAprendida();
    client.say(channel, frase);
  }
});
