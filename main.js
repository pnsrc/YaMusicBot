const { app, BrowserWindow, ipcMain, Menu, Tray, dialog } = require('electron');
const path = require('path');
const url = require('url');
const Store = require('electron-store');
const express = require('express');
const fetch = require('node-fetch');
require('dotenv').config();
const tmi = require('tmi.js');
const fs = require('fs');

// Устанавливаем имя приложения
app.name = 'YaMusicBot by @pnsrc';
app.setName('YaMusicBot by @pnsrc');

// Инициализация хранилища
const store = new Store();

// Глобальные переменные для окон и трея
let mainWindow;
let settingsWindow;
let tray = null;
let isQuitting = false;

// URL API для отправки данных
let apiUrl = store.get('apiUrl') || 'https://your-api-endpoint.com/track-info';
// Для хранения информации о текущем треке
let currentTrackInfo = {};


// Загрузка настроек для Twitch-бота с предустановленными значениями
let twitchSettings = {
  twitchChannel: store.get('twitchChannel') || 'SeRRRg0',
  twitchUsername: store.get('twitchUsername') || 'yamusicbot',
  twitchToken: store.get('twitchToken') || 'oauth:7hxajb9m1ta8fd65wri3hpu33hkw55',
  autoAnnounce: store.get('autoAnnounce') !== undefined ? store.get('autoAnnounce') : true
};

// Сохраняем предустановленные настройки в хранилище, если они не были установлены ранее
if (!store.get('twitchChannel')) store.set('twitchChannel', twitchSettings.twitchChannel);
if (!store.get('twitchUsername')) store.set('twitchUsername', twitchSettings.twitchUsername);
if (!store.get('twitchToken')) store.set('twitchToken', twitchSettings.twitchToken);

// Настройка Twitch-бота
let client = new tmi.Client({
    options: { debug: false }, // Отключаем отладочный вывод
    connection: {
        reconnect: true,
        secure: true
    },
    identity: {
        username: twitchSettings.twitchUsername,
        password: twitchSettings.twitchToken
    },
    channels: [twitchSettings.twitchChannel]
});

// Подключение Twitch-бота
function startTwitchBot() {
    try {
        // Проверяем настройки окружения
        if (!twitchSettings.twitchUsername || !twitchSettings.twitchToken || !twitchSettings.twitchChannel) {
            console.error('Error: Twitch bot environment variables not set');
            return;
        }
        
        console.log(`Connecting to Twitch as ${twitchSettings.twitchUsername} in channel ${twitchSettings.twitchChannel}`);

        // Подключаемся к Twitch
        client.connect()
            .then(() => {
                console.log('Twitch connection successful');
                
                // Отправляем приветственное сообщение с упоминанием бренда
                setTimeout(() => {
                    client.say(twitchSettings.twitchChannel, 'Hello everyone! YaMusicBot by @pnsrc is launched. Use !track to get information about the current track 🎵');
                }, 2000);
            })
            .catch(err => console.error('Twitch connection error:', err));
        
        // Массив ключевых фраз для отслеживания (оставляем русские фразы для пользователей)
        const trackKeywords = ['какой трек', 'что играет', 'что за трек', 'что за музыка', '!track', '!трек'];
        
        // Обработка сообщений
        client.on('message', (channel, tags, message, self) => {
            if (self) return; // Игнорируем свои сообщения
            
            const lowerMsg = message.toLowerCase();
            
            // Проверяем наличие ключевых слов
            const hasTrackKeyword = trackKeywords.some(keyword => lowerMsg.includes(keyword));
            
            if (hasTrackKeyword) {
                console.log(`Track request from ${tags.username}`);

                // Получаем актуальные данные о треке из API
                fetch(`http://localhost:${PORT}/api/currenttrack`)
                    .then(response => response.json())
                    .then(data => {
                        if (data && data.track && data.artist) {
                            const response = `@${tags.username}, now playing: ${data.artist} - ${data.track} 🎵`;
                            client.say(channel, response);
                        } else {
                            client.say(channel, `@${tags.username}, track information unavailable 😔`);
                        }
                    })
                    .catch(err => {
                        console.error('Error fetching track data:', err);
                        client.say(channel, `@${tags.username}, error getting track information 😔`);
                    });
            }
        });
    } catch (error) {
        console.error('Error launching Twitch bot:', error);
    }
}

// Настройка Express сервера
const server = express();
const PORT = 9898;

// Middleware для CORS и JSON
server.use(express.json());
server.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  next();
});

// Маршрут для получения информации о текущем треке
server.get('/api/currenttrack', (req, res) => {
  res.json(currentTrackInfo);
});

// Запуск сервера
function startServer() {
  httpServer = server.listen(PORT, () => {
    console.log(`Server started on http://localhost:${PORT}`);
  });
}

// В начале файла добавим константу с путем к иконке для удобства
const iconPath = path.join(__dirname, 'icons/icon.png');

// Проверим существование файла иконки при запуске
if (!fs.existsSync(iconPath)) {
  console.error(`Error: Icon file not found at path: ${iconPath}`);
}

// Создание основного окна с упрощенным скриптом извлечения информации о треке
function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 800,
    title: 'YaMusicBot by @pnsrc',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    icon: iconPath, // Используем константу
    // Для macOS добавляем дополнительные настройки
    backgroundColor: '#ffffff'
  });

  mainWindow.setTitle('YaMusicBot by @pnsrc');
  mainWindow.loadURL('https://music.yandex.ru');

  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow.hide();
      return false;
    }
  });

  // Используем более простой и надежный скрипт для извлечения информации о треке
  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow.webContents.executeJavaScript(`
      function getCurrentTrackInfo() {
        try {
          // Используем простой подход сначала
          const trackElement = document.querySelector('.track__name');
          const artistElement = document.querySelector('.track__artists');
          
          if (trackElement && artistElement) {
            const trackName = trackElement.textContent.trim();
            const artistName = artistElement.textContent.trim();
            
            // Проверка на дублирование имени артиста в названии трека
            const cleanTrackName = trackName.replace(artistName, '').trim();
            const finalTrackName = cleanTrackName || trackName; // Используем оригинал, если после очистки ничего не осталось
            
            // Получаем URL обложки
            let coverUrl = "";
            const coverElement = document.querySelector('.track-cover');
            if (coverElement) {
              const bgImg = window.getComputedStyle(coverElement).backgroundImage;
              if (bgImg && bgImg !== "none") {
                coverUrl = bgImg.slice(4, -1).replace(/"/g, "");
              }
            }
            
            return {
              track: finalTrackName,
              artist: artistName,
              cover: coverUrl,
              url: window.location.href,
              timestamp: new Date().toISOString()
            };
          }
          
          // Если основной метод не сработал, используем запасной
          const title = document.title;
          const match = title.match(/(.*?)\\s*[-–—]\\s*(.*)\\s*[-–—]\\s*Яндекс\\.Музыка/i);
          if (match && match.length > 2) {
            return {
              artist: match[1].trim(),
              track: match[2].trim(),
              url: window.location.href,
              timestamp: new Date().toISOString()
            };
          }
          
          return { error: "Не удалось найти информацию о треке" };
        } catch (error) {
          console.error("Ошибка при получении информации о треке:", error);
          return { error: "Произошла ошибка при получении информации о треке" };
        }
      }

      function setupTrackChangeObserver() {
        const targetNode = document.querySelector('.player-controls');
        
        if (!targetNode) {
          console.error("Не удалось найти элемент плеера");
          return;
        }
      
        const config = { attributes: true, childList: true, subtree: true };
        
        const callback = function(mutationsList, observer) {
          for (const mutation of mutationsList) {
            if (mutation.type === 'childList' || mutation.type === 'attributes') {
              const trackInfo = getCurrentTrackInfo();
              window.electronAPI.sendTrackInfo(trackInfo);
            }
          }
        };
        
        const observer = new MutationObserver(callback);
        observer.observe(targetNode, config);
        
        // Получаем начальную информацию о треке
        const initialTrackInfo = getCurrentTrackInfo();
        window.electronAPI.sendTrackInfo(initialTrackInfo);
      }

      // Запускаем наблюдатель после полной загрузки
      if (document.readyState === 'complete') {
        setupTrackChangeObserver();
      } else {
        window.addEventListener('load', setupTrackChangeObserver);
      }
    `);
  });
}

// Создание иконки в трее
function createTray() {
  try {
    tray = new Tray(iconPath); // Используем константу
    
    const contextMenu = Menu.buildFromTemplate([
      { 
        label: 'Показать YaMusicBot', 
        click: () => mainWindow.show() 
      },
      { 
        label: 'Настройки', 
        click: () => createSettingsWindow() 
      },
      { type: 'separator' },
      { 
        label: 'Выход', 
        click: () => {
          isQuitting = true;
          app.quit();
        } 
      }
    ]);
    
    tray.setToolTip('YaMusicBot by @pnsrc');
    tray.setContextMenu(contextMenu);
  
    tray.on('click', () => {
      mainWindow.isVisible() ? mainWindow.hide() : mainWindow.show();
    });
  } catch (error) {
    console.error('Error creating tray icon:', error);
  }
}

// Создание окна настроек с той же иконкой
function createSettingsWindow() {
  if (settingsWindow) {
    settingsWindow.focus();
    return;
  }

  settingsWindow = new BrowserWindow({
    width: 550,
    height: 550,
    parent: mainWindow,
    modal: true,
    show: false,
    title: 'Настройки YaMusicBot',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    icon: iconPath // Добавляем иконку и для этого окна
  });

  settingsWindow.loadURL(url.format({
    pathname: path.join(__dirname, 'settings.html'),
    protocol: 'file:',
    slashes: true
  }));

  settingsWindow.once('ready-to-show', () => {
    settingsWindow.show();
  });

  settingsWindow.on('closed', () => {
    settingsWindow = null;
  });
}

// Обработка межпроцессорных сообщений - добавляем автоматическое оповещение
let lastTrackInfo = {}; // Для отслеживания изменений трека

ipcMain.on('track-info', (event, trackInfo) => {
  
  // Сохраняем информацию о текущем треке
  currentTrackInfo = trackInfo;
  
  // Проверяем, изменился ли трек и стоит ли отправить уведомление
  if (trackInfo && trackInfo.track && trackInfo.artist && 
      (lastTrackInfo.track !== trackInfo.track || lastTrackInfo.artist !== trackInfo.artist)) {
    
    // Отправляем уведомление о новом треке в чат Twitch
    if (client && client.readyState() === 'OPEN') {
      const message = `Now playing: ${trackInfo.artist} - ${trackInfo.track} 🎵`;
      client.say(twitchSettings.twitchChannel, message)
        .then(() => console.log('New track notification sent'))
        .catch(err => console.error('Error sending track notification:', err));
    }
    
    // Обновляем информацию о последнем треке
    lastTrackInfo = {
      track: trackInfo.track,
      artist: trackInfo.artist
    };
  }
});

// Модифицируйте функцию ipcMain.handle('get-settings')
ipcMain.handle('get-settings', async () => {
  return {
    apiUrl: apiUrl,
    twitchChannel: twitchSettings.twitchChannel || '',
    twitchUsername: twitchSettings.twitchUsername || '',
    twitchToken: twitchSettings.twitchToken || '',
    autoAnnounce: twitchSettings.autoAnnounce,
    twitchConnected: client && client.readyState() === 'OPEN'
  };
});

// Модифицируйте функцию ipcMain.on('save-settings')
ipcMain.on('save-settings', (event, settings) => {
  console.log('Saving settings:', settings);

  if (settings.apiUrl !== undefined) {
    apiUrl = settings.apiUrl;
    store.set('apiUrl', apiUrl);
  }
  
  // Сохраняем настройки Twitch
  if (settings.twitchChannel !== undefined) {
    twitchSettings.twitchChannel = settings.twitchChannel;
    store.set('twitchChannel', settings.twitchChannel);
  }
  
  if (settings.twitchUsername !== undefined) {
    twitchSettings.twitchUsername = settings.twitchUsername;
    store.set('twitchUsername', settings.twitchUsername);
  }
  
  if (settings.twitchToken !== undefined) {
    twitchSettings.twitchToken = settings.twitchToken;
    store.set('twitchToken', settings.twitchToken);
  }
  
  if (settings.autoAnnounce !== undefined) {
    twitchSettings.autoAnnounce = settings.autoAnnounce;
    store.set('autoAnnounce', settings.autoAnnounce);
  }
  
  // Перезапускаем Twitch-бота с новыми настройками
  if (client) {
    client.disconnect().then(() => {
      updateTwitchClient();
      startTwitchBot();
    });
  }
  
  if (settingsWindow) {
    settingsWindow.close();
  }
});



// Функция обновления клиента Twitch с новыми настройками
function updateTwitchClient() {
  client = new tmi.Client({
    options: { debug: false },
    connection: {
      reconnect: true,
      secure: true
    },
    identity: {
      username: twitchSettings.twitchUsername,
      password: twitchSettings.twitchToken
    },
    channels: [twitchSettings.twitchChannel]
  });
}

// Функция для отправки данных в API
async function sendTrackInfoToAPI(trackData) {
  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(trackData)
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error: ${response.status}`);
    }
    
    const responseData = await response.json();

  } catch (error) {
    console.error("Error sending data to API:", error);
  }
}

// Добавьте обработчик для проверки соединения с Twitch
ipcMain.handle('test-twitch-connection', async (event, settings) => {
  try {
    // Создаем временного клиента для тестирования
    const testClient = new tmi.Client({
      options: { debug: false },
      connection: {
        reconnect: false,
        secure: true
      },
      identity: {
        username: settings.twitchUsername,
        password: settings.twitchToken
      },
      channels: [settings.twitchChannel]
    });
    
    // Пробуем подключиться
    await testClient.connect();
    // Если подключение успешно, отключаемся
    await testClient.disconnect();
    
    return { success: true };
  } catch (error) {
    console.error('Test connection failed:', error);
    return { 
      success: false, 
      error: error.message || 'Unknown error' 
    };
  }
});

// Инициализация приложения
app.whenReady().then(() => {
  // Настройка иконки для macOS
  if (process.platform === 'darwin') {
    app.dock.setIcon(iconPath);
  }
  
  startServer();
  setTimeout(() => {
    startTwitchBot();
  }, 1000);
  createMainWindow();
  createTray();
});

// Обработка закрытия
app.on('before-quit', () => {
  isQuitting = true;
  if (client) {
    client.disconnect();
  }
});