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

// Улучшенная поддержка путей к иконкам на разных ОС
const iconPath = (() => {
  // Выбираем подходящий формат иконки в зависимости от платформы
  if (process.platform === 'win32') {
    const icoPath = path.join(__dirname, 'icons', 'icon.ico');
    if (fs.existsSync(icoPath)) return icoPath;
  }
  return path.join(__dirname, 'icons', 'icon.png');
})();

// Проверяем наличие иконки
if (!fs.existsSync(iconPath)) {
  console.error(`Error: Icon file not found at path: ${iconPath}`);
  // Создаем директорию icons если ее нет
  if (!fs.existsSync(path.join(__dirname, 'icons'))) {
    fs.mkdirSync(path.join(__dirname, 'icons'));
  }
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
    icon: iconPath,
    backgroundColor: '#ffffff'
  });

  mainWindow.setTitle('YaMusicBot by @pnsrc');
  mainWindow.loadURL('https://music.yandex.ru');

  // Правильный обработчик события close
  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow.hide();
      return false;
    }
  });

  // Инжектируем скрипт для отслеживания трека после загрузки страницы
  mainWindow.webContents.on('did-finish-load', () => {
    // Добавляем паузу для полной загрузки страницы (помогает на Windows)
    setTimeout(() => {
      mainWindow.webContents.executeJavaScript(`
        // Улучшенная функция для получения информации о текущем треке
        function getCurrentTrackInfo() {
          try {
            console.log("Начинаем получение информации о треке");
            
            // Метод 1: Универсальный подход для всех платформ
            const trackSelectors = [
              '.track__name', 
              '.d-track__name', 
              '.track-type-player .track__name',
              '.player-controls__track-name',
              '.player__track-name'
            ];
            
            const artistSelectors = [
              '.track__artists', 
              '.d-track__artists', 
              '.track-type-player .track__artists',
              '.player-controls__track-artists',
              '.player__track-artists'
            ];
            
            // Находим элемент трека перебором всех возможных селекторов
            let trackElement = null;
            for(const selector of trackSelectors) {
              trackElement = document.querySelector(selector);
              if(trackElement) break;
            }
            
            // Находим элемент исполнителя перебором всех возможных селекторов
            let artistElement = null;
            for(const selector of artistSelectors) {
              artistElement = document.querySelector(selector);
              if(artistElement) break;
            }
            
            // Если нашли оба элемента, извлекаем текст
            if (trackElement && artistElement) {
              const trackName = trackElement.textContent.trim();
              const artistName = artistElement.textContent.trim();
              
              console.log("Найдены элементы трека:", trackName, artistName);
              
              // Очищаем имя трека от имени исполнителя, если оно там присутствует
              const cleanTrackName = trackName.replace(artistName, '').trim().replace(/^[-–\s]+/, '').replace(/[-–\s]+$/, '');
              const finalTrackName = cleanTrackName || trackName;
              
              // Получаем URL обложки
              let coverUrl = "";
              const coverSelectors = ['.track-cover', '.player-controls__track-cover', '.d-track-cover'];
              for(const selector of coverSelectors) {
                const coverElement = document.querySelector(selector);
                if (coverElement) {
                  const bgImg = window.getComputedStyle(coverElement).backgroundImage;
                  if (bgImg && bgImg !== "none") {
                    coverUrl = bgImg.slice(4, -1).replace(/["']/g, "");
                    if (coverUrl && !coverUrl.startsWith('http')) {
                      coverUrl = 'https://' + coverUrl.replace(/^\/\//, '');
                    }
                    break;
                  }
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
            
            // Метод 2: Извлечение из заголовка страницы
            const title = document.title;
            const patterns = [
              /(.*?)\\s*[-–—]\\s*(.*)\\s*[-–—]\\s*Яндекс[\\s\\.]*Музыка/i,
              /(.*?)\\s*[-–—]\\s*(.*)\\s*[-–—]/i
            ];
            
            for (const pattern of patterns) {
              const match = title.match(pattern);
              if (match && match.length > 2) {
                console.log("Извлечено из заголовка:", match[1], match[2]);
                return {
                  artist: match[1].trim(),
                  track: match[2].trim(),
                  url: window.location.href,
                  timestamp: new Date().toISOString()
                };
              }
            }
            
            // Метод 3: Поиск элементов плеера напрямую
            const playerElement = document.querySelector('.player, .player-controls, .d-player');
            if (playerElement) {
              const fullText = playerElement.textContent.trim();
              const separators = [' – ', ' - ', ' — '];
              
              for (const separator of separators) {
                const index = fullText.indexOf(separator);
                if (index !== -1) {
                  const artistName = fullText.substring(0, index).trim();
                  const trackName = fullText.substring(index + separator.length).trim();
                  
                  console.log("Извлечено из текста плеера:", artistName, trackName);
                  
                  return {
                    artist: artistName,
                    track: trackName,
                    url: window.location.href,
                    timestamp: new Date().toISOString()
                  };
                }
              }
            }
            
            return { error: "Не удалось найти информацию о треке" };
          } catch (error) {
            console.error("Ошибка при получении информации о треке:", error);
            return { error: "Произошла ошибка при получении информации о треке: " + error.message };
          }
        }

        function setupTrackChangeObserver() {
          const targetNodes = [
            document.querySelector('.player-controls'),
            document.querySelector('.player'),
            document.querySelector('.d-player')
          ].filter(Boolean);
          
          if (targetNodes.length === 0) {
            console.error("Не удалось найти элемент плеера");
            
            // Резервный план: наблюдаем за изменениями заголовка страницы
            let lastTitle = document.title;
            setInterval(() => {
              if (document.title !== lastTitle) {
                lastTitle = document.title;
                const trackInfo = getCurrentTrackInfo();
                window.electronAPI.sendTrackInfo(trackInfo);
              }
            }, 1000);
            
            return;
          }
          
          const config = { attributes: true, childList: true, subtree: true };
          
          const callback = function(mutationsList, observer) {
            const trackInfo = getCurrentTrackInfo();
            window.electronAPI.sendTrackInfo(trackInfo);
          };
          
          const observer = new MutationObserver(callback);
          targetNodes.forEach(node => observer.observe(node, config));
          
          // Получаем начальную информацию о треке
          const initialTrackInfo = getCurrentTrackInfo();
          window.electronAPI.sendTrackInfo(initialTrackInfo);
          
          // Периодическая проверка на случай, если MutationObserver не сработает
          setInterval(() => {
            const trackInfo = getCurrentTrackInfo();
            window.electronAPI.sendTrackInfo(trackInfo);
          }, 5000);
        }

        // Запускаем наблюдатель после полной загрузки
        if (document.readyState === 'complete') {
          setupTrackChangeObserver();
        } else {
          window.addEventListener('load', setupTrackChangeObserver);
        }
      `);
    }, 2000); // Задержка 2 секунды для полной загрузки страницы
  });
}

// Создание иконки в трее с расширенным меню
function createTray() {
  try {
    tray = new Tray(iconPath);
    
    // Расширенное меню с настройками Twitch и индикацией статуса
    const contextMenu = Menu.buildFromTemplate([
      { 
        label: 'YaMusicBot by @pnsrc',
        enabled: false,
        icon: iconPath // Некоторые системы могут отображать эту иконку
      },
      { type: 'separator' },
      { 
        label: 'Показать плеер', 
        click: () => mainWindow.show()
      },
      { 
        label: 'Настройки', 
        click: () => createSettingsWindow(),
        submenu: [
          { 
            label: `Twitch: ${twitchSettings.twitchChannel}`,
            click: () => createSettingsWindow()
          },
          {
            label: `Автооповещения: ${twitchSettings.autoAnnounce ? 'Вкл' : 'Выкл'}`,
            click: () => {
              twitchSettings.autoAnnounce = !twitchSettings.autoAnnounce;
              store.set('autoAnnounce', twitchSettings.autoAnnounce);
              createTray(); // Обновляем меню
            }
          }
        ]
      },
      { type: 'separator' },
      {
        label: `Twitch статус: ${client && client.readyState() === 'OPEN' ? '🟢 Онлайн' : '🔴 Офлайн'}`,
        click: () => {
          if (client && client.readyState() !== 'OPEN') {
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: 'Статус Twitch',
              message: 'Бот не подключен. Хотите подключиться?',
              buttons: ['Да', 'Нет'],
              defaultId: 0
            }).then(result => {
              if (result.response === 0) {
                updateTwitchClient();
                startTwitchBot();
              }
            });
          }
        }
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
    
    // Аварийный вариант для Windows
    if (process.platform === 'win32') {
      try {
        // Пробуем создать трей без иконки (в Windows это иногда работает)
        tray = new Tray(path.join(__dirname, 'icons', 'icon.png'));
        const contextMenu = Menu.buildFromTemplate([
          { label: 'Show', click: () => mainWindow.show() },
          { label: 'Settings', click: () => createSettingsWindow() },
          { type: 'separator' },
          { label: 'Exit', click: () => { isQuitting = true; app.quit(); } }
        ]);
        tray.setContextMenu(contextMenu);
      } catch (err) {
        console.error('Failed to create tray even with fallback:', err);
      }
    }
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

// Модифицируем обработчик событий track-info чтобы учитывать настройку autoAnnounce
ipcMain.on('track-info', (event, trackInfo) => {
  console.log('Track info received:', trackInfo);
  
  // Сохраняем информацию о текущем треке
  currentTrackInfo = trackInfo;
  
  // Проверяем, изменился ли трек и стоит ли отправить уведомление
  if (twitchSettings.autoAnnounce && 
      trackInfo && trackInfo.track && trackInfo.artist && 
      (lastTrackInfo.track !== trackInfo.track || lastTrackInfo.artist !== trackInfo.artist)) {
    
    // Отправляем уведомление о новом треке в чат Twitch только если включен автоанонс
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
      updateTrayMenu(); // Обновляем меню трея
    });
  }
  
  if (settingsWindow) {
    settingsWindow.close();
  }
});

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
    console.log("API response:", responseData);
    
  } catch (error) {
    console.error("Error sending data to API:", error);
  }
}

// Добавим функцию для обновления меню трея
function updateTrayMenu() {
  if (!tray) return;
  
  const contextMenu = Menu.buildFromTemplate([
    { 
      label: 'YaMusicBot by @pnsrc',
      enabled: false
    },
    { type: 'separator' },
    { 
      label: 'Показать плеер', 
      click: () => mainWindow.show()
    },
    { 
      label: 'Настройки', 
      click: () => createSettingsWindow()
    },
    { type: 'separator' },
    {
      label: `Twitch: ${twitchSettings.twitchChannel}`,
      click: () => createSettingsWindow()
    },
    {
      label: `Автооповещения: ${twitchSettings.autoAnnounce ? 'Вкл' : 'Выкл'}`,
      click: () => {
        twitchSettings.autoAnnounce = !twitchSettings.autoAnnounce;
        store.set('autoAnnounce', twitchSettings.autoAnnounce);
        updateTrayMenu();
      }
    },
    { type: 'separator' },
    {
      label: `Twitch статус: ${client && client.readyState() === 'OPEN' ? '🟢 Онлайн' : '🔴 Офлайн'}`,
      click: () => {
        if (client && client.readyState() !== 'OPEN') {
          updateTwitchClient();
          startTwitchBot();
        }
      }
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
  
  tray.setContextMenu(contextMenu);
}

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