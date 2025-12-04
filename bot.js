const fs = require('fs');
const tmi = require('tmi.js');
const { Client } = require('pg');

// ⚙️ Variables de entorno (Railway)
const BOT_USERNAME = process.env.BOT_USERNAME || 'mich_botsito';
const OAUTH_TOKEN  = process.env.OAUTH_TOKEN  || 'oauth:TOKEN_AQUI';
const CHANNEL_NAME = process.env.CHANNEL_NAME || 'mich_patitas';
const DATABASE_URL = process.env.DATABASE_URL || null;

// --- Configuración de filtros ---
const LIMITE_MEMORIA = 20000;        // Máximo de mensajes en memoria
const MAX_MSG_LENGTH = 160;          // Máxima longitud de mensaje que aprende/usa
const PATH_MEMORIA   = './memoria.json';

// --- Memoria del bot en RAM ---
const memoriaChat = [];

// Contador de mensajes de otros usuarios
let contadorMensajes = 0;

// Historial de últimos mensajes que el bot ha dicho (anti-repetición)
let ultimosMensajesBot = []; // últimos 5 mensajes enviados

// Detectar si un mensaje contiene un enlace
function contieneLink(texto) {
  const regex = /(https?:\/\/|www\.)/i;
  return regex.test(texto);
}

// --- Base de datos PostgreSQL ---
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

// 🧠 Lógica de aprendizaje con tus reglas
function aprender(msg, lower, botLower) {
  // ❌ Muy cortos
  if (msg.length < 2) return;

  // ❌ Muy largos
  if (msg.length > MAX_MSG_LENGTH) return;

  // ❌ No aprender comandos tipo !comando
  if (msg.startsWith('!')) return;

  // ❌ No aprender mensajes que mencionen al bot
  if (lower.includes('@' + botLower)) return;

  // ❌ No aprender mensajes con links
  if (contieneLink(msg)) return;

  guardarMensaje(msg);
}

// Devuelve un mensaje random de la memoria con filtros y anti-repetición
function fraseAprendida() {
  if (memoriaChat.length === 0) return null;

  // Filtrar mensajes que:
  // - NO estén entre los últimos 5 ya dichos
  // - NO tengan links
  // - NO sean demasiado largos
  const disponibles = memoriaChat.filter(msg =>
    !ultimosMensajesBot.includes(msg) &&
    !contieneLink(msg) &&
    msg.length <= MAX_MSG_LENGTH
  );

  // Si no hay suficientes, usar toda la memoria, igual filtrando links y longitud
  const lista = disponibles.length > 0
    ? disponibles
    : memoriaChat.filter(msg =>
        !contieneLink(msg) &&
        msg.length <= MAX_MSG_LENGTH
      );

  if (lista.length === 0) return null;

  const idx = Math.floor(Math.random() * lista.length);
  const frase = lista[idx];

  // Guardar la frase en el historial anti-repetición
  ultimosMensajesBot.push(frase);
  if (ultimosMensajesBot.length > 5) {
    ultimosMensajesBot.shift(); // mantener tamaño máximo 5
  }

  return frase;
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
  const botsIgnorados = ['nightbot', 'streamelements', 'tangiabot'];
  if (botsIgnorados.includes(username)) return;

  const msg = message.trim();
  const lower = msg.toLowerCase();
  const botLower = BOT_USERNAME.toLowerCase();

  // Contar mensajes de usuarios (no bots, no el propio bot)
  contadorMensajes++;

  // Aprender del mensaje con filtros
  aprender(msg, lower, botLower);

  // Si mencionan al bot → responder con algo aprendido
  if (lower.includes('@' + botLower)) {
    const frase = fraseAprendida();
    if (frase) client.say(channel, frase);
    return;
  }

  // 📌 Cada 15 mensajes → responder con algo aprendido
  if (contadorMensajes >= 15) {
    const frase = fraseAprendida();
    if (frase) {
      client.say(channel, frase);
    }
    contadorMensajes = 0; // reiniciar contador
  }
});
